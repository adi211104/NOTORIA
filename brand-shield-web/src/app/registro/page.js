'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';

import { API_URL } from '../../lib/api';
const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

// Evalúa la fuerza de la contraseña: longitud, mayúscula, minúscula, número y símbolo
const evaluarPassword = (pass) => {
  const criterios = [
    { ok: pass.length >= 8, l:'8+ caracteres' },
    { ok: /[A-Z]/.test(pass), l:'Una mayúscula' },
    { ok: /[a-z]/.test(pass), l:'Una minúscula' },
    { ok: /\d/.test(pass), l:'Un número' },
    { ok: /[^A-Za-z0-9]/.test(pass), l:'Un símbolo (!@#$...)' },
  ];
  const puntos = criterios.filter(c => c.ok).length + (pass.length >= 12 ? 1 : 0);
  const nivel = !pass ? null
    : puntos <= 2 ? { l:'Débil', c:'#ef4444', pct:25 }
    : puntos === 3 ? { l:'Regular', c:'#f59e0b', pct:50 }
    : puntos === 4 ? { l:'Buena', c:'#4CAF66', pct:75 }
    : { l:'Fuerte', c:'#22c55e', pct:100 };
  return { criterios, nivel };
};

export default function RegistroPage() {
  const { registro } = useAuth();
  const [form, setForm] = useState({ nombre:'', email:'', password:'' });
  // Prellenado desde ?email= — lo manda la página de invitación. La invitación
  // está atada a un correo concreto, así que dejar que lo escriban a mano es
  // regalar el error más caro: cuenta creada con otra dirección y enlace
  // inservible.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('email');
    if (e) setForm((f) => (f.email ? f : { ...f, email: e }));
  }, []);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const googleBtnRef = useRef(null);
  const googleInitialized = useRef(false);

  const { criterios, nivel } = evaluarPassword(form.password);

  // ?next=/ruta — a dónde volver tras crear la cuenta. Lo usa la invitación de
  // equipo: quien llega por un enlace de "te invitaron a X" no tiene cuenta, y
  // sin esto acabaría en el onboarding sin rastro de la invitación que venía a
  // aceptar. Se lee de window.location (igual que en /login) para no tener que
  // envolver la página en un <Suspense>. La validación de que sea una ruta
  // interna la hace `rutaSegura` en AuthContext.
  const destinoActual = () =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('next');

  const handleGoogleResponse = useCallback(async (response) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error con Google');
      localStorage.setItem('bs_token', data.token);
      localStorage.removeItem('bs_onboarding');
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = (next && /^\/(?!\/)/.test(next))
        ? next
        : (data.esNuevo ? '/onboarding' : '/dashboard');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || googleInitialized.current) return;

    const initGoogle = () => {
      if (!window.google || !googleBtnRef.current || googleInitialized.current) return;
      googleInitialized.current = true;
      window.google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleResponse });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme:'outline', size:'large',
        width: googleBtnRef.current.offsetWidth || 380,
        text:'signup_with', locale:'es',
      });
    };

    if (window.google) { initGoogle(); return; }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    script.onload = initGoogle;
    document.body.appendChild(script);
  }, [handleGoogleResponse]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setCargando(true);
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); setCargando(false); return; }
    if (!aceptaTerminos) { setError('Debes aceptar los Términos y la Política de Privacidad para continuar.'); setCargando(false); return; }
    try { await registro(form.nombre, form.email, form.password, destinoActual()); }
    catch (err) { setError(err.message || 'Error al crear la cuenta'); }
    finally { setCargando(false); }
  };

  const inp = {
    width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)',
    color:'var(--text)', borderRadius:6, padding:'10px 13px', fontSize:14,
    outline:'none', boxSizing:'border-box', fontFamily:GEO,
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16, fontFamily:GEO }}>

      <div style={{ textAlign:'center', marginBottom:24 }}>
        <Link href="/" style={{ display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none', marginBottom:6 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria">
            <path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/>
          </svg>
          <span style={{ fontSize:20, fontWeight:800, color:'var(--text)' }}>Notoria</span>
        </Link>
        <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>Protege la reputación de tu negocio en todo el Perú</p>
      </div>

      <div style={{ width:'100%', maxWidth:400, background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:8, padding:28 }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:'0 0 20px' }}>Crear cuenta gratis</h2>

        {error && (
          <div style={{ background:'rgba(183,64,64,0.1)', border:'1px solid rgba(183,64,64,0.3)', color:'#f87171', borderRadius:6, padding:'10px 14px', marginBottom:16, fontSize:13 }}>
            {error}
          </div>
        )}

        {/* Botón Google — div estable, nunca desmontado */}
        <div ref={googleBtnRef} style={{ width:'100%', minHeight:44, marginBottom:4 }} />
        {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, height:44, background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:6, marginBottom:4, opacity:0.5 }}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span style={{ fontSize:13, color:'var(--text-2)' }}>Continuar con Google</span>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:12, margin:'14px 0' }}>
          <div style={{ flex:1, height:1, background:'var(--border-c)' }}/>
          <span style={{ color:'var(--text-3)', fontSize:12 }}>o con email</span>
          <div style={{ flex:1, height:1, background:'var(--border-c)' }}/>
        </div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Nombre completo</label>
            <input type="text" required value={form.nombre} onChange={e => setForm({...form, nombre:e.target.value})}
              placeholder="Tu nombre" style={inp}
              onFocus={e => e.target.style.borderColor=G} onBlur={e => e.target.style.borderColor='var(--border-c)'}/>
          </div>
          <div>
            <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Correo electrónico</label>
            <input type="email" required value={form.email} onChange={e => setForm({...form, email:e.target.value})}
              placeholder="tu@email.com" style={inp}
              onFocus={e => e.target.style.borderColor=G} onBlur={e => e.target.style.borderColor='var(--border-c)'}/>
          </div>
          <div>
            <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Contraseña</label>
            <input type="password" required value={form.password} onChange={e => setForm({...form, password:e.target.value})}
              placeholder="Mínimo 8 caracteres, mayúsculas y símbolos" style={inp}
              onFocus={e => { e.target.style.borderColor=G; setPassFocus(true); }}
              onBlur={e => e.target.style.borderColor='var(--border-c)'}/>

            {/* Medidor de fuerza */}
            {nivel && (
              <div style={{ marginTop:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:11, color:'var(--text-3)' }}>Fuerza de la contraseña</span>
                  <span style={{ fontSize:11, fontWeight:700, color:nivel.c }}>{nivel.l}</span>
                </div>
                <div style={{ height:4, background:'var(--border-c)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${nivel.pct}%`, background:nivel.c, borderRadius:2, transition:'width 0.25s ease, background 0.25s ease' }} />
                </div>
              </div>
            )}

            {/* Recomendaciones */}
            {(passFocus || form.password) && (
              <div style={{ marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 10px' }}>
                {criterios.map((c,i) => (
                  <span key={i} style={{ fontSize:11, color: c.ok ? '#4CAF66' : 'var(--text-3)', display:'flex', alignItems:'center', gap:5, transition:'color 0.2s' }}>
                    <span style={{ fontWeight:700 }}>{c.ok ? '✓' : '·'}</span> {c.l}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Términos y condiciones */}
          <label style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', userSelect:'none' }}>
            <input type="checkbox" checked={aceptaTerminos} onChange={e => setAceptaTerminos(e.target.checked)}
              style={{ marginTop:2, width:15, height:15, accentColor:G, cursor:'pointer', flexShrink:0 }} />
            <span style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.55 }}>
              Acepto los <Link href="/terminos" target="_blank" style={{ color:G, textDecoration:'none', fontWeight:600 }}>Términos de Servicio</Link> y
              la <Link href="/privacidad" target="_blank" style={{ color:G, textDecoration:'none', fontWeight:600 }}>Política de Privacidad</Link> de Notoria.
            </span>
          </label>

          <button type="submit" disabled={cargando || !aceptaTerminos}
            title={!aceptaTerminos ? 'Acepta los Términos y la Política de Privacidad para continuar' : undefined}
            style={{ background:G, color:'#fff', border:'none', borderRadius:6, padding:'12px', fontSize:14, fontWeight:700, cursor:(cargando||!aceptaTerminos)?'not-allowed':'pointer', opacity:(cargando||!aceptaTerminos)?0.55:1, fontFamily:GEO, transition:'background 0.15s, opacity 0.15s' }}
            onMouseEnter={e => { if(!cargando && aceptaTerminos) e.target.style.background='#0D8A2A'; }}
            onMouseLeave={e => e.target.style.background=G}>
            {cargando ? 'Creando cuenta...' : 'Crear cuenta gratis →'}
          </button>
        </form>

        <div style={{ marginTop:18, padding:'12px 14px', background:'var(--surface2)', borderRadius:6, fontSize:12, color:'var(--text-3)', lineHeight:1.7 }}>
          Incluye en el plan gratuito:
          {['1 negocio monitoreado','Alertas por email en tiempo real','Detección básica de reseñas falsas'].map(f => (
            <div key={f} style={{ display:'flex', gap:7, marginTop:3 }}>
              <span style={{ color:G, fontWeight:700 }}>✓</span>
              <span>{f}</span>
            </div>
          ))}
        </div>

        <p style={{ textAlign:'center', fontSize:13, color:'var(--text-3)', marginTop:16, marginBottom:0 }}>
          ¿Ya tienes cuenta? <Link href="/login" style={{ color:G, textDecoration:'none', fontWeight:500 }}>Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
