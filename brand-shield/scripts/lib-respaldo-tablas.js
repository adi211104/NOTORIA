// brand-shield/scripts/lib-respaldo-tablas.js
//
// Las tablas que respalda `respaldo.js` y el orden en que `restaurar.js` las
// reinserta: de PADRES a HIJOS (insertar un comprobante antes que su resumen
// SUNAT viola la clave foránea). Vive aparte para que las dos puntas y la
// prueba (`prueba-respaldo.js`, que lo contrasta con las relaciones del
// schema) lean la MISMA lista.
//
// 🔴 2026-10-07: el primer simulacro de restauración completo encontró dos
// fallos que ningún `--verificar` veía: `comprobante` iba ANTES que
// `resumenSunat` (la restauración se caía en la primera FK) y faltaban seis
// tablas (cobros, webhooks, la Ruta). Una tabla nueva tiene que entrar aquí;
// la prueba falla si falta alguna del schema que no esté en NO_SE_RESPALDAN.

const TABLAS = [
  'usuario',
  'negocio',
  'snapshot',
  'resena',
  'alerta',
  'competidor',
  'snapshotCompetidor',
  'comentarioSocial',
  'mencion',
  'pago',
  'serieComprobante',
  'resumenSunat',
  'comprobante',
  'reclamacion',
  'promoTarjeta',
  'miembro',
  'invitacion',
  'registroActividad',
  'visitaComercial',
  'cambioVisita',
  'movimientoComision',
  'intentoCobro',
  'eventoWebhook',
  'eventoSuscripcion',
];

// Lo que se deja fuera a propósito: estado efímero que se reconstruye solo.
const NO_SE_RESPALDAN = {
  candadoJob: 'candados de los cron: caducan solos y se recrean en la primera pasada',
};

module.exports = { TABLAS, NO_SE_RESPALDAN };
