// brand-shield/scripts/armar-renovacion.js
//
// Deja una cuenta lista para que el cron de renovación de Culqi la cobre en su
// próxima pasada (5:00 AM, hora del servidor).
//
// 🔴 POR QUÉ EXISTE. La renovación es el único tramo del circuito de cobro que
// nunca se ha ejercitado con dinero real, y es el más caro de equivocar: si
// falla, el cliente paga UNA vez y conserva el plan gratis para siempre. No hay
// error, ni log, ni cargo fallido que lo delate (§8.6). Esperar a un aniversario
// de verdad son 30 días; esto lo adelanta a mañana.
//
// 🔴 ESTO NO COBRA NADA. Solo pone las condiciones. Quien cobra es el cron, solo
// y desatendido. Es deliberado: lo que hay que probar es que el cron ENCUENTRE
// al vencido y le cobre sin que nadie lo empuje — llamar al cobro a mano
// probaría otra cosa, justo la que no falla.
//
// El cron pide CUATRO condiciones a la vez (monitoreo.worker.js):
//     suscripcionActiva: true
//     tarjetaCulqiId:     not null       ← la tarjeta guardada; esto NO se inventa
//     plan:              in PLANES_DE_PAGO
//     fechaVencimiento:  <= fin de hoy
// Este script solo toca la primera y la cuarta. Si falta la tarjeta se niega:
// sin ella no hay nada que probar y armarlo sería preparar un fallo.
//
// ⚠️ CONSECUENCIAS, que se aceptan antes y no se descubren después:
//   · sale un cargo REAL a la tarjeta guardada;
//   · se emite un comprobante que gasta un correlativo, y la numeración no
//     admite huecos;
//   · si luego se reembolsa, hay que ANULAR la boleta aparte dentro de 7 días
//     (reembolsar en Culqi no la anula, §9).
//
// ✅ ESTE SÍ SE CORRE EN LOCAL, al revés que `forzar-resumen-sunat.js` y
// `reembolsar-cargo.js`. La diferencia es que aquellos LLAMAN a SUNAT y a Culqi,
// y en local encuentran beta y las llaves de test (§3); este solo escribe dos
// campos en la base, y el `.env` local apunta a la base de PRODUCCIÓN. Por eso
// imprime el host de la base y no un aviso de llaves: aquí ese aviso haría creer
// que no se armó nada en producción cuando sí se armó.
//
//     node -r dotenv/config scripts/armar-renovacion.js <email>
//     node -r dotenv/config scripts/armar-renovacion.js <email> --aplicar
//
// ⚠️ No hace falta desplegar nada para usarlo, pero por eso mismo NO está en el
// contenedor: `railway ssh ... armar-renovacion.js` falla con «Cannot find
// module» hasta el siguiente `railway up`.

require('dotenv').config();
const prisma = require('../src/lib/prisma');
const { montoSuscripcion, MONEDA } = require('../src/lib/precios');
const { PLANES_DE_PAGO } = require('../src/lib/planes');

// Solo cuentas del dueño. Misma guarda que `ensayo-alertas.js`: esto dispara un
// cobro real, y hacerlo sobre la tarjeta de otra persona no es una prueba, es
// cargarle algo que no pidió.
const CUENTAS_PERMITIDAS = [
  'revisorculqi@gmail.com',
  'didier@usenotoria.app',
  'didierprincipe@gmail.com',
  'revisormeta@usenotoria.app',
];

const soles = (c) => 'S/' + (c / 100).toFixed(2);

(async () => {
  const email = process.argv[2];
  const aplicar = process.argv.includes('--aplicar');

  if (!email) {
    console.error('Falta el correo.\n  node scripts/armar-renovacion.js <email> [--aplicar]');
    process.exit(1);
  }
  if (!CUENTAS_PERMITIDAS.includes(email)) {
    console.error(`\n🔴 ${email} no está en la lista de cuentas de prueba del dueño.`);
    console.error('   Esto arma un COBRO REAL. No se corre sobre la tarjeta de un cliente.');
    process.exit(1);
  }

  const u = await prisma.usuario.findUnique({
    where: { email },
    select: {
      id: true, email: true, plan: true, periodoFacturacion: true, localesExtra: true,
      suscripcionActiva: true, tarjetaCulqiId: true, fechaVencimiento: true,
      mesesPromoRestantes: true,
    },
  });
  if (!u) { console.error(`No existe ${email}.`); process.exit(1); }

  console.log('\n═══ ARMAR LA RENOVACIÓN PARA PROBARLA ═══\n');
  console.log('cuenta:', u.email);

  // 🔴 Lo único que importa acá es a qué BASE se escribe. Este script no llama a
  // Culqi ni a SUNAT: solo cambia dos campos. Quien cobra es el cron, dentro del
  // contenedor y con las llaves de allá. Por eso se imprime el host de la base y
  // NO se avisa de "llaves de test": ese aviso, en este script, haría creer que
  // no se armó nada en producción cuando sí se armó.
  const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').replace(/\/.*$/, '') || '(sin DATABASE_URL)';
  console.log('base  :', host, host.includes('internal') ? '(dentro del contenedor)' : '(desde fuera)');
  console.log('        ⚠️ Este script SOLO escribe en la base. El cobro lo hará el cron,');
  console.log('        en el contenedor y con las llaves de producción.');

  // ── Las cuatro condiciones, una por una ──────────────────────────────────
  const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);
  const cond = [
    ['suscripcionActiva: true', u.suscripcionActiva === true, 'la pone este script'],
    ['tarjetaCulqiId: not null', !!u.tarjetaCulqiId, 'NO se puede inventar'],
    ['plan in PLANES_DE_PAGO', PLANES_DE_PAGO.includes(u.plan), 'depende del plan'],
    ['fechaVencimiento <= hoy', !!u.fechaVencimiento && u.fechaVencimiento <= finHoy, 'la adelanta este script'],
  ];
  console.log('\n── Lo que el cron exige ──');
  cond.forEach(([q, ok, nota]) => console.log('  ', ok ? '✅' : '❌', q.padEnd(26), ok ? '' : '← ' + nota));

  if (!u.tarjetaCulqiId) {
    console.error('\n🔴 No hay tarjeta guardada. Sin ella el cron no puede cobrar, y armar esto');
    console.error('   solo prepararía un fallo. Hace falta una suscripción contratada de verdad.');
    process.exit(1);
  }
  if (!PLANES_DE_PAGO.includes(u.plan)) {
    console.error(`\n🔴 El plan ${u.plan} no es de pago: el cron lo filtra y nunca lo cobraría.`);
    process.exit(1);
  }

  // ── Cuánto cobraría, con el MISMO cálculo que producción ─────────────────
  // Nada de recalcularlo aquí a mano: si este script y el worker discreparan, la
  // prueba diría que todo está bien mientras el cobro sale por otro importe. Es
  // el error que este proyecto ya cometió duplicando los precios.
  const periodo = u.periodoFacturacion === 'anual' ? 'anual' : 'mensual';
  const precioBase = montoSuscripcion(u.plan, periodo === 'anual', u.localesExtra);
  const enPromo = periodo === 'mensual' && u.mesesPromoRestantes > 0;
  const monto = enPromo ? Math.round(precioBase / 2) : precioBase;

  console.log('\n── Lo que el cron cobrará ──');
  console.log('   plan           :', u.plan, '·', periodo, '· locales extra:', u.localesExtra);
  console.log('   precio de tabla:', soles(precioBase), MONEDA);
  console.log('   promo activa   :', enPromo ? `sí — quedan ${u.mesesPromoRestantes} mes/es al 50%` : 'no');
  console.log('   🔴 IMPORTE     :', soles(monto), MONEDA, '← cargo REAL a la tarjeta guardada');

  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const proximo = new Date();
  proximo.setMonth(proximo.getMonth() + (periodo === 'anual' ? 12 : 1));

  console.log('\n── Lo que este script cambiaría ──');
  console.log('   suscripcionActiva:', u.suscripcionActiva, '→ true');
  console.log('   fechaVencimiento :', u.fechaVencimiento ? u.fechaVencimiento.toISOString() : 'null',
    '→', ayer.toISOString());
  console.log('\n   ⚠️ Anota los valores de la izquierda: son la marcha atrás si quieres deshacerlo.');

  console.log('\n── Qué mirar después de la pasada de las 5:00 ──');
  console.log('   1. Un Pago EXITOSO de', soles(monto), 'con tipo RENOVACION (no INICIAL).');
  console.log('   2. Un comprobante nuevo, el siguiente correlativo de B001.');
  console.log('   3. mesesPromoRestantes:', u.mesesPromoRestantes, '→', enPromo ? u.mesesPromoRestantes - 1 : u.mesesPromoRestantes);
  console.log('   4. fechaVencimiento en ~', proximo.toISOString().slice(0, 10),
    '— se calcula desde HOY porque el anterior ya habrá pasado.');
  console.log('   5. En los logs, el ciclo de renovaciones de las 5:00.');

  if (!aplicar) {
    console.log('\nSimulacro: no se cambió nada. Para armarlo de verdad, añadir --aplicar\n');
    await prisma.$disconnect();
    return;
  }

  await prisma.usuario.update({
    where: { id: u.id },
    data: { suscripcionActiva: true, fechaVencimiento: ayer },
  });

  // Releer y comprobar las cuatro condiciones sobre la fila de verdad, no sobre
  // lo que creemos haber escrito.
  const v = await prisma.usuario.findUnique({
    where: { id: u.id },
    select: { suscripcionActiva: true, tarjetaCulqiId: true, plan: true, fechaVencimiento: true },
  });
  const listo = v.suscripcionActiva && v.tarjetaCulqiId && PLANES_DE_PAGO.includes(v.plan)
    && v.fechaVencimiento && v.fechaVencimiento <= finHoy;

  console.log('\n' + (listo
    ? '✅ ARMADO. Las cuatro condiciones se cumplen sobre la fila releída de la base.'
    : '❌ Algo no cuadra tras el update — revisarlo antes de esperar nada del cron.'));
  console.log('   El cobro saldrá SOLO en la pasada de las 5:00, sin nadie delante.');
  console.log('   🔴 Después: reembolsar Y anular la boleta dentro de 7 días.\n');

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
