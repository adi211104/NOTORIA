#!/usr/bin/env node
// scripts/prueba-parte-equipo.js
//
// El parte semanal para el equipo (lib/parteEquipo.js + services/…).
//
// ── Qué vigila, y por qué es distinto de las demás pruebas ───────────────────
//
// Casi todo lo que hace Notoria lo lee el DUEÑO, que no puede contrastarlo. Este
// texto lo lee el EQUIPO, que estuvo ahí: si el parte dice «cuatro clientes
// mencionaron demora» y fueron dos, quince personas lo saben a la vez y el parte
// —y de rebote el producto— pierde toda credibilidad en un lunes.
//
// De ahí que la mitad de estas comprobaciones sean sobre una sola regla: **los
// números los pone el código y la IA solo los redacta**. La otra mitad son
// silencios: que una semana floja no genere un parte de relleno.

const fs = require('fs');
const path = require('path');
const parte = require('../src/lib/parteEquipo');
const temas = require('../src/lib/temas');
const planes = require('../src/lib/planes');

let ok = 0, fallos = 0;
const check = (n, c, d = '') => { if (c) { ok++; console.log(`  ok  ${n}`); } else { fallos++; console.log(`  XX  ${n}${d ? ` -- ${d}` : ''}`); } };
const titulo = (t) => console.log(`\n${t}`);

const haceDias = (d) => new Date(Date.now() - d * 24 * 3600 * 1000);
const r = (rating, texto, dias = 1) => ({ rating, texto, fechaResena: haceDias(dias), detectadaEn: haceDias(dias) });

const NEGOCIO = { id: 'n1', nombre: 'Cevicheria El Muelle' };

// ─────────────────────────────────────────────────────────────────────────────
titulo('1. La ventana es de 7 dias hacia atras');

const mezcla = [
  r(1, 'Nos hicieron esperar media hora', 2),
  r(2, 'Mucha demora en la cocina', 3),
  r(5, 'Excelente, Karina nos atendio muy bien', 1),
  r(5, 'Riquisimo todo', 30),   // fuera de la semana
  r(1, 'Lento y frio', 20),     // fuera de la semana
];
const h = parte.hechos(mezcla, 'es');
check('solo cuenta las resenas de los ultimos 7 dias', h.total === 3, `conto ${h.total}`);
check('separa positivas y negativas', h.positivas === 1 && h.negativas === 2);
check('la ventana declara desde y hasta', h.desde instanceof Date && h.hasta instanceof Date);

// Una resena sin fecha de publicacion cae a detectadaEn, no se pierde.
const soloDetectada = [{ rating: 1, texto: 'demora', detectadaEn: haceDias(1) }, { rating: 2, texto: 'lento', detectadaEn: haceDias(1) }];
check('una resena sin fechaResena usa detectadaEn', parte.hechos(soloDetectada, 'es').total === 2);

titulo('2. Silencios: cuando NO hay parte que escribir');
// Un parte que dice "no paso nada" cada lunes ensena al equipo a ignorarlo.
check('una semana vacia no genera parte', !parte.hayAlgoQueContar(parte.hechos([], 'es')));
check('con UNA sola resena tampoco', !parte.hayAlgoQueContar(parte.hechos([r(1, 'malo')], 'es')));
check('con dos ya si', parte.hayAlgoQueContar(parte.hechos([r(1, 'demora'), r(5, 'rico')], 'es')));
check('resenas viejas no cuentan para el minimo',
  !parte.hayAlgoQueContar(parte.hechos([r(1, 'demora', 40), r(5, 'rico', 40)], 'es')));

titulo('3. Los temas salen del MISMO diccionario que el afiche y el panel');
// Si el afiche de la pared dice "demora" y el parte del WhatsApp dice otra cosa,
// el equipo deja de creerse los dos.
const conTema = parte.hechos([
  r(1, 'Nos hicieron esperar media hora'),
  r(2, 'Demasiada demora en la cocina'),
  r(2, 'Muy lento el servicio'),
  r(5, 'Todo excelente'),
], 'es');
check('detecta el tema repetido', conTema.temas[0]?.id === 'demora');
check('y lo cuenta bien', conTema.temas[0]?.veces === 3, `conto ${conTema.temas[0]?.veces}`);
check('un tema con UNA mencion no entra',
  parte.hechos([r(1, 'estaba sucio'), r(1, 'demora'), r(2, 'lento')], 'es').temas.every((t) => t.veces >= temas.MINIMO_MENCIONES));
check('los temas usan las etiquetas del diccionario compartido',
  conTema.temas[0].etiqueta === temas.TEMAS.find((t) => t.id === 'demora').es);

titulo('4. Idioma');
const enIngles = parte.hechos([r(1, 'esperamos mucho'), r(2, 'demora'), r(5, 'rico')], 'en');
check('los temas se etiquetan en ingles', enIngles.temas[0]?.etiqueta === 'slow service');
check('hay prompt en los dos idiomas', !!parte.PROMPT.es && !!parte.PROMPT.en);
const textoEs = parte.plantilla(conTema, NEGOCIO, 'es');
const textoEn = parte.plantilla(parte.hechos([
  r(1, 'we waited half an hour'), r(2, 'too much demora'), r(5, 'great'),
], 'en'), NEGOCIO, 'en');
check('la plantilla en espanol no deja ingles suelto', !/\b(review|week|focus)\b/i.test(textoEs), textoEs);
check('la plantilla en ingles no deja espanol suelto', !/\b(resena|reseña|semana|Foco)\b/i.test(textoEn), textoEn);

titulo('5. La plantilla de respaldo dice los HECHOS, no relleno');
check('nombra el negocio', textoEs.includes(NEGOCIO.nombre));
check('dice cuantas resenas hubo', /\b4 rese/.test(textoEs), textoEs);
check('nombra la queja repetida', /demora/.test(textoEs));
check('propone UN solo foco', (textoEs.match(/Foco de la semana/g) || []).length === 1);
check('son pocas lineas, reenviables', textoEs.split('\n').length <= 5);

// Sin quejas repetidas el parte felicita en vez de inventarse un problema.
const limpio = parte.plantilla(parte.hechos([r(5, 'excelente'), r(5, 'muy rico'), r(4, 'bueno')], 'es'), NEGOCIO, 'es');
check('sin quejas repetidas NO se inventa un foco', !/Foco de la semana/.test(limpio), limpio);
check('y reconoce el buen trabajo', /Buen trabajo/.test(limpio));

// ─────────────────────────────────────────────────────────────────────────────
titulo('6. La IA no puede contar: recibe las cifras YA contadas');

const msg = parte.mensajeParaIA(conTema, NEGOCIO, 'es');
check('el mensaje le da el total ya contado', /Resenas nuevas esta semana: 4|Reseñas nuevas esta semana: 4/.test(msg), msg.slice(0, 80));
// El desglose se le pasa YA en el idioma del parte ("buenas" / "para mejorar")
// y no como "4-5 estrellas": el modelo copiaba esa jerga tal cual a un mensaje
// que iba a leer un cocinero.
check('le da el desglose sin jerga de estrellas',
  /1 buenas?, 3 para mejorar/.test(msg) && !/★|estrellas/.test(msg));
check('le ordena usar esas cifras tal cual', /usa estas cifras tal cual/.test(msg));

const prompt = parte.PROMPT.es;
check('el prompt PROHIBE inventar cifras', /No inventes ni recalcules ninguna cifra/.test(prompt));
check('el prompt prohibe citar resenas textualmente', /No cites reseñas textualmente/.test(prompt));
check('el prompt prohibe nombrar clientes', /no menciones a clientes por su nombre|ni menciones a clientes/.test(prompt));
check('el prompt pide 3 o 4 lineas', /3 o 4 líneas/.test(prompt));
check('la version inglesa prohibe lo mismo',
  /Do not invent or recompute any figure/.test(parte.PROMPT.en) && /Do not quote reviews verbatim/.test(parte.PROMPT.en));

titulo('7. Sin Groq el parte SALE IGUAL');
// Una funcion que desaparece cuando falla un tercero no es una funcion.
const servicio = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'parteEquipo.service.js'), 'utf8');
check('el servicio cae a la plantilla si la IA devuelve null', /conIA \|\| parte\.plantilla\(/.test(servicio));
check('sin GROQ_API_KEY ni lo intenta', /if \(!process\.env\.GROQ_API_KEY\) return null/.test(servicio));
check('un error de Groq no propaga', /catch \(error\)[\s\S]{0,200}return null/.test(servicio));
// gpt-oss sin esto devuelve content vacio y finish_reason "length" (ver seccion 16).
check('la llamada lleva reasoning_effort low', /reasoning_effort: 'low'/.test(servicio));
check('descarta una respuesta desproporcionada', /texto\.length > 700/.test(servicio));
check('un fallo al cachear no tumba la respuesta', /no se pudo cachear/.test(servicio));

titulo('8. El cache acota el costo');
check('la vigencia es de una semana', require('../src/services/parteEquipo.service').VIGENCIA_MS === 7 * 24 * 3600 * 1000);
const { estaFresco } = require('../src/services/parteEquipo.service');
check('un parte de hoy esta fresco', estaFresco(new Date()));
check('uno de hace 8 dias no', !estaFresco(haceDias(8)));
check('sin fecha tampoco', !estaFresco(null));
// No debe descontar de la cuota de IA del cliente: esa es para lo que pide a mano.
// Se miran solo las lineas de CODIGO: el nombre aparece a proposito en un
// comentario del servicio explicando justamente que no se toca.
const codigoServicio = servicio.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check('NO toca el contador iaUsos del usuario', !/iaUsos/.test(codigoServicio));

titulo('9. Plan y schema');
check('GRATIS no lo tiene', !planes.puede('GRATIS', 'parteEquipo'));
check('IMPULSO si', planes.puede('IMPULSO', 'parteEquipo'));
check('NEGOCIO y FRANQUICIA tambien',
  planes.puede('NEGOCIO', 'parteEquipo') && planes.puede('FRANQUICIA', 'parteEquipo'));

const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
check('el schema tiene las dos columnas de cache',
  /parteEquipo\s+String\?/.test(schema) && /parteEquipoFecha\s+DateTime\?/.test(schema));
check('el texto va como @db.Text, no como varchar', /parteEquipo\s+String\?\s+@db\.Text/.test(schema));

const ruta = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'routes', 'negocio.routes.js'), 'utf8');
check('la ruta va detras de la capacidad del plan', /verificarPlan\(planesCon\('parteEquipo'\)\)/.test(ruta));
check('responde 409 SIN_MATERIAL cuando no hay parte', /SIN_MATERIAL/.test(ruta));
check('devuelve los hechos para poder auditarlo', /hechos: \{/.test(ruta));

titulo('10. El saneador: lo que el prompt pide y el modelo no cumple');
// Medido contra resenas reales: pese a prohibirselo expresamente, el modelo
// escribia "No hay elogios por nombre" y colaba jerga de estrellas. Un modelo de
// 20B no cumple prohibiciones de forma fiable, asi que se le quita despues.
// La regla: para que el modelo HAGA algo, el prompt; para que NO haga algo, codigo.
const limpio2 = (x) => parte.sanear(x);
check('quita la frase que informa de una ausencia',
  !/no hay elogios/i.test(limpio2('Van 6 resenas, 4 buenas. No hay elogios por nombre, seguimos. Foco: el arroz.')));
check('la quita tambien en ingles',
  !/praised by name/i.test(limpio2('Good week. No staff member was praised by name. Focus on speed.')));
check('quita la jerga de estrellas suelta',
  !/\u2605/.test(limpio2('Enfoquense en que ese plato sea un 5\u2605.')));
check('quita el rango CON su conector, sin dejar un "de" colgando',
  !/\bde\s+y\b/.test(limpio2('Tuvimos 6 de 4-5\u2605 y 2 de 1-3 estrellas.')));
check('deja espacio tras el punto al borrar una frase',
  !/[.!?][A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1]/.test(limpio2('Van 6 resenas. No hay elogios por nombre. Foco: el arroz.')));
const intacto = 'Buenas equipo, 5 resenas, 4 buenas y 1 para mejorar. Karina salio nombrada dos veces. Foco: puntualidad.';
check('NO toca un elogio real por nombre', limpio2(intacto) === intacto);
const limpioOk = 'Buenas equipo, la semana salio limpia: 8 resenas y todas buenas. Sigamos asi.';
check('NO toca un parte que ya estaba bien', limpio2(limpioOk) === limpioOk);

titulo('11. La guarda de cifras: la IA no puede PUBLICAR un conteo falso');
// El prompt es una peticion; esto es una garantia. Si un conteo no cuadra con
// los hechos, el parte se tira entero y sale la plantilla.
const hh = { total: 6, positivas: 4, negativas: 2, temas: [{ veces: 3 }] };
check('deja pasar los conteos correctos',
  parte.cifrasCoherentes('Tuvimos 6 resenas, 4 buenas y 2 para mejorar. 3 clientes mencionaron demora.', hh));
check('descarta un total inventado', !parte.cifrasCoherentes('Tuvimos 9 resenas esta semana.', hh));
check('descarta clientes inventados', !parte.cifrasCoherentes('6 resenas. 5 clientes mencionaron demora.', hh));
check('descarta en ingles tambien', !parte.cifrasCoherentes('We had 12 reviews this week.', hh));
// Solo mira CONTEOS: que recoja "espero 45 minutos" de una resena es correcto.
check('un numero que NO es conteo no descarta el parte',
  parte.cifrasCoherentes('6 resenas, 4 buenas. Un cliente espero 45 minutos en la barra.', hh));
check('sin hechos no descarta nada', parte.cifrasCoherentes('lo que sea', null));

const servicio2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'parteEquipo.service.js'), 'utf8');
check('el servicio sanea la salida antes de usarla', /parte\.sanear\(crudo\)/.test(servicio2));
check('y descarta el parte si las cifras no cuadran', /cifrasCoherentes\(texto, hechos\)/.test(servicio2));

// Un \b mal escapado escribio un 0x08 literal dentro de una regex y la dejo sin
// casar NUNCA, en silencio. sed lo mostraba como si estuviera bien.
const fuenteLib = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'parteEquipo.js'), 'utf8');
check('el fuente no tiene bytes de control invisibles',
  !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fuenteLib));

console.log('\n' + '-'.repeat(50));
console.log(`${ok} pasadas / ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
