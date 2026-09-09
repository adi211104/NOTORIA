// brand-shield/src/utils/cartel.generator.js
//
// Pinta en PDF el cartel de reseñas que compone `lib/cartel.js`.
//
// Acá no hay ni una decisión de maqueta: las posiciones, los tamaños de letra y
// hasta el corte de líneas del nombre vienen ya resueltos en primitivas. Este
// archivo solo sabe traducir cada primitiva a PDFKit. Es lo que permite que la
// vista previa del panel —que dibuja las MISMAS primitivas en SVG— no se separe
// del papel. Ver la cabecera de `lib/cartel.js`.
//
// PDF y no imagen porque es lo que se lleva a una imprenta: el texto va como
// texto y el QR como rectángulos vectoriales, así que sale nítido a cualquier
// tamaño. Un PNG se imprime borroso en cuanto la impresora tiene más resolución
// que la imagen.

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// ⚠️ NADA de caracteres fuera de WinAnsi en el texto que llegue acá: las fuentes
// estándar del PDF dibujan un «&» en su lugar. El nombre del negocio lo escribe
// el cliente, así que TODO pasa por `seguro()`. Ver lib/winansi.js — ojo, WinAnsi
// NO es latin1. Por eso las estrellas del cartel son un camino de puntos y no la
// letra ★: ese error ya salió impreso una vez.
const { seguro } = require('../lib/winansi');
const cartel = require('../lib/cartel');

// El ascendente de Times en las fuentes estándar del PDF (683/1000 del em).
//
// 🔴 Hace falta porque las dos mitades miden la altura del texto distinto:
// `lib/cartel.js` habla de LÍNEAS DE BASE —como SVG, y como la app Android— y
// `doc.text()` de PDFKit espera el ALTO de la caja. Sin restar esto, cada bloque
// de texto del cartel subiría ~0,3 em respecto a la previa: nada falla, el papel
// simplemente sale descuadrado contra lo que el cliente vio en pantalla.
const ASCENDENTE = 683 / 1000;

const fuente = (negrita) => (negrita ? 'Times-Bold' : 'Times-Roman');

/**
 * Los módulos del QR, en nivel **M** y solo M.
 *
 * M repara hasta un 15 % del código y es el mismo nivel que usa el panel y la
 * app, así que los tres dibujan el mismo QR. Es el punto medio razonable para un
 * papel pegado en una pared que se va a manchar y a despegar: subir a Q o H
 * agranda la trama —más módulos en el mismo papel son módulos más chicos—, que
 * es justo lo que hace fallar a una cámara.
 */
const matrizQr = (enlace) => {
  const qr = QRCode.create(enlace, { errorCorrectionLevel: 'M' });
  return { lado: qr.modules.size, datos: qr.modules.data };
};

/**
 * Pinta la matriz ocupando el cuadrado dado, con los cuatro módulos de blanco
 * alrededor que exige la norma.
 *
 * Los módulos oscuros de una misma fila se fusionan en un solo rectángulo y todo
 * se rellena de una sola pasada. No es microoptimización: son hasta ~700
 * rectángulos por pieza y 12 piezas en la hoja de etiquetas, o sea 8400 objetos
 * si se dibujaran de a uno. Fusionar por filas los baja a unos cientos y deja el
 * PDF en un peso que se manda por WhatsApp.
 */
const dibujarQr = (doc, matriz, x, y, lado) => {
  const SILENCIO = 4;
  const modulos = matriz.lado + SILENCIO * 2;
  const paso = lado / modulos;
  doc.fillColor('#000000');
  for (let fy = 0; fy < matriz.lado; fy++) {
    let inicio = -1;
    for (let fx = 0; fx <= matriz.lado; fx++) {
      const oscuro = fx < matriz.lado && matriz.datos[fy * matriz.lado + fx];
      if (oscuro && inicio === -1) inicio = fx;
      else if (!oscuro && inicio !== -1) {
        doc.rect(
          x + (inicio + SILENCIO) * paso,
          y + (fy + SILENCIO) * paso,
          (fx - inicio) * paso,
          paso,
        );
        inicio = -1;
      }
    }
  }
  doc.fill();
};

const dibujarTexto = (doc, el) => {
  doc.font(fuente(el.negrita)).fontSize(el.tamano).fillColor(el.color);
  const espaciado = el.espaciado ? el.espaciado * el.tamano : 0;
  const opciones = espaciado ? { characterSpacing: espaciado } : {};
  el.lineas.forEach((linea, i) => {
    const txt = seguro(linea);
    // El espaciado entre letras se aplica también DESPUÉS de la última, así que
    // se descuenta o el texto queda medio carácter a la izquierda del centro.
    const anchoTexto = doc.widthOfString(txt, opciones) - espaciado;
    const baseDeLinea = el.y + el.tamano + i * el.alturaLinea;
    doc.text(txt, el.cx - anchoTexto / 2, baseDeLinea - ASCENDENTE * el.tamano, {
      ...opciones, lineBreak: false,
    });
  });
};

const dibujarEstrellas = (doc, el) => {
  // Cinco estrellas repartidas en el ancho dado. El radio sale del ancho total
  // para que la fila entera quepa siempre, sea la pieza un A4 o una etiqueta.
  const radio = el.ancho / 12;
  const separacion = el.ancho / 5;
  doc.fillColor(el.color);
  for (let i = 0; i < 5; i++) {
    const cx = el.cx - el.ancho / 2 + separacion * (i + 0.5);
    const puntos = cartel.puntosEstrella(cx, el.y + radio, radio);
    doc.moveTo(puntos[0][0], puntos[0][1]);
    for (let p = 1; p < puntos.length; p++) doc.lineTo(puntos[p][0], puntos[p][1]);
    doc.closePath();
  }
  doc.fill();
};

const dibujarPastilla = (doc, el) => {
  doc.roundedRect(el.cx - el.w / 2, el.y, el.w, el.h, el.h / 2).fill(el.relleno);
  doc.font(fuente(true)).fontSize(el.tamano).fillColor(el.color);
  const txt = seguro(el.texto);
  const anchoTexto = doc.widthOfString(txt);
  // Centrado óptico dentro de la pastilla: la mitad del alto menos medio em.
  doc.text(txt, el.cx - anchoTexto / 2, el.y + el.h / 2 - ASCENDENTE * el.tamano * 0.72, {
    lineBreak: false,
  });
};

const dibujarMarco = (doc, el) => {
  doc.roundedRect(el.x, el.y, el.w, el.h, el.r).fill(el.relleno);
  doc.roundedRect(el.x, el.y, el.w, el.h, el.r).lineWidth(el.grosor).stroke(el.trazo);
};

/** La tarjeta blanca sobre la que vive el QR, con su filo. */
const dibujarTarjetaQr = (doc, matriz, el) => {
  doc.roundedRect(el.x, el.y, el.lado, el.lado, el.lado * 0.05).fill('#FFFFFF');
  doc.roundedRect(el.x, el.y, el.lado, el.lado, el.lado * 0.05)
    .lineWidth(el.lado * 0.012).stroke(cartel.BORDE);
  dibujarQr(doc, matriz, el.x, el.y, el.lado);
};

const dibujarPieza = (doc, elementos, matriz) => {
  for (const el of elementos) {
    if (el.t === 'marco') dibujarMarco(doc, el);
    else if (el.t === 'texto') dibujarTexto(doc, el);
    else if (el.t === 'estrellas') dibujarEstrellas(doc, el);
    else if (el.t === 'pastilla') dibujarPastilla(doc, el);
    else if (el.t === 'qr') dibujarTarjetaQr(doc, matriz, el);
  }
};

/**
 * Genera la hoja A4 lista para imprimir y devuelve un Buffer.
 *
 * `formato` es una clave de `cartel.FORMATOS`; el llamador ya la validó con
 * `cartel.esFormato()`.
 */
const generarCartel = ({ formato, nombre, enlace, idioma = 'es' }) => new Promise((resolve, reject) => {
  const matriz = matrizQr(enlace);
  const hoja = cartel.hojaDe(formato);
  const doc = new PDFDocument({
    size: [hoja.ancho, hoja.alto],
    margin: 0,
    // Lo que ve el cliente en la barra del lector de PDF y en el nombre de la
    // pestaña. Sin esto pone «Untitled», que da la impresión de archivo a medio
    // hacer justo en la pieza que el dueño va a mandar a una imprenta.
    info: { Title: seguro(`Cartel de resenas - ${nombre}`), Author: 'Notoria' },
  });
  const trozos = [];
  doc.on('data', (c) => trozos.push(c));
  doc.on('end', () => resolve(Buffer.concat(trozos)));
  doc.on('error', reject);

  // `medir` es la única cosa que la maqueta no puede resolver sola. Se le pasa la
  // medición real de PDFKit, así que el corte de líneas del nombre lo decide la
  // misma fuente que va a imprimirse.
  const medir = (texto, tamano, negrita) =>
    doc.font(fuente(negrita)).fontSize(tamano).widthOfString(seguro(texto));

  const plano = cartel.componerHoja({ formato, nombre, idioma, medir });

  doc.rect(0, 0, hoja.ancho, hoja.alto).fill('#FFFFFF');
  for (const pos of plano.posiciones) {
    doc.save();
    doc.translate(pos.x, pos.y);
    dibujarPieza(doc, plano.pieza.elementos, matriz);
    doc.restore();
  }

  // Guías de corte: solo si la hoja trae más de una pieza.
  if (plano.guias.length > 0) {
    doc.save().lineWidth(0.6).dash(4, { space: 4 }).strokeColor(plano.colorGuia);
    for (const g of plano.guias) doc.moveTo(g.x1, g.y1).lineTo(g.x2, g.y2);
    doc.stroke().undash().restore();
  }

  doc.end();
});

module.exports = { generarCartel, matrizQr, dibujarQr, ASCENDENTE };
