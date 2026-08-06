'use client';
// Catálogo público de servicios con botón de pago.
//
// Existe porque el checkout vivía solo dentro de /dashboard/planes, detrás del
// login, y Culqi no podía ver ningún flujo de compra al revisar la web (nos
// observaron por "Flujo de compra | Carrito de compras | Botón pagar").
// Esta página es pública: se ven los precios y el botón de pago sin sesión.
//
// El cobro sí exige sesión — hace falta una cuenta a la que asociar la
// suscripción y a la que emitir el comprobante. Culqi lo admite siempre que se
// le entreguen credenciales de prueba (ver README, sección Culqi). Si el
// visitante no tiene sesión, se guarda la compra pendiente y se la retoma
// automáticamente al volver del login.

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { pagos } from '../../lib/api';
import { CATALOGO, MONEDA, SIMBOLO, montoEnCentimos, formatearSoles } from '../../lib/catalogo';
import PieLegal from '../../components/PieLegal';
import BannerPromo from '../../components/BannerPromo';
import ResultadoPago from '../../components/ResultadoPago';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';
const GH = '#0D8A2A';

// Clave donde se deja la compra a medio hacer mientras el usuario inicia sesión
const PENDIENTE = 'notoria_compra_pendiente';

// "Foto" de cada servicio. Son ilustraciones propias en SVG en vez de fotos de
// stock: el producto es un panel de software, así que esto muestra mejor lo que
// se compra y no depende de archivos externos que puedan romperse.
const Ilustracion = ({ tipo }) => {
  const barras = {
    gratuito: [30, 0, 0, 0],
    negocio: [55, 70, 45, 0],
    'negocio-anual': [55, 70, 45, 0],
    franquicia: [80, 60, 90, 70],
    'franquicia-anual': [80, 60, 90, 70],
  }[tipo] || [40, 40, 40, 0];

  const puntos = tipo.startsWith('franquicia') ? 5 : tipo.startsWith('negocio') ? 3 : 1;

  return (
    <div style={{ background: 'linear-gradient(135deg,#0F2E17 0%,#14401F 100%)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
      <svg viewBox="0 0 220 96" width="100%" height="96" role="img" aria-label={`Vista del ${tipo}`}>
        {/* mini panel */}
        <rect x="0" y="0" width="220" height="96" rx="4" fill="#0B1F10" />
        <rect x="10" y="10" width="60" height="7" rx="3" fill="#2C6B3C" />
        <rect x="10" y="23" width="34" height="5" rx="2" fill="#1D4A28" />
        {/* barras del gráfico */}
        {barras.map((h, i) => (
          <rect key={i} x={12 + i * 20} y={82 - h * 0.6} width="12" height={Math.max(h * 0.6, 3)} rx="2"
            fill={h ? '#3E9B54' : '#183A22'} />
        ))}
        {/* puntos de negocios monitoreados */}
        {Array.from({ length: puntos }).map((_, i) => (
          <circle key={i} cx={125 + (i % 3) * 22} cy={30 + Math.floor(i / 3) * 22} r="7"
            fill="none" stroke="#4FB86A" strokeWidth="2" />
        ))}
        {/* línea de tendencia */}
        <path d="M118 78 L140 66 L162 72 L184 52 L206 44" fill="none" stroke="#7CD98F" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export default function PreciosPage() {
  const router = useRouter();
  const { usuario, cargando, refrescarPerfil } = useAuth();
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [culqiListo, setCulqiListo] = useState(false);
  // Respuesta del cobro exitoso y mensaje de cobro fallido: los dos disparan la
  // confirmación a pantalla completa (components/ResultadoPago.js)
  const [resultado, setResultado] = useState(null);
  const [errorPago, setErrorPago] = useState('');

  // Un visitante sin sesión es, por definición, candidato a la promo: se le
  // muestra el descuento para que sepa que existe antes de registrarse. Solo se
  // oculta a quien ya la gastó. `promoRechazada` la desactiva cuando el backend
  // avisa de que esa tarjeta ya la usó.
  const [promoRechazada, setPromoRechazada] = useState(false);
  const puedeUsarPromo = !promoRechazada && (!usuario || !usuario.promoBienvenidaUsada);

  // Abre el widget de Culqi para un ítem del catálogo. El monto que se manda
  // acá es solo el que ve el usuario en el widget: el backend recalcula el
  // cobro real desde precios.js y no confía en este número.
  const abrirCheckout = useCallback((item) => {
    const Culqi = typeof window !== 'undefined' ? window.Culqi : null;
    const publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
    if (!Culqi || !publicKey) {
      setError('El pago con tarjeta no está disponible en este momento. Escríbenos a hola@usenotoria.app y lo activamos contigo.');
      return;
    }

    const aplicaPromo = item.periodo === 'mensual' && puedeUsarPromo;

    window.__notoriaPlanPendiente = item.plan;
    window.__notoriaAnualPendiente = item.periodo === 'anual';
    // Se deja en window, igual que plan y periodo, para que el callback global
    // de Culqi lo lea en el momento del cobro: si dependiera del estado de
    // React se quedaría con el valor de cuando se montó el callback.
    window.__notoriaSinPromo = !aplicaPromo;

    Culqi.publicKey = publicKey;
    // En céntimos y con el mismo redondeo que el backend — ver montoEnCentimos()
    Culqi.settings({ title: 'Notoria', currency: MONEDA, amount: montoEnCentimos(item.precio, aplicaPromo) });
    Culqi.options({
      lang: 'auto',
      paymentMethods: { tarjeta: true, yape: false, billetera: false, bancaMovil: false, agente: false, cuotealo: false },
    });
    Culqi.open();
  }, [puedeUsarPromo]);

  // Callback global que exige el widget de Checkout v4 (window.culqi)
  useEffect(() => {
    window.culqi = async () => {
      const Culqi = window.Culqi;
      if (!Culqi?.token) return;

      // Cerrar el widget es responsabilidad NUESTRA: Culqi entrega el token y
      // deja su ventana abierta. Sin esto el usuario pulsa "Pagar", la ventana
      // se queda igual —sin carga ni confirmación— y el cobro ocurre detrás sin
      // que él lo vea. Va primero, antes de cualquier await.
      try { Culqi.close(); } catch {}

      setError(''); setMensaje('');
      setProcesando(true);
      try {
        const resultado = await pagos.suscribir({
          token: Culqi.token.id,
          plan: window.__notoriaPlanPendiente,
          anual: window.__notoriaAnualPendiente,
          sinPromo: window.__notoriaSinPromo,
        });
        await refrescarPerfil();
        // Confirmación a pantalla completa: no se redirige solo. Ver
        // components/ResultadoPago.js.
        setResultado(resultado);
      } catch (e) {
        // La tarjeta ya gastó la promo: no se cobró nada. Se apaga el descuento
        // y se le pide que confirme al precio de lista, en vez de cobrarle un
        // importe distinto del que aceptó en el widget.
        if (e.codigo === 'PROMO_NO_APLICA') {
          setPromoRechazada(true);
          setError('Esta tarjeta ya usó la promoción de bienvenida, así que no te cobramos nada. Los precios ya muestran la tarifa regular: pulsa "Pagar" de nuevo si quieres continuar.');
          // El aviso vive arriba de la página y el botón de pagar está abajo:
          // sin esto el usuario no lo vería y creería que no pasó nada.
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          // Un cobro fallido también necesita un aviso imposible de perderse
          setErrorPago(e.message || 'No se pudo procesar el pago. Intenta con otra tarjeta.');
        }
      } finally {
        setProcesando(false);
      }
    };
    return () => { delete window.culqi; };
  }, [refrescarPerfil, router]);

  // Si el visitante venía de iniciar sesión con una compra a medias, se retoma
  // sola en cuanto hay sesión y el script de Culqi ya cargó.
  useEffect(() => {
    if (!usuario || !culqiListo) return;
    let pendiente;
    try { pendiente = sessionStorage.getItem(PENDIENTE); } catch { return; }
    if (!pendiente) return;
    try { sessionStorage.removeItem(PENDIENTE); } catch {}
    const item = CATALOGO.find(i => i.id === pendiente);
    if (item?.comprable) abrirCheckout(item);
  }, [usuario, culqiListo, abrirCheckout]);

  const comprar = (item) => {
    setError(''); setMensaje('');
    if (cargando) return;

    if (!usuario) {
      // Sin sesión: se recuerda qué quería comprar y se vuelve acá tras el login
      try { sessionStorage.setItem(PENDIENTE, item.id); } catch {}
      router.push(`/login?next=${encodeURIComponent('/precios')}`);
      return;
    }
    abrirCheckout(item);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F5', fontFamily: GEO }}>
      <Script src="https://checkout.culqi.com/js/v4" strategy="afterInteractive" onLoad={() => setCulqiListo(true)} />

      {/* Estado del cobro, siempre por encima de todo: da igual dónde esté el
          scroll o si el widget de Culqi acaba de cerrarse. */}
      {(procesando || resultado || errorPago) && (
        <ResultadoPago
          estado={procesando ? 'procesando' : resultado ? 'exito' : 'error'}
          datos={resultado}
          error={errorPago}
          onCerrar={() => setErrorPago('')}
          onIrAlPanel={() => router.push('/dashboard')}
        />
      )}

      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #E8E6DC', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAF9F5', position: 'sticky', top: 0, zIndex: 20 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: '#141413' }}>Notoria</span>
        </Link>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Link href="/contacto" style={{ fontSize: 13, color: '#5C5B57', textDecoration: 'none' }}>Contacto</Link>
          {usuario
            ? <Link href="/dashboard" style={{ fontSize: 13, color: '#fff', background: G, padding: '7px 14px', borderRadius: 5, textDecoration: 'none', fontWeight: 600 }}>Mi panel</Link>
            : <Link href="/login" style={{ fontSize: 13, color: '#fff', background: G, padding: '7px 14px', borderRadius: 5, textDecoration: 'none', fontWeight: 600 }}>Iniciar sesión</Link>}
        </div>
      </nav>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 72px' }}>
        <p style={{ fontSize: 11, color: G, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 12px' }}>Catálogo de servicios</p>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: '#141413', margin: '0 0 10px', letterSpacing: '-1.5px' }}>Precios y contratación</h1>
        <p style={{ fontSize: 15, color: '#5C5B57', lineHeight: 1.7, margin: '0 0 8px', maxWidth: 680 }}>
          Notoria es un servicio de monitoreo de reputación online para restaurantes y hoteles del Perú:
          vigila tus reseñas en Google y TikTok, detecta reseñas falsas y ataques de bots, y te alerta
          cuando tu rating cae. Estos son todos nuestros servicios y sus precios.
        </p>
        <p style={{ fontSize: 13, color: '#9C9B96', margin: '0 0 32px' }}>
          Precios en soles peruanos (PEN), IGV incluido · Pago con tarjeta de crédito o débito vía Culqi · Sin contratos de permanencia
        </p>

        {mensaje && (
          <div style={{ background: 'rgba(11,115,36,0.08)', border: `1px solid ${G}`, color: G, borderRadius: 6, padding: '12px 16px', fontSize: 14, marginBottom: 20 }}>{mensaje}</div>
        )}
        {error && (
          <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)', color: '#B91C1C', borderRadius: 6, padding: '12px 16px', fontSize: 14, marginBottom: 20 }}>{error}</div>
        )}

        {puedeUsarPromo && <BannerPromo />}

        {/* Catálogo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18 }}>
          {CATALOGO.map((item) => {
            const esActual = usuario?.plan === item.plan;
            const promo = item.periodo === 'mensual' && puedeUsarPromo;
            return (
              <div key={item.id} style={{
                background: '#fff', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column',
                border: item.destacado ? `2px solid ${G}` : '1px solid #E8E6DC', position: 'relative',
              }}>
                {item.destacado && (
                  <div style={{ position: 'absolute', top: -11, left: 20, background: G, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 99, letterSpacing: 0.5 }}>Más contratado</div>
                )}

                <Ilustracion tipo={item.imagen} />

                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#141413', margin: '0 0 8px' }}>{item.nombre}</h2>

                {/* Precio — siempre visible, es requisito de Culqi */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: '#141413', letterSpacing: '-1px' }}>
                    {item.precio === 0 ? 'Gratis' : `${SIMBOLO}${item.precio}`}
                  </span>
                  <span style={{ fontSize: 13, color: '#9C9B96' }}>{item.unidad}</span>
                </div>
                {promo && (
                  <span style={{ display: 'inline-block', alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, color: G, background: 'rgba(11,115,36,0.12)', border: '1px solid rgba(11,115,36,0.35)', borderRadius: 4, padding: '2px 8px', marginBottom: 6 }}>
                    50% OFF tus primeros 2 meses — pagas {SIMBOLO}{formatearSoles(montoEnCentimos(item.precio, true))}
                  </span>
                )}

                <p style={{ fontSize: 13, color: '#5C5B57', lineHeight: 1.7, margin: '8px 0 14px' }}>{item.descripcion}</p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                  {item.incluye.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#5C5B57' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {item.comprable ? (
                  <button
                    onClick={() => comprar(item)}
                    disabled={procesando || esActual}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 5, fontSize: 14.5, fontWeight: 700,
                      fontFamily: GEO, border: 'none', cursor: procesando || esActual ? 'default' : 'pointer',
                      background: esActual ? '#EFEEE7' : G, color: esActual ? '#9C9B96' : '#fff',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!procesando && !esActual) e.currentTarget.style.background = GH; }}
                    onMouseLeave={e => { if (!procesando && !esActual) e.currentTarget.style.background = G; }}>
                    {esActual ? 'Es tu plan actual' : `Pagar ${SIMBOLO}${formatearSoles(montoEnCentimos(item.precio, promo))}`}
                  </button>
                ) : (
                  <Link href="/registro" style={{ display: 'block', textAlign: 'center', width: '100%', padding: '12px', borderRadius: 5, fontSize: 14.5, fontWeight: 700, background: '#fff', color: G, border: `1px solid ${G}`, textDecoration: 'none', boxSizing: 'border-box' }}>
                    Crear cuenta gratis
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {/* Cómo es el proceso de compra — Culqi pide que el flujo sea explícito */}
        <div style={{ background: '#fff', border: '1px solid #E8E6DC', borderRadius: 8, padding: 24, marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#141413', margin: '0 0 16px' }}>¿Cómo es el proceso de compra?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 18 }}>
            {[
              { n: '1', t: 'Elige tu plan', d: 'Selecciona el servicio y la modalidad de pago (mensual o anual) en este catálogo.' },
              { n: '2', t: 'Pulsa "Pagar"', d: 'Si aún no tienes cuenta, creas una en 30 segundos. Es necesaria para asociar tu suscripción y emitir tu comprobante.' },
              { n: '3', t: 'Paga con tarjeta', d: 'Se abre la ventana segura de Culqi. Ingresas los datos de tu tarjeta de crédito o débito. Notoria nunca ve ni guarda el número completo.' },
              { n: '4', t: 'Listo', d: 'Tu plan se activa al instante y recibes tu boleta o factura electrónica por correo.' },
            ].map(p => (
              <div key={p.n}>
                <div style={{ width: 26, height: 26, borderRadius: 99, background: G, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, marginBottom: 9 }}>{p.n}</div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#141413', margin: '0 0 5px' }}>{p.t}</h3>
                <p style={{ fontSize: 12.5, color: '#5C5B57', lineHeight: 1.65, margin: 0 }}>{p.d}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: '#9C9B96', lineHeight: 1.7, margin: '18px 0 0', borderTop: '1px solid #E8E6DC', paddingTop: 16 }}>
            Aceptamos tarjetas Visa, Mastercard, American Express y Diners Club, de crédito y débito.
            El cobro lo procesa <strong>Culqi</strong>, pasarela certificada PCI-DSS. Las suscripciones se
            renuevan automáticamente al final de cada periodo y puedes cancelarlas cuando quieras desde tu
            panel. Consulta nuestra <Link href="/devoluciones" style={{ color: G }}>Política de cambios y devoluciones</Link>.
          </p>
        </div>
      </div>

      <PieLegal />
    </div>
  );
}
