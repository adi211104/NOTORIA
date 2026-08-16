// brand-shield/scripts/prueba-instagram-menciones.js
// Menciones de Instagram con axios interceptado: no llama a la Graph API ni
// toca la base de datos.
//
//   node scripts/prueba-instagram-menciones.js
//
// Lo que se comprueba es el contrato con el worker (nombres de campo exactos) y
// las decisiones que son fáciles de romper sin que nada falle: el prefijo del
// externalId, distinguir "no lo sabemos" de "cero" en las métricas, y que la
// fuente nunca lance hacia el worker.

const path = require('path');
const Module = require('module');
const base = path.join(__dirname, '..', 'src');

process.env.META_APP_ID = '2232447584255257';
process.env.META_APP_SECRET = 'secreto-de-prueba';

const llamadas = [];
let responder = () => ({ data: { data: [] } });
const axiosFake = {
  get: async (url, cfg) => { llamadas.push({ url, params: cfg?.params }); return responder(); },
};

const originalLoad = Module._load;
Module._load = function (pedido) {
  if (pedido === 'axios') return axiosFake;
  return originalLoad.apply(this, arguments);
};

const menciones = require(path.join(base, 'scrapers/instagramMenciones.scraper'));
const { fuentesDisponibles, hayFuenteDisponible } = require(path.join(base, 'lib/menciones'));

let fallos = 0;
const check = (nombre, ok, extra = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ok || !extra ? '' : `\n      ${extra}`}`);
};

// Forma real de GET /{ig-user-id}/tags
const RESPUESTA_TAGS = {
  data: {
    data: [
      {
        id: '17900001',
        caption: 'Cena horrible en @cevicheriaX, la espera fue de una hora',
        permalink: 'https://www.instagram.com/p/Cxyz001/',
        timestamp: '2026-08-04T19:12:00+0000',
        username: 'gaby.rr',
        media_type: 'IMAGE',
        like_count: 34,
        comments_count: 5,
      },
      {
        // Sin caption y con contadores ocultos por el autor: Instagram omite
        // `like_count` en ese caso.
        id: '17900002',
        permalink: 'https://www.instagram.com/p/Cxyz002/',
        timestamp: '2026-08-05T08:00:00+0000',
        username: 'foodie_lima',
        media_type: 'VIDEO',
        comments_count: 0,
      },
    ],
  },
};

(async () => {
  // ── 1. Lectura y normalización ─────────────────────────
  responder = () => RESPUESTA_TAGS;
  llamadas.length = 0;
  const r = await menciones.buscarMencionesInstagram('178', 'TOKEN_PAGINA');

  check('lee las publicaciones etiquetadas', r.length === 2, `${r.length}`);
  check('el externalId lleva el prefijo ig_', r[0].externalId === 'ig_17900001', r[0].externalId);
  check('usa el permalink como url', r[0].url === 'https://www.instagram.com/p/Cxyz001/');
  check('el handle lleva arroba', r[0].autorHandle === '@gaby.rr', r[0].autorHandle);
  check('convierte el timestamp a Date', r[0].fechaMencion instanceof Date);
  check('clasifica el sentimiento', r[0].sentimiento === 'negativo', r[0].sentimiento);
  check('recorta el contexto a 200', r[0].contexto.length <= 200);

  // ── 2. Métricas: null no es cero ───────────────────────
  // Si los contadores ocultos se guardaran como 0, el panel ordenaría por
  // "viralidad" poniendo esas menciones al final como si nadie las hubiera
  // visto. Son cosas distintas y hay que distinguirlas.
  check('like_count ausente se guarda como null, no 0', r[1].metricas.likes === null, JSON.stringify(r[1].metricas));
  check('comments_count 0 se conserva como 0', r[1].metricas.comentarios === 0);
  check('vistas y compartidos van en null (Instagram no los da)',
    r[1].metricas.vistas === null && r[1].metricas.compartidos === null);
  check('sin caption no revienta', r[1].texto === '' && typeof r[1].contexto === 'string');
  check('sin caption cae un autor por defecto', !!r[1].autorNombre);

  // ── 3. La petición ─────────────────────────────────────
  const p = llamadas[0];
  check('pide /tags, no /media', /\/178\/tags$/.test(p.url), p.url);
  check('acota el límite explícitamente', p.params.limit === menciones.LIMITE_MENCIONES, `limit=${p.params.limit}`);
  check('pide permalink y username', /permalink/.test(p.params.fields) && /username/.test(p.params.fields));
  check('manda el token', p.params.access_token === 'TOKEN_PAGINA');

  // ── 4. Cuenta sin conectar ─────────────────────────────
  // [] y no null: el worker de menciones concatena las listas directamente.
  check('sin instagramUserId devuelve lista vacía',
    JSON.stringify(await menciones.buscarMencionesInstagram(null, 'TOKEN')) === '[]');
  check('sin token devuelve lista vacía',
    JSON.stringify(await menciones.buscarMencionesInstagram('178', null)) === '[]');

  // ── 5. Error de la Graph API ───────────────────────────
  responder = () => { const e = new Error('x'); e.response = { data: { error: { message: 'Invalid OAuth access token' } } }; throw e; };
  const rMal = await menciones.buscarMencionesInstagram('178', 'TOKEN');
  check('un error de Meta no lanza hacia el worker', Array.isArray(rMal) && rMal.length === 0);

  // ── 6. La fuente enciende la sección ───────────────────
  // Ojo: desde el 2026-08-16 las credenciales de Meta YA NO BASTAN. Instagram
  // está oculto mientras Meta revisa la app, así que estas dos funciones reciben
  // el usuario y solo encienden la fuente para las cuentas de prueba o con
  // INSTAGRAM_ACTIVO=true (ver lib/instagramVisible.js). Aquí se abre el
  // interruptor a propósito: lo que esta prueba mide es el scraper, no el gate
  // —de eso se encarga scripts/prueba-instagram-visible.js—.
  const activoGuardado = process.env.INSTAGRAM_ACTIVO;
  process.env.INSTAGRAM_ACTIVO = 'true';
  const USUARIO = { email: 'duenio@negocio.pe' };

  check('Instagram aparece como fuente disponible',
    fuentesDisponibles(USUARIO).some((f) => f.id === 'INSTAGRAM'), JSON.stringify(fuentesDisponibles(USUARIO)));
  check('con Instagram ya hay al menos una fuente', hayFuenteDisponible(USUARIO) === true);

  // Con el interruptor cerrado, un cliente cualquiera no ve la fuente aunque
  // las credenciales estén puestas — que es el estado real de hoy en producción.
  delete process.env.INSTAGRAM_ACTIVO;
  check('con la revisión de Meta pendiente, el cliente no ve la fuente',
    hayFuenteDisponible(USUARIO) === false);
  if (activoGuardado === undefined) delete process.env.INSTAGRAM_ACTIVO;
  else process.env.INSTAGRAM_ACTIVO = activoGuardado;

  // Sin credenciales de la app, la fuente desaparece
  process.env.INSTAGRAM_ACTIVO = 'true';
  const idGuardado = process.env.META_APP_ID;
  delete process.env.META_APP_ID;
  check('sin credenciales de la app, la fuente se apaga',
    !fuentesDisponibles(USUARIO).some((f) => f.id === 'INSTAGRAM'));
  process.env.META_APP_ID = idGuardado;
  if (activoGuardado === undefined) delete process.env.INSTAGRAM_ACTIVO;
  else process.env.INSTAGRAM_ACTIVO = activoGuardado;

  console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLAS ===`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('Error inesperado:', e.message); process.exit(1); });
