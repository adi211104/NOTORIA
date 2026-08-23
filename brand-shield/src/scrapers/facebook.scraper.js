// brand-shield/src/scrapers/facebook.scraper.js
// Obtiene ratings y reseñas de páginas de Facebook via Graph API
// El cliente debe haber conectado su página primero (flujo OAuth)
//
// ── PROBADO CONTRA LA API DE VERDAD el 2026-08-23 ────────────────────────────
//
// Ya no es documentación ni una sonda: se llamó desde el Explorador de la Graph
// API con un token de PÁGINA real (página «Notoria», id 1211927292012805) y el
// permiso `pages_read_user_content` concedido.
//
// LO QUE QUEDÓ PROBADO:
//   ✅ `/{page-id}/ratings` existe y responde 200 en v26.0. No es un endpoint
//      fantasma — que es justo lo que hundió a `obtenerComentariosTikTok`.
//   ✅ **`pages_read_user_content` es el permiso correcto.** Se concede con
//      acceso estándar a quien tiene rol en la app, así que se pudo probar sin
//      esperar al App Review. Con él, la llamada pasa.
//   ✅ El Explorador reconoce `recommendation_type`, `has_rating` y `has_review`
//      como campos de esa arista, y descarta uno inventado.
//   ✅ En el nodo Page, `overall_star_rating` y `rating_count` devuelven valores.
//
// LO QUE SIGUE SIN PROBARSE, y hay que decirlo:
//   ⚠️ **La forma de un nodo `Recommendation` real.** La página no tiene ninguna
//      reseña, así que la respuesta fue `{"data": []}`. Y ojo: con la colección
//      vacía Meta **no valida los campos** — se comprobó pidiendo uno inventado y
//      también devolvió `[]` sin error, ni siquiera con `debug=all`. O sea que el
//      éxito de la llamada NO prueba que los siete campos existan; eso lo dice el
//      esquema del Explorador, no la respuesta.
//
// 🔴 EL HALLAZGO QUE SOLO DABA LA LLAMADA REAL: una página sin reseñas devuelve
// `{overall_star_rating: 0, rating_count: 0}`. Ese **0 no es una nota, es la
// ausencia de nota** — ver `sinValoraciones` abajo.
//
// ── Estado del producto: terminado y OCULTO tras interruptor ─────────────────
//
// `lib/facebookVisible.js`, igual que Instagram. El código está listo y nadie lo
// ve hasta que Meta apruebe el permiso para clientes reales — hoy solo funciona
// para cuentas con rol en la app.
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

    // 🔴 `overall_star_rating: 0` significa «no hay valoraciones», NO «cero
    // estrellas». Comprobado en vivo el 2026-08-23 contra una página real sin
    // reseñas: Meta devuelve `{overall_star_rating: 0, rating_count: 0}`.
    //
    // Es el mismo error que `sinEstrella`, por otro camino. Guardar ese 0 como
    // si fuera una nota crea un snapshot de «0★» que envenena todo lo que
    // compara mediciones: el día que llegue la primera reseña de 4.5★,
    // `lib/progreso.js` restaría 4.5 − 0 y el panel cantaría una subida de 4.5
    // puntos que no ocurrió. Y al revés, perder la única reseña se leería como
    // un desplome.
    //
    // Se señala aparte y el worker no crea snapshot: de una página sin
    // valoraciones no hay rating que registrar. Se pierde el «0 reseñas» como
    // línea base, y es aceptable — cualquier comparación necesita dos lecturas
    // igualmente, así que como mucho se cuenta de menos. Un conteo corto se
    // nota; un dato falso, no.
    const sinValoraciones = !data.rating_count;
    return {
      ratingActual: data.overall_star_rating || 0,
      totalResenas: data.rating_count || 0,
      sinValoraciones,
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
