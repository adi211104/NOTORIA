import Link from 'next/link';
import PieLegal, { CONTACTO } from '../../components/PieLegal';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

export const metadata = {
  title: 'Política de cambios y devoluciones',
  description: 'Condiciones de cancelación, cambios de plan y devoluciones de Notoria.',
};

const H2 = ({ children }) => <h2 style={{ fontSize:17, fontWeight:700, color:'#141413', margin:'28px 0 10px', letterSpacing:'-0.3px' }}>{children}</h2>;
const P = ({ children }) => <p style={{ fontSize:14, color:'#5C5B57', lineHeight:1.8, margin:'0 0 12px' }}>{children}</p>;

export default function DevolucionesPage() {
  const fecha = '5 de agosto de 2026';
  return (
    <div style={{ minHeight:'100vh', background:'#FAF9F5', fontFamily:GEO }}>
      <nav style={{ borderBottom:'1px solid #E8E6DC', padding:'0 28px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:9, textDecoration:'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
          <span style={{ fontWeight:800, fontSize:17, color:'#141413' }}>Notoria</span>
        </Link>
        <Link href="/terminos" style={{ fontSize:13, color:'#5C5B57', textDecoration:'none' }}>Términos de servicio →</Link>
      </nav>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'48px 24px 72px' }}>
        <p style={{ fontSize:11, color:G, fontWeight:600, textTransform:'uppercase', letterSpacing:2, margin:'0 0 12px' }}>Documento legal</p>
        <h1 style={{ fontSize:34, fontWeight:900, color:'#141413', margin:'0 0 8px', letterSpacing:'-1.5px' }}>Política de cambios y devoluciones</h1>
        <p style={{ fontSize:13, color:'#9C9B96', margin:'0 0 40px', borderBottom:'1px solid #E8E6DC', paddingBottom:24 }}>Notoria · Última actualización: {fecha}</p>

        <H2>1. Naturaleza del servicio</H2>
        <P>Notoria comercializa un servicio digital de monitoreo de reputación online por suscripción. No se entregan bienes físicos, por lo que no existen envíos, cambios de talla, color ni devoluciones de mercadería. Lo que se contrata es el acceso a la plataforma durante un periodo determinado (mensual o anual).</P>

        <H2>2. Derecho de retracto: 7 días</H2>
        <P>Si contrataste un plan de pago y no quedaste conforme, puedes solicitar la <strong>devolución íntegra del importe pagado dentro de los 7 días calendario</strong> siguientes al cobro, sin necesidad de expresar una causa. Es nuestra garantía de satisfacción y aplica tanto a la facturación mensual como a la anual, la primera vez que contratas un plan.</P>
        <P>Para ejercerlo escríbenos a <a href={`mailto:${CONTACTO.email}`} style={{ color:G }}>{CONTACTO.email}</a> desde el correo de tu cuenta, indicando tu número de comprobante. No exigimos ningún trámite adicional.</P>

        <H2>3. Cancelación de la suscripción</H2>
        <P>Puedes cancelar tu suscripción en cualquier momento desde tu panel, en <strong>Configuración → Suscripción</strong>, o escribiéndonos. No hay contratos de permanencia ni penalidades por cancelar.</P>
        <P>Al cancelar, tu plan permanece activo hasta el final del periodo que ya pagaste y no se te vuelve a cobrar. Cumplida esa fecha, tu cuenta pasa automáticamente al plan Gratuito y conservas el acceso a tus negocios monitoreados con las funcionalidades de ese plan.</P>

        <H2>4. Devoluciones fuera del plazo de retracto</H2>
        <P>Pasados los 7 días, como regla general no se devuelven los importes correspondientes a periodos ya iniciados, porque el servicio estuvo disponible durante ese tiempo. Sí procede la devolución, total o proporcional, en los siguientes casos:</P>
        <P>a) <strong>Cobro duplicado o erróneo:</strong> devolvemos el 100% del importe cobrado de más, sin plazo límite para reclamarlo.</P>
        <P>b) <strong>Cobro posterior a una cancelación:</strong> si te cobramos una renovación después de que solicitaste la baja, devolvemos el 100%.</P>
        <P>c) <strong>Indisponibilidad prolongada:</strong> si la plataforma queda inoperativa por causas atribuibles a Notoria durante más de 72 horas seguidas dentro de un periodo facturado, devolvemos la parte proporcional a los días afectados.</P>
        <P>d) <strong>Suscripción anual:</strong> si cancelas un plan anual pasados los 7 días, puedes solicitar la devolución proporcional de los meses completos no consumidos, descontando el descuento anual aplicado.</P>

        <H2>5. Cambios de plan</H2>
        <P><strong>Subir de plan (upgrade):</strong> el cambio es inmediato. Se cobra la diferencia proporcional por los días que resten del periodo en curso y a partir de la siguiente renovación se factura el precio del nuevo plan.</P>
        <P><strong>Bajar de plan (downgrade):</strong> se hace efectivo al terminar el periodo que ya pagaste, para que aproveches lo contratado. No se genera devolución por la diferencia de precio del periodo en curso.</P>
        <P><strong>Cambio de modalidad de cobro:</strong> puedes pasar de mensual a anual en cualquier momento; el cambio de anual a mensual se aplica al vencer la anualidad.</P>

        <H2>6. Plazos y medio de devolución</H2>
        <P>Toda solicitud se responde en un plazo máximo de <strong>2 días hábiles</strong>. Aprobada la devolución, el reembolso se procesa a través de Culqi <strong>a la misma tarjeta con la que se realizó el pago</strong>: no es posible devolver a una tarjeta o cuenta distinta.</P>
        <P>El importe se acredita en un plazo de <strong>5 a 15 días hábiles</strong>, según los tiempos del banco emisor de tu tarjeta. Notoria no controla ese plazo. Emitimos la nota de crédito electrónica correspondiente y te la enviamos por correo.</P>

        <H2>7. Renovación automática</H2>
        <P>Las suscripciones se renuevan automáticamente al final de cada periodo con la tarjeta registrada, hasta que canceles. Te avisamos por correo antes de cada renovación anual. Puedes desactivar la renovación en cualquier momento desde tu panel.</P>

        <H2>8. Cómo reclamar</H2>
        <P>Si no estás conforme con la respuesta a tu solicitud, puedes registrar tu caso en nuestro <Link href="/libro-reclamaciones" style={{ color:G }}>Libro de Reclamaciones</Link>, que atendemos en un plazo máximo de 15 días hábiles conforme a la Ley 29571. Ello no impide acudir a otras vías de solución de controversias ni denunciar ante el INDECOPI.</P>

        <H2>9. Contacto</H2>
        <P>
          {CONTACTO.razonSocial} · RUC {CONTACTO.ruc}<br/>
          {CONTACTO.direccion}<br/>
          Teléfono y WhatsApp: <a href={`tel:${CONTACTO.telefonoLink}`} style={{ color:G }}>{CONTACTO.telefono}</a><br/>
          Correo: <a href={`mailto:${CONTACTO.email}`} style={{ color:G }}>{CONTACTO.email}</a><br/>
          {CONTACTO.horario}
        </P>

        <div style={{ marginTop:36, padding:'20px 24px', background:'#FFFFFF', border:'1px solid #E8E6DC', borderRadius:6 }}>
          <p style={{ fontSize:12, color:'#9C9B96', margin:0, lineHeight:1.7 }}>
            Esta política complementa nuestros <Link href="/terminos" style={{ color:G }}>Términos de Servicio</Link> y
            se rige por el Código de Protección y Defensa del Consumidor (Ley N.° 29571) del Perú.
            Ninguna de sus disposiciones limita los derechos que la ley te reconoce como consumidor.
          </p>
        </div>
      </div>

      <PieLegal />
    </div>
  );
}
