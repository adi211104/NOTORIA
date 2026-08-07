// brand-shield/scripts/prueba-instagram-webhook.js
// Webhook de comentarios de Instagram, de punta a punta y sin salir de esta PC:
// axios, Prisma y el notificador van interceptados, así que no llama a la Graph
// API, no toca la base y no manda correos.
//
//   node scripts/prueba-instagram-webhook.js
//
// Cubre lo que puede romperse en silencio:
//  - la firma HMAC (aceptar un evento falsificado sería inyectar comentarios en
//    el panel de un cliente),
//  - el handshake de verificación (si falla, Meta ni siquiera guarda la URL),
//  - el eco de nuestras propias respuestas (alertaría por nuestro mensaje),
//  - y el CONTRATO con el worker: el evento se normaliza a la misma forma que
//    devuelve el scraper, así que si alguien renombra un campo allí, aquí se ve.

const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const base = path.join(__dirname, '..', 'src');

process.env.META_APP_ID = '2232447584255257';
process.env.META_APP_SECRET = 'secreto-de-prueba';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'token-de-verificacion';

// ── Dobles ────────────────────────────────────────────────
const llamadas = [];
const axiosFake = {
  get: async (url, cfg) => {
    llamadas.push({ metodo: 'GET', url, params: cfg?.params });
    if (/\/\d+$/.test(url)) return { data: { caption: 'Nuevo menú de temporada' } };
    return { data: {} };
  },
  post: async (url, cuerpo, cfg) => { llamadas.push({ metodo: 'POST', url, params: cfg?.params }); return { data: { success: true } }; },
  delete: async (url, cfg) => { llamadas.push({ metodo: 'DELETE', url, params: cfg?.params }); return { data: { success: true } }; },
};

const bd = { comentarios: [], alertas: [], negocios: [] };
let secuencia = 0;
const prismaFake = {
  negocio: {
    findMany: async ({ where }) => bd.negocios.filter((n) => n.instagramUserId === where.instagramUserId),
  },
  comentarioSocial: {
    findUnique: async ({ where }) => bd.comentarios.find((c) => c.externalId === where.externalId) || null,
    create: async ({ data }) => { const c = { id: `c${++secuencia}`, ...data }; bd.comentarios.push(c); return c; },
    update: async ({ where, data }) => {
      const c = bd.comentarios.find((x) => x.id === where.id);
      Object.assign(c, data);
      return c;
    },
  },
  alerta: {
    create: async ({ data }) => { const a = { id: `a${++secuencia}`, ...data }; bd.alertas.push(a); return a; },
    update: async ({ where, data }) => {
      const a = bd.alertas.find((x) => x.id === where.id);
      Object.assign(a, data);
      return a;
    },
  },
};

const notificaciones = [];
const notificadorFake = {
  notificar: async (payload) => { notificaciones.push(payload); },
  enviarAlertaTelegram: async () => {},
};

const originalLoad = Module._load;
Module._load = function (pedido) {
  if (pedido === 'axios') return axiosFake;
  if (/lib[\\/]prisma$/.test(pedido)) return prismaFake;
  if (/alerts[\\/]notificador$/.test(pedido)) return notificadorFake;
  return originalLoad.apply(this, arguments);
};

const { firmaValida, verificacion, comentariosDelEvento } = require(path.join(base, 'lib/webhookMeta'));
const { FUENTES_COMENTARIOS } = require(path.join(base, 'workers/monitoreo.worker'));
const webhook = require(path.join(base, 'api/routes/webhooks.routes'));

const FUENTE_IG = FUENTES_COMENTARIOS.find((f) => f.id === 'INSTAGRAM');

let fallos = 0;
const check = (nombre, ok, extra = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ok || !extra ? '' : `\n      ${extra}`}`);
};

const IG_USER_ID = '17841400000000001';

// Forma real de un evento de Instagram con el campo `comments`
const evento = (opciones = {}) => ({
  object: opciones.object || 'instagram',
  entry: [{
    id: opciones.igUserId || IG_USER_ID,
    time: 1786000000,
    changes: [{
      field: opciones.field || 'comments',
      value: {
        id: opciones.comentarioId || '17900000000000001',
        text: opciones.texto || 'Pedí delivery y llegó frío, pésima experiencia',
        from: { id: opciones.autorId || '9988776655', username: opciones.autor || 'ana.p' },
        media: { id: '17800000000000009', media_product_type: 'FEED' },
        ...(opciones.parentId ? { parent_id: opciones.parentId } : {}),
      },
    }],
  }],
});

const firmar = (cuerpo) =>
  'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(cuerpo).digest('hex');

(async () => {
  // ── 1. Handshake de verificación ────────────────────────
  const v1 = verificacion({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-de-verificacion', 'hub.challenge': '1158201444' });
  check('1. Verificación con el token correcto devuelve el challenge', v1.ok && v1.challenge === '1158201444', JSON.stringify(v1));

  check('2. Verificación con token equivocado se rechaza',
    verificacion({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': 'x' }).ok === false);

  check('3. Verificación con hub.mode distinto de subscribe se rechaza',
    verificacion({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'token-de-verificacion' }).ok === false);

  check('4. Sin META_WEBHOOK_VERIFY_TOKEN configurado no se verifica nada',
    verificacion({ 'hub.mode': 'subscribe', 'hub.verify_token': 'lo-que-sea' }, undefined).ok === false);

  check('5. El challenge se devuelve como string, no como número',
    typeof verificacion({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-de-verificacion', 'hub.challenge': 12345 }).challenge === 'string');

  // ── 2. Firma HMAC ───────────────────────────────────────
  const cuerpo = Buffer.from(JSON.stringify(evento()), 'utf8');
  check('6. Firma correcta se acepta', firmaValida(cuerpo, firmar(cuerpo)) === true);
  check('7. Firma de OTRO cuerpo se rechaza', firmaValida(cuerpo, firmar(Buffer.from('{}'))) === false);
  check('8. Cuerpo alterado tras firmar se rechaza',
    firmaValida(Buffer.from(cuerpo.toString().replace('frío', 'rico')), firmar(cuerpo)) === false);
  check('9. Sin cabecera de firma se rechaza', firmaValida(cuerpo, undefined) === false);
  check('10. Algoritmo distinto de sha256 se rechaza',
    firmaValida(cuerpo, 'sha1=' + crypto.createHmac('sha1', process.env.META_APP_SECRET).update(cuerpo).digest('hex')) === false);
  check('11. Firma de longitud distinta no revienta (timingSafeEqual)', firmaValida(cuerpo, 'sha256=abc') === false);
  check('12. Sin secreto de app se rechaza todo', firmaValida(cuerpo, firmar(cuerpo), '') === false);

  // La app tiene DOS secretos posibles: el de la app de Facebook y el de la app
  // de Instagram que aparece en la propia pantalla de webhooks. Meta puede
  // firmar con cualquiera de los dos según el sabor, y rechazar por el
  // equivocado haría que Meta desactive la suscripción con todo el panel
  // aparentando estar bien configurado.
  process.env.META_IG_APP_SECRET = 'secreto-de-instagram';
  const firmadoConIG = 'sha256=' + crypto.createHmac('sha256', 'secreto-de-instagram').update(cuerpo).digest('hex');
  check('12-bis. Un evento firmado con el secreto de la app de INSTAGRAM se acepta',
    firmaValida(cuerpo, firmadoConIG) === true);
  check('12-ter. El secreto de Facebook sigue valiendo con los dos configurados',
    firmaValida(cuerpo, firmar(cuerpo)) === true);
  check('12-quater. Una firma que no es de NINGUNO de los dos se rechaza',
    firmaValida(cuerpo, 'sha256=' + crypto.createHmac('sha256', 'inventado').update(cuerpo).digest('hex')) === false);
  delete process.env.META_IG_APP_SECRET;
  check('12-quinquies. Sin el secreto de Instagram, una firma suya se rechaza',
    firmaValida(cuerpo, firmadoConIG) === false);

  // ── 3. Normalización del evento ─────────────────────────
  const [ev] = comentariosDelEvento(evento());
  check('13. Se extrae el comentario con el id de la cuenta', ev && ev.igUserId === IG_USER_ID);
  check('14. externalId lleva el prefijo ig_ (dedupe con el escaneo)', ev.crudo.externalId === 'ig_17900000000000001');
  check('15. Autor y texto se mapean', ev.crudo.autorNombre === 'ana.p' && ev.crudo.texto.includes('frío'));
  check('16. publicacionId sale de media.id', ev.crudo.publicacionId === '17800000000000009');
  check('17. entry.time se interpreta en SEGUNDOS, no en milisegundos',
    ev.crudo.fechaComentario.getUTCFullYear() === 2026, String(ev.crudo.fechaComentario));

  check('18. Eco propio (from.id = la cuenta) se descarta',
    comentariosDelEvento(evento({ autorId: IG_USER_ID })).length === 0);

  check('19. Eventos de otro producto (object != instagram) se ignoran',
    comentariosDelEvento(evento({ object: 'page' })).length === 0);

  check('20. Campos no suscritos (mentions, story_insights) se ignoran',
    comentariosDelEvento(evento({ field: 'mentions' })).length === 0);

  check('21. Un cuerpo vacío o raro no revienta',
    comentariosDelEvento(null).length === 0 && comentariosDelEvento({ object: 'instagram' }).length === 0);

  check('22. Una respuesta dentro de un hilo se marca como tal',
    comentariosDelEvento(evento({ parentId: '17900000000000000' }))[0].crudo.esRespuesta === true);

  // ── 4. Contrato con el worker ───────────────────────────
  // El evento se normaliza a la MISMA forma que devuelve el scraper, así que el
  // `aFila` de la fuente INSTAGRAM tiene que mapearlo entero. Si alguien
  // renombra un campo en el scraper y no aquí, el comentario se guardaría a
  // medias sin que nada falle.
  const fila = FUENTE_IG.aFila(ev.crudo);
  check('23. aFila del worker mapea el comentario del webhook sin huecos',
    fila.externalId === 'ig_17900000000000001' && fila.texto === ev.crudo.texto &&
    fila.autorNombre === 'ana.p' && fila.publicacionId === '17800000000000009' &&
    fila.fechaComentario instanceof Date && fila.respondida === false,
    JSON.stringify(fila));

  // ── 5. Procesamiento completo ───────────────────────────
  bd.negocios.push({
    id: 'neg1', nombre: 'Restaurante Prueba',
    instagramUserId: IG_USER_ID, instagramAccessToken: 'token-de-pagina',
    usuario: { id: 'u1', email: 'duenio@ejemplo.com', plan: 'NEGOCIO' },
  });

  await webhook.procesarEvento(evento());
  check('24. El comentario se guarda como INSTAGRAM en el negocio dueño',
    bd.comentarios.length === 1 && bd.comentarios[0].plataforma === 'INSTAGRAM' && bd.comentarios[0].negocioId === 'neg1',
    JSON.stringify(bd.comentarios));

  check('25. Se clasifica el sentimiento y se alerta si es negativo',
    bd.comentarios[0].sentimiento === 'negativo' && bd.alertas.length === 1 &&
    bd.alertas[0].tipo === 'COMENTARIO_NEGATIVO' && notificaciones.length === 1,
    `sentimiento=${bd.comentarios[0].sentimiento} alertas=${bd.alertas.length} avisos=${notificaciones.length}`);

  check('26. El caption se pide a la Graph API y se guarda como título',
    bd.comentarios[0].publicacionTitulo === 'Nuevo menú de temporada',
    String(bd.comentarios[0].publicacionTitulo));

  // El mismo evento otra vez: Meta reintenta cuando no recibe el 200 a tiempo.
  await webhook.procesarEvento(evento());
  check('27. Un reintento de Meta no duplica el comentario ni la alerta',
    bd.comentarios.length === 1 && bd.alertas.length === 1 && notificaciones.length === 1);

  // Y el que llegue después por el escaneo periódico tampoco: mismo externalId.
  await webhook.procesarEvento(evento({ comentarioId: '17900000000000002', texto: 'Todo riquísimo, volveré' }));
  check('28. Un comentario positivo se guarda pero NO alerta',
    bd.comentarios.length === 2 && bd.alertas.length === 1,
    `comentarios=${bd.comentarios.length} alertas=${bd.alertas.length}`);

  // Cuenta que ya no está conectada en Notoria pero cuya página sigue suscrita
  const antes = bd.comentarios.length;
  await webhook.procesarEvento(evento({ igUserId: '17841409999999999' }));
  check('29. Evento de una cuenta sin negocio no guarda nada', bd.comentarios.length === antes);

  // Plan GRATIS: mismo corte que el escaneo
  bd.negocios[0].usuario.plan = 'GRATIS';
  await webhook.procesarEvento(evento({ comentarioId: '17900000000000003', texto: 'Mal servicio' }));
  check('30. En plan GRATIS el webhook no guarda comentarios', bd.comentarios.length === antes);
  bd.negocios[0].usuario.plan = 'NEGOCIO';

  // ── 6. Suscripción de la página ─────────────────────────
  const instagram = require(path.join(base, 'scrapers/instagram.scraper'));
  llamadas.length = 0;
  const sus = await instagram.suscribirWebhookInstagram('token-de-pagina');
  const post = llamadas.find((l) => l.metodo === 'POST');
  check('31. Suscribir usa /me/subscribed_apps con el token de PÁGINA',
    sus.ok === true && post.url.endsWith('/me/subscribed_apps') && post.params.access_token === 'token-de-pagina',
    JSON.stringify(post));
  check('32. Se suscribe exactamente al campo comments', post.params.subscribed_fields === 'comments');

  llamadas.length = 0;
  const des = await instagram.desuscribirWebhookInstagram('token-de-pagina');
  const del = llamadas.find((l) => l.metodo === 'DELETE');
  check('33. Desuscribir es un DELETE al mismo endpoint',
    des.ok === true && del.url.endsWith('/me/subscribed_apps'), JSON.stringify(del));

  console.log(`\n${fallos ? `❌ ${fallos} prueba(s) fallaron` : '✅ Todas las pruebas pasaron'}`);
  process.exit(fallos ? 1 : 0);
})();
