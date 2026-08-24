#!/usr/bin/env node
// scripts/respaldo.js
//
// Copia de seguridad de la base de producción, a un archivo JSON local.
//
//   node scripts/respaldo.js                    → crea el respaldo
//   node scripts/respaldo.js --verificar <ruta> → lo contrasta contra la base viva
//
// ── Por qué esto importa más de lo que parece con 0 clientes ─────────────────
//
// Lo que hay en esa base no son «datos de prueba». Son **1800+ snapshots desde
// julio**, y esa serie de tiempo es lo único de Notoria que no se puede volver a
// conseguir: Google enseña la foto de hoy, no la película. Si mañana se pierde,
// no se restaura pagando ni programando — se restaura esperando otro año.
// Todo lo demás (código, configuración, secretos) tiene copia en otro sitio.
//
// 🔴 Y la regla que hace que un respaldo sirva: **tener copia ≠ saber
// restaurarla**. Por eso existe `--verificar`, y por eso el archivo guarda los
// conteos: un respaldo que nadie contrastó nunca es una suposición con nombre
// de archivo.
//
// ── Qué cubre y qué NO ───────────────────────────────────────────────────────
//
// SÍ: todas las filas de todas las tablas, con sus fechas y relaciones por id.
// NO: es un volcado lógico, no un point-in-time. Para restaurar hace falta una
//     base vacía + `npx prisma db push` (que crea el esquema) y luego reinsertar
//     en el orden de DEPENDENCIAS que declara este mismo archivo.
// NO: no sustituye a los respaldos de Railway si los hay — los complementa, y
//     sobre todo los hace innecesarios para el caso que de verdad duele.
//
// ⚠️ El archivo lleva datos personales (correos, y del Libro de Reclamaciones
// también DNI y domicilios de terceros, protegidos por la Ley 29733). NO va a
// git —está cubierto por el .gitignore— y no debe subirse a ningún sitio
// compartido sin cifrar.
//
// ⚠️ `railway run` NO sirve: inyecta la URL interna de Postgres. Se corre en
// local, donde el .env apunta al proxy público.

const fs = require('fs');
const path = require('path');
const prisma = require('../src/lib/prisma');

// El orden es de PADRES a HIJOS, y es la parte que hay que respetar al
// restaurar: insertar una reseña antes que su negocio viola la clave foránea.
// Se declara acá y no se deduce para que restaurar no dependa de adivinar.
const TABLAS = [
  'usuario',
  'negocio',
  'snapshot',
  'resena',
  'alerta',
  'competidor',
  'snapshotCompetidor',
  'comentarioSocial',
  'mencion',
  'pago',
  'serieComprobante',
  'comprobante',
  'resumenSunat',
  'reclamacion',
  'promoTarjeta',
  'miembro',
  'invitacion',
  'registroActividad',
];

const DESTINO = path.join(__dirname, '..', 'respaldos');

const leerTodo = async () => {
  const datos = {};
  const conteos = {};
  for (const tabla of TABLAS) {
    if (!prisma[tabla]) {
      // Una tabla del listado que ya no existe en el schema. Se avisa en vez de
      // reventar: el respaldo de las demás sigue siendo válido y útil.
      console.warn(`  [!] ${tabla}: no existe en el cliente de Prisma, se omite`);
      continue;
    }
    const filas = await prisma[tabla].findMany();
    datos[tabla] = filas;
    conteos[tabla] = filas.length;
    console.log(`  ${tabla.padEnd(20)} ${String(filas.length).padStart(6)} filas`);
  }
  return { datos, conteos };
};

const crear = async () => {
  console.log('\n═══ RESPALDO DE PRODUCCIÓN ═══\n');
  const { datos, conteos } = await leerTodo();

  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivo = path.join(DESTINO, `notoria-${sello}.json`);

  fs.mkdirSync(DESTINO, { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify({
    // Los conteos se guardan DENTRO del archivo a propósito: son lo que permite
    // comprobar más tarde que el volcado está completo sin volver a la base.
    meta: {
      creadoEn: new Date().toISOString(),
      totalFilas: total,
      conteos,
      // El orden de restauración viaja con los datos. Un respaldo que obliga a
      // reconstruir el orden de las claves foráneas a mano el día del incendio
      // es medio respaldo.
      ordenRestauracion: TABLAS,
      nota: 'Volcado lógico. Para restaurar: base vacía + npx prisma db push, luego insertar en ordenRestauracion.',
    },
    datos,
  }, null, 2), 'utf8');

  const mb = (fs.statSync(archivo).size / 1048576).toFixed(2);
  console.log(`\n  Total: ${total} filas · ${mb} MB`);
  console.log(`  → ${archivo}`);
  console.log('\n  Ahora compruébalo (tener copia no es saber restaurarla):');
  console.log(`     node scripts/respaldo.js --verificar "${archivo}"\n`);
};

const verificar = async (ruta) => {
  console.log('\n═══ VERIFICACIÓN DEL RESPALDO ═══\n');
  if (!fs.existsSync(ruta)) { console.error(`  No existe: ${ruta}`); process.exit(1); }

  let copia;
  try { copia = JSON.parse(fs.readFileSync(ruta, 'utf8')); }
  catch (e) { console.error(`  El archivo no es JSON válido: ${e.message}`); process.exit(1); }

  if (!copia.meta || !copia.datos) { console.error('  Le falta meta o datos: no es un respaldo de este script.'); process.exit(1); }

  console.log(`  Creado el ${copia.meta.creadoEn}`);
  console.log(`  Dice tener ${copia.meta.totalFilas} filas\n`);

  let fallos = 0;

  // 1. ¿El archivo es coherente consigo mismo? Un JSON truncado por un disco
  // lleno pasa la lectura y pierde filas sin decir nada.
  for (const [tabla, esperado] of Object.entries(copia.meta.conteos)) {
    const real = (copia.datos[tabla] || []).length;
    const bien = real === esperado;
    if (!bien) fallos++;
    console.log(`  ${bien ? '✓' : '✗'} ${tabla.padEnd(20)} archivo: ${String(real).padStart(6)} / declaradas: ${esperado}`);
  }

  // 2. ¿Se pueden reconstruir los objetos? Una fecha que viajó mal deja el
  // respaldo inservible justo el día que se necesita.
  const muestra = copia.datos.snapshot?.[0];
  if (muestra) {
    const fechaOk = !Number.isNaN(new Date(muestra.tomadoEn).getTime());
    if (!fechaOk) fallos++;
    console.log(`  ${fechaOk ? '✓' : '✗'} las fechas se releen correctamente`);
  }

  // 3. Contra la base VIVA: cuánto ha cambiado desde el respaldo. No es un
  // fallo que haya diferencias —el producto sigue corriendo—, pero sí dice
  // cuánto se perdería si hubiera que restaurar por este archivo ahora mismo.
  console.log('\n  ── Contra la base viva ──');
  const { conteos: ahora } = await leerTodo();
  let deriva = 0;
  for (const [tabla, n] of Object.entries(ahora)) {
    const enCopia = copia.meta.conteos[tabla] ?? 0;
    if (n !== enCopia) { deriva += Math.abs(n - enCopia); console.log(`     ${tabla}: ${enCopia} → ${n} (${n - enCopia >= 0 ? '+' : ''}${n - enCopia})`); }
  }
  console.log(`\n  Filas que se perderían restaurando por esta copia: ${deriva}`);

  console.log(fallos === 0
    ? '\n  ✓ El respaldo está íntegro.\n'
    : `\n  ✗ ${fallos} problema(s). NO confiar en esta copia.\n`);
  process.exit(fallos ? 1 : 0);
};

(async () => {
  const i = process.argv.indexOf('--verificar');
  if (i !== -1) await verificar(process.argv[i + 1]);
  else await crear();
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
