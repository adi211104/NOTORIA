// brand-shield/src/lib/score.js
//
// El Score de Reputación 0-100. Puro: no toca la base ni llama a nadie, igual
// que `lib/rating.js` y `lib/progreso.js`. Recibe filas y devuelve números.
//
// ── Por qué se movió acá ─────────────────────────────────────────────────────
//
// La fórmula existía desde hacía meses, pero vivía DENTRO del componente de una
// sola pantalla (`dashboard/negocios/[id]/page.js`, `calcularScore`). O sea que
// el número que mejor resume el producto —el que el catálogo anuncia en los
// cuatro planes— solo existía si abrías la ficha de un negocio concreto. No
// podía entrar en el correo semanal, ni en el PDF, ni en el afiche, ni en la
// constancia, ni en el panel de inicio, ni compararse con el mes pasado.
//
// 🔴 La fórmula es EXACTAMENTE la misma, componente por componente. No es una
// reimplementación «equivalente»: si el número cambiara, a todo el que ya usa
// Notoria le saltaría su score de un día para otro sin que nada haya pasado con
// su reputación, que es la peor forma de estrenar una función.
//
// ── Los pesos, y por qué son estos ───────────────────────────────────────────
//
//   Calidad del rating   55  · lo que de verdad ve un cliente en Maps
//   Volumen de reseñas   20  · un 4.9 con 6 reseñas no es un 4.9 con 600
//   Confianza            15  · proporción de reseñas sin marcar como sospechosas
//   Tasa de respuesta    10  · lo único de la lista que el dueño controla hoy
//
// El volumen va en escala logarítmica y satura en 500 reseñas: la diferencia
// entre 10 y 100 reseñas importa muchísimo, y entre 900 y 1000 no importa nada.

// 🔴 El día se calcula en hora de LIMA, no en UTC.
//
// `toISOString().slice(0,10)` da la fecha UTC, y Perú va cinco horas por detrás:
// entre las 19:00 y la medianoche de Lima, UTC ya está en el día siguiente. Un
// negocio escaneado a las 18:00 y a las 20:00 aparecía con DOS puntos en la
// curva —y el corte de "últimos 60 días" se movía— por la hora a la que se
// mirara. Es exactamente el bug que §9 documenta para las fechas que van a
// SUNAT, por otro camino.
//
// Se reutiliza el helper que ya existe para eso en vez de escribir otro: si
// algún día el servicio deja de ser solo Perú, hay un único sitio que cambiar.
const { fechaPeru } = require('./tributario');

const PESOS = { rating: 55, volumen: 20, confianza: 15, respuesta: 10 };

// Reseñas a partir de las cuales el volumen deja de sumar. No es un número
// mágico: por encima de 500 la ficha ya es estadísticamente sólida y seguir
// premiando volumen castigaría para siempre a un negocio nuevo que lo hace bien.
const VOLUMEN_SATURA_EN = 500;

// Los cortes de nivel. Se devuelve la CLAVE, nunca la etiqueta: el texto lleva
// idioma y el idioma se compone en el panel (misma regla que las invitaciones
// de equipo y los correos de alerta, que ya costaron un bug cada una).
const nivelDe = (score) =>
  score >= 85 ? 'excelente'
  : score >= 70 ? 'bueno'
  : score >= 50 ? 'enRiesgo'
  : 'critico';

/**
 * Score de un negocio.
 *
 * @param {object|null} snap  último snapshot: { ratingActual, totalResenas }
 * @param {Array}  resenas    las reseñas captadas del negocio
 * @returns {null|{score:number, nivel:string, componentes:Array}}
 *
 * Devuelve `null` sin snapshot. No un 0: un negocio recién conectado no tiene
 * «cero reputación», tiene «todavía no medimos». Es el mismo criterio de
 * `progreso.js` y el de las métricas de Instagram.
 */
const calcular = (snap, resenas = []) => {
  if (!snap) return null;

  const rating = snap.ratingActual || 0;
  const total = snap.totalResenas || 0;
  const captadas = resenas.length;
  const sospechosas = resenas.filter((r) => r.esSospechosa).length;
  const respondidas = resenas.filter((r) => r.respondida).length;

  const pRating = (rating / 5) * PESOS.rating;
  const pVolumen = Math.min(Math.log10(total + 1) / Math.log10(VOLUMEN_SATURA_EN), 1) * PESOS.volumen;
  // Sin reseñas captadas se asume lo mejor en confianza (no hay ninguna
  // sospechosa) y la mitad en respuesta (no hay nada que responder todavía).
  // Penalizar a quien aún no tiene reseñas sería medirle un problema que no tiene.
  const pConfianza = captadas > 0 ? (1 - Math.min(sospechosas / captadas, 1)) * PESOS.confianza : PESOS.confianza;
  const pRespuesta = captadas > 0 ? (respondidas / captadas) * PESOS.respuesta : PESOS.respuesta / 2;

  const score = Math.round(pRating + pVolumen + pConfianza + pRespuesta);

  return {
    score,
    nivel: nivelDe(score),
    // Las piezas viajan sueltas para que el panel pueda explicar el número.
    // Un score sin desglose es un veredicto; con desglose es un diagnóstico.
    componentes: [
      { clave: 'rating', valor: Math.round(pRating), max: PESOS.rating, dato: rating },
      { clave: 'volumen', valor: Math.round(pVolumen), max: PESOS.volumen, dato: total },
      { clave: 'confianza', valor: Math.round(pConfianza), max: PESOS.confianza, dato: sospechosas },
      { clave: 'respuesta', valor: Math.round(pRespuesta), max: PESOS.respuesta, dato: captadas > 0 ? Math.round((respondidas / captadas) * 100) : null },
    ],
  };
};

/**
 * La serie histórica del score, un punto por snapshot.
 *
 * 🔴 Hay una limitación real y hay que decirla, no esconderla: de los cuatro
 * componentes, solo DOS son históricos. `rating` y `volumen` salen del snapshot,
 * que sí se guardó en su momento. `confianza` y `respuesta` salen de las reseñas
 * TAL COMO ESTÁN HOY — no se guarda cuántas estaban respondidas en marzo.
 *
 * Así que estos dos se mantienen fijos en su valor actual a lo largo de toda la
 * serie. La consecuencia, que es la parte importante:
 *
 *   · la FORMA de la curva es exacta — la diferencia entre dos puntos cualesquiera
 *     es exactamente la diferencia de rating+volumen, que es lo que de verdad se
 *     movió;
 *   · el VALOR absoluto de un punto viejo es aproximado: dice «cuánto habrías
 *     tenido en marzo si ya respondieras como respondes hoy».
 *
 * Por eso el resultado viaja con `componentesFijos`, para que el panel pueda
 * poner la nota al pie en vez de fingir una precisión que no hay. Historizarlo
 * de verdad exigiría una columna nueva por snapshot, y no vale ese precio: lo
 * que el dueño mira en una tendencia es la pendiente, no el valor de un martes
 * de hace tres meses.
 */
const serie = (snapshots = [], resenas = [], { maximo = 60 } = {}) => {
  const orden = [...snapshots]
    .filter((s) => s && s.ratingActual != null)
    .sort((a, b) => new Date(a.tomadoEn) - new Date(b.tomadoEn));

  if (orden.length < 2) return null; // con un punto no hay tendencia que dibujar

  // Un snapshot por día (el último de cada día): a 1 h de cadencia, Franquicia
  // generaría 720 puntos al mes y el gráfico sería ruido.
  const porDia = new Map();
  for (const s of orden) porDia.set(fechaPeru(s.tomadoEn), s);

  const dias = [...porDia.entries()].slice(-maximo);

  return {
    puntos: dias.map(([fecha, s]) => ({ fecha, score: calcular(s, resenas).score, rating: s.ratingActual })),
    componentesFijos: ['confianza', 'respuesta'],
  };
};

/**
 * Cuánto se movió el score entre el primer y el último punto de la serie.
 * `null` si no hay serie. El signo es lo que importa: un +3 y un −3 se cuentan
 * distinto en el panel y en el correo.
 */
const variacion = (serieScore) => {
  if (!serieScore || serieScore.puntos.length < 2) return null;
  const p = serieScore.puntos;
  const delta = p[p.length - 1].score - p[0].score;
  return { delta, desde: p[0].fecha, hasta: p[p.length - 1].fecha, inicial: p[0].score, final: p[p.length - 1].score };
};

module.exports = { calcular, serie, variacion, nivelDe, PESOS, VOLUMEN_SATURA_EN };
