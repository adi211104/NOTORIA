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
const pago = (fecha, monto, extra = {}) => ({ creadoEn: d(fecha), monto, estado: 'EXITOSO', tipo: 'RENOVACION', plan: 'NEGOCIO', periodo: 'mensual', ...extra });
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
  const prismaFalso = {
    $transaction: async (fn) => fn(prismaFalso),
    cambioVisita: {
      createMany: async ({ data }) => { cambios.push(...data); return { count: data.length }; },
      create: async ({ data }) => { cambios.push(data); return data; },
      findMany: async ({ where }) => cambios.filter((c) => c.visitaId === where.visitaId),
    },
    visitaComercial: {
      findMany: async ({ where }) => visitas.filter((v) => (!where.promotor || v.promotor === where.promotor)
        && (!('anuladaEn' in where) || !v.anuladaEn)),
      findFirst: async ({ where }) => visitas.find((v) => v.id === where.id && (!where.promotor || v.promotor === where.promotor)) || null,
      create: async ({ data }) => ({ id: 'nuevo', ...data }),
      update: async ({ where, data }) => {
        ultimoUpdate = data;
        const v = visitas.find((x) => x.id === where.id);
        if (v && data.anuladaEn) Object.assign(v, data);
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

    await pedir('PUT', '/visitas/v1', { nombre: 'Local A', comisionPagada: 999999 });
    check('el promotor NO puede escribir la comisión pagada', ultimoUpdate && ultimoUpdate.comisionPagada === undefined);
    r = await pedir('PUT', '/visitas/v2', { nombre: 'X' });
    check('el promotor no puede editar la visita de otro (404)', r.s === 404);
    r = await pedir('POST', '/visitas', { nombre: '' });
    check('sin nombre del local: 400 con el motivo', r.s === 400 && /nombre/i.test(r.j.error));
    r = await pedir('POST', '/visitas', { nombre: 'Nuevo', correo: 'MAL' });
    check('correo mal escrito: 400', r.s === 400);
    r = await pedir('POST', '/visitas', { nombre: 'Nuevo', correo: 'Cli@X.com', comisionPagada: 5000 });
    check('al crear, el alias sale del acceso y la comisión pagada no se acepta', r.s === 201 && r.j.promotor === 'Usuario1' && r.j.comisionPagada === undefined && r.j.correo === 'cli@x.com');

    sesion = { id: 'u2', email: 'dueno@x.com' };
    r = await pedir('GET', '/visitas');
    check('el dueño ve TODAS las visitas', r.s === 200 && r.j.visitas.length === visitas.length && r.j.yo.dueno === true);
    check('el dueño SÍ ve la cuenta vinculada, para revisar la liquidación', r.j.visitas.find((v) => v.id === 'v3').correoVinculado === 'localc@x.com');
    r = await pedir('POST', '/visitas', { nombre: 'Con Maps', placeId: 'ChIJ_Z', direccion: 'Av. Larco 123, Miraflores' });
    check('se guarda el local de Maps al crear', r.s === 201 && r.j.placeId === 'ChIJ_Z' && r.j.direccion === 'Av. Larco 123, Miraflores');
    await pedir('PUT', '/visitas/v1', { nombre: 'Local A', comisionPagada: 2500 });
    check('el dueño SÍ registra la comisión pagada', ultimoUpdate.comisionPagada === 2500);

    // ── Auditoría 2026-10-02: anular en vez de borrar, historial y política ──
    check('el dueño cambia el correo y queda en el historial (antes → después)',
      cambios.some((c) => c.visitaId === 'v1' && c.campo === 'comisionPagada' && c.despues === '2500'));
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

  console.log(`\n${ok} pasaron, ${mal} fallaron`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
