// brand-shield/src/lib/tributario.js
// Reglas tributarias de NOTORIA E.I.R.L. para la emisión de comprobantes.
//
// Aislado a propósito: es la parte que un contador debe poder leer y validar
// sin entender el resto del backend, y la que hay que ajustar si cambia la
// tasa del IGV o el criterio de exportación de servicios.
//
// Criterio adoptado (decidido 2026-07-26): el precio publicado INCLUYE IGV.
// Un cliente peruano que ve "$20/mes" paga $20 en total, de los cuales
// $16.95 son base imponible y $3.05 IGV. Un cliente del exterior paga los
// mismos $20 sin IGV, como exportación de servicios.

const IGV_TASA = 0.18;

// Emisor — deben coincidir exactamente con la ficha RUC en SUNAT.
// EMISOR_RUC solo se sobreescribe para probar contra el entorno beta, que exige
// el RUC de pruebas 20000000001; en producción se deja sin definir.
// La dirección debe coincidir con el domicilio fiscal de la ficha RUC, que
// SUNAT contrasta contra el comprobante. Va desglosada porque el UBL pide
// distrito, provincia y departamento en campos separados de la calle.
const EMISOR = {
  ruc: process.env.EMISOR_RUC || '20616239466',
  razonSocial: 'NOTORIA E.I.R.L.',
  nombreComercial: 'Notoria',
  direccion: process.env.EMISOR_DIRECCION || 'CAL.ISLA FILIPINAS MZA. G9 LOTE. 8',
  ubigeo: process.env.EMISOR_UBIGEO || '070104', // INEI: La Perla, Callao
  distrito: 'LA PERLA',
  provincia: 'PROV. CONST. DEL CALLAO',
  departamento: 'PROV. CONST. DEL CALLAO',
  pais: 'PE',
};

// Domicilio fiscal completo, para la representación impresa y las páginas legales
EMISOR.direccionCompleta = `${EMISOR.direccion}, ${EMISOR.distrito}, ${EMISOR.provincia}, Perú`;

// Catálogo 51 de SUNAT — tipo de operación
const TIPO_OPERACION = {
  VENTA_INTERNA: '0101',
  // "Exportación de servicios – prestación de servicios realizados íntegramente
  // en el país". Requiere estar inscrito en el Registro de Exportadores de
  // Servicios; si NOTORIA no lo estuviera, la operación pasaría a ser una venta
  // a no domiciliado que NO califica como exportación (0401) y sí llevaría IGV.
  EXPORTACION_SERVICIOS: '0201',
};

// Catálogo 06 de SUNAT — tipo de documento de identidad del receptor
const DOC = {
  NO_DOMICILIADO: '0',
  DNI: '1',
  RUC: '6',
};

// ¿La operación es doméstica (grava IGV) o exportación de servicios?
// El país fiscal del receptor manda; si no lo declaró, se asume Perú, que es
// el caso conservador (se cobra IGV y se declara, en vez de omitirlo).
const esDomestico = (paisFiscal) => (paisFiscal || 'PE').toUpperCase() === 'PE';

// Desglosa un total que YA incluye impuestos en sus componentes.
// Los importes están en céntimos, así que todo se hace en enteros: el IGV se
// calcula como el residuo (total - gravadas) para que la suma cuadre siempre
// al céntimo y no quede un descuadre de 1 por redondeo.
const desglosar = ({ total, paisFiscal }) => {
  if (!esDomestico(paisFiscal)) {
    return {
      gravadas: 0,
      exportacion: total,
      igv: 0,
      total,
      tipoOperacion: TIPO_OPERACION.EXPORTACION_SERVICIOS,
    };
  }
  const gravadas = Math.round(total / (1 + IGV_TASA));
  return {
    gravadas,
    exportacion: 0,
    igv: total - gravadas,
    total,
    tipoOperacion: TIPO_OPERACION.VENTA_INTERNA,
  };
};

// Qué comprobante corresponde emitir según quién es el receptor:
//   peruano con RUC  → factura
//   peruano sin RUC  → boleta (se informa a SUNAT por resumen diario, no una a una)
//   del exterior     → factura de exportación de servicios
// Devuelve el tipo *fiscal*; en Fase A todavía se emite un VOUCHER en su lugar
// (ver services/comprobante.service.js), pero el tipo fiscal ya queda calculado.
const tipoFiscalPara = ({ docTipo, paisFiscal }) => {
  if (!esDomestico(paisFiscal)) return 'FACTURA';
  return docTipo === DOC.RUC ? 'FACTURA' : 'BOLETA';
};

// Normaliza los datos fiscales que declaró el usuario a lo que SUNAT espera.
// Si no declaró nada usable, cae a los datos de la cuenta como consumidor final
// peruano — nunca se deja un comprobante sin receptor.
const receptorDesdeUsuario = (usuario) => {
  const pais = (usuario.paisFiscal || 'PE').toUpperCase();
  const domestico = esDomestico(pais);

  let docTipo = usuario.docTipo;
  if (!docTipo) docTipo = domestico ? DOC.DNI : DOC.NO_DOMICILIADO;
  // Un RUC declarado por alguien del exterior no tiene sentido para SUNAT
  if (!domestico) docTipo = DOC.NO_DOMICILIADO;

  return {
    tipoDoc: docTipo,
    numDoc: usuario.docNumero || null,
    nombre: usuario.razonSocial || usuario.nombre,
    direccion: usuario.direccionFiscal || null,
    pais,
  };
};

// Validación de los datos fiscales antes de guardarlos. Devuelve un mensaje de
// error o null. RUC peruano: 11 dígitos empezando en 10/15/17/20. DNI: 8.
const validarDatosFiscales = ({ docTipo, docNumero, razonSocial, paisFiscal }) => {
  const pais = (paisFiscal || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(pais)) return 'El país debe ser un código de 2 letras (ej. PE, MX, CL)';
  if (!razonSocial || razonSocial.trim().length < 3) return 'La razón social o nombre es obligatorio';

  if (pais !== 'PE') return null; // al exterior no se le exige documento peruano

  if (![DOC.RUC, DOC.DNI].includes(docTipo)) return 'Para Perú el documento debe ser RUC o DNI';
  const num = (docNumero || '').trim();
  if (docTipo === DOC.RUC && !/^(10|15|17|20)\d{9}$/.test(num)) return 'El RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20';
  if (docTipo === DOC.DNI && !/^\d{8}$/.test(num)) return 'El DNI debe tener 8 dígitos';
  return null;
};

// Importe a partir del cual una BOLETA obliga a identificar al comprador con su
// DNI (RS 007-99/SUNAT, art. 8). Por debajo basta con el nombre.
//
// No es teórico: el plan anual (S/564 y S/1716) supera el umbral, así que una
// boleta anual sin DNI sería rechazada por SUNAT.
const UMBRAL_IDENTIFICACION = 70000; // S/700.00 en céntimos

// ¿Están los datos del receptor que SUNAT va a exigir para este comprobante?
// Devuelve null si todo está en orden, o el motivo si falta algo.
//
// Existe porque `receptorDesdeUsuario` rellena los huecos con lo que haya
// (`razonSocial || nombre`, y `numDoc` puede quedar en null) para poder imprimir
// el VOUCHER interno. Eso vale mientras no se emita a SUNAT; en cuanto se emita
// de verdad, esos huecos son un comprobante rechazado. Se comprueba ANTES de
// gastar un correlativo, porque la numeración no admite huecos.
const validarReceptorParaSunat = ({ receptor, tipoFiscal, total }) => {
  const nombre = (receptor.nombre || '').trim();
  if (nombre.length < 3) return 'falta el nombre o razón social del receptor';

  // Al cliente del exterior no se le exige documento peruano, solo identificarlo
  if (!esDomestico(receptor.pais)) return null;

  const num = (receptor.numDoc || '').trim();

  if (tipoFiscal === 'FACTURA') {
    if (receptor.tipoDoc !== DOC.RUC) return 'una factura exige RUC del receptor';
    if (!/^(10|15|17|20)\d{9}$/.test(num)) return 'el RUC del receptor no es válido';
    return null;
  }

  // BOLETA
  if (total >= UMBRAL_IDENTIFICACION) {
    if (receptor.tipoDoc !== DOC.DNI) return `una boleta de ${formatearImporte(total, 'PEN')} exige DNI del receptor`;
    if (!/^\d{8}$/.test(num)) return 'el DNI del receptor no es válido';
  }
  return null;
};

// Plazo legal para que SUNAT reciba el comprobante: 3 días calendario contados
// desde el día siguiente a la emisión, hasta el final de ese tercer día.
// Vencido el plazo el comprobante pierde validez tributaria total, aunque ya se
// le haya entregado al cliente.
const PLAZO_ENVIO_DIAS = 3;

const calcularFechaLimiteEnvio = (fechaEmision) => {
  const limite = new Date(fechaEmision);
  limite.setDate(limite.getDate() + PLAZO_ENVIO_DIAS);
  limite.setHours(23, 59, 59, 999);
  return limite;
};

// Importe en céntimos → texto para imprimir. "USD 20.00"
const formatearImporte = (centimos, moneda) =>
  `${moneda === 'USD' ? 'USD' : 'S/'} ${(centimos / 100).toFixed(2)}`;

// Total en letras — obligatorio en la representación impresa de un comprobante.
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE'];
const DECENAS = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

const centenasEnLetras = (n) => {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto <= 20) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d === 2) partes.push(u ? `VEINTI${UNIDADES[u]}` : 'VEINTE');
    else partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
  }
  return partes.join(' ');
};

const numeroEnLetras = (n) => {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${centenasEnLetras(millones)} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${centenasEnLetras(miles)} MIL`);
  if (resto) partes.push(centenasEnLetras(resto));
  return partes.join(' ').trim();
};

const totalEnLetras = (centimos, moneda) => {
  const entero = Math.floor(centimos / 100);
  const decimal = String(centimos % 100).padStart(2, '0');
  const unidad = moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES';
  return `${numeroEnLetras(entero)} CON ${decimal}/100 ${unidad}`;
};

module.exports = {
  IGV_TASA, EMISOR, TIPO_OPERACION, DOC, PLAZO_ENVIO_DIAS, UMBRAL_IDENTIFICACION,
  esDomestico, desglosar, tipoFiscalPara, receptorDesdeUsuario, validarDatosFiscales,
  validarReceptorParaSunat,
  calcularFechaLimiteEnvio, formatearImporte, totalEnLetras, numeroEnLetras,
};
