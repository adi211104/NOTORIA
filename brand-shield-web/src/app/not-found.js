import Link from 'next/link';

const GEO = "Georgia,'Times New Roman',serif";
const G = '#0B7324';

export default function NotFound() {
  return (
    <div style={{ minHeight:'100vh', background:'#141413', display:'flex', flexDirection:'column', fontFamily:GEO }}>
      <nav style={{ borderBottom:'1px solid #2C2C2A', padding:'0 28px', height:56, display:'flex', alignItems:'center', gap:9 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
        <span style={{ fontWeight:800, fontSize:17, color:'#FFFFFF' }}>Notoria</span>
      </nav>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }}>
        <div style={{ maxWidth:440 }}>
          <p style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:2, color:G, margin:'0 0 16px' }}>Error 404</p>
          <h1 style={{ fontSize:48, fontWeight:900, color:'#FFFFFF', margin:'0 0 12px', letterSpacing:'-2px' }}>Página no encontrada</h1>
          <p style={{ fontSize:16, color:'#B0AEA5', margin:'0 0 32px', lineHeight:1.7 }}>
            La página que buscas no existe o fue movida. No te preocupes, tu reputación sigue monitoreada.
          </p>
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
            <Link href="/" style={{ display:'inline-block', background:G, color:'#fff', textDecoration:'none', padding:'12px 24px', borderRadius:5, fontWeight:700, fontSize:14, fontFamily:GEO }}>
              Ir al inicio
            </Link>
            <Link href="/dashboard" style={{ display:'inline-block', background:'transparent', color:'#B0AEA5', textDecoration:'none', padding:'12px 24px', borderRadius:5, fontSize:14, border:'1px solid #2C2C2A', fontFamily:GEO }}>
              Ir al panel de control
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
