// brand-shield/src/lib/expedienteCodigo.js
//
// El código verificable del expediente. Mismo mecanismo que la constancia
// (`lib/constancia.js`): payload firmado con HMAC-SHA256 sobre `JWT_SECRET`,
// sin tabla nueva, y quien verifica RECALCULA la firma en vez de consultar un
// registro.
//
// ── Por qué el expediente necesita esto ──────────────────────────────────────
//
// El expediente es el documento que el dueño lleva a una denuncia o le adjunta a
// un reporte ante la plataforma. Hasta hoy era un PDF: cualquiera podía abrirlo,
// cambiarle el texto de la reseña o la fecha, y no había forma de notarlo. Un
// documento que pretende servir de evidencia y que no se puede contrastar contra
// su emisor vale exactamente lo que valga la palabra de quien lo presenta.
//
// ── Lo que el código acredita, y lo que NO ───────────────────────────────────
//
// 🔴 Acredita **que Notoria registró ese texto, de ese autor, ese día**. Nada
// más. NO dice que la reseña sea falsa, ni que haya habido extorsión, ni que el
// negocio tenga razón — eso lo determinan la plataforma o la autoridad, y es la
// misma línea que gobierna al detector («comportamiento anómalo», nunca «esta
// reseña es falsa») y al propio PDF, que la lleva impresa.
//
// ── Por qué viaja un HASH del texto y no el texto ────────────────────────────
//
// 🔑 El texto de una reseña puede tener miles de caracteres y el código va
// impreso y dentro de un QR: meterlo entero lo volvería ilegible. Va su
// SHA-256 recortado, y con eso el documento queda atado a su contenido — si
// alguien edita una palabra del PDF, el hash impreso deja de corresponder. La
// página de verificación muestra el hash firmado para poder compararlo.
//
// ── Las dos consecuencias que hereda de la constancia ────────────────────────
//
// ⚠️ **No se puede revocar** un expediente emitido, solo esperar a que caduque.
// ⚠️ **Rotar `JWT_SECRET` invalida todos los que estén en circulación** — y acá
// pesa más que en la constancia, porque un expediente puede estar dentro de un
// trámite que dura meses.

const crypto = require('crypto');

// 🔴 Un año, y NO los 90 días de la constancia. No es un número copiado: son
// documentos que acreditan cosas distintas. La constancia dice «hoy este negocio
// tiene 4.6★», un dato que deja de significar nada en un trimestre. El
// expediente dice «el 15 de agosto existía esta reseña», que es un hecho pasado
// y sigue siendo cierto el año que viene — y una denuncia penal o un reclamo
// ante una plataforma tardan bastante más de 90 días en resolverse. Caducarlo
// antes dejaría al dueño con un documento muerto a mitad de su propio trámite.
const VIGENCIA_DIAS = 365;

// Discrimina este código del de la constancia. Sin él, un código de expediente
// se verificaría como constancia —la firma es válida, es el mismo secreto— y la
// página mostraría campos vacíos con un sello de «verificado». Ver la guarda
// gemela en `constancia.js`.
const TIPO = 'x';

// La clave sale de lib/firmaDocumentos.js: DOCUMENTOS_SECRET (o JWT_SECRET si
// todavía no está puesta), y se verifica contra las dos (auditoría P2-04).
const { firmar: firmarDocumento, firmaValida } = require('./firmaDocumentos');

const firmar = (body) => firmarDocumento(body);

/**
 * Huella del texto de la reseña.
 *
 * ⚠️ Se normaliza antes de hashear —espacios colapsados y sin espacios al
 * borde— porque el PDF reflowea el texto al imprimirlo y un salto de línea de
 * más no puede cambiar la huella de un documento que acredita contenido.
 * Lo que NO se toca son las mayúsculas ni las tildes: ahí sí, un cambio es un
 * cambio.
 */
const huellaTexto = (texto) => {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(limpio).digest('base64url').slice(0, 16);
};

/**
 * Genera el código verificable del expediente.
 *
 * Las claves son de una letra por lo mismo que en la constancia: el código va
 * impreso y dentro de un QR, y cada carácter de más le baja la tolerancia al
 * escaneo.
 */
const emitirCodigo = ({ negocio, resena, emitidoEn = new Date() }) => {
  const fecha = (v) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const payload = {
    k: TIPO,
    n: String(negocio?.nombre || '').slice(0, 120),
    p: String(negocio?.placeId || negocio?.googlePlaceId || '').slice(0, 200),
    // `null` y no 0: en Facebook una recomendación puede no traer estrella, y
    // un «0★» impreso en un documento que va a una denuncia es una afirmación
    // que la plataforma nunca hizo. Es la misma regla de `sinEstrella`.
    r: Number.isFinite(resena?.rating) ? Number(resena.rating) : null,
    a: String(resena?.autor || resena?.autorNombre || '').slice(0, 80),
    f: fecha(resena?.fechaResena),
    // La fecha en que NOSOTROS la vimos. Es la mitad del valor del documento:
    // acredita que el texto estaba publicado ese día aunque después lo borren.
    c: fecha(resena?.capturadaEn || resena?.detectadaEn),
    h: huellaTexto(resena?.texto),
    e: emitidoEn.getTime(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${firmar(body)}`;
};

/**
 * Verifica un código de expediente. Devuelve { valida, motivo, datos }.
 *
 * Nunca lanza: lo llama una ruta pública a la que puede llegar cualquier cosa,
 * incluido un código copiado a medias desde un PDF impreso.
 */
const verificarCodigo = (codigo) => {
  try {
    if (typeof codigo !== 'string' || !codigo.includes('.')) {
      return { valida: false, motivo: 'FORMATO' };
    }
    const [body, firma] = codigo.split('.');
    // En tiempo constante y contra los dos secretos vigentes (firmaDocumentos.js).
    if (!firmaValida(body, firma)) {
      return { valida: false, motivo: 'FIRMA' };
    }

    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    // 🔴 La guarda del tipo. Una constancia lleva firma igual de válida, y sin
    // esto se mostraría como expediente con todos los campos vacíos.
    if (p.k !== TIPO) return { valida: false, motivo: 'TIPO' };

    const emitido = new Date(p.e);
    const vence = new Date(p.e + VIGENCIA_DIAS * 86400000);
    if (Date.now() > vence.getTime()) {
      // ⚠️ VENCIDA se distingue de firma inválida a propósito, igual que en la
      // constancia: confundirlas sería acusar de fraude a alguien que solo
      // tiene un documento viejo.
      return { valida: false, motivo: 'VENCIDA', datos: { negocio: p.n, emitido, vence } };
    }

    return {
      valida: true,
      datos: {
        negocio: p.n,
        placeId: p.p || null,
        rating: Number.isFinite(p.r) ? p.r : null,
        autor: p.a || null,
        fechaResena: p.f ? new Date(p.f) : null,
        capturadaEn: p.c ? new Date(p.c) : null,
        huellaTexto: p.h || null,
        emitido,
        vence,
      },
    };
  } catch {
    return { valida: false, motivo: 'FORMATO' };
  }
};

module.exports = { emitirCodigo, verificarCodigo, huellaTexto, VIGENCIA_DIAS, TIPO };
