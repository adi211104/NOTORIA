// brand-shield/src/api/routes/competidor.routes.js
// Gestión de competidores por negocio (plan Franquicia)

const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { buscarNegocioEnGoogle } = require('../../scrapers/google.scraper');

const router = express.Router();
const { autenticar, permitir } = require('../middlewares/auth.middleware');
const { dondeNegocio, alcanza, registrar } = require('../../lib/equipo');
const { limite: limiteDelPlan, ORDEN } = require('../../lib/planes');

router.use(autenticar);

// El plan gratuito incluye 1 competidor para que el usuario pruebe la función;
// los planes de pago amplían el límite.
// El tope sale de lib/planes.js: era una de las cinco tablas por plan sueltas
// que había en el backend, y al añadir un plan nuevo ninguna se enteraba.
const LIMITE_COMPETIDORES = Object.fromEntries(
  ORDEN.map((plan) => [plan, limiteDelPlan(plan, 'competidores')])
);

// GET /api/competidores — todos los competidores del usuario, agrupados por
// negocio (vista consolidada para /dashboard/competencia). Los endpoints por
// negocio de abajo se mantienen igual, se siguen usando desde el detalle de
// cada negocio.
router.get('/', async (req, res, next) => {
  try {
    const negocios = await prisma.negocio.findMany({
      where: dondeNegocio(req, { activo: true }),
      select: {
        id: true, nombre: true, tipo: true, pais: true,
        // Dos snapshots y no uno: con el anterior se puede decir si la brecha
        // con la competencia se está abriendo o cerrando, que es lo único que
        // convierte una comparación en algo accionable. Una foto suelta solo
        // dice dónde estás; dos dicen hacia dónde vas.
        snapshots: { orderBy: { tomadoEn: 'desc' }, take: 2 },
        competidores: {
          orderBy: { creadoEn: 'asc' },
          include: { snapshots: { orderBy: { tomadoEn: 'desc' }, take: 2 } },
        },
      },
      orderBy: { creadoEn: 'asc' },
    });
    res.json(negocios);
  } catch (error) { next(error); }
});

// GET /api/competidores/:negocioId
router.get('/:negocioId', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.negocioId }),
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const competidores = await prisma.competidor.findMany({
      where: { negocioId: req.params.negocioId },
      include: {
        snapshots: { orderBy: { tomadoEn: 'desc' }, take: 5 },
      },
      orderBy: { creadoEn: 'asc' },
    });

    res.json(competidores);
  } catch (error) { next(error); }
});

// POST /api/competidores/:negocioId
router.post('/:negocioId', permitir('actuar'), async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: dondeNegocio(req, { id: req.params.negocioId }),
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    // Verificar límite según plan
    const limite = LIMITE_COMPETIDORES[req.cuenta.plan] || 1;
    const total = await prisma.competidor.count({
      where: { negocioId: req.params.negocioId },
    });
    if (total >= limite) {
      return res.status(403).json({
        error: `Tu plan permite hasta ${limite} competidor${limite > 1 ? 'es' : ''} por negocio. Actualiza tu plan para monitorear más.`,
        accion: 'ACTUALIZAR_PLAN',
      });
    }

    const { googlePlaceId } = req.body;
    if (!googlePlaceId || typeof googlePlaceId !== 'string') return res.status(400).json({ error: 'googlePlaceId requerido' });

    // El mismo local dos veces en la lista se pagaría dos veces a Places en cada
    // relectura (auditoría 2026-10-02, P1-18). Se mira ANTES de llamar a Google
    // para no gastar ni esa consulta; el @@unique de la base cubre la carrera.
    const yaEsta = await prisma.competidor.findFirst({
      where: { negocioId: req.params.negocioId, googlePlaceId },
      select: { id: true },
    });
    if (yaEsta) return res.status(409).json({ error: 'Ese competidor ya está en tu lista', codigo: 'COMPETIDOR_DUPLICADO' });

    // Obtener datos del competidor desde Google
    const info = await buscarNegocioEnGoogle(googlePlaceId);
    if (!info) return res.status(404).json({ error: 'No se encontró el negocio en Google Places' });

    let competidor;
    try {
      competidor = await prisma.competidor.create({
        data: {
          nombre: info.nombre,
          googlePlaceId,
          ratingActual: info.rating,
          totalResenas: info.totalResenas,
          negocioId: req.params.negocioId,
        },
      });
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'Ese competidor ya está en tu lista', codigo: 'COMPETIDOR_DUPLICADO' });
      throw e;
    }

    res.status(201).json({ mensaje: 'Competidor agregado correctamente', competidor });
  } catch (error) { next(error); }
});

// DELETE /api/competidores/:id
router.delete('/:id', permitir('actuar'), async (req, res, next) => {
  try {
    const competidor = await prisma.competidor.findFirst({
      where: { id: req.params.id },
      include: { negocio: true },
    });

    if (!competidor || competidor.negocio.usuarioId !== req.cuenta.id || !alcanza(req, competidor.negocioId)) {
      return res.status(404).json({ error: 'Competidor no encontrado' });
    }

    // 🔴 Los snapshots van PRIMERO, no es opcional.
    //
    // `snapshots_competidores` apunta a esta fila con una clave foránea
    // obligatoria, que Prisma crea con ON DELETE RESTRICT. Y el worker guarda un
    // snapshot por competidor en cada ciclo de 4 horas, así que en cuanto pasaba
    // el primer ciclo el borrado empezaba a fallar con un 500 y el competidor
    // quedaba imposible de quitar para siempre. Solo funcionaba si lo borrabas
    // en las primeras horas de haberlo agregado.
    //
    // Las dos operaciones van en una transacción: si el borrado del competidor
    // fallara, no queremos haber tirado ya su historial.
    await prisma.$transaction([
      prisma.snapshotCompetidor.deleteMany({ where: { competidorId: req.params.id } }),
      prisma.competidor.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ mensaje: 'Competidor eliminado' });
  } catch (error) { next(error); }
});

module.exports = router;
