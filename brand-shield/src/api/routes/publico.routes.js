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

const router = express.Router();

const publicoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas. Espera unos minutos e inténtalo de nuevo.' },
});
router.use(publicoLimiter);

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
router.get('/buscar-negocio', async (req, res, next) => {
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

router.get('/analizar', async (req, res, next) => {
  try {
    const placeId = (req.query.placeId || '').trim();
    if (!placeId || placeId.length > 300) return res.status(400).json({ error: 'placeId inválido' });

    const cacheado = cacheAnalisis.get(placeId);
    if (cacheado && Date.now() - cacheado.ts < CACHE_MS) return res.json(cacheado.data);

    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'name,rating,user_ratings_total,reviews',
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
    };

    if (cacheAnalisis.size >= CACHE_MAX) {
      const masVieja = cacheAnalisis.keys().next().value;
      cacheAnalisis.delete(masVieja);
    }
    cacheAnalisis.set(placeId, { data: resultado, ts: Date.now() });
    res.json(resultado);
  } catch (error) { next(error); }
});

module.exports = router;
