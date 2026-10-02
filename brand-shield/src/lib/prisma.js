const { PrismaClient } = require('@prisma/client');
const cifradoTokens = require('./cifradoTokens');

// Singleton — un solo cliente para toda la app.
//
// Va EXTENDIDO con el cifrado de tokens OAuth (lib/cifradoTokens.js): se cifra
// al escribir y se descifra al leer, en cualquier consulta, sin que las rutas ni
// los workers tengan que saberlo. Los scripts que crean su propio
// `new PrismaClient()` NO llevan la extensión y ven los tokens cifrados — es lo
// correcto para los que solo los copian (mover-tiktok.js); para leerlos en claro
// hay que usar este singleton.
if (!global._prisma) {
  const base = new PrismaClient({
    log: ['error', 'warn'],
  });
  global._prisma = base.$extends(cifradoTokens.extension);
  base.$connect()
    .then(() => console.log('✅ Base de datos conectada'))
    .catch(e => console.error('❌ DB error:', e.message));
}

module.exports = global._prisma;
