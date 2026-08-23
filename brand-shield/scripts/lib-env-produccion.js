// brand-shield/scripts/lib-env-produccion.js
//
// Arregla la trampa de `railway run` para los scripts que necesitan a la vez
// los secretos de producción y la base de datos.
//
// 🔴 EL PROBLEMA. Un script de operación suele necesitar dos cosas que no viven
// juntas:
//
//   · secretos que SOLO están en Railway (llaves live de Culqi, credenciales
//     SOL de SUNAT, el certificado): los da `railway run`
//   · una URL de Postgres alcanzable desde esta máquina: solo está en el `.env`
//     local, que apunta al proxy público
//
// `railway run` resuelve lo primero y **rompe lo segundo**: inyecta
// `postgres.railway.internal`, que solo resuelve dentro del contenedor. Desde
// fuera el script muere con «Can't reach database server» y parece un problema
// de red o de credenciales cuando es solo el nombre del host.
//
// Ya costó tiempo dos veces —con `ensayo-alertas.js` y con el resumen de
// SUNAT—, así que vive aquí una sola vez en vez de copiado en cada script.
//
// Uso: primera línea del script, ANTES de crear el PrismaClient.
//   require('./lib-env-produccion')();

const fs = require('fs');
const path = require('path');

module.exports = function usarBaseLocal() {
  const url = process.env.DATABASE_URL || '';
  if (!url.includes('railway.internal')) return false;

  const rutaEnv = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(rutaEnv)) {
    console.warn('[env] DATABASE_URL apunta al host interno y no hay .env local con el que sustituirla.');
    return false;
  }

  const local = require('dotenv').parse(fs.readFileSync(rutaEnv));
  if (!local.DATABASE_URL) {
    console.warn('[env] El .env local no tiene DATABASE_URL.');
    return false;
  }

  process.env.DATABASE_URL = local.DATABASE_URL;
  console.log('[env] DATABASE_URL interna sustituida por la del .env local');
  return true;
};
