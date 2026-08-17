// brand-shield/src/api/middlewares/auth.middleware.js
// Protege las rutas que requieren sesión activa

const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
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
        tokenVersion: true,
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
    next();
  } catch (error) {
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
const requiereSuscripcion = (req, res, next) => {
  if (!req.usuario.suscripcionActiva && req.usuario.plan !== 'GRATIS') {
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
module.exports = { autenticar, requiereSuscripcion };
