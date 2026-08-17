'use client';

// Widget "analiza tu negocio gratis" del hero del landing.
// Busca el negocio en Google (endpoint público con rate-limit) y muestra un
// teaser del análisis: rating, reseñas sospechosas detectadas y UNA muestra
// recortada. El informe completo vive detrás del registro — este widget es el
// gancho de conversión, no el producto.

import { useState, useRef } from 'react';
import Link from 'next/link';
import { API_URL } from '../lib/api';

const TEXTOS = {
  es: {
    placeholder: 'Escribe el nombre de tu restaurante u hotel…',
    boton: 'Analizar gratis',
    buscando: 'Buscando…',
    analizando: 'Analizando reseñas…',
    sinResultados: 'No encontramos ese negocio en Google Maps. Prueba con el nombre exacto de la ficha.',
    error: 'No pudimos completar el análisis. Inténtalo de nuevo en unos minutos.',
    rateLimit: 'Demasiadas consultas desde tu conexión. Espera unos minutos.',
    resenas: 'reseñas en Google',
    analizadas: (n) => `Analizamos tus ${n} reseñas más recientes:`,
    sospechosas: (n) => n === 1 ? '1 reseña sospechosa detectada' : `${n} reseñas sospechosas detectadas`,
    limpias: 'Sin patrones de ataque en lo más reciente — pero un ataque empieza sin avisar.',
    motivo: 'Motivo:',
    cta: 'Ver el informe completo gratis',
    ctaSub: 'Monitoreo continuo, historial completo y alertas — el plan Gratuito no pide tarjeta.',
    otro: 'Analizar otro negocio',
    simTitulo: 'Qué tan expuesto estás ahora mismo',
    simCaida: (n, antes, despues) => <>Con <strong>{n} reseñas de 1★</strong> tu ficha pasa de {antes.toFixed(1)}★ a <strong>{despues.toFixed(1)}★</strong>.</>,
    simUmbral: (n) => <>Te bastan <strong>{n} reseña{n === 1 ? '' : 's'} de 1★</strong> para caer por debajo de 4.5★, el filtro con el que el 31% de los consumidores descarta un negocio.</>,
    simBajoUmbral: (n) => <>Estás por debajo de 4.5★. Para volver a cruzarlo necesitas <strong>{n} reseñas de 5★</strong>.</>,
    simMeta: (n, o) => <>Para llegar a {o.toFixed(1)}★ necesitas <strong>{n} reseñas de 5★</strong>.</>,
    simFuente: 'Cálculo sobre el rating y el número de reseñas de tu propia ficha. El umbral de 4.5★ es de BrightLocal, Local Consumer Review Survey 2026.',
    fichaCerrada: 'Tu ficha aparece como CERRADA en Google Maps. Mientras diga eso, dejas de salir a quien busca en tu zona.',
  },
  en: {
    placeholder: 'Type your restaurant or hotel name…',
    boton: 'Analyze free',
    buscando: 'Searching…',
    analizando: 'Analyzing reviews…',
    sinResultados: 'We could not find that business on Google Maps. Try the exact listing name.',
    error: 'We could not complete the analysis. Please try again in a few minutes.',
    rateLimit: 'Too many requests from your connection. Please wait a few minutes.',
    resenas: 'Google reviews',
    analizadas: (n) => `We analyzed your ${n} most recent reviews:`,
    sospechosas: (n) => n === 1 ? '1 suspicious review detected' : `${n} suspicious reviews detected`,
    limpias: 'No attack patterns in recent reviews — but attacks start without warning.',
    motivo: 'Reason:',
    cta: 'See the full report for free',
    ctaSub: 'Continuous monitoring, full history and alerts — the Free plan needs no card.',
    otro: 'Analyze another business',
    simTitulo: 'How exposed you are right now',
    simCaida: (n, antes, despues) => <>With <strong>{n} one-star reviews</strong> your listing goes from {antes.toFixed(1)}★ to <strong>{despues.toFixed(1)}★</strong>.</>,
    simUmbral: (n) => <>It only takes <strong>{n} one-star review{n === 1 ? '' : 's'}</strong> to drop below 4.5★, the cut-off 31% of consumers use to rule a business out.</>,
    simBajoUmbral: (n) => <>You are below 4.5★. To cross it again you need <strong>{n} five-star reviews</strong>.</>,
    simMeta: (n, o) => <>To reach {o.toFixed(1)}★ you need <strong>{n} five-star reviews</strong>.</>,
    simFuente: 'Calculated from the rating and review count of your own listing. The 4.5★ cut-off is from BrightLocal, Local Consumer Review Survey 2026.',
    fichaCerrada: 'Your listing shows as CLOSED on Google Maps. While it says that, you stop appearing to people searching in your area.',
  },
};

const Estrellas = ({ rating }) => (
  <span style={{ color:'#E8A33D', fontSize:13, letterSpacing:1 }}>
    {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
  </span>
);

export default function AnalisisGratis({ idioma = 'es' }) {
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [q, setQ] = useState('');
  const [fase, setFase] = useState('idle'); // idle | buscando | elegir | analizando | resultado | error
  const [candidatos, setCandidatos] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [mensajeError, setMensajeError] = useState('');
  const inputRef = useRef(null);

  const errorDe = async (res) => {
    if (res.status === 429) return t.rateLimit;
    try { const d = await res.json(); if (d?.error) return d.error; } catch {}
    return t.error;
  };

  const buscar = async (e) => {
    e.preventDefault();
    if (q.trim().length < 3 || fase === 'buscando' || fase === 'analizando') return;
    setFase('buscando');
    setMensajeError('');
    try {
      const res = await fetch(`${API_URL}/api/publico/buscar-negocio?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) { setMensajeError(await errorDe(res)); setFase('error'); return; }
      const data = await res.json();
      if (!data.length) { setMensajeError(t.sinResultados); setFase('error'); return; }
      if (data.length === 1) return analizar(data[0].placeId);
      setCandidatos(data);
      setFase('elegir');
    } catch {
      setMensajeError(t.error);
      setFase('error');
    }
  };

  const analizar = async (placeId) => {
    setFase('analizando');
    setMensajeError('');
    try {
      const res = await fetch(`${API_URL}/api/publico/analizar?placeId=${encodeURIComponent(placeId)}`);
      if (!res.ok) { setMensajeError(await errorDe(res)); setFase('error'); return; }
      setResultado(await res.json());
      setFase('resultado');
    } catch {
      setMensajeError(t.error);
      setFase('error');
    }
  };

  const reiniciar = () => {
    setQ(''); setCandidatos([]); setResultado(null); setMensajeError(''); setFase('idle');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cargando = fase === 'buscando' || fase === 'analizando';

  return (
    <div style={{
      maxWidth: 520, margin: '32px auto 0', textAlign: 'left',
      background: 'var(--surface)', border: '1px solid var(--border-c)',
      borderRadius: 10, padding: 18, boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
    }}>
      {fase !== 'resultado' && (
        <form onSubmit={buscar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.placeholder}
            maxLength={80}
            disabled={cargando}
            style={{
              flex: '1 1 200px', minWidth: 0, padding: '11px 14px', fontSize: 14,
              background: 'var(--bg)', color: 'var(--text)',
              border: '1px solid var(--border-c)', borderRadius: 6, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={cargando || q.trim().length < 3}
            style={{
              padding: '11px 18px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
              cursor: cargando || q.trim().length < 3 ? 'default' : 'pointer',
              opacity: cargando || q.trim().length < 3 ? 0.6 : 1,
            }}
          >
            {fase === 'buscando' ? t.buscando : fase === 'analizando' ? t.analizando : t.boton}
          </button>
        </form>
      )}

      {fase === 'error' && (
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '12px 0 0', lineHeight: 1.6 }}>{mensajeError}</p>
      )}

      {fase === 'elegir' && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidatos.map((c) => (
            <button
              key={c.placeId}
              onClick={() => analizar(c.placeId)}
              style={{
                textAlign: 'left', padding: '10px 12px', background: 'var(--bg)',
                border: '1px solid var(--border-c)', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'inherit', color: 'var(--text)',
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{c.nombre}</span>
              {typeof c.rating === 'number' && (
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}> · {c.rating.toFixed(1)}★</span>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{c.direccion}</div>
            </button>
          ))}
        </div>
      )}

      {fase === 'resultado' && resultado && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{resultado.nombre}</span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              <Estrellas rating={resultado.rating} /> {resultado.rating.toFixed(1)} · {resultado.totalResenas} {t.resenas}
            </span>
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '10px 0 8px' }}>
            {t.analizadas(resultado.resenasAnalizadas)}
          </p>

          {resultado.sospechosas > 0 ? (
            <div style={{ background: 'rgba(200,60,50,0.08)', border: '1px solid rgba(200,60,50,0.3)', borderRadius: 6, padding: '10px 12px' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: '#C43C32', margin: 0 }}>
                ⚠ {t.sospechosas(resultado.sospechosas)}
              </p>
              {resultado.muestra && (
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 0', lineHeight: 1.6 }}>
                  {'★'.repeat(resultado.muestra.rating)} “{resultado.muestra.extracto}” — {resultado.muestra.autorNombre}
                  <br />
                  <strong>{t.motivo}</strong> {resultado.muestra.motivo}
                </p>
              )}
            </div>
          ) : (
            <div style={{ background: 'var(--accent-t)', border: '1px solid var(--accent-b)', borderRadius: 6, padding: '10px 12px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{t.limpias}</p>
            </div>
          )}

          {/* La ficha marcada como cerrada va por delante de todo: es la peor
              noticia posible y la que el dueño ni siquiera sabe que puede pasarle. */}
          {resultado.estadoFicha && (
            <div style={{ background: 'rgba(200,60,50,0.12)', border: '1px solid rgba(200,60,50,0.45)', borderRadius: 6, padding: '10px 12px', marginTop: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#C43C32', margin: 0, lineHeight: 1.6 }}>⚠ {t.fichaCerrada}</p>
            </div>
          )}

          {/* El simulacro.
              Antes, cuando no había nada sospechoso —que es la mayoría de las
              veces— este widget decía «no detectamos patrones» y el visitante se
              iba sin ningún motivo para registrarse. Esto le da sus propios
              números: cuántas reseñas de 1★ lo sacan del filtro de 4.5 y cuántas
              de 5★ le faltan para subir. Es la pregunta que traía. */}
          {resultado.simulador && (
            <div style={{ marginTop: 10, padding: '11px 13px', background: 'var(--surface2)', border: '1px solid var(--border-c)', borderRadius: 6 }}>
              <p style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 7px' }}>
                {t.simTitulo}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {resultado.simulador.paraCaerDelUmbral && (
                  <li style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                    {t.simUmbral(resultado.simulador.paraCaerDelUmbral)}
                  </li>
                )}
                {!resultado.simulador.sobreUmbral && resultado.simulador.metas.find((m) => m.objetivo === 4.5) && (
                  <li style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                    {t.simBajoUmbral(resultado.simulador.metas.find((m) => m.objetivo === 4.5).resenas)}
                  </li>
                )}
                {/* Solo si la ráfaga mueve algo. En una ficha con miles de
                    reseñas el cambio redondeado es 0, y "pasa de 4.6★ a 4.6★" se
                    lee como un error del widget en vez de como lo que es: que ese
                    negocio aguanta bien. Para esos casos ya está la línea del
                    umbral, que sí dice algo ("te bastan 100 reseñas de 1★"). */}
                {(() => {
                  const a = resultado.simulador.ataques?.find((x) => x.cambio !== 0);
                  return a ? (
                    <li style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                      {t.simCaida(a.cuantas, a.ratingAntes, a.ratingDespues)}
                    </li>
                  ) : null;
                })()}
                {resultado.simulador.sobreUmbral && resultado.simulador.metas[0] && (
                  <li style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                    {t.simMeta(resultado.simulador.metas[0].resenas, resultado.simulador.metas[0].objetivo)}
                  </li>
                )}
              </ul>
              <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: '9px 0 0', lineHeight: 1.5 }}>{t.simFuente}</p>
            </div>
          )}

          <Link
            href="/registro"
            style={{
              display: 'block', textAlign: 'center', marginTop: 12, padding: '12px 16px',
              background: 'var(--accent)', color: '#fff', borderRadius: 6,
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}
          >
            {t.cta} →
          </Link>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '8px 0 0', textAlign: 'center' }}>{t.ctaSub}</p>
          <button
            onClick={reiniciar}
            style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
          >
            {t.otro}
          </button>
        </div>
      )}
    </div>
  );
}
