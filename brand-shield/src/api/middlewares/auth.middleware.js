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
      },
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
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

module.exports = { autenticar, requiereSuscripcion };
