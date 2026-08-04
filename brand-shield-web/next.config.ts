import type { NextConfig } from "next";

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
};

export default nextConfig;
