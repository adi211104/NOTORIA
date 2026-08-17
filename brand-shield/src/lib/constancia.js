// brand-shield/src/lib/constancia.js
//
// Constancia de Reputación Online: un documento con código verificable que
// acredita el estado de la ficha de un negocio en una fecha concreta.
//
// ── Para qué sirve ──────────────────────────────────────────────────────────
// En el Perú todo pasa por un papel. Un centro comercial que evalúa a quién le
// alquila un local, un franquiciante que revisa a un franquiciado, un banco que
// estudia un crédito, un inversionista que mira un traspaso: todos piden
// documentos, y ninguno tiene forma de acreditar la reputación online de un
// negocio. Esto es ese papel.
//
// Y crea demanda desde el otro lado: el día que un mall se la pida a un
// inquilino, ese inquilino se registra.
//
// ── Por qué NO guarda nada ──────────────────────────────────────────────────
// La tentación era una tabla `constancias` con su correlativo. Pero eso exige un
// `prisma db push` que Railway no corre en el deploy, y sobre todo no hace falta:
// el documento se puede verificar sin base de datos si los propios datos viajan
// firmados dentro del código.
//
// El código es `<payload en base64url>.<HMAC-SHA256 con JWT_SECRET>`, el mismo
// mecanismo que `lib/oauthState.js`. Quien verifique no consulta un registro:
// recalcula la firma. Si cuadra, esos números salieron de Notoria en esa fecha y
// nadie los tocó por el camino — que es exactamente lo que un tercero necesita
// saber. Falsificar una constancia exigiría el JWT_SECRET.
//
// ⚠️ Consecuencia de no guardar nada: no se puede REVOCAR una constancia
// emitida, solo esperar a que caduque. Por eso caducan a los 90 días: un dato de
// reputación de hace tres meses ya no acredita nada, y así una constancia vieja
// deja de circular sola.
//
// ⚠️ Y otra: rotar JWT_SECRET invalida todas las constancias en circulación. Es
// el mismo secreto que ya firma los states de OAuth y los tokens de sesión, así
// que rotarlo ya era una operación con consecuencias; esta es una más.

const crypto = require('crypto');

const VIGENCIA_DIAS = 90;

const secreto = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET no está configurado — no se puede firmar la constancia');
  return s;
};

const firmar = (body) => crypto.createHmac('sha256', secreto()).update(body).digest('base64url');

/**
 * Genera el código verificable.
 *
 * Las claves del payload son de una letra a propósito: el código va impreso en
 * el documento y dentro de un QR, y cada carácter de más engorda el QR y le baja
 * la tolerancia a un escaneo torcido.
 */
const emitirCodigo = ({ nombre, rating, totalResenas, diasVigilado, incidentes, placeId }) => {
  const payload = {
    n: String(nombre || '').slice(0, 120),
    r: Number(rating) || 0,
    t: Number(totalResenas) || 0,
    d: Number(diasVigilado) || 0,
    i: Number(incidentes) || 0,
    p: String(placeId || '').slice(0, 200),
    e: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${firmar(body)}`;
};

/**
 * Verifica un código. Devuelve { valida, motivo, datos }.
 *
 * Nunca lanza: lo llama una ruta pública a la que puede llegar cualquier cosa,
 * incluido un código copiado a medias desde un PDF.
 */
const verificarCodigo = (codigo) => {
  try {
    if (typeof codigo !== 'string' || !codigo.includes('.')) {
      return { valida: false, motivo: 'FORMATO' };
    }
    const [body, firma] = codigo.split('.');
    const esperada = firmar(body);
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    // timingSafeEqual exige longitudes iguales, y comparar antes evita que lance
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valida: false, motivo: 'FIRMA' };
    }

    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    const emitida = new Date(p.e);
    const vence = new Date(p.e + VIGENCIA_DIAS * 86400000);
    if (Date.now() > vence.getTime()) {
      return {
        valida: false,
        motivo: 'VENCIDA',
        datos: { nombre: p.n, emitida, vence },
      };
    }

    return {
      valida: true,
      datos: {
        nombre: p.n,
        rating: p.r,
        totalResenas: p.t,
        diasVigilado: p.d,
        incidentes: p.i,
        placeId: p.p,
        emitida,
        vence,
      },
    };
  } catch {
    return { valida: false, motivo: 'FORMATO' };
  }
};

module.exports = { emitirCodigo, verificarCodigo, VIGENCIA_DIAS };
