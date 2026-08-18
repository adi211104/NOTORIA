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
const { copiasDeAlerta } = require('../lib/equipo');

// ─── EMAIL ────────────────────────────────────────────────

const enviarAlertaEmail = async ({ usuario, negocio, alerta }) => {
  let ok = true;
  try {
    await enviarAlertaCritica(usuario, negocio, alerta);
    console.log(`[Notificador] Email enviado a ${usuario.email} — ${alerta.tipo}`);
  } catch (error) {
    console.error(`[Notificador] Error enviando email: ${error.message}`);
    ok = false;
  }

  // Copia al equipo: los GESTORES que alcanzan este negocio (ver lib/equipo.js).
  //
  // Es media razón de ser de compartir la cuenta. Sin esto, el encargado tendría
  // el panel pero se enteraría de la reseña de 1★ cuando al dueño le diera por
  // reenviarle el correo — y la promesa del producto es el tiempo de reacción.
  //
  // Va DESPUÉS del correo al dueño y en un try propio: un fallo entregando una
  // copia no puede impedir el aviso al titular de la cuenta, que es el que no
  // puede faltar nunca.
  if (negocio?.usuarioId) {
    for (const miembro of await copiasDeAlerta(negocio)) {
      try {
        await enviarAlertaCritica(miembro, negocio, alerta);
        console.log(`[Notificador] Copia al equipo: ${miembro.email} — ${alerta.tipo}`);
      } catch (error) {
        console.error(`[Notificador] Error enviando copia a ${miembro.email}: ${error.message}`);
      }
    }
  }

  return ok;
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
