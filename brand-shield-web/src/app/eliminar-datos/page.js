import Link from 'next/link';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

export const metadata = { title:'Eliminación de datos', description:'Cómo solicitar la eliminación de tus datos personales en Notoria.' };

const H2 = ({ children }) => <h2 style={{ fontSize:17, fontWeight:700, color:'#141413', margin:'28px 0 10px', letterSpacing:'-0.3px' }}>{children}</h2>;
const P = ({ children }) => <p style={{ fontSize:14, color:'#5C5B57', lineHeight:1.8, margin:'0 0 12px' }}>{children}</p>;
const Li = ({ children }) => <li style={{ fontSize:14, color:'#5C5B57', lineHeight:1.8, marginBottom:4 }}>{children}</li>;

export default function EliminarDatosPage() {
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
        <p style={{ fontSize:11, color:G, fontWeight:600, textTransform:'uppercase', letterSpacing:2, margin:'0 0 12px' }}>Data Deletion Instructions</p>
        <h1 style={{ fontSize:34, fontWeight:900, color:'#141413', margin:'0 0 8px', letterSpacing:'-1.5px' }}>Eliminación de tus datos</h1>
        <p style={{ fontSize:13, color:'#9C9B96', margin:'0 0 40px', borderBottom:'1px solid #E8E6DC', paddingBottom:24 }}>Notoria · NOTORIA E.I.R.L. (RUC 20616239466) · Ley N.° 29733 (Perú)</p>

        <div style={{ background:'rgba(11,115,36,0.06)', border:'1px solid rgba(11,115,36,0.2)', borderRadius:6, padding:'14px 18px', marginBottom:32 }}>
          <p style={{ fontSize:13, color:'#141413', margin:0, lineHeight:1.7 }}>
            <strong>Resumen:</strong> Puedes eliminar tus datos tú mismo desde la app, o pedírnoslo por email. La eliminación de cuenta borra permanentemente tus datos personales en un plazo máximo de 30 días.
          </p>
        </div>

        <H2>1. Eliminar tu cuenta completa (desde la app)</H2>
        <P>Esta es la vía más rápida y no requiere escribirnos:</P>
        <ul style={{ margin:'0 0 14px', paddingLeft:20 }}>
          <Li>Inicia sesión en <Link href="/login" style={{ color:G }}>usenotoria.app/login</Link></Li>
          <Li>Ve a <strong>Configuración → Zona de peligro → Eliminar cuenta</strong></Li>
          <Li>Confirma la eliminación</Li>
        </ul>
        <P>Se borran permanentemente: tu perfil, tus negocios, las reseñas y comentarios recopilados, alertas, reportes y los tokens de acceso de todas las cuentas conectadas (Google Business Profile, Instagram, Facebook y TikTok). Solo conservamos los datos de facturación que la legislación peruana nos obliga a retener (5 años).</P>

        <H2>2. Desconectar una red social sin eliminar la cuenta</H2>
        <P>Si solo quieres retirar el acceso de Notoria a una cuenta de Instagram, Facebook o TikTok:</P>
        <ul style={{ margin:'0 0 14px', paddingLeft:20 }}>
          <Li>Ve a <strong>Panel de control → Conexiones</strong></Li>
          <Li>Pulsa el botón de ajustes (⚙) junto a la cuenta conectada</Li>
          <Li>Elige <strong>Eliminar conexión</strong> y confirma</Li>
        </ul>
        <P>Al hacerlo borramos de inmediato los tokens de acceso de esa cuenta y revocamos la autorización también del lado de la plataforma. Notoria deja de poder leer o responder contenido de esa cuenta.</P>
        <P>También puedes retirar el acceso desde la propia plataforma: en Facebook/Instagram ve a <strong>Configuración → Apps y sitios web</strong> y elimina Notoria; los tokens que tengamos quedan inservibles en ese momento.</P>

        <H2>3. Solicitar la eliminación por email</H2>
        <P>Si no puedes acceder a tu cuenta, o quieres ejercer cualquiera de tus derechos ARCO (acceso, rectificación, cancelación u oposición), escribe a <a href="mailto:hola@usenotoria.app" style={{ color:G }}>hola@usenotoria.app</a> desde el email con el que te registraste, indicando "Eliminación de datos" en el asunto.</P>
        <P>Confirmaremos la solicitud y completaremos la eliminación en un plazo máximo de 20 días hábiles.</P>

        <H2>4. Qué datos tratamos</H2>
        <P>El detalle completo de qué datos recopilamos, con qué finalidad y con qué terceros trabajamos está en nuestra <Link href="/privacidad" style={{ color:G }}>Política de Privacidad</Link>.</P>

        <div style={{ borderTop:'1px solid #E8E6DC', marginTop:40, paddingTop:20 }}>
          <p style={{ fontSize:12, color:'#9C9B96', lineHeight:1.7, margin:0 }}>
            <strong>English:</strong> To delete your data, log in and go to <em>Settings → Danger zone → Delete account</em>, or disconnect an individual social account under <em>Dashboard → Connections</em>. If you cannot access your account, email <a href="mailto:hola@usenotoria.app" style={{ color:G }}>hola@usenotoria.app</a> with the subject "Data deletion" and we will complete the request within 20 business days. Personal data is permanently erased within 30 days of account deletion.
          </p>
        </div>
      </div>
    </div>
  );
}
