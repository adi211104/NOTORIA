// brand-shield/src/lib/cartel.js
//
// El cartel de «déjanos tu reseña»: el papel que el dueño imprime y pega en su
// local para que el cliente escanee y opine en Google.
//
// Es la única herramienta de Notoria que **produce** reseñas. Todo lo demás
// —score, temas, alertas, progreso— mide las que ya hay. Por eso vive en la
// pestaña «Pedir reseñas» y es lo primero que se ve ahí.
//
// ## Por qué este archivo existe, y por qué es PURO
//
// El mismo cartel se dibuja en dos sitios que no comparten código: el **PDF**
// (PDFKit, en `utils/cartel.generator.js`) y la **vista previa** del panel (SVG,
// en `brand-shield-web/src/lib/cartel.js`, que es su espejo). Si cada uno
// calculara su propia maqueta, la previa y el papel se separarían — y el cliente
// se enteraría **al imprimir**, que es tarde.
//
// Así que acá no se dibuja nada: se COMPONE. `componerPieza()` devuelve una lista
// de primitivas ya resueltas —posiciones, tamaños de letra y hasta el corte de
// líneas del nombre— y cada renderizador solo las pinta. La única cosa que no se
// puede resolver acá es cuánto mide un texto, así que se recibe como función
// (`medir`): PDFKit mide su Times y el navegador mide su Georgia.
//
// ⚠️ Es el mismo patrón de espejo que `lib/planes.js` ↔ `web/src/lib/planes.js`,
// y como allá, `scripts/prueba-cartel.js` compara los dos y falla si se separan.
//
// ## Reglas del dibujo, portadas de la app Android (`qr/Cartel.kt`)
//
// · **El QR manda.** Ocupa cerca de la mitad del ancho, va sobre blanco puro y
//   con su zona de silencio completa. Lo demás se acomoda alrededor.
// · **Nada de logo encima del código.** Queda bonito y es exactamente el adorno
//   que hace que una cámara de gama baja no lea el cartel de un cliente. El
//   fallo sería mudo: el papel se ve perfecto en la pared y nadie escanea.
// · **Las estrellas son trazos, no texto.** Este backend ya se quemó con esto:
//   las fuentes estándar del PDF no tienen la estrella y PDFKit dibuja un «&» en
//   su lugar («2 reseñas de 3& o menos», impreso y colgado). Un camino de puntos
//   no depende de ninguna fuente. Ver `lib/winansi.js`.
// · **Sin sombras ni degradados**: salen distintos —o no salen— al imprimir.
// · **Todo se mide en proporción al ancho de la pieza**, así la misma maqueta
//   sirve para un A4 de pared y para una etiqueta de 7 cm.

// Una hoja A4 en puntos PDF (1 pt = 1/72"), que es la unidad del lienzo. Son las
// medidas que PDFKit da para 'A4', sin redondear: 595.28 x 841.89.
const A4_ANCHO = 595.28;
const A4_ALTO = 841.89;

// Paleta de marca, la misma del afiche y del panel.
const TINTA = '#141413';
const VERDE = '#0B7324';
const GRIS = '#5C5B57';
const GRIS_CLARO = '#9C9B96';
const BORDE = '#E4E1D6';
const CREMA = '#FAF9F5';
const DORADO = '#CA8A04';

/**
 * Los cuatro tamaños que se ofrecen, y por qué cada uno.
 *
 * ⚠️ Todos se imprimen sobre **una hoja A4**, que es el papel que existe en
 * cualquier imprenta y en cualquier impresora de casa. Los tamaños chicos salen
 * repetidos en la misma hoja con líneas de corte, en vez de mandar un PDF de
 * 10 x 15 cm que media imprenta escala mal sin avisar — y un QR reescalado con
 * los márgenes recortados es un QR que no lee.
 */
const FORMATOS = {
  MURAL: { columnas: 1, filas: 1, apaisado: false },
  MOSTRADOR: { columnas: 2, filas: 1, apaisado: true },
  MESA: { columnas: 2, filas: 2, apaisado: false },
  ETIQUETA: { columnas: 3, filas: 4, apaisado: false },
};

const ORDEN_FORMATOS = ['MURAL', 'MOSTRADOR', 'MESA', 'ETIQUETA'];

const esFormato = (id) => Object.prototype.hasOwnProperty.call(FORMATOS, id);

/** Ancho y alto de la HOJA, en puntos. */
const hojaDe = (id) => {
  const f = FORMATOS[id];
  return {
    ancho: f.apaisado ? A4_ALTO : A4_ANCHO,
    alto: f.apaisado ? A4_ANCHO : A4_ALTO,
  };
};

/** Ancho y alto de UNA pieza, en puntos. */
const piezaDe = (id) => {
  const f = FORMATOS[id];
  const hoja = hojaDe(id);
  return { ancho: hoja.ancho / f.columnas, alto: hoja.alto / f.filas };
};

const porHoja = (id) => FORMATOS[id].columnas * FORMATOS[id].filas;

/** El enlace que abre el formulario de reseña de Google. El mismo del panel. */
const enlaceResenas = (googlePlaceId) =>
  'https://search.google.com/local/writereview?placeid=' + googlePlaceId;

// ── Los textos ────────────────────────────────────────────
//
// 🔴 El pie dice «Hecho con Notoria», NO «Reseñas verificadas con Notoria», que
// es lo que dice la app Android. Notoria no verifica reseñas —las vigila, y como
// mucho marca comportamiento anómalo—, así que imprimir eso en la pared de un
// cliente es prometerle a SU cliente algo que no hacemos. Es la misma regla que
// gobierna el detector («comportamiento anómalo», nunca «esta reseña es falsa») y
// el expediente. ⚠️ La app todavía tiene la frase vieja: hay que corregirla ahí.

const TEXTOS = {
  es: {
    antetitulo: 'TU OPINIÓN NOS AYUDA',
    invitacion: '¿Nos dejas tu reseña?',
    instruccion: 'Apunta la cámara de tu celular al código',
    pastilla: 'Toma 30 segundos',
    pie: 'Hecho con Notoria · usenotoria.app',
    compacta: 'Déjanos tu reseña',
    sinNombre: 'Nuestro negocio',
    formatos: {
      MURAL: { etiqueta: 'Mural', medida: 'A4 · 21 × 29,7 cm', para: 'La pared o la puerta de entrada' },
      MOSTRADOR: { etiqueta: 'Mostrador', medida: 'A5 · 2 por hoja', para: 'La caja, la barra o la recepción' },
      MESA: { etiqueta: 'De mesa', medida: 'A6 · 4 por hoja', para: 'Las mesas o el mostrador' },
      ETIQUETA: { etiqueta: 'Etiquetas', medida: '7 × 7 cm · 12 por hoja', para: 'La cuenta, la carta o el delivery' },
    },
  },
  en: {
    antetitulo: 'YOUR OPINION HELPS US',
    invitacion: 'Would you leave us a review?',
    instruccion: 'Point your phone camera at the code',
    pastilla: 'Takes 30 seconds',
    pie: 'Made with Notoria · usenotoria.app',
    compacta: 'Leave us a review',
    sinNombre: 'Our business',
    formatos: {
      MURAL: { etiqueta: 'Wall poster', medida: 'A4 · 21 × 29.7 cm', para: 'The wall or the front door' },
      MOSTRADOR: { etiqueta: 'Counter', medida: 'A5 · 2 per sheet', para: 'The till, the bar or reception' },
      MESA: { etiqueta: 'Table', medida: 'A6 · 4 per sheet', para: 'Tables or the counter' },
      ETIQUETA: { etiqueta: 'Stickers', medida: '7 × 7 cm · 12 per sheet', para: 'The bill, the menu or delivery' },
    },
  },
};

// ── Texto: partir y encoger ───────────────────────────────

const partirEnLineas = (texto, ancho, tamano, negrita, medir) => {
  const palabras = String(texto).split(' ').filter((p) => p.length > 0);
  if (palabras.length === 0) return [String(texto)];
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual === '' ? palabra : actual + ' ' + palabra;
    // Una palabra sola que no cabe se deja pasar: partirla por la mitad se lee
    // peor que salirse un poco, y encoger más rompe la maqueta entera por un
    // nombre como «RESTAURANTECAMPESTRE».
    if (actual === '' || medir(prueba, tamano, negrita) <= ancho) actual = prueba;
    else { lineas.push(actual); actual = palabra; }
  }
  lineas.push(actual);
  return lineas;
};

/**
 * Escribe centrado, encogiendo la letra hasta que quepa en [maxLineas].
 *
 * Hace falta porque el nombre del negocio lo escribe el cliente: hay «Don Tito»
 * y hay «Corporación Gastronómica del Sur E.I.R.L. — Sede Miraflores». Sin esto
 * el segundo se sale del papel, y eso solo se ve al imprimir.
 *
 * El suelo es el 45 % del tamaño original: por debajo el texto ya no se lee de
 * lejos, así que es mejor cortar una línea que seguir bajando.
 */
const ajustar = (texto, anchoDisponible, tamanoInicial, negrita, maxLineas, medir) => {
  let tamano = tamanoInicial;
  let lineas = partirEnLineas(texto, anchoDisponible, tamano, negrita, medir);
  while (lineas.length > maxLineas && tamano > tamanoInicial * 0.45) {
    tamano *= 0.92;
    lineas = partirEnLineas(texto, anchoDisponible, tamano, negrita, medir);
  }
  return { lineas: lineas.slice(0, maxLineas), tamano };
};

/**
 * Compone un bloque de texto centrado y dice por dónde sigue el dibujo.
 *
 * ⚠️ Convención de la `y`, y hay que respetarla en los dos renderizadores: `y`
 * es el ALTO del bloque, y la línea de base de la línea i cae en
 * `y + tamano + i * alturaLinea`. En SVG eso es el atributo `y` tal cual; en
 * PDFKit hay que restarle el ascendente de la fuente.
 */
const bloqueTexto = (o) => {
  const ajuste = ajustar(o.texto, o.anchoDisponible, o.tamano, o.negrita, o.maxLineas, o.medir);
  const alturaLinea = ajuste.tamano * 1.22;
  return {
    elemento: {
      t: 'texto', lineas: ajuste.lineas, cx: o.cx, y: o.y,
      tamano: ajuste.tamano, alturaLinea, color: o.color, negrita: o.negrita,
    },
    fin: o.y + ajuste.tamano + (ajuste.lineas.length - 1) * alturaLinea + ajuste.tamano * 0.35,
  };
};

/**
 * Los diez puntos de una estrella de cinco puntas, en orden.
 *
 * Vive acá y no en cada renderizador para que la estrella del PDF y la de la
 * previa sean el mismo polígono. El 0.42 es el radio del valle: más alto engorda
 * la estrella hasta parecer una flor, más bajo la vuelve una araña.
 */
const puntosEstrella = (cx, cy, radio) => {
  const puntos = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radio : radio * 0.42;
    const angulo = -Math.PI / 2 + (i * Math.PI) / 5;
    puntos.push([cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]);
  }
  return puntos;
};

// ── La maqueta de una pieza ───────────────────────────────

/**
 * Devuelve `{ ancho, alto, elementos }` para UNA pieza del formato dado.
 *
 * `medir(texto, tamano, negrita) -> ancho en puntos` lo pone el renderizador.
 */
const componerPieza = (o) => {
  const t = TEXTOS[o.idioma] || TEXTOS.es;
  const medir = o.medir;
  const pieza = piezaDe(o.formato);
  const ancho = pieza.ancho;
  const alto = pieza.alto;
  const compacta = ancho < 220; // por debajo de ~7,7 cm: solo la etiqueta
  const margen = ancho * 0.055;
  const centro = ancho / 2;
  const interior = ancho - margen * 4;
  const nombre = String(o.nombre || '').trim() || t.sinNombre;
  const elementos = [];

  // Marco: fondo crema y un filo verde. Da el aire de «esto es un cartel» sin
  // gastar tinta en un fondo de color a sangre.
  elementos.push({
    t: 'marco', x: margen, y: margen,
    w: ancho - margen * 2, h: alto - margen * 2,
    r: ancho * 0.045, relleno: CREMA, trazo: VERDE, grosor: ancho * 0.007,
  });

  if (compacta) {
    // Etiqueta de 7 cm: nombre, QR y una línea. No entra ni una palabra más.
    const yFrase = alto - margen - alto * 0.045;
    const nom = bloqueTexto({
      texto: nombre.toUpperCase(), cx: centro, y: margen + alto * 0.06,
      anchoDisponible: interior, tamano: ancho * 0.072,
      color: TINTA, negrita: true, maxLineas: 2, medir,
    });
    elementos.push(nom.elemento);
    elementos.push({ t: 'estrellas', cx: centro, y: nom.fin, ancho: ancho * 0.22, color: DORADO });

    const arribaQr = nom.fin + ancho * 0.11;
    const hueco = (yFrase - ancho * 0.075) - arribaQr;
    const ladoQr = Math.min(ancho * 0.56, hueco);
    elementos.push({ t: 'qr', x: centro - ladoQr / 2, y: arribaQr + (hueco - ladoQr) / 2, lado: ladoQr });
    elementos.push({
      t: 'texto', lineas: [t.compacta], cx: centro, y: yFrase - ancho * 0.058,
      tamano: ancho * 0.058, alturaLinea: ancho * 0.058 * 1.22, color: VERDE, negrita: true,
    });
    return { ancho, alto, elementos };
  }

  // ── Pieza grande (mural, mostrador, de mesa) ────────────
  // Las tres son de la serie A, así que comparten la proporción 1:1,41 y les
  // sirve la misma maqueta a distinta escala.
  let y = margen + alto * 0.075;

  // Antetítulo: dice para qué es el papel antes de que nadie lea el resto.
  elementos.push({
    t: 'texto', lineas: [t.antetitulo], cx: centro, y,
    tamano: ancho * 0.031, alturaLinea: ancho * 0.031 * 1.22,
    color: GRIS_CLARO, negrita: true, espaciado: 0.18,
  });
  y += alto * 0.045;

  // El nombre del negocio, que es lo que hace que el cartel sea SUYO y no un
  // papel genérico de Google.
  const nom = bloqueTexto({
    texto: nombre, cx: centro, y, anchoDisponible: interior,
    tamano: ancho * 0.085, color: TINTA, negrita: true, maxLineas: 2, medir,
  });
  elementos.push(nom.elemento);
  y = nom.fin + alto * 0.012;

  elementos.push({ t: 'estrellas', cx: centro, y, ancho: ancho * 0.30, color: DORADO });
  y += alto * 0.055;

  const inv = bloqueTexto({
    texto: t.invitacion, cx: centro, y, anchoDisponible: interior,
    tamano: ancho * 0.068, color: VERDE, negrita: true, maxLineas: 2, medir,
  });
  elementos.push(inv.elemento);
  y = inv.fin;

  // 🔴 De acá abajo se coloca DESDE ABAJO, y el QR ocupa lo que sobre en medio.
  // Es la única forma de que un nombre de dos líneas no empuje el pie fuera del
  // papel: la maqueta encoge el código, que es lo único que aguanta perder un
  // centímetro sin dejar de leerse. Con las medidas colgando de arriba,
  // «Pollería El Rancho de Don Aurelio» tapaba el pie — y eso solo se ve
  // imprimiendo.
  const yPie = alto - margen - alto * 0.030;
  const tamanoPastilla = ancho * 0.040;
  const arribaPastilla = yPie - alto * 0.040 - tamanoPastilla * 2.2;
  const tamanoInstruccion = ancho * 0.042;
  // Se reservan DOS líneas siempre, ocupe una o dos: así la altura del bloque no
  // depende del ancho del texto y el QR no cambia de tamaño entre idiomas.
  const arribaInstruccion = arribaPastilla - alto * 0.018 - tamanoInstruccion * 1.22 * 2;

  const hueco = arribaInstruccion - y;
  const ladoQr = Math.min(ancho * 0.46, hueco - alto * 0.02);
  elementos.push({ t: 'qr', x: centro - ladoQr / 2, y: y + (hueco - ladoQr) / 2, lado: ladoQr });

  elementos.push(bloqueTexto({
    texto: t.instruccion, cx: centro, y: arribaInstruccion, anchoDisponible: interior,
    tamano: tamanoInstruccion, color: GRIS, negrita: false, maxLineas: 2, medir,
  }).elemento);

  // Pastilla verde: quita la única objeción real del cliente, que es el tiempo.
  elementos.push({
    t: 'pastilla', texto: t.pastilla, cx: centro, y: arribaPastilla,
    tamano: tamanoPastilla,
    w: medir(t.pastilla, tamanoPastilla, true) + tamanoPastilla * 2.2,
    h: tamanoPastilla * 2.2, relleno: VERDE, color: '#FFFFFF',
  });

  // Pie discreto, abajo del todo y en gris claro: es el crédito, no el mensaje.
  elementos.push({
    t: 'texto', lineas: [t.pie], cx: centro, y: yPie - ancho * 0.028,
    tamano: ancho * 0.028, alturaLinea: ancho * 0.028 * 1.22,
    color: GRIS_CLARO, negrita: false,
  });

  return { ancho, alto, elementos };
};

/**
 * La hoja entera: dónde va cada pieza y por dónde se corta.
 *
 * Las guías van punteadas y en gris claro a propósito: una línea continua se
 * sigue viendo en el papel ya cortado si la tijera se desvía un milímetro.
 */
const componerHoja = (o) => {
  const f = FORMATOS[o.formato];
  const hoja = hojaDe(o.formato);
  const pieza = componerPieza(o);
  const posiciones = [];
  for (let fila = 0; fila < f.filas; fila++) {
    for (let col = 0; col < f.columnas; col++) {
      posiciones.push({ x: col * pieza.ancho, y: fila * pieza.alto });
    }
  }
  const guias = [];
  for (let c = 1; c < f.columnas; c++) {
    guias.push({ x1: c * pieza.ancho, y1: 0, x2: c * pieza.ancho, y2: hoja.alto });
  }
  for (let r = 1; r < f.filas; r++) {
    guias.push({ x1: 0, y1: r * pieza.alto, x2: hoja.ancho, y2: r * pieza.alto });
  }
  return {
    ancho: hoja.ancho, alto: hoja.alto,
    pieza, posiciones, guias, colorGuia: BORDE,
  };
};

// ── FIN DE LA PARTE COMPARTIDA ────────────────────────────
//
// Todo lo de ARRIBA es idéntico, carácter por carácter, a
// `brand-shield-web/src/lib/cartel.js`. Lo único que cambia entre los dos
// archivos es este bloque final: acá `module.exports`, allá `export`.
//
// 🔴 Al tocar cualquier cosa de arriba hay que tocar LOS DOS archivos.
// `scripts/prueba-cartel.js` compara los dos textos y falla si se separan — sin
// eso, la vista previa del panel y el papel que se imprime irían por caminos
// distintos y el cliente lo descubriría al recoger el trabajo de la imprenta.

module.exports = {
  A4_ANCHO, A4_ALTO,
  TINTA, VERDE, GRIS, GRIS_CLARO, BORDE, CREMA, DORADO,
  FORMATOS, ORDEN_FORMATOS, TEXTOS,
  esFormato, hojaDe, piezaDe, porHoja,
  enlaceResenas, puntosEstrella, partirEnLineas, ajustar, bloqueTexto,
  componerPieza, componerHoja,
};
