'use client';
import { useState } from 'react';

// Capturas REALES del panel, dentro de un marco de navegador y con pestañas.
//
// POR QUÉ CAPTURAS Y NO OTRO MOCKUP: el landing ya explica el producto con
// piezas dibujadas (ver MockupsLanding.js). Lo que faltaba era la prueba de que
// existe: la pantalla de verdad, con su barra lateral, sus pestañas y sus
// números. Es lo que separa "prometen esto" de "esto ya funciona".
//
// ⚠️ LOS DATOS ESTÁN ANONIMIZADOS A PROPÓSITO. Las capturas se tomaron de una
// cuenta real, pero el negocio, la dirección, los nombres de quienes reseñan y
// el texto de sus reseñas se sustituyeron por los ficticios que ya usa el resto
// del landing ("Cevichería El Muelle"). El negocio original es un restaurante
// real que NO es cliente: publicarlo aquí insinuaría que lo es, y expondría
// reseñas de personas identificables en material publicitario. Si algún día se
// rehacen las capturas, hay que repetir esa sustitución.
//
// Las imágenes viven en `public/panel/*.webp`, recortadas y comprimidas (~142 KB
// las cuatro juntas).

const VISTAS = {
  es: [
    { id:'resumen', pestana:'Resumen', img:'/panel/panel-resumen.webp', w:1512, h:380,
      titulo:'Todo bajo control en una pantalla',
      desc:'Negocios activos, alertas sin leer y el estado general. Si algo necesita tu atención, lo ves al entrar.' },
    { id:'score', pestana:'Tu negocio', img:'/panel/panel-score.webp', w:1512, h:740,
      titulo:'Un solo número, y qué hacer para subirlo',
      desc:'El score desglosa de dónde sale cada punto y te dice el siguiente paso concreto: responde estas reseñas, reporta estas otras.' },
    { id:'resenas', pestana:'Reseñas', img:'/panel/panel-resenas.webp', w:1512, h:785,
      titulo:'La sospechosa viene marcada, y con el motivo',
      desc:'Cada reseña con su calificación y su fecha. Las que tienen patrón de ataque salen señaladas y con el botón para reportarlas a Google.' },
    { id:'competencia', pestana:'Competencia', img:'/panel/panel-competencia.webp', w:1512, h:350,
      titulo:'Cuánto te gana el de la esquina',
      desc:'Tu rating al lado del suyo, con la diferencia exacta. Y el análisis de IA de en qué fallan ellos.' },
  ],
  en: [
    { id:'resumen', pestana:'Overview', img:'/panel/panel-resumen.webp', w:1512, h:380,
      titulo:'Everything under control on one screen',
      desc:'Active businesses, unread alerts and overall status. If something needs you, you see it the moment you log in.' },
    { id:'score', pestana:'Your business', img:'/panel/panel-score.webp', w:1512, h:740,
      titulo:'One number, and how to raise it',
      desc:'The score breaks down where every point comes from and tells you the concrete next step: reply to these reviews, report those.' },
    { id:'resenas', pestana:'Reviews', img:'/panel/panel-resenas.webp', w:1512, h:785,
      titulo:'Suspicious ones come flagged, with the reason',
      desc:'Every review with its rating and date. The ones showing attack patterns are marked, with the button to report them to Google.' },
    { id:'competencia', pestana:'Competitors', img:'/panel/panel-competencia.webp', w:1512, h:350,
      titulo:'How far ahead the place next door is',
      desc:'Your rating next to theirs, with the exact gap. Plus the AI read on where they fall short.' },
  ],
};

const TEXTOS = {
  es: { tag:'El producto por dentro', titulo:'Esto es el panel, no una maqueta', nota:'Capturas del panel real. Los datos del ejemplo son ficticios.' },
  en: { tag:'Inside the product', titulo:'This is the actual dashboard, not a mockup', nota:'Screenshots of the real dashboard. The example data is fictional.' },
};

export default function PanelShowcase({ idioma = 'es', colores }) {
  const C = colores;
  const vistas = VISTAS[idioma] || VISTAS.es;
  const t = TEXTOS[idioma] || TEXTOS.es;
  const [activa, setActiva] = useState(0);
  const v = vistas[activa];

  return (
    <div>
      <div style={{ marginBottom:26, maxWidth:640 }}>
        <div className="section-tag">{t.tag}</div>
        <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:0, letterSpacing:'-1px', color:C.text }}>
          {t.titulo}
        </h2>
      </div>

      {/* Pestañas. Scroll horizontal propio en móvil: cuatro etiquetas no caben
          en 360 px y partirlas en dos filas descoloca el marco de abajo. */}
      <div style={{ display:'flex', gap:8, marginBottom:14, overflowX:'auto', paddingBottom:4 }}>
        {vistas.map((vista, i) => (
          <button key={vista.id} onClick={() => setActiva(i)}
            aria-pressed={i === activa}
            style={{
              flexShrink:0, cursor:'pointer', fontSize:13.5, padding:'8px 16px', borderRadius:8,
              fontFamily:"Georgia,'Times New Roman',Times,serif",
              transition:'background .18s ease, color .18s ease, border-color .18s ease',
              background: i === activa ? C.green : 'transparent',
              color:      i === activa ? '#fff' : C.text2,
              border:     `1px solid ${i === activa ? C.green : C.border}`,
              fontWeight: i === activa ? 600 : 400,
            }}>
            {vista.pestana}
          </button>
        ))}
      </div>

      {/* Marco de navegador. Es lo que hace que se lea como "una app de verdad"
          y no como una imagen suelta pegada en la página. */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderBottom:`1px solid ${C.border}`, background:C.surface2 }}>
          <span style={{ display:'flex', gap:5 }}>
            {['#ef4444', '#f59e0b', '#22c55e'].map((c) => (
              <span key={c} style={{ width:9, height:9, borderRadius:'50%', background:c, opacity:0.55 }} />
            ))}
          </span>
          <span style={{ flex:1, textAlign:'center', fontSize:11, color:C.text3, letterSpacing:0.3 }}>
            usenotoria.app/dashboard
          </span>
        </div>

        {/* `key` fuerza el remontaje al cambiar de pestaña, que es lo que dispara
            la animación de entrada. Sin él React reutiliza el <img> y el cambio
            se ve como un salto seco. */}
        <img key={v.id} src={v.img} alt={v.titulo} decoding="async"
             width={v.w} height={v.h}
             className="captura-panel"
             style={{ width:'100%', height:'auto', display:'block' }} />
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginTop:16, flexWrap:'wrap' }}>
        <div key={v.id} className="captura-texto" style={{ maxWidth:560 }}>
          <h3 style={{ fontSize:17, fontWeight:700, color:C.text, margin:'0 0 6px' }}>{v.titulo}</h3>
          <p style={{ fontSize:14, color:C.text2, lineHeight:1.7, margin:0 }}>{v.desc}</p>
        </div>
        {/* La nota de datos ficticios no es letra pequeña de trámite: es lo que
            impide que alguien crea que "Cevichería El Muelle" es un cliente. */}
        <p style={{ fontSize:11.5, color:C.text3, margin:0, maxWidth:260, lineHeight:1.5 }}>{t.nota}</p>
      </div>

      <style jsx>{`
        .captura-panel, .captura-texto { animation: entrar .35s ease both; }
        @keyframes entrar {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .captura-panel, .captura-texto { animation: none; }
        }
      `}</style>
    </div>
  );
}
