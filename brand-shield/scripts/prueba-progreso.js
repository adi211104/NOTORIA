// brand-shield/scripts/prueba-progreso.js
// Pruebas de la comparación mensual. Todo puro: no toca base ni red.
//
//   node scripts/prueba-progreso.js
//
// Lo que se vigila son las tres decisiones que, si se deshacen, hacen que el
// panel afirme cosas falsas con toda naturalidad:
//
//   · `null` (no se midió) confundido con 0 (no pasó nada)
//   · un delta de reseñas negativo aplastado a 0 — Google borra reseñas
//   · un movimiento de rating de 0.1 presentado como una mejora, cuando cabe
//     entero dentro del redondeo a un decimal que publica Google

const {
  periodosMensuales, medirPeriodo, compararMeses,
  ordenarPorCrecimiento, hayAlgoQueContar, RATING_MINIMO_SIGNIFICATIVO,
} = require('../src/lib/progreso');

let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const AHORA = new Date('2026-08-23T12:00:00');
const snap = (fecha, rating, total) => ({ tomadoEn: new Date(fecha), ratingActual: rating, totalResenas: total });

// ── 1. Los periodos ───────────────────────────────────────
bloque('1. Qué se compara con qué');

const p = periodosMensuales(AHORA);
check('el mes actual arranca el día 1', p.actual.desde.getDate() === 1 && p.actual.desde.getMonth() === 7);
check('el mes previo es julio entero', p.previo.desde.getMonth() === 6 && p.previo.hasta.getMonth() === 7);
check('el mes actual llega hasta hoy, no hasta fin de mes', p.actual.hasta.getDate() === 23);

const dic = periodosMensuales(new Date('2026-01-15T12:00:00'));
check('en enero el mes previo es diciembre del año anterior',
  dic.previo.desde.getMonth() === 11 && dic.previo.desde.getFullYear() === 2025,
  'restar 1 al mes sin cuidar el año es el error clásico');

// ── 2. Medir un periodo ───────────────────────────────────
bloque('2. Medir un periodo');

const agosto = { desde: new Date('2026-08-01'), hasta: new Date('2026-08-24') };

let m = medirPeriodo([snap('2026-08-02', 4.0, 100), snap('2026-08-20', 4.0, 114)], agosto);
check('las reseñas nuevas son la diferencia entre la primera y la última lectura', m.resenasNuevas === 14);
check('  …y se informa cuántas lecturas la sostienen', m.lecturas === 2);

m = medirPeriodo([snap('2026-08-02', 4.0, 100)], agosto);
check('🔴 con una sola lectura devuelve null, no cero', m === null,
  'un 0 diría "tu mes fue plano" cuando lo cierto es que no se midió');

m = medirPeriodo([], agosto);
check('sin lecturas también null', m === null);

m = medirPeriodo([snap('2026-07-20', 4.0, 100), snap('2026-07-28', 4.0, 108)], agosto);
check('las lecturas de otro mes no cuentan', m === null);

m = medirPeriodo([snap('2026-08-02', 4.1, 11), snap('2026-08-20', 4.0, 10)], agosto);
check('🔴 perder reseñas se informa en negativo, no se aplasta a 0', m.resenasNuevas === -1,
  'Google borra reseñas: pasó de verdad el 31 de julio');

m = medirPeriodo([snap('2026-08-20', 4.0, 114), snap('2026-08-02', 4.0, 100)], agosto);
check('el orden en que lleguen las filas da igual', m.resenasNuevas === 14);

// ── 3. El rating y su redondeo ────────────────────────────
bloque('3. Rating: cuándo se puede afirmar que se movió');

m = medirPeriodo([snap('2026-08-02', 4.0, 100), snap('2026-08-20', 4.1, 114)], agosto);
check('un movimiento de 0.1 se muestra…', m.deltaRating === 0.1);
check('  …pero NO se declara significativo', m.ratingSignificativo === false,
  'cabe entero dentro del redondeo a un decimal que publica Google');

m = medirPeriodo([snap('2026-08-02', 4.0, 100), snap('2026-08-20', 4.2, 114)], agosto);
check(`a partir de ${RATING_MINIMO_SIGNIFICATIVO} sí`, m.ratingSignificativo === true);

m = medirPeriodo([snap('2026-08-02', 4.5, 100), snap('2026-08-20', 4.2, 114)], agosto);
check('una CAÍDA de 0.3 también es significativa', m.ratingSignificativo === true && m.deltaRating === -0.3);

m = medirPeriodo([snap('2026-08-02', 4.3, 100), snap('2026-08-20', 4.1, 114)], agosto);
check('no hay basura de coma flotante en el delta', m.deltaRating === -0.2,
  '4.3 - 4.1 da 0.19999999999999973 sin redondear');

// ── 4. Mes contra mes ─────────────────────────────────────
bloque('4. Este mes contra el anterior');

const historial = [
  snap('2026-07-02', 3.9, 80), snap('2026-07-29', 3.9, 90),
  snap('2026-08-02', 3.9, 91), snap('2026-08-20', 4.0, 105),
];

let c = compararMeses(historial, AHORA);
check('mide los dos meses', c.actual.resenasNuevas === 14 && c.previo.resenasNuevas === 10);
check('la aceleración es la diferencia entre ambos', c.aceleracion === 4);

c = compararMeses([snap('2026-08-02', 3.9, 91), snap('2026-08-20', 4.0, 105)], AHORA);
check('🔴 sin mes previo la aceleración es null, no 14', c.aceleracion === null,
  'comparar contra un mes que no se midió sería inventar el dato');
check('  …aunque el mes actual sí se informe', c.actual.resenasNuevas === 14);

// ── 5. Ordenar sujetos ────────────────────────────────────
bloque('5. Ordenar negocios y competidores');

const sujeto = (nombre, resenasNuevas) => ({
  nombre,
  actual: resenasNuevas === null ? null : { resenasNuevas, ratingSignificativo: false },
});

let orden = ordenarPorCrecimiento([sujeto('A', 3), sujeto('B', 14), sujeto('C', 0)]);
check('el que más creció va primero', orden.map((s) => s.nombre).join('') === 'BAC');

orden = ordenarPorCrecimiento([sujeto('A', 3), sujeto('SinDatos', null), sujeto('C', 0)]);
check('🔴 los que no se midieron van al final, no mezclados con los que no crecieron',
  orden[2].nombre === 'SinDatos');
check('  …y conservan su null', orden[2].actual === null);

orden = ordenarPorCrecimiento([sujeto('A', -2), sujeto('B', 0)]);
check('perder reseñas ordena por debajo de no ganar ninguna', orden[1].nombre === 'A');

// ── 6. ¿Vale la pena enseñarlo? ───────────────────────────
bloque('6. La regla de "lo que no se puede entregar, no se muestra"');

check('si todo es null, no hay nada que contar',
  hayAlgoQueContar([sujeto('A', null), sujeto('B', null)]) === false);
check('si todo es cero, tampoco',
  hayAlgoQueContar([sujeto('A', 0), sujeto('B', 0)]) === false,
  'una pantalla de progreso con todo en cero es peor que no tener pantalla');
check('con un solo movimiento real, sí',
  hayAlgoQueContar([sujeto('A', 0), sujeto('B', 5)]) === true);
check('un rating que se movió de verdad también cuenta como algo que contar',
  hayAlgoQueContar([{ nombre: 'A', actual: { resenasNuevas: 0, ratingSignificativo: true } }]) === true);

// ── Resumen ───────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────────');
console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
if (fallidas) process.exit(1);
