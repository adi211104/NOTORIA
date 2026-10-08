import Link from 'next/link';
// 2026-10-07 (réplica del auditor, §4): reglamento vigente (D.S. 016-2024-JUS),
// lista completa de encargados, datos de terceros, incidentes en 48 h y un
// correo de ARCO que SÍ llega: privacidad@ no tenía regla en Cloudflare y el
// catch-all descarta (CLAUDE.md §6). Toda dirección nueva necesita su regla.
// La identificacion del proveedor sale de CONTACTO, no se reescribe aqui: el
// domicilio fiscal estaba copiado en tres paginas y el dia que cambie ante SUNAT
// hay que cambiarlo en TODAS o los datos legales se contradicen entre si.
import { CONTACTO } from '../../components/PieLegal';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

export const metadata = { title:'Política de Privacidad', description:'Cómo Notoria recopila, usa y protege tus datos personales.' };

const H2 = ({ children }) => <h2 style={{ fontSize:17, fontWeight:700, color:'#141413', margin:'28px 0 10px', letterSpacing:'-0.3px' }}>{children}</h2>;
const P = ({ children }) => <p style={{ fontSize:14, color:'#5C5B57', lineHeight:1.8, margin:'0 0 12px' }}>{children}</p>;
const Li = ({ children }) => <li style={{ fontSize:14, color:'#5C5B57', lineHeight:1.8, marginBottom:4 }}>{children}</li>;

export default function PrivacidadPage() {
  const fecha = '8 de octubre de 2026';
  return (
    <div style={{ minHeight:'100vh', background:'#FAF9F5', fontFamily:GEO }}>
      <nav style={{ borderBottom:'1px solid #E8E6DC', padding:'0 28px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:9, textDecoration:'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontWeight:800, fontSize:17, color:'#141413' }}>Notoria</span>
        </Link>
        <Link href="/terminos" style={{ fontSize:13, color:'#5C5B57', textDecoration:'none' }}>Términos de Servicio →</Link>
      </nav>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'48px 24px 80px' }}>
        <p style={{ fontSize:11, color:G, fontWeight:600, textTransform:'uppercase', letterSpacing:2, margin:'0 0 12px' }}>Documento legal</p>
        <h1 style={{ fontSize:34, fontWeight:900, color:'#141413', margin:'0 0 8px', letterSpacing:'-1.5px' }}>Política de Privacidad</h1>
        <p style={{ fontSize:13, color:'#9C9B96', margin:'0 0 40px', borderBottom:'1px solid #E8E6DC', paddingBottom:24 }}>Notoria · Última actualización: {fecha} · Ley N.° 29733 (Perú)</p>

        <div style={{ background:'rgba(11,115,36,0.06)', border:'1px solid rgba(11,115,36,0.2)', borderRadius:6, padding:'14px 18px', marginBottom:32 }}>
          <p style={{ fontSize:13, color:'#141413', margin:0, lineHeight:1.7 }}>
            <strong>Resumen:</strong> Recopilamos solo los datos necesarios para brindarte el servicio. No vendemos tus datos. Puedes solicitar su eliminación en cualquier momento.
          </p>
        </div>

        <H2>1. Responsable del tratamiento</H2>
        <P>Notoria, plataforma operada por {CONTACTO.razonSocial}, RUC {CONTACTO.ruc}, con domicilio fiscal en {CONTACTO.direccion}, es responsable del tratamiento de tus datos personales conforme a la Ley N.° 29733 — Ley de Protección de Datos Personales del Perú y su reglamento, aprobado por D.S. N.° 016-2024-JUS.</P>

        <H2>2. Datos que recopilamos</H2>
        <P><strong>Datos que nos proporcionas:</strong></P>
        <ul style={{ margin:'0 0 14px', paddingLeft:20 }}>
          <Li>Nombre y dirección de email al registrarte</Li>
          <Li>Contraseña (almacenada con cifrado bcrypt, nunca en texto plano)</Li>
          <Li>Datos de pago procesados por Culqi (no almacenamos datos de tarjetas)</Li>
        </ul>
        <P><strong>Datos recopilados automáticamente:</strong></P>
        <ul style={{ margin:'0 0 14px', paddingLeft:20 }}>
          <Li>Información de los negocios que agregas (nombre, dirección, Google Place ID)</Li>
          <Li>Tokens OAuth de las cuentas que conectes (Instagram, TikTok y, cuando estén disponibles, Google Business Profile y Facebook), cifrados en base de datos con AES-256</Li>
          <Li>Datos de uso del servicio (escaneos realizados, alertas generadas)</Li>
          <Li>Información técnica básica para el funcionamiento del servicio</Li>
        </ul>
        <P><strong>Datos de terceros que tratamos:</strong></P>
        <ul style={{ margin:'0 0 14px', paddingLeft:20 }}>
          <Li><strong>Reseñas públicas</strong> de los negocios que monitoreas (nombre público del autor, calificación y texto), tal como las publica la plataforma, para mostrarlas en tu panel y señalar comportamientos anómalos.</Li>
          <Li><strong>Libro de Reclamaciones:</strong> los datos que el consumidor ingresa (nombre, documento, domicilio, correo, teléfono), que conservamos por obligación legal (D.S. N.° 101-2022-PCM).</Li>
          <Li><strong>Prospectos comerciales:</strong> cuando un promotor de Notoria visita un negocio, registra el nombre del local y, si la persona lo autoriza, su nombre y teléfono de contacto, solo para darle seguimiento comercial. Puede pedir que los borremos escribiendo al correo de la sección 8.</Li>
        </ul>

        <H2>3. Finalidad del tratamiento</H2>
        <P>Utilizamos tus datos exclusivamente para:</P>
        <ul style={{ margin:'0 0 14px', paddingLeft:20 }}>
          <Li>Proveer y mejorar el servicio de monitoreo de reputación</Li>
          <Li>Enviarte alertas de reputación según tu configuración</Li>
          <Li>Generar reportes PDF de tu actividad</Li>
          <Li>Procesar y gestionar tu suscripción</Li>
          <Li>Comunicaciones transaccionales (bienvenida, verificación, seguridad)</Li>
          <Li>Cumplir con obligaciones legales</Li>
        </ul>
        <P>No utilizamos tus datos para publicidad, no los compartimos con anunciantes ni los vendemos a terceros bajo ninguna circunstancia.</P>

        <H2>4. Base legal del tratamiento</H2>
        <P>El tratamiento de tus datos se basa en: (a) la ejecución del contrato de servicio que aceptas al registrarte; (b) tu consentimiento explícito para el envío de notificaciones; (c) el interés legítimo de Notoria para mejorar la seguridad y calidad del servicio.</P>

        <H2>5. Terceros y subencargados</H2>
        <div style={{ background:'#FFFFFF', border:'1px solid #E8E6DC', borderRadius:6, overflow:'hidden', marginBottom:14 }}>
          {[
            { n:'Resend', uso:'Envío de emails transaccionales', pais:'EE.UU.', link:'https://resend.com/privacy' },
            { n:'Railway', uso:'Alojamiento del servidor backend', pais:'EE.UU.', link:'https://railway.app/legal/privacy' },
            { n:'Vercel', uso:'Alojamiento del frontend', pais:'EE.UU.', link:'https://vercel.com/legal/privacy-policy' },
            { n:'Google Cloud', uso:'API de Places y OAuth', pais:'EE.UU.', link:'https://policies.google.com/privacy' },
            { n:'Culqi', uso:'Procesamiento de pagos', pais:'Perú', link:'https://culqi.com/privacidad' },
            { n:'Groq', uso:'IA que redacta respuestas sugeridas y resúmenes (recibe el texto de las reseñas y el nombre del negocio, nunca datos de pago)', pais:'EE.UU.', link:'https://groq.com/privacy-policy/' },
            { n:'Meta (Instagram, Facebook)', uso:'Lectura de comentarios de las cuentas que tú conectas', pais:'EE.UU.', link:'https://www.facebook.com/privacy/policy/' },
            { n:'TikTok', uso:'Lectura de comentarios de la cuenta que tú conectas', pais:'EE.UU. / Singapur', link:'https://www.tiktok.com/legal/page/global/privacy-policy/es' },
            { n:'Cloudflare', uso:'DNS y reenvío del correo que nos escribes', pais:'EE.UU.', link:'https://www.cloudflare.com/privacypolicy/' },
            { n:'SUNAT', uso:'Recibe los comprobantes electrónicos (obligación tributaria, no es un encargado)', pais:'Perú', link:'https://www.sunat.gob.pe' },
          ].map((t,i,lista) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 2fr 100px', gap:12, padding:'10px 16px', borderBottom: i<lista.length-1 ? '1px solid #E8E6DC' : 'none', alignItems:'center' }}>
              <span style={{ fontSize:13, fontWeight:600, color:'#141413' }}>{t.n}</span>
              <span style={{ fontSize:12, color:'#5C5B57' }}>{t.uso}</span>
              <a href={t.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:G, textDecoration:'none' }}>{t.pais} ↗</a>
            </div>
          ))}
        </div>

        <H2>6. Seguridad de los datos</H2>
        <P>Implementamos medidas de seguridad técnicas y organizativas apropiadas: contraseñas cifradas con bcrypt, tokens OAuth cifrados, comunicaciones vía HTTPS/TLS, acceso a base de datos restringido y copias de seguridad periódicas cuya restauración se prueba.</P>
        <P>Si ocurre un incidente de seguridad que afecte tus datos, lo comunicaremos a la Autoridad Nacional de Protección de Datos Personales y a ti, a través del email registrado y en lenguaje claro, dentro de las 48 horas de haberlo conocido, conforme al reglamento vigente.</P>

        <H2>7. Retención de datos</H2>
        <P>Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, borramos permanentemente tus datos personales en un plazo de 30 días, excepto los datos que debamos conservar por obligación legal (datos de facturación por 5 años según legislación peruana).</P>

        <H2>8. Tus derechos (ARCO)</H2>
        <P>Conforme a la Ley N.° 29733, tienes derecho a:</P>
        <ul style={{ margin:'0 0 14px', paddingLeft:20 }}>
          <Li><strong>Acceso:</strong> solicitar qué datos tenemos sobre ti</Li>
          <Li><strong>Rectificación:</strong> corregir datos incorrectos (disponible en Configuración → Perfil)</Li>
          <Li><strong>Cancelación:</strong> solicitar la eliminación de tus datos (disponible en Configuración → Zona de peligro)</Li>
          <Li><strong>Oposición:</strong> oponerte a determinados tratamientos</Li>
        </ul>
        <P>Para ejercer estos derechos escribe a <a href="mailto:hola@usenotoria.app" style={{ color:G }}>hola@usenotoria.app</a> con el asunto «Privacidad» desde el email de tu cuenta (o acreditando tu identidad). Respondemos las solicitudes de acceso en un máximo de 20 días hábiles y las de rectificación, cancelación u oposición en un máximo de 10 días hábiles.</P>

        <H2>9. Cookies</H2>
        <P>Notoria no utiliza cookies de seguimiento ni publicidad. Solo usamos el almacenamiento local del navegador (localStorage) para mantener tu sesión activa de forma segura, sin compartir esta información con terceros.</P>

        <H2>10. Transferencias internacionales</H2>
        <P>Varios de nuestros proveedores (Resend, Railway, Vercel, Google, Groq, Meta, TikTok y Cloudflare) tratan datos fuera del Perú. Estas transferencias se realizan bajo garantías adecuadas de protección de datos según los estándares internacionales aplicables.</P>

        <H2>11. Menores de edad</H2>
        <P>Notoria no está dirigido a personas menores de 18 años. Si detectamos que un menor ha creado una cuenta, la eliminaremos inmediatamente.</P>

        <H2>12. Cambios a esta política</H2>
        <P>Notificaremos cambios significativos por email con 15 días de anticipación. La versión actualizada siempre estará disponible en usenotoria.app/privacidad.</P>

        <H2>13. Autoridad de control</H2>
        <P>Puedes presentar reclamaciones ante la Autoridad Nacional de Protección de Datos Personales del Perú (Ministerio de Justicia y Derechos Humanos): <a href="https://www.gob.pe/anpd" target="_blank" rel="noopener noreferrer" style={{ color:G }}>www.gob.pe/anpd</a></P>

        <H2>14. Contacto</H2>
        <P>Responsable de privacidad: <a href="mailto:hola@usenotoria.app" style={{ color:G }}>hola@usenotoria.app</a> (asunto «Privacidad»)</P>

        <div style={{ marginTop:40, padding:'20px 24px', background:'#FFFFFF', border:'1px solid #E8E6DC', borderRadius:6 }}>
          <p style={{ fontSize:12, color:'#9C9B96', margin:0, lineHeight:1.7 }}>Política actualizada el {fecha}. Versión 1.1.</p>
        </div>
      </div>

      <footer style={{ borderTop:'1px solid #E8E6DC', padding:'20px 28px', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontSize:14, fontWeight:700, color:'#141413' }}>Notoria</span>
        </Link>
        <div style={{ display:'flex', gap:20 }}>
          <Link href="/terminos" style={{ fontSize:13, color:'#9C9B96', textDecoration:'none' }}>Términos</Link>
          <a href="mailto:hola@usenotoria.app" style={{ fontSize:13, color:'#9C9B96', textDecoration:'none' }}>Contacto</a>
        </div>
      </footer>
    </div>
  );
}
