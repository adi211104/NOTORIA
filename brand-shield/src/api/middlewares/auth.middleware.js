// brand-shield/src/api/middlewares/auth.middleware.js
// Protege las rutas que requieren sesión activa

const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { resolverAcceso, puede, MOTIVO } = require('../../lib/equipo');

const autenticar = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar que el usuario aún existe
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        nombre: true,
        plan: true,
        suscripcionActiva: true,
        // Para derivar el plan EFECTIVO en resolverAcceso (lib/suscripcion.js):
        // sin la fecha no se distingue «canceló y le quedan días» de «ya venció».
        fechaVencimiento: true,
        // 🔴 resolverAcceso lo copia a req.cuenta; sin pedirlo acá llegaba
        // `undefined` y el tope de negocios de quien PAGÓ locales caía al del
        // plan pelado (bug encontrado en esta misma auditoría).
        localesExtra: true,
        tokenVersion: true,
        // 🔴 `idioma` va acá y no en cada ruta. Todos los correos que se mandan
        // desde una ruta autenticada lo leen de `req.usuario`, y olvidarlo no
        // rompe nada: el correo sale igual, en español, para alguien que tiene
        // el panel en inglés. Ese fallo apareció tres veces en un solo día
        // (2026-08-23) por tres caminos distintos. Pedirlo una vez acá lo cierra
        // para todas las rutas de golpe.
        idioma: true,
      },
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    // 🔴 Corte de sesiones. Es lo que un JWT no sabe hacer solo: caducar antes de
    // tiempo. Cambiar la contraseña incrementa `tokenVersion`, y desde ese
    // momento todos los tokens emitidos antes dejan de valer — que es justo lo
    // que se espera al cambiarla, y lo que hasta ahora NO pasaba: quien te
    // hubiera robado la sesión seguía dentro los 7 días que dura el token.
    //
    // ⚠️ `decoded.v ?? 0` no es un descuido: los tokens emitidos antes de que
    // existiera esta columna no llevan `v`, y tratarlos como versión 0 —que es el
    // default de la columna— hace que el despliegue no eche a nadie de golpe.
    // En cuanto esa persona cambie su contraseña, sus sesiones viejas mueren.
    if ((decoded.v ?? 0) !== usuario.tokenVersion) {
      return res.status(401).json({
        error: 'Tu sesión se cerró porque la contraseña cambió. Vuelve a iniciar sesión.',
        tipo: 'SESION_REVOCADA',
      });
    }

    req.usuario = usuario;

    // ─── Cuenta activa ────────────────────────────────────
    //
    // Va DENTRO de `autenticar` a propósito, y no como middleware aparte que
    // haya que recordar montar: si una ruta se lo saltara, `req.cuenta` sería
    // undefined y la consulta caería en `usuarioId: undefined`, que en Prisma no
    // es un error sino un filtro que se ignora — o sea, devolver los negocios de
    // TODO el mundo. Un fallo abierto y silencioso. Aquí no se puede olvidar.
    //
    // El header es opcional: sin él se trabaja en la cuenta propia, que es el
    // caso de casi todas las peticiones y no cuesta ni una consulta extra.
    const cuentaPedida = (req.get('X-Cuenta') || req.query.cuenta || '').trim();
    const acceso = await resolverAcceso(usuario, cuentaPedida);
    req.cuenta = acceso.cuenta;   // la EMPRESA en la que se está trabajando
    req.rol = acceso.rol;         // PROPIETARIO | GESTOR | LECTOR
    req.alcance = acceso.alcance; // null = todos sus negocios | [ids] = solo esos

    next();
  } catch (error) {
    // Los errores de acceso a una cuenta ajena traen su propio status y tipo
    // (ver lib/equipo.js). Se contestan tal cual para que el frontend pueda
    // distinguir "no eres de este equipo" de "tu plan se quedó sin asientos",
    // que se arreglan de formas muy distintas.
    if (error.status === 403 && error.tipo) {
      return res.status(403).json({ error: error.message, tipo: error.tipo });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado, inicia sesión nuevamente' });
    }
    next(error);
  }
};

// Verifica que el usuario tenga suscripción activa
// Ojo: mira la CUENTA, no la persona — mismo criterio que verificarPlan.
const requiereSuscripcion = (req, res, next) => {
  if (!req.cuenta.suscripcionActiva && req.cuenta.plan !== 'GRATIS') {
    return res.status(403).json({
      error: 'Se requiere suscripción activa',
      accion: 'SUSCRIBIRSE',
    });
  }
  next();
};

// Nota (2026-08-05): NO hay rol de administrador a propósito. El Libro de
// Reclamaciones se gestiona desde la terminal con `scripts/reclamaciones.js`
// (vía `railway run`), no desde una pantalla web. Guarda datos personales de
// terceros —DNI, domicilio, teléfono— y exponerlos tras el panel haría que
// robar una sesión también los comprometiera. Decisión del usuario, y la más
// segura: no se añade superficie web para algo que se usa dos veces al mes.
// ─── Permisos dentro de la cuenta ─────────────────────────
//
// Se usa SIEMPRE después de `autenticar` (necesita req.rol). Un rol sin el
// permiso recibe 403 con el motivo ya redactado, para que el mismo mensaje salga
// igual venga de donde venga.
//
// ⚠️ Al añadir una ruta que MODIFIQUE algo, ponerle su `permitir(...)`. Sin él
// hereda el permiso más bajo que existe —solo lectura— y un LECTOR podría
// escribir. El repaso rápido: si la ruta no es GET, lleva permitir().
const permitir = (permiso) => (req, res, next) => {
  if (!puede(req.rol, permiso)) {
    return res.status(403).json({
      error: MOTIVO[permiso] || 'Tu rol no permite esta acción',
      accion: 'SIN_PERMISO',
      permiso,
      rol: req.rol,
    });
  }
  next();
};

module.exports = { autenticar, requiereSuscripcion, permitir };
