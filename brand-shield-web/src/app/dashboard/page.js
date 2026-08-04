'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { useIdioma } from '../../context/IdiomaContext';
import { negociosApi, alertas as alertasApi } from '../../lib/api';
import Icon, { ICONO_ALERTA } from '../../components/Icons';
import Semaforo from '../../components/Semaforo';
import { iconoParaTipo, labelParaTipo } from '../../lib/tiposNegocio';

// ── Diccionario de textos (es / en) ──────────────────────
const TEXTOS = {
  es: {
    saludo:(nombre)=>`Hola, ${nombre}`,
    subtitulo:'Aquí está el resumen de tu reputación',
    stats: { negociosActivos:'Negocios activos', alertasSinLeer:'Alertas sin leer', totalAlertas:'Total alertas' },
    negocios: {
      titulo:'Mis negocios', verTodos:'Ver todos →',
      vacioTexto:'Aún no tienes negocios monitoreados', vacioBtn:'+ Agregar negocio',
      sinDatos:'Sin datos aún',
      alerta:(n)=> `${n} alerta${n>1?'s':''}`,
    },
    alertas: {
      titulo:'Alertas recientes', verTodas:'Ver todas →',
      vacioTitulo:'Todo tranquilo por ahora', vacioSub:'Te avisaremos si detectamos algo sospechoso',
    },
    semaforo: 'Reputación general',
  },
  en: {
    saludo:(nombre)=>`Hi, ${nombre}`,
    subtitulo:'Here is the summary of your reputation',
    stats: { negociosActivos:'Active businesses', alertasSinLeer:'Unread alerts', totalAlertas:'Total alerts' },
    negocios: {
      titulo:'My businesses', verTodos:'View all →',
      vacioTexto:'You have no monitored businesses yet', vacioBtn:'+ Add business',
      sinDatos:'No data yet',
      alerta:(n)=> `${n} alert${n>1?'s':''}`,
    },
    alertas: {
      titulo:'Recent alerts', verTodas:'View all →',
      vacioTitulo:'All quiet for now', vacioSub:"We'll let you know if we detect anything suspicious",
    },
    semaforo: 'Overall reputation',
  },
};

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [negocios, setNegocios] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([negociosApi.listar(), alertasApi.listar()])
      .then(([n, a]) => { setNegocios(n); setAlertas(a); })
      .catch(console.error)
      .finally(() => setCargando(false));
    // Ocultar banner si ya fue cerrado antes
  }, []);

  const alertasNoLeidas = alertas.filter(a => !a.leida).length;
  if (cargando) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:240 }}>
      <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12, marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{t.saludo(usuario?.nombre?.split(' ')[0])}</h1>
          <p style={{ color:'var(--text-2)', margin:0, fontSize:14 }}>{t.subtitulo}</p>
        </div>
        {negocios[0]?.snapshots?.[0] && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:10, padding:'10px 14px' }}>
            <span style={{ fontSize:12, color:'var(--text-2)' }}>{t.semaforo}</span>
            <Semaforo
              rating={negocios[0].snapshots[0].ratingActual}
              insight={negocios[0].ultimoInsightSemanal}
              mostrarInsight={usuario?.plan !== 'GRATIS'}
            />
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:t.stats.negociosActivos, val: negocios.length, color:'var(--text)' },
          { label:t.stats.alertasSinLeer, val: alertasNoLeidas, color: alertasNoLeidas > 0 ? '#f87171' : 'var(--text)' },
          { label:t.stats.totalAlertas, val: alertas.length, color:'var(--text)' },
        ].map((s,i) => (
          <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20 }}>
            <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 6px' }}>{s.label}</p>
            <p style={{ fontSize:32, fontWeight:700, color:s.color, margin:0 }}>{s.val}</p>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16 }}>
        {/* Negocios */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <h2 style={{ fontSize:15, fontWeight:600, color:'var(--text)', margin:0 }}>{t.negocios.titulo}</h2>
            <Link href="/dashboard/negocios" style={{ fontSize:12, color:'#4CAF66', textDecoration:'none' }}>{t.negocios.verTodos}</Link>
          </div>
          {negocios.length === 0 ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <p style={{ color:'var(--text-2)', fontSize:13, marginBottom:12 }}>{t.negocios.vacioTexto}</p>
              <Link href="/dashboard/negocios" style={{ background:'#0B7324', color:'#fff', padding:'8px 16px', borderRadius:8, fontSize:13, textDecoration:'none' }}>{t.negocios.vacioBtn}</Link>
            </div>
          ) : negocios.map(n => {
            const snap = n.snapshots?.[0];
            return (
              <Link key={n.id} href={`/dashboard/negocios/${n.id}`} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'var(--surface2)', borderRadius:10, marginBottom:8, textDecoration:'none', border:`1px solid ${n.colorEtiqueta||'#3AA857'}22` }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Icon name={iconoParaTipo(n.tipo)} size={18} color="var(--text-2)" />
                  <div>
                    <p style={{ color:'var(--text)', fontSize:13, fontWeight:500, margin:'0 0 2px' }}>{n.nombre}</p>
                    <p style={{ color:'var(--text-3)', fontSize:11, margin:0 }}>{labelParaTipo(n.tipo, idioma)}</p>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  {snap ? <p style={{ color:'#facc15', fontWeight:700, fontSize:14, margin:'0 0 2px' }}>★ {snap.ratingActual}</p> : <p style={{ color:'var(--text-3)', fontSize:11, margin:0 }}>{t.negocios.sinDatos}</p>}
                  {(n._count?.alertas||0) > 0 && <span className="pulse-badge" style={{ fontSize:10, color:'#f87171', background:'rgba(248,113,113,0.1)', padding:'1px 6px', borderRadius:8 }}>{t.negocios.alerta(n._count.alertas)}</span>}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Alertas */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <h2 style={{ fontSize:15, fontWeight:600, color:'var(--text)', margin:0 }}>{t.alertas.titulo}</h2>
            <Link href="/dashboard/alertas" style={{ fontSize:12, color:'#4CAF66', textDecoration:'none' }}>{t.alertas.verTodas}</Link>
          </div>
          {alertas.length === 0 ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}><Icon name="checkCirc" size={32} color="#0B7324" /></div>
              <p style={{ color:'var(--text-2)', fontSize:13 }}>{t.alertas.vacioTitulo}</p>
              <p style={{ color:'var(--text-3)', fontSize:12 }}>{t.alertas.vacioSub}</p>
            </div>
          ) : alertas.slice(0,5).map(a => (
            <div key={a.id} style={{ padding:'10px 12px', background: a.leida ? 'var(--surface2)' : 'rgba(245,158,11,0.06)', border:`1px solid ${a.leida?'var(--border-c)':'rgba(245,158,11,0.2)'}`, borderRadius:10, marginBottom:8, opacity: a.leida ? 0.7:1 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <Icon name={ICONO_ALERTA[a.tipo]||'alerta'} size={16} color="#f59e0b" style={{ marginTop:2 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:11, fontWeight:500, color:'var(--text-2)', margin:'0 0 2px' }}>{a.negocio?.nombre}</p>
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:0, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{a.descripcion}</p>
                </div>
                {!a.leida && <span style={{ width:7, height:7, borderRadius:'50%', background:'#ef4444', flexShrink:0, marginTop:4 }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
