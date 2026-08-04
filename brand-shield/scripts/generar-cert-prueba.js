// brand-shield/scripts/generar-cert-prueba.js
// Genera un certificado autofirmado para probar la firma y el envío a SUNAT.
//
// El entorno beta de SUNAT acepta certificados autofirmados, así que no hace
// falta el Certificado Digital Tributario real para desarrollar. Se genera en
// vez de versionarse porque los .p12 están en .gitignore — y con razón: un
// archivo así en el repo se confunde fácil con el bueno.
//
//   node scripts/generar-cert-prueba.js

const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

const DESTINO = path.join(__dirname, 'sunat-test.p12');
const PASSWORD = 'test123'; // de prueba, no es secreto: solo abre este certificado falso
const RUC_PRUEBAS = '20000000001'; // el RUC que SUNAT asigna al entorno beta

if (fs.existsSync(DESTINO)) {
  console.log(`Ya existe: ${DESTINO}`);
  process.exit(0);
}

const llaves = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();

cert.publicKey = llaves.publicKey;
cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

const sujeto = [
  { name: 'countryName', value: 'PE' },
  { shortName: 'ST', value: 'Lima' },
  { name: 'localityName', value: 'Lima' },
  { name: 'organizationName', value: 'NOTORIA EIRL - PRUEBAS' },
  { shortName: 'OU', value: RUC_PRUEBAS },
  { name: 'commonName', value: `CERTIFICADO DE PRUEBA ${RUC_PRUEBAS}` },
];
cert.setSubject(sujeto);
cert.setIssuer(sujeto); // autofirmado
cert.sign(llaves.privateKey, forge.md.sha256.create());

const p12 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], PASSWORD, { algorithm: '3des' });
fs.writeFileSync(DESTINO, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));

console.log(`Certificado de prueba generado: ${DESTINO}`);
console.log(`Contraseña: ${PASSWORD}`);
