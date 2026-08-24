// brand-shield/src/lib/impacto.js
//
// Estrellas a soles. Puro: aritmética y una fuente pública.
//
// ── La idea, y por qué llevaba un año sin hacerse ────────────────────────────
//
// El landing cita a Luca (Harvard) desde siempre: una estrella entera mueve
// entre 5% y 9% de los ingresos de un restaurante independiente. Es un dato
// excelente y estaba desperdiciado como estadística de fondo, hablando de
// negocios ajenos.
//
// Nadie entiende «te faltan 0.3 estrellas». Todo el mundo entiende «eso son
// entre S/1,200 y S/2,100 al mes». Es el mismo argumento del landing, con los
// números del propio local, y es lo único que convierte el analizador gratuito
// en una razón para registrarse en vez de en una curiosidad.
//
// ── Las cuatro reglas que lo hacen defendible en vez de humo ─────────────────
//
// 🔴 1. RANGO, nunca una cifra exacta. El estudio da 5-9%, así que la respuesta
//       es un intervalo. Un número único fingiría una precisión que el propio
//       paper no tiene, y basta que un cliente lo compruebe una vez para que
//       todo lo demás que diga Notoria pierda credibilidad.
//
// 🔴 2. Con FUENTE a la vista. El objeto devuelto trae la cita y la URL, y el
//       panel tiene que pintarlas. Es la misma regla que gobierna las cifras del
//       landing: sin URL pública que la sostenga, la cifra no entra.
//
// 🔴 3. Solo donde el estudio aplica. Luca midió RESTAURANTES INDEPENDIENTES en
//       Yelp. Aplicárselo a una clínica, un taller o una cadena es extrapolar, y
//       extrapolar con el dinero de alguien es exactamente el tipo de cosa por
//       la que un cliente pide la baja. `aplicaA()` decide, y ante la duda dice
//       que no.
//
// 🔴 4. La facturación la pone el usuario POR RANGOS y no se guarda. No hace
//       falta la cifra exacta para dar un intervalo, y pedirle a alguien que
//       teclee cuánto factura —y encima almacenarlo— es pedir un dato sensible
//       a cambio de nada.

// M. Luca, Harvard Business School, working paper 12-016 (datos de Yelp).
// Es la misma fuente que ya cita el landing; si cambia allá, cambia acá.
const ESTUDIO = {
  minimo: 0.05,
  maximo: 0.09,
  cita: 'M. Luca, Harvard Business School, working paper 12-016 (datos de Yelp)',
  url: 'https://www.hbs.edu/ris/Publication%20Files/12-016_a7e4a5a2-03f9-490d-b093-8f951238dba2.pdf',
};

// Los tipos de negocio donde el estudio es aplicable sin estirarlo. El paper
// mide restaurantes independientes; bar y cafetería son el mismo negocio con
// otro nombre y la misma dinámica de reseñas.
//
// ⚠️ Un HOTEL no está: su demanda pasa por Booking y agencias, no por Maps, así
// que el mecanismo que midió Luca no es el mismo. Que Notoria venda a hoteles no
// es motivo para prestarles una cifra que no se midió sobre ellos.
const TIPOS_APLICABLES = ['RESTAURANTE', 'BAR', 'CAFETERIA'];

const aplicaA = (tipoNegocio) => TIPOS_APLICABLES.includes(tipoNegocio);

// Google devuelve los tipos de una ficha en un array y EN ORDEN ALFABÉTICO, así
// que "el primero que no sea genérico" elige mal — es el mismo error que ya
// mordió en /para, donde un restaurante se comparaba contra hoteles. Acá se
// busca por prioridad explícita y se ignora todo lo demás.
const TIPOS_GOOGLE = [
  ['restaurant', 'RESTAURANTE'],
  ['bar', 'BAR'],
  ['cafe', 'CAFETERIA'],
  ['bakery', 'CAFETERIA'],
  ['meal_takeaway', 'RESTAURANTE'],
  ['meal_delivery', 'RESTAURANTE'],
];

/**
 * Tipo propio a partir de los `types` de Places, o `null` si la ficha no es de
 * las que el estudio cubre. `null` es la respuesta correcta y frecuente: un
 * hotel, una clínica o una tienda caen acá, y ahí no se enseña ninguna cifra.
 */
const desdeTiposGoogle = (types = []) => {
  const lista = Array.isArray(types) ? types.map((x) => String(x).toLowerCase()) : [];
  for (const [google, propio] of TIPOS_GOOGLE) if (lista.includes(google)) return propio;
  return null;
};

// Rangos de facturación mensual en soles. Se preguntan así —y no con un campo
// abierto— porque un rango basta para la aritmética y no obliga a nadie a
// confesar una cifra. El último es abierto por arriba y se calcula sobre su
// suelo: quedarse corto es el lado seguro del error.
const RANGOS = [
  { id: 'r1', desde: 5000, hasta: 15000 },
  { id: 'r2', desde: 15000, hasta: 30000 },
  { id: 'r3', desde: 30000, hasta: 60000 },
  { id: 'r4', desde: 60000, hasta: 120000 },
  { id: 'r5', desde: 120000, hasta: null },
];

const rangoPorId = (id) => RANGOS.find((r) => r.id === id) || null;

const redondearSoles = (n) => {
  // A centenas por debajo de 10 000 y a millares por encima. Un "S/2,347" finge
  // una exactitud que un intervalo no tiene; "S/2,300" se lee como estimación,
  // que es lo que es.
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10000 ? Math.round(n / 100) * 100 : Math.round(n / 1000) * 1000;
};

/**
 * Cuánto vale la diferencia de estrellas frente a una referencia.
 *
 * @param {object} p
 *   rating        el del negocio
 *   referencia    contra qué se compara (el líder de su zona, o el umbral 4.5)
 *   rangoId       id de RANGOS
 *   tipoNegocio   para decidir si el estudio aplica
 * @returns {null|object} `null` cuando no se puede afirmar nada
 */
const estimar = ({ rating, referencia, rangoId, tipoNegocio }) => {
  if (!aplicaA(tipoNegocio)) return null;

  const R = Number(rating), REF = Number(referencia);
  const rango = rangoPorId(rangoId);
  if (!rango || !Number.isFinite(R) || !Number.isFinite(REF)) return null;

  const brecha = Number((REF - R).toFixed(2));
  // Ya está en la referencia o por encima: no hay nada que "recuperar", y
  // fabricar una cifra igual sería vender miedo inventado.
  if (brecha <= 0) return null;

  // ⚠️ Por debajo de 0.1 la brecha cabe dentro del redondeo de Google (publica
  // la nota a un decimal), así que el número saldría de un ruido de medición.
  // Es el mismo umbral que ya vigila lib/progreso.js.
  if (brecha < 0.1) return null;

  const suelo = rango.desde;
  const techo = rango.hasta;

  const mensual = {
    // brecha × facturación × [5%, 9%]
    min: redondearSoles(suelo * brecha * ESTUDIO.minimo),
    // Sin techo, el máximo se calcula igual sobre el suelo: preferimos quedarnos
    // cortos antes que enseñarle a alguien una cifra que no puede sostener.
    max: redondearSoles((techo || suelo) * brecha * ESTUDIO.maximo),
  };

  return {
    brecha,
    rating: R,
    referencia: REF,
    rango: { desde: suelo, hasta: techo, abierto: !techo },
    mensual,
    anual: { min: mensual.min * 12, max: mensual.max * 12 },
    // Se devuelven los porcentajes para que el panel pueda enseñar la aritmética
    // completa. Una cifra de dinero que no se puede reconstruir a mano es una
    // cifra en la que no se puede confiar.
    porcentajes: { min: ESTUDIO.minimo, max: ESTUDIO.maximo },
    fuente: { cita: ESTUDIO.cita, url: ESTUDIO.url },
  };
};

module.exports = { estimar, aplicaA, desdeTiposGoogle, RANGOS, rangoPorId, TIPOS_APLICABLES, TIPOS_GOOGLE, ESTUDIO, redondearSoles };
