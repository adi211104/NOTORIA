// brand-shield/scripts/e2e-venta.js
//
// Prueba de aceptación de VENTA de punta a punta (réplica del auditor,
// 2026-10-07, §6): la API real levantada entera, una base Postgres local y el
// entorno de INTEGRACIÓN de Culqi de verdad (tarjeta de prueba: cargos y
// reembolsos reales en el sandbox, cero soles reales).
//
//   E2E_DATABASE_URL=postgresql://postgres@localhost:55432/notoria_test node scripts/e2e-venta.js
//
// Recorre lo que hace una persona, por HTTP, como el navegador:
//   promotor registra la visita → cliente se registra → token de Culqi (como el
//   widget) → paga Negocio con la promo → plan activo + Pago + comprobante +
//   correo + bitácora → renovación con la tarjeta guardada (el cron real) → el
//   bono del promotor se devenga en el libro → upgrade a Franquicia → el dueño
//   le paga al promotor → devolución del PRIMER pago en Culqi + webhook → la
//   comisión se revierte y el saldo queda a descontar → devolución de la cuota
//   vigente → la suscripción termina y baja a Gratis → otra cuenta con la misma
//   tarjeta no recibe la promo, cancela, y la renovación NO la cobra.
//
// 🔴 Se niega a correr: con llaves de Culqi que no sean de test, o contra una
// base que no sea local y «test» (hace `db push --force-reset`). Ninguna otra
// credencial del .env llega al proceso (CLAUDE.md §16: Prisma rellena lo no
// definido, así que se definen VACÍAS). Los correos se capturan, no se envían.
//
// Lo que NO puede probar (y se prueba en producción con un pago real chico,
// docs/runbook-cobros.md): DNS/TLS, Culqi LIVE, que Culqi llame al webhook,
// la entrega real de correo y SUNAT.

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const URL_TEST = process.env.E2E_DATABASE_URL;
if (!URL_TEST) { console.error('Falta E2E_DATABASE_URL (Postgres local y desechable).'); process.exit(2); }
const u = new URL(URL_TEST);
if (!['localhost', '127.0.0.1', 'postgres'].includes(u.hostname) || !/test/i.test(u.pathname)) {
  console.error(`🔴 Me niego: ${u.hostname}${u.pathname} no es una base local de prueba (esto la BORRA).`);
  process.exit(2);
}

// Las llaves de Culqi se leen del .env ANTES de vaciarlo; solo pasan si son de test.
const rutaEnv = path.join(__dirname, '..', '.env');
const envLocal = fs.existsSync(rutaEnv) ? require('dotenv').parse(fs.readFileSync(rutaEnv)) : {};
const PK = process.env.CULQI_PUBLIC_KEY_TEST || envLocal.CULQI_PUBLIC_KEY;
const SK = process.env.CULQI_SECRET_KEY_TEST || envLocal.CULQI_SECRET_KEY;
if (!PK?.startsWith('pk_test_') || !SK?.startsWith('sk_test_')) {
  console.error('🔴 Hacen falta llaves de INTEGRACIÓN de Culqi (pk_test_/sk_test_). Con otras me niego: cobraría de verdad.');
  process.exit(2);
}
for (const k of Object.keys(envLocal)) process.env[k] = '';
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3999',
  DATABASE_URL: URL_TEST,
  CULQI_PUBLIC_KEY: PK,
  CULQI_SECRET_KEY: SK,
  CULQI_WEBHOOK_SECRET: 'e2e-secreto',
  JWT_SECRET: 'e2e-jwt',
  TOKENS_CLAVE: 'b'.repeat(64),
  PROMO_HASH_SECRET: 'e2e-promo',
  DOCUMENTOS_SECRET: 'e2e-docs',
  RESEND_API_KEY: 're_e2e_falsa',
  EMAIL_CONTABILIDAD: 'contabilidad@e2e.test',
  FRONTEND_URL: 'http://localhost:3001',
  RUTA_COMERCIAL_ACCESO: 'dueno@e2e.test:dueno,promotor@e2e.test:P1',
});

console.log(`Base: ${u.hostname}${u.pathname} · Culqi: integración (${PK.slice(0, 8)}…)\nPreparando esquema…`);
execSync('npx prisma db push --skip-generate --force-reset --accept-data-loss', { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'ignore' });

// Correos: se capturan en vez de mandarse.
const correos = [];
const pathResend = require.resolve('resend');
require.cache[pathResend] = { id: pathResend, filename: pathResend, loaded: true, exports: {
  Resend: class { constructor() { this.emails = { send: async (m) => { correos.push(m); return { data: { id: `e2e-${correos.length}` }, error: null }; } }; } },
} };
// Los cron: se capturan para correrlos A MANO (en NODE_ENV=test no arrancan solos).
const crons = {};
const nodeCron = require('node-cron');
nodeCron.schedule = (expr, fn) => { crons[expr] = fn; return { stop() {} }; };

const axios = require('axios');
const prisma = require('../src/lib/prisma');
const culqi = require('../src/lib/culqi');
require('../src/index.js');
const { iniciarRenovacionesCulqi, iniciarBajadaDePlanes } = require('../src/workers/monitoreo.worker');
iniciarRenovacionesCulqi(); iniciarBajadaDePlanes();
const correrRenovaciones = () => crons['0 5 * * *']();
const correrBajada = () => crons['30 5 * * *']();

let fallos = 0; let pasos = 0;
const check = (m, cond, extra = '') => { if (cond) { pasos += 1; console.log(`  ✓ ${m}`); } else { fallos += 1; console.error(`  ✗ ${m}${extra ? ` — ${extra}` : ''}`); } };
const bloque = (t) => console.log(`\n${t}`);
const BASE = 'http://127.0.0.1:3999';
const api = async (metodo, ruta, { token, cuerpo, cabeceras = {} } = {}) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabeceras }, body: cuerpo && JSON.stringify(cuerpo) });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { s: r.status, j };
};
const registrar = async (email, nombre) => {
  const r = await api('POST', '/api/auth/registro', { cuerpo: { nombre, email, password: 'Prueba-e2e-123', idioma: 'es' } });
  if (r.s !== 201) throw new Error(`registro de ${email}: ${r.s} ${JSON.stringify(r.j)}`);
  return r.j.token;
};
const tokenCulqi = async (email) => (await axios.post('https://secure.culqi.com/v2/tokens', {
  card_number: '4111111111111111', cvv: '123', expiration_month: '9', expiration_year: String(new Date().getFullYear() + 2), email,
}, { headers: { Authorization: `Bearer ${PK}` } })).data.id;
const webhook = (cuerpo) => api('POST', '/api/pagos/culqi/webhook', { cuerpo, cabeceras: { Authorization: `Basic ${Buffer.from(':e2e-secreto').toString('base64')}` } });
const eventoReembolso = (refund, cargoId, monto) => ({ id: `evt_e2e_${refund.id}`, type: 'refund.creation.succeeded', data: JSON.stringify({ id: refund.id, chargeId: cargoId, amount: monto }) });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const correosA = (email) => correos.filter((c) => [].concat(c.to).includes(email));
const soles = (c) => (c / 100).toFixed(2);

(async () => {
  await espera(1500); // que app.listen termine
  const ts = Date.now();
  const CLIENTE = `cliente-${ts}@notoria.test`;
  const CLIENTE2 = `cliente2-${ts}@notoria.test`;

  bloque('1. Promotor y dueño; el promotor registra la visita ANTES de la venta');
  const tPromotor = await registrar('promotor@e2e.test', 'Promotor E2E');
  const tDueno = await registrar('dueno@e2e.test', 'Dueño E2E');
  let r = await api('POST', '/api/ruta/visitas', { token: tPromotor, cuerpo: { nombre: 'Cevichería E2E', distrito: 'Barranco', estado: 'interesado', correo: CLIENTE } });
  check('la visita queda registrada a nombre del promotor', r.s === 201 && r.j.promotor === 'P1', JSON.stringify(r.j));
  const visitaId = r.j.id;
  await prisma.visitaComercial.update({ where: { id: visitaId }, data: { fechaVisita: new Date(Date.now() - 2 * 864e5) } });

  bloque('2. El cliente se registra y paga Negocio mensual con el widget (Culqi integración)');
  const tCliente = await registrar(CLIENTE, 'Rosa Quispe');
  r = await api('POST', '/api/pagos/culqi', { token: tCliente, cuerpo: { token: await tokenCulqi(CLIENTE), plan: 'NEGOCIO', anual: false } });
  check('POST /api/pagos/culqi → 200, promo 50% aplicada (S/29.50)', r.s === 200 && r.j.monto === 2950 && r.j.promoAplicada === true, `${r.s} ${JSON.stringify(r.j)}`);
  const cargo1 = r.j?.cargoId;
  const enCulqi = cargo1 ? await culqi.obtenerCargo(cargo1) : null;
  const intento1 = await prisma.intentoCobro.findFirst({ where: { culqiCargoId: cargo1 } });
  check('Culqi tiene el cargo, COBRADO, con metadata.intento = el intento de Notoria', enCulqi && culqi.cargoExitoso(enCulqi) && enCulqi.metadata?.intento === intento1?.id, `${enCulqi?.outcome?.type} ${enCulqi?.metadata?.intento} vs ${intento1?.id}`);
  const estado1 = await api('GET', '/api/pagos/estado', { token: tCliente });
  check('el cliente ve su plan Negocio activo', estado1.j?.plan === 'NEGOCIO' && estado1.j?.suscripcionActiva === true, JSON.stringify(estado1.j));
  const cuenta = await prisma.usuario.findUnique({ where: { email: CLIENTE } });
  const pago1 = await prisma.pago.findFirst({ where: { culqiCargoId: cargo1 } });
  const comp1 = await prisma.comprobante.findUnique({ where: { pagoId: pago1?.id || '' } });
  check('Pago EXITOSO + comprobante emitido', pago1?.estado === 'EXITOSO' && !!comp1, `${pago1?.estado} ${comp1?.numero}`);
  check('correo con el comprobante al cliente', correosA(CLIENTE).some((c) => /comprobante|pago/i.test(c.subject)), correosA(CLIENTE).map((c) => c.subject).join(' | '));
  const ev1 = await prisma.eventoSuscripcion.findFirst({ where: { usuarioId: cuenta.id, tipo: 'ALTA' } });
  check('bitácora: ALTA con la hora del reclamo y el cargo', ev1?.detalle?.cargo === cargo1 && !!ev1.detalle.reclamadoEn);

  bloque('3. El promotor ve la venta: todavía por ganar (falta el 2.º pago)');
  r = await api('GET', '/api/ruta/visitas', { token: tPromotor });
  let v = r.j?.visitas?.find((x) => x.id === visitaId);
  check('estado «Pagó», comisión ESPERA_2DO_PAGO, S/25.00 por ganar, nada devengado', v?.estadoAuto === 'cliente' && v.comision.estado === 'ESPERA_2DO_PAGO' && v.comision.porGanar === 2500 && v.devengadoLibro === 0, JSON.stringify(v?.comision));

  bloque('4. Renovación: el cron real cobra la tarjeta guardada');
  await prisma.usuario.update({ where: { id: cuenta.id }, data: { fechaVencimiento: new Date(Date.now() - 60e3) } });
  await correrRenovaciones();
  const pagos = await prisma.pago.findMany({ where: { usuarioId: cuenta.id }, orderBy: { creadoEn: 'asc' } });
  const ren = pagos.find((p) => p.tipo === 'RENOVACION');
  check('renovación cobrada en Culqi (2.º mes de promo: S/29.50) y aplicada', ren?.estado === 'EXITOSO' && ren.monto === 2950 && /^chr_/.test(ren.culqiCargoId || ''), JSON.stringify(ren));
  const tras = await prisma.usuario.findUnique({ where: { id: cuenta.id } });
  check('el vencimiento avanzó un mes', new Date(tras.fechaVencimiento) > new Date(Date.now() + 25 * 864e5));

  bloque('5. El bono se devenga y queda asentado en el libro');
  r = await api('GET', '/api/ruta/visitas', { token: tPromotor });
  v = r.j?.visitas?.find((x) => x.id === visitaId);
  check('GANADA: S/25.00 de bono + S/2.50 de residual asentados', v?.comision.estado === 'GANADA' && v.devengadoLibro === 2750 && r.j.saldos.P1.saldo === 2750, `${v?.comision.estado} ${v?.devengadoLibro} ${JSON.stringify(r.j?.saldos)}`);

  bloque('6. Upgrade a Franquicia (nuevo cobro, la promo ya se usó)');
  r = await api('POST', '/api/pagos/culqi', { token: tCliente, cuerpo: { token: await tokenCulqi(CLIENTE), plan: 'FRANQUICIA', anual: false } });
  check('upgrade cobrado a precio de lista S/179.00 y plan Franquicia', r.s === 200 && r.j.monto === 17900 && r.j.usuario?.plan === 'FRANQUICIA', `${r.s} ${JSON.stringify(r.j)}`);
  const cargo3 = r.j?.cargoId;
  r = await api('GET', '/api/ruta/visitas', { token: tPromotor });
  v = r.j?.visitas?.find((x) => x.id === visitaId);
  check('el upgrade suma su residual (10% de S/151.69 = S/15.17); el bono no se recalcula (6.4)', v?.devengadoLibro === 2750 + 1517 && v.comision.alta === 2500, `${v?.devengadoLibro}`);

  bloque('7. El dueño le paga al promotor lo devengado hasta hoy');
  r = await api('POST', '/api/ruta/pagos-promotor', { token: tDueno, cuerpo: { promotor: 'P1', monto: 4267, referencia: 'BCP op 000123 · RH E001-1' } });
  check('pago asentado y saldo en 0', r.s === 201 && (await api('GET', '/api/ruta/visitas', { token: tPromotor })).j.saldos.P1.saldo === 0, JSON.stringify(r.j));

  bloque('8. El cliente pide la devolución del PRIMER pago (retracto) — reembolso real en Culqi + webhook');
  const refund1 = await culqi.reembolsar({ cargoId: cargo1, monto: 2950 });
  check('Culqi acepta el reembolso', !!refund1?.id, JSON.stringify(refund1));
  const evento1 = eventoReembolso(refund1, cargo1, 2950);
  r = await webhook(evento1);
  check('webhook autenticado → 200', r.s === 200, `${r.s} ${JSON.stringify(r.j)}`);
  r = await webhook(evento1);
  check('el mismo evento reenviado → duplicado, sin reaplicar', r.s === 200 && JSON.stringify(r.j).includes('duplicado'), JSON.stringify(r.j));
  r = await api('POST', '/api/pagos/culqi/webhook', { cuerpo: evento1, cabeceras: { Authorization: `Basic ${Buffer.from(':otro').toString('base64')}` } });
  check('CONTROL: con un secreto falso el webhook rechaza', r.s === 401, `${r.s}`);
  const p1 = await prisma.pago.findUnique({ where: { id: pago1.id } });
  const cuentaTras = await prisma.usuario.findUnique({ where: { id: cuenta.id } });
  check('el Pago queda REEMBOLSADO; el plan vigente (Franquicia) no se toca: era una cuota vieja', p1.estado === 'REEMBOLSADO' && cuentaTras.plan === 'FRANQUICIA' && cuentaTras.suscripcionActiva);
  check('correo de reembolso al cliente', correosA(CLIENTE).some((c) => /reembols|devol|refund/i.test(c.subject)), correosA(CLIENTE).map((c) => c.subject).join(' | '));
  check('bitácora: REEMBOLSO', !!(await prisma.eventoSuscripcion.findFirst({ where: { usuarioId: cuenta.id, tipo: 'REEMBOLSO' } })));
  r = await api('GET', '/api/ruta/visitas', { token: tPromotor });
  v = r.j?.visitas?.find((x) => x.id === visitaId);
  const asientos = await prisma.movimientoComision.findMany({ where: { visitaId } });
  check('🔴 la comisión se REVIERTE (contrato 7.4): devengado 0, saldo −S/42.67 a descontar, nada borrado',
    v?.comision.estado === 'ANULADA' && v.devengadoLibro === 0 && r.j.saldos.P1.saldo === -4267 && asientos.some((a) => a.tipo === 'GENERADA') && asientos.some((a) => a.tipo === 'REVERSADA'),
    `${v?.comision.estado} ${v?.devengadoLibro} ${JSON.stringify(r.j?.saldos)}`);
  const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 7);
  r = await api('GET', `/api/ruta/liquidacion?mes=${mes}`, { token: tPromotor });
  check('la liquidación del mes lo explica (reversión con su motivo y saldo negativo)', r.s === 200 && /7\.4/.test(r.j.texto) && /−S\/42\.67/.test(r.j.texto), r.j?.texto);
  console.log(r.j?.texto?.split('\n').map((l) => `      ${l}`).join('\n'));

  bloque('9. Devolución de la cuota VIGENTE → la suscripción termina y baja a Gratis');
  const refund3 = await culqi.reembolsar({ cargoId: cargo3, monto: 17900 });
  r = await webhook(eventoReembolso(refund3, cargo3, 17900));
  const fin = await prisma.usuario.findUnique({ where: { id: cuenta.id } });
  check('suscripción terminada hoy (renovación apagada, vence ya)', r.s === 200 && !fin.suscripcionActiva && new Date(fin.fechaVencimiento) <= new Date(), JSON.stringify({ s: r.s, act: fin.suscripcionActiva, vence: fin.fechaVencimiento }));
  await correrBajada();
  const gratis = await prisma.usuario.findUnique({ where: { id: cuenta.id } });
  check('el cron de bajada la pasa a GRATIS y queda en la bitácora', gratis.plan === 'GRATIS' && !!(await prisma.eventoSuscripcion.findFirst({ where: { usuarioId: cuenta.id, tipo: 'BAJADA_A_GRATIS' } })));

  bloque('10. Otra cuenta con la MISMA tarjeta: sin promo, cancela, y la renovación NO la cobra');
  const tCliente2 = await registrar(CLIENTE2, 'Luis Ramos');
  r = await api('POST', '/api/pagos/culqi', { token: tCliente2, cuerpo: { token: await tokenCulqi(CLIENTE2), plan: 'IMPULSO', anual: false } });
  check('la tarjeta ya usó la promo → 409 PROMO_NO_APLICA, SIN cobrar', r.s === 409 && r.j.codigo === 'PROMO_NO_APLICA' && await prisma.intentoCobro.count({ where: { usuario: undefined, clave: { contains: '' }, usuarioId: (await prisma.usuario.findUnique({ where: { email: CLIENTE2 } })).id } }) === 0, `${r.s} ${JSON.stringify(r.j)}`);
  r = await api('POST', '/api/pagos/culqi', { token: tCliente2, cuerpo: { token: await tokenCulqi(CLIENTE2), plan: 'IMPULSO', anual: false, sinPromo: true } });
  check('acepta el precio regular → S/29.00', r.s === 200 && r.j.monto === 2900, `${r.s} ${JSON.stringify(r.j)}`);
  r = await api('POST', '/api/pagos/cancelar', { token: tCliente2 });
  check('cancela: conserva el plan hasta el vencimiento', r.s === 200 && r.j.plan === 'IMPULSO', JSON.stringify(r.j));
  const c2 = await prisma.usuario.findUnique({ where: { email: CLIENTE2 } });
  await prisma.usuario.update({ where: { id: c2.id }, data: { fechaVencimiento: new Date(Date.now() - 60e3) } });
  const intentosAntes = await prisma.intentoCobro.count({ where: { usuarioId: c2.id } });
  await correrRenovaciones();
  check('🔴 vencida y cancelada: la renovación NO la toca (ningún intento nuevo)', await prisma.intentoCobro.count({ where: { usuarioId: c2.id } }) === intentosAntes);
  check('bitácora: CANCELACION', !!(await prisma.eventoSuscripcion.findFirst({ where: { usuarioId: c2.id, tipo: 'CANCELACION' } })));

  bloque('11. Diagnóstico del caso y salud operativa');
  const caso = spawnSync(process.execPath, [path.join(__dirname, 'caso-cliente.js'), CLIENTE], { env: { ...process.env }, encoding: 'utf8' });
  check('caso-cliente.js arma la línea de tiempo del cliente', caso.status === 0 && /COBRO RECLAMADO/.test(caso.stdout) && /REEMBOLSO/.test(caso.stdout) && /DIAGNÓSTICO/.test(caso.stdout), caso.stderr || caso.stdout.slice(-400));
  r = await api('GET', '/health/operacion');
  check('/health/operacion → ok: nada atascado tras todo el recorrido', r.s === 200 && r.j.operacion === 'ok', JSON.stringify(r.j));
  const cargosCulqi = await prisma.intentoCobro.count({ where: { culqiCargoId: { not: null } } });
  console.log(`\n    Cargos hechos en Culqi integración: ${cargosCulqi} · correos capturados: ${correos.length}`);

  console.log(fallos ? `\n${fallos} fallo(s), ${pasos} bien` : `\nE2E OK — ${pasos} comprobaciones de punta a punta`);
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
})().catch(async (e) => {
  console.error('🔴', e.response?.data || e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
