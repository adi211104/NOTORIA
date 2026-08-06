// brand-shield/src/scrapers/tiktokBusiness.scraper.js
// Perfil, videos y comentarios de la cuenta de TikTok del negocio, vía la
// TikTok API for Business (Accounts API). CLAUDE.md §15-octies.
//
// POR QUÉ EXISTE ESTE ARCHIVO EN VEZ DE ARREGLAR `tiktok.scraper.js`
// Son dos APIs distintas, con dos portales, dos apps y dos OAuth:
//   · Display API (`open.tiktokapis.com`)      → perfil y videos. SIN comentarios:
//     `/v2/comment/list/` devuelve 404 en HTML, o sea que la ruta no existe (§15-quinquies).
//   · Accounts API (`business-api.tiktok.com`) → perfil, videos, comentarios Y respuestas.
// Esta cubre todo lo que hace la otra, así que es la principal. `tiktok.scraper.js`
// se conserva como respaldo mientras no se confirme que la app de Business
// salió de Sandbox.
//
// TODO LO DE ACÁ ESTÁ VERIFICADO CONTRA LA API REAL el 2026-08-06 con la cuenta
// @usenotoria (§15-octies documenta las respuestas crudas). Es deliberado: la
// versión anterior de este circuito se escribió a ciegas contra un endpoint
// inexistente y las pruebas con mocks lo taparon durante meses (§15-bis).
//
// Particularidades que cuestan una tarde si no se saben:
//  · El header de autenticación es `Access-Token`, NO `Authorization: Bearer`.
//  · El `business_id` que piden todos los endpoints es el `open_id` del canje.
//  · Los errores vienen en el CUERPO con HTTP 200 y `code != 0`. El catch de
//    axios no alcanza: hay que mirar `data.code` siempre.
//  · `fields` va como JSON en la query, y pedir un campo no autorizado hace
//    fallar TODA la llamada con 40130 — no devuelve el resto.
//  · Los nombres no coinciden con los de la Display API: el texto del post es
//    `caption` (no `title`), los comentarios se cuentan en `comments` (no
//    `comment_count`) y los videos en `videos_count` (no `video_count`).

const axios = require('axios');

const API = 'https://business-api.tiktok.com/open_api/v1.3';

const configurado = () =>
  !!(process.env.TIKTOK_BIZ_CLIENT_ID && process.env.TIKTOK_BIZ_CLIENT_SECRET);

// Se piden solo los campos que alguna pantalla usa. `is_business_account`,
// `followers_count` y `profile_views` cuelgan de Brand Insights, que no está
// concedido: incluirlos rompe la llamada entera con 40130.
const CAMPOS_PERFIL = ['display_name', 'username', 'profile_image', 'profile_deep_link', 'videos_count'];
const CAMPOS_VIDEO = ['item_id', 'create_time', 'caption', 'comments', 'likes', 'video_views',
  'share_url', 'thumbnail_url', 'embed_url', 'video_duration'];

/**
 * Llamada a la Accounts API con el manejo de errores que esta API exige.
 *
 * Devuelve { datos } | { error, codigo, permanente }. `permanente` marca lo que
 * NO se arregla reintentando: el llamador debe pedirle al usuario que reconecte
 * en vez de reencolar el trabajo.
 */
const llamar = async (metodo, ruta, { params, cuerpo, accessToken }) => {
  try {
    // `axios.request(...)` y no `axios(...)`: son equivalentes, pero la forma de
    // método permite sustituirlo en las pruebas sin salir a la red. La forma
    // invocable es la propia función del módulo y no se puede reemplazar.
    const r = await axios.request({
      method: metodo,
      url: `${API}${ruta}`,
      params,
      data: cuerpo,
      headers: { 'Access-Token': accessToken, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    // code 0 = OK. Cualquier otro valor es un error que llegó con HTTP 200.
    if (r.data?.code !== 0) {
      const codigo = r.data?.code;
      return {
        error: r.data?.message || `code ${codigo}`,
        codigo,
        // 40130 = scope no autorizado, 40100/40104 = token muerto. Ninguno se
        // resuelve reintentando; hace falta que el dueño vuelva a autorizar.
        permanente: [40130, 40100, 40104].includes(codigo),
      };
    }
    return { datos: r.data.data };
  } catch (error) {
    const cuerpoError = error.response?.data || {};
    return {
      error: cuerpoError.message || error.message,
      codigo: cuerpoError.code || null,
      permanente: false,
    };
  }
};

/**
 * Canjea el auth_code del OAuth por tokens.
 *
 * Ojo con el nombre del parámetro: es `client_id`, no `app_id` como dicen
 * muchos ejemplos que circulan. Y el `redirect_uri` tiene que coincidir
 * exactamente con el declarado en el portal, o TikTok rechaza el canje.
 *
 * Devuelve { businessId, accessToken, refreshToken, expiraEn, scopes } | { error }
 */
const canjearCodigoTikTokBiz = async (authCode, redirectUri) => {
  if (!configurado() || !authCode) return { error: 'sin_credenciales' };
  const r = await llamar('post', '/tt_user/oauth2/token/', {
    cuerpo: {
      client_id: process.env.TIKTOK_BIZ_CLIENT_ID,
      client_secret: process.env.TIKTOK_BIZ_CLIENT_SECRET,
      grant_type: 'authorization_code',
      auth_code: authCode,
      redirect_uri: redirectUri,
    },
  });
  if (r.error) return { error: r.error };
  return {
    // El open_id ES el business_id que piden el resto de los endpoints.
    businessId: r.datos.open_id,
    accessToken: r.datos.access_token,
    refreshToken: r.datos.refresh_token,
    expiraEn: new Date(Date.now() + (r.datos.expires_in || 86400) * 1000),
    scopes: r.datos.scope || null,
  };
};

/**
 * Renueva el access token (dura 24 h) con el refresh token (dura 365 días).
 *
 * Igual que en la Display API, TikTok **rota** el refresh token: el nuevo viene
 * en la respuesta y hay que persistirlo o el siguiente refresh falla (§15-quater).
 */
const refrescarTokenTikTokBiz = async (refreshToken) => {
  if (!configurado() || !refreshToken) return { error: 'sin_credenciales', permanente: false };
  const r = await llamar('post', '/tt_user/oauth2/refresh_token/', {
    cuerpo: {
      client_id: process.env.TIKTOK_BIZ_CLIENT_ID,
      client_secret: process.env.TIKTOK_BIZ_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
  });
  if (r.error) return { error: r.error, permanente: r.permanente };
  return {
    accessToken: r.datos.access_token,
    // Si TikTok no mandara uno nuevo, se conserva el actual antes que perderlo.
    refreshToken: r.datos.refresh_token || refreshToken,
    expiraEn: new Date(Date.now() + (r.datos.expires_in || 86400) * 1000),
    scopes: r.datos.scope || null,
  };
};

/**
 * Revoca el acceso del lado de TikTok.
 *
 * Borrar el token de nuestra base deja la cuenta desconectada en Notoria, pero
 * del lado de TikTok la autorización sigue viva: la app le sigue apareciendo al
 * usuario en sus apps conectadas y el siguiente OAuth se saltea la pantalla de
 * consentimiento. Revocar cierra el círculo, que es lo que uno espera al pulsar
 * "Eliminar conexión".
 *
 * La ruta se verificó el 2026-08-06 con el método de §15-sexies (golpearla con
 * credenciales basura): responde `40131 Access token is invalid`, o sea que
 * existe y valida el cuerpo tal como se manda acá. Las otras candidatas
 * (`/tt_user/oauth2/token/revoke/`, `/business/revoke/`) devuelven 404 y
 * `40006 no schema found`: no existen.
 *
 * Es best-effort a propósito: si TikTok falla, igual limpiamos nuestros tokens.
 * Negarse a desconectar porque un tercero no contesta deja al usuario atrapado.
 */
const revocarTokenTikTokBiz = async (accessToken) => {
  if (!configurado() || !accessToken) return { error: 'sin_credenciales' };
  const r = await llamar('post', '/tt_user/oauth2/revoke/', {
    cuerpo: {
      client_id: process.env.TIKTOK_BIZ_CLIENT_ID,
      client_secret: process.env.TIKTOK_BIZ_CLIENT_SECRET,
      access_token: accessToken,
    },
  });
  if (r.error) return { error: r.error };
  return { ok: true };
};

/**
 * Perfil de la cuenta conectada. Devuelve null si no se pudo leer.
 */
const obtenerPerfilTikTokBiz = async (businessId, accessToken) => {
  if (!configurado() || !businessId || !accessToken) return null;
  const r = await llamar('get', '/business/get/', {
    accessToken,
    params: { business_id: businessId, fields: JSON.stringify(CAMPOS_PERFIL) },
  });
  if (r.error) {
    console.warn(`[TikTok Biz] No se pudo leer el perfil: ${r.error}`);
    return null;
  }
  const p = r.datos || {};
  return {
    businessId,
    nombre: p.display_name || null,
    username: p.username || null,
    avatar: p.profile_image || null,
    url: p.profile_deep_link || null,
    totalVideos: p.videos_count ?? null,
  };
};

/**
 * Últimos videos publicados por la cuenta.
 *
 * Devuelve [] si no hay videos y null si no se pudo leer — la misma distinción
 * que el resto de los scrapers, porque el worker las trata distinto.
 *
 * ⚠️ TikTok solo devuelve videos PÚBLICOS. Los publicados como "Amigos" o
 * "Solo yo" son invisibles para cualquier app, aunque la cuenta las haya
 * autorizado. Verificado el 2026-08-06: un video en "Amigos" devuelve
 * `videos: []` con `code: 0`, indistinguible de una cuenta vacía.
 */
const obtenerVideosTikTokBiz = async (businessId, accessToken, limite = 10) => {
  if (!configurado() || !businessId || !accessToken) return null;
  const r = await llamar('get', '/business/video/list/', {
    accessToken,
    params: { business_id: businessId, max_count: limite, fields: JSON.stringify(CAMPOS_VIDEO) },
  });
  if (r.error) {
    console.warn(`[TikTok Biz] No se pudieron leer los videos: ${r.error}`);
    return null;
  }
  return (r.datos?.videos || []).map((v) => ({
    id: v.item_id,
    // El texto que el usuario reconoce es el pie del post.
    titulo: (v.caption || '').slice(0, 200),
    // `create_time` viene como STRING de segundos epoch, no como número.
    fecha: v.create_time ? new Date(Number(v.create_time) * 1000) : null,
    duracion: v.video_duration ?? null,
    comentarios: v.comments ?? null,
    likes: v.likes ?? null,
    vistas: v.video_views ?? null,
    url: v.share_url || null,
    // ⚠️ Portada FIRMADA que caduca (`x-expires` en la query). Por eso los
    // videos se piden en vivo y no se guardan: una miniatura cacheada se rompe.
    portada: v.thumbnail_url || null,
    embed: v.embed_url || null,
  }));
};

/**
 * Comentarios de los últimos videos, ya normalizados para `ComentarioSocial`.
 *
 * El try va POR VIDEO a propósito: si uno falla, se pierden sus comentarios y
 * no los del lote entero. Antes un solo rechazo abortaba todo el escaneo.
 */
const obtenerComentariosTikTokBiz = async (businessId, accessToken, limiteVideos = 10) => {
  if (!configurado() || !businessId || !accessToken) return null;

  const videos = await obtenerVideosTikTokBiz(businessId, accessToken, limiteVideos);
  if (!videos) return null;

  const comentarios = [];
  let fallos = 0;

  for (const video of videos) {
    // Sin comentarios no vale la pena gastar una llamada.
    if (video.comentarios === 0) continue;

    const r = await llamar('get', '/business/comment/list/', {
      accessToken,
      params: { business_id: businessId, video_id: video.id, max_count: 30 },
    });
    if (r.error) {
      fallos++;
      if (fallos === 1) console.warn(`[TikTok Biz] Comentarios del video ${video.id}: ${r.error}`);
      continue;
    }

    for (const c of r.datos?.comments || []) {
      // Los comentarios del propio negocio no son feedback de nadie: son sus
      // respuestas. Guardarlos los metería en la cola de "por responder" y
      // dispararía alertas por lo que el dueño escribió él mismo.
      if (c.owner) continue;

      // Solo se pide el hilo cuando hay respuestas: es una llamada extra por
      // comentario y la inmensa mayoría no tiene ninguna.
      const respuestaDueno = c.replies > 0
        ? await obtenerRespuestaDelDueno(businessId, accessToken, video.id, c.comment_id)
        : null;

      comentarios.push({
        // El prefijo evita colisiones de id entre plataformas en `externalId`,
        // que es único a nivel de tabla.
        externalId: `ttb_${c.comment_id}`,
        texto: c.text,
        autorNombre: c.display_name || c.username || 'Usuario TikTok',
        autorAvatar: c.profile_image || null,
        fechaComentario: c.create_time ? new Date(Number(c.create_time) * 1000) : null,
        videoId: video.id,
        videoTitulo: video.titulo,
        likes: c.likes ?? 0,
        fijado: !!c.pinned,
        // `status` viene 'PUBLIC' cuando se ve y cambia al ocultarlo. Se compara
        // contra PUBLIC y no contra un valor de "oculto" concreto porque solo
        // se observó PUBLIC en vivo: cualquier otro estado lo tratamos como no
        // visible, que es la lectura segura.
        oculto: !!c.status && c.status !== 'PUBLIC',
        respuestas: c.replies ?? 0,
        // null = el dueño no ha respondido. { texto, id } = ya respondió (desde
        // acá o desde la app de TikTok), y el worker lo marca como respondido.
        // El id se guarda para poder borrar esa respuesta más adelante.
        respuestaDueno: respuestaDueno?.texto || null,
        respuestaDuenoId: respuestaDueno?.id || null,
      });
    }
  }

  if (fallos) console.warn(`[TikTok Biz] ${fallos} video(s) sin comentarios accesibles de ${videos.length}.`);
  return comentarios;
};

/**
 * ¿El dueño de la cuenta ya respondió este comentario? Devuelve el texto de su
 * respuesta, o null si no respondió (o no se pudo comprobar).
 *
 * Por qué importa: el dueño puede responder desde la app de TikTok, y sin esto
 * Notoria seguiría mostrando el comentario como pendiente para siempre. Como la
 * métrica que vende el producto es el tiempo de respuesta, un pendiente falso
 * ensucia justo el dato que el cliente mira.
 *
 * `replies` cuenta TODAS las respuestas, vengan de quien vengan, así que no
 * alcanza con mirar ese número: hay que pedir el hilo y buscar `owner: true`.
 * Verificado contra la API real el 2026-08-06.
 *
 * Devuelve { texto, id } | null. El `id` hace falta para poder BORRAR esa
 * respuesta después: es el único identificador con el que TikTok la reconoce.
 */
const obtenerRespuestaDelDueno = async (businessId, accessToken, videoId, comentarioId) => {
  const r = await llamar('get', '/business/comment/reply/list/', {
    accessToken,
    params: {
      business_id: businessId,
      video_id: videoId,
      comment_id: String(comentarioId).replace(/^ttb_/, ''),
      max_count: 30,
    },
  });
  if (r.error) return null;
  const propia = (r.datos?.comments || []).find((c) => c.owner);
  return propia ? { texto: propia.text, id: propia.comment_id } : null;
};

/**
 * Borra un comentario. Se usa para que el dueño pueda retirar UNA RESPUESTA SUYA
 * —se equivocó, quiere reescribirla— que es el caso legítimo y sin víctimas.
 *
 * Dos diferencias con las acciones de moderación, ambas verificadas probando:
 *  · NO pide `video_id`, solo `business_id` + `comment_id`.
 *  · El `comment_id` va como STRING numérico. Los mensajes de error de la API se
 *    contradicen —con un id no numérico dice "expected int"— pero mandarlo como
 *    número lo rechaza con "Field must be set to string". Y menos mal: los ids
 *    de TikTok superan el entero seguro de JavaScript, así que convertirlos a
 *    número perdería precisión y podría apuntar a otro comentario.
 */
const eliminarComentarioTikTokBiz = async (businessId, accessToken, comentarioId) => {
  if (!configurado()) return { error: 'TikTok no está configurado.' };
  if (!comentarioId) return { error: 'Falta el identificador del comentario.' };
  const r = await llamar('post', '/business/comment/delete/', {
    accessToken,
    cuerpo: {
      business_id: businessId,
      comment_id: String(comentarioId).replace(/^ttb_/, ''),
    },
  });
  if (r.error) return { error: r.error };
  return { ok: true };
};

/**
 * Publica una respuesta a un comentario. Devuelve { ok, id } | { error }.
 */
const responderComentarioTikTokBiz = async (businessId, accessToken, videoId, comentarioId, texto) => {
  if (!configurado()) return { error: 'TikTok no está configurado.' };
  const r = await llamar('post', '/business/comment/reply/create/', {
    accessToken,
    cuerpo: {
      business_id: businessId,
      video_id: videoId,
      // El prefijo es nuestro, TikTok no lo conoce.
      comment_id: String(comentarioId).replace(/^ttb_/, ''),
      text: texto,
    },
  });
  if (r.error) return { error: r.error };
  return { ok: true, id: r.datos?.comment_id };
};

/**
 * Acciones de moderación sobre un comentario. Las tres comparten exactamente la
 * misma forma de request, verificada contra la API real el 2026-08-06:
 *
 *   ruta                      acciones válidas
 *   /business/comment/hide/   HIDE   · UNHIDE
 *   /business/comment/pin/    PIN    · UNPIN
 *   /business/comment/like/   LIKE   · UNLIKE
 *
 * ⚠️ `video_id` es OBLIGATORIO en las tres, aunque el comment_id ya identifique
 * el comentario sin ambigüedad. Omitirlo da `40002 video_id: Missing data for
 * required field` — la primera versión de este código lo omitía.
 *
 * Qué hace cada una, y por qué están las tres:
 *  · ocultar — quita el comentario de la vista pública SIN borrarlo; su autor
 *    lo sigue viendo y no se entera. Es la respuesta correcta a un comentario
 *    tóxico: borrar es más agresivo y suele escalar el conflicto.
 *  · fijar — sube la conversación que el negocio quiere que se lea primero.
 *  · like — reconocer un comentario positivo sin escribir nada.
 */
const ACCIONES_MODERACION = {
  ocultar:   { ruta: '/business/comment/hide/', si: 'HIDE', no: 'UNHIDE' },
  fijar:     { ruta: '/business/comment/pin/',  si: 'PIN',  no: 'UNPIN' },
  like:      { ruta: '/business/comment/like/', si: 'LIKE', no: 'UNLIKE' },
};

const moderarComentarioTikTokBiz = async (accion, businessId, accessToken, videoId, comentarioId, activar = true) => {
  const cfg = ACCIONES_MODERACION[accion];
  if (!cfg) return { error: `Acción de moderación desconocida: ${accion}` };
  if (!configurado()) return { error: 'TikTok no está configurado.' };
  if (!videoId) return { error: 'Falta el video de origen del comentario.' };

  const r = await llamar('post', cfg.ruta, {
    accessToken,
    cuerpo: {
      business_id: businessId,
      video_id: videoId,
      comment_id: String(comentarioId).replace(/^ttb_/, ''),
      action: activar ? cfg.si : cfg.no,
    },
  });
  if (r.error) return { error: r.error };
  return { ok: true };
};

module.exports = {
  canjearCodigoTikTokBiz,
  refrescarTokenTikTokBiz,
  revocarTokenTikTokBiz,
  obtenerPerfilTikTokBiz,
  obtenerVideosTikTokBiz,
  obtenerComentariosTikTokBiz,
  obtenerRespuestaDelDueno,
  responderComentarioTikTokBiz,
  eliminarComentarioTikTokBiz,
  moderarComentarioTikTokBiz,
  ACCIONES_MODERACION,
  configurado,
};
