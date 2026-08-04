const { PrismaClient } = require('@prisma/client');

// Singleton — un solo cliente para toda la app
if (!global._prisma) {
  global._prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
  global._prisma.$connect()
    .then(() => console.log('✅ Base de datos conectada'))
    .catch(e => console.error('❌ DB error:', e.message));
}

module.exports = global._prisma;
