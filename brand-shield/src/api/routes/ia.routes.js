// brand-shield/src/api/routes/ia.routes.js
// Respuestas a reseñas generadas con IA (Groq) con límite semanal por plan

const express = require('express');
const axios = require('axios');
const prisma = require('../../lib/prisma');
const { autenticar } = require('../middlewares/auth.middleware');
const { verificarPlan } = require('../middlewares/verificarPlan.middleware');
const { obtenerResenasGoogle } = require('../../scrapers/google.scraper');

const router = express.Router();
router.use(autenticar);

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq decomisiona llama-3.1-8b-instant el 16 ago 2026 (aviso del 17 jun 2026).
// openai/gpt-oss-20b es el reemplazo recomendado por Groq: mismo segmento de
// costo/velocidad (pensado para respuestas cortas guiadas por prompt), por lo
// que basta para esta ruta sin ajustar límites ni prompts.
const MODELO = 'openai/gpt-oss-20b';

// Respuestas con IA por semana según plan
const LIMITES_IA = {
  GRATIS: 5,
  NEGOCIO: 100,
  FRANQUICIA: 300,
};

// Clave estable de la semana en curso: fecha (UTC) del lunes de esa semana
const semanaActual = () => {
  const d = new Date();
  const dia = d.getUTCDay(); // 0=domingo..6=sábado
  const diffALunes = (dia + 6) % 7;
  const lunes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffALunes));
  return lunes.toISOString().slice(0, 10);
};

// Devuelve los usos de la semana vigente, reiniciando el contador si cambió la semana
const obtenerUsos = async (usuarioId) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { plan: true, iaUsos: true, iaSemana: true },
  });
  const semana = semanaActual();
  if (usuario.iaSemana !== semana) {
    await prisma.usuario.update({ where: { id: usuarioId }, data: { iaUsos: 0, iaSemana: semana } });
    return { plan: usuario.plan, usados: 0, limite: LIMITES_IA[usuario.plan] ?? 5 };
  }
  return { plan: usuario.plan, usados: usuario.iaUsos, limite: LIMITES_IA[usuario.plan] ?? 5 };
};

// ── GET /api/ia/estado ────────────────────────────────────
router.get('/estado', async (req, res, next) => {
  try {
    const { plan, usados, limite } = await obtenerUsos(req.usuario.id);
    res.json({ plan, usados, limite, restantes: Math.max(0, limite - usados) });
  } catch (error) { next(error); }
});

// ── POST /api/ia/respuesta ────────────────────────────────
router.post('/respuesta', async (req, res, next) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'IA no configurada. Agrega GROQ_API_KEY al .env del backend.' });
    }

    const { negocioId, autor, rating, texto } = req.body;
    if (!negocioId || !rating) return res.status(400).json({ error: 'negocioId y rating son requeridos' });

    const negocio = await prisma.negocio.findFirst({
      where: { id: negocioId, usuarioId: req.usuario.id },
      select: { nombre: true, tipo: true },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { usados, limite, plan } = await obtenerUsos(req.usuario.id);
    if (usados >= limite) {
      return res.status(403).json({
        error: plan === 'GRATIS'
          ? `Usaste tus ${limite} respuestas con IA de la semana. El Plan Negocio incluye ${LIMITES_IA.NEGOCIO} a la semana.`
          : `Alcanzaste el límite de ${limite} respuestas con IA esta semana.`,
        accion: 'ACTUALIZAR_PLAN',
        usados, limite,
      });
    }

    const tipoTexto = negocio.tipo === 'HOTEL' ? 'hotel' : 'restaurante';
    const tono = rating <= 2 ? 'empática y orientada a resolver el problema'
               : rating === 3 ? 'agradecida y con compromiso de mejora'
               : 'cálida y agradecida';

    const { data } = await axios.post(GROQ_URL, {
      model: MODELO,
      temperature: 0.7,
      max_tokens: 300,
      // gpt-oss es un modelo "razonador": sin bajar el esfuerzo, gasta todo
      // max_tokens pensando y devuelve message.content vacío (finish_reason
      // "length"). 'low' alcanza para una respuesta corta guiada por prompt.
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: `Eres el dueño de "${negocio.nombre}", un ${tipoTexto} en Latinoamérica. Redactas respuestas públicas a reseñas de Google Maps en español neutro. Reglas estrictas: respuesta de 50 a 100 palabras, tono profesional y ${tono}, sin emojis, sin hashtags, sin inventar hechos ni detalles que no estén en la reseña, sin prometer compensaciones específicas (solo invitar a contactar al negocio si aplica), sin repetir la reseña. Devuelve ÚNICAMENTE el texto de la respuesta, sin comillas ni encabezados.`,
        },
        {
          role: 'user',
          content: `Reseña de ${autor || 'un cliente'} (${rating} de 5 estrellas):\n"${(texto || 'Sin texto, solo dejó la calificación.').slice(0, 1200)}"`,
        },
      ],
    }, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const respuesta = data.choices?.[0]?.message?.content?.trim();
    if (!respuesta) return res.status(502).json({ error: 'La IA no devolvió una respuesta. Intenta de nuevo.' });

    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { iaUsos: { increment: 1 }, iaSemana: semanaActual() },
    });

    res.json({ respuesta, usados: usados + 1, limite, restantes: Math.max(0, limite - usados - 1) });
  } catch (error) {
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'El servicio de IA está saturado. Espera un minuto e intenta de nuevo.' });
    }
    if (error.response?.status === 401) {
      return res.status(500).json({ error: 'La clave de Groq es inválida o expiró. Revisa GROQ_API_KEY en el .env.' });
    }
    next(error);
  }
});

// ── POST /api/ia/analisis-competidor ──────────────────────
// Analiza las reseñas públicas recientes de un competidor y genera
// recomendaciones para tomar la delantera. Consume 1 uso de IA.
// Solo planes de pago: en Gratis la comparación con competencia se queda en
// el dato básico (rating y nº de reseñas, sin costo), sin el análisis de IA.
router.post('/analisis-competidor', verificarPlan(['NEGOCIO', 'FRANQUICIA']), async (req, res, next) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'IA no configurada. Agrega GROQ_API_KEY al .env del backend.' });
    }

    const { negocioId, competidorId } = req.body;
    if (!negocioId || !competidorId) return res.status(400).json({ error: 'negocioId y competidorId son requeridos' });

    const negocio = await prisma.negocio.findFirst({
      where: { id: negocioId, usuarioId: req.usuario.id },
      include: { snapshots: { orderBy: { tomadoEn: 'desc' }, take: 1 } },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const competidor = await prisma.competidor.findFirst({
      where: { id: competidorId, negocioId },
    });
    if (!competidor) return res.status(404).json({ error: 'Competidor no encontrado' });

    const { usados, limite } = await obtenerUsos(req.usuario.id);
    if (usados >= limite) {
      return res.status(403).json({
        error: `Alcanzaste el límite de ${limite} usos de IA esta semana.`,
        accion: 'ACTUALIZAR_PLAN',
        usados, limite,
      });
    }

    // Reseñas públicas recientes del competidor (máx. 5, límite de Google)
    const datos = await obtenerResenasGoogle(competidor.googlePlaceId);
    if (!datos) return res.status(502).json({ error: 'No se pudieron obtener las reseñas del competidor desde Google.' });

    const resenasTexto = (datos.resenas || [])
      .map(r => `- ${r.rating}★ (${r.autorNombre}): "${(r.texto || 'sin texto').slice(0, 350)}"`)
      .join('\n') || '(Google no devolvió reseñas con texto para este negocio)';

    const snap = negocio.snapshots?.[0];
    const tipoTexto = negocio.tipo === 'HOTEL' ? 'hoteles' : 'restaurantes';

    const { data } = await axios.post(GROQ_URL, {
      model: MODELO,
      temperature: 0.5,
      max_tokens: 700,
      reasoning_effort: 'low', // ver nota en /respuesta — evita content vacío por agotar tokens en razonamiento oculto
      messages: [
        {
          role: 'system',
          content: `Eres un consultor de reputación online para ${tipoTexto} en Latinoamérica. Analizas la información pública de un competidor y das recomendaciones accionables al dueño de un negocio. Responde en español neutro, sin emojis, sin inventar datos que no estén en las reseñas. Estructura tu respuesta EXACTAMENTE con estos 4 encabezados en líneas propias:\nFORTALEZAS DEL COMPETIDOR:\nDEBILIDADES DEL COMPETIDOR:\nQUEJAS FRECUENTES DE SUS CLIENTES:\nCOMO TOMAR LA DELANTERA:\nBajo cada encabezado escribe de 2 a 4 viñetas que empiecen con "- ". En la última sección, da acciones concretas y específicas que el dueño pueda ejecutar esta semana aprovechando las debilidades detectadas. Si las reseñas disponibles son pocas, dilo y basa el análisis en lo que haya (rating, volumen).`,
        },
        {
          role: 'user',
          content: `MI NEGOCIO: "${negocio.nombre}" — rating ${snap?.ratingActual ?? 'desconocido'}★ con ${snap?.totalResenas ?? '?'} reseñas.\n\nCOMPETIDOR: "${competidor.nombre}" — rating ${datos.ratingActual}★ con ${datos.totalResenas} reseñas.\n\nRESEÑAS RECIENTES DEL COMPETIDOR:\n${resenasTexto}`,
        },
      ],
    }, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 45000,
    });

    const analisis = data.choices?.[0]?.message?.content?.trim();
    if (!analisis) return res.status(502).json({ error: 'La IA no devolvió el análisis. Intenta de nuevo.' });

    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { iaUsos: { increment: 1 }, iaSemana: semanaActual() },
    });

    res.json({
      analisis,
      competidor: { nombre: competidor.nombre, rating: datos.ratingActual, totalResenas: datos.totalResenas },
      usados: usados + 1, limite, restantes: Math.max(0, limite - usados - 1),
    });
  } catch (error) {
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'El servicio de IA está saturado. Espera un minuto e intenta de nuevo.' });
    }
    next(error);
  }
});

module.exports = router;
