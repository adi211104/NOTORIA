'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { negociosApi, comentariosApi } from '../../../../lib/api';
import { iconoParaTipo, labelParaTipo } from '../../../../lib/tiposNegocio';
import { textoAlerta, etiquetaAlerta } from '../../../../lib/alertas';
import { useAuth } from '../../../../context/AuthContext';
import { useIdioma } from '../../../../context/IdiomaContext';
import Icon, { ICONO_ALERTA } from '../../../../components/Icons';
import BloqueoPlan from '../../../../components/BloqueoPlan';
import CodigoQR, { descargarQR } from '../../../../components/CodigoQR';

import { API_URL } from '../../../../lib/api';
const getToken = () => localStorage.getItem('bs_token');

const COLORES = ['#3AA857','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#64748b'];

// Devuelve { dia, hora } listos para mostrar en "Se reestablece el {dia} a las {hora}"
const formatFechaHora = (seg, idioma) => {
  if (!seg || seg <= 0) return null;
  const locale = idioma === 'en' ? 'en-US' : 'es-PE';
  const fecha = new Date(Date.now() + seg*1000);
  const hora = fecha.toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' });
  const hoy = new Date();
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
  const dia = fecha.toDateString() === hoy.toDateString()
    ? (idioma === 'en' ? 'today' : 'hoy')
    : fecha.toDateString() === manana.toDateString()
      ? (idioma === 'en' ? 'tomorrow' : 'mañana')
      : (idioma === 'en' ? 'on ' : 'el ') + fecha.toLocaleDateString(locale, { day:'numeric', month:'long' });
  return { dia, hora };
};

// ── Input de nombre: UNCONTROLLED para evitar reset por timers ──
// Usa defaultValue + useRef en vez de value + useState
// React setea el valor inicial y luego NO lo toca más aunque el padre re-renderice
const NombreInput = ({ valorInicial, onGuardar }) => {
  const inputRef = useRef(null);
  const [estado, setEstado] = useState('idle'); // idle | guardando | listo
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;

  const guardar = async () => {
    const nuevoValor = inputRef.current?.value?.trim();
    if (!nuevoValor) return;
    setEstado('guardando');
    await onGuardar(nuevoValor);
    setEstado('listo');
    setTimeout(() => setEstado('idle'), 2500);
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8 }}>
        <input
          ref={inputRef}
          defaultValue={valorInicial}
          onKeyDown={e => e.key === 'Enter' && guardar()}
          placeholder={t.config.nombrePlaceholder}
          style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:8, padding:'9px 13px', fontSize:13, outline:'none' }}
        />
        <button onClick={guardar} disabled={estado === 'guardando'}
          style={{ background: estado === 'listo' ? '#22c55e' : '#0B7324', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, cursor:'pointer', transition:'background 0.3s', minWidth:82 }}>
          {estado === 'guardando' ? '...' : estado === 'listo' ? t.config.nombreListo : t.config.nombreGuardar}
        </button>
      </div>
      <p style={{ fontSize:11, color:'var(--text-3)', margin:'5px 0 0' }}>{t.config.nombreHint}</p>
    </div>
  );
};

const GraficaRating = ({ snapshots }) => {
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const locale = idioma==='en' ? 'en-US' : 'es-PE';
  if (!snapshots || snapshots.length < 2) return <p style={{ color:'var(--text-3)', fontSize:13, textAlign:'center', padding:'16px 0' }}>{t.resumen.graficaMinimo}</p>;
  const datos = [...snapshots].reverse().slice(-10);
  const vals = datos.map(s => s.ratingActual ?? 0);

  const fecha = (s) => new Date(s.tomadoEn).toLocaleDateString(locale, { day:'2-digit', month:'2-digit' });
  const primero = vals[0];
  const ultimo = vals[vals.length - 1];
  const delta = Math.round((ultimo - primero) * 100) / 100;

  // Rango REAL de los datos: es lo que se rotula en el eje, para que se sepa
  // entre qué valores se mueve la línea. Antes no había ninguna referencia
  // numérica y la línea podía estar a media altura sin decir nada.
  const vMin = Math.min(...vals), vMax = Math.max(...vals);
  const plano = vMax - vMin < 0.005;

  // Dominio dibujado. La amplitud mínima pasó de 1.0 a 0.3: con una ventana de
  // una estrella entera, el movimiento típico de un rating —una o dos décimas—
  // quedaba aplastado contra el centro y parecía una raya recta.
  let yMin = vMin, yMax = vMax;
  const AMPLITUD_MIN = 0.3;
  if (yMax - yMin < AMPLITUD_MIN) {
    const mid = (yMax + yMin) / 2;
    yMin = mid - AMPLITUD_MIN / 2;
    yMax = mid + AMPLITUD_MIN / 2;
  }
  const respiro = (yMax - yMin) * 0.18;
  yMin = Math.max(0, yMin - respiro);
  yMax = Math.min(5, yMax + respiro);

  // Decimales del eje: con una ventana estrecha, un solo decimal rotularía
  // "4.0" en las DOS líneas de referencia y no se distinguirían. Se usan dos
  // solo en ese caso — si el rating no se movió hay una sola línea y no hay
  // nada que distinguir, así que "4.0" y no "4.00".
  const dec = (!plano && vMax - vMin < 0.15) ? 2 : 1;

  // ⚠️ NADA de preserveAspectRatio="none". Estiraba el lienzo de 100×60 hasta el
  // ancho de la tarjeta: el trazo salía finísimo en horizontal y grueso en
  // vertical, y los puntos se deformaban en óvalos. Ahora el viewBox tiene una
  // proporción realista y escala uniforme.
  // Proporción: la tarjeta mide ~215 px de ancho, así que un lienzo 320×104 se
  // renderizaba a unos 70 px de alto y la gráfica quedaba achatada. Con 320×140
  // sube a ~94 px, que ya respira.
  const W = 320, H = 140;
  const X0 = 36, X1 = W - 8, Y0 = 14, Y1 = H - 26;
  const x = (i) => datos.length === 1 ? (X0 + X1) / 2 : X0 + (i / (datos.length - 1)) * (X1 - X0);
  const y = (v) => Y1 - ((v - yMin) / (yMax - yMin)) * (Y1 - Y0);
  const puntos = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${x(0)},${Y1} ${puntos} ${x(vals.length - 1)},${Y1}`;

  // Las referencias van en los valores REALES (mínimo y máximo), no en
  // fracciones arbitrarias del alto. Si el rating no se movió, una sola.
  const referencias = plano ? [vMax] : [vMax, vMin];
  const colorDelta = delta > 0 ? '#4CAF66' : delta < 0 ? '#f87171' : 'var(--text-3)';

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block' }}
           role="img" aria-label={t.resumen.graficaEscaneos(datos.length)}>
        {/* Degradado en el relleno. Con un verde plano, un rating estable pintaba
            un rectángulo sólido de lado a lado que se comía la tarjeta y no
            aportaba nada; desvanecido se lee como área bajo la curva. */}
        <defs>
          <linearGradient id="grad-rating" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0B7324" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0B7324" stopOpacity="0" />
          </linearGradient>
        </defs>
        {referencias.map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke="var(--border-c)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={X0 - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{v.toFixed(dec)}</text>
          </g>
        ))}

        <polygon points={area} fill="url(#grad-rating)" />
        <polyline points={puntos} fill="none" stroke="#0B7324" strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" />

        {vals.map((v, i) => {
          const esU = i === vals.length - 1;
          return (
            <circle key={i} cx={x(i)} cy={y(v)} r={esU ? 4 : 2.6}
                    fill={esU ? '#0B7324' : 'var(--surface)'} stroke="#0B7324" strokeWidth="1.6">
              {/* Cada punto lleva su valor y su fecha al pasar el cursor. Antes
                  esto se resolvía imprimiendo las diez etiquetas debajo, lo que
                  con varios escaneos el mismo día repetía "08/15" cuatro veces. */}
              <title>{t.resumen.graficaPunto(v, fecha(datos[i]))}</title>
            </circle>
          );
        })}

        {/* Solo las fechas de los extremos: son las que sitúan el periodo. */}
        <text x={X0} y={H - 5} textAnchor="start" fontSize="9.5" fill="var(--text-3)">{fecha(datos[0])}</text>
        <text x={X1} y={H - 5} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{fecha(datos[datos.length - 1])}</text>
      </svg>

      {/* Lo que se venía a saber: cuánto se movió. Antes había que comparar a
          ojo el primer número con el último. */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:11.5, color:'var(--text-3)' }}>{t.resumen.graficaEscaneos(datos.length)}</span>
        {plano ? (
          <span style={{ fontSize:11.5, color:'var(--text-3)' }}>{t.resumen.graficaSinCambios}</span>
        ) : (
          <span style={{ display:'inline-flex', alignItems:'baseline', gap:6 }}>
            <span style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{ultimo}</span>
            <span style={{ fontSize:12, fontWeight:700, color:colorDelta }}>
              {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(dec)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

// ── Score de Reputación 0-100 ─────────────────────────────
// Combina rating, volumen de reseñas, reseñas sospechosas y tasa de respuesta
const calcularScore = (snap, resenas, idioma) => {
  if (!snap) return null;
  const t = (TEXTOS[idioma] || TEXTOS.es).resumen.score;
  const rating = snap.ratingActual || 0;
  const total = snap.totalResenas || 0;
  const captadas = resenas.length;
  const sospechosas = resenas.filter(r => r.esSospechosa).length;
  const respondidas = resenas.filter(r => r.respondida).length;

  const pRating    = (rating / 5) * 55;
  const pVolumen   = Math.min(Math.log10(total + 1) / Math.log10(500), 1) * 20;
  const pConfianza = captadas > 0 ? (1 - Math.min(sospechosas / captadas, 1)) * 15 : 15;
  const pRespuesta = captadas > 0 ? (respondidas / captadas) * 10 : 5;

  const score = Math.round(pRating + pVolumen + pConfianza + pRespuesta);
  const nivel = score >= 85 ? { l:t.niveles.excelente, c:'#22c55e' }
              : score >= 70 ? { l:t.niveles.bueno, c:'#4CAF66' }
              : score >= 50 ? { l:t.niveles.enRiesgo, c:'#f59e0b' }
              : { l:t.niveles.critico, c:'#ef4444' };

  return {
    score, nivel,
    detalle: [
      { l:t.calidadRating, v:Math.round(pRating), max:55, tip: rating < 4.2 ? t.tipRating : null },
      { l:t.volumenResenas, v:Math.round(pVolumen), max:20, tip: total < 100 ? t.tipVolumen : null },
      { l:t.confianza, v:Math.round(pConfianza), max:15, tip: sospechosas > 0 ? t.tipConfianza(sospechosas) : null },
      { l:t.tasaRespuesta, v:Math.round(pRespuesta), max:10, tip: captadas > 0 && respondidas < captadas ? t.tipRespuesta : null },
    ],
  };
};

const ScoreGauge = ({ score, color }) => {
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const R = 42, C = 2 * Math.PI * R;
  const arco = (score / 100) * C * 0.75;
  return (
    <svg width="130" height="130" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border-c)" strokeWidth="7"
        strokeDasharray={`${C * 0.75} ${C}`} strokeLinecap="round" transform="rotate(135 50 50)" />
      <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${arco} ${C}`} strokeLinecap="round" transform="rotate(135 50 50)"
        style={{ transition:'stroke-dasharray 0.8s ease' }} />
      <text x="50" y="50" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--text)" fontFamily="Georgia,serif">{score}</text>
      <text x="50" y="64" textAnchor="middle" fontSize="8" fill="var(--text-3)" fontFamily="Georgia,serif">{t.resumen.de100}</text>
    </svg>
  );
};

// Card y ST viven FUERA del componente: si se definen dentro, cada re-render
// (el cooldown re-renderiza cada segundo) crea un tipo nuevo y React desmonta
// todo su contenido — los inputs pierden el foco al escribir.
// Nombre de la red tal como se le enseña al usuario. Existe porque los avisos de
// borrado decían "TikTok" fijo y el mismo botón se usa en Instagram: al borrar
// una respuesta de Instagram el aviso hablaba de otra red. Al añadir una fuente
// nueva, agregarla aquí y no volver a escribir el nombre a mano.
const nombreRed = (plataforma) => ({ TIKTOK:'TikTok', INSTAGRAM:'Instagram' })[plataforma] || plataforma;

// Agrupa los comentarios por la publicación donde viven, CONSERVANDO el orden en
// que llegaron del backend (más recientes primero): un Map recuerda el orden de
// inserción, así que la publicación con el comentario más nuevo queda arriba.
// Ordenar por publicación en vez de por comentario enterraría lo recién llegado,
// que es justo lo que el dueño necesita ver.
//
// Los que no tienen publicación conocida caen en un grupo sin cabecera, para que
// no desaparezcan de la lista.
const agrupadosPorPublicacion = (comentarios) => {
  const grupos = new Map();
  for (const c of comentarios) {
    const clave = c.publicacionId || '__sin__';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(c);
  }
  return [...grupos.entries()];
};

const Card = ({ children, style }) => <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14, padding:20, ...style }}>{children}</div>;
const ST = ({ children }) => <p style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, color:'var(--text-3)', margin:'0 0 10px' }}>{children}</p>;

// ── Plantillas de respuesta profesionales ─────────────────
// 6 tonos distintos por cada nivel de estrellas (30 en total). El panel
// siempre muestra las 6 variantes que corresponden al rating de la reseña.
const PLANTILLAS = {
  es: {
    1: [
      { id:'1-disculpa',  l:'Disculpa formal',    t:'Estimado {cliente}, lamentamos profundamente que su experiencia no estuviera a la altura. Este no es el estándar que nos exigimos y ya estamos revisando internamente lo ocurrido. Le agradecemos habernos alertado y quedamos a su disposición para conversarlo directamente.' },
      { id:'1-cercana',   l:'Cercana',            t:'Hola {cliente}, de verdad sentimos mucho lo que pasó. Nos duele leer esto porque trabajamos justamente para lo contrario. Ya lo estamos corrigiendo con el equipo. Si nos das la oportunidad, nos encantaría que tu próxima visita sea completamente distinta.' },
      { id:'1-solucion',  l:'Con solución',       t:'Hola {cliente}, gracias por contarnos lo que pasó. Ya identificamos el punto que mencionas y tomamos medidas concretas desde hoy para que no se repita. Escríbenos directamente al negocio: queremos escucharte y hacerlo bien la próxima vez.' },
      { id:'1-breve',     l:'Breve y directa',    t:'Hola {cliente}, lamentamos tu mala experiencia. Tomamos nota y lo corregiremos. Gracias por el aviso, nos ayuda a mejorar.' },
      { id:'1-invita',    l:'Invitación a volver', t:'Hola {cliente}, sentimos mucho haberte fallado en esta visita. Nos gustaría demostrarte que fue una excepción y no la regla: te invitamos a darnos una segunda oportunidad, contáctanos y nos encargaremos personalmente de que tu experiencia sea la que mereces.' },
      { id:'1-firme',     l:'Firme y profesional', t:'Hola {cliente}, gracias por tu comentario. Nos tomamos muy en serio cada opinión y hemos revisado lo que describes con el equipo. Trabajamos con estándares altos y cuando algo falla lo corregimos de inmediato. Esperamos poder atenderte mejor en una próxima ocasión.' },
    ],
    2: [
      { id:'2-disculpa',  l:'Disculpa formal',    t:'Estimado {cliente}, gracias por tomarse el tiempo de escribirnos. Lamentamos que su visita no cumpliera sus expectativas. Sus observaciones ya fueron trasladadas al equipo responsable y estamos tomando acciones para mejorar. Esperamos tener la oportunidad de ofrecerle un mejor servicio.' },
      { id:'2-cercana',   l:'Cercana',            t:'Hola {cliente}, gracias por tu honestidad. Sabemos que pudimos hacerlo mejor y tu comentario nos señala exactamente dónde. Ya estamos trabajando en ello. Ojalá nos des otra oportunidad para mostrarte nuestra mejor versión.' },
      { id:'2-solucion',  l:'Con solución',       t:'Hola {cliente}, gracias por el detalle de tu experiencia. Lo que mencionas es corregible y ya pusimos manos a la obra: reforzamos ese punto con el equipo esta misma semana. Nos encantaría que vuelvas a visitarnos y compruebes el cambio.' },
      { id:'2-breve',     l:'Breve y directa',    t:'Hola {cliente}, gracias por tu opinión. Tomamos nota de lo que no funcionó y lo estamos corrigiendo. Esperamos verte de nuevo pronto.' },
      { id:'2-invita',    l:'Invitación a volver', t:'Hola {cliente}, lamentamos no haber alcanzado tus expectativas esta vez. Valoramos mucho que nos lo digas — así mejoramos. Te esperamos pronto: queremos que tu próxima visita cuente una historia diferente.' },
      { id:'2-empatica',  l:'Empática',           t:'Hola {cliente}, entendemos tu molestia y tienes razón en señalarlo. Nadie viene a pasar un mal rato, y sentimos no haber estado a la altura ese día. Tu comentario ya está en manos del equipo. Gracias por ayudarnos a ser mejores.' },
    ],
    3: [
      { id:'3-agradece',  l:'Agradecida',         t:'Hola {cliente}, gracias por tu visita y por una opinión tan equilibrada. Nos alegra lo que disfrutaste y tomamos nota puntual de lo que podemos mejorar. Esperamos verte pronto y ganarnos esas estrellas que faltaron.' },
      { id:'3-cercana',   l:'Cercana',            t:'Hola {cliente}, ¡gracias por pasar por aquí! Vemos que la experiencia fue buena pero no redonda. Nos encantaría saber qué le faltó para ser perfecta — y mejor aún, demostrártelo en tu próxima visita.' },
      { id:'3-solucion',  l:'Con mejora concreta', t:'Hola {cliente}, gracias por tu comentario honesto. Justo los puntos intermedios como el tuyo son los que más nos ayudan a afinar detalles. Ya estamos trabajando en ello y esperamos que en tu próxima visita la experiencia sea de 5.' },
      { id:'3-breve',     l:'Breve y directa',    t:'Hola {cliente}, gracias por tu visita y tu opinión. Tomamos nota para mejorar. ¡Te esperamos pronto!' },
      { id:'3-invita',    l:'Invitación a volver', t:'Hola {cliente}, gracias por darnos la oportunidad. Sabemos que podemos dejarte una impresión aún mejor: vuelve pronto y déjanos intentarlo — la próxima queremos esas 5 estrellas.' },
      { id:'3-curiosa',   l:'Pregunta abierta',   t:'Hola {cliente}, gracias por tu reseña. Nos quedamos con ganas de saber qué habría hecho tu experiencia excelente: si te animas, escríbenos y cuéntanos. Tu opinión define nuestras mejoras. ¡Hasta pronto!' },
    ],
    4: [
      { id:'4-agradece',  l:'Agradecida',         t:'¡Hola {cliente}! Muchas gracias por tu visita y por tomarte el tiempo de escribirnos. Nos alegra que hayas disfrutado la experiencia. Tomamos nota del detalle que faltó para las 5 estrellas — vamos por ellas en tu próxima visita.' },
      { id:'4-cercana',   l:'Cercana',            t:'¡Gracias {cliente}! Qué gusto leerte. Comentarios como el tuyo nos animan a seguir cuidando cada detalle. Ya sabes dónde encontrarnos — la próxima vez vamos por la experiencia perfecta.' },
      { id:'4-breve',     l:'Breve y directa',    t:'¡Gracias por tu visita y tus palabras, {cliente}! Nos vemos pronto.' },
      { id:'4-equipo',    l:'En nombre del equipo', t:'Hola {cliente}, todo el equipo te agradece esta reseña. Trabajamos cada día para que la experiencia sea memorable y nos alegra saber que se nota. ¡Esperamos recibirte de nuevo muy pronto!' },
      { id:'4-invita',    l:'Invitación a volver', t:'¡Hola {cliente}! Gracias por elegirnos y por tu reseña. Nos encantará recibirte de nuevo — hay cosas nuevas que creemos que te van a gustar. ¡Hasta pronto!' },
      { id:'4-detalle',   l:'Con pregunta',       t:'¡Gracias {cliente}! Nos alegra mucho que la pasaras bien. Si hay algo puntual que podamos pulir para ganarnos esa estrella que faltó, nos encantaría saberlo. ¡Te esperamos de vuelta!' },
    ],
    5: [
      { id:'5-agradece',  l:'Agradecida',         t:'¡Hola {cliente}! Mil gracias por tus palabras y por elegirnos. Reseñas como la tuya son el mejor premio para todo el equipo. ¡Te esperamos pronto de vuelta!' },
      { id:'5-cercana',   l:'Cercana',            t:'¡{cliente}, qué alegría leerte! Gracias por tomarte el tiempo de compartir tu experiencia. Ya eres parte de la familia — nos vemos en la próxima visita.' },
      { id:'5-breve',     l:'Breve y directa',    t:'¡Mil gracias, {cliente}! Un placer atenderte. ¡Vuelve pronto!' },
      { id:'5-equipo',    l:'En nombre del equipo', t:'Hola {cliente}, compartimos tu reseña con todo el equipo y nos alegraste el día. Gracias por reconocer el esfuerzo que ponemos en cada detalle. ¡Será un gusto recibirte nuevamente!' },
      { id:'5-invita',    l:'Invitación a volver', t:'¡Gracias {cliente}! Nos encanta saber que la experiencia fue perfecta. La próxima vez pregunta por nuestras novedades — queremos sorprenderte otra vez. ¡Hasta pronto!' },
      { id:'5-recomienda', l:'Pide recomendación', t:'¡Hola {cliente}! Gracias por esta reseña tan generosa. Si conoces a alguien que busque una experiencia así, nos ayudaría muchísimo tu recomendación. ¡Te esperamos de vuelta con los brazos abiertos!' },
    ],
  },
  en: {
    1: [
      { id:'1-disculpa',  l:'Formal apology',      t:'Dear {cliente}, we are truly sorry your experience fell short of our standards. This is not the level we hold ourselves to, and we are already looking into what happened internally. Thank you for letting us know — we would welcome the chance to talk it through with you directly.' },
      { id:'1-cercana',   l:'Warm & personal',     t:"Hi {cliente}, we're really sorry to hear this. It's tough to read because it's the exact opposite of what we work for every day. We're already fixing this with the team. If you give us another chance, we'd love for your next visit to feel completely different." },
      { id:'1-solucion',  l:'With a solution',     t:"Hi {cliente}, thanks for telling us what happened. We've identified the issue you mentioned and are taking concrete steps starting today so it doesn't happen again. Please reach out to us directly — we'd like to hear from you and make it right next time." },
      { id:'1-breve',     l:'Short & direct',      t:"Hi {cliente}, we're sorry about your experience. We've taken note and will fix it. Thanks for letting us know — it helps us improve." },
      { id:'1-invita',    l:'Invite them back',    t:"Hi {cliente}, we're sorry we let you down on this visit. We'd like to show you this was the exception, not the rule — please give us a second chance. Reach out and we'll personally make sure you get the experience you deserve." },
      { id:'1-firme',     l:'Firm & professional', t:'Hi {cliente}, thank you for your feedback. We take every review seriously and have reviewed what you described with the team. We hold ourselves to high standards, and when something falls short we act on it right away. We hope to serve you better next time.' },
    ],
    2: [
      { id:'2-disculpa',  l:'Formal apology',   t:"Dear {cliente}, thank you for taking the time to write to us. We're sorry your visit didn't meet your expectations. Your feedback has been passed on to the team responsible, and we're taking steps to improve. We hope to have the chance to serve you better." },
      { id:'2-cercana',   l:'Warm & personal',  t:"Hi {cliente}, thanks for your honesty. We know we could have done better, and your comment points to exactly where. We're already working on it. We hope you'll give us another chance to show you our best." },
      { id:'2-solucion',  l:'With a solution',  t:"Hi {cliente}, thanks for the detail about your experience. What you're describing is fixable, and we've already gotten to work — we're reinforcing that this very week with the team. We'd love for you to visit again and see the difference." },
      { id:'2-breve',     l:'Short & direct',   t:"Hi {cliente}, thanks for your feedback. We've noted what didn't work and are fixing it. We hope to see you again soon." },
      { id:'2-invita',    l:'Invite them back', t:"Hi {cliente}, we're sorry we didn't meet your expectations this time. We really appreciate you telling us — that's how we improve. We hope to see you again soon and tell a different story." },
      { id:'2-empatica',  l:'Empathetic',       t:"Hi {cliente}, we understand your frustration and you're right to point it out. Nobody comes in looking for a bad time, and we're sorry we weren't at our best that day. Your comment is already with the team. Thanks for helping us do better." },
    ],
    3: [
      { id:'3-agradece',  l:'Thankful',            t:'Hi {cliente}, thanks for visiting and for such a balanced review. We\'re glad you enjoyed part of it, and we\'ve taken note of what we can improve. We hope to see you again soon and earn those extra stars.' },
      { id:'3-cercana',   l:'Warm & personal',     t:"Hi {cliente}, thanks for stopping by! It sounds like the experience was good but not quite perfect. We'd love to know what was missing — and even better, show you on your next visit." },
      { id:'3-solucion',  l:'Concrete improvement', t:"Hi {cliente}, thanks for your honest feedback. Comments right in the middle like yours are exactly what help us fine-tune the details. We're already working on it and hope your next visit earns a full 5 stars." },
      { id:'3-breve',     l:'Short & direct',      t:'Hi {cliente}, thanks for visiting and sharing your feedback. We\'ve taken note to improve. See you again soon!' },
      { id:'3-invita',    l:'Invite them back',    t:"Hi {cliente}, thanks for giving us a chance. We know we can leave you with an even better impression — come back soon and let us try again. Next time, we're going for those 5 stars." },
      { id:'3-curiosa',   l:'Open question',       t:"Hi {cliente}, thanks for your review. We're curious what would have made your experience excellent — feel free to reach out and tell us. Your feedback shapes how we improve. See you soon!" },
    ],
    4: [
      { id:'4-agradece',  l:'Thankful',            t:"Hi {cliente}! Thank you so much for visiting and taking the time to write to us. We're glad you enjoyed the experience. We've noted what was missing for that fifth star — we're going for it on your next visit." },
      { id:'4-cercana',   l:'Warm & personal',     t:"Thanks, {cliente}! It's great to read this. Comments like yours motivate us to keep sweating the details. You know where to find us — next time we're aiming for the perfect experience." },
      { id:'4-breve',     l:'Short & direct',      t:'Thanks for visiting and for your kind words, {cliente}! See you soon.' },
      { id:'4-equipo',    l:'On behalf of the team', t:'Hi {cliente}, the whole team thanks you for this review. We work every day to make the experience memorable, and it means a lot to know it shows. We hope to welcome you back very soon!' },
      { id:'4-invita',    l:'Invite them back',    t:"Hi {cliente}! Thanks for choosing us and for your review. We'd love to have you back — there are some new things we think you'll enjoy. See you soon!" },
      { id:'4-detalle',   l:'With a question',     t:"Thanks, {cliente}! We're so glad you had a good time. If there's anything specific we can polish to earn that missing star, we'd love to hear it. We hope to see you back!" },
    ],
    5: [
      { id:'5-agradece',  l:'Thankful',              t:'Hi {cliente}! Thank you so much for your kind words and for choosing us. Reviews like yours are the best reward for the whole team. We hope to see you back again soon!' },
      { id:'5-cercana',   l:'Warm & personal',       t:"{cliente}, what a joy to read this! Thanks for taking the time to share your experience. You're already part of the family — see you on your next visit." },
      { id:'5-breve',     l:'Short & direct',        t:'Thank you so much, {cliente}! It was a pleasure to have you. Come back soon!' },
      { id:'5-equipo',    l:'On behalf of the team', t:'Hi {cliente}, we shared your review with the whole team and it made our day. Thanks for recognizing the effort we put into every detail. It\'ll be a pleasure to welcome you back!' },
      { id:'5-invita',    l:'Invite them back',      t:"Thanks, {cliente}! We're thrilled the experience was perfect. Next time, ask about what's new — we want to surprise you again. See you soon!" },
      { id:'5-recomienda', l:'Ask for a referral',   t:"Hi {cliente}! Thank you for such a generous review. If you know someone looking for an experience like this, your recommendation would mean the world to us. We can't wait to welcome you back with open arms!" },
    ],
  },
};

// ── Diccionario de textos (es / en) ──────────────────────
const TEXTOS = {
  es: {
    breadcrumb: 'Mis negocios',
    general: { errorBackend:'No se puede conectar al backend. Asegúrate de que esté corriendo.', cerrarAviso:'Cerrar aviso' },
    header: {
      google:'Google',
      alerta:(n) => `${n} alerta${n>1?'s':''}`,
      rating:'Rating',
      resenasTotales:'Reseñas totales',
      escanear:'Escanear ahora',
      escaneando:(p) => `Escaneando... ${p}%`,
      seReestablece:(dia,hora) => `Se reestablece ${dia} a las ${hora}`,
      disponibleAhora:'Escaneo disponible — úsalo ahora',
      scanCompletado:'Escaneo completado. Revisa las reseñas y alertas.',
      errorEscanear:'Error al escanear',
    },
    tabs: {
      resumen:'Resumen',
      resenas:(n) => `Reseñas${n>0?` (${n})`:''}`,
      comentarios:(n) => `Comentarios${n>0?` (${n})`:''}`,
      sospechosas:(n) => `Sospechosas${n>0?` (${n})`:''}`,
      alertas:(n) => `Alertas${n>0?` (${n})`:''}`,
      competencia:(n) => `Competencia${n>0?` (${n})`:''}`,
      competenciaAuto:'Comparación automática',
      crecer:'Pedir reseñas',
      consejos:'Consejos',
      config:'Ajustes',
    },
    resumen: {
      scoreTitulo:'Score de reputación Notoria',
      score: {
        niveles:{ excelente:'Excelente', bueno:'Bueno', enRiesgo:'En riesgo', critico:'Crítico' },
        calidadRating:'Calidad del rating',
        volumenResenas:'Volumen de reseñas',
        confianza:'Confianza (sin reseñas falsas)',
        tasaRespuesta:'Tasa de respuesta',
        tipRating:'Sube tu rating respondiendo reseñas negativas',
        tipVolumen:'Pide más reseñas con tu código QR',
        tipConfianza:(n) => `Reporta las ${n} reseñas sospechosas`,
        tipRespuesta:'Responde todas tus reseñas',
      },
      de100:'de 100',
      historial:'Historial de rating',
      graficaMinimo:'Necesitas al menos 2 escaneos para ver la tendencia.',
      estrellasTitle:(n) => `${n} estrellas`,
      graficaSinCambios:'Sin cambios en el periodo',
      graficaEscaneos:(n) => `Últimos ${n} escaneos`,
      graficaPunto:(v, f) => `${v} estrellas el ${f}`,
      distribucion:'Distribución de estrellas',
      sinResenas:'Sin reseñas captadas aún',
      sinResenasDesc:(n) => `La Google Places API devuelve máximo 5 reseñas por consulta. Para negocios muy activos como este, a veces el array viene vacío aunque el total sea ${n}.`,
      verEnMaps:(n) => `Ver las ${n} reseñas en Google Maps →`,
      ultimoEscaneo:'Último escaneo',
      metricas: { rating:'Rating', totalResenas:'Total reseñas', enGoogleMaps:'en Google Maps', negativos24h:'Negativos 24h', tomadoEl:'Tomado el' },
    },
    resenas: {
      googleMaps:'Google Maps',
      resenasEnTotal:(n) => `${n} reseñas en total`,
      gbpTitulo:'Conecta Google Business y desbloquea todas tus reseñas',
      gbpDesc:'La API pública solo muestra 5 reseñas. Con Google Business ves el historial completo y respondes sin salir de Notoria. Es gratis.',
      gbpConectar:'Conectar Google Business',
      estrellasLabel:'Estrellas:',
      todas:'Todas',
      filtroTodo:'Todo',
      filtroSinResponder:'Sin responder',
      filtroRespondidas:'Respondidas',
      filtroSospechosas:'Sospechosas',
      limpiar:(a,b) => `✕ Limpiar (${a} de ${b})`,
      sinResenasApi:'La API de Google Places devuelve máximo 5 reseñas recientes. Para negocios con alto volumen, el array puede llegar vacío aunque el total sea correcto.',
      verTodasMaps:'Ver todas las reseñas en Google Maps →',
      sinCoincidencias:'Ninguna reseña coincide con los filtros seleccionados.',
      respondida:'✓ Respondida',
      editar:'Editar',
      responder:'Responder',
      tuRespuesta:'Tu respuesta: ',
      avisoRespuestaLocal:'Respuesta guardada. Recuerda responder también desde Google Maps, o conecta Google Business para enviarla directo desde aquí.',
      facebookTitulo:'Facebook Reviews',
      facebookPlanNegocio:'Disponible en Plan Negocio',
      facebookPlanDesc:'Monitorea y responde reseñas de Facebook desde aquí.',
      verPlanes:'Ver planes →',
      facebookConectar:'Conecta tu página de Facebook para monitorear sus reseñas.',
      facebookConectarBtn:'Conectar Facebook Page',
      facebookActivo:'Reseñas de Facebook activas.',
    },
    comentarios: {
      titulo:'Comentarios en tus publicaciones',
      // "videos" era de cuando esto solo leía TikTok; en Instagram son
      // publicaciones y el título de la sección ya dice "publicaciones".
      sub:'Lo que la gente comenta en tus propias publicaciones. Puedes responder desde acá.',
      cuentaConectada:'Cuenta conectada',
      verPerfil:'Ver perfil ↗',
      escuchando:'Escuchando los comentarios de esta cuenta',
      // La conexión se renueva sola cada 24h; esto sale solo si esa renovación
      // ya no es posible y hace falta volver a autorizar en TikTok.
      conexionVencida:'La conexión con TikTok expiró — vuelve a conectarla para seguir recibiendo comentarios.',
      gestionarConexion:'Gestionar conexión',
      totalLabel:'Total', negativosLabel:'Negativos', pendientesLabel:'Sin responder',
      filtroTodos:'Todos', negativo:'Negativos', positivo:'Positivos', neutro:'Neutros',
      soloPendientes:'Solo sin responder',
      // Nombra las redes que HOY se pueden conectar, no una lista fija: decía
      // solo TikTok y a un negocio que usa Instagram le pedía conectar una red
      // que quizá ni tiene; con la lista fija ahora pasaría lo contrario, le
      // pediría Instagram mientras Meta tiene la app en revisión y el botón ni
      // aparece. La lista sale de `disponible` en /api/redes/:id/estado.
      sinConectar:(redes) => redes.length
        ? `Conecta tu cuenta de ${redes.join(' o de ')} para traer los comentarios de tus publicaciones.`
        : 'Este negocio todavía no tiene ninguna red social conectada.',
      irAConectar:'Ir a Conexiones →',
      videosTitulo:'Tus últimos videos',
      videosDesc:'Lo que TikTok publica de tu cuenta. El número de comentarios es el que reporta TikTok.',
      videosSinTitulo:'(sin título)',
      publicacionSinTitulo:'Publicación sin texto',
      comentariosEnPublicacion:(n) => n === 1 ? '1 comentario' : `${n} comentarios`,
      verPublicacion:'Ver publicación ↗',
      videosComentarios:(n) => n === 1 ? '1 comentario' : `${n} comentarios`,
      videosResponder:'Ver en TikTok ↗',
      videosReproducir:'Reproducir',
      videosCerrar:'Cerrar',
      videosVistas:(n) => `${n} vistas`,
      vacio:'Sin comentarios todavía',
      vacioDesc:'Se revisan cada 4 horas junto con el resto del monitoreo. También puedes forzar un escaneo desde el botón de arriba.',
      // La explicación honesta cuando la cuenta SÍ está conectada: el monitoreo
      // funciona, lo que no existe es la vía para leer comentarios.
      vacioDescTikTok:'Tu cuenta está conectada y el monitoreo corre. Los comentarios nuevos aparecen acá en cuanto se detectan, y puedes responderlos sin salir de Notoria. Ten en cuenta que TikTok solo muestra los videos públicos: los publicados para "Amigos" o "Solo yo" quedan fuera.',
      vacioFiltro:'Ningún comentario coincide con este filtro.',
      enVideo:'En este video',
      enPublicacion:'En esta publicación',
      responder:'Responder',
      respondido:'Respondido',
      tuRespuesta:'Tu respuesta',
      placeholder:'Escribe tu respuesta…',
      enviar:'Publicar respuesta',
      enviando:'Publicando…',
      cancelar:'Cancelar',
      sinVideoOrigen:'Sin video de origen guardado — no se puede responder desde acá.',
      ocultar:'Ocultar', mostrar:'Mostrar', fijar:'Fijar', desfijar:'Desfijar',
      oculto:'Oculto', fijado:'Fijado',
      ocultarAyuda:'Lo quita de la vista pública sin borrarlo. Su autor lo sigue viendo y no recibe aviso.',
      fijarAyuda:'Lo sube al inicio de los comentarios del video.',
      borrarRespuesta:'Borrar respuesta',
      confirmarBorrado:(red) => `¿Seguro? Se borra de ${red}`,
      borrarRespuestaAyuda:(red) => `La retira de ${red} y deja el comentario como pendiente para que puedas escribir otra.`,
    },
    sospechosas: {
      sinSospechosas:'Sin reseñas sospechosas detectadas',
      responder:'Responder',
      reportar:'Reportar →',
    },
    alertas: {
      sinAlertas:'Sin alertas para este negocio',
    },
    competencia: {
      agregarTitulo:'Agregar competidor',
      agregarDesc:'Compara tu rating con el de tu competencia directa. Notoria actualiza sus datos en cada escaneo para que sepas exactamente dónde estás parado.',
      errorAgregar:'Error al agregar',
      errorConexion:'Error de conexión',
      errorSinPais:'Este negocio no tiene país asignado. Edítalo desde Ajustes para poder buscar competidores.',
      verPlanes:'Ver planes →',
      buscarPlaceholder:(tipo) => `Busca un ${tipo} competidor en Google Maps...`,
      buscando:'Buscando...',
      resenasCount:(n) => `${n} reseñas`,
      planIncluye:'Tu plan incluye 1 competidor.',
      monitoreaHasta5:'Monitorea hasta 5 con el Plan Negocio →',
      sinCompetidores:'Aún no monitoreas competidores',
      sinCompetidoresDesc:'Agrega tu competencia directa y compárate en cada escaneo.',
      comparativa:'Comparativa',
      tuNegocio:'Tu negocio',
      leGanasPor:(n) => `Le ganas por ${n}★`,
      teGanaPor:(n) => `Te gana por ${n}★`,
      analizarTitle:'Analiza sus reseñas públicas con IA y te dice cómo tomar la delantera',
      analizando:'Analizando...',
      actualizarAnalisis:'Actualizar análisis',
      analizarConIA:'Analizar con IA',
      analisisPlanPago:'Análisis con IA en plan Negocio →',
      dejarMonitorear:'Dejar de monitorear',
      errorAnalisis:'No se pudo generar el análisis.',
      errorConexionServidor:'Error de conexión con el servidor.',
      analisisTitulo:'Análisis de inteligencia competitiva',
      analisisBasado:'Basado en las reseñas públicas más recientes del competidor en Google Maps.',
    },
    competenciaAuto: {
      titulo:'Comparación automática con tu competencia',
      descripcion:'Notoria encuentra hasta 3 negocios similares en un radio de 2km y compara tu rating con el de ellos automáticamente — sin que tengas que agregar nada.',
      bloqueo:'Disponible en plan Franquicia →',
      cargando:'Buscando competidores cercanos...',
      error:'No se pudo cargar la comparación. Intenta de nuevo.',
      sinDatos:'Este negocio necesita un lugar de Google Maps asignado para comparar competencia.',
      tuNegocio:'Tu negocio',
      promedioCompetencia:'Promedio de la competencia',
      resenasCount:(n) => `${n} reseñas`,
    },
    crecer: {
      conectaPrimero:'Conecta tu negocio con Google Maps primero',
      conectaPrimeroDesc:'Necesitamos el Place ID de Google para generar tu enlace de reseñas.',
      enlaceTitulo:'Tu enlace directo de reseñas',
      enlaceDesc:'Este enlace abre directamente el formulario de reseña de tu negocio en Google. Compártelo con cada cliente satisfecho — más reseñas = mejor posición en Google Maps.',
      copiado:'Copiado ✓',
      copiarEnlace:'Copiar enlace',
      qrTitulo:'Código QR para tu local',
      qrAlt:(n) => `Código QR para dejar una reseña de ${n}`,
      qrDesc:'Imprímelo y colócalo en mesas, recepción o la cuenta. El cliente escanea y deja su reseña en 30 segundos.',
      altaResolucion:'Abrir en alta resolución',
      whatsappTitulo:'Mensaje listo para WhatsApp',
      whatsappHint:'Edítalo a tu gusto — se comparte tal como lo dejes aquí:',
      restaurarMensaje:'Restaurar mensaje original',
      copiarMensaje:'Copiar mensaje',
      compartirWhatsApp:'Compartir por WhatsApp',
      consejoWhatsapp:'Consejo: envíalo 1-2 horas después de la visita, cuando la experiencia aún está fresca.',
      mensajeDefault:(nombre, link) => `¡Hola! Gracias por visitarnos en ${nombre}. ¿Nos ayudas con una reseña? Solo toma 30 segundos: ${link}`,
    },
    consejos: {
      urgente:'Urgente',
      porQueImporta:'Por qué importa: ',
      planGeneradoPrefix:'Plan de acción generado con los datos reales de ',
      planGeneradoSuffix:'. Se actualiza con cada escaneo.',
      rating: {
        bajo: { titulo:(r) => `Tu rating de ${r}★ está costándote clientes`, dato:(r) => `${r} de 5`,
          porQue:'El 76% de los comensales filtra por 4.0★ o más antes de elegir dónde comer, y Google baja tu posición en el mapa cuando estás por debajo. Cada décima de estrella se traduce directamente en mesas ocupadas o vacías.',
          pasos:['Responde hoy las 5 reseñas negativas más recientes: una disculpa concreta + qué vas a corregir','Identifica el reclamo que más se repite (servicio lento, frío, precio) y atácalo esta semana en la operación','Activa tu QR de reseñas con los clientes satisfechos — necesitas volumen positivo para diluir lo negativo'],
          cta:'Ver reseñas por responder' },
        medio: { titulo:(r) => `Estás a ${r}★ del grupo de élite`, dato:(r) => `${r} de 5`,
          porQue:'Entre 4.0 y 4.4 estás en la "zona media": apareces en resultados pero pierdes contra los 4.5+ del área. Los negocios que cruzan ese umbral reportan hasta 25% más visitas desde Google Maps.',
          pasos:['Cada reseña de 5★ nueva pesa más que una vieja: pide reseñas de forma constante, no en campañas puntuales','Responde el 100% de las reseñas: Google mide la actividad del dueño y la recompensa','Revisa el filtro Sospechosas de tus reseñas cada semana — una sola reseña falsa de 1★ puede costarte una décima'],
          cta:'Pedir más reseñas' },
        alto: { titulo:'Tu rating es excelente — ahora protégelo', dato:(r) => `${r} de 5`,
          porQue:'Con 4.5+ eres blanco atractivo para ataques de competidores y bots: una campaña de 8-10 reseñas falsas de 1★ puede tumbarte medio punto en una noche. La detección temprana es tu seguro.',
          pasos:['Escanea siempre que el botón esté disponible — la detección temprana reduce el daño hasta 80%','Mantén el flujo de reseñas nuevas: un rating alto con reseñas viejas pierde fuerza en el algoritmo','Documenta los ataques (capturas + fechas) por si necesitas apelar ante Google'],
          cta:'Revisar sospechosas' },
      },
      respuesta: { tituloAlta:'Gran tasa de respuesta — mantén el ritmo', tituloBaja:(p) => `Solo respondes el ${p}% de tus reseñas`, dato:(p) => `${p}% respondidas`,
        porQue:'El 89% de los consumidores lee las respuestas del dueño antes de decidir. Una negativa bien respondida convierte mejor que una positiva ignorada: demuestra que hay alguien al mando que escucha.',
        pasos:['Regla de oro: responder todo en menos de 48 horas — después de 7 días el lector asume abandono','En negativas: agradece, reconoce lo específico, di qué cambiarás e invita a volver. Nunca discutas en público','Usa el asistente de Notoria: plantillas para el día a día e IA para los casos delicados'],
        cta:'Responder reseñas ahora' },
      volumen: { titulo:(m) => `Próxima meta: ${m} reseñas`, dato:(n) => `${n} actuales`,
        porQue:'El volumen es el segundo factor de posicionamiento local después del rating: más reseñas = más confianza para el algoritmo y para el cliente. Un negocio con 300 reseñas de 4.3★ le gana visibilidad a uno con 40 de 4.6★.',
        pasos:['Coloca el QR de Notoria en mesas, recepción o junto a la cuenta — el momento de pagar es cuando más se acepta','Entrena al equipo: "si te dicen que les gustó, pide la reseña". La solicitud verbal + QR triplica la conversión','Envía el mensaje de WhatsApp 1-2 horas después de la visita, con la experiencia fresca'],
        cta:'Ir a Pedir reseñas' },
      competencia: { tituloGanando:(n) => `Le ganas a ${n} — no te confíes`, tituloPerdiendo:(n,d) => `${n} te lleva ${d}★ de ventaja`, dato:(a,b) => `${a}★ vs ${b}★`,
        porQue:'Tu cliente compara 2-3 opciones en el mapa antes de decidir. La diferencia de rating entre tú y el local de al lado es, literalmente, el criterio de desempate más usado.',
        pasosGanando:['Revisa qué dicen las reseñas de tu competencia: sus quejas son tus oportunidades de diferenciarte','Mantén tu ritmo de reseñas nuevas por encima del suyo','Vigila sus subidas bruscas de rating — pueden indicar campañas de reseñas incentivadas'],
        pasosPerdiendo:['Lee sus últimas 10 reseñas positivas: identifica qué valoran sus clientes que tú no estás comunicando','Cierra la brecha con volumen: 15-20 reseñas nuevas de 5★ pueden mover una décima','Responde tus negativas antes que nada — es lo primero que ve quien los compara'],
        cta:'Ver comparativa',
        sinCompetidor:{ titulo:'Aún no vigilas a tu competencia', dato:'0 competidores',
          porQue:'Tu rating no vale nada en el vacío: un 4.2★ es excelente si tus vecinos tienen 3.9★, y un problema si tienen 4.6★. Sin punto de comparación, no sabes si estás ganando o perdiendo clientes frente al local de enfrente.',
          pasos:['Agrega al competidor que te quita más clientes (tu plan gratuito incluye 1)','Compara su evolución con la tuya en cada escaneo','Usa sus debilidades (reseñas negativas frecuentes) como argumento de tu propuesta'],
          cta:'Agregar competidor' } },
      habito: { titulo:'El hábito que protege todo lo demás: escanear',
        datoGratis:'1 escaneo cada 24h', datoNegocio:'1 escaneo cada 4h', datoFranquicia:'1 escaneo cada hora',
        porQue:'Los ataques de reseñas falsas suelen ocurrir de madrugada (lunes es el día más común) y el daño se consolida en 48-72 horas si nadie lo detecta. Cada escaneo es una foto de tu reputación: sin fotos frecuentes, no hay historial ni alertas tempranas.',
        pasos:['Escanea apenas veas el botón verde disponible — no lo dejes para después','Convierte el escaneo en rutina: al abrir el negocio o al revisar las ventas del día','Si necesitas más frecuencia, el Plan Negocio escanea cada 4 horas automáticamente'],
        cta:'Escanear ahora' },
    },
    config: {
      nombreTitulo:'Nombre del negocio',
      nombrePlaceholder:'Nombre del negocio',
      nombreGuardar:'Guardar',
      nombreListo:'✓ Listo',
      nombreHint:'Presiona Enter o el botón para guardar el cambio.',
      colorTitulo:'Color de etiqueta',
      colorDesc:'El cambio se aplica inmediatamente en la lista y en el borde del negocio.',
      colorActivo:(c) => `Color activo: ${c}`,
      conexionesTitulo:'Conexiones',
      // Sin enumerar las redes una por una: la lista cambia según lo que esté
      // aprobado en cada plataforma, y esta pantalla no la consulta. La de
      // verdad está en /dashboard/conexiones, que sí pregunta al backend.
      conexionesDesc:'Google Maps, Google Business y las redes sociales de todos tus negocios.',
      conexionesIr:'Administrar →',
      googleMapsRating:'Google Maps (rating)',
      googleMapsRatingDesc:'Rating y total de reseñas',
      conectado:'✓ Conectado',
      noConectado:'No conectado',
      gbpTitulo:'Google Business Profile',
      gbpDescConectado:'Todas las reseñas + respuesta directa',
      gbpDescNoConectado:'Ver y responder TODAS tus reseñas',
      gbpAviso:'Debes iniciar sesión con la cuenta de Google que administra este negocio en Google Maps (la del correo que lo creó o fue agregado como propietario/gerente). Si no tienes acceso a ese correo, poco se puede hacer: pide a quien lo gestiona que te agregue como gerente en Google Business Profile, o inicia el proceso de reclamo de propiedad de Google — Notoria no puede saltarse ese requisito.',
      conectarBtn:'Conectar →',
      facebookReviews:'Facebook Reviews',
      disponiblePlanNegocio:'Disponible en Plan Negocio',
      actualizar:'Actualizar →',
      instagram:'Instagram',
      instagramDesc:'Comentarios de tus publicaciones y respuesta directa',
      instagramTitle:'La integración está lista y en proceso de aprobación por Meta. Se activará automáticamente.',
      tiktok:'TikTok',
      tiktokDesc:'Comentarios de tus videos y respuesta directa',
      tiktokTitle:'Conecta tu cuenta de TikTok para leer y responder los comentarios de tus videos desde aquí.',
      proximamente:'Próximamente',
      conectar:'Conectar',
      conectando:'Abriendo…',
      ttExito:'Cuenta de TikTok conectada. Los comentarios de tus videos entrarán en el próximo escaneo.',
      ttErrorTitulo:'No se pudo conectar TikTok',
      ttError: {
        access_denied:'Cancelaste la autorización, o tu cuenta de TikTok no está en la lista de usuarios de prueba de la app.',
        missing_params:'TikTok no devolvió el código de autorización. Suele ser que la URI de redirección registrada no coincide.',
        callback_failed:'Falló el intercambio del código por el token. Revisa las credenciales y la URI de redirección.',
      },
      ttErrorGenerico:'TikTok rechazó la conexión.',
      gbpExito:'Google Business Profile conectado correctamente. Ahora puedes ver y responder todas tus reseñas.',
      igExito:'Instagram conectado. Los comentarios entrarán en el próximo escaneo.',
      igErrorTitulo:'No se pudo conectar Instagram',
      igError:{
        // Es el caso más frecuente y tiene solución: casi siempre la cuenta sí
        // es profesional, pero nunca se vinculó a una página de Facebook.
        sin_cuenta_business:'Tu cuenta de Instagram no aparece vinculada a ninguna página de Facebook que administres. No hace falta que tu Facebook y tu Instagram sean la misma cuenta: lo que falta es la página en medio. Es gratis y toma un par de minutos.',
        // No es lo mismo que el anterior: aquí la autorización no incluyó
        // NINGUNA página, casi siempre por reutilizar el permiso de un intento
        // previo. La vinculación puede estar perfecta y aun así fallar.
        sin_paginas:'Facebook no nos compartió ninguna página. Suele pasar cuando aceptas la pantalla que dice "¿continuar con tu configuración anterior?": ahí se reutiliza el permiso de un intento anterior y no se incluye tu página. Vuelve a intentarlo y pulsa "Editar configuración" en vez de "Continuar".',
        callback_failed:'Instagram aceptó el permiso pero falló el último paso de la conexión. Vuelve a intentarlo; si sigue igual, escríbenos.',
        access_denied:'Cancelaste la autorización en Facebook. Puedes volver a intentarlo cuando quieras.',
        missing_params:'Facebook no devolvió el código de autorización. Vuelve a intentarlo.',
      },
      igErrorGenerico:'Instagram rechazó la conexión.',
      igComoVincular:'Cómo vincularla',
      igEntendido:'Entendido',
      igReintentar:'Ir a Conexiones',
      // El orden importa: la causa casi siempre es la página que falta, no el
      // tipo de cuenta. Empezar por "cambia a cuenta profesional" hace que quien
      // YA es profesional crea que el mensaje no va con él y abandone.
      igPasos:[
        // Va PRIMERO porque quien ya enlazó por el Centro de cuentas cree que
        // ya está hecho y abandona la lista sin leerla. Es distinto del caso de
        // "no tengo página": aquí la persona está segura de haberlo hecho.
        'Ojo: enlazar Instagram con tu perfil en el «Centro de cuentas» de Meta NO es lo mismo y no sirve para esto. Eso une tu Instagram con tu perfil personal; lo que hace falta es unirlo a una página.',
        'Si no tienes página de Facebook, créala en facebook.com/pages/create (gratis, solo nombre y categoría).',
        'Desde una computadora, en tu página: Configuración → Cuentas vinculadas → Instagram → Conectar cuenta. Es más fiable que hacerlo desde el celular.',
        'Alternativa desde el celular: Instagram → Editar perfil → Página → Conectar una página existente.',
        'Tu cuenta de Instagram debe ser profesional (Configuración → Tipo de cuenta y herramientas). Si ya lo es, sáltate este paso.',
        'Vuelve aquí y pulsa Conectar Instagram otra vez.',
      ],
      igPasosPermiso:[
        'Pulsa Conectar Instagram otra vez.',
        'En la pantalla de Facebook elige «Editar configuración», NO «Continuar».',
        'Marca la página de Facebook que tiene tu Instagram vinculado y acepta todos los permisos.',
        'Si en esa lista no aparece ninguna página, entonces sí falta crearla y vincularla.',
      ],
      zonaPeligro:'Zona de peligro',
      zonaPeligroDesc:'Eliminar este negocio detendrá el monitoreo permanentemente y borrará todas sus alertas, reseñas y snapshots.',
      eliminarNegocio:'Eliminar este negocio',
      confirmarEliminar:(n) => `¿Confirmas la eliminación de ${n}?`,
      cancelar:'Cancelar',
      siEliminar:'Sí, eliminar',
    },
    modal: {
      bienvenidaTitulo: '¡Negocio agregado!',
      bienvenidaTexto: (nombre) => `Escanea ${nombre} ahora para ver sus reseñas y el análisis de su reputación.`,
      bienvenidaEscanear: 'Escanear ahora',
      bienvenidaMasTarde: 'Más tarde',
      responderResena:'Responder reseña',
      clienteDefault:'Cliente',
      cerrar:'Cerrar',
      publicaTitulo:'Publica tus respuestas sin salir de Notoria',
      publicaDesc:'Hoy guardamos tu respuesta y te abrimos Google Maps para pegarla. Conectando Google Business, la respuesta se publica directamente desde este chat.',
      conectarGB:'Conectar Google Business',
      de5:(n) => `${n} de 5`,
      resenasPublicadas:(n) => `${n} reseñas publicadas`,
      posibleFalsa:'Posible reseña falsa: ',
      respuestaGuardada:'Tu respuesta guardada',
      asistente:'Asistente de respuesta',
      iaUsoMes:(r,l) => `IA: ${r} de ${l} esta semana`,
      plantillasHint:(r) => `6 plantillas para reseñas de ${r}★ — elige el tono y edítala a tu gusto:`,
      masIA:'Más IA con Plan Negocio →',
      redactando:'Redactando...',
      generarIA:'Generar con IA',
      errorRespuestaIA:'No se pudo generar la respuesta.',
      errorConexionServidor:'Error de conexión con el servidor.',
      verPlanes:'Ver planes →',
      iaDisclaimer:'La IA redacta un borrador con el contexto de la reseña. Revísalo y edítalo antes de publicar — siempre tienes la última palabra.',
      placeholderTextarea:'Escribe o genera una respuesta, y edítala a tu gusto...',
      guardamosCopiamos:(plataforma) => `Guardamos tu respuesta, la copiamos al portapapeles y te abrimos ${plataforma} para publicarla.`,
      guardando:'Guardando...',
      guardarYAbrir:(plataforma) => `Guardar y abrir en ${plataforma}`,
      respuestaCopiada:'Respuesta copiada. Te abrimos Google Maps para que la pegues en la reseña.',
      respuestaGuardadaOk:'Respuesta guardada correctamente.',
      errorGuardar:'Error al guardar.',
    },
  },

  en: {
    breadcrumb: 'My businesses',
    general: { errorBackend:'Could not connect to the backend. Make sure it is running.', cerrarAviso:'Dismiss' },
    header: {
      google:'Google',
      alerta:(n) => `${n} alert${n>1?'s':''}`,
      rating:'Rating',
      resenasTotales:'Total reviews',
      escanear:'Scan now',
      escaneando:(p) => `Scanning... ${p}%`,
      seReestablece:(dia,hora) => `Resets ${dia} at ${hora}`,
      disponibleAhora:'Scan available — use it now',
      scanCompletado:'Scan completed. Check your reviews and alerts.',
      errorEscanear:'Error scanning',
    },
    tabs: {
      resumen:'Overview',
      resenas:(n) => `Reviews${n>0?` (${n})`:''}`,
      comentarios:(n) => `Comments${n>0?` (${n})`:''}`,
      sospechosas:(n) => `Suspicious${n>0?` (${n})`:''}`,
      alertas:(n) => `Alerts${n>0?` (${n})`:''}`,
      competencia:(n) => `Competitors${n>0?` (${n})`:''}`,
      competenciaAuto:'Automatic comparison',
      crecer:'Request reviews',
      consejos:'Tips',
      config:'Settings',
    },
    resumen: {
      scoreTitulo:'Notoria reputation score',
      score: {
        niveles:{ excelente:'Excellent', bueno:'Good', enRiesgo:'At risk', critico:'Critical' },
        calidadRating:'Rating quality',
        volumenResenas:'Review volume',
        confianza:'Trust (no fake reviews)',
        tasaRespuesta:'Response rate',
        tipRating:'Boost your rating by replying to negative reviews',
        tipVolumen:'Ask for more reviews with your QR code',
        tipConfianza:(n) => `Report the ${n} suspicious reviews`,
        tipRespuesta:'Reply to all your reviews',
      },
      de100:'of 100',
      historial:'Rating history',
      graficaMinimo:'You need at least 2 scans to see the trend.',
      estrellasTitle:(n) => `${n} stars`,
      graficaSinCambios:'No change in this period',
      graficaEscaneos:(n) => `Last ${n} scans`,
      graficaPunto:(v, f) => `${v} stars on ${f}`,
      distribucion:'Star distribution',
      sinResenas:'No reviews captured yet',
      sinResenasDesc:(n) => `The Google Places API returns at most 5 reviews per query. For very active businesses like this one, the array can come back empty even though the total is ${n}.`,
      verEnMaps:(n) => `View all ${n} reviews on Google Maps →`,
      ultimoEscaneo:'Last scan',
      metricas: { rating:'Rating', totalResenas:'Total reviews', enGoogleMaps:'on Google Maps', negativos24h:'Negative in 24h', tomadoEl:'Taken on' },
    },
    resenas: {
      googleMaps:'Google Maps',
      resenasEnTotal:(n) => `${n} reviews total`,
      gbpTitulo:'Connect Google Business and unlock all your reviews',
      gbpDesc:'The public API only shows 5 reviews. With Google Business you see the full history and reply without leaving Notoria. It’s free.',
      gbpConectar:'Connect Google Business',
      estrellasLabel:'Stars:',
      todas:'All',
      filtroTodo:'All',
      filtroSinResponder:'Unanswered',
      filtroRespondidas:'Replied',
      filtroSospechosas:'Suspicious',
      limpiar:(a,b) => `✕ Clear (${a} of ${b})`,
      sinResenasApi:'The Google Places API returns at most 5 recent reviews. For high-volume businesses, the array can arrive empty even though the total is correct.',
      verTodasMaps:'View all reviews on Google Maps →',
      sinCoincidencias:'No reviews match the selected filters.',
      respondida:'✓ Replied',
      editar:'Edit',
      responder:'Reply',
      tuRespuesta:'Your reply: ',
      avisoRespuestaLocal:'Reply saved. Remember to also post it from Google Maps, or connect Google Business to send it straight from here.',
      facebookTitulo:'Facebook Reviews',
      facebookPlanNegocio:'Available on the Business plan',
      facebookPlanDesc:'Monitor and reply to Facebook reviews from here.',
      verPlanes:'View plans →',
      facebookConectar:'Connect your Facebook page to monitor its reviews.',
      facebookConectarBtn:'Connect Facebook Page',
      facebookActivo:'Facebook reviews active.',
    },
    comentarios: {
      titulo:'Comments on your posts',
      sub:'What people comment on your own posts. You can reply from here.',
      cuentaConectada:'Connected account',
      verPerfil:'View profile ↗',
      escuchando:'Listening to comments on this account',
      conexionVencida:'The TikTok connection expired — reconnect it to keep receiving comments.',
      gestionarConexion:'Manage connection',
      totalLabel:'Total', negativosLabel:'Negative', pendientesLabel:'Unanswered',
      filtroTodos:'All', negativo:'Negative', positivo:'Positive', neutro:'Neutral',
      soloPendientes:'Unanswered only',
      sinConectar:(redes) => redes.length
        ? `Connect your ${redes.join(' or ')} account to pull the comments on your posts.`
        : 'This business has no social account connected yet.',
      irAConectar:'Go to Connections →',
      videosTitulo:'Your latest videos',
      videosDesc:'What TikTok reports for your account. The comment count is TikTok’s own.',
      videosSinTitulo:'(untitled)',
      publicacionSinTitulo:'Post with no caption',
      comentariosEnPublicacion:(n) => n === 1 ? '1 comment' : `${n} comments`,
      verPublicacion:'View post ↗',
      videosComentarios:(n) => n === 1 ? '1 comment' : `${n} comments`,
      videosResponder:'View on TikTok ↗',
      videosReproducir:'Play',
      videosCerrar:'Close',
      videosVistas:(n) => `${n} views`,
      vacio:'No comments yet',
      vacioDesc:'They are checked every 4 hours along with the rest of the monitoring. You can also force a scan with the button above.',
      vacioDescTikTok:'Your account is connected and monitoring is running. New comments show up here as soon as they are detected, and you can reply without leaving Notoria. Note that TikTok only exposes public videos: anything posted to "Friends" or "Only me" stays out.',
      vacioFiltro:'No comment matches this filter.',
      enVideo:'On this video',
      enPublicacion:'On this post',
      responder:'Reply',
      respondido:'Replied',
      tuRespuesta:'Your reply',
      placeholder:'Write your reply…',
      enviar:'Publish reply',
      enviando:'Publishing…',
      cancelar:'Cancel',
      sinVideoOrigen:'Source video not stored — cannot reply from here.',
      ocultar:'Hide', mostrar:'Unhide', fijar:'Pin', desfijar:'Unpin',
      oculto:'Hidden', fijado:'Pinned',
      ocultarAyuda:'Removes it from public view without deleting it. Its author still sees it and is not notified.',
      fijarAyuda:'Moves it to the top of the video comments.',
      borrarRespuesta:'Delete reply',
      confirmarBorrado:(red) => `Sure? This deletes it on ${red}`,
      borrarRespuestaAyuda:(red) => `Removes it from ${red} and marks the comment as pending so you can write a new one.`,
    },
    sospechosas: {
      sinSospechosas:'No suspicious reviews detected',
      responder:'Reply',
      reportar:'Report →',
    },
    alertas: {
      sinAlertas:'No alerts for this business',
    },
    competencia: {
      agregarTitulo:'Add competitor',
      agregarDesc:'Compare your rating against your direct competitors. Notoria updates their data on every scan so you know exactly where you stand.',
      errorAgregar:'Error adding competitor',
      errorConexion:'Connection error',
      errorSinPais:'This business has no country assigned. Edit it from Settings so you can search for competitors.',
      verPlanes:'View plans →',
      buscarPlaceholder:(tipo) => `Search for a competing ${tipo} on Google Maps...`,
      buscando:'Searching...',
      resenasCount:(n) => `${n} reviews`,
      planIncluye:'Your plan includes 1 competitor.',
      monitoreaHasta5:'Monitor up to 5 with the Business plan →',
      sinCompetidores:'You’re not tracking any competitors yet',
      sinCompetidoresDesc:'Add your direct competitors and compare yourself on every scan.',
      comparativa:'Comparison',
      tuNegocio:'Your business',
      leGanasPor:(n) => `You’re ahead by ${n}★`,
      teGanaPor:(n) => `They’re ahead by ${n}★`,
      analizarTitle:'Analyzes their public reviews with AI and tells you how to get ahead',
      analizando:'Analyzing...',
      actualizarAnalisis:'Update analysis',
      analizarConIA:'Analyze with AI',
      analisisPlanPago:'AI analysis on the Business plan →',
      dejarMonitorear:'Stop monitoring',
      errorAnalisis:'Could not generate the analysis.',
      errorConexionServidor:'Server connection error.',
      analisisTitulo:'Competitive intelligence analysis',
      analisisBasado:'Based on the competitor’s most recent public reviews on Google Maps.',
    },
    competenciaAuto: {
      titulo:'Automatic comparison with your competition',
      descripcion:'Notoria finds up to 3 similar businesses within a 2km radius and automatically compares your rating with theirs — no need to add anything.',
      bloqueo:'Available on the Franchise plan →',
      cargando:'Searching nearby competitors...',
      error:'Could not load the comparison. Please try again.',
      sinDatos:'This business needs a Google Maps place assigned to compare competitors.',
      tuNegocio:'Your business',
      promedioCompetencia:'Competitors average',
      resenasCount:(n) => `${n} reviews`,
    },
    crecer: {
      conectaPrimero:'Connect your business to Google Maps first',
      conectaPrimeroDesc:'We need the Google Place ID to generate your review link.',
      enlaceTitulo:'Your direct review link',
      enlaceDesc:'This link opens your business’s review form on Google directly. Share it with every happy customer — more reviews mean a better spot on Google Maps.',
      copiado:'Copied ✓',
      copiarEnlace:'Copy link',
      qrTitulo:'QR code for your venue',
      qrAlt:(n) => `QR code to leave a review for ${n}`,
      qrDesc:'Print it and place it on tables, at reception, or with the bill. The customer scans it and leaves a review in 30 seconds.',
      altaResolucion:'Open in high resolution',
      whatsappTitulo:'Ready-to-send WhatsApp message',
      whatsappHint:'Edit it however you like — it’s shared exactly as you leave it here:',
      restaurarMensaje:'Restore original message',
      copiarMensaje:'Copy message',
      compartirWhatsApp:'Share via WhatsApp',
      consejoWhatsapp:'Tip: send it 1-2 hours after the visit, while the experience is still fresh.',
      mensajeDefault:(nombre, link) => `Hi! Thanks for visiting ${nombre}. Could you help us with a review? It only takes 30 seconds: ${link}`,
    },
    consejos: {
      urgente:'Urgent',
      porQueImporta:'Why it matters: ',
      planGeneradoPrefix:'Action plan generated from the real data of ',
      planGeneradoSuffix:'. It updates with every scan.',
      rating: {
        bajo: { titulo:(r) => `Your ${r}★ rating is costing you customers`, dato:(r) => `${r} of 5`,
          porQue:'76% of diners filter for 4.0★ or higher before choosing where to eat, and Google lowers your position on the map when you’re below that. Every tenth of a star translates directly into full or empty tables.',
          pasos:['Reply today to your 5 most recent negative reviews: a concrete apology + what you’ll fix','Identify the most repeated complaint (slow service, cold food, price) and tackle it this week in your operations','Turn on your review QR code with satisfied customers — you need positive volume to dilute the negative'],
          cta:'View reviews to reply to' },
        medio: { titulo:(r) => `You’re ${r}★ away from the elite group`, dato:(r) => `${r} of 5`,
          porQue:'Between 4.0 and 4.4 you’re in the "middle zone": you show up in results but lose out to the 4.5+ businesses nearby. Businesses that cross that threshold report up to 25% more visits from Google Maps.',
          pasos:['Every new 5★ review carries more weight than an old one: ask for reviews steadily, not in one-off campaigns','Reply to 100% of your reviews — Google tracks owner activity and rewards it','Check the Suspicious filter on your reviews every week — a single fake 1★ review can cost you a tenth of a point'],
          cta:'Request more reviews' },
        alto: { titulo:'Your rating is excellent — now protect it', dato:(r) => `${r} of 5`,
          porQue:'At 4.5+ you’re an attractive target for competitor and bot attacks: a campaign of 8-10 fake 1★ reviews can knock off half a point overnight. Early detection is your insurance.',
          pasos:['Scan whenever the button is available — early detection cuts the damage by up to 80%','Keep new reviews flowing in: a high rating with old reviews loses strength in the algorithm','Document any attacks (screenshots + dates) in case you need to appeal to Google'],
          cta:'Review suspicious activity' },
      },
      respuesta: { tituloAlta:'Great response rate — keep it up', tituloBaja:(p) => `You’re only replying to ${p}% of your reviews`, dato:(p) => `${p}% replied`,
        porQue:'89% of consumers read the owner’s replies before deciding. A well-answered negative review converts better than an ignored positive one — it shows there’s someone in charge who listens.',
        pasos:['Golden rule: reply to everything within 48 hours — after 7 days readers assume you’ve given up','On negatives: thank them, acknowledge the specific issue, say what you’ll change, and invite them back. Never argue in public','Use Notoria’s assistant: templates for everyday cases and AI for the tricky ones'],
        cta:'Reply to reviews now' },
      volumen: { titulo:(m) => `Next goal: ${m} reviews`, dato:(n) => `${n} currently`,
        porQue:'Volume is the second local-ranking factor after rating: more reviews mean more trust for the algorithm and for the customer. A business with 300 reviews at 4.3★ outranks one with 40 at 4.6★.',
        pasos:['Place the Notoria QR code on tables, at reception, or next to the bill — the moment of payment is when people are most receptive','Train your team: "if they say they liked it, ask for the review." A verbal request plus the QR triples conversion','Send the WhatsApp message 1-2 hours after the visit, while the experience is still fresh'],
        cta:'Go to Request reviews' },
      competencia: { tituloGanando:(n) => `You’re ahead of ${n} — don’t get comfortable`, tituloPerdiendo:(n,d) => `${n} is ahead of you by ${d}★`, dato:(a,b) => `${a}★ vs ${b}★`,
        porQue:'Your customer compares 2-3 options on the map before deciding. The rating gap between you and the place next door is, literally, the most common tiebreaker.',
        pasosGanando:['Check what your competitor’s reviews say: their complaints are your opportunities to stand out','Keep your pace of new reviews above theirs','Watch for sudden rating jumps — they can signal incentivized review campaigns'],
        pasosPerdiendo:['Read their last 10 positive reviews: identify what their customers value that you’re not communicating','Close the gap with volume: 15-20 new 5★ reviews can move a tenth of a point','Reply to your negative reviews first — it’s the first thing anyone comparing you will see'],
        cta:'View comparison',
        sinCompetidor:{ titulo:'You’re not tracking your competition yet', dato:'0 competitors',
          porQue:'Your rating means nothing in a vacuum: a 4.2★ is excellent if your neighbors have 3.9★, and a problem if they have 4.6★. Without a point of comparison, you don’t know whether you’re winning or losing customers to the place across the street.',
          pasos:['Add the competitor taking the most customers from you (your free plan includes 1)','Compare their progress against yours on every scan','Use their weaknesses (frequent negative reviews) as an argument in your pitch'],
          cta:'Add competitor' } },
      habito: { titulo:'The habit that protects everything else: scanning',
        datoGratis:'1 scan every 24h', datoNegocio:'1 scan every 4h', datoFranquicia:'1 scan every hour',
        porQue:'Fake review attacks usually happen overnight (Monday is the most common day), and the damage sets in within 48-72 hours if nobody catches it. Every scan is a snapshot of your reputation — without frequent snapshots, there’s no history and no early alerts.',
        pasos:['Scan as soon as you see the green button available — don’t put it off','Turn scanning into a routine: when you open the business or check the day’s sales','If you need more frequency, the Business plan scans automatically every 4 hours'],
        cta:'Scan now' },
    },
    config: {
      nombreTitulo:'Business name',
      nombrePlaceholder:'Business name',
      nombreGuardar:'Save',
      nombreListo:'✓ Saved',
      nombreHint:'Press Enter or the button to save the change.',
      colorTitulo:'Label color',
      colorDesc:'The change applies immediately in the list and on the business border.',
      colorActivo:(c) => `Active color: ${c}`,
      conexionesTitulo:'Connections',
      conexionesDesc:'Google Maps, Google Business and the social accounts of all your businesses.',
      conexionesIr:'Manage →',
      googleMapsRating:'Google Maps (rating)',
      googleMapsRatingDesc:'Rating and total reviews',
      conectado:'✓ Connected',
      noConectado:'Not connected',
      gbpTitulo:'Google Business Profile',
      gbpDescConectado:'All reviews + direct reply',
      gbpDescNoConectado:'View and reply to ALL your reviews',
      gbpAviso:'You must sign in with the Google account that manages this business on Google Maps (the email that created the listing or was added as owner/manager). If you don’t have access to that email, there isn’t much we can do: ask whoever manages it to add you as a manager in Google Business Profile, or start Google’s ownership-claim process — Notoria can’t bypass this requirement.',
      conectarBtn:'Connect →',
      facebookReviews:'Facebook Reviews',
      disponiblePlanNegocio:'Available on the Business plan',
      actualizar:'Upgrade →',
      instagram:'Instagram',
      instagramDesc:'Comments on your posts with direct reply',
      instagramTitle:'The integration is ready and pending approval from Meta. It will activate automatically.',
      tiktok:'TikTok',
      tiktokDesc:'Comments on your videos with direct reply',
      tiktokTitle:'Connect your TikTok account to read and reply to comments on your videos from here.',
      proximamente:'Coming soon',
      conectar:'Connect',
      conectando:'Opening…',
      ttExito:'TikTok account connected. Comments on your videos will be picked up on the next scan.',
      ttErrorTitulo:'Could not connect TikTok',
      ttError: {
        access_denied:'You cancelled the authorization, or your TikTok account is not on the app’s test-user list.',
        missing_params:'TikTok did not return the authorization code. This is usually a mismatched redirect URI.',
        callback_failed:'Exchanging the code for a token failed. Check the credentials and the redirect URI.',
      },
      ttErrorGenerico:'TikTok rejected the connection.',
      gbpExito:'Google Business Profile connected successfully. You can now view and reply to all your reviews.',
      igExito:'Instagram connected. Comments will be picked up on the next scan.',
      igErrorTitulo:'Could not connect Instagram',
      igError:{
        sin_cuenta_business:'Your Instagram account is not linked to any Facebook Page you manage. Your Facebook and Instagram do not need to be the same account: what is missing is the Page in between. It is free and takes a couple of minutes.',
        sin_paginas:'Facebook did not share any Page with us. This usually happens when you accept the screen that says "continue with your previous settings": it reuses the grant from an earlier attempt and leaves your Page out. Try again and click "Edit settings" instead of "Continue".',
        callback_failed:'Instagram granted the permission but the last step failed. Try again; if it keeps failing, get in touch.',
        access_denied:'You cancelled the authorization on Facebook. You can try again any time.',
        missing_params:'Facebook did not return the authorization code. Please try again.',
      },
      igErrorGenerico:'Instagram rejected the connection.',
      igComoVincular:'How to link it',
      igEntendido:'Got it',
      igReintentar:'Go to Connections',
      igPasos:[
        'Heads up: linking Instagram to your profile in Meta’s "Accounts Center" is NOT the same thing and does not work for this. That links your Instagram to your personal profile; what is needed is linking it to a Page.',
        'If you do not have a Facebook Page, create one at facebook.com/pages/create (free, just a name and a category).',
        'From a computer, on your Page: Settings → Linked accounts → Instagram → Connect account. This is more reliable than doing it from the phone.',
        'From the phone instead: Instagram → Edit profile → Page → Connect an existing Page.',
        'Your Instagram account must be professional (Settings → Account type and tools). Skip this step if it already is.',
        'Come back here and hit Connect Instagram again.',
      ],
      igPasosPermiso:[
        'Hit Connect Instagram again.',
        'On the Facebook screen choose "Edit settings", NOT "Continue".',
        'Tick the Facebook Page that has your Instagram linked and accept all the permissions.',
        'If no Page shows up in that list, then it really is missing and needs to be created and linked.',
      ],
      zonaPeligro:'Danger zone',
      zonaPeligroDesc:'Deleting this business will permanently stop monitoring and erase all its alerts, reviews and snapshots.',
      eliminarNegocio:'Delete this business',
      confirmarEliminar:(n) => `Confirm deletion of ${n}?`,
      cancelar:'Cancel',
      siEliminar:'Yes, delete',
    },
    modal: {
      bienvenidaTitulo: 'Business added!',
      bienvenidaTexto: (nombre) => `Scan ${nombre} now to see its reviews and reputation analysis.`,
      bienvenidaEscanear: 'Scan now',
      bienvenidaMasTarde: 'Later',
      responderResena:'Reply to review',
      clienteDefault:'Customer',
      cerrar:'Close',
      publicaTitulo:'Publish your replies without leaving Notoria',
      publicaDesc:'Right now we save your reply and open Google Maps so you can paste it. Once you connect Google Business, replies are published directly from this chat.',
      conectarGB:'Connect Google Business',
      de5:(n) => `${n} of 5`,
      resenasPublicadas:(n) => `${n} reviews published`,
      posibleFalsa:'Possibly fake review: ',
      respuestaGuardada:'Your saved reply',
      asistente:'Reply assistant',
      iaUsoMes:(r,l) => `AI: ${r} of ${l} this week`,
      plantillasHint:(r) => `6 templates for ${r}★ reviews — pick a tone and edit it as you like:`,
      masIA:'More AI with the Business plan →',
      redactando:'Drafting...',
      generarIA:'Generate with AI',
      errorRespuestaIA:'Could not generate the reply.',
      errorConexionServidor:'Server connection error.',
      verPlanes:'View plans →',
      iaDisclaimer:'The AI drafts a reply using the review’s context. Review and edit it before publishing — you always have the final say.',
      placeholderTextarea:'Write or generate a reply, and edit it as you like...',
      guardamosCopiamos:(plataforma) => `We save your reply, copy it to your clipboard, and open ${plataforma} so you can publish it.`,
      guardando:'Saving...',
      guardarYAbrir:(plataforma) => `Save and open in ${plataforma}`,
      respuestaCopiada:'Reply copied. We’re opening Google Maps so you can paste it into the review.',
      respuestaGuardadaOk:'Reply saved successfully.',
      errorGuardar:'Error saving.',
    },
  },
};

export default function DetallePage() {
  const { id } = useParams();
  const router = useRouter();
  const { usuario } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [negocio, setNegocio] = useState(null);
  const [modalBienvenida, setModalBienvenida] = useState(false);
  const [colorLocal, setColorLocal] = useState('#3AA857');
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('resumen');
  const [respModal, setRespModal] = useState(null);
  const [textoResp, setTextoResp] = useState('');
  const [enviandoResp, setEnviandoResp] = useState(false);
  const [msgResp, setMsgResp] = useState('');
  const [modalEliminar, setModalEliminar] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [cooldown, setCooldown] = useState(null);
  const [msgScan, setMsgScan] = useState('');
  // `msgScan` se pinta en VERDE, y se estaba usando también para los fallos de
  // escaneo: un "no se pudo escanear" salía con el mismo color que un "listo".
  // Los errores van por aquí y se pintan en rojo. También recoge los fallos que
  // antes iban a un alert() del navegador.
  const [errorAccion, setErrorAccion] = useState('');
  const [errorEliminar, setErrorEliminar] = useState('');
  const [copiado, setCopiado] = useState('');
  // Comentarios de redes en publicaciones propias (TikTok)
  const [comentarios, setComentarios] = useState(null);
  const [comResumen, setComResumen] = useState({ total:0, negativos:0, sinResponder:0 });
  const [comConexiones, setComConexiones] = useState(null);
  // Videos propios traídos en vivo de TikTok. null = no se pudieron leer.
  const [comVideos, setComVideos] = useState(null);
  // { [publicacionId]: { titulo, imagen, url } } — para agrupar los comentarios
  // por la publicación donde viven en vez de una lista plana.
  const [comPublicaciones, setComPublicaciones] = useState({});
  // Video que se está reproduciendo dentro del panel (el objeto, no el id).
  const [comVideoAbierto, setComVideoAbierto] = useState(null);
  const [comFiltro, setComFiltro] = useState({ sentimiento:'', pendientes:'' });
  // Texto y error POR COMENTARIO. Antes eran un solo string, porque solo podía
  // haber una caja de respuesta abierta a la vez: había que pulsar "Responder"
  // para que apareciera. Ahora la caja está siempre visible en cada comentario
  // —un clic menos para lo que más se hace en esta pantalla— y eso obliga a que
  // cada uno recuerde lo suyo, o escribir en uno cambiaría el texto de todos.
  const [comTexto, setComTexto] = useState({});
  const [comEnviando, setComEnviando] = useState(null); // id del comentario en vuelo
  const [comError, setComError] = useState({}); // { [comentarioId]: mensaje }
  const [competidores, setCompetidores] = useState([]);
  const [compBusqueda, setCompBusqueda] = useState('');
  const [compResultados, setCompResultados] = useState([]);
  const [compBuscando, setCompBuscando] = useState(false);
  const [compError, setCompError] = useState('');
  const [compAgregando, setCompAgregando] = useState(false);
  const [iaEstado, setIaEstado] = useState(null); // { usados, limite, restantes }
  const [iaGenerando, setIaGenerando] = useState(false);
  const [iaError, setIaError] = useState('');
  const [filtroEstrellas, setFiltroEstrellas] = useState('todas'); // 'todas' | 1..5
  const [filtroEstado, setFiltroEstado] = useState('todas');       // 'todas' | 'sinResponder' | 'respondidas' | 'sospechosas'
  const [msgWhatsApp, setMsgWhatsApp] = useState('');              // mensaje editable de solicitud de reseña
  const [analisisComp, setAnalisisComp] = useState({});            // { [competidorId]: { cargando, texto, error } }
  const [competenciaAuto, setCompetenciaAuto] = useState(null);    // { miNegocio, competidores, promedioCompetencia }
  const [competenciaAutoCargando, setCompetenciaAutoCargando] = useState(false);
  const [competenciaAutoError, setCompetenciaAutoError] = useState('');
  const scanIntervalRef = useRef(null);
  const cooldownIntervalRef = useRef(null);
  const compTimeoutRef = useRef(null);

  const cargar = () => {
    negociosApi.obtener(id)
      .then(data => { setNegocio(data); setColorLocal(data.colorEtiqueta || '#3AA857'); })
      .catch(() => router.push('/dashboard/negocios'))
      .finally(() => setCargando(false));


    fetch(`${API_URL}/api/negocios/${id}/cooldown`, {
      headers: { Authorization:`Bearer ${getToken()}` }
    }).then(r => r.json()).then(cd => {
      setCooldown(cd);
      // Iniciar timer de cooldown solo una vez
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
      if (cd?.segundosRestantes > 0) {
        cooldownIntervalRef.current = setInterval(() => {
          setCooldown(prev => {
            if (!prev || prev.segundosRestantes <= 0) {
              clearInterval(cooldownIntervalRef.current);
              return { ...prev, puedeEscanear: true, segundosRestantes: 0 };
            }
            const seg = prev.segundosRestantes - 1;
            return { ...prev, segundosRestantes: seg, puedeEscanear: seg <= 0 };
          });
        }, 1000);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    cargar();
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (compTimeoutRef.current) clearTimeout(compTimeoutRef.current);
    };
  }, [id]);

  // ── Competidores ────────────────────────────────────────
  const cargarCompetidores = () => {
    fetch(`${API_URL}/api/competidores/${id}`, { headers:{ Authorization:`Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCompetidores(data); })
      .catch(() => {});
  };

  useEffect(() => { cargarCompetidores(); }, [id]);


  // ── Comentarios de redes ────────────────────────────────────────────────
  // Se carga al abrir la pestaña y cuando cambian los filtros, no al montar la
  // página: es una consulta que la mayoría de las visitas no necesita.
  const cargarComentarios = useCallback(async () => {
    try {
      const data = await comentariosApi.listar(id, comFiltro);
      setComentarios(data.comentarios);
      setComResumen(data.resumen);
      setComConexiones(data.conexiones);
      setComVideos(data.videos ?? null);
      setComPublicaciones(data.publicaciones || {});
    } catch {
      // 403 por plan o backend caído — el render cubre ambos con lista vacía
      setComentarios([]);
    }
  }, [id, comFiltro]);

  useEffect(() => {
    if (tab !== 'comentarios') return;
    cargarComentarios();
  }, [tab, cargarComentarios]);

  const responderComentario = async (comentarioId) => {
    const texto = (comTexto[comentarioId] || '').trim();
    if (!texto) return;
    setComEnviando(comentarioId);
    setComError(e => ({ ...e, [comentarioId]: '' }));
    try {
      await comentariosApi.responder(comentarioId, texto);
      // Se limpia SOLO el de este comentario: lo que el usuario tenga escrito en
      // otro sigue ahí.
      setComTexto(t => ({ ...t, [comentarioId]: '' }));
      await cargarComentarios();
    } catch (e) {
      setComError(er => ({ ...er, [comentarioId]: e.message }));
    } finally {
      setComEnviando(null);
    }
  };

  // Ocultar / fijar un comentario en TikTok. `comModerando` guarda el id para
  // deshabilitar solo esa tarjeta mientras viaja la llamada — un estado global
  // congelaría toda la lista.
  const [comModerando, setComModerando] = useState(null);
  // Confirmación en dos pasos: borrar en TikTok no se deshace, así que el primer
  // clic solo arma el botón y el segundo ejecuta.
  const [comBorrando, setComBorrando] = useState(null);
  const borrarRespuesta = async (comentarioId) => {
    setComModerando(comentarioId);
    setComError('');
    try {
      await comentariosApi.borrarRespuesta(comentarioId);
      setComBorrando(null);
      await cargarComentarios();
    } catch (e) {
      setComError(e.message);
    } finally {
      setComModerando(null);
    }
  };
  const moderarComentario = async (comentarioId, accion, activar) => {
    setComModerando(comentarioId);
    setComError('');
    try {
      await comentariosApi.moderar(comentarioId, accion, activar);
      await cargarComentarios();
    } catch (e) {
      setComError(e.message);
    } finally {
      setComModerando(null);
    }
  };

  // ── Comparación automática con competencia (solo Franquicia) ─────────────
  useEffect(() => {
    if (tab !== 'competenciaAuto' || usuario?.plan !== 'FRANQUICIA' || competenciaAuto || competenciaAutoCargando) return;
    setCompetenciaAutoCargando(true);
    setCompetenciaAutoError('');
    negociosApi.competencia(id)
      .then(data => setCompetenciaAuto(data))
      .catch(err => setCompetenciaAutoError(err.message || t.competenciaAuto.error))
      .finally(() => setCompetenciaAutoCargando(false));
  }, [tab, usuario?.plan, id]);

  // Popup único de "recomendación de escaneo" al llegar recién creado el negocio
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('bienvenida') === '1') {
      setModalBienvenida(true);
      router.replace(`/dashboard/negocios/${id}`);
    }
  }, [id]);

  // Resultado del OAuth de Instagram (?ig=conectado | ?ig_error=...).
  //
  // Se lee en un efecto y no durante el render para no romper la hidratación, y
  // se limpia la URL después: recargar la página no debe resucitar el mensaje de
  // una conexión vieja.
  //
  // Y se fuerza la pestaña de configuración. El backend ya mandaba `tab=config`
  // en el redirect, pero `tab` nunca se leyó de la URL: el usuario aterrizaba en
  // "resumen" y el aviso se quedaba en una pestaña que no estaba mirando —
  // invisible igual que cuando no existía.
  const [igConectado, setIgConectado] = useState(false);
  const [igError, setIgError] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const ok = p.get('ig') === 'conectado';
    const err = p.get('ig_error');
    if (!ok && !err) return;
    setIgConectado(ok);
    setIgError(err);
    setTab('config');
    router.replace(`/dashboard/negocios/${id}`);
  }, [id]);

  useEffect(() => {
    if (compBusqueda.length < 3) { setCompResultados([]); return; }
    if (!negocio?.pais) { setCompResultados([]); setCompError(t.competencia.errorSinPais); return; }
    clearTimeout(compTimeoutRef.current);
    compTimeoutRef.current = setTimeout(async () => {
      setCompBuscando(true); setCompError('');
      try {
        const res = await fetch(`${API_URL}/api/utils/buscar-negocio?q=${encodeURIComponent(compBusqueda)}&tipo=${negocio?.tipo || 'RESTAURANTE'}&region=${negocio.pais}`, {
          headers:{ Authorization:`Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok) { setCompResultados([]); setCompError(data.error || t.competencia.errorConexion); return; }
        setCompResultados(Array.isArray(data) ? data : []);
      } catch { setCompResultados([]); setCompError(t.competencia.errorConexion); }
      finally { setCompBuscando(false); }
    }, 600);
  }, [compBusqueda, negocio?.pais]);

  const agregarCompetidor = async (r) => {
    setCompAgregando(true); setCompError('');
    try {
      const res = await fetch(`${API_URL}/api/competidores/${id}`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
        body: JSON.stringify({ googlePlaceId: r.placeId }),
      });
      const data = await res.json();
      if (!res.ok) { setCompError(data.error || t.competencia.errorAgregar); return; }
      setCompBusqueda(''); setCompResultados([]);
      cargarCompetidores();
    } catch { setCompError(t.competencia.errorConexion); }
    finally { setCompAgregando(false); }
  };

  const eliminarCompetidor = async (compId) => {
    await fetch(`${API_URL}/api/competidores/${compId}`, {
      method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` },
    }).catch(() => {});
    cargarCompetidores();
  };

  // Análisis IA de un competidor: lee sus reseñas públicas y genera recomendaciones
  const analizarCompetidor = async (compId) => {
    if (analisisComp[compId]?.cargando) return;
    setAnalisisComp(prev => ({ ...prev, [compId]: { cargando: true } }));
    try {
      const res = await fetch(`${API_URL}/api/ia/analisis-competidor`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
        body: JSON.stringify({ negocioId: id, competidorId: compId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalisisComp(prev => ({ ...prev, [compId]: { error: data.error || t.competencia.errorAnalisis, upsell: data.accion === 'ACTUALIZAR_PLAN' } }));
        return;
      }
      setAnalisisComp(prev => ({ ...prev, [compId]: { texto: data.analisis } }));
    } catch {
      setAnalisisComp(prev => ({ ...prev, [compId]: { error: t.competencia.errorConexionServidor } }));
    }
  };

  // ── Conectar Google Business (reutilizado en Reseñas y Ajustes) ──
  const conectarGBP = () => {
    const t = getToken();
    fetch(`${API_URL}/api/auth/perfil`, { headers:{ Authorization:`Bearer ${t}` } })
      .then(r => {
        if (r.status === 401 || r.ok) {
          window.location.href = `${API_URL}/api/auth/google-business/iniciar?negocioId=${id}&token=${t}`;
        } else { throw new Error(); }
      })
      // Aviso en página, no alert(): el alert tapaba el panel con un diálogo
      // del sistema y había que aceptarlo antes de poder hacer nada.
      .catch(() => setErrorAccion((TEXTOS[idioma] || TEXTOS.es).general.errorBackend));
  };

  const copiar = async (texto, clave) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(clave); setTimeout(() => setCopiado(''), 2000); } catch {}
  };

  const guardarNombre = async (nuevoNombre) => {
    await fetch(`${API_URL}/api/negocios/${id}/configuracion`, {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
      body: JSON.stringify({ nombre: nuevoNombre }),
    }).catch(() => {});
    cargar();
  };

  const cambiarColor = async (c) => {
    setColorLocal(c);
    setNegocio(prev => ({ ...prev, colorEtiqueta: c }));
    await fetch(`${API_URL}/api/negocios/${id}/configuracion`, {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
      body: JSON.stringify({ colorEtiqueta: c }),
    }).catch(() => {});
  };

  const escanear = async () => {
    if (cooldown && !cooldown.puedeEscanear && cooldown.segundosRestantes > 0) return;
    setEscaneando(true); setProgreso(0); setMsgScan(''); setErrorAccion('');
    let p = 0;
    scanIntervalRef.current = setInterval(() => { p += Math.random()*8; if(p>90) p=90; setProgreso(Math.round(p)); }, 300);
    try {
      const res = await fetch(`${API_URL}/api/utils/monitoreo-manual`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
        body: JSON.stringify({ negocioId: id }),
      });
      const data = await res.json();
      clearInterval(scanIntervalRef.current);
      if (!res.ok) { setErrorAccion(data.error||t.header.errorEscanear); setEscaneando(false); setProgreso(0); return; }
      setProgreso(100);
      const cooldownSeg = (data.cooldownMinutos||1440)*60;
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
      setCooldown({ puedeEscanear:false, segundosRestantes:cooldownSeg });
      cooldownIntervalRef.current = setInterval(() => {
        setCooldown(prev => {
          if (!prev || prev.segundosRestantes <= 0) { clearInterval(cooldownIntervalRef.current); return { ...prev, puedeEscanear:true }; }
          const seg = prev.segundosRestantes - 1;
          return { ...prev, segundosRestantes:seg, puedeEscanear: seg<=0 };
        });
      }, 1000);
      setMsgScan(t.header.scanCompletado);
      setTimeout(() => { setEscaneando(false); setProgreso(0); cargar(); }, 1000);
    } catch { clearInterval(scanIntervalRef.current); setEscaneando(false); setProgreso(0); }
  };

  const eliminarNegocio = async () => {
    setErrorEliminar('');
    try { await negociosApi.eliminar(id); router.push('/dashboard/negocios'); }
    // El fallo se queda en la zona de peligro, junto al botón que se pulsó, en
    // vez de en un alert() del navegador.
    catch (e) { setErrorEliminar(e.message || t.general.errorBackend); }
  };

  const abrirResponder = (r) => {
    setRespModal(r); setTextoResp(r.respuesta || ''); setMsgResp(''); setIaError('');
    // Cargar el estado de usos de IA al abrir el panel
    fetch(`${API_URL}/api/ia/estado`, { headers:{ Authorization:`Bearer ${getToken()}` } })
      .then(res => res.json()).then(data => { if (data.limite != null) setIaEstado(data); })
      .catch(() => {});
  };

  const generarConIA = async () => {
    if (iaGenerando || !respModal) return;
    setIaGenerando(true); setIaError('');
    try {
      const res = await fetch(`${API_URL}/api/ia/respuesta`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
        body: JSON.stringify({ negocioId: id, autor: respModal.autorNombre, rating: respModal.rating, texto: respModal.texto }),
      });
      const data = await res.json();
      if (!res.ok) { setIaError(data.error || t.modal.errorRespuestaIA); return; }
      setTextoResp(data.respuesta);
      setIaEstado(prev => ({ ...(prev || {}), usados: data.usados, limite: data.limite, restantes: data.restantes }));
    } catch { setIaError(t.modal.errorConexionServidor); }
    finally { setIaGenerando(false); }
  };

  const enviarRespuesta = async () => {
    if (!textoResp.trim()) return;
    setEnviandoResp(true);
    try {
      const res = await fetch(`${API_URL}/api/negocios/${id}/responder-resena`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
        body: JSON.stringify({ resenaId: respModal.id, respuesta: textoResp }),
      });
      const data = await res.json();
      // Copiar el texto de la respuesta al portapapeles
      try { await navigator.clipboard.writeText(textoResp); } catch {}
      // Construir URL de Google Maps para el negocio (query_place_id es el
      // parámetro válido — "query=place_id:..." hace que Maps no encuentre nada)
      const mapsUrl = negocio?.googlePlaceId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.nombre)}&query_place_id=${negocio.googlePlaceId}`
        : data.linkRespuesta || null;
      if (mapsUrl) {
        setMsgResp(t.modal.respuestaCopiada);
        setTimeout(() => window.open(mapsUrl, '_blank'), 800);
      } else {
        setMsgResp(t.modal.respuestaGuardadaOk);
      }
      cargar();
    } catch { setMsgResp(t.modal.errorGuardar); }
    finally { setEnviandoResp(false); }
  };

  if (cargando) return <div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin" /></div>;
  if (!negocio) return null;

  const snap = negocio.snapshots?.[0];
  const snap2 = negocio.snapshots?.[1];
  const tend = snap && snap2 ? (snap.ratingActual - snap2.ratingActual).toFixed(2) : null;
  const alertasNL = negocio.alertas?.filter(a => !a.leida).length || 0;
  const sospechosas = negocio.resenas?.filter(r => r.esSospechosa) || [];
  const todasResenas = negocio.resenas || [];
  const color = colorLocal;
  const puedeEscanear = !cooldown || cooldown.puedeEscanear || cooldown.segundosRestantes <= 0;
  const fechaDisp = formatFechaHora(cooldown?.segundosRestantes, idioma);
  const planPago = usuario?.plan === 'NEGOCIO' || usuario?.plan === 'FRANQUICIA';

  // Sospechosas ya NO es una pestaña (2026-07-29): eran las mismas reseñas
  // duplicadas en dos lugares. Ahora viven dentro de Reseñas, detrás del filtro
  // "Sospechosas" que ya existía.
  // Comparación automática solo se muestra a Franquicia — es la única cuenta que
  // puede usarla, así que enseñarla a las demás solo era una puerta cerrada.
  const TABS = [
    { id:'resumen', label:t.tabs.resumen },
    { id:'resenas', label:t.tabs.resenas(todasResenas.length) },
    { id:'comentarios', label:t.tabs.comentarios(comResumen.total) },
    { id:'alertas', label:t.tabs.alertas(alertasNL) },
    { id:'competencia', label:t.tabs.competencia(competidores.length) },
    ...(usuario?.plan === 'FRANQUICIA' ? [{ id:'competenciaAuto', label:t.tabs.competenciaAuto }] : []),
    { id:'crecer', label:t.tabs.crecer },
    { id:'consejos', label:t.tabs.consejos },
    { id:'config', label:t.tabs.config },
  ];

  const score = calcularScore(snap, todasResenas, idioma);
  const linkResena = negocio.googlePlaceId ? `https://search.google.com/local/writereview?placeid=${negocio.googlePlaceId}` : null;
  const mensajeResenaDefault = linkResena ? t.crecer.mensajeDefault(negocio.nombre, linkResena) : '';
  // El mensaje de WhatsApp es editable; si el usuario no lo tocó, usamos el predeterminado
  const mensajeResena = msgWhatsApp || mensajeResenaDefault;
  // Lo calcula el backend (`negocioPublico`): los access tokens ya no viajan al
  // navegador, así que "conectado" llega resuelto en vez de deducirse del token.
  const gbpConectado = !!negocio.gbpConectado;
  // URL correcta para abrir el negocio en Google Maps (query_place_id, no "query=place_id:...")
  const linkMaps = negocio.googlePlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.nombre)}&query_place_id=${negocio.googlePlaceId}`
    : null;

  // Reseñas de Google con filtros aplicados (estrellas + estado)
  const resenasGoogle = todasResenas.filter(r => r.plataforma === 'GOOGLE');
  const resenasFiltradas = resenasGoogle.filter(r => {
    if (filtroEstrellas !== 'todas' && r.rating !== filtroEstrellas) return false;
    if (filtroEstado === 'sinResponder' && r.respondida) return false;
    if (filtroEstado === 'respondidas' && !r.respondida) return false;
    if (filtroEstado === 'sospechosas' && !r.esSospechosa) return false;
    return true;
  });
  const hayFiltros = filtroEstrellas !== 'todas' || filtroEstado !== 'todas';

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16, fontSize:13, color:'var(--text-3)' }}>
        <Link href="/dashboard/negocios" style={{ color:'var(--text-2)', textDecoration:'none' }}>{t.breadcrumb}</Link>
        <span>›</span><span style={{ color:'var(--text)' }}>{negocio.nombre}</span>
      </div>

      {/* Header */}
      <div style={{ background:'var(--surface)', border:`2px solid ${color}`, borderRadius:16, padding:20, marginBottom:14, transition:'border-color 0.3s' }}>
        {escaneando && (
          <div style={{ height:3, marginBottom:12, background:'var(--border-c)', borderRadius:3, overflow:'hidden' }}>
            <div className="scan-shimmer" style={{ height:'100%', width:`${progreso}%`, transition:'width 0.3s' }} />
          </div>
        )}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:52, height:52, borderRadius:12, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${color}55`, flexShrink:0 }}>
              <Icon name={iconoParaTipo(negocio.tipo)} size={24} color={color} />
            </div>
            <div>
              <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text)', margin:'0 0 3px' }}>{negocio.nombre}</h1>
              {negocio.direccion && <p style={{ color:'var(--text-3)', fontSize:12, margin:'0 0 6px', display:'flex', alignItems:'center', gap:4 }}><Icon name="pin" size={12} /> {negocio.direccion}</p>}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, background:'var(--surface2)', color:'var(--text-2)', padding:'2px 8px', borderRadius:6 }}>{labelParaTipo(negocio.tipo, idioma)}</span>
                {negocio.googlePlaceId && <span style={{ fontSize:11, background:'rgba(34,197,94,0.1)', color:'#22c55e', padding:'2px 8px', borderRadius:6 }}>✓ {t.header.google}</span>}
                {alertasNL > 0 && <span className="pulse-badge" style={{ fontSize:11, background:'rgba(239,68,68,0.15)', color:'#f87171', padding:'2px 8px', borderRadius:6 }}>{t.header.alerta(alertasNL)}</span>}
              </div>
            </div>
          </div>
          {/* Rating · reseñas · botón de escaneo. En un teléfono de 390 px esta
              fila no cabe: el botón se partía en dos líneas y el aviso de
              "escaneo disponible" en otras dos, dejando la cabecera amontonada.
              Con `flexWrap` los tres bloques se reacomodan solos, y el `gap`
              vertical evita que queden pegados al envolver. */}
          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', rowGap:12 }}>
            {snap && (
              <>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:700, color:'#facc15' }}>★ {snap.ratingActual}</div>
                  <div style={{ fontSize:11, color:'var(--text-3)' }}>{t.header.rating}</div>
                  {tend && <div style={{ fontSize:10, color:parseFloat(tend)>0?'#22c55e':'#f87171' }}>{parseFloat(tend)>0?'↑':'↓'} {Math.abs(tend)}</div>}
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>{snap.totalResenas?.toLocaleString()}</div>
                  <div style={{ fontSize:11, color:'var(--text-3)' }}>{t.header.resenasTotales}</div>
                </div>
              </>
            )}
            <div style={{ textAlign:'center' }}>
              {/* El anillo se anima con opacity+transform (compositor, sin repintar)
                  en vez de animar box-shadow directamente — mucho más liviano en
                  navegadores Android de gama baja donde animar box-shadow fuerza
                  repintar la zona en cada frame y puede trabar el scroll. */}
              <style>{`
                @keyframes glow-scan-ring {
                  0%,100% { opacity: 0.55; transform: scale(1); }
                  50%     { opacity: 0; transform: scale(1.28); }
                }
                .btn-escanear-listo { position: relative; }
                .btn-escanear-listo::after {
                  content: '';
                  position: absolute; inset: 0; border-radius: inherit;
                  box-shadow: 0 0 0 9px rgba(11,115,36,0.55);
                  animation: glow-scan-ring 2s ease-in-out infinite;
                  pointer-events: none;
                }
                @media (prefers-reduced-motion: reduce) {
                  .btn-escanear-listo::after { animation: none; display: none; }
                }
              `}</style>
              <button onClick={escanear} disabled={!puedeEscanear||escaneando}
                className={puedeEscanear&&!escaneando ? 'btn-escanear-listo' : ''}
                title={fechaDisp?t.header.seReestablece(fechaDisp.dia,fechaDisp.hora):t.header.escanear}
                style={{ background:puedeEscanear&&!escaneando?'#0B7324':'var(--surface2)', color:puedeEscanear&&!escaneando?'#fff':'var(--text-3)', border:'none', borderRadius:10, padding:'14px 28px', fontSize:15, cursor:puedeEscanear&&!escaneando?'pointer':'not-allowed', fontWeight:700, letterSpacing:0.2 }}>
                {escaneando?t.header.escaneando(progreso):(
                  <span style={{ display:'inline-flex', alignItems:'center', gap:9 }}><Icon name="buscar" size={17} strokeWidth={2} /> {t.header.escanear}</span>
                )}
              </button>
              {fechaDisp&&!escaneando && <div style={{ fontSize:11, color:'var(--text-3)', marginTop:5 }}>{t.header.seReestablece(fechaDisp.dia,fechaDisp.hora)}</div>}
              {!fechaDisp&&!escaneando && <div style={{ fontSize:11, color:'#22c55e', marginTop:5, fontWeight:600 }}>{t.header.disponibleAhora}</div>}
            </div>
          </div>
        </div>
        {msgScan && <div style={{ background:'rgba(11,115,36,0.1)', border:'1px solid rgba(11,115,36,0.3)', color:'#4CAF66', borderRadius:8, padding:'9px 14px', marginTop:12, fontSize:13 }}>{msgScan}</div>}
        {/* Los fallos van en rojo y con opción de cerrar. Antes compartían el
            recuadro verde de arriba, así que un error se leía como un éxito. */}
        {errorAccion && (
          <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'9px 14px', marginTop:12, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:9, minWidth:0 }}>
              <span style={{ flexShrink:0, marginTop:1 }}><Icon name="alerta" size={15} color="#f87171" /></span>
              <p style={{ color:'#f87171', fontSize:13, margin:0, lineHeight:1.5 }}>{errorAccion}</p>
            </div>
            <button onClick={() => setErrorAccion('')} title={t.general.cerrarAviso} aria-label={t.general.cerrarAviso}
              style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', padding:2, display:'flex', flexShrink:0, borderRadius:5 }}>
              <Icon name="cerrar" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Tabs — una sola fila que se desliza, NO `flexWrap`.
          Con wrap, las ocho pestañas ocupaban TRES filas en un teléfono de
          390 px y empujaban el contenido media pantalla hacia abajo. En una
          fila deslizable se ve dónde empieza el contenido y se llega a
          cualquier pestaña con el pulgar. En escritorio caben todas, así que
          el scroll ni aparece. `flexShrink:0` es imprescindible: sin él las
          pestañas se comprimen en vez de desbordar, y el texto se parte. */}
      <div style={{ display:'flex', gap:4, marginBottom:16, flexWrap:'nowrap', overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flexShrink:0, whiteSpace:'nowrap', padding:'7px 14px', borderRadius:8, border:`1px solid ${tab===t.id?'#0B7324':'var(--border-c)'}`, background:tab===t.id?'#0B7324':'transparent', color:tab===t.id?'#fff':'var(--text-2)', fontSize:12.5, cursor:'pointer', fontWeight:tab===t.id?500:400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB Resumen */}
      {tab==='resumen' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
          {score && (
            <Card style={{ gridColumn:'1/-1' }}>
              <ST>{t.resumen.scoreTitulo}</ST>
              <div style={{ display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ textAlign:'center', flexShrink:0 }}>
                  <ScoreGauge score={score.score} color={score.nivel.c} />
                  <div style={{ fontSize:13, fontWeight:700, color:score.nivel.c, marginTop:-8 }}>{score.nivel.l}</div>
                </div>
                <div style={{ flex:1, minWidth:260 }}>
                  {score.detalle.map((d,i) => (
                    <div key={i} style={{ marginBottom:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:12, color:'var(--text-2)' }}>{d.l}</span>
                        <span style={{ fontSize:12, color:'var(--text)', fontWeight:600 }}>{d.v}/{d.max}</span>
                      </div>
                      <div style={{ height:5, background:'var(--border-c)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(d.v/d.max)*100}%`, background:d.v/d.max >= 0.7 ? '#22c55e' : d.v/d.max >= 0.4 ? '#f59e0b' : '#ef4444', borderRadius:3, transition:'width 0.6s ease' }} />
                      </div>
                      {d.tip && <p style={{ fontSize:11, color:'var(--text-3)', margin:'3px 0 0' }}>→ {d.tip}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
          <Card><ST>{t.resumen.historial}</ST><GraficaRating snapshots={negocio.snapshots} /></Card>
          <Card>
            <ST>{t.resumen.distribucion}</ST>
            {todasResenas.length > 0 ? [5,4,3,2,1].map(s => {
              const c = todasResenas.filter(r => r.rating===s).length;
              const p = (c/todasResenas.length)*100;
              return (
                <div key={s} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, color:'var(--text-2)', width:22 }}>{s}★</span>
                  <div style={{ flex:1, height:6, background:'var(--border-c)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${p}%`, background:s>=4?'#22c55e':s===3?'#f59e0b':'#ef4444', borderRadius:3 }} />
                  </div>
                  <span style={{ fontSize:11, color:'var(--text-3)', width:20, textAlign:'right' }}>{c}</span>
                </div>
              );
            }) : (
              <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, padding:14 }}>
                <p style={{ color:'#f59e0b', fontSize:13, fontWeight:500, margin:'0 0 6px', display:'flex', alignItems:'center', gap:6 }}><Icon name="alerta" size={14} /> {t.resumen.sinResenas}</p>
                <p style={{ color:'var(--text-2)', fontSize:12, margin:'0 0 8px', lineHeight:1.5 }}>{t.resumen.sinResenasDesc(snap?.totalResenas?.toLocaleString())}</p>
                {linkMaps && <a href={linkMaps} target="_blank" rel="noopener noreferrer" style={{ color:'#4CAF66', fontSize:12 }}>{t.resumen.verEnMaps(snap?.totalResenas?.toLocaleString())}</a>}
              </div>
            )}
          </Card>
          {snap && (
            <Card style={{ gridColumn:'1/-1' }}>
              <ST>{t.resumen.ultimoEscaneo}</ST>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
                {[
                  { l:t.resumen.metricas.rating, v:`★ ${snap.ratingActual}` },
                  { l:t.resumen.metricas.totalResenas, v:snap.totalResenas?.toLocaleString(), s:t.resumen.metricas.enGoogleMaps },
                  { l:t.resumen.metricas.negativos24h, v:snap.resenasNegativas24h, alerta:snap.resenasNegativas24h>3 },
                  { l:t.resumen.metricas.tomadoEl, v:new Date(snap.tomadoEn).toLocaleString(idioma==='en'?'en-US':'es-PE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) },
                ].map((m,i) => (
                  <div key={i} style={{ background:m.alerta?'rgba(239,68,68,0.08)':'var(--surface2)', border:`1px solid ${m.alerta?'rgba(239,68,68,0.3)':'var(--border-c)'}`, borderRadius:10, padding:12 }}>
                    <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:4 }}>{m.l}</div>
                    <div style={{ fontSize:18, fontWeight:700, color:m.alerta?'#f87171':'var(--text)' }}>{m.v}</div>
                    {m.s && <div style={{ fontSize:10, color:'var(--text-3)' }}>{m.s}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB Reseñas */}
      {tab==='resenas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Google */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{t.resenas.googleMaps}</span>
              {snap && <span style={{ fontSize:11, color:'var(--text-3)' }}>{t.resenas.resenasEnTotal(snap.totalResenas?.toLocaleString())}</span>}
            </div>
            {!gbpConectado && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, background:'rgba(66,133,244,0.06)', border:'1px solid rgba(66,133,244,0.25)', borderRadius:10, padding:'12px 16px', marginBottom:10, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:220 }}>
                  <p style={{ color:'var(--text)', fontSize:13, fontWeight:600, margin:'0 0 2px' }}>{t.resenas.gbpTitulo}</p>
                  <p style={{ color:'var(--text-2)', fontSize:12, margin:0, lineHeight:1.5 }}>{t.resenas.gbpDesc}</p>
                </div>
                <button onClick={conectarGBP} style={{ background:'#4285F4', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12.5, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:7, whiteSpace:'nowrap', flexShrink:0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24"><path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  {t.resenas.gbpConectar}
                </button>
              </div>
            )}
            {/* Filtros */}
            {resenasGoogle.length > 0 && (
              <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--text-3)', marginRight:2 }}>{t.resenas.estrellasLabel}</span>
                {['todas',5,4,3,2,1].map(f => (
                  <button key={f} onClick={() => setFiltroEstrellas(f)}
                    style={{ padding:'4px 11px', borderRadius:14, border:`1px solid ${filtroEstrellas===f?'#0B7324':'var(--border-c)'}`, background:filtroEstrellas===f?'#0B7324':'transparent', color:filtroEstrellas===f?'#fff':'var(--text-2)', fontSize:11.5, cursor:'pointer' }}>
                    {f === 'todas' ? t.resenas.todas : `${f}★`}
                  </button>
                ))}
                <span style={{ width:1, height:16, background:'var(--border-c)', margin:'0 4px' }} />
                {[{ v:'todas', l:t.resenas.filtroTodo }, { v:'sinResponder', l:t.resenas.filtroSinResponder }, { v:'respondidas', l:t.resenas.filtroRespondidas }, { v:'sospechosas', l:t.resenas.filtroSospechosas }].map(f => (
                  <button key={f.v} onClick={() => setFiltroEstado(f.v)}
                    style={{ padding:'4px 11px', borderRadius:14, border:`1px solid ${filtroEstado===f.v?'#0B7324':'var(--border-c)'}`, background:filtroEstado===f.v?'#0B7324':'transparent', color:filtroEstado===f.v?'#fff':'var(--text-2)', fontSize:11.5, cursor:'pointer' }}>
                    {f.l}
                  </button>
                ))}
                {hayFiltros && (
                  <button onClick={() => { setFiltroEstrellas('todas'); setFiltroEstado('todas'); }}
                    style={{ padding:'4px 11px', borderRadius:14, border:'1px solid var(--border-c)', background:'transparent', color:'var(--text-3)', fontSize:11.5, cursor:'pointer' }}>
                    {t.resenas.limpiar(resenasFiltradas.length, resenasGoogle.length)}
                  </button>
                )}
              </div>
            )}
            {resenasGoogle.length === 0 ? (
              <Card>
                <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 4px' }}>{t.resenas.sinResenasApi}</p>
                {linkMaps && <a href={linkMaps} target="_blank" rel="noopener noreferrer" style={{ color:'#4CAF66', fontSize:13 }}>{t.resenas.verTodasMaps}</a>}
              </Card>
            ) : resenasFiltradas.length === 0 ? (
              <Card>
                <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>{t.resenas.sinCoincidencias}</p>
              </Card>
            ) : resenasFiltradas.map(r => (
              // Borde rojo en las sospechosas: al fusionarse la pestaña dentro de
              // Reseñas, es lo que las hace distinguibles de un vistazo en la lista.
              <Card key={r.id} style={{ marginBottom:8, ...(r.esSospechosa ? { border:'1px solid rgba(239,68,68,0.25)' } : {}) }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                  <div style={{ flex:1, display:'flex', gap:10, alignItems:'flex-start' }}>
                    {r.autorFoto ? (
                      <img src={r.autorFoto} alt="" width={32} height={32} style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:'1px solid var(--border-c)', marginTop:2 }}
                        onError={e => { e.currentTarget.style.display='none'; }} />
                    ) : (
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(11,115,36,0.12)', color:'#4CAF66', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, flexShrink:0, marginTop:2 }}>
                        {(r.autorNombre || 'C').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                      <span style={{ color:r.rating>=4?'#22c55e':r.rating===3?'#f59e0b':'#ef4444', fontWeight:700 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span>
                      <span style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{r.autorNombre}</span>
                      <span style={{ fontSize:11, color:'var(--text-3)' }}>{new Date(r.fechaResena).toLocaleDateString(idioma==='en'?'en-US':'es-PE')}</span>
                      {r.respondida && <span style={{ fontSize:10, background:'rgba(34,197,94,0.1)', color:'#22c55e', padding:'1px 6px', borderRadius:4 }}>{t.resenas.respondida}</span>}
                      {r.esSospechosa && (
                        <span style={{ fontSize:10, background:'rgba(239,68,68,0.1)', color:'#f87171', padding:'1px 8px', borderRadius:10, display:'inline-flex', alignItems:'center', gap:4 }}>
                          <Icon name="bot" size={11} /> {r.motivoSospecha?.split(',').join(' · ')}
                        </span>
                      )}
                    </div>
                    {r.texto && <p style={{ color:'var(--text-2)', fontSize:13, lineHeight:1.5, margin:0 }}>{r.texto}</p>}
                    {r.respuesta && (
                      <div style={{ background:'rgba(11,115,36,0.08)', border:'1px solid rgba(11,115,36,0.2)', borderRadius:8, padding:'8px 12px', marginTop:8, fontSize:12, color:'var(--text-2)' }}>
                        <span style={{ color:'#4CAF66', fontWeight:500 }}>{t.resenas.tuRespuesta}</span>{r.respuesta}
                        {!gbpConectado && (
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, paddingTop:8, borderTop:'1px solid rgba(11,115,36,0.15)', flexWrap:'wrap' }}>
                            <span style={{ display:'flex', alignItems:'center', gap:5, color:'var(--text-3)', fontSize:11.5, lineHeight:1.5 }}>
                              <Icon name="info" size={12} /> {t.resenas.avisoRespuestaLocal}
                            </span>
                            <button onClick={conectarGBP} style={{ background:'transparent', border:'1px solid rgba(66,133,244,0.4)', color:'#4285F4', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                              {t.resenas.gbpConectar}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0, height:'fit-content' }}>
                    <button onClick={() => abrirResponder(r)} style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:500, cursor:'pointer' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name={r.respondida?'editar':'chat'} size={12} /> {r.respondida?t.resenas.editar:t.resenas.responder}</span>
                    </button>
                    {/* Reportar venía de la pestaña Sospechosas; sin esto la fusión
                        habría perdido la única acción propia de esas reseñas. */}
                    {r.esSospechosa && linkMaps && (
                      <a href={linkMaps} target="_blank" rel="noopener noreferrer"
                        style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:8, padding:'7px 12px', fontSize:12, textDecoration:'none', textAlign:'center' }}>
                        {t.sospechosas.reportar}
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Facebook — banner sutil para plan gratuito */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{t.resenas.facebookTitulo}</span>
            </div>
            {!planPago ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(11,115,36,0.06)', border:'1px solid rgba(11,115,36,0.2)', borderRadius:10, padding:'12px 16px', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Icon name="candado" size={18} color="var(--text-2)" />
                  <div>
                    <p style={{ color:'var(--text)', fontSize:13, fontWeight:500, margin:'0 0 2px' }}>{t.resenas.facebookPlanNegocio}</p>
                    <p style={{ color:'var(--text-2)', fontSize:12, margin:0 }}>{t.resenas.facebookPlanDesc}</p>
                  </div>
                </div>
                <Link href="/dashboard/planes" style={{ background:'#0B7324', color:'#fff', padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:500, textDecoration:'none', whiteSpace:'nowrap', flexShrink:0 }}>
                  {t.resenas.verPlanes}
                </Link>
              </div>
            ) : !negocio.facebookPageId ? (
              <Card>
                <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 12px' }}>{t.resenas.facebookConectar}</p>
                <button style={{ background:'#1877f2', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, cursor:'pointer' }}>{t.resenas.facebookConectarBtn}</button>
              </Card>
            ) : (
              <Card><p style={{ color:'var(--text-2)', fontSize:13 }}>{t.resenas.facebookActivo}</p></Card>
            )}
          </div>
        </div>
      )}

      {/* TAB Comentarios — comentarios en publicaciones propias (TikTok) */}
      {tab==='comentarios' && (() => {
        const tc = t.comentarios;
        // Antes esto miraba SOLO a TikTok, así que un negocio con Instagram
        // conectado veía el cartel de "conecta TikTok" y ni uno de sus
        // comentarios — con el contador de la pestaña diciendo que sí los
        // había. Al sumar una red nueva, sumarla también aquí.
        const TODAS = [
          { id:'tiktok',    etiqueta:'TikTok',    datos:comConexiones?.tiktok },
          { id:'instagram', etiqueta:'Instagram', datos:comConexiones?.instagram },
        ];
        const redes = TODAS.filter(r => r.datos?.conectado);
        const conectado = redes.length > 0;
        // Para el cartel de "no hay nada conectado": solo se nombran las redes
        // que el backend declara `disponible`. Instagram no lo está mientras
        // Meta revisa la app, así que no se le pide al usuario que conecte algo
        // cuyo botón está escondido (ver lib/instagramVisible.js en el backend).
        const conectables = TODAS.filter(r => r.datos?.disponible).map(r => r.etiqueta);
        const hayFiltro = !!(comFiltro.sentimiento || comFiltro.pendientes);
        const TONO = {
          negativo:{ c:'#f87171', bg:'rgba(239,68,68,0.1)',  bd:'rgba(239,68,68,0.3)' },
          positivo:{ c:'#22c55e', bg:'rgba(34,197,94,0.1)',  bd:'rgba(34,197,94,0.25)' },
          neutro:  { c:'var(--text-3)', bg:'var(--surface2)', bd:'var(--border-c)' },
        };
        const chip = (activo) => ({
          padding:'4px 11px', borderRadius:14, fontSize:11.5, cursor:'pointer',
          border:`1px solid ${activo?'#0B7324':'var(--border-c)'}`,
          background:activo?'#0B7324':'transparent', color:activo?'#fff':'var(--text-2)',
        });

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:'0 0 2px' }}>{tc.titulo}</p>
              <p style={{ fontSize:12, color:'var(--text-2)', margin:0, lineHeight:1.5 }}>{tc.sub}</p>
            </div>

            {/* Estado de conexión antes que nada: sin cuenta conectada, "no hay
                comentarios" sería engañoso — no hay de dónde traerlos. */}
            {comConexiones && !conectado ? (
              <Card>
                <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 10px' }}>{tc.sinConectar(conectables)}</p>
                <Link href="/dashboard/conexiones" style={{ color:'#4CAF66', fontSize:13, textDecoration:'none' }}>
                  {tc.irAConectar}
                </Link>
              </Card>
            ) : (
              <>
                {/* Tarjeta por cada cuenta conectada. Es lo que hace que el panel
                    se sienta de ALGUIEN y no un tablero genérico: foto, nombre y
                    @. Antes solo existía para TikTok; ahora se pinta igual para
                    cualquier red, que además es lo que permite al dueño detectar
                    que conectó la cuenta equivocada. */}
                {redes.map(({ id, etiqueta, datos }) => (
                  <Card key={id} style={{ padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                      {datos.avatar ? (
                        <img src={datos.avatar} alt="" width={44} height={44}
                          style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', border:'1px solid var(--border-c)', flexShrink:0 }}
                          onError={e => { e.currentTarget.style.display='none'; }} />
                      ) : (
                        <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(11,115,36,0.12)', color:'#4CAF66',
                                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:700, flexShrink:0 }}>
                          {(datos.nombre || etiqueta).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <span style={{ color:'var(--text)', fontSize:15, fontWeight:600 }}>
                            {datos.nombre || etiqueta}
                          </span>
                          {/* En TikTok el @ solo existe si el scope
                              user.info.profile está aprobado; en Instagram viene
                              siempre con instagram_basic. */}
                          {datos.username && (
                            <span style={{ color:'var(--text-3)', fontSize:12.5 }}>@{datos.username}</span>
                          )}
                          <span style={{ fontSize:10.5, color:'#22c55e', background:'rgba(34,197,94,0.1)',
                                         border:'1px solid rgba(34,197,94,0.25)', padding:'1px 8px', borderRadius:9 }}>
                            {etiqueta}
                          </span>
                        </div>
                        {/* Decir "escuchando" con el token muerto es lo que hacía
                            que un video recién subido no apareciera sin ninguna
                            explicación en el panel. */}
                        {datos.estado === 'vencida' ? (
                          <p style={{ color:'#f59e0b', fontSize:11.5, margin:'3px 0 0' }}>{tc.conexionVencida}</p>
                        ) : (
                          <p style={{ color:'var(--text-3)', fontSize:11.5, margin:'3px 0 0' }}>{tc.escuchando}</p>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
                        {datos.url && (
                          <a href={datos.url} target="_blank" rel="noopener noreferrer"
                            style={{ color:'#4CAF66', fontSize:11.5, textDecoration:'none' }}>{tc.verPerfil}</a>
                        )}
                        <Link href="/dashboard/conexiones" style={{ color:'var(--text-3)', fontSize:11.5, textDecoration:'none' }}>
                          {tc.gestionarConexion}
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}

                <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                  {[[tc.totalLabel, comResumen.total, null],
                    [tc.negativosLabel, comResumen.negativos, comResumen.negativos ? '#f87171' : null],
                    [tc.pendientesLabel, comResumen.sinResponder, comResumen.sinResponder ? '#f59e0b' : null],
                  ].map(([label, valor, color]) => (
                    <div key={label}>
                      <p style={{ margin:0, fontSize:11.5, color:'var(--text-3)' }}>{label}</p>
                      <p style={{ margin:'2px 0 0', fontSize:20, fontWeight:700, color:color || 'var(--text)' }}>{valor}</p>
                    </div>
                  ))}
                </div>

                {/* Videos propios. Es lo único que la API de TikTok deja leer hoy
                    de las publicaciones (ver CLAUDE.md §15-quinquies), y evita que
                    el tab se vea muerto cuando la cuenta sí está funcionando. */}
                {comVideos?.length > 0 && (
                  <Card>
                    <p style={{ margin:'0 0 2px', fontSize:13.5, fontWeight:600, color:'var(--text)' }}>{tc.videosTitulo}</p>
                    <p style={{ margin:'0 0 12px', fontSize:11.5, color:'var(--text-3)' }}>{tc.videosDesc}</p>

                    <div style={{ display:'flex', flexDirection:'column' }}>
                      {comVideos.map((v, i) => (
                        <div key={v.id} style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
                                                 padding:'9px 0', borderTop: i ? '1px solid var(--border-c)' : 'none' }}>
                          {/* La miniatura es lo que hace reconocible el video de un
                              vistazo. La URL viene firmada por TikTok y caduca, por
                              eso el onError deja el hueco limpio en vez de un ícono roto. */}
                          {v.portada && (
                            <button onClick={() => v.embed && setComVideoAbierto(v)}
                              title={v.embed ? tc.videosReproducir : undefined}
                              style={{ padding:0, border:'none', background:'none', lineHeight:0, flexShrink:0,
                                       cursor: v.embed ? 'pointer' : 'default', position:'relative' }}>
                              <img src={v.portada} alt="" width={124} height={165}
                                style={{ width:124, height:165, objectFit:'cover', borderRadius:9, border:'1px solid var(--border-c)', display:'block' }}
                                onError={e => { e.currentTarget.parentElement.style.display='none'; }} />
                              {v.embed && (
                                <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <span style={{ width:38, height:38, borderRadius:'50%', background:'rgba(0,0,0,0.5)',
                                                 border:'1.5px solid rgba(255,255,255,0.85)', color:'#fff', fontSize:14,
                                                 display:'flex', alignItems:'center', justifyContent:'center', paddingLeft:3 }}>▶</span>
                                </span>
                              )}
                            </button>
                          )}
                          <div style={{ flex:1, minWidth:180 }}>
                            <p onClick={() => v.embed && setComVideoAbierto(v)}
                              style={{ margin:0, fontSize:13.5, color:'var(--text)', cursor: v.embed ? 'pointer' : 'default' }}>
                              {v.titulo?.trim() || tc.videosSinTitulo}
                            </p>
                            <p style={{ margin:'2px 0 0', fontSize:11.5, color:'var(--text-3)' }}>
                              {v.fecha ? new Date(v.fecha).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE',
                                { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
                              {v.vistas !== null && v.vistas !== undefined ? ` · ${tc.videosVistas(v.vistas)}` : ''}
                            </p>
                          </div>
                          {v.comentarios !== null && v.comentarios !== undefined && (
                            <span style={{ fontSize:11.5, color: v.comentarios ? '#4CAF66' : 'var(--text-3)',
                                           background: v.comentarios ? 'rgba(11,115,36,0.1)' : 'var(--surface2)',
                                           border:'1px solid var(--border-c)', padding:'2px 9px', borderRadius:9, whiteSpace:'nowrap' }}>
                              {tc.videosComentarios(v.comentarios)}
                            </span>
                          )}
                          {v.url && (
                            <a href={v.url} target="_blank" rel="noopener noreferrer"
                              style={{ color:'#4CAF66', fontSize:11.5, textDecoration:'none', whiteSpace:'nowrap' }}>
                              {tc.videosResponder}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>

                  </Card>
                )}

                {/* Reproductor dentro del panel. Se usa el `embed_link` de TikTok
                    en un iframe: su player responde sin x-frame-options, así que
                    no hace falta cargar el script de embed de TikTok (que además
                    traería su propio tracking a nuestro dashboard). */}
                {comVideoAbierto?.embed && (
                  <div onClick={() => setComVideoAbierto(null)}
                    style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:60,
                             display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
                    <div onClick={e => e.stopPropagation()}
                      style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:14,
                               padding:12, maxWidth:400, width:'100%' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:9 }}>
                        <p style={{ margin:0, fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {comVideoAbierto.titulo?.trim() || tc.videosSinTitulo}
                        </p>
                        <button onClick={() => setComVideoAbierto(null)}
                          style={{ background:'none', border:'none', color:'var(--text-3)', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                          {tc.videosCerrar}
                        </button>
                      </div>
                      <div style={{ position:'relative', width:'100%', paddingTop:'177%', borderRadius:10, overflow:'hidden', background:'#000' }}>
                        <iframe src={comVideoAbierto.embed} title={comVideoAbierto.titulo || 'TikTok'}
                          allow="autoplay; encrypted-media; fullscreen" allowFullScreen
                          style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }} />
                      </div>
                      {comVideoAbierto.url && (
                        <a href={comVideoAbierto.url} target="_blank" rel="noopener noreferrer"
                          style={{ display:'inline-block', marginTop:9, color:'#4CAF66', fontSize:11.5, textDecoration:'none' }}>
                          {tc.videosResponder}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                  {[{ v:'', l:tc.filtroTodos }, { v:'negativo', l:tc.negativo }, { v:'positivo', l:tc.positivo }, { v:'neutro', l:tc.neutro }].map(f => (
                    <button key={f.v || 'todos'} onClick={() => setComFiltro(x => ({ ...x, sentimiento:f.v }))}
                      style={chip(comFiltro.sentimiento === f.v)}>{f.l}</button>
                  ))}
                  <span style={{ width:1, height:16, background:'var(--border-c)', margin:'0 4px' }} />
                  <button onClick={() => setComFiltro(x => ({ ...x, pendientes: x.pendientes === '1' ? '' : '1' }))}
                    style={chip(comFiltro.pendientes === '1')}>{tc.soloPendientes}</button>
                </div>

                {comentarios === null ? null : comentarios.length === 0 ? (
                  <Card>
                    <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 4px', fontWeight:600 }}>
                      {hayFiltro ? tc.vacioFiltro : tc.vacio}
                    </p>
                    {/* Con la cuenta conectada, "se revisan cada 4 horas" era falso
                        y contradecía lo que muestra el resto del tab: el escaneo
                        corre, pero TikTok no expone los comentarios (§15-quinquies).
                        Sin cuenta conectada el texto genérico sí aplica. */}
                    {!hayFiltro && (
                      <p style={{ color:'var(--text-3)', fontSize:12, margin:0, lineHeight:1.55 }}>
                        {conectado ? tc.vacioDescTikTok : tc.vacioDesc}
                      </p>
                    )}
                  </Card>
                ) : agrupadosPorPublicacion(comentarios).map(([pubId, delGrupo]) => (
                  <div key={pubId} style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {/* Cabecera de la publicación. Sin esto la lista es plana y
                        con varias publicaciones no se sabe a cuál pertenece cada
                        comentario, que es justo lo que hay que saber para
                        responder con sentido. */}
                    {(() => {
                      const pub = comPublicaciones[pubId];
                      if (!pub && pubId === '__sin__') return null;
                      const titulo = (pub?.titulo || delGrupo[0]?.publicacionTitulo || '').trim();
                      return (
                        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:6 }}>
                          {pub?.imagen ? (
                            <img src={pub.imagen} alt="" width={52} height={52}
                              style={{ width:52, height:52, borderRadius:10, objectFit:'cover',
                                       border:'1px solid var(--border-c)', flexShrink:0 }}
                              onError={e => { e.currentTarget.style.visibility='hidden'; }} />
                          ) : (
                            <div style={{ width:52, height:52, borderRadius:10, background:'var(--surface2)',
                                          border:'1px solid var(--border-c)', flexShrink:0 }} />
                          )}
                          <div style={{ minWidth:0, flex:1 }}>
                            <p style={{ margin:0, fontSize:13, color:'var(--text)', fontWeight:600,
                                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {titulo || tc.publicacionSinTitulo}
                            </p>
                            <p style={{ margin:'2px 0 0', fontSize:11.5, color:'var(--text-3)' }}>
                              {tc.comentariosEnPublicacion(delGrupo.length)}
                            </p>
                          </div>
                          {pub?.url && (
                            <a href={pub.url} target="_blank" rel="noopener noreferrer"
                              style={{ color:'#4CAF66', fontSize:11.5, textDecoration:'none', flexShrink:0 }}>
                              {tc.verPublicacion}
                            </a>
                          )}
                        </div>
                      );
                    })()}
                    {delGrupo.map(c => {
                  const tono = TONO[c.sentimiento] || TONO.neutro;
                  return (
                    <Card key={c.id} style={{ borderLeft:`3px solid ${tono.c}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'flex-start' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', minWidth:0 }}>
                          {/* Inicial en vez de foto, y no por falta de ganas: NI
                              Instagram NI TikTok dan la foto de quien comenta.
                              Comprobado contra la API el 2026-08-14 — el campo
                              `from` de un comentario devuelve solo {id, username}
                              y pedir `profile_picture_url` responde "nonexisting
                              field". La única vía sería `business_discovery`, que
                              exige que el comentarista tenga cuenta profesional
                              (la mayoría no la tiene) y costaría una llamada por
                              cada uno. Mismo patrón que las reseñas. */}
                          <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(11,115,36,0.12)',
                                        color:'#4CAF66', display:'flex', alignItems:'center', justifyContent:'center',
                                        fontSize:12, fontWeight:700, flexShrink:0 }}>
                            {(c.autorNombre || '?').charAt(0).toUpperCase()}
                          </div>
                          <span style={{ color:'var(--text)', fontSize:13.5, fontWeight:600 }}>{c.autorNombre || '—'}</span>
                          <span style={{ fontSize:11, color:'var(--text-3)', background:'var(--surface2)',
                                         border:'1px solid var(--border-c)', padding:'2px 8px', borderRadius:9 }}>
                            {nombreRed(c.plataforma)}
                          </span>
                          <span style={{ fontSize:11, color:tono.c, background:tono.bg,
                                         border:`1px solid ${tono.bd}`, padding:'2px 8px', borderRadius:9 }}>
                            {tc[c.sentimiento] || tc.neutro}
                          </span>
                          {c.respondida && (
                            <span style={{ fontSize:11, color:'#22c55e', background:'rgba(34,197,94,0.1)',
                                           border:'1px solid rgba(34,197,94,0.25)', padding:'2px 8px', borderRadius:9 }}>
                              {tc.respondido}
                            </span>
                          )}
                          {c.fijado && (
                            <span style={{ fontSize:11, color:'var(--text-3)', background:'var(--surface2)',
                                           border:'1px solid var(--border-c)', padding:'2px 8px', borderRadius:9 }}>
                              {tc.fijado}
                            </span>
                          )}
                          {c.oculto && (
                            <span style={{ fontSize:11, color:'#f59e0b', background:'rgba(245,158,11,0.1)',
                                           border:'1px solid rgba(245,158,11,0.25)', padding:'2px 8px', borderRadius:9 }}>
                              {tc.oculto}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize:11.5, color:'var(--text-3)', whiteSpace:'nowrap' }}>
                          {c.fechaComentario ? new Date(c.fechaComentario).toLocaleDateString(idioma==='en'?'en-US':'es-PE', { day:'numeric', month:'short' }) : ''}
                        </span>
                      </div>

                      <p style={{ color:'var(--text-2)', fontSize:13.5, margin:'9px 0 0', lineHeight:1.6 }}>{c.texto}</p>

                      {/* De qué video es el comentario. Si ese video está entre los
                          que TikTok devolvió, se muestra su miniatura y se puede
                          reproducir: leer "en el video: lana" no dice nada, verlo sí. */}
                      {(() => {
                        const suVideo = comVideos?.find(v => v.id === c.publicacionId);
                        if (!suVideo && !c.publicacionTitulo) return null;
                        return (
                          <div style={{ display:'flex', alignItems:'center', gap:9, margin:'8px 0 0' }}>
                            {suVideo?.portada && (
                              <button onClick={() => suVideo.embed && setComVideoAbierto(suVideo)}
                                title={suVideo.embed ? tc.videosReproducir : undefined}
                                style={{ padding:0, border:'none', background:'none', lineHeight:0, flexShrink:0,
                                         cursor: suVideo.embed ? 'pointer' : 'default' }}>
                                <img src={suVideo.portada} alt="" width={32} height={42}
                                  style={{ width:32, height:42, objectFit:'cover', borderRadius:5, border:'1px solid var(--border-c)', display:'block' }}
                                  onError={e => { e.currentTarget.parentElement.style.display='none'; }} />
                              </button>
                            )}
                            {/* El texto de la publicación ya está en la cabecera
                                del grupo, así que aquí solo se nombra la fuente.
                                Antes decía "En el video" también en Instagram,
                                donde no hay videos sino publicaciones: resto de
                                cuando esto solo leía TikTok. */}
                            <p style={{ color:'var(--text-3)', fontSize:11.5, margin:0 }}>
                              {c.plataforma === 'TIKTOK' ? tc.enVideo : tc.enPublicacion}
                            </p>
                          </div>
                        );
                      })()}

                      {c.respondida ? (
                        <div style={{ marginTop:10, paddingLeft:11, borderLeft:'2px solid var(--border-c)' }}>
                          <p style={{ color:'var(--text-3)', fontSize:11, margin:'0 0 2px' }}>{tc.tuRespuesta}</p>
                          <p style={{ color:'var(--text-2)', fontSize:12.5, margin:0, lineHeight:1.55 }}>{c.respuesta}</p>
                          {/* Borrar la respuesta PROPIA, para reescribirla. Solo si
                              tenemos su id en la plataforma: las publicadas antes
                              del 2026-08-06 no lo tienen y el worker lo rellena
                              luego.
                              Los textos nombran la RED del comentario: decían
                              "TikTok" fijo y el mismo botón se usa en Instagram,
                              así que al borrar una respuesta de Instagram el aviso
                              hablaba de otra red. */}
                          {c.respuestaExternalId && (
                            <button title={tc.borrarRespuestaAyuda(nombreRed(c.plataforma))} disabled={comModerando === c.id}
                              onClick={() => (comBorrando === c.id ? borrarRespuesta(c.id) : setComBorrando(c.id))}
                              onBlur={() => setComBorrando(b => (b === c.id ? null : b))}
                              style={{ marginTop:7, fontSize:11,
                                       color: comBorrando === c.id ? '#f87171' : 'var(--text-3)',
                                       background:'transparent',
                                       border:`1px solid ${comBorrando === c.id ? 'rgba(248,113,113,0.4)' : 'var(--border-c)'}`,
                                       padding:'4px 11px', borderRadius:9,
                                       cursor: comModerando === c.id ? 'wait' : 'pointer' }}>
                              {comBorrando === c.id ? tc.confirmarBorrado(nombreRed(c.plataforma)) : tc.borrarRespuesta}
                            </button>
                          )}
                        </div>
                      ) : !c.publicacionId ? (
                        <p style={{ color:'var(--text-3)', fontSize:11.5, margin:'10px 0 0', fontStyle:'italic' }}>
                          {tc.sinVideoOrigen}
                        </p>
                      ) : (() => {
                        // Caja siempre visible, sin paso previo: responder es la
                        // acción principal de esta pantalla y no merece un clic
                        // de peaje. Enter envía; Shift+Enter hace salto de línea.
                        const texto = comTexto[c.id] || '';
                        const enviando = comEnviando === c.id;
                        const vacio = !texto.trim();
                        return (
                        <div style={{ marginTop:10, display:'flex', gap:8, alignItems:'flex-start' }}>
                          <textarea value={texto}
                            onChange={e => setComTexto(t => ({ ...t, [c.id]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responderComentario(c.id); }
                            }}
                            placeholder={tc.placeholder} rows={1} maxLength={500}
                            style={{ flex:1, background:'var(--surface2)', color:'var(--text)',
                                     border:'1px solid var(--border-c)', borderRadius:9, padding:'9px 11px',
                                     fontSize:13, resize:'vertical', fontFamily:'inherit', minHeight:38 }} />
                          <button onClick={() => responderComentario(c.id)} disabled={enviando || vacio}
                            style={{ fontSize:12, color:'#fff', background:'#0B7324', border:'none',
                                     padding:'9px 15px', borderRadius:9, flexShrink:0,
                                     cursor:(enviando || vacio) ? 'not-allowed' : 'pointer',
                                     opacity:(enviando || vacio) ? 0.5 : 1 }}>
                            {enviando ? tc.enviando : tc.enviar}
                          </button>
                        </div>
                        );
                      })()}
                      {comError[c.id] && (
                        <p style={{ color:'#f87171', fontSize:11.5, margin:'6px 0 0' }}>{comError[c.id]}</p>
                      )}
                      {/* Moderación. Va aparte del bloque de respuesta a
                          propósito: ocultar y fijar siguen teniendo sentido en un
                          comentario ya respondido. Se muestran solo en TikTok y
                          solo si sabemos de qué video es, porque la API exige el
                          video_id. Borrar NO se expone: es irreversible y suele
                          escalar el conflicto; ocultar consigue lo mismo sin que
                          el autor se entere. */}
                      {c.plataforma === 'TIKTOK' && c.publicacionId && (
                        <div style={{ display:'flex', gap:7, marginTop:9, flexWrap:'wrap' }}>
                          {[
                            { accion:'ocultar', activo:c.oculto, on:tc.mostrar, off:tc.ocultar, ayuda:tc.ocultarAyuda },
                            { accion:'fijar',   activo:c.fijado, on:tc.desfijar, off:tc.fijar,  ayuda:tc.fijarAyuda },
                          ].map(({ accion, activo, on, off, ayuda }) => (
                            <button key={accion} title={ayuda} disabled={comModerando === c.id}
                              onClick={() => moderarComentario(c.id, accion, !activo)}
                              style={{ fontSize:11, color:'var(--text-3)', background:'transparent',
                                       border:'1px solid var(--border-c)', padding:'4px 11px', borderRadius:9,
                                       cursor: comModerando === c.id ? 'wait' : 'pointer',
                                       opacity: comModerando === c.id ? 0.5 : 1 }}>
                              {activo ? on : off}
                            </button>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })()}

      {/* La pestaña Sospechosas se fusionó dentro de Reseñas (2026-07-29): las
          tarjetas ahí ya muestran el motivo de sospecha, el borde rojo y el botón
          de reportar, y el filtro "Sospechosas" hace de acceso directo. */}

      {/* TAB Alertas */}
      {tab==='alertas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {!negocio.alertas?.length ? (
            <Card style={{ textAlign:'center', padding:40 }}><div style={{ display:'flex', justifyContent:'center' }}><Icon name="checkCirc" size={36} color="#0B7324" /></div><p style={{ color:'var(--text)', fontWeight:600, marginTop:10 }}>{t.alertas.sinAlertas}</p></Card>
          ) : negocio.alertas.map(a => (
            <Card key={a.id} style={{ border:a.leida?'1px solid var(--border-c)':'1px solid rgba(245,158,11,0.3)', opacity:a.leida?0.7:1 }}>
              <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                <Icon name={ICONO_ALERTA[a.tipo]||'alerta'} size={20} color="#f59e0b" style={{ marginTop:2 }} />
                <div>
                  <div style={{ display:'flex', gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:11, color:'#4CAF66', fontWeight:500, textTransform:'uppercase' }}>{etiquetaAlerta(a.tipo, idioma)}</span>
                    <span style={{ fontSize:11, background:'var(--surface2)', color:'var(--text-3)', padding:'0 6px', borderRadius:4 }}>{a.plataforma}</span>
                  </div>
                  <p style={{ color:'var(--text-2)', fontSize:13, lineHeight:1.5, margin:'0 0 4px' }}>{textoAlerta(a, idioma)}</p>
                  <p style={{ color:'var(--text-3)', fontSize:11, margin:0 }}>{new Date(a.creadaEn).toLocaleString(idioma==='en'?'en-US':'es-PE',{timeZone:'America/Lima',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* TAB Competencia */}
      {tab==='competencia' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Card>
            <ST>{t.competencia.agregarTitulo}</ST>
            <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 12px', lineHeight:1.6 }}>
              {t.competencia.agregarDesc}
            </p>
            {compError && (
              <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:8, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <span style={{ color:'#f59e0b', fontSize:13 }}>{compError}</span>
                {compError.includes('plan') && <Link href="/dashboard/planes" style={{ background:'#0B7324', color:'#fff', padding:'6px 14px', borderRadius:6, fontSize:12, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>{t.competencia.verPlanes}</Link>}
              </div>
            )}
            <div style={{ position:'relative' }}>
              <input value={compBusqueda} onChange={e => setCompBusqueda(e.target.value)}
                placeholder={t.competencia.buscarPlaceholder(labelParaTipo(negocio.tipo, idioma).toLowerCase())}
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:8, padding:'10px 13px', fontSize:13, outline:'none', boxSizing:'border-box' }} />
              {(compBuscando || compResultados.length > 0) && (
                <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:10, overflow:'hidden', zIndex:20, boxShadow:'0 8px 24px rgba(0,0,0,0.25)' }}>
                  {compBuscando ? <div style={{ padding:'12px 14px', color:'var(--text-2)', fontSize:13 }}>{t.competencia.buscando}</div>
                    : compResultados.map(r => (
                      <button key={r.placeId} type="button" onClick={() => agregarCompetidor(r)} disabled={compAgregando}
                        style={{ width:'100%', textAlign:'left', padding:'11px 14px', borderBottom:'1px solid var(--border-c)', background:'none', border:'none', cursor:'pointer' }}>
                        <div style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{r.nombre}</div>
                        <div style={{ color:'var(--text-3)', fontSize:11, marginTop:2 }}>{r.direccion}</div>
                        {r.rating && <div style={{ color:'#facc15', fontSize:11, marginTop:2 }}>★ {r.rating} · {t.competencia.resenasCount(r.totalResenas?.toLocaleString())}</div>}
                      </button>
                    ))}
                </div>
              )}
            </div>
            {usuario?.plan === 'GRATIS' && (
              <p style={{ fontSize:11, color:'var(--text-3)', margin:'8px 0 0' }}>
                {t.competencia.planIncluye} <Link href="/dashboard/planes" style={{ color:'#4CAF66' }}>{t.competencia.monitoreaHasta5}</Link>
              </p>
            )}
          </Card>

          {competidores.length === 0 ? (
            <Card style={{ textAlign:'center', padding:36 }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:10 }}><Icon name="grafica" size={32} color="var(--text-3)" /></div>
              <p style={{ color:'var(--text)', fontWeight:600, margin:'0 0 4px' }}>{t.competencia.sinCompetidores}</p>
              <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>{t.competencia.sinCompetidoresDesc}</p>
            </Card>
          ) : (
            <Card>
              <ST>{t.competencia.comparativa}</ST>
              {/* Tu negocio primero, como referencia */}
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'rgba(11,115,36,0.08)', border:'1px solid rgba(11,115,36,0.3)', borderRadius:10, marginBottom:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ color:'var(--text)', fontSize:13, fontWeight:700 }}>{negocio.nombre}</span>
                  <span style={{ color:'#4CAF66', fontSize:11, marginLeft:8 }}>{t.competencia.tuNegocio}</span>
                </div>
                <span style={{ color:'#facc15', fontWeight:700, fontSize:15 }}>★ {snap?.ratingActual ?? '—'}</span>
                <span style={{ color:'var(--text-3)', fontSize:11, width:90, textAlign:'right' }}>{t.competencia.resenasCount(snap?.totalResenas?.toLocaleString() ?? '—')}</span>
              </div>
              {competidores.map(c => {
                const delta = snap?.ratingActual != null && c.ratingActual != null ? (snap.ratingActual - c.ratingActual) : null;
                const analisis = analisisComp[c.id];
                return (
                  <div key={c.id} style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:10, marginBottom:8, overflow:'hidden' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <span style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{c.nombre}</span>
                        {delta != null && (
                          <span style={{ fontSize:11, marginLeft:8, color: delta >= 0 ? '#22c55e' : '#f87171' }}>
                            {delta >= 0 ? t.competencia.leGanasPor(delta.toFixed(1)) : t.competencia.teGanaPor(Math.abs(delta).toFixed(1))}
                          </span>
                        )}
                      </div>
                      <span style={{ color:'#facc15', fontWeight:700, fontSize:15 }}>★ {c.ratingActual ?? '—'}</span>
                      <span style={{ color:'var(--text-3)', fontSize:11, width:90, textAlign:'right' }}>{t.competencia.resenasCount(c.totalResenas?.toLocaleString() ?? '—')}</span>
                      {usuario?.plan === 'GRATIS' ? (
                        <Link href="/dashboard/planes" style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'#4CAF66', borderRadius:8, padding:'6px 12px', fontSize:11.5, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>
                          {t.competencia.analisisPlanPago}
                        </Link>
                      ) : (
                        <button onClick={() => analizarCompetidor(c.id)} disabled={analisis?.cargando}
                          title={t.competencia.analizarTitle}
                          style={{ background:'#0B7324', border:'none', color:'#fff', borderRadius:8, padding:'6px 12px', fontSize:11.5, fontWeight:600, cursor:analisis?.cargando?'wait':'pointer', display:'inline-flex', alignItems:'center', gap:6, opacity:analisis?.cargando?0.7:1, whiteSpace:'nowrap' }}>
                          <Icon name="destello" size={11} /> {analisis?.cargando ? t.competencia.analizando : analisis?.texto ? t.competencia.actualizarAnalisis : t.competencia.analizarConIA}
                        </button>
                      )}
                      <button onClick={() => eliminarCompetidor(c.id)} title={t.competencia.dejarMonitorear}
                        style={{ background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', padding:4, display:'flex' }}>
                        <Icon name="basura" size={14} />
                      </button>
                    </div>

                    {analisis?.error && (
                      <div style={{ borderTop:'1px solid var(--border-c)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <span style={{ color:'#f59e0b', fontSize:12 }}>{analisis.error}</span>
                        {analisis.upsell && <Link href="/dashboard/planes" style={{ background:'#0B7324', color:'#fff', padding:'5px 12px', borderRadius:6, fontSize:11.5, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>{t.competencia.verPlanes}</Link>}
                      </div>
                    )}

                    {analisis?.texto && (
                      <div style={{ borderTop:'1px solid var(--border-c)', padding:'14px 16px', background:'var(--surface)' }}>
                        <p style={{ fontSize:10.5, fontWeight:700, color:'#4CAF66', textTransform:'uppercase', letterSpacing:0.8, margin:'0 0 10px', display:'flex', alignItems:'center', gap:6 }}>
                          <Icon name="destello" size={12} /> {t.competencia.analisisTitulo}
                        </p>
                        {analisis.texto.split('\n').filter(l => l.trim()).map((linea, i) => {
                          const esTitulo = /^(FORTALEZAS|DEBILIDADES|QUEJAS|COMO TOMAR)/i.test(linea.trim());
                          const esVineta = linea.trim().startsWith('-');
                          if (esTitulo) return <p key={i} style={{ fontSize:12, fontWeight:700, color:'var(--text)', margin:'12px 0 5px', textTransform:'capitalize' }}>{linea.replace(/:$/,'').toLowerCase().replace(/^./, ch => ch.toUpperCase())}</p>;
                          if (esVineta) return (
                            <div key={i} style={{ display:'flex', gap:8, marginBottom:5, alignItems:'flex-start' }}>
                              <span style={{ color:'#4CAF66', flexShrink:0, fontSize:12 }}>→</span>
                              <span style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.6 }}>{linea.replace(/^-\s*/, '')}</span>
                            </div>
                          );
                          return <p key={i} style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.6, margin:'0 0 6px' }}>{linea}</p>;
                        })}
                        <p style={{ fontSize:10.5, color:'var(--text-3)', margin:'10px 0 0' }}>{t.competencia.analisisBasado}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* TAB Comparación automática (Franquicia) */}
      {tab==='competenciaAuto' && (
        <div>
          {usuario?.plan !== 'FRANQUICIA' ? (
            <BloqueoPlan mensaje={t.competenciaAuto.bloqueo}>
              <Card>
                <ST>{t.competenciaAuto.titulo}</ST>
                <p style={{ fontSize:13, color:'var(--text-2)', margin:'0 0 14px', lineHeight:1.6 }}>{t.competenciaAuto.descripcion}</p>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border-c)' }}>
                  <span style={{ fontSize:13, color:'var(--text)' }}>{t.competenciaAuto.tuNegocio}</span>
                  <span style={{ fontSize:13, color:'#facc15', fontWeight:700 }}>★ {snap?.ratingActual ?? '4.5'}</span>
                </div>
                {['Competidor A', 'Competidor B', 'Competidor C'].map((nombre, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:i<2?'1px solid var(--border-c)':'none' }}>
                    <span style={{ fontSize:13, color:'var(--text-2)' }}>{nombre}</span>
                    <span style={{ fontSize:13, color:'#facc15', fontWeight:700 }}>★ {(4.3 - i*0.2).toFixed(1)}</span>
                  </div>
                ))}
              </Card>
            </BloqueoPlan>
          ) : (
            <Card>
              <ST>{t.competenciaAuto.titulo}</ST>
              <p style={{ fontSize:13, color:'var(--text-2)', margin:'0 0 14px', lineHeight:1.6 }}>{t.competenciaAuto.descripcion}</p>
              {competenciaAutoCargando ? (
                <p style={{ fontSize:13, color:'var(--text-2)' }}>{t.competenciaAuto.cargando}</p>
              ) : competenciaAutoError ? (
                <p style={{ fontSize:13, color:'#f87171' }}>{competenciaAutoError}</p>
              ) : competenciaAuto ? (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border-c)' }}>
                    <span style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{t.competenciaAuto.tuNegocio}</span>
                    <span style={{ fontSize:13, color:'#facc15', fontWeight:700 }}>
                      ★ {competenciaAuto.miNegocio?.rating ?? '—'}
                      {competenciaAuto.miNegocio?.totalResenas != null && <span style={{ color:'var(--text-3)', fontWeight:400, marginLeft:6 }}>({t.competenciaAuto.resenasCount(competenciaAuto.miNegocio.totalResenas)})</span>}
                    </span>
                  </div>
                  {competenciaAuto.competidores?.map((c, i) => (
                    <div key={c.googlePlaceId || i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border-c)' }}>
                      <span style={{ fontSize:13, color:'var(--text-2)' }}>{c.nombre}</span>
                      <span style={{ fontSize:13, color:'#facc15', fontWeight:700 }}>
                        ★ {c.rating} <span style={{ color:'var(--text-3)', fontWeight:400, marginLeft:6 }}>({t.competenciaAuto.resenasCount(c.totalResenas)})</span>
                      </span>
                    </div>
                  ))}
                  {competenciaAuto.promedioCompetencia != null && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0' }}>
                      <span style={{ fontSize:13, color:'var(--text-3)' }}>{t.competenciaAuto.promedioCompetencia}</span>
                      <span style={{ fontSize:13, color:'var(--text-3)', fontWeight:600 }}>★ {competenciaAuto.promedioCompetencia.toFixed(1)}</span>
                    </div>
                  )}
                </>
              ) : null}
            </Card>
          )}
        </div>
      )}

      {/* TAB Pedir reseñas */}
      {tab==='crecer' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:680 }}>
          {!linkResena ? (
            <Card style={{ textAlign:'center', padding:36 }}>
              <p style={{ color:'var(--text)', fontWeight:600, margin:'0 0 4px' }}>{t.crecer.conectaPrimero}</p>
              <p style={{ color:'var(--text-2)', fontSize:13, margin:0 }}>{t.crecer.conectaPrimeroDesc}</p>
            </Card>
          ) : (
            <>
              <Card>
                <ST>{t.crecer.enlaceTitulo}</ST>
                <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 12px', lineHeight:1.6 }}>
                  {t.crecer.enlaceDesc}
                </p>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <input readOnly value={linkResena} onClick={e => e.target.select()}
                    style={{ flex:1, minWidth:240, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:8, padding:'10px 13px', fontSize:12, outline:'none' }} />
                  <button onClick={() => copiar(linkResena, 'link')}
                    style={{ background:'#0B7324', color:'#fff', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
                    <Icon name="clipboard" size={14} /> {copiado==='link' ? t.crecer.copiado : t.crecer.copiarEnlace}
                  </button>
                </div>
              </Card>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
                <Card style={{ textAlign:'center' }}>
                  <ST>{t.crecer.qrTitulo}</ST>
                  <div style={{ background:'#fff', borderRadius:10, padding:14, display:'inline-block', margin:'4px 0 10px' }}>
                    {/* Se dibuja en el navegador (components/CodigoQR.js). Antes salía de
                        api.qrserver.com, que le mandaba a un tercero el enlace de reseñas
                        de cada cliente y hacía depender una función de pago de un
                        servicio gratuito ajeno. */}
                    <CodigoQR valor={linkResena} tamano={180} alt={t.crecer.qrAlt(negocio.nombre)} />
                  </div>
                  <p style={{ color:'var(--text-2)', fontSize:12, margin:'0 0 10px', lineHeight:1.5 }}>
                    {t.crecer.qrDesc}
                  </p>
                  <button onClick={() => descargarQR(linkResena, `QR-resenas-${(negocio.nombre || 'negocio').replace(/[^\w-]+/g, '-').slice(0, 40)}.png`)}
                    style={{ display:'inline-flex', alignItems:'center', gap:7, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:8, padding:'8px 16px', fontSize:12.5, cursor:'pointer' }}>
                    <Icon name="descargar" size={13} /> {t.crecer.altaResolucion}
                  </button>
                </Card>

                <Card>
                  <ST>{t.crecer.whatsappTitulo}</ST>
                  <p style={{ fontSize:11, color:'var(--text-3)', margin:'0 0 8px' }}>{t.crecer.whatsappHint}</p>
                  <textarea value={mensajeResena} onChange={e => setMsgWhatsApp(e.target.value)} rows={5}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:10, padding:'11px 13px', fontSize:12.5, lineHeight:1.6, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:8 }} />
                  {msgWhatsApp && msgWhatsApp !== mensajeResenaDefault && (
                    <button onClick={() => setMsgWhatsApp('')}
                      style={{ background:'none', border:'none', color:'var(--text-3)', fontSize:11, cursor:'pointer', padding:0, marginBottom:8, textDecoration:'underline' }}>
                      {t.crecer.restaurarMensaje}
                    </button>
                  )}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <button onClick={() => copiar(mensajeResena, 'msg')}
                      style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:8, padding:'9px', fontSize:12.5, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                      <Icon name="clipboard" size={13} /> {copiado==='msg' ? t.crecer.copiado : t.crecer.copiarMensaje}
                    </button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(mensajeResena)}`} target="_blank" rel="noopener noreferrer"
                      style={{ background:'#0B7324', color:'#fff', borderRadius:8, padding:'9px', fontSize:12.5, fontWeight:600, textDecoration:'none', textAlign:'center', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                      <Icon name="chat" size={13} /> {t.crecer.compartirWhatsApp}
                    </a>
                  </div>
                  <p style={{ fontSize:11, color:'var(--text-3)', margin:'10px 0 0', lineHeight:1.5 }}>
                    {t.crecer.consejoWhatsapp}
                  </p>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB Consejos — plan de acción dinámico según los datos del negocio */}
      {tab==='consejos' && (() => {
        const rating = snap?.ratingActual ?? null;
        const total = snap?.totalResenas ?? 0;
        const respondidas = todasResenas.filter(r => r.respondida).length;
        const tasaResp = todasResenas.length > 0 ? Math.round((respondidas / todasResenas.length) * 100) : null;
        const mejorComp = competidores.reduce((max, c) => (c.ratingActual ?? 0) > (max?.ratingActual ?? 0) ? c : max, null);
        const siguienteMeta = total < 50 ? 50 : total < 100 ? 100 : total < 250 ? 250 : total < 500 ? 500 : 1000;

        const consejos = [];

        // 1. Rating — siempre presente, cambia según la situación
        if (rating != null && rating < 4.0) {
          const tc = t.consejos.rating.bajo;
          consejos.push({ icono:'alerta', c:'#ef4444', urgente:true, titulo:tc.titulo(rating), dato:tc.dato(rating),
            porQue:tc.porQue,
            pasos:tc.pasos,
            cta:{ label:tc.cta, tabDestino:'resenas' } });
        } else if (rating != null && rating < 4.4) {
          const tc = t.consejos.rating.medio;
          consejos.push({ icono:'subida', c:'#f59e0b', titulo:tc.titulo((4.5 - rating).toFixed(1)), dato:tc.dato(rating),
            porQue:tc.porQue,
            pasos:tc.pasos,
            cta:{ label:tc.cta, tabDestino:'crecer' } });
        } else if (rating != null) {
          const tc = t.consejos.rating.alto;
          consejos.push({ icono:'escudo', c:'#22c55e', titulo:tc.titulo, dato:tc.dato(rating),
            porQue:tc.porQue,
            pasos:tc.pasos,
            // Ya no hay pestaña Sospechosas: se va a Reseñas con el filtro puesto,
            // que deja al usuario exactamente en la misma lista.
            cta:{ label:tc.cta, accion: () => { setFiltroEstado('sospechosas'); setTab('resenas'); } } });
        }

        // 2. Tasa de respuesta
        if (tasaResp != null) {
          const tc = t.consejos.respuesta;
          consejos.push({ icono:'chat', c: tasaResp >= 80 ? '#22c55e' : tasaResp >= 40 ? '#f59e0b' : '#ef4444', titulo: tasaResp >= 80 ? tc.tituloAlta : tc.tituloBaja(tasaResp), dato:tc.dato(tasaResp),
            porQue:tc.porQue,
            pasos:tc.pasos,
            cta:{ label:tc.cta, tabDestino:'resenas' } });
        }

        // 3. Volumen
        {
          const tc = t.consejos.volumen;
          consejos.push({ icono:'megafono', c:'#4CAF66', titulo:tc.titulo(siguienteMeta.toLocaleString()), dato:tc.dato(total.toLocaleString()),
            porQue:tc.porQue,
            pasos:tc.pasos,
            cta:{ label:tc.cta, tabDestino:'crecer' } });
        }

        // 4. Competencia
        if (mejorComp && snap) {
          const delta = (snap.ratingActual - (mejorComp.ratingActual ?? 0));
          const tc = t.consejos.competencia;
          consejos.push({ icono:'grafica', c: delta >= 0 ? '#22c55e' : '#f59e0b', titulo: delta >= 0 ? tc.tituloGanando(mejorComp.nombre) : tc.tituloPerdiendo(mejorComp.nombre, Math.abs(delta).toFixed(1)), dato:tc.dato(snap.ratingActual, mejorComp.ratingActual),
            porQue:tc.porQue,
            pasos: delta >= 0 ? tc.pasosGanando : tc.pasosPerdiendo,
            cta:{ label:tc.cta, tabDestino:'competencia' } });
        } else {
          const tc = t.consejos.competencia.sinCompetidor;
          consejos.push({ icono:'grafica', c:'#4CAF66', titulo:tc.titulo, dato:tc.dato,
            porQue:tc.porQue,
            pasos:tc.pasos,
            cta:{ label:tc.cta, tabDestino:'competencia' } });
        }

        // 5. Hábito de escaneo
        {
          const tc = t.consejos.habito;
          consejos.push({ icono:'buscar', c:'#4CAF66', titulo:tc.titulo, dato: usuario?.plan === 'GRATIS' ? tc.datoGratis : usuario?.plan === 'NEGOCIO' ? tc.datoNegocio : tc.datoFranquicia,
            porQue:tc.porQue,
            pasos:tc.pasos,
            cta: puedeEscanear && !escaneando ? { label:tc.cta, accion: escanear } : null });
        }

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 2px', lineHeight:1.6 }}>
              {t.consejos.planGeneradoPrefix}<strong style={{ color:'var(--text)' }}>{negocio.nombre}</strong>{t.consejos.planGeneradoSuffix}
            </p>
            {consejos.map((c, i) => (
              <div key={i} style={{ background:'var(--surface)', border:`1px solid ${c.urgente ? 'rgba(239,68,68,0.35)' : 'var(--border-c)'}`, borderRadius:14, padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:10, flexWrap:'wrap' }}>
                  <div style={{ display:'flex', gap:12, alignItems:'flex-start', flex:1, minWidth:240 }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:`${c.c}1A`, border:`1px solid ${c.c}55`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon name={c.icono} size={17} color={c.c} />
                    </div>
                    <div>
                      <p style={{ color:'var(--text)', fontWeight:700, fontSize:14.5, margin:'0 0 2px' }}>{c.titulo}</p>
                      <span style={{ fontSize:11, color:c.c, fontWeight:600 }}>{c.dato}</span>
                    </div>
                  </div>
                  {c.urgente && <span style={{ fontSize:10, fontWeight:700, color:'#f87171', background:'rgba(239,68,68,0.12)', padding:'3px 10px', borderRadius:8, textTransform:'uppercase', letterSpacing:0.8 }}>{t.consejos.urgente}</span>}
                </div>
                <p style={{ color:'var(--text-2)', fontSize:13, lineHeight:1.7, margin:'0 0 12px' }}>
                  <strong style={{ color:'var(--text-2)' }}>{t.consejos.porQueImporta}</strong>{c.porQue}
                </p>
                <div style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 16px', marginBottom: c.cta ? 12 : 0 }}>
                  {c.pasos.map((p, j) => (
                    <div key={j} style={{ display:'flex', gap:10, marginBottom: j < c.pasos.length-1 ? 8 : 0, alignItems:'flex-start' }}>
                      <span style={{ color:c.c, fontWeight:700, fontSize:12, flexShrink:0, width:16 }}>{j+1}.</span>
                      <span style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.6 }}>{p}</span>
                    </div>
                  ))}
                </div>
                {c.cta && (
                  <button onClick={() => c.cta.accion ? c.cta.accion() : setTab(c.cta.tabDestino)}
                    style={{ background:'transparent', border:`1px solid ${c.c}66`, color:c.c, borderRadius:8, padding:'8px 16px', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
                    {c.cta.label} →
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* TAB Ajustes */}
      {tab==='config' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:480 }}>
          <Card>
            <ST>{t.config.nombreTitulo}</ST>
            <NombreInput valorInicial={negocio.nombre} onGuardar={guardarNombre} />
          </Card>
          <Card>
            <ST>{t.config.colorTitulo}</ST>
            <p style={{ color:'var(--text-2)', fontSize:12, margin:'0 0 12px' }}>{t.config.colorDesc}</p>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {COLORES.map(c => (
                <button key={c} onClick={() => cambiarColor(c)} style={{ width:32, height:32, borderRadius:'50%', background:c, border:`3px solid ${color===c?'var(--text)':'transparent'}`, cursor:'pointer', transition:'all 0.15s', transform:color===c?'scale(1.15)':'scale(1)' }} />
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12 }}>
              <div style={{ width:14, height:14, borderRadius:'50%', background:color, border:'2px solid var(--border-c)' }} />
              <span style={{ fontSize:12, color:'var(--text-2)' }}>{t.config.colorActivo(color)}</span>
            </div>
          </Card>
          {/* Las conexiones se administran en /dashboard/conexiones, que las
              muestra para todos los negocios juntos. Acá solo queda el acceso
              para no duplicar la misma UI en dos sitios. */}
          <Card>
            <ST>{t.config.conexionesTitulo}</ST>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, paddingTop:4 }}>
              <p style={{ color:'var(--text-3)', fontSize:12, margin:0, lineHeight:1.5 }}>
                {t.config.conexionesDesc}
              </p>
              <Link href="/dashboard/conexiones"
                style={{ flexShrink:0, fontSize:12, color:'#4CAF66', textDecoration:'none', background:'rgba(11,115,36,0.1)', border:'1px solid rgba(11,115,36,0.3)', padding:'6px 14px', borderRadius:10 }}>
                {t.config.conexionesIr}
              </Link>
            </div>
          </Card>

          {/* Mensaje de éxito GBP */}
          {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('gbp') === 'conectado' && (
            <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:10, padding:'12px 16px' }}>
              <p style={{ color:'#22c55e', fontSize:13, fontWeight:500, margin:0, display:'flex', alignItems:'center', gap:8 }}><Icon name="checkCirc" size={15} /> {t.config.gbpExito}</p>
            </div>
          )}

          {/* Resultado de la conexión de Instagram.
              El backend redirige acá con ?ig=conectado o ?ig_error=..., y hasta
              ahora nadie leía esos parámetros: quien no tenía la cuenta
              vinculada a una página de Facebook autorizaba, volvía al panel y no
              veía absolutamente nada. El silencio se lee como "está roto", y
              este caso tiene solución, así que además del error van los pasos. */}
          {igConectado && (
            <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:10, padding:'12px 16px' }}>
              <p style={{ color:'#22c55e', fontSize:13, fontWeight:500, margin:0, display:'flex', alignItems:'center', gap:8 }}><Icon name="checkCirc" size={15} /> {t.config.igExito}</p>
            </div>
          )}
          {/* El error NO va aquí: es un modal a nivel de página (abajo del todo).
              Metido en la pestaña obligaba al usuario a estar mirándola, y el
              fallo de conexión merece interrumpir — trae pasos que hay que
              seguir fuera de Notoria. */}
          <Card style={{ border:'1px solid rgba(239,68,68,0.3)' }}>
            <ST>{t.config.zonaPeligro}</ST>
            <p style={{ color:'var(--text-2)', fontSize:13, margin:'0 0 14px', lineHeight:1.5 }}>{t.config.zonaPeligroDesc}</p>
            {!modalEliminar ? (
              <button onClick={() => setModalEliminar(true)} style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', borderRadius:8, padding:'10px 18px', fontSize:13, cursor:'pointer', fontWeight:500, display:'inline-flex', alignItems:'center', gap:8 }}><Icon name="basura" size={14} /> {t.config.eliminarNegocio}</button>
            ) : (
              <div>
                <p style={{ color:'#f87171', fontSize:13, fontWeight:600, margin:'0 0 10px' }}>{t.config.confirmarEliminar(negocio.nombre)}</p>
                {errorEliminar && (
                  <div style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:8, padding:'8px 11px', marginBottom:10 }}>
                    <p style={{ color:'#f87171', fontSize:12.5, margin:0, lineHeight:1.5 }}>{errorEliminar}</p>
                  </div>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { setModalEliminar(false); setErrorEliminar(''); }} style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:8, padding:9, fontSize:13, cursor:'pointer' }}>{t.config.cancelar}</button>
                  <button onClick={eliminarNegocio} style={{ flex:1, background:'#ef4444', border:'none', color:'#fff', borderRadius:8, padding:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>{t.config.siEliminar}</button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Panel lateral de respuesta (slide-over tipo chat) */}
      {respModal && (
        <>
          <style>{`@keyframes slideInDrawer { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div onClick={() => setRespModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50 }} />
          <aside style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(460px, 100vw)', background:'var(--surface)', borderLeft:'1px solid var(--border-c)', zIndex:51, display:'flex', flexDirection:'column', animation:'slideInDrawer 0.25s ease', boxShadow:'-16px 0 48px rgba(0,0,0,0.35)' }}>

            {/* Encabezado */}
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border-c)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Icon name="chat" size={16} color="#0B7324" />
                <div>
                  <h3 style={{ color:'var(--text)', fontSize:15, fontWeight:700, margin:0 }}>{t.modal.responderResena}</h3>
                  <p style={{ color:'var(--text-3)', fontSize:11, margin:0 }}>{respModal.plataforma === 'GOOGLE' ? 'Google Maps' : respModal.plataforma}</p>
                </div>
              </div>
              <button onClick={() => setRespModal(null)} title={t.modal.cerrar}
                style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="cerrar" size={14} />
              </button>
            </div>

            {/* Conversación */}
            <div style={{ flex:1, overflowY:'auto', padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* Banner: conectar GBP para publicar directo */}
              {!gbpConectado && (
                <div style={{ background:'rgba(66,133,244,0.07)', border:'1px solid rgba(66,133,244,0.3)', borderRadius:10, padding:'11px 14px' }}>
                  <p style={{ color:'var(--text)', fontSize:12, fontWeight:600, margin:'0 0 3px' }}>{t.modal.publicaTitulo}</p>
                  <p style={{ color:'var(--text-2)', fontSize:11.5, margin:'0 0 8px', lineHeight:1.55 }}>
                    {t.modal.publicaDesc}
                  </p>
                  <button onClick={conectarGBP} style={{ background:'#4285F4', color:'#fff', border:'none', borderRadius:7, padding:'7px 13px', fontSize:11.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24"><path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    {t.modal.conectarGB}
                  </button>
                </div>
              )}

              {/* Mensaje del cliente */}
              <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                {respModal.autorFoto ? (
                  <img src={respModal.autorFoto} alt={respModal.autorNombre || t.modal.clienteDefault} width={36} height={36}
                    style={{ borderRadius:'50%', flexShrink:0, border:'1px solid var(--border-c)' }}
                    onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex'; }} />
                ) : null}
                <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(11,115,36,0.15)', border:'1px solid rgba(11,115,36,0.35)', color:'#4CAF66', display:respModal.autorFoto?'none':'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, flexShrink:0 }}>
                  {(respModal.autorNombre || 'C').charAt(0).toUpperCase()}
                </div>
                <div style={{ maxWidth:'85%' }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ color:'var(--text)', fontSize:13, fontWeight:600 }}>{respModal.autorNombre || t.modal.clienteDefault}</span>
                    <span style={{ fontSize:10.5, color:'var(--text-3)' }}>{new Date(respModal.fechaResena).toLocaleDateString(idioma==='en'?'en-US':'es-PE', { day:'numeric', month:'long', year:'numeric' })}</span>
                  </div>
                  <div style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:'4px 14px 14px 14px', padding:'11px 14px' }}>
                    <div style={{ color:respModal.rating>=4?'#22c55e':respModal.rating===3?'#f59e0b':'#ef4444', fontWeight:700, fontSize:14, marginBottom:respModal.texto?6:0 }}>
                      {'★'.repeat(respModal.rating)}{'☆'.repeat(5-respModal.rating)}
                      <span style={{ color:'var(--text-3)', fontSize:11, fontWeight:400, marginLeft:6 }}>{t.modal.de5(respModal.rating)}</span>
                    </div>
                    {respModal.texto && <p style={{ color:'var(--text-2)', fontSize:13, margin:0, lineHeight:1.65 }}>{respModal.texto}</p>}
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                    {respModal.autorResenasTotal != null && (
                      <span style={{ fontSize:10, color:'var(--text-3)', background:'var(--surface2)', padding:'2px 8px', borderRadius:8 }}>{t.modal.resenasPublicadas(respModal.autorResenasTotal)}</span>
                    )}
                    {respModal.esSospechosa && (
                      <span style={{ fontSize:10, color:'#f87171', background:'rgba(239,68,68,0.1)', padding:'2px 8px', borderRadius:8, display:'inline-flex', alignItems:'center', gap:4 }}>
                        <Icon name="bot" size={10} /> {t.modal.posibleFalsa}{respModal.motivoSospecha?.split(',').join(' · ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tu respuesta ya publicada (si existe) */}
              {respModal.respuesta && (
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <div style={{ maxWidth:'85%' }}>
                    <div style={{ textAlign:'right', marginBottom:3 }}>
                      <span style={{ color:'#4CAF66', fontSize:11, fontWeight:600 }}>{t.modal.respuestaGuardada}</span>
                    </div>
                    <div style={{ background:'rgba(11,115,36,0.12)', border:'1px solid rgba(11,115,36,0.3)', borderRadius:'14px 4px 14px 14px', padding:'11px 14px' }}>
                      <p style={{ color:'var(--text-2)', fontSize:13, margin:0, lineHeight:1.65 }}>{respModal.respuesta}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Asistente IA */}
              <div style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', display:'inline-flex', alignItems:'center', gap:6 }}>
                    <Icon name="destello" size={13} color="#4CAF66" /> {t.modal.asistente}
                  </span>
                  {iaEstado && (
                    <span style={{ fontSize:10.5, color:'var(--text-3)', background:'var(--surface)', border:'1px solid var(--border-c)', padding:'2px 8px', borderRadius:8 }}>
                      {t.modal.iaUsoMes(iaEstado.restantes, iaEstado.limite)}
                    </span>
                  )}
                </div>
                <p style={{ fontSize:10.5, color:'var(--text-3)', margin:'0 0 8px' }}>
                  {t.modal.plantillasHint(respModal.rating)}
                </p>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {(PLANTILLAS[idioma]?.[respModal.rating] || PLANTILLAS.es[respModal.rating] || PLANTILLAS.es[3]).map(p => (
                    <button key={p.id} onClick={() => setTextoResp(p.t.replace(/\{cliente\}/g, respModal.autorNombre?.split(' ')[0] || t.modal.clienteDefault.toLowerCase()))}
                      style={{ background:'rgba(11,115,36,0.1)', border:'1px solid rgba(11,115,36,0.3)', color:'#4CAF66', borderRadius:12, padding:'5px 12px', fontSize:11.5, cursor:'pointer' }}>
                      {p.l}
                    </button>
                  ))}
                  {iaEstado && iaEstado.restantes <= 0 && usuario?.plan === 'GRATIS' ? (
                    <Link href="/dashboard/planes" style={{ background:'var(--surface)', border:'1px dashed var(--border-c)', color:'var(--text-3)', borderRadius:12, padding:'5px 12px', fontSize:11.5, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:5 }}>
                      <Icon name="candado" size={10} /> {t.modal.masIA}
                    </Link>
                  ) : (
                    <button onClick={generarConIA} disabled={iaGenerando || (iaEstado && iaEstado.restantes <= 0)}
                      style={{ background:'#0B7324', border:'none', color:'#fff', borderRadius:12, padding:'5px 14px', fontSize:11.5, fontWeight:600, cursor:iaGenerando?'wait':'pointer', display:'inline-flex', alignItems:'center', gap:6, opacity:iaGenerando?0.7:1 }}>
                      <Icon name="destello" size={11} /> {iaGenerando ? t.modal.redactando : t.modal.generarIA}
                    </button>
                  )}
                </div>
                {iaError && (
                  <div style={{ marginTop:8, fontSize:11.5, color:'#f59e0b', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span>{iaError}</span>
                    {iaError.includes('Plan Negocio') && <Link href="/dashboard/planes" style={{ color:'#4CAF66', whiteSpace:'nowrap' }}>{t.modal.verPlanes}</Link>}
                  </div>
                )}
                <p style={{ fontSize:10.5, color:'var(--text-3)', margin:'8px 0 0', lineHeight:1.5 }}>
                  {t.modal.iaDisclaimer}
                </p>
              </div>
            </div>

            {/* Redacción y envío */}
            <div style={{ padding:'14px 20px 18px', borderTop:'1px solid var(--border-c)', flexShrink:0 }}>
              {msgResp && <div style={{ background:'rgba(11,115,36,0.1)', border:'1px solid rgba(11,115,36,0.3)', color:'#4CAF66', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12.5 }}>{msgResp}</div>}
              <textarea value={textoResp} onChange={e => setTextoResp(e.target.value)} rows={5}
                placeholder={t.modal.placeholderTextarea}
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:'11px 13px', fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.6 }} />
              <p style={{ color:'var(--text-3)', fontSize:10.5, margin:'6px 0 10px', lineHeight:1.5 }}>
                {t.modal.guardamosCopiamos(respModal.plataforma === 'GOOGLE' ? 'Google Maps' : respModal.plataforma)}
              </p>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setRespModal(null)} style={{ background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:10, padding:'11px 16px', fontSize:13, cursor:'pointer' }}>{t.modal.cerrar}</button>
                <button onClick={enviarRespuesta} disabled={enviandoResp||!textoResp.trim()}
                  style={{ flex:1, background:'#0B7324', border:'none', color:'#fff', borderRadius:10, padding:'11px', fontSize:13, fontWeight:700, cursor:'pointer', opacity:!textoResp.trim()?0.5:1 }}>
                  {enviandoResp?t.modal.guardando:t.modal.guardarYAbrir(respModal.plataforma === 'GOOGLE' ? 'Google Maps' : respModal.plataforma)}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Popup único: recomendación de escaneo al agregar el negocio */}
      {/* Fallo al conectar Instagram — modal, no recuadro dentro de una pestaña.
          Es el resultado de una acción que el usuario acaba de hacer y que se
          resuelve fuera de Notoria (en Instagram y Facebook), así que tiene que
          interrumpir y quedarse hasta que lo cierre. */}
      {igError && (
        <div
          onClick={() => setIgError(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60, padding:16 }}
        >
          {/* Frena el clic para que no cierre al pulsar dentro de la tarjeta */}
          <div onClick={(e) => e.stopPropagation()}
            style={{ background:'var(--surface)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:16, padding:24, maxWidth:460, width:'100%', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
              <span style={{ flexShrink:0, marginTop:1 }}><Icon name="alerta" size={20} color="#f87171" /></span>
              <h3 style={{ color:'var(--text)', fontSize:16, fontWeight:700, margin:0, flex:1 }}>{t.config.igErrorTitulo}</h3>
              <button onClick={() => setIgError(null)} aria-label={t.config.cancelar}
                style={{ flexShrink:0, background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', padding:2, lineHeight:0 }}>
                <Icon name="cerrar" size={16} />
              </button>
            </div>
            <p style={{ color:'var(--text-2)', fontSize:13.5, margin:'0 0 4px', lineHeight:1.6 }}>
              {t.config.igError[igError] || t.config.igErrorGenerico}
            </p>
            {/* Cada fallo lleva SUS pasos: a quien ya tiene la página vinculada
                y solo reutilizó un permiso viejo, la lista de "cómo vincular una
                página" le dice que arregle algo que ya está bien — que es
                exactamente donde se atascó el primer usuario que lo vivió. */}
            {(igError === 'sin_cuenta_business' || igError === 'sin_paginas') && (
              <>
                <p style={{ color:'var(--text-3)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, margin:'18px 0 8px' }}>{t.config.igComoVincular}</p>
                <ol style={{ color:'var(--text-2)', fontSize:13, margin:0, paddingLeft:20, lineHeight:1.7 }}>
                  {(igError === 'sin_paginas' ? t.config.igPasosPermiso : t.config.igPasos)
                    .map((paso, i) => <li key={i} style={{ marginBottom:6 }}>{paso}</li>)}
                </ol>
              </>
            )}
            {/* El último paso es "vuelve y pulsa Conectar otra vez", y ese botón
                vive en Conexiones. Sin este enlace el usuario tendría que ir a
                buscarlo justo cuando acaba de arreglar lo suyo en Instagram. */}
            <div style={{ display:'flex', gap:10, marginTop:22 }}>
              <button onClick={() => setIgError(null)}
                style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text)', borderRadius:10, padding:11, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {t.config.igEntendido}
              </button>
              <Link href="/dashboard/conexiones" onClick={() => setIgError(null)}
                style={{ flex:1, background:'#0B7324', color:'#fff', borderRadius:10, padding:11, fontSize:14, fontWeight:600, textAlign:'center', textDecoration:'none' }}>
                {t.config.igReintentar}
              </Link>
            </div>
          </div>
        </div>
      )}

      {modalBienvenida && negocio && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60, padding:16 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border-c)', borderRadius:16, padding:24, maxWidth:380, width:'100%' }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}><Icon name="buscar" size={36} color="#0B7324" /></div>
            <h3 style={{ color:'var(--text)', fontSize:17, fontWeight:700, textAlign:'center', margin:'0 0 10px' }}>{t.modal.bienvenidaTitulo}</h3>
            <p style={{ color:'var(--text-2)', fontSize:13, textAlign:'center', lineHeight:1.6, margin:'0 0 20px' }}>
              {t.modal.bienvenidaTexto(negocio.nombre)}
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalBienvenida(false)} style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border-c)', color:'var(--text-2)', borderRadius:10, padding:10, fontSize:14, cursor:'pointer' }}>{t.modal.bienvenidaMasTarde}</button>
              <button onClick={() => { setModalBienvenida(false); escanear(); }} style={{ flex:1, background:'#0B7324', border:'none', color:'#fff', borderRadius:10, padding:10, fontSize:14, fontWeight:600, cursor:'pointer' }}>{t.modal.bienvenidaEscanear}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
