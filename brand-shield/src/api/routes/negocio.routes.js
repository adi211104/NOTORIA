const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { negocioPublico, negociosPublicos } = require('../../lib/negocioPublico');
const { buscarNegocioEnGoogle, obtenerUbicacionNegocio, buscarCompetidoresCercanos, obtenerResenasVisibles } = require('../../scrapers/google.scraper');
const { informeRating } = require('../../lib/rating');
const { generarAfiche } = require('../../utils/afiche.generator');
const { emitirCodigo, VIGENCIA_DIAS } = require('../../lib/constancia');
const { generarConstancia } = require('../../utils/constancia.pdf');

const router = express.Router();
const { autenticar, permitir } = require('../middlewares/auth.middleware');
const { dondeNegocio, registrar } = require('../../lib/equipo');
const { verificarPlan } = require('../middlewares/verificarPlan.middleware');

// Plantillas sugeridas de auto-respuesta por tono (el usuario las aprueba/edita una vez)
const PLANTILLAS_AUTO_RESPUESTA = {
  formal: 'Estimado/a {{autor}}, agradecemos mucho su reseña y el tiempo que se tomó en compartirla. Nos alegra saber que tuvo una buena experiencia con nosotros. ¡Esperamos verlo/a pronto de nuevo!',
  cercano: '¡Gracias por tus palabras, {{autor}}! Nos alegra un montón que la hayas pasado bien. Nos vemos en la próxima :)',
  disculpa: 'Gracias por tu reseña, {{autor}}. Nos alegra que en general la experiencia haya sido positiva y tomamos nota de cualquier detalle a mejorar para la próxima. ¡Te esperamos pronto!',
};

// Mismo intervalo con el que el cron escanea cada plan — ver HORAS_ESCANEO en
// workers/monitoreo.worker.js. Se importa en vez de repetir los números para que
// el panel y el worker no puedan contar cosas distintas.
const { HORAS_ESCANEO } = require('../../workers/monitoreo.worker');
const COOLDOWN_MINUTOS = Object.fromEntries(
  Object.entries(HORAS_ESCANEO).map(([plan, horas]) => [plan, horas * 60])
);

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
      where: dondeNegocio(req, { activo: true }),
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
router.post('/', permitir('negocios'), async (req, res, next) => {
  try {
    // El país ya no viene del cliente: Notoria opera solo en Perú, así que todo
    // negocio se crea con PAIS_UNICO. La columna `pais` se mantiene en el modelo
    // para poder reabrir a otros países sin migrar datos.
    const { nombre, tipo, googlePlaceId } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: 'nombre y tipo son requeridos' });

    const tipoValido = tipoNegocioSchema.safeParse(tipo);
    if (!tipoValido.success) return res.status(400).json({ error: 'tipo de negocio inválido' });

    const total = await prisma.negocio.count({ where: dondeNegocio(req, { activo: true }) });
    const limite = req.cuenta.plan === 'GRATIS' ? 1 : req.cuenta.plan === 'NEGOCIO' ? 5 : 999;
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
      data: { nombre, tipo, pais: PAIS_UNICO, googlePlaceId, googleNombre, googleRatingBase, direccion, usuarioId: req.cuenta.id },
    });
    res.status(201).json({ mensaje: 'Negocio agregado. El monitoreo iniciará pronto.', negocio: negocioPublico(negocio) });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
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
router.patch('/:id/configuracion', permitir('actuar'), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
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
router.post('/:id/auto-respuesta/configurar', permitir('actuar'), verificarPlan(['NEGOCIO', 'FRANQUICIA']), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { activa, plantilla, tono } = req.body;
    const data = { autoRespuestaActiva: !!activa };

    if (req.cuenta.plan === 'FRANQUICIA' && tono) {
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
      where: dondeNegocio(req, { id: req.params.id }),
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

// ── GET /api/negocios/:id/espejo ──────────────────────────
//
// «Así te ve alguien que nunca te ha visitado.»
//
// El monitoreo pide las reseñas con `reviews_sort: 'newest'`, que es lo correcto
// para vigilar. Pero NO es lo que ve un cliente: por defecto Google ordena por
// relevancia, y a quien busca el negocio le enseña otras cinco reseñas, que
// pueden ser de hace meses.
//
// Esa diferencia es información que el dueño no tiene por ningún otro medio.
// Lleva meses contestando lo más reciente mientras la ficha que ve un cliente
// nuevo la encabeza una queja de hace ocho meses que nadie respondió.
//
// Se marca cuáles de esas reseñas visibles siguen sin respuesta, porque ese es
// el trabajo concreto que sale de mirar esto.
router.get('/:id/espejo', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: { id: true, googlePlaceId: true },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!negocio.googlePlaceId) {
      return res.status(400).json({ error: 'Este negocio no tiene una ficha de Google Maps asignada.' });
    }

    const visibles = await obtenerResenasVisibles(negocio.googlePlaceId);
    if (!visibles) return res.status(502).json({ error: 'No pudimos consultar tu ficha en Google. Intenta de nuevo.' });

    // ¿Cuáles de las que ve el público ya están respondidas? Se cruza por
    // externalId contra lo guardado; las que no estén en la base es que nunca
    // pasaron por el panel, así que tampoco están respondidas.
    const ids = visibles.resenas.map((r) => r.externalId);
    const guardadas = ids.length
      ? await prisma.resena.findMany({
          where: { negocioId: negocio.id, externalId: { in: ids } },
          select: { externalId: true, respondida: true },
        })
      : [];
    const respondidas = new Map(guardadas.map((r) => [r.externalId, r.respondida]));

    const resenas = visibles.resenas.map((r) => ({
      externalId: r.externalId,
      rating: r.rating,
      texto: r.texto,
      autorNombre: r.autorNombre,
      autorFoto: r.autorFoto,
      fechaResena: r.fechaResena,
      respondida: respondidas.get(r.externalId) === true,
      // Meses que lleva publicada. Es el dato que hace ver el problema: una
      // reseña de 1★ que Google sigue mostrando primero un año después.
      antiguedadDias: Math.floor((Date.now() - new Date(r.fechaResena).getTime()) / 86400000),
    }));

    res.json({
      rating: visibles.ratingActual,
      totalResenas: visibles.totalResenas,
      resenas,
      // Lo que hay que atender: negativas visibles y sin respuesta
      pendientesCriticas: resenas.filter((r) => r.rating <= 3 && !r.respondida).length,
    });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id/simulador ───────────────────────
//
// Aritmética pura sobre el rating (ver lib/rating.js): cuántas reseñas de 5★
// faltan para cada meta, y qué le pasa al rating si mañana entran 3, 5 o 10 de
// una estrella. Sin llamadas de red: sale del último snapshot que ya está en la
// base, así que se puede pedir todas las veces que haga falta sin gastar cuota.
router.get('/:id/simulador', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: {
        id: true, googleRatingBase: true,
        snapshots: { where: { plataforma: 'GOOGLE' }, orderBy: { tomadoEn: 'desc' }, take: 1 },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const snap = negocio.snapshots?.[0];
    if (!snap?.totalResenas) {
      return res.status(409).json({
        error: 'Todavía no tenemos el conteo de reseñas de tu ficha. Escanea el negocio y vuelve a intentarlo.',
        codigo: 'SIN_DATOS',
      });
    }

    const informe = informeRating({ rating: snap.ratingActual, totalResenas: snap.totalResenas });
    if (!informe) return res.status(409).json({ error: 'No hay datos suficientes para calcular el simulador.', codigo: 'SIN_DATOS' });

    res.json({ ...informe, medidoEn: snap.tomadoEn });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id/afiche.pdf ──────────────────────
//
// El afiche de la pared: un A4 para imprimir y colgar donde trabaja el equipo.
// Ver la cabecera de utils/afiche.generator.js para el porqué — en corto: el
// dueño deja de entrar al panel a las tres semanas, y un papel colgado donde
// trabajan quince personas hace más por el uso del producto que otra alerta.
//
// Todo sale de la base: cero llamadas a Google, así que se puede regenerar las
// veces que haga falta sin gastar cuota.
router.get('/:id/afiche.pdf', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: {
        id: true, nombre: true,
        snapshots: { where: { plataforma: 'GOOGLE' }, orderBy: { tomadoEn: 'desc' }, take: 2 },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const hace7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [nuevasSemana, criticasSinResponder, negativas, alertaFicha] = await Promise.all([
      prisma.resena.count({ where: { negocioId: negocio.id, detectadaEn: { gte: hace7d } } }),
      prisma.resena.count({ where: { negocioId: negocio.id, rating: { lte: 3 }, respondida: false } }),
      // Solo las negativas recientes CON texto: son las que alimentan la
      // detección de la queja repetida (ver quejaMasRepetida).
      prisma.resena.findMany({
        where: { negocioId: negocio.id, rating: { lte: 3 }, detectadaEn: { gte: hace7d }, texto: { not: null } },
        select: { texto: true }, take: 60,
      }),
      // ¿Hay un aviso vivo de ficha cerrada? Es lo único que desplaza a todo lo
      // demás en el foco de la semana.
      prisma.alerta.findFirst({
        where: { negocioId: negocio.id, leida: false, plataforma: 'GOOGLE', detalle: { path: ['motivo'], equals: 'ficha_google' } },
        select: { id: true },
      }).catch(() => null),
    ]);

    const [actual, anterior] = negocio.snapshots;
    const pdf = await generarAfiche(negocio, {
      rating: actual?.ratingActual ?? 0,
      totalResenas: actual?.totalResenas ?? 0,
      nuevasSemana,
      criticasSinResponder,
      caidaRating: actual && anterior ? Math.max(0, anterior.ratingActual - actual.ratingActual) : 0,
      fichaCerrada: !!alertaFicha,
      negativas,
    }, req.usuario.idioma || 'es');

    res.setHeader('Content-Type', 'application/pdf');
    const limpio = (negocio.nombre || 'negocio').replace(/[^\w-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Disposition', `attachment; filename="Notoria-afiche-${limpio}.pdf"`);
    res.send(pdf);
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id/constancia.pdf ──────────────────
//
// La Constancia de Reputación Online: el papel que pide un centro comercial
// antes de alquilar un local, un franquiciante antes de aprobar a un
// franquiciado, o un banco al evaluar un crédito. Ver lib/constancia.js.
//
// Es de planes de pago: el valor está en poder acreditar un HISTORIAL, y eso solo
// existe si el negocio lleva tiempo monitoreado de verdad.
router.get('/:id/constancia.pdf', verificarPlan(['NEGOCIO', 'FRANQUICIA']), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: {
        id: true, nombre: true, direccion: true, googlePlaceId: true, creadoEn: true,
        snapshots: { where: { plataforma: 'GOOGLE' }, orderBy: { tomadoEn: 'desc' }, take: 1 },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const snap = negocio.snapshots?.[0];
    if (!snap?.totalResenas) {
      return res.status(409).json({
        error: 'Todavía no tenemos datos de tu ficha. Escanea el negocio y vuelve a intentarlo.',
        codigo: 'SIN_DATOS',
      });
    }

    // Días bajo monitoreo: desde el primer snapshot real, no desde que se creó la
    // cuenta. Es lo único que la constancia puede afirmar honestamente.
    const primero = await prisma.snapshot.findFirst({
      where: { negocioId: negocio.id, plataforma: 'GOOGLE' },
      orderBy: { tomadoEn: 'asc' },
      select: { tomadoEn: true },
    });
    const desde = primero?.tomadoEn || negocio.creadoEn;
    const diasVigilado = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86400000));

    // alertas de comentarios y menciones, que no son incidencias de la ficha.
    const incidentes = await prisma.alerta.count({
      where: {
        negocioId: negocio.id,
        creadaEn: { gte: desde },
        tipo: { in: ['PICO_RESENAS_NEGATIVAS', 'CAIDA_RATING', 'CUENTAS_NUEVAS'] },
      },
    });

    const codigo = emitirCodigo({
      nombre: negocio.nombre,
      rating: snap.ratingActual,
      totalResenas: snap.totalResenas,
      diasVigilado,
      incidentes,
      placeId: negocio.googlePlaceId || '',
    });

    const front = (process.env.FRONTEND_URL || 'https://usenotoria.app').replace(/\/+$/, '');
    const emitida = new Date();
    const pdf = await generarConstancia({
      nombre: negocio.nombre,
      direccion: negocio.direccion,
      rating: snap.ratingActual,
      totalResenas: snap.totalResenas,
      diasVigilado,
      incidentes,
      emitida,
      vence: new Date(emitida.getTime() + VIGENCIA_DIAS * 86400000),
    }, `${front}/verificar/${codigo}`);

    res.setHeader('Content-Type', 'application/pdf');
    const limpio = (negocio.nombre || 'negocio').replace(/[^\w-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Disposition', `attachment; filename="Notoria-constancia-${limpio}.pdf"`);
    res.send(pdf);
  } catch (error) { next(error); }
});

// ── DELETE /api/negocios/:id ──────────────────────────────
router.delete('/:id', permitir('negocios'), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    await prisma.negocio.update({ where: { id: req.params.id }, data: { activo: false } });
    await registrar(req, 'eliminar_negocio', { negocioId: negocio.id, detalle: { negocio: negocio.nombre } });
    res.json({ mensaje: 'Negocio eliminado correctamente' });
  } catch (error) { next(error); }
});

// ── POST /api/negocios/:id/facebook ──────────────────────
router.post('/:id/facebook', permitir('conexiones'), async (req, res, next) => {
  try {
    const { pageId, accessToken } = req.body;
    if (!pageId || !accessToken) return res.status(400).json({ error: 'pageId y accessToken requeridos' });
    const negocio = await prisma.negocio.findFirst({ where: dondeNegocio(req, { id: req.params.id }) });
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
router.post('/:id/responder-resena', permitir('actuar'), async (req, res, next) => {
  try {
    const { resenaId, respuesta } = req.body;
    if (!resenaId || !respuesta?.trim()) {
      return res.status(400).json({ error: 'resenaId y respuesta son requeridos' });
    }

    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
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

    // Quién respondió. En una cuenta compartida "se respondió" deja de ser una
    // respuesta: hace falta saber quién, y cuándo.
    await registrar(req, 'responder_resena', {
      negocioId: negocio.id,
      detalle: { negocio: negocio.nombre, autor: resena.autor, estrellas: resena.calificacion },
    });

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
      where: dondeNegocio(req, { id: req.params.id }),
      select: { ultimoEscaneo: true },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    // 🔴 `ultimoEscaneo` y `ultimaRevision` son DOS relojes distintos, y
    // confundirlos hace que el panel mienta:
    //
    //   · `ultimoEscaneo` es el reloj del BOTÓN manual. Solo lo escribe una
    //     pulsación (y el cron, únicamente para negocios sin ficha de Google,
    //     que nunca generan snapshot). Es lo que gobierna el cooldown.
    //   · `ultimaRevision` es cuándo se miró la ficha DE VERDAD, lo haya pedido
    //     alguien o lo haya hecho el cron, y eso es el último snapshot.
    //
    // El panel enseña la segunda: a un cliente que nunca ha tocado el botón,
    // decirle "aún sin revisar" cuando el cron pasó hace cinco minutos sería
    // falso, y justo al revés de lo que el producto quiere que entienda.
    const ultimoSnapshot = await prisma.snapshot.findFirst({
      where: { negocioId: req.params.id },
      orderBy: { tomadoEn: 'desc' },
      select: { tomadoEn: true },
    });

    const cooldownMin = COOLDOWN_MINUTOS[req.cuenta.plan] || 1440;
    const comun = {
      ultimaRevision: ultimoSnapshot?.tomadoEn || null,
      cooldownMinutos: cooldownMin,
    };

    if (!negocio.ultimoEscaneo) return res.json({ puedeEscanear: true, segundosRestantes: 0, ...comun });

    const transcurridos = (Date.now() - new Date(negocio.ultimoEscaneo).getTime()) / 1000;
    const cooldownSeg = cooldownMin * 60;
    const restantes = Math.max(0, cooldownSeg - transcurridos);

    res.json({
      puedeEscanear: restantes === 0,
      segundosRestantes: Math.ceil(restantes),
      ultimoEscaneo: negocio.ultimoEscaneo,
      ...comun,
    });
  } catch (error) { next(error); }
});

module.exports = router;
