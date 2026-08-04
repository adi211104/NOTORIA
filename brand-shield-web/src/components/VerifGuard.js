'use client';
import { useState, useEffect } from 'react';

import { API_URL } from '../lib/api';
const GEO = "Georgia,'Times New Roman',serif";

// Modal de bloqueo para acciones que requieren verificación
export function VerifGuardModal({ onClose, onReenviar }) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const reenviar = async () => {
    if (timer > 0 || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reenviar-verificacion`, {
        method:'POST', headers:{ Authorization:`Bearer ${localStorage.getItem('bs_token')}` }
      });
      if (res.ok) { setEnviado(true); setTimer(60); if (onReenviar) onReenviar(); }
    } catch {}
    setEnviando(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface)', border:'1px solid rgba(138,109,0,0.4)', borderRadius:10, padding:28, maxWidth:400, width:'100%', fontFamily:GEO }}>
        <div style={{ display:'flex', gap:12, marginBottom:14, alignItems:'flex-start' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6D00" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
          <div>
            <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:'0 0 6px' }}>Confirma tu email primero</h3>
            <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.6 }}>
              Para acceder a esta función necesitas confirmar tu correo electrónico. Revisa tu bandeja de entrada o solicita un nuevo enlace.
            </p>
          </div>
        </div>

        <div style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:6, padding:'10px 14px', marginBottom:16 }}>
          <p style={{ fontSize:12, color:'var(--text-3)', margin:0, lineHeight:1.5 }}>
            El email fue enviado al registrarte. Revisa también la carpeta de spam. Puede tardar hasta 2 minutos en llegar.
          </p>
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={reenviar} disabled={enviando || timer > 0}
            style={{ flex:1, background: timer > 0 ? 'var(--surface2)' : '#0B7324', color: timer > 0 ? 'var(--text-3)' : '#fff', border: timer > 0 ? '1px solid var(--border-c)' : 'none', borderRadius:5, padding:'10px', fontSize:13, fontWeight:600, cursor: timer > 0 ? 'default' : 'pointer', fontFamily:GEO }}>
            {enviando ? 'Enviando...' : timer > 0 ? `Reenviar en ${timer}s` : enviado ? 'Enviado ✓ — Reenviar' : 'Reenviar confirmación'}
          </button>
          <button onClick={onClose}
            style={{ background:'transparent', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:5, padding:'10px 16px', fontSize:13, cursor:'pointer', fontFamily:GEO }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook para usar en cualquier componente
export function useVerifGuard(usuario) {
  const [showModal, setShowModal] = useState(false);

  // Devuelve una función que ejecuta la acción solo si el email está verificado
  const guard = (fn) => (...args) => {
    if (!usuario?.emailVerificado) { setShowModal(true); return; }
    fn(...args);
  };

  const Modal = showModal ? <VerifGuardModal onClose={() => setShowModal(false)} /> : null;

  return { guard, Modal, needsVerif: !usuario?.emailVerificado };
}
