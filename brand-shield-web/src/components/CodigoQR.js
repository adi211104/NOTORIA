'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

// Código QR generado EN EL NAVEGADOR, sin salir a ningún servidor.
//
// Antes esto era un <img> apuntando a api.qrserver.com. Eso tenía tres
// problemas, ninguno visible hasta que fallara:
//   1. Le mandaba a un tercero el enlace de reseñas de cada cliente —o sea, qué
//      negocio está usando Notoria— y la política de privacidad dice que no
//      compartimos datos con nadie.
//   2. Una función de un plan de pago dependía de un servicio gratuito ajeno:
//      si se caía o metía un límite, el QR desaparecía sin aviso ni error.
//   3. Con la CSP puesta en next.config.ts ese dominio ya no está permitido.
//
// La librería `qrcode` lo dibuja en un canvas local. El PNG de alta resolución
// se arma con toDataURL sobre el mismo dato.

export default function CodigoQR({
  valor,
  tamano = 180,
  alt = 'Código QR',
  // Lo pinta el llamador para que el QR viva sobre blanco aunque el panel esté
  // en modo oscuro: un QR con poco contraste no lo lee ninguna cámara.
  fondo = '#FFFFFF',
  frente = '#000000',
  className,
  style,
}) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !valor) return;
    let cancelado = false;

    QRCode.toCanvas(canvasRef.current, valor, {
      width: tamano,
      margin: 2,
      // 'M' corrige hasta un 15% del código dañado: es el punto medio razonable
      // para un afiche impreso que se va a manchar y a despegar de la pared.
      errorCorrectionLevel: 'M',
      color: { dark: frente, light: fondo },
    }).catch(() => { if (!cancelado) setError(true); });

    return () => { cancelado = true; };
  }, [valor, tamano, fondo, frente]);

  if (error) {
    return (
      <div style={{ width: tamano, height: tamano, display: 'grid', placeItems: 'center', background: fondo, color: '#777', fontSize: 12, textAlign: 'center', padding: 10, ...style }}>
        No se pudo generar el código
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      className={className}
      style={{ display: 'block', width: tamano, height: tamano, ...style }}
    />
  );
}

// Genera el PNG grande para imprimir y dispara la descarga. Se hace a demanda
// (al hacer clic) y no al montar, para no tener un data URI de 600x600 en
// memoria en cada carga de la página.
export async function descargarQR(valor, nombreArchivo = 'codigo-qr.png') {
  const dataUrl = await QRCode.toDataURL(valor, {
    width: 900,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
