// brand-shield/src/scrapers/facebook.scraper.js
// Obtiene ratings y reseñas de páginas de Facebook via Graph API
// El cliente debe haber conectado su página primero (flujo OAuth)

const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

/**
 * Obtiene el rating general de una página de Facebook
 */
const obtenerRatingFacebook = async (pageId, accessToken) => {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${pageId}`, {
      params: {
        fields: 'overall_star_rating,rating_count',
        access_token: accessToken,
      },
    });

    return {
      ratingActual: data.overall_star_rating || 0,
      totalResenas: data.rating_count || 0,
    };
  } catch (error) {
    console.error(`[Facebook] Error obteniendo rating: ${error.message}`);
    return null;
  }
};

/**
 * Obtiene las reseñas recientes de una página de Facebook
 */
const obtenerResenasFacebook = async (pageId, accessToken) => {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${pageId}/ratings`, {
      params: {
        fields: 'reviewer,rating,review_text,created_time',
        limit: 10,
        access_token: accessToken,
      },
    });

    const resenas = (data.data || []).map((r) => ({
      externalId: `fb_${r.created_time}_${r.reviewer?.id || 'anon'}`,
      rating: r.rating || 0,
      texto: r.review_text || '',
      autorNombre: r.reviewer?.name || 'Anónimo',
      autorResenasTotal: null, // Facebook no expone esto en la API
      fechaResena: new Date(r.created_time),
    }));

    return resenas;
  } catch (error) {
    // Si el token expiró, lo indicamos con un error específico
    if (error.response?.data?.error?.code === 190) {
      console.warn(`[Facebook] Token expirado para page ${pageId}`);
      return { tokenExpirado: true };
    }
    console.error(`[Facebook] Error obteniendo reseñas: ${error.message}`);
    return null;
  }
};

module.exports = { obtenerRatingFacebook, obtenerResenasFacebook };
