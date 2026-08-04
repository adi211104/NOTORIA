import { ARTICULOS } from '../lib/blog';

export default function sitemap() {
  const base = 'https://usenotoria.app';
  return [
    { url: base,                 lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/blog`,       lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    ...ARTICULOS.map((a) => ({ url: `${base}/blog/${a.slug}`, lastModified: new Date(`${a.fecha}T12:00:00`), changeFrequency: 'monthly', priority: 0.7 })),
    { url: `${base}/terminos`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/privacidad`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/eliminar-datos`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/login`,      lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/registro`,   lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
  ];
}
