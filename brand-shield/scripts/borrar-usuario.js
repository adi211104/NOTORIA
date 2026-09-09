// brand-shield/scripts/borrar-usuario.js
//
// Borra una cuenta desde la terminal. Para cuentas de prueba, direcciones
// desechables y altas que nunca se verificaron.
//
//   node scripts/borrar-usuario.js <email>              ← SIMULACRO, no toca nada
//   node scripts/borrar-usuario.js <email> --aplicar    ← lo hace
//
// ⚠️ Va EN LOCAL, no con `railway run`: usa `lib-env-produccion.js`, que arregla
// la trampa de que `railway run` da los secretos de producción pero pisa
// `DATABASE_URL` con el host INTERNO de Postgres, inalcanzable desde fuera.
//
// 🔴 No reimplementa nada: llama a `lib/borrarCuenta.js`, el mismo código que
// corre cuando un cliente se da de baja desde el panel. El orden de los borrados
// lo exigen media docena de FK con ON DELETE RESTRICT, y una segunda copia de esa
// secuencia se desincroniza el día que alguien añada una tabla — contra
// producción y a mitad del borrado.
//
// ⚠️ Si la cuenta tiene pagos o comprobantes, NO se borra: se anonimiza. El XML
// firmado y el CDR hay que conservarlos 5 años. El script lo dice antes.

require('./lib-env-produccion')();

const prisma = require('../src/lib/prisma');
const { borrarCuenta, inventario } = require('../src/lib/borrarCuenta');

const email = (process.argv[2] || '').trim().toLowerCase();
const aplicar = process.argv.includes('--aplicar');

const salir = (mensaje, codigo = 1) => { console.error(mensaje); process.exit(codigo); };

(async () => {
  if (!email) salir('Uso: node scripts/borrar-usuario.js <email> [--aplicar]');

  // Sin distinguir mayúsculas, igual que el login: hay cuentas viejas creadas
  // con una mayúscula y un findUnique no las encontraría.
  const usuario = await prisma.usuario.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      id: true, email: true, nombre: true, plan: true, creadoEn: true,
      emailVerificado: true, suscripcionActiva: true, suscripcionId: true,
    },
  });
  if (!usuario) salir(`No existe ninguna cuenta con el correo ${email}`);

  const inv = await inventario(usuario.id);

  console.log(`\n── Cuenta ${usuario.email}`);
  console.log(`   id ${usuario.id}`);
  console.log(`   nombre: ${usuario.nombre}`);
  console.log(`   plan: ${usuario.plan}${usuario.suscripcionActiva ? ' (suscripción ACTIVA)' : ''}`);
  console.log(`   correo verificado: ${usuario.emailVerificado ? 'sí' : 'NO'}`);
  console.log(`   creada: ${usuario.creadoEn.toISOString().slice(0, 10)}`);
  console.log('\n── Lo que se va a borrar');
  console.log(`   negocios ................ ${inv.negocios.length}${inv.negocios.length ? ` (${inv.negocios.join(', ')})` : ''}`);
  console.log(`   snapshots ............... ${inv.snapshots}`);
  console.log(`   reseñas ................. ${inv.resenas}`);
  console.log(`   alertas ................. ${inv.alertas}`);
  console.log(`   menciones ............... ${inv.menciones}`);
  console.log(`   comentarios sociales .... ${inv.comentarios}`);
  console.log(`   competidores ............ ${inv.competidores} (${inv.snapshotsCompetidor} snapshots)`);
  console.log(`   miembros/invitaciones ... ${inv.miembros} / ${inv.invitaciones}`);
  console.log(`   registro de actividad ... ${inv.actividad}`);
  console.log('\n── Historial fiscal (NO se borra nunca)');
  console.log(`   pagos ................... ${inv.pagos}`);
  console.log(`   comprobantes ............ ${inv.comprobantes}`);

  // 🔴 Los snapshots son lo único de esta base que no se puede volver a
  // conseguir: Google enseña la foto de hoy, no la película. Se avisa aparte
  // porque es la cifra que debería hacer dudar antes de un `--aplicar`.
  if (inv.snapshots > 0) {
    console.log(`\n⚠️  Se pierden ${inv.snapshots} snapshots, y eso NO se puede recuperar:`);
    console.log('   Google devuelve el estado de hoy, no el histórico. Si hacen falta,');
    console.log('   correr primero `node scripts/respaldo.js`.');
  }

  console.log(inv.tieneHistorialFiscal
    ? '\n➡️  Modo: ANONIMIZAR (tiene historial fiscal, la fila mínima se conserva 5 años)'
    : '\n➡️  Modo: BORRAR de verdad (no tiene historial fiscal que conservar)');

  if (usuario.suscripcionId) {
    console.log('\n⚠️  Esta cuenta tiene una TARJETA GUARDADA en Culqi. Borrarla acá no');
    console.log('   cancela nada en Culqi: si la suscripción estuviera viva, hay que');
    console.log('   cancelarla antes o el cron intentaría cobrarle a una cuenta que ya no existe.');
  }

  if (!aplicar) {
    console.log('\n🔍 SIMULACRO — no se ha tocado nada. Repetir con --aplicar para hacerlo.');
    await prisma.$disconnect();
    return;
  }

  const { modo } = await borrarCuenta(usuario.id);
  console.log(`\n✅ Cuenta ${modo === 'BORRADA' ? 'borrada' : 'anonimizada'}: ${usuario.email}`);

  // Comprobante del resultado, no del comando: se vuelve a preguntar a la base.
  // «Se ejecutó sin error» y «ya no está» son cosas distintas.
  const quedaPorEmail = await prisma.usuario.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true },
  });
  const quedaPorId = await prisma.usuario.findUnique({
    where: { id: usuario.id }, select: { email: true, nombre: true },
  });
  console.log(`   ¿alguien con ese correo? ${quedaPorEmail ? '🔴 SÍ, algo salió mal' : 'no'}`);
  console.log(`   la fila por id: ${quedaPorId ? `${quedaPorId.nombre} <${quedaPorId.email}>` : 'ya no existe'}`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\n❌ Falló:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
