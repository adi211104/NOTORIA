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
// El tope de locales sale de `lib/planes.js`, que es el espejo del backend. Las
// descripciones de abajo lo interpolan en vez de escribir «50» a mano: hasta el
// 2026-08-26 decían «sin tope de locales», que era falso, y este archivo es
// literalmente el catálogo que Culqi revisa.
import { MAX_LOCALES_TOTALES } from './planes';

export const MONEDA = 'PEN';
export const SIMBOLO = 'S/';

// Monto a cobrar, en CÉNTIMOS, que es lo que espera Culqi en `amount`.
//
// Tiene que redondear igual que el backend (`Math.round(precioBase / 2)` sobre
// céntimos en pago.routes.js y en el cron de renovación), o el widget le
// enseña al usuario un importe distinto del que se le cobra. Pasaba con la
// promo de bienvenida: redondeando en SOLES, S/59 / 2 = 29.5 → 30, y el widget
// decía S/30.00 mientras el backend cobraba S/29.50. Medio sol de diferencia,
// pero el importe mostrado antes de pagar debe ser exactamente el cobrado.
//
// El monto real lo decide siempre el backend; esto solo controla lo que se ve.
export const montoEnCentimos = (precioEnSoles, aplicaPromo = false) => {
  const centimos = Math.round(precioEnSoles * 100);
  return aplicaPromo ? Math.round(centimos / 2) : centimos;
};

// Para mostrarlo: "29.50", "59.00"
export const formatearSoles = (centimos) => (centimos / 100).toFixed(2);

// ── El local adicional ──────────────────────────────────────────────────────
//
// Desde el 2026-08-25 todo plan de pago incluye UN local y los demás se cobran.
// Debe coincidir con `PRECIOS[plan].local` en brand-shield/src/lib/precios.js,
// que es quien decide el monto real; esto es solo lo que ve el usuario.
// `scripts/prueba-planes.js` falla si se separan.
//
// IMPULSO no aparece a propósito: es el plan de un solo local, y quien abre el
// segundo es exactamente a quien le toca subir a Negocio.
export const PRECIO_LOCAL = {
  NEGOCIO:    { mensual: 39, anual: 372 },
  FRANQUICIA: { mensual: 99, anual: 948 },
};

/** Lo que cuesta un local adicional en este plan y periodo, en soles. */
export const precioLocalDe = (plan, periodo = 'mensual') =>
  PRECIO_LOCAL[plan]?.[periodo] ?? null;

// Desde S/700 el comprobante debe identificar al comprador (RS 007-99, art. 8),
// así que esos datos se piden ANTES de cobrar. Hoy solo lo cruza Franquicia
// anual (S/1716); Negocio anual son S/564 y se queda por debajo.
//
// Debe coincidir con UMBRAL_IDENTIFICACION en brand-shield/src/lib/tributario.js,
// que es quien lo hace cumplir de verdad: esto solo decide qué se le avisa al
// usuario. Si cambia allá, cambia acá.
export const UMBRAL_IDENTIFICACION_SOLES = 700;

export const requiereIdentificacion = (precioEnSoles) => precioEnSoles >= UMBRAL_IDENTIFICACION_SOLES;

/**
 * Precio mensual publicado de un plan, en soles. Existe porque
 * `dashboard/configuracion` traía los precios ESCRITOS A MANO dentro de un texto
 * ("Negocio — S/59/mes"): una cuarta copia, en el idioma, que nadie iba a
 * actualizar el día que cambie una tarifa. Devuelve null para los planes que no
 * se cobran.
 */
export const precioMensualDe = (plan) =>
  CATALOGO.find((c) => c.plan === plan && c.periodo === 'mensual')?.precio ?? null;

export const CATALOGO = [
  {
    id: 'gratuito',
    plan: 'GRATIS',
    periodo: null,
    nombre: 'Plan Gratuito',
    precio: 0,
    unidad: 'para siempre',
    imagen: 'gratuito',
    // ⚠️ Decía "Historial de 7 días" y era FALSO: no hay retención por plan en
    // ninguna parte del código — los snapshots se guardan igual para todos. Es
    // el mismo reclamo que §15 mandó retirar del landing en su día y que aquí
    // sobrevivió, porque la limpieza se hizo sobre page.js y no sobre el
    // catálogo. Retirado el 2026-08-24.
    descripcion:
      'Monitoreo de 1 negocio con escaneo cada 24 horas. Incluye score de reputación 0-100, detección de reseñas falsas, QR y enlace para pedir reseñas, 30 plantillas de respuesta, 5 usos de IA a la semana, 1 competidor vigilado y alertas por email.',
    incluye: ['1 negocio monitoreado', 'Escaneo cada 24 horas', 'Alertas por email', 'Aviso si tu ficha aparece cerrada en Google'],
    comprable: false,
  },
  // ── Plan Impulso ────────────────────────────────────────────────────────────
  // El escalón entre el gratuito y Negocio (2026-08-24). Lo que de verdad lo
  // hace comprable es la VIGILANCIA DE FICHA: que cualquiera pueda sugerirle a
  // Google que tu local cerró, o cambiarte el horario, y que Google lo aplique
  // sin avisarte. Un dueño lo entiende en una frase.
  //
  // 🔴 Todo lo que se promete acá lo ejecuta el worker de verdad — es la regla
  // de §15. Las capacidades reales están en brand-shield/src/lib/planes.js, y
  // scripts/prueba-planes.js comprueba que este catálogo cuadre con los precios.
  {
    id: 'impulso-mensual',
    plan: 'IMPULSO',
    periodo: 'mensual',
    nombre: 'Plan Impulso — mensual',
    precio: 29,
    unidad: 'por mes',
    imagen: 'impulso',
    descripcion:
      'Para una tienda, una barbería o un local con una sola sede. Monitoreo de 1 negocio con escaneo cada 12 horas —el doble de rápido que el plan gratuito— y aviso inmediato si te cambian el teléfono, el horario, el nombre o la dirección en tu ficha de Google, o si alguien la marca como cerrada. Incluye 25 usos de IA a la semana para responder reseñas, 3 competidores vigilados, aviso si una reseña crítica lleva 24 horas sin respuesta, alertas por email y notificaciones en la app de Android, reporte PDF mensual automático y boleta o factura electrónica a tu RUC. Cobro mensual, se renueva cada 30 días.',
    incluye: ['1 negocio monitoreado', 'Escaneo cada 12 horas', 'Aviso si te alteran la ficha', '25 usos de IA por semana', '3 competidores vigilados', 'Reporte PDF mensual'],
    comprable: true,
  },
  {
    id: 'impulso-anual',
    plan: 'IMPULSO',
    periodo: 'anual',
    nombre: 'Plan Impulso — anual',
    precio: 276,
    unidad: 'por año (equivale a S/23 por mes)',
    imagen: 'impulso-anual',
    descripcion:
      'Las mismas prestaciones del Plan Impulso con pago anual adelantado: 1 negocio, escaneo cada 12 horas, aviso si te alteran la ficha de Google, 25 usos de IA a la semana, 3 competidores vigilados y reporte PDF mensual. Un solo cargo al año, con 20% de descuento frente al pago mensual.',
    incluye: ['Todo el Plan Impulso', 'Un solo cargo al año', '20% de ahorro', 'Boleta o factura a tu RUC'],
    comprable: true,
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
      `Monitoreo de tu local con escaneo cada 4 horas, y hasta ${MAX_LOCALES_TOTALES - 1} locales más por S/39 al mes cada uno. Incluye 100 usos de IA a la semana para respuestas y análisis, 5 competidores vigilados por negocio con análisis IA de sus puntos débiles, conexión de TikTok, detección de reseñas copiadas y de picos anormales, aviso si te cambian el teléfono o el horario en tu ficha de Google, constancia de reputación con código verificable, panel compartido con 2 personas más de tu equipo (cada una con su propio usuario y su rol), alertas por email y notificaciones en la app de Android, reporte PDF mensual automático y boleta o factura electrónica a tu RUC. Cobro mensual, se renueva cada 30 días.`,
    incluye: ['1 local incluido (+S/39 por local extra)', 'Escaneo cada 4 horas', 'Panel para 3 personas', 'Alertas por email y app', 'Reporte PDF mensual', 'Aviso si te alteran la ficha'],
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
      'Las mismas prestaciones del Plan Negocio con pago anual adelantado: tu local con escaneo cada 4 horas (y S/372 al año por cada local adicional), 100 usos de IA a la semana, 5 competidores por negocio, conexión de TikTok, panel compartido con 2 personas más de tu equipo y reporte PDF mensual. Un solo cargo al año, con 20% de descuento frente al pago mensual.',
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
      `Para cadenas y grupos hoteleros: escaneo cada hora y hasta ${MAX_LOCALES_TOTALES} locales en la misma cuenta — se suman de a uno por S/99 al mes cada uno. Incluye 300 usos de IA a la semana, 15 competidores por negocio con descubrimiento automático de rivales cercanos, conexión de TikTok, alertas por email y notificaciones en la app de Android, reporte PDF mensual, todos tus locales en un solo panel, panel compartido con hasta 9 personas más —cada encargado con acceso solo a su sede— y soporte prioritario por correo. Cobro mensual.`,
    incluye: ['1 local incluido (+S/99 por local extra)', 'Escaneo cada hora', 'Panel para 10 personas', 'Alertas por email y app', 'Todos tus locales en un panel', 'Soporte prioritario'],
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
      `Las mismas prestaciones del Plan Franquicia con pago anual adelantado: escaneo cada hora y hasta ${MAX_LOCALES_TOTALES - 1} locales más (S/948 al año por cada local adicional), 300 usos de IA a la semana, 15 competidores por negocio, panel compartido con hasta 9 personas más y todos tus locales en un solo panel. Un solo cargo al año, con 20% de descuento frente al pago mensual.`,
    incluye: ['Todo el Plan Franquicia', 'Un solo cargo al año', '20% de ahorro', 'Soporte prioritario'],
    comprable: true,
  },
];
