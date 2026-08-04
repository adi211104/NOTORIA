// Envuelve contenido real (parcialmente visible) con un difuminado + CTA de
// upgrade superpuesto. Mismo patrón visual usado en el preview de reportes PDF
// (dashboard/reportes/page.js): la función se ve pero no es funcional en el
// plan actual — nunca se oculta del todo, para empujar el upgrade con valor visible.
export default function BloqueoPlan({ mensaje, href = '/dashboard/planes', children, alturaDifuminado = 90 }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(3px)', pointerEvents: 'none', userSelect: 'none' }} aria-hidden="true">
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(transparent, var(--surface) 65%)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 14,
      }}>
        <a href={href} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#0B7324', color: '#fff', textDecoration: 'none',
          padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          {mensaje}
        </a>
      </div>
    </div>
  );
}
