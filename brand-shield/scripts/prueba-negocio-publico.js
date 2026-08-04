// Prueba del saneador `src/lib/negocioPublico.js` SIN levantar el servidor ni
// tocar la BD.
//
// Existe porque este módulo es lo único que separa los access tokens de las redes
// sociales del navegador del cliente. Si alguien lo rompe, la fuga vuelve en
// silencio: la app sigue funcionando igual y el token viaja de más.
//
// La prueba 9 es la importante a futuro: lee `prisma/schema.prisma` y falla si
// aparece un campo secreto nuevo en el modelo `Negocio` que no esté en
// CAMPOS_SECRETOS. Es la red que compensa que la lista sea un denylist.
//
// Correr:  node scripts/prueba-negocio-publico.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { negocioPublico, negociosPublicos, CAMPOS_SECRETOS } = require('../src/lib/negocioPublico');

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

// Un negocio como lo devuelve Prisma, con todo conectado y valores de token
// reconocibles para poder buscarlos en la salida.
const negocioCompleto = () => ({
  id: 'neg_1',
  nombre: 'Cevichería El Muelle',
  tipo: 'RESTAURANTE',
  activo: true,
  googlePlaceId: 'ChIJ_place',
  facebookPageId: '1122334455',
  facebookAccessToken: 'SECRETO_FB',
  instagramUserId: 'ig_999',
  instagramAccessToken: 'SECRETO_IG',
  tiktokOpenId: 'tt_open_1',
  tiktokAccessToken: 'SECRETO_TT',
  tiktokRefreshToken: 'SECRETO_TT_REFRESH',
  tiktokNombre: 'El Muelle',
  tiktokAvatar: 'https://cdn/avatar.jpg',
  gbpAccessToken: 'SECRETO_GBP',
  gbpRefreshToken: 'SECRETO_GBP_REFRESH',
  gbpAccountId: 'acc_1',
  gbpLocationId: 'loc_1',
  alertas: [{ id: 'a1' }],
});

const VALORES_SECRETOS = [
  'SECRETO_FB', 'SECRETO_IG', 'SECRETO_TT',
  'SECRETO_TT_REFRESH', 'SECRETO_GBP', 'SECRETO_GBP_REFRESH',
];

console.log('\nSaneador de negocios (negocioPublico)\n');

prueba('1. quita los 6 campos secretos', () => {
  const r = negocioPublico(negocioCompleto());
  for (const campo of CAMPOS_SECRETOS) {
    assert.ok(!(campo in r), `${campo} sigue presente en la respuesta`);
  }
});

prueba('2. ningún valor de token sobrevive en el JSON serializado', () => {
  // Red de seguridad contra un token escondido en un objeto anidado (include).
  const json = JSON.stringify(negocioPublico(negocioCompleto()));
  for (const secreto of VALORES_SECRETOS) {
    assert.ok(!json.includes(secreto), `el valor ${secreto} viaja al cliente`);
  }
});

prueba('3. conserva los campos que el panel sí necesita', () => {
  const r = negocioPublico(negocioCompleto());
  assert.strictEqual(r.id, 'neg_1');
  assert.strictEqual(r.nombre, 'Cevichería El Muelle');
  assert.strictEqual(r.gbpLocationId, 'loc_1');     // identificador, no credencial
  assert.strictEqual(r.facebookPageId, '1122334455');
  assert.strictEqual(r.tiktokNombre, 'El Muelle');  // perfil visible, se muestra
  assert.deepStrictEqual(r.alertas, [{ id: 'a1' }]); // las relaciones no se pierden
});

prueba('4. deriva los booleanos de conexión', () => {
  const r = negocioPublico(negocioCompleto());
  assert.strictEqual(r.gbpConectado, true);
  assert.strictEqual(r.tiktokConectado, true);
  assert.strictEqual(r.instagramConectado, true);
  assert.strictEqual(r.facebookConectado, true);
});

prueba('5. GBP a medias (token sin local elegido) NO cuenta como conectado', () => {
  const n = negocioCompleto();
  n.gbpLocationId = null;
  assert.strictEqual(negocioPublico(n).gbpConectado, false);
});

prueba('6. negocio sin ninguna red conectada da todo en false', () => {
  const r = negocioPublico({ id: 'neg_2', nombre: 'Nuevo' });
  assert.strictEqual(r.gbpConectado, false);
  assert.strictEqual(r.tiktokConectado, false);
  assert.strictEqual(r.instagramConectado, false);
  assert.strictEqual(r.facebookConectado, false);
});

prueba('7. los booleanos son boolean, no el token ni undefined', () => {
  // Si se escapara un `!!` la UI seguiría "funcionando" pero volvería a mandar
  // el token dentro del propio booleano.
  const r = negocioPublico(negocioCompleto());
  for (const b of ['gbpConectado', 'tiktokConectado', 'instagramConectado', 'facebookConectado']) {
    assert.strictEqual(typeof r[b], 'boolean', `${b} no es boolean`);
  }
});

prueba('8. null/undefined y listas se manejan sin reventar', () => {
  assert.strictEqual(negocioPublico(null), null);
  assert.strictEqual(negocioPublico(undefined), undefined);
  assert.deepStrictEqual(negociosPublicos([]), []);
  assert.deepStrictEqual(negociosPublicos(null), []);
  const lista = negociosPublicos([negocioCompleto(), negocioCompleto()]);
  assert.strictEqual(lista.length, 2);
  assert.ok(!('tiktokAccessToken' in lista[1]));
});

prueba('9. el schema no tiene campos secretos fuera de CAMPOS_SECRETOS', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const modelo = schema.match(/model Negocio \{([\s\S]*?)\n\}/);
  assert.ok(modelo, 'no se encontró el modelo Negocio en schema.prisma');

  // Cualquier cosa que huela a credencial. Deliberadamente amplio: es preferible
  // que la prueba pida agregar un campo inocuo a que deje pasar un token.
  const sospechosos = [...modelo[1].matchAll(/^\s*(\w*(?:AccessToken|RefreshToken|Secret|Password|ClientSecret)\w*)\s+/gmi)]
    .map(m => m[1]);

  const faltantes = sospechosos.filter(c => !CAMPOS_SECRETOS.includes(c));
  assert.deepStrictEqual(
    faltantes, [],
    `Campos secretos en el modelo Negocio que NO se están quitando: ${faltantes.join(', ')}. ` +
    `Agrégalos a CAMPOS_SECRETOS en src/lib/negocioPublico.js`,
  );
  assert.ok(sospechosos.length >= 6, `el detector solo encontró ${sospechosos.length} campos, ¿cambió el schema?`);
});

prueba('10. no muta el objeto original (los workers lo siguen usando)', () => {
  // negocioPublico se llama sobre el mismo objeto que el resto de la ruta puede
  // seguir usando; si borrara los tokens in-place, rompería el código de abajo.
  const original = negocioCompleto();
  negocioPublico(original);
  assert.strictEqual(original.tiktokAccessToken, 'SECRETO_TT');
  assert.strictEqual(original.gbpAccessToken, 'SECRETO_GBP');
});

console.log(`\n${ok}/10 pruebas OK\n`);
