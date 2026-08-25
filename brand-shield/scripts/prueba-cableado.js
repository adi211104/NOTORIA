// brand-shield/scripts/prueba-cableado.js
//
// Las cuatro librerías del panel accionable, enchufadas donde faltaban.
//
//   node scripts/prueba-cableado.js
//
// ── QUÉ SE VIGILA ───────────────────────────────────────────────────────────
//
// `score`, `temas`, `impacto` y `parteEquipo` se escribieron puras y en el
// backend a propósito, para poder usarse desde más de un sitio. Hasta el
// 2026-08-25 cada una alimentaba UNA sola pantalla:
//
//   · el score que el catálogo anuncia en los cuatro planes solo existía si
//     abrías la ficha de un negocio concreto — no llegaba al correo semanal, ni
//     al PDF mensual, ni a la constancia que el cliente le enseña a un banco;
//   · los temas vivían en el afiche y el panel, mientras el correo mandaba un
//     insight de IA que cuesta una llamada a Groq y dice menos que «4 de 7
//     mencionan demora», que es gratis;
//   · el parte para el equipo había que ir a buscarlo al panel, que es
//     exactamente el hábito del que el producto intenta no depender.
//
// 🔴 Y lo que este archivo vigila de verdad son los DOS fallos silenciosos que
// aparecieron al enchufarlo:
//
//   1. `parteEquipo.hechos()` vuelve a filtrar por fecha sobre los objetos que
//      recibe. El `select` del correo semanal traía solo `rating` y `texto`, así
//      que hacía `new Date(undefined)` → NaN → descartaba TODAS las reseñas. El
//      parte habría salido vacío siempre, sin un solo error en los logs. Es el
//      mismo fallo que ya tuvo `idioma` en el select de las alertas.
//   2. Meter el parte en el correo significa generarlo para TODOS los negocios
//      con material cada semana. Si eso pasara por Groq, la factura se
//      multiplicaría por el número de negocios activos, todas las semanas, para
//      siempre. El correo usa el caché o la plantilla — nunca la IA.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

let ok = 0, fallos = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const titulo = (t) => console.log(`\n${t}`);

// ── Correo capturado en vez de enviado ──────────────────────────────────────
let capturado = null;
const original = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'resend') {
    return { Resend: class { constructor() { this.emails = { send: async (o) => { capturado = o; return { id: 'x' }; } }; } } };
  }
  return original.apply(this, arguments);
};
process.env.RESEND_API_KEY = 're_prueba';
process.env.FRONTEND_URL = 'https://usenotoria.app';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba';
const emails = require('../src/utils/emails');
Module.prototype.require = original;

const parteLib = require('../src/lib/parteEquipo');
const constancia = require('../src/lib/constancia');
const score = require('../src/lib/score');
const { generarPDF } = require('../src/utils/reporte.generator');
const { generarConstancia } = require('../src/utils/constancia.pdf');

const correr = async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  titulo('1. 🔴 El select del correo semanal trae la FECHA de la reseña');

  // Es el fallo que no da señal: sin fecha, `hechos()` descarta todo y el parte
  // no sale nunca. Se comprueba las dos cosas — el comportamiento y el fuente.
  const hoy = new Date();
  const conFecha = [
    { rating: 2, texto: 'mucha demora en la atención, esperamos 40 minutos', detectadaEn: hoy, fechaResena: hoy },
    { rating: 1, texto: 'la demora es insoportable y encima mal trato', detectadaEn: hoy, fechaResena: hoy },
    { rating: 5, texto: 'todo excelente, volveremos', detectadaEn: hoy, fechaResena: hoy },
  ];
  const sinFecha = conFecha.map(({ rating, texto }) => ({ rating, texto }));

  check('con fecha, el parte tiene material',
    parteLib.hayAlgoQueContar(parteLib.hechos(conFecha, 'es')));
  check('SIN fecha se queda vacío — este era el bug, y es mudo',
    !parteLib.hayAlgoQueContar(parteLib.hechos(sinFecha, 'es')));

  const workerSemanal = leer('src/workers/resumenSemanal.worker.js');
  check('el worker pide `fechaResena` en el select',
    /select:\s*\{[^}]*fechaResena/.test(workerSemanal));
  check('y también `detectadaEn`',
    /select:\s*\{[^}]*detectadaEn/.test(workerSemanal));

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('2. 🔴 El correo semanal NO llama a Groq para el parte');

  check('el worker usa la plantilla o el caché, no `redactarConIA`',
    !workerSemanal.includes('redactarConIA'),
    'generar el parte con IA para cada negocio cada semana multiplica la factura de Groq');
  check('y tampoco llama a `obtener()`, que sí generaría',
    !/parteServicio\.obtener/.test(workerSemanal));
  check('usa `plantilla()` como respaldo', workerSemanal.includes('parteLib.plantilla'));
  check('y reutiliza el caché del panel si está fresco', workerSemanal.includes('estaFresco'));
  check('el parte va gateado por plan (`parteEquipo`)',
    /puede\(usuario\.plan,\s*'parteEquipo'\)/.test(workerSemanal));

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('3. El correo semanal muestra score, tema y parte');

  const datos = {
    ratingActual: 4.2, variacion: -0.1, resenasNuevas: 6, score: 78, nivelScore: 'bueno',
    tema: { etiqueta: 'la demora en la atención', veces: 4, porcentaje: 57 },
    tendenciaTema: { etiqueta: 'el precio', deltaPuntos: 22 },
    parte: 'Equipo: 6 reseñas esta semana.\nCuatro mencionan demora.',
  };
  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'Didier', idioma: 'es' }, { id: 'n1', nombre: 'Don Tito' }, datos);
  let html = capturado.html;
  check('el score aparece', /Score/.test(html) && />78</.test(html));
  check('el tema más mencionado aparece, con su porcentaje',
    html.includes('la demora en la atención') && html.includes('57%'));
  check('la tendencia aparece cuando hay una que sube', html.includes('el precio'));
  check('el parte aparece', html.includes('Equipo: 6 reseñas esta semana'));
  check('y los saltos de línea del parte se respetan', html.includes('white-space:pre-line'));

  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'D', idioma: 'en' }, { id: 'n1', nombre: 'Don Tito' }, datos);
  check('en inglés se traduce todo lo nuevo',
    capturado.html.includes('Most mentioned') && capturado.html.includes('For your team group chat'),
    'es el error que ya pasó tres veces: el lado inglés se olvida porque nada falla');

  // Sin los datos nuevos el correo tiene que salir exactamente como antes.
  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'D', idioma: 'es' }, { id: 'n1', nombre: 'X' },
    { ratingActual: 4, variacion: 0, resenasNuevas: 0 });
  html = capturado.html;
  check('sin score no se pinta la tarjeta (no un 0)', !/Score/.test(html));
  check('sin tema no se pinta la frase', !html.includes('Lo que más mencionaron'));
  check('sin parte no se pinta el recuadro', !html.includes('Para el grupo de tu equipo'));
  check('y no se cuela ningún undefined ni NaN', !/undefined|NaN|\[object/.test(html));

  // Texto ajeno dentro del parte: va escapado como todo lo demás.
  await emails.enviarResumenSemanal({ email: 'a@b.c', nombre: 'D', idioma: 'es' }, { id: 'n1', nombre: 'X' },
    { ratingActual: 4, variacion: 0, resenasNuevas: 2, parte: '<script>alert(1)</script> y <b>ojo</b>' });
  check('el parte se escapa antes de entrar al HTML',
    !/<script>/.test(capturado.html) && capturado.html.includes('&lt;script&gt;'));

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('4. El score llega al PDF mensual');

  const reporte = leer('src/utils/reporte.generator.js');
  check('el generador importa lib/score', reporte.includes("require('../lib/score')"));
  check('y no recalcula la fórmula por su cuenta',
    !/PESOS|log10/.test(reporte),
    'dos números distintos con el mismo nombre son peor que no ponerlo');
  const pdf = await generarPDF(
    { nombre: 'Don Tito', tipo: 'RESTAURANTE' },
    { snapshots: [{ ratingActual: 4.3, totalResenas: 212 }], alertas: [], resenas: [{ rating: 5, respondida: true, esSospechosa: false }], periodo: 'agosto 2026' },
    'es',
  );
  check('el PDF mensual se genera con el score dentro', pdf.length > 1000);
  const pdfSinDatos = await generarPDF({ nombre: 'X', tipo: 'RESTAURANTE' }, { snapshots: [], alertas: [], resenas: [], periodo: 'agosto' }, 'es');
  check('y sin snapshot no revienta (dice «sin datos», no 0)', pdfSinDatos.length > 500);

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('5. El score llega a la constancia, sin invalidar las viejas');

  const con = constancia.emitirCodigo({ nombre: 'Don Tito', rating: 4.3, totalResenas: 212, diasVigilado: 60, incidentes: 0, placeId: 'p', score: 78 });
  const sin = constancia.emitirCodigo({ nombre: 'Don Tito', rating: 4.3, totalResenas: 212, diasVigilado: 60, incidentes: 0, placeId: 'p' });
  check('una constancia nueva lleva el score', constancia.verificarCodigo(con).datos.score === 78);
  check('🔴 una SIN score sigue siendo válida (las emitidas antes del cambio)',
    constancia.verificarCodigo(sin).valida === true);
  check('y su score es null, no 0',
    constancia.verificarCodigo(sin).datos.score === null,
    '0 diría que el negocio sacó cero; null dice que esa constancia es anterior');
  check('el código sigue cabiendo en un QR razonable', con.length < 240, `mide ${con.length}`);

  const base = { nombre: 'Don Tito', direccion: 'Av. X 123', rating: 4.3, totalResenas: 212, diasVigilado: 60, incidentes: 0, emitida: new Date(), vence: new Date(Date.now() + 90 * 864e5) };
  const pdfCon = await generarConstancia({ ...base, score: 78 }, 'https://usenotoria.app/verificar/abc');
  const pdfSin = await generarConstancia(base, 'https://usenotoria.app/verificar/abc');
  check('la constancia se genera con score', pdfCon.length > 1000);
  check('y sin score también (una fila menos, no una fila vacía)', pdfSin.length > 1000 && pdfSin.length < pdfCon.length);

  // ⚠️ El recuadro tenía el alto escrito a mano para exactamente cinco filas.
  const pdfLib = leer('src/utils/constancia.pdf.js');
  check('el alto del recuadro se DERIVA del número de filas',
    /alto\s*=\s*18\s*\+\s*filas\.length/.test(pdfLib),
    'con 148 fijo, la sexta fila caía justo sobre el borde');

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('6. La ruta de la constancia calcula el score de verdad');

  const rutaNegocio = leer('src/api/routes/negocio.routes.js');
  check('la ruta llama a score.calcular', /score\.calcular\(snap/.test(rutaNegocio));
  check('y se lo pasa al código firmado', /score:\s*puntuacion\s*\?\s*puntuacion\.score/.test(rutaNegocio));

  console.log(`\n${'─'.repeat(56)}`);
  console.log(`${ok} pasadas · ${fallos} fallidas`);
  if (fallos) process.exitCode = 1;
};

correr().catch((e) => { console.error(e); process.exitCode = 1; });
