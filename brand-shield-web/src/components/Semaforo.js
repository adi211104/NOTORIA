'use client';
import { useState } from 'react';

// Semáforo visual de reputación — umbral fijo sobre el rating actual.
// Gratis: solo el semáforo, sin explicación (genera el hábito de revisarlo).
// Negocio/Franquicia: tooltip con 1 frase de insight (ya generada por el
// resumen semanal — no dispara una llamada nueva a la IA).
const ESTADOS = [
  { key: 'rojo', color: '#B74040', umbral: 0 },
  { key: 'amarillo', color: '#D4A017', umbral: 3.5 },
  { key: 'verde', color: '#0B7324', umbral: 4.2 },
];

const calcularEstado = (rating) => {
  if (rating == null) return null;
  let activo = ESTADOS[0];
  for (const e of ESTADOS) if (rating >= e.umbral) activo = e;
  return activo.key;
};

export default function Semaforo({ rating, insight, mostrarInsight = false }) {
  const [hover, setHover] = useState(false);
  const estado = calcularEstado(rating);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: mostrarInsight && insight ? 'help' : 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {ESTADOS.map((e) => (
        <span key={e.key} style={{
          width: 12, height: 12, borderRadius: '50%',
          background: estado === e.key ? e.color : 'transparent',
          border: `2px solid ${estado === e.key ? e.color : 'var(--border-c)'}`,
          boxShadow: estado === e.key ? `0 0 8px ${e.color}` : 'none',
          transition: 'all 0.2s',
        }} />
      ))}

      {mostrarInsight && insight && hover && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          marginTop: 8, background: 'var(--surface)', border: '1px solid var(--border-c)',
          borderRadius: 8, padding: '10px 14px', width: 220, zIndex: 20,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{insight}</p>
        </div>
      )}
    </div>
  );
}
