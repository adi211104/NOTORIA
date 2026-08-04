'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import Icon from '../../../components/Icons';
import { utils, negociosApi } from '../../../lib/api';
import LogoNotoria from '../../../components/LogoNotoria';

const TEXTOS = {
  es: {
    preview: {
      encabezado: 'Reporte Mensual de Reputación · Mayo 2026',
      negocioTipo: 'Restaurante · Lima, Perú',
      resumenPeriodo: 'Resumen del período',
      metricas: [
        { label: 'Rating actual', val: '★ 3.8', sub: 'de 5.0', color: '#f59e0b' },
        { label: 'Variación', val: '▼ -0.2', sub: 'vs. abril', color: '#ef4444' },
        { label: 'Total reseñas', val: '1,562', sub: 'en Google', color: '#0B7324' },
        { label: 'Alertas del mes', val: '3', sub: '1 crítica', color: '#f97316' },
      ],
      evolucionTitulo: 'Evolución del rating — últimos 6 meses',
      mesesGrafica: [
        { mes: 'Dic', val: 4.2 }, { mes: 'Ene', val: 4.1 }, { mes: 'Feb', val: 4.0 },
        { mes: 'Mar', val: 4.0 }, { mes: 'Abr', val: 4.0 }, { mes: 'May', val: 3.8 },
      ],
      tendencia: 'Tendencia negativa: el rating cayó 0.4 puntos en 3 meses consecutivos',
      distribucionTitulo: 'Distribución de reseñas',
      alertasPeriodoTitulo: 'Alertas del período',
      alertasPeriodo: [
        { tipo: 'Pico de negativos', fecha: '12 May', color: '#fef2f2', border: '#fecaca' },
        { tipo: 'Cuentas sospechosas', fecha: '18 May', color: '#fef2f2', border: '#fecaca' },
        { tipo: 'Caída de rating', fecha: '28 May', color: '#fff7ed', border: '#fed7aa' },
      ],
      sospechosasTitulo: 'Reseñas sospechosas detectadas',
      sospechosas: [
        { autor: 'Usuario_X1829', stars: 1, texto: '"Pésimo servicio, nunca vuelvo."', motivo: 'Cuenta nueva · 1 reseña total' },
        { autor: 'AnonymousUser', stars: 1, texto: '"Horrible, la comida llegó fría."', motivo: 'Sin foto de perfil · Texto duplicado' },
      ],
      recomendacionesTitulo: 'Recomendaciones personalizadas',
      recomendaciones: [
        { c: '#ef4444', texto: 'Urgente: reporta las 2 reseñas sospechosas en Google Maps esta semana. Podrían eliminarse en 5-7 días hábiles.' },
        { c: '#f59e0b', texto: 'Tu rating de 3.8 está por debajo del 4.0 ideal. Responde las últimas 10 reseñas negativas con soluciones concretas.' },
        { c: '#22c55e', texto: 'Comparte tu enlace de Google Reviews con clientes satisfechos. Necesitas 40+ reseñas de 5★ para recuperar el 4.0.' },
      ],
      footerGenerado: 'Generado por Notoria · 1 de junio de 2026',
      footerPagina: 'Página 1 de 3',
      verCompleto: 'Ver reporte completo — disponible en Plan Negocio',
    },
    gratis: {
      titulo: 'Reportes PDF',
      sub: 'Documentos profesionales mensuales de tu reputación',
      cardTitulo: 'Reportes automáticos que trabajan mientras tú descansas',
      cardTexto: 'El día 1 de cada mes, Notoria genera un PDF profesional con todo lo que pasó con tu reputación y lo envía directo a tu email.',
      activarCta: 'Activar con Plan Negocio — S/59/mes',
      beneficios: [
        { ico: 'grafica', t: 'Evolución mensual completa', d: 'Gráficas de rating, volumen de reseñas y tendencias. Todo en un documento sin entrar al dashboard.' },
        { ico: 'manos', t: 'Documento para socios e inversores', d: 'Un PDF con logo y datos reales que puedes presentar en reuniones de negocio o a entidades financieras.' },
        { ico: 'sirena', t: 'Resumen de ataques detectados', d: 'Si hubo reseñas falsas o picos sospechosos, el reporte documenta exactamente qué pasó y cuándo.' },
        { ico: 'foco', t: 'Recomendaciones personalizadas', d: 'No solo datos: cada reporte incluye 3 acciones concretas para mejorar tu reputación ese mes.' },
      ],
      verPlanes: 'Ver todos los planes →',
      ejemploReal: 'EJEMPLO DE REPORTE REAL',
    },
    pago: {
      titulo: 'Reportes PDF',
      sub: 'Se generan y se envían directo a tu email — no quedan guardados en el panel.',
      generando: 'Generando...',
      generarAhora: 'Generar ahora',
      mensajeGenerado: 'Reporte generado. Lo recibirás en tu email en unos minutos.',
      errorGenerar: 'No se pudo generar el reporte. Intenta de nuevo.',
      sinNegocios: 'Agrega un negocio primero para poder generar un reporte.',
      proximoTitulo: 'Próximo reporte automático',
      proximoTexto: (fecha, mesDatos) => <>El <strong style={{ color: 'var(--text)' }}>{fecha}</strong> recibirás en tu email el reporte con los datos de {mesDatos}, para cada uno de tus negocios.</>,
    },
  },

  en: {
    preview: {
      encabezado: 'Monthly Reputation Report · May 2026',
      negocioTipo: 'Restaurant · Lima, Peru',
      resumenPeriodo: 'Period summary',
      metricas: [
        { label: 'Current rating', val: '★ 3.8', sub: 'of 5.0', color: '#f59e0b' },
        { label: 'Change', val: '▼ -0.2', sub: 'vs. April', color: '#ef4444' },
        { label: 'Total reviews', val: '1,562', sub: 'on Google', color: '#0B7324' },
        { label: 'Alerts this month', val: '3', sub: '1 critical', color: '#f97316' },
      ],
      evolucionTitulo: 'Rating evolution — last 6 months',
      mesesGrafica: [
        { mes: 'Dec', val: 4.2 }, { mes: 'Jan', val: 4.1 }, { mes: 'Feb', val: 4.0 },
        { mes: 'Mar', val: 4.0 }, { mes: 'Apr', val: 4.0 }, { mes: 'May', val: 3.8 },
      ],
      tendencia: 'Negative trend: rating dropped 0.4 points over 3 consecutive months',
      distribucionTitulo: 'Review distribution',
      alertasPeriodoTitulo: 'Alerts for the period',
      alertasPeriodo: [
        { tipo: 'Spike in negatives', fecha: 'May 12', color: '#fef2f2', border: '#fecaca' },
        { tipo: 'Suspicious accounts', fecha: 'May 18', color: '#fef2f2', border: '#fecaca' },
        { tipo: 'Rating drop', fecha: 'May 28', color: '#fff7ed', border: '#fed7aa' },
      ],
      sospechosasTitulo: 'Suspicious reviews detected',
      sospechosas: [
        { autor: 'Usuario_X1829', stars: 1, texto: '"Terrible service, never coming back."', motivo: 'New account · 1 total review' },
        { autor: 'AnonymousUser', stars: 1, texto: '"Horrible, the food arrived cold."', motivo: 'No profile photo · Duplicate text' },
      ],
      recomendacionesTitulo: 'Personalized recommendations',
      recomendaciones: [
        { c: '#ef4444', texto: 'Urgent: report the 2 suspicious reviews on Google Maps this week. They could be removed within 5-7 business days.' },
        { c: '#f59e0b', texto: 'Your 3.8 rating is below the ideal 4.0. Reply to the last 10 negative reviews with concrete solutions.' },
        { c: '#22c55e', texto: 'Share your Google Reviews link with satisfied customers. You need 40+ 5★ reviews to get back to 4.0.' },
      ],
      footerGenerado: 'Generated by Notoria · June 1, 2026',
      footerPagina: 'Page 1 of 3',
      verCompleto: 'See the full report — available on the Business plan',
    },
    gratis: {
      titulo: 'PDF Reports',
      sub: 'Professional monthly reports on your reputation',
      cardTitulo: 'Automatic reports that work while you rest',
      cardTexto: 'On the 1st of every month, Notoria generates a professional PDF with everything that happened to your reputation and sends it straight to your inbox.',
      activarCta: 'Activate with the Business Plan — S/59/mo',
      beneficios: [
        { ico: 'grafica', t: 'Complete monthly evolution', d: 'Rating, review volume and trend charts. All in one document, no dashboard required.' },
        { ico: 'manos', t: 'A document for partners and investors', d: 'A PDF with your logo and real data you can present in business meetings or to financial institutions.' },
        { ico: 'sirena', t: 'Summary of detected attacks', d: 'If there were fake reviews or suspicious spikes, the report documents exactly what happened and when.' },
        { ico: 'foco', t: 'Personalized recommendations', d: 'Not just data: every report includes 3 concrete actions to improve your reputation that month.' },
      ],
      verPlanes: 'See all plans →',
      ejemploReal: 'EXAMPLE OF A REAL REPORT',
    },
    pago: {
      titulo: 'PDF Reports',
      sub: 'Generated and emailed straight to you — nothing is stored in the dashboard.',
      generando: 'Generating...',
      generarAhora: 'Generate now',
      mensajeGenerado: 'Report generated. You will receive it in your email in a few minutes.',
      errorGenerar: 'Could not generate the report. Please try again.',
      sinNegocios: 'Add a business first to be able to generate a report.',
      proximoTitulo: 'Next automatic report',
      proximoTexto: (fecha, mesDatos) => <>On <strong style={{ color: 'var(--text)' }}>{fecha}</strong> you will get by email the report with {mesDatos}&apos;s data, for each of your businesses.</>,
    },
  },
};

const MiniBar = ({ val, max = 5, color }) => (
  <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
    <div style={{ width: `${(val / max) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
  </div>
);

const PreviewPDF = () => {
  const { idioma } = useIdioma();
  const p = (TEXTOS[idioma] || TEXTOS.es).preview;
  return (
  <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#111827' }}>
    {/* Header */}
    <div style={{ background: 'linear-gradient(135deg, #063B12, #0B7324)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><LogoNotoria size={15} color="#fff" /> Notoria</p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '3px 0 0' }}>{p.encabezado}</p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: 0 }}>KFC San Isidro</p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, margin: '2px 0 0' }}>{p.negocioTipo}</p>
      </div>
    </div>

    <div style={{ padding: '16px 20px' }}>
      {/* Métricas principales */}
      <p style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>{p.resumenPeriodo}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(70px,1fr))', gap: 8, marginBottom: 16 }}>
        {p.metricas.map((m, i) => (
          <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', border: '1px solid #f3f4f6' }}>
            <p style={{ color: '#9ca3af', fontSize: 10, margin: '0 0 4px' }}>{m.label}</p>
            <p style={{ color: m.color, fontWeight: 700, fontSize: 16, margin: '0 0 2px' }}>{m.val}</p>
            <p style={{ color: '#d1d5db', fontSize: 10, margin: 0 }}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Gráfica de rating */}
      <p style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>{p.evolucionTitulo}</p>
      <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px', marginBottom: 14, border: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
          {p.mesesGrafica.map((d, i) => {
            const esUltimo = i === 5;
            const altura = ((d.val - 3) / (5 - 3)) * 100;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 9, color: esUltimo ? '#0B7324' : '#9ca3af', fontWeight: esUltimo ? 700 : 400 }}>{d.val}</span>
                <div style={{ width: '100%', height: `${altura}%`, minHeight: 8, background: esUltimo ? '#0B7324' : 'rgba(11,115,36,0.2)', borderRadius: '3px 3px 0 0' }} />
                <span style={{ fontSize: 9, color: '#9ca3af' }}>{d.mes}</span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 10, color: '#ef4444', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="alerta" size={11} /> {p.tendencia}
        </p>
      </div>

      {/* Distribución de estrellas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 14 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>{p.distribucionTitulo}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { stars: 5, pct: 38, count: 594 },
              { stars: 4, pct: 22, count: 344 },
              { stars: 3, pct: 12, count: 187 },
              { stars: 2, pct: 10, count: 156 },
              { stars: 1, pct: 18, count: 281 },
            ].map(r => (
              <div key={r.stars} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#6b7280', width: 20 }}>{r.stars}★</span>
                <MiniBar val={r.pct} max={100} color={r.stars >= 4 ? '#22c55e' : r.stars === 3 ? '#f59e0b' : '#ef4444'} />
                <span style={{ fontSize: 10, color: '#9ca3af', width: 32, textAlign: 'right' }}>{r.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>{p.alertasPeriodoTitulo}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.alertasPeriodo.map((a, i) => (
              <div key={i} style={{ background: a.color, border: `1px solid ${a.border}`, borderRadius: 6, padding: '6px 8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10 }}>{a.tipo}</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{a.fecha}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reseñas sospechosas */}
      <p style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>{p.sospechosasTitulo}</p>
      <div style={{ marginBottom: 12 }}>
        {p.sospechosas.map((r, i) => (
          <div key={i} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '7px 10px', marginBottom: 5, display: 'flex', gap: 10 }}>
            <span style={{ color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>★</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 11 }}>{r.autor}</span>
                <span style={{ fontSize: 10, color: '#f87171', background: '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>{r.motivo}</span>
              </div>
              <p style={{ color: '#6b7280', fontSize: 10, margin: '3px 0 0', fontStyle: 'italic' }}>{r.texto}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recomendaciones */}
      <p style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>{p.recomendacionesTitulo}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {p.recomendaciones.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, background: '#f9fafb', borderRadius: 6, padding: '7px 10px', border: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.c, flexShrink: 0, marginTop: 4 }} />
            <p style={{ margin: 0, fontSize: 11, color: '#374151', lineHeight: 1.5 }}>{r.texto}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#d1d5db' }}>{p.footerGenerado}</span>
        <span style={{ fontSize: 10, color: '#d1d5db' }}>{p.footerPagina}</span>
      </div>
    </div>

    {/* Blur de bloqueo */}
    <div style={{
      position: 'relative', height: 60, marginTop: -60,
      background: 'linear-gradient(transparent, rgba(249,250,251,0.97))',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 14,
    }}>
      <span style={{ color: '#0B7324', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon name="candado" size={12} strokeWidth={2} /> {p.verCompleto}
      </span>
    </div>
  </div>
  );
};

export default function ReportesPage() {
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [negocios, setNegocios] = useState([]);
  const [generando, setGenerando] = useState(false);
  const [mensajeGen, setMensajeGen] = useState('');
  const [errorGen, setErrorGen] = useState('');
  const [cargando, setCargando] = useState(true);

  const planPago = usuario?.plan === 'NEGOCIO' || usuario?.plan === 'FRANQUICIA';

  useEffect(() => {
    if (!planPago) { setCargando(false); return; }
    negociosApi.listar()
      .then(data => { if (Array.isArray(data)) setNegocios(data); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [planPago]);

  const generarAhora = async () => {
    setGenerando(true); setErrorGen(''); setMensajeGen('');
    try {
      const data = await utils.generarReporte();
      setMensajeGen(data.mensaje || t.pago.mensajeGenerado);
      setTimeout(() => setMensajeGen(''), 6000);
    } catch (e) {
      setErrorGen(e.message || t.pago.errorGenerar);
    } finally {
      setGenerando(false);
    }
  };

  // El worker envía el día 1 con los datos del mes que acaba de terminar
  const ahora = new Date();
  const proximoEnvio = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
  const locale = idioma === 'en' ? 'en-US' : 'es-PE';
  const proximaFechaTexto = proximoEnvio.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const mesDatosTexto = ahora.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  // ── Vista plan gratuito ─────────────────────────────────
  if (!planPago) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{t.gratis.titulo}</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, margin: 0 }}>{t.gratis.sub}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, alignItems: 'start' }}>
          {/* Columna izquierda: beneficios */}
          <div>
            <div style={{ background: 'linear-gradient(135deg, #063B12, #0B7324)', borderRadius: 16, padding: '28px 24px', marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}><Icon name="doc" size={36} color="#fff" /></div>
              <h2 style={{ color: '#fff', fontSize: 19, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.3 }}>
                {t.gratis.cardTitulo}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
                {t.gratis.cardTexto}
              </p>
              <Link href="/dashboard/planes" style={{
                display: 'inline-block', background: '#fff', color: '#0B7324',
                padding: '11px 22px', borderRadius: 10, fontWeight: 700,
                fontSize: 13.5, textDecoration: 'none',
              }}>
                {t.gratis.activarCta}
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {t.gratis.beneficios.map((b, i) => (
                <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12 }}>
                  <Icon name={b.ico} size={20} color="#4CAF66" style={{ marginTop: 2 }} />
                  <div>
                    <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13, margin: '0 0 4px' }}>{b.t}</p>
                    <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>{b.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link href="/dashboard/planes" style={{
                display: 'inline-block', background: '#0B7324', color: '#fff',
                padding: '12px 28px', borderRadius: 10, fontWeight: 600,
                fontSize: 14, textDecoration: 'none',
              }}>
                {t.gratis.verPlanes}
              </Link>
            </div>
          </div>

          {/* Columna derecha: preview del reporte */}
          <div>
            <p style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 500, margin: '0 0 10px', textAlign: 'center', letterSpacing: 0.3 }}>
              {t.gratis.ejemploReal}
            </p>
            <div style={{ position: 'relative' }}>
              <PreviewPDF />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista plan de pago ──────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{t.pago.titulo}</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, margin: 0 }}>{t.pago.sub}</p>
        </div>
        <button onClick={generarAhora} disabled={generando || cargando || negocios.length === 0} style={{
          background: '#0B7324', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 13.5, fontWeight: 500, cursor: (generando || negocios.length === 0) ? 'not-allowed' : 'pointer',
          opacity: (generando || negocios.length === 0) ? 0.6 : 1,
        }}>
          {generando ? t.pago.generando : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="doc" size={14} /> {t.pago.generarAhora}</span>
          )}
        </button>
      </div>

      {mensajeGen && (
        <div style={{ background: 'rgba(11,115,36,0.1)', border: '1px solid rgba(11,115,36,0.3)', color: '#4CAF66', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13 }}>
          {mensajeGen}
        </div>
      )}
      {errorGen && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13 }}>
          {errorGen}
        </div>
      )}
      {!cargando && negocios.length === 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13 }}>
          {t.pago.sinNegocios}
        </div>
      )}

      <div style={{ background: 'rgba(11,115,36,0.06)', border: '1px solid rgba(11,115,36,0.2)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="calendario" size={19} color="#4CAF66" />
        <div>
          <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, margin: '0 0 2px' }}>{t.pago.proximoTitulo}</p>
          <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0 }}>{t.pago.proximoTexto(proximaFechaTexto, mesDatosTexto)}</p>
        </div>
      </div>
    </div>
  );
}
