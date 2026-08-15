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
const PLANTILLAS = {
  COMENTARIO_NEGATIVO: {
    es: (d) => `Comentario negativo en ${d.red} de ${d.autor}: “${d.texto}”`,
    en: (d) => `Negative comment on ${d.red} from ${d.autor}: “${d.texto}”`,
  },
  MENCION_NEGATIVA: {
    es: (d) => `Nueva mención negativa en ${d.red} de ${d.autor}: “${d.texto}”`,
    en: (d) => `New negative mention on ${d.red} from ${d.autor}: “${d.texto}”`,
  },
};

const NOMBRE_RED = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram' };

export const textoAlerta = (alerta, idioma = 'es') => {
  const plantilla = PLANTILLAS[alerta?.tipo]?.[idioma];
  const d = alerta?.detalle;
  // Sin las piezas no hay nada que componer: filas viejas o tipos sin plantilla.
  if (!plantilla || !d?.autor || !d?.texto) return alerta?.descripcion || '';
  return plantilla({
    red: NOMBRE_RED[d.plataforma] || d.plataforma || '',
    autor: d.autor,
    texto: d.texto,
  });
};
