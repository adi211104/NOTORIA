// Catálogo público de servicios — lo que se muestra en /precios.
//
// Culqi exige que la web tenga un catálogo con precio visible, descripción
// clara y una imagen por ítem antes de aprobar el comercio. Cada plan se
// publica en sus dos modalidades de cobro (mensual y anual) porque son cargos
// distintos, con precio distinto, y así el catálogo refleja exactamente lo que
// se le puede cobrar a un cliente.
//
// Los precios están en SOLES, en unidades enteras (no céntimos). Deben coincidir
// con brand-shield/src/lib/precios.js, que es quien decide el monto real que se
// cobra — esto es solo lo que ve el usuario. Si cambian allá, cambian acá.
export const MONEDA = 'PEN';
export const SIMBOLO = 'S/';

export const CATALOGO = [
  {
    id: 'gratuito',
    plan: 'GRATIS',
    periodo: null,
    nombre: 'Plan Gratuito',
    precio: 0,
    unidad: 'para siempre',
    imagen: 'gratuito',
    descripcion:
      'Monitoreo de 1 negocio con escaneo cada 24 horas. Incluye score de reputación 0-100, detección de reseñas falsas, QR y enlace para pedir reseñas, 30 plantillas de respuesta, 5 usos de IA a la semana, 1 competidor vigilado y alertas por email. Historial de 7 días.',
    incluye: ['1 negocio monitoreado', 'Escaneo cada 24 horas', 'Alertas por email', '7 días de historial'],
    comprable: false,
  },
  {
    id: 'negocio-mensual',
    plan: 'NEGOCIO',
    periodo: 'mensual',
    nombre: 'Plan Negocio — mensual',
    precio: 59,
    unidad: 'por mes',
    imagen: 'negocio',
    destacado: true,
    descripcion:
      'Monitoreo de hasta 5 negocios con escaneo cada 4 horas. Incluye 100 usos de IA a la semana para respuestas y análisis, 5 competidores vigilados por negocio con análisis IA de sus puntos débiles, conexión de TikTok, detección avanzada de bots, alertas por email y Telegram, reporte PDF mensual automático, 90 días de historial y boleta o factura electrónica a tu RUC. Cobro mensual, se renueva cada 30 días.',
    incluye: ['Hasta 5 negocios', 'Escaneo cada 4 horas', 'Email + Telegram', 'Reporte PDF mensual', '90 días de historial'],
    comprable: true,
  },
  {
    id: 'negocio-anual',
    plan: 'NEGOCIO',
    periodo: 'anual',
    nombre: 'Plan Negocio — anual',
    precio: 564,
    unidad: 'por año (equivale a S/47 por mes)',
    imagen: 'negocio-anual',
    descripcion:
      'Las mismas prestaciones del Plan Negocio con pago anual adelantado: hasta 5 negocios, escaneo cada 4 horas, 100 usos de IA a la semana, 5 competidores por negocio, conexión de TikTok, reporte PDF mensual y 90 días de historial. Un solo cargo al año, con 20% de descuento frente al pago mensual.',
    incluye: ['Todo el Plan Negocio', 'Un solo cargo al año', '20% de ahorro', 'Boleta o factura a tu RUC'],
    comprable: true,
  },
  {
    id: 'franquicia-mensual',
    plan: 'FRANQUICIA',
    periodo: 'mensual',
    nombre: 'Plan Franquicia — mensual',
    precio: 179,
    unidad: 'por mes',
    imagen: 'franquicia',
    descripcion:
      'Para cadenas y grupos hoteleros: negocios ilimitados con escaneo cada hora. Incluye 300 usos de IA a la semana, 15 competidores por negocio con descubrimiento automático de rivales cercanos, conexión de TikTok, alertas por email, Telegram y WhatsApp, reportes PDF semanales y mensuales, panel de control ejecutivo multi-sede, historial ilimitado y soporte prioritario por WhatsApp. Cobro mensual.',
    incluye: ['Negocios ilimitados', 'Escaneo cada hora', 'Email + Telegram + WhatsApp', 'Panel multi-sede', 'Historial ilimitado'],
    comprable: true,
  },
  {
    id: 'franquicia-anual',
    plan: 'FRANQUICIA',
    periodo: 'anual',
    nombre: 'Plan Franquicia — anual',
    precio: 1716,
    unidad: 'por año (equivale a S/143 por mes)',
    imagen: 'franquicia-anual',
    descripcion:
      'Las mismas prestaciones del Plan Franquicia con pago anual adelantado: negocios ilimitados, escaneo cada hora, 300 usos de IA a la semana, 15 competidores por negocio, panel ejecutivo multi-sede e historial ilimitado. Un solo cargo al año, con 20% de descuento frente al pago mensual.',
    incluye: ['Todo el Plan Franquicia', 'Un solo cargo al año', '20% de ahorro', 'Soporte prioritario'],
    comprable: true,
  },
];
