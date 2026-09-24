// ¿Google nos sigue contestando? — 2026-09-22
//
// 🔴 POR QUÉ EXISTE, Y ES EL FALLO MÁS SILENCIOSO QUE HA TENIDO ESTE PROYECTO.
//
// El 21/09 Google avisó de que la cuenta de facturación no tiene un medio de pago
// válido y de que el proyecto de producción «podría suspenderse». Al ir a ver qué
// pasaría el día que lo suspendieran de verdad, apareció esto:
//
//   · Places NO devuelve un error HTTP cuando rechaza. Devuelve **200** con un campo
//     `status` que dice `REQUEST_DENIED`, así que el `catch` del scraper ni se entera.
//   · El scraper hacía `if (data.status !== 'OK') return null;` — **sin una sola línea
//     de log**. El motivo del rechazo se tiraba a la basura.
//   · El worker trata ese `null` como «no se pudo leer» y sigue con el siguiente
//     negocio, que es lo correcto ante un fallo puntual.
//   · El monitor de uptime comprueba `/health` y el landing, y los dos seguirían
//     respondiendo 200 perfectamente.
//
// O sea: con la facturación cortada, el producto entero deja de vigilar y **nada lo
// dice**. Ni una excepción, ni un log, ni un correo. El cliente vería el historial de
// su ficha congelarse, y nada más. Es «no hay alertas» contra «no pude consultarlas»
// (§16) aplicado al proveedor, que es el sitio donde más caro sale.
//
// ⚠️ LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO: no llama a Places para comprobar nada.
// Una sonda sintética cada 5 minutos serían ~8 600 consultas al mes, más que todo lo
// que gasta la plataforma (§8.7). Se mira el resultado del tráfico REAL, que además es
// mejor señal: dice si las llamadas que de verdad importan están pasando.

// Lo que Places puede contestar, y qué significa cada cosa. La distinción que sostiene
// todo el módulo es la de la primera fila: `ZERO_RESULTS` y `NOT_FOUND` son la API
// FUNCIONANDO —el sitio no existe o no tiene lo que se pidió—, y contarlos como fallo
// haría que el monitor gritara cada vez que se busca un negocio que no está.
const RESPONDE = ['OK', 'ZERO_RESULTS', 'NOT_FOUND'];

// 🔴 Estos dos son la alarma: no dicen nada del lugar consultado, dicen que la CUENTA
// o la llave no pueden usar la API. `REQUEST_DENIED` es lo que devuelve una
// facturación suspendida o una llave revocada; `OVER_QUERY_LIMIT`, un tope alcanzado.
const RECHAZA_LA_CUENTA = ['REQUEST_DENIED', 'OVER_QUERY_LIMIT'];

// ⚠️ `INVALID_REQUEST` y `UNKNOWN_ERROR` quedan fuera de las dos listas a propósito:
// el primero es un error NUESTRO (un parámetro mal construido) y el segundo es
// transitorio del lado de Google. Ninguno significa que nos hayan cortado, y meterlos
// en la alarma la convertiría en ruido — que es como se pierde la alarma de verdad.

// Cuántos rechazos seguidos hacen falta para declararlo. Uno solo puede ser un
// hipo; tres seguidos, con el escaneo pasando por negocios distintos, no lo son.
const RECHAZOS_PARA_ALARMA = 3;

// El contador vive en memoria y se pierde al reiniciar, y eso es ACEPTABLE porque
// se re-arma solo: si el rechazo sigue, el siguiente ciclo del cron lo vuelve a subir
// en minutos. Persistirlo exigiría una tabla para un dato que caduca en una hora.
// ⚠️ Lo que NO se puede perder al reiniciar es la otra mitad —«¿el escaneo sigue
// produciendo?»—, y por eso esa se deriva de los snapshots, que están en la base.
const registro = {
  ultimoOk: null,
  ultimoRechazo: null,
  motivoUltimoRechazo: null,
  rechazosSeguidos: 0,
  totalOk: 0,
  totalRechazos: 0,
};

/**
 * Se llama en CADA respuesta de Places, con el `status` que vino en el cuerpo — o
 * con `'ERROR_RED'` si la petición ni siquiera llegó.
 * Devuelve el `status` tal cual para poder encadenarla sin cambiar el flujo.
 */
const registrar = (status) => {
  const ahora = new Date();
  if (RESPONDE.includes(status)) {
    registro.ultimoOk = ahora;
    registro.rechazosSeguidos = 0;
    registro.totalOk += 1;
  } else if (RECHAZA_LA_CUENTA.includes(status)) {
    registro.ultimoRechazo = ahora;
    registro.motivoUltimoRechazo = status;
    registro.rechazosSeguidos += 1;
    registro.totalRechazos += 1;
  }
  // El resto (INVALID_REQUEST, UNKNOWN_ERROR, ERROR_RED) no mueve ningún contador:
  // ni confirma que la cuenta esté viva ni prueba que esté cortada.
  return status;
};

/** ¿Google está rechazando a la cuenta? */
const rechazando = () => registro.rechazosSeguidos >= RECHAZOS_PARA_ALARMA;

const estadoPlaces = () => ({
  rechazando: rechazando(),
  motivo: rechazando() ? registro.motivoUltimoRechazo : null,
  rechazosSeguidos: registro.rechazosSeguidos,
  ultimoOk: registro.ultimoOk,
  ultimoRechazo: registro.ultimoRechazo,
  totalOk: registro.totalOk,
  totalRechazos: registro.totalRechazos,
});

/** Solo para las pruebas: deja el registro como recién arrancado. */
const reiniciar = () => {
  registro.ultimoOk = null;
  registro.ultimoRechazo = null;
  registro.motivoUltimoRechazo = null;
  registro.rechazosSeguidos = 0;
  registro.totalOk = 0;
  registro.totalRechazos = 0;
};

// ── La otra mitad: ¿el escaneo sigue PRODUCIENDO? ────────────────────────────
//
// El contador de arriba caza el rechazo en minutos, pero muere al reiniciar y solo
// habla de Places. Esta mitad es lenta y durable, y cubre un fallo distinto que hoy
// tampoco tiene quien lo vea: **que el cron se pare del todo**.
//
// 🔴 Se DERIVA de los snapshots, que es el rastro que el worker ya deja. Sin columna
// nueva y sin nada que sincronizar — el mismo criterio que la pausa de cuentas (§8.9)
// y que «pendiente de anular» (§9).

// Margen sobre la cadencia más rápida antes de declarar que el escaneo se paró. Con
// un negocio cada 4 h, son 12 h de silencio. Tres ciclos perdidos no son un hipo.
const MARGEN_CADENCIA = 3;

/**
 * ⚠️ La pregunta que tiene que distinguir, y es lo único interesante de esta función:
 * «no hay snapshots recientes» significa cosas OPUESTAS según si había algo que
 * escanear. Con todas las cuentas pausadas, cero snapshots es la respuesta CORRECTA y
 * alarmar sería exactamente el ruido que este monitor existe para no producir.
 */
const estadoEscaneo = async (prisma, dormancia, ahora = new Date()) => {
  const usuarios = await prisma.usuario.findMany({
    select: {
      plan: true, creadoEn: true, ultimoAcceso: true, emailVerificado: true,
      negocios: { where: { activo: true }, select: { id: true } },
    },
  });

  // Los que de verdad le tocan al cron: cuenta despierta y con negocio activo.
  const cadencias = usuarios
    .filter((u) => u.negocios.length > 0 && !dormancia.estaDormida(u))
    .map((u) => dormancia.horasEscaneo(u))
    .filter((h) => typeof h === 'number' && h > 0);

  if (cadencias.length === 0) {
    return { vigilando: false, motivo: 'NADA_QUE_VIGILAR', ultimoSnapshot: null, umbralHoras: null };
  }

  const umbralHoras = Math.min(...cadencias) * MARGEN_CADENCIA;
  const ultimo = await prisma.snapshot.findFirst({
    orderBy: { tomadoEn: 'desc' },
    select: { tomadoEn: true },
  });

  const horasSin = ultimo ? (ahora - ultimo.tomadoEn) / 36e5 : null;
  return {
    vigilando: true,
    negociosVigilados: cadencias.length,
    ultimoSnapshot: ultimo ? ultimo.tomadoEn : null,
    horasSinSnapshot: horasSin === null ? null : Number(horasSin.toFixed(1)),
    umbralHoras,
    detenido: horasSin === null || horasSin > umbralHoras,
  };
};

/**
 * El veredicto que lee el monitor. NUNCA lanza: un fallo al comprobar es un dato,
 * no una excepción — si esto reventara, el monitor leería un 500 y no sabría de qué.
 */
const veredicto = async (prisma, dormancia, ahora = new Date()) => {
  const places = estadoPlaces();
  let escaneo = null;
  let error = null;
  try {
    escaneo = await estadoEscaneo(prisma, dormancia, ahora);
  } catch (e) {
    error = e.message;
  }

  let vigilancia = 'ok';
  let detalle = null;

  if (places.rechazando) {
    vigilancia = 'google_rechaza';
    detalle = `Places devuelve ${places.motivo} (${places.rechazosSeguidos} seguidos). `
      + 'Casi siempre es la facturación del proyecto de Google Cloud o la llave.';
  } else if (error) {
    // 🔴 Esto es rojo, y no por lo que parece. Lo único que esta función consulta es la
    // base: si no se puede, el producto entero está caído —login incluido— aunque
    // `/health` siga contestando 200, porque `/health` no toca la base.
    vigilancia = 'sin_comprobar';
    detalle = `No se pudo consultar la base: ${error}`;
  } else if (escaneo.vigilando && escaneo.detenido) {
    vigilancia = 'escaneo_detenido';
    detalle = `${escaneo.negociosVigilados} negocio(s) por vigilar y `
      + `${escaneo.horasSinSnapshot ?? '∞'} h sin un solo snapshot `
      + `(el umbral son ${escaneo.umbralHoras} h).`;
  }

  return { vigilancia, detalle, places, escaneo };
};

module.exports = {
  RESPONDE,
  RECHAZA_LA_CUENTA,
  RECHAZOS_PARA_ALARMA,
  MARGEN_CADENCIA,
  registrar,
  rechazando,
  estadoPlaces,
  estadoEscaneo,
  veredicto,
  reiniciar,
};
