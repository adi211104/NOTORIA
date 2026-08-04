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
];

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
const clasificar = (texto) => {
  if (!texto) return 'neutro';
  const lower = texto.toLowerCase();
  if (PALABRAS_NEGATIVAS.some((p) => lower.includes(p))) return 'negativo';
  if (PALABRAS_POSITIVAS.some((p) => lower.includes(p))) return 'positivo';
  return 'neutro';
};

module.exports = { clasificar, PALABRAS_NEGATIVAS, PALABRAS_POSITIVAS };
