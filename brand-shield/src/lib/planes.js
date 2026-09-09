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
    // Cuántas reseñas negativas se juntan antes de mandar UN correo. 1 = un
    // aviso por reseña, al momento. Lo lee `lib/prefsCorreo.js`.
    //
    // 🔴 Vive en la tabla de planes y no en prefsCorreo porque es un límite POR
    // PLAN, y una tabla por plan fuera de acá es exactamente lo que costó los
    // tres fallos de IMPULSO (§8.6). Lo cazó `prueba-planes.js` el mismo día en
    // que se escribió, que es para lo que existe ese barrido.
    loteAvisoResenas: 5,
    // Capacidades
    localesAdicionales: false,
    vigilanciaFicha: false,
    reporteMensual: false,
    escalacionUrgencias: false,
    parteEquipo: false,
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
    // Cuántas reseñas negativas se juntan antes de mandar UN correo. 1 = un
    // aviso por reseña, al momento. Lo lee `lib/prefsCorreo.js`.
    //
    // 🔴 Vive en la tabla de planes y no en prefsCorreo porque es un límite POR
    // PLAN, y una tabla por plan fuera de acá es exactamente lo que costó los
    // tres fallos de IMPULSO (§8.6). Lo cazó `prueba-planes.js` el mismo día en
    // que se escribió, que es para lo que existe ese barrido.
    loteAvisoResenas: 1,
    localesAdicionales: false,
    vigilanciaFicha: true,
    reporteMensual: true,
    escalacionUrgencias: true,
    parteEquipo: true,
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
    // 🔴 Un local incluido, no cinco. Cambiado el 2026-08-25 junto con
    // FRANQUICIA y por el mismo motivo: a 4 h un local cuesta ~S/25/mes en
    // consultas a Places, así que «hasta 5 locales por S/59» perdía dinero
    // desde el tercero. Los de más se cobran (`PRECIOS.NEGOCIO.local`).
    //
    // Lo que separa NEGOCIO de IMPULSO deja de ser el número de locales y pasa
    // a ser lo que siempre lo separó de verdad: la velocidad (4 h contra 12),
    // las redes, el equipo, las menciones y la constancia.
    negocios: 1,
    horasEscaneo: 4,
    iaSemanal: 100,
    competidores: 5,
    asientos: 3,
    // Cuántas reseñas negativas se juntan antes de mandar UN correo. 1 = un
    // aviso por reseña, al momento. Lo lee `lib/prefsCorreo.js`.
    //
    // 🔴 Vive en la tabla de planes y no en prefsCorreo porque es un límite POR
    // PLAN, y una tabla por plan fuera de acá es exactamente lo que costó los
    // tres fallos de IMPULSO (§8.6). Lo cazó `prueba-planes.js` el mismo día en
    // que se escribió, que es para lo que existe ese barrido.
    loteAvisoResenas: 1,
    localesAdicionales: true,
    vigilanciaFicha: true,
    reporteMensual: true,
    escalacionUrgencias: true,
    parteEquipo: true,
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
    // 🔴 Un local INCLUIDO, no infinitos. Cambiado el 2026-08-25.
    //
    // Decía `Infinity` porque la web prometía «negocios ilimitados», y eso no se
    // podía sostener: cada local vigilado cuesta consultas a Google Places y ese
    // costo crece con el número de locales mientras el precio era plano. A la
    // cadencia de una hora que vende este plan, un local cuesta ~S/88/mes: dos
    // se comían los S/179 enteros y del tercero en adelante cada cliente NUEVO
    // costaba dinero. Y no lo delataba nada — la factura de Google no distingue
    // de quién fue cada consulta, así que habría aparecido como «Places subió»
    // justo cuando por fin entraran clientes grandes.
    //
    // Los locales de más se cobran (`PRECIO_LOCAL` en lib/precios.js). El tope
    // real de un usuario NO es este número: es `negociosPermitidos()`, que le
    // suma lo que pagó.
    negocios: 1,
    // Solo este plan vende locales sueltos. Se declara como capacidad para que
    // el cobro pregunte a la tabla en vez de comprobar `plan === 'FRANQUICIA'`,
    // que es exactamente el patrón que este archivo existe para eliminar.
    localesAdicionales: true,
    horasEscaneo: 1,
    iaSemanal: 300,
    competidores: 15,
    asientos: 10,
    // Cuántas reseñas negativas se juntan antes de mandar UN correo. 1 = un
    // aviso por reseña, al momento. Lo lee `lib/prefsCorreo.js`.
    //
    // 🔴 Vive en la tabla de planes y no en prefsCorreo porque es un límite POR
    // PLAN, y una tabla por plan fuera de acá es exactamente lo que costó los
    // tres fallos de IMPULSO (§8.6). Lo cazó `prueba-planes.js` el mismo día en
    // que se escribió, que es para lo que existe ese barrido.
    loteAvisoResenas: 1,
    vigilanciaFicha: true,
    reporteMensual: true,
    escalacionUrgencias: true,
    parteEquipo: true,
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

/**
 * Cuántos locales puede tener este usuario: los que incluye su plan más los que
 * paga aparte. Se reexporta desde `lib/precios.js` para que los call-sites
 * tengan UN solo sitio al que preguntar por el tope — la alternativa era que
 * cada ruta sumara `limite(plan,'negocios') + usuario.localesExtra` por su
 * cuenta, que es justo la clase de aritmética repetida que este archivo existe
 * para eliminar. El cálculo vive en `precios.js` porque depende de lo COBRADO,
 * no de la capacidad.
 */
const negociosPermitidos = (plan, localesExtra = 0) =>
  require('./precios').localesPermitidos(plan, localesExtra);

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
  negociosPermitidos,
};
