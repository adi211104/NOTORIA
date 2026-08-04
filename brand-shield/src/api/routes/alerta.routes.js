// brand-shield/src/api/routes/alerta.routes.js

const express = require('express');
const prisma = require('../../lib/prisma');

const router = express.Router();
const { autenticar } = require('../middlewares/auth.middleware');

router.use(autenticar);

// ── GET /api/alertas ──────────────────────────────────────
// Todas las alertas del usuario (de todos sus negocios)
router.get('/', async (req, res, next) => {
  try {
    const alertas = await prisma.alerta.findMany({
      where: {
        negocio: { usuarioId: req.usuario.id },
      },
      include: {
        negocio: { select: { id: true, nombre: true, tipo: true } },
      },
      orderBy: { creadaEn: 'desc' },
      take: 50,
    });

    res.json(alertas);
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/alertas/:id/leer ───────────────────────────
// Marca una alerta como leída
router.patch('/:id/leer', async (req, res, next) => {
  try {
    const alerta = await prisma.alerta.findFirst({
      where: {
        id: req.params.id,
        negocio: { usuarioId: req.usuario.id },
      },
    });

    if (!alerta) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    await prisma.alerta.update({
      where: { id: req.params.id },
      data: { leida: true },
    });

    res.json({ mensaje: 'Alerta marcada como leída' });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/alertas/leer-todas ────────────────────────
router.patch('/leer-todas', async (req, res, next) => {
  try {
    await prisma.alerta.updateMany({
      where: {
        negocio: { usuarioId: req.usuario.id },
        leida: false,
      },
      data: { leida: true },
    });

    res.json({ mensaje: 'Todas las alertas marcadas como leídas' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
