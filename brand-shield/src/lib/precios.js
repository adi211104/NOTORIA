// Precios de los planes y moneda de cobro — fuente única de verdad.
//
// Los usan tanto el alta de suscripción (api/routes/pago.routes.js) como el cron
// de renovación (workers/monitoreo.worker.js). Antes estaban duplicados en los
// dos archivos y la copia del cron ya se desincronizó una vez, cobrando el
// precio mensual a suscriptores anuales. No volver a copiarlos: importar de acá.
//
// Los montos van en la unidad más pequeña de la moneda (céntimos), que es lo que
// espera Culqi: 7500 = S/75.00.
//
// Moneda: soles. El precio publicado INCLUYE IGV para clientes peruanos
// (ver lib/tributario.js, que hace el desglose al emitir el comprobante).
// Todo el circuito de comprobantes (PDF, XML UBL, correos) ya lee la moneda del
// registro, así que agregar USD en el futuro no obliga a tocar nada de eso.
const MONEDA = 'PEN';

// El anual se calcula igual en los tres: 20% de descuento sobre el mensual,
// redondeado a un mes entero y multiplicado por 12. No es una fórmula en el
// código a propósito — el precio publicado tiene que ser un número que se pueda
// decir en voz alta, y `Math.round(p*0.8)` da 1718.4 donde la web dice 1716.
//
// `local` es lo que cuesta cada local ADICIONAL al incluido en el plan. Solo lo
// tienen los planes con la capacidad `localesAdicionales` (ver lib/planes.js);
// IMPULSO no lo lleva a propósito: es el plan de un solo local, y quien abre el
// segundo local es exactamente a quien le toca subir a NEGOCIO.
const PRECIOS = {
  IMPULSO:    { mensual: 2900,  anual: 27600 },   // S/29/mes  ·  S/23 x 12 anual
  NEGOCIO:    { mensual: 5900,  anual: 56400,     // S/59/mes  ·  S/47 x 12 anual
                local: { mensual: 3900, anual: 37200 } },   // S/39/mes · S/31 x 12
  FRANQUICIA: { mensual: 17900, anual: 171600,    // S/179/mes ·  S/143 x 12 anual
                local: { mensual: 9900, anual: 94800 } },   // S/99/mes · S/79 x 12
};

// ── El local adicional ──────────────────────────────────────────────────────
//
// 🔴 POR QUÉ EXISTE. Hasta el 2026-08-25 los planes vendían locales por paquete
// —NEGOCIO «hasta 5», FRANQUICIA «ilimitados»— y eso no se podía sostener: cada
// local vigilado cuesta consultas a Google Places, y ese costo es LINEAL en el
// número de locales mientras el precio era plano.
//
// Con los frenos de costo del mismo día (ver `HORAS_COMPETIDOR` y
// `tocaLeerContacto`), un local cuesta ~S/25/mes en NEGOCIO (4 h) y ~S/88 en
// FRANQUICIA (1 h). Contra eso, los paquetes que se anunciaban perdían dinero:
// NEGOCIO desde el tercer local y FRANQUICIA desde el segundo. Y no lo delataba
// nada — la factura de Google no dice de quién fue cada consulta, así que
// habría aparecido como «Places subió» justo cuando por fin entraran los
// clientes grandes, que son los que más pagan.
//
// Decidido con el dueño el 2026-08-25: **un local incluido y el resto se cobra**,
// con el mismo criterio en los dos planes. Lo que separa un plan de otro deja de
// ser cuántos locales caben y pasa a ser la velocidad de escaneo y las
// funciones — que es lo que de verdad los distinguía.
//
// El anual sigue la regla de siempre: 20% menos sobre el mensual, redondeado a
// un mes entero y multiplicado por 12. El número tiene que poder decirse en voz
// alta.

/** Lo que cuesta un local adicional en este plan, o `null` si no vende locales. */
const precioLocal = (plan) => PRECIOS[plan]?.local || null;

/**
 * Lo que se cobra de verdad: el plan más los locales adicionales.
 *
 * ⚠️ Fuente única, y es importante que lo sea: este mismo cálculo lo necesitan
 * el alta (`pago.routes.js`) y la RENOVACIÓN (`monitoreo.worker.js`), y en este
 * proyecto ya hubo una vez dos copias del precio que se desincronizaron y
 * cobraron el mensual a suscriptores anuales. Si el alta cobra los locales y la
 * renovación no, el cliente paga los extras UNA vez y los conserva gratis para
 * siempre — el mismo fallo silencioso que documenta `lib/planes.js`.
 *
 * @param {string} plan
 * @param {boolean} anual
 * @param {number} localesExtra  Locales por encima del incluido en el plan.
 * @returns {number} céntimos
 */
const montoSuscripcion = (plan, anual, localesExtra = 0) => {
  const fila = PRECIOS[plan];
  if (!fila) return 0;
  const base = anual ? fila.anual : fila.mensual;
  // ⚠️ Un `localesExtra` que llegue en un plan que no vende locales se IGNORA,
  // no se cobra: el número viene del cuerpo de la petición y un valor inventado
  // no puede acabar en un cargo. Misma razón por la que se trunca y se acota a
  // cero — un negativo restaría del precio del plan.
  if (!fila.local) return base;
  const extra = Math.max(0, Math.trunc(Number(localesExtra) || 0));
  return base + extra * (anual ? fila.local.anual : fila.local.mensual);
};

/**
 * Cuántos locales puede tener este usuario: los que incluye su plan más los que
 * paga. Vive acá y no en `planes.js` porque depende de lo COBRADO, no de la
 * capacidad — pero `planes.js` lo reexporta para que los call-sites tengan un
 * solo sitio al que preguntar.
 */
const localesPermitidos = (plan, localesExtra = 0) => {
  const { limite, puede } = require('./planes');
  const incluidos = limite(plan, 'negocios');
  if (!puede(plan, 'localesAdicionales')) return incluidos;
  return incluidos + Math.max(0, Math.trunc(Number(localesExtra) || 0));
};

module.exports = { MONEDA, PRECIOS, precioLocal, montoSuscripcion, localesPermitidos };
