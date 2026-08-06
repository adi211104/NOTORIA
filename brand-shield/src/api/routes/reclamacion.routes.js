// brand-shield/src/api/routes/reclamacion.routes.js
// Libro de Reclamaciones virtual — Ley 29571 (Código de Protección y Defensa
// del Consumidor) y D.S. 101-2022-PCM.
//
// SIN autenticación a propósito: la norma exige que cualquier consumidor pueda
// dejar una hoja de reclamación sin barreras previas (no se le puede obligar a
// registrarse). Por eso lleva su propio rate-limit, igual que publico.routes.js.
//
// INDECOPI exige además que el libro esté DENTRO de la web: no vale un Google
// Form ni un enlace externo. Culqi observó la web justamente por esto.

const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../../lib/prisma');
const { enviarCargoReclamacion, enviarAvisoReclamacionInterno } = require('../../utils/emails');

const router = express.Router();

// Este router expone ÚNICAMENTE el alta pública. Listar y responder reclamos se
// hace desde la terminal con `scripts/reclamaciones.js`, no por HTTP: la tabla
// guarda datos personales de terceros y no hace falta exponerlos en la web para
// gestionarlos. Ver la nota en auth.middleware.js.
const limiteAlta = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en una hora.' },
});

// Topes de longitud de cada campo de la hoja
const LIMITES = { nombre: 120, documento: 20, domicilio: 200, email: 120, telefono: 30, descripcion: 500, detalle: 3000, pedido: 1000, apoderado: 120 };

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

// Correlativo por año: "2026-000001". La norma pide numeración correlativa;
// se reinicia cada año, que es la práctica habitual del libro físico.
//
// El count() y el create() van dentro de una transacción porque dos reclamos
// simultáneos podrían leer el mismo count y chocar contra el @unique de
// `numero`. Si aun así chocan, se reintenta: el índice único es la garantía
// real, esto solo evita el reintento en el caso normal.
const crearConNumero = async (datos, intento = 0) => {
  const anio = new Date().getFullYear();
  const desde = new Date(anio, 0, 1);
  const previas = await prisma.reclamacion.count({ where: { creadoEn: { gte: desde } } });
  const numero = `${anio}-${String(previas + 1 + intento).padStart(6, '0')}`;
  try {
    return await prisma.reclamacion.create({ data: { ...datos, numero } });
  } catch (e) {
    // P2002 = choque del @unique. Se reintenta con el siguiente correlativo.
    if (e.code === 'P2002' && intento < 5) return crearConNumero(datos, intento + 1);
    throw e;
  }
};

// ── POST /api/reclamaciones ───────────────────────────────
router.post('/', limiteAlta, async (req, res, next) => {
  try {
    const b = req.body || {};
    const datos = {
      nombre: texto(b.nombre), docTipo: texto(b.docTipo) || 'DNI', documento: texto(b.documento),
      domicilio: texto(b.domicilio), email: texto(b.email).toLowerCase(), telefono: texto(b.telefono),
      esMenor: !!b.esMenor, apoderado: texto(b.apoderado) || null,
      tipoBien: b.tipoBien === 'PRODUCTO' ? 'PRODUCTO' : 'SERVICIO',
      descripcion: texto(b.descripcion),
      tipo: b.tipo === 'QUEJA' ? 'QUEJA' : 'RECLAMO',
      detalle: texto(b.detalle), pedido: texto(b.pedido),
      montoS: Number.isFinite(Number(b.monto)) && Number(b.monto) > 0 ? Math.round(Number(b.monto) * 100) : null,
      ip: req.ip || null,
    };

    // Campos que la hoja de reclamación no puede omitir
    for (const campo of ['nombre', 'documento', 'domicilio', 'email', 'telefono', 'descripcion', 'detalle', 'pedido']) {
      if (!datos[campo]) return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
      if (datos[campo].length > LIMITES[campo]) {
        return res.status(400).json({ error: `El campo "${campo}" excede el máximo de ${LIMITES[campo]} caracteres.` });
      }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) {
      return res.status(400).json({ error: 'El correo electrónico no tiene un formato válido.' });
    }
    // Un menor de edad no puede reclamar solo: la norma exige identificar al apoderado
    if (datos.esMenor && !datos.apoderado) {
      return res.status(400).json({ error: 'Si el consumidor es menor de edad, debes indicar el nombre del padre o apoderado.' });
    }

    const reclamacion = await crearConNumero(datos);

    // El cargo de recepción es una obligación legal, pero si Resend falla no se
    // puede perder la reclamación ya registrada: se avisa por log y el
    // consumidor igual recibe su número en la respuesta.
    enviarCargoReclamacion(reclamacion).catch(e =>
      console.error('[Reclamaciones] No se pudo enviar el cargo al consumidor:', e.message));
    enviarAvisoReclamacionInterno(reclamacion).catch(e =>
      console.error('[Reclamaciones] No se pudo avisar internamente:', e.message));

    res.status(201).json({
      numero: reclamacion.numero,
      creadoEn: reclamacion.creadoEn,
      mensaje: 'Tu reclamación fue registrada. Recibirás una copia en tu correo y una respuesta en un plazo máximo de 15 días hábiles.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
