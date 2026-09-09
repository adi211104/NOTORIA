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

const { enviarAlertaCritica, enviarResumenAlertas } = require('../utils/emails');
const { copiasDeAlerta } = require('../lib/equipo');
const prisma = require('../lib/prisma');
const prefsCorreo = require('../lib/prefsCorreo');

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
 * Manda UN correo con las reseñas negativas acumuladas, en vez de uno por reseña.
 *
 * 🔴 Por qué existe (2026-09-09): un correo por cada reseña que aparece es, para
 * una cuenta gratuita recién creada, una bandeja llena de avisos de un producto
 * que todavía no le importa — la vía más corta a que nos marquen como spam. Y con
 * el dominio quemado se degrada la entrega de TODO lo demás, incluidos los avisos
 * que sí importan. Ver `lib/prefsCorreo.js` para el tamaño del lote y su porqué.
 *
 * 🔴 El acumulador es `Alerta.notificada`, que hasta hoy **se escribía y nadie
 * leía**: el worker la ponía en `true` justo después de llamar acá, hubiera salido
 * correo o no. Ahora significa lo que dice —«ya salió un correo que cubre esta
 * alerta»— y es lo que deja contar las que están esperando. Comprobado antes de
 * reutilizarla que ninguna ruta ni ningún panel la consultaba.
 *
 * ⚠️ Devuelve si mandó algo, porque el llamador **ya no puede marcar `notificada`
 * a ciegas**: si lo hiciera, el contador arrancaría de cero en cada reseña y el
 * lote nunca llegaría a cinco. Ese es el punto donde esto se rompe en silencio.
 */
const notificarAgrupado = async ({ usuario, negocio, alerta, lote }) => {
  const desde = new Date(Date.now() - prefsCorreo.VENTANA_LOTE_DIAS * 24 * 60 * 60 * 1000);
  const pendientes = await prisma.alerta.findMany({
    where: {
      tipo: alerta.tipo,
      notificada: false,
      creadaEn: { gte: desde },
      // Del DUEÑO de la cuenta, no de un solo negocio: «un correo por cada cinco
      // reseñas» se cuenta por bandeja, que es lo que se está protegiendo.
      negocio: { usuarioId: negocio.usuarioId, activo: true },
    },
    include: { negocio: { select: { nombre: true } } },
    orderBy: { creadaEn: 'asc' },
  });

  if (pendientes.length < lote) {
    console.log(`[Notificador] ${usuario.email}: ${pendientes.length}/${lote} reseñas acumuladas, sin correo todavía`);
    return false;
  }

  // Se reutiliza el digest de alertas, que ya sabe agrupar por negocio y ya es
  // bilingüe. `periodo` viaja como VALOR y la plantilla compone la frase.
  await enviarResumenAlertas(usuario, pendientes, 'lote');
  await prisma.alerta.updateMany({
    where: { id: { in: pendientes.map((a) => a.id) } },
    data: { notificada: true },
  });
  console.log(`[Notificador] ${usuario.email}: lote de ${pendientes.length} reseñas en un solo correo`);
  return true;
};

/**
 * Función principal: envía la alerta respetando las preferencias del usuario
 * (tipos activados, agrupación y frecuencia).
 *
 * Devuelve `true` si salió un correo que cubre esta alerta. El llamador usa eso
 * para marcar `notificada`; ver la nota de `notificarAgrupado`.
 */
const notificar = async ({ usuario, negocio, alerta }) => {
  const prefs = usuario.prefsAlertas || null;

  // Tipo de alerta desactivado por el usuario → no notificar (queda en el dashboard)
  if (prefs?.tipos && prefs.tipos[alerta.tipo] === false) return false;

  // Frecuencia resumen: no enviar email inmediato — el cron semanal/mensual lo agrupa
  if (prefs?.frecuencia && prefs.frecuencia !== 'INMEDIATA') return false;

  // Agrupación por lote. Antes acá había un `if (umbralNegativas === 5) return`,
  // o sea que elegir esa opción en el panel **apagaba el aviso del todo** en vez
  // de agruparlo: la señal de picos por conteo que prometía en su lugar no puede
  // dispararse nunca (Places entrega 5 reseñas como máximo). Ver prefsCorreo.js.
  const lote = prefsCorreo.loteAlertas(usuario.plan, prefs);
  if (lote > 1 && prefsCorreo.seAgrupa(alerta.tipo)) {
    return notificarAgrupado({ usuario, negocio, alerta, lote });
  }

  return enviarAlertaEmail({ usuario, negocio, alerta });
};

module.exports = { notificar, enviarAlertaEmail, notificarAgrupado };
