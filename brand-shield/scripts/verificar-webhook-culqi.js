// brand-shield/scripts/verificar-webhook-culqi.js
// Comprueba contra el backend DESPLEGADO que el webhook de Culqi está vivo,
// exige el secreto y acepta las dos formas de autenticación.
//
//   railway run node scripts/verificar-webhook-culqi.js
//
// Se corre con `railway run` para que el secreto salga de las variables reales
// de producción y no haya que escribirlo en ningún sitio.
//
// Manda un `refund.creation.succeeded` con un chargeId inventado: el endpoint lo
// busca en la tabla `pagos`, no lo encuentra, lo registra y responde 200 sin
// tocar nada. O sea que esta prueba **no modifica ningún cobro real**.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const BASE = process.env.BACKEND_URL || 'https://api.usenotoria.app';
const URL = `${BASE}/api/pagos/culqi/webhook`;
const SECRETO = process.env.CULQI_WEBHOOK_SECRET;

// chargeId que no puede existir: si por accidente coincidiera con uno real, el
// endpoint marcaría ese cobro como reembolsado.
const CARGO_INVENTADO = `chr_verificacion_${Date.now()}`;

const CUERPO = {
  object: 'event',
  type: 'refund.creation.succeeded',
  data: JSON.stringify({ chargeId: CARGO_INVENTADO, amount: 100 }),
};

let fallos = 0;
const ok = (...a) => console.log('✓', ...a);
const mal = (...a) => { fallos++; console.error('✗', ...a); };

const enviar = async (opciones) => {
  try {
    const r = await axios.post(URL, CUERPO, { timeout: 30000, ...opciones });
    return { status: r.status, body: r.data };
  } catch (e) {
    return { status: e.response?.status, body: e.response?.data, error: e.message };
  }
};

(async () => {
  if (!SECRETO) {
    console.error('✗ No hay CULQI_WEBHOOK_SECRET en el entorno.');
    console.error('  Correr con: railway run node scripts/verificar-webhook-culqi.js');
    process.exit(1);
  }

  console.log(`Webhook: ${URL}\n`);

  // ── 1. Sin secreto → 401 ─────────────────────────────────
  // Si esto devolviera 200, cualquiera podría mandar reembolsos falsos y
  // desactivar suscripciones de clientes ajenos.
  const sin = await enviar({});
  if (sin.status === 401) ok('Sin secreto responde 401');
  else mal(`Sin secreto respondió ${sin.status} — el endpoint está ABIERTO`);

  // ── 2. Secreto en la query ───────────────────────────────
  const conQuery = await enviar({ params: { secret: SECRETO } });
  if (conQuery.status === 200 && conQuery.body?.recibido) ok('Acepta el secreto por ?secret=');
  else mal(`Con ?secret= respondió ${conQuery.status}:`, JSON.stringify(conQuery.body));

  // ── 3. Autenticación básica ──────────────────────────────
  // Es lo que activa el interruptor "Activar autenticación" del panel de Culqi.
  const conBasica = await enviar({ auth: { username: 'culqi', password: SECRETO } });
  if (conBasica.status === 200 && conBasica.body?.recibido) ok('Acepta el secreto por autenticación básica');
  else mal(`Con básica respondió ${conBasica.status}:`, JSON.stringify(conBasica.body));

  // ── 4. Secreto equivocado → 401 ──────────────────────────
  const malSecreto = await enviar({ params: { secret: 'no-es-el-secreto' } });
  if (malSecreto.status === 401) ok('Un secreto equivocado sigue dando 401');
  else mal(`Un secreto equivocado respondió ${malSecreto.status}`);

  console.log(fallos
    ? `\n${fallos} fallo(s)`
    : `\nTodo OK — el webhook está desplegado y protegido.\n` +
      `El cargo de prueba (${CARGO_INVENTADO}) no existe en la base, así que no se tocó ningún cobro.`);
  process.exit(fallos ? 1 : 0);
})();
