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
const { ESTADOS, POLITICA_VIGENTE, accesoDe, tablaAcceso, estadoEfectivo } = require('../../lib/rutaComercial');
const libro = require('../../lib/libroComisiones');

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
  // Solo el dueño, y queda en el historial: reasignar una visita a otro
  // promotor mueve su comisión (el libro revierte al anterior y genera al nuevo).
  promotor: z.string().trim().min(1).max(60).optional(),
});

/** Las visitas que ve esta persona: el dueño todas, un promotor las suyas. */
const alcance = (req) => (req.ruta.dueno ? {} : { promotor: req.ruta.alias });

// Campos que deciden QUIÉN cobra una comisión: cada cambio queda en
// `cambios_visita` con su antes y su después (auditoría 2026-10-02, P1-15).
// Y a qué promotor pertenece (solo el dueño la cambia). Lo pagado al promotor
// ya no es un campo de la visita: es un asiento del libro (lib/libroComisiones.js).
const CAMPOS_AUDITADOS = ['correo', 'placeId', 'fechaVisita', 'estado', 'promotor'];
const comoTexto = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const registrarCambios = (tx, req, antes, despues) => {
  const filas = CAMPOS_AUDITADOS
    .filter((c) => c in despues && comoTexto(antes[c]) !== comoTexto(despues[c]))
    .map((c) => ({ visitaId: antes.id, autorId: req.usuario.id, autor: req.ruta.alias, campo: c, antes: comoTexto(antes[c]), despues: comoTexto(despues[c]) }));
  return filas.length ? tx.cambioVisita.createMany({ data: filas }) : null;
};

/** Alias que pueden tener visitas: los de RUTA_COMERCIAL_ACCESO más «dueno». */
const promotoresConocidos = () => [...new Set(['dueno', ...Object.values(tablaAcceso()).map((a) => (a.toLowerCase() === 'dueno' ? 'dueno' : a))])];

// Pone el libro al día antes de leerlo. Si falla, la pantalla se sirve igual
// con lo ya asentado (el cron horario lo reintenta), pero queda en el log.
const libroAlDia = () => libro.sincronizar().catch((e) => {
  console.error('[Comisiones] 🔴 No se pudo sincronizar el libro antes de leerlo:', e.message);
  return null;
});

// GET /api/ruta/visitas — visitas + comisión calculada con los pagos reales
// y lo asentado en el libro de comisiones
router.get('/visitas', async (req, res, next) => {
  try {
    const sincronizado = await libroAlDia();
    // La atribución de una visita depende de las DEMÁS (contrato 7.1.d:
    // prevalece el registro más antiguo, sea de quien sea), así que se evalúan
    // todas y después se filtra lo que esta persona puede ver.
    const todas = await prisma.visitaComercial.findMany({ orderBy: { actualizadoEn: 'desc' } });
    const evals = await libro.evaluar(prisma, todas, new Date());
    // Las anuladas no se listan (ni comisionan). El dueño puede verlas con
    // `?anuladas=1`: siguen en la base, que es justo el punto de anularlas.
    const verAnuladas = req.ruta.dueno && req.query.anuladas === '1';
    const visitas = todas.filter((v) => (req.ruta.dueno || v.promotor === req.ruta.alias) && (verAnuladas || !v.anuladaEn));
    const alcanceLibro = req.ruta.dueno ? {} : { promotor: req.ruta.alias };
    const [porVisita, saldos] = await Promise.all([
      prisma.movimientoComision.groupBy({
        by: ['visitaId'],
        where: { ...alcanceLibro, concepto: { in: libro.CONCEPTOS_DERIVADOS }, visitaId: { in: visitas.map((v) => v.id) } },
        _sum: { monto: true },
      }),
      libro.saldos({ promotor: req.ruta.dueno ? undefined : req.ruta.alias }),
    ]);
    const devengadoDe = Object.fromEntries(porVisita.map((g) => [g.visitaId, g._sum.monto || 0]));

    res.json({
      yo: { alias: req.ruta.alias, dueno: req.ruta.dueno },
      libroAlDia: !!sincronizado,
      saldos: req.ruta.dueno ? saldos : { [req.ruta.alias]: saldos[req.ruta.alias] || { devengado: 0, pagado: 0, ajustes: 0, saldo: 0 } },
      ...(req.ruta.dueno ? { promotores: promotoresConocidos() } : {}),
      visitas: visitas.map((v) => {
        const { cuenta, vinculo, comision, prevaleceOtra } = evals[v.id];
        const { detalle, ...resumen } = comision;
        return {
          ...v,
          cuentaEncontrada: !!cuenta,
          vinculo,
          // Solo el dueño ve con qué cuenta se vinculó: sirve para revisar la liquidación.
          ...(req.ruta.dueno && cuenta ? { correoVinculado: cuenta.email } : {}),
          // El promotor sabe QUE otro registro prevaleció, no de quién (es de otro promotor).
          ...(prevaleceOtra ? { registroPrevio: true } : {}),
          estadoAuto: estadoEfectivo(v.estado, { cuentaEncontrada: !!cuenta, comision }),
          comision: resumen,
          devengadoLibro: devengadoDe[v.id] || 0,
        };
      }),
    });
  } catch (err) { next(err); }
});

// POST /api/ruta/visitas
router.post('/visitas', async (req, res, next) => {
  try {
    const d = esquema.parse(req.body);
    delete d.promotor; // el promotor sale del acceso, nunca del cuerpo
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

// PUT /api/ruta/visitas/:id — reasignar el promotor solo lo hace el dueño
router.put('/visitas/:id', async (req, res, next) => {
  try {
    const antes = await propia(req);
    if (!antes) return res.status(404).json({ error: 'Visita no encontrada' });
    if (antes.anuladaEn) return res.status(409).json({ error: 'Esta visita está anulada y ya no se puede editar.' });
    const d = esquema.parse(req.body);
    if (!req.ruta.dueno || d.promotor === undefined) delete d.promotor;
    else if (!promotoresConocidos().includes(d.promotor)) return res.status(400).json({ error: `«${d.promotor}» no es un promotor con acceso a la Ruta.` });
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

// ─── Libro de comisiones (2026-10-07) ─────────────────────────────────────
// El promotor ve sus asientos; el dueño, los de todos y es el único que
// asienta pagos y ajustes. Ningún asiento se edita ni se borra.

const promotorPedido = (req) => (req.ruta.dueno ? String(req.query.promotor || req.body?.promotor || '').trim() : req.ruta.alias);

// GET /api/ruta/libro?promotor=X — asientos, del más nuevo al más viejo
router.get('/libro', async (req, res, next) => {
  try {
    await libroAlDia();
    const promotor = promotorPedido(req);
    const asientos = await prisma.movimientoComision.findMany({
      where: promotor ? { promotor } : {},
      orderBy: { creadoEn: 'desc' },
      take: 500,
      include: { visita: { select: { nombre: true } } },
    });
    res.json({ asientos, saldos: await libro.saldos({ promotor: promotor || undefined }) });
  } catch (err) { next(err); }
});

// GET /api/ruta/liquidacion?mes=AAAA-MM&promotor=X — la del contrato 8.1
router.get('/liquidacion', async (req, res, next) => {
  try {
    const promotor = promotorPedido(req);
    if (!promotor) return res.status(400).json({ error: 'Indica de qué promotor es la liquidación.' });
    await libroAlDia();
    const l = await libro.liquidacion({ promotor, mes: req.query.mes });
    res.json({ ...l, texto: libro.textoLiquidacion(l) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

const soloDueno = (req, res, next) => (req.ruta.dueno ? next() : res.status(404).json({ error: 'Ruta no encontrada' }));
const esquemaPago = z.object({
  promotor: z.string().trim().min(1).max(60),
  monto: z.number().int().min(1, 'El monto tiene que ser mayor que 0').max(100000000),
  referencia: z.string().trim().min(3, 'Anota el n.º de operación o del recibo por honorarios').max(200),
});
const esquemaAjuste = z.object({
  promotor: z.string().trim().min(1).max(60),
  visitaId: z.string().trim().max(60).optional().transform((v) => v || null),
  monto: z.number().int().refine((n) => n !== 0, 'El ajuste no puede ser 0').refine((n) => Math.abs(n) <= 100000000, 'Monto fuera de rango'),
  motivo: z.string().trim().min(10, 'Explica el ajuste (mínimo 10 caracteres): queda en la liquidación').max(500),
});

// POST /api/ruta/pagos-promotor — lo que se le transfirió al promotor
// 🔴 Con el candado del libro: dos pagos registrados a la vez no pueden pasar
// los dos el control de saldo.
router.post('/pagos-promotor', soloDueno, async (req, res, next) => {
  try {
    const d = esquemaPago.parse(req.body);
    if (!promotoresConocidos().includes(d.promotor)) return res.status(400).json({ error: `«${d.promotor}» no es un promotor con acceso a la Ruta.` });
    await libroAlDia();
    const asiento = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('libro-comisiones'))`;
      const { _sum } = await tx.movimientoComision.aggregate({ where: { promotor: d.promotor }, _sum: { monto: true } });
      const saldo = _sum.monto || 0;
      if (d.monto > saldo) {
        throw Object.assign(new Error(`El saldo por pagar a ${d.promotor} es S/${(saldo / 100).toFixed(2)}: no se puede registrar un pago mayor.`), { status: 409 });
      }
      return tx.movimientoComision.create({
        data: { promotor: d.promotor, concepto: 'PAGO', tipo: 'PAGADA', monto: -d.monto, referencia: d.referencia, motivo: 'Pago de comisiones', autor: req.ruta.alias, autorId: req.usuario.id },
      });
    });
    res.status(201).json(asiento);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    if (err.status === 409) return res.status(409).json({ error: err.message, codigo: 'PAGO_MAYOR_QUE_SALDO' });
    next(err);
  }
});

// POST /api/ruta/ajustes — corrección manual con motivo (contracargo, 7.1.e…)
router.post('/ajustes', soloDueno, async (req, res, next) => {
  try {
    const d = esquemaAjuste.parse(req.body);
    if (!promotoresConocidos().includes(d.promotor)) return res.status(400).json({ error: `«${d.promotor}» no es un promotor con acceso a la Ruta.` });
    if (d.visitaId && !(await prisma.visitaComercial.findFirst({ where: { id: d.visitaId, promotor: d.promotor } }))) {
      return res.status(400).json({ error: 'Esa visita no es de ese promotor.' });
    }
    const asiento = await prisma.movimientoComision.create({
      data: { promotor: d.promotor, visitaId: d.visitaId, concepto: 'AJUSTE', tipo: 'AJUSTADA', monto: d.monto, motivo: d.motivo, autor: req.ruta.alias, autorId: req.usuario.id },
    });
    res.status(201).json(asiento);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

module.exports = router;
