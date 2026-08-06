// brand-shield/scripts/prueba-culqi.js
// Prueba el circuito completo de cobro contra la API REAL de Culqi usando las
// llaves de TEST: token de tarjeta → customer → tarjeta guardada → cargo.
//
//   node scripts/prueba-culqi.js
//
// Por qué existe: `src/lib/culqi.js` se escribió a partir de la documentación y
// nunca se ejecutó contra Culqi. Lo que este script verifica no es solo que
// "responda 200", sino que existan los campos exactos de los que depende el
// resto del código:
//   - cargo.id                    → Pago.culqiCargoId (lo usa el webhook para
//                                   marcar REEMBOLSADO)
//   - cargo.source.card_number    → Pago.tarjetaInicio (primeros 4 dígitos)
//   - cargo.source.iin.card_brand → Pago.tarjetaMarca
//   - tarjeta.id                  → Usuario.suscripcionId, la tarjeta guardada
//                                   que el cron de renovación vuelve a cobrar
// Si Culqi renombra alguno, el cobro igual "funciona" pero el historial de
// Facturación sale vacío y la renovación mensual se rompe en silencio.
//
// SEGURIDAD: se niega a correr con llaves `sk_live_` (haría un cobro real a una
// tarjeta real). Para eso hace falta pasar --vivo a propósito.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const culqi = require('../src/lib/culqi');
const { MONEDA, PRECIOS } = require('../src/lib/precios');

const VIVO = process.argv.includes('--vivo');
const TOKENS_URL = 'https://secure.culqi.com/v2/tokens';

// Tarjeta de prueba de Culqi. Solo funciona con llaves pk_test/sk_test.
const TARJETA = {
  card_number: '4111111111111111',
  cvv: '123',
  expiration_month: '9',
  expiration_year: String(new Date().getFullYear() + 2),
};

let fallos = 0;
const ok = (...a) => console.log('✓', ...a);
const mal = (...a) => { fallos++; console.error('✗', ...a); };

// Culqi devuelve el motivo real en user_message/merchant_message, no en el
// mensaje de axios — el mismo desdoblado que hace pago.routes.js.
const motivo = (e) =>
  e.response?.data?.user_message ||
  e.response?.data?.merchant_message ||
  e.response?.data?.message ||
  e.message;

(async () => {
  const pk = process.env.CULQI_PUBLIC_KEY;
  const sk = process.env.CULQI_SECRET_KEY;

  // ── 1. Llaves ────────────────────────────────────────────
  if (!pk || !sk) {
    console.error('✗ Faltan CULQI_PUBLIC_KEY y/o CULQI_SECRET_KEY en brand-shield/.env');
    console.error('  Se sacan de https://integracion.culqi.com → Desarrollo → Llaves.');
    process.exit(1);
  }
  if (!culqi.configurado()) return mal('culqi.configurado() dice false con la llave puesta');
  ok('Llaves cargadas —', `pública ${pk.slice(0, 8)}…`, `secreta ${sk.slice(0, 8)}…`);

  const esTest = pk.startsWith('pk_test_') && sk.startsWith('sk_test_');
  if (!esTest && !VIVO) {
    console.error('\n✗ Estas NO son llaves de test (pk_test_/sk_test_).');
    console.error('  Correr esto con llaves live haría un COBRO REAL de',
      `${MONEDA} ${(PRECIOS.NEGOCIO.mensual / 100).toFixed(2)} a una tarjeta real.`);
    console.error('  Si de verdad es lo que quieres: node scripts/prueba-culqi.js --vivo');
    process.exit(1);
  }
  if (!esTest) console.warn('⚠  MODO VIVO: esto va a cobrar de verdad.');
  if (pk.startsWith('pk_test_') !== sk.startsWith('sk_test_')) {
    mal('Las llaves son de entornos distintos (una test y otra live) — Culqi rechazará el token');
  }

  // Email único por corrida: evita chocar con un customer ya creado.
  const email = `prueba+${Date.now()}@usenotoria.app`;

  try {
    // ── 2. Token de tarjeta ────────────────────────────────
    // En producción lo genera el widget en el navegador; con llaves de test se
    // puede pedir desde acá, que es lo que permite probar sin abrir la web.
    const { data: token } = await axios.post(
      TOKENS_URL,
      { ...TARJETA, email },
      { headers: { Authorization: `Bearer ${pk}` } },
    );
    if (!token.id) return mal('El token vino sin id:', JSON.stringify(token));
    ok('TOKEN:', token.id, '|', token.iin?.card_brand || '(sin marca)');

    // ── 3. Customer ────────────────────────────────────────
    // Se usa obtenerOCrearCliente porque es lo que corre en producción.
    const cliente = await culqi.obtenerOCrearCliente({ email, nombre: 'Prueba Notoria' });
    if (!cliente.id) return mal('El customer vino sin id:', JSON.stringify(cliente));
    ok('CLIENTE:', cliente.id);

    // Segunda alta con el MISMO correo: Culqi rechaza crear un customer
    // duplicado, así que si esto no reutiliza el existente, cualquier cliente
    // que intente suscribirse dos veces (tras cancelar, tras un cobro fallido o
    // al cambiar de plan) queda sin poder pagar nunca más. Pasó de verdad.
    try {
      const repetido = await culqi.obtenerOCrearCliente({ email, nombre: 'Prueba Notoria' });
      if (repetido.id !== cliente.id) mal(`La segunda alta devolvió otro customer (${repetido.id} ≠ ${cliente.id})`);
      else ok('Suscribirse dos veces con el mismo correo reutiliza el customer');
    } catch (e) {
      mal('La segunda alta con el mismo correo falló:', e.response?.data?.merchant_message || e.message);
    }

    // ── 4. Tarjeta guardada ────────────────────────────────
    // Es la pieza de la que depende la renovación mensual: su id se guarda en
    // Usuario.suscripcionId y el cron la vuelve a cobrar cada periodo.
    const tarjeta = await culqi.crearTarjeta({ customerId: cliente.id, tokenId: token.id });
    if (!tarjeta.id) return mal('La tarjeta vino sin id:', JSON.stringify(tarjeta));
    ok('TARJETA GUARDADA:', tarjeta.id, '→ este id es el que va a Usuario.suscripcionId');

    // ── 5. Cargo ───────────────────────────────────────────
    const monto = PRECIOS.NEGOCIO.mensual;
    const cargo = await culqi.crearCargo({
      monto,
      moneda: MONEDA,
      email,
      sourceId: tarjeta.id,
      descripcion: 'Notoria — prueba de integración (plan NEGOCIO mensual)',
    });
    ok('CARGO:', cargo.id, '|', cargo.currency_code, (cargo.amount / 100).toFixed(2));

    // El monto es lo único que un error de unidades no perdona: PRECIOS está en
    // céntimos (5900 = S/59), así que un cargo de 59 sería S/0.59.
    if (cargo.amount !== monto) {
      mal(`El monto cobrado (${cargo.amount}) no coincide con PRECIOS.NEGOCIO.mensual (${monto})`);
    } else {
      ok(`Monto correcto: ${monto} céntimos = ${MONEDA} ${(monto / 100).toFixed(2)}`);
    }
    if (cargo.currency_code !== MONEDA) mal(`Moneda devuelta ${cargo.currency_code}, esperada ${MONEDA}`);

    // ── 6. Campos que consume registrarPago() ──────────────
    // Se comprueba a través de culqi.datosTarjeta(), que es exactamente lo que
    // corre en producción. Antes esto releía `cargo.source.card_number` por su
    // cuenta y por eso no detectaba que, al cobrar con tarjeta guardada, Culqi
    // anida esos campos un nivel más abajo (cargo.source.source).
    const datos = culqi.datosTarjeta(cargo);
    if (!cargo.source) {
      mal('El cargo no trae `source` — Pago.tarjetaInicio y tarjetaMarca quedarían en null');
    } else {
      if (datos.inicio) ok('Pago.tarjetaInicio:', datos.inicio);
      else mal('datosTarjeta() no encontró el número — Pago.tarjetaInicio quedaría null');

      if (datos.marca) ok('Pago.tarjetaMarca:', datos.marca);
      else mal('datosTarjeta() no encontró la marca — Pago.tarjetaMarca quedaría null');
    }
    if (!cargo.id) mal('El cargo no trae id — el webhook no podría marcar reembolsos');

    // ── 7. Camino de error ─────────────────────────────────
    // pago.routes.js le muestra al usuario error.response.data.user_message.
    // Si Culqi no lo mandara, el usuario vería un mensaje técnico en inglés.
    try {
      await culqi.crearTarjeta({ customerId: cliente.id, tokenId: 'tkn_test_inexistente' });
      mal('Un token inválido debería fallar y no falló');
    } catch (e) {
      const m = motivo(e);
      if (m && m !== e.message) ok('Error legible ante token inválido:', `"${m}"`);
      else mal('Culqi no devolvió user_message/merchant_message — el usuario vería un error crudo:', m);
    }
  } catch (e) {
    mal('Falló el circuito:', motivo(e));
    if (e.response?.data) console.error('  respuesta:', JSON.stringify(e.response.data));
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — el circuito de cobro funciona contra Culqi');
  process.exit(fallos ? 1 : 0);
})();
