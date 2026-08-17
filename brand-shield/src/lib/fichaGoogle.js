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
// ── Dónde se guarda la referencia, y por qué ahí ────────────────────────────
// Detectar un CAMBIO exige recordar el valor anterior, y no hay columna libre en
// `Negocio` para eso. Añadirla obligaría a un `prisma db push` contra la base de
// producción **antes** de desplegar, y Railway no lo corre en el deploy: el
// código nuevo se estrellaría contra una tabla sin la columna.
//
// Así que la referencia vive en una fila de `Alerta` marcada como de control
// (`detalle.motivo = 'ficha_control'`), que se crea una sola vez por negocio y
// después se actualiza en cada lectura. Se excluye de todo lo que el usuario ve.
//
// Es un compromiso consciente y tiene su precio: ensucia una tabla que significa
// "cosas que contarle al dueño". El arreglo definitivo es una columna
// `fichaGoogleRef Json?` en `Negocio`; queda anotado en los pendientes de
// CLAUDE.md junto con los otros cambios que esperan un `db push`.

const crypto = require('crypto');
const prisma = require('./prisma');

const MOTIVO_CONTROL = 'ficha_control';
const PLANES_CON_VIGILANCIA = ['NEGOCIO', 'FRANQUICIA'];

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

// Foto de los datos que se vigilan, tal como llegan de Places.
const fotoDeFicha = (result) => ({
  telefono: result?.formatted_phone_number || null,
  direccion: result?.formatted_address || null,
  nombre: result?.name || null,
  horarioHash: hashHorario(result?.opening_hours?.weekday_text),
  horarioTexto: result?.opening_hours?.weekday_text || null,
});

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

// La fila de control del negocio, si existe.
const leerReferencia = async (negocioId) => {
  const fila = await prisma.alerta.findFirst({
    where: { negocioId, detalle: { path: ['motivo'], equals: MOTIVO_CONTROL } },
    orderBy: { creadaEn: 'desc' },
    select: { id: true, detalle: true },
  });
  if (!fila) return { id: null, foto: null };
  const { motivo, ...foto } = fila.detalle || {};
  return { id: fila.id, foto };
};

const guardarReferencia = async (negocioId, id, foto) => {
  const detalle = { motivo: MOTIVO_CONTROL, ...foto };
  if (id) {
    await prisma.alerta.update({ where: { id }, data: { detalle } });
    return;
  }
  await prisma.alerta.create({
    data: {
      // Va con el mismo enum que la alerta de ficha cerrada por el mismo motivo:
      // añadir un valor a TipoAlerta exige `db push`. Da igual cuál sea, porque
      // esta fila nunca se le muestra al usuario.
      tipo: 'RESENA_MUY_NEGATIVA',
      plataforma: 'GOOGLE',
      descripcion: '(control interno de la ficha de Google — no se muestra)',
      detalle,
      negocioId,
      leida: true,
      notificada: true,
    },
  });
};

/**
 * Revisa la ficha y devuelve los cambios detectados. Guarda la nueva referencia.
 *
 * La PRIMERA vez que corre no devuelve nada: solo deja la foto inicial. Avisar
 * de un "cambio" la primera vez sería avisar de que existe un teléfono.
 */
const revisarDatosDeFicha = async (negocio, resultadoPlaces) => {
  if (!puedeVigilarFicha(negocio.usuario?.plan)) return [];

  const ahora = fotoDeFicha(resultadoPlaces);
  // Sin ningún dato de contacto no hay nada que vigilar ni que guardar
  if (!ahora.telefono && !ahora.horarioHash && !ahora.direccion) return [];

  const { id, foto: antes } = await leerReferencia(negocio.id);
  await guardarReferencia(negocio.id, id, ahora);

  if (!antes) return []; // primera lectura: solo se establece la referencia
  return compararFichas(antes, ahora);
};

// 🔴 Filtro obligatorio en TODA consulta a `alerta` cuyo resultado vea el
// usuario: la lista del panel, los contadores, el resumen por correo y el PDF.
//
// La fila de control no es una alerta, es estado interno. Si se cuela, el cliente
// ve una alerta con el texto «(control interno de la ficha de Google…)» y deja de
// confiar en las demás.
//
// Va acá y no en cada ruta para que un call-site nuevo lo importe en vez de
// redescubrirlo — y para que el día que la referencia se mude a su propia
// columna, esto se borre de un solo sitio.
const SIN_CONTROL = { NOT: { detalle: { path: ['motivo'], equals: MOTIVO_CONTROL } } };

module.exports = {
  revisarDatosDeFicha,
  compararFichas,
  fotoDeFicha,
  puedeVigilarFicha,
  CAMPOS_CONTACTO,
  MOTIVO_CONTROL,
  SIN_CONTROL,
};
