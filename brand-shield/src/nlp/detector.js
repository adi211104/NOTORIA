// brand-shield/src/nlp/detector.js
// Detecta patrones sospechosos en reseñas.
// Lógica de reglas puras, sin ML.

// El singleton de lib/prisma, NO un `new PrismaClient()`: este archivo abría un
// segundo pool de conexiones contra el mismo PostgreSQL sin ninguna razón, y
// Railway tiene un tope de conexiones que se alcanza antes de lo que parece.
const prisma = require('../lib/prisma');

// Palabras que disparan alerta inmediata (reseña muy negativa)
const PALABRAS_CRITICAS = [
  'intoxicado', 'intoxicación', 'enfermé', 'vómito', 'diarrea',
  'cucaracha', 'rata', 'ratón', 'insecto', 'gusano',
  'denuncia', 'indecopi', 'demanda', 'estafa', 'robo', 'ladrón',
  'cerrado', 'clausurado', 'multa', 'sanidad',
];

// ── Normalización para comparar textos ────────────────────
// Quita tildes, signos y espacios de más para que "Pésimo servicio!!" y
// "pesimo servicio" cuenten como el mismo texto. Un ataque copiado y pegado casi
// nunca es idéntico carácter a carácter: cambia una tilde, un signo o la
// mayúscula inicial.
const normalizar = (texto) => (texto || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Analiza una reseña individual y retorna si es sospechosa y por qué.
 *
 * `resenasDelNegocio` es opcional y sirve para la señal de texto duplicado: son
 * las reseñas ya guardadas de ese negocio contra las que se compara. Sin ella el
 * análisis sigue funcionando, solo que sin esa señal (así el analizador público
 * del landing, que no tiene historial, puede usar la misma función).
 */
const analizarResena = (resena, resenasDelNegocio = []) => {
  const texto = (resena.texto || '').toLowerCase();
  const sospechas = [];

  // Señal: palabras críticas de alto impacto
  const palabraEncontrada = PALABRAS_CRITICAS.find((p) => texto.includes(p));
  if (palabraEncontrada && resena.rating <= 2) {
    sospechas.push(`palabra_critica:${palabraEncontrada}`);
  }

  // Señal: cuenta nueva (muy pocas reseñas en su historial).
  //
  // ⚠️ Hoy esta señal NO se dispara nunca en producción, y conviene saberlo:
  // `autorResenasTotal` llega `null` desde los cinco sitios que producen reseñas
  // (google, facebook, google-business, tripadvisor y el analizador público),
  // porque ninguna de esas APIs devuelve el historial del autor. Se deja escrita
  // porque el día que haya una fuente que sí lo traiga, funciona sola — pero NO
  // se puede anunciar como una detección activa mientras el dato no exista.
  if (resena.autorResenasTotal !== null && resena.autorResenasTotal <= 2 && resena.rating === 1) {
    sospechas.push('cuenta_nueva');
  }

  // Señal: reseña de 1 estrella sin texto (patrón de ataque bot)
  if (resena.rating === 1 && (!resena.texto || resena.texto.trim().length < 5)) {
    sospechas.push('sin_texto');
  }

  // Señal: texto repetido o casi idéntico a otra reseña del mismo negocio.
  //
  // El FAQ del landing lleva tiempo prometiendo esta detección y no existía. Es
  // el patrón más común de las campañas compradas: el mismo mensaje pegado desde
  // varias cuentas con un cambio mínimo.
  //
  // Se exige un mínimo de 15 caracteres normalizados para no marcar coincidencias
  // vacías de contenido: "malo", "pésimo" o "no vuelvo" los escribe muchísima
  // gente de forma independiente y no prueban absolutamente nada.
  const normalizado = normalizar(resena.texto);
  if (normalizado.length >= 15 && resena.rating <= 3) {
    const gemela = resenasDelNegocio.find((otra) =>
      otra.externalId !== resena.externalId && normalizar(otra.texto) === normalizado
    );
    if (gemela) sospechas.push('texto_duplicado');
  }

  return {
    esSospechosa: sospechas.length > 0,
    motivoSospecha: sospechas.length > 0 ? sospechas.join(',') : null,
  };
};

/**
 * Compara dos mediciones de la ficha y describe lo que pasó en medio.
 *
 * El problema que resuelve: Google entrega como mucho 5 reseñas por consulta, así
 * que una ráfaga de 12 reseñas negativas es invisible si solo se miran los textos.
 * Pero la ficha publica dos números en cada medición —el total de reseñas y el
 * promedio— y de ahí sí se puede sacar lo que entró en medio.
 *
 * Los dos números NO valen lo mismo, y confundirlos sería el error caro:
 *
 *   · `nuevas` (N₂ − N₁) es EXACTO. El total de reseñas es un entero que Google
 *     publica tal cual: si pasó de 212 a 220, entraron 8. Sin margen de error.
 *
 *   · el promedio de esas nuevas es una ESTIMACIÓN, y casi siempre mala. Se
 *     despeja de (R₂·N₂ − R₁·N₁) / k, pero Google redondea el rating a un
 *     decimal, así que cada producto arrastra hasta ±0.05·N de error y el margen
 *     del promedio queda en ≈ 0.05·(N₁+N₂)/k. En una ficha de 212 reseñas con 8
 *     nuevas eso es ±2.7 estrellas: el número no significa nada. Solo se vuelve
 *     utilizable cuando la ráfaga es grande frente al tamaño de la ficha
 *     (aproximadamente k ≥ 0.1·N).
 *
 * Por eso esto devuelve las dos cosas por separado y marca `promedioFiable`.
 * Quien lo use tiene que apoyarse en `nuevas` y callarse el promedio cuando no
 * sea fiable: una sola cifra inventada en una alerta desacredita a todas las
 * demás, y este producto vive de que le crean.
 */
const compararMediciones = (anterior, actual) => {
  if (!anterior || !actual) return null;
  const n1 = anterior.totalResenas, r1 = anterior.ratingActual;
  const n2 = actual.totalResenas, r2 = actual.ratingActual;
  if (!n1 || !n2) return null;

  const nuevas = n2 - n1;                       // exacto
  const caidaRating = (r1 && r2) ? r1 - r2 : 0; // diferencia entre valores publicados

  const base = { nuevas, caidaRating, promedio: null, min: null, max: null, margen: null, promedioFiable: false };
  if (nuevas <= 0 || !r1 || !r2) return base;

  const promedio = (r2 * n2 - r1 * n1) / nuevas;
  const margen = (0.05 * (n1 + n2)) / nuevas;

  // 🔴 Cuando el intervalo estimado NO TOCA el rango posible [1,5], la fórmula
  // se apoyó en algo que no pasó y no hay número que salvar.
  //
  // El despeje asume que las N₁ reseñas viejas siguen ahí y solo se sumaron k
  // nuevas. Google también BORRA reseñas —está medido: una ficha pasó de 11 a 10
  // el 31 de julio—, y si borra unas cuantas buenas mientras entran otras, el
  // total sube igual pero la aritmética queda inconsistente y el promedio
  // despejado se va fuera de la escala.
  //
  // Se descubrió el 2026-08-23 ejercitando la señal contra producción: la alerta
  // decía «Calificaron **-0.9★** de promedio como mucho». La causa era una
  // asimetría en el propio recorte —`promedio` y `min` se acotaban a un mínimo
  // de 1 y `max` solo tenía tope por arriba—, así que el techo salía por debajo
  // del suelo. Recortar `max` a 1 tampoco valía: afirmaría «como mucho 1★»
  // cuando la realidad pudo ser 4★ y solo hubo un borrado. Lo único honesto es
  // no dar cifra; el aviso sale igual, apoyado en la caída publicada, que sí es
  // un hecho observado.
  const fueraDeEscala = promedio + margen < 1 || promedio - margen > 5;
  if (fueraDeEscala) return base;

  return {
    ...base,
    promedio: Math.max(1, Math.min(5, promedio)),
    min: Math.max(1, Math.min(5, promedio - margen)),
    max: Math.max(1, Math.min(5, promedio + margen)),
    margen,
    // Con más de media estrella de margen, decir "promediaron 1.7★" es inventar.
    promedioFiable: margen <= 0.5,
  };
};

/**
 * Ritmo habitual de reseñas nuevas, en reseñas por hora, sacado del historial de
 * snapshots. Es la vara contra la que se mide si una ráfaga es anormal: 6
 * reseñas en 4 horas es una catástrofe para un negocio que recibe 2 al mes, y un
 * martes cualquiera para uno que recibe 15 a la semana.
 *
 * Se descartan los tramos con saltos negativos (Google borra reseñas y el total
 * baja) para que una limpieza de Google no rebaje artificialmente el promedio.
 */
const ritmoHabitual = (snapshots) => {
  if (!snapshots || snapshots.length < 2) return null;
  // Vienen en orden descendente por fecha; se recorren de la más vieja a la más nueva
  const orden = [...snapshots].sort((a, b) => new Date(a.tomadoEn) - new Date(b.tomadoEn));
  let resenas = 0, horas = 0;
  for (let i = 1; i < orden.length; i++) {
    const delta = orden[i].totalResenas - orden[i - 1].totalResenas;
    const h = (new Date(orden[i].tomadoEn) - new Date(orden[i - 1].tomadoEn)) / 3600000;
    if (delta < 0 || h <= 0) continue;
    resenas += delta;
    horas += h;
  }
  if (horas < 24) return null; // menos de un día de historial no es una referencia
  return resenas / horas;
};

/**
 * Detecta anomalías a nivel de negocio comparando con el histórico.
 * Retorna una lista de alertas a crear.
 */
const detectarAnomalias = async (negocioId, plataforma, datosNuevos) => {
  const alertas = [];
  const ahora = new Date();
  const hace24h = new Date(ahora - 24 * 60 * 60 * 1000);
  const hace7d = new Date(ahora - 7 * 24 * 60 * 60 * 1000);

  // ── Señal 1: Pico de reseñas negativas en 24h ────────────
  //
  // Cuenta las reseñas negativas que efectivamente se guardaron. Sigue teniendo
  // sentido, pero es una señal DÉBIL por una razón de fondo: Google entrega
  // como mucho 5 reseñas por consulta, así que un umbral de 5 negativas casi
  // nunca se alcanza aunque el ataque sea real. La señal que sí ve los ataques
  // grandes es la 4, que no depende de leer las reseñas.
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

  if (negativasHoy >= 3 && negativasHoy > promedioHistorico * 3) {
    alertas.push({
      tipo: 'PICO_RESENAS_NEGATIVAS',
      plataforma,
      descripcion: `Se detectaron ${negativasHoy} reseñas negativas en las últimas 24 horas (${Math.round(promedioHistorico * 10) / 10} es tu promedio diario habitual).`,
      detalle: { negativasHoy, promedioHistorico },
      negocioId,
    });
  }

  // Historial reciente de esta plataforma. Se pide una sola vez: las señales 2
  // y 4 usan los dos últimos, y la 4 además necesita el resto para calcular el
  // ritmo habitual del negocio.
  const ultimos = await prisma.snapshot.findMany({
    where: { negocioId, plataforma },
    orderBy: { tomadoEn: 'desc' },
    take: 60,
    select: { ratingActual: true, totalResenas: true, tomadoEn: true },
  });
  // El worker guarda el snapshot de este ciclo ANTES de llamar aquí, así que
  // `ultimos[0]` es la medición de ahora y `ultimos[1]` la anterior.
  const anterior = ultimos[1] || null;

  // ── Señal 2: Caída del rating general ────────────────────
  //
  // 🔴 Antes esto comparaba contra `googleRatingBase`, que se fija al crear el
  // negocio y NO se actualiza nunca. En cuanto el rating caía 0.3 puntos, la
  // alerta se volvía a crear en cada ciclo del worker, para siempre, con el
  // mismo texto. El cliente aprendía a ignorar los correos de Notoria, que es
  // lo peor que le puede pasar a un producto de alertas.
  //
  // Ahora se compara contra el snapshot ANTERIOR: mide la caída de este ciclo,
  // no la distancia a una foto vieja. Una caída sostenida vuelve a avisar solo
  // si vuelve a caer.
  if (anterior && datosNuevos?.ratingActual) {
    const caida = anterior.ratingActual - datosNuevos.ratingActual;
    if (caida >= 0.1) {
      alertas.push({
        tipo: 'CAIDA_RATING',
        plataforma,
        descripcion: `Tu rating bajó de ${anterior.ratingActual}★ a ${datosNuevos.ratingActual}★ (caída de ${caida.toFixed(2)} puntos desde el último control).`,
        detalle: { ratingAnterior: anterior.ratingActual, ratingActual: datosNuevos.ratingActual, desde: anterior.tomadoEn },
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

  // ── Señal 3-bis: Reseñas con el mismo texto ──────────────
  const duplicadas = await prisma.resena.count({
    where: {
      negocioId,
      plataforma,
      motivoSospecha: { contains: 'texto_duplicado' },
      detectadaEn: { gte: hace24h },
    },
  });

  if (duplicadas >= 2) {
    alertas.push({
      tipo: 'CUENTAS_NUEVAS',
      plataforma,
      descripcion: `${duplicadas} reseñas negativas de las últimas 24 horas repiten el mismo texto. Es el patrón típico de una campaña coordinada.`,
      detalle: { duplicadas },
      negocioId,
    });
  }

  // ── Señal 4: Ráfaga de reseñas fuera de lo normal ────────
  //
  // Esta es la que ve los ataques que las demás no pueden ver, y la única que NO
  // depende de leer reseñas: Google entrega 5 como máximo, así que una ráfaga de
  // 12 es literalmente invisible por texto. Acá se compara el número total de
  // reseñas entre dos mediciones —un entero exacto, sin margen de error— contra
  // el ritmo habitual de ese negocio.
  //
  // El umbral es relativo a propósito. 6 reseñas en 4 horas es una catástrofe
  // para un negocio que recibe 2 al mes y un martes cualquiera para uno que
  // recibe 15 a la semana; un umbral fijo alertaría de más al segundo y de menos
  // al primero.
  const comparacion = compararMediciones(anterior, datosNuevos ? {
    ratingActual: datosNuevos.ratingActual,
    totalResenas: datosNuevos.totalResenas,
  } : null);

  if (comparacion && comparacion.nuevas >= 3) {
    const horas = Math.max(1, (ahora - new Date(anterior.tomadoEn)) / 3600000);
    const ritmo = ritmoHabitual(ultimos.slice(1)); // sin la medición de ahora
    const esperadas = ritmo === null ? null : ritmo * horas;

    // Sin historial suficiente para saber qué es normal, se exige un volumen que
    // sea llamativo para cualquier negocio pequeño.
    const esRafaga = esperadas === null
      ? comparacion.nuevas >= 6
      : comparacion.nuevas >= Math.max(3, esperadas * 4);

    // La cota SUPERIOR del intervalo es el dato más fuerte que se puede afirmar
    // sin inventar nada: aunque el redondeo de Google juegue en nuestra contra,
    // las nuevas no pudieron haber calificado mejor que `max`. Decir "promediaron
    // como mucho 1.6★" es rigurosamente cierto incluso cuando el punto medio no
    // es fiable, y es justo la frase que el dueño necesita leer.
    const techoMalo = comparacion.max !== null && comparacion.max <= 2.5;

    // Una ráfaga de reseñas BUENAS no es una alerta, es una buena noticia. Solo
    // avisa si además el rating publicado bajó o si el techo de las nuevas es malo.
    const vaMal = comparacion.caidaRating >= 0.1 || techoMalo;

    if (esRafaga && vaMal) {
      const h = Math.round(horas);
      // Se dice el promedio exacto solo si el margen lo permite; si no, la cota
      // superior; y si tampoco, solo la caída publicada. Nunca un número inventado.
      const detalleCalificacion = comparacion.promedioFiable
        ? ` Calificaron ${comparacion.promedio.toFixed(1)}★ de promedio.`
        : techoMalo
          ? ` Calificaron ${comparacion.max.toFixed(1)}★ de promedio como mucho.`
          : (comparacion.caidaRating >= 0.1
            ? ` Tu rating publicado bajó de ${anterior.ratingActual}★ a ${datosNuevos.ratingActual}★ en ese lapso.`
            : '');

      alertas.push({
        tipo: 'PICO_RESENAS_NEGATIVAS',
        plataforma,
        descripcion: `Entraron ${comparacion.nuevas} reseñas nuevas en las últimas ${h} h${esperadas !== null ? `, cuando lo habitual en ese lapso es ${esperadas < 1 ? 'menos de 1' : Math.round(esperadas)}` : ''}.${detalleCalificacion} Google solo muestra las 5 más recientes, así que puede que en el panel no las veas todas.`,
        detalle: {
          nuevas: comparacion.nuevas,
          horas: h,
          esperadas: esperadas === null ? null : Number(esperadas.toFixed(2)),
          caidaRating: Number(comparacion.caidaRating.toFixed(2)),
          promedioEstimado: comparacion.promedioFiable ? Number(comparacion.promedio.toFixed(2)) : null,
          promedioMaximo: comparacion.max === null ? null : Number(comparacion.max.toFixed(2)),
          metodo: 'volumen_vs_ritmo',
        },
        negocioId,
      });
    }
  }

  return alertas;
};

module.exports = { analizarResena, detectarAnomalias, compararMediciones, ritmoHabitual, normalizar };
