// brand-shield/scripts/prueba-anulacion-pendiente.js
// Pruebas del aviso por comprobante reembolsado y sin anular. Prisma y Resend
// simulados: no toca la base ni manda correos.
//
//   node scripts/prueba-anulacion-pendiente.js
//
// 🔴 QUÉ PROTEGE ESTO. Es el único error del circuito de cobro que cuesta dinero
// de verdad: reembolsar en Culqi no anula el comprobante ante SUNAT, así que si
// nadie lo anula en 7 días queda declarada una venta cuyo importe se devolvió,
// con su IGV a pagar. Y no hay forma de que el producto se entere solo — no
// existe ningún error, ningún log: simplemente pasa el tiempo.
//
// Lo que se vigila son las dos direcciones del fallo, que son igual de malas:
//
//   · si el aviso deja de salir, se pierde el plazo sin que nadie lo note
//   · si sale cuando no toca (un VOUCHER, un comprobante ya anulado, uno que
//     SUNAT rechazó), se convierte en ruido y se aprende a ignorarlo — y
//     entonces tampoco sirve el día que importa

process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.EMAIL_CONTABILIDAD = 'contabilidad@ejemplo.test';

const anulacion = require('../src/lib/anulacionPendiente');
const Module = require('module');

let db = { pagos: [] };
const prismaFalso = { pago: { findMany: async () => db.pagos } };

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id.endsWith('/prisma')) return prismaFalso;
  return requireOriginal.apply(this, arguments);
};
const worker = require('../src/workers/anulaciones.worker');
Module.prototype.require = requireOriginal;

let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const AHORA = new Date('2026-08-23T18:00:00Z').getTime();
const hace = (d) => new Date(AHORA - d * 24 * 60 * 60 * 1000);

const comprobante = (extra = {}) => ({
  numero: 'B001-00000001', tipo: 'BOLETA', total: 100,
  estadoSunat: 'ACEPTADO', fechaEmision: hace(1), enviadoEn: hace(1), ...extra,
});
const pago = (extra = {}) => ({ id: 'p1', estado: 'REEMBOLSADO', culqiCargoId: 'chr_live_x', ...extra });

const correrWorker = async (pagos) => {
  db.pagos = pagos;
  const avisos = [];
  const r = await worker.revisarAnulacionesPendientes({
    prisma: prismaFalso,
    enviarAvisoAnulacionPendiente: async (d) => { avisos.push(d); },
    ahora: AHORA,
  });
  return { avisos, ...r };
};

const correr = async () => {
  // ── 1. Cuándo hay algo que anular ───────────────────────
  bloque('1. Qué cuenta como «pendiente de anular»');

  check('boleta ACEPTADA + pago REEMBOLSADO → sí',
    anulacion.necesitaAnulacion(comprobante(), pago()) === true);

  check('factura ACEPTADA + pago REEMBOLSADO → también',
    anulacion.necesitaAnulacion(comprobante({ tipo: 'FACTURA', numero: 'F001-00000001' }), pago()) === true);

  check('pago EXITOSO (no devuelto) → no',
    anulacion.necesitaAnulacion(comprobante(), pago({ estado: 'EXITOSO' })) === false);

  check('comprobante ya ANULADO → no',
    anulacion.necesitaAnulacion(comprobante({ estadoSunat: 'ANULADO' }), pago()) === false,
    'seguir avisando de lo ya resuelto es la forma más rápida de que dejen de leer estos correos');

  check('PENDIENTE (SUNAT no lo aceptó todavía) → no',
    anulacion.necesitaAnulacion(comprobante({ estadoSunat: 'PENDIENTE' }), pago()) === false,
    'no está vivo ante SUNAT, así que no hay nada que anular');

  check('RECHAZADO → no',
    anulacion.necesitaAnulacion(comprobante({ estadoSunat: 'RECHAZADO' }), pago()) === false);

  check('🔴 VOUCHER → no: no es documento fiscal',
    anulacion.necesitaAnulacion(comprobante({ tipo: 'VOUCHER' }), pago()) === false);

  check('sin comprobante → no revienta',
    anulacion.necesitaAnulacion(null, pago()) === false && anulacion.necesitaAnulacion(comprobante(), null) === false);

  // ── 2. Los plazos, que cuentan desde sitios distintos ───
  bloque('2. 🔴 Los dos plazos son de 7 días pero desde anclajes distintos');

  // Boleta emitida hace 5 días pero ACEPTADA hace 1: el reloj arranca en el CDR.
  const boletaTardia = comprobante({ fechaEmision: hace(5), enviadoEn: hace(1) });
  check('la BOLETA cuenta desde que SUNAT la aceptó, no desde la emisión',
    anulacion.diasRestantes(boletaTardia, AHORA) === 6,
    `dio ${anulacion.diasRestantes(boletaTardia, AHORA)}; con la emisión daría 2 y se perdería plazo real`);

  const facturaTardia = comprobante({ tipo: 'FACTURA', fechaEmision: hace(5), enviadoEn: hace(1) });
  check('la FACTURA cuenta desde la emisión, no desde el CDR',
    anulacion.diasRestantes(facturaTardia, AHORA) === 2,
    'usar el CDR le daría 4 días de más y se pasaría el plazo creyendo que sobra tiempo');

  check('sin `enviadoEn` la boleta cae a la emisión (plazo más corto, lado seguro)',
    anulacion.diasRestantes(comprobante({ fechaEmision: hace(5), enviadoEn: null }), AHORA) === 2);

  check('un plazo pasado da días negativos', anulacion.diasRestantes(comprobante({ enviadoEn: hace(10) }), AHORA) < 0);

  // ── 3. El comando que va en el correo ───────────────────
  bloque('3. El correo trae el comando exacto');

  check('para una boleta, el script con su número',
    anulacion.comandoParaAnular(comprobante()).includes('anular-boleta.js B001-00000001 --aplicar'));
  check('para una factura, avisa de que el RA aún no tiene script',
    /FACTURA/.test(anulacion.comandoParaAnular(comprobante({ tipo: 'FACTURA' }))),
    'prometer un comando que no existe es peor que decir que falta');

  // ── 4. El recordatorio diario ───────────────────────────
  bloque('4. El cron de las 8:00');

  let r = await correrWorker([{ ...pago(), comprobante: comprobante() }]);
  check('avisa de un comprobante pendiente', r.avisos.length === 1);
  check('  …con los días que quedan', r.avisos[0].diasRestantes === 6);
  check('  …y marcado como recordatorio, no como primer aviso', r.avisos[0].primerAviso === false);

  r = await correrWorker([{ ...pago(), comprobante: comprobante({ estadoSunat: 'ANULADO' }) }]);
  check('deja de avisar en cuanto se anula', r.avisos.length === 0);

  r = await correrWorker([{ ...pago(), comprobante: null }]);
  check('un pago sin comprobante no genera aviso', r.avisos.length === 0);

  r = await correrWorker([{ ...pago(), comprobante: comprobante({ enviadoEn: hace(9) }) }]);
  check('🔴 sigue avisando DESPUÉS de vencer: hay que emitir nota de crédito',
    r.avisos.length === 1 && r.avisos[0].diasRestantes < 0,
    'callarse al vencer dejaría el problema sin resolver y sin nadie enterado');

  r = await correrWorker([{ ...pago(), comprobante: comprobante({ enviadoEn: hace(60) }) }]);
  check('  …pero no para siempre: pasada la ventana deja de insistir',
    r.avisos.length === 0,
    'un aviso diario eterno se convierte en ruido y se aprende a ignorar');

  r = await correrWorker([
    { ...pago(), id: 'p1', comprobante: comprobante() },
    { ...pago(), id: 'p2', comprobante: comprobante({ numero: 'B001-00000002' }) },
  ]);
  check('atiende varios en el mismo ciclo', r.avisos.length === 2);

  // ── 5. El correo, en modo urgente ───────────────────────
  bloque('5. Modo urgente de verdad, no solo mayúsculas en el asunto');

  const fuente = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'utils', 'emails.js'), 'utf8');
  const cuerpo = fuente.slice(fuente.indexOf('const enviarAvisoAnulacionPendiente'), fuente.indexOf('const enviarAvisoPlazoReclamaciones'));

  check("lleva la cabecera X-Priority", /'X-Priority': '1'/.test(cuerpo));
  check("lleva Importance: high", /Importance: 'high'/.test(cuerpo));
  check("lleva X-MSMail-Priority", /'X-MSMail-Priority': 'High'/.test(cuerpo));
  check('el asunto distingue vencido de en plazo', /FUERA DE PLAZO/.test(cuerpo) && /URGENTE/.test(cuerpo));
  check('va a EMAIL_CONTABILIDAD', /process\.env\.EMAIL_CONTABILIDAD/.test(cuerpo));
  check('🔴 si esa variable falta, lo REGISTRA en vez de callarse',
    /console\.error\('\[Anulación\] EMAIL_CONTABILIDAD sin definir/.test(cuerpo),
    'un `return` mudo convierte una variable olvidada en una función que no existe');

  // ── 6. El disparador inmediato ──────────────────────────
  bloque('6. El webhook de Culqi avisa en el acto');

  const rutas = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'api', 'routes', 'pago.routes.js'), 'utf8');
  check('`procesarReembolso` comprueba si hay que anular',
    /anulacion\.necesitaAnulacion\(pago\.comprobante/.test(rutas));
  check('  …y trae el comprobante en la consulta',
    /comprobante: true/.test(rutas),
    'sin incluirlo, `pago.comprobante` sería undefined y no avisaría nunca');
  check('  …con su propio catch, para no tumbar el webhook',
    /No se pudo avisar del comprobante pendiente/.test(rutas),
    'un 500 haría que Culqi reintentara y acabara desactivando la suscripción');

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
