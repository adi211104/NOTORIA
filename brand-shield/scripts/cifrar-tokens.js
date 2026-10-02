// brand-shield/scripts/cifrar-tokens.js
//
// Cifra los tokens OAuth que ya estaban guardados EN CLARO (auditoría
// 2026-10-02, P1-05). Pasada única tras el despliegue de lib/cifradoTokens.js:
// desde ese despliegue todo lo que se ESCRIBE sale cifrado, pero una fila que
// no se toca (un token de Instagram dura 60 días) seguiría en claro hasta
// entonces.
//
//   railway run --service api node scripts/cifrar-tokens.js            ← simulacro
//   railway run --service api node scripts/cifrar-tokens.js --aplicar  ← de verdad
//
// ⚠️ Con `railway run` y NO en local a secas: la clave `TOKENS_CLAVE` solo vive
// en Railway. `lib-env-produccion.js` arregla la DATABASE_URL interna.
//
// Es idempotente (lo ya cifrado no se vuelve a cifrar) y al terminar vuelve a
// leer cada fila para comprobar que el token cifrado se DESCIFRA al original —
// cifrar sin poder descifrar sería desconectar en silencio todas las redes.

require('./lib-env-produccion')();
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const ct = require('../src/lib/cifradoTokens');

const aplicar = process.argv.includes('--aplicar');
const CAMPOS = [...ct.CAMPOS];

(async () => {
  if (!ct.activo()) {
    console.error('✗ TOKENS_CLAVE no está definida. Córrelo con `railway run --service api …`.');
    process.exit(1);
  }
  // Cliente SIN la extensión: hay que ver los valores tal como están guardados.
  const prisma = new PrismaClient();
  const select = Object.fromEntries([['id', true], ['nombre', true], ...CAMPOS.map((c) => [c, true])]);
  const negocios = await prisma.negocio.findMany({ select });

  let enClaro = 0; let yaCifrados = 0; let cambiados = 0; let errores = 0;
  for (const n of negocios) {
    const data = {};
    for (const c of CAMPOS) {
      const v = n[c];
      if (!v) continue;
      if (ct.estaCifrado(v)) { yaCifrados += 1; continue; }
      enClaro += 1;
      data[c] = ct.cifrar(v);
    }
    if (!Object.keys(data).length) continue;
    console.log(`${aplicar ? '→' : '·'} ${n.nombre}: ${Object.keys(data).join(', ')}`);
    if (!aplicar) continue;
    await prisma.negocio.update({ where: { id: n.id }, data });
    // Verificación: lo guardado se descifra EXACTAMENTE al valor original.
    const releido = await prisma.negocio.findUnique({ where: { id: n.id }, select });
    for (const c of Object.keys(data)) {
      if (ct.descifrar(releido[c]) !== n[c]) { errores += 1; console.error(`  ✗ ${c} no se descifra al original`); } else cambiados += 1;
    }
  }

  console.log(`\nTokens en claro: ${enClaro} · ya cifrados: ${yaCifrados}`);
  if (aplicar) console.log(`Cifrados y verificados: ${cambiados} · errores: ${errores}`);
  else console.log('Simulacro: no se cambió nada. Repetir con --aplicar.');
  await prisma.$disconnect();
  process.exit(errores ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
