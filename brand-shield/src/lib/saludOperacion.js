// brand-shield/src/lib/saludOperacion.js
//
// «Si falla una venta, enterarse antes que el cliente» (réplica del auditor,
// 2026-10-07, §9). `/health` dice que el proceso vive y `/health/monitoreo` que
// el escaneo trabaja; esto dice si el DINERO fluye: cobros en duda o sin
// aplicar, webhooks atascados, trabajos programados que dejaron de correr y
// ráfagas de errores 5xx. Lo lee `GET /health/operacion`, que el monitor de
// Cloudflare sondea cada 5 min y avisa por correo lo NUEVO y la recuperación.
//
// ⚠️ Es pública (el monitor no tiene sesión): solo devuelve CONTEOS y nombres
// de trabajos. Ni correos, ni ids, ni importes. El detalle de un caso se ve con
// `scripts/caso-cliente.js` (docs/runbook-cobros.md).

const MIN = 60 * 1000;

// Trabajos cuyo silencio cuesta dinero o una obligación legal. Margen: dos
// ciclos y algo. (Si un trabajo no corre, `candados_job.tomadoEn` envejece.)
const TRABAJOS_CRITICOS = {
  'renovaciones-culqi': 26 * 60,
  'bajada-planes': 26 * 60,
  'reconciliacion-cobros': 70,
  'reintento-webhooks': 40,
  'libro-comisiones': 150,
  'envio-sunat': 40,
  'resumen-sunat': 40,
};

// Errores 5xx en memoria: el contador vive en el proceso (se pierde al
// reiniciar, que es aceptable — un reinicio ya es noticia en Railway).
const VENTANA_5XX_MS = 15 * MIN;
const UMBRAL_5XX = 10;
const errores5xx = [];
const registrar5xx = (ahora = Date.now()) => {
  errores5xx.push(ahora);
  while (errores5xx.length && errores5xx[0] < ahora - VENTANA_5XX_MS) errores5xx.shift();
};
const recientes5xx = (ahora = Date.now()) => errores5xx.filter((t) => t >= ahora - VENTANA_5XX_MS).length;

/**
 * { operacion: 'ok' | 'atencion', motivos: [...], conteos: {...} }.
 * `arrancadoEn`: cuándo arrancó el proceso — un trabajo no se da por detenido
 * si el proceso lleva vivo menos que su margen (acaba de desplegarse).
 */
async function veredicto(prisma, { ahora = Date.now(), arrancadoEn = 0, produccion = process.env.NODE_ENV === 'production' } = {}) {
  const hace = (m) => new Date(ahora - m * MIN);
  const [enDuda, sinAplicar, whPendientes, whFallidos, candados] = await Promise.all([
    prisma.intentoCobro.count({ where: { OR: [
      { estado: 'DESCONOCIDO', creadoEn: { lt: hace(5) } },
      { estado: 'PROCESANDO', creadoEn: { lt: hace(30) } },
    ] } }),
    prisma.intentoCobro.count({ where: { estado: 'EXITOSO', pagoId: null, creadoEn: { lt: hace(30) } } }),
    prisma.eventoWebhook.count({ where: { OR: [
      { estado: 'PENDIENTE', recibidoEn: { lt: hace(30) } },
      { estado: 'PROCESANDO', bloqueadoEn: { lt: hace(20) } },
    ] } }),
    // FALLIDO = agotó 8 intentos. Solo los de la última semana: uno viejo ya se
    // avisó y, si se quedara para siempre, taparía cualquier aviso nuevo.
    prisma.eventoWebhook.count({ where: { estado: 'FALLIDO', recibidoEn: { gt: hace(7 * 24 * 60) } } }),
    prisma.candadoJob.findMany({ where: { nombre: { in: Object.keys(TRABAJOS_CRITICOS) } }, select: { nombre: true, tomadoEn: true } }),
  ]);

  const motivos = [];
  if (enDuda) motivos.push(`cobros_en_duda:${enDuda}`);
  if (sinAplicar) motivos.push(`cobros_sin_aplicar:${sinAplicar}`);
  if (whPendientes) motivos.push(`webhooks_atascados:${whPendientes}`);
  if (whFallidos) motivos.push(`webhooks_fallidos:${whFallidos}`);

  // Los cron solo corren en producción (index.js): en local no hay nada que vigilar.
  const detenidos = [];
  if (produccion) {
    const vistos = Object.fromEntries(candados.map((c) => [c.nombre, new Date(c.tomadoEn).getTime()]));
    for (const [nombre, margenMin] of Object.entries(TRABAJOS_CRITICOS)) {
      if (ahora - arrancadoEn < margenMin * MIN) continue; // recién desplegado
      if (!vistos[nombre] || ahora - vistos[nombre] > margenMin * MIN) detenidos.push(nombre);
    }
  }
  // SUNAT solo corre con la emisión encendida: sin ella, sus trabajos no cuentan.
  const sunat = process.env.SUNAT_EMISION_ACTIVA === 'true';
  const detenidosReales = detenidos.filter((n) => sunat || !n.includes('sunat'));
  if (detenidosReales.length) motivos.push(`trabajo_detenido:${detenidosReales.join(',')}`);

  const n5xx = recientes5xx(ahora);
  if (n5xx >= UMBRAL_5XX) motivos.push(`errores_5xx:${n5xx}`);

  return {
    operacion: motivos.length ? 'atencion' : 'ok',
    motivos,
    conteos: { cobrosEnDuda: enDuda, cobrosSinAplicar: sinAplicar, webhooksAtascados: whPendientes, webhooksFallidos: whFallidos, errores5xx15min: n5xx },
  };
}

module.exports = { veredicto, registrar5xx, recientes5xx, TRABAJOS_CRITICOS, UMBRAL_5XX };
