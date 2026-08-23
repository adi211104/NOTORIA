// brand-shield/scripts/recordar-verificacion.js
//
// Pasada ÚNICA y manual: le manda el enlace de activación a las cuentas que ya
// quedaron sin verificar antes de que existiera el cron.
//
// 🔴 Por qué no lo hace el cron. `verificacion.worker.js` solo insiste entre el
// 2.º y el 10.º día de vida de la cuenta, a propósito: pasado eso, seguir
// escribiendo a un buzón que nunca confirmó nada es spam. Pero cuando el cron se
// estrenó ya había cuentas de hacía 49 días esperando, y esas quedan fuera de la
// ventana para siempre. Recuperarlas es una decisión de una vez, tomada por una
// persona — no una regla automática.
//
// Uso:
//   node scripts/recordar-verificacion.js              # listado, no manda nada
//   node scripts/recordar-verificacion.js --aplicar    # manda los correos
//
// El espaciado mínimo de `lib/verificacion.js` se respeta igual, así que correrlo
// dos veces el mismo día no duplica nada.

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { enviarVerificacion } = require('../src/utils/emails');
const { ultimoEnvioVerificacion, HORAS_VIGENCIA_TOKEN, ESPACIADO_DIAS, DIA_MS } = require('../src/lib/verificacion');

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

(async () => {
  const ahora = Date.now();
  const usuarios = await prisma.usuario.findMany({
    where: { emailVerificado: false },
    select: {
      id: true, email: true, nombre: true, idioma: true,
      emailVerificado: true, creadoEn: true, tokenVerificaExpira: true, plan: true,
      _count: { select: { negocios: true } },
    },
    orderBy: { creadoEn: 'asc' },
  });

  console.log(`\n${usuarios.length} cuenta(s) sin verificar\n`);
  if (!usuarios.length) return;

  const candidatas = [];
  for (const u of usuarios) {
    const diasRegistro = Math.floor((ahora - new Date(u.creadoEn).getTime()) / DIA_MS);
    const diasUltimo = Math.floor((ahora - ultimoEnvioVerificacion(u).getTime()) / DIA_MS);
    const reciente = diasUltimo < ESPACIADO_DIAS;

    console.log(`  ${u.email}`);
    console.log(`     registrada hace ${diasRegistro} día(s) · último correo hace ${diasUltimo} · plan ${u.plan} · ${u._count.negocios} negocio(s)`);
    if (reciente) console.log(`     ⏭️  se salta: se le escribió hace menos de ${ESPACIADO_DIAS} días`);
    else candidatas.push({ ...u, diasRegistro });
    console.log('');
  }

  if (!aplicar) {
    console.log(`Se les escribiría a ${candidatas.length} de ${usuarios.length}.`);
    console.log('Listado nada más. Para mandarlos de verdad: --aplicar');
    return;
  }

  let enviados = 0;
  for (const u of candidatas) {
    const token = crypto.randomBytes(20).toString('hex');
    const expira = new Date(ahora + HORAS_VIGENCIA_TOKEN * 60 * 60 * 1000);
    // El token se guarda antes de enviar, igual que en el worker.
    await prisma.usuario.update({
      where: { id: u.id },
      data: { tokenVerificacion: token, tokenVerificaExpira: expira },
    });
    try {
      await enviarVerificacion(u, token, { recordatorio: true, diasDesdeRegistro: u.diasRegistro });
      enviados++;
      console.log(`✅ ${u.email}`);
    } catch (e) {
      console.error(`❌ ${u.email}: ${e.message}`);
    }
  }

  console.log(`\n${enviados}/${candidatas.length} recordatorio(s) enviados.`);
})()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
