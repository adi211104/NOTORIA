// brand-shield/src/lib/equipo.js
// Compartir la cuenta de una empresa: asientos, roles, alcance y permisos.
//
// Fuente única. Lo importan el middleware, las rutas, el notificador y el script
// de pruebas. Los números y la matriz de permisos NO se copian a ningún otro
// archivo: el precedente está en lib/precios.js, cuya copia duplicada llegó a
// cobrar el precio equivocado durante meses.
//
// ── El modelo mental, que es lo que hay que tener claro antes de tocar esto ──
//
//   Usuario  = la PERSONA que inició sesión.
//   Cuenta   = la EMPRESA en la que está trabajando ahora mismo.
//
// Casi siempre coinciden (trabajas en tu propia cuenta). Cuando no coinciden es
// porque alguien te invitó, y entonces req.cuenta.id apunta al dueño. Toda la
// propiedad sigue colgando de Negocio.usuarioId, así que las consultas del panel
// no cambian de forma: cambian de sujeto.

const prisma = require('./prisma');

// ─── Asientos por plan ────────────────────────────────────
//
// CUENTAN AL DUEÑO. "3 asientos" = el dueño y dos personas más, no el dueño y
// tres. Es como lo entiende cualquiera al leer "incluye 3 personas", y contarlo
// al revés haría que el panel dijera un número y la página de precios otro.
const ASIENTOS = {
  GRATIS: 1,
  NEGOCIO: 3,
  FRANQUICIA: 10,
};

const asientosDelPlan = (plan) => ASIENTOS[plan] ?? ASIENTOS.GRATIS;

// ─── Roles y permisos ─────────────────────────────────────
//
// Seis permisos, no una matriz por endpoint. Es lo que se le puede explicar a un
// dueño de restaurante en una frase, y lo que hace que añadir una ruta nueva sea
// elegir uno de seis en vez de inventar el séptimo.
//
//   ver          leer lo que su acceso alcance (reseñas, alertas, reportes)
//   actuar       el trabajo del día: responder, IA, escanear, marcar leído,
//                moderar comentarios, competidores, ajustes del negocio
//   negocios     crear y eliminar negocios
//   conexiones   conectar y desconectar Google Business, TikTok, Instagram
//   facturacion  pagar, cambiar de plan, datos fiscales, cancelar
//   equipo       invitar, cambiar roles, quitar personas
//
// ⚠️ `conexiones` está separado de `actuar` aunque parezca del día a día: quien
// conecta una red autoriza un token que opera esa cuenta DESDE FUERA de Notoria,
// y quien la desconecta se la puede quitar al negocio entero. Eso es del dueño.
const PERMISOS = {
  PROPIETARIO: ['ver', 'actuar', 'negocios', 'conexiones', 'facturacion', 'equipo'],
  GESTOR:      ['ver', 'actuar'],
  LECTOR:      ['ver'],
};

const ROLES_INVITABLES = ['GESTOR', 'LECTOR'];

const puede = (rol, permiso) => (PERMISOS[rol] || []).includes(permiso);

const permisosDe = (rol) => PERMISOS[rol] || [];

// Texto que ve el usuario cuando le falta el permiso. Vive aquí y no en cada
// ruta para que el mensaje no dependa de por dónde entró.
const MOTIVO = {
  actuar:      'Tu rol es Solo lectura: puedes ver todo, pero no responder ni modificar.',
  negocios:    'Solo el propietario de la cuenta puede agregar o eliminar negocios.',
  conexiones:  'Solo el propietario de la cuenta puede conectar o desconectar redes.',
  facturacion: 'Solo el propietario de la cuenta puede ver y gestionar los pagos.',
  equipo:      'Solo el propietario de la cuenta puede gestionar el equipo.',
};

// ─── Alcance sobre los negocios ───────────────────────────

/**
 * Construye el `where` de Negocio para la cuenta activa y el alcance del
 * miembro. Es el reemplazo de `{ usuarioId: req.usuario.id }`, que estaba
 * repetido en unas 40 consultas.
 *
 * ⚠️ El alcance se aplica con AND y no escribiendo `id`, porque muchas de esas
 * consultas ya traen su propio id (`{ id: req.params.id, usuarioId }`) y
 * pisarlo dejaría pasar negocios fuera del alcance.
 */
const dondeNegocio = (req, extra = {}) => {
  const where = { ...extra, usuarioId: req.cuenta.id };
  if (req.alcance) {
    const previos = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [...previos, { id: { in: req.alcance } }];
  }
  return where;
};

/** ¿Este miembro alcanza este negocio concreto? Para comprobaciones sueltas. */
const alcanza = (req, negocioId) => !req.alcance || req.alcance.includes(negocioId);

// ─── Quién tiene acceso de verdad ─────────────────────────

/**
 * Devuelve el equipo de una cuenta marcando quién quedó SIN acceso por no caber
 * en los asientos del plan.
 *
 * ⚠️ Esto existe por la bajada de plan. Una cuenta Franquicia con 9 miembros que
 * pasa a Negocio (3 asientos) tiene 7 personas de más. No se les borra la
 * membresía —sería destruir datos por un cambio de plan, y basta con volver a
 * subir para recuperarlos— pero tampoco pueden seguir entrando: si no, bastaría
 * contratar Franquicia un mes, invitar a nueve y bajar a Negocio para quedarse
 * con diez asientos por S/59 para siempre.
 *
 * El corte es por antigüedad (los más antiguos conservan el acceso) para que sea
 * determinista. Si dependiera del orden de la consulta, dos personas podrían
 * turnarse el acceso entre recargas sin que nadie entienda por qué.
 */
const equipoDeCuenta = async (cuentaId, plan) => {
  const miembros = await prisma.miembro.findMany({
    where: { cuentaId },
    orderBy: { creadoEn: 'asc' },
    include: { usuario: { select: { id: true, nombre: true, email: true } } },
  });
  const conAcceso = asientosDelPlan(plan) - 1; // el dueño ocupa uno
  return miembros.map((m, i) => ({ ...m, sinAsiento: i >= conAcceso }));
};

/**
 * Asientos usados: el dueño + los miembros + las invitaciones aún sin aceptar.
 *
 * Las pendientes cuentan a propósito. Si no contaran, se podrían mandar veinte
 * invitaciones de golpe y el límite lo descubriría el invitado al aceptar, que
 * es el peor momento posible para enterarse.
 */
const contarAsientos = async (cuentaId, plan) => {
  const [miembros, invitaciones] = await Promise.all([
    prisma.miembro.count({ where: { cuentaId } }),
    prisma.invitacion.count({ where: { cuentaId, expira: { gt: new Date() } } }),
  ]);
  const total = asientosDelPlan(plan);
  return {
    total,
    usados: 1 + miembros + invitaciones,
    miembros,
    invitaciones,
    libres: Math.max(0, total - 1 - miembros - invitaciones),
  };
};

/**
 * Resuelve en qué cuenta está trabajando esta persona y con qué rol.
 * Lo llama el middleware de autenticación; devuelve siempre algo o lanza.
 */
const resolverAcceso = async (usuario, cuentaPedida) => {
  // Caso normal, y el 99% de las peticiones: su propia cuenta. Cero consultas
  // extra — por eso el header es opcional y no un parámetro obligatorio.
  if (!cuentaPedida || cuentaPedida === usuario.id) {
    return {
      cuenta: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        plan: usuario.plan,
        suscripcionActiva: usuario.suscripcionActiva,
        propia: true,
      },
      rol: 'PROPIETARIO',
      alcance: null,
    };
  }

  const miembro = await prisma.miembro.findUnique({
    where: { cuentaId_usuarioId: { cuentaId: cuentaPedida, usuarioId: usuario.id } },
    include: {
      cuenta: { select: { id: true, nombre: true, email: true, plan: true, suscripcionActiva: true } },
    },
  });

  if (!miembro) {
    const e = new Error('No tienes acceso a esa cuenta');
    e.status = 403;
    e.tipo = 'SIN_ACCESO_CUENTA';
    throw e;
  }

  // Corte por asientos (ver equipoDeCuenta). Se cuenta cuántos miembros entraron
  // antes que este: si su posición se pasa de los asientos del plan, no entra.
  const anteriores = await prisma.miembro.count({
    where: { cuentaId: cuentaPedida, creadoEn: { lt: miembro.creadoEn } },
  });
  if (anteriores >= asientosDelPlan(miembro.cuenta.plan) - 1) {
    const e = new Error(
      `El plan de ${miembro.cuenta.nombre} ya no incluye tu asiento. ` +
      'Pídele que amplíe el plan o que libere un lugar.'
    );
    e.status = 403;
    e.tipo = 'SIN_ASIENTO';
    throw e;
  }

  return {
    cuenta: { ...miembro.cuenta, propia: false },
    rol: miembro.rol,
    // Lista vacía = sin restricción. Se normaliza a null para que el resto del
    // código no tenga que distinguir "[]" de "todos" — exactamente el tipo de
    // duda que acaba en un IN vacío que no devuelve nada.
    alcance: miembro.negociosIds.length > 0 ? miembro.negociosIds : null,
  };
};

/** Las cuentas en las que esta persona puede trabajar (para el selector). */
const cuentasDe = async (usuario) => {
  const membresias = await prisma.miembro.findMany({
    where: { usuarioId: usuario.id },
    orderBy: { creadoEn: 'asc' },
    include: { cuenta: { select: { id: true, nombre: true, email: true, plan: true } } },
  });

  const lista = [{
    id: usuario.id,
    nombre: usuario.nombre,
    plan: usuario.plan,
    rol: 'PROPIETARIO',
    propia: true,
  }];

  // Se recalcula el corte de asientos por cuenta para no ofrecer en el selector
  // una cuenta en la que se va a entrar y rebotar con 403.
  for (const m of membresias) {
    const anteriores = await prisma.miembro.count({
      where: { cuentaId: m.cuentaId, creadoEn: { lt: m.creadoEn } },
    });
    if (anteriores >= asientosDelPlan(m.cuenta.plan) - 1) continue;
    lista.push({
      id: m.cuenta.id,
      nombre: m.cuenta.nombre,
      plan: m.cuenta.plan,
      rol: m.rol,
      propia: false,
      alcanceParcial: m.negociosIds.length > 0,
    });
  }

  return lista;
};

// ─── Registro de actividad ────────────────────────────────

/**
 * Deja constancia de una acción que cambia algo.
 *
 * No lanza nunca: un fallo del registro no puede tumbar la acción que lo generó.
 * El usuario ya respondió la reseña, y perder una línea de auditoría es mucho
 * menos grave que devolverle un 500 por algo que sí funcionó.
 */
const registrar = async (req, accion, { negocioId = null, detalle = null } = {}) => {
  try {
    await prisma.registroActividad.create({
      data: {
        cuentaId: req.cuenta.id,
        usuarioId: req.usuario.id,
        autorNombre: req.usuario.nombre || req.usuario.email,
        accion,
        negocioId,
        detalle,
      },
    });
  } catch (e) {
    console.error(`[Equipo] No se pudo registrar "${accion}": ${e.message}`);
  }
};

// ─── Destinatarios de las alertas ─────────────────────────

/**
 * A quién le llega el correo de una alerta de este negocio, además del dueño:
 * los GESTORES que alcanzan ese negocio.
 *
 * Los LECTORES no reciben nada. Su rol es consultar, y llenarles la bandeja de
 * avisos sobre los que no pueden actuar es la vía más rápida a que los filtren.
 *
 * ⚠️ Los miembros reciben las alertas que pasan el filtro de preferencias DEL
 * DUEÑO (ver alerts/notificador.js). Es deliberado: las preferencias son de la
 * cuenta, no de la persona, y darle a cada miembro las suyas haría que el dueño
 * dejara de saber qué se está avisando en su nombre.
 */
const copiasDeAlerta = async (negocio) => {
  try {
    // ⚠️ Se piden TODOS los miembros, no solo los gestores, y el filtro por rol
    // va DESPUÉS del corte de asientos. Los asientos se ocupan por orden de
    // entrada sin mirar el rol: si un lector entró primero, ocupa un lugar y
    // desplaza al último gestor. Filtrar antes de cortar le mandaría correos a
    // alguien que ya no puede entrar al panel — y que además no debería seguir
    // recibiendo datos de una cuenta a la que perdió el acceso.
    const miembros = await prisma.miembro.findMany({
      where: { cuentaId: negocio.usuarioId },
      orderBy: { creadoEn: 'asc' },
      include: { usuario: { select: { id: true, nombre: true, email: true, idioma: true } } },
    });
    if (miembros.length === 0) return [];

    const cuenta = await prisma.usuario.findUnique({
      where: { id: negocio.usuarioId },
      select: { plan: true },
    });
    const conAsiento = miembros.slice(0, Math.max(0, asientosDelPlan(cuenta?.plan) - 1));

    return conAsiento
      .filter((m) => m.rol === 'GESTOR')
      .filter((m) => m.negociosIds.length === 0 || m.negociosIds.includes(negocio.id))
      .map((m) => m.usuario);
  } catch (e) {
    console.error(`[Equipo] No se pudieron resolver las copias de alerta: ${e.message}`);
    return [];
  }
};

module.exports = {
  ASIENTOS,
  PERMISOS,
  ROLES_INVITABLES,
  MOTIVO,
  asientosDelPlan,
  puede,
  permisosDe,
  dondeNegocio,
  alcanza,
  equipoDeCuenta,
  contarAsientos,
  resolverAcceso,
  cuentasDe,
  registrar,
  copiasDeAlerta,
};
