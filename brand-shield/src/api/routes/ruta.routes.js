// brand-shield/src/api/routes/ruta.routes.js
// Ruta comercial: visitas del promotor externo y su comisión (lib/rutaComercial.js).
//
// ⚠️ Excepción consciente a la nota de auth.middleware.js («no hay rol de
// administrador»): esta pantalla guarda datos de contacto de terceros, así que
// solo la abren los correos de RUTA_COMERCIAL_ACCESO, y a cualquier otra cuenta
// le responde el MISMO 404 que una ruta inexistente — no revela que existe.

const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { autenticar } = require('../middlewares/auth.middleware');
const { ESTADOS, accesoDe, comisionDeVisita } = require('../../lib/rutaComercial');

const router = express.Router();
router.use(autenticar);
router.use((req, res, next) => {
  const acceso = accesoDe(req.usuario.email);
  if (!acceso) return res.status(404).json({ error: 'Ruta no encontrada' });
  req.ruta = acceso;
  next();
});

const texto = (max) => z.string().trim().max(max).optional().transform((v) => v || null);
const esquema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre del local').max(120),
  distrito: texto(80),
  contacto: texto(120),
  notas: texto(1000),
  estado: z.enum(ESTADOS).default('visitado'),
  correo: z.union([z.string().trim().toLowerCase().email('El correo no es válido').max(200), z.literal('')]).optional()
    .transform((v) => v || null),
  comisionPagada: z.number().int().min(0).max(100000000).optional(),
});

/** Las visitas que ve esta persona: el dueño todas, un promotor las suyas. */
const alcance = (req) => (req.ruta.dueno ? {} : { promotor: req.ruta.alias });

// GET /api/ruta/visitas — visitas + comisión calculada con los pagos reales
router.get('/visitas', async (req, res, next) => {
  try {
    const visitas = await prisma.visitaComercial.findMany({ where: alcance(req), orderBy: { actualizadoEn: 'desc' } });
    const correos = [...new Set(visitas.map((v) => v.correo).filter(Boolean))];
    // Búsqueda insensible a mayúsculas: hay cuentas anteriores a la
    // normalización de correos (CLAUDE.md §14).
    const cuentas = correos.length ? await prisma.usuario.findMany({
      where: { OR: correos.map((email) => ({ email: { equals: email, mode: 'insensitive' } })) },
      select: { id: true, email: true, localesExtra: true,
        pagos: { select: { plan: true, periodo: true, tipo: true, estado: true, monto: true, creadoEn: true } } },
    }) : [];
    const porCorreo = Object.fromEntries(cuentas.map((c) => [c.email.toLowerCase(), c]));
    const ahora = new Date();
    res.json({
      yo: { alias: req.ruta.alias, dueno: req.ruta.dueno },
      visitas: visitas.map((v) => {
        const cuenta = v.correo ? porCorreo[v.correo.toLowerCase()] : null;
        return {
          ...v,
          cuentaEncontrada: !!cuenta,
          comision: comisionDeVisita({ fechaVisita: v.fechaVisita, pagos: cuenta?.pagos || [], localesExtra: cuenta?.localesExtra, ahora }),
        };
      }),
    });
  } catch (err) { next(err); }
});

// POST /api/ruta/visitas
router.post('/visitas', async (req, res, next) => {
  try {
    const d = esquema.parse(req.body);
    delete d.comisionPagada; // al crear, siempre 0
    const v = await prisma.visitaComercial.create({ data: { ...d, promotor: req.ruta.dueno ? 'dueno' : req.ruta.alias, creadoPorId: req.usuario.id } });
    res.status(201).json(v);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

const propia = async (req) => prisma.visitaComercial.findFirst({ where: { id: req.params.id, ...alcance(req) } });

// PUT /api/ruta/visitas/:id — la comisión pagada solo la escribe el dueño
router.put('/visitas/:id', async (req, res, next) => {
  try {
    if (!(await propia(req))) return res.status(404).json({ error: 'Visita no encontrada' });
    const d = esquema.parse(req.body);
    if (!req.ruta.dueno || d.comisionPagada === undefined) delete d.comisionPagada;
    const v = await prisma.visitaComercial.update({ where: { id: req.params.id }, data: d });
    res.json(v);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

// DELETE /api/ruta/visitas/:id
router.delete('/visitas/:id', async (req, res, next) => {
  try {
    if (!(await propia(req))) return res.status(404).json({ error: 'Visita no encontrada' });
    await prisma.visitaComercial.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
