// Comprueba si una clave abre el certificado .p12, SIN cargar nada a Railway y
// sin imprimir la clave en ningún momento.
//
// Existe porque adivinar la clave del .p12 a base de intentos en el asistente de
// Windows es lento y engañoso: cuando la clave es incorrecta, el asistente
// simplemente vuelve a abrirse, sin decir que falló. Esto responde sí o no, y
// además usa `node-forge`, la MISMA librería que `src/sunat/certificado.js`, así
// que lo que pase aquí es exactamente lo que pasará en producción.
//
// Uso (la clave se escribe cuando la pida, no va en la línea de comandos para
// que no quede en el historial del terminal):
//   node scripts/probar-clave-p12.js [ruta-del-p12]

const fs = require('fs');
const readline = require('readline');
const forge = require('node-forge');

const ruta = process.argv[2] || 'C:/Users/Admin/Downloads/certificado.p12';

if (!fs.existsSync(ruta)) {
  console.error(`✗ No encuentro el archivo: ${ruta}`);
  process.exit(1);
}

const preguntarClave = () => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Clave del .p12 (no se muestra al escribir): ', (respuesta) => {
    rl.close();
    console.log('');
    resolve(respuesta);
  });
  // Oculta lo tecleado.
  rl._writeToOutput = function (s) {
    if (s.includes('Clave del .p12')) rl.output.write(s);
  };
});

(async () => {
  console.log(`\nArchivo: ${ruta} (${fs.statSync(ruta).size} bytes)\n`);

  // El readline de Node no se lleva bien con Git Bash (no siempre recibe un TTY
  // de verdad), así que se admite también la clave por variable de entorno. Se
  // rellena con el `read -s` de bash, que no la muestra ni la deja en el
  // historial — ver la cabecera de este archivo.
  const clave = process.env.P12_CLAVE !== undefined
    ? process.env.P12_CLAVE
    : await preguntarClave();

  try {
    const der = forge.util.createBuffer(fs.readFileSync(ruta).toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), clave);

    // Que abra no basta: tiene que traer llave privada Y certificado, que es lo
    // que necesita la firma. Un .p12 solo con el certificado público abriría
    // igual y luego fallaría al firmar.
    const bolsaCert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const bolsaLlave = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [])
      .concat(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []);

    if (!bolsaCert.length || !bolsaLlave.length) {
      console.log('⚠️  La clave ABRE el archivo, pero le falta algo:');
      console.log(`    certificados: ${bolsaCert.length} · llaves privadas: ${bolsaLlave.length}`);
      console.log('    Para firmar hacen falta los dos.');
      process.exit(2);
    }

    const cert = bolsaCert[0].cert;
    const campo = (attrs, nombre) => (attrs.find((a) => a.name === nombre || a.shortName === nombre) || {}).value;

    console.log('✅ CLAVE CORRECTA — el certificado abre y trae su llave privada.\n');
    console.log(`   Emitido a : ${campo(cert.subject.attributes, 'commonName') || '(sin CN)'}`);
    console.log(`   Emitido por: ${campo(cert.issuer.attributes, 'commonName') || '(sin CN)'}`);
    console.log(`   Válido     : ${cert.validity.notBefore.toISOString().slice(0, 10)} → ${cert.validity.notAfter.toISOString().slice(0, 10)}`);

    const hoy = new Date();
    if (hoy < cert.validity.notBefore) console.log('\n   ⚠️  Todavía NO es válido: nada firmado antes de esa fecha sirve.');
    if (hoy > cert.validity.notAfter) console.log('\n   🔴 VENCIDO.');
    console.log('\nEsta es la clave que va en SUNAT_CERT_PASSWORD.');
  } catch (e) {
    console.log('✗ Esa clave NO abre el certificado.\n');
    console.log(`  (detalle de la librería: ${e.message})`);
    console.log('\n  Es la clave que pusiste al DESCARGAR o EXPORTAR el .p12,');
    console.log('  no una que se asigne ahora ni la de tu usuario SOL.');
    process.exit(1);
  }
})();
