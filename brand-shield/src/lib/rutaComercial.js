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
//   los 60 días siguientes; no era cliente de pago en los 6 meses anteriores; si
//   dos registros apuntan al mismo cliente, prevalece el más antiguo (7.1.d).

const { PRECIOS } = require('./precios');

const IGV = 1.18;
const DIAS_ATRIBUCION = 60;
const DIAS_ESPERA_ANUAL = 15;
const MESES_RESIDUAL = 12;
const TASA_ALTA = 0.5;
const TASA_RESIDUAL = 0.1;
const MESES_CLIENTE_PREVIO = 6;
const ESTADOS = ['visitado', 'interesado', 'volver', 'cuenta_gratis', 'cliente', 'no_interesado'];

// ── Versión de las reglas (auditoría 2026-10-02, P1-17) ─────────────────────
// El contrato dice que un cambio futuro de reglas no perjudica lo ya
// atribuido. Por eso cada visita guarda con qué versión nació
// (`VisitaComercial.politicaComision`) y el cálculo usa ESA, no la vigente.
// Al cambiar una tasa o un plazo: NO se editan las constantes de arriba; se
// añade una versión nueva a POLITICAS y se sube POLITICA_VIGENTE. Las visitas
// viejas siguen cobrando con la suya.
const POLITICAS = {
  1: { DIAS_ATRIBUCION, DIAS_ESPERA_ANUAL, MESES_RESIDUAL, TASA_ALTA, TASA_RESIDUAL, MESES_CLIENTE_PREVIO },
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
 *
 * Además de los totales devuelve `detalle`: lo DEVENGADO concepto por concepto
 * (el bono de alta y el residual de cada pago, con la fecha en que se devengó).
 * Es lo que el libro de comisiones (lib/libroComisiones.js) asienta.
 */
function comisionDeVisita({ fechaVisita, pagos = [], localesExtra = 0, ahora = new Date(), politica = POLITICA_VIGENTE }) {
  const vacio = { alta: 0, residual: 0, ganada: 0, porGanar: 0, plan: null, periodo: null, pagosCobrados: 0, politica, detalle: [] };
  // Una versión que este código no conoce NO se calcula con la vigente: eso es
  // exactamente aplicarle reglas nuevas a una atribución vieja.
  const reglas = POLITICAS[politica];
  if (!reglas) return { ...vacio, estado: 'POLITICA_DESCONOCIDA' };
  const { DIAS_ATRIBUCION, DIAS_ESPERA_ANUAL, MESES_RESIDUAL, TASA_ALTA, TASA_RESIDUAL, MESES_CLIENTE_PREVIO } = reglas;
  const validos = pagos
    .filter((p) => (p.estado === 'EXITOSO' || p.estado === 'REEMBOLSADO') && p.tipo !== 'PRUEBA')
    .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
  if (!validos.length) return { ...vacio, estado: 'SIN_PAGOS' };

  const tVisita = new Date(fechaVisita).getTime();
  // Contrato 7.1.d: no se atribuye a quien «era cliente de pago de Notoria en
  // los seis meses anteriores». Un pago anterior a la visita lo hace cliente
  // mientras dura lo que pagó (1 o 12 meses) y seis meses más. Un pago
  // reembolsado entero no lo hacía cliente. (2026-10-07: antes CUALQUIER pago
  // anterior, aunque fuera de hace años, bloqueaba la atribución para siempre,
  // y el contrato dice otra cosa.)
  const anteriores = validos.filter((p) => new Date(p.creadoEn).getTime() < tVisita);
  const eraCliente = anteriores.some((p) => p.estado === 'EXITOSO'
    && sumarMeses(sumarMeses(p.creadoEn, p.periodo === 'anual' ? 12 : 1), MESES_CLIENTE_PREVIO).getTime() > tVisita);
  if (eraCliente) {
    const ultimo = anteriores[anteriores.length - 1];
    return { ...vacio, plan: ultimo.plan, periodo: ultimo.periodo, estado: 'YA_ERA_CLIENTE' };
  }
  const posteriores = validos.filter((p) => new Date(p.creadoEn).getTime() >= tVisita);
  if (!posteriores.length) return { ...vacio, estado: 'SIN_PAGOS' };

  const primero = posteriores[0];
  const tPrimero = new Date(primero.creadoEn).getTime();
  const base = { ...vacio, plan: primero.plan, periodo: primero.periodo };
  if (tPrimero - tVisita > DIAS_ATRIBUCION * DIA) return { ...base, estado: 'FUERA_DE_PLAZO' };
  if (primero.estado === 'REEMBOLSADO') return { ...base, estado: 'ANULADA' };

  const precio = PRECIOS[primero.plan];
  if (!precio) return { ...base, estado: 'PLAN_DESCONOCIDO' };
  const extras = precio.local ? Math.max(0, Math.floor(+localesExtra || 0)) : 0;
  const listaMensual = precio.mensual + extras * (precio.local ? precio.local.mensual : 0);
  const r = (x) => Math.round(x);
  const alta = r(TASA_ALTA * sinIgv(listaMensual));

  const fin = sumarMeses(primero.creadoEn, MESES_RESIDUAL).getTime();
  const enPlazo = posteriores.filter((p) => new Date(p.creadoEn).getTime() < fin);
  const cobrados = enPlazo.filter((p) => p.estado === 'EXITOSO');
  const anual = primero.periodo === 'anual';
  const conResidual = anual ? cobrados : cobrados.filter((p) => p !== primero);
  // Sobre lo EFECTIVAMENTE cobrado (contrato 6.3 y 7.4): un reembolso parcial de
  // un pago posterior reduce su residual en la misma proporción (2026-10-05).
  // Cada pago se redondea por separado: es un asiento propio en el libro, y el
  // total tiene que ser la suma exacta de los asientos.
  const cobrado = (p) => Math.max(0, p.monto - (p.montoReembolsado || 0));
  const residuales = conResidual.map((p) => ({ pago: p, monto: r(TASA_RESIDUAL * sinIgv(cobrado(p))) }));
  const residual = residuales.reduce((s, x) => s + x.monto, 0);

  // Devengo (contrato 7.3). Mensual: el bono nace con el 2.º pago REALIZADO —
  // si después se reembolsa ese 2.º pago se anula SU residual, no el bono
  // (7.4) —, y cada residual nace cuando se cobra su pago. Anual: todo a los
  // 15 días del pago anual, si no se reembolsó.
  const tEspera = tPrimero + DIAS_ESPERA_ANUAL * DIA;
  const segundo = enPlazo[1];
  const ganado = anual ? new Date(ahora).getTime() >= tEspera : !!segundo;
  const fechaDevengo = (p) => new Date(anual ? Math.max(tEspera, new Date(p.creadoEn).getTime()) : new Date(p.creadoEn).getTime());
  const detalle = !ganado ? [] : [
    { concepto: 'ALTA', pagoId: primero.id || null, monto: alta, fechaDevengo: anual ? new Date(tEspera) : new Date(segundo.creadoEn) },
    ...residuales.map(({ pago: p, monto }) => ({ concepto: 'RESIDUAL', pagoId: p.id || null, monto, fechaDevengo: fechaDevengo(p) })),
  ];
  return {
    ...base,
    pagosCobrados: cobrados.length,
    alta,
    residual,
    ganada: ganado ? alta + residual : 0,
    porGanar: ganado ? 0 : alta + residual,
    estado: ganado ? 'GANADA' : (anual ? 'ESPERA_15_DIAS' : 'ESPERA_2DO_PAGO'),
    detalle,
  };
}

/**
 * Contrato 7.1.d: un cliente se atribuye UNA vez. Si dos registros (del mismo
 * promotor o de dos distintos) apuntan a la misma cuenta, «prevalece el
 * registro más antiguo»: no se atribuye una visita si otra visita NO anulada a
 * esa misma cuenta es anterior y está dentro de los 60 días previos. Y aunque
 * dos visitas lejanas salieran las dos atribuibles, solo cuenta la más antigua.
 *
 * `entradas`: [{ id, fechaVisita, anuladaEn, cuentaId, comision }]. Devuelve
 * { [visitaId]: idDeLaVisitaQuePrevalece } solo para las visitas que PIERDEN.
 */
function resolverAtribucion(entradas = []) {
  const perdedoras = {};
  const porCuenta = {};
  for (const e of entradas) if (e.cuentaId && !e.anuladaEn) (porCuenta[e.cuentaId] ||= []).push(e);
  const atribuible = (e) => e.comision && ['GANADA', 'ESPERA_2DO_PAGO', 'ESPERA_15_DIAS'].includes(e.comision.estado);
  for (const lista of Object.values(porCuenta)) {
    lista.sort((a, b) => (new Date(a.fechaVisita) - new Date(b.fechaVisita)) || String(a.id).localeCompare(String(b.id)));
    let ganadora = null;
    lista.forEach((e, i) => {
      const dias = (POLITICAS[e.comision?.politica] || POLITICAS[POLITICA_VIGENTE]).DIAS_ATRIBUCION;
      const previa = lista.slice(0, i).find((o) => new Date(e.fechaVisita) - new Date(o.fechaVisita) <= dias * DIA);
      if (previa) { perdedoras[e.id] = previa.id; return; }
      if (!atribuible(e)) return;
      if (ganadora) { perdedoras[e.id] = ganadora.id; return; }
      ganadora = e;
    });
  }
  return perdedoras;
}

/**
 * Lo que el libro tiene que tener devengado para una visita, asiento por
 * asiento (promotor + concepto + pago). Una visita anulada o que perdió la
 * atribución no tiene nada devengado: si el libro ya tenía algo, la
 * sincronización asienta la reversión (nunca borra lo asentado).
 */
function objetivosDeVisita(visita, comision, { perdedora = false } = {}) {
  if (visita.anuladaEn || perdedora || !comision?.detalle?.length) return [];
  return comision.detalle.map((d) => ({ ...d, promotor: visita.promotor, visitaId: visita.id, politica: comision.politica }));
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
  ESTADOS, DIAS_ATRIBUCION, POLITICAS, POLITICA_VIGENTE, tablaAcceso, accesoDe, comisionDeVisita, elegirCuenta, estadoEfectivo, resolverAtribucion, objetivosDeVisita, DIA,
};
