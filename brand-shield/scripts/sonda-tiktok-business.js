// Sonda de la TikTok API for Business (Accounts API) — CLAUDE.md §15-sexies.
//
// Método deliberado (la lección de §15-bis): antes de escribir una sola línea
// del scraper, se golpea la API REAL y se vuelca la respuesta cruda. El código
// se escribe DESPUÉS, contra formas verificadas, nunca contra las que uno supone.
//
// Correr desde brand-shield/:
//   node scripts/sonda-tiktok-business.js credenciales
//       → valida TIKTOK_BIZ_CLIENT_ID/SECRET sin autorizar nada.
//   node scripts/sonda-tiktok-business.js url
//       → imprime la URL de consentimiento para abrir en el navegador.
//   node scripts/sonda-tiktok-business.js code <AUTH_CODE>
//       → canjea el código por tokens y vuelca la respuesta cruda.
//   node scripts/sonda-tiktok-business.js api <ACCESS_TOKEN> [BUSINESS_ID]
//       → llama a business/get, business/video/list y business/comment/list.
//
// Las credenciales salen del entorno; este archivo NUNCA las contiene.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const CLIENT_ID = process.env.TIKTOK_BIZ_CLIENT_ID;
const CLIENT_SECRET = process.env.TIKTOK_BIZ_CLIENT_SECRET;
const REDIRECT_URI = process.env.TIKTOK_BIZ_REDIRECT_URI
  || 'https://api.usenotoria.app/api/redes/tiktok-business/callback';

const volcar = (etiqueta, dato) => {
  console.log(`\n─── ${etiqueta} ${'─'.repeat(Math.max(0, 56 - etiqueta.length))}`);
  console.log(JSON.stringify(dato, null, 2));
};

const exigirCredenciales = () => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('\n✖ Faltan TIKTOK_BIZ_CLIENT_ID y/o TIKTOK_BIZ_CLIENT_SECRET.\n');
    process.exit(1);
  }
};

// El endpoint contesta los errores en el CUERPO y a menudo con HTTP 200 — igual
// que el OAuth de la Display API. Por eso todo se vuelca, no se confía en catch.
const postar = async (ruta, cuerpo, cabeceras = {}) => {
  try {
    const { data, status } = await axios.post(`${BASE}${ruta}`, cuerpo, {
      headers: { 'Content-Type': 'application/json', ...cabeceras },
      timeout: 15000,
      validateStatus: () => true,
    });
    return { status, data };
  } catch (error) {
    return { status: null, data: error.response?.data || { mensaje: error.message } };
  }
};

const obtener = async (ruta, params, cabeceras = {}) => {
  try {
    const { data, status } = await axios.get(`${BASE}${ruta}`, {
      params,
      headers: cabeceras,
      timeout: 15000,
      validateStatus: () => true,
    });
    return { status, data };
  } catch (error) {
    return { status: null, data: error.response?.data || { mensaje: error.message } };
  }
};

/**
 * Valida las credenciales SIN pasar por el consentimiento del usuario.
 *
 * Se manda un auth_code deliberadamente inválido. Lo que importa es de qué se
 * queja TikTok:
 *   · error sobre el CÓDIGO (40131 y parientes) → app_id y secret son correctos.
 *   · 40113 "Invalid app id"                    → la credencial está mal.
 */
const validarCredenciales = async () => {
  exigirCredenciales();
  console.log(`app_id ...${CLIENT_ID.slice(-6)}   secret ...${CLIENT_SECRET.slice(-4)}`);
  console.log(`redirect_uri: ${REDIRECT_URI}`);

  const r = await postar('/tt_user/oauth2/token/', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    auth_code: 'codigo_invalido_a_proposito',
    redirect_uri: REDIRECT_URI,
  });
  volcar(`HTTP ${r.status} — tt_user/oauth2/token/`, r.data);

  const codigo = String(r.data?.code ?? '');
  if (codigo === '40113') console.log('\n✖ VEREDICTO: la app rechaza la credencial (Invalid app id).');
  else if (codigo === '0') console.log('\n⚠ VEREDICTO: aceptó un código falso. Revisar la respuesta a mano.');
  else console.log(`\n✔ VEREDICTO: credencial reconocida — el rechazo es del auth_code (code ${codigo}).`);
};

/**
 * URL de consentimiento.
 *
 * El `scope` se puede pasar como argumento para tantear cuál acepta la app:
 * TikTok responde "corrige lo siguiente: scope" ante cualquier valor que no
 * tenga concedido, sin decir CUÁL, así que se acota probando de a uno.
 * El valor especial `sin` omite el parámetro (algunos flujos de la Business API
 * infieren los permisos ya aprobados en el portal).
 */
const imprimirUrl = (scope) => {
  exigirCredenciales();
  const estado = `sonda_${Date.now()}`;
  // Conjunto verificado a mano el 2026-08-06 probando URL por URL en el navegador:
  // `comment.create` NO EXISTE en el vocabulario de TikTok y hace fallar toda la
  // autorización con `error=invalid_scope`. El permiso para RESPONDER se llama
  // `comment.list.manage`. Los otros tres se confirmaron uno a uno.
  const elegido = scope || process.env.TIKTOK_BIZ_SCOPES
    || 'user.info.basic,video.list,comment.list,comment.list.manage';
  const params = {
    client_key: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state: estado,
  };
  if (elegido !== 'sin') params.scope = elegido;
  console.log(`\nscope probado: ${elegido === 'sin' ? '(omitido)' : elegido}`);
  const url = `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams(params)}`;
  console.log('\nAbrir en el navegador, con la sesión de la cuenta Business iniciada:\n');
  console.log(url);
  console.log('\nDespués del consentimiento, TikTok redirige al callback (que todavía');
  console.log('no existe → dará error). Copiar el parámetro `code` de la barra de');
  console.log('direcciones y correr:  node scripts/sonda-tiktok-business.js code <CODE>');
  console.log('\n⚠ El auth_code caduca en ~10 minutos. No dejarlo enfriando.');
};

const canjearCodigo = async (authCode) => {
  exigirCredenciales();
  if (!authCode) { console.error('✖ Falta el auth_code.'); process.exit(1); }
  const r = await postar('/tt_user/oauth2/token/', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    auth_code: authCode,
    redirect_uri: REDIRECT_URI,
  });
  volcar(`HTTP ${r.status} — canje de auth_code`, r.data);
};

/**
 * Los tres endpoints que sostienen la función. Se vuelca TODO crudo: los
 * nombres de campo reales de esta respuesta son los que va a usar el scraper.
 */
const probarApi = async (accessToken, businessId) => {
  if (!accessToken) { console.error('✖ Falta el access token.'); process.exit(1); }
  const cab = { 'Access-Token': accessToken };

  // Nombres de campo dictados por la propia API (error 40002 los enumera todos).
  // Ojo: es `videos_count`, no `video_count`.
  //
  // Se prueba de menor a mayor: pedir campos de estadísticas junto con los
  // básicos hace fallar TODA la llamada con 40130 si alguno cuelga de un
  // sub-permiso no concedido — el mismo comportamiento todo-o-nada que ya
  // documentamos para los `fields` de la Display API.
  const TIERS = {
    minimo: ['display_name', 'profile_image', 'username'],
    conPerfil: ['display_name', 'profile_image', 'username', 'profile_deep_link', 'videos_count'],
    conStats: ['display_name', 'username', 'followers_count', 'likes', 'profile_views', 'is_business_account'],
  };

  let perfil = { status: null, data: null };
  for (const [nombre, campos] of Object.entries(TIERS)) {
    const r = await obtener('/business/get/', {
      business_id: businessId,
      fields: JSON.stringify(campos),
    }, cab);
    volcar(`HTTP ${r.status} — business/get/ [${nombre}]`, r.data);
    if (r.data?.code === 0) perfil = r;
  }
  volcar(`HTTP ${perfil.status} — business/get/`, perfil.data);

  const bid = businessId || perfil.data?.data?.business_id;
  if (!bid) {
    console.log('\n✖ Sin business_id no se puede seguir. Sacarlo de la respuesta de arriba.');
    return;
  }

  // Acá el texto del post se llama `caption` (no `title`) y el contador de
  // comentarios es `comments` (no `comment_count`) — otra vez, dictado por 40002.
  const videos = await obtener('/business/video/list/', {
    business_id: bid,
    max_count: 10,
    fields: JSON.stringify([
      'item_id', 'create_time', 'caption', 'comments', 'likes', 'video_views',
      'share_url', 'thumbnail_url', 'embed_url', 'video_duration',
    ]),
  }, cab);
  volcar(`HTTP ${videos.status} — business/video/list/`, videos.data);

  const primerVideo = videos.data?.data?.videos?.[0];
  const itemId = primerVideo?.item_id || primerVideo?.id;
  if (!itemId) {
    console.log('\n⚠ Sin videos en la respuesta: no hay sobre qué pedir comentarios.');
    return;
  }

  const comentarios = await obtener('/business/comment/list/', {
    business_id: bid,
    video_id: itemId,
    max_count: 20,
  }, cab);
  volcar(`HTTP ${comentarios.status} — business/comment/list/ (video ${itemId})`, comentarios.data);
};

/**
 * Publica una respuesta REAL y pública en un comentario. Es la única acción de
 * la sonda que escribe: úsala solo con autorización explícita del dueño de la
 * cuenta. Se puede deshacer con /business/comment/delete/.
 */
const responder = async (accessToken, businessId, videoId, comentarioId, texto) => {
  if (!accessToken || !businessId || !videoId || !comentarioId || !texto) {
    console.error('✖ Uso: responder <TOKEN> <BUSINESS_ID> <VIDEO_ID> <COMMENT_ID> "<texto>"');
    process.exit(1);
  }
  const r = await postar('/business/comment/reply/create/', {
    business_id: businessId,
    video_id: videoId,
    comment_id: comentarioId,
    text: texto,
  }, { 'Access-Token': accessToken });
  volcar(`HTTP ${r.status} — business/comment/reply/create/`, r.data);
};

const [accion, ...resto] = process.argv.slice(2);
const acciones = {
  credenciales: validarCredenciales,
  url: async () => imprimirUrl(resto[0]),
  code: () => canjearCodigo(resto[0]),
  api: () => probarApi(resto[0], resto[1]),
  responder: () => responder(resto[0], resto[1], resto[2], resto[3], resto[4]),
};

if (!acciones[accion]) {
  console.error('\nUso: node scripts/sonda-tiktok-business.js <credenciales|url|code|api> [args]\n');
  process.exit(1);
}
acciones[accion]().catch((e) => { console.error(e); process.exit(1); });
