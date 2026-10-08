// brand-shield/scripts/smoke-produccion.js
//
// Prueba de humo contra PRODUCCIÓN: ¿lo que ve el cliente coincide con lo que
// hace el código? (réplica del auditor, 2026-10-07: P0-09, P0-10 e I-12.)
//
// Dos auditorías leyeron la web pública desde la caché de un buscador y
// «vieron» textos de hacía semanas. La respuesta no puede ser «nosotros la
// miramos a mano»: esto la mira cada vez, sin caché, y compara contra la MISMA
// fuente que usa el backend (lib/planes.js), así que una cadencia que cambie en
// el código y no en la web falla aquí. Solo lee: no inicia sesión, no cobra.
//
//   node scripts/smoke-produccion.js            → código de salida 1 si algo no cuadra
//   WEB=https://otra.url API=https://… node scripts/smoke-produccion.js
//
// Cada página lleva su control: la frase inventada tiene que NO estar, y la
// página tiene que tener contenido real (un 200 con un cascarón vacío no pasa).

const { PLANES_DE_PAGO, capacidades } = require('../src/lib/planes');

const WEB = (process.env.WEB || 'https://usenotoria.app').replace(/\/$/, '');
const API = (process.env.API || 'https://api.usenotoria.app').replace(/\/$/, '');
const CONTROL = 'frase-de-control-que-no-existe-7f3a';

// Lo que NUNCA debe aparecer en una página pública, en ningún idioma.
const PROHIBIDAS = [
  /diferencia proporcional/i, // política de upgrade vieja (P0-09)
  /cada hora\b/i, /every hour/i, /cada 1 hora/i, // Franquicia es cada 2 h (P0-10)
  /7 d[ií]as gratis/i, // no hay periodo de prueba (Ley 29571)
  /esta reseña es falsa/i, // Notoria señala, no decide (P2-02)
];

let fallos = 0;
const ok = (m) => console.log(`✓ ${m}`);
const mal = (m) => { console.error(`✗ ${m}`); fallos += 1; };

const traer = async (url, opciones = {}) => {
  const sep = url.includes('?') ? '&' : '?';
  const r = await fetch(`${url}${sep}smoke=${Date.now().toString(36)}`, {
    redirect: 'follow',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', 'User-Agent': 'notoria-smoke/1' },
    ...opciones,
  });
  return { status: r.status, texto: await r.text(), cache: r.headers.get('x-vercel-cache'), edad: r.headers.get('age') };
};

const pagina = async (ruta, { debe = [], prohibidas = PROHIBIDAS } = {}) => {
  let p;
  try { p = await traer(`${WEB}${ruta}`); } catch (e) { return mal(`${ruta}: no respondió (${e.message})`); }
  const donde = `${ruta} (cache ${p.cache || '-'}, age ${p.edad || '-'})`;
  if (p.status !== 200) return mal(`${donde}: HTTP ${p.status}`);
  if (p.texto.length < 5000 || !p.texto.includes('Notoria')) return mal(`${donde}: sin contenido real (${p.texto.length} caracteres)`);
  if (p.texto.includes(CONTROL)) return mal(`${donde}: contiene la frase de control — la sonda no distingue`);
  for (const f of debe) {
    if (!(f instanceof RegExp ? f.test(p.texto) : p.texto.includes(f))) mal(`${donde}: falta «${f}»`);
  }
  for (const f of prohibidas) {
    const m = p.texto.match(f);
    if (m) mal(`${donde}: dice «${m[0]}», que el producto no cumple`);
  }
  ok(`${donde}: ${debe.length} frase(s) esperadas, ninguna prohibida`);
};

(async () => {
  console.log(`Smoke de producción — ${WEB} · ${API}\n`);

  // Cadencias: de lib/planes.js, no escritas a mano.
  const cadencias = PLANES_DE_PAGO.map((p) => `cada ${capacidades(p).horasEscaneo} horas`);
  await pagina('/precios', { debe: cadencias });
  await pagina('/devoluciones', { debe: ['se suman al final del nuevo periodo', 'Bajar de plan'] });
  await pagina('/', { debe: [`cada 72, 24, ${PLANES_DE_PAGO.map((p) => capacidades(p).horasEscaneo).join(', ').replace(/, (\d+)$/, ' o $1')} horas`] });
  await pagina('/terminos');

  // API viva y consultando la base: /health 200, login falso 401 (un 500 diría
  // que la base no responde) y una ruta inventada 404 como control.
  try {
    const h = await traer(`${API}/health`);
    if (h.status === 200) ok('/health 200'); else mal(`/health ${h.status}`);
    const l = await traer(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'smoke@invalido.test', password: 'x' }) });
    if (l.status === 401) ok('login con credenciales falsas → 401 (la base responde)'); else mal(`login falso → ${l.status}`);
    const n = await traer(`${API}/api/ruta-que-no-existe-${CONTROL}`);
    if (n.status === 404) ok('CONTROL: ruta inventada → 404'); else mal(`ruta inventada → ${n.status}`);
    const m = await traer(`${API}/health/monitoreo`);
    if (m.status === 200) ok('/health/monitoreo 200 (la vigilancia corre)'); else mal(`/health/monitoreo ${m.status}: ${m.texto.slice(0, 200)}`);
  } catch (e) {
    mal(`API no respondió: ${e.message}`);
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — la web dice lo que el código hace');
  process.exit(fallos ? 1 : 0);
})();
