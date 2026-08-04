// brand-shield/src/lib/whatsappMeta.js
// Cliente de WhatsApp Cloud API (Meta Graph API) para el canal de alertas
// urgentes exclusivo del plan Franquicia. Reemplaza a lib/twilio.js: usamos el
// mismo Meta App que Instagram, así no hay que contratar ni pagar Twilio.
//
// ESTADO: preparado, pendiente de credenciales.
// Cuando lleguen, agregar al .env del backend y se activa solo:
//   META_WHATSAPP_PHONE_NUMBER_ID   id del número emisor (Meta Business)
//   META_WHATSAPP_ACCESS_TOKEN      token permanente del System User
//   META_WHATSAPP_TEMPLATE          nombre de la plantilla aprobada
//   META_WHATSAPP_TEMPLATE_LANG     idioma de la plantilla (por defecto es_PE)
//
// ── POR QUÉ PLANTILLA Y NO TEXTO LIBRE ───────────────────────────────────────
// Meta solo permite mensajes de texto libre dentro de la "ventana de atención
// al cliente" de 24 h, que se abre cuando el usuario TE escribe a ti. Nuestras
// alertas son proactivas (avisamos de una reseña negativa sin que nadie nos
// haya escrito), así que esa ventana está cerrada casi siempre y un texto libre
// fallaría con el error 131047. Por eso el envío por defecto es de tipo
// `template`, con el detalle de la alerta como parámetro del cuerpo.
//
// Esto obliga a un paso manual previo: crear la plantilla en Meta Business
// Manager y esperar su aprobación. Debe ser de categoría UTILITY (no MARKETING)
// y tener exactamente UN parámetro en el cuerpo, por ejemplo:
//   "Notoria: {{1}}"
// El nombre que le pongas va en META_WHATSAPP_TEMPLATE.

const axios = require('axios');

const VERSION_GRAPH = process.env.META_GRAPH_VERSION || 'v21.0';
const PLANTILLA_POR_DEFECTO = 'notoria_alerta_urgente';
const IDIOMA_POR_DEFECTO = 'es_PE';

// Límite de Meta para un parámetro de plantilla. Cortamos antes de enviar
// porque el API rechaza el mensaje entero si se pasa, en vez de truncarlo.
const MAX_PARAMETRO = 1024;

const configurado = () =>
  !!(process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_WHATSAPP_ACCESS_TOKEN);

// Meta espera el número en formato internacional sin "+" ni separadores
// (ej. "+51 999 999 999" → "51999999999").
const normalizarTelefono = (telefono) => String(telefono || '').replace(/\D/g, '');

// Los parámetros de plantilla NO admiten saltos de línea, tabulaciones ni más
// de 4 espacios seguidos: Meta responde 132000 y descarta el mensaje. Como las
// descripciones de alerta pueden traer saltos, se aplanan acá.
const limpiarParametro = (texto) =>
  String(texto || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_PARAMETRO);

// Meta devuelve el detalle real del fallo anidado en error.error_data.details;
// error.message solo trae el genérico. Sin esto, depurar un rechazo de
// plantilla es adivinar.
const mensajeDeError = (error) => {
  const e = error?.response?.data?.error;
  if (!e) return error.message;
  const detalle = e.error_data?.details;
  return `${e.message}${e.code ? ` (código ${e.code})` : ''}${detalle ? ` — ${detalle}` : ''}`;
};

// Envía la alerta por WhatsApp. `to` es el teléfono del usuario en E.164
// (ej. "+51999999999"). Mantiene la firma de lib/twilio.js para que el
// call-site del worker no cambie más que en el require.
//
// Por defecto envía la plantilla aprobada. Con META_WHATSAPP_TEXTO_LIBRE=true
// manda texto plano: sirve para probar contra un número que acaba de
// escribirnos (ventana de 24 h abierta), no para producción.
const enviarWhatsApp = async ({ to, mensaje }) => {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const destino = normalizarTelefono(to);

  if (!destino) throw new Error('Teléfono de destino vacío o inválido');

  const textoLibre = process.env.META_WHATSAPP_TEXTO_LIBRE === 'true';

  const cuerpo = textoLibre
    ? {
        messaging_product: 'whatsapp',
        to: destino,
        type: 'text',
        text: { body: String(mensaje || '').slice(0, 4096) },
      }
    : {
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: process.env.META_WHATSAPP_TEMPLATE || PLANTILLA_POR_DEFECTO,
          language: { code: process.env.META_WHATSAPP_TEMPLATE_LANG || IDIOMA_POR_DEFECTO },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: limpiarParametro(mensaje) }] },
          ],
        },
      };

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${VERSION_GRAPH}/${phoneNumberId}/messages`,
      cuerpo,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return data;
  } catch (error) {
    // Se re-lanza con el detalle ya legible: el worker solo loguea el mensaje.
    throw new Error(mensajeDeError(error));
  }
};

module.exports = { configurado, enviarWhatsApp, normalizarTelefono, limpiarParametro };
