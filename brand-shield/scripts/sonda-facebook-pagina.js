// brand-shield/scripts/sonda-facebook-pagina.js
// Pregunta a la Graph API que queda VIVO de las resenas de una pagina, usando un
// token de pagina de verdad. No escribe nada, no guarda nada, no autoriza nada.
//
//   node scripts/sonda-facebook-pagina.js
//
// El token se pide por teclado y NO se muestra ni se guarda: no queda en el
// historial de bash ni en ningun archivo. Lo unico que sale por pantalla son
// veredictos, asi que la salida se puede pegar en un chat sin problema.
//
// POR QUE HACE FALTA UN TOKEN DE PAGINA. Con app access token se puede saber que
// el edge /ratings existe, y poco mas: Meta falla por permisos del objeto ANTES
// de mirar los campos, asi que un campo inventado suena igual que `name`. Para
// distinguir «el campo no existe» de «no tengo permiso» y de «no hay resenas»
// hace falta un token que si pueda leer la pagina.
//
// COMO SACAR EL TOKEN (4 clics, no toca la configuracion de la app):
//   1. https://developers.facebook.com/tools/explorer/
//   2. Arriba a la derecha: Meta App = Notoria
//   3. User or Page = Get Page Access Token, y elige tu pagina
//   4. En Permissions anade `pages_read_engagement` y pulsa Generate Access Token
//   5. Copia el token y pegalo cuando este script lo pida
//
// El token del Explorer dura unas horas y es de solo lectura para lo que hace
// esta sonda. No hace falta guardarlo en ningun sitio.

const readline = require('readline');

const V = 'v21.0';

const pedirToken = () => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write('Pega el token de PAGINA y pulsa Enter (no se vera en pantalla):\n> ');
  // Silencia el eco: el token no aparece ni en la terminal ni en una captura.
  rl._writeToOutput = () => {};
  rl.question('', (valor) => {
    rl.close();
    process.stdout.write('\n');
    resolve((valor || '').trim());
  });
});

const consultar = async (ruta, params, token) => {
  const url = new URL(`https://graph.facebook.com/${V}/${ruta}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const cuerpo = await res.json();
  return { status: res.status, error: cuerpo.error, cuerpo };
};

const veredicto = (r) => {
  if (!r.error) return null;
  const m = r.error.message || '';
  if (/nonexisting field|Unknown fields|no field/i.test(m)) return ['❌', 'EL CAMPO NO EXISTE'];
  if (/permission|#3\)|not have the capability|requires/i.test(m)) return ['🔑', 'existe, pero falta permiso'];
  if (/deprecat/i.test(m)) return ['⚠️', 'DEPRECADO'];
  return ['⚪', 'otro error, leerlo entero'];
};

const probar = async (etiqueta, ruta, params, token) => {
  try {
    const r = await consultar(ruta, params, token);
    const v = veredicto(r);
    if (!v) {
      const datos = r.cuerpo.data;
      const resumen = Array.isArray(datos)
        ? `lista con ${datos.length} elemento(s)`
        : JSON.stringify(r.cuerpo).slice(0, 120);
      console.log(`✅ ${etiqueta}\n   RESPONDE: ${resumen}`);
    } else {
      console.log(`${v[0]} ${etiqueta}\n   ${v[1]}\n   codigo ${r.error.code}: ${(r.error.message || '').slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`⚠️  ${etiqueta}\n   fallo de red: ${e.message}`);
  }
  console.log('');
};

// 🔴 LA LLAMADA QUE ACABA CON LA ESPECULACION, y que habria que hacer PRIMERO en
// cualquier duda sobre la Graph API: `?metadata=1` devuelve el TIPO del objeto y
// la lista completa de sus campos y conexiones. En vez de adivinar si un campo
// existe probandolo de uno en uno —y arriesgarse a confundir «no existe» con «no
// tengo permiso» o con «este objeto no es lo que creo»—, Meta enumera lo que hay.
const introspeccion = async (token) => {
  console.log('══ QUE ES ESTE OBJETO, SEGUN META ══\n');
  try {
    const r = await consultar('me', { metadata: '1', fields: 'id,name' }, token);
    if (r.error) {
      console.log(`⚠️  metadata no disponible: ${r.error.message}`);
      return;
    }
    const meta = r.cuerpo.metadata || {};
    console.log(`TIPO DEL OBJETO: ${meta.type || '(no lo dice)'}`);

    const conexiones = Object.keys(meta.connections || {});
    console.log(`\nCONEXIONES disponibles (${conexiones.length}):`);
    console.log('  ' + (conexiones.join(', ') || '(ninguna)'));

    const campos = (meta.fields || []).map((f) => f.name);
    console.log(`\nCAMPOS disponibles (${campos.length}):`);
    console.log('  ' + (campos.join(', ') || '(ninguno)'));

    console.log('\n── VEREDICTO SOBRE RESENAS ──');
    for (const clave of ['ratings', 'recommendations', 'reviews']) {
      console.log(`  conexion "${clave}": ${conexiones.includes(clave) ? '✅ EXISTE' : '❌ no esta en la lista'}`);
    }
    for (const clave of ['overall_star_rating', 'rating_count']) {
      console.log(`  campo "${clave}": ${campos.includes(clave) ? '✅ EXISTE' : '❌ no esta en la lista'}`);
    }
  } catch (e) {
    console.log(`⚠️  fallo de red: ${e.message}`);
  }
  console.log('\n══════════════════════════════════════════════════════\n');
};

(async () => {
  const token = await pedirToken();
  if (!token) { console.error('Sin token. No se consulta nada.'); process.exit(1); }
  if (/[^\x20-\x7E]/.test(token)) {
    console.error('El token trae caracteres invisibles (se colaron al copiar). Vuelve a copiarlo.');
    process.exit(1);
  }

  console.log(`Graph API ${V} — con token de pagina\n`);

  // Lo primero, porque puede hacer innecesario todo lo demas.
  await introspeccion(token);

  // 1. ¿De quien es este token? Si no es una pagina, el resto no significa nada.
  await probar('¿de quien es el token?', 'me', { fields: 'id,name' }, token);

  // 🔴 CONTROL DE TIPO. Que `me` responda no prueba que sea una PAGINA: un token
  // de perfil tambien responde id y name, y «los perfiles no tienen ratings» no
  // dice absolutamente nada sobre las paginas. Ese fue el error de la sonda con
  // ID inventado: Meta lo trato como usuario y contesto que /ratings no existe.
  //
  // `category` y `fan_count` solo existen en paginas. Si estos responden, el
  // objeto es una pagina y entonces —y solo entonces— «overall_star_rating no
  // existe» significa que no existe PARA PAGINAS.
  await probar('CONTROL DE TIPO: ¿es una pagina? (category, fan_count)', 'me',
    { fields: 'category,fan_count' }, token);
  await probar('CONTROL: otro campo que solo tienen las paginas (link, followers_count)', 'me',
    { fields: 'link,followers_count' }, token);
  await probar('CONTROL: edge /posts, que si existe en paginas', 'me/posts', { limit: '1' }, token);

  // 2. Los campos que usa el stub para el rating general.
  await probar('campo overall_star_rating (lo usa el stub)', 'me', { fields: 'overall_star_rating' }, token);
  await probar('campo rating_count (lo usa el stub)', 'me', { fields: 'rating_count' }, token);

  // 3. 🔴 CONTROL. Si un campo inventado suena igual que los de arriba, esta
  //    sonda no distingue nada y sus veredictos no valen. Sin esta linea, las
  //    dos sondas anteriores dieron conclusiones falsas en las dos direcciones.
  await probar('CONTROL: campo inventado (deberia decir NO EXISTE)', 'me', { fields: 'campo_inventado_xyz' }, token);

  // 4. El edge de resenas, con los campos del stub y con los modernos.
  await probar('/ratings pelado', 'me/ratings', {}, token);
  await probar('/ratings con campos del stub (era de las estrellas)', 'me/ratings',
    { fields: 'reviewer,rating,review_text,created_time' }, token);
  await probar('/ratings con campos modernos (recomendaciones)', 'me/ratings',
    { fields: 'reviewer,recommendation_type,review_text,created_time,open_graph_story' }, token);

  console.log('──────────────────────────────────────────────────────');
  console.log('Como leer esto, en este orden:');
  console.log('');
  console.log('1. ¿El CONTROL DE TIPO responde con datos?');
  console.log('   NO  -> el token no es de una pagina y NADA de lo de abajo vale.');
  console.log('          Vuelve al Explorer y elige "Get Page Access Token".');
  console.log('   SI  -> es una pagina, y entonces el resto significa algo.');
  console.log('');
  console.log('2. ¿La sonda distingue? Hay que ver las dos puntas:');
  console.log('   · `id,name` y los CONTROL responden con datos  = positivo conocido');
  console.log('   · el campo inventado dice NO EXISTE            = negativo conocido');
  console.log('   Con esas dos, un veredicto sobre overall_star_rating vale.');
  console.log('   Si TODO suena igual, la sonda no prueba nada.');
  console.log('');
  console.log('3. En /ratings, «lista con 0 elemento(s)» NO es lo mismo que un error:');
  console.log('   significa que la API responde y la pagina no tiene resenas.');
})();
