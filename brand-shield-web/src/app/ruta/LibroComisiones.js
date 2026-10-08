'use client';

// Libro de comisiones del promotor (2026-10-07): la liquidación del mes
// (contrato 8.1), los asientos, y —solo el dueño— registrar lo que se le
// transfirió al promotor y los ajustes con motivo. Ningún asiento se edita ni se
// borra: una corrección es otro asiento (lib/libroComisiones.js del backend).
//
// Va en su propio archivo y no dentro de la página: un componente definido
// dentro de otro se vuelve a montar en cada render y sus campos pierden el foco.

import { useCallback, useEffect, useState } from 'react';
import { rutaApi } from '../../lib/api';

const soles = (c) => `${c < 0 ? '−' : ''}S/${(Math.abs(c || 0) / 100).toFixed(2)}`;
const centimos = (txt) => Math.round(parseFloat(String(txt).replace(',', '.')) * 100);
const mesLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 7);
const dia = (f) => new Date(f).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: '2-digit' });
const CONCEPTO = { ALTA: 'Bono de alta', RESIDUAL: 'Residual', PAGO: 'Pago al promotor', AJUSTE: 'Ajuste' };

export default function LibroComisiones({ dueno, alias, promotores = [], s, alCambiar }) {
  const otros = promotores.filter((p) => p !== 'dueno');
  const [promotor, setPromotor] = useState(dueno ? (otros[0] || 'dueno') : alias);
  const [mes, setMes] = useState(mesLima());
  const [liq, setLiq] = useState(null);
  const [asientos, setAsientos] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pago, setPago] = useState({ monto: '', referencia: '' });
  const [ajuste, setAjuste] = useState({ monto: '', motivo: '' });
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    // El error viejo se limpia cuando llega la respuesta, no antes.
    try {
      const [l, b] = await Promise.all([rutaApi.liquidacion(mes, dueno ? promotor : undefined), rutaApi.libro(dueno ? promotor : undefined)]);
      setError(''); setLiq(l); setAsientos(b.asientos);
    } catch (e) {
      setLiq(null); setAsientos(null);
      setError(e.status === 400 ? e.message : 'No se pudo cargar el libro. Revisa tu conexión y vuelve a intentar.');
    }
  }, [mes, promotor, dueno]);
  useEffect(() => { cargar(); }, [cargar]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(liq.texto); setAviso('Liquidación copiada.'); } catch { setAviso('No se pudo copiar: selecciona el texto de abajo.'); }
  };

  const registrar = async (tipo) => {
    setError(''); setAviso('');
    const datos = tipo === 'pago'
      ? { promotor, monto: centimos(pago.monto), referencia: pago.referencia.trim() }
      : { promotor, monto: centimos(ajuste.monto), motivo: ajuste.motivo.trim() };
    if (!Number.isFinite(datos.monto) || datos.monto === 0) { setError('Escribe un monto válido.'); return; }
    setEnviando(true);
    try {
      if (tipo === 'pago') { await rutaApi.pagar(datos); setPago({ monto: '', referencia: '' }); setAviso('Pago asentado.'); }
      else { await rutaApi.ajustar(datos); setAjuste({ monto: '', motivo: '' }); setAviso('Ajuste asentado.'); }
      await cargar(); alCambiar?.();
    } catch (e) {
      // Si no se vio la respuesta, NO se reintenta: se relee el libro para ver si quedó.
      setError([400, 409].includes(e.status) ? e.message : 'No se pudo confirmar. Revisa el libro antes de volver a intentarlo.');
      await cargar();
    } finally { setEnviando(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 19, margin: 0 }}>Liquidación y libro de comisiones</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <label style={s.etiqueta}>Mes<input type="month" style={{ ...s.input, width: 170 }} value={mes} onChange={(e) => setMes(e.target.value)} /></label>
        {dueno && (
          <label style={s.etiqueta}>Promotor
            <select style={{ ...s.input, width: 170 }} value={promotor} onChange={(e) => setPromotor(e.target.value)}>
              {promotores.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        {liq && <button type="button" style={s.boton} onClick={copiar}>Copiar liquidación</button>}
      </div>
      {error && <div style={{ color: '#C0392B', fontSize: 13 }}>{error}</div>}
      {aviso && <div style={{ color: 'var(--text-2)', fontSize: 13 }}>{aviso}</div>}

      {liq && (
        <div style={{ ...s.tarjeta, fontSize: 13.5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 8 }}>
            {[['Saldo al empezar el mes', liq.saldoInicial], ['Movimiento del mes', liq.movimiento], ['Saldo por pagar al cierre', liq.saldoFinal]].map(([t, v]) => (
              <div key={t}><div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>{t}</div><div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{soles(v)}</div></div>
            ))}
          </div>
          <textarea readOnly value={liq.texto} style={{ ...s.input, minHeight: 120, fontSize: 13 }} onFocus={(e) => e.target.select()} />
        </div>
      )}

      {dueno && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
          <div style={{ ...s.tarjeta, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b>Registrar pago a {promotor}</b>
            <input style={s.input} inputMode="decimal" placeholder="Monto transferido (S/)" value={pago.monto} onChange={(e) => setPago((p) => ({ ...p, monto: e.target.value }))} />
            <input style={s.input} placeholder="N.º de operación y recibo por honorarios" value={pago.referencia} onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))} />
            <button type="button" disabled={enviando} style={{ ...s.boton, ...s.primario }} onClick={() => registrar('pago')}>Asentar pago</button>
          </div>
          <div style={{ ...s.tarjeta, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b>Ajuste manual</b>
            <input style={s.input} inputMode="decimal" placeholder="Monto (S/; negativo descuenta)" value={ajuste.monto} onChange={(e) => setAjuste((a) => ({ ...a, monto: e.target.value }))} />
            <input style={s.input} placeholder="Motivo (sale en la liquidación)" value={ajuste.motivo} onChange={(e) => setAjuste((a) => ({ ...a, motivo: e.target.value }))} />
            <button type="button" disabled={enviando} style={s.boton} onClick={() => registrar('ajuste')}>Asentar ajuste</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto', ...s.tarjeta, padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 600 }}>
          <thead><tr>{['Fecha', 'Cliente', 'Concepto', 'Asiento', 'Monto', 'Motivo / referencia'].map((h, i) => (
            <th key={h} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-c)' }}>{h}</th>))}</tr></thead>
          <tbody>
            {asientos === null ? <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-3)' }}>{error ? '—' : 'Cargando…'}</td></tr>
              : asientos.length ? asientos.map((a) => (
                <tr key={a.id}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-c)', whiteSpace: 'nowrap' }}>{dia(a.creadoEn)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-c)' }}>{a.visita?.nombre || '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-c)' }}>{CONCEPTO[a.concepto] || a.concepto}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-c)' }}>{a.tipo.toLowerCase()}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-c)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: a.monto < 0 ? '#C0392B' : 'var(--text)' }}>{soles(a.monto)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-c)', color: 'var(--text-2)' }}>{[a.tipo !== 'GENERADA' ? a.motivo : null, a.referencia].filter(Boolean).join(' · ') || ''}</td>
                </tr>
              )) : <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-2)' }}>Todavía no hay asientos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
