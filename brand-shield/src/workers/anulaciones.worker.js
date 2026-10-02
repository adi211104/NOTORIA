// brand-shield/src/workers/anulaciones.worker.js
//
// Recordatorio diario de comprobantes reembolsados que siguen vivos ante SUNAT.
//
// 🔴 POR QUÉ NO BASTA EL AVISO DEL WEBHOOK. El correo que sale en cuanto Culqi
// notifica el reembolso es el importante, pero es UNO SOLO y llega sin avisar,
// probablemente fuera de horario. El plazo para anular son 7 días y después ya
// no se puede: toca una nota de crédito, que es otro trámite y otro documento.
//
// Un aviso que se pierde en la bandeja el jueves y un plazo que vence el
// miércoles siguiente son exactamente la combinación que hace perder dinero. Por
// eso esto insiste **cada día hasta que el comprobante quede anulado** — el
// mismo criterio que el cron del Libro de Reclamaciones, y por el mismo motivo:
// hay un plazo legal corriendo y el silencio no es una respuesta.
//
// La condición de "pendiente" no necesita columna: se deriva de que el pago esté
// REEMBOLSADO y el comprobante siga ACEPTADO. Ver `lib/anulacionPendiente.js`.

const cron = require('node-cron');
const { programar } = require('../lib/candado');
const prismaReal = require('../lib/prisma');
const emails = require('../utils/emails');
const anulacion = require('../lib/anulacionPendiente');

// Cuántos días se sigue avisando DESPUÉS de que venza el plazo.
//
// No se calla en cuanto vence: que ya no se pueda anular no significa que no
// haya nada que hacer — hay que emitir una nota de crédito, y eso también tiene
// que enterarse alguien. Pero tampoco se avisa para siempre: pasada esta ventana
// el asunto dejó de ser urgente y repetirlo cada día lo convierte en ruido que
// se aprende a ignorar, que es lo peor que le puede pasar a un aviso.
const DIAS_INSISTIENDO_TRAS_VENCER = 7;

const revisarAnulacionesPendientes = async (deps = {}) => {
  const prisma = deps.prisma || prismaReal;
  const avisar = deps.enviarAvisoAnulacionPendiente || emails.enviarAvisoAnulacionPendiente;
  const ahora = deps.ahora || Date.now();

  const pagos = await prisma.pago.findMany({
    where: { estado: 'REEMBOLSADO' },
    include: { comprobante: true },
  });

  let avisados = 0;
  for (const pago of pagos) {
    if (!anulacion.necesitaAnulacion(pago.comprobante, pago)) continue;

    const dias = anulacion.diasRestantes(pago.comprobante, ahora);
    if (dias < -DIAS_INSISTIENDO_TRAS_VENCER) continue;

    try {
      await avisar({
        comprobante: pago.comprobante,
        pago,
        diasRestantes: dias,
        comando: anulacion.comandoParaAnular(pago.comprobante),
        primerAviso: false,
      });
      avisados++;
    } catch (e) {
      console.error(`[Anulación] No se pudo avisar de ${pago.comprobante.numero}:`, e.message);
    }
  }

  if (avisados) console.log(`[Anulación] ${avisados} comprobante(s) reembolsado(s) siguen sin anular`);
  return { revisados: pagos.length, avisados };
};

const iniciarAvisoAnulaciones = () => {
  // 8:00, antes que el resto de correos del día: si hay algo que anular, es lo
  // primero que hay que ver, no lo que aparece después de tres resúmenes.
  programar('0 8 * * *', 'anulaciones', 30, () => (
    revisarAnulacionesPendientes().catch((e) => console.error('[Anulación] Ciclo falló:', e.message))
  ), { timezone: 'America/Lima' });
  console.log('[Anulación] Cron de comprobantes por anular: 8:00 AM diario (hora Lima)');
};

module.exports = { iniciarAvisoAnulaciones, revisarAnulacionesPendientes, DIAS_INSISTIENDO_TRAS_VENCER };
