// brand-shield/scripts/prueba-facebook.js
// Pruebas de Facebook Reviews con axios interceptado: no llama a Meta.
//
//   node scripts/prueba-facebook.js
//
// 🔴 QUÉ CUBRE ESTO Y QUÉ NO — importa tenerlo claro antes de encender nada.
//
// CUBRE la forma DOCUMENTADA de la respuesta de `/{page-id}/ratings`: los campos
// del nodo `Recommendation` según la documentación oficial de v26.0, y sobre
// todo la traducción de una recomendación SIN estrella, que es donde el stub
// original se rompía en silencio.
//
// NO CUBRE que Meta responda eso de verdad. Nadie ha llamado nunca a ese
// endpoint con un token válido, porque falta el permiso `pages_read_user_content`
// (segunda solicitud de App Review, `docs/app-review-meta.md` §8). Es la misma
// distinción que costó meses con `obtenerComentariosTikTok`: pasar las pruebas
// con mocks no prueba que el endpoint conteste. Por eso la función vive detrás
// de `lib/facebookVisible.js` y hay que hacer una llamada real antes de abrirla.
//
// ── El fallo concreto que estas pruebas impiden ──────────────────────────────
//
// Desde 2018 Facebook no tiene estrellas sino recomendaciones, y el nodo puede
// llegar sin `rating`. El stub hacía `rating: r.rating || 0`, así que una
// recomendación POSITIVA sin estrella se guardaba como una reseña de **0
// estrellas**: el detector la habría leído como la peor puntuación posible y le
// habría mandado al cliente una alerta de reputación por algo bueno que le pasó.

const Module = require('module');

// ── Doble de axios ────────────────────────────────────────
let respuesta = { data: [] };
let ultimaPeticion = null;
const axiosFalso = {
  get: async (url, config) => {
    ultimaPeticion = { url, params: config?.params };
    if (respuesta instanceof Error) throw respuesta;
    return { data: respuesta };
  },
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'axios') return axiosFalso;
  return requireOriginal.apply(this, arguments);
};
const { obtenerResenasFacebook, obtenerRatingFacebook, ratingDeRecomendacion } = require('../src/scrapers/facebook.scraper');
Module.prototype.require = requireOriginal;

const { facebookVisiblePara, activoParaTodos } = require('../src/lib/facebookVisible');

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const recomendacion = (extra = {}) => ({
  created_time: '2026-08-20T10:00:00+0000',
  reviewer: { id: 'u1', name: 'Ana Torres' },
  ...extra,
});

const correr = async () => {
  // ── 1. Estrellas de verdad ──────────────────────────────
  bloque('1. Reseñas con estrella');

  respuesta = { data: [recomendacion({ rating: 2, has_rating: true, has_review: true, review_text: 'Tardaron una hora.' })] };
  let r = await obtenerResenasFacebook('pag1', 'tok');
  check('se guarda con su rating', r[0].rating === 2, JSON.stringify(r[0]));
  check('  …y con su texto', r[0].texto === 'Tardaron una hora.');
  check('  …marcada como que SÍ tiene estrella', r[0].sinEstrella === false);
  check('  …con el autor', r[0].autorNombre === 'Ana Torres');
  check('🔴 autorResenasTotal es null, no 0',
    r[0].autorResenasTotal === null,
    'un 0 haría que la señal de "cuenta nueva" del detector la marcara como falsa');

  // ── 2. Recomendaciones SIN estrella ─────────────────────
  bloque('2. 🔴 Recomendaciones sin estrella — donde el stub se rompía');

  respuesta = { data: [recomendacion({ recommendation_type: 'positive', has_rating: false, has_review: true, review_text: 'Muy recomendable.' })] };
  r = await obtenerResenasFacebook('pag1', 'tok');
  check('una recomendación POSITIVA sin estrella NO se guarda como 0',
    r[0].rating !== 0, `rating=${r[0].rating}`);
  check('  …se traduce a 5★, que es lo que Facebook enseña como "recomienda"', r[0].rating === 5);
  check('  …y queda marcada con sinEstrella para que el panel no finja precisión',
    r[0].sinEstrella === true);

  respuesta = { data: [recomendacion({ recommendation_type: 'negative', has_rating: false, has_review: false })] };
  r = await obtenerResenasFacebook('pag1', 'tok');
  check('una recomendación NEGATIVA sin estrella se traduce a 1★', r[0].rating === 1);
  check('  …y sin texto queda vacío, no "undefined"', r[0].texto === '');

  respuesta = { data: [recomendacion({ has_rating: false })] };
  r = await obtenerResenasFacebook('pag1', 'tok');
  check('sin estrella Y sin tipo se DESCARTA en vez de inventar un 0',
    r.length === 0,
    'guardarla mal es peor que no guardarla: el conteo corto se nota, una reseña falsa no');

  // `rating: 0` explícito con has_rating true: Facebook no debería mandarlo,
  // pero si lo hace, cero no es una puntuación válida.
  respuesta = { data: [recomendacion({ rating: 0, has_rating: true, recommendation_type: 'positive' })] };
  r = await obtenerResenasFacebook('pag1', 'tok');
  check('un rating 0 explícito no se cuela: manda el tipo de recomendación', r[0]?.rating === 5, JSON.stringify(r));

  // ── 3. La petición ──────────────────────────────────────
  bloque('3. Los campos que se le piden a Meta');

  await obtenerResenasFacebook('pag1', 'tok');
  const campos = ultimaPeticion.params.fields;
  for (const c of ['recommendation_type', 'has_rating', 'has_review', 'rating', 'review_text', 'reviewer', 'created_time']) {
    check(`pide ${c}`, campos.includes(c), campos);
  }
  check('llama a la arista /ratings de la página', ultimaPeticion.url.endsWith('/pag1/ratings'), ultimaPeticion.url);

  // ── 4. Errores ──────────────────────────────────────────
  bloque('4. Fallos');

  respuesta = Object.assign(new Error('bad token'), { response: { data: { error: { code: 190 } } } });
  r = await obtenerResenasFacebook('pag1', 'tok');
  check('un token caducado se señala aparte, no como lista vacía',
    r && r.tokenExpirado === true,
    'confundirlo con "no hay reseñas" dejaría al cliente sin saber que hay que reconectar');

  respuesta = Object.assign(new Error('boom'), { response: { data: { error: { code: 4 } } } });
  r = await obtenerResenasFacebook('pag1', 'tok');
  check('🔴 otro error devuelve null, NO []',
    r === null,
    'null = no se pudo leer; [] = se leyó y no hay nada. El worker no puede confundirlos');

  respuesta = { data: [] };
  r = await obtenerResenasFacebook('pag1', 'tok');
  check('sin reseñas devuelve [] de verdad', Array.isArray(r) && r.length === 0);

  respuesta = { overall_star_rating: 4.3, rating_count: 87 };
  const rat = await obtenerRatingFacebook('pag1', 'tok');
  check('el rating de la página se lee', rat.ratingActual === 4.3 && rat.totalResenas === 87, JSON.stringify(rat));

  // ── 5. El interruptor ───────────────────────────────────
  bloque('5. El interruptor de visibilidad');

  delete process.env.FACEBOOK_ACTIVO;
  delete process.env.FACEBOOK_CUENTAS_PRUEBA;
  check('apagado por defecto: nadie lo ve', facebookVisiblePara({ email: 'x@y.z' }) === false);
  check('  …y `activoParaTodos` lo confirma', activoParaTodos() === false);

  process.env.FACEBOOK_CUENTAS_PRUEBA = 'Revisor@Usenotoria.APP , otro@x.com';
  check('una cuenta de prueba sí lo ve', facebookVisiblePara({ email: 'revisor@usenotoria.app' }) === true);
  check('  …comparando sin distinguir mayúsculas ni espacios', facebookVisiblePara({ email: '  OTRO@X.COM ' }) === true);
  check('  …y el resto sigue sin verlo', facebookVisiblePara({ email: 'cliente@real.pe' }) === false);
  check('  …un usuario sin correo tampoco', facebookVisiblePara({}) === false && facebookVisiblePara(null) === false);

  process.env.FACEBOOK_ACTIVO = 'true';
  check('FACEBOOK_ACTIVO=true lo abre para todos', facebookVisiblePara({ email: 'cliente@real.pe' }) === true);
  process.env.FACEBOOK_ACTIVO = 'TRUE';
  check('🔴 solo el literal "true" en minúsculas activa',
    facebookVisiblePara({ email: 'cliente@real.pe' }) === false,
    'mismo criterio que INSTAGRAM_ACTIVO: un valor raro no puede abrir la función por accidente');
  process.env.FACEBOOK_ACTIVO = '1';
  check('  …ni "1"', facebookVisiblePara({ email: 'cliente@real.pe' }) === false);
  delete process.env.FACEBOOK_ACTIVO;

  // ── 6. El permiso correcto en la ruta ───────────────────
  bloque('6. 🔴 El permiso que se pide en el OAuth');

  const rutas = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'api', 'routes', 'redes.routes.js'), 'utf8');
  check('el scope de Facebook pide pages_read_user_content',
    /scope: 'pages_show_list,pages_read_user_content'/.test(rutas),
    'con pages_read_engagement la conexión funcionaría y las reseñas llegarían SIEMPRE vacías, sin un solo error');
  check('el callback de Facebook existe y es distinto del de Instagram',
    rutas.includes("router.get('/facebook/callback'"),
    'el de Instagram descarta las páginas sin cuenta de Instagram vinculada');
  check('el estado ya no dice `disponible: true` fijo',
    !/facebook: \{\s*disponible: true/.test(rutas),
    'era una promesa falsa: no existía ninguna ruta para conectar');
  check('Facebook se puede desconectar', /facebook: \['facebookPageId'/.test(rutas));

  // ── 7. El worker avisa de las negativas ─────────────────
  bloque('7. Una recomendación negativa dispara el aviso');

  const worker = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'workers', 'monitoreo.worker.js'), 'utf8');
  const ramaFB = worker.slice(worker.indexOf('── FACEBOOK ─'), worker.indexOf('── COMENTARIOS EN PUBLICACIONES PROPIAS'));
  check('🔴 la rama de Facebook llama a alertarResenaNegativa',
    ramaFB.includes('alertarResenaNegativa'),
    'sin esto una recomendación negativa se guarda y NO produce alerta, correo ni nada en el panel');
  check('  …y calcula su propio primer barrido', ramaFB.includes('esPrimerBarridoFB'));
  check('  …y pasa las reseñas previas para poder detectar texto duplicado',
    ramaFB.includes('previasFB'),
    'llamar a analizarResena con un solo argumento deja esa señal sin evaluar');

  check('🔴 `sinEstrella` se GUARDA, no solo se calcula',
    ramaFB.includes('sinEstrella: resena.sinEstrella'),
    'sin persistirlo, el panel enseñaría 5★ de algo que en Facebook solo dice «recomienda»');

  const schema = require('fs').readFileSync(require('path').join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  check('  …y la columna existe y es NULLABLE',
    /sinEstrella\s+Boolean\?/.test(schema),
    'nullable a propósito: en las demás fuentes la pregunta no aplica, no es que la estrella sea real');

  // ── Resumen ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
