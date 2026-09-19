// brand-shield/src/lib/dormancia.js
//
// A quién deja de escanear el worker, y por qué. Puro: sin red y sin base.
//
// ── El problema que resuelve ─────────────────────────────────────────────────
//
// El plan Gratuito no tenía freno. Una cuenta se creaba, cargaba su negocio, y
// Notoria le pedía su ficha a Google todos los días PARA SIEMPRE, la persona
// volviera o no. Medido en producción el 2026-09-19: las 4 cuentas gratuitas con
// negocio activo llevaban 33 días sin tocar el botón, 0 alertas leídas, y dos de
// ellas ni siquiera habían verificado su correo. Costo: S/4.39 al mes cada una,
// a perpetuidad.
//
// Con 11 usuarios eso son S/10 al mes y no se nota. El problema no es el importe
// —es que la estructura no converge: con mil altas son S/4 400 al mes sin un sol
// de ingreso, y la conversión que haría falta para compensarlo era del 24,5%,
// que no existe en ningún SaaS freemium.
//
// ── Las dos condiciones, y por qué son DOS ───────────────────────────────────
//
// 1. ABANDONO: no entra desde hace `DIAS_INACTIVIDAD`. Es el caso normal.
// 2. SIN VERIFICAR: nunca confirmó su correo y ya pasó la ventana en la que el
//    producto insiste. Este es distinto y hay que tratarlo aparte porque no es
//    solo costo: a esa dirección **no se le puede mandar nada**. Las alertas se
//    le enviarían igual —no hay ni un `emailVerificado` en toda la cadena del
//    notificador, comprobado— y escribirle a un buzón que nunca confirmó nada es
//    justo lo que quema el dominio del que depende la entrega de TODO lo demás,
//    comprobantes fiscales incluidos. O sea que escanear esa cuenta es pagar por
//    generar un correo que no deberíamos mandar.
//
// 🔑 Los 10 días no son un número elegido: son exactamente la ventana en la que
// `workers/verificacion.worker.js` deja de insistir con el recordatorio. Cuando
// el producto deja de pedirle que verifique, deja también de gastar por ella.
// Atarlo a esa constante y no a una nueva evita que las dos se separen.
//
// ── Lo que este archivo NO hace, a propósito ─────────────────────────────────
//
// 🔴 NO toca los planes de pago. Nunca. Quien paga tiene su cadencia contratada
// y punto, aunque no entre en seis meses — no entrar es exactamente lo que le
// vendimos («no tienes que estar mirando»). Dormir a un cliente que paga sería
// dejar de prestarle el servicio que compró.
//
// 🔴 NO borra, NO desactiva y NO cambia ningún dato. Es el mismo criterio que el
// corte por asientos del equipo y el de locales: se deja de VIGILAR, y en cuanto
// la persona entra, el escaneo vuelve solo en el ciclo siguiente. Un dueño que
// vuelve a los tres meses encuentra su cuenta intacta.
//
// 🔴 Y NO es silencioso: `DIAS_AVISO_PREVIO` antes de dormir sale un correo. Sin
// él esto sería apagarle la vigilancia a alguien sin decírselo, que es la clase
// de cosa que este proyecto no hace — y además el correo es, de paso, el mejor
// motivo que tenemos para que vuelva.

const { capacidades } = require('./planes');

// Sin entrar en 30 días la cuenta gratuita se pausa.
//
// ⚠️ 30 y no 14: el patrón de abandono que el producto ya tiene medido es que el
// dueño entra la primera semana y a los veinte días deja de entrar. Cortar en 14
// pausaría a gente que todavía está evaluando, que es exactamente a quien no hay
// que tocar.
const DIAS_INACTIVIDAD = 30;

// Cuántos días antes se avisa. 3 da tiempo a entrar sin que el correo llegue tan
// pronto que se olvide.
const DIAS_AVISO_PREVIO = 3;

// Una cuenta que nunca verificó su correo deja de escanearse pasados estos días.
// Es la misma ventana que `verificacion.worker.js` usa para dejar de insistir.
const DIAS_SIN_VERIFICAR = 10;

const DIA = 24 * 60 * 60 * 1000;

/**
 * La referencia de actividad de una cuenta.
 *
 * ⚠️ `ultimoAcceso` puede ser `null` en toda cuenta anterior a esa columna, y eso
 * NO significa «nunca entró». Cayendo a `creadoEn` una cuenta vieja tiene, como
 * mínimo, la antigüedad de su alta — así el despliegue no apaga de golpe la
 * vigilancia de todas las cuentas gratuitas existentes, que es lo que pasaría
 * tratando el `null` como «inactiva desde siempre».
 */
const referencia = (usuario) => usuario?.ultimoAcceso || usuario?.creadoEn || null;

const diasDesde = (fecha, ahora = Date.now()) =>
  fecha ? (ahora - new Date(fecha).getTime()) / DIA : null;

/**
 * ¿Hay que dejar de escanear los negocios de esta cuenta?
 *
 * Devuelve `null` si sigue activa, o el motivo si no: 'INACTIVA' | 'SIN_VERIFICAR'.
 * El motivo viaja para que los logs y el correo puedan distinguirlos — son dos
 * situaciones distintas y se arreglan distinto (una entrando, la otra
 * confirmando el correo).
 */
const motivoDormida = (usuario, ahora = Date.now()) => {
  if (!usuario) return null;

  // 🔴 La guarda que protege al que paga. Va PRIMERO y pregunta a la tabla de
  // planes, no a `plan === 'GRATIS'`: el día que exista un cuarto plan de pago,
  // escribir la lista a mano acá es exactamente el fallo que §8.6 documenta.
  if (capacidades(usuario.plan)?.esDePago) return null;

  const edad = diasDesde(usuario.creadoEn, ahora);
  if (!usuario.emailVerificado && edad !== null && edad >= DIAS_SIN_VERIFICAR) {
    return 'SIN_VERIFICAR';
  }

  const inactiva = diasDesde(referencia(usuario), ahora);
  if (inactiva !== null && inactiva >= DIAS_INACTIVIDAD) return 'INACTIVA';

  return null;
};

/** Azúcar para los call-sites que solo quieren el sí/no. */
const estaDormida = (usuario, ahora = Date.now()) => motivoDormida(usuario, ahora) !== null;

/**
 * ¿Toca avisarle HOY de que se va a pausar?
 *
 * ⚠️ Es una ventana de UN día, no «a partir de». El cron corre a diario, así que
 * un «>= 27» mandaría el mismo correo los días 27, 28, 29 y 30 — cuatro avisos
 * para una sola pausa. Un aviso que se repite sin que cambie nada es lo que
 * enseña a ignorar los correos, que es la lección que ya dejó el cron de
 * anulaciones y el monitor de uptime.
 *
 * ⚠️ Y solo avisa por INACTIVIDAD. A quien no verificó ya le llegaron sus dos
 * recordatorios de activación, y no se le puede escribir un tercero: es el buzón
 * que precisamente no confirmó nada.
 */
const tocaAvisar = (usuario, ahora = Date.now()) => {
  if (!usuario || capacidades(usuario.plan)?.esDePago) return false;
  if (!usuario.emailVerificado) return false;
  if (estaDormida(usuario, ahora)) return false;      // ya es tarde, no tiene sentido

  const inactiva = diasDesde(referencia(usuario), ahora);
  if (inactiva === null) return false;
  const umbral = DIAS_INACTIVIDAD - DIAS_AVISO_PREVIO;
  return inactiva >= umbral && inactiva < umbral + 1;
};

/** Días que le quedan antes de la pausa. Para el texto del correo. */
const diasParaPausa = (usuario, ahora = Date.now()) => {
  const inactiva = diasDesde(referencia(usuario), ahora);
  if (inactiva === null) return null;
  // `ceil` y no `floor`: acá el redondeo juega a favor de quien lo lee, al revés
  // que en `anulacionPendiente` (allá había un plazo legal y pasarse era el lado
  // peligroso). Decirle «te quedan 3» cuando quedan 2,4 no le cuesta nada; lo
  // contrario le haría creer que ya no llega.
  return Math.max(0, Math.ceil(DIAS_INACTIVIDAD - inactiva));
};

/**
 * Cada cuántas horas se escanea esta cuenta.
 *
 * El plan gratuito corre a su cadencia completa durante `diasPruebaCompleta` y
 * después baja a `horasEscaneoTrasPrueba`. No es un recorte encubierto: es lo que
 * el plan gratuito ES — un motor de prueba, no un servicio perpetuo. El primer
 * mes se entrega entero, que es la ventana en la que la persona decide.
 *
 * ⚠️ Los dos números viven en `planes.js` y NO acá: son límites POR PLAN, y una
 * tabla por plan fuera de ese archivo es lo que costó los tres fallos silenciosos
 * de IMPULSO (§8.6). Acá solo se aplica la regla.
 */
const horasEscaneo = (usuario, ahora = Date.now()) => {
  const cap = capacidades(usuario?.plan) || capacidades('GRATIS');
  if (!cap.horasEscaneoTrasPrueba) return cap.horasEscaneo;
  const edad = diasDesde(usuario?.creadoEn, ahora);
  if (edad === null || edad < cap.diasPruebaCompleta) return cap.horasEscaneo;
  return cap.horasEscaneoTrasPrueba;
};

module.exports = {
  DIAS_INACTIVIDAD,
  DIAS_AVISO_PREVIO,
  DIAS_SIN_VERIFICAR,
  referencia,
  motivoDormida,
  estaDormida,
  tocaAvisar,
  diasParaPausa,
  horasEscaneo,
};
