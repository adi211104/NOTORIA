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
      { id:'CUENTAS_NUEVAS', l:'Campañas coordinadas', d:'Varias reseñas negativas que repiten el mismo texto desde cuentas distintas' },
      { id:'CAIDA_RATING', l:'Caídas de rating', d:'Cuando tu calificación general baja entre escaneos' },
      { id:'MENCION_NEGATIVA', l:'Menciones negativas', d:'Cuando alguien habla mal de tu marca fuera de tu ficha' },
      { id:'COMENTARIO_NEGATIVO', l:'Comentarios negativos', d:'Comentarios molestos en tus propias publicaciones de redes' },
    ],
    labels: {
      PICO_RESENAS_NEGATIVAS: 'Pico de reseñas negativas',
      CAIDA_RATING: 'Caída de rating',
      CUENTAS_NUEVAS: 'Campaña coordinada',
      RESENA_MUY_NEGATIVA: 'Reseña crítica',
      MENCION_NEGATIVA: 'Mención negativa',
      COMENTARIO_NEGATIVO: 'Comentario negativo',
    },
    config: {
      titulo: 'Configurar notificaciones',
      desc: 'Elige qué alertas quieres recibir por email y con qué frecuencia. Todas las alertas siguen apareciendo aquí en el dashboard aunque desactives su notificación.',
      umbralLabel: 'Notificarme de reseñas negativas:',
      umbralCada: 'Cada reseña negativa',
      // 🔴 Decía «Solo picos (5+ en 24h)» y era una promesa muerta: la señal de
      // picos por conteo no puede dispararse nunca (Google Places entrega 5
      // reseñas como máximo por consulta), así que quien marcaba esa opción se
      // quedaba sin ningún aviso y sin saberlo. Ahora agrupa de verdad.
      umbralPicos: 'Agrupadas: 1 correo por cada 5',
      umbralAyuda: (n) => n === 5
        ? 'Juntamos las reseñas y te mandamos un solo correo cada 5. Menos correo, nada que se pierda: el panel las muestra todas al momento.'
        : 'Un correo por cada reseña negativa, en cuanto la detectamos.',
      resumenLabel: 'Resumen de tus negocios:',
      resumenMensual: 'Mensual (día 1)',
      resumenSemanal: 'Semanal',
      resumenAyuda: (cadencia, diaLabel) => cadencia === 'SEMANAL'
        ? `Cada ${diaLabel} a las 8:00 recibirás el resumen de los últimos 7 días: rating, reseñas nuevas y score.`
        : 'El día 1 de cada mes a las 8:00 recibirás el resumen de los últimos 30 días: rating, reseñas nuevas y score.',
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
      // "Sin alertas" y "no pude consultarlas" NO pueden verse igual en una
      // herramienta de monitoreo. Ver la nota del estado `error`.
      errorTitulo: 'No pudimos cargar tus alertas',
      errorSub: 'Esto NO quiere decir que no haya ninguna: quiere decir que no pudimos consultarlas. Revisa tu conexión y vuelve a intentarlo.',
      errorBoton: 'Reintentar',
      errorSubtitulo: 'Estado desconocido',
    },
  },

  en: {
    diasSemana: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    tipos: [
      { id:'RESENA_MUY_NEGATIVA', l:'Very negative reviews', d:'Every 1-2 star review detected' },
      { id:'PICO_RESENAS_NEGATIVAS', l:'Attacks and negative spikes', d:'Several negative reviews within a few hours (possible attack)' },
      { id:'CUENTAS_NUEVAS', l:'Coordinated campaigns', d:'Several negative reviews repeating the same text from different accounts' },
      { id:'CAIDA_RATING', l:'Rating drops', d:'When your overall rating falls between scans' },
      { id:'MENCION_NEGATIVA', l:'Negative mentions', d:'When someone speaks badly of your brand outside your listing' },
      { id:'COMENTARIO_NEGATIVO', l:'Negative comments', d:'Hostile comments on your own social posts' },
    ],
    labels: {
      PICO_RESENAS_NEGATIVAS: 'Spike in negative reviews',
      CAIDA_RATING: 'Rating drop',
      CUENTAS_NUEVAS: 'Coordinated campaign',
      RESENA_MUY_NEGATIVA: 'Critical review',
      MENCION_NEGATIVA: 'Negative mention',
      COMENTARIO_NEGATIVO: 'Negative comment',
    },
    config: {
      titulo: 'Configure notifications',
      desc: 'Choose which alerts you want to receive by email and how often. All alerts still appear here in the dashboard even if you turn off their notification.',
      umbralLabel: 'Notify me about negative reviews:',
      umbralCada: 'Every negative review',
      umbralPicos: 'Batched: 1 email per 5',
      umbralAyuda: (n) => n === 5
        ? 'We group reviews and send a single email every 5. Less email, nothing lost: the dashboard shows them all right away.'
        : 'One email per negative review, as soon as we detect it.',
      resumenLabel: 'Summary of your businesses:',
      resumenMensual: 'Monthly (1st)',
      resumenSemanal: 'Weekly',
      resumenAyuda: (cadencia, diaLabel) => cadencia === 'SEMANAL'
        ? `Every ${diaLabel} at 8:00 AM you will get the last 7 days: rating, new reviews and score.`
        : 'On the 1st of each month at 8:00 AM you will get the last 30 days: rating, new reviews and score.',
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
      errorTitulo: 'We could not load your alerts',
      errorSub: 'This does NOT mean there are none: it means we could not check for them. Check your connection and try again.',
      errorBoton: 'Retry',
      errorSubtitulo: 'Status unknown',
    },
  },
};

// Panel de configuración de notificaciones (vive fuera del componente de página
// para no perder estado ni foco en re-renders)
function ConfigNotificaciones({ prefsIniciales, resueltas, onGuardado }) {
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const base = prefsIniciales || {};
  const [tipos, setTipos] = useState(() => {
    const obj = {};
    for (const tc of TEXTOS.es.tipos) obj[tc.id] = base.tipos?.[tc.id] !== false;
    return obj;
  });
  // 🔴 El valor inicial sale de lo RESUELTO por el backend, no de `prefsAlertas`
  // crudo. El default del lote depende del plan (GRATIS agrupa de a 5), así que
  // leer el campo crudo —que en una cuenta nueva es `undefined`— pintaría «cada
  // reseña negativa» a alguien que las recibe agrupadas: el panel diría una cosa
  // y la bandeja otra. Ver lib/prefsCorreo.js en el backend.
  const [umbral, setUmbral] = useState(resueltas?.lote === 5 ? 5 : 1);
  const [frecuencia, setFrecuencia] = useState(base.frecuencia || 'INMEDIATA');
  const [diaSemana, setDiaSemana] = useState(Number.isInteger(base.diaSemana) ? base.diaSemana : 1);
  // Cadencia del resumen por negocio — el correo que más manda el producto. Por
  // defecto MENSUAL desde el 2026-09-09; antes salía todos los domingos para todo
  // el mundo y no había forma de bajarle el ritmo.
  const [cadencia, setCadencia] = useState(resueltas?.cadenciaResumen || 'MENSUAL');
  const [diaResumen, setDiaResumen] = useState(
    Number.isInteger(resueltas?.diaResumen) ? resueltas.diaResumen : 0,
  );
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const guardar = async () => {
    setGuardando(true); setMsg('');
    try {
      const res = await fetch(`${API_URL}/api/auth/preferencias-alertas`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('bs_token')}` },
        body: JSON.stringify({
          tipos, umbralNegativas: umbral, frecuencia, diaSemana,
          resumen: { cadencia, diaSemana: diaResumen },
        }),
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
          {/* Se explica qué hace cada opción. La etiqueta sola daba a entender
              algo distinto de lo que ocurría, que es cómo esta pantalla acabó
              prometiendo «solo picos» y no mandando nada. */}
          <p style={{ fontSize:11, color:'var(--text-3)', margin:'7px 0 0', lineHeight:1.5 }}>
            {t.config.umbralAyuda(umbral)}
          </p>
        </div>
      )}

      {/* Cadencia del resumen por negocio.
          Es un ajuste DISTINTO de la frecuencia de abajo, y conviene no
          confundirlos: esto gobierna el correo con el rating y las reseñas nuevas
          de cada negocio; lo de abajo, el digest de alertas. */}
      <div style={{ marginBottom:16 }}>
        <p style={{ fontSize:12, color:'var(--text-3)', margin:'0 0 7px' }}>{t.config.resumenLabel}</p>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <button onClick={() => setCadencia('MENSUAL')} style={chip(cadencia === 'MENSUAL')}>{t.config.resumenMensual}</button>
          <button onClick={() => setCadencia('SEMANAL')} style={chip(cadencia === 'SEMANAL')}>{t.config.resumenSemanal}</button>
          {cadencia === 'SEMANAL' && (
            <select value={diaResumen} onChange={e => setDiaResumen(Number(e.target.value))}
              style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:8, padding:'6px 10px', fontSize:12 }}>
              {t.diasSemana.map((d,i) => <option key={i} value={i}>{t.config.cadaDia(d.toLowerCase())}</option>)}
            </select>
          )}
        </div>
        <p style={{ fontSize:11, color:'var(--text-3)', margin:'7px 0 0', lineHeight:1.5 }}>
          {t.config.resumenAyuda(cadencia, t.diasSemana[diaResumen].toLowerCase())}
        </p>
      </div>

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
  const { usuario, refrescarPerfil, puede } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState('todas');
  const [mostrarConfig, setMostrarConfig] = useState(false);

  // 🔴 El error NO se traga. Antes era `.catch(console.error)` y la pantalla
  // seguía adelante con la lista vacía, mostrando el cartel verde de "Sin
  // alertas / No hay alertas registradas aún". O sea que ante un backend caído
  // o el WiFi del local fallando, Notoria afirmaba que no había nada que
  // atender sin haberlo podido comprobar. En una herramienta cuyo trabajo es
  // avisar, ese falso "todo bien" es el peor fallo posible.
  const cargar = () => {
    setCargando(true);
    setError(false);
    alertasApi.listar()
      .then(setLista)
      .catch((e) => { console.error(e); setError(true); })
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
          {/* Con error, ni "N sin leer" ni "Todo al día": ambos se calculan
              sobre una lista vacía que nunca llegó a cargarse, y "Todo al día"
              contradiría al recuadro de error de abajo. Mientras carga tampoco
              se afirma nada. */}
          <p className="text-gray-400 mt-1">
            {error ? t.pagina.errorSubtitulo
              : cargando ? ' '
              : noLeidas > 0 ? t.pagina.sinLeer(noLeidas) : t.pagina.alDia}
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
          {puede('equipo') && (
            <button
              onClick={() => setMostrarConfig(v => !v)}
              className={`text-sm px-4 py-2 rounded-lg border transition inline-flex items-center gap-2 ${mostrarConfig ? 'bg-green-800 border-green-800 text-white' : 'text-gray-400 hover:text-white border-gray-700 hover:border-gray-600'}`}
            >
              <Icon name="ajustes" size={14} /> {t.pagina.configBtn}
            </button>
          )}
        </div>
      </div>

      {/* Configuración de notificaciones.
          Solo el propietario. Las preferencias que respeta el worker son las de
          la cuenta —quien recibe la alerta original—, así que a un invitado esta
          pantalla le guardaría unas preferencias suyas que no cambian nada de lo
          que llega. Prometer un ajuste que no hace nada es peor que no ofrecerlo. */}
      {mostrarConfig && puede('equipo') && (
        <ConfigNotificaciones
          prefsIniciales={usuario?.prefsAlertas}
          /* Las preferencias YA RESUELTAS que manda el backend, con los defaults
             del plan aplicados. Sin esto el panel tendría que deducir el default
             del lote —que depende del plan— y le enseñaría «cada reseña» a una
             cuenta gratuita que en realidad las recibe agrupadas de a cinco. */
          resueltas={usuario?.prefsCorreo}
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
      ) : error ? (
        /* Va ANTES del caso "lista vacía": si no pudimos consultar, no se
           afirma que no haya nada. */
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, padding:'28px 30px', textAlign:'center' }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:10 }}>
            <Icon name="alerta" size={26} color="#f87171" />
          </div>
          <p style={{ color:'var(--text)', fontSize:15, fontWeight:600, margin:'0 0 6px' }}>{t.pagina.errorTitulo}</p>
          <p style={{ color:'var(--text-2)', fontSize:13, lineHeight:1.6, margin:'0 auto 16px', maxWidth:420 }}>{t.pagina.errorSub}</p>
          <button onClick={cargar}
            style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {t.pagina.errorBoton}
          </button>
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
