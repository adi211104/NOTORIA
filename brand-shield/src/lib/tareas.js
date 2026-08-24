// brand-shield/src/lib/tareas.js
//
// «Para hacer hoy». Puro: recibe lo que el panel ya cargó y devuelve una lista
// ordenada de cosas accionables. Sin red, sin base, sin IA.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
//
// El panel contesta bien «¿cómo estoy?» y mal «¿qué hago?». Un dueño de
// restaurante entra, ve un score, ve unas alertas, y se va sin haber hecho nada
// — que es el patrón de abandono que el afiche de la pared ya atacaba desde
// fuera de la pantalla. Esto lo ataca desde dentro.
//
// ── Las dos reglas que lo hacen útil en vez de ruido ─────────────────────────
//
// 🔴 1. Toda tarea sale de un dato que YA existe. Nada de "revisa tu perfil" ni
//       "explora la sección de competidores": eso es relleno, y en cuanto
//       aparece relleno la lista entera deja de leerse. Si no hay nada que
//       hacer, la lista va vacía y el panel dice justamente eso.
//
// 🔴 2. Las tareas NO llevan texto redactado. Viajan como `tipo` + `datos`, y la
//       frase la compone el panel en el idioma del usuario. Es la regla que ya
//       costó un bug en las invitaciones de equipo (el backend redactaba
//       "Invitación enviada" siempre en español) y otro en los correos de alerta.

// Orden de urgencia. El número es el que ordena, y los huecos entre valores son
// a propósito: dejan sitio para intercalar una tarea nueva sin renumerar todo.
const PRIORIDAD = {
  FICHA_ALTERADA: 100,      // tu local puede estar apareciendo como cerrado
  CRITICA_VENCIDA: 90,      // reseña de ≤2★ que ya lleva más de un día sin respuesta
  CRITICA_NUEVA: 80,        // reseña de ≤2★ reciente
  NEGATIVA_SIN_RESPONDER: 60,
  COMENTARIO_SIN_RESPONDER: 50,
  TEMA_CRECIENDO: 40,
  ALERTAS_SIN_LEER: 30,
  PEDIR_RESENAS: 10,        // lo último: es lo bueno que hacer, no lo urgente
};

// Mismo corte que el Espejo y que la escalación de urgencias: por debajo de 3★
// el cliente está molesto. Marcar un 4★ sin responder sería ruido.
const UMBRAL_NEGATIVA = 3;
const UMBRAL_CRITICA = 2;

// A partir de aquí una crítica sin responder deja de ser "pendiente" y pasa a
// ser "se te está pasando". Coincide con la escalación por correo, y coincidir
// importa: si el correo dice una cosa y el panel otra, el cliente no sabe cuál
// creer.
const HORAS_PARA_VENCER = 24;

// Por debajo de esto, lo que más mueve el rating no es responder: es conseguir
// reseñas. Con pocas reseñas cada 1★ cuesta casi una décima (ver lib/rating.js).
const POCAS_RESENAS = 50;

// Una queja que sube menos que esto está dentro del ruido de muestreo.
const PUNTOS_TEMA_RELEVANTE = 10;

const horasDesde = (fecha) => {
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3600000;
};

/**
 * Construye la lista.
 *
 * @param {object} ctx
 *   negocio        { id, nombre, googlePlaceId }
 *   resenas        reseñas captadas, con { rating, respondida, detectadaEn, ... }
 *   comentarios    comentarios sociales, con { respondida, publicacionId }
 *   alertas        alertas del negocio, con { tipo, leida }
 *   snapshot       último snapshot { totalResenas }
 *   tendenciaTemas salida de lib/temas.js `tendencia()`, o null
 *
 * @returns {Array<{id,tipo,prioridad,datos}>} ordenada de más a menos urgente
 */
const construir = ({ negocio, resenas = [], comentarios = [], alertas = [], snapshot = null, tendenciaTemas = null } = {}) => {
  const tareas = [];
  const push = (tipo, datos = {}) => tareas.push({ id: `${tipo}:${negocio?.id || ''}`, tipo, prioridad: PRIORIDAD[tipo], datos });

  // ── 1. La ficha ────────────────────────────────────────────────────────────
  // Va primero siempre. Que Google muestre tu local como cerrado le cuesta al
  // dueño clientes que nunca sabrá que perdió, y no lo arregla respondiendo nada.
  const fichaTocada = alertas.filter((a) => a.tipo === 'FICHA_ALTERADA' && !a.leida);
  if (fichaTocada.length) {
    push('FICHA_ALTERADA', { cuantas: fichaTocada.length, alertaId: fichaTocada[0].id });
  }

  // ── 2. Reseñas negativas sin responder ─────────────────────────────────────
  const negativas = resenas.filter((r) => r.rating != null && r.rating <= UMBRAL_NEGATIVA && !r.respondida);
  const criticas = negativas.filter((r) => r.rating <= UMBRAL_CRITICA);

  // Se separan las vencidas de las nuevas porque son dos mensajes distintos: una
  // pide atención, la otra pide disculpas por el retraso.
  const vencidas = criticas.filter((r) => {
    const h = horasDesde(r.detectadaEn);
    return h != null && h >= HORAS_PARA_VENCER;
  });
  const recientes = criticas.filter((r) => !vencidas.includes(r));

  if (vencidas.length) {
    push('CRITICA_VENCIDA', {
      cuantas: vencidas.length,
      // Las horas de la MÁS vieja: es la que peor se ve en la ficha.
      horas: Math.floor(Math.max(...vencidas.map((r) => horasDesde(r.detectadaEn) || 0))),
      resenaId: vencidas[0].id || null,
    });
  }
  if (recientes.length) push('CRITICA_NUEVA', { cuantas: recientes.length, resenaId: recientes[0].id || null });

  // Las de 3★ van aparte de las críticas: no se cuentan dos veces.
  const tibias = negativas.filter((r) => r.rating > UMBRAL_CRITICA);
  if (tibias.length) push('NEGATIVA_SIN_RESPONDER', { cuantas: tibias.length });

  // ── 3. Comentarios en publicaciones propias ────────────────────────────────
  // ⚠️ Solo los que SE PUEDEN responder. Un comentario sin `publicacionId` es de
  // solo lectura (la ruta devuelve 422), así que ponerlo en una lista de tareas
  // sería mandar al usuario a un botón que no existe.
  const comentariosPendientes = comentarios.filter((c) => !c.respondida && c.publicacionId);
  if (comentariosPendientes.length) {
    push('COMENTARIO_SIN_RESPONDER', { cuantas: comentariosPendientes.length });
  }

  // ── 4. Una queja que está creciendo ────────────────────────────────────────
  // Esta es la única tarea que no sale de una bandeja: sale de leer el contenido.
  // Es también la única que apunta a arreglar el negocio en vez de la reputación.
  if (Array.isArray(tendenciaTemas)) {
    const subiendo = tendenciaTemas
      .filter((t) => t.deltaPuntos >= PUNTOS_TEMA_RELEVANTE)
      .sort((a, b) => b.deltaPuntos - a.deltaPuntos)[0];
    if (subiendo) {
      push('TEMA_CRECIENDO', {
        tema: subiendo.id,
        etiqueta: subiendo.etiqueta,
        porcentaje: subiendo.porcentaje,
        deltaPuntos: subiendo.deltaPuntos,
        nuevo: subiendo.nuevo,
      });
    }
  }

  // ── 5. Alertas sin leer que no sean de ficha (ya cubiertas arriba) ─────────
  const otrasSinLeer = alertas.filter((a) => !a.leida && a.tipo !== 'FICHA_ALTERADA');
  if (otrasSinLeer.length) push('ALERTAS_SIN_LEER', { cuantas: otrasSinLeer.length });

  // ── 6. Conseguir reseñas ───────────────────────────────────────────────────
  // Solo si la ficha es frágil Y no hay nada urgente. Pedirle reseñas a alguien
  // que tiene tres críticas sin contestar es el consejo equivocado: primero se
  // tapa el agujero, después se llena el balde.
  const total = snapshot?.totalResenas ?? 0;
  const hayUrgente = tareas.some((t) => t.prioridad >= PRIORIDAD.NEGATIVA_SIN_RESPONDER);
  if (negocio?.googlePlaceId && total > 0 && total < POCAS_RESENAS && !hayUrgente) {
    push('PEDIR_RESENAS', { total, faltan: POCAS_RESENAS - total });
  }

  return tareas.sort((a, b) => b.prioridad - a.prioridad);
};

/**
 * ¿Vale la pena pintar la sección? La regla de producto del proyecto es que lo
 * que no se puede entregar no se muestra: una lista de tareas vacía con un
 * título encima ocupa sitio y no dice nada. Sin tareas, el panel felicita en una
 * línea y sigue.
 */
const hayAlgoQueHacer = (tareas) => Array.isArray(tareas) && tareas.length > 0;

module.exports = {
  construir,
  hayAlgoQueHacer,
  PRIORIDAD,
  UMBRAL_NEGATIVA,
  UMBRAL_CRITICA,
  HORAS_PARA_VENCER,
  POCAS_RESENAS,
  PUNTOS_TEMA_RELEVANTE,
};
