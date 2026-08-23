// brand-shield/src/api/routes/equipo.routes.js
// Compartir la cuenta de una empresa: invitar, aceptar, roles y alcance.
//
// La lógica de asientos, permisos y alcance NO vive aquí: está en lib/equipo.js,
// que es la fuente única que comparten el middleware, el notificador y las
// pruebas. Aquí solo está el circuito HTTP.

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { autenticar, permitir } = require('../middlewares/auth.middleware');
const {
  ROLES_INVITABLES, asientosDelPlan, equipoDeCuenta, contarAsientos, cuentasDe, registrar,
} = require('../../lib/equipo');
const {
  enviarInvitacionEquipo, enviarAvisoNuevoMiembro, enviarSalidaEquipo,
} = require('../../utils/emails');

const router = express.Router();

// La invitación vence en 7 días. No es un número al azar: es más de lo que tarda
// alguien en volver de un fin de semana largo, y bastante menos de lo que tarda
// en olvidarse de para qué era el correo.
const DIAS_VIGENCIA = 7;

const hashear = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Mismo criterio que auth.routes.js: en Postgres el índice único distingue
// mayúsculas, así que una invitación a "Juan@x.com" no casaría nunca con la
// cuenta "juan@x.com" y sería imposible de aceptar.
const emailNormalizado = z.string().trim().toLowerCase().pipe(z.string().email('Correo inválido'));

const schemaInvitar = z.object({
  email: emailNormalizado,
  rol: z.enum(['GESTOR', 'LECTOR']),
  negociosIds: z.array(z.string()).max(50).optional().default([]),
});

const nombreRol = (rol) =>
  rol === 'PROPIETARIO' ? 'Propietario' : rol === 'GESTOR' ? 'Gestor' : 'Solo lectura';

// ─────────────────────────────────────────────────────────────────────────────
// PÚBLICO — ver de qué va una invitación
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ Va ANTES de `router.use(autenticar)` a propósito: el invitado normalmente
// todavía NO tiene cuenta, y la página tiene que poder decirle de quién es la
// invitación antes de mandarlo a registrarse. Sin esto, el enlace llevaría a un
// login pelado y nadie se registra "porque sí".
//
// No expone nada sensible: el nombre de la empresa, el rol y a qué correo va —
// datos que quien tiene el token ya recibió por correo.
router.get('/invitacion/:token', async (req, res, next) => {
  try {
    const inv = await prisma.invitacion.findUnique({
      where: { tokenHash: hashear(req.params.token) },
      include: { cuenta: { select: { nombre: true } } },
    });

    // Mismo cuerpo para "no existe" y "ya se usó": el token es la única prueba,
    // y distinguirlos permitiría sondear qué invitaciones existieron.
    if (!inv) return res.status(404).json({ error: 'Esta invitación no existe o ya se usó', tipo: 'INVITACION_INVALIDA' });
    if (inv.expira < new Date()) {
      return res.status(410).json({
        error: 'Esta invitación venció. Pídele al propietario que te la vuelva a enviar.',
        tipo: 'INVITACION_VENCIDA',
      });
    }

    const negocios = inv.negociosIds.length
      ? await prisma.negocio.findMany({ where: { id: { in: inv.negociosIds } }, select: { nombre: true } })
      : [];

    res.json({
      cuenta: inv.cuenta.nombre,
      email: inv.email,
      rol: inv.rol,
      rolNombre: nombreRol(inv.rol),
      negocios: negocios.map((n) => n.nombre),
      expira: inv.expira,
    });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Desde aquí, con sesión
// ─────────────────────────────────────────────────────────────────────────────
router.use(autenticar);

// ── POST /api/equipo/invitacion/:token/aceptar ────────────
router.post('/invitacion/:token/aceptar', async (req, res, next) => {
  try {
    const inv = await prisma.invitacion.findUnique({
      where: { tokenHash: hashear(req.params.token) },
      include: { cuenta: { select: { id: true, nombre: true, email: true, plan: true, idioma: true } } },
    });
    if (!inv) return res.status(404).json({ error: 'Esta invitación no existe o ya se usó', tipo: 'INVITACION_INVALIDA' });
    if (inv.expira < new Date()) {
      return res.status(410).json({ error: 'Esta invitación venció', tipo: 'INVITACION_VENCIDA' });
    }

    // 🔴 El correo de la sesión tiene que ser el invitado.
    //
    // Sin esto, reenviar el correo a un tercero le regalaría acceso a la cuenta:
    // el token viaja por un canal que el dueño no controla. Es también lo que
    // hace que el registro previo sirva de verificación — quien acepta demostró
    // que puede leer ese buzón.
    if (req.usuario.email.toLowerCase() !== inv.email) {
      return res.status(403).json({
        error: `Esta invitación es para ${inv.email}. Entra con esa cuenta para aceptarla.`,
        tipo: 'CORREO_DISTINTO',
        emailInvitado: inv.email,
      });
    }

    // Invitarse a uno mismo no tiene sentido y rompería el modelo: el
    // propietario no es una fila de Miembro (ver el comentario del schema).
    if (inv.cuentaId === req.usuario.id) {
      await prisma.invitacion.delete({ where: { id: inv.id } });
      return res.status(400).json({ error: 'Esa cuenta ya es tuya' });
    }

    const yaEsta = await prisma.miembro.findUnique({
      where: { cuentaId_usuarioId: { cuentaId: inv.cuentaId, usuarioId: req.usuario.id } },
    });
    if (yaEsta) {
      await prisma.invitacion.delete({ where: { id: inv.id } });
      return res.json({ mensaje: 'Ya formabas parte de este equipo', cuentaId: inv.cuentaId });
    }

    // Se vuelve a comprobar el cupo AQUÍ, no solo al invitar. Entre la
    // invitación y su aceptación puede haber pasado una semana, y en ese rato el
    // dueño pudo bajar de plan o llenar los asientos con otras personas.
    const miembros = await prisma.miembro.count({ where: { cuentaId: inv.cuentaId } });
    if (miembros >= asientosDelPlan(inv.cuenta.plan) - 1) {
      return res.status(409).json({
        error: `El plan de ${inv.cuenta.nombre} ya no tiene asientos libres. Pídele que amplíe el plan.`,
        tipo: 'SIN_ASIENTOS',
      });
    }

    const miembro = await prisma.$transaction(async (tx) => {
      const m = await tx.miembro.create({
        data: {
          cuentaId: inv.cuentaId,
          usuarioId: req.usuario.id,
          rol: inv.rol,
          negociosIds: inv.negociosIds,
        },
      });
      // La invitación se consume: el enlace deja de valer en cuanto se usa.
      await tx.invitacion.delete({ where: { id: inv.id } });
      return m;
    });

    await prisma.registroActividad.create({
      data: {
        cuentaId: inv.cuentaId,
        usuarioId: req.usuario.id,
        autorNombre: req.usuario.nombre || req.usuario.email,
        accion: 'equipo_aceptar',
        detalle: { rol: inv.rol },
      },
    }).catch(() => {});

    enviarAvisoNuevoMiembro({
      propietario: inv.cuenta,
      miembro: { nombre: req.usuario.nombre, email: req.usuario.email },
      rol: inv.rol,
    }).catch((e) => console.error('[Equipo] aviso de nuevo miembro:', e.message));

    res.json({
      mensaje: `Ya tienes acceso a ${inv.cuenta.nombre}`,
      cuentaId: inv.cuentaId,
      cuentaNombre: inv.cuenta.nombre,
      rol: miembro.rol,
    });
  } catch (error) { next(error); }
});

// ── GET /api/equipo/cuentas ───────────────────────────────
// Las cuentas en las que esta persona puede trabajar. Alimenta el selector del
// panel; siempre devuelve al menos la propia.
router.get('/cuentas', async (req, res, next) => {
  try {
    res.json({ cuentas: await cuentasDe(req.usuario), activa: req.cuenta.id });
  } catch (error) { next(error); }
});

// ── POST /api/equipo/salir ────────────────────────────────
// Un miembro se va por su cuenta. No lleva `permitir('equipo')`: precisamente
// quien NO tiene ese permiso es quien lo necesita, y nadie debería quedar
// atrapado dentro de la cuenta de otro.
router.post('/salir', async (req, res, next) => {
  try {
    const { cuentaId } = req.body || {};
    const destino = cuentaId || req.cuenta.id;
    if (destino === req.usuario.id) {
      return res.status(400).json({ error: 'No puedes salir de tu propia cuenta' });
    }
    const borrado = await prisma.miembro.deleteMany({
      where: { cuentaId: destino, usuarioId: req.usuario.id },
    });
    if (borrado.count === 0) return res.status(404).json({ error: 'No estabas en ese equipo' });
    res.json({ mensaje: 'Saliste del equipo' });
  } catch (error) { next(error); }
});

// ── GET /api/equipo ───────────────────────────────────────
// El estado del equipo de la cuenta activa.
//
// Lo puede ver CUALQUIER rol, no solo el propietario: saber con quién compartes
// el panel —y que tus acciones quedan firmadas— es parte de trabajar en equipo,
// no un privilegio. Modificar sí es del propietario, y eso lo cubre `permitir`
// en cada ruta de abajo.
router.get('/', async (req, res, next) => {
  try {
    const [miembros, asientos, invitaciones, negocios] = await Promise.all([
      equipoDeCuenta(req.cuenta.id, req.cuenta.plan),
      contarAsientos(req.cuenta.id, req.cuenta.plan),
      prisma.invitacion.findMany({
        where: { cuentaId: req.cuenta.id },
        orderBy: { creadoEn: 'desc' },
      }),
      prisma.negocio.findMany({
        where: { usuarioId: req.cuenta.id, activo: true },
        select: { id: true, nombre: true },
        orderBy: { creadoEn: 'asc' },
      }),
    ]);

    // Actividad reciente. Solo se le muestra a quien puede gestionar el equipo:
    // es un registro de lo que hace cada persona, y enseñárselo a todos convierte
    // una herramienta de rendición de cuentas en una de vigilancia entre colegas.
    const actividad = req.rol === 'PROPIETARIO'
      ? await prisma.registroActividad.findMany({
        where: { cuentaId: req.cuenta.id },
        orderBy: { creadoEn: 'desc' },
        take: 40,
      })
      : [];

    const nombreDe = Object.fromEntries(negocios.map((n) => [n.id, n.nombre]));
    const conNombres = (ids) => ids.map((id) => nombreDe[id]).filter(Boolean);

    res.json({
      rol: req.rol,
      esPropietario: req.rol === 'PROPIETARIO',
      cuenta: { id: req.cuenta.id, nombre: req.cuenta.nombre, plan: req.cuenta.plan },
      asientos,
      propietario: { nombre: req.cuenta.nombre, email: req.cuenta.email },
      negocios,
      miembros: miembros.map((m) => ({
        id: m.id,
        rol: m.rol,
        rolNombre: nombreRol(m.rol),
        sinAsiento: m.sinAsiento,
        desde: m.creadoEn,
        negociosIds: m.negociosIds,
        negocios: conNombres(m.negociosIds),
        usuario: m.usuario,
        soyYo: m.usuario.id === req.usuario.id,
      })),
      invitaciones: invitaciones.map((i) => ({
        id: i.id,
        email: i.email,
        rol: i.rol,
        rolNombre: nombreRol(i.rol),
        negocios: conNombres(i.negociosIds),
        expira: i.expira,
        vencida: i.expira < new Date(),
        creadoEn: i.creadoEn,
      })),
      actividad,
    });
  } catch (error) { next(error); }
});

// ─── A partir de aquí, solo el propietario ────────────────
router.use(permitir('equipo'));

// Comprueba que los negocios del alcance son de esta cuenta. Sin esto, un
// alcance con ids ajenos no daría acceso a nada (el filtro cruza con usuarioId),
// pero sí dejaría guardar basura y mostraría un alcance que miente.
const validarAlcance = async (cuentaId, ids) => {
  if (!ids || ids.length === 0) return [];
  const propios = await prisma.negocio.findMany({
    where: { id: { in: ids }, usuarioId: cuentaId, activo: true },
    select: { id: true },
  });
  if (propios.length !== ids.length) {
    const e = new Error('Alguno de los negocios seleccionados no es de esta cuenta');
    e.status = 400;
    throw e;
  }
  return propios.map((n) => n.id);
};

// ── POST /api/equipo/invitar ──────────────────────────────
router.post('/invitar', async (req, res, next) => {
  try {
    const datos = schemaInvitar.safeParse(req.body || {});
    if (!datos.success) {
      return res.status(400).json({ error: datos.error.issues[0]?.message || 'Datos inválidos' });
    }
    const { email, rol, negociosIds } = datos.data;

    if (!ROLES_INVITABLES.includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    if (email === req.usuario.email.toLowerCase()) {
      return res.status(400).json({ error: 'Esa es tu propia cuenta' });
    }

    // Gratis no comparte. Se responde con el número de asientos de cada plan
    // para que el mensaje sirva de algo: "no puedes" a secas no dice qué hacer.
    const asientos = await contarAsientos(req.cuenta.id, req.cuenta.plan);
    if (asientos.total <= 1) {
      return res.status(403).json({
        error: 'Compartir la cuenta está disponible desde el Plan Negocio (3 personas) y Franquicia (10).',
        accion: 'ACTUALIZAR_PLAN',
      });
    }
    if (asientos.libres <= 0) {
      return res.status(403).json({
        error: `Tu plan incluye ${asientos.total} personas y ya están ocupadas. Libera un lugar o pasa a Franquicia (10).`,
        accion: 'ACTUALIZAR_PLAN',
        asientos,
      });
    }

    const yaMiembro = await prisma.miembro.findFirst({
      where: { cuentaId: req.cuenta.id, usuario: { email: { equals: email, mode: 'insensitive' } } },
    });
    if (yaMiembro) return res.status(409).json({ error: 'Esa persona ya está en tu equipo' });

    const alcance = await validarAlcance(req.cuenta.id, negociosIds);

    // Token en claro solo aquí y en el correo; en la base va su hash.
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + DIAS_VIGENCIA * 24 * 60 * 60 * 1000);

    // upsert y no create: reinvitar al mismo correo tiene que renovar el enlace,
    // no chocar contra el @unique con un error que no explica nada. Es además lo
    // que hace que el botón "Reenviar" sea trivial.
    await prisma.invitacion.upsert({
      where: { cuentaId_email: { cuentaId: req.cuenta.id, email } },
      create: {
        cuentaId: req.cuenta.id, email, rol, negociosIds: alcance,
        tokenHash: hashear(token), expira, invitadaPorId: req.usuario.id,
      },
      update: { rol, negociosIds: alcance, tokenHash: hashear(token), expira, invitadaPorId: req.usuario.id },
    });

    const nombres = alcance.length
      ? (await prisma.negocio.findMany({ where: { id: { in: alcance } }, select: { nombre: true } })).map((n) => n.nombre)
      : [];

    // 🔴 Si el correo no sale, la invitación NO sirve para nada: el enlace solo
    // existe dentro de ese mensaje. Por eso se borra y se devuelve el fallo, en
    // vez de dejar una invitación fantasma ocupando un asiento.
    try {
      await enviarInvitacionEquipo({
        email, cuenta: req.cuenta.nombre, invitadoPor: req.usuario.nombre, rol, token, negocios: nombres,
        idioma: await idiomaDeInvitacion(email, req),
      });
    } catch (e) {
      await prisma.invitacion.deleteMany({ where: { cuentaId: req.cuenta.id, email } });
      console.error('[Equipo] No se pudo enviar la invitación:', e.message);
      return res.status(502).json({ error: 'No se pudo enviar el correo de invitación. Revisa la dirección e inténtalo otra vez.' });
    }

    await registrar(req, 'equipo_invitar', { detalle: { email, rol } });
    res.status(201).json({ mensaje: `Invitación enviada a ${email}` });
  } catch (error) { next(error); }
});

// ¿En qué idioma se le escribe a alguien que quizá ni tenga cuenta?
//
// Si ya la tiene, la suya: es el mismo fallo de siempre —mandarle español a
// quien tiene el panel en inglés— solo que por un camino donde no hay objeto
// `usuario` a mano. Si no la tiene, la de quien invita, que es la mejor
// suposición disponible: trabajan en el mismo negocio.
const idiomaDeInvitacion = async (email, req) => {
  const yaExiste = await prisma.usuario.findUnique({
    where: { email }, select: { idioma: true },
  }).catch(() => null);
  return yaExiste?.idioma || req.usuario?.idioma;
};

// ── POST /api/equipo/invitaciones/:id/reenviar ────────────
router.post('/invitaciones/:id/reenviar', async (req, res, next) => {
  try {
    const inv = await prisma.invitacion.findFirst({
      where: { id: req.params.id, cuentaId: req.cuenta.id },
    });
    if (!inv) return res.status(404).json({ error: 'Invitación no encontrada' });

    // Se emite un token NUEVO. Reenviar el mismo enlace no arreglaría el caso
    // que motiva el botón —que la invitación venció— y dejaría vivo un token que
    // ya circuló por un buzón que quizá no era el correcto.
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
    await prisma.invitacion.update({
      where: { id: inv.id }, data: { tokenHash: hashear(token), expira },
    });

    const nombres = inv.negociosIds.length
      ? (await prisma.negocio.findMany({ where: { id: { in: inv.negociosIds } }, select: { nombre: true } })).map((n) => n.nombre)
      : [];

    await enviarInvitacionEquipo({
      email: inv.email, cuenta: req.cuenta.nombre, invitadoPor: req.usuario.nombre,
      rol: inv.rol, token, negocios: nombres,
      idioma: await idiomaDeInvitacion(inv.email, req),
    });

    res.json({ mensaje: `Invitación reenviada a ${inv.email}` });
  } catch (error) { next(error); }
});

// ── DELETE /api/equipo/invitaciones/:id ───────────────────
router.delete('/invitaciones/:id', async (req, res, next) => {
  try {
    const borrado = await prisma.invitacion.deleteMany({
      where: { id: req.params.id, cuentaId: req.cuenta.id },
    });
    if (borrado.count === 0) return res.status(404).json({ error: 'Invitación no encontrada' });
    res.json({ mensaje: 'Invitación cancelada' });
  } catch (error) { next(error); }
});

// ── PATCH /api/equipo/miembros/:id ────────────────────────
// Cambia el rol y/o el alcance de una persona.
router.patch('/miembros/:id', async (req, res, next) => {
  try {
    const miembro = await prisma.miembro.findFirst({
      where: { id: req.params.id, cuentaId: req.cuenta.id },
      include: { usuario: { select: { nombre: true, email: true, idioma: true } } },
    });
    if (!miembro) return res.status(404).json({ error: 'Esa persona no está en tu equipo' });

    const data = {};
    const { rol, negociosIds } = req.body || {};

    if (rol !== undefined) {
      if (!ROLES_INVITABLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
      data.rol = rol;
    }
    if (negociosIds !== undefined) {
      if (!Array.isArray(negociosIds)) return res.status(400).json({ error: 'negociosIds debe ser una lista' });
      data.negociosIds = await validarAlcance(req.cuenta.id, negociosIds);
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada para actualizar' });

    await prisma.miembro.update({ where: { id: miembro.id }, data });
    await registrar(req, 'equipo_cambiar', {
      detalle: { email: miembro.usuario.email, ...data },
    });
    res.json({ mensaje: `Se actualizó el acceso de ${miembro.usuario.nombre}` });
  } catch (error) { next(error); }
});

// ── DELETE /api/equipo/miembros/:id ───────────────────────
router.delete('/miembros/:id', async (req, res, next) => {
  try {
    const miembro = await prisma.miembro.findFirst({
      where: { id: req.params.id, cuentaId: req.cuenta.id },
      include: { usuario: { select: { nombre: true, email: true, idioma: true } } },
    });
    if (!miembro) return res.status(404).json({ error: 'Esa persona no está en tu equipo' });

    await prisma.miembro.delete({ where: { id: miembro.id } });

    // El registro de actividad NO se borra: es el historial de quién respondió
    // qué, y perderlo al despedir a alguien vaciaría justo el momento en que
    // hace falta consultarlo. Por eso el nombre del autor va congelado en cada
    // fila (ver el modelo RegistroActividad).
    await registrar(req, 'equipo_quitar', { detalle: { email: miembro.usuario.email } });

    enviarSalidaEquipo({ miembro: miembro.usuario, cuenta: req.cuenta.nombre })
      .catch((e) => console.error('[Equipo] aviso de salida:', e.message));

    res.json({ mensaje: `${miembro.usuario.nombre} ya no tiene acceso` });
  } catch (error) { next(error); }
});

module.exports = router;
