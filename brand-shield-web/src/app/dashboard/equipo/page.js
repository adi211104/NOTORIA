'use client';

// Equipo — compartir la cuenta de la empresa.
//
// La pantalla la ve CUALQUIER rol. El propietario invita, cambia roles y quita
// gente; el resto solo ve con quién comparte el panel. No se esconde a los
// invitados porque saber quién más tiene acceso —y que lo que uno hace queda
// firmado— es parte de trabajar en equipo, no un privilegio del que paga.
//
// Los botones se esconden según `puede(...)`, pero eso es cortesía: la
// comprobación de verdad está en el backend (permitir() en equipo.routes.js).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { equipoApi } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';

const SERIF = "Georgia,'Times New Roman',serif";

const TEXTOS = {
  es: {
    titulo: 'Equipo',
    subtitulo: 'Comparte el panel con tu gente sin darle tu contraseña.',
    cargando: 'Cargando el equipo…',
    errorCarga: 'No pudimos cargar el equipo.',
    reintentar: 'Reintentar',
    asientos: (u, t) => `${u} de ${t} personas`,
    asientosAyuda: 'El propietario cuenta como una.',
    invitar: 'Invitar a alguien',
    invitarTitulo: 'Invitar a tu equipo',
    correo: 'Correo de la persona',
    rol: 'Qué podrá hacer',
    rolGestor: 'Gestor — responder y gestionar',
    rolLector: 'Solo lectura — mirar e informarse',
    // Nombres cortos del rol para las listas. NO se usa el `rolNombre` que manda
    // el backend: viene siempre en español, y con el panel en inglés pintaba
    // «Gestor» al lado de «Expires Aug 29». Mismo problema que ya hubo con el
    // texto de las alertas: lo que lleva idioma se compone en el panel, y del
    // backend viaja el valor del enum (`rol`), que no tiene idioma. (2026-08-22)
    rolCorto: { PROPIETARIO: 'Propietario', GESTOR: 'Gestor', LECTOR: 'Lector' },
    okInvitado: (email) => `Invitación enviada a ${email}`,
    okQuitado: 'Listo, esa persona ya no tiene acceso.',
    okRol: 'Rol actualizado.',
    okReenviado: 'Invitación reenviada.',
    okCancelado: 'Invitación cancelada.',
    rolGestorDesc: 'Responde reseñas y comentarios, usa la IA, escanea y marca alertas. No ve los pagos, no conecta redes y no puede borrar negocios.',
    rolLectorDesc: 'Ve reseñas, alertas y reportes. No puede modificar nada.',
    alcance: 'A qué negocios',
    alcanceTodos: 'Todos, incluidos los que agregues después',
    alcanceAlgunos: 'Solo los que marque',
    enviar: 'Enviar invitación',
    enviando: 'Enviando…',
    cancelarBtn: 'Cancelar',
    tituloMiembros: 'Con acceso',
    tituloInvitaciones: 'Invitaciones sin aceptar',
    tituloActividad: 'Qué se ha hecho',
    actividadVacia: 'Todavía no hay nada registrado.',
    propietario: 'Propietario',
    tu: 'tú',
    desde: (f) => `Desde el ${f}`,
    todosLosNegocios: 'Todos los negocios',
    quitar: 'Quitar acceso',
    quitarConfirma: '¿Seguro? Perderá el acceso ahora mismo',
    quitarSi: 'Sí, quitar',
    quitarNo: 'No',
    reenviar: 'Reenviar',
    cancelarInv: 'Cancelar',
    vencida: 'Vencida',
    venceEl: (f) => `Vence el ${f}`,
    sinAsiento: 'Sin acceso — tu plan no llega a tantas personas',
    sinAsientoAyuda: 'Conservamos sus datos: vuelven a entrar en cuanto amplíes el plan.',
    vacio: 'Todavía no has invitado a nadie.',
    vacioAyuda: 'Tu encargado puede responder las reseñas sin que le pases tu contraseña, y cada respuesta queda a su nombre.',
    gratisTitulo: 'Compartir la cuenta viene con el Plan Negocio',
    gratisTexto: 'Negocio incluye 3 personas y Franquicia 10. En el plan Gratuito la cuenta es solo tuya.',
    gratisBoton: 'Ver los planes',
    soloLectura: 'Solo el propietario de la cuenta puede invitar o cambiar accesos.',
    salir: 'Salir de este equipo',
    salirConfirma: '¿Salir de esta cuenta? Dejarás de ver sus negocios',
    salirSi: 'Sí, salir',
    ampliar: 'Ampliar el plan',
    lleno: 'No quedan lugares libres en tu plan.',
  },
  en: {
    titulo: 'Team',
    subtitulo: 'Share the dashboard with your people without handing over your password.',
    cargando: 'Loading team…',
    errorCarga: 'We could not load the team.',
    reintentar: 'Retry',
    asientos: (u, t) => `${u} of ${t} people`,
    asientosAyuda: 'The owner counts as one.',
    invitar: 'Invite someone',
    invitarTitulo: 'Invite your team',
    correo: 'Their email',
    rol: 'What they can do',
    rolGestor: 'Manager — reply and manage',
    rolLector: 'Read only — look and stay informed',
    rolCorto: { PROPIETARIO: 'Owner', GESTOR: 'Manager', LECTOR: 'Read only' },
    okInvitado: (email) => `Invitation sent to ${email}`,
    okQuitado: 'Done, that person no longer has access.',
    okRol: 'Role updated.',
    okReenviado: 'Invitation resent.',
    okCancelado: 'Invitation cancelled.',
    rolGestorDesc: 'Replies to reviews and comments, uses AI, scans and handles alerts. No access to billing, cannot connect networks and cannot delete businesses.',
    rolLectorDesc: 'Sees reviews, alerts and reports. Cannot change anything.',
    alcance: 'Which businesses',
    alcanceTodos: 'All of them, including ones you add later',
    alcanceAlgunos: 'Only the ones I pick',
    enviar: 'Send invitation',
    enviando: 'Sending…',
    cancelarBtn: 'Cancel',
    tituloMiembros: 'With access',
    tituloInvitaciones: 'Pending invitations',
    tituloActividad: 'What has been done',
    actividadVacia: 'Nothing recorded yet.',
    propietario: 'Owner',
    tu: 'you',
    desde: (f) => `Since ${f}`,
    todosLosNegocios: 'All businesses',
    quitar: 'Remove access',
    quitarConfirma: 'Sure? They lose access right now',
    quitarSi: 'Yes, remove',
    quitarNo: 'No',
    reenviar: 'Resend',
    cancelarInv: 'Cancel',
    vencida: 'Expired',
    venceEl: (f) => `Expires ${f}`,
    sinAsiento: 'No access — your plan does not reach that many people',
    sinAsientoAyuda: 'We keep their data: they are back in as soon as you upgrade.',
    vacio: 'You have not invited anyone yet.',
    vacioAyuda: 'Your manager can reply to reviews without your password, and every reply is signed with their name.',
    gratisTitulo: 'Sharing the account comes with the Business plan',
    gratisTexto: 'Business includes 3 people and Franchise 10. On the Free plan the account is yours alone.',
    gratisBoton: 'See the plans',
    soloLectura: 'Only the account owner can invite people or change access.',
    salir: 'Leave this team',
    salirConfirma: 'Leave this account? You will stop seeing its businesses',
    salirSi: 'Yes, leave',
    ampliar: 'Upgrade plan',
    lleno: 'No free seats left on your plan.',
  },
};

// Cómo se lee cada acción del registro. Una acción sin traducir sale con su
// clave cruda en vez de romper la lista: el registro es histórico y puede traer
// acciones de versiones anteriores.
const ACCIONES = {
  es: {
    responder_resena: 'respondió una reseña',
    responder_comentario: 'respondió un comentario',
    borrar_respuesta: 'retiró una respuesta',
    moderar_hide: 'ocultó un comentario',
    moderar_pin: 'fijó un comentario',
    moderar_like: 'dio like a un comentario',
    escanear: 'escaneó',
    eliminar_negocio: 'eliminó un negocio',
    equipo_invitar: 'invitó a alguien',
    equipo_aceptar: 'se sumó al equipo',
    equipo_quitar: 'quitó a alguien',
    equipo_cambiar: 'cambió un acceso',
  },
  en: {
    responder_resena: 'replied to a review',
    responder_comentario: 'replied to a comment',
    borrar_respuesta: 'removed a reply',
    moderar_hide: 'hid a comment',
    moderar_pin: 'pinned a comment',
    moderar_like: 'liked a comment',
    escanear: 'ran a scan',
    eliminar_negocio: 'deleted a business',
    equipo_invitar: 'invited someone',
    equipo_aceptar: 'joined the team',
    equipo_quitar: 'removed someone',
    equipo_cambiar: 'changed an access',
  },
};

const card = {
  background: 'var(--surface)', border: '1px solid var(--border-c)',
  borderRadius: 8, padding: '16px 18px',
};
const btnPrimario = {
  background: '#0B7324', color: '#fff', border: 'none', borderRadius: 6,
  padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SERIF,
};
const btnSecundario = {
  background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-c)',
  borderRadius: 6, padding: '7px 13px', fontSize: 12.5, cursor: 'pointer', fontFamily: SERIF,
};

const fecha = (d, idioma) =>
  new Date(d).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

export default function EquipoPage() {
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const acciones = ACCIONES[idioma] || ACCIONES.es;
  const { puede, cuenta } = useAuth();

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState(null);       // { tipo:'ok'|'error', texto }
  const [formAbierto, setFormAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(null); // id del miembro
  const [form, setForm] = useState({ email: '', rol: 'GESTOR', todos: true, negociosIds: [] });

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await equipoApi.estado());
    } catch (e) {
      // 🔴 Estado de error explícito y NO una lista vacía. Es la misma lección de
      // §23.3: con un `catch` silencioso, esta pantalla diría "no has invitado a
      // nadie" cuando en realidad no pudo preguntarlo — y el dueño se quedaría
      // creyendo que su equipo desapareció.
      setError(e.message || t.errorCarga);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const invitar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    try {
      const r = await equipoApi.invitar({
        email: form.email.trim(),
        rol: form.rol,
        negociosIds: form.todos ? [] : form.negociosIds,
      });
      setAviso({ tipo: 'ok', texto: t.okInvitado(form.email.trim()) });
      setForm({ email: '', rol: 'GESTOR', todos: true, negociosIds: [] });
      setFormAbierto(false);
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  const accion = async (fn, ok) => {
    setAviso(null);
    try {
      const r = await fn();
      // El texto local va primero: `r.mensaje` llega del backend siempre en
      // espanol y solo sirve de reserva si aqui no se pasó ninguno.
      setAviso({ tipo: 'ok', texto: ok || r?.mensaje });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message });
    }
  };

  if (cargando) return <p style={{ color: 'var(--text-2)', fontFamily: SERIF }}>{t.cargando}</p>;

  if (error) {
    return (
      <div style={{ ...card, maxWidth: 460 }}>
        <p style={{ margin: '0 0 10px', color: 'var(--text)', fontFamily: SERIF, fontWeight: 700 }}>{t.errorCarga}</p>
        <p style={{ margin: '0 0 14px', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6 }}>{error}</p>
        <button onClick={cargar} style={btnPrimario}>{t.reintentar}</button>
      </div>
    );
  }

  const { asientos, miembros, invitaciones, negocios, propietario, esPropietario, actividad } = datos;
  const sinCompartir = asientos.total <= 1;
  const sinLugares = asientos.libres <= 0;

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>
        {t.titulo}
      </h1>
      <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
        {t.subtitulo}
      </p>

      {aviso && (
        <p role="status" style={{
          margin: '0 0 16px', padding: '10px 13px', borderRadius: 6, fontSize: 13, lineHeight: 1.6,
          background: 'var(--surface)',
          border: `1px solid ${aviso.tipo === 'ok' ? '#4CAF66' : '#ef4444'}`,
          color: aviso.tipo === 'ok' ? 'var(--text)' : '#ef4444',
        }}>
          {aviso.texto}
        </p>
      )}

      {/* Plan Gratuito: no se ofrece un botón que solo da 403 (misma regla que
          §18 — lo que no se puede entregar no se muestra). Se explica qué falta
          y se enlaza a donde se resuelve. */}
      {sinCompartir && esPropietario && (
        <div style={{ ...card, marginBottom: 22 }}>
          <p style={{ margin: '0 0 6px', fontFamily: SERIF, fontWeight: 700, color: 'var(--text)' }}>{t.gratisTitulo}</p>
          <p style={{ margin: '0 0 14px', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.7 }}>{t.gratisTexto}</p>
          <Link href="/dashboard/planes" style={{ ...btnPrimario, textDecoration: 'none', display: 'inline-block' }}>
            {t.gratisBoton}
          </Link>
        </div>
      )}

      {/* ── Asientos + invitar ── */}
      {!sinCompartir && (
        <div style={{ ...card, marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: '0 0 2px', fontFamily: SERIF, fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                {t.asientos(asientos.usados, asientos.total)}
              </p>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12.5 }}>{t.asientosAyuda}</p>
            </div>
            {esPropietario && !formAbierto && (
              sinLugares
                ? (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '0 0 4px', color: 'var(--text-3)', fontSize: 12.5 }}>{t.lleno}</p>
                    <Link href="/dashboard/planes" style={{ ...btnSecundario, textDecoration: 'none', display: 'inline-block' }}>
                      {t.ampliar}
                    </Link>
                  </div>
                )
                : <button onClick={() => setFormAbierto(true)} style={btnPrimario}>{t.invitar}</button>
            )}
          </div>

          {formAbierto && (
            <form onSubmit={invitar} style={{ marginTop: 18, borderTop: '1px solid var(--border-c)', paddingTop: 16 }}>
              <Campo etiqueta={t.correo}>
                <input
                  type="email" required value={form.email} autoFocus
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="encargado@tunegocio.com"
                  style={inputEstilo}
                />
              </Campo>

              <Campo etiqueta={t.rol}>
                {[['GESTOR', t.rolGestor, t.rolGestorDesc], ['LECTOR', t.rolLector, t.rolLectorDesc]].map(([valor, label, desc]) => (
                  <label key={valor} style={opcionEstilo(form.rol === valor)}>
                    <input
                      type="radio" name="rol" value={valor} checked={form.rol === valor}
                      onChange={() => setForm({ ...form, rol: valor })}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{label}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, marginTop: 2 }}>{desc}</span>
                    </span>
                  </label>
                ))}
              </Campo>

              {/* El alcance por sede solo tiene sentido con más de un negocio.
                  Con uno solo, elegir "solo estos" y marcar el único es un paso
                  que no decide nada. */}
              {negocios.length > 1 && (
                <Campo etiqueta={t.alcance}>
                  <label style={opcionEstilo(form.todos)}>
                    <input type="radio" checked={form.todos} onChange={() => setForm({ ...form, todos: true })} />
                    <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{t.alcanceTodos}</span>
                  </label>
                  <label style={opcionEstilo(!form.todos)}>
                    <input type="radio" checked={!form.todos} onChange={() => setForm({ ...form, todos: false })} />
                    <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{t.alcanceAlgunos}</span>
                  </label>
                  {!form.todos && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 4 }}>
                      {negocios.map((n) => {
                        const marcado = form.negociosIds.includes(n.id);
                        return (
                          <label key={n.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                            border: `1px solid ${marcado ? '#0B7324' : 'var(--border-c)'}`,
                            borderRadius: 6, padding: '6px 10px', fontSize: 12.5, color: 'var(--text)',
                          }}>
                            <input
                              type="checkbox" checked={marcado}
                              onChange={() => setForm({
                                ...form,
                                negociosIds: marcado
                                  ? form.negociosIds.filter((x) => x !== n.id)
                                  : [...form.negociosIds, n.id],
                              })}
                            />
                            {n.nombre}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Campo>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button type="submit" disabled={enviando || (!form.todos && form.negociosIds.length === 0)} style={{ ...btnPrimario, opacity: enviando ? 0.6 : 1 }}>
                  {enviando ? t.enviando : t.enviar}
                </button>
                <button type="button" onClick={() => setFormAbierto(false)} style={btnSecundario}>{t.cancelarBtn}</button>
              </div>
            </form>
          )}
        </div>
      )}

      {!esPropietario && (
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 18px', lineHeight: 1.6 }}>{t.soloLectura}</p>
      )}

      {/* ── Con acceso ── */}
      <Seccion titulo={t.tituloMiembros}>
        <Persona
          nombre={propietario.nombre}
          email={propietario.email}
          etiqueta={t.propietario}
          destacada
        />
        {miembros.map((m) => (
          <Persona
            key={m.id}
            nombre={m.usuario.nombre}
            email={m.usuario.email}
            etiqueta={`${t.rolCorto[m.rol] || m.rolNombre}${m.soyYo ? ` · ${t.tu}` : ''}`}
            sub={[
              m.negocios.length ? m.negocios.join(', ') : t.todosLosNegocios,
              t.desde(fecha(m.desde, idioma)),
            ].join(' · ')}
            alerta={m.sinAsiento ? `${t.sinAsiento}. ${t.sinAsientoAyuda}` : null}
            derecha={esPropietario && (
              confirmando === m.id ? (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.quitarConfirma}</span>
                  <button onClick={() => { setConfirmando(null); accion(() => equipoApi.quitar(m.id), t.okQuitado); }}
                    style={{ ...btnSecundario, borderColor: '#ef4444', color: '#ef4444' }}>{t.quitarSi}</button>
                  <button onClick={() => setConfirmando(null)} style={btnSecundario}>{t.quitarNo}</button>
                </span>
              ) : (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Cambiar de rol es un desplegable y no un formulario aparte:
                      es el cambio más frecuente después de invitar. */}
                  <select
                    value={m.rol}
                    onChange={(e) => accion(() => equipoApi.actualizar(m.id, { rol: e.target.value }), t.okRol)}
                    aria-label={t.rol}
                    style={{ ...btnSecundario, padding: '6px 8px' }}
                  >
                    <option value="GESTOR">{t.rolGestor}</option>
                    <option value="LECTOR">{t.rolLector}</option>
                  </select>
                  <button onClick={() => setConfirmando(m.id)}
                    style={{ ...btnSecundario, color: '#ef4444' }}>{t.quitar}</button>
                </span>
              )
            )}
          />
        ))}
        {miembros.length === 0 && !sinCompartir && (
          <div style={{ padding: '14px 2px' }}>
            <p style={{ margin: '0 0 4px', color: 'var(--text-2)', fontSize: 13.5 }}>{t.vacio}</p>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.6 }}>{t.vacioAyuda}</p>
          </div>
        )}
      </Seccion>

      {/* ── Invitaciones pendientes ── */}
      {invitaciones.length > 0 && (
        <Seccion titulo={t.tituloInvitaciones}>
          {invitaciones.map((i) => (
            <Persona
              key={i.id}
              nombre={i.email}
              etiqueta={t.rolCorto[i.rol] || i.rolNombre}
              sub={i.vencida ? t.vencida : t.venceEl(fecha(i.expira, idioma))}
              atenuada
              derecha={esPropietario && (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => accion(() => equipoApi.reenviar(i.id), t.okReenviado)} style={btnSecundario}>{t.reenviar}</button>
                  <button onClick={() => accion(() => equipoApi.cancelar(i.id), t.okCancelado)}
                    style={{ ...btnSecundario, color: '#ef4444' }}>{t.cancelarInv}</button>
                </span>
              )}
            />
          ))}
        </Seccion>
      )}

      {/* ── Actividad ──
          Solo la ve el propietario (el backend manda la lista vacía al resto).
          Es rendición de cuentas hacia quien paga, no vigilancia entre colegas. */}
      {esPropietario && miembros.length > 0 && (
        <Seccion titulo={t.tituloActividad}>
          {actividad.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '10px 0' }}>{t.actividadVacia}</p>
          )}
          {actividad.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-c)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{a.autorNombre}</span>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {acciones[a.accion] || a.accion}
                {a.detalle?.negocio ? ` · ${a.detalle.negocio}` : ''}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
                {new Date(a.creadoEn).toLocaleString(idioma === 'en' ? 'en-US' : 'es-PE',
                  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </Seccion>
      )}

      {/* Salir del equipo: solo para quien NO es el dueño. Nadie debería quedar
          atrapado dentro de la cuenta de otra persona. */}
      {!esPropietario && cuenta && (
        <div style={{ marginTop: 26 }}>
          {confirmando === 'salir' ? (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.salirConfirma}</span>
              <button
                onClick={async () => {
                  try { await equipoApi.salir(cuenta.id); } catch {}
                  // Vuelta a la cuenta propia sin pasar por el estado local: se
                  // acaba de perder el acceso a todo lo que hay en pantalla.
                  try { localStorage.removeItem('bs_cuenta'); } catch {}
                  window.location.href = '/dashboard';
                }}
                style={{ ...btnSecundario, borderColor: '#ef4444', color: '#ef4444' }}
              >
                {t.salirSi}
              </button>
              <button onClick={() => setConfirmando(null)} style={btnSecundario}>{t.quitarNo}</button>
            </span>
          ) : (
            <button onClick={() => setConfirmando('salir')} style={{ ...btnSecundario, color: '#ef4444' }}>
              {t.salir}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Piezas ────────────────────────────────────────────────

const inputEstilo = {
  width: '100%', maxWidth: 340, background: 'var(--surface2)',
  border: '1px solid var(--border-c)', color: 'var(--text)',
  borderRadius: 6, padding: '9px 12px', fontSize: 14, fontFamily: SERIF,
};

const opcionEstilo = (activa) => ({
  display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer',
  border: `1px solid ${activa ? '#0B7324' : 'var(--border-c)'}`,
  borderRadius: 7, padding: '10px 12px', marginBottom: 8, maxWidth: 520,
});

const Campo = ({ etiqueta, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{
      display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
      color: 'var(--text-3)', marginBottom: 7, fontFamily: SERIF,
    }}>
      {etiqueta}
    </label>
    {children}
  </div>
);

const Seccion = ({ titulo, children }) => (
  <section style={{ marginBottom: 26 }}>
    <h2 style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-3)', margin: '0 0 8px' }}>
      {titulo}
    </h2>
    <div style={{ ...card, padding: '4px 18px' }}>{children}</div>
  </section>
);

const Persona = ({ nombre, email, etiqueta, sub, derecha, alerta, destacada, atenuada }) => (
  <div style={{
    display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between',
    padding: '13px 0', borderBottom: '1px solid var(--border-c)', flexWrap: 'wrap',
    opacity: atenuada ? 0.75 : 1,
  }}>
    <div style={{ display: 'flex', gap: 11, alignItems: 'center', minWidth: 0, flex: '1 1 240px' }}>
      {/* Círculo con la inicial, como en las reseñas: la foto de perfil no
          existe en este producto y un avatar genérico no aporta nada. */}
      <span style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: destacada ? '#0B7324' : 'var(--surface2)',
        color: destacada ? '#fff' : 'var(--text-2)',
        border: destacada ? 'none' : '1px solid var(--border-c)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, fontFamily: SERIF,
      }}>
        {(nombre || '?').trim().charAt(0).toUpperCase()}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nombre}{' '}
          <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-3)' }}>· {etiqueta}</span>
        </span>
        {email && email !== nombre && (
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-2)' }}>{email}</span>
        )}
        {sub && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{sub}</span>}
        {alerta && (
          <span style={{ display: 'block', fontSize: 12, color: '#f59e0b', marginTop: 3, lineHeight: 1.5 }}>{alerta}</span>
        )}
      </span>
    </div>
    {derecha}
  </div>
);
