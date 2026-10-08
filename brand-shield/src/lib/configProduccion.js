// brand-shield/src/lib/configProduccion.js
//
// Qué variables NO pueden faltar en producción, y qué pasa si faltan
// (auditoría 2026-10-02, P0-03 e invariante I-15: «un secreto obligatorio no
// puede quedar opcional en producción»).
//
// 🔴 El patrón que esto corta es el que CLAUDE.md §19 documenta desde agosto:
// `if (!process.env.X) return;` convierte una variable olvidada en una función
// que no existe, sin un solo error en los logs. Pasó con EMAIL_CONTABILIDAD
// (cuatro avisos apagados) y el webhook de Culqi aceptaba TODO sin secreto.
//
// Dos niveles, a propósito:
//
//   CRITICAS → sin ellas el servicio no puede funcionar o funcionaría inseguro.
//              El proceso NO arranca: es preferible que Railway marque el deploy
//              como fallido (la versión anterior sigue sirviendo) a que suba una
//              API que firma sesiones con `undefined`.
//   AVISOS   → sin ellas se apaga UNA función. Se grita en el log al arrancar,
//              pero no se tumba el servicio entero por un aviso de contabilidad.
//              (No se publica en ninguna ruta: decirle al mundo qué secreto
//              falta es darle una pista a quien sondea.)
//
// ⚠️ La lista de críticas es corta a propósito. Meter acá algo opcional haría
// que un despliegue fallara por una integración que ni está encendida.
//
// 🔴 Desde el 2026-10-07 (réplica del auditor, P1-N05/N06 e I-15) también son
// críticos los tres secretos de seguridad que antes solo avisaban: sin ellos la
// API arrancaba degradada EN SILENCIO —tokens OAuth en claro, huella de la promo
// atada al secreto de sesiones (rotarlo reabría la promo a tarjetas que ya la
// usaron), documentos firmados con el secreto de sesiones—. Un control de
// seguridad tiene que vivir en el código, no solo en el inventario de Railway.
// Los tres están cargados en Railway desde el 2026-10-02 (docs/secretos.md).

const CRITICAS = ['DATABASE_URL', 'JWT_SECRET', 'TOKENS_CLAVE', 'PROMO_HASH_SECRET', 'DOCUMENTOS_SECRET'];

const AVISOS = [
  ['CULQI_WEBHOOK_SECRET', 'el webhook de Culqi rechaza TODOS los eventos (reembolsos sin registrar)'],
  ['CULQI_SECRET_KEY', 'no se puede cobrar'],
  ['EMAIL_CONTABILIDAD', 'se apagan los avisos de SUNAT, anulaciones, cobros sin aplicar y webhooks fallidos'],
  ['RESEND_API_KEY', 'no sale ningún correo'],
  ['GOOGLE_PLACES_API_KEY', 'el monitoreo no puede leer Google'],
];

/** Lo que falta. `entorno` permite probarlo sin tocar process.env. */
const revisar = (entorno = process.env) => ({
  criticas: CRITICAS.filter((k) => !entorno[k]),
  avisos: AVISOS.filter(([k]) => !entorno[k]).map(([k, efecto]) => ({ variable: k, efecto })),
});

/**
 * Al arrancar. En producción, una crítica ausente lanza (el proceso muere y el
 * deploy queda fallido); los avisos se escriben en el log con 🔴.
 */
const comprobarAlArrancar = (entorno = process.env, log = console) => {
  const r = revisar(entorno);
  const prod = entorno.NODE_ENV === 'production';
  for (const a of r.avisos) {
    (prod ? log.error : log.warn)(`${prod ? '🔴' : '⚠️'} [Config] Falta ${a.variable}: ${a.efecto}`);
  }
  if (r.criticas.length) {
    const msg = `[Config] Faltan variables críticas: ${r.criticas.join(', ')}`;
    if (prod) throw new Error(msg);
    log.warn(`⚠️ ${msg}`);
  }
  return r;
};

module.exports = { CRITICAS, AVISOS, revisar, comprobarAlArrancar };
