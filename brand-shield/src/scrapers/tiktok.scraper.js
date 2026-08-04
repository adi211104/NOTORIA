// brand-shield/src/scrapers/tiktok.scraper.js
// Perfil, videos y (a futuro) comentarios de la cuenta de TikTok del negocio.
//
// ESTADO (2026-07-30, comprobado en vivo contra la API con la cuenta @adipri):
//  · user.info.basic  ✔ funciona — nombre y foto de la cuenta
//  · video.list       ✔ funciona — lista los videos propios con comment_count
//  · comentarios      ✖ NO es un permiso pendiente: `/v2/comment/list/` y
//    `/v2/comment/reply/create/` devuelven **404 en HTML**, o sea que esas rutas
//    no existen en la Display API. Leer y responder comentarios se hace con la
//    TikTok API for Business (business-api.tiktok.com/open_api/v1.3/business/
//    comment/list/, que sí responde: rechaza esta app con `40113 Invalid app id`).
//    Eso exige registrar la app en OTRO portal, con su propio OAuth y una cuenta
//    Business. Ver CLAUDE.md §15-quinquies antes de tocar esta parte.
//
// `obtenerComentariosTikTok` se deja tal cual: en cuanto haya un endpoint real,
// solo cambia la URL y el resto del circuito (dedupe, sentimiento, alertas,
// respuesta) ya está probado. Hoy devuelve los videos sin comentarios.

const axios = require('axios');

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

const configurado = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);

/**
 * Renueva el access token con el refresh token.
 *
 * Por qué existe: el access token de TikTok dura 24 HORAS (`expires_in` 86400).
 * Sin esto, la cuenta se conectaba, funcionaba un día y al siguiente TODAS las
 * llamadas devolvían `access_token_invalid` en silencio — el panel seguía
 * diciendo "escuchando esta cuenta" mientras el escaneo traía cero. El refresh
 * token dura 365 días y se renueva sin pedirle nada al usuario.
 *
 * Dos particularidades del endpoint de OAuth de TikTok:
 *  · devuelve los errores en el CUERPO (`{ error, error_description }`) y a
 *    veces con HTTP 200, así que no alcanza con el catch de axios.
 *  · ROTA el refresh token: el nuevo viene en la respuesta y hay que guardarlo,
 *    o el próximo refresh falla.
 *
 * Devuelve { accessToken, refreshToken, expiraEn, scopes } | { error, permanente }
 */
const refrescarTokenTikTok = async (refreshToken) => {
  if (!configurado() || !refreshToken) return { error: 'sin_credenciales', permanente: false };
  try {
    const { data } = await axios.post(`${TIKTOK_API}/oauth/token/`,
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (data.error || !data.access_token) {
      // invalid_grant = el refresh token ya no sirve (revocado, vencido o
      // rotado). Eso NO se arregla reintentando: el usuario tiene que volver a
      // pasar por el diálogo de TikTok. Cualquier otro error puede ser temporal.
      const codigo = data.error || 'sin_access_token';
      return { error: data.error_description || codigo, permanente: codigo === 'invalid_grant' };
    }

    return {
      accessToken: data.access_token,
      // Si TikTok no mandara uno nuevo, se conserva el actual antes que perderlo.
      refreshToken: data.refresh_token || refreshToken,
      expiraEn: new Date(Date.now() + (data.expires_in || 86400) * 1000),
      scopes: data.scope || null,
    };
  } catch (error) {
    const cuerpo = error.response?.data || {};
    const codigo = cuerpo.error || cuerpo.error?.code;
    return {
      error: cuerpo.error_description || cuerpo.error?.message || error.message,
      permanente: codigo === 'invalid_grant',
    };
  }
};

/**
 * Revoca el access token del lado de TikTok.
 *
 * Borrar el token de nuestra base deja la cuenta desconectada en Notoria, pero
 * del lado de TikTok la autorización sigue viva: la app le sigue apareciendo al
 * usuario en sus "apps conectadas" y el siguiente OAuth se saltea la pantalla de
 * consentimiento. Revocar cierra el círculo, que es lo que uno espera al pulsar
 * "Eliminar conexión".
 *
 * Es best-effort a propósito: si TikTok falla, igual limpiamos nuestros tokens.
 * Lo contrario —negarse a desconectar porque TikTok no contesta— dejaría al
 * usuario atrapado en una conexión que quiere borrar.
 *
 * Devuelve { ok: true } | { error }
 */
const revocarTokenTikTok = async (accessToken) => {
  if (!configurado() || !accessToken) return { error: 'sin_credenciales' };
  try {
    const { data } = await axios.post(`${TIKTOK_API}/oauth/revoke/`,
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        token: accessToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );
    // Igual que el resto del OAuth de TikTok: los errores vienen en el CUERPO y
    // a veces con HTTP 200, así que no alcanza con el catch de axios.
    if (data?.error) return { error: data.error_description || data.error };
    return { ok: true };
  } catch (error) {
    const cuerpo = error.response?.data || {};
    return { error: cuerpo.error_description || cuerpo.error || error.message };
  }
};

/**
 * Perfil de la cuenta conectada — nombre visible y foto.
 *
 * Los campos que se piden dependen del scope, y pedir uno no autorizado hace
 * fallar TODA la llamada (mismo comportamiento que con los scopes del OAuth):
 *   user.info.basic   → display_name, avatar_url   ← lo que hay hoy
 *   user.info.profile → username (el @), profile_deep_link
 * Por eso los campos extra se agregan solo si TIKTOK_SCOPES los incluye.
 */
const obtenerPerfilTikTok = async (accessToken) => {
  if (!configurado() || !accessToken) return null;

  const scopes = process.env.TIKTOK_SCOPES || 'user.info.basic,video.list';
  const campos = ['open_id', 'display_name', 'avatar_url'];
  if (scopes.includes('user.info.profile')) campos.push('username', 'profile_deep_link');

  try {
    const { data } = await axios.get(`${TIKTOK_API}/user/info/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { fields: campos.join(',') },
    });
    const u = data.data?.user;
    if (!u) return null;
    return {
      openId: u.open_id || null,
      nombre: u.display_name || null,
      avatar: u.avatar_url || null,
      // Sin user.info.profile no hay @usuario; el panel muestra solo el nombre.
      username: u.username || null,
      url: u.profile_deep_link || null,
    };
  } catch (error) {
    console.warn(`[TikTok] No se pudo leer el perfil: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
};

/**
 * Últimos videos publicados por la cuenta.
 *
 * Es lo único que la Display API sí deja leer de las publicaciones propias
 * (§15-quinquies), y alcanza para que el negocio vea su actividad en el panel:
 * título, fecha, cuántos comentarios tiene cada video y el enlace para ir a
 * responder a TikTok mientras la lectura de comentarios no sea posible.
 *
 * Devuelve [] si la cuenta no tiene videos y null si no se pudo leer — la misma
 * distinción que el resto del scraper.
 */
const obtenerVideosTikTok = async (accessToken, limite = 10) => {
  if (!configurado() || !accessToken) return null;
  try {
    const { data } = await axios.post(`${TIKTOK_API}/video/list/`, { max_count: limite }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      params: {
        fields: 'id,title,video_description,create_time,duration,comment_count,like_count,view_count,share_url,cover_image_url,embed_link',
      },
    });
    return (data.data?.videos || []).map((v) => ({
      id: v.id,
      // `title` suele venir vacío en TikTok; el texto que el usuario reconoce es
      // la descripción del post.
      titulo: (v.title || v.video_description || '').slice(0, 200),
      fecha: v.create_time ? new Date(v.create_time * 1000) : null,
      duracion: v.duration ?? null,
      comentarios: v.comment_count ?? null,
      likes: v.like_count ?? null,
      vistas: v.view_count ?? null,
      url: v.share_url || null,
      // ⚠️ La portada es una URL FIRMADA que caduca (~24h, `x-expires` en la
      // query). Por eso los videos se piden en vivo y no se guardan en la BD:
      // una miniatura cacheada por más tiempo terminaría rota.
      portada: v.cover_image_url || null,
      // El player de TikTok responde sin `x-frame-options`, así que se puede
      // reproducir dentro del panel sin cargar su script de embed.
      embed: v.embed_link || null,
    }));
  } catch (error) {
    console.warn(`[TikTok] No se pudieron leer los videos: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
};

/**
 * Últimos videos con sus comentarios.
 * Devuelve [{ externalId, texto, autorNombre, fechaComentario, videoId, videoTitulo }]
 */
const obtenerComentariosTikTok = async (openId, accessToken) => {
  if (!configurado() || !openId || !accessToken) return null;
  try {
    const { data: videos } = await axios.post(`${TIKTOK_API}/video/list/`, { max_count: 10 }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      params: { fields: 'id,title' },
    });
    const comentarios = [];
    let fallosComentarios = 0;

    for (const video of videos.data?.videos || []) {
      // El try va POR VIDEO a propósito: si la cuenta no tiene el scope
      // comment.list aprobado, o un video puntual falla, se pierden los
      // comentarios de ese video y no los de todo el lote. Antes un solo
      // rechazo abortaba el escaneo entero y se perdía hasta la lista de videos.
      try {
        const { data: coms } = await axios.post(`${TIKTOK_API}/comment/list/`, { video_id: video.id, count: 20 }, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        for (const c of coms.data?.comments || []) {
          comentarios.push({
            externalId: `tt_${c.id}`,
            texto: c.text,
            autorNombre: c.username || c.user?.display_name || 'Usuario TikTok',
            fechaComentario: new Date((c.create_time || 0) * 1000),
            videoId: video.id,
            videoTitulo: (video.title || '').slice(0, 120),
          });
        }
      } catch (error) {
        fallosComentarios++;
        if (fallosComentarios === 1) {
          // Hoy esto es siempre un 404: la ruta no existe en la Display API
          // (ver la cabecera del archivo). Se registra igual por si algún día
          // TikTok la publica y el error pasa a ser otro.
          const http = error.response?.status;
          console.warn(`[TikTok] No se pudieron leer comentarios (HTTP ${http}${http === 404 ? ' — la Display API no expone comentarios' : ''}): ${error.response?.data?.error?.message || error.message}`);
        }
      }
    }

    if (fallosComentarios) {
      console.warn(`[TikTok] ${fallosComentarios} video(s) sin comentarios accesibles de ${videos.data?.videos?.length || 0}.`);
    }
    return comentarios;
  } catch (error) {
    console.error(`[TikTok] Error: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
};

/**
 * Responde un comentario de TikTok.
 */
const responderComentarioTikTok = async (videoId, comentarioId, mensaje, accessToken) => {
  if (!configurado()) return { error: 'TikTok no está configurado todavía (falta aprobación de TikTok).' };
  try {
    const { data } = await axios.post(`${TIKTOK_API}/comment/reply/create/`, {
      video_id: videoId,
      comment_id: comentarioId.replace(/^tt_/, ''),
      text: mensaje,
    }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    return { ok: true, id: data.data?.comment_id };
  } catch (error) {
    return { error: error.response?.data?.error?.message || error.message };
  }
};

module.exports = {
  obtenerVideosTikTok,
  obtenerComentariosTikTok,
  responderComentarioTikTok,
  obtenerPerfilTikTok,
  refrescarTokenTikTok,
  revocarTokenTikTok,
  configurado,
};
