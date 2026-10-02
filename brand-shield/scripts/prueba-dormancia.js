// brand-shield/scripts/prueba-dormancia.js
// Pruebas de la pausa de cuentas gratuitas inactivas, con Prisma y Resend
// SIMULADOS: no toca la base, no manda correos y no necesita servidor.
//
//   node scripts/prueba-dormancia.js
//
// QUÉ SE VIGILA ACÁ, Y POR QUÉ ES CASI TODO SOBRE SILENCIOS
// ─────────────────────────────────────────────────────────
// Esta palanca deja de hacer algo. O sea que cuando se rompe, NADA falla: no hay
// excepción, no hay log, no hay 500. Solo cambia a quién se escanea — y los dos
// sentidos del error son invisibles desde fuera y cuestan cosas muy distintas:
//
//   · se duerme de MÁS  →  a alguien se le apaga la vigilancia que sí debería
//     tener. Si además paga, es dejar de prestarle un servicio comprado. Su ficha
//     deja de mirarse y él no ve un solo error en pantalla: el historial
//     simplemente se congela. Es el peor de los dos y por eso tiene más pruebas.
//
//   · se duerme de MENOS  →  vuelve la sangría de Places que esto vino a parar.
//     No rompe nada; solo no converge. Nadie lo notaría hasta la factura de
//     Google, que además no dice de quién fue cada consulta.
//
// Y una tercera, que es la que hace que esto sea honesto: si el AVISO deja de
// salir, la pausa sigue ocurriendo igual y pasa a ser silenciosa. Eso convierte
// una regla de producto defendible en apagarle la vigilancia a alguien sin
// decírselo.

const fs = require('fs');
const path = require('path');
const Module = require('module');

// 🔴 El singleton de Prisma se intercepta ANTES de cargar nada del backend.
// `pausa.worker.js` hace `require('../lib/prisma')` en su cabecera, así que con
// solo importarlo se abría una conexión a la base de PRODUCCIÓN —el `.env` local
// apunta ahí— y la suite imprimía «Base de datos conectada» mientras su propio
// encabezado prometía no tocar la base. Que el worker acepte un `deps.prisma`
// no evita eso: lo que conecta es cargar el módulo, no llamarlo.
const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id.endsWith('/prisma')) {
    return { usuario: { findMany: async () => [], update: async () => ({}) } };
  }
  return requireOriginal.apply(this, arguments);
};

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-09-19T15:00:00Z').getTime();
const hace = (d) => new Date(AHORA - d * DIA);

const dormancia = require('../src/lib/dormancia');
const { capacidades, ORDEN, PLANES_DE_PAGO } = require('../src/lib/planes');

// Una cuenta gratuita sana: verificada, entró ayer.
const cuenta = (extra = {}) => ({
  id: 'u1', email: 'due@no.pe', nombre: 'Dueño', idioma: 'es',
  plan: 'GRATIS', emailVerificado: true,
  creadoEn: hace(90), ultimoAcceso: hace(1),
  ...extra,
});

// ── Lectura de fuente, sin comentarios ────────────────────
//
// 🔴 Todo barrido de fuente de este proyecto pasa por acá desde el 2026-09-09,
// cuando el patrón «la sonda acusa a su propio comentario» apareció CUATRO veces
// en un día. Un grep a secas no distingue una línea de código de la línea que la
// documenta — y estos archivos documentan mucho.
const sinComentarios = (txt) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const leerLimpio = (...p) => sinComentarios(leer(...p));

const correr = async () => {
  console.log('\n🧪 Pausa de cuentas gratuitas inactivas (lib/dormancia.js)\n');

  // ══════════════════════════════════════════════════════════
  bloque('1. La guarda del que paga — el error más caro de los dos');

  for (const plan of PLANES_DE_PAGO) {
    check(`${plan} NO se duerme ni con 2 años sin entrar`,
      dormancia.motivoDormida({ ...cuenta(), plan, ultimoAcceso: hace(730) }, AHORA) === null,
      'no entrar es EXACTAMENTE lo que se le vendió: «no tienes que estar mirando»');
  }
  check('un plan de pago sin verificar tampoco se duerme',
    dormancia.motivoDormida({ ...cuenta(), plan: 'NEGOCIO', emailVerificado: false, creadoEn: hace(400) }, AHORA) === null,
    'pagó; el correo sin confirmar es otro problema y no se arregla apagándole el servicio');

  // El control: la MISMA cuenta en GRATIS sí se duerme. Sin esto, los checks de
  // arriba pasarían igual si motivoDormida devolviera null siempre.
  check('CONTROL — la misma cuenta en GRATIS sí se duerme',
    dormancia.motivoDormida({ ...cuenta(), ultimoAcceso: hace(730) }, AHORA) === 'INACTIVA',
    'si esto no pasa, los checks de arriba no prueban nada');

  bloque('1-bis. Un plan que NO está en la tabla tampoco se duerme');

  check('un plan desconocido se deja en paz',
    dormancia.motivoDormida({ ...cuenta(), plan: 'PREMIUM', ultimoAcceso: hace(730) }, AHORA) === null,
    'capacidades() lo hace caer a GRATIS, que es correcto para negar una función y al revés acá');
  check('tampoco se le avisa de una pausa que no va a ocurrir',
    dormancia.tocaAvisar({ ...cuenta(), plan: 'PREMIUM', ultimoAcceso: hace(27.5) }, AHORA) === false);
  check('plan null / undefined / vacío: se deja en paz',
    [null, undefined, ''].every((p) =>
      dormancia.motivoDormida({ ...cuenta(), plan: p, ultimoAcceso: hace(730) }, AHORA) === null));
  check('CONTROL — ORDEN reconoce los cuatro planes de verdad',
    ORDEN.length === 4 && ORDEN.every((p) => capacidades(p)
      && dormancia.motivoDormida({ ...cuenta(), plan: p, ultimoAcceso: hace(1) }, AHORA) === null),
    'si ORDEN llegara vacío, el check de arriba pasaría sin proteger a nadie');

  // ══════════════════════════════════════════════════════════
  bloque('2. La referencia de actividad, y el null que NO significa «nunca entró»');

  check('con ultimoAcceso, manda ultimoAcceso',
    dormancia.referencia(cuenta({ ultimoAcceso: hace(5), creadoEn: hace(90) })).getTime() === hace(5).getTime());
  check('sin ultimoAcceso cae a creadoEn',
    dormancia.referencia(cuenta({ ultimoAcceso: null, creadoEn: hace(90) })).getTime() === hace(90).getTime());
  check('sin ninguno de los dos devuelve null, no una fecha inventada',
    dormancia.referencia({ plan: 'GRATIS' }) === null);

  // 🔴 El caso del DÍA DEL DESPLIEGUE. Toda cuenta anterior a la columna tiene
  // ultimoAcceso en null. Tratar ese null como «inactiva desde siempre» habría
  // apagado de golpe la vigilancia de todas las cuentas gratuitas existentes.
  check('una cuenta RECIÉN creada sin ultimoAcceso no se duerme',
    dormancia.motivoDormida(cuenta({ ultimoAcceso: null, creadoEn: hace(2) }), AHORA) === null);
  check('una cuenta VIEJA sin ultimoAcceso sí, porque su alta ya es antigua',
    dormancia.motivoDormida(cuenta({ ultimoAcceso: null, creadoEn: hace(90) }), AHORA) === 'INACTIVA');
  check('y entrar la despierta aunque el alta sea antiquísima',
    dormancia.motivoDormida(cuenta({ ultimoAcceso: hace(0), creadoEn: hace(900) }), AHORA) === null,
    'la pausa se DERIVA de la fecha: no hay estado guardado que pueda quedar desincronizado');

  // ══════════════════════════════════════════════════════════
  bloque('3. Los dos motivos, y el borde exacto de cada umbral');

  check(`a los ${dormancia.DIAS_INACTIVIDAD} días justos ya está dormida`,
    dormancia.motivoDormida(cuenta({ ultimoAcceso: hace(dormancia.DIAS_INACTIVIDAD) }), AHORA) === 'INACTIVA');
  check('un pelo antes del umbral, todavía no',
    dormancia.motivoDormida(cuenta({ ultimoAcceso: hace(dormancia.DIAS_INACTIVIDAD - 0.01) }), AHORA) === null);
  check(`sin verificar a los ${dormancia.DIAS_SIN_VERIFICAR} días: SIN_VERIFICAR`,
    dormancia.motivoDormida(cuenta({ emailVerificado: false, creadoEn: hace(dormancia.DIAS_SIN_VERIFICAR), ultimoAcceso: hace(0) }), AHORA) === 'SIN_VERIFICAR',
    'aunque haya entrado hoy: a ese buzón no se le puede escribir');
  check('sin verificar pero DENTRO de la ventana: se la deja en paz',
    dormancia.motivoDormida(cuenta({ emailVerificado: false, creadoEn: hace(3), ultimoAcceso: hace(0) }), AHORA) === null,
    'el producto todavía le está insistiendo con el recordatorio de activación');
  check('SIN_VERIFICAR gana a INACTIVA cuando se dan los dos',
    dormancia.motivoDormida(cuenta({ emailVerificado: false, creadoEn: hace(90), ultimoAcceso: hace(90) }), AHORA) === 'SIN_VERIFICAR',
    'los dos se arreglan distinto, así que el motivo que viaja al log tiene que ser el accionable');
  check('estaDormida() dice lo mismo que motivoDormida()',
    dormancia.estaDormida(cuenta({ ultimoAcceso: hace(90) }), AHORA) === true
    && dormancia.estaDormida(cuenta(), AHORA) === false);

  // 🔑 El acople que vale la pena fijar: los 10 días no son un número elegido,
  // son la ventana en la que verificacion.worker.js deja de insistir.
  const { VENTANA_DIAS } = require('../src/lib/verificacion');
  check(`DIAS_SIN_VERIFICAR (${dormancia.DIAS_SIN_VERIFICAR}) = la ventana en que el producto deja de insistir (${VENTANA_DIAS.hasta})`,
    dormancia.DIAS_SIN_VERIFICAR === VENTANA_DIAS.hasta,
    'si se separan, o se gasta en una cuenta a la que ya nadie escribe, o se la apaga mientras aún se le insiste');

  // ══════════════════════════════════════════════════════════
  bloque('4. El aviso previo: una ventana de UN día, no «a partir de»');

  const umbral = dormancia.DIAS_INACTIVIDAD - dormancia.DIAS_AVISO_PREVIO;
  check(`avisa el día ${umbral}`,
    dormancia.tocaAvisar(cuenta({ ultimoAcceso: hace(umbral + 0.2) }), AHORA) === true);
  check('NO vuelve a avisar al día siguiente',
    dormancia.tocaAvisar(cuenta({ ultimoAcceso: hace(umbral + 1.2) }), AHORA) === false,
    'un «>= umbral» mandaría cuatro correos para una sola pausa, que es lo que enseña a ignorarlos');
  check('NO avisa antes de tiempo',
    dormancia.tocaAvisar(cuenta({ ultimoAcceso: hace(umbral - 0.5) }), AHORA) === false);
  check('NO avisa a quien YA está dormida (llega tarde y no aporta nada)',
    dormancia.tocaAvisar(cuenta({ ultimoAcceso: hace(60) }), AHORA) === false);
  check('NO avisa a quien no verificó el correo',
    dormancia.tocaAvisar(cuenta({ emailVerificado: false, ultimoAcceso: hace(umbral + 0.2) }), AHORA) === false,
    'ya recibió sus dos recordatorios; un tercero a un buzón sin confirmar es spam');

  // 45 días de cron sobre la misma persona, que no vuelve a entrar nunca:
  // exactamente UN correo.
  let vecesQueAvisa = 0;
  for (let d = 0; d <= 45; d++) {
    if (dormancia.tocaAvisar(cuenta({ ultimoAcceso: hace(0) }), AHORA + d * DIA)) vecesQueAvisa++;
  }
  check('45 días de cron sobre la misma cuenta = UN solo aviso',
    vecesQueAvisa === 1, `salieron ${vecesQueAvisa}`);

  bloque('4-bis. Los días que dice el correo');

  check('diasParaPausa redondea HACIA ARRIBA, a favor de quien lo lee',
    dormancia.diasParaPausa(cuenta({ ultimoAcceso: hace(umbral + 0.6) }), AHORA) === 3,
    'decirle «quedan 2» cuando quedan 2,4 le haría creer que ya no llega');
  check('nunca devuelve un número negativo',
    dormancia.diasParaPausa(cuenta({ ultimoAcceso: hace(90) }), AHORA) === 0);
  check('sin referencia devuelve null, no 0',
    dormancia.diasParaPausa({ plan: 'GRATIS' }, AHORA) === null,
    '0 diría «se pausa hoy»; null dice «no lo sabemos», que es otra cosa');

  // ══════════════════════════════════════════════════════════
  bloque('5. La cadencia del gratuito: un mes entero, y después más espaciado');

  const capGratis = capacidades('GRATIS');
  check('el primer día corre a la cadencia completa',
    dormancia.horasEscaneo(cuenta({ creadoEn: hace(0) }), AHORA) === capGratis.horasEscaneo);
  check(`el día ${capGratis.diasPruebaCompleta - 1} todavía`,
    dormancia.horasEscaneo(cuenta({ creadoEn: hace(capGratis.diasPruebaCompleta - 1) }), AHORA) === capGratis.horasEscaneo,
    'el primer mes se entrega entero: es la ventana en la que la persona decide si esto le sirve');
  check(`el día ${capGratis.diasPruebaCompleta} pasa a ${capGratis.horasEscaneoTrasPrueba} h`,
    dormancia.horasEscaneo(cuenta({ creadoEn: hace(capGratis.diasPruebaCompleta) }), AHORA) === capGratis.horasEscaneoTrasPrueba);

  for (const plan of PLANES_DE_PAGO) {
    check(`${plan} conserva su cadencia fija a los 2 años`,
      dormancia.horasEscaneo({ plan, creadoEn: hace(730) }, AHORA) === capacidades(plan).horasEscaneo,
      'quien paga no tiene periodo de prueba: contrató una cadencia');
  }
  check('un usuario undefined cae a la cadencia del gratuito y no revienta',
    dormancia.horasEscaneo(undefined, AHORA) === capGratis.horasEscaneo);

  // 🔴 Los dos números por plan viven en planes.js, NO acá. Una tabla por plan
  // fuera de ese archivo es lo que costó los tres fallos silenciosos de IMPULSO.
  const fuenteDorm = leerLimpio('src', 'lib', 'dormancia.js');
  check('dormancia.js NO tiene su propia tabla de horas por plan',
    !/GRATIS\s*:\s*\d+/.test(fuenteDorm) && !/IMPULSO\s*:/.test(fuenteDorm),
    'los límites por plan se declaran en planes.js y acá solo se aplican (§8.6)');
  check('y los lee de capacidades()',
    fuenteDorm.includes('capacidades(usuario?.plan)') || fuenteDorm.includes('capacidades(usuario.plan)'));

  // ══════════════════════════════════════════════════════════
  bloque('6. marcarAcceso — sobre la llamada REAL, no sobre una regex');

  const escrituras = [];
  const prismaEscritor = {
    usuario: {
      update: async ({ where, data, select }) => { escrituras.push({ where, data, select }); return { id: where.id }; },
    },
  };

  escrituras.length = 0;
  check('sin marca previa, escribe',
    (await dormancia.marcarAcceso(prismaEscritor, { id: 'u1', ultimoAcceso: null })) === true && escrituras.length === 1);
  check('escribe UN SOLO campo',
    Object.keys(escrituras[0].data).length === 1 && 'ultimoAcceso' in escrituras[0].data,
    'cualquier otro campo que se cuele pisaría lo que el usuario acabe de guardar en otra pestaña');
  check('y pide de vuelta lo mínimo',
    escrituras[0].select && Object.keys(escrituras[0].select).join() === 'id');

  escrituras.length = 0;
  check(`no reescribe dentro de las ${dormancia.HORAS_REFRESCO_ACCESO} h de throttle`,
    (await dormancia.marcarAcceso(prismaEscritor, { id: 'u1', ultimoAcceso: new Date(Date.now() - 60 * 1000) })) === false
    && escrituras.length === 0,
    'sin throttle sería un UPDATE por cada carga del panel, y el panel pide el perfil en cada navegación');
  check('pasado el throttle vuelve a escribir',
    (await dormancia.marcarAcceso(prismaEscritor, { id: 'u1', ultimoAcceso: new Date(Date.now() - (dormancia.HORAS_REFRESCO_ACCESO + 1) * 3600000) })) === true);
  check('el throttle le sobra de lejos al umbral de la pausa',
    dormancia.HORAS_REFRESCO_ACCESO / 24 < dormancia.DIAS_INACTIVIDAD / 10,
    'la precisión de la marca tiene que ser mucho más fina que la ventana que decide');

  // 🔴 Lo que NUNCA puede hacer: romper la petición que la llama. Cuelga del
  // login y de la carga del perfil, o sea de las dos rutas por las que pasa todo
  // el mundo.
  const prismaRoto = { usuario: { update: async () => { throw new Error('la base se cayó'); } } };
  let reventó = false, resultado = null;
  try { resultado = await dormancia.marcarAcceso(prismaRoto, { id: 'u1', ultimoAcceso: null }); }
  catch { reventó = true; }
  check('si la base falla, NO propaga la excepción',
    !reventó && resultado === false,
    'cambiar un problema de costo por uno de disponibilidad sería un pésimo negocio');
  check('un usuario sin id no intenta escribir',
    (await dormancia.marcarAcceso(prismaRoto, {})) === false);

  // ══════════════════════════════════════════════════════════
  bloque('7. Las TRES puertas de entrada marcan el acceso');

  const auth = leerLimpio('src', 'api', 'routes', 'auth.routes.js');
  const puertas = (auth.match(/dormancia\.marcarAcceso\(/g) || []).length;
  check('auth.routes.js llama a marcarAcceso en las tres puertas', puertas >= 3, `encontradas ${puertas}`);

  // 🔴 La de Google es la que más fácil se olvida y la más cara: buena parte del
  // padrón entra siempre por ahí, y sin esta línea acumularían 30 días de
  // «inactividad» usando el producto a diario.
  const iGoogle = auth.indexOf("router.post('/google'");
  const iLogin = auth.indexOf("router.post('/login'");
  const iPerfil = auth.indexOf("router.get('/perfil'");
  check('la puerta de Google Sign-In marca el acceso',
    auth.slice(iGoogle).includes('dormancia.marcarAcceso('),
    'sin ella, quien entra siempre con Google se pausaría con el producto abierto');
  check('la puerta del login con contraseña también',
    auth.slice(iLogin, iGoogle).includes('dormancia.marcarAcceso('));
  check('y la carga del perfil, que es la que cubre las sesiones ya abiertas',
    auth.slice(iPerfil, iPerfil + 3000).includes('dormancia.marcarAcceso('),
    'sin ella, quien no cierra sesión nunca volvería a marcar');
  check('el perfil pide ultimoAcceso para poder aplicar el throttle',
    auth.slice(iPerfil, iPerfil + 3000).includes('ultimoAcceso: true'));
  check('pero NO se lo manda al navegador',
    /ultimoAcceso:\s*_\w+/.test(auth),
    'es telemetría interna: se pidió solo para el throttle');

  // ⚠️ Sin await: una marca de telemetría no puede retrasar un login.
  check('las tres van sin await',
    !/await\s+dormancia\.marcarAcceso/.test(auth),
    'esperar a escribir una fecha para devolver el token es pagar latencia por telemetría');

  // ══════════════════════════════════════════════════════════
  bloque('8. El worker de monitoreo — el select y el corte');

  const worker = leerLimpio('src', 'workers', 'monitoreo.worker.js');

  // 🔴 El agujero que ya tuvieron idioma y prefsAlertas en este MISMO select: sin
  // los campos, motivoDormida recibe undefined y devuelve null. Falla ABIERTO —
  // nadie duerme nunca y la palanca no hace absolutamente nada, sin que falle
  // absolutamente nada.
  // ⚠️ La sonda apunta a `usuario: { select: ... }` y NO a cualquier `select:`
  // con `prefsAlertas`: la primera versión casaba también con el select del
  // DIGEST de alertas (`prisma.usuario.findMany`), que no alimenta a
  // `elegirVigilables` y no tiene por qué traer estos campos. Daba 3 donde hay 2,
  // y "arreglarlo" habría sido añadirle campos inútiles a una consulta ajena.
  // ⚠️ La sonda tiene que apuntar a los DOS `findMany` que alimentan
  // `elegirVigilables` —el del cron y el de `ejecutarAhora`— y a ningún otro. En
  // este archivo hay cuatro `usuario: { select: ... }`, y los otros dos son del
  // reporte mensual y de la escalación de 24 h: consultas que ya filtran por plan
  // con `planesCon(...)`, no deciden a quién se escanea, y no tienen por qué
  // traer estos campos. Las dos primeras versiones de esta sonda daban 3 y 4:
  // "arreglar" ese rojo habría sido añadirle campos inútiles a consultas ajenas.
  const selectsDeUsuario = [...worker.matchAll(/usuario:\s*\{\s*select:\s*\{/g)]
    .filter((m) => !worker.slice(Math.max(0, m.index - 400), m.index).includes('planesCon('))
    .map((m) => worker.slice(m.index, m.index + 1400));
  check('hay los DOS selects de usuario (el del cron y el de ejecutarAhora)',
    selectsDeUsuario.length === 2, `encontrados ${selectsDeUsuario.length}`);
  for (const campo of ['plan', 'emailVerificado', 'creadoEn', 'ultimoAcceso', 'localesExtra']) {
    // ⚠️ El `length === 2` va DENTRO de cada check y no solo en el de arriba:
    // `[].every(...)` devuelve `true`, así que una sonda que no encuentra nada
    // daría estos cinco en VERDE sin haber leído una sola línea. Es el agujero
    // que ya tuvo `prueba-planes.js` el 2026-08-30 con su barrido de scripts.
    check(`los dos selects piden ${campo}`,
      selectsDeUsuario.length === 2 && selectsDeUsuario.every((s) => s.includes(`${campo}: true`)),
      'si falta, la decisión se toma con undefined y falla en silencio');
  }

  check('elegirVigilables pregunta por el motivo antes de repartir locales',
    /motivoDormida\([\s\S]{0,300}?continue/.test(worker),
    'si la cuenta está dormida no hay nada que repartir: hacerlo al revés gasta el cálculo para tirarlo');
  check('la cadencia se le pregunta a dormancia y no a HORAS_ESCANEO[plan]',
    worker.includes('dormancia.horasEscaneo(negocio.usuario')
    && !/const\s+horas\s*=\s*HORAS_ESCANEO\[negocio/.test(worker),
    'el gratuito corre a 24 h su primer mes y a 72 h después: el número depende del USUARIO, no solo del plan');
  check('el corte NO borra, NO desactiva y NO escribe nada',
    !/motivoDormida[\s\S]{0,500}?(prisma\.|delete|activo:\s*false)/.test(worker),
    'igual que el corte por asientos y el de locales: se deja de vigilar, y volver lo deshace');

  // ══════════════════════════════════════════════════════════
  bloque('9. El worker del aviso, ejecutado de verdad');

  let db = { usuarios: [], consulta: null };
  const correos = [];
  const prismaFalso = {
    usuario: { findMany: async ({ where, select }) => { db.consulta = { where, select }; return db.usuarios; } },
  };
  const { procesarAvisosPausa } = require('../src/workers/pausa.worker');
  Module.prototype.require = requireOriginal;   // restaurado: ya no hace falta
  const correrWorker = (usuarios, ahora = AHORA) => {
    db = { usuarios, consulta: null };
    correos.length = 0;
    return procesarAvisosPausa({
      prisma: prismaFalso,
      enviarAvisoPausa: async (u, d) => { correos.push({ email: u.email, dias: d }); },
      ahora,
    });
  };

  let r = await correrWorker([cuenta({ id: 'a', email: 'a@x.pe', ultimoAcceso: hace(umbral + 0.2) })]);
  check('avisa a quien le toca hoy', correos.length === 1 && correos[0].email === 'a@x.pe');
  check('y le dice cuántos días le quedan', correos[0] && correos[0].dias === dormancia.DIAS_AVISO_PREVIO);
  check('devuelve el recuento', r.revisadas === 1 && r.avisados === 1);

  r = await correrWorker([
    cuenta({ id: 'b', email: 'reciente@x.pe', ultimoAcceso: hace(2) }),
    cuenta({ id: 'c', email: 'yadormida@x.pe', ultimoAcceso: hace(60) }),
    cuenta({ id: 'd', email: 'sinverificar@x.pe', emailVerificado: false, ultimoAcceso: hace(umbral + 0.2) }),
    { ...cuenta({ id: 'e', email: 'paga@x.pe', ultimoAcceso: hace(umbral + 0.2) }), plan: 'NEGOCIO' },
  ]);
  check('y NO avisa a nadie más: ni activo, ni ya dormido, ni sin verificar, ni de pago',
    correos.length === 0 && r.avisados === 0,
    `salieron ${correos.length}: ${correos.map((c) => c.email).join(', ')}`);

  check('la consulta solo pide cuentas GRATIS y verificadas',
    db.consulta.where.plan === 'GRATIS' && db.consulta.where.emailVerificado === true);
  check('y solo las que tienen un negocio ACTIVO que pausar',
    JSON.stringify(db.consulta.where.negocios) === JSON.stringify({ some: { activo: true } }),
    'avisar de una pausa a quien no tiene vigilancia es hablarle de algo que no existe');
  check('la consulta trae los campos que la decisión necesita',
    ['creadoEn', 'ultimoAcceso', 'emailVerificado', 'idioma'].every((c) => db.consulta.select[c] === true));

  // Un fallo de Resend no puede cortar el barrido: el resto no tiene la culpa.
  db = {
    usuarios: [
      cuenta({ id: 'f', email: 'rompe@x.pe', ultimoAcceso: hace(umbral + 0.2) }),
      cuenta({ id: 'g', email: 'sigue@x.pe', ultimoAcceso: hace(umbral + 0.2) }),
    ],
  };
  const vistos = [];
  r = await procesarAvisosPausa({
    prisma: prismaFalso,
    enviarAvisoPausa: async (u) => { if (u.email === 'rompe@x.pe') throw new Error('Resend 500'); vistos.push(u.email); },
    ahora: AHORA,
  });
  check('un fallo de correo no corta el barrido', vistos.includes('sigue@x.pe') && r.avisados === 1);

  // ══════════════════════════════════════════════════════════
  bloque('10. El correo, en los dos idiomas');

  const emails = leer('src', 'utils', 'emails.js');
  check('la plantilla existe en español y en inglés',
    emails.includes('const PAUSA = {') && /PAUSA\s*=\s*\{[\s\S]{0,3000}?\n\s*en:\s*\{/.test(emails));
  check('elige idioma con usuario.idioma',
    emails.includes('PAUSA[usuario.idioma]'),
    'sin esto sale siempre en español — el mismo fallo que ya pasó con las alertas (§12)');
  check('enviarAvisoPausa está exportado',
    /module\.exports\s*=\s*\{[^}]*enviarAvisoPausa/.test(emails));

  // 🔴 Lo que el correo tiene que DECIR, porque es lo que hace que pausar sea
  // honesto: que no se borra nada, y cómo se reanuda.
  const bloquePausa = emails.slice(emails.indexOf('const PAUSA = {'), emails.indexOf('const enviarAvisoPausa'));
  check('dice que no se borra nada, en los dos idiomas',
    /no se borra nada/i.test(bloquePausa) && /nothing gets deleted/i.test(bloquePausa),
    'sin eso se lee como «te vamos a cerrar la cuenta» y produce bajas, no reactivaciones');
  check('dice cómo reanudarlo, en los dos idiomas',
    /basta con que entres/i.test(bloquePausa) && /just sign in/i.test(bloquePausa));
  check('el asunto lleva los días que quedan',
    /asunto:\s*\(d\)\s*=>/.test(bloquePausa),
    'un asunto fijo no distingue «te quedan 3 días» de un correo más');
  check('singular y plural, en los dos idiomas',
    bloquePausa.includes("'día' : 'días'") && bloquePausa.includes("'day' : 'days'"));

  // ⚠️ La prueba de idioma del proyecto obliga a clasificar todo correo nuevo.
  check('enviarAvisoPausa está clasificado en prueba-correos-idioma.js',
    leer('scripts', 'prueba-correos-idioma.js').includes('enviarAvisoPausa'),
    'si no está en BILINGUES ni en SOLO_ESPANOL, esa prueba falla a propósito');

  // ══════════════════════════════════════════════════════════
  bloque('11. El cron, y que la pausa NO dependa de él');

  const pausaWorker = leerLimpio('src', 'workers', 'pausa.worker.js');
  // Desde el 2026-10-02 los cron van con candado: `programar(expr, nombre, min, fn)`
  // (lib/candado.js). La sonda acepta las dos formas y además exige el candado.
  check('el cron es diario', /(cron\.schedule|programar)\('0 \d+ \* \* \*'/.test(pausaWorker));
  check('…y con candado: dos instancias no mandan dos avisos', /programar\('0 \d+ \* \* \*', '[\w-]+', \d+,/.test(pausaWorker));
  check('no coincide con el drip (10:00) ni con el de verificación (10:30)',
    !pausaWorker.includes("'0 15 * * *'") && !pausaWorker.includes("'30 15 * * *'"),
    'tres correos a la misma persona en media hora es la vía más corta a que marque spam');

  // 🔴 Lo que hace que este worker sea PRESCINDIBLE: no aplica la pausa, solo
  // avisa. Si se cae, no se pausa de más ni de menos — solo deja de avisarse.
  check('el worker del aviso NO escribe ningún estado de pausa',
    !/prisma\.\w+\.(update|create|delete)/.test(pausaWorker),
    'derivarlo de la fecha es lo que impide que una columna «pausada» quede desincronizada');
  check('no existe ninguna columna pausada/dormida en el schema',
    !/\n\s+(pausada|dormida|enPausa)\s/.test(leer('prisma', 'schema.prisma')),
    'un estado guardado hay que sincronizarlo en los dos sentidos, y el día que el cron no corra, miente');
  check('el cron está enchufado en index.js',
    leerLimpio('src', 'index.js').includes('iniciarAvisosPausa()'));

  // ══════════════════════════════════════════════════════════
  bloque('12. Lo que se PROMETE tiene que cuadrar con lo que el worker hace');

  // ⚠️ §15 al revés: lo que el worker deja de ejecutar tampoco se puede seguir
  // prometiendo. Es la única comprobación de este archivo que mira el frontend.
  const catalogo = leer('..', 'brand-shield-web', 'src', 'lib', 'catalogo.js');
  const gratis = catalogo.slice(catalogo.indexOf("id: 'gratuito'"), catalogo.indexOf("id: 'impulso-mensual'"));
  check('el catálogo menciona la pausa por inactividad',
    /pausa/i.test(gratis),
    'se pausa a los 30 días sin entrar: si no se dice, se promete algo que el worker ya no hace');
  check('y la cadencia más espaciada del segundo mes',
    gratis.includes(String(capGratis.horasEscaneoTrasPrueba)),
    `tras ${capGratis.diasPruebaCompleta} días pasa a ${capGratis.horasEscaneoTrasPrueba} h`);
  check(`el catálogo dice los ${dormancia.DIAS_INACTIVIDAD} días exactos`,
    gratis.includes(String(dormancia.DIAS_INACTIVIDAD)),
    'un «se pausa si no entras» sin número no se puede comprobar ni discutir');

  const espejo = leer('..', 'brand-shield-web', 'src', 'lib', 'planes.js');
  check('el espejo del panel tiene los dos números nuevos',
    espejo.includes(`diasPruebaCompleta: ${capGratis.diasPruebaCompleta}`)
    && espejo.includes(`horasEscaneoTrasPrueba: ${capGratis.horasEscaneoTrasPrueba}`),
    'si los dos archivos se separan, el panel pinta una cadencia que el backend no ejecuta');

  // ── Resumen ─────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
