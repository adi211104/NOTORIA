// brand-shield/scripts/prueba-escape-emails.js
// Comprueba que el texto escrito por DESCONOCIDOS no puede inyectar HTML en los
// correos que Notoria manda. Resend está simulado: no sale ningún correo.
//
//   node scripts/prueba-escape-emails.js
//
// EL ATAQUE QUE ESTO IMPIDE. Los correos se arman con plantillas literales, y
// dentro se interpolan tres clases de texto que Notoria no escribe:
//
//   · el texto de una reseña de Google  → lo escribe cualquiera con una cuenta
//   · el de un comentario o una mención → igual
//   · la hoja del Libro de Reclamaciones → formulario PÚBLICO y sin registro,
//     porque la Ley 29571 no permite exigir cuenta previa
//
// Sin escapar, una reseña de 1★ cuyo texto sea un `<a href=...>` se convierte en
// un enlace real dentro de un correo que sale del dominio de Notoria, firmado
// con DKIM y alineado con DMARC. Es decir: phishing contra nuestro propio
// cliente, con nuestra credibilidad de remitente detrás, y lo dispara cualquiera
// que pueda escribir una reseña en la ficha del cliente.
//
// ⚠️ Al añadir un correo nuevo que muestre texto que no escribimos nosotros,
// sumar acá su caso. Lo que no está en esta lista, nadie lo vigila.

process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.FRONTEND_URL = 'https://usenotoria.app';

const Module = require('module');

// ── Doble de Resend ───────────────────────────────────────
let enviados = [];
const resendFalso = {
  Resend: class {
    constructor() {
      this.emails = { send: async (msg) => { enviados.push(msg); return { data: { id: 'sim' } }; } };
    }
  },
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'resend') return resendFalso;
  return requireOriginal.apply(this, arguments);
};
const emails = require('../src/utils/emails');
Module.prototype.require = requireOriginal;

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

// La carga útil: un enlace de phishing y una etiqueta que ejecuta.
const ATAQUE = '<a href="https://sitio-falso/pagar">Haz clic para eliminar esta reseña</a><img src=x onerror="alert(1)">';

// Silencia los console.log de los propios enviadores para que el informe se lea.
const callado = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
};

const ultimoHtml = () => enviados[enviados.length - 1].html;

const correr = async () => {
  const usuario = { email: 'dueno@ejemplo.test', nombre: 'Marta Ruiz', idioma: 'es' };
  const negocio = { id: 'neg-1', nombre: 'Cevichería El Muelle' };

  // ── 1. Alerta crítica ───────────────────────────────────
  bloque('1. Alerta crítica (el camino de una reseña de 1★)');
  enviados = [];
  await callado(() => emails.enviarAlertaCritica(usuario, negocio, {
    tipo: 'RESENA_MUY_NEGATIVA',
    descripcion: `Nueva reseña de 1★ de Jayro H.: “${ATAQUE}”`,
  }));
  let html = ultimoHtml();
  check('el enlace del atacante NO queda como enlace real',
    !html.includes('<a href="https://sitio-falso/pagar">'), 'se renderizaría como enlace en el correo del cliente');
  check('la etiqueta <img onerror> tampoco sobrevive',
    !html.includes('<img src=x'));
  check('pero el texto sigue siendo legible para el dueño',
    html.includes('Haz clic para eliminar esta reseña'), 'escapar no puede significar borrar el contenido');
  check('y el resto del correo sigue siendo HTML de verdad',
    html.includes('<h1') && html.includes('Alerta de reputación detectada'));

  // ── 2. Resumen periódico de alertas ─────────────────────
  bloque('2. Resumen semanal/mensual de alertas');
  enviados = [];
  await callado(() => emails.enviarResumenAlertas(usuario, [
    { tipo: 'RESENA_MUY_NEGATIVA', descripcion: ATAQUE, negocio: { nombre: 'Cevichería El Muelle' } },
  ], 'semanal'));
  html = ultimoHtml();
  check('el mismo texto tampoco se cuela en el resumen',
    !html.includes('<a href="https://sitio-falso/pagar">'),
    'es el mismo dato por otro camino: si solo se tapa uno, el agujero sigue abierto');

  // ── 3. Libro de Reclamaciones ───────────────────────────
  bloque('3. Hoja del Libro de Reclamaciones (formulario público, sin registro)');
  const hoja = {
    numero: '2026-000001', creadoEn: new Date(), tipo: 'RECLAMO',
    nombre: ATAQUE, docTipo: 'DNI', documento: '12345678',
    domicilio: ATAQUE, email: 'consumidor@ejemplo.test', telefono: '999888777',
    esMenor: false, tipoBien: 'SERVICIO', descripcion: ATAQUE,
    montoS: 5900, detalle: ATAQUE, pedido: ATAQUE,
  };
  enviados = [];
  await callado(() => emails.enviarCargoReclamacion(hoja));
  html = ultimoHtml();
  check('ningún campo de la hoja inyecta HTML en la constancia del consumidor',
    !html.includes('<a href="https://sitio-falso/pagar">') && !html.includes('<img src=x'));
  check('la tabla de la hoja sigue armándose bien',
    html.includes('<table') && html.includes('2026-000001'));

  enviados = [];
  await callado(() => emails.enviarAvisoReclamacionInterno(hoja));
  html = ultimoHtml();
  check('ni en el aviso interno que le llega a la empresa',
    !html.includes('<a href="https://sitio-falso/pagar">') && !html.includes('<img src=x'));

  // ── 3-bis. El correo de reseña negativa ─────────────────
  //
  // Es el que más reciben los clientes desde el 2026-08-22. Lo que se vigila es
  // que el ASUNTO diga qué pasó (de eso depende que lo abran hoy o mañana) y que
  // los casos sin `detalle` caigan al genérico en vez de romperse — porque por
  // este mismo tipo pasan la escalación de 24h y el aviso de token de Facebook.
  bloque('3-bis. El correo de reseña negativa');
  const alertaResena = (detalle, idioma = 'es') => {
    enviados = [];
    return callado(() => emails.enviarAlertaCritica(
      { ...usuario, idioma }, negocio,
      { tipo: 'RESENA_MUY_NEGATIVA', descripcion: 'texto guardado', detalle },
    )).then(() => enviados[enviados.length - 1]);
  };

  let msg = await alertaResena({ rating: 1, autor: 'Jayro H.', texto: 'esperé una hora y llegó frío' });
  check('el asunto dice la calificación y el negocio',
    msg.subject === 'Reseña de 1★ en Cevichería El Muelle', msg.subject);
  check('el cuerpo cita la reseña', msg.html.includes('esperé una hora y llegó frío'));
  check('  …y nombra a quien la escribió', msg.html.includes('Jayro H.'));
  check('el botón lleva a Reseñas, no a Alertas',
    msg.html.includes('tab=resenas'), 'desde Alertas no se puede responder');
  check('ya no dice "actividad inusual"', !msg.html.includes('actividad inusual'),
    'una reseña de 1★ es mala noticia, no una anomalía estadística');

  msg = await alertaResena({ rating: 1, autor: null, texto: null });
  check('sin texto ni autor, el asunto sigue sirviendo',
    msg.subject.includes('1★'), msg.subject);
  check('  …y no inventa una cita vacía', !msg.html.includes('“”'));

  msg = await alertaResena({ rating: 2, autor: 'Ana', texto: 'malo', motivoSospecha: 'texto_duplicado' });
  check('si el detector la marcó, el correo lo dice',
    msg.html.includes('señales de no ser auténtica'));

  msg = await alertaResena({ rating: 1, autor: 'Jayro H.', texto: 'cold' }, 'en');
  check('en inglés el asunto también', msg.subject === '1★ review on Cevichería El Muelle', msg.subject);
  check('  …y el cuerpo', msg.html.includes('just came in') && msg.html.includes('Reply now'));

  // Los tres que comparten el tipo pero NO traen detalle
  enviados = [];
  await callado(() => emails.enviarAlertaCritica(usuario, negocio, {
    tipo: 'RESENA_MUY_NEGATIVA', plataforma: 'GOOGLE',
    descripcion: 'Una reseña de 1★ en Cevichería El Muelle lleva más de 24h sin respuesta.',
  }));
  msg = ultimoHtml();
  check('la escalación de 24h (sin detalle) cae al genérico y NO se rompe',
    msg.includes('lleva más de 24h sin respuesta'));

  enviados = [];
  await callado(() => emails.enviarAlertaCritica(usuario, negocio, {
    tipo: 'FICHA_ALTERADA', descripcion: 'Tu ficha de Google aparece como cerrada permanentemente.',
  }));
  msg = ultimoHtml();
  check('la ficha alterada sigue llegando entera', msg.includes('cerrada permanentemente'));
  check('  …y su intro ya no habla de anomalías', !msg.includes('actividad inusual'));

  // ── 4. Que el escape no rompa el español ────────────────
  bloque('4. El escape no puede estropear el texto normal');
  enviados = [];
  await callado(() => emails.enviarAlertaCritica(usuario, negocio, {
    tipo: 'RESENA_MUY_NEGATIVA',
    descripcion: 'Nueva reseña de 1★ de Tito\'s Bar: “demoró & salió frío”',
  }));
  html = ultimoHtml();
  check('la estrella ★ se conserva', html.includes('★'));
  check('el apóstrofo de un nombre real no desaparece',
    html.includes('Tito&#39;s') || html.includes("Tito's"), 'un cliente llamado Tito\'s existe');
  check('el ampersand se escapa como entidad, no se pierde',
    html.includes('&amp;') && !html.includes('demoró & salió'));

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
