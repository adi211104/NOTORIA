'use client';
import { nombrePlan } from '../lib/planes';
// Confirmación del pago, a pantalla completa.
//
// Antes el resultado se pintaba como una franja arriba de la página y a los
// 1,8 s redirigía solo al panel. Si el usuario estaba desplazado hacia abajo
// —que es lo normal: el botón de pagar está en las tarjetas— no llegaba a ver
// nada y la experiencia era "la página se recargó". Un pago es el momento en
// que menos se puede dejar al cliente con la duda de si se le cobró.
//
// Por eso: superposición que tapa la pantalla (da igual el scroll), el detalle
// exacto de lo cobrado, y salida SOLO por acción del usuario — sin redirección
// automática que se lleve por delante la confirmación.

import { useEffect } from 'react';

const G = '#0B7324';
const GEO = "Georgia,'Times New Roman',serif";

const fmt = (centimos, moneda = 'PEN') =>
  `${moneda === 'PEN' ? 'S/' : ''}${(centimos / 100).toFixed(2)}`;

const fechaLarga = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return null; }
};

export default function ResultadoPago({ estado, datos, error, onCerrar, onIrAlPanel }) {
  const exito = estado === 'exito';
  const procesando = estado === 'procesando';

  // Con la superposición abierta no se debe poder desplazar el fondo, y Escape
  // la cierra como cualquier diálogo — salvo mientras se procesa el cobro, que
  // no se debe poder interrumpir.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape' || procesando) return;
      (exito ? onIrAlPanel : onCerrar)?.();
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previo; window.removeEventListener('keydown', onKey); };
  }, [exito, procesando, onCerrar, onIrAlPanel]);

  // Mientras se cobra: señal de actividad clara, sin botones que inviten a
  // recargar o a pagar dos veces.
  if (procesando) {
    return (
      <div role="dialog" aria-modal="true" aria-live="polite"
        style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(20,20,19,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          fontFamily: GEO, backdropFilter: 'blur(3px)',
        }}>
        <style>{`
          @keyframes giroPago { to { transform: rotate(360deg); } }
          .pago-spinner { animation: giroPago .9s linear infinite; transform-origin: 50% 50%; }
          @media (prefers-reduced-motion: reduce) { .pago-spinner { animation-duration: 2.4s; } }
        `}</style>
        <div style={{ background: '#fff', borderRadius: 12, padding: '32px 34px', textAlign: 'center', maxWidth: 380, boxShadow: '0 18px 60px rgba(0,0,0,0.3)' }}>
          <svg width="42" height="42" viewBox="0 0 50 50" style={{ marginBottom: 16 }}>
            <circle cx="25" cy="25" r="20" fill="none" stroke="#E8E6DC" strokeWidth="5"/>
            <circle className="pago-spinner" cx="25" cy="25" r="20" fill="none" stroke={G} strokeWidth="5"
              strokeLinecap="round" strokeDasharray="90 126"/>
          </svg>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#141413', margin: '0 0 8px' }}>Procesando tu pago…</h2>
          <p style={{ fontSize: 13.5, color: '#5C5B57', lineHeight: 1.65, margin: 0 }}>
            Estamos confirmando el cobro con tu banco. <strong>No cierres ni recargues esta ventana.</strong>
          </p>
        </div>
      </div>
    );
  }

  const vencimiento = fechaLarga(datos?.usuario?.fechaVencimiento);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="resultado-pago-titulo"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(20,20,19,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: GEO, backdropFilter: 'blur(3px)',
      }}>
      <style>{`
        @keyframes entradaPago { from { opacity:0; transform:translateY(14px) scale(0.98); } to { opacity:1; transform:none; } }
        @keyframes marcaPago { from { stroke-dashoffset:34; } to { stroke-dashoffset:0; } }
        .resultado-caja { animation: entradaPago .28s ease-out; }
        .resultado-marca { stroke-dasharray:34; animation: marcaPago .5s .16s ease-out backwards; }
        @media (prefers-reduced-motion: reduce) {
          .resultado-caja, .resultado-marca { animation: none; }
        }
      `}</style>

      <div className="resultado-caja" style={{
        background: '#fff', borderRadius: 12, maxWidth: 460, width: '100%',
        padding: '32px 30px', textAlign: 'center', boxShadow: '0 18px 60px rgba(0,0,0,0.3)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{
          width: 62, height: 62, borderRadius: '50%', margin: '0 auto 18px',
          background: exito ? 'rgba(11,115,36,0.12)' : 'rgba(220,38,38,0.1)',
          border: `2px solid ${exito ? G : '#DC2626'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
            stroke={exito ? G : '#DC2626'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            {exito
              ? <path className="resultado-marca" d="M20 6L9 17l-5-5"/>
              : <><path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></>}
          </svg>
        </div>

        <h2 id="resultado-pago-titulo" style={{ fontSize: 23, fontWeight: 900, color: '#141413', margin: '0 0 8px', letterSpacing: '-0.7px' }}>
          {exito ? '¡Pago aprobado!' : 'No pudimos procesar el pago'}
        </h2>

        {exito ? (
          <>
            <p style={{ fontSize: 14.5, color: '#5C5B57', lineHeight: 1.7, margin: '0 0 20px' }}>
              Tu plan <strong>{nombrePlan(datos?.usuario?.plan, 'es')}</strong> ya está activo.
              Te enviamos el comprobante a tu correo.
            </p>

            {/* Detalle de lo cobrado: es lo que el cliente necesita para
                contrastar con el cargo que verá en su banco */}
            <div style={{ background: '#FAF9F5', border: '1px solid #E8E6DC', borderRadius: 8, padding: '14px 16px', textAlign: 'left', marginBottom: 20 }}>
              {[
                ['Importe cobrado', datos?.monto != null ? fmt(datos.monto, datos.moneda) : null],
                ['Comprobante', datos?.comprobante ? `${datos.comprobante.tipo} ${datos.comprobante.numero}` : null],
                ['Próxima renovación', vencimiento],
                ['N.º de operación', datos?.cargoId],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13, padding: '4px 0' }}>
                  <span style={{ color: '#9C9B96' }}>{k}</span>
                  <span style={{ color: '#141413', fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>

            {datos?.promoAplicada && (
              <p style={{ fontSize: 12.5, color: G, background: 'rgba(11,115,36,0.08)', border: '1px solid rgba(11,115,36,0.25)', borderRadius: 6, padding: '9px 12px', margin: '0 0 20px', lineHeight: 1.6 }}>
                Se aplicó la promoción de bienvenida: este precio se mantiene el
                mes que viene y desde el tercero se renueva al precio de lista.
              </p>
            )}

            <button onClick={onIrAlPanel} style={{
              width: '100%', background: G, color: '#fff', border: 'none', borderRadius: 6,
              padding: '13px', fontSize: 15, fontWeight: 700, fontFamily: GEO, cursor: 'pointer',
            }}>
              Ir a mi panel
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14.5, color: '#5C5B57', lineHeight: 1.7, margin: '0 0 8px' }}>{error}</p>
            <p style={{ fontSize: 12.5, color: '#9C9B96', lineHeight: 1.65, margin: '0 0 20px' }}>
              No se realizó ningún cargo a tu tarjeta. Si el problema sigue,
              escríbenos a <a href="mailto:hola@usenotoria.app" style={{ color: G }}>hola@usenotoria.app</a>.
            </p>
            <button onClick={onCerrar} style={{
              width: '100%', background: G, color: '#fff', border: 'none', borderRadius: 6,
              padding: '13px', fontSize: 15, fontWeight: 700, fontFamily: GEO, cursor: 'pointer',
            }}>
              Volver a intentar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
