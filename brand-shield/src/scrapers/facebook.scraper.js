// brand-shield/src/scrapers/facebook.scraper.js
// Obtiene ratings y reseñas de páginas de Facebook via Graph API
// El cliente debe haber conectado su página primero (flujo OAuth)
//
// ESTADO REAL, comprobado el 2026-08-22 contra la documentación oficial — no
// contra la memoria ni contra una sonda. Este archivo NO se ha ejecutado nunca
// contra la API de verdad, así que lo de abajo es todo lo que se sabe:
//
//   ✅ El endpoint EXISTE. `/{page-id}/ratings` sigue vivo en v26.0, sin aviso de
//      deprecación, y devuelve nodos `Recommendation`.
//   ✅ Los campos que usa este stub son REALES: `rating` (1-5), `review_text`,
//      `reviewer`, `created_time`, y en el nodo Page `overall_star_rating` y
//      `rating_count`. No hay que reescribirlo entero, como se llegó a suponer.
//   ⚠️ Le FALTA `recommendation_type` (positive/negative) y los booleanos
//      `has_rating` / `has_review`: desde 2018 una recomendación puede no traer
//      estrella. Sin eso caería en `rating: 0`, y el detector lo leería como una
//      reseña de cero estrellas — peor que no leerla.
//   🔴 BLOQUEADO POR PERMISO, no por la API: `/ratings` exige
//      **`pages_read_user_content`**, que NO está entre los cinco del App Review
//      enviado el 2026-08-15. Va en la segunda solicitud, con `business_management`.
//      ⚠️ NO es `pages_read_engagement`, que es lo que se supuso durante meses.
//   ✅ NO hace falta la feature *Page Public Content Access*: esa es para leer
//      páginas AJENAS, y aquí el cliente conecta la suya.
//
// 🔴 NO terminar este archivo hasta tener el permiso concedido y una página real
// con reseñas. Escribirlo y darlo por bueno con mocks es exactamente lo que pasó
// con `obtenerComentariosTikTok`, que apuntó meses a un endpoint inexistente y
// pasaba todas las pruebas.
//
// Fuentes:
//   https://developers.facebook.com/docs/graph-api/reference/page/ratings/
//   https://developers.facebook.com/docs/graph-api/reference/recommendation/

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
