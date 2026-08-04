export default function sitemap() {
  const base = 'https://usenotoria.app';
  return [
    { url: base,                 lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/terminos`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/privacidad`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/login`,      lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/registro`,   lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },
  ];
}
