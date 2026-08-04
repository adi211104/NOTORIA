'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { API_URL } from '../../lib/api';
const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

function VerificarContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [estado, setEstado] = useState('verificando');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!token) { setEstado('error'); setMensaje('No se encontró el token. Revisa el enlace en tu email.'); return; }
    fetch(`${API_URL}/api/auth/verificar-email?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.emailVerificado) { setEstado('ok'); setTimeout(() => router.push('/dashboard'), 3000); }
        else { setEstado('error'); setMensaje(data.error || 'Token inválido o expirado.'); }
      })
      .catch(() => { setEstado('error'); setMensaje('Error de conexión. Intenta nuevamente.'); });
  }, [token]);

  const color = estado === 'ok' ? G : estado === 'error' ? '#B74040' : '#9C9B96';

  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E8E6DC', borderRadius:8, padding:40, maxWidth:440, width:'100%', textAlign:'center' }}>
        <div style={{ width:60, height:60, borderRadius:'50%', background:`rgba(${estado==='ok'?'11,115,36':estado==='error'?'183,64,64':'156,155,150'},0.08)`, border:`2px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
          {estado==='verificando' && <div style={{ width:24, height:24, border:`2px solid ${G}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>}
          {estado==='ok' && <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
          {estado==='error' && <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B74040" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>}
        </div>

        {estado==='verificando' && <>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#141413', margin:'0 0 8px' }}>Verificando...</h1>
          <p style={{ fontSize:14, color:'#5C5B57', margin:0 }}>Confirmando tu cuenta de Notoria.</p>
        </>}
        {estado==='ok' && <>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#141413', margin:'0 0 8px' }}>Email verificado</h1>
          <p style={{ fontSize:14, color:'#5C5B57', margin:'0 0 20px', lineHeight:1.6 }}>Tu cuenta está activa. Te llevamos al panel de control en 3 segundos.</p>
          <Link href="/dashboard" style={{ display:'inline-block', background:G, color:'#fff', textDecoration:'none', padding:'11px 24px', borderRadius:5, fontWeight:700, fontSize:14, fontFamily:GEO }}>Ir ahora →</Link>
        </>}
        {estado==='error' && <>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#141413', margin:'0 0 8px' }}>Enlace inválido</h1>
          <p style={{ fontSize:14, color:'#5C5B57', margin:'0 0 20px', lineHeight:1.6 }}>{mensaje}</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <Link href="/dashboard" style={{ background:G, color:'#fff', textDecoration:'none', padding:'11px 24px', borderRadius:5, fontWeight:700, fontSize:14, fontFamily:GEO, display:'block' }}>Ir al panel de control</Link>
            <Link href="/login" style={{ background:'transparent', color:'#5C5B57', textDecoration:'none', padding:'11px 24px', borderRadius:5, fontSize:14, border:'1px solid #E8E6DC', fontFamily:GEO, display:'block' }}>Volver al login</Link>
          </div>
        </>}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default function VerificarEmailPage() {
  return (
    <div style={{ minHeight:'100vh', background:'#FAF9F5', display:'flex', flexDirection:'column', fontFamily:GEO }}>
      <nav style={{ borderBottom:'1px solid #E8E6DC', padding:'0 28px', height:56, display:'flex', alignItems:'center', gap:9 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
        <span style={{ fontWeight:800, fontSize:17, color:'#141413' }}>Notoria</span>
      </nav>
      <Suspense fallback={<div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><p style={{ color:'#9C9B96' }}>Cargando...</p></div>}>
        <VerificarContent/>
      </Suspense>
    </div>
  );
}
