// brand-shield/src/lib/borrarCuenta.js
//
// Borrar una cuenta y todo lo que cuelga de ella. Fuente única.
//
// ── Por qué está acá y no dentro de la ruta (2026-09-09) ────────────────────
//
// Vivía dentro de `DELETE /api/auth/cuenta`, que es el único camino que tenía un
// cliente para darse de baja. Pero también hace falta borrar cuentas **desde la
// terminal** —cuentas de prueba, direcciones desechables, altas que nunca se
// verificaron—, y escribir eso a mano en un script era pedir el fallo:
//
// 🔴 El orden de los borrados NO es cosmético. `miembros`, `invitaciones`,
// `registro_actividad`, `pagos`, `comprobantes` y `comentarios_sociales` apuntan
// con FK **ON DELETE RESTRICT**, así que saltarse uno no da un error entendible:
// da una violación de restricción a mitad del proceso, con parte de los datos ya
// borrados y la cuenta todavía en pie. Un script con su propia copia de la
// secuencia se desincroniza el día que alguien añada una tabla, y lo descubriría
// contra producción.
//
// Así que la secuencia vive en un solo sitio y los dos la llaman.
//
// ⚠️ El criterio de fondo se conserva intacto: si hay historial fiscal la cuenta
// se **ANONIMIZA** en vez de borrarse. El XML firmado y el CDR de cada
// comprobante hay que conservarlos 5 años, y un cliente no puede hacer
// desaparecer la contabilidad de la empresa pidiendo la baja. Es lo que permite
// la Ley 29733: el derecho de supresión cede ante una obligación legal de
// conservación, y lo correcto es conservar lo justo y disociar el resto.

const prisma = require('./prisma');

/**
 * Cuenta qué se va a borrar, SIN borrar nada.
 *
 * Existe para el simulacro del script: contra producción, «qué va a pasar» no se
 * deduce, se pregunta. Es el mismo criterio que `migrate diff` antes de un
 * `db push`.
 */
const inventario = async (usuarioId) => {
  const negocios = await prisma.negocio.findMany({ where: { usuarioId }, select: { id: true, nombre: true } });
  const ids = negocios.map((n) => n.id);
  const dondeNegocios = { negocioId: { in: ids } };
  const competidores = ids.length
    ? await prisma.competidor.findMany({ where: dondeNegocios, select: { id: true } }).catch(() => [])
    : [];

  const [alertas, resenas, snapshots, menciones, comentarios, snapsComp, pagos, comprobantes, miembros, invitaciones, actividad] =
    await Promise.all([
      ids.length ? prisma.alerta.count({ where: dondeNegocios }) : 0,
      ids.length ? prisma.resena.count({ where: dondeNegocios }) : 0,
      ids.length ? prisma.snapshot.count({ where: dondeNegocios }) : 0,
      ids.length ? prisma.mencion.count({ where: dondeNegocios }).catch(() => 0) : 0,
      ids.length ? prisma.comentarioSocial.count({ where: dondeNegocios }).catch(() => 0) : 0,
      competidores.length
        ? prisma.snapshotCompetidor.count({ where: { competidorId: { in: competidores.map((c) => c.id) } } }).catch(() => 0)
        : 0,
      prisma.pago.count({ where: { usuarioId } }),
      prisma.comprobante.count({ where: { usuarioId } }),
      prisma.miembro.count({ where: { OR: [{ cuentaId: usuarioId }, { usuarioId }] } }).catch(() => 0),
      prisma.invitacion.count({ where: { cuentaId: usuarioId } }).catch(() => 0),
      prisma.registroActividad.count({ where: { cuentaId: usuarioId } }).catch(() => 0),
    ]);

  return {
    negocios: negocios.map((n) => n.nombre),
    alertas, resenas, snapshots, menciones, comentarios,
    competidores: competidores.length, snapshotsCompetidor: snapsComp,
    pagos, comprobantes, miembros, invitaciones, actividad,
    // Lo que decide entre borrar de verdad y anonimizar.
    tieneHistorialFiscal: pagos > 0 || comprobantes > 0,
  };
};

/**
 * Borra (o anonimiza) la cuenta. Devuelve `{ modo: 'BORRADA' | 'ANONIMIZADA' }`.
 *
 * ⚠️ El orden es el que exigen las FK. No reordenar sin mirar el schema.
 */
const borrarCuenta = async (usuarioId) => {
  // ─── Equipo ───────────────────────────────────────────
  // Va PRIMERO: `miembros`, `invitaciones` y `registro_actividad` tienen FK
  // contra `usuarios`, así que sin esto el borrado falla con un error de
  // restricción que no dice nada útil.
  //
  // Se van los dos lados: el equipo que esta persona había invitado a SU cuenta
  // (nadie debe conservar acceso a una cuenta que ya no existe) y las membresías
  // que tenía en cuentas ajenas (deja de tener acceso a ellas).
  await prisma.miembro.deleteMany({ where: { OR: [{ cuentaId: usuarioId }, { usuarioId }] } }).catch(() => {});
  await prisma.invitacion.deleteMany({ where: { cuentaId: usuarioId } }).catch(() => {});
  await prisma.registroActividad.deleteMany({ where: { cuentaId: usuarioId } }).catch(() => {});

  // Lo que hizo dentro de cuentas AJENAS no se borra: es el historial de esa otra
  // empresa y no le pertenece a quien se va. Pero su nombre sí es un dato personal
  // suyo, así que se disocia — el registro sigue sirviendo para saber que fueron
  // acciones de una misma persona, sin identificarla.
  await prisma.registroActividad.updateMany({
    where: { usuarioId },
    data: { autorNombre: 'Usuario eliminado' },
  }).catch(() => {});

  // Eliminar en orden por dependencias de FK
  const negocios = await prisma.negocio.findMany({ where: { usuarioId }, select: { id: true } });
  const negocioIds = negocios.map((n) => n.id);

  if (negocioIds.length > 0) {
    await prisma.alerta.deleteMany({ where: { negocioId: { in: negocioIds } } });
    await prisma.resena.deleteMany({ where: { negocioId: { in: negocioIds } } });
    await prisma.snapshot.deleteMany({ where: { negocioId: { in: negocioIds } } });
    await prisma.mencion.deleteMany({ where: { negocioId: { in: negocioIds } } }).catch(() => {});
    // Obligatorio, no opcional: la FK de comentarios_sociales es ON DELETE
    // RESTRICT, así que sin este borrado la eliminación de cuenta falla.
    await prisma.comentarioSocial.deleteMany({ where: { negocioId: { in: negocioIds } } }).catch(() => {});
    const competidores = await prisma.competidor.findMany({
      where: { negocioId: { in: negocioIds } }, select: { id: true },
    }).catch(() => []);
    if (competidores.length > 0) {
      await prisma.snapshotCompetidor.deleteMany({
        where: { competidorId: { in: competidores.map((c) => c.id) } },
      }).catch(() => {});
      await prisma.competidor.deleteMany({ where: { negocioId: { in: negocioIds } } }).catch(() => {});
    }
    await prisma.negocio.deleteMany({ where: { usuarioId } });
  }

  // ¿Queda historial fiscal que la empresa está obligada a conservar?
  const tieneHistorialFiscal =
    (await prisma.pago.count({ where: { usuarioId } })) > 0
    || (await prisma.comprobante.count({ where: { usuarioId } })) > 0;

  if (!tieneHistorialFiscal) {
    await prisma.usuario.delete({ where: { id: usuarioId } });
    return { modo: 'BORRADA' };
  }

  // Anonimización. El correo se reemplaza por uno irrepetible dentro de un
  // dominio reservado (RFC 2606) para no chocar contra el @unique ni poder
  // colisionar jamás con un correo real, y la contraseña por una cadena que
  // bcrypt nunca va a validar — no es un hash, así que ningún `compare` puede
  // darle verdadero.
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      email: `eliminado-${usuarioId}@cuenta-eliminada.invalid`,
      nombre: 'Cuenta eliminada',
      password: 'CUENTA_ELIMINADA',
      telefono: null,
      googleId: null,
      tokenVerificacion: null,
      tokenVerificaExpira: null,
      tokenResetHash: null,
      tokenResetExpira: null,
      emailVerificado: false,
      suscripcionActiva: false,
      suscripcionId: null,
      fechaVencimiento: null,
      plan: 'GRATIS',
      prefsAlertas: null,
      // Datos fiscales del receptor: se van de la cuenta, pero siguen congelados
      // dentro de cada Comprobante ya emitido, que es donde la norma obliga a
      // conservarlos.
      docTipo: null,
      docNumero: null,
      razonSocial: null,
      direccionFiscal: null,
      paisFiscal: null,
    },
  });

  return { modo: 'ANONIMIZADA' };
};

module.exports = { borrarCuenta, inventario };
