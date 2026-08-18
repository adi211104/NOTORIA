// brand-shield/src/api/middlewares/verificarPlan.middleware.js
// Bloquea rutas cuyo acceso depende del plan. Usar siempre después de
// `autenticar` (necesita req.cuenta.plan).
//
// ⚠️ Mira el plan de la CUENTA, no el de la persona. Un invitado que en su
// propia cuenta está en Gratis, trabajando dentro de una cuenta Franquicia tiene
// que ver lo que esa cuenta paga: quien paga es la empresa, no cada persona.
// Leerlo de `req.usuario.plan` le negaría al equipo justo las funciones por las
// que el dueño contrató el plan.

const verificarPlan = (planesPermitidos) => (req, res, next) => {
  if (!planesPermitidos.includes(req.cuenta.plan)) {
    return res.status(403).json({
      error: `Esta función requiere plan ${planesPermitidos.join(' o ')}`,
      accion: 'ACTUALIZAR_PLAN',
    });
  }
  next();
};

module.exports = { verificarPlan };
