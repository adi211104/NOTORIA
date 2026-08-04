'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/Icons';

import { API_URL } from '../../lib/api';
import LogoNotoria from '../../components/LogoNotoria';

export default function LoginPage() {
  const { login, loginConGoogle, usuario } = useAuth();
  const [form, setForm] = useState({ email:'', password:'' });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const googleBtnRef = useRef(null);
  const googleInitialized = useRef(false);

  const handleGoogleResponse = useCallback(async (response) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error con Google');
      await loginConGoogle(data.token, data.esNuevo);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    script.onload = () => {
      if (!window.google || !googleBtnRef.current || googleInitialized.current) return;
      googleInitialized.current = true;
      window.google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleResponse });
      window.google.accounts.id.renderButton(googleBtnRef.current, { theme:'outline', size:'large', width: googleBtnRef.current.offsetWidth || 380, text:'signin_with', locale:'es' });
    };
    document.body.appendChild(script);
    return () => { if(document.body.contains(script)) document.body.removeChild(script); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setCargando(true);
    try { await login(form.email, form.password); }
    catch (err) {
      if (err.type === 'NETWORK_ERROR') {
        setError('No se puede conectar al servidor. Verifica que el backend esté en ejecución.');
      } else if (err.message?.includes('Google') || err.tipo === 'GOOGLE_USER') {
        setError('Esta cuenta fue creada con Google. Usa el botón "Acceder con Google".');
      } else {
        setError(err.message || 'Email o contraseña incorrectos');
      }
    }
    finally { setCargando(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ marginBottom:6, display:'flex', justifyContent:'center' }}><LogoNotoria size={30} color="#0B7324" /></div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>Notoria</h1>
          <p style={{ color:'var(--text-2)', fontSize:14, margin:0 }}>Protege la reputación de tu negocio en todo el Perú</p>
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:18, padding:28 }}>
          <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text)', margin:'0 0 20px' }}>Iniciar sesión</h2>
          {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>{error}</div>}
          <div ref={googleBtnRef} style={{ width:'100%', marginBottom:4, minHeight:44 }} />
          {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, height:44, background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:8, marginBottom:4, opacity:0.6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <span style={{ fontSize:13, color:'var(--text-2)' }}>Continuar con Google</span>
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:12, margin:'16px 0' }}>
            <div style={{ flex:1, height:1, background:'var(--border-c)' }} />
            <span style={{ color:'var(--text-3)', fontSize:12 }}>o con email</span>
            <div style={{ flex:1, height:1, background:'var(--border-c)' }} />
          </div>
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Correo electrónico</label>
              <input type="email" required value={form.email} onChange={e => setForm({...form,email:e.target.value})} placeholder="tu@email.com"
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:'10px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Contraseña</label>
              <input type="password" required value={form.password} onChange={e => setForm({...form,password:e.target.value})} placeholder="••••••••"
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:'10px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }} />
            </div>
            <button type="submit" disabled={cargando} style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, cursor:'pointer', opacity:cargando?0.6:1 }}>
              {cargando ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
          <p style={{ textAlign:'center', fontSize:13, marginTop:14, marginBottom:0 }}>
            <Link href="/recuperar-password" style={{ color:'var(--text-3)', textDecoration:'none' }}>¿Olvidaste tu contraseña?</Link>
          </p>
          <p style={{ textAlign:'center', fontSize:13, color:'var(--text-3)', marginTop:10, marginBottom:0 }}>
            ¿No tienes cuenta? <Link href="/registro" style={{ color:'#4CAF66', textDecoration:'none' }}>Regístrate gratis</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
