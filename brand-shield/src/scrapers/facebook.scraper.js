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
// ── ESTADO 2026-08-23: terminado, pero OCULTO tras interruptor ───────────────
//
// Los tres campos que faltaban ya están, y la recomendación sin estrella se
// trata como corresponde. Lo que NO cambió es que sigue haciendo falta el
// permiso, así que la función vive detrás de `lib/facebookVisible.js`, igual
// que Instagram: el código está listo y nadie lo ve hasta que Meta apruebe.
//
// ⚠️ La advertencia original de este archivo —«no lo escribas a ciegas»— se
// respetó en lo que de verdad protegía: no se inventó ningún endpoint. Pero
// queda su mitad válida y hay que hacerla ANTES de encender el interruptor para
// todos: **una llamada real contra una página con reseñas**. Las pruebas cubren
// la forma DOCUMENTADA de la respuesta, no la respuesta de verdad.
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

// 🔴 Desde 2018 Facebook NO tiene estrellas: tiene recomendaciones.
//
// El nodo `Recommendation` puede llegar sin `rating` y solo con
// `recommendation_type` ('positive' | 'negative'). El stub original hacía
// `rating: r.rating || 0`, así que esas caían en **0 estrellas** — y el detector
// las habría leído como una reseña de cero, peor que no leerlas: una
// recomendación positiva sin estrella se habría contado como la peor reseña
// posible y disparado una alerta al cliente por algo bueno que le pasó.
//
// La conversión es una decisión de producto, no un detalle técnico: se mapea
// positive → 5 y negative → 1, porque es lo que Facebook muestra en su propia
// interfaz («recomienda» / «no recomienda») y lo que el dueño espera ver. Se
// deja constancia en `sinEstrella` para que el panel pueda decir «recomendación,
// sin estrella» en vez de fingir una precisión que no existe.
const RATING_POR_RECOMENDACION = { positive: 5, negative: 1 };

const ratingDeRecomendacion = (r) => {
  // `has_rating` es la palabra de Facebook sobre si hay estrella de verdad. Se
  // prefiere al `typeof r.rating`, porque la API puede mandar el campo a 0.
  if (r.has_rating && typeof r.rating === 'number' && r.rating >= 1) {
    return { rating: r.rating, sinEstrella: false };
  }
  const derivado = RATING_POR_RECOMENDACION[r.recommendation_type];
  if (derivado) return { rating: derivado, sinEstrella: true };
  // Ni estrella ni tipo: no hay nada que guardar. Devolver 0 sería inventar.
  return null;
};

/**
 * Obtiene las reseñas recientes de una página de Facebook.
 *
 * ⚠️ Requiere `pages_read_user_content`, NO `pages_read_engagement` — eso se
 * supuso mal durante meses. Va en la segunda solicitud de App Review
 * (`docs/app-review-meta.md` §8).
 */
const obtenerResenasFacebook = async (pageId, accessToken) => {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${pageId}/ratings`, {
      params: {
        // `recommendation_type`, `has_rating` y `has_review` son los tres que le
        // faltaban al stub y los que evitan el rating fantasma de 0.
        fields: 'reviewer,rating,review_text,created_time,recommendation_type,has_rating,has_review',
        limit: 10,
        access_token: accessToken,
      },
    });

    const resenas = [];
    for (const r of data.data || []) {
      const calificacion = ratingDeRecomendacion(r);
      // Una entrada sin estrella y sin tipo no se puede interpretar. Se descarta
      // en silencio en vez de guardarla mal: el conteo saldrá corto, que es
      // preferible a una reseña inventada en la ficha del cliente.
      if (!calificacion) continue;

      resenas.push({
        externalId: `fb_${r.created_time}_${r.reviewer?.id || 'anon'}`,
        rating: calificacion.rating,
        // `has_review` dice si hay texto. Sin él se guarda vacío, no 'undefined'.
        texto: (r.has_review && r.review_text) ? r.review_text : '',
        autorNombre: r.reviewer?.name || 'Anónimo',
        // Facebook no expone el historial del autor. `null` y no 0: la señal de
        // "cuenta nueva" del detector distingue "no sabemos" de "cero reseñas".
        autorResenasTotal: null,
        fechaResena: new Date(r.created_time),
        sinEstrella: calificacion.sinEstrella,
      });
    }

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

module.exports = { obtenerRatingFacebook, obtenerResenasFacebook, ratingDeRecomendacion };
