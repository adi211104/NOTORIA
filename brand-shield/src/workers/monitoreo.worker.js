// brand-shield/src/workers/monitoreo.worker.js
// Revisa todos los negocios activos cada 4 horas
// y dispara alertas cuando detecta anomalías

const cron = require('node-cron');
const { programar } = require('../lib/candado');
const cobros = require('../lib/cobros');
const prisma = require('../lib/prisma');
const { obtenerResenasGoogle, buscarNegocioEnGoogle } = require('../scrapers/google.scraper');
const { obtenerRatingFacebook, obtenerResenasFacebook } = require('../scrapers/facebook.scraper');
const { analizarResena, detectarAnomalias, requiereRevisionHumana } = require('../nlp/detector');
const { notificar, enviarAlertaEmail } = require('../alerts/notificador');
const { revisarDatosDeFicha, tocaLeerContacto } = require('../lib/fichaGoogle');
const { capacidades, planesCon, PLANES_DE_PAGO, ORDEN } = require('../lib/planes');
const { negociosVigilables } = require('../lib/equipo');
const dormancia = require('../lib/dormancia');
const temasLib = require('../lib/temas');

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

// ── El diagnóstico que acompaña a la alerta ─────────────────────────────────
//
// Una alerta que solo dice «llegó una reseña de 1★» obliga al dueño a abrir el
// panel, leer las últimas reseñas y sacar su propia conclusión — y como eso
// cuesta trabajo, no lo hace, y a la tercera alerta deja de abrirlas.
//
// Esto contesta la pregunta siguiente antes de que la haga: ¿es un caso suelto o
// es LO MISMO otra vez? Sale de reseñas que ya están en la base, así que no
// cuesta ninguna llamada externa.
//
// 🔴 Viaja como DATOS, no como frase. `detalle.diagnostico` lleva números y un
// id de tema; el texto lo componen el panel y el correo en el idioma del
// usuario. Es la regla que ya costó un bug en las invitaciones de equipo y otro
// en los propios correos de alerta.
//
// ⚠️ Si algo falla acá, la alerta sale IGUAL y sin diagnóstico. El aviso es lo
// importante; el contexto es una mejora, y una mejora nunca puede impedir que
// el cliente se entere de que le cayó una reseña de 1★.
const DIAS_CONTEXTO_DIAGNOSTICO = 60;
const MINIMO_PARA_HABLAR_DE_PATRON = 3;

const diagnosticarResena = async (negocio, resena) => {
  try {
    const desde = new Date(Date.now() - DIAS_CONTEXTO_DIAGNOSTICO * 24 * 3600 * 1000);
    const recientes = await prisma.resena.findMany({
      where: { negocioId: negocio.id, rating: { lte: UMBRAL_RESENA_NEGATIVA }, fechaResena: { gte: desde } },
      select: { id: true, rating: true, texto: true, respondida: true },
    });

    const sinResponder = recientes.filter((r) => !r.respondida && r.id !== resena.id).length;

    // ¿Esta reseña repite una queja que ya se venía repitiendo?
    const temasDeEsta = temasLib.temasDe(resena.texto, negocio.tipo);
    let patron = null;
    if (temasDeEsta.length) {
      const dist = temasLib.distribucion(recientes, 'es', negocio.tipo);
      // Se busca el tema de ESTA reseña que más se repite en las demás, no el
      // tema más frecuente en general: lo que aporta es la conexión con lo que
      // el cliente acaba de leer.
      const coincidencias = temasDeEsta
        .map((t) => dist.temas.find((d) => d.id === t.id))
        .filter(Boolean)
        .sort((a, b) => b.veces - a.veces)[0];
      if (coincidencias && coincidencias.veces >= MINIMO_PARA_HABLAR_DE_PATRON) {
        patron = { tema: coincidencias.id, veces: coincidencias.veces, deCuantas: dist.conTexto };
      }
    }

    // Sin patrón y sin cola pendiente no hay nada que añadir. Devolver un objeto
    // de ceros haría que el panel pintase una línea vacía debajo de cada alerta.
    if (!patron && sinResponder === 0) return null;

    return { patron, sinResponder, dias: DIAS_CONTEXTO_DIAGNOSTICO };
  } catch (e) {
    console.warn('[Reseñas] no se pudo diagnosticar:', e.message);
    return null;
  }
};

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
        // Contexto: ¿es un caso suelto o LO MISMO otra vez? Ver diagnosticarResena.
        diagnostico: await diagnosticarResena(negocio, resena),
      },
      negocioId: negocio.id,
    },
  });

  // 🔴 `notificada` se marca SOLO si de verdad salió un correo, y este es el
  // punto donde el agrupado de reseñas se rompe en silencio si alguien lo cambia.
  // Marcarla a ciegas —que es lo que se hacía hasta el 2026-09-09— pone el
  // contador del lote a cero en cada reseña, así que las cinco no se juntan nunca
  // y el plan gratuito vuelve a recibir un correo por reseña sin que nada falle.
  // Ver alerts/notificador.js.
  const avisado = await notificar({ usuario: negocio.usuario, negocio, alerta });
  if (avisado) await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
  console.log(`[Reseñas] ${negocio.nombre}: ${resena.rating}★ de ${autor} — alerta ${alerta.id}${avisado ? '' : ' (en espera del lote)'}`);
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

// ── Cada cuánto se relee un COMPETIDOR ──────────────────────────────────────
//
// 🔴 Hasta el 2026-08-25 no había ninguna: cada competidor se refrescaba en CADA
// ciclo del dueño, o sea a la cadencia de SU plan. Como Franquicia escanea cada
// hora y admite 15 competidores por negocio, un solo local costaba
// 15 × 720 = 10 800 consultas a Places al mes **solo en rivales** — bastante más
// que el plan entero que lo paga. Dicho de otra forma: los competidores costaban
// más que el negocio vigilado, y el precio por consulta no baja aunque el plan
// suba, así que cuanto más caro el plan, peor el margen.
//
// Y no hacía ninguna falta. Lo que se hace con estos datos es comparar mes
// contra mes (`lib/progreso.js`) y pintar el rating del rival en el panel:
// ninguna de las dos cosas cambia entre las 10:00 y las 11:00. Una lectura al
// día da exactamente la misma información y corta el costo dominante ×6 en
// NEGOCIO y ×24 en FRANQUICIA.
//
// ⚠️ Efecto secundario y es una MEJORA, no una regresión: la ficha del
// competidor enseña el delta entre sus dos últimos snapshots. Antes eran dos
// lecturas separadas por una hora, que casi siempre daban cero; ahora son dos
// días, que es un dato que significa algo.
//
// El reloj es la fecha del ÚLTIMO `SnapshotCompetidor`, no una columna nueva —
// el mismo criterio con el que el cron dejó de depender de `ultimoEscaneo`.
//
// ── 2026-09-19: de 24 h a 7 DÍAS, y el argumento de arriba llevado hasta el final
//
// Todo lo que dice el párrafo anterior sobre las 24 h vale igual —y más— para la
// semana: lo que se hace con estos datos es comparar MES contra mes. Y ya no es
// una intuición, está medido: §13 leyó los cinco negocios más antiguos con 49
// días de datos reales y sus ratings daban **4.8→4.8, 3.9→3.9, 4.0→4.0, 4.5→4.5**.
// Un rating de competidor no se mueve en un mes. Releerlo cada día era pedir 30
// veces un número que cambia cada trimestre.
//
// 🔑 Y no rompe ninguna promesa publicada: el catálogo promete CUÁNTOS
// competidores se vigilan, nunca con qué frecuencia se releen (comprobado en
// `web/src/lib/catalogo.js` y `web/src/lib/planes.js`). Es la única palanca de
// costo del producto que es literalmente invisible para el cliente.
//
// Lo que cambia en la factura, medido: el margen bruto pasa de 55→75% en
// IMPULSO, 50→67% en NEGOCIO y 42→58% en FRANQUICIA, porque con la cadencia
// alta el competidor era el costo DOMINANTE: 15 rivales × 30 lecturas al mes
// eran más consultas que el propio negocio vigilado.
//
// ⚠️ El efecto secundario vuelve a ser una mejora, por el mismo motivo que en el
// párrafo de arriba: el delta que enseña la ficha del rival pasa de un día a una
// semana, y una semana es un intervalo en el que un rating puede moverse de
// verdad. Un delta que casi siempre da cero es ruido que ocupa sitio.
const HORAS_COMPETIDOR = 24 * 7;

// Un competidor NO paga su propia consulta si esa ficha ya se pidió en el ciclo.
//
// Dos formas de reutilizar, y la primera es la que más ahorra:
//
//   1. El place ID ya está en `ctx.fichasGoogle` porque es un NEGOCIO
//      monitoreado de esta misma pasada. Eso pasa constantemente y va a pasar
//      más: el competidor de uno es el cliente de otro, y en una plataforma de
//      reputación vendida por rubro y por ciudad eso es la norma, no la
//      excepción. Ahí el competidor sale **gratis**, porque la llamada del
//      negocio ya trajo `nombreEnGoogle`, `ratingActual` y `totalResenas`.
//   2. Otro negocio ya pidió ese MISMO competidor en este ciclo
//      (`ctx.competidores`). Todos los rivales de un rubro siguen a los mismos
//      tres o cuatro grandes.
//
// ⚠️ La reutilización va en UNA sola dirección. Una lectura de competidor pide
// solo Basic Data (`buscarNegocioEnGoogle`) y no trae `reviews`, así que NO
// puede servirle a un negocio monitoreado. Por eso son dos cachés separados y
// `ctx.competidores` nunca alimenta a `ctx.fichasGoogle`. Al revés sí, porque la
// ficha completa es un superconjunto — es la misma asimetría que ya gobierna
// `conContacto` en `obtenerFichaGoogleCompartida`.
const obtenerCompetidorCompartido = async (placeId, ctx = {}) => {
  const deNegocio = ctx.fichasGoogle?.get(placeId);
  if (deNegocio?.datos) {
    console.log(`[Worker] Competidor ${placeId} salió de la ficha de un negocio del ciclo (0 llamadas)`);
    return {
      nombre: deNegocio.datos.nombreEnGoogle,
      rating: deNegocio.datos.ratingActual,
      totalResenas: deNegocio.datos.totalResenas,
    };
  }

  const guardado = ctx.competidores?.get(placeId);
  if (guardado) {
    console.log(`[Worker] Competidor ${placeId} reutilizado del ciclo (una llamada menos a Places)`);
    return guardado;
  }

  const info = await buscarNegocioEnGoogle(placeId);
  // Un `null` no se cachea: heredar el fallo ajeno convierte un error en varios
  // justo cuando se agota la cuota, que es cuando más importa. Misma regla que
  // en `obtenerFichaGoogleCompartida`.
  if (info && ctx.competidores) ctx.competidores.set(placeId, info);
  return info;
};

// Aplica el corte por locales contratados a una lista mezclada de varios
// dueños. Se agrupa por cuenta porque el tope es por CUENTA, no global.
const elegirVigilables = (negocios) => {
  const porCuenta = new Map();
  for (const n of negocios) {
    if (!porCuenta.has(n.usuarioId)) porCuenta.set(n.usuarioId, []);
    porCuenta.get(n.usuarioId).push(n);
  }
  const salida = [];
  for (const lista of porCuenta.values()) {
    const dueno = lista[0].usuario;

    // ── El corte por abandono, hermano del corte por locales de la línea de abajo
    //
    // Una cuenta gratuita que dejó de entrar —o que nunca verificó su correo—
    // deja de consumir Places. Ver `lib/dormancia.js` para los dos motivos y por
    // qué los planes de pago nunca entran acá.
    //
    // ⚠️ Va ANTES de `negociosVigilables` a propósito: si la cuenta está dormida
    // no hay nada que repartir entre locales contratados, y hacerlo al revés
    // gastaría el cálculo para tirarlo después.
    //
    // ⚠️ No borra, no desactiva y no toca ningún dato — igual que el corte por
    // asientos y el de locales. En cuanto la persona entra, `ultimoAcceso` se
    // actualiza y el negocio vuelve al barrido en el ciclo siguiente.
    const motivo = dormancia.motivoDormida(dueno);
    if (motivo) {
      console.log(`[Worker] ${lista.length} negocio(s) en pausa — cuenta ${dueno?.email || dueno?.id}: ${motivo}`);
      continue;
    }

    salida.push(...negociosVigilables(lista, dueno?.plan, dueno?.localesExtra));
  }
  return salida;
};

const procesarNegocio = async (negocio, ctx = {}) => {
  console.log(`[Worker] Procesando: ${negocio.nombre} (${negocio.id})`);

  // ── GOOGLE ────────────────────────────────────────────────
  if (negocio.googlePlaceId) {
    // Los datos de contacto (teléfono, horario, dirección) solo se piden en los
    // planes que los incluyen: son del grupo Contact Data de Places y se
    // facturan aparte. Ver lib/fichaGoogle.js.
    // ⚠️ `tocaLeerContacto`, no `puedeVigilarFicha` a secas. Tener derecho a la
    // vigilancia de contacto y necesitar releerla AHORA son dos preguntas
    // distintas: el teléfono y el horario de un negocio cambian una o dos veces
    // en su vida, así que se piden una vez al día en vez de en cada escaneo
    // (ver HORAS_CONTACTO). La ficha cerrada no depende de esto — va en Basic
    // Data y se sigue mirando en cada ciclo.
    const datos = await obtenerFichaGoogleCompartida(
      negocio.googlePlaceId,
      tocaLeerContacto(negocio),
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

        // Auto-respuesta a reseñas positivas — solo los planes que la incluyen.
        //
        // 🔴 Era `plan !== 'GRATIS'`, o sea que dejaba pasar a IMPULSO, que NO
        // la incluye (planes.js) — la lista a mano que §8.6 prohíbe, en forma
        // de negación. Y una 5★ puede hablar de una intoxicación, una amenaza
        // o una denuncia (sarcasmo, o un cliente que puntúa alto y cuenta algo
        // grave): esas NO se contestan con una plantilla de agradecimiento
        // publicada sola (auditoría 2026-10-02, P1-04). Las decide una persona.
        if (resenaCreada.rating >= 4 && negocio.autoRespuestaActiva
          && capacidades(negocio.usuario.plan).autoRespuesta
          && !requiereRevisionHumana(resenaCreada)) {
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

        // Notificar al usuario, y marcar la alerta SOLO si salió correo: la
        // bandera significa «un correo cubre esta alerta», no «ya la procesamos».
        // Ver alerts/notificador.js.
        if (await notificar({
          usuario: negocio.usuario,
          negocio,
          alerta: { ...alerta, ...alertaData },
        })) {
          await prisma.alerta.update({
            where: { id: alerta.id },
            data: { notificada: true },
          });
        }
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
    // `sinValoraciones` no es lo mismo que `0★`: ver la nota en el scraper. De
    // una página que todavía no tiene ninguna reseña no hay nota que guardar, y
    // apuntar un 0 haría que la primera reseña pareciera una subida de golpe.
    if (rating && !rating.sinValoraciones) {
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
      // ¿Primer barrido de esta página? Se pregunta ANTES de guardar nada, igual
      // que en Google: gobierna el silencio del aviso por reseña negativa, y una
      // página recién conectada entrega de golpe reseñas que pueden ser viejas.
      const esPrimerBarridoFB = (await prisma.resena.count({
        where: { negocioId: negocio.id, plataforma: 'FACEBOOK' },
      })) === 0;

      // El texto duplicado necesita con qué comparar. Sin esta lista,
      // `analizarResena` se llamaba con un solo argumento y la señal de campaña
      // coordinada NUNCA se evaluaba en Facebook — no fallaba nada, simplemente
      // no miraba.
      const hace90dFB = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const previasFB = await prisma.resena.findMany({
        where: { negocioId: negocio.id, detectadaEn: { gte: hace90dFB }, texto: { not: null } },
        orderBy: { detectadaEn: 'desc' },
        take: 200,
        select: { externalId: true, texto: true },
      });

      for (const resena of resenas) {
        const analisis = analizarResena(resena, [
          ...previasFB,
          ...resenas.filter((r) => r.externalId !== resena.externalId),
        ]);

        const yaExistia = await prisma.resena.findUnique({
          where: { plataforma_externalId: { plataforma: 'FACEBOOK', externalId: resena.externalId } },
        });
        if (yaExistia) continue;

        let creada;
        try {
          creada = await prisma.resena.create({
            data: {
              plataforma: 'FACEBOOK',
              externalId: resena.externalId,
              rating: resena.rating,
              texto: resena.texto,
              autorNombre: resena.autorNombre,
              autorResenasTotal: resena.autorResenasTotal ?? null,
              fechaResena: resena.fechaResena,
              esSospechosa: analisis.esSospechosa,
              motivoSospecha: analisis.motivoSospecha,
              // Solo Facebook lo manda: `true` significa que la estrella la
              // derivamos nosotros de un «recomienda / no recomienda». Se guarda
              // para que el panel pueda decirlo en vez de fingir una precisión
              // que la plataforma no da. `?? null` y no `?? false`: en las demás
              // fuentes no es que la estrella sea real, es que la pregunta no
              // aplica.
              sinEstrella: resena.sinEstrella ?? null,
              negocioId: negocio.id,
            },
          });
        } catch (e) {
          continue; // carrera con otro ciclo — ignorar
        }

        // 🔴 Esto faltaba, y era el mismo agujero que tuvo Google hasta el
        // 2026-08-22: sin esta llamada, una recomendación negativa de Facebook
        // se guardaba en la base y NO producía alerta, ni correo, ni nada en el
        // panel. Se añade ahora y no cuando llegue el permiso, porque el día que
        // llegue nadie va a acordarse de que faltaba.
        await alertarResenaNegativa(negocio, creada, esPrimerBarridoFB)
          .catch((e) => console.error(`[Facebook] Error avisando de la reseña: ${e.message}`));
      }

      const alertasFB = await detectarAnomalias(negocio.id, 'FACEBOOK', rating);
      for (const alertaData of alertasFB) {
        const alerta = await prisma.alerta.create({ data: alertaData });
        if (await notificar({ usuario: negocio.usuario, negocio, alerta: { ...alerta, ...alertaData } })) {
          await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
        }
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
  // Refresca rating y total de reseñas, pero con CADENCIA PROPIA (ver
  // HORAS_COMPETIDOR arriba): una vez al día, no una vez por ciclo del dueño.
  try {
    const competidores = await prisma.competidor.findMany({ where: { negocioId: negocio.id } });
    if (competidores.length) {
      // La última lectura de todos, en UNA consulta. Con 15 competidores por
      // negocio, preguntar uno por uno serían 15 consultas a la base por ciclo
      // para decidir que no hay que hacer nada.
      const ultimas = await prisma.snapshotCompetidor.groupBy({
        by: ['competidorId'],
        where: { competidorId: { in: competidores.map((c) => c.id) } },
        _max: { tomadoEn: true },
      });
      const ultimaDe = new Map(ultimas.map((u) => [u.competidorId, u._max.tomadoEn]));
      const corte = Date.now() - HORAS_COMPETIDOR * 60 * 60 * 1000;

      for (const comp of competidores) {
        const ultima = ultimaDe.get(comp.id);
        // Un competidor recién agregado no tiene ningún snapshot, así que se lee
        // de inmediato: si esperara a mañana, el cliente lo agrega y ve una fila
        // vacía sin ninguna explicación. Es el mismo motivo por el que el botón
        // "Escanear ahora" no tiene cooldown en un negocio recién conectado.
        if (ultima && ultima.getTime() > corte) continue;

        const info = await obtenerCompetidorCompartido(comp.googlePlaceId, ctx);
        if (!info) continue;
        await prisma.competidor.update({
          where: { id: comp.id },
          data: { ratingActual: info.rating, totalResenas: info.totalResenas },
        });
        await prisma.snapshotCompetidor.create({
          data: { ratingActual: info.rating, totalResenas: info.totalResenas, competidorId: comp.id },
        });
      }
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
// La cadencia sale de la tabla de planes (lib/planes.js), no de una copia local:
// era una de las cinco tablas por plan repartidas por el backend, y la que más
// caro sale desincronizar — gobierna cuántas consultas a Places paga cada cuenta.
//
// Se sigue exportando con esta forma porque `negocio.routes.js` y
// `utils.routes.js` la recorren para armar el cooldown del botón "Escanear
// ahora": derivarla acá mantiene esos dos sitios funcionando y, sobre todo,
// hace que un plan nuevo aparezca solo en el cooldown en vez de quedar fuera.
const HORAS_ESCANEO = Object.fromEntries(
  ORDEN.map((plan) => [plan, capacidades(plan).horasEscaneo])
);

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
// ⚠️ La cadencia se le pregunta a `dormancia.horasEscaneo(usuario)` y ya NO a
// `HORAS_ESCANEO[plan]` a secas: el plan gratuito corre a 24 h su primer mes y
// después a 72 h, así que el número depende del USUARIO y no solo del plan.
// `HORAS_ESCANEO` se conserva para el cooldown del botón manual, que sí es por
// plan — son dos relojes distintos, como ya lo eran el del cron y el del botón.
const leTocaEscaneo = (negocio, ultimoSnapshotEn, ahora = Date.now()) => {
  const horas = dormancia.horasEscaneo(negocio.usuario, ahora);
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
  programar('0 * * * *', 'monitoreo', 58, async () => {
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
              // 🔴 `localesExtra` NO es opcional, y faltaba desde que existen los
              // locales de pago. `elegirVigilables` se lo pasa a
              // `negociosVigilables`, y sin él llega `undefined` →
              // `negociosPermitidos(plan, undefined)` devuelve **1** → a un
              // cliente que pagó cuatro locales el worker le vigilaría UNO y
              // dejaría los otros tres fuera del barrido **en silencio**: no
              // borra, no desactiva, no avisa. El cliente vería el historial de
              // tres de sus fichas congelarse sin un solo error en pantalla.
              //
              // No había mordido porque hoy nadie tiene locales extra (medido:
              // 0 cuentas). Habría mordido el día del primer cobro de un local,
              // que es exactamente el escenario que §19 dejó anotado como «sin
              // ejercitar nunca con dinero real».
              localesExtra: true,
              // Los tres que necesita `lib/dormancia.js`. Sin ellos
              // `motivoDormida` recibe `undefined` y devuelve `null`, o sea que
              // falla ABIERTO: nadie duerme nunca y la palanca no hace nada, sin
              // que falle absolutamente nada. Es el mismo agujero que ya tuvieron
              // `idioma` y `prefsAlertas` en este mismo select.
              emailVerificado: true,
              creadoEn: true,
              ultimoAcceso: true,
            },
          },
        },
      });

      // 🔴 Corte por locales pagados, ANTES de mirar a quién le toca escanear.
      //
      // Desde el 2026-08-25 los locales se cobran de a uno. Sin este corte,
      // contratar diez locales un mes y bajar a uno dejaría diez fichas
      // vigiladas para siempre —cada una gastando consultas a Places que ya no
      // paga nadie—, porque el tope solo se comprobaba al CREAR el negocio.
      // Es el gemelo del corte por asientos del equipo, y por el mismo motivo.
      //
      // No se desactiva ni se borra nada: los negocios siguen ahí y vuelven a
      // vigilarse en cuanto el cliente vuelva a pagarlos.
      const vigilables = elegirVigilables(negocios);
      if (vigilables.length !== negocios.length) {
        console.log(`[Worker] ${negocios.length - vigilables.length} negocio(s) fuera de los locales contratados`);
      }

      const ahora = Date.now();
      const ultimos = await ultimosEscaneos(vigilables.map((n) => n.id));
      // El snapshot manda; `ultimoEscaneo` solo entra como reloj de reserva para
      // los negocios sin ficha de Google, que nunca generan snapshot (ver abajo).
      const toca = vigilables.filter((n) => leTocaEscaneo(n, ultimos.get(n.id) ?? n.ultimoEscaneo, ahora));
      console.log(`[Worker] ${toca.length} de ${vigilables.length} negocio(s) tocan en esta pasada`);

      // Procesar secuencialmente para no saturar las APIs.
      //
      // No se escribe `ultimoEscaneo`: es el reloj del botón manual, y el cron no
      // debe gastárselo al usuario (ver la nota de leTocaEscaneo). El registro de
      // esta pasada lo deja el propio Snapshot que crea `procesarNegocio`.
      // Una ficha compartida por dos cuentas se pide UNA vez por ciclo (ver
      // `obtenerFichaGoogleCompartida`). El caché muere con la pasada.
      const fichasGoogle = new Map();
      // Y el mismo truco para los competidores, que son el grueso del gasto:
      // uno seguido por varios clientes se pide UNA vez, y si además es un
      // negocio monitoreado sale gratis de `fichasGoogle`.
      const competidores = new Map();

      // Se atiende primero a quien va a pedir los datos de contacto en ESTA
      // pasada. Si uno que no los pide fuera primero, dejaría cacheada una
      // respuesta SIN contacto que no le sirve al que sí los necesita, y habría
      // que pedirla otra vez: el caché no ahorraría nada justo en el caso mixto.
      //
      // ⚠️ El criterio es `tocaLeerContacto` y no `puedeVigilarFicha`: desde que
      // el contacto se relee una vez al día, un negocio de plan de pago pasa la
      // mayoría de los ciclos SIN pedirlo, y ordenar por el plan mandaría
      // primero a quien esta vez no lo necesita.
      toca.sort((x, y) => Number(tocaLeerContacto(y)) - Number(tocaLeerContacto(x)));

      for (const negocio of toca) {
        await procesarNegocio(negocio, { fichasGoogle, competidores });
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

  // 🔴 La lista se DERIVA de la tabla de planes, no se escribe a mano. Estuvo
  // anunciando «Franquicia 1h» después de que pasara a 2 h, y sin IMPULSO desde
  // que ese plan existe — o sea que el log que uno mira para comprobar la
  // cadencia afirmaba lo que ya era falso. Es el mismo fallo que §8.6 persigue,
  // en el único sitio donde no rompe nada y por eso nadie lo mira: un texto.
  const cadencias = ORDEN.map((p) => `${capacidades(p).id} ${capacidades(p).horasEscaneo}h`).join(' · ');
  console.log(`[Worker] Cron job configurado: cada hora, con intervalo por plan (${cadencias})`);
  console.log(`[Worker] Plan gratuito: ${capacidades('GRATIS').horasEscaneo}h los primeros ${capacidades('GRATIS').diasPruebaCompleta} días, después ${capacidades('GRATIS').horasEscaneoTrasPrueba}h; se pausa a los ${dormancia.DIAS_INACTIVIDAD} días sin entrar`);
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
      // ⚠️ Los mismos campos que el select del cron, y por los mismos motivos —
      // ver allá. Los dos alimentan `elegirVigilables`, así que si se separan,
      // `ejecutarAhora` se comporta distinto que el barrido automático.
      usuario: {
        select: {
          id: true, email: true, nombre: true, prefsAlertas: true, plan: true, idioma: true,
          localesExtra: true, emailVerificado: true, creadoEn: true, ultimoAcceso: true,
        },
      },
    },
  });
  // Mismo caché por pasada que en el cron: `ejecutarAhora` sin `negocioId`
  // recorre la plataforma entera, que es justo donde más fichas se repiten.
  const fichasGoogle = new Map();
  const competidores = new Map();
  negocios.sort((x, y) => Number(tocaLeerContacto(y)) - Number(tocaLeerContacto(x)));
  for (const negocio of negocios) {
    await procesarNegocio(negocio, { fichasGoogle, competidores });
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
    const avisadoComentario = await notificar({ usuario: negocio.usuario, negocio, alerta });
    // ⚠️ `ComentarioSocial.notificada` SÍ se marca siempre, y es otra cosa: sin
    // ella cada ciclo reprocesaría el mismo comentario. La de la ALERTA es la que
    // ahora significa «salió correo».
    await prisma.comentarioSocial.update({ where: { id: comentario.id }, data: { notificada: true } });
    if (avisadoComentario) await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
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
        const avisadaMencion = await notificar({ usuario: negocio.usuario, negocio, alerta });
        // ⚠️ `Mencion.notificada` SÍ se marca siempre, por lo mismo que el
        // comentario: sin ella cada ciclo reenviaría la misma mención.
        await prisma.mencion.update({ where: { id: mencion.id }, data: { notificada: true } });
        if (avisadaMencion) await prisma.alerta.update({ where: { id: alerta.id }, data: { notificada: true } });
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
  programar('0 8 1 * *', 'reportes-mensuales', 180, async () => {
    console.log('[Reportes] Generando reportes mensuales...');
    const { enviarReporteMensual } = require('../utils/reporte.generator');

    const negocios = await prisma.negocio.findMany({
      where: {
        activo: true,
        usuario: { plan: { in: planesCon('reporteMensual') } },
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
  programar('0 8 * * *', 'resumen-alertas', 120, async () => {
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
  programar('0 5 * * *', 'renovaciones-culqi', 120, async () => {
    const culqi = require('../lib/culqi');
    const { emitirComprobante } = require('../services/comprobante.service');
    const { enviarCobroFallido } = require('../utils/emails');
    if (!culqi.configurado()) return;

    // Misma fuente que el alta de suscripción (pago.routes.js). Estos valores
    // estaban duplicados acá y se desincronizaron una vez; ahora se importan.
    const { MONEDA, montoSuscripcion } = require('../lib/precios');

    const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);

    const usuarios = await prisma.usuario.findMany({
      where: {
        suscripcionActiva: true,
        tarjetaCulqiId: { not: null },
        // 🔴 PLANES_DE_PAGO, nunca una lista escrita a mano. Un plan de pago que
        // falte en este filtro se cobra UNA VEZ y no se renueva jamás: el
        // cliente conserva el plan gratis para siempre y no hay error, ni log,
        // ni cargo fallido que lo delate. Es el fallo más caro del backend y el
        // único que no produce ninguna señal.
        plan: { in: PLANES_DE_PAGO },
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
        // 🔴 `montoSuscripcion`, el MISMO cálculo que el alta — incluidos los
        // locales adicionales que el cliente paga aparte. Si esta renovación
        // cobrara solo el plan, quien contrató cuatro locales los pagaría una
        // vez y los conservaría gratis para siempre: ni error, ni log, ni cargo
        // fallido. Es exactamente el fallo que ya tuvo este cron cuando cobraba
        // el precio mensual a los suscriptores anuales, por tener su propia
        // copia de los precios.
        const precioBase = montoSuscripcion(usuario.plan, periodo === 'anual', usuario.localesExtra);
        // Promo de bienvenida (50% los primeros 2 meses, solo mensual): si a la
        // cuenta le queda algún mes de promo pendiente, esta renovación también
        // se cobra con el descuento y se descuenta el contador.
        const enPromo = periodo === 'mensual' && usuario.mesesPromoRestantes > 0;
        const monto = enPromo ? Math.round(precioBase / 2) : precioBase;

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

        // 🔴 Por lib/cobros.js, con una clave atada a ESTE vencimiento
        // (auditoría 2026-10-02, P0-01/02). Antes: cobrar → update → `pago.create`
        // con un `.catch` que devolvía null. Si la base fallaba tras el cobro, el
        // vencimiento no avanzaba y al día siguiente el cron COBRABA OTRA VEZ el
        // mismo periodo. Ahora la segunda pasada choca contra la clave y no llega
        // a Culqi; la reconciliación completa la primera. Un rechazo del banco
        // corre el vencimiento 3 días (abajo), así que el reintento es otra clave.
        const { cargo, intento } = await cobros.cobrar({
          clave: `renovacion:${usuario.id}:${new Date(usuario.fechaVencimiento).toISOString()}`,
          usuarioId: usuario.id,
          tipo: 'RENOVACION',
          plan: usuario.plan,
          periodo,
          monto,
          moneda: MONEDA, // ver lib/precios.js
          email: usuario.email,
          sourceId: usuario.tarjetaCulqiId,
          descripcion: `Notoria — Renovación plan ${usuario.plan} (${periodo})`
            + (usuario.localesExtra ? ` + ${usuario.localesExtra} local(es)` : '')
            + (enPromo ? ' — promo 50% bienvenida' : ''),
          detalle: { fechaVencimiento: fechaVencimiento.toISOString(), descontarPromo: enPromo },
        });

        let pago = null;
        try {
          pago = await cobros.aplicar({ intento, cargo, titular: usuario.nombre });
        } catch (e) {
          // El cobro YA ocurrió: no es un «cobro fallido» y no debe contar como
          // intento ni mandar el correo de tarjeta rechazada. La reconciliación
          // lo completa; contabilidad se entera ahora.
          console.error(`[Culqi] 🔴 Renovación de ${usuario.email} COBRADA (${cargo?.id}) pero sin aplicar:`, e.message);
          require('../utils/emails').enviarAvisoInterno({
            asunto: `🔴 Renovación cobrada sin aplicar — ${usuario.email}`,
            lineas: [`Cargo ${cargo?.id} · intento ${intento.id}`, `Error: ${e.message}`, 'La reconciliación lo completa sola en ≤30 min.'],
          }).catch(() => {});
          continue;
        }

        // Comprobante de la renovación, igual que en el cobro inicial
        if (pago) await emitirComprobante({ pago, usuario });

        console.log(`[Culqi] Renovación cobrada a ${usuario.email}`);
      } catch (error) {
        // Dos fallos que NO son «la tarjeta rechazó» y no deben contarse como
        // intento ni mandar el correo de cobro fallido:
        //  · COBRO_DUPLICADO: la clave de este vencimiento ya tiene un cobro
        //    (exitoso a medias o en curso). Cobrar otra vez es el error caro.
        //  · DESCONOCIDO: Culqi no contestó; puede que SÍ haya cobrado.
        // Los dos los resuelve la reconciliación.
        if (error.codigo === 'COBRO_DUPLICADO' || error.estadoIntento === 'DESCONOCIDO') {
          console.error(`[Culqi] Renovación de ${usuario.email} en duda (${error.codigo || error.estadoIntento}) — la resuelve la reconciliación, no se reintenta`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        const motivo = error.response?.data?.user_message || error.message;
        console.error(`[Culqi] Falló la renovación de ${usuario.email}:`, motivo);

        const periodo = usuario.periodoFacturacion === 'anual' ? 'anual' : 'mensual';
        const precioBase = montoSuscripcion(usuario.plan, periodo === 'anual', usuario.localesExtra);
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
            data: { plan: 'GRATIS', suscripcionActiva: false, tarjetaCulqiId: null, periodoFacturacion: null },
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
        // Se manda la FECHA, no el texto: el correo la formatea en el idioma
        // del destinatario. Formatearla acá con 'es-PE' metía «29 de agosto» en
        // medio de un párrafo en inglés.
        const proximoIntento = new Date(Date.now() + DIAS_ENTRE_INTENTOS * 86400000);
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
  programar('30 5 * * *', 'bajada-planes', 30, async () => {
    try {
      const vencidos = await prisma.usuario.findMany({
        where: {
          suscripcionActiva: false,
          // Mismo motivo que la renovación: un plan de pago ausente de esta
          // lista nunca baja a GRATIS, así que cancelar lo regalaría de por vida.
          plan: { in: PLANES_DE_PAGO },
          fechaVencimiento: { lte: new Date() },
        },
        select: { id: true, email: true, plan: true },
      });
      for (const u of vencidos) {
        await prisma.usuario.update({
          where: { id: u.id },
          data: { plan: 'GRATIS', tarjetaCulqiId: null, periodoFacturacion: null, fechaVencimiento: null },
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
      negocio: { activo: true, usuario: { plan: { in: planesCon('escalacionUrgencias') } } },
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
  programar('0 */4 * * *', 'escalacion-urgencias', 60, revisarEscalacionesUrgentes);
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
  programar('0 9 * * *', 'plazos-reclamaciones', 30, revisarPlazosReclamaciones);
  console.log('[Reclamaciones] Cron de plazos configurado: 9:00 AM diario');
};

module.exports = {
  iniciarMonitoreo, ejecutarAhora, HORAS_ESCANEO, leTocaEscaneo,
  // Los dos frenos de costo de Places. Se exportan porque lo que hay que
  // vigilar en ellos no produce ninguna señal cuando se rompe: si la cadencia
  // del competidor vuelve a ser la del dueño, o si el caché deja de reutilizar,
  // no falla nada — solo sube la factura de Google, que no distingue de quién
  // fue cada consulta. Ver `scripts/prueba-costo-places.js`.
  HORAS_COMPETIDOR, obtenerCompetidorCompartido,
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
  // Para `scripts/ensayo-detector.js`: es la única señal del detector que crea
  // la alerta ella misma (las demás las devuelve `detectarAnomalias` y las
  // persiste el worker), así que ejercitarla en vivo exige llamarla directa.
  revisarFichaGoogle,
};
