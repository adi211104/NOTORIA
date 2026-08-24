// brand-shield/src/lib/planes.js
//
// Qué puede hacer cada plan — fuente única de verdad de las CAPACIDADES, igual
// que `lib/precios.js` lo es del monto que se cobra.
//
// ── Por qué existe este archivo ──────────────────────────────────────────────
//
// Hasta el 2026-08-24 la matriz de planes no existía en ningún sitio: estaba
// deducida y repartida en 26 puntos del backend — 11 arrays `['NEGOCIO',
// 'FRANQUICIA']`, 5 tablas por plan y 10 ternarios sueltos. Mientras hubo tres
// planes eso se sostuvo. Al añadir el cuarto (IMPULSO) quedó claro el problema:
// no hay forma de responder "¿qué incluye este plan?" sin leer todo el backend,
// y los valores por defecto fallan en las DOS direcciones sin avisar.
//
// 🔴 Los tres casos reales que se encontraron al añadir IMPULSO, y que este
// archivo existe para que no vuelvan a ser posibles:
//
//   1. `negocio.routes.js` limitaba con
//      `plan === 'GRATIS' ? 1 : plan === 'NEGOCIO' ? 5 : 999`.
//      Un plan nuevo cae en el `else` y se lleva 999 NEGOCIOS. Es decir: el
//      plan más barato del catálogo, con locales ilimitados, por un ternario.
//
//   2. La renovación de Culqi filtraba por `plan: { in: ['NEGOCIO','FRANQUICIA'] }`.
//      Un plan que no esté en esa lista SE COBRA UNA VEZ Y NUNCA MÁS, y el
//      cliente conserva el plan para siempre. No hay error, no hay log, no hay
//      cargo fallido: simplemente el cron no lo ve. Es el fallo más caro posible
//      y el más silencioso.
//
//   3. La bajada de plan al vencer usaba el mismo filtro. Quien cancelara un
//      plan ausente de esa lista se quedaría con él para siempre.
//
// La regla que deja: **una capacidad nueva o un plan nuevo se declaran ACÁ, y
// los call-sites preguntan.** Nunca al revés. Si alguien escribe otra vez
// `['NEGOCIO','FRANQUICIA']` a mano en una ruta, el siguiente plan volverá a
// nacer roto de la misma forma.
//
// ── Cómo leer la tabla ───────────────────────────────────────────────────────
//
// `Infinity` = sin tope (no es lo mismo que un 999 disfrazado: el 999 se imprime
// en los mensajes de error y se lee como un límite real).
// `false` = la función no existe para ese plan; el panel debe ESCONDERLA, no
// pintarla apagada — es la regla de producto del proyecto ("lo que no podemos
// entregar no se muestra").

const PLANES = {
  GRATIS: {
    id: 'GRATIS',
    etiqueta: 'Plan Gratuito',
    esDePago: false,
    // Límites numéricos
    negocios: 1,
    horasEscaneo: 24,
    iaSemanal: 5,
    competidores: 1,
    asientos: 1,
    // Capacidades
    vigilanciaFicha: false,
    reporteMensual: false,
    escalacionUrgencias: false,
    constancia: false,
    menciones: false,
    comentariosSociales: false,
    autoRespuesta: false,
    analisisCompetidorIA: false,
    competenciaAutomatica: false,
    resumenConsolidado: false,
    tonoPersonalizado: false,
  },

  // ── IMPULSO — el escalón para una tienda o un negocio de barrio ────────────
  //
  // Decidido el 2026-08-24. El hueco entre S/0 y S/59 dejaba fuera a quien tiene
  // un solo local y no necesita equipo ni redes sociales, que en el Perú es la
  // mayoría del mercado objetivo.
  //
  // Lo que lo hace comprable NO es la velocidad: es la VIGILANCIA DE FICHA. Que
  // alguien pueda marcar tu local como "cerrado permanentemente" en Google, o
  // cambiarte el horario, y que Google lo aplique sin avisarte, es el problema
  // que un dueño entiende en una frase y no puede resolver solo.
  //
  // ⚠️ Esa vigilancia tiene COSTO REAL: obliga a pedir el grupo Contact Data de
  // Places, que se factura aparte del Basic Data. A 12 h son 2 consultas al día
  // por negocio — la mitad que NEGOCIO, que va a 4 h. Si algún día hay que
  // recortar margen, esta es la palanca, y está en un solo sitio.
  IMPULSO: {
    id: 'IMPULSO',
    etiqueta: 'Plan Impulso',
    esDePago: true,
    negocios: 1,
    horasEscaneo: 12,
    iaSemanal: 25,
    competidores: 3,
    // Un asiento: compartir el panel con el equipo es lo que define NEGOCIO.
    // Cuenta al dueño (ver lib/equipo.js), así que 1 = solo él.
    asientos: 1,
    vigilanciaFicha: true,
    reporteMensual: true,
    escalacionUrgencias: true,
    // Lo que sigue siendo el salto a NEGOCIO. No es arbitrario: constancia,
    // menciones y redes son las tres funciones que exigen conexiones externas o
    // respaldo documental, y son las que un local de barrio no pide.
    constancia: false,
    menciones: false,
    comentariosSociales: false,
    autoRespuesta: false,
    analisisCompetidorIA: false,
    competenciaAutomatica: false,
    resumenConsolidado: false,
    tonoPersonalizado: false,
  },

  NEGOCIO: {
    id: 'NEGOCIO',
    etiqueta: 'Plan Negocio',
    esDePago: true,
    negocios: 5,
    horasEscaneo: 4,
    iaSemanal: 100,
    competidores: 5,
    asientos: 3,
    vigilanciaFicha: true,
    reporteMensual: true,
    escalacionUrgencias: true,
    constancia: true,
    menciones: true,
    comentariosSociales: true,
    autoRespuesta: true,
    analisisCompetidorIA: true,
    competenciaAutomatica: false,
    resumenConsolidado: false,
    tonoPersonalizado: false,
  },

  FRANQUICIA: {
    id: 'FRANQUICIA',
    etiqueta: 'Plan Franquicia',
    esDePago: true,
    // Sin tope de locales — es literalmente lo que se promete en /precios.
    negocios: Infinity,
    horasEscaneo: 1,
    iaSemanal: 300,
    competidores: 15,
    asientos: 10,
    vigilanciaFicha: true,
    reporteMensual: true,
    escalacionUrgencias: true,
    constancia: true,
    menciones: true,
    comentariosSociales: true,
    autoRespuesta: true,
    analisisCompetidorIA: true,
    competenciaAutomatica: true,
    resumenConsolidado: true,
    tonoPersonalizado: true,
  },
};

// Orden de menor a mayor. Lo usan el panel (para decir "actualiza a…") y las
// pruebas, que comprueban que ninguna capacidad se APAGUE al subir de plan.
const ORDEN = ['GRATIS', 'IMPULSO', 'NEGOCIO', 'FRANQUICIA'];

/**
 * La fila del plan. Ante un valor desconocido devuelve GRATIS y no `undefined`:
 * un plan que no reconocemos tiene que comportarse como el más restrictivo, no
 * reventar ni —peor— caer en un `else` permisivo.
 */
const capacidades = (plan) => PLANES[plan] || PLANES.GRATIS;

/** ¿Este plan tiene esta capacidad? Para las claves booleanas de la tabla. */
const puede = (plan, capacidad) => capacidades(plan)[capacidad] === true;

/** Límite numérico. Devuelve `Infinity` donde no hay tope. */
const limite = (plan, clave) => {
  const v = capacidades(plan)[clave];
  return typeof v === 'number' ? v : 0;
};

/**
 * Los planes que tienen una capacidad. Es lo que sustituye a los
 * `['NEGOCIO','FRANQUICIA']` escritos a mano, y la diferencia está en que ESTE
 * se actualiza solo al añadir un plan a la tabla.
 *
 *     where: { plan: { in: planesCon('menciones') } }
 */
const planesCon = (capacidad) => ORDEN.filter((p) => PLANES[p][capacidad] === true);

/**
 * Los planes que se cobran. Es el filtro de la renovación de Culqi y el de la
 * bajada de plan — los dos sitios donde olvidar un plan cuesta dinero.
 */
const PLANES_DE_PAGO = ORDEN.filter((p) => PLANES[p].esDePago);

/** Nombre del plan tal como debe aparecer en un comprobante fiscal. */
const etiquetaDe = (plan) => capacidades(plan).etiqueta;

/**
 * Texto del límite para un mensaje al usuario. Existe porque `Infinity` se
 * interpola como "Infinity", y un cliente de Franquicia leyendo "tu plan permite
 * hasta Infinity negocios" es exactamente la clase de detalle que hace que un
 * producto de pago parezca un prototipo.
 */
const limiteLegible = (n) => (Number.isFinite(n) ? String(n) : 'ilimitados');

module.exports = {
  PLANES,
  ORDEN,
  PLANES_DE_PAGO,
  capacidades,
  puede,
  limite,
  planesCon,
  etiquetaDe,
  limiteLegible,
};
