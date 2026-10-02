// brand-shield/src/lib/rutaComercial.js
//
// Ruta comercial: quién puede abrir /ruta y cuánta comisión le toca al promotor.
// Puro a propósito (sin red ni base): lo prueba `scripts/prueba-ruta-comercial.js`.
//
// ── Acceso ──────────────────────────────────────────────────────────────────
// `RUTA_COMERCIAL_ACCESO` = lista separada por comas de `correo:alias`, p. ej.
//   didierprincipe@gmail.com:dueno,promotor@usenotoria.app:Usuario1
// El alias `dueno` ve todas las visitas y escribe la comisión pagada; cualquier
// otro alias es un promotor y solo ve y edita las suyas. Se lee en cada
// petición, así que dar o quitar acceso es cambiar una variable, sin desplegar.
// Sin la variable, nadie entra: falla CERRADO, porque la página guarda datos de
// contacto de terceros (Ley 29733).
//
// ── Comisión (contrato de promoción, modelo C) ──────────────────────────────
// · Bono de alta: 50% del precio de lista MENSUAL sin IGV del plan del primer
//   pago, con sus locales adicionales. Una vez por cliente.
// · Residual: 10% sin IGV de cada pago cobrado dentro de los 12 meses desde el
//   primero — en mensual, del segundo en adelante; en anual, también el primero.
// · Se gana: mensual, con el 2.º pago cobrado; anual, 15 días después del pago.
// · Si el PRIMER pago se reembolsó, no hay comisión.
// · Atribución: visita registrada antes del primer pago y primer pago dentro de
//   los 60 días siguientes.

const { PRECIOS } = require('./precios');

const IGV = 1.18;
const DIAS_ATRIBUCION = 60;
const DIAS_ESPERA_ANUAL = 15;
const MESES_RESIDUAL = 12;
const TASA_ALTA = 0.5;
const TASA_RESIDUAL = 0.1;
const ESTADOS = ['visitado', 'interesado', 'volver', 'cuenta_gratis', 'cliente', 'no_interesado'];

// ── Versión de las reglas (auditoría 2026-10-02, P1-17) ─────────────────────
// El contrato dice que un cambio futuro de reglas no perjudica lo ya
// atribuido. Por eso cada visita guarda con qué versión nació
// (`VisitaComercial.politicaComision`) y el cálculo usa ESA, no la vigente.
// Al cambiar una tasa o un plazo: NO se editan las constantes de arriba; se
// añade una versión nueva a POLITICAS y se sube POLITICA_VIGENTE. Las visitas
// viejas siguen cobrando con la suya.
const POLITICAS = {
  1: { DIAS_ATRIBUCION, DIAS_ESPERA_ANUAL, MESES_RESIDUAL, TASA_ALTA, TASA_RESIDUAL },
};
const POLITICA_VIGENTE = 1;
const DIA = 864e5;

/** { email → alias } a partir de la variable. Correos en minúscula. */
function tablaAcceso(valor = process.env.RUTA_COMERCIAL_ACCESO) {
  const tabla = {};
  for (const par of String(valor || '').split(',')) {
    const i = par.lastIndexOf(':');
    if (i < 1) continue;
    const email = par.slice(0, i).trim().toLowerCase();
    const alias = par.slice(i + 1).trim();
    if (email && alias) tabla[email] = alias;
  }
  return tabla;
}

/** `{ alias, dueno }` si este correo puede abrir /ruta, o `null`. */
function accesoDe(email, valor) {
  const alias = tablaAcceso(valor)[String(email || '').trim().toLowerCase()];
  return alias ? { alias, dueno: alias.toLowerCase() === 'dueno' } : null;
}

const sumarMeses = (fecha, n) => { const d = new Date(fecha); d.setMonth(d.getMonth() + n); return d; };
const sinIgv = (centimos) => centimos / IGV;

/**
 * Comisión de UNA visita a partir de los pagos reales de la cuenta del cliente.
 * Todo en céntimos. `pagos` son las filas de `Pago` de esa cuenta (cualquier
 * orden); `localesExtra` es el de la cuenta hoy.
 */
function comisionDeVisita({ fechaVisita, pagos = [], localesExtra = 0, ahora = new Date(), politica = POLITICA_VIGENTE }) {
  const vacio = { alta: 0, residual: 0, ganada: 0, porGanar: 0, plan: null, periodo: null, pagosCobrados: 0, politica };
  // Una versión que este código no conoce NO se calcula con la vigente: eso es
  // exactamente aplicarle reglas nuevas a una atribución vieja.
  const reglas = POLITICAS[politica];
  if (!reglas) return { ...vacio, estado: 'POLITICA_DESCONOCIDA' };
  const { DIAS_ATRIBUCION, DIAS_ESPERA_ANUAL, MESES_RESIDUAL, TASA_ALTA, TASA_RESIDUAL } = reglas;
  const validos = pagos
    .filter((p) => (p.estado === 'EXITOSO' || p.estado === 'REEMBOLSADO') && p.tipo !== 'PRUEBA')
    .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
  if (!validos.length) return { ...vacio, estado: 'SIN_PAGOS' };

  const primero = validos[0];
  const tPrimero = new Date(primero.creadoEn).getTime();
  const tVisita = new Date(fechaVisita).getTime();
  const base = { ...vacio, plan: primero.plan, periodo: primero.periodo };
  // El registro tiene que ser ANTERIOR al primer pago: si ya pagaba antes de la
  // visita, era cliente de Notoria y no hay venta que atribuir.
  if (tVisita > tPrimero) return { ...base, estado: 'YA_ERA_CLIENTE' };
  if (tPrimero - tVisita > DIAS_ATRIBUCION * DIA) return { ...base, estado: 'FUERA_DE_PLAZO' };
  if (primero.estado === 'REEMBOLSADO') return { ...base, estado: 'ANULADA' };

  const precio = PRECIOS[primero.plan];
  if (!precio) return { ...base, estado: 'PLAN_DESCONOCIDO' };
  const extras = precio.local ? Math.max(0, Math.floor(+localesExtra || 0)) : 0;
  const listaMensual = precio.mensual + extras * (precio.local ? precio.local.mensual : 0);
  const alta = TASA_ALTA * sinIgv(listaMensual);

  const fin = sumarMeses(primero.creadoEn, MESES_RESIDUAL).getTime();
  const cobrados = validos.filter((p) => p.estado === 'EXITOSO' && new Date(p.creadoEn).getTime() < fin);
  const anual = primero.periodo === 'anual';
  const conResidual = anual ? cobrados : cobrados.filter((p) => p !== primero);
  const residual = conResidual.reduce((s, p) => s + TASA_RESIDUAL * sinIgv(p.monto), 0);

  const ganado = anual
    ? new Date(ahora).getTime() - tPrimero >= DIAS_ESPERA_ANUAL * DIA
    : cobrados.length >= 2;
  const r = (x) => Math.round(x);
  return {
    ...base,
    pagosCobrados: cobrados.length,
    alta: r(alta),
    residual: r(residual),
    ganada: ganado ? r(alta + residual) : 0,
    porGanar: ganado ? 0 : r(alta + residual),
    estado: ganado ? 'GANADA' : (anual ? 'ESPERA_15_DIAS' : 'ESPERA_2DO_PAGO'),
  };
}

const primerPago = (cuenta) => {
  const t = (cuenta.pagos || [])
    .filter((p) => (p.estado === 'EXITOSO' || p.estado === 'REEMBOLSADO') && p.tipo !== 'PRUEBA')
    .map((p) => new Date(p.creadoEn).getTime());
  return t.length ? Math.min(...t) : Infinity;
};

/**
 * Varias cuentas pueden tener agregado el mismo local de Google Maps. Cuenta la
 * que PAGÓ primero; si ninguna pagó, la que lo agregó primero. Conservador a
 * propósito: si el local ya era cliente antes de la visita, sale YA_ERA_CLIENTE
 * en vez de premiar una cuenta nueva abierta después.
 * `cuentas`: [{ ...cuenta, negocioCreadoEn }].
 */
function elegirCuenta(cuentas = []) {
  return [...cuentas].sort((a, b) => (primerPago(a) - primerPago(b))
    || (new Date(a.negocioCreadoEn || 0) - new Date(b.negocioCreadoEn || 0)))[0] || null;
}

/**
 * Lo que se muestra como «cómo terminó», corregido con lo que dice el sistema:
 * si la cuenta pagó, «cliente»; si existe y no pagó, al menos «cuenta_gratis».
 * Así nadie tiene que ir a cambiar el estado a mano cuando el cliente se decide.
 */
function estadoEfectivo(estado, { cuentaEncontrada, comision }) {
  if (comision && comision.estado !== 'SIN_PAGOS') return 'cliente';
  if (cuentaEncontrada && estado !== 'cliente') return 'cuenta_gratis';
  return estado;
}

module.exports = {
  ESTADOS, DIAS_ATRIBUCION, POLITICAS, POLITICA_VIGENTE, tablaAcceso, accesoDe, comisionDeVisita, elegirCuenta, estadoEfectivo,
};
