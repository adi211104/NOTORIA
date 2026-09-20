// brand-shield/scripts/prueba-temas.js
// Pruebas del diccionario de quejas por rubro. Puro: no toca base, red ni Groq.
//
//   node scripts/prueba-temas.js
//
// QUÉ SE VIGILA ACÁ
// ─────────────────
// Que el diccionario **le hable a cada rubro en su idioma**. El fallo que esto
// viene a cerrar era mudo y del peor tipo: un tema exige 2 menciones, así que a
// una peluquería no le salía ninguno, `masRepetido` devolvía `null`, el afiche
// perdía su línea de foco y la tarjeta del panel no se renderizaba. El cliente
// no veía un error — veía una sección vacía y concluía que en su negocio no pasa
// nada. Pagaba por una función que, para su rubro, estaba apagada sin decirlo.
//
// Y hay un segundo silencio, igual de caro: que un call-site **olvide pasar el
// rubro**. Ahí no falla nada tampoco — simplemente ese cliente vuelve al
// diccionario de restaurante. Por eso la mitad de este archivo lee el fuente.

const fs = require('fs');
const path = require('path');

let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

const temas = require('../src/lib/temas');

// 🔴 Todo barrido de fuente de este proyecto pasa por acá: un grep a secas no
// distingue una línea de código de la línea que la documenta, y estos archivos
// documentan mucho.
const sinComentarios = (txt) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const leerLimpio = (...p) => sinComentarios(leer(...p));

// Los 12 rubros que el producto deja elegir, tal como los declara la ruta.
const RUBROS = ['RESTAURANTE', 'BAR', 'CAFETERIA', 'HOTEL', 'PELUQUERIA', 'SPA',
  'GIMNASIO', 'CLINICA', 'TIENDA', 'INMOBILIARIA', 'TALLER', 'OTRO'];

const r = (rating, texto) => ({ rating, texto });

const correr = () => {
  console.log('\n🧪 Diccionario de quejas por rubro (lib/temas.js)\n');

  // ══════════════════════════════════════════════════════════
  bloque('1. El fuente de verdad de los rubros no se escribe a mano');

  const rutaNegocios = leerLimpio('src', 'api', 'routes', 'negocio.routes.js');
  const declarados = (rutaNegocios.match(/const TIPOS_NEGOCIO = \[([\s\S]*?)\]/) || [])[1] || '';
  const delProducto = [...declarados.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  check(`la ruta declara los ${RUBROS.length} rubros que esta prueba conoce`,
    delProducto.length === RUBROS.length && RUBROS.every((x) => delProducto.includes(x)),
    `la ruta tiene: ${delProducto.join(', ')}`);

  // 🔴 Un rubro nuevo no puede entrar sin que alguien decida su vocabulario. Si
  // entra sin decidirlo, hereda solo los universales y nadie se entera.
  const conVocabulario = new Set(temas.TEMAS.flatMap((t) => t.rubros || []));
  check('todo rubro con vocabulario propio existe de verdad en el producto',
    [...conVocabulario].every((x) => delProducto.includes(x)),
    `sobran: ${[...conVocabulario].filter((x) => !delProducto.includes(x)).join(', ')}`);

  // ══════════════════════════════════════════════════════════
  bloque('2. Cada rubro recibe lo suyo, y nadie recibe lo ajeno');

  const idsDe = (tipo) => temas.temasDeRubro(tipo).map((t) => t.id);
  const UNIVERSALES = temas.TEMAS.filter((t) => !t.rubros).map((t) => t.id);

  check(`hay ${UNIVERSALES.length} temas universales`, UNIVERSALES.length === 4, UNIVERSALES.join(', '));
  for (const tipo of RUBROS) {
    check(`${tipo} recibe los universales`,
      UNIVERSALES.every((u) => idsDe(tipo).includes(u)),
      'demora, trato, limpieza y precio valen en cualquier negocio');
  }

  check('PELUQUERIA recibe resultado, daño y cita', ['resultado', 'dano', 'cita'].every((x) => idsDe('PELUQUERIA').includes(x)));
  check('BAR recibe música, ingreso, seguridad y tragos', ['musica', 'acceso', 'seguridad', 'tragos'].every((x) => idsDe('BAR').includes(x)));
  check('HOTEL recibe ruido, habitación, servicios y reserva', ['descanso', 'habitacion', 'servicios', 'reserva'].every((x) => idsDe('HOTEL').includes(x)));
  check('RESTAURANTE conserva temperatura y porción', ['temperatura', 'porcion'].every((x) => idsDe('RESTAURANTE').includes(x)));

  // 🔴 Lo que NO debe pasar: hablarle de comida a quien no vende comida.
  for (const tipo of ['PELUQUERIA', 'SPA', 'GIMNASIO', 'CLINICA', 'TIENDA', 'INMOBILIARIA', 'TALLER', 'HOTEL']) {
    check(`${tipo} NO recibe vocabulario de comida`,
      !idsDe(tipo).includes('temperatura') && !idsDe(tipo).includes('porcion'),
      '«la comida llegó fría» en una peluquería es una queja que no puede existir');
  }
  check('una peluquería tampoco recibe el vocabulario de bar',
    !idsDe('PELUQUERIA').includes('musica') && !idsDe('PELUQUERIA').includes('acceso'));

  // Los rubros sin vocabulario propio: exactamente los universales, ni más ni menos.
  for (const tipo of ['GIMNASIO', 'TIENDA', 'INMOBILIARIA', 'TALLER', 'OTRO']) {
    check(`${tipo} recibe SOLO los universales (4 temas honestos, no 6 inútiles)`,
      idsDe(tipo).length === UNIVERSALES.length);
  }

  // ⚠️ Sin rubro devuelve TODOS: es el comportamiento anterior, para que un
  // call-site olvidado añada ruido en vez de producir silencio.
  check('sin rubro devuelve todos los temas (compatibilidad hacia atrás)',
    temas.temasDeRubro(null).length === temas.TEMAS.length
    && temas.temasDeRubro(undefined).length === temas.TEMAS.length,
    'el olvido tiene que fallar hacia el ruido, nunca hacia el silencio');

  // ══════════════════════════════════════════════════════════
  bloque('3. El caso que originó esto: la peluquería que no veía nada');

  // Frases REALES de reseñas de salones y barberías de Lima, leídas el
  // 2026-09-20. No están inventadas — es el motivo por el que el diccionario
  // funciona, y si alguien cambia las palabras, esto es lo que lo caza.
  const salon = [
    r(1, 'Me hicieron un corte en varias capas, cosa que en ningún momento pedí'),
    r(1, 'Fui para hacerme un balayage, me quemaron el cabello. No quedo como queria'),
    r(1, 'Pedí repetidas veces que no me hicieran capas, pero lo hicieron. Mal hecho'),
    r(1, 'Me tuvieron esperando más de 40 minutos sin atender mi cita ni informar'),
    r(2, 'El peor corte de mi vida, cada lado tiene un largo diferente'),
  ];

  // ⚠️ El control correcto es aplicarle el diccionario de RESTAURANTE, que son
  // exactamente los seis temas que existían antes — no «sin rubro», que hoy
  // devuelve todos los temas nuevos incluidos y por tanto no reproduce nada.
  // La primera versión de este check usaba `null` y daba rojo con razón.
  const antes = temas.masRepetido(salon, 'es', 'RESTAURANTE');
  const ahora = temas.masRepetido(salon, 'es', 'PELUQUERIA');
  check('CONTROL — con el diccionario de restaurante el salón no saca NADA',
    antes === null,
    'esto es exactamente lo que veía el cliente: una sección vacía');
  check('CONTROL — y los seis temas de restaurante son los que había antes',
    temas.temasDeRubro('RESTAURANTE').length === 6);
  check('con su rubro, el salón SÍ saca su queja',
    ahora !== null, `devolvió: ${ahora}`);
  check('y la queja es «el resultado del servicio», que es la que de verdad domina',
    ahora === 'el resultado del servicio', `devolvió: ${ahora}`);

  const dSalon = temas.distribucion(salon, 'es', 'PELUQUERIA');
  check('el salón saca más de un tema', dSalon.temas.length >= 2, dSalon.temas.map((t) => t.id).join(', '));
  check('y cada tema viaja con ejemplos para poder discutirlo',
    dSalon.temas.every((t) => t.ejemplos.length >= 1));

  // ══════════════════════════════════════════════════════════
  bloque('4. Frases reales de cada rubro, que es de donde salió el vocabulario');

  const casos = [
    ['PELUQUERIA', 'Dejaron mi cabello seco al tacto y sin movimiento', 'dano'],
    ['PELUQUERIA', 'habíamos quedado a una hora fija, pero nadie llegó', 'cita'],
    ['BAR', 'la seguridad no te dejará pasar sin un código QR', 'acceso'],
    ['BAR', 'No me dejaron entrar porque llevaba pantalones cortos', 'acceso'],
    ['BAR', 'la música fue un desastre, las mezclas no tenían sentido', 'musica'],
    ['BAR', 'los cócteles estaban mal preparados', 'tragos'],
    ['BAR', 'me robaron el celular dentro del local', 'seguridad'],
    ['HOTEL', 'El personal hace demasiada bulla. No dejaron descansar', 'descanso'],
    ['HOTEL', 'las camas se ven muy sucias, quiero imaginar que no hay chinches', 'habitacion'],
    ['HOTEL', 'el agua caliente no funciona y el wifi tampoco', 'servicios'],
    ['RESTAURANTE', 'la comida llegó fría', 'temperatura'],
    ['RESTAURANTE', 'poca cantidad para el precio', 'porcion'],
  ];
  for (const [tipo, texto, esperado] of casos) {
    const ids = temas.temasDe(texto, tipo).map((t) => t.id);
    check(`${tipo}: «${texto.slice(0, 44)}…» → ${esperado}`, ids.includes(esperado), `dio: [${ids.join(', ')}]`);
  }

  // 🔴 La variante que faltaba desde que existe el diccionario, y que da nombre
  // al tema. A ojo las cuatro que había parecían cubrirlo todo.
  bloque('4-bis. «fría», la palabra que da nombre al tema y no estaba');
  for (const t of ['la comida llegó fría', 'el plato estaba frio', 'las papas frías', 'llegó frío']) {
    check(`«${t}» levanta temperatura`, temas.temasDe(t, 'RESTAURANTE').some((x) => x.id === 'temperatura'));
  }

  // ══════════════════════════════════════════════════════════
  bloque('5. Un texto sin quejas no inventa temas');

  check('una reseña elogiosa no levanta nada',
    temas.temasDe('Todo excelente, volveré sin dudarlo', 'PELUQUERIA').length === 0);
  check('texto vacío o nulo devuelve lista vacía',
    temas.temasDe('', 'BAR').length === 0 && temas.temasDe(null, 'BAR').length === 0);
  check('un tema con UNA sola mención no es «lo que más se repite»',
    temas.masRepetido([r(1, 'me quemaron el cabello')], 'es', 'PELUQUERIA') === null,
    `hacen falta ${temas.MINIMO_MENCIONES} menciones: una opinión suelta no es un patrón`);

  // ══════════════════════════════════════════════════════════
  bloque('6. Idioma: las etiquetas de TODOS los temas, en los dos');

  for (const t of temas.TEMAS) {
    check(`${t.id} tiene es/en, largo y corto`,
      !!(t.es && t.en && t.cortoEs && t.cortoEn) && t.es !== t.en,
      'un afiche en inglés diciendo «la demora en la atención» es el fallo de §11 y §12 otra vez');
  }
  const enSalon = temas.masRepetido(salon, 'en', 'PELUQUERIA');
  check('masRepetido respeta el idioma',
    enSalon === 'the result of the service', `devolvió: ${enSalon}`);

  // Los ids son estables: viajan al panel y a los ejemplos guardados.
  check('no hay ids repetidos', new Set(temas.TEMAS.map((t) => t.id)).size === temas.TEMAS.length);
  check('ningún tema tiene la lista de palabras vacía', temas.TEMAS.every((t) => t.palabras.length > 0));
  check('todas las palabras van en minúscula',
    temas.TEMAS.every((t) => t.palabras.every((p) => p === p.toLowerCase())),
    'temasDe() compara sobre el texto en minúscula: una mayúscula acá no casaría nunca');

  // ══════════════════════════════════════════════════════════
  bloque('7. Los SEIS call-sites pasan el rubro');

  // 🔴 Si uno lo olvida, ese cliente vuelve al diccionario de restaurante y no
  // falla nada. Es el mismo agujero que ya tuvieron `idioma`, `prefsAlertas` y
  // `localesExtra` en los selects del worker.
  const llamadas = [
    ['src/api/routes/negocio.routes.js', 'temasLib.distribucion(negativas, idioma, negocio.tipo)', 'el panel'],
    ['src/lib/parteEquipo.js', 'temasLib.distribucion(negativas, idioma, tipo)', 'el parte para el equipo'],
    ['src/services/parteEquipo.service.js', 'negocio.tipo', 'el servicio del parte'],
    ['src/utils/afiche.generator.js', 'quejaMasRepetida(negativas, idioma, tipo)', 'el afiche de la pared'],
    ['src/workers/monitoreo.worker.js', "temasLib.distribucion(recientes, 'es', negocio.tipo)", 'el diagnóstico de la alerta'],
    ['src/workers/resumenSemanal.worker.js', 'temas.distribucion(resenasNuevas, idioma, negocio.tipo)', 'el correo semanal'],
  ];
  for (const [archivo, fragmento, quien] of llamadas) {
    check(`${quien} pasa el rubro`, leerLimpio(...archivo.split('/')).includes(fragmento), archivo);
  }

  check('la tendencia del panel también lo pasa',
    /tendencia\([\s\S]{0,200}?negocio\.tipo/.test(leerLimpio('src', 'api', 'routes', 'negocio.routes.js')));
  check('la tendencia del correo semanal también',
    leerLimpio('src', 'workers', 'resumenSemanal.worker.js').includes('temas.tendencia(resenasNuevas, resenasPrevias, idioma, negocio.tipo)'));
  check('el afiche le pasa el rubro del negocio a elegirFoco',
    leerLimpio('src', 'utils', 'afiche.generator.js').includes('tipo: negocio?.tipo'));

  // CONTROL: que el barrido sepa fallar. Si esta cadena inventada apareciera,
  // es que `leerLimpio` no está leyendo lo que cree leer.
  check('CONTROL — el barrido no encuentra lo que no está',
    !leerLimpio('src', 'lib', 'parteEquipo.js').includes('temasLib.distribucion(negativas, idioma, RUBRO_INVENTADO)'));

  // ══════════════════════════════════════════════════════════
  bloque('8. El rubro tiene que LLEGAR hasta ahí');

  // De nada sirve pasar `negocio.tipo` si la consulta no lo trajo: llegaría
  // `undefined`, `temasDeRubro` devolvería todos y el fallo sería invisible.
  const panel = leerLimpio('src', 'api', 'routes', 'negocio.routes.js');
  const iResumen = panel.indexOf("router.get('/:id/resumen'");
  check('el select del panel pide `tipo`',
    panel.slice(iResumen, iResumen + 2500).includes('tipo: true'), 'si no, llega undefined');

  // Los dos workers piden el negocio COMPLETO (include, no select), así que el
  // rubro viene incluido. Lo que hay que vigilar es que nadie lo convierta en un
  // select parcial sin acordarse de añadirlo.
  // ⚠️ La sonda tiene que distinguir el `select` DEL NEGOCIO del `select`
  // anidado del usuario, que está dentro del `include` y obviamente no lleva
  // `tipo`. La primera versión no lo hacía y daba rojo sobre consultas
  // perfectamente correctas: «arreglarlo» habría sido meterle `tipo: true` al
  // select del usuario, que no tiene ningún sentido.
  //
  // La regla: si `select:` aparece ANTES que `include:`, es de primer nivel —
  // o sea, la consulta pide campos sueltos del negocio y `tipo` tiene que estar.
  for (const [archivo, nombre] of [['monitoreo.worker.js', 'el worker de monitoreo'], ['resumenSemanal.worker.js', 'el del resumen semanal']]) {
    const src = leerLimpio('src', 'workers', archivo);
    const parciales = [...src.matchAll(/prisma\.negocio\.findMany\(\{/g)]
      .map((m) => src.slice(m.index, m.index + 700).replace(/\n\s*/g, ' '))
      .filter((trozo) => {
        const iSel = trozo.indexOf('select:');
        const iInc = trozo.indexOf('include:');
        const deNegocio = iSel >= 0 && (iInc < 0 || iSel < iInc);
        return deNegocio && !trozo.includes('tipo: true');
      });
    check(`${nombre} trae el rubro del negocio`, parciales.length === 0,
      'alguna consulta pasó a select parcial del negocio sin incluir `tipo`');
  }
  // CONTROL de esa sonda: un select de primer nivel SIN tipo tiene que cazarse.
  const falso = 'prisma.negocio.findMany({ where: {}, select: { id: true, nombre: true } })';
  const iSelF = falso.indexOf('select:'); const iIncF = falso.indexOf('include:');
  check('CONTROL — la sonda del select sabe cazar uno parcial sin `tipo`',
    iSelF >= 0 && (iIncF < 0 || iSelF < iIncF) && !falso.includes('tipo: true'));

  // ══════════════════════════════════════════════════════════
  bloque('9. Lo que el diccionario NO puede hacer');

  // ⚠️ Un tema no es un veredicto: sale de que la palabra aparece, no de que la
  // queja sea cierta. Por eso cada tema viaja con ejemplos y el producto nunca
  // afirma que el negocio hizo algo mal — dice qué mencionan las reseñas.
  const elogio = [r(5, 'la música increíble'), r(5, 'la música buenísima')];
  const d = temas.distribucion(elogio, 'es', 'BAR');
  check('un diccionario NO entiende el sentido: «la música increíble» también levanta el tema',
    d.temas.some((t) => t.id === 'musica'),
    'por eso los call-sites filtran a reseñas NEGATIVAS antes de llamar, y no al revés');
  check('y por eso cada tema lleva sus ejemplos, para que sea discutible',
    d.temas[0].ejemplos.length > 0);

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr();
