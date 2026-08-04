// brand-shield/src/api/middlewares/verificarPlan.middleware.js
// Bloquea rutas cuyo acceso depende del plan del usuario. Usar siempre después
// de `autenticar` (necesita req.usuario.plan).

const verificarPlan = (planesPermitidos) => (req, res, next) => {
  if (!planesPermitidos.includes(req.usuario.plan)) {
    return res.status(403).json({
      error: `Esta función requiere plan ${planesPermitidos.join(' o ')}`,
      accion: 'ACTUALIZAR_PLAN',
    });
  }
  next();
};

module.exports = { verificarPlan };
