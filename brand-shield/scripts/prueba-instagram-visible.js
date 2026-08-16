// Prueba del interruptor `src/lib/instagramVisible.js` y de su efecto sobre las
// fuentes de menciones. Sin servidor, sin BD y sin red.
//
// Por qué importa: este módulo es lo único que impide que un cliente real vea un
// botón "Conectar Instagram" que solo puede devolverle un error de Meta (los
// permisos siguen en acceso estándar). Y a la vez es lo que mantiene la función
// visible para las cuentas con las que Meta revisa la app: si se rompe hacia ese
// lado, el revisor no ve la integración y rechaza la revisión entera.
//
// Correr:  node scripts/prueba-instagram-visible.js

const assert = require('assert');

let ok = 0;
const prueba = (nombre, fn) => {
  try {
    fn();
    console.log(`  ✓ ${nombre}`);
    ok++;
  } catch (e) {
    console.error(`  ✗ ${nombre}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

// El módulo lee process.env en cada llamada, así que basta con moverlo entre
// pruebas. Se guarda el original para no ensuciar el resto del proceso.
const ENV_ORIGINAL = { ...process.env };
const entorno = (vars) => {
  delete process.env.INSTAGRAM_ACTIVO;
  delete process.env.INSTAGRAM_CUENTAS_PRUEBA;
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
  Object.assign(process.env, vars);
};

const { instagramVisiblePara, activoParaTodos } = require('../src/lib/instagramVisible');

const REVISOR = { email: 'revisormeta@usenotoria.app' };
const CLIENTE = { email: 'cliente@surestaurante.pe' };

console.log('\nInterruptor de visibilidad');

prueba('sin variables, no lo ve nadie', () => {
  entorno({});
  assert.strictEqual(instagramVisiblePara(CLIENTE), false);
  assert.strictEqual(instagramVisiblePara(REVISOR), false);
  assert.strictEqual(activoParaTodos(), false);
});

prueba('la cuenta de prueba lo ve; el cliente no', () => {
  entorno({ INSTAGRAM_CUENTAS_PRUEBA: 'revisormeta@usenotoria.app' });
  assert.strictEqual(instagramVisiblePara(REVISOR), true);
  assert.strictEqual(instagramVisiblePara(CLIENTE), false);
});

prueba('varias cuentas separadas por coma, con espacios de más', () => {
  entorno({ INSTAGRAM_CUENTAS_PRUEBA: ' revisormeta@usenotoria.app , padkar4@gmail.com ' });
  assert.strictEqual(instagramVisiblePara(REVISOR), true);
  assert.strictEqual(instagramVisiblePara({ email: 'padkar4@gmail.com' }), true);
  assert.strictEqual(instagramVisiblePara(CLIENTE), false);
});

prueba('el correo se compara sin distinguir mayúsculas', () => {
  entorno({ INSTAGRAM_CUENTAS_PRUEBA: 'RevisorMeta@UseNotoria.app' });
  assert.strictEqual(instagramVisiblePara({ email: 'revisormeta@usenotoria.app' }), true);
  assert.strictEqual(instagramVisiblePara({ email: 'REVISORMETA@USENOTORIA.APP' }), true);
});

prueba('INSTAGRAM_ACTIVO=true lo abre para todos', () => {
  entorno({ INSTAGRAM_ACTIVO: 'true' });
  assert.strictEqual(instagramVisiblePara(CLIENTE), true);
  assert.strictEqual(activoParaTodos(), true);
});

prueba('solo el literal "true" activa: ni "1", ni "sí", ni "TRUE"', () => {
  for (const valor of ['1', 'si', 'sí', 'TRUE', 'yes', '']) {
    entorno({ INSTAGRAM_ACTIVO: valor });
    assert.strictEqual(instagramVisiblePara(CLIENTE), false, `"${valor}" no debería activar`);
  }
});

prueba('usuario ausente, sin email o con email vacío no revienta ni pasa', () => {
  entorno({ INSTAGRAM_CUENTAS_PRUEBA: 'revisormeta@usenotoria.app' });
  assert.strictEqual(instagramVisiblePara(undefined), false);
  assert.strictEqual(instagramVisiblePara(null), false);
  assert.strictEqual(instagramVisiblePara({}), false);
  assert.strictEqual(instagramVisiblePara({ email: '' }), false);
  assert.strictEqual(instagramVisiblePara({ email: '   ' }), false);
});

prueba('una lista vacía no deja pasar a quien tenga email vacío', () => {
  // Fallo clásico del split(','): ''.split(',') === [''] y un email vacío
  // acabaría dentro de la lista. El filter(Boolean) del módulo lo evita.
  entorno({ INSTAGRAM_CUENTAS_PRUEBA: ',, ,' });
  assert.strictEqual(instagramVisiblePara({ email: '' }), false);
  assert.strictEqual(instagramVisiblePara(CLIENTE), false);
});

console.log('\nEfecto sobre las fuentes de menciones');

// Se recarga el módulo porque captura `instagramVisiblePara` al requerirse.
const { fuentesDisponibles, hayFuenteDisponible } = require('../src/lib/menciones');

prueba('con credenciales de Meta pero oculto, Menciones no existe', () => {
  // Este es el caso REAL de hoy: las llaves están en Railway, así que sin el
  // interruptor la sección se le mostraría a todo el mundo — y su única fuente
  // es Instagram.
  entorno({ META_APP_ID: 'app', META_APP_SECRET: 'secreto' });
  assert.deepStrictEqual(fuentesDisponibles(CLIENTE), []);
  assert.strictEqual(hayFuenteDisponible(CLIENTE), false);
});

prueba('la cuenta de prueba sí tiene la fuente de Instagram', () => {
  entorno({
    META_APP_ID: 'app',
    META_APP_SECRET: 'secreto',
    INSTAGRAM_CUENTAS_PRUEBA: 'revisormeta@usenotoria.app',
  });
  assert.deepStrictEqual(fuentesDisponibles(REVISOR), [{ id: 'INSTAGRAM', nombre: 'Instagram' }]);
  assert.strictEqual(hayFuenteDisponible(REVISOR), true);
  assert.strictEqual(hayFuenteDisponible(CLIENTE), false);
});

prueba('al aprobar la revisión, la fuente se enciende para todos', () => {
  entorno({ META_APP_ID: 'app', META_APP_SECRET: 'secreto', INSTAGRAM_ACTIVO: 'true' });
  assert.strictEqual(hayFuenteDisponible(CLIENTE), true);
});

prueba('sin credenciales de Meta no hay fuente ni con el interruptor abierto', () => {
  entorno({ INSTAGRAM_ACTIVO: 'true' });
  assert.strictEqual(hayFuenteDisponible(REVISOR), false);
});

Object.assign(process.env, ENV_ORIGINAL);
console.log(`\n${ok}/12 comprobaciones\n`);
