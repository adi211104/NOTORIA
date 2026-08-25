// brand-shield/src/api/routes/google-business.routes.js
// Flujo OAuth completo para Google Business Profile API

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { autenticar, permitir } = require('../middlewares/auth.middleware');
const { dondeNegocio, registrar } = require('../../lib/equipo');
const { listarCuentas, listarUbicaciones } = require('../../scrapers/google-business.scraper');
const { firmarState, verificarState } = require('../../lib/oauthState');
const { gbpVisiblePara } = require('../../lib/gbpVisible');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google-business/callback';

// ── GET /api/auth/google-business/iniciar ─────────────────
// Genera la URL de autorización y redirige a Google
// Acepta token como query param porque window.location.href no puede enviar headers
router.get('/iniciar', async (req, res) => {
  const { negocioId, token } = req.query;
  if (!negocioId) return res.status(400).json({ error: 'negocioId requerido' });
  if (!token) return res.status(401).json({ error: 'Token de acceso requerido' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Google OAuth no configurado. Agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET al .env',
    });
  }

  // 🔴 El negocio tiene que ser de quien pide el enlace.
  //
  // Antes se firmaba el state con el `negocioId` que llegara por query sin
  // comprobar nada: bastaba con poner el id de otro cliente para que el callback
  // le sobrescribiera SUS tokens de Google Business (el update de más abajo no
  // filtraba por dueño). El state va firmado con HMAC, sí, pero se firmaba
  // igual de bien un id ajeno — la firma impide falsificar el state, no impide
  // pedir uno legítimo para el negocio de otro.
  const propio = await prisma.negocio.findFirst({
    where: { id: negocioId, usuarioId: payload.id },
    select: { id: true },
  });
  if (!propio) return res.status(404).json({ error: 'Negocio no encontrado' });

  // 🔴 Google no ha concedido acceso a las GBP APIs (cuota RPM = 0), así que
  // este flujo autoriza de verdad y revienta después, en `listarCuentas`. El
  // cliente concede permisos sobre su ficha real y recibe un error genérico.
  // Ver `lib/gbpVisible.js` para el porqué y para cómo se enciende.
  //
  // **404 y no 403**, igual que Instagram: no es que le falte un permiso, es que
  // la función no existe para él. Un 403 invita a pedir acceso a alguien.
  const dueno = await prisma.usuario.findUnique({
    where: { id: payload.id },
    select: { email: true },
  });
  if (!gbpVisiblePara(dueno)) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }

  // State firmado con HMAC (ver src/lib/oauthState.js) — no falsificable + expira.
  const state = firmarState({ negocioId, userId: payload.id });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/business.manage',
    access_type: 'offline',
    prompt: 'consent', // Fuerza el refresh token
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── GET /api/auth/google-business/callback ────────────────
// Google redirige aquí con el auth code
router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[GBP OAuth] Error de Google:', oauthError);
    return res.redirect(`${FRONTEND_URL}/dashboard?gbp_error=${oauthError}`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/dashboard?gbp_error=missing_params`);
  }

  try {
    const { negocioId, userId } = verificarState(state);

    // 1. Intercambiar el código por tokens
    const tokenResponse = await axios.post(TOKEN_URL, {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token } = tokenResponse.data;

    // 2. Obtener las cuentas de Google My Business
    const cuentas = await listarCuentas(access_token);

    if (!cuentas.length) {
      return res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?gbp_error=no_accounts&tab=config`);
    }

    // Segunda comprobación de dueño, ya con el userId que viaja firmado dentro
    // del state. `/iniciar` ya la hizo, pero esta ruta la vuelve a hacer porque
    // es la que escribe: si mañana aparece otra forma de llegar acá, el filtro
    // sigue puesto donde importa.
    const negocioDelUsuario = await prisma.negocio.findFirst({
      where: { id: negocioId, usuarioId: userId },
      select: { id: true },
    });
    if (!negocioDelUsuario) {
      return res.redirect(`${FRONTEND_URL}/dashboard?gbp_error=negocio_no_encontrado`);
    }

    // Guardar token temporalmente — el frontend elegirá la ubicación
    await prisma.negocio.update({
      where: { id: negocioId },
      data: {
        gbpAccessToken: access_token,
        gbpRefreshToken: refresh_token || undefined,
        gbpConectadoEn: new Date(),
      },
    });

    // 3. Si solo hay una cuenta y pocas ubicaciones, autodetectar
    let accountId = null, locationId = null;
    if (cuentas.length === 1) {
      const accountName = cuentas[0].name;
      accountId = accountName.split('/').pop();
      const ubicaciones = await listarUbicaciones(accountName, access_token);

      if (ubicaciones.length === 1) {
        locationId = ubicaciones[0].name.split('/').pop();
        await prisma.negocio.update({
          where: { id: negocioId },
          data: { gbpAccountId: accountId, gbpLocationId: locationId },
        });
      }
    }

    // Redirigir al frontend con cuentas para que el usuario elija (si hay múltiples)
    const cuentasEncoded = encodeURIComponent(JSON.stringify(cuentas.map(c => ({
      id: c.name.split('/').pop(),
      nombre: c.accountName || c.name,
    }))));

    if (accountId && locationId) {
      // Todo autodetectado — éxito directo
      res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?gbp=conectado&tab=config`);
    } else {
      // Necesita seleccionar cuenta/ubicación
      res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?gbp=seleccionar&cuentas=${cuentasEncoded}&tab=config`);
    }
  } catch (error) {
    console.error('[GBP OAuth] Error en callback:', error.message);
    res.redirect(`${FRONTEND_URL}/dashboard?gbp_error=callback_failed`);
  }
});

// ── GET /api/auth/google-business/ubicaciones ─────────────
// Lista las ubicaciones de una cuenta GBP para que el usuario elija
router.get('/ubicaciones', autenticar, permitir('conexiones'), async (req, res, next) => {
  try {
    const { negocioId, accountId } = req.query;
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: negocioId }),
    });
    if (!negocio?.gbpAccessToken) return res.status(404).json({ error: 'Token GBP no encontrado' });

    const ubicaciones = await listarUbicaciones(`accounts/${accountId}`, negocio.gbpAccessToken);
    res.json(ubicaciones.map(u => ({
      id: u.name.split('/').pop(),
      nombre: u.title,
      direccion: u.storefrontAddress?.addressLines?.join(', ') || '',
    })));
  } catch (error) { next(error); }
});

// ── POST /api/auth/google-business/seleccionar ────────────
// El usuario elige su cuenta y ubicación
router.post('/seleccionar', autenticar, permitir('conexiones'), async (req, res, next) => {
  try {
    const { negocioId, accountId, locationId } = req.body;
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: negocioId }),
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    await prisma.negocio.update({
      where: { id: negocioId },
      data: { gbpAccountId: accountId, gbpLocationId: locationId },
    });
    res.json({ mensaje: 'Google Business Profile conectado correctamente' });
  } catch (error) { next(error); }
});

// ── POST /api/negocios/:id/gbp-responder ──────────────────
// Responde una reseña directamente via GBP API
router.post('/:negocioId/gbp-responder', autenticar, permitir('actuar'), async (req, res, next) => {
  try {
    const { reviewId, respuesta } = req.body;
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.negocioId }),
    });
    if (!negocio?.gbpAccessToken || !negocio.gbpAccountId) {
      return res.status(400).json({ error: 'Google Business Profile no conectado' });
    }

    const { responderResenaGBP } = require('../../scrapers/google-business.scraper');

    const resultado = await responderResenaGBP(
      negocio.gbpAccountId, negocio.gbpLocationId,
      reviewId, respuesta,
      negocio.gbpAccessToken, negocio.gbpRefreshToken
    );

    if (resultado.error) return res.status(500).json({ error: resultado.error });

    // Actualizar token si fue refrescado
    if (resultado.tokenRefrescado) {
      await prisma.negocio.update({
        where: { id: negocio.id },
        data: { gbpAccessToken: resultado.tokenRefrescado },
      });
    }

    // Marcar como respondida en la BD
    await prisma.resena.updateMany({
      where: { externalId: reviewId, negocioId: negocio.id },
      data: { respondida: true, respuesta },
    });

    res.json({ mensaje: 'Respuesta publicada en Google Maps correctamente' });
  } catch (error) { next(error); }
});

module.exports = router;
