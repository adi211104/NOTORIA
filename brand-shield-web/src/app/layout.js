import './globals.css';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AuthProvider } from '../context/AuthContext';
import { IdiomaProvider } from '../context/IdiomaContext';
import CookieBanner from '../components/CookieBanner';

export const metadata = {
  metadataBase: new URL('https://usenotoria.app'),
  title: {
    default: 'Notoria — Monitor de reputación online',
    template: '%s — Notoria',
  },
  description: 'Detecta reseñas falsas, ataques de bots y caídas de rating antes de que el daño sea irreversible. Monitor de reputación para negocios del Perú.',
  keywords: ['reputación online', 'monitor reseñas', 'reseñas falsas', 'Google Business', 'restaurantes', 'hoteles'],
  authors: [{ name: 'Notoria' }],
  openGraph: {
    type: 'website',
    locale: 'es_419',
    url: 'https://usenotoria.app',
    siteName: 'Notoria',
    title: 'Notoria — Tu reputación puede hundirse en una sola noche.',
    description: 'Detecta reseñas falsas, ataques de bots y caídas de rating en tiempo real. Para negocios del Perú.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Notoria' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Notoria — Monitor de reputación online',
    description: 'Detecta reseñas falsas y ataques de bots antes de que destruyan tu negocio.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

// Datos estructurados para Google (rich results). Las preguntas duplican el FAQ
// de app/page.js a propósito: TEXTOS vive en un client component y no se puede
// importar desde este layout de servidor sin arrastrar todo el landing.
// ⚠️ Si editas una FAQ en page.js, actualízala también acá — Google penaliza
// que el JSON-LD no coincida con el contenido visible.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Notoria',
      url: 'https://usenotoria.app',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: 'Monitor de reputación online para negocios del Perú —restaurantes, hoteles, tiendas, clínicas y más—: detecta reseñas falsas, ataques de bots y caídas de rating antes de que cuesten clientes.',
      inLanguage: 'es',
      offers: [
        { '@type': 'Offer', name: 'Plan Gratuito', price: '0', priceCurrency: 'PEN' },
        { '@type': 'Offer', name: 'Plan Impulso', price: '29', priceCurrency: 'PEN' },
        { '@type': 'Offer', name: 'Plan Negocio', price: '59', priceCurrency: 'PEN' },
        { '@type': 'Offer', name: 'Plan Franquicia', price: '179', priceCurrency: 'PEN' },
      ],
      publisher: { '@type': 'Organization', name: 'NOTORIA E.I.R.L.', url: 'https://usenotoria.app' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        { q: '¿Necesito tarjeta de crédito para empezar?', a: 'No. El plan Gratuito es gratis para siempre e incluye 1 negocio monitoreado, score de reputación, QR para pedir reseñas y alertas por email. Solo pides una tarjeta si decides subir a un plan de pago.' },
        { q: '¿Cómo detecta Notoria las reseñas falsas?', a: 'Analizamos patrones típicos de ataques: reseñas que repiten el mismo texto desde cuentas distintas, calificaciones de 1 estrella sin ningún comentario, acusaciones graves, y picos de reseñas muy por encima del ritmo habitual de tu propia ficha. Cada reseña sospechosa se marca con el motivo para que puedas reportarla en Google.' },
        // ⚠️ Este bloque es una COPIA del FAQ visible de `page.js` y va a Google
        // como dato estructurado. Al corregir una pregunta hay que corregirla en
        // los dos sitios: ya pasó una vez que el JSON-LD siguió prometiendo una
        // detección imposible después de arreglar el visible. Estas dos
        // prometían Google Business Profile, que Google no nos ha concedido.
        { q: '¿Por qué solo veo 5 reseñas si mi negocio tiene cientos?', a: 'La API pública de Google entrega como máximo las 5 reseñas más recientes por consulta; es un límite de Google, no de Notoria. Por eso Notoria no funciona leyendo tu pasado sino vigilando lo que entra: escanea tu ficha cada 24, 12, 4 o 1 hora según tu plan y guarda cada reseña nueva que aparece. A las pocas semanas tienes muy por encima de cinco, y desde el día que te registras no se te escapa ninguna.' },
        { q: '¿Qué pasa si alguien cambia los datos de mi ficha en Google?', a: 'Google Maps permite que cualquier persona sugiera cambios sobre la ficha de un negocio ajeno —el horario, el teléfono, la dirección, incluso marcarla como cerrada permanentemente— y los aplica sin avisarle al dueño. Notoria compara esos datos en cada escaneo y te avisa el mismo día si algo cambió. El aviso de ficha cerrada está en todos los planes, incluido el Gratuito; el de teléfono, horario, nombre y dirección desde el plan Impulso.' },
        { q: '¿Puedo responder las reseñas desde Notoria?', a: 'Sí. Tienes 30 plantillas profesionales según las estrellas de la reseña y un asistente de IA que redacta la respuesta por ti. Guardamos tu respuesta, la copiamos al portapapeles y te abrimos tu ficha en Google Maps para que la pegues. La respuesta la publicas tú, en un clic.' },
        { q: '¿Qué pasa si mi rating cae de repente?', a: 'Notoria lo detecta en el siguiente escaneo y te envía una alerta inmediata por email —y una notificación en el teléfono si tienes instalada la app de Android— con el detalle de qué pasó: cuántas reseñas negativas, de qué cuentas y si tienen patrones de bot. Tú decides qué alertas recibir y con qué frecuencia.' },
        { q: '¿Cómo sabe Notoria quiénes son mis competidores?', a: 'Tú los eliges. Los buscas igual que a tu negocio, en Google Maps, y los agregas a la lista (1 en el plan Gratuito, 3 en Impulso, 5 en Negocio y 15 en Franquicia por cada negocio). Además, en el plan Franquicia Notoria busca por su cuenta locales de tu mismo rubro a la redonda y te los propone.' },
        { q: '¿Es legal analizar las reseñas de mis competidores?', a: 'Sí. Notoria solo lee lo que ya es público en Google Maps: el mismo rating y las mismas reseñas que vería cualquier persona buscando ese negocio. No accedemos a nada privado de su ficha, no interactuamos con sus reseñas y no publicamos nada en su nombre.' },
        { q: '¿Funciona en toda mi ciudad o solo en Lima?', a: 'En todo el Perú. Notoria monitorea cualquier negocio que tenga ficha en Google Maps, esté en Lima, Arequipa, Cusco, Trujillo o un distrito pequeño. Por ahora operamos solo en Perú: cobramos en soles y emitimos comprobantes peruanos.' },
        { q: '¿Puedo cancelar cuando quiera?', a: 'Sí. No hay contratos de permanencia. Puedes bajar de plan o cancelar en cualquier momento desde tu panel de control, y tu negocio seguirá monitoreado con el plan Gratuito.' },
        { q: '¿Mis datos están seguros?', a: 'Sí. Usamos cifrado en tránsito, tu contraseña se guarda con hash seguro y cumplimos la Ley 29733 de Protección de Datos Personales. No vendemos ni compartimos tus datos, y solo leemos la información pública de tu negocio más la que tú decidas conectar.' },
      ].map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            var t = localStorage.getItem('bs_tema');
            if (t !== 'dark' && t !== 'light') {
              t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            document.documentElement.setAttribute('data-theme', t);
          } catch(e) {
            document.documentElement.setAttribute('data-theme', 'dark');
          }
        `}</Script>
        <Script id="fuente-init" strategy="beforeInteractive">{`
          try {
            var f = localStorage.getItem('bs_fuente');
            document.documentElement.setAttribute('data-fuente', f === 'sistema' ? 'sistema' : 'georgia');
          } catch(e) {
            document.documentElement.setAttribute('data-fuente', 'georgia');
          }
        `}</Script>
        <IdiomaProvider>
          <AuthProvider>
            {children}
            <CookieBanner />
          </AuthProvider>
        </IdiomaProvider>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <Analytics />
        {/* ⚠️ Speed Insights llevaba encendido en el panel de Vercel desde que se
            activó y con `hasData: false`: la casilla estaba marcada y no medía
            nada, porque faltaba este componente. Se descubrió auditando el
            proyecto el 2026-08-28, no por un error — no lo produce.
            La CSP no hace falta tocarla: Vercel sirve el script y el beacon
            desde el propio origen (/_vercel/speed-insights/…), que `'self'`
            ya cubre en script-src y en connect-src. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
