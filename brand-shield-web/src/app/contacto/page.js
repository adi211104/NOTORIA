import Link from 'next/link';
import PieLegal, { CONTACTO } from '../../components/PieLegal';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

export const metadata = {
  title: 'Contacto',
  description: 'Teléfono, WhatsApp, correo y dirección de Notoria (NOTORIA E.I.R.L.).',
};

// Datos de contacto en una página propia, además del pie: Culqi exige que
// número, correo y dirección estén visibles y sean fáciles de encontrar.
const canales = [
  {
    titulo: 'Teléfono y WhatsApp',
    valor: CONTACTO.telefono,
    href: `https://wa.me/${CONTACTO.whatsapp}`,
    detalle: 'Atención comercial y soporte. Respondemos por WhatsApp dentro del horario de atención.',
    icono: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>,
  },
  {
    titulo: 'Correo electrónico',
    valor: CONTACTO.email,
    href: `mailto:${CONTACTO.email}`,
    detalle: 'Consultas comerciales, soporte técnico, facturación y solicitudes de devolución.',
    icono: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></>,
  },
  {
    titulo: 'Dirección',
    valor: CONTACTO.direccion,
    detalle: 'Domicilio fiscal de NOTORIA E.I.R.L. La atención al cliente es 100% remota: no atendemos público en esta dirección.',
    icono: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  },
];

export default function ContactoPage() {
  return (
    <div style={{ minHeight:'100vh', background:'#FAF9F5', fontFamily:GEO }}>
      <nav style={{ borderBottom:'1px solid #E8E6DC', padding:'0 28px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:9, textDecoration:'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontWeight:800, fontSize:17, color:'#141413' }}>Notoria</span>
        </Link>
        <Link href="/precios" style={{ fontSize:13, color:'#5C5B57', textDecoration:'none' }}>Precios →</Link>
      </nav>

      <div style={{ maxWidth:820, margin:'0 auto', padding:'48px 24px 72px' }}>
        <p style={{ fontSize:11, color:G, fontWeight:600, textTransform:'uppercase', letterSpacing:2, margin:'0 0 12px' }}>Estamos para ayudarte</p>
        <h1 style={{ fontSize:34, fontWeight:900, color:'#141413', margin:'0 0 10px', letterSpacing:'-1.5px' }}>Contacto</h1>
        <p style={{ fontSize:15, color:'#5C5B57', lineHeight:1.7, margin:'0 0 8px', maxWidth:640 }}>
          ¿Dudas sobre los planes, una factura o el servicio? Escríbenos por el canal que prefieras.
        </p>
        <p style={{ fontSize:13, color:'#9C9B96', margin:'0 0 34px' }}>{CONTACTO.horario}</p>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))', gap:16, marginBottom:32 }}>
          {canales.map(c => (
            <div key={c.titulo} style={{ background:'#fff', border:'1px solid #E8E6DC', borderRadius:8, padding:20 }}>
              <div style={{ width:34, height:34, borderRadius:6, background:'rgba(11,115,36,0.1)', border:'1px solid rgba(11,115,36,0.25)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{c.icono}</svg>
              </div>
              <h2 style={{ fontSize:14, fontWeight:700, color:'#141413', margin:'0 0 6px' }}>{c.titulo}</h2>
              {c.href ? (
                <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                  style={{ fontSize:14, color:G, textDecoration:'none', fontWeight:600, lineHeight:1.6, wordBreak:'break-word' }}>{c.valor}</a>
              ) : (
                <p style={{ fontSize:13.5, color:'#141413', margin:0, lineHeight:1.6 }}>{c.valor}</p>
              )}
              <p style={{ fontSize:12.5, color:'#5C5B57', lineHeight:1.65, margin:'9px 0 0' }}>{c.detalle}</p>
            </div>
          ))}
        </div>

        {/* Identificación del comercio */}
        <div style={{ background:'#fff', border:'1px solid #E8E6DC', borderRadius:8, padding:22, marginBottom:20 }}>
          <h2 style={{ fontSize:15, fontWeight:700, color:'#141413', margin:'0 0 12px' }}>Datos de la empresa</h2>
          <div style={{ fontSize:13.5, color:'#5C5B57', lineHeight:1.9 }}>
            <div><strong style={{ color:'#141413' }}>Razón social:</strong> {CONTACTO.razonSocial}</div>
            <div><strong style={{ color:'#141413' }}>RUC:</strong> {CONTACTO.ruc}</div>
            <div><strong style={{ color:'#141413' }}>Domicilio fiscal:</strong> {CONTACTO.direccion}</div>
            <div><strong style={{ color:'#141413' }}>Actividad:</strong> Servicios de monitoreo de reputación online por suscripción</div>
          </div>
        </div>

        <div style={{ background:'#fff', border:'1px solid #E8E6DC', borderRadius:8, padding:22 }}>
          <h2 style={{ fontSize:15, fontWeight:700, color:'#141413', margin:'0 0 10px' }}>¿Un reclamo o una queja?</h2>
          <p style={{ fontSize:13.5, color:'#5C5B57', lineHeight:1.75, margin:'0 0 14px' }}>
            Puedes registrarlo directamente en nuestro Libro de Reclamaciones virtual.
            Te damos respuesta en un plazo máximo de 15 días hábiles.
          </p>
          <Link href="/libro-reclamaciones" style={{ display:'inline-block', background:G, color:'#fff', padding:'10px 18px', borderRadius:5, fontSize:13.5, fontWeight:700, textDecoration:'none' }}>
            Ir al Libro de Reclamaciones
          </Link>
        </div>
      </div>

      <PieLegal />
    </div>
  );
}
