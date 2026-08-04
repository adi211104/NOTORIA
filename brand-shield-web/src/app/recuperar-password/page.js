'use client';
import { useState } from 'react';
import Link from 'next/link';
import Icon from '../../components/Icons';
import { API_URL } from '../../lib/api';
import LogoNotoria from '../../components/LogoNotoria';

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setCargando(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/recuperar-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo procesar la solicitud');
      // El backend responde igual exista o no el correo (no revela usuarios).
      setEnviado(true);
    } catch (err) {
      setError(err.message || 'No se pudo conectar al servidor.');
    } finally { setCargando(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ marginBottom:6, display:'flex', justifyContent:'center' }}><LogoNotoria size={30} color="#0B7324" /></div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>Notoria</h1>
          <p style={{ color:'var(--text-2)', fontSize:14, margin:0 }}>Recupera el acceso a tu cuenta</p>
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:18, padding:28 }}>
          {enviado ? (
            <>
              <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text)', margin:'0 0 12px' }}>Revisa tu correo</h2>
              <p style={{ color:'var(--text-2)', fontSize:14, lineHeight:1.7, margin:'0 0 8px' }}>
                Si <strong>{email}</strong> está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.
              </p>
              <p style={{ color:'var(--text-3)', fontSize:12, margin:'0 0 20px' }}>El enlace expira en 1 hora.</p>
              <Link href="/login" style={{ display:'block', textAlign:'center', background:'#0B7324', color:'#fff', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, textDecoration:'none' }}>
                Volver a iniciar sesión
              </Link>
            </>
          ) : (
            <>
              <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text)', margin:'0 0 8px' }}>¿Olvidaste tu contraseña?</h2>
              <p style={{ color:'var(--text-2)', fontSize:13, lineHeight:1.6, margin:'0 0 18px' }}>
                Ingresa tu correo y te enviaremos un enlace para crear una nueva.
              </p>
              {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>{error}</div>}
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Correo electrónico</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com"
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:'10px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }} />
                </div>
                <button type="submit" disabled={cargando} style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, cursor:'pointer', opacity:cargando?0.6:1 }}>
                  {cargando ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
              <p style={{ textAlign:'center', fontSize:13, color:'var(--text-3)', marginTop:18, marginBottom:0 }}>
                <Link href="/login" style={{ color:'#4CAF66', textDecoration:'none' }}>Volver a iniciar sesión</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
