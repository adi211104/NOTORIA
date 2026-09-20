// brand-shield/src/lib/competencia.js
//
// Cuándo un competidor merece que le avisemos al dueño. Puro: sin red y sin
// base — recibe snapshots ya leídos y decide.
//
// ── El problema que resuelve ─────────────────────────────────────────────────
//
// La función de competencia existe entera: panel de competidores, análisis con
// IA, comparación mensual (`lib/progreso.js`). El dato está guardado y no cuesta
// una sola llamada a Google. Pero el cliente **solo se entera si entra a
// mirar** — y el patrón de abandono está medido: el dueño entra la primera
// semana y a los veinte días deja de entrar. Es el mismo patrón que motivó que
// existiera el afiche de la pared.
//
// O sea: la función existe, el dato existe, y aun así el cliente no se entera.
//
// ── Por qué va en el RESUMEN y no como alerta propia ─────────────────────────
//
// 🔴 La propuesta original pedía un `TipoAlerta` nuevo. Se descartó, y no por
// pereza: añadir un tipo obliga a tocar SIETE sitios —el enum de Prisma,
// `TIPOS_VALIDOS` en `auth.routes.js`, `tiposActivos` del worker, `Icons.js`,
// `alertas/page.js`, `web/src/lib/alertas.js` y `Modelos.kt` de la app— y
// olvidar uno deja al usuario sin poder activarla, en silencio (§12).
//
// Y sobre todo: **no es una urgencia**. Una alerta interrumpe; que el vecino
// haya ganado seis reseñas este mes no exige hacer nada hoy. El resumen
// periódico es exactamente el sitio de un dato que importa y no corre prisa —
// mientras que meterlo en el canal de las alertas críticas le restaría filo al
// canal donde sí avisamos de una reseña de 1★.
//
// ── La regla, y por qué estos umbrales y no otros ────────────────────────────
//
// ⚠️ El rating usa `RATING_MINIMO_SIGNIFICATIVO` de `progreso.js` (0.2), que ya
// existe y tiene su motivo: Google publica la nota redondeada a un decimal, así
// que un movimiento de 0.1 cabe ENTERO dentro del redondeo. Inventar un umbral
// nuevo produciría avisos por ruido, y un aviso que se equivoca dos veces deja
// de leerse — que es justamente lo que este archivo viene a evitar.

const { compararMeses, RATING_MINIMO_SIGNIFICATIVO } = require('./progreso');

// Cuántas reseñas de ventaja hacen que valga la pena mencionarlo.
//
// ⚠️ 3 y no 1: con una o dos de diferencia, el mes siguiente puede darse vuelta
// solo. Decirle al dueño «te están ganando» por una reseña es enseñarle a
// ignorar el dato. Tiene que ser una diferencia que aguante mirarla dos veces.
const VENTAJA_MINIMA_RESENAS = 3;

/**
 * El competidor del que vale la pena hablar este mes, o `null`.
 *
 * Recibe los sujetos ya medidos (la forma que devuelve `compararMeses`) para
 * poder probarse sin base de datos.
 *
 * @param propio   { nombre, actual } del negocio del cliente
 * @param rivales  [{ nombre, actual }]
 */
const elegirDestacado = (propio, rivales = []) => {
  // 🔴 Sin medición propia no se compara. Es el mismo corte que hace la ruta de
  // progreso: leer el mes de otro sin tener el propio le haría creer al dueño
  // que el número de al lado es el suyo.
  if (!propio?.actual) return null;

  const medidos = rivales.filter((r) => r?.actual);
  if (!medidos.length) return null;

  const mias = propio.actual.resenasNuevas;

  // El que más creció, y solo si de verdad sacó ventaja.
  const porResenas = [...medidos].sort((a, b) => b.actual.resenasNuevas - a.actual.resenasNuevas)[0];
  const ventaja = porResenas.actual.resenasNuevas - mias;
  if (ventaja >= VENTAJA_MINIMA_RESENAS) {
    return {
      motivo: 'RESENAS',
      nombre: porResenas.nombre,
      suyas: porResenas.actual.resenasNuevas,
      mias,
      ventaja,
      deltaRating: porResenas.actual.deltaRating,
    };
  }

  // Si nadie sacó ventaja en volumen, el rating: un rival que SUBIÓ de verdad.
  //
  // ⚠️ Solo hacia arriba. Que a un competidor le haya bajado la nota no es una
  // noticia accionable para el dueño, y celebrarlo en un correo de producto
  // sería un tono que Notoria no tiene.
  const subio = medidos
    .filter((r) => r.actual.ratingSignificativo && r.actual.deltaRating > 0)
    .sort((a, b) => b.actual.deltaRating - a.actual.deltaRating)[0];
  if (subio) {
    return {
      motivo: 'RATING',
      nombre: subio.nombre,
      deltaRating: subio.deltaRating,
      ratingFinal: subio.actual.ratingFinal,
      suyas: subio.actual.resenasNuevas,
      mias,
    };
  }

  return null;
};

/**
 * Lo mismo, partiendo de los snapshots crudos. Es lo que llama el worker.
 *
 * @param negocio  { nombre, snapshots }
 * @param competidores [{ nombre, snapshots }]
 */
const destacadoDelMes = (negocio, competidores = [], ahora = new Date()) => {
  if (!negocio) return null;
  const propio = { nombre: negocio.nombre, ...compararMeses(negocio.snapshots || [], ahora) };
  const rivales = (competidores || []).map((c) => ({
    nombre: c.nombre,
    ...compararMeses(c.snapshots || [], ahora),
  }));
  return elegirDestacado(propio, rivales);
};

module.exports = {
  elegirDestacado,
  destacadoDelMes,
  VENTAJA_MINIMA_RESENAS,
  RATING_MINIMO_SIGNIFICATIVO,
};
