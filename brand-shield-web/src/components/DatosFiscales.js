'use client';
// Datos de facturación que se piden ANTES de cobrar, cuando el importe obliga a
// identificar al comprador.
//
// Desde S/700 el comprobante debe identificar al comprador (RS 007-99, art. 8).
// Hoy solo lo cruza el plan Franquicia anual. Se piden antes del pago y no
// después a propósito: cobrar y descubrir luego que no se puede emitir el
// comprobante deja al cliente pagado y sin documento.
//
// El backend vuelve a validarlo en `POST /api/pagos/culqi` y responde 409
// DATOS_FISCALES_REQUERIDOS, así que saltarse esta pantalla no permite pagar.

import { useState } from 'react';
import { pagos } from '../lib/api';

const G = '#0B7324';
const GEO = "Georgia,'Times New Roman',serif";

const input = {
  width: '100%', padding: '10px 12px', borderRadius: 5, border: '1px solid #D8D6CC',
  fontSize: 14, fontFamily: GEO, color: '#141413', background: '#fff', boxSizing: 'border-box',
};

export default function DatosFiscales({ item, onListo, onCancelar }) {
  const [f, setF] = useState({ docTipo: '1', docNumero: '', razonSocial: '', direccionFiscal: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const esRuc = f.docTipo === '6';

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      await pagos.guardarDatosFiscales({ ...f, paisFiscal: 'PE' });
      onListo();
    } catch (err) {
      setError(err.message || 'No pudimos guardar tus datos. Revísalos e inténtalo de nuevo.');
      setGuardando(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="datos-fiscales-titulo"
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(20,20,19,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: GEO, backdropFilter: 'blur(3px)', overflowY: 'auto',
      }}>
      <form onSubmit={guardar} style={{ background: '#fff', borderRadius: 12, maxWidth: 460, width: '100%', padding: '28px 28px 24px', boxShadow: '0 18px 60px rgba(0,0,0,0.3)' }}>
        <h2 id="datos-fiscales-titulo" style={{ fontSize: 20, fontWeight: 900, color: '#141413', margin: '0 0 8px', letterSpacing: '-0.6px' }}>
          Datos para tu comprobante
        </h2>
        <p style={{ fontSize: 13.5, color: '#5C5B57', lineHeight: 1.7, margin: '0 0 6px' }}>
          El <strong>{item?.nombre || 'plan seleccionado'}</strong> cuesta {item ? `S/${item.precio}` : 'más de S/700'},
          y por norma de SUNAT todo comprobante desde <strong>S/700</strong> debe identificar
          al comprador. Los necesitamos antes de cobrarte.
        </p>
        <p style={{ fontSize: 12, color: '#9C9B96', lineHeight: 1.6, margin: '0 0 18px' }}>
          Con DNI emitimos una boleta; con RUC, una factura a nombre de tu empresa.
        </p>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)', color: '#B91C1C', borderRadius: 6, padding: '10px 13px', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <div style={{ display: 'grid', gap: 13 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#141413', marginBottom: 5 }}>Tipo de documento</label>
            <select style={input} value={f.docTipo} onChange={set('docTipo')}>
              <option value="1">DNI (recibo una boleta)</option>
              <option value="6">RUC (recibo una factura)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#141413', marginBottom: 5 }}>
              {esRuc ? 'RUC (11 dígitos)' : 'DNI (8 dígitos)'}
            </label>
            <input style={input} value={f.docNumero} onChange={set('docNumero')} required
              inputMode="numeric" maxLength={esRuc ? 11 : 8}
              placeholder={esRuc ? '20601030405' : '12345678'} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#141413', marginBottom: 5 }}>
              {esRuc ? 'Razón social' : 'Nombre completo'}
            </label>
            <input style={input} value={f.razonSocial} onChange={set('razonSocial')} required maxLength={120}
              placeholder={esRuc ? 'MI EMPRESA S.A.C.' : 'Nombres y apellidos'} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#141413', marginBottom: 5 }}>
              Dirección fiscal <span style={{ fontWeight: 400, color: '#9C9B96' }}>(opcional)</span>
            </label>
            <input style={input} value={f.direccionFiscal} onChange={set('direccionFiscal')} maxLength={200} />
          </div>
        </div>

        <button type="submit" disabled={guardando}
          style={{ marginTop: 20, width: '100%', background: guardando ? '#9C9B96' : G, color: '#fff', border: 'none', borderRadius: 6, padding: '13px', fontSize: 15, fontWeight: 700, fontFamily: GEO, cursor: guardando ? 'default' : 'pointer' }}>
          {guardando ? 'Guardando…' : 'Guardar y continuar al pago'}
        </button>
        <button type="button" onClick={onCancelar}
          style={{ marginTop: 9, width: '100%', background: 'transparent', color: '#5C5B57', border: 'none', padding: '8px', fontSize: 13, fontFamily: GEO, cursor: 'pointer' }}>
          Cancelar
        </button>

        <p style={{ fontSize: 11.5, color: '#9C9B96', lineHeight: 1.6, margin: '14px 0 0', textAlign: 'center' }}>
          Usamos estos datos solo para emitir tu comprobante. Puedes cambiarlos
          después en Facturación; los ya emitidos no se modifican.
        </p>
      </form>
    </div>
  );
}
