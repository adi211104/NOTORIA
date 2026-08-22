const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'src');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SALIDA, { recursive: true });

// Certificado de prueba autofirmado — el entorno beta de SUNAT los acepta
process.env.SUNAT_CERT_P12_PATH = path.join(__dirname, 'sunat-test.p12');
process.env.SUNAT_CERT_PASSWORD = 'test123';
// El domicilio se define ENTERO o no se define: los cinco campos van juntos al
// XML y `validarEmisor()` corta si llegan a medias (ver lib/tributario.js).
process.env.EMISOR_DIRECCION = 'Av. Ejemplo 123';
process.env.EMISOR_UBIGEO = '150101';
process.env.EMISOR_DISTRITO = 'LIMA';
process.env.EMISOR_PROVINCIA = 'LIMA';
process.env.EMISOR_DEPARTAMENTO = 'LIMA';

const certificado = require(path.join(base, 'sunat/certificado'));
const ubl = require(path.join(base, 'sunat/ublInvoice'));
const firma = require(path.join(base, 'sunat/firmaXades'));

let fallos = 0;
const check = (nombre, ok, extra = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ok || !extra ? '' : `\n      ${extra}`}`);
};

// 1. Carga del certificado
const cert = certificado.cargar();
check('certificado: llave privada PEM', cert.privateKeyPem.includes('PRIVATE KEY'));
check('certificado: base64 sin cabeceras', !cert.certificateBase64.includes('-----') && cert.certificateBase64.length > 500);
console.log(`     emisor del cert: ${cert.issuerName}`);

// Contraseña incorrecta debe dar un error claro, no un stacktrace críptico
certificado.limpiarCache();
process.env.SUNAT_CERT_PASSWORD = 'incorrecta';
let msgError = '';
try { certificado.cargar(); } catch (e) { msgError = e.message; }
check('certificado: clave incorrecta da error legible', msgError.includes('contraseña'), msgError);
certificado.limpiarCache();
process.env.SUNAT_CERT_PASSWORD = 'test123';

const muestra = (over) => ({
  tipo: 'FACTURA', serie: 'F001', correlativo: 1, numero: 'F001-00000001',
  fechaEmision: new Date('2026-07-26T10:30:00Z'),
  receptorNombre: 'RESTAURANTE LA MAR S.A.C.', receptorTipoDoc: '6', receptorNumDoc: '20512345678',
  receptorDireccion: 'Av. La Mar 770, Miraflores, Lima', receptorPais: 'PE',
  moneda: 'USD', gravadas: 1695, exportacion: 0, igv: 305, total: 2000,
  tipoOperacion: '0101', descripcion: 'Notoria - Plan Negocio, suscripcion por 1 mes',
  ...over,
});

const exportacion = muestra({
  numero: 'F001-00000002', correlativo: 2,
  receptorNombre: 'GRUPO ANDERSON LLC', receptorTipoDoc: '0', receptorNumDoc: '0',
  receptorDireccion: null, receptorPais: 'MX',
  gravadas: 0, exportacion: 6000, igv: 0, total: 6000, tipoOperacion: '0201',
});

// 2. XML UBL
for (const [nombre, c] of [['gravada', muestra()], ['exportación', exportacion]]) {
  const { xml, nombreArchivo } = ubl.construir(c);
  const tiene = (frag) => xml.includes(frag);

  check(`UBL ${nombre}: nombre de archivo`, nombreArchivo === `20616239466-01-${c.serie}-0000000${c.correlativo}`, nombreArchivo);
  check(`UBL ${nombre}: UBLVersionID 2.1`, tiene('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>'));
  check(`UBL ${nombre}: CustomizationID 2.0`, tiene('<cbc:CustomizationID>2.0</cbc:CustomizationID>'));
  check(`UBL ${nombre}: ExtensionContent vacío`, tiene('<ext:ExtensionContent/>'));
  check(`UBL ${nombre}: tipo de operación en listID`, tiene(`listID="${c.tipoOperacion}"`));
  check(`UBL ${nombre}: RUC del emisor`, tiene('>20616239466<'));
  check(`UBL ${nombre}: moneda USD`, tiene('>USD<'));
  check(`UBL ${nombre}: total pagable`, tiene(`<cbc:PayableAmount currencyID="USD">${(c.total / 100).toFixed(2)}</cbc:PayableAmount>`));
  check(`UBL ${nombre}: monto en letras`, tiene('languageLocaleID="1000"'));

  if (c.exportacion > 0) {
    check('UBL exportación: afectación 40', tiene('>40</cbc:TaxExemptionReasonCode>'));
    check('UBL exportación: esquema 9995 EXP', tiene('>9995<') && tiene('<cbc:Name>EXP</cbc:Name>'));
    check('UBL exportación: IGV en cero', tiene('<cbc:TaxAmount currencyID="USD">0.00</cbc:TaxAmount>'));
  } else {
    check('UBL gravada: afectación 10', tiene('>10</cbc:TaxExemptionReasonCode>'));
    check('UBL gravada: esquema 1000 IGV', tiene('>1000<') && tiene('<cbc:Name>IGV</cbc:Name>'));
    check('UBL gravada: 18.00%', tiene('<cbc:Percent>18.00</cbc:Percent>'));
    check('UBL gravada: base imponible 16.95', tiene('>16.95<'));
    check('UBL gravada: IGV 3.05', tiene('<cbc:TaxAmount currencyID="USD">3.05</cbc:TaxAmount>'));
  }

  // 3. Firma
  const { xml: firmado, digest } = firma.firmar(xml);
  check(`firma ${nombre}: DigestValue presente`, !!digest && digest.length > 20, String(digest));
  check(`firma ${nombre}: dentro de ExtensionContent`,
    /<ext:ExtensionContent><ds:Signature/.test(firmado));
  check(`firma ${nombre}: Id=SignatureSP`, firmado.includes('Id="SignatureSP"'));
  check(`firma ${nombre}: referencia URI=""`, firmado.includes('URI=""'));
  check(`firma ${nombre}: transform enveloped`, firmado.includes('enveloped-signature'));
  // Con prefijo ds: — sin él heredarían el namespace del Invoice y SUNAT
  // responde 2335 "Unsupported or unrecognized Signature signer format"
  check(`firma ${nombre}: certificado incrustado con prefijo ds`,
    firmado.includes('<ds:X509Data><ds:X509Certificate>'));
  check(`firma ${nombre}: el documento sigue completo`, firmado.includes('<cbc:ID>' + c.numero + '</cbc:ID>'));

  // 4. La firma debe verificar — si esto falla, SUNAT también lo rechaza
  const v = firma.verificar(firmado);
  check(`firma ${nombre}: verificación criptográfica`, v.valida, v.error || '');

  // 5. Cualquier alteración posterior debe invalidarla
  const alterado = firmado.replace('>2000.00<', '>1.00<').replace('>20.00<', '>1.00<');
  if (alterado !== firmado) {
    check(`firma ${nombre}: detecta manipulación`, firma.verificar(alterado).valida === false);
  }

  fs.writeFileSync(path.join(SALIDA, `${nombreArchivo}.xml`), firmado);
}

console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLAS ===`);
process.exit(fallos === 0 ? 0 : 1);
