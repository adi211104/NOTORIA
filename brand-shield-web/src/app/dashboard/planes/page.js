'use client';
import { PLANES as CAPACIDADES_PLAN, MAX_LOCALES_TOTALES } from '../../../lib/planes';
import { useState, useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import { pagos } from '../../../lib/api';
// Mismo redondeo a céntimos que usa el backend, para que el importe del widget
// coincida exactamente con el que se cobra.
import { montoEnCentimos, requiereIdentificacion, UMBRAL_IDENTIFICACION_SOLES, precioLocalDe } from '../../../lib/catalogo';
import DatosFiscales from '../../../components/DatosFiscales';
import BannerPromo from '../../../components/BannerPromo';
import ResultadoPago from '../../../components/ResultadoPago';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';
const GH = '#0D8A2A';

// Moneda de cobro. Debe coincidir con MONEDA en el backend (brand-shield/src/
// lib/precios.js): el monto real lo decide el backend, esto solo controla lo que
// ve el usuario y lo que se le pasa al widget de Culqi.
const MONEDA = 'PEN';
const S = 'S/';

const PLANES = {
  es: [
    {
      id: 'GRATIS',
      nombre: 'Gratuito',
      precio: 0,
      precioAnual: 0,
      descripcion: 'Para conocer Notoria',
      features: [
        { texto: '1 negocio monitoreado', ok: true },
        { texto: 'Escaneo cada 24 horas', ok: true },
        { texto: 'Score de reputación 0-100', ok: true },
        { texto: 'QR y enlace para pedir reseñas', ok: true },
        { texto: '30 plantillas de respuesta', ok: true },
        { texto: 'Solo 5 usos de IA a la semana', ok: true },
        { texto: 'Solo 1 competidor monitoreado', ok: true },
        { texto: 'Alertas por email', ok: true },
        { texto: 'Aviso si tu ficha aparece cerrada en Google', ok: true },
        { texto: 'La cuenta es solo tuya (1 persona)', ok: true },
        { texto: 'Compartir el panel con tu equipo', ok: false },
        { texto: 'Escaneos más frecuentes (12h, 4h o 1h)', ok: false },
        { texto: 'Conexión de TikTok', ok: false },
        { texto: 'IA amplia para respuestas y análisis', ok: false },
        { texto: 'Análisis IA de la competencia', ok: false },
        { texto: 'Reportes PDF automáticos', ok: false },
        { texto: `Hasta ${MAX_LOCALES_TOTALES} locales en la misma cuenta`, ok: false },
        { texto: 'Soporte prioritario', ok: false },
      ],
      cta: 'Plan actual',
      ctaActivo: false,
    },
    {
      id: 'IMPULSO',
      nombre: 'Impulso',
      precio: 29,
      precioAnual: 23,
      descripcion: 'Para una tienda o un local con una sola sede',
      features: [
        { texto: '1 negocio monitoreado', ok: true },
        { texto: 'Escaneo cada 12 horas', ok: true },
        { texto: 'Aviso si te cambian el teléfono, el horario o la dirección', ok: true },
        { texto: '25 usos de IA a la semana', ok: true },
        { texto: '3 competidores monitoreados', ok: true },
        { texto: 'Aviso si una reseña crítica lleva 24 h sin respuesta', ok: true },
        { texto: 'Reporte PDF mensual automático', ok: true },
        { texto: 'Alertas por email', ok: true },
        { texto: 'Boleta o factura electrónica a tu RUC', ok: true },
        { texto: 'Todo lo del plan Gratuito', ok: true },
        { texto: 'Compartir el panel con tu equipo', ok: false },
        { texto: 'Conexión de TikTok', ok: false },
        { texto: 'Constancia de reputación verificable', ok: false },
        { texto: `Hasta ${MAX_LOCALES_TOTALES} locales en la misma cuenta`, ok: false },
        { texto: 'Soporte prioritario', ok: false },
      ],
      cta: 'Contratar plan Impulso',
      ctaActivo: true,
    },
    {
      id: 'NEGOCIO',
      nombre: 'Negocio',
      precio: 59,
      precioAnual: 47,
      descripcion: 'Para negocios que cuidan su reputación',
      badge: 'Más popular',
      features: [
        { texto: '1 local incluido · S/39 por local adicional', ok: true },
        { texto: 'Escaneo cada 4 horas', ok: true },
        { texto: '100 usos de IA a la semana (respuestas y análisis)', ok: true },
        { texto: '5 competidores por negocio', ok: true },
        { texto: 'Análisis IA de la competencia', ok: true },
        { texto: 'Historial de rating desde que te registras', ok: true },
        { texto: 'Conexión de TikTok (perfil y videos)', ok: true },
        { texto: 'Detección de bots avanzada', ok: true },
        { texto: 'Alertas por email', ok: true },
        { texto: 'Reporte PDF mensual automático', ok: true },
        { texto: 'Boleta o factura electrónica a tu RUC', ok: true },
        { texto: 'Comparte el panel con 2 personas más', ok: true },
        { texto: 'Todo lo del plan Gratuito', ok: true },
        { texto: `Hasta ${MAX_LOCALES_TOTALES} locales en la misma cuenta`, ok: true },
        { texto: 'Soporte prioritario', ok: false },
      ],
      // No decir "7 días gratis": NO existe periodo de prueba. El cobro es
      // inmediato al suscribirse, así que anunciarlo sería publicidad engañosa
      // (Ley 29571) y contradice los propios Términos, que dicen que los planes
      // de pago se facturan por adelantado.
      cta: 'Contratar plan Negocio',
      ctaActivo: true,
    },
    {
      id: 'FRANQUICIA',
      nombre: 'Franquicia',
      precio: 179,
      precioAnual: 143,
      descripcion: 'Para cadenas, grupos hoteleros y agencias',
      features: [
        { texto: '1 local incluido · S/99 por local adicional', ok: true },
        { texto: 'Escaneo cada hora', ok: true },
        { texto: '300 usos de IA a la semana', ok: true },
        { texto: '15 competidores por negocio', ok: true },
        { texto: 'Análisis IA de la competencia', ok: true },
        { texto: 'Historial de rating desde que te registras', ok: true },
        { texto: 'Conexión de TikTok (perfil y videos)', ok: true },
        { texto: 'Detección de bots avanzada', ok: true },
        { texto: 'Alertas por email', ok: true },
        { texto: 'Reporte PDF mensual', ok: true },
        { texto: 'Boleta o factura electrónica a tu RUC', ok: true },
        { texto: 'Comparte el panel con 9 personas más', ok: true },
        { texto: 'Da acceso a cada encargado solo a su sede', ok: true },
        { texto: `Hasta ${MAX_LOCALES_TOTALES} locales en la misma cuenta`, ok: true },
        { texto: 'Soporte prioritario por correo', ok: true },
        { texto: 'Todo lo del plan Negocio', ok: true },
      ],
      cta: 'Contratar plan Franquicia',
      ctaActivo: true,
    },
  ],

  en: [
    {
      id: 'GRATIS',
      nombre: 'Free',
      precio: 0,
      precioAnual: 0,
      descripcion: 'To get to know Notoria',
      features: [
        { texto: '1 monitored business', ok: true },
        { texto: 'Scan every 24 hours', ok: true },
        { texto: '0-100 reputation score', ok: true },
        { texto: 'QR and link to request reviews', ok: true },
        { texto: '30 reply templates', ok: true },
        { texto: 'Only 5 AI uses per week', ok: true },
        { texto: 'Only 1 monitored competitor', ok: true },
        { texto: 'Email alerts', ok: true },
        { texto: 'Alert if your listing shows as closed on Google', ok: true },
        { texto: 'The account is yours alone (1 person)', ok: true },
        { texto: 'Share the dashboard with your team', ok: false },
        { texto: 'More frequent scans (12h, 4h or 1h)', ok: false },
        { texto: 'TikTok connection', ok: false },
        { texto: 'Extended AI for replies and analysis', ok: false },
        { texto: 'AI competitor analysis', ok: false },
        { texto: 'Automatic PDF reports', ok: false },
        { texto: `Up to ${MAX_LOCALES_TOTALES} locations in one account`, ok: false },
        { texto: 'Priority support', ok: false },
      ],
      cta: 'Current plan',
      ctaActivo: false,
    },
    {
      id: 'IMPULSO',
      nombre: 'Impulso',
      precio: 29,
      precioAnual: 23,
      descripcion: 'For a shop or a single-location business',
      features: [
        { texto: '1 monitored business', ok: true },
        { texto: 'Scan every 12 hours', ok: true },
        { texto: 'Alert if your phone, hours or address are changed', ok: true },
        { texto: '25 AI uses per week', ok: true },
        { texto: '3 monitored competitors', ok: true },
        { texto: 'Alert if a critical review goes 24h without a reply', ok: true },
        { texto: 'Automatic monthly PDF report', ok: true },
        { texto: 'Email alerts', ok: true },
        { texto: 'Electronic invoice to your RUC', ok: true },
        { texto: 'Everything in the Free plan', ok: true },
        { texto: 'Share the dashboard with your team', ok: false },
        { texto: 'TikTok connection', ok: false },
        { texto: 'Verifiable reputation certificate', ok: false },
        { texto: `Up to ${MAX_LOCALES_TOTALES} locations in one account`, ok: false },
        { texto: 'Priority support', ok: false },
      ],
      cta: 'Get the Impulso plan',
      ctaActivo: true,
    },
    {
      id: 'NEGOCIO',
      nombre: 'Business',
      precio: 59,
      precioAnual: 47,
      descripcion: 'For businesses that care about their reputation',
      badge: 'Most popular',
      features: [
        { texto: '1 location included · S/39 per extra location', ok: true },
        { texto: 'Scan every 4 hours', ok: true },
        { texto: '100 AI uses per week (replies and analysis)', ok: true },
        { texto: '5 competitors per business', ok: true },
        { texto: 'AI competitor analysis', ok: true },
        { texto: 'Rating history from the day you sign up', ok: true },
        { texto: 'TikTok connection (profile and videos)', ok: true },
        { texto: 'Advanced bot detection', ok: true },
        { texto: 'Email alerts', ok: true },
        { texto: 'Automatic monthly PDF report', ok: true },
        { texto: 'Automatic electronic invoice (SUNAT, Peru)', ok: true },
        { texto: 'Share the dashboard with 2 more people', ok: true },
        { texto: 'Everything in the Free plan', ok: true },
        { texto: `Up to ${MAX_LOCALES_TOTALES} locations in one account`, ok: true },
        { texto: 'Priority support', ok: false },
      ],
      cta: 'Get the Business plan', // ver la nota del plan Negocio en español
      ctaActivo: true,
    },
    {
      id: 'FRANQUICIA',
      nombre: 'Franchise',
      precio: 179,
      precioAnual: 143,
      descripcion: 'For chains, hotel groups and agencies',
      features: [
        { texto: '1 location included · S/99 per extra location', ok: true },
        { texto: 'Scan every hour', ok: true },
        { texto: '300 AI uses per week', ok: true },
        { texto: '15 competitors per business', ok: true },
        { texto: 'AI competitor analysis', ok: true },
        { texto: 'Rating history from the day you sign up', ok: true },
        { texto: 'TikTok connection (profile and videos)', ok: true },
        { texto: 'Advanced bot detection', ok: true },
        { texto: 'Email alerts', ok: true },
        { texto: 'Share the dashboard with 9 more people', ok: true },
        { texto: 'Give each manager access to their location only', ok: true },
        { texto: 'Monthly PDF report', ok: true },
        { texto: 'Automatic electronic invoice (SUNAT, Peru)', ok: true },
        { texto: `Up to ${MAX_LOCALES_TOTALES} locations in one account`, ok: true },
        { texto: 'Priority email support', ok: true },
        { texto: 'Everything in the Business plan', ok: true },
      ],
      cta: 'Get the Franchise plan',
      ctaActivo: true,
    },
  ],
};

const TEXTOS = {
  es: {
    procesandoPago: 'Procesando tu pago…',
    errorPagosProximamente: 'Los pagos con tarjeta estarán disponibles muy pronto.',
    errorPagoGenerico: 'No se pudo procesar el pago. Intenta con otra tarjeta.',
    header: {
      titulo: 'Elige tu plan',
      sub1: 'Protege la reputación de tu negocio antes de que el daño sea irreversible.',
      sub2: 'Cancela cuando quieras, sin contratos.',
    },
    toggle: ['Mensual', 'Anual'],
    tuPlanActual: 'Tu plan actual',
    gratisParaSiempre: 'para siempre',
    mes: '/mes',
    anio: '/año',
    ahorras: (m) => `Ahorras ${S}${m}/año`,
    oAnual: (precioAnual) => `o ${S}${precioAnual}/mes pagando anual`,
    promoBienvenida: '50% OFF tus primeros 2 meses',
    planActivo: 'Plan activo',
    soloPropietario: 'Solo el propietario de la cuenta puede cambiar de plan',
    locales: {
      titulo: 'Locales a monitorear',
      quitar: 'Quitar un local',
      sumar: 'Sumar un local',
      // El primero va incluido, así que solo se nombra el precio de los demás.
      extra: (S, precio, anual) =>
        precio ? `El primero va incluido · ${S}${precio} por cada local extra ${anual ? 'al año' : 'al mes'}` : '',
    },
    // Bloque del plan que YA se tiene: acá los locales no se compran con el
    // widget sino con la tarjeta guardada, y el importe lo dice el servidor.
    misLocales: {
      titulo: 'Tus locales',
      sub: (n) => `Ahora monitoreas ${n} local${n === 1 ? '' : 'es'}`,
      cobroHoy: (S, monto, dias) =>
        `Se cobrará ${S}${monto} ahora, por los ${dias} día${dias === 1 ? '' : 's'} que le quedan a tu periodo.`,
      cobroGratis: 'No te cobramos nada por lo que queda del periodo.',
      renovacion: (S, monto, fecha) => `Desde el ${fecha} pagarás ${S}${monto}.`,
      bajada: (S, monto, fecha) => `Dejarás de pagarlos: desde el ${fecha} pagarás ${S}${monto}.`,
      confirmarSumar: 'Confirmar y pagar',
      confirmarGratis: 'Confirmar',
      confirmarBajar: 'Confirmar cambio',
      cancelar: 'Cancelar',
      procesando: 'Procesando…',
      // El tope no es el del plan, es cuántas fichas tiene cargadas: bajar por
      // debajo de eso apagaría la vigilancia de un local sin avisar.
      enUso: (n) => `Tienes ${n} local${n === 1 ? '' : 'es'} cargado${n === 1 ? '' : 's'}. Desactiva los que ya no uses para poder bajar.`,
      sinSuscripcion: 'Necesitas una suscripción activa para cambiar tus locales.',
      planSinLocales: 'El Plan Impulso cubre un solo local. Para vigilar más de uno, el salto es al Plan Negocio, que incluye uno y permite sumar los demás.',
      sinTarjeta: 'No hay una tarjeta guardada en esta cuenta, así que no podemos cobrar el local. Contrata el plan desde esta pantalla para registrar una.',
    },
    valorTitulo: '¿Por qué vale la pena pagar?',
    valorItems: [
      { t:'Cada hora importa', d:'Un ataque de reseñas falsas puede destruir semanas de trabajo en una noche. Con escaneo cada 4 horas, actúas antes de que el daño sea irreversible.' },
      { t:'Los bots son reales', d:'El 30% de las reseñas negativas en restaurantes tienen patrones de bots. Nuestro detector identifica cuentas creadas el mismo día con texto repetitivo.' },
      { t:'Tu reputación en papel', d:'El reporte PDF mensual te da un documento profesional para mostrar a socios, inversionistas o bancos. Tu reputación online tiene valor medible.' },
    ],
    footerNota: 'Sin contratos · Cancela cuando quieras · Precios en soles, IGV incluido',
  },

  en: {
    procesandoPago: 'Processing your payment…',
    errorPagosProximamente: 'Card payments will be available very soon.',
    errorPagoGenerico: 'We could not process the payment. Try a different card.',
    header: {
      titulo: 'Choose your plan',
      sub1: 'Protect your business reputation before the damage becomes irreversible.',
      sub2: 'Cancel anytime, no contracts.',
    },
    toggle: ['Monthly', 'Yearly'],
    tuPlanActual: 'Your current plan',
    gratisParaSiempre: 'forever',
    mes: '/mo',
    anio: '/yr',
    ahorras: (m) => `Save ${S}${m}/year`,
    oAnual: (precioAnual) => `or ${S}${precioAnual}/mo billed yearly`,
    promoBienvenida: '50% OFF your first 2 months',
    planActivo: 'Active plan',
    soloPropietario: 'Only the account owner can change the plan',
    locales: {
      titulo: 'Locations to monitor',
      quitar: 'Remove a location',
      sumar: 'Add a location',
      extra: (S, precio, anual) =>
        precio ? `First one included · ${S}${precio} per extra location ${anual ? 'a year' : 'a month'}` : '',
    },
    misLocales: {
      titulo: 'Your locations',
      sub: (n) => `You are monitoring ${n} location${n === 1 ? '' : 's'}`,
      cobroHoy: (S, monto, dias) =>
        `You will be charged ${S}${monto} now, for the ${dias} day${dias === 1 ? '' : 's'} left in your period.`,
      cobroGratis: 'We will not charge you anything for the rest of the period.',
      renovacion: (S, monto, fecha) => `From ${fecha} you will pay ${S}${monto}.`,
      bajada: (S, monto, fecha) => `You will stop paying for them: from ${fecha} you will pay ${S}${monto}.`,
      confirmarSumar: 'Confirm and pay',
      confirmarGratis: 'Confirm',
      confirmarBajar: 'Confirm change',
      cancelar: 'Cancel',
      procesando: 'Processing…',
      enUso: (n) => `You have ${n} location${n === 1 ? '' : 's'} set up. Deactivate the ones you no longer use to lower this.`,
      sinSuscripcion: 'You need an active subscription to change your locations.',
      planSinLocales: 'The Impulso plan covers a single location. To monitor more than one, the step up is the Negocio plan, which includes one and lets you add the rest.',
      sinTarjeta: 'There is no saved card on this account, so we cannot charge for the location. Subscribe from this screen to register one.',
    },
    valorTitulo: 'Why is it worth paying?',
    valorItems: [
      { t:'Every hour matters', d:'A fake-review attack can destroy weeks of work in one night. With scans every 4 hours, you act before the damage becomes irreversible.' },
      { t:'Bots are real', d:'30% of negative restaurant reviews show bot patterns. Our detector flags accounts created the same day with repetitive text.' },
      { t:'Your reputation on paper', d:'The monthly PDF report gives you a professional document to show partners, investors or banks. Your online reputation has measurable value.' },
    ],
    footerNota: 'No contracts · Cancel anytime · Prices in Peruvian soles, VAT included',
  },
};

const CheckIcon = ({ ok }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ok ? G : '#3A3A38'} strokeWidth={ok ? 2.5 : 2} strokeLinecap="round">
    {ok ? <path d="M20 6L9 17l-5-5"/> : <path d="M18 6L6 18M6 6l12 12"/>}
  </svg>
);

// Céntimos → soles legibles. "1510" → "15.10", "9800" → "98". Los importes
// llegan en céntimos porque es lo que maneja Culqi y lo que devuelve el
// backend; acá solo se pintan.
const soles = (centimos) => (Number(centimos || 0) / 100).toFixed(2).replace(/\.00$/, '');

// ── Locales del plan que YA se tiene ────────────────────────────────────────
//
// 🔴 Va en un componente A NIVEL DE MÓDULO, no dentro de PlanesPage: en este
// proyecto un componente definido dentro de su padre se remonta en cada render
// y los controles pierden el foco (§16 del CLAUDE.md).
//
// 🔴 Y sobre todo: acá NO se calcula ningún importe. El prorrateo, el total de
// la renovación y hasta si el cambio es posible los dice el backend
// (`GET /api/pagos/locales`), que es el mismo código que va a cobrar. Este
// proyecto ya se equivocó dos veces por calcular precios en la pantalla —el
// widget que mostraba S/30 y cobraba S/29.50, y el cartel de la promo con los
// importes escritos a mano— y esta pantalla es justo donde no puede volver a
// pasar.
//
// ⚠️ El periodo lo manda la SUSCRIPCIÓN del cliente, no el interruptor
// mensual/anual de arriba: quien paga anual y mira la pestaña "mensual" tiene
// que ver igualmente lo que le van a cobrar a él. Por eso ni se le pasa `anual`.
function MisLocales({ t, idioma, onAplicado }) {
  const [estado, setEstado] = useState(null);
  const [objetivo, setObjetivo] = useState(null); // locales TOTALES elegidos
  const [previo, setPrevio] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');

  // Carga inicial: cuántos locales tiene hoy y qué se le cobraría.
  useEffect(() => {
    let vivo = true;
    pagos.previsualizarLocales(0)
      .then((r) => {
        if (!vivo) return;
        setEstado(r);
        setObjetivo(r.incluidos + r.localesExtraActual);
      })
      // Un fallo acá no puede romper la pantalla de planes entera: el bloque
      // simplemente no se pinta y el resto sigue vendiéndose.
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Previsualización del número elegido. Con espera: el contador se pulsa
  // varias veces seguidas y no hace falta una petición por clic.
  useEffect(() => {
    if (!estado || objetivo === null) return;
    const extras = objetivo - estado.incluidos;
    if (extras === estado.localesExtraActual) { setPrevio(null); return; }
    const id = setTimeout(() => {
      pagos.previsualizarLocales(extras).then(setPrevio).catch(() => setPrevio(null));
    }, 300);
    return () => clearTimeout(id);
  }, [objetivo, estado]);

  if (!estado) return null;

  // Cuentas que no se pueden cobrar de ninguna manera: se explica en vez de
  // ofrecer un contador que va a rebotar al confirmar. Es la regla de «lo que no
  // podemos entregar no se muestra» — y el caso NO es teórico: los planes
  // concedidos a mano (los del dueño) tienen `suscripcionActiva` pero ninguna
  // tarjeta guardada, así que son justo los primeros que van a tocar esto.
  // ⚠️ PLAN_SIN_LOCALES va en ESTA lista y no en el aviso de abajo. Sin él, un
  // plan que no vende locales —hoy Impulso— pintaba el contador entero ofreciendo
  // hasta 50, y al confirmar devolvía el error de pago genérico: un mensaje de
  // cobro para algo que no es un problema de cobro. Es la regla de «lo que no
  // podemos entregar no se muestra», y el mismo fallo que tuvo la fila fija de
  // Facebook: prometer una función que no existe sin dar forma de llegar a ella.
  // 🔴 No era alcanzable hasta el 2026-08-28: hacía falta una cuenta con plan de
  // pago Y tarjeta guardada, y hasta ese día no existía ninguna.
  const bloqueado = estado.motivo === 'SIN_SUSCRIPCION' || estado.motivo === 'SIN_TARJETA'
    || estado.motivo === 'PLAN_SIN_LOCALES';
  if (bloqueado) {
    return (
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border-c)', borderRadius: 6,
        padding: '11px 12px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t.misLocales.titulo}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5 }}>
          {estado.motivo === 'SIN_TARJETA' ? t.misLocales.sinTarjeta
            : estado.motivo === 'PLAN_SIN_LOCALES' ? t.misLocales.planSinLocales
            : t.misLocales.sinSuscripcion}
        </div>
      </div>
    );
  }

  const actual = estado.incluidos + estado.localesExtraActual;
  // ⚠️ El suelo NO es el del plan: es cuántas fichas tiene cargadas. Bajar por
  // debajo dejaría de pagar locales que se están vigilando y el corte de
  // `negociosVigilables` los sacaría del barrido en silencio — el cliente vería
  // el historial de sus fichas congelarse sin un solo error en pantalla.
  const minimo = Math.max(estado.incluidos, estado.negociosActivos);
  const maximo = estado.incluidos + estado.maximoExtra;
  const hayCambio = objetivo !== actual;
  const sube = objetivo > actual;
  const fecha = estado.fechaVencimiento
    ? new Date(estado.fechaVencimiento).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE',
        { day: 'numeric', month: 'long' })
    : '';

  const aplicar = async () => {
    setAplicando(true); setError('');
    try {
      const r = await pagos.cambiarLocales(objetivo - estado.incluidos);
      setEstado(r);
      setObjetivo(r.incluidos + r.localesExtraActual);
      setPrevio(null);
      onAplicado?.(r);
    } catch (e) {
      setError(e.message || 'No se pudo aplicar el cambio');
    } finally {
      setAplicando(false);
    }
  };

  const paso = (delta) => setObjetivo((n) => Math.max(minimo, Math.min(maximo, n + delta)));

  const botonTexto = !sube ? t.misLocales.confirmarBajar
    : previo?.gratis ? t.misLocales.confirmarGratis
    : t.misLocales.confirmarSumar;

  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border-c)', borderRadius: 6,
      padding: '11px 12px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t.misLocales.titulo}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>
            {t.misLocales.sub(actual)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button type="button" aria-label={t.locales.quitar} onClick={() => paso(-1)}
            disabled={objetivo <= minimo || aplicando}
            style={{
              width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border-c)',
              background: 'var(--surface)', color: 'var(--text-2)', fontSize: 15, lineHeight: 1,
              cursor: objetivo <= minimo || aplicando ? 'default' : 'pointer',
              opacity: objetivo <= minimo || aplicando ? 0.4 : 1, fontFamily: GEO,
            }}>−</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 18, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {objetivo}
          </span>
          <button type="button" aria-label={t.locales.sumar} onClick={() => paso(1)}
            disabled={objetivo >= maximo || aplicando}
            style={{
              width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border-c)',
              background: 'var(--surface)', color: 'var(--text-2)', fontSize: 15, lineHeight: 1,
              cursor: objetivo >= maximo || aplicando ? 'default' : 'pointer',
              opacity: objetivo >= maximo || aplicando ? 0.4 : 1, fontFamily: GEO,
            }}>+</button>
        </div>
      </div>

      {/* Por qué no se puede bajar más. Se dice SIEMPRE que el suelo lo marquen
          las fichas cargadas, no solo al intentarlo: un botón apagado sin
          explicación es exactamente el «mensaje que manda a un sitio sin el
          botón que promete» al revés. */}
      {minimo > estado.incluidos && objetivo <= minimo && !hayCambio && (
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
          {t.misLocales.enUso(estado.negociosActivos)}
        </div>
      )}

      {hayCambio && previo && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-c)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {sube && (previo.gratis
              ? t.misLocales.cobroGratis
              : t.misLocales.cobroHoy(S, soles(previo.aCobrarHoy), previo.dias))}
            {' '}
            {sube
              ? t.misLocales.renovacion(S, soles(previo.renovacionNueva), fecha)
              : t.misLocales.bajada(S, soles(previo.renovacionNueva), fecha)}
          </div>

          {previo.motivo && (
            <div style={{ fontSize: 11.5, color: '#C0392B', marginTop: 8, lineHeight: 1.5 }}>
              {previo.motivo === 'LOCALES_EN_USO' ? t.misLocales.enUso(estado.negociosActivos)
                : previo.motivo === 'SIN_SUSCRIPCION' ? t.misLocales.sinSuscripcion
                : previo.motivo === 'PLAN_SIN_LOCALES' ? t.misLocales.planSinLocales
                : t.errorPagoGenerico}
            </div>
          )}

          {/* ⚠️ APILADOS, no en una fila. La rejilla de las tarjetas es
              `minmax(232px,1fr)`, así que en una tablet una tarjeta baja a ~196px
              de contenido: ahí «Confirmar y pagar» (~112px) más «Cancelar»
              (~78px) más el hueco no entran, y en español el primero es aún más
              largo que en inglés. No se puede comprobar en el monitor donde se
              desarrolla —a 1568px las tarjetas miden 310px y entra de sobra—,
              que es justo por lo que se decide por el ancho peor y no por el que
              se tiene delante. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            <button type="button" onClick={aplicar} disabled={aplicando || !!previo.motivo}
              style={{
                width: '100%', padding: '9px', borderRadius: 5, fontSize: 12.5, fontWeight: 600,
                fontFamily: GEO, border: 'none', color: '#fff',
                background: aplicando || previo.motivo ? 'var(--text-3)' : G,
                cursor: aplicando || previo.motivo ? 'default' : 'pointer',
              }}>
              {aplicando ? t.misLocales.procesando : botonTexto}
            </button>
            <button type="button" onClick={() => { setObjetivo(actual); setError(''); }} disabled={aplicando}
              style={{
                width: '100%', padding: '7px', borderRadius: 5, fontSize: 12, fontFamily: GEO,
                background: 'transparent', color: 'var(--text-3)',
                border: 'none', cursor: aplicando ? 'default' : 'pointer',
              }}>
              {t.misLocales.cancelar}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11.5, color: '#C0392B', marginTop: 8, lineHeight: 1.5 }}>{error}</div>
      )}
    </div>
  );
}

export default function PlanesPage() {
  const router = useRouter();
  const { usuario, refrescarPerfil, puede } = useAuth();
  const { idioma } = useIdioma();
  const t = TEXTOS[idioma] || TEXTOS.es;
  const planes = PLANES[idioma] || PLANES.es;
  const [anual, setAnual] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [errorPago, setErrorPago] = useState('');
  const planActual = usuario?.plan || 'GRATIS';
  // Promo de bienvenida (50% los primeros 2 meses, solo mensual, una vez por
  // cuenta): el backend es quien decide el monto real al cobrar, esto solo
  // sirve para mostrar el mismo monto en el widget de Culqi antes de pagar.
  // `promoRechazada` se activa si el backend avisa de que esa tarjeta ya usó la
  // promo: se apaga el descuento para que el importe mostrado vuelva a ser el
  // que realmente se va a cobrar.
  const [promoRechazada, setPromoRechazada] = useState(false);
  // Respuesta del cobro exitoso y mensaje de cobro fallido: los dos disparan la
  // confirmación a pantalla completa (components/ResultadoPago.js)
  const [resultado, setResultado] = useState(null);
  const [errorModal, setErrorModal] = useState('');
  // Plan que espera los datos de facturación antes de poder cobrarse
  const [pidiendoDatos, setPidiendoDatos] = useState(null);
  const puedeUsarPromo = !promoRechazada && !usuario?.promoBienvenidaUsada;
  // Locales TOTALES elegidos por plan (nunca menos de 1: el primero va incluido).
  // Se guarda por plan y no en una sola variable porque en esta pantalla
  // conviven varias tarjetas y el número de locales de Negocio no es el de
  // Franquicia — cuestan distinto.
  const [locales, setLocales] = useState({});
  // ⚠️ Se pregunta a la tabla de capacidades, no a `plan.id === 'FRANQUICIA'`:
  // es la regla del proyecto y acá evita que un plan nuevo nazca sin selector.
  const vendeLocales = (planId) => CAPACIDADES_PLAN[planId]?.localesAdicionales === true;
  const localesDe = (planId) => Math.max(1, locales[planId] || 1);
  const cambiarLocales = (planId, delta) =>
    setLocales((prev) => ({ ...prev, [planId]: Math.max(1, Math.min(50, (prev[planId] || 1) + delta)) }));

  // Callback global que exige el widget de Checkout de Culqi (window.culqi)
  useEffect(() => {
    window.culqi = async () => {
      const Culqi = window.Culqi;
      if (!Culqi?.token) return;

      const token = Culqi.token.id;
      const plan = window.__notoriaPlanPendiente;
      const esAnual = window.__notoriaAnualPendiente;

      // Culqi entrega el token pero NO cierra su ventana: sin esto el usuario
      // pulsa "Pagar" y la ventana se queda igual, sin señal de nada, mientras
      // el cobro ocurre detrás. Va antes de cualquier await.
      try { Culqi.close(); } catch {}

      setProcesando(true);
      setErrorPago('');
      try {
        const resultado = await pagos.suscribir({
          token, plan, anual: esAnual,
          sinPromo: window.__notoriaSinPromo,
          // El backend lo vuelve a validar y a tarifar; esto solo dice cuántos
          // eligió el usuario. Un plan que no venda locales lo ignora.
          localesExtra: window.__notoriaLocalesPendiente || 0,
        });
        await refrescarPerfil();
        // Confirmación a pantalla completa: antes esta pantalla no daba NINGÚN
        // aviso de que el pago hubiera salido bien.
        setResultado(resultado);
      } catch (e) {
        // Tarjeta que ya gastó la promo: no se cobró nada. Se apaga el descuento
        // para que el importe mostrado coincida con el que se cobraría.
        if (e.codigo === 'PROMO_NO_APLICA') {
          setPromoRechazada(true);
          setErrorPago('Esta tarjeta ya usó la promoción de bienvenida, así que no te cobramos nada. Los precios ya muestran la tarifa regular: vuelve a pulsar el botón si quieres continuar.');
        } else {
          // Un cobro fallido va a la pantalla completa, no a una franja que se
          // puede quedar fuera de vista
          setErrorModal(e.message || t.errorPagoGenerico);
        }
      } finally {
        setProcesando(false);
      }
    };
    return () => { delete window.culqi; };
  }, [refrescarPerfil, t]);

  // `datosYaTomados` lo pasa el formulario de datos fiscales al volver: el
  // estado `usuario` todavía tiene el perfil anterior en ese instante, así que
  // sin esta señal se volvería a pedir lo que el usuario acaba de rellenar.
  const handleCTA = (plan, datosYaTomados = false) => {
    if (!plan.ctaActivo) return;

    // Franquicia también se cobra con tarjeta: antes abría un mailto y no había
    // forma de contratarlo online, que es parte de lo que Culqi observó. El
    // backend ya aceptaba el plan (ver PRECIOS en lib/precios.js).
    // El botón de compra se activaba con `id === 'NEGOCIO' || id === 'FRANQUICIA'`
    // escrito a mano: un plan nuevo se pintaba en la pantalla y no se podía comprar.
    if (CAPACIDADES_PLAN[plan.id]?.esDePago) {
      const Culqi = typeof window !== 'undefined' ? window.Culqi : null;
      const publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
      if (!Culqi || !publicKey) {
        setErrorPago(t.errorPagosProximamente);
        return;
      }

      // Los locales por encima del incluido se cobran aparte (ver lib/catalogo.js).
      // Entran en el total ANTES del umbral de S/700 a propósito: tres locales de
      // Franquicia anual lo cruzan de sobra, y calcularlo sin ellos dejaría de
      // pedir los datos fiscales justo en las ventas más grandes.
      const extras = vendeLocales(plan.id) ? localesDe(plan.id) - 1 : 0;
      const precioLocal = precioLocalDe(plan.id, anual ? 'anual' : 'mensual') || 0;

      // Desde S/700 el comprobante debe identificar al comprador: los datos se
      // piden antes de abrir el pago. El backend lo vuelve a exigir.
      const totalSoles = (anual ? plan.precioAnual * 12 : plan.precio) + extras * precioLocal;
      if (!datosYaTomados && requiereIdentificacion(totalSoles) && !usuario?.docNumero) {
        setPidiendoDatos({ nombre: `Plan ${plan.nombre} anual`, precio: totalSoles, plan });
        return;
      }

      const precioBase = totalSoles;
      const aplicaPromo = !anual && puedeUsarPromo;
      window.__notoriaPlanPendiente = plan.id;
      window.__notoriaAnualPendiente = anual;
      window.__notoriaLocalesPendiente = extras;
      // En window, no en estado: el callback global de Culqi se monta una vez y
      // se quedaría con el valor viejo.
      window.__notoriaSinPromo = !aplicaPromo;

      Culqi.publicKey = publicKey;
      // En céntimos y con el mismo redondeo que el backend. Redondeando en
      // soles el widget mostraba S/30.00 con la promo mientras el backend
      // cobraba S/29.50 — ver montoEnCentimos() en lib/catalogo.js.
      Culqi.settings({ title: 'Notoria', currency: MONEDA, amount: montoEnCentimos(precioBase, aplicaPromo) });
      Culqi.options({ lang: 'auto', paymentMethods: { tarjeta: true, yape: false, billetera: false, bancaMovil: false, agente: false, cuotealo: false } });
      Culqi.open();
    }
  };

  return (
    <div style={{ fontFamily: GEO }}>
      <Script src="https://checkout.culqi.com/js/v4" strategy="afterInteractive" />
      {errorPago && (
        <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#DC2626', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
          {errorPago}
        </div>
      )}
      {pidiendoDatos && (
        <DatosFiscales
          item={pidiendoDatos}
          onCancelar={() => setPidiendoDatos(null)}
          onListo={async () => {
            const plan = pidiendoDatos.plan;
            setPidiendoDatos(null);
            await refrescarPerfil();
            handleCTA(plan, true);
          }}
        />
      )}

      {/* Estado del cobro por encima de todo, sin depender del scroll */}
      {(procesando || resultado || errorModal) && (
        <ResultadoPago
          estado={procesando ? 'procesando' : resultado ? 'exito' : 'error'}
          datos={resultado}
          error={errorModal}
          onCerrar={() => setErrorModal('')}
          onIrAlPanel={() => { setResultado(null); router.push('/dashboard'); }}
        />
      )}
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-1px' }}>
          {t.header.titulo}
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '0 0 22px', lineHeight: 1.6 }}>
          {t.header.sub1}<br/>
          {t.header.sub2}
        </p>
        {/* Toggle mensual/anual — grande y a la vista, justo encima de los planes */}
        <div style={{ display: 'inline-flex', background: 'var(--surface2)', border: '1px solid var(--border-c)', borderRadius: 8, padding: 4, gap: 3 }}>
          {t.toggle.map((l, i) => (
            <button key={l} onClick={() => setAnual(i === 1)}
              style={{ background: (i===1)===anual ? G : 'transparent', color: (i===1)===anual ? '#fff' : 'var(--text-2)', border: 'none', borderRadius: 6, padding: '10px 26px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily: GEO, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8 }}>
              {l}
              {i === 1 && <span style={{ fontSize: 11, background: (i===1)===anual ? 'rgba(255,255,255,0.2)' : 'rgba(11,115,36,0.15)', color: (i===1)===anual ? '#fff' : G, padding: '1px 7px', borderRadius: 4, fontWeight: 700 }}>-20%</span>}
            </button>
          ))}
        </div>
      </div>

      {puedeUsarPromo && !anual && <BannerPromo compacto />}

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(232px,1fr))', gap: 14, marginBottom: 32 }}>
        {planes.map((plan) => {
          const precio = anual ? plan.precioAnual : plan.precio;
          // ⚠️ El importe que se PINTA tiene que incluir los locales elegidos.
          // Si no, la tarjeta anuncia S/59 y el widget de Culqi cobra S/137 —
          // exactamente el fallo que ya hubo con la promo, que mostraba S/30 y
          // cobraba S/29.50. Lo que se ve antes de pagar es lo que se cobra.
          const extrasPlan = vendeLocales(plan.id) ? localesDe(plan.id) - 1 : 0;
          const precioExtraPlan = extrasPlan * (precioLocalDe(plan.id, anual ? 'anual' : 'mensual') || 0);
          const totalAnual = plan.precioAnual * 12 + precioExtraPlan;
          const totalMensual = precio + precioExtraPlan;
          const esPlanActual = planActual === plan.id;
          const featured = plan.id === 'NEGOCIO';

          return (
            <div key={plan.id} style={{
              background: 'var(--surface)', borderRadius: 8, padding: 22,
              border: featured ? `2px solid ${G}` : '1px solid var(--border-c)',
              position: 'relative', display: 'flex', flexDirection: 'column',
              transform: featured ? 'scale(1.02)' : 'none',
            }}>
              {plan.badge && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: G, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 14px', borderRadius: 99, letterSpacing: 0.5, whiteSpace: 'nowrap', fontFamily: GEO }}>
                  {plan.badge}
                </div>
              )}
              {esPlanActual && !plan.badge && (
                <div style={{ position: 'absolute', top: -12, right: 12, background: 'var(--surface2)', color: 'var(--text-3)', fontSize: 10, fontWeight: 500, padding: '3px 12px', borderRadius: 99, fontFamily: GEO }}>
                  {t.tuPlanActual}
                </div>
              )}

              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{plan.nombre}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 18px', lineHeight: 1.5 }}>{plan.descripcion}</p>

              {/* Precio */}
              <div style={{ marginBottom: 18 }}>
                {precio === 0 ? (
                  <div>
                    <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1.5px' }}>{idioma === 'en' ? 'Free' : 'Gratis'}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 13, marginLeft: 6 }}>{t.gratisParaSiempre}</span>
                  </div>
                ) : anual ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 16 }}>{S}</span>
                      <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1.5px' }}>{totalAnual}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{t.anio}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'line-through' }}>{S}{plan.precio*12}</span>
                      <span style={{ fontSize: 11, color: G, fontWeight: 700 }}>{t.ahorras((plan.precio-plan.precioAnual)*12)}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 16 }}>{S}</span>
                      <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1.5px' }}>{totalMensual}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{t.mes}</span>
                    </div>
                    {plan.id === 'NEGOCIO' && puedeUsarPromo && (
                      <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, color: G, background: 'rgba(11,115,36,0.12)', border: `1px solid rgba(11,115,36,0.35)`, borderRadius: 4, padding: '2px 8px', margin: '5px 0 0' }}>
                        {t.promoBienvenida}
                      </span>
                    )}
                    {plan.precioAnual > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '5px 0 0' }}>
                        {t.oAnual(plan.precioAnual)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Selector de locales. Solo aparece en los planes que los venden
                  y solo a quien puede contratar: al invitado del equipo se le
                  enseñaría un control que no puede usar.

                  El primero va incluido en el plan, así que el mínimo es 1 y el
                  contador cuenta LOCALES, no extras — «2 locales» se entiende y
                  «1 local adicional» obliga a hacer una suma mental para saber
                  cuántos tendrás. El importe se recalcula a la vista, que es lo
                  que evita la sorpresa en el widget de Culqi. */}
              {/* El plan que YA se tiene lleva su propio control: acá no se
                  compra con el widget de Culqi sino con la tarjeta guardada, se
                  cobra prorrateado y el importe lo dice el servidor. Sin esto,
                  el cliente que ya está en NEGOCIO y abre su segundo local no
                  tenía por dónde comprarlo — y el 403 al crear el negocio lo
                  mandaba justamente a esta pantalla. */}
              {vendeLocales(plan.id) && puede('facturacion') && esPlanActual && (
                <MisLocales t={t} idioma={idioma} onAplicado={refrescarPerfil} />
              )}

              {vendeLocales(plan.id) && puede('facturacion') && !esPlanActual && (
                <div style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
                  background:'var(--surface2)', border:'1px solid var(--border-c)', borderRadius:6,
                  padding:'9px 12px', marginBottom:12,
                }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12.5, color:'var(--text-2)' }}>{t.locales.titulo}</div>
                    <div style={{ fontSize:10.5, color:'var(--text-3)', marginTop:2 }}>
                      {t.locales.extra(S, precioLocalDe(plan.id, anual ? 'anual' : 'mensual'), anual)}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <button type="button" aria-label={t.locales.quitar}
                      onClick={() => cambiarLocales(plan.id, -1)}
                      disabled={localesDe(plan.id) <= 1}
                      style={{
                        width:26, height:26, borderRadius:5, border:'1px solid var(--border-c)',
                        background:'var(--surface)', color:'var(--text-2)', fontSize:15, lineHeight:1,
                        cursor: localesDe(plan.id) <= 1 ? 'default' : 'pointer',
                        opacity: localesDe(plan.id) <= 1 ? 0.4 : 1, fontFamily:GEO,
                      }}>−</button>
                    <span style={{ fontSize:14, fontWeight:700, color:'var(--text)', minWidth:18, textAlign:'center', fontVariantNumeric:'tabular-nums' }}>
                      {localesDe(plan.id)}
                    </span>
                    <button type="button" aria-label={t.locales.sumar}
                      onClick={() => cambiarLocales(plan.id, 1)}
                      style={{
                        width:26, height:26, borderRadius:5, border:'1px solid var(--border-c)',
                        background:'var(--surface)', color:'var(--text-2)', fontSize:15, lineHeight:1,
                        cursor:'pointer', fontFamily:GEO,
                      }}>+</button>
                  </div>
                </div>
              )}

              {/* CTA — solo el propietario contrata. Al equipo invitado se le
                  deja ver la comparativa (le explica qué funciones tiene la
                  cuenta) pero no un botón de pago que devolvería 403. */}
              {!puede('facturacion') ? (
                <div style={{
                  width: '100%', padding: '11px', borderRadius: 5, fontSize: 12.5, marginBottom: 18,
                  textAlign: 'center', fontFamily: GEO, color: 'var(--text-3)',
                  background: 'var(--surface2)', border: '1px solid var(--border-c)',
                }}>
                  {t.soloPropietario}
                </div>
              ) : (
              <button onClick={() => handleCTA(plan)} disabled={!plan.ctaActivo || esPlanActual}
                style={{
                  width: '100%', padding: '11px', borderRadius: 5, fontSize: 13.5, fontWeight: 600,
                  cursor: !plan.ctaActivo || esPlanActual ? 'default' : 'pointer', fontFamily: GEO, marginBottom: 18,
                  background: esPlanActual ? 'var(--surface2)' : G,
                  color: esPlanActual ? 'var(--text-3)' : '#fff',
                  border: esPlanActual ? '1px solid var(--border-c)' : 'none',
                  opacity: esPlanActual ? 0.7 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!esPlanActual && plan.ctaActivo) e.currentTarget.style.background = GH; }}
                onMouseLeave={e => { if (!esPlanActual && plan.ctaActivo) e.currentTarget.style.background = G; }}>
                {esPlanActual ? t.planActivo : plan.cta}
              </button>
              )}

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: f.ok ? 1 : 0.35 }}>
                    <CheckIcon ok={f.ok}/>
                    <span style={{ fontSize: 13, color: f.ok ? 'var(--text-2)' : 'var(--text-3)' }}>{f.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Valor */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 8, padding: 24, marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 18px', textAlign: 'center' }}>{t.valorTitulo}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16 }}>
          {t.valorItems.map((v, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(11,115,36,0.1)', border: '1px solid rgba(11,115,36,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h4 style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14, margin: '0 0 6px' }}>{v.t}</h4>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{v.d}</p>
            </div>
          ))}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
        {t.footerNota}
      </p>
    </div>
  );
}
