// brand-shield/src/lib/cambioPassword.js
//
// Confirmación por correo del cambio de contraseña.
//
// ── Por qué hace falta ──────────────────────────────────────────────────────
// Antes bastaba con saber la contraseña actual: se cambiaba en el acto y el
// correo llegaba DESPUÉS, como aviso. Eso deja un hueco real — un teléfono
// desbloqueado un minuto sobre una mesa, una sesión abierta en una computadora
// compartida— y quien aprovechara ese minuto se llevaba la cuenta entera, porque
// cambiar la contraseña también expulsa al dueño.
//
// Ahora el cambio no se aplica hasta que alguien abre el enlace del correo. El
// atacante necesitaría además el buzón, que es justo la barrera que faltaba.
//
// ── Por qué no guarda nada ──────────────────────────────────────────────────
// El token lleva dentro el HASH BCRYPT de la contraseña nueva, firmado con
// HMAC-SHA256 (mismo mecanismo que lib/oauthState.js y lib/constancia.js). Así
// no hace falta ninguna columna ni tabla para recordar el cambio pendiente — y
// no hacen falta porque añadirlas obligaría a un `prisma db push` que Railway no
// corre en el deploy.
//
// ⚠️ El token lleva un hash, NO la contraseña. Aunque alguien interceptara el
// correo, de ahí no sale la contraseña en claro; lo que sí podría hacer es
// aplicar el cambio, que es exactamente lo que el enlace autoriza. Por eso la
// ventana es corta.

const crypto = require('crypto');

// 30 minutos: suficiente para ir al correo en el teléfono y volver, corto como
// para que un enlace olvidado en la bandeja no siga siendo una llave mañana.
const TTL_MS = 30 * 60 * 1000;

const secreto = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET no está configurado — no se puede firmar el cambio de contraseña');
  return s;
};

const firma = (body) => crypto.createHmac('sha256', secreto()).update(body).digest('base64url');

/** @param {{usuarioId: string, hashNuevo: string}} datos */
const firmarCambio = ({ usuarioId, hashNuevo }) => {
  const payload = { u: usuarioId, h: hashNuevo, ts: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${firma(body)}`;
};

/**
 * Devuelve { usuarioId, hashNuevo } o lanza. Lanza en vez de devolver null
 * porque el llamador siempre tiene que distinguir «caducó» de «no es válido»:
 * son dos mensajes distintos para el usuario.
 */
const verificarCambio = (token) => {
  if (typeof token !== 'string' || !token.includes('.')) {
    const e = new Error('El enlace no es válido.');
    e.codigo = 'TOKEN_INVALIDO';
    throw e;
  }
  const [body, recibida] = token.split('.');
  const esperada = firma(body);
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const e = new Error('El enlace no es válido.');
    e.codigo = 'TOKEN_INVALIDO';
    throw e;
  }

  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!p.ts || Date.now() - p.ts > TTL_MS) {
    const e = new Error('El enlace caducó. Vuelve a pedir el cambio desde la app o el panel.');
    e.codigo = 'TOKEN_EXPIRADO';
    throw e;
  }
  if (!p.u || !p.h) {
    const e = new Error('El enlace no es válido.');
    e.codigo = 'TOKEN_INVALIDO';
    throw e;
  }
  return { usuarioId: p.u, hashNuevo: p.h };
};

module.exports = { firmarCambio, verificarCambio, TTL_MS };
