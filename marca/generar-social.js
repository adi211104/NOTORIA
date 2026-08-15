// Piezas para redes sociales de Notoria, 1080x1350 PNG. Se usan para publicar y
// como material de la publicación que sale en el screencast del App Review.
//
//   node marca/generar-social.js
//
// ⚠️ EL FORMATO ES 4:5 VERTICAL, NO CUADRADO, y no es una preferencia estética.
// La primera versión salió a 1080x1080 y en la cuadrícula del perfil Instagram
// la recortó por los lados: el titular empezaba en el margen izquierdo y se leía
// "e enteras de la" en vez de "Te enteras de la". Instagram ya no muestra las
// miniaturas cuadradas, las encaja en una celda vertical y descarta los lados.
// Con 4:5 la celda coincide con la pieza y no se pierde nada. Además ocupa más
// alto en el feed, que es el motivo por el que la propia plataforma lo prefiere.
//
// El margen lateral (MARGEN) está más adentro de lo que pediría el diseño por lo
// mismo: deja aire por si algún día vuelven a cambiar el recorte.
//
// Se compone en SVG y se rasteriza con `sharp`. La cabecera de
// `generar-logos.py` decía que no había rasterizador SVG en la máquina y por eso
// aquel dibuja polígonos con Pillow a 4x; `sharp` viene con el frontend, así que
// aquí sí hay tipografía de verdad.
//
// ⚠️ La N NO se redibuja a ojo: son las mismas coordenadas normalizadas de
// `generar-logos.py`. Si esa geometría cambia, cambiarla en los dos sitios o la
// familia se desalinea. El bisel invertido del asta derecha es toda la identidad
// de la marca — ver la cabecera de aquel script.

const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'brand-shield-web', 'node_modules', 'sharp'));

const VERDE = '#0B7324';
const VERDE_CLARO = '#4CAF66';
const OSCURO = '#141413';
const CREMA = '#FAF9F5';

const ANCHO = 1080;
const ALTO = 1350;
const MARGEN = 96;
const ANCHO_UTIL = ANCHO - MARGEN * 2;
const SALIDA = __dirname;

const SERIF = "Georgia, 'Times New Roman', serif";

// ── La N, igual que en generar-logos.py ───────────────────
const PROPORCION = 0.879;
const [XLI, XLD, XRI, XRD] = [0.0, 0.245, 0.755, 1.0];
const [TAPA_IZQ, BASE, TAPA_DER, BISEL] = [0.198, 1.0, 0.0, 0.220];

const eneN = (cx, cy, alto, color) => {
  const an = alto * PROPORCION;
  const x0 = cx - an / 2;
  const y0 = cy - alto / 2;
  const X = (u) => (x0 + u * an).toFixed(2);
  const Y = (v) => (y0 + v * alto).toFixed(2);
  const poly = (pts) => `<polygon points="${pts}" fill="${color}"/>`;
  return [
    poly(`${X(XLI)},${Y(TAPA_IZQ)} ${X(XLD)},${Y(TAPA_IZQ)} ${X(XLD)},${Y(BASE)} ${X(XLI)},${Y(BASE)}`),
    poly(`${X(XLI)},${Y(TAPA_IZQ)} ${X(XLD)},${Y(TAPA_IZQ)} ${X(XRD)},${Y(BASE)} ${X(XRI)},${Y(BASE)}`),
    poly(`${X(XRI)},${Y(BASE)} ${X(XRI)},${Y(BISEL)} ${X(XRD)},${Y(TAPA_DER)} ${X(XRD)},${Y(BASE)}`),
  ].join('');
};

// Pie común: marca + dominio. Idéntico en las tres para que la serie se lea como
// una familia y no como tres diseños sueltos.
const PIE_Y = ALTO - 96;
const pie = (tinta, sutil) => `
  ${eneN(MARGEN + 16, PIE_Y - 14, 46, tinta)}
  <text x="${MARGEN + 54}" y="${PIE_Y}" font-family="${SERIF}" font-size="34" font-weight="bold" fill="${tinta}">Notoria</text>
  <text x="${ANCHO - MARGEN}" y="${PIE_Y}" text-anchor="end" font-family="${SERIF}" font-size="26" fill="${sutil}">usenotoria.app</text>`;

const estrellas = (x, y, llenas, tam, colorLleno, colorVacio) => {
  const punta = (cx, cy, r, color) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.42;
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      p.push(`${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`);
    }
    return `<polygon points="${p.join(' ')}" fill="${color}"/>`;
  };
  return Array.from({ length: 5 }, (_, i) =>
    punta(x + i * tam * 2.35, y, tam, i < llenas ? colorLleno : colorVacio)).join('');
};

const lienzo = (fondo, contenido) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  <rect width="${ANCHO}" height="${ALTO}" fill="${fondo}"/>
  ${contenido}
</svg>`;

// ── Pieza 1: la promesa, tipográfica ──────────────────────
// Sin adornos: el mensaje ES el diseño. La palabra que carga el sentido va en
// verde para que se lea sola si alguien pasa rápido por el feed.
const piezaPromesa = lienzo(OSCURO, `
  <rect x="${MARGEN}" y="262" width="76" height="5" fill="${VERDE_CLARO}"/>
  <text x="${MARGEN}" y="402" font-family="${SERIF}" font-size="92" font-weight="bold" fill="${CREMA}">Te enteras de la</text>
  <text x="${MARGEN}" y="510" font-family="${SERIF}" font-size="92" font-weight="bold" fill="${VERDE_CLARO}">mala reseña</text>
  <text x="${MARGEN}" y="618" font-family="${SERIF}" font-size="92" font-weight="bold" fill="${CREMA}">antes que tu</text>
  <text x="${MARGEN}" y="726" font-family="${SERIF}" font-size="92" font-weight="bold" fill="${CREMA}">próximo cliente.</text>
  <text x="${MARGEN}" y="846" font-family="${SERIF}" font-size="34" fill="#9a9a95">Reseñas de Google y comentarios de</text>
  <text x="${MARGEN}" y="894" font-family="${SERIF}" font-size="34" fill="#9a9a95">Instagram, en una sola bandeja.</text>
  <text x="${MARGEN}" y="942" font-family="${SERIF}" font-size="34" fill="#9a9a95">Para cualquier negocio.</text>
  ${pie(CREMA, '#6f6f6b')}
`);

// ── Pieza 2: la reseña que duele ──────────────────────────
// Enseña el problema en vez de contarlo. La reseña es genérica por dos motivos:
// no se nombra ningún negocio real —inventarle una queja a un local existente
// sería difamarlo— y la queja no es de un rubro concreto. Decía "la comida llegó
// fría", que solo servía para un restaurante y contradecía el "para cualquier
// negocio" del resto de las piezas.
const piezaResena = lienzo(CREMA, `
  <text x="${MARGEN}" y="250" font-family="${SERIF}" font-size="30" fill="#8a8a84">HOY, 9:41 P.M.</text>

  <rect x="${MARGEN}" y="295" width="${ANCHO_UTIL}" height="310" rx="22" fill="#ffffff" stroke="#e6e3da" stroke-width="2"/>
  <rect x="${MARGEN}" y="295" width="7" height="310" rx="3" fill="#d93a3a"/>
  ${estrellas(MARGEN + 58, 373, 1, 21, '#d93a3a', '#ded9cf')}
  <text x="${MARGEN + 288}" y="385" font-family="${SERIF}" font-size="28" fill="#8a8a84">hace 3 minutos</text>
  <text x="${MARGEN + 56}" y="463" font-family="${SERIF}" font-size="44" fill="${OSCURO}">“Esperamos 50 minutos y</text>
  <text x="${MARGEN + 56}" y="523" font-family="${SERIF}" font-size="44" fill="${OSCURO}">nadie nos atendió.”</text>

  <rect x="${MARGEN}" y="660" width="${ANCHO_UTIL}" height="126" rx="22" fill="${VERDE}"/>
  <text x="${MARGEN + 46}" y="722" font-family="${SERIF}" font-size="36" font-weight="bold" fill="#ffffff">Notoria te avisa al instante</text>
  <text x="${MARGEN + 46}" y="762" font-family="${SERIF}" font-size="27" fill="#cfe6d5">por correo o Telegram, y respondes desde el panel.</text>

  <text x="${MARGEN}" y="920" font-family="${SERIF}" font-size="42" fill="${OSCURO}">Una reseña sin responder</text>
  <text x="${MARGEN}" y="976" font-family="${SERIF}" font-size="42" fill="${OSCURO}">la leen todos los que</text>
  <text x="${MARGEN}" y="1032" font-family="${SERIF}" font-size="42" fill="${OSCURO}">vienen después.</text>
  ${pie(OSCURO, '#8a8a84')}
`);

// ── Pieza 3: lo que vigila ────────────────────────────────
// Lista corta de capacidades reales. Nada de cifras inventadas: todo lo que dice
// es algo que el producto hace hoy.
const filas = [
  'Reseñas nuevas en Google',
  'Comentarios en tus publicaciones',
  'Reseñas falsas y ataques de bots',
  'Caídas de tu calificación',
];
const piezaVigila = lienzo(OSCURO, `
  <text x="${MARGEN}" y="300" font-family="${SERIF}" font-size="78" font-weight="bold" fill="${CREMA}">Mientras</text>
  <text x="${MARGEN}" y="392" font-family="${SERIF}" font-size="78" font-weight="bold" fill="${CREMA}">atiendes,</text>
  <text x="${MARGEN}" y="484" font-family="${SERIF}" font-size="78" font-weight="bold" fill="${VERDE_CLARO}">nosotros vigilamos.</text>
  ${filas.map((f, i) => {
    const y = 620 + i * 112;
    return `<rect x="${MARGEN}" y="${y - 48}" width="${ANCHO_UTIL}" height="86" rx="18" fill="#1e1e1c" stroke="#2c2c29" stroke-width="2"/>
      <circle cx="${MARGEN + 50}" cy="${y - 5}" r="13" fill="${VERDE_CLARO}"/>
      <text x="${MARGEN + 92}" y="${y + 8}" font-family="${SERIF}" font-size="37" fill="${CREMA}">${f}</text>`;
  }).join('')}
  <text x="${MARGEN}" y="1130" font-family="${SERIF}" font-size="31" fill="#9a9a95">Cualquier negocio en el Perú · Plan gratuito</text>
  ${pie(CREMA, '#6f6f6b')}
`);

const piezas = [
  ['notoria-post-promesa.png', piezaPromesa],
  ['notoria-post-resena.png', piezaResena],
  ['notoria-post-vigila.png', piezaVigila],
];

(async () => {
  for (const [nombre, svg] of piezas) {
    const destino = path.join(SALIDA, nombre);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(destino);
    console.log(`  ${nombre}  ${(fs.statSync(destino).size / 1024).toFixed(1)} KB`);
  }
  console.log(`\nListo. ${ANCHO}x${ALTO} (4:5), el vertical que Instagram no recorta.`);
})();
