// Genera los enlaces de venta /para/<ficha> para un lote de prospectos.
//
// Sin esto, la página /para no sirve para prospectar: habría que buscar el place
// ID de cada negocio a mano en Google. Con esto, una búsqueda devuelve la lista
// lista para pegar en WhatsApp.
//
//   cd brand-shield
//   node scripts/enlaces-venta.js "restaurantes Miraflores"
//   node scripts/enlaces-venta.js "hoteles Cusco" --paginas 3
//   node scripts/enlaces-venta.js "chifas San Miguel" --csv > prospectos.csv
//
// Ordena por PRIORIDAD, no alfabéticamente: primero los que más nos necesitan.
// El criterio es el del propio producto —quien está por debajo de 4.5★ pierde a
// uno de cada tres clientes que filtran por ahí— y dentro de esos, los que
// tienen más reseñas, porque son negocios reales con volumen y no una ficha
// recién creada.
//
// ⚠️ Consume cuota de Google Places: 1 llamada por página de resultados (20
// negocios cada una). No hace ninguna llamada por negocio — el detalle lo pide la
// página cuando el prospecto la abre, y solo de los que abren.

require('dotenv').config();
const axios = require('axios');

const args = process.argv.slice(2);
const consulta = args.filter((a) => !a.startsWith('--'))[0];
const csv = args.includes('--csv');
const paginas = Math.min(3, Math.max(1, Number(args[args.indexOf('--paginas') + 1]) || 1));

if (!consulta) {
  console.error(`
Uso: node scripts/enlaces-venta.js "<búsqueda>" [--paginas 1-3] [--csv]

  node scripts/enlaces-venta.js "restaurantes Miraflores"
  node scripts/enlaces-venta.js "hoteles Cusco" --paginas 3 --csv > prospectos.csv
`);
  process.exit(1);
}

// Estos enlaces se MANDAN a otra persona, así que nunca pueden salir apuntando a
// localhost — y el .env de desarrollo tiene FRONTEND_URL en localhost. Si la
// variable apunta a una dirección local se ignora y se usa el dominio real.
const FRONT = process.env.FRONTEND_URL || '';
const BASE = /localhost|127\.0\.0\.1|192\.168\./.test(FRONT) || !FRONT
  ? 'https://usenotoria.app'
  : FRONT.replace(/\/+$/, '');

// El slug es decorativo: hace que el enlace se lea bien en el chat. Lo que
// identifica la ficha es el place ID que va después del `~` (ver la página
// /para/[ficha]/page.js, que parte por el ÚLTIMO `~` porque los place IDs
// llevan guiones dentro pero nunca una virgulilla).
const slug = (nombre) => (nombre || 'negocio')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 50);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error('\nFalta GOOGLE_PLACES_API_KEY en el .env\n');
    process.exit(1);
  }

  const encontrados = [];
  let token = null;

  for (let i = 0; i < paginas; i++) {
    // Google exige una pausa antes de que el next_page_token sea válido. Sin
    // ella devuelve INVALID_REQUEST y parece que no hay más resultados.
    if (token) await esperar(2000);

    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: token
        ? { pagetoken: token, key: process.env.GOOGLE_PLACES_API_KEY }
        : { query: `${consulta} Perú`, key: process.env.GOOGLE_PLACES_API_KEY, language: 'es', region: 'pe' },
    });

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`\nGoogle respondió ${data.status}: ${data.error_message || 'sin detalle'}\n`);
      break;
    }
    encontrados.push(...(data.results || []));
    token = data.next_page_token;
    if (!token) break;
  }

  const prospectos = encontrados
    .filter((p) => p.place_id && p.business_status !== 'CLOSED_PERMANENTLY')
    .map((p) => ({
      nombre: p.name,
      rating: p.rating || 0,
      resenas: p.user_ratings_total || 0,
      direccion: p.formatted_address || '',
      url: `${BASE}/para/${slug(p.name)}~${p.place_id}`,
    }))
    // Primero los que están por debajo del umbral; dentro de cada grupo, los de
    // más volumen. Un negocio de 4.1 con 400 reseñas es mejor prospecto que uno
    // de 4.1 con 6: tiene el problema y tiene con qué pagar la solución.
    .sort((a, b) => {
      const bajoA = a.rating > 0 && a.rating < 4.5 ? 0 : 1;
      const bajoB = b.rating > 0 && b.rating < 4.5 ? 0 : 1;
      if (bajoA !== bajoB) return bajoA - bajoB;
      return b.resenas - a.resenas;
    });

  if (!prospectos.length) {
    console.error('\nNo se encontró ningún negocio con esa búsqueda.\n');
    process.exit(1);
  }

  if (csv) {
    console.log('nombre,rating,resenas,direccion,enlace');
    for (const p of prospectos) {
      const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
      console.log([q(p.nombre), p.rating, p.resenas, q(p.direccion), q(p.url)].join(','));
    }
    return;
  }

  const bajos = prospectos.filter((p) => p.rating > 0 && p.rating < 4.5).length;
  console.log(`\n${prospectos.length} negocio(s) para "${consulta}" — ${bajos} por debajo de 4.5★\n`);
  for (const p of prospectos) {
    const marca = p.rating > 0 && p.rating < 4.5 ? '●' : '○';
    console.log(`${marca} ${p.nombre}  ${p.rating || '—'}★ · ${p.resenas} reseñas`);
    console.log(`  ${p.url}\n`);
  }
  console.log('● = por debajo de 4.5★, el filtro con el que el 31% descarta un negocio (BrightLocal 2026)');
  console.log('Los enlaces no están indexados y se retiran a pedido: añade el place ID a PARA_BLOQUEADOS.\n');
})().catch((e) => {
  console.error('\nFATAL:', e.message, '\n');
  process.exitCode = 1;
});
