// brand-shield/src/workers/reconciliacion.worker.js
//
// Dos trabajos que cierran lo que la auditoría del 2026-10-02 encontró abierto
// en el borde Culqi ↔ Postgres (P0-01, P0-04, P0-05 y A11):
//
//   · Reintento de webhooks: los eventos guardados en `eventos_webhook` que no
//     se pudieron procesar al llegar (lib/webhookInbox.js).
//
//   · Reconciliación de cobros: los `intentos_cobro` que quedaron a medias.
//       A) EXITOSO sin Pago  → Culqi cobró y la base falló al aplicar. Se trae
//          el cargo de Culqi y se aplica con la MISMA función que el alta
//          (lib/cobros.js `aplicar`) — nunca una copia de la lógica.
//       B) PROCESANDO viejo / DESCONOCIDO → no se sabe si Culqi cobró. Se busca
//          en Culqi el cargo con `metadata.intento = <id>`:
//            - existe y se cobró → pasa a A;
//            - existe y no se cobró, o no aparece en 24 h → FALLIDO (y se libera
//              la promo si se había reservado).
//     Cada acción avisa a contabilidad UNA vez (marca `revisadoEn`).
//
// Los dos corren con candado (lib/candado.js): con dos instancias, completar
// un cobro dos veces sería crear dos Pagos — lo impide además el @unique de
// `pagos.culqiCargoId`, pero el candado evita llegar a probarlo.

const prisma = require('../lib/prisma');
const culqi = require('../lib/culqi');
const cobros = require('../lib/cobros');
const promo = require('../lib/promo');
const webhookInbox = require('../lib/webhookInbox');
const { programar } = require('../lib/candado');

const MIN = 60 * 1000;
const aviso = (asunto, lineas) => require('../utils/emails').enviarAvisoInterno({ asunto, lineas })
  .catch((e) => console.error('[Reconciliación] No se pudo avisar:', e.message));

// ─── Webhooks ─────────────────────────────────────────────
const reintentarWebhooks = async () => {
  // El procesador de Culqi se registra al cargar pago.routes.js. En el proceso
  // de la API ya está cargado; esto lo garantiza si alguien llama al worker solo.
  if (!webhookInbox.procesadores.culqi) require('../api/routes/pago.routes');
  const n = await webhookInbox.reprocesarPendientes();
  if (n) console.log(`[Webhooks] ${n} evento(s) pendiente(s) reintentado(s)`);
  return n;
};

// ─── Cobros ───────────────────────────────────────────────
const completar = async (intento, cargo) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: intento.usuarioId } });
  if (!usuario) throw new Error(`usuario ${intento.usuarioId} no existe`);
  const pago = await cobros.aplicar({ intento, cargo, titular: usuario.nombre });
  if (pago) {
    const { emitirComprobante } = require('../services/comprobante.service');
    await emitirComprobante({ pago, usuario: await prisma.usuario.findUnique({ where: { id: usuario.id } }) });
  }
  console.log(`[Reconciliación] Cobro ${intento.culqiCargoId || cargo?.id} completado para ${usuario.email}`);
  await aviso(`Cobro reconciliado — ${usuario.email}`, [
    `El cargo ${cargo?.id || intento.culqiCargoId} (${(intento.monto / 100).toFixed(2)} ${intento.moneda}, ${intento.tipo}) se había cobrado sin aplicarse a la cuenta.`,
    'La reconciliación lo aplicó y registró el Pago. Revisar que el cliente vea su plan y su comprobante.',
  ]);
  return pago;
};

// Si un alta con promo quedó en duda y al final NO se cobró, la promo reservada
// se devuelve (si no, el cliente perdería el 50% por un cargo que no existió).
// Se busca por la clave del intento, no por cercanía en el tiempo (lib/promo.js).
const liberarPromoSiHace = async (intento) => {
  if (intento.tipo !== 'INICIAL' || !intento.detalle?.promo) return;
  await promo.liberar({ usuarioId: intento.usuarioId, clave: intento.clave });
};

const reconciliarCobros = async (ahora = Date.now()) => {
  if (!culqi.configurado()) return { completados: 0, fallidos: 0, pendientes: 0 };
  let completados = 0; let fallidos = 0; let pendientes = 0;

  // A) Cobrados y sin aplicar.
  const sinAplicar = await prisma.intentoCobro.findMany({
    where: { estado: 'EXITOSO', pagoId: null, culqiCargoId: { not: null }, creadoEn: { lt: new Date(ahora - 5 * MIN) } },
    take: 20,
  });
  for (const intento of sinAplicar) {
    try {
      const cargo = await culqi.obtenerCargo(intento.culqiCargoId);
      await completar(intento, cargo);
      completados += 1;
    } catch (e) {
      pendientes += 1;
      console.error(`[Reconciliación] 🔴 No se pudo completar ${intento.id}: ${e.message}`);
      if (!intento.revisadoEn) {
        await prisma.intentoCobro.update({ where: { id: intento.id }, data: { revisadoEn: new Date(), ultimoError: String(e.message).slice(0, 500) } }).catch(() => {});
        await aviso(`🔴 Cobro sin aplicar que la reconciliación no pudo completar`, [
          `Intento ${intento.id} · cargo ${intento.culqiCargoId} · ${intento.tipo} · ${(intento.monto / 100).toFixed(2)} ${intento.moneda}`,
          `Error: ${e.message}`, 'Se seguirá reintentando cada 30 min; si persiste, revisar a mano.',
        ]);
      }
    }
  }

  // B) En duda: ¿Culqi cobró o no?
  const enDuda = await prisma.intentoCobro.findMany({
    where: {
      OR: [
        { estado: 'DESCONOCIDO', creadoEn: { lt: new Date(ahora - 5 * MIN) } },
        { estado: 'PROCESANDO', creadoEn: { lt: new Date(ahora - 15 * MIN) } },
      ],
    },
    take: 20,
  });
  for (const intento of enDuda) {
    try {
      const usuario = await prisma.usuario.findUnique({ where: { id: intento.usuarioId }, select: { email: true } });
      const cargos = usuario ? await culqi.listarCargosDe(usuario.email) : [];
      const cargo = cargos.find((c) => c?.metadata?.intento === intento.id);
      if (cargo && culqi.cargoExitoso(cargo)) {
        const marcado = await prisma.intentoCobro.update({
          where: { id: intento.id },
          data: { estado: 'EXITOSO', culqiCargoId: cargo.id, completadoEn: new Date() },
        });
        await completar(marcado, cargo);
        completados += 1;
      } else if (cargo || ahora - new Date(intento.creadoEn).getTime() > 24 * 60 * MIN) {
        await prisma.intentoCobro.update({
          where: { id: intento.id },
          data: {
            estado: 'FALLIDO',
            completadoEn: new Date(),
            ultimoError: cargo ? 'Culqi registró el cargo como no cobrado' : 'Sin cargo en Culqi tras 24 h — no se cobró',
          },
        });
        await liberarPromoSiHace(intento);
        fallidos += 1;
        console.log(`[Reconciliación] Intento ${intento.id} resuelto como FALLIDO (no se cobró)`);
      } else {
        pendientes += 1;
        await prisma.intentoCobro.update({ where: { id: intento.id }, data: { revisadoEn: new Date() } });
      }
    } catch (e) {
      pendientes += 1;
      console.error(`[Reconciliación] No se pudo consultar Culqi para ${intento.id}: ${e.message}`);
    }
  }

  // C) Reservas de promo sin cobro detrás (el intento no existe o falló).
  await promo.liberarHuerfanas(ahora)
    .catch((e) => console.error('[Reconciliación] No se pudieron revisar las reservas de promo:', e.message));

  if (completados || fallidos || pendientes) {
    console.log(`[Reconciliación] completados ${completados} · fallidos ${fallidos} · pendientes ${pendientes}`);
  }
  return { completados, fallidos, pendientes };
};

const iniciarReintentoWebhooks = () => {
  programar('*/10 * * * *', 'reintento-webhooks', 9, () => reintentarWebhooks()
    .catch((e) => console.error('[Webhooks] Falló el reintento:', e.message)));
  console.log('[Webhooks] Reintento de eventos pendientes: cada 10 min');
};

const iniciarReconciliacionCobros = () => {
  programar('15,45 * * * *', 'reconciliacion-cobros', 25, () => reconciliarCobros()
    .catch((e) => console.error('[Reconciliación] Falló la pasada:', e.message)));
  console.log('[Reconciliación] Cobros a medias contra Culqi: cada 30 min');
};

module.exports = { iniciarReintentoWebhooks, iniciarReconciliacionCobros, reconciliarCobros, reintentarWebhooks };
