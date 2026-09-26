'use client';

// Ruta comercial — registro de visitas del promotor y su comisión.
//
// Pensada para el celular y para alguien que acaba de salir de un local: lo
// único obligatorio es el nombre, «cómo terminó» es un toque, y el correo del
// cliente solo aparece cuando hace falta. La comisión NO se escribe acá: la
// calcula el backend con los pagos reales de la cuenta cuyo correo se anotó
// (lib/rutaComercial.js), así no hay nada que el dueño tenga que llevar a mano
// salvo lo que ya le pagó al promotor.
//
// Solo en español a propósito: es una herramienta interna de una persona.

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { rutaApi, utils } from '../../lib/api';

const ESTADOS = [
  ['visitado', 'Solo visité'], ['interesado', 'Interesado'], ['volver', 'Volver otro día'],
  ['cuenta_gratis', 'Creó cuenta gratis'], ['cliente', 'Pagó'], ['no_interesado', 'No le interesa'],
];
const ETIQUETA = Object.fromEntries(ESTADOS);
const PLAN = { IMPULSO: 'Impulso', NEGOCIO: 'Negocio', FRANQUICIA: 'Franquicia' };
const COMISION = {
  GANADA: 'Ganada', ESPERA_2DO_PAGO: 'Espera el 2.º pago', ESPERA_15_DIAS: 'Espera 15 días',
  ANULADA: 'Anulada (reembolso)', YA_ERA_CLIENTE: 'Ya era cliente', FUERA_DE_PLAZO: 'Pagó después de 60 días',
  SIN_PAGOS: 'Aún no paga', PLAN_DESCONOCIDO: 'Plan sin tarifa',
};
const soles = (c) => 'S/' + ((c || 0) / 100).toFixed(2);
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : '—');
const colorEstado = (e) => ({
  cliente: ['var(--accent-t)', 'var(--accent)'], no_interesado: ['rgba(220,60,50,.12)', '#C0392B'],
  interesado: ['rgba(40,90,160,.12)', '#2E6BB8'], cuenta_gratis: ['rgba(200,140,20,.14)', '#B7791F'],
  volver: ['rgba(200,140,20,.14)', '#B7791F'],
}[e] || ['var(--surface2)', 'var(--text-2)']);

const VACIO = { nombre: '', distrito: '', contacto: '', notas: '', estado: 'visitado', correo: '', placeId: '', direccion: '', comisionPagada: '' };
// Lo que se muestra: el backend lo corrige con los pagos reales (si pagó, «Pagó»),
// así el promotor no tiene que volver a cambiar el estado a mano.
const estadoDe = (v) => v.estadoAuto || v.estado;
// «Av. Larco 123, Miraflores 15074, Perú» → «Miraflores».
const distritoDe = (direccion = '') => {
  const partes = direccion.split(',').map((x) => x.trim()).filter(Boolean);
  return partes.length >= 3 ? partes[partes.length - 2].replace(/\s*\d+$/, '') : '';
};

const s = {
  pagina: { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '20px 16px 80px' },
  caja: { maxWidth: 860, margin: '0 auto' },
  tarjeta: { background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 12, padding: '12px 14px' },
  // Sin los atajos `font` y `border`: los botones cambian `fontWeight` y `borderColor` al
  // seleccionarse, y mezclar atajo con propiedad suelta deja el borde viejo pegado al re-renderizar.
  boton: { fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', cursor: 'pointer', borderRadius: 10,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-c)', background: 'var(--surface)', color: 'var(--text)', padding: '9px 14px' },
  primario: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', fontWeight: 700 },
  input: { font: 'inherit', width: '100%', color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 9, padding: '10px 11px', fontSize: 16 },
  etiqueta: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 },
};

export default function RutaComercial() {
  const { usuario, cargando } = useAuth();
  const router = useRouter();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [sinAcceso, setSinAcceso] = useState(false);
  const [tab, setTab] = useState('locales');
  const [filtro, setFiltro] = useState('todos');
  const [form, setForm] = useState(null); // null = cerrado; { ...campos, id? }
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [copiado, setCopiado] = useState('');
  const [busqueda, setBusqueda] = useState({ q: '', resultados: null, cargando: false, error: '' });

  const cargar = useCallback(async () => {
    try { setDatos(await rutaApi.listar()); setError(''); }
    catch (e) {
      if (e.status === 404) setSinAcceso(true);
      else setError('No pudimos cargar las visitas. Revisa tu conexión y vuelve a intentar.');
    }
  }, []);

  useEffect(() => {
    if (cargando) return;
    if (!usuario) { router.replace('/login?next=/ruta'); return; }
    cargar();
  }, [cargando, usuario, router, cargar]);

  if (cargando || (!datos && !sinAcceso && !error)) {
    return <div style={s.pagina}><div style={{ ...s.caja, color: 'var(--text-3)' }}>Cargando…</div></div>;
  }
  if (sinAcceso) {
    return <div style={s.pagina}><div style={{ ...s.caja, ...s.tarjeta }}>Esta página no está disponible para tu cuenta.</div></div>;
  }

  const visitas = datos?.visitas || [];
  const dueno = !!datos?.yo?.dueno;
  const tot = visitas.reduce((t, v) => {
    t.ganada += v.comision.ganada; t.porGanar += v.comision.porGanar; t.pagada += v.comisionPagada || 0;
    if (v.comision.pagosCobrados > 0 && !['YA_ERA_CLIENTE', 'FUERA_DE_PLAZO', 'ANULADA'].includes(v.comision.estado)) t.clientes += 1;
    return t;
  }, { ganada: 0, porGanar: 0, pagada: 0, clientes: 0 });
  const conCuenta = (e) => visitas.filter((v) => estadoDe(v) === e).length;
  const visibles = visitas.filter((v) => filtro === 'todos' || estadoDe(v) === filtro);
  const conComision = visitas.filter((v) => v.comision.pagosCobrados > 0 || v.comisionPagada > 0);

  const abrir = (v) => {
    setConfirmarBorrar(false); setError(''); setBusqueda({ q: '', resultados: null, cargando: false, error: '' });
    setForm(v ? { id: v.id, nombre: v.nombre, distrito: v.distrito || '', contacto: v.contacto || '', notas: v.notas || '',
      estado: estadoDe(v), correo: v.correo || '', placeId: v.placeId || '', direccion: v.direccion || '', comisionPagada: v.comisionPagada ? (v.comisionPagada / 100).toFixed(2) : '' } : { ...VACIO });
  };
  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const buscarEnMaps = async (e) => {
    e?.preventDefault();
    const q = busqueda.q.trim();
    if (q.length < 3) { setBusqueda((b) => ({ ...b, error: 'Escribe al menos 3 letras.' })); return; }
    setBusqueda((b) => ({ ...b, cargando: true, error: '', resultados: null }));
    try { const r = await utils.buscarNegocio(q, '', 'pe'); setBusqueda((b) => ({ ...b, cargando: false, resultados: r || [] })); }
    catch { setBusqueda((b) => ({ ...b, cargando: false, error: 'No se pudo buscar en Google Maps. Puedes registrar la visita igual.' })); }
  };
  const elegirLocal = (r) => {
    setForm((f) => ({ ...f, placeId: r.placeId, direccion: r.direccion || '', nombre: r.nombre || f.nombre,
      distrito: f.distrito || distritoDe(r.direccion) }));
    setBusqueda({ q: '', resultados: null, cargando: false, error: '' });
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('Escribe el nombre del local.'); return; }
    if (form.estado === 'cliente' && !form.correo.trim() && !form.placeId) { setError('Busca el local en Google Maps o anota el correo de su cuenta en Notoria: así se comprueba que la venta es tuya.'); return; }
    const cuerpo = { nombre: form.nombre, distrito: form.distrito, contacto: form.contacto, notas: form.notas, estado: form.estado, correo: form.correo,
      placeId: form.placeId, direccion: form.direccion };
    if (dueno && form.id && form.comisionPagada !== '') cuerpo.comisionPagada = Math.round(parseFloat(String(form.comisionPagada).replace(',', '.')) * 100) || 0;
    setGuardando(true); setError('');
    try {
      if (form.id) await rutaApi.actualizar(form.id, cuerpo); else await rutaApi.crear(cuerpo);
      setForm(null); await cargar();
    } catch (err) { setError(err.status === 400 ? err.message : 'No se pudo guardar. Revisa tu conexión y vuelve a intentar.'); }
    finally { setGuardando(false); }
  };
  const borrar = async () => {
    try { await rutaApi.borrar(form.id); setForm(null); await cargar(); } catch { setError('No se pudo borrar.'); }
  };

  const copiarResumen = async () => {
    const lineas = conComision.map((v) => `• ${v.nombre}${v.comision.plan ? ` (${PLAN[v.comision.plan] || v.comision.plan} ${v.comision.periodo})` : ''}: ganada ${soles(v.comision.ganada)}, pagada ${soles(v.comisionPagada)} — ${COMISION[v.comision.estado] || v.comision.estado}`);
    const texto = `Comisiones Notoria — ${datos.yo.alias} al ${new Date().toLocaleDateString('es-PE')}\n${lineas.join('\n') || 'Sin clientes aún.'}\n\nGanada: ${soles(tot.ganada)}\nPagada: ${soles(tot.pagada)}\nSaldo por pagar: ${soles(tot.ganada - tot.pagada)}`;
    try { await navigator.clipboard.writeText(texto); setCopiado('Copiado. Pégalo en WhatsApp.'); }
    catch { setCopiado(texto); }
  };

  return (
    <div style={s.pagina}>
      <div style={s.caja}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, margin: 0 }}>Ruta comercial</h1>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{dueno ? 'Vista del dueño · todas las visitas' : datos.yo.alias}</div>
          </div>
          <button style={{ ...s.boton, ...s.primario }} onClick={() => abrir(null)}>+ Registrar visita</button>
        </div>

        {error && !form && <div style={{ ...s.tarjeta, color: '#C0392B', marginBottom: 12 }}>{error} <button style={s.boton} onClick={cargar}>Reintentar</button></div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>
          {[['Visitados', visitas.length], ['Pagaron', tot.clientes], ['Comisión ganada', soles(tot.ganada), true], ['Por ganar', soles(tot.porGanar)], ['Saldo por pagar', soles(tot.ganada - tot.pagada), true]].map(([t, v, verde]) => (
            <div key={t} style={s.tarjeta}>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 23, fontWeight: 700, color: verde ? 'var(--accent)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border-c)', marginBottom: 12 }}>
          {[['locales', 'Locales'], ['comisiones', 'Comisiones'], ['ayuda', 'Cómo usarla']].map(([id, t]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              style={{ ...s.boton, borderWidth: '0 0 2px 0', borderColor: `transparent transparent ${tab === id ? 'var(--accent)' : 'transparent'} transparent`, borderRadius: 0, background: 'none', fontWeight: 700, color: tab === id ? 'var(--text)' : 'var(--text-3)' }}>{t}</button>
          ))}
        </div>

        {tab === 'locales' && <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {[['todos', `Todos (${visitas.length})`], ...ESTADOS.filter(([v]) => conCuenta(v)).map(([v, t]) => [v, `${t} (${conCuenta(v)})`])].map(([v, t]) => (
              <button key={v} onClick={() => setFiltro(v)} aria-pressed={filtro === v}
                style={{ ...s.boton, padding: '6px 11px', borderRadius: 999, fontSize: 12.5, ...(filtro === v ? { background: 'var(--text)', color: 'var(--bg)', borderColor: 'var(--text)' } : {}) }}>{t}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibles.length ? visibles.map((v) => {
              const [fondo, tinta] = colorEstado(estadoDe(v));
              const c = v.comision;
              const venta = c.pagosCobrados > 0
                ? `${PLAN[c.plan] || c.plan} ${c.periodo} · ${COMISION[c.estado] || c.estado} · ${soles(c.ganada || c.porGanar)}`
                : v.cuentaEncontrada ? `Cuenta creada · aún no paga${v.vinculo === 'maps' ? ' · vinculada por Maps' : ''}`
                  : v.correo ? 'Aún no hay cuenta con ese correo' : v.placeId ? 'Aún no hay cuenta con este local' : '';
              return (
                <button key={v.id} onClick={() => abrir(v)} style={{ ...s.tarjeta, ...s.boton, textAlign: 'left', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div style={{ fontWeight: 700 }}>{v.nombre}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{[v.placeId ? '📍 ' + (v.distrito || 'Google Maps') : v.distrito, v.contacto, `visitado ${fecha(v.fechaVisita)}`, dueno ? v.promotor : null].filter(Boolean).join(' · ')}</div>
                    {dueno && v.correoVinculado && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Cuenta: {v.correoVinculado} · por {v.vinculo === 'maps' ? 'Google Maps' : 'correo'}</div>}
                    {v.notas && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{v.notas}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: fondo, color: tinta, whiteSpace: 'nowrap' }}>{ETIQUETA[estadoDe(v)] || estadoDe(v)}</span>
                    {venta && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{venta}</span>}
                  </div>
                </button>
              );
            }) : <div style={{ ...s.tarjeta, textAlign: 'center', color: 'var(--text-2)', borderStyle: 'dashed', padding: 28 }}>
              {visitas.length ? 'Nada en este filtro.' : 'Aún no hay locales. Toca «+ Registrar visita» después de tu primera visita.'}
            </div>}
          </div>
        </>}

        {tab === 'comisiones' && <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <button style={s.boton} onClick={copiarResumen}>Copiar resumen para WhatsApp</button>
            {copiado && copiado.startsWith('Copiado') && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{copiado}</span>}
          </div>
          {copiado && !copiado.startsWith('Copiado') && <textarea readOnly value={copiado} style={{ ...s.input, minHeight: 140, marginBottom: 10 }} onFocus={(e) => e.target.select()} />}
          <div style={{ overflowX: 'auto', ...s.tarjeta, padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
              <thead><tr>{['Cliente', 'Plan', 'Pagos', 'Estado', 'Ganada', 'Pagada', 'Saldo'].map((h, i) => (
                <th key={h} style={{ textAlign: i > 3 ? 'right' : 'left', padding: '9px 10px', fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-c)' }}>{h}</th>))}</tr></thead>
              <tbody>
                {conComision.length ? conComision.map((v) => (
                  <tr key={v.id}>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border-c)' }}>{v.nombre}</td>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border-c)' }}>{PLAN[v.comision.plan] || '—'} {v.comision.periodo || ''}</td>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border-c)' }}>{v.comision.pagosCobrados}</td>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--border-c)' }}>{COMISION[v.comision.estado] || v.comision.estado}</td>
                    {[v.comision.ganada, v.comisionPagada, v.comision.ganada - v.comisionPagada].map((n, i) => (
                      <td key={i} style={{ padding: '9px 10px', borderBottom: '1px solid var(--border-c)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: i === 2 ? 700 : 400 }}>{soles(n)}</td>))}
                  </tr>
                )) : <tr><td colSpan={7} style={{ padding: 12, color: 'var(--text-2)' }}>Todavía no hay clientes que hayan pagado.</td></tr>}
              </tbody>
            </table>
          </div>
          <ul style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, paddingLeft: 18 }}>
            <li><b>Bono de alta:</b> 50% del primer mes a precio de lista sin IGV (Impulso S/12.29 · Negocio S/25.00 · Franquicia S/75.85, más si suma locales).</li>
            <li><b>Residual:</b> 10% sin IGV de cada pago durante 12 meses (en mensual desde el 2.º pago; en anual, el pago anual).</li>
            <li><b>Se gana:</b> mensual, con el 2.º pago; anual, 15 días después. Si el primer pago se reembolsa, no hay comisión.</li>
            <li>Se calcula sola con los pagos reales del cliente. Manda el contrato firmado.</li>
          </ul>
        </>}

        {tab === 'ayuda' && <div style={{ ...s.tarjeta, fontSize: 14, lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}><b>Después de cada visita</b> toca «+ Registrar visita», <b>busca el local en Google Maps</b> y elígelo, y toca cómo terminó. Si puedes, agrega un contacto y un teléfono.</p>
          <p>Con el local de Maps, la venta se vincula sola cuando el negocio agrega ese mismo local en su panel de Notoria, y el estado pasa solo a «Creó cuenta gratis» o «Pagó».</p>
          <p><b>Si crea su cuenta o paga</b>, anota el <b>correo con el que se registró en Notoria</b>. Con ese correo el sistema encuentra sus pagos y calcula tu comisión solo. Regístralo antes de que pague: la visita cuenta 60 días.</p>
          <p style={{ marginBottom: 0 }}><b>Nunca</b> cobres en efectivo: todo pago va por usenotoria.app con tarjeta.</p>
        </div>}
      </div>

      {form && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', overflowY: 'auto', padding: 16, zIndex: 50 }}>
          <form onSubmit={guardar} noValidate style={{ ...s.tarjeta, maxWidth: 560, margin: '0 auto', padding: 18, background: 'var(--bg)' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, margin: '0 0 12px' }}>{form.id ? form.nombre || 'Visita' : 'Registrar visita'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={s.etiqueta}>Local en Google Maps
                {form.placeId ? (
                  <div style={{ ...s.tarjeta, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', fontWeight: 400 }}>
                    <span style={{ color: 'var(--text)', fontSize: 13.5 }}>📍 <b>{form.nombre}</b>{form.direccion ? <><br /><span style={{ color: 'var(--text-3)' }}>{form.direccion}</span></> : null}</span>
                    <button type="button" style={{ ...s.boton, padding: '6px 10px', fontSize: 13 }} onClick={() => setForm((f) => ({ ...f, placeId: '', direccion: '' }))}>Cambiar</button>
                  </div>
                ) : (<>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={s.input} value={busqueda.q} placeholder="Nombre del local y distrito" autoFocus={!form.id}
                      onChange={(e) => setBusqueda((b) => ({ ...b, q: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') buscarEnMaps(e); }} />
                    <button type="button" style={{ ...s.boton, whiteSpace: 'nowrap' }} onClick={buscarEnMaps} disabled={busqueda.cargando}>{busqueda.cargando ? 'Buscando…' : 'Buscar'}</button>
                  </div>
                  {busqueda.error && <span style={{ fontWeight: 400, color: '#C0392B' }}>{busqueda.error}</span>}
                  {busqueda.resultados && (busqueda.resultados.length ? busqueda.resultados.map((r) => (
                    <button type="button" key={r.placeId} onClick={() => elegirLocal(r)} style={{ ...s.boton, textAlign: 'left', fontWeight: 400, fontSize: 13.5 }}>
                      <b>{r.nombre}</b><br /><span style={{ color: 'var(--text-3)' }}>{r.direccion}</span>
                    </button>
                  )) : <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>No apareció. Prueba con otro nombre o escribe el local abajo.</span>)}
                  <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>Elegirlo aquí vincula la venta sola cuando el negocio lo agregue en su panel.</span>
                </>)}
              </div>
              <label style={s.etiqueta}>Nombre del local *<input style={s.input} value={form.nombre} onChange={cambiar('nombre')} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
                <label style={s.etiqueta}>Distrito<input style={s.input} value={form.distrito} onChange={cambiar('distrito')} /></label>
                <label style={s.etiqueta}>Contacto y teléfono<input style={s.input} value={form.contacto} onChange={cambiar('contacto')} placeholder="Rosa, dueña · 987 654 321" /></label>
              </div>
              <div style={s.etiqueta}>¿Cómo terminó?
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ESTADOS.map(([v, t]) => (
                    <button type="button" key={v} aria-pressed={form.estado === v} onClick={() => setForm((f) => ({ ...f, estado: v }))}
                      style={{ ...s.boton, fontSize: 14, ...(form.estado === v ? { ...s.primario, ...(v === 'no_interesado' ? { background: '#C0392B', borderColor: '#C0392B' } : {}) } : {}) }}>{t}</button>
                  ))}
                </div>
              </div>
              {['cuenta_gratis', 'cliente'].includes(form.estado) && (
                <label style={s.etiqueta}>Correo de su cuenta en Notoria
                  <input style={s.input} type="email" value={form.correo} onChange={cambiar('correo')} placeholder="el que usó al registrarse" autoComplete="off" />
                  <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{form.placeId ? 'Opcional si elegiste el local en Maps, pero ayuda si el negocio se registra con otro local o nombre.' : 'Con este correo se encuentran sus pagos y se calcula tu comisión.'}</span>
                </label>
              )}
              <label style={s.etiqueta}>Nota (opcional)<textarea style={{ ...s.input, minHeight: 64 }} value={form.notas} onChange={cambiar('notas')} placeholder="Qué le interesó, cuándo volver…" /></label>
              {dueno && form.id && (
                <label style={s.etiqueta}>Comisión ya pagada al promotor por este cliente (S/)
                  <input style={s.input} inputMode="decimal" value={form.comisionPagada} onChange={cambiar('comisionPagada')} placeholder="0.00" />
                </label>
              )}
            </div>
            {error && <div style={{ color: '#C0392B', fontSize: 13, marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginTop: 16 }}>
              <div>
                {form.id && !confirmarBorrar && <button type="button" style={{ ...s.boton, color: '#C0392B', borderColor: '#C0392B' }} onClick={() => setConfirmarBorrar(true)}>Borrar</button>}
                {confirmarBorrar && <span style={{ fontSize: 13 }}>¿Seguro? <button type="button" style={{ ...s.boton, color: '#fff', background: '#C0392B', borderColor: '#C0392B' }} onClick={borrar}>Sí, borrar</button> <button type="button" style={s.boton} onClick={() => setConfirmarBorrar(false)}>No</button></span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={s.boton} onClick={() => setForm(null)}>Cancelar</button>
                <button type="submit" disabled={guardando} style={{ ...s.boton, ...s.primario, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
