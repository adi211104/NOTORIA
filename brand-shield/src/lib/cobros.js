// brand-shield/src/lib/cobros.js
//
// Cobrar con Culqi de forma idempotente y reconciliable (auditoría 2026-10-02,
// P0-01 y P0-02). Es el ÚNICO camino por el que Notoria cobra: el alta
// (pago.routes.js), los locales a mitad de periodo (ídem) y la renovación
// (monitoreo.worker.js). La reconciliación (workers/reconciliacion.worker.js)
// usa las mismas piezas para terminar lo que quedó a medias.
//
// 🔴 El problema: Culqi y Postgres no comparten transacción. El flujo era
// «cobrar → actualizar usuario → guardar Pago → emitir comprobante», y
// `registrarPago` se tragaba su propio error. Si la base fallaba después del
// cobro, el cliente quedaba cobrado, sin plan, sin Pago y sin comprobante, y en
// Notoria no quedaba NADA que permitiera notarlo.
//
// La forma de cerrarlo sin transacción distribuida:
//
//   1. ANTES de llamar a Culqi se crea un `IntentoCobro` con una `clave` única.
//      Si la clave ya existe y no falló, NO se cobra (idempotencia: el mismo
//      cobro lógico no puede llegar dos veces a Culqi, ni por doble clic ni por
//      un cron que corra dos veces).
//   2. El cargo viaja con `metadata.intento = <id>`.
//   3. Según cómo conteste Culqi, el intento queda EXITOSO (con su cargo),
//      FALLIDO (Culqi contestó que no: no cobró) o DESCONOCIDO (no contestó: no
//      se sabe). DESCONOCIDO no se reintenta a ciegas: se reconcilia.
//   4. `aplicar()` hace TODO lo de la base en UNA transacción (usuario + Pago +
//      enlace del intento). Si falla, el intento sigue EXITOSO sin `pagoId` y la
//      reconciliación lo completa con la MISMA función — no hay una segunda
//      copia de la lógica de alta que se pueda desincronizar.

const prisma = require('./prisma');
const culqi = require('./culqi');
const { MONEDA } = require('./precios');

const ESTADO = { PROCESANDO: 'PROCESANDO', EXITOSO: 'EXITOSO', FALLIDO: 'FALLIDO', DESCONOCIDO: 'DESCONOCIDO' };

class CobroEnCurso extends Error {
  constructor(intento) {
    super('Ya hay un cobro igual registrado y no se repite.');
    this.codigo = 'COBRO_DUPLICADO';
    this.intento = intento;
  }
}

/**
 * Registra el intento. Si la clave ya existe:
 *  - FALLIDO → se reabre (un rechazo del banco se puede reintentar con la misma clave);
 *  - cualquier otro estado → CobroEnCurso: o ya se cobró, o se está cobrando, o
 *    no se sabe — y en los tres casos cobrar otra vez es el error caro.
 */
const abrirIntento = async ({ clave, usuarioId, tipo, plan, periodo, monto, moneda = MONEDA, detalle }, db = prisma) => {
  try {
    return await db.intentoCobro.create({
      data: { clave, usuarioId, tipo, plan, periodo, monto, moneda, detalle, estado: ESTADO.PROCESANDO },
    });
  } catch (e) {
    if (e.code !== 'P2002') throw e;
    const r = await db.intentoCobro.updateMany({
      where: { clave, estado: ESTADO.FALLIDO },
      data: { estado: ESTADO.PROCESANDO, monto, detalle, ultimoError: null, creadoEn: new Date() },
    });
    const previo = await db.intentoCobro.findUnique({ where: { clave } });
    if (r.count === 1) return previo;
    throw new CobroEnCurso(previo);
  }
};

/**
 * ¿Culqi dijo que NO, o no dijo nada? Con una respuesta 4xx Culqi rechazó el
 * cargo: no cobró. Sin respuesta (timeout, red caída) o con 5xx no se sabe.
 */
const clasificarError = (error) => {
  const status = error?.response?.status;
  return status && status < 500 ? ESTADO.FALLIDO : ESTADO.DESCONOCIDO;
};

/**
 * Cobra. Devuelve `{ intento, cargo }`. Si Culqi rechaza o no contesta, lanza el
 * error original con `error.estadoIntento` y `error.intento` puestos.
 */
const cobrar = async ({ clave, usuarioId, tipo, plan, periodo, monto, moneda = MONEDA, email, sourceId, descripcion, detalle }, db = prisma) => {
  const intento = await abrirIntento({ clave, usuarioId, tipo, plan, periodo, monto, moneda, detalle }, db);
  let cargo;
  try {
    cargo = await culqi.crearCargo({
      monto, moneda, email, sourceId, descripcion,
      metadata: { intento: intento.id, tipo },
    });
  } catch (error) {
    const estado = clasificarError(error);
    const datos = error.response?.data;
    await db.intentoCobro.update({
      where: { id: intento.id },
      data: {
        estado,
        ultimoError: String(datos?.merchant_message || datos?.user_message || error.message).slice(0, 500),
        completadoEn: estado === ESTADO.FALLIDO ? new Date() : null,
      },
    }).catch((e) => console.error(`[Cobro] No se pudo marcar el intento ${intento.id} como ${estado}:`, e.message));
    error.estadoIntento = estado;
    error.intento = intento;
    throw error;
  }

  // Se marca EXITOSO con su cargo ANTES de tocar nada más. Si esto falla, el
  // intento queda PROCESANDO y la reconciliación lo encuentra en Culqi por
  // `metadata.intento`. No se lanza: el cobro YA ocurrió y el que llama tiene
  // que seguir para aplicar el plan.
  await db.intentoCobro.update({
    where: { id: intento.id },
    data: { estado: ESTADO.EXITOSO, culqiCargoId: cargo?.id || null, completadoEn: new Date() },
  }).catch((e) => console.error(`[Cobro] 🔴 Cargo ${cargo?.id} cobrado pero el intento ${intento.id} no se pudo marcar:`, e.message));

  return { intento: { ...intento, estado: ESTADO.EXITOSO, culqiCargoId: cargo?.id || null }, cargo };
};

// ─── Aplicar el cobro a la cuenta ─────────────────────────────────────────
//
// `detalle` dice qué cambiar en el usuario, y se guarda en el intento ANTES de
// cobrar: así la reconciliación puede completar un alta a medias sin tener que
// reconstruir qué plan, qué periodo ni qué vencimiento se habían prometido.
//
//   INICIAL:          { plan, periodoFacturacion, fechaVencimiento, localesExtra, tarjetaCulqiId, promo }
//   RENOVACION:       { fechaVencimiento, descontarPromo }
//   LOCAL_ADICIONAL:  { localesExtra }
const datosUsuario = (tipo, d = {}) => {
  if (tipo === 'INICIAL') {
    return {
      plan: d.plan,
      suscripcionActiva: true,
      tarjetaCulqiId: d.tarjetaCulqiId,
      fechaVencimiento: new Date(d.fechaVencimiento),
      periodoFacturacion: d.periodoFacturacion,
      localesExtra: d.localesExtra || 0,
      ...(d.promo ? { promoBienvenidaUsada: true, mesesPromoRestantes: 1 } : {}),
    };
  }
  if (tipo === 'RENOVACION') {
    return {
      fechaVencimiento: new Date(d.fechaVencimiento),
      ...(d.descontarPromo ? { mesesPromoRestantes: { decrement: 1 } } : {}),
    };
  }
  if (tipo === 'LOCAL_ADICIONAL') return { localesExtra: d.localesExtra };
  throw new Error(`Tipo de cobro desconocido: ${tipo}`);
};

/**
 * Aplica un intento EXITOSO en UNA transacción: usuario + Pago + enlace.
 * Idempotente: si el intento ya tiene `pagoId`, no hace nada y devuelve ese Pago.
 * Devuelve el Pago creado (o el ya existente).
 */
const aplicar = async ({ intento, cargo, titular }, db = prisma) => {
  if (intento.pagoId) return db.pago.findUnique({ where: { id: intento.pagoId } });
  const tarjeta = culqi.datosTarjeta(cargo);
  return db.$transaction(async (tx) => {
    // Candado optimista: si otro proceso ya lo aplicó, este UPDATE no encuentra
    // la fila con pagoId null y la transacción entera se deshace.
    const libre = await tx.intentoCobro.updateMany({
      where: { id: intento.id, pagoId: null },
      data: { revisadoEn: new Date() },
    });
    if (libre.count !== 1) {
      const ya = await tx.intentoCobro.findUnique({ where: { id: intento.id } });
      return ya?.pagoId ? tx.pago.findUnique({ where: { id: ya.pagoId } }) : null;
    }
    await tx.usuario.update({ where: { id: intento.usuarioId }, data: datosUsuario(intento.tipo, intento.detalle) });
    const pago = await tx.pago.create({
      data: {
        usuarioId: intento.usuarioId,
        plan: intento.plan,
        periodo: intento.periodo,
        tipo: intento.tipo,
        estado: 'EXITOSO',
        monto: intento.monto,
        moneda: intento.moneda,
        titular: titular || 'Cliente',
        tarjetaInicio: tarjeta.inicio,
        tarjetaMarca: tarjeta.marca,
        culqiCargoId: cargo?.id || intento.culqiCargoId || null,
      },
    });
    await tx.intentoCobro.update({
      where: { id: intento.id },
      data: { pagoId: pago.id, estado: ESTADO.EXITOSO, culqiCargoId: pago.culqiCargoId },
    });
    return pago;
  });
};

module.exports = { ESTADO, CobroEnCurso, abrirIntento, clasificarError, cobrar, aplicar, datosUsuario };
