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
const borrarCuenta = async (usuarioId, db = prisma) => {
  // 🔴 TODO en UNA transacción, y sin `.catch(() => {})` (auditoría 2026-10-02,
  // P1-13). Antes cada borrado se tragaba su propio error: si uno fallaba, la
  // cuenta podía quedar borrada a medias, la ruta responder «cuenta eliminada»
  // y quedar datos personales vivos — en la única operación que existe para
  // cumplir el derecho de supresión (Ley 29733). Ahora o se borra todo o no se
  // borra nada, y el error llega a quien lo pidió.
  const modo = await db.$transaction(async (tx) => {
    // ─── Equipo ─────────────────────────────────────────
    // Va PRIMERO: `miembros`, `invitaciones` y `registro_actividad` tienen FK
    // contra `usuarios`. Se van los dos lados: el equipo que esta persona había
    // invitado a SU cuenta y las membresías que tenía en cuentas ajenas.
    await tx.miembro.deleteMany({ where: { OR: [{ cuentaId: usuarioId }, { usuarioId }] } });
    await tx.invitacion.deleteMany({ where: { cuentaId: usuarioId } });
    await tx.registroActividad.deleteMany({ where: { cuentaId: usuarioId } });

    // Lo que hizo dentro de cuentas AJENAS no se borra (es historial de esa otra
    // empresa), pero su nombre sí es un dato personal suyo: se disocia.
    await tx.registroActividad.updateMany({ where: { usuarioId }, data: { autorNombre: 'Usuario eliminado' } });

    // Eliminar en orden por dependencias de FK (varias son ON DELETE RESTRICT).
    const negocios = await tx.negocio.findMany({ where: { usuarioId }, select: { id: true } });
    const negocioIds = negocios.map((n) => n.id);
    if (negocioIds.length > 0) {
      const enNegocios = { negocioId: { in: negocioIds } };
      await tx.alerta.deleteMany({ where: enNegocios });
      await tx.resena.deleteMany({ where: enNegocios });
      await tx.snapshot.deleteMany({ where: enNegocios });
      await tx.mencion.deleteMany({ where: enNegocios });
      await tx.comentarioSocial.deleteMany({ where: enNegocios });
      const competidores = await tx.competidor.findMany({ where: enNegocios, select: { id: true } });
      if (competidores.length > 0) {
        await tx.snapshotCompetidor.deleteMany({ where: { competidorId: { in: competidores.map((c) => c.id) } } });
        await tx.competidor.deleteMany({ where: enNegocios });
      }
      await tx.negocio.deleteMany({ where: { usuarioId } });
    }

    // ¿Queda historial fiscal que la empresa está obligada a conservar?
    const tieneHistorialFiscal =
      (await tx.pago.count({ where: { usuarioId } })) > 0
      || (await tx.comprobante.count({ where: { usuarioId } })) > 0;

    if (!tieneHistorialFiscal) {
      // Sin pagos, los intentos de cobro (fallidos) y las huellas de promo son
      // solo rastro de la persona: se van con ella.
      await tx.intentoCobro.deleteMany({ where: { usuarioId } });
      await tx.promoTarjeta.deleteMany({ where: { usuarioId } });
      await tx.usuario.delete({ where: { id: usuarioId } });
      return 'BORRADA';
    }

    // Anonimización. El correo se reemplaza por uno irrepetible dentro de un
    // dominio reservado (RFC 2606) para no chocar contra el @unique ni poder
    // colisionar jamás con un correo real, y la contraseña por una cadena que
    // bcrypt nunca va a validar — no es un hash, así que ningún `compare` puede
    // darle verdadero.
    await tx.usuario.update({
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
        tarjetaCulqiId: null,
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
    // El nombre del titular en el historial de cobros es un dato personal que
    // el comprobante ya conserva por obligación: en el Pago se disocia.
    await tx.pago.updateMany({ where: { usuarioId }, data: { titular: 'Cuenta eliminada' } });
    return 'ANONIMIZADA';
  }, { timeout: 120000, maxWait: 15000 });

  // Verificación final, FUERA de la transacción: se le pregunta a la base si de
  // verdad no queda nada. «Se ejecutó sin error» y «ya no está» son cosas
  // distintas (lección del borrado del 2026-09-09).
  const restos = await verificarBorrado(usuarioId, modo, db);
  if (restos.length) throw new Error(`El borrado de ${usuarioId} dejó datos: ${restos.join(', ')}`);
  return { modo };
};

/** Lo que sigue en la base después de borrar. Vacío = borrado completo. */
const verificarBorrado = async (usuarioId, modo, db = prisma) => {
  const restos = [];
  if ((await db.negocio.count({ where: { usuarioId } })) > 0) restos.push('negocios');
  if ((await db.miembro.count({ where: { OR: [{ cuentaId: usuarioId }, { usuarioId }] } })) > 0) restos.push('miembros');
  if ((await db.invitacion.count({ where: { cuentaId: usuarioId } })) > 0) restos.push('invitaciones');
  const u = await db.usuario.findUnique({ where: { id: usuarioId }, select: { email: true, nombre: true, docNumero: true, telefono: true } });
  if (modo === 'BORRADA' && u) restos.push('usuario');
  if (modo === 'ANONIMIZADA' && u && (!u.email.endsWith('@cuenta-eliminada.invalid') || u.nombre !== 'Cuenta eliminada' || u.docNumero || u.telefono)) {
    restos.push('datos personales en el usuario');
  }
  return restos;
};

module.exports = { borrarCuenta, inventario, verificarBorrado };
