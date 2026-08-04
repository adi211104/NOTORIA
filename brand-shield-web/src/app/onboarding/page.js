'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/Icons';

import { API_URL } from '../../lib/api';
import { TIPOS_NEGOCIO } from '../../lib/tiposNegocio';
import LogoNotoria from '../../components/LogoNotoria';
const getToken = () => localStorage.getItem('bs_token');

export default function OnboardingPage() {
  const { usuario, cargando } = useAuth();
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState('RESTAURANTE');
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [negocioSel, setNegocioSel] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [negocioCreado, setNegocioCreado] = useState(null);
  const [error, setError] = useState('');
  const [saliendo, setSaliendo] = useState(false);
  const [negociosExistentes, setNegociosExistentes] = useState([]);
  const [sinAccesoGBP, setSinAccesoGBP] = useState(false);

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login');
  }, [usuario, cargando]);

  useEffect(() => {
    if (!usuario) return;
    fetch(`${API_URL}/api/negocios`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setNegociosExistentes(data);
          // El usuario ya completó el onboarding antes (tiene negocios) —
          // no volver a mostrarle el asistente, salvo que esté a mitad de flujo
          if (paso === 1) {
            localStorage.setItem('bs_onboarding', 'done');
            router.replace('/dashboard');
          }
        }
      }).catch(() => {});
  }, [usuario]);

  useEffect(() => {
    if (busqueda.length < 3) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(
          `${API_URL}/api/utils/buscar-negocio?q=${encodeURIComponent(busqueda)}&tipo=${tipo}`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        const data = await res.json();
        setResultados(Array.isArray(data) ? data : []);
      } catch { setResultados([]); }
      finally { setBuscando(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [busqueda, tipo]);

  const agregarNegocio = async () => {
    if (!negocioSel) return;
    setGuardando(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/negocios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ nombre: negocioSel.nombre, tipo, googlePlaceId: negocioSel.placeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al agregar');
      setNegocioCreado(data.negocio);
      setPaso(2);
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const volverAPaso2 = async () => {
    if (negocioCreado?.id) {
      await fetch(`${API_URL}/api/negocios/${negocioCreado.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
    }
    setNegocioCreado(null); setNegocioSel(null);
    setBusqueda(''); setResultados([]); setError('');
    setPaso(1);
  };

  const conectarGBP = () => {
    if (!negocioCreado?.id) return;
    const token = getToken();
    window.location.href = `${API_URL}/api/auth/google-business/iniciar?negocioId=${negocioCreado.id}&token=${token}`;
  };

  const irAlNegocio = () => {
    setSaliendo(true);
    localStorage.setItem('bs_onboarding', 'done');
    router.push(negocioCreado?.id ? `/dashboard/negocios/${negocioCreado.id}?bienvenida=1` : '/dashboard');
  };

  if (cargando || !usuario) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const nombre = usuario?.nombre?.split(' ')[0] || '';
  const pct = paso === 1 ? 33 : paso === 2 ? 66 : 100;
  const TOTAL = 3;

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border-c)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <LogoNotoria size={18} color="#0B7324" />
          <span style={{ fontWeight:700, color:'var(--text)', fontSize:15 }}>Notoria</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ fontSize:12, color:'var(--text-3)' }}>Paso {paso} de {TOTAL}</span>
          <button onClick={() => { localStorage.setItem('bs_onboarding','done'); router.push('/dashboard'); }}
            style={{ background:'none', border:'none', color:'var(--text-3)', fontSize:13, cursor:'pointer' }}>
            Saltar
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      <div style={{ height:3, background:'var(--border-c)' }}>
        <div style={{ height:'100%', background:'#0B7324', width:`${pct}%`, transition:'width 0.5s ease' }} />
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'32px 16px' }}>
        <div style={{ width:'100%', maxWidth: 520 }}>

          {/* ── PASO 1: Agregar negocio ─────────────────── */}
          {paso === 1 && (
            <div>
              <div style={{ marginBottom:22 }}>
                <p style={{ fontSize:11, fontWeight:600, color:'#4CAF66', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:1 }}>
                  Paso 1 de 3
                </p>
                <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 6px' }}>Hola {nombre}, agrega tu negocio</h1>
                <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>
                  Búscalo tal como aparece en Google Maps. Traemos tu rating desde el primer día.
                </p>
              </div>

              <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:18, padding:22 }}>
                {error && (
                  <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>{error}</div>
                )}

                {negociosExistentes.length > 0 && !negocioSel && (
                  <div style={{ background:'rgba(11,115,36,0.08)', border:'1px solid rgba(11,115,36,0.25)', borderRadius:10, padding:'11px 14px', marginBottom:14 }}>
                    <p style={{ fontSize:13, color:'var(--text)', margin:'0 0 6px', fontWeight:500 }}>Ya tienes {negociosExistentes.length} negocio(s):</p>
                    {negociosExistentes.map(n => <div key={n.id} style={{ fontSize:12, color:'var(--text-2)', marginBottom:2 }}>• {n.nombre}</div>)}
                    <button onClick={() => { localStorage.setItem('bs_onboarding','done'); router.push('/dashboard'); }}
                      style={{ fontSize:12, color:'#4CAF66', background:'none', border:'none', cursor:'pointer', marginTop:6, padding:0 }}>
                      Ir al panel de control →
                    </button>
                  </div>
                )}

                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:7 }}>¿Qué tipo de negocio?</label>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:8 }}>
                    {TIPOS_NEGOCIO.map(t => (
                      <button key={t.valor} type="button"
                        onClick={() => { setTipo(t.valor); setNegocioSel(null); setBusqueda(''); setResultados([]); }}
                        style={{ padding:'9px 8px', borderRadius:10, border:`2px solid ${tipo===t.valor?'#0B7324':'var(--border-c)'}`, background:tipo===t.valor?'#0B7324':'transparent', color:tipo===t.valor?'#fff':'var(--text-2)', cursor:'pointer', fontSize:12.5, fontWeight:500, transition:'all 0.15s', display:'flex', alignItems:'center', justifyContent:'center', gap:6, textAlign:'center' }}>
                        <Icon name={t.icono} size={14} /> {t.es}
                      </button>
                    ))}
                  </div>
                </div>

                {!negocioSel ? (
                  <div style={{ position:'relative' }}>
                    <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:7 }}>
                      Busca en Google Maps <span style={{ color:'#4CAF66' }}>(Perú)</span>
                    </label>
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
                      placeholder={
                        tipo === 'RESTAURANTE' ? 'Ej: La Mar, McDonald\'s, El Corral...'
                        : tipo === 'HOTEL' ? 'Ej: Hotel Marriott, Hilton, Casa Andina...'
                        : 'Escribe el nombre tal como aparece en Google Maps...'
                      }
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:'11px 13px', fontSize:14, outline:'none', boxSizing:'border-box' }}
                      onFocus={e => e.target.style.borderColor='#0B7324'}
                      onBlur={e => e.target.style.borderColor='var(--border-c)'} />
                    {busqueda.length>0 && busqueda.length<3 && <p style={{ fontSize:11, color:'var(--text-3)', margin:'5px 0 0' }}>Escribe al menos 3 letras...</p>}

                    {(buscando || resultados.length>0) && (
                      <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:12, overflow:'hidden', zIndex:20, boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
                        {buscando ? (
                          <div style={{ padding:'13px 16px', display:'flex', gap:10, alignItems:'center', color:'var(--text-2)', fontSize:13 }}>
                            <div className="w-4 h-4 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
                            Buscando en Perú...
                          </div>
                        ) : resultados.length===0 ? (
                          <div style={{ padding:'13px 16px', color:'var(--text-3)', fontSize:13 }}>Sin resultados. Prueba con otro nombre.</div>
                        ) : resultados.map(r => (
                          <button key={r.placeId} type="button" onClick={() => { setNegocioSel(r); setBusqueda(''); setResultados([]); }}
                            style={{ width:'100%', textAlign:'left', padding:'12px 16px', borderBottom:'1px solid var(--border-c)', background:'none', border:'none', cursor:'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                            <div style={{ color:'var(--text)', fontSize:13.5, fontWeight:600 }}>{r.nombre}</div>
                            <div style={{ color:'var(--text-3)', fontSize:12, marginTop:2 }}>{r.direccion}</div>
                            {r.rating && <div style={{ color:'#facc15', fontSize:12, marginTop:2 }}>★ {r.rating} · {r.totalResenas?.toLocaleString()} reseñas</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize:12, color:'var(--text-3)', display:'block', marginBottom:7 }}>Negocio seleccionado</label>
                    <div style={{ background:'rgba(11,115,36,0.08)', border:'2px solid rgba(11,115,36,0.3)', borderRadius:11, padding:'13px 15px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div>
                        <div style={{ color:'var(--text)', fontWeight:700, fontSize:14.5 }}>{negocioSel.nombre}</div>
                        <div style={{ color:'var(--text-2)', fontSize:12, marginTop:3 }}>{negocioSel.direccion}</div>
                        {negocioSel.rating && <div style={{ color:'#facc15', fontSize:12, marginTop:4 }}>★ {negocioSel.rating} · {negocioSel.totalResenas?.toLocaleString()} reseñas · <span style={{ color:'#22c55e' }}>✓ Google</span></div>}
                      </div>
                      <button onClick={() => setNegocioSel(null)} style={{ color:'var(--text-3)', background:'none', border:'none', cursor:'pointer', fontSize:12 }}>Cambiar</button>
                    </div>
                  </div>
                )}

                <button onClick={agregarNegocio} disabled={!negocioSel||guardando}
                  style={{ width:'100%', marginTop:18, background:'#0B7324', color:'#fff', border:'none', borderRadius:12, padding:'13px', fontSize:14.5, fontWeight:600, cursor:!negocioSel||guardando?'not-allowed':'pointer', opacity:!negocioSel?0.45:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {guardando ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Agregando...</> : 'Continuar al paso 3 →'}
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 3: Google Business ─────────────────── */}
          {paso === 2 && (
            <div>
              <button onClick={volverAPaso2}
                style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', color:'var(--text-3)', fontSize:13, cursor:'pointer', marginBottom:18, padding:0 }}>
                ← Atrás
              </button>

              <div style={{ marginBottom:22 }}>
                <p style={{ fontSize:11, fontWeight:600, color:'#22c55e', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:1 }}>✓ {negocioCreado?.nombre} agregado · Paso 2 de 3</p>
                <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 6px' }}>Conecta Google Business</h1>
                <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>
                  Accede a <strong style={{ color:'var(--text)' }}>todas tus reseñas</strong> y respóndelas directamente desde aquí.
                </p>
              </div>

              <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:18, padding:22 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
                  {[
                    { ico:'clipboard', t:'Todas tus reseñas', s:'Sin límite de 5' },
                    { ico:'chat', t:'Responder aquí', s:'Sin ir a Google Maps' },
                    { ico:'sirena', t:'Filtrar negativas', s:'Actúa rápido' },
                    { ico:'estrella', t:'Las más útiles', s:'Las de más likes' },
                  ].map((b,i) => (
                    <div key={i} style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:10, padding:'11px 13px', display:'flex', gap:10 }}>
                      <Icon name={b.ico} size={17} color="#4CAF66" style={{ marginTop:1 }} />
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{b.t}</div>
                        <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{b.s}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:9, padding:'10px 13px', marginBottom:16, display:'flex', gap:8 }}>
                  <Icon name="alerta" size={15} color="#f59e0b" style={{ marginTop:1 }} />
                  <div>
                    <p style={{ fontSize:12, color:'var(--text-2)', margin:0, lineHeight:1.5 }}>
                      Debes iniciar sesión con la cuenta de Google <strong style={{ color:'var(--text)' }}>que administra este negocio en Google Maps</strong> (la que lo verificó en <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" style={{ color:'#4CAF66' }}>Google Business Profile</a>).
                    </p>
                    <button type="button" onClick={() => setSinAccesoGBP(v => !v)}
                      style={{ background:'none', border:'none', color:'#f59e0b', textDecoration:'underline', cursor:'pointer', fontSize:12, padding:'5px 0 0' }}>
                      ¿No tienes acceso a ese correo?
                    </button>
                    {sinAccesoGBP && (
                      <p style={{ fontSize:12, color:'var(--text-2)', margin:'6px 0 0', lineHeight:1.5 }}>
                        Entonces poco se puede hacer desde Notoria: pide a quien gestiona el negocio (dueño anterior, empleado o agencia) que te agregue como gerente en Google Business Profile, o inicia tú mismo el proceso de reclamo de propiedad con Google. Mientras tanto puedes omitir este paso — tu negocio seguirá monitoreado con las 5 reseñas públicas más recientes.
                      </p>
                    )}
                  </div>
                </div>

                <button onClick={conectarGBP}
                  style={{ width:'100%', background:'#4285F4', color:'#fff', border:'none', borderRadius:12, padding:'13px', fontSize:14.5, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:10 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24">
                    <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Conectar con Google Business
                </button>
                <button onClick={() => setPaso(3)}
                  style={{ width:'100%', background:'none', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:12, padding:'11px', fontSize:13, cursor:'pointer' }}>
                  Omitir por ahora — lo haré desde Ajustes del negocio
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 4: Éxito ───────────────────────────── */}
          {paso === 3 && (
            <div style={{ textAlign:'center' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
                <div style={{ width:76, height:76, borderRadius:'50%', background:'rgba(11,115,36,0.12)', border:'2px solid rgba(11,115,36,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="checkCirc" size={38} color="#0B7324" strokeWidth={2} />
                </div>
              </div>
              <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 8px' }}>¡Todo listo{nombre ? `, ${nombre}` : ''}!</h1>
              <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 24px', lineHeight:1.6 }}>
                Notoria ya monitorea <strong style={{ color:'var(--text)' }}>{negocioCreado?.nombre || 'tu negocio'}</strong>. Te alertamos si detectamos algo sospechoso.
              </p>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:16, padding:20, textAlign:'left', marginBottom:20 }}>
                <p style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:0.5, margin:'0 0 12px' }}>Activo desde hoy</p>
                {[
                  { ico:'estrella', t:'Monitoreo del rating en tiempo real' },
                  { ico:'sirena', t:'Detección de reseñas falsas y bots' },
                  { ico:'mail', t:'Alertas por email instantáneas' },
                  { ico:'grafica', t:'Historial de rating con gráficas' },
                ].map((i,idx) => (
                  <div key={idx} style={{ display:'flex', gap:10, marginBottom:10, alignItems:'center' }}>
                    <Icon name={i.ico} size={16} color="#4CAF66" />
                    <span style={{ fontSize:13, color:'var(--text-2)' }}>{i.t}</span>
                  </div>
                ))}
              </div>
              <button onClick={irAlNegocio} disabled={saliendo}
                style={{ width:'100%', background:'#0B7324', color:'#fff', border:'none', borderRadius:12, padding:'13px', fontSize:14.5, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {saliendo
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Cargando...</>
                  : <>Ver el panel de control de {negocioCreado?.nombre || 'mi negocio'} →</>}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
