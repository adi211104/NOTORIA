'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import Icon from '../../../components/Icons';
import { API_URL, cabecerasAuth } from '../../../lib/api';

const getToken = () => localStorage.getItem('bs_token');

// Notoria factura solo en Perú, así que el país fiscal no se pregunta: va fijo.
// El backend (lib/tributario.js) sigue soportando receptores del exterior como
// exportación de servicios, de modo que reabrirlo es volver a mostrar el campo.
const PAIS_FISCAL = 'PE';

const TEXTOS = {
  es: {
    titulo: 'Facturación',
    sub: 'Historial de los pagos realizados en tu cuenta',
    plan: { GRATIS: 'Plan Gratuito', NEGOCIO: 'Plan Negocio', FRANQUICIA: 'Plan Franquicia' },
    periodo: { mensual: 'mensual', anual: 'anual' },
    tipo: { INICIAL: 'Primer cobro', RENOVACION: 'Renovación' },
    estado: { EXITOSO: 'Pagado', FALLIDO: 'Fallido', REEMBOLSADO: 'Reembolsado' },
    columnas: { fecha: 'Fecha', concepto: 'Concepto', titular: 'Titular', tarjeta: 'Tarjeta', monto: 'Monto', estado: 'Estado', comprobante: 'Comprobante' },
    notaTarjeta: 'Por seguridad solo mostramos los primeros 4 dígitos de la tarjeta (identifican al banco emisor), nunca el número completo.',
    datosTitulo: 'Datos de facturación',
    datosSub: 'Con estos datos emitimos tus comprobantes. Si los cambias, solo aplican a los cobros futuros.',
    campoPais: 'País', campoDoc: 'Documento', campoNumero: 'Número', campoRazon: 'Razón social o nombre completo', campoDireccion: 'Dirección (opcional)',
    guardar: 'Guardar datos', guardando: 'Guardando…', guardado: 'Datos actualizados',
    docRUC: 'RUC', docDNI: 'DNI', docExtranjero: 'Sin documento peruano',
    notaIgv: 'Los precios incluyen IGV (18%) para clientes en Perú.',
    notaExportacion: 'Al estar fuera de Perú tus pagos no llevan IGV: se emiten como exportación de servicios.',
    descargar: 'Descargar',
    sinComprobante: '—',
    sinPagosTitulo: 'Aún no tienes pagos registrados',
    sinPagosDescGratis: 'Estás en el Plan Gratuito. Cuando actives un plan de pago, cada cobro aparecerá aquí con la fecha, el monto y la tarjeta usada.',
    sinPagosDescPago: 'Tu primer cobro aparecerá aquí en cuanto se procese.',
    verPlanes: 'Ver planes →',
    errorCarga: 'No se pudo cargar tu historial de pagos. Intenta de nuevo más tarde.',
  },
  en: {
    titulo: 'Billing',
    sub: 'History of payments made on your account',
    plan: { GRATIS: 'Free plan', NEGOCIO: 'Business plan', FRANQUICIA: 'Franchise plan' },
    periodo: { mensual: 'monthly', anual: 'yearly' },
    tipo: { INICIAL: 'First charge', RENOVACION: 'Renewal' },
    estado: { EXITOSO: 'Paid', FALLIDO: 'Failed', REEMBOLSADO: 'Refunded' },
    columnas: { fecha: 'Date', concepto: 'Details', titular: 'Cardholder', tarjeta: 'Card', monto: 'Amount', estado: 'Status', comprobante: 'Receipt' },
    notaTarjeta: 'For security we only show the first 4 digits of the card (they identify the issuing bank), never the full card number.',
    datosTitulo: 'Billing details',
    datosSub: 'We issue your receipts with these details. Changing them only applies to future charges.',
    campoPais: 'Country', campoDoc: 'ID type', campoNumero: 'Number', campoRazon: 'Company or full name', campoDireccion: 'Address (optional)',
    guardar: 'Save details', guardando: 'Saving…', guardado: 'Details updated',
    docRUC: 'RUC', docDNI: 'DNI', docExtranjero: 'No Peruvian ID',
    notaIgv: 'Prices include 18% VAT (IGV) for customers in Peru.',
    notaExportacion: 'Outside Peru your payments carry no VAT: they are issued as an export of services.',
    descargar: 'Download',
    sinComprobante: '—',
    sinPagosTitulo: 'You don’t have any payments yet',
    sinPagosDescGratis: 'You’re on the Free plan. Once you activate a paid plan, every charge will show up here with its date, amount and the card used.',
    sinPagosDescPago: 'Your first charge will show up here once it’s processed.',
    verPlanes: 'View plans →',
    errorCarga: 'We couldn’t load your billing history. Try again later.',
  },
};

const ESTADO_COLOR = {
  EXITOSO: { bg: 'rgba(11,115,36,0.12)', color: '#4CAF66' },
  FALLIDO: { bg: 'rgba(183,64,64,0.12)', color: '#e06565' },
  REEMBOLSADO: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
};

const inputEstilo = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border-c)', borderRadius: 9,
  padding: '9px 12px', fontSize: 13.5, color: 'var(--text)', outline: 'none',
};
const labelEstilo = { display: 'block', fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 5 };

// Datos con los que se emiten los comprobantes. El país decide si el cobro
// lleva IGV (Perú) o se emite como exportación de servicios (resto del mundo).
function DatosFacturacion({ t }) {
  const [datos, setDatos] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [errorForm, setErrorForm] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/pagos/datos-fiscales`, { headers: { ...cabecerasAuth() } })
      .then(r => r.json())
      .then(d => setDatos({
        paisFiscal: PAIS_FISCAL,
        docTipo: d?.docTipo || '6',
        docNumero: d?.docNumero || '',
        razonSocial: d?.razonSocial || d?.nombre || '',
        direccionFiscal: d?.direccionFiscal || '',
      }))
      .catch(() => setDatos({ paisFiscal: PAIS_FISCAL, docTipo: '6', docNumero: '', razonSocial: '', direccionFiscal: '' }));
  }, []);

  if (!datos) return null;
  // Se sigue enviando paisFiscal al backend (lo exige la validación de
  // tributario.js), solo que ya no lo elige el usuario.
  const esPeru = true;
  const set = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });

  const guardar = async () => {
    setGuardando(true); setAviso(''); setErrorForm('');
    try {
      const r = await fetch(`${API_URL}/api/pagos/datos-fiscales`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...cabecerasAuth() },
        body: JSON.stringify(datos),
      });
      const cuerpo = await r.json();
      if (!r.ok) throw new Error(cuerpo?.error || 'error');
      setAviso(t.guardado);
    } catch (e) {
      setErrorForm(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 3px' }}>{t.datosTitulo}</h2>
      <p style={{ color: 'var(--text-3)', fontSize: 12.5, margin: '0 0 16px' }}>{t.datosSub}</p>

      {/* El país fiscal ya no se pide: Notoria factura solo en Perú, así que va
          fijo en PE (ver PAIS_FISCAL arriba y la lógica de lib/tributario.js,
          que sigue distinguiendo venta local de exportación para cuando se
          reabra al exterior). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div>
          <label style={labelEstilo}>{t.campoDoc}</label>
          <select style={inputEstilo} value={esPeru ? datos.docTipo : '0'} disabled={!esPeru} onChange={set('docTipo')}>
            {esPeru ? <option value="6">{t.docRUC}</option> : null}
            {esPeru ? <option value="1">{t.docDNI}</option> : <option value="0">{t.docExtranjero}</option>}
          </select>
        </div>
        <div>
          <label style={labelEstilo}>{t.campoNumero}</label>
          <input style={inputEstilo} value={datos.docNumero} onChange={set('docNumero')}
            placeholder={esPeru ? (datos.docTipo === '6' ? '20123456789' : '45678912') : ''} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelEstilo}>{t.campoRazon}</label>
          <input style={inputEstilo} value={datos.razonSocial} onChange={set('razonSocial')} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelEstilo}>{t.campoDireccion}</label>
          <input style={inputEstilo} value={datos.direccionFiscal} onChange={set('direccionFiscal')} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={guardar} disabled={guardando} style={{
          background: '#0B7324', color: '#fff', border: 'none', borderRadius: 9,
          padding: '9px 20px', fontWeight: 600, fontSize: 13, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1,
        }}>
          {guardando ? t.guardando : t.guardar}
        </button>
        {aviso && <span style={{ color: '#4CAF66', fontSize: 12.5 }}>{aviso}</span>}
        {errorForm && <span style={{ color: '#e06565', fontSize: 12.5 }}>{errorForm}</span>}
      </div>

      <p style={{ color: 'var(--text-3)', fontSize: 11.5, margin: '12px 0 0', lineHeight: 1.5 }}>
        {esPeru ? t.notaIgv : t.notaExportacion}
      </p>
    </div>
  );
}

export default function FacturacionPage() {
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [pagos, setPagos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/pagos/historial`, { headers: { ...cabecerasAuth() } })
      .then(r => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(data => setPagos(Array.isArray(data) ? data : []))
      .catch(() => setError(t.errorCarga))
      .finally(() => setCargando(false));
  }, [t.errorCarga]);

  // El PDF va detrás del token, así que no sirve un <a href> directo: se pide
  // con el header de sesión y se entrega como blob.
  const descargarComprobante = async (comprobante) => {
    try {
      const r = await fetch(`${API_URL}/api/pagos/comprobantes/${comprobante.id}/pdf`, {
        headers: { ...cabecerasAuth() },
      });
      if (!r.ok) throw new Error('http');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Notoria-${comprobante.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t.errorCarga);
    }
  };

  const formatFecha = (iso) => new Date(iso).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const formatMonto = (centimos, moneda) => {
    try {
      return new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-PE', { style: 'currency', currency: moneda || 'PEN' })
        .format((centimos || 0) / 100);
    } catch {
      return `${((centimos || 0) / 100).toFixed(2)} ${moneda || ''}`;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{t.titulo}</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 14, margin: 0 }}>{t.sub}</p>
      </div>

      <DatosFacturacion t={t} />

      {cargando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div style={{ background: 'rgba(183,64,64,0.08)', border: '1px solid rgba(183,64,64,0.3)', color: '#e06565', borderRadius: 12, padding: '14px 18px', fontSize: 13 }}>
          {error}
        </div>
      ) : pagos.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Icon name="tarjeta" size={40} color="var(--text-3)" />
          </div>
          <p style={{ color: 'var(--text)', fontWeight: 600, margin: '0 0 6px' }}>{t.sinPagosTitulo}</p>
          <p style={{ color: 'var(--text-2)', fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
            {usuario?.plan === 'GRATIS' ? t.sinPagosDescGratis : t.sinPagosDescPago}
          </p>
          {usuario?.plan === 'GRATIS' && (
            <Link href="/dashboard/planes" style={{
              display: 'inline-block', marginTop: 16, background: '#0B7324', color: '#fff',
              padding: '10px 22px', borderRadius: 10, fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
            }}>
              {t.verPlanes}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-c)' }}>
                    {[t.columnas.fecha, t.columnas.concepto, t.columnas.titular, t.columnas.tarjeta, t.columnas.monto, t.columnas.estado, t.columnas.comprobante].map((h, i) => (
                      <th key={i} style={{ textAlign: i >= 4 ? 'right' : 'left', padding: '12px 18px', fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p, i) => {
                    const est = ESTADO_COLOR[p.estado] || ESTADO_COLOR.EXITOSO;
                    return (
                      <tr key={p.id} style={{ borderBottom: i < pagos.length - 1 ? '1px solid var(--border-c)' : 'none' }}>
                        <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatFecha(p.creadoEn)}</td>
                        <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text)' }}>
                          <div style={{ fontWeight: 600 }}>{t.plan[p.plan] || p.plan}</div>
                          <div style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{t.tipo[p.tipo] || p.tipo} · {t.periodo[p.periodo] || p.periodo}</div>
                        </td>
                        <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text)' }}>{p.titular}</td>
                        <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {p.tarjetaInicio ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                              <Icon name="tarjeta" size={13} color="var(--text-3)" />
                              {p.tarjetaInicio} •••• •••• ••••
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text)', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {formatMonto(p.monto, p.moneda)}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <span style={{ background: est.bg, color: est.color, borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {t.estado[p.estado] || p.estado}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {p.comprobante ? (
                            <button onClick={() => descargarComprobante(p.comprobante)} style={{
                              background: 'transparent', border: '1px solid var(--border-c)', borderRadius: 8,
                              padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
                            }} title={p.comprobante.numero}>
                              {t.descargar}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{t.sinComprobante}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 11.5, margin: '14px 4px 0', lineHeight: 1.5 }}>{t.notaTarjeta}</p>
        </>
      )}
    </div>
  );
}
