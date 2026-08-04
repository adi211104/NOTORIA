// brand-shield/src/alerts/notificador.js
// Envía alertas por email (Resend) y Telegram Bot

const axios = require('axios');
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

// ─── TELEGRAM ─────────────────────────────────────────────

const enviarAlertaTelegram = async ({ chatId, negocio, alerta }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const mensaje = [
      `*Alerta Notoria — ${negocio.nombre}*`,
      ``,
      alerta.descripcion,
      ``,
      `Plataforma: ${alerta.plataforma}`,
      `Detectado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
      ``,
      `Ver dashboard: ${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard`,
    ].join('\n');

    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: mensaje,
        parse_mode: 'Markdown',
      }
    );

    console.log(`[Notificador] Telegram enviado a chatId ${chatId}`);
    return true;
  } catch (error) {
    console.error(`[Notificador] Error enviando Telegram: ${error.message}`);
    return false;
  }
};

/**
 * Función principal: envía la alerta por todos los canales disponibles del usuario,
 * respetando sus preferencias (tipos activados, umbral y frecuencia).
 */
const notificar = async ({ usuario, negocio, alerta }) => {
  const prefs = usuario.prefsAlertas || null;

  // Tipo de alerta desactivado por el usuario → no notificar (queda en el dashboard)
  if (prefs?.tipos && prefs.tipos[alerta.tipo] === false) return;

  // Umbral 5: no notificar reseñas negativas individuales, solo picos agrupados
  if (prefs?.umbralNegativas === 5 && alerta.tipo === 'RESENA_MUY_NEGATIVA') return;

  // Frecuencia resumen: no enviar email inmediato — el cron semanal/mensual lo agrupa
  if (prefs?.frecuencia && prefs.frecuencia !== 'INMEDIATA') return;

  const promesas = [];

  // Siempre por email
  promesas.push(enviarAlertaEmail({ usuario, negocio, alerta }));

  // Telegram solo si el usuario lo configuró
  if (usuario.telegramChatId) {
    promesas.push(enviarAlertaTelegram({
      chatId: usuario.telegramChatId,
      negocio,
      alerta,
    }));
  }

  await Promise.allSettled(promesas);
};

module.exports = { notificar, enviarAlertaTelegram };
