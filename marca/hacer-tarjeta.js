// Tarjetas 1080x1920 de la campaña de video (las que se pegan al final de cada clip).
//
//   node marca/hacer-tarjeta.js salida.png "línea 1" "línea 2"            → tarjeta de problema
//   node marca/hacer-tarjeta.js salida.png "línea 1" "línea 2" --cierre   → tarjeta de cierre
//
// 🔴 POR QUÉ ESTE ARCHIVO EXISTE, Y NO HAY QUE VOLVER AL .py
//
// El original era `hacer-tarjeta.py`, y vivía en `Downloads/notoria-videos/guiones`.
// El 2026-09-22 se descubrió que NO SE PUEDE EJECUTAR en la PC del taller, y es la
// misma familia de hueco que el JDK y `respaldos/` (§2 y `docs/mudanza-de-pc.md`):
// no falla al mudarse, falla el día que se necesita.
//
//   · No hay Python en esta máquina (ni `python`, ni `py`).
//   · Usaba `fc-match`, que es de fontconfig — no existe en Windows.
//   · Cargaba el logo de `~/notoria/marca/`, una ruta de la PC ANTERIOR.
//
// Y encima estaba en `Downloads`, que se limpia sola: el mismo aviso que §3 da para
// el `.p12`. Las tarjetas son material de campaña publicado; su herramienta va en el
// repo.
//
// ⚠️ Y CAMBIA LA TIPOGRAFÍA, A PROPÓSITO. `fc-match serif` en la PC vieja resolvía a
// la serif del sistema (DejaVu), NO a Georgia — se ve en los numerales de la tarjeta
// 1a, que son de altura uniforme y Georgia los dibuja con caídas. O sea que las
// tarjetas nunca usaron la tipografía de la marca (§17). Esta versión usa Georgia.
// 🔴 Consecuencia que hay que tener presente: una tarjeta regenerada NO casa con una
// vieja. Si se regenera una de un video, regenerar LAS DOS — dentro de un mismo clip
// la diferencia sí se ve.
//
// Se compone en SVG y se rasteriza con `sharp`, igual que `generar-social.js`.
//
// ⚠️ El ancho del texto se MIDE, no se estima: se rasteriza el renglón suelto y se
// recorta con `trim()`. Una heurística de anchos medios se pasa por poco justo con
// las frases largas, y el fallo es mudo — la línea sale del papel y nadie lo ve
// hasta que el video está montado.

const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'brand-shield-web', 'node_modules', 'sharp'));

const W = 1080;
const H = 1920;
const TINTA = '#141413';
const CREMA = '#E8E6DC';
const GRIS = '#9C9B96';
const VERDE = '#0B7324';

const SERIF = "Georgia, 'Times New Roman', serif";
const LOGO = path.join(__dirname, 'notoria-marca-oscuro.png');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Ancho real de un renglón: se dibuja solo, se recorta y se mide. `trim` necesita
// algo que recortar, así que va sobre fondo transparente y con margen de sobra.
const medir = async (txt, tam) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${tam * 3}">
    <text x="20" y="${tam * 2}" font-family="${SERIF}" font-size="${tam}" fill="#fff">${esc(txt)}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width;
};

const tarjeta = async (salida, lineas, cierre) => {
  const util = Math.round(W * 0.86);

  // Mismo descenso que el original: de 54 hacia abajo de dos en dos hasta que entre.
  let tam = 54;
  while (tam > 24) {
    const anchos = await Promise.all(lineas.map((l) => medir(l, tam)));
    if (Math.max(...anchos) <= util) break;
    tam -= 2;
  }

  const lado = cierre ? 240 : 250;
  const logoY = cierre ? 600 : 640;

  // ⚠️ El original trabajaba en coordenadas de TAPA (PIL dibuja desde arriba) y el
  // SVG trabaja en LÍNEA BASE. Se conserva la aritmética del original —«alto del
  // renglón + 26»— y se convierte solo al dibujar. Hacerlo al revés, sumando
  // saltos de línea base, separa los renglones casi el doble: se ve enseguida
  // comparando con una tarjeta vieja.
  const base = (t) => Math.round(t * 0.78); // tapa → línea base
  const alto = (t) => Math.round(t * 0.72); // alto del renglón, sin el aire

  let tapa = cierre ? 960 : 1010;
  const filas = lineas
    .map((l) => {
      const t = `<text x="${W / 2}" y="${tapa + base(tam)}" text-anchor="middle" font-family="${SERIF}" font-size="${tam}" fill="${CREMA}">${esc(l)}</text>`;
      tapa += alto(tam) + 26;
      return t;
    })
    .join('\n  ');

  let pie;
  if (cierre) {
    // Jerarquía en el contacto: el dominio grande y en verde —es donde el visitante
    // puede analizar su negocio solo— y el correo debajo en gris, como segunda
    // opción. Los dos del mismo tamaño no darían a elegir, darían a dudar.
    tapa += 78;
    const dominio = `<text x="${W / 2}" y="${tapa + base(46)}" text-anchor="middle" font-family="${SERIF}" font-size="46" fill="${VERDE}">usenotoria.app</text>`;
    tapa += alto(46) + 34;
    pie = `${dominio}
  <text x="${W / 2}" y="${tapa + base(31)}" text-anchor="middle" font-family="${SERIF}" font-size="31" fill="${GRIS}">hola@usenotoria.app</text>`;
  } else {
    pie = `<text x="${W / 2}" y="${tapa + 62 + base(30)}" text-anchor="middle" font-family="${SERIF}" font-size="30" fill="${GRIS}">usenotoria.app</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${TINTA}"/>
  ${filas}
  ${pie}
</svg>`;

  const logo = await sharp(LOGO).resize(lado, lado, { fit: 'contain', background: TINTA }).toBuffer();

  await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: Math.round((W - lado) / 2), top: logoY }])
    .png({ compressionLevel: 9 })
    .toFile(salida);

  console.log(`  ${path.basename(salida)}  ${(fs.statSync(salida).size / 1024).toFixed(1)} KB  ·  cuerpo ${tam}`);
};

const args = process.argv.slice(2);
const cierre = args.includes('--cierre');
const limpio = args.filter((a) => a !== '--cierre');

if (limpio.length < 2) {
  console.error('uso: node marca/hacer-tarjeta.js salida.png "línea 1" ["línea 2"] [--cierre]');
  process.exit(1);
}

tarjeta(limpio[0], limpio.slice(1), cierre).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
