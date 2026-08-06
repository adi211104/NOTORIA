// brand-shield/src/scrapers/instagramMenciones.scraper.js
// Menciones de Instagram: publicaciones de OTRAS cuentas donde etiquetaron al
// negocio.
//
// ⚠️ Funciona distinto que el de TikTok, y la diferencia condiciona el producto:
//
//   TikTok    → BUSCA términos ("la mar", "cevichería x") por todo TikTok.
//               Necesita un proveedor de datos de pago.
//   Instagram → NO busca. Recibe las publicaciones donde la cuenta fue
//               etiquetada o @mencionada. Es gratis, pero solo llega lo que te
//               arroba: "fui al restaurante X" sin arroba NO aparece.
//
// Por eso esta fuente no usa `construirTerminos`: no hay términos que buscar.
// Buscar por palabra clave en Instagram (hashtags) es otra API que exige
// `instagram_manage_insights` + la Feature *Instagram Public Content Access*, o
// sea otro App Review — ver CLAUDE.md §19.7.
//
// Permisos: instagram_basic + instagram_manage_comments + pages_read_engagement,
// los mismos que ya se piden para los comentarios. No hace falta ninguno nuevo.

const axios = require('axios');
const { clasificar } = require('../nlp/sentimiento');

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

// Cuántas publicaciones etiquetadas se leen por pasada. Explícito por el mismo
// motivo que en el scraper de comentarios: sin `limit` decide Meta.
const LIMITE_MENCIONES = 25;

const configurado = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);

/**
 * Normaliza una IG Media al contrato que espera el worker:
 *   { externalId, texto, autorNombre, autorHandle, url,
 *     sentimiento, fechaMencion, contexto, metricas }
 *
 * `externalId` va prefijado con "ig_" porque Mencion.externalId es único global
 * y un id de Instagram podría chocar con uno de otra fuente.
 */
const normalizar = (media) => {
  const texto = media.caption || '';
  return {
    externalId: `ig_${media.id}`,
    texto,
    autorNombre: media.username || 'Cuenta de Instagram',
    autorHandle: media.username ? `@${String(media.username).replace(/^@/, '')}` : null,
    url: media.permalink || null,
    sentimiento: clasificar(texto),
    fechaMencion: media.timestamp ? new Date(media.timestamp) : null,
    contexto: texto.slice(0, 200),
    // `like_count` viene omitido si el autor ocultó los contadores, así que se
    // distingue "no lo sabemos" (null) de "cero". Instagram no expone vistas ni
    // compartidos en este endpoint: van en null, no en 0, para no inventar.
    metricas: {
      vistas: null,
      likes: media.like_count ?? null,
      comentarios: media.comments_count ?? null,
      compartidos: null,
    },
  };
};

/**
 * Publicaciones de terceros donde etiquetaron a la cuenta del negocio.
 *
 * Devuelve [] si la cuenta no está conectada o si Meta falla — nunca lanza hacia
 * el worker, igual que la fuente de TikTok.
 */
const buscarMencionesInstagram = async (instagramUserId, accessToken, { limite = LIMITE_MENCIONES } = {}) => {
  if (!configurado() || !instagramUserId || !accessToken) return [];
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${instagramUserId}/tags`, {
      params: {
        fields: 'id,caption,permalink,timestamp,username,media_type,like_count,comments_count',
        limit: limite,
        access_token: accessToken,
      },
    });
    return (data.data || []).map(normalizar);
  } catch (error) {
    console.error(`[Menciones Instagram] ${error.response?.data?.error?.message || error.message}`);
    return [];
  }
};

module.exports = { buscarMencionesInstagram, configurado, normalizar, LIMITE_MENCIONES };
