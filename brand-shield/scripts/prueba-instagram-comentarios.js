// brand-shield/scripts/prueba-instagram-comentarios.js
// Circuito de comentarios de Instagram con axios interceptado: no llama a la
// Graph API ni toca la base de datos.
//
//   node scripts/prueba-instagram-comentarios.js
//
// Cubre lo que se puede romper en silencio: el parseo de la respuesta anidada
// (media → comments), el prefijo del externalId, la forma exacta de la petición
// de respuesta y de borrado, y la normalización que hace el worker antes de
// guardar. Lo que NO cubre es que Meta acepte los permisos: eso solo lo dice la
// Graph API real con una cuenta conectada.

const path = require('path');
const Module = require('module');
const base = path.join(__dirname, '..', 'src');

process.env.META_APP_ID = '2232447584255257';
process.env.META_APP_SECRET = 'secreto-de-prueba';

// ── axios interceptado ───────────────────────────────────
const llamadas = [];
let responder = () => ({ data: {} });
const axiosFake = {
  get: async (url, cfg) => { llamadas.push({ metodo:'GET', url, params: cfg?.params }); return responder('GET', url, cfg); },
  post: async (url, cuerpo, cfg) => { llamadas.push({ metodo:'POST', url, cuerpo, params: cfg?.params }); return responder('POST', url, cfg); },
  delete: async (url, cfg) => { llamadas.push({ metodo:'DELETE', url, params: cfg?.params }); return responder('DELETE', url, cfg); },
};

const originalLoad = Module._load;
Module._load = function (pedido) {
  if (pedido === 'axios') return axiosFake;
  return originalLoad.apply(this, arguments);
};

const instagram = require(path.join(base, 'scrapers/instagram.scraper'));

let fallos = 0;
const check = (nombre, ok, extra = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ok || !extra ? '' : `\n      ${extra}`}`);
};

// La forma real que devuelve /{ig-user-id}/media con comments anidados
const RESPUESTA_MEDIA = {
  data: {
    data: [
      {
        id: '178_media_uno',
        caption: 'Nuevo menú de temporada en el local de Miraflores',
        comments: { data: [
          { id: '900001', text: 'La atención fue lentísima', username: 'ana.p', timestamp: '2026-08-05T14:03:00+0000' },
          { id: '900002', text: 'Todo riquísimo, volveré', username: 'luis_t', timestamp: '2026-08-05T15:20:00+0000' },
        ] },
      },
      // Publicación sin comentarios: no debe romper ni aportar filas
      { id: '178_media_dos', caption: 'Feriado abierto', comments: { data: [] } },
      // Publicación sin la clave `comments`: la API la omite cuando no hay
      { id: '178_media_tres', caption: 'Sin comentarios todavía' },
    ],
  },
};

(async () => {
  // ── 1. Lectura de comentarios ──────────────────────────
  responder = () => RESPUESTA_MEDIA;
  llamadas.length = 0;
  const coments = await instagram.obtenerComentariosInstagram('178', 'TOKEN_PAGINA');

  check('lee los comentarios de todas las publicaciones', coments?.length === 2, `${coments?.length} comentarios`);
  check('el externalId lleva el prefijo ig_', coments?.[0]?.externalId === 'ig_900001', coments?.[0]?.externalId);
  check('conserva el id de la publicación', coments?.[0]?.publicacionId === '178_media_uno');
  check('recorta el caption a 120 caracteres', (coments?.[0]?.publicacionCaption || '').length <= 120);
  check('convierte el timestamp a Date', coments?.[0]?.fechaComentario instanceof Date);
  check('no revienta con publicaciones sin comentarios', true);

  const peticion = llamadas[0];
  check('pide media con comments anidados', /\/178\/media$/.test(peticion.url) &&
    /comments\{/.test(peticion.params.fields), peticion.params?.fields);
  check('manda el token como parámetro', peticion.params.access_token === 'TOKEN_PAGINA');

  // ── 2. Sin cuenta conectada ────────────────────────────
  check('sin instagramUserId devuelve null', await instagram.obtenerComentariosInstagram(null, 'TOKEN') === null);
  check('sin token devuelve null', await instagram.obtenerComentariosInstagram('178', null) === null);

  // ── 3. Error de la Graph API ───────────────────────────
  // Devolver null y no [] importa: el worker trata [] como "conectado y sin
  // novedades" y null como "no disponible". Confundirlos haría que un fallo de
  // Meta se leyera como que el negocio no tiene comentarios.
  responder = () => { const e = new Error('fallo'); e.response = { data: { error: { message: 'Invalid OAuth access token' } } }; throw e; };
  check('un error de la API devuelve null, no lista vacía',
    await instagram.obtenerComentariosInstagram('178', 'TOKEN') === null);

  // ── 4. Responder ───────────────────────────────────────
  responder = () => ({ data: { id: '900099' } });
  llamadas.length = 0;
  const r = await instagram.responderComentarioInstagram('ig_900001', 'Lamentamos la demora, lo estamos corrigiendo.', 'TOKEN_PAGINA');
  check('responder confirma con el id de la respuesta', r.ok === true && r.id === '900099', JSON.stringify(r));
  check('quita el prefijo ig_ al llamar a la API', /\/900001\/replies$/.test(llamadas[0].url), llamadas[0]?.url);
  check('manda el mensaje como parámetro', llamadas[0].params.message.startsWith('Lamentamos'));

  // ── 5. Responder con error ─────────────────────────────
  responder = () => { const e = new Error('x'); e.response = { data: { error: { message: 'Comment is not visible' } } }; throw e; };
  const rMal = await instagram.responderComentarioInstagram('ig_900001', 'hola', 'TOKEN');
  check('un rechazo de Meta se propaga como error', !!rMal.error && !rMal.ok, JSON.stringify(rMal));

  // ── 6. Borrar la propia respuesta ──────────────────────
  responder = () => ({ data: { success: true } });
  llamadas.length = 0;
  const d = await instagram.eliminarComentarioInstagram('ig_900099', 'TOKEN_PAGINA');
  check('borra la respuesta propia', d.ok === true, JSON.stringify(d));
  check('borra por id, sin prefijo', llamadas[0].metodo === 'DELETE' && /\/900099$/.test(llamadas[0].url), llamadas[0]?.url);

  // ── 7. Normalización del worker ────────────────────────
  // Se replica el `aFila` de FUENTES_COMENTARIOS para detectar si alguien
  // cambia los nombres de campo del scraper sin tocar el worker.
  const worker = require(path.join(base, 'workers/monitoreo.worker'));
  const fuente = (worker.FUENTES_COMENTARIOS || []).find((f) => f.id === 'INSTAGRAM');
  if (!fuente) {
    check('Instagram está en FUENTES_COMENTARIOS', false, 'no exportado o no registrado');
  } else {
    responder = () => RESPUESTA_MEDIA;
    const crudos = await instagram.obtenerComentariosInstagram('178', 'TOKEN');
    const fila = fuente.aFila(crudos[0]);
    check('Instagram está en FUENTES_COMENTARIOS', true);
    check('aFila mapea publicacion → publicacionId/Titulo',
      fila.publicacionId === '178_media_uno' && typeof fila.publicacionTitulo === 'string');
    check('aFila deja el comentario como pendiente', fila.respondida === false && fila.respuesta === null);
    check('Instagram NO declara moderación remota', !fuente.moderacionRemota,
      'si la declarara, el worker pisaría oculto/fijado con valores que no lee');
  }

  console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLAS ===`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('Error inesperado:', e.message); process.exit(1); });
