'use client';
// Vista consolidada de competencia: todos los competidores de todos los
// negocios del usuario, organizados por negocio, en un solo lugar (antes solo
// se veían dentro de la pestaña "Competencia" de cada negocio por separado).
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import { competidoresApi, utils } from '../../../lib/api';
import { labelParaTipo } from '../../../lib/tiposNegocio';
import Icon from '../../../components/Icons';

const LIMITE_COMPETIDORES = { GRATIS: 1, NEGOCIO: 5, FRANQUICIA: 15 };

const Card = ({ children, style }) => <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20, ...style }}>{children}</div>;

const TEXTOS = {
  es: {
    titulo:'Competencia', sub:'Todos tus competidores, organizados por negocio, en un solo lugar.',
    buscarPlaceholder:'Filtrar por nombre de competidor...',
    ordenLabel:'Ordenar negocios por:', ordenNombre:'Nombre', ordenBrecha:'Mayor brecha con la competencia primero',
    sinNegocios:'Todavía no tienes negocios.', sinNegociosSub:'Agrega tu primer negocio para empezar a monitorear su competencia.',
    irANegocios:'Ir a Mis negocios →',
    tuNegocio:'Tu negocio', resenasCount:(n) => `${n} reseñas`,
    competidoresDe:(a,b) => `${a} de ${b} competidores`,
    agregarCompetidor:'+ Agregar competidor', cancelar:'Cancelar',
    buscarCompPlaceholder:(tipo) => `Busca un ${tipo} competidor en Google Maps...`,
    buscando:'Buscando...', errorAgregar:'Error al agregar', errorConexion:'Error de conexión',
    errorSinPais:'Este negocio no tiene país asignado. Edítalo desde Ajustes para poder buscar competidores.',
    planIncluye:'Tu plan incluye 1 competidor por negocio.', verPlanes:'Ver planes →',
    sinCompetidores:'Sin competidores en este negocio', sinCompetidoresDesc:'Agrega uno para comparar tu rating con el suyo.',
    leGanasPor:(d) => `le ganas por ${d}★`, teGanaPor:(d) => `te gana por ${d}★`,
    analizarConIA:'Analizar con IA', actualizarAnalisis:'Actualizar análisis', analizando:'Analizando...', analizarTitle:'Analizar reseñas del competidor con IA',
    analisisPlanPago:'Análisis con IA en plan Negocio →',
    dejarMonitorear:'Dejar de monitorear', errorAnalisis:'No se pudo analizar', errorConexionServidor:'Error de conexión con el servidor',
    confirmarBorrar:'Sí, quitar', cancelarBorrar:'Cancelar',
    analisisTitulo:'Análisis con IA', analisisBasado:'Basado en las reseñas públicas más recientes.',
    filtroSinResultados:'Ningún competidor coincide con el filtro.',
    cargando:'Cargando...',
    limiteAlcanzado:(l) => `Tu plan permite hasta ${l} competidor${l>1?'es':''} por negocio.`,
  },
  en: {
    titulo:'Competitors', sub:'All your competitors, organized by business, in one place.',
    buscarPlaceholder:'Filter by competitor name...',
    ordenLabel:'Sort businesses by:', ordenNombre:'Name', ordenBrecha:'Biggest gap with competitors first',
    sinNegocios:"You don't have any businesses yet.", sinNegociosSub:'Add your first business to start monitoring its competitors.',
    irANegocios:'Go to My businesses →',
    tuNegocio:'Your business', resenasCount:(n) => `${n} reviews`,
    competidoresDe:(a,b) => `${a} of ${b} competitors`,
    agregarCompetidor:'+ Add competitor', cancelar:'Cancel',
    buscarCompPlaceholder:(tipo) => `Search a ${tipo} competitor on Google Maps...`,
    buscando:'Searching...', errorAgregar:'Error adding', errorConexion:'Connection error',
    errorSinPais:'This business has no country assigned. Edit it from Settings to search for competitors.',
    planIncluye:'Your plan includes 1 competitor per business.', verPlanes:'View plans →',
    sinCompetidores:'No competitors for this business', sinCompetidoresDesc:'Add one to compare your rating against theirs.',
    leGanasPor:(d) => `you beat them by ${d}★`, teGanaPor:(d) => `they beat you by ${d}★`,
    analizarConIA:'Analyze with AI', actualizarAnalisis:'Refresh analysis', analizando:'Analyzing...', analizarTitle:"Analyze the competitor's reviews with AI",
    analisisPlanPago:'AI analysis on the Business plan →',
    dejarMonitorear:'Stop monitoring', errorAnalisis:'Could not analyze', errorConexionServidor:'Connection error with the server',
    confirmarBorrar:'Yes, remove', cancelarBorrar:'Cancel',
    analisisTitulo:'AI analysis', analisisBasado:'Based on the most recent public reviews.',
    filtroSinResultados:'No competitor matches the filter.',
    cargando:'Loading...',
    limiteAlcanzado:(l) => `Your plan allows up to ${l} competitor${l>1?'s':''} per business.`,
  },
};

export default function CompetenciaPage() {
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;

  const [grupos, setGrupos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [orden, setOrden] = useState('nombre');
  const [colapsados, setColapsados] = useState({});

  // Agregar competidor — un solo flujo activo a la vez, igual que en el
  // detalle de negocio, pero aquí puede apuntar a cualquiera de los grupos.
  const [addNegocioId, setAddNegocioId] = useState(null);
  const [compBusqueda, setCompBusqueda] = useState('');
  const [compResultados, setCompResultados] = useState([]);
  const [compBuscando, setCompBuscando] = useState(false);
  const [compError, setCompError] = useState('');
  // Borrado en dos pasos: `borrando` guarda el id del competidor que está
  // esperando confirmación, y `errorBorrar` el fallo si el servidor lo rechaza.
  const [borrando, setBorrando] = useState(null);
  const [errorBorrar, setErrorBorrar] = useState('');
  const [compAgregando, setCompAgregando] = useState(false);
  const compTimeoutRef = useRef(null);

  const [analisisComp, setAnalisisComp] = useState({});

  const cargar = () => {
    competidoresApi.listarTodos()
      .then(data => setGrupos(Array.isArray(data) ? data : []))
      .catch(() => setGrupos([]))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  // Búsqueda de competidor en Google Maps, scoped al negocio con el panel abierto
  useEffect(() => {
    if (!addNegocioId) return;
    if (compBusqueda.length < 3) { setCompResultados([]); return; }
    const negocio = grupos?.find(n => n.id === addNegocioId);
    if (!negocio?.pais) { setCompResultados([]); setCompError(t.errorSinPais); return; }
    clearTimeout(compTimeoutRef.current);
    compTimeoutRef.current = setTimeout(async () => {
      setCompBuscando(true); setCompError('');
      try {
        const data = await utils.buscarNegocio(compBusqueda, negocio.tipo || 'RESTAURANTE', negocio.pais);
        setCompResultados(Array.isArray(data) ? data : []);
      } catch (e) { setCompResultados([]); setCompError(e.message || t.errorConexion); }
      finally { setCompBuscando(false); }
    }, 600);
  }, [compBusqueda, addNegocioId]);

  const abrirAgregar = (negocioId) => {
    setAddNegocioId(negocioId); setCompBusqueda(''); setCompResultados([]); setCompError('');
  };
  const cerrarAgregar = () => { setAddNegocioId(null); setCompBusqueda(''); setCompResultados([]); setCompError(''); };

  const agregarCompetidor = async (negocioId, r) => {
    setCompAgregando(true); setCompError('');
    try {
      await competidoresApi.agregar(negocioId, { googlePlaceId: r.placeId });
      cerrarAgregar();
      cargar();
    } catch (e) { setCompError(e.message || t.errorAgregar); }
    finally { setCompAgregando(false); }
  };

  // Antes esto borraba al primer clic y, si el servidor fallaba, el `catch {}`
  // se lo tragaba: se llamaba a `cargar()` igual, el competidor reaparecía y el
  // usuario no tenía forma de saber si su clic había hecho algo. Ahora hay dos
  // pasos —el mismo patrón que ya usa /dashboard/conexiones para quitar una
  // cuenta— y el fallo se dice en pantalla. Dejar de monitorear a un competidor
  // tira también su histórico de comparación, así que preguntar no sobra.
  const eliminarCompetidor = async (id) => {
    setErrorBorrar('');
    try {
      await competidoresApi.eliminar(id);
      setBorrando(null);
      cargar();
    } catch (e) {
      setErrorBorrar(e.message || t.errorConexionServidor);
    }
  };

  const analizarCompetidor = async (negocioId, compId) => {
    if (analisisComp[compId]?.cargando) return;
    setAnalisisComp(prev => ({ ...prev, [compId]: { cargando:true } }));
    try {
      const data = await competidoresApi.analizar(negocioId, compId);
      setAnalisisComp(prev => ({ ...prev, [compId]: { texto: data.analisis } }));
    } catch (e) {
      setAnalisisComp(prev => ({ ...prev, [compId]: { error: e.message || t.errorAnalisis, upsell: e.message?.includes('límite') } }));
    }
  };

  const toggleColapsado = (negocioId) => setColapsados(prev => ({ ...prev, [negocioId]: !prev[negocioId] }));

  if (cargando) return <p style={{ color:'var(--text-2)', fontSize:14 }}>{t.cargando}</p>;

  if (!grupos?.length) {
    return (
      <div>
        <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{t.titulo}</h1>
        <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 24px' }}>{t.sub}</p>
        <Card style={{ textAlign:'center', padding:40 }}>
          <p style={{ color:'var(--text)', fontWeight:600, margin:'0 0 4px' }}>{t.sinNegocios}</p>
          <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 14px' }}>{t.sinNegociosSub}</p>
          <Link href="/dashboard/negocios" style={{ color:'#4CAF66', fontSize:13, fontWeight:600, textDecoration:'none' }}>{t.irANegocios}</Link>
        </Card>
      </div>
    );
  }

  const gruposOrdenados = [...grupos].sort((a, b) => {
    if (orden === 'nombre') return a.nombre.localeCompare(b.nombre);
    // Mayor brecha primero: negocio donde el peor competidor le saca más ventaja
    const brecha = (n) => {
      const miRating = n.snapshots?.[0]?.ratingActual ?? null;
      if (miRating == null || !n.competidores.length) return -Infinity;
      const peor = Math.max(...n.competidores.map(c => (c.ratingActual ?? 0) - miRating));
      return peor;
    };
    return brecha(b) - brecha(a);
  });

  const limite = LIMITE_COMPETIDORES[usuario?.plan] || 1;

  return (
    <div>
      <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{t.titulo}</h1>
      <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 20px' }}>{t.sub}</p>

      <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom:20 }}>
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder={t.buscarPlaceholder}
          style={{ flex:1, minWidth:220, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:8, padding:'9px 13px', fontSize:13, outline:'none' }} />
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, color:'var(--text-3)', whiteSpace:'nowrap' }}>{t.ordenLabel}</span>
          <select value={orden} onChange={e => setOrden(e.target.value)}
            style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:8, padding:'8px 12px', fontSize:12.5, outline:'none' }}>
            <option value="nombre">{t.ordenNombre}</option>
            <option value="brecha">{t.ordenBrecha}</option>
          </select>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {gruposOrdenados.map(negocio => {
          const snap = negocio.snapshots?.[0];
          const competidoresFiltrados = negocio.competidores.filter(c => c.nombre.toLowerCase().includes(filtro.toLowerCase()));
          if (filtro && competidoresFiltrados.length === 0) return null;
          const colapsado = !!colapsados[negocio.id];

          return (
            <Card key={negocio.id}>
              <div onClick={() => toggleColapsado(negocio.id)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, cursor:'pointer' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                  <span style={{ color:'var(--text-3)', display:'flex', transform:colapsado?'rotate(-90deg)':'none', transition:'transform 0.15s' }}>
                    <Icon name="chevron" size={14} />
                  </span>
                  <Link href={`/dashboard/negocios/${negocio.id}`} onClick={e => e.stopPropagation()}
                    style={{ color:'var(--text)', fontSize:15, fontWeight:700, textDecoration:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {negocio.nombre}
                  </Link>
                  <span style={{ fontSize:11, color:'var(--text-3)', background:'var(--surface2)', padding:'2px 8px', borderRadius:10, whiteSpace:'nowrap' }}>
                    {labelParaTipo(negocio.tipo, idioma)}
                  </span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
                  <span style={{ color:'#facc15', fontWeight:700, fontSize:14 }}>★ {snap?.ratingActual ?? '—'}</span>
                  <span style={{ fontSize:11.5, color:'var(--text-3)' }}>{t.competidoresDe(negocio.competidores.length, limite)}</span>
                </div>
              </div>

              {!colapsado && (
                <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border-c)' }}>
                  {addNegocioId === negocio.id ? (
                    <div style={{ marginBottom:14 }}>
                      {compError && (
                        <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:8, padding:'10px 14px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                          <span style={{ color:'#f59e0b', fontSize:13 }}>{compError}</span>
                          {compError.includes('plan') && <Link href="/dashboard/planes" style={{ background:'#0B7324', color:'#fff', padding:'6px 14px', borderRadius:6, fontSize:12, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>{t.verPlanes}</Link>}
                        </div>
                      )}
                      <div style={{ position:'relative', display:'flex', gap:8 }}>
                        <input autoFocus value={compBusqueda} onChange={e => setCompBusqueda(e.target.value)}
                          placeholder={t.buscarCompPlaceholder(labelParaTipo(negocio.tipo, idioma).toLowerCase())}
                          style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:8, padding:'10px 13px', fontSize:13, outline:'none' }} />
                        <button onClick={cerrarAgregar} style={{ background:'transparent', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:8, padding:'0 14px', fontSize:12.5, cursor:'pointer' }}>{t.cancelar}</button>
                        {(compBuscando || compResultados.length > 0) && (
                          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:88, background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:10, overflow:'hidden', zIndex:20, boxShadow:'0 8px 24px rgba(0,0,0,0.25)' }}>
                            {compBuscando ? <div style={{ padding:'12px 14px', color:'var(--text-2)', fontSize:13 }}>{t.buscando}</div>
                              : compResultados.map(r => (
                                <button key={r.placeId} type="button" onClick={() => agregarCompetidor(negocio.id, r)} disabled={compAgregando}
                                  style={{ width:'100%', textAlign:'left', padding:'11px 14px', borderBottom:'1px solid var(--border-c)', background:'none', border:'none', cursor:'pointer' }}>
                                  <div style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{r.nombre}</div>
                                  <div style={{ color:'var(--text-3)', fontSize:11, marginTop:2 }}>{r.direccion}</div>
                                  {r.rating && <div style={{ color:'#facc15', fontSize:11, marginTop:2 }}>★ {r.rating} · {t.resenasCount(r.totalResenas?.toLocaleString())}</div>}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => abrirAgregar(negocio.id)} disabled={negocio.competidores.length >= limite}
                      title={negocio.competidores.length >= limite ? t.limiteAlcanzado(limite) : undefined}
                      style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color: negocio.competidores.length >= limite ? 'var(--text-3)' : 'var(--text)', borderRadius:8, padding:'8px 14px', fontSize:12.5, fontWeight:600, cursor: negocio.competidores.length >= limite ? 'not-allowed' : 'pointer', marginBottom:14 }}>
                      {t.agregarCompetidor}
                    </button>
                  )}

                  {negocio.competidores.length === 0 ? (
                    <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>{t.sinCompetidoresDesc}</p>
                  ) : (
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'rgba(11,115,36,0.08)', border:'1px solid rgba(11,115,36,0.3)', borderRadius:10, marginBottom:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <span style={{ color:'var(--text)', fontSize:13, fontWeight:700 }}>{negocio.nombre}</span>
                          <span style={{ color:'#4CAF66', fontSize:11, marginLeft:8 }}>{t.tuNegocio}</span>
                        </div>
                        <span style={{ color:'#facc15', fontWeight:700, fontSize:15 }}>★ {snap?.ratingActual ?? '—'}</span>
                        <span style={{ color:'var(--text-3)', fontSize:11, width:90, textAlign:'right' }}>{t.resenasCount(snap?.totalResenas?.toLocaleString() ?? '—')}</span>
                      </div>
                      {competidoresFiltrados.length === 0 ? (
                        <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>{t.filtroSinResultados}</p>
                      ) : competidoresFiltrados.map(c => {
                        const cRating = c.snapshots?.[0]?.ratingActual ?? c.ratingActual;
                        const delta = snap?.ratingActual != null && cRating != null ? (snap.ratingActual - cRating) : null;
                        const analisis = analisisComp[c.id];
                        return (
                          <div key={c.id} style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:10, marginBottom:8, overflow:'hidden' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', flexWrap:'wrap' }}>
                              <div style={{ flex:1, minWidth:120 }}>
                                <span style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{c.nombre}</span>
                                {delta != null && (
                                  <span style={{ fontSize:11, marginLeft:8, color: delta >= 0 ? '#22c55e' : '#f87171' }}>
                                    {delta >= 0 ? t.leGanasPor(delta.toFixed(1)) : t.teGanaPor(Math.abs(delta).toFixed(1))}
                                  </span>
                                )}
                              </div>
                              <span style={{ color:'#facc15', fontWeight:700, fontSize:15 }}>★ {cRating ?? '—'}</span>
                              {usuario?.plan === 'GRATIS' ? (
                                <Link href="/dashboard/planes" style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'#4CAF66', borderRadius:8, padding:'6px 12px', fontSize:11.5, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>
                                  {t.analisisPlanPago}
                                </Link>
                              ) : (
                                <button onClick={() => analizarCompetidor(negocio.id, c.id)} disabled={analisis?.cargando}
                                  title={t.analizarTitle}
                                  style={{ background:'#0B7324', border:'none', color:'#fff', borderRadius:8, padding:'6px 12px', fontSize:11.5, fontWeight:600, cursor:analisis?.cargando?'wait':'pointer', display:'inline-flex', alignItems:'center', gap:6, opacity:analisis?.cargando?0.7:1, whiteSpace:'nowrap' }}>
                                  <Icon name="destello" size={11} /> {analisis?.cargando ? t.analizando : analisis?.texto ? t.actualizarAnalisis : t.analizarConIA}
                                </button>
                              )}
                              {borrando === c.id ? (
                                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                                  <button onClick={() => { setBorrando(null); setErrorBorrar(''); }}
                                    style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:6, padding:'5px 10px', fontSize:11.5, cursor:'pointer', whiteSpace:'nowrap' }}>
                                    {t.cancelarBorrar}
                                  </button>
                                  <button onClick={() => eliminarCompetidor(c.id)}
                                    style={{ background:'#B74040', border:'none', color:'#fff', borderRadius:6, padding:'5px 10px', fontSize:11.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                                    {t.confirmarBorrar}
                                  </button>
                                </span>
                              ) : (
                                <button onClick={() => { setBorrando(c.id); setErrorBorrar(''); }}
                                  title={t.dejarMonitorear} aria-label={t.dejarMonitorear}
                                  style={{ background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', padding:4, display:'flex', borderRadius:6 }}>
                                  <Icon name="basura" size={14} />
                                </button>
                              )}
                            </div>

                            {/* El fallo al quitar se muestra en la fila del
                                competidor afectado, no en un cartel global:
                                así se ve junto al botón que se pulsó. */}
                            {errorBorrar && borrando === c.id && (
                              <div style={{ borderTop:'1px solid var(--border-c)', padding:'8px 14px' }}>
                                <span style={{ color:'#f87171', fontSize:12 }}>{errorBorrar}</span>
                              </div>
                            )}

                            {analisis?.error && (
                              <div style={{ borderTop:'1px solid var(--border-c)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                                <span style={{ color:'#f59e0b', fontSize:12 }}>{analisis.error}</span>
                                {analisis.upsell && <Link href="/dashboard/planes" style={{ background:'#0B7324', color:'#fff', padding:'5px 12px', borderRadius:6, fontSize:11.5, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>{t.verPlanes}</Link>}
                              </div>
                            )}

                            {analisis?.texto && (
                              <div style={{ borderTop:'1px solid var(--border-c)', padding:'14px 16px', background:'var(--surface)' }}>
                                <p style={{ fontSize:10.5, fontWeight:700, color:'#4CAF66', textTransform:'uppercase', letterSpacing:0.8, margin:'0 0 10px', display:'flex', alignItems:'center', gap:6 }}>
                                  <Icon name="destello" size={12} /> {t.analisisTitulo}
                                </p>
                                {analisis.texto.split('\n').filter(l => l.trim()).map((linea, i) => {
                                  const esTitulo = /^(FORTALEZAS|DEBILIDADES|QUEJAS|COMO TOMAR)/i.test(linea.trim());
                                  const esVineta = linea.trim().startsWith('-');
                                  if (esTitulo) return <p key={i} style={{ fontSize:12, fontWeight:700, color:'var(--text)', margin:'12px 0 5px', textTransform:'capitalize' }}>{linea.replace(/:$/,'').toLowerCase().replace(/^./, ch => ch.toUpperCase())}</p>;
                                  if (esVineta) return (
                                    <div key={i} style={{ display:'flex', gap:8, marginBottom:5, alignItems:'flex-start' }}>
                                      <span style={{ color:'#4CAF66', flexShrink:0, fontSize:12 }}>→</span>
                                      <span style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.6 }}>{linea.replace(/^-\s*/, '')}</span>
                                    </div>
                                  );
                                  return <p key={i} style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.6, margin:'0 0 6px' }}>{linea}</p>;
                                })}
                                <p style={{ fontSize:10.5, color:'var(--text-3)', margin:'10px 0 0' }}>{t.analisisBasado}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
