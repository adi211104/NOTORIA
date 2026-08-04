// brand-shield/src/nlp/detector.js
// Detecta patrones sospechosos en reseñas
// MVP: lógica de reglas puras, sin ML. Efectivo para el 90% de los ataques reales.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Palabras que disparan alerta inmediata (reseña muy negativa)
const PALABRAS_CRITICAS = [
  'intoxicado', 'intoxicación', 'enfermé', 'vómito', 'diarrea',
  'cucaracha', 'rata', 'ratón', 'insecto', 'gusano',
  'denuncia', 'indecopi', 'demanda', 'estafa', 'robo', 'ladrón',
  'cerrado', 'clausurado', 'multa', 'sanidad',
];

/**
 * Analiza una reseña individual y retorna si es sospechosa y por qué
 */
const analizarResena = (resena) => {
  const texto = (resena.texto || '').toLowerCase();
  const sospechas = [];

  // Señal: palabras críticas de alto impacto
  const palabraEncontrada = PALABRAS_CRITICAS.find((p) => texto.includes(p));
  if (palabraEncontrada && resena.rating <= 2) {
    sospechas.push(`palabra_critica:${palabraEncontrada}`);
  }

  // Señal: cuenta nueva (muy pocas reseñas en su historial)
  if (resena.autorResenasTotal !== null && resena.autorResenasTotal <= 2 && resena.rating === 1) {
    sospechas.push('cuenta_nueva');
  }

  // Señal: reseña de 1 estrella sin texto (patrón de ataque bot)
  if (resena.rating === 1 && (!resena.texto || resena.texto.trim().length < 5)) {
    sospechas.push('sin_texto');
  }

  return {
    esSospechosa: sospechas.length > 0,
    motivoSospecha: sospechas.length > 0 ? sospechas.join(',') : null,
  };
};

/**
 * Detecta anomalías a nivel de negocio comparando con el histórico
 * Retorna una lista de alertas a crear
 */
const detectarAnomalias = async (negocioId, plataforma, datosNuevos) => {
  const alertas = [];
  const ahora = new Date();
  const hace24h = new Date(ahora - 24 * 60 * 60 * 1000);
  const hace7d = new Date(ahora - 7 * 24 * 60 * 60 * 1000);

  // ── Señal 1: Pico de reseñas negativas en 24h ────────────
  const negativasHoy = await prisma.resena.count({
    where: {
      negocioId,
      plataforma,
      rating: { lte: 2 },
      detectadaEn: { gte: hace24h },
    },
  });

  // Promedio histórico de reseñas negativas por día (últimos 7 días)
  const negativasSemana = await prisma.resena.count({
    where: {
      negocioId,
      plataforma,
      rating: { lte: 2 },
      detectadaEn: { gte: hace7d, lt: hace24h },
    },
  });
  const promedioHistorico = negativasSemana / 6; // promedio diario de los últimos 6 días

  if (negativasHoy >= 5 && negativasHoy > promedioHistorico * 3) {
    alertas.push({
      tipo: 'PICO_RESENAS_NEGATIVAS',
      plataforma,
      descripcion: `Se detectaron ${negativasHoy} reseñas negativas en las últimas 24 horas (${Math.round(promedioHistorico * 10) / 10} es tu promedio diario habitual).`,
      detalle: { negativasHoy, promedioHistorico },
      negocioId,
    });
  }

  // ── Señal 2: Caída del rating general ────────────────────
  const negocio = await prisma.negocio.findUnique({
    where: { id: negocioId },
    select: { googleRatingBase: true },
  });

  if (negocio?.googleRatingBase && datosNuevos?.ratingActual) {
    const caida = negocio.googleRatingBase - datosNuevos.ratingActual;
    if (caida >= 0.3) {
      alertas.push({
        tipo: 'CAIDA_RATING',
        plataforma,
        descripcion: `Tu rating bajó de ${negocio.googleRatingBase}★ a ${datosNuevos.ratingActual}★ (caída de ${caida.toFixed(1)} puntos).`,
        detalle: { ratingAnterior: negocio.googleRatingBase, ratingActual: datosNuevos.ratingActual },
        negocioId,
      });
    }
  }

  // ── Señal 3: Varias cuentas nuevas en 24h ────────────────
  const cuentasNuevas = await prisma.resena.count({
    where: {
      negocioId,
      plataforma,
      esSospechosa: true,
      motivoSospecha: { contains: 'cuenta_nueva' },
      detectadaEn: { gte: hace24h },
    },
  });

  if (cuentasNuevas >= 3) {
    alertas.push({
      tipo: 'CUENTAS_NUEVAS',
      plataforma,
      descripcion: `${cuentasNuevas} reseñas negativas provienen de perfiles con muy pocas reseñas, lo que puede indicar cuentas falsas.`,
      detalle: { cuentasNuevas },
      negocioId,
    });
  }

  return alertas;
};

module.exports = { analizarResena, detectarAnomalias };
