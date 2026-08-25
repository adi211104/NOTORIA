// brand-shield/src/lib/fichaGoogle.js
//
// Vigilancia de los DATOS de la ficha de Google: teléfono, horario, nombre y
// dirección. Complementa la vigilancia de `business_status` que ya vive en el
// worker (§25.6) y que detecta el caso catastrófico: la ficha marcada como
// cerrada.
//
// ── Por qué importa ─────────────────────────────────────────────────────────
// Google Maps deja que cualquiera sugiera cambios sobre la ficha de un negocio
// ajeno, y los aplica sin avisarle al dueño. Un teléfono cambiado es un negocio
// que deja de recibir llamadas sin saber por qué; un horario cambiado son
// clientes que llegan y encuentran cerrado, y que además dejan una reseña de 1★
// por el viaje perdido. Nadie mira su propia ficha a diario.
//
// ── Por qué solo en planes de pago ──────────────────────────────────────────
// `formatted_phone_number` y `opening_hours` son del grupo **Contact Data** de
// Place Details, que se factura aparte del Basic que la llamada ya paga. O sea
// que esto SÍ cuesta dinero por escaneo, a diferencia de `business_status`.
// Encenderlo para todos multiplicaría la factura del plan Gratis, que ya se
// arregló una vez por lo mismo (§25.5). Va en NEGOCIO y FRANQUICIA.
//
// ── Dónde se guarda la referencia ───────────────────────────────────────────
// Detectar un CAMBIO exige recordar el valor anterior, y desde el 2026-08-18 eso
// vive en `Negocio.fichaGoogleRef`, que es su sitio.
//
// Hasta entonces vivía en una fila de la tabla `Alerta` marcada como de control,
// porque añadir la columna exigía un `prisma db push` que Railway no corre en el
// deploy. Funcionaba, pero tenía un precio que se pagaba en seis sitios: había
// que excluir esa fila de la lista del panel, del contador, del detalle del
// negocio, del resumen por correo, del PDF mensual y del correo del día 5 del
// drip. Un solo sitio que se olvidara —y pasó con el drip, que usaba el filtro
// sin importarlo— y el cliente veía una alerta que no existía.
//
// La migración de las filas viejas la hace `scripts/migrar-ficha-ref.js`.

const crypto = require('crypto');
const prisma = require('./prisma');
const { planesCon } = require('./planes');

// Quién paga el grupo Contact Data de Places. Desde el 2026-08-24 también
// IMPULSO: es justamente lo que hace comprable ese plan (ver lib/planes.js).
const PLANES_CON_VIGILANCIA = planesCon('vigilanciaFicha');

const puedeVigilarFicha = (plan) => PLANES_CON_VIGILANCIA.includes(plan);

// Campos extra que hay que pedirle a Place Details para esta vigilancia. Se
// exportan para que el scraper los añada SOLO cuando corresponde: son los que
// tienen costo.
const CAMPOS_CONTACTO = 'formatted_phone_number,opening_hours,formatted_address';

// El horario llega como un array de 7 frases ("lunes: 12:00–23:00", …). Guardarlo
// entero en el detalle de una alerta lo hincharía sin necesidad, así que se
// guarda un hash y se conserva el texto solo para poder decirle al dueño qué
// cambió — que es la mitad del valor del aviso.
const hashHorario = (weekdayText) => {
  if (!Array.isArray(weekdayText) || !weekdayText.length) return null;
  return crypto.createHash('sha256').update(weekdayText.join('|')).digest('hex').slice(0, 16);
};

// Cada cuánto se releen los datos de CONTACTO (teléfono, horario, nombre,
// dirección).
//
// 🔴 Son el grupo Contact Data de Places, que se factura aparte del Basic que la
// llamada ya paga, y hasta el 2026-08-25 se pedían en CADA escaneo: en
// Franquicia eso son 720 lecturas al mes de un dato que un negocio cambia una o
// dos veces en su vida. La ficha cerrada —que es la urgente— NO pasa por acá:
// `business_status` va en Basic Data y se sigue mirando en cada ciclo, gratis.
//
// 24 h es exactamente lo que promete la web («te avisamos el mismo día si algo
// cambió»), así que el acelerador no recorta ninguna promesa.
const HORAS_CONTACTO = 24;

// Foto de los datos que se vigilan, tal como llegan de Places.
//
// ⚠️ `_leidoEn` NO es un dato de la ficha: es la marca de cuándo se pidió por
// última vez el grupo Contact Data, y vive dentro de este JSON para no añadir
// una columna. `compararFichas` solo mira campos con nombre propio, así que una
// clave extra no puede colarse como un "cambio" — pero si alguna vez esa
// comparación pasa a recorrer claves genéricamente, hay que excluir las que
// empiezan por `_`.
const fotoDeFicha = (result) => ({
  telefono: result?.formatted_phone_number || null,
  direccion: result?.formatted_address || null,
  nombre: result?.name || null,
  horarioHash: hashHorario(result?.opening_hours?.weekday_text),
  horarioTexto: result?.opening_hours?.weekday_text || null,
  _leidoEn: new Date().toISOString(),
});

/**
 * ¿Toca volver a pedirle a Places los campos de contacto de este negocio?
 *
 * `true` también cuando nunca se han leído (ref ausente, o una ref antigua de
 * antes de que existiera `_leidoEn`): la primera lectura no se puede aplazar,
 * porque es la que establece la referencia contra la que se compara todo.
 */
const tocaLeerContacto = (negocio, ahora = Date.now()) => {
  if (!puedeVigilarFicha(negocio?.usuario?.plan)) return false;
  const marca = negocio?.fichaGoogleRef?._leidoEn;
  if (!marca) return true;
  const t = Date.parse(marca);
  if (Number.isNaN(t)) return true;
  return ahora - t >= HORAS_CONTACTO * 60 * 60 * 1000;
};

// Qué cambió entre dos fotos. Devuelve una lista de cambios legibles, ya
// redactados para el correo: el worker no tiene que saber de esto.
//
// ⚠️ Un valor que pasa de tener contenido a `null` NO se reporta como cambio.
// Places omite campos de forma intermitente —sobre todo `opening_hours`— y
// avisar de "te borraron el horario" cada vez que Google tiene un mal día
// convertiría esta alerta en ruido, que es exactamente lo que la mataría.
const compararFichas = (antes, ahora) => {
  const cambios = [];
  if (!antes || !ahora) return cambios;

  if (antes.telefono && ahora.telefono && antes.telefono !== ahora.telefono) {
    cambios.push({
      campo: 'telefono',
      texto: `El teléfono de tu ficha cambió: antes decía ${antes.telefono} y ahora dice ${ahora.telefono}.`,
    });
  }
  if (antes.nombre && ahora.nombre && antes.nombre !== ahora.nombre) {
    cambios.push({
      campo: 'nombre',
      texto: `El nombre de tu ficha cambió: antes decía «${antes.nombre}» y ahora dice «${ahora.nombre}».`,
    });
  }
  if (antes.direccion && ahora.direccion && antes.direccion !== ahora.direccion) {
    cambios.push({
      campo: 'direccion',
      texto: `La dirección de tu ficha cambió: antes decía ${antes.direccion} y ahora dice ${ahora.direccion}.`,
    });
  }
  if (antes.horarioHash && ahora.horarioHash && antes.horarioHash !== ahora.horarioHash) {
    // Se dicen los días concretos que cambiaron, no un "cambió el horario" a
    // secas: el dueño tiene que poder verificarlo sin abrir Google.
    const dias = (ahora.horarioTexto || []).filter((linea, i) => linea !== (antes.horarioTexto || [])[i]);
    const detalle = dias.length && dias.length <= 3 ? ` Ahora dice: ${dias.join('; ')}.` : '';
    cambios.push({
      campo: 'horario',
      texto: `El horario de tu ficha cambió en Google.${detalle}`,
    });
  }
  return cambios;
};

/**
 * Revisa la ficha y devuelve los cambios detectados. Guarda la nueva referencia.
 *
 * La PRIMERA vez que corre no devuelve nada: solo deja la foto inicial. Avisar
 * de un "cambio" la primera vez sería avisar de que existe un teléfono.
 *
 * `negocio.fichaGoogleRef` puede venir sin cargar si el llamador no la pidió en
 * su `select`; por eso se lee de la fila cuando no está, en vez de dar por hecho
 * que un `undefined` significa «nunca se ha medido» — eso volvería a poner la
 * referencia a cero en cada ciclo y la detección no dispararía jamás.
 */
const revisarDatosDeFicha = async (negocio, resultadoPlaces) => {
  if (!puedeVigilarFicha(negocio.usuario?.plan)) return [];

  const ahora = fotoDeFicha(resultadoPlaces);

  const antes = negocio.fichaGoogleRef !== undefined
    ? negocio.fichaGoogleRef
    : (await prisma.negocio.findUnique({
        where: { id: negocio.id },
        select: { fichaGoogleRef: true },
      }))?.fichaGoogleRef;

  // Sin ningún dato de contacto no hay nada que vigilar ni que guardar.
  //
  // ⚠️ Pero SÍ hay que dejar constancia de que se leyó, y por eso este bloque
  // dejó de ser un `return` seco. Si no, `tocaLeerContacto` no vería nunca la
  // marca y volvería a pagar Contact Data en cada ciclo, para siempre, en la
  // única ficha en la que ese gasto no puede servir de nada.
  //
  // Se conserva `antes` en vez de pisarlo con la foto vacía: Places omite
  // campos de forma intermitente, y guardar los nulos borraría la referencia
  // buena — que es la misma razón por la que un valor que pasa a `null` tampoco
  // se reporta como cambio.
  if (!ahora.telefono && !ahora.horarioHash && !ahora.direccion) {
    await prisma.negocio.update({
      where: { id: negocio.id },
      data: { fichaGoogleRef: { ...(antes || {}), _leidoEn: ahora._leidoEn } },
    });
    return [];
  }

  await prisma.negocio.update({
    where: { id: negocio.id },
    data: { fichaGoogleRef: ahora },
  });

  if (!antes) return []; // primera lectura: solo se establece la referencia
  return compararFichas(antes, ahora);
};

// `SIN_CONTROL` vivía acá y ya no existe: era el filtro que había que aplicar en
// seis consultas distintas para esconder la fila de control de la tabla `Alerta`.
// Con la referencia en `Negocio.fichaGoogleRef` no hay nada que esconder, así que
// esas seis consultas volvieron a ser lo que dicen ser.

module.exports = {
  revisarDatosDeFicha,
  compararFichas,
  fotoDeFicha,
  puedeVigilarFicha,
  CAMPOS_CONTACTO,
  // El acelerador de Contact Data. Se exporta porque romperlo no produce
  // ninguna señal: la vigilancia sigue funcionando igual de bien y lo único que
  // cambia es la factura de Google.
  tocaLeerContacto,
  HORAS_CONTACTO,
};
