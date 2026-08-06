// brand-shield/src/nlp/sentimiento.js
// Sentimiento de una mención (texto suelto, SIN rating).
//
// Distinto de nlp/detector.js: ahí el rating de la reseña ya dice si es buena o
// mala y las palabras solo sirven para marcarla como crítica. Acá no hay rating,
// el texto es lo único que hay.
//
// Es por diccionario a propósito, no con IA: el worker clasifica cada mención de
// cada negocio en cada ciclo, y mandar eso a Groq costaría tokens por algo que se
// resuelve bien con una lista. La IA se reserva para el insight semanal, que se
// genera una vez por semana. Si algún día se quiere subir la precisión, el lugar
// para hacerlo es acá y el resto del sistema no se entera.

// El orden importa: lo negativo gana sobre lo positivo (ver clasificar), porque
// una queja con una frase amable adentro sigue siendo una queja.
const PALABRAS_NEGATIVAS = [
  'pésimo', 'pesimo', 'horrible', 'asco', 'asqueroso', 'terrible', 'nunca vuelvo',
  'no vuelvo', 'estafa', 'estafaron', 'robo', 'robaron', 'feo', 'sucio', 'mugre',
  'frío', 'frio', 'lento', 'demora', 'mal servicio', 'pésima atención',
  'pesima atencion', 'mala atención', 'mala atencion', 'intoxicado', 'intoxicación',
  'intoxicacion', 'cucaracha', 'cucarachas', 'rata', 'ratas', 'mosca', 'pelo en',
  'basura', 'decepción', 'decepcion', 'decepcionado', 'decepcionante', 'fraude',
  'malogrado', 'vencido', 'caro para lo que', 'no lo recomiendo', 'jamás vuelvo',
  'jamas vuelvo', 'maltrato', 'grosero', 'grosera', 'no me atendieron', 'estafadores',
  // Agregadas el 2026-08-06 tras ver "no me gusta" clasificado como neutro con
  // un comentario real de TikTok. Eran ausencias llamativas: el disgusto llano
  // es más común que "pésimo" en un comentario de red social, donde la gente
  // escribe corto y sin tildes.
  'no me gusta', 'no me gustó', 'no me gusto', 'no me gustan', 'malísimo', 'malisimo',
  'malísima', 'malisima', 'pésima', 'pesima', 'mala experiencia', 'una porquería',
  'una porqueria', 'porquería', 'porqueria', 'horrible', 'nefasto', 'lamentable',
  'no vale la pena', 'perdí mi tiempo', 'perdi mi tiempo', 'no sirve', 'pura estafa',
  // "mala" suelta NO se lista: rompería "no está mala" (que en Perú es elogio) y
  // "mala hierba". Se listan las construcciones donde el adjetivo va separado de
  // su sustantivo, que es lo que el diccionario por subcadenas se perdía:
  // "la atención fue mala" no casaba con 'mala atención'.
  'fue mala', 'fue malo', 'muy mala', 'muy malo', 'estuvo mal', 'atendieron mal',
  'todo mal', 'bastante malo', 'bastante mala',
];

// Negadores que INVIERTEN una palabra positiva cercana: "no me encanta",
// "nunca lo recomiendo", "ni de broma volvería".
//
// Por qué hace falta: el diccionario buscaba subcadenas sueltas, así que
// "no me encanta" contenía "me encanta" y se clasificaba POSITIVO — el peor
// error posible acá, porque un cliente molesto quedaba archivado como elogio y
// no disparaba alerta. Encontrado el 2026-08-06.
const NEGADORES = ['no', 'nunca', 'jamás', 'jamas', 'ni', 'tampoco', 'nada'];

// Ventana de palabras hacia atrás donde se busca el negador. Tres alcanza para
// "no me encanta" o "nunca lo recomiendo" sin llegar a frases anteriores, que
// producirían falsos negativos ("no había cola, el servicio es excelente").
const VENTANA_NEGACION = 3;

const PALABRAS_POSITIVAS = [
  'excelente', 'delicioso', 'deliciosa', 'recomiendo', 'increíble', 'increible',
  'buenísimo', 'buenisimo', 'espectacular', 'lo mejor', '5 estrellas', 'volvería',
  'volveria', 'recomendado', 'recomendadísimo', 'recomendadisimo', 'encantó',
  'encanto la', 'rico', 'riquísimo', 'riquisimo', 'buena atención', 'buena atencion',
  'amables', 'me encanta', 'maravilloso', 'maravillosa', 'top', 'imperdible',
];

/**
 * "negativo" | "positivo" | "neutro"
 * Lo negativo tiene prioridad: es lo que dispara alertas y preferimos un falso
 * positivo (el usuario ve una mención que no era grave) a un falso negativo
 * (una queja que se propaga sin que nadie se entere).
 */
/**
 * ¿La palabra positiva que empieza en `posicion` viene negada?
 * Mira las VENTANA_NEGACION palabras anteriores en busca de un negador.
 */
const vieneNegada = (lower, posicion) => {
  const previas = lower.slice(0, posicion).split(/[^\wáéíóúñü]+/).filter(Boolean);
  return previas.slice(-VENTANA_NEGACION).some((p) => NEGADORES.includes(p));
};

const clasificar = (texto) => {
  if (!texto) return 'neutro';
  const lower = texto.toLowerCase();

  if (PALABRAS_NEGATIVAS.some((p) => lower.includes(p))) return 'negativo';

  // Una palabra positiva solo cuenta si NO está negada. Y si lo está, el texto
  // pasa a negativo en vez de a neutro: "no me gustó nada" es una queja, no una
  // opinión tibia, y preferimos un falso positivo a dejar pasar un enojo.
  for (const p of PALABRAS_POSITIVAS) {
    const i = lower.indexOf(p);
    if (i === -1) continue;
    if (vieneNegada(lower, i)) return 'negativo';
    return 'positivo';
  }

  return 'neutro';
};

module.exports = { clasificar, PALABRAS_NEGATIVAS, PALABRAS_POSITIVAS };
