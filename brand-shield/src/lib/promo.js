// brand-shield/src/lib/promo.js
//
// Reserva de la promo de bienvenida (50% los 2 primeros meses), ATADA al intento
// de cobro que la usa.
//
// La reserva existe desde la auditoría del 2026-10-02 (P0-08): crear la fila de
// la tarjeta en `promo_tarjetas` (UNIQUE por huella) y pasar la cuenta a «promo
// usada» con un UPDATE condicional, ANTES de cobrar, para que dos pagos
// simultáneos no cobren los dos al 50%.
//
// 🔴 Lo que faltaba (respuesta del auditor, 2026-10-07): la reserva no sabía de
// qué cobro era. Se libera cuando el cargo falla, pero si el proceso moría entre
// la reserva y el `IntentoCobro`, o si la liberación misma fallaba (llevaba un
// `.catch(() => {})`), la tarjeta y la cuenta quedaban marcadas para siempre sin
// que se hubiera cobrado nada: no cobraba dos veces, pero NEGABA una promoción
// legítima. Y la reconciliación encontraba la fila por una ventana de ±10 min
// alrededor del intento, no por el intento.
//
// Ahora la fila guarda `intentoClave` (la misma `clave` única con la que
// lib/cobros.js abre el intento, que se conoce antes de reservar) y:
//   - liberar es UNA transacción (fila + cuenta): o se devuelve entera o no;
//   - `liberarHuerfanas()` (desde la reconciliación) devuelve las reservas cuyo
//     intento no existe o FALLÓ, pasado un margen. Si el intento cobró, o está en
//     duda (DESCONOCIDO/PROCESANDO), la reserva se queda: puede que sí se haya
//     cobrado al 50%, y eso lo resuelve la reconciliación del intento.

const prisma = require('./prisma');

// Entre la reserva y la creación del intento pasan milisegundos; 30 min es un
// margen holgado para no liberar una reserva cuyo cobro todavía está en marcha.
const MARGEN_HUERFANA_MS = 30 * 60 * 1000;

/**
 * Reserva la promo para `clave`. Devuelve true si la ganó esta petición y false
 * si la tarjeta o la cuenta ya la habían usado (o la está usando otra petición).
 */
const reservar = async ({ huella, usuarioId, clave }, db = prisma) => {
  try {
    await db.promoTarjeta.create({ data: { huella, usuarioId, intentoClave: clave } });
  } catch (e) {
    if (e.code === 'P2002') return false;
    throw e;
  }
  const cuenta = await db.usuario.updateMany({
    where: { id: usuarioId, promoBienvenidaUsada: false },
    data: { promoBienvenidaUsada: true },
  });
  if (cuenta.count !== 1) {
    await db.promoTarjeta.deleteMany({ where: { usuarioId, intentoClave: clave } });
    return false;
  }
  return true;
};

/**
 * Devuelve la promo reservada para `clave`. La cuenta vuelve a tener derecho
 * solo si no le queda ninguna otra tarjeta con la promo (la de un alta que sí
 * se cobró, o una fila anterior a `intentoClave`). Lanza si la base falla: quien
 * llama lo registra y `liberarHuerfanas()` lo vuelve a intentar.
 */
const liberar = async ({ usuarioId, clave }, db = prisma) => db.$transaction(async (tx) => {
  const borradas = await tx.promoTarjeta.deleteMany({ where: { usuarioId, intentoClave: clave } });
  if (!borradas.count) return false;
  const quedan = await tx.promoTarjeta.count({ where: { usuarioId } });
  if (!quedan) await tx.usuario.update({ where: { id: usuarioId }, data: { promoBienvenidaUsada: false } });
  return true;
});

/**
 * Reservas sin cobro detrás: su intento no existe (el proceso murió antes de
 * crearlo) o terminó FALLIDO y la liberación de la ruta no llegó a hacerse.
 */
const liberarHuerfanas = async (ahora = Date.now(), db = prisma) => {
  const reservas = await db.promoTarjeta.findMany({
    where: { intentoClave: { not: null }, usadaEn: { lt: new Date(ahora - MARGEN_HUERFANA_MS) } },
    take: 50,
  });
  let liberadas = 0;
  for (const r of reservas) {
    const intento = await db.intentoCobro.findUnique({ where: { clave: r.intentoClave } });
    if (intento && intento.estado !== 'FALLIDO') continue;
    try {
      if (await liberar({ usuarioId: r.usuarioId, clave: r.intentoClave }, db)) liberadas += 1;
    } catch (e) {
      console.error(`[Promo] No se pudo liberar la reserva de ${r.intentoClave}: ${e.message}`);
    }
  }
  if (liberadas) console.log(`[Promo] ${liberadas} reserva(s) de promo sin cobro devuelta(s)`);
  return liberadas;
};

module.exports = { reservar, liberar, liberarHuerfanas, MARGEN_HUERFANA_MS };
