// brand-shield/src/lib/instagramVisible.js
// Interruptor de visibilidad de Instagram mientras Meta revisa la app.
//
// POR QUÉ EXISTE. La integración está terminada y probada, pero los permisos
// siguen en **acceso estándar**: con ese nivel, solo quien tiene ROL en la app
// (administrador, desarrollador o tester) puede concederlos. O sea que el primer
// cliente real que pulse "Conectar Instagram" pasa por el diálogo de Meta y
// recibe un error que no puede resolver. Un botón que solo falla es peor que no
// ofrecer la función — la misma regla de producto que ya rige en
// `lib/menciones.js`: lo que no podemos entregar, no se muestra.
//
// POR QUÉ NO SE APAGA DEL TODO. El App Review está EN CURSO. El revisor de Meta
// entra con la cuenta de prueba que se le entregó y tiene que poder conectar
// Instagram; si no ve la función, rechaza la revisión entera. De ahí la lista de
// correos: para todo el mundo Instagram no existe, para esas cuentas sí.
//
// CÓMO SE ENCIENDE AL APROBAR. `INSTAGRAM_ACTIVO=true` en Railway y ya está: se
// abre para todos sin desplegar código. La lógica NO se borra después — vuelve a
// hacer falta el día que se pida un permiso nuevo (que arranca otra vez en
// acceso estándar) o se añada otra red que llegue antes que su aprobación.
//
// Variables de entorno:
//   INSTAGRAM_ACTIVO=true            → visible para todos (post-aprobación)
//   INSTAGRAM_CUENTAS_PRUEBA=a@b.c,d@e.f  → correos que lo ven mientras tanto

const activoParaTodos = () => process.env.INSTAGRAM_ACTIVO === 'true';

// Se lee en cada llamada, no al cargar el módulo: así cambiar la variable en
// Railway surte efecto con solo reiniciar, sin tocar código.
const cuentasPrueba = () =>
  (process.env.INSTAGRAM_CUENTAS_PRUEBA || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

/**
 * ¿Este usuario puede ver y conectar Instagram?
 *
 * @param {{email?: string}|null|undefined} usuario  Normalmente `req.usuario`.
 * @returns {boolean}
 */
const instagramVisiblePara = (usuario) => {
  if (activoParaTodos()) return true;
  const email = String(usuario?.email || '').trim().toLowerCase();
  return !!email && cuentasPrueba().includes(email);
};

module.exports = { instagramVisiblePara, activoParaTodos };
