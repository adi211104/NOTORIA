// brand-shield/src/api/routes/publico.routes.js
// Rutas SIN autenticación para el widget "analiza tu negocio" del landing.
// Cada consulta gasta cuota de Google Places, así que el diseño es defensivo:
// - rate-limit propio mucho más estricto que el global (por IP real, ver trust proxy)
// - máximo 4 verificaciones de país por búsqueda y 3 resultados devueltos
// - el análisis se cachea en memoria 6h por placeId: los reintentos y los
//   curiosos que analizan el mismo negocio famoso no pagan una segunda llamada
// - el teaser NO devuelve las reseñas completas: una sola muestra recortada,
//   lo demás vive detrás del registro (es el gancho de conversión)

const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { analizarResena } = require('../../nlp/detector');
const { informeRating } = require('../../lib/rating');

const router = express.Router();

const publicoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas. Espera unos minutos e inténtalo de nuevo.' },
});

// 🔴 El limitador estricto se aplica por RUTA y ya no con `router.use`.
//
// El motivo es `/ficha`, que alimenta las páginas /para/<ficha>: esas se
// renderizan en el servidor de Vercel para que WhatsApp pueda mostrar la vista
// previa del enlace, así que TODAS las visitas llegan aquí desde la misma IP —
// la de Vercel, no la del visitante. Con el cupo de 15/15min, el enlace de venta
// se caería para todo el mundo en cuanto se mandara a un puñado de prospectos.
//
// `/ficha` lleva su propio limitador, más alto, y se apoya en el caché de 6h por
// placeId: mil visitas al mismo enlace siguen siendo UNA consulta a Google.
const fichaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas. Espera unos minutos e inténtalo de nuevo.' },
});

const PAIS = { codigo: 'pe', nombre: 'Perú' };

// Mismo mecanismo que utils.routes.js: "region" solo sesga el ranking de Google,
// el país real se confirma con address_components de Place Details.
const paisDeResultado = async (placeId) => {
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id: placeId, fields: 'address_component', key: process.env.GOOGLE_PLACES_API_KEY },
    });
    const pais = data.result?.address_components?.find((c) => c.types.includes('country'));
    return pais?.short_name || null;
  } catch { return null; }
};

// ── GET /api/publico/buscar-negocio?q= ────────────────────
router.get('/buscar-negocio', publicoLimiter, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 3) return res.status(400).json({ error: 'Escribe al menos 3 caracteres' });
    if (q.length > 80) return res.status(400).json({ error: 'Búsqueda demasiado larga' });

    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: {
        query: `${q} ${PAIS.nombre}`,
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
        region: PAIS.codigo,
      },
    });
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: 'Error consultando Google Places' });
    }

    const regionUpper = PAIS.codigo.toUpperCase();
    const candidatos = (data.results || []).slice(0, 4);
    const verificados = await Promise.all(
      candidatos.map(async (p) => ({ p, pais: await paisDeResultado(p.place_id) }))
    );

    const resultados = verificados
      .filter((v) => v.pais === regionUpper)
      .slice(0, 3)
      .map(({ p }) => ({
        placeId: p.place_id,
        nombre: p.name,
        direccion: p.formatted_address,
        rating: p.rating,
        totalResenas: p.user_ratings_total,
      }));
    res.json(resultados);
  } catch (error) { next(error); }
});

// ── GET /api/publico/analizar?placeId= ────────────────────
// Caché en memoria: el análisis de un negocio no cambia en horas y cada
// entrada pesa <1 KB. Se poda al consultar para que no crezca sin techo.
const cacheAnalisis = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const MOTIVOS_LEGIBLES = {
  cuenta_nueva: 'cuenta con casi ninguna reseña previa',
  sin_texto: '1 estrella sin ningún texto (patrón de bot)',
  palabra_critica: 'acusación grave que daña el rating',
};

router.get('/analizar', publicoLimiter, async (req, res, next) => {
  try {
    const placeId = (req.query.placeId || '').trim();
    if (!placeId || placeId.length > 300) return res.status(400).json({ error: 'placeId inválido' });

    const cacheado = cacheAnalisis.get(placeId);
    if (cacheado && Date.now() - cacheado.ts < CACHE_MS) return res.json(cacheado.data);

    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        // `business_status` va en el grupo Basic Data, que esta llamada ya paga
        // por pedir `reviews`: añadirlo no cambia la factura.
        fields: 'name,rating,user_ratings_total,reviews,business_status',
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
        reviews_sort: 'newest',
      },
    });
    if (data.status !== 'OK') return res.status(404).json({ error: 'No encontramos ese negocio' });

    const r = data.result;
    const resenas = (r.reviews || []).map((rev) => ({
      rating: rev.rating,
      texto: rev.text || '',
      autorNombre: rev.author_name || 'Anónimo',
      autorResenasTotal: null,
      fechaResena: new Date(rev.time * 1000),
    }));

    const analizadas = resenas.map((resena) => ({ resena, ...analizarResena(resena) }));
    const sospechosas = analizadas.filter((a) => a.esSospechosa);
    const negativas = resenas.filter((resena) => resena.rating <= 2);

    // Una sola muestra recortada — el detalle completo requiere cuenta
    const muestra = sospechosas[0] ? {
      autorNombre: sospechosas[0].resena.autorNombre,
      rating: sospechosas[0].resena.rating,
      extracto: sospechosas[0].resena.texto.slice(0, 90) + (sospechosas[0].resena.texto.length > 90 ? '…' : ''),
      motivo: MOTIVOS_LEGIBLES[sospechosas[0].motivoSospecha.split(',')[0].split(':')[0]] || 'patrón sospechoso',
    } : null;

    const resultado = {
      nombre: r.name,
      rating: r.rating || 0,
      totalResenas: r.user_ratings_total || 0,
      resenasAnalizadas: resenas.length,
      sospechosas: sospechosas.length,
      negativasRecientes: negativas.length,
      muestra,
      // El simulacro. Es lo único de esta respuesta que dice algo cuando NO hay
      // nada sospechoso, que es la mayoría de las veces: antes, el visitante
      // recibía «no detectamos patrones de ataque» y se iba sin motivo para
      // registrarse. Ahora se lleva sus propios números —cuántas reseñas de 1★
      // lo sacan del filtro de 4.5, y cuántas de 5★ le faltan para subir— que es
      // la pregunta que traía. Es aritmética sobre datos que ya pedimos: no
      // cuesta ni una llamada más.
      simulador: informeRating({ rating: r.rating, totalResenas: r.user_ratings_total }),
      // La ficha marcada como cerrada es la peor noticia posible y se ve gratis
      // en el mismo Place Details. Si aparece, va delante de todo lo demás.
      estadoFicha: r.business_status && r.business_status !== 'OPERATIONAL' ? r.business_status : null,
    };

    if (cacheAnalisis.size >= CACHE_MAX) {
      const masVieja = cacheAnalisis.keys().next().value;
      cacheAnalisis.delete(masVieja);
    }
    cacheAnalisis.set(placeId, { data: resultado, ts: Date.now() });
    res.json(resultado);
  } catch (error) { next(error); }
});

// ── GET /api/publico/ficha?placeId= ───────────────────────
//
// Alimenta las páginas `/para/<ficha>`: el enlace de venta personalizado que se
// manda por WhatsApp a un prospecto. Devuelve lo mismo que `/analizar` más la
// comparación con los vecinos, que es la parte que de verdad convence — un dueño
// entiende «el de la esquina está en 4.6 y tú en 4.1» mucho antes que cualquier
// argumento sobre monitoreo.
//
// Es información pública de Google Maps: la misma que ve cualquiera que busque
// ese negocio. Aun así se trata como material dirigido a una persona y no como
// una publicación sobre un tercero:
//   · la página va con `noindex` y está en Disallow del robots.txt
//   · hay lista de bloqueo por si un negocio pide que se retire (PARA_BLOQUEADOS)
//   · la página lleva visible cómo pedir el retiro
//
// Cuesta hasta 3 consultas a Places (detalle + geometría + vecinos), así que el
// caché de 6h no es un lujo: mil visitas al mismo enlace siguen siendo una.
const cacheFicha = new Map();

// Lista de bloqueo, separada por comas en la variable de entorno. Se lee en cada
// petición a propósito: así retirar una ficha es cambiar una variable en Railway,
// sin desplegar nada. Es la diferencia entre atender la petición de alguien el
// mismo día o la semana siguiente.
// Qué tipo pedirle a Nearby Search para traer vecinos COMPARABLES.
//
// 🔴 No vale con «el primer tipo que no sea genérico». Google devuelve los tipos
// en orden alfabético, así que para un restaurante llegan
// `["establishment","food","point_of_interest","restaurant"]` y ese criterio
// elegía **`food`** — un cajón tan amplio que la comparación de Central
// Restaurante salió contra cuatro hoteles de Barranco. Un dueño que ve eso cierra
// la página, y con razón.
//
// Por eso hay lista blanca y va por prioridad: se busca el tipo más específico
// que Notoria sabe comparar. `establishment` queda solo como último recurso.
const TIPOS_COMPARABLES = [
  'restaurant', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery',
  'lodging', 'spa', 'beauty_salon', 'hair_care', 'gym',
  'dentist', 'doctor', 'hospital', 'veterinary_care', 'pharmacy',
  'car_repair', 'car_wash', 'real_estate_agency', 'clothing_store',
  'supermarket', 'convenience_store', 'store',
];

const tipoParaVecinos = (tipos) =>
  TIPOS_COMPARABLES.find((t) => (tipos || []).includes(t)) || 'establishment';

const estaBloqueada = (placeId) =>
  (process.env.PARA_BLOQUEADOS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(placeId);

router.get('/ficha', fichaLimiter, async (req, res, next) => {
  try {
    const placeId = (req.query.placeId || '').trim();
    if (!placeId || placeId.length > 300) return res.status(400).json({ error: 'placeId inválido' });
    if (estaBloqueada(placeId)) return res.status(410).json({ error: 'Esta página ya no está disponible.', codigo: 'RETIRADA' });

    const cacheado = cacheFicha.get(placeId);
    if (cacheado && Date.now() - cacheado.ts < CACHE_MS) return res.json(cacheado.data);

    // 1. Detalle del negocio. `type` se pide para poder buscar vecinos del mismo
    //    rubro: comparar un restaurante con la farmacia de al lado no dice nada.
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'name,rating,user_ratings_total,reviews,business_status,formatted_address,geometry,type',
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
        reviews_sort: 'newest',
      },
    });
    if (data.status !== 'OK') return res.status(404).json({ error: 'No encontramos ese negocio' });
    const r = data.result;

    const resenas = (r.reviews || []).map((rev) => ({
      rating: rev.rating,
      texto: rev.text || '',
      autorNombre: rev.author_name || 'Anónimo',
      autorResenasTotal: null,
      fechaResena: new Date(rev.time * 1000),
    }));
    const analizadas = resenas.map((resena) => ({ resena, ...analizarResena(resena) }));
    const sospechosas = analizadas.filter((a) => a.esSospechosa);

    const muestra = sospechosas[0] ? {
      autorNombre: sospechosas[0].resena.autorNombre,
      rating: sospechosas[0].resena.rating,
      extracto: sospechosas[0].resena.texto.slice(0, 140) + (sospechosas[0].resena.texto.length > 140 ? '…' : ''),
      motivo: MOTIVOS_LEGIBLES[sospechosas[0].motivoSospecha.split(',')[0].split(':')[0]] || 'patrón sospechoso',
    } : null;

    // La reseña negativa más antigua que Google sigue mostrando. Es el gancho del
    // «espejo» en versión pública: casi siempre hay una de hace meses, sin
    // responder, encabezando lo que ve un cliente nuevo.
    const negativas = resenas.filter((x) => x.rating <= 3).sort((a, b) => a.fechaResena - b.fechaResena);
    const negativaVieja = negativas[0] ? {
      rating: negativas[0].rating,
      extracto: negativas[0].texto.slice(0, 160) + (negativas[0].texto.length > 160 ? '…' : ''),
      autorNombre: negativas[0].autorNombre,
      diasAtras: Math.floor((Date.now() - negativas[0].fechaResena.getTime()) / 86400000),
    } : null;

    // 2. Vecinos del mismo rubro. Si algo falla acá, la página sigue teniendo
    //    sentido sin la comparación: se devuelve null y no se rompe.
    let competencia = null;
    try {
      const loc = r.geometry?.location;
      const tipo = tipoParaVecinos(r.types);
      if (loc) {
        const vecinos = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
          params: {
            location: `${loc.lat},${loc.lng}`, radius: 2000, type: tipo,
            key: process.env.GOOGLE_PLACES_API_KEY, language: 'es',
          },
        });
        const lista = (vecinos.data.results || [])
          .filter((v) => v.place_id !== placeId && v.business_status !== 'CLOSED_PERMANENTLY' && v.rating)
          .sort((a, b) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0))
          .slice(0, 4)
          .map((v) => ({ nombre: v.name, rating: v.rating, totalResenas: v.user_ratings_total || 0 }));
        if (lista.length) {
          const promedio = lista.reduce((s, v) => s + v.rating, 0) / lista.length;
          const mejor = Math.max(...lista.map((v) => v.rating));
          competencia = {
            vecinos: lista,
            promedio: Math.round(promedio * 10) / 10,
            mejor,
            // Cuánto le falta para alcanzar al mejor de la zona. Es la cifra que
            // convierte la comparación en algo que se puede hacer.
            brecha: r.rating ? Math.round((mejor - r.rating) * 10) / 10 : null,
          };
        }
      }
    } catch (e) {
      console.error('[Publico/ficha] No se pudo comparar con vecinos:', e.message);
    }

    const resultado = {
      placeId,
      nombre: r.name,
      direccion: r.formatted_address || null,
      rating: r.rating || 0,
      totalResenas: r.user_ratings_total || 0,
      resenasAnalizadas: resenas.length,
      sospechosas: sospechosas.length,
      muestra,
      negativaVieja,
      competencia,
      simulador: informeRating({ rating: r.rating, totalResenas: r.user_ratings_total }),
      estadoFicha: r.business_status && r.business_status !== 'OPERATIONAL' ? r.business_status : null,
    };

    if (cacheFicha.size >= CACHE_MAX) cacheFicha.delete(cacheFicha.keys().next().value);
    cacheFicha.set(placeId, { data: resultado, ts: Date.now() });
    res.json(resultado);
  } catch (error) { next(error); }
});

module.exports = router;
