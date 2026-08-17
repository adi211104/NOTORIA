// brand-shield/src/utils/constancia.pdf.js
//
// La representación impresa de la Constancia de Reputación Online.
//
// Tiene que parecer un documento, no una infografía: quien la recibe es un
// arrendador, un franquiciante o un banco, y lo que espera es un papel serio con
// un dato, una fecha y una forma de comprobarlo. De ahí el aire, la tipografía
// serif y el bloque de verificación al pie.
//
// ⚠️ NADA de caracteres fuera de WinAnsi (★, →, …). Las fuentes estándar de PDF
// no los tienen y PDFKit dibuja un "&" literal en su lugar — pasó en el primer
// afiche de la pared. Va el mismo sanitizador que allá.

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { VIGENCIA_DIAS } = require('../lib/constancia');

const { seguro } = require('../lib/winansi');

const INK = '#141413';
const VERDE = '#0B7324';
const GRIS = '#5C5B57';
const GRIS_CLARO = '#9C9B96';
const BORDE = '#E8E6DC';

const EMISOR = {
  razon: 'NOTORIA E.I.R.L.',
  ruc: '20616239466',
  web: 'usenotoria.app',
};

const fechaLarga = (d) => new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * @param datos { nombre, direccion, rating, totalResenas, diasVigilado, incidentes, emitida, vence }
 * @param urlVerificacion la URL completa que se codifica en el QR
 */
const generarConstancia = async (datos, urlVerificacion) => {
  // El QR se genera antes de abrir el documento: si falla, mejor fallar la
  // constancia entera que emitir una sin forma de verificarla.
  const qr = await QRCode.toBuffer(urlVerificacion, {
    width: 320, margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const trozos = [];
    doc.on('data', (c) => trozos.push(c));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    const W = doc.page.width;
    const M = 56;
    const ancho = W - M * 2;

    // ── Cabecera ──
    doc.rect(0, 0, W, 78).fill(INK);
    doc.fillColor('#FFFFFF').font('Times-Bold').fontSize(20).text(seguro('Notoria'), M, 26);
    doc.fillColor(GRIS_CLARO).font('Times-Roman').fontSize(9)
      .text(seguro(`${EMISOR.razon} · RUC ${EMISOR.ruc}`), M, 51);

    // ── Título ──
    doc.fillColor(INK).font('Times-Bold').fontSize(23)
      .text(seguro('Constancia de Reputación Online'), M, 116, { width: ancho, align: 'center' });
    doc.fillColor(GRIS).font('Times-Roman').fontSize(10.5)
      .text(seguro(`Emitida el ${fechaLarga(datos.emitida)}`), M, 148, { width: ancho, align: 'center' });

    // ── Cuerpo: se redacta como un documento, no como una ficha de datos ──
    let y = 196;
    doc.fillColor(INK).font('Times-Roman').fontSize(12);
    const parrafo = (t) => {
      doc.text(seguro(t), M, y, { width: ancho, align: 'justify', lineGap: 3 });
      y = doc.y + 14;
    };

    parrafo(`${EMISOR.razon}, que opera el servicio de monitoreo de reputación online Notoria, deja constancia de que a la fecha de emisión de este documento el establecimiento identificado a continuación presentaba el siguiente estado en su ficha pública de Google Maps:`);

    // ── Recuadro de datos ──
    const alto = 148;
    doc.roundedRect(M, y, ancho, alto, 8).lineWidth(1).stroke(BORDE);
    const fila = (etiqueta, valor, i) => {
      const yy = y + 18 + i * 26;
      doc.fillColor(GRIS).font('Times-Roman').fontSize(10.5).text(seguro(etiqueta), M + 20, yy, { width: 190 });
      doc.fillColor(INK).font('Times-Bold').fontSize(11.5).text(seguro(valor), M + 215, yy, { width: ancho - 235 });
    };
    fila('Establecimiento', datos.nombre, 0);
    fila('Dirección', datos.direccion || 'No consignada', 1);
    fila('Calificación en Google', `${Number(datos.rating).toFixed(1)} de 5`, 2);
    fila('Total de reseñas', String(datos.totalResenas), 3);
    fila('Días bajo monitoreo', String(datos.diasVigilado), 4);
    y += alto + 20;

    doc.fillColor(INK).font('Times-Roman').fontSize(12);
    parrafo(datos.incidentes > 0
      ? `Durante el periodo monitoreado se registraron ${datos.incidentes} incidencia(s) de reputación detectadas por el sistema (caídas de calificación, picos de reseñas negativas o alteraciones de la ficha).`
      : 'Durante el periodo monitoreado no se registraron incidencias de reputación: ni caídas de calificación, ni picos de reseñas negativas, ni alteraciones de la ficha.');

    // ── Alcance. Va en el documento y no en letra pequeña escondida: una
    //    constancia que se pasa de lo que puede acreditar no vale nada. ──
    doc.fillColor(GRIS).font('Times-Roman').fontSize(9.5)
      .text(seguro('Alcance: este documento acredita únicamente información pública de Google Maps, recogida y fechada por Notoria. No constituye una certificación de la calidad del servicio del establecimiento, ni una opinión sobre su solvencia, ni un documento con valor tributario.'),
        M, y, { width: ancho, align: 'justify', lineGap: 2 });

    // ── Bloque de verificación, abajo ──
    const yV = doc.page.height - 232;
    doc.roundedRect(M, yV, ancho, 150, 8).fill('#FAF9F5');
    doc.image(qr, M + 18, yV + 18, { width: 114, height: 114 });

    const xT = M + 152;
    const anchoT = ancho - 170;
    doc.fillColor(VERDE).font('Times-Bold').fontSize(10)
      .text(seguro('CÓMO VERIFICAR ESTE DOCUMENTO'), xT, yV + 20, { characterSpacing: 1.2, width: anchoT });
    doc.fillColor(INK).font('Times-Roman').fontSize(10.5)
      .text(seguro(`Escanee el código o visite ${EMISOR.web}/verificar. Los datos de arriba viajan firmados dentro del código: si coinciden con lo que muestra la web, el documento es auténtico y no fue alterado.`),
        xT, yV + 40, { width: anchoT, lineGap: 2 });
    doc.fillColor(GRIS).font('Times-Roman').fontSize(9)
      .text(seguro(`Válida hasta el ${fechaLarga(datos.vence)} (${VIGENCIA_DIAS} días desde su emisión).`),
        xT, yV + 106, { width: anchoT });

    doc.fillColor(GRIS_CLARO).font('Times-Roman').fontSize(8.5)
      .text(seguro(`${EMISOR.razon} · RUC ${EMISOR.ruc} · ${EMISOR.web}`),
        M, doc.page.height - 58, { width: ancho, align: 'center' });

    doc.end();
  });
};

module.exports = { generarConstancia };
