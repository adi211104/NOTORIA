// brand-shield/src/lib/prefsCorreo.js
//
// Cuánto correo manda Notoria, y quién lo decide. Fuente única.
//
// ── Por qué existe (2026-09-09) ────────────────────────────────────────────
//
// Hasta hoy el producto tenía dos ajustes de correo repartidos y un tercero que
// no existía:
//
//   · El **resumen por negocio** (`resumenSemanal.worker.js`) salía TODOS los
//     domingos a las 8:00 para todo el mundo, sin preferencia que lo gobernara.
//     Es el correo que más manda el producto —38 envíos en el historial de
//     Resend, más que ningún otro— y nadie podía bajarle el ritmo.
//   · El **aviso por reseña negativa** salía uno por reseña, al momento. Para una
//     cuenta gratuita recién creada que solo entró a curiosear, eso es una
//     bandeja llena de correos de un producto que todavía no le importa: la vía
//     más rápida a marcarnos como spam, y con el dominio quemado se cae la
//     entrega de TODO lo demás, incluidos los avisos que sí importan.
//
// 🔴 La decisión de producto, tomada con el dueño: **el correo no se pierde, se
// AGRUPA.** El resumen pasa a mensual por defecto y el aviso por reseña se junta
// de a cinco en el plan gratuito. Las dos cosas siguen siendo configurables, y
// nada se deja de detectar: el panel enseña todo desde el primer segundo.
//
// ── La regla que hay que respetar al tocar esto ─────────────────────────────
//
// ⚠️ Los valores por defecto viven ACÁ Y SOLO ACÁ, en código, no como fila en la
// base. `Usuario.prefsAlertas` es `Json?` y arranca **null**: una cuenta nueva no
// tiene ninguna preferencia guardada, así que quien decide es este archivo. Si
// alguien copia un default a un call-site, el día que cambie quedarán dos
// respuestas distintas a la misma pregunta y solo una se aplicará — el mismo
// fallo que `lib/planes.js` existe para impedir.

// ── El resumen por negocio ────────────────────────────────

const CADENCIAS = ['MENSUAL', 'SEMANAL'];

// 🔴 MENSUAL, y era SEMANAL hasta el 2026-09-09. Quien quiera el ritmo de antes
// lo elige en Alertas → Configurar notificaciones; lo que cambia es el default,
// que es lo que reciben las cuentas que nunca tocan un ajuste — o sea casi todas.
const CADENCIA_POR_DEFECTO = 'MENSUAL';

// Domingo. Solo aplica a la cadencia semanal; la mensual sale el día 1, igual que
// el digest de alertas, para no estrenar un segundo calendario.
const DIA_POR_DEFECTO = 0;

// Cuántos días de historia mira el resumen. Tiene que ir con la cadencia: un
// correo mensual que solo contara los últimos 7 días diría «0 reseñas nuevas» a
// un negocio que tuvo cuatro, y encima con la palabra «mensual» en el asunto.
const DIAS_VENTANA = { SEMANAL: 7, MENSUAL: 30 };

const cadenciaResumen = (prefs) => (
  CADENCIAS.includes(prefs?.resumen?.cadencia) ? prefs.resumen.cadencia : CADENCIA_POR_DEFECTO
);

const diaResumen = (prefs) => {
  const d = prefs?.resumen?.diaSemana;
  return Number.isInteger(d) && d >= 0 && d <= 6 ? d : DIA_POR_DEFECTO;
};

const diasVentana = (cadencia) => DIAS_VENTANA[cadencia] || DIAS_VENTANA.MENSUAL;

/**
 * El periodo como VALOR, nunca como texto ya redactado.
 *
 * ⚠️ Es la regla que dejaron las invitaciones de equipo y el digest de alertas:
 * lo que lleva idioma se compone en la plantilla, no acá. Devolver «mensual»
 * escrito metía español dentro de un correo en inglés.
 */
const periodoDe = (cadencia) => (cadencia === 'SEMANAL' ? 'semanal' : 'mensual');

/**
 * Calendario en hora de Lima, no en la del servidor.
 *
 * El cron dispara a las 8:00 America/Lima, o sea 13:00 UTC, hora a la que las dos
 * fechas coinciden siempre —Perú es UTC-5 fijo, sin horario de verano—, así que
 * hoy da igual. Se hace bien de todos modos porque `ejecutarAhora` se llama
 * también a mano desde un script, y a las 20:00 de Lima el servidor ya está en el
 * día siguiente: ahí un resumen mensual saldría el día 2 y el semanal un día
 * corrido. Es el mismo error que este proyecto ya cometió con las fechas de SUNAT
 * y con el agrupado por día del score.
 */
const calendarioLima = (momento = new Date()) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(momento);
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { diaSemana: dias[valor('weekday')], diaMes: Number(valor('day')) };
};

/** ¿Hoy le toca el resumen a este usuario? */
const tocaResumen = (prefs, momento = new Date()) => {
  const { diaSemana, diaMes } = calendarioLima(momento);
  const cadencia = cadenciaResumen(prefs);
  return cadencia === 'SEMANAL' ? diaSemana === diaResumen(prefs) : diaMes === 1;
};

// ── El aviso por reseña negativa ──────────────────────────

// Cuántas reseñas negativas se juntan antes de mandar UN correo cuando el usuario
// no ha elegido nada: sale de `lib/planes.js`, clave `loteAvisoResenas`.
//
// 🔴 El valor por plan NO se declara acá, y no es un detalle de organización.
// Escribí primero una tabla `{ GRATIS: 5 }` en este archivo y `prueba-planes.js`
// la cazó el mismo día: una tabla por plan fuera de `lib/planes.js` es
// exactamente lo que costó los tres fallos silenciosos de IMPULSO (§8.6) —el plan
// más barato con 999 negocios, la renovación que cobraba una sola vez y la bajada
// que regalaba el plan de por vida—. El barrido existe para eso y funcionó.
//
// GRATIS agrupa de a 5 y los planes de pago avisan al momento. El motivo no es
// «darle menos a quien no paga»: es que lo que se vende en los planes de pago **es
// el tiempo de reacción**. Una cuenta gratuita que entró a mirar no necesita un
// correo por reseña; un restaurante que paga por enterarse antes de que la reseña
// de 1★ lleve un día encima, sí.
const { limite } = require('./planes');

const LOTE_POR_DEFECTO = 1;

// Los tamaños que el usuario puede elegir a mano. Son los dos que el panel
// ofrece; cualquier otro valor cae al default de su plan.
const LOTES_VALIDOS = [1, 5];

// No se agrupan reseñas de hace meses. Sin esta ventana, una cuenta que estuvo
// con el aviso apagado y luego lo agrupa recibiría de golpe un correo con cinco
// reseñas viejas — que es exactamente el correo que nadie entiende.
const VENTANA_LOTE_DIAS = 30;

/**
 * De cuántas en cuántas se agrupa el aviso por reseña negativa.
 *
 * ⚠️ `umbralNegativas` CAMBIÓ DE SIGNIFICADO el 2026-09-09, y a mejor: antes un
 * 5 quería decir «solo avísame de picos de 5+ en 24 h», y esa promesa estaba
 * muerta —la señal de picos por conteo no puede dispararse nunca, porque Google
 * Places entrega **5 reseñas como máximo** por consulta (§12)—. O sea que quien
 * marcaba esa opción se quedaba sin ningún aviso y sin saberlo. Ahora un 5
 * significa «júntalas de a cinco», que es lo que la etiqueta daba a entender y lo
 * que además funciona.
 */
const loteAlertas = (plan, prefs) => {
  const elegido = prefs?.umbralNegativas;
  if (LOTES_VALIDOS.includes(elegido)) return elegido;
  // ⚠️ Un plan desconocido se comporta como GRATIS —o sea AGRUPANDO—, que es lo
  // que hace `capacidades()` en la tabla de planes: el más restrictivo. Acá el
  // lado seguro es además el que manda menos correo, así que un plan que no
  // reconocemos no puede provocar una avalancha.
  return limite(plan, 'loteAvisoResenas') || LOTE_POR_DEFECTO;
};

/** ¿Este tipo de alerta se agrupa, o va suelto siempre? */
// Solo la reseña individual. La ficha alterada y la escalación de 24 h ni pasan
// por acá (van por `enviarAlertaEmail` directo, a propósito: ninguna preferencia
// debería poder silenciar «tu local aparece cerrado en Google»), y las caídas de
// rating o las campañas coordinadas son de por sí infrecuentes: agruparlas
// retrasaría justo el aviso que hay que dar rápido.
const TIPOS_AGRUPABLES = ['RESENA_MUY_NEGATIVA'];
const seAgrupa = (tipo) => TIPOS_AGRUPABLES.includes(tipo);

module.exports = {
  CADENCIAS, CADENCIA_POR_DEFECTO, DIA_POR_DEFECTO, DIAS_VENTANA,
  LOTE_POR_DEFECTO, LOTES_VALIDOS, VENTANA_LOTE_DIAS, TIPOS_AGRUPABLES,
  cadenciaResumen, diaResumen, diasVentana, periodoDe, calendarioLima, tocaResumen,
  loteAlertas, seAgrupa,
};
