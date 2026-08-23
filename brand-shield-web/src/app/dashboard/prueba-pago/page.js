'use client';

// brand-shield-web/src/app/dashboard/prueba-pago/page.js
//
// Página interna para ejercitar el circuito de cobro ENTERO en producción con
// S/1.00: Culqi → Pago → comprobante → SUNAT → reembolso → webhook.
//
// 🔴 NO ES UNA PANTALLA DE PRODUCTO. No está en el menú, no se enlaza desde
// ningún sitio y el backend responde 404 a cualquier cuenta que no sea la del
// dueño. Se llega escribiendo la URL.
//
// ⚠️ Lo que deja detrás: el comprobante que se emita consume el siguiente
// correlativo de su serie, y la numeración fiscal no admite huecos. Reembolsar
// en Culqi NO anula el comprobante ante SUNAT: son dos sistemas independientes.
// Por eso la propia pantalla lo dice antes de que nadie pulse el botón — un
// aviso que solo vive en la documentación no lo lee quien está a punto de pagar.

import { useState, useEffect } from 'react';
import Script from 'next/script';
import { useAuth } from '../../../context/AuthContext';
import { cabecerasAuth } from '../../../lib/api';

const GEO = "Georgia, 'Times New Roman', serif";
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MONTO_CENTIMOS = 100; // S/1.00

export default function PruebaPago() {
  const { usuario } = useAuth();
  const [estado, setEstado] = useState('');   // '' | 'cobrando' | 'ok' | 'error'
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  // Callback global que exige el widget de Checkout v4 de Culqi.
  useEffect(() => {
    window.culqi = async () => {
      const Culqi = window.Culqi;
      if (!Culqi?.token) {
        if (Culqi?.error) setError(Culqi.error.user_message || 'El widget devolvió un error.');
        return;
      }
      const token = Culqi.token.id;
      // 🔴 Cerrar PRIMERO, antes de cualquier await: el widget entrega el token
      // y deja su ventana abierta, así que sin esto el cobro se procesa detrás
      // de un formulario que el usuario sigue viendo.
      Culqi.close();

      setEstado('cobrando');
      setError('');
      try {
        const res = await fetch(`${API_URL}/api/pagos/prueba-sunat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...cabecerasAuth() },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'El cobro falló.');
        setResultado(data);
        setEstado('ok');
      } catch (e) {
        setError(e.message);
        setEstado('error');
      }
    };
    return () => { delete window.culqi; };
  }, []);

  const abrirWidget = () => {
    const Culqi = typeof window !== 'undefined' ? window.Culqi : null;
    const publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
    if (!Culqi || !publicKey) {
      setError('El widget de Culqi no cargó. Recarga la página.');
      return;
    }
    setError('');
    Culqi.publicKey = publicKey;
    Culqi.settings({ title: 'Notoria', currency: 'PEN', amount: MONTO_CENTIMOS });
    Culqi.options({
      lang: 'auto',
      paymentMethods: { tarjeta: true, yape: false, billetera: false, bancaMovil: false, agente: false, cuotealo: false },
    });
    Culqi.open();
  };

  const caja = { background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 14, padding: 22, marginBottom: 16 };
  const dato = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 13.5, borderBottom: '1px solid var(--border-c)' };

  return (
    <div style={{ fontFamily: GEO, maxWidth: 620 }}>
      <Script src="https://checkout.culqi.com/js/v4" strategy="afterInteractive" />

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
        Prueba técnica de cobro
      </h1>
      <p style={{ color: 'var(--text-2)', fontSize: 13.5, margin: '0 0 18px', lineHeight: 1.6 }}>
        Cobra <strong>S/1.00</strong> de verdad para comprobar el circuito completo en
        producción. No activa ninguna suscripción ni cambia tu plan.
      </p>

      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 18 }}>
        <p style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>Esto no es del todo reversible</p>
        <ul style={{ color: 'var(--text-2)', fontSize: 12.5, margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
          <li>Se cobra <strong>dinero real</strong> a la tarjeta que ingreses.</li>
          <li>Se emite un comprobante que <strong>consume un correlativo</strong> de la serie. La numeración no admite huecos, así que ese número queda gastado para siempre.</li>
          <li><strong>Reembolsar en Culqi no anula el comprobante ante SUNAT.</strong> Si se devuelve el dinero, hay que anularlo aparte o quedaría declarado como venta.</li>
        </ul>
      </div>

      {estado === 'ok' && resultado && (
        <div style={{ ...caja, border: '1px solid rgba(34,197,94,0.4)' }}>
          <p style={{ color: '#22c55e', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Cobro realizado</p>
          <div style={dato}><span style={{ color: 'var(--text-3)' }}>Cargo en Culqi</span><code style={{ color: 'var(--text)' }}>{resultado.cargoId}</code></div>
          <div style={dato}><span style={{ color: 'var(--text-3)' }}>Importe</span><span style={{ color: 'var(--text)' }}>S/{(resultado.monto / 100).toFixed(2)}</span></div>
          <div style={dato}><span style={{ color: 'var(--text-3)' }}>Pago</span><code style={{ color: 'var(--text)' }}>{resultado.pagoId || '—'}</code></div>
          {resultado.comprobante ? (
            <>
              <div style={dato}><span style={{ color: 'var(--text-3)' }}>Comprobante</span><strong style={{ color: 'var(--text)' }}>{resultado.comprobante.tipo} {resultado.comprobante.numero}</strong></div>
              <div style={{ ...dato, borderBottom: 'none' }}><span style={{ color: 'var(--text-3)' }}>Estado SUNAT</span><span style={{ color: 'var(--text)' }}>{resultado.comprobante.estadoSunat}</span></div>
            </>
          ) : (
            <p style={{ color: '#f59e0b', fontSize: 12.5, margin: '10px 0 0' }}>
              ⚠️ El cobro pasó pero NO se emitió comprobante. Revisar los logs del backend.
            </p>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      <button
        onClick={abrirWidget}
        disabled={estado === 'cobrando' || estado === 'ok'}
        style={{
          background: estado === 'ok' ? 'var(--surface2)' : '#0B7324',
          color: estado === 'ok' ? 'var(--text-3)' : '#fff',
          border: 'none', borderRadius: 10, padding: '13px 26px', fontSize: 14.5, fontWeight: 600,
          cursor: estado === 'cobrando' || estado === 'ok' ? 'default' : 'pointer', fontFamily: GEO,
        }}>
        {estado === 'cobrando' ? 'Procesando…' : estado === 'ok' ? 'Ya cobrado en esta sesión' : 'Pagar S/1.00 de prueba'}
      </button>

      <p style={{ color: 'var(--text-3)', fontSize: 11.5, marginTop: 16, lineHeight: 1.6 }}>
        Sesión: {usuario?.email || '—'}. El backend responde 404 a cualquier cuenta que no sea
        la del dueño, así que esta página no hace nada para nadie más.
      </p>
    </div>
  );
}
