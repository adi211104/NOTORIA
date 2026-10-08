// brand-shield/scripts/caso-cliente.js
//
// «Me cobraron y sigo en Gratis», «me cobraron dos veces», «cancelé y me
// volvieron a cobrar»: TODO lo que Notoria sabe del dinero de una cuenta, en
// una sola línea de tiempo y con el diagnóstico de cada caso (réplica del
// auditor, 2026-10-07, §19). Solo lectura: no cambia nada.
//
//   node scripts/caso-cliente.js cliente@correo.com            (base, sin Culqi)
//   railway run --service api node scripts/caso-cliente.js cliente@correo.com --culqi
//
// Con --culqi además lista los cargos que CULQI tiene para ese correo y los
// cruza con la tabla `pagos`: un cargo cobrado que no está en Notoria es el
// caso «me cobraron y no tengo el plan». (railway run da la llave live; el
// script arregla solo la DATABASE_URL interna — lib-env-produccion.js.)
//
// Procedimiento completo: docs/runbook-cobros.md.

require('./lib-env-produccion')();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/lib/prisma');

const email = (process.argv[2] || '').trim().toLowerCase();
const conCulqi = process.argv.includes('--culqi');
if (!email || !email.includes('@')) {
  console.error('Uso: node scripts/caso-cliente.js <correo> [--culqi]');
  process.exit(2);
}
const hora = (d) => (d ? new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false }) : '—');
const soles = (c, m = 'PEN') => `${m} ${((c || 0) / 100).toFixed(2)}`;

(async () => {
  const u = await prisma.usuario.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      id: true, email: true, plan: true, suscripcionActiva: true, fechaVencimiento: true, periodoFacturacion: true,
      localesExtra: true, promoBienvenidaUsada: true, mesesPromoRestantes: true, tarjetaCulqiId: true, creadoEn: true,
    },
  });
  if (!u) { console.log(`No hay ninguna cuenta con ${email}.`); process.exit(1); }

  const [intentos, pagos, eventos, comprobantes] = await Promise.all([
    prisma.intentoCobro.findMany({ where: { usuarioId: u.id }, orderBy: { creadoEn: 'asc' } }),
    prisma.pago.findMany({ where: { usuarioId: u.id }, orderBy: { creadoEn: 'asc' } }),
    prisma.eventoSuscripcion.findMany({ where: { usuarioId: u.id }, orderBy: { creadoEn: 'asc' } }),
    prisma.comprobante.findMany({ where: { usuarioId: u.id }, select: { numero: true, estadoSunat: true, pagoId: true, creadoEn: true } }),
  ]);
  const cargos = new Set([...pagos.map((p) => p.culqiCargoId), ...intentos.map((i) => i.culqiCargoId)].filter(Boolean));
  const webhooks = cargos.size
    ? (await prisma.eventoWebhook.findMany({ where: { proveedor: 'culqi' }, orderBy: { recibidoEn: 'desc' }, take: 1000 }))
      .filter((w) => [...cargos].some((c) => JSON.stringify(w.payload).includes(c)))
    : [];

  console.log(`\nCUENTA ${u.email} (${u.id}) · creada ${hora(u.creadoEn)}`);
  console.log(`  Plan ${u.plan} · renovación ${u.suscripcionActiva ? 'ACTIVA' : 'apagada'} · vence ${hora(u.fechaVencimiento)} · ${u.periodoFacturacion || '—'}`
    + ` · locales extra ${u.localesExtra} · promo ${u.promoBienvenidaUsada ? `usada (${u.mesesPromoRestantes} mes(es) restantes)` : 'sin usar'} · tarjeta ${u.tarjetaCulqiId ? 'guardada' : 'ninguna'}`);

  const linea = [];
  for (const i of intentos) {
    linea.push([i.creadoEn, `COBRO RECLAMADO  ${i.tipo} ${soles(i.monto, i.moneda)} · ${i.estado}${i.culqiCargoId ? ` · cargo ${i.culqiCargoId}` : ''}${i.pagoId ? ' · aplicado' : ''}${i.ultimoError ? ` · «${i.ultimoError}»` : ''} · clave ${i.clave}`]);
  }
  for (const p of pagos) linea.push([p.creadoEn, `PAGO             ${p.tipo} ${p.plan}/${p.periodo} ${soles(p.monto, p.moneda)} · ${p.estado}${p.montoReembolsado ? ` · devuelto ${soles(p.montoReembolsado, p.moneda)}` : ''} · ${p.culqiCargoId || 'sin cargo'}`]);
  for (const e of eventos) linea.push([e.creadoEn, `SUSCRIPCIÓN      ${e.tipo} ${JSON.stringify(e.detalle)}`]);
  for (const w of webhooks) linea.push([w.recibidoEn, `WEBHOOK          ${w.tipo || '?'} · ${w.estado} · ${w.intentos} intento(s)${w.ultimoError ? ` · «${w.ultimoError}»` : ''}`]);
  for (const c of comprobantes) linea.push([c.creadoEn, `COMPROBANTE      ${c.numero} · SUNAT ${c.estadoSunat}`]);
  linea.sort((a, b) => new Date(a[0]) - new Date(b[0]));
  console.log('\nLÍNEA DE TIEMPO (hora de Lima)');
  for (const [t, txt] of linea) console.log(`  ${hora(t)}  ${txt}`);
  if (!linea.length) console.log('  (nada: esta cuenta nunca intentó pagar)');

  // ── Diagnóstico ─────────────────────────────────────────────────────────
  const avisos = [];
  const sinAplicar = intentos.filter((i) => i.estado === 'EXITOSO' && !i.pagoId);
  if (sinAplicar.length) avisos.push(`🔴 ${sinAplicar.length} cobro(s) EXITOSO(s) SIN aplicar (${sinAplicar.map((i) => i.culqiCargoId).join(', ')}): Culqi cobró y la cuenta no lo refleja. La reconciliación (:15 y :45) lo aplica sola; si lleva más de una hora, mirar su «ultimoError» y el log con el id del intento.`);
  const enDuda = intentos.filter((i) => ['DESCONOCIDO', 'PROCESANDO'].includes(i.estado));
  if (enDuda.length) avisos.push(`🟠 ${enDuda.length} cobro(s) en duda (${enDuda.map((i) => `${i.id} ${i.estado}`).join(', ')}): no se sabe si Culqi cobró. NO reintentar ni cobrar a mano: la reconciliación busca el cargo por metadata.intento y decide (24 h máximo). Con --culqi se ve ya.`);
  const exitosos = pagos.filter((p) => p.estado !== 'FALLIDO');
  for (let i = 1; i < exitosos.length; i += 1) {
    const [a, b] = [exitosos[i - 1], exitosos[i]];
    if (new Date(b.creadoEn) - new Date(a.creadoEn) < 36 * 3600e3) {
      const ia = intentos.find((x) => x.pagoId === a.id); const ib = intentos.find((x) => x.pagoId === b.id);
      avisos.push(`${a.tipo === b.tipo ? '🟠' : 'ℹ️'} Dos cobros en menos de 36 h: ${a.tipo} ${hora(a.creadoEn)} y ${b.tipo} ${hora(b.creadoEn)}. Claves ${ia?.clave || '?'} / ${ib?.clave || '?'}: son operaciones DISTINTAS (la misma clave no puede cobrarse dos veces). Explicar cuál es cuál; si una no debió ocurrir, reembolsar (orden: SUNAT acepta → reembolsar → anular, CLAUDE.md §9).`);
    }
  }
  const cancel = eventos.filter((e) => e.tipo === 'CANCELACION');
  for (const c of cancel) {
    const despues = intentos.filter((i) => i.tipo === 'RENOVACION' && new Date(i.creadoEn) > new Date(c.creadoEn) && i.estado !== 'FALLIDO');
    if (despues.length) avisos.push(`🔴 Renovación RECLAMADA después de la cancelación del ${hora(c.creadoEn)} (${despues.map((i) => hora(i.creadoEn)).join(', ')}). No debería poder pasar (lib/cobros.js relee la cuenta con su candado): reembolsar y reportarlo como fallo.`);
    const antes = intentos.filter((i) => i.tipo === 'RENOVACION' && new Date(i.creadoEn) <= new Date(c.creadoEn) && new Date(c.creadoEn) - new Date(i.creadoEn) < 3600e3);
    if (antes.length) avisos.push(`ℹ️ La renovación se reclamó a las ${hora(antes[0].creadoEn)} y la cancelación llegó DESPUÉS (${hora(c.creadoEn)}): el cobro estaba autorizado. Por buena fe, ofrecer el reembolso (retracto/devoluciones).`);
  }
  const wPend = webhooks.filter((w) => ['PENDIENTE', 'PROCESANDO', 'FALLIDO'].includes(w.estado));
  if (wPend.length) avisos.push(`🟠 ${wPend.length} webhook(s) de esta cuenta sin procesar (${wPend.map((w) => w.estado).join(', ')}): reintento-webhooks los toma cada 10 min; FALLIDO = 8 intentos, revisar a mano.`);
  if (u.plan !== 'GRATIS' && !u.tarjetaCulqiId && !pagos.length) avisos.push('ℹ️ Plan de pago SIN pagos ni tarjeta: plan dado a mano (scripts/dar-plan.js).');

  if (conCulqi) {
    const culqi = require('../src/lib/culqi');
    if (!culqi.configurado()) avisos.push('⚠️ --culqi sin llave de Culqi: correr con railway run.');
    else {
      const enCulqi = await culqi.listarCargosDe(u.email);
      console.log(`\nCULQI (${enCulqi.length} cargo(s) para ${u.email})`);
      const enBase = new Set(pagos.map((p) => p.culqiCargoId));
      for (const c of enCulqi) {
        const cobrado = culqi.cargoExitoso(c);
        console.log(`  ${hora(c.creation_date)}  ${c.id} ${soles(c.amount, c.currency_code)} · ${cobrado ? 'COBRADO' : 'no cobrado'} · intento ${c.metadata?.intento || '—'}${enBase.has(c.id) ? '' : '  ← NO está en pagos'}`);
        if (cobrado && !enBase.has(c.id)) avisos.push(`🔴 Culqi COBRÓ ${c.id} y Notoria no tiene ese Pago. Si tiene metadata.intento, la reconciliación lo completa; si no lo tiene, es un cargo hecho fuera del flujo: aplicar a mano o reembolsar.`);
      }
    }
  }

  console.log('\nDIAGNÓSTICO');
  console.log(avisos.length ? avisos.map((a) => `  ${a}`).join('\n') : '  Nada raro: lo que cobró Culqi (según la base) está aplicado y la línea de tiempo es coherente.');
  console.log('\nProcedimiento: docs/runbook-cobros.md');
  await prisma.$disconnect();
})().catch(async (e) => { console.error('🔴', e.message); await prisma.$disconnect().catch(() => {}); process.exit(1); });
