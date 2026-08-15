// Piezas para redes sociales de Notoria, 1080x1080 PNG (formato cuadrado de
// Instagram). Se usan para publicar y como material de la publicación que sale
// en el screencast del App Review de Meta.
//
//   node marca/generar-social.js
//
// Se compone en SVG y se rasteriza con `sharp`. La nota de `generar-logos.py`
// decía que no había rasterizador SVG en la máquina y por eso aquel se dibujó
// con Pillow a 4x; `sharp` ya está instalado con el frontend, así que aquí sí se
// puede usar SVG y tener tipografía de verdad en vez de polígonos.
//
// ⚠️ La N NO se redibuja a ojo: son las mismas coordenadas normalizadas de
// `generar-logos.py`. Si esa geometría cambia, cambiarla en los dos sitios o la
// familia se desalinea. El bisel invertido del asta derecha es toda la
// identidad de la marca — ver la cabecera de aquel script.

const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'brand-shield-web', 'node_modules', 'sharp'));

const VERDE = '#0B7324';
const VERDE_CLARO = '#4CAF66';
const OSCURO = '#141413';
const CREMA = '#FAF9F5';

const LADO = 1080;
const SALIDA = __dirname;

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

// Pie común: marca + dominio. Se repite igual en todas las piezas para que la
// serie se lea como una familia y no como tres diseños sueltos.
const pie = (tinta, sutil) => `
  ${eneN(88, LADO - 92, 46, tinta)}
  <text x="126" y="${LADO - 78}" font-family="Georgia, 'Times New Roman', serif"
        font-size="34" font-weight="bold" fill="${tinta}">Notoria</text>
  <text x="${LADO - 72}" y="${LADO - 78}" text-anchor="end"
        font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="${sutil}">usenotoria.app</text>`;

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

// ── Pieza 1: la promesa, tipográfica ──────────────────────
// Sin adornos: el mensaje ES el diseño. La palabra que carga el sentido va en
// verde para que se lea sola si alguien pasa rápido por el feed.
const piezaPromesa = `
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 ${LADO} ${LADO}">
  <rect width="${LADO}" height="${LADO}" fill="${OSCURO}"/>
  <rect x="72" y="212" width="76" height="5" fill="${VERDE_CLARO}"/>
  <text x="72" y="362" font-family="Georgia, 'Times New Roman', serif" font-size="86" font-weight="bold" fill="${CREMA}">Te enteras de la</text>
  <text x="72" y="462" font-family="Georgia, 'Times New Roman', serif" font-size="86" font-weight="bold" fill="${VERDE_CLARO}">mala reseña</text>
  <text x="72" y="562" font-family="Georgia, 'Times New Roman', serif" font-size="86" font-weight="bold" fill="${CREMA}">antes que tu</text>
  <text x="72" y="662" font-family="Georgia, 'Times New Roman', serif" font-size="86" font-weight="bold" fill="${CREMA}">próximo cliente.</text>
  <text x="72" y="768" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#9a9a95">Reseñas de Google y comentarios de Instagram,</text>
  <text x="72" y="816" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#9a9a95">en una sola bandeja. Para restaurantes y hoteles.</text>
  ${pie(CREMA, '#6f6f6b')}
</svg>`;

// ── Pieza 2: la reseña que duele ──────────────────────────
// Enseña el problema en vez de contarlo. La reseña es genérica a propósito: no
// se usa el nombre de ningún negocio real.
const piezaResena = `
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 ${LADO} ${LADO}">
  <rect width="${LADO}" height="${LADO}" fill="${CREMA}"/>
  <text x="72" y="168" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#8a8a84">HOY, 9:41 P.M.</text>

  <rect x="72" y="213" width="936" height="300" rx="22" fill="#ffffff" stroke="#e6e3da" stroke-width="2"/>
  <rect x="72" y="213" width="7" height="300" rx="3" fill="#d93a3a"/>
  ${estrellas(130, 286, 1, 21, '#d93a3a', '#ded9cf')}
  <text x="360" y="298" font-family="Georgia, 'Times New Roman', serif" font-size="28" fill="#8a8a84">hace 3 minutos</text>
  <text x="128" y="373" font-family="Georgia, 'Times New Roman', serif" font-size="44" fill="#141413">“Esperamos 50 minutos y la comida</text>
  <text x="128" y="433" font-family="Georgia, 'Times New Roman', serif" font-size="44" fill="#141413">llegó fría. No volvemos.”</text>

  <rect x="72" y="558" width="936" height="118" rx="22" fill="${VERDE}"/>
  <text x="118" y="616" font-family="Georgia, 'Times New Roman', serif" font-size="36" font-weight="bold" fill="#ffffff">Notoria te avisa al instante</text>
  <text x="118" y="656" font-family="Georgia, 'Times New Roman', serif" font-size="28" fill="#cfe6d5">por correo o Telegram, y respondes desde el panel.</text>

  <text x="72" y="812" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#141413">Una reseña sin responder la leen</text>
  <text x="72" y="864" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#141413">todos los que vienen después.</text>
  ${pie(OSCURO, '#8a8a84')}
</svg>`;

// ── Pieza 3: lo que vigila ────────────────────────────────
// Lista corta de capacidades reales. Nada de cifras inventadas: todo lo que dice
// es algo que el producto hace hoy.
const filas = [
  'Reseñas nuevas en Google',
  'Comentarios en tus publicaciones',
  'Reseñas falsas y ataques de bots',
  'Caídas de tu calificación',
];
const piezaVigila = `
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 ${LADO} ${LADO}">
  <rect width="${LADO}" height="${LADO}" fill="${OSCURO}"/>
  <text x="72" y="190" font-family="Georgia, 'Times New Roman', serif" font-size="74" font-weight="bold" fill="${CREMA}">Mientras atiendes,</text>
  <text x="72" y="278" font-family="Georgia, 'Times New Roman', serif" font-size="74" font-weight="bold" fill="${VERDE_CLARO}">nosotros vigilamos.</text>
  ${filas.map((f, i) => {
    const y = 400 + i * 108;
    return `<rect x="72" y="${y - 46}" width="936" height="84" rx="18" fill="#1e1e1c" stroke="#2c2c29" stroke-width="2"/>
      <circle cx="126" cy="${y - 4}" r="13" fill="${VERDE_CLARO}"/>
      <text x="172" y="${y + 8}" font-family="Georgia, 'Times New Roman', serif" font-size="38" fill="${CREMA}">${f}</text>`;
  }).join('')}
  <text x="72" y="880" font-family="Georgia, 'Times New Roman', serif" font-size="32" fill="#9a9a95">Restaurantes y hoteles del Perú · Plan gratuito disponible</text>
  ${pie(CREMA, '#6f6f6b')}
</svg>`;

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
  console.log('\nListo. 1080x1080, formato cuadrado de Instagram.');
})();
