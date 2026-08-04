// Precios de los planes y moneda de cobro — fuente única de verdad.
//
// Los usan tanto el alta de suscripción (api/routes/pago.routes.js) como el cron
// de renovación (workers/monitoreo.worker.js). Antes estaban duplicados en los
// dos archivos y la copia del cron ya se desincronizó una vez, cobrando el
// precio mensual a suscriptores anuales. No volver a copiarlos: importar de acá.
//
// Los montos van en la unidad más pequeña de la moneda (céntimos), que es lo que
// espera Culqi: 7500 = S/75.00.
//
// Moneda: soles. El precio publicado INCLUYE IGV para clientes peruanos
// (ver lib/tributario.js, que hace el desglose al emitir el comprobante).
// Todo el circuito de comprobantes (PDF, XML UBL, correos) ya lee la moneda del
// registro, así que agregar USD en el futuro no obliga a tocar nada de eso.
const MONEDA = 'PEN';

const PRECIOS = {
  NEGOCIO:    { mensual: 5900,  anual: 56400 },   // S/59/mes  ·  S/47 x 12 anual
  FRANQUICIA: { mensual: 17900, anual: 171600 },  // S/179/mes ·  S/143 x 12 anual
};

module.exports = { MONEDA, PRECIOS };
