// brand-shield/src/lib/firmaDocumentos.js
//
// Firma de los DOCUMENTOS verificables: la constancia de reputación
// (lib/constancia.js) y el expediente (lib/expedienteCodigo.js).
//
// 🔴 Hasta el 2026-10-02 se firmaban con `JWT_SECRET`, el mismo secreto de las
// sesiones (auditoría P2-04). Eso ataba dos cosas que no tienen nada que ver:
// rotar el secreto de sesiones —lo que se hace ante una filtración— invalidaba
// de golpe todas las constancias y expedientes en circulación, y un expediente
// vale 365 días y puede estar dentro de una denuncia penal.
//
// Ahora:
//   · se FIRMA con `DOCUMENTOS_SECRET` si existe (si no, con JWT_SECRET, como
//     antes, para no romper nada mientras la variable no esté puesta);
//   · se VERIFICA contra los dos: los documentos emitidos antes del cambio
//     siguen siendo válidos hasta que caduquen solos.
//
// Así, desde que DOCUMENTOS_SECRET está puesto, rotar JWT_SECRET ya no tumba
// ningún documento nuevo. ⚠️ El día que se quiera retirar JWT_SECRET de la
// verificación, esperar a que caduque el último documento firmado con él
// (365 días después del despliegue de DOCUMENTOS_SECRET).

const crypto = require('crypto');

const secretoFirma = () => {
  const s = process.env.DOCUMENTOS_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Ni DOCUMENTOS_SECRET ni JWT_SECRET están configurados — no se puede firmar el documento');
  return s;
};

const hmac = (secreto, body) => crypto.createHmac('sha256', secreto).update(body).digest('base64url');

/** Firma de un cuerpo ya serializado. */
const firmar = (body) => hmac(secretoFirma(), body);

/** ¿La firma es de alguno de los secretos vigentes? Comparación en tiempo constante. */
const firmaValida = (body, firma) => {
  const a = Buffer.from(String(firma || ''));
  const candidatos = [...new Set([process.env.DOCUMENTOS_SECRET, process.env.JWT_SECRET].filter(Boolean))];
  return candidatos.some((s) => {
    const b = Buffer.from(hmac(s, body));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
};

module.exports = { firmar, firmaValida };
