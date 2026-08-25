// brand-shield/src/lib/parteEquipo.js
//
// El parte semanal para el equipo. Puro: no toca la base ni llama a nadie.
//
// ── Qué es, y por qué cambia la categoría del producto ───────────────────────
//
// Todas las herramientas de reputación usan la IA para lo mismo: redactar la
// RESPUESTA PÚBLICA. Notoria ya lo hace y funciona. Pero esa respuesta es
// cosmética — no arregla el restaurante. Le contesta al cliente que ya se fue
// molesto y no le dice nada a quien provocó el motivo.
//
// Lo que nadie genera es el mensaje hacia ADENTRO: tres o cuatro líneas para el
// grupo de WhatsApp del personal. «Tres clientes mencionaron demora entre
// viernes y domingo; dos elogiaron a Karina por su nombre. Foco de la semana:
// tiempo de pase en hora punta.»
//
// Es un salto de categoría que cuesta un prompt distinto: Notoria deja de ser un
// vigilante de la reputación y pasa a ser una herramienta de gestión que resulta
// que se alimenta de reseñas. Nadie lo hace porque la categoría se llama
// «gestión de reputación», y ese nombre fija la mirada en el cliente que
// reclama — el equipo que provoca el reclamo queda fuera del encuadre, aunque
// sea donde está el problema de verdad.
//
// ── La regla que lo hace fiable: los NÚMEROS los pone el código ──────────────
//
// 🔴 Este archivo calcula los hechos —cuántas reseñas, cuántas positivas, qué
// temas y cuántas veces— y la IA solo los REDACTA. No al revés. Si la IA
// contara, tarde o temprano diría «cuatro clientes mencionaron demora» donde
// fueron dos, y ese parte lo lee un equipo que sabe perfectamente lo que pasó
// esa semana: una cifra inventada lo desacredita entero a la primera.
//
// Es la misma regla de `compararMediciones` («nunca un número inventado») y la
// de `lib/impacto.js`, aplicada al único sitio donde el lector puede
// comprobarla de memoria.
//
// ⚠️ Y por eso `plantilla()` existe: sin Groq, sin clave o con la API caída, el
// parte SALE IGUAL, redactado por código. Peor escrito y con los mismos datos.
// Una función que desaparece cuando falla un tercero no es una función.

const temasLib = require('./temas');

// La semana es de 7 días y se cuenta hacia atrás desde hoy, no desde el lunes:
// el dueño lo abre un miércoles y quiere «lo de esta semana», no «lo que va de
// semana», que un miércoles son dos días y medio.
const DIAS_SEMANA = 7;

// Por debajo de esto no hay un parte que escribir. Con una sola reseña, decirle
// al equipo «un cliente mencionó demora» es convertir una opinión suelta en una
// consigna, que es la forma más rápida de que dejen de leer el parte.
const MINIMO_RESENAS = 2;

// A partir de 4★ se cuenta como elogio. Es el mismo corte que usa la
// auto-respuesta a reseñas positivas.
const UMBRAL_POSITIVA = 4;
const UMBRAL_NEGATIVA = 3;

/**
 * Los hechos de la semana. Todo deterministas, todo comprobable contra la lista
 * de reseñas que ve el dueño en su panel.
 */
const hechos = (resenas = [], idioma = 'es', ahora = new Date()) => {
  const desde = new Date(ahora.getTime() - DIAS_SEMANA * 24 * 3600 * 1000);
  const semana = resenas.filter((r) => {
    const t = new Date(r.fechaResena || r.detectadaEn).getTime();
    return Number.isFinite(t) && t >= desde.getTime();
  });

  const positivas = semana.filter((r) => r.rating >= UMBRAL_POSITIVA);
  const negativas = semana.filter((r) => r.rating != null && r.rating <= UMBRAL_NEGATIVA);

  // Los temas salen del mismo diccionario que el afiche y el panel. Que las tres
  // cosas digan lo mismo no es cosmético: si el afiche de la pared dice «demora»
  // y el parte del WhatsApp dice otra cosa, el equipo deja de creerse las dos.
  const distribucion = temasLib.distribucion(negativas, idioma);

  return {
    desde,
    hasta: new Date(ahora),
    total: semana.length,
    positivas: positivas.length,
    negativas: negativas.length,
    // Solo los temas que se repiten. Uno suelto no es un patrón.
    temas: distribucion.temas.filter((t) => t.veces >= temasLib.MINIMO_MENCIONES),
    // Los textos van a la IA para que pueda citar y detectar elogios por nombre,
    // pero recortados: el prompt no necesita reseñas de 2000 caracteres.
    textosNegativos: negativas.filter((r) => r.texto?.trim()).map((r) => ({ rating: r.rating, texto: r.texto.trim().slice(0, 260) })),
    textosPositivos: positivas.filter((r) => r.texto?.trim()).map((r) => ({ rating: r.rating, texto: r.texto.trim().slice(0, 260) })),
  };
};

/**
 * ¿Hay parte que escribir? Con una semana vacía el producto se calla en vez de
 * rellenar. Es la regla de «lo que no podemos entregar no se muestra» aplicada
 * a un mensaje que alguien va a reenviar a quince personas.
 */
const hayAlgoQueContar = (h) => !!h && h.total >= MINIMO_RESENAS;

const TEXTOS = {
  es: {
    cabecera: (n) => `Reputación de ${n} — esta semana`,
    resumen: (t, p, neg) => {
      const partes = [`${t} reseña${t === 1 ? '' : 's'} nueva${t === 1 ? '' : 's'}`];
      if (p) partes.push(`${p} buena${p === 1 ? '' : 's'}`);
      if (neg) partes.push(`${neg} para mejorar`);
      return `${partes.join(', ')}.`;
    },
    tema: (etiqueta, veces) => `${veces} cliente${veces === 1 ? '' : 's'} mencionaron ${etiqueta}.`,
    foco: (etiqueta) => `Foco de la semana: ${etiqueta}.`,
    todoBien: 'Sin quejas repetidas esta semana. Buen trabajo: mantengamos el ritmo.',
  },
  en: {
    cabecera: (n) => `${n} reputation — this week`,
    resumen: (t, p, neg) => {
      const partes = [`${t} new review${t === 1 ? '' : 's'}`];
      if (p) partes.push(`${p} good`);
      if (neg) partes.push(`${neg} to improve`);
      return `${partes.join(', ')}.`;
    },
    tema: (etiqueta, veces) => `${veces} customer${veces === 1 ? '' : 's'} mentioned ${etiqueta}.`,
    foco: (etiqueta) => `This week's focus: ${etiqueta}.`,
    todoBien: 'No repeated complaints this week. Good work — let us keep the pace.',
  },
};

/**
 * El parte redactado por código. Es a la vez el respaldo cuando la IA no está y
 * la referencia de lo que la IA puede decir: mismos datos, peor prosa.
 */
const plantilla = (h, negocio, idioma = 'es') => {
  const t = TEXTOS[idioma] || TEXTOS.es;
  const lineas = [t.cabecera(negocio?.nombre || ''), t.resumen(h.total, h.positivas, h.negativas)];

  if (h.temas.length) {
    for (const tema of h.temas.slice(0, 2)) lineas.push(t.tema(tema.etiqueta, tema.veces));
    lineas.push(t.foco(h.temas[0].etiqueta));
  } else {
    lineas.push(t.todoBien);
  }
  return lineas.join('\n');
};

// ── El prompt ────────────────────────────────────────────────────────────────
//
// Escrito para que la IA NO pueda contar. Los números le llegan ya calculados y
// se le prohíbe expresamente inventar otros. Lo que sí aporta —y es lo que la
// plantilla no sabe hacer— es leer los textos y encontrar el elogio por nombre
// («dos clientes nombraron a Karina»), que es la línea que hace que el parte se
// reenvíe en vez de ignorarse.
const PROMPT = {
  es: [
    'Escribes el parte semanal que el dueño de un negocio reenvía al grupo de WhatsApp de su personal.',
    'Son 3 o 4 líneas cortas, en español neutro, tono de encargado que habla con su equipo: directo, sin reproches y sin jerga corporativa.',
    'Estructura: (1) cómo fue la semana en una línea, (2) lo que hay que mejorar y por qué, (3) si alguien del personal aparece elogiado POR SU NOMBRE en las reseñas, nómbralo, (4) una sola cosa en la que enfocarse.',
    'REGLA ABSOLUTA: los números te los doy yo ya contados. No inventes ni recalcules ninguna cifra, y no menciones cantidades que no estén en los datos que te paso.',
    'Si te digo que NINGUNA queja se repite, NO inventes un foco ni señales un problema a partir de una sola reseña: di que la semana salió limpia y felicita al equipo en una línea.',
    'Nunca informes de una ausencia. Si nadie del personal sale elogiado por su nombre, simplemente no menciones el tema — decir "no hay elogios" se lee como un reproche.',
    'Habla como se habla en un local, no como un informe: di "buenas" y "para mejorar", nunca "4-5★", "1-3★", "reseñas de 4 a 5 estrellas" ni porcentajes.',
    'No cites reseñas textualmente ni menciones a clientes por su nombre. Sin emojis, sin encabezados, sin viñetas, sin comillas. Devuelve solo el texto del mensaje.',
  ].join(' '),
  en: [
    'You write the weekly note a business owner forwards to their staff WhatsApp group.',
    'It is 3 or 4 short lines, in plain English, the tone of a manager talking to their team: direct, no blame, no corporate jargon.',
    'Structure: (1) how the week went in one line, (2) what to improve and why, (3) if a staff member is praised BY NAME in the reviews, name them, (4) one single thing to focus on.',
    'ABSOLUTE RULE: I give you the numbers already counted. Do not invent or recompute any figure, and do not mention quantities that are not in the data I pass you.',
    'If I tell you NO complaint repeats, do NOT invent a focus or flag a problem from a single review: say the week came out clean and praise the team in one line.',
    'Never report an absence. If no staff member is praised by name, simply do not mention it — saying "no one was praised" reads as blame.',
    'Talk the way people talk in a shop, not like a report: say "good" and "to improve", never "4-5 stars", "1-3 stars" or percentages.',
    'Do not quote reviews verbatim and do not name customers. No emojis, no headings, no bullets, no quotation marks. Return only the message text.',
  ].join(' '),
};

/**
 * El mensaje de usuario que acompaña al prompt: los hechos ya contados y los
 * textos. Se separa de la llamada HTTP para poder comprobarlo sin red.
 */
const mensajeParaIA = (h, negocio, idioma = 'es') => {
  const l = [];
  l.push(`Negocio: ${negocio?.nombre || ''}`);
  l.push(`Reseñas nuevas esta semana: ${h.total} — ${h.positivas} buenas, ${h.negativas} para mejorar`);
  if (h.temas.length) {
    l.push('Quejas que se repiten (ya contadas, usa estas cifras tal cual):');
    for (const t of h.temas) l.push(`- ${t.etiqueta}: ${t.veces} menciones`);
  } else {
    l.push('No hay ninguna queja que se repita esta semana.');
  }
  if (h.textosPositivos.length) {
    l.push('\nReseñas positivas (para buscar elogios al personal por su nombre):');
    // ⚠️ Sin la notación de estrellas. El modelo copiaba el «★» del listado tal
    // cual al parte —«para que sea un 5★»—, y el parte lo lee un cocinero, no un
    // analista. El origen de la fuga estaba aquí, no en el prompt.
    for (const r of h.textosPositivos.slice(0, 6)) l.push(`- ${r.texto}`);
  }
  if (h.textosNegativos.length) {
    l.push('\nReseñas a mejorar (contexto, no las cites):');
    for (const r of h.textosNegativos.slice(0, 6)) l.push(`- ${r.texto}`);
  }
  return l.join('\n');
};


// ── Saneador de la salida de la IA ───────────────────────────────────────────
//
// 🔴 Existe porque el prompt NO basta, y eso se midió. Se le pidió
// explícitamente al modelo «nunca informes de una ausencia» y «no digas 4-5★», y
// en los tres partes generados contra reseñas reales volvió a escribir «No hay
// elogios por nombre en las reseñas» y a colar «para que sea un 5★».
//
// Un modelo de 20B no cumple prohibiciones de forma fiable. Insistir en el
// prompt es discutir con un dado. Lo que sí es fiable es quitarlo después: son
// dos patrones cerrados, el costo de fallar es dejar una frase de más, y no hay
// forma de que estropee un parte correcto.
//
// ⚠️ La regla general que deja: **para que el modelo HAGA algo, el prompt; para
// que NO haga algo, código.** Un prompt es una petición; un `replace` es una
// garantía.

// Frases que informan de que NADIE fue elogiado. Se leen como reproche en un
// grupo donde está el personal, que es justo el efecto contrario al que busca
// el parte.
const FRASES_DE_AUSENCIA = [
  /[^.!?]*\bno hay (?:elogios?|menciones?)\b[^.!?]*[.!?]\s*/gi,
  /[^.!?]*\bno se mencionan? (?:elogios?|a nadie)\b[^.!?]*[.!?]\s*/gi,
  /[^.!?]*\bnadie (?:fue|resulto|resultó|sale|salio|salió)\s+(?:elogiad|mencionad|nombrad)[^.!?]*[.!?]\s*/gi,
  /[^.!?]*\bsin elogios\b[^.!?]*[.!?]\s*/gi,
  /[^.!?]*\bno (?:staff|one|team member|employee)[^.!?]*\b(?:praised|mentioned by name|named)\b[^.!?]*[.!?]\s*/gi,
  /[^.!?]*\bno praise by name\b[^.!?]*[.!?]\s*/gi,
];

/**
 * Limpia la salida del modelo. No cambia los hechos: solo quita lo que se le
 * pidió no escribir y no obedeció.
 */
const sanear = (texto) => {
  if (!texto) return texto;
  let t = texto;

  for (const re of FRASES_DE_AUSENCIA) t = t.replace(re, '');

  // Jerga de estrellas: el parte lo lee un cocinero, no un analista.
  //
  // ⚠️ El rango se quita CON su conector ("6 de 4-5★" → "6"), no solo el rango:
  // borrar únicamente "4-5★" dejaba un "de" colgando y la frase salía peor que
  // con la jerga. Una limpieza que estropea la gramática es peor que no limpiar.
  t = t.replace(/\s*\b(?:de|of)\s+\d\s*[-–a]\s*\d\s*(?:★|estrellas?|stars?)/gi, '');
  t = t.replace(/\s*\b(?:de|of)\s+\d\s+(?:a|to)\s+\d\s+(?:estrellas?|stars?)/gi, '');
  t = t.replace(/(\d)\s*★/g, '$1');

  // Quitar una frase entera deja el punto pegado a la siguiente ("mejorar.Enfócate").
  t = t.replace(/([.!?])(?=[A-ZÁÉÍÓÚÑ¡¿])/g, '$1 ');

  // Restos de la limpieza: dobles espacios, conectores huérfanos y comas sueltas.
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\s+([.,;:])/g, '$1');
  t = t.replace(/,\s*\./g, '.');
  t = t.replace(/\s+(y|and)\s+([.,])/gi, '$2');

  return t.trim();
};

/**
 * ¿Los CONTEOS del texto coinciden con los hechos? Última red antes de publicar.
 *
 * 🔴 El prompt le prohíbe inventar cifras y aun así es una petición, no una
 * garantía. Esto sí lo es: se buscan las construcciones que cuentan gente o
 * reseñas —«6 reseñas», «2 clientes mencionaron», «3 customers»— y se comprueba
 * que cada número esté entre los que le pasamos. Si no, el parte se descarta y
 * sale la plantilla.
 *
 * ⚠️ Solo mira los conteos, NO cualquier número. Una reseña puede decir «esperé
 * una hora» y que la IA lo recoja es correcto y útil; lo que no puede es decir
 * «cuatro clientes» donde fueron dos, porque eso lo desmiente un equipo de
 * quince personas que estuvo ahí.
 */
const CONTEOS = /\b(\d{1,3})\s+(?:rese(?:ñ|n)as?|clientes?|comensales?|personas?|reviews?|customers?|people)\b/gi;

const cifrasCoherentes = (texto, h) => {
  if (!texto || !h) return true;
  const permitidas = new Set([h.total, h.positivas, h.negativas, ...h.temas.map((t) => t.veces)]);
  for (const m of texto.matchAll(CONTEOS)) {
    if (!permitidas.has(Number(m[1]))) return false;
  }
  return true;
};

module.exports = {
  hechos,
  cifrasCoherentes,
  CONTEOS,
  sanear,
  FRASES_DE_AUSENCIA,
  hayAlgoQueContar,
  plantilla,
  mensajeParaIA,
  PROMPT,
  DIAS_SEMANA,
  MINIMO_RESENAS,
  UMBRAL_POSITIVA,
  UMBRAL_NEGATIVA,
};
