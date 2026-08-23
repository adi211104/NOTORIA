// brand-shield/src/workers/monitoreo.worker.js
// Revisa todos los negocios activos cada 4 horas
// y dispara alertas cuando detecta anomalías

const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { obtenerResenasGoogle, buscarNegocioEnGoogle } = require('../scrapers/google.scraper');
const { obtenerRatingFacebook, obtenerResenasFacebook } = require('../scrapers/facebook.scraper');
const { analizarResena, detectarAnomalias } = require('../nlp/detector');
const { notificar, enviarAlertaEmail } = require('../alerts/notificador');
const { revisarDatosDeFicha, puedeVigilarFicha } = require('../lib/fichaGoogle');

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


// ── Vigilancia de la ficha de Google ──────────────────────
//
// Notoria vigilaba lo que la gente ESCRIBE sobre el negocio, pero no la ficha en
// sí. Y Google Maps deja que cualquiera sugiera cambios sobre la ficha de un
// negocio ajeno, incluido marcarla como cerrada. Un local que aparece «Cerrado
// permanentemente» un viernes deja de recibir gente todo el fin de semana, y el
// dueño se entera días después porque nadie mira su propia ficha a diario.
//
// El dato viene en `business_status`, que ya llega en la misma consulta a Place
// Details que se hacía para las reseñas: es del grupo Basic Data, que esa
// llamada ya paga. Detectarlo no cuesta nada.
//
// No hace falta guardar el estado anterior: la condición de alarma es el estado
// actual, no el cambio. Si Google dice que está cerrado, hay que avisar, se haya
// cerrado hoy o ayer. Lo único que hay que evitar es repetir el aviso en cada
// pasada, y eso se resuelve mirando si ya hay una alerta igual sin leer.
const ESTADOS_FICHA = {
  CLOSED_PERMANENTLY: {
    titulo: 'aparece como CERRADO PERMANENTEMENTE',
    consejo: 'Si sigues abierto, entra a tu ficha en Google Maps y corrígelo hoy mismo: mientras diga eso, Google deja de mostrarte a quien busca en la zona.',
  },
  CLOSED_TEMPORARILY: {
    titulo: 'aparece como CERRADO TEMPORALMENTE',
    consejo: 'Si sigues abierto, corrígelo en tu ficha de Google Maps: con ese estado pierdes visibilidad en las búsquedas y en el mapa.',
  },
};

const revisarFichaGoogle = async (negocio, datos) => {
  const estado = datos?.estadoNegocio;
  if (!estado || estado === 'OPERATIONAL') return;

  const problema = ESTADOS_FICHA[estado];
  if (!problema) return;

  const descripcion = `Tu ficha de Google ${problema.titulo}. ${problema.consejo}`;

  // Dedupe: si ya hay una alerta con este mismo texto sin leer, no se repite.
  // Se mira "sin leer" y no una ventana de tiempo porque el problema sigue vivo
  // hasta que el dueño lo arregla; una vez que la marca como leída y el estado
  // persiste, volver a avisar es correcto.
  const yaAvisada = await prisma.alerta.findFirst({
    where: { negocioId: negocio.id, plataforma: 'GOOGLE', descripcion, leida: false },
    select: { id: true },
  });
  if (yaAvisada) return;

  const alerta = await prisma.alerta.create({
    data: {
      tipo: 'FICHA_ALTERADA',
      plataforma: 'GOOGLE',
      descripcion,
      detalle: { motivo: 'ficha_google', estadoNegocio: estado, nombreEnGoogle: datos.nombreEnGoogle || null },
      negocioId: negocio.id,
      notificada: true,
    },
  });

  // Se manda por `enviarAlertaEmail` directo y NO por `notificar()`, a propósito:
  // ninguna preferencia de alertas debería poder silenciar "tu local aparece
  // cerrado". Quien eligió resumen semanal quiere igual enterarse de esto hoy.
  // Es el mismo criterio que usa la escalación de urgencias.
  await enviarAlertaEmail({
    usuario: negocio.usuario,
    negocio,
    alerta: { tipo: 'FICHA_ALTERADA', plataforma: 'GOOGLE', descripcion },
  });
  console.log(`[Ficha] ${negocio.nombre}: ${estado} — alerta ${alerta.id} enviada`);
};

// Cambios en los DATOS de la ficha: teléfono, horario, nombre, dirección.
//
// Es la otra mitad de la vigilancia de ficha, y la que solo tienen los planes de
// pago porque cuesta dinero por escaneo (ver lib/fichaGoogle.js). Un teléfono
// cambiado es un negocio que deja de recibir llamadas sin saber por qué; un
// horario cambiado son clientes que llegan y encuentran cerrado — y que además
// dejan una reseña de 1★ por el viaje perdido.
const revisarCambiosDeContacto = async (negocio, datos) => {
  if (!datos?.crudo) return; // no se pidieron los campos de contacto
  const cambios = await revisarDatosDeFicha(negocio, datos.crudo);
  if (!cambios.length) return;

  const descripcion = cambios.length === 1
    ? `${cambios[0].texto} Si no fuiste tú, corrígelo en tu ficha de Google: cualquiera puede sugerir cambios y Google los aplica sin avisarte.`
    : `Cambiaron ${cambios.length} datos de tu ficha de Google. ${cambios.map((c) => c.texto).join(' ')} Si no fuiste tú, corrígelos en tu ficha: cualquiera puede sugerir cambios y Google los aplica sin avisarte.`;

  const alerta = await prisma.alerta.create({
    data: {
      tipo: 'FICHA_ALTERADA',
      plataforma: 'GOOGLE',
      descripcion,
      detalle: { motivo: 'ficha_datos', cambios: cambios.map((c) => c.campo) },
      negocioId: negocio.id,
      notificada: true,
    },
  });

  // Directo por correo, igual que la ficha cerrada: ninguna preferencia debería
  // poder silenciar «alguien te cambió el teléfono en Google».
  await enviarAlertaEmail({
    usuario: negocio.usuario,
    negocio,
    alerta: { tipo: 'FICHA_ALTERADA', plataforma: 'GOOGLE', descripcion },
  });
  console.log(`[Ficha] ${negocio.nombre}: cambió ${cambios.map((c) => c.campo).join(', ')} — alerta ${alerta.id}`);
};

// ── Aviso inmediato por reseña negativa nueva ─────────────
//
// 🔴 Este era el agujero central del producto, y no producía un solo error en
// los logs. Foto de producción del 2026-08-22: 1783 escaneos, 15 negocios,
// 84 reseñas guardadas — de ellas 12 de ≤2★ y 3 marcadas como sospechosas — y
// CERO alertas creadas desde que existe la plataforma.
//
// El motivo es que las cinco señales de `detectarAnomalias` son todas AGREGADAS
// y ninguna se cumple en un negocio real que no esté bajo ataque:
//
//   · CAIDA_RATING pide 0.1 puntos entre dos mediciones, y una ficha con
//     cientos de reseñas no mueve eso en cuatro horas ni queriendo.
//   · PICO_RESENAS_NEGATIVAS pide 3 negativas en 24h, cuando Places entrega
//     5 reseñas COMO MÁXIMO por consulta.
//   · CUENTAS_NUEVAS por perfiles nuevos no se dispara nunca (`autorResenasTotal`
//     llega null desde las cinco fuentes).
//
// Así que una reseña de 1★ recién publicada solo producía un correo 24 HORAS
// después, desde `revisarEscalacionesUrgentes`, que además manda el aviso sin
// crear fila de `Alerta`: no aparecía en el panel, no llegaba a la app Android,
// y no la veían los gestores del equipo. El dueño entraba a su panel y leía
// "Todo tranquilo por ahora" con una reseña de 1★ recién puesta en su ficha.
//
// Y la pantalla de Alertas ya ofrecía elegir entre «Cada reseña negativa» y
// «Solo picos (5+ en 24h)», con la primera puesta por defecto: una preferencia
// que el cliente podía configurar y que no gobernaba absolutamente nada.
//
// Esto NO sustituye a la escalación de 24h: son dos mensajes distintos y los dos
// tienen sentido ("llegó una reseña de 1★" hoy, "lleva un día sin respuesta"
// mañana). Sí pasa por `notificar()`, y no por `enviarAlertaEmail` directo,
// porque acá las preferencias del usuario SÍ mandan — a diferencia de la ficha
// cerrada, esto es exactamente lo que el umbral de la pantalla de Alertas
// existe para regular.

// Qué se considera negativa. Es el mismo corte que usa la escalación de
// urgencias y el aviso rojo del Espejo: por debajo de 3★ el cliente está
// molesto, y de 3★ para arriba marcar la reseña sería ruido.
const UMBRAL_RESENA_NEGATIVA = 2;

// Solo se avisa de lo que acaba de pasar. Si el escaneo estuvo caído unos días,
// o Google reordena lo que devuelve, una reseña de hace meses puede aparecer hoy
// como nueva PARA NOSOTROS. El correo dice que acaba de llegar, así que tiene
// que ser cierto: una alerta por algo de hace medio año destruye la confianza en
// todas las demás.
const DIAS_RESENA_RECIENTE = 30;

const alertarResenaNegativa = async (negocio, resena, esPrimerBarrido) => {
  if (resena.rating > UMBRAL_RESENA_NEGATIVA) return;

  // Un negocio recién conectado trae de golpe las 5 reseñas que Places publica,
  // y pueden ser de hace años. Avisar de ellas sería mandarle tres correos de
  // reseñas viejas al minuto de registrarse: la peor primera impresión posible
  // para un producto que se vende por la calidad de sus avisos.
  if (esPrimerBarrido) return;

  const antiguedadDias = (Date.now() - new Date(resena.fechaResena).getTime()) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(antiguedadDias) || antiguedadDias > DIAS_RESENA_RECIENTE) return;

  const autor = resena.autorNombre || 'un cliente';
  const extracto = (resena.texto || '').trim().slice(0, 120);

  // `descripcion` se guarda redactada y en español, como el resto de la tabla.
  // Las PIEZAS van en `detalle` para que el panel arme la frase en el idioma del
  // usuario (ver web/src/lib/alertas.js) — es la regla que ese archivo pide
  // seguir al añadir un tipo con datos variables.
  const descripcion = extracto
    ? `Nueva reseña de ${resena.rating}★ de ${autor}: “${extracto}”`
    : `Nueva reseña de ${resena.rating}★ de ${autor}, sin comentario.`;

  const alerta = await prisma.alerta.create({
    data: {
      tipo: 'RESENA_MUY_NEGATIVA',
      plataforma: resena.plataforma,
      descripcion,
      detalle: {
        resenaId: resena.id,
        rating: resena.rating,
        autor: resena.autorNombre || null,
        texto: extracto || null,
        // Se guarda por qué el detector la marcó, si la marcó. El panel puede
        // decir "además repite el texto de otra reseña", que es información que
        // el dueño no tiene por ningún otro medio.
        motivoSospecha: resena.motivoSospecha || null,
      },
      negocioId: negocio.id,
    },
  });

  await notificar({ usuario: negocio.usuario, negocio, alerta });
  await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
  console.log(`[Reseñas] ${negocio.nombre}: ${resena.rating}★ de ${autor} — alerta ${alerta.id}`);
};

/**
 * Procesa un negocio: obtiene reseñas, guarda nuevas, detecta anomalías y notifica
 */
// Una ficha de Google, una sola llamada por ciclo — aunque la vigilen varios.
//
// 🔴 Dos cuentas distintas pueden monitorear el MISMO local, y no es hipotético:
// el 2026-08-23 había 10 negocios activos y solo 9 `googlePlaceId` distintos
// («Cebichería Fabián» la seguían dos usuarios, con 541 snapshots entre los dos).
// Cada uno gastaba su propia consulta a Places por la misma ficha. Hoy es
// calderilla; con clientes de verdad es un costo variable que se duplica sin que
// nada lo delate, porque en la factura de Google no se distingue.
//
// El caché vive UN CICLO y se pasa explícito. Nada de memo con TTL dentro del
// scraper: entre ciclos los datos tienen que volver a pedirse, que es la razón de
// ser del producto.
//
// ⚠️ La clave no puede ser solo el placeId. `conContacto` cambia los campos que
// se piden (Contact Data se factura aparte y solo lo tienen NEGOCIO y
// FRANQUICIA), así que una respuesta SIN contacto no sirve para quien sí lo
// paga. Al revés sí: la que trae contacto es un superconjunto y vale para los
// dos. Servir una sin contacto a un plan que lo incluye apagaría en silencio la
// vigilancia de teléfono y horario de ese cliente.
const obtenerFichaGoogleCompartida = async (placeId, conContacto, cache) => {
  if (!cache) return obtenerResenasGoogle(placeId, { conContacto });

  const guardado = cache.get(placeId);
  if (guardado && (guardado.conContacto || !conContacto)) {
    console.log(`[Worker] Ficha ${placeId} reutilizada del ciclo (una llamada menos a Places)`);
    return guardado.datos;
  }

  const datos = await obtenerResenasGoogle(placeId, { conContacto });
  // Solo se guarda lo que sirvió. Un `null` (fallo de red, cuota agotada) no se
  // cachea: el siguiente negocio que comparta la ficha merece su propio intento,
  // y no heredar un fallo ajeno.
  if (datos) cache.set(placeId, { datos, conContacto });
  return datos;
};

const procesarNegocio = async (negocio, ctx = {}) => {
  console.log(`[Worker] Procesando: ${negocio.nombre} (${negocio.id})`);

  // ── GOOGLE ────────────────────────────────────────────────
  if (negocio.googlePlaceId) {
    // Los datos de contacto (teléfono, horario, dirección) solo se piden en los
    // planes que los incluyen: son del grupo Contact Data de Places y se
    // facturan aparte. Ver lib/fichaGoogle.js.
    const datos = await obtenerFichaGoogleCompartida(
      negocio.googlePlaceId,
      puedeVigilarFicha(negocio.usuario?.plan),
      ctx.fichasGoogle,
    );
    if (datos) {
      // Lo primero, antes que las reseñas: que la ficha exista y esté abierta es
      // más urgente que cualquier reseña que haya en ella. Va con su propio
      // catch para que un fallo acá no impida guardar el snapshot del ciclo.
      await revisarFichaGoogle(negocio, datos)
        .catch((e) => console.error(`[Ficha] Error revisando ${negocio.nombre}: ${e.message}`));

      // Y después, si el plan lo incluye, si alguien le tocó el teléfono, el
      // horario, el nombre o la dirección.
      await revisarCambiosDeContacto(negocio, datos)
        .catch((e) => console.error(`[Ficha] Error comparando datos de ${negocio.nombre}: ${e.message}`));

      // ¿Es la primera vez que miramos esta ficha? Se pregunta ANTES de crear el
      // snapshot de este ciclo, o la respuesta sería siempre "no". Gobierna el
      // aviso por reseña negativa: en el primer barrido llegan de golpe las 5
      // reseñas que Places publica, que pueden ser de hace años (ver
      // `alertarResenaNegativa`).
      const escaneosPrevios = await prisma.snapshot.count({
        where: { negocioId: negocio.id, plataforma: 'GOOGLE' },
      });
      const esPrimerBarrido = escaneosPrevios === 0;

      // Guardar snapshot del estado actual
      await prisma.snapshot.create({
        data: {
          plataforma: 'GOOGLE',
          ratingActual: datos.ratingActual,
          totalResenas: datos.totalResenas,
          negocioId: negocio.id,
        },
      });

      // Reseñas ya guardadas de este negocio, para la detección de texto
      // duplicado (ver analizarResena). Se piden UNA vez por ciclo y no por
      // reseña. El tope de 200 y la ventana de 90 días acotan el costo: una
      // campaña coordinada llega junta, no repartida a lo largo de años.
      const hace90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const previas = await prisma.resena.findMany({
        where: { negocioId: negocio.id, detectadaEn: { gte: hace90d }, texto: { not: null } },
        orderBy: { detectadaEn: 'desc' },
        take: 200,
        select: { externalId: true, texto: true },
      });

      // Guardar reseñas nuevas (ignorar duplicados por el unique constraint)
      for (const resena of datos.resenas) {
        // Las reseñas de ESTA misma tanda también cuentan: un ataque suele traer
        // varias copias del mismo texto de golpe, y si solo se comparara contra
        // lo ya guardado, la primera de cada tanda nunca se marcaría.
        const analisis = analizarResena(resena, [...previas, ...datos.resenas.filter(r => r.externalId !== resena.externalId)]);
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

        // Y el aviso de las negativas, que es por lo que se paga el producto.
        // Con su propio catch: si algo falla avisando de UNA reseña, las demás
        // del ciclo —y el resto del escaneo del negocio— tienen que continuar.
        await alertarResenaNegativa(negocio, resenaCreada, esPrimerBarrido)
          .catch((e) => console.error(`[Reseñas] ${negocio.nombre}: no se pudo alertar (${e.message})`));
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

// Cada cuántas horas se escanea, según el plan del dueño del negocio.
//
// 🔴 Esto no existía hasta el 2026-08-17: había UN solo cron cada 4 horas que
// escaneaba todos los negocios por igual, sin mirar el plan. Eso rompía la
// oferta en las dos direcciones a la vez:
//
//   · Franquicia paga S/179 por «un ataque se detecta en máximo 1 hora» y
//     recibía 4 — la promesa publicada en /precios no se cumplía.
//   · Gratis anuncia 24 horas y recibía 4, o sea 6 veces más consultas a Google
//     Places de las prometidas: ~180 al mes por negocio en vez de ~30, más las
//     de su competidor. Cada cuenta gratuita costaba seis veces lo que debía.
//
// Ahora el cron corre CADA HORA y en cada pasada elige a quién le toca según su
// plan. Es una sola consulta por hora en vez de tres crons peleándose.
const HORAS_ESCANEO = { GRATIS: 24, NEGOCIO: 4, FRANQUICIA: 1 };

// ¿Le toca a este negocio? Le toca si nunca se escaneó, o si ya pasó el intervalo
// de su plan. Se deja un margen de 5 minutos porque el cron nunca dispara en el
// segundo exacto: sin él, un ciclo que arranca 20 segundos tarde encontraría que
// «faltan 20 segundos» y se saltaría la ronda entera hasta la hora siguiente.
const MARGEN_ESCANEO_MS = 5 * 60 * 1000;

// 🔴 `ultimoEscaneo` NO sirve para esto, aunque lo parezca.
//
// Esa columna es el reloj del botón «Escanear ahora» del panel. Si el cron la
// escribiera —como hizo durante unas horas el 2026-08-17— se comería el cupo
// manual del usuario: a un plan Gratis el cron le pisaría la marca cada 24 h y
// el botón le saldría en cooldown SIEMPRE, sin haberlo usado nunca.
//
// El cron usa su propio reloj: la fecha del último Snapshot del negocio, que ya
// se crea en cada escaneo. Es el registro real de «cuándo se miró esta ficha por
// última vez», no hace falta ninguna columna nueva, y deja los dos relojes
// independientes: el cron cumple el intervalo del plan y el botón conserva su
// cupo.
const leTocaEscaneo = (negocio, ultimoSnapshotEn, ahora = Date.now()) => {
  const horas = HORAS_ESCANEO[negocio.usuario?.plan] ?? HORAS_ESCANEO.GRATIS;
  if (!ultimoSnapshotEn) return true;
  return ahora - new Date(ultimoSnapshotEn).getTime() >= horas * 3600000 - MARGEN_ESCANEO_MS;
};

// Fecha del último snapshot de cada negocio, en UNA consulta agrupada en vez de
// una por negocio. `groupBy` con `_max` lo resuelve del lado de PostgreSQL.
const ultimosEscaneos = async (negocioIds) => {
  if (!negocioIds.length) return new Map();
  const filas = await prisma.snapshot.groupBy({
    by: ['negocioId'],
    where: { negocioId: { in: negocioIds } },
    _max: { tomadoEn: true },
  });
  return new Map(filas.map((f) => [f.negocioId, f._max.tomadoEn]));
};

/**
 * Cron del monitoreo. Corre cada hora y en cada pasada escanea solo los negocios
 * a los que les toca según el plan de su dueño (ver HORAS_ESCANEO).
 */
const iniciarMonitoreo = () => {
  cron.schedule('0 * * * *', async () => {
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
              prefsAlertas: true,
              plan: true,
              // 🔴 `idioma` NO es opcional acá: `enviarAlertaCritica` compone el
              // correo con `ALERTA[usuario.idioma] || ALERTA.es`, así que sin
              // seleccionarlo llega `undefined` y TODA alerta sale en español —
              // incluidas las de quien tiene el panel en inglés. Es el mismo
              // error que ya pasó con el texto de las invitaciones de equipo
              // (§11) y con la limpieza del landing (§15): el lado inglés se
              // olvida porque nada falla, solo sale en el idioma que no es.
              idioma: true,
            },
          },
        },
      });

      const ahora = Date.now();
      const ultimos = await ultimosEscaneos(negocios.map((n) => n.id));
      // El snapshot manda; `ultimoEscaneo` solo entra como reloj de reserva para
      // los negocios sin ficha de Google, que nunca generan snapshot (ver abajo).
      const toca = negocios.filter((n) => leTocaEscaneo(n, ultimos.get(n.id) ?? n.ultimoEscaneo, ahora));
      console.log(`[Worker] ${toca.length} de ${negocios.length} negocio(s) tocan en esta pasada`);

      // Procesar secuencialmente para no saturar las APIs.
      //
      // No se escribe `ultimoEscaneo`: es el reloj del botón manual, y el cron no
      // debe gastárselo al usuario (ver la nota de leTocaEscaneo). El registro de
      // esta pasada lo deja el propio Snapshot que crea `procesarNegocio`.
      // Una ficha compartida por dos cuentas se pide UNA vez por ciclo (ver
      // `obtenerFichaGoogleCompartida`). El caché muere con la pasada.
      const fichasGoogle = new Map();

      // Se atiende primero a quien tiene derecho a los datos de contacto. Si un
      // plan GRATIS que comparte ficha fuera primero, dejaría cacheada una
      // respuesta SIN contacto que no le sirve al de pago, y habría que pedirla
      // otra vez: el caché no ahorraría nada justo en el caso mixto.
      toca.sort((x, y) => Number(puedeVigilarFicha(y.usuario?.plan)) - Number(puedeVigilarFicha(x.usuario?.plan)));

      for (const negocio of toca) {
        await procesarNegocio(negocio, { fichasGoogle });
        // Excepción: un negocio SIN ficha de Google nunca genera un Snapshot, así
        // que no tiene el otro reloj y sin esto se escanearía cada hora —
        // machacando TikTok o Instagram si los tiene conectados. Solo en ese caso
        // el cron escribe `ultimoEscaneo`. El botón manual de esos negocios sirve
        // de poco de todas formas: sin ficha de Google no hay reseñas que traer.
        if (!negocio.googlePlaceId) {
          await prisma.negocio.update({
            where: { id: negocio.id },
            data: { ultimoEscaneo: new Date() },
          }).catch((e) => console.error(`[Worker] No se pudo marcar el escaneo de ${negocio.nombre}: ${e.message}`));
        }
        // Pausa de 1 segundo entre negocios para respetar rate limits
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(`[Worker] ✅ Ciclo completado`);
    } catch (error) {
      console.error(`[Worker] ❌ Error en ciclo: ${error.message}`);
    }
  });

  console.log('[Worker] Cron job configurado: cada hora, con intervalo por plan (Gratis 24h · Negocio 4h · Franquicia 1h)');
};

// Permite ejecutar el monitoreo manualmente (útil para pruebas y scripts).
//
// ⚠️ Sin `negocioId` esto escanea la plataforma ENTERA: una consulta a Google
// Places por cada negocio y cada competidor de la base, más los correos de
// alerta y las auto-respuestas que eso dispare. Es una operación de terminal,
// no algo que pueda quedar colgando de una ruta HTTP — llamarla desde una ruta
// con el id en null fue exactamente el agujero que se cerró el 2026-08-17 en
// `utils.routes.js`. Por eso ahora el barrido global exige pedirlo a propósito
// con `{ global: true }`: un `undefined` que se cuela ya no basta.
const ejecutarAhora = async (negocioId = null, { global: barridoGlobal = false } = {}) => {
  if (!negocioId && !barridoGlobal) {
    throw new Error('ejecutarAhora requiere un negocioId, o { global: true } para barrer toda la plataforma');
  }
  console.log(`[Worker] Ejecución manual iniciada${negocioId ? '' : ' — BARRIDO GLOBAL'}...`);
  const where = negocioId ? { activo: true, id: negocioId } : { activo: true };
  const negocios = await prisma.negocio.findMany({
    where,
    include: {
      usuario: { select: { id: true, email: true, nombre: true, prefsAlertas: true, plan: true, idioma: true } },
    },
  });
  // Mismo caché por pasada que en el cron: `ejecutarAhora` sin `negocioId`
  // recorre la plataforma entera, que es justo donde más fichas se repiten.
  const fichasGoogle = new Map();
  negocios.sort((x, y) => Number(puedeVigilarFicha(y.usuario?.plan)) - Number(puedeVigilarFicha(x.usuario?.plan)));
  for (const negocio of negocios) {
    await procesarNegocio(negocio, { fichasGoogle });
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
  // Mandarla igual sería avisarle por correo y por la app de algo que acaba
  // de resolver, que es la clase de ruido que hace que la gente empiece a
  // ignorar las notificaciones.
  if (sentimiento === 'negativo' && !fila.respondida) {
    const alerta = await prisma.alerta.create({
      data: {
        tipo: 'COMENTARIO_NEGATIVO',
        plataforma: fuente.id,
        descripcion: `Comentario negativo en ${fuente.nombre} de ${fila.autorNombre || 'un usuario'}: "${(fila.texto || '').slice(0, 80)}…"`,
        // `descripcion` queda en español porque es texto ya redactado y guardado.
        // Las PIEZAS van aparte en `detalle` para que el panel pueda componer la
        // frase en el idioma del usuario (ver web/src/lib/alertas.js): con la
        // interfaz en inglés, una alerta en español canta.
        detalle: {
          comentarioId: comentario.id,
          plataforma: fuente.id,
          publicacionId: fila.publicacionId,
          autor: fila.autorNombre || null,
          texto: (fila.texto || '').slice(0, 80),
        },
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
            // Mismas piezas que en COMENTARIO_NEGATIVO, por el mismo motivo.
            detalle: {
              url: m.url,
              mencionId: mencion.id,
              plataforma: m.plataforma,
              autor: m.autorHandle || m.autorNombre || null,
              texto: (m.texto || '').slice(0, 80),
            },
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
        select: { id: true, email: true, nombre: true, prefsAlertas: true, idioma: true },
      });

      for (const u of usuarios) {
        const prefs = u.prefsAlertas;
        const tocaSemanal = prefs?.frecuencia === 'SEMANAL' && (prefs.diaSemana ?? 1) === diaSemana;
        const tocaMensual = prefs?.frecuencia === 'MENSUAL' && esPrimeroDeMes;
        if (!tocaSemanal && !tocaMensual) continue;

        const desde = new Date(Date.now() - (tocaSemanal ? 7 : 30) * 24 * 60 * 60 * 1000);
        const tiposActivos = ['PICO_RESENAS_NEGATIVAS', 'CAIDA_RATING', 'CUENTAS_NUEVAS', 'RESENA_MUY_NEGATIVA', 'MENCION_NEGATIVA', 'COMENTARIO_NEGATIVO', 'FICHA_ALTERADA']
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

// ── Renovación de suscripciones (Culqi) ───────────────────
//
// Corre todos los días a las 5:00 AM y cobra con la tarjeta guardada
// (ver src/lib/culqi.js).
//
// 🔴 Reescrito el 2026-08-17. Antes tenía tres fallos que se tapaban entre sí y
// que juntos hacían que el producto perdiera clientes que pagaban y regalara el
// producto a los que no:
//
//   1. La consulta filtraba `fechaVencimiento` entre el inicio y el fin de HOY.
//      O sea que solo cobraba a quien vencía exactamente ese día. Cualquier día
//      en que el cron no llegara a correr —un deploy a las 5:00, un reinicio de
//      Railway, el contenedor dormido— esos vencimientos quedaban atrás y NUNCA
//      volvían a entrar en la consulta. Ahora se cobra todo lo vencido hasta hoy.
//
//   2. Un cargo rechazado desactivaba la suscripción de inmediato, sin reintento
//      y sin avisar. Un bloqueo del banco de 24 horas costaba el cliente entero.
//      Ahora hay tres intentos repartidos en una semana, con correo en cada uno.
//
//   3. `plan` no bajaba nunca a GRATIS, y `suscripcionActiva:false` no bloquea
//      nada (verificarPlan solo mira `plan`). Así que quien dejaba de pagar
//      conservaba su plan completo para siempre. Ahora, agotados los intentos,
//      el plan baja de verdad.
//
// Los intentos se cuentan con las filas de `Pago` en estado FALLIDO posteriores
// al último cobro exitoso — no hizo falta ninguna columna nueva. Y tiene un
// efecto secundario bueno: los intentos fallidos aparecen en la pantalla de
// Facturación del cliente, que es justo donde tiene que verlos.
const MAX_INTENTOS_COBRO = 3;
const DIAS_ENTRE_INTENTOS = 3;

// Cuántos rechazos lleva encima esta renovación. Se miran solo los FALLIDO
// posteriores al último EXITOSO: si el mes pasado falló y luego pagó, ese
// historial viejo no debe contar para el ciclo de ahora.
const intentosFallidosDelCiclo = async (usuarioId) => {
  const ultimoExitoso = await prisma.pago.findFirst({
    where: { usuarioId, estado: 'EXITOSO' },
    orderBy: { creadoEn: 'desc' },
    select: { creadoEn: true },
  });
  return prisma.pago.count({
    where: {
      usuarioId,
      estado: 'FALLIDO',
      ...(ultimoExitoso ? { creadoEn: { gt: ultimoExitoso.creadoEn } } : {}),
    },
  });
};

const iniciarRenovacionesCulqi = () => {
  cron.schedule('0 5 * * *', async () => {
    const culqi = require('../lib/culqi');
    const { emitirComprobante } = require('../services/comprobante.service');
    const { enviarCobroFallido } = require('../utils/emails');
    if (!culqi.configurado()) return;

    // Misma fuente que el alta de suscripción (pago.routes.js). Estos valores
    // estaban duplicados acá y se desincronizaron una vez; ahora se importan.
    const { MONEDA, PRECIOS } = require('../lib/precios');

    const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);

    const usuarios = await prisma.usuario.findMany({
      where: {
        suscripcionActiva: true,
        suscripcionId: { not: null },
        plan: { in: ['NEGOCIO', 'FRANQUICIA'] },
        // Sin `gte`: todo lo vencido, no solo lo de hoy. Es el arreglo del punto 1.
        fechaVencimiento: { lte: finHoy },
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

        // El nuevo vencimiento se calcula desde el ANTERIOR, no desde hoy: si un
        // cobro se retrasó tres días por reintentos, el cliente no debe perder
        // esos tres días de servicio ni correrse el aniversario cada vez. El
        // `max` con hoy evita que una cuenta muy atrasada quede con el
        // vencimiento todavía en el pasado y se le vuelva a cobrar mañana.
        const base = usuario.fechaVencimiento && usuario.fechaVencimiento > new Date()
          ? new Date(usuario.fechaVencimiento)
          : new Date();
        const fechaVencimiento = new Date(base);
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
        const motivo = error.response?.data?.user_message || error.message;
        console.error(`[Culqi] Falló la renovación de ${usuario.email}:`, motivo);

        const periodo = usuario.periodoFacturacion === 'anual' ? 'anual' : 'mensual';
        const precioBase = PRECIOS[usuario.plan]?.[periodo] ?? 0;
        const enPromo = periodo === 'mensual' && usuario.mesesPromoRestantes > 0;
        const monto = enPromo ? Math.round(precioBase / 2) : precioBase;

        // El intento queda registrado como Pago FALLIDO. Es lo que cuenta los
        // reintentos (sin columna nueva) y además le da al cliente, en su
        // pantalla de Facturación, la explicación de por qué perdió el plan.
        await prisma.pago.create({
          data: {
            usuarioId: usuario.id, plan: usuario.plan, periodo, tipo: 'RENOVACION',
            estado: 'FALLIDO', monto, moneda: MONEDA, titular: usuario.nombre,
          },
        }).catch(e => console.error('[Facturación] No se pudo registrar el intento fallido:', e.message));

        const intento = await intentosFallidosDelCiclo(usuario.id);
        const seRinde = intento >= MAX_INTENTOS_COBRO;

        if (seRinde) {
          // Recién acá se pierde el plan — y se baja `plan` de verdad, no solo
          // `suscripcionActiva`, que no bloqueaba nada por sí solo.
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: { plan: 'GRATIS', suscripcionActiva: false, suscripcionId: null, periodoFacturacion: null },
          });
          console.log(`[Culqi] ${usuario.email} agotó los ${MAX_INTENTOS_COBRO} intentos — pasa a GRATIS`);
        } else {
          // Se corre el vencimiento unos días y la suscripción sigue activa: el
          // cliente conserva su plan mientras arregla la tarjeta. El próximo
          // ciclo del cron lo vuelve a tomar por la misma consulta.
          const proximo = new Date();
          proximo.setDate(proximo.getDate() + DIAS_ENTRE_INTENTOS);
          await prisma.usuario.update({ where: { id: usuario.id }, data: { fechaVencimiento: proximo } });
          console.log(`[Culqi] Reintento ${intento}/${MAX_INTENTOS_COBRO} para ${usuario.email} el ${proximo.toISOString().slice(0, 10)}`);
        }

        // El correo nunca puede tumbar el cron: si Resend falla, el cobro ya
        // quedó registrado y el reintento sigue programado igual.
        const proximoIntento = new Date(Date.now() + DIAS_ENTRE_INTENTOS * 86400000)
          .toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
        await enviarCobroFallido(usuario, {
          intento, maxIntentos: MAX_INTENTOS_COBRO, monto, moneda: MONEDA, proximoIntento,
        }).catch(e => console.error('[Cobro] No se pudo avisar del cobro fallido:', e.message));
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  });
  console.log('[Culqi] Cron de renovaciones configurado: 5:00 AM diario');
};

// ── Bajada de plan al terminar un periodo cancelado ───────
//
// Cancelar NO corta el servicio: el cliente pagó hasta cierta fecha y hasta esa
// fecha conserva su plan (es lo que promete /devoluciones). Lo que hace cancelar
// es apagar `suscripcionActiva`, así que el cron de renovación deja de tomarlo.
//
// Este cron es el que cierra el círculo: cuando esa fecha llega, baja el plan a
// GRATIS. Sin él, `plan` se quedaba en NEGOCIO o FRANQUICIA para siempre —que
// era el hallazgo F3— y el cliente seguía usando funciones de pago sin pagar.
const iniciarBajadaDePlanes = () => {
  cron.schedule('30 5 * * *', async () => {
    try {
      const vencidos = await prisma.usuario.findMany({
        where: {
          suscripcionActiva: false,
          plan: { in: ['NEGOCIO', 'FRANQUICIA'] },
          fechaVencimiento: { lte: new Date() },
        },
        select: { id: true, email: true, plan: true },
      });
      for (const u of vencidos) {
        await prisma.usuario.update({
          where: { id: u.id },
          data: { plan: 'GRATIS', suscripcionId: null, periodoFacturacion: null, fechaVencimiento: null },
        });
        console.log(`[Planes] ${u.email} terminó su periodo ${u.plan} — pasa a GRATIS`);
      }
      if (vencidos.length) console.log(`[Planes] ${vencidos.length} cuenta(s) bajadas a GRATIS`);
    } catch (e) {
      console.error('[Planes] Falló la bajada de planes vencidos:', e.message);
    }
  });
  console.log('[Planes] Cron de bajada de planes configurado: 5:30 AM diario');
};

// ── Recordatorio de urgencia (Negocio+) ───────────────────
// Corre cada 4 horas: busca reseñas negativas (rating <= 2) sin responder hace
// más de 24h y manda un recordatorio por correo. Se envía una sola vez por
// reseña (`escaladaUrgencia`).
//
// 🔴 Antes esto escalaba a un canal DISTINTO del correo (Telegram, y WhatsApp
// para Franquicia) porque la idea era "el correo ya lo mandamos y no lo leyó".
// Los dos canales se eliminaron del producto el 2026-08-16 (ver notificador.js).
// El recordatorio sigue teniendo sentido en correo — es otro mensaje, con otro
// asunto, 24h después — y quien quiera un aviso que suene tiene la app Android,
// que notifica desde las alertas del panel sin depender de terceros.
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
        include: { usuario: { select: { id: true, email: true, nombre: true, telefono: true, idioma: true, plan: true } } },
      },
    },
  });

  console.log(`[Escalación] ${resenas.length} reseña(s) negativa(s) sin responder hace más de 24h`);

  for (const resena of resenas) {
    const { negocio } = resena;
    const { usuario } = negocio;
    const descripcion = `Una reseña de ${resena.rating}★ en ${negocio.nombre} lleva más de 24h sin respuesta${resena.autorNombre ? ` (de ${resena.autorNombre})` : ''}.`;

    // Se llama al enviador de correo directamente y no a `notificar()` a
    // propósito: este aviso NO debe filtrarse por prefsAlertas.frecuencia
    // (quien eligió resumen semanal igual quiere enterarse de una reseña de 1★
    // que lleva un día sin contestar) y tampoco cuenta como alerta nueva.
    const escalada = await enviarAlertaEmail({
      usuario, negocio,
      alerta: { tipo: 'RESENA_MUY_NEGATIVA', plataforma: resena.plataforma, descripcion },
    });

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
  iniciarMonitoreo, ejecutarAhora, HORAS_ESCANEO, leTocaEscaneo,
  iniciarReportesMensuales, iniciarResumenesAlertas,
  iniciarRenovacionesCulqi, iniciarBajadaDePlanes, iniciarEscalacionUrgencias, revisarEscalacionesUrgentes,
  iniciarAvisoReclamaciones, revisarPlazosReclamaciones,
  procesarMenciones, procesarComentariosSociales,
  // Lo usa el webhook de Instagram para guardar un comentario suelto por el
  // mismo camino que el escaneo (dedupe + sentimiento + alerta).
  guardarComentarioSocial,
  // Se exporta para que las pruebas comprueben el contrato entre cada scraper y
  // el worker: si un scraper renombra un campo, `aFila` deja de mapearlo y el
  // comentario se guardaría a medias sin que nada falle.
  FUENTES_COMENTARIOS,
  // El aviso por reseña negativa y sus dos umbrales. Se exportan porque lo que
  // hay que vigilar en esta función son justamente sus condiciones de silencio
  // (primer barrido, reseña vieja, rating por encima del umbral): si una se
  // rompe, no falla nada — simplemente se deja de avisar, o se avisa de más.
  alertarResenaNegativa, UMBRAL_RESENA_NEGATIVA, DIAS_RESENA_RECIENTE,
  // El caché de fichas por ciclo. Se exporta para poder probar sus dos reglas
  // sutiles: que una respuesta CON contacto sirve para quien no lo paga pero no
  // al revés, y que un fallo no se cachea.
  obtenerFichaGoogleCompartida,
};
