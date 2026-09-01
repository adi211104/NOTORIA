'use client';
// Aviso de cookies/almacenamiento. Notoria solo usa almacenamiento esencial
// (sesión, tema, idioma) y el script de Google Sign-In, que puede colocar
// cookies de terceros en las páginas de login/registro. No usamos cookies
// publicitarias ni de rastreo, así que el aviso es informativo con una sola
// preferencia real: permitir o no el script de Google.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useIdioma } from '../context/IdiomaContext';

const GEO = "Georgia,'Times New Roman',serif";

const TEXTOS = {
  es: {
    titulo: 'Tu privacidad, sin letra pequeña',
    cuerpo: 'Notoria solo usa almacenamiento esencial para tu sesión y preferencias. No usamos cookies publicitarias ni de rastreo. El botón "Acceder con Google" carga un script de Google que puede usar cookies propias de Google.',
    aceptar: 'Aceptar todo',
    esencial: 'Solo esencial',
    privacidad: 'Política de privacidad',
  },
  en: {
    titulo: 'Your privacy, no fine print',
    cuerpo: 'Notoria only uses essential storage for your session and preferences. We do not use advertising or tracking cookies. The "Sign in with Google" button loads a Google script that may use Google\'s own cookies.',
    aceptar: 'Accept all',
    esencial: 'Essential only',
    privacidad: 'Privacy policy',
  },
};

// 🔴 Rutas que van FIJAS en español y no llaman a `useIdioma`: el circuito de
// entrada y los documentos legales peruanos. Está decidido que se quedan así
// (mercado Perú), pero este banner se monta en `layout.js` y por tanto sale
// ENCIMA de ellas — y si mira el idioma del navegador, un visitante en inglés
// ve «Your privacy, no fine print» sobre un formulario que dice «Crear cuenta
// gratis». Dos idiomas en la misma pantalla.
//
// Es el mismo error que el cartel de la promo dentro de `/precios` (25/08): un
// componente que decide su propio idioma dentro de una página que no lo hace
// SIEMPRE va a discrepar con ella. Allá se resolvió con `idiomaForzado`; acá no
// sirve, porque el banner no lo monta la página sino el layout raíz — así que
// tiene que preguntar él dónde está.
//
// ⚠️ Al traducir alguna de estas páginas, quitarla de la lista. Y al añadir una
// página nueva en español fijo, sumarla: si no, reaparece la discrepancia.
const RUTAS_SOLO_ES = [
  '/login', '/registro', '/recuperar-password', '/resetear-password',
  '/onboarding', '/verificar-email', '/precios', '/terminos', '/privacidad',
  '/libro-reclamaciones', '/devoluciones', '/eliminar-datos', '/contacto',
];

export default function CookieBanner() {
  const { idioma: idiomaContexto } = useIdioma();
  const ruta = usePathname();
  const [visible, setVisible] = useState(false);
  // La página manda sobre el navegador: si ella está en español, el banner también.
  const idioma = RUTAS_SOLO_ES.some((r) => ruta === r || ruta?.startsWith(r + '/'))
    ? 'es'
    : idiomaContexto;
  const t = TEXTOS[idioma] || TEXTOS.es;

  useEffect(() => {
    try {
      if (!localStorage.getItem('bs_cookies')) setVisible(true);
    } catch {}
  }, []);

  const decidir = (valor) => {
    try { localStorage.setItem('bs_cookies', valor); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 9998,
      maxWidth: 560, margin: '0 auto',
      background: 'var(--surface, #1A1A18)', border: '1px solid var(--border-c, #2C2C2A)',
      borderRadius: 12, padding: '16px 20px', fontFamily: GEO,
      boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B7324" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <div>
          <p style={{ color: 'var(--text, #fff)', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{t.titulo}</p>
          <p style={{ color: 'var(--text-2, #B0AEA5)', fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
            {t.cuerpo}{' '}
            <Link href="/privacidad" style={{ color: '#4CAF66' }}>{t.privacidad}</Link>
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={() => decidir('esencial')}
          style={{ background: 'transparent', border: '1px solid var(--border-c, #2C2C2A)', color: 'var(--text-2, #B0AEA5)', borderRadius: 7, padding: '9px 16px', fontSize: 12.5, cursor: 'pointer', fontFamily: GEO }}>
          {t.esencial}
        </button>
        <button onClick={() => decidir('todo')}
          style={{ background: '#0B7324', border: 'none', color: '#fff', borderRadius: 7, padding: '9px 18px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: GEO }}>
          {t.aceptar}
        </button>
      </div>
    </div>
  );
}
