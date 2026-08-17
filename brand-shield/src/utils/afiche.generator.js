// brand-shield/src/utils/afiche.generator.js
//
// El afiche de la pared: un A4 para IMPRIMIR y colgar donde trabaja el equipo.
//
// No es un reporte más. El reporte mensual (reporte.generator.js) va dirigido al
// dueño y se lee en una pantalla. Esto va dirigido al personal —cocina, salón,
// recepción— y se lee de pie, a dos metros, entre turno y turno. De ahí que sea
// una sola hoja, con tres números enormes y una frase.
//
// Por qué existe: el patrón de abandono de cualquier herramienta de monitoreo es
// que el dueño entra la primera semana, se emociona, y a los veinte días deja de
// entrar. Eso no se arregla con más notificaciones — se arregla saliendo de la
// pantalla. Un papel colgado donde trabajan quince personas hace más por el uso
// del producto que otra alerta que nadie abre.
//
// Reglas de diseño, y son las que importan:
//   · Tres cifras y ya. Un afiche con quince datos no lo lee nadie.
//   · Nada de jerga: ni "score", ni "snapshot", ni "sentimiento".
//   · Una sola cosa que hacer esta semana, escrita como una instrucción.
//   · Legible a dos metros: la cifra principal va a 96pt.

const PDFDocument = require('pdfkit');

// ⚠️ NADA de ★ (U+2605) ni de ningún carácter fuera de WinAnsi en este archivo.
//
// Las fuentes estándar de PDF (Times, Helvetica) solo cubren WinAnsi, así que
// PDFKit dibuja un "&" en su lugar — literalmente. Se vio en el primer afiche:
// "2 reseñas de 3& o menos". El reporte mensual nunca lo pisó porque no usa
// estrellas en el texto.
//
// Para meter ★ de verdad haría falta empaquetar un .ttf con la app y llamar a
// `doc.registerFont`, que es peso y mantenimiento a cambio de un adorno. En un
// papel que se lee de pie y a dos metros, "3 estrellas o menos" se entiende
// igual de bien.
//
// La red de seguridad, compartida con la constancia: si alguien vuelve a colar
// un carácter raro, desaparece en vez de imprimirse como basura en la pared de
// un cliente. Ver lib/winansi.js — ojo, WinAnsi NO es latin1.
const { seguro } = require('../lib/winansi');

// Paleta de marca, la misma del reporte mensual
const INK = '#141413';
const VERDE = '#0B7324';
const GRIS = '#5C5B57';
const GRIS_CLARO = '#9C9B96';
const BORDE = '#E8E6DC';
const AMBAR = '#B45309';
const ROJO = '#B91C1C';

const TEXTOS = {
  es: {
    eyebrow: 'ASÍ NOS VIERON ESTA SEMANA',
    rating: 'Nuestra nota en Google',
    nuevas: 'Reseñas nuevas',
    sinResponder: 'Sin responder',
    foco: 'EL FOCO DE ESTA SEMANA',
    pie: (f) => `Actualizado el ${f} · Notoria · usenotoria.app`,
    imprimir: 'Imprímelo y cuélgalo donde lo vea el equipo.',
    locale: 'es-PE',
    // El foco se elige solo, por prioridad: primero lo que está roto.
    focos: {
      fichaCerrada: 'Nuestra ficha de Google aparece CERRADA. Hay que corregirlo hoy: mientras diga eso, no salimos en el mapa.',
      criticasSinResponder: (n) => `Tenemos ${n} reseña${n === 1 ? '' : 's'} de 3 estrellas o menos sin responder. Responderlas es lo primero de la semana.`,
      ratingBajando: (d) => `Bajamos ${d} puntos desde el control anterior. Revisemos qué cambió en el servicio estos días.`,
      quejaRepetida: (q) => `La queja que más se repitió: ${q}. Es lo que hay que atacar esta semana.`,
      pocasResenas: 'Nos faltan reseñas. Cuando un cliente diga que le gustó, pidámosle la reseña en ese momento.',
      todoBien: 'Semana limpia. Mantengamos el ritmo: pedir la reseña al cliente contento sigue siendo lo que más suma.',
    },
  },
  en: {
    eyebrow: 'HOW THEY SAW US THIS WEEK',
    rating: 'Our Google rating',
    nuevas: 'New reviews',
    sinResponder: 'Unanswered',
    foco: 'THIS WEEK’S FOCUS',
    pie: (f) => `Updated on ${f} · Notoria · usenotoria.app`,
    imprimir: 'Print it and hang it where the team can see it.',
    locale: 'en-US',
    focos: {
      fichaCerrada: 'Our Google listing shows as CLOSED. Fix it today: while it says that, we do not show up on the map.',
      criticasSinResponder: (n) => `We have ${n} review${n === 1 ? '' : 's'} of 3 stars or less with no reply. Answering them is the first job of the week.`,
      ratingBajando: (d) => `We dropped ${d} points since the last check. Let us review what changed in service these days.`,
      quejaRepetida: (q) => `The most repeated complaint: ${q}. That is what to tackle this week.`,
      pocasResenas: 'We need more reviews. When a customer says they liked it, let us ask for the review right then.',
      todoBien: 'Clean week. Let us keep the pace: asking a happy customer for the review is still what helps most.',
    },
  },
};

// Palabras que delatan la queja de fondo. Se busca sobre las reseñas negativas
// de la semana y se devuelve la más repetida — es el dato que convierte el
// afiche en algo accionable en vez de un marcador.
//
// Es un diccionario y no un modelo a propósito: tiene que ser explicable al
// dueño ("salió porque cuatro reseñas dicen 'demora'") y no puede costar una
// llamada a la IA por cada afiche.
const TEMAS = [
  { clave: 'la demora en la atención', palabras: ['demor', 'lento', 'lenta', 'espera', 'tardan', 'tardó', 'tarde', 'media hora', 'una hora'] },
  { clave: 'el trato del personal', palabras: ['maleducad', 'grosero', 'grosera', 'antipát', 'mal trato', 'malcriad', 'ignoraron', 'ni saludan'] },
  { clave: 'la temperatura o el punto de la comida', palabras: ['frío', 'fria', 'frías', 'frio', 'quemad', 'crudo', 'cruda', 'recalentad'] },
  { clave: 'la limpieza', palabras: ['sucio', 'sucia', 'mugre', 'asquero', 'baño', 'cucaracha', 'mosca'] },
  { clave: 'el precio frente a lo que se recibe', palabras: ['caro', 'cara', 'precio', 'no vale', 'estafa', 'porción pequeñ', 'porcion pequeñ'] },
  { clave: 'la porción o la cantidad', palabras: ['poca cantidad', 'porción', 'porcion', 'pequeñ', 'escaso'] },
];

const quejaMasRepetida = (resenas) => {
  const conteo = new Map();
  for (const r of resenas) {
    const texto = (r.texto || '').toLowerCase();
    if (!texto) continue;
    for (const tema of TEMAS) {
      if (tema.palabras.some((p) => texto.includes(p))) {
        conteo.set(tema.clave, (conteo.get(tema.clave) || 0) + 1);
      }
    }
  }
  if (!conteo.size) return null;
  const [clave, veces] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
  // Con una sola mención no es "lo que más se repite", es una opinión suelta.
  return veces >= 2 ? clave : null;
};

/**
 * Elige LA cosa de la semana. El orden es la parte importante: primero lo que
 * está roto, después lo que se puede mejorar, y solo al final el "vamos bien".
 * Devolver varias cosas sería devolver ninguna.
 */
const elegirFoco = (t, datos) => {
  const { fichaCerrada, criticasSinResponder, caidaRating, negativas, totalResenas } = datos;
  if (fichaCerrada) return { texto: t.focos.fichaCerrada, color: ROJO };
  if (criticasSinResponder > 0) return { texto: t.focos.criticasSinResponder(criticasSinResponder), color: ROJO };
  if (caidaRating >= 0.1) return { texto: t.focos.ratingBajando(caidaRating.toFixed(1)), color: AMBAR };
  const queja = quejaMasRepetida(negativas);
  if (queja) return { texto: t.focos.quejaRepetida(queja), color: AMBAR };
  if (totalResenas < 50) return { texto: t.focos.pocasResenas, color: VERDE };
  return { texto: t.focos.todoBien, color: VERDE };
};

/**
 * Genera el PDF y devuelve un Buffer.
 *
 * `datos`: { rating, totalResenas, nuevasSemana, criticasSinResponder,
 *            caidaRating, fichaCerrada, negativas: [{texto}] }
 */
const generarAfiche = (negocio, datos, idioma = 'es') => new Promise((resolve, reject) => {
  const t = TEXTOS[idioma] || TEXTOS.es;
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const trozos = [];
  doc.on('data', (c) => trozos.push(c));
  doc.on('end', () => resolve(Buffer.concat(trozos)));
  doc.on('error', reject);

  const W = doc.page.width;   // 595
  const M = 48;               // margen visual
  const ancho = W - M * 2;

  // ── Cabecera ──
  doc.rect(0, 0, W, 96).fill(INK);
  doc.fillColor('#FFFFFF').font('Times-Bold').fontSize(26).text(seguro('Notoria'), M, 32);
  doc.fillColor(GRIS_CLARO).font('Times-Roman').fontSize(10)
    .text(seguro(t.eyebrow), M, 66, { characterSpacing: 1.6 });

  // ── Nombre del negocio ──
  doc.fillColor(INK).font('Times-Bold').fontSize(22)
    .text(seguro(negocio.nombre), M, 128, { width: ancho, align: 'center' });

  // ── La cifra grande ──
  // 96pt para que se lea desde el otro lado de la cocina. Es el único número que
  // alguien va a mirar de pasada, así que se lleva todo el peso visual.
  const rating = typeof datos.rating === 'number' && datos.rating > 0 ? datos.rating.toFixed(1) : '—';
  const colorRating = datos.rating >= 4.5 ? VERDE : datos.rating >= 4 ? AMBAR : ROJO;
  doc.fillColor(colorRating).font('Times-Bold').fontSize(96)
    .text(seguro(`${rating}`), M, 178, { width: ancho, align: 'center' });
  doc.fillColor(GRIS).font('Times-Roman').fontSize(13)
    .text(seguro(t.rating), M, 288, { width: ancho, align: 'center' });

  // ── Dos cifras de apoyo ──
  const yCaja = 330;
  const anchoCaja = (ancho - 16) / 2;
  const cajas = [
    { valor: String(datos.nuevasSemana ?? 0), etiqueta: t.nuevas, color: INK },
    {
      valor: String(datos.criticasSinResponder ?? 0),
      etiqueta: t.sinResponder,
      color: (datos.criticasSinResponder ?? 0) > 0 ? ROJO : VERDE,
    },
  ];
  cajas.forEach((c, i) => {
    const x = M + i * (anchoCaja + 16);
    doc.roundedRect(x, yCaja, anchoCaja, 96, 10).lineWidth(1).stroke(BORDE);
    doc.fillColor(c.color).font('Times-Bold').fontSize(40)
      .text(seguro(c.valor), x, yCaja + 20, { width: anchoCaja, align: 'center' });
    doc.fillColor(GRIS).font('Times-Roman').fontSize(11)
      .text(seguro(c.etiqueta), x, yCaja + 70, { width: anchoCaja, align: 'center' });
  });

  // ── El foco de la semana ──
  const foco = elegirFoco(t, {
    fichaCerrada: !!datos.fichaCerrada,
    criticasSinResponder: datos.criticasSinResponder ?? 0,
    caidaRating: datos.caidaRating ?? 0,
    negativas: datos.negativas || [],
    totalResenas: datos.totalResenas ?? 0,
  });

  const yFoco = 462;
  doc.roundedRect(M, yFoco, ancho, 150, 12).fill('#FAF9F5');
  // Franja de color a la izquierda: dice de un vistazo si esto es una urgencia
  doc.rect(M, yFoco, 5, 150).fill(foco.color);
  doc.fillColor(foco.color).font('Times-Bold').fontSize(10)
    .text(seguro(t.foco), M + 26, yFoco + 22, { characterSpacing: 1.4 });
  doc.fillColor(INK).font('Times-Roman').fontSize(17)
    .text(seguro(foco.texto), M + 26, yFoco + 46, { width: ancho - 52, lineGap: 5 });

  // ── Pie ──
  const fecha = new Date().toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  doc.fillColor(GRIS_CLARO).font('Times-Roman').fontSize(9)
    .text(seguro(t.pie(fecha)), M, doc.page.height - 64, { width: ancho, align: 'center' });

  doc.end();
});

module.exports = { generarAfiche, quejaMasRepetida, elegirFoco, TEMAS };
