// Prepara la cuenta de prueba que se le entrega a un revisor externo (Culqi,
// Meta). Deja el correo ya verificado, porque el enlace de verificacion llega
// al buzon del dueño y no al del revisor: sin eso el panel muestra una franja
// amarilla que un revisor lee como una restriccion.
//
//   node scripts/cuenta-revisor.js <email> <password> [PLAN] [emailAnterior]
//
//   node scripts/cuenta-revisor.js revisorculqi@gmail.com Clave12345 GRATIS
//   node scripts/cuenta-revisor.js nuevo@correo.com Clave12345 GRATIS viejo@correo.com
//
// El cuarto argumento renombra una cuenta que ya existe en vez de crear otra,
// para no dejar cuentas huerfanas en produccion cada vez que se cambia de idea
// sobre el correo.
//
// PLAN por defecto GRATIS. Ojo con ponerlo en NEGOCIO para una revision de
// Culqi: en dashboard/planes el boton del plan que ya se tiene sale desactivado
// ("Plan actual"), asi que el revisor no podria completar esa compra.
//
// OJO: el .env local apunta a la base de PRODUCCION. Esto toca una cuenta real.
// No crea ningun registro de Pago ni comprobante (ver dar-plan.js).

require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

const PLANES = ['GRATIS', 'NEGOCIO', 'FRANQUICIA'];

const [email, password, plan = 'GRATIS', emailAnterior] = process.argv.slice(2);

if (!email || !password) {
  console.error('\nUso: node scripts/cuenta-revisor.js <email> <password> [PLAN] [emailAnterior]\n');
  process.exit(1);
}
if (!PLANES.includes(plan)) {
  console.error(`\nPlan invalido: "${plan}". Debe ser uno de: ${PLANES.join(', ')}\n`);
  process.exit(1);
}
if (password.length < 8) {
  console.error('\nLa contraseña debe tener al menos 8 caracteres (lo exige el registro).\n');
  process.exit(1);
}

(async () => {
  const esPago = plan !== 'GRATIS';
  const vence = new Date();
  vence.setDate(vence.getDate() + 30);

  const datos = {
    // Genérico a propósito: esta cuenta se usa para Culqi y para Meta, y el
    // nombre sale en el saludo del panel que ve el revisor.
    nombre: 'Revisor',
    email,
    password: await bcrypt.hash(password, 12),
    emailVerificado: true,
    tokenVerificacion: null,
    tokenVerificaExpira: null,
    plan,
    suscripcionActiva: esPago,
    fechaVencimiento: esPago ? vence : null,
    periodoFacturacion: esPago ? 'mensual' : null,
  };
  const visible = { email: true, nombre: true, plan: true, emailVerificado: true, suscripcionActiva: true };

  const anterior = emailAnterior
    ? await prisma.usuario.findUnique({ where: { email: emailAnterior }, select: { id: true } })
    : null;

  if (emailAnterior && !anterior) {
    console.error(`\nNo existe ninguna cuenta con el correo anterior ${emailAnterior}\n`);
    process.exit(1);
  }

  const cuenta = anterior
    ? await prisma.usuario.update({ where: { id: anterior.id }, data: datos, select: visible })
    : await prisma.usuario.upsert({ where: { email }, update: datos, create: datos, select: visible });

  console.log('\n  Cuenta lista:', cuenta);
  console.log('\n  Entra en https://usenotoria.app/login con ese correo y la contraseña que pasaste.\n');

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\nERROR:', e.message, '\n');
  await prisma.$disconnect();
  process.exit(1);
});
