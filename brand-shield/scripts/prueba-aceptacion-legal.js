// La aceptación legal no puede quedar solo en un checkbox del navegador.
// Esta prueba no necesita una base: protege el contrato entre schema, rutas y
// los dos flujos de alta para que una refactorización no vuelva a abrir Google
// o el registro por correo sin evidencia persistente.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..', '..');
const leer = (...rutas) => fs.readFileSync(path.join(raiz, ...rutas), 'utf8');
const schema = leer('brand-shield', 'prisma', 'schema.prisma');
const auth = leer('brand-shield', 'src', 'api', 'routes', 'auth.routes.js');
const registro = leer('brand-shield-web', 'src', 'app', 'registro', 'page.js');
const contexto = leer('brand-shield-web', 'src', 'context', 'AuthContext.js');

let pasadas = 0;
let fallidas = 0;
const check = (nombre, condicion) => {
  if (condicion) { pasadas += 1; console.log(`  ✓ ${nombre}`); }
  else { fallidas += 1; console.error(`  ✗ ${nombre}`); }
};

check('el esquema conserva un historial de aceptaciones, no solo campos actuales',
  /model AceptacionLegal\s*\{/.test(schema) && /aceptacionesLegales\s+AceptacionLegal\[\]/.test(schema));
check('una persona no puede duplicar la misma versión del mismo documento',
  /@@unique\(\[usuarioId, documento, version\]\)/.test(schema));
check('el registro por correo exige aceptación en el servidor',
  /aceptaTerminosYPrivacidad:\s*z\.literal\(true/.test(auth));
check('el servidor fija las versiones y registra Términos y Privacidad',
  /VERSION_TERMINOS\s*=\s*'1\.1'/.test(auth)
  && /VERSION_PRIVACIDAD\s*=\s*'1\.1'/.test(auth)
  && /documento:\s*'TERMINOS'/.test(auth)
  && /documento:\s*'PRIVACIDAD'/.test(auth));
check('el alta por correo crea las dos evidencias',
  /aceptacionesLegales:\s*documentosAceptados\('REGISTRO_EMAIL'\)/.test(auth));
check('Google no crea cuentas nuevas sin aceptación y guarda su origen',
  /if \(aceptaTerminosYPrivacidad !== true\)/.test(auth)
  && /aceptacionesLegales:\s*documentosAceptados\('REGISTRO_GOOGLE'\)/.test(auth));
check('el formulario por correo envía la aceptación al API',
  /auth\.registro\(\{[^}]*aceptaTerminosYPrivacidad:\s*true/.test(contexto));
check('Google requiere el checkbox y envía la aceptación al API',
  /if \(!aceptaTerminosRef\.current\)/.test(registro)
  && /credential:\s*response\.credential, aceptaTerminosYPrivacidad:\s*true/.test(registro));

console.log(`\n${pasadas} pasadas · ${fallidas} fallidas`);
if (fallidas) process.exit(1);
