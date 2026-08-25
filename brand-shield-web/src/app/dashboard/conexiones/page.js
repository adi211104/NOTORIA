'use client';
import { puede as planIncluye } from '../../../lib/planes';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { negociosApi, redes, API_URL } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import Icon from '../../../components/Icons';

const getToken = () => localStorage.getItem('bs_token');

const TEXTOS = {
  es: {
    titulo: 'Conexiones',
    sub: 'Las cuentas enlazadas a cada negocio. Cuantas más conectes, más completo es el monitoreo.',
    sinNegocios: 'Todavía no tienes negocios. Agrega uno para poder conectar sus cuentas.',
    agregarNegocio: 'Agregar negocio →',
    conectado: 'Conectado',
    noConectado: 'No conectado',
    conectar: 'Conectar',
    conectando: 'Abriendo…',
    reconectar: 'Reconectar',
    reconectarTitle: 'Vuelve a autorizar la cuenta. Hace falta cuando se habilitan permisos nuevos: el token actual conserva los que tenía al conectarse.',
    soloPlanNegocio: 'Desde el Plan Negocio',
    actualizar: 'Actualizar',
    redes: {
      googlePlaces:  { n:'Google Maps', d:'Rating y reseñas públicas. Es la base del monitoreo.' },
      gbp:           { n:'Google Business Profile', d:'Acceso a todas tus reseñas y respuesta directa.' },
      facebook:      { n:'Facebook Reviews', d:'Recomendaciones y reseñas de tu página.' },
      instagram:     { n:'Instagram', d:'Comentarios de tus publicaciones y respuesta directa.' },
      tiktok:        { n:'TikTok', d:'Comentarios de tus videos y respuesta directa.' },
    },
    ttExito: 'Cuenta de TikTok conectada. Los comentarios entrarán en el próximo escaneo.',
    ttErrorTitulo: 'No se pudo conectar TikTok',
    ttError: {
      access_denied: 'Cancelaste la autorización, o tu cuenta no está en la lista de usuarios de prueba de la app.',
      missing_params: 'TikTok no devolvió el código. Suele ser la URI de redirección mal registrada.',
      callback_failed: 'Falló el canje del código por el token. Revisa credenciales y URI de redirección.',
    },
    ttErrorGenerico: 'TikTok rechazó la conexión.',
    ajustes: {
      abrir: 'Ajustes de la conexión',
      titulo: 'Ajustes de la conexión',
      cerrar: 'Cerrar',
      cuenta: 'Cuenta enlazada',
      sinPerfil: 'Todavía no leímos el perfil de esta cuenta.',
      reautorizar: 'Volver a autorizar',
      reautorizarDesc: 'Pasa otra vez por el diálogo de la plataforma con la misma cuenta. Hace falta cuando se habilitan permisos nuevos: el token actual conserva los que tenía al emitirse.',
      eliminar: 'Eliminar conexión',
      eliminarDesc: 'Borra los tokens y revoca el acceso en la plataforma. También se borran los comentarios, menciones y alertas que trajo esa cuenta: son datos de otras personas y dejan de estar autorizados al desconectar.',
      confirmar: '¿Seguro? Se desconecta la cuenta y se borra su historial',
      confirmarSi: 'Sí, eliminar',
      cancelar: 'Cancelar',
      eliminando: 'Eliminando…',
      error: 'No se pudo eliminar la conexión.',
    },
  },
  en: {
    titulo: 'Connections',
    sub: 'The accounts linked to each business. The more you connect, the more complete the monitoring.',
    sinNegocios: 'You have no businesses yet. Add one to connect its accounts.',
    agregarNegocio: 'Add business →',
    conectado: 'Connected',
    noConectado: 'Not connected',
    conectar: 'Connect',
    conectando: 'Opening…',
    reconectar: 'Reconnect',
    reconectarTitle: 'Authorize the account again. Needed when new permissions are enabled: the current token keeps the ones it had when it was connected.',
    soloPlanNegocio: 'From the Business plan',
    actualizar: 'Upgrade',
    redes: {
      googlePlaces:  { n:'Google Maps', d:'Public rating and reviews. The basis of monitoring.' },
      gbp:           { n:'Google Business Profile', d:'Access to all your reviews with direct reply.' },
      facebook:      { n:'Facebook Reviews', d:'Recommendations and reviews from your page.' },
      instagram:     { n:'Instagram', d:'Comments on your posts with direct reply.' },
      tiktok:        { n:'TikTok', d:'Comments on your videos with direct reply.' },
    },
    ttExito: 'TikTok account connected. Comments will be picked up on the next scan.',
    ttErrorTitulo: 'Could not connect TikTok',
    ttError: {
      access_denied: 'You cancelled the authorization, or your account is not on the app’s test-user list.',
      missing_params: 'TikTok did not return the code. This is usually a mismatched redirect URI.',
      callback_failed: 'Exchanging the code for a token failed. Check credentials and redirect URI.',
    },
    ttErrorGenerico: 'TikTok rejected the connection.',
    ajustes: {
      abrir: 'Connection settings',
      titulo: 'Connection settings',
      cerrar: 'Close',
      cuenta: 'Linked account',
      sinPerfil: 'We have not read this account profile yet.',
      reautorizar: 'Reauthorize',
      reautorizarDesc: 'Go through the platform dialog again with the same account. Needed when new permissions are enabled: the current token keeps the ones it had when it was issued.',
      eliminar: 'Remove connection',
      eliminarDesc: 'Deletes the stored tokens and revokes access on the platform. The comments, mentions and alerts that came from that account are deleted too: they are other people’s data, and the consent that let us hold it ends here.',
      confirmar: 'Are you sure? This disconnects the account and deletes its history',
      confirmarSi: 'Yes, remove',
      cancelar: 'Cancel',
      eliminando: 'Removing…',
      error: 'The connection could not be removed.',
    },
  },
};

const Pastilla = ({ tono, children, title }) => {
  const tonos = {
    ok:       { color:'#22c55e', background:'rgba(34,197,94,0.1)',  border:'1px solid rgba(34,197,94,0.25)' },
    azul:     { color:'#3b82f6', background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.25)' },
    espera:   { color:'#f59e0b', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)' },
    apagado:  { color:'var(--text-3)', background:'var(--surface2)', border:'1px solid var(--border-c)' },
  };
  return (
    <span title={title} style={{ ...tonos[tono], fontSize:11.5, padding:'3px 10px', borderRadius:10, whiteSpace:'nowrap', cursor:title?'help':'default' }}>
      {children}
    </span>
  );
};

// Redes que se le muestran a este negocio, en orden. `disponible` lo decide el
// backend (GET /api/redes/:id/estado) y hoy apaga Instagram para todo el mundo
// salvo las cuentas con las que Meta revisa la app. `conectado` manda por encima:
// una cuenta ya enlazada nunca se esconde, o el usuario se quedaría sin forma de
// desconectarla ni de borrar los datos que trajo.
const redesVisibles = (est) =>
  ['instagram', 'facebook', 'tiktok'].filter((red) => est?.[red]?.disponible || est?.[red]?.conectado);

const Fila = ({ nombre, descripcion, children, ultima }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, padding:'11px 0',
                borderBottom: ultima ? 'none' : '1px solid var(--border-c)' }}>
    <div style={{ minWidth:0 }}>
      <span style={{ color:'var(--text-2)', fontSize:13 }}>{nombre}</span>
      <p style={{ color:'var(--text-3)', fontSize:11, margin:'2px 0 0', lineHeight:1.45 }}>{descripcion}</p>
    </div>
    <div style={{ flexShrink:0 }}>{children}</div>
  </div>
);

export default function ConexionesPage() {
  const { usuario, puede } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;

  const [negocios, setNegocios] = useState(null);
  // Estado de redes por negocio: { [negocioId]: { instagram, tiktok, facebook } }
  const [estados, setEstados] = useState({});
  const [conectando, setConectando] = useState(null); // `${negocioId}:${red}`
  // Modal de ajustes de una conexión concreta: { negocio, red } | null
  const [ajustes, setAjustes] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [errorDesc, setErrorDesc] = useState(null);

  // Conectar una red social sigue siendo el salto a Negocio: Impulso no lo trae.
  const planPago = planIncluye(usuario?.plan, 'comentariosSociales');

  const cargar = useCallback(() => (
    negociosApi.listar()
      .then(async (lista) => {
        const activos = Array.isArray(lista) ? lista : [];
        setNegocios(activos);
        // Un estado por negocio. Si alguno falla se omite y esa tarjeta cae al
        // caso conservador (no disponible), sin tumbar la página entera.
        const pares = await Promise.all(activos.map(async (n) => {
          try { return [n.id, await redes.estado(n.id)]; }
          catch { return [n.id, null]; }
        }));
        setEstados(Object.fromEntries(pares));
      })
      .catch(() => setNegocios([]))
  ), []);

  useEffect(() => { cargar(); }, [cargar]);

  const conectarRed = async (negocioId, red) => {
    const clave = `${negocioId}:${red}`;
    setConectando(clave);
    try {
      const conectar = {
        tiktok: redes.conectarTikTok,
        facebook: redes.conectarFacebook,
        instagram: redes.conectarInstagram,
      }[red];
      const { url } = await conectar(negocioId);
      if (url) window.location.href = url;
      else setConectando(null);
    } catch { setConectando(null); }
  };

  const abrirAjustes = (negocio, red) => {
    setAjustes({ negocio, red });
    setConfirmando(false);
    setErrorDesc(null);
  };

  const desconectarRed = async () => {
    if (!ajustes) return;
    setDesconectando(true);
    setErrorDesc(null);
    try {
      await redes.desconectar(ajustes.negocio.id, ajustes.red);
      // Se recarga todo en vez de parchear el estado local: la desconexión
      // también limpia el perfil cacheado (nombre, avatar, @) y esos campos
      // vienen del listado de negocios, no de /estado.
      await cargar();
      setAjustes(null);
    } catch (e) {
      setErrorDesc(e.message || t.ajustes.error);
    } finally {
      setDesconectando(false);
      setConfirmando(false);
    }
  };

  // Google Business no pasa por /api/redes: su OAuth lo inicia el backend
  // directamente con el token en la query.
  const conectarGBP = (negocioId) => {
    window.location.href = `${API_URL}/api/auth/google-business/iniciar?negocioId=${negocioId}&token=${getToken()}`;
  };

  // El callback de TikTok vuelve al detalle del negocio, pero si alguien llega
  // acá con los parámetros igual mostramos el resultado.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const ttConectado = params?.get('tt') === 'conectado';
  const ttError = params?.get('tt_error');

  // Antes esto era `return null`: la página se quedaba COMPLETAMENTE EN BLANCO
  // mientras cargaba —y aquí no se pide una lista, sino el estado de redes de
  // cada negocio, uno por uno, así que tarda más que el resto del panel—. Una
  // pantalla vacía sin nada que la explique se lee como "se rompió". El resto
  // de páginas ya mostraban su spinner; esta era la única que no.
  if (negocios === null) return (
    <div>
      <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{t.titulo}</h1>
      <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 24px' }}>{t.sub}</p>
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>{t.titulo}</h1>
      <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 24px' }}>{t.sub}</p>

      {ttConectado && (
        <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:10, padding:'11px 15px', marginBottom:18 }}>
          <p style={{ color:'#22c55e', fontSize:13, margin:0 }}>{t.ttExito}</p>
        </div>
      )}
      {ttError && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'11px 15px', marginBottom:18 }}>
          <p style={{ color:'#f87171', fontSize:13, margin:'0 0 3px', fontWeight:600 }}>{t.ttErrorTitulo}</p>
          <p style={{ color:'var(--text-2)', fontSize:12.5, margin:0 }}>{t.ttError[ttError] || t.ttErrorGenerico}</p>
        </div>
      )}

      {negocios.length === 0 ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:36, textAlign:'center' }}>
          <p style={{ color:'var(--text-2)', fontSize:14, margin:'0 0 14px' }}>{t.sinNegocios}</p>
          <Link href="/dashboard/negocios" style={{ color:'#4CAF66', fontSize:13, textDecoration:'none' }}>{t.agregarNegocio}</Link>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {negocios.map((n) => {
            const est = estados[n.id];
            const visibles = redesVisibles(est);
            // ⚠️ Solo la ÚLTIMA fila va sin borde inferior, y hasta ahora eso lo
            // calculaba únicamente el map de redes. Al poder esconderse también
            // Google Business, un negocio sin ninguna red visible dejaba la fila
            // de Google Places con un borde colgando debajo de nada. El orden de
            // pintado es: Places → Google Business → redes.
            const gbpVisible = !!(est?.gbp?.disponible || n.gbpConectado);
            const sinRedes = visibles.length === 0;
            return (
              <div key={n.id} style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:6 }}>
                  <span style={{ width:9, height:9, borderRadius:'50%', background:n.colorEtiqueta || '#3AA857', flexShrink:0 }} />
                  <Link href={`/dashboard/negocios/${n.id}`}
                    style={{ color:'var(--text)', fontSize:15, fontWeight:600, textDecoration:'none' }}>
                    {n.nombre}
                  </Link>
                </div>

                <div style={{ display:'flex', flexDirection:'column' }}>
                  <Fila nombre={t.redes.googlePlaces.n} descripcion={t.redes.googlePlaces.d}
                    ultima={!gbpVisible && sinRedes}>
                    <Pastilla tono={n.googlePlaceId ? 'ok' : 'apagado'}>
                      {n.googlePlaceId ? t.conectado : t.noConectado}
                    </Pastilla>
                  </Fila>

                  {/* 🔴 Google Business Profile pasa por el mismo interruptor que
                      Instagram y Facebook desde el 2026-08-25, y por un motivo
                      peor: Google tiene las GBP APIs con cuota `Requests per
                      minute = 0`, así que el flujo NO falla al principio —el
                      cliente pasa por el diálogo de Google, autoriza de verdad
                      sobre su ficha real, vuelve, y recién ahí revienta en
                      `listarCuentas` con `?gbp_error=callback_failed`—. Un error
                      genérico después de haber concedido permisos es la peor
                      forma de fallar: parece culpa suya.

                      Antes esta fila era FIJA con su botón siempre pulsable, el
                      único caso que quedaba del patrón que ya se había corregido
                      en Facebook. Ver `lib/gbpVisible.js` en el backend.

                      Misma excepción deliberada que las otras dos: si ya está
                      conectado la fila se queda pase lo que pase, porque hay que
                      poder desconectarlo y borrar sus datos. */}
                  {gbpVisible && (
                    <Fila nombre={t.redes.gbp.n} descripcion={t.redes.gbp.d} ultima={sinRedes}>
                      {n.gbpConectado ? (
                        <Pastilla tono="ok">{t.conectado}</Pastilla>
                      ) : (
                        puede('conexiones') ? (
                          <button onClick={() => conectarGBP(n.id)}
                            style={{ background:'#4285F4', color:'#fff', border:'none', borderRadius:8, padding:'6px 13px', fontSize:12, fontWeight:500, cursor:'pointer' }}>
                            {t.conectar}
                          </button>
                        ) : (
                          <Pastilla tono="apagado">{t.noConectado}</Pastilla>
                        )
                      )}
                    </Fila>
                  )}

                  {/* Una red que hoy no podemos entregar sencillamente NO se
                      lista: ni "próximamente" ni el motivo. Instagram y Facebook
                      salen con `disponible:false` mientras Meta revisa la app
                      —con los permisos en acceso estándar, un cliente real que
                      pulse Conectar recibe un error que no puede resolver—, y
                      volverán solo el día que aprueben (ver `lib/instagramVisible.js`
                      y `lib/facebookVisible.js` en el backend). Excepción a
                      propósito: si la cuenta YA está conectada la fila se queda
                      pase lo que pase, porque hay que poder desconectarla y
                      borrar sus datos.

                      ⚠️ Facebook estaba antes como fila FIJA con una pastilla
                      «No conectado» que no se podía pulsar: prometía una función
                      que no existía —no había ruta para conectar una página— y
                      no daba forma de llegar a ella. Ahora pasa por la misma
                      lista que las demás. */}
                  {visibles.map((red, i) => (
                    <Fila key={red} nombre={t.redes[red].n}
                      descripcion={planPago ? t.redes[red].d : t.soloPlanNegocio}
                      ultima={i === visibles.length - 1}>
                      {!planPago ? (
                        <Link href="/dashboard/planes" style={{ fontSize:11.5, color:'#4CAF66', textDecoration:'none', background:'rgba(11,115,36,0.1)', padding:'3px 10px', borderRadius:10 }}>{t.actualizar}</Link>
                      ) : est?.[red]?.conectado ? (
                        // La tuerca abre los ajustes de ESTA conexión: reautorizar
                        // y, sobre todo, eliminarla. Antes solo había un enlace
                        // "Reconectar", que no resolvía ni cambiar de cuenta ni
                        // retirar el acceso — una vez autorizada quedaba para siempre.
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <Pastilla tono="azul">{t.conectado}</Pastilla>
                          {/* La tuerca lleva a reautorizar y a ELIMINAR la
                              conexión: revoca el token del lado de la
                              plataforma. Al equipo invitado no se le ofrece. */}
                          {puede('conexiones') && (
                            <button onClick={() => abrirAjustes(n, red)}
                              title={t.ajustes.abrir} aria-label={t.ajustes.abrir}
                              style={{ display:'flex', alignItems:'center', justifyContent:'center',
                                       width:26, height:26, borderRadius:7, cursor:'pointer',
                                       background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-3)' }}>
                              <Icon name="ajustes" size={13} />
                            </button>
                          )}
                        </div>
                      ) : (
                        // Sin conectar. No hace falta mirar `disponible`: si no
                        // lo estuviera, la fila no se habría renderizado.
                        puede('conexiones') ? (
                          <button onClick={() => conectarRed(n.id, red)}
                            disabled={conectando === `${n.id}:${red}`}
                            style={{ fontSize:11.5, color:'#4CAF66', background:'rgba(11,115,36,0.1)', border:'1px solid rgba(11,115,36,0.3)', padding:'4px 13px', borderRadius:10, cursor:conectando===`${n.id}:${red}`?'wait':'pointer' }}>
                            {conectando === `${n.id}:${red}` ? t.conectando : t.conectar}
                          </button>
                        ) : (
                          <Pastilla tono="apagado">{t.noConectado}</Pastilla>
                        )
                      )}
                    </Fila>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ajustes && (
        <div onClick={() => !desconectando && setAjustes(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:60,
                   display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14,
                     padding:'18px 20px', maxWidth:420, width:'100%' }}>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <Icon name="ajustes" size={15} color="#4CAF66" />
                <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--text)' }}>{t.ajustes.titulo}</h3>
              </div>
              <button onClick={() => setAjustes(null)} disabled={desconectando} title={t.ajustes.cerrar}
                style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)',
                         borderRadius:8, width:28, height:28, cursor:desconectando?'not-allowed':'pointer',
                         display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="cerrar" size={13} />
              </button>
            </div>
            <p style={{ margin:'0 0 16px', fontSize:12, color:'var(--text-3)' }}>
              {t.redes[ajustes.red].n} · {ajustes.negocio.nombre}
            </p>

            {/* Qué cuenta es. Solo TikTok cachea el perfil (§15-bis); sin esto el
                usuario no sabe cuál de sus cuentas está por desconectar. */}
            {ajustes.red === 'tiktok' && (
              <div style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:10,
                            padding:'11px 13px', marginBottom:16 }}>
                <p style={{ margin:'0 0 7px', fontSize:11, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:.4 }}>
                  {t.ajustes.cuenta}
                </p>
                {ajustes.negocio.tiktokNombre ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {ajustes.negocio.tiktokAvatar && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ajustes.negocio.tiktokAvatar} alt=""
                        style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                    )}
                    <div style={{ minWidth:0 }}>
                      <p style={{ margin:0, fontSize:13, fontWeight:600, color:'var(--text)' }}>{ajustes.negocio.tiktokNombre}</p>
                      {ajustes.negocio.tiktokUsername && (
                        <p style={{ margin:0, fontSize:11.5, color:'var(--text-3)' }}>@{ajustes.negocio.tiktokUsername}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ margin:0, fontSize:12, color:'var(--text-3)' }}>{t.ajustes.sinPerfil}</p>
                )}
              </div>
            )}

            <div style={{ borderTop:'1px solid var(--border-c)', paddingTop:14 }}>
              <p style={{ margin:'0 0 3px', fontSize:13, fontWeight:600, color:'var(--text)' }}>{t.ajustes.reautorizar}</p>
              <p style={{ margin:'0 0 9px', fontSize:11.5, color:'var(--text-3)', lineHeight:1.5 }}>{t.ajustes.reautorizarDesc}</p>
              <button onClick={() => conectarRed(ajustes.negocio.id, ajustes.red)}
                disabled={desconectando || conectando === `${ajustes.negocio.id}:${ajustes.red}`}
                style={{ fontSize:12, color:'var(--text-2)', background:'var(--surface2)',
                         border:'1px solid var(--border-c)', padding:'6px 13px', borderRadius:8, cursor:'pointer' }}>
                {conectando === `${ajustes.negocio.id}:${ajustes.red}` ? t.conectando : t.ajustes.reautorizar}
              </button>
            </div>

            <div style={{ borderTop:'1px solid var(--border-c)', marginTop:16, paddingTop:14 }}>
              <p style={{ margin:'0 0 3px', fontSize:13, fontWeight:600, color:'#f87171' }}>{t.ajustes.eliminar}</p>
              <p style={{ margin:'0 0 9px', fontSize:11.5, color:'var(--text-3)', lineHeight:1.5 }}>{t.ajustes.eliminarDesc}</p>

              {/* Confirmación en dos pasos dentro del modal: es destructivo y no
                  se deshace sin volver a pasar por el OAuth de la plataforma. */}
              {!confirmando ? (
                <button onClick={() => setConfirmando(true)} disabled={desconectando}
                  style={{ fontSize:12, color:'#f87171', background:'rgba(239,68,68,0.08)',
                           border:'1px solid rgba(239,68,68,0.3)', padding:'6px 13px', borderRadius:8,
                           cursor:'pointer', display:'flex', alignItems:'center', gap:7 }}>
                  <Icon name="basura" size={13} />
                  {t.ajustes.eliminar}
                </button>
              ) : (
                <div>
                  <p style={{ margin:'0 0 9px', fontSize:12.5, color:'var(--text-2)', fontWeight:600 }}>{t.ajustes.confirmar}</p>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={desconectarRed} disabled={desconectando}
                      style={{ fontSize:12, color:'#fff', background:'#dc2626', border:'none',
                               padding:'7px 14px', borderRadius:8, cursor:desconectando?'wait':'pointer' }}>
                      {desconectando ? t.ajustes.eliminando : t.ajustes.confirmarSi}
                    </button>
                    <button onClick={() => setConfirmando(false)} disabled={desconectando}
                      style={{ fontSize:12, color:'var(--text-2)', background:'transparent',
                               border:'1px solid var(--border-c)', padding:'7px 14px', borderRadius:8, cursor:'pointer' }}>
                      {t.ajustes.cancelar}
                    </button>
                  </div>
                </div>
              )}

              {errorDesc && (
                <p style={{ margin:'10px 0 0', fontSize:12, color:'#f87171' }}>{errorDesc}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
