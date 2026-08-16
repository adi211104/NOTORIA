'use client';
import { useEffect, useRef } from 'react';

// Piezas gráficas del landing: lo que antes se explicaba con párrafos.
//
// POR QUÉ EXISTEN. El producto es visual —una gráfica que cae, una alerta que
// llega, un score— y el landing lo contaba todo con tarjetas de texto. Quien
// entra no llega a leer el tercer párrafo; una gráfica con el ataque marcado se
// entiende en dos segundos y dice lo mismo.
//
// POR QUÉ SON MOCKUPS Y NO CAPTURAS. Una captura del panel envejece con cada
// cambio de la interfaz, hay que rehacerla a mano, pesa, y en tema claro/oscuro
// obliga a mantener dos. Esto se dibuja con los mismos tokens de color del
// resto del sitio, así que sigue al tema solo y nunca queda desactualizado.
//
// ⚠️ Los datos son ILUSTRATIVOS y así se rotulan en pantalla. No son de ningún
// cliente ni promedios medidos: inventar una métrica y presentarla como real
// sería publicidad engañosa (Ley 29571), y esto es material de venta.
//
// Nota de color: aquí SÍ se puede usar `var(--...)` porque todo lo que se pinta
// es CSS o atributos SVG, que resuelven variables. La regla del VERDE_MARCA
// literal de `app/page.js` aplica solo a lo que pinta fuera de CSS (WebGL).

const GEO = "Georgia,'Times New Roman',Times,serif";

const C = {
  surface:  'var(--surface)',
  surface2: 'var(--surface2)',
  border:   'var(--border-c)',
  borderL:  'var(--border-l)',
  text:     'var(--text)',
  text2:    'var(--text-2)',
  text3:    'var(--text-3)',
  green:    'var(--accent)',
  greenT:   'var(--accent-t)',
  greenB:   'var(--accent-b)',
};

const ROJO = '#ef4444';
const AMBAR = '#D97706';

const TEXTOS = {
  es: {
    grafica: {
      ejemplo: 'Ejemplo ilustrativo',
      titulo: 'Rating de un negocio durante un ataque de reseñas',
      ataque: '8 reseñas de 1★ en 6 horas',
      conNotoria: 'Notoria te avisa acá',
      sinNotoria: 'Sin monitoreo, te enteras acá',
      dias: ['Lun', 'Mié', 'Vie', 'Dom', 'Mar', 'Jue'],
      pie: 'La caída tarda horas. Enterarte, días. Ese hueco es lo que Notoria te devuelve.',
    },
    alerta: {
      etiqueta: 'Así llega la alerta',
      critica: 'Alerta crítica',
      hace: 'hace 2 min',
      negocio: 'Cevichería El Muelle',
      caida: 'Tu rating cayó',
      resena: '"Pésimo servicio, no vayan"',
      motivo: 'Cuenta creada hace 2 días · 1 sola reseña',
      sospechosa: 'Sospechosa',
      mas: '+7 reseñas de 1★ en las últimas 6 horas',
      canales: 'Email · Telegram · WhatsApp',
    },
    score: {
      etiqueta: 'Score de reputación',
      titulo: 'Un solo número que resume tu salud online',
      estado: 'En riesgo',
      pie: 'Sube o baja con cada escaneo. Si cruza el umbral, te llega una alerta.',
      leyenda: ['Crítico', 'En riesgo', 'Sano'],
    },
    flujo: {
      pasos: [
        { t: 'Vigila',    d: 'Revisa tu ficha de Google cada hora' },
        { t: 'Detecta',   d: 'Marca las reseñas con patrón de bot' },
        { t: 'Te alerta', d: 'Email, Telegram o WhatsApp al instante' },
        { t: 'Respondes', d: 'Con plantillas o con la respuesta de la IA' },
      ],
    },
  },
  en: {
    grafica: {
      ejemplo: 'Illustrative example',
      titulo: 'A business rating during a review attack',
      ataque: '8 one-star reviews in 6 hours',
      conNotoria: 'Notoria warns you here',
      sinNotoria: 'Without monitoring, you find out here',
      dias: ['Mon', 'Wed', 'Fri', 'Sun', 'Tue', 'Thu'],
      pie: 'The drop takes hours. Noticing it takes days. That gap is what Notoria gives back.',
    },
    alerta: {
      etiqueta: 'This is how the alert arrives',
      critica: 'Critical alert',
      hace: '2 min ago',
      negocio: 'El Muelle Seafood',
      caida: 'Your rating dropped',
      resena: '"Terrible service, stay away"',
      motivo: 'Account created 2 days ago · single review',
      sospechosa: 'Suspicious',
      mas: '+7 one-star reviews in the last 6 hours',
      canales: 'Email · Telegram · WhatsApp',
    },
    score: {
      etiqueta: 'Reputation score',
      titulo: 'One number that sums up your online health',
      estado: 'At risk',
      pie: 'It moves with every scan. Cross the threshold and an alert goes out.',
      leyenda: ['Critical', 'At risk', 'Healthy'],
    },
    flujo: {
      pasos: [
        { t: 'Watches',  d: 'Checks your Google listing every hour' },
        { t: 'Detects',  d: 'Flags reviews with bot patterns' },
        { t: 'Alerts',   d: 'Email, Telegram or WhatsApp instantly' },
        { t: 'You reply', d: 'With templates or the AI-written answer' },
      ],
    },
  },
};

const dic = (idioma) => TEXTOS[idioma] || TEXTOS.es;

// ── Gráfica del ataque ───────────────────────────────────
// La pieza que más trabaja del landing: cuenta el problema entero sin una sola
// frase de venta. Se dibuja a mano en SVG en vez de con una librería de charts
// porque son doce puntos fijos — meter una dependencia de 50 kB para esto sería
// pagar mucho por nada.
export function GraficaAtaque({ idioma = 'es' }) {
  const t = dic(idioma).grafica;

  // Rating de ejemplo: estable, y a partir del punto 6 se hunde por el ataque.
  const RATINGS = [4.32, 4.31, 4.33, 4.32, 4.30, 4.31, 4.10, 3.97, 3.92, 3.90, 3.89, 3.88];

  // Lienzo. El eje Y NO arranca en 0: entre 3.8 y 4.4 se juega todo el negocio,
  // y sobre una escala 0-5 la caída se vería como una raya plana. Es el mismo
  // criterio que ya usa el comparador de competencia del landing.
  const W = 640, H = 250;
  const X0 = 46, X1 = 612, Y0 = 34, Y1 = 194;
  const R_MIN = 3.8, R_MAX = 4.4;

  const px = (i) => X0 + (i * (X1 - X0)) / (RATINGS.length - 1);
  const py = (r) => Y1 - ((r - R_MIN) / (R_MAX - R_MIN)) * (Y1 - Y0);

  const puntos = RATINGS.map((r, i) => `${px(i)},${py(r)}`).join(' ');
  const area = `${X0},${Y1} ${puntos} ${X1},${Y1}`;

  const I_ATAQUE = 6;   // primer punto ya caído: aquí salta la alerta
  const I_TARDE = 10;   // cuando el dueño lo nota a simple vista

  // En el teléfono la gráfica no cabe entera y se desliza. Sin esto, el primer
  // vistazo era la parte plana de la izquierda —justo lo que no cuenta nada— y
  // había que descubrir a mano que a la derecha pasaba algo. Arranca centrada en
  // la caída. En pantallas donde cabe entera no hay sobrante y no hace nada.
  const cajaRef = useRef(null);
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    const sobrante = caja.scrollWidth - caja.clientWidth;
    if (sobrante > 0) caja.scrollLeft = sobrante * 0.55;
  }, []);

  return (
    <figure style={{ margin:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12, marginBottom:10, flexWrap:'wrap' }}>
        <figcaption style={{ fontSize:13.5, fontWeight:700, color:C.text }}>{t.titulo}</figcaption>
        <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', color:C.text3 }}>
          {t.ejemplo}
        </span>
      </div>

      {/* Envoltorio con scroll propio. Un SVG con viewBox escala TODO, texto
          incluido: a 360 px de ancho las etiquetas de 11 px quedaban en 6 y no
          se leían. Con un ancho mínimo, en el teléfono se desliza de lado y las
          letras conservan su tamaño. El scroll es de esta caja, nunca del
          documento. */}
      <div ref={cajaRef} style={{ overflowX:'auto', overflowY:'hidden', WebkitOverflowScrolling:'touch' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
           aria-label={`${t.titulo}. ${t.ataque}. ${t.conNotoria}.`}
           style={{ display:'block', minWidth:520 }}>
        <defs>
          <linearGradient id="relleno-ataque" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Rejilla y etiquetas del eje Y */}
        {[4.4, 4.2, 4.0, 3.8].map((r) => (
          <g key={r}>
            <line x1={X0} y1={py(r)} x2={X1} y2={py(r)} stroke={C.border} strokeWidth="1" />
            <text x={X0 - 10} y={py(r) + 4} textAnchor="end" fontSize="11" fill={C.text3} fontFamily={GEO}>
              {r.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Franja del ataque: se pinta DEBAJO de la línea para no taparla */}
        <rect x={px(I_ATAQUE - 1)} y={Y0} width={px(I_ATAQUE + 1) - px(I_ATAQUE - 1)} height={Y1 - Y0}
              fill={ROJO} opacity="0.10" />

        <polygon points={area} fill="url(#relleno-ataque)" />
        <polyline points={puntos} fill="none" stroke={C.green} strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" />

        {/* Momento del ataque */}
        <line x1={px(I_ATAQUE)} y1={Y0} x2={px(I_ATAQUE)} y2={Y1} stroke={ROJO} strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx={px(I_ATAQUE)} cy={py(RATINGS[I_ATAQUE])} r="5" fill={ROJO} />
        <text x={px(I_ATAQUE) - 8} y={Y0 - 12} textAnchor="end" fontSize="11.5" fontWeight="700" fill={ROJO} fontFamily={GEO}>
          {t.ataque}
        </text>

        {/* Aviso de Notoria, pegado al ataque */}
        <text x={px(I_ATAQUE) + 8} y={py(RATINGS[I_ATAQUE]) - 14} fontSize="11.5" fontWeight="700"
              fill={C.green} fontFamily={GEO}>
          ↓ {t.conNotoria}
        </text>

        {/* Cuando lo notarías sin monitoreo. La etiqueta va ENCIMA de la línea:
            debajo caía sobre el eje X y se leía tachada. */}
        <circle cx={px(I_TARDE)} cy={py(RATINGS[I_TARDE])} r="4.5" fill={C.surface} stroke={C.text3} strokeWidth="2" />
        <text x={X1} y={py(RATINGS[I_TARDE]) - 16} textAnchor="end" fontSize="11.5" fill={C.text3} fontFamily={GEO}>
          {t.sinNotoria}
        </text>

        {/* Eje X */}
        <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke={C.borderL} strokeWidth="1" />
        {t.dias.map((d, i) => (
          <text key={d} x={px(i * 2)} y={Y1 + 20} textAnchor="middle" fontSize="11" fill={C.text3} fontFamily={GEO}>
            {d}
          </text>
        ))}
      </svg>
      </div>

      <p style={{ fontSize:12.5, color:C.text2, lineHeight:1.6, margin:'12px 0 0' }}>{t.pie}</p>
    </figure>
  );
}

// ── Mockup de la alerta ──────────────────────────────────
// Enseña el producto sin captura: la alerta tal cual llega, con la reseña
// marcada y el motivo. Es lo que el cliente compra, y hasta ahora el landing
// solo lo describía.
export function TarjetaAlerta({ idioma = 'es' }) {
  const t = dic(idioma).alerta;

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
                    padding:'11px 16px', background:'rgba(239,68,68,0.08)', borderBottom:`1px solid ${C.border}` }}>
        <span style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5, fontWeight:700,
                       textTransform:'uppercase', letterSpacing:0.5, color:ROJO }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:ROJO, flexShrink:0 }} />
          {t.critica}
        </span>
        <span style={{ fontSize:11, color:C.text3 }}>{t.hace}</span>
      </div>

      <div style={{ padding:'16px' }}>
        <div style={{ fontSize:14.5, fontWeight:700, color:C.text, marginBottom:10 }}>{t.negocio}</div>

        <div style={{ display:'flex', alignItems:'baseline', gap:9, flexWrap:'wrap', marginBottom:14 }}>
          <span style={{ fontSize:12.5, color:C.text2 }}>{t.caida}</span>
          <span style={{ fontSize:15, color:C.text3, textDecoration:'line-through', fontVariantNumeric:'tabular-nums' }}>4.3★</span>
          <span style={{ fontSize:20, fontWeight:800, color:ROJO, fontVariantNumeric:'tabular-nums' }}>3.9★</span>
          <span style={{ fontSize:11.5, fontWeight:700, color:ROJO, background:'rgba(239,68,68,0.1)',
                         border:'1px solid rgba(239,68,68,0.25)', padding:'2px 8px', borderRadius:9 }}>−0.4</span>
        </div>

        <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:9, padding:'12px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:6 }}>
            <span style={{ fontSize:13, letterSpacing:1, color:AMBAR }} aria-label="1 de 5 estrellas">★☆☆☆☆</span>
            <span style={{ fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5,
                           color:AMBAR, background:'rgba(217,119,6,0.12)', border:'1px solid rgba(217,119,6,0.3)',
                           padding:'2px 8px', borderRadius:9 }}>
              {t.sospechosa}
            </span>
          </div>
          <p style={{ fontSize:13, color:C.text, margin:'0 0 6px', lineHeight:1.5, fontStyle:'italic' }}>{t.resena}</p>
          <p style={{ fontSize:11.5, color:C.text3, margin:0, lineHeight:1.5 }}>{t.motivo}</p>
        </div>

        <p style={{ fontSize:12, color:C.text2, margin:'12px 0 0' }}>{t.mas}</p>
      </div>

      <div style={{ padding:'10px 16px', borderTop:`1px solid ${C.border}`, background:C.surface2,
                    fontSize:11, color:C.text3, letterSpacing:0.3 }}>
        {t.canales}
      </div>
    </div>
  );
}

// ── Medidor del score ────────────────────────────────────
// Arco semicircular 0-100. La aguja marca 62 a propósito: un 95 se lee como
// adorno, un número mediocre invita a preguntarse cómo subirlo.
export function MedidorScore({ idioma = 'es', valor = 62 }) {
  const t = dic(idioma).score;

  const W = 260, H = 152;
  const CX = 130, CY = 130, R = 100;

  // Punto del arco para un valor 0-100 (180° = 0, 0° = 100).
  const punto = (v) => {
    const ang = Math.PI * (1 - Math.min(100, Math.max(0, v)) / 100);
    return [CX + R * Math.cos(ang), CY - R * Math.sin(ang)];
  };
  const arco = (desde, hasta) => {
    const [x1, y1] = punto(desde);
    const [x2, y2] = punto(hasta);
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  };

  const [ax, ay] = punto(valor);

  const TRAMOS = [
    { de: 0,  a: 40,  color: ROJO },
    { de: 40, a: 70,  color: AMBAR },
    { de: 70, a: 100, color: 'var(--accent)' },
  ];

  const colorValor = (TRAMOS.find((tr) => valor >= tr.de && valor <= tr.a) || TRAMOS[2]).color;

  return (
    <figure style={{ margin:0, textAlign:'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth:280, display:'block', margin:'0 auto' }}
           role="img" aria-label={`${t.etiqueta}: ${valor} de 100, ${t.estado}`}>
        {TRAMOS.map(({ de, a, color }) => (
          <path key={de} d={arco(de, a)} fill="none" stroke={color} strokeWidth="13"
                strokeLinecap="butt" opacity={valor >= de && valor <= a ? 1 : 0.22} />
        ))}

        {/* Marca sobre el arco, no aguja: la aguja cruzaba justo por encima del
            número y lo partía en dos. */}
        <circle cx={ax} cy={ay} r="9" fill={C.surface} stroke={colorValor} strokeWidth="4" />

        <text x={CX} y={CY - 14} textAnchor="middle" fontSize="46" fontWeight="900" fill={C.text} fontFamily={GEO}>
          {valor}
        </text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize="12" fontWeight="700" fill={colorValor}
              fontFamily={GEO} letterSpacing="0.5">
          {t.estado.toUpperCase()}
        </text>
      </svg>

      <div style={{ display:'flex', justifyContent:'center', gap:14, flexWrap:'wrap', marginTop:6 }}>
        {t.leyenda.map((etq, i) => (
          <span key={etq} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, color:C.text3 }}>
            <span style={{ width:8, height:8, borderRadius:2, background:[ROJO, AMBAR, 'var(--accent)'][i] }} />
            {etq}
          </span>
        ))}
      </div>

      <p style={{ fontSize:12.5, color:C.text2, lineHeight:1.6, margin:'12px 0 0' }}>{t.pie}</p>
    </figure>
  );
}

// ── Diagrama del circuito ────────────────────────────────
// Los cuatro pasos que Notoria repite sola, con las flechas visibles. En una
// columna las flechas giran a vertical: una flecha "→" apuntando al vacío en
// móvil es peor que no ponerla.
export function DiagramaFlujo({ idioma = 'es', iconos = {} }) {
  const { pasos } = dic(idioma).flujo;

  return (
    <div className="flujo">
      {pasos.map((p, i) => (
        <div key={p.t} className="flujo-par">
          <div className="flujo-nodo">
            <div className="flujo-icono">{iconos[i] || <span style={{ fontWeight:800, color:C.green }}>{i + 1}</span>}</div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>{p.t}</div>
            <p style={{ fontSize:12.5, color:C.text2, lineHeight:1.55, margin:0 }}>{p.d}</p>
          </div>
          {i < pasos.length - 1 && <div className="flujo-flecha" aria-hidden="true">→</div>}
        </div>
      ))}

      <style jsx>{`
        .flujo{
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:0;
        }
        .flujo-par{ display:flex; align-items:center; gap:0; }
        .flujo-nodo{
          flex:1;
          background:${C.surface};
          border:1px solid ${C.border};
          border-radius:8px;
          padding:20px 18px;
          height:100%;
          box-sizing:border-box;
        }
        .flujo-icono{
          width:38px;height:38px;border-radius:9px;
          display:flex;align-items:center;justify-content:center;
          background:${C.greenT};border:1px solid ${C.greenB};
          margin-bottom:12px;
        }
        .flujo-flecha{
          flex-shrink:0;
          padding:0 10px;
          color:${C.green};
          font-size:20px;
          line-height:1;
        }
        /* El último nodo no lleva flecha, así que la rejilla dejaría un hueco
           de su ancho al final de la fila. Con una sola columna eso desaparece. */
        @media (max-width:900px){
          .flujo{ grid-template-columns:1fr; gap:0; }
          .flujo-par{ flex-direction:column; align-items:stretch; }
          .flujo-flecha{ padding:6px 0; text-align:center; transform:rotate(90deg); }
        }
      `}</style>
    </div>
  );
}
