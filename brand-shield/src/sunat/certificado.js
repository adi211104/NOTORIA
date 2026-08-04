// brand-shield/src/sunat/certificado.js
// Carga el Certificado Digital Tributario (.p12) y expone la llave privada y el
// certificado en PEM, que es lo que necesita xml-crypto para firmar.
//
// El .p12 NUNCA se guarda en disco ni en el repositorio: llega como base64 en
// SUNAT_CERT_P12_BASE64 y se decodifica en memoria. En desarrollo se puede
// apuntar a un archivo con SUNAT_CERT_P12_PATH usando un certificado
// autofirmado — el entorno beta de SUNAT los acepta.

const fs = require('fs');
const forge = require('node-forge');

let cache = null;

const leerP12 = () => {
  const base64 = process.env.SUNAT_CERT_P12_BASE64;
  if (base64) return Buffer.from(base64, 'base64');

  const ruta = process.env.SUNAT_CERT_P12_PATH;
  if (ruta) return fs.readFileSync(ruta);

  throw new Error('Falta el certificado: define SUNAT_CERT_P12_BASE64 (producción) o SUNAT_CERT_P12_PATH (desarrollo)');
};

// Devuelve { privateKeyPem, certificatePem, certificateBase64, serialNumber, issuerName }.
// El resultado se cachea: descifrar el PKCS#12 es costoso y el certificado no
// cambia durante la vida del proceso.
const cargar = () => {
  if (cache) return cache;

  const password = process.env.SUNAT_CERT_PASSWORD;
  if (password === undefined) throw new Error('Falta SUNAT_CERT_PASSWORD');

  const der = forge.util.createBuffer(leerP12().toString('binary'));
  const asn1 = forge.asn1.fromDer(der);

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (e) {
    // El error de node-forge ante una clave incorrecta es poco claro
    throw new Error(`No se pudo abrir el .p12 — ¿la contraseña es correcta? (${e.message})`);
  }

  const bolsaLlave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
    || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const bolsaCert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];

  if (!bolsaLlave?.length || !bolsaCert?.length) {
    throw new Error('El .p12 no contiene llave privada y certificado');
  }

  // Si el .p12 trae la cadena completa, el certificado del titular es el que
  // corresponde a la llave privada; se identifica por su clave pública.
  const llave = bolsaLlave[0].key;
  const cert = bolsaCert.length === 1
    ? bolsaCert[0].cert
    : (bolsaCert.find((b) => b.cert.publicKey.n?.equals(llave.n))?.cert || bolsaCert[0].cert);

  const certificatePem = forge.pki.certificateToPem(cert);

  cache = {
    privateKeyPem: forge.pki.privateKeyToPem(llave),
    certificatePem,
    // El X509Certificate del XML va en base64 sin cabeceras PEM ni saltos de línea
    certificateBase64: certificatePem
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
      .replace(/\s+/g, ''),
    serialNumber: cert.serialNumber,
    issuerName: cert.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).reverse().join(', '),
    validoHasta: cert.validity.notAfter,
  };
  return cache;
};

// Para tests: fuerza recargar en la siguiente llamada
const limpiarCache = () => { cache = null; };

const configurado = () => !!(process.env.SUNAT_CERT_P12_BASE64 || process.env.SUNAT_CERT_P12_PATH);

module.exports = { cargar, limpiarCache, configurado };
