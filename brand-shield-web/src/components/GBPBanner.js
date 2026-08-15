'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIdioma } from '../context/IdiomaContext';

import { API_URL } from '../lib/api';
const getToken = () => localStorage.getItem('bs_token');

// Este banner era el ÚNICO trozo del panel escrito a mano en español, sin pasar
// por el contexto de idioma. Con la interfaz en inglés aparecía un bloque en
// español encima de todas las pantallas — se vio en el screencast del App Review
// de Meta, que es donde peor sienta.
const TEXTOS = {
  es: {
    titulo: (n) => <>Conecta Google Business para <strong>{n}</strong></>,
    desc: 'Accede a todas tus reseñas y respóndelas directamente desde Notoria.',
    queNecesito: '¿Qué necesito para conectar?',
    conectar: 'Conectar Google Business →',
    conectando: 'Conectando…',
    ayuda: <>Necesitas iniciar sesión con la cuenta de Google <strong>que administra este negocio en Google Maps</strong> (la del correo que lo creó o fue agregado como propietario/gerente). Si no tienes acceso a ese correo, poco se puede hacer desde Notoria: pide a quien gestiona el negocio que te agregue como gerente en Google Business Profile, o inicia el proceso de reclamo de propiedad directamente con Google.</>,
  },
  en: {
    titulo: (n) => <>Connect Google Business for <strong>{n}</strong></>,
    desc: 'Get all your reviews and reply to them straight from Notoria.',
    queNecesito: 'What do I need to connect?',
    conectar: 'Connect Google Business →',
    conectando: 'Connecting…',
    ayuda: <>You need to sign in with the Google account <strong>that manages this business on Google Maps</strong> (the one that created it, or was added as an owner or manager). If you do not have access to that account, there is little Notoria can do: ask whoever manages the business to add you as a manager on Google Business Profile, or start the ownership claim process directly with Google.</>,
  },
};

export default function GBPBanner() {
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [negocioSinGBP, setNegocioSinGBP] = useState(null);
  const [conectando, setConectando] = useState(false);
  const [mostrarInfo, setMostrarInfo] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    fetch(`${API_URL}/api/negocios`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(r => r.json()).then(data => {
      if (!Array.isArray(data)) return;
      const sinGBP = data.find(n => n.googlePlaceId && !n.gbpLocationId);
      if (sinGBP) setNegocioSinGBP(sinGBP);
    }).catch(() => {});
  }, [usuario]);

  if (!negocioSinGBP) return null;

  const conectar = () => {
    setConectando(true);
    const token = getToken();
    window.location.href = `${API_URL}/api/auth/google-business/iniciar?negocioId=${negocioSinGBP.id}&token=${token}`;
  };

  return (
    <div style={{
      background: 'rgba(11,115,36,0.08)',
      border: '1px solid rgba(11,115,36,0.3)',
      borderRadius: 6, padding: '11px 16px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B7324" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>
          </svg>
          <div>
            <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, margin: '0 0 2px', fontFamily: "Georgia,'Times New Roman',serif" }}>
              {t.titulo(negocioSinGBP.nombre)}
            </p>
            <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0, fontFamily: "Georgia,'Times New Roman',serif" }}>
              {t.desc}{' '}
              <button onClick={() => setMostrarInfo(v => !v)}
                style={{ background:'none', border:'none', color:'#0B7324', textDecoration:'underline', cursor:'pointer', fontSize:12, padding:0, fontFamily:"Georgia,'Times New Roman',serif" }}>
                {t.queNecesito}
              </button>
            </p>
          </div>
        </div>
        <button onClick={conectar} disabled={conectando}
          style={{ background: '#0B7324', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: conectando ? 0.7 : 1, fontFamily: "Georgia,'Times New Roman',serif", transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = '#0D8A2A'}
          onMouseLeave={e => e.currentTarget.style.background = '#0B7324'}>
          {conectando ? t.conectando : t.conectar}
        </button>
      </div>
      {mostrarInfo && (
        <p style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.6, margin: '10px 0 0', paddingTop: 10, borderTop: '1px solid rgba(11,115,36,0.2)', fontFamily: "Georgia,'Times New Roman',serif" }}>
          {t.ayuda}
        </p>
      )}
    </div>
  );
}
