// brand-shield/src/lib/gbpVisible.js
// Interruptor de visibilidad de Google Business Profile.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Es el tercer interruptor del proyecto, gemelo de `instagramVisible.js` y
// `facebookVisible.js`, pero por un motivo PEOR que el de esos dos.
//
// Instagram y Facebook esperan una decisión de Meta que va a llegar. Google
// Business no espera nada: las GBP APIs están con **cuota `Requests per minute`
// = 0**, que es la señal documentada de que no hay acceso concedido, y
// `mybusiness.googleapis.com` —la v4, la única que lee y responde reseñas— ni
// siquiera aparece en la Biblioteca de la consola. El caso de asistencia
// `3-5553000040900` lleva abierto desde el 2026-08-16 sin respuesta.
//
// Con cuota 0 el flujo NO falla al principio, que es lo que lo hacía peligroso:
// el usuario pasa por el diálogo de Google, **autoriza de verdad**, vuelve a
// Notoria, y recién ahí revienta en `listarCuentas` → `?gbp_error=callback_failed`.
// O sea que el cliente concede permisos sobre su ficha real y a cambio recibe un
// error genérico. Es la peor forma posible de fallar: la que parece culpa suya.
//
// ⚠️ Y hasta el 2026-08-25 esto NO estaba escondido, al contrario que las otras
// dos redes. Además el botón estaba **anunciado en la web** como el paso 3 de
// cuatro del onboarding, prometido dos veces en el FAQ y repetido en el JSON-LD
// que Google indexa. Como no hay clientes de pago todavía, no lo había pulsado
// nadie. El primer cliente real habría empezado justo por ahí.
//
// ── CÓMO SE ENCIENDE EL DÍA QUE GOOGLE CONCEDA ──────────────────────────────
//
//   1. Comprobar en la consola que `mybusinessbusinessinformation` dejó de
//      tener `Requests per minute = 0`. ⚠️ Las otras tres cuotas de esa API
//      SIEMPRE han tenido valores (Create Location 100, SearchGoogleLocation
//      200, Update Location 10 000): ver un número ahí y cantar victoria es el
//      error fácil. La única señal es Requests per minute.
//   2. Habilitar `mybusiness.googleapis.com` (la v4), que hoy no aparece.
//   3. Probar el flujo entero con una cuenta de `GBP_CUENTAS_PRUEBA`.
//   4. Recién entonces `GBP_ACTIVO=true` en Railway — se abre para todos sin
//      desplegar código.
//   5. Y devolver a la web las frases que se quitaron el 2026-08-25: el paso 3
//      del onboarding y las dos preguntas del FAQ (en los DOS idiomas, y en el
//      JSON-LD de `layout.js`, que es una copia aparte).
//
// La lógica no se borra después: vuelve a hacer falta el día que se añada otra
// integración que llegue antes que su aprobación. Ya van tres.
//
// Variables de entorno:
//   GBP_ACTIVO=true                 → visible para todos (post-aprobación)
//   GBP_CUENTAS_PRUEBA=a@b.c,d@e.f  → correos que lo ven mientras tanto

const activoParaTodos = () => process.env.GBP_ACTIVO === 'true';

// Se lee en cada llamada, no al cargar el módulo: así cambiar la variable en
// Railway surte efecto con solo reiniciar, sin tocar código.
const cuentasPrueba = () =>
  (process.env.GBP_CUENTAS_PRUEBA || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

/**
 * ¿Este usuario puede ver y conectar Google Business Profile?
 *
 * @param {{email?: string}|null|undefined} usuario  `req.cuenta` o `req.usuario`.
 * @returns {boolean}
 */
const gbpVisiblePara = (usuario) => {
  if (activoParaTodos()) return true;
  const email = String(usuario?.email || '').trim().toLowerCase();
  return !!email && cuentasPrueba().includes(email);
};

/**
 * ¿Están las credenciales de OAuth de Google puestas?
 *
 * Separado de la visibilidad a propósito: son dos preguntas distintas y el
 * panel necesita las dos. Sin credenciales la función no puede funcionar ni
 * para las cuentas de prueba.
 */
const configurado = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

module.exports = { gbpVisiblePara, activoParaTodos, configurado };
