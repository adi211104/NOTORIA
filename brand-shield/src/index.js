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

const { iniciarMonitoreo, iniciarReportesMensuales, iniciarResumenesAlertas, iniciarRenovacionesCulqi, iniciarEscalacionUrgencias } = require('./workers/monitoreo.worker');
const { iniciarResumenSemanal } = require('./workers/resumenSemanal.worker');
const { iniciarDrip } = require('./workers/drip.worker');
const { iniciarEnvioSunat } = require('./workers/envioSunat.worker');

const app = express();
const PORT = process.env.PORT || 3000;

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
  allowedHeaders: ['Content-Type','Authorization'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta más tarde.' },
  skip: (req) => {
    // No limitar rutas de OAuth — son redirecciones únicas del navegador
    return req.path.startsWith('/auth/google-business/') ||
           req.path.startsWith('/auth/google');
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
app.use('/api/auth/google-business', gbpRoutes);
app.use('/api/negocios-gbp', gbpRoutes);

// Health check para Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Manejo de errores ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.message}`);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  });
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
    iniciarResumenSemanal();
    iniciarEscalacionUrgencias();
    // Solo arranca si SUNAT_EMISION_ACTIVA=true y hay certificado y credenciales;
    // si no, se registra en el log y no hace nada (ver envioSunat.worker.js)
    iniciarEnvioSunat();
    iniciarDrip();
    console.log('🔄 Monitoreo periódico iniciado');
    console.log('📄 Cron de reportes mensuales iniciado');
    console.log('📬 Cron de resúmenes de alertas iniciado');
    console.log('💳 Cron de renovaciones Culqi iniciado');
    console.log('📊 Cron de resumen semanal iniciado');
    console.log('🚨 Cron de escalación de urgencias iniciado');
  }
});

module.exports = app;
