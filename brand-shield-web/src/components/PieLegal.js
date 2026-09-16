// Pie de página con la información obligatoria: identificación del comercio,
// datos de contacto (teléfono, correo y dirección) y los enlaces legales,
// incluido el Libro de Reclamaciones.
//
// Culqi exige que estos datos estén visibles en la web y que el Libro de
// Reclamaciones esté integrado en el sitio, no en un formulario externo.
// Se usa en las páginas públicas nuevas para que la información no dependa de
// que el visitante llegue al landing.

import Link from 'next/link';
import { CONTACTO } from '../lib/contacto';

const G = '#0B7324';

// Los datos de contacto viven en `lib/contacto.js`, no acá: el botón flotante de
// WhatsApp también los necesita y es un componente de cliente. Se re-exportan
// para no tocar las siete pantallas que ya importan `CONTACTO` desde este pie.
export { CONTACTO };

const enlaces = [
  { l: 'Precios y contratación', h: '/precios' },
  { l: 'Contacto', h: '/contacto' },
  { l: 'Términos de servicio', h: '/terminos' },
  { l: 'Política de privacidad', h: '/privacidad' },
  { l: 'Cambios y devoluciones', h: '/devoluciones' },
  { l: 'Libro de Reclamaciones', h: '/libro-reclamaciones' },
];

export default function PieLegal() {
  return (
    <footer style={{ borderTop: '1px solid #E8E6DC', background: '#fff', padding: '36px 24px 24px', fontFamily: "Georgia,'Times New Roman',serif" }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 28 }}>
          <div>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={G} role="img" aria-label="Notoria"><path d="M4.09 6.56H7.97V21H4.09ZM4.09 6.56H7.97L19.91 21H16.03ZM16.03 21V6.96L19.91 3V21Z"/></svg>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#141413' }}>Notoria</span>
            </Link>
            <p style={{ fontSize: 12.5, color: '#5C5B57', lineHeight: 1.7, margin: 0 }}>
              Monitoreo de reputación online para negocios del Perú.
              Detectamos reseñas falsas, ataques de bots y caídas de rating.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: '#141413', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Contacto</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <li style={{ fontSize: 12.5, color: '#5C5B57' }}>
                Teléfono: <a href={`tel:${CONTACTO.telefonoLink}`} style={{ color: G, textDecoration: 'none' }}>{CONTACTO.telefono}</a>
              </li>
              <li style={{ fontSize: 12.5, color: '#5C5B57' }}>
                WhatsApp: <a href={`https://wa.me/${CONTACTO.whatsapp}`} target="_blank" rel="noopener noreferrer" style={{ color: G, textDecoration: 'none' }}>{CONTACTO.telefono}</a>
              </li>
              <li style={{ fontSize: 12.5, color: '#5C5B57' }}>
                Correo: <a href={`mailto:${CONTACTO.email}`} style={{ color: G, textDecoration: 'none' }}>{CONTACTO.email}</a>
              </li>
              <li style={{ fontSize: 12.5, color: '#5C5B57', lineHeight: 1.6 }}>Dirección: {CONTACTO.direccion}</li>
              <li style={{ fontSize: 12.5, color: '#9C9B96' }}>{CONTACTO.horario}</li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: '#141413', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Información legal</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {enlaces.map(e => (
                <li key={e.h}>
                  <Link href={e.h} style={{ fontSize: 12.5, color: '#5C5B57', textDecoration: 'none' }}>{e.l}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Distintivo del Libro de Reclamaciones — INDECOPI exige que sea
              visible y de acceso fácil desde cualquier página */}
          <div>
            <Link href="/libro-reclamaciones" style={{ textDecoration: 'none', display: 'inline-block' }}>
              <div style={{ border: '2px solid #141413', borderRadius: 6, padding: '12px 14px', maxWidth: 210, background: '#FAF9F5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#141413" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#141413', lineHeight: 1.25 }}>LIBRO DE<br/>RECLAMACIONES</div>
                  </div>
                </div>
                <p style={{ fontSize: 10.5, color: '#5C5B57', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Conforme al Código de Protección y Defensa del Consumidor (Ley 29571). Haz clic para registrar tu reclamo o queja.
                </p>
              </div>
            </Link>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #E8E6DC', marginTop: 26, paddingTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#9C9B96' }}>
            © {new Date().getFullYear()} {CONTACTO.razonSocial} · RUC {CONTACTO.ruc}
          </span>
          <span style={{ fontSize: 12, color: '#9C9B96' }}>usenotoria.app</span>
        </div>
      </div>
    </footer>
  );
}
