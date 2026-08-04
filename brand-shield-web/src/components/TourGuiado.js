'use client';
// Recorrido guiado para usuarios nuevos: unos pocos pasos señalando el sidebar
// del dashboard, saltable en cualquier momento con "Saltar todo". Se muestra
// una sola vez por usuario (localStorage bs_tour), después de terminar (u
// omitir) el onboarding de agregar el primer negocio (localStorage bs_onboarding).
import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useIdioma } from '../context/IdiomaContext';

const PASOS = [
  { key: 'negocios', es: { t: 'Tus negocios', d: 'Aquí ves, agregas y escaneas todos los negocios que monitoreamos por ti.' }, en: { t: 'Your businesses', d: 'Here you see, add and scan every business we monitor for you.' } },
  { key: 'alertas', es: { t: 'Alertas', d: 'Te avisamos aquí si detectamos reseñas falsas, ataques de bots o caídas de rating.' }, en: { t: 'Alerts', d: "We'll notify you here if we detect fake reviews, bot attacks or rating drops." } },
  { key: 'reportes', es: { t: 'Reportes PDF', d: 'Descarga un reporte profesional de tu reputación para socios o inversionistas.' }, en: { t: 'PDF reports', d: 'Download a professional reputation report for partners or investors.' } },
  { key: 'planes', es: { t: 'Planes', d: 'Compara los planes y desbloquea más negocios, IA y alertas.' }, en: { t: 'Plans', d: 'Compare plans and unlock more businesses, AI and alerts.' } },
  { key: 'facturacion', es: { t: 'Facturación', d: 'Revisa el historial de tus pagos: fecha, monto, titular y los primeros 4 dígitos de la tarjeta usada.' }, en: { t: 'Billing', d: 'Check your payment history: date, amount, cardholder and the first 4 digits of the card used.' } },
  { key: 'configuracion', es: { t: 'Configuración', d: 'Ajusta idioma, tema, notificaciones y seguridad de tu cuenta.' }, en: { t: 'Settings', d: 'Adjust language, theme, notifications and account security.' } },
];

const TEXTOS = {
  es: { paso:(i,n)=>`Paso ${i} de ${n}`, anterior:'← Anterior', siguiente:'Siguiente →', entendido:'Entendido', saltarTodo:'Saltar todo' },
  en: { paso:(i,n)=>`Step ${i} of ${n}`, anterior:'← Back', siguiente:'Next →', entendido:'Got it', saltarTodo:'Skip all' },
};

export default function TourGuiado() {
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const pathname = usePathname();
  const [activo, setActivo] = useState(false);
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState(null);

  // El layout del dashboard no se remonta al navegar entre sus páginas, así
  // que este efecto reacciona a cada cambio de ruta (no solo al montar) para
  // poder armar el tour en la primera página que corresponda.
  useEffect(() => {
    if (activo) return;
    try {
      if (localStorage.getItem('bs_onboarding') !== 'done' || localStorage.getItem('bs_tour')) return;
      // En la página de "bienvenida" (recién agregado un negocio) ya se
      // muestra el popup de recomendación de escaneo — no solaparlo con el
      // tour; se arma en la siguiente página que visite.
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('bienvenida') === '1') return;
      const timer = setTimeout(() => setActivo(true), 500);
      return () => clearTimeout(timer);
    } catch {}
  }, [pathname, activo]);

  const medir = useCallback(() => {
    const el = document.querySelector(`[data-tour="${PASOS[paso]?.key}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [paso]);

  useEffect(() => {
    if (!activo) return;
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [activo, medir]);

  const terminar = () => {
    try { localStorage.setItem('bs_tour', 'done'); } catch {}
    setActivo(false);
  };

  if (!activo || !rect) return null;

  const info = PASOS[paso][idioma] || PASOS[paso].es;
  const esUltimo = paso === PASOS.length - 1;
  const top = Math.max(12, rect.top);
  const left = rect.right + 14;

  return (
    <>
      <div style={{
        position: 'fixed', zIndex: 998, pointerEvents: 'none',
        top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8,
        borderRadius: 8, boxShadow: '0 0 0 3px #0B7324, 0 0 0 9999px rgba(0,0,0,0.55)',
        transition: 'all 0.25s ease',
      }} />
      <div style={{
        position: 'fixed', zIndex: 999, top, left, maxWidth: 280,
        background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 12,
        padding: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
      }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: '#4CAF66', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>
          {t.paso(paso + 1, PASOS.length)}
        </p>
        <h4 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>{info.t}</h4>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>{info.d}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={terminar} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
            {t.saltarTodo}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {paso > 0 && (
              <button onClick={() => setPaso(p => p - 1)} style={{ background: 'none', border: '1px solid var(--border-c)', color: 'var(--text-2)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                {t.anterior}
              </button>
            )}
            <button onClick={() => (esUltimo ? terminar() : setPaso(p => p + 1))}
              style={{ background: '#0B7324', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {esUltimo ? t.entendido : t.siguiente}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
