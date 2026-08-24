#!/usr/bin/env node
// scripts/prueba-planes.js
//
// Vigila la tabla de capacidades de src/lib/planes.js.
//
// ── Qué vigila y por qué ─────────────────────────────────────────────────────
//
// Añadir un plan al enum de Prisma es una línea. Que ese plan FUNCIONE toca 26
// sitios del backend, y los tres peores fallan sin producir ninguna señal:
//
//   · el cron de renovación no lo ve  → se cobra UNA vez y nunca más
//   · el cron de bajada no lo ve      → cancelar lo regala de por vida
//   · el tope de negocios cae al else → el plan más barato, con locales ilimitados
//
// Ninguno de los tres lanza una excepción, escribe un log ni falla un cargo. Por
// eso varios bloques de acá **leen el código fuente** en vez de ejercitar la
// lógica: un doble de Prisma devuelve lo que le pidas y nunca vería un filtro
// escrito a mano. Es el mismo método del bloque 6 de prueba-alertas-resena.js.

const fs = require('fs');
const path = require('path');

const planes = require('../src/lib/planes');
const { PRECIOS } = require('../src/lib/precios');

const RAIZ = path.join(__dirname, '..');
const SRC = path.join(RAIZ, 'src');

let ok = 0, fallos = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const titulo = (t) => console.log(`\n${t}`);

// Todos los .js de src/, para los bloques que leen el fuente.
const archivosJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return archivosJs(p);
  return e.name.endsWith('.js') ? [p] : [];
});
const FUENTES = archivosJs(SRC).map((f) => ({ ruta: path.relative(RAIZ, f), texto: fs.readFileSync(f, 'utf8') }));

// ─────────────────────────────────────────────────────────────────────────────
titulo('1. El enum de Prisma y la tabla dicen lo mismo');

const schema = fs.readFileSync(path.join(RAIZ, 'prisma', 'schema.prisma'), 'utf8');
const bloqueEnum = schema.match(/enum Plan \{([\s\S]*?)\}/);
check('el schema tiene un enum Plan', !!bloqueEnum);

const planesEnum = (bloqueEnum ? bloqueEnum[1] : '')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, '').trim())
  .filter((l) => /^[A-Z_]+$/.test(l));

check('todo valor del enum tiene fila en planes.js',
  planesEnum.every((p) => planes.PLANES[p]),
  `sin fila: ${planesEnum.filter((p) => !planes.PLANES[p]).join(', ')}`);

check('toda fila de planes.js existe en el enum',
  planes.ORDEN.every((p) => planesEnum.includes(p)),
  `sin enum: ${planes.ORDEN.filter((p) => !planesEnum.includes(p)).join(', ')}`);

check('IMPULSO está en el enum y en la tabla',
  planesEnum.includes('IMPULSO') && !!planes.PLANES.IMPULSO);

// ─────────────────────────────────────────────────────────────────────────────
titulo('2. 🔴 Cobrar y dejar de cobrar — los dos fallos que cuestan dinero');

// Si un plan tiene precio pero no es "de pago", el cron de renovación no lo
// selecciona: se cobra el alta y no vuelve a cobrarse nunca. El cliente conserva
// el plan gratis para siempre y no hay ni un log que lo diga.
check('todo plan con precio está en PLANES_DE_PAGO',
  Object.keys(PRECIOS).every((p) => planes.PLANES_DE_PAGO.includes(p)),
  `con precio y sin cobro: ${Object.keys(PRECIOS).filter((p) => !planes.PLANES_DE_PAGO.includes(p)).join(', ')}`);

// Y al revés: un plan marcado de pago sin precio reventaría el alta.
check('todo plan de pago tiene precio en precios.js',
  planes.PLANES_DE_PAGO.every((p) => PRECIOS[p]),
  `de pago y sin precio: ${planes.PLANES_DE_PAGO.filter((p) => !PRECIOS[p]).join(', ')}`);

check('GRATIS no es de pago', !planes.PLANES.GRATIS.esDePago);

check('cada precio mensual y anual es un entero de céntimos > 0',
  Object.values(PRECIOS).every((v) =>
    Number.isInteger(v.mensual) && v.mensual > 0 && Number.isInteger(v.anual) && v.anual > 0));

// El anual tiene que ser más barato que 12 mensualidades o el descuento que
// anuncia la web sería mentira.
check('el anual siempre ahorra frente a 12 mensualidades',
  Object.entries(PRECIOS).every(([, v]) => v.anual < v.mensual * 12));

check('IMPULSO cuesta S/29 al mes y S/276 al año',
  PRECIOS.IMPULSO.mensual === 2900 && PRECIOS.IMPULSO.anual === 27600);

check('IMPULSO es más barato que NEGOCIO',
  PRECIOS.IMPULSO.mensual < PRECIOS.NEGOCIO.mensual);

// ─────────────────────────────────────────────────────────────────────────────
titulo('3. La escalera no baja nunca');

// Subir de plan no puede QUITAR nada. Si alguna vez pasa, es un error de tabla,
// y el cliente que pagó más se quedaría con menos sin que nadie lo note.
const BOOLEANAS = Object.keys(planes.PLANES.GRATIS).filter((k) => typeof planes.PLANES.GRATIS[k] === 'boolean' && k !== 'esDePago');
const NUMERICAS = ['negocios', 'iaSemanal', 'competidores', 'asientos'];

for (let i = 1; i < planes.ORDEN.length; i++) {
  const bajo = planes.PLANES[planes.ORDEN[i - 1]];
  const alto = planes.PLANES[planes.ORDEN[i]];

  const perdidas = BOOLEANAS.filter((k) => bajo[k] && !alto[k]);
  check(`${alto.id} no pierde ninguna capacidad de ${bajo.id}`, perdidas.length === 0, perdidas.join(', '));

  const menores = NUMERICAS.filter((k) => alto[k] < bajo[k]);
  check(`${alto.id} no tiene menos cupo que ${bajo.id}`, menores.length === 0, menores.join(', '));

  // El escaneo es al revés: menos horas es mejor.
  check(`${alto.id} escanea igual o más seguido que ${bajo.id}`, alto.horasEscaneo <= bajo.horasEscaneo);
}

// ─────────────────────────────────────────────────────────────────────────────
titulo('4. Lo que se decidió para IMPULSO (2026-08-24)');

check('IMPULSO vigila la ficha de Google', planes.puede('IMPULSO', 'vigilanciaFicha'));
check('IMPULSO recibe el reporte PDF mensual', planes.puede('IMPULSO', 'reporteMensual'));
check('IMPULSO recibe la escalación de urgencias', planes.puede('IMPULSO', 'escalacionUrgencias'));
check('IMPULSO NO trae redes sociales', !planes.puede('IMPULSO', 'comentariosSociales'));
check('IMPULSO NO trae menciones', !planes.puede('IMPULSO', 'menciones'));
check('IMPULSO NO trae constancia', !planes.puede('IMPULSO', 'constancia'));
check('IMPULSO tiene 1 solo asiento (no comparte panel)', planes.limite('IMPULSO', 'asientos') === 1);
check('IMPULSO tiene 1 solo negocio', planes.limite('IMPULSO', 'negocios') === 1);
check('IMPULSO escanea cada 12 h', planes.limite('IMPULSO', 'horasEscaneo') === 12);
check('GRATIS sigue sin vigilancia de ficha', !planes.puede('GRATIS', 'vigilanciaFicha'));

// ─────────────────────────────────────────────────────────────────────────────
titulo('5. Un plan desconocido falla CERRADO, no abierto');

// Es el corazón del bug del ternario: `plan === 'GRATIS' ? 1 : ... : 999`.
// Cualquier valor inesperado tiene que comportarse como el plan más pobre.
check('capacidades() cae a GRATIS', planes.capacidades('NO_EXISTE').id === 'GRATIS');
check('un plan desconocido no vigila la ficha', !planes.puede('NO_EXISTE', 'vigilanciaFicha'));
check('un plan desconocido tiene 1 negocio, no 999', planes.limite('NO_EXISTE', 'negocios') === 1);
check('un plan desconocido no cobra', !planes.PLANES_DE_PAGO.includes('NO_EXISTE'));
check('puede() con capacidad inventada es false', !planes.puede('FRANQUICIA', 'inventada'));
check('limite() con clave inventada es 0, no undefined', planes.limite('FRANQUICIA', 'inventada') === 0);

// ─────────────────────────────────────────────────────────────────────────────
titulo('6. Infinity no se le enseña a un cliente');

check('FRANQUICIA no tiene tope de negocios', planes.limite('FRANQUICIA', 'negocios') === Infinity);
check('limiteLegible(Infinity) dice "ilimitados"', planes.limiteLegible(Infinity) === 'ilimitados');
check('limiteLegible(5) dice "5"', planes.limiteLegible(5) === '5');

// El mensaje de tope agotado se compone con limiteLegible, no interpolando el
// número crudo: "tu plan permite hasta Infinity negocio(s)" es exactamente la
// clase de detalle que hace que un producto de pago parezca un prototipo.
const rutaNegocios = FUENTES.find((f) => f.ruta.endsWith(path.join('routes', 'negocio.routes.js')));
check('negocio.routes.js usa limiteLegible en el mensaje de tope',
  rutaNegocios && /limiteLegible\(limite\)/.test(rutaNegocios.texto));

// ─────────────────────────────────────────────────────────────────────────────
titulo('7. Nadie volvió a escribir la lista de planes a mano');

// El bloque que de verdad protege al SIGUIENTE plan. Si alguien vuelve a poner
// ['NEGOCIO','FRANQUICIA'] en una ruta, ese plan nacerá roto igual que IMPULSO
// habría nacido, y nada más lo detectaría.
const conListaAMano = FUENTES.filter((f) =>
  f.ruta !== path.join('src', 'lib', 'planes.js') &&
  /\[\s*'(NEGOCIO|FRANQUICIA|IMPULSO)'\s*,\s*'(NEGOCIO|FRANQUICIA|IMPULSO)'/.test(f.texto.replace(/\/\/.*$/gm, '')));
check('ningún archivo arma a mano la lista de planes de pago',
  conListaAMano.length === 0, conListaAMano.map((f) => f.ruta).join(', '));

// Las tablas por plan también estaban duplicadas: cinco copias de "GRATIS: n".
const conTablaPropia = FUENTES.filter((f) =>
  f.ruta !== path.join('src', 'lib', 'planes.js') &&
  /GRATIS:\s*\d+/.test(f.texto));
check('ningún archivo mantiene su propia tabla de límites por plan',
  conTablaPropia.length === 0, conTablaPropia.map((f) => f.ruta).join(', '));

// ─────────────────────────────────────────────────────────────────────────────
titulo('8. Los dos crons de dinero filtran por PLANES_DE_PAGO');

const worker = FUENTES.find((f) => f.ruta.endsWith(path.join('workers', 'monitoreo.worker.js')));
const textoWorker = worker ? worker.texto : '';
const vecesPlanesDePago = (textoWorker.match(/plan:\s*\{\s*in:\s*PLANES_DE_PAGO\s*\}/g) || []).length;

check('la renovación y la bajada de plan usan PLANES_DE_PAGO', vecesPlanesDePago >= 2,
  `encontradas ${vecesPlanesDePago} de 2`);

check('el worker deriva la cadencia de la tabla, no de una copia',
  /ORDEN\.map\(\(plan\)\s*=>\s*\[plan,\s*capacidades\(plan\)\.horasEscaneo\]\)/.test(textoWorker));

check('la cadencia cubre TODOS los planes',
  planes.ORDEN.every((p) => Number.isFinite(planes.limite(p, 'horasEscaneo')) && planes.limite(p, 'horasEscaneo') > 0));

// ─────────────────────────────────────────────────────────────────────────────
titulo('9. El comprobante fiscal nombra bien el plan');

check('etiquetaDe cubre todos los planes',
  planes.ORDEN.every((p) => /^Plan /.test(planes.etiquetaDe(p))));
check('etiquetaDe("IMPULSO") es "Plan Impulso"', planes.etiquetaDe('IMPULSO') === 'Plan Impulso');
check('un plan desconocido no imprime undefined en la boleta',
  typeof planes.etiquetaDe('NO_EXISTE') === 'string' && planes.etiquetaDe('NO_EXISTE').length >= 5);

const comprobante = FUENTES.find((f) => f.ruta.endsWith(path.join('services', 'comprobante.service.js')));
check('comprobante.service.js usa etiquetaDe y no un mapa local',
  comprobante && /etiquetaDe\(pago\.plan\)/.test(comprobante.texto) && !/NEGOCIO: 'Plan Negocio'/.test(comprobante.texto));

// ─────────────────────────────────────────────────────────────────────────────
titulo('10. El catálogo de la web cuadra con lo que se cobra');

const catalogo = fs.readFileSync(path.join(RAIZ, '..', 'brand-shield-web', 'src', 'lib', 'catalogo.js'), 'utf8');
const entradas = [...catalogo.matchAll(/plan:\s*'([A-Z]+)',\s*periodo:\s*(?:'(\w+)'|null),[\s\S]*?precio:\s*(\d+)/g)]
  .map((m) => ({ plan: m[1], periodo: m[2] || null, precio: Number(m[3]) }));

check('el catálogo tiene entradas parseables', entradas.length >= 5, `encontradas ${entradas.length}`);

for (const e of entradas.filter((x) => x.periodo)) {
  const esperado = PRECIOS[e.plan] && PRECIOS[e.plan][e.periodo];
  check(`catálogo ${e.plan} ${e.periodo}: S/${e.precio} = ${esperado} céntimos`,
    esperado === e.precio * 100, `web dice ${e.precio * 100}, backend cobra ${esperado}`);
}

check('el catálogo publica IMPULSO en sus dos modalidades',
  entradas.filter((e) => e.plan === 'IMPULSO').length === 2);

// Culqi exige un mínimo de 5 ítems con precio visible en el catálogo público.
check('el catálogo mantiene al menos 5 ítems (requisito de Culqi)', entradas.length >= 5);

// ─────────────────────────────────────────────────────────────────────────────
titulo('11. El espejo del panel no se ha separado del backend');

// brand-shield-web/src/lib/planes.js decide lo que el panel PINTA; este archivo
// decide lo que el backend PERMITE. Si se separan, el usuario ve un botón que el
// servidor le contesta con 403 — y eso no se lee como "tu plan no lo incluye",
// se lee como "el producto está roto".
const espejoRuta = path.join(RAIZ, '..', 'brand-shield-web', 'src', 'lib', 'planes.js');
const espejo = fs.readFileSync(espejoRuta, 'utf8');

const filaDelEspejo = (plan) => {
  const m = espejo.match(new RegExp(`\\n  ${plan}: \\{([\\s\\S]*?)\\n  \\},`));
  if (!m) return null;
  const fila = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*(true|false|Infinity|\d+)/g)) {
    fila[k] = v === 'true' ? true : v === 'false' ? false : v === 'Infinity' ? Infinity : Number(v);
  }
  return fila;
};

check('el espejo declara los mismos planes',
  planes.ORDEN.every((p) => filaDelEspejo(p)),
  `faltan: ${planes.ORDEN.filter((p) => !filaDelEspejo(p)).join(', ')}`);

const CLAVES_ESPEJADAS = [...BOOLEANAS, ...NUMERICAS, 'horasEscaneo'];
for (const plan of planes.ORDEN) {
  const aca = planes.PLANES[plan];
  const alla = filaDelEspejo(plan) || {};
  const difieren = CLAVES_ESPEJADAS.filter((k) => aca[k] !== alla[k]);
  check(`${plan}: las ${CLAVES_ESPEJADAS.length} capacidades coinciden`, difieren.length === 0,
    difieren.map((k) => `${k}: backend=${aca[k]} panel=${alla[k]}`).join(' · '));
}

// Los nombres visibles viven SOLO en el panel, porque llevan idioma. Que el
// backend no los tenga es lo correcto; que el panel no los tenga sería un hueco.
check('el espejo trae nombre es/en de cada plan',
  planes.ORDEN.every((p) => new RegExp(`${p}:[\\s\\S]{0,200}?es: '[^']+', en: '[^']+'`).test(espejo)));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────');
console.log(`${ok} pasadas · ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
