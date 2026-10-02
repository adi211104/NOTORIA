// brand-shield/src/lib/candado.js
//
// Candado para los trabajos programados (auditoría 2026-10-02, P1-09/P1-10).
//
// 🔴 Los cron viven en el mismo proceso que la API. Con UNA instancia de
// Railway eso funciona; con dos, la renovación de Culqi, los envíos a SUNAT y
// los correos correrían dos veces — y en la renovación eso es cobrar dos veces.
// Hoy hay una sola instancia, así que esto no arregla un incendio: impide que
// escalar horizontalmente lo provoque sin que nadie lo note.
//
// Cómo funciona: una fila por trabajo en `candados_job`. Tomar el candado es un
// UPDATE condicional (`hasta < ahora`) o un INSERT si la fila no existe; las dos
// operaciones son atómicas en Postgres, así que de dos instancias que lo pidan
// a la vez solo una gana. El candado CADUCA solo (`minutos`), para que un
// proceso que muere a mitad de la pasada no bloquee el trabajo para siempre.
//
// ⚠️ No usa `pg_advisory_lock`: es de SESIÓN, y Prisma reparte las consultas
// entre conexiones del pool — se tomaría en una conexión y se soltaría en otra.
//
// ⚠️ Si la base no responde, el trabajo NO corre (falla cerrado). Para todos
// los trabajos protegidos —cobrar, enviar a SUNAT, mandar correos— no correr
// una pasada es inofensivo (la siguiente recoge lo pendiente); correrla dos
// veces no lo es.

const crypto = require('crypto');
const prisma = require('./prisma');

// Identifica a ESTE proceso en la fila, para poder soltar solo lo propio.
const DUENIO = `${process.env.RAILWAY_REPLICA_ID || process.env.HOSTNAME || 'local'}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;

/** Intenta tomar el candado `nombre` durante `minutos`. Devuelve true si lo tomó. */
const tomar = async (nombre, minutos, cliente = prisma) => {
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + minutos * 60000);
  // 1) Si existe y está libre (caducado), se lo queda quien llegue primero.
  const r = await cliente.candadoJob.updateMany({
    where: { nombre, hasta: { lt: ahora } },
    data: { hasta, duenio: DUENIO, tomadoEn: ahora },
  });
  if (r.count === 1) return true;
  // 2) Si no existe, se crea. Dos creaciones simultáneas chocan contra la PK:
  //    la que pierde recibe P2002 y no corre.
  try {
    await cliente.candadoJob.create({ data: { nombre, hasta, duenio: DUENIO } });
    return true;
  } catch (e) {
    if (e.code === 'P2002') return false;
    throw e;
  }
};

/** Suelta el candado si es de este proceso (si caducó y lo tomó otro, no se toca). */
const soltar = async (nombre, cliente = prisma) => {
  await cliente.candadoJob.updateMany({
    where: { nombre, duenio: DUENIO },
    data: { hasta: new Date(0) },
  });
};

/**
 * Corre `fn` solo si este proceso consigue el candado. Pensado para envolver el
 * callback de un `cron.schedule`:
 *
 *     cron.schedule('0 5 * * *', exclusivo('renovaciones', 60, async () => { ... }))
 *
 * `minutos` tiene que ser MAYOR que lo que tarda la pasada más larga: si caduca
 * antes de terminar, otra instancia podría empezar la misma pasada.
 */
const exclusivo = (nombre, minutos, fn, cliente) => async (...args) => {
  const db = cliente || prisma;
  let tomado = false;
  try {
    tomado = await tomar(nombre, minutos, db);
  } catch (e) {
    console.error(`[Candado] ${nombre}: no se pudo comprobar el candado (${e.message}) — se omite la pasada`);
    return undefined;
  }
  if (!tomado) {
    console.log(`[Candado] ${nombre}: otra instancia ya está corriendo esta pasada — se omite`);
    return undefined;
  }
  try {
    return await fn(...args);
  } finally {
    await soltar(nombre, db).catch((e) => console.error(`[Candado] ${nombre}: no se pudo soltar (${e.message})`));
  }
};

module.exports = { exclusivo, tomar, soltar, DUENIO };

/**
 * `cron.schedule` con candado: el trabajo `nombre` corre en UNA sola instancia
 * aunque haya varias. Misma firma que `cron.schedule` más el nombre y la
 * duración máxima de la pasada, para que reemplazarlo sea una línea.
 */
const programar = (expresion, nombre, minutos, fn, opciones) =>
  require('node-cron').schedule(expresion, exclusivo(nombre, minutos, fn), opciones);

module.exports.programar = programar;
