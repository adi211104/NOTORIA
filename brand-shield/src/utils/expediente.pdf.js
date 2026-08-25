// brand-shield/src/utils/expediente.pdf.js
//
// La representación impresa del expediente de una reseña.
//
// Quien lo recibe es un abogado, un efectivo tomando una denuncia o el
// formulario de reporte de Google. Lo que esperan es un papel sobrio con hechos
// fechados y una fuente clara — no una infografía ni una acusación.
//
// 🔴 El tono es DESCRIPTIVO y no acusatorio, y eso no es estilo: es la regla del
// producto. El documento dice «el 14 de marzo entraron 4 reseñas» y nunca «esta
// reseña es falsa» ni «esta persona está extorsionando». Quien determina eso es
// Google o la autoridad. Un PDF con el logo de Notoria acusando de un delito a
// una persona identificable sería un problema nuestro, no del cliente.
//
// ⚠️ NADA de caracteres fuera de WinAnsi (★, →, …). Las fuentes estándar de PDF
// no los tienen y PDFKit dibuja un "&" literal en su lugar. Va el mismo
// sanitizador que la constancia y el afiche.

const PDFDocument = require('pdfkit');
const { seguro } = require('../lib/winansi');

const INK = '#141413';
const VERDE = '#0B7324';
const GRIS = '#5C5B57';
const GRIS_CLARO = '#9C9B96';
const BORDE = '#E8E6DC';
const ROJO = '#9E2019';

const EMISOR = { razon: 'NOTORIA E.I.R.L.', ruc: '20616239466', web: 'usenotoria.app' };

const fechaLarga = (d) => new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
const fechaHora = (d) => `${fechaLarga(d)}, ${new Date(d).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}`;

const generarExpediente = async (exp) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const trozos = [];
  doc.on('data', (c) => trozos.push(c));
  doc.on('end', () => resolve(Buffer.concat(trozos)));
  doc.on('error', reject);

  const M = 50;
  const ancho = doc.page.width - M * 2;
  let y = 0;

  // ── Cabecera ──────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 74).fill(INK);
  doc.rect(0, 74, doc.page.width, 3).fill(VERDE);
  doc.fillColor('#ffffff').font('Times-Bold').fontSize(20).text('Notoria', M, 22);
  doc.font('Times-Roman').fontSize(10.5).fillColor('#B0AEA5')
    .text('Expediente de reseña', M, 48);
  doc.fontSize(9).fillColor('#B0AEA5')
    .text(seguro(`Emitido el ${fechaHora(exp.emitidoEn)}`), M, 48, { width: ancho, align: 'right' });

  y = 100;
  const parrafo = (t, { size = 11, color = INK, font = 'Times-Roman', gap = 12 } = {}) => {
    doc.fillColor(color).font(font).fontSize(size)
      .text(seguro(t), M, y, { width: ancho, align: 'left', lineGap: 2.5 });
    y = doc.y + gap;
  };
  const titulo = (t) => {
    if (y > doc.page.height - 140) { doc.addPage(); y = 60; }
    doc.fillColor(VERDE).font('Times-Bold').fontSize(12.5).text(seguro(t), M, y, { width: ancho });
    y = doc.y + 7;
  };
  const dato = (etiqueta, valor) => {
    doc.fillColor(GRIS).font('Times-Roman').fontSize(10).text(seguro(etiqueta), M, y, { width: 170 });
    doc.fillColor(INK).font('Times-Bold').fontSize(11)
      .text(seguro(valor), M + 175, y, { width: ancho - 175 });
    y = Math.max(doc.y, y + 15) + 4;
  };

  // ── Qué es este documento ─────────────────────────────────
  parrafo(`${EMISOR.razon} (RUC ${EMISOR.ruc}), que opera el servicio de monitoreo de reputacion online Notoria, deja constancia de la informacion publica que registro sobre la resena identificada mas abajo, en las fechas que se indican.`);

  doc.roundedRect(M, y, ancho, 62, 6).lineWidth(1).stroke(ROJO);
  doc.fillColor(ROJO).font('Times-Bold').fontSize(9.5)
    .text('ALCANCE DE ESTE DOCUMENTO', M + 14, y + 11, { width: ancho - 28 });
  doc.fillColor(GRIS).font('Times-Roman').fontSize(9.5)
    .text(seguro('Este documento reune informacion publica de la ficha del negocio y el registro de cuando Notoria la capto. NO es un peritaje, NO constituye asesoria legal y NO afirma que la resena sea falsa ni que su autor haya cometido ninguna infraccion: eso lo determinan la plataforma o la autoridad competente.'),
      M + 14, y + 26, { width: ancho - 28, lineGap: 1.5 });
  y += 62 + 18;

  // ── El negocio ────────────────────────────────────────────
  titulo('1. Establecimiento');
  dato('Nombre', exp.negocio.nombre);
  if (exp.negocio.direccion) dato('Direccion', exp.negocio.direccion);
  if (exp.negocio.placeId) dato('Identificador Google', exp.negocio.placeId);
  y += 8;

  // ── La reseña ─────────────────────────────────────────────
  titulo('2. Resena');
  dato('Plataforma', exp.resena.plataforma);
  // La estrella derivada se declara. En Facebook no hay estrellas desde 2018 y
  // presentar como dato de la plataforma algo que calculamos acá seria falso.
  dato('Calificacion', exp.resena.sinEstrella
    ? `${exp.resena.rating} de 5 (derivada de una recomendacion; la plataforma no publica estrellas)`
    : `${exp.resena.rating} de 5`);
  dato('Publicada el', fechaLarga(exp.resena.fechaResena));
  dato('Capturada por Notoria el', fechaHora(exp.resena.capturadaEn));
  dato('Autor segun la plataforma', exp.resena.autor || 'No consignado');
  if (exp.resena.autorResenasTotal !== null) {
    dato('Resenas totales del autor', String(exp.resena.autorResenasTotal));
  }
  dato('Respondida por el negocio', exp.resena.respondida ? 'Si' : 'No');
  y += 6;

  parrafo('Texto de la resena, tal como fue capturado:', { size: 10, color: GRIS, gap: 6 });
  const texto = exp.resena.texto || '(La resena fue publicada sin texto.)';
  const altoTexto = doc.font('Times-Italic').fontSize(11).heightOfString(seguro(texto), { width: ancho - 28, lineGap: 2 }) + 24;
  doc.roundedRect(M, y, ancho, altoTexto, 6).lineWidth(1).stroke(BORDE);
  doc.fillColor(INK).font('Times-Italic').fontSize(11)
    .text(seguro(texto), M + 14, y + 12, { width: ancho - 28, lineGap: 2 });
  y += altoTexto + 16;

  // ── Contexto ──────────────────────────────────────────────
  const c = exp.contexto;
  titulo('3. Contexto en la ficha');
  parrafo(`En los ${c.ventanaDias} dias anteriores y posteriores a la fecha de publicacion, Notoria registro ${c.enVentana} resena(s) en esta ficha, de las cuales ${c.negativasEnVentana} fueron de 2 estrellas o menos.`, { size: 10.5, gap: 8 });

  if (c.conSenal > 0) {
    // ⚠️ Se dice el CONTEO y el motivo, y no se concluye nada. «Senal» y no
    // «resena falsa»: es la misma distincion que hace el detector, que habla de
    // comportamiento anomalo y nunca de falsedad.
    parrafo(`De esas resenas, ${c.conSenal} presentaron alguna senal de comportamiento anomalo segun los criterios automaticos de Notoria${c.motivos.length ? ` (${c.motivos.join('; ')})` : ''}. Una senal indica un patron a revisar; no determina que la resena sea falsa.`, { size: 10.5, gap: 8 });
  }

  if (c.antes && c.despues) {
    dato('Ficha antes', `${c.antes.rating} de 5 con ${c.antes.total} resenas (${fechaLarga(c.antes.fecha)})`);
    dato('Ficha despues', `${c.despues.rating} de 5 con ${c.despues.total} resenas (${fechaLarga(c.despues.fecha)})`);
    if (c.deltaRating !== null) {
      dato('Variacion de calificacion', `${c.deltaRating > 0 ? '+' : ''}${c.deltaRating}`);
    }
    if (c.deltaResenas !== null) {
      dato('Variacion de volumen', `${c.deltaResenas > 0 ? '+' : ''}${c.deltaResenas} resena(s)`);
    }
  } else {
    // 🔴 No hay dos mediciones: se dice, no se inventa un cero. Es la misma
    // regla que en lib/progreso.js — «no lo sabemos» y «no se movio» son
    // afirmaciones distintas, y en un documento que puede acabar en una
    // denuncia confundirlas seria grave.
    parrafo('No hay dos mediciones de la ficha alrededor de esa fecha, de modo que no es posible informar como se movio la calificacion. La ausencia de este dato no indica que no haya habido variacion.', { size: 10.5, color: GRIS, gap: 8 });
  }
  y += 6;

  // ── Qué adjuntar ──────────────────────────────────────────
  titulo('4. Que conviene adjuntar a este expediente');
  parrafo('Notoria solo ve lo publico de la ficha. Si hubo mensajes privados exigiendo un pago, son la pieza central y solo usted los tiene:', { size: 10.5, gap: 8 });
  const adjuntos = [
    'Capturas de la conversacion COMPLETA, con el nombre de usuario, la fecha y la hora visibles. El mensaje aislado no acredita a quien se dijo ni cuando.',
    'Captura del perfil de la cuenta que publico la resena.',
    'Sus registros del dia mencionado: comandas, boletas, reservas o video, si la resena describe una visita.',
    'La fecha en que reporto la resena a la plataforma, si ya lo hizo.',
  ];
  adjuntos.forEach((a) => {
    doc.fillColor(GRIS).font('Times-Roman').fontSize(10.5)
      .text(seguro(`-  ${a}`), M + 6, y, { width: ancho - 12, lineGap: 2 });
    y = doc.y + 5;
  });
  y += 12;

  // ── A dónde ir ────────────────────────────────────────────
  if (y > doc.page.height - 200) { doc.addPage(); y = 60; }
  titulo('5. Vias posibles');
  parrafo('Son puertas distintas y conviene no confundirlas. Consulte con un abogado antes de decidir.', { size: 10.5, color: GRIS, gap: 8 });
  parrafo('Ante la plataforma: reportar la resena por incumplimiento de sus politicas de contenido, adjuntando la evidencia. La plataforma no arbitra si un cliente tiene razon; retira contenido que incumple sus reglas.', { size: 10.5, gap: 8 });
  parrafo('Si un particular exige dinero: es materia penal, no de consumo. La figura que suele invocarse es la extorsion, prevista en el articulo 200 del Codigo Penal. La denuncia se presenta ante la Policia Nacional o el Ministerio Publico.', { size: 10.5, gap: 8 });
  parrafo('Si detras hay un competidor: la via es la Ley de Represion de la Competencia Desleal (Decreto Legislativo 1044), que sanciona los actos de denigracion, y se tramita ante INDECOPI.', { size: 10.5, gap: 10 });

  // ── Pie ───────────────────────────────────────────────────
  const pieY = doc.page.height - 62;
  doc.moveTo(M, pieY).lineTo(doc.page.width - M, pieY).lineWidth(1).stroke(BORDE);
  doc.fillColor(GRIS_CLARO).font('Times-Roman').fontSize(8.5)
    .text(seguro(`${EMISOR.razon} - RUC ${EMISOR.ruc} - ${EMISOR.web}. Documento generado automaticamente a partir del registro de Notoria. No constituye asesoria legal ni peritaje.`),
      M, pieY + 10, { width: ancho, align: 'center' });

  doc.end();
});

module.exports = { generarExpediente };
