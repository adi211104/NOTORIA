// brand-shield/src/api/routes/pago.routes.js
// Integración con Culqi — cargo inicial + tarjeta guardada para renovación mensual.
// Ver src/workers/monitoreo.worker.js (iniciarRenovacionesCulqi) para el cobro recurrente.

const express = require('express');
const prisma = require('../../lib/prisma');
const culqi = require('../../lib/culqi');
const tributario = require('../../lib/tributario');
const { emitirComprobante, pdfDeComprobante } = require('../../services/comprobante.service');
const { autenticar } = require('../middlewares/auth.middleware');

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
// Culqi notifica reembolsos y contracargos aquí. Sin autenticación de sesión
// (lo llama Culqi directamente) — protegido con un secreto propio en la URL.
router.post('/culqi/webhook', async (req, res) => {
  const secretoEsperado = process.env.CULQI_WEBHOOK_SECRET;
  if (secretoEsperado && req.query.secret !== secretoEsperado) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { type, data } = req.body || {};
    console.log(`[Culqi webhook] ${type}`);

    if (['charge.refunded', 'charge.dispute.created', 'order.expired'].includes(type) && data?.email) {
      await prisma.usuario.updateMany({
        where: { email: data.email },
        data: { suscripcionActiva: false },
      });
      // Refleja el reembolso/contracargo en Facturación para que el historial
      // que ve el usuario coincida con lo que realmente pasó con su cobro.
      if (data?.id) {
        await prisma.pago.updateMany({
          where: { culqiCargoId: data.id },
          data: { estado: 'REEMBOLSADO' },
        }).catch(() => {});
      }
    }

    res.json({ recibido: true });
  } catch (error) {
    console.error('[Culqi webhook] Error:', error.message);
    res.json({ recibido: true }); // Culqi reintenta si no responde 2xx
  }
});

router.use(autenticar);

// ── POST /api/pagos/culqi ──────────────────────────────────
// Recibe el token del widget de Checkout, guarda la tarjeta y cobra el primer periodo.
router.post('/culqi', async (req, res) => {
  const { token, plan, anual } = req.body;

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

    // Promo de bienvenida: 50% de descuento los primeros 2 meses. Solo aplica a
    // facturación mensual (el plan Anual ya tiene su propio 20% todo el año) y
    // solo la primera vez que la cuenta se suscribe a un plan de pago — el flag
    // se marca de una vez aquí para que no se pueda reclamar de nuevo si cancela
    // y vuelve a suscribirse con la misma cuenta.
    const aplicaPromo = !anual && !usuario.promoBienvenidaUsada;
    const monto = aplicaPromo ? Math.round(precioBase / 2) : precioBase;

    const cuentaCulqi = await culqi.crearCliente({
      email: usuario.email,
      nombre: usuario.nombre,
      direccion: usuario.direccionFiscal,
    });
    const tarjeta = await culqi.crearTarjeta({ customerId: cuentaCulqi.id, tokenId: token });
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

    const pago = await registrarPago({
      usuarioId: usuario.id, plan, periodo: anual ? 'anual' : 'mensual', tipo: 'INICIAL',
      monto, titular: usuario.nombre, cargo,
    });

    // El comprobante nunca tumba el cobro: si falla, se registra en el log y el
    // pago sigue siendo válido (emitirComprobante ya absorbe sus propios errores).
    if (pago) await emitirComprobante({ pago, usuario });

    res.json({ mensaje: 'Suscripción activada correctamente', usuario: usuarioActualizado, cargoId: cargo.id });
  } catch (error) {
    const msg = error.response?.data?.user_message || error.response?.data?.merchant_message || error.message;
    console.error('[Culqi] Error al procesar el pago:', msg);
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
