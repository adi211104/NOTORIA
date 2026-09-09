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

// Y los scripts OPERATIVOS, que también deciden con el plan y hasta el 2026-08-30 no los
// miraba nadie: `dar-plan.js` y `cuenta-revisor.js` llevaban seis días rechazando IMPULSO
// porque tenían su propia copia de la lista. Se excluyen las pruebas y los ensayos, que sí
// enumeran planes a mano de forma legítima (recorrerlos es justamente su trabajo).
const ES_PRUEBA = (nombre) => /^(prueba|ensayo|sonda)-/.test(nombre);
const SCRIPTS = path.join(RAIZ, 'scripts');
const FUENTES_SCRIPTS = archivosJs(SCRIPTS)
  .filter((f) => !ES_PRUEBA(path.basename(f)))
  .map((f) => ({ ruta: path.relative(RAIZ, f), texto: fs.readFileSync(f, 'utf8') }));

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
titulo('6. Los locales se cobran, y eso no puede romperse en silencio');

// 🔴 Hasta el 2026-08-25 esta prueba afirmaba lo contrario —«FRANQUICIA no tiene
// tope de negocios»— porque la web prometía locales ilimitados. Eso perdía
// dinero: cada local vigilado cuesta consultas a Places y el precio era plano.
// Ahora todo plan incluye UN local y los demás se cobran (ver lib/precios.js).
//
// Lo que se vigila acá es la clase de fallo que no da ninguna señal: si el tope
// vuelve a salir del plan pelado, un cliente que pagó cuatro locales no puede
// cargar el segundo; y si la renovación deja de sumar los extras, los paga una
// vez y los conserva gratis para siempre.
const precios = require('../src/lib/precios');

check('ningún plan incluye más de un local', 
  planes.ORDEN.every((p) => planes.limite(p, 'negocios') === 1),
  planes.ORDEN.map((p) => `${p}:${planes.limite(p, 'negocios')}`).join(' '));
check('IMPULSO no vende locales sueltos (quien abre el segundo sube a NEGOCIO)',
  !planes.puede('IMPULSO', 'localesAdicionales'));
check('NEGOCIO y FRANQUICIA sí los venden',
  planes.puede('NEGOCIO', 'localesAdicionales') && planes.puede('FRANQUICIA', 'localesAdicionales'));

// Todo plan que VENDA locales tiene que tener precio para ellos. Sin esto, un
// plan nuevo con la capacidad encendida cobraría los locales a CERO.
for (const p of planes.ORDEN.filter((x) => planes.puede(x, 'localesAdicionales'))) {
  const pl = precios.precioLocal(p);
  check(`${p} tiene precio de local adicional (mensual y anual)`,
    !!pl && pl.mensual > 0 && pl.anual > 0, JSON.stringify(pl));
}

check('el tope real suma lo pagado: NEGOCIO + 3 locales = 4',
  planes.negociosPermitidos('NEGOCIO', 3) === 4);
check('un plan que no vende locales IGNORA los extras (no se regalan)',
  planes.negociosPermitidos('IMPULSO', 5) === 1);
check('sin dato de locales el tope es el del plan, no infinito',
  planes.negociosPermitidos('FRANQUICIA', undefined) === 1);
check('un número negativo no amplía ni reduce el tope',
  planes.negociosPermitidos('FRANQUICIA', -4) === 1);

// El cobro. Es la mitad que de verdad cuesta dinero si se rompe.
check('NEGOCIO mensual con 2 locales extra = 59 + 2×39 = S/137',
  precios.montoSuscripcion('NEGOCIO', false, 2) === 13700,
  String(precios.montoSuscripcion('NEGOCIO', false, 2)));
check('FRANQUICIA mensual con 3 locales extra = 179 + 3×99 = S/476',
  precios.montoSuscripcion('FRANQUICIA', false, 3) === 47600,
  String(precios.montoSuscripcion('FRANQUICIA', false, 3)));
check('IMPULSO nunca cobra locales aunque se los manden',
  precios.montoSuscripcion('IMPULSO', false, 9) === 2900);
check('el anual del local es el mensual con 20% menos, x12 (S/39 → S/31 × 12)',
  precios.montoSuscripcion('NEGOCIO', true, 1) === 56400 + 37200);
check('un plan inexistente cobra 0, no NaN',
  precios.montoSuscripcion('NO_EXISTE', false, 3) === 0);

// 🔴 El alta y la renovación tienen que usar la MISMA función. En este proyecto
// ya hubo dos copias del precio que se desincronizaron y cobraron el mensual a
// suscriptores anuales; con los locales el fallo sería peor porque es gratis
// para el cliente y silencioso para nosotros.
const fuenteCobro = [
  ['src/api/routes/pago.routes.js', 'el alta'],
  ['src/workers/monitoreo.worker.js', 'la renovación'],
];
for (const [ruta, quien] of fuenteCobro) {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', ruta), 'utf8');
  check(`${quien} calcula el monto con montoSuscripcion`, src.includes('montoSuscripcion'));
  check(`${quien} no lee PRECIOS[...] por su cuenta`, !/PRECIOS\[/.test(src),
    'una copia del precio es exactamente lo que este archivo existe para impedir');
}

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
//
// 🔴 Esta sonda tenía DOS agujeros hasta el 2026-08-30, y por los dos se le escapó el mismo
// bug real (`dar-plan.js` y `cuenta-revisor.js` rechazando IMPULSO):
//   1. solo barría `src/` y no abría `scripts/` jamás;
//   2. el regex exigía que el PRIMER elemento fuese un plan de pago, así que una lista que
//      empieza por 'GRATIS' pasaba limpia incluso dentro de `src/`.
// De ahí que la alternativa se derive de ORDEN y que abajo haya controles sintéticos: una
// sonda que no se comprueba a sí misma vuelve a mentir en cuanto cambia lo que vigila.
const ALT_PLANES = planes.ORDEN.join('|');
const RE_LISTA_A_MANO = new RegExp(`\\[\\s*'(${ALT_PLANES})'\\s*,\\s*'(${ALT_PLANES})'`);

// Control: la sonda tiene que saber ponerse en rojo, y con las DOS formas que se le escaparon.
check('la sonda caza la lista clásica de planes de pago',
  RE_LISTA_A_MANO.test("const P = ['NEGOCIO', 'FRANQUICIA'];"));
check('la sonda caza también la lista que empieza por GRATIS (el agujero de 2026-08-30)',
  RE_LISTA_A_MANO.test("const PLANES = ['GRATIS', 'NEGOCIO', 'FRANQUICIA'];"));
check('la sonda NO salta con texto inocente',
  !RE_LISTA_A_MANO.test("const x = ['uno', 'dos'];"));

// Los barridos que leen el fuente miran el CÓDIGO, no los comentarios: un
// comentario que menciona el patrón prohibido —normalmente el que explica por qué
// se quitó— no es una infracción. Se quitan también los bloques `/* */` desde el
// 2026-09-09, cuando el barrido de tablas por plan empezó a acusar al comentario
// que documentaba su propio arreglo.
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
const ES_FUENTE_UNICA = (ruta) => ruta === path.join('src', 'lib', 'planes.js');

const conListaAMano = FUENTES.filter((f) =>
  !ES_FUENTE_UNICA(f.ruta) && RE_LISTA_A_MANO.test(sinComentarios(f.texto)));
check('ningún archivo de src/ arma a mano la lista de planes',
  conListaAMano.length === 0, conListaAMano.map((f) => f.ruta).join(', '));

// 🔴 Lo que faltaba: los scripts operativos tocan producción y deciden con el plan.
const scriptsConLista = FUENTES_SCRIPTS.filter((f) => RE_LISTA_A_MANO.test(sinComentarios(f.texto)));
check('ningún script operativo arma a mano la lista de planes',
  scriptsConLista.length === 0, scriptsConLista.map((f) => f.ruta).join(', '));

// Y que el barrido mire de verdad ahí: si un día `archivosJs` dejara de encontrar scripts, los
// dos checks de arriba pasarían en verde sin haber leído nada. Es el fallo de la sonda que se
// da por buena porque no encontró nada.
check('el barrido de scripts/ encuentra los scripts operativos',
  FUENTES_SCRIPTS.some((f) => f.ruta.endsWith(path.join('scripts', 'dar-plan.js'))) &&
  FUENTES_SCRIPTS.some((f) => f.ruta.endsWith(path.join('scripts', 'cuenta-revisor.js'))),
  `solo encontró ${FUENTES_SCRIPTS.length}`);

// Los dos que estuvieron rotos, cada uno con su nombre, para que la regresión se lea sola.
for (const nombre of ['dar-plan.js', 'cuenta-revisor.js']) {
  const f = FUENTES_SCRIPTS.find((x) => x.ruta.endsWith(path.join('scripts', nombre)));
  check(`${nombre} acepta todos los planes de la tabla`,
    !!f && f.texto.includes('lib/planes'),
    'sigue con la lista escrita a mano');
}

// Las tablas por plan también estaban duplicadas: cinco copias de "GRATIS: n".
//
// ⚠️ Se barre el fuente SIN COMENTARIOS (ver `sinComentarios` arriba), y esto no
// es un aflojamiento de la regla. El 2026-09-09 esta sonda cazó de verdad una
// tabla `{ GRATIS: 5 }` recién escrita en `lib/prefsCorreo.js` —para eso existe—,
// pero cuando esa tabla se movió a la tabla de planes siguió dando rojo: el
// comentario que explicaba el arreglo mencionaba el patrón. Acusaba al comentario
// que documenta la corrección, y la salida fácil habría sido borrar la
// explicación. Un comentario no ejecuta nada; una tabla sí.
const conTablaPropia = FUENTES.filter((f) =>
  !ES_FUENTE_UNICA(f.ruta) && /GRATIS:\s*\d+/.test(sinComentarios(f.texto)));
check('ningún archivo mantiene su propia tabla de límites por plan',
  conTablaPropia.length === 0, conTablaPropia.map((f) => f.ruta).join(', '));
// 🔴 Y el control que hace que ese verde valga: la sonda tiene que seguir
// cazando una tabla de verdad, y seguir ignorando la misma cosa en un comentario.
check('CONTROL: la sonda caza una tabla por plan escrita en código',
  /GRATIS:\s*\d+/.test(sinComentarios('const TOPES = { GRATIS: 1, NEGOCIO: 5 };')));
check('CONTROL: y NO caza la misma cosa dentro de un comentario',
  !/GRATIS:\s*\d+/.test(sinComentarios('// antes había un { GRATIS: 5 } acá'))
  && !/GRATIS:\s*\d+/.test(sinComentarios('/* tabla vieja: GRATIS: 5 */')));

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
titulo('12. El landing no se ha separado de la escalera de planes');

// 🔴 Este bloque nació de dos fallos encontrados MIRANDO la página el 2026-08-29,
// con toda la suite en verde. Los dos son del mismo tipo: texto del landing que
// se quedó atrás al añadir IMPULSO, sin que nada fallara.
const landing = fs.readFileSync(path.join(RAIZ, '..', 'brand-shield-web', 'src', 'app', 'page.js'), 'utf8');

// (a) El CTA de cada tarjeta decidía el «Plan actual» por el ÍNDICE:
//     `i===0 ? ctaActual : ctaUpgrade`. O sea que a cualquiera con sesión el
//     landing le señalaba «Plan actual» sobre el Gratuito y «Actualizar» sobre
//     el plan que ya estaba pagando. Falla suave: el enlace va a un sitio
//     válido y nada revienta.
check('el CTA no vuelve a decidir el plan actual por el índice',
  !/i\s*===\s*0\s*\?\s*t\.precios\.ctaActual/.test(landing));
check('el CTA compara contra el plan del usuario',
  /usuario\?\.plan\s*===\s*planTarjeta/.test(landing));
check('el landing toma el orden de ORDEN, no de una lista a mano',
  /import \{ ORDEN \} from '\.\.\/lib\/planes'/.test(landing));

// (b) Las tarjetas del landing van en el MISMO orden que ORDEN, y cada una
//     declara la cadencia de su plan. Atarlo por la cadencia es lo que hace que
//     reordenar el array rompa la prueba en vez de romper la página.
const bloqueEs = landing.slice(landing.indexOf('planes: ['));
const tarjetas = bloqueEs.split(/\{ n:'/).slice(1, planes.ORDEN.length + 1);
check(`el landing declara ${planes.ORDEN.length} tarjetas de plan`,
  tarjetas.length === planes.ORDEN.length, `encontradas: ${tarjetas.length}`);

planes.ORDEN.forEach((plan, i) => {
  const h = planes.PLANES[plan].horasEscaneo;
  const esperado = h === 1 ? /cada hora/ : new RegExp(`cada ${h} horas`);
  check(`la tarjeta ${i + 1} es ${plan} y dice su cadencia (${h} h)`,
    !!tarjetas[i] && esperado.test(tarjetas[i]),
    `no encontré "${esperado}" en la tarjeta ${i + 1}`);
});

// Control: la sonda de arriba tiene que saber fallar. Con la cadencia de OTRO
// plan debe dar negativo, o estaría casando con cualquier cosa.
const cadenciasDistintas = planes.ORDEN
  .map((p) => planes.PLANES[p].horasEscaneo)
  .filter((h, i, a) => a.indexOf(h) === i);
check('CONTROL: la sonda de cadencia distingue (no casa con la de otro plan)',
  cadenciasDistintas.length > 1 &&
  !new RegExp(`cada ${planes.PLANES[planes.ORDEN[0]].horasEscaneo} horas`).test(tarjetas[1] || ''));

// (c) El resumen de funcionalidades enumera las cadencias A MANO, en los dos
//     idiomas. Decía «cada 1, 4 o 24 horas» y se comió las 12 h de IMPULSO, que
//     llevaba ahí desde el 2026-08-24 sin que nada fallara.
const frase = (re) => (landing.match(re) || [''])[0];
const resumenEs = frase(/Escaneo programado cada[^']*/);
const resumenEn = frase(/Scheduled scanning every[^']*/);
const numerosDe = (s) => (s.match(/\d+/g) || []).map(Number);

for (const h of cadenciasDistintas) {
  check(`el resumen de funciones menciona la cadencia de ${h} h (es)`,
    numerosDe(resumenEs).includes(h), `dice: "${resumenEs}"`);
  check(`el resumen de funciones menciona la cadencia de ${h} h (en)`,
    numerosDe(resumenEn).includes(h), `dice: "${resumenEn}"`);
}

// Controles: que las dos frases existan de verdad (si el texto se renombra, lo
// de arriba pasaría en vacío) y que la sonda no dé por bueno un número que no
// está — sin esto, «menciona la cadencia» no significaría nada.
check('CONTROL: las dos frases del resumen existen', !!resumenEs && !!resumenEn);
check('CONTROL: la sonda no ve una cadencia inventada',
  !numerosDe(resumenEs).includes(7) && !numerosDe(resumenEn).includes(7));

// ─────────────────────────────────────────────────────────────────────────────
titulo('13. El nav no ofrece una función que el plan no incluye');

// 🔴 Encontrado el 2026-08-29 abriendo el panel con una cuenta IMPULSO: el ítem
// «Menciones» salía en la barra lateral, y `mencion.routes.js` contestaba 403 al
// entrar. El nav se apoyaba, sin decirlo, en que Instagram estuviera APAGADO:
// con la única fuente oculta `hayFuenteDisponible` daba false para todos. Al
// encender INSTAGRAM_ACTIVO el 26/08 la muleta desapareció.
const perfilSrc = fs.readFileSync(path.join(RAIZ, 'src', 'api', 'routes', 'auth.routes.js'), 'utf8');
const lineaBandera = (perfilSrc.match(/mencionesDisponibles:.*/) || [''])[0];

check('el perfil existe y expone mencionesDisponibles', !!lineaBandera);
check('mencionesDisponibles mira TAMBIÉN el plan',
  /puede\(\s*req\.cuenta\.plan\s*,\s*'menciones'\s*\)/.test(lineaBandera),
  `dice: ${lineaBandera.trim()}`);
check('el sujeto es la CUENTA, no la persona (quien paga es la empresa)',
  !/req\.usuario\.plan/.test(lineaBandera));

// Control: la sonda tiene que saber ponerse en rojo. La versión anterior de esa
// línea —solo `hayFuenteDisponible(req.cuenta)`— debe fallarla.
check('CONTROL: la sonda rechaza la versión sin gating por plan',
  !/puede\(\s*req\.cuenta\.plan\s*,\s*'menciones'\s*\)/
    .test('mencionesDisponibles: hayFuenteDisponible(req.cuenta) });'));

// Y el otro lado: la ruta sigue gateada. Si alguna vez se quita de ahí, el nav
// dejaría de ser la última defensa.
const rutaMenciones = fs.readFileSync(path.join(RAIZ, 'src', 'api', 'routes', 'mencion.routes.js'), 'utf8');
check('la ruta de menciones sigue gateada por plan',
  /verificarPlan\(planesCon\('menciones'\)\)/.test(rutaMenciones));

// Los dos lados tienen que decir lo MISMO: el nav se calcula con `puede` y la
// ruta con `planesCon`, así que se comprueba que coincidan plan por plan.
for (const plan of planes.ORDEN) {
  check(`${plan}: nav y ruta coinciden sobre menciones`,
    planes.puede(plan, 'menciones') === planes.planesCon('menciones').includes(plan));
}

// ─────────────────────────────────────────────────────────────────────────────
titulo('14. Un cliente en mensual puede pasarse a anual');

// 🔴 El hueco que esto cierra: `/precios` comparaba SOLO el plan, así que a quien estaba en
// IMPULSO mensual le marcaba «Es tu plan actual» también sobre la tarjeta del ANUAL y le
// dejaba el botón apagado. No tenía por dónde contratar el anual — que es justo a lo que
// conviene empujar. Y no se podía arreglar sin exponer antes el periodo, que no viajaba.
const b14Precios = fs.readFileSync(path.join(RAIZ, '..', 'brand-shield-web', 'src', 'app', 'precios', 'page.js'), 'utf8');
const b14Auth = fs.readFileSync(path.join(RAIZ, 'src', 'api', 'routes', 'auth.routes.js'), 'utf8');
const b14Pagos = fs.readFileSync(path.join(RAIZ, 'src', 'api', 'routes', 'pago.routes.js'), 'utf8');

check('el perfil expone periodoFacturacion',
  /periodoFacturacion:\s*true/.test(b14Auth),
  'sin esto el panel no puede distinguir mensual de anual');

check('esActual compara también el periodo, no solo el plan',
  /periodoUsuario === item\.periodo/.test(b14Precios),
  'volvería a marcar el anual como «tu plan actual»');

check('el botón distingue un cambio de periodo de una compra nueva',
  /esCambioDePeriodo/.test(b14Precios));

// 🔴 Lo que de verdad cuesta dinero al cliente: el alta arrancaba el vencimiento en `new Date()`,
// así que pasarse a anual con veinte días pagados por delante los tiraba, sin decirlo. Ahora
// SUMA sobre lo ya pagado, igual que el cron de renovación.
check('el alta calcula el vencimiento sobre lo YA pagado, no desde hoy',
  /baseVencimiento/.test(b14Pagos) && /usuario\.fechaVencimiento\)\s*>\s*new Date\(\)/.test(b14Pagos),
  'volvería a tirar los días que el cliente ya pagó');

// Y que las dos puntas usen la MISMA regla: si el cron y el alta discrepan, el cliente ve una
// cosa al contratar y otra al renovar, y nadie compara los dos archivos.
const b14Worker = fs.readFileSync(path.join(RAIZ, 'src', 'workers', 'monitoreo.worker.js'), 'utf8');
check('el cron de renovación usa la misma regla del máximo',
  /fechaVencimiento\s*&&\s*usuario\.fechaVencimiento\s*>\s*new Date\(\)/.test(b14Worker));

// Control: las sondas de arriba tienen que poder ponerse en rojo.
check('la sonda del periodo sabe fallar (control)',
  !/periodoUsuario === item\.periodo/.test('const esActual = usuario?.plan === item.plan;'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────');
console.log(`${ok} pasadas · ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
