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
//   · se FIRMA solo con `DOCUMENTOS_SECRET`. Desde el 2026-10-07 sin respaldo a
//     JWT_SECRET (réplica del auditor, P2-N02): firmar un documento nuevo con el
//     secreto de sesiones volvía a atar los dos dominios. En producción es
//     crítico (lib/configProduccion.js): sin él la API no arranca;
//   · se VERIFICA también contra JWT_SECRET, pero solo hasta FIN_FIRMAS_JWT: los
//     documentos emitidos antes del 2026-10-02 siguen valiendo hasta que caducan
//     solos (el expediente dura 365 días), y después ese secreto sale solo del
//     verificador, sin que nadie tenga que acordarse.

const crypto = require('crypto');

// DOCUMENTOS_SECRET entró en producción el 2026-10-02/03; el último documento
// firmado con JWT_SECRET (un expediente, 365 días) caduca antes de esta fecha.
const FIN_FIRMAS_JWT = new Date('2027-10-05T00:00:00Z');

const secretoFirma = () => {
  const s = process.env.DOCUMENTOS_SECRET;
  if (!s) throw new Error('DOCUMENTOS_SECRET no está configurado — no se puede firmar el documento');
  return s;
};

const hmac = (secreto, body) => crypto.createHmac('sha256', secreto).update(body).digest('base64url');

/** Firma de un cuerpo ya serializado. */
const firmar = (body) => hmac(secretoFirma(), body);

/** ¿La firma es de alguno de los secretos vigentes? Comparación en tiempo constante. */
const firmaValida = (body, firma, ahora = Date.now()) => {
  const a = Buffer.from(String(firma || ''));
  const historico = ahora < FIN_FIRMAS_JWT.getTime() ? process.env.JWT_SECRET : null;
  const candidatos = [...new Set([process.env.DOCUMENTOS_SECRET, historico].filter(Boolean))];
  return candidatos.some((s) => {
    const b = Buffer.from(hmac(s, body));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
};

module.exports = { firmar, firmaValida, FIN_FIRMAS_JWT };
