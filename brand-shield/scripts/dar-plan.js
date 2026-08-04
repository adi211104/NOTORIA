// Cambia el plan de una cuenta a mano, para probar funciones de pago sin
// pasar por Culqi (que todavia no tiene llaves).
//
//   node scripts/dar-plan.js tu@correo.com NEGOCIO
//   node scripts/dar-plan.js tu@correo.com FRANQUICIA
//   node scripts/dar-plan.js tu@correo.com GRATIS      <- para revertir
//
// OJO: el .env local apunta a la base de PRODUCCION. Esto modifica una cuenta
// real. Usalo solo sobre tu propia cuenta de pruebas.
//
// No crea ningun registro de Pago ni emite comprobante: solo mueve el plan.
// Asi la prueba no ensucia la numeracion de comprobantes, que es correlativa y
// no puede tener huecos.

require('dotenv').config();
const prisma = require('../src/lib/prisma');

const PLANES = ['GRATIS', 'NEGOCIO', 'FRANQUICIA'];

const [email, plan] = process.argv.slice(2);

if (!email || !plan) {
  console.error('\nUso: node scripts/dar-plan.js <email> <GRATIS|NEGOCIO|FRANQUICIA>\n');
  process.exit(1);
}
if (!PLANES.includes(plan)) {
  console.error(`\nPlan invalido: "${plan}". Debe ser uno de: ${PLANES.join(', ')}\n`);
  process.exit(1);
}

(async () => {
  const antes = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, email: true, plan: true, suscripcionActiva: true, fechaVencimiento: true },
  });

  if (!antes) {
    console.error(`\nNo existe ninguna cuenta con el correo ${email}\n`);
    process.exit(1);
  }

  const esPago = plan !== 'GRATIS';
  const vence = new Date();
  vence.setDate(vence.getDate() + 30);

  const despues = await prisma.usuario.update({
    where: { email },
    data: {
      plan,
      suscripcionActiva: esPago,
      // 30 dias por delante para que el cron de renovacion no intente cobrar
      // hoy mismo; si se vuelve a GRATIS se limpia.
      fechaVencimiento: esPago ? vence : null,
      periodoFacturacion: esPago ? 'mensual' : null,
    },
    select: { email: true, plan: true, suscripcionActiva: true, fechaVencimiento: true },
  });

  console.log('\n  antes  ->', antes.plan, '| activa:', antes.suscripcionActiva,
    '| vence:', antes.fechaVencimiento ? antes.fechaVencimiento.toISOString().slice(0, 10) : '—');
  console.log('  ahora  ->', despues.plan, '| activa:', despues.suscripcionActiva,
    '| vence:', despues.fechaVencimiento ? despues.fechaVencimiento.toISOString().slice(0, 10) : '—');
  console.log('\n  Cierra sesion y vuelve a entrar para que el panel tome el plan nuevo.\n');

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\nERROR:', e.message, '\n');
  await prisma.$disconnect();
  process.exit(1);
});
