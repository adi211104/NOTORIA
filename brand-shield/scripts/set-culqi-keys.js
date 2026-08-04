// brand-shield/scripts/set-culqi-keys.js
// Escribe las llaves de Culqi en los dos archivos que las necesitan, sin editar
// nada a mano:
//   brand-shield/.env            → CULQI_PUBLIC_KEY, CULQI_SECRET_KEY
//   brand-shield-web/.env.local  → NEXT_PUBLIC_CULQI_PUBLIC_KEY
//
//   node scripts/set-culqi-keys.js pk_test_xxx sk_test_xxx
//
// Solo acepta llaves de test. Las de producción NO van en archivos locales:
// esas se cargan en Railway y Vercel (ver CLAUDE.md, sección Culqi).

const fs = require('fs');
const path = require('path');

const [pk, sk] = process.argv.slice(2);

const raiz = path.join(__dirname, '..');
const ENV_BACK = path.join(raiz, '.env');
const ENV_FRONT = path.join(raiz, '..', 'brand-shield-web', '.env.local');

if (!pk || !sk) {
  console.error('Uso: node scripts/set-culqi-keys.js <pk_test_...> <sk_test_...>');
  console.error('Las dos llaves salen del panel de Culqi → Desarrollo → Llaves (las de PRUEBA).');
  process.exit(1);
}

// El orden de los argumentos es fácil de invertir, y Culqi devolvería un error
// críptico. Se detecta acá, que es donde se puede explicar.
if (pk.startsWith('sk_') && sk.startsWith('pk_')) {
  console.error('✗ Las llaves están al revés: primero la PÚBLICA (pk_), después la SECRETA (sk_).');
  process.exit(1);
}
if (!pk.startsWith('pk_')) return fatal(`La primera llave debería empezar con "pk_" y empieza con "${pk.slice(0, 3)}"`);
if (!sk.startsWith('sk_')) return fatal(`La segunda llave debería empezar con "sk_" y empieza con "${sk.slice(0, 3)}"`);

if (pk.startsWith('pk_live_') || sk.startsWith('sk_live_')) {
  console.error('✗ Son llaves de PRODUCCIÓN (live) y estas no van en archivos locales.');
  console.error('  Las live se cargan en Railway y Vercel. Para probar hacen falta las de test:');
  console.error('  en el panel de Culqi, el juego que empieza con pk_test_ / sk_test_.');
  process.exit(1);
}

function fatal(msg) {
  console.error('✗', msg);
  process.exit(1);
}

// Reemplaza la línea de una variable conservando el resto del archivo intacto
// (comentarios, orden y demás variables). Si la variable no existe, la agrega.
const escribirVar = (archivo, clave, valor, conComillas) => {
  if (!fs.existsSync(archivo)) return `no existe (${archivo})`;
  const original = fs.readFileSync(archivo, 'utf8');
  const linea = `${clave}=${conComillas ? `"${valor}"` : valor}`;
  const re = new RegExp(`^${clave}=.*$`, 'm');
  const nuevo = re.test(original)
    ? original.replace(re, linea)
    : original.replace(/\s*$/, `\n${linea}\n`);
  if (nuevo === original) return 'sin cambios (ya tenía ese valor)';
  fs.writeFileSync(archivo, nuevo, 'utf8');
  return 'escrita';
};

console.log('Llaves de PRUEBA (no mueven dinero):\n');
console.log(' ', 'CULQI_PUBLIC_KEY            ', escribirVar(ENV_BACK, 'CULQI_PUBLIC_KEY', pk, true));
console.log(' ', 'CULQI_SECRET_KEY            ', escribirVar(ENV_BACK, 'CULQI_SECRET_KEY', sk, true));
console.log(' ', 'NEXT_PUBLIC_CULQI_PUBLIC_KEY', escribirVar(ENV_FRONT, 'NEXT_PUBLIC_CULQI_PUBLIC_KEY', pk, false));
console.log('\nListo. Ahora:  node scripts/prueba-culqi.js');
