// Pruebas de `lib/saludPlaces.js` y del cableado del scraper de Google — 2026-09-22.
//
//   node scripts/prueba-salud-places.js
//
// Lo que vigila es un silencio: con la facturación de Google cortada, Places contesta
// HTTP 200 con `status: REQUEST_DENIED`, el scraper devolvía `null` sin decir nada y el
// producto dejaba de vigilar sin una sola señal. Casi todo lo de abajo son las formas en
// que ese silencio puede volver.
//
// ⚠️ NO toca la base ni llama a Google: Prisma y axios se interceptan ANTES de cargar el
// scraper. Cargar `google.scraper.js` tira de `lib/fichaGoogle` → `lib/prisma`, y eso
// abre conexión a producción con el `.env` local — la trampa que ya tuvo
// `prueba-dormancia.js` el 19/09 con su cabecera prometiendo lo contrario.

const Module = require('module');
const path = require('path');
const fs = require('fs');

// ── Interceptores, antes de cualquier require del código de producción ──
let respuestaAxios = { data: { status: 'OK', result: {} } };
let axiosLanza = null;
const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('/prisma') || id.endsWith('lib/prisma')) {
    return { usuario: { findMany: async () => [] }, snapshot: { findFirst: async () => null } };
  }
  if (id === 'axios') {
    return {
      get: async () => {
        if (axiosLanza) throw axiosLanza;
        return respuestaAxios;
      },
    };
  }
  return requireOriginal.apply(this, arguments);
};

const salud = require('../src/lib/saludPlaces');
const scraper = require('../src/scrapers/google.scraper');

let ok = 0;
let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok += 1; console.log(`  ✓ ${nombre}`); }
  else { fallos += 1; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};

// Capturar lo que el scraper escribe en consola, para comprobar que por fin DICE algo.
let log = [];
const errorOriginal = console.error;
const escuchar = () => { log = []; console.error = (...a) => log.push(a.join(' ')); };
const soltar = () => { console.error = errorOriginal; };

(async () => {
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n1. Qué cuenta como «Google contesta» y qué como «Google nos rechaza»');
  salud.reiniciar();

  for (const s of ['OK', 'ZERO_RESULTS', 'NOT_FOUND']) {
    salud.reiniciar();
    salud.registrar('REQUEST_DENIED');
    salud.registrar(s);
    check(`${s} es la API funcionando: pone el contador de rechazos a cero`,
      salud.estadoPlaces().rechazosSeguidos === 0);
  }

  // 🔴 El caso que importa: una facturación suspendida.
  salud.reiniciar();
  salud.registrar('REQUEST_DENIED');
  salud.registrar('REQUEST_DENIED');
  check('dos rechazos todavía no son alarma (pueden ser un hipo)', !salud.rechazando());
  salud.registrar('REQUEST_DENIED');
  check(`${salud.RECHAZOS_PARA_ALARMA} rechazos seguidos SÍ son alarma`, salud.rechazando());
  check('la alarma dice el motivo exacto que devolvió Google',
    salud.estadoPlaces().motivo === 'REQUEST_DENIED');

  salud.reiniciar();
  ['OVER_QUERY_LIMIT', 'OVER_QUERY_LIMIT', 'OVER_QUERY_LIMIT'].forEach(salud.registrar);
  check('un tope de cuota agotado también es alarma', salud.rechazando());

  // ⚠️ Los que NO deben mover nada, porque no dicen nada de la cuenta.
  salud.reiniciar();
  ['REQUEST_DENIED', 'REQUEST_DENIED', 'REQUEST_DENIED'].forEach(salud.registrar);
  ['INVALID_REQUEST', 'UNKNOWN_ERROR', 'ERROR_RED'].forEach(salud.registrar);
  check('INVALID_REQUEST, UNKNOWN_ERROR y un error de red NO apagan una alarma encendida',
    salud.rechazando(), 'un error nuestro no prueba que la cuenta haya vuelto');
  salud.reiniciar();
  ['INVALID_REQUEST', 'UNKNOWN_ERROR', 'ERROR_RED', 'INVALID_REQUEST'].forEach(salud.registrar);
  check('…y tampoco la encienden: no son un rechazo de la cuenta', !salud.rechazando());

  check('registrar() devuelve el status tal cual, para encadenarse sin cambiar el flujo',
    salud.registrar('OK') === 'OK' && salud.registrar('NOT_FOUND') === 'NOT_FOUND');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n2. El scraper de verdad, con Google contestando REQUEST_DENIED');

  salud.reiniciar();
  respuestaAxios = { data: { status: 'REQUEST_DENIED', error_message: 'Billing account is disabled.' } };
  escuchar();
  const r1 = await scraper.obtenerResenasGoogle('ChIJ-prueba');
  const r2 = await scraper.buscarNegocioEnGoogle('ChIJ-prueba');
  const r3 = await scraper.obtenerResenasVisibles?.('ChIJ-prueba');
  soltar();

  // El contrato con el worker NO cambia: sigue siendo null.
  check('sigue devolviendo null (el contrato con el worker no se toca)', r1 === null && r2 === null);
  check('…pero ahora cada llamada queda REGISTRADA', salud.estadoPlaces().totalRechazos >= 2);
  check('🔴 y por fin lo DICE en el log — antes era cero líneas',
    log.some((l) => /RECHAZADA/.test(l) && /REQUEST_DENIED/.test(l)),
    `log: ${JSON.stringify(log)}`);
  check('el log trae el mensaje que da Google, que es el que dice qué pasa',
    log.some((l) => l.includes('Billing account is disabled')));
  check('el log dice dónde mirar: la facturación de Google Cloud',
    log.some((l) => /facturaci/i.test(l)));
  void r3;

  // Tres llamadas en un ciclo → alarma.
  salud.reiniciar();
  for (let i = 0; i < 3; i++) await scraper.obtenerResenasGoogle(`ChIJ-${i}`);
  check('tres fichas rechazadas en un ciclo encienden la alarma', salud.rechazando());

  // ⚠️ Un sitio que no existe NO puede escribir el log de alarma.
  salud.reiniciar();
  respuestaAxios = { data: { status: 'NOT_FOUND' } };
  escuchar();
  await scraper.obtenerResenasGoogle('ChIJ-no-existe');
  soltar();
  check('NOT_FOUND no escribe nada: un sitio que no está no es noticia', log.length === 0,
    `log: ${JSON.stringify(log)}`);
  check('…y cuenta como Google funcionando', salud.estadoPlaces().totalOk === 1);

  // El Nearby acepta ZERO_RESULTS como respuesta buena.
  salud.reiniciar();
  respuestaAxios = { data: { status: 'ZERO_RESULTS', results: [] } };
  const cerca = await scraper.buscarCompetidoresCercanos?.(-12, -77, 'restaurant', 'ChIJ-x');
  check('Nearby con ZERO_RESULTS sigue devolviendo una lista vacía, no null',
    Array.isArray(cerca) && cerca.length === 0, `devolvió ${JSON.stringify(cerca)}`);

  // Una petición que ni llegó.
  salud.reiniciar();
  axiosLanza = new Error('ECONNRESET');
  escuchar();
  const rRed = await scraper.obtenerResenasGoogle('ChIJ-red');
  soltar();
  axiosLanza = null;
  check('un error de red devuelve null y NO cuenta como rechazo de la cuenta',
    rRed === null && salud.estadoPlaces().rechazosSeguidos === 0);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n3. La otra mitad: ¿el escaneo sigue produciendo?');

  const dormancia = require('../src/lib/dormancia');
  const ahora = new Date('2026-09-22T12:00:00Z');
  const hace = (h) => new Date(ahora - h * 36e5);
  const usuarioPago = {
    plan: 'NEGOCIO', emailVerificado: true, creadoEn: hace(24 * 60), ultimoAcceso: hace(1),
    negocios: [{ id: 'n1' }],
  };
  const prismaCon = (usuarios, ultimo) => ({
    usuario: { findMany: async () => usuarios },
    snapshot: { findFirst: async () => (ultimo ? { tomadoEn: ultimo } : null) },
  });

  const vivo = await salud.estadoEscaneo(prismaCon([usuarioPago], hace(1)), dormancia, ahora);
  check('con un snapshot de hace 1 h, el escaneo está vivo', vivo.vigilando && !vivo.detenido);
  check('el umbral sale de la cadencia más rápida × margen (NEGOCIO: 4 h × 3 = 12 h)',
    vivo.umbralHoras === 4 * salud.MARGEN_CADENCIA, `umbral ${vivo.umbralHoras}`);

  const parado = await salud.estadoEscaneo(prismaCon([usuarioPago], hace(20)), dormancia, ahora);
  check('20 h sin un snapshot con un NEGOCIO por vigilar: el escaneo se paró', parado.detenido);

  const nunca = await salud.estadoEscaneo(prismaCon([usuarioPago], null), dormancia, ahora);
  check('sin NINGÚN snapshot y algo por vigilar, también está parado', nunca.detenido);

  // 🔴 El silencio que tiene que ser silencio.
  const dormido = { ...usuarioPago, plan: 'GRATIS', ultimoAcceso: hace(24 * 90), creadoEn: hace(24 * 120) };
  const nada = await salud.estadoEscaneo(prismaCon([dormido], hace(24 * 30)), dormancia, ahora);
  check('🔴 con todas las cuentas dormidas, cero snapshots es lo CORRECTO: no alarma',
    !nada.vigilando && nada.motivo === 'NADA_QUE_VIGILAR');

  const sinNegocio = await salud.estadoEscaneo(
    prismaCon([{ ...usuarioPago, negocios: [] }], null), dormancia, ahora);
  check('una cuenta de pago sin negocios activos tampoco obliga a escanear nada',
    !sinNegocio.vigilando);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n4. El veredicto que lee el monitor');

  salud.reiniciar();
  let v = await salud.veredicto(prismaCon([usuarioPago], hace(1)), dormancia, ahora);
  check('todo bien → vigilancia: ok', v.vigilancia === 'ok', JSON.stringify(v.vigilancia));

  ['REQUEST_DENIED', 'REQUEST_DENIED', 'REQUEST_DENIED'].forEach(salud.registrar);
  v = await salud.veredicto(prismaCon([usuarioPago], hace(1)), dormancia, ahora);
  check('🔴 Google rechazando → google_rechaza, AUNQUE los snapshots sean recientes',
    v.vigilancia === 'google_rechaza',
    'es justo el caso: el último snapshot es de antes del corte');
  check('el detalle dice qué mirar', /facturaci/i.test(v.detalle || ''));

  salud.reiniciar();
  v = await salud.veredicto(prismaCon([usuarioPago], hace(20)), dormancia, ahora);
  check('escaneo parado → escaneo_detenido', v.vigilancia === 'escaneo_detenido');

  const prismaRoto = {
    usuario: { findMany: async () => { throw new Error('connect ECONNREFUSED'); } },
    snapshot: { findFirst: async () => null },
  };
  let lanzo = false;
  try { v = await salud.veredicto(prismaRoto, dormancia, ahora); } catch { lanzo = true; }
  check('una base caída NO hace lanzar al veredicto (un fallo es un dato)', !lanzo);
  check('…y sale como sin_comprobar, que es rojo', v.vigilancia === 'sin_comprobar');

  salud.reiniciar();
  v = await salud.veredicto(prismaCon([dormido], null), dormancia, ahora);
  check('nada que vigilar → ok, no alarma', v.vigilancia === 'ok');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n5. Lo que tiene que seguir escrito en el fuente');

  // ⚠️ Se busca en el fuente SIN COMENTARIOS. La primera versión de esta sonda dio rojo
  // sobre el comentario del propio scraper, que cita la línea vieja para explicar el
  // arreglo — la sonda que no distingue código de comentario, por sexta vez (§19).
  const sinComentarios = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
  const fuenteScraper = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'scrapers', 'google.scraper.js'), 'utf8');
  const codigoScraper = sinComentarios(fuenteScraper);
  const RE_VIEJO = /if\s*\(\s*data\.status\s*!==\s*'OK'\s*\)\s*return\s+null\s*;/;
  check('🔴 no queda ningún `if (data.status !== \'OK\') return null;` mudo',
    !RE_VIEJO.test(codigoScraper), 'ese es el silencio que se tragaba REQUEST_DENIED');
  check('control: la sonda caza la forma vieja en CÓDIGO',
    RE_VIEJO.test(sinComentarios("    if (data.status !== 'OK') return null;")));
  check('control: y NO la caza dentro de un comentario que la cite',
    !RE_VIEJO.test(sinComentarios("// esto era `if (data.status !== 'OK') return null;` antes")));

  const llamadas = (fuenteScraper.match(/axios\.get\(/g) || []).length;
  const registros = (fuenteScraper.match(/salud\.registrar\(data\.status\)/g) || []).length;
  check(`cada llamada a Places registra su respuesta (${registros} de ${llamadas})`,
    llamadas > 0 && registros === llamadas,
    'una llamada nueva sin registrar es un rechazo que nadie ve');

  const fuenteIndex = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  check('la ruta del monitor existe', /app\.get\('\/health\/monitoreo'/.test(fuenteIndex));
  const bloqueHealth = fuenteIndex.slice(
    fuenteIndex.indexOf("app.get('/health',"), fuenteIndex.indexOf("app.get('/health/monitoreo'"));
  check('⚠️ `/health` sigue SIN tocar la base (es la sonda de vida de Railway)',
    !/prisma|veredicto|await/.test(bloqueHealth.split('});')[0]),
    'si /health consultara la base, un hipo de Postgres haría que Railway reiniciara el contenedor');
  check('la ruta del monitor responde 503 cuando algo va mal', /status\(v\.vigilancia === 'ok' \? 200 : 503\)/.test(fuenteIndex));
  check('y va ANTES del catch-all 404',
    fuenteIndex.indexOf("'/health/monitoreo'") < fuenteIndex.indexOf('Ruta no encontrada'));

  const fuenteMonitor = fs.readFileSync(
    path.join(__dirname, '..', '..', 'monitor-uptime', 'src', 'index.js'), 'utf8');
  check('el monitor de Cloudflare sondea /health/monitoreo', /health\/monitoreo/.test(fuenteMonitor),
    'sin esto la ruta existe y nadie la mira — que es el fallo original otra vez');

  console.log('\n──────────────────────────────────────────────────');
  console.log(`${ok} pasadas · ${fallos} fallidas`);
  process.exit(fallos ? 1 : 0);
})();
