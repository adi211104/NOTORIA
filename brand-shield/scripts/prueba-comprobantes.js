const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'src');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SALIDA, { recursive: true });
const t = require(path.join(base, 'lib/tributario'));
const { generarPDFComprobante } = require(path.join(base, 'services/comprobante.pdf'));

let fallos = 0;
const MAX = 100; // el tope de SUNAT para razón social y dirección
const check = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ok ? '' : `\n      esperado ${JSON.stringify(esperado)}\n      real     ${JSON.stringify(real)}`}`);
};

// $20.00 = 2000 céntimos, cliente peruano, precio INCLUYE IGV
const pe = t.desglosar({ total: 2000, paisFiscal: 'PE' });
check('PE $20 -> gravadas 1695', pe.gravadas, 1695);
check('PE $20 -> igv 305', pe.igv, 305);
check('PE suma cuadra', pe.gravadas + pe.igv, 2000);
check('PE tipoOperacion 0101', pe.tipoOperacion, '0101');

// Cliente del exterior: exportación de servicios, sin IGV
const mx = t.desglosar({ total: 2000, paisFiscal: 'MX' });
check('MX -> exportacion 2000', mx.exportacion, 2000);
check('MX -> igv 0', mx.igv, 0);
check('MX tipoOperacion 0201', mx.tipoOperacion, '0201');

// Sin país declarado se asume Perú (caso conservador: se cobra IGV)
check('sin pais -> grava IGV', t.desglosar({ total: 6000, paisFiscal: null }).igv, 915);

// La suma debe cuadrar al céntimo para cualquier importe (nada de descuadres por redondeo)
let descuadres = 0;
for (let v = 1; v <= 100000; v++) {
  const d = t.desglosar({ total: v, paisFiscal: 'PE' });
  if (d.gravadas + d.igv !== v) descuadres++;
}
check('sin descuadres en 1..100000', descuadres, 0);

// Tipo de comprobante fiscal según receptor
check('PE con RUC -> FACTURA', t.tipoFiscalPara({ docTipo: '6', paisFiscal: 'PE' }), 'FACTURA');
check('PE con DNI -> BOLETA', t.tipoFiscalPara({ docTipo: '1', paisFiscal: 'PE' }), 'BOLETA');
check('CL -> FACTURA (exportacion)', t.tipoFiscalPara({ docTipo: '1', paisFiscal: 'CL' }), 'FACTURA');

// Total en letras
check('letras 2000', t.totalEnLetras(2000, 'USD'), 'VEINTE CON 00/100 DÓLARES AMERICANOS');
check('letras 6000', t.totalEnLetras(6000, 'USD'), 'SESENTA CON 00/100 DÓLARES AMERICANOS');
check('letras 57600', t.totalEnLetras(57600, 'USD'), 'QUINIENTOS SETENTA Y SEIS CON 00/100 DÓLARES AMERICANOS');
check('letras 123456', t.totalEnLetras(123456, 'PEN'), 'MIL DOSCIENTOS TREINTA Y CUATRO CON 56/100 SOLES');
check('letras 100', t.totalEnLetras(100, 'PEN'), 'UNO CON 00/100 SOLES');
check('letras 10000', t.totalEnLetras(10000, 'PEN'), 'CIEN CON 00/100 SOLES');
check('letras 2100', t.totalEnLetras(2100, 'PEN'), 'VEINTIUNO CON 00/100 SOLES');

// Validación de datos fiscales
check('RUC valido', t.validarDatosFiscales({ docTipo: '6', docNumero: '20616239466', razonSocial: 'ACME SAC', paisFiscal: 'pe' }), null);
check('RUC invalido', !!t.validarDatosFiscales({ docTipo: '6', docNumero: '123', razonSocial: 'ACME SAC', paisFiscal: 'PE' }), true);
check('DNI valido', t.validarDatosFiscales({ docTipo: '1', docNumero: '45678912', razonSocial: 'Juan Perez', paisFiscal: 'PE' }), null);
// ⚠️ Esta comprobación decía lo contrario hasta el 2026-08-26: daba por BUENO a
// un cliente del exterior sin documento. Era coherente con el código de
// entonces, y el código de entonces dejaba que un campo del navegador decidiera
// si el comprobante llevaba IGV. Ahora el país se rechaza al GUARDAR
// (`SOLO_NACIONAL`) y la lógica de exportación se conserva intacta más abajo,
// que es lo que hay que poder afirmar: no se borró la función, se cerró la puerta.
check('extranjero sin doc — hoy se rechaza, el servicio es solo nacional',
  !!t.validarDatosFiscales({ razonSocial: 'Acme LLC', paisFiscal: 'US' }), true);
check('pais invalido', !!t.validarDatosFiscales({ razonSocial: 'X', paisFiscal: 'PERU' }), true);

// Receptor derivado del usuario
check('extranjero -> doc 0', t.receptorDesdeUsuario({ nombre: 'Ana', docTipo: '6', docNumero: '20', paisFiscal: 'MX' }).tipoDoc, '0');

// Los 3 PDFs deben generarse sin lanzar
const muestra = (over) => ({
  tipo: 'VOUCHER', numero: 'V001-00000001', fechaEmision: new Date(),
  receptorNombre: 'Restaurante La Mar S.A.C.', receptorTipoDoc: '6', receptorNumDoc: '20512345678',
  receptorDireccion: 'Av. La Mar 770, Miraflores, Lima', receptorPais: 'PE',
  moneda: 'USD', gravadas: 1695, exportacion: 0, igv: 305, total: 2000,
  tipoOperacion: '0101', descripcion: 'Notoria — Plan Negocio, suscripción por 1 mes',
  hashFirma: null, ...over,
});

(async () => {
  const casos = [
    ['voucher PE', muestra()],
    ['factura PE', muestra({ tipo: 'FACTURA', numero: 'F001-00000001', hashFirma: 'aB3xY9==' })],
    ['factura exportación', muestra({ tipo: 'FACTURA', numero: 'F001-00000002', receptorPais: 'MX', receptorTipoDoc: '0', receptorNumDoc: 'RFC-XAXX010101', receptorNombre: 'Grupo Anderson LLC', gravadas: 0, exportacion: 6000, igv: 0, total: 6000, tipoOperacion: '0201' })],
    ['boleta DNI', muestra({ tipo: 'BOLETA', numero: 'B001-00000001', receptorTipoDoc: '1', receptorNumDoc: '45678912', receptorNombre: 'Juan Pérez Quispe' })],
  ];
  for (const [nombre, c] of casos) {
    const pdf = await generarPDFComprobante(c);
    const ok = pdf.length > 1000 && pdf.slice(0, 4).toString() === '%PDF';
    if (!ok) fallos++;
    console.log(`${ok ? 'OK  ' : 'FALLA'} PDF ${nombre} (${pdf.length} bytes)`);
    fs.writeFileSync(path.join(SALIDA, `${c.numero}.pdf`), pdf);
  }

  // Receptor completo para SUNAT. El caso que importa es la boleta anual: los
  // planes anuales (S/564 y S/1716) pasan el umbral de S/700 desde el que la
  // boleta exige DNI, así que emitirla sin él sería un rechazo seguro.
  const casosReceptor = [
    ['boleta mensual solo con nombre', { receptor: { nombre: 'Ana Perez', tipoDoc: '1', numDoc: null, pais: 'PE' }, tipoFiscal: 'BOLETA', total: 5900 }, false],
    ['boleta anual sin DNI', { receptor: { nombre: 'Ana Perez', tipoDoc: '1', numDoc: null, pais: 'PE' }, tipoFiscal: 'BOLETA', total: 171600 }, true],
    ['boleta anual con DNI', { receptor: { nombre: 'Ana Perez', tipoDoc: '1', numDoc: '12345678', pais: 'PE' }, tipoFiscal: 'BOLETA', total: 171600 }, false],
    ['factura sin RUC', { receptor: { nombre: 'Empresa SAC', tipoDoc: '1', numDoc: '12345678', pais: 'PE' }, tipoFiscal: 'FACTURA', total: 5900 }, true],
    ['factura con RUC', { receptor: { nombre: 'Empresa SAC', tipoDoc: '6', numDoc: '20601030405', pais: 'PE' }, tipoFiscal: 'FACTURA', total: 5900 }, false],
    ['exterior sin documento', { receptor: { nombre: 'John Smith', tipoDoc: '0', numDoc: null, pais: 'US' }, tipoFiscal: 'FACTURA', total: 171600 }, false],
    ['sin nombre', { receptor: { nombre: '', tipoDoc: '1', numDoc: '12345678', pais: 'PE' }, tipoFiscal: 'BOLETA', total: 5900 }, true],
  ];
  for (const [nombre, arg, debeBloquear] of casosReceptor) {
    check(`receptor: ${nombre}`, !!t.validarReceptorParaSunat(arg), debeBloquear);
  }

  // ── Los datos fiscales que declara el CLIENTE ───────────
  //
  // 🔴 Escrito el 2026-08-26, auditando las rutas de pago. `razonSocial` y
  // `direccionFiscal` llegan del cuerpo de la petición y viajan TAL CUAL a
  // `cbc:RegistrationName` y `cbc:Line` del XML. Sin tope se guardan sin
  // problema, el cobro pasa sin problema, y el comprobante lo rechaza SUNAT
  // DESPUÉS: cliente cobrado, sin documento y con un correlativo gastado que no
  // admite huecos.
  //
  // Y `paisFiscal` era peor: con 'MX' el receptor pasa a no domiciliado, el
  // comprobante sale como exportación y **sin IGV**. Un campo del navegador
  // decidía si Notoria declara IGV o no.
  const df = (o) => t.validarDatosFiscales({
    docTipo: '1', docNumero: '12345678', razonSocial: 'Ana Torres', paisFiscal: 'PE', ...o,
  });
  check('datos fiscales normales pasan', df({}) === null, true);
  check('🔴 el país NO lo elige el cliente: MX se rechaza', df({ paisFiscal: 'MX' }) !== null, true);
  check('   …y la lógica de exportación sigue viva para reabrir',
    t.desglosar({ total: 2000, paisFiscal: 'MX' }).exportacion, 2000);
  check('razón social de 101 caracteres se rechaza',
    df({ razonSocial: 'x'.repeat(MAX + 1) }) !== null, true);
  check('   …y la de 100 se acepta', df({ razonSocial: 'x'.repeat(MAX) }) === null, true);
  check('dirección de 101 caracteres se rechaza',
    df({ direccionFiscal: 'x'.repeat(MAX + 1) }) !== null, true);
  check('   …y la dirección sigue siendo OPCIONAL', df({ direccionFiscal: null }) === null, true);
  check('un país numérico da error, no una excepción',
    typeof df({ paisFiscal: 5 }), 'string');
  check('una razón social ausente se rechaza', df({ razonSocial: null }) !== null, true);
  check('un RUC mal formado se rechaza', df({ docTipo: '6', docNumero: '123' }) !== null, true);

  // El límite tiene que ser el que el XML aguanta, no un número suelto.
  check('el tope de razón social es el de SUNAT', t.MAX_RAZON_SOCIAL, 100);
  check('el interruptor de país es explícito', t.SOLO_NACIONAL, true);

  // El servicio debe cargar (require de prisma incluido)
  require(path.join(base, 'services/comprobante.service'));
  console.log('OK   comprobante.service carga');
  require(path.join(base, 'api/routes/pago.routes'));
  console.log('OK   pago.routes carga');

  console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLAS ===`);
  process.exit(fallos === 0 ? 0 : 1);
})();
