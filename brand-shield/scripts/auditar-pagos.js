// brand-shield/scripts/auditar-pagos.js
// Foto de solo lectura del estado de cobros en la base: pagos registrados,
// usuarios con plan de pago, comprobantes y tarjetas que ya gastaron la promo.
//
//   node scripts/auditar-pagos.js
//
// Para qué: al rotar de llaves de test a live hay que comprobar que nadie se
// activó un plan de pago con la tarjeta de prueba mientras hubo llaves de test
// en producción (los cargos de prueba se reconocen por el prefijo `chr_test_`
// en culqiCargoId). No modifica nada.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/lib/prisma');

const fecha = (d) => (d ? d.toISOString().slice(0, 10) : '—');

(async () => {
  const pagos = await prisma.pago.findMany({
    select: {
      plan: true, periodo: true, tipo: true, monto: true, moneda: true, estado: true,
      culqiCargoId: true, creadoEn: true, usuario: { select: { email: true } },
    },
    orderBy: { creadoEn: 'desc' },
  });

  console.log(`PAGOS registrados: ${pagos.length}`);
  for (const p of pagos) {
    const prueba = p.culqiCargoId?.startsWith('chr_test_') ? '  ← CARGO DE PRUEBA (no cobró dinero)' : '';
    console.log(`  ${fecha(p.creadoEn)}  ${p.usuario?.email ?? '(sin usuario)'}  ${p.plan}/${p.periodo}  ` +
      `${p.moneda} ${(p.monto / 100).toFixed(2)}  ${p.estado}  ${p.culqiCargoId ?? '—'}${prueba}`);
  }

  const conPlan = await prisma.usuario.findMany({
    where: { OR: [{ suscripcionActiva: true }, { plan: { not: 'GRATIS' } }] },
    select: { email: true, plan: true, suscripcionActiva: true, fechaVencimiento: true, suscripcionId: true },
  });

  console.log(`\nUSUARIOS con plan de pago o suscripción activa: ${conPlan.length}`);
  for (const u of conPlan) {
    // Sin tarjeta guardada = plan concedido a mano, no comprado. Es lo que
    // distingue una cuenta del dueño de un cobro real.
    const origen = u.suscripcionId ? `tarjeta ${u.suscripcionId}` : 'concedido a mano (sin tarjeta)';
    console.log(`  ${u.email}  ${u.plan}  activa=${u.suscripcionActiva}  vence=${fecha(u.fechaVencimiento)}  ${origen}`);
  }

  const [comprobantes, promoTarjetas, series] = await Promise.all([
    prisma.comprobante.count(),
    prisma.promoTarjeta.count(),
    prisma.serieComprobante.findMany({ select: { tipo: true, serie: true, correlativo: true } }).catch(() => []),
  ]);

  console.log(`\nComprobantes emitidos: ${comprobantes}`);
  console.log(`Tarjetas que ya usaron la promo: ${promoTarjetas}`);
  if (series.length) console.log('Series:', series.map(s => `${s.tipo} ${s.serie}=${s.correlativo}`).join(' '));

  await prisma.$disconnect();
})();
