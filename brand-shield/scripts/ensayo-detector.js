// brand-shield/scripts/ensayo-detector.js
//
// Ensayo EN VIVO de las CINCO señales del detector que nunca se habían
// ejercitado contra producción.
//
// 🔴 Por qué hacía falta. El 2026-08-23 se verificó la sexta —el aviso por
// reseña negativa— con `ensayo-alertas.js`, y quedó dicho lo que faltaba: las
// otras cinco estaban desplegadas, con pruebas unitarias y **cero
// confirmaciones en vivo**. Y esperando no llegan: en 49 días de producción el
// único movimiento de rating fue de 0.1 puntos y ninguna ráfaga ocurrió jamás.
// Un fallo en cualquiera de ellas sería exactamente el hueco del 22 — nada se
// rompe, simplemente no avisa nunca.
//
// ── Lo que este ensayo puede hacer sin tocar nada ────────────────────────────
//
// `detectarAnomalias` no escribe: DEVUELVE las alertas y es el worker quien las
// persiste. Así que las cuatro señales que salen de ahí se pueden ejercitar
// **en solo lectura** contra los snapshots reales del negocio, pasándole unos
// `datosNuevos` inventados — exactamente el mismo objeto que le pasa el worker.
//
// La quinta, `FICHA_ALTERADA`, sí crea la alerta y manda el correo ella misma,
// así que va detrás de `--aplicar` y se limpia al terminar.
//
// ── Controles negativos ──────────────────────────────────────────────────────
//
// Cada señal se prueba con su caso positivo Y con el negativo que la debe
// callar. Un verificador que solo comprueba el caso bueno no distingue
// «funciona» de «alerta siempre», y esa distinción es la mitad del valor.
//
// Uso:
//   node scripts/ensayo-detector.js              # solo lectura, no toca nada
//   node scripts/ensayo-detector.js --aplicar    # incluye lo que escribe y limpia

const { PrismaClient } = require('@prisma/client');
const { detectarAnomalias, analizarResena } = require('../src/nlp/detector');
const { revisarFichaGoogle } = require('../src/workers/monitoreo.worker');

const prisma = new PrismaClient();

// Mismo cerrojo que `ensayo-alertas.js`: los casos con escritura mandan un
// correo de verdad, y solo pueden apuntar a un negocio del dueño.
const CUENTAS_ENSAYO = ['didier@usenotoria.app', 'didierprincipe@gmail.com'];
const MARCA = `ensayo_${Date.now()}`;

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const negocioIdArg = args.includes('--negocio') ? args[args.indexOf('--negocio') + 1] : null;

let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✅ ${nombre}`); }
  else { fallidas++; console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);
const tipos = (alertas) => alertas.map((a) => a.tipo).join(', ') || '(ninguna)';

// Crea reseñas de ensayo y devuelve una función que las borra.
const conResenas = async (negocioId, filas) => {
  const creadas = [];
  for (const [i, f] of filas.entries()) {
    creadas.push(await prisma.resena.create({
      data: {
        plataforma: 'GOOGLE',
        externalId: `${MARCA}_${i}`,
        rating: f.rating,
        texto: f.texto ?? 'Reseña de ensayo interno de Notoria.',
        autorNombre: 'Ensayo Notoria',
        fechaResena: new Date(),
        esSospechosa: !!f.motivoSospecha,
        motivoSospecha: f.motivoSospecha ?? null,
        negocioId,
      },
    }));
  }
  return () => prisma.resena.deleteMany({ where: { id: { in: creadas.map((r) => r.id) } } });
};

(async () => {
  const include = { usuario: { select: { id: true, email: true, nombre: true, prefsAlertas: true, plan: true, idioma: true } } };
  const negocio = negocioIdArg
    ? await prisma.negocio.findUnique({ where: { id: negocioIdArg }, include })
    : await prisma.negocio.findFirst({
      where: { activo: true, googlePlaceId: { not: null }, usuario: { email: { in: CUENTAS_ENSAYO } } },
      include, orderBy: { creadoEn: 'asc' },
    });

  if (!negocio) throw new Error('No se encontró ningún negocio activo de una cuenta de ensayo.');
  if (!CUENTAS_ENSAYO.includes(negocio.usuario.email)) {
    throw new Error(`NEGADO: "${negocio.nombre}" es de ${negocio.usuario.email}, que no es cuenta de ensayo.`);
  }

  // El detector compara contra `ultimos[1]`, porque en el worker `ultimos[0]` es
  // el snapshot que acaba de crear el ciclo. Acá no se crea ninguno, así que la
  // referencia contra la que se comparará es la segunda medición más reciente:
  // los `datosNuevos` inventados se construyen a partir de ELLA, no de la última.
  const ultimos = await prisma.snapshot.findMany({
    where: { negocioId: negocio.id, plataforma: 'GOOGLE' },
    orderBy: { tomadoEn: 'desc' }, take: 2,
    select: { ratingActual: true, totalResenas: true, tomadoEn: true },
  });
  const base = ultimos[1];

  console.log('═══ ENSAYO DEL DETECTOR ═══\n');
  console.log(`Negocio  : ${negocio.nombre} (${negocio.id})`);
  console.log(`Cuenta   : ${negocio.usuario.email} · ${negocio.usuario.plan} · idioma ${negocio.usuario.idioma}`);
  console.log(`Modo     : ${aplicar ? '🔴 APLICAR — los casos con escritura también corren' : 'solo lectura (los que escriben se saltan)'}`);
  if (!base) throw new Error('El negocio no tiene dos snapshots: sin referencia anterior no hay nada que comparar.');
  console.log(`Referencia: ${base.ratingActual}★ · ${base.totalResenas} reseñas · ${base.tomadoEn.toISOString().slice(0, 16)}\n`);

  const nuevos = (extra = {}) => ({ ratingActual: base.ratingActual, totalResenas: base.totalResenas, ...extra });

  // ── 1. Caída de rating (solo lectura) ───────────────────
  bloque('1. CAIDA_RATING — compara contra la medición anterior');

  let a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos({ ratingActual: Number((base.ratingActual - 0.3).toFixed(1)) }));
  check('una caída de 0.3 puntos la levanta', a.some((x) => x.tipo === 'CAIDA_RATING'), tipos(a));
  const caida = a.find((x) => x.tipo === 'CAIDA_RATING');
  if (caida) console.log(`     «${caida.descripcion}»`);

  a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos());
  check('el rating quieto NO la levanta', !a.some((x) => x.tipo === 'CAIDA_RATING'), tipos(a));

  a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos({ ratingActual: Number((base.ratingActual + 0.3).toFixed(1)) }));
  check('un rating que SUBE tampoco', !a.some((x) => x.tipo === 'CAIDA_RATING'), tipos(a));

  // ── 2. Ráfaga por volumen (solo lectura) ────────────────
  bloque('2. PICO_RESENAS_NEGATIVAS por ráfaga — la que ve los ataques grandes');

  a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos({
    totalResenas: base.totalResenas + 25,
    ratingActual: Number((base.ratingActual - 0.4).toFixed(1)),
  }));
  const rafaga = a.find((x) => x.detalle?.metodo === 'volumen_vs_ritmo');
  check('25 reseñas de golpe con el rating cayendo la levantan', !!rafaga, tipos(a));
  if (rafaga) console.log(`     «${rafaga.descripcion}»`);

  // 🔴 El control que más importa de todo el archivo: una ráfaga de reseñas
  // BUENAS es una buena noticia, no una alerta. Si esto se rompe, el producto
  // le manda un correo de alarma al cliente el día que le va bien.
  a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos({
    totalResenas: base.totalResenas + 25,
    ratingActual: Math.min(5, Number((base.ratingActual + 0.3).toFixed(1))),
  }));
  check('🔴 25 reseñas de golpe MEJORANDO el rating NO alertan',
    !a.some((x) => x.detalle?.metodo === 'volumen_vs_ritmo'),
    'una racha buena no puede leerse como un ataque');

  a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos({ totalResenas: base.totalResenas + 1 }));
  check('una sola reseña nueva no es ráfaga', !a.some((x) => x.detalle?.metodo === 'volumen_vs_ritmo'), tipos(a));

  // ── 3. Nada inventado cuando no pasa nada ───────────────
  bloque('3. Control general');
  a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos());
  check('sin cambios no devuelve ninguna alerta', a.length === 0, tipos(a));

  // ── 4. El clasificador de reseñas (puro) ────────────────
  bloque('4. analizarResena — marca de sospechosa, sin tocar la base');

  // ⚠️ Los `externalId` son obligatorios en este caso y no es un detalle del
  // ensayo: la comparación excluye la propia reseña con
  // `otra.externalId !== resena.externalId`, así que dos objetos SIN id se
  // excluyen entre sí (`undefined !== undefined` es false) y el duplicado nunca
  // se detecta. Con reseñas reales siempre viene, pero al escribir una prueba es
  // el primer sitio donde se falla un positivo que en realidad funciona.
  const previas = [{ externalId: 'a', texto: 'Pésimo servicio, no vuelvo nunca más a este lugar' }];
  let r = analizarResena({ externalId: 'b', rating: 1, texto: 'Pésimo servicio, no vuelvo nunca más a este lugar!!' }, previas);
  check('el texto duplicado se detecta pese a signos y mayúsculas',
    (r.motivoSospecha || '').includes('texto_duplicado'), JSON.stringify(r));

  r = analizarResena({ externalId: 'c', rating: 1, texto: 'muy corto' }, [{ externalId: 'd', texto: 'muy corto' }]);
  check('un texto corto NO cuenta como duplicado', !(r.motivoSospecha || '').includes('texto_duplicado'), JSON.stringify(r));

  r = analizarResena({ rating: 1, texto: null }, []);
  check('una 1★ sin texto se marca sospechosa', r.esSospechosa === true, JSON.stringify(r));

  r = analizarResena({ rating: 5, texto: 'Todo excelente, volveremos pronto con la familia.' }, []);
  check('una 5★ normal queda limpia', r.esSospechosa === false, JSON.stringify(r));

  // ── 4-bis. El techo del promedio no puede salir de la escala ──
  bloque('4-bis. Ninguna alerta puede decir una cifra imposible');

  const { compararMediciones } = require('../src/nlp/detector');
  // El mismo escenario del caso 2, que es el que destapó el fallo: 25 reseñas
  // nuevas no pueden explicar una caída de 0.4 en una ficha de 383, así que el
  // despeje se va fuera de la escala.
  const c = compararMediciones({ totalResenas: 383, ratingActual: 4 }, { totalResenas: 408, ratingActual: 3.6 });
  check('🔴 un promedio imposible NO produce un techo negativo',
    c.max === null || c.max >= 1, `max=${c.max}`);
  check('  …y tampoco un techo por debajo del suelo',
    c.max === null || c.min === null || c.max >= c.min, `min=${c.min} max=${c.max}`);
  check('  …pero `nuevas` y la caída publicada se conservan: son hechos',
    c.nuevas === 25 && c.caidaRating > 0.39);

  const sano = compararMediciones({ totalResenas: 100, ratingActual: 4.5 }, { totalResenas: 120, ratingActual: 4.2 });
  check('un caso aritméticamente posible sí da su estimación',
    sano.max !== null && sano.max >= 1 && sano.max <= 5, JSON.stringify(sano));

  // ── 5-7: los que escriben ───────────────────────────────
  if (!aplicar) {
    console.log('\n⏭️  Los casos que escriben (campaña coordinada, pico por conteo y ficha alterada)');
    console.log('    se saltan. Repetir con --aplicar para incluirlos.');
  } else {
    bloque('5. CUENTAS_NUEVAS — campaña coordinada (crea reseñas de ensayo y las borra)');
    let limpiar = await conResenas(negocio.id, [
      { rating: 1, motivoSospecha: 'texto_duplicado' },
      { rating: 1, motivoSospecha: 'texto_duplicado' },
    ]);
    try {
      a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos());
      const camp = a.find((x) => x.tipo === 'CUENTAS_NUEVAS');
      check('2 reseñas que repiten texto en 24h la levantan', !!camp, tipos(a));
      if (camp) console.log(`     «${camp.descripcion}»`);
    } finally { await limpiar(); }

    a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos());
    check('  …y al borrarlas deja de levantarse', !a.some((x) => x.tipo === 'CUENTAS_NUEVAS'), tipos(a));

    bloque('6. PICO_RESENAS_NEGATIVAS por conteo — la señal débil');
    limpiar = await conResenas(negocio.id, [{ rating: 1 }, { rating: 1 }, { rating: 2 }]);
    try {
      a = await detectarAnomalias(negocio.id, 'GOOGLE', nuevos());
      const pico = a.find((x) => x.tipo === 'PICO_RESENAS_NEGATIVAS' && x.detalle?.negativasHoy);
      check('3 negativas en 24h la levantan', !!pico, tipos(a));
      if (pico) console.log(`     «${pico.descripcion}»`);
      console.log('     ⚠️ En la práctica casi nunca se cumple: Places entrega 5 reseñas COMO MÁXIMO');
      console.log('        por consulta, así que la ráfaga por volumen (caso 2) es la que ve los ataques.');
    } finally { await limpiar(); }

    bloque('7. FICHA_ALTERADA — crea la alerta y manda el correo ella misma');
    const antes = await prisma.alerta.count({ where: { negocioId: negocio.id } });
    await revisarFichaGoogle(negocio, { estadoNegocio: 'CLOSED_TEMPORARILY', nombreEnGoogle: negocio.nombre });
    const creadas = await prisma.alerta.findMany({
      where: { negocioId: negocio.id, tipo: 'FICHA_ALTERADA' },
      orderBy: { creadaEn: 'desc' },
    });
    check('una ficha «cerrada temporalmente» crea la alerta y avisa',
      (await prisma.alerta.count({ where: { negocioId: negocio.id } })) === antes + 1, tipos(creadas));
    if (creadas[0]) console.log(`     «${creadas[0].descripcion}»`);

    // Dedupe: repetirlo con la alerta aún sin leer NO debe crear una segunda.
    await revisarFichaGoogle(negocio, { estadoNegocio: 'CLOSED_TEMPORARILY', nombreEnGoogle: negocio.nombre });
    check('🔴 repetirlo NO duplica el aviso mientras siga sin leerse',
      (await prisma.alerta.count({ where: { negocioId: negocio.id } })) === antes + 1,
      'sin este dedupe el cliente recibiría el mismo correo en cada ciclo del cron');

    await revisarFichaGoogle(negocio, { estadoNegocio: 'OPERATIONAL' });
    check('una ficha OPERATIONAL no genera nada',
      (await prisma.alerta.count({ where: { negocioId: negocio.id } })) === antes + 1);

    const borradas = await prisma.alerta.deleteMany({ where: { negocioId: negocio.id, tipo: 'FICHA_ALTERADA' } });
    console.log(`\n🧹 Borradas ${borradas.count} alerta(s) de ficha del ensayo.`);
  }

  // Red de seguridad: si algo se cayó a mitad, que no queden reseñas de ensayo.
  const sobrantes = await prisma.resena.deleteMany({ where: { externalId: { startsWith: 'ensayo_' } } });
  if (sobrantes.count) console.log(`🧹 Limpiadas ${sobrantes.count} reseña(s) de ensayo sobrantes.`);

  console.log(`\n═══ ${pasadas}/${pasadas + fallidas} correctos ═══`);
  if (fallidas) process.exitCode = 1;
})()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
