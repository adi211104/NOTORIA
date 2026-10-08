// brand-shield/scripts/prueba-equipo.js
// Pruebas de compartir la cuenta (asientos, roles, alcance y permisos) con
// Prisma SIMULADO: no toca la base, no manda correos y no necesita servidor.
//
//   node scripts/prueba-equipo.js
//
// Lo que se verifica es lo que no se puede comprobar mirando la pantalla:
//
//   · que un LECTOR no pueda escribir y un GESTOR no pueda tocar la facturación
//   · que el alcance por sede filtre de verdad, incluso cuando la consulta ya
//     traía su propio `id` (el caso que un filtro mal escrito deja pasar)
//   · que bajar de plan retire asientos por antigüedad y no al azar
//   · que las invitaciones pendientes ocupen asiento
//
// ⚠️ El corte por asientos es la única defensa contra contratar Franquicia un
// mes, invitar a nueve personas y bajar a Negocio conservando los diez lugares.
// Si alguna de esas pruebas se pone en rojo, eso es lo que se rompió.

process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.DOCUMENTOS_SECRET = 'secreto-de-prueba-documentos';

const Module = require('module');

// ── Doble de Prisma ───────────────────────────────────────
// Estado que cada caso configura antes de ejecutar
let db;

const nuevoEstado = () => ({
  miembros: [],      // { id, cuentaId, usuarioId, rol, negociosIds, creadoEn }
  invitaciones: [],  // { cuentaId, email, expira }
  usuarios: {},      // id -> { plan }
  creados: [],
});

const filtra = (filas, where = {}) => filas.filter((f) => {
  if (where.cuentaId && f.cuentaId !== where.cuentaId) return false;
  if (where.usuarioId && f.usuarioId !== where.usuarioId) return false;
  if (where.rol && f.rol !== where.rol) return false;
  if (where.creadoEn?.lt && !(f.creadoEn < where.creadoEn.lt)) return false;
  if (where.expira?.gt && !(f.expira > where.expira.gt)) return false;
  return true;
});

const prismaFalso = {
  miembro: {
    findMany: async ({ where = {} } = {}) => filtra(db.miembros, where)
      .sort((a, b) => a.creadoEn - b.creadoEn)
      .map((m) => ({
        ...m,
        usuario: { id: m.usuarioId, nombre: m.usuarioId, email: `${m.usuarioId}@x.test`, idioma: 'es' },
        cuenta: { id: m.cuentaId, nombre: m.cuentaId, email: `${m.cuentaId}@x.test`, plan: (db.usuarios[m.cuentaId] || {}).plan },
      })),
    count: async ({ where = {} } = {}) => filtra(db.miembros, where).length,
    findUnique: async ({ where }) => {
      const { cuentaId, usuarioId } = where.cuentaId_usuarioId;
      const m = db.miembros.find((x) => x.cuentaId === cuentaId && x.usuarioId === usuarioId);
      if (!m) return null;
      const u = db.usuarios[cuentaId] || {};
      return { ...m, cuenta: { id: cuentaId, nombre: cuentaId, email: `${cuentaId}@x.test`, plan: u.plan, suscripcionActiva: true } };
    },
  },
  invitacion: { count: async ({ where = {} } = {}) => filtra(db.invitaciones, where).length },
  usuario: { findUnique: async ({ where }) => db.usuarios[where.id] || null },
  registroActividad: { create: async ({ data }) => { db.creados.push(data); return data; } },
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id.endsWith('/prisma')) return prismaFalso;
  return requireOriginal.apply(this, arguments);
};

const equipo = require('../src/lib/equipo');
const { puede, dondeNegocio, alcanza, asientosDelPlan } = equipo;

Module.prototype.require = requireOriginal;

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const contieneAlcance = (where, ids) =>
  Array.isArray(where.AND) && where.AND.some((c) =>
    JSON.stringify(c) === JSON.stringify({ id: { in: ids } }));

const correr = async () => {
  // ── 1. Permisos por rol ─────────────────────────────────
  bloque('1. Matriz de permisos');
  check('el propietario puede facturar', puede('PROPIETARIO', 'facturacion'));
  check('el propietario puede gestionar el equipo', puede('PROPIETARIO', 'equipo'));
  check('el gestor puede actuar (responder, IA, escanear)', puede('GESTOR', 'actuar'));
  check('el gestor NO puede facturar', !puede('GESTOR', 'facturacion'));
  check('el gestor NO puede conectar redes', !puede('GESTOR', 'conexiones'));
  check('el gestor NO puede crear ni borrar negocios', !puede('GESTOR', 'negocios'));
  check('el gestor NO puede invitar', !puede('GESTOR', 'equipo'));
  check('el lector puede ver', puede('LECTOR', 'ver'));
  check('el lector NO puede actuar', !puede('LECTOR', 'actuar'));
  check('un rol inventado no puede nada', !puede('ADMIN', 'ver'));

  // ── 2. Asientos por plan ────────────────────────────────
  bloque('2. Asientos por plan (cuentan al dueño)');
  check('Gratis = 1 (no comparte)', asientosDelPlan('GRATIS') === 1);
  check('Negocio = 3 (dueño + 2)', asientosDelPlan('NEGOCIO') === 3);
  check('Franquicia = 10 (dueño + 9)', asientosDelPlan('FRANQUICIA') === 10);
  check('un plan desconocido cae en el más restrictivo', asientosDelPlan('LO_QUE_SEA') === 1);

  // ── 3. Alcance sobre los negocios ───────────────────────
  bloque('3. Alcance: el filtro que un miembro no puede saltarse');
  const dueno = { cuenta: { id: 'cta1' }, alcance: null };
  const parcial = { cuenta: { id: 'cta1' }, alcance: ['n1', 'n2'] };

  check('sin alcance, el where es solo la cuenta',
    JSON.stringify(dondeNegocio(dueno)) === JSON.stringify({ usuarioId: 'cta1' }));
  check('con alcance, se añade el IN de sus negocios',
    contieneAlcance(dondeNegocio(parcial), ['n1', 'n2']));

  // 🔴 El caso que un filtro mal escrito deja pasar: la consulta ya trae `id`.
  // Si el alcance se aplicara escribiendo `where.id`, pisaría el id pedido y
  // devolvería el negocio ajeno igualmente.
  const conId = dondeNegocio(parcial, { id: 'n9' });
  check('un id concreto NO pisa el alcance (sigue el AND)',
    conId.id === 'n9' && contieneAlcance(conId, ['n1', 'n2']),
    JSON.stringify(conId));
  check('el extra (activo:true) se conserva',
    dondeNegocio(parcial, { activo: true }).activo === true);

  check('alcanza() acepta un negocio del alcance', alcanza(parcial, 'n1'));
  check('alcanza() rechaza uno fuera del alcance', !alcanza(parcial, 'n9'));
  check('alcanza() deja pasar todo si no hay alcance', alcanza(dueno, 'lo-que-sea'));

  // ── 4. Bajar de plan retira asientos ────────────────────
  bloque('4. Bajar de plan: quién conserva el asiento');
  db = nuevoEstado();
  db.usuarios.cta1 = { plan: 'FRANQUICIA' };
  for (let i = 1; i <= 5; i++) {
    db.miembros.push({ id: `m${i}`, cuentaId: 'cta1', usuarioId: `u${i}`, rol: 'GESTOR', negociosIds: [], creadoEn: new Date(2026, 0, i) });
  }

  let lista = await equipo.equipoDeCuenta('cta1', 'FRANQUICIA');
  check('en Franquicia los 5 tienen asiento', lista.every((m) => !m.sinAsiento));

  lista = await equipo.equipoDeCuenta('cta1', 'NEGOCIO');
  check('en Negocio solo los 2 más antiguos conservan asiento',
    lista.filter((m) => !m.sinAsiento).map((m) => m.usuarioId).join(',') === 'u1,u2',
    lista.map((m) => `${m.usuarioId}:${m.sinAsiento ? 'no' : 'sí'}`).join(' '));

  lista = await equipo.equipoDeCuenta('cta1', 'GRATIS');
  check('en Gratis nadie más que el dueño', lista.every((m) => m.sinAsiento));

  // Y el corte tiene que aplicarse también AL ENTRAR, no solo al pintar la lista
  db.usuarios.cta1 = { plan: 'NEGOCIO' };
  const u1 = { id: 'u1', nombre: 'U1', email: 'u1@x.test', plan: 'GRATIS', suscripcionActiva: false };
  const u5 = { id: 'u5', nombre: 'U5', email: 'u5@x.test', plan: 'GRATIS', suscripcionActiva: false };

  const acceso1 = await equipo.resolverAcceso(u1, 'cta1');
  check('el miembro más antiguo entra tras la bajada de plan', acceso1.rol === 'GESTOR');
  check('y hereda el plan de la CUENTA, no el suyo', acceso1.cuenta.plan === 'NEGOCIO');

  let rebotado = null;
  try { await equipo.resolverAcceso(u5, 'cta1'); } catch (e) { rebotado = e; }
  check('el que se quedó sin asiento recibe 403 SIN_ASIENTO',
    rebotado?.status === 403 && rebotado?.tipo === 'SIN_ASIENTO', rebotado?.tipo);

  // ── 5. Acceso a cuentas ajenas ──────────────────────────
  bloque('5. Puertas cerradas');
  let ajeno = null;
  try { await equipo.resolverAcceso({ id: 'intruso', nombre: 'X', email: 'x@x.test', plan: 'GRATIS' }, 'cta1'); }
  catch (e) { ajeno = e; }
  check('quien no es miembro recibe 403 SIN_ACCESO_CUENTA',
    ajeno?.status === 403 && ajeno?.tipo === 'SIN_ACCESO_CUENTA', ajeno?.tipo);

  const propio = await equipo.resolverAcceso(u1, '');
  check('sin cabecera se trabaja en la cuenta propia como PROPIETARIO',
    propio.rol === 'PROPIETARIO' && propio.cuenta.id === 'u1' && propio.cuenta.propia === true);
  check('en la cuenta propia no hay alcance restringido', propio.alcance === null);

  const propioExplicito = await equipo.resolverAcceso(u1, 'u1');
  check('pedir la cuenta propia por cabecera da lo mismo', propioExplicito.rol === 'PROPIETARIO');

  // ── 6. Alcance vacío = todos ────────────────────────────
  bloque('6. Alcance vacío no es "ningún negocio"');
  db = nuevoEstado();
  db.usuarios.cta2 = { plan: 'FRANQUICIA' };
  db.miembros.push({ id: 'ma', cuentaId: 'cta2', usuarioId: 'ua', rol: 'LECTOR', negociosIds: [], creadoEn: new Date(2026, 0, 1) });
  db.miembros.push({ id: 'mb', cuentaId: 'cta2', usuarioId: 'ub', rol: 'GESTOR', negociosIds: ['n7'], creadoEn: new Date(2026, 0, 2) });

  const a = await equipo.resolverAcceso({ id: 'ua', nombre: 'A', email: 'a@x.test', plan: 'GRATIS' }, 'cta2');
  check('lista vacía se normaliza a null (ve todos)', a.alcance === null);
  const b = await equipo.resolverAcceso({ id: 'ub', nombre: 'B', email: 'b@x.test', plan: 'GRATIS' }, 'cta2');
  check('lista con ids se conserva', JSON.stringify(b.alcance) === JSON.stringify(['n7']));

  // ── 7. Conteo de asientos ───────────────────────────────
  bloque('7. Conteo de asientos');
  db = nuevoEstado();
  db.usuarios.cta3 = { plan: 'NEGOCIO' };
  db.miembros.push({ id: 'm1', cuentaId: 'cta3', usuarioId: 'x1', rol: 'GESTOR', negociosIds: [], creadoEn: new Date() });

  let cuenta = await equipo.contarAsientos('cta3', 'NEGOCIO');
  check('dueño + 1 miembro = 2 de 3 usados', cuenta.usados === 2 && cuenta.total === 3);
  check('queda 1 libre', cuenta.libres === 1);

  // La invitación pendiente ocupa: si no contara, se podrían mandar veinte y el
  // límite lo descubriría el invitado al aceptar.
  db.invitaciones.push({ cuentaId: 'cta3', email: 'z@x.test', expira: new Date(Date.now() + 86400000) });
  cuenta = await equipo.contarAsientos('cta3', 'NEGOCIO');
  check('una invitación pendiente ocupa asiento', cuenta.usados === 3 && cuenta.libres === 0);

  // Una vencida ya no bloquea a nadie
  db.invitaciones.push({ cuentaId: 'cta3', email: 'v@x.test', expira: new Date(Date.now() - 86400000) });
  cuenta = await equipo.contarAsientos('cta3', 'NEGOCIO');
  check('una invitación vencida NO ocupa asiento', cuenta.usados === 3);

  cuenta = await equipo.contarAsientos('cta3', 'GRATIS');
  check('en Gratis no hay lugares libres para invitar', cuenta.total === 1 && cuenta.libres === 0);

  // ── 8. Copias de alerta al equipo ───────────────────────
  bloque('8. A quién le llega la alerta');
  db = nuevoEstado();
  db.usuarios.cta4 = { plan: 'FRANQUICIA' };
  // El LECTOR entra primero a propósito: ocupa asiento aunque no reciba correos,
  // así que al bajar de plan el que se queda fuera es el último gestor. Es el
  // caso que delata un corte de asientos calculado solo entre gestores.
  db.miembros.push({ id: 'l1', cuentaId: 'cta4', usuarioId: 'lector', rol: 'LECTOR', negociosIds: [], creadoEn: new Date(2026, 0, 1) });
  db.miembros.push({ id: 'g1', cuentaId: 'cta4', usuarioId: 'gestor-todo', rol: 'GESTOR', negociosIds: [], creadoEn: new Date(2026, 0, 2) });
  db.miembros.push({ id: 'g2', cuentaId: 'cta4', usuarioId: 'gestor-sede', rol: 'GESTOR', negociosIds: ['sede-a'], creadoEn: new Date(2026, 0, 3) });

  const copiasA = (await equipo.copiasDeAlerta({ id: 'sede-a', usuarioId: 'cta4' })).map((u) => u.id);
  check('el gestor sin restricción recibe copia', copiasA.includes('gestor-todo'));
  check('el gestor de esa sede recibe copia', copiasA.includes('gestor-sede'));
  check('el lector NO recibe copia', !copiasA.includes('lector'));

  const copiasB = (await equipo.copiasDeAlerta({ id: 'sede-b', usuarioId: 'cta4' })).map((u) => u.id);
  check('el gestor de otra sede NO recibe copia de esta', !copiasB.includes('gestor-sede'));
  check('el gestor sin restricción sí la recibe', copiasB.includes('gestor-todo'));

  // Y quien perdió el asiento por bajada de plan tampoco recibe correos: si no,
  // seguiría enterándose de un negocio al que ya no puede entrar.
  db.usuarios.cta4 = { plan: 'NEGOCIO' };
  const copiasC = (await equipo.copiasDeAlerta({ id: 'sede-a', usuarioId: 'cta4' })).map((u) => u.id);
  check('el gestor que perdió el asiento deja de recibir copias',
    copiasC.length === 1 && copiasC[0] === 'gestor-todo', copiasC.join(','));

  // ── 9. Selector de cuentas ──────────────────────────────
  bloque('9. Selector de cuentas');
  db = nuevoEstado();
  db.usuarios.jefa = { plan: 'FRANQUICIA' };
  db.miembros.push({ id: 'mm', cuentaId: 'jefa', usuarioId: 'yo', rol: 'GESTOR', negociosIds: ['n1'], creadoEn: new Date(2026, 0, 1) });

  const lista2 = await equipo.cuentasDe({ id: 'yo', nombre: 'Yo', email: 'yo@x.test', plan: 'GRATIS' });
  check('siempre aparece la cuenta propia primero', lista2[0].propia === true && lista2[0].id === 'yo');
  check('y la cuenta ajena a la que fue invitado', lista2.some((c) => c.id === 'jefa' && c.rol === 'GESTOR'));
  check('marcada como alcance parcial', lista2.find((c) => c.id === 'jefa').alcanceParcial === true);

  db.usuarios.jefa = { plan: 'GRATIS' };
  const lista3 = await equipo.cuentasDe({ id: 'yo', nombre: 'Yo', email: 'yo@x.test', plan: 'GRATIS' });
  check('una cuenta sin asiento no se ofrece en el selector', lista3.length === 1);

  // ── Resultado ───────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  process.exit(fallidas === 0 ? 0 : 1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
