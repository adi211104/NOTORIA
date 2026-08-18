'use client';

// Aterrizaje del enlace "te invitaron a gestionar X en Notoria".
//
// La mitad de las personas que llegan aquí NO tienen cuenta todavía, y esa es la
// razón de que la página cargue los datos de la invitación ANTES de pedir
// sesión: quien ve "Marta te invitó a Cevichería El Muelle" se registra; quien
// ve un formulario de login pelado, se va. Por eso `GET /api/equipo/invitacion`
// es público (no expone nada que el invitado no tenga ya en su correo).
//
// Se acepta con un BOTÓN y no al cargar, por el mismo motivo que la confirmación
// de contraseña: los antivirus corporativos abren los enlaces de los correos
// para analizarlos, y un enlace que se consume solo con visitarlo se gastaría
// antes de que la persona lo vea.

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { equipoApi, setCuentaActiva } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';

const CAJA = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '18px 20px', margin: '0 0 24px',
};
const BOTON = {
  display: 'inline-block', background: 'var(--accent)', color: '#fff', border: 'none',
  padding: '13px 26px', borderRadius: 8, fontSize: 15, fontWeight: 700,
  textDecoration: 'none', cursor: 'pointer',
};

export default function Invitacion({ params }) {
  const { token } = use(params);
  const { usuario, cargando } = useAuth();

  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [buscando, setBuscando] = useState(true);
  const [aceptando, setAceptando] = useState(false);
  const [hecho, setHecho] = useState(null);

  useEffect(() => {
    equipoApi.verInvitacion(token)
      .then(setInv)
      .catch((e) => setError(e.message || 'No pudimos leer la invitación'))
      .finally(() => setBuscando(false));
  }, [token]);

  const aceptar = async () => {
    setAceptando(true);
    setError(null);
    try {
      const r = await equipoApi.aceptar(token);
      // Se entra directamente a trabajar en la cuenta recién aceptada: es lo que
      // la persona vino a hacer, y obligarla a buscar el selector después de
      // aceptar sería dejarla en su propio panel vacío preguntándose si funcionó.
      setCuentaActiva(r.cuentaId);
      setHecho(r);
    } catch (e) {
      setError(e.message || 'No pudimos aceptar la invitación');
    } finally {
      setAceptando(false);
    }
  };

  // El correo de la sesión tiene que ser el invitado. Se comprueba también en el
  // backend (es la comprobación de verdad); aquí solo sirve para explicarlo
  // antes de que la persona pulse y reciba un error.
  const otroCorreo = usuario && inv && usuario.email?.toLowerCase() !== inv.email;
  const destino = `/invitacion/${token}`;

  return (
    <main style={{ maxWidth: 500, margin: '0 auto', padding: '72px 22px 90px' }}>
      <p style={{
        fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
        color: 'var(--text-3)', margin: '0 0 18px', fontWeight: 600,
      }}>
        Invitación · Notoria
      </p>

      {buscando && <p style={{ color: 'var(--text-2)' }}>Abriendo la invitación…</p>}

      {!buscando && !inv && (
        <>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 'clamp(24px,6vw,32px)', margin: '0 0 14px', color: '#ef4444' }}>
            Esta invitación ya no sirve
          </h1>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 24px' }}>
            {error || 'El enlace no existe, ya se usó o venció.'} Pídele a quien te invitó que te la
            vuelva a enviar desde <strong>Equipo</strong> en su panel.
          </p>
          <Link href="/" style={BOTON}>Ir a Notoria</Link>
        </>
      )}

      {inv && hecho && (
        <>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 'clamp(24px,6vw,32px)', margin: '0 0 14px', color: 'var(--accent)' }}>
            Ya tienes acceso
          </h1>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 24px' }}>
            Entraste a <strong style={{ color: 'var(--text)' }}>{hecho.cuentaNombre}</strong>. Puedes
            volver a tu propia cuenta cuando quieras desde el selector de arriba del menú.
          </p>
          <button onClick={() => { window.location.href = '/dashboard'; }} style={BOTON}>
            Entrar al panel
          </button>
        </>
      )}

      {inv && !hecho && (
        <>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 'clamp(24px,6vw,32px)', lineHeight: 1.15, margin: '0 0 18px' }}>
            Te invitaron a {inv.cuenta}
          </h1>

          <div style={CAJA}>
            <Fila etiqueta="Empresa" valor={inv.cuenta} />
            <Fila etiqueta="Tu rol" valor={inv.rolNombre} />
            <Fila
              etiqueta="Podrás"
              valor={inv.rol === 'GESTOR'
                ? 'Responder reseñas y comentarios, usar la IA y gestionar las alertas'
                : 'Ver reseñas, alertas y reportes, sin modificar nada'}
            />
            {inv.negocios.length > 0 && <Fila etiqueta="Acceso a" valor={inv.negocios.join(', ')} />}
            <Fila etiqueta="Correo" valor={inv.email} ultima />
          </div>

          {error && (
            <p style={{ color: '#ef4444', fontSize: 13.5, lineHeight: 1.7, margin: '0 0 18px' }}>{error}</p>
          )}

          {cargando && <p style={{ color: 'var(--text-2)' }}>Comprobando tu sesión…</p>}

          {/* Sin sesión: registrarse es la opción principal, porque es lo que le
              toca a la mayoría de invitados. El enlace lleva `next` para volver
              aquí solo y no dejar a nadie buscando otra vez el correo. */}
          {!cargando && !usuario && (
            <>
              <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 18px' }}>
                Para aceptarla necesitas una cuenta de Notoria con el correo{' '}
                <strong style={{ color: 'var(--text)' }}>{inv.email}</strong>. Crearla es gratis y no
                pide tarjeta.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link
                  href={`/registro?next=${encodeURIComponent(destino)}&email=${encodeURIComponent(inv.email)}`}
                  style={BOTON}
                >
                  Crear mi cuenta
                </Link>
                <Link
                  href={`/login?next=${encodeURIComponent(destino)}`}
                  style={{ ...BOTON, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  Ya tengo cuenta
                </Link>
              </div>
            </>
          )}

          {/* Con sesión pero con otro correo. Es el fallo más frecuente de
              cualquier invitación —te la reenvían, o tienes dos cuentas— y sin
              este aviso el botón simplemente daría un error que no se entiende. */}
          {!cargando && usuario && otroCorreo && (
            <>
              <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 18px' }}>
                Estás dentro como <strong style={{ color: 'var(--text)' }}>{usuario.email}</strong>,
                pero esta invitación es para <strong style={{ color: 'var(--text)' }}>{inv.email}</strong>.
                Cierra sesión y entra con esa dirección, o pide que te la reenvíen a la tuya.
              </p>
              <Link href={`/login?next=${encodeURIComponent(destino)}`} style={BOTON}>
                Entrar con otra cuenta
              </Link>
            </>
          )}

          {!cargando && usuario && !otroCorreo && (
            <button onClick={aceptar} disabled={aceptando} style={{ ...BOTON, opacity: aceptando ? 0.6 : 1 }}>
              {aceptando ? 'Aceptando…' : `Aceptar y entrar a ${inv.cuenta}`}
            </button>
          )}

          <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.7, margin: '22px 0 0' }}>
            Aceptar no te da acceso a los pagos ni a los datos de facturación de{' '}
            {inv.cuenta}, y puedes salir del equipo cuando quieras. Si no esperabas esta
            invitación, cierra la página sin pulsar nada.
          </p>
        </>
      )}
    </main>
  );
}

const Fila = ({ etiqueta, valor, ultima }) => (
  <div style={{
    display: 'flex', gap: 14, padding: '9px 0',
    borderBottom: ultima ? 'none' : '1px solid var(--border-l, var(--border))',
    flexWrap: 'wrap',
  }}>
    <span style={{ color: 'var(--text-3)', fontSize: 13, minWidth: 84 }}>{etiqueta}</span>
    <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, flex: 1, minWidth: 160 }}>{valor}</span>
  </div>
);
