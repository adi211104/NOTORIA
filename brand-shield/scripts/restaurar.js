// brand-shield/scripts/restaurar.js
//
// Simulacro de RESTAURACIÓN (réplica del auditor, 2026-10-07, §8): «tener copia
// ≠ saber restaurarla». Toma un archivo de `respaldo.js`, lo carga en una base
// Postgres VACÍA, comprueba fila por fila que entró todo, y levanta la API
// real contra la base restaurada para ver que sirve: usuarios, negocios,
// pagos, suscripciones, webhooks. Mide cuánto tarda (el RTO real).
//
//   RESTAURAR_DATABASE_URL=postgresql://postgres@localhost:55432/notoria_restaurada_test \
//     node scripts/restaurar.js respaldos/notoria-AAAA-MM-DDTHH-MM-SS.json
//
// 🔴 Solo restaura en una base LOCAL cuyo nombre contenga «test»: hace
// `db push --force-reset`. Restaurar PRODUCCIÓN de verdad es el mismo
// procedimiento con la URL de una base nueva de Railway — y quitando ese
// candado a propósito, con el respaldo verificado antes.
//
// ⚠️ Los tokens OAuth del respaldo van CIFRADOS (TOKENS_CLAVE): sin esa clave
// la base restaurada funciona, pero TikTok/Instagram quedan desconectados y hay
// que reconectarlos. Por eso TOKENS_CLAVE tiene que vivir fuera de Railway
// (docs/secretos.md).

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const archivo = process.argv[2];
const URL_DESTINO = process.env.RESTAURAR_DATABASE_URL;
if (!archivo || !URL_DESTINO) {
  console.error('Uso: RESTAURAR_DATABASE_URL=<postgres local *test*> node scripts/restaurar.js <respaldo.json>');
  process.exit(2);
}
const u = new URL(URL_DESTINO);
if (!['localhost', '127.0.0.1', 'postgres'].includes(u.hostname) || !/test/i.test(u.pathname)) {
  console.error(`🔴 Me niego: ${u.hostname}${u.pathname} no es una base local de prueba.`);
  process.exit(2);
}

// Ninguna credencial real en este proceso (Prisma rellena desde el .env lo no
// definido: CLAUDE.md §16). La API levantada no puede mandar correos ni cobrar.
const rutaEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(rutaEnv)) for (const k of Object.keys(require('dotenv').parse(fs.readFileSync(rutaEnv)))) process.env[k] = '';
Object.assign(process.env, {
  DATABASE_URL: URL_DESTINO, NODE_ENV: 'test', PORT: '3998',
  JWT_SECRET: 'restaurar-jwt', TOKENS_CLAVE: 'c'.repeat(64), PROMO_HASH_SECRET: 'x', DOCUMENTOS_SECRET: 'x',
});

const t0 = Date.now();
const seg = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
let fallos = 0;
const check = (m, cond, extra = '') => { if (cond) console.log(`  ✓ ${m}`); else { fallos += 1; console.error(`  ✗ ${m}${extra ? ` — ${extra}` : ''}`); } };

(async () => {
  console.log(`\n═══ SIMULACRO DE RESTAURACIÓN ═══\n  Respaldo: ${archivo}\n  Destino:  ${u.hostname}${u.pathname}\n`);
  const copia = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const { conteos, creadoEn } = copia.meta;
  // El orden NO se toma del archivo: los respaldos anteriores al 2026-10-07
  // declaraban uno equivocado (comprobante antes que resumenSunat). Se usa el
  // vigente, y una tabla del archivo que no esté en él es un error, no se calla.
  const { TABLAS } = require('./lib-respaldo-tablas');
  const desconocidas = Object.keys(copia.datos).filter((t) => !TABLAS.includes(t));
  if (desconocidas.length) { console.error(`🔴 Tablas del respaldo sin orden conocido: ${desconocidas.join(', ')}`); process.exit(1); }
  const ordenRestauracion = TABLAS.filter((t) => t in copia.datos);
  const faltan = TABLAS.filter((t) => !(t in copia.datos));
  if (faltan.length) console.warn(`  ⚠️ Este respaldo NO tiene: ${faltan.join(', ')} (se restaurarían vacías)`);
  console.log(`  Copia del ${creadoEn} · ${copia.meta.totalFilas} filas · ${ordenRestauracion.length} tablas`);

  // 1. Base vacía con el esquema actual.
  execSync('npx prisma db push --skip-generate --force-reset --accept-data-loss', { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'ignore' });
  console.log(`  Esquema creado (${seg()})`);

  // 2. Reinsertar de padres a hijos, en bloques.
  const prisma = require('../src/lib/prisma');
  for (const tabla of ordenRestauracion) {
    const filas = copia.datos[tabla] || [];
    for (let i = 0; i < filas.length; i += 500) {
      await prisma[tabla].createMany({ data: filas.slice(i, i + 500) });
    }
  }
  console.log(`  Datos insertados (${seg()})\n`);

  // 3. ¿Entró TODO? Fila por fila contra lo que el archivo declara.
  for (const tabla of ordenRestauracion) {
    const n = await prisma[tabla].count();
    check(`${tabla.padEnd(20)} ${String(n).padStart(6)} / ${conteos[tabla] ?? 0}`, n === (conteos[tabla] ?? 0));
  }
  // Y el contenido, no solo el número: una muestra de cada tabla crítica idéntica.
  for (const tabla of ['usuario', 'pago', 'comprobante', 'snapshot', 'intentoCobro'].filter((t) => copia.datos[t]?.length)) {
    const original = copia.datos[tabla][Math.floor(copia.datos[tabla].length / 2)];
    const restaurada = await prisma[tabla].findUnique({ where: { id: original.id } });
    const iguales = Object.keys(original).every((k) => JSON.stringify(restaurada?.[k] instanceof Date ? restaurada[k].toISOString() : restaurada?.[k]) === JSON.stringify(original[k]));
    check(`${tabla}: una fila de muestra es idéntica campo a campo`, iguales);
  }

  // 4. Levantar la API real sobre la base restaurada y usarla.
  require('../src/index.js');
  await new Promise((r) => setTimeout(r, 1500));
  const BASE = 'http://127.0.0.1:3998';
  // La misma firma que auth.routes.js (firmarSesion), con el secreto de ESTE proceso.
  const firmarSesion = (usr) => require('jsonwebtoken').sign({ id: usr.id, v: usr.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const conNegocio = await prisma.usuario.findFirst({ where: { negocios: { some: { activo: true } } }, orderBy: { creadoEn: 'asc' } });
  const conPago = await prisma.usuario.findFirst({ where: { pagos: { some: {} } } });
  const pedir = async (ruta, usuario) => {
    const r = await fetch(BASE + ruta, { headers: usuario ? { Authorization: `Bearer ${firmarSesion(usuario)}` } : {} });
    let j = null; try { j = await r.json(); } catch { /* */ }
    return { s: r.status, j };
  };
  check('la API arranca: /health 200', (await pedir('/health')).s === 200);
  if (conNegocio) {
    const perfil = await pedir('/api/auth/perfil', conNegocio);
    check('un usuario restaurado abre su perfil', perfil.s === 200 && perfil.j?.email === conNegocio.email, `${perfil.s}`);
    const negocios = await pedir('/api/negocios', conNegocio);
    const lista = negocios.j?.negocios || negocios.j;
    check('…y ve sus negocios con su historial', negocios.s === 200 && Array.isArray(lista) && lista.length > 0, `${negocios.s}`);
  }
  if (conPago) {
    const historial = await pedir('/api/pagos/historial', conPago);
    check('un cliente con pagos ve su Facturación', historial.s === 200, `${historial.s}`);
  }
  const op = await pedir('/health/operacion');
  check('/health/operacion responde sobre la base restaurada', [200, 503].includes(op.s) && op.j?.operacion, JSON.stringify(op.j));

  console.log(`\n  Tiempo total de restauración y comprobación: ${seg()}`);
  console.log(fallos ? `\n  ✗ ${fallos} problema(s): este respaldo NO restaura bien.` : '\n  ✓ El respaldo RESTAURA: los datos entran completos y la aplicación funciona sobre ellos.');
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('🔴', e); process.exit(1); });
