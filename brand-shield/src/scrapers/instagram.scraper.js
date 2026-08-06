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
// las 25 últimas no se ve. El arreglo de fondo son los webhooks de Instagram
// (campo `comments`), que avisan de cualquier publicación sin ventana ninguna;
// usan este mismo permiso `instagram_manage_comments`. Los webhooks solo
// notifican desde que se configuran, así que este barrido seguiría haciendo
// falta para el histórico al conectar una cuenta nueva.
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
  LIMITE_PUBLICACIONES, LIMITE_COMENTARIOS,
};
