// brand-shield/src/api/routes/redes.routes.js
// Conexión de redes sociales (Instagram / TikTok) — planes Negocio y Franquicia.
// Los flujos OAuth quedan completos; se activan solos cuando Meta y TikTok aprueben la app
// (basta con agregar META_APP_ID/META_APP_SECRET o TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET al .env).

const express = require('express');
const axios = require('axios');
const prisma = require('../../lib/prisma');
const { autenticar } = require('../middlewares/auth.middleware');
const instagram = require('../../scrapers/instagram.scraper');
const tiktok = require('../../scrapers/tiktok.scraper');
const { firmarState, verificarState } = require('../../lib/oauthState');

const router = express.Router();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || `${BACKEND_URL}/api/redes/instagram/callback`;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || `${BACKEND_URL}/api/redes/tiktok/callback`;

const negocioDelUsuario = async (negocioId, usuarioId) =>
  prisma.negocio.findFirst({ where: { id: negocioId, usuarioId } });

const requierePlanPago = (req, res) => {
  if (req.usuario.plan === 'GRATIS') {
    res.status(403).json({
      error: 'Las redes sociales (Instagram y TikTok) están disponibles desde el Plan Negocio.',
      accion: 'ACTUALIZAR_PLAN',
    });
    return false;
  }
  return true;
};

// State OAuth firmado con HMAC (ver src/lib/oauthState.js) — evita que se puedan
// falsificar los IDs de usuario/negocio en el callback y agrega expiración.
const codificarState = (negocioId, userId) => firmarState({ negocioId, userId });

const decodificarState = (state) => verificarState(state);

// ── GET /api/redes/instagram/callback ─────────────────────
// Meta redirige aquí con el auth code. Sin auth de sesión (lo llama el navegador
// tras el diálogo de Meta) — el usuario y negocio viajan codificados en "state".
router.get('/instagram/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/dashboard?ig_error=${oauthError || 'missing_params'}`);
  }

  try {
    const { negocioId } = decodificarState(state);

    // 1. Code → token de usuario de corta duración
    const { data: tokenCorto } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: META_REDIRECT_URI,
        code,
      },
    });

    // 2. Intercambiar por un token de larga duración (~60 días)
    const { data: tokenLargo } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: tokenCorto.access_token,
      },
    });

    // 3. Buscar la primera página de Facebook con una cuenta de Instagram Business ligada
    const { data: paginas } = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: { fields: 'id,name,access_token,instagram_business_account', access_token: tokenLargo.access_token },
    });

    const pagina = (paginas.data || []).find((p) => p.instagram_business_account);
    if (!pagina) {
      return res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?ig_error=sin_cuenta_business&tab=config`);
    }

    await prisma.negocio.update({
      where: { id: negocioId },
      data: {
        instagramUserId: pagina.instagram_business_account.id,
        instagramAccessToken: pagina.access_token, // token de página — se usa para leer/responder comentarios
        instagramTokenExpira: new Date(Date.now() + (tokenLargo.expires_in || 5184000) * 1000),
      },
    });

    res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?ig=conectado&tab=config`);
  } catch (error) {
    console.error('[Instagram OAuth] Error en callback:', error.response?.data?.error?.message || error.message);
    res.redirect(`${FRONTEND_URL}/dashboard?ig_error=callback_failed`);
  }
});

// ── GET /api/redes/tiktok/callback ────────────────────────
router.get('/tiktok/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/dashboard?tt_error=${oauthError || 'missing_params'}`);
  }

  try {
    const { negocioId } = decodificarState(state);

    const { data } = await axios.post('https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TIKTOK_REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Perfil visible (nombre y foto) en el mismo momento de conectar, para que el
    // panel muestre de quién es la cuenta y no un "TikTok" genérico. Si falla no
    // se aborta la conexión: el token es lo importante y el perfil se rellena
    // después desde /api/comentarios.
    const perfil = await tiktok.obtenerPerfilTikTok(data.access_token);

    await prisma.negocio.update({
      where: { id: negocioId },
      data: {
        tiktokOpenId: data.open_id,
        tiktokAccessToken: data.access_token,
        tiktokRefreshToken: data.refresh_token,
        tiktokTokenExpira: new Date(Date.now() + (data.expires_in || 86400) * 1000),
        ...(perfil ? {
          tiktokNombre: perfil.nombre,
          tiktokAvatar: perfil.avatar,
          tiktokUsername: perfil.username,
          tiktokPerfilUrl: perfil.url,
        } : {}),
      },
    });

    res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?tt=conectado&tab=comentarios`);
  } catch (error) {
    console.error('[TikTok OAuth] Error en callback:', error.response?.data?.error?.message || error.message);
    res.redirect(`${FRONTEND_URL}/dashboard?tt_error=callback_failed`);
  }
});

router.use(autenticar);

// ── GET /api/redes/:negocioId/estado ──────────────────────
router.get('/:negocioId/estado', async (req, res, next) => {
  try {
    const negocio = await negocioDelUsuario(req.params.negocioId, req.usuario.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    res.json({
      instagram: {
        disponible: instagram.configurado(),
        conectado: !!negocio.instagramAccessToken,
      },
      tiktok: {
        disponible: tiktok.configurado(),
        conectado: !!negocio.tiktokAccessToken,
      },
      facebook: {
        disponible: true,
        conectado: !!negocio.facebookPageId,
      },
    });
  } catch (error) { next(error); }
});

// ── POST /api/redes/:negocioId/instagram/conectar ────────
// Devuelve la URL del diálogo de autorización de Meta; el frontend navega a ella.
router.post('/:negocioId/instagram/conectar', async (req, res, next) => {
  try {
    if (!requierePlanPago(req, res)) return;
    const negocio = await negocioDelUsuario(req.params.negocioId, req.usuario.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    if (!instagram.configurado()) {
      return res.status(501).json({
        error: 'La integración con Instagram está en proceso de aprobación por Meta. Te avisaremos cuando esté disponible.',
        estado: 'PENDIENTE_APROBACION',
      });
    }

    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: META_REDIRECT_URI,
      response_type: 'code',
      scope: 'instagram_basic,instagram_manage_comments,pages_show_list,pages_read_engagement',
      state: codificarState(negocio.id, req.usuario.id),
    });

    res.json({ url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}` });
  } catch (error) { next(error); }
});

// ── POST /api/redes/:negocioId/tiktok/conectar ────────────
router.post('/:negocioId/tiktok/conectar', async (req, res, next) => {
  try {
    if (!requierePlanPago(req, res)) return;
    const negocio = await negocioDelUsuario(req.params.negocioId, req.usuario.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    if (!tiktok.configurado()) {
      return res.status(501).json({
        error: 'La integración con TikTok está en proceso de aprobación por TikTok. Te avisaremos cuando esté disponible.',
        estado: 'PENDIENTE_APROBACION',
      });
    }

    // Permisos pedidos. Dos cosas que TikTok trata distinto al resto:
    //  1. Rechaza TODA la autorización (error "scope") si se pide un permiso
    //     que la app no tiene habilitado en la consola — no ignora el sobrante.
    //     Por eso el default es el mínimo de Login Kit + Display API; los de
    //     comentarios se suman por entorno cuando TikTok los apruebe:
    //     TIKTOK_SCOPES=user.info.basic,video.list,comment.list,comment.create
    //  2. Espera las comas SIN codificar. URLSearchParams las convierte en
    //     %2C y TikTok lee entonces un único scope inválido, devolviendo el
    //     mismo error "scope". Por eso este parámetro se concatena aparte y no
    //     dentro de URLSearchParams. Los valores son [a-z.,] así que no
    //     necesitan escape.
    const scopes = process.env.TIKTOK_SCOPES || 'user.info.basic,video.list';

    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      redirect_uri: TIKTOK_REDIRECT_URI,
      response_type: 'code',
      state: codificarState(negocio.id, req.usuario.id),
    });

    res.json({
      url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}&scope=${scopes}`,
    });
  } catch (error) { next(error); }
});

// ── DELETE /api/redes/:negocioId/:red ─────────────────────
// Elimina la conexión de una red social del negocio.
//
// Por qué existe (2026-08-02): no había forma de desconectar una cuenta. Una vez
// autorizada quedaba enlazada para siempre; "Reconectar" solo servía para volver
// a pasar por el diálogo con la MISMA cuenta, y no resolvía ni cambiar de cuenta
// ni revocar el acceso. Eso además es lo primero que mira un revisor de permisos
// de plataforma: qué pasa cuando el usuario quiere retirar el consentimiento.
//
// Lo que NO borra: los comentarios ya guardados. Son historial del negocio y
// perderlos al desconectar sería destructivo y sorprendente. Si se reconecta la
// misma cuenta, el dedupe por `externalId` evita duplicarlos.
const REDES_DESCONECTABLES = {
  tiktok: [
    'tiktokOpenId', 'tiktokAccessToken', 'tiktokRefreshToken', 'tiktokTokenExpira',
    // El perfil cacheado también se va: si mañana se conecta OTRA cuenta, dejarlo
    // haría que el panel muestre el nombre y el avatar de la anterior.
    'tiktokNombre', 'tiktokAvatar', 'tiktokUsername', 'tiktokPerfilUrl',
  ],
  instagram: ['instagramUserId', 'instagramAccessToken', 'instagramTokenExpira'],
};

router.delete('/:negocioId/:red', async (req, res, next) => {
  try {
    const { red } = req.params;
    const campos = REDES_DESCONECTABLES[red];
    if (!campos) return res.status(400).json({ error: `No se puede desconectar "${red}" desde aquí.` });

    const negocio = await negocioDelUsuario(req.params.negocioId, req.usuario.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    let revocado = false;
    if (red === 'tiktok' && negocio.tiktokAccessToken) {
      // Una misma cuenta de TikTok puede estar conectada a VARIOS negocios (ver
      // el comentario de updateMany en lib/tiktokToken.js). Revocar el token es
      // global a la cuenta, así que solo se revoca si este es el último negocio
      // que la usa; si no, desconectar uno tumbaría los demás sin avisar.
      // Sin refresh token no hay con qué comparar: `tiktokRefreshToken: null`
      // como filtro casaría con todos los negocios sin conexión y haría creer
      // que la cuenta está compartida. En ese caso se trata como única.
      const otros = negocio.tiktokRefreshToken
        ? await prisma.negocio.count({
          where: {
            id: { not: negocio.id },
            usuarioId: req.usuario.id,
            tiktokRefreshToken: negocio.tiktokRefreshToken,
          },
        })
        : 0;
      if (otros === 0) {
        const r = await tiktok.revocarTokenTikTok(negocio.tiktokAccessToken);
        revocado = !!r.ok;
        // Un fallo acá no aborta nada: la conexión local se borra igual.
        if (r.error) console.warn(`[TikTok] No se pudo revocar el token de ${negocio.nombre}: ${r.error}`);
      }
    }

    await prisma.negocio.update({
      where: { id: negocio.id },
      data: Object.fromEntries(campos.map((c) => [c, null])),
    });

    console.log(`[Redes] ${red} desconectado de ${negocio.nombre}${revocado ? ' (token revocado en la plataforma)' : ''}`);
    res.json({ mensaje: 'Conexión eliminada', red, revocado });
  } catch (error) { next(error); }
});

module.exports = router;
