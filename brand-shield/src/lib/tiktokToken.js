// brand-shield/src/lib/tiktokToken.js
// Un solo lugar donde se consigue un access token de TikTok que SIRVA.
//
// Por qué existe (2026-07-31): el access token de TikTok dura 24 horas y nada
// lo renovaba. Una cuenta conectada quedaba muerta al día siguiente y el
// síntoma era mudo — el escaneo traía cero comentarios, sin error visible en el
// panel. Se detectó con la cuenta @adipri: `user/info` y `video/list` devolvían
// `access_token_invalid` con el token guardado en la BD.
//
// El patrón es el mismo de Google Business (refrescar al vencer), con una
// diferencia obligatoria: TikTok ROTA el refresh token en cada renovación, así
// que el resultado hay que PERSISTIRLO o el próximo refresh falla.

const prisma = require('./prisma');
const { refrescarTokenTikTok } = require('../scrapers/tiktok.scraper');

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
const tokenTikTokVigente = async (negocio) => {
  if (!negocio?.tiktokAccessToken) return null;

  const vence = negocio.tiktokTokenExpira ? new Date(negocio.tiktokTokenExpira).getTime() : 0;
  if (vence && vence - MARGEN_MS > Date.now()) return negocio.tiktokAccessToken;

  if (!negocio.tiktokRefreshToken) {
    console.warn(`[TikTok] ${negocio.nombre}: token vencido y sin refresh token — hay que reconectar la cuenta.`);
    return null;
  }

  const refreshUsado = negocio.tiktokRefreshToken;
  const r = await refrescarTokenTikTok(refreshUsado);

  if (r.error) {
    console.warn(`[TikTok] ${negocio.nombre}: no se pudo renovar el token (${r.error}).`);
    // Solo se borra cuando TikTok dice que el refresh token ya no sirve. Ante un
    // error temporal (red, 5xx) se conserva: borrarlo obligaría a reconectar por
    // una caída pasajera, y el usuario perdería el historial de la conexión.
    if (r.permanente) {
      await prisma.negocio.updateMany({
        where: { tiktokRefreshToken: refreshUsado },
        data: { tiktokAccessToken: null, tiktokRefreshToken: null, tiktokTokenExpira: null },
      });
      // El perfil (nombre/avatar) se deja a propósito: sirve para mostrar QUÉ
      // cuenta hay que reconectar.
    }
    return null;
  }

  // updateMany y no update: una misma cuenta de TikTok puede estar conectada a
  // VARIOS negocios (pasa hoy con @adipri en dos). Como TikTok rota el refresh
  // token, si solo se actualizara este negocio, los demás quedarían con una
  // copia ya inservible y se desconectarían solos en el próximo ciclo.
  await prisma.negocio.updateMany({
    where: { tiktokRefreshToken: refreshUsado },
    data: {
      tiktokAccessToken: r.accessToken,
      tiktokRefreshToken: r.refreshToken,
      tiktokTokenExpira: r.expiraEn,
    },
  });

  // El objeto en memoria queda al día para el resto del ciclo del worker.
  negocio.tiktokAccessToken = r.accessToken;
  negocio.tiktokRefreshToken = r.refreshToken;
  negocio.tiktokTokenExpira = r.expiraEn;

  console.log(`[TikTok] ${negocio.nombre}: token renovado (vence ${r.expiraEn.toISOString()}).`);
  return r.accessToken;
};

/**
 * Estado de la conexión para mostrarlo en el panel, sin llamar a TikTok.
 * 'sin_conectar' | 'vencida' | 'ok'
 */
const estadoConexionTikTok = (negocio) => {
  if (!negocio?.tiktokAccessToken) return 'sin_conectar';
  const vence = negocio.tiktokTokenExpira ? new Date(negocio.tiktokTokenExpira).getTime() : 0;
  if (vence && vence <= Date.now() && !negocio.tiktokRefreshToken) return 'vencida';
  return 'ok';
};

module.exports = { tokenTikTokVigente, estadoConexionTikTok };
