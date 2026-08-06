'use client';
// Libro de Reclamaciones virtual — Ley 29571 y D.S. 101-2022-PCM.
//
// Va integrado en la web a propósito: la norma (y Culqi, que nos observó por
// esto) no admite que el libro sea un Google Form, un PDF o un enlace externo.
// El formulario postea a nuestro backend, la hoja se guarda en base de datos
// con numeración correlativa y el consumidor recibe su copia por correo.

import { useState } from 'react';
import Link from 'next/link';
import { reclamaciones } from '../../lib/api';
import PieLegal, { CONTACTO } from '../../components/PieLegal';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

const VACIO = {
  nombre: '', docTipo: 'DNI', documento: '', domicilio: '', email: '', telefono: '',
  esMenor: false, apoderado: '',
  tipoBien: 'SERVICIO', descripcion: '', monto: '',
  tipo: 'RECLAMO', detalle: '', pedido: '',
};

const label = { display: 'block', fontSize: 12, fontWeight: 700, color: '#141413', marginBottom: 5 };
const input = {
  width: '100%', padding: '9px 11px', borderRadius: 5, border: '1px solid #D8D6CC',
  fontSize: 13.5, fontFamily: GEO, color: '#141413', background: '#fff', boxSizing: 'border-box',
};

const Campo = ({ etiqueta, hijo, ancho }) => (
  <div style={{ gridColumn: ancho === 'full' ? '1 / -1' : 'auto' }}>
    <label style={label}>{etiqueta}</label>
    {hijo}
  </div>
);

export default function LibroReclamacionesPage() {
  const [f, setF] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);

  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      const r = await reclamaciones.crear(f);
      setExito(r);
      setF(VACIO);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'No pudimos registrar tu reclamación. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F5', fontFamily: GEO }}>
      <nav style={{ borderBottom: '1px solid #E8E6DC', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: '#141413' }}>Notoria</span>
        </Link>
        <Link href="/contacto" style={{ fontSize: 13, color: '#5C5B57', textDecoration: 'none' }}>Contacto →</Link>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '44px 24px 72px' }}>
        {/* Encabezado con los datos del proveedor: la hoja debe identificarlo */}
        <div style={{ border: '2px solid #141413', borderRadius: 8, padding: '18px 20px', marginBottom: 26, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#141413" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#141413', margin: 0, letterSpacing: '-0.6px' }}>Libro de Reclamaciones</h1>
          </div>
          <p style={{ fontSize: 12.5, color: '#5C5B57', lineHeight: 1.7, margin: 0 }}>
            Conforme a lo establecido en el Código de Protección y Defensa del Consumidor
            (Ley N.° 29571) y el D.S. N.° 101-2022-PCM, este establecimiento cuenta con un
            Libro de Reclamaciones virtual a tu disposición.
          </p>
          <div style={{ borderTop: '1px solid #E8E6DC', marginTop: 12, paddingTop: 12, fontSize: 12.5, color: '#5C5B57', lineHeight: 1.8 }}>
            <div><strong>Razón social:</strong> {CONTACTO.razonSocial}</div>
            <div><strong>RUC:</strong> {CONTACTO.ruc}</div>
            <div><strong>Domicilio:</strong> {CONTACTO.direccion}</div>
          </div>
        </div>

        {exito ? (
          <div style={{ background: '#fff', border: `2px solid ${G}`, borderRadius: 8, padding: 26 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: '#141413', margin: '0 0 10px' }}>Tu reclamación fue registrada</h2>
            <p style={{ fontSize: 14, color: '#5C5B57', lineHeight: 1.8, margin: '0 0 14px' }}>
              Número de hoja: <strong style={{ color: G, fontSize: 17 }}>{exito.numero}</strong>
            </p>
            <p style={{ fontSize: 13.5, color: '#5C5B57', lineHeight: 1.8, margin: '0 0 14px' }}>
              {exito.mensaje} Guarda este número: es tu constancia de presentación.
              Enviamos una copia de tu hoja al correo que registraste.
            </p>
            <p style={{ fontSize: 12.5, color: '#9C9B96', lineHeight: 1.7, margin: '0 0 18px' }}>
              La formulación de un reclamo no impide acudir a otras vías de solución de
              controversias ni es requisito previo para denunciar ante el INDECOPI.
            </p>
            <button onClick={() => setExito(null)} style={{ background: G, color: '#fff', border: 'none', borderRadius: 5, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: GEO, cursor: 'pointer' }}>
              Registrar otra reclamación
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} style={{ background: '#fff', border: '1px solid #E8E6DC', borderRadius: 8, padding: 26 }}>
            {error && (
              <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)', color: '#B91C1C', borderRadius: 6, padding: '11px 14px', fontSize: 13.5, marginBottom: 20 }}>{error}</div>
            )}

            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#141413', margin: '0 0 4px' }}>1. Identificación del consumidor reclamante</h2>
            <p style={{ fontSize: 12, color: '#9C9B96', margin: '0 0 16px' }}>Todos los campos son obligatorios salvo los marcados como opcionales.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 26 }}>
              <Campo etiqueta="Nombre completo" hijo={<input style={input} value={f.nombre} onChange={set('nombre')} required maxLength={120} />} />
              <Campo etiqueta="Tipo de documento" hijo={
                <select style={input} value={f.docTipo} onChange={set('docTipo')}>
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de extranjería</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="RUC">RUC</option>
                </select>} />
              <Campo etiqueta="Número de documento" hijo={<input style={input} value={f.documento} onChange={set('documento')} required maxLength={20} />} />
              <Campo etiqueta="Teléfono" hijo={<input style={input} type="tel" value={f.telefono} onChange={set('telefono')} required maxLength={30} />} />
              <Campo etiqueta="Correo electrónico" hijo={<input style={input} type="email" value={f.email} onChange={set('email')} required maxLength={120} />} />
              <Campo etiqueta="Domicilio" ancho="full" hijo={<input style={input} value={f.domicilio} onChange={set('domicilio')} required maxLength={200} />} />
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#5C5B57', cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.esMenor} onChange={set('esMenor')} />
                  El consumidor es menor de edad
                </label>
              </div>
              {f.esMenor && (
                <Campo etiqueta="Nombre del padre, madre o apoderado" ancho="full"
                  hijo={<input style={input} value={f.apoderado} onChange={set('apoderado')} required maxLength={120} />} />
              )}
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#141413', margin: '0 0 16px', borderTop: '1px solid #E8E6DC', paddingTop: 22 }}>2. Identificación del bien contratado</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 26 }}>
              <Campo etiqueta="Tipo" hijo={
                <select style={input} value={f.tipoBien} onChange={set('tipoBien')}>
                  <option value="SERVICIO">Servicio</option>
                  <option value="PRODUCTO">Producto</option>
                </select>} />
              <Campo etiqueta="Monto reclamado en soles (opcional)" hijo={<input style={input} type="number" min="0" step="0.01" value={f.monto} onChange={set('monto')} />} />
              <Campo etiqueta="Descripción de lo contratado" ancho="full"
                hijo={<input style={input} value={f.descripcion} onChange={set('descripcion')} required maxLength={500} placeholder="Ej.: Plan Negocio mensual de monitoreo de reputación" />} />
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#141413', margin: '0 0 6px', borderTop: '1px solid #E8E6DC', paddingTop: 22 }}>3. Detalle de la reclamación</h2>
            <div style={{ background: '#FAF9F5', border: '1px solid #E8E6DC', borderRadius: 6, padding: '12px 14px', margin: '0 0 16px', fontSize: 12.5, color: '#5C5B57', lineHeight: 1.7 }}>
              <strong>Reclamo:</strong> disconformidad relacionada con el servicio contratado.<br/>
              <strong>Queja:</strong> malestar o descontento respecto a la atención al público, no relacionado con el servicio en sí.
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <Campo etiqueta="Tipo" hijo={
                <select style={input} value={f.tipo} onChange={set('tipo')}>
                  <option value="RECLAMO">Reclamo</option>
                  <option value="QUEJA">Queja</option>
                </select>} />
              <Campo etiqueta="Detalle de lo ocurrido"
                hijo={<textarea style={{ ...input, minHeight: 120, resize: 'vertical' }} value={f.detalle} onChange={set('detalle')} required maxLength={3000} />} />
              <Campo etiqueta="Pedido concreto del consumidor"
                hijo={<textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={f.pedido} onChange={set('pedido')} required maxLength={1000} />} />
            </div>

            <p style={{ fontSize: 12, color: '#9C9B96', lineHeight: 1.7, margin: '20px 0 0', borderTop: '1px solid #E8E6DC', paddingTop: 16 }}>
              El proveedor debe dar respuesta al reclamo en un plazo no mayor a <strong>quince (15) días hábiles</strong>,
              improrrogable. La formulación del reclamo no impide acudir a otras vías de solución de
              controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.
              Los datos personales que registres se tratan únicamente para atender tu reclamación,
              conforme a la Ley 29733 y a nuestra <Link href="/privacidad" style={{ color: G }}>Política de Privacidad</Link>.
            </p>

            <button type="submit" disabled={enviando}
              style={{ marginTop: 20, width: '100%', background: enviando ? '#9C9B96' : G, color: '#fff', border: 'none', borderRadius: 5, padding: '13px', fontSize: 15, fontWeight: 700, fontFamily: GEO, cursor: enviando ? 'default' : 'pointer' }}>
              {enviando ? 'Registrando…' : 'Registrar mi reclamación'}
            </button>
          </form>
        )}
      </div>

      <PieLegal />
    </div>
  );
}
