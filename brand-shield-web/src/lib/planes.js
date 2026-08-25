// Espejo en el panel de brand-shield/src/lib/planes.js.
//
// El backend es quien MANDA: lo que se puede hacer de verdad lo decide él, y
// esto solo gobierna lo que se pinta. Si los dos discrepan, el usuario ve un
// botón que el servidor le va a rechazar con 403 — que es el peor de los dos
// errores posibles, porque parece un fallo del producto y no un límite del plan.
//
// `scripts/prueba-planes.js` (en el backend) compara los dos archivos capacidad
// por capacidad y falla si se separan. Es la misma relación que ya existe entre
// `precios.js` y `catalogo.js`.
//
// ⚠️ Los NOMBRES viven acá y no en el backend a propósito: llevan idioma, y la
// regla del proyecto es que todo lo que lleva idioma se compone en el panel. Del
// backend viaja el valor del enum, que no tiene idioma. Es la lección que dejó
// el bug de las invitaciones de equipo (§11) y el de los correos de alerta (§12).

export const PLANES = {
  GRATIS: {
    id: 'GRATIS',
    es: 'Gratuito', en: 'Free',
    esDePago: false,
    negocios: 1, horasEscaneo: 24, iaSemanal: 5, competidores: 1, asientos: 1,
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
  IMPULSO: {
    id: 'IMPULSO',
    // Nombre propio: no se traduce. "Impulso plan" en inglés se lee peor que
    // dejarlo, y el mercado es Perú.
    es: 'Impulso', en: 'Impulso',
    esDePago: true,
    negocios: 1, horasEscaneo: 12, iaSemanal: 25, competidores: 3, asientos: 1,
    localesAdicionales: false,
    vigilanciaFicha: true,
    reporteMensual: true,
    escalacionUrgencias: true,
    parteEquipo: true,
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
    es: 'Negocio', en: 'Business',
    esDePago: true,
    // Un local incluido y los demas se cobran aparte (2026-08-25). Ver
    // brand-shield/src/lib/precios.js: a 4 h un local cuesta ~S/25/mes en
    // consultas a Places, asi que «hasta 5 por S/59» perdia dinero desde el
    // tercero.
    negocios: 1, horasEscaneo: 4, iaSemanal: 100, competidores: 5, asientos: 3,
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
    es: 'Franquicia', en: 'Franchise',
    esDePago: true,
    negocios: 1, horasEscaneo: 1, iaSemanal: 300, competidores: 15, asientos: 10,
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
    competenciaAutomatica: true,
    resumenConsolidado: true,
    tonoPersonalizado: true,
  },
};

export const ORDEN = ['GRATIS', 'IMPULSO', 'NEGOCIO', 'FRANQUICIA'];

// Un plan desconocido se comporta como el más restrictivo. Nunca `undefined`:
// `undefined.vigilanciaFicha` rompería la pantalla entera, y caer al plan más
// permisivo enseñaría funciones que el backend va a rechazar.
export const capacidades = (plan) => PLANES[plan] || PLANES.GRATIS;

export const puede = (plan, capacidad) => capacidades(plan)[capacidad] === true;

export const limite = (plan, clave) => {
  const v = capacidades(plan)[clave];
  return typeof v === 'number' ? v : 0;
};

/** "Negocio" · "Business". Para frases como "Tu plan {X}". */
export const nombrePlan = (plan, idioma = 'es') => {
  const c = capacidades(plan);
  return (idioma === 'en' ? c.en : c.es) || c.id;
};

/** "Plan Negocio" · "Business plan". El orden de las palabras cambia con el idioma. */
export const nombrePlanLargo = (plan, idioma = 'es') =>
  idioma === 'en' ? `${nombrePlan(plan, 'en')} plan` : `Plan ${nombrePlan(plan, 'es')}`;

/** El siguiente escalón hacia arriba, o null si ya está en el tope. */
export const planSiguiente = (plan) => {
  const i = ORDEN.indexOf(capacidades(plan).id);
  return i >= 0 && i < ORDEN.length - 1 ? ORDEN[i + 1] : null;
};

/**
 * El plan más barato que incluye una capacidad. Sirve para el mensaje correcto
 * al pedir un upgrade: antes varias pantallas decían "disponible desde el Plan
 * Negocio" para cosas que ahora incluye Impulso, o sea que le vendían al cliente
 * un plan más caro del que necesita.
 */
export const planMinimoCon = (capacidad) =>
  ORDEN.find((p) => PLANES[p][capacidad] === true) || null;

export const limiteLegible = (n, idioma = 'es') =>
  Number.isFinite(n) ? String(n) : (idioma === 'en' ? 'unlimited' : 'ilimitados');
