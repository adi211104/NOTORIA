import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARTICULOS, articuloPorSlug } from '../../../lib/blog';
import LogoNotoria from '../../../components/LogoNotoria';

const GEO = "Georgia,'Times New Roman',serif";

export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const a = articuloPorSlug(slug);
  if (!a) return {};
  return {
    title: a.titulo,
    description: a.descripcion,
    alternates: { canonical: `https://usenotoria.app/blog/${a.slug}` },
    openGraph: {
      type: 'article',
      title: a.titulo,
      description: a.descripcion,
      url: `https://usenotoria.app/blog/${a.slug}`,
      publishedTime: a.fecha,
    },
  };
}

const FECHA_LARGA = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

// Los bloques traen HTML propio (strong, enlaces internos) escrito por
// nosotros en lib/blog.js — no es contenido de usuarios, por eso el
// dangerouslySetInnerHTML es seguro acá.
const Bloque = ({ b }) => {
  if (b.tipo === 'h2') return <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '30px 0 12px', letterSpacing: '-0.5px' }}>{b.texto}</h2>;
  if (b.tipo === 'p') return <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.85, margin: '0 0 14px' }} dangerouslySetInnerHTML={{ __html: b.texto }} />;
  if (b.tipo === 'destacado') return (
    <div style={{ background: 'var(--accent-t)', border: '1px solid var(--accent-b)', borderRadius: 8, padding: '16px 20px', margin: '28px 0 14px' }}>
      <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.75, margin: 0 }} dangerouslySetInnerHTML={{ __html: b.texto }} />
    </div>
  );
  const Tag = b.tipo === 'numerada' ? 'ol' : 'ul';
  return (
    <Tag style={{ margin: '0 0 14px', paddingLeft: 22 }}>
      {b.items.map((it, i) => (
        <li key={i} style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: it }} />
      ))}
    </Tag>
  );
};

export default async function ArticuloPage({ params }) {
  const { slug } = await params;
  const a = articuloPorSlug(slug);
  if (!a) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.titulo,
    description: a.descripcion,
    datePublished: a.fecha,
    inLanguage: 'es',
    mainEntityOfPage: `https://usenotoria.app/blog/${a.slug}`,
    author: { '@type': 'Organization', name: 'Notoria', url: 'https://usenotoria.app' },
    publisher: { '@type': 'Organization', name: 'NOTORIA E.I.R.L.', url: 'https://usenotoria.app' },
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: GEO }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav style={{ borderBottom: '1px solid var(--border-c)', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <LogoNotoria size={18} color="var(--accent)" />
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>Notoria</span>
        </Link>
        <Link href="/registro" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '8px 16px', borderRadius: 6, textDecoration: 'none' }}>Empezar gratis</Link>
      </nav>

      <article style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 60px' }}>
        <Link href="/blog" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>← Todos los artículos</Link>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text)', margin: '16px 0 10px', letterSpacing: '-1px', lineHeight: 1.25 }}>{a.titulo}</h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 34px', borderBottom: '1px solid var(--border-c)', paddingBottom: 22 }}>
          {FECHA_LARGA(a.fecha)} · {a.minutos} min de lectura · Notoria
        </p>
        {a.contenido.map((b, i) => <Bloque key={i} b={b} />)}

        <div style={{ borderTop: '1px solid var(--border-c)', marginTop: 40, paddingTop: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.7, margin: 0 }}>
            Notoria es un monitor de reputación para negocios del Perú: detecta ataques de reseñas, te alerta de caídas de rating y te ayuda a responder con IA.{' '}
            <Link href="/" style={{ color: 'var(--accent)' }}>Conócelo aquí</Link>.
          </p>
        </div>
      </article>
    </div>
  );
}
