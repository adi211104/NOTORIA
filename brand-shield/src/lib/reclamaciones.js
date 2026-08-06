// brand-shield/src/lib/reclamaciones.js
// Plazo legal del Libro de Reclamaciones — Ley 29571.
//
// El proveedor debe responder en un máximo de 15 DÍAS HÁBILES desde la
// recepción, improrrogables. Vive aquí y no dentro de un script porque lo usan
// tanto la gestión manual (`scripts/reclamaciones.js`) como el aviso automático
// del worker: si cada uno contara los días por su cuenta, acabarían discrepando
// y el recordatorio llegaría tarde.
//
// ⚠️ Cuenta de lunes a viernes y NO descuenta feriados nacionales, así que el
// plazo real puede ser algo más largo que el calculado. Es intencional: ir por
// delante no incumple nada, ir por detrás sí.

const DIAS_HABILES_PLAZO = 15;

const esHabil = (fecha) => {
  const dia = fecha.getDay();
  return dia !== 0 && dia !== 6;
};

const sumarDiasHabiles = (desde, dias) => {
  const fecha = new Date(desde);
  let restantes = dias;
  while (restantes > 0) {
    fecha.setDate(fecha.getDate() + 1);
    if (esHabil(fecha)) restantes--;
  }
  return fecha;
};

// Días hábiles entre dos fechas. Negativo si `hasta` ya pasó.
const diasHabilesEntre = (desde, hasta) => {
  const a = new Date(desde); a.setHours(0, 0, 0, 0);
  const b = new Date(hasta); b.setHours(0, 0, 0, 0);
  if (a.getTime() === b.getTime()) return 0;
  const signo = b < a ? -1 : 1;
  let dias = 0;
  const cursor = new Date(a);
  while (cursor.getTime() !== b.getTime()) {
    cursor.setDate(cursor.getDate() + signo);
    if (esHabil(cursor)) dias += signo;
  }
  return dias;
};

// Estado del plazo de una reclamación, para poder priorizar de un vistazo.
const plazoDe = (reclamacion) => {
  const venceEl = sumarDiasHabiles(reclamacion.creadoEn, DIAS_HABILES_PLAZO);
  if (reclamacion.estado === 'RESPONDIDO') {
    return { venceEl, diasRestantes: null, vencida: false, urgente: false };
  }
  const diasRestantes = diasHabilesEntre(new Date(), venceEl);
  return {
    venceEl,
    diasRestantes,
    vencida: diasRestantes < 0,
    // A 3 días hábiles o menos ya hay que moverse
    urgente: diasRestantes >= 0 && diasRestantes <= 3,
  };
};

module.exports = { DIAS_HABILES_PLAZO, sumarDiasHabiles, diasHabilesEntre, plazoDe };
