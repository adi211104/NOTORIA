'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '../../components/Icons';
import { API_URL } from '../../lib/api';
import LogoNotoria from '../../components/LogoNotoria';

export default function ResetearPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [form, setForm] = useState({ password:'', confirmar:'' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [cargando, setCargando] = useState(false);

  // Leemos el token del query (?token=...) sin useSearchParams para no exigir
  // un <Suspense> en el build de Next.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('token');
      if (t) setToken(t);
    } catch {}
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden.'); return; }
    setCargando(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/resetear-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo restablecer la contraseña');
      setOk(true);
      setTimeout(() => router.push('/login'), 2500);
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
          <p style={{ color:'var(--text-2)', fontSize:14, margin:0 }}>Crea una nueva contraseña</p>
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:18, padding:28 }}>
          {ok ? (
            <>
              <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text)', margin:'0 0 12px' }}>Contraseña restablecida</h2>
              <p style={{ color:'var(--text-2)', fontSize:14, lineHeight:1.7, margin:'0 0 20px' }}>
                Tu contraseña se actualizó correctamente. Te llevamos a iniciar sesión…
              </p>
              <Link href="/login" style={{ display:'block', textAlign:'center', background:'#0B7324', color:'#fff', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, textDecoration:'none' }}>
                Ir a iniciar sesión
              </Link>
            </>
          ) : !token ? (
            <>
              <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text)', margin:'0 0 12px' }}>Enlace inválido</h2>
              <p style={{ color:'var(--text-2)', fontSize:14, lineHeight:1.7, margin:'0 0 20px' }}>
                Este enlace no es válido o le falta el token. Solicita uno nuevo desde la pantalla de recuperación.
              </p>
              <Link href="/recuperar-password" style={{ display:'block', textAlign:'center', background:'#0B7324', color:'#fff', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, textDecoration:'none' }}>
                Solicitar nuevo enlace
              </Link>
            </>
          ) : (
            <>
              <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text)', margin:'0 0 18px' }}>Elige tu nueva contraseña</h2>
              {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>{error}</div>}
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Nueva contraseña</label>
                  <input type="password" required value={form.password} onChange={e => setForm({...form,password:e.target.value})} placeholder="Mínimo 8 caracteres"
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:'10px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:5 }}>Confirmar contraseña</label>
                  <input type="password" required value={form.confirmar} onChange={e => setForm({...form,confirmar:e.target.value})} placeholder="••••••••"
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:'10px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }} />
                </div>
                <button type="submit" disabled={cargando} style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, cursor:'pointer', opacity:cargando?0.6:1 }}>
                  {cargando ? 'Guardando...' : 'Restablecer contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
