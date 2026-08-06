// brand-shield/src/sunat/ublResumenBoletas.js
// Resumen Diario de Boletas (RC) — SummaryDocuments, versión 1.1.
//
// Las boletas NO se informan una a una: se agrupan en un resumen diario que se
// manda con `sendSummary`. Ese envío devuelve un TICKET y el resultado se
// consulta después con `getStatus` (ver billService.js). Es un flujo distinto
// del de la factura, que responde el CDR en el acto.
//
// En la versión 1.1 cada línea es UNA boleta con su propio estado, importes y
// receptor — no un rango de correlativos, como en la 1.0.
//
// Estados de línea (cac:Status/cbc:ConditionCode):
//   1 = adicionar (la boleta se informa por primera vez)
//   2 = modificar
//   3 = anular
// ⚠️ Una boleta se ANULA por aquí, con estado 3 en otro resumen — NO por
// comunicación de baja. El RA es solo para facturas y para las notas ligadas a
// facturas (ver ublComunicacionBaja.js). Como la boleta se informa por resumen,
// se corrige por resumen.
//
// ⚠️ El estado va en el namespace `cac:`, NO en `sac:`. Es el único elemento de
// la línea que no sigue el prefijo de los demás campos propios de SUNAT, y
// equivocarlo cuesta caro: `sac:Status` no existe en el esquema, así que el
// validador lo rechaza en cualquier posición y es fácil concluir que el estado
// no pertenece al documento. No pertenece con ESE prefijo. Sin el bloque, el
// esquema pasa igual (es opcional para el XSD) pero SUNAT rechaza el resumen
// entero con un error que no lleva a ningún sitio: 2522 "No existe información
// del documento del anticipo", en el nodo "/" y con valor vacío.
//
// Plazo: hasta 7 días calendario desde el día siguiente a la emisión. Pasado
// ese punto la boleta ya no se puede informar en un resumen.

const { create } = require('xmlbuilder2');
const tributario = require('../lib/tributario');
const firma = require('./firmaXades');

const NS = {
  xmlns: 'urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1',
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
  'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
};

const TIPO_BOLETA = '03';

// Catálogo 51 del resumen (sac:BillingPayment/InstructionID): concepto del
// importe. 01 = gravado, 02 = exonerado, 03 = inafecto, 05 = exportación.
const CONCEPTO = { GRAVADO: '01', EXPORTACION: '05' };

// cac:Status/cbc:ConditionCode — qué se hace con la boleta en este resumen.
const ESTADO = { ADICIONAR: '1', MODIFICAR: '2', ANULAR: '3' };

const dec = (centimos) => (centimos / 100).toFixed(2);
// Zona horaria de Perú, no UTC — ver tributario.fechaPeru (error 2236)
const soloFecha = (d) => tributario.fechaPeru(d);

// RC-20260805-1 — el correlativo distingue varios resúmenes del mismo día
const nombreDocumento = (fechaGeneracion, correlativo) =>
  `RC-${soloFecha(fechaGeneracion).replace(/-/g, '')}-${correlativo}`;

// SUNAT exige que el ZIP y el XML se llamen RUC-RC-YYYYMMDD-N
const nombreArchivo = (id) => `${tributario.EMISOR.ruc}-${id}`;

// Construye el XML SIN firmar, con ext:ExtensionContent vacío para que
// firmaXades.js inserte ahí la firma. Mismo criterio que ublInvoice.js: la
// firma cubre el documento entero, así que el documento va primero.
//
// `boletas` son filas de Comprobante ya emitidas, TODAS de la misma fecha. Cada
// una puede traer `estado` (ver ESTADO); sin él se informa como adicionada.
const construir = ({ boletas, fechaGeneracion = new Date(), correlativo = 1 }) => {
  if (!boletas?.length) throw new Error('Un resumen diario no puede ir vacío');

  const fechasDistintas = new Set(boletas.map(b => soloFecha(b.fechaEmision)));
  if (fechasDistintas.size > 1) {
    // Un resumen informa las boletas de UN día. Mezclarlas haría que
    // ReferenceDate no correspondiera con parte de las líneas y SUNAT lo
    // rechazaría entero, no solo las que sobran.
    throw new Error(`Un resumen agrupa boletas de un solo día; llegaron de: ${[...fechasDistintas].join(', ')}`);
  }

  const fechaReferencia = [...fechasDistintas][0];
  const id = nombreDocumento(fechaGeneracion, correlativo);

  const lineas = boletas.map((b, i) => {
    const esExportacion = b.exportacion > 0;
    const valorVenta = esExportacion ? b.exportacion : b.gravadas;
    const moneda = b.moneda;
    const monto = (v) => ({ '@currencyID': moneda, '#': dec(v) });

    const linea = {
      'cbc:LineID': String(i + 1),
      'cbc:DocumentTypeCode': TIPO_BOLETA,
      'cbc:ID': b.numero,
    };

    // El receptor solo va si la boleta lo identifica. Por debajo de S/700 puede
    // no llevar documento, y mandar un bloque vacío hace que SUNAT lo rechace.
    if (b.receptorNumDoc) {
      linea['cac:AccountingCustomerParty'] = {
        'cbc:CustomerAssignedAccountID': b.receptorNumDoc,
        'cbc:AdditionalAccountID': b.receptorTipoDoc,
      };
    }

    // El ORDEN de estos elementos lo fija el esquema y no es negociable: SUNAT
    // valida la secuencia y rechaza el resumen entero con el error 0306 si algo
    // va fuera de sitio. Comprobado contra el beta: el estado va ANTES de
    // TotalAmount. No reordenar "por legibilidad".
    linea['cac:Status'] = { 'cbc:ConditionCode': b.estado || ESTADO.ADICIONAR };
    linea['sac:TotalAmount'] = monto(b.total);
    linea['sac:BillingPayment'] = {
      'cbc:PaidAmount': monto(valorVenta),
      'cbc:InstructionID': esExportacion ? CONCEPTO.EXPORTACION : CONCEPTO.GRAVADO,
    };
    linea['cac:TaxTotal'] = {
      'cbc:TaxAmount': monto(b.igv),
      'cac:TaxSubtotal': {
        'cbc:TaxAmount': monto(b.igv),
        'cac:TaxCategory': {
          'cac:TaxScheme': {
            'cbc:ID': '1000',
            'cbc:Name': 'IGV',
            'cbc:TaxTypeCode': 'VAT',
          },
        },
      },
    };
    return linea;
  });

  const doc = {
    SummaryDocuments: {
      '@': NS,
      'ext:UBLExtensions': { 'ext:UBLExtension': { 'ext:ExtensionContent': {} } },
      'cbc:UBLVersionID': '2.0',
      'cbc:CustomizationID': '1.1',
      'cbc:ID': id,
      // Fecha de emisión de las boletas que se informan
      'cbc:ReferenceDate': fechaReferencia,
      // Fecha en que se genera el resumen
      'cbc:IssueDate': soloFecha(fechaGeneracion),
      // El identificador debe ser el MISMO con el que firmaXades crea el
      // elemento (Id="SignatureSP"); si no, la referencia apunta a una firma
      // que no existe. Igual que en ublInvoice.js, que SUNAT ya acepta.
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
      'sac:SummaryDocumentsLine': lineas,
    },
  };

  return {
    xml: create({ version: '1.0', encoding: 'UTF-8' }, doc).end({ prettyPrint: false }),
    id,
    nombreArchivo: nombreArchivo(id),
    fechaReferencia,
    totalBoletas: boletas.length,
  };
};

module.exports = { construir, nombreDocumento, nombreArchivo, TIPO_BOLETA, CONCEPTO, ESTADO };
