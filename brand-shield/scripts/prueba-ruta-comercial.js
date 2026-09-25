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

const { accesoDe, tablaAcceso, comisionDeVisita } = require('../src/lib/rutaComercial');

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

console.log('\n4. La ruta de verdad, con Prisma y la sesión simulados');
(async () => {
  let sesion = { id: 'u1', email: 'promotor@usenotoria.app' };
  const visitas = [
    { id: 'v1', promotor: 'Usuario1', nombre: 'Local A', correo: 'cli@x.com', comisionPagada: 0, fechaVisita: d(visita), actualizadoEn: new Date() },
    { id: 'v2', promotor: 'Otro', nombre: 'Local B', correo: null, comisionPagada: 0, fechaVisita: d(visita), actualizadoEn: new Date() },
  ];
  let ultimoUpdate = null;
  const prismaFalso = {
    visitaComercial: {
      findMany: async ({ where }) => visitas.filter((v) => !where.promotor || v.promotor === where.promotor),
      findFirst: async ({ where }) => visitas.find((v) => v.id === where.id && (!where.promotor || v.promotor === where.promotor)) || null,
      create: async ({ data }) => ({ id: 'nuevo', ...data }),
      update: async ({ data }) => { ultimoUpdate = data; return data; },
      delete: async () => ({}),
    },
    usuario: { findMany: async () => [{ id: 'c', email: 'CLI@x.com', localesExtra: 0, pagos: doce }] },
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
    check('el promotor solo ve SUS visitas', r.s === 200 && r.j.visitas.length === 1 && r.j.visitas[0].id === 'v1');
    check('…y la comisión sale de los pagos reales (S/77.50)', r.j.visitas[0].comision.ganada === 7750, JSON.stringify(r.j.visitas[0].comision));
    check('el correo del cliente se cruza sin mayúsculas', r.j.visitas[0].cuentaEncontrada === true);

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
    check('el dueño ve TODAS las visitas', r.s === 200 && r.j.visitas.length === 2 && r.j.yo.dueno === true);
    await pedir('PUT', '/visitas/v1', { nombre: 'Local A', comisionPagada: 2500 });
    check('el dueño SÍ registra la comisión pagada', ultimoUpdate.comisionPagada === 2500);

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
