// brand-shield/src/lib/anulacionPendiente.js
//
// Cuándo un comprobante se quedó "colgando": el dinero se devolvió y el
// documento fiscal sigue vivo ante SUNAT.
//
// 🔴 POR QUÉ EXISTE. Reembolsar en Culqi **no anula nada ante SUNAT**. Son dos
// sistemas independientes: el importe vuelve a la tarjeta del cliente y la
// boleta o la factura siguen emitidas, declaradas y con su IGV a pagar. Si nadie
// las anula dentro del plazo, queda declarada una venta cuyo dinero se devolvió
// — y eso ya no se arregla con un botón, sino con una nota de crédito.
//
// Se descubrió haciéndolo a mano el 2026-08-23, en la primera prueba de cobro
// real: hubo que acordarse de anular la boleta después del reembolso, y nada en
// el producto lo recordaba. Con un cliente de verdad, ese "acordarse" no ocurre.
//
// ⚠️ Los dos plazos son de SIETE días pero **cuentan desde sitios distintos**, y
// confundirlos es el error caro:
//
//   · BOLETA  → se anula informándola en un resumen diario con estado 3.
//               El plazo corre desde el **CDR del resumen que la informó**, que
//               es cuando SUNAT la aceptó (`enviadoEn`).
//   · FACTURA → se da de baja con una comunicación RA.
//               El plazo corre desde la **emisión** (`fechaEmision`).
//
// Un VOUCHER no es documento fiscal: no hay nada que anular.

const DIAS_PLAZO = 7;

/**
 * ¿Este comprobante quedó pendiente de anular?
 *
 * La condición no necesita columna nueva: se deriva de dos hechos que ya están
 * en la base. El pago se devolvió y el comprobante sigue aceptado.
 */
const necesitaAnulacion = (comprobante, pago) => {
  if (!comprobante || !pago) return false;
  if (pago.estado !== 'REEMBOLSADO') return false;
  // Solo lo que SUNAT llegó a aceptar. Un PENDIENTE o un RECHAZADO no está vivo
  // ante SUNAT, y un ANULADO ya se resolvió.
  if (comprobante.estadoSunat !== 'ACEPTADO') return false;
  // El VOUCHER es un recibo interno, no un comprobante electrónico.
  return comprobante.tipo === 'BOLETA' || comprobante.tipo === 'FACTURA';
};

/**
 * Hasta cuándo se puede anular. Ver la nota de arriba sobre los dos anclajes.
 */
const fechaLimiteAnulacion = (comprobante) => {
  const ancla = comprobante.tipo === 'BOLETA'
    // Si por lo que sea no hay `enviadoEn`, se cae a la emisión: da un plazo más
    // corto que el real, que es el lado seguro por el que equivocarse.
    ? (comprobante.enviadoEn || comprobante.fechaEmision)
    : comprobante.fechaEmision;
  const limite = new Date(ancla);
  limite.setDate(limite.getDate() + DIAS_PLAZO);
  limite.setHours(23, 59, 59, 999);
  return limite;
};

/**
 * Días que quedan. Negativo si ya venció.
 *
 * ⚠️ `floor` y no `ceil`, a propósito. El límite es el FIN del séptimo día, así
 * que a media tarde la resta da algo como 6.46 días: redondear hacia arriba
 * diría «quedan 7» cuando en realidad quedan seis días completos. En un aviso
 * con un plazo legal detrás, equivocarse por exceso es el lado peligroso —
 * alguien lo deja para mañana contando con un día que no tiene. Hacia abajo el
 * número es siempre cierto: quedan AL MENOS esos días.
 *
 * ⚠️ `fechaLimiteAnulacion` usa `setHours`, que va en la zona del servidor (UTC
 * en Railway, no Lima). Son cinco horas de sesgo y no cambian la cuenta de días,
 * pero si algún día este número se usara para algo que viaja a SUNAT habría que
 * pasar por `tributario.fechaPeru()`, como el resto de fechas fiscales.
 */
const diasRestantes = (comprobante, ahora = Date.now()) =>
  Math.floor((fechaLimiteAnulacion(comprobante).getTime() - ahora) / (24 * 60 * 60 * 1000));

/**
 * El comando exacto que hay que correr. Va DENTRO del correo a propósito: un
 * aviso que dice «hay que anularlo» y obliga a buscar cómo es un aviso a medias,
 * y este llega con el reloj corriendo.
 */
const comandoParaAnular = (comprobante) => (
  comprobante.tipo === 'BOLETA'
    ? `railway run --service api node scripts/anular-boleta.js ${comprobante.numero} --aplicar`
    // La comunicación de baja (RA) todavía no tiene script: el modelo la
    // contempla pero nadie la ha necesitado. Si aparece una factura reembolsada,
    // esto es lo que avisa de que hay que escribirla.
    : `(FACTURA: la comunicación de baja RA aún no tiene script — ver §9 de CLAUDE.md)`
);

module.exports = {
  necesitaAnulacion, fechaLimiteAnulacion, diasRestantes, comandoParaAnular, DIAS_PLAZO,
};
