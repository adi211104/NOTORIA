// brand-shield/src/lib/negocioPublico.js
//
// Saneador de objetos `Negocio` antes de mandarlos al navegador.
//
// POR QUÉ EXISTE: las rutas de negocio devolvían el registro completo con
// `res.json(negocio)`, así que los access tokens de TikTok, Instagram, Facebook y
// Google Business viajaban al cliente y se veían en la pestaña Network. Un token
// de esos permite operar la cuenta de la red social del negocio por fuera de
// Notoria — no es un dato que el frontend deba tocar nunca.
//
// CÓMO SE USA: envolver TODA respuesta que incluya un negocio.
//   res.json(negocioPublico(negocio))          // uno
//   res.json(negociosPublicos(negocios))       // lista
//
// El frontend no pierde nada: los tokens solo se usaban para deducir "¿está
// conectado?", y eso ahora llega ya resuelto en los booleanos `*Conectado`.
//
// ⚠️ Si algún día agregas un campo secreto nuevo al modelo `Negocio` (otro token,
// un refresh token, un client secret por negocio), AGRÉGALO A `CAMPOS_SECRETOS`.
// La lista es explícita a propósito: un allowlist de campos permitidos se
// desincronizaría en silencio cada vez que el modelo crece y rompería el panel,
// mientras que este denylist falla del lado visible (se ve un campo de más, no
// desaparece uno que hacía falta). El riesgo a cambio es que un campo secreto
// nuevo pase desapercibido, y por eso está esta nota.

const CAMPOS_SECRETOS = [
  'facebookAccessToken',
  'instagramAccessToken',
  'tiktokAccessToken',
  'tiktokRefreshToken',
  'tiktokBizAccessToken',
  'tiktokBizRefreshToken',
  'gbpAccessToken',
  'gbpRefreshToken',
];

/**
 * Quita los tokens de un negocio y agrega los booleanos de conexión derivados.
 * Devuelve `null`/`undefined` tal cual para poder encadenarlo sin guardas.
 */
const negocioPublico = (negocio) => {
  if (!negocio) return negocio;

  const limpio = { ...negocio };
  for (const campo of CAMPOS_SECRETOS) delete limpio[campo];

  return {
    ...limpio,
    // GBP necesita las dos cosas: con token pero sin `gbpLocationId` la conexión
    // quedó a medias (el usuario autorizó pero no eligió local) y no se puede leer
    // ni responder nada. Es el mismo criterio que ya usaba el frontend.
    gbpConectado: !!(negocio.gbpAccessToken && negocio.gbpLocationId),
    // Cualquiera de las dos conexiones cuenta como "TikTok conectado" para la
    // pastilla del panel; da igual por cuál API se esté leyendo.
    tiktokConectado: !!(negocio.tiktokAccessToken || negocio.tiktokBizAccessToken),
    // Pero solo la Accounts API permite leer y responder comentarios, así que el
    // tab Comentarios necesita distinguirlas.
    tiktokComentariosActivos: !!negocio.tiktokBizAccessToken,
    instagramConectado: !!negocio.instagramAccessToken,
    facebookConectado: !!negocio.facebookAccessToken,
  };
};

const negociosPublicos = (negocios) => (negocios || []).map(negocioPublico);

module.exports = { negocioPublico, negociosPublicos, CAMPOS_SECRETOS };
