'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '../../../components/Icons';
import { useIdioma } from '../../../context/IdiomaContext';
import BloqueoPlan from '../../../components/BloqueoPlan';

import { API_URL, auth, negociosApi, pagos, cabecerasAuth } from '../../../lib/api';
const getToken = () => localStorage.getItem('bs_token');

const TEXTOS = {
  es: {
    header: { titulo: 'Configuración', sub: 'Gestiona tu cuenta y preferencias' },
    emailVerif: {
      titulo: 'Email sin confirmar',
      desc: (email) => <>Tu cuenta tiene funciones limitadas hasta que confirmes tu email <strong style={{ color:'var(--text)' }}>{email}</strong>. Algunas funciones como Google Business pueden requerir verificación.</>,
      enviando: 'Enviando...',
      espera: (s) => `Espera ${s}s`,
      enviado: 'Enviado ✓ — Reenviar',
      enviar: 'Enviar email de confirmación',
    },
    perfil: {
      titulo: 'Perfil', descripcion: 'Tu información personal en Notoria',
      nombre: 'Nombre', email: 'Email',
      verificado: 'Verificado', sinVerificar: 'Sin verificar',
      planActual: 'Plan actual',
      planNombre: (plan) => plan === 'GRATIS' ? 'Gratuito' : plan === 'NEGOCIO' ? 'Negocio — S/59/mes' : 'Franquicia — S/179/mes',
      actualizar: 'Actualizar →', verPlanes: 'Ver planes →',
      facturacion: 'Facturación', facturacionDesc: 'Datos fiscales y comprobantes',
      verFacturacion: 'Abrir →',
      guardando: 'Guardando...', guardarNombre: 'Guardar nombre',
      msgVacio: 'El nombre no puede estar vacío',
      msgActualizado: 'Nombre actualizado',
      msgError: 'Error al guardar',
    },
    seguridad: {
      titulo: 'Seguridad', descripcion: 'Cambia tu contraseña de acceso',
      // La barrera se explica ANTES de los campos: si no, la persona pulsa el
      // botón, lee «revisa tu correo» y no sabe si funcionó o si falló algo.
      aviso: 'Por seguridad la contraseña no cambia en el acto: te mandamos un correo y solo cambia cuando abres el enlace. Así, una sesión abierta un minuto en una computadora ajena no basta para quitarte la cuenta.',
      actual: 'Contraseña actual',
      nueva: 'Nueva contraseña', nuevaPlaceholder: 'Mínimo 8 caracteres',
      confirmar: 'Confirmar nueva', confirmarPlaceholder: 'Repite la contraseña',
      cambiando: 'Enviando...', cambiarBtn: 'Enviarme el correo de confirmación',
      msgCorta: 'La contraseña debe tener al menos 8 caracteres',
      msgNoCoincide: 'Las contraseñas no coinciden',
      msgCambiada: 'Te enviamos un correo. Abre el enlace para que el cambio se aplique — hasta entonces tu contraseña sigue igual.',
      msgError: 'Error al cambiar',
    },
    notif: {
      titulo: 'Notificaciones', descripcion: 'Cómo y dónde recibes las alertas',
      email: 'Alertas por email',
      emailSiempre: 'Siempre activas',
      masControlNota: 'Elige qué tipo de alertas recibir y con qué frecuencia desde',
      masControlLink: 'Alertas →',
      appTitulo: 'Notificaciones al instante',
      appTexto: 'El correo es el único canal de alerta de Notoria. Si quieres que te suene el teléfono en el momento en que aparece una reseña sospechosa, instala la app de Android: revisa tus alertas en segundo plano y te avisa con una notificación del sistema.',
    },
    automatizaciones: {
      titulo: 'Automatizaciones', descripcion: 'Deja que Notoria trabaje sola por ti',
      negocio: 'Negocio',
      resumenSemanal: 'Resumen semanal por email',
      resumenSemanalDesc: 'Cifras de rating y reseñas cada domingo. El plan Negocio suma un insight generado con IA.',
      autoRespuesta: 'Auto-respuesta a reseñas positivas',
      autoRespuestaDesc: 'Responde sola las reseñas de 4-5★ con la plantilla que apruebes, sin que tengas que hacer nada.',
      autoRespuestaBloqueo: 'Disponible en plan Negocio →',
      tono: 'Tono de la auto-respuesta',
      tonoBloqueo: 'Disponible en plan Franquicia →',
      tonoFormal: 'Formal', tonoCercano: 'Cercano', tonoDisculpa: 'Con disculpa',
      configurarPlantilla: 'Configurar plantilla →',
      editarPlantilla: 'Editar plantilla',
      modalTitulo: 'Aprueba tu plantilla de auto-respuesta',
      modalTexto: 'Este texto se publicará automáticamente en tus reseñas de 4-5★. Usa {{autor}} para incluir el nombre de quien la escribió.',
      plantillaPlaceholder: 'Escribe la plantilla de respuesta...',
      guardarPlantilla: 'Aprobar y activar', cancelar: 'Cancelar',
      msgGuardado: 'Automatización actualizada', msgError: 'Error al guardar',
      sinNegocios: 'Agrega un negocio para configurar sus automatizaciones.',
    },
    apariencia: {
      titulo: 'Apariencia', descripcion: 'Personaliza la interfaz según tu preferencia',
      tema: 'Tema', oscuro: 'Oscuro', claro: 'Claro',
      idioma: 'Idioma',
      fuente: 'Fuente', fuenteGeorgia: 'Georgia (predeterminada)', fuenteSistema: 'Fuente del sistema',
    },
    // Se llama "Suscripción" a propósito: es exactamente el nombre que la página
    // /devoluciones lleva prometiendo desde antes de que la sección existiera
    // («desde tu panel, en Configuración → Suscripción»).
    suscripcion: {
      titulo: 'Suscripción', descripcion: 'Tu plan, la renovación y cómo cancelarla',
      planActual: 'Plan actual',
      renovacion: 'Renovación automática',
      activa: 'Activa', cancelada: 'Cancelada',
      proximoCobro: 'Próximo cobro',
      activoHasta: 'Activo hasta',
      gratis: 'Estás en el plan Gratuito: no hay ninguna renovación que cancelar.',
      verPlanes: 'Ver planes →',
      cancelarBtn: 'Cancelar renovación',
      cancelando: 'Cancelando...',
      yaCancelada: 'Ya cancelaste la renovación. No se te volverá a cobrar y conservas tu plan hasta la fecha de arriba.',
      msgOk: (f) => `Listo. No se te volverá a cobrar y tu plan sigue activo hasta el ${f}.`,
      msgError: 'No pudimos cancelar la renovación. Inténtalo de nuevo.',
      modalTitulo: '¿Cancelar la renovación?',
      modalTexto: (f) => (<>No se te volverá a cobrar. <strong style={{ color:'var(--text)' }}>Tu plan sigue activo hasta el {f}</strong>, y ese día tu cuenta pasa sola al plan Gratuito. No se borra ningún dato y tus negocios siguen monitoreados.</>),
      modalVolver: 'Mejor no', modalConfirmar: 'Sí, cancelar renovación',
    },
    peligro: {
      titulo: 'Zona de peligro', descripcion: 'Acciones irreversibles sobre tu cuenta',
      cerrarSesionTodos: 'Cerrar sesión en todos los dispositivos', cerrarSesion: 'Cerrar sesión',
      eliminarPermanente: 'Eliminar cuenta permanentemente', eliminarBtn: 'Eliminar cuenta',
      msgError: 'Error al eliminar cuenta',
    },
    modal: {
      titulo: '¿Eliminar tu cuenta?',
      texto: (<>Esta acción es <strong className="text-red-400">permanente e irreversible</strong>. Se eliminarán todos tus datos.</>),
      escribe: (<>Escribe <strong style={{ color: 'var(--text)' }}>ELIMINAR</strong> para confirmar:</>),
      cancelar: 'Cancelar', confirmar: 'Eliminar cuenta',
      // Se avisa ANTES de borrar: si ya se le emitieron comprobantes, la empresa
      // está obligada a conservarlos 5 años y la cuenta se anonimiza en vez de
      // borrarse. Prometer un borrado total que no ocurre sería mentir.
      notaFiscal: 'Si ya emitimos comprobantes a tu nombre, por obligación tributaria conservamos únicamente esos documentos, sin tus datos personales.',
    },
  },
  en: {
    header: { titulo: 'Settings', sub: 'Manage your account and preferences' },
    emailVerif: {
      titulo: 'Unconfirmed email',
      desc: (email) => <>Your account has limited features until you confirm your email <strong style={{ color:'var(--text)' }}>{email}</strong>. Some features like Google Business may require verification.</>,
      enviando: 'Sending...',
      espera: (s) => `Wait ${s}s`,
      enviado: 'Sent ✓ — Resend',
      enviar: 'Send confirmation email',
    },
    perfil: {
      titulo: 'Profile', descripcion: 'Your personal information on Notoria',
      nombre: 'Name', email: 'Email',
      verificado: 'Verified', sinVerificar: 'Unverified',
      planActual: 'Current plan',
      planNombre: (plan) => plan === 'GRATIS' ? 'Free' : plan === 'NEGOCIO' ? 'Business — S/59/mo' : 'Franchise — S/179/mo',
      actualizar: 'Upgrade →', verPlanes: 'View plans →',
      facturacion: 'Billing', facturacionDesc: 'Tax details and receipts',
      verFacturacion: 'Open →',
      guardando: 'Saving...', guardarNombre: 'Save name',
      msgVacio: 'Name cannot be empty',
      msgActualizado: 'Name updated',
      msgError: 'Error saving',
    },
    seguridad: {
      titulo: 'Security', descripcion: 'Change your access password',
      aviso: 'For security, your password does not change right away: we email you a link and it only changes when you open it. That way a session left open for a minute on someone else’s computer is not enough to take your account.',
      actual: 'Current password',
      nueva: 'New password', nuevaPlaceholder: 'At least 8 characters',
      confirmar: 'Confirm new password', confirmarPlaceholder: 'Repeat the password',
      cambiando: 'Sending...', cambiarBtn: 'Email me the confirmation link',
      msgCorta: 'The password must be at least 8 characters',
      msgNoCoincide: 'Passwords do not match',
      msgCambiada: 'We sent you an email. Open the link to apply the change — until then your password stays the same.',
      msgError: 'Error changing password',
    },
    notif: {
      titulo: 'Notifications', descripcion: 'How and where you receive alerts',
      email: 'Email alerts',
      emailSiempre: 'Always on',
      masControlNota: 'Choose which alert types you get and how often from',
      masControlLink: 'Alerts →',
      appTitulo: 'Instant notifications',
      appTexto: 'Email is the only alert channel in Notoria. If you want your phone to ring the moment a suspicious review shows up, install the Android app: it checks your alerts in the background and notifies you through the system.',
    },
    automatizaciones: {
      titulo: 'Automations', descripcion: 'Let Notoria work on its own for you',
      negocio: 'Business',
      resumenSemanal: 'Weekly email summary',
      resumenSemanalDesc: 'Rating and review figures every Sunday. The Business plan adds an AI-generated insight.',
      autoRespuesta: 'Auto-reply to positive reviews',
      autoRespuestaDesc: 'Automatically replies to 4-5★ reviews with the template you approve — no action needed from you.',
      autoRespuestaBloqueo: 'Available on the Business plan →',
      tono: 'Auto-reply tone',
      tonoBloqueo: 'Available on the Franchise plan →',
      tonoFormal: 'Formal', tonoCercano: 'Friendly', tonoDisculpa: 'Apologetic',
      configurarPlantilla: 'Set up template →',
      editarPlantilla: 'Edit template',
      modalTitulo: 'Approve your auto-reply template',
      modalTexto: 'This text will be posted automatically on your 4-5★ reviews. Use {{autor}} to include the reviewer\'s name.',
      plantillaPlaceholder: 'Write the reply template...',
      guardarPlantilla: 'Approve and activate', cancelar: 'Cancel',
      msgGuardado: 'Automation updated', msgError: 'Error saving',
      sinNegocios: 'Add a business to configure its automations.',
    },
    apariencia: {
      titulo: 'Appearance', descripcion: 'Customize the interface to your preference',
      tema: 'Theme', oscuro: 'Dark', claro: 'Light',
      idioma: 'Language',
      fuente: 'Font', fuenteGeorgia: 'Georgia (default)', fuenteSistema: 'System font',
    },
    suscripcion: {
      titulo: 'Subscription', descripcion: 'Your plan, renewal and how to cancel it',
      planActual: 'Current plan',
      renovacion: 'Automatic renewal',
      activa: 'Active', cancelada: 'Cancelled',
      proximoCobro: 'Next charge',
      activoHasta: 'Active until',
      gratis: "You're on the Free plan: there is no renewal to cancel.",
      verPlanes: 'View plans →',
      cancelarBtn: 'Cancel renewal',
      cancelando: 'Cancelling...',
      yaCancelada: "You already cancelled the renewal. You won't be charged again and you keep your plan until the date above.",
      msgOk: (f) => `Done. You won't be charged again and your plan stays active until ${f}.`,
      msgError: "We couldn't cancel the renewal. Please try again.",
      modalTitulo: 'Cancel the renewal?',
      modalTexto: (f) => (<>You won&apos;t be charged again. <strong style={{ color:'var(--text)' }}>Your plan stays active until {f}</strong>, and on that day your account moves to the Free plan on its own. No data is deleted and your businesses stay monitored.</>),
      modalVolver: 'Never mind', modalConfirmar: 'Yes, cancel renewal',
    },
    peligro: {
      titulo: 'Danger zone', descripcion: 'Irreversible actions on your account',
      cerrarSesionTodos: 'Sign out of all devices', cerrarSesion: 'Sign out',
      eliminarPermanente: 'Delete account permanently', eliminarBtn: 'Delete account',
      msgError: 'Error deleting account',
    },
    modal: {
      titulo: 'Delete your account?',
      texto: (<>This action is <strong className="text-red-400">permanent and irreversible</strong>. All your data will be deleted.</>),
      escribe: (<>Type <strong style={{ color: 'var(--text)' }}>ELIMINAR</strong> to confirm:</>),
      cancelar: 'Cancel', confirmar: 'Delete account',
      notaFiscal: 'If we already issued invoices in your name, tax law requires us to keep only those documents, without your personal data.',
    },
  },
};

// Componente de advertencia de verificación de email
function EmailVerifCard({ usuario }) {
  const { idioma } = useIdioma();
  const t = (TEXTOS[idioma] || TEXTOS.es).emailVerif;
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState('idle');
  const [segundos, setSegundos] = useState(0);
  const intervaloRef = useRef(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
    iniciarTimer();
    try {
      const res = await fetch(`${API_URL}/api/auth/reenviar-verificacion`, {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('bs_token')}` }
      });
      setEstado(res.ok ? 'enviado' : 'error');
    } catch { setEstado('error'); }
    setEnviando(false);
  };

  return (
    <div style={{ background:'rgba(138,109,0,0.08)', border:'1px solid rgba(138,109,0,0.35)', borderRadius:6, padding:'14px 18px', marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A6D00" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>
        </svg>
        <div style={{ flex:1 }}>
          <p style={{ color:'#8A6D00', fontSize:13, fontWeight:700, margin:'0 0 3px' }}>{t.titulo}</p>
          <p style={{ color:'var(--text-2)', fontSize:12, margin:'0 0 10px', lineHeight:1.6 }}>
            {t.desc(usuario?.email)}
          </p>
          <button onClick={reenviar} disabled={enviando || segundos > 0}
            style={{ background: segundos > 0 ? 'var(--surface2)' : 'rgba(138,109,0,0.2)', border:`1px solid ${segundos > 0 ? 'var(--border-c)' : 'rgba(138,109,0,0.5)'}`, color: segundos > 0 ? 'var(--text-3)' : '#8A6D00', padding:'7px 16px', borderRadius:5, fontSize:12, fontWeight:600, cursor: segundos > 0 ? 'default' : 'pointer', fontFamily:"Georgia,'Times New Roman',serif" }}>
            {enviando ? t.enviando : segundos > 0 ? t.espera(segundos) : estado === 'enviado' ? t.enviado : t.enviar}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConfiguracionPage() {
  const { usuario, logout, puede } = useAuth();
  const { idioma, cambiarIdioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const router = useRouter();
  const [tema, setTema] = useState('dark');
  const [fuente, setFuente] = useState('georgia');
  const [nombre, setNombre] = useState('');
  const [pwActual, setPwActual] = useState('');
  const [pwNueva, setPwNueva] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [guardandoPw, setGuardandoPw] = useState(false);
  const [mensajes, setMensajes] = useState({});
  const [modalEliminar, setModalEliminar] = useState(false);
  const [confirmTexto, setConfirmTexto] = useState('');
  const rippleRef = useRef(null);

  // ── Suscripción ──────────────────────────────────────────
  // El estado viene del backend y no de `usuario` del contexto porque la
  // cancelación cambia `suscripcionActiva` y `fechaVencimiento`, y el perfil
  // cacheado no se entera hasta recargar.
  const [suscripcion, setSuscripcion] = useState(null);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    pagos.estado().then(setSuscripcion).catch(() => {});
  }, []);

  const fechaLegible = (f) => f
    ? new Date(f).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  const cancelarSuscripcion = async () => {
    setCancelando(true);
    try {
      const r = await pagos.cancelar();
      setSuscripcion(s => ({ ...s, suscripcionActiva: false, fechaVencimiento: r.activoHasta }));
      setModalCancelar(false);
      mostrarMensaje('suscripcion', t.suscripcion.msgOk(fechaLegible(r.activoHasta)), 'ok');
    } catch (e) {
      mostrarMensaje('suscripcion', e.message || t.suscripcion.msgError, 'err');
    } finally {
      setCancelando(false);
    }
  };

  // ── Automatizaciones ─────────────────────────────────────
  const [negocios, setNegocios] = useState([]);
  const [negocioSelId, setNegocioSelId] = useState('');
  const [guardandoAuto, setGuardandoAuto] = useState(false);
  const [modalPlantilla, setModalPlantilla] = useState(false);
  const [plantillaEdit, setPlantillaEdit] = useState('');
  const [tonoEdit, setTonoEdit] = useState('formal');

  const PLANTILLAS_SUGERIDAS = {
    formal: 'Estimado/a {{autor}}, agradecemos mucho su reseña y el tiempo que se tomó en compartirla. Nos alegra saber que tuvo una buena experiencia con nosotros. ¡Esperamos verlo/a pronto de nuevo!',
    cercano: '¡Gracias por tus palabras, {{autor}}! Nos alegra un montón que la hayas pasado bien. Nos vemos en la próxima :)',
    disculpa: 'Gracias por tu reseña, {{autor}}. Nos alegra que en general la experiencia haya sido positiva y tomamos nota de cualquier detalle a mejorar para la próxima. ¡Te esperamos pronto!',
  };

  useEffect(() => {
    negociosApi.listar().then(lista => {
      setNegocios(lista);
      if (lista.length > 0) setNegocioSelId(lista[0].id);
    }).catch(() => {});
  }, []);

  const negocioSel = negocios.find(n => n.id === negocioSelId) || null;

  const actualizarNegocioLocal = (id, cambios) => {
    setNegocios(prev => prev.map(n => n.id === id ? { ...n, ...cambios } : n));
  };

  const toggleResumenSemanal = async (nuevoValor) => {
    if (!negocioSel) return;
    actualizarNegocioLocal(negocioSel.id, { resumenSemanalActivo: nuevoValor });
    try {
      await negociosApi.configurar(negocioSel.id, { resumenSemanalActivo: nuevoValor });
      mostrarMensaje('automatizaciones', t.automatizaciones.msgGuardado);
    } catch { mostrarMensaje('automatizaciones', t.automatizaciones.msgError, 'err'); }
  };

  const toggleAutoRespuesta = async (nuevoValor) => {
    if (!negocioSel) return;
    if (nuevoValor && !negocioSel.autoRespuestaPlantilla) {
      // Primera activación — pedir aprobación de plantilla antes de encender
      setTonoEdit('formal');
      setPlantillaEdit(usuario?.plan === 'FRANQUICIA' ? PLANTILLAS_SUGERIDAS.formal : PLANTILLAS_SUGERIDAS.formal);
      setModalPlantilla(true);
      return;
    }
    setGuardandoAuto(true);
    try {
      await negociosApi.configurarAutoRespuesta(negocioSel.id, {
        activa: nuevoValor, plantilla: negocioSel.autoRespuestaPlantilla, tono: negocioSel.autoRespuestaTono,
      });
      actualizarNegocioLocal(negocioSel.id, { autoRespuestaActiva: nuevoValor });
      mostrarMensaje('automatizaciones', t.automatizaciones.msgGuardado);
    } catch { mostrarMensaje('automatizaciones', t.automatizaciones.msgError, 'err'); }
    finally { setGuardandoAuto(false); }
  };

  const guardarPlantilla = async () => {
    if (!negocioSel || !plantillaEdit.trim()) return;
    setGuardandoAuto(true);
    try {
      const body = usuario?.plan === 'FRANQUICIA'
        ? { activa: true, plantilla: plantillaEdit.trim(), tono: tonoEdit }
        : { activa: true, plantilla: plantillaEdit.trim() };
      await negociosApi.configurarAutoRespuesta(negocioSel.id, body);
      actualizarNegocioLocal(negocioSel.id, {
        autoRespuestaActiva: true, autoRespuestaPlantilla: plantillaEdit.trim(),
        autoRespuestaTono: usuario?.plan === 'FRANQUICIA' ? tonoEdit : null,
      });
      setModalPlantilla(false);
      mostrarMensaje('automatizaciones', t.automatizaciones.msgGuardado);
    } catch { mostrarMensaje('automatizaciones', t.automatizaciones.msgError, 'err'); }
    finally { setGuardandoAuto(false); }
  };

  const elegirTono = (tono) => {
    setTonoEdit(tono);
    setPlantillaEdit(PLANTILLAS_SUGERIDAS[tono]);
  };

  useEffect(() => {
    // El script inline de layout.js ya resolvió el tema real (guardado o del
    // sistema operativo) y lo aplicó a <html data-theme>. Leerlo de ahí evita
    // duplicar la lógica de detección y mantiene ambos lugares sincronizados.
    const temaAplicado = document.documentElement.getAttribute('data-theme') || 'dark';
    setTema(temaAplicado);
    // Igual que el tema: el script inline de layout.js ya resolvió la fuente
    // guardada y la aplicó a <html data-fuente> antes del primer render.
    const fuenteAplicada = document.documentElement.getAttribute('data-fuente') || 'georgia';
    setFuente(fuenteAplicada);
  }, []);

  const cambiarFuente = (nuevaFuente) => {
    setFuente(nuevaFuente);
    localStorage.setItem('bs_fuente', nuevaFuente);
    document.documentElement.setAttribute('data-fuente', nuevaFuente);
  };

  useEffect(() => {
    if (usuario) {
      setNombre(usuario.nombre || '');
    }
  }, [usuario]);

  const mostrarMensaje = (clave, texto, tipo = 'ok') => {
    setMensajes(m => ({ ...m, [clave]: { texto, tipo } }));
    setTimeout(() => setMensajes(m => { const n = { ...m }; delete n[clave]; return n; }), 3500);
  };

  const Mensaje = ({ clave }) => {
    const m = mensajes[clave];
    if (!m) return null;
    return (
      <div className={`text-sm rounded-lg px-4 py-2.5 mt-3 ${m.tipo === 'ok' ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
        {m.texto}
      </div>
    );
  };

  const cambiarTema = (nuevoTema, e) => {
    if (nuevoTema === tema) return;

    const btn = e?.currentTarget;
    const ripple = rippleRef.current;
    if (!ripple || !btn) {
      aplicarTema(nuevoTema);
      return;
    }

    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxDist = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));
    const size = maxDist * 2;

    ripple.style.left = `${cx}px`;
    ripple.style.top = `${cy}px`;
    ripple.style.width = '0px';
    ripple.style.height = '0px';
    ripple.style.marginLeft = '0px';
    ripple.style.marginTop = '0px';
    ripple.style.background = nuevoTema === 'light' ? '#f8fafc' : '#030712';
    ripple.style.opacity = '1';
    ripple.style.transition = 'none';
    ripple.offsetHeight;

    ripple.style.transition = `width 0.6s cubic-bezier(0.4,0,0.2,1), height 0.6s cubic-bezier(0.4,0,0.2,1), margin 0.6s cubic-bezier(0.4,0,0.2,1)`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.marginLeft = `-${size / 2}px`;
    ripple.style.marginTop = `-${size / 2}px`;

    setTimeout(() => {
      aplicarTema(nuevoTema);
    }, 300);

    setTimeout(() => {
      ripple.style.opacity = '0';
      ripple.style.transition = 'opacity 0.3s';
      setTimeout(() => {
        ripple.style.width = '0';
        ripple.style.height = '0';
        ripple.style.transition = 'none';
      }, 300);
    }, 600);
  };

  const aplicarTema = (nuevoTema) => {
    setTema(nuevoTema);
    localStorage.setItem('bs_tema', nuevoTema);
    document.documentElement.setAttribute('data-theme', nuevoTema === 'light' ? 'light' : 'dark');
  };

  const guardarPerfil = async () => {
    if (!nombre.trim()) return mostrarMensaje('perfil', t.perfil.msgVacio, 'err');
    setGuardandoPerfil(true);
    try {
      await fetch(`${API_URL}/api/auth/perfil`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...cabecerasAuth() },
        body: JSON.stringify({ nombre }),
      });
      mostrarMensaje('perfil', t.perfil.msgActualizado);
    } catch { mostrarMensaje('perfil', t.perfil.msgError, 'err'); }
    finally { setGuardandoPerfil(false); }
  };

  const cambiarPassword = async () => {
    if (pwNueva.length < 8) return mostrarMensaje('pw', t.seguridad.msgCorta, 'err');
    if (pwNueva !== pwConfirm) return mostrarMensaje('pw', t.seguridad.msgNoCoincide, 'err');
    setGuardandoPw(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/cambiar-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...cabecerasAuth() },
        body: JSON.stringify({ passwordActual: pwActual, passwordNueva: pwNueva }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setPwActual(''); setPwNueva(''); setPwConfirm('');
      mostrarMensaje('pw', t.seguridad.msgCambiada);
    } catch (e) { mostrarMensaje('pw', e.message || t.seguridad.msgError, 'err'); }
    finally { setGuardandoPw(false); }
  };

  const eliminarCuenta = async () => {
    if (confirmTexto !== 'ELIMINAR') return;
    try {
      await fetch(`${API_URL}/api/auth/cuenta`, {
        method: 'DELETE',
        headers: { ...cabecerasAuth() },
      });
      logout();
    } catch { mostrarMensaje('cuenta', t.peligro.msgError, 'err'); }
  };

  const Toggle = ({ activo, onChange }) => (
    <button onClick={() => onChange(!activo)}
      className={`relative w-11 h-6 rounded-full transition-colors ${activo ? 'bg-green-800' : 'bg-gray-700'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );

  const Seccion = ({ titulo, descripcion, children }) => (
    <div className="rounded-xl overflow-hidden mb-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border-c)' }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-c)' }}>
        <h2 className="font-semibold" style={{ color: 'var(--text)' }}>{titulo}</h2>
        {descripcion && <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>{descripcion}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );

  const Campo = ({ label, children }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-0" style={{ borderColor: 'var(--border-c)' }}>
      <span className="text-sm" style={{ color: 'var(--text-2)' }}>{label}</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );

  return (
    <div className="max-w-2xl relative">
      {/* Ripple overlay */}
      <div ref={rippleRef} style={{
        position: 'fixed', borderRadius: '50%', width: 0, height: 0,
        pointerEvents: 'none', zIndex: 9999, opacity: 0,
      }} />

      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{t.header.titulo}</h1>
        <p className="mt-1" style={{ color: 'var(--text-2)' }}>{t.header.sub}</p>
      </div>

      {/* PERFIL */}
      <Seccion titulo={t.perfil.titulo} descripcion={t.perfil.descripcion}>
        {!usuario?.emailVerificado && <EmailVerifCard usuario={usuario}/>}
        <Campo label={t.perfil.nombre}>
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm w-48 border focus:outline-none focus:border-green-700"
            style={{ background: 'var(--surface2)', borderColor: 'var(--border-c)', color: 'var(--text)' }} />
        </Campo>
        <Campo label={t.perfil.email}>
          <span className="text-sm" style={{ color: 'var(--text-2)' }}>{usuario?.email}</span>
          {usuario?.emailVerificado ? (
            <span style={{ fontSize:11, background:'rgba(11,115,36,0.1)', color:'#0B7324', padding:'2px 8px', borderRadius:4, fontWeight:500 }}>{t.perfil.verificado}</span>
          ) : (
            <span style={{ fontSize:11, background:'rgba(138,109,0,0.1)', color:'#8A6D00', padding:'2px 8px', borderRadius:4, fontWeight:500 }}>{t.perfil.sinVerificar}</span>
          )}
        </Campo>
        <Campo label={t.perfil.planActual}>
          <span className={`text-sm font-medium ${usuario?.plan === 'GRATIS' ? '' : 'text-green-500'}`} style={usuario?.plan === 'GRATIS' ? { color: 'var(--text-2)' } : {}}>
            {t.perfil.planNombre(usuario?.plan)}
          </span>
          {/* Cambiar de plan es del propietario. Al equipo invitado se le
              muestra el plan de la empresa (les explica qué funciones tienen)
              pero no el botón para cambiarlo, que solo daría 403. */}
          {puede('facturacion') && (
            <Link href="/dashboard/planes"
              className="text-xs bg-green-800 hover:bg-green-700 text-white px-3 py-1 rounded-lg transition">
              {usuario?.plan === 'GRATIS' ? t.perfil.actualizar : t.perfil.verPlanes}
            </Link>
          )}
        </Campo>
        {/* Facturación vive acá y ya no en el menú lateral: es algo que se
            consulta de vez en cuando, no una sección de uso diario. La ruta
            /dashboard/facturacion sigue existiendo — los correos de comprobante
            enlazan directo a ella.

            Solo la ve el propietario: el historial de pagos lleva el nombre del
            titular, su documento y su domicilio fiscal. Son datos personales del
            dueño que no tienen por qué ver el encargado ni el community manager,
            y el backend devuelve 403 a todo /api/pagos para los demás roles. */}
        {puede('facturacion') && (
        <Campo label={t.perfil.facturacion}>
          <span className="text-sm" style={{ color: 'var(--text-2)' }}>{t.perfil.facturacionDesc}</span>
          <Link href="/dashboard/facturacion"
            className="text-xs px-3 py-1 rounded-lg transition"
            style={{ border: '1px solid var(--border-c)', color: 'var(--text-2)' }}>
            {t.perfil.verFacturacion}
          </Link>
        </Campo>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={guardarPerfil} disabled={guardandoPerfil}
            className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition">
            {guardandoPerfil ? t.perfil.guardando : t.perfil.guardarNombre}
          </button>
        </div>
        <Mensaje clave="perfil" />
      </Seccion>

      {/* CONTRASEÑA */}
      <Seccion titulo={t.seguridad.titulo} descripcion={t.seguridad.descripcion}>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-2)' }}>{t.seguridad.aviso}</p>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>{t.seguridad.actual}</label>
            <input type="password" value={pwActual} onChange={e => setPwActual(e.target.value)} placeholder="••••••••"
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-green-700"
              style={{ background: 'var(--surface2)', borderColor: 'var(--border-c)', color: 'var(--text)' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>{t.seguridad.nueva}</label>
              <input type="password" value={pwNueva} onChange={e => setPwNueva(e.target.value)} placeholder={t.seguridad.nuevaPlaceholder}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-green-700"
                style={{ background: 'var(--surface2)', borderColor: 'var(--border-c)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>{t.seguridad.confirmar}</label>
              <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder={t.seguridad.confirmarPlaceholder}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-green-700"
                style={{ background: 'var(--surface2)', borderColor: 'var(--border-c)', color: 'var(--text)' }} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={cambiarPassword} disabled={guardandoPw || !pwActual || !pwNueva}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition">
              {guardandoPw ? t.seguridad.cambiando : t.seguridad.cambiarBtn}
            </button>
          </div>
        </div>
        <Mensaje clave="pw" />
      </Seccion>

      {/* NOTIFICACIONES */}
      <Seccion titulo={t.notif.titulo} descripcion={t.notif.descripcion}>
        <Campo label={t.notif.email}>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{usuario?.email}</span>
          <span className="text-xs font-medium" style={{ color: '#4CAF66' }}>{t.notif.emailSiempre}</span>
        </Campo>
        <p className="text-xs" style={{ color: 'var(--text-3)', margin: '2px 0 12px' }}>
          {t.notif.masControlNota} <Link href="/dashboard/alertas" style={{ color: '#4CAF66' }}>{t.notif.masControlLink}</Link>
        </p>
        {/* Telegram vivía acá y se eliminó del producto el 2026-08-16. No queda
            nada que guardar en esta sección: el correo es fijo y las preferencias
            de qué alertas recibir se editan en /dashboard/alertas. Por eso ya no
            hay botón "Guardar notificaciones" — un botón que no guarda nada es
            peor que no tenerlo. */}
        <div className="mt-3 rounded-lg p-4" style={{ background: 'var(--surface2)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t.notif.appTitulo}</p>
          <p className="text-xs" style={{ color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{t.notif.appTexto}</p>
        </div>
      </Seccion>

      {/* AUTOMATIZACIONES */}
      <Seccion titulo={t.automatizaciones.titulo} descripcion={t.automatizaciones.descripcion}>
        {negocios.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>{t.automatizaciones.sinNegocios}</p>
        ) : (
          <>
            {negocios.length > 1 && (
              <Campo label={t.automatizaciones.negocio}>
                <select value={negocioSelId} onChange={e => setNegocioSelId(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-sm border focus:outline-none focus:border-green-700"
                  style={{ background: 'var(--surface2)', borderColor: 'var(--border-c)', color: 'var(--text)' }}>
                  {negocios.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
                </select>
              </Campo>
            )}

            <Campo label={t.automatizaciones.resumenSemanal}>
              <Toggle activo={!!negocioSel?.resumenSemanalActivo} onChange={toggleResumenSemanal} />
            </Campo>
            <p className="text-xs -mt-2 mb-1" style={{ color: 'var(--text-3)' }}>{t.automatizaciones.resumenSemanalDesc}</p>

            {usuario?.plan === 'GRATIS' ? (
              <BloqueoPlan mensaje={t.automatizaciones.autoRespuestaBloqueo}>
                <Campo label={t.automatizaciones.autoRespuesta}>
                  <Toggle activo={false} onChange={() => {}} />
                </Campo>
              </BloqueoPlan>
            ) : (
              <>
                <Campo label={t.automatizaciones.autoRespuesta}>
                  <Toggle activo={!!negocioSel?.autoRespuestaActiva} onChange={toggleAutoRespuesta} />
                </Campo>
                <p className="text-xs -mt-2 mb-1" style={{ color: 'var(--text-3)' }}>{t.automatizaciones.autoRespuestaDesc}</p>
                {negocioSel?.autoRespuestaPlantilla && (
                  <div className="flex justify-end mb-2">
                    <button onClick={() => { setTonoEdit(negocioSel.autoRespuestaTono || 'formal'); setPlantillaEdit(negocioSel.autoRespuestaPlantilla); setModalPlantilla(true); }}
                      className="text-xs" style={{ color: '#4CAF66' }}>
                      {t.automatizaciones.editarPlantilla}
                    </button>
                  </div>
                )}

                {usuario?.plan !== 'FRANQUICIA' && (
                  <BloqueoPlan mensaje={t.automatizaciones.tonoBloqueo}>
                    <Campo label={t.automatizaciones.tono}>
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{t.automatizaciones.tonoFormal}</span>
                    </Campo>
                  </BloqueoPlan>
                )}
              </>
            )}
            <Mensaje clave="automatizaciones" />
          </>
        )}
      </Seccion>

      {/* APARIENCIA */}
      <Seccion titulo={t.apariencia.titulo} descripcion={t.apariencia.descripcion}>
        <Campo label={t.apariencia.tema}>
          <div className="flex gap-2">
            {[
              { id: 'dark', label: t.apariencia.oscuro, ic: 'luna' },
              { id: 'light', label: t.apariencia.claro, ic: 'sol' },
            ].map(opt => (
              <button key={opt.id} onClick={(e) => cambiarTema(opt.id, e)}
                className={`text-sm px-4 py-2 rounded-lg border transition font-medium inline-flex items-center gap-2 ${tema === opt.id ? 'bg-green-800 border-green-800 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}>
                <Icon name={opt.ic} size={14} /> {opt.label}
              </button>
            ))}
          </div>
        </Campo>
        <Campo label={t.apariencia.idioma}>
          <div className="flex gap-2 items-center">
            {[
              { id: 'es', label: 'Español' },
              { id: 'en', label: 'English' },
            ].map(l => (
              <button key={l.id} onClick={() => { cambiarIdioma(l.id); auth.actualizarPerfil({ idioma: l.id }).catch(() => {}); }}
                className={`text-sm px-4 py-2 rounded-lg border transition font-medium ${idioma === l.id ? 'bg-green-800 border-green-800 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}>
                {l.label}
              </button>
            ))}
          </div>
        </Campo>
        <Campo label={t.apariencia.fuente}>
          <div className="flex gap-2">
            {[
              { id: 'georgia', label: t.apariencia.fuenteGeorgia },
              { id: 'sistema', label: t.apariencia.fuenteSistema },
            ].map(opt => (
              <button key={opt.id} onClick={() => cambiarFuente(opt.id)}
                className={`text-sm px-4 py-2 rounded-lg border transition font-medium ${fuente === opt.id ? 'bg-green-800 border-green-800 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </Campo>
      </Seccion>

      {/* SUSCRIPCIÓN — la sección que /devoluciones lleva prometiendo por nombre.
          Oculta para el equipo invitado: cancelar el plan de la empresa no es
          decisión de quien responde las reseñas. */}
      {puede('facturacion') && (
      <Seccion titulo={t.suscripcion.titulo} descripcion={t.suscripcion.descripcion}>
        {suscripcion?.plan && suscripcion.plan !== 'GRATIS' ? (
          <>
            <Campo label={t.suscripcion.planActual}>
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t.perfil.planNombre(suscripcion.plan)}
              </span>
            </Campo>
            <Campo label={t.suscripcion.renovacion}>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={suscripcion.suscripcionActiva
                  ? { background: 'rgba(11,115,36,0.14)', color: '#3AA857', border: '1px solid rgba(11,115,36,0.35)' }
                  : { background: 'rgba(148,163,184,0.14)', color: 'var(--text-2)', border: '1px solid var(--border-c)' }}>
                {suscripcion.suscripcionActiva ? t.suscripcion.activa : t.suscripcion.cancelada}
              </span>
            </Campo>
            <Campo label={suscripcion.suscripcionActiva ? t.suscripcion.proximoCobro : t.suscripcion.activoHasta}>
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>{fechaLegible(suscripcion.fechaVencimiento)}</span>
            </Campo>
            <Campo label={suscripcion.suscripcionActiva ? t.suscripcion.cancelarBtn : ''}>
              {suscripcion.suscripcionActiva ? (
                <button onClick={() => setModalCancelar(true)}
                  className="text-sm border px-4 py-1.5 rounded-lg transition hover:border-red-500/50"
                  style={{ borderColor: 'var(--border-c)', color: 'var(--text-2)' }}>
                  {t.suscripcion.cancelarBtn}
                </button>
              ) : (
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>{t.suscripcion.yaCancelada}</span>
              )}
            </Campo>
          </>
        ) : (
          <Campo label={t.suscripcion.gratis}>
            <Link href="/dashboard/planes" className="text-sm" style={{ color: '#3AA857' }}>
              {t.suscripcion.verPlanes}
            </Link>
          </Campo>
        )}
        {mensajes.suscripcion && (
          <p className="text-sm mt-3" style={{ color: mensajes.suscripcion.tipo === 'ok' ? '#3AA857' : '#f87171' }}>
            {mensajes.suscripcion.texto}
          </p>
        )}
      </Seccion>
      )}

      {/* ZONA DE PELIGRO */}
      <Seccion titulo={t.peligro.titulo} descripcion={t.peligro.descripcion}>
        {/* 🔴 Antes esto era `onClick={logout}`, que solo borra el token de ESTE
            navegador. O sea que el botón decía «cerrar sesión en todos los
            dispositivos» y la única sesión que no cerraba era la que preocupa: la
            del teléfono perdido, la del computador prestado.
            Ahora llama al backend, que incrementa `tokenVersion` e invalida todos
            los tokens de golpe — este incluido, por eso después hace logout. */}
        <Campo label={t.peligro.cerrarSesionTodos}>
          <button onClick={async () => {
            try { await auth.cerrarSesiones(); } catch { /* da igual: igual se sale de aquí */ }
            logout();
          }}
            className="text-sm border hover:border-red-500/50 px-4 py-1.5 rounded-lg transition"
            style={{ borderColor: 'var(--border-c)', color: 'var(--text-2)' }}>
            {t.peligro.cerrarSesion}
          </button>
        </Campo>
        <Campo label={t.peligro.eliminarPermanente}>
          <button onClick={() => setModalEliminar(true)}
            className="text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 px-4 py-1.5 rounded-lg transition">
            {t.peligro.eliminarBtn}
          </button>
        </Campo>
        <Mensaje clave="cuenta" />
      </Seccion>

      {/* Modal aprobación de plantilla de auto-respuesta */}
      {modalPlantilla && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div className="rounded-2xl p-6 max-w-md w-full border" style={{ background: 'var(--surface)', borderColor: 'var(--border-c)' }}>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>{t.automatizaciones.modalTitulo}</h3>
            <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-2)' }}>{t.automatizaciones.modalTexto}</p>

            {usuario?.plan === 'FRANQUICIA' && (
              <div className="flex gap-2 mb-3">
                {['formal', 'cercano', 'disculpa'].map(tono => (
                  <button key={tono} onClick={() => elegirTono(tono)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${tonoEdit === tono ? 'bg-green-800 border-green-800 text-white' : 'border-gray-700 text-gray-400'}`}>
                    {tono === 'formal' ? t.automatizaciones.tonoFormal : tono === 'cercano' ? t.automatizaciones.tonoCercano : t.automatizaciones.tonoDisculpa}
                  </button>
                ))}
              </div>
            )}

            <textarea value={plantillaEdit} onChange={e => setPlantillaEdit(e.target.value)} rows={5}
              placeholder={t.automatizaciones.plantillaPlaceholder}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-green-700 mb-4"
              style={{ background: 'var(--surface2)', borderColor: 'var(--border-c)', color: 'var(--text)', resize: 'vertical' }} />

            <div className="flex gap-3">
              <button onClick={() => setModalPlantilla(false)}
                className="flex-1 border py-2 rounded-lg text-sm transition"
                style={{ borderColor: 'var(--border-c)', color: 'var(--text-2)' }}>
                {t.automatizaciones.cancelar}
              </button>
              <button onClick={guardarPlantilla} disabled={guardandoAuto || !plantillaEdit.trim()}
                className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white py-2 rounded-lg text-sm transition">
                {t.automatizaciones.guardarPlantilla}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cancelar renovación.
          El texto NO dramatiza: cancelar no borra nada ni corta el servicio hoy,
          y decirlo así evita el ticket de soporte de "¿pierdo mis datos?". */}
      {modalCancelar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div className="rounded-2xl p-6 max-w-sm w-full border" style={{ background: 'var(--surface)', borderColor: 'var(--border-c)' }}>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>{t.suscripcion.modalTitulo}</h3>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--text-2)' }}>
              {t.suscripcion.modalTexto(fechaLegible(suscripcion?.fechaVencimiento))}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setModalCancelar(false)}
                className="flex-1 py-2 rounded-lg text-sm transition bg-green-800 hover:bg-green-700 text-white">
                {t.suscripcion.modalVolver}
              </button>
              <button onClick={cancelarSuscripcion} disabled={cancelando}
                className="flex-1 border py-2 rounded-lg text-sm transition disabled:opacity-40"
                style={{ borderColor: 'var(--border-c)', color: 'var(--text-2)' }}>
                {cancelando ? t.suscripcion.cancelando : t.suscripcion.modalConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {modalEliminar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div className="border border-red-500/30 rounded-2xl p-6 max-w-sm w-full" style={{ background: 'var(--surface)' }}>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>{t.modal.titulo}</h3>
            <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
              {t.modal.texto}
            </p>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              {t.modal.notaFiscal}
            </p>
            <p className="text-sm mb-2" style={{ color: 'var(--text-2)' }}>{t.modal.escribe}</p>
            <input value={confirmTexto} onChange={e => setConfirmTexto(e.target.value)} placeholder="ELIMINAR"
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-red-500 mb-4"
              style={{ background: 'var(--surface2)', borderColor: 'var(--border-c)', color: 'var(--text)' }} />
            <div className="flex gap-3">
              <button onClick={() => { setModalEliminar(false); setConfirmTexto(''); }}
                className="flex-1 border py-2 rounded-lg text-sm transition"
                style={{ borderColor: 'var(--border-c)', color: 'var(--text-2)' }}>
                {t.modal.cancelar}
              </button>
              <button onClick={eliminarCuenta} disabled={confirmTexto !== 'ELIMINAR'}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm transition">
                {t.modal.confirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
