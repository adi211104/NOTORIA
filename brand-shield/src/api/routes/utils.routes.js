const express = require('express');
const axios = require('axios');
const { autenticar } = require('../middlewares/auth.middleware');
const { buscarNegocioEnGoogle } = require('../../scrapers/google.scraper');
const { ejecutarAhora } = require('../../workers/monitoreo.worker');
const prisma = require('../../lib/prisma');

const router = express.Router();

const COOLDOWN_MINUTOS = { GRATIS: 1440, NEGOCIO: 240, FRANQUICIA: 60 };

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
router.post('/monitoreo-manual', autenticar, async (req, res, next) => {
  try {
    const { negocioId } = req.body;
    const plan = req.usuario.plan;
    const cooldownMin = COOLDOWN_MINUTOS[plan] || 1440;

    // Verificar cooldown si se especifica un negocio
    if (negocioId) {
      const negocio = await prisma.negocio.findFirst({
        where: { id: negocioId, usuarioId: req.usuario.id },
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
    }

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
    const planPago = ['NEGOCIO', 'FRANQUICIA'].includes(req.usuario.plan);
    if (!planPago) {
      return res.status(403).json({ error: 'Los reportes PDF están disponibles desde el Plan Negocio.', accion: 'ACTUALIZAR_PLAN' });
    }
    res.json({ mensaje: 'Reporte generado. Lo recibirás en tu email en unos minutos.' });
    setImmediate(async () => {
      try {
        const { enviarReporteMensual } = require('../../utils/reporte.generator');

        const negocios = await prisma.negocio.findMany({
          where: { usuarioId: req.usuario.id, activo: true },
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
