// Ruta comercial del promotor. Página OCULTA: no se enlaza desde ningún sitio y
// no se indexa. Tampoco va en el robots.txt, que es público y la anunciaría.
// La protección de verdad no es ocultarla: el backend solo responde a los
// correos de RUTA_COMERCIAL_ACCESO (brand-shield/src/lib/rutaComercial.js).
export const metadata = {
  title: 'Ruta comercial',
  robots: { index: false, follow: false, nocache: true },
};

export default function RutaLayout({ children }) {
  return children;
}
