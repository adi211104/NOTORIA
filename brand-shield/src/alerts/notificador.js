// brand-shield/src/alerts/notificador.js
// Envía alertas por email (Resend).
//
// 🔴 Canal único a propósito (2026-08-16). Antes había un segundo canal por
// Telegram y una escalación por WhatsApp (Meta Cloud API) para plan Franquicia.
// Ambos se eliminaron del producto: mantener tres canales significaba tres
// integraciones que fallan por su cuenta (bot token, plantilla aprobada por
// Meta, ventana de 24h) para entregar exactamente el mismo texto. El correo se
// queda porque no depende de nadie más, y el aviso inmediato pasó a ser la app
// Android (notificaciones del sistema): quien quiera que le suene el teléfono
// instala la app, que lee las mismas alertas de /api/alertas.
//
// Si algún día vuelve un canal, va acá y respetando el mismo filtro de
// preferencias de abajo — no en el worker.

const { enviarAlertaCritica } = require('../utils/emails');

// ─── EMAIL ────────────────────────────────────────────────

const enviarAlertaEmail = async ({ usuario, negocio, alerta }) => {
  try {
    await enviarAlertaCritica(usuario, negocio, alerta);
    console.log(`[Notificador] Email enviado a ${usuario.email} — ${alerta.tipo}`);
    return true;
  } catch (error) {
    console.error(`[Notificador] Error enviando email: ${error.message}`);
    return false;
  }
};

/**
 * Función principal: envía la alerta respetando las preferencias del usuario
 * (tipos activados, umbral y frecuencia).
 */
const notificar = async ({ usuario, negocio, alerta }) => {
  const prefs = usuario.prefsAlertas || null;

  // Tipo de alerta desactivado por el usuario → no notificar (queda en el dashboard)
  if (prefs?.tipos && prefs.tipos[alerta.tipo] === false) return;

  // Umbral 5: no notificar reseñas negativas individuales, solo picos agrupados
  if (prefs?.umbralNegativas === 5 && alerta.tipo === 'RESENA_MUY_NEGATIVA') return;

  // Frecuencia resumen: no enviar email inmediato — el cron semanal/mensual lo agrupa
  if (prefs?.frecuencia && prefs.frecuencia !== 'INMEDIATA') return;

  await enviarAlertaEmail({ usuario, negocio, alerta });
};

module.exports = { notificar, enviarAlertaEmail };
