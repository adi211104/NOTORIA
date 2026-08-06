// Fuerza un ciclo de monitoreo desde la terminal, sin esperar el cron de 4h y
// sin el cooldown por plan que aplica el botón "Escanear ahora" del panel.
//
// Hace exactamente lo mismo que ese botón: reseñas de Google/Facebook,
// comentarios de TikTok e Instagram, menciones, competidores y las alertas que
// correspondan.
// ⚠️ Manda las notificaciones de verdad (correo/Telegram) si detecta algo nuevo.
//
// Correr:
//   cd brand-shield
//   railway run --service api node scripts/escanear.js                 # todos los negocios
//   railway run --service api node scripts/escanear.js <negocioId>     # uno solo
//
// Va con `railway run` para que TikTok pueda renovar su token (necesita
// TIKTOK_CLIENT_KEY/SECRET, que viven en Railway). Sin eso el resto igual corre.

const fs = require('fs');
const path = require('path');

// Railway inyecta la URL INTERNA de Postgres, que solo resuelve dentro de su
// red; desde una máquina de desarrollo se usa la pública del .env local.
const envLocal = path.join(__dirname, '..', '.env');
if (fs.existsSync(envLocal)) {
  const local = require('dotenv').parse(fs.readFileSync(envLocal));
  if (local.DATABASE_URL && /railway\.internal/.test(process.env.DATABASE_URL || '')) {
    process.env.DATABASE_URL = local.DATABASE_URL;
  }
}

const prisma = require('../src/lib/prisma');
const { ejecutarAhora } = require('../src/workers/monitoreo.worker');

const negocioId = process.argv[2] || null;

(async () => {
  if (negocioId) {
    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId }, select: { nombre: true } });
    if (!negocio) {
      console.error(`\n✖ No existe un negocio con id ${negocioId}\n`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nEscaneando: ${negocio.nombre}\n`);
  } else {
    console.log('\nEscaneando TODOS los negocios activos\n');
  }

  await ejecutarAhora(negocioId);

  if (negocioId) {
    const comentarios = await prisma.comentarioSocial.count({ where: { negocioId } });
    console.log(`\nComentarios guardados para este negocio: ${comentarios}`);
  }
  console.log('');
})()
  .catch((e) => { console.error('\nFATAL:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
