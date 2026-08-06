// brand-shield/src/workers/monitoreo.worker.js
// Revisa todos los negocios activos cada 4 horas
// y dispara alertas cuando detecta anomalías

const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { obtenerResenasGoogle, buscarNegocioEnGoogle } = require('../scrapers/google.scraper');
const { obtenerRatingFacebook, obtenerResenasFacebook } = require('../scrapers/facebook.scraper');
const { analizarResena, detectarAnomalias } = require('../nlp/detector');
const { notificar, enviarAlertaTelegram } = require('../alerts/notificador');
const whatsapp = require('../lib/whatsappMeta');

// Intenta publicar la auto-respuesta aprobada por el usuario para una reseña
// positiva (4-5★) recién detectada. Requiere que el negocio tenga Google
// Business Profile conectado — es el único canal que permite publicar la
// respuesta automáticamente en Google Maps sin intervención humana.
const intentarAutoRespuesta = async (negocio, resenaCreada) => {
  if (!negocio.gbpAccessToken || !negocio.gbpAccountId || !negocio.gbpLocationId) {
    console.warn(`[AutoRespuesta] ${negocio.nombre}: sin Google Business Profile conectado, se omite.`);
    return;
  }
  if (!negocio.autoRespuestaPlantilla) return;

  try {
    const { obtenerResenasGBP, responderResenaGBP } = require('../scrapers/google-business.scraper');

    // El scraper público (obtenerResenasGoogle) y la API de GBP usan IDs de
    // reseña distintos para la misma reseña — hay que resolver el ID real de
    // GBP buscando por autor + rating + fecha antes de poder responder.
    const gbp = await obtenerResenasGBP(negocio.gbpAccountId, negocio.gbpLocationId, negocio.gbpAccessToken, negocio.gbpRefreshToken);
    if (gbp.error) {
      console.error(`[AutoRespuesta] ${negocio.nombre}: no se pudo leer reseñas de GBP (${gbp.error})`);
      return;
    }

    const unDiaMs = 24 * 60 * 60 * 1000;
    const coincidencia = gbp.resenas.find((r) =>
      !r.respuestaExistente &&
      r.rating === resenaCreada.rating &&
      (r.autorNombre || '').trim().toLowerCase() === (resenaCreada.autorNombre || '').trim().toLowerCase() &&
      Math.abs(new Date(r.fechaResena).getTime() - new Date(resenaCreada.fechaResena).getTime()) < unDiaMs
    );
    if (!coincidencia) {
      console.warn(`[AutoRespuesta] ${negocio.nombre}: no se encontró la reseña equivalente en GBP, se omite.`);
      return;
    }

    const texto = negocio.autoRespuestaPlantilla.replace(/\{\{autor\}\}/g, resenaCreada.autorNombre || 'cliente');
    const resultado = await responderResenaGBP(
      negocio.gbpAccountId, negocio.gbpLocationId,
      coincidencia.externalId, texto,
      negocio.gbpAccessToken, negocio.gbpRefreshToken
    );
    if (resultado.error) {
      console.error(`[AutoRespuesta] ${negocio.nombre}: ${resultado.error}`);
      return;
    }
    if (resultado.tokenRefrescado) {
      await prisma.negocio.update({ where: { id: negocio.id }, data: { gbpAccessToken: resultado.tokenRefrescado } });
    }
    await prisma.resena.update({ where: { id: resenaCreada.id }, data: { respondida: true, respuesta: texto } });
    console.log(`[AutoRespuesta] ${negocio.nombre}: respuesta automática publicada (autor: ${resenaCreada.autorNombre || 'anónimo'})`);
  } catch (error) {
    console.error(`[AutoRespuesta] Error en ${negocio.nombre}: ${error.message}`);
  }
};


/**
 * Procesa un negocio: obtiene reseñas, guarda nuevas, detecta anomalías y notifica
 */
const procesarNegocio = async (negocio) => {
  console.log(`[Worker] Procesando: ${negocio.nombre} (${negocio.id})`);

  // ── GOOGLE ────────────────────────────────────────────────
  if (negocio.googlePlaceId) {
    const datos = await obtenerResenasGoogle(negocio.googlePlaceId);
    if (datos) {
      // Guardar snapshot del estado actual
      await prisma.snapshot.create({
        data: {
          plataforma: 'GOOGLE',
          ratingActual: datos.ratingActual,
          totalResenas: datos.totalResenas,
          negocioId: negocio.id,
        },
      });

      // Guardar reseñas nuevas (ignorar duplicados por el unique constraint)
      for (const resena of datos.resenas) {
        const analisis = analizarResena(resena);
        const yaExistia = await prisma.resena.findUnique({
          where: { plataforma_externalId: { plataforma: 'GOOGLE', externalId: resena.externalId } },
        });
        if (yaExistia) continue;

        let resenaCreada;
        try {
          resenaCreada = await prisma.resena.create({
            data: {
              plataforma: 'GOOGLE',
              externalId: resena.externalId,
              rating: resena.rating,
              texto: resena.texto,
              autorNombre: resena.autorNombre,
              autorFoto: resena.autorFoto || null,
              autorResenasTotal: resena.autorResenasTotal,
              fechaResena: resena.fechaResena,
              esSospechosa: analisis.esSospechosa,
              motivoSospecha: analisis.motivoSospecha,
              negocioId: negocio.id,
            },
          });
        } catch (e) {
          continue; // ya existe (condición de carrera con otro ciclo) — ignorar
        }

        // Auto-respuesta a reseñas positivas — solo planes Negocio/Franquicia
        if (resenaCreada.rating >= 4 && negocio.autoRespuestaActiva && negocio.usuario.plan !== 'GRATIS') {
          await intentarAutoRespuesta(negocio, resenaCreada);
        }
      }

      // Detectar anomalías y crear alertas
      const alertasDetectadas = await detectarAnomalias(negocio.id, 'GOOGLE', datos);
      for (const alertaData of alertasDetectadas) {
        const alerta = await prisma.alerta.create({ data: alertaData });

        // Notificar al usuario
        await notificar({
          usuario: negocio.usuario,
          negocio,
          alerta: { ...alerta, ...alertaData },
        });

        // Marcar alerta como notificada
        await prisma.alerta.update({
          where: { id: alerta.id },
          data: { notificada: true },
        });
      }
    }
  }

  // ── FACEBOOK ──────────────────────────────────────────────
  if (negocio.facebookPageId && negocio.facebookAccessToken) {
    // Verificar que el token no haya expirado
    const tokenExpirado = negocio.facebookTokenExpira && new Date() > negocio.facebookTokenExpira;

    if (tokenExpirado) {
      console.warn(`[Worker] Token de Facebook expirado para ${negocio.nombre}`);
      // Notificar al usuario que reconecte Facebook
      await notificar({
        usuario: negocio.usuario,
        negocio,
        alerta: {
          tipo: 'RESENA_MUY_NEGATIVA',
          plataforma: 'FACEBOOK',
          descripcion: 'Tu conexión con Facebook expiró. Reconecta tu página para continuar el monitoreo.',
        },
      });
      return;
    }

    const rating = await obtenerRatingFacebook(negocio.facebookPageId, negocio.facebookAccessToken);
    if (rating) {
      await prisma.snapshot.create({
        data: {
          plataforma: 'FACEBOOK',
          ratingActual: rating.ratingActual,
          totalResenas: rating.totalResenas,
          negocioId: negocio.id,
        },
      });
    }

    const resenas = await obtenerResenasFacebook(negocio.facebookPageId, negocio.facebookAccessToken);
    if (resenas && !resenas.tokenExpirado) {
      for (const resena of resenas) {
        const analisis = analizarResena(resena);
        try {
          await prisma.resena.upsert({
            where: {
              plataforma_externalId: {
                plataforma: 'FACEBOOK',
                externalId: resena.externalId,
              },
            },
            update: {},
            create: {
              plataforma: 'FACEBOOK',
              externalId: resena.externalId,
              rating: resena.rating,
              texto: resena.texto,
              autorNombre: resena.autorNombre,
              fechaResena: resena.fechaResena,
              esSospechosa: analisis.esSospechosa,
              motivoSospecha: analisis.motivoSospecha,
              negocioId: negocio.id,
            },
          });
        } catch (e) {
          // Ignorar duplicados
        }
      }

      const alertasFB = await detectarAnomalias(negocio.id, 'FACEBOOK', rating);
      for (const alertaData of alertasFB) {
        const alerta = await prisma.alerta.create({ data: alertaData });
        await notificar({ usuario: negocio.usuario, negocio, alerta: { ...alerta, ...alertaData } });
        await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
      }
    }
  }

  // ── COMENTARIOS EN PUBLICACIONES PROPIAS ─────────────────
  await procesarComentariosSociales(negocio);

  // ── MENCIONES ────────────────────────────────────────────
  // Contenido de terceros que habla de la marca fuera de su ficha.
  // Se llama siempre: cada fuente trae su propio guard y sin credenciales no
  // hace ninguna llamada de red.
  await procesarMenciones(negocio);

  // ── COMPETIDORES ─────────────────────────────────────────
  // Refresca rating y total de reseñas de cada competidor en el mismo ciclo
  try {
    const competidores = await prisma.competidor.findMany({ where: { negocioId: negocio.id } });
    for (const comp of competidores) {
      const info = await buscarNegocioEnGoogle(comp.googlePlaceId);
      if (!info) continue;
      await prisma.competidor.update({
        where: { id: comp.id },
        data: { ratingActual: info.rating, totalResenas: info.totalResenas },
      });
      await prisma.snapshotCompetidor.create({
        data: { ratingActual: info.rating, totalResenas: info.totalResenas, competidorId: comp.id },
      });
    }
  } catch (e) {
    console.error(`[Worker] Error actualizando competidores de ${negocio.nombre}: ${e.message}`);
  }
};

/**
 * Inicia el cron job que corre cada 4 horas
 * '0 *\/4 * * *' = a las 0:00, 4:00, 8:00, 12:00, 16:00 y 20:00
 */
const iniciarMonitoreo = () => {
  cron.schedule('0 */4 * * *', async () => {
    console.log(`\n[Worker] ⏰ Iniciando ciclo de monitoreo — ${new Date().toISOString()}`);

    try {
      const negocios = await prisma.negocio.findMany({
        where: { activo: true },
        include: {
          usuario: {
            select: {
              id: true,
              email: true,
              nombre: true,
              telegramChatId: true,
              prefsAlertas: true,
              plan: true,
            },
          },
        },
      });

      console.log(`[Worker] Procesando ${negocios.length} negocio(s)...`);

      // Procesar secuencialmente para no saturar las APIs
      for (const negocio of negocios) {
        await procesarNegocio(negocio);
        // Pausa de 1 segundo entre negocios para respetar rate limits
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(`[Worker] ✅ Ciclo completado`);
    } catch (error) {
      console.error(`[Worker] ❌ Error en ciclo: ${error.message}`);
    }
  });

  console.log('[Worker] Cron job configurado: cada 4 horas');
};

// Permite ejecutar el monitoreo manualmente (útil para pruebas)
const ejecutarAhora = async (negocioId = null) => {
  console.log('[Worker] Ejecución manual iniciada...');
  const where = negocioId ? { activo: true, id: negocioId } : { activo: true };
  const negocios = await prisma.negocio.findMany({
    where,
    include: {
      usuario: { select: { id: true, email: true, nombre: true, telegramChatId: true, prefsAlertas: true, plan: true } },
    },
  });
  for (const negocio of negocios) {
    await procesarNegocio(negocio);
  }
  console.log('[Worker] Ejecución manual completada.');
};

// ── Comentarios en publicaciones propias (TikTok) ─────────
// `obtenerComentariosTikTok` existía desde el principio y, igual que las
// menciones, NUNCA se llamaba: los comentarios no tenían dónde guardarse porque
// no existía el modelo. Ahora entra en el ciclo de escaneo.
const tiktokComentarios = require('../scrapers/tiktok.scraper');
const { tokenTikTokVigente } = require('../lib/tiktokToken');
const tiktokBiz = require('../scrapers/tiktokBusiness.scraper');
const { tokenTikTokBizVigente } = require('../lib/tiktokBizToken');
const instagram = require('../scrapers/instagram.scraper');
const { clasificar } = require('../nlp/sentimiento');

// Una entrada por red.
//
// `moderacionRemota` dice si la fuente informa el estado de ocultado/fijado tal
// como está HOY en la plataforma. Solo TikTok lo hace. Sin esta distinción, una
// fuente que no lo reporta pisaría esos campos en cada escaneo con valores que
// no ha comprobado.
const FUENTES_COMENTARIOS = [
  {
    id: 'TIKTOK',
    nombre: 'TikTok',
    moderacionRemota: true,
    // Devuelve null si falta credencial o la cuenta no está conectada.
    // El token se renueva acá si venció (dura 24h): sin esto el escaneo llamaba
    // a TikTok con un token muerto y traía cero sin decir por qué.
    //
    // Se prueba PRIMERO la Accounts API y solo se cae a la Display si el negocio
    // no la tiene conectada (§15-octies). Motivo: la Display API **no expone
    // comentarios** — `/v2/comment/list/` no existe — así que por esa vía esta
    // función siempre devolvió una lista vacía. Las conexiones viejas siguen
    // pasando por acá para no romperlas, pero no traen nada hasta que el dueño
    // reconecte; el panel se lo indica con `tiktokComentariosActivos`.
    obtener: async (negocio) => {
      const tokenBiz = await tokenTikTokBizVigente(negocio);
      if (tokenBiz) {
        return tiktokBiz.obtenerComentariosTikTokBiz(negocio.tiktokBizId, tokenBiz);
      }
      const token = await tokenTikTokVigente(negocio);
      if (!token) return null;
      return tiktokComentarios.obtenerComentariosTikTok(negocio.tiktokOpenId, token);
    },
    // Normaliza los nombres de campo del scraper al modelo. TikTok habla de
    // video/videoTitulo, Instagram de publicacion/caption; el modelo usa uno solo.
    aFila: (c) => ({
      externalId: c.externalId,
      texto: c.texto,
      autorNombre: c.autorNombre,
      publicacionId: c.videoId || null,
      publicacionTitulo: c.videoTitulo || null,
      fechaComentario: c.fechaComentario || null,
      // El dueño puede haber respondido desde la app de TikTok, sin pasar por
      // Notoria. Si es así entra ya marcado como respondido, en vez de quedarse
      // eternamente en la cola de pendientes.
      respondida: !!c.respuestaDueno,
      respuesta: c.respuestaDueno || null,
      respuestaExternalId: c.respuestaDuenoId || null,
      // Estado de moderación tal como está HOY en la plataforma. La fuente de
      // verdad es TikTok, no nuestra base: el dueño puede ocultar o fijar desde
      // la app y el panel tiene que reflejarlo.
      oculto: !!c.oculto,
      fijado: !!c.fijado,
    }),
  },
  {
    id: 'INSTAGRAM',
    nombre: 'Instagram',
    // La Graph API sí permite ocultar comentarios, pero el scraper no lee ese
    // estado, así que Instagram no declara `moderacionRemota`: el panel tampoco
    // ofrece moderar en esta red (comentario.routes.js lo corta con un 400).
    obtener: async (negocio) => {
      // null = cuenta sin conectar. El token es el de la PÁGINA de Facebook
      // ligada a la cuenta de Instagram, que es lo que guarda el callback OAuth.
      if (!negocio.instagramUserId || !negocio.instagramAccessToken) return null;
      return instagram.obtenerComentariosInstagram(negocio.instagramUserId, negocio.instagramAccessToken);
    },
    // Instagram habla de publicacion/caption y TikTok de video/videoTitulo; el
    // modelo usa un solo par de nombres.
    aFila: (c) => ({
      externalId: c.externalId,
      texto: c.texto,
      autorNombre: c.autorNombre,
      publicacionId: c.publicacionId || null,
      publicacionTitulo: c.publicacionCaption || null,
      fechaComentario: c.fechaComentario || null,
      // El scraper pide `comments{...}` de cada media, que no distingue si una
      // respuesta es del dueño. Todo entra como pendiente; el día que se lean
      // los hilos, esto se rellena igual que en TikTok.
      respondida: false,
      respuesta: null,
      respuestaExternalId: null,
    }),
  },
];

// Guarda UN comentario ya normalizado y dispara la alerta si toca.
//
// Vive fuera del bucle del escaneo porque tiene un segundo consumidor: el
// webhook de Instagram (`webhooks.routes.js`), que recibe comentarios sueltos en
// el momento en que se publican. Los dos caminos tienen que dedupear, clasificar
// y alertar EXACTAMENTE igual — si se duplicara esta lógica, un comentario
// llegado por webhook podría no alertar, o alertar dos veces al llegar después
// por el barrido periódico.
//
// Devuelve 'creado' | 'actualizado' | 'sin-cambios'.
const guardarComentarioSocial = async (negocio, fuente, crudo) => {
  const fila = fuente.aFila(crudo);
  const existente = await prisma.comentarioSocial.findUnique({
    where: { externalId: fila.externalId },
  });
  // No se pisa lo ya guardado: sobrescribir la fila borraría la respuesta
  // que el usuario ya escribió y el flag de vista.
  //
  // Única excepción: si el comentario figura como pendiente pero TikTok
  // dice que el dueño YA respondió (lo hizo desde la app, no desde acá),
  // se sincroniza ese hecho. Se tocan solo esos dos campos, y solo en esa
  // dirección — nunca se desmarca algo ya respondido, porque una lectura
  // fallida de TikTok reabriría comentarios cerrados.
  if (existente) {
    const cambios = {};
    if (!existente.respondida && fila.respondida) {
      cambios.respondida = true;
      cambios.respuesta = fila.respuesta;
    }
    // Backfill del id de la respuesta: las guardadas antes del 2026-08-06
    // no lo tienen y sin él no se pueden borrar desde el panel. Se rellena
    // en cuanto el hilo la devuelve, sin tocar nada más.
    if (!existente.respuestaExternalId && fila.respuestaExternalId) {
      cambios.respuestaExternalId = fila.respuestaExternalId;
    }
    // La moderación sí se sincroniza en AMBAS direcciones, al revés que
    // `respondida`: acá la plataforma es la fuente de verdad y desocultar
    // en la app debe reflejarse en el panel. No hay nada del usuario que
    // pisar. Solo para fuentes que informan ese estado: si no lo leen, no
    // pueden desmentirlo.
    if (fuente.moderacionRemota) {
      if (fila.oculto !== existente.oculto) cambios.oculto = fila.oculto;
      if (fila.fijado !== existente.fijado) cambios.fijado = fila.fijado;
    }

    if (Object.keys(cambios).length) {
      await prisma.comentarioSocial.update({ where: { id: existente.id }, data: cambios });
      if (cambios.respondida) {
        console.log(`[Comentarios ${fuente.id}] ${negocio.nombre}: uno ya respondido en la app, sincronizado.`);
      }
      return 'actualizado';
    }
    return 'sin-cambios';
  }

  const sentimiento = clasificar(fila.texto);
  const comentario = await prisma.comentarioSocial.create({
    data: { ...fila, plataforma: fuente.id, sentimiento, negocioId: negocio.id },
  });

  // Un comentario negativo que el dueño YA respondió por su cuenta no
  // necesita alerta: la alerta existe para que reaccione, y ya reaccionó.
  // Mandarla igual sería avisarle por correo y WhatsApp de algo que acaba
  // de resolver, que es la clase de ruido que hace que la gente empiece a
  // ignorar las notificaciones.
  if (sentimiento === 'negativo' && !fila.respondida) {
    const alerta = await prisma.alerta.create({
      data: {
        tipo: 'COMENTARIO_NEGATIVO',
        plataforma: fuente.id,
        descripcion: `Comentario negativo en ${fuente.nombre} de ${fila.autorNombre || 'un usuario'}: "${(fila.texto || '').slice(0, 80)}…"`,
        detalle: { comentarioId: comentario.id, plataforma: fuente.id, publicacionId: fila.publicacionId },
        negocioId: negocio.id,
      },
    });
    await notificar({ usuario: negocio.usuario, negocio, alerta });
    await prisma.comentarioSocial.update({ where: { id: comentario.id }, data: { notificada: true } });
    await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
  }

  return 'creado';
};

const procesarComentariosSociales = async (negocio) => {
  // Redes sociales = planes de pago, igual que la conexión en redes.routes.js
  if (negocio.usuario?.plan === 'GRATIS') return;

  for (const fuente of FUENTES_COMENTARIOS) {
    let crudos;
    try {
      crudos = await fuente.obtener(negocio);
    } catch (error) {
      console.error(`[Comentarios ${fuente.id}] ${negocio.nombre}: ${error.message}`);
      continue;
    }
    // null = no configurado o cuenta sin conectar. [] = conectado y sin novedades.
    if (!crudos || !crudos.length) continue;

    let nuevos = 0;
    for (const crudo of crudos) {
      try {
        if (await guardarComentarioSocial(negocio, fuente, crudo) === 'creado') nuevos++;
      } catch (e) {
        console.error(`[Comentarios ${fuente.id}] ${negocio.nombre}: ${e.message}`);
      }
    }

    if (nuevos) {
      console.log(`[Comentarios ${fuente.id}] ${negocio.nombre}: ${nuevos} comentario(s) nuevo(s)`);
    }
  }
};

// ── Escucha de menciones (TikTok) ─────────────────────────
// Ojo al historial: esto vivía como `procesarMencionesTwitter`, definido pero
// NUNCA invocado — la tabla `menciones` jamás se llenó y no había panel que la
// leyera. Ahora se llama desde procesarNegocio(). X/Twitter se eliminó del
// producto (2026-07-29): X cerró el tier gratuito de lectura en febrero de 2026,
// así que era tan de pago como TikTok y no aportaba una fuente sin costo.
const tiktokMenciones = require('../scrapers/tiktokMenciones.scraper');
const instagramMenciones = require('../scrapers/instagramMenciones.scraper');
const { construirTerminos } = require('../lib/menciones');

const NOMBRE_FUENTE = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram' };

const procesarMenciones = async (negocio) => {
  // Escucha social = planes de pago, igual que la conexión de redes
  if (negocio.usuario?.plan === 'GRATIS') return;
  if (negocio.mencionesActivas === false) return;

  const terminos = construirTerminos(negocio);

  // Cada fuente devuelve [] si no está disponible, así que esto no cuesta nada
  // mientras falte el proveedor o la cuenta no esté conectada.
  //
  // ⚠️ Los términos son SOLO de TikTok, que busca por palabra clave. Instagram
  // no busca: recibe las publicaciones donde etiquetaron a la cuenta. Por eso el
  // corte por `terminos.length` va aquí dentro y no arriba — si cortara el
  // método entero, un negocio sin términos válidos se quedaría también sin las
  // menciones de Instagram, que no dependen de ellos.
  const [deTikTok, deInstagram] = await Promise.all([
    terminos.length
      ? tiktokMenciones.buscarMencionesTikTok(terminos).catch(() => [])
      : Promise.resolve([]),
    instagramMenciones
      .buscarMencionesInstagram(negocio.instagramUserId, negocio.instagramAccessToken)
      .catch(() => []),
  ]);

  const encontradas = [
    ...deTikTok.map((m) => ({ ...m, plataforma: 'TIKTOK' })),
    ...deInstagram.map((m) => ({ ...m, plataforma: 'INSTAGRAM' })),
  ];

  for (const m of encontradas) {
    try {
      // upsert con update vacío: si ya la teníamos, no se pisan los flags de
      // vista/archivada que el usuario haya puesto en el panel.
      const { mencion, creada } = await guardarMencion(negocio, m);

      // Solo se alerta lo negativo, y una sola vez por mención. Sin el flag
      // `notificada` cada ciclo de 4h reenviaría el mismo correo.
      if (creada && mencion.sentimiento === 'negativo') {
        const fuente = NOMBRE_FUENTE[m.plataforma] || m.plataforma;
        const alerta = await prisma.alerta.create({
          data: {
            tipo: 'MENCION_NEGATIVA',
            plataforma: m.plataforma,
            descripcion: `Nueva mención negativa en ${fuente} de ${m.autorHandle || m.autorNombre || 'un usuario'}: "${(m.texto || '').slice(0, 80)}…"`,
            detalle: { url: m.url, mencionId: mencion.id, plataforma: m.plataforma },
            negocioId: negocio.id,
          },
        });
        await notificar({ usuario: negocio.usuario, negocio, alerta });
        await prisma.mencion.update({ where: { id: mencion.id }, data: { notificada: true } });
        await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
      }
    } catch (e) {
      console.error(`[Menciones] ${negocio.nombre}: ${e.message}`);
    }
  }

  if (encontradas.length) {
    console.log(`[Menciones] ${negocio.nombre}: ${encontradas.length} mención(es) procesada(s)`);
  }
};

/**
 * Guarda la mención si es nueva. Devuelve { mencion, creada } — `creada` es lo
 * que decide si corresponde alertar: una mención vieja que vuelve a aparecer en
 * la búsqueda no debe volver a notificar.
 */
const guardarMencion = async (negocio, m) => {
  const existente = await prisma.mencion.findUnique({ where: { externalId: m.externalId } });
  if (existente) {
    // Las métricas sí se refrescan: un video puede volverse viral después de
    // detectado, y eso cambia su prioridad en el panel.
    if (m.metricas) {
      const mencion = await prisma.mencion.update({
        where: { id: existente.id },
        data: { metricas: m.metricas },
      });
      return { mencion, creada: false };
    }
    return { mencion: existente, creada: false };
  }

  const mencion = await prisma.mencion.create({
    data: {
      plataforma: m.plataforma,
      externalId: m.externalId,
      texto: m.texto,
      autorNombre: m.autorNombre,
      autorHandle: m.autorHandle,
      url: m.url,
      sentimiento: m.sentimiento,
      fechaMencion: m.fechaMencion || null,
      contexto: m.contexto || null,
      metricas: m.metricas || undefined,
      negocioId: negocio.id,
    },
  });
  return { mencion, creada: true };
};

// ── Cron mensual para reportes PDF ──────────────────────
const iniciarReportesMensuales = () => {
  // Corre el día 1 de cada mes a las 8:00 AM
  cron.schedule('0 8 1 * *', async () => {
    console.log('[Reportes] Generando reportes mensuales...');
    const { enviarReporteMensual } = require('../utils/reporte.generator');

    const negocios = await prisma.negocio.findMany({
      where: {
        activo: true,
        usuario: { plan: { in: ['NEGOCIO', 'FRANQUICIA'] } },
      },
      include: {
        usuario: { select: { id: true, email: true, nombre: true, idioma: true } },
        snapshots: { orderBy: { tomadoEn: 'desc' }, take: 30 },
        alertas: { where: { creadaEn: { gte: new Date(new Date().setDate(1)) } } },
        resenas: { where: { detectadaEn: { gte: new Date(new Date().setDate(1)) } } },
      },
    });

    for (const negocio of negocios) {
      await enviarReporteMensual(negocio.usuario, negocio, {
        snapshots: negocio.snapshots,
        alertas: negocio.alertas,
        resenas: negocio.resenas,
      });
      await new Promise(r => setTimeout(r, 2000));
    }
  });
  console.log('[Reportes] Cron mensual configurado: día 1 de cada mes');
};

// ── Resúmenes de alertas (frecuencia semanal/mensual) ─────
// Corre todos los días a las 8:00 y envía el resumen a quienes lo configuraron
const iniciarResumenesAlertas = () => {
  cron.schedule('0 8 * * *', async () => {
    const { enviarResumenAlertas } = require('../utils/emails');
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const esPrimeroDeMes = hoy.getDate() === 1;

    try {
      const usuarios = await prisma.usuario.findMany({
        where: { prefsAlertas: { not: null } },
        select: { id: true, email: true, nombre: true, prefsAlertas: true },
      });

      for (const u of usuarios) {
        const prefs = u.prefsAlertas;
        const tocaSemanal = prefs?.frecuencia === 'SEMANAL' && (prefs.diaSemana ?? 1) === diaSemana;
        const tocaMensual = prefs?.frecuencia === 'MENSUAL' && esPrimeroDeMes;
        if (!tocaSemanal && !tocaMensual) continue;

        const desde = new Date(Date.now() - (tocaSemanal ? 7 : 30) * 24 * 60 * 60 * 1000);
        const tiposActivos = ['PICO_RESENAS_NEGATIVAS', 'CAIDA_RATING', 'CUENTAS_NUEVAS', 'RESENA_MUY_NEGATIVA', 'MENCION_NEGATIVA', 'COMENTARIO_NEGATIVO']
          .filter(t => !prefs?.tipos || prefs.tipos[t] !== false);

        const alertasPendientes = await prisma.alerta.findMany({
          where: {
            creadaEn: { gte: desde },
            tipo: { in: tiposActivos },
            negocio: { usuarioId: u.id, activo: true },
          },
          include: { negocio: { select: { nombre: true } } },
          orderBy: { creadaEn: 'desc' },
        });
        if (alertasPendientes.length === 0) continue;

        await enviarResumenAlertas(u, alertasPendientes, tocaSemanal ? 'semanal' : 'mensual');
        console.log(`[Resumen] Enviado a ${u.email} (${alertasPendientes.length} alertas, ${tocaSemanal ? 'semanal' : 'mensual'})`);
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e) {
      console.error('[Resumen] Error:', e.message);
    }
  });
  console.log('[Resumen] Cron diario configurado: 8:00 AM');
};

// ── Renovación mensual de suscripciones (Culqi) ───────────
// Corre todos los días a las 5:00 AM; cobra a quienes vencen hoy usando la
// tarjeta guardada (ver src/lib/culqi.js). Si el cobro falla, se desactiva
// la suscripción y el usuario vuelve a ver los límites del plan Gratis.
const iniciarRenovacionesCulqi = () => {
  cron.schedule('0 5 * * *', async () => {
    const culqi = require('../lib/culqi');
    const { emitirComprobante } = require('../services/comprobante.service');
    if (!culqi.configurado()) return;

    // Misma fuente que el alta de suscripción (pago.routes.js). Estos valores
    // estaban duplicados acá y se desincronizaron una vez; ahora se importan.
    const { MONEDA, PRECIOS } = require('../lib/precios');

    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);

    const usuarios = await prisma.usuario.findMany({
      where: {
        suscripcionActiva: true,
        suscripcionId: { not: null },
        plan: { in: ['NEGOCIO', 'FRANQUICIA'] },
        fechaVencimiento: { gte: inicioHoy, lte: finHoy },
      },
    });

    for (const usuario of usuarios) {
      try {
        // periodoFacturacion distingue mensual vs anual: antes este cron cobraba
        // el precio mensual a TODOS, incluso a quienes se suscribieron anual,
        // convirtiéndolos en facturación mensual sin avisarles al llegar su
        // primer aniversario. Ahora respeta el ciclo con el que se suscribieron.
        const periodo = usuario.periodoFacturacion === 'anual' ? 'anual' : 'mensual';
        const precioBase = PRECIOS[usuario.plan][periodo];
        // Promo de bienvenida (50% los primeros 2 meses, solo mensual): si a la
        // cuenta le queda algún mes de promo pendiente, esta renovación también
        // se cobra con el descuento y se descuenta el contador.
        const enPromo = periodo === 'mensual' && usuario.mesesPromoRestantes > 0;
        const monto = enPromo ? Math.round(precioBase / 2) : precioBase;

        const cargo = await culqi.crearCargo({
          monto,
          moneda: MONEDA, // ver lib/precios.js
          email: usuario.email,
          sourceId: usuario.suscripcionId,
          descripcion: `Notoria — Renovación plan ${usuario.plan} (${periodo})${enPromo ? ' — promo 50% bienvenida' : ''}`,
        });

        const fechaVencimiento = new Date();
        fechaVencimiento.setMonth(fechaVencimiento.getMonth() + (periodo === 'anual' ? 12 : 1));
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: {
            fechaVencimiento,
            ...(enPromo ? { mesesPromoRestantes: { decrement: 1 } } : {}),
          },
        });

        const tarjeta = culqi.datosTarjeta(cargo);
        const pago = await prisma.pago.create({
          data: {
            usuarioId: usuario.id, plan: usuario.plan, periodo, tipo: 'RENOVACION',
            estado: 'EXITOSO', monto, moneda: MONEDA, titular: usuario.nombre,
            tarjetaInicio: tarjeta.inicio,
            tarjetaMarca: tarjeta.marca,
            culqiCargoId: cargo?.id || null,
          },
        }).catch(e => {
          console.error('[Facturación] No se pudo registrar la renovación:', e.message);
          return null;
        });

        // Comprobante de la renovación, igual que en el cobro inicial
        if (pago) await emitirComprobante({ pago, usuario });

        console.log(`[Culqi] Renovación cobrada a ${usuario.email}`);
      } catch (error) {
        console.error(`[Culqi] Falló la renovación de ${usuario.email}:`, error.response?.data?.user_message || error.message);
        await prisma.usuario.update({ where: { id: usuario.id }, data: { suscripcionActiva: false } });
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  });
  console.log('[Culqi] Cron de renovaciones configurado: 5:00 AM diario');
};

// ── Recordatorio de urgencia (Negocio+) ───────────────────
// Corre cada 4 horas: busca reseñas negativas (rating <= 2) sin responder hace
// más de 24h y escala el aviso a un canal adicional — Telegram si el usuario lo
// configuró, y además WhatsApp (Meta Cloud API) si es plan Franquicia. Se envía una sola
// vez por reseña (`escaladaUrgencia`).
const revisarEscalacionesUrgentes = async () => {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const resenas = await prisma.resena.findMany({
    where: {
      rating: { lte: 2 },
      respondida: false,
      escaladaUrgencia: false,
      detectadaEn: { lte: hace24h },
      negocio: { activo: true, usuario: { plan: { in: ['NEGOCIO', 'FRANQUICIA'] } } },
    },
    include: {
      negocio: {
        include: { usuario: { select: { id: true, email: true, nombre: true, telefono: true, telegramChatId: true, plan: true } } },
      },
    },
  });

  console.log(`[Escalación] ${resenas.length} reseña(s) negativa(s) sin responder hace más de 24h`);

  for (const resena of resenas) {
    const { negocio } = resena;
    const { usuario } = negocio;
    const descripcion = `Una reseña de ${resena.rating}★ en ${negocio.nombre} lleva más de 24h sin respuesta${resena.autorNombre ? ` (de ${resena.autorNombre})` : ''}.`;

    let escalada = false;

    if (usuario.telegramChatId) {
      const ok = await enviarAlertaTelegram({
        chatId: usuario.telegramChatId, negocio,
        alerta: { tipo: 'RESENA_MUY_NEGATIVA', plataforma: resena.plataforma, descripcion },
      });
      escalada = escalada || ok;
    }

    if (usuario.plan === 'FRANQUICIA' && usuario.telefono && whatsapp.configurado()) {
      try {
        await whatsapp.enviarWhatsApp({ to: usuario.telefono, mensaje: `Notoria — ${descripcion}` });
        escalada = true;
      } catch (error) {
        // whatsappMeta ya devuelve el detalle de Meta legible en error.message.
        console.error(`[Escalación] Error enviando WhatsApp a ${usuario.email}: ${error.message}`);
      }
    }

    if (escalada) {
      await prisma.resena.update({ where: { id: resena.id }, data: { escaladaUrgencia: true } });
      console.log(`[Escalación] Escalada la reseña ${resena.id} de ${negocio.nombre}`);
    }
  }
};

const iniciarEscalacionUrgencias = () => {
  cron.schedule('0 */4 * * *', revisarEscalacionesUrgentes);
  console.log('[Escalación] Cron configurado: cada 4 horas');
};

// ── Libro de Reclamaciones: aviso de plazo por vencer ─────
// El plazo de 15 días hábiles es improrrogable y no puede depender de que
// alguien se acuerde de mirar el libro. Este cron avisa por correo mientras
// queden reclamos sin responder, y sigue avisando cada día hasta que se
// respondan: un recordatorio que se manda una sola vez se pierde.
const { plazoDe } = require('../lib/reclamaciones');
const { enviarAvisoPlazoReclamaciones } = require('../utils/emails');

const revisarPlazosReclamaciones = async () => {
  try {
    const pendientes = await prisma.reclamacion.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { creadoEn: 'asc' },
    });
    if (!pendientes.length) return;

    // Solo molesta cuando hay algo que hacer: a 5 días hábiles o menos.
    const conPlazo = pendientes
      .map(r => ({ ...r, plazo: plazoDe(r) }))
      .filter(r => r.plazo.vencida || r.plazo.diasRestantes <= 5);
    if (!conPlazo.length) return;

    await enviarAvisoPlazoReclamaciones(conPlazo);
  } catch (e) {
    console.error('[Reclamaciones] Falló la revisión de plazos:', e.message);
  }
};

const iniciarAvisoReclamaciones = () => {
  cron.schedule('0 9 * * *', revisarPlazosReclamaciones);
  console.log('[Reclamaciones] Cron de plazos configurado: 9:00 AM diario');
};

module.exports = {
  iniciarMonitoreo, ejecutarAhora, iniciarReportesMensuales, iniciarResumenesAlertas,
  iniciarRenovacionesCulqi, iniciarEscalacionUrgencias, revisarEscalacionesUrgentes,
  iniciarAvisoReclamaciones, revisarPlazosReclamaciones,
  procesarMenciones, procesarComentariosSociales,
  // Lo usa el webhook de Instagram para guardar un comentario suelto por el
  // mismo camino que el escaneo (dedupe + sentimiento + alerta).
  guardarComentarioSocial,
  // Se exporta para que las pruebas comprueben el contrato entre cada scraper y
  // el worker: si un scraper renombra un campo, `aFila` deja de mapearlo y el
  // comentario se guardaría a medias sin que nada falle.
  FUENTES_COMENTARIOS,
};
