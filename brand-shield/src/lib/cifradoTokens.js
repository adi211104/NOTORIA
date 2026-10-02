// brand-shield/src/lib/cifradoTokens.js
//
// Cifrado de los tokens OAuth de terceros guardados en `negocios` (auditoría
// 2026-10-02, P1-05).
//
// 🔴 Hasta este día los tokens de Facebook, Instagram, TikTok y Google Business
// vivían EN CLARO en Postgres — y la Política de Privacidad publicada decía
// «Tokens OAuth … (cifrados en base de datos)». Con una copia de la base (un
// respaldo extraviado, un `respaldo.js` subido donde no debía) se podía operar
// la cuenta de Instagram o de TikTok de cada cliente hasta que el token caducara.
//
// Cómo está hecho, y por qué así:
//
// · AES-256-GCM, con la clave en la variable `TOKENS_CLAVE` (fuera de la base).
//   Formato guardado: `enc:v1:<base64url(iv|tag|cifrado)>`.
//
// · El IV es DETERMINISTA (HMAC del texto). Lo normal es un IV aleatorio, pero
//   acá hay consultas que BUSCAN por token: TikTok rota el refresh token y lo
//   persiste con `updateMany({ where: { tiktokRefreshToken: viejo } })` para
//   actualizar todos los negocios que comparten esa cuenta. Con IV aleatorio esa
//   búsqueda dejaría de encontrar nada y el token rotado se perdería — la cuenta
//   se desconectaría sola al día siguiente, sin error. Lo que se paga es que dos
//   filas con el MISMO token tienen el mismo cifrado (se ve que es igual, no qué
//   es), que es aceptable para cadenas aleatorias de alta entropía.
//
// · Es TRANSPARENTE: va como extensión del cliente de Prisma (ver lib/prisma.js).
//   Se cifra al escribir y se descifra al leer, en cualquier modelo y a cualquier
//   profundidad. Las ~100 líneas que tocan tokens no cambian.
//
// · Convive con lo viejo: un valor sin el prefijo se devuelve tal cual, y un
//   filtro por token busca a la vez el valor cifrado y el claro. Así el deploy no
//   desconecta a nadie entre que sube el código y que corre
//   `scripts/cifrar-tokens.js`, que cifra las filas existentes.
//
// ⚠️ Sin `TOKENS_CLAVE` no se cifra nada (todo pasa en claro, como antes) y
// `lib/configProduccion.js` lo grita al arrancar. Perder la clave = todas las
// redes conectadas hay que reconectarlas (no se pierde nada más): está en
// docs/secretos.md con ese nivel.

const crypto = require('crypto');

// Los únicos campos cifrados. Son exclusivos de `Negocio`, así que basta con
// reconocerlos por NOMBRE en cualquier punto de una consulta.
const CAMPOS = new Set([
  'facebookAccessToken',
  'instagramAccessToken',
  'tiktokAccessToken', 'tiktokRefreshToken',
  'tiktokBizAccessToken', 'tiktokBizRefreshToken',
  'gbpAccessToken', 'gbpRefreshToken',
]);

const PREFIJO = 'enc:v1:';

let cacheClaves = { origen: null, cifrar: null, iv: null };
const claves = () => {
  const bruto = process.env.TOKENS_CLAVE;
  if (!bruto) return null;
  if (cacheClaves.origen !== bruto) {
    // Dos claves derivadas: una cifra, la otra calcula el IV. Usar la misma para
    // las dos mezclaría usos de una misma clave, que es justo lo que no se hace.
    const raiz = crypto.createHash('sha256').update(bruto).digest();
    cacheClaves = {
      origen: bruto,
      cifrar: crypto.createHmac('sha256', raiz).update('notoria-tokens-cifrado').digest(),
      iv: crypto.createHmac('sha256', raiz).update('notoria-tokens-iv').digest(),
    };
  }
  return cacheClaves;
};

const activo = () => !!claves();
const estaCifrado = (v) => typeof v === 'string' && v.startsWith(PREFIJO);

/** Cifra un token. Lo que no es una cadena no vacía, o ya va cifrado, sale tal cual. */
const cifrar = (texto) => {
  const k = claves();
  if (!k || typeof texto !== 'string' || !texto || estaCifrado(texto)) return texto;
  const iv = crypto.createHmac('sha256', k.iv).update(texto).digest().subarray(0, 12);
  const c = crypto.createCipheriv('aes-256-gcm', k.cifrar, iv);
  const cuerpo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return PREFIJO + Buffer.concat([iv, c.getAuthTag(), cuerpo]).toString('base64url');
};

/**
 * Descifra. Un valor sin prefijo (fila anterior a esto) se devuelve tal cual.
 *
 * ⚠️ Si el valor está cifrado y NO se puede descifrar (clave cambiada o
 * ausente), devuelve null en vez de lanzar: para el resto del código es una red
 * desconectada, que es lo que de verdad es. Lanzar tumbaría cualquier consulta
 * que traiga un negocio — el panel entero, por un token.
 */
const descifrar = (valor) => {
  if (!estaCifrado(valor)) return valor;
  const k = claves();
  if (!k) return null;
  try {
    const crudo = Buffer.from(valor.slice(PREFIJO.length), 'base64url');
    const iv = crudo.subarray(0, 12);
    const tag = crudo.subarray(12, 28);
    const d = crypto.createDecipheriv('aes-256-gcm', k.cifrar, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(crudo.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
};

const esObjetoPlano = (v) => v !== null && typeof v === 'object'
  && !(v instanceof Date) && !Buffer.isBuffer(v) && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * Recorre los argumentos de una consulta y cifra los valores de los campos de
 * token: en `data` (lo que se escribe) y en `where` (lo que se busca).
 *
 * Un filtro por igualdad sobre un token busca el cifrado Y el claro (`in`), para
 * que las filas anteriores al cifrado sigan apareciendo. Devuelve una copia; no
 * muta lo que recibe.
 */
const cifrarArgs = (nodo, enWhere = false) => {
  if (Array.isArray(nodo)) return nodo.map((x) => cifrarArgs(x, enWhere));
  if (!esObjetoPlano(nodo)) return nodo;
  const out = {};
  for (const [clave, valor] of Object.entries(nodo)) {
    if (CAMPOS.has(clave)) {
      out[clave] = cifrarValorDeCampo(valor, enWhere);
    } else {
      out[clave] = cifrarArgs(valor, enWhere || clave === 'where');
    }
  }
  return out;
};

const cifrarValorDeCampo = (valor, enWhere) => {
  if (typeof valor === 'string') {
    if (!enWhere) return cifrar(valor);
    const c = cifrar(valor);
    return c === valor ? valor : { in: [c, valor] };
  }
  if (!esObjetoPlano(valor)) return valor; // null, undefined, etc.
  // Operadores: { set: x } al escribir; { equals: x }, { not: x }, { in: [...] } al buscar.
  const out = {};
  for (const [op, v] of Object.entries(valor)) {
    if ((op === 'set' || op === 'equals' || op === 'not') && typeof v === 'string') {
      if (op === 'set') out.set = cifrar(v);
      else if (op === 'equals') { const c = cifrar(v); out.in = c === v ? [v] : [c, v]; }
      else { const c = cifrar(v); out.notIn = c === v ? [v] : [c, v]; }
    } else if ((op === 'in' || op === 'notIn') && Array.isArray(v)) {
      out[op] = [...new Set(v.flatMap((x) => (typeof x === 'string' ? [cifrar(x), x] : [x])))];
    } else {
      out[op] = v;
    }
  }
  return out;
};

/** Recorre un resultado y descifra los campos de token, en el sitio. */
const descifrarResultado = (nodo) => {
  if (Array.isArray(nodo)) { nodo.forEach(descifrarResultado); return nodo; }
  if (nodo === null || typeof nodo !== 'object' || nodo instanceof Date || Buffer.isBuffer(nodo)) return nodo;
  for (const clave of Object.keys(nodo)) {
    const v = nodo[clave];
    if (CAMPOS.has(clave)) nodo[clave] = descifrar(v);
    else if (v !== null && typeof v === 'object') descifrarResultado(v);
  }
  return nodo;
};

/** La extensión de Prisma que lo aplica a TODAS las consultas. */
const extension = {
  name: 'cifrado-tokens',
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const resultado = await query(args && activo() ? cifrarArgs(args) : args);
        return descifrarResultado(resultado);
      },
    },
  },
};

module.exports = { CAMPOS, PREFIJO, cifrar, descifrar, estaCifrado, activo, cifrarArgs, descifrarResultado, extension };
