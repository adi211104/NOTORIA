'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { negociosApi } from '../../../lib/api';
import { useIdioma } from '../../../context/IdiomaContext';
import { useAuth } from '../../../context/AuthContext';
import { TIPOS_NEGOCIO, iconoParaTipo, labelParaTipo } from '../../../lib/tiposNegocio';
import Icon from '../../../components/Icons';

import { API_URL } from '../../../lib/api';
const getToken = () => localStorage.getItem('bs_token');

const TEXTOS = {
  es: {
    titulo: 'Mis negocios',
    sub: 'Gestiona los negocios que monitoreamos',
    cancelarBtn: '✕ Cancelar',
    agregarBtn: '+ Agregar negocio',
    agregarTitulo: 'Agregar negocio',
    buscarLabel: 'Busca tu negocio en Google',
    buscarPlaceholder: 'Ej: KFC San Isidro, Hotel Marriott Lima...',
    buscando: 'Buscando...',
    resenas: 'reseñas',
    googleConectado: 'Google conectado',
    cambiar: 'Cambiar',
    cancelar: 'Cancelar',
    guardando: 'Guardando...',
    agregarYEmpezar: 'Agregar y empezar monitoreo',
    sinNegocios: 'Sin negocios aún',
    sinNegociosSub: 'Agrega tu primer negocio',
    disponibleALas: (h) => `Disponible a las ${h}`,
    escanearAhora: 'Escanear ahora',
    escanear: 'Escanear',
    desdeLas: (h) => `desde las ${h}`,
    eliminarTitle: 'Eliminar negocio',
    modalTitulo: '¿Eliminar este negocio?',
    modalTexto: (nombre) => <>Se detendrá el monitoreo de <strong style={{ color: 'var(--text)' }}>{nombre}</strong> y se perderán todas sus alertas y reseñas guardadas.</>,
    modalCancelar: 'Cancelar',
    modalConfirmar: 'Sí, eliminar',
    errorEscanear: 'Error al escanear',
    locale: 'es-PE',
  },
  en: {
    titulo: 'My businesses',
    sub: 'Manage the businesses we monitor',
    cancelarBtn: '✕ Cancel',
    agregarBtn: '+ Add business',
    agregarTitulo: 'Add business',
    buscarLabel: 'Search for your business on Google',
    buscarPlaceholder: 'E.g: KFC San Isidro, Marriott Hotel Lima...',
    buscando: 'Searching...',
    resenas: 'reviews',
    googleConectado: 'Google connected',
    cambiar: 'Change',
    cancelar: 'Cancel',
    guardando: 'Saving...',
    agregarYEmpezar: 'Add and start monitoring',
    sinNegocios: 'No businesses yet',
    sinNegociosSub: 'Add your first business',
    disponibleALas: (h) => `Available at ${h}`,
    escanearAhora: 'Scan now',
    escanear: 'Scan',
    desdeLas: (h) => `from ${h}`,
    eliminarTitle: 'Delete business',
    modalTitulo: 'Delete this business?',
    modalTexto: (nombre) => <>Monitoring will stop for <strong style={{ color: 'var(--text)' }}>{nombre}</strong> and all its saved alerts and reviews will be lost.</>,
    modalCancelar: 'Cancel',
    modalConfirmar: 'Yes, delete',
    errorEscanear: 'Error while scanning',
    locale: 'en-US',
  },
};

const formatTiempo = (seg) => {
  if (!seg || seg <= 0) return null;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatHoraDisponible = (seg, locale) => {
  if (!seg || seg <= 0) return null;
  const ahora = new Date();
  const disponible = new Date(ahora.getTime() + seg * 1000);
  return disponible.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

export default function NegociosPage() {
  const { idioma } = useIdioma();
  const { usuario } = useAuth();
  const router = useRouter();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const esFranquicia = usuario?.plan === 'FRANQUICIA';
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ nombre: '', tipo: 'RESTAURANTE', googlePlaceId: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [negocioSel, setNegocioSel] = useState(null);
  const [escaneando, setEscaneando] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const [cooldowns, setCooldowns] = useState({});
  const [modalEliminar, setModalEliminar] = useState(null);
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);

  const cargar = async () => {
    const data = await negociosApi.listar().catch(() => []);
    setLista(data);
    setCargando(false);
    for (const n of data) {
      fetch(`${API_URL}/api/negocios/${n.id}/cooldown`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      }).then(r => r.json()).then(cd => {
        setCooldowns(prev => ({ ...prev, [n.id]: cd }));
      }).catch(() => {});
    }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCooldowns(prev => {
        const next = { ...prev };
        for (const id in next) {
          if (next[id]?.segundosRestantes > 0) {
            next[id] = { ...next[id], segundosRestantes: next[id].segundosRestantes - 1 };
            if (next[id].segundosRestantes <= 0) next[id] = { ...next[id], puedeEscanear: true };
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (busqueda.length < 3) { setResultados([]); return; }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`${API_URL}/api/utils/buscar-negocio?q=${encodeURIComponent(busqueda)}&tipo=${form.tipo}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        const data = await res.json();
        setResultados(Array.isArray(data) ? data : []);
      } catch { setResultados([]); }
      finally { setBuscando(false); }
    }, 600);
  }, [busqueda, form.tipo]);

  const seleccionar = (n) => {
    setNegocioSel(n);
    setForm(f => ({ ...f, nombre: n.nombre, googlePlaceId: n.placeId }));
    setBusqueda(''); setResultados([]);
  };

  const limpiar = () => { setNegocioSel(null); setForm(f => ({ ...f, nombre: '', googlePlaceId: '' })); };

  const handleAgregar = async (e) => {
    e.preventDefault(); setError('');
    setGuardando(true);
    try {
      const { negocio } = await negociosApi.crear(form);
      setForm({ nombre: '', tipo: 'RESTAURANTE', googlePlaceId: '' });
      setNegocioSel(null); setBusqueda(''); setMostrarForm(false);
      router.push(`/dashboard/negocios/${negocio.id}?bienvenida=1`);
    } catch (err) { setError(err.message); }
    finally { setGuardando(false); }
  };

  const confirmarEliminar = async () => {
    if (!modalEliminar) return;
    try { await negociosApi.eliminar(modalEliminar.id); setModalEliminar(null); cargar(); }
    catch (err) { alert(err.message); }
  };

  const escanear = async (negocio) => {
    const cd = cooldowns[negocio.id];
    if (cd && !cd.puedeEscanear && cd.segundosRestantes > 0) return;
    setEscaneando(negocio.id); setProgreso(0);
    let p = 0;
    intervalRef.current = setInterval(() => {
      p += Math.random() * 8;
      if (p > 90) p = 90;
      setProgreso(Math.round(p));
    }, 300);
    try {
      const res = await fetch(`${API_URL}/api/utils/monitoreo-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ negocioId: negocio.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        clearInterval(intervalRef.current);
        alert(data.error || t.errorEscanear);
        setEscaneando(null); setProgreso(0); return;
      }
      setProgreso(100);
      setTimeout(() => {
        clearInterval(intervalRef.current);
        setEscaneando(null); setProgreso(0);
        const cooldownSeg = (data.cooldownMinutos || 1440) * 60;
        setCooldowns(prev => ({
          ...prev,
          [negocio.id]: { puedeEscanear: false, segundosRestantes: cooldownSeg }
        }));
        cargar();
      }, 800);
    } catch {
      clearInterval(intervalRef.current); setEscaneando(null); setProgreso(0);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{t.titulo}</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, margin: 0 }}>{t.sub}</p>
        </div>
        <button onClick={() => { setMostrarForm(!mostrarForm); limpiar(); setBusqueda(''); }}
          style={{ background: '#0B7324', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
          {mostrarForm ? t.cancelarBtn : t.agregarBtn}
        </button>
      </div>

      {mostrarForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <h2 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>{t.agregarTitulo}</h2>
          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <form onSubmit={handleAgregar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {TIPOS_NEGOCIO.map(ti => (
                <button key={ti.valor} type="button" onClick={() => { setForm(f => ({ ...f, tipo: ti.valor })); limpiar(); }}
                  style={{ padding: '9px 8px', borderRadius: 8, border: `1.5px solid ${form.tipo === ti.valor ? '#0B7324' : 'var(--border-c)'}`, background: form.tipo === ti.valor ? '#0B7324' : 'transparent', color: form.tipo === ti.valor ? '#fff' : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center' }}>
                  <Icon name={ti.icono} size={13} /> {idioma === 'en' ? ti.en : ti.es}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>{t.buscarLabel}</label>
              {!negocioSel ? (
                <>
                  <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={t.buscarPlaceholder}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border-c)', color: 'var(--text)', borderRadius: 8, padding: '9px 13px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  {(buscando || resultados.length > 0) && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 10, overflow: 'hidden', zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                      {buscando ? <div style={{ padding: '12px 14px', color: 'var(--text-2)', fontSize: 13 }}>{t.buscando}</div>
                        : resultados.map(r => (
                          <button key={r.placeId} type="button" onClick={() => seleccionar(r)}
                            style={{ width: '100%', textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border-c)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{r.nombre}</div>
                            <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 2 }}>{r.direccion}</div>
                            {r.rating && <div style={{ color: '#facc15', fontSize: 11, marginTop: 2 }}>★ {r.rating} · {r.totalResenas?.toLocaleString()} {t.resenas}</div>}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background: 'rgba(11,115,36,0.08)', border: '1px solid rgba(11,115,36,0.3)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{negocioSel.nombre}</div>
                    <div style={{ color: 'var(--text-2)', fontSize: 11, marginTop: 3 }}>{negocioSel.direccion}</div>
                    {negocioSel.rating && <div style={{ color: '#facc15', fontSize: 11, marginTop: 3 }}>★ {negocioSel.rating} · {negocioSel.totalResenas?.toLocaleString()} {t.resenas} · ✓ {t.googleConectado}</div>}
                  </div>
                  <button type="button" onClick={limpiar} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>{t.cambiar}</button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setMostrarForm(false)} style={{ color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '9px 14px' }}>{t.cancelar}</button>
              <button type="submit" disabled={guardando || !negocioSel}
                style={{ background: '#0B7324', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: guardando || !negocioSel ? 'not-allowed' : 'pointer', opacity: !negocioSel ? 0.5 : 1 }}>
                {guardando ? t.guardando : t.agregarYEmpezar}
              </button>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '2px dashed var(--border-c)', borderRadius: 16, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Icon name="tienda" size={36} color="var(--text-3)" /></div>
          <p style={{ color: 'var(--text)', fontWeight: 600, margin: '0 0 4px' }}>{t.sinNegocios}</p>
          <p style={{ color: 'var(--text-2)', fontSize: 13 }}>{t.sinNegociosSub}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(n => {
            const snap = n.snapshots?.[0];
            const cd = cooldowns[n.id];
            const escaneoActivo = escaneando === n.id;
            const puedeEscanear = !cd || cd.puedeEscanear || cd.segundosRestantes <= 0;
            const tiempoRestante = formatTiempo(cd?.segundosRestantes);
            const horaDisponible = formatHoraDisponible(cd?.segundosRestantes, t.locale);
            const alertas = n._count?.alertas || 0;
            const color = n.colorEtiqueta || '#3AA857';

            return (
              <div key={n.id} style={{ background: 'var(--surface)', border: `2px solid ${color}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.3s' }}>
                {escaneoActivo && (
                  <div style={{ height: 3 }}>
                    <div className="scan-shimmer" style={{ height: '100%', width: `${progreso}%`, transition: 'width 0.3s ease', borderRadius: 3 }} />
                  </div>
                )}
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <Link href={`/dashboard/negocios/${n.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', flex: 1, minWidth: 0 }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${color}40` }}>
                        <Icon name={iconoParaTipo(n.tipo)} size={20} color={color} />
                      </div>
                      {/* Burbuja de alertas parpadeante */}
                      {alertas > 0 && (
                        <div className="pulse-badge" style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)' }}>
                          {alertas}
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{n.nombre}</div>
                      {n.direccion && <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="pin" size={11} /> {n.direccion}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>{labelParaTipo(n.tipo, idioma)}</span>
                        {n.googlePlaceId && <span style={{ fontSize: 10, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '1px 6px', borderRadius: 4 }}>✓ Google</span>}
                        {n.facebookPageId && <span style={{ fontSize: 10, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '1px 6px', borderRadius: 4 }}>✓ Facebook</span>}
                      </div>
                    </div>
                  </Link>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    {snap && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#facc15', fontWeight: 700, fontSize: 17 }}>★ {snap.ratingActual}</div>
                        <div style={{ color: 'var(--text-3)', fontSize: 10 }}>{snap.totalResenas?.toLocaleString()} {t.resenas}</div>
                      </div>
                    )}

                    <div style={{ textAlign: 'center' }}>
                      <button onClick={() => escanear(n)} disabled={!puedeEscanear || escaneoActivo}
                        title={tiempoRestante ? t.disponibleALas(horaDisponible) : t.escanearAhora}
                        style={{ background: puedeEscanear && !escaneoActivo ? '#0B7324' : 'var(--surface2)', color: puedeEscanear && !escaneoActivo ? '#fff' : 'var(--text-3)', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: puedeEscanear && !escaneoActivo ? 'pointer' : 'not-allowed', fontWeight: 500, transition: 'all 0.15s' }}>
                        {escaneoActivo ? `${progreso}%` : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="buscar" size={13} /> {t.escanear}</span>
                        )}
                      </button>
                      {tiempoRestante && !escaneoActivo && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                          {horaDisponible ? t.desdeLas(horaDisponible) : tiempoRestante}
                        </div>
                      )}
                    </div>

                    <button onClick={() => setModalEliminar({ id: n.id, nombre: n.nombre })} title={t.eliminarTitle}
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}>
                      <Icon name="basura" size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalEliminar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 24, maxWidth: 380, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Icon name="alerta" size={36} color="#ef4444" /></div>
            <h3 style={{ color: 'var(--text)', fontSize: 17, fontWeight: 700, textAlign: 'center', margin: '0 0 10px' }}>{t.modalTitulo}</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13, textAlign: 'center', lineHeight: 1.6, margin: '0 0 20px' }}>
              {t.modalTexto(modalEliminar.nombre)}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalEliminar(null)} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border-c)', color: 'var(--text-2)', borderRadius: 10, padding: 10, fontSize: 14, cursor: 'pointer' }}>{t.modalCancelar}</button>
              <button onClick={confirmarEliminar} style={{ flex: 1, background: '#ef4444', border: 'none', color: '#fff', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t.modalConfirmar}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
