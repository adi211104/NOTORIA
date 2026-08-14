// brand-shield/scripts/verificar-culqi-live.js
// Comprueba que las llaves de Culqi CARGADAS EN PRODUCCIÓN son válidas y del
// entorno correcto, SIN mover dinero. Complementa a prueba-culqi.js, que hace
// el circuito entero pero solo puede correr con llaves de test (cobra de
// verdad, ver su cabecera).
//
//   railway run node scripts/verificar-culqi-live.js     ← lo normal: usa las
//                                                          variables reales de
//                                                          Railway
//   node scripts/verificar-culqi-live.js                 ← usa brand-shield/.env
//
// Por qué hace falta: con llaves live no se puede tokenizar una tarjeta desde
// el servidor, así que no hay forma de "probar un cobro" sin cobrarle a alguien.
// Lo que sí se puede es preguntar por lo que ya existe (lecturas) y provocar un
// error controlado, y con eso distinguir los tres fallos que de verdad pasan:
//
//   1. La llave secreta fue RENOVADA en el panel y en Railway quedó la vieja.
//      Culqi revoca la anterior en el acto: todo cobro devuelve 401 y el
//      usuario ve "No se pudo procesar el pago" sin más explicación.
//   2. Las dos llaves son de ENTORNOS DISTINTOS (pública de test y secreta de
//      live, o al revés). El widget genera un token de test y el backend
//      intenta cobrarlo con la llave live: Culqi lo rechaza siempre. Pasó de
//      verdad, y desde fuera se ve igual que el caso 1.
//   3. Sigue habiendo llaves de TEST en producción. Entonces cualquiera que
//      entre a /precios se activa un plan de pago gratis con la tarjeta
//      4111 1111 1111 1111.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const API_URL = 'https://api.culqi.com/v2';
const TOKENS_URL = 'https://secure.culqi.com/v2/tokens';

let fallos = 0;
const ok = (...a) => console.log('✓', ...a);
const mal = (...a) => { fallos++; console.error('✗', ...a); };
const aviso = (...a) => console.warn('⚠ ', ...a);

const entorno = (llave) => (llave.includes('_live_') ? 'live' : llave.includes('_test_') ? 'test' : 'desconocido');

(async () => {
  const pk = (process.env.CULQI_PUBLIC_KEY || '').trim();
  const sk = (process.env.CULQI_SECRET_KEY || '').trim();

  if (!pk || !sk) {
    console.error('✗ Faltan CULQI_PUBLIC_KEY y/o CULQI_SECRET_KEY.');
    console.error('  Para verificar las de producción: railway run node scripts/verificar-culqi-live.js');
    process.exit(1);
  }

  // ── 1. Forma de las llaves ───────────────────────────────
  // El BOM tiene su propia comprobación porque ya se coló una vez: en
  // PowerShell, `"valor" | railway variable set X --stdin` antepone un BOM
  // UTF-8 invisible al valor. La llave se ve idéntica en el panel y en el log,
  // mide un carácter más y Culqi devuelve 401 sin decir por qué.
  if (process.env.CULQI_SECRET_KEY !== sk || process.env.CULQI_PUBLIC_KEY !== pk) {
    mal('Alguna llave tiene espacios, salto de línea o BOM alrededor del valor — Culqi devolverá 401.');
    console.error('    Volver a cargarla desde bash:  printf \'%s\' \'sk_live_…\' | railway variable set CULQI_SECRET_KEY --stdin --service api');
  }

  const entPk = entorno(pk);
  const entSk = entorno(sk);
  if (entPk === 'desconocido' || entSk === 'desconocido') {
    mal(`Alguna llave no parece de Culqi (pública "${pk.slice(0, 8)}…", secreta "${sk.slice(0, 8)}…")`);
  } else if (entPk !== entSk) {
    mal(`Llaves de entornos DISTINTOS: pública ${entPk}, secreta ${entSk}.`);
    console.error('    El widget tokeniza con la pública y el backend cobra con la secreta: ningún pago va a completarse.');
  } else {
    ok(`Las dos llaves son del entorno ${entSk.toUpperCase()}`);
  }

  if (entSk === 'test') {
    aviso('Son llaves de TEST. Si esto es producción, cualquiera puede activarse un plan de pago');
    aviso('con la tarjeta 4111 1111 1111 1111 sin pagar nada.');
  }

  // ── 2. La llave secreta autentica ────────────────────────
  // GET /charges es de solo lectura: no crea nada ni mueve dinero. Es la
  // comprobación que dice si la llave sigue vigente o fue revocada al renovarla.
  try {
    const { data } = await axios.get(`${API_URL}/charges`, {
      headers: { Authorization: `Bearer ${sk}` },
      timeout: 60000,
    });
    ok('La llave SECRETA autentica contra la API de Culqi (lectura, sin mover dinero)');
    const cargos = data?.data?.length ?? 0;
    console.log(`   Cargos visibles en el entorno ${entSk}: ${cargos}`);
  } catch (e) {
    const codigo = e.response?.status;
    if (codigo === 401) {
      mal('La llave SECRETA está REVOCADA o es incorrecta (401).');
      console.error('    Culqi invalida la anterior en cuanto se pulsa "Renovar" en el panel.');
      console.error('    Copiar la vigente de CulqiPanel → Desarrollo → API Keys y volver a cargarla.');
    } else {
      mal(`La llave SECRETA no se pudo verificar (HTTP ${codigo || '?'}):`, e.message);
    }
  }

  // ── 3. La llave pública sigue viva ───────────────────────
  // Con llaves live Culqi NO deja tokenizar desde el servidor, así que este
  // POST siempre falla. Lo que importa es CÓMO falla:
  //   401 → la llave pública no vale (revocada, mal copiada, de otro comercio)
  //   400 → la llave vale y lo que rechaza es la petición
  // Sin tokenizar de verdad no se crea nada ni se cobra nada.
  try {
    await axios.post(
      TOKENS_URL,
      { card_number: '0000000000000000', cvv: '000', expiration_month: '1', expiration_year: '2000', email: 'verificacion@usenotoria.app' },
      { headers: { Authorization: `Bearer ${pk}` }, timeout: 60000 },
    );
    aviso('El endpoint de tokens aceptó una tarjeta inválida — revisar a mano');
  } catch (e) {
    const codigo = e.response?.status;
    if (codigo === 401) {
      mal('La llave PÚBLICA no es válida (401) — el widget de pago no va a abrir.');
    } else if (codigo === 400) {
      ok('La llave PÚBLICA es reconocida por Culqi (rechazó la tarjeta, no la llave)');
    } else {
      aviso(`Respuesta inesperada al verificar la pública (HTTP ${codigo || '?'}):`, e.message);
    }
  }

  // ── 4. Coherencia con lo que ve el navegador ─────────────
  // NEXT_PUBLIC_* se incrusta en el bundle EN TIEMPO DE BUILD: cambiar la
  // variable en Vercel no basta, hace falta un `vercel --prod` nuevo. Sin él,
  // el navegador sigue tokenizando con la llave vieja aunque el panel de Vercel
  // muestre la nueva.
  const WEB = process.env.FRONTEND_URL || 'https://usenotoria.app';
  try {
    const { data: html } = await axios.get(`${WEB}/precios`, { timeout: 60000 });
    const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"]+\.js/g)].map(m => m[0]))];
    let encontrada = null;
    for (const c of chunks) {
      const { data: js } = await axios.get(`${WEB}${c}`, { timeout: 30000 }).catch(() => ({ data: '' }));
      const m = String(js).match(/pk_(?:test|live)_[A-Za-z0-9]+/);
      if (m) { encontrada = m[0]; break; }
    }
    if (!encontrada) aviso(`No se encontró la llave pública en el bundle de ${WEB} — verificar a mano`);
    else if (encontrada === pk) ok(`El bundle desplegado en ${WEB} usa esta misma llave pública`);
    else {
      mal(`El navegador usa OTRA llave pública: ${encontrada} (aquí: ${pk}).`);
      console.error('    Corregir NEXT_PUBLIC_CULQI_PUBLIC_KEY en Vercel y REDESPLEGAR (vercel --prod --yes):');
      console.error('    la variable se incrusta en el build, no se lee en caliente.');
    }
  } catch (e) {
    aviso(`No se pudo leer ${WEB}/precios para comparar la llave del navegador:`, e.message);
  }

  console.log(fallos
    ? `\n${fallos} fallo(s) — los pagos NO están operativos`
    : '\nTodo OK — llaves válidas, del mismo entorno y coherentes con lo que corre en el navegador');
  process.exit(fallos ? 1 : 0);
})();
