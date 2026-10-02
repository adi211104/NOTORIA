// brand-shield/scripts/prueba-locales.js
// Pruebas de sumar y quitar locales sobre el plan que YA se tiene.
// No toca la base, ni Culqi, ni manda correos: los bloques 1-12 son aritmética
// y lectura del fuente, y el 13 levanta la ruta real en un puerto efímero con
// Prisma, Culqi, el emisor de comprobantes y el middleware de sesión simulados.
//
//   node scripts/prueba-locales.js
//
// 🔴 Lo que se vigila acá NO es que la multiplicación esté bien —esa se ve— sino
// las tres cosas que, si se rompen, no producen ninguna señal:
//
//   · Que el cobro NO mueva `fechaVencimiento`. Si alguien lo añade «para que
//     cuadre», al cliente se le comen los días que ya pagó y nada falla: el
//     cargo sale, el comprobante sale, el panel se ve igual.
//   · Que bajar locales no pueda apagar la vigilancia de una ficha cargada.
//     `negociosVigilables` saca del barrido en silencio: no borra, no desactiva,
//     no avisa. El cliente vería su historial congelarse sin un error.
//   · Que el importe que se PINTA salga del backend. Este proyecto ya cobró
//     S/29.50 mostrando S/30, y ya anunció dos planes de tres en el cartel de la
//     promo por tener los precios escritos a mano en la pantalla.

const fs = require('fs');
const path = require('path');

const locales = require('../src/lib/localesExtra');
const { PRECIOS, montoSuscripcion, localesPermitidos } = require('../src/lib/precios');
const { ORDEN, puede } = require('../src/lib/planes');

// Derivada de la tabla, no escrita a mano: el día que un plan empiece a vender
// locales, esta lista se actualiza sola en vez de dejar una prueba mintiendo.
const planesSinLocales = () => ORDEN.filter((p) => !puede(p, 'localesAdicionales'));

let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const leer = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const leerWeb = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'brand-shield-web', rel), 'utf8');

// Un caso base estable: 25 de agosto, vencimiento el 6 de septiembre.
// El periodo va del 6 de agosto al 6 de septiembre = 31 días; quedan 12.
const AHORA = new Date('2026-08-25T12:00:00Z');
const VENCE = new Date('2026-09-06T12:00:00Z');

const caso = (extra = {}) => locales.prorrateo({
  plan: 'NEGOCIO', anual: false, fechaVencimiento: VENCE,
  localesExtraActual: 0, localesExtraNuevo: 1, ahora: AHORA, ...extra,
});

// ── 1. El prorrateo ───────────────────────────────────────
bloque('1. Se cobran los días que faltan, no el periodo entero');

const base = caso();
check('los días salen del calendario real, no de un 30 fijo',
  base.diasPeriodo === 31, `dio ${base.diasPeriodo}`);
check('cuenta los 12 días que quedan', base.dias === 12, `dio ${base.dias}`);
check('cobra S/15.10 y no los S/39 del mes completo',
  base.centimos === Math.round(3900 * 12 / 31), `dio ${base.centimos}`);
check('el cargo es menor que un periodo completo del local',
  base.centimos < PRECIOS.NEGOCIO.local.mensual);

const anualCaso = locales.prorrateo({
  plan: 'NEGOCIO', anual: true, fechaVencimiento: new Date('2027-07-25T12:00:00Z'),
  localesExtraActual: 0, localesExtraNuevo: 1, ahora: AHORA,
});
check('el anual prorratea sobre 365 días', anualCaso.diasPeriodo === 365, `dio ${anualCaso.diasPeriodo}`);
check('el anual cobra la fracción del precio ANUAL del local',
  anualCaso.centimos === Math.round(PRECIOS.NEGOCIO.local.anual * anualCaso.dias / 365));

// ⚠️ No es `=== base.centimos * 2`, y la diferencia importa: el redondeo se
// hace UNA vez sobre el total, no por unidad. Dos locales dan 3019 y no 3020,
// porque 3900×12/31 = 1509.68 se redondea a 1510 pero 7800×12/31 = 3019.35 se
// redondea a 3019. Redondear por unidad y multiplicar arrastraría el error
// hacia arriba en cada local — es el mismo criterio por el que `tributario.js`
// calcula el IGV como residuo para que la suma cuadre siempre al céntimo.
const dos = caso({ localesExtraNuevo: 2 });
check('dos locales cuestan el doble, con el redondeo hecho una sola vez',
  Math.abs(dos.centimos - base.centimos * 2) <= 1 && dos.centimos === Math.round(7800 * 12 / 31),
  `dio ${dos.centimos}`);

check('subir de 2 a 3 cobra lo mismo que subir de 0 a 1 — se cobra el DELTA',
  caso({ localesExtraActual: 2, localesExtraNuevo: 3 }).centimos === base.centimos,
  'cobrar sobre el total y no sobre la diferencia le recobraría al cliente lo que ya paga');

// Febrero: el periodo mide 28 días, así que cada día vale más que en agosto.
const feb = locales.prorrateo({
  plan: 'NEGOCIO', anual: false, fechaVencimiento: new Date('2026-03-01T12:00:00Z'),
  localesExtraActual: 0, localesExtraNuevo: 1, ahora: new Date('2026-02-15T12:00:00Z'),
});
check('un febrero de 28 días prorratea sobre 28, no sobre 30',
  feb.diasPeriodo === 28, `dio ${feb.diasPeriodo}`);

// ── 2. El piso ────────────────────────────────────────────
bloque('2. El piso: por debajo de S/5 entra gratis');

const casiVencido = caso({ fechaVencimiento: new Date('2026-08-26T06:00:00Z') });
check('con un día por delante no se cobra nada', casiVencido.centimos === 0);
check('…pero el local SÍ entra (marcado `gratis`)', casiVencido.gratis === true,
  'si no entrara, el cliente pagaría en la renovación por algo que no pudo usar');
check('el piso es S/5', locales.PISO_CENTIMOS === 500);
check('justo por encima del piso sí cobra',
  caso({ localesExtraNuevo: 2, fechaVencimiento: new Date('2026-08-27T12:00:00Z') }).centimos >= 500);

const vencido = caso({ fechaVencimiento: new Date('2026-08-01T12:00:00Z') });
check('un vencimiento ya pasado no cobra y no da días negativos',
  vencido.centimos === 0 && vencido.dias === 0 && vencido.gratis === true);
check('sin fecha de vencimiento no revienta ni cobra',
  caso({ fechaVencimiento: null }).centimos === 0);

// ── 3. Bajar nunca cobra ──────────────────────────────────
bloque('3. Bajar locales no cobra ni devuelve');

const bajada = caso({ localesExtraActual: 3, localesExtraNuevo: 1 });
check('bajar da delta negativo', bajada.delta === -2);
check('bajar no genera cargo', bajada.centimos === 0);
check('bajar no se marca como `gratis` — no es un alta sin cobro, es una baja',
  bajada.gratis === false,
  'confundirlos haría que el panel dijera «te agregamos el local sin cobro» al quitarlo');
check('no cambiar nada tampoco cobra', caso({ localesExtraNuevo: 0 }).centimos === 0);

// ── 4. Un plan que no vende locales nunca genera un cargo ──
bloque('4. Los planes que no venden locales');

for (const plan of ['GRATIS', 'IMPULSO']) {
  const r = locales.prorrateo({
    plan, anual: false, fechaVencimiento: VENCE,
    localesExtraActual: 0, localesExtraNuevo: 5, ahora: AHORA,
  });
  check(`${plan} no cobra locales aunque se le pidan 5`, r.centimos === 0,
    'el número llega del navegador: un plan sin la capacidad no puede acabar en un cargo');
}
check('un plan inventado tampoco cobra',
  locales.prorrateo({ plan: 'PLATINO', anual: false, fechaVencimiento: VENCE,
    localesExtraActual: 0, localesExtraNuevo: 3, ahora: AHORA }).centimos === 0,
  'falla CERRADO, que es el lado seguro');

check('FRANQUICIA sí cobra, y a su propia tarifa',
  caso({ plan: 'FRANQUICIA' }).centimos === Math.round(PRECIOS.FRANQUICIA.local.mensual * 12 / 31));

// ── 5. La promo de bienvenida ─────────────────────────────
bloque('5. La promo se aplica igual que en la renovación');

const conPromo = caso({ mesesPromoRestantes: 1 });
check('con promo vigente el local va a mitad de precio',
  conPromo.centimos === Math.round((3900 / 2) * 12 / 31), `dio ${conPromo.centimos}`);
check('…y se declara para que el panel lo pueda decir', conPromo.promoAplicada === true);
check('la promo NO se aplica al anual',
  locales.prorrateo({ plan: 'NEGOCIO', anual: true, fechaVencimiento: new Date('2027-07-25T12:00:00Z'),
    localesExtraActual: 0, localesExtraNuevo: 1, mesesPromoRestantes: 2, ahora: AHORA }).promoAplicada === false,
  'la renovación anual tampoco la aplica: cobrar dos tarifas por lo mismo en el mismo mes');

// ── 6. La guarda de la bajada ─────────────────────────────
bloque('6. Bajar no puede apagar la vigilancia de una ficha cargada');

const valido = (extra = {}) => locales.validarCambio({
  plan: 'NEGOCIO', suscripcionActiva: true, tieneTarjeta: true,
  localesExtraNuevo: 2, negociosActivos: 1, ...extra,
});

check('un cambio normal pasa', valido() === null);
check('bajar a menos locales de los que hay cargados se rechaza',
  valido({ localesExtraNuevo: 0, negociosActivos: 3 }) === 'LOCALES_EN_USO',
  'sin esto, negociosVigilables sacaría dos fichas del barrido sin decir nada');
check('bajar hasta justo los que hay cargados sí se permite',
  valido({ localesExtraNuevo: 2, negociosActivos: 3 }) === null,
  `NEGOCIO incluye ${localesPermitidos('NEGOCIO', 0)}, más 2 pagados = 3`);
check('un plan sin locales se rechaza', valido({ plan: 'IMPULSO' }) === 'PLAN_SIN_LOCALES');
check('sin suscripción activa se rechaza', valido({ suscripcionActiva: false }) === 'SIN_SUSCRIPCION');
check('sin tarjeta guardada se rechaza', valido({ tieneTarjeta: false }) === 'SIN_TARJETA',
  'el cobro va contra la tarjeta guardada, no contra un token del widget');
check('un número negativo se rechaza', valido({ localesExtraNuevo: -1 }) === 'CANTIDAD_INVALIDA');
check('un decimal se rechaza', valido({ localesExtraNuevo: 1.5 }) === 'CANTIDAD_INVALIDA');
check('un texto se rechaza', valido({ localesExtraNuevo: 'muchos' }) === 'CANTIDAD_INVALIDA');
check('mil locales se rechazan', valido({ localesExtraNuevo: 1000 }) === 'CANTIDAD_INVALIDA',
  'el cuerpo llega del navegador: sin tope, un cargo de cinco cifras');
check('el tope de extras se DERIVA del total y de lo que incluye el plan',
  locales.maximoExtra('NEGOCIO') + locales.incluidosEnElPlan('NEGOCIO') === locales.MAX_LOCALES_TOTALES,
  'un 49 fijo dejaría comprar 51 el día que un plan incluya dos locales');

// 🔴 Un plan que no vende locales tiene máximo CERO, y las dos funciones que
// responden a esa pregunta tienen que decir lo mismo. Hasta el 2026-08-30
// `maximoExtra('IMPULSO')` daba 49 mientras `validarCambio` daba PLAN_SIN_LOCALES;
// no era explotable, pero ese número viaja al panel en GET /api/pagos/locales.
for (const plan of planesSinLocales()) {
  check(`${plan} no vende locales, así que su máximo de extras es 0`,
    locales.maximoExtra(plan) === 0,
    `devuelve ${locales.maximoExtra(plan)}`);
  check(`…y validarCambio dice lo mismo para ${plan}`,
    locales.validarCambio({
      plan, suscripcionActiva: true, tieneTarjeta: true, localesExtraNuevo: 1, negociosActivos: 1,
    }) === 'PLAN_SIN_LOCALES');
}

// ── 7. La renovación sigue cobrando los extras ────────────
bloque('7. Lo que se cobra el mes que viene');

check('la renovación de 2 locales extra cuesta plan + 2 locales',
  montoSuscripcion('NEGOCIO', false, 2) === PRECIOS.NEGOCIO.mensual + 2 * PRECIOS.NEGOCIO.local.mensual);
check('el tope de negocios sube con lo pagado',
  localesPermitidos('NEGOCIO', 2) === locales.incluidosEnElPlan('NEGOCIO') + 2);

const worker = leer('src/workers/monitoreo.worker.js');
check('el cron de renovación sigue pasándole `localesExtra` a montoSuscripcion',
  /montoSuscripcion\([^)]*localesExtra/.test(worker),
  '🔴 si deja de pasarlo, los locales se cobran UNA vez y quedan gratis para siempre, sin error ni log');

// ── 8. Lo que la ruta NO debe hacer (lectura del fuente) ───
bloque('8. El fuente de la ruta: los silencios');

const rutas = leer('src/api/routes/pago.routes.js');
const bloqueLocales = rutas.slice(
  rutas.indexOf("router.post('/locales'"),
  rutas.indexOf("router.post('/cancelar'"),
);
check('la ruta POST /locales existe', bloqueLocales.length > 100);
// 🔴 La sonda tiene que distinguir LEER de ESCRIBIR. La ruta lee
// `fechaVencimiento` a propósito —se la pasa al prorrateo para saber cuántos
// días quedan—, así que buscar el nombre a secas da un falso positivo y manda a
// arreglar lo que está bien. Es el mismo error que ya cometió
// `verificar-meta-secret.js`: ante un resultado, preguntar primero si el método
// distingue. Lo que no puede aparecer es dentro de un `data:` de Prisma.
const escribeVencimiento = (fuente) => /data:\s*{[^}]*fechaVencimiento/.test(fuente);
check('🔴 el cobro NO escribe `fechaVencimiento`',
  !escribeVencimiento(bloqueLocales),
  'moverlo le come al cliente los días que ya pagó, y no falla nada visible');
check('   …y la sonda de arriba sí lo detectaría (control)',
  escribeVencimiento('data: { localesExtra: nuevo, fechaVencimiento }'),
  'sin este control, la comprobación anterior podría estar pasando por no medir nada');
check('   …y no confunde LEER con escribir (control)',
  !escribeVencimiento('prorrateo({ fechaVencimiento: usuario.fechaVencimiento })'));
check('cobra contra la tarjeta guardada (`tarjetaCulqiId`), no contra un token',
  /sourceId:\s*usuario\.tarjetaCulqiId/.test(bloqueLocales));
check('registra el pago con su propio tipo',
  /tipo:\s*'LOCAL_ADICIONAL'/.test(bloqueLocales));
check('emite comprobante del cobro',
  /emitirComprobante/.test(bloqueLocales),
  'un cargo a una tarjeta sin comprobante es una venta sin documento');
check('el importe lo calcula el servidor, no lo acepta del cuerpo',
  !/req\.body[^\n]*monto/.test(bloqueLocales),
  'aceptar el importe del navegador sería dejar que el cliente elija cuánto paga');
check('la ruta va detrás de permitir(\'facturacion\')',
  rutas.indexOf("router.use(permitir('facturacion'))") < rutas.indexOf("router.post('/locales'"));

// ── 9. El comprobante describe lo que se vendió ───────────
bloque('9. El comprobante es un documento fiscal');

const servicio = leer('src/services/comprobante.service.js');
check('LOCAL_ADICIONAL tiene su propia descripción',
  /LOCAL_ADICIONAL/.test(servicio));
check('la descripción del local NO dice «suscripción por 1 mes»',
  /LOCAL_ADICIONAL[\s\S]{0,400}?parte proporcional/.test(servicio),
  'se cobra prorrateado: decir «1 mes» describiría mal lo vendido ante SUNAT');

// ── 10. El panel no calcula precios ───────────────────────
bloque('10. El panel pinta lo que dice el servidor');

const panel = leerWeb('src/app/dashboard/planes/page.js');
const mis = panel.slice(panel.indexOf('function MisLocales'), panel.indexOf('export default function PlanesPage'));
check('el bloque MisLocales existe', mis.length > 100);
check('MisLocales pide la previsualización al backend',
  /previsualizarLocales/.test(mis));
check('🔴 MisLocales NO usa precioLocalDe ni multiplica tarifas',
  !/precioLocalDe|montoEnCentimos/.test(mis),
  'calcular el importe acá es exactamente el bug de S/30 mostrado y S/29.50 cobrado');
check('MisLocales está a nivel de módulo, no dentro de PlanesPage',
  panel.indexOf('function MisLocales') < panel.indexOf('export default function PlanesPage'),
  'dentro del padre se remontaría en cada render y el contador perdería el foco');
check('el suelo del contador son los negocios cargados, no el del plan',
  /Math\.max\(estado\.incluidos,\s*estado\.negociosActivos\)/.test(mis));
// 🔴 PLAN_SIN_LOCALES tiene que APAGAR el bloque, no caer en el aviso rojo.
// Sin esto, un plan que no vende locales —hoy Impulso— pinta el contador entero
// ofreciendo hasta 50 y al confirmar devuelve el error de pago genérico. No era
// alcanzable hasta que existió una cuenta con plan de pago Y tarjeta guardada.
check('PLAN_SIN_LOCALES apaga el bloque entero',
  /bloqueado\s*=[\s\S]{0,220}PLAN_SIN_LOCALES/.test(mis),
  'si no, el contador ofrece locales que ese plan no vende');
check('PLAN_SIN_LOCALES tiene su propio texto, no el error de pago genérico',
  /PLAN_SIN_LOCALES.*planSinLocales/.test(mis),
  'un error de cobro para algo que no es un problema de cobro no explica nada');
check('el texto planSinLocales existe en los DOS idiomas',
  (panel.match(/planSinLocales:/g) || []).length >= 2,
  'es el quinto camino por el que este proyecto se equivoca de idioma');
check('CONTROL: la sonda de PLAN_SIN_LOCALES sabe fallar',
  !/PLAN_SIN_LOCALES/.test('const bloqueado = a || b;'));

check('el bloque no depende del interruptor mensual/anual de la pantalla',
  !/\banual\b/.test(mis),
  'quien paga anual y mira la pestaña mensual tiene que ver lo que le van a cobrar A ÉL');

// ── 11. Idioma ────────────────────────────────────────────
bloque('11. El idioma, que en este proyecto ya falló tres veces');

const textos = panel.slice(0, panel.indexOf('const CheckIcon'));
const es = textos.slice(textos.indexOf('  es: {'), textos.indexOf('  en: {'));
const en = textos.slice(textos.indexOf('  en: {'));
check('misLocales está en español', /misLocales:\s*{/.test(es));
check('misLocales está en inglés', /misLocales:\s*{/.test(en));
const claves = (b) => (b.match(/misLocales:\s*{[\s\S]*?\n    },/) || [''])[0]
  .match(/^\s{6}(\w+):/gm)?.map((s) => s.trim().replace(':', '')) || [];
const cEs = claves(es), cEn = claves(en);
check('los dos idiomas tienen las MISMAS claves',
  cEs.length > 0 && cEs.length === cEn.length && cEs.every((k) => cEn.includes(k)),
  `es=${cEs.length} en=${cEn.length}`);

const factura = leerWeb('src/app/dashboard/facturacion/page.js');
check('el historial sabe nombrar el cobro nuevo en los dos idiomas',
  (factura.match(/LOCAL_ADICIONAL/g) || []).length === 2,
  'sin etiqueta el panel imprime «LOCAL_ADICIONAL» en crudo, como pasó con PLAN_LABELS');
check('el historial conserva su respaldo `|| p.tipo`', /t\.tipo\[p\.tipo\]\s*\|\|\s*p\.tipo/.test(factura));

// ── 12. El mensaje del tope apunta a donde está el control ─
bloque('12. El 403 al crear un negocio ya no miente');

const negocios = leer('src/api/routes/negocio.routes.js');
check('el tope manda a Planes', /Suma otro desde Planes/.test(negocios));
check('…y ahora Planes tiene el control para el plan actual',
  /esPlanActual\s*&&\s*\(\s*\n?\s*<MisLocales/.test(panel) || /esPlanActual && \(/.test(panel) && /<MisLocales/.test(panel),
  'era la mitad que faltaba: el mensaje existía y el botón no');

// ── 12-bis. El tope, en los tres sitios que dependen de él ─
//
// 🔴 Escrito el 2026-08-26. `MAX_LOCALES_TOTALES` gobierna lo que el panel deja
// elegir, lo que el cobro acepta y lo que las tarjetas PROMETEN — y los tres
// estaban desalineados: el selector tenía «50» a mano, el ALTA no acotaba nada
// por arriba, y las tarjetas decían «sin tope» en los dos idiomas.
bloque('12-bis. El tope de locales es uno solo');

const espejoPlanes = leerWeb('src/lib/planes.js');
const mTope = espejoPlanes.match(/export const MAX_LOCALES_TOTALES = (\d+);/);
check('el panel declara el mismo tope que el backend',
  mTope && Number(mTope[1]) === locales.MAX_LOCALES_TOTALES,
  `backend ${locales.MAX_LOCALES_TOTALES} vs panel ${mTope && mTope[1]}`);

// 🔴 El agujero de dinero: `localesExtra` llega del CUERPO de la petición, y el
// alta lo pasaba a `montoSuscripcion` sin techo. Con 10 000 en Franquicia anual
// eso son S/9.48 millones cargados a una tarjeta, con su comprobante fiscal.
check('el ALTA rechaza más locales de los que caben',
  /extras > locales\.maximoExtra\(plan\)/.test(rutas),
  'el número viene del navegador: sin techo, el cargo es el que salga');
check('…y los RECHAZA en vez de acotarlos en silencio',
  /DEMASIADOS_LOCALES/.test(rutas),
  'acotar cobraría un importe distinto del que el widget acaba de enseñar');

// Las promesas del catálogo. Un tope real de 50 con «sin tope» impreso es
// publicidad engañosa en la única pantalla donde se cobra.
const SIN_TOPE = /sin tope|no cap|locales ilimitados|unlimited locations/i;
for (const [donde, archivo] of [
  ['las tarjetas del panel', 'src/app/dashboard/planes/page.js'],
  ['la comparativa del landing', 'src/app/page.js'],
  ['el catálogo de /precios', 'src/lib/catalogo.js'],
]) {
  // Se quitan los comentarios antes de buscar: este mismo archivo y los que
  // lee explican POR QUÉ se retiró «sin tope», así que la frase aparece en la
  // prosa. Una sonda que no distingue el código del comentario que lo explica
  // se pone roja para siempre en cuanto alguien documenta el arreglo.
  const fuente = leerWeb(archivo)
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  check(`${donde}: sin promesas de locales ilimitados`, !SIN_TOPE.test(fuente));
}
check('…y las tres interpolan la constante en vez de escribir el número',
  ['src/app/dashboard/planes/page.js', 'src/app/page.js', 'src/lib/catalogo.js']
    .every((a) => /MAX_LOCALES_TOTALES/.test(leerWeb(a))));
check('   …y la sonda de «sin tope» sabe fallar (control)',
  SIN_TOPE.test('Suma los locales que necesites, sin tope')
  && !SIN_TOPE.test('Hasta 50 locales en la misma cuenta'));

// ── 13. La ruta, EJERCIDA ─────────────────────────────────
//
// 🔴 Todo lo de arriba lee el fuente, y leer el fuente no prueba que la ruta se
// comporte. Este bloque la levanta de verdad —con Prisma, Culqi, el emisor de
// comprobantes y el middleware de sesión simulados— y le pega por HTTP. Es lo
// único que comprueba sobre la LLAMADA REAL, y no sobre una expresión regular,
// que el `update` no escribe `fechaVencimiento` y que a Culqi le llega
// exactamente el importe prorrateado y no otro.
const express = require('express');
const Module = require('module');

const VENCE_RUTA = () => new Date(Date.now() + 12 * 86400000);
const estadoRuta = () => ({
  usuario: {
    id: 'u1', email: 'ana@ejemplo.pe', nombre: 'Ana Torres', plan: 'NEGOCIO',
    suscripcionActiva: true, tarjetaCulqiId: 'crd_test_1',
    // ⚠️ RELATIVO a hoy, no la fecha fija de los bloques puros: la ruta usa el
    // reloj real (`prorrateo` cae a `new Date()`), así que una fecha de
    // calendario haría que esta prueba se pusiera roja sola el 6 de septiembre.
    // Es el mismo fixture que rompió `prueba-panel.js` a la 01:07 de Lima, por
    // el otro extremo.
    fechaVencimiento: VENCE_RUTA(), periodoFacturacion: 'mensual',
    localesExtra: 0, mesesPromoRestantes: 0, direccionFiscal: 'Av. Siempre Viva 123',
  },
  negociosActivos: 1,
  updates: [], cargos: [], pagos: [], comprobantes: [],
});
let db = estadoRuta();

// Desde la auditoría del 2026-10-02 el cobro pasa por lib/cobros.js: intento
// registrado antes de Culqi y todo lo de la base en UNA transacción. El doble
// modela las dos cosas, incluida la clave única del intento.
const prismaFalso = {
  $transaction: async (fn) => fn(prismaFalso),
  intentoCobro: {
    create: async ({ data }) => {
      db.intentos = db.intentos || [];
      if (db.intentos.some((i) => i.clave === data.clave)) { const e = new Error('dup'); e.code = 'P2002'; throw e; }
      const i = { id: `ic${db.intentos.length + 1}`, pagoId: null, ...data };
      db.intentos.push(i); return i;
    },
    update: async ({ where, data }) => Object.assign(db.intentos.find((i) => i.id === where.id), data),
    updateMany: async ({ where }) => ({ count: db.intentos.some((i) => i.id === where.id && !i.pagoId && (!where.estado || i.estado === where.estado)) ? 1 : 0 }),
    findUnique: async ({ where }) => db.intentos.find((i) => i.clave === where.clave || i.id === where.id) || null,
  },
  usuario: {
    findUnique: async () => ({ ...db.usuario }),
    update: async ({ data }) => { db.updates.push(data); Object.assign(db.usuario, data); return db.usuario; },
  },
  negocio: { count: async () => db.negociosActivos },
  pago: { create: async ({ data }) => { db.pagos.push(data); return { id: 'pg1', ...data }; } },
  promoTarjeta: { findUnique: async () => null, create: async () => ({}) },
  comprobante: { findUnique: async () => null },
};
const culqiFalso = {
  configurado: () => true,
  crearCargo: async (args) => { db.cargos.push(args); return { id: 'chr_test_1', source: {} }; },
  datosTarjeta: () => ({ inicio: '4111', marca: 'visa' }),
  obtenerOCrearCliente: async () => ({ id: 'cus_1' }),
  crearTarjeta: async () => ({ id: 'crd_test_1' }),
  huellaTarjeta: () => null,
};

const original = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id === './prisma') return prismaFalso;
  if (id.endsWith('lib/culqi') || id === './culqi') return culqiFalso;
  if (id.endsWith('services/comprobante.service')) return {
    emitirComprobante: async ({ pago }) => { db.comprobantes.push(pago); return { tipo: 'BOLETA', numero: 'B001-00000002' }; },
    pdfDeComprobante: async () => null,
  };
  if (id.endsWith('utils/emails')) return {
    enviarCancelacion: async () => {}, enviarAvisoAnulacionPendiente: async () => {},
    enviarReembolso: async () => {}, enviarAvisoInterno: async () => {},
  };
  // ⚠️ El doble del middleware devuelve `permitir` Y pone `req.cuenta`: sin lo
  // segundo la consulta caería en `usuarioId: undefined`, que en Prisma no es un
  // error sino un filtro que se ignora (CLAUDE.md §11).
  if (id.endsWith('middlewares/auth.middleware')) return {
    autenticar: (req, _res, next) => {
      req.usuario = { id: 'u1' };
      req.cuenta = { id: 'u1', plan: db.usuario.plan, localesExtra: db.usuario.localesExtra };
      next();
    },
    permitir: () => (_req, _res, next) => next(),
  };
  return original.apply(this, arguments);
};
delete require.cache[require.resolve('../src/api/routes/pago.routes')];
const router = require('../src/api/routes/pago.routes');
Module.prototype.require = original;

const correr = async () => {
  bloque('13. La ruta ejercida de verdad (Prisma y Culqi simulados)');

  const app = express();
  app.use(express.json());
  app.use('/api/pagos', router);
  const servidor = app.listen(0);
  const base = `http://127.0.0.1:${servidor.address().port}/api/pagos`;
  const pedir = async (ruta, opciones) => {
    const r = await fetch(`${base}${ruta}`, opciones);
    return { status: r.status, cuerpo: await r.json() };
  };
  const post = (extra) => pedir('/locales', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localesExtra: extra }),
  });

  try {
    // — Previsualización —
    const sinCambio = await pedir('/locales');
    check('GET /locales responde 200', sinCambio.status === 200);
    check('sin cambio no anuncia cobro', sinCambio.cuerpo.aCobrarHoy === 0);
    check('dice lo que hoy se renueva', sinCambio.cuerpo.renovacionActual === PRECIOS.NEGOCIO.mensual);

    const conUno = await pedir('/locales?localesExtra=1');
    check('la previsualización cobra el prorrateo, no el mes completo',
      conUno.cuerpo.aCobrarHoy === base_centimos(), `dio ${conUno.cuerpo.aCobrarHoy}`);
    check('…y anuncia la renovación nueva completa',
      conUno.cuerpo.renovacionNueva === PRECIOS.NEGOCIO.mensual + PRECIOS.NEGOCIO.local.mensual);
    check('la previsualización NO cobra nada',
      db.cargos.length === 0 && db.updates.length === 0,
      'un GET que cobra sería el peor fallo posible de esta pantalla');

    // — Subir —
    const sube = await post(1);
    check('POST /locales sube y responde 200', sube.status === 200);
    check('a Culqi le llega EXACTAMENTE el importe previsualizado',
      db.cargos.length === 1 && db.cargos[0].monto === conUno.cuerpo.aCobrarHoy,
      `cargó ${db.cargos[0]?.monto} tras anunciar ${conUno.cuerpo.aCobrarHoy}`);
    check('cobra contra la tarjeta guardada', db.cargos[0]?.sourceId === 'crd_test_1');
    check('🔴 el update NO escribe fechaVencimiento (llamada real, no regex)',
      db.updates.length === 1 && !('fechaVencimiento' in db.updates[0]),
      `escribió ${JSON.stringify(db.updates[0])}`);
    check('el update sube localesExtra a 1', db.updates[0].localesExtra === 1);
    check('registra el pago como LOCAL_ADICIONAL', db.pagos[0]?.tipo === 'LOCAL_ADICIONAL');
    check('emite comprobante', db.comprobantes.length === 1);
    check('devuelve el comprobante para poder enseñarlo',
      sube.cuerpo.comprobante?.numero === 'B001-00000002');

    // — Bajar —
    db.cargos = []; db.updates = []; db.pagos = []; db.comprobantes = [];
    const baja = await post(0);
    check('bajar responde 200', baja.status === 200);
    check('🔴 bajar NO genera ningún cargo', db.cargos.length === 0);
    check('bajar no emite comprobante', db.comprobantes.length === 0);
    check('bajar sí actualiza el usuario', db.updates[0]?.localesExtra === 0);

    // — Los rechazos —
    db = estadoRuta(); db.usuario.localesExtra = 2; db.negociosActivos = 3;
    const enUso = await post(0);
    check('bajar por debajo de los locales cargados da 409', enUso.status === 409);
    check('…con su código propio', enUso.cuerpo.codigo === 'LOCALES_EN_USO');
    check('…y sin tocar nada', db.cargos.length === 0 && db.updates.length === 0);

    db = estadoRuta(); db.usuario.plan = 'IMPULSO';
    const impulso = await post(1);
    check('IMPULSO no puede comprar locales', impulso.status === 409 && impulso.cuerpo.codigo === 'PLAN_SIN_LOCALES');
    check('…y no se le cobra nada', db.cargos.length === 0);

    db = estadoRuta();
    const basura = await post('muchos');
    check('un valor no numérico da 409 y no cobra',
      basura.status === 409 && db.cargos.length === 0);

    db = estadoRuta(); db.usuario.tarjetaCulqiId = null;
    const sinTarjeta = await post(1);
    check('sin tarjeta guardada no se cobra', sinTarjeta.cuerpo.codigo === 'SIN_TARJETA' && db.cargos.length === 0);

    // — El agujero de dinero, sobre la llamada real —
    db = estadoRuta();
    const exagerado = await pedir('/culqi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'tkn_test_1', plan: 'FRANQUICIA', anual: true, localesExtra: 10000 }),
    });
    check('🔴 el ALTA rechaza 10 000 locales con 400',
      exagerado.status === 400 && exagerado.cuerpo.codigo === 'DEMASIADOS_LOCALES',
      `respondió ${exagerado.status} ${JSON.stringify(exagerado.cuerpo).slice(0, 80)}`);
    check('…y no llegó ningún cargo a Culqi',
      db.cargos.length === 0,
      'sin el techo esto eran S/9.48 millones cargados a una tarjeta, con su comprobante');

    db = estadoRuta();
    const justo = await pedir(`/locales?localesExtra=${locales.maximoExtra('NEGOCIO')}`);
    check('el tope exacto sí se admite (no se pasa de rosca por uno)',
      justo.status === 200 && !justo.cuerpo.motivo);
    const pasado = await pedir(`/locales?localesExtra=${locales.maximoExtra('NEGOCIO') + 1}`);
    check('uno más ya no', pasado.cuerpo.motivo === 'CANTIDAD_INVALIDA');

    // — El piso, sobre la llamada real —
    db = estadoRuta(); db.usuario.fechaVencimiento = new Date(Date.now() + 12 * 3600 * 1000);
    const casiFin = await post(1);
    check('con medio día por delante entra el local y no hay cargo',
      casiFin.status === 200 && db.cargos.length === 0 && db.updates[0]?.localesExtra === 1,
      'el local tiene que ENTRAR igual: si no, se le cobraría en la renovación algo que no pudo usar');
    check('…y tampoco emite comprobante de S/0',
      db.comprobantes.length === 0,
      'un comprobante por cero gastaría un correlativo que no admite huecos');
  } finally {
    servidor.close();
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  process.exit(fallidas ? 1 : 0);
};

// El importe esperado se le pide a la librería con el MISMO reloj que usará la
// ruta. Es la comprobación débil, a propósito: la fuerte es que el cargo a Culqi
// coincida con lo que la previsualización le anunció al cliente, que es la que
// atrapa el bug de "muestra S/30 y cobra S/29.50".
function base_centimos() {
  return locales.prorrateo({
    plan: 'NEGOCIO', anual: false, fechaVencimiento: VENCE_RUTA(),
    localesExtraActual: 0, localesExtraNuevo: 1,
  }).centimos;
}

correr();
