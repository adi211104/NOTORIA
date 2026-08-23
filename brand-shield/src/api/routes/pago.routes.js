// brand-shield/src/api/routes/pago.routes.js
// Integración con Culqi — cargo inicial + tarjeta guardada para renovación mensual.
// Ver src/workers/monitoreo.worker.js (iniciarRenovacionesCulqi) para el cobro recurrente.

const express = require('express');
const prisma = require('../../lib/prisma');
const culqi = require('../../lib/culqi');
const tributario = require('../../lib/tributario');
const { emitirComprobante, pdfDeComprobante } = require('../../services/comprobante.service');
const { enviarCancelacion } = require('../../utils/emails');
const { autenticar, permitir } = require('../middlewares/auth.middleware');

const router = express.Router();

// Moneda y precios viven en lib/precios.js — el cron de renovación lee los
// mismos valores desde ahí. Culqi recibe la moneda explícita en cada cargo.
const { MONEDA, PRECIOS } = require('../../lib/precios');

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
  const cargoId = datos?.chargeId || datos?.charge_id || datos?.id;
  if (!cargoId) {
    console.error('[Culqi webhook] Reembolso sin chargeId — no se puede saber qué cobro se devolvió');
    return;
  }

  const pago = await prisma.pago.findUnique({
    where: { culqiCargoId: cargoId },
    select: { id: true, usuarioId: true },
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

// ── POST /api/pagos/culqi ──────────────────────────────────
// Recibe el token del widget de Checkout, guarda la tarjeta y cobra el primer periodo.
router.post('/culqi', async (req, res) => {
  // `sinPromo` lo manda el frontend cuando el usuario ya fue avisado de que su
  // tarjeta no tiene derecho al descuento y aun así quiere pagar el precio de
  // lista. Sin esto, el 409 de abajo se repetiría en cada reintento y esa
  // tarjeta no podría suscribirse nunca.
  const { token, plan, anual, sinPromo } = req.body;

  if (!culqi.configurado()) {
    return res.status(501).json({
      error: 'Los pagos están en proceso de habilitación. Te avisaremos cuando estén disponibles.',
      estado: 'PENDIENTE_CULQI',
    });
  }

  if (!token || !PRECIOS[plan]) {
    return res.status(400).json({ error: 'token y plan (NEGOCIO|FRANQUICIA) son requeridos' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    const precioBase = anual ? PRECIOS[plan].anual : PRECIOS[plan].mensual;

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
      descripcion: `Notoria — Plan ${plan} (${anual ? 'anual' : 'mensual'})${aplicaPromo ? ' — promo 50% bienvenida' : ''}`,
    });

    const fechaVencimiento = new Date();
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + (anual ? 12 : 1));

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        plan,
        suscripcionActiva: true,
        suscripcionId: tarjeta.id, // tarjeta guardada — se reutiliza cada mes para renovar
        fechaVencimiento,
        periodoFacturacion: anual ? 'anual' : 'mensual',
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
    const error = tributario.validarDatosFiscales({ docTipo, docNumero, razonSocial, paisFiscal });
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
