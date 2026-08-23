// brand-shield/src/lib/verificacion.js
//
// Cuándo toca recordarle a alguien que active su cuenta, en un solo sitio.
//
// 🔴 POR QUÉ EXISTE. Una cuenta sin verificar no recibe NADA de Notoria: el drip
// de onboarding filtra por `emailVerificado: true`, y las alertas dependen de
// tener un negocio conectado, que es justo lo que esa gente no llega a hacer. El
// único correo que se les manda es el del registro, con un enlace que caduca a
// las 24 horas. Si no lo abren ese día, la cuenta queda muerta en silencio y
// nadie se entera: no hay error, no hay log, no hay rebote.
//
// Foto de producción del 2026-08-23: **4 de 11 usuarios sin verificar**, dos de
// ellos registrados el 5 de julio. Un tercio del padrón, invisible.
//
// ── Cómo se lleva la cuenta sin columna nueva ────────────────────────────────
//
// No hace falta migrar nada. `tokenVerificaExpira` se reescribe en CADA envío
// del correo de verificación (registro, reenvío manual desde el panel y este
// recordatorio), siempre a «ahora + 24 h». O sea que ya es, de hecho, la marca
// del último envío: basta restarle esas 24 horas.
//
// Eso trae una ventaja que una columna propia no tendría: si la persona pulsa
// «reenviar» desde Configuración, el cron lo ve y no le manda un duplicado al
// día siguiente. Las dos vías comparten el mismo marcador sin coordinarse.
//
// ── Por qué una VENTANA y no «dos recordatorios» ─────────────────────────────
//
// Contar envíos exigiría una columna. Una ventana de días de vida de la cuenta
// con un espaciado mínimo se autolimita sola y además es robusta ante un día que
// el cron no corra: al día siguiente la persona sigue dentro de la ventana y el
// recordatorio sale igual. Con días exactos ({2, 7}) un cron caído significaría
// perder ese recordatorio para siempre, que es justo la clase de fallo silencioso
// que este archivo viene a cerrar.
//
// ⚠️ Cuántos correos salen en la práctica: **dos**, el día 4 y el día 8. El
// espaciado se cuenta desde el ÚLTIMO correo de verificación, y el del registro
// cuenta, así que los días 2 y 3 quedan bloqueados por el espaciado aunque estén
// dentro de la ventana. `VENTANA_DIAS.desde` se deja en 2 como suelo de
// seguridad —cubre el caso de un usuario sin `tokenVerificaExpira` guardado—,
// no porque el día 2 vaya a salir un correo.
//
// Pasados los 10 días se deja de insistir. Quien no activó en diez días con tres
// correos no lo va a hacer con el cuarto, y seguir escribiendo a un buzón que no
// confirmó nada es spam. Para las cuentas viejas que quedaron fuera de la
// ventana está `scripts/recordar-verificacion.js`, que es una pasada única y
// manual, no un cron.

const DIA_MS = 24 * 60 * 60 * 1000;

// El enlace de verificación caduca a las 24 h. El mismo valor que usan el
// registro y el reenvío manual — de acá se deriva la marca de último envío, así
// que si allá cambia, tiene que cambiar acá.
const HORAS_VIGENCIA_TOKEN = 24;

// Días de vida de la cuenta en los que se insiste. Antes del 2.º no: la persona
// puede estar a punto de abrir el correo del registro.
const VENTANA_DIAS = { desde: 2, hasta: 10 };

// Días mínimos entre dos correos a la misma persona.
const ESPACIADO_DIAS = 4;

/**
 * Cuándo se le mandó por última vez un correo de verificación.
 * Derivado de `tokenVerificaExpira`; si falta, se asume el registro.
 */
const ultimoEnvioVerificacion = (usuario) => {
  if (usuario.tokenVerificaExpira) {
    return new Date(new Date(usuario.tokenVerificaExpira).getTime() - HORAS_VIGENCIA_TOKEN * 60 * 60 * 1000);
  }
  return new Date(usuario.creadoEn);
};

const diasEntre = (desde, hasta) => Math.floor((hasta - new Date(desde).getTime()) / DIA_MS);

/**
 * ¿Le toca recordatorio a este usuario?
 * Devuelve siempre un motivo, para que el script y los logs puedan explicar
 * por qué NO se manda — que es la mitad que normalmente no se puede depurar.
 *
 * @returns {{ toca: boolean, motivo: string, diasDesdeRegistro: number, diasDesdeUltimoEnvio: number }}
 */
const tocaRecordatorio = (usuario, ahora = Date.now()) => {
  const diasDesdeRegistro = diasEntre(usuario.creadoEn, ahora);
  const diasDesdeUltimoEnvio = diasEntre(ultimoEnvioVerificacion(usuario), ahora);
  const base = { diasDesdeRegistro, diasDesdeUltimoEnvio };

  if (usuario.emailVerificado) return { ...base, toca: false, motivo: 'ya verificó' };
  if (diasDesdeRegistro < VENTANA_DIAS.desde) return { ...base, toca: false, motivo: `muy reciente (día ${diasDesdeRegistro} de ${VENTANA_DIAS.desde})` };
  if (diasDesdeRegistro > VENTANA_DIAS.hasta) return { ...base, toca: false, motivo: `fuera de la ventana (día ${diasDesdeRegistro}, el límite es ${VENTANA_DIAS.hasta})` };
  if (diasDesdeUltimoEnvio < ESPACIADO_DIAS) return { ...base, toca: false, motivo: `se le escribió hace ${diasDesdeUltimoEnvio} día(s), el mínimo es ${ESPACIADO_DIAS}` };

  return { ...base, toca: true, motivo: `día ${diasDesdeRegistro}, último correo hace ${diasDesdeUltimoEnvio}` };
};

module.exports = {
  tocaRecordatorio,
  ultimoEnvioVerificacion,
  DIA_MS,
  HORAS_VIGENCIA_TOKEN,
  VENTANA_DIAS,
  ESPACIADO_DIAS,
};
