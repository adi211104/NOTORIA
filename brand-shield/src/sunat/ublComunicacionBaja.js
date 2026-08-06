// brand-shield/src/sunat/ublComunicacionBaja.js
// Comunicación de Baja (RA) — VoidedDocuments, versión 1.0.
//
// Es el documento con el que se ANULA una FACTURA ya aceptada por SUNAT. Viaja
// por el mismo canal asíncrono que el resumen diario: `sendSummary` devuelve un
// TICKET y el veredicto se pide después con `getStatus` (ver billService.js).
//
// ⚠️ **Las boletas NO se dan de baja por aquí.** Como se informan por resumen
// diario, también se anulan por resumen diario, mandando otro con la línea en
// estado 3 (ver ublResumenBoletas.js). La comunicación de baja es solo para
// facturas y para las notas de crédito/débito vinculadas a facturas. Mandar una
// boleta en un RA es un rechazo seguro, así que `construir` lo corta acá y no
// gasta un envío.
//
// Plazo: hasta el sétimo día calendario siguiente a la fecha de emisión del
// comprobante que se anula. Pasado ese punto la factura ya no se puede dar de
// baja y hay que emitir una nota de crédito.
//
// Anular no es corregir: una factura dada de baja desaparece, no se rectifica.
// Si el cliente ya la tiene y el importe cambia, lo que corresponde es una nota
// de crédito, no un RA.

const { create } = require('xmlbuilder2');
const tributario = require('../lib/tributario');
const firma = require('./firmaXades');

const NS = {
  xmlns: 'urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1',
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
  'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
};

// Catálogo 01, limitado a lo que admite una comunicación de baja
const TIPO = { FACTURA: '01', NOTA_CREDITO: '07', NOTA_DEBITO: '08' };
const TIPOS_VALIDOS = new Set(Object.values(TIPO));
const TIPO_BOLETA = '03';

// El motivo es obligatorio y SUNAT lo corta en 100 caracteres
const MOTIVO_MAX = 100;

const soloFecha = (d) => tributario.fechaPeru(d);

// RA-20260806-1 — el correlativo distingue varias bajas del mismo día
const nombreDocumento = (fechaGeneracion, correlativo) =>
  `RA-${soloFecha(fechaGeneracion).replace(/-/g, '')}-${correlativo}`;

// SUNAT exige que el ZIP y el XML se llamen RUC-RA-YYYYMMDD-N
const nombreArchivo = (id) => `${tributario.EMISOR.ruc}-${id}`;

// "F001-00000123" → { serie: 'F001', numero: '123' }
// SUNAT quiere el correlativo como número, sin los ceros de relleno con los que
// se imprime el comprobante.
const partirNumero = (numero) => {
  const m = String(numero || '').match(/^([A-Z]\d{3})-(\d+)$/);
  if (!m) throw new Error(`Número de comprobante con formato inesperado: ${numero}`);
  return { serie: m[1], correlativo: String(Number(m[2])) };
};

const tipoDocumentoDe = (c) => {
  if (c.tipoDocumento) return c.tipoDocumento;
  if (c.tipo === 'FACTURA') return TIPO.FACTURA;
  if (c.tipo === 'BOLETA') return TIPO_BOLETA;
  throw new Error(`No se puede dar de baja un comprobante de tipo ${c.tipo}`);
};

// Construye el XML SIN firmar, con ext:ExtensionContent vacío para que
// firmaXades.js inserte ahí la firma. Mismo criterio que ublInvoice.js.
//
// `comprobantes` son filas de Comprobante ya emitidas y ACEPTADAS por SUNAT,
// TODAS emitidas el mismo día, cada una con su `motivo` de anulación.
const construir = ({ comprobantes, fechaGeneracion = new Date(), correlativo = 1 }) => {
  if (!comprobantes?.length) throw new Error('Una comunicación de baja no puede ir vacía');

  const fechasDistintas = new Set(comprobantes.map((c) => soloFecha(c.fechaEmision)));
  if (fechasDistintas.size > 1) {
    // Una baja se refiere a los comprobantes de UN día: ReferenceDate es uno
    // solo. Si se mezclan, SUNAT rechaza el documento entero, no las líneas que
    // sobran, y se pierden también las anulaciones que sí eran correctas.
    throw new Error(`Una comunicación de baja agrupa comprobantes de un solo día; llegaron de: ${[...fechasDistintas].join(', ')}`);
  }

  const fechaReferencia = [...fechasDistintas][0];
  const id = nombreDocumento(fechaGeneracion, correlativo);

  const lineas = comprobantes.map((c, i) => {
    const tipoDoc = tipoDocumentoDe(c);
    if (tipoDoc === TIPO_BOLETA) {
      throw new Error(
        `${c.numero} es una boleta: se anula por resumen diario en estado 3, no por comunicación de baja`,
      );
    }
    if (!TIPOS_VALIDOS.has(tipoDoc)) {
      throw new Error(`Tipo de comprobante no admitido en una comunicación de baja: ${tipoDoc}`);
    }

    const motivo = String(c.motivo || '').trim();
    if (!motivo) throw new Error(`Falta el motivo de anulación de ${c.numero}`);

    const { serie, correlativo: numero } = partirNumero(c.numero);

    return {
      'cbc:LineID': String(i + 1),
      'cbc:DocumentTypeCode': tipoDoc,
      'sac:DocumentSerialID': serie,
      'sac:DocumentNumberID': numero,
      'sac:VoidReasonDescription': { $: motivo.slice(0, MOTIVO_MAX) },
    };
  });

  const doc = {
    VoidedDocuments: {
      '@': NS,
      'ext:UBLExtensions': { 'ext:UBLExtension': { 'ext:ExtensionContent': {} } },
      'cbc:UBLVersionID': '2.0',
      // La baja va en 1.0, no en 1.1 como el resumen diario
      'cbc:CustomizationID': '1.0',
      'cbc:ID': id,
      // Fecha de emisión de los comprobantes que se anulan
      'cbc:ReferenceDate': fechaReferencia,
      // Fecha en que se genera la comunicación
      'cbc:IssueDate': soloFecha(fechaGeneracion),
      'cac:Signature': {
        'cbc:ID': firma.ID_FIRMA,
        'cac:SignatoryParty': {
          'cac:PartyIdentification': { 'cbc:ID': tributario.EMISOR.ruc },
          'cac:PartyName': { 'cbc:Name': { $: tributario.EMISOR.razonSocial } },
        },
        'cac:DigitalSignatureAttachment': {
          'cac:ExternalReference': { 'cbc:URI': `#${firma.ID_FIRMA}` },
        },
      },
      'cac:AccountingSupplierParty': {
        'cbc:CustomerAssignedAccountID': tributario.EMISOR.ruc,
        'cbc:AdditionalAccountID': tributario.DOC.RUC,
        'cac:Party': {
          'cac:PartyLegalEntity': { 'cbc:RegistrationName': { $: tributario.EMISOR.razonSocial } },
        },
      },
      'sac:VoidedDocumentsLine': lineas,
    },
  };

  return {
    xml: create({ version: '1.0', encoding: 'UTF-8' }, doc).end({ prettyPrint: false }),
    id,
    nombreArchivo: nombreArchivo(id),
    fechaReferencia,
    totalComprobantes: comprobantes.length,
  };
};

// Plazo legal: hasta el sétimo día calendario siguiente a la emisión.
const PLAZO_BAJA_DIAS = 7;

const fechaLimiteBaja = (fechaEmision) => {
  const limite = new Date(fechaEmision);
  limite.setDate(limite.getDate() + PLAZO_BAJA_DIAS);
  return limite;
};

const dentroDePlazo = (fechaEmision, ahora = new Date()) =>
  soloFecha(ahora) <= soloFecha(fechaLimiteBaja(fechaEmision));

module.exports = {
  construir, nombreDocumento, nombreArchivo, partirNumero,
  TIPO, TIPO_BOLETA, MOTIVO_MAX, PLAZO_BAJA_DIAS, fechaLimiteBaja, dentroDePlazo,
};
