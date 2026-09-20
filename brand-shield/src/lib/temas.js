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

// ── Los temas, y a qué rubros aplica cada uno ────────────────────────────────
//
// 🔴 Hasta el 2026-09-20 los seis temas eran vocabulario de comida, y el
// diccionario se le aplicaba igual a TODOS los negocios. El modo de fallo era el
// peor de los que persigue este proyecto: mudo. Un tema exige 2 menciones, así
// que a una peluquería no le salía ninguno — `masRepetido` devolvía null, el
// afiche perdía su línea de foco y la tarjeta del panel no se renderizaba. El
// cliente no ve un error: ve una sección vacía y concluye que en su negocio no
// pasa nada. Medido ese día en producción: de 8 fichas activas, **2 son
// PELUQUERIA y el diccionario les devolvía cero temas** mientras cada
// restaurante devolvía al menos uno.
//
// ⚠️ `rubros: null` = universal. Los cuatro universales (demora, trato, limpieza,
// precio) valen en cualquier negocio, y son los únicos que recibe un rubro sin
// vocabulario propio — que es mejor que ofrecerle «comida fría» a un gimnasio.
//
// 🔑 **Las palabras salieron de LEER reseñas reales de cada rubro en Google, no
// de inventarlas.** Es la única forma de que esto sirva: un diccionario escrito
// de memoria acierta las palabras obvias y pierde las que la gente usa de verdad
// —«no quedó como pedí», «me quemaron el cabello», «no me dejaron entrar»—, que
// son justamente las que más se repiten. Al añadir un rubro nuevo, repetir el
// método: leer reseñas de ≤3★ de ese rubro, no adivinar.
const TEMAS = [
  // ── Universales ───────────────────────────────────────────────────────────
  {
    id: 'demora',
    rubros: null,
    es: 'la demora en la atención', en: 'slow service',
    // Etiqueta corta, para una tabla o un gráfico. La larga es para meterla en
    // una frase ("la queja que más se repite: la demora en la atención").
    cortoEs: 'Demora', cortoEn: 'Delays',
    palabras: ['demor', 'lento', 'lenta', 'espera', 'tardan', 'tardó', 'tarde', 'media hora', 'una hora'],
  },
  {
    id: 'trato',
    rubros: null,
    es: 'el trato del personal', en: 'staff attitude',
    cortoEs: 'Trato', cortoEn: 'Attitude',
    palabras: ['maleducad', 'grosero', 'grosera', 'antipát', 'mal trato', 'malcriad', 'ignoraron', 'ni saludan'],
  },
  {
    id: 'limpieza',
    rubros: null,
    es: 'la limpieza', en: 'cleanliness',
    cortoEs: 'Limpieza', cortoEn: 'Cleanliness',
    palabras: ['sucio', 'sucia', 'mugre', 'asquero', 'baño', 'cucaracha', 'mosca'],
  },
  {
    id: 'precio',
    rubros: null,
    es: 'el precio frente a lo que se recibe', en: 'value for money',
    cortoEs: 'Precio', cortoEn: 'Price',
    palabras: ['caro', 'cara', 'precio', 'no vale', 'estafa', 'cobrar de más', 'cobraron de más'],
  },

  // ── Comida ────────────────────────────────────────────────────────────────
  {
    id: 'temperatura',
    rubros: ['RESTAURANTE', 'CAFETERIA', 'BAR'],
    es: 'la temperatura o el punto de la comida', en: 'food temperature or doneness',
    cortoEs: 'Comida fría', cortoEn: 'Cold food',
    // 🔴 `'fría'` faltaba desde que existe el diccionario, y es la forma MÁS
    // común de la queja que da nombre al tema: estaban `'frio'`, `'frío'`,
    // `'fria'` y `'frías'`, o sea todas menos el singular con tilde. «la comida
    // llegó fría» no levantaba el tema. Lo cazó probar el diccionario contra
    // frases reales en vez de leerlo — a ojo las cuatro variantes parecen
    // cubrirlo todo.
    palabras: ['frío', 'fría', 'fria', 'frías', 'frios', 'frio', 'quemad', 'crudo', 'cruda', 'recalentad'],
  },
  {
    id: 'porcion',
    rubros: ['RESTAURANTE', 'CAFETERIA', 'BAR'],
    es: 'la porción o la cantidad', en: 'portion size',
    cortoEs: 'Porción', cortoEn: 'Portions',
    palabras: ['poca cantidad', 'porción', 'porcion', 'pequeñ', 'escaso'],
  },

  // ── Peluquería, barbería y spa ────────────────────────────────────────────
  //
  // Leídas en reseñas reales de salones y barberías de Lima (2026-09-20). Es el
  // rubro donde más claro se ve que el vocabulario NO se puede inventar: la
  // queja dominante no es «mal servicio» ni «mala atención», es **«no quedó como
  // pedí»** — una frase que ningún diccionario escrito de memoria incluiría.
  {
    id: 'resultado',
    rubros: ['PELUQUERIA', 'SPA'],
    es: 'el resultado del servicio', en: 'the result of the service',
    cortoEs: 'Resultado', cortoEn: 'Result',
    palabras: [
      'no quedó como', 'no quedo como', 'no era lo que ped', 'en ningún momento ped',
      'ni siquiera ped', 'nunca ped', 'dispare', 'mal corte', 'corte mal', 'peor corte',
      'mal hecho', 'tuve que ir a otro', 'no me gustó como qued', 'no me gusto como qued',
    ],
  },
  {
    id: 'dano',
    rubros: ['PELUQUERIA', 'SPA'],
    es: 'el daño al cabello o a la piel', en: 'damage to hair or skin',
    cortoEs: 'Daño', cortoEn: 'Damage',
    palabras: [
      'me quemaron', 'quemaron el cabello', 'quemaron el pelo', 'me quemó', 'me quemo',
      'se me cayó el pelo', 'se me cayo el pelo', 'maltratad', 'reseco', 'seco al tacto',
      'me irrit', 'alergia',
    ],
  },
  {
    id: 'cita',
    rubros: ['PELUQUERIA', 'SPA', 'CLINICA'],
    es: 'el cumplimiento de la cita', en: 'appointment reliability',
    cortoEs: 'Citas', cortoEn: 'Appointments',
    palabras: [
      'mi cita', 'la cita', 'sin avisar', 'no avisaron', 'reprogram', 'me cancelaron',
      'habíamos quedado', 'habiamos quedado', 'nadie llegó', 'nadie llego',
    ],
  },

  // ── Bar y discoteca ───────────────────────────────────────────────────────
  //
  // Mismo método, en bares y discotecas de Lima. Acá la sorpresa fue que el
  // ingreso —la cola, el cover, la lista, el código QR, «no me dejaron entrar»—
  // pesa tanto como lo que pasa adentro, y no tenía ni una palabra en el
  // diccionario viejo.
  {
    id: 'musica',
    rubros: ['BAR'],
    es: 'la música o el sonido', en: 'music or sound',
    cortoEs: 'Música', cortoEn: 'Music',
    palabras: ['la música', 'la musica', 'el dj', 'las mezclas', 'el sonido', 'muy fuerte', 'ruidosa', 'volumen'],
  },
  {
    id: 'acceso',
    rubros: ['BAR'],
    es: 'el ingreso al local', en: 'entry to the venue',
    cortoEs: 'Ingreso', cortoEn: 'Entry',
    palabras: [
      'no me dejaron entrar', 'no dejaron entrar', 'no nos dejaron', 'no permitieron el ingreso',
      'no me dejaron ingresar', 'hacer cola', 'la cola', 'cover', 'código qr', 'codigo qr',
    ],
  },
  {
    id: 'seguridad',
    rubros: ['BAR'],
    es: 'la seguridad dentro del local', en: 'safety inside the venue',
    cortoEs: 'Seguridad', cortoEn: 'Safety',
    palabras: ['me robaron', 'nos robaron', 'robaron el celular', 'pelea', 'agredieron', 'me golpe'],
  },
  {
    id: 'tragos',
    rubros: ['BAR'],
    es: 'la preparación de los tragos', en: 'drink quality',
    cortoEs: 'Tragos', cortoEn: 'Drinks',
    palabras: ['los cócteles', 'los cocteles', 'el trago', 'los tragos', 'aguad', 'mal preparad'],
  },

  // ── Hotel ─────────────────────────────────────────────────────────────────
  //
  // El rubro que llevaba más tiempo sin vocabulario propio: «restaurantes y
  // hoteles» fue la definición del producto durante meses y el diccionario no
  // tenía una sola palabra de hotel.
  {
    id: 'descanso',
    rubros: ['HOTEL'],
    es: 'el ruido y el descanso', en: 'noise and rest',
    cortoEs: 'Ruido', cortoEn: 'Noise',
    palabras: ['ruido', 'bulla', 'no dejaron descansar', 'se escucha todo', 'ruidoso', 'no pude dormir'],
  },
  {
    id: 'habitacion',
    rubros: ['HOTEL'],
    es: 'el estado de la habitación', en: 'room condition',
    cortoEs: 'Habitación', cortoEn: 'Room',
    palabras: [
      'la habitación', 'la habitacion', 'el cuarto', 'la cama', 'las camas',
      'chinches', 'sábanas', 'sabanas', 'colchón', 'colchon',
    ],
  },
  {
    id: 'servicios',
    rubros: ['HOTEL'],
    es: 'los servicios del hotel', en: 'hotel amenities',
    cortoEs: 'Servicios', cortoEn: 'Amenities',
    palabras: ['agua caliente', 'wifi', 'wi-fi', 'aire acondicionado', 'ascensor', 'no funciona', 'no sirve'],
  },
  {
    id: 'reserva',
    rubros: ['HOTEL'],
    es: 'la reserva y el check-in', en: 'booking and check-in',
    cortoEs: 'Reserva', cortoEn: 'Booking',
    palabras: ['check in', 'check-in', 'checkin', 'check out', 'check-out', 'la reserva', 'mi reserva'],
  },
];

/**
 * Los temas que se le aplican a un rubro.
 *
 * ⚠️ Sin `tipo` devuelve TODOS, que es exactamente el comportamiento anterior a
 * los rubros. Es deliberado: un call-site que olvide pasarlo se comporta como
 * antes y NO pierde temas — su fallo sería añadir ruido, no silencio, y el
 * silencio es el que nadie detecta. Que los seis call-sites lo pasen de verdad
 * lo vigila `prueba-temas.js` leyendo el fuente, no este archivo.
 */
const temasDeRubro = (tipo) => {
  if (!tipo) return TEMAS;
  return TEMAS.filter((t) => !t.rubros || t.rubros.includes(tipo));
};

// Con una sola mención no es "lo que más se repite", es una opinión suelta.
// Subirlo a 2 fue lo que hizo utilizable el afiche, y vale igual acá.
const MINIMO_MENCIONES = 2;

const etiqueta = (tema, idioma = 'es') => (idioma === 'en' ? tema.en : tema.es);
const etiquetaCorta = (tema, idioma = 'es') => (idioma === 'en' ? tema.cortoEn : tema.cortoEs);

/** Los temas que menciona un texto suelto. Uno puede tocar varios. */
const temasDe = (texto, tipo = null) => {
  const t = (texto || '').toLowerCase();
  if (!t) return [];
  return temasDeRubro(tipo).filter((tema) => tema.palabras.some((p) => t.includes(p)));
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
const distribucion = (resenas = [], idioma = 'es', tipo = null) => {
  const conTexto = resenas.filter((r) => (r.texto || '').trim());
  const conteo = new Map();

  for (const r of conTexto) {
    for (const tema of temasDe(r.texto, tipo)) {
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
const masRepetido = (resenas = [], idioma = 'es', tipo = null) => {
  const d = distribucion(resenas, idioma, tipo);
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

const tendencia = (actuales = [], previas = [], idioma = 'es', tipo = null) => {
  const a = distribucion(actuales, idioma, tipo);
  const p = distribucion(previas, idioma, tipo);
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
  temasDeRubro,
  MINIMO_MENCIONES,
  MINIMO_COMPARABLE,
  temasDe,
  distribucion,
  masRepetido,
  tendencia,
  etiqueta,
  etiquetaCorta,
};
