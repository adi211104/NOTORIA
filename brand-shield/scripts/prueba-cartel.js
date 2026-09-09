// brand-shield/scripts/prueba-cartel.js
//
// Pruebas del cartel de reseñas (lib/cartel.js + utils/cartel.generator.js).
//
// Casi todas son sobre cosas que **no dan ninguna señal al romperse**, que es lo
// único que justifica una prueba acá:
//
//  · Si el espejo del panel se separa del backend, la vista previa y el papel se
//    van por caminos distintos y el cliente lo descubre al recoger el trabajo de
//    la imprenta. Nada falla antes.
//  · Si un módulo del QR queda por debajo del tamaño que lee una cámara, el
//    cartel se ve perfecto colgado en la pared y **nadie escanea**. Es el fallo
//    más caro de todos porque parece que el producto funciona.
//  · Si un elemento se sale de la pieza, se imprime cortado — y eso solo se ve
//    imprimiendo, que es tarde.
//  · Si vuelve a colarse un carácter fuera de WinAnsi, PDFKit dibuja un «&» y
//    sale impreso, como ya pasó con el afiche.
//
// Correrla al tocar la maqueta, los formatos o el generador:
//   node scripts/prueba-cartel.js

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const cartel = require('../src/lib/cartel');
const { generarCartel, matrizQr } = require('../src/utils/cartel.generator');
const { seguro } = require('../src/lib/winansi');

const RAIZ = path.join(__dirname, '..');
let ok = 0;
let fallos = 0;

const titulo = (t) => console.log(`\n── ${t}`);
const check = (que, condicion, detalle = '') => {
  if (condicion) { ok++; console.log(`  ✓ ${que}`); } else {
    fallos++; console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ''}`);
  }
};

// Medidor de mentira, estable y sin fuentes: sirve para todo lo que es geometría.
// Donde hace falta la medición REAL (el PDF), se usa la de PDFKit.
const medirFalso = (texto, tamano, negrita) =>
  String(texto).length * tamano * (negrita ? 0.55 : 0.5);

const ENLACE = cartel.enlaceResenas('ChIJN1t_tDeuEmsRUsoyG83frY4');
const NOMBRE = 'Salón de Belleza Rosita';
// El nombre más hostil que puede escribir un cliente: largo, con tilde, con
// guion largo y con una palabra impartible.
const NOMBRE_HOSTIL = 'Corporación Gastronómica del Sur E.I.R.L. — Sede RESTAURANTECAMPESTRE';

// ── 1. Los formatos ───────────────────────────────────────

titulo('1. Los cuatro formatos y sus medidas');

check('hay exactamente cuatro formatos', cartel.ORDEN_FORMATOS.length === 4);
check('ORDEN_FORMATOS y FORMATOS declaran los mismos',
  cartel.ORDEN_FORMATOS.every((f) => cartel.FORMATOS[f])
  && Object.keys(cartel.FORMATOS).length === cartel.ORDEN_FORMATOS.length);
check('esFormato() acepta los cuatro', cartel.ORDEN_FORMATOS.every(cartel.esFormato));
// Falla CERRADO: un formato inventado no puede colarse en la ruta.
check('esFormato() rechaza lo que no está en la tabla',
  !cartel.esFormato('MURALES') && !cartel.esFormato('') && !cartel.esFormato('../etc'));
// 🔴 Control del control: `esFormato` se escribió con hasOwnProperty justo para
// esto. Con un `in` o un `FORMATOS[id] !== undefined`, 'constructor' pasaría.
check('esFormato() no se cuela por el prototipo (constructor, toString)',
  !cartel.esFormato('constructor') && !cartel.esFormato('toString'));

for (const f of cartel.ORDEN_FORMATOS) {
  const hoja = cartel.hojaDe(f);
  const lados = [hoja.ancho, hoja.alto].sort((a, b) => a - b);
  check(`${f}: la hoja es un A4 (girado o no)`,
    Math.abs(lados[0] - cartel.A4_ANCHO) < 0.01 && Math.abs(lados[1] - cartel.A4_ALTO) < 0.01,
    `${hoja.ancho}x${hoja.alto}`);
}

check('MURAL es una pieza por hoja', cartel.porHoja('MURAL') === 1);
check('MOSTRADOR son 2 por hoja', cartel.porHoja('MOSTRADOR') === 2);
check('MESA son 4 por hoja', cartel.porHoja('MESA') === 4);
check('ETIQUETA son 12 por hoja', cartel.porHoja('ETIQUETA') === 12);

// Las piezas tienen que salir de dividir la hoja exacta, o quedan franjas de
// papel sin usar entre las líneas de corte.
for (const f of cartel.ORDEN_FORMATOS) {
  const hoja = cartel.hojaDe(f);
  const pieza = cartel.piezaDe(f);
  const cfg = cartel.FORMATOS[f];
  check(`${f}: las piezas cubren la hoja entera`,
    Math.abs(pieza.ancho * cfg.columnas - hoja.ancho) < 0.001
    && Math.abs(pieza.alto * cfg.filas - hoja.alto) < 0.001);
}

// La etiqueta se anuncia como «7 × 7 cm» en los dos idiomas: que sea verdad.
const etiqueta = cartel.piezaDe('ETIQUETA');
check('la etiqueta mide de verdad ~7 cm (lo que promete su texto)',
  Math.abs(etiqueta.ancho / 72 * 2.54 - 7) < 0.3 && Math.abs(etiqueta.alto / 72 * 2.54 - 7) < 0.5,
  `${(etiqueta.ancho / 72 * 2.54).toFixed(1)} x ${(etiqueta.alto / 72 * 2.54).toFixed(1)} cm`);

// ── 2. El enlace ──────────────────────────────────────────

titulo('2. El enlace de reseñas');

check('apunta al formulario de reseña de Google',
  ENLACE === 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
// El panel arma el mismo enlace a mano en la ficha; si alguno cambiara, el QR
// llevaría a un sitio distinto del botón de al lado.
const paginaFicha = fs.readFileSync(
  path.join(RAIZ, '..', 'brand-shield-web', 'src', 'app', 'dashboard', 'negocios', '[id]', 'page.js'), 'utf8');
check('el panel usa el MISMO enlace que el cartel',
  paginaFicha.includes('https://search.google.com/local/writereview?placeid='));

// ── 3. Nada se sale de la pieza ───────────────────────────

titulo('3. Ningún elemento se sale del papel');

const limites = (el) => {
  if (el.t === 'marco') return { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h };
  if (el.t === 'qr') return { x1: el.x, y1: el.y, x2: el.x + el.lado, y2: el.y + el.lado };
  if (el.t === 'pastilla') return { x1: el.cx - el.w / 2, y1: el.y, x2: el.cx + el.w / 2, y2: el.y + el.h };
  if (el.t === 'estrellas') {
    const radio = el.ancho / 12;
    return { x1: el.cx - el.ancho / 2, y1: el.y, x2: el.cx + el.ancho / 2, y2: el.y + radio * 2 };
  }
  // Texto: el alto va de la primera línea de base menos el cuerpo, a la última
  // más un descendente. El ancho se estima con el medidor.
  const anchoMax = Math.max(...el.lineas.map((l) => medirFalso(l, el.tamano, el.negrita)));
  const ultima = el.y + el.tamano + (el.lineas.length - 1) * el.alturaLinea;
  return { x1: el.cx - anchoMax / 2, y1: el.y, x2: el.cx + anchoMax / 2, y2: ultima + el.tamano * 0.25 };
};

for (const nombre of [NOMBRE, NOMBRE_HOSTIL, 'A', '']) {
  for (const f of cartel.ORDEN_FORMATOS) {
    const plano = cartel.componerPieza({ formato: f, nombre, idioma: 'es', medir: medirFalso });
    const fuera = plano.elementos
      .map((el) => ({ el, b: limites(el) }))
      .filter(({ b }) => b.x1 < -0.5 || b.y1 < -0.5 || b.x2 > plano.ancho + 0.5 || b.y2 > plano.alto + 0.5);
    check(`${f} con «${(nombre || '(vacío)').slice(0, 22)}»: todo dentro del papel`,
      fuera.length === 0,
      fuera.map(({ el, b }) => `${el.t} y2=${b.y2.toFixed(1)}/${plano.alto.toFixed(1)}`).join(', '));
  }
}

// El QR nunca puede solaparse con el pie ni con la pastilla: si se le monta algo
// encima, el código deja de leer y el cartel es papel gastado.
for (const nombre of [NOMBRE, NOMBRE_HOSTIL]) {
  for (const f of cartel.ORDEN_FORMATOS) {
    const plano = cartel.componerPieza({ formato: f, nombre, idioma: 'es', medir: medirFalso });
    const qr = limites(plano.elementos.find((e) => e.t === 'qr'));
    const encima = plano.elementos
      .filter((e) => e.t !== 'qr' && e.t !== 'marco')
      .map(limites)
      .filter((b) => b.x1 < qr.x2 && b.x2 > qr.x1 && b.y1 < qr.y2 && b.y2 > qr.y1);
    check(`${f} con «${nombre.slice(0, 18)}»: nada se monta sobre el QR`, encima.length === 0);
  }
}

// ── 4. El QR se puede escanear de verdad ──────────────────

titulo('4. El QR es escaneable en los cuatro tamaños');

const matriz = matrizQr(ENLACE);
check('la matriz sale en la versión chica que corresponde al enlace',
  matriz.lado === 37, `lado=${matriz.lado}`);
check('la matriz trae un dato por módulo', matriz.datos.length === matriz.lado * matriz.lado);

// 🔴 El umbral de verdad: por debajo de ~0,4 mm por módulo la cámara de un
// celular de gama baja falla a distancia de brazo. Es el número que decide si
// este producto sirve o solo se ve bien.
const MODULO_MINIMO_MM = 0.4;
for (const f of cartel.ORDEN_FORMATOS) {
  const plano = cartel.componerPieza({ formato: f, nombre: NOMBRE_HOSTIL, idioma: 'es', medir: medirFalso });
  const qr = plano.elementos.find((e) => e.t === 'qr');
  // El lado del cuadro incluye la zona de silencio de 4 módulos por banda.
  const mmPorModulo = (qr.lado / 72 * 25.4) / (matriz.lado + 8);
  check(`${f}: cada módulo mide ${mmPorModulo.toFixed(2)} mm (≥ ${MODULO_MINIMO_MM})`,
    mmPorModulo >= MODULO_MINIMO_MM);
}

// La zona de silencio no es decorativa: sin ella muchos lectores no encuentran
// el código. Se comprueba sobre el dibujo real, contando rectángulos.
const rectsDe = (lado) => {
  const dibujados = [];
  const doc = { fillColor() { return this; }, rect(x, y, w, h) { dibujados.push({ x, y, w, h }); return this; }, fill() { return this; } };
  require('../src/utils/cartel.generator').dibujarQr(doc, matriz, 0, 0, lado);
  return dibujados;
};
const rects100 = rectsDe(100);
const paso100 = 100 / (matriz.lado + 8);
check('el dibujo deja la zona de silencio de 4 módulos por los cuatro lados',
  rects100.every((r) => r.x >= paso100 * 4 - 0.001 && r.y >= paso100 * 4 - 0.001
    && r.x + r.w <= 100 - paso100 * 4 + 0.001 && r.y + r.h <= 100 - paso100 * 4 + 0.001));
check('los módulos de una fila se fusionan (menos rectángulos que módulos oscuros)',
  rects100.length < Array.from(matriz.datos).filter(Boolean).length,
  `${rects100.length} rects para ${Array.from(matriz.datos).filter(Boolean).length} módulos`);
// Control: que la fusión no haya PERDIDO área. La suma tiene que dar los módulos
// oscuros exactos, o el código quedaría con agujeros y no leería.
const areaEsperada = Array.from(matriz.datos).filter(Boolean).length * paso100 * paso100;
const areaDibujada = rects100.reduce((s, r) => s + r.w * r.h, 0);
check('la fusión conserva el área exacta de los módulos oscuros',
  Math.abs(areaDibujada - areaEsperada) < 0.01,
  `${areaDibujada.toFixed(3)} vs ${areaEsperada.toFixed(3)}`);

// ── 5. WinAnsi: nada que PDFKit dibuje como «&» ───────────

titulo('5. Los textos del cartel sobreviven a WinAnsi');

for (const idioma of ['es', 'en']) {
  const t = cartel.TEXTOS[idioma];
  const cadenas = [t.antetitulo, t.invitacion, t.instruccion, t.pastilla, t.pie, t.compacta, t.sinNombre];
  check(`${idioma}: ningún texto pierde caracteres al pasar por seguro()`,
    cadenas.every((c) => seguro(c) === c),
    cadenas.filter((c) => seguro(c) !== c).join(' | '));
  // 🔴 La estrella U+2605 es justo la que ya salió impresa como «&» en el afiche.
  check(`${idioma}: no hay estrellas de texto en ninguna cadena`,
    !cadenas.some((c) => /[★☆✩✪⭐]/.test(c)));
}
check('los dos idiomas declaran las mismas claves',
  JSON.stringify(Object.keys(cartel.TEXTOS.es).sort()) === JSON.stringify(Object.keys(cartel.TEXTOS.en).sort()));
check('los dos idiomas describen los cuatro formatos',
  cartel.ORDEN_FORMATOS.every((f) => cartel.TEXTOS.es.formatos[f]?.etiqueta && cartel.TEXTOS.en.formatos[f]?.etiqueta));

// 🔴 El pie NO puede prometer que Notoria verifica reseñas: no lo hace. Va
// impreso en la pared de un cliente y lo lee SU cliente. Misma regla que el
// detector («comportamiento anómalo», nunca «esta reseña es falsa»).
check('el pie no afirma que Notoria verifique reseñas',
  !/verificad|verified/i.test(cartel.TEXTOS.es.pie + cartel.TEXTOS.en.pie),
  `${cartel.TEXTOS.es.pie} / ${cartel.TEXTOS.en.pie}`);
check('el pie sí lleva el dominio, que es para lo que existe',
  cartel.TEXTOS.es.pie.includes('usenotoria.app') && cartel.TEXTOS.en.pie.includes('usenotoria.app'));

// ── 6. El espejo del panel ────────────────────────────────

titulo('6. El espejo del panel no se ha separado del backend');

// 🔴 Esta es la prueba que sostiene el diseño entero. La vista previa del panel
// dibuja LAS MISMAS primitivas que el PDF porque importa una copia literal de
// lib/cartel.js. El día que alguien toque una y no la otra, la previa deja de
// decir la verdad sobre lo que va a salir de la impresora — y no falla nada.
const MARCA = '// ── FIN DE LA PARTE COMPARTIDA';
const rutaEspejo = path.join(RAIZ, '..', 'brand-shield-web', 'src', 'lib', 'cartel.js');
const textoBackend = fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'cartel.js'), 'utf8');
const textoEspejo = fs.readFileSync(rutaEspejo, 'utf8');

check('el backend lleva la marca de fin de la parte compartida', textoBackend.includes(MARCA));
check('el espejo lleva la marca de fin de la parte compartida', textoEspejo.includes(MARCA));

const compartidoBackend = textoBackend.split(MARCA)[0];
const compartidoEspejo = textoEspejo.split(MARCA)[0];
check('la parte compartida es idéntica carácter por carácter',
  compartidoBackend === compartidoEspejo,
  compartidoBackend.length === compartidoEspejo.length
    ? 'mismo largo pero distinto contenido'
    : `${compartidoBackend.length} vs ${compartidoEspejo.length} caracteres`);

// Control de la sonda: si la comparación fuera trivialmente cierta (por ejemplo
// porque `split` devolviera vacío en los dos), esto la pondría en rojo.
check('CONTROL: la parte compartida no está vacía', compartidoBackend.length > 3000,
  `${compartidoBackend.length} caracteres`);
// ⚠️ Se busca la ASIGNACIÓN al principio de línea, no la cadena: los dos
// archivos se mencionan mutuamente en sus comentarios, así que un `includes`
// daba rojo por un comentario correcto.
check('el espejo exporta con `export` y no con module.exports',
  /\bexport\s*\{/.test(textoEspejo) && !/^module\.exports\s*=/m.test(textoEspejo));
check('el backend sí exporta con module.exports',
  /^module\.exports\s*=/m.test(textoBackend));
check('el espejo exporta todo lo que el panel usa',
  ['componerPieza', 'puntosEstrella', 'ORDEN_FORMATOS', 'TEXTOS', 'porHoja', 'BORDE']
    .every((n) => new RegExp(`\\b${n}\\b`).test(textoEspejo.split(MARCA)[1] || '')));

// ── 7. El PDF de verdad ───────────────────────────────────

titulo('7. El PDF sale, y sale con lo que tiene que llevar');

const comprobarPdf = async () => {
  for (const f of cartel.ORDEN_FORMATOS) {
    const pdf = await generarCartel({ formato: f, nombre: NOMBRE, enlace: ENLACE, idioma: 'es' });
    check(`${f}: el PDF es un PDF`, pdf.slice(0, 5).toString() === '%PDF-');
    // Un PDF que se manda por WhatsApp no puede pesar megas.
    check(`${f}: pesa menos de 150 KB (${(pdf.length / 1024).toFixed(1)} KB)`, pdf.length < 150 * 1024);
    const hoja = cartel.hojaDe(f);
    // El MediaBox es lo que decide el tamaño de papel al imprimir: si sale mal,
    // la impresora escala «para ajustar» y el QR pierde su zona de silencio.
    const cajas = pdf.toString('latin1').match(/\/MediaBox \[([^\]]+)\]/);
    check(`${f}: el MediaBox declara la hoja correcta`,
      !!cajas && Math.abs(parseFloat(cajas[1].split(' ')[2]) - hoja.ancho) < 0.5
      && Math.abs(parseFloat(cajas[1].split(' ')[3]) - hoja.alto) < 0.5,
      cajas ? cajas[1] : 'sin MediaBox');
  }

  // 🔴 El texto de un PDF NO se puede buscar en el buffer crudo: PDFKit comprime
  // los flujos de contenido. La primera versión de estas pruebas lo hacía, y
  // «el nombre aparece en el PDF» pasaba **por el motivo equivocado** — lo
  // encontraba en el título del documento (que va en claro en el diccionario de
  // información), no en el papel. O sea que la comprobación no podía fallar
  // aunque el cartel saliera en blanco. Es el «404 de control» de siempre: ante
  // un verde, preguntar si la sonda sabe ponerse en roja.
  const textoDelPdf = (pdf) => {
    const bruto = pdf.toString('latin1');
    let salida = '';
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(bruto)) !== null) {
      const fin = bruto.indexOf('endstream', m.index);
      if (fin === -1) continue;
      const crudo = Buffer.from(bruto.slice(m.index + m[0].length, fin), 'latin1');
      try { salida += zlib.inflateSync(crudo).toString('latin1'); } catch { /* no es Flate */ }
    }
    // ⚠️ Y la segunda trampa, en dos capas. PDFKit no escribe el texto entre
    // paréntesis sino como cadenas HEX con el operador TJ, y además **parte cada
    // palabra donde hay kerning**, metiendo el ajuste entre medias:
    //
    //   [<54> 92 <6f6d6120333020736567756e646f73> 0] TJ     ← «Toma 30 segundos»
    //
    // Así que hay que reconstruir cada TJ juntando SOLO sus trozos hex y tirando
    // los números. Sin esto, buscar «Toma 30 segundos» daba cero **con la frase
    // perfectamente impresa** — y por eso la comprobación de que el cartel en
    // inglés no deja frases en español pasaba por el motivo equivocado.
    // WinAnsi es de un byte por carácter, así que latin1 basta.
    return salida.replace(/\[([^\]]*)\]\s*TJ/g, (_, cuerpo) => (
      (cuerpo.match(/<[0-9a-fA-F]*>/g) || [])
        .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
        .join('')
    ));
  };

  const conNombre = await generarCartel({ formato: 'MURAL', nombre: 'Rosita', enlace: ENLACE, idioma: 'es' });
  const dibujado = textoDelPdf(conNombre);
  // Control del extractor: si no supiera descomprimir, todo lo de abajo daría
  // verde en falso o rojo en falso sin decir por qué.
  check('CONTROL: el extractor reconstruye texto real del PDF (no solo bytes)',
    dibujado.length > 200 && dibujado.includes('Rosita'), `${dibujado.length} caracteres`);
  // El nombre del negocio tiene que ir DENTRO del dibujo: es lo que hace que el
  // cartel sea suyo y no un papel genérico de Google.
  check('el nombre del negocio se dibuja en la página', dibujado.includes('Rosita'));
  check('el antetítulo y el pie también se dibujan',
    dibujado.includes('TU OPINI') && dibujado.includes('usenotoria.app'));

  // Los dos idiomas producen documentos distintos: si no, el inglés no llegó.
  const es = await generarCartel({ formato: 'MURAL', nombre: NOMBRE, enlace: ENLACE, idioma: 'es' });
  const en = await generarCartel({ formato: 'MURAL', nombre: NOMBRE, enlace: ENLACE, idioma: 'en' });
  check('el cartel en inglés no es el mismo documento que el español', !es.equals(en));
  check('el cartel en inglés lleva SUS frases', textoDelPdf(en).includes('Takes 30 seconds'));
  check('el cartel en inglés no deja frases en español',
    !textoDelPdf(en).includes('Toma 30 segundos'));

  // Un idioma desconocido no puede reventar: cae al español.
  const raro = await generarCartel({ formato: 'MURAL', nombre: NOMBRE, enlace: ENLACE, idioma: 'pt' });
  check('un idioma desconocido cae al español en vez de fallar',
    raro.slice(0, 5).toString() === '%PDF-' && textoDelPdf(raro).includes('Toma 30 segundos'));

  // Un nombre vacío da el texto de reserva, no un cartel mudo.
  const sinNombre = await generarCartel({ formato: 'MURAL', nombre: '   ', enlace: ENLACE, idioma: 'es' });
  check('un nombre vacío usa el texto de reserva',
    textoDelPdf(sinNombre).includes('Nuestro negocio'));

  // El caso que rompía la maqueta en la app: el pie empujado fuera del papel.
  const hostil = await generarCartel({ formato: 'MURAL', nombre: NOMBRE_HOSTIL, enlace: ENLACE, idioma: 'es' });
  check('un nombre larguísimo no revienta el PDF', hostil.slice(0, 5).toString() === '%PDF-');
};

// ── 8. La ruta ────────────────────────────────────────────

titulo('8. La ruta del panel está cableada y valida lo que recibe');

const rutaNegocios = fs.readFileSync(path.join(RAIZ, 'src', 'api', 'routes', 'negocio.routes.js'), 'utf8');
check('la ruta /cartel.pdf existe', rutaNegocios.includes("router.get('/:id/cartel.pdf'"));
check('valida el formato con esFormato antes de usarlo',
  /cartel(Lib)?\.esFormato\(/.test(rutaNegocios));
// 🔴 Sin esto, `?formato=../../algo` acabaría en el Content-Disposition.
check('el formato entra en el nombre del archivo SOLO tras validarse',
  rutaNegocios.indexOf('esFormato') < rutaNegocios.indexOf('Notoria-cartel-'));
check('responde 409 con tipo propio si no hay ficha de Google',
  rutaNegocios.includes('SIN_FICHA_GOOGLE'));
check('filtra por dondeNegocio (alcance de equipo y pertenencia)',
  /cartel\.pdf'[\s\S]{0,2500}?dondeNegocio\(req/.test(rutaNegocios));
// El cartel es lo único que PRODUCE reseñas: cerrarlo por plan le quitaría al
// cliente nuevo justo lo que le sirve la primera semana.
check('NO lleva verificarPlan (es para todos los planes, a propósito)',
  !/cartel\.pdf',\s*verificarPlan/.test(rutaNegocios));

const componente = fs.readFileSync(
  path.join(RAIZ, '..', 'brand-shield-web', 'src', 'components', 'CartelResenas.js'), 'utf8');
check('el panel pide el PDF con las cabeceras de sesión (incluye X-Cuenta)',
  componente.includes('cabecerasAuth()'));
// ⚠️ Un fallo al descargar tiene que decirse. Un botón que no hace nada se lee
// como «el producto está roto», que es peor que el error.
check('el panel avisa si la descarga falla', componente.includes("'error'") && /cartelError/.test(componente));
check('el panel dibuja desde lib/cartel y no con su propia maqueta',
  componente.includes("from '../lib/cartel'") && componente.includes('componerPieza'));
check('la pestaña «Pedir reseñas» monta el bloque', paginaFicha.includes('<CartelResenas'));
check('los textos del bloque están en los DOS idiomas',
  (paginaFicha.match(/cartelDescargar:/g) || []).length === 2
  && (paginaFicha.match(/cartelPorHoja:/g) || []).length === 2);

// ── Cierre ────────────────────────────────────────────────

comprobarPdf().then(() => {
  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones correctas, ${fallos} fallos`);
  process.exit(fallos === 0 ? 1 && 0 : 1);
}).catch((e) => {
  console.error('\n❌ La generación del PDF lanzó:', e);
  process.exit(1);
});
