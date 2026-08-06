// brand-shield/src/lib/webhookMeta.js
// Piezas puras del webhook de Meta: validación de la firma y normalización del
// evento. Están fuera de la ruta a propósito, para poder probarlas sin levantar
// Express ni tocar la base (scripts/prueba-instagram-webhook.js).

const crypto = require('crypto');

/**
 * Comprueba la cabecera `X-Hub-Signature-256` contra el cuerpo CRUDO.
 *
 * Tiene que ser el cuerpo tal cual llegó, byte a byte: si se valida sobre el
 * objeto ya parseado y vuelto a serializar, cualquier diferencia de orden de
 * claves, espaciado o escape de unicode cambia el hash y todo evento legítimo
 * se rechazaría. Por eso `index.js` guarda el buffer original.
 *
 * Sin esta comprobación, cualquiera que conozca la URL —que es pública— podría
 * inyectar comentarios falsos en el panel de un cliente y disparar alertas.
 */
const firmaValida = (cuerpoCrudo, cabecera, secreto = process.env.META_APP_SECRET) => {
  if (!secreto || !cabecera || !cuerpoCrudo) return false;
  const [algoritmo, recibida] = String(cabecera).split('=');
  if (algoritmo !== 'sha256' || !recibida) return false;

  const esperada = crypto.createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex');
  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from(recibida, 'utf8');
  // timingSafeEqual revienta si las longitudes difieren, así que se comprueba
  // antes; la comparación en sí va en tiempo constante para no filtrar el hash
  // correcto byte a byte a quien pruebe firmas al azar.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * Responde el handshake de verificación (GET) que Meta manda al guardar la URL
 * en el panel, y cada vez que se reactiva la suscripción.
 *
 * Devuelve { ok, challenge } — el challenge se devuelve TAL CUAL y como texto
 * plano: Meta lo compara literalmente y un JSON alrededor lo invalida.
 */
const verificacion = (query, tokenEsperado = process.env.META_WEBHOOK_VERIFY_TOKEN) => {
  const modo = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (!tokenEsperado) return { ok: false, motivo: 'sin_token_configurado' };
  if (modo !== 'subscribe') return { ok: false, motivo: 'modo_invalido' };
  if (token !== tokenEsperado) return { ok: false, motivo: 'token_no_coincide' };
  return { ok: true, challenge: String(challenge ?? '') };
};

/**
 * Saca de un evento de Instagram los comentarios nuevos, ya con la MISMA forma
 * que devuelve `instagram.scraper.js`. Así el webhook puede pasarlos por el
 * `aFila` de la fuente INSTAGRAM del worker sin un segundo mapeo que mantener.
 *
 * Devuelve [{ igUserId, crudo }] — el igUserId es el de la cuenta profesional,
 * que es como se localiza el negocio dueño (`Negocio.instagramUserId`).
 */
const comentariosDelEvento = (cuerpo) => {
  // `object` distingue el producto: la misma URL puede recibir eventos de
  // páginas de Facebook o de WhatsApp si algún día se suscriben, y procesarlos
  // como si fueran de Instagram guardaría basura.
  if (!cuerpo || cuerpo.object !== 'instagram') return [];

  const salida = [];
  for (const entrada of cuerpo.entry || []) {
    const igUserId = entrada.id;
    if (!igUserId) continue;
    for (const cambio of entrada.changes || []) {
      if (cambio.field !== 'comments') continue;
      const v = cambio.value || {};
      if (!v.id || v.text === undefined || v.text === null) continue;

      // Eco de lo nuestro: Meta también notifica los comentarios y respuestas
      // que publica la propia cuenta, incluidas las que Notoria acaba de enviar
      // desde el panel. Guardarlas las metería en la bandeja como si fueran de
      // un cliente, y una respuesta con palabras de disculpa clasificaría como
      // negativa y dispararía una alerta por nuestro propio mensaje.
      if (v.from?.id && String(v.from.id) === String(igUserId)) continue;

      salida.push({
        igUserId: String(igUserId),
        crudo: {
          // Mismo prefijo que el scraper: el `externalId` es @unique global y el
          // dedupe entre webhook y barrido depende de que coincidan exactamente.
          externalId: `ig_${v.id}`,
          texto: v.text,
          autorNombre: v.from?.username || null,
          // El evento no trae la hora del comentario; `entry.time` es el momento
          // en que Meta emitió la notificación, que para un webhook es lo mismo
          // salvo reintentos. Viene en segundos, no en milisegundos.
          fechaComentario: entrada.time ? new Date(entrada.time * 1000) : new Date(),
          publicacionId: v.media?.id || null,
          // El caption no viaja en el evento. La ruta intenta traerlo de la
          // Graph API; si falla, el comentario se guarda igual sin él.
          publicacionCaption: '',
          // Solo para trazas: `parent_id` marca que es respuesta dentro de un
          // hilo. No se guarda, pero explica por qué a veces llega un comentario
          // que no cuelga directamente de la publicación.
          esRespuesta: !!v.parent_id,
        },
      });
    }
  }
  return salida;
};

module.exports = { firmaValida, verificacion, comentariosDelEvento };
