// brand-shield/src/workers/resumenSemanal.worker.js
// Resumen semanal de rating/reseñas por negocio — domingo 8am hora Lima.
// Gratis: solo cifras crudas (rating actual, variación, reseñas nuevas), sin IA.
// Negocio/Franquicia: mismas cifras + insight generado con IA a partir de las
// reseñas de la semana. Franquicia con más de 1 negocio activo recibe un solo
// email consolidado en vez de uno por negocio.

const cron = require('node-cron');
const axios = require('axios');
const prisma = require('../lib/prisma');
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
  es: 'Eres un analista de reputación online para negocios en Latinoamérica. A partir de reseñas recientes, escribes UNA sola frase corta (máximo 25 palabras) en español neutro que resuma el tema más repetido, en el estilo "3 personas mencionaron demora en el servicio". Si no hay un tema claro y repetido, responde con una frase breve sobre el tono general. Sin emojis, sin comillas, sin encabezados. Devuelve únicamente la frase.',
  en: 'You are an online reputation analyst for businesses in Latin America. From recent reviews, you write ONE short sentence (25 words maximum) in plain English summarising the most repeated theme, in the style "3 people mentioned slow service". If there is no clear repeated theme, reply with a brief sentence about the overall tone. No emojis, no quotation marks, no headings. Return only the sentence.',
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
const calcularCifrasSemana = async (negocio) => {
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [ultimoSnapshot, snapshotHaceUnaSemana, resenasNuevas] = await Promise.all([
    prisma.snapshot.findFirst({ where: { negocioId: negocio.id }, orderBy: { tomadoEn: 'desc' } }),
    prisma.snapshot.findFirst({ where: { negocioId: negocio.id, tomadoEn: { lte: desde } }, orderBy: { tomadoEn: 'desc' } }),
    prisma.resena.findMany({ where: { negocioId: negocio.id, detectadaEn: { gte: desde } }, select: { rating: true, texto: true } }),
  ]);

  const ratingActual = ultimoSnapshot?.ratingActual ?? negocio.googleRatingBase ?? 0;
  const ratingAnterior = snapshotHaceUnaSemana?.ratingActual ?? ratingActual;

  return {
    ratingActual,
    variacion: Number((ratingActual - ratingAnterior).toFixed(2)),
    resenasNuevas: resenasNuevas.length,
    _resenas: resenasNuevas,
  };
};

const procesarUsuario = async (usuario, negocios) => {
  const conInsight = usuario.plan !== 'GRATIS';
  const resultados = [];

  for (const negocio of negocios) {
    const cifras = await calcularCifrasSemana(negocio);
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

  if (usuario.plan === 'FRANQUICIA' && resultados.length > 1) {
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
