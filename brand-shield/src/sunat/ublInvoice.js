// brand-shield/src/sunat/ublInvoice.js
// Construye el XML UBL 2.1 de una factura o boleta electrónica según el
// Anexo N.° 1 de SUNAT (SEE - Del Contribuyente).
//
// El documento se genera con el bloque ext:ExtensionContent VACÍO: ahí es donde
// firmaXades.js inserta después la firma. Ese orden importa — la firma cubre el
// documento entero, así que no puede existir antes de que el documento esté
// completo.
//
// Importes: el resto del backend trabaja en céntimos (enteros) para no arrastrar
// errores de coma flotante; aquí se convierten a decimales con 2 posiciones, que
// es lo que espera SUNAT.

const { create } = require('xmlbuilder2');
const tributario = require('../lib/tributario');

const NS = {
  xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
};

// Catálogo 01 — tipo de comprobante
const TIPO_DOC = { FACTURA: '01', BOLETA: '03' };

// Catálogo 07 — afectación al IGV, y el esquema de impuesto que le corresponde
const AFECTACION = {
  GRAVADO: { codigo: '10', esquemaId: '1000', esquemaNombre: 'IGV', tipoCodigo: 'VAT' },
  EXPORTACION: { codigo: '40', esquemaId: '9995', esquemaNombre: 'EXP', tipoCodigo: 'FRE' },
};

const URN = (catalogo) => `urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo${catalogo}`;

// Céntimos → string decimal. 1695 → "16.95"
const dec = (centimos) => (centimos / 100).toFixed(2);

const soloFecha = (d) => new Date(d).toISOString().slice(0, 10);
const soloHora = (d) => new Date(d).toISOString().slice(11, 19);

// Bloque de identificación de una parte (emisor o receptor).
// `direccion` es opcional: SUNAT no la exige para el receptor. Para el emisor
// se pasa además `ubigeo`/`distrito`/`provincia`/`departamento`, que SUNAT
// contrasta contra el domicilio fiscal de la ficha RUC.
const parte = ({ tipoDoc, numDoc, razonSocial, nombreComercial, direccion, pais, ubigeo, distrito, provincia, departamento }) => {
  const party = {
    'cac:PartyIdentification': {
      'cbc:ID': {
        '@schemeID': tipoDoc,
        '@schemeName': 'Documento de Identidad',
        '@schemeAgencyName': 'PE:SUNAT',
        '@schemeURI': URN('06'),
        '#': numDoc,
      },
    },
  };

  if (nombreComercial) {
    party['cac:PartyName'] = { 'cbc:Name': { $: nombreComercial } };
  }

  const legal = { 'cbc:RegistrationName': { $: razonSocial } };
  if (direccion) {
    const domicilio = {};
    // El orden de los elementos lo fija el esquema UBL; no es arbitrario
    if (ubigeo) domicilio['cbc:ID'] = { '@schemeName': 'Ubigeos', '@schemeAgencyName': 'PE:INEI', '#': ubigeo };
    domicilio['cbc:AddressTypeCode'] = '0000'; // 0000 = domicilio fiscal (casa matriz)
    if (provincia) domicilio['cbc:CityName'] = { $: provincia };
    if (departamento) domicilio['cbc:CountrySubentity'] = { $: departamento };
    if (distrito) domicilio['cbc:District'] = { $: distrito };
    domicilio['cac:AddressLine'] = { 'cbc:Line': { $: direccion } };
    domicilio['cac:Country'] = { 'cbc:IdentificationCode': pais || 'PE' };
    legal['cac:RegistrationAddress'] = domicilio;
  }
  party['cac:PartyLegalEntity'] = legal;

  return { 'cac:Party': party };
};

// Construye el XML sin firmar. Devuelve { xml, nombreArchivo }.
const construir = (comprobante) => {
  const tipoDoc = TIPO_DOC[comprobante.tipo];
  if (!tipoDoc) throw new Error(`Tipo de comprobante no emitible ante SUNAT: ${comprobante.tipo}`);

  const esExportacion = comprobante.exportacion > 0;
  const afectacion = esExportacion ? AFECTACION.EXPORTACION : AFECTACION.GRAVADO;
  const moneda = comprobante.moneda;

  // Valor de venta (sin IGV) — en exportación coincide con el total
  const valorVenta = esExportacion ? comprobante.exportacion : comprobante.gravadas;
  const igv = comprobante.igv;
  const total = comprobante.total;
  const monto = (v) => ({ '@currencyID': moneda, '#': dec(v) });

  // El bloque de impuestos es idéntico a nivel de documento y de línea, así que
  // se construye una sola vez. Ojo con schemeAgencyName del tributo: debe ser
  // "PE:SUNAT" (catálogo 05); con el valor de UN/ECE, SUNAT acepta el
  // comprobante pero lo devuelve con la observación 4256.
  const bloqueImpuesto = () => ({
    'cbc:TaxAmount': monto(igv),
    'cac:TaxSubtotal': {
      'cbc:TaxableAmount': monto(valorVenta),
      'cbc:TaxAmount': monto(igv),
      'cac:TaxCategory': {
        'cbc:ID': { '@schemeID': 'UN/ECE 5305', '@schemeName': 'Tax Category Identifier', '@schemeAgencyName': 'United Nations Economic Commission for Europe', '#': 'S' },
        'cbc:Percent': esExportacion ? '0.00' : (tributario.IGV_TASA * 100).toFixed(2),
        'cbc:TaxExemptionReasonCode': {
          '@listAgencyName': 'PE:SUNAT',
          '@listName': 'Afectacion del IGV',
          '@listURI': URN('07'),
          '#': afectacion.codigo,
        },
        'cac:TaxScheme': {
          'cbc:ID': {
            '@schemeID': 'UN/ECE 5153',
            '@schemeName': 'Codigo de tributos',
            '@schemeAgencyName': 'PE:SUNAT',
            '@schemeURI': URN('05'),
            '#': afectacion.esquemaId,
          },
          'cbc:Name': afectacion.esquemaNombre,
          'cbc:TaxTypeCode': afectacion.tipoCodigo,
        },
      },
    },
  });

  const doc = {
    Invoice: {
      '@': NS,

      // La firma se inserta aquí (ver firmaXades.js). Debe existir vacío desde
      // el inicio: SUNAT rechaza el documento si falta la estructura.
      'ext:UBLExtensions': {
        'ext:UBLExtension': { 'ext:ExtensionContent': {} },
      },

      'cbc:UBLVersionID': '2.1',
      'cbc:CustomizationID': '2.0',
      'cbc:ID': comprobante.numero,
      'cbc:IssueDate': soloFecha(comprobante.fechaEmision),
      'cbc:IssueTime': soloHora(comprobante.fechaEmision),
      'cbc:InvoiceTypeCode': {
        '@listID': comprobante.tipoOperacion, // catálogo 51
        '@listAgencyName': 'PE:SUNAT',
        '@listName': 'Tipo de Documento',
        '@listURI': URN('01'),
        '#': tipoDoc,
      },
      // Monto en letras — obligatorio, languageLocaleID 1000
      'cbc:Note': {
        '@languageLocaleID': '1000',
        $: tributario.totalEnLetras(total, moneda),
      },
      'cbc:DocumentCurrencyCode': {
        '@listID': 'ISO 4217 Alpha',
        '@listName': 'Currency',
        '@listAgencyName': 'United Nations Economic Commission for Europe',
        '#': moneda,
      },

      'cac:Signature': {
        'cbc:ID': 'SignatureSP',
        'cac:SignatoryParty': {
          'cac:PartyIdentification': { 'cbc:ID': tributario.EMISOR.ruc },
          'cac:PartyName': { 'cbc:Name': { $: tributario.EMISOR.razonSocial } },
        },
        'cac:DigitalSignatureAttachment': {
          'cac:ExternalReference': { 'cbc:URI': '#SignatureSP' },
        },
      },

      'cac:AccountingSupplierParty': parte({
        tipoDoc: tributario.DOC.RUC,
        numDoc: tributario.EMISOR.ruc,
        razonSocial: tributario.EMISOR.razonSocial,
        nombreComercial: tributario.EMISOR.nombreComercial,
        direccion: tributario.EMISOR.direccion,
        ubigeo: tributario.EMISOR.ubigeo,
        distrito: tributario.EMISOR.distrito,
        provincia: tributario.EMISOR.provincia,
        departamento: tributario.EMISOR.departamento,
        pais: tributario.EMISOR.pais,
      }),

      'cac:AccountingCustomerParty': parte({
        tipoDoc: comprobante.receptorTipoDoc,
        // Un receptor no domiciliado puede no tener documento; SUNAT admite "0"
        numDoc: comprobante.receptorNumDoc || '0',
        razonSocial: comprobante.receptorNombre,
        direccion: comprobante.receptorDireccion,
        pais: comprobante.receptorPais,
      }),

      // Forma de pago — obligatoria en facturas desde la RS 193-2020. Sin este
      // bloque SUNAT responde 3244. La suscripción se cobra por adelantado con
      // tarjeta, así que siempre es al contado.
      'cac:PaymentTerms': {
        'cbc:ID': 'FormaPago',
        'cbc:PaymentMeansID': 'Contado',
      },

      'cac:TaxTotal': bloqueImpuesto(),

      'cac:LegalMonetaryTotal': {
        'cbc:LineExtensionAmount': monto(valorVenta),
        'cbc:TaxInclusiveAmount': monto(total),
        'cbc:PayableAmount': monto(total),
      },

      'cac:InvoiceLine': {
        'cbc:ID': '1',
        // "ZZ" = servicios, según el catálogo 65 (UN/ECE rec. 20)
        'cbc:InvoicedQuantity': { '@unitCode': 'ZZ', '@unitCodeListID': 'UN/ECE rec 20', '@unitCodeListAgencyName': 'United Nations Economic Commission for Europe', '#': '1' },
        'cbc:LineExtensionAmount': monto(valorVenta),
        'cac:PricingReference': {
          'cac:AlternativeConditionPrice': {
            'cbc:PriceAmount': monto(total), // precio unitario incluyendo impuestos
            'cbc:PriceTypeCode': { '@listName': 'Tipo de Precio', '@listAgencyName': 'PE:SUNAT', '@listURI': URN('16'), '#': '01' },
          },
        },
        'cac:TaxTotal': bloqueImpuesto(),
        'cac:Item': {
          'cbc:Description': { $: comprobante.descripcion },
          'cac:SellersItemIdentification': { 'cbc:ID': 'NOTORIA-SUB' },
        },
        'cac:Price': {
          'cbc:PriceAmount': monto(valorVenta), // valor unitario sin impuestos
        },
      },
    },
  };

  const xml = create({ encoding: 'UTF-8' }, doc).end({ prettyPrint: false });

  return { xml, nombreArchivo: nombreArchivo(comprobante) };
};

// Convención de SUNAT: RUC-TIPO-SERIE-CORRELATIVO
const nombreArchivo = (comprobante) =>
  `${tributario.EMISOR.ruc}-${TIPO_DOC[comprobante.tipo]}-${comprobante.serie}-${String(comprobante.correlativo).padStart(8, '0')}`;

module.exports = { construir, nombreArchivo, TIPO_DOC, AFECTACION };
