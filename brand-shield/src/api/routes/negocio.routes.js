const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { negocioPublico, negociosPublicos } = require('../../lib/negocioPublico');
const { buscarNegocioEnGoogle, obtenerUbicacionNegocio, buscarCompetidoresCercanos, obtenerResenasVisibles } = require('../../scrapers/google.scraper');
const { informeRating } = require('../../lib/rating');
const { compararMeses, ordenarPorCrecimiento, hayAlgoQueContar } = require('../../lib/progreso');
const { generarAfiche } = require('../../utils/afiche.generator');
const cartelLib = require('../../lib/cartel');
const { generarCartel } = require('../../utils/cartel.generator');
const { emitirCodigo, VIGENCIA_DIAS } = require('../../lib/constancia');
const { generarConstancia } = require('../../utils/constancia.pdf');
const { armar: armarExpediente, VENTANA_DIAS: VENTANA_EXPEDIENTE } = require('../../lib/expediente');
const { generarExpediente } = require('../../utils/expediente.pdf');
const { emitirCodigo: emitirCodigoExpediente, huellaTexto: huellaTextoExpediente } = require('../../lib/expedienteCodigo');
const { limite: limiteDelPlan, limiteLegible, planesCon, puede, negociosPermitidos } = require('../../lib/planes');
const score = require('../../lib/score');
const temasLib = require('../../lib/temas');
const tareasLib = require('../../lib/tareas');
const { periodosMensuales } = require('../../lib/progreso');
const parteEquipoService = require('../../services/parteEquipo.service');

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
    // 🔴 Esto era un ternario `GRATIS ? 1 : NEGOCIO ? 5 : 999`, y el `else` es
    // una trampa: cualquier plan nuevo caía ahí y se llevaba 999 negocios. El
    // plan más barato del catálogo habría salido con locales ilimitados sin que
    // nadie tocara una línea. Ahora el tope sale de lib/planes.js y un plan sin
    // fila cae a GRATIS, que es el lado seguro del error.
    //
    // ⚠️ Y desde el 2026-08-25 el tope NO es el del plan a secas: NEGOCIO y
    // FRANQUICIA incluyen un local y venden los demás sueltos, así que hay que
    // sumarle los que este cliente pagó. Preguntarle a `limiteDelPlan` acá
    // dejaría a un cliente que pagó cuatro locales sin poder cargar el segundo.
    const limite = negociosPermitidos(req.cuenta.plan, req.cuenta.localesExtra);
    if (total >= limite) {
      // El mensaje distingue los dos casos, porque la salida es distinta: al de
      // un plan que vende locales no hay que decirle que "actualice" —ya está
      // en el plan bueno— sino que sume un local.
      const vendeLocales = puede(req.cuenta.plan, 'localesAdicionales');
      return res.status(403).json({
        error: vendeLocales
          // ⚠️ Apunta a Planes, que es donde ESTÁ el selector de locales. Decía
          // «Configuración → Suscripción», donde ese control no existe: un
          // mensaje que manda a un sitio sin el botón que promete es la misma
          // clase de fallo que hoy se quitó de la web seis veces.
          ? `Tu suscripción cubre ${limiteLegible(limite)} local(es). Suma otro desde Planes, en tu panel.`
          : `Tu plan permite hasta ${limiteLegible(limite)} negocio(s). Actualiza para agregar más.`,
        accion: vendeLocales ? 'AGREGAR_LOCAL' : 'ACTUALIZAR_PLAN',
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

// ── GET /api/negocios/tareas ──────────────────────────────
//
// «Para hacer hoy», de TODOS los negocios de la cuenta. Es lo que el panel de
// inicio necesita para dejar de contestar solo «¿cómo estoy?» y contestar
// también «¿qué hago?».
//
// ⚠️ Va declarada ANTES de `/:id` a propósito. Express casa por orden, así que
// con `/:id` arriba esta petición entraría como un negocio con id "tareas" y
// devolvería 404 — un fallo que se lee como "la ruta no existe" cuando el
// problema es el orden del archivo.
router.get('/tareas', async (req, res, next) => {
  try {
    const negocios = await prisma.negocio.findMany({
      where: dondeNegocio(req, { activo: true }),
      select: {
        id: true, nombre: true, googlePlaceId: true, colorEtiqueta: true,
        snapshots: { where: { plataforma: 'GOOGLE' }, orderBy: { tomadoEn: 'desc' }, take: 1, select: { totalResenas: true } },
        resenas: { select: { id: true, rating: true, respondida: true, detectadaEn: true } },
        alertas: { where: { leida: false }, select: { id: true, tipo: true, leida: true } },
        comentarios: { select: { respondida: true, publicacionId: true } },
      },
      orderBy: { creadoEn: 'desc' },
    });

    const porNegocio = negocios.map((n) => ({
      negocio: { id: n.id, nombre: n.nombre, colorEtiqueta: n.colorEtiqueta },
      tareas: tareasLib.construir({
        negocio: n,
        resenas: n.resenas,
        comentarios: n.comentarios,
        alertas: n.alertas,
        snapshot: n.snapshots[0] || null,
        // La tendencia de temas no entra acá: exige partir las reseñas en dos
        // periodos por negocio y esta ruta la pide el panel en cada carga. Vive
        // en /:id/resumen, que es donde hay sitio para explicarla.
        tendenciaTemas: null,
      }),
    })).filter((x) => x.tareas.length);

    res.json({
      negocios: porNegocio,
      total: porNegocio.reduce((n, x) => n + x.tareas.length, 0),
    });
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
router.post('/:id/auto-respuesta/configurar', permitir('actuar'), verificarPlan(planesCon('autoRespuesta')), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { activa, plantilla, tono } = req.body;
    const data = { autoRespuestaActiva: !!activa };

    if (puede(req.cuenta.plan, 'tonoPersonalizado') && tono) {
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
router.get('/:id/competencia', verificarPlan(planesCon('competenciaAutomatica')), async (req, res, next) => {
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

// ── GET /api/negocios/:id/progreso ────────────────────────
//
// Este mes contra el anterior, para el negocio y para los competidores que el
// cliente sigue. Sale entero de los snapshots que ya se guardan: cero llamadas
// a Google, así que se puede pedir las veces que haga falta.
//
// 🔴 Mide RESEÑAS GANADAS, no rating, y eso no es un atajo. Con 49 días de
// historial real delante (2026-08-23) los cinco negocios más antiguos daban
// 4.8→4.8, 3.9→3.9, 4.0→4.0 y 4.5→4.5: una ficha con cientos de reseñas no
// mueve su promedio en un mes. Lo que sí se movió en ese mismo periodo fueron
// las reseñas — 14, 5, 3 — y además es lo único que el dueño puede empujar.
// El rating viaja igual, como dato de apoyo, con su `ratingSignificativo`.
//
// ⚠️ Responde 409 SIN_DATOS cuando no hay nada que contar, en vez de devolver
// una lista de ceros. Es la regla de producto del proyecto: lo que no se puede
// entregar no se muestra, y una pantalla de progreso con todo en cero le dice
// al cliente que su mes fue plano cuando lo que pasa es que aún no hay medición
// suficiente. El panel debe esconder la sección ante ese 409, no pintarla vacía.
router.get('/:id/progreso', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: {
        id: true, nombre: true,
        snapshots: { where: { plataforma: 'GOOGLE' }, select: { tomadoEn: true, ratingActual: true, totalResenas: true } },
        competidores: {
          select: {
            id: true, nombre: true,
            snapshots: { select: { tomadoEn: true, ratingActual: true, totalResenas: true } },
          },
        },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const ahora = new Date();
    const propio = { id: negocio.id, nombre: negocio.nombre, esPropio: true, ...compararMeses(negocio.snapshots, ahora) };
    const rivales = negocio.competidores.map((c) => ({
      id: c.id, nombre: c.nombre, esPropio: false, ...compararMeses(c.snapshots, ahora),
    }));

    // El corte mira SOLO el negocio propio. Que un competidor haya crecido no es
    // motivo para abrirle una pantalla de progreso a quien todavía no tiene
    // ninguna medición suya: leería el mes de otro como si fuera el propio.
    if (!hayAlgoQueContar([propio])) {
      return res.status(409).json({
        error: 'Todavía no hay suficiente historial para comparar este mes con el anterior.',
        codigo: 'SIN_DATOS',
      });
    }

    res.json({
      negocio: propio,
      // Ordenados juntos: la gracia es ver en qué puesto quedó uno.
      ranking: ordenarPorCrecimiento([propio, ...rivales]),
      medidoEn: ahora,
    });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id/resumen ─────────────────────────
//
// Score + de qué se queja la gente + qué hacer, en UNA petición.
//
// Es una sola ruta y no tres porque el panel las pinta juntas al abrir la ficha:
// tres peticiones serían tres consultas a la misma tabla de reseñas para
// contestar tres preguntas sobre los mismos datos.
//
// 🔴 No gasta NI UNA llamada a Google ni a Groq. Todo sale de lo que el worker
// ya guardó, así que se puede pedir en cada carga sin pensar en el costo. Es la
// misma propiedad que hace barato el endpoint de progreso.
router.get('/:id/resumen', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: {
        id: true, nombre: true, tipo: true, googlePlaceId: true,
        // Todas las reseñas captadas: el score cuenta sospechosas y respondidas
        // sobre el total, y los temas necesitan el texto. Con `take` saldrían
        // porcentajes calculados sobre una muestra arbitraria.
        resenas: {
          select: { id: true, rating: true, texto: true, respondida: true, esSospechosa: true, detectadaEn: true, fechaResena: true },
        },
        snapshots: {
          where: { plataforma: 'GOOGLE' },
          orderBy: { tomadoEn: 'desc' },
          // 180 lecturas cubren de sobra los 60 días que dibuja la serie, incluso
          // a la cadencia de 1 h de Franquicia (que agrupa por día igualmente).
          take: 180,
          select: { tomadoEn: true, ratingActual: true, totalResenas: true },
        },
        alertas: { select: { id: true, tipo: true, leida: true } },
        comentarios: { select: { respondida: true, publicacionId: true } },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const idioma = req.usuario?.idioma === 'en' ? 'en' : 'es';
    const ultimo = negocio.snapshots[0] || null;

    // ── Score ──────────────────────────────────────────────────────────────
    const actual = score.calcular(ultimo, negocio.resenas);
    const serieScore = score.serie(negocio.snapshots, negocio.resenas);

    // ── Temas ──────────────────────────────────────────────────────────────
    // El corte por mes calendario es el mismo de lib/progreso.js: el dueño
    // piensa en meses, y un corte móvil hace que el mismo dato cambie de valor
    // cada día que lo mira.
    const periodos = periodosMensuales();
    const enPeriodo = (r, p) => {
      const t = new Date(r.fechaResena || r.detectadaEn).getTime();
      return Number.isFinite(t) && t >= p.desde.getTime() && t < p.hasta.getTime();
    };
    // ⚠️ El umbral sale de tareas.js (≤3★), NO de temas.js. Aquí había
    // `MINIMO_MENCIONES + 1`, que da 3 por casualidad: son dos constantes que no
    // tienen nada que ver —una cuenta menciones de un tema, la otra decide qué
    // reseña está molesta— y el día que una cambie, la otra se rompe sin motivo.
    const negativas = negocio.resenas.filter((r) => r.rating != null && r.rating <= tareasLib.UMBRAL_NEGATIVA);
    // ⚠️ El rubro va SIEMPRE: sin él, una peluquería recibe el diccionario de
    // comida y se queda sin un solo tema (ver `lib/temas.js`). `tipo` está en el
    // select de esta consulta desde antes; lo que faltaba era pasarlo.
    const distribucion = temasLib.distribucion(negativas, idioma, negocio.tipo);
    const tendencia = temasLib.tendencia(
      negativas.filter((r) => enPeriodo(r, periodos.actual)),
      negativas.filter((r) => enPeriodo(r, periodos.previo)),
      idioma,
      negocio.tipo,
    );

    // ── Tareas ─────────────────────────────────────────────────────────────
    const tareas = tareasLib.construir({
      negocio,
      resenas: negocio.resenas,
      comentarios: negocio.comentarios,
      alertas: negocio.alertas,
      snapshot: ultimo,
      tendenciaTemas: tendencia,
    });

    res.json({
      score: actual,
      serie: serieScore,
      variacion: score.variacion(serieScore),
      // `temas` va con su propio "sobre cuántas reseñas hablo": un 40% sobre 5
      // reseñas y un 40% sobre 200 son afirmaciones muy distintas, y sin ese
      // dato el panel no puede distinguirlas.
      temas: distribucion,
      tendenciaTemas: tendencia,
      tareas,
      medidoEn: new Date(),
    });
  } catch (error) { next(error); }
});

// ── GET /api/negocios/:id/parte-equipo ────────────────────
//
// El mensaje que el dueño reenvía al grupo de WhatsApp de su personal.
//
// 🔴 Es lo contrario de todo lo demás que hace la IA en Notoria. La respuesta
// pública —que ya existe y funciona— es cosmética: le contesta al cliente que ya
// se fue molesto y no le dice nada a quien provocó el motivo. Esto va hacia
// ADENTRO, y es lo que convierte a Notoria de vigilante de reputación en
// herramienta de gestión. Ver la cabecera de lib/parteEquipo.js.
//
// ⚠️ Los NÚMEROS los pone el código y la IA solo los redacta. Este parte lo lee
// un equipo que sabe perfectamente lo que pasó esa semana: una cifra inventada
// lo desacredita entero a la primera.
//
// ⚠️ Cachea una semana, así que abrir la ficha cuarenta veces sigue costando UNA
// llamada a Groq. Y no descuenta de la cuota de IA del cliente: esa es para lo
// que él pide a mano, no para un texto automático que no solicitó.
router.get('/:id/parte-equipo', verificarPlan(planesCon('parteEquipo')), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: {
        id: true, nombre: true, parteEquipo: true, parteEquipoFecha: true,
        resenas: { select: { rating: true, texto: true, fechaResena: true, detectadaEn: true } },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const idioma = req.usuario?.idioma === 'en' ? 'en' : 'es';
    // `forzar` deja al dueño regenerarlo si no le gusta cómo quedó. Sigue
    // acotado: es una llamada por pulsación, y la pulsa una persona.
    const forzar = req.query.regenerar === '1';
    const parte = await parteEquipoService.obtener(negocio, negocio.resenas, idioma, { forzar });

    // 409 y no un objeto vacío: "esta semana no hay parte que escribir" es una
    // respuesta distinta de "el parte está vacío", y el panel tiene que poder
    // esconder la sección. Misma regla que el SIN_DATOS de /progreso.
    if (!parte) {
      return res.status(409).json({
        error: 'Esta semana no hay suficientes reseñas nuevas para escribirle un parte al equipo.',
        codigo: 'SIN_MATERIAL',
      });
    }

    res.json({
      texto: parte.texto,
      generadoEn: parte.generadoEn,
      cacheado: !!parte.cacheado,
      // Los hechos viajan para que el panel pueda enseñar de dónde sale cada
      // cosa. Un parte que no se puede auditar es un parte en el que el dueño
      // no confía lo bastante como para reenviarlo a quince personas.
      hechos: {
        total: parte.hechos.total,
        positivas: parte.hechos.positivas,
        negativas: parte.hechos.negativas,
        temas: parte.hechos.temas.map((t) => ({ id: t.id, etiqueta: t.etiquetaCorta, veces: t.veces })),
        desde: parte.hechos.desde,
        hasta: parte.hechos.hasta,
      },
    });
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

// ── GET /api/negocios/:id/cartel.pdf?formato=MURAL ────────
//
// El cartel de «déjanos tu reseña»: la hoja A4 que el dueño imprime y pega en su
// local para que el cliente escanee y opine en Google. Cuatro tamaños, del mural
// de la puerta a las etiquetas de la cuenta. Ver `lib/cartel.js`.
//
// 🔴 **No lleva `verificarPlan`, y es a propósito.** Es la única herramienta de
// Notoria que PRODUCE reseñas —todo lo demás mide las que ya hay—, así que
// cerrarla al plan gratuito le quitaría al cliente nuevo justo lo que hace que
// el producto le sirva la primera semana. El QR ya era visible para todos en el
// panel desde siempre; esto solo le pone un papel alrededor.
//
// Sale entero de la base: **cero llamadas a Google** y cero a Groq, así que se
// puede regenerar las veces que haga falta sin gastar cuota.
router.get('/:id/cartel.pdf', async (req, res, next) => {
  try {
    // El formato viene de la query, o sea del cliente. Se valida contra la tabla
    // en vez de confiar: `formato=../../etc` acabaría en el nombre del archivo
    // que se manda en el Content-Disposition.
    const formato = String(req.query.formato || 'MURAL').toUpperCase();
    if (!cartelLib.esFormato(formato)) {
      return res.status(400).json({
        error: 'Formato de cartel no válido',
        tipo: 'FORMATO_INVALIDO',
        validos: cartelLib.ORDEN_FORMATOS,
      });
    }

    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: { id: true, nombre: true, googlePlaceId: true },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    // Sin ficha de Google no hay enlace de reseñas al que apuntar, así que no hay
    // cartel. Se dice con su propio tipo y no con un 404 pelado: el panel esconde
    // la sección en ese caso, pero un cliente que llegue por la URL merece saber
    // que le falta conectar la ficha, no creer que la función no existe.
    if (!negocio.googlePlaceId) {
      return res.status(409).json({
        error: 'Este negocio todavía no tiene ficha de Google',
        tipo: 'SIN_FICHA_GOOGLE',
      });
    }

    const pdf = await generarCartel({
      formato,
      nombre: negocio.nombre,
      enlace: cartelLib.enlaceResenas(negocio.googlePlaceId),
      idioma: req.usuario.idioma || 'es',
    });

    res.setHeader('Content-Type', 'application/pdf');
    const limpio = (negocio.nombre || 'negocio').replace(/[^\w-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Disposition', `attachment; filename="Notoria-cartel-${formato.toLowerCase()}-${limpio}.pdf"`);
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
router.get('/:id/constancia.pdf', verificarPlan(planesCon('constancia')), async (req, res, next) => {
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

    // El score que anuncian los cuatro planes, ahora también en el papel que el
    // cliente le enseña a un mall o a un franquiciante. Se calcula sobre las
    // reseñas captadas, igual que en la ficha: dos números distintos con el
    // mismo nombre serían peor que no ponerlo.
    const resenasScore = await prisma.resena.findMany({
      where: { negocioId: negocio.id },
      select: { esSospechosa: true, respondida: true },
    });
    const puntuacion = score.calcular(snap, resenasScore);

    const codigo = emitirCodigo({
      nombre: negocio.nombre,
      rating: snap.ratingActual,
      totalResenas: snap.totalResenas,
      diasVigilado,
      incidentes,
      placeId: negocio.googlePlaceId || '',
      score: puntuacion ? puntuacion.score : undefined,
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
      score: puntuacion ? puntuacion.score : null,
      emitida,
      vence: new Date(emitida.getTime() + VIGENCIA_DIAS * 86400000),
    }, `${front}/verificar/${codigo}`);

    res.setHeader('Content-Type', 'application/pdf');
    const limpio = (negocio.nombre || 'negocio').replace(/[^\w-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Disposition', `attachment; filename="Notoria-constancia-${limpio}.pdf"`);
    res.send(pdf);
  } catch (error) { next(error); }
});


// ── GET /api/negocios/:id/expediente/:resenaId.pdf ────────
//
// El expediente de una reseña: todo lo que Notoria sabe de ella, ordenado para
// que sirva ante Google, ante la Policía o ante un abogado.
//
// Existe por un patrón que todo dueño de restaurante en Lima conoce y del que no
// hay nada escrito en español: alguien deja 1★ y acto seguido escribe por privado
// ofreciendo quitarla a cambio de una comida o de plata. Lo que Notoria puede
// aportar —y a mano nadie reúne bien— es la mitad de la evidencia que no le
// pertenece al dueño: el texto exacto y su fecha aunque después la editen o la
// borren, cuándo la captamos, y cómo se movió la ficha alrededor de ese día.
//
// 🔴 El límite está en `lib/expediente.js` y en el PDF: se ARMA la evidencia y se
// explica el procedimiento. No se da asesoría legal ni se afirma que la reseña
// sea falsa — eso lo determinan la plataforma o la autoridad. Misma regla que el
// detector, que dice «comportamiento anómalo» y nunca «esta reseña es falsa».
//
// Cero llamadas a Google y cero a la IA: sale entero de datos ya guardados.
//
// ⚠️ Va con `permitir('ver')` implícito (es un GET) pero SÍ pasa por
// `dondeNegocio`, que es lo que impide pedir el expediente de una reseña de la
// ficha de otro. Sin eso, cualquiera con sesión podría descargarse el historial
// de un negocio ajeno con nuestro membrete encima.
router.get('/:id/expediente/:resenaId.pdf', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.id }),
      select: { id: true, nombre: true, direccion: true, googlePlaceId: true },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    // La reseña tiene que ser DE ESTE negocio. Filtrar solo por id dejaría pedir
    // la reseña de una ficha ajena pasando el negocio propio.
    const resena = await prisma.resena.findFirst({
      where: { id: req.params.resenaId, negocioId: negocio.id },
    });
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });

    const centro = new Date(resena.fechaResena || resena.detectadaEn);
    const margen = VENTANA_EXPEDIENTE * 24 * 3600 * 1000;
    const desde = new Date(centro.getTime() - margen);
    const hasta = new Date(centro.getTime() + margen);

    const [delPeriodo, snapshots] = await Promise.all([
      prisma.resena.findMany({
        where: { negocioId: negocio.id, fechaResena: { gte: desde, lte: hasta } },
        select: { rating: true, fechaResena: true, detectadaEn: true, esSospechosa: true, motivoSospecha: true },
      }),
      // Un margen más ancho que la ventana a propósito: hace falta el snapshot
      // ANTERIOR al día de la reseña, y con la cadencia de 24 h del plan Gratis
      // el más cercano puede estar a un día largo de distancia.
      prisma.snapshot.findMany({
        where: {
          negocioId: negocio.id,
          plataforma: 'GOOGLE',
          tomadoEn: { gte: new Date(centro.getTime() - margen * 2), lte: new Date(centro.getTime() + margen * 2) },
        },
        select: { tomadoEn: true, ratingActual: true, totalResenas: true },
        orderBy: { tomadoEn: 'asc' },
      }),
    ]);

    const exp = armarExpediente({ negocio, resena, delPeriodo, snapshots });

    // 🔴 El código firmado es lo que convierte el PDF en un documento
    // contrastable (ver `lib/expedienteCodigo.js`). Se emite sobre los datos ya
    // armados —no sobre la fila cruda— para que lo firmado sea exactamente lo
    // que el PDF imprime.
    //
    // ⚠️ Si falla, el expediente se entrega IGUAL, sin recuadro de verificación.
    // Lo único que puede hacerlo fallar es que falte `JWT_SECRET`, y negarle al
    // cliente el documento entero —con el reloj de una denuncia corriendo—
    // porque no se le puede poner un sello sería el peor de los dos resultados.
    let verificacion = null;
    try {
      const codigo = emitirCodigoExpediente({ negocio, resena: exp.resena, emitidoEn: exp.emitidoEn });
      verificacion = {
        codigo,
        url: `${(process.env.FRONTEND_URL || 'https://usenotoria.app').replace(/\/$/, '')}/verificar/${codigo}`,
        huellaTexto: huellaTextoExpediente(exp.resena.texto),
      };
    } catch (e) {
      console.warn('[Expediente] Sin código de verificación:', e.message);
    }

    const pdf = await generarExpediente(exp, verificacion);

    res.setHeader('Content-Type', 'application/pdf');
    const limpio = (negocio.nombre || 'negocio').replace(/[^\w-]+/g, '-').slice(0, 40);
    res.setHeader('Content-Disposition', `attachment; filename="Notoria-expediente-${limpio}.pdf"`);
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
