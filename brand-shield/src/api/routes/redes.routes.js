// brand-shield/src/api/routes/redes.routes.js
// Conexión de redes sociales (Instagram / TikTok) — planes Negocio y Franquicia.
// Los flujos OAuth quedan completos; se activan solos cuando Meta y TikTok aprueben la app
// (basta con agregar META_APP_ID/META_APP_SECRET o TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET al .env).

const express = require('express');
const axios = require('axios');
const prisma = require('../../lib/prisma');
const { autenticar, permitir } = require('../middlewares/auth.middleware');
const { dondeNegocio, registrar } = require('../../lib/equipo');
const instagram = require('../../scrapers/instagram.scraper');
const tiktok = require('../../scrapers/tiktok.scraper');
const tiktokBiz = require('../../scrapers/tiktokBusiness.scraper');
const { firmarState, verificarState } = require('../../lib/oauthState');
const { instagramVisiblePara } = require('../../lib/instagramVisible');
const { facebookVisiblePara } = require('../../lib/facebookVisible');

const router = express.Router();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || `${BACKEND_URL}/api/redes/instagram/callback`;
// Facebook Reviews usa la MISMA app de Meta pero su propio callback: el de
// Instagram busca `instagram_business_account` y descarta las páginas que no lo
// tienen, que es justamente el caso de un negocio que solo usa Facebook.
const META_REDIRECT_URI_FB = process.env.META_REDIRECT_URI_FB || `${BACKEND_URL}/api/redes/facebook/callback`;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || `${BACKEND_URL}/api/redes/tiktok/callback`;
const TIKTOK_BIZ_REDIRECT_URI = process.env.TIKTOK_BIZ_REDIRECT_URI || `${BACKEND_URL}/api/redes/tiktok-business/callback`;

// Ver el comentario gemelo en comentario.routes.js: la cuenta, no la persona.
const negocioDeLaCuenta = async (req, negocioId) =>
  prisma.negocio.findFirst({ where: dondeNegocio(req, { id: negocioId }) });

// Primer escaneo nada más conectar. Sin esto, el usuario autoriza, vuelve al
// panel y encuentra la pestaña de comentarios VACÍA hasta que corra el cron —
// hasta una hora después. Se lee como que la conexión no funcionó, y es la
// primera impresión del producto justo después del paso que más cuesta.
//
// Se espera, pero con tope: el callback de OAuth tiene que redirigir sí o sí, y
// una cuenta con muchas publicaciones podría tardar. Si se pasa del tope, el
// escaneo sigue por su cuenta en segundo plano y el cron lo recogerá igual; lo
// único que se pierde es que aparezca ya mismo.
//
// El negocio se relee CON el usuario porque el motor de alertas necesita
// `prefsAlertas` para decidir a quién avisar y por dónde: sin esa relación
// revienta al guardar el primer comentario negativo.
const TOPE_PRIMER_ESCANEO_MS = 12000;

const primerEscaneo = async (negocioId, red) => {
  try {
    const negocio = await prisma.negocio.findUnique({
      where: { id: negocioId },
      include: {
        usuario: { select: { id: true, email: true, nombre: true, prefsAlertas: true, plan: true } },
      },
    });
    if (!negocio) return;

    const { procesarComentariosSociales } = require('../../workers/monitoreo.worker');
    await Promise.race([
      procesarComentariosSociales(negocio),
      new Promise((r) => setTimeout(r, TOPE_PRIMER_ESCANEO_MS)),
    ]);
  } catch (e) {
    // Nunca tumba la conexión: la cuenta ya quedó vinculada, que es lo que el
    // usuario pidió. Los comentarios llegarán en el siguiente ciclo.
    console.warn(`[${red}] Primer escaneo tras conectar falló: ${e.message}`);
  }
};

const requierePlanPago = (req, res) => {
  if (req.cuenta.plan === 'GRATIS') {
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

  // El negocio viaja en `state`, y Meta lo devuelve también cuando el usuario
  // cancela el diálogo. Se decodifica ANTES que nada para poder devolverlo a SU
  // negocio pase lo que pase: la ficha del negocio es la única pantalla que lee
  // estos parámetros, así que un error que aterriza en /dashboard es un error
  // que el usuario nunca ve — la conexión simplemente "no hace nada".
  let negocioId = null;
  try { ({ negocioId } = decodificarState(state)); } catch { /* state ausente o manipulado */ }

  const volverA = (params) => res.redirect(
    `${FRONTEND_URL}${negocioId ? `/dashboard/negocios/${negocioId}` : '/dashboard'}?${params}`,
  );

  if (oauthError || !code || !state) {
    return volverA(`ig_error=${oauthError || 'missing_params'}`);
  }

  try {

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

    // El caso frecuente: la cuenta es profesional pero nunca se vinculó a una
    // página de Facebook, así que `me/accounts` viene vacío. Tiene arreglo, y el
    // panel muestra los pasos — ver el aviso de `ig_error` en negocios/[id].
    // Dos fallos DISTINTOS que antes se contaban como uno solo, y confundirlos
    // manda al usuario a arreglar algo que ya está bien:
    //
    //  · lista VACÍA → la autorización no incluyó ninguna página. El caso real:
    //    Facebook ofrece "¿continuar con tu configuración anterior?" y, al
    //    aceptar, REUTILIZA el permiso viejo — el de antes de que existiera la
    //    página. Hay que pulsar "Editar configuración" y marcarla. Pasa igual
    //    cuando se añade un permiso nuevo (`pages_manage_metadata`): el token
    //    reutilizado no lo trae.
    //
    //  · hay páginas pero NINGUNA con Instagram → ahí sí falta vincular.
    const listaPaginas = paginas.data || [];
    const pagina = listaPaginas.find((p) => p.instagram_business_account);
    if (!pagina) {
      // Diagnóstico SOLO en el camino de fallo (no cuesta nada en el normal).
      // Sin esto, "0 páginas" no distingue entre el usuario que no otorgó nada
      // y una configuración que devuelve un token de OTRO tipo del que el
      // código espera: `me/accounts` lista las páginas de una PERSONA, así que
      // con un token de system user devuelve vacío aunque el consentimiento
      // haya sido correcto. Saber quién es `me` y qué permisos trae el token
      // separa esos dos casos en una sola lectura del log.
      let diagnostico = '';
      try {
        const [yo, permisos] = await Promise.all([
          axios.get('https://graph.facebook.com/v21.0/me', {
            params: { fields: 'id,name', access_token: tokenLargo.access_token },
          }),
          axios.get('https://graph.facebook.com/v21.0/me/permissions', {
            params: { access_token: tokenLargo.access_token },
          }),
        ]);
        const concedidos = (permisos.data.data || [])
          .filter((p) => p.status === 'granted').map((p) => p.permission).join(', ');
        diagnostico = ` | me = ${yo.data.name || '(sin nombre)'} [${yo.data.id}] | permisos concedidos: ${concedidos || 'NINGUNO'}`;
      } catch (e) {
        diagnostico = ` | diagnóstico no disponible: ${e.response?.data?.error?.message || e.message}`;
      }
      console.warn(`[Instagram OAuth] Sin cuenta utilizable: ${listaPaginas.length} página(s) autorizada(s), ninguna con Instagram vinculado.${diagnostico}`);
      return volverA(`ig_error=${listaPaginas.length ? 'sin_cuenta_business' : 'sin_paginas'}`);
    }

    await prisma.negocio.update({
      where: { id: negocioId },
      data: {
        instagramUserId: pagina.instagram_business_account.id,
        instagramAccessToken: pagina.access_token, // token de página — se usa para leer/responder comentarios
        instagramTokenExpira: new Date(Date.now() + (tokenLargo.expires_in || 5184000) * 1000),
      },
    });

    // Suscribir la página a los webhooks de comentarios. La suscripción es POR
    // CUENTA: tener el webhook activo en el panel de Meta no basta, hay que
    // pedirla para cada cliente que conecta, y este es el único punto donde
    // tenemos el token de página recién emitido.
    //
    // Un fallo NO aborta la conexión: sin webhook los comentarios siguen
    // llegando por el escaneo periódico, con su ventana de 25 publicaciones y
    // hasta 4 horas de retraso. Conectar a medias es mejor que no conectar.
    const suscripcion = await instagram.suscribirWebhookInstagram(pagina.access_token);
    if (suscripcion.error) {
      console.warn(`[Instagram] Webhook no suscrito para ${pagina.name}: ${suscripcion.error}`);
    }

    await primerEscaneo(negocioId, 'Instagram');
    volverA('ig=conectado');
  } catch (error) {
    console.error('[Instagram OAuth] Error en callback:', error.response?.data?.error?.message || error.message);
    volverA('ig_error=callback_failed');
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

    await primerEscaneo(negocioId, 'TikTok');
    res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?tt=conectado&tab=comentarios`);
  } catch (error) {
    console.error('[TikTok OAuth] Error en callback:', error.response?.data?.error?.message || error.message);
    res.redirect(`${FRONTEND_URL}/dashboard?tt_error=callback_failed`);
  }
});

// ── GET /api/redes/tiktok-business/callback ───────────────
// Callback de la TikTok Accounts API (§15-octies). Va ANTES de `router.use(autenticar)`
// porque quien llega acá es el navegador redirigido por TikTok, sin nuestro JWT;
// la identidad viaja en el `state` firmado.
router.get('/tiktok-business/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/dashboard?tt_error=${oauthError || 'missing_params'}`);
  }

  try {
    const { negocioId } = decodificarState(state);

    const t = await tiktokBiz.canjearCodigoTikTokBiz(code, TIKTOK_BIZ_REDIRECT_URI);
    if (t.error) {
      console.error(`[TikTok Biz OAuth] Canje fallido: ${t.error}`);
      return res.redirect(`${FRONTEND_URL}/dashboard?tt_error=callback_failed`);
    }

    // Perfil visible en el mismo momento de conectar, para que el panel muestre
    // de quién es la cuenta y no un "TikTok" genérico. Si falla no se aborta la
    // conexión: el token es lo importante y el perfil se rellena en el próximo
    // escaneo.
    const perfil = await tiktokBiz.obtenerPerfilTikTokBiz(t.businessId, t.accessToken);

    await prisma.negocio.update({
      where: { id: negocioId },
      data: {
        tiktokBizId: t.businessId,
        tiktokBizAccessToken: t.accessToken,
        tiktokBizRefreshToken: t.refreshToken,
        tiktokBizTokenExpira: t.expiraEn,
        ...(perfil ? {
          tiktokNombre: perfil.nombre,
          tiktokAvatar: perfil.avatar,
          tiktokUsername: perfil.username,
          tiktokPerfilUrl: perfil.url,
        } : {}),
      },
    });

    await primerEscaneo(negocioId, 'TikTok');
    res.redirect(`${FRONTEND_URL}/dashboard/negocios/${negocioId}?tt=conectado&tab=comentarios`);
  } catch (error) {
    console.error('[TikTok Biz OAuth] Error en callback:', error.message);
    res.redirect(`${FRONTEND_URL}/dashboard?tt_error=callback_failed`);
  }
});

// ── GET /api/redes/facebook/callback ──────────────────────
//
// Gemelo del de Instagram, con UNA diferencia que es la razón de que exista por
// separado: aquel busca la página que tenga `instagram_business_account` y
// descarta las demás (`redes.routes.js`, «3. Buscar la primera página…»). Un
// restaurante que solo usa Facebook no tiene ninguna así, y con ese callback su
// conexión fallaría con «sin_cuenta_business» — un mensaje que le manda a
// arreglar algo que no está roto.
//
// 🔴 No se gatea con el interruptor a propósito, igual que el de Instagram: el
// `state` va firmado y caduca a los 10 minutos, así que solo se llega hasta acá
// pasando antes por `conectar`, que sí está gateado.
router.get('/facebook/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  let negocioId = null;
  try { ({ negocioId } = decodificarState(state)); } catch { /* state ausente o manipulado */ }

  const volverA = (params) => res.redirect(
    `${FRONTEND_URL}${negocioId ? `/dashboard/negocios/${negocioId}` : '/dashboard'}?${params}`,
  );

  if (oauthError) return volverA(`fb_error=cancelado`);
  if (!code || !negocioId) return volverA('fb_error=state_invalido');

  try {
    const { data: tokenCorto } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: META_REDIRECT_URI_FB,
        code,
      },
    });

    // Token de larga duración: el corto vive una hora y el escaneo corre cada
    // pocas horas, así que sin este canje la conexión se caería sola el mismo día.
    const { data: tokenLargo } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: tokenCorto.access_token,
      },
    });

    const { data: paginas } = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: { fields: 'id,name,access_token', access_token: tokenLargo.access_token },
    });

    const lista = paginas.data || [];
    // El id de página puede venir elegido desde el panel (un negocio con varias
    // páginas); si no, se toma la primera, que es el caso normal.
    const elegida = req.query.page_id
      ? lista.find((p) => p.id === req.query.page_id)
      : lista[0];

    if (!elegida) {
      // Mismo diagnóstico que en Instagram y por el mismo motivo: «0 páginas» no
      // distingue entre no haber otorgado ninguna y un token de otro tipo. Sin
      // imprimir quién es `me` y qué permisos trae, esto se depura a ciegas
      // contra la interfaz de otra persona.
      let diagnostico = '';
      try {
        const [yo, permisos] = await Promise.all([
          axios.get('https://graph.facebook.com/v21.0/me', {
            params: { fields: 'id,name', access_token: tokenLargo.access_token },
          }),
          axios.get('https://graph.facebook.com/v21.0/me/permissions', {
            params: { access_token: tokenLargo.access_token },
          }),
        ]);
        const concedidos = (permisos.data.data || [])
          .filter((p) => p.status === 'granted').map((p) => p.permission).join(', ');
        diagnostico = ` | me = ${yo.data.name || '(sin nombre)'} [${yo.data.id}] | permisos: ${concedidos || 'NINGUNO'}`;
      } catch (e) {
        diagnostico = ` | diagnóstico no disponible: ${e.response?.data?.error?.message || e.message}`;
      }
      console.warn(`[Facebook OAuth] Sin páginas utilizables.${diagnostico}`);
      return volverA('fb_error=sin_paginas');
    }

    await prisma.negocio.update({
      where: { id: negocioId },
      data: {
        facebookPageId: elegida.id,
        // Token de PÁGINA, no de usuario: es el que `/{page-id}/ratings` acepta.
        facebookAccessToken: elegida.access_token,
        facebookTokenExpira: new Date(Date.now() + (tokenLargo.expires_in || 5184000) * 1000),
      },
    });

    await primerEscaneo(negocioId, 'Facebook');
    volverA('fb=conectado');
  } catch (error) {
    console.error('[Facebook OAuth] Error en callback:', error.response?.data?.error?.message || error.message);
    volverA('fb_error=callback_failed');
  }
});

router.use(autenticar);

// ── GET /api/redes/:negocioId/estado ──────────────────────
router.get('/:negocioId/estado', async (req, res, next) => {
  try {
    const negocio = await negocioDeLaCuenta(req, req.params.negocioId);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    res.json({
      instagram: {
        // Mientras los permisos sigan en acceso estándar esto es false para
        // todo el mundo salvo las cuentas de prueba (ver lib/instagramVisible).
        // El panel ESCONDE la fila entera cuando viene false: nada de
        // "próximamente", que invita a preguntar por una fecha que no tenemos.
        disponible: instagram.configurado() && instagramVisiblePara(req.cuenta),
        conectado: !!negocio.instagramAccessToken,
      },
      tiktok: {
        // La Accounts API es la conexión que ofrecemos hoy; la Display quedó de
        // respaldo. `disponible` mira la que se va a usar al pulsar Conectar.
        disponible: tiktokBiz.configurado() || tiktok.configurado(),
        conectado: !!(negocio.tiktokBizAccessToken || negocio.tiktokAccessToken),
        // Solo la Accounts API lee y responde comentarios. El panel lo usa para
        // no prometer algo que una conexión heredada de Display no puede dar.
        comentarios: !!negocio.tiktokBizAccessToken,
      },
      facebook: {
        // ⚠️ Esto decía `true` fijo y era una promesa falsa: no existía ninguna
        // ruta para conectar una página, así que `facebookPageId` no se llenaba
        // nunca. Ahora la ruta existe, pero sigue oculta hasta que Meta conceda
        // `pages_read_user_content` — mismo interruptor que Instagram.
        disponible: facebookVisiblePara(req.cuenta) && !!process.env.META_APP_ID,
        conectado: !!negocio.facebookPageId,
      },
    });
  } catch (error) { next(error); }
});

// ── POST /api/redes/:negocioId/instagram/conectar ────────
// Devuelve la URL del diálogo de autorización de Meta; el frontend navega a ella.
router.post('/:negocioId/instagram/conectar', permitir('conexiones'), async (req, res, next) => {
  try {
    if (!requierePlanPago(req, res)) return;
    const negocio = await negocioDeLaCuenta(req, req.params.negocioId);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    if (!instagram.configurado()) {
      return res.status(501).json({
        error: 'La integración con Instagram está en proceso de aprobación por Meta. Te avisaremos cuando esté disponible.',
        estado: 'PENDIENTE_APROBACION',
      });
    }

    // Credenciales hay, pero la función está oculta para este usuario: 404 y no
    // 403, igual que en menciones. No es que le falte permiso al usuario — es
    // que la función no existe todavía para él. El panel ya no muestra el botón;
    // esto cierra el camino de quien llegue a la URL a mano.
    if (!instagramVisiblePara(req.cuenta)) {
      return res.status(404).json({ error: 'Función no disponible' });
    }

    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: META_REDIRECT_URI,
      response_type: 'code',
      state: codificarState(negocio.id, req.cuenta.id),
    });
    // Facebook Login for Business (apps tipo Negocio) reemplaza el `scope`
    // suelto por una "Configuración" — un paquete de permisos creado en la
    // consola que se referencia por config_id. Si la variable está seteada se
    // manda config_id (y Meta IGNORA scope); si no, el scope clásico.
    //
    // ⚠️ `pages_manage_metadata` es el permiso que permite suscribir la página a
    // los webhooks (`/me/subscribed_apps`). Va aquí para el camino sin config_id,
    // pero cuando se usa config_id manda la Configuración de la consola: si el
    // permiso no está TAMBIÉN allí, el token no lo trae y la suscripción falla
    // en silencio (la conexión funciona, los webhooks no llegan nunca).
    if (process.env.META_LOGIN_CONFIG_ID) {
      params.set('config_id', process.env.META_LOGIN_CONFIG_ID);
    } else {
      params.set('scope', 'instagram_basic,instagram_manage_comments,pages_show_list,pages_read_engagement,pages_manage_metadata');
    }

    res.json({ url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}` });
  } catch (error) { next(error); }
});

// ── POST /api/redes/:negocioId/facebook/conectar ─────────
//
// ⚠️ El scope pide **`pages_read_user_content`**, no `pages_read_engagement`.
// Esa confusión duró meses: `pages_read_engagement` cubre publicaciones y
// métricas, y `/{page-id}/ratings` —las reseñas— exige el otro. Con el permiso
// equivocado la conexión funcionaría y las reseñas llegarían siempre vacías, sin
// un solo error. Ver `docs/app-review-meta.md` §8.
router.post('/:negocioId/facebook/conectar', permitir('conexiones'), async (req, res, next) => {
  try {
    if (!requierePlanPago(req, res)) return;
    const negocio = await negocioDeLaCuenta(req, req.params.negocioId);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return res.status(501).json({
        error: 'La integración con Facebook está en proceso de aprobación por Meta. Te avisaremos cuando esté disponible.',
        estado: 'PENDIENTE_APROBACION',
      });
    }

    // 404 y no 403, igual que Instagram: al usuario no le falta un permiso, es
    // que la función todavía no existe para él.
    if (!facebookVisiblePara(req.cuenta)) {
      return res.status(404).json({ error: 'Función no disponible' });
    }

    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: META_REDIRECT_URI_FB,
      response_type: 'code',
      state: codificarState(negocio.id, req.cuenta.id),
      scope: 'pages_show_list,pages_read_user_content',
    });

    res.json({ url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}` });
  } catch (error) { next(error); }
});

// ── POST /api/redes/:negocioId/tiktok/conectar ────────────
router.post('/:negocioId/tiktok/conectar', permitir('conexiones'), async (req, res, next) => {
  try {
    if (!requierePlanPago(req, res)) return;
    const negocio = await negocioDeLaCuenta(req, req.params.negocioId);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    // Ruta preferente: TikTok Accounts API (§15-octies). Cubre todo lo que hace
    // la Display API y además comentarios, así que si hay credenciales de
    // Business se conecta por ahí y el usuario autoriza UNA sola vez.
    //
    // Los scopes van fijos en el código y NO por variable de entorno, al revés
    // que en la Display API. La razón: esta lista se verificó permiso por
    // permiso contra TikTok el 2026-08-06 y un valor equivocado rompe TODA la
    // autorización con `invalid_scope`, sin decir cuál sobra. Dejarla suelta en
    // Railway invita justo a esa clase de error.
    //   · `comment.create` NO EXISTE — el permiso para responder es
    //     `comment.list.manage`. Ese fue el que hacía fallar la autorización.
    //   · `user.info.profile` es obligatorio o `/business/get/` responde 40130.
    if (tiktokBiz.configurado()) {
      const params = new URLSearchParams({
        client_key: process.env.TIKTOK_BIZ_CLIENT_ID,
        redirect_uri: TIKTOK_BIZ_REDIRECT_URI,
        response_type: 'code',
        state: codificarState(negocio.id, req.cuenta.id),
        // `user.info.stats` NO es opcional aunque no mostremos seguidores:
        // `/business/get/` responde 40130 sin él, incluso pidiendo solo
        // `display_name` (comprobado el 2026-08-06 comparando dos tokens que
        // solo diferían en ese scope). Sin esto la cuenta se conecta bien pero
        // el panel se queda con el avatar genérico.
        scope: 'user.info.basic,user.info.profile,user.info.stats,video.list,comment.list,comment.list.manage',
      });
      return res.json({ url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}` });
    }

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
      state: codificarState(negocio.id, req.cuenta.id),
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
    // Las DOS conexiones se borran juntas: para el usuario "TikTok" es una sola
    // cosa, y dejar viva la mitad haría que el panel siguiera diciendo
    // "conectado" después de pulsar Eliminar conexión.
    'tiktokBizId', 'tiktokBizAccessToken', 'tiktokBizRefreshToken', 'tiktokBizTokenExpira',
    // El perfil cacheado también se va: si mañana se conecta OTRA cuenta, dejarlo
    // haría que el panel muestre el nombre y el avatar de la anterior.
    'tiktokNombre', 'tiktokAvatar', 'tiktokUsername', 'tiktokPerfilUrl',
  ],
  instagram: ['instagramUserId', 'instagramAccessToken', 'instagramTokenExpira'],
  facebook: ['facebookPageId', 'facebookAccessToken', 'facebookTokenExpira'],
};

router.delete('/:negocioId/:red', permitir('conexiones'), async (req, res, next) => {
  try {
    const { red } = req.params;
    const campos = REDES_DESCONECTABLES[red];
    if (!campos) return res.status(400).json({ error: `No se puede desconectar "${red}" desde aquí.` });

    const negocio = await negocioDeLaCuenta(req, req.params.negocioId);
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
            usuarioId: req.cuenta.id,
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

    // Lo mismo para la conexión de la Accounts API, con idéntico cuidado: la
    // revocación es global a la cuenta, así que solo se revoca si ningún otro
    // negocio del usuario comparte ese refresh token.
    if (red === 'tiktok' && negocio.tiktokBizAccessToken) {
      const otrosBiz = negocio.tiktokBizRefreshToken
        ? await prisma.negocio.count({
          where: {
            id: { not: negocio.id },
            usuarioId: req.cuenta.id,
            tiktokBizRefreshToken: negocio.tiktokBizRefreshToken,
          },
        })
        : 0;
      if (otrosBiz === 0) {
        const r = await tiktokBiz.revocarTokenTikTokBiz(negocio.tiktokBizAccessToken);
        revocado = revocado || !!r.ok;
        if (r.error) console.warn(`[TikTok Biz] No se pudo revocar el token de ${negocio.nombre}: ${r.error}`);
      }
    }

    // Retirar la suscripción a los webhooks ANTES de borrar el token: después
    // no habría con qué llamar a Meta y la página se quedaría mandando eventos
    // de un negocio que ya no está en Notoria. Igual que en TikTok, solo se
    // retira si ningún otro negocio del usuario sigue usando esa cuenta: la
    // suscripción es de la página, no del negocio, y quitarla tumbaría los
    // webhooks de los demás.
    if (red === 'instagram' && negocio.instagramAccessToken) {
      const otrosIg = await prisma.negocio.count({
        where: {
          id: { not: negocio.id },
          usuarioId: req.cuenta.id,
          instagramUserId: negocio.instagramUserId,
        },
      });
      if (otrosIg === 0) {
        const r = await instagram.desuscribirWebhookInstagram(negocio.instagramAccessToken);
        if (r.error) console.warn(`[Instagram] No se pudo retirar el webhook de ${negocio.nombre}: ${r.error}`);
      }
    }

    await prisma.negocio.update({
      where: { id: negocio.id },
      data: Object.fromEntries(campos.map((c) => [c, null])),
    });

    // Y el CONTENIDO que trajo esa cuenta. El perfil cacheado ya se borraba (ver
    // REDES_DESCONECTABLES) justo por esto: si mañana se conecta otra cuenta, lo
    // viejo se mezcla con lo nuevo. Faltaba aplicar el mismo criterio a lo que
    // de verdad importa.
    //
    // Y hay una razón más fuerte que la cosmética: comentarios y menciones son
    // **datos personales de terceros** —su @usuario y lo que escribieron— que
    // Notoria solo puede tener mientras el negocio mantenga la conexión que dio
    // acceso a ellos. Al retirarla, conservarlos sería guardar datos de gente
    // que nunca trató con nosotros, con el consentimiento ya revocado. Es
    // exactamente lo que mira un revisor de permisos, el mismo motivo por el que
    // arriba se retira la suscripción al webhook.
    //
    // Se asume el coste: quien desconecte y vuelva a conectar LA MISMA cuenta
    // pierde el historial. Se recupera solo en el siguiente escaneo dentro de la
    // ventana de publicaciones recientes, y las respuestas ya publicadas siguen
    // en la plataforma, que es donde viven de verdad.
    const PLATAFORMA = { tiktok: 'TIKTOK', instagram: 'INSTAGRAM' }[red];
    const [coms, menciones, alertas] = await prisma.$transaction([
      prisma.comentarioSocial.deleteMany({ where: { negocioId: negocio.id, plataforma: PLATAFORMA } }),
      prisma.mencion.deleteMany({ where: { negocioId: negocio.id, plataforma: PLATAFORMA } }),
      // Acotado por tipo a propósito: el enum `Plataforma` lo comparten otras
      // alertas, y un filtro solo por plataforma podría llevarse alguna que no
      // venga de esta conexión.
      prisma.alerta.deleteMany({
        where: {
          negocioId: negocio.id,
          plataforma: PLATAFORMA,
          tipo: { in: ['COMENTARIO_NEGATIVO', 'MENCION_NEGATIVA'] },
        },
      }),
    ]);

    console.log(`[Redes] ${red} desconectado de ${negocio.nombre}${revocado ? ' (token revocado en la plataforma)' : ''}`
      + ` — borrados ${coms.count} comentario(s), ${menciones.count} mención(es), ${alertas.count} alerta(s)`);
    res.json({
      mensaje: 'Conexión eliminada',
      red,
      revocado,
      // Se devuelve para que el panel pueda decir QUÉ se borró: "conexión
      // eliminada" a secas no deja claro que también se fue el historial.
      borrado: { comentarios: coms.count, menciones: menciones.count, alertas: alertas.count },
    });
  } catch (error) { next(error); }
});

module.exports = router;
