// brand-shield/src/api/routes/webhooks.routes.js
// Webhooks entrantes de Meta (Instagram).
//
// POR QUÉ EXISTE: el escaneo periódico lee una VENTANA (las 25 últimas
// publicaciones × 30 comentarios). Un comentario en una foto más antigua no se
// ve nunca, y ese es justo el sitio donde puede vivir una crisis: una
// publicación viral de hace meses con una queja nueva. El webhook avisa de
// cualquier publicación, sin ventana, y en segundos en vez de en horas.
//
// NO sustituye al barrido: los webhooks solo notifican desde que se configuran,
// así que al conectar una cuenta nueva el histórico sigue llegando por el
// escaneo. Conviven a propósito.
//
// SIN AUTENTICACIÓN DE SESIÓN: lo llama Meta, no el navegador del usuario. La
// autenticidad se comprueba con la firma HMAC del cuerpo (`firmaValida`), que es
// lo único que separa un evento real de uno inventado por quien conozca la URL.

const express = require('express');
const prisma = require('../../lib/prisma');
const { firmaValida, verificacion, comentariosDelEvento } = require('../../lib/webhookMeta');
const instagram = require('../../scrapers/instagram.scraper');
const { FUENTES_COMENTARIOS, guardarComentarioSocial } = require('../../workers/monitoreo.worker');

const router = express.Router();

const FUENTE_INSTAGRAM = FUENTES_COMENTARIOS.find((f) => f.id === 'INSTAGRAM');

// El cuerpo se recibe CRUDO: la firma de Meta se calcula sobre los bytes tal
// como llegaron, así que parsear antes y volver a serializar rompería la
// validación (ver el comentario en lib/webhookMeta.js).
const cuerpoCrudo = express.raw({ type: '*/*', limit: '1mb' });

// ── GET /api/webhooks/instagram ───────────────────────────
// Handshake de verificación. Meta lo llama al guardar la URL en el panel y al
// reactivar la suscripción; hay que devolver el challenge en TEXTO PLANO.
router.get('/instagram', (req, res) => {
  const r = verificacion(req.query);
  if (!r.ok) {
    console.warn(`[Webhook IG] Verificación rechazada: ${r.motivo}`);
    return res.sendStatus(403);
  }
  console.log('[Webhook IG] Verificación superada.');
  res.type('text/plain').send(r.challenge);
});

// ── POST /api/webhooks/instagram ──────────────────────────
router.post('/instagram', cuerpoCrudo, (req, res) => {
  if (!firmaValida(req.body, req.get('x-hub-signature-256'))) {
    // El log dice CON QUÉ se intentó validar: el fallo más probable no es un
    // atacante, es que Meta haya firmado con el secreto de la app de Instagram
    // (el de la pantalla de webhooks) en vez del de la app de Facebook. Sin
    // este dato, el 403 se lee como "los webhooks no funcionan" y no hay por
    // dónde empezar a mirar.
    console.warn(`[Webhook IG] Firma inválida — evento descartado. Secretos probados: META_APP_SECRET=${process.env.META_APP_SECRET ? 'sí' : 'no'}, META_IG_APP_SECRET=${process.env.META_IG_APP_SECRET ? 'sí' : 'no'}.`);
    return res.sendStatus(403);
  }

  let cuerpo;
  try {
    cuerpo = JSON.parse(req.body.toString('utf8'));
  } catch {
    console.warn('[Webhook IG] Cuerpo no es JSON válido.');
    return res.sendStatus(400);
  }

  // Se contesta ANTES de procesar. Meta espera un 200 rápido: si tardamos,
  // reintenta el mismo evento y luego desactiva la suscripción por fallos
  // repetidos. Guardar un comentario implica varias consultas y puede mandar
  // correo y WhatsApp — demasiado para dejar a Meta esperando.
  res.sendStatus(200);

  procesarEvento(cuerpo).catch((e) => console.error(`[Webhook IG] ${e.message}`));
});

const procesarEvento = async (cuerpo) => {
  const eventos = comentariosDelEvento(cuerpo);
  if (!eventos.length) return;

  for (const { igUserId, crudo } of eventos) {
    // findMany y no findFirst: la misma cuenta de Instagram puede estar
    // conectada a varios negocios (una franquicia con la cuenta de la marca),
    // y el comentario tiene que aparecer en todos.
    const negocios = await prisma.negocio.findMany({
      where: { instagramUserId: igUserId },
      include: { usuario: true },
    });

    if (!negocios.length) {
      // Cuenta que ya se desconectó de Notoria pero cuya página sigue suscrita
      // en Meta. No es un error nuestro; se registra para poder detectarlo.
      console.warn(`[Webhook IG] Evento de una cuenta sin negocio: ${igUserId}`);
      continue;
    }

    for (const negocio of negocios) {
      // Mismo corte que el escaneo: redes sociales son planes de pago.
      if (negocio.usuario?.plan === 'GRATIS') continue;

      try {
        // El caption no viaja en el evento y el panel lo muestra para dar
        // contexto ("comentario en: Nuevo menú de temporada"). Se pide a la
        // Graph API, y si falla se guarda igual: perder el título es molesto,
        // perder el comentario sería grave.
        const conCaption = { ...crudo };
        if (crudo.publicacionId && negocio.instagramAccessToken) {
          conCaption.publicacionCaption = await instagram
            .obtenerCaptionPublicacion(crudo.publicacionId, negocio.instagramAccessToken)
            .catch(() => '');
        }

        const resultado = await guardarComentarioSocial(negocio, FUENTE_INSTAGRAM, conCaption);
        if (resultado === 'creado') {
          console.log(`[Webhook IG] ${negocio.nombre}: comentario nuevo de ${crudo.autorNombre || 'un usuario'}`);
        }
      } catch (e) {
        console.error(`[Webhook IG] ${negocio.nombre}: ${e.message}`);
      }
    }
  }
};

module.exports = router;
// Se cuelga del router (que es una función) para que la prueba pueda ejercitar
// el procesamiento sin levantar Express ni fabricar un req/res falso.
module.exports.procesarEvento = procesarEvento;
