// brand-shield/scripts/integracion-postgres.js
//
// Carreras contra un PostgreSQL DE VERDAD (réplica del auditor, 2026-10-07,
// §59 e I-08): las suites `prueba-*.js` modelan los candados con dobles, y eso
// prueba la intención del código pero no los candados, el aislamiento ni los
// abortos de transacción reales de Postgres. Esto lanza las operaciones en
// paralelo contra una base desechable y mira lo que quedó escrito.
//
//   INTEGRACION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notoria_test \
//     node scripts/integracion-postgres.js
//
// 🔴 Se niega a correr contra cualquier base que no sea local y cuyo nombre no
// contenga «test»: hace `prisma db push --force-reset`, que BORRA todo. El .env
// de este repo apunta a producción (CLAUDE.md §4); por eso la URL va en una
// variable propia y nunca se toma DATABASE_URL.
//
// Cada carrera lleva su CONTROL: la misma carrera hecha «a la antigua» (leer
// fuera, escribir después) tiene que PERDER algo en la misma base. Si el
// control no pierde nada, la sonda no distingue y el veredicto es «no
// concluyente», no «bien».

const { execSync } = require('child_process');
const path = require('path');

const URL_TEST = process.env.INTEGRACION_DATABASE_URL;
if (!URL_TEST) {
  console.error('Falta INTEGRACION_DATABASE_URL (una base Postgres local y desechable).');
  process.exit(2);
}
const u = new URL(URL_TEST);
const local = ['localhost', '127.0.0.1', 'postgres'].includes(u.hostname);
if (!local || !/test/i.test(u.pathname)) {
  console.error(`🔴 Me niego: ${u.hostname}${u.pathname} no es una base local de prueba (esto la BORRA).`);
  process.exit(2);
}

// Antes de cargar NADA que cree un cliente de Prisma.
process.env.DATABASE_URL = URL_TEST;
process.env.TOKENS_CLAVE = process.env.TOKENS_CLAVE || 'a'.repeat(64);
process.env.PROMO_HASH_SECRET = 'promo-test';
process.env.DOCUMENTOS_SECRET = 'docs-test';
process.env.JWT_SECRET = 'jwt-test';
delete process.env.RESEND_API_KEY; // ningún correo sale de acá
delete process.env.CULQI_SECRET_KEY;

console.log(`Base de prueba: ${u.hostname}${u.pathname}\nPreparando esquema (db push --force-reset)…`);
execSync('npx prisma db push --skip-generate --force-reset --accept-data-loss', {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: URL_TEST },
  stdio: 'ignore',
});

const prisma = require('../src/lib/prisma');
const cobros = require('../src/lib/cobros');
const promo = require('../src/lib/promo');
const inbox = require('../src/lib/webhookInbox');

let fallos = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const mal = (m) => { console.error(`  ✗ ${m}`); fallos += 1; };
const check = (m, cond, extra = '') => (cond ? ok(m) : mal(`${m}${extra ? ` — ${extra}` : ''}`));
const bloque = (t) => console.log(`\n${t}`);
const RONDAS = 15;
const resultado = (p) => p.then(() => 'OK', (e) => e.codigo || `ERROR: ${e.message.split('\n').pop()}`);

let n = 0;
const nuevoUsuario = (extra = {}) => prisma.usuario.create({
  data: {
    email: `u${(n += 1)}-${Date.now()}@test.local`, password: 'x', nombre: 'Prueba',
    plan: 'NEGOCIO', suscripcionActiva: true, localesExtra: 0, periodoFacturacion: 'mensual',
    fechaVencimiento: new Date('2026-11-01T00:00:00Z'), tarjetaCulqiId: 'crd_test', ...extra,
  },
});
const BASE = { tipo: 'LOCAL_ADICIONAL', plan: 'NEGOCIO', periodo: 'mensual', monto: 1000 };
const CAMPOS = ['plan', 'suscripcionActiva', 'fechaVencimiento', 'localesExtra'];

(async () => {
  const db = await prisma.$queryRaw`SELECT current_database() AS db`;
  if (!/test/i.test(db[0].db)) { console.error(`🔴 Conectado a ${db[0].db}, no a la base de prueba`); process.exit(2); }

  // ── 1. La MISMA clave cinco veces a la vez ───────────────────────────────
  bloque('1. Misma clave en paralelo (lib/cobros.js abrirIntento)');
  {
    const usr = await nuevoUsuario();
    const rs = await Promise.all(Array.from({ length: 5 }, () => resultado(cobros.abrirIntento({ clave: `alta:${usr.id}:tkn`, usuarioId: usr.id, ...BASE }))));
    const filas = await prisma.intentoCobro.count({ where: { usuarioId: usr.id } });
    check('5 peticiones con la misma clave → UN intento, cuatro COBRO_DUPLICADO, ningún error de Postgres',
      filas === 1 && rs.filter((r) => r === 'OK').length === 1 && rs.filter((r) => r === 'COBRO_DUPLICADO').length === 4, rs.join(','));
  }

  // ── 2. Locales: 0→1 y 0→2 a la vez (P1-N03) ──────────────────────────────
  bloque('2. Dos cambios de locales distintos sobre la misma foto (P1-N03)');
  {
    let malas = 0; const vistos = new Set();
    for (let i = 0; i < RONDAS; i += 1) {
      const usr = await nuevoUsuario();
      const abrir = (k) => resultado(cobros.abrirIntento({ clave: `locales:${usr.id}:v:0->${k}`, usuarioId: usr.id, ...BASE, vigente: cobros.fotoVigente(usr, CAMPOS) }));
      const rs = await Promise.all([abrir(1), abrir(2)]);
      rs.forEach((r) => vistos.add(r));
      const filas = await prisma.intentoCobro.count({ where: { usuarioId: usr.id } });
      if (filas !== 1 || rs.filter((r) => r === 'OK').length !== 1) malas += 1;
    }
    check(`${RONDAS} rondas: siempre UN solo cobro reclamado; el otro rechazado sin llegar a Culqi`, malas === 0, `${malas} ronda(s) con dos cobros · resultados ${[...vistos]}`);
    // Control: sin el reclamo (create directo, como antes), las dos claves pasan.
    const usr = await nuevoUsuario();
    await Promise.all([1, 2].map((k) => prisma.intentoCobro.create({ data: { clave: `locales:${usr.id}:v:0->${k}`, usuarioId: usr.id, ...BASE } })));
    check('CONTROL: sin el reclamo, las dos claves entran (la carrera existe en esta base)', await prisma.intentoCobro.count({ where: { usuarioId: usr.id } }) === 2);
  }

  // ── 3. Renovación vs cancelación (P1-N04) ────────────────────────────────
  bloque('3. Renovación y cancelación simultáneas (P1-N04)');
  {
    let incoherentes = 0; let reclamadas = 0; let canceladasAntes = 0;
    for (let i = 0; i < RONDAS; i += 1) {
      const usr = await nuevoUsuario();
      const claim = resultado(cobros.abrirIntento({ clave: `renovacion:${usr.id}:x`, usuarioId: usr.id, ...BASE, tipo: 'RENOVACION', vigente: cobros.fotoVigente(usr, CAMPOS) }));
      const cancel = cobros.conCuenta(usr.id, (tx) => tx.usuario.update({ where: { id: usr.id }, data: { suscripcionActiva: false } }));
      const [r] = await Promise.all([claim, cancel]);
      const filas = await prisma.intentoCobro.count({ where: { usuarioId: usr.id } });
      if (r === 'OK') reclamadas += 1; else if (r === 'ESTADO_CAMBIADO') canceladasAntes += 1;
      if (!((r === 'OK' && filas === 1) || (r === 'ESTADO_CAMBIADO' && filas === 0))) incoherentes += 1;
    }
    check(`${RONDAS} rondas: o se reclamó antes de cancelar (hay intento) o se canceló antes (no hay); nunca a medias`, incoherentes === 0, `${incoherentes} incoherente(s)`);
    console.log(`    (reclamadas antes: ${reclamadas} · canceladas antes: ${canceladasAntes})`);
    const usr = await nuevoUsuario({ suscripcionActiva: false });
    const r = await resultado(cobros.abrirIntento({ clave: `renovacion:${usr.id}:y`, usuarioId: usr.id, ...BASE, tipo: 'RENOVACION', vigente: cobros.fotoVigente({ ...usr, suscripcionActiva: true }, CAMPOS) }));
    check('cancelada ANTES de reclamar → la renovación no se cobra (ESTADO_CAMBIADO)', r === 'ESTADO_CAMBIADO');
  }

  // ── 4. Promo: misma tarjeta / misma cuenta a la vez (P0-08) ──────────────
  bloque('4. Reserva de la promo en paralelo (lib/promo.js)');
  {
    let malas = 0;
    for (let i = 0; i < RONDAS; i += 1) {
      const [a, b] = [await nuevoUsuario({ plan: 'GRATIS' }), await nuevoUsuario({ plan: 'GRATIS' })];
      const huella = `h-tarjeta-${i}-${Date.now()}`;
      const rs = await Promise.all([promo.reservar({ huella, usuarioId: a.id, clave: `alta:${a.id}:t` }), promo.reservar({ huella, usuarioId: b.id, clave: `alta:${b.id}:t` })]);
      if (rs.filter(Boolean).length !== 1) malas += 1;
    }
    check(`${RONDAS} rondas: dos cuentas con la MISMA tarjeta → la promo se reserva una vez`, malas === 0, `${malas} ronda(s) mal`);
    malas = 0;
    for (let i = 0; i < RONDAS; i += 1) {
      const a = await nuevoUsuario({ plan: 'GRATIS' });
      const rs = await Promise.all([1, 2].map((k) => promo.reservar({ huella: `h-${a.id}-${k}`, usuarioId: a.id, clave: `alta:${a.id}:t${k}` })));
      const filas = await prisma.promoTarjeta.count({ where: { usuarioId: a.id } });
      if (rs.filter(Boolean).length !== 1 || filas !== 1) malas += 1;
    }
    check(`${RONDAS} rondas: la MISMA cuenta con dos tarjetas → una sola reserva y ninguna fila huérfana`, malas === 0, `${malas} ronda(s) mal`);
  }

  // ── 5. Webhook: ruta + worker sobre el mismo evento (P1-N01) ─────────────
  bloque('5. Un evento de webhook, dos procesos (P1-N01)');
  {
    let malas = 0;
    for (let i = 0; i < RONDAS; i += 1) {
      const ev = await inbox.recibir({ proveedor: 'culqi', cuerpo: { id: `evt_${i}_${Date.now()}`, type: 'x' } });
      let ejecuciones = 0;
      const fn = async () => { ejecuciones += 1; await new Promise((r) => setTimeout(r, 30)); return 'PROCESADO'; };
      const [foto1, foto2] = [await prisma.eventoWebhook.findUnique({ where: { id: ev.id } }), await prisma.eventoWebhook.findUnique({ where: { id: ev.id } })];
      await Promise.all([inbox.procesar(foto1, fn), inbox.procesar(foto2, fn)]);
      const final = await prisma.eventoWebhook.findUnique({ where: { id: ev.id } });
      if (ejecuciones !== 1 || final.estado !== 'PROCESADO' || final.intentos !== 1) malas += 1;
    }
    check(`${RONDAS} rondas: el procesador corre UNA vez y el intento se cuenta una vez`, malas === 0, `${malas} ronda(s) mal`);
  }

  // ── 6. Dos reembolsos parciales a la vez (P1-N02) ────────────────────────
  bloque('6. Reembolsos parciales simultáneos (P1-N02)');
  {
    const { procesarEventoCulqi } = require('../src/api/routes/pago.routes')._interno;
    let perdidas = 0;
    for (let i = 0; i < RONDAS; i += 1) {
      const usr = await nuevoUsuario();
      const pago = await prisma.pago.create({ data: { usuarioId: usr.id, plan: 'NEGOCIO', periodo: 'mensual', tipo: 'INICIAL', estado: 'EXITOSO', monto: 5900, titular: 'Prueba', culqiCargoId: `chr_${usr.id}` } });
      const ev = (amount) => ({ tipo: 'refund.creation.succeeded', payload: { type: 'refund.creation.succeeded', data: JSON.stringify({ chargeId: pago.culqiCargoId, amount }) } });
      await Promise.all([procesarEventoCulqi(ev(1000)), procesarEventoCulqi(ev(2000))]);
      const final = await prisma.pago.findUnique({ where: { id: pago.id } });
      if (final.montoReembolsado !== 3000) perdidas += 1;
    }
    check(`${RONDAS} rondas: 1000 + 2000 = 3000 siempre (ningún reembolso pisa al otro)`, perdidas === 0, `${perdidas} ronda(s) perdieron importe`);
    // Control: leer fuera y escribir la suma (lo de antes) pierde importe en esta misma base.
    let perdidasControl = 0;
    for (let i = 0; i < RONDAS; i += 1) {
      const usr = await nuevoUsuario();
      const pago = await prisma.pago.create({ data: { usuarioId: usr.id, plan: 'NEGOCIO', periodo: 'mensual', tipo: 'INICIAL', estado: 'EXITOSO', monto: 5900, titular: 'Prueba' } });
      const ingenuo = async (d) => {
        const p = await prisma.pago.findUnique({ where: { id: pago.id } });
        await new Promise((r) => setTimeout(r, 10));
        await prisma.pago.update({ where: { id: pago.id }, data: { montoReembolsado: (p.montoReembolsado || 0) + d } });
      };
      await Promise.all([ingenuo(1000), ingenuo(2000)]);
      if ((await prisma.pago.findUnique({ where: { id: pago.id } })).montoReembolsado !== 3000) perdidasControl += 1;
    }
    check('CONTROL: leer fuera del candado SÍ pierde importe en esta base (la sonda distingue)', perdidasControl > 0, 'el control no perdió nada: no concluyente');
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — las carreras se resuelven en Postgres, no solo en los dobles');
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
})().catch(async (e) => {
  console.error('🔴', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
