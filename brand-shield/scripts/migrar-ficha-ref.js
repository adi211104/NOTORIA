// Mueve la referencia de la vigilancia de ficha de la tabla `alertas` a la
// columna `negocios.fichaGoogleRef`, y borra las filas de control que quedan.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
// Entre el 2026-08-17 y el 2026-08-18, la última foto de los datos de la ficha
// (teléfono, horario, nombre, dirección) se guardaba en una fila de `alertas`
// marcada con `detalle.motivo = 'ficha_control'`, porque añadir una columna
// exigía un `prisma db push` que Railway no corre en el deploy.
//
// Ya está la columna. Este script hace el traspaso una sola vez.
//
// ⚠️ Si NO se corre, no se rompe nada: el código nuevo se encuentra la columna
// vacía y vuelve a tomar la foto inicial en el siguiente escaneo. Lo que pasaría
// es que se perdería la referencia anterior —o sea, un cambio ocurrido entre
// medias no se detectaría— y las filas de control se quedarían para siempre en
// la tabla de alertas, ahora sin nadie que las filtre, así que el cliente las
// vería. Por eso conviene correrlo.
//
// Correr:
//   cd brand-shield
//   node scripts/migrar-ficha-ref.js            # dice qué haría, sin tocar nada
//   node scripts/migrar-ficha-ref.js --aplicar  # lo hace
//
// El .env local apunta a la base de PRODUCCIÓN: esto toca datos reales.

require('dotenv').config();
const prisma = require('../src/lib/prisma');

const aplicar = process.argv.includes('--aplicar');

(async () => {
  const filas = await prisma.alerta.findMany({
    where: { detalle: { path: ['motivo'], equals: 'ficha_control' } },
    select: { id: true, negocioId: true, detalle: true, creadaEn: true },
    orderBy: { creadaEn: 'asc' },
  });

  if (!filas.length) {
    console.log('\nNo hay filas de control que migrar. Nada que hacer.\n');
    return;
  }

  // Puede haber más de una por negocio si algo se duplicó: gana la más reciente,
  // que es la que el código estaba leyendo (`orderBy: creadaEn desc`).
  const porNegocio = new Map();
  for (const f of filas) porNegocio.set(f.negocioId, f);

  console.log(`\n${filas.length} fila(s) de control · ${porNegocio.size} negocio(s)\n`);

  if (!aplicar) {
    for (const [negocioId, f] of porNegocio) {
      const { motivo, ...foto } = f.detalle || {};
      console.log(`  ${negocioId}  →  tel:${foto.telefono || '—'}  horario:${foto.horarioHash ? 'sí' : '—'}`);
    }
    console.log(`\nEn seco. Vuelve a correrlo con --aplicar para migrarlas y borrar las ${filas.length} filas.\n`);
    return;
  }

  let migrados = 0;
  for (const [negocioId, f] of porNegocio) {
    const { motivo, ...foto } = f.detalle || {};
    try {
      await prisma.negocio.update({
        where: { id: negocioId },
        data: { fichaGoogleRef: foto },
      });
      migrados++;
    } catch (e) {
      // Un negocio borrado deja su fila de control huérfana. No es un fallo:
      // se salta y la fila se borra igual al final.
      console.error(`  ! ${negocioId}: ${e.message}`);
    }
  }

  const { count } = await prisma.alerta.deleteMany({
    where: { detalle: { path: ['motivo'], equals: 'ficha_control' } },
  });

  console.log(`\nMigrados ${migrados} negocio(s). Borradas ${count} fila(s) de control.\n`);
})()
  .catch((e) => { console.error('\nFATAL:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
