// brand-shield/scripts/prueba-emisor.js
// Comprueba que el domicilio del emisor no se puede cambiar A MEDIAS.
//
//   node scripts/prueba-emisor.js
//
// EL FALLO QUE ESTO IMPIDE. `ublInvoice.js` manda calle, ubigeo, distrito,
// provincia y departamento al mismo bloque del XML, y SUNAT los contrasta contra
// la ficha RUC. Hasta el 2026-08-22 solo `direccion` y `ubigeo` se podian
// sobreescribir por variable de entorno, y los otros tres estaban fijos en el
// codigo — asi que mudar el domicilio fiscal y poner esas dos variables (que es
// justo lo que parece suficiente) producia comprobantes con la calle nueva y el
// distrito viejo.
//
// Y ese fallo no se ve al desplegar: se ve en el CDR del primer comprobante
// real, con un mensaje que no dice cual de los cinco campos esta mal, y despues
// de haber gastado un numero de una serie que no admite huecos.
//
// ⚠️ Este script se corre AL TOCAR el domicilio fiscal, junto con
// prueba-comprobantes.js y prueba-xml-firma.js.

const { execFileSync } = require('child_process');
const path = require('path');

let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

// Cada caso se ejecuta en un proceso APARTE: `tributario.js` lee process.env al
// cargarse, y require() cachea el modulo. Sin proceso nuevo, el segundo caso
// leeria el emisor que construyo el primero y las pruebas se mentirian entre si.
const conEntorno = (env) => {
  const codigo = `
    const t = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'lib', 'tributario.js'))});
    console.log(JSON.stringify({ error: t.validarEmisor(), emisor: t.EMISOR }));
  `;
  const salida = execFileSync(process.execPath, ['-e', codigo], {
    env: { ...process.env, ...env, NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  return JSON.parse(salida.trim().split('\n').pop());
};

const DOMICILIO_COMPLETO = {
  EMISOR_DIRECCION: 'AV. NUEVA 456 OFICINA 302',
  EMISOR_UBIGEO: '150122',
  EMISOR_DISTRITO: 'MIRAFLORES',
  EMISOR_PROVINCIA: 'LIMA',
  EMISOR_DEPARTAMENTO: 'LIMA',
};

// Quita del entorno heredado las cinco variables, para que un .env cargado en la
// maquina no falsee los casos.
const SIN_DOMICILIO = Object.fromEntries(Object.keys(DOMICILIO_COMPLETO).map((k) => [k, '']));

const correr = () => {
  bloque('1. Sin variables: se usa el domicilio de la ficha RUC que hay en el codigo');
  let r = conEntorno(SIN_DOMICILIO);
  check('no hay error', r.error === null, r.error || '');
  check('la calle es la de la ficha', r.emisor.direccion.includes('ISLA FILIPINAS'), r.emisor.direccion);
  check('el ubigeo es 070104 (La Perla, Callao)', r.emisor.ubigeo === '070104', r.emisor.ubigeo);
  check('el distrito acompana a la calle', r.emisor.distrito === 'LA PERLA', r.emisor.distrito);

  bloque('2. Domicilio completo por entorno: se usa entero');
  r = conEntorno({ ...SIN_DOMICILIO, ...DOMICILIO_COMPLETO });
  check('no hay error', r.error === null, r.error || '');
  check('la calle es la nueva', r.emisor.direccion === DOMICILIO_COMPLETO.EMISOR_DIRECCION, r.emisor.direccion);
  check('el distrito TAMBIEN cambio', r.emisor.distrito === 'MIRAFLORES', r.emisor.distrito);
  check('la provincia TAMBIEN cambio', r.emisor.provincia === 'LIMA', r.emisor.provincia);
  check('el departamento TAMBIEN cambio', r.emisor.departamento === 'LIMA', r.emisor.departamento);

  bloque('3. A MEDIAS: el caso que rechazaria SUNAT');
  r = conEntorno({ ...SIN_DOMICILIO, EMISOR_DIRECCION: DOMICILIO_COMPLETO.EMISOR_DIRECCION, EMISOR_UBIGEO: DOMICILIO_COMPLETO.EMISOR_UBIGEO });
  check('validarEmisor() lo detecta', typeof r.error === 'string' && r.error.length > 0,
    'sin esto se emitiria la calle nueva con el distrito viejo');
  check('  …y dice cuales faltan', /EMISOR_DISTRITO/.test(r.error || ''), r.error || '');
  check('  …y NO mezcla: se queda con el domicilio del codigo, coherente',
    r.emisor.direccion.includes('ISLA FILIPINAS') && r.emisor.distrito === 'LA PERLA',
    'mezclar seria peor que ignorar el cambio');

  bloque('4. Una sola variable suelta tampoco pasa');
  r = conEntorno({ ...SIN_DOMICILIO, EMISOR_DISTRITO: 'MIRAFLORES' });
  check('se detecta', typeof r.error === 'string' && r.error.length > 0, r.error || 'no detecto nada');
  check('el distrito NO se aplica solo', r.emisor.distrito === 'LA PERLA', r.emisor.distrito);

  bloque('5. Formato del ubigeo');
  r = conEntorno({ ...SIN_DOMICILIO, ...DOMICILIO_COMPLETO, EMISOR_UBIGEO: '07011' });
  check('un ubigeo de 5 digitos se rechaza', /ubigeo/.test(r.error || ''), r.error || 'no detecto nada');
  check('  …y explica que 07011 es el CODIGO POSTAL, no el ubigeo INEI',
    /postal/i.test(r.error || ''), r.error || '');

  bloque('6. RUC');
  r = conEntorno({ ...SIN_DOMICILIO, EMISOR_RUC: '123' });
  check('un RUC que no mide 11 digitos se rechaza', /RUC/.test(r.error || ''), r.error || 'no detecto nada');

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr();
