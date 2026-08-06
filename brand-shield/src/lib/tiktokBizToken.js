// brand-shield/src/lib/tiktokBizToken.js
// Un solo lugar donde se consigue un access token de la TikTok Accounts API
// que SIRVA. Gemelo de `tiktokToken.js`, que hace lo mismo para la Display API.
//
// Se copia la estructura de aquel a propósito, incluidas sus dos decisiones
// caras de aprender (§15-quater):
//  · el access token dura 24 h y NADA lo renovaba: la cuenta se conectaba,
//    funcionaba un día y al siguiente todas las llamadas fallaban en silencio;
//  · TikTok **rota** el refresh token en cada renovación, así que el nuevo hay
//    que persistirlo o el refresh siguiente falla.
//
// No se fusionó con `tiktokToken.js` porque son APIs distintas: otro endpoint,
// otras credenciales, otras columnas y otra forma de error. Un módulo con un
// `if (esBusiness)` en cada función sería más frágil que dos archivos claros.

const prisma = require('./prisma');
const { refrescarTokenTikTokBiz } = require('../scrapers/tiktokBusiness.scraper');

// Se renueva un poco antes de que venza: un escaneo puede tardar y no queremos
// que el token muera a mitad del recorrido de videos.
const MARGEN_MS = 5 * 60 * 1000;

/**
 * Access token vigente del negocio, renovándolo si hace falta.
 *
 * Devuelve null cuando no hay nada que usar (cuenta no conectada, o el refresh
 * token dejó de servir y hace falta reconectar). El llamador trata null igual
 * que "sin cuenta": no llama a TikTok.
 */
const tokenTikTokBizVigente = async (negocio) => {
  if (!negocio?.tiktokBizAccessToken) return null;

  const vence = negocio.tiktokBizTokenExpira ? new Date(negocio.tiktokBizTokenExpira).getTime() : 0;
  if (vence && vence - MARGEN_MS > Date.now()) return negocio.tiktokBizAccessToken;

  if (!negocio.tiktokBizRefreshToken) {
    console.warn(`[TikTok Biz] ${negocio.nombre}: token vencido y sin refresh token — hay que reconectar.`);
    return null;
  }

  const refreshUsado = negocio.tiktokBizRefreshToken;
  const r = await refrescarTokenTikTokBiz(refreshUsado);

  if (r.error) {
    console.warn(`[TikTok Biz] ${negocio.nombre}: no se pudo renovar el token (${r.error}).`);
    // Solo se borra cuando TikTok dice que el refresh token ya no sirve. Ante un
    // error temporal (red, 5xx) se conserva: borrarlo obligaría a reconectar por
    // una caída pasajera.
    if (r.permanente) {
      await prisma.negocio.updateMany({
        where: { tiktokBizRefreshToken: refreshUsado },
        data: {
          tiktokBizAccessToken: null,
          tiktokBizRefreshToken: null,
          tiktokBizTokenExpira: null,
        },
      });
      // El perfil (nombre/avatar/@) se deja a propósito: sirve para mostrar QUÉ
      // cuenta hay que reconectar.
    }
    return null;
  }

  // updateMany y no update: una misma cuenta de TikTok puede estar conectada a
  // VARIOS negocios. Como TikTok rota el refresh token, si solo se actualizara
  // este negocio, los demás quedarían con una copia inservible y se
  // desconectarían solos en el próximo ciclo.
  await prisma.negocio.updateMany({
    where: { tiktokBizRefreshToken: refreshUsado },
    data: {
      tiktokBizAccessToken: r.accessToken,
      tiktokBizRefreshToken: r.refreshToken,
      tiktokBizTokenExpira: r.expiraEn,
    },
  });

  // El objeto en memoria queda al día para el resto del ciclo del worker.
  negocio.tiktokBizAccessToken = r.accessToken;
  negocio.tiktokBizRefreshToken = r.refreshToken;
  negocio.tiktokBizTokenExpira = r.expiraEn;

  console.log(`[TikTok Biz] ${negocio.nombre}: token renovado (vence ${r.expiraEn.toISOString()}).`);
  return r.accessToken;
};

/**
 * Estado de la conexión para mostrarlo en el panel, sin llamar a TikTok.
 * 'sin_conectar' | 'vencida' | 'ok'
 */
const estadoConexionTikTokBiz = (negocio) => {
  if (!negocio?.tiktokBizAccessToken) return 'sin_conectar';
  const vence = negocio.tiktokBizTokenExpira ? new Date(negocio.tiktokBizTokenExpira).getTime() : 0;
  if (vence && vence <= Date.now() && !negocio.tiktokBizRefreshToken) return 'vencida';
  return 'ok';
};

module.exports = { tokenTikTokBizVigente, estadoConexionTikTokBiz };
