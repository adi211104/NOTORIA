// brand-shield/src/lib/localesExtra.js
// Sumar o quitar locales SIN pasar por el alta — la aritmética del prorrateo.
//
// 🔴 POR QUÉ EXISTE. Desde el 2026-08-25 los locales se cobran de a uno
// (ver lib/precios.js), pero el único sitio donde se elegían era el alta: el
// selector de la pantalla de Planes solo sale en las tarjetas de los planes que
// NO son el actual. O sea que el cliente que ya está en NEGOCIO y abre su
// segundo local no tenía por dónde comprarlo, y el 403 de negocio.routes.js lo
// mandaba a Planes, donde ese control no existía para él — el mismo fallo de
// «mensaje que apunta a un sitio sin el botón que promete» que este proyecto ya
// ha corregido varias veces.
//
// 🔴 POR QUÉ PRORRATEO Y NO LAS OTRAS DOS SALIDAS. Decidido con el dueño el
// 2026-08-25, después de ponerle números a las tres:
//
//  · Volver a pasar por el alta (lo que pasaría si solo se quitara el
//    `!esPlanActual` del panel) cobra el PLAN ENTERO otra vez y arranca el
//    vencimiento desde hoy. A un cliente de NEGOCIO anual con 11 meses por
//    delante, sumar un local de S/372 le costaría S/936 y tiraría S/517 de
//    servicio ya pagado. Y encima vuelve a pedir la tarjeta por el widget
//    cuando ya está guardada en `suscripcionId`.
//  · Dejarlo gratis hasta la renovación es cero aritmética y aguanta en
//    mensual (se regalan ≤S/39 una sola vez), pero en ANUAL son hasta 364 días
//    gratis y es repetible: contratar en enero y sumar cinco locales en febrero
//    regala S/1 860 por cliente y por año.
//  · Prorratear cobra exactamente los días que faltan, no mueve el aniversario
//    y no recobra el plan.
//
// ⚠️ Lo que hace barato el prorrateo es que la RENOVACIÓN ya está resuelta:
// `montoSuscripcion(plan, anual, localesExtra)` cobra el total nuevo el mes que
// viene sin tocar una línea del cron. Este archivo solo tiene que resolver el
// tramo de HOY hasta el vencimiento que el cliente ya pagó.

const { precioLocal, localesPermitidos } = require('./precios');
const { puede, limite } = require('./planes');

const DIA_MS = 86400000;

// Por debajo de esto no se cobra nada y el local entra gratis hasta la
// renovación. No es generosidad: un cargo de S/1.30 arrastra un cargo real a
// una tarjeta, una fila de `Pago` y —lo que de verdad pesa— UN COMPROBANTE
// FISCAL, con su correlativo que no admite huecos y su envío a SUNAT. Todo eso
// por menos de lo que cuesta mirarlo. El máximo que se regala son S/5, y solo
// una vez por cambio.
const PISO_CENTIMOS = 500;

// 50 locales TOTALES, que es lo que ya acota el selector del panel
// (`Math.min(50, …)` en dashboard/planes). Acá se guarda como extras, o sea
// descontando el que incluye el plan.
const MAXIMO_EXTRA = 49;

// Un periodo mensual mide entre 28 y 31 días y uno anual 365 o 366. Se calcula
// del calendario real (ver `diasDelPeriodo`) en vez de dar 30 por sentado, pero
// se acota: `fechaVencimiento` viene de la base y un valor corrupto no puede
// acabar dividiendo por cero ni inflando un cargo.
const DIAS_MIN = 1;
const DIAS_MAX = 400;

/**
 * Cuántos días dura el periodo que vence en `fechaVencimiento`.
 *
 * Se deriva restándole el ciclo al vencimiento, que es el gemelo exacto de cómo
 * el cron se lo suma (`fechaVencimiento.setMonth(+1)`). Así el numerador y el
 * denominador del prorrateo hablan del mismo calendario: si el cliente está en
 * un febrero de 28 días, sus días valen 1/28 y no 1/30.
 */
const diasDelPeriodo = (fechaVencimiento, anual) => {
  const inicio = new Date(fechaVencimiento);
  inicio.setMonth(inicio.getMonth() - (anual ? 12 : 1));
  const dias = Math.round((new Date(fechaVencimiento) - inicio) / DIA_MS);
  if (!Number.isFinite(dias)) return DIAS_MIN;
  return Math.min(DIAS_MAX, Math.max(DIAS_MIN, dias));
};

/**
 * Los días que le quedan al cliente del periodo que ya pagó.
 *
 * ⚠️ `ceil`, no `floor`, y al revés que el `diasRestantes` de
 * lib/anulacionPendiente.js. Allá el redondeo por exceso era el lado peligroso
 * porque había un plazo legal corriendo detrás; acá el que paga es el cliente,
 * así que el día en curso —que ya empezó y que va a usar entero— se le cuenta a
 * su favor. Un vencimiento pasado o ausente da 0: no queda nada que prorratear,
 * y la renovación, que es inminente, cobrará el total nuevo.
 */
const diasRestantes = (fechaVencimiento, ahora = new Date()) => {
  if (!fechaVencimiento) return 0;
  const ms = new Date(fechaVencimiento) - new Date(ahora);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / DIA_MS);
};

/**
 * Lo que se cobra HOY por pasar de `localesExtraActual` a `localesExtraNuevo`.
 *
 * @returns {{
 *   delta: number,           // locales que se suman (0 o negativo = no se cobra)
 *   centimos: number,        // lo que se cobra hoy, 0 si es gratis
 *   gratis: boolean,         // cayó bajo el piso: entra sin cargo
 *   dias: number,            // días que se están cobrando
 *   diasPeriodo: number,     // días que mide el periodo completo
 *   promoAplicada: boolean,  // se le aplicó el 50% de bienvenida
 * }}
 */
const prorrateo = ({
  plan,
  anual,
  fechaVencimiento,
  localesExtraActual = 0,
  localesExtraNuevo = 0,
  mesesPromoRestantes = 0,
  ahora = new Date(),
}) => {
  const actual = Math.max(0, Math.trunc(Number(localesExtraActual) || 0));
  const nuevo = Math.max(0, Math.trunc(Number(localesExtraNuevo) || 0));
  const delta = nuevo - actual;
  const diasPeriodo = fechaVencimiento ? diasDelPeriodo(fechaVencimiento, anual) : 0;
  const dias = Math.min(diasRestantes(fechaVencimiento, ahora), diasPeriodo);
  const vacio = { delta, centimos: 0, gratis: false, dias, diasPeriodo, promoAplicada: false };

  // Bajar no devuelve dinero (el periodo ya está pagado) y no cobra nada.
  if (delta <= 0) return vacio;

  // ⚠️ Se le pregunta a la tabla de capacidades, no a `plan === 'FRANQUICIA'`.
  // Un plan que no vende locales no puede acabar en un cargo aunque el número
  // llegue del navegador: es la misma regla que ya aplica `montoSuscripcion`.
  const tarifa = puede(plan, 'localesAdicionales') ? precioLocal(plan) : null;
  if (!tarifa) return vacio;
  // Sin días por delante no hay nada que prorratear, pero el local SÍ entra: la
  // renovación —que está a la vuelta— cobrará el total nuevo.
  if (dias <= 0) return { ...vacio, gratis: true };

  const lista = (anual ? tarifa.anual : tarifa.mensual) * delta;
  // La promo de bienvenida se aplica igual que en la renovación, que parte por
  // la mitad el `precioBase` COMPLETO —locales incluidos—. Cobrar el local a
  // tarifa plena hoy y a mitad de precio en la renovación le daría al cliente
  // dos tarifas distintas por lo mismo dentro del mismo mes.
  const promoAplicada = !anual && mesesPromoRestantes > 0;
  const conPromo = promoAplicada ? lista / 2 : lista;
  const bruto = Math.round((conPromo * dias) / diasPeriodo);

  if (bruto < PISO_CENTIMOS) return { ...vacio, gratis: true, promoAplicada };
  return { delta, centimos: bruto, gratis: false, dias, diasPeriodo, promoAplicada };
};

/**
 * Por qué NO se puede aplicar este cambio, o `null` si se puede.
 *
 * 🔴 La guarda que de verdad importa es la de BAJAR. Sin ella, un cliente con
 * tres locales cargados que baja el contador a uno deja de pagar dos y
 * `negociosVigilables` (lib/equipo.js) deja de vigilar los dos más nuevos en el
 * siguiente ciclo — en silencio, porque ese corte no avisa a nadie: no borra ni
 * desactiva nada, simplemente los saca del barrido. El cliente vería el
 * historial de dos de sus fichas congelarse sin un solo error en pantalla.
 * Exigiendo que el tope nuevo alcance a los negocios que ya tiene ACTIVOS, la
 * bajada nunca puede apagar una vigilancia por sorpresa: primero se desactiva
 * la ficha, y entonces se puede dejar de pagar el local.
 */
const validarCambio = ({ plan, suscripcionActiva, tieneTarjeta, localesExtraNuevo, negociosActivos }) => {
  if (!puede(plan, 'localesAdicionales')) return 'PLAN_SIN_LOCALES';
  if (!suscripcionActiva) return 'SIN_SUSCRIPCION';
  if (!tieneTarjeta) return 'SIN_TARJETA';

  const nuevo = Number(localesExtraNuevo);
  if (!Number.isInteger(nuevo) || nuevo < 0) return 'CANTIDAD_INVALIDA';
  // Tope duro: el mismo que acota el selector del panel. No protege de nada
  // grave —el cargo se le enseña antes de confirmarlo—, pero evita que un
  // cuerpo manipulado pida mil locales y genere un cargo de cinco cifras.
  if (nuevo > MAXIMO_EXTRA) return 'CANTIDAD_INVALIDA';

  if (localesPermitidos(plan, nuevo) < Number(negociosActivos || 0)) return 'LOCALES_EN_USO';
  return null;
};

/** Los locales que incluye el plan, sin contar los pagados aparte. */
const incluidosEnElPlan = (plan) => limite(plan, 'negocios');

module.exports = {
  PISO_CENTIMOS,
  MAXIMO_EXTRA,
  diasDelPeriodo,
  diasRestantes,
  prorrateo,
  validarCambio,
  incluidosEnElPlan,
};
