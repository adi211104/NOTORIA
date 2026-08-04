// brand-shield/src/sunat/firmaXades.js
// Firma digital del comprobante con el Certificado Digital Tributario.
//
// Genera una firma XML-DSig *enveloped* insertada dentro de
// ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent, que es lo que valida
// SUNAT. Los tres detalles donde se atasca toda implementación:
//
//   1. La referencia debe ser URI="" (el documento completo), no un fragmento.
//   2. Las transformaciones van en este orden: enveloped-signature y luego C14N.
//      Sin la primera, la firma se incluiría a sí misma en el resumen.
//   3. La firma va DENTRO de ExtensionContent. Colgarla de la raíz produce un
//      documento que valida contra el esquema pero que SUNAT rechaza.
//
// SUNAT usa SHA-1/RSA-SHA1 en su especificación; se deja configurable por si en
// algún momento exige SHA-256.

const { SignedXml } = require('xml-crypto');
const certificado = require('./certificado');

const ALGO = {
  sha1: {
    digest: 'http://www.w3.org/2000/09/xmldsig#sha1',
    firma: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  },
  sha256: {
    digest: 'http://www.w3.org/2001/04/xmlenc#sha256',
    firma: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  },
};

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

// Debe coincidir con el cbc:ID de cac:Signature en el documento (ver ublInvoice.js),
// que lo referencia como "#SignatureSP".
const ID_FIRMA = 'SignatureSP';

// Firma el XML y devuelve { xml, digest }.
// `digest` es el DigestValue, que va impreso en la representación impresa y
// dentro del código QR del comprobante.
const firmar = (xml, { algoritmo = 'sha1' } = {}) => {
  const { privateKeyPem, certificateBase64 } = certificado.cargar();
  const alg = ALGO[algoritmo];
  if (!alg) throw new Error(`Algoritmo de firma no soportado: ${algoritmo}`);

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    signatureAlgorithm: alg.firma,
    canonicalizationAlgorithm: C14N,
    // El prefijo es obligatorio: sin él, X509Data y X509Certificate heredan el
    // namespace por defecto del Invoice en vez del de XML-DSig, y SUNAT responde
    // 2335 "Unsupported or unrecognized Signature signer format".
    getKeyInfoContent: ({ prefix } = {}) => {
      const p = prefix ? `${prefix}:` : '';
      return `<${p}X509Data><${p}X509Certificate>${certificateBase64}</${p}X509Certificate></${p}X509Data>`;
    },
  });

  sig.addReference({
    xpath: '/*',
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: alg.digest,
    uri: '',
    isEmptyUri: true,
  });

  sig.computeSignature(xml, {
    prefix: 'ds',
    attrs: { Id: ID_FIRMA },
    location: {
      reference: "//*[local-name(.)='ExtensionContent']",
      action: 'append',
    },
  });

  const firmado = sig.getSignedXml();
  return { xml: firmado, digest: extraerDigest(firmado) };
};

// El DigestValue va en el QR de la representación impresa. Se lee del XML ya
// firmado en vez de recalcularlo, para que siempre sea exactamente el que viaja
// dentro del documento.
const extraerDigest = (xmlFirmado) => {
  const m = xmlFirmado.match(/<(?:ds:)?DigestValue>([^<]*)<\/(?:ds:)?DigestValue>/);
  return m ? m[1] : null;
};

// Verifica una firma contra el certificado con el que se generó. Se usa en las
// pruebas: si esto falla, SUNAT también va a rechazar el documento.
const verificar = (xmlFirmado) => {
  const { certificatePem } = certificado.cargar();
  const firma = xmlFirmado.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/)?.[0]
    || xmlFirmado.match(/<Signature[\s\S]*?<\/Signature>/)?.[0];
  if (!firma) return { valida: false, error: 'No se encontró el elemento Signature' };

  const sig = new SignedXml({ publicCert: certificatePem });
  sig.loadSignature(firma);
  try {
    return { valida: sig.checkSignature(xmlFirmado), error: null };
  } catch (e) {
    return { valida: false, error: e.message };
  }
};

module.exports = { firmar, verificar, extraerDigest, ID_FIRMA };
