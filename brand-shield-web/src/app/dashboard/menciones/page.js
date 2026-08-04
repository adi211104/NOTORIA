'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mencionesApi } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import Icon from '../../../components/Icons';

const TEXTOS = {
  es: {
    titulo: 'Menciones',
    sub: 'Lo que otros publican sobre tu marca fuera de tu ficha. Las reseñas llegan a ti; las menciones hay que ir a buscarlas.',
    soloPlanNegocio: 'La escucha de menciones está disponible desde el Plan Negocio.',
    verPlanes: 'Ver planes →',
    sinNegocios: 'Todavía no tienes negocios. Agrega uno para empezar a escuchar menciones.',
    agregarNegocio: 'Agregar negocio →',

    total: 'Sin archivar', negativas: 'Negativas', sinVer: 'Sin ver',

    filtroTodos: 'Todos', filtroNegocio: 'Negocio', filtroFuente: 'Fuente', filtroTono: 'Tono',
    negativo: 'Negativas', positivo: 'Positivas', neutro: 'Neutras',
    verArchivadas: 'Ver archivadas', ocultarArchivadas: 'Ocultar archivadas',
    marcarTodas: 'Marcar todas como vistas',

    fuentes: 'Fuentes de escucha',
    fuenteActiva: 'Activa',

    vacio: 'Sin menciones por ahora',
    vacioDetalle: 'Se buscan cada 4 horas junto con el resto del monitoreo.',
    vacioFiltro: 'Ninguna mención coincide con este filtro.',

    terminos: 'Buscando',
    editarTerminos: 'Editar términos',
    terminosAyuda: 'Separados por coma. Agrega tu @usuario, tus hashtags y las formas en que la gente escribe mal tu nombre. Mínimo 3 caracteres cada uno.',
    guardar: 'Guardar', cancelar: 'Cancelar', guardando: 'Guardando…',
    escuchaActiva: 'Escucha activa',

    verOriginal: 'Ver original ↗',
    archivar: 'Archivar', desarchivar: 'Desarchivar', archivada: 'Archivada',
    nueva: 'Nueva',
    responderEn: 'Se responde en la plataforma de origen',
    vistas: 'vistas', likes: 'me gusta',
  },
  en: {
    titulo: 'Mentions',
    sub: 'What others post about your brand outside your listing. Reviews come to you; mentions you have to go find.',
    soloPlanNegocio: 'Mention listening is available from the Business plan.',
    verPlanes: 'See plans →',
    sinNegocios: 'You have no businesses yet. Add one to start listening for mentions.',
    agregarNegocio: 'Add business →',

    total: 'Unarchived', negativas: 'Negative', sinVer: 'Unseen',

    filtroTodos: 'All', filtroNegocio: 'Business', filtroFuente: 'Source', filtroTono: 'Tone',
    negativo: 'Negative', positivo: 'Positive', neutro: 'Neutral',
    verArchivadas: 'Show archived', ocultarArchivadas: 'Hide archived',
    marcarTodas: 'Mark all as seen',

    fuentes: 'Listening sources',
    fuenteActiva: 'Active',

    vacio: 'No mentions yet',
    vacioDetalle: 'They are searched every 4 hours along with the rest of the monitoring.',
    vacioFiltro: 'No mention matches this filter.',

    terminos: 'Searching for',
    editarTerminos: 'Edit terms',
    terminosAyuda: 'Comma-separated. Add your @handle, your hashtags and the ways people misspell your name. At least 3 characters each.',
    guardar: 'Save', cancelar: 'Cancel', guardando: 'Saving…',
    escuchaActiva: 'Listening on',

    verOriginal: 'View original ↗',
    archivar: 'Archive', desarchivar: 'Unarchive', archivada: 'Archived',
    nueva: 'New',
    responderEn: 'Reply on the original platform',
    vistas: 'views', likes: 'likes',
  },
};

const TONO = {
  negativo: { color:'#f87171', bg:'rgba(239,68,68,0.1)',  bd:'rgba(239,68,68,0.3)' },
  positivo: { color:'#22c55e', bg:'rgba(34,197,94,0.1)',  bd:'rgba(34,197,94,0.25)' },
  neutro:   { color:'var(--text-3)', bg:'var(--surface2)', bd:'var(--border-c)' },
};

const FUENTE_NOMBRE = { TIKTOK:'TikTok' };

const formatearFecha = (v, idioma) => {
  if (!v) return '';
  return new Date(v).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE',
    { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
};

const formatearNumero = (n) => {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

// Un solo tono a propósito: acá nunca se pinta una fuente apagada, así que no
// existen los estados "espera" ni "apagado" que sí tiene la pastilla de Conexiones.
const PastillaActiva = ({ children }) => (
  <span style={{ color:'#22c55e', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)',
                 fontSize:11.5, padding:'3px 10px', borderRadius:10, whiteSpace:'nowrap' }}>
    {children}
  </span>
);

const Metrica = ({ etiqueta, valor, acento }) => (
  <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:12, padding:'13px 16px', minWidth:110 }}>
    <p style={{ margin:0, fontSize:11.5, color:'var(--text-3)' }}>{etiqueta}</p>
    <p style={{ margin:'3px 0 0', fontSize:22, fontWeight:700, color:acento || 'var(--text)' }}>{valor}</p>
  </div>
);

const estiloSelect = {
  background:'var(--surface)', color:'var(--text-2)', border:'1px solid var(--border-c)',
  borderRadius:9, padding:'6px 10px', fontSize:12.5, cursor:'pointer',
};

export default function MencionesPage() {
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const router = useRouter();
  const t = TEXTOS[idioma] || TEXTOS.es;

  const planPago = usuario?.plan === 'NEGOCIO' || usuario?.plan === 'FRANQUICIA';

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ negocioId:'', sentimiento:'', plataforma:'', archivadas:'' });
  const [editando, setEditando] = useState(null);   // negocioId cuyos términos se editan
  const [borrador, setBorrador] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorTerminos, setErrorTerminos] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await mencionesApi.listar(filtros));
    } catch {
      // 403 por plan o backend caído: el render de abajo cubre ambos
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  // Sin fuentes operativas la sección no existe: el menú ya no la muestra, pero
  // alguien puede llegar por URL directa o tener la pestaña abierta cuando se
  // apaga. Se manda al resumen en vez de explicar una función que no ofrecemos.
  const noDisponible = usuario?.mencionesDisponibles === false;

  useEffect(() => {
    if (noDisponible) router.replace('/dashboard');
  }, [noDisponible, router]);

  useEffect(() => {
    if (noDisponible) { setCargando(false); return; }
    if (planPago) cargar(); else setCargando(false);
  }, [planPago, noDisponible, cargar]);

  const cambiarFiltro = (clave, valor) => setFiltros((f) => ({ ...f, [clave]: valor }));

  // Optimista: la lista se actualiza al toque y se recarga el resumen detrás.
  // Si la llamada falla, cargar() deja todo como está en el servidor.
  const alternarArchivada = async (m) => {
    setDatos((d) => ({
      ...d,
      menciones: d.menciones.map((x) => (x.id === m.id ? { ...x, archivada: !x.archivada, vista: true } : x)),
    }));
    try { await mencionesApi.marcar(m.id, { archivada: !m.archivada }); } finally { cargar(); }
  };

  const marcarTodas = async () => {
    try { await mencionesApi.verTodas(); } finally { cargar(); }
  };

  const abrirEdicion = (negocio) => {
    setErrorTerminos('');
    setEditando(negocio.id);
    // El nombre del negocio siempre se busca y no se edita acá — solo los extras
    setBorrador(negocio.terminos.slice(1).join(', '));
  };

  const guardarTerminos = async (negocioId) => {
    setGuardando(true);
    setErrorTerminos('');
    try {
      await mencionesApi.configurar(negocioId, { terminosMencion: borrador });
      setEditando(null);
      await cargar();
    } catch (e) {
      setErrorTerminos(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const alternarEscucha = async (negocio) => {
    try { await mencionesApi.configurar(negocio.id, { mencionesActivas: !negocio.mencionesActivas }); }
    finally { cargar(); }
  };

  if (noDisponible) return null;

  // ── Gating por plan ─────────────────────────────────────
  if (!planPago) {
    return (
      <div>
        <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{t.titulo}</h1>
        <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 24px' }}>{t.sub}</p>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:36, textAlign:'center' }}>
          <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 14px' }}>{t.soloPlanNegocio}</p>
          <Link href="/dashboard/planes" style={{ color:'#4CAF66', fontSize:13, textDecoration:'none' }}>{t.verPlanes}</Link>
        </div>
      </div>
    );
  }

  if (cargando && !datos) return null;

  const negocios = datos?.negocios || [];
  const fuentes = datos?.fuentes || [];
  const menciones = datos?.menciones || [];
  const resumen = datos?.resumen || { total:0, negativas:0, sinVer:0 };
  const hayFiltro = Object.values(filtros).some(Boolean);

  return (
    <div>
      <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{t.titulo}</h1>
      <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 22px' }}>{t.sub}</p>

      {negocios.length === 0 ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:36, textAlign:'center' }}>
          <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 14px' }}>{t.sinNegocios}</p>
          <Link href="/dashboard/negocios" style={{ color:'#4CAF66', fontSize:13, textDecoration:'none' }}>{t.agregarNegocio}</Link>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:18 }}>
            <Metrica etiqueta={t.total} valor={resumen.total} />
            <Metrica etiqueta={t.negativas} valor={resumen.negativas} acento={resumen.negativas ? '#f87171' : undefined} />
            <Metrica etiqueta={t.sinVer} valor={resumen.sinVer} acento={resumen.sinVer ? '#f59e0b' : undefined} />
          </div>

          {/* Fuentes de escucha — se muestra siempre, incluso apagadas: es la
              única forma de que el usuario entienda por qué no ve menciones */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:'16px 20px', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <Icon name="menciones" size={15} color="var(--text-3)" />
              <span style={{ color:'var(--text-2)', fontSize:13, fontWeight:600 }}>{t.fuentes}</span>
            </div>
            {/* El backend solo manda las fuentes que funcionan de verdad, así
                que acá no hay estados "apagado" ni "próximamente" que renderizar */}
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {fuentes.map((f) => (
                <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                  <span style={{ color:'var(--text-2)', fontSize:13 }}>{f.nombre}</span>
                  <PastillaActiva>{t.fuenteActiva}</PastillaActiva>
                </div>
              ))}
            </div>
          </div>

          {/* Términos por negocio */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:'16px 20px', marginBottom:16 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {negocios.map((n) => (
                <div key={n.id}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
                      <span style={{ width:9, height:9, borderRadius:'50%', background:n.colorEtiqueta || '#3AA857', flexShrink:0 }} />
                      <span style={{ color:'var(--text)', fontSize:14, fontWeight:600 }}>{n.nombre}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:'var(--text-3)', cursor:'pointer' }}>
                        <input type="checkbox" checked={n.mencionesActivas} onChange={() => alternarEscucha(n)} />
                        {t.escuchaActiva}
                      </label>
                      {editando !== n.id && (
                        <button onClick={() => abrirEdicion(n)}
                          style={{ fontSize:11.5, color:'#4CAF66', background:'rgba(11,115,36,0.1)',
                                   border:'1px solid rgba(11,115,36,0.3)', padding:'4px 11px', borderRadius:10, cursor:'pointer' }}>
                          {t.editarTerminos}
                        </button>
                      )}
                    </div>
                  </div>

                  {editando === n.id ? (
                    <div style={{ marginTop:9 }}>
                      <input value={borrador} onChange={(e) => setBorrador(e.target.value)}
                        placeholder="@mimarca, #mimarca, mi marca lima"
                        style={{ width:'100%', background:'var(--surface2)', color:'var(--text)',
                                 border:'1px solid var(--border-c)', borderRadius:9, padding:'8px 11px', fontSize:13 }} />
                      <p style={{ color:'var(--text-3)', fontSize:11, margin:'6px 0 0', lineHeight:1.5 }}>{t.terminosAyuda}</p>
                      {errorTerminos && (
                        <p style={{ color:'#f87171', fontSize:11.5, margin:'6px 0 0' }}>{errorTerminos}</p>
                      )}
                      <div style={{ display:'flex', gap:8, marginTop:9 }}>
                        <button onClick={() => guardarTerminos(n.id)} disabled={guardando}
                          style={{ fontSize:12, color:'#fff', background:'#0B7324', border:'none',
                                   padding:'6px 14px', borderRadius:9, cursor:guardando ? 'wait' : 'pointer' }}>
                          {guardando ? t.guardando : t.guardar}
                        </button>
                        <button onClick={() => { setEditando(null); setErrorTerminos(''); }}
                          style={{ fontSize:12, color:'var(--text-3)', background:'transparent',
                                   border:'1px solid var(--border-c)', padding:'6px 14px', borderRadius:9, cursor:'pointer' }}>
                          {t.cancelar}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:7 }}>
                      <span style={{ color:'var(--text-3)', fontSize:11.5 }}>{t.terminos}:</span>
                      {n.terminos.map((term) => (
                        <span key={term} style={{ fontSize:11.5, color:'var(--text-2)', background:'var(--surface2)',
                                                  border:'1px solid var(--border-c)', padding:'2px 9px', borderRadius:9 }}>
                          {term}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display:'flex', gap:9, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
            {negocios.length > 1 && (
              <select value={filtros.negocioId} onChange={(e) => cambiarFiltro('negocioId', e.target.value)} style={estiloSelect}>
                <option value="">{t.filtroNegocio}: {t.filtroTodos}</option>
                {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
              </select>
            )}
            <select value={filtros.sentimiento} onChange={(e) => cambiarFiltro('sentimiento', e.target.value)} style={estiloSelect}>
              <option value="">{t.filtroTono}: {t.filtroTodos}</option>
              <option value="negativo">{t.negativo}</option>
              <option value="positivo">{t.positivo}</option>
              <option value="neutro">{t.neutro}</option>
            </select>
            <select value={filtros.plataforma} onChange={(e) => cambiarFiltro('plataforma', e.target.value)} style={estiloSelect}>
              <option value="">{t.filtroFuente}: {t.filtroTodos}</option>
              {fuentes.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
            <button onClick={() => cambiarFiltro('archivadas', filtros.archivadas === '1' ? '' : '1')} style={estiloSelect}>
              {filtros.archivadas === '1' ? t.ocultarArchivadas : t.verArchivadas}
            </button>
            {resumen.sinVer > 0 && (
              <button onClick={marcarTodas} style={{ ...estiloSelect, color:'#4CAF66' }}>{t.marcarTodas}</button>
            )}
          </div>

          {/* Lista */}
          {menciones.length === 0 ? (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:36, textAlign:'center' }}>
              <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 6px', fontWeight:600 }}>
                {hayFiltro ? t.vacioFiltro : t.vacio}
              </p>
              {!hayFiltro && (
                <p style={{ color:'var(--text-3)', fontSize:12.5, margin:0, lineHeight:1.6, maxWidth:460, marginInline:'auto' }}>
                  {t.vacioDetalle}
                </p>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {menciones.map((m) => {
                const tono = TONO[m.sentimiento] || TONO.neutro;
                const met = m.metricas || {};
                return (
                  <div key={m.id} style={{
                    background:'var(--surface)', borderRadius:14, padding:'15px 18px',
                    border:'1px solid var(--border-c)',
                    // Barra de color al costado: el tono se lee sin tener que buscar la etiqueta
                    borderLeft:`3px solid ${tono.color}`,
                    opacity: m.archivada ? 0.55 : 1,
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', minWidth:0 }}>
                        <span style={{ color:'var(--text)', fontSize:13.5, fontWeight:600 }}>
                          {m.autorHandle || m.autorNombre}
                        </span>
                        <span style={{ fontSize:11, color:'var(--text-3)', background:'var(--surface2)',
                                       border:'1px solid var(--border-c)', padding:'2px 8px', borderRadius:9 }}>
                          {FUENTE_NOMBRE[m.plataforma] || m.plataforma}
                        </span>
                        {negocios.length > 1 && (
                          <span style={{ fontSize:11, color:'var(--text-3)' }}>· {m.negocio?.nombre}</span>
                        )}
                        {!m.vista && !m.archivada && (
                          <span style={{ fontSize:10.5, color:'#f59e0b', background:'rgba(245,158,11,0.1)',
                                         border:'1px solid rgba(245,158,11,0.3)', padding:'1px 7px', borderRadius:8 }}>
                            {t.nueva}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize:11.5, color:'var(--text-3)', whiteSpace:'nowrap' }}>
                        {formatearFecha(m.fechaMencion || m.detectadaEn, idioma)}
                      </span>
                    </div>

                    <p style={{ color:'var(--text-2)', fontSize:13.5, margin:'9px 0 0', lineHeight:1.6 }}>{m.texto}</p>

                    <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginTop:11 }}>
                      <span style={{ fontSize:11, color:tono.color, background:tono.bg,
                                     border:`1px solid ${tono.bd}`, padding:'2px 9px', borderRadius:9 }}>
                        {t[m.sentimiento] || t.neutro}
                      </span>
                      {met.vistas != null && (
                        <span style={{ fontSize:11.5, color:'var(--text-3)' }}>{formatearNumero(met.vistas)} {t.vistas}</span>
                      )}
                      {met.likes != null && (
                        <span style={{ fontSize:11.5, color:'var(--text-3)' }}>{formatearNumero(met.likes)} {t.likes}</span>
                      )}
                      <div style={{ flex:1 }} />
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" title={t.responderEn}
                          style={{ fontSize:11.5, color:'#4CAF66', textDecoration:'none' }}>
                          {t.verOriginal}
                        </a>
                      )}
                      <button onClick={() => alternarArchivada(m)}
                        style={{ fontSize:11.5, color:'var(--text-3)', background:'transparent',
                                 border:'1px solid var(--border-c)', padding:'3px 11px', borderRadius:9, cursor:'pointer' }}>
                        {m.archivada ? t.desarchivar : t.archivar}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
