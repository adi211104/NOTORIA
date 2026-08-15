'use client';
import { useEffect, useState } from 'react';
import { alertas as alertasApi, API_URL } from '../../../lib/api';
import { textoAlerta } from '../../../lib/alertas';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import Icon, { ICONO_ALERTA } from '../../../components/Icons';

const TEXTOS = {
  es: {
    diasSemana: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    tipos: [
      { id:'RESENA_MUY_NEGATIVA', l:'Reseñas muy negativas', d:'Cada reseña de 1-2 estrellas detectada' },
      { id:'PICO_RESENAS_NEGATIVAS', l:'Ataques y picos de negativas', d:'Varias reseñas negativas en pocas horas (posible ataque)' },
      { id:'CUENTAS_NUEVAS', l:'Cuentas sospechosas', d:'Reseñas de cuentas recién creadas o con patrones de bot' },
      { id:'CAIDA_RATING', l:'Caídas de rating', d:'Cuando tu calificación general baja entre escaneos' },
      { id:'MENCION_NEGATIVA', l:'Menciones negativas', d:'Cuando alguien habla mal de tu marca fuera de tu ficha' },
      { id:'COMENTARIO_NEGATIVO', l:'Comentarios negativos', d:'Comentarios molestos en tus propias publicaciones de redes' },
    ],
    labels: {
      PICO_RESENAS_NEGATIVAS: 'Pico de reseñas negativas',
      CAIDA_RATING: 'Caída de rating',
      CUENTAS_NUEVAS: 'Cuentas sospechosas',
      RESENA_MUY_NEGATIVA: 'Reseña crítica',
      MENCION_NEGATIVA: 'Mención negativa',
      COMENTARIO_NEGATIVO: 'Comentario negativo',
    },
    config: {
      titulo: 'Configurar notificaciones',
      desc: 'Elige qué alertas quieres recibir por email y con qué frecuencia. Todas las alertas siguen apareciendo aquí en el dashboard aunque desactives su notificación.',
      umbralLabel: 'Notificarme de reseñas negativas:',
      umbralCada: 'Cada reseña negativa',
      umbralPicos: 'Solo picos (5+ en 24h)',
      frecuenciaLabel: 'Frecuencia de los emails:',
      inmediata: 'Inmediata',
      semanal: 'Resumen semanal',
      mensual: 'Resumen mensual (día 1)',
      cadaDia: (d) => `Cada ${d}`,
      resumenTexto: (frecuencia, diaLabel) => `Recibirás un solo email ${frecuencia === 'SEMANAL' ? `cada ${diaLabel}` : 'el día 1 de cada mes'} a las 8:00 con todas las alertas del período.`,
      guardar: 'Guardar preferencias',
      guardando: 'Guardando...',
      msgGuardado: 'Preferencias guardadas. Se aplican desde la próxima alerta.',
      msgError: 'Error al guardar. Intenta de nuevo.',
    },
    pagina: {
      titulo: 'Alertas',
      sinLeer: (n) => `${n} alerta${n > 1 ? 's' : ''} sin leer`,
      alDia: 'Todo al día',
      marcarTodas: 'Marcar todas como leídas',
      configBtn: 'Configurar notificaciones',
      filtros: { todas: 'Todas', noLeidas: 'Sin leer', leidas: 'Leídas' },
      sinAlertas: 'Sin alertas',
      sinPendientes: 'No tienes alertas pendientes',
      sinRegistradas: 'No hay alertas registradas aún',
      marcarLeida: 'Marcar leída',
    },
  },

  en: {
    diasSemana: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    tipos: [
      { id:'RESENA_MUY_NEGATIVA', l:'Very negative reviews', d:'Every 1-2 star review detected' },
      { id:'PICO_RESENAS_NEGATIVAS', l:'Attacks and negative spikes', d:'Several negative reviews within a few hours (possible attack)' },
      { id:'CUENTAS_NUEVAS', l:'Suspicious accounts', d:'Reviews from newly created accounts or with bot patterns' },
      { id:'CAIDA_RATING', l:'Rating drops', d:'When your overall rating falls between scans' },
      { id:'MENCION_NEGATIVA', l:'Negative mentions', d:'When someone speaks badly of your brand outside your listing' },
      { id:'COMENTARIO_NEGATIVO', l:'Negative comments', d:'Hostile comments on your own social posts' },
    ],
    labels: {
      PICO_RESENAS_NEGATIVAS: 'Spike in negative reviews',
      CAIDA_RATING: 'Rating drop',
      CUENTAS_NUEVAS: 'Suspicious accounts',
      RESENA_MUY_NEGATIVA: 'Critical review',
      MENCION_NEGATIVA: 'Negative mention',
      COMENTARIO_NEGATIVO: 'Negative comment',
    },
    config: {
      titulo: 'Configure notifications',
      desc: 'Choose which alerts you want to receive by email and how often. All alerts still appear here in the dashboard even if you turn off their notification.',
      umbralLabel: 'Notify me about negative reviews:',
      umbralCada: 'Every negative review',
      umbralPicos: 'Only spikes (5+ in 24h)',
      frecuenciaLabel: 'Email frequency:',
      inmediata: 'Immediate',
      semanal: 'Weekly summary',
      mensual: 'Monthly summary (1st)',
      cadaDia: (d) => `Every ${d}`,
      resumenTexto: (frecuencia, diaLabel) => `You'll receive a single email ${frecuencia === 'SEMANAL' ? `every ${diaLabel}` : 'on the 1st of each month'} at 8:00 AM with all the alerts from that period.`,
      guardar: 'Save preferences',
      guardando: 'Saving...',
      msgGuardado: 'Preferences saved. They apply from the next alert onward.',
      msgError: 'Error saving. Please try again.',
    },
    pagina: {
      titulo: 'Alerts',
      sinLeer: (n) => `${n} unread alert${n > 1 ? 's' : ''}`,
      alDia: 'All caught up',
      marcarTodas: 'Mark all as read',
      configBtn: 'Configure notifications',
      filtros: { todas: 'All', noLeidas: 'Unread', leidas: 'Read' },
      sinAlertas: 'No alerts',
      sinPendientes: 'You have no pending alerts',
      sinRegistradas: 'No alerts recorded yet',
      marcarLeida: 'Mark as read',
    },
  },
};

// Panel de configuración de notificaciones (vive fuera del componente de página
// para no perder estado ni foco en re-renders)
function ConfigNotificaciones({ prefsIniciales, onGuardado }) {
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const base = prefsIniciales || {};
  const [tipos, setTipos] = useState(() => {
    const obj = {};
    for (const tc of TEXTOS.es.tipos) obj[tc.id] = base.tipos?.[tc.id] !== false;
    return obj;
  });
  const [umbral, setUmbral] = useState(base.umbralNegativas === 5 ? 5 : 1);
  const [frecuencia, setFrecuencia] = useState(base.frecuencia || 'INMEDIATA');
  const [diaSemana, setDiaSemana] = useState(Number.isInteger(base.diaSemana) ? base.diaSemana : 1);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const guardar = async () => {
    setGuardando(true); setMsg('');
    try {
      const res = await fetch(`${API_URL}/api/auth/preferencias-alertas`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('bs_token')}` },
        body: JSON.stringify({ tipos, umbralNegativas: umbral, frecuencia, diaSemana }),
      });
      if (!res.ok) throw new Error();
      setMsg(t.config.msgGuardado);
      if (onGuardado) onGuardado();
      setTimeout(() => setMsg(''), 4000);
    } catch { setMsg(t.config.msgError); }
    finally { setGuardando(false); }
  };

  const chip = (activo) => ({
    padding:'6px 14px', borderRadius:14, fontSize:12, cursor:'pointer',
    border:`1px solid ${activo ? '#0B7324' : 'var(--border-c)'}`,
    background: activo ? '#0B7324' : 'transparent',
    color: activo ? '#fff' : 'var(--text-2)',
  });

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20, marginBottom:20 }}>
      <p style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, color:'var(--text-3)', margin:'0 0 4px' }}>{t.config.titulo}</p>
      <p style={{ fontSize:12.5, color:'var(--text-2)', margin:'0 0 16px', lineHeight:1.6 }}>
        {t.config.desc}
      </p>

      {/* Tipos de alerta */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:8, marginBottom:16 }}>
        {t.tipos.map(tc => (
          <label key={tc.id} style={{ display:'flex', gap:10, alignItems:'flex-start', background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:10, padding:'10px 13px', cursor:'pointer', userSelect:'none' }}>
            <input type="checkbox" checked={tipos[tc.id]} onChange={e => setTipos(prev => ({ ...prev, [tc.id]: e.target.checked }))}
              style={{ marginTop:2, width:14, height:14, accentColor:'#0B7324', cursor:'pointer', flexShrink:0 }} />
            <span>
              <span style={{ display:'block', fontSize:13, fontWeight:600, color:'var(--text)' }}>{tc.l}</span>
              <span style={{ display:'block', fontSize:11, color:'var(--text-3)', marginTop:2, lineHeight:1.5 }}>{tc.d}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Umbral de negativas */}
      {tipos.RESENA_MUY_NEGATIVA && (
        <div style={{ marginBottom:16 }}>
          <p style={{ fontSize:12, color:'var(--text-3)', margin:'0 0 7px' }}>{t.config.umbralLabel}</p>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button onClick={() => setUmbral(1)} style={chip(umbral === 1)}>{t.config.umbralCada}</button>
            <button onClick={() => setUmbral(5)} style={chip(umbral === 5)}>{t.config.umbralPicos}</button>
          </div>
        </div>
      )}

      {/* Frecuencia */}
      <div style={{ marginBottom:16 }}>
        <p style={{ fontSize:12, color:'var(--text-3)', margin:'0 0 7px' }}>{t.config.frecuenciaLabel}</p>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <button onClick={() => setFrecuencia('INMEDIATA')} style={chip(frecuencia === 'INMEDIATA')}>{t.config.inmediata}</button>
          <button onClick={() => setFrecuencia('SEMANAL')} style={chip(frecuencia === 'SEMANAL')}>{t.config.semanal}</button>
          <button onClick={() => setFrecuencia('MENSUAL')} style={chip(frecuencia === 'MENSUAL')}>{t.config.mensual}</button>
          {frecuencia === 'SEMANAL' && (
            <select value={diaSemana} onChange={e => setDiaSemana(Number(e.target.value))}
              style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:8, padding:'6px 10px', fontSize:12 }}>
              {t.diasSemana.map((d,i) => <option key={i} value={i}>{t.config.cadaDia(d.toLowerCase())}</option>)}
            </select>
          )}
        </div>
        {frecuencia !== 'INMEDIATA' && (
          <p style={{ fontSize:11, color:'var(--text-3)', margin:'7px 0 0', lineHeight:1.5 }}>
            {t.config.resumenTexto(frecuencia, t.diasSemana[diaSemana].toLowerCase())}
          </p>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button onClick={guardar} disabled={guardando}
          style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', fontSize:13, fontWeight:600, cursor:guardando?'wait':'pointer', opacity:guardando?0.7:1 }}>
          {guardando ? t.config.guardando : t.config.guardar}
        </button>
        {msg && <span style={{ fontSize:12.5, color: (msg === t.config.msgError) ? '#f59e0b' : '#4CAF66' }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function AlertasPage() {
  const { usuario, refrescarPerfil } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [mostrarConfig, setMostrarConfig] = useState(false);

  const cargar = () => {
    alertasApi.listar()
      .then(setLista)
      .catch(console.error)
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  const marcarLeida = async (id) => {
    await alertasApi.leer(id);
    setLista((prev) => prev.map((a) => a.id === id ? { ...a, leida: true } : a));
  };

  const marcarTodas = async () => {
    await alertasApi.leerTodas();
    setLista((prev) => prev.map((a) => ({ ...a, leida: true })));
  };

  const filtradas = lista.filter((a) => {
    if (filtro === 'noLeidas') return !a.leida;
    if (filtro === 'leidas') return a.leida;
    return true;
  });

  const noLeidas = lista.filter((a) => !a.leida).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{t.pagina.titulo}</h1>
          <p className="text-gray-400 mt-1">
            {noLeidas > 0 ? t.pagina.sinLeer(noLeidas) : t.pagina.alDia}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {noLeidas > 0 && (
            <button
              onClick={marcarTodas}
              className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 px-4 py-2 rounded-lg transition"
            >
              {t.pagina.marcarTodas}
            </button>
          )}
          <button
            onClick={() => setMostrarConfig(v => !v)}
            className={`text-sm px-4 py-2 rounded-lg border transition inline-flex items-center gap-2 ${mostrarConfig ? 'bg-green-800 border-green-800 text-white' : 'text-gray-400 hover:text-white border-gray-700 hover:border-gray-600'}`}
          >
            <Icon name="ajustes" size={14} /> {t.pagina.configBtn}
          </button>
        </div>
      </div>

      {/* Configuración de notificaciones */}
      {mostrarConfig && (
        <ConfigNotificaciones
          prefsIniciales={usuario?.prefsAlertas}
          onGuardado={refrescarPerfil}
        />
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'todas', label: t.pagina.filtros.todas },
          { id: 'noLeidas', label: t.pagina.filtros.noLeidas },
          { id: 'leidas', label: t.pagina.filtros.leidas },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`text-sm px-4 py-1.5 rounded-full border transition ${
              filtro === f.id
                ? 'bg-green-800 border-green-800 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="flex justify-center mb-3"><Icon name="checkCirc" size={34} color="#0B7324" /></div>
          <p className="text-white font-medium mb-1">{t.pagina.sinAlertas}</p>
          <p className="text-gray-500 text-sm">
            {filtro === 'noLeidas' ? t.pagina.sinPendientes : t.pagina.sinRegistradas}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtradas.map((a) => (
            <div
              key={a.id}
              className={`bg-gray-900 border rounded-xl p-5 transition ${
                a.leida ? 'border-gray-800 opacity-60' : 'border-yellow-500/20'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="flex-shrink-0 mt-0.5"><Icon name={ICONO_ALERTA[a.tipo] || 'alerta'} size={20} color="#f59e0b" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-medium text-green-500">
                        {t.labels[a.tipo] || a.tipo}
                      </span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-gray-400">{a.negocio?.nombre}</span>
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                        {a.plataforma}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">{textoAlerta(a, idioma)}</p>
                    <p className="text-xs text-gray-600 mt-2">
                      {new Date(a.creadaEn).toLocaleString(idioma === 'en' ? 'en-US' : 'es-PE', {
                        timeZone: 'America/Lima',
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                {!a.leida && (
                  <button
                    onClick={() => marcarLeida(a.id)}
                    className="text-xs text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition flex-shrink-0"
                  >
                    {t.pagina.marcarLeida}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
