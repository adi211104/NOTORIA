'use client';

// Botón flotante de ventas por WhatsApp — en Perú los dueños de restaurantes
// escriben por WhatsApp, no llenan formularios.
//
// 🔴 El número sale de `lib/contacto.js`, NO de una variable de entorno.
// Hasta el 2026-09-16 lo leía de `NEXT_PUBLIC_WHATSAPP_VENTAS`, que nació como
// interruptor mientras no se había decidido el número — y cuando el número ya
// estaba decidido y escrito en `CONTACTO`, esa variable dejó de ser un
// interruptor y pasó a ser una SEGUNDA COPIA del dato. Cambiar el número exigía
// entonces tocar dos sitios, y olvidar uno no produce ningún error: el pie de la
// web anuncia el número nuevo y este botón —el que de verdad usa el cliente para
// escribir— sigue mandando al viejo. Mudo y en la pantalla que más vende.
//
// ⚠️ La variable queda huérfana en Vercel; nadie la lee. Borrarla es limpieza,
// no urgencia.
//
// El mensaje va predeterminado a propósito: dice de dónde viene el prospecto, y
// eso sobrevive al saludo automático de WhatsApp Business, que se dispara DESPUÉS
// de que el cliente pulse enviar: primero llega su mensaje, después el saludo.

import { useIdioma } from '../context/IdiomaContext';
import { CONTACTO } from '../lib/contacto';

const NUMERO = CONTACTO.whatsapp;

const MENSAJES = {
  es: 'Hola, vi usenotoria.app y quiero saber más sobre el monitoreo de reputación para mi negocio.',
  en: 'Hi, I saw usenotoria.app and I would like to know more about reputation monitoring for my business.',
};

const ETIQUETA = { es: 'Escríbenos por WhatsApp', en: 'Chat with us on WhatsApp' };

export default function BotonWhatsApp() {
  const { idioma } = useIdioma();
  if (!NUMERO) return null;

  const url = `https://wa.me/${NUMERO}?text=${encodeURIComponent(MENSAJES[idioma] || MENSAJES.es)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ETIQUETA[idioma] || ETIQUETA.es}
      title={ETIQUETA[idioma] || ETIQUETA.es}
      style={{
        position: 'fixed', bottom: 22, right: 22, zIndex: 90,
        width: 54, height: 54, borderRadius: '50%',
        background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)', textDecoration: 'none',
        transition: 'transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" role="img" aria-hidden="true">
        <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.33 4.95L2 22l5.3-1.39a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.23 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14 0-.31-.01-.47-.01-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/>
      </svg>
    </a>
  );
}
