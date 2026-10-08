// brand-shield/src/lib/libroComisiones.js
//
// Libro de comisiones del promotor (réplica del auditor, 2026-10-07).
//
// 🔴 El problema que cierra: la comisión se DERIVA de los Pagos reales
// (lib/rutaComercial.js), y eso dice bien cuánto corresponde HOY, pero no deja
// rastro de lo que se reconoció ayer. Si el bono se devengó con el 2.º pago, se
// le pagó al promotor, y un mes después el cliente obtiene la devolución del
// primer pago, el cálculo pasa a decir «0» y el dinero ya entregado queda sin
// explicación: nadie puede reconstruir qué se debía, qué se pagó y qué hay que
// descontar (contrato 7.4: «se descontará de las liquidaciones siguientes»).
//
// La solución es un libro de ASIENTOS que solo crece (`movimientos_comision`):
//   · `sincronizar()` compara, para cada (promotor, visita, concepto, pago), lo
//     que el cálculo dice que está devengado con la suma de lo ya asentado, y
//     asienta SOLO la diferencia: GENERADA la primera vez, AJUSTADA si cambia
//     (reembolso parcial), REVERSADA si baja a 0 (reembolso del primer pago,
//     visita anulada, otro registro prevalece, promotor reasignado). Nunca
//     edita ni borra un asiento. Es idempotente: correrla dos veces seguidas
//     no asienta nada la segunda vez.
//   · Lo pagado al promotor es un asiento PAGO (negativo) con su referencia.
//   · Saldo del promotor = Σ monto de sus asientos.
//   · La liquidación de un mes (contrato 8.1) son los asientos REGISTRADOS en
//     ese mes en Lima: un mes cerrado no cambia después, porque lo que se
//     descubre tarde se asienta en el mes en que se descubre.
//
// La sincronización corre con un candado transaccional (dos sincronizaciones
// simultáneas asentarían dos veces la misma diferencia), cada hora por cron y
// antes de cada lectura de /ruta.

const prisma = require('./prisma');
const rc = require('./rutaComercial');

const SISTEMA = 'sistema';
const CONCEPTOS_DERIVADOS = ['ALTA', 'RESIDUAL'];
const PAGOS_SELECT = { select: { id: true, plan: true, periodo: true, tipo: true, estado: true, monto: true, montoReembolsado: true, creadoEn: true } };

/**
 * Para cada visita, la cuenta de Notoria con la que se vincula: por correo, y
 * de respaldo por el local de Google Maps (elegirCuenta). Devuelve
 * { [visitaId]: { cuenta, vinculo } }.
 */
async function vincularCuentas(db, visitas) {
  const correos = [...new Set(visitas.map((v) => v.correo).filter(Boolean).map((c) => c.toLowerCase()))];
  // Búsqueda insensible a mayúsculas: hay cuentas anteriores a la
  // normalización de correos (CLAUDE.md §14).
  const cuentas = correos.length ? await db.usuario.findMany({
    where: { OR: correos.map((email) => ({ email: { equals: email, mode: 'insensitive' } })) },
    select: { id: true, email: true, localesExtra: true, pagos: PAGOS_SELECT },
  }) : [];
  const porCorreo = Object.fromEntries(cuentas.map((c) => [c.email.toLowerCase(), c]));

  const sinCorreo = visitas.filter((v) => v.placeId && !(v.correo && porCorreo[v.correo.toLowerCase()]));
  const placeIds = [...new Set(sinCorreo.map((v) => v.placeId))];
  const negocios = placeIds.length ? await db.negocio.findMany({
    where: { googlePlaceId: { in: placeIds } },
    select: { googlePlaceId: true, creadoEn: true, usuario: { select: { id: true, email: true, localesExtra: true, pagos: PAGOS_SELECT } } },
  }) : [];
  const porLocal = {};
  for (const n of negocios) (porLocal[n.googlePlaceId] ||= []).push({ ...n.usuario, negocioCreadoEn: n.creadoEn });

  const out = {};
  for (const v of visitas) {
    let cuenta = v.correo ? porCorreo[v.correo.toLowerCase()] : null;
    let vinculo = cuenta ? 'correo' : null;
    if (!cuenta && v.placeId) { cuenta = rc.elegirCuenta(porLocal[v.placeId]); if (cuenta) vinculo = 'maps'; }
    out[v.id] = { cuenta: cuenta || null, vinculo };
  }
  return out;
}

const COMISION_ANULADA = { alta: 0, residual: 0, ganada: 0, porGanar: 0, plan: null, periodo: null, pagosCobrados: 0, estado: 'ANULADA', detalle: [] };

/**
 * Evalúa TODAS las visitas juntas (la atribución de una depende de las demás):
 * { [visitaId]: { cuenta, vinculo, comision, prevaleceOtra } }.
 */
async function evaluar(db, visitas, ahora = new Date()) {
  const vinculos = await vincularCuentas(db, visitas);
  const evals = {};
  for (const v of visitas) {
    const { cuenta, vinculo } = vinculos[v.id];
    const comision = v.anuladaEn
      ? { ...COMISION_ANULADA, politica: v.politicaComision }
      : rc.comisionDeVisita({ fechaVisita: v.fechaVisita, pagos: cuenta?.pagos || [], localesExtra: cuenta?.localesExtra, ahora, politica: v.politicaComision });
    evals[v.id] = { cuenta, vinculo, comision, prevaleceOtra: null };
  }
  const perdedoras = rc.resolverAtribucion(visitas.map((v) => ({
    id: v.id, fechaVisita: v.fechaVisita, anuladaEn: v.anuladaEn, cuentaId: evals[v.id].cuenta?.id || null, comision: evals[v.id].comision,
  })));
  for (const [id, ganadora] of Object.entries(perdedoras)) {
    const e = evals[id];
    e.prevaleceOtra = ganadora;
    // Lo que se ve en /ruta tiene que coincidir con lo que el libro asienta.
    e.comision = { ...e.comision, ganada: 0, porGanar: 0, detalle: [], estado: 'REGISTRO_PREVIO' };
  }
  return evals;
}

const claveDe = (m) => `${m.promotor}|${m.visitaId}|${m.concepto}|${m.pagoId || ''}`;

/** Por qué baja un asiento derivado: va en `motivo`, que es lo que lee el promotor. */
function motivoDeBaja({ visita, evaluacion, asiento }) {
  if (!visita) return 'La visita ya no existe';
  if (visita.anuladaEn) return `Visita anulada: ${visita.motivoAnulacion || 'sin motivo'}`;
  if (visita.promotor !== asiento.promotor) return `Visita reasignada a ${visita.promotor}`;
  const c = evaluacion?.comision;
  if (evaluacion?.prevaleceOtra) return 'Prevalece un registro anterior del mismo cliente (cláusula 7.1.d)';
  if (c?.estado === 'ANULADA') return 'El primer pago del cliente se reembolsó (cláusula 7.4)';
  if (!evaluacion?.cuenta) return 'La visita ya no se vincula con la cuenta que pagó (cambió el correo o el local)';
  if (asiento.concepto === 'RESIDUAL') return 'El pago que generó este residual se reembolsó (cláusula 7.4)';
  return 'Recalculado con los pagos reales';
}

/**
 * Asientos que faltan para que el libro diga lo mismo que el cálculo. Pura: la
 * prueba la ejercita sin base. `asentado`: [{ promotor, visitaId, concepto,
 * pagoId, total }]. `objetivos`: salida de rc.objetivosDeVisita.
 */
function diferencias({ objetivos, asentado, visitasPorId = {}, evals = {} }) {
  const meta = {};
  for (const o of objetivos) meta[claveDe(o)] = o;
  const actual = {};
  for (const a of asentado) actual[claveDe(a)] = a;
  const claves = new Set([...Object.keys(meta), ...Object.keys(actual)]);
  const nuevos = [];
  for (const k of claves) {
    const o = meta[k];
    const a = actual[k];
    const ya = a ? a.total : 0;
    const debe = o ? o.monto : 0;
    const delta = debe - ya;
    if (!delta) continue;
    const ref = o || a;
    const tipo = delta > 0 ? (ya === 0 ? 'GENERADA' : 'AJUSTADA') : (debe === 0 ? 'REVERSADA' : 'AJUSTADA');
    let motivo;
    if (delta > 0) motivo = ref.concepto === 'ALTA' ? 'Bono de alta devengado' : 'Residual del pago devengado';
    else if (debe > 0) motivo = 'Reembolso parcial del pago: el residual baja en la misma proporción (cláusula 7.4)';
    else motivo = motivoDeBaja({ visita: visitasPorId[ref.visitaId], evaluacion: evals[ref.visitaId], asiento: ref });
    nuevos.push({
      promotor: ref.promotor,
      visitaId: ref.visitaId,
      concepto: ref.concepto,
      pagoId: ref.pagoId || null,
      tipo,
      monto: delta,
      politica: o?.politica ?? a?.politica ?? null,
      fechaDevengo: o?.fechaDevengo || null,
      motivo,
      autor: SISTEMA,
    });
  }
  return nuevos;
}

/**
 * Pone el libro al día. Devuelve los asientos creados. Con candado: dos
 * sincronizaciones a la vez leerían el mismo «asentado» y duplicarían la
 * diferencia.
 */
async function sincronizar({ db = prisma, ahora = new Date() } = {}) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('libro-comisiones'))`;
    const visitas = await tx.visitaComercial.findMany();
    const evals = await evaluar(tx, visitas, ahora);
    const objetivos = visitas.flatMap((v) => rc.objetivosDeVisita(v, evals[v.id].comision, { perdedora: !!evals[v.id].prevaleceOtra }));
    const grupos = await tx.movimientoComision.groupBy({
      by: ['promotor', 'visitaId', 'concepto', 'pagoId'],
      where: { concepto: { in: CONCEPTOS_DERIVADOS } },
      _sum: { monto: true },
    });
    const asentado = grupos.map((g) => ({ ...g, total: g._sum.monto || 0 }));
    const nuevos = diferencias({ objetivos, asentado, visitasPorId: Object.fromEntries(visitas.map((v) => [v.id, v])), evals });
    if (nuevos.length) await tx.movimientoComision.createMany({ data: nuevos });
    return nuevos;
  }, { timeout: 30000 });
}

/** Saldo por promotor: { [promotor]: { devengado, pagado, ajustes, saldo } }. */
async function saldos({ db = prisma, promotor } = {}) {
  const grupos = await db.movimientoComision.groupBy({
    by: ['promotor', 'concepto'],
    where: promotor ? { promotor } : {},
    _sum: { monto: true },
  });
  const out = {};
  for (const g of grupos) {
    const s = (out[g.promotor] ||= { devengado: 0, pagado: 0, ajustes: 0, saldo: 0 });
    const m = g._sum.monto || 0;
    if (CONCEPTOS_DERIVADOS.includes(g.concepto)) s.devengado += m;
    else if (g.concepto === 'PAGO') s.pagado += -m;
    else s.ajustes += m;
    s.saldo += m;
  }
  return out;
}

/** Inicio de un mes de Lima (UTC−5, sin horario de verano) como Date UTC. */
const inicioMesLima = (anio, mes) => new Date(Date.UTC(anio, mes - 1, 1, 5));

/**
 * Liquidación de un mes (contrato 8.1): saldo al empezar, los asientos
 * registrados en el mes con su detalle por cliente, y saldo al cerrar.
 * `mes` = 'AAAA-MM'.
 */
async function liquidacion({ db = prisma, promotor, mes }) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
  if (!m || +m[2] < 1 || +m[2] > 12) throw Object.assign(new Error('El mes va como AAAA-MM'), { status: 400 });
  const desde = inicioMesLima(+m[1], +m[2]);
  const hasta = +m[2] === 12 ? inicioMesLima(+m[1] + 1, 1) : inicioMesLima(+m[1], +m[2] + 1);
  const [previo, asientos] = await Promise.all([
    db.movimientoComision.aggregate({ where: { promotor, creadoEn: { lt: desde } }, _sum: { monto: true } }),
    db.movimientoComision.findMany({
      where: { promotor, creadoEn: { gte: desde, lt: hasta } },
      orderBy: { creadoEn: 'asc' },
      include: { visita: { select: { nombre: true, distrito: true } } },
    }),
  ]);
  const saldoInicial = previo._sum.monto || 0;
  const movimiento = asientos.reduce((s, a) => s + a.monto, 0);
  return { promotor, mes, desde, hasta, saldoInicial, movimiento, saldoFinal: saldoInicial + movimiento, asientos };
}

/** Texto de la liquidación, para mandarla por correo o WhatsApp. */
function textoLiquidacion(l) {
  const soles = (c) => `${c < 0 ? '−' : ''}S/${(Math.abs(c) / 100).toFixed(2)}`;
  const dia = (f) => new Date(f).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit' });
  const ETQ = { ALTA: 'Bono de alta', RESIDUAL: 'Residual', PAGO: 'Pago al promotor', AJUSTE: 'Ajuste' };
  const lineas = l.asientos.map((a) => `${dia(a.creadoEn)} · ${a.visita?.nombre || '—'} · ${ETQ[a.concepto] || a.concepto} ${a.tipo.toLowerCase()} · ${soles(a.monto)}${a.motivo && a.tipo !== 'GENERADA' ? ` — ${a.motivo}` : ''}${a.referencia ? ` (ref. ${a.referencia})` : ''}`);
  return [
    `Liquidación de comisiones Notoria — ${l.promotor} — ${l.mes}`,
    `Saldo al inicio del mes: ${soles(l.saldoInicial)}`,
    '',
    ...(lineas.length ? lineas : ['Sin movimientos en el mes.']),
    '',
    `Movimiento del mes: ${soles(l.movimiento)}`,
    `Saldo por pagar al cierre: ${soles(l.saldoFinal)}`,
    'Montos sin IGV, según el contrato de promoción (cláusulas 6 a 8).',
  ].join('\n');
}

/** Cron horario con candado (lib/candado.js). */
function iniciarLibroComisiones() {
  const { programar } = require('./candado');
  programar('20 * * * *', 'libro-comisiones', 10, async () => {
    const nuevos = await sincronizar().catch((e) => { console.error('[Comisiones] 🔴 No se pudo sincronizar el libro:', e.message); return []; });
    if (nuevos.length) console.log(`[Comisiones] ${nuevos.length} asiento(s) nuevo(s) en el libro`);
  });
  console.log('📒 Cron del libro de comisiones iniciado');
}

module.exports = {
  SISTEMA, CONCEPTOS_DERIVADOS, vincularCuentas, evaluar, diferencias, sincronizar, saldos, liquidacion, textoLiquidacion, inicioMesLima, iniciarLibroComisiones,
};
