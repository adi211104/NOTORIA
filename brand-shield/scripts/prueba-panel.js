#!/usr/bin/env node
// scripts/prueba-panel.js
//
// Las cuatro librerías que alimentan el panel accionable:
//   lib/score.js    · el 0-100 y su serie histórica
//   lib/temas.js    · de qué se queja la gente
//   lib/tareas.js   · qué hacer hoy
//   lib/impacto.js  · cuánto cuesta la brecha de estrellas, en soles
//
// Casi todo lo que vigila son SILENCIOS y NEGATIVAS: que un score no aparezca
// sin snapshot, que un tema con una sola mención no se declare tendencia, que
// una cifra en soles no se invente donde el estudio no aplica. Si eso se rompe
// no falla nada — el panel simplemente empieza a afirmar cosas que no sabe, que
// es la única forma de perder la confianza de un cliente de golpe.

const fs = require('fs');
const path = require('path');

const score = require('../src/lib/score');
const temas = require('../src/lib/temas');
const tareas = require('../src/lib/tareas');
const impacto = require('../src/lib/impacto');

let ok = 0, fallos = 0;
const check = (n, c, d = '') => { if (c) { ok++; console.log(`  ✓ ${n}`); } else { fallos++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const titulo = (t) => console.log(`\n${t}`);

const hace = (horas) => new Date(Date.now() - horas * 3600000);
const snap = (rating, total, horasAtras = 0) => ({ ratingActual: rating, totalResenas: total, tomadoEn: hace(horasAtras) });

// ═════════════════════════════════════════════════════════════════════════════
titulo('1. Score — la fórmula no cambió al mudarse al backend');

// 🔴 El contraste que de verdad importa: la fórmula vivía dentro del componente
// de la ficha. Si al mudarla el número cambiara, a cada cliente le saltaría su
// score de un día para otro sin que su reputación se haya movido. Se comprueba
// replicando acá la aritmética original, no llamando a la función.
const original = (rating, total, captadas, sospechosas, respondidas) => {
  const pR = (rating / 5) * 55;
  const pV = Math.min(Math.log10(total + 1) / Math.log10(500), 1) * 20;
  const pC = captadas > 0 ? (1 - Math.min(sospechosas / captadas, 1)) * 15 : 15;
  const pRe = captadas > 0 ? (respondidas / captadas) * 10 : 5;
  return Math.round(pR + pV + pC + pRe);
};
const resenasDe = (n, { sospechosas = 0, respondidas = 0 } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, rating: 5, texto: 'texto',
    esSospechosa: i < sospechosas, respondida: i < respondidas,
    detectadaEn: hace(1), fechaResena: hace(1),
  }));

for (const [r, t, c, sos, res] of [[4.5, 212, 20, 0, 10], [3.9, 40, 5, 2, 1], [5, 900, 50, 0, 50], [1, 1, 1, 1, 0]]) {
  const mio = score.calcular(snap(r, t), resenasDe(c, { sospechosas: sos, respondidas: res })).score;
  check(`${r}★/${t} reseñas → ${mio}`, mio === original(r, t, c, sos, res), `esperado ${original(r, t, c, sos, res)}`);
}

check('sin snapshot devuelve null, no 0', score.calcular(null, []) === null);
check('sin reseñas captadas NO penaliza confianza',
  score.calcular(snap(5, 100), []).componentes.find((c) => c.clave === 'confianza').valor === 15);
check('el score nunca pasa de 100', score.calcular(snap(5, 100000), resenasDe(50, { respondidas: 50 })).score <= 100);
check('el score nunca baja de 0', score.calcular(snap(0, 0), []).score >= 0);

titulo('2. Score — los niveles');
check('85 es excelente', score.nivelDe(85) === 'excelente');
check('84 baja a bueno', score.nivelDe(84) === 'bueno');
check('49 es crítico', score.nivelDe(49) === 'critico');
// El nivel viaja como CLAVE, no como texto: el idioma se compone en el panel.
check('el nivel es una clave, no una etiqueta traducida',
  !/[ áéíóú]/.test(score.calcular(snap(4.5, 200), resenasDe(5)).nivel));

titulo('3. Score — la serie histórica y su límite declarado');
const historia = [snap(4.2, 100, 24 * 40), snap(4.3, 120, 24 * 20), snap(4.5, 160, 1)];
const s = score.serie(historia, resenasDe(10, { respondidas: 5 }));
check('con 3 lecturas hay serie', !!s && s.puntos.length === 3);
check('la serie va de más vieja a más nueva', s.puntos[0].fecha < s.puntos[2].fecha);
check('la serie sube cuando el rating sube', s.puntos[2].score > s.puntos[0].score);
check('con una sola lectura NO hay serie', score.serie([snap(4.5, 100)], []) === null);
// 🔴 Lo importante no es que haya serie, sino que el panel sepa qué parte es
// aproximada. Sin este campo el gráfico fingiría un histórico que no existe.
check('la serie declara qué componentes van fijos',
  Array.isArray(s.componentesFijos) && s.componentesFijos.includes('confianza') && s.componentesFijos.includes('respuesta'));

// Varias lecturas del mismo día colapsan en una: Franquicia genera 24 al día.
//
// ⚠️ Las fechas van FIJAS y no en «horas atrás». Con horas relativas esta
// comprobación fallaba sola entre la medianoche y las 05:00 de Lima: tres
// lecturas separadas por una hora caen en dos días distintos si en medio pasa
// la medianoche peruana, y el conteo daba 3 en vez de 2. Pasó de verdad el
// 2026-08-25 a la 01:07. Es el mismo tipo de fixture frágil que ya se fijó una
// vez en este archivo por el bug de zona horaria de `fechaPeru()`.
const enLima = (iso) => ({ ratingActual: 4.2, totalResenas: 100, tomadoEn: new Date(iso) });
const mismoDia = [
  { ...enLima('2026-03-10T15:00:00Z'), ratingActual: 4.2, totalResenas: 100 }, // 10:00 Lima
  { ...enLima('2026-03-10T18:00:00Z'), ratingActual: 4.3, totalResenas: 101 }, // 13:00 Lima
  { ...enLima('2026-03-10T22:00:00Z'), ratingActual: 4.4, totalResenas: 102 }, // 17:00 Lima
  { ...enLima('2026-03-05T15:00:00Z'), ratingActual: 4.1, totalResenas: 99 },  // otro día
];
check('varias lecturas del mismo día dan UN punto', score.serie(mismoDia, []).puntos.length === 2,
  `dieron ${score.serie(mismoDia, []).puntos.length}`);

// 🔴 Y el caso que de verdad importa, fijado a una hora concreta para que falle
// a cualquier hora del día y no solo de noche: dos lecturas del MISMO día de
// Lima, una antes y otra después de la medianoche UTC.
//
// Agrupando por `toISOString()` esto daba DOS puntos, porque Perú va cinco horas
// por detrás: a las 20:00 de Lima en UTC ya es mañana. Un negocio escaneado a
// las 18:00 y a las 21:00 salía con dos puntos en la curva. Es el mismo bug que
// §9 documenta para las fechas que van a SUNAT, por otro camino.
const limaMismoDia = [
  { ratingActual: 4.2, totalResenas: 100, tomadoEn: new Date('2026-08-20T23:00:00Z') }, // 18:00 Lima
  { ratingActual: 4.3, totalResenas: 101, tomadoEn: new Date('2026-08-21T02:00:00Z') }, // 21:00 Lima, MISMO día
  { ratingActual: 4.1, totalResenas: 99, tomadoEn: new Date('2026-08-15T15:00:00Z') },  // otro día
];
const serieLima = score.serie(limaMismoDia, []);
check('dos lecturas del mismo día de Lima dan UN punto, aunque cambie el día UTC',
  serieLima.puntos.length === 2, `dio ${serieLima.puntos.length} puntos: ${serieLima.puntos.map((p) => p.fecha).join(', ')}`);
check('la fecha del punto es la de Lima, no la UTC',
  serieLima.puntos.some((p) => p.fecha === '2026-08-20'),
  serieLima.puntos.map((p) => p.fecha).join(', '));


const v = score.variacion(s);
check('la variación informa el signo y los extremos', v && v.delta === v.final - v.inicial);
check('sin serie no hay variación', score.variacion(null) === null);

// ═════════════════════════════════════════════════════════════════════════════
titulo('4. Temas — detección y umbral');
const quejas = [
  { id: 'a', rating: 1, texto: 'Nos hicieron esperar media hora, un desastre' },
  { id: 'b', rating: 2, texto: 'Demasiada demora en la cocina' },
  { id: 'c', rating: 2, texto: 'El mozo fue muy grosero' },
  { id: 'd', rating: 1, texto: '' },
];
const d = temas.distribucion(quejas, 'es');
check('detecta demora dos veces', d.temas.find((t) => t.id === 'demora')?.veces === 2);
check('detecta trato una vez', d.temas.find((t) => t.id === 'trato')?.veces === 1);
check('ordena por frecuencia', d.temas[0].id === 'demora');

// 🔴 El porcentaje va sobre las reseñas CON TEXTO. Con el total en el
// denominador, una ficha llena de 1★ mudas hundiría todos los porcentajes y
// parecería que nadie se queja de nada.
check('el porcentaje se calcula sobre las reseñas con texto', d.conTexto === 3 && d.temas[0].porcentaje === 67,
  `conTexto=${d.conTexto} pct=${d.temas[0].porcentaje}`);
check('informa cuántas reseñas venían sin texto', d.sinTexto === 1);
check('cada tema trae ejemplos para poder señalarlos', d.temas[0].ejemplos.length === 2);
check('los ejemplos van recortados', d.temas[0].ejemplos.every((e) => e.extracto.length <= 140));

check('una sola mención NO es "lo que más se repite"', temas.masRepetido([quejas[2]], 'es') === null);
check('dos menciones sí', temas.masRepetido(quejas, 'es') === 'la demora en la atención');

titulo('5. Temas — el idioma, que es el bug que ya pasó tres veces');
check('la etiqueta cambia con el idioma', temas.masRepetido(quejas, 'en') === 'slow service');
check('todo tema tiene etiqueta es y en', temas.TEMAS.every((t) => t.es && t.en && t.cortoEs && t.cortoEn));
check('todo tema tiene id estable en minúsculas', temas.TEMAS.every((t) => /^[a-z]+$/.test(t.id)));
check('ningún id se repite', new Set(temas.TEMAS.map((t) => t.id)).size === temas.TEMAS.length);

titulo('6. Temas — la tendencia compara porcentajes, no conteos');
// 🔴 El caso que justifica la regla: el negocio TRIPLICA sus reseñas y la demora
// sube de 2 a 3 menciones. En conteo "empeoró"; en proporción mejoró mucho.
const antes = [
  { texto: 'mucha demora' }, { texto: 'muy lento todo' },
  { texto: 'rico' }, { texto: 'excelente' },
];
const ahora = [
  { texto: 'demora en la cocina' }, { texto: 'esperamos mucho' }, { texto: 'lento' },
  ...Array.from({ length: 9 }, () => ({ texto: 'todo excelente, muy rico' })),
];
const tend = temas.tendencia(ahora, antes, 'es');
const demora = tend.find((t) => t.id === 'demora');
check('con más reseñas y más menciones, el porcentaje BAJA', demora.porcentaje < demora.porcentajePrevio,
  `${demora.porcentajePrevio}% → ${demora.porcentaje}%`);
check('el delta va en puntos porcentuales y es negativo', demora.deltaPuntos < 0);
check('un periodo con pocas reseñas no da tendencia',
  temas.tendencia(ahora, [{ texto: 'lento' }], 'es') === null);
check('sin periodo previo tampoco', temas.tendencia(ahora, [], 'es') === null);

// ═════════════════════════════════════════════════════════════════════════════
titulo('7. Tareas — el orden es el producto');
const negocio = { id: 'n1', nombre: 'Cevichería', googlePlaceId: 'pid' };
const listaTodo = tareas.construir({
  negocio,
  resenas: [
    { id: 'v', rating: 1, respondida: false, detectadaEn: hace(48) },
    { id: 'n', rating: 1, respondida: false, detectadaEn: hace(2) },
    { id: 't', rating: 3, respondida: false, detectadaEn: hace(2) },
    { id: 'ok', rating: 5, respondida: true, detectadaEn: hace(2) },
  ],
  comentarios: [{ respondida: false, publicacionId: 'p1' }],
  alertas: [{ id: 'a1', tipo: 'FICHA_ALTERADA', leida: false }, { id: 'a2', tipo: 'CAIDA_RATING', leida: false }],
  snapshot: { totalResenas: 30 },
  tendenciaTemas: [{ id: 'demora', etiqueta: 'la demora', porcentaje: 40, deltaPuntos: 25, nuevo: false }],
});
const tipos = listaTodo.map((t) => t.tipo);
check('la ficha alterada va primero', tipos[0] === 'FICHA_ALTERADA');
check('la crítica vencida va antes que la nueva',
  tipos.indexOf('CRITICA_VENCIDA') < tipos.indexOf('CRITICA_NUEVA'));
check('la crítica nueva va antes que la de 3★',
  tipos.indexOf('CRITICA_NUEVA') < tipos.indexOf('NEGATIVA_SIN_RESPONDER'));
check('la lista va ordenada por prioridad descendente',
  listaTodo.every((t, i) => i === 0 || listaTodo[i - 1].prioridad >= t.prioridad));
check('la crítica vencida dice cuántas horas lleva',
  listaTodo.find((t) => t.tipo === 'CRITICA_VENCIDA').datos.horas >= 48);

titulo('8. Tareas — lo que NO debe aparecer');
check('una reseña respondida no genera tarea',
  !tareas.construir({ negocio, resenas: [{ id: 'x', rating: 1, respondida: true, detectadaEn: hace(2) }] })
    .some((t) => t.tipo.startsWith('CRITICA')));
check('una reseña de 4★ sin responder no genera tarea',
  !tareas.construir({ negocio, resenas: [{ id: 'x', rating: 4, respondida: false, detectadaEn: hace(2) }] }).length);

// ⚠️ Un comentario sin publicacionId es de solo lectura: la ruta de responder
// devuelve 422. Ponerlo en la lista mandaría al usuario a un botón inexistente.
check('un comentario sin publicacionId NO es una tarea',
  !tareas.construir({ negocio, comentarios: [{ respondida: false, publicacionId: null }] })
    .some((t) => t.tipo === 'COMENTARIO_SIN_RESPONDER'));

check('una alerta ya leída no genera tarea',
  !tareas.construir({ negocio, alertas: [{ id: 'a', tipo: 'CAIDA_RATING', leida: true }] }).length);

// 🔴 Pedir reseñas con críticas sin contestar es el consejo equivocado: primero
// se tapa el agujero, después se llena el balde.
check('no pide reseñas si hay algo urgente',
  !tareas.construir({
    negocio, snapshot: { totalResenas: 10 },
    resenas: [{ id: 'x', rating: 1, respondida: false, detectadaEn: hace(2) }],
  }).some((t) => t.tipo === 'PEDIR_RESENAS'));
check('sí las pide con la ficha limpia y pocas reseñas',
  tareas.construir({ negocio, snapshot: { totalResenas: 10 } }).some((t) => t.tipo === 'PEDIR_RESENAS'));
check('no las pide con muchas reseñas',
  !tareas.construir({ negocio, snapshot: { totalResenas: 500 } }).some((t) => t.tipo === 'PEDIR_RESENAS'));
check('no las pide sin ficha de Google conectada',
  !tareas.construir({ negocio: { id: 'n', nombre: 'x', googlePlaceId: null }, snapshot: { totalResenas: 10 } }).length);

check('un negocio impecable no genera NINGUNA tarea',
  tareas.construir({ negocio, resenas: [{ id: 'x', rating: 5, respondida: true, detectadaEn: hace(2) }], snapshot: { totalResenas: 500 } }).length === 0);
check('hayAlgoQueHacer distingue lista vacía', !tareas.hayAlgoQueHacer([]) && tareas.hayAlgoQueHacer(listaTodo));

titulo('9. Tareas — sin texto redactado (la regla del idioma)');
// El backend manda `tipo` + `datos`; la frase la compone el panel. Es el error
// que ya costó un bug en las invitaciones de equipo.
const CAMPOS_PERMITIDOS = ['id', 'tipo', 'prioridad', 'datos'];
check('ninguna tarea trae campos fuera del contrato',
  listaTodo.every((t) => Object.keys(t).every((k) => CAMPOS_PERMITIDOS.includes(k))));
const fuenteTareas = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'tareas.js'), 'utf8');
check('tareas.js no redacta frases para el usuario',
  !/(Responde|Revisa|Tienes que|You should|Reply to)\s/.test(fuenteTareas.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

// ═════════════════════════════════════════════════════════════════════════════
titulo('10. Impacto — dónde aplica y dónde no');
check('aplica a un restaurante', impacto.aplicaA('RESTAURANTE'));
check('aplica a un bar y a una cafetería', impacto.aplicaA('BAR') && impacto.aplicaA('CAFETERIA'));
// 🔴 El estudio midió restaurantes independientes en Yelp. Prestárselo a un
// hotel —cuya demanda pasa por Booking— es extrapolar con el dinero de alguien.
check('NO aplica a un hotel', !impacto.aplicaA('HOTEL'));
check('NO aplica a una clínica ni a un taller', !impacto.aplicaA('CLINICA') && !impacto.aplicaA('TALLER'));
check('sin tipo aplicable no devuelve cifra',
  impacto.estimar({ rating: 4.0, referencia: 4.6, rangoId: 'r2', tipoNegocio: 'HOTEL' }) === null);

titulo('11. Impacto — nunca una cifra inventada');
const e = impacto.estimar({ rating: 4.2, referencia: 4.6, rangoId: 'r2', tipoNegocio: 'RESTAURANTE' });
check('con brecha real devuelve estimación', !!e);
check('la brecha se calcula bien', e.brecha === 0.4);
check('es un RANGO, no una cifra', e.mensual.min < e.mensual.max);
check('el mínimo sale del 5% del suelo del rango',
  e.mensual.min === impacto.redondearSoles(15000 * 0.4 * 0.05), `da ${e.mensual.min}`);
check('el anual son 12 mensualidades', e.anual.min === e.mensual.min * 12);
// La fuente viaja siempre: sin URL pública que la sostenga, la cifra no entra.
check('trae la cita y la URL del estudio', e.fuente.url.startsWith('https://www.hbs.edu') && e.fuente.cita.includes('Luca'));
check('trae los porcentajes para poder rehacer la cuenta', e.porcentajes.min === 0.05 && e.porcentajes.max === 0.09);

check('si ya está en la referencia no hay nada que recuperar',
  impacto.estimar({ rating: 4.6, referencia: 4.6, rangoId: 'r2', tipoNegocio: 'RESTAURANTE' }) === null);
check('si está POR ENCIMA tampoco inventa una cifra',
  impacto.estimar({ rating: 4.8, referencia: 4.5, rangoId: 'r2', tipoNegocio: 'RESTAURANTE' }) === null);
// ⚠️ Por debajo de 0.1 la brecha cabe dentro del redondeo de Google.
check('una brecha de 0.05 no da cifra (cabe en el redondeo)',
  impacto.estimar({ rating: 4.55, referencia: 4.6, rangoId: 'r2', tipoNegocio: 'RESTAURANTE' }) === null);
check('un rango inexistente no da cifra',
  impacto.estimar({ rating: 4.0, referencia: 4.6, rangoId: 'inventado', tipoNegocio: 'RESTAURANTE' }) === null);

titulo('12. Impacto — el redondeo dice "estimación", no "exactitud"');
check('por debajo de 10 000 redondea a centenas', impacto.redondearSoles(2347) === 2300);
check('por encima redondea a millares', impacto.redondearSoles(23470) === 23000);
check('nunca devuelve negativo', impacto.redondearSoles(-5) === 0);
// El último rango es abierto por arriba y se calcula sobre su suelo: quedarse
// corto es el lado seguro del error.
const abierto = impacto.estimar({ rating: 4.0, referencia: 4.6, rangoId: 'r5', tipoNegocio: 'RESTAURANTE' });
check('el rango abierto se marca como tal', abierto.rango.abierto === true);
check('y se calcula sobre su suelo, no sobre un techo inventado',
  abierto.mensual.max === impacto.redondearSoles(120000 * 0.6 * 0.09));

console.log('\n──────────────────────────────────────────────────');

// =============================================================================
titulo('13. Diagnostico de la alerta - las tres puntas del contrato');

// El diagnostico viaja del worker al correo y al panel. Las tres puntas tienen
// que entenderse, y fallan en silencio si no: el correo saldria sin contexto o,
// peor, con "undefined" en medio de una frase.
process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.FRONTEND_URL = 'https://usenotoria.app';

const Module = require('module');
const enviados = [];
const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'resend') {
    return { Resend: class { constructor() { this.emails = { send: async (m) => { enviados.push(m); return { data: { id: 'sim' } }; } }; } } };
  }
  return requireOriginal.apply(this, arguments);
};
const emails = require('../src/utils/emails');
Module.prototype.require = requireOriginal;

const alertaCon = (diagnostico) => ({
  tipo: 'RESENA_MUY_NEGATIVA',
  descripcion: 'Nueva resena de 1 estrella',
  detalle: { rating: 1, autor: 'Ana', texto: 'Otra vez media hora de espera', motivoSospecha: null, diagnostico },
});
const diagEjemplo = { patron: { tema: 'demora', veces: 6, deCuantas: 10 }, sinResponder: 3, dias: 60 };
const limpio = (h) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const neg = { id: 'n1', nombre: 'Cevicheria' };
  await emails.enviarAlertaCritica({ email: 'a@b.c', idioma: 'es' }, neg, alertaCon(diagEjemplo));
  await emails.enviarAlertaCritica({ email: 'a@b.c', idioma: 'en' }, neg, alertaCon(diagEjemplo));
  await emails.enviarAlertaCritica({ email: 'a@b.c', idioma: 'es' }, neg, alertaCon(null));

  const [es, en, sin] = enviados.map((m) => m.html);

  check('el correo en espanol cita el patron', /6 de las .ltimas 10/.test(limpio(es)));
  check('y nombra la queja en espanol', /mencionan demora/.test(limpio(es)));
  check('el correo en ingles cita el patron', /6 of the last 10/.test(limpio(en)));
  check('y nombra la queja en ingles', /mention delays/.test(limpio(en)));
  check('los dos avisan de las criticas sin responder',
    /3 rese.as cr.ticas/.test(limpio(es)) && /3 more critical reviews/.test(limpio(en)));

  // Sin diagnostico el correo tiene que salir EXACTAMENTE como antes: es una
  // mejora del aviso, y una mejora no puede impedir que el cliente se entere.
  check('sin diagnostico no se pinta un bloque vacio', !/FFF8E6/.test(sin));
  check('y el correo conserva el texto de la resena', /media hora de espera/.test(limpio(sin)));

  // Un tema que el correo no conoce se OMITE, no se imprime como undefined.
  enviados.length = 0;
  await emails.enviarAlertaCritica({ email: 'a@b.c', idioma: 'es' }, neg,
    alertaCon({ patron: { tema: 'inventado', veces: 5, deCuantas: 9 }, sinResponder: 0 }));
  check('un tema desconocido no imprime "undefined"', !/undefined/.test(enviados[0].html));

  console.log('\n' + '-'.repeat(50));
  console.log(`${ok} pasadas / ${fallos} fallidas`);
  process.exit(fallos ? 1 : 0);
})();
