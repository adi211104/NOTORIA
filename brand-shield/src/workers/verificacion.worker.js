// brand-shield/src/workers/verificacion.worker.js
//
// Recordatorio de activación de cuenta: le vuelve a mandar el enlace a quien se
// registró y nunca confirmó su correo.
//
// Tapa un hueco que no producía ni un error: el correo del registro caduca a las
// 24 h y, si no se abre ese día, la cuenta queda muerta y nadie se entera. Esas
// cuentas tampoco entran al drip de onboarding (filtra por `emailVerificado`),
// así que dejan de recibir absolutamente todo. El 2026-08-23 eran 4 de 11.
//
// La regla de cuándo toca vive en `lib/verificacion.js`, compartida con
// `scripts/recordar-verificacion.js` y con las pruebas: si cada uno la contara
// por su cuenta, acabarían discrepando — el mismo motivo por el que el plazo del
// Libro de Reclamaciones vive en `lib/reclamaciones.js`.
//
// 🔴 El token se REGENERA en cada recordatorio. No es opcional: el del registro
// caducó hace días, así que reenviarlo tal cual sería mandar un enlace muerto,
// que es peor que no escribir — la persona hace clic, ve un error y concluye que
// el producto está roto.

const cron = require('node-cron');
const { programar } = require('../lib/candado');
const crypto = require('crypto');
const prismaReal = require('../lib/prisma');
const emails = require('../utils/emails');
const { tocaRecordatorio, HORAS_VIGENCIA_TOKEN, VENTANA_DIAS } = require('../lib/verificacion');

const procesarRecordatoriosVerificacion = async (deps = {}) => {
  const prisma = deps.prisma || prismaReal;
  const enviarVerificacion = deps.enviarVerificacion || emails.enviarVerificacion;
  const ahora = deps.ahora || Date.now();

  // El filtro grueso lo hace la BD; la decisión fina la toma `tocaRecordatorio`.
  // Se pide con holgura (hasta+1 días) para no depender de que la frontera de la
  // consulta y la de la regla redondeen igual.
  const usuarios = await prisma.usuario.findMany({
    where: {
      emailVerificado: false,
      creadoEn: { gte: new Date(ahora - (VENTANA_DIAS.hasta + 1) * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true, email: true, nombre: true, idioma: true,
      emailVerificado: true, creadoEn: true, tokenVerificaExpira: true,
    },
  });

  let enviados = 0;
  for (const u of usuarios) {
    const veredicto = tocaRecordatorio(u, ahora);
    if (!veredicto.toca) continue;

    const token = crypto.randomBytes(20).toString('hex');
    const expira = new Date(ahora + HORAS_VIGENCIA_TOKEN * 60 * 60 * 1000);

    // 🔴 El token se guarda ANTES de enviar, igual que la etapa del drip se
    // avanza antes del correo. Si Resend falla después de haber escrito el
    // token, se pierde ESE recordatorio; si se hiciera al revés y fallara la
    // escritura, la persona recibiría un enlace que la base no reconoce.
    await prisma.usuario.update({
      where: { id: u.id },
      data: { tokenVerificacion: token, tokenVerificaExpira: expira },
    });

    try {
      await enviarVerificacion(u, token, {
        recordatorio: true,
        diasDesdeRegistro: veredicto.diasDesdeRegistro,
      });
      enviados++;
      console.log(`[Verificación] Recordatorio a ${u.email} — ${veredicto.motivo}`);
    } catch (e) {
      console.error(`[Verificación] Error escribiendo a ${u.email}:`, e.message);
    }
  }

  if (usuarios.length) {
    console.log(`[Verificación] ${usuarios.length} cuenta(s) sin verificar revisadas, ${enviados} recordatorio(s) enviados`);
  }
  return { revisados: usuarios.length, enviados };
};

const iniciarRecordatoriosVerificacion = () => {
  // 10:30, media hora después del drip: los dos mandan correo y no tiene sentido
  // pegarle a Resend con las dos cosas a la vez. Mismo criterio que el desfase
  // entre las dos colas de SUNAT.
  programar('30 10 * * *', 'recordatorio-verificacion', 30, () => (
    procesarRecordatoriosVerificacion().catch((e) => console.error('[Verificación] Ciclo falló:', e.message))
  ), { timezone: 'America/Lima' });
  console.log('[Verificación] Programado: todos los días 10:30 (hora Lima)');
};

module.exports = { iniciarRecordatoriosVerificacion, procesarRecordatoriosVerificacion };
