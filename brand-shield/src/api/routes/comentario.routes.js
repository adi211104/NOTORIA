// brand-shield/src/api/routes/comentario.routes.js
// Comentarios que la gente deja en las publicaciones PROPIAS del negocio
// (videos de TikTok hoy; Instagram cuando Meta apruebe la key).
//
// A diferencia de las menciones, estos SÍ se responden desde Notoria: la API de
// la plataforma permite crear la respuesta. Por eso hay un POST /responder.
//
// Redes sociales = planes de pago, mismo criterio que redes.routes.js.

const express = require('express');
const prisma = require('../../lib/prisma');
const { autenticar } = require('../middlewares/auth.middleware');
const { verificarPlan } = require('../middlewares/verificarPlan.middleware');
const tiktok = require('../../scrapers/tiktok.scraper');
const { tokenTikTokVigente, estadoConexionTikTok } = require('../../lib/tiktokToken');
const tiktokBiz = require('../../scrapers/tiktokBusiness.scraper');
const { tokenTikTokBizVigente, estadoConexionTikTokBiz } = require('../../lib/tiktokBizToken');

const router = express.Router();

router.use(autenticar);
router.use(verificarPlan(['NEGOCIO', 'FRANQUICIA']));

const LIMITE_MAX = 200;
const MAX_LARGO_RESPUESTA = 500;

// Los videos se piden en vivo a TikTok (no hay tabla: no se responden ni se
// alertan, solo se muestran). Un caché corto en memoria evita una llamada por
// cada carga del tab sin volver la vista obsoleta — el usuario que acaba de
// publicar espera verlo enseguida.
// Ojo con subirlo: la portada de cada video es una URL firmada que caduca a las
// ~24h, así que el caché tiene que quedar MUY por debajo de eso.
const CACHE_VIDEOS_MS = 3 * 60 * 1000;
const cacheVideos = new Map(); // negocioId → { hasta, videos }

const videosDelNegocio = async (negocioId, conexion) => {
  if (!conexion?.token) return null;
  const enCache = cacheVideos.get(negocioId);
  if (enCache && enCache.hasta > Date.now()) return enCache.videos;

  const videos = conexion.modo === 'biz'
    ? await tiktokBiz.obtenerVideosTikTokBiz(conexion.businessId, conexion.token)
    : await tiktok.obtenerVideosTikTok(conexion.token);
  // Un fallo no se cachea: si fue temporal, la próxima carga vuelve a intentar.
  if (videos) cacheVideos.set(negocioId, { hasta: Date.now() + CACHE_VIDEOS_MS, videos });
  return videos;
};

/**
 * Resuelve por cuál de las dos APIs de TikTok se opera este negocio, renovando
 * el token si venció. La Accounts API manda porque es la única que lee y
 * responde comentarios; la Display queda para conexiones viejas todavía no
 * migradas (§15-octies).
 *
 * Devuelve { modo: 'biz'|'display', token, businessId } — con token null si no
 * hay conexión utilizable.
 */
const conexionTikTok = async (negocio) => {
  const tokenBiz = await tokenTikTokBizVigente(negocio);
  if (tokenBiz) return { modo: 'biz', token: tokenBiz, businessId: negocio.tiktokBizId };
  return { modo: 'display', token: await tokenTikTokVigente(negocio), businessId: null };
};

const negocioDelUsuario = (negocioId, usuarioId) =>
  prisma.negocio.findFirst({ where: { id: negocioId, usuarioId } });

// GET /api/comentarios/:negocioId
// ?sentimiento=negativo|positivo|neutro &plataforma=TIKTOK &pendientes=1 &limite=
router.get('/:negocioId', async (req, res, next) => {
  try {
    const negocio = await negocioDelUsuario(req.params.negocioId, req.usuario.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { sentimiento, plataforma, pendientes } = req.query;
    const limite = Math.min(Number(req.query.limite) || 50, LIMITE_MAX);

    const where = {
      negocioId: negocio.id,
      ...(sentimiento ? { sentimiento } : {}),
      ...(plataforma ? { plataforma } : {}),
      ...(pendientes === '1' ? { respondida: false } : {}),
    };

    // Token vigente: si venció (dura 24h) se renueva acá mismo, así abrir el tab
    // repara la conexión sin que el usuario tenga que reconectar. Devuelve null
    // si la cuenta no está conectada o si el refresh token ya no sirve — en ese
    // caso el helper limpia los tokens y `conectado` pasa a false, que es la
    // verdad: hay que volver a autorizar.
    const conexion = await conexionTikTok(negocio);
    const token = conexion.token;

    // Backfill del perfil: las cuentas que se conectaron ANTES de que existiera
    // este cache no tienen nombre guardado. Se pide una sola vez y se persiste;
    // no es un fetch por carga de página.
    let perfilNegocio = negocio;
    if (token && !negocio.tiktokNombre) {
      const perfil = conexion.modo === 'biz'
        ? await tiktokBiz.obtenerPerfilTikTokBiz(conexion.businessId, token)
        : await tiktok.obtenerPerfilTikTok(token);
      if (perfil?.nombre) {
        perfilNegocio = await prisma.negocio.update({
          where: { id: negocio.id },
          data: {
            tiktokNombre: perfil.nombre,
            tiktokAvatar: perfil.avatar,
            tiktokUsername: perfil.username,
            tiktokPerfilUrl: perfil.url,
          },
        });
      }
    }

    // Los videos no bloquean la respuesta: si TikTok falla, el tab igual carga
    // con los comentarios que ya estén guardados.
    const videos = await videosDelNegocio(negocio.id, conexion).catch(() => null);

    // Respaldo del @usuario cuando el perfil no se pudo leer.
    //
    // `user.info.profile` es un permiso OPCIONAL: en la pantalla de
    // consentimiento aparece como un interruptor que el dueño puede dejar
    // apagado, y entonces /business/get/ responde 40130 y el panel muestra un
    // "TikTok" genérico. Pero el `share_url` de cualquier video trae el handle
    // (https://www.tiktok.com/@usuario/video/123), así que al menos el @ se
    // recupera sin permiso alguno. El avatar sí requiere el scope: no hay de
    // dónde sacarlo.
    if (!perfilNegocio.tiktokUsername && videos?.length) {
      const handle = videos.map((v) => v.url).find(Boolean)?.match(/tiktok\.com\/@([\w.-]+)/)?.[1];
      if (handle) {
        perfilNegocio = await prisma.negocio.update({
          where: { id: negocio.id },
          data: {
            tiktokUsername: handle,
            tiktokPerfilUrl: perfilNegocio.tiktokPerfilUrl || `https://www.tiktok.com/@${handle}`,
            // El nombre visible se deja vacío a propósito si no lo tenemos: es
            // preferible mostrar el @ solo que inventar un nombre a partir de él.
          },
        });
      }
    }

    const [comentarios, total, negativos, sinResponder] = await Promise.all([
      prisma.comentarioSocial.findMany({
        where,
        orderBy: [{ fechaComentario: 'desc' }, { detectadoEn: 'desc' }],
        take: limite,
      }),
      prisma.comentarioSocial.count({ where: { negocioId: negocio.id } }),
      prisma.comentarioSocial.count({ where: { negocioId: negocio.id, sentimiento: 'negativo' } }),
      prisma.comentarioSocial.count({ where: { negocioId: negocio.id, respondida: false } }),
    ]);

    res.json({
      comentarios,
      resumen: { total, negativos, sinResponder },
      // Publicaciones propias. `null` = no se pudieron leer (sin cuenta, sin
      // permiso o TikTok caído); `[]` = la cuenta no tiene videos. El panel
      // distingue los dos casos igual que con los comentarios.
      videos,
      // Qué redes pueden traer comentarios para ESTE negocio, y de QUIÉN es la
      // cuenta. Sirve para que el panel sepa si mostrar "conecta tu cuenta" en vez
      // de "no hay comentarios", y para que se vea el perfil en lugar de un
      // "TikTok" genérico. Nunca se manda el access token.
      conexiones: {
        tiktok: {
          disponible: tiktokBiz.configurado() || tiktok.configurado(),
          conectado: !!(perfilNegocio.tiktokBizAccessToken || perfilNegocio.tiktokAccessToken),
          // Solo la Accounts API lee y responde comentarios. Sin esto el panel
          // mostraría el botón Responder a quien tiene una conexión Display
          // heredada, que fallaría al pulsarlo.
          comentarios: !!perfilNegocio.tiktokBizAccessToken,
        // 'ok' | 'vencida' | 'sin_conectar'. El panel decía "escuchando esta
        // cuenta" aunque el token estuviera muerto; con esto puede avisar.
        estado: perfilNegocio.tiktokBizAccessToken
          ? estadoConexionTikTokBiz(perfilNegocio)
          : estadoConexionTikTok(perfilNegocio),
          nombre: perfilNegocio.tiktokNombre || null,
          avatar: perfilNegocio.tiktokAvatar || null,
          username: perfilNegocio.tiktokUsername || null,
          url: perfilNegocio.tiktokPerfilUrl || null,
        },
      },
    });
  } catch (error) { next(error); }
});

// POST /api/comentarios/:id/moderar — { accion: 'ocultar'|'fijar'|'like', activar: bool }
//
// Ocultar es la acción que más valor tiene acá: retira un comentario tóxico de
// la vista pública sin borrarlo ni avisarle a su autor. Borrar existe en la API
// pero NO se expone: es irreversible y suele escalar el conflicto, así que no
// queremos que esté a un clic de distancia en un panel.
router.post('/:id/moderar', async (req, res, next) => {
  try {
    const { accion } = req.body || {};
    const activar = req.body?.activar !== false;
    if (!tiktokBiz.ACCIONES_MODERACION[accion]) {
      return res.status(400).json({ error: `Acción no soportada: ${accion}` });
    }

    const comentario = await prisma.comentarioSocial.findFirst({
      where: { id: req.params.id, negocio: { usuarioId: req.usuario.id } },
      include: { negocio: true },
    });
    if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (comentario.plataforma !== 'TIKTOK') {
      return res.status(400).json({ error: `Moderar en ${comentario.plataforma} todavía no está disponible` });
    }
    // Las tres acciones exigen el video_id además del comment_id.
    if (!comentario.publicacionId) {
      return res.status(422).json({
        error: 'Este comentario no tiene el video de origen guardado, así que no se puede moderar desde acá.',
      });
    }

    const conexion = await conexionTikTok(comentario.negocio);
    if (!conexion.token || conexion.modo !== 'biz') {
      return res.status(409).json({
        error: 'Para moderar comentarios hay que reconectar TikTok desde Conexiones.',
      });
    }

    const r = await tiktokBiz.moderarComentarioTikTokBiz(
      accion, conexion.businessId, conexion.token,
      comentario.publicacionId, comentario.externalId, activar,
    );
    // Solo se guarda si la plataforma confirmó: si guardáramos igual, el panel
    // diría "oculto" y en TikTok el comentario seguiría a la vista.
    if (r.error) return res.status(502).json({ error: r.error });

    // `like` no se persiste: no hay columna y el estado lo resincroniza el
    // worker desde TikTok. Ocultar y fijar sí, para que el botón no "salte"
    // hasta el próximo escaneo.
    const campo = { ocultar: 'oculto', fijar: 'fijado' }[accion];
    const actualizado = campo
      ? await prisma.comentarioSocial.update({ where: { id: comentario.id }, data: { [campo]: activar } })
      : comentario;

    res.json({ ok: true, comentario: actualizado });
  } catch (error) { next(error); }
});

// POST /api/comentarios/:id/responder — { respuesta }
router.post('/:id/responder', async (req, res, next) => {
  try {
    const comentario = await prisma.comentarioSocial.findFirst({
      where: { id: req.params.id, negocio: { usuarioId: req.usuario.id } },
      include: { negocio: true },
    });
    if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' });

    const respuesta = String(req.body?.respuesta || '').trim();
    if (!respuesta) return res.status(400).json({ error: 'La respuesta no puede estar vacía' });
    if (respuesta.length > MAX_LARGO_RESPUESTA) {
      return res.status(400).json({ error: `La respuesta no puede pasar de ${MAX_LARGO_RESPUESTA} caracteres` });
    }
    if (comentario.respondida) {
      return res.status(409).json({ error: 'Este comentario ya fue respondido' });
    }

    if (comentario.plataforma !== 'TIKTOK') {
      return res.status(400).json({ error: `Responder en ${comentario.plataforma} todavía no está disponible` });
    }
    // La API de TikTok exige el video_id además del comment_id. Los comentarios
    // guardados sin publicacionId son de solo lectura — no se puede inventar.
    if (!comentario.publicacionId) {
      return res.status(422).json({
        error: 'Este comentario no tiene el video de origen guardado, así que no se puede responder desde acá.',
      });
    }
    // Renueva el token si venció. Si devuelve null la cuenta hay que reconectarla:
    // mejor un 409 claro que un 502 con "access_token_invalid" de TikTok.
    const conexion = await conexionTikTok(comentario.negocio);
    if (!conexion.token) {
      return res.status(409).json({
        error: 'La conexión con TikTok expiró. Vuelve a conectar la cuenta desde Conexiones para poder responder.',
      });
    }
    // Responder solo existe en la Accounts API. Si el negocio sigue con la
    // conexión vieja de Display, la llamada fallaría con un 404 de TikTok; es
    // más honesto pedirle que reconecte y decirle por qué.
    if (conexion.modo !== 'biz') {
      return res.status(409).json({
        error: 'Para responder comentarios hay que reconectar TikTok desde Conexiones: la conexión actual es de solo lectura.',
      });
    }

    const r = await tiktokBiz.responderComentarioTikTokBiz(
      conexion.businessId,
      conexion.token,
      comentario.publicacionId,
      comentario.externalId,
      respuesta,
    );
    // Solo se marca como respondida si la plataforma confirmó. Si guardáramos
    // igual, el panel diría "respondido" y en TikTok no habría nada.
    if (r.error) return res.status(502).json({ error: r.error });

    const actualizado = await prisma.comentarioSocial.update({
      where: { id: comentario.id },
      data: {
        respondida: true,
        respuesta,
        vista: true,
        // Id que TikTok le dio a esta respuesta. Es lo único con lo que se puede
        // borrar después, así que se guarda ahora: recuperarlo más tarde obliga
        // a recorrer el hilo entero.
        respuestaExternalId: r.id || null,
      },
    });
    res.json({ mensaje: 'Respuesta publicada', comentario: actualizado });
  } catch (error) { next(error); }
});

// DELETE /api/comentarios/:id/respuesta
//
// Retira la respuesta que el negocio publicó, para poder reescribirla. Borra en
// TikTok y deja el comentario otra vez como pendiente.
//
// Solo borra respuestas PROPIAS. El comentario del cliente no se toca: para eso
// está Ocultar, que lo retira de la vista pública sin borrarlo ni avisarle a su
// autor. Borrar la crítica de un cliente es irreversible y suele escalar el
// conflicto, así que no existe ese botón.
router.delete('/:id/respuesta', async (req, res, next) => {
  try {
    const comentario = await prisma.comentarioSocial.findFirst({
      where: { id: req.params.id, negocio: { usuarioId: req.usuario.id } },
      include: { negocio: true },
    });
    if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (!comentario.respondida) return res.status(409).json({ error: 'Este comentario no tiene respuesta.' });

    // Las respuestas anteriores al 2026-08-06 se guardaron sin el id de TikTok.
    // El worker lo rellena al leer el hilo, así que esto se resuelve solo en el
    // próximo escaneo — conviene decirlo en vez de dar un error opaco.
    if (!comentario.respuestaExternalId) {
      return res.status(422).json({
        error: 'Esta respuesta se publicó antes de que guardáramos su identificador. Se podrá borrar tras el próximo escaneo, o puedes borrarla desde la app de TikTok.',
      });
    }

    const conexion = await conexionTikTok(comentario.negocio);
    if (!conexion.token || conexion.modo !== 'biz') {
      return res.status(409).json({ error: 'Para borrar respuestas hay que reconectar TikTok desde Conexiones.' });
    }

    const r = await tiktokBiz.eliminarComentarioTikTokBiz(
      conexion.businessId, conexion.token, comentario.respuestaExternalId,
    );
    // Si TikTok no confirmó, no se limpia nada: el panel diría "sin responder"
    // mientras la respuesta sigue publicada.
    if (r.error) return res.status(502).json({ error: r.error });

    const actualizado = await prisma.comentarioSocial.update({
      where: { id: comentario.id },
      data: { respondida: false, respuesta: null, respuestaExternalId: null },
    });
    res.json({ mensaje: 'Respuesta eliminada', comentario: actualizado });
  } catch (error) { next(error); }
});

// PATCH /api/comentarios/:id — { vista }
router.patch('/:id', async (req, res, next) => {
  try {
    const comentario = await prisma.comentarioSocial.findFirst({
      where: { id: req.params.id, negocio: { usuarioId: req.usuario.id } },
    });
    if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' });

    if (req.body?.vista === undefined) return res.status(400).json({ error: 'Nada que actualizar' });

    const actualizado = await prisma.comentarioSocial.update({
      where: { id: comentario.id },
      data: { vista: !!req.body.vista },
    });
    res.json(actualizado);
  } catch (error) { next(error); }
});

module.exports = router;
