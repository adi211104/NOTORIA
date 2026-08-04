// Set de íconos SVG de trazo fino compartido por toda la app.
// Reemplaza cualquier uso de emojis para mantener la identidad visual.

export const ICON_PATHS = {
  // Alertas y estados
  alerta:     ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4M12 17h.01'],
  campana:    ['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
  sirena:     ['M12 2a7 7 0 017 7v5H5V9a7 7 0 017-7z', 'M3 14h18v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4z', 'M12 6v3'],
  caida:      ['M22 17l-8.5-8.5-5 5L2 7', 'M16 17h6v-6'],
  subida:     ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  bot:        ['M12 2a2 2 0 012 2v2h2a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2h2V4a2 2 0 012-2z', 'M9 12h.01M15 12h.01M9.5 16a5 5 0 005 0'],
  check:      ['M20 6L9 17l-5-5'],
  checkCirc:  ['M22 11.08V12a10 10 0 11-5.93-9.14', 'M22 4L12 14.01l-3-3'],
  cerrar:     ['M18 6L6 18M6 6l12 12'],
  info:       ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 16v-4M12 8h.01'],
  punto:      ['M12 8a4 4 0 100 8 4 4 0 000-8z'],

  // Negocios
  tienda:     ['M3 9l1.5-5h15L21 9', 'M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z', 'M8 21v-6h8v6'],
  restaurante:['M7 2v20', 'M4 2v6a3 3 0 006 0V2', 'M17 2c-2 2-3 4.5-3 8h6c0-3.5-1-6-3-8z', 'M17 10v12'],
  hotel:      ['M3 21h18', 'M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16', 'M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01'],
  pin:        ['M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0118 0z', 'M12 13a3 3 0 100-6 3 3 0 000 6z'],
  buscar:     ['M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0'],
  estrella:   ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  basura:     ['M3 6h18', 'M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2', 'M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6', 'M10 11v6M14 11v6'],
  ajustes:    ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0A1.65 1.65 0 0010 2.77V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z'],

  // Comunicación y acciones
  chat:       ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
  editar:     ['M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
  mail:       ['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'M22 6l-10 7L2 6'],
  enlace:     ['M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'],
  clipboard:  ['M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2', 'M15 2H9a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V3a1 1 0 00-1-1z'],
  compartir:  ['M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  imprimir:   ['M6 9V2h12v7', 'M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2', 'M6 14h12v8H6z'],
  descargar:  ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  megafono:   ['M3 11l18-7-7 18-2.5-7.5L3 11z'],
  // Megáfono de verdad (el de arriba es un avión de papel pese al nombre; se
  // deja como está porque ya lo usa el consejo de crecimiento del negocio).
  menciones:  ['M3 11l18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 11-5.8-1.6'],

  // Documentos y datos
  doc:        ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6', 'M16 13H8M16 17H8M10 9H8'],
  grafica:    ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  calendario: ['M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z', 'M16 2v4M8 2v4M3 10h18'],
  candado:    ['M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z', 'M7 11V7a5 5 0 0110 0v4'],
  tarjeta:    ['M2 5a2 2 0 012-2h16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5z', 'M2 10h20', 'M6 15h4'],
  escudo:     ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  foco:       ['M9 18h6', 'M10 22h4', 'M12 2a7 7 0 00-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0012 2z'],
  manos:      ['M11 17l-1.5 1.5a2.12 2.12 0 01-3-3L11 11l3-3 5.5 5.5a2.12 2.12 0 01-3 3L15 15', 'M2 9l4-4 5 5', 'M22 9l-4-4-5 5'],

  // Mundo y tema
  globo:      ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M2 12h20', 'M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z'],
  sol:        ['M12 17a5 5 0 100-10 5 5 0 000 10z', 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'],
  luna:       ['M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'],
  corona:     ['M2 18h20', 'M4 18l-1-9 5.5 4L12 6l3.5 7L21 9l-1 9H4z'],
  destello:   ['M12 3l1.9 5.7a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-2a2 2 0 001.3-1.3L12 3z'],
  chevron:    ['M6 9l6 6 6-6'],
};

// Íconos por tipo de alerta del backend
export const ICONO_ALERTA = {
  PICO_RESENAS_NEGATIVAS: 'sirena',
  CAIDA_RATING: 'caida',
  CUENTAS_NUEVAS: 'bot',
  RESENA_MUY_NEGATIVA: 'alerta',
  MENCION_NEGATIVA: 'menciones',
  COMENTARIO_NEGATIVO: 'chat',
};

export default function Icon({ name, d, size = 20, color = 'currentColor', strokeWidth = 1.5, style }) {
  const paths = d || ICON_PATHS[name] || ICON_PATHS.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} aria-hidden="true">
      {(Array.isArray(paths) ? paths : [paths]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
