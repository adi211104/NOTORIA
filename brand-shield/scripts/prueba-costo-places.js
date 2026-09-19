// brand-shield/scripts/prueba-costo-places.js
// Pruebas de los TRES frenos de costo de Google Places, con el scraper SIMULADO:
// no llama a Places, no gasta cuota y no necesita base.
//
//   node scripts/prueba-costo-places.js
//
// ── QUÉ SE VIGILA ACÁ, Y POR QUÉ HACE FALTA UNA PRUEBA ──────────────────────
//
// Los tres frenos comparten una propiedad incómoda: **romperlos no produce
// ninguna señal**. La vigilancia sigue funcionando igual de bien, el panel
// enseña lo mismo, los correos salen igual, ninguna prueba de producto falla.
// Lo único que cambia es la factura de Google, que además no distingue de quién
// fue cada consulta. Es exactamente el tipo de fallo silencioso que en este
// proyecto se caza contando cosas, no leyendo errores.
//
// Antes del 2026-08-25, con los topes que la web promete:
//
//   · FRANQUICIA, un solo local: 720 escaneos/mes del negocio + 15 competidores
//     × 720 = 10 800 consultas al mes SOLO en rivales. Más que el plan entero.
//   · Los competidores costaban MÁS que el negocio vigilado, y el precio por
//     consulta no baja cuando el plan sube: cuanto más caro el plan, peor el
//     margen.
//
// Los tres frenos:
//   1. HORAS_COMPETIDOR — un rival se relee una vez al día, no una vez por
//      ciclo del dueño. Nadie compara ratings de hora en hora.
//   2. obtenerCompetidorCompartido — un place ID se pide UNA vez por ciclo, y
//      si además es un negocio monitoreado sale gratis de `fichasGoogle`.
//   3. tocaLeerContacto — el grupo Contact Data (que se factura aparte) se pide
//      una vez al día, no en cada escaneo. La ficha CERRADA no pasa por acá:
//      va en Basic Data y se sigue mirando siempre.

const Module = require('module');

// ── Dobles ────────────────────────────────────────────────
let llamadas;
const scraperFalso = {
  obtenerResenasGoogle: async (placeId, opciones) => {
    llamadas.push({ tipo: 'ficha', placeId, conContacto: !!opciones?.conContacto });
    return { placeId, ratingActual: 4.2, totalResenas: 100, nombreEnGoogle: `Negocio ${placeId}` };
  },
  buscarNegocioEnGoogle: async (placeId) => {
    llamadas.push({ tipo: 'competidor', placeId });
    if (placeId === 'place-que-falla') return null;
    return { nombre: `Rival ${placeId}`, rating: 3.9, totalResenas: 50, direccion: 'x' };
  },
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('scrapers/google.scraper')) return scraperFalso;
  if (id.endsWith('lib/prisma') || id.endsWith('/prisma')) return {};
  return requireOriginal.apply(this, arguments);
};
const {
  obtenerCompetidorCompartido,
  obtenerFichaGoogleCompartida,
  HORAS_COMPETIDOR,
} = require('../src/workers/monitoreo.worker');
const { tocaLeerContacto, HORAS_CONTACTO, fotoDeFicha, compararFichas } = require('../src/lib/fichaGoogle');
Module.prototype.require = requireOriginal;

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const nuevoCiclo = () => {
  llamadas = [];
  return { fichasGoogle: new Map(), competidores: new Map() };
};

const HORA = 60 * 60 * 1000;

const correr = async () => {
  // ══ 1. El competidor se reutiliza dentro del ciclo ══════
  bloque('1. Un mismo competidor no se paga dos veces en el mismo ciclo');

  let ctx = nuevoCiclo();
  await obtenerCompetidorCompartido('rival-comun', ctx);
  await obtenerCompetidorCompartido('rival-comun', ctx);
  await obtenerCompetidorCompartido('rival-comun', ctx);
  check('tres negocios siguen al mismo rival → 1 llamada, no 3',
    llamadas.length === 1, `hubo ${llamadas.length}`);

  ctx = nuevoCiclo();
  await obtenerCompetidorCompartido('rival-a', ctx);
  await obtenerCompetidorCompartido('rival-b', ctx);
  check('rivales distintos sí se piden por separado',
    llamadas.length === 2, `hubo ${llamadas.length}`);

  // ══ 2. El competidor que además es cliente sale gratis ══
  bloque('2. Un competidor que ya es negocio monitoreado no cuesta nada');

  ctx = nuevoCiclo();
  // Primero pasa el NEGOCIO: su ficha entra al caché del ciclo.
  await obtenerFichaGoogleCompartida('place-x', false, ctx.fichasGoogle);
  const antes = llamadas.length;
  const info = await obtenerCompetidorCompartido('place-x', ctx);
  check('0 llamadas extra: el rival salió de la ficha del negocio',
    llamadas.length === antes, `hubo ${llamadas.length - antes} extra`);
  check('y devuelve los tres campos que el worker guarda',
    info && info.rating === 4.2 && info.totalResenas === 100 && !!info.nombre,
    JSON.stringify(info));

  // ⚠️ La asimetría. Es la regla que más fácil se rompe "simplificando".
  bloque('3. La reutilización va en UNA sola dirección');

  ctx = nuevoCiclo();
  await obtenerCompetidorCompartido('solo-rival', ctx);
  const trasRival = llamadas.length;
  await obtenerFichaGoogleCompartida('solo-rival', false, ctx.fichasGoogle);
  check('una lectura de competidor NO le sirve a un negocio (sí pide su ficha)',
    llamadas.length === trasRival + 1,
    'un negocio necesita `reviews`, y el competidor solo pidió Basic Data');
  check('la ficha del negocio es la que trae reseñas, no la del rival',
    llamadas[llamadas.length - 1].tipo === 'ficha');

  // ══ 4. Un fallo no se cachea ════════════════════════════
  bloque('4. Un fallo no se hereda');

  ctx = nuevoCiclo();
  const malo = await obtenerCompetidorCompartido('place-que-falla', ctx);
  await obtenerCompetidorCompartido('place-que-falla', ctx);
  check('null no se guarda: el segundo negocio hace su propio intento',
    llamadas.length === 2, `hubo ${llamadas.length}`);
  check('y devuelve null, no un objeto a medias', malo === null);

  // ══ 5. La cadencia del competidor ═══════════════════════
  bloque('5. La cadencia propia del competidor');

  // 2026-09-19: pasó de 24 h a 7 días. Lo que esta comprobación protege no es el
  // número sino que NO sea la del plan del dueño: si alguien la ata a
  // `horasEscaneo`, FRANQUICIA vuelve a releer 15 rivales cada hora y la factura
  // se dispara sin que falle absolutamente nada.
  check(`HORAS_COMPETIDOR es 168 (7 días) y no la del plan del dueño`,
    HORAS_COMPETIDOR === 168, `es ${HORAS_COMPETIDOR}`);

  // La decisión que toma el worker, replicada acá: se relee si la última lectura
  // es más vieja que el corte, o si nunca hubo ninguna.
  const tocaCompetidor = (ultima, ahora = Date.now()) =>
    !ultima || ultima.getTime() <= ahora - HORAS_COMPETIDOR * HORA;

  const ahora = Date.now();
  check('recién agregado (sin snapshot) → se lee YA, no mañana',
    tocaCompetidor(null, ahora),
    'si esperara, el cliente lo agrega y ve una fila vacía sin explicación');
  check('leído hace 1 h → no se vuelve a pedir',
    !tocaCompetidor(new Date(ahora - 1 * HORA), ahora));
  check('leído hace 23 h → todavía no',
    !tocaCompetidor(new Date(ahora - 23 * HORA), ahora));
  // 🔴 El control del cambio del 19/09: con la cadencia vieja esta comprobación
  // decía lo contrario («hace 25 h → toca»). Si alguien vuelve a poner 24, ésta
  // se pone en rojo — que es exactamente lo que tiene que pasar.
  check('leído hace 25 h → TODAVÍA NO (antes del 2026-09-19 sí tocaba)',
    !tocaCompetidor(new Date(ahora - 25 * HORA), ahora));
  check('leído hace 6 días → todavía no',
    !tocaCompetidor(new Date(ahora - 6 * 24 * HORA), ahora));
  check('leído hace 8 días → toca',
    tocaCompetidor(new Date(ahora - 8 * 24 * HORA), ahora));

  // ══ 6. El acelerador de Contact Data ════════════════════
  bloque('6. Contact Data se pide una vez al día, no en cada escaneo');

  check('HORAS_CONTACTO es 24 — lo mismo que promete la web («el mismo día»)',
    HORAS_CONTACTO === 24, `es ${HORAS_CONTACTO}`);

  const conPlan = (plan, leidoEn) => ({
    usuario: { plan },
    fichaGoogleRef: leidoEn === undefined ? null : { telefono: '1', _leidoEn: leidoEn },
  });

  check('plan GRATIS nunca pide contacto (no lo paga)',
    !tocaLeerContacto(conPlan('GRATIS', new Date(ahora - 99 * HORA).toISOString()), ahora));
  check('IMPULSO sí lo paga desde el 2026-08-24',
    tocaLeerContacto(conPlan('IMPULSO', undefined), ahora));
  check('primera vez (sin referencia) → se pide, no se puede aplazar',
    tocaLeerContacto(conPlan('NEGOCIO', undefined), ahora),
    'es la lectura que establece la referencia contra la que se compara todo');
  check('referencia vieja sin `_leidoEn` (anterior al cambio) → se pide',
    tocaLeerContacto({ usuario: { plan: 'NEGOCIO' }, fichaGoogleRef: { telefono: '1' } }, ahora));
  check('leído hace 2 h → NO se vuelve a pagar',
    !tocaLeerContacto(conPlan('NEGOCIO', new Date(ahora - 2 * HORA).toISOString()), ahora));
  check('leído hace 25 h → toca',
    tocaLeerContacto(conPlan('FRANQUICIA', new Date(ahora - 25 * HORA).toISOString()), ahora));
  check('una marca corrupta no apaga la vigilancia: ante la duda se pide',
    tocaLeerContacto(conPlan('NEGOCIO', 'no-es-una-fecha'), ahora),
    'fallar hacia "pedir" cuesta dinero; fallar hacia "no pedir" apaga una función que el cliente paga');

  // ⚠️ La marca vive DENTRO del JSON de la referencia. Si alguna vez se colara
  // como un campo comparable, cada lectura diaria dispararía una alerta de
  // "te cambiaron la ficha" — un aviso falso, diario y para todos los clientes
  // de pago a la vez. Es el peor desenlace posible de este ahorro.
  bloque('7. La marca de tiempo no puede parecer un cambio de ficha');

  const foto1 = fotoDeFicha({ formatted_phone_number: '999', name: 'Bar', formatted_address: 'Calle 1' });
  const foto2 = fotoDeFicha({ formatted_phone_number: '999', name: 'Bar', formatted_address: 'Calle 1' });
  check('dos lecturas iguales en momentos distintos → CERO cambios',
    compararFichas(foto1, foto2).length === 0,
    `devolvió ${JSON.stringify(compararFichas(foto1, foto2))}`);
  check('`_leidoEn` sí está presente en la foto (si no, el acelerador no funciona)',
    !!foto1._leidoEn);
  check('y un cambio de verdad se sigue detectando',
    compararFichas(foto1, fotoDeFicha({ formatted_phone_number: '111', name: 'Bar', formatted_address: 'Calle 1' }))
      .some((c) => c.campo === 'telefono'));

  // ══ 8. La cuenta de la vieja ════════════════════════════
  // No es una prueba de código: es la aritmética que justifica todo lo de arriba,
  // escrita para que el día que alguien suba una cadencia sepa lo que cuesta.
  bloque('8. Lo que costaba y lo que cuesta (FRANQUICIA, 1 local, 15 rivales)');

  const USD_FICHA_CON_CONTACTO = 0.025; // Basic 17 + Contact 3 + Atmosphere 5, por millar
  const USD_FICHA = 0.022;              // Basic 17 + Atmosphere 5
  const USD_RIVAL = 0.017;              // Basic 17
  const escaneosMes = 720;              // cada hora

  const ficha = (esc) => (esc - 30) * USD_FICHA + 30 * USD_FICHA_CON_CONTACTO;
  const rivales = (lecturasMes) => 15 * lecturasMes * USD_RIVAL;

  // Julio 2026: sin ningún freno — cada rival a la cadencia del dueño.
  const v0 = escaneosMes * USD_FICHA_CON_CONTACTO + 15 * escaneosMes * USD_RIVAL;
  // 2026-08-25: los tres frenos de §8.7 — rival una vez al día, contacto una vez al día.
  const v1 = ficha(escaneosMes) + rivales(30);
  // 2026-09-19 (palanca 1): el rival pasa a una vez por SEMANA.
  const v2 = ficha(escaneosMes) + rivales(30 / 7);
  // 2026-09-19 (palanca 3): y la cadencia de FRANQUICIA baja de 1 h a 2 h.
  const v3 = ficha(360) + rivales(30 / 7);

  console.log(`     sin frenos (jul):        $${v0.toFixed(2)}/mes`);
  console.log(`     tres frenos (25/08):     $${v1.toFixed(2)}/mes`);
  console.log(`     rival semanal (19/09):   $${v2.toFixed(2)}/mes`);
  console.log(`     + cadencia 2 h (19/09):  $${v3.toFixed(2)}/mes   (ingreso del plan ≈ $47.7)`);

  check('el costo por local baja al menos 7 veces respecto a julio',
    v0 / v1 >= 7, `bajó ${(v0 / v1).toFixed(1)}×`);
  check('y UN local de Franquicia deja margen',
    v1 < 47.7, `cuesta $${v1.toFixed(2)}`);
  // 🔴 Dónde MUERDE de verdad la lectura diaria del rival: NO en FRANQUICIA
  // —ahí manda la ficha, 720 escaneos contra 15 rivales— sino en los planes de
  // cadencia baja, que son los que se van a vender por volumen. En IMPULSO los
  // rivales costaban MÁS que el propio negocio vigilado: se pagaba más por mirar
  // al vecino que al cliente que paga.
  //
  // ⚠️ La primera versión de esta comprobación afirmaba eso de FRANQUICIA y salió
  // en ROJO con razón ($7.65 de rivales contra $15.93 de ficha). Queda escrito
  // porque es la trampa de siempre: un rojo hay que leerlo antes de "arreglar" el
  // código — acá lo que estaba mal era la afirmación, no la cadencia.
  const fichaImpulso = 30 * USD_FICHA + 30 * USD_FICHA_CON_CONTACTO; // 60 escaneos, contacto 1/día
  const rivalesImpulso = (lect) => 3 * lect * USD_RIVAL;
  check('en IMPULSO los rivales costaban MÁS que el negocio vigilado',
    rivalesImpulso(30) > fichaImpulso,
    `rivales $${rivalesImpulso(30).toFixed(2)} vs ficha $${fichaImpulso.toFixed(2)}`);
  check('con lectura semanal pasan a ser calderilla',
    rivalesImpulso(30 / 7) < fichaImpulso / 5,
    `rivales $${rivalesImpulso(30 / 7).toFixed(2)}`);
  check('las dos palancas juntas dejan el plan por debajo de un tercio del ingreso',
    v3 < 47.7 / 3, `cuesta $${v3.toFixed(2)}`);

  // ── Resumen ─────────────────────────────────────────────
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`${pasadas} pasadas, ${fallidas} fallidas`);
  if (fallidas) process.exitCode = 1;
};

correr().catch((e) => { console.error(e); process.exitCode = 1; });
