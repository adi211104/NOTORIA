// brand-shield/src/lib/webhookInbox.js
//
// Bandeja durable de webhooks (auditoría 2026-10-02, P0-04 y P0-05).
//
// Antes, el webhook de Culqi procesaba el evento en el acto y ante CUALQUIER
// error contestaba 200 «recibido»: el proveedor lo daba por entregado, no
// reintentaba, y el cambio (un reembolso) se perdía sin dejar rastro. Ahora:
//
//   recibir()  → guarda el evento (tabla `eventos_webhook`). Si ya existía (mismo
//                proveedor + id externo) es un reintento del proveedor: duplicado.
//   procesar() → lo aplica con el procesador registrado. Si falla, queda
//                PENDIENTE con el error, y `workers/webhooks.worker.js` lo
//                reintenta con espera creciente. Al agotar los intentos pasa a
//                FALLIDO y se avisa a contabilidad.
//
// El id externo es el `id` del evento si el proveedor lo manda; si no, un hash
// del cuerpo (dos entregas idénticas = el mismo evento).

const crypto = require('crypto');
const prisma = require('./prisma');

const MAX_INTENTOS = 8;
// Espera antes del reintento N (minutos): 5, 15, 30, 60, 120, 240, 480...
const esperaMin = (intentos) => Math.min(480, 5 * 2 ** Math.max(0, intentos - 1)) + (intentos > 1 ? 5 : 0);

const procesadores = {};
const registrarProcesador = (proveedor, fn) => { procesadores[proveedor] = fn; };

const idExternoDe = (cuerpo) => {
  if (cuerpo && typeof cuerpo.id === 'string' && cuerpo.id.trim()) return cuerpo.id.trim().slice(0, 200);
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(cuerpo ?? null)).digest('hex')}`;
};

/** Guarda el evento. Devuelve la fila, o `{ duplicado: true }` si ya existía. */
const recibir = async ({ proveedor, cuerpo }, db = prisma) => {
  const idExterno = idExternoDe(cuerpo);
  try {
    return await db.eventoWebhook.create({
      data: {
        proveedor,
        idExterno,
        tipo: typeof cuerpo?.type === 'string' ? cuerpo.type.slice(0, 120) : null,
        payload: cuerpo ?? {},
      },
    });
  } catch (e) {
    if (e.code === 'P2002') {
      console.log(`[Webhook] ${proveedor} ${idExterno} ya recibido — reintento del proveedor, no se reaplica`);
      return { duplicado: true };
    }
    throw e;
  }
};

/** Procesa un evento guardado. Nunca lanza: el resultado queda en la fila. */
const procesar = async (evento, procesador, db = prisma) => {
  const fn = procesador || procesadores[evento.proveedor];
  if (!fn) {
    console.error(`[Webhook] Sin procesador para ${evento.proveedor} — queda PENDIENTE`);
    return 'PENDIENTE';
  }
  try {
    const r = await fn(evento);
    const estado = r === 'IGNORADO' ? 'IGNORADO' : 'PROCESADO';
    await db.eventoWebhook.update({
      where: { id: evento.id },
      data: { estado, intentos: { increment: 1 }, procesadoEn: new Date(), ultimoError: null },
    });
    return estado;
  } catch (error) {
    const intentos = (evento.intentos || 0) + 1;
    const estado = intentos >= MAX_INTENTOS ? 'FALLIDO' : 'PENDIENTE';
    console.error(`[Webhook] ${evento.proveedor} ${evento.tipo} (intento ${intentos}) falló: ${error.message}`);
    await db.eventoWebhook.update({
      where: { id: evento.id },
      data: { estado, intentos, ultimoError: String(error.message).slice(0, 500) },
    }).catch((e) => console.error('[Webhook] No se pudo registrar el fallo:', e.message));
    if (estado === 'FALLIDO') {
      const { enviarAvisoInterno } = require('../utils/emails');
      enviarAvisoInterno({
        asunto: `🔴 Webhook sin procesar — ${evento.proveedor} ${evento.tipo || ''}`,
        lineas: [
          `El evento ${evento.idExterno} lleva ${intentos} intentos fallidos y dejó de reintentarse.`,
          `Último error: ${error.message}`,
          'Está guardado en la tabla eventos_webhook con todo su contenido: revisar, corregir y volver a ponerlo en PENDIENTE.',
        ],
      }).catch(() => {});
    }
    return estado;
  }
};

/** Reintenta los pendientes cuya espera ya pasó. Lo llama el worker. */
const reprocesarPendientes = async (db = prisma) => {
  const pendientes = await db.eventoWebhook.findMany({
    where: { estado: 'PENDIENTE' },
    orderBy: { recibidoEn: 'asc' },
    take: 50,
  });
  const ahora = Date.now();
  let hechos = 0;
  for (const ev of pendientes) {
    // La espera se cuenta desde la recepción, por escalones según los intentos.
    const listo = new Date(ev.recibidoEn).getTime() + esperaMin(ev.intentos) * 60000 <= ahora || ev.intentos === 0;
    if (!listo) continue;
    await procesar(ev, null, db);
    hechos += 1;
  }
  return hechos;
};

module.exports = { MAX_INTENTOS, esperaMin, registrarProcesador, idExternoDe, recibir, procesar, reprocesarPendientes, procesadores };
