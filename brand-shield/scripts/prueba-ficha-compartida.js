// brand-shield/scripts/prueba-ficha-compartida.js
// Pruebas del caché de fichas de Google por ciclo, con el scraper SIMULADO:
// no llama a Places, no gasta cuota y no necesita base.
//
//   node scripts/prueba-ficha-compartida.js
//
// QUÉ SE VIGILA. Este caché existe porque dos cuentas pueden monitorear el mismo
// local (el 2026-08-23: 10 negocios activos, 9 place IDs). Ahorra llamadas, pero
// tiene dos reglas que si se rompen NO producen ningún error visible:
//
//   · una respuesta pedida SIN datos de contacto no le sirve a un plan que SÍ
//     los paga. Servírsela apagaría en silencio la vigilancia de teléfono,
//     horario, nombre y dirección de ese cliente — el cliente seguiría pagando
//     por una función que dejó de mirar nada
//   · un fallo (null) no se puede cachear: el siguiente negocio que comparta la
//     ficha heredaría un error que no era suyo, y en un ciclo con la cuota de
//     Places agotada eso convierte un fallo en varios

const Module = require('module');

// ── Doble del scraper ─────────────────────────────────────
let llamadas;
const scraperFalso = {
  obtenerResenasGoogle: async (placeId, opciones) => {
    llamadas.push({ placeId, conContacto: opciones?.conContacto });
    if (placeId === 'place-que-falla') return null;
    return {
      placeId,
      conContacto: opciones?.conContacto,
      ratingActual: 4.2,
      totalResenas: 100,
    };
  },
  buscarNegocioEnGoogle: async () => null,
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('scrapers/google.scraper')) return scraperFalso;
  if (id.endsWith('lib/prisma') || id.endsWith('/prisma')) return {};
  return requireOriginal.apply(this, arguments);
};
const { obtenerFichaGoogleCompartida } = require('../src/workers/monitoreo.worker');
Module.prototype.require = requireOriginal;

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const nuevoCiclo = () => { llamadas = []; return new Map(); };

const correr = async () => {
  // ── 1. El ahorro ────────────────────────────────────────
  bloque('1. Lo que el caché ahorra');

  let cache = nuevoCiclo();
  await obtenerFichaGoogleCompartida('place-A', false, cache);
  await obtenerFichaGoogleCompartida('place-A', false, cache);
  check('dos negocios con la misma ficha = UNA llamada a Places', llamadas.length === 1);

  cache = nuevoCiclo();
  await obtenerFichaGoogleCompartida('place-A', false, cache);
  await obtenerFichaGoogleCompartida('place-B', false, cache);
  check('fichas distintas siguen pidiéndose por separado', llamadas.length === 2);

  cache = nuevoCiclo();
  const uno = await obtenerFichaGoogleCompartida('place-A', false, cache);
  const dos = await obtenerFichaGoogleCompartida('place-A', false, cache);
  check('el segundo recibe los mismos datos, no un vacío', dos && dos.placeId === uno.placeId);

  // ── 2. Datos de contacto ────────────────────────────────
  bloque('2. Contact Data: quién puede reutilizar la respuesta de quién');

  cache = nuevoCiclo();
  await obtenerFichaGoogleCompartida('place-A', true, cache);
  const sinPagar = await obtenerFichaGoogleCompartida('place-A', false, cache);
  check('una respuesta CON contacto sirve para quien no lo paga (es superconjunto)',
    llamadas.length === 1 && sinPagar.conContacto === true);

  cache = nuevoCiclo();
  await obtenerFichaGoogleCompartida('place-A', false, cache);
  const pagando = await obtenerFichaGoogleCompartida('place-A', true, cache);
  check('🔴 una respuesta SIN contacto NO se le sirve a quien sí lo paga',
    llamadas.length === 2 && pagando.conContacto === true,
    'servírsela apagaría en silencio su vigilancia de teléfono y horario');

  check('  …y tras pedirla completa, el caché queda mejorado',
    cache.get('place-A').conContacto === true);

  cache = nuevoCiclo();
  await obtenerFichaGoogleCompartida('place-A', false, cache);
  await obtenerFichaGoogleCompartida('place-A', true, cache);
  await obtenerFichaGoogleCompartida('place-A', false, cache);
  await obtenerFichaGoogleCompartida('place-A', true, cache);
  check('  …así que a partir de ahí ya nadie vuelve a pedirla', llamadas.length === 2);

  // ── 3. Fallos ───────────────────────────────────────────
  bloque('3. Qué pasa cuando Places falla');

  cache = nuevoCiclo();
  const falla1 = await obtenerFichaGoogleCompartida('place-que-falla', false, cache);
  const falla2 = await obtenerFichaGoogleCompartida('place-que-falla', false, cache);
  check('un fallo NO se cachea: el segundo negocio tiene su propio intento',
    llamadas.length === 2 && falla1 === null && falla2 === null,
    'heredar un fallo ajeno convierte un error en varios');

  check('  …y el caché no guarda basura', cache.size === 0);

  // ── 4. Sin caché ────────────────────────────────────────
  bloque('4. Sin caché (el camino de un negocio suelto)');

  llamadas = [];
  const suelto = await obtenerFichaGoogleCompartida('place-A', true, undefined);
  check('sin caché funciona igual, pidiendo siempre',
    llamadas.length === 1 && suelto.conContacto === true,
    'escanear un solo negocio no tiene con quién compartir y no debe romperse');

  llamadas = [];
  await obtenerFichaGoogleCompartida('place-A', false, undefined);
  await obtenerFichaGoogleCompartida('place-A', false, undefined);
  check('  …sin acumular nada entre llamadas', llamadas.length === 2);

  // ── 5. El caché muere con el ciclo ──────────────────────
  bloque('5. El caché dura UN ciclo');

  cache = nuevoCiclo();
  await obtenerFichaGoogleCompartida('place-A', false, cache);
  const otroCiclo = nuevoCiclo();
  await obtenerFichaGoogleCompartida('place-A', false, otroCiclo);
  check('el ciclo siguiente vuelve a preguntarle a Google',
    llamadas.length === 1,
    'un caché que sobreviviera al ciclo congelaría el rating: es lo contrario del producto');

  // ── Resumen ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
