// Texto de una alerta en el idioma del panel.
//
// El backend guarda `descripcion` ya redactada, y siempre en español: es una
// columna de texto, no una plantilla. Con la interfaz en inglés eso dejaba
// alertas en español en medio del panel — se vio en el screencast del App Review
// de Meta.
//
// No se puede traducir lo ya guardado, así que se hace al revés: para los tipos
// que sí traen sus piezas en `detalle` (autor y texto del comentario o mención)
// la frase se compone aquí, en el idioma que toque. Para todo lo demás —y para
// las filas antiguas, anteriores a que `detalle` llevara esas piezas— se sigue
// mostrando `descripcion` tal cual, que es correcto en español y mejor que un
// hueco en blanco.
//
// Al añadir un tipo de alerta nuevo: si su texto lleva datos variables, guardar
// esos datos en `detalle` y sumar aquí su plantilla, en vez de redactar la frase
// en el worker.
// Cada plantilla declara qué piezas necesita. No es ceremonia: una reseña de 1★
// SIN TEXTO es uno de los patrones de ataque que el producto detecta, así que
// para ese tipo `texto` es opcional — pero para un comentario o una mención no
// lo es, y una fila vieja sin esas piezas tiene que caer a `descripcion` en vez
// de pintar "Comentario negativo en TikTok de undefined".
const PLANTILLAS = {
  COMENTARIO_NEGATIVO: {
    requiere: ['autor', 'texto'],
    es: (d) => `Comentario negativo en ${d.red} de ${d.autor}: “${d.texto}”`,
    en: (d) => `Negative comment on ${d.red} from ${d.autor}: “${d.texto}”`,
  },
  MENCION_NEGATIVA: {
    requiere: ['autor', 'texto'],
    es: (d) => `Nueva mención negativa en ${d.red} de ${d.autor}: “${d.texto}”`,
    en: (d) => `New negative mention on ${d.red} from ${d.autor}: “${d.texto}”`,
  },
  RESENA_MUY_NEGATIVA: {
    requiere: ['rating'],
    es: (d) => (d.texto
      ? `Nueva reseña de ${d.rating}★ de ${d.autor || 'un cliente'}: “${d.texto}”`
      : `Nueva reseña de ${d.rating}★ de ${d.autor || 'un cliente'}, sin comentario.`),
    en: (d) => (d.texto
      ? `New ${d.rating}★ review from ${d.autor || 'a customer'}: “${d.texto}”`
      : `New ${d.rating}★ review from ${d.autor || 'a customer'}, no comment.`),
  },
};

const NOMBRE_RED = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram' };

// Nombre del TIPO de alerta. La ficha del negocio pintaba el valor crudo del
// enum (`a.tipo.replace(/_/g,' ')`), que es español por definición —
// "COMENTARIO NEGATIVO" en medio de una interfaz en inglés—. La página de
// Alertas ya tenía estas etiquetas traducidas, así que se centralizan aquí en
// vez de duplicarlas.
const ETIQUETAS = {
  es: {
    PICO_RESENAS_NEGATIVAS: 'Pico de reseñas negativas',
    CAIDA_RATING: 'Caída de rating',
    CUENTAS_NUEVAS: 'Cuentas sospechosas',
    RESENA_MUY_NEGATIVA: 'Reseña crítica',
    MENCION_NEGATIVA: 'Mención negativa',
    COMENTARIO_NEGATIVO: 'Comentario negativo',
    FICHA_ALTERADA: 'Tu ficha de Google',
  },
  en: {
    PICO_RESENAS_NEGATIVAS: 'Spike of negative reviews',
    CAIDA_RATING: 'Rating drop',
    CUENTAS_NUEVAS: 'Suspicious accounts',
    RESENA_MUY_NEGATIVA: 'Critical review',
    MENCION_NEGATIVA: 'Negative mention',
    COMENTARIO_NEGATIVO: 'Negative comment',
    FICHA_ALTERADA: 'Your Google listing',
  },
};

// De reserva se devuelve el enum legible, no vacío: un tipo nuevo sin traducir
// se sigue leyendo, aunque en inglés técnico.
export const etiquetaAlerta = (tipo, idioma = 'es') =>
  ETIQUETAS[idioma]?.[tipo] || ETIQUETAS.es[tipo] || String(tipo || '').replace(/_/g, ' ');

export const textoAlerta = (alerta, idioma = 'es') => {
  const entrada = PLANTILLAS[alerta?.tipo];
  const plantilla = entrada?.[idioma];
  const d = alerta?.detalle;
  // Sin las piezas que ese tipo necesita no hay nada que componer: filas viejas
  // o tipos sin plantilla. Se muestra `descripcion`, que es correcta en español
  // y siempre mejor que un hueco en blanco.
  if (!plantilla || !d || !entrada.requiere.every((k) => d[k] !== null && d[k] !== undefined)) {
    return alerta?.descripcion || '';
  }
  return plantilla({
    red: NOMBRE_RED[d.plataforma] || d.plataforma || '',
    autor: d.autor,
    texto: d.texto,
    rating: d.rating,
  });
};
