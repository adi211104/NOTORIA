const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'src');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SALIDA, { recursive: true });
const t = require(path.join(base, 'lib/tributario'));
const { generarPDFComprobante } = require(path.join(base, 'services/comprobante.pdf'));

let fallos = 0;
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
check('extranjero sin doc', t.validarDatosFiscales({ razonSocial: 'Acme LLC', paisFiscal: 'US' }), null);
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

  // El servicio debe cargar (require de prisma incluido)
  require(path.join(base, 'services/comprobante.service'));
  console.log('OK   comprobante.service carga');
  require(path.join(base, 'api/routes/pago.routes'));
  console.log('OK   pago.routes carga');

  console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLAS ===`);
  process.exit(fallos === 0 ? 0 : 1);
})();
