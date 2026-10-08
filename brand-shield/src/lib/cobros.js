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
const bitacora = require('./bitacora');

const ESTADO = { PROCESANDO: 'PROCESANDO', EXITOSO: 'EXITOSO', FALLIDO: 'FALLIDO', DESCONOCIDO: 'DESCONOCIDO' };

class CobroEnCurso extends Error {
  constructor(intento) {
    super('Ya hay un cobro igual registrado y no se repite.');
    this.codigo = 'COBRO_DUPLICADO';
    this.intento = intento;
  }
}

// Otro cobro DISTINTO de la misma cuenta está en vuelo (o en duda).
class OtroCobroEnCurso extends Error {
  constructor(intento) {
    super('La cuenta tiene otro cobro en curso o en verificación.');
    this.codigo = 'OTRO_COBRO_EN_CURSO';
    this.intento = intento;
  }
}

// Lo que se usó para calcular el importe ya no es lo que hay en la base.
class EstadoCambiado extends Error {
  constructor(motivo) {
    super(`El estado de la cuenta cambió antes de cobrar (${motivo}).`);
    this.codigo = 'ESTADO_CAMBIADO';
    this.motivo = motivo;
  }
}

// ─── Reclamo por cuenta (réplica del auditor, 2026-10-07) ─────────────────
//
// 🔴 La clave única hace idempotente el MISMO cobro, no impide dos cobros
// DISTINTOS calculados sobre la misma foto vieja de la cuenta (P1-N03, N04,
// N11): «0→1 local» y «0→2 locales» son claves distintas y llegaban las dos a
// Culqi; el cron elegía una cuenta para renovar, el cliente cancelaba, y el cron
// cobraba igual; dos altas en dos pestañas (dos tokens) cobraban dos veces.
//
// Regla para todo cobro: se RECLAMA antes de tocar Culqi, dentro de un candado
// de la cuenta (`pg_advisory_xact_lock`, el mismo patrón que los asientos del
// equipo, lib/equipo.js). Con el candado tomado:
//   1. la misma clave ya registrada → CobroEnCurso (o se reabre si FALLÓ);
//   2. otro intento de la cuenta en vuelo (PROCESANDO, DESCONOCIDO o cobrado y
//      sin aplicar) → OtroCobroEnCurso: no se cobra sobre un estado que todavía
//      no terminó de cambiar;
//   3. `vigente(tx)` relee la cuenta y compara con la foto que se usó para
//      calcular el importe; si algo cambió → EstadoCambiado, sin cobrar;
//   4. se crea el intento. Al soltar el candado, el reclamo es visible.
// Culqi se llama DESPUÉS, fuera de la transacción (no se sostiene una
// transacción abierta durante una llamada externa). Todo lo que cambia la
// cuenta sin cobrar (cancelar, bajar locales) toma el MISMO candado: una
// cancelación anterior al reclamo gana siempre; una posterior encuentra la
// renovación ya reclamada, que es la prueba de que seguía autorizada.
const EN_VUELO = [
  { estado: ESTADO.PROCESANDO },
  { estado: ESTADO.DESCONOCIDO },
  { estado: ESTADO.EXITOSO, pagoId: null },
];

/** Corre `fn(tx)` con el candado de cobros de la cuenta tomado. */
const conCuenta = (usuarioId, fn, db = prisma) => db.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cobro:${usuarioId}`}))`;
  return fn(tx);
});

/** ¿Hay otro cobro de la cuenta sin terminar? Devuelve el intento o null. */
const otroEnVuelo = (tx, usuarioId, clave) => tx.intentoCobro.findFirst({
  where: { usuarioId, ...(clave ? { clave: { not: clave } } : {}), OR: EN_VUELO },
  select: { id: true, clave: true, estado: true },
});

const igual = (a, b) => (a instanceof Date || b instanceof Date
  ? new Date(a ?? 0).getTime() === new Date(b ?? 0).getTime() && (a == null) === (b == null)
  : (a ?? null) === (b ?? null));

/**
 * `vigente` que compara la foto con la que se calculó el importe contra la base.
 * Devuelve el primer campo que cambió (como motivo) o null.
 */
const fotoVigente = (foto, campos) => async (tx) => {
  const ahora = await tx.usuario.findUnique({
    where: { id: foto.id },
    select: Object.fromEntries(campos.map((c) => [c, true])),
  });
  if (!ahora) return 'cuenta inexistente';
  const campo = campos.find((c) => !igual(ahora[c], foto[c]));
  return campo ? `cambió ${campo}` : null;
};

/**
 * Registra (reclama) el intento con el candado de la cuenta. Si la clave ya existe:
 *  - FALLIDO → se reabre (un rechazo del banco se puede reintentar con la misma clave);
 *  - cualquier otro estado → CobroEnCurso: o ya se cobró, o se está cobrando, o
 *    no se sabe — y en los tres casos cobrar otra vez es el error caro.
 * ⚠️ La existencia se pregunta ANTES de crear (no create → catch P2002): dentro
 * de una transacción de Postgres un error aborta la transacción entera.
 */
const abrirIntento = async ({ clave, usuarioId, tipo, plan, periodo, monto, moneda = MONEDA, detalle, vigente }, db = prisma) => (
  conCuenta(usuarioId, async (tx) => {
    const previo = await tx.intentoCobro.findUnique({ where: { clave } });
    if (previo && previo.estado !== ESTADO.FALLIDO) throw new CobroEnCurso(previo);
    const otro = await otroEnVuelo(tx, usuarioId, clave);
    if (otro) throw new OtroCobroEnCurso(otro);
    if (vigente) {
      const motivo = await vigente(tx);
      if (motivo) throw new EstadoCambiado(motivo);
    }
    if (previo) {
      return tx.intentoCobro.update({
        where: { id: previo.id },
        data: { estado: ESTADO.PROCESANDO, monto, detalle, ultimoError: null, creadoEn: new Date(), completadoEn: null },
      });
    }
    return tx.intentoCobro.create({
      data: { clave, usuarioId, tipo, plan, periodo, monto, moneda, detalle, estado: ESTADO.PROCESANDO },
    });
  }, db)
);

/**
 * Cambia la cuenta SIN cobrar (bajar locales, subir sin importe), con el mismo
 * candado y las mismas comprobaciones que un cobro: no pisa un cobro en vuelo ni
 * escribe sobre una foto vieja. Devuelve el resultado de `cambio(tx)`.
 */
const cambiarSinCobro = async ({ usuarioId, vigente, cambio, evento }, db = prisma) => conCuenta(usuarioId, async (tx) => {
  const otro = await otroEnVuelo(tx, usuarioId, null);
  if (otro) throw new OtroCobroEnCurso(otro);
  if (vigente) {
    const motivo = await vigente(tx);
    if (motivo) throw new EstadoCambiado(motivo);
  }
  const r = await cambio(tx);
  if (evento) await bitacora.registrar(tx, usuarioId, evento.tipo, evento.detalle);
  return r;
}, db);

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
const cobrar = async ({ clave, usuarioId, tipo, plan, periodo, monto, moneda = MONEDA, email, sourceId, descripcion, detalle, vigente }, db = prisma) => {
  const intento = await abrirIntento({ clave, usuarioId, tipo, plan, periodo, monto, moneda, detalle, vigente }, db);
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
    // 🔴 Un cobro en duda es URGENTE (réplica del auditor, §9): puede que el
    // cliente ya pagó y no tenga su plan. La reconciliación lo resuelve sola,
    // pero una persona se entera AHORA, antes de que escriba el cliente.
    if (estado === ESTADO.DESCONOCIDO) {
      require('../utils/emails').enviarAvisoInterno({
        asunto: `🟠 Cobro en duda (Culqi no contestó) — ${email || usuarioId}`,
        lineas: [
          `Intento ${intento.id} · ${tipo} · ${(monto / 100).toFixed(2)} ${moneda} · clave ${clave}`,
          `Error: ${String(error.message).slice(0, 300)}`,
          'No se sabe si Culqi cobró. NO cobrar a mano ni pedir que pague de nuevo: la reconciliación (:15 y :45) busca el cargo por metadata.intento.',
          `Diagnóstico: node scripts/caso-cliente.js ${email || '<correo>'} (docs/runbook-cobros.md §1).`,
        ],
      }).catch((e) => console.error('[Cobro] No se pudo avisar del cobro en duda:', e.message));
    }
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
  // Solo se aplica lo que se cobró (réplica del auditor, P2-N10): antes la
  // precondición quedaba en manos de quien llamaba.
  if (intento.estado !== ESTADO.EXITOSO || !(cargo?.id || intento.culqiCargoId)) {
    throw new Error(`aplicar() exige un intento EXITOSO con su cargo (intento ${intento.id}: ${intento.estado})`);
  }
  const tarjeta = culqi.datosTarjeta(cargo);
  return db.$transaction(async (tx) => {
    // Candado optimista: si otro proceso ya lo aplicó, este UPDATE no encuentra
    // la fila con pagoId null y la transacción entera se deshace. Tampoco aplica
    // un intento que la base tenga como FALLIDO (Culqi dijo que no cobró).
    const libre = await tx.intentoCobro.updateMany({
      where: { id: intento.id, pagoId: null, estado: { not: ESTADO.FALLIDO } },
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
    // En la misma transacción que el cambio: si esto falla, no hay plan ni Pago.
    // `reclamadoEn` es la hora en que se tomó la decisión de cobrar (con el
    // candado de la cuenta), la que se compara con una cancelación.
    const { tarjetaCulqiId, ...cambio } = intento.detalle || {};
    await bitacora.registrar(tx, intento.usuarioId, bitacora.DE_COBRO[intento.tipo], {
      intento: intento.id, clave: intento.clave, reclamadoEn: intento.creadoEn, pago: pago.id, cargo: pago.culqiCargoId,
      plan: intento.plan, periodo: intento.periodo, monto: intento.monto, ...cambio,
    });
    return pago;
  });
};

module.exports = {
  ESTADO, CobroEnCurso, OtroCobroEnCurso, EstadoCambiado,
  conCuenta, fotoVigente, abrirIntento, cambiarSinCobro, clasificarError, cobrar, aplicar, datosUsuario,
};
