// brand-shield/src/workers/resumenSemanal.worker.js
// Resumen semanal de rating/reseñas por negocio — domingo 8am hora Lima.
// Gratis: solo cifras crudas (rating actual, variación, reseñas nuevas), sin IA.
// Negocio/Franquicia: mismas cifras + insight generado con IA a partir de las
// reseñas de la semana. Franquicia con más de 1 negocio activo recibe un solo
// email consolidado en vez de uno por negocio.

const cron = require('node-cron');
const axios = require('axios');
const prisma = require('../lib/prisma');
const { puede } = require('../lib/planes');
const score = require('../lib/score');
const temas = require('../lib/temas');
const parteLib = require('../lib/parteEquipo');
const parteServicio = require('../services/parteEquipo.service');
const { enviarResumenSemanal, enviarResumenSemanalConsolidado } = require('../utils/emails');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = 'openai/gpt-oss-20b';

// Genera 1-2 frases tipo "3 personas mencionaron demora en el servicio" a partir
// de los textos de reseñas de la semana. No consume el contador `iaUsos` del
// usuario (es un envío automático, no una acción invocada por él).
// El insight lo escribe la IA, así que el idioma se le pide a ELLA: traducir la
// plantilla y dejar el insight en español produciría un correo en inglés con una
// frase suelta en español en el medio, que se lee peor que no tener insight.
//
// ⚠️ El insight se cachea en `Negocio.ultimoInsightSemanal` para el tooltip del
// panel. Queda en el idioma del dueño, que es lo correcto: el tooltip lo lee él.
const PROMPT_INSIGHT = {
  es: 'Eres un analista de reputación online para negocios en el Perú. A partir de reseñas recientes, escribes UNA sola frase corta (máximo 25 palabras) en español neutro que resuma el tema más repetido, en el estilo "3 personas mencionaron demora en el servicio". Si no hay un tema claro y repetido, responde con una frase breve sobre el tono general. Sin emojis, sin comillas, sin encabezados. Devuelve únicamente la frase.',
  en: 'You are an online reputation analyst for businesses in Peru. From recent reviews, you write ONE short sentence (25 words maximum) in plain English summarising the most repeated theme, in the style "3 people mentioned slow service". If there is no clear repeated theme, reply with a brief sentence about the overall tone. No emojis, no quotation marks, no headings. Return only the sentence.',
};

const generarInsightSemanal = async (negocio, resenas, idioma = 'es') => {
  if (!process.env.GROQ_API_KEY) return null;
  const textos = resenas.filter((r) => r.texto?.trim()).map((r) => `- ${r.rating}★: "${r.texto.slice(0, 300)}"`);
  if (textos.length === 0) return null;

  try {
    const { data } = await axios.post(GROQ_URL, {
      model: MODELO,
      temperature: 0.4,
      max_tokens: 150,
      reasoning_effort: 'low', // ver nota en ia.routes.js — evita content vacío en modelos gpt-oss
      messages: [
        {
          role: 'system',
          content: PROMPT_INSIGHT[idioma] || PROMPT_INSIGHT.es,
        },
        { role: 'user', content: `Negocio: ${negocio.nombre}\n\nReseñas de esta semana:\n${textos.join('\n')}` },
      ],
    }, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error(`[ResumenSemanal] Error generando insight para ${negocio.nombre}: ${error.message}`);
    return null;
  }
};

// Calcula cifras crudas de la semana para un negocio a partir de sus snapshots/reseñas
const calcularCifrasSemana = async (negocio, idioma = 'es') => {
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const desdeAnterior = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [ultimoSnapshot, snapshotHaceUnaSemana, resenasNuevas, resenasPrevias, todas] = await Promise.all([
    prisma.snapshot.findFirst({ where: { negocioId: negocio.id }, orderBy: { tomadoEn: 'desc' } }),
    prisma.snapshot.findFirst({ where: { negocioId: negocio.id, tomadoEn: { lte: desde } }, orderBy: { tomadoEn: 'desc' } }),
    // 🔴 `fechaResena` y `detectadaEn` NO son opcionales acá, aunque el filtro
    // del `where` ya acote la semana: `parteEquipo.hechos()` vuelve a filtrar
    // por fecha sobre los objetos que recibe, y sin esos campos hace
    // `new Date(undefined)` → NaN → descarta TODAS las reseñas. El parte saldría
    // vacío siempre, sin un solo error: el correo se manda, se entrega, y
    // sencillamente no lleva parte nunca. Es el mismo fallo que ya tuvo este
    // proyecto con `idioma` en el select de las alertas.
    prisma.resena.findMany({
      where: { negocioId: negocio.id, detectadaEn: { gte: desde } },
      select: { rating: true, texto: true, fechaResena: true, detectadaEn: true },
    }),
    // La semana ANTERIOR, solo para la tendencia de temas.
    prisma.resena.findMany({
      where: { negocioId: negocio.id, detectadaEn: { gte: desdeAnterior, lt: desde } },
      select: { rating: true, texto: true },
    }),
    // 🔴 El score se calcula sobre TODAS las reseñas captadas, no sobre las de
    // la semana: dos de sus cuatro componentes —confianza y respuesta— son el
    // estado actual del negocio entero, no lo que pasó en siete días. Con solo
    // las de la semana, un negocio sin reseñas nuevas saldría con el score de
    // un negocio recién creado.
    prisma.resena.findMany({
      where: { negocioId: negocio.id },
      select: { rating: true, esSospechosa: true, respondida: true },
    }),
  ]);

  const ratingActual = ultimoSnapshot?.ratingActual ?? negocio.googleRatingBase ?? 0;
  const ratingAnterior = snapshotHaceUnaSemana?.ratingActual ?? ratingActual;

  // El score que el catálogo anuncia en los cuatro planes. Hasta el 2026-08-25
  // solo existía si abrías la ficha de un negocio concreto en el panel: no
  // llegaba al correo, que es lo que el cliente sí lee todas las semanas.
  const puntuacion = score.calcular(ultimoSnapshot, todas);

  // La queja que más se repite esta semana, y si está creciendo respecto a la
  // anterior. Sale de un diccionario, no de la IA: cuesta cero, es explicable
  // («salió porque cuatro reseñas dicen demora») y dice bastante más que el
  // insight genérico que hoy escribe Groq.
  const dist = temas.distribucion(resenasNuevas, idioma);
  const temaTop = dist.temas.find((t) => t.veces >= 2) || null;
  // ⚠️ `tendencia` devuelve un ARRAY de temas (o null), no un tema suelto. Acá se
  // reduce al que MÁS creció, porque un correo no puede listar seis tendencias:
  // decir seis cosas es no decir ninguna, que es la misma regla por la que el
  // afiche elige un solo foco.
  //
  // El umbral de 10 puntos porcentuales no es decorativo: por debajo de eso, con
  // las pocas reseñas que capta Places en una semana, la diferencia cabe dentro
  // del ruido de una reseña más o una menos. Cantarlo como «va en aumento» sería
  // inventar una tendencia, y basta que el dueño lo compruebe una vez para que
  // deje de creerse el resto del correo.
  const SUBIDA_MINIMA_PUNTOS = 10;
  const listaTendencia = temas.tendencia(resenasNuevas, resenasPrevias, idioma);
  const tendenciaTema = (listaTendencia || [])
    .filter((t) => t.deltaPuntos >= SUBIDA_MINIMA_PUNTOS)
    .sort((a, b) => b.deltaPuntos - a.deltaPuntos)[0] || null;

  return {
    ratingActual,
    variacion: Number((ratingActual - ratingAnterior).toFixed(2)),
    resenasNuevas: resenasNuevas.length,
    score: puntuacion ? puntuacion.score : null,
    nivelScore: puntuacion ? puntuacion.nivel : null,
    tema: temaTop ? { etiqueta: temaTop.etiqueta, veces: temaTop.veces, porcentaje: temaTop.porcentaje } : null,
    tendenciaTema,
    _resenas: resenasNuevas,
  };
};

const procesarUsuario = async (usuario, negocios) => {
  const conInsight = usuario.plan !== 'GRATIS';
  const resultados = [];

  for (const negocio of negocios) {
    const cifras = await calcularCifrasSemana(negocio, usuario?.idioma || 'es');

    // ── El parte para el equipo, dentro del correo ──────────────────────────
    //
    // 🔴 Sin gastar una sola llamada a Groq, y eso NO es un atajo: es la
    // decisión que el pendiente dejaba abierta. Meter el parte en el correo
    // significa generarlo para TODOS los negocios con material cada semana, no
    // solo para los que alguien abre en el panel — o sea multiplicar la factura
    // de Groq por el número de negocios activos, todas las semanas, para
    // siempre. El techo de hoy es «una llamada por negocio y por semana SOLO si
    // alguien lo mira», que es muchísimo más barato.
    //
    // La salida: si el panel ya generó el parte de esta semana, se reutiliza tal
    // cual; si no, se redacta con `plantilla()`, que es el mismo respaldo que ya
    // entra cuando Groq devuelve 429 y que sale de los mismos hechos contados
    // por el código. El dueño recibe su parte igual; lo único que cambia es
    // quién redacta la frase.
    let parte = null;
    if (puede(usuario.plan, 'parteEquipo')) {
      const hechosParte = parteLib.hechos(cifras._resenas, usuario?.idioma || 'es');
      if (parteLib.hayAlgoQueContar(hechosParte)) {
        parte = parteServicio.estaFresco(negocio.parteEquipoFecha) && negocio.parteEquipo
          ? negocio.parteEquipo
          : parteLib.plantilla(hechosParte, negocio, usuario?.idioma || 'es');
      }
    }
    cifras.parte = parte;
    const insight = conInsight ? await generarInsightSemanal(negocio, cifras._resenas, usuario?.idioma) : null;
    resultados.push({ negocio, datos: { ...cifras, insight } });

    // Cachear el insight para el tooltip del semáforo en el dashboard (evita
    // llamar a Groq en cada carga de página)
    if (insight) {
      await prisma.negocio.update({
        where: { id: negocio.id },
        data: { ultimoInsightSemanal: insight, ultimoInsightFecha: new Date() },
      }).catch(() => {});
    }
  }

  if (puede(usuario.plan, 'resumenConsolidado') && resultados.length > 1) {
    const resumenGlobal = resultados
      .map((r) => r.datos.insight)
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
    await enviarResumenSemanalConsolidado(usuario, resultados, resumenGlobal || null);
    console.log(`[ResumenSemanal] Consolidado enviado a ${usuario.email} (${resultados.length} negocios)`);
    return;
  }

  for (const { negocio, datos } of resultados) {
    await enviarResumenSemanal(usuario, negocio, datos);
    console.log(`[ResumenSemanal] Enviado a ${usuario.email} — ${negocio.nombre}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
};

const ejecutarAhora = async () => {
  console.log('[ResumenSemanal] Ejecución iniciada...');
  const negocios = await prisma.negocio.findMany({
    where: { activo: true, resumenSemanalActivo: true },
    // `idioma` NO es opcional: el correo lo usa para elegir plantilla Y para
    // pedirle el insight a Groq en ese idioma. Sin él salía todo en español,
    // también para quien tiene el panel en inglés — ver la nota de RESUMEN en
    // utils/emails.js.
    include: { usuario: { select: { id: true, email: true, nombre: true, plan: true, idioma: true } } },
  });

  const porUsuario = {};
  for (const n of negocios) {
    (porUsuario[n.usuarioId] = porUsuario[n.usuarioId] || { usuario: n.usuario, negocios: [] }).negocios.push(n);
  }

  for (const { usuario, negocios: negociosUsuario } of Object.values(porUsuario)) {
    try {
      await procesarUsuario(usuario, negociosUsuario);
    } catch (error) {
      console.error(`[ResumenSemanal] Error con usuario ${usuario.email}: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('[ResumenSemanal] Ejecución completada.');
};

const iniciarResumenSemanal = () => {
  cron.schedule('0 8 * * 0', ejecutarAhora, { timezone: 'America/Lima' });
  console.log('[ResumenSemanal] Cron configurado: domingo 8:00 AM (hora Lima)');
};

module.exports = { iniciarResumenSemanal, ejecutarAhora };
