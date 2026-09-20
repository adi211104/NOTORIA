// brand-shield/src/services/parteEquipo.service.js
//
// Genera y cachea el parte semanal para el equipo. Es la única parte de la
// función que toca la red y la base; la lógica vive en `lib/parteEquipo.js`.
//
// ── Por qué se cachea una semana ─────────────────────────────────────────────
//
// El parte se pide desde el panel, y el panel se abre muchas veces al día. Sin
// caché, cada visita a la ficha sería una llamada a Groq por un texto que no ha
// cambiado — un costo variable por MIRAR, que es la peor forma de gastar.
//
// Con el caché el techo es **una llamada por negocio y por semana**, la mires
// una vez o cuarenta. Es el mismo patrón que `ultimoInsightSemanal`.
//
// ⚠️ Y no consume la cuota de IA del cliente (`iaUsos`). Esa cuota es para lo
// que él pide a mano —respuestas y análisis—; contarle un texto automático que
// ni siquiera solicitó le comería el cupo sin que entienda por qué.

const axios = require('axios');
const prisma = require('../lib/prisma');
const parte = require('../lib/parteEquipo');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = 'openai/gpt-oss-20b';

// Una semana. Pasado esto el parte se considera viejo y se regenera al pedirlo.
const VIGENCIA_MS = 7 * 24 * 3600 * 1000;

const estaFresco = (fecha) => !!fecha && (Date.now() - new Date(fecha).getTime()) < VIGENCIA_MS;

/**
 * Le pide a Groq que REDACTE los hechos. Devuelve `null` ante cualquier
 * problema — el que llama cae a la plantilla, así que el parte sale igual.
 */
const redactarConIA = async (hechos, negocio, idioma) => {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const { data } = await axios.post(GROQ_URL, {
      model: MODELO,
      temperature: 0.5,
      max_tokens: 220,
      // 🔴 Sin esto los modelos gpt-oss gastan todo max_tokens "pensando" y
      // devuelven content vacío con finish_reason "length". Ver §16.
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: parte.PROMPT[idioma] || parte.PROMPT.es },
        { role: 'user', content: parte.mensajeParaIA(hechos, negocio, idioma) },
      ],
    }, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    const crudo = data.choices?.[0]?.message?.content?.trim();
    if (!crudo) return null;

    // 🔴 Lo que el prompt pide y el modelo no cumple, se quita acá. Medido: pese
    // a prohibírselo, escribía «no hay elogios por nombre» y colaba «5★».
    // Para que el modelo HAGA algo, el prompt; para que NO haga algo, código.
    const texto = parte.sanear(crudo);
    if (!texto) return null;

    // ⚠️ Red de seguridad barata: si la IA devolvió algo desproporcionado, no es
    // el parte de 3-4 líneas que se pidió. Mejor la plantilla que un muro de
    // texto que nadie va a reenviar a un grupo de WhatsApp.
    if (texto.length > 700) return null;

    // 🔴 Y la que de verdad importa: si algún CONTEO no cuadra con los hechos,
    // se tira el parte entero. Prefiero la plantilla —peor escrita— antes que
    // mandarle a quince empleados una cifra sobre su propia semana que ellos
    // saben que es falsa.
    if (!parte.cifrasCoherentes(texto, hechos)) {
      console.warn(`[ParteEquipo] la IA dio una cifra que no cuadra en ${negocio.nombre}; se usa la plantilla`);
      return null;
    }

    return texto;
  } catch (error) {
    console.error(`[ParteEquipo] Groq falló para ${negocio.nombre}: ${error.message}`);
    return null;
  }
};

/**
 * El parte de un negocio, generándolo si hace falta.
 *
 * @param {object} negocio  con `id`, `nombre` y las columnas de caché
 * @param {Array}  resenas  las reseñas del negocio (se filtra la semana acá)
 * @param {string} idioma
 * @param {object} opciones `forzar` salta el caché (lo usa el cron semanal)
 * @returns {null|{texto, generadoEn, conIA, hechos}}
 */
const obtener = async (negocio, resenas, idioma = 'es', { forzar = false } = {}) => {
  const h = parte.hechos(resenas, idioma, new Date(), negocio.tipo);

  // Semana sin material: el producto se calla en vez de rellenar. Un parte que
  // dice "no pasó nada" cada lunes enseña al equipo a ignorarlo.
  if (!parte.hayAlgoQueContar(h)) return null;

  if (!forzar && negocio.parteEquipo && estaFresco(negocio.parteEquipoFecha)) {
    return { texto: negocio.parteEquipo, generadoEn: negocio.parteEquipoFecha, cacheado: true, hechos: h };
  }

  const conIA = await redactarConIA(h, negocio, idioma);
  const texto = conIA || parte.plantilla(h, negocio, idioma);
  const generadoEn = new Date();

  // El guardado no puede tumbar la respuesta: si falla, el usuario ve su parte
  // igual y el único costo es que la próxima visita lo regenere.
  try {
    await prisma.negocio.update({
      where: { id: negocio.id },
      data: { parteEquipo: texto, parteEquipoFecha: generadoEn },
    });
  } catch (e) {
    console.warn(`[ParteEquipo] no se pudo cachear para ${negocio.nombre}: ${e.message}`);
  }

  return { texto, generadoEn, cacheado: false, conIA: !!conIA, hechos: h };
};

module.exports = { obtener, redactarConIA, estaFresco, VIGENCIA_MS, MODELO };
