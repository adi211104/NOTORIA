// Pruebas de la máquina de estados del monitor — 2026-09-22.
//
//   node prueba-monitor.mjs
//
// Ejercita el Worker DE VERDAD —su `fetch` exportado, el mismo que llama Cloudflare—
// con un `fetch` global falso que decide qué contesta cada URL y un KV en memoria. No
// llama a producción ni a Resend.
//
// 🔴 Lo que vigila, por orden de lo caro que sale:
//   1. Que una sonda que cae se avise AUNQUE otra ya estuviera caída. Con el estado
//      booleano de antes, Vigilancia en rojo varios días (la tarjeta de Google) dejaba
//      al monitor ciego ante una caída de Railway encima. Es el agujero que la sonda
//      nueva habría abierto en la vieja.
//   2. Que una sonda que SIGUE caída calle. Es la regla que hace que los avisos se lean.
//   3. Que el estado viejo `{caido, desde}` no dispare un correo fantasma el día del
//      despliegue.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

// El Worker es un módulo ES en un paquete sin "type":"module": se copia a .mjs para
// importarlo tal cual, sin tocar una línea.
const tmp = path.join(os.tmpdir(), `monitor-${process.pid}.mjs`);
fs.writeFileSync(tmp, fs.readFileSync(path.join(aqui, 'src', 'index.js'), 'utf8'));
const worker = (await import(pathToFileURL(tmp).href)).default;

// El reintento espera 4 s entre medidas; acá no hace falta esperar de verdad.
globalThis.setTimeout = (fn) => { fn(); return 0; };

let ok = 0;
let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok += 1; console.log(`  ✓ ${nombre}`); }
  else { fallos += 1; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};

// ── El mundo falso ─────────────────────────────────────────────────────────
const estado = { api: 'ok', landing: 'ok', vigilancia: 'ok' };
const correos = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u === 'https://api.resend.com/emails') {
    correos.push(JSON.parse(opts.body));
    return new Response('{"id":"falso"}', { status: 200 });
  }
  if (u === 'https://api.usenotoria.app/health') {
    if (estado.api === 'caida') throw new Error('connect ECONNREFUSED');
    return new Response('{"status":"ok"}', { status: 200 });
  }
  if (u === 'https://usenotoria.app') {
    if (estado.landing === 'caida') return new Response('Bad gateway', { status: 502 });
    return new Response('<html>Notoria</html>', { status: 200 });
  }
  if (u === 'https://api.usenotoria.app/health/monitoreo') {
    if (estado.api === 'caida') throw new Error('connect ECONNREFUSED');
    if (estado.vigilancia === 'ok') return new Response('{"vigilancia":"ok"}', { status: 200 });
    return new Response(JSON.stringify({
      vigilancia: 'google_rechaza',
      detalle: 'Places devuelve REQUEST_DENIED (3 seguidos). Casi siempre es la facturación del proyecto de Google Cloud o la llave.',
    }), { status: 503 });
  }
  throw new Error(`URL no prevista en la prueba: ${u}`);
};

const kv = new Map();
const env = {
  RESEND_API_KEY: 'prueba',
  ESTADO: {
    get: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null),
    put: async (k, v) => { kv.set(k, v); },
  },
};

const ciclo = async () => {
  const antes = correos.length;
  const res = await worker.fetch(new Request('https://monitor.test/'), env);
  const cuerpo = await res.json();
  return { ...cuerpo, correosNuevos: correos.slice(antes) };
};

// ────────────────────────────────────────────────────────────────────────────
console.log('\n1. Todo bien');
let r = await ciclo();
check('todo en verde: sin cambio y sin correo', r.cambio === 'sin-cambio' && r.correosNuevos.length === 0);
check('las TRES sondas se miden', r.resultados.length === 3 && r.resultados.some((x) => x.nombre === 'Vigilancia'));

console.log('\n2. Google empieza a rechazar');
estado.vigilancia = 'rechaza';
r = await ciclo();
check('se avisa UNA vez', r.correosNuevos.length === 1);
const asunto1 = r.correosNuevos[0]?.subject || '';
check('🔴 el asunto dice que dejó de VIGILAR, no que «no responde»',
  /dejó de vigilar/.test(asunto1) && !/Vigilancia no responde/.test(asunto1), asunto1);
check('el correo trae el PORQUÉ del cuerpo del 503, no un «HTTP 503» a secas',
  /google_rechaza/.test(r.correosNuevos[0]?.html || '') && /facturaci/.test(r.correosNuevos[0]?.html || ''));
check('va marcado como urgente', r.correosNuevos[0]?.headers?.['X-Priority'] === '1');

console.log('\n3. Sigue rechazando');
r = await ciclo();
check('la regla de siempre: lo que SIGUE caído calla', r.correosNuevos.length === 0 && r.cambio === 'sin-cambio');
r = await ciclo();
check('…y sigue callando en el ciclo siguiente', r.correosNuevos.length === 0);

console.log('\n4. 🔴 Con Vigilancia en rojo, se cae además la API');
estado.api = 'caida';
r = await ciclo();
check('🔴 SE AVISA — con el estado booleano de antes, esto era silencio',
  r.correosNuevos.length === 1, `correos: ${r.correosNuevos.length}`);
check('el asunto nombra lo NUEVO (la API), no lo que ya se sabía',
  /API no responde/.test(r.correosNuevos[0]?.subject || '') && !/dejó de vigilar/.test(r.correosNuevos[0]?.subject || ''),
  r.correosNuevos[0]?.subject);
check('y el cuerpo dice que Vigilancia ya estaba caída de antes',
  /ya estaba caído de antes/.test(r.correosNuevos[0]?.html || ''));

console.log('\n5. La API vuelve; Vigilancia sigue en rojo');
estado.api = 'ok';
r = await ciclo();
check('se avisa la vuelta de la API', r.correosNuevos.length === 1 && /Restablecido — API/.test(r.correosNuevos[0]?.subject || ''),
  r.correosNuevos[0]?.subject);
check('⚠️ y el correo NO dice que todo va bien: Vigilancia sigue caída',
  /Sigue caído/.test(r.correosNuevos[0]?.html || '') && /Vigilancia/.test(r.correosNuevos[0]?.html || ''));

console.log('\n6. Se arregla la tarjeta');
estado.vigilancia = 'ok';
r = await ciclo();
check('se avisa la vuelta de la vigilancia', r.correosNuevos.length === 1 && /Vigilancia/.test(r.correosNuevos[0]?.subject || ''));
check('y ahora sí: «Ya responde con normalidad»', /Ya responde con normalidad/.test(r.correosNuevos[0]?.html || ''));
r = await ciclo();
check('después, silencio', r.correosNuevos.length === 0);

console.log('\n7. El estado del formato viejo `{caido, desde}`');
kv.set('estado', JSON.stringify({ caido: true, desde: '2026-09-22T10:00:00.000Z' }));
estado.landing = 'caida';
r = await ciclo();
check('🔴 caído en el formato viejo y sigue caído: NO hay correo fantasma de «nueva caída»',
  r.correosNuevos.length === 0, `mandó: ${r.correosNuevos.map((c) => c.subject)}`);
check('el estado se re-escribe en el formato nuevo en cuanto algo cambia',
  (() => { estado.landing = 'ok'; return true; })());
r = await ciclo();
check('al volver, se avisa la recuperación', r.correosNuevos.length === 1 && /Restablecido/.test(r.correosNuevos[0]?.subject || ''));
check('y la duración sale de la hora vieja', /minuto/.test(r.correosNuevos[0]?.html || ''));
check('el estado guardado ya es el nuevo', Array.isArray(JSON.parse(kv.get('estado')).caidas));

kv.set('estado', JSON.stringify({ caido: false, desde: null }));
r = await ciclo();
check('formato viejo sin caída y todo bien: nada', r.correosNuevos.length === 0);

// El caso que la primera versión ni contemplaba: el formato viejo decía «caído» y
// cuando llega el despliegue ya se recuperó. El código viejo habría avisado la vuelta.
kv.set('estado', JSON.stringify({ caido: true, desde: new Date(Date.now() - 30 * 60000).toISOString() }));
r = await ciclo();
check('formato viejo caído y ahora todo bien: se avisa la recuperación, no se traga',
  r.correosNuevos.length === 1 && /Restablecido/.test(r.correosNuevos[0]?.subject || ''),
  `correos: ${r.correosNuevos.map((c) => c.subject)}`);
check('…sin inventar qué sonda era', /el servicio/.test(r.correosNuevos[0]?.subject || ''),
  r.correosNuevos[0]?.subject);
r = await ciclo();
check('y el ciclo siguiente calla', r.correosNuevos.length === 0);

console.log('\n8. Sin KV (el monitor tiene que seguir funcionando igual)');
const sinKv = { RESEND_API_KEY: 'prueba' };
const res = await worker.fetch(new Request('https://monitor.test/'), sinKv);
check('sin KV no lanza', res.status === 200);

// ────────────────────────────────────────────────────────────────────────────
console.log('\n9. Controles: las sondas de arriba saben ponerse en rojo');
// Si el paso 4 pasara por casualidad, este control lo diría: con Vigilancia y API ya
// caídas y guardadas, volver a medir lo mismo NO puede mandar nada.
kv.clear();
estado.vigilancia = 'rechaza'; estado.api = 'caida';
await ciclo();
r = await ciclo();
check('control: el mismo par caído dos veces seguidas no repite el aviso', r.correosNuevos.length === 0);
estado.vigilancia = 'ok'; estado.api = 'ok';

fs.unlinkSync(tmp);
console.log('\n──────────────────────────────────────────────────');
console.log(`${ok} pasadas · ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
