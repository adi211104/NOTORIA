import Link from 'next/link';
// La identificacion del proveedor sale de CONTACTO, no se reescribe aqui: el
// domicilio fiscal estaba copiado en tres paginas y el dia que cambie ante SUNAT
// hay que cambiarlo en TODAS o los datos legales se contradicen entre si.
import { CONTACTO } from '../../components/PieLegal';
// Los precios salen del catálogo, no se escriben acá (auditoría 2026-10-02,
// P0-11 y 10.4): esta página listaba solo Negocio y Franquicia, un mes después
// de que Impulso se pusiera a la venta.
import { precioMensualDe, PRECIO_LOCAL } from '../../lib/catalogo';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

export const metadata = { title:'Términos de Servicio', description:'Condiciones de uso de la plataforma Notoria.' };

const H2 = ({ children }) => <h2 style={{ fontSize:17, fontWeight:700, color:'#141413', margin:'28px 0 10px', letterSpacing:'-0.3px' }}>{children}</h2>;
const P = ({ children }) => <p style={{ fontSize:14, color:'#5C5B57', lineHeight:1.8, margin:'0 0 12px' }}>{children}</p>;

export default function TerminosPage() {
  const fecha = '1 de junio de 2026';
  return (
    <div style={{ minHeight:'100vh', background:'#FAF9F5', fontFamily:GEO }}>
      <nav style={{ borderBottom:'1px solid #E8E6DC', padding:'0 28px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:9, textDecoration:'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontWeight:800, fontSize:17, color:'#141413' }}>Notoria</span>
        </Link>
        <Link href="/privacidad" style={{ fontSize:13, color:'#5C5B57', textDecoration:'none' }}>Política de Privacidad →</Link>
      </nav>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'48px 24px 80px' }}>
        <p style={{ fontSize:11, color:G, fontWeight:600, textTransform:'uppercase', letterSpacing:2, margin:'0 0 12px' }}>Documento legal</p>
        <h1 style={{ fontSize:34, fontWeight:900, color:'#141413', margin:'0 0 8px', letterSpacing:'-1.5px' }}>Términos de Servicio</h1>
        <p style={{ fontSize:13, color:'#9C9B96', margin:'0 0 40px', borderBottom:'1px solid #E8E6DC', paddingBottom:24 }}>Notoria · Última actualización: {fecha}</p>

        <H2>1. Aceptación de los términos</H2>
        <P>Al registrarte y utilizar Notoria (usenotoria.app), aceptas estos Términos de Servicio en su totalidad. Si no estás de acuerdo con alguna parte de estos términos, no puedes utilizar el servicio. Notoria es operado por {CONTACTO.razonSocial}, RUC {CONTACTO.ruc}, con domicilio fiscal en {CONTACTO.direccion}.</P>

        <H2>2. Descripción del servicio</H2>
        <P>Notoria es una plataforma de monitoreo de reputación digital para restaurantes, hoteles y negocios en el Perú. El servicio incluye: monitoreo de reseñas en Google Maps, alertas por correo electrónico, detección de reseñas sospechosas, reportes PDF mensuales y herramientas para responder reseñas.</P>
        <P>Notoria actúa como intermediario tecnológico. No somos responsables del contenido de las reseñas ni de las decisiones tomadas por plataformas de terceros (Google, Facebook) respecto a la eliminación o permanencia de reseñas.</P>

        <H2>3. Registro y cuenta de usuario</H2>
        <P>Para usar Notoria debes tener al menos 18 años y proporcionar información verídica durante el registro. Eres responsable de mantener la confidencialidad de tu contraseña y de toda la actividad que ocurra bajo tu cuenta. Debes notificarnos inmediatamente si detectas uso no autorizado a hola@usenotoria.app.</P>

        <H2>4. Planes y pagos</H2>
        <P><strong>Plan Gratuito:</strong> acceso permanente con funcionalidades limitadas. No requiere tarjeta de crédito.</P>
        <P><strong>Planes de pago:</strong> los planes Impulso (S/{precioMensualDe('IMPULSO')}/mes), Negocio (S/{precioMensualDe('NEGOCIO')}/mes) y Franquicia (S/{precioMensualDe('FRANQUICIA')}/mes), o su modalidad anual, se facturan por adelantado. Cada plan de pago incluye un local; en Negocio y Franquicia los locales adicionales se cobran aparte (S/{PRECIO_LOCAL.NEGOCIO.mensual}/mes y S/{PRECIO_LOCAL.FRANQUICIA.mensual}/mes por local, respectivamente). Lo que incluye cada plan es lo publicado en <Link href="/precios" style={{ color:G }}>Precios</Link>. Los precios están en soles peruanos (PEN) e incluyen IGV. El pago se procesa mediante Culqi, plataforma certificada PCI-DSS.</P>
        <P><strong>Promoción de bienvenida:</strong> las cuentas nuevas que se suscriban a un plan de pago con facturación mensual reciben 50% de descuento durante los primeros 2 meses. Esta promoción no aplica a la facturación anual (que ya incluye un descuento propio de 20%), se aplica una sola vez por cuenta y no es acumulable con otras ofertas. Desde el tercer mes, la renovación se cobra al precio regular del plan.</P>
        <P><strong>Cancelación:</strong> puedes cancelar tu suscripción en cualquier momento desde Configuración → Suscripción. Al cancelar, mantienes el acceso hasta el fin del período pagado. Los reembolsos (incluido el derecho de retracto de 7 días) y los cambios de plan se rigen por nuestra <Link href="/devoluciones" style={{ color:G }}>Política de Devoluciones</Link>.</P>
        <P><strong>Cambios de precio:</strong> notificaremos con 30 días de anticipación cualquier cambio de precio a través del email registrado.</P>

        <H2>5. Uso aceptable</H2>
        <P>Te comprometes a no usar Notoria para: (a) violar leyes aplicables; (b) acceder a datos de negocios que no te pertenecen; (c) realizar ingeniería inversa del servicio; (d) compartir tu cuenta con terceros; (e) intentar sobrecargar o atacar nuestros sistemas.</P>

        <H2>6. Propiedad intelectual</H2>
        <P>Notoria y todo su contenido (código, diseño, marca, logotipo) son propiedad exclusiva de Notoria y están protegidos por las leyes de propiedad intelectual vigentes. Se te otorga una licencia limitada, no exclusiva e intransferible para usar el servicio según estos términos.</P>

        <H2>7. Privacidad y datos</H2>
        <P>El tratamiento de tus datos personales se rige por nuestra <Link href="/privacidad" style={{ color:G }}>Política de Privacidad</Link>, la cual forma parte integral de estos términos. Al usar Notoria, consientes el tratamiento de tus datos según dicha política.</P>

        <H2>8. Integraciones de terceros</H2>
        <P>Notoria lee la información pública de tu ficha de Google Maps. Además, según tu plan y según lo que cada plataforma tenga habilitado para Notoria en cada momento, puedes conectar cuentas de terceros (hoy, Instagram y TikTok). Las integraciones que dependen de una aprobación de la plataforma —como Google Business Profile o las reseñas de Facebook— solo se ofrecen en el panel cuando están disponibles; mientras no lo estén, no forman parte del servicio contratado. Al conectar una cuenta, aceptas también los términos de esa plataforma. Notoria no almacena tus contraseñas de servicios de terceros; usamos tokens de acceso OAuth, guardados cifrados, que puedes revocar en cualquier momento desconectando la cuenta.</P>

        <H2>9. Limitación de responsabilidad</H2>
        <P>Notoria se proporciona «tal cual». No garantizamos que el servicio sea ininterrumpido, libre de errores o que las señales de reseñas sospechosas sean siempre precisas. Notoria señala comportamiento anómalo; determinar si una reseña es falsa y retirarla corresponde a la plataforma que la publica. En ningún caso nuestra responsabilidad total excederá el importe pagado por el usuario en los últimos 3 meses.</P>
        <P>No somos responsables por pérdidas de ingresos, daños a la reputación o cualquier daño indirecto derivado del uso o imposibilidad de uso de Notoria.</P>

        <H2>10. Modificaciones del servicio</H2>
        <P>Nos reservamos el derecho de modificar o discontinuar funcionalidades del servicio con 15 días de aviso previo. Para cambios materiales que afecten planes de pago, el aviso será de 30 días.</P>

        <H2>11. Terminación</H2>
        <P>Podemos suspender o eliminar tu cuenta si violas estos términos, con o sin aviso previo en casos graves. Puedes eliminar tu cuenta en cualquier momento desde Configuración → Zona de peligro. Al eliminar la cuenta, tus datos se borran según lo establecido en la Política de Privacidad.</P>

        <H2>12. Ley aplicable y jurisdicción</H2>
        <P>Estos términos se rigen por las leyes de la República del Perú, país donde Notoria tiene su domicilio legal. Cualquier controversia será resuelta ante los tribunales competentes de la Provincia Constitucional del Callao, Perú. Si resides en otro país, las disposiciones de protección al consumidor de tu país también pueden aplicar en la medida en que la ley así lo exija.</P>

        <H2>13. Contacto</H2>
        <P>Para cualquier consulta sobre estos términos: <a href="mailto:hola@usenotoria.app" style={{ color:G }}>hola@usenotoria.app</a></P>

        <div style={{ marginTop:40, padding:'20px 24px', background:'#FFFFFF', border:'1px solid #E8E6DC', borderRadius:6 }}>
          <p style={{ fontSize:12, color:'#9C9B96', margin:0, lineHeight:1.7 }}>
            Estos Términos fueron actualizados el {fecha}. Al continuar usando Notoria después de cualquier modificación, aceptas los nuevos términos.
          </p>
        </div>
      </div>

      <footer style={{ borderTop:'1px solid #E8E6DC', padding:'20px 28px', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontSize:14, fontWeight:700, color:'#141413' }}>Notoria</span>
        </Link>
        <div style={{ display:'flex', gap:20 }}>
          <Link href="/privacidad" style={{ fontSize:13, color:'#9C9B96', textDecoration:'none' }}>Privacidad</Link>
          <a href="mailto:hola@usenotoria.app" style={{ fontSize:13, color:'#9C9B96', textDecoration:'none' }}>Contacto</a>
        </div>
      </footer>
    </div>
  );
}
