// brand-shield/src/lib/progreso.js
//
// Compara un mes con el anterior a partir de los snapshots que ya se guardan.
// Puro: no toca la base, no llama a nadie. Recibe las filas y devuelve números.
//
// ── Por qué este archivo mide VOLUMEN y no rating ────────────────────────────
//
// La idea original del pendiente era un ranking de «quién subió más este mes»
// por nota. Con datos reales delante, eso no funciona: el 2026-08-23, con 49
// días de historial, los cinco negocios más antiguos daban 4.8→4.8, 3.9→3.9,
// 4.0→4.0 y 4.5→4.5. Una ficha con 1118 reseñas no mueve su promedio en un mes
// ni queriendo — haría falta una avalancha para desplazar el tercer decimal.
//
// Lo que SÍ se mueve, y bastante, es el número de reseñas: en esas mismas siete
// semanas La Mar sumó 14, Cebichería 5 y KFC 5. Ese es el indicador que un dueño
// puede empujar (pedirle la reseña al cliente contento) y el que de verdad
// cambia la nota a medio plazo. Así que el «progreso» del mes es cuántas reseñas
// entraron, y el rating va como dato de apoyo.
//
// ── Reglas que no hay que deshacer ───────────────────────────────────────────
//
// 🔴 `null` no es `0`. Un periodo sin dos snapshots devuelve `null` («no lo
// sabemos»), no cero («no pasó nada»). Pintar un 0 donde no hubo medición le
// diría al cliente que su mes fue plano cuando lo que pasó es que el escaneo no
// estaba corriendo. Es el mismo criterio que el `null` de las métricas de
// Instagram y el de los scrapers de comentarios.
//
// 🔴 Un delta de reseñas NEGATIVO es información, no un error. Google borra
// reseñas: el 31 de julio una ficha pasó de 11 a 10. Forzarlo a 0 escondería
// justo el caso que al dueño le importa.
//
// 🔴 El rating no se declara «mejorado» por 0.1. Google publica la nota
// redondeada a un decimal, así que dos lecturas tienen ±0.05 cada una y una
// diferencia de 0.1 cabe entera dentro del redondeo. Solo a partir de 0.2 se
// puede afirmar que se movió. Debajo de eso el número se muestra igual, pero
// `ratingSignificativo` va en false y la interfaz no debe cantar victoria.

// Por debajo de esto, la diferencia de rating cabe dentro del redondeo de Google.
const RATING_MINIMO_SIGNIFICATIVO = 0.2;

/**
 * Los dos periodos a comparar: el mes en curso y el mes calendario anterior.
 * Mes calendario y no «últimos 30 días» a propósito: el dueño piensa en meses,
 * y un corte móvil hace que el mismo dato cambie de valor cada día que mira.
 */
const periodosMensuales = (ahora = new Date()) => {
  const f = new Date(ahora);
  const inicioActual = new Date(f.getFullYear(), f.getMonth(), 1);
  const inicioPrevio = new Date(f.getFullYear(), f.getMonth() - 1, 1);
  return {
    actual: { desde: inicioActual, hasta: new Date(f) },
    previo: { desde: inicioPrevio, hasta: inicioActual },
  };
};

/**
 * Mide un periodo a partir de snapshots ya ordenados o no.
 * @returns {null|{resenasNuevas:number, ratingInicial:number, ratingFinal:number,
 *                 deltaRating:number, ratingSignificativo:boolean, lecturas:number,
 *                 desde:Date, hasta:Date}}
 */
const medirPeriodo = (snapshots, { desde, hasta }) => {
  const dentro = snapshots
    .filter((s) => {
      const t = new Date(s.tomadoEn).getTime();
      return t >= desde.getTime() && t < hasta.getTime();
    })
    .sort((a, b) => new Date(a.tomadoEn) - new Date(b.tomadoEn));

  // Con una sola lectura no hay nada que restar. Eso es "no lo sabemos".
  if (dentro.length < 2) return null;

  const primero = dentro[0];
  const ultimo = dentro[dentro.length - 1];
  const deltaRating = Number((ultimo.ratingActual - primero.ratingActual).toFixed(2));

  return {
    resenasNuevas: ultimo.totalResenas - primero.totalResenas,
    ratingInicial: primero.ratingActual,
    ratingFinal: ultimo.ratingActual,
    deltaRating,
    ratingSignificativo: Math.abs(deltaRating) >= RATING_MINIMO_SIGNIFICATIVO,
    lecturas: dentro.length,
    desde: new Date(primero.tomadoEn),
    hasta: new Date(ultimo.tomadoEn),
  };
};

/**
 * Este mes contra el anterior.
 * `aceleracion` es la diferencia de reseñas nuevas entre los dos periodos, y
 * vale `null` si falta cualquiera de los dos: comparar contra un mes que no se
 * midió daría un número inventado.
 */
const compararMeses = (snapshots, ahora = new Date()) => {
  const p = periodosMensuales(ahora);
  const actual = medirPeriodo(snapshots, p.actual);
  const previo = medirPeriodo(snapshots, p.previo);

  return {
    actual,
    previo,
    aceleracion: actual && previo ? actual.resenasNuevas - previo.resenasNuevas : null,
  };
};

/**
 * Ordena varios sujetos (los negocios de una cuenta, o un negocio y sus
 * competidores) por reseñas ganadas este mes.
 *
 * ⚠️ Los que no tienen medición van al FINAL y conservan su `null`. Meterlos
 * como 0 los ordenaría mezclados con los que de verdad no crecieron, que es una
 * afirmación distinta.
 */
const ordenarPorCrecimiento = (sujetos) => {
  const medidos = sujetos.filter((s) => s.actual);
  const sinDatos = sujetos.filter((s) => !s.actual);
  medidos.sort((a, b) => b.actual.resenasNuevas - a.actual.resenasNuevas);
  return [...medidos, ...sinDatos];
};

/**
 * ¿Hay algo que valga la pena enseñar? La regla de producto del proyecto es que
 * lo que no se puede entregar no se muestra: una pantalla de progreso donde
 * todos los números son null o cero es peor que no tener pantalla.
 */
const hayAlgoQueContar = (sujetos) =>
  sujetos.some((s) => s.actual && (s.actual.resenasNuevas !== 0 || s.actual.ratingSignificativo));

module.exports = {
  periodosMensuales,
  medirPeriodo,
  compararMeses,
  ordenarPorCrecimiento,
  hayAlgoQueContar,
  RATING_MINIMO_SIGNIFICATIVO,
};
