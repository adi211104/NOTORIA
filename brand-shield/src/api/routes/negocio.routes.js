const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { negocioPublico, negociosPublicos } = require('../../lib/negocioPublico');
const { buscarNegocioEnGoogle, obtenerUbicacionNegocio, buscarCompetidoresCercanos } = require('../../scrapers/google.scraper');

const router = express.Router();
const { autenticar } = require('../middlewares/auth.middleware');
const { verificarPlan } = require('../middlewares/verificarPlan.middleware');

// Plantillas sugeridas de auto-respuesta por tono (el usuario las aprueba/edita una vez)
const PLANTILLAS_AUTO_RESPUESTA = {
  formal: 'Estimado/a {{autor}}, agradecemos mucho su reseña y el tiempo que se tomó en compartirla. Nos alegra saber que tuvo una buena experiencia con nosotros. ¡Esperamos verlo/a pronto de nuevo!',
  cercano: '¡Gracias por tus palabras, {{autor}}! Nos alegra un montón que la hayas pasado bien. Nos vemos en la próxima :)',
  disculpa: 'Gracias por tu reseña, {{autor}}. Nos alegra que en general la experiencia haya sido positiva y tomamos nota de cualquier detalle a mejorar para la próxima. ¡Te esperamos pronto!',
};

const COOLDOWN_MINUTOS = { GRATIS: 1440, NEGOCIO: 240, FRANQUICIA: 60 };

const TIPOS_NEGOCIO = [
  'RESTAURANTE', 'BAR', 'CAFETERIA', 'HOTEL', 'PELUQUERIA', 'SPA',
  'GIMNASIO', 'CLINICA', 'TIENDA', 'INMOBILIARIA', 'TALLER', 'OTRO',
];
const tipoNegocioSchema = z.enum(TIPOS_NEGOCIO);

// Notoria opera solo en Perú. Se guarda en cada negocio (en vez de omitir la
// columna) para que reabrir a otros países sea cambiar esto y volver a pedirlo
// en el formulario, sin migrar los registros existentes.
const PAIS_UNICO = 'pe';

router.use(autenticar);

// ── GET /api/negocios ─────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const negocios = await prisma.negocio.findMany({
      where: { usuarioId: req.usuario.id, activo: true },
      include: {
        _count: { select: { alertas: { where: { leida: false } } } },
        snapshots: { orderBy: { tomadoEn: 'desc' }, take: 1 },
      },
      orderBy: { creadoEn: 'desc' },
    });
    res.json(negociosPublicos(negocios));
  } catch (error) { next(error); }
});

// ── POST /api/negocios ────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    // El país ya no viene del cliente: Notoria opera solo en Perú, así que todo
    // negocio se crea con PAIS_UNICO. La columna `pais` se mantiene en el modelo
    // para poder reabrir a otros países sin migrar datos.
    const { nombre, tipo, googlePlaceId } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: 'nombre y tipo son requeridos' });

    const tipoValido = tipoNegocioSchema.safeParse(tipo);
    if (!tipoValido.success) return res.status(400).json({ error: 'tipo de negocio inválido' });

    const total = await prisma.negocio.count({ where: { usuarioId: req.usuario.id, activo: true } });
    const limite = req.usuario.plan === 'GRATIS' ? 1 : req.usuario.plan === 'NEGOCIO' ? 5 : 999;
    if (total >= limite) {
      return res.status(403).json({
        error: `Tu plan permite hasta ${limite} negocio(s). Actualiza para agregar más.`,
        accion: 'ACTUALIZAR_PLAN',
      });
    }

    let googleNombre = null, googleRatingBase = null, direccion = null;
    if (googlePlaceId) {
      const info = await buscarNegocioEnGoogle(googlePlaceId);
      if (info) {
        googleNombre = info.nombre;
        googleRatingBase = info.rating;
        direccion = info.direccion || null;
      }
    }

    const negocio = await prisma.negocio.create({
      data: { nombre, tipo, pais: PAIS_UNICO, googlePlaceId, googleNombre, googleRatingBase, direccion, usuarioId: req.usuario.id },
    });
    res.status(201).json({ mensaje: 'Negocio agregado. El monitoreo iniciará pronto.', negocio: negocioPublico(negocio) });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.id, usuarioId: req.usuario.id },
      include: {
        alertas: { orderBy: { creadaEn: 'desc' }, take: 20 },
        snapshots: { orderBy: { tomadoEn: 'desc' }, take: 30 },
        resenas: { orderBy: { detectadaEn: 'desc' }, take: 20 },
        competidores: { include: { snapshots: { orderBy: { tomadoEn: 'desc' }, take: 5 } } },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    res.json(negocioPublico(negocio));
  } catch (error) { next(error); }
});

// ── PATCH /api/negocios/:id/configuracion ─────────────────
router.patch('/:id/configuracion', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.id, usuarioId: req.usuario.id },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { colorEtiqueta, nombre, resumenSemanalActivo } = req.body;
    const data = {};
    if (colorEtiqueta) data.colorEtiqueta = colorEtiqueta;
    if (nombre?.trim()) data.nombre = nombre.trim();
    if (typeof resumenSemanalActivo === 'boolean') data.resumenSemanalActivo = resumenSemanalActivo;

    const actualizado = await prisma.negocio.update({ where: { id: req.params.id }, data });
    res.json({ mensaje: 'Configuración actualizada', negocio: negocioPublico(actualizado) });
  } catch (error) { next(error); }
});

// ── POST /api/negocios/:id/auto-respuesta/configurar ──────
// Aprueba/edita la plantilla de auto-respuesta a reseñas positivas (4-5★).
// Plan Negocio: solo `plantilla`. Plan Franquicia: además puede elegir `tono`
// (una de las 3 variantes sugeridas) en vez de una plantilla única.
router.post('/:id/auto-respuesta/configurar', verificarPlan(['NEGOCIO', 'FRANQUICIA']), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.id, usuarioId: req.usuario.id },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { activa, plantilla, tono } = req.body;
    const data = { autoRespuestaActiva: !!activa };

    if (req.usuario.plan === 'FRANQUICIA' && tono) {
      if (!PLANTILLAS_AUTO_RESPUESTA[tono]) {
        return res.status(400).json({ error: 'Tono inválido. Usa: formal, cercano o disculpa.' });
      }
      data.autoRespuestaTono = tono;
      data.autoRespuestaPlantilla = (plantilla?.trim()) || PLANTILLAS_AUTO_RESPUESTA[tono];
    } else {
      data.autoRespuestaTono = null;
      if (!plantilla?.trim()) {
        return res.status(400).json({ error: 'plantilla es requerida' });
      }
      data.autoRespuestaPlantilla = plantilla.trim();
    }

    const actualizado = await prisma.negocio.update({ where: { id: req.params.id }, data });
    res.json({ mensaje: 'Auto-respuesta configurada correctamente', negocio: negocioPublico(actualizado) });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id/competencia ──────────────────────
// Comparación automática con hasta 3 competidores cercanos (2km, mismo tipo de
// negocio) vía Google Places Nearby Search. Exclusivo del plan Franquicia —
// independiente de la tabla `Competidor` (agregado manual, disponible en todos los planes).
router.get('/:id/competencia', verificarPlan(['FRANQUICIA']), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.id, usuarioId: req.usuario.id },
      include: { snapshots: { orderBy: { tomadoEn: 'desc' }, take: 1 } },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!negocio.googlePlaceId) {
      return res.status(400).json({ error: 'Este negocio no tiene un lugar de Google Maps asignado.' });
    }

    const ubicacion = await obtenerUbicacionNegocio(negocio.googlePlaceId);
    if (!ubicacion) {
      return res.status(502).json({ error: 'No se pudo obtener la ubicación del negocio desde Google Maps.' });
    }

    const competidores = await buscarCompetidoresCercanos({
      lat: ubicacion.lat, lng: ubicacion.lng,
      tipo: negocio.tipo, placeIdExcluir: negocio.googlePlaceId,
    });
    if (!competidores) {
      return res.status(502).json({ error: 'No se pudo consultar Google Places. Intenta de nuevo.' });
    }

    const snap = negocio.snapshots?.[0];
    const promedioCompetencia = competidores.length
      ? competidores.reduce((s, c) => s + c.rating, 0) / competidores.length
      : null;

    res.json({
      miNegocio: { rating: snap?.ratingActual ?? negocio.googleRatingBase ?? null, totalResenas: snap?.totalResenas ?? null },
      competidores,
      promedioCompetencia,
    });
  } catch (error) { next(error); }
});

// ── DELETE /api/negocios/:id ──────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.id, usuarioId: req.usuario.id },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    await prisma.negocio.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ mensaje: 'Negocio eliminado correctamente' });
  } catch (error) { next(error); }
});

// ── POST /api/negocios/:id/facebook ──────────────────────
router.post('/:id/facebook', async (req, res, next) => {
  try {
    const { pageId, accessToken } = req.body;
    if (!pageId || !accessToken) return res.status(400).json({ error: 'pageId y accessToken requeridos' });
    const negocio = await prisma.negocio.findFirst({ where: { id: req.params.id, usuarioId: req.usuario.id } });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    const expira = new Date(); expira.setDate(expira.getDate() + 60);
    await prisma.negocio.update({
      where: { id: req.params.id },
      data: { facebookPageId: pageId, facebookAccessToken: accessToken, facebookTokenExpira: expira },
    });
    res.json({ mensaje: 'Facebook conectado correctamente' });
  } catch (error) { next(error); }
});

// ── POST /api/negocios/:id/responder-resena ───────────────
// Guarda la respuesta en la BD y abre el link correcto en el cliente
router.post('/:id/responder-resena', autenticar, async (req, res, next) => {
  try {
    const { resenaId, respuesta } = req.body;
    if (!resenaId || !respuesta?.trim()) {
      return res.status(400).json({ error: 'resenaId y respuesta son requeridos' });
    }

    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.id, usuarioId: req.usuario.id },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const resena = await prisma.resena.findFirst({
      where: { id: resenaId, negocioId: req.params.id },
    });
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });

    // Guardar respuesta en BD (historial)
    await prisma.resena.update({
      where: { id: resenaId },
      data: { respondida: true, respuesta: respuesta.trim() },
    });

    // Generar link directo según plataforma
    let linkRespuesta = null;
    if (resena.plataforma === 'GOOGLE' && negocio.googlePlaceId) {
      linkRespuesta = `https://search.google.com/local/reviews?placeid=${negocio.googlePlaceId}`;
    } else if (resena.plataforma === 'FACEBOOK' && negocio.facebookPageId) {
      linkRespuesta = `https://www.facebook.com/${negocio.facebookPageId}/reviews`;
    }

    res.json({
      mensaje: 'Respuesta guardada. Ábrela en la plataforma para publicarla.',
      linkRespuesta,
      respuesta: respuesta.trim(),
    });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id/cooldown ────────────────────────
// Devuelve tiempo restante en segundos hasta el próximo escaneo permitido
router.get('/:id/cooldown', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.id, usuarioId: req.usuario.id },
      select: { ultimoEscaneo: true },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const cooldownMin = COOLDOWN_MINUTOS[req.usuario.plan] || 1440;
    if (!negocio.ultimoEscaneo) return res.json({ puedeEscanear: true, segundosRestantes: 0 });

    const transcurridos = (Date.now() - new Date(negocio.ultimoEscaneo).getTime()) / 1000;
    const cooldownSeg = cooldownMin * 60;
    const restantes = Math.max(0, cooldownSeg - transcurridos);

    res.json({
      puedeEscanear: restantes === 0,
      segundosRestantes: Math.ceil(restantes),
      ultimoEscaneo: negocio.ultimoEscaneo,
      cooldownMinutos: cooldownMin,
    });
  } catch (error) { next(error); }
});

module.exports = router;
