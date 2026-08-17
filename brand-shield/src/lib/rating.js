// brand-shield/src/lib/rating.js
// Aritmética del rating de Google. Sin llamadas de red, sin base de datos: son
// funciones puras, y por eso las puede usar tanto el panel (con el negocio del
// usuario) como el analizador público del landing (con cualquier ficha).
//
// Lo que resuelven es la pregunta que todo dueño se hace y que hoy nadie le
// contesta: "¿cuántas reseñas buenas necesito?" y "¿qué me pasa si me atacan?".
// El rating de Google es un promedio simple, así que ambas salen de despejar.

// El promedio que publica Google va redondeado a un decimal. Todo lo que se le
// muestre al usuario tiene que estar redondeado igual, o le estaríamos diciendo
// que está en 4.47 cuando su ficha dice 4.5.
const redondear = (x) => Math.round(x * 10) / 10;

/**
 * Cuántas reseñas de `estrellas` hacen falta para llegar a `objetivo`.
 *
 * Partiendo de N reseñas con promedio R, sumar k reseñas de valor E deja el
 * promedio en (R·N + E·k) / (N + k). Igualando a O y despejando:
 *
 *     k = N · (O − R) / (E − O)
 *
 * Devuelve null cuando la meta es inalcanzable, que es un caso real y hay que
 * decirlo en vez de devolver un número gigante: con reseñas de 5★ no se puede
 * llegar a 5.0 exacto si ya hay una sola reseña peor, y ninguna meta por encima
 * de `estrellas` es alcanzable sumando reseñas de ese valor.
 */
const resenasParaLlegarA = ({ rating, totalResenas, objetivo, estrellas = 5 }) => {
  const R = Number(rating), N = Number(totalResenas), O = Number(objetivo), E = Number(estrellas);
  if (!Number.isFinite(R) || !Number.isFinite(N) || N < 0) return null;
  if (!Number.isFinite(O) || O <= 0) return null;
  if (R >= O) return 0;              // ya está en la meta o por encima
  if (E <= O) return null;           // inalcanzable: sumando 4★ no se llega a 4.5

  return Math.ceil((N * (O - R)) / (E - O));
};

/**
 * Qué pasa con el rating si entran `cuantas` reseñas de `estrellas`.
 *
 * Sirve para las dos caras del mismo cálculo: la meta ("si consigo 40 de 5★")
 * y el simulacro ("si mañana me caen 8 de 1★"). Es la misma fórmula, y por eso
 * es una sola función y no dos.
 */
const simular = ({ rating, totalResenas, cuantas, estrellas }) => {
  const R = Number(rating), N = Number(totalResenas), k = Number(cuantas), E = Number(estrellas);
  if (!Number.isFinite(R) || !Number.isFinite(N) || !Number.isFinite(k) || !Number.isFinite(E)) return null;
  if (k <= 0 || N < 0) return null;

  const nuevo = (R * N + E * k) / (N + k);
  return {
    ratingAntes: redondear(R),
    ratingDespues: redondear(nuevo),
    // El cambio se calcula sobre los valores YA redondeados, que es lo que el
    // dueño va a ver en su ficha. Calcularlo sobre los crudos daría "bajas 0.09"
    // mientras la ficha pasa de 4.5 a 4.4, que se lee como una contradicción.
    cambio: redondear(redondear(nuevo) - redondear(R)),
    totalDespues: N + k,
  };
};

/**
 * Cuánto mueve el rating UNA sola reseña de 1★. Es la cifra que mejor explica
 * por qué un negocio con pocas reseñas es frágil: con 40 reseñas cada 1★ cuesta
 * casi una décima, y con 900 no se nota. El dueño de las 40 tiene que entender
 * que está a tres reseñas de perder medio punto.
 */
const costeDeUnaEstrella = ({ rating, totalResenas }) => {
  const s = simular({ rating, totalResenas, cuantas: 1, estrellas: 1 });
  if (!s) return null;
  // Sin redondear: acá el valor pequeño ES la información
  const exacto = (Number(rating) * Number(totalResenas) + 1) / (Number(totalResenas) + 1) - Number(rating);
  return { redondeado: s.cambio, exacto: Number(exacto.toFixed(4)) };
};

// Umbral por el que filtra buena parte de la gente al elegir dónde comer. Es el
// dato de BrightLocal que ya se cita en el landing, y el motivo por el que la
// diferencia entre 4.4 y 4.5 importa mucho más que entre 4.1 y 4.2.
const UMBRAL_FILTRO = 4.5;

/**
 * Informe completo para una ficha: dónde está, qué le falta para las metas
 * relevantes, y qué le pasaría ante una ráfaga de reseñas de 1★.
 *
 * Las metas se eligen solas a partir del rating actual para no ofrecer una que
 * ya está cumplida ni una absurdamente lejana.
 */
const informeRating = ({ rating, totalResenas }) => {
  const R = Number(rating), N = Number(totalResenas);
  if (!Number.isFinite(R) || !Number.isFinite(N) || N <= 0 || R <= 0) return null;

  const metas = [4.0, 4.3, 4.5, 4.7]
    .filter((o) => o > R)
    .slice(0, 3)
    .map((objetivo) => ({ objetivo, resenas: resenasParaLlegarA({ rating: R, totalResenas: N, objetivo }) }))
    .filter((m) => m.resenas !== null);

  // Ráfagas de tamaño creciente. Son las cifras del "simulacro": el mismo
  // argumento que el landing hace con estudios, pero con los números del propio
  // negocio, que es lo único que de verdad convence.
  const ataques = [3, 5, 10].map((cuantas) => ({
    cuantas,
    ...simular({ rating: R, totalResenas: N, cuantas, estrellas: 1 }),
  }));

  // Cuántas reseñas de 1★ hacen falta para caer por debajo del umbral del filtro.
  // Solo tiene sentido preguntarlo si hoy está por encima.
  let paraCaerDelUmbral = null;
  if (R >= UMBRAL_FILTRO) {
    // Despeje simétrico al de resenasParaLlegarA, con la meta por debajo:
    // k = N·(R − O) / (O − 1), con reseñas de 1★.
    //
    // El `max(1, ...)` no es cosmético: justo en 4.50 el despeje da 0, y ese es
    // el caso MÁS interesante de todos —una sola reseña de 1★ te saca del
    // filtro— así que devolver null ahí sería callarse la mejor cifra.
    const k = Math.max(1, Math.ceil((N * (R - UMBRAL_FILTRO)) / (UMBRAL_FILTRO - 1)));
    if (Number.isFinite(k)) paraCaerDelUmbral = k;
  }

  return {
    rating: redondear(R),
    totalResenas: N,
    umbral: UMBRAL_FILTRO,
    sobreUmbral: R >= UMBRAL_FILTRO,
    metas,
    ataques,
    paraCaerDelUmbral,
    costeUnaEstrella: costeDeUnaEstrella({ rating: R, totalResenas: N }),
  };
};

module.exports = {
  resenasParaLlegarA,
  simular,
  costeDeUnaEstrella,
  informeRating,
  UMBRAL_FILTRO,
};
