'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { useIdioma } from '../../context/IdiomaContext';
import { negociosApi, alertas as alertasApi } from '../../lib/api';
import Icon, { ICONO_ALERTA } from '../../components/Icons';
import Semaforo from '../../components/Semaforo';
import { iconoParaTipo, labelParaTipo } from '../../lib/tiposNegocio';
import { textoAlerta } from '../../lib/alertas';

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
    hoy: {
      titulo:'Para hacer hoy',
      vacio:'Nada pendiente en ninguno de tus negocios.',
      FICHA_ALTERADA:(d)=> d.cuantas>1 ? `${d.cuantas} cambios en la ficha de Google` : 'Alguien cambió algo en tu ficha de Google',
      CRITICA_VENCIDA:(d)=> `${d.cuantas} reseña${d.cuantas>1?'s':''} crítica${d.cuantas>1?'s':''} sin responder — la más antigua lleva ${d.horas} h`,
      CRITICA_NUEVA:(d)=> `${d.cuantas} reseña${d.cuantas>1?'s':''} de 1★ o 2★ sin responder`,
      NEGATIVA_SIN_RESPONDER:(d)=> `${d.cuantas} reseña${d.cuantas>1?'s':''} de 3★ sin responder`,
      COMENTARIO_SIN_RESPONDER:(d)=> `${d.cuantas} comentario${d.cuantas>1?'s':''} sin responder`,
      ALERTAS_SIN_LEER:(d)=> `${d.cuantas} alerta${d.cuantas>1?'s':''} sin leer`,
      PEDIR_RESENAS:(d)=> `Solo ${d.total} reseñas: cada 1★ pesa mucho`,
    },
    // 🔴 El texto es explícito a propósito. Ver la nota del estado `error`.
    error: {
      titulo:'No pudimos cargar tus datos',
      sub:'Esto NO quiere decir que no haya alertas: quiere decir que no pudimos consultarlas. Revisa tu conexión y vuelve a intentarlo.',
      boton:'Reintentar',
    },
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
    hoy: {
      titulo:'To do today',
      vacio:'Nothing pending across your businesses.',
      FICHA_ALTERADA:(d)=> d.cuantas>1 ? `${d.cuantas} changes to your Google listing` : 'Someone changed something on your Google listing',
      CRITICA_VENCIDA:(d)=> `${d.cuantas} critical review${d.cuantas>1?'s':''} awaiting a reply — the oldest has waited ${d.horas} h`,
      CRITICA_NUEVA:(d)=> `${d.cuantas} 1★ or 2★ review${d.cuantas>1?'s':''} awaiting a reply`,
      NEGATIVA_SIN_RESPONDER:(d)=> `${d.cuantas} 3★ review${d.cuantas>1?'s':''} awaiting a reply`,
      COMENTARIO_SIN_RESPONDER:(d)=> `${d.cuantas} comment${d.cuantas>1?'s':''} awaiting a reply`,
      ALERTAS_SIN_LEER:(d)=> `${d.cuantas} unread alert${d.cuantas>1?'s':''}`,
      PEDIR_RESENAS:(d)=> `Only ${d.total} reviews: each 1★ hurts a lot`,
    },
    error: {
      titulo:'We could not load your data',
      sub:'This does NOT mean there are no alerts: it means we could not check for them. Check your connection and try again.',
      boton:'Retry',
    },
  },
};

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [negocios, setNegocios] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [tareas, setTareas] = useState(null);
  const [cargando, setCargando] = useState(true);
  // 🔴 Este estado arregla el peor fallo posible en una herramienta de
  // monitoreo. Antes el error se tragaba con `.catch(console.error)` y la
  // pantalla seguía su curso: las listas quedaban vacías y el panel mostraba
  // "Todo tranquilo por ahora — te avisaremos si detectamos algo sospechoso".
  // O sea que ante un backend caído, un token vencido o el WiFi del local
  // fallando, Notoria le decía al dueño que su reputación estaba bien SIN
  // HABERLA PODIDO CONSULTAR. Es justo la afirmación que el producto no puede
  // permitirse equivocar: "no hay alertas" y "no pude mirar" tienen que verse
  // distinto.
  const [error, setError] = useState(false);

  const cargar = () => {
    setCargando(true);
    setError(false);
    Promise.all([negociosApi.listar(), alertasApi.listar()])
      .then(([n, a]) => { setNegocios(n); setAlertas(a); })
      .catch((e) => { console.error(e); setError(true); })
      .finally(() => setCargando(false));
    // Las tareas van APARTE del Promise.all a propósito: si esta petición falla,
    // el panel tiene que seguir mostrando negocios y alertas. Una sección nueva
    // no puede ser el motivo por el que la pantalla de inicio deje de cargar.
    negociosApi.tareas()
      .then(setTareas)
      .catch(() => setTareas(null));
  };

  useEffect(() => { cargar(); }, []);

  const alertasNoLeidas = alertas.filter(a => !a.leida).length;
  if (cargando) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:240 }}>
      <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Si la consulta falló, se corta aquí: NO se pintan las cifras en cero ni el
  // "todo tranquilo", porque serían mentira. Es preferible una pantalla que
  // admite que no sabe.
  if (error) return (
    <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:14, padding:'28px 30px', maxWidth:560 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <Icon name="alerta" size={20} color="#f87171" />
        <h2 style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:0 }}>{t.error.titulo}</h2>
      </div>
      <p style={{ color:'var(--text-2)', fontSize:13.5, lineHeight:1.65, margin:'0 0 18px' }}>{t.error.sub}</p>
      <button onClick={cargar}
        style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
        {t.error.boton}
      </button>
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

      {/* Stats — cada cifra ES un enlace a la pantalla donde se actúa sobre
          ella. Antes eran tres números muertos: el usuario leía "3 alertas sin
          leer" y tenía que ir a buscarlas al menú. Al ser <Link>, además heredan
          el hover y la pulsación de la capa de interacción sin nada extra.
          El icono no es decorativo: hace la tarjeta reconocible de un vistazo,
          que es como se leen estas cifras — de reojo, no leyendo la etiqueta. */}
      {/* minmax de 220 y no 160: a 390 px de pantalla, 160 dejaba caber DOS
          tarjetas y la tercera bajaba sola a media fila, con un hueco al lado
          que se veía como un error de maquetación. Con 220 el móvil pasa a una
          columna limpia y el escritorio sigue mostrando las tres en fila. */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:t.stats.negociosActivos, val:negocios.length, icono:'tienda', href:'/dashboard/negocios', color:'var(--text)', tinte:'var(--accent-t)', borde:'var(--accent-b)', iconoColor:'#4CAF66' },
          // La única que cambia de color: si hay algo sin leer, la tarjeta entera
          // se tiñe de rojo. Es el aviso más barato del panel.
          { label:t.stats.alertasSinLeer, val:alertasNoLeidas, icono:'campana', href:'/dashboard/alertas',
            color: alertasNoLeidas > 0 ? '#f87171' : 'var(--text)',
            tinte: alertasNoLeidas > 0 ? 'rgba(248,113,113,0.1)' : 'var(--surface2)',
            borde: alertasNoLeidas > 0 ? 'rgba(248,113,113,0.3)' : 'var(--border-c)',
            iconoColor: alertasNoLeidas > 0 ? '#f87171' : 'var(--text-3)' },
          { label:t.stats.totalAlertas, val:alertas.length, icono:'grafica', href:'/dashboard/alertas', color:'var(--text)', tinte:'var(--surface2)', borde:'var(--border-c)', iconoColor:'var(--text-3)' },
        ].map((s,i) => (
          <Link key={i} href={s.href}
            style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20, textDecoration:'none', display:'block' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:10 }}>
              <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>{s.label}</p>
              <span style={{ width:32, height:32, borderRadius:9, background:s.tinte, border:`1px solid ${s.borde}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon name={s.icono} size={16} color={s.iconoColor} />
              </span>
            </div>
            <p style={{ fontSize:32, fontWeight:700, color:s.color, margin:0, lineHeight:1 }}>{s.val}</p>
          </Link>
        ))}
      </div>


      {/* ── Para hacer hoy ──────────────────────────────────────────────────
          El panel contestaba bien «¿cómo estoy?» y nada «¿qué hago?». Esto sale
          de GET /api/negocios/tareas y no gasta cuota de Google ni de la IA.

          ⚠️ Se esconde entera si no hay nada: es la regla de producto del
          proyecto —lo que no podemos entregar no se muestra— y una lista vacía
          con un título encima ocupa sitio sin decir nada. Con la ficha al día,
          el panel felicita en una línea dentro de la propia tarjeta. */}
      {tareas && tareas.total > 0 && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20, marginBottom:24 }}>
          <h2 style={{ fontSize:15, fontWeight:600, color:'var(--text)', margin:'0 0 14px' }}>{t.hoy.titulo}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {tareas.negocios.flatMap((n) =>
              n.tareas.map((tarea) => {
                const texto = t.hoy[tarea.tipo];
                // Un tipo que este panel no conoce se OMITE. Imprimir el enum
                // crudo sería enseñarle "TEMA_CRECIENDO" a un cliente.
                if (!texto) return null;
                return (
                  <Link key={`${n.negocio.id}:${tarea.id}`} href={`/dashboard/negocios/${n.negocio.id}`}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', textDecoration:'none',
                      background:'var(--bg)', border:'1px solid var(--border-c)', borderRadius:8 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                      background: tarea.prioridad >= 80 ? '#ef4444' : tarea.prioridad >= 40 ? '#f59e0b' : '#22c55e' }} />
                    <span style={{ flex:1, fontSize:13.5, color:'var(--text)', lineHeight:1.45 }}>{texto(tarea.datos)}</span>
                    <span style={{ fontSize:12, color:'var(--text-3)', flexShrink:0, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {n.negocio.nombre}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}

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
                  {/* 🔴 `textoAlerta`, NUNCA `a.descripcion` a secas. El backend
                      guarda esa columna redactada y siempre en español —es un
                      respaldo, no el texto de la interfaz— y mete las piezas en
                      `detalle` justo para que el panel arme la frase en el idioma
                      del usuario. Acá se pintaba en crudo, así que un panel en
                      inglés enseñaba «Nueva reseña de 1★ de…» en la pantalla de
                      inicio, que es la primera que se ve. Ver lib/alertas.js. */}
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:0, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{textoAlerta(a, idioma)}</p>
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
