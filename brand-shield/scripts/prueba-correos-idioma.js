// brand-shield/scripts/prueba-correos-idioma.js
// Vigila que los correos que deben ser bilingües lo sean DE VERDAD — plantilla
// traducida Y consulta que trae el idioma. Resend está simulado: no sale nada.
//
//   node scripts/prueba-correos-idioma.js
//
// POR QUÉ EXISTE, y por qué no bastaba con traducir plantillas.
//
// Este fallo apareció dos veces el mismo día (2026-08-23) por dos caminos
// distintos, y las dos veces la plantilla estaba bien:
//
//   · `enviarAlertaCritica` ya era bilingüe desde el 22, pero los `select` del
//     worker no pedían `idioma`. Llegaba `undefined`, caía al fallback y TODA
//     alerta salía en español.
//   · `enviarResumenSemanal` —el correo que más manda el producto, 38 envíos—
//     no estaba traducido en absoluto, y su worker tampoco pedía `idioma`.
//
// 🔴 La lección: son DOS mitades y fallar cualquiera da el mismo resultado
// silencioso. Nada revienta, nada aparece en los logs; el correo sale, se
// entrega, y está en el idioma que no es. Por eso esta prueba comprueba las dos
// mitades, y la segunda **leyendo el fuente del worker** — un doble de Prisma
// nunca podría verla, porque el mock devuelve el objeto entero.
//
// ⚠️ Al añadir un correo nuevo, decidir a qué lista va: BILINGUES o
// SOLO_ESPANOL. No hay tercera opción, y dejarlo fuera de las dos hace fallar
// esta prueba a propósito.

process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.FRONTEND_URL = 'https://usenotoria.app';

const fs = require('fs');
const path = require('path');
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

const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
const fuenteEmails = leer('utils', 'emails.js');

// ── El inventario, que es media prueba ────────────────────
//
// Cada correo del producto va en una de las dos listas. Los de la segunda están
// en español a propósito y el motivo va escrito: si alguien los traduce, que sea
// una decisión y no un descuido.
const BILINGUES = [
  'enviarVerificacion', 'enviarAlertaCritica', 'enviarDrip',
  'enviarResumenSemanal', 'enviarResumenSemanalConsolidado', 'enviarResumenAlertas',
  'enviarBienvenida', 'enviarConfirmacionContrasena', 'enviarRecuperacionContrasena',
  'enviarConfirmacionCambioPassword', 'enviarCobroFallido', 'enviarCancelacion',
  'enviarInvitacionEquipo', 'enviarAvisoNuevoMiembro', 'enviarSalidaEquipo',
];

// Los cinco que quedan están en español POR DECISIÓN, y el motivo va escrito.
// Traducirlos sería un error, no una mejora: cuatro son piezas del Libro de
// Reclamaciones —un instrumento legal peruano cuya constancia tiene que decir lo
// que dice la norma— y el quinto acompaña a un comprobante electrónico de SUNAT.
const SOLO_ESPANOL = {
  enviarComprobante: 'DELIBERADO: acompaña un comprobante electrónico peruano; el documento fiscal es en español',
  enviarCargoReclamacion: 'DELIBERADO: Libro de Reclamaciones, instrumento legal peruano (Ley 29571)',
  enviarAvisoReclamacionInterno: 'DELIBERADO: va a contabilidad, no a un cliente',
  enviarRespuestaReclamacion: 'DELIBERADO: Libro de Reclamaciones',
  enviarAvisoPlazoReclamaciones: 'DELIBERADO: aviso interno',
};

// Extrae el cuerpo de una función `const nombre = async (...) => { ... };`
const cuerpo = (nombre) => {
  const i = fuenteEmails.indexOf(`const ${nombre} = async`);
  if (i === -1) return null;
  const fin = fuenteEmails.indexOf('\n};', i);
  return fuenteEmails.slice(i, fin === -1 ? undefined : fin);
};

const usaIdioma = (nombre) => {
  const c = cuerpo(nombre);
  if (c === null) return null;
  // O lee `usuario.idioma` directo, o pasa por un ayudante que lo hace
  // (`textosResumen`), que es el patrón de los tres resúmenes.
  return /usuario\??\.idioma/.test(c) || /textos(Resumen|Cuenta|Equipo)\(/.test(c);
};

const correr = async () => {
  // ── 1. El inventario está completo ──────────────────────
  bloque('1. Todo correo del producto está clasificado');

  const declarados = fuenteEmails.match(/const (enviar[A-Za-z]+) = async/g).map((m) => m.match(/const (\w+)/)[1]);
  const clasificados = new Set([...BILINGUES, ...Object.keys(SOLO_ESPANOL)]);
  const huerfanos = declarados.filter((f) => !clasificados.has(f));

  check(`los ${declarados.length} correos del producto están en una de las dos listas`,
    huerfanos.length === 0,
    huerfanos.length ? `sin clasificar: ${huerfanos.join(', ')}` : '');

  const fantasmas = [...clasificados].filter((f) => !declarados.includes(f));
  check('y ninguna lista nombra un correo que ya no existe',
    fantasmas.length === 0, fantasmas.join(', '));

  // ── 2. Los bilingües lo son de verdad ───────────────────
  bloque('2. Los que deben ser bilingües leen el idioma');
  for (const f of BILINGUES) check(`${f}`, usaIdioma(f) === true);

  // ── 3. Y los otros no lo fingen ─────────────────────────
  bloque('3. Los declarados solo-español no leen idioma (o hay que moverlos de lista)');
  const traducidosSinDeclarar = Object.keys(SOLO_ESPANOL).filter((f) => usaIdioma(f) === true);
  check('ninguno se tradujo sin actualizar la lista',
    traducidosSinDeclarar.length === 0,
    traducidosSinDeclarar.length ? `ya son bilingües, muévelos a BILINGUES: ${traducidosSinDeclarar.join(', ')}` : '');

  // ── 4. La otra mitad: los select de los workers ─────────
  bloque('4. 🔴 Las consultas que alimentan esos correos traen `idioma`');

  const workerMonitoreo = leer('workers', 'monitoreo.worker.js');
  const workerResumen = leer('workers', 'resumenSemanal.worker.js');
  const workerDrip = leer('workers', 'drip.worker.js');

  // Todo select de usuario que pida `prefsAlertas` alimenta un correo bilingüe
  // (las alertas o su digest), así que todos tienen que pedir el idioma.
  const VENTANA = 1500;
  const selects = [];
  for (let i = workerMonitoreo.indexOf('prefsAlertas: true'); i !== -1; i = workerMonitoreo.indexOf('prefsAlertas: true', i + 1)) {
    selects.push(workerMonitoreo.slice(Math.max(0, i - VENTANA), i + VENTANA));
  }
  check(`monitoreo.worker: los ${selects.length} select con prefsAlertas piden idioma`,
    selects.length > 0 && selects.every((v) => v.includes('idioma: true')),
    'sin idioma la alerta y su resumen salen siempre en español');

  check('resumenSemanal.worker: el select del usuario pide idioma',
    /usuario: \{ select: \{[^}]*idioma: true/.test(workerResumen),
    'es el correo que más manda el producto');

  check('drip.worker: el select del usuario pide idioma',
    /idioma: true/.test(workerDrip));

  // 🔴 La raíz de todo: `req.usuario`. Casi todos los correos que se mandan
  // desde una ruta autenticada lo usan, así que si el middleware no pide el
  // idioma, no hay ruta que pueda arreglarlo por su cuenta.
  check('auth.middleware: req.usuario trae idioma',
    /idioma: true/.test(leer('api', 'middlewares', 'auth.middleware.js')),
    'sin esto, cada ruta que mande un correo repite el mismo fallo');

  for (const [archivo, ruta] of [['equipo', ['api', 'routes', 'equipo.routes.js']], ['pago', ['api', 'routes', 'pago.routes.js']], ['auth', ['api', 'routes', 'auth.routes.js']]]) {
    check(`${archivo}.routes: sus consultas de usuario piden idioma`, /idioma: true|idioma: usuario\.idioma/.test(leer(...ruta)));
  }

  // ── 5. El insight de IA acompaña al idioma ──────────────
  bloque('5. El insight que escribe la IA sale en el mismo idioma que el correo');

  check('hay un prompt por idioma, no uno fijo en español',
    /PROMPT_INSIGHT = \{/.test(workerResumen) && /PROMPT_INSIGHT\.es/.test(workerResumen),
    'un correo en inglés con una frase suelta en español se lee peor que sin insight');
  check('  …y se le pasa el idioma del usuario al generarlo',
    /generarInsightSemanal\(negocio, cifras\._resenas, usuario\?\.idioma\)/.test(workerResumen));

  // ── 6. Prueba de salida: los dos idiomas de verdad ──────
  bloque('6. Renderizado real: el mismo correo en los dos idiomas');

  const negocio = { id: 'n1', nombre: 'Cevichería El Muelle' };
  const datos = { ratingActual: 4.2, variacion: -0.1, resenasNuevas: 7, insight: null };

  enviados = [];
  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'Marta', idioma: 'es' }, negocio, datos);
  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'Marta', idioma: 'en' }, negocio, datos);
  const [es, en] = enviados;

  check('el asunto cambia con el idioma', es.subject !== en.subject, `${es.subject} / ${en.subject}`);
  check('  …el español dice "resumen semanal"', /resumen semanal/i.test(es.subject));
  check('  …y el inglés "weekly summary"', /weekly summary/i.test(en.subject));
  check('las etiquetas de las cifras también se traducen',
    es.html.includes('Reseñas nuevas') && en.html.includes('New reviews'));
  check('  …y no queda ninguna etiqueta en español en el correo inglés',
    !/Rating actual|Variación 7 días|Reseñas nuevas/.test(en.html));
  check('el botón se traduce', /Ver panel/.test(es.html) && /Open dashboard/.test(en.html));

  enviados = [];
  const alertas = [{ tipo: 'RESENA_MUY_NEGATIVA', descripcion: 'Una reseña de 1★', negocio: { nombre: 'El Muelle' } }];
  await emails.enviarResumenAlertas({ email: 'a@b.c', nombre: 'Marta', idioma: 'es' }, alertas, 'semanal');
  await emails.enviarResumenAlertas({ email: 'a@b.c', nombre: 'Marta', idioma: 'en' }, alertas, 'semanal');
  check('🔴 el digest de alertas traduce el PERIODO, que llegaba ya redactado',
    /resumen semanal de alertas/i.test(enviados[0].subject) && /weekly alert summary/i.test(enviados[1].subject),
    `${enviados[0].subject} / ${enviados[1].subject}`);

  enviados = [];
  await emails.enviarResumenAlertas({ email: 'a@b.c', nombre: 'Marta', idioma: 'en' }, alertas, 'mensual');
  check('  …también "mensual"', /monthly/i.test(enviados[0].subject), enviados[0].subject);

  // ── 6b. Los correos de cuenta y de equipo ───────────────
  bloque('6b. Cuenta y equipo, en los dos idiomas');

  const usr = (idioma) => ({ email: 'a@b.c', nombre: 'Marta Quispe', idioma, plan: 'NEGOCIO' });

  enviados = [];
  await emails.enviarBienvenida(usr('es'));
  await emails.enviarBienvenida(usr('en'));
  check('bienvenida', /Bienvenido a Notoria/.test(enviados[0].subject) && /Welcome to Notoria/.test(enviados[1].subject));
  check('  …y sus 3 pasos también se traducen',
    /Google Maps/.test(enviados[1].html) && !/Agrega tu restaurante/.test(enviados[1].html));

  enviados = [];
  const fin = new Date('2026-09-15T12:00:00');
  await emails.enviarCancelacion(usr('es'), fin);
  await emails.enviarCancelacion(usr('en'), fin);
  check('cancelación', /Cancelaste/.test(enviados[0].subject) && /cancelled/i.test(enviados[1].subject));
  // ⚠️ El mes va con `es-PE`, y esa configuración regional escribe **«setiembre»**
  // sin la p — que es la grafía correcta en Perú, no una errata. Comprobarlo con
  // /septiembre/ hace fallar una prueba sobre un código que está bien.
  check('🔴   …y la FECHA se formatea en el idioma del destinatario',
    /setiembre/.test(enviados[0].html) && /September/.test(enviados[1].html),
    'estaba fija con toLocaleDateString("es-PE"): metía "15 de setiembre" en un párrafo en inglés');

  enviados = [];
  const proximo = new Date('2026-08-29T12:00:00');
  await emails.enviarCobroFallido(usr('en'), { intento: 1, maxIntentos: 3, monto: 5900, moneda: 'PEN', proximoIntento: proximo });
  check('🔴 cobro fallido: el próximo intento llega como fecha, no como texto ya hecho',
    /August 29/.test(enviados[0].html) && !/de agosto/.test(enviados[0].html), enviados[0].subject);

  enviados = [];
  const inv = { email: 'x@y.z', cuenta: 'Cevichería El Muelle', invitadoPor: 'Marta', rol: 'GESTOR', token: 'tk', negocios: [] };
  await emails.enviarInvitacionEquipo({ ...inv, idioma: 'es' });
  await emails.enviarInvitacionEquipo({ ...inv, idioma: 'en' });
  check('invitación de equipo', /te invitó a gestionar/.test(enviados[0].subject) && /invited you to manage/.test(enviados[1].subject));
  check('  …y el ROL se traduce (Gestor / Manager)',
    /<strong>Gestor<\/strong>/.test(enviados[0].html) && /<strong>Manager<\/strong>/.test(enviados[1].html));

  enviados = [];
  await emails.enviarSalidaEquipo({ miembro: { email: 'x@y.z', idioma: 'en' }, cuenta: 'El Muelle' });
  check('salida de equipo usa el idioma de QUIEN PIERDE el acceso, no del dueño',
    /no longer have access/.test(enviados[0].subject), enviados[0].subject);

  enviados = [];
  await emails.enviarAvisoNuevoMiembro({ propietario: { email: 'd@e.f', idioma: 'en' }, miembro: { nombre: 'Ana', email: 'a@n.a' }, rol: 'LECTOR' });
  check('aviso de nuevo miembro usa el idioma del PROPIETARIO, que es quien lo recibe',
    /now has access/.test(enviados[0].subject), enviados[0].subject);

  // ── 7. Un idioma desconocido no rompe nada ──────────────
  bloque('7. Un idioma que no existe cae al español, no a undefined');

  enviados = [];
  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'Marta', idioma: 'pt' }, negocio, datos);
  check('idioma desconocido → español', /resumen semanal/i.test(enviados[0].subject));
  enviados = [];
  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'Marta' }, negocio, datos);
  check('sin idioma → español, y sin "undefined" en el cuerpo',
    /resumen semanal/i.test(enviados[0].subject) && !/undefined/.test(enviados[0].html));

  // ── Resumen ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
