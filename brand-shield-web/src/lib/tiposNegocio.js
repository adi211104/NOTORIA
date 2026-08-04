// Categorías de negocio soportadas. Notoria ya no es solo para restaurantes
// y hoteles — cualquier tipo de negocio local puede monitorear su reputación.
// No hay íconos dibujados para cada categoría nueva todavía, así que se usa
// el ícono genérico "tienda" como fallback (se puede afinar por categoría más adelante).
export const TIPOS_NEGOCIO = [
  { valor: 'RESTAURANTE', es: 'Restaurante', en: 'Restaurant', icono: 'restaurante' },
  { valor: 'BAR', es: 'Bar / Discoteca', en: 'Bar / Nightclub', icono: 'tienda' },
  { valor: 'CAFETERIA', es: 'Cafetería', en: 'Café', icono: 'tienda' },
  { valor: 'HOTEL', es: 'Hotel', en: 'Hotel', icono: 'hotel' },
  { valor: 'PELUQUERIA', es: 'Peluquería / Salón de belleza', en: 'Hair salon / Beauty salon', icono: 'tienda' },
  { valor: 'SPA', es: 'Spa', en: 'Spa', icono: 'tienda' },
  { valor: 'GIMNASIO', es: 'Gimnasio', en: 'Gym', icono: 'tienda' },
  { valor: 'CLINICA', es: 'Clínica / Consultorio', en: 'Clinic / Medical office', icono: 'tienda' },
  { valor: 'TIENDA', es: 'Tienda / Retail', en: 'Store / Retail', icono: 'tienda' },
  { valor: 'INMOBILIARIA', es: 'Inmobiliaria', en: 'Real estate', icono: 'tienda' },
  { valor: 'TALLER', es: 'Taller / Automotriz', en: 'Auto shop', icono: 'tienda' },
  { valor: 'OTRO', es: 'Otros', en: 'Other', icono: 'tienda' },
];

export const iconoParaTipo = (tipo) => TIPOS_NEGOCIO.find(t => t.valor === tipo)?.icono || 'tienda';
export const labelParaTipo = (tipo, idioma = 'es') => {
  const t = TIPOS_NEGOCIO.find(x => x.valor === tipo);
  if (!t) return tipo;
  return idioma === 'en' ? t.en : t.es;
};
