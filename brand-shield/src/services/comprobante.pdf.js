// brand-shield/src/services/comprobante.pdf.js
// Representación impresa del comprobante (PDFKit).
//
// El layout ya sigue el orden que SUNAT exige en una factura/boleta impresa —
// emisor con RUC, tipo y número del comprobante en recuadro, receptor, detalle,
// desglose de IGV, total en letras — para que al activar la emisión electrónica
// (Fase B) solo haya que rellenar el recuadro del QR y cambiar las leyendas.
//
// Mientras se emitan VOUCHER, el documento se rotula como constancia interna y
// dice explícitamente que no es un comprobante de pago electrónico.

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const tributario = require('../lib/tributario');

// Contenido del código QR, en el formato que define SUNAT para la
// representación impresa: campos separados por "|" y terminados en "|".
const contenidoQR = (c) => [
  tributario.EMISOR.ruc,
  c.tipo === 'BOLETA' ? '03' : '01',
  c.serie,
  String(c.correlativo).padStart(8, '0'),
  (c.igv / 100).toFixed(2),
  (c.total / 100).toFixed(2),
  new Date(c.fechaEmision).toISOString().slice(0, 10),
  c.receptorTipoDoc,
  c.receptorNumDoc || '0',
  c.hashFirma || '',
].join('|') + '|';

// Paleta de marca Notoria — igual que utils/reporte.generator.js
const INK = '#141413';
const VERDE = '#0B7324';
const GRIS = '#5C5B57';
const GRIS_CLARO = '#9C9B96';
const BORDE = '#E8E6DC';
const FONDO = '#FAF9F5';

const M = 50;               // margen
const ANCHO = 495;          // ancho útil (A4 - 2 márgenes)

const TITULOS = {
  VOUCHER: 'CONSTANCIA DE PAGO',
  FACTURA: 'FACTURA ELECTRÓNICA',
  BOLETA: 'BOLETA DE VENTA ELECTRÓNICA',
};

const NOMBRE_DOC = { '0': 'Doc. no domiciliado', '1': 'DNI', '6': 'RUC' };

const fecha = (d) => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const generarPDFComprobante = async (c) => {
  // El QR solo va en comprobantes fiscales, y se genera antes de dibujar porque
  // PDFKit es síncrono una vez arrancado el documento.
  const qr = c.tipo === 'VOUCHER'
    ? null
    : await QRCode.toBuffer(contenidoQR(c), { errorCorrectionLevel: 'M', margin: 0, width: 200 });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: M, size: 'A4' });
    const chunks = [];
    doc.on('data', (ch) => chunks.push(ch));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const esVoucher = c.tipo === 'VOUCHER';
    const imp = (v) => tributario.formatearImporte(v, c.moneda);

    // ── Encabezado ───────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill(INK);
    doc.rect(0, 80, doc.page.width, 3).fill(VERDE);
    doc.fillColor('#ffffff').fontSize(22).font('Times-Bold').text('Notoria', M, 25);
    doc.fontSize(10).font('Times-Roman').fillColor('#B0AEA5')
      .text(tributario.EMISOR.razonSocial, M, 54);

    // ── Emisor (izquierda) ───────────────────────────────────
    let y = 105;
    doc.fillColor(INK).fontSize(11).font('Times-Bold').text(tributario.EMISOR.razonSocial, M, y);
    doc.fontSize(9.5).font('Times-Roman').fillColor(GRIS)
      .text(`RUC ${tributario.EMISOR.ruc}`, M, y + 16)
      .text(tributario.EMISOR.direccionCompleta, M, y + 29, { width: 250 });

    // ── Recuadro del comprobante (derecha) ───────────────────
    const bx = M + ANCHO - 200;
    doc.rect(bx, y - 5, 200, 58).lineWidth(1).fillAndStroke(FONDO, BORDE);
    doc.fillColor(INK).fontSize(9.5).font('Times-Bold')
      .text(TITULOS[c.tipo] || c.tipo, bx, y + 4, { width: 200, align: 'center' });
    doc.fontSize(15).font('Times-Bold').fillColor(VERDE)
      .text(c.numero, bx, y + 20, { width: 200, align: 'center' });
    doc.fontSize(8.5).font('Times-Roman').fillColor(GRIS)
      .text(`Emitido el ${fecha(c.fechaEmision)}`, bx, y + 40, { width: 200, align: 'center' });

    // ── Receptor ─────────────────────────────────────────────
    y = 175;
    doc.moveTo(M, y).lineTo(M + ANCHO, y).lineWidth(1).strokeColor(BORDE).stroke();
    y += 12;
    doc.fillColor(GRIS_CLARO).fontSize(8.5).font('Times-Bold').text('CLIENTE', M, y);
    y += 13;
    doc.fillColor(INK).fontSize(11).font('Times-Bold').text(c.receptorNombre, M, y, { width: ANCHO });
    y += 16;
    const docLinea = c.receptorNumDoc
      ? `${NOMBRE_DOC[c.receptorTipoDoc] || 'Documento'} ${c.receptorNumDoc}`
      : 'Sin documento declarado';
    doc.fontSize(9.5).font('Times-Roman').fillColor(GRIS).text(`${docLinea}  ·  País: ${c.receptorPais}`, M, y);
    if (c.receptorDireccion) {
      y += 13;
      doc.text(c.receptorDireccion, M, y, { width: ANCHO });
    }

    // ── Detalle ──────────────────────────────────────────────
    y += 28;
    doc.rect(M, y, ANCHO, 22).fill(INK);
    doc.fillColor('#ffffff').fontSize(9).font('Times-Bold')
      .text('DESCRIPCIÓN', M + 10, y + 7)
      .text('IMPORTE', M + ANCHO - 110, y + 7, { width: 100, align: 'right' });
    y += 22;

    const altoFila = 34;
    doc.rect(M, y, ANCHO, altoFila).fillAndStroke('#ffffff', BORDE);
    doc.fillColor(INK).fontSize(10).font('Times-Roman')
      .text(c.descripcion, M + 10, y + 11, { width: ANCHO - 130 });
    doc.font('Times-Bold').text(imp(c.total), M + ANCHO - 110, y + 11, { width: 100, align: 'right' });
    y += altoFila;

    // ── Totales ──────────────────────────────────────────────
    y += 16;
    const esExportacion = c.exportacion > 0;
    const filas = esExportacion
      ? [['Operaciones de exportación', imp(c.exportacion)], ['IGV (no aplica)', imp(0)]]
      : [['Operaciones gravadas', imp(c.gravadas)], [`IGV (${(tributario.IGV_TASA * 100).toFixed(0)}%)`, imp(c.igv)]];

    const tx = M + ANCHO - 240;
    filas.forEach(([label, valor]) => {
      doc.fontSize(9.5).font('Times-Roman').fillColor(GRIS).text(label, tx, y, { width: 140 });
      doc.font('Times-Bold').fillColor(INK).text(valor, tx + 140, y, { width: 100, align: 'right' });
      y += 16;
    });

    doc.rect(tx, y + 2, 240, 26).fill(VERDE);
    doc.fillColor('#ffffff').fontSize(10).font('Times-Bold').text('TOTAL', tx + 10, y + 10);
    doc.fontSize(12).text(imp(c.total), tx + 130, y + 8, { width: 100, align: 'right' });
    y += 40;

    // ── Total en letras ──────────────────────────────────────
    doc.fillColor(GRIS).fontSize(9).font('Times-Roman')
      .text(`SON ${tributario.totalEnLetras(c.total, c.moneda)}`, M, y, { width: ANCHO });
    y += 26;

    // ── Leyendas ─────────────────────────────────────────────
    doc.moveTo(M, y).lineTo(M + ANCHO, y).strokeColor(BORDE).stroke();
    y += 12;

    if (esExportacion) {
      doc.fillColor(GRIS).fontSize(8.5).font('Times-Roman').text(
        'Operación de exportación de servicios — no gravada con IGV conforme al artículo 33° de la Ley del IGV.',
        M, y, { width: ANCHO }
      );
      y += 22;
    }

    if (esVoucher) {
      // Advertencia deliberada: sin CDR de SUNAT esto no sustenta crédito
      // fiscal, y no decirlo sería hacer pasar el documento por lo que no es.
      doc.rect(M, y, ANCHO, 46).fillAndStroke(FONDO, BORDE);
      doc.fillColor(INK).fontSize(8.5).font('Times-Bold')
        .text('Este documento no es un comprobante de pago electrónico.', M + 10, y + 9, { width: ANCHO - 20 });
      doc.fillColor(GRIS).font('Times-Roman')
        .text('Es una constancia interna del cobro realizado. Si necesitas factura electrónica válida ante SUNAT, escríbenos y la emitiremos.',
          M + 10, y + 22, { width: ANCHO - 20 });
      y += 58;
    } else {
      doc.image(qr, M, y, { width: 70, height: 70 });
      doc.fillColor(GRIS).fontSize(8.5).font('Times-Roman').text(
        'Representación impresa del comprobante de pago electrónico. Consúltelo en www.sunat.gob.pe',
        M + 82, y + 8, { width: ANCHO - 82 }
      );
      if (c.hashFirma) {
        doc.fontSize(7.5).fillColor(GRIS_CLARO).text(`Resumen de firma: ${c.hashFirma}`, M + 82, y + 34, { width: ANCHO - 82 });
      }
      y += 82;
    }

    doc.fillColor(GRIS_CLARO).fontSize(8).font('Times-Roman')
      .text(`${tributario.EMISOR.razonSocial} · RUC ${tributario.EMISOR.ruc} · usenotoria.app`, M, y, { width: ANCHO, align: 'center' });

    doc.end();
  });
};

module.exports = { generarPDFComprobante, contenidoQR };
