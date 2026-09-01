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

// Guarda un registro de Facturación a partir de la respuesta de un cargo de
// Culqi exitoso. Solo persiste los primeros 4 dígitos de la tarjeta
// (source.card_number viene enmascarada, ej. "411111******1111") — nunca el
// número completo. Si el charge no trae `source` (no debería pasar en un
// cargo real) el registro queda sin datos de tarjeta en vez de fallar.
const registrarPago = async ({ usuarioId, plan, periodo, tipo, monto, titular, cargo }) => {
  const tarjeta = culqi.datosTarjeta(cargo);
  try {
    return await prisma.pago.create({
      data: {
        usuarioId, plan, periodo, tipo, estado: 'EXITOSO', monto, moneda: MONEDA, titular,
        tarjetaInicio: tarjeta.inicio,
        tarjetaMarca: tarjeta.marca,
        culqiCargoId: cargo?.id || null,
      },
    });
  } catch (e) {
    console.error('[Facturación] No se pudo registrar el pago:', e.message);
    return null;
  }
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
const webhookAutorizado = (req) => {
  const esperado = process.env.CULQI_WEBHOOK_SECRET;
  if (!esperado) return true; // sin secreto configurado no se exige nada

  if (req.query.secret === esperado) return true;

  const cabecera = req.headers?.authorization || '';
  if (!cabecera.startsWith('Basic ')) return false;
  const [usuario, clave] = Buffer.from(cabecera.slice(6), 'base64').toString('utf8').split(':');
  return clave === esperado || usuario === esperado;
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

// Marca el cobro devuelto en Facturación y desactiva la suscripción que pagaba.
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
      monto: true, moneda: true,
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

  await prisma.pago.update({ where: { id: pago.id }, data: { estado: 'REEMBOLSADO' } });
  await prisma.usuario.update({ where: { id: pago.usuarioId }, data: { suscripcionActiva: false } });
  console.log(`[Culqi webhook] Reembolso aplicado al cargo ${cargoId}`);

  // El cliente no se enteraba por ningún sitio de que se le devolvió el dinero.
  // Va con su propio catch, igual que el aviso de anulación: un fallo del correo
  // no puede tumbar el webhook, o Culqi lo reintentaría y acabaría desactivando
  // la suscripción de eventos.
  if (pago.usuario?.email) {
    await enviarReembolso(pago.usuario, { monto: pago.monto, moneda: pago.moneda })
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
  const pagoReembolsado = { ...pago, estado: 'REEMBOLSADO' };
  if (anulacion.necesitaAnulacion(pago.comprobante, pagoReembolsado)) {
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

  try {
    const tipo = req.body?.type;
    console.log(`[Culqi webhook] ${tipo}`);

    if (tipo === EVENTO_REEMBOLSO) await procesarReembolso(datosDelEvento(req.body));
    // Los demás se registran en vez de ignorarse en silencio: si algún día se
    // suscribe otro evento en el panel, o Culqi renombra uno, esto es lo único
    // que lo delata.
    else console.log(`[Culqi webhook] Evento sin manejar: ${tipo}`);

    res.json({ recibido: true });
  } catch (error) {
    console.error('[Culqi webhook] Error:', error.message);
    res.json({ recibido: true }); // Culqi reintenta si no responde 2xx
  }
});

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
    const tarjetaYaUsoPromo = huella
      ? !!(await prisma.promoTarjeta.findUnique({ where: { huella } }))
      // Sin huella (Culqi no devolvió los datos, o falta PROMO_HASH_SECRET) no
      // se puede verificar la tarjeta: se trata como ya usada para no dejar el
      // descuento sin control.
      : true;

    const cuentaPuedePromo = !anual && !usuario.promoBienvenidaUsada && !sinPromo;
    const aplicaPromo = cuentaPuedePromo && !tarjetaYaUsoPromo;

    // Si la cuenta tenía derecho al descuento pero la tarjeta ya lo gastó, NO se
    // cobra: el widget le mostró al usuario el importe con descuento y cobrarle
    // el precio regular sería cobrarle algo distinto de lo que aceptó. Se le
    // avisa y decide si continúa al precio de lista.
    if (cuentaPuedePromo && tarjetaYaUsoPromo) {
      return res.status(409).json({
        error: 'Esta tarjeta ya usó la promoción de bienvenida. Puedes continuar al precio regular.',
        codigo: 'PROMO_NO_APLICA',
        montoRegular: precioBase,
      });
    }

    const monto = aplicaPromo ? Math.round(precioBase / 2) : precioBase;

    const cargo = await culqi.crearCargo({
      monto,
      moneda: MONEDA,
      email: usuario.email,
      sourceId: tarjeta.id,
      // El nombre sale de lib/planes.js. Era `Plan ${plan}` con el valor crudo del
      // enum, o sea "Plan NEGOCIO" en mayúsculas — y esta descripción la ve el
      // cliente en el panel de Culqi y en el detalle de su tarjeta.
      descripcion: `Notoria — ${etiquetaDe(plan)} (${anual ? 'anual' : 'mensual'})`
        + (puedeLocales && extras ? ` + ${extras} local(es)` : '')
        + (aplicaPromo ? ' — promo 50% bienvenida' : ''),
    });

    // 🔴 El periodo nuevo se SUMA a lo que el cliente ya tiene pagado, no arranca
    // hoy. Hasta el 2026-08-30 esto era `new Date()` a secas, y el precio lo
    // pagaba el cliente: quien estaba en mensual con veinte días por delante y
    // se pasaba a anual perdía esos veinte días sin que nada se lo dijera. Es la
    // MISMA regla que ya usa el cron de renovación (`monitoreo.worker.js`, el
    // `base` con el máximo entre vencimiento y ahora); tenerla en un solo sitio
    // y no en el otro era la asimetría que hacía caro cambiarse de periodo.
    //
    // ⚠️ Alcance: aplica a CUALQUIER alta con vencimiento futuro, no solo al
    // cambio de periodo. En una subida de plan eso regala los días que quedaban
    // del plan viejo — es a favor del cliente, acotado a un periodo, y hace el
    // upgrade más atractivo. Lo exacto sería prorratear, y se descartó a
    // propósito: añadir esa aritmética a un camino que emite comprobantes
    // fiscales no compensa por unos días (misma decisión que en §8.8).
    const baseVencimiento = usuario.fechaVencimiento && new Date(usuario.fechaVencimiento) > new Date()
      ? new Date(usuario.fechaVencimiento)
      : new Date();
    const fechaVencimiento = new Date(baseVencimiento);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + (anual ? 12 : 1));

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        plan,
        suscripcionActiva: true,
        suscripcionId: tarjeta.id, // tarjeta guardada — se reutiliza cada mes para renovar
        fechaVencimiento,
        periodoFacturacion: anual ? 'anual' : 'mensual',
        // Lo que se acaba de COBRAR, que es lo que manda para el tope de
        // negocios y para lo que se le cobrará el mes que viene. Se guarda
        // siempre —también cuando son 0— para que bajar de cuatro locales a uno
        // deje de cobrar los tres de más.
        localesExtra: puedeLocales ? extras : 0,
        ...(aplicaPromo ? { promoBienvenidaUsada: true, mesesPromoRestantes: 1 } : {}),
      },
      select: { plan: true, suscripcionActiva: true, fechaVencimiento: true },
    });

    // Quema la tarjeta para la promo. Va después del cobro exitoso: si el cargo
    // falla, la tarjeta no debe quedar marcada. `create` puede chocar contra el
    // @unique si dos cobros con la misma tarjeta entran a la vez — es
    // precisamente lo que la restricción evita, así que el error se absorbe: el
    // cobro ya es válido y la tarjeta queda registrada igual.
    if (aplicaPromo && huella) {
      await prisma.promoTarjeta.create({ data: { huella, usuarioId: usuario.id } })
        .catch(e => console.error('[Promo] No se pudo registrar la tarjeta:', e.message));
    }

    const pago = await registrarPago({
      usuarioId: usuario.id, plan, periodo: anual ? 'anual' : 'mensual', tipo: 'INICIAL',
      monto, titular: usuario.nombre, cargo,
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
      suscripcionId: true, fechaVencimiento: true, periodoFacturacion: true,
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
      tieneTarjeta: !!usuario.suscripcionId,
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
      tieneTarjeta: !!usuario.suscripcionId,
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
    const cargo = await culqi.crearCargo({
      monto: cuenta.centimos,
      moneda: MONEDA,
      email: usuario.email,
      sourceId: usuario.suscripcionId,
      descripcion: `Notoria — ${etiquetaDe(usuario.plan)}, +${cuenta.delta} local(es)`
        + ` (${cuenta.dias} de ${cuenta.diasPeriodo} días)`
        + (cuenta.promoAplicada ? ' — promo 50% bienvenida' : ''),
    });

    // ⚠️ El vencimiento NO se toca. Es la diferencia con pasar por el alta, y es
    // el motivo de todo esto: el aniversario del cliente no se mueve porque haya
    // sumado un local a mitad de mes.
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { localesExtra: nuevo },
    });

    const pago = await registrarPago({
      usuarioId: usuario.id, plan: usuario.plan, periodo: anual ? 'anual' : 'mensual',
      tipo: 'LOCAL_ADICIONAL', monto: cuenta.centimos, titular: usuario.nombre, cargo,
    });
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
