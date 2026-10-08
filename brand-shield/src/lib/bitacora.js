// brand-shield/src/lib/bitacora.js
//
// Bitácora de la suscripción (réplica del auditor, 2026-10-07): QUÉ cambió en
// el plan de una cuenta y CUÁNDO, escrito en la MISMA transacción que el cambio.
//
// Para qué: que «me cobraron pero sigo en Gratis», «me cobraron dos veces» o
// «cancelé y me volvieron a cobrar» se contesten con filas y horas exactas, no
// reconstruyendo logs. La hora del reclamo de un cobro es `intentos_cobro.creadoEn`
// (se escribe con el candado de la cuenta ANTES de llamar a Culqi); la de la
// cancelación es la fila CANCELACION de aquí. Si la cancelación es anterior,
// el cobro no pudo reclamarse (lib/cobros.js); si es posterior, el cobro ya
// estaba autorizado. `scripts/caso-cliente.js` lo pone todo en una línea de tiempo.
//
// Solo se inserta. No lleva datos personales (ni correo ni tarjeta): ids,
// importes, planes y fechas.

const TIPOS = ['ALTA', 'RENOVACION', 'LOCALES', 'CANCELACION', 'COBRO_RECHAZADO', 'BAJADA_A_GRATIS', 'REEMBOLSO'];

// Tipo de cobro (IntentoCobro.tipo) → tipo de evento.
const DE_COBRO = { INICIAL: 'ALTA', RENOVACION: 'RENOVACION', LOCAL_ADICIONAL: 'LOCALES' };

/** Inserta un evento con el cliente que se le pase (normalmente el `tx` del cambio). */
const registrar = (db, usuarioId, tipo, detalle = {}) => {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de evento de suscripción desconocido: ${tipo}`);
  return db.eventoSuscripcion.create({ data: { usuarioId, tipo, detalle } });
};

module.exports = { TIPOS, DE_COBRO, registrar };
