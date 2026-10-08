require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes       = require('./api/routes/auth.routes');
const negocioRoutes    = require('./api/routes/negocio.routes');
const alertaRoutes     = require('./api/routes/alerta.routes');
const pagoRoutes       = require('./api/routes/pago.routes');
const utilsRoutes      = require('./api/routes/utils.routes');
const competidorRoutes = require('./api/routes/competidor.routes');
const gbpRoutes = require('./api/routes/google-business.routes');
const iaRoutes = require('./api/routes/ia.routes');
const redesRoutes = require('./api/routes/redes.routes');
const mencionRoutes = require('./api/routes/mencion.routes');
const comentarioRoutes = require('./api/routes/comentario.routes');
const publicoRoutes = require('./api/routes/publico.routes');
const reclamacionRoutes = require('./api/routes/reclamacion.routes');
const webhooksRoutes = require('./api/routes/webhooks.routes');
const equipoRoutes = require('./api/routes/equipo.routes');
const rutaRoutes = require('./api/routes/ruta.routes');

const { iniciarMonitoreo, iniciarReportesMensuales, iniciarResumenesAlertas, iniciarRenovacionesCulqi, iniciarBajadaDePlanes, iniciarEscalacionUrgencias, iniciarAvisoReclamaciones } = require('./workers/monitoreo.worker');
const { iniciarResumenSemanal } = require('./workers/resumenSemanal.worker');
const { iniciarDrip } = require('./workers/drip.worker');
const { iniciarRecordatoriosVerificacion } = require('./workers/verificacion.worker');
const { iniciarAvisosPausa } = require('./workers/pausa.worker');
const { iniciarAvisoAnulaciones } = require('./workers/anulaciones.worker');
const { iniciarEnvioSunat } = require('./workers/envioSunat.worker');
const { iniciarResumenSunat } = require('./workers/resumenSunat.worker');
const { iniciarReintentoWebhooks, iniciarReconciliacionCobros } = require('./workers/reconciliacion.worker');
const { iniciarLibroComisiones } = require('./lib/libroComisiones');

// Antes de nada: sin DATABASE_URL o JWT_SECRET en producción el proceso NO
// arranca (el deploy queda fallido y sigue sirviendo la versión anterior), y lo
// opcional que falte se grita en el log (lib/configProduccion.js, auditoría
// 2026-10-02, P0-03 / I-15).
const configProduccion = require('./lib/configProduccion');
configProduccion.comprobarAlArrancar();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Identificador de petición (auditoría P2-09) ──────────
// Cada petición lleva un id que sale en la cabecera `X-Request-Id`, en el log
// de cualquier error y en el cuerpo de un 500. Con eso, «me salió un error a
// las 3» se encuentra en los logs de Railway en vez de adivinarse. Se acepta
// el de un proxy si viene y parece un id; si no, se genera.
const crypto = require('crypto');
app.use((req, res, next) => {
  const entrante = req.get('X-Request-Id');
  req.id = entrante && /^[\w-]{8,64}$/.test(entrante) ? entrante : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// ─── Seguridad ────────────────────────────────────────────
// Railway sirve detrás de un proxy, así que la IP real del cliente llega en
// `X-Forwarded-For`. Sin esto Express reporta la IP del proxy y express-rate-limit
// mete a TODOS los usuarios en el mismo balde (un solo cupo compartido: unos pocos
// usuarios activos bloquean al resto, y el freno anti-fuerza-bruta del login deja
// de ser por persona).
//
// Es `1`, no `true`, a propósito: `true` hace que Express confíe en toda la cadena
// de X-Forwarded-For, y entonces cualquiera puede mandar el header a mano para
// falsear su IP y saltarse el rate-limit. `1` = confiar en un solo proxy, que es
// lo que Railway pone delante.
app.set('trust proxy', 1);

app.use(helmet());
const origensPermitidos = [
  process.env.FRONTEND_URL || 'http://localhost:3001',
  'https://usenotoria.app',
  'https://www.usenotoria.app',
  'http://localhost:3001',
  'http://localhost:3000',
];

// En desarrollo, permitir el acceso desde otras PCs de la misma red local
// (http://192.168.x.x:3001, http://10.x.x.x:3001, etc.)
const esOrigenRedLocal = (origin) =>
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d+$/.test(origin);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, cURL, mobile apps)
    if (!origin) return callback(null, true);
    if (origensPermitidos.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && esOrigenRedLocal(origin)) return callback(null, true);
    callback(new Error(`CORS bloqueado para origen: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  // X-Cuenta: en qué cuenta está trabajando el usuario cuando alguien le
  // compartió la suya. Sin declararlo aquí el navegador lo bloquea en el
  // preflight y el panel volvería siempre a la cuenta propia — un fallo que
  // solo aparece en producción, porque en local el CORS no llega a molestar.
  allowedHeaders: ['Content-Type','Authorization','X-Cuenta'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta más tarde.' },
  skip: (req) => {
    // No limitar rutas de OAuth — son redirecciones únicas del navegador
    return req.path.startsWith('/auth/google-business/') ||
           req.path.startsWith('/auth/google') ||
           // Ni los webhooks de Meta: llegan a ráfagas (una publicación con
           // muchos comentarios manda un evento por cada uno) y todos desde las
           // mismas IPs de Meta, así que el cupo de 100/15min se agotaría solo.
           // Un 429 no es un fallo silencioso: Meta reintenta y, si sigue
           // fallando, DESACTIVA la suscripción. La firma HMAC es el filtro real
           // de esta ruta, no el rate-limit.
           req.path.startsWith('/webhooks/');
  },
});
app.use('/api/', limiter);

// Límite MÁS estricto para las rutas sensibles de autenticación — frena la fuerza
// bruta de contraseñas y el credential stuffing sin afectar el uso normal.
// `skipSuccessfulRequests` hace que los logins/registros exitosos NO cuenten: solo
// se acumulan los intentos fallidos (401/4xx), así un usuario legítimo nunca se
// bloquea a sí mismo pero un atacante agota su cupo rápido.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});
app.use([
  '/api/auth/login',
  '/api/auth/registro',
  '/api/auth/recuperar-password',
  '/api/auth/resetear-password',
], authLimiter);

// Lectura pública de una invitación de equipo. Es la única ruta sin sesión que
// devuelve el nombre de una empresa a cambio de un token, así que lleva su
// propio freno: el token son 256 bits aleatorios y adivinarlo es inviable, pero
// un cupo alto y suelto invita a usar el endpoint como sonda. 30 cada 15 min es
// de sobra para alguien que abre su correo y pulsa el enlace.
app.use('/api/equipo/invitacion', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
}));

// ─── Webhooks ─────────────────────────────────────────────
// VA ANTES del body parser JSON a propósito: Meta firma los bytes exactos del
// cuerpo, así que esta ruta necesita el buffer crudo. Si `express.json()` lo
// consumiera primero, habría que re-serializar el objeto para validar la firma
// y cualquier diferencia de formato invalidaría eventos legítimos.
app.use('/api/webhooks', webhooksRoutes);

// ─── Body parser ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rutas ────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/negocios',    negocioRoutes);
app.use('/api/alertas',     alertaRoutes);
app.use('/api/pagos',       pagoRoutes);
app.use('/api/utils',       utilsRoutes);
app.use('/api/competidores', competidorRoutes);
app.use('/api/ia',          iaRoutes);
app.use('/api/redes',       redesRoutes);
app.use('/api/menciones',   mencionRoutes);
app.use('/api/comentarios', comentarioRoutes);
app.use('/api/publico',     publicoRoutes);
app.use('/api/reclamaciones', reclamacionRoutes);
app.use('/api/ruta',        rutaRoutes);   // ruta comercial del promotor — solo RUTA_COMERCIAL_ACCESO
app.use('/api/equipo',      equipoRoutes);
app.use('/api/auth/google-business', gbpRoutes);
app.use('/api/negocios-gbp', gbpRoutes);

// ─── ¿Fluye el dinero? — 2026-10-07 (réplica del auditor, §9) ──────────
// Cobros en duda o sin aplicar, webhooks atascados, trabajos detenidos y
// ráfagas de 5xx (lib/saludOperacion.js). Pública como /health/monitoreo:
// solo conteos. La sondea el monitor de Cloudflare.
const saludOperacion = require('./lib/saludOperacion');
const ARRANCADO_EN = Date.now();
let cacheOperacion = { hasta: 0, cuerpo: null };
app.get('/health/operacion', async (req, res) => {
  try {
    if (Date.now() > cacheOperacion.hasta) {
      cacheOperacion = { hasta: Date.now() + 60 * 1000, cuerpo: await saludOperacion.veredicto(require('./lib/prisma'), { arrancadoEn: ARRANCADO_EN }) };
    }
    const v = cacheOperacion.cuerpo;
    res.status(v.operacion === 'ok' ? 200 : 503).json({ ...v, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ operacion: 'sin_comprobar', motivos: ['base_no_responde'] });
  }
});

// Health check para Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── ¿Seguimos VIGILANDO? — 2026-09-22 ────────────────────
//
// 🔴 `/health` de arriba dice que el proceso está vivo, y eso no es lo mismo que decir
// que el producto está haciendo su trabajo. El día que Google suspenda la facturación,
// `/health` va a seguir contestando 200 mientras cada consulta a Places se rechaza y el
// escaneo deja de producir. Esta ruta es la que sabe distinguirlo (ver
// `lib/saludPlaces.js`, que explica por qué el fallo es completamente mudo).
//
// ⚠️ Va SEPARADA de `/health` a propósito: `/health` es la sonda de vida que mira
// Railway y no debe tocar la base — si lo hiciera, un hipo de Postgres haría que
// Railway diera el contenedor por muerto y lo reiniciara.
//
// ⚠️ Es pública porque la lee el monitor de Cloudflare, que no tiene sesión. Solo
// devuelve agregados: ni nombres de negocio, ni correos, ni nada de una persona.
const salud = require('./lib/saludPlaces');
const dormancia = require('./lib/dormancia');
const prisma = require('./lib/prisma');   // el singleton, nunca un PrismaClient propio

// Cachea un minuto. La ruta es pública y toca la base; el monitor pregunta cada 5
// minutos, así que el caché no le quita frescura a nadie y le pone techo al gasto.
const CACHE_MS = 60 * 1000;
let cacheSalud = { hasta: 0, cuerpo: null };

app.get('/health/monitoreo', async (req, res) => {
  try {
    if (Date.now() > cacheSalud.hasta) {
      cacheSalud = {
        hasta: Date.now() + CACHE_MS,
        cuerpo: await salud.veredicto(prisma, dormancia),
      };
    }
    const v = cacheSalud.cuerpo;
    // 503 cuando algo va mal, para que el monitor lo vea por el código Y por el cuerpo.
    res.status(v.vigilancia === 'ok' ? 200 : 503).json({
      ...v,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // No puede lanzar: un 500 sin cuerpo le diría al monitor que algo falla sin decir qué.
    res.status(503).json({ vigilancia: 'sin_comprobar', detalle: e.message });
  }
});

// ─── Manejo de errores ────────────────────────────────────
//
// 🔴 Un 5xx NO devuelve `err.message` (auditoría 2026-10-02, P1-08). Ese texto
// puede ser un error de Prisma con nombres de tablas y columnas, o el mensaje
// crudo de un proveedor: información interna que no le sirve al cliente y sí a
// quien sondea la API. Al cliente, un mensaje genérico con el id de la
// petición; al log, el error completo con ese mismo id.
//
// Un 4xx sí conserva su mensaje: lo redactó una ruta para el usuario (o es un
// error de entrada, como un JSON mal formado, que conviene que entienda).
app.use((err, req, res, next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : (Number.isInteger(err.statusCode) ? err.statusCode : 500);
  console.error(`[Error] ${req.method} ${req.originalUrl} [${req.id}] ${status}: ${err.message}`, status >= 500 && err.stack ? `\n${err.stack}` : '');
  if (status >= 500) {
    saludOperacion.registrar5xx();
    return res.status(status).json({ error: 'Error interno del servidor', requestId: req.id });
  }
  res.status(status).json({ error: err.message || 'Solicitud inválida', requestId: req.id });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── Inicio ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Notoria API corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);

  if (process.env.NODE_ENV === 'production') {
    iniciarMonitoreo();
    iniciarReportesMensuales();
    iniciarResumenesAlertas();
    iniciarRenovacionesCulqi();
    // Va aparte de las renovaciones a propósito: este baja a GRATIS a quien
    // canceló y ya terminó su periodo pagado, que es un caso donde NO hay que
    // cobrar nada. Corre 30 min después para no cruzarse con el cobro.
    iniciarBajadaDePlanes();
    iniciarResumenSemanal();
    iniciarEscalacionUrgencias();
    iniciarAvisoReclamaciones();
    // Solo arrancan si SUNAT_EMISION_ACTIVA=true y hay certificado y credenciales;
    // si no, se registra en el log y no hacen nada (ver envioSunat.worker.js).
    // Son dos colas distintas a propósito: las facturas se envían una a una y
    // las boletas por resumen diario, que es obligatorio y tiene otro plazo.
    iniciarEnvioSunat();
    iniciarResumenSunat();
    iniciarDrip();
    iniciarRecordatoriosVerificacion();
    // Aviso previo a la pausa de las cuentas gratuitas inactivas (lib/dormancia.js).
    iniciarAvisosPausa();
    iniciarAvisoAnulaciones();
    // Auditoría 2026-10-02: reintento de webhooks pendientes (lib/webhookInbox.js)
    // y reconciliación de cobros a medias contra Culqi (lib/cobros.js).
    iniciarReintentoWebhooks();
    iniciarReconciliacionCobros();
    // 2026-10-07: asienta en el libro lo que se devengó o se revirtió (lib/libroComisiones.js).
    iniciarLibroComisiones();
    console.log('🔄 Monitoreo periódico iniciado');
    console.log('📄 Cron de reportes mensuales iniciado');
    console.log('📬 Cron de resúmenes de alertas iniciado');
    console.log('💳 Cron de renovaciones Culqi iniciado');
    console.log('📊 Cron de resumen semanal iniciado');
    console.log('🚨 Cron de escalación de urgencias iniciado');
  }
});

module.exports = app;
