// brand-shield/src/scrapers/instagram.scraper.js
// Comentarios de publicaciones de Instagram vía Meta Graph API.
//
// ESTADO: preparado, pendiente de aprobación de la app en Meta.
// Cuando la app esté aprobada:
//  1. Agregar META_APP_ID y META_APP_SECRET al .env
//  2. El negocio conecta su cuenta Instagram Business (OAuth de Meta) —
//     se guardan instagramUserId + instagramAccessToken en el modelo Negocio
//  3. Estas funciones quedan operativas sin cambios en el resto del sistema
//
// Permisos necesarios en Meta: instagram_basic, instagram_manage_comments,
// pages_show_list (la cuenta IG debe ser Business y estar ligada a una página de FB).

const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

// Ventana de lectura. Los dos límites son decisión nuestra, no de la API, y por
// eso van explícitos: sin fijar el de comentarios se aplicaba el valor por
// defecto de Meta, que no controlamos y puede cambiar sin avisar.
//
// Instagram admite una ventana más ancha que TikTok (que usa 10) porque aquí los
// comentarios vienen ANIDADOS en la misma llamada: 25 publicaciones cuestan una
// petición, mientras que en TikTok cada video suma la suya.
//
// ⚠️ Sigue siendo una ventana: un comentario en una publicación más antigua que
// las 25 últimas no se ve. Para eso están los webhooks (ver
// `api/routes/webhooks.routes.js`), que avisan de cualquier publicación sin
// ventana ninguna. No sustituyen a este barrido: los webhooks solo notifican
// desde que se configuran, así que el histórico de una cuenta recién conectada
// sigue llegando por aquí.
const LIMITE_PUBLICACIONES = 25;
const LIMITE_COMENTARIOS = 30;

const configurado = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);

/**
 * Últimas publicaciones con sus comentarios.
 * Devuelve [{ externalId, texto, autorNombre, fechaComentario, publicacionId, publicacionCaption }]
 */
const obtenerComentariosInstagram = async (
  instagramUserId,
  accessToken,
  // `comentariosPorPublicacion` y no `comentarios`: dentro de la función ya hay
  // un acumulador con ese nombre y el choque rompe la inicialización.
  { publicaciones = LIMITE_PUBLICACIONES, comentariosPorPublicacion = LIMITE_COMENTARIOS } = {},
) => {
  if (!configurado() || !instagramUserId || !accessToken) return null;
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${instagramUserId}/media`, {
      params: {
        // `comments.limit(N){...}` es la sintaxis de la Graph API para acotar un
        // campo anidado. Sin el `.limit(N)` manda Meta, no nosotros.
        fields: `id,caption,comments.limit(${comentariosPorPublicacion}){id,text,username,timestamp}`,
        limit: publicaciones,
        access_token: accessToken,
      },
    });
    const comentarios = [];
    for (const media of data.data || []) {
      for (const c of media.comments?.data || []) {
        comentarios.push({
          externalId: `ig_${c.id}`,
          texto: c.text,
          autorNombre: c.username,
          fechaComentario: new Date(c.timestamp),
          publicacionId: media.id,
          publicacionCaption: (media.caption || '').slice(0, 120),
        });
      }
    }
    return comentarios;
  } catch (error) {
    console.error(`[Instagram] Error: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
};

/**
 * Caption de una publicación. Lo usa el webhook: el evento trae el id de la
 * publicación pero no su texto, y el panel muestra ese texto como contexto del
 * comentario. Devuelve '' ante cualquier fallo — quedarse sin título no puede
 * costar el comentario.
 */
const obtenerCaptionPublicacion = async (publicacionId, accessToken) => {
  if (!publicacionId || !accessToken) return '';
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${publicacionId}`, {
      params: { fields: 'caption', access_token: accessToken },
    });
    return (data.caption || '').slice(0, 120);
  } catch {
    return '';
  }
};

/**
 * Suscribe la página de Facebook ligada a la cuenta de Instagram para que Meta
 * envíe los webhooks de comentarios de ESA cuenta.
 *
 * Dos cosas que no son obvias:
 *  1. La suscripción es POR CUENTA, no de la app: activar el webhook en el panel
 *     de Meta no basta, hay que llamar a esto una vez por cada cliente que
 *     conecta su Instagram. Por eso se hace dentro del callback de OAuth.
 *  2. Con un token de PÁGINA, `me` es la propia página — de ahí que no haga
 *     falta guardar el id de la página en la base.
 *
 * Requiere el permiso `pages_manage_metadata`: sin él Meta responde error y no
 * llega ni un evento (los comentarios se siguen leyendo por el escaneo).
 */
const suscribirWebhookInstagram = async (pageAccessToken) => {
  if (!configurado() || !pageAccessToken) return { error: 'Instagram no está configurado.' };
  try {
    const { data } = await axios.post(`${GRAPH_URL}/me/subscribed_apps`, null, {
      params: { subscribed_fields: 'comments', access_token: pageAccessToken },
    });
    return { ok: !!data.success };
  } catch (error) {
    return { error: error.response?.data?.error?.message || error.message };
  }
};

/**
 * Retira la suscripción al desconectar la cuenta. Sin esto Meta seguiría
 * mandando eventos de un negocio que ya no está en Notoria: no se guardarían
 * (el webhook no encuentra el negocio), pero seguiríamos recibiendo datos
 * personales de alguien que retiró su consentimiento, que es exactamente lo que
 * mira un revisor de permisos.
 */
const desuscribirWebhookInstagram = async (pageAccessToken) => {
  if (!pageAccessToken) return { error: 'Sin token de página.' };
  try {
    await axios.delete(`${GRAPH_URL}/me/subscribed_apps`, {
      params: { access_token: pageAccessToken },
    });
    return { ok: true };
  } catch (error) {
    return { error: error.response?.data?.error?.message || error.message };
  }
};

/**
 * Responde un comentario de Instagram (crea una respuesta anidada).
 */
const responderComentarioInstagram = async (comentarioId, mensaje, accessToken) => {
  if (!configurado()) return { error: 'Instagram no está configurado todavía (falta aprobación de Meta).' };
  try {
    const { data } = await axios.post(`${GRAPH_URL}/${comentarioId.replace(/^ig_/, '')}/replies`, null, {
      params: { message: mensaje, access_token: accessToken },
    });
    return { ok: true, id: data.id };
  } catch (error) {
    return { error: error.response?.data?.error?.message || error.message };
  }
};

/**
 * Borra un comentario por id. Solo se usa para retirar RESPUESTAS PROPIAS y
 * poder reescribirlas — nunca para borrar el comentario de un cliente, que es
 * irreversible y suele escalar el conflicto (misma regla que en TikTok).
 */
const eliminarComentarioInstagram = async (comentarioId, accessToken) => {
  if (!configurado()) return { error: 'Instagram no está configurado.' };
  try {
    await axios.delete(`${GRAPH_URL}/${String(comentarioId).replace(/^ig_/, '')}`, {
      params: { access_token: accessToken },
    });
    return { ok: true };
  } catch (error) {
    return { error: error.response?.data?.error?.message || error.message };
  }
};

module.exports = {
  obtenerComentariosInstagram, responderComentarioInstagram,
  eliminarComentarioInstagram, configurado,
  obtenerCaptionPublicacion, suscribirWebhookInstagram, desuscribirWebhookInstagram,
  LIMITE_PUBLICACIONES, LIMITE_COMENTARIOS,
};
