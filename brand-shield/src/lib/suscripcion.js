// brand-shield/src/lib/suscripcion.js
//
// El ESTADO de la suscripción de una cuenta, derivado de sus columnas
// (auditoría 2026-10-02, P0-07).
//
// 🔴 El problema que señaló la auditoría: `plan` y `suscripcionActiva` son dos
// columnas independientes, y el acceso miraba solo `plan`. La combinación
// `plan = NEGOCIO, suscripcionActiva = false` significa DOS cosas distintas
// según la fecha:
//
//   · vencimiento en el futuro → canceló la renovación pero tiene el periodo
//     pagado: conserva el plan hasta esa fecha. Es lo que promete /devoluciones.
//   · vencimiento ya pasado     → el periodo terminó y nadie lo ha bajado todavía.
//
// El segundo caso dependía de que el cron `iniciarBajadaDePlanes` (5:30 cada
// día) pasara: entre el vencimiento y esa pasada, o si el cron no corría, la
// cuenta seguía usando funciones de pago sin pagar. Ahora el acceso pregunta acá
// y el plan efectivo cae a GRATIS en el mismo instante en que vence. El cron
// sigue existiendo para dejar la COLUMNA en orden; ya no es la única defensa.
//
// ⚠️ NO es una columna nueva, a propósito: es el mismo criterio que «pendiente de
// anular» (§9) y la pausa (§8.9). Un estado guardado hay que sincronizarlo; uno
// derivado no puede desincronizarse.
//
// ⚠️ Lo que NO cambia: una cuenta con `suscripcionActiva = true` conserva su plan
// aunque el vencimiento haya pasado. Ese es el periodo de reintentos de cobro
// (tres intentos cada 3 días, ver la renovación en monitoreo.worker.js): quitarle
// el plan al primer rechazo del banco es justo lo que se corrigió en agosto.
// También son así las cuentas con plan concedido a mano (`dar-plan.js`).

const ESTADOS = {
  GRATIS: 'GRATIS',                       // nunca pagó o ya bajó
  ACTIVA: 'ACTIVA',                       // renueva sola
  EN_REINTENTO: 'EN_REINTENTO',           // venció y se está reintentando el cobro
  CANCELADA_FIN_PERIODO: 'CANCELADA_FIN_PERIODO', // no renueva; usa lo pagado
  VENCIDA: 'VENCIDA',                     // terminó lo pagado; el plan ya no vale
};

const vencida = (u, ahora) => !!u.fechaVencimiento && new Date(u.fechaVencimiento) <= ahora;

/** Estado de la suscripción de una cuenta (`{ plan, suscripcionActiva, fechaVencimiento }`). */
const estado = (u, ahora = new Date()) => {
  if (!u || !u.plan || u.plan === 'GRATIS') return ESTADOS.GRATIS;
  if (u.suscripcionActiva) return vencida(u, ahora) ? ESTADOS.EN_REINTENTO : ESTADOS.ACTIVA;
  return vencida(u, ahora) ? ESTADOS.VENCIDA : ESTADOS.CANCELADA_FIN_PERIODO;
};

/** El plan que de verdad se puede usar HOY. Una suscripción VENCIDA ya no da su plan. */
const planEfectivo = (u, ahora = new Date()) => (estado(u, ahora) === ESTADOS.VENCIDA ? 'GRATIS' : (u?.plan || 'GRATIS'));

module.exports = { ESTADOS, estado, planEfectivo };
