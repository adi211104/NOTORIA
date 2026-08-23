// brand-shield/scripts/reembolsar-cargo.js
//
// Devuelve un cargo de Culqi. Por terminal y a mano, no desde el panel web.
//
// 🔴 UN REEMBOLSO NO ANULA EL COMPROBANTE ANTE SUNAT. Culqi devuelve el dinero
// y la boleta o la factura siguen emitidas, declaradas y contando como venta.
// Anularlas es un trámite aparte, con su propio plazo:
//
//   · boleta  → resumen diario en estado 3, dentro de 7 días del CDR del
//               resumen que la informó
//   · factura → comunicación de baja (RA), hasta el 7.º día calendario
//
// Este script avisa de eso ANTES de devolver nada, y dice qué comprobante habría
// que anular. No lo anula él: son dos decisiones distintas y conviene que lo
// sean también en la práctica.
//
// ⚠️ Efecto lateral del webhook: cuando Culqi avisa del reembolso,
// `procesarReembolso` marca el pago como REEMBOLSADO **y pone
// `suscripcionActiva: false` al usuario**. Es lo correcto para un cobro de
// suscripción, pero si el cargo era una prueba suelta hay que restaurar ese
// campo a mano después.
//
// Uso:
//   node scripts/reembolsar-cargo.js <chargeId>            # muestra qué haría
//   node scripts/reembolsar-cargo.js <chargeId> --aplicar  # lo devuelve

// Necesita la llave LIVE de Culqi (solo en Railway) y la base (solo alcanzable
// con la URL del .env local): se llama con `railway run` y el ayudante arregla
// lo segundo.
require('./lib-env-produccion')();

const { PrismaClient } = require('@prisma/client');
const culqi = require('../src/lib/culqi');

const prisma = new PrismaClient();
const cargoId = process.argv[2];
const aplicar = process.argv.includes('--aplicar');

(async () => {
  if (!cargoId || cargoId.startsWith('--')) {
    console.log('Falta el id del cargo. Uso: node scripts/reembolsar-cargo.js <chargeId> [--aplicar]');
    process.exitCode = 1;
    return;
  }
  if (!culqi.configurado()) throw new Error('Falta CULQI_SECRET_KEY');

  const pago = await prisma.pago.findUnique({
    where: { culqiCargoId: cargoId },
    include: {
      usuario: { select: { email: true, plan: true, suscripcionActiva: true } },
      comprobante: { select: { numero: true, tipo: true, estadoSunat: true, fechaEmision: true } },
    },
  });

  console.log('═══ REEMBOLSO DE UN CARGO DE CULQI ═══\n');
  console.log(`cargo   : ${cargoId}`);
  console.log(`entorno : ${cargoId.startsWith('chr_live_') ? '🔴 LIVE — dinero real' : 'test'}`);

  if (!pago) {
    console.log('\n⚠️ Ese cargo NO está en la tabla `pagos`. Puede ser legítimo (un cobro hecho');
    console.log('   fuera de Notoria), pero el webhook no sabrá a qué pago aplicarlo.');
  } else {
    console.log(`pago    : ${pago.id} · S/${(pago.monto / 100).toFixed(2)} · estado ${pago.estado} · tipo ${pago.tipo}`);
    console.log(`usuario : ${pago.usuario.email} · plan ${pago.usuario.plan} · suscripción activa: ${pago.usuario.suscripcionActiva}`);
    if (pago.comprobante) {
      const c = pago.comprobante;
      console.log(`\n🔴 COMPROBANTE ASOCIADO: ${c.tipo} ${c.numero} · ${c.estadoSunat}`);
      console.log('   Devolver el dinero NO lo anula. Para que no quede declarado como venta hay que');
      console.log(c.tipo === 'BOLETA'
        ? '   informarlo en un resumen diario en estado 3 (plazo: 7 días desde el CDR del resumen).'
        : '   mandar una comunicación de baja (RA), hasta el 7.º día calendario desde la emisión.');
    }
  }

  if (!aplicar) {
    console.log('\nSimulacro: no se devolvió nada. Para hacerlo de verdad, añadir --aplicar');
    return;
  }

  console.log('\n── Devolviendo ──');
  // El monto sale del `Pago`, no de un argumento suelto: devolver algo distinto
  // de lo que se cobró sería un error caro y difícil de ver.
  if (!pago) throw new Error('Sin fila en `pagos` no se sabe cuánto devolver. Hazlo desde el panel de Culqi.');
  const r = await culqi.reembolsar({ cargoId, monto: pago.monto });
  console.log(`✅ Reembolso ${r.id} · S/${(r.amount / 100).toFixed(2)} · motivo ${r.reason}`);
  console.log(`   creado: ${r.creation_date ? new Date(r.creation_date).toISOString() : '—'}`);

  console.log('\nCulqi debería llamar ahora al webhook con `refund.creation.succeeded`.');
  console.log('Comprobarlo en los logs del backend:  railway logs --service api | grep "Culqi webhook"');
  console.log('Y en la base: el pago debe quedar en REEMBOLSADO.');
})()
  .catch((e) => {
    const culqiError = e.response?.data;
    console.error('ERROR:', culqiError?.merchant_message || culqiError?.user_message || e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
