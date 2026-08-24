// brand-shield/src/lib/temas.js
//
// De qué se queja la gente. Diccionario, no modelo, y puro: sin red y sin base.
//
// ── Por qué vive acá y no donde vivía ────────────────────────────────────────
//
// Este diccionario existía desde el afiche de la pared, enterrado dentro de
// `utils/afiche.generator.js`. Es decir: Notoria ya sabía decir «cuatro reseñas
// mencionan demora», pero solo lo decía dentro de un PDF que hay que imprimir.
// En el panel —donde el dueño mira todos los días— no aparecía por ningún lado.
//
// Sacarlo acá no es reordenar archivos: convierte una función escondida en la
// respuesta a la pregunta que un dueño de restaurante hace de verdad, que no es
// «¿cuál es mi rating?» sino «¿qué estoy haciendo mal?».
//
// ── Por qué diccionario y no IA ──────────────────────────────────────────────
//
// Dos motivos, y los dos siguen valiendo:
//   1. Tiene que ser EXPLICABLE. «Salió porque estas cuatro reseñas dicen
//      demora» — con las reseñas a la vista. Un tema que la IA infiere y no se
//      puede señalar con el dedo no se puede accionar ni discutir.
//   2. Se recalcula en cada carga del panel y en cada afiche. Una llamada a Groq
//      por vista sería un costo variable por algo que una lista resuelve.
//
// ⚠️ Cada tema lleva `id` estable, y las etiquetas van en `es`/`en`. Antes solo
// había una clave en español, así que un afiche en inglés decía «The most
// repeated complaint: la demora en la atención» — el mismo fallo de idioma que
// ya mordió en las invitaciones de equipo y en los correos de alerta.

const TEMAS = [
  {
    id: 'demora',
    es: 'la demora en la atención', en: 'slow service',
    // Etiqueta corta, para una tabla o un gráfico. La larga es para meterla en
    // una frase ("la queja que más se repite: la demora en la atención").
    cortoEs: 'Demora', cortoEn: 'Delays',
    palabras: ['demor', 'lento', 'lenta', 'espera', 'tardan', 'tardó', 'tarde', 'media hora', 'una hora'],
  },
  {
    id: 'trato',
    es: 'el trato del personal', en: 'staff attitude',
    cortoEs: 'Trato', cortoEn: 'Attitude',
    palabras: ['maleducad', 'grosero', 'grosera', 'antipát', 'mal trato', 'malcriad', 'ignoraron', 'ni saludan'],
  },
  {
    id: 'temperatura',
    es: 'la temperatura o el punto de la comida', en: 'food temperature or doneness',
    cortoEs: 'Comida fría', cortoEn: 'Cold food',
    palabras: ['frío', 'fria', 'frías', 'frio', 'quemad', 'crudo', 'cruda', 'recalentad'],
  },
  {
    id: 'limpieza',
    es: 'la limpieza', en: 'cleanliness',
    cortoEs: 'Limpieza', cortoEn: 'Cleanliness',
    palabras: ['sucio', 'sucia', 'mugre', 'asquero', 'baño', 'cucaracha', 'mosca'],
  },
  {
    id: 'precio',
    es: 'el precio frente a lo que se recibe', en: 'value for money',
    cortoEs: 'Precio', cortoEn: 'Price',
    palabras: ['caro', 'cara', 'precio', 'no vale', 'estafa', 'porción pequeñ', 'porcion pequeñ'],
  },
  {
    id: 'porcion',
    es: 'la porción o la cantidad', en: 'portion size',
    cortoEs: 'Porción', cortoEn: 'Portions',
    palabras: ['poca cantidad', 'porción', 'porcion', 'pequeñ', 'escaso'],
  },
];

// Con una sola mención no es "lo que más se repite", es una opinión suelta.
// Subirlo a 2 fue lo que hizo utilizable el afiche, y vale igual acá.
const MINIMO_MENCIONES = 2;

const etiqueta = (tema, idioma = 'es') => (idioma === 'en' ? tema.en : tema.es);
const etiquetaCorta = (tema, idioma = 'es') => (idioma === 'en' ? tema.cortoEn : tema.cortoEs);

/** Los temas que menciona un texto suelto. Uno puede tocar varios. */
const temasDe = (texto) => {
  const t = (texto || '').toLowerCase();
  if (!t) return [];
  return TEMAS.filter((tema) => tema.palabras.some((p) => t.includes(p)));
};

/**
 * Conteo por tema sobre un conjunto de reseñas.
 *
 * ⚠️ `porcentaje` se calcula sobre las reseñas CON TEXTO, no sobre el total.
 * Una reseña de 1★ sin comentario no puede mencionar nada, así que meterla en el
 * denominador hundiría todos los porcentajes y haría parecer que casi nadie se
 * queja de nada. `conTexto` viaja en la respuesta para que el panel pueda decir
 * sobre cuántas reseñas está hablando.
 */
const distribucion = (resenas = [], idioma = 'es') => {
  const conTexto = resenas.filter((r) => (r.texto || '').trim());
  const conteo = new Map();

  for (const r of conTexto) {
    for (const tema of temasDe(r.texto)) {
      if (!conteo.has(tema.id)) conteo.set(tema.id, { tema, veces: 0, ejemplos: [] });
      const fila = conteo.get(tema.id);
      fila.veces++;
      // Dos ejemplos bastan para justificar el tema sin engordar la respuesta.
      if (fila.ejemplos.length < 2) {
        fila.ejemplos.push({
          id: r.id || null,
          rating: r.rating ?? null,
          extracto: r.texto.trim().slice(0, 140),
        });
      }
    }
  }

  const filas = [...conteo.values()]
    .map((f) => ({
      id: f.tema.id,
      etiqueta: etiqueta(f.tema, idioma),
      etiquetaCorta: etiquetaCorta(f.tema, idioma),
      veces: f.veces,
      porcentaje: conTexto.length ? Math.round((f.veces / conTexto.length) * 100) : 0,
      ejemplos: f.ejemplos,
    }))
    .sort((a, b) => b.veces - a.veces);

  return { conTexto: conTexto.length, sinTexto: resenas.length - conTexto.length, temas: filas };
};

/**
 * El tema más repetido, o `null` si ninguno llega al mínimo.
 * Es lo que usa el afiche para elegir el foco de la semana.
 */
const masRepetido = (resenas = [], idioma = 'es') => {
  const d = distribucion(resenas, idioma);
  const primero = d.temas[0];
  return primero && primero.veces >= MINIMO_MENCIONES ? primero.etiqueta : null;
};

/**
 * Este periodo contra el anterior: qué queja está creciendo.
 *
 * 🔴 Compara PORCENTAJES, no conteos. Si el negocio pasó de 10 a 30 reseñas,
 * todas las quejas suben en número aunque el local haya mejorado: informar «la
 * demora subió de 2 a 5» le diría al dueño que empeoró cuando en proporción
 * mejoró. Lo que importa es qué fracción de quien escribe menciona cada cosa.
 *
 * ⚠️ `null` cuando alguno de los dos periodos no tiene reseñas con texto
 * suficientes. Un porcentaje sobre dos reseñas no es una tendencia, es ruido, y
 * cantarlo como «+50%» sería inventar. MINIMO_COMPARABLE es ese suelo.
 */
const MINIMO_COMPARABLE = 4;

const tendencia = (actuales = [], previas = [], idioma = 'es') => {
  const a = distribucion(actuales, idioma);
  const p = distribucion(previas, idioma);
  if (a.conTexto < MINIMO_COMPARABLE || p.conTexto < MINIMO_COMPARABLE) return null;

  const previoPorId = new Map(p.temas.map((t) => [t.id, t]));

  return a.temas.map((t) => {
    const antes = previoPorId.get(t.id);
    return {
      ...t,
      porcentajePrevio: antes ? antes.porcentaje : 0,
      deltaPuntos: t.porcentaje - (antes ? antes.porcentaje : 0),
      // "nuevo" es distinto de "creció": una queja que antes no existía merece
      // otra frase que una que pasó del 10% al 14%.
      nuevo: !antes,
    };
  });
};

module.exports = {
  TEMAS,
  MINIMO_MENCIONES,
  MINIMO_COMPARABLE,
  temasDe,
  distribucion,
  masRepetido,
  tendencia,
  etiqueta,
  etiquetaCorta,
};
