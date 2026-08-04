import Link from 'next/link';
import { ARTICULOS } from '../../lib/blog';
import LogoNotoria from '../../components/LogoNotoria';

const GEO = "Georgia,'Times New Roman',serif";

export const metadata = {
  title: 'Blog — Reputación online para restaurantes y hoteles',
  description: 'Guías prácticas para cuidar la reputación de tu restaurante u hotel: responder reseñas negativas, detectar reseñas falsas y subir tu rating en Google.',
  alternates: { canonical: 'https://usenotoria.app/blog' },
};

const FECHA_LARGA = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

export default function BlogIndex() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: GEO }}>
      <nav style={{ borderBottom: '1px solid var(--border-c)', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <LogoNotoria size={18} color="var(--accent)" />
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>Notoria</span>
        </Link>
        <Link href="/registro" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '8px 16px', borderRadius: 6, textDecoration: 'none' }}>Empezar gratis</Link>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 12px' }}>Blog</p>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-1.5px' }}>Reputación online, sin humo</h1>
        <p style={{ fontSize: 15, color: 'var(--text-2)', margin: '0 0 40px', lineHeight: 1.7 }}>
          Guías prácticas para dueños de restaurantes y hoteles: qué hacer con las reseñas malas, las falsas y las que todavía no llegan.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ARTICULOS.map((a) => (
            <Link key={a.slug} href={`/blog/${a.slug}`} style={{ display: 'block', textDecoration: 'none', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 10, padding: '22px 24px' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>{FECHA_LARGA(a.fecha)} · {a.minutos} min de lectura</p>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.35 }}>{a.titulo}</h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.7 }}>{a.descripcion}</p>
              <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '12px 0 0' }}>Leer artículo →</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
