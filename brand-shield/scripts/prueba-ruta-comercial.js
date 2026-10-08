// node scripts/prueba-ruta-comercial.js
//
// Ruta comercial: acceso a /ruta y comisión del promotor (modelo C del contrato).
// Los importes esperados son los EJEMPLOS DEL ANEXO 1 del contrato: si esto se
// separa del contrato firmado, se le paga al promotor algo distinto de lo que
// firmó y nada más lo avisa. Sin red ni base: Prisma y la sesión van simulados.

const path = require('path');
const http = require('http');

let ok = 0, mal = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { mal++; console.log('  ✗', nombre, detalle); }
};

const { accesoDe, tablaAcceso, comisionDeVisita, elegirCuenta, estadoEfectivo, POLITICA_VIGENTE } = require('../src/lib/rutaComercial');

console.log('\n1. Acceso');
const ACC = 'Didier@Gmail.com:dueno, promotor@usenotoria.app:Usuario1';
check('el dueño entra y es dueño', accesoDe('didier@gmail.com', ACC)?.dueno === true);
check('el correo se compara sin mayúsculas', accesoDe('DIDIER@gmail.COM', ACC)?.alias === 'dueno');
check('el promotor entra con su alias', accesoDe('promotor@usenotoria.app', ACC)?.alias === 'Usuario1');
check('el promotor NO es dueño', accesoDe('promotor@usenotoria.app', ACC)?.dueno === false);
check('un correo ajeno no entra', accesoDe('cliente@x.com', ACC) === null);
check('sin variable, NADIE entra (falla cerrado)', accesoDe('didier@gmail.com', '') === null && accesoDe('didier@gmail.com', undefined) === null);
check('pares mal formados se ignoran', Object.keys(tablaAcceso('basura,:x,a@b.c:,ok@x.com:P1')).join() === 'ok@x.com');

console.log('\n2. Comisión — ejemplos del Anexo 1 del contrato');
const d = (s) => new Date(s + 'T15:00:00Z');
let nPago = 0; // cada Pago real tiene id: el libro asienta un residual POR pago
const pago = (fecha, monto, extra = {}) => ({ id: `pg${(nPago += 1)}`, creadoEn: d(fecha), monto, estado: 'EXITOSO', tipo: 'RENOVACION', plan: 'NEGOCIO', periodo: 'mensual', ...extra });
const visita = '2026-01-05';
const ahora = d('2027-06-01');

// Negocio mensual con promo, 12 meses
const doce = [pago('2026-01-10', 2950, { tipo: 'INICIAL' }), pago('2026-02-10', 2950)];
for (let m = 3; m <= 12; m++) doce.push(pago(`2026-${String(m).padStart(2, '0')}-10`, 5900));
doce.push(pago('2027-01-10', 5900)); // mes 13: ya fuera de los 12 meses
const c1 = comisionDeVisita({ fechaVisita: d(visita), pagos: doce, ahora });
check('Negocio mensual con promo, 12 meses = S/77.50', c1.ganada === 7750, `(dio ${c1.ganada})`);
check('…y el pago del mes 13 no suma', c1.residual === 5250, `(residual ${c1.residual})`);

const c2 = comisionDeVisita({ fechaVisita: d(visita), pagos: doce.slice(0, 3), ahora });
check('cancela tras el 3.er pago = S/32.50', c2.ganada === 3250, `(dio ${c2.ganada})`);

const c3 = comisionDeVisita({ fechaVisita: d(visita), pagos: [pago('2026-01-10', 2950, { tipo: 'INICIAL' })], ahora });
check('con un solo pago no se gana todavía', c3.ganada === 0 && c3.porGanar === 2500 && c3.estado === 'ESPERA_2DO_PAGO');

const c4 = comisionDeVisita({ fechaVisita: d(visita), pagos: [pago('2026-01-10', 2950, { tipo: 'INICIAL', estado: 'REEMBOLSADO' }), pago('2026-02-10', 2950)], ahora });
check('primer pago reembolsado = sin comisión', c4.ganada === 0 && c4.porGanar === 0 && c4.estado === 'ANULADA');

const anual = (plan, monto, fecha = '2026-01-10') => [pago(fecha, monto, { tipo: 'INICIAL', plan, periodo: 'anual' })];
const c5 = comisionDeVisita({ fechaVisita: d(visita), pagos: anual('NEGOCIO', 56400), ahora });
check('Negocio anual = S/72.80', c5.ganada === 7280, `(dio ${c5.ganada})`);
const c6 = comisionDeVisita({ fechaVisita: d(visita), pagos: anual('FRANQUICIA', 171600), ahora });
check('Franquicia anual = S/221.27', c6.ganada === 22127, `(dio ${c6.ganada})`);
const c7 = comisionDeVisita({ fechaVisita: d(visita), pagos: anual('NEGOCIO', 56400), ahora: d('2026-01-20') });
check('anual antes de 15 días: por ganar, no ganada', c7.ganada === 0 && c7.porGanar === 7280 && c7.estado === 'ESPERA_15_DIAS');
const c8 = comisionDeVisita({ fechaVisita: d(visita), pagos: [pago('2026-01-10', 9800, { tipo: 'INICIAL' }), pago('2026-02-10', 9800)], localesExtra: 1, ahora });
check('Negocio con 1 local extra: alta S/41.53', c8.alta === 4153, `(alta ${c8.alta})`);
const c9 = comisionDeVisita({ fechaVisita: d(visita), pagos: [pago('2026-01-10', 2900, { tipo: 'INICIAL', plan: 'IMPULSO' }), pago('2026-02-10', 2900, { plan: 'IMPULSO' })], localesExtra: 3, ahora });
check('Impulso ignora locales extra: alta S/12.29', c9.alta === 1229, `(alta ${c9.alta})`);

console.log('\n3. Atribución y silencios');
check('sin pagos no hay comisión', comisionDeVisita({ fechaVisita: d(visita), pagos: [], ahora }).estado === 'SIN_PAGOS');
check('si ya pagaba ANTES de la visita, no se atribuye',
  comisionDeVisita({ fechaVisita: d('2026-03-01'), pagos: doce, ahora }).estado === 'YA_ERA_CLIENTE');
check('primer pago a más de 60 días de la visita: fuera de plazo',
  comisionDeVisita({ fechaVisita: d('2025-10-01'), pagos: doce, ahora }).estado === 'FUERA_DE_PLAZO');
check('a 59 días todavía cuenta',
  comisionDeVisita({ fechaVisita: d('2025-11-12'), pagos: doce, ahora }).estado === 'GANADA');
check('los cobros FALLIDOS no cuentan como pago',
  comisionDeVisita({ fechaVisita: d(visita), pagos: [pago('2026-01-10', 2950), pago('2026-02-10', 2950, { estado: 'FALLIDO' })], ahora }).ganada === 0);
check('el cargo de PRUEBA no cuenta',
  comisionDeVisita({ fechaVisita: d(visita), pagos: [pago('2026-01-02', 100, { tipo: 'PRUEBA' })], ahora }).estado === 'SIN_PAGOS');

console.log('\n3b. Vinculación por Google Maps y estado automático');
const cuentaNueva = { id: 'n', pagos: [pago('2026-01-20', 2950)], negocioCreadoEn: d('2026-01-15') };
const cuentaVieja = { id: 'v', pagos: [pago('2025-06-01', 5900)], negocioCreadoEn: d('2025-05-01') };
const cuentaGratis = { id: 'g', pagos: [], negocioCreadoEn: d('2025-01-01') };
check('mismo local en varias cuentas: cuenta la que pagó primero', elegirCuenta([cuentaNueva, cuentaVieja, cuentaGratis]).id === 'v');
check('si ninguna pagó, la que agregó el local primero', elegirCuenta([{ id: 'b', pagos: [], negocioCreadoEn: d('2026-02-01') }, cuentaGratis]).id === 'g');
check('sin cuentas: null', elegirCuenta([]) === null && elegirCuenta(undefined) === null);
const sin = comisionDeVisita({ fechaVisita: d(visita), pagos: [], ahora });
check('pagó → «cliente» aunque el promotor dejó «interesado»', estadoEfectivo('interesado', { cuentaEncontrada: true, comision: c1 }) === 'cliente');
check('cuenta sin pagos → «cuenta_gratis»', estadoEfectivo('volver', { cuentaEncontrada: true, comision: sin }) === 'cuenta_gratis');
check('sin cuenta, se respeta lo que marcó el promotor', estadoEfectivo('no_interesado', { cuentaEncontrada: false, comision: sin }) === 'no_interesado');
check('marcó «pagó» y aún no se encuentra el pago: no se degrada', estadoEfectivo('cliente', { cuentaEncontrada: true, comision: sin }) === 'cliente');

console.log('\n3c. Contrato 7.1.d, 7.3 y 7.4 (réplica del auditor, 2026-10-07)');
{
  const { resolverAtribucion, objetivosDeVisita } = require('../src/lib/rutaComercial');
  const { diferencias } = require('../src/lib/libroComisiones');
  // Cliente que VUELVE: pagó en 2025, dejó de pagar, y más de 6 meses después
  // de que se le acabó lo pagado lo visita el promotor.
  const viejo = [pago('2025-01-10', 5900, { tipo: 'INICIAL' })];
  const vuelve = [...viejo, pago('2026-01-10', 5900, { tipo: 'INICIAL' }), pago('2026-02-10', 5900)];
  const cv = comisionDeVisita({ fechaVisita: d('2026-01-05'), pagos: vuelve, ahora });
  check('cliente que dejó de pagar hace más de 6 meses SÍ se atribuye (7.1.d)', cv.estado === 'GANADA' && cv.alta === 2500, JSON.stringify(cv));
  const reciente = [pago('2025-10-10', 5900, { tipo: 'INICIAL' }), pago('2026-01-10', 5900), pago('2026-02-10', 5900)];
  check('CONTROL: si pagaba hace menos de 6 meses, no', comisionDeVisita({ fechaVisita: d('2026-01-05'), pagos: reciente, ahora }).estado === 'YA_ERA_CLIENTE');
  const anualViejo = [pago('2025-03-01', 56400, { tipo: 'INICIAL', periodo: 'anual' }), pago('2026-01-10', 5900, { tipo: 'INICIAL' })];
  check('un anual cubre 12 meses: pagado en marzo 2025 sigue siendo cliente en enero 2026', comisionDeVisita({ fechaVisita: d('2026-01-05'), pagos: anualViejo, ahora }).estado === 'YA_ERA_CLIENTE');
  const devuelto = [pago('2025-12-01', 5900, { tipo: 'INICIAL', estado: 'REEMBOLSADO' }), pago('2026-01-10', 5900, { tipo: 'INICIAL' }), pago('2026-02-10', 5900)];
  check('un pago anterior reembolsado entero no lo hacía cliente', comisionDeVisita({ fechaVisita: d('2026-01-05'), pagos: devuelto, ahora }).estado === 'GANADA');

  // 7.3 + 7.4: el bono se devenga con el 2.º pago y no se pierde si después
  // se reembolsa ese 2.º pago; solo cae su residual.
  const segundoDevuelto = [pago('2026-01-10', 5900, { tipo: 'INICIAL' }), pago('2026-02-10', 5900, { estado: 'REEMBOLSADO' })];
  const cs = comisionDeVisita({ fechaVisita: d(visita), pagos: segundoDevuelto, ahora });
  check('2.º pago reembolsado: el bono SIGUE devengado, su residual no', cs.estado === 'GANADA' && cs.ganada === 2500 && cs.residual === 0, JSON.stringify(cs));
  check('el detalle suma exactamente lo ganado (lo que asienta el libro)', [c1, c2, c5, c6, c8].every((c) => c.detalle.reduce((t, x) => t + x.monto, 0) === c.ganada));
  check('mensual: el bono se devenga en la fecha del 2.º pago', +c1.detalle[0].fechaDevengo === +d('2026-02-10'));
  check('anual: bono y residual se devengan a los 15 días', c5.detalle.every((x) => +x.fechaDevengo === +d('2026-01-10') + 15 * 864e5));
  check('lo que aún no se devenga no entra al detalle', c3.detalle.length === 0 && c7.detalle.length === 0);

  // 7.1.d: dos registros del mismo cliente → prevalece el más antiguo.
  const E = (id, fecha, extra = {}) => ({ id, fechaVisita: d(fecha), anuladaEn: null, cuentaId: 'C', comision: { estado: 'GANADA', politica: 1 }, ...extra });
  let p = resolverAtribucion([E('b', '2026-01-20'), E('a', '2026-01-05')]);
  check('dos promotores, mismo cliente: gana el registro más antiguo', p.b === 'a' && !p.a, JSON.stringify(p));
  p = resolverAtribucion([E('a', '2026-01-05', { comision: { estado: 'FUERA_DE_PLAZO', politica: 1 } }), E('b', '2026-02-20')]);
  check('re-registrar dentro de los 60 días NO renueva el plazo del primero', p.b === 'a', JSON.stringify(p));
  p = resolverAtribucion([E('a', '2026-01-05', { anuladaEn: d('2026-01-06') }), E('b', '2026-01-20')]);
  check('un registro ANULADO no le quita la atribución a otro', !p.b);
  p = resolverAtribucion([E('a', '2026-01-05', { comision: { estado: 'FUERA_DE_PLAZO', politica: 1 } }), E('b', '2026-04-20')]);
  check('un registro posterior a los 60 días sí puede atribuirse', !p.b);
  p = resolverAtribucion([E('a', '2026-01-05', { cuentaId: 'X' }), E('b', '2026-01-06', { cuentaId: 'Y' })]);
  check('CONTROL: clientes distintos no compiten', Object.keys(p).length === 0);

  // El libro: asienta diferencias, nunca reescribe.
  const v = { id: 'v', promotor: 'P1', anuladaEn: null };
  const objetivos = objetivosDeVisita(v, c2);
  const asentar = (asentado, objs, extra = {}) => diferencias({ objetivos: objs, asentado, visitasPorId: { v }, evals: { v: { cuenta: { id: 'c' }, comision: extra.comision || c2 } } });
  const primera = asentar([], objetivos);
  check('primera sincronización: un asiento GENERADA por concepto', primera.length === 3 && primera.every((a) => a.tipo === 'GENERADA') && primera.reduce((t, a) => t + a.monto, 0) === 3250);
  const total = (lista) => lista.map((a) => ({ promotor: a.promotor, visitaId: a.visitaId, concepto: a.concepto, pagoId: a.pagoId, total: a.monto }));
  check('segunda sincronización sin cambios: NADA (idempotente)', asentar(total(primera), objetivos).length === 0);
  const cAnulada = comisionDeVisita({ fechaVisita: d(visita), pagos: [{ ...doce[0], estado: 'REEMBOLSADO' }, doce[1], doce[2]], ahora });
  const reversion = asentar(total(primera), objetivosDeVisita(v, cAnulada), { comision: cAnulada });
  check('🔴 reembolso del primer pago DESPUÉS de devengar: se asienta la REVERSIÓN, con motivo 7.4',
    reversion.length === 3 && reversion.every((a) => a.tipo === 'REVERSADA' && a.monto < 0 && /7\.4/.test(a.motivo)) && reversion.reduce((t, a) => t + a.monto, 0) === -3250, JSON.stringify(reversion));
  const parcialObj = objetivosDeVisita(v, comisionDeVisita({ fechaVisita: d(visita), pagos: [doce[0], doce[1], { ...doce[2], montoReembolsado: 2950 }], ahora }));
  const ajuste = asentar(total(primera), parcialObj);
  check('reembolso parcial del 3.er pago: un AJUSTADA negativo de la mitad de su residual', ajuste.length === 1 && ajuste[0].tipo === 'AJUSTADA' && ajuste[0].monto === -250, JSON.stringify(ajuste));
  const anuladaObj = objetivosDeVisita({ ...v, anuladaEn: new Date() }, c2);
  check('visita anulada después de devengar: todo se revierte', asentar(total(primera), anuladaObj).reduce((t, a) => t + a.monto, 0) === -3250);
  // Lo de arriba cargó el Prisma real; la sección 4 pone el doble antes de cargar la ruta.
  for (const m of ['../src/lib/libroComisiones', '../src/lib/prisma']) delete require.cache[require.resolve(m)];
}

console.log('\n4. La ruta de verdad, con Prisma y la sesión simulados');
(async () => {
  let sesion = { id: 'u1', email: 'promotor@usenotoria.app' };
  const visitas = [
    { id: 'v1', promotor: 'Usuario1', nombre: 'Local A', correo: 'cli@x.com', comisionPagada: 0, fechaVisita: d(visita), actualizadoEn: new Date() },
    { id: 'v2', promotor: 'Otro', nombre: 'Local B', correo: null, comisionPagada: 0, fechaVisita: d(visita), actualizadoEn: new Date() },
    // Sin correo: se vincula solo porque el cliente agregó el MISMO local de Maps en su panel.
    { id: 'v3', promotor: 'Usuario1', nombre: 'Local C', correo: null, placeId: 'ChIJ_C', estado: 'interesado', comisionPagada: 0, fechaVisita: d(visita), actualizadoEn: new Date() },
    // Correo que no existe, pero el local de Maps sí: Maps rescata el vínculo.
    { id: 'v4', promotor: 'Usuario1', nombre: 'Local D', correo: 'otro@x.com', placeId: 'ChIJ_D', estado: 'volver', comisionPagada: 0, fechaVisita: d(visita), actualizadoEn: new Date() },
    // Local de Maps que nadie agregó: sin cuenta.
    { id: 'v5', promotor: 'Usuario1', nombre: 'Local E', correo: null, placeId: 'ChIJ_E', estado: 'volver', comisionPagada: 0, fechaVisita: d(visita), actualizadoEn: new Date() },
  ];
  let ultimoUpdate = null;
  let borrados = 0;
  const cambios = [];
  const asientos = [];
  const coincide = (a, where = {}) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(a[k]);
      if ('lt' in v || 'gte' in v) return (!('lt' in v) || a[k] < v.lt) && (!('gte' in v) || a[k] >= v.gte);
    }
    return a[k] === v;
  });
  const prismaFalso = {
    $transaction: async (fn) => fn(prismaFalso),
    $executeRaw: async () => 0,
    movimientoComision: {
      create: async ({ data }) => { const a = { id: `m${asientos.length + 1}`, creadoEn: new Date(), ...data }; asientos.push(a); return a; },
      createMany: async ({ data }) => { data.forEach((x) => asientos.push({ id: `m${asientos.length + 1}`, creadoEn: new Date(), ...x })); return { count: data.length }; },
      findMany: async ({ where }) => asientos.filter((a) => coincide(a, where)),
      aggregate: async ({ where }) => ({ _sum: { monto: asientos.filter((a) => coincide(a, where)).reduce((t, a) => t + a.monto, 0) } }),
      groupBy: async ({ by, where }) => {
        const g = {};
        for (const a of asientos.filter((x) => coincide(x, where))) {
          const k = by.map((b) => a[b] ?? '').join('|');
          (g[k] ||= { ...Object.fromEntries(by.map((b) => [b, a[b] ?? null])), _sum: { monto: 0 } })._sum.monto += a.monto;
        }
        return Object.values(g);
      },
    },
    cambioVisita: {
      createMany: async ({ data }) => { cambios.push(...data); return { count: data.length }; },
      create: async ({ data }) => { cambios.push(data); return data; },
      findMany: async ({ where }) => cambios.filter((c) => c.visitaId === where.visitaId),
    },
    visitaComercial: {
      findMany: async ({ where = {} } = {}) => visitas.filter((v) => (!where.promotor || v.promotor === where.promotor)
        && (!('anuladaEn' in where) || !v.anuladaEn)),
      findFirst: async ({ where }) => { const v = visitas.find((x) => x.id === where.id && (!where.promotor || x.promotor === where.promotor)); return v ? { ...v } : null; },
      create: async ({ data }) => ({ id: 'nuevo', ...data }),
      update: async ({ where, data }) => {
        ultimoUpdate = data;
        const v = visitas.find((x) => x.id === where.id);
        if (v && (data.anuladaEn || data.promotor)) Object.assign(v, data);
        return { ...v, ...data };
      },
      delete: async () => { borrados += 1; return {}; },
    },
    usuario: { findMany: async ({ where }) => [{ id: 'c', email: 'CLI@x.com', localesExtra: 0, pagos: doce }]
      .filter((u) => where.OR.some((o) => o.email.equals.toLowerCase() === u.email.toLowerCase())) },
    negocio: {
      findMany: async ({ where }) => [
        { googlePlaceId: 'ChIJ_C', creadoEn: d('2026-01-08'), usuario: { id: 'cc', email: 'localc@x.com', localesExtra: 0, pagos: doce.slice(0, 3) } },
        { googlePlaceId: 'ChIJ_D', creadoEn: d('2026-01-08'), usuario: { id: 'dd', email: 'locald@x.com', localesExtra: 0, pagos: [] } },
      ].filter((n) => where.googlePlaceId.in.includes(n.googlePlaceId)),
    },
  };
  const R = (p) => path.resolve(__dirname, '..', p);
  require.cache[require.resolve(R('src/lib/prisma'))] = { exports: prismaFalso };
  require.cache[require.resolve(R('src/api/middlewares/auth.middleware'))] = {
    exports: { autenticar: (req, res, next) => { req.usuario = sesion; next(); } },
  };
  process.env.RUTA_COMERCIAL_ACCESO = 'dueno@x.com:dueno,promotor@usenotoria.app:Usuario1';
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/api/ruta', require('../src/api/routes/ruta.routes'));
  const srv = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api/ruta`;
  const pedir = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };

  try {
    let r = await pedir('GET', '/visitas');
    check('el promotor solo ve SUS visitas', r.s === 200 && r.j.visitas.length === 4 && r.j.visitas.every((v) => v.promotor === 'Usuario1'));
    const por = Object.fromEntries(r.j.visitas.map((v) => [v.id, v]));
    check('sin correo, se vincula por el local de Maps (S/32.50)', por.v3.vinculo === 'maps' && por.v3.comision.ganada === 3250, JSON.stringify(por.v3.comision));
    check('…y su estado pasa solo a «cliente»', por.v3.estadoAuto === 'cliente');
    check('correo inexistente pero local agregado: vínculo por Maps', por.v4.vinculo === 'maps' && por.v4.cuentaEncontrada === true && por.v4.estadoAuto === 'cuenta_gratis');
    check('local de Maps que nadie agregó: sin cuenta y se respeta el estado', por.v5.cuentaEncontrada === false && por.v5.vinculo === null && por.v5.estadoAuto === 'volver');
    check('el correo tiene prioridad sobre Maps', por.v1.vinculo === 'correo');
    check('el promotor NO ve con qué cuenta se vinculó', !('correoVinculado' in por.v3));
    check('…y la comisión sale de los pagos reales (S/77.50)', por.v1.comision.ganada === 7750, JSON.stringify(por.v1.comision));
    check('el correo del cliente se cruza sin mayúsculas', por.v1.cuentaEncontrada === true);

    check('el libro asienta lo devengado: bono + residuales de v1 y v3', por.v1.devengadoLibro === 7750 && por.v3.devengadoLibro === 3250, `${por.v1.devengadoLibro} / ${por.v3.devengadoLibro}`);
    check('saldo del promotor = lo devengado (aún no se le pagó nada)', r.j.saldos.Usuario1.saldo === 11000 && r.j.saldos.Usuario1.pagado === 0, JSON.stringify(r.j.saldos));
    check('el promotor solo recibe SU saldo', Object.keys(r.j.saldos).join() === 'Usuario1');
    const antes = asientos.length;
    await pedir('GET', '/visitas');
    check('leer otra vez NO asienta nada (la sincronización es idempotente)', asientos.length === antes, `${antes} → ${asientos.length}`);
    check('cada residual es un asiento propio, con el pago que lo origina', asientos.filter((a) => a.visitaId === 'v1' && a.concepto === 'RESIDUAL').every((a) => a.pagoId) && asientos.filter((a) => a.visitaId === 'v1' && a.concepto === 'RESIDUAL').length === 11);
    await pedir('PUT', '/visitas/v1', { nombre: 'Local A', promotor: 'dueno' });
    check('el promotor NO puede reasignar una visita a otro promotor', ultimoUpdate && ultimoUpdate.promotor === undefined);
    r = await pedir('POST', '/pagos-promotor', { promotor: 'Usuario1', monto: 100, referencia: 'op 123' });
    check('el promotor NO puede asentarse pagos (mismo 404 que una ruta inexistente)', r.s === 404);
    r = await pedir('GET', '/liquidacion?mes=2026-13');
    check('liquidación con mes inválido: 400', r.s === 400);
    const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 7);
    r = await pedir('GET', `/liquidacion?mes=${mes}`);
    check('el promotor ve su liquidación del mes, con texto para enviar', r.s === 200 && r.j.saldoFinal === 11000 && /Saldo por pagar al cierre: S\/110\.00/.test(r.j.texto), r.j.texto);
    r = await pedir('PUT', '/visitas/v2', { nombre: 'X' });
    check('el promotor no puede editar la visita de otro (404)', r.s === 404);
    r = await pedir('POST', '/visitas', { nombre: '' });
    check('sin nombre del local: 400 con el motivo', r.s === 400 && /nombre/i.test(r.j.error));
    r = await pedir('POST', '/visitas', { nombre: 'Nuevo', correo: 'MAL' });
    check('correo mal escrito: 400', r.s === 400);
    r = await pedir('POST', '/visitas', { nombre: 'Nuevo', correo: 'Cli@X.com', promotor: 'Otro' });
    check('al crear, el alias sale del acceso (no del cuerpo)', r.s === 201 && r.j.promotor === 'Usuario1' && r.j.correo === 'cli@x.com');

    sesion = { id: 'u2', email: 'dueno@x.com' };
    r = await pedir('GET', '/visitas');
    check('el dueño ve TODAS las visitas', r.s === 200 && r.j.visitas.length === visitas.length && r.j.yo.dueno === true);
    check('el dueño SÍ ve la cuenta vinculada, para revisar la liquidación', r.j.visitas.find((v) => v.id === 'v3').correoVinculado === 'localc@x.com');
    r = await pedir('POST', '/visitas', { nombre: 'Con Maps', placeId: 'ChIJ_Z', direccion: 'Av. Larco 123, Miraflores' });
    check('se guarda el local de Maps al crear', r.s === 201 && r.j.placeId === 'ChIJ_Z' && r.j.direccion === 'Av. Larco 123, Miraflores');
    // ── Libro de comisiones (2026-10-07) ──
    r = await pedir('POST', '/pagos-promotor', { promotor: 'Usuario1', monto: 20000, referencia: 'op 999' });
    check('🔴 un pago MAYOR que el saldo se rechaza (409)', r.s === 409 && r.j.codigo === 'PAGO_MAYOR_QUE_SALDO');
    r = await pedir('POST', '/pagos-promotor', { promotor: 'Usuario1', monto: 5000, referencia: 'x' });
    check('un pago sin referencia (operación o recibo) se rechaza', r.s === 400);
    r = await pedir('POST', '/pagos-promotor', { promotor: 'Fantasma', monto: 100, referencia: 'op 1' });
    check('un pago a un alias sin acceso se rechaza', r.s === 400);
    r = await pedir('POST', '/pagos-promotor', { promotor: 'Usuario1', monto: 5000, referencia: 'op 4567 · RH E001-12' });
    check('el dueño asienta un pago: asiento PAGADA negativo con su referencia', r.s === 201 && r.j.monto === -5000 && r.j.tipo === 'PAGADA' && r.j.autor === 'dueno');
    r = await pedir('POST', '/ajustes', { promotor: 'Usuario1', monto: -300, motivo: 'corto' });
    check('un ajuste sin motivo suficiente se rechaza', r.s === 400);
    r = await pedir('POST', '/ajustes', { promotor: 'Usuario1', visitaId: 'v2', monto: -300, motivo: 'Contracargo del cliente reportado por Culqi' });
    check('un ajuste sobre la visita de OTRO promotor se rechaza', r.s === 400);
    r = await pedir('POST', '/ajustes', { promotor: 'Usuario1', visitaId: 'v1', monto: -300, motivo: 'Contracargo del cliente reportado por Culqi' });
    check('el dueño asienta un ajuste con motivo', r.s === 201 && r.j.concepto === 'AJUSTE');
    r = await pedir('PUT', '/visitas/v3', { nombre: 'Local C', promotor: 'Fantasma' });
    check('reasignar a un alias desconocido: 400', r.s === 400);
    r = await pedir('PUT', '/visitas/v3', { nombre: 'Local C', placeId: 'ChIJ_C', estado: 'interesado', promotor: 'dueno' });
    check('el dueño reasigna la visita y queda en el historial', r.s === 200 && cambios.some((c) => c.visitaId === 'v3' && c.campo === 'promotor' && c.antes === 'Usuario1' && c.despues === 'dueno'));
    r = await pedir('GET', '/visitas');
    const rev = asientos.filter((a) => a.visitaId === 'v3' && a.promotor === 'Usuario1' && a.tipo === 'REVERSADA');
    check('🔴 al reasignar, el libro REVIERTE al anterior (sin borrar nada) y genera al nuevo',
      rev.length > 0 && rev.every((a) => /reasignada/i.test(a.motivo)) && asientos.filter((a) => a.visitaId === 'v3' && a.promotor === 'dueno').reduce((t, a) => t + a.monto, 0) === 3250
      && asientos.filter((a) => a.visitaId === 'v3' && a.promotor === 'Usuario1').reduce((t, a) => t + a.monto, 0) === 0);
    check('saldo de Usuario1 = 7750 devengado − 5000 pagado − 300 ajuste', r.j.saldos.Usuario1.saldo === 2450 && r.j.saldos.Usuario1.pagado === 5000, JSON.stringify(r.j.saldos.Usuario1));

    // ── Auditoría 2026-10-02: anular en vez de borrar, historial y política ──
    r = await pedir('PUT', '/visitas/v1', { nombre: 'Local A', correo: 'nuevo@x.com' });
    check('cambiar el correo de atribución deja rastro con su valor anterior',
      cambios.some((c) => c.visitaId === 'v1' && c.campo === 'correo' && c.antes === 'cli@x.com' && c.despues === 'nuevo@x.com'),
      JSON.stringify(cambios));
    check('CONTROL: cambiar solo el nombre NO genera fila de historial',
      !cambios.some((c) => c.campo === 'nombre'));
    r = await pedir('DELETE', '/visitas/v5', {});
    check('anular sin motivo: 400', r.s === 400 && /por qué/i.test(r.j.error));
    r = await pedir('POST', '/visitas/v5/anular', { motivo: 'Registrada dos veces' });
    check('anular con motivo: 200 y NO se borra la fila', r.s === 200 && borrados === 0 && visitas.find((v) => v.id === 'v5').anuladaEn);
    check('la anulación queda en el historial con su motivo',
      cambios.some((c) => c.visitaId === 'v5' && c.campo === 'anulada' && c.despues === 'Registrada dos veces'));
    r = await pedir('GET', '/visitas');
    check('una visita anulada deja de listarse', !r.j.visitas.some((v) => v.id === 'v5'));
    r = await pedir('PUT', '/visitas/v5', { nombre: 'X' });
    check('una visita anulada ya no se edita (409)', r.s === 409);
    r = await pedir('POST', '/visitas', { nombre: 'Con política' });
    check('la visita nace con la versión vigente de la política', r.j.politicaComision === POLITICA_VIGENTE);

    sesion = { id: 'u3', email: 'cliente@cualquiera.com' };
    r = await pedir('GET', '/visitas');
    check('cualquier otra cuenta recibe el MISMO 404 que una ruta inexistente', r.s === 404 && r.j.error === 'Ruta no encontrada');
    process.env.RUTA_COMERCIAL_ACCESO = '';
    sesion = { id: 'u2', email: 'dueno@x.com' };
    r = await pedir('GET', '/visitas');
    check('CONTROL: sin la variable ni el dueño entra', r.s === 404);
  } finally { srv.close(); }

  console.log('\n5. El libro solo crece');
  {
    const fs = require('fs');
    const archivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
    const sinCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const lista = [...archivos(path.join(__dirname, '..', 'src')), ...archivos(__dirname)];
    const culpables = lista.filter((a) => /movimientoComision\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/.test(sinCom(fs.readFileSync(a, 'utf8'))));
    check('🔴 ningún código edita ni borra asientos del libro (src/ y scripts/)', lista.length > 50 && culpables.length === 0, culpables.join(', '));
    const ruta = sinCom(fs.readFileSync(path.join(__dirname, '..', 'src/api/routes/ruta.routes.js'), 'utf8'));
    check('la ruta ya no escribe comisionPagada', !/comisionPagada/.test(ruta));
  }
  console.log(`\n${ok} pasaron, ${mal} fallaron`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
