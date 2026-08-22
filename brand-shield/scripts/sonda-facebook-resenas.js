// brand-shield/scripts/sonda-facebook-resenas.js
// ¿Existe todavia la API de resenas de paginas de Facebook, y que pide?
//
//   railway run --service api node scripts/sonda-facebook-resenas.js
//
// POR QUE ESTA SONDA VA ANTES QUE EL CODIGO. El scraper de Facebook es un stub
// escrito contra la API de la epoca en que las paginas tenian estrellas
// (`overall_star_rating`, `/ratings` con `rating` y `review_text`). Facebook
// cambio a Recomendaciones (si/no) en 2018 y desde entonces ha ido cerrando el
// acceso. Escribir el cliente sin comprobar esto seria repetir exactamente el
// error de `obtenerComentariosTikTok`: se escribio a ciegas contra un endpoint
// inexistente, paso las pruebas con mocks y aparento funcionar durante meses.
//
// Se usa un APP ACCESS TOKEN: es gratis, no autoriza nada y no necesita que
// nadie conecte su pagina. No sirve para LEER datos de una pagina ajena, pero si
// para que Meta procese la peticion y conteste QUE le falta — que es justo lo
// que hay que saber antes de decidir.
//
// COMO SE LEE EL RESULTADO:
//   · «Unknown fields» / «nonexisting field»  → el campo YA NO EXISTE
//   · «requires ... permission»               → existe, y dice cual hace falta
//   · «does not exist / cannot be loaded»     → es por el ID inventado, no por
//                                               el campo: ese campo sigue vivo

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const V = process.env.META_GRAPH_VERSION || 'v21.0';

// Un ID que no es de nadie. Sirve para que Meta valide la FORMA de la peticion.
const ID_INVENTADO = '100000000000001';

const consultar = async (ruta, params, token) => {
  const url = new URL(`https://graph.facebook.com/${V}/${ruta}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const cuerpo = await res.json();
  return { status: res.status, error: cuerpo.error, datos: cuerpo.data };
};

const clasificar = (error) => {
  if (!error) return ['✅', 'respondio sin error'];
  const m = error.message || '';
  if (/nonexisting field|Unknown fields|no field/i.test(m)) return ['❌', 'EL CAMPO YA NO EXISTE'];
  if (/does not exist|cannot be loaded|Unsupported get request/i.test(m)) {
    return ['✅', 'el campo existe (falla por el ID inventado, que es lo esperado)'];
  }
  if (/permission|access token/i.test(m)) return ['🔑', 'existe, pero pide permisos'];
  return ['⚪', 'respuesta que hay que leer entera'];
};

(async () => {
  if (!APP_ID || !APP_SECRET) {
    console.error('Faltan META_APP_ID / META_APP_SECRET');
    process.exit(1);
  }

  const t = await fetch(
    `https://graph.facebook.com/${V}/oauth/access_token`
    + `?client_id=${APP_ID}&client_secret=${APP_SECRET}&grant_type=client_credentials`,
  ).then((r) => r.json());
  if (!t.access_token) {
    console.error('No se pudo obtener app access token:', JSON.stringify(t.error || t));
    process.exit(1);
  }
  const token = t.access_token;
  console.log(`Graph API ${V} — sondeando con app access token\n`);

  const casos = [
    ['campo overall_star_rating (el que usa el stub)', ID_INVENTADO, { fields: 'overall_star_rating' }],
    ['campo rating_count (el que usa el stub)', ID_INVENTADO, { fields: 'rating_count' }],
    ['edge /ratings con campos del stub', `${ID_INVENTADO}/ratings`, { fields: 'reviewer,rating,review_text,created_time' }],
    ['edge /ratings con campos modernos', `${ID_INVENTADO}/ratings`, { fields: 'reviewer,recommendation_type,review_text,created_time' }],
    ['edge /ratings pelado', `${ID_INVENTADO}/ratings`, {}],
    ['control: campo inventado (asi suena un campo muerto)', ID_INVENTADO, { fields: 'campo_que_no_existe_xyz' }],
  ];

  for (const [nombre, ruta, params] of casos) {
    try {
      const r = await consultar(ruta, params, token);
      const [icono, veredicto] = clasificar(r.error);
      console.log(`${icono} ${nombre}`);
      console.log(`   ${veredicto}`);
      if (r.error) console.log(`   codigo ${r.error.code}${r.error.error_subcode ? '/' + r.error.error_subcode : ''}: ${r.error.message}`);
      console.log('');
    } catch (e) {
      console.log(`⚠️  ${nombre}\n   fallo de red: ${e.message}\n`);
    }
  }

  console.log('El CONTROL de abajo es la clave: si un campo inventado suena igual');
  console.log('que los del stub, la sonda no distingue y no prueba nada.');
})();
