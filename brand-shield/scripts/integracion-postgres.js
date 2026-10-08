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

// 🔴 Ninguna credencial real puede llegar a este proceso. El cliente de Prisma
// carga el .env por su cuenta al crearse y RELLENA lo que no esté definido:
// un `delete process.env.RESEND_API_KEY` no basta (así salieron 30 correos
// reales, rebotados, a direcciones @test.local el 2026-10-07). Se define VACÍA
// cada variable del .env antes de cargar nada; dotenv no pisa lo ya definido.
const fs = require('fs');
const rutaEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(rutaEnv)) {
  for (const linea of fs.readFileSync(rutaEnv, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m) process.env[m[1]] = '';
  }
}
// Antes de cargar NADA que cree un cliente de Prisma.
process.env.DATABASE_URL = URL_TEST;
process.env.TOKENS_CLAVE = 'a'.repeat(64);
process.env.PROMO_HASH_SECRET = 'promo-test';
process.env.DOCUMENTOS_SECRET = 'docs-test';
process.env.JWT_SECRET = 'jwt-test';

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

// La sesión: la ruta de pagos real, con el usuario que diga la cabecera (los
// bloques 7 y 8 la llaman por HTTP). Va ANTES de cargar pago.routes.
const pathAuth = require.resolve('../src/api/middlewares/auth.middleware');
require.cache[pathAuth] = { id: pathAuth, filename: pathAuth, loaded: true, exports: {
  autenticar: (req, res, next) => { req.usuario = { id: req.headers['x-usuario'] }; req.cuenta = { id: req.headers['x-usuario'] }; next(); },
  permitir: () => (req, res, next) => next(),
} };

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
  const filtradas = ['RESEND_API_KEY', 'CULQI_SECRET_KEY', 'GROQ_API_KEY', 'GOOGLE_PLACES_API_KEY', 'SUNAT_SOL_CLAVE'].filter((k) => process.env[k]);
  if (filtradas.length) { console.error(`🔴 Credenciales reales en el proceso (${filtradas.join(', ')}): me detengo`); process.exit(2); }
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

  // ══ Commercial readiness (réplica del auditor, 2026-10-07) ═══════════════
  // Culqi se sustituye por un doble que CUENTA los cargos y tarda como la red;
  // todo lo demás (ruta HTTP, candados, transacciones) es el código real.
  const culqi = require('../src/lib/culqi');
  const cargosCulqi = [];
  let culqiResponde = true;
  Object.assign(culqi, {
    configurado: () => true,
    obtenerOCrearCliente: async () => ({ id: 'cus_test' }),
    crearTarjeta: async ({ tokenId }) => ({ id: `crd_${tokenId}`, source: { iin: { bin: '411111' }, last_four: '1111' } }),
    crearCargo: async ({ monto, metadata }) => {
      await new Promise((r) => setTimeout(r, 60));
      const cargo = { id: `chr_test_${cargosCulqi.length + 1}_${Date.now()}`, amount: monto, metadata, outcome: { type: 'venta_exitosa' }, source: { iin: { bin: '411111', card_brand: 'Visa' } } };
      cargosCulqi.push(cargo);
      if (!culqiResponde) { const e = new Error('timeout'); throw e; } // cobró, pero la respuesta no llegó
      return cargo;
    },
  });
  const express = require('express');
  const http = require('http');
  const app = express(); app.use(express.json()); app.use('/api/pagos', require('../src/api/routes/pago.routes'));
  const srv = http.createServer(app).listen(0);
  const URL_PAGOS = `http://127.0.0.1:${srv.address().port}/api/pagos`;
  const comprar = (usuarioId, cuerpo) => fetch(`${URL_PAGOS}/culqi`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-usuario': usuarioId }, body: JSON.stringify(cuerpo) })
    .then(async (r) => ({ s: r.status, j: await r.json() }));
  const cargosDe = (usuarioId) => prisma.intentoCobro.count({ where: { usuarioId, culqiCargoId: { not: null } } });
  const libres = { promoBienvenidaUsada: true };

  // ── 7. Doble compra de plan por la RUTA real (auditor §15) ─────────────
  bloque('7. Doble compra de plan en dos pestañas, por HTTP (auditor §15)');
  try {
    let malas = 0; const vistos = new Set();
    for (let i = 0; i < RONDAS; i += 1) {
      const usr = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false, fechaVencimiento: null, tarjetaCulqiId: null, ...libres });
      const antes = cargosCulqi.length;
      const rs = await Promise.all([
        comprar(usr.id, { token: `tkA${i}`, plan: 'NEGOCIO', anual: false }),
        comprar(usr.id, { token: `tkB${i}`, plan: 'FRANQUICIA', anual: false }),
      ]);
      rs.forEach((r) => vistos.add(`${r.s}${r.j.codigo ? ':' + r.j.codigo : ''}`));
      const pagos = await prisma.pago.count({ where: { usuarioId: usr.id } });
      if (cargosCulqi.length - antes !== 1 || pagos !== 1 || rs.filter((r) => r.s === 200).length !== 1) malas += 1;
    }
    check(`${RONDAS} rondas GRATIS → Negocio (pestaña A) y Franquicia (pestaña B) a la vez: UN cargo en Culqi, UN Pago`, malas === 0, `${malas} mala(s) · ${[...vistos]}`);
    console.log(`    (respuestas vistas: ${[...vistos].join(' · ')})`);

    malas = 0;
    for (let i = 0; i < RONDAS; i += 1) {
      const usr = await nuevoUsuario({ plan: 'NEGOCIO', ...libres });
      const antes = cargosCulqi.length;
      const rs = await Promise.all([
        comprar(usr.id, { token: `upA${i}`, plan: 'FRANQUICIA', anual: false }),
        comprar(usr.id, { token: `upB${i}`, plan: 'FRANQUICIA', anual: true }),
      ]);
      const pagos = await prisma.pago.count({ where: { usuarioId: usr.id } });
      if (cargosCulqi.length - antes !== 1 || pagos !== 1 || rs.filter((r) => r.s === 200).length !== 1) malas += 1;
    }
    check(`${RONDAS} rondas NEGOCIO con dos upgrades simultáneos: UN cargo, UN Pago`, malas === 0, `${malas} mala(s)`);

    // Control: la misma pareja SEGUIDA (no a la vez) sí son dos compras
    // legítimas — la sonda ve dos cargos cuando los hay, y el candado no
    // bloquea un upgrade de verdad.
    const usr = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false, fechaVencimiento: null, tarjetaCulqiId: null, ...libres });
    const antes = cargosCulqi.length;
    const r1 = await comprar(usr.id, { token: 'seqA', plan: 'NEGOCIO', anual: false });
    const r2 = await comprar(usr.id, { token: 'seqB', plan: 'FRANQUICIA', anual: false });
    check('CONTROL: una tras otra son dos cobros legítimos (la sonda distingue)', r1.s === 200 && r2.s === 200 && cargosCulqi.length - antes === 2, `${r1.s}/${r2.s}`);
    const final = await prisma.usuario.findUnique({ where: { id: usr.id } });
    check('…y la cuenta queda en el plan de la última compra', final.plan === 'FRANQUICIA');
    const ev = await prisma.eventoSuscripcion.findMany({ where: { usuarioId: usr.id }, orderBy: { creadoEn: 'asc' } });
    check('la bitácora tiene un ALTA por compra, con la hora del reclamo y el cargo', ev.length === 2 && ev.every((e) => e.tipo === 'ALTA' && e.detalle.reclamadoEn && e.detalle.cargo && !('tarjetaCulqiId' in e.detalle)), JSON.stringify(ev.map((e) => e.detalle)));
  } catch (e) { mal(`bloque 7 reventó: ${e.message}`); }

  // ── 8. El proceso muere en el peor momento (auditor §16) ───────────────
  bloque('8. Muerte del proceso a mitad de un cobro (auditor §16)');
  try {
    const { reconciliarCobros } = require('../src/workers/reconciliacion.worker');
    const MIN = 60e3;
    // Caso 1: se reservó la promo y el proceso murió ANTES de crear el intento.
    {
      const usr = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false });
      const clave = `alta:${usr.id}:muerto`;
      await promo.reservar({ huella: `h-muerte-${usr.id}`, usuarioId: usr.id, clave });
      const reservada = await prisma.usuario.findUnique({ where: { id: usr.id } });
      await promo.liberarHuerfanas(Date.now() + 31 * MIN);
      const despues = await prisma.usuario.findUnique({ where: { id: usr.id } });
      const filas = await prisma.promoTarjeta.count({ where: { usuarioId: usr.id } });
      check('caso 1: promo reservada sin intento → la reconciliación la devuelve (cuenta y tarjeta)', reservada.promoBienvenidaUsada && !despues.promoBienvenidaUsada && filas === 0);
      const otro = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false });
      const claveOk = `alta:${otro.id}:vivo`;
      await promo.reservar({ huella: `h-vivo-${otro.id}`, usuarioId: otro.id, clave: claveOk });
      await prisma.intentoCobro.create({ data: { clave: claveOk, usuarioId: otro.id, tipo: 'INICIAL', plan: 'NEGOCIO', periodo: 'mensual', monto: 2950, estado: 'EXITOSO', culqiCargoId: `chr_vivo_${otro.id}` } });
      await promo.liberarHuerfanas(Date.now() + 31 * MIN);
      check('CONTROL: con un intento EXITOSO detrás, la reserva NO se toca', await prisma.promoTarjeta.count({ where: { usuarioId: otro.id } }) === 1);
    }
    // Caso 2: intento reclamado (PROCESANDO) y el proceso murió. a) Culqi nunca
    // cobró → a las 24 h, FALLIDO. b) Culqi sí cobró → se aplica.
    {
      const a = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false });
      const ia = await cobros.abrirIntento({ clave: `alta:${a.id}:p`, usuarioId: a.id, tipo: 'INICIAL', plan: 'NEGOCIO', periodo: 'mensual', monto: 5900, detalle: { plan: 'NEGOCIO', periodoFacturacion: 'mensual', fechaVencimiento: new Date(Date.now() + 30 * 864e5).toISOString(), localesExtra: 0, tarjetaCulqiId: 'crd_x' } });
      const b = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false });
      const ib = await cobros.abrirIntento({ clave: `alta:${b.id}:p`, usuarioId: b.id, tipo: 'INICIAL', plan: 'NEGOCIO', periodo: 'mensual', monto: 5900, detalle: { plan: 'NEGOCIO', periodoFacturacion: 'mensual', fechaVencimiento: new Date(Date.now() + 30 * 864e5).toISOString(), localesExtra: 0, tarjetaCulqiId: 'crd_x' } });
      const cargoB = { id: `chr_b_${b.id}`, amount: 5900, metadata: { intento: ib.id }, outcome: { type: 'venta_exitosa' }, source: {} };
      culqi.listarCargosDe = async (email) => (email === b.email ? [cargoB] : []);
      culqi.obtenerCargo = async (id) => (id === cargoB.id ? cargoB : null);
      // Los bloques anteriores dejaron decenas de intentos en duda: es la cola
      // real de un mal día. La reconciliación mira 20 por pasada y tiene que
      // ROTAR: en ceil(N/20) pasadas, todos revisados (antes, siempre los mismos 20).
      const enCola = await prisma.intentoCobro.count({ where: { estado: { in: ['PROCESANDO', 'DESCONOCIDO'] } } });
      const pasadas = Math.ceil(enCola / 20);
      for (let k = 0; k < pasadas; k += 1) await reconciliarCobros(Date.now() + 20 * MIN);
      const sinMirar = await prisma.intentoCobro.count({ where: { estado: { in: ['PROCESANDO', 'DESCONOCIDO'] }, revisadoEn: null } });
      check(`rotación: ${enCola} cobros en duda → en ${pasadas} pasada(s) de 20 se revisan TODOS`, enCola > 20 && sinMirar === 0, `${sinMirar} sin revisar`);
      const [fa, fb] = [await prisma.intentoCobro.findUnique({ where: { id: ia.id } }), await prisma.intentoCobro.findUnique({ where: { id: ib.id } })];
      const ub = await prisma.usuario.findUnique({ where: { id: b.id } });
      check('caso 2b: PROCESANDO y Culqi SÍ cobró → EXITOSO, Pago creado y plan aplicado', fb.estado === 'EXITOSO' && fb.pagoId && ub.plan === 'NEGOCIO' && ub.suscripcionActiva);
      check('caso 2a: PROCESANDO y Culqi no tiene cargo → sigue en duda antes de 24 h (no se decide a ciegas)', fa.estado === 'PROCESANDO');
      const enCola24 = await prisma.intentoCobro.count({ where: { estado: { in: ['PROCESANDO', 'DESCONOCIDO'] } } });
      for (let k = 0; k < Math.ceil(enCola24 / 20); k += 1) await reconciliarCobros(Date.now() + 25 * 60 * MIN);
      const fa2 = await prisma.intentoCobro.findUnique({ where: { id: ia.id } });
      check('caso 2a: …y a las 24 h sin cargo → FALLIDO, sin Pago', fa2.estado === 'FALLIDO' && !fa2.pagoId && await prisma.pago.count({ where: { usuarioId: a.id } }) === 0);
    }
    // Caso 3: Culqi cobró, el intento quedó EXITOSO y el proceso murió ANTES
    // de aplicar. Dos reconciliaciones a la vez (dos instancias) → UN Pago.
    {
      const c = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false });
      const ic = await cobros.abrirIntento({ clave: `alta:${c.id}:x`, usuarioId: c.id, tipo: 'INICIAL', plan: 'FRANQUICIA', periodo: 'mensual', monto: 17900, detalle: { plan: 'FRANQUICIA', periodoFacturacion: 'mensual', fechaVencimiento: new Date(Date.now() + 30 * 864e5).toISOString(), localesExtra: 0, tarjetaCulqiId: 'crd_y' } });
      const cargoC = { id: `chr_c_${c.id}`, amount: 17900, metadata: { intento: ic.id }, outcome: { type: 'venta_exitosa' }, source: {} };
      await prisma.intentoCobro.update({ where: { id: ic.id }, data: { estado: 'EXITOSO', culqiCargoId: cargoC.id, creadoEn: new Date(Date.now() - 10 * MIN) } });
      culqi.obtenerCargo = async () => cargoC;
      await Promise.all([reconciliarCobros(), reconciliarCobros()]);
      const pagos = await prisma.pago.findMany({ where: { usuarioId: c.id } });
      const uc = await prisma.usuario.findUnique({ where: { id: c.id } });
      const ev = await prisma.eventoSuscripcion.count({ where: { usuarioId: c.id, tipo: 'ALTA' } });
      check('caso 3: cobrado y sin aplicar + dos reconciliaciones a la vez → UN Pago, plan aplicado, un ALTA en la bitácora', pagos.length === 1 && pagos[0].culqiCargoId === cargoC.id && uc.plan === 'FRANQUICIA' && ev === 1, `pagos ${pagos.length}, plan ${uc.plan}, eventos ${ev}`);
    }
    // Caso 4: Culqi cobró pero la respuesta nunca llegó (timeout) → la ruta
    // dice «no vuelvas a pagar» y la reconciliación lo encuentra y lo aplica.
    {
      const d = await nuevoUsuario({ plan: 'GRATIS', suscripcionActiva: false, fechaVencimiento: null, tarjetaCulqiId: null, ...libres });
      culqiResponde = false;
      const r = await comprar(d.id, { token: 'perdido', plan: 'NEGOCIO', anual: false });
      culqiResponde = true;
      const intento = await prisma.intentoCobro.findFirst({ where: { usuarioId: d.id } });
      check('caso 4: Culqi cobró y no contestó → 502 COBRO_EN_VERIFICACION e intento DESCONOCIDO (no se reintenta)', r.s === 502 && r.j.codigo === 'COBRO_EN_VERIFICACION' && intento.estado === 'DESCONOCIDO', `${r.s} ${JSON.stringify(r.j)} ${intento?.estado}`);
      const cargoD = cargosCulqi[cargosCulqi.length - 1];
      culqi.listarCargosDe = async () => [cargoD];
      culqi.obtenerCargo = async () => cargoD;
      await reconciliarCobros(Date.now() + 10 * MIN);
      const ud = await prisma.usuario.findUnique({ where: { id: d.id } });
      check('caso 4: …y la reconciliación encuentra el cargo por metadata.intento y lo aplica', ud.plan === 'NEGOCIO' && await prisma.pago.count({ where: { usuarioId: d.id } }) === 1);
    }
  } catch (e) { mal(`bloque 8 reventó: ${e.stack}`); }

  // ── 9. Libro de comisiones contra Postgres real ───────────────────────
  bloque('9. Libro de comisiones: carreras y reversión (auditor §1)');
  try {
    const libro = require('../src/lib/libroComisiones');
    const { procesarEventoCulqi } = require('../src/api/routes/pago.routes')._interno;
    const cli = await nuevoUsuario({ plan: 'NEGOCIO' });
    const hace = (dias) => new Date(Date.now() - dias * 864e5);
    const p1 = await prisma.pago.create({ data: { usuarioId: cli.id, plan: 'NEGOCIO', periodo: 'mensual', tipo: 'INICIAL', estado: 'EXITOSO', monto: 5900, titular: 'P', culqiCargoId: `chr_l1_${cli.id}`, creadoEn: hace(40) } });
    await prisma.pago.create({ data: { usuarioId: cli.id, plan: 'NEGOCIO', periodo: 'mensual', tipo: 'RENOVACION', estado: 'EXITOSO', monto: 5900, titular: 'P', culqiCargoId: `chr_l2_${cli.id}`, creadoEn: hace(10) } });
    await prisma.visitaComercial.create({ data: { promotor: 'P1', creadoPorId: 'x', nombre: 'Cevichería', correo: cli.email, fechaVisita: hace(45) } });
    // Otro promotor registra el MISMO cliente después: no puede cobrar (7.1.d).
    await prisma.visitaComercial.create({ data: { promotor: 'P2', creadoPorId: 'y', nombre: 'Cevichería bis', correo: cli.email, fechaVisita: hace(42) } });
    await Promise.all([libro.sincronizar(), libro.sincronizar(), libro.sincronizar()]);
    let s = await libro.saldos();
    check('tres sincronizaciones a la vez → lo devengado UNA vez (bono 25.00 + residual 5.00)', s.P1?.saldo === 3000 && (await prisma.movimientoComision.count({ where: { promotor: { not: 'CONTROL' } } })) === 2, JSON.stringify(s));
    check('el segundo registro del mismo cliente (otro promotor) no devenga nada', !s.P2);
    // Control: la misma sincronización SIN candado duplica en esta base.
    const ingenua = async () => {
      const visitas = await prisma.visitaComercial.findMany();
      const evals = await libro.evaluar(prisma, visitas);
      const objetivos = visitas.flatMap((v) => require('../src/lib/rutaComercial').objetivosDeVisita(v, evals[v.id].comision, { perdedora: !!evals[v.id].prevaleceOtra }));
      const asentado = []; await new Promise((r) => setTimeout(r, 20));
      const nuevos = libro.diferencias({ objetivos, asentado });
      await prisma.movimientoComision.createMany({ data: nuevos.map((n) => ({ ...n, promotor: 'CONTROL', concepto: `CONTROL_${n.concepto}` })) /* fuera de los conceptos que sincroniza el libro */ });
    };
    await Promise.all([ingenua(), ingenua()]);
    check('CONTROL: sin el candado, dos sincronizaciones asientan dos veces (la carrera existe)', await prisma.movimientoComision.count({ where: { promotor: 'CONTROL' } }) === 4);

    // El promotor cobra su saldo; después el cliente obtiene la devolución
    // del PRIMER pago → el libro asienta la reversión y el saldo queda negativo
    // (se descuenta de la próxima liquidación, contrato 7.4).
    await prisma.movimientoComision.create({ data: { promotor: 'P1', concepto: 'PAGO', tipo: 'PAGADA', monto: -3000, referencia: 'op 1', autor: 'dueno' } });
    const filasAntes = await prisma.movimientoComision.findMany({ orderBy: { creadoEn: 'asc' } });
    await procesarEventoCulqi({ tipo: 'refund.creation.succeeded', payload: { type: 'refund.creation.succeeded', data: JSON.stringify({ chargeId: p1.culqiCargoId, amount: 5900 }) } });
    await libro.sincronizar();
    s = await libro.saldos();
    const filasDespues = await prisma.movimientoComision.findMany({ orderBy: { creadoEn: 'asc' } });
    const intactas = filasAntes.every((a) => filasDespues.some((b) => b.id === a.id && b.monto === a.monto && b.tipo === a.tipo));
    const rev = filasDespues.filter((m) => m.tipo === 'REVERSADA');
    check('🔴 reembolso del 1.er pago tras pagarle al promotor → REVERSADA asentada, saldo −30.00, nada borrado ni editado',
      s.P1.saldo === -3000 && s.P1.pagado === 3000 && rev.length === 2 && rev.every((m) => /7\.4/.test(m.motivo)) && intactas, JSON.stringify({ s, rev: rev.map((m) => m.motivo) }));
    const ev = await prisma.eventoSuscripcion.findFirst({ where: { usuarioId: cli.id, tipo: 'REEMBOLSO' } });
    check('el reembolso quedó en la bitácora de la suscripción', ev && ev.detalle.total === true);
    const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 7);
    const liq = await libro.liquidacion({ promotor: 'P1', mes });
    check('la liquidación del mes cuadra: inicial + movimiento = final', liq.saldoInicial + liq.movimiento === liq.saldoFinal && liq.saldoFinal === -3000 && /−S\/30\.00/.test(libro.textoLiquidacion(liq)), libro.textoLiquidacion(liq));
  } catch (e) { mal(`bloque 9 reventó: ${e.stack}`); }

  srv.close();

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — las carreras se resuelven en Postgres, no solo en los dobles');
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
})().catch(async (e) => {
  console.error('🔴', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
