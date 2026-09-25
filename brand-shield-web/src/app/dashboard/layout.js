'use client';
import { nombrePlanLargo } from '../../lib/planes';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { useIdioma } from '../../context/IdiomaContext';
import GBPBanner from '../../components/GBPBanner';
import TourGuiado from '../../components/TourGuiado';
import { API_URL, cabecerasAuth } from '../../lib/api';

// La marca de Notoria. Ojo: el escudo rojo del estado "sin conexion" mas
// abajo NO es la marca, es un icono semantico de error — no unificarlos.
const ShieldIcon = ({ size=18, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} role="img" aria-label="Notoria">
    <path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/>
  </svg>
);

const SERIF = "Georgia,'Times New Roman',serif";

const NavIcon = ({ type, size=16 }) => {
  const paths = {
    home:    "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
    store:   ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z","M9 22V12h6v10","M2 9h20"],
    bell:    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    doc:     ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M16 13H8M16 17H8"],
    star:    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    versus:  ["M7 20V9","M17 20V4"],
    tarjeta: ["M2 5a2 2 0 012-2h16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5z","M2 10h20","M6 15h4"],
    enlace:  ["M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71","M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"],
    menciones:["M3 11l18-5v12L3 14v-3z","M11.6 16.8a3 3 0 11-5.8-1.6"],
    equipo:  ["M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2","M9 11a4 4 0 100-8 4 4 0 000 8","M22 21v-2a4 4 0 00-3-3.87","M16 3.13a4 4 0 010 7.75"],
    settings:"M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  };
  const d = paths[type];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {Array.isArray(d) ? d.map((p,i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
};

// Facturación NO está acá a propósito: se consulta de vez en cuando, no a
// diario, así que vive dentro de Configuración. La ruta /dashboard/facturacion
// sigue viva — los correos de comprobante enlazan directo a ella.
//
// Las ocho entradas están AGRUPADAS por lo que hace cada una, no en una lista
// plana. Ocho enlaces seguidos y sin jerarquía obligan a leerlos todos para
// encontrar uno; en tres bloques cortos se busca primero el bloque. El orden de
// los grupos sigue el uso real: primero lo que miras, luego lo que te llega,
// y al final lo que se configura una vez y no se vuelve a tocar.
//
// `soloSi` esconde una entrada cuando la función no está disponible en el
// servidor. Menciones no se ofrece si no hay ninguna fuente de escucha activa:
// no se anuncia como "próximamente", simplemente no existe hasta que funcione.
// Si un grupo se queda sin entradas visibles, no se pinta ni su rótulo.
//
// Planes salió del menú (2026-07-29): se consulta una vez, no a diario. Se llega
// desde el recuadro del plan de abajo y desde los upsells.
const navGrupos = [
  { key:'principal', items:[
    { href:'/dashboard',               key:'resumen',      icon:'home' },
  ]},
  { key:'vigilancia', items:[
    { href:'/dashboard/negocios',      key:'negocios',     icon:'store' },
    { href:'/dashboard/competencia',   key:'competencia',  icon:'versus' },
  ]},
  { key:'entrante', items:[
    { href:'/dashboard/alertas',       key:'alertas',      icon:'bell' },
    { href:'/dashboard/menciones',     key:'menciones',    icon:'menciones', soloSi:(u) => u?.mencionesDisponibles },
  ]},
  { key:'herramientas', items:[
    { href:'/dashboard/conexiones',    key:'conexiones',   icon:'enlace' },
    { href:'/dashboard/reportes',      key:'reportes',     icon:'doc' },
    // Equipo se le muestra a TODOS los roles, no solo al propietario: saber con
    // quién compartes el panel —y que lo que haces queda firmado con tu nombre—
    // es parte de trabajar en equipo, no un privilegio. Quien no puede
    // modificarlo ve la pantalla en modo lectura.
    { href:'/dashboard/equipo',        key:'equipo',       icon:'equipo' },
    { href:'/dashboard/configuracion', key:'configuracion',icon:'settings' },
  ]},
];

// ── Diccionario de textos (es / en) ──────────────────────
const TEXTOS = {
  es: {
    nav: { resumen:'Resumen', negocios:'Mis negocios', competencia:'Competencia', alertas:'Alertas', menciones:'Menciones', conexiones:'Conexiones', reportes:'Reportes PDF', equipo:'Equipo', planes:'Planes', facturacion:'Facturación', configuracion:'Configuración' },
    // `principal` va vacío a propósito: un rótulo sobre una sola entrada es ruido.
    navGrupos: { principal:'', vigilancia:'Lo que vigilas', entrante:'Lo que te llega', herramientas:'Herramientas' },
    cuentaActiva:'Estás viendo',
    tuCuenta:'tu cuenta',
    trabajandoEn:'Cuenta compartida: lo que hagas aquí sale a nombre de esta empresa.',
    avisoSalida:'Volviste a tu cuenta',
    emailVerif: {
      titulo:'Confirma tu correo',
      revisaBandeja:'Revisa tu bandeja y carpeta de spam. Puede tardar 1-2 min.',
      sinVerificar:'Sin verificar no recibirás alertas ni el resumen por email de tu negocio.',
      enviando:'Enviando...',
      reenviarEn:(s)=>`Reenviar en ${s}s`,
      enviado:'Enviado ✓ — Reenviar otro',
      error:'Error — Reintentar',
      reenviar:'Reenviar email de verificación',
    },
    offline: {
      titulo:'Sin conexión al servidor',
      descPre:'El backend no responde. Inicia el servidor con',
      descPost:'en la carpeta',
      reintentar:'Reintentar',
    },
    plan: {
      labels: (p) => nombrePlanLargo(p, 'es'),
      actual:'Plan actual',
      actualizar:'Actualizar →',
      verPlanes:'Ver planes →',
    },
    logout:'Cerrar sesión',
  },
  en: {
    nav: { resumen:'Overview', negocios:'My businesses', competencia:'Competitors', alertas:'Alerts', menciones:'Mentions', conexiones:'Connections', reportes:'PDF reports', equipo:'Team', planes:'Plans', facturacion:'Billing', configuracion:'Settings' },
    navGrupos: { principal:'', vigilancia:'What you watch', entrante:'What reaches you', herramientas:'Tools' },
    cuentaActiva:'Viewing',
    tuCuenta:'your account',
    trabajandoEn:'Shared account: whatever you do here goes out on behalf of this company.',
    avisoSalida:'Back on your own account',
    emailVerif: {
      titulo:'Confirm your email',
      revisaBandeja:'Check your inbox and spam folder. It can take 1-2 min.',
      sinVerificar:"Without verifying you won't get alerts or your email summary.",
      enviando:'Sending...',
      reenviarEn:(s)=>`Resend in ${s}s`,
      enviado:'Sent ✓ — Resend another',
      error:'Error — Retry',
      reenviar:'Resend verification email',
    },
    offline: {
      titulo:'No connection to the server',
      descPre:'The backend is not responding. Start the server with',
      descPost:'in the',
      reintentar:'Retry',
    },
    plan: {
      labels: (p) => nombrePlanLargo(p, 'en'),
      actual:'Current plan',
      actualizar:'Upgrade →',
      verPlanes:'View plans →',
    },
    logout:'Log out',
  },
};


function EmailVerifBanner({ onVerificado, t }) {
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState('idle'); // idle | enviado | error
  const [segundos, setSegundos] = useState(0);
  const intervaloRef = useRef(null);
  const GEO = "Georgia,'Times New Roman',serif";

  const iniciarTimer = () => {
    setSegundos(60);
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    intervaloRef.current = setInterval(() => {
      setSegundos(s => {
        if (s <= 1) { clearInterval(intervaloRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (intervaloRef.current) clearInterval(intervaloRef.current); }, []);

  const reenviar = async () => {
    if (segundos > 0 || enviando) return;
    setEnviando(true);
    try {
      const token = localStorage.getItem('bs_token');
      if (!token) { setEstado('error'); setEnviando(false); return; }
      const res = await fetch(`${API_URL}/api/auth/reenviar-verificacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabecerasAuth() },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.yaVerificado) {
        // El email ya estaba verificado — refrescar el perfil para ocultar el banner
        if (onVerificado) onVerificado();
      } else if (res.ok) {
        setEstado('enviado');
        iniciarTimer(); // solo iniciar timer si el envío fue exitoso
      } else {
        setEstado('error');
        console.warn('[Verif] Error del servidor:', data?.error || res.status);
      }
    } catch (e) {
      setEstado('error');
    } finally {
      setEnviando(false);
    }
  };

  const btnLabel = enviando
    ? t.emailVerif.enviando
    : segundos > 0
      ? t.emailVerif.reenviarEn(segundos)
      : estado === 'enviado' ? t.emailVerif.enviado
      : estado === 'error'  ? t.emailVerif.error
      : t.emailVerif.reenviar;

  const btnColor = segundos > 0 || enviando ? 'var(--text-3)' : estado === 'error' ? '#B74040' : '#8A6D00';
  const btnBg    = segundos > 0 || enviando ? 'var(--surface2)' : 'rgba(138,109,0,0.15)';
  const btnBorder= segundos > 0 || enviando ? 'var(--border-c)' : 'rgba(138,109,0,0.4)';

  return (
    <div style={{ background:'rgba(138,109,0,0.08)', border:'1px solid rgba(138,109,0,0.3)', borderRadius:6, padding:'10px 16px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A6D00" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
        <div>
          <p style={{ color:'var(--text)', fontSize:13, fontWeight:600, margin:'0 0 1px', fontFamily:GEO }}>{t.emailVerif.titulo}</p>
          <p style={{ color:'var(--text-2)', fontSize:12, margin:0, fontFamily:GEO }}>
            {estado === 'enviado' ? t.emailVerif.revisaBandeja : t.emailVerif.sinVerificar}
          </p>
        </div>
      </div>
      <button onClick={reenviar} disabled={segundos > 0 || enviando}
        style={{ background:btnBg, border:`1px solid ${btnBorder}`, color:btnColor, padding:'7px 14px', borderRadius:5, fontSize:12, fontWeight:600, cursor: segundos > 0 || enviando ? 'default' : 'pointer', whiteSpace:'nowrap', fontFamily:GEO, minWidth:140, textAlign:'center', transition:'all 0.15s' }}>
        {btnLabel}
      </button>
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const { usuario, cargando, errorConexion, logout, refrescarPerfil, cuentas, cuenta, cambiarCuenta, avisoCuenta, limpiarAvisoCuenta } = useAuth();
  const { idioma } = useIdioma();
  const router = useRouter();
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const t = TEXTOS[idioma] || TEXTOS.es;

  useEffect(() => {
    if (!cargando && !usuario && !errorConexion) router.replace('/login');
  }, [usuario, cargando, errorConexion, router]);

  // Cierra el menú móvil al navegar a otra página
  useEffect(() => { setMenuAbierto(false); }, [pathname]);

  if (cargando) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#0B7324" role="img" aria-label="Notoria">
        <path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/>
      </svg>
    </div>
  );

  if (errorConexion && !usuario) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg)', gap:14, padding:24, textAlign:'center' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B74040" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12h6M12 9v6"/>
      </svg>
      <h2 style={{ color:'var(--text)', fontSize:17, fontWeight:700, margin:0 }}>{t.offline.titulo}</h2>
      <p style={{ color:'var(--text-2)', fontSize:13, margin:0, maxWidth:300, lineHeight:1.6 }}>
        {t.offline.descPre} <code style={{ background:'var(--surface2)', padding:'1px 5px', borderRadius:3 }}>npm run dev</code> {t.offline.descPost} <strong>brand-shield</strong>.
      </p>
      <button onClick={() => window.location.reload()}
        style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:5, padding:'9px 20px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"Georgia,serif" }}>
        {t.offline.reintentar}
      </button>
    </div>
  );

  if (!usuario) return null;

  const PLAN_LABELS = t.plan.labels;

  return (
    // `panel` enciende la capa de interacción de globals.css (hover, pulsación,
    // foco de teclado y estados de formulario). Va aquí, en la raíz, para que
    // alcance a la barra lateral y a todas las páginas hijas de una vez.
    <div className="panel" style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      {/* Fondo oscuro al abrir el menú en móvil */}
      {menuAbierto && (
        <div onClick={() => setMenuAbierto(false)} className="md:hidden" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:40 }} />
      )}

      {/* Sidebar */}
      <aside
        className={`${menuAbierto ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ width:224, display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, height:'100%', background:'var(--surface)', borderRight:'1px solid var(--border-c)', zIndex:50, transition:'transform 0.2s ease-in-out' }}>
        {/* Logo */}
        <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border-c)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <Link href="/" style={{ display:'flex', alignItems:'center', gap:9, textDecoration:'none' }}>
            <ShieldIcon size={18} color="#0B7324"/>
            <span style={{ fontWeight:800, fontSize:16, color:'var(--text)', fontFamily:"Georgia,'Times New Roman',serif", letterSpacing:'-0.3px' }}>Notoria</span>
          </Link>
          {/* `flex md:hidden` y NO `display:'flex'` inline: el estilo inline
              gana sobre la clase, así que con `display:'flex'` puesto ahí el
              `md:hidden` no tenía ningún efecto y esta X de cerrar el menú
              móvil se veía SIEMPRE, también en escritorio, donde no hay menú
              que cerrar. Verificado en vivo: computaba `display:flex` a 1920px.
              Es el mismo patrón que ya usa bien la barra superior móvil. */}
          <button onClick={() => setMenuAbierto(false)} className="flex md:hidden" aria-label="Cerrar menú"
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4, borderRadius:5 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Selector de cuenta.
            Solo aparece si de verdad hay más de una: a quien nunca compartió ni
            fue invitado —la inmensa mayoría— no se le mete un desplegable que no
            usa. Va arriba del todo y no dentro de Configuración porque contesta
            la pregunta que hay que responder ANTES de mirar cualquier cifra:
            "¿de quién son estos datos?". */}
        {cuentas.length > 1 && (
          <div style={{ padding:'10px 14px 0' }}>
            <p style={{ fontSize:10, color:'var(--text-3)', margin:'0 0 4px', textTransform:'uppercase', letterSpacing:1, fontFamily:SERIF }}>
              {t.cuentaActiva}
            </p>
            <select
              value={cuenta?.id || usuario.id}
              onChange={(e) => cambiarCuenta(e.target.value)}
              aria-label={t.cuentaActiva}
              style={{
                width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)',
                color:'var(--text)', borderRadius:5, padding:'7px 9px', fontSize:12.5,
                fontFamily:SERIF, cursor:'pointer',
              }}
            >
              {cuentas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.propia ? `${c.nombre} (${t.tuCuenta})` : c.nombre}
                </option>
              ))}
            </select>
            {/* Aviso permanente mientras se trabaja en la cuenta de otro. No es
                decorativo: sin él es facilísimo responder una reseña creyendo que
                es de tu negocio cuando es del de un cliente. */}
            {cuenta && cuenta.propia === false && (
              <p style={{ fontSize:10.5, color:'#f59e0b', margin:'5px 0 0', lineHeight:1.5, fontFamily:SERIF }}>
                {t.trabajandoEn}
              </p>
            )}
          </div>
        )}

        {/* Nav — los colores viven en globals.css (.nav-item), no inline: un
            color inline gana sobre la hoja de estilos y bloquearía el hover. */}
        <nav style={{ flex:1, padding:'6px 10px 10px', display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
          {navGrupos.map(grupo => {
            const visibles = grupo.items.filter(item => !item.soloSi || item.soloSi(usuario));
            if (visibles.length === 0) return null;
            return (
              <div key={grupo.key} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {/* El primer grupo (Resumen) no lleva rótulo: sobra encima de
                    una sola entrada, y así el menú no empieza con texto gris. */}
                {t.navGrupos[grupo.key] && <p className="nav-grupo">{t.navGrupos[grupo.key]}</p>}
                {visibles.map(item => (
                  <Link key={item.href} href={item.href} data-tour={item.key}
                    className={`nav-item${pathname === item.href ? ' activo' : ''}`}
                    aria-current={pathname === item.href ? 'page' : undefined}>
                    <span className="nav-ico"><NavIcon type={item.icon}/></span>
                    {t.nav[item.key]}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Plan + usuario */}
        <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border-c)' }}>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:5, padding:'8px 10px', marginBottom:10 }}>
            <p style={{ fontSize:10, color:'var(--text-3)', margin:'0 0 2px', textTransform:'uppercase', letterSpacing:1, fontFamily:"Georgia,'Times New Roman',serif" }}>{t.plan.actual}</p>
            <p style={{ fontSize:12.5, fontWeight:600, margin:0, color: usuario.plan==='GRATIS' ? '#B0AEA5' : '#4CAF66', fontFamily:"Georgia,'Times New Roman',serif" }}>
              {/* ⚠️ PLAN_LABELS es una FUNCIÓN desde el 2026-08-24, no un mapa.
                  Indexarla con un string daba undefined y el `|| usuario.plan`
                  lo tapaba pintando el enum crudo ("NEGOCIO") en la barra
                  lateral. Falla suave: ni el build ni la consola dicen nada. */}
              {PLAN_LABELS(usuario.plan)}
            </p>
            {/* El enlace va SIEMPRE, no solo en GRATIS: al sacar Planes del menú
                este es el único acceso que le queda a una cuenta de pago. */}
            <Link href="/dashboard/planes" style={{ fontSize:11, color: usuario.plan==='GRATIS' ? '#0B7324' : 'var(--text-3)', textDecoration:'none', marginTop:2, display:'block', fontFamily:"Georgia,'Times New Roman',serif" }}>
              {usuario.plan === 'GRATIS' ? t.plan.actualizar : t.plan.verPlanes}
            </Link>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:13, color:'var(--text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"Georgia,'Times New Roman',serif" }}>{usuario.nombre}</p>
              <p style={{ fontSize:11, color:'var(--text-3)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"Georgia,'Times New Roman',serif" }}>{usuario.email}</p>
            </div>
            {/* El hover en rojo se queda en JS porque es un color SEMÁNTICO
                (salir es destructivo), no el velo genérico. Pero al soltar
                volvía a un '#6B6A65' fijo, que es el gris del tema OSCURO: en
                tema claro el icono se quedaba más apagado que el resto para
                siempre. Ahora devuelve la variable, que es la que corresponda. */}
            <button onClick={logout} title={t.logout} aria-label={t.logout}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:'4px', display:'flex', alignItems:'center', marginLeft:6, borderRadius:5 }}
              onMouseEnter={e=>e.currentTarget.style.color='#B74040'}
              onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md:ml-[224px]" style={{ flex:1, minHeight:'100vh', background:'var(--bg)', width:'100%', minWidth:0 }}>
        {/* Barra superior móvil */}
        <div className="flex md:hidden" style={{ alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid var(--border-c)', position:'sticky', top:0, background:'var(--surface)', zIndex:30 }}>
          <button onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text)', padding:4, display:'flex' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <ShieldIcon size={16} color="#0B7324"/>
          <span style={{ fontWeight:800, fontSize:14, color:'var(--text)', fontFamily:"Georgia,'Times New Roman',serif" }}>Notoria</span>
        </div>

        <main className="px-4 py-6 md:px-9 md:py-8" style={{ minHeight:'100vh' }}>
          <GBPBanner/>
          {/* Explicación de por qué el panel volvió a la cuenta propia sin que
              nadie lo pidiera: te quitaron el acceso, o el plan de esa cuenta se
              quedó sin asientos. Sin este aviso, la persona ve de golpe otros
              negocios y da por hecho que el producto se rompió. */}
          {avisoCuenta && (
            <div role="status" style={{
              background:'var(--surface)', border:'1px solid #f59e0b', borderRadius:8,
              padding:'11px 14px', marginBottom:16, display:'flex', gap:12,
              alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap',
            }}>
              <div style={{ minWidth:0 }}>
                <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:'var(--text)', fontFamily:SERIF }}>{t.avisoSalida}</p>
                <p style={{ margin:0, fontSize:12.5, color:'var(--text-2)', lineHeight:1.6, fontFamily:SERIF }}>{avisoCuenta}</p>
              </div>
              <button onClick={limpiarAvisoCuenta} aria-label="Cerrar aviso" style={{
                background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4,
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          {!usuario.emailVerificado && <EmailVerifBanner onVerificado={refrescarPerfil} t={t}/>}
          {children}
        </main>
      </div>

      <TourGuiado/>
    </div>
  );
}
