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

// Comentarios por PÁGINA de resultados, no por publicación: lo que llega en una
// sola respuesta. Las publicaciones que traen más se siguen leyendo paginando
// (ver `paginarComentarios`), así que este número ya no es un techo, solo el
// tamaño del bocado. 50 es el valor que la propia documentación usa en sus
// ejemplos para esta arista.
const LIMITE_COMENTARIOS = 50;

// Techo REAL por publicación. Existe para acotar el gasto: una foto viral con
// 5.000 comentarios costaría 100 peticiones ella sola y se comería la cuota de
// la cuenta entera (el límite de la Graph API es por app y por hora, y la
// paginación cuenta como peticiones separadas).
//
// 300 cubre de sobra lo que publica un restaurante u hotel; lo que quede por
// encima llega igual por el webhook, que no tiene ventana ninguna.
const MAX_COMENTARIOS_POR_PUBLICACION = 300;

// Presupuesto de peticiones EXTRA por escaneo de una cuenta, repartido entre
// todas las publicaciones. Sin él, 25 publicaciones muy comentadas podrían
// disparar 150 peticiones en un solo ciclo y agotar la cuota para el resto de
// clientes, que comparten la misma app de Meta.
const MAX_PETICIONES_EXTRA = 40;

const configurado = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);

/**
 * Sigue paginando los comentarios de UNA publicación desde un cursor.
 *
 * ⚠️ Dos cosas de esta arista que obligan a escribirlo así:
 *  - La respuesta **no trae `paging.next`** de forma fiable, solo los cursores.
 *    Por eso el corte se decide con el cursor `after` y con el tamaño de la
 *    página: una página incompleta significa que ya no hay más.
 *  - Meta **no documenta el orden** en que devuelve los comentarios. Por eso no
 *    se asume que "los primeros son los nuevos" ni al revés: se pagina hasta
 *    agotar o hasta el techo. Si el orden fuera el más antiguo primero —que es
 *    lo que se observa— quedarse con la primera página significaría que en una
 *    publicación muy comentada los comentarios NUEVOS no se leen nunca.
 */
const paginarComentarios = async (mediaId, accessToken, cursorInicial, yaLeidos, presupuesto, porPagina) => {
  const extra = [];
  let cursor = cursorInicial;
  let total = yaLeidos;

  while (cursor && total < MAX_COMENTARIOS_POR_PUBLICACION && presupuesto.restante > 0) {
    presupuesto.restante--;
    const { data } = await axios.get(`${GRAPH_URL}/${mediaId}/comments`, {
      params: {
        fields: 'id,text,username,timestamp',
        limit: porPagina,
        after: cursor,
        access_token: accessToken,
      },
    });
    const pagina = data.data || [];
    extra.push(...pagina);
    total += pagina.length;

    // Página incompleta = no hay más. Y sin cursor no hay por dónde seguir.
    cursor = pagina.length === porPagina ? data.paging?.cursors?.after : null;
  }

  if (total >= MAX_COMENTARIOS_POR_PUBLICACION) {
    console.warn(`[Instagram] Publicación ${mediaId}: se alcanzó el techo de ${MAX_COMENTARIOS_POR_PUBLICACION} comentarios; el resto llega por webhook.`);
  }
  return extra;
};

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

    // Presupuesto compartido por todas las publicaciones de este escaneo: se va
    // gastando en las que lo necesitan, en vez de dar un cupo fijo a cada una.
    const presupuesto = { restante: MAX_PETICIONES_EXTRA };
    const comentarios = [];

    for (const media of data.data || []) {
      const propios = media.comments?.data || [];

      // Solo se pagina si la primera página vino LLENA. Las publicaciones
      // tranquilas —la mayoría— no cuestan ni una petición extra.
      let extra = [];
      if (propios.length === comentariosPorPublicacion) {
        try {
          extra = await paginarComentarios(
            media.id, accessToken,
            media.comments?.paging?.cursors?.after,
            propios.length, presupuesto, comentariosPorPublicacion,
          );
        } catch (e) {
          // Un fallo paginando no puede costar los comentarios que YA se leyeron
          // de esta publicación ni los de las demás: se registra y se sigue.
          console.error(`[Instagram] Paginando ${media.id}: ${e.response?.data?.error?.message || e.message}`);
        }
      }

      for (const c of [...propios, ...extra]) {
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

    if (presupuesto.restante === 0) {
      console.warn('[Instagram] Se agotó el presupuesto de peticiones extra en este escaneo; quedan comentarios sin leer (llegan por webhook o en el siguiente ciclo).');
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

/**
 * Perfil público de la cuenta de Instagram conectada: @usuario, nombre visible y
 * foto. Lo consume el panel para enseñar DE QUIÉN es la cuenta conectada, igual
 * que ya se hace con TikTok — un tablero que dice "Instagram" a secas no permite
 * al dueño detectar que conectó la cuenta equivocada.
 *
 * ⚠️ A diferencia de TikTok, esto NO se cachea en el modelo `Negocio`. Cachearlo
 * exigiría tres columnas nuevas y migrar la base de producción; la llamada es
 * una sola, solo ocurre al abrir la pestaña de Comentarios y el fallo es
 * inocuo. Si algún día se llama desde una ruta caliente, replicar el patrón de
 * `tiktokNombre/Avatar/Username`.
 *
 * Nunca lanza: si Meta falla, el panel enseña la cuenta como conectada sin
 * perfil, que es mejor que romper la pestaña entera.
 */
const obtenerPerfilInstagram = async (igUserId, accessToken) => {
  if (!configurado() || !igUserId || !accessToken) return null;
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${igUserId}`, {
      params: { fields: 'id,username,name,profile_picture_url', access_token: accessToken },
      timeout: 15000,
    });
    return {
      username: data.username || null,
      nombre: data.name || null,
      avatar: data.profile_picture_url || null,
      url: data.username ? `https://www.instagram.com/${data.username}` : null,
    };
  } catch {
    return null;
  }
};

module.exports = {
  obtenerComentariosInstagram, responderComentarioInstagram, obtenerPerfilInstagram,
  eliminarComentarioInstagram, configurado,
  obtenerCaptionPublicacion, suscribirWebhookInstagram, desuscribirWebhookInstagram,
  LIMITE_PUBLICACIONES, LIMITE_COMENTARIOS,
  MAX_COMENTARIOS_POR_PUBLICACION, MAX_PETICIONES_EXTRA,
};
