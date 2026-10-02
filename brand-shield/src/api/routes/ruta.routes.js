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
const { ESTADOS, POLITICA_VIGENTE, accesoDe, comisionDeVisita, elegirCuenta, estadoEfectivo } = require('../../lib/rutaComercial');

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
  placeId: texto(300),
  direccion: texto(300),
  comisionPagada: z.number().int().min(0).max(100000000).optional(),
});

/** Las visitas que ve esta persona: el dueño todas, un promotor las suyas. */
const alcance = (req) => (req.ruta.dueno ? {} : { promotor: req.ruta.alias });

// Campos que deciden QUIÉN cobra una comisión: cada cambio queda en
// `cambios_visita` con su antes y su después (auditoría 2026-10-02, P1-15).
// La comisión pagada también: es dinero que se le entregó al promotor.
const CAMPOS_AUDITADOS = ['correo', 'placeId', 'fechaVisita', 'estado', 'comisionPagada'];
const comoTexto = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const registrarCambios = (tx, req, antes, despues) => {
  const filas = CAMPOS_AUDITADOS
    .filter((c) => c in despues && comoTexto(antes[c]) !== comoTexto(despues[c]))
    .map((c) => ({ visitaId: antes.id, autorId: req.usuario.id, autor: req.ruta.alias, campo: c, antes: comoTexto(antes[c]), despues: comoTexto(despues[c]) }));
  return filas.length ? tx.cambioVisita.createMany({ data: filas }) : null;
};

// GET /api/ruta/visitas — visitas + comisión calculada con los pagos reales
router.get('/visitas', async (req, res, next) => {
  try {
    // Las anuladas no se listan (ni comisionan). El dueño puede verlas con
    // `?anuladas=1`: siguen en la base, que es justo el punto de anularlas.
    const verAnuladas = req.ruta.dueno && req.query.anuladas === '1';
    const visitas = await prisma.visitaComercial.findMany({
      where: { ...alcance(req), ...(verAnuladas ? {} : { anuladaEn: null }) },
      orderBy: { actualizadoEn: 'desc' },
    });
    const PAGOS = { select: { plan: true, periodo: true, tipo: true, estado: true, monto: true, creadoEn: true } };
    const correos = [...new Set(visitas.map((v) => v.correo).filter(Boolean))];
    // Búsqueda insensible a mayúsculas: hay cuentas anteriores a la
    // normalización de correos (CLAUDE.md §14).
    const cuentas = correos.length ? await prisma.usuario.findMany({
      where: { OR: correos.map((email) => ({ email: { equals: email, mode: 'insensitive' } })) },
      select: { id: true, email: true, localesExtra: true, pagos: PAGOS },
    }) : [];
    const porCorreo = Object.fromEntries(cuentas.map((c) => [c.email.toLowerCase(), c]));

    // Respaldo por Google Maps: si el correo no casa (o no se anotó), el local
    // elegido en Maps se cruza con los negocios que los clientes agregaron en su panel.
    const sinCorreo = visitas.filter((v) => v.placeId && !(v.correo && porCorreo[v.correo.toLowerCase()]));
    const placeIds = [...new Set(sinCorreo.map((v) => v.placeId))];
    const negocios = placeIds.length ? await prisma.negocio.findMany({
      where: { googlePlaceId: { in: placeIds } },
      select: { googlePlaceId: true, creadoEn: true, usuario: { select: { id: true, email: true, localesExtra: true, pagos: PAGOS } } },
    }) : [];
    const porLocal = {};
    for (const n of negocios) (porLocal[n.googlePlaceId] ||= []).push({ ...n.usuario, negocioCreadoEn: n.creadoEn });

    const ahora = new Date();
    res.json({
      yo: { alias: req.ruta.alias, dueno: req.ruta.dueno },
      visitas: visitas.map((v) => {
        let cuenta = v.correo ? porCorreo[v.correo.toLowerCase()] : null;
        let vinculo = cuenta ? 'correo' : null;
        if (!cuenta && v.placeId) { cuenta = elegirCuenta(porLocal[v.placeId]); if (cuenta) vinculo = 'maps'; }
        const comision = v.anuladaEn
          ? { alta: 0, residual: 0, ganada: 0, porGanar: 0, plan: null, periodo: null, pagosCobrados: 0, estado: 'ANULADA' }
          : comisionDeVisita({ fechaVisita: v.fechaVisita, pagos: cuenta?.pagos || [], localesExtra: cuenta?.localesExtra, ahora, politica: v.politicaComision });
        return {
          ...v,
          cuentaEncontrada: !!cuenta,
          vinculo,
          // Solo el dueño ve con qué cuenta se vinculó: sirve para revisar la liquidación.
          ...(req.ruta.dueno && cuenta ? { correoVinculado: cuenta.email } : {}),
          estadoAuto: estadoEfectivo(v.estado, { cuentaEncontrada: !!cuenta, comision }),
          comision,
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
    // La visita nace con la versión VIGENTE de las reglas de comisión, y esa es
    // la que se le aplicará siempre (auditoría P1-17).
    const v = await prisma.visitaComercial.create({ data: { ...d, politicaComision: POLITICA_VIGENTE, promotor: req.ruta.dueno ? 'dueno' : req.ruta.alias, creadoPorId: req.usuario.id } });
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
    const antes = await propia(req);
    if (!antes) return res.status(404).json({ error: 'Visita no encontrada' });
    if (antes.anuladaEn) return res.status(409).json({ error: 'Esta visita está anulada y ya no se puede editar.' });
    const d = esquema.parse(req.body);
    if (!req.ruta.dueno || d.comisionPagada === undefined) delete d.comisionPagada;
    const v = await prisma.$transaction(async (tx) => {
      const nueva = await tx.visitaComercial.update({ where: { id: req.params.id }, data: d });
      await registrarCambios(tx, req, antes, nueva);
      return nueva;
    });
    res.json(v);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

// GET /api/ruta/visitas/:id/historial — quién cambió qué y cuándo
router.get('/visitas/:id/historial', async (req, res, next) => {
  try {
    if (!(await propia(req))) return res.status(404).json({ error: 'Visita no encontrada' });
    const cambios = await prisma.cambioVisita.findMany({ where: { visitaId: req.params.id }, orderBy: { creadoEn: 'asc' } });
    res.json(cambios);
  } catch (err) { next(err); }
});

// POST /api/ruta/visitas/:id/anular  (y DELETE, que hace lo mismo)
//
// 🔴 Una visita ya NO se borra (auditoría 2026-10-02, P1-14). Es la prueba de
// que el promotor llegó a ese local antes que el pago, o sea de su derecho a
// una comisión: el manual dice «no se borran, se corrigen». Se ANULA con quién,
// cuándo y por qué, y deja de listarse y de comisionar — pero sigue en la base.
const anular = async (req, res, next) => {
  try {
    const visita = await propia(req);
    if (!visita) return res.status(404).json({ error: 'Visita no encontrada' });
    if (visita.anuladaEn) return res.json({ ok: true, yaEstaba: true });
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
    if (motivo.length < 3) return res.status(400).json({ error: 'Escribe por qué se anula esta visita.' });
    await prisma.$transaction(async (tx) => {
      await tx.visitaComercial.update({
        where: { id: visita.id },
        data: { anuladaEn: new Date(), anuladaPor: req.ruta.alias, motivoAnulacion: motivo },
      });
      await tx.cambioVisita.create({
        data: { visitaId: visita.id, autorId: req.usuario.id, autor: req.ruta.alias, campo: 'anulada', antes: null, despues: motivo },
      });
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
};
router.post('/visitas/:id/anular', anular);
router.delete('/visitas/:id', anular);

module.exports = router;
