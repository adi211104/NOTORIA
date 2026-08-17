'use client';

// Confirmación de un cambio de contraseña.
//
// Aquí aterriza el enlace del correo. Hasta que esta página llama al backend, la
// contraseña NO ha cambiado — ese es todo el punto del rediseño: quien conoce la
// contraseña actual ya no basta, hace falta también el buzón.
//
// Se confirma con un BOTÓN y no al cargar la página, a propósito. Los clientes
// de correo y los antivirus corporativos abren los enlaces por su cuenta para
// analizarlos; si el cambio se aplicara solo con visitar la URL, un escáner
// podría consumir el enlace antes de que el dueño lo viera y dejarlo con una
// contraseña que nunca llegó a confirmar.

import { useState, use } from 'react';
import Link from 'next/link';
import { API_URL } from '../../../lib/api';

export default function ConfirmarCambio({ params }) {
  const { token } = use(params);
  const [estado, setEstado] = useState('listo'); // listo | enviando | hecho | error
  const [mensaje, setMensaje] = useState('');

  const confirmar = async () => {
    setEstado('enviando');
    try {
      const r = await fetch(`${API_URL}/api/auth/confirmar-cambio-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMensaje(d.error || 'No pudimos confirmar el cambio.');
        setEstado('error');
        return;
      }
      setMensaje(d.mensaje || 'Contraseña actualizada.');
      setEstado('hecho');
    } catch {
      setMensaje('No pudimos conectar con el servidor. Inténtalo de nuevo.');
      setEstado('error');
    }
  };

  const color = estado === 'hecho' ? 'var(--accent)' : estado === 'error' ? '#ef4444' : 'var(--text)';

  return (
    <main style={{ maxWidth: 460, margin: '0 auto', padding: '72px 22px 90px' }}>
      <p style={{
        fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
        color: 'var(--text-3)', margin: '0 0 18px', fontWeight: 600,
      }}>
        Seguridad de la cuenta · Notoria
      </p>

      <h1 style={{
        fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400,
        fontSize: 'clamp(26px, 6vw, 34px)', lineHeight: 1.15, margin: '0 0 14px', color,
      }}>
        {estado === 'hecho' ? 'Contraseña actualizada'
          : estado === 'error' ? 'No pudimos confirmarlo'
            : 'Confirma el cambio de contraseña'}
      </h1>

      {estado === 'listo' && (
        <>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 8px' }}>
            Tu contraseña <strong style={{ color: 'var(--text)' }}>todavía no ha cambiado</strong>. Se
            cambiará al pulsar el botón.
          </p>
          <p style={{ color: 'var(--text-3)', fontSize: 13.5, lineHeight: 1.7, margin: '0 0 24px' }}>
            Si no fuiste tú quien lo pidió, cierra esta página sin pulsar nada: la contraseña seguirá
            siendo la de siempre.
          </p>
          <button onClick={confirmar} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '13px 26px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            Sí, cambiar mi contraseña
          </button>
        </>
      )}

      {estado === 'enviando' && (
        <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>Confirmando…</p>
      )}

      {(estado === 'hecho' || estado === 'error') && (
        <>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 24px' }}>{mensaje}</p>
          <Link href="/login" style={{
            display: 'inline-block', background: 'var(--accent)', color: '#fff',
            padding: '13px 26px', borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: 'none',
          }}>
            {estado === 'hecho' ? 'Iniciar sesión' : 'Ir al inicio de sesión'}
          </Link>
          {estado === 'error' && (
            <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.7, margin: '20px 0 0' }}>
              Si el enlace caducó, vuelve a pedir el cambio desde la app o desde
              Configuración en el panel.
            </p>
          )}
        </>
      )}
    </main>
  );
}
