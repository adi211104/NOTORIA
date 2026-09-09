// brand-shield/scripts/prueba-prefs-correo.js
//
// Pruebas de cuánto correo manda Notoria (lib/prefsCorreo.js y sus call-sites).
//
// 🔴 Todo lo de acá falla EN SILENCIO, y en la dirección peor: el correo sale, se
// entrega, y lo único que está mal es cuánto o qué dice. Nadie lo reporta.
//
//  · Si el default vuelve a ser SEMANAL, cada cuenta nueva recibe cuatro veces
//    más correo del que se decidió — y una bandeja saturada acaba en «marcar como
//    spam», que degrada la entrega de TODO lo demás, avisos críticos incluidos.
//  · Si la ventana no acompaña a la cadencia, un correo mensual cuenta 7 días y
//    le dice «0 reseñas nuevas» a un negocio que tuvo cuatro.
//  · Si el `select` del worker pierde `prefsAlertas`, todos caen al default y
//    quien eligió semanal no lo recibe nunca. Es el mismo fallo que ya tuvo
//    `idioma` en el select de las alertas.
//  · Si alguien vuelve a marcar `notificada` a ciegas, el lote de cinco no se
//    junta nunca y el plan gratuito vuelve a un correo por reseña.
//  · Si la ruta vuelve a escribir `umbralNegativas: 1` cuando no viene, guardar
//    cualquier preferencia deshace el agrupado.
//
//   node scripts/prueba-prefs-correo.js

const fs = require('fs');
const path = require('path');

const prefs = require('../src/lib/prefsCorreo');
const { ORDEN } = require('../src/lib/planes');

const RAIZ = path.join(__dirname, '..');
let ok = 0;
let fallos = 0;
const titulo = (t) => console.log(`\n── ${t}`);
const check = (que, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${que}`); } else {
    fallos++; console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ''}`);
  }
};
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

// ── 1. El default del resumen ─────────────────────────────

titulo('1. El resumen por negocio arranca en MENSUAL');

check('la cadencia por defecto es MENSUAL', prefs.CADENCIA_POR_DEFECTO === 'MENSUAL');
check('una cuenta sin preferencias (prefsAlertas null) cae en mensual',
  prefs.cadenciaResumen(null) === 'MENSUAL' && prefs.cadenciaResumen(undefined) === 'MENSUAL');
check('unas preferencias viejas SIN el bloque resumen caen en mensual',
  prefs.cadenciaResumen({ frecuencia: 'INMEDIATA', umbralNegativas: 1 }) === 'MENSUAL');
check('quien elige semanal recibe semanal',
  prefs.cadenciaResumen({ resumen: { cadencia: 'SEMANAL' } }) === 'SEMANAL');
// Falla CERRADO: una cadencia inventada no puede colar un calendario raro.
check('una cadencia inválida cae al default en vez de propagarse',
  prefs.cadenciaResumen({ resumen: { cadencia: 'DIARIA' } }) === 'MENSUAL'
  && prefs.cadenciaResumen({ resumen: { cadencia: 7 } }) === 'MENSUAL');
check('el día del resumen por defecto es domingo (el de antes)', prefs.DIA_POR_DEFECTO === 0);
check('el día elegido se respeta, y un día fuera de rango no',
  prefs.diaResumen({ resumen: { diaSemana: 3 } }) === 3
  && prefs.diaResumen({ resumen: { diaSemana: 9 } }) === 0
  && prefs.diaResumen({ resumen: { diaSemana: -1 } }) === 0
  && prefs.diaResumen({ resumen: { diaSemana: 2.5 } }) === 0);

// ── 2. La ventana acompaña a la cadencia ──────────────────

titulo('2. La ventana de días acompaña a la cadencia');

check('semanal mira 7 días', prefs.diasVentana('SEMANAL') === 7);
check('mensual mira 30 días', prefs.diasVentana('MENSUAL') === 30);
// 🔴 El caso que produce un correo mentiroso: mensual con ventana de 7.
check('una cadencia desconocida NO cae a 7 días (sería un mensual contando una semana)',
  prefs.diasVentana('LO_QUE_SEA') === 30);
check('el periodo viaja como valor, no como frase',
  prefs.periodoDe('SEMANAL') === 'semanal' && prefs.periodoDe('MENSUAL') === 'mensual');
check('una cadencia desconocida da periodo mensual, no undefined',
  prefs.periodoDe('X') === 'mensual');

// ── 3. Qué día toca ───────────────────────────────────────

titulo('3. Qué día le toca a cada uno');

// Mediodía UTC de fechas conocidas: el 1 de septiembre de 2026 fue martes.
const aMediodia = (iso) => new Date(`${iso}T17:00:00Z`); // 12:00 en Lima
check('mensual sale el día 1 y solo el día 1',
  prefs.tocaResumen(null, aMediodia('2026-09-01'))
  && !prefs.tocaResumen(null, aMediodia('2026-09-02'))
  && !prefs.tocaResumen(null, aMediodia('2026-09-15'))
  && prefs.tocaResumen(null, aMediodia('2026-10-01')));

const losDomingos = { resumen: { cadencia: 'SEMANAL', diaSemana: 0 } };
// 2026-09-06 fue domingo.
check('semanal sale su día de la semana y ningún otro',
  prefs.tocaResumen(losDomingos, aMediodia('2026-09-06'))
  && !prefs.tocaResumen(losDomingos, aMediodia('2026-09-07'))
  && !prefs.tocaResumen(losDomingos, aMediodia('2026-09-05')));
check('semanal en miércoles sale en miércoles',
  prefs.tocaResumen({ resumen: { cadencia: 'SEMANAL', diaSemana: 3 } }, aMediodia('2026-09-09'))
  && !prefs.tocaResumen({ resumen: { cadencia: 'SEMANAL', diaSemana: 3 } }, aMediodia('2026-09-10')));

// 🔴 El calendario es de LIMA, no del servidor. A las 03:00 UTC del día 2, en
// Lima siguen siendo las 22:00 del día 1: el resumen mensual TIENE que salir.
// Con `getDate()` del servidor saldría el día 2, un día corrido y en silencio.
// Es el mismo error que este proyecto ya cometió con las fechas de SUNAT.
const nocheDeLima = new Date('2026-09-02T03:00:00Z');
check('CONTROL: el servidor y Lima discrepan en esa fecha',
  nocheDeLima.getUTCDate() === 2 && prefs.calendarioLima(nocheDeLima).diaMes === 1);
check('el mensual se decide con el calendario de Lima, no con el del servidor',
  prefs.tocaResumen(null, nocheDeLima));
check('y el semanal también', (() => {
  // 2026-09-07 03:00 UTC = domingo 6 por la noche en Lima.
  const d = new Date('2026-09-07T03:00:00Z');
  return prefs.calendarioLima(d).diaSemana === 0 && prefs.tocaResumen(losDomingos, d);
})());

// ── 4. El lote del aviso por reseña ───────────────────────

titulo('4. El lote del aviso por reseña negativa');

check('GRATIS agrupa de a 5 sin tocar nada', prefs.loteAlertas('GRATIS', null) === 5);
for (const plan of ORDEN.filter((p) => p !== 'GRATIS')) {
  check(`${plan} avisa al momento (lote 1)`, prefs.loteAlertas(plan, null) === 1);
}
// 🔴 Este es el caso que rompe el agrupado sin que nada falle: unas preferencias
// guardadas con un 1 pisan el default del plan.
check('una cuenta GRATIS que pidió aviso por reseña lo recibe',
  prefs.loteAlertas('GRATIS', { umbralNegativas: 1 }) === 1);
check('una cuenta de pago que pidió agrupado lo recibe',
  prefs.loteAlertas('NEGOCIO', { umbralNegativas: 5 }) === 5);
check('un valor de lote inventado cae al default del plan, no se usa',
  prefs.loteAlertas('GRATIS', { umbralNegativas: 3 }) === 5
  && prefs.loteAlertas('NEGOCIO', { umbralNegativas: 99 }) === 1
  && prefs.loteAlertas('NEGOCIO', { umbralNegativas: '5' }) === 1);
// ⚠️ Un plan desconocido AGRUPA, porque `capacidades()` de la tabla de planes lo
// trata como GRATIS —el más restrictivo—. Acá eso coincide además con el lado
// seguro: un plan que no reconocemos no puede provocar una avalancha de correo.
check('un plan desconocido se comporta como GRATIS y agrupa',
  prefs.loteAlertas('PLAN_QUE_NO_EXISTE', null) === 5);
// 🔴 El lote por plan sale de la TABLA DE PLANES, no de una tabla propia acá.
// Escribir una `{ GRATIS: 5 }` en prefsCorreo.js es lo que cazó prueba-planes.js.
check('el lote por plan sale de lib/planes.js y no de una tabla local',
  /require\('\.\/planes'\)/.test(leer('src', 'lib', 'prefsCorreo.js'))
  && !/LOTE_POR_PLAN\s*=/.test(leer('src', 'lib', 'prefsCorreo.js')));
check('los cuatro planes declaran su lote en la tabla',
  ORDEN.every((p) => [1, 5].includes(require('../src/lib/planes').limite(p, 'loteAvisoResenas'))));
check('solo se agrupa la reseña individual',
  prefs.seAgrupa('RESENA_MUY_NEGATIVA')
  && !prefs.seAgrupa('FICHA_ALTERADA')
  && !prefs.seAgrupa('CAIDA_RATING')
  && !prefs.seAgrupa('MENCION_NEGATIVA'));
check('la ventana del lote no arrastra reseñas de hace meses',
  prefs.VENTANA_LOTE_DIAS > 0 && prefs.VENTANA_LOTE_DIAS <= 60);

// ── 5. El worker del resumen ──────────────────────────────

titulo('5. El worker del resumen lee lo que necesita y corre cuando debe');

const worker = leer('src', 'workers', 'resumenSemanal.worker.js');
// 🔴 Sin `prefsAlertas` en el select, todos caen al default y quien eligió
// semanal no lo recibe nunca. Mismo fallo que `idioma` en las alertas (§12).
check('el select del worker trae prefsAlertas', /prefsAlertas:\s*true/.test(worker));
check('el select del worker sigue trayendo idioma', /idioma:\s*true/.test(worker));
check('el cron es DIARIO, no semanal', worker.includes("'0 8 * * *'"));
check('el cron sigue en hora de Lima', worker.includes("timezone: 'America/Lima'"));
check('decide por usuario con tocaResumen', /prefsCorreo\.tocaResumen\(/.test(worker));
check('la ventana sale de diasVentana y no está escrita a mano',
  /prefsCorreo\.diasVentana\(/.test(worker));
check('el periodo se le pasa a los dos correos del resumen',
  /enviarResumenSemanal\(usuario, negocio, datos, periodo\)/.test(worker)
  && /enviarResumenSemanalConsolidado\(usuario, resultados, resumenGlobal \|\| null, periodo\)/.test(worker));
// La costura para probar sin esperar al día 1. El cron NUNCA la usa.
check('hay una costura `forzar` para los scripts', /forzar = false/.test(worker));
check('y el cron NO la usa', /cron\.schedule\('0 8 \* \* \*', \(\) => ejecutarAhora\(\)/.test(worker));

// ── 6. `notificada` solo si salió correo ──────────────────

titulo('6. El acumulador del lote no se pisa');

const notificador = leer('src', 'alerts', 'notificador.js');
const monitoreo = leer('src', 'workers', 'monitoreo.worker.js');

check('notificar() devuelve si mandó algo', /return enviarAlertaEmail\(/.test(notificador));
check('el agrupado cuenta solo las que NO han salido por correo',
  /notificada:\s*false/.test(notificador));
check('el agrupado se limita a la ventana', /VENTANA_LOTE_DIAS/.test(notificador));
check('el agrupado cuenta por CUENTA, no por negocio',
  /usuarioId:\s*negocio\.usuarioId/.test(notificador));
check('al mandar el lote marca las alertas que cubrió',
  /updateMany\(\{[\s\S]{0,200}notificada:\s*true/.test(notificador));

// 🔴 El punto exacto donde esto se rompe en silencio.
check('la alerta de reseña se marca SOLO si salió correo',
  /if \(avisado\) await prisma\.alerta\.update/.test(monitoreo));
check('ningún call-site marca la alerta a ciegas tras notificar()', (() => {
  // Se busca el patrón viejo: notificar(...) y en la línea siguiente un update
  // de alerta sin condición.
  const malo = /await notificar\([^;]*\);\s*\r?\n\s*await prisma\.alerta\.update/;
  return !malo.test(monitoreo);
})());
// Control de la sonda anterior: que sepa reconocer el patrón que persigue.
check('CONTROL: esa sonda reconoce el patrón malo',
  /await notificar\([^;]*\);\s*\r?\n\s*await prisma\.alerta\.update/
    .test('await notificar({ a });\n    await prisma.alerta.update({});'));
// Las banderas de Mencion y ComentarioSocial son OTRA cosa y sí van siempre: sin
// ellas cada ciclo reenviaría lo mismo.
check('Mencion.notificada se sigue marcando siempre',
  /await prisma\.mencion\.update\(\{ where: \{ id: mencion\.id \}, data: \{ notificada: true \} \}\)/.test(monitoreo));
check('ComentarioSocial.notificada se sigue marcando siempre',
  /await prisma\.comentarioSocial\.update\(\{ where: \{ id: comentario\.id \}, data: \{ notificada: true \} \}\)/.test(monitoreo));

// ── 7. La ruta que guarda ─────────────────────────────────

titulo('7. La ruta no deshace el default del plan');

const auth = leer('src', 'api', 'routes', 'auth.routes.js');
// 🔴 Antes era `umbralNegativas: umbralNegativas === 5 ? 5 : 1`, así que guardar
// cualquier preferencia escribía un 1 y una cuenta GRATIS volvía a recibir un
// correo por reseña.
check('umbralNegativas se guarda SOLO si vino válido',
  /LOTES_VALIDOS\.includes\(umbralNegativas\)/.test(auth));
check('ya no hay un `? 5 : 1` que lo fuerce',
  !/umbralNegativas:\s*umbralNegativas === 5 \? 5 : 1/.test(auth));
check('la ruta acepta el bloque resumen', /resumen:\s*\{[\s\S]{0,300}cadencia:/.test(auth));
check('valida la cadencia contra la tabla, no contra una lista a mano',
  /prefsCorreo\.CADENCIAS\.includes\(/.test(auth));
check('el default NO se copia en la ruta',
  /prefsCorreo\.CADENCIA_POR_DEFECTO/.test(auth) && /prefsCorreo\.DIA_POR_DEFECTO/.test(auth));
check('el perfil devuelve las preferencias YA RESUELTAS',
  /prefsCorreo:\s*\{[\s\S]{0,300}cadenciaResumen:/.test(auth));
check('el lote resuelto se calcula con el plan de la CUENTA, no de la persona',
  /loteAlertas\(req\.cuenta\.plan/.test(auth));

// ── 8. Los textos de los correos ──────────────────────────

titulo('8. Un correo mensual no dice «semanal»');

const emails = leer('src', 'utils', 'emails.js');
check('el asunto del resumen recibe el periodo', /asuntoSemanal: \(n, per\)/.test(emails));
check('el título del resumen recibe el periodo', /tituloSemanal: \(per\)/.test(emails));
check('el saludo distingue mes de semana', /saludo: \(nombre, per\)/.test(emails));
check('la etiqueta de variación recibe los días', /variacion: \(dias\)/.test(emails));
check('el consolidado también recibe el periodo',
  /asuntoConsolidado: \(n, per\)/.test(emails) && /tituloConsolidado: \(per\)/.test(emails));
check('ya no queda ningún «Tu resumen semanal» escrito a pelo',
  !/tituloSemanal: 'Tu resumen semanal'/.test(emails)
  && !/asuntoSemanal: \(n\) =>/.test(emails));
check('el bloque de cifras recibe el periodo',
  /const bloqueCifrasNegocio = \(negocio, d, t = RESUMEN\.es, periodo/.test(emails));
check('el correo agrupado tiene asunto propio y no reusa «resumen X de alertas»',
  /asuntoLote: \(n\)/.test(emails) && /porQueLote: \(n\)/.test(emails));
check('el agrupado explica POR QUÉ llega junto',
  /porQueLote/.test(emails) && /enviarResumenAlertas/.test(emails));

// Los dos idiomas, clave por clave. Es el fallo que este proyecto ha cometido por
// cinco caminos distintos: el lado inglés se queda atrás porque nada falla.
const { RESUMEN } = (() => {
  // No se exporta, así que se leen las claves del fuente de cada bloque.
  const bloque = (idioma) => {
    const i = emails.indexOf(`  ${idioma}: {`, emails.indexOf('const RESUMEN = {'));
    const fin = emails.indexOf('\n  },', i);
    return emails.slice(i, fin);
  };
  const claves = (texto) => (texto.match(/^\s{4}(\w+):/gm) || []).map((s) => s.trim().replace(':', ''));
  return { RESUMEN: { es: claves(bloque('es')), en: claves(bloque('en')) } };
})();
check('CONTROL: se leyeron claves de los dos bloques de idioma',
  RESUMEN.es.length > 15 && RESUMEN.en.length > 15, `${RESUMEN.es.length} / ${RESUMEN.en.length}`);
check('los dos idiomas del resumen declaran las mismas claves',
  JSON.stringify([...RESUMEN.es].sort()) === JSON.stringify([...RESUMEN.en].sort()),
  `solo es: ${RESUMEN.es.filter((k) => !RESUMEN.en.includes(k))} | solo en: ${RESUMEN.en.filter((k) => !RESUMEN.es.includes(k))}`);

// ── 9. El panel ───────────────────────────────────────────

titulo('9. El panel dice lo que de verdad va a pasar');

const panel = leer('..', 'brand-shield-web', 'src', 'app', 'dashboard', 'alertas', 'page.js');
check('el control del lote arranca de lo RESUELTO por el backend',
  /resueltas\?\.lote === 5/.test(panel));
check('el panel manda el bloque resumen al guardar',
  /resumen: \{ cadencia, diaSemana: diaResumen \}/.test(panel));
check('hay control de cadencia del resumen', /setCadencia\('MENSUAL'\)/.test(panel) && /setCadencia\('SEMANAL'\)/.test(panel));
// 🔴 La etiqueta vieja prometía una detección que no puede ocurrir nunca.
//
// ⚠️ Se mira el VALOR de `umbralPicos`, no la cadena a secas. La primera versión
// de esta sonda buscaba «Solo picos (5+ en 24h)» en todo el archivo y daba rojo
// por el COMENTARIO que explica que la etiqueta se cambió: acusaba de un bug al
// comentario que documenta su arreglo. Es la trampa de siempre — ante un
// resultado, preguntar si el método distingue.
const etiquetasUmbral = (panel.match(/umbralPicos:\s*'[^']*'/g) || []);
check('CONTROL: se encontraron las dos etiquetas del lote (es y en)',
  etiquetasUmbral.length === 2, etiquetasUmbral.join(' | '));
check('ninguna etiqueta promete ya «solo picos» / «only spikes»',
  !etiquetasUmbral.some((e) => /Solo picos|Only spikes|24h/.test(e)), etiquetasUmbral.join(' | '));
check('y las dos dicen que se agrupan',
  etiquetasUmbral.every((e) => /Agrupadas|Batched/.test(e)), etiquetasUmbral.join(' | '));
check('los textos nuevos están en los DOS idiomas',
  (panel.match(/resumenLabel:/g) || []).length === 2
  && (panel.match(/umbralAyuda:/g) || []).length === 2
  && (panel.match(/resumenAyuda:/g) || []).length === 2);

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
