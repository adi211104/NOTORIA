import type { NextConfig } from "next";

// Origen del backend: viaja en la CSP (connect-src) porque el panel le habla por
// fetch. Sin esto, encender la CSP dejaría al panel sin poder llamar a su propia
// API. Se lee de la misma variable que ya usa el cliente para que producción y
// local no se desincronicen.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Cabeceras de seguridad de la web.
//
// El backend ya las manda todas (helmet, ver brand-shield/src/index.js) pero la
// web no mandaba ninguna: sin CSP, sin X-Frame-Options, sin nosniff y sin
// Referrer-Policy. Importa más de lo normal porque el token de sesión vive en
// localStorage (src/lib/api.js), así que un script inyectado se lleva la sesión
// entera; y sin frame-ancestors el panel se puede incrustar en una página ajena
// y engañar al usuario para que haga clic donde no cree.
//
// ⚠️ La CSP lleva 'unsafe-inline' y 'unsafe-eval' en script-src a propósito:
//   - Next.js inyecta scripts inline para hidratar (y Turbopack usa eval en dev),
//   - Google Identity Services y el widget de Culqi cargan sus propios scripts.
// Cerrarlo del todo exige nonces por petición, que en App Router obliga a
// renderizado dinámico en páginas hoy estáticas. Aun con 'unsafe-inline' la CSP
// sirve: limita DE DÓNDE puede venir un script y adónde puede mandar datos, que
// es lo que corta la exfiltración del token.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Los comodines de culqi.com y google.com son a propósito: los dos widgets
  // (Checkout de Culqi, Google Identity Services) cargan piezas desde
  // subdominios propios que no están documentados y cambian sin aviso. Cerrar
  // esto a un host exacto es la forma más fácil de romper el cobro en producción
  // sin enterarse hasta que un cliente no pueda pagar.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.culqi.com https://accounts.google.com https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${API} https://*.culqi.com https://accounts.google.com https://www.googleapis.com`,
  "frame-src https://*.culqi.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const CABECERAS = [
  { key: "Content-Security-Policy", value: CSP },
  // Redundante con frame-ancestors para navegadores viejos que no leen CSP nivel 2
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // includeSubDomains cubre api.usenotoria.app, que ya manda HSTS por su cuenta.
  // Sin `preload`: entrar a la lista de precarga es irreversible en la práctica y
  // es una decisión del dueño del dominio, no un efecto secundario de esto.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // La app vive en un subdirectorio (Vigilio/brand-shield-web) sin lockfile en la
  // raíz del monorepo, así que fijamos la raíz explícitamente para que Turbopack
  // no la infiera mal y falle resolviendo el paquete de Next.
  turbopack: {
    root: __dirname,
  },
  // Permite abrir el dev server desde otras PCs de la red local
  // (http://192.168.x.x:3001). Solo aplica en desarrollo.
  allowedDevOrigins: ["192.168.18.62", "192.168.*.*", "10.*.*.*"],

  async headers() {
    return [{ source: "/:path*", headers: CABECERAS }];
  },
};

export default nextConfig;
