// brand-shield/src/scrapers/tiktokMenciones.scraper.js
// Videos de TERCEROS que hablan de la marca. Nada que ver con
// tiktok.scraper.js, que trae los comentarios de TUS PROPIOS videos.
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTADO: seam preparado, SIN proveedor conectado. `configurado()` devuelve
// false y `buscarMencionesTikTok()` devuelve [] — el worker lo llama en cada
// ciclo y no pasa nada, no hay llamadas de red ni costo.
//
// POR QUÉ NO ESTÁ IMPLEMENTADO (esto no es un TODO que se resuelva escribiendo
// código: es un muro de la plataforma, verificado 2026-07-29):
//
//   · Display API (Login Kit) — es la que ya usamos vía OAuth. `video/list`
//     devuelve ÚNICAMENTE los videos del usuario autenticado. No existe endpoint
//     de búsqueda ni de menciones. No hay forma de llegar a videos ajenos.
//   · Research API — `/v2/research/video/query/` sí busca por keyword y hashtag,
//     que es exactamente lo que necesitamos, pero TikTok restringió la
//     elegibilidad a instituciones académicas y sin fines de lucro. Usar esas
//     credenciales para un caso comercial es causal de retiro del acceso.
//     Notoria no califica.
//   · Business API — solo métricas de la cuenta propia.
//   · Commercial Content API — solo publicidad, y solo UE.
//   · Las menciones con @ llegan a la bandeja de notificaciones de la app, pero
//     no hay API que la lea.
//
// O sea: la única vía es un proveedor de datos externo de pago (EnsembleData,
// Apify, etc.), que es una decisión de negocio pendiente. Ver CLAUDE.md §18.
//
// CÓMO SE ENCHUFA CUANDO SE DECIDA (no debería tocarse nada fuera de este
// archivo):
//   1. Setear MENCIONES_PROVEEDOR y MENCIONES_PROVEEDOR_API_KEY en Railway.
//   2. Implementar la búsqueda dentro de `consultarProveedor()` y mapear su
//      respuesta a la forma que devuelve este módulo (documentada abajo).
//   3. Listo: el worker, las alertas y el panel ya están cableados.
// ─────────────────────────────────────────────────────────────────────────────

const { clasificar } = require('../nlp/sentimiento');

const PROVEEDOR = process.env.MENCIONES_PROVEEDOR || null;
const API_KEY = process.env.MENCIONES_PROVEEDOR_API_KEY || null;

// Tope duro de resultados por término y por ciclo. Existe desde ya, antes de
// tener proveedor, porque estos servicios cobran POR RESULTADO: sin un techo,
// una marca con nombre común (ej. "La Panadería") puede disparar la factura en
// un solo ciclo.
const MAX_RESULTADOS_POR_TERMINO = Number(process.env.MENCIONES_MAX_POR_TERMINO || 20);

const configurado = () => !!(PROVEEDOR && API_KEY);

/**
 * Llamada real al proveedor. Hoy no hay ninguno conectado.
 *
 * Debe devolver un array de objetos crudos del proveedor; el mapeo a la forma
 * de Notoria se hace en `normalizar()`, así cambiar de proveedor solo toca
 * estas dos funciones.
 */
const consultarProveedor = async (termino) => {
  throw new Error(
    `Proveedor de menciones "${PROVEEDOR}" declarado pero no implementado. ` +
    `Ver el encabezado de tiktokMenciones.scraper.js.`
  );
};

/**
 * Forma que espera el resto del sistema:
 *   { externalId, texto, autorNombre, autorHandle, url,
 *     sentimiento, fechaMencion, contexto, metricas }
 *
 * `externalId` va prefijado con "tt_" porque Mencion.externalId es único global
 * y un id de TikTok podría chocar con uno de otra fuente.
 */
const normalizar = (video) => ({
  externalId: `tt_${video.id}`,
  texto: video.descripcion || '',
  autorNombre: video.autorNombre || 'Usuario TikTok',
  autorHandle: video.autorHandle ? `@${String(video.autorHandle).replace(/^@/, '')}` : null,
  url: video.url || null,
  sentimiento: clasificar(video.descripcion || ''),
  fechaMencion: video.creadoEn ? new Date(video.creadoEn) : null,
  contexto: (video.descripcion || '').slice(0, 200),
  metricas: {
    vistas: video.vistas ?? null,
    likes: video.likes ?? null,
    comentarios: video.comentarios ?? null,
    compartidos: video.compartidos ?? null,
  },
});

/**
 * Busca videos de terceros que mencionen alguno de los términos del negocio.
 * Devuelve [] si no hay proveedor configurado — nunca lanza hacia el worker.
 */
const buscarMencionesTikTok = async (terminos = []) => {
  if (!configurado() || !terminos.length) return [];

  const resultados = [];
  const vistos = new Set();

  for (const termino of terminos) {
    try {
      const crudos = await consultarProveedor(termino);
      for (const video of (crudos || []).slice(0, MAX_RESULTADOS_POR_TERMINO)) {
        const m = normalizar(video);
        // Un mismo video puede matchear dos términos (nombre y hashtag) —
        // dedupe acá para no gastar un upsert por cada uno.
        if (vistos.has(m.externalId)) continue;
        vistos.add(m.externalId);
        resultados.push(m);
      }
    } catch (error) {
      // Por término, no del bucle entero: mismo criterio que tiktok.scraper.js.
      // Un término que falla no debe hacer perder los resultados de los demás.
      console.error(`[TikTok menciones] Falló el término "${termino}": ${error.message}`);
    }
  }

  return resultados;
};

module.exports = { buscarMencionesTikTok, configurado, normalizar };
