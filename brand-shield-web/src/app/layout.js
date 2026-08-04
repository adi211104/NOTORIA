import './globals.css';
import Script from 'next/script';
import { AuthProvider } from '../context/AuthContext';
import { IdiomaProvider } from '../context/IdiomaContext';
import CookieBanner from '../components/CookieBanner';

export const metadata = {
  metadataBase: new URL('https://usenotoria.app'),
  title: {
    default: 'Notoria — Monitor de reputación online',
    template: '%s — Notoria',
  },
  description: 'Detecta reseñas falsas, ataques de bots y caídas de rating antes de que el daño sea irreversible. Monitor de reputación para restaurantes y hoteles del Perú.',
  keywords: ['reputación online', 'monitor reseñas', 'reseñas falsas', 'Google Business', 'restaurantes', 'hoteles'],
  authors: [{ name: 'Notoria' }],
  openGraph: {
    type: 'website',
    locale: 'es_419',
    url: 'https://usenotoria.app',
    siteName: 'Notoria',
    title: 'Notoria — Tu reputación puede hundirse en una sola noche.',
    description: 'Detecta reseñas falsas, ataques de bots y caídas de rating en tiempo real. Para restaurantes y hoteles del Perú.',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'Notoria' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Notoria — Monitor de reputación online',
    description: 'Detecta reseñas falsas y ataques de bots antes de que destruyan tu negocio.',
    images: ['/og-image.svg'],
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
      </body>
    </html>
  );
}
