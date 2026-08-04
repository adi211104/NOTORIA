// brand-shield/src/lib/oauthState.js
// State firmado (HMAC-SHA256) para los flujos OAuth (Google Business, Instagram,
// TikTok). Antes el "state" era solo base64 del { negocioId, userId } — legible y
// FALSIFICABLE: cualquiera podía fabricar un state con IDs arbitrarios y completar
// el callback en nombre de otra cuenta. Ahora el payload va firmado con JWT_SECRET
// y con marca de tiempo, así el callback puede verificar que:
//   1) el state lo generó este backend (la firma no se puede replicar sin el secreto), y
//   2) no está vencido (ventana de 10 min — un flujo OAuth normal dura segundos).
// Es sin estado (no necesita guardar nada en BD): la firma es la prueba.

const crypto = require('crypto');

const TTL_MS = 10 * 60 * 1000; // 10 minutos
const secreto = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET no está configurado — no se puede firmar el state OAuth');
  return s;
};

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Genera un state firmado a partir de un objeto de datos (ej. { negocioId, userId }).
const firmarState = (datos) => {
  const payload = { ...datos, ts: Date.now(), nonce: crypto.randomBytes(9).toString('hex') };
  const body = b64url(JSON.stringify(payload));
  const firma = crypto.createHmac('sha256', secreto()).update(body).digest('base64url');
  return `${body}.${firma}`;
};

// Verifica firma + expiración y devuelve el payload. Lanza si es inválido/vencido.
const verificarState = (state) => {
  if (typeof state !== 'string' || state.indexOf('.') === -1) {
    throw new Error('state inválido');
  }
  const [body, firma] = state.split('.');
  const esperada = crypto.createHmac('sha256', secreto()).update(body).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('firma de state inválida');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!payload.ts || (Date.now() - payload.ts) > TTL_MS) {
    throw new Error('state OAuth expirado');
  }
  return payload;
};

module.exports = { firmarState, verificarState };
