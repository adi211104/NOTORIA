// brand-shield/src/api/routes/pago.routes.js
// Integración con Culqi — cargo inicial + tarjeta guardada para renovación mensual.
// Ver src/workers/monitoreo.worker.js (iniciarRenovacionesCulqi) para el cobro recurrente.

const express = require('express');
const prisma = require('../../lib/prisma');
const culqi = require('../../lib/culqi');
const tributario = require('../../lib/tributario');
const { emitirComprobante, pdfDeComprobante } = require('../../services/comprobante.service');
const { enviarCancelacion, enviarReembolso, enviarAvisoAnulacionPendiente } = require('../../utils/emails');
const anulacion = require('../../lib/anulacionPendiente');
const { autenticar, permitir } = require('../middlewares/auth.middleware');

const router = express.Router();

// Moneda y precios viven en lib/precios.js — el cron de renovación lee los
// mismos valores desde ahí. Culqi recibe la moneda explícita en cada cargo.
const { MONEDA, montoSuscripcion, precioLocal } = require('../../lib/precios');
const { etiquetaDe, puede: planPuede, PLANES_DE_PAGO } = require('../../lib/planes');
const locales = require('../../lib/localesExtra');

const cobros = require('../../lib/cobros');
const promo = require('../../lib/promo');
const webhookInbox = require('../../lib/webhookInbox');
const { ORDEN } = require('../../lib/planes');
const { planEfectivo } = require('../../lib/suscripcion');
const { enviarAvisoInterno } = require('../../utils/emails');

// 🔴 Ya no existe `registrarPago()`, que se tragaba su propio error y devolvía
// null: si la base fallaba después de cobrar, el cliente quedaba cobrado y sin
// Pago, y en Notoria no quedaba ningún rastro (auditoría 2026-10-02, P0-01).
// Todo cobro pasa ahora por `lib/cobros.js`, que registra el intento ANTES de
// llamar a Culqi y aplica el resultado en una sola transacción.

// Un cobro que salió pero no se pudo aplicar es URGENTE: el cliente pagó y no
// tiene su plan. La reconciliación lo completa sola en ≤30 min; esto es para
// que una persona se entere AHORA y no al leer los logs.
const avisarCobroSinAplicar = ({ intento, cargo, usuario, error }) => {
  enviarAvisoInterno({
    asunto: `🔴 Cobro sin aplicar — ${usuario.email}`,
    lineas: [
      `Culqi cobró el cargo ${cargo?.id} (${(intento.monto / 100).toFixed(2)} ${intento.moneda}, ${intento.tipo}) pero la base falló al aplicarlo.`,
      `Intento: ${intento.id} · clave ${intento.clave}`,
      `Error: ${error?.message}`,
      'La reconciliación (cada 30 min) lo completa sola. Si en una hora sigue sin Pago, revisar a mano.',
    ],
  }).catch((e) => console.error('[Cobro] No se pudo avisar del cobro sin aplicar:', e.message));
};

// Respuestas para los dos fallos de cobro que NO son «la tarjeta rechazó».
const respuestaDeCobroFallido = (error) => {
  if (error?.codigo === 'COBRO_DUPLICADO') {
    return {
      status: 409,
      cuerpo: {
        error: 'Este pago ya se está procesando o ya se hizo. No lo repitas: revisa tu Facturación en unos minutos.',
        codigo: 'COBRO_DUPLICADO',
      },
    };
  }
  if (error?.estadoIntento === cobros.ESTADO.DESCONOCIDO) {
    // Culqi no contestó: puede que SÍ haya cobrado. Decirle «falló, reintenta»
    // es como se cobra dos veces. La reconciliación lo resuelve contra Culqi.
    console.error(`[Cobro] Intento ${error.intento?.id} DESCONOCIDO — Culqi no contestó:`, error.message);
    return {
      status: 502,
      cuerpo: {
        error: 'El procesador de pagos no respondió a tiempo y no sabemos todavía si el cobro se hizo. No vuelvas a pagar: lo verificamos en minutos y, si se cobró, activamos tu plan solos.',
        codigo: 'COBRO_EN_VERIFICACION',
      },
    };
  }
  return null;
};

// ── POST /api/pagos/culqi/webhook ─────────────────────────
// Culqi notifica aquí los reembolsos. Sin autenticación de sesión: lo llama
// Culqi directamente, así que va protegido con un secreto propio.
//
// ⚠️ Tres detalles de la API de Culqi que este endpoint tuvo mal desde que se
// escribió (corregidos el 2026-08-14, verificados contra los plugins oficiales
// de Culqi para WooCommerce y PrestaShop). Los tres eran silenciosos: el
// webhook respondía 200 y no hacía absolutamente nada.
//
//   1. Los tipos de evento de Culqi se componen `<recurso>.<acción>.<resultado>`.
//      El de un reembolso es `refund.creation.succeeded`. Los nombres al estilo
//      Stripe que había aquí (`charge.refunded`, `charge.dispute.created`,
//      `order.expired`) NO existen en Culqi y nunca podían coincidir.
//   2. `data` viaja como **cadena JSON** dentro del cuerpo, no como objeto:
//      `req.body.data.email` daba `undefined` aunque el tipo hubiera coincidido.
//   3. El evento de reembolso **no trae el correo** del cliente, trae `chargeId`.
//      Buscar por `culqiCargoId` es además más preciso que por correo: apunta al
//      cobro exacto que se devolvió y no a todos los de esa persona.
//
// Culqi no expone webhook de contracargos: las controversias se vigilan desde
// el panel, no llegan por aquí.
const EVENTO_REEMBOLSO = 'refund.creation.succeeded';

// El secreto se acepta por query (`?secret=`) o por autenticación básica, que
// es lo que activa el interruptor "Activar autenticación" del panel de Culqi.
// Con básica el secreto viaja en la cabecera y no queda escrito en la URL, que
// es lo que queda guardado a la vista en el propio panel.
//
// 🔴 Sin secreto configurado, en PRODUCCIÓN se rechaza todo (auditoría
// 2026-10-02, P0-03). Antes era «si falta, acepto»: bastaba con que la variable
// se perdiera en un cambio de servicio de Railway para que cualquiera pudiera
// mandar un `refund.creation.succeeded` inventado y apagar la suscripción de un
// cliente. En un webhook que mueve el estado de cobros, el fallo tiene que ser
// cerrado. Fuera de producción se acepta, para poder probar en local.
const iguales = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  // timingSafeEqual exige el mismo largo; comparar los largos primero filtra
  // solo eso, que no es secreto (el panel de Culqi ya limita a 20 caracteres).
  return x.length === y.length && x.length > 0 && require('crypto').timingSafeEqual(x, y);
};

const webhookAutorizado = (req) => {
  const esperado = process.env.CULQI_WEBHOOK_SECRET;
  if (!esperado) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Culqi webhook] 🔴 CULQI_WEBHOOK_SECRET sin definir en producción — se rechaza todo evento');
      return false;
    }
    return true;
  }

  if (req.query.secret && iguales(req.query.secret, esperado)) return true;

  const cabecera = req.headers?.authorization || '';
  if (!cabecera.startsWith('Basic ')) return false;
  const [usuario, clave] = Buffer.from(cabecera.slice(6), 'base64').toString('utf8').split(':');
  return iguales(clave, esperado) || iguales(usuario, esperado);
};

const datosDelEvento = (body) => {
  const bruto = body?.data;
  if (typeof bruto !== 'string') return bruto || null;
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
};

// Marca el cobro devuelto en Facturación y decide qué le pasa a la suscripción
// SEGÚN QUÉ se devolvió (auditoría 2026-10-02, P0-06).
//
// 🔴 Antes cualquier reembolso hacía `suscripcionActiva = false`. Pero un Pago
// puede ser la cuota del plan, un local adicional cobrado a mitad de periodo o
// una prueba, y devolver un local no es cancelar el plan. Ahora:
//
//   · cuota (INICIAL / RENOVACION) del periodo VIGENTE, devuelta ENTERA → la
//     suscripción termina hoy: se apaga la renovación y el vencimiento pasa a
//     ahora, así que el plan efectivo cae a GRATIS en el acto (lib/suscripcion.js)
//     — es lo que pasa con el retracto de 7 días. Antes conservaba el plan hasta
//     el final del periodo SIN haberlo pagado.
//   · cuota de un periodo VIEJO, o devuelta en PARTE (p. ej. días de una caída,
//     /devoluciones c) → el servicio sigue; solo se registra.
//   · LOCAL_ADICIONAL → no se toca el plan; contabilidad decide si se resta el
//     local (no se adivina: el cliente pudo haberlo vuelto a pagar).
//   · PRUEBA → solo se registra.
//
// Idempotente: un reembolso que ya figura no repite correos ni efectos.
const CUOTAS = ['INICIAL', 'RENOVACION'];

// ¿Este Pago es la cuota que paga el periodo de HOY? Solo devolver esa termina
// la suscripción: devolver la de hace tres meses no dice nada del mes en curso.
const esUltimaCuota = async (pago) => {
  if (!CUOTAS.includes(pago.tipo)) return false;
  const ultima = await prisma.pago.findFirst({
    where: { usuarioId: pago.usuarioId, estado: 'EXITOSO', tipo: { in: CUOTAS } },
    orderBy: { creadoEn: 'desc' },
    select: { id: true },
  });
  return ultima?.id === pago.id;
};

// Puro, para poder probarlo sin base (scripts/prueba-auditoria.js).
const efectoDeReembolso = ({ pago, total, ultimoCuota }) => {
  if (pago.tipo === 'LOCAL_ADICIONAL') return 'REVISAR_LOCAL';
  if (!CUOTAS.includes(pago.tipo)) return 'SOLO_REGISTRO';
  if (total && ultimoCuota) return 'TERMINA_SUSCRIPCION';
  return 'SOLO_REGISTRO';
};

const procesarReembolso = async (datos) => {
  // ⚠️ Tiene que ser una CADENA. El cuerpo lo arma quien llame al webhook (va
  // protegido por secreto, pero el secreto no valida la forma del JSON) y este
  // valor entra directo a un `findUnique` de Prisma: un objeto ahí no es una
  // búsqueda, es un filtro con otra semántica.
  const bruto = datos?.chargeId || datos?.charge_id || datos?.id;
  const cargoId = typeof bruto === 'string' ? bruto.trim() : null;
  if (!cargoId) {
    console.error('[Culqi webhook] Reembolso sin chargeId — no se puede saber qué cobro se devolvió');
    return;
  }

  const pago = await prisma.pago.findUnique({
    where: { culqiCargoId: cargoId },
    select: {
      id: true, usuarioId: true, culqiCargoId: true, estado: true, comprobante: true,
      monto: true, moneda: true, tipo: true, creadoEn: true, montoReembolsado: true,
      // 🔴 `idioma` no es opcional: sin él el aviso de reembolso sale siempre en
      // español, sin fallar y sin dejar rastro. Es la mitad que se olvida —
      // prueba-correos-idioma.js §4 la vigila leyendo este mismo fuente.
      usuario: { select: { email: true, nombre: true, idioma: true } },
    },
  });
  if (!pago) {
    // Puede ser legítimo (un cargo hecho fuera de Notoria), pero si empieza a
    // repetirse es que los cobros no se están registrando.
    console.error(`[Culqi webhook] Reembolso del cargo ${cargoId}, que no está en la tabla pagos`);
    return;
  }

  // Cuánto se devolvió. Si el evento no lo trae, se asume el cargo entero, que
  // es lo que se hacía siempre (y lo que hace scripts/reembolsar-cargo.js).
  const montoEvento = Number(datos?.amount);
  const devuelto = Number.isFinite(montoEvento) && montoEvento > 0 ? montoEvento : pago.monto;
  const acumulado = Math.min(pago.monto, (pago.montoReembolsado || 0) + devuelto);
  const total = acumulado >= pago.monto;

  if (pago.estado === 'REEMBOLSADO') {
    console.log(`[Culqi webhook] El cargo ${cargoId} ya figuraba como reembolsado — sin efectos nuevos`);
    return;
  }

  const efecto = efectoDeReembolso({ pago, total, ultimoCuota: await esUltimaCuota(pago) });

  await prisma.$transaction(async (tx) => {
    await tx.pago.update({
      where: { id: pago.id },
      data: { estado: total ? 'REEMBOLSADO' : pago.estado, montoReembolsado: acumulado },
    });
    if (efecto === 'TERMINA_SUSCRIPCION') {
      await tx.usuario.update({
        where: { id: pago.usuarioId },
        data: { suscripcionActiva: false, fechaVencimiento: new Date() },
      });
    }
  });
  console.log(`[Culqi webhook] Reembolso ${total ? 'total' : 'parcial'} del cargo ${cargoId} (${pago.tipo}) → ${efecto}`);

  if (efecto === 'REVISAR_LOCAL' || !total) {
    const u = await prisma.usuario.findUnique({ where: { id: pago.usuarioId }, select: { email: true, localesExtra: true } });
    enviarAvisoInterno({
      asunto: total ? `Reembolso de local adicional — ${u?.email}` : `Reembolso PARCIAL — ${u?.email}`,
      lineas: total
        ? [`Se devolvió el cargo ${cargoId} (${(pago.monto / 100).toFixed(2)} ${pago.moneda}), que era un LOCAL ADICIONAL.`,
          `El plan NO se tocó. La cuenta tiene hoy localesExtra = ${u?.localesExtra}. Si el local devuelto ya no debe cobrarse, bajarlo desde su panel o a mano.`]
        : [`Se devolvieron ${(devuelto / 100).toFixed(2)} de ${(pago.monto / 100).toFixed(2)} ${pago.moneda} del cargo ${cargoId} (${pago.tipo}).`,
          'La suscripción sigue activa. Un reembolso PARCIAL de un comprobante aceptado no se anula: corresponde una NOTA DE CRÉDITO por el importe devuelto.'],
    }).catch((e) => console.error('[Culqi webhook] No se pudo avisar a contabilidad:', e.message));
  }

  // El cliente no se enteraba por ningún sitio de que se le devolvió el dinero.
  // Va con su propio catch, igual que el aviso de anulación: un fallo del correo
  // no puede tumbar el webhook, o Culqi lo reintentaría y acabaría desactivando
  // la suscripción de eventos.
  if (pago.usuario?.email) {
    await enviarReembolso(pago.usuario, { monto: devuelto, moneda: pago.moneda })
      .catch((e) => console.error('[Cobro] No se pudo avisar del reembolso:', e.message));
  }

  // 🔴 Devolver el dinero NO anula el comprobante ante SUNAT, y el plazo para
  // anularlo son 7 días. Sin este aviso queda declarada una venta cuyo importe
  // se devolvió — con su IGV a pagar. Se descubrió haciéndolo a mano en la
  // primera prueba de cobro real: alguien tuvo que ACORDARSE, y con un cliente
  // de verdad eso no ocurre.
  //
  // Va con su propio catch: un fallo del correo no puede tumbar el webhook, o
  // Culqi lo reintentaría y acabaría desactivando la suscripción de eventos.
  const pagoReembolsado = { ...pago, estado: total ? 'REEMBOLSADO' : pago.estado };
  if (total && anulacion.necesitaAnulacion(pago.comprobante, pagoReembolsado)) {
    await enviarAvisoAnulacionPendiente({
      comprobante: pago.comprobante,
      pago: pagoReembolsado,
      diasRestantes: anulacion.diasRestantes(pago.comprobante),
      comando: anulacion.comandoParaAnular(pago.comprobante),
      primerAviso: true,
    }).catch((e) => console.error('[Anulación] No se pudo avisar del comprobante pendiente:', e.message));
  }
};

router.post('/culqi/webhook', async (req, res) => {
  if (!webhookAutorizado(req)) {
    // Se registra el RECHAZO, no solo el paso. Sin esta línea, un webhook mal
    // configurado en el panel de Culqi (contraseña equivocada, secreto viejo)
    // no dejaba ningún rastro: los logs se veían exactamente igual que si Culqi
    // no hubiera llamado nunca, que es el caso que hay que poder descartar.
    // Nunca se registra la credencial recibida, solo por dónde vino.
    const via = req.query.secret ? 'query' : (req.headers?.authorization ? 'cabecera' : 'sin credencial');
    console.error(`[Culqi webhook] RECHAZADO (401) — llegó ${req.body?.type || 'un evento'} con credencial inválida por ${via}`);
    return res.status(401).json({ error: 'No autorizado' });
  }

  // 🔴 Bandeja durable (auditoría 2026-10-02, P0-04/05). Antes el handler
  // procesaba directo y, si algo fallaba, igual contestaba 200 «recibido»: Culqi
  // daba el evento por entregado y no reintentaba, y el reembolso se perdía sin
  // rastro. Ahora:
  //   1. el evento se GUARDA primero; si ni eso se puede (base caída), se
  //      contesta 500 y Culqi reintenta — ahí sí es lo correcto;
  //   2. ya guardado, se procesa; si falla queda PENDIENTE y lo reintenta
  //      `workers/webhooks.worker.js`, con aviso a contabilidad si no sale;
  //   3. `@@unique([proveedor, idExterno])`: un reintento de Culqi del mismo
  //      evento no se aplica dos veces.
  let evento;
  try {
    evento = await webhookInbox.recibir({ proveedor: 'culqi', cuerpo: req.body });
  } catch (error) {
    console.error('[Culqi webhook] 🔴 No se pudo GUARDAR el evento — se pide reintento:', error.message);
    return res.status(500).json({ recibido: false });
  }
  if (evento.duplicado) return res.json({ recibido: true, duplicado: true });

  await webhookInbox.procesar(evento, procesarEventoCulqi);
  res.json({ recibido: true });
});

// El procesador de UN evento de Culqi. Lo llaman el webhook y el worker que
// reintenta los pendientes: lanzar = «no se pudo, reintentar».
const procesarEventoCulqi = async (evento) => {
  const tipo = evento.tipo;
  console.log(`[Culqi webhook] ${tipo}`);
  if (tipo === EVENTO_REEMBOLSO) {
    await procesarReembolso(datosDelEvento(evento.payload));
    return 'PROCESADO';
  }
  // Los demás se registran en vez de ignorarse en silencio: si algún día se
  // suscribe otro evento en el panel, o Culqi renombra uno, esto es lo único
  // que lo delata.
  console.log(`[Culqi webhook] Evento sin manejar: ${tipo}`);
  return 'IGNORADO';
};
webhookInbox.registrarProcesador('culqi', procesarEventoCulqi);

router.use(autenticar);
// Toda la facturación es del propietario, sin excepciones: también las lecturas.
// El historial de pagos y los comprobantes llevan el nombre del titular, su
// documento y su domicilio fiscal — datos personales del dueño que no tienen por
// qué ver el encargado del local ni el community manager.
router.use(permitir('facturacion'));

// ── Cobro de prueba: RETIRADO el 2026-08-23, después de usarse ────────────
//
// Hubo aquí un `POST /api/pagos/prueba-sunat` y una pantalla en
// `/dashboard/prueba-pago` que cobraban S/1 para ejercitar el circuito entero
// en producción. Cumplieron su función —ver §19 B1— y se retiraron el mismo día:
// un endpoint que cobra a una tarjeta y gasta un correlativo fiscal no debe
// quedarse vivo esperando a que alguien lo llame por accidente.
//
// Si hace falta repetirlo tras tocar la facturación, están en el commit
// `6129adf`: `git show 6129adf -- src/api/routes/pago.routes.js` y
// `git show 6129adf -- brand-shield-web/src/app/dashboard/prueba-pago/page.js`.
// Antes de usarlos, correr `scripts/sonda-sunat-produccion.js`, que es lo que
// evitó cobrar con las credenciales rotas.

// ── POST /api/pagos/culqi ──────────────────────────────────
// Recibe el token del widget de Checkout, guarda la tarjeta y cobra el primer periodo.
router.post('/culqi', async (req, res) => {
  // `sinPromo` lo manda el frontend cuando el usuario ya fue avisado de que su
  // tarjeta no tiene derecho al descuento y aun así quiere pagar el precio de
  // lista. Sin esto, el 409 de abajo se repetiría en cada reintento y esa
  // tarjeta no podría suscribirse nunca.
  // `localesExtra` son los locales POR ENCIMA del que incluye el plan. Se cobran
  // aparte (ver lib/precios.js) y solo los admiten los planes que los venden: en
  // cualquier otro, `montoSuscripcion` los ignora en vez de cobrarlos, porque
  // este número llega del navegador y un valor inventado no puede acabar en un
  // cargo a una tarjeta.
  const { token, plan, anual, sinPromo, localesExtra } = req.body;

  if (!culqi.configurado()) {
    return res.status(501).json({
      error: 'Los pagos están en proceso de habilitación. Te avisaremos cuando estén disponibles.',
      estado: 'PENDIENTE_CULQI',
    });
  }

  // ⚠️ `PLANES_DE_PAGO`, no «¿tiene fila en PRECIOS?». Son la misma pregunta hoy
  // y dejan de serlo en cuanto exista un plan con precio que no se venda solo
  // (uno heredado, uno de prueba). Y de paso el mensaje deja de enumerar los
  // planes a mano, que era otra lista que envejecía sola: decía
  // «NEGOCIO|FRANQUICIA» desde antes de que existiera IMPULSO.
  if (!token || !PLANES_DE_PAGO.includes(plan)) {
    return res.status(400).json({
      error: `token y plan (${PLANES_DE_PAGO.join('|')}) son requeridos`,
    });
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    // ⚠️ `precioBase` incluye los locales adicionales, y tiene que incluirlos:
    // de él dependen el umbral de identificación de SUNAT (art. 8: desde S/700
    // hay que identificar al comprador) y el importe del comprobante. Con tres
    // locales de Franquicia anual se pasan los S/700 largamente, así que
    // calcularlo sin los extras dejaría de pedir los datos fiscales justo en
    // las ventas más grandes — y el comprobante saldría por menos de lo cobrado.
    const extras = Math.max(0, Math.trunc(Number(localesExtra) || 0));
    const puedeLocales = planPuede(plan, 'localesAdicionales');

    // 🔴 TOPE POR ARRIBA, y no estaba. `localesExtra` llega del cuerpo de la
    // petición: el selector del panel lo acota a 50, pero eso es una cortesía
    // del navegador, no una defensa. Sin esto, un cuerpo con
    // `localesExtra: 10000` en Franquicia anual pasaba entero a
    // `montoSuscripcion` y salía un cargo de **S/9.48 millones** — con su
    // comprobante fiscal detrás, su correlativo gastado y su declaración.
    //
    // Se RECHAZA en vez de acotar en silencio: acotar cobraría un importe
    // distinto del que el widget acaba de enseñar, que es justo el fallo que
    // este archivo ya arrastró una vez (S/30 mostrado, S/29.50 cobrado).
    // `POST /api/pagos/locales` ya lo comprobaba con `validarCambio`; el alta
    // era la puerta que quedaba abierta.
    if (puedeLocales && extras > locales.maximoExtra(plan)) {
      return res.status(400).json({
        error: `Una cuenta admite hasta ${locales.MAX_LOCALES_TOTALES} locales.`,
        codigo: 'DEMASIADOS_LOCALES',
      });
    }
    const precioBase = montoSuscripcion(plan, anual, extras);

    // 🔴 BAJAR de plan no pasa por aquí (auditoría 2026-10-02, P0-09). Este
    // alta aplica el plan nuevo AL MOMENTO y le suma el periodo a lo ya pagado:
    // a quien sube le regala días, pero a quien BAJA le convertía los días ya
    // pagados del plan caro en días del barato, sin devolverle nada — y
    // /devoluciones promete que la bajada «se hace efectiva al terminar el
    // periodo que ya pagaste». Ahora se cumple: se rechaza antes de cobrar y se
    // explica el camino (cancelar la renovación y elegir el plan menor cuando
    // termine lo pagado).
    const actual = planEfectivo(usuario);
    const quedaPeriodo = usuario.fechaVencimiento && new Date(usuario.fechaVencimiento) > new Date();
    // Lo mismo para pasar de ANUAL a MENSUAL en el mismo plan: /devoluciones
    // dice que «se aplica al vencer la anualidad», y este alta lo aplicaba ya.
    const anualAMensual = plan === actual && !anual && usuario.periodoFacturacion === 'anual';
    if (quedaPeriodo && (ORDEN.indexOf(plan) < ORDEN.indexOf(actual) || anualAMensual)) {
      return res.status(409).json({
        error: `Tienes el ${etiquetaDe(actual)} pagado hasta el ${new Date(usuario.fechaVencimiento).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}. `
          + (anualAMensual ? 'Para pasar a mensual' : 'Para bajar de plan') + ', cancela la renovación en Configuración → Suscripción: conservas lo que pagaste hasta esa fecha y entonces eliges el nuevo plan, sin perder nada.',
        codigo: 'BAJADA_AL_VENCER',
      });
    }

    // obtenerOCrearCliente, NO crearCliente: Culqi rechaza un segundo customer
    // con el mismo correo, así que reintentar una suscripción fallaría siempre.
    // Identificación obligatoria por importe (RS 007-99, art. 8): desde S/700
    // el comprobante debe identificar al comprador. Hoy solo lo cruza el plan
    // Franquicia anual.
    //
    // Se comprueba ANTES de crear nada en Culqi: cobrar y descubrir después que
    // no se puede emitir el comprobante deja al cliente pagado y sin documento,
    // que es la peor de las salidas. Se mira `precioBase` y no el importe con
    // promo porque la promo solo aplica a la facturación mensual, y ningún
    // importe mensual llega al umbral.
    if (tributario.requiereIdentificacion(precioBase)) {
      const receptor = tributario.receptorDesdeUsuario(usuario);
      const tipoFiscal = tributario.tipoFiscalPara({ docTipo: receptor.tipoDoc, paisFiscal: receptor.pais });
      const falta = tributario.validarReceptorParaSunat({ receptor, tipoFiscal, total: precioBase });
      if (falta) {
        return res.status(409).json({
          error: `Para este plan necesitamos tus datos de facturación: ${falta}.`,
          codigo: 'DATOS_FISCALES_REQUERIDOS',
          motivo: falta,
        });
      }
    }

    const cuentaCulqi = await culqi.obtenerOCrearCliente({
      email: usuario.email,
      nombre: usuario.nombre,
      direccion: usuario.direccionFiscal,
    });
    const tarjeta = await culqi.crearTarjeta({ customerId: cuentaCulqi.id, tokenId: token });

    // Promo de bienvenida: 50% los primeros 2 meses. Solo facturación mensual
    // (el plan anual ya tiene su propio 20% todo el año) y una sola vez.
    //
    // "Una sola vez" se comprueba por partida doble: por cuenta
    // (`promoBienvenidaUsada`) y por TARJETA (tabla `promo_tarjetas`). Sin lo
    // segundo bastaba con registrar otro correo para repetir el descuento
    // indefinidamente.
    //
    // Se decide DESPUÉS de guardar la tarjeta y ANTES de cobrar, porque la
    // huella solo se conoce con la tarjeta ya creada y el importe no se puede
    // cambiar una vez hecho el cargo.
    const huella = culqi.huellaTarjeta(tarjeta);
    const cuentaPuedePromo = !anual && !usuario.promoBienvenidaUsada && !sinPromo;

    // Si la cuenta tenía derecho al descuento pero la tarjeta ya lo gastó, NO se
    // cobra: el widget le mostró al usuario el importe con descuento y cobrarle
    // el precio regular sería cobrarle algo distinto de lo que aceptó. Se le
    // avisa y decide si continúa al precio de lista.
    const promoNoAplica = () => res.status(409).json({
      error: 'Esta tarjeta ya usó la promoción de bienvenida. Puedes continuar al precio regular.',
      codigo: 'PROMO_NO_APLICA',
      montoRegular: precioBase,
    });

    // 🔴 La promo se RESERVA antes de cobrar, no se marca después (auditoría
    // 2026-10-02, P0-08). Antes: leer si la tarjeta ya la usó → cobrar → crear la
    // fila. Dos pagos simultáneos con la misma tarjeta veían «libre» los dos y
    // los dos cobraban al 50%; el @unique solo impedía la SEGUNDA fila, no el
    // segundo cobro. Ahora la operación única es la reserva: crear la fila de la
    // tarjeta (choca contra el @unique si ya existe) y pasar la cuenta a
    // «promo usada» con un UPDATE condicional. Solo una de dos peticiones gana.
    // Si el cobro FALLA se libera; si queda en duda (Culqi no contestó) se
    // conserva, porque puede que sí se haya cobrado al 50%.
    //
    // La reserva va ATADA a la clave del intento de cobro (lib/promo.js): si
    // la liberación falla o el proceso muere antes de abrir el intento, la
    // reconciliación encuentra la reserva sin cobro detrás y la devuelve.
    // El token del widget es de UN solo uso: la misma clave = el mismo pago.
    // Un doble clic o un reintento del navegador no pueden cobrar dos veces.
    const clave = `alta:${usuario.id}:${token}`;
    let aplicaPromo = false;
    const liberarPromo = async () => {
      if (!aplicaPromo) return;
      await promo.liberar({ usuarioId: usuario.id, clave })
        .catch((e) => console.error(`[Promo] No se pudo liberar la reserva de ${clave} (la reconciliación la devolverá):`, e.message));
    };
    if (cuentaPuedePromo) {
      // Sin huella (Culqi no devolvió los datos, o falta PROMO_HASH_SECRET) no
      // se puede verificar la tarjeta: se trata como ya usada para no dejar el
      // descuento sin control.
      if (!huella) return promoNoAplica();
      if (!(await promo.reservar({ huella, usuarioId: usuario.id, clave }))) return promoNoAplica();
      aplicaPromo = true;
    }

    const monto = aplicaPromo ? Math.round(precioBase / 2) : precioBase;

    // 🔴 El periodo nuevo se SUMA a lo que el cliente ya tiene pagado, no arranca
    // hoy. Hasta el 2026-08-30 esto era `new Date()` a secas, y el precio lo
    // pagaba el cliente: quien estaba en mensual con veinte días por delante y
    // se pasaba a anual perdía esos veinte días sin que nada se lo dijera. Es la
    // MISMA regla que ya usa el cron de renovación (`monitoreo.worker.js`, el
    // `base` con el máximo entre vencimiento y ahora).
    //
    // ⚠️ Esto ES la política de cambio de plan, y desde el 2026-10-02 es la que
    // publica /devoluciones (antes prometía un «cobro proporcional» que nunca
    // existió — auditoría P0-09): al subir de plan se cobra el plan nuevo
    // completo y los días que quedaban se SUMAN, ya con el plan nuevo. Lo exacto
    // sería prorratear, y se descartó a propósito: añadir esa aritmética a un
    // camino que emite comprobantes fiscales no compensa por unos días.
    const baseVencimiento = usuario.fechaVencimiento && new Date(usuario.fechaVencimiento) > new Date()
      ? new Date(usuario.fechaVencimiento)
      : new Date();
    const fechaVencimiento = new Date(baseVencimiento);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + (anual ? 12 : 1));

    let cobro;
    try {
      cobro = await cobros.cobrar({
        clave,
        usuarioId: usuario.id,
        tipo: 'INICIAL',
        plan,
        periodo: anual ? 'anual' : 'mensual',
        monto,
        moneda: MONEDA,
        email: usuario.email,
        sourceId: tarjeta.id,
        // El nombre sale de lib/planes.js. Era `Plan ${plan}` con el valor crudo
        // del enum — y esta descripción la ve el cliente en su tarjeta.
        descripcion: `Notoria — ${etiquetaDe(plan)} (${anual ? 'anual' : 'mensual'})`
          + (puedeLocales && extras ? ` + ${extras} local(es)` : '')
          + (aplicaPromo ? ' — promo 50% bienvenida' : ''),
        detalle: {
          plan,
          periodoFacturacion: anual ? 'anual' : 'mensual',
          fechaVencimiento: fechaVencimiento.toISOString(),
          // Lo que se acaba de COBRAR, que es lo que manda para el tope de
          // negocios y para la renovación. Se guarda siempre —también 0— para
          // que bajar de cuatro locales a uno deje de cobrar los tres de más.
          localesExtra: puedeLocales ? extras : 0,
          tarjetaCulqiId: tarjeta.id, // tarjeta guardada — se reutiliza para renovar
          promo: aplicaPromo,
        },
      });
    } catch (e) {
      if (e.estadoIntento !== cobros.ESTADO.DESCONOCIDO) await liberarPromo();
      throw e;
    }
    const { cargo, intento } = cobro;

    // Todo lo de la base en UNA transacción (lib/cobros.js). Si falla, el cobro
    // YA ocurrió: no se finge éxito ni se devuelve un 400 que invite a pagar
    // otra vez. El intento queda EXITOSO y sin Pago, la reconciliación lo
    // completa con la misma función, y contabilidad se entera ahora.
    let pago;
    try {
      pago = await cobros.aplicar({ intento, cargo, titular: usuario.nombre });
    } catch (e) {
      console.error(`[Cobro] 🔴 Cargo ${cargo?.id} COBRADO pero no se pudo aplicar a ${usuario.email}:`, e.message);
      avisarCobroSinAplicar({ intento, cargo, usuario, error: e });
      return res.status(202).json({
        error: 'Recibimos tu pago, pero no pudimos activar tu plan en este momento. Lo activamos en unos minutos sin que tengas que pagar de nuevo; si no ves el cambio, escríbenos.',
        codigo: 'PAGO_PENDIENTE_DE_ACTIVAR',
        cargoId: cargo?.id,
      });
    }
    const usuarioActualizado = await prisma.usuario.findUnique({
      where: { id: usuario.id },
      select: { plan: true, suscripcionActiva: true, fechaVencimiento: true },
    });

    // El comprobante nunca tumba el cobro: si falla, se registra en el log y el
    // pago sigue siendo válido (emitirComprobante ya absorbe sus propios errores).
    const comprobante = pago ? await emitirComprobante({ pago, usuario }) : null;

    // La respuesta lleva el detalle del cobro para que la pantalla de
    // confirmación pueda decir exactamente qué se cobró y con qué comprobante,
    // en vez de un "listo" genérico. `comprobante` puede venir null: el pago
    // vale igual y la pantalla se adapta.
    res.json({
      mensaje: 'Suscripción activada correctamente',
      usuario: usuarioActualizado,
      cargoId: cargo.id,
      monto,
      moneda: MONEDA,
      promoAplicada: aplicaPromo,
      comprobante: comprobante ? { tipo: comprobante.tipo, numero: comprobante.numero } : null,
    });
  } catch (error) {
    const respuesta = respuestaDeCobroFallido(error);
    if (respuesta) return res.status(respuesta.status).json(respuesta.cuerpo);
    // Al usuario se le enseña `user_message` (redactado para él); al log va
    // ADEMÁS `merchant_message` y el campo que falló, que es lo único que
    // permite diagnosticar. Antes solo se registraba el mensaje de cara al
    // usuario ("Hubo algunos problemas al intentar validar tu compra"), que no
    // dice nada: hubo que reproducir el fallo contra la API para descubrir que
    // Culqi rechazaba el `last_name`.
    const datos = error.response?.data;
    const msg = datos?.user_message || datos?.merchant_message || error.message;
    console.error('[Culqi] Error al procesar el pago:', msg,
      datos?.merchant_message ? `| motivo: ${datos.merchant_message}` : '',
      datos?.param ? `| campo: ${datos.param}` : '');
    res.status(400).json({ error: msg || 'No se pudo procesar el pago' });
  }
});

// ── GET /api/pagos/estado ─────────────────────────────────
router.get('/estado', async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: {
        plan: true,
        suscripcionActiva: true,
        fechaVencimiento: true,
      },
    });

    res.json(usuario);
  } catch (error) {
    next(error);
  }
});

// ── Locales adicionales sobre el plan que YA se tiene ─────
//
// 🔴 El agujero que cierran estas dos rutas: los locales solo se podían elegir
// en el alta, y el selector de la pantalla de Planes únicamente sale en las
// tarjetas de los planes que NO son el actual. El cliente que ya está en
// NEGOCIO y abre su segundo local no tenía por dónde comprarlo — y el 403 de
// negocio.routes.js lo mandaba justamente a Planes, o sea a un sitio donde ese
// control no existía para él.
//
// La aritmética vive entera en lib/localesExtra.js, que explica por qué se
// prorratea en vez de recobrar el plan. Acá solo van los efectos: el cargo, el
// comprobante y la fila del usuario.

// Lee al usuario y cuenta sus negocios activos — lo necesitan las dos rutas.
const contextoLocales = async (usuarioId) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true, email: true, nombre: true, plan: true, suscripcionActiva: true,
      tarjetaCulqiId: true, fechaVencimiento: true, periodoFacturacion: true,
      localesExtra: true, mesesPromoRestantes: true, direccionFiscal: true,
    },
  });
  // ⚠️ Se cuentan los negocios del PROPIETARIO, no los de `req.cuenta`: estas
  // rutas ya van detrás de `permitir('facturacion')`, que en este proyecto es
  // permiso exclusivo del propietario, y los locales se pagan sobre la cuenta
  // que los tiene cargados. Contar los de otra cuenta dejaría pasar una bajada
  // que sí apaga vigilancia.
  const negociosActivos = await prisma.negocio.count({
    where: { usuarioId, activo: true },
  });
  return { usuario, negociosActivos };
};

// Todo lo que la pantalla necesita para pintar el control y el importe.
const resumenLocales = (usuario, negociosActivos, localesExtraNuevo) => {
  const anual = usuario.periodoFacturacion === 'anual';
  const nuevo = Number.isInteger(localesExtraNuevo) ? localesExtraNuevo : usuario.localesExtra;
  const cuenta = locales.prorrateo({
    plan: usuario.plan,
    anual,
    fechaVencimiento: usuario.fechaVencimiento,
    localesExtraActual: usuario.localesExtra,
    localesExtraNuevo: nuevo,
    mesesPromoRestantes: usuario.mesesPromoRestantes,
  });
  return {
    plan: usuario.plan,
    periodo: anual ? 'anual' : 'mensual',
    incluidos: locales.incluidosEnElPlan(usuario.plan),
    // Lo que hoy paga y lo que pagaría: los dos salen de `montoSuscripcion`,
    // que es la MISMA función que usan el alta y la renovación. Calcular el
    // total en el panel sería la quinta copia de los precios de este proyecto.
    localesExtraActual: usuario.localesExtra,
    localesExtraNuevo: nuevo,
    negociosActivos,
    maximoExtra: locales.maximoExtra(usuario.plan),
    fechaVencimiento: usuario.fechaVencimiento,
    moneda: MONEDA,
    // El cargo de HOY (prorrateado) y el que se hará en la renovación.
    aCobrarHoy: cuenta.centimos,
    gratis: cuenta.gratis,
    dias: cuenta.dias,
    diasPeriodo: cuenta.diasPeriodo,
    promoAplicada: cuenta.promoAplicada,
    renovacionActual: montoSuscripcion(usuario.plan, anual, usuario.localesExtra),
    renovacionNueva: montoSuscripcion(usuario.plan, anual, nuevo),
    motivo: locales.validarCambio({
      plan: usuario.plan,
      suscripcionActiva: usuario.suscripcionActiva,
      tieneTarjeta: !!usuario.tarjetaCulqiId,
      localesExtraNuevo: nuevo,
      negociosActivos,
    }),
  };
};

// ── GET /api/pagos/locales?localesExtra=N ─────────────────
// Previsualización. Existe para que el importe que se PINTA antes de confirmar
// salga del mismo código que lo va a cobrar: en este proyecto ya hubo precios
// escritos a mano en una pantalla de venta (el cartel de la promo anunciaba dos
// planes de tres) y un redondeo hecho en soles que mostraba S/30 y cobraba
// S/29.50.
router.get('/locales', async (req, res, next) => {
  try {
    const { usuario, negociosActivos } = await contextoLocales(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // ⚠️ Acá NO se acota, a propósito, aunque el POST sí lo haga. Un número
    // fuera de rango se devuelve tal cual **con su `motivo`**, y el panel apaga
    // el botón y lo explica. Acotarlo en silencio enseñaría un número distinto
    // del que se pidió, que es la misma falta que cobrar un importe distinto
    // del que se muestra: el que mira la pantalla deja de poder fiarse de ella.
    const pedido = req.query.localesExtra;
    const nuevo = pedido === undefined || pedido === ''
      ? usuario.localesExtra
      : Math.max(0, Math.trunc(Number(pedido) || 0));

    res.json(resumenLocales(usuario, negociosActivos, nuevo));
  } catch (error) {
    next(error);
  }
});

// ── POST /api/pagos/locales ───────────────────────────────
// Aplica el cambio. Subir cobra el prorrateo a la tarjeta guardada; bajar no
// devuelve dinero y surte efecto en la próxima renovación.
router.post('/locales', async (req, res) => {
  try {
    const { usuario, negociosActivos } = await contextoLocales(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const nuevo = Math.trunc(Number(req.body?.localesExtra));
    const motivo = locales.validarCambio({
      plan: usuario.plan,
      suscripcionActiva: usuario.suscripcionActiva,
      tieneTarjeta: !!usuario.tarjetaCulqiId,
      localesExtraNuevo: nuevo,
      negociosActivos,
    });
    if (motivo) {
      // Cada motivo tiene su propia salida, así que se distinguen en vez de
      // devolver un 403 genérico: al de `LOCALES_EN_USO` hay que decirle que
      // desactive una ficha primero, no que su plan no da.
      const MENSAJES = {
        PLAN_SIN_LOCALES: 'Tu plan no vende locales adicionales. Cambia de plan desde esta misma pantalla.',
        SIN_SUSCRIPCION: 'Necesitas una suscripción activa para sumar locales.',
        SIN_TARJETA: 'No tenemos una tarjeta guardada para cobrar el local. Vuelve a contratar tu plan.',
        CANTIDAD_INVALIDA: 'La cantidad de locales no es válida.',
        LOCALES_EN_USO: `Tienes ${negociosActivos} local(es) cargados. Desactiva los que ya no uses antes de bajar tu suscripción.`,
      };
      return res.status(409).json({ error: MENSAJES[motivo] || 'No se puede aplicar el cambio', codigo: motivo });
    }

    if (nuevo === usuario.localesExtra) {
      return res.json({ mensaje: 'No hay cambios que aplicar', ...resumenLocales(usuario, negociosActivos, nuevo) });
    }

    const anual = usuario.periodoFacturacion === 'anual';
    const cuenta = locales.prorrateo({
      plan: usuario.plan,
      anual,
      fechaVencimiento: usuario.fechaVencimiento,
      localesExtraActual: usuario.localesExtra,
      localesExtraNuevo: nuevo,
      mesesPromoRestantes: usuario.mesesPromoRestantes,
    });

    // Bajar, o subir por un importe que no llega al piso: no hay cargo. Se
    // actualiza la fila y ya — la renovación cobrará el total nuevo.
    if (cuenta.centimos <= 0) {
      await prisma.usuario.update({ where: { id: usuario.id }, data: { localesExtra: nuevo } });
      return res.json({
        mensaje: cuenta.delta > 0
          ? 'Local(es) agregado(s). No te cobramos nada por lo que queda del periodo.'
          : 'Locales actualizados. El cambio se refleja en tu próxima renovación.',
        cobrado: 0,
        ...resumenLocales({ ...usuario, localesExtra: nuevo }, negociosActivos, nuevo),
      });
    }

    // 🔴 Se cobra la TARJETA GUARDADA, igual que la renovación, no un token
    // nuevo del widget. El cliente ya la registró al contratar y volver a
    // pedírsela para sumar un local sería fricción inventada — además de que el
    // widget cobra lo que se le diga y acá el importe lo decide el servidor.
    // ⚠️ El vencimiento NO se toca (el `detalle` solo lleva `localesExtra`). Es
    // la diferencia con pasar por el alta, y es el motivo de todo esto: el
    // aniversario del cliente no se mueve porque haya sumado un local a mitad
    // de mes. prueba-locales.js lo vigila sobre la llamada real.
    const { cargo, intento } = await cobros.cobrar({
      // El mismo cambio, en el mismo periodo, no se cobra dos veces (doble clic,
      // reintento del navegador). Otro cambio distinto es otra clave.
      clave: `locales:${usuario.id}:${new Date(usuario.fechaVencimiento).toISOString()}:${usuario.localesExtra}->${nuevo}`,
      usuarioId: usuario.id,
      tipo: 'LOCAL_ADICIONAL',
      plan: usuario.plan,
      periodo: anual ? 'anual' : 'mensual',
      monto: cuenta.centimos,
      moneda: MONEDA,
      email: usuario.email,
      sourceId: usuario.tarjetaCulqiId,
      descripcion: `Notoria — ${etiquetaDe(usuario.plan)}, +${cuenta.delta} local(es)`
        + ` (${cuenta.dias} de ${cuenta.diasPeriodo} días)`
        + (cuenta.promoAplicada ? ' — promo 50% bienvenida' : ''),
      detalle: { localesExtra: nuevo, antes: usuario.localesExtra },
    });

    let pago;
    try {
      pago = await cobros.aplicar({ intento, cargo, titular: usuario.nombre });
    } catch (e) {
      console.error(`[Cobro] 🔴 Cargo ${cargo?.id} COBRADO pero no se pudo aplicar a ${usuario.email}:`, e.message);
      avisarCobroSinAplicar({ intento, cargo, usuario, error: e });
      return res.status(202).json({
        error: 'Recibimos tu pago, pero no pudimos sumar el local en este momento. Lo hacemos en unos minutos sin volver a cobrarte.',
        codigo: 'PAGO_PENDIENTE_DE_ACTIVAR',
        cargoId: cargo?.id,
      });
    }
    // El comprobante nunca tumba el cobro, igual que en el alta.
    const comprobante = pago ? await emitirComprobante({ pago, usuario }) : null;

    res.json({
      mensaje: `Sumaste ${cuenta.delta} local(es) a tu plan.`,
      cobrado: cuenta.centimos,
      moneda: MONEDA,
      cargoId: cargo.id,
      comprobante: comprobante ? { tipo: comprobante.tipo, numero: comprobante.numero } : null,
      ...resumenLocales({ ...usuario, localesExtra: nuevo }, negociosActivos, nuevo),
    });
  } catch (error) {
    const respuesta = respuestaDeCobroFallido(error);
    if (respuesta) return res.status(respuesta.status).json(respuesta.cuerpo);
    // Mismo tratamiento que el alta: al usuario el mensaje redactado, al log
    // además el `merchant_message` y el campo, que es lo único que diagnostica.
    const datos = error.response?.data;
    const msg = datos?.user_message || datos?.merchant_message || error.message;
    console.error('[Culqi] Error al sumar locales:', msg,
      datos?.merchant_message ? `| motivo: ${datos.merchant_message}` : '',
      datos?.param ? `| campo: ${datos.param}` : '');
    res.status(400).json({ error: msg || 'No se pudo procesar el cobro' });
  }
});

// ── POST /api/pagos/cancelar ──────────────────────────────
//
// 🔴 Esto tenía que existir desde el primer cobro. La página /devoluciones dice
// textualmente «puedes cancelar tu suscripción en cualquier momento desde tu
// panel, en Configuración → Suscripción», y el FAQ del landing lo repite — pero
// no había endpoint ni pantalla. Era una obligación publicada en la página legal
// que el producto no cumplía, con un Libro de Reclamaciones montado al lado.
//
// Cancelar NO corta el servicio: apaga la renovación automática y el plan sigue
// vivo hasta el final del periodo ya pagado. El cron `iniciarBajadaDePlanes`
// (monitoreo.worker.js) es el que baja a GRATIS cuando llega esa fecha.
//
// No se toca Culqi: no hay suscripción del lado de ellos, el cobro recurrente lo
// hace nuestro cron con la tarjeta guardada. Dejar de cobrar es dejar de llamar.
router.post('/cancelar', async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { id: true, email: true, nombre: true, plan: true, suscripcionActiva: true, fechaVencimiento: true, idioma: true },
    });

    if (usuario.plan === 'GRATIS') {
      return res.status(400).json({ error: 'Tu cuenta ya está en el plan Gratuito.' });
    }
    if (!usuario.suscripcionActiva) {
      return res.json({
        mensaje: 'Tu renovación ya estaba cancelada.',
        activoHasta: usuario.fechaVencimiento,
        yaEstaba: true,
      });
    }

    // Si por lo que sea no hay fecha de vencimiento, se cierra al final del mes
    // en curso en vez de cortar hoy: ante la duda, a favor del cliente.
    const activoHasta = usuario.fechaVencimiento || new Date(Date.now() + 30 * 86400000);

    await prisma.usuario.update({
      where: { id: usuario.id },
      // `plan` NO se toca: el cliente pagó hasta `activoHasta` y hasta ahí lo usa.
      data: { suscripcionActiva: false, fechaVencimiento: activoHasta },
    });

    setImmediate(() => {
      enviarCancelacion(usuario, activoHasta)
        .catch(e => console.error('[Cobro] No se pudo enviar la confirmación de cancelación:', e.message));
    });

    res.json({
      mensaje: 'Cancelamos la renovación automática. No se te volverá a cobrar.',
      activoHasta,
      plan: usuario.plan,
    });
  } catch (error) { next(error); }
});

// ── GET /api/pagos/historial ──────────────────────────────
// Historial de Facturación del usuario: fecha, plan, monto, titular y los
// primeros 4 dígitos de la tarjeta usada, para que pueda corroborar cada pago.
router.get('/historial', async (req, res, next) => {
  try {
    const pagos = await prisma.pago.findMany({
      where: { usuarioId: req.usuario.id },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true, plan: true, periodo: true, tipo: true, estado: true,
        monto: true, moneda: true, titular: true, tarjetaInicio: true,
        tarjetaMarca: true, creadoEn: true,
        comprobante: { select: { id: true, tipo: true, numero: true, total: true, igv: true, moneda: true } },
      },
    });
    res.json(pagos);
  } catch (error) {
    next(error);
  }
});

// ── GET /api/pagos/datos-fiscales ─────────────────────────
// Datos con los que se emiten los comprobantes del usuario.
router.get('/datos-fiscales', async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { docTipo: true, docNumero: true, razonSocial: true, direccionFiscal: true, paisFiscal: true, nombre: true },
    });
    res.json(usuario);
  } catch (error) {
    next(error);
  }
});

// ── PUT /api/pagos/datos-fiscales ─────────────────────────
// Cambiarlos solo afecta a los comprobantes futuros: los ya emitidos guardan
// una copia de los datos del receptor y no se tocan.
router.put('/datos-fiscales', async (req, res, next) => {
  try {
    const { docTipo, docNumero, razonSocial, direccionFiscal, paisFiscal } = req.body || {};
    const error = tributario.validarDatosFiscales({ docTipo, docNumero, razonSocial, direccionFiscal, paisFiscal });
    if (error) return res.status(400).json({ error });

    const pais = paisFiscal.toUpperCase();
    const datos = await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: {
        // A un cliente del exterior no se le guarda documento peruano
        docTipo: pais === 'PE' ? docTipo : tributario.DOC.NO_DOMICILIADO,
        docNumero: pais === 'PE' ? docNumero.trim() : (docNumero || '').trim() || null,
        razonSocial: razonSocial.trim(),
        direccionFiscal: direccionFiscal?.trim() || null,
        paisFiscal: pais,
      },
      select: { docTipo: true, docNumero: true, razonSocial: true, direccionFiscal: true, paisFiscal: true },
    });
    res.json(datos);
  } catch (error) {
    next(error);
  }
});

// ── GET /api/pagos/comprobantes/:id/pdf ───────────────────
// Descarga la representación impresa. Se regenera a demanda a partir de la fila
// del comprobante; el filtro por usuarioId impide descargar el de otra cuenta.
router.get('/comprobantes/:id/pdf', async (req, res, next) => {
  try {
    const resultado = await pdfDeComprobante(req.params.id, req.usuario.id);
    if (!resultado) return res.status(404).json({ error: 'Comprobante no encontrado' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Notoria-${resultado.comprobante.numero}.pdf"`);
    res.send(resultado.pdf);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
// Expuestas para scripts/prueba-auditoria.js.
module.exports._interno = { webhookAutorizado, efectoDeReembolso, respuestaDeCobroFallido, procesarEventoCulqi };
