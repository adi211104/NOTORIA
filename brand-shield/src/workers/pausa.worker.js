// brand-shield/src/workers/pausa.worker.js
//
// Avisa a las cuentas gratuitas que están a punto de pausarse por inactividad.
//
// La pausa en sí NO la hace este worker: la aplica `elegirVigilables` en el
// ciclo de monitoreo, preguntándole a `lib/dormancia.js`. Acá solo sale el aviso
// previo, que es lo que separa «pausar» de «apagarle la vigilancia a alguien sin
// decírselo».
//
// 🔴 Por qué la pausa se DERIVA y no se guarda en una columna `pausada`:
// exactamente por lo mismo que «pendiente de anular» se deriva de
// `Pago.estado` + `Comprobante.estadoSunat` en vez de tener su propio flag. Un
// estado guardado hay que mantenerlo sincronizado en los dos sentidos —al
// dormirse y al despertar— y el día que el cron no corra, o que alguien entre
// justo entre dos pasadas, la columna miente. Derivarlo de `ultimoAcceso` no
// puede desincronizarse: la persona entra y el siguiente ciclo ya la ve viva.
//
// ⚠️ Por eso mismo este worker es PRESCINDIBLE: si se cae, no se pausa de más ni
// de menos — solo deja de avisarse. La corrección del costo sigue funcionando.
// Al revés (un worker que apaga cuentas) un fallo dejaría gente pausada para
// siempre.

const cron = require('node-cron');
const prismaReal = require('../lib/prisma');
const emails = require('../utils/emails');
const dormancia = require('../lib/dormancia');

const DIA = 24 * 60 * 60 * 1000;

const procesarAvisosPausa = async (deps = {}) => {
  const prisma = deps.prisma || prismaReal;
  const enviarAvisoPausa = deps.enviarAvisoPausa || emails.enviarAvisoPausa;
  const ahora = deps.ahora || Date.now();

  // El filtro grueso en la BD, la decisión fina en `dormancia.tocaAvisar`.
  //
  // ⚠️ Se pide con holgura por los dos lados de la ventana (±2 días) para no
  // depender de que el `where` de Prisma y la regla de `dormancia` redondeen
  // igual. Misma precaución que en `verificacion.worker.js`: la consulta acota,
  // la librería decide.
  const umbral = dormancia.DIAS_INACTIVIDAD - dormancia.DIAS_AVISO_PREVIO;
  const usuarios = await prisma.usuario.findMany({
    where: {
      plan: 'GRATIS',
      emailVerificado: true,
      // Quien no tiene ningún negocio activo no tiene vigilancia que pausar, así
      // que avisarle de una pausa sería hablarle de algo que no existe.
      negocios: { some: { activo: true } },
    },
    select: {
      id: true, email: true, nombre: true, idioma: true, plan: true,
      emailVerificado: true, creadoEn: true, ultimoAcceso: true,
    },
  });

  let avisados = 0;
  for (const u of usuarios) {
    if (!dormancia.tocaAvisar(u, ahora)) continue;
    const dias = dormancia.diasParaPausa(u, ahora);
    try {
      await enviarAvisoPausa(u, dias);
      avisados++;
      console.log(`[Pausa] Aviso a ${u.email} — se pausa en ${dias} día(s)`);
    } catch (e) {
      // Un fallo de Resend no corta el barrido: el resto de la gente no tiene la
      // culpa. Y no hay nada que reintentar mañana, porque la ventana de aviso
      // es de un solo día — si falla, esa persona no recibe el aviso y su cuenta
      // se pausa igual. Es aceptable: la pausa no destruye nada y se deshace
      // entrando.
      console.error(`[Pausa] No se pudo avisar a ${u.email}:`, e.message);
    }
  }

  console.log(`[Pausa] ${usuarios.length} cuenta(s) gratuitas revisadas, ${avisados} aviso(s) enviados`);
  return { revisadas: usuarios.length, avisados };
};

const iniciarAvisosPausa = () => {
  // 11:00 de Lima (16:00 UTC). Desfasado del drip (10:00) y del recordatorio de
  // verificación (10:30) para no mandarle a la misma persona tres correos en la
  // misma media hora — que es la forma más rápida de que marque spam, y es
  // justamente el riesgo que las decisiones de correo del 09/09 vinieron a
  // reducir.
  cron.schedule('0 16 * * *', () => {
    procesarAvisosPausa().catch((e) => console.error('[Pausa] Error en el cron:', e.message));
  });
  console.log('[Pausa] Cron configurado: diario 11:00 (hora Lima), aviso previo de pausa');
};

module.exports = { procesarAvisosPausa, iniciarAvisosPausa };
