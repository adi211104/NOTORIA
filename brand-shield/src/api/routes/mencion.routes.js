// brand-shield/src/api/routes/mencion.routes.js
// Panel de menciones: contenido de terceros que habla de la marca fuera de su
// ficha. No se responde desde acá — se responde en la plataforma de origen, por
// eso cada mención lleva su `url`.
//
// Escucha social = planes de pago, mismo criterio que la conexión de redes en
// redes.routes.js.

const express = require('express');
const prisma = require('../../lib/prisma');
const { autenticar } = require('../middlewares/auth.middleware');
const { verificarPlan } = require('../middlewares/verificarPlan.middleware');
const { construirTerminos, fuentesDisponibles, hayFuenteDisponible, MAX_TERMINOS } = require('../../lib/menciones');

const router = express.Router();

router.use(autenticar);
router.use(verificarPlan(['NEGOCIO', 'FRANQUICIA']));

// Sin ninguna fuente operativa la sección no se ofrece: el nav la esconde y la
// API la trata como inexistente. Un 404 y no un 403 a propósito — no es que al
// usuario le falte permiso, es que la función no existe para él todavía.
router.use((req, res, next) => {
  if (!hayFuenteDisponible(req.usuario)) {
    return res.status(404).json({ error: 'Función no disponible' });
  }
  next();
});

const LIMITE_MAX = 200;

// Confirma que la mención pertenece a un negocio del usuario. Se consulta por
// la relación y no por mencionId suelto: si no, cualquiera con un id podría
// marcar o borrar menciones ajenas.
const mencionDelUsuario = (mencionId, usuarioId) =>
  prisma.mencion.findFirst({
    where: { id: mencionId, negocio: { usuarioId } },
  });

// GET /api/menciones — feed consolidado con filtros
// ?negocioId= &sentimiento=negativo|positivo|neutro &plataforma=TIKTOK
// &archivadas=1 (por defecto se ocultan) &limite=
router.get('/', async (req, res, next) => {
  try {
    const { negocioId, sentimiento, plataforma, archivadas } = req.query;
    const limite = Math.min(Number(req.query.limite) || 50, LIMITE_MAX);

    const negocios = await prisma.negocio.findMany({
      where: { usuarioId: req.usuario.id, activo: true },
      select: { id: true, nombre: true, terminosMencion: true, mencionesActivas: true, colorEtiqueta: true },
      orderBy: { creadoEn: 'asc' },
    });

    // Filtrar por un negocio ajeno debe dar vacío, no los de todos
    const idsPermitidos = negocios.map((n) => n.id);
    const idsFiltrados = negocioId
      ? idsPermitidos.filter((id) => id === negocioId)
      : idsPermitidos;

    const where = {
      negocioId: { in: idsFiltrados },
      ...(archivadas === '1' ? {} : { archivada: false }),
      ...(sentimiento ? { sentimiento } : {}),
      ...(plataforma ? { plataforma } : {}),
    };

    const [menciones, total, negativas, sinVer] = await Promise.all([
      prisma.mencion.findMany({
        where,
        orderBy: [{ detectadaEn: 'desc' }],
        take: limite,
        include: { negocio: { select: { id: true, nombre: true, colorEtiqueta: true } } },
      }),
      prisma.mencion.count({ where: { negocioId: { in: idsFiltrados }, archivada: false } }),
      prisma.mencion.count({ where: { negocioId: { in: idsFiltrados }, archivada: false, sentimiento: 'negativo' } }),
      prisma.mencion.count({ where: { negocioId: { in: idsFiltrados }, archivada: false, vista: false } }),
    ]);

    res.json({
      menciones,
      resumen: { total, negativas, sinVer },
      // Solo las fuentes que funcionan de verdad — nunca las apagadas.
      // Ver la nota de producto en lib/menciones.js.
      fuentes: fuentesDisponibles(req.usuario),
      negocios: negocios.map((n) => ({
        id: n.id,
        nombre: n.nombre,
        colorEtiqueta: n.colorEtiqueta,
        mencionesActivas: n.mencionesActivas,
        terminos: construirTerminos(n),
      })),
    });
  } catch (error) { next(error); }
});

// PATCH /api/menciones/ver-todas — marca como vistas las no archivadas
// Va ANTES de /:id: si no, Express haría match de "ver-todas" como un id.
router.patch('/ver-todas', async (req, res, next) => {
  try {
    const negocios = await prisma.negocio.findMany({
      where: { usuarioId: req.usuario.id },
      select: { id: true },
    });
    const { count } = await prisma.mencion.updateMany({
      where: { negocioId: { in: negocios.map((n) => n.id) }, archivada: false, vista: false },
      data: { vista: true },
    });
    res.json({ mensaje: `${count} mención(es) marcadas como vistas`, actualizadas: count });
  } catch (error) { next(error); }
});

// PATCH /api/menciones/negocio/:negocioId — términos de búsqueda y on/off
router.patch('/negocio/:negocioId', async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findFirst({
      where: { id: req.params.negocioId, usuarioId: req.usuario.id },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const data = {};

    if (req.body.terminosMencion !== undefined) {
      const lista = String(req.body.terminosMencion || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const cortos = lista.filter((t) => t.length < 3);
      if (cortos.length) {
        return res.status(400).json({
          error: `Cada término debe tener al menos 3 caracteres. Revisa: ${cortos.join(', ')}`,
        });
      }
      // -1 porque el nombre del negocio ya ocupa un lugar
      if (lista.length > MAX_TERMINOS - 1) {
        return res.status(400).json({
          error: `Máximo ${MAX_TERMINOS - 1} términos extra (el nombre del negocio ya cuenta como uno).`,
        });
      }
      data.terminosMencion = lista.join(', ') || null;
    }

    if (req.body.mencionesActivas !== undefined) {
      data.mencionesActivas = !!req.body.mencionesActivas;
    }

    const actualizado = await prisma.negocio.update({ where: { id: negocio.id }, data });
    res.json({
      mensaje: 'Configuración de menciones actualizada',
      mencionesActivas: actualizado.mencionesActivas,
      terminos: construirTerminos(actualizado),
    });
  } catch (error) { next(error); }
});

// PATCH /api/menciones/:id — { vista?, archivada? }
router.patch('/:id', async (req, res, next) => {
  try {
    const mencion = await mencionDelUsuario(req.params.id, req.usuario.id);
    if (!mencion) return res.status(404).json({ error: 'Mención no encontrada' });

    const data = {};
    if (req.body.vista !== undefined) data.vista = !!req.body.vista;
    if (req.body.archivada !== undefined) {
      data.archivada = !!req.body.archivada;
      // Archivar implica haberla visto — evita que quede contando como pendiente
      if (data.archivada) data.vista = true;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    const actualizada = await prisma.mencion.update({ where: { id: mencion.id }, data });
    res.json(actualizada);
  } catch (error) { next(error); }
});

// DELETE /api/menciones/:id
// Ojo: si la mención sigue apareciendo en la búsqueda, el próximo ciclo la
// vuelve a crear. Para sacarla de la vista sin que reaparezca, archivar.
router.delete('/:id', async (req, res, next) => {
  try {
    const mencion = await mencionDelUsuario(req.params.id, req.usuario.id);
    if (!mencion) return res.status(404).json({ error: 'Mención no encontrada' });

    await prisma.mencion.delete({ where: { id: mencion.id } });
    res.json({ mensaje: 'Mención eliminada' });
  } catch (error) { next(error); }
});

module.exports = router;
