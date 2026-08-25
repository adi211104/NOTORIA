'use client';
import { useIdioma } from '../context/IdiomaContext';

// Las tres piezas que convierten el panel de «¿cómo estoy?» en «¿qué hago?»:
// la tendencia del score, de qué se queja la gente, y qué hacer hoy.
//
// Todo sale de GET /api/negocios/:id/resumen, que no gasta ni una llamada a
// Google ni a Groq. El backend manda NÚMEROS y claves; el texto se compone acá,
// en el idioma del panel — es la regla que ya costó un bug en las invitaciones
// de equipo (§11) y otro en los correos de alerta (§12).
//
// ⚠️ Cada tarjeta se esconde sola cuando no hay nada que enseñar. Es la regla de
// producto del proyecto: lo que no podemos entregar no se muestra. Una sección
// de temas vacía o una lista de tareas en blanco ocupan sitio y no dicen nada.

const T = {
  es: {
    tendencia: { titulo:'Cómo se movió tu score', sub:(n)=>`Últimos ${n} días`,
      subieron:(n)=>`+${n} puntos en el periodo`, bajaron:(n)=>`${n} puntos en el periodo`, igual:'Sin cambios en el periodo',
      nota:'La confianza y la tasa de respuesta se calculan con tus datos de hoy, así que la forma de la curva es exacta pero el valor de un día pasado es aproximado.' },
    temas: { titulo:'Qué dice realmente la gente', sub:(n)=>`Sobre ${n} reseña${n===1?'':'s'} negativa${n===1?'':'s'} con texto`,
      vacio:'Ninguna queja se repite lo suficiente como para llamarla un patrón.',
      subio:(p)=>`+${p} pts vs. el mes pasado`, bajo:(p)=>`${p} pts vs. el mes pasado`, nuevo:'nuevo este mes',
      deCuantas:(v,t)=>`${v} de ${t}` },
    tareas: { titulo:'Para hacer hoy', vacio:'Nada pendiente. Tu ficha está al día.',
      FICHA_ALTERADA:(d)=> d.cuantas>1 ? `Revisa ${d.cuantas} cambios en tu ficha de Google` : 'Alguien cambió algo en tu ficha de Google',
      CRITICA_VENCIDA:(d)=> `Responde ${d.cuantas} reseña${d.cuantas>1?'s':''} crítica${d.cuantas>1?'s':''} — la más antigua lleva ${d.horas} h`,
      CRITICA_NUEVA:(d)=> `Responde ${d.cuantas} reseña${d.cuantas>1?'s':''} de 1★ o 2★`,
      NEGATIVA_SIN_RESPONDER:(d)=> `Responde ${d.cuantas} reseña${d.cuantas>1?'s':''} de 3★`,
      COMENTARIO_SIN_RESPONDER:(d)=> `Responde ${d.cuantas} comentario${d.cuantas>1?'s':''} en tus publicaciones`,
      TEMA_CRECIENDO:(d)=> d.nuevo ? `Aparece una queja nueva: ${d.etiqueta} (${d.porcentaje}%)` : `Está creciendo la queja por ${d.etiqueta} (+${d.deltaPuntos} pts)`,
      ALERTAS_SIN_LEER:(d)=> `Revisa ${d.cuantas} alerta${d.cuantas>1?'s':''} sin leer`,
      PEDIR_RESENAS:(d)=> `Pide reseñas: tienes ${d.total} y con pocas cada 1★ pesa mucho`,
    },
    ir:'Ir',
  },
  en: {
    tendencia: { titulo:'How your score moved', sub:(n)=>`Last ${n} days`,
      subieron:(n)=>`+${n} points over the period`, bajaron:(n)=>`${n} points over the period`, igual:'No change over the period',
      nota:'Trust and reply rate use today’s data, so the shape of the curve is exact but a past day’s value is approximate.' },
    temas: { titulo:'What people are actually saying', sub:(n)=>`Across ${n} negative review${n===1?'':'s'} with text`,
      vacio:'No complaint repeats often enough to call it a pattern.',
      subio:(p)=>`+${p} pts vs. last month`, bajo:(p)=>`${p} pts vs. last month`, nuevo:'new this month',
      deCuantas:(v,t)=>`${v} of ${t}` },
    tareas: { titulo:'To do today', vacio:'Nothing pending. Your listing is up to date.',
      FICHA_ALTERADA:(d)=> d.cuantas>1 ? `Review ${d.cuantas} changes to your Google listing` : 'Someone changed something on your Google listing',
      CRITICA_VENCIDA:(d)=> `Reply to ${d.cuantas} critical review${d.cuantas>1?'s':''} — the oldest has waited ${d.horas} h`,
      CRITICA_NUEVA:(d)=> `Reply to ${d.cuantas} 1★ or 2★ review${d.cuantas>1?'s':''}`,
      NEGATIVA_SIN_RESPONDER:(d)=> `Reply to ${d.cuantas} 3★ review${d.cuantas>1?'s':''}`,
      COMENTARIO_SIN_RESPONDER:(d)=> `Reply to ${d.cuantas} comment${d.cuantas>1?'s':''} on your posts`,
      TEMA_CRECIENDO:(d)=> d.nuevo ? `A new complaint shows up: ${d.etiqueta} (${d.porcentaje}%)` : `The ${d.etiqueta} complaint is growing (+${d.deltaPuntos} pts)`,
      ALERTAS_SIN_LEER:(d)=> `Review ${d.cuantas} unread alert${d.cuantas>1?'s':''}`,
      PEDIR_RESENAS:(d)=> `Ask for reviews: you have ${d.total}, and with few of them each 1★ hurts`,
    },
    ir:'Go',
  },
};

// A qué pestaña lleva cada tarea. Sin esto la lista diagnostica y no resuelve,
// que es justo la mitad que ya hacía el panel.
const DESTINO = {
  FICHA_ALTERADA: 'alertas',
  CRITICA_VENCIDA: 'resenas',
  CRITICA_NUEVA: 'resenas',
  NEGATIVA_SIN_RESPONDER: 'resenas',
  COMENTARIO_SIN_RESPONDER: 'comentarios',
  TEMA_CRECIENDO: 'resenas',
  ALERTAS_SIN_LEER: 'alertas',
  PEDIR_RESENAS: 'crecer',
};

// Rojo por encima de la prioridad de una crítica; ámbar para lo que puede
// esperar; verde para lo que es una oportunidad y no un problema.
const colorPrioridad = (p) => (p >= 80 ? '#ef4444' : p >= 40 ? '#f59e0b' : '#22c55e');

// ── Curva del score ─────────────────────────────────────────────────────────
// SVG a mano: son 60 puntos como mucho y no vale meter una librería de gráficos
// por esto. `preserveAspectRatio` se deja en su valor por defecto a propósito
// (ver §16: con "none" los grosores de línea se deforman).
const Curva = ({ puntos, alto = 64 }) => {
  if (!puntos || puntos.length < 2) return null;
  const ancho = 320;
  const vals = puntos.map((p) => p.score);
  const min = Math.min(...vals), max = Math.max(...vals);
  // Si la curva es plana, `max - min` es 0 y la división explota. Un rango
  // mínimo de 4 puntos la deja centrada en vez de pegada a un borde.
  const rango = Math.max(max - min, 4);
  const x = (i) => (i / (puntos.length - 1)) * ancho;
  const y = (v) => alto - ((v - min) / rango) * (alto - 8) - 4;
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const area = `${d} L${ancho},${alto} L0,${alto} Z`;
  const sube = vals[vals.length - 1] >= vals[0];
  const color = sube ? '#22c55e' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" height={alto} role="img" aria-hidden="true"
      style={{ display: 'block' }}>
      <path d={area} fill={color} opacity="0.10" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(puntos.length - 1)} cy={y(vals[vals.length - 1])} r="3.5" fill={color} />
    </svg>
  );
};

export default function PanelAccionable({ datos, Card, ST, onIr }) {
  const { idioma } = useIdioma();
  const t = T[idioma] || T.es;
  if (!datos) return null;

  const { serie, variacion, temas, tendenciaTemas, tareas } = datos;

  // La tendencia de cada tema, indexada para no recorrer el array por fila.
  const tendPorId = new Map((tendenciaTemas || []).map((x) => [x.id, x]));

  // Solo los temas que llegan a repetirse. Uno suelto no es un patrón, y
  // pintarlo como si lo fuera es exactamente el ruido que hace que la sección
  // deje de leerse.
  const temasVisibles = (temas?.temas || []).filter((x) => x.veces >= 2).slice(0, 5);
  const maxVeces = temasVisibles.length ? temasVisibles[0].veces : 1;

  // ⚠️ Una misma reseña puede tocar varios temas a la vez —"el pollo es
  // extremadamente pequeño, me sentí estafado" cuenta como porción Y como
  // precio—, así que sin esto la MISMA cita aparecía debajo de tres temas
  // seguidos. Es correcto y se lee como un fallo. Se le da a cada tema el
  // primer ejemplo que nadie haya usado ya; si no queda ninguno, va sin cita,
  // que es mejor que repetir.
  const citasUsadas = new Set();
  const citaDe = (tema) => {
    const libre = (tema.ejemplos || []).find((e) => !citasUsadas.has(e.extracto));
    if (libre) citasUsadas.add(libre.extracto);
    return libre || null;
  };

  return (
    <>
      {/* 🔴 Las dos tarjetas de arriba van en su PROPIA rejilla, dentro de una
          celda que ocupa toda la fila del padre.

          Sin esto quedaban en 1/5 del ancho: la rejilla de la pestaña Resumen es
          `repeat(auto-fit,minmax(280px,1fr))`, que en un monitor ancho da cinco
          columnas, y `auto-fit` NO las colapsa porque la tarjeta del score ocupa
          la fila entera con `gridColumn:'1/-1'` — o sea que las pistas no están
          vacías. El resultado eran dos tarjetas estrechas a la izquierda y medio
          panel en blanco a la derecha. Medido: 313px de ancho en un contenedor
          de 1619px.

          Así se reparten la fila entre las dos, y si solo hay una se lleva todo
          el ancho, que es lo correcto. */}
      <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, alignItems: 'start' }}>
      {/* ── Curva del score ─────────────────────────────────────────────── */}
      {serie?.puntos?.length >= 2 && (
        <Card>
          <ST>{t.tendencia.titulo}</ST>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
            {t.tendencia.sub(serie.puntos.length)}
          </p>
          <Curva puntos={serie.puntos} />
          {variacion && (
            <p style={{ fontSize: 13, fontWeight: 600, margin: '10px 0 0',
              color: variacion.delta > 0 ? '#22c55e' : variacion.delta < 0 ? '#ef4444' : 'var(--text-2)' }}>
              {variacion.delta > 0 ? t.tendencia.subieron(variacion.delta)
                : variacion.delta < 0 ? t.tendencia.bajaron(variacion.delta)
                : t.tendencia.igual}
            </p>
          )}
          {/* 🔴 La nota no es letra pequeña por costumbre: dos de los cuatro
              componentes no están historizados, y decirlo es lo que separa una
              tendencia honesta de un gráfico que finge un histórico que no hay. */}
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0', lineHeight: 1.5 }}>
            {t.tendencia.nota}
          </p>
        </Card>
      )}

      {/* ── De qué se queja la gente ────────────────────────────────────── */}
      {temas?.conTexto > 0 && (
        <Card>
          <ST>{t.temas.titulo}</ST>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
            {t.temas.sub(temas.conTexto)}
          </p>
          {temasVisibles.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{t.temas.vacio}</p>
          ) : temasVisibles.map((x) => {
            const tend = tendPorId.get(x.id);
            return (
              <div key={x.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{x.etiquetaCorta}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {t.temas.deCuantas(x.veces, temas.conTexto)} · {x.porcentaje}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--border-c)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(x.veces / maxVeces) * 100}%`,
                    background: '#f59e0b', borderRadius: 3, transition: 'width .6s ease' }} />
                </div>
                {tend && (tend.nuevo || Math.abs(tend.deltaPuntos) >= 5) && (
                  <p style={{ fontSize: 11, margin: '3px 0 0',
                    color: tend.nuevo || tend.deltaPuntos > 0 ? '#ef4444' : '#22c55e' }}>
                    {tend.nuevo ? t.temas.nuevo
                      : tend.deltaPuntos > 0 ? t.temas.subio(tend.deltaPuntos)
                      : t.temas.bajo(tend.deltaPuntos)}
                  </p>
                )}
                {/* El ejemplo es lo que hace el tema discutible: «salió porque
                    esta reseña dice esto», con la reseña a la vista. */}
                {(() => {
                  const cita = citaDe(x);
                  return cita ? (
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
                      “{cita.extracto}”
                    </p>
                  ) : null;
                })()}
              </div>
            );
          })}
        </Card>
      )}

      </div>

      {/* ── Para hacer hoy ──────────────────────────────────────────────── */}
      <Card style={{ gridColumn: '1/-1' }}>
        <ST>{t.tareas.titulo}</ST>
        {!tareas?.length ? (
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '6px 0 0' }}>{t.tareas.vacio}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {tareas.map((tarea) => {
              const texto = t.tareas[tarea.tipo];
              // Un tipo que el panel no conoce se OMITE. Imprimir el enum crudo
              // sería enseñarle "TEMA_CRECIENDO" a un cliente.
              if (!texto) return null;
              const destino = DESTINO[tarea.tipo];
              return (
                <div key={tarea.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-c)', borderRadius: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: colorPrioridad(tarea.prioridad) }} />
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.45 }}>
                    {texto(tarea.datos)}
                  </span>
                  {destino && onIr && (
                    <button onClick={() => onIr(destino)}
                      style={{ flexShrink: 0, background: 'transparent', border: '1px solid var(--border-c)',
                        borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
                      {t.ir}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
