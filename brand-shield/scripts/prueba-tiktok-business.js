// Pruebas del scraper de la TikTok Accounts API, sin llamar a TikTok.
//
// QUÉ CUBRE Y QUÉ NO. El circuito real ya se verificó contra la API de verdad
// el 2026-08-06 (§15-octies): perfil, videos, lectura de comentarios y una
// respuesta publicada de verdad. Estas pruebas NO repiten eso — repetirlo con
// mocks sería justamente el error de §15-bis, donde unos mocks complacientes
// taparon durante meses que el endpoint no existía.
//
// Lo que sí cubren es la lógica NUESTRA, la que puede romperse en cualquier
// refactor sin que TikTok se entere:
//   · los errores llegan con HTTP 200 y `code != 0` — el catch de axios no los ve
//   · los comentarios propios (`owner`) no deben entrar en la cola de respuesta
//   · `create_time` viene como STRING de segundos, no como número
//   · el prefijo `ttb_` es nuestro y hay que quitarlo antes de hablar con TikTok
//   · el header es `Access-Token`, no `Authorization: Bearer`
//   · qué errores son permanentes (obligan a reconectar) y cuáles reintentables
//
// Correr:  node scripts/prueba-tiktok-business.js

const assert = require('assert');
const path = require('path');
const axios = require('axios');

// ── Doble de axios ────────────────────────────────────────
// El scraper usa `axios.request({...})`, así que se sustituye ese método.
let respuestasFalsas = {};
let requests = [];

axios.request = async (config) => {
  requests.push(config);
  for (const [fragmento, handler] of Object.entries(respuestasFalsas)) {
    if (config.url.includes(fragmento)) {
      if (handler instanceof Error) throw handler;
      return { data: handler };
    }
  }
  throw new Error(`Sin respuesta falsa configurada para ${config.url}`);
};

process.env.TIKTOK_BIZ_CLIENT_ID = 'app-de-prueba';
process.env.TIKTOK_BIZ_CLIENT_SECRET = 'secreto-de-prueba';

const tk = require(path.join(__dirname, '..', 'src', 'scrapers', 'tiktokBusiness.scraper'));

let fallos = 0;
const prueba = async (nombre, fn) => {
  requests = [];
  respuestasFalsas = {};
  try { await fn(); console.log(`  ok  ${nombre}`); }
  catch (e) { fallos++; console.error(`  FALLA  ${nombre}\n        ${e.message}`); }
};

// Respuestas con la forma REAL observada el 2026-08-06.
const VIDEO = {
  item_id: '7670800111923940616',
  caption: 'pc',
  // TikTok manda el epoch como string. Si se pasa a `new Date()` sin convertir,
  // sale Invalid Date y la fila se guarda sin fecha.
  create_time: '1785997335',
  comments: 3,
  likes: 0,
  video_views: 3,
  share_url: 'https://www.tiktok.com/@usenotoria/video/7670800111923940616',
  thumbnail_url: 'https://p16.tiktokcdn.com/portada.webp?x-expires=1786082400',
  embed_url: 'https://www.tiktok.com/player/v1/7670800111923940616',
  video_duration: 1.434,
};

const COMENTARIOS = [
  { comment_id: '7670800772670227207', text: 'no me gusta', display_name: 'ad.pr.214', username: 'ad.pr.214', create_time: '1785997495', likes: 0, pinned: false, replies: 1, owner: false, profile_image: 'https://avatar' },
  { comment_id: '7670800770971665159', text: 'hola', display_name: 'ad.pr.214', username: 'ad.pr.214', create_time: '1785997498', likes: 0, pinned: false, replies: 0, owner: false, profile_image: 'https://avatar' },
  // La respuesta que publicó el propio negocio: NO es feedback de nadie.
  { comment_id: '7670791480541414164', text: '¡Gracias por tu comentario!', display_name: 'Notoria app', create_time: '1785998810', likes: 0, pinned: false, replies: 0, owner: true, profile_image: 'https://avatar' },
];

(async () => {
  console.log('\nTikTok Accounts API — scraper\n');

  console.log('Errores que llegan con HTTP 200');

  await prueba('un `code` distinto de 0 NO se toma por éxito', async () => {
    respuestasFalsas = { '/business/video/list/': { code: 40130, message: 'The user did not authorize the scope' } };
    const r = await tk.obtenerVideosTikTokBiz('biz1', 'tok');
    assert.strictEqual(r, null, 'un error en el cuerpo debe devolver null, no una lista vacía');
  });

  await prueba('40130 (scope) se marca permanente: hay que reconectar', async () => {
    respuestasFalsas = { '/tt_user/oauth2/refresh_token/': { code: 40130, message: 'scope' } };
    const r = await tk.refrescarTokenTikTokBiz('rft.x');
    assert.ok(r.error, 'debe devolver error');
    assert.strictEqual(r.permanente, true, 'un scope revocado no se arregla reintentando');
  });

  await prueba('un fallo de red NO se marca permanente', async () => {
    respuestasFalsas = { '/tt_user/oauth2/refresh_token/': new Error('ETIMEDOUT') };
    const r = await tk.refrescarTokenTikTokBiz('rft.x');
    assert.ok(r.error, 'debe devolver error');
    assert.strictEqual(r.permanente, false, 'una caída pasajera no debe borrar la conexión');
  });

  console.log('\nAutenticación y forma del request');

  await prueba('manda el header Access-Token, no Authorization', async () => {
    respuestasFalsas = { '/business/get/': { code: 0, data: { display_name: 'Notoria app', username: 'usenotoria' } } };
    await tk.obtenerPerfilTikTokBiz('biz1', 'act.token');
    const cab = requests[0].headers;
    assert.strictEqual(cab['Access-Token'], 'act.token');
    assert.ok(!cab.Authorization, 'la Accounts API ignora Authorization: Bearer');
  });

  await prueba('el canje usa `client_id`, no `app_id`', async () => {
    respuestasFalsas = {
      '/tt_user/oauth2/token/': {
        code: 0,
        data: { open_id: 'open-1', access_token: 'act.a', refresh_token: 'rft.b', expires_in: 86400, scope: 'comment.list' },
      },
    };
    const r = await tk.canjearCodigoTikTokBiz('cod', 'https://cb');
    assert.ok('client_id' in requests[0].data, 'muchos ejemplos dicen app_id y TikTok lo rechaza');
    // El business_id que piden todos los demás endpoints ES el open_id.
    assert.strictEqual(r.businessId, 'open-1');
    assert.strictEqual(r.accessToken, 'act.a');
  });

  await prueba('el refresh conserva el token actual si TikTok no manda uno nuevo', async () => {
    respuestasFalsas = {
      '/tt_user/oauth2/refresh_token/': { code: 0, data: { access_token: 'act.nuevo', expires_in: 86400 } },
    };
    const r = await tk.refrescarTokenTikTokBiz('rft.viejo');
    assert.strictEqual(r.refreshToken, 'rft.viejo', 'perder el refresh token deja la cuenta muerta');
  });

  console.log('\nNormalización de videos y comentarios');

  await prueba('`create_time` string se convierte a fecha válida', async () => {
    respuestasFalsas = { '/business/video/list/': { code: 0, data: { videos: [VIDEO] } } };
    const [v] = await tk.obtenerVideosTikTokBiz('biz1', 'tok');
    assert.ok(v.fecha instanceof Date && !Number.isNaN(v.fecha.getTime()), 'fecha inválida');
    assert.strictEqual(v.fecha.getTime(), 1785997335 * 1000);
    // Los nombres de la Accounts API no coinciden con los de la Display API.
    assert.strictEqual(v.titulo, 'pc', 'el texto del post es `caption`, no `title`');
    assert.strictEqual(v.comentarios, 3, 'el contador es `comments`, no `comment_count`');
  });

  await prueba('los comentarios propios (owner) se descartan', async () => {
    respuestasFalsas = {
      '/business/video/list/': { code: 0, data: { videos: [VIDEO] } },
      '/business/comment/list/': { code: 0, data: { comments: COMENTARIOS } },
    };
    const c = await tk.obtenerComentariosTikTokBiz('biz1', 'tok');
    assert.strictEqual(c.length, 2, 'la respuesta del propio negocio no es feedback de nadie');
    assert.ok(!c.some((x) => x.texto.includes('Gracias por tu comentario')),
      'guardarla alertaría al dueño por lo que él mismo escribió');
  });

  await prueba('el externalId lleva el prefijo ttb_ para no chocar con la Display API', async () => {
    respuestasFalsas = {
      '/business/video/list/': { code: 0, data: { videos: [VIDEO] } },
      '/business/comment/list/': { code: 0, data: { comments: COMENTARIOS } },
    };
    const c = await tk.obtenerComentariosTikTokBiz('biz1', 'tok');
    assert.ok(c.every((x) => x.externalId.startsWith('ttb_')), 'externalId es único a nivel de tabla');
  });

  await prueba('un video sin comentarios no gasta una llamada', async () => {
    respuestasFalsas = {
      '/business/video/list/': { code: 0, data: { videos: [{ ...VIDEO, comments: 0 }] } },
    };
    const c = await tk.obtenerComentariosTikTokBiz('biz1', 'tok');
    assert.deepStrictEqual(c, []);
    assert.ok(!requests.some((r) => r.url.includes('/comment/list/')), 'no debe pedir comentarios de un video sin ellos');
  });

  await prueba('si un video falla se pierden SOLO sus comentarios', async () => {
    respuestasFalsas = {
      '/business/video/list/': { code: 0, data: { videos: [VIDEO] } },
      '/business/comment/list/': { code: 40001, message: 'algo puntual' },
    };
    const c = await tk.obtenerComentariosTikTokBiz('biz1', 'tok');
    assert.deepStrictEqual(c, [], 'un fallo por video no debe tumbar el lote entero');
  });

  console.log('\nDetección de respuestas hechas fuera de Notoria');

  await prueba('marca la respuesta del dueño hecha desde la app de TikTok', async () => {
    respuestasFalsas = {
      '/business/video/list/': { code: 0, data: { videos: [VIDEO] } },
      '/business/comment/list/': { code: 0, data: { comments: [COMENTARIOS[0]] } },
      '/business/comment/reply/list/': {
        code: 0,
        data: { comments: [{ comment_id: 'r1', text: '¡Gracias!', owner: true }] },
      },
    };
    const [c] = await tk.obtenerComentariosTikTokBiz('biz1', 'tok');
    assert.strictEqual(c.respuestaDueno, '¡Gracias!', 'sin esto el comentario queda pendiente para siempre');
  });

  await prueba('respuestas de OTROS usuarios no cuentan como respondido', async () => {
    respuestasFalsas = {
      '/business/video/list/': { code: 0, data: { videos: [VIDEO] } },
      '/business/comment/list/': { code: 0, data: { comments: [COMENTARIOS[0]] } },
      // `replies` cuenta las de cualquiera, así que el hilo puede tener
      // respuestas sin que el negocio haya contestado.
      '/business/comment/reply/list/': {
        code: 0,
        data: { comments: [{ comment_id: 'r1', text: 'yo opino igual', owner: false }] },
      },
    };
    const [c] = await tk.obtenerComentariosTikTokBiz('biz1', 'tok');
    assert.strictEqual(c.respuestaDueno, null, 'solo el dueño cierra el pendiente');
  });

  await prueba('sin respuestas no se pide el hilo', async () => {
    respuestasFalsas = {
      '/business/video/list/': { code: 0, data: { videos: [VIDEO] } },
      '/business/comment/list/': { code: 0, data: { comments: [{ ...COMENTARIOS[1], replies: 0 }] } },
    };
    const [c] = await tk.obtenerComentariosTikTokBiz('biz1', 'tok');
    assert.strictEqual(c.respuestaDueno, null);
    assert.ok(!requests.some((r) => r.url.includes('/reply/list/')),
      'una llamada extra por comentario sin respuestas sería puro desperdicio');
  });

  console.log('\nRespuesta y moderación');

  await prueba('quita el prefijo ttb_ antes de hablar con TikTok', async () => {
    respuestasFalsas = { '/business/comment/reply/create/': { code: 0, data: { comment_id: 'nuevo' } } };
    const r = await tk.responderComentarioTikTokBiz('biz1', 'tok', 'vid1', 'ttb_123', 'Gracias');
    assert.strictEqual(requests[0].data.comment_id, '123', 'el prefijo es nuestro, TikTok no lo conoce');
    assert.strictEqual(requests[0].data.video_id, 'vid1', 'la API exige el video_id además del comment_id');
    assert.strictEqual(r.ok, true);
  });

  await prueba('un rechazo de la plataforma devuelve error, no ok', async () => {
    respuestasFalsas = { '/business/comment/reply/create/': { code: 40002, message: 'texto inválido' } };
    const r = await tk.responderComentarioTikTokBiz('biz1', 'tok', 'vid1', 'ttb_123', 'x');
    assert.ok(r.error, 'marcar como respondido algo que TikTok rechazó miente en el panel');
    assert.ok(!r.ok);
  });

  await prueba('las 3 acciones de moderación mandan su par correcto', async () => {
    const esperado = { ocultar: ['HIDE', 'UNHIDE'], fijar: ['PIN', 'UNPIN'], like: ['LIKE', 'UNLIKE'] };
    for (const [accion, [si, no]] of Object.entries(esperado)) {
      respuestasFalsas = { '/business/comment/': { code: 0, data: {} } };
      requests = [];
      await tk.moderarComentarioTikTokBiz(accion, 'biz1', 'tok', 'vid1', 'ttb_9', true);
      assert.strictEqual(requests[0].data.action, si, `${accion} activar`);
      requests = [];
      await tk.moderarComentarioTikTokBiz(accion, 'biz1', 'tok', 'vid1', 'ttb_9', false);
      assert.strictEqual(requests[0].data.action, no, `${accion} revertir`);
    }
  });

  await prueba('moderar SIEMPRE manda video_id (la API lo exige)', async () => {
    respuestasFalsas = { '/business/comment/hide/': { code: 0, data: {} } };
    await tk.moderarComentarioTikTokBiz('ocultar', 'biz1', 'tok', 'vid1', 'ttb_9');
    assert.strictEqual(requests[0].data.video_id, 'vid1');
    assert.strictEqual(requests[0].data.comment_id, '9', 'el prefijo ttb_ es nuestro');
  });

  await prueba('sin video_id no llama: la API respondería 40002', async () => {
    const r = await tk.moderarComentarioTikTokBiz('ocultar', 'biz1', 'tok', null, 'ttb_9');
    assert.ok(r.error);
    assert.strictEqual(requests.length, 0);
  });

  await prueba('una acción desconocida no sale a la red', async () => {
    const r = await tk.moderarComentarioTikTokBiz('borrar_todo', 'biz1', 'tok', 'vid1', 'ttb_9');
    assert.ok(r.error);
    assert.strictEqual(requests.length, 0);
  });

  console.log('\nGuardas');

  await prueba('sin credenciales no llama a TikTok', async () => {
    const id = process.env.TIKTOK_BIZ_CLIENT_ID;
    delete process.env.TIKTOK_BIZ_CLIENT_ID;
    const r = await tk.obtenerVideosTikTokBiz('biz1', 'tok');
    process.env.TIKTOK_BIZ_CLIENT_ID = id;
    assert.strictEqual(r, null);
    assert.strictEqual(requests.length, 0, 'no debe salir a la red sin credenciales');
  });

  await prueba('sin business_id o sin token devuelve null sin llamar', async () => {
    assert.strictEqual(await tk.obtenerVideosTikTokBiz(null, 'tok'), null);
    assert.strictEqual(await tk.obtenerVideosTikTokBiz('biz1', null), null);
    assert.strictEqual(requests.length, 0);
  });

  console.log(
    fallos === 0
      ? '\n✅ El scraper de la Accounts API pasa. Recordatorio: estas pruebas cubren NUESTRA lógica, no la existencia de los endpoints — eso se comprueba contra la API real con scripts/sonda-tiktok-business.js.\n'
      : `\n❌ ${fallos} prueba(s) fallando.\n`
  );
  process.exit(fallos === 0 ? 0 : 1);
})();
