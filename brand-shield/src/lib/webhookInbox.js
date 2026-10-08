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
//
// 🔴 UNIQUE(proveedor, idExterno) impide guardar dos veces el mismo evento, NO
// ejecutar dos veces su procesador (réplica del auditor, 2026-10-07, P1-N01).
// La ruta procesa el evento recién guardado y el worker toma los PENDIENTE con
// `intentos === 0` sin esperar: los dos podían aplicar el mismo reembolso a la
// vez (dos correos, dos avisos, dos escrituras). Ahora procesar exige RECLAMAR el
// evento primero: PENDIENTE → PROCESANDO con un UPDATE condicional que compara
// también `intentos` (quien llega con una foto vieja no gana). Solo quien
// obtiene count = 1 ejecuta el procesador. `bloqueadoEn` es el arriendo: si el
// proceso muere a mitad, pasado ARRIENDO_MIN el evento se puede volver a reclamar.

const crypto = require('crypto');
const prisma = require('./prisma');

const MAX_INTENTOS = 8;
// Un procesador de reembolso tarda segundos; 15 min es holgado para no quitarle
// el evento a quien todavía lo está procesando.
const ARRIENDO_MIN = 15;
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

/**
 * Reclama el evento para procesarlo: PENDIENTE (o PROCESANDO con el arriendo
 * vencido) → PROCESANDO, y cuenta el intento. true = es de quien llama.
 */
const reclamar = async (evento, db = prisma, ahora = Date.now()) => {
  const r = await db.eventoWebhook.updateMany({
    where: {
      id: evento.id,
      intentos: evento.intentos || 0,
      OR: [
        { estado: 'PENDIENTE' },
        { estado: 'PROCESANDO', bloqueadoEn: { lt: new Date(ahora - ARRIENDO_MIN * 60000) } },
      ],
    },
    data: { estado: 'PROCESANDO', bloqueadoEn: new Date(ahora), intentos: { increment: 1 } },
  });
  return r.count === 1;
};

/**
 * Procesa un evento guardado. Nunca lanza: el resultado queda en la fila.
 * Devuelve el estado final, u 'OCUPADO' si otro proceso lo tiene reclamado.
 */
const procesar = async (evento, procesador, db = prisma) => {
  const fn = procesador || procesadores[evento.proveedor];
  if (!fn) {
    console.error(`[Webhook] Sin procesador para ${evento.proveedor} — queda PENDIENTE`);
    return 'PENDIENTE';
  }
  const intentos = (evento.intentos || 0) + 1; // el que se va a contar al reclamar
  if (!(await reclamar(evento, db))) {
    console.log(`[Webhook] ${evento.proveedor} ${evento.idExterno || evento.id} lo está procesando otro — no se repite`);
    return 'OCUPADO';
  }
  try {
    const r = await fn(evento);
    const estado = r === 'IGNORADO' ? 'IGNORADO' : 'PROCESADO';
    await db.eventoWebhook.update({
      where: { id: evento.id },
      data: { estado, procesadoEn: new Date(), ultimoError: null, bloqueadoEn: null },
    });
    return estado;
  } catch (error) {
    const estado = intentos >= MAX_INTENTOS ? 'FALLIDO' : 'PENDIENTE';
    console.error(`[Webhook] ${evento.proveedor} ${evento.tipo} (intento ${intentos}) falló: ${error.message}`);
    await db.eventoWebhook.update({
      where: { id: evento.id },
      data: { estado, ultimoError: String(error.message).slice(0, 500), bloqueadoEn: null },
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
const reprocesarPendientes = async (db = prisma, ahora = Date.now()) => {
  const pendientes = await db.eventoWebhook.findMany({
    where: {
      OR: [
        { estado: 'PENDIENTE' },
        // Reclamado por un proceso que murió a mitad: se recupera.
        { estado: 'PROCESANDO', bloqueadoEn: { lt: new Date(ahora - ARRIENDO_MIN * 60000) } },
      ],
    },
    orderBy: { recibidoEn: 'asc' },
    take: 50,
  });
  let hechos = 0;
  for (const ev of pendientes) {
    // La espera se cuenta desde la recepción, por escalones según los intentos.
    // Un evento recién llegado (0 intentos) lo procesa la ruta: el worker solo
    // lo toma si pasó un minuto y sigue sin reclamar (la ruta falló antes).
    const recibido = new Date(ev.recibidoEn).getTime();
    const listo = ev.estado === 'PROCESANDO'
      || (ev.intentos === 0 ? recibido + 60000 <= ahora : recibido + esperaMin(ev.intentos) * 60000 <= ahora);
    if (!listo) continue;
    if (await procesar(ev, null, db) !== 'OCUPADO') hechos += 1;
  }
  return hechos;
};

module.exports = { MAX_INTENTOS, ARRIENDO_MIN, reclamar, esperaMin, registrarProcesador, idExternoDe, recibir, procesar, reprocesarPendientes, procesadores };
