'use client';
import { useState, useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { useIdioma } from '../../../context/IdiomaContext';
import { pagos } from '../../../lib/api';
// Mismo redondeo a céntimos que usa el backend, para que el importe del widget
// coincida exactamente con el que se cobra.
import { montoEnCentimos, requiereIdentificacion, UMBRAL_IDENTIFICACION_SOLES } from '../../../lib/catalogo';
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
        { texto: 'Alertas por email y en la app Android', ok: true },
        { texto: 'Aviso si tu ficha aparece cerrada en Google', ok: true },
        { texto: 'Escaneos frecuentes (4h o 1h)', ok: false },
        { texto: 'Conexión de TikTok', ok: false },
        { texto: 'IA amplia para respuestas y análisis', ok: false },
        { texto: 'Análisis IA de la competencia', ok: false },
        { texto: 'Reportes PDF automáticos', ok: false },
        { texto: 'Negocios ilimitados en un solo panel', ok: false },
        { texto: 'Soporte prioritario', ok: false },
      ],
      cta: 'Plan actual',
      ctaActivo: false,
    },
    {
      id: 'NEGOCIO',
      nombre: 'Negocio',
      precio: 59,
      precioAnual: 47,
      descripcion: 'Para negocios que cuidan su reputación',
      badge: 'Más popular',
      features: [
        { texto: 'Hasta 5 negocios', ok: true },
        { texto: 'Escaneo cada 4 horas', ok: true },
        { texto: '100 usos de IA a la semana (respuestas y análisis)', ok: true },
        { texto: '5 competidores por negocio', ok: true },
        { texto: 'Análisis IA de la competencia', ok: true },
        { texto: 'Historial de rating desde que te registras', ok: true },
        { texto: 'Conexión de TikTok (perfil y videos)', ok: true },
        { texto: 'Detección de bots avanzada', ok: true },
        { texto: 'Alertas por email y en la app Android', ok: true },
        { texto: 'Reporte PDF mensual automático', ok: true },
        { texto: 'Boleta o factura electrónica a tu RUC', ok: true },
        { texto: 'Todo lo del plan Gratuito', ok: true },
        { texto: 'Negocios ilimitados en un solo panel', ok: false },
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
        { texto: 'Negocios ilimitados', ok: true },
        { texto: 'Escaneo cada hora', ok: true },
        { texto: '300 usos de IA a la semana', ok: true },
        { texto: '15 competidores por negocio', ok: true },
        { texto: 'Análisis IA de la competencia', ok: true },
        { texto: 'Historial de rating desde que te registras', ok: true },
        { texto: 'Conexión de TikTok (perfil y videos)', ok: true },
        { texto: 'Detección de bots avanzada', ok: true },
        { texto: 'Alertas por email y en la app Android', ok: true },
        { texto: 'Reporte PDF mensual', ok: true },
        { texto: 'Boleta o factura electrónica a tu RUC', ok: true },
        { texto: 'Negocios ilimitados en un solo panel', ok: true },
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
        { texto: 'Email and Android app alerts', ok: true },
        { texto: 'Only 7-day history', ok: true },
        { texto: 'Frequent scans (4h or 1h)', ok: false },
        { texto: 'TikTok connection', ok: false },
        { texto: 'Extended AI for replies and analysis', ok: false },
        { texto: 'AI competitor analysis', ok: false },
        { texto: 'Automatic PDF reports', ok: false },
        { texto: 'Multi-location executive dashboard', ok: false },
        { texto: 'Priority support', ok: false },
      ],
      cta: 'Current plan',
      ctaActivo: false,
    },
    {
      id: 'NEGOCIO',
      nombre: 'Business',
      precio: 59,
      precioAnual: 47,
      descripcion: 'For businesses that care about their reputation',
      badge: 'Most popular',
      features: [
        { texto: 'Up to 5 businesses', ok: true },
        { texto: 'Scan every 4 hours', ok: true },
        { texto: '100 AI uses per week (replies and analysis)', ok: true },
        { texto: '5 competitors per business', ok: true },
        { texto: 'AI competitor analysis', ok: true },
        { texto: '90-day history', ok: true },
        { texto: 'TikTok connection (profile and videos)', ok: true },
        { texto: 'Advanced bot detection', ok: true },
        { texto: 'Email and Android app alerts', ok: true },
        { texto: 'Automatic monthly PDF report', ok: true },
        { texto: 'Automatic electronic invoice (SUNAT, Peru)', ok: true },
        { texto: 'Everything in the Free plan', ok: true },
        { texto: 'Multi-location executive dashboard', ok: false },
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
        { texto: 'Unlimited businesses', ok: true },
        { texto: 'Scan every hour', ok: true },
        { texto: '300 AI uses per week', ok: true },
        { texto: '15 competitors per business', ok: true },
        { texto: 'AI competitor analysis', ok: true },
        { texto: 'Unlimited history', ok: true },
        { texto: 'TikTok connection (profile and videos)', ok: true },
        { texto: 'Advanced bot detection', ok: true },
        { texto: 'Email and Android app alerts', ok: true },
        { texto: 'Monthly PDF report', ok: true },
        { texto: 'Automatic electronic invoice (SUNAT, Peru)', ok: true },
        { texto: 'Multi-location executive dashboard', ok: true },
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

export default function PlanesPage() {
  const router = useRouter();
  const { usuario, refrescarPerfil } = useAuth();
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
        const resultado = await pagos.suscribir({ token, plan, anual: esAnual, sinPromo: window.__notoriaSinPromo });
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
    if (plan.id === 'NEGOCIO' || plan.id === 'FRANQUICIA') {
      const Culqi = typeof window !== 'undefined' ? window.Culqi : null;
      const publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
      if (!Culqi || !publicKey) {
        setErrorPago(t.errorPagosProximamente);
        return;
      }

      // Desde S/700 el comprobante debe identificar al comprador: los datos se
      // piden antes de abrir el pago. El backend lo vuelve a exigir.
      const totalSoles = anual ? plan.precioAnual * 12 : plan.precio;
      if (!datosYaTomados && requiereIdentificacion(totalSoles) && !usuario?.docNumero) {
        setPidiendoDatos({ nombre: `Plan ${plan.nombre} anual`, precio: totalSoles, plan });
        return;
      }

      const precioBase = anual ? plan.precioAnual * 12 : plan.precio;
      const aplicaPromo = !anual && puedeUsarPromo;
      window.__notoriaPlanPendiente = plan.id;
      window.__notoriaAnualPendiente = anual;
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 32 }}>
        {planes.map((plan) => {
          const precio = anual ? plan.precioAnual : plan.precio;
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
                      <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1.5px' }}>{plan.precioAnual*12}</span>
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
                      <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1.5px' }}>{precio}</span>
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

              {/* CTA */}
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
