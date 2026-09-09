'use client';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { API_URL, cabecerasAuth } from '../lib/api';
import * as cartel from '../lib/cartel';
import Icon from './Icons';

// Los carteles de «déjanos tu reseña»: el bloque de la pestaña «Pedir reseñas»
// que deja imprimir el QR en cuatro tamaños.
//
// ── Por qué la previa es un SVG y no una imagen del PDF ────────────────────
//
// El PDF lo arma el backend (`utils/cartel.generator.js`), pero la MAQUETA la
// decide `lib/cartel.js`, que es el mismo archivo en las dos orillas: acá se
// importa el espejo `web/src/lib/cartel.js`, byte por byte igual al del backend.
// Así que esta previa no es un dibujo parecido al papel — son literalmente las
// mismas primitivas, con las mismas posiciones y los mismos cuerpos de letra,
// pintadas en SVG en vez de en PDF.
//
// La alternativa era enseñar el PDF en un <iframe>. Se descartó: en móvil el
// visor incrustado falla en silencio (queda en blanco) y encima mete la barra de
// herramientas del navegador dentro de la tarjeta.
//
// ⚠️ Lo único que NO es idéntico es la medición del texto: el PDF mide con las
// métricas de Times de PDFKit y el navegador con la Times New Roman instalada.
// Por eso la previa se dibuja con esa fuente y no con la Georgia de la marca —
// para que el punto donde se corta un nombre largo sea el mismo. Puede quedar
// una palabra de diferencia en un nombre extremo, y es la única deriva posible.
const FUENTE = '"Times New Roman", Times, serif';

// Un solo canvas para medir, creado una vez y reutilizado. Sin esto habría un
// canvas nuevo por cada texto de cada pieza en cada repintado.
let ctxMedida = null;
const medir = (texto, tamano, negrita) => {
  if (!ctxMedida) ctxMedida = document.createElement('canvas').getContext('2d');
  ctxMedida.font = `${negrita ? 'bold ' : ''}${tamano}px ${FUENTE}`;
  return ctxMedida.measureText(String(texto)).width;
};

/**
 * Los rectángulos del QR, con la zona de silencio de 4 módulos que exige la
 * norma y los módulos de cada fila fusionados en tiradas.
 *
 * Fusionar no es un adorno: son ~700 módulos oscuros por pieza, y 700 nodos
 * <rect> en el DOM por cada cambio de formato se nota en un celular.
 */
const rectangulosQr = (matriz, x, y, lado) => {
  const SILENCIO = 4;
  const paso = lado / (matriz.size + SILENCIO * 2);
  const rects = [];
  for (let fy = 0; fy < matriz.size; fy++) {
    let inicio = -1;
    for (let fx = 0; fx <= matriz.size; fx++) {
      const oscuro = fx < matriz.size && matriz.data[fy * matriz.size + fx];
      if (oscuro && inicio === -1) inicio = fx;
      else if (!oscuro && inicio !== -1) {
        rects.push({
          x: x + (inicio + SILENCIO) * paso,
          y: y + (fy + SILENCIO) * paso,
          w: (fx - inicio) * paso,
          h: paso,
        });
        inicio = -1;
      }
    }
  }
  return rects;
};

/** Una pieza dibujada en SVG a partir de las primitivas de lib/cartel.js. */
function PiezaSvg({ formato, nombre, enlace, idioma, alturaMax = 300, anchoMax = 250 }) {
  const plano = useMemo(
    () => cartel.componerPieza({ formato, nombre, idioma, medir }),
    [formato, nombre, idioma],
  );
  const matriz = useMemo(() => {
    try { return QRCode.create(enlace, { errorCorrectionLevel: 'M' }).modules; } catch { return null; }
  }, [enlace]);

  const escala = Math.min(alturaMax / plano.alto, anchoMax / plano.ancho);
  const piezas = [];

  plano.elementos.forEach((el, i) => {
    if (el.t === 'marco') {
      piezas.push(
        <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.r} ry={el.r}
          fill={el.relleno} stroke={el.trazo} strokeWidth={el.grosor} />,
      );
    } else if (el.t === 'texto') {
      // La `y` de <text> en SVG ES la línea de base, que es justo la convención
      // en la que habla lib/cartel.js. Ver la nota de su bloqueTexto().
      el.lineas.forEach((linea, j) => (
        piezas.push(
          <text key={`${i}-${j}`} x={el.cx} y={el.y + el.tamano + j * el.alturaLinea}
            textAnchor="middle" fill={el.color} fontFamily={FUENTE} fontSize={el.tamano}
            fontWeight={el.negrita ? 700 : 400}
            letterSpacing={el.espaciado ? el.espaciado * el.tamano : undefined}
            // El espaciado se aplica también tras la última letra, así que el
            // texto queda medio carácter a la derecha; se compensa acá.
            dx={el.espaciado ? -el.espaciado * el.tamano / 2 : undefined}>
            {linea}
          </text>,
        )
      ));
    } else if (el.t === 'estrellas') {
      const radio = el.ancho / 12;
      const separacion = el.ancho / 5;
      for (let s = 0; s < 5; s++) {
        const cx = el.cx - el.ancho / 2 + separacion * (s + 0.5);
        const puntos = cartel.puntosEstrella(cx, el.y + radio, radio)
          .map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
        piezas.push(<polygon key={`${i}-e${s}`} points={puntos} fill={el.color} />);
      }
    } else if (el.t === 'pastilla') {
      piezas.push(
        <rect key={`${i}-p`} x={el.cx - el.w / 2} y={el.y} width={el.w} height={el.h}
          rx={el.h / 2} ry={el.h / 2} fill={el.relleno} />,
      );
      piezas.push(
        <text key={`${i}-pt`} x={el.cx} y={el.y + el.h / 2 + el.tamano * 0.36}
          textAnchor="middle" fill={el.color} fontFamily={FUENTE}
          fontSize={el.tamano} fontWeight={700}>{el.texto}</text>,
      );
    } else if (el.t === 'qr') {
      piezas.push(
        <rect key={`${i}-c`} x={el.x} y={el.y} width={el.lado} height={el.lado}
          rx={el.lado * 0.05} ry={el.lado * 0.05} fill="#FFFFFF"
          stroke={cartel.BORDE} strokeWidth={el.lado * 0.012} />,
      );
      if (matriz) {
        rectangulosQr(matriz, el.x, el.y, el.lado).forEach((r, k) => piezas.push(
          <rect key={`${i}-q${k}`} x={r.x} y={r.y} width={r.w} height={r.h}
            fill="#000000" shapeRendering="crispEdges" />,
        ));
      }
    }
  });

  return (
    <svg viewBox={`0 0 ${plano.ancho} ${plano.alto}`} role="img"
      aria-label={`Vista previa del cartel ${formato.toLowerCase()}`}
      style={{
        width: plano.ancho * escala, height: plano.alto * escala,
        background: '#fff', borderRadius: 6, display: 'block',
        boxShadow: '0 2px 10px rgba(0,0,0,.18)', flexShrink: 0,
      }}>
      <rect x={0} y={0} width={plano.ancho} height={plano.alto} fill="#FFFFFF" />
      {piezas}
    </svg>
  );
}

/**
 * El bloque completo: elegir formato, ver la pieza y bajarse la hoja.
 *
 * `t` trae los textos de la pantalla (que llevan idioma y viven en la página);
 * los del CARTEL vienen de lib/cartel.js, porque los comparte con el PDF.
 */
export default function CartelResenas({ negocioId, nombre, enlace, idioma = 'es', t }) {
  const [formato, setFormato] = useState('MURAL');
  const [estado, setEstado] = useState('');
  // El SVG mide texto con un canvas, que no existe en el servidor. Se pinta
  // recién montado para no arrastrar una previa distinta en la hidratación.
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  const textos = cartel.TEXTOS[idioma] || cartel.TEXTOS.es;
  const porHoja = cartel.porHoja(formato);

  const descargar = async () => {
    setEstado('generando');
    try {
      const r = await fetch(`${API_URL}/api/negocios/${negocioId}/cartel.pdf?formato=${formato}`, {
        headers: { ...cabecerasAuth() },
      });
      if (!r.ok) throw new Error('http');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `Notoria-cartel-${formato.toLowerCase()}-${(nombre || 'negocio').replace(/[^\w-]+/g, '-').slice(0, 40)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setEstado('');
    } catch {
      setEstado('error');
    }
  };

  const botonFormato = (id) => {
    const activo = id === formato;
    const info = textos.formatos[id];
    return (
      <button key={id} onClick={() => { setFormato(id); setEstado(''); }} aria-pressed={activo}
        style={{
          textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '9px 12px',
          background: activo ? 'rgba(11,115,36,.10)' : 'var(--surface2)',
          border: `1px solid ${activo ? '#0B7324' : 'var(--border-c)'}`,
          color: 'var(--text)', flex: '1 1 150px', minWidth: 0,
        }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{info.etiqueta}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{info.medida}</span>
      </button>
    );
  };

  return (
    <>
      <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
        {t.cartelDesc}
      </p>

      {/* Los cuatro tamaños. Envuelven en vez de comprimirse: a 390 px caben dos
          por fila, y una pastilla apretada corta su propio texto. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {cartel.ORDEN_FORMATOS.map(botonFormato)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          {montado
            ? <PiezaSvg formato={formato} nombre={nombre} enlace={enlace} idioma={idioma} />
            : <div style={{ width: 212, height: 300, background: 'var(--surface2)', borderRadius: 6 }} />}
        </div>

        <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, margin: '0 0 3px' }}>
              {textos.formatos[formato].etiqueta}
            </p>
            <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              {textos.formatos[formato].para}
            </p>
          </div>

          <p style={{ color: 'var(--text-3)', fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
            {porHoja > 1 ? t.cartelPorHoja(porHoja) : t.cartelUnaHoja}
          </p>

          <button onClick={descargar} disabled={estado === 'generando'}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: '#0B7324', color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 16px', fontSize: 13, fontWeight: 600,
              cursor: estado === 'generando' ? 'default' : 'pointer', opacity: estado === 'generando' ? .7 : 1,
            }}>
            <Icon name="descargar" size={14} />
            {estado === 'generando' ? t.cartelGenerando : t.cartelDescargar}
          </button>

          {/* Un fallo al descargar tiene que DECIRLO. Un botón que no hace nada
              se lee como «el producto está roto», que es peor que el error. */}
          {estado === 'error' && (
            <p style={{ color: '#B91C1C', fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
              {t.cartelError}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
