// brand-shield/scripts/limpiar-pagos-prueba.js
// Deja una cuenta como si nunca hubiera pagado, para poder repetir la prueba
// del circuito de cobro sin arrastrar estado.
//
//   node scripts/limpiar-pagos-prueba.js <email>            ← muestra qué haría
//   node scripts/limpiar-pagos-prueba.js <email> --aplicar  ← lo hace
//
// Borra los pagos y comprobantes de esa cuenta, devuelve el correlativo de la
// serie al estado anterior (para que la numeración NO quede con huecos: es
// correlativa y no los admite), libera las tarjetas que consumieron la promo de
// bienvenida y devuelve la cuenta al plan Gratuito.
//
// ⚠️ Pensado para pagos hechos con llaves de PRUEBA. Se niega a borrar cargos
// que no sean `chr_test_`: un pago real no se limpia, se reembolsa desde Culqi
// y se anula con una nota de crédito.

const prisma = require('../src/lib/prisma');

const [email, ...flags] = process.argv.slice(2);
const aplicar = flags.includes('--aplicar');

if (!email) {
  console.error('Uso: node scripts/limpiar-pagos-prueba.js <email> [--aplicar]');
  process.exit(1);
}

(async () => {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, email: true, plan: true, suscripcionActiva: true, promoBienvenidaUsada: true },
  });
  if (!usuario) {
    console.error(`✗ No existe ninguna cuenta con el correo ${email}`);
    process.exit(1);
  }

  const pagos = await prisma.pago.findMany({
    where: { usuarioId: usuario.id },
    include: { comprobante: true },
  });
  const tarjetas = await prisma.promoTarjeta.findMany({ where: { usuarioId: usuario.id } });

  console.log(`Cuenta: ${usuario.email} — plan ${usuario.plan}, suscripción ${usuario.suscripcionActiva ? 'activa' : 'inactiva'}\n`);

  if (!pagos.length && !tarjetas.length) {
    console.log('No hay nada que limpiar: la cuenta no tiene pagos ni tarjetas de promo registradas.');
    process.exit(0);
  }

  // Barrera de seguridad: solo cargos de prueba
  const reales = pagos.filter(p => p.culqiCargoId && !p.culqiCargoId.startsWith('chr_test_'));
  if (reales.length) {
    console.error('✗ Hay pagos que NO son de prueba y este script no los toca:');
    reales.forEach(p => console.error(`   ${p.culqiCargoId} — S/${(p.monto / 100).toFixed(2)} del ${p.creadoEn.toISOString().slice(0, 10)}`));
    console.error('  Un cobro real se reembolsa en Culqi y se anula con nota de crédito, no se borra.');
    process.exit(1);
  }

  pagos.forEach(p => {
    console.log(`  pago        ${p.plan} ${p.tipo} S/${(p.monto / 100).toFixed(2)} (${p.culqiCargoId})`);
    if (p.comprobante) console.log(`  comprobante ${p.comprobante.tipo} ${p.comprobante.numero}`);
  });
  tarjetas.forEach(() => console.log('  tarjeta con la promo de bienvenida consumida'));
  console.log('  la cuenta vuelve al plan Gratuito');

  // Cuánto hay que retroceder cada serie para no dejar huecos
  const retrocesos = {};
  for (const p of pagos) {
    if (!p.comprobante) continue;
    const clave = `${p.comprobante.tipo}|${p.comprobante.serie}`;
    retrocesos[clave] = (retrocesos[clave] || 0) + 1;
  }
  Object.entries(retrocesos).forEach(([k, n]) => console.log(`  serie ${k.replace('|', ' ')} retrocede ${n}`));

  if (!aplicar) {
    console.log('\nEsto es solo una previsualización. Para aplicarlo:');
    console.log(`  node scripts/limpiar-pagos-prueba.js ${email} --aplicar`);
    process.exit(0);
  }

  // Todo o nada: si algo falla, la base queda como estaba.
  //
  // El timeout va explícito porque el de Prisma son 5 s y la base de producción
  // se alcanza por el proxy de Railway: con varias consultas seguidas, la
  // latencia basta para que la transacción expire a mitad ("Transaction not
  // found"). No cambiaba nada —para eso es atómica— pero tampoco terminaba.
  await prisma.$transaction(async (tx) => {
    const ids = pagos.map(p => p.id);
    await tx.comprobante.deleteMany({ where: { pagoId: { in: ids } } });
    await tx.pago.deleteMany({ where: { id: { in: ids } } });
    await tx.promoTarjeta.deleteMany({ where: { usuarioId: usuario.id } });

    for (const [clave, n] of Object.entries(retrocesos)) {
      const [tipo, serie] = clave.split('|');
      const fila = await tx.serieComprobante.findFirst({ where: { tipo, serie } });
      if (!fila) continue;
      const nuevo = fila.correlativo - n;
      // Si la serie se queda en 0 se borra la fila: el siguiente comprobante
      // vuelve a empezar en 1, igual que antes de la prueba.
      if (nuevo <= 0) await tx.serieComprobante.delete({ where: { id: fila.id } });
      else await tx.serieComprobante.update({ where: { id: fila.id }, data: { correlativo: nuevo } });
    }

    await tx.usuario.update({
      where: { id: usuario.id },
      data: {
        plan: 'GRATIS', suscripcionActiva: false, suscripcionId: null,
        fechaVencimiento: null, periodoFacturacion: null,
        promoBienvenidaUsada: false, mesesPromoRestantes: 0,
      },
    });
  }, { timeout: 30000, maxWait: 15000 });

  console.log('\n✓ Listo. La cuenta puede volver a probar el circuito completo, promo incluida.');
  process.exit(0);
})().catch(e => {
  console.error('✗ Falló y no se cambió nada:', e.message);
  process.exit(1);
});
