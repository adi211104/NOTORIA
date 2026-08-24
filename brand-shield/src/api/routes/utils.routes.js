const express = require('express');
const axios = require('axios');
const { autenticar, permitir } = require('../middlewares/auth.middleware');
const { dondeNegocio, registrar } = require('../../lib/equipo');
const { buscarNegocioEnGoogle } = require('../../scrapers/google.scraper');
const { ejecutarAhora, HORAS_ESCANEO } = require('../../workers/monitoreo.worker');
const { puede } = require('../../lib/planes');
const prisma = require('../../lib/prisma');

const router = express.Router();

// El cooldown del botón "Escanear ahora" es el MISMO intervalo con el que el
// cron escanea ese plan (ver HORAS_ESCANEO en monitoreo.worker.js). Antes estaba
// duplicado acá como números sueltos; se importa para que cambiar la oferta de
// un plan no exija acordarse de tocar dos archivos.
const COOLDOWN_MINUTOS = Object.fromEntries(
  Object.entries(HORAS_ESCANEO).map(([plan, horas]) => [plan, horas * 60])
);

// Notoria opera solo en Perú por ahora, así que las búsquedas de Google Places
// van fijadas a PE. Se mantiene el mecanismo de region + post-filtro (y no un
// simple hardcode del texto) porque el parámetro "region" de Google solo sesga
// el ranking, NO restringe por país: sin el post-filtro por address_component,
// buscar "KFC" puede devolver locales de Chile o México.
// Para reabrir a más países, volver a un mapa código -> nombre y recibir el
// código desde el cliente.
const PAIS = { codigo: 'pe', nombre: 'Perú' };

const TIPOS_QUERY = {
  RESTAURANTE: 'restaurant', BAR: 'bar', CAFETERIA: 'cafe', HOTEL: 'hotel',
  PELUQUERIA: 'hair salon', SPA: 'spa', GIMNASIO: 'gym', CLINICA: 'clinic',
  TIENDA: 'store', INMOBILIARIA: 'real estate agency', TALLER: 'auto repair shop',
};

// Confirma el país real de un resultado vía Place Details (address_components).
// El formatted_address de Text Search NO siempre incluye el nombre del país
// (Google lo omite seguido cuando coincide con el bias de "region"), así que
// no es confiable para filtrar — el country component sí lo es.
const paisDeResultado = async (placeId) => {
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id: placeId, fields: 'address_component', key: process.env.GOOGLE_PLACES_API_KEY },
    });
    const pais = data.result?.address_components?.find((c) => c.types.includes('country'));
    return pais?.short_name || null;
  } catch { return null; }
};

// ── GET /api/utils/buscar-negocio ─────────────────────────
router.get('/buscar-negocio', autenticar, async (req, res, next) => {
  try {
    // `region` ya no se recibe del cliente: siempre se busca en Perú. Se sigue
    // aceptando en la query por compatibilidad con clientes viejos, pero se ignora.
    const { q, tipo } = req.query;
    if (!q || q.length < 3) return res.status(400).json({ error: 'Escribe al menos 3 caracteres' });

    const tipoQuery = TIPOS_QUERY[tipo] || 'business';
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: {
        query: `${q} ${tipoQuery} ${PAIS.nombre}`,
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
        region: PAIS.codigo,
      },
    });
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: 'Error consultando Google Places' });
    }

    const regionUpper = PAIS.codigo.toUpperCase();
    const candidatos = (data.results || []).slice(0, 8);
    const verificados = await Promise.all(
      candidatos.map(async (p) => ({ p, pais: await paisDeResultado(p.place_id) }))
    );

    const resultados = verificados
      .filter((v) => v.pais === regionUpper)
      .slice(0, 5)
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

// ── POST /api/utils/monitoreo-manual ─────────────────────
// 🔴 `negocioId` es OBLIGATORIO, y no puede volver a dejar de serlo.
//
// Hasta el 2026-08-17 este endpoint aceptaba el cuerpo vacío. Cuando `negocioId`
// venía undefined se saltaba el bloque de abajo ENTERO —cooldown incluido— y
// llamaba a `ejecutarAhora(null)`, que en el worker resuelve a
// `where: { activo: true }`: TODOS los negocios de TODOS los clientes.
//
// O sea que cualquier cuenta gratuita, con un POST de cuerpo vacío, disparaba un
// escaneo de la plataforma completa: una consulta a Google Places por cada
// negocio y cada competidor de la base, correos de alerta a otros clientes, y
// auto-respuestas publicadas en las fichas de Google de otra gente. El único
// freno era el límite global de 100 peticiones/15 min.
//
// Si algún día hace falta un escaneo global, va en un script de terminal
// (`scripts/escanear.js`), nunca detrás de una sesión de usuario.
router.post('/monitoreo-manual', autenticar, permitir('actuar'), async (req, res, next) => {
  try {
    const { negocioId } = req.body || {};
    const plan = req.cuenta.plan;
    const cooldownMin = COOLDOWN_MINUTOS[plan] || 1440;

    if (!negocioId || typeof negocioId !== 'string') {
      return res.status(400).json({ error: 'negocioId es requerido' });
    }

    // La pertenencia se comprueba acá: `ejecutarAhora` recibe un id ya validado.
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: negocioId }),
      select: { ultimoEscaneo: true, nombre: true },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    if (negocio.ultimoEscaneo) {
      const transcurridos = (Date.now() - new Date(negocio.ultimoEscaneo).getTime()) / 1000 / 60;
      if (transcurridos < cooldownMin) {
        const restantes = Math.ceil(cooldownMin - transcurridos);
        return res.status(429).json({
          error: `Debes esperar ${restantes} minutos más para volver a escanear.`,
          minutosRestantes: restantes,
          cooldownMinutos: cooldownMin,
        });
      }
    }

    // Actualizar ultimoEscaneo
    await prisma.negocio.update({ where: { id: negocioId }, data: { ultimoEscaneo: new Date() } });

    await registrar(req, 'escanear', { negocioId, detalle: { negocio: negocio.nombre } });

    res.json({
      mensaje: 'Escaneo iniciado en segundo plano. Las alertas aparecerán en unos segundos.',
      cooldownMinutos: cooldownMin,
    });

    setImmediate(() => ejecutarAhora(negocioId).catch(console.error));
  } catch (error) { next(error); }
});

// ── POST /api/utils/generar-reporte ──────────────────────
router.post('/generar-reporte', autenticar, async (req, res, next) => {
  try {
    // El reporte mensual lo incluye IMPULSO desde el 2026-08-24: generarlo no
    // cuesta ninguna llamada externa y es de lo que más sostiene el hábito.
    if (!puede(req.cuenta.plan, 'reporteMensual')) {
      return res.status(403).json({ error: 'Los reportes PDF están disponibles desde el Plan Impulso.', accion: 'ACTUALIZAR_PLAN' });
    }
    res.json({ mensaje: 'Reporte generado. Lo recibirás en tu email en unos minutos.' });
    setImmediate(async () => {
      try {
        const { enviarReporteMensual } = require('../../utils/reporte.generator');

        const negocios = await prisma.negocio.findMany({
          where: dondeNegocio(req, { activo: true }),
          include: {
            snapshots: { orderBy: { tomadoEn: 'desc' }, take: 30 },
            alertas: { where: { creadaEn: { gte: new Date(new Date().setDate(1)) } } },
            resenas: { where: { detectadaEn: { gte: new Date(new Date().setDate(1)) } } },
          },
        });
        const usuario = await prisma.usuario.findUnique({
          where: { id: req.usuario.id }, select: { id: true, nombre: true, email: true, idioma: true },
        });
        for (const negocio of negocios) {
          await enviarReporteMensual(usuario, negocio, {
            snapshots: negocio.snapshots, alertas: negocio.alertas, resenas: negocio.resenas,
          });
        }
      } catch (e) { console.error('[Reporte manual]', e.message); }
    });
  } catch (error) { next(error); }
});

module.exports = router;
