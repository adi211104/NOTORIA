// Prueba del circuito de comentarios de TikTok SIN llamar a TikTok ni tocar la BD.
//
// Existe porque el circuito real está bloqueado por cosas que no dependen de
// nosotros (la app en Sandbox, y los scopes video.list / comment.list esperando
// aprobación). Este script comprueba todo lo que sí es nuestro:
//   · el parseo de la respuesta de TikTok a la forma del modelo
//   · que un fallo de comment.list NO haga perder la lista de videos
//   · el sentimiento y qué comentarios disparan alerta
//   · el dedupe por externalId y que no se pise una respuesta ya escrita
//   · la forma exacta del request de respuesta (el video_id es obligatorio y el
//     prefijo tt_ hay que quitarlo, dos cosas que TikTok rechaza en silencio)
//
// Correr:  node scripts/prueba-tiktok-comentarios.js

const assert = require('assert');
const path = require('path');
const axios = require('axios');

// ── Doble de axios ────────────────────────────────────────
// Se reemplaza antes de cargar el scraper para capturar los requests tal como
// viajan, sin salir a la red y sin gastar cuota de la app de Sandbox.
let respuestasFalsas = {};
let requests = [];

const responder = (url) => {
  for (const [fragmento, handler] of Object.entries(respuestasFalsas)) {
    if (url.includes(fragmento)) {
      if (handler instanceof Error) throw handler;
      return { data: handler };
    }
  }
  throw new Error(`Sin respuesta falsa configurada para ${url}`);
};

axios.post = async (url, cuerpo, opciones) => {
  requests.push({ url, cuerpo, opciones });
  return responder(url);
};

// El perfil se lee con GET, a diferencia del resto de la Display API
axios.get = async (url, opciones) => {
  requests.push({ url, opciones });
  return responder(url);
};

process.env.TIKTOK_CLIENT_KEY = 'clave-de-prueba';
process.env.TIKTOK_CLIENT_SECRET = 'secreto-de-prueba';

const tiktok = require(path.join(__dirname, '..', 'src', 'scrapers', 'tiktok.scraper'));
const { clasificar } = require(path.join(__dirname, '..', 'src', 'nlp', 'sentimiento'));

let fallos = 0;
const prueba = async (nombre, fn) => {
  requests = [];
  try { await fn(); console.log(`  ok  ${nombre}`); }
  catch (e) { fallos++; console.error(`  FALLA  ${nombre}\n        ${e.message}`); }
};

// Un error con la forma que devuelve axios cuando TikTok rechaza por scope
const errorDeScope = () => {
  const e = new Error('scope_not_authorized');
  e.response = { data: { error: { message: 'scope not authorized' } } };
  return e;
};

const VIDEOS_OK = { data: { videos: [{ id: 'v1', title: 'Nuestro nuevo plato' }, { id: 'v2', title: 'Detrás de cámaras' }] } };

(async () => {
  console.log('\nLectura de comentarios');

  await prueba('parsea videos y comentarios a la forma del modelo', async () => {
    respuestasFalsas = {
      '/video/list/': VIDEOS_OK,
      '/comment/list/': { data: { comments: [
        { id: 'c1', text: 'Todo excelente, recomiendo', username: 'ana', create_time: 1750000000 },
      ] } },
    };
    const r = await tiktok.obtenerComentariosTikTok('open-id', 'token');
    // 2 videos × 1 comentario cada uno
    assert.strictEqual(r.length, 2, `esperaba 2 comentarios, llegaron ${r.length}`);
    assert.strictEqual(r[0].externalId, 'tt_c1', 'el externalId debe ir prefijado con tt_');
    assert.strictEqual(r[0].autorNombre, 'ana');
    assert.strictEqual(r[0].videoId, 'v1', 'sin videoId no se puede responder después');
    assert.strictEqual(r[0].videoTitulo, 'Nuestro nuevo plato');
    assert.ok(r[0].fechaComentario instanceof Date, 'fechaComentario debe ser Date');
  });

  await prueba('sin scope comment.list se conservan los videos y no se cae el lote', async () => {
    respuestasFalsas = { '/video/list/': VIDEOS_OK, '/comment/list/': errorDeScope() };
    const r = await tiktok.obtenerComentariosTikTok('open-id', 'token');
    // Éste es el bug que costó un escaneo entero: antes un solo rechazo abortaba
    // todo. Debe devolver [] (lista vacía), NUNCA null ni lanzar.
    assert.deepStrictEqual(r, [], 'debe devolver [] y no null cuando fallan los comentarios');
    assert.strictEqual(requests.filter(x => x.url.includes('/comment/list/')).length, 2,
      'debe intentar los comentarios de CADA video, no cortar en el primer fallo');
  });

  await prueba('si falla video.list devuelve null (no [])', async () => {
    respuestasFalsas = { '/video/list/': errorDeScope() };
    const r = await tiktok.obtenerComentariosTikTok('open-id', 'token');
    // La distinción importa: null = no se pudo leer, [] = se leyó y no hay nada.
    // El worker usa eso para no confundir "sin permisos" con "sin comentarios".
    assert.strictEqual(r, null);
  });

  await prueba('sin cuenta conectada no hace ninguna llamada', async () => {
    respuestasFalsas = {};
    assert.strictEqual(await tiktok.obtenerComentariosTikTok(null, null), null);
    assert.strictEqual(requests.length, 0, 'no debe llamar a la API sin openId/token');
  });

  await prueba('cuenta sin videos devuelve lista vacía', async () => {
    respuestasFalsas = { '/video/list/': { data: { videos: [] } } };
    assert.deepStrictEqual(await tiktok.obtenerComentariosTikTok('open-id', 'token'), []);
  });

  console.log('\nVideos propios (lo único que la Display API sí deja leer)');

  await prueba('normaliza los videos a la forma del panel', async () => {
    respuestasFalsas = { '/video/list/': { data: { videos: [{
      id: '7668439787535076625', title: 'lana', create_time: 1785000000,
      comment_count: 1, like_count: 4, view_count: 30,
      share_url: 'https://www.tiktok.com/@adipri347/video/7668439787535076625',
    }] } } };
    const [v] = await tiktok.obtenerVideosTikTok('token');
    assert.strictEqual(v.id, '7668439787535076625');
    assert.strictEqual(v.titulo, 'lana');
    assert.strictEqual(v.comentarios, 1);
    assert.ok(v.fecha instanceof Date);
    assert.ok(v.url.includes('tiktok.com'), 'sin url no se puede ir a responder a la app');
    const campos = requests.find(x => x.url.includes('/video/list/')).opciones.params.fields;
    assert.ok(campos.includes('comment_count') && campos.includes('share_url'));
  });

  await prueba('un comment_count en 0 se conserva, no se vuelve null', async () => {
    // `?? null` en vez de `|| null`: un video sin comentarios debe mostrar "0
    // comentarios", que es información, y no esconder la pastilla.
    respuestasFalsas = { '/video/list/': { data: { videos: [{ id: 'v1', comment_count: 0 }] } } };
    const [v] = await tiktok.obtenerVideosTikTok('token');
    assert.strictEqual(v.comentarios, 0);
  });

  await prueba('si video.list falla devuelve null (no [])', async () => {
    respuestasFalsas = { '/video/list/': errorDeScope() };
    assert.strictEqual(await tiktok.obtenerVideosTikTok('token'), null);
  });

  console.log('\nPerfil de la cuenta conectada');

  const PERFIL_OK = { data: { user: {
    open_id: 'oid', display_name: 'Mi Negocio', avatar_url: 'https://cdn/a.jpg',
  } } };

  await prueba('con user.info.basic pide solo nombre y foto', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic';
    respuestasFalsas = { '/user/info/': PERFIL_OK };
    const p = await tiktok.obtenerPerfilTikTok('token');
    assert.strictEqual(p.nombre, 'Mi Negocio');
    assert.strictEqual(p.avatar, 'https://cdn/a.jpg');
    assert.strictEqual(p.username, null, 'sin user.info.profile no hay @usuario');
    const campos = requests.find(x => x.url.includes('/user/info/')).opciones.params.fields;
    // Pedir un campo no autorizado hace fallar TODA la llamada, así que el @ no
    // debe aparecer en la query mientras el scope no esté aprobado.
    assert.ok(!campos.includes('username'), `no debe pedir username: ${campos}`);
    assert.ok(campos.includes('display_name') && campos.includes('avatar_url'));
  });

  await prueba('con user.info.profile suma el @usuario', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,user.info.profile';
    respuestasFalsas = { '/user/info/': { data: { user: {
      ...PERFIL_OK.data.user, username: 'minegocio', profile_deep_link: 'https://tiktok.com/@minegocio',
    } } } };
    const p = await tiktok.obtenerPerfilTikTok('token');
    assert.strictEqual(p.username, 'minegocio');
    assert.strictEqual(p.url, 'https://tiktok.com/@minegocio');
    const campos = requests.find(x => x.url.includes('/user/info/')).opciones.params.fields;
    assert.ok(campos.includes('username'), 'con el scope aprobado sí debe pedirlo');
  });

  await prueba('si el perfil falla devuelve null y no rompe la conexión', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic';
    respuestasFalsas = { '/user/info/': errorDeScope() };
    // El callback de OAuth guarda el token igual: perder el nombre no debe
    // impedir conectar la cuenta.
    assert.strictEqual(await tiktok.obtenerPerfilTikTok('token'), null);
  });

  await prueba('sin token no llama a la API', async () => {
    respuestasFalsas = {};
    assert.strictEqual(await tiktok.obtenerPerfilTikTok(null), null);
    assert.strictEqual(requests.length, 0);
  });

  console.log('\nRenovación del token (dura 24h)');

  await prueba('renueva y devuelve el refresh token NUEVO', async () => {
    respuestasFalsas = { '/oauth/token/': {
      access_token: 'act.nuevo', refresh_token: 'rft.nuevo', expires_in: 86400,
      scope: 'user.info.basic,video.list',
    } };
    const r = await tiktok.refrescarTokenTikTok('rft.viejo');
    assert.strictEqual(r.accessToken, 'act.nuevo');
    // TikTok ROTA el refresh token: si se guardara el viejo, el próximo refresh
    // falla y la cuenta muere en silencio otra vez.
    assert.strictEqual(r.refreshToken, 'rft.nuevo');
    assert.ok(r.expiraEn instanceof Date && r.expiraEn > new Date());
    const req = requests.find(x => x.url.includes('/oauth/token/'));
    assert.strictEqual(req.cuerpo.get('grant_type'), 'refresh_token');
    assert.strictEqual(req.cuerpo.get('refresh_token'), 'rft.viejo');
  });

  await prueba('un error en el CUERPO con HTTP 200 no se toma por éxito', async () => {
    // El endpoint de OAuth de TikTok responde así: 200 con { error }. Sin este
    // chequeo se guardaría un accessToken undefined.
    respuestasFalsas = { '/oauth/token/': { error: 'invalid_grant', error_description: 'Refresh token is invalid' } };
    const r = await tiktok.refrescarTokenTikTok('rft.muerto');
    assert.ok(r.error, 'debe devolver error');
    assert.strictEqual(r.permanente, true, 'invalid_grant obliga a reconectar');
    assert.strictEqual(r.accessToken, undefined);
  });

  await prueba('un fallo de red NO se marca permanente', async () => {
    // Distinción clave: solo lo permanente borra los tokens del negocio. Una
    // caída pasajera no debe obligar al usuario a reconectar su cuenta.
    respuestasFalsas = { '/oauth/token/': new Error('socket hang up') };
    const r = await tiktok.refrescarTokenTikTok('rft.ok');
    assert.ok(r.error);
    assert.strictEqual(r.permanente, false);
  });

  await prueba('si TikTok no manda refresh token nuevo se conserva el actual', async () => {
    respuestasFalsas = { '/oauth/token/': { access_token: 'act.nuevo', expires_in: 86400 } };
    const r = await tiktok.refrescarTokenTikTok('rft.viejo');
    assert.strictEqual(r.refreshToken, 'rft.viejo', 'perderlo dejaría la cuenta sin forma de renovarse');
  });

  await prueba('sin refresh token no llama a TikTok', async () => {
    respuestasFalsas = {};
    const r = await tiktok.refrescarTokenTikTok(null);
    assert.ok(r.error);
    assert.strictEqual(requests.length, 0);
  });

  console.log('\nSentimiento y alertas');

  await prueba('clasifica los tres tonos', () => {
    assert.strictEqual(clasificar('el servicio fue pésimo y sucio'), 'negativo');
    assert.strictEqual(clasificar('todo excelente, recomiendo'), 'positivo');
    assert.strictEqual(clasificar('¿a qué hora abren?'), 'neutro');
  });

  await prueba('una queja con halago adentro sigue siendo negativa', () => {
    // Regla explícita: preferimos un falso positivo (ver un comentario que no era
    // grave) a un falso negativo (una queja que se propaga sin que nadie la vea).
    assert.strictEqual(clasificar('la comida es delicioso pero el mozo fue grosero'), 'negativo');
  });

  await prueba('solo lo negativo debería alertar', () => {
    const comentarios = ['pésimo servicio', 'todo excelente', 'a qué hora abren'];
    const alertables = comentarios.filter(t => clasificar(t) === 'negativo');
    assert.strictEqual(alertables.length, 1);
  });

  console.log('\nRespuesta a un comentario');

  await prueba('quita el prefijo tt_ y manda el video_id', async () => {
    respuestasFalsas = { '/comment/reply/create/': { data: { comment_id: 'r1' } } };
    const r = await tiktok.responderComentarioTikTok('v1', 'tt_c1', 'Gracias por avisar', 'token');
    assert.strictEqual(r.ok, true);
    const req = requests.find(x => x.url.includes('/comment/reply/create/'));
    assert.strictEqual(req.cuerpo.comment_id, 'c1', 'TikTok rechaza el id con el prefijo tt_');
    assert.strictEqual(req.cuerpo.video_id, 'v1', 'video_id es obligatorio en este endpoint');
    assert.strictEqual(req.cuerpo.text, 'Gracias por avisar');
    assert.strictEqual(req.opciones.headers.Authorization, 'Bearer token');
  });

  await prueba('un rechazo de la plataforma devuelve error, no ok', async () => {
    respuestasFalsas = { '/comment/reply/create/': errorDeScope() };
    const r = await tiktok.responderComentarioTikTok('v1', 'tt_c1', 'hola', 'token');
    // Importante: la ruta solo marca respondida=true si esto NO trae error. Si
    // acá se colara un ok, el panel diría "respondido" y en TikTok no habría nada.
    assert.ok(r.error, 'debe devolver { error } cuando la plataforma rechaza');
    assert.ok(!r.ok);
  });

  console.log('\nDedupe (la lógica que aplica el worker)');

  await prueba('un comentario ya guardado no se vuelve a insertar', () => {
    // Réplica de la regla de procesarComentariosSociales: si existe, `continue`.
    // No se hace update, porque pisaría la respuesta que el usuario ya escribió.
    const yaEnBd = new Map([['tt_c1', { respuesta: 'Ya contestado', respondida: true }]]);
    const entrantes = [{ externalId: 'tt_c1' }, { externalId: 'tt_c2' }];
    const nuevos = entrantes.filter(c => !yaEnBd.has(c.externalId));
    assert.strictEqual(nuevos.length, 1);
    assert.strictEqual(nuevos[0].externalId, 'tt_c2');
    assert.strictEqual(yaEnBd.get('tt_c1').respuesta, 'Ya contestado', 'no se debe pisar la respuesta');
  });

  console.log(
    fallos === 0
      ? '\n✅ El circuito de la Display API pasa. OJO: la Display API NO lee comentarios (sus rutas dan 404) y desde el 2026-08-06 dejó de ser la conexión principal. Los comentarios reales van por la Accounts API, verificada en vivo — sus pruebas están en prueba-tiktok-business.js (CLAUDE.md §15-octies). Este archivo cubre la ruta de respaldo.\n'
      : `\n❌ ${fallos} prueba(s) fallando.\n`
  );
  process.exit(fallos === 0 ? 0 : 1);
})();
