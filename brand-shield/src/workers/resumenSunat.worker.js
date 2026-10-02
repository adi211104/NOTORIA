// brand-shield/src/workers/resumenSunat.worker.js
// Cola del resumen diario de boletas (RC).
//
// Las boletas NO se envían una a una: informarlas por resumen diario es
// obligatorio (RS 304-2024/SUNAT). De eso se ocupa este worker, mientras que
// `envioSunat.worker.js` manda las facturas individualmente. Son dos caminos
// distintos a propósito, con plazos distintos: 3 días la factura, 7 el resumen.
//
// El envío es ASÍNCRONO y esa es toda la dificultad del módulo. `sendSummary` no
// devuelve el CDR sino un TICKET, y el veredicto se pide después con
// `getStatus`. De ahí los dos pasos separados de cada ciclo:
//
//   1. agrupar y enviar  → PENDIENTE ─(ticket)→ EN_PROCESO
//   2. consultar ticket  → EN_PROCESO ─────────→ ACEPTADO | RECHAZADO
//
// ⚠️ Entre el paso 1 y el 2 el ticket vive en la base de datos, no en memoria.
// Si el proceso se cae después de enviar y el ticket se perdiera, no habría
// forma de saber si SUNAT aceptó, y reenviar el resumen sería un duplicado.

const cron = require('node-cron');
const { programar } = require('../lib/candado');
const prisma = require('../lib/prisma');
const tributario = require('../lib/tributario');
const ublResumen = require('../sunat/ublResumenBoletas');
const firma = require('../sunat/firmaXades');
const billService = require('../sunat/billService');
const { listoParaEmitir, esperaTrasIntento } = require('./envioSunat.worker');
const { getResend, FROM, base, h1, p } = require('../utils/emails');

const TIPO_RC = 'RC';

// Agrupa por día de emisión en hora de Perú. Con `toISOString()` las boletas
// emitidas después de las 19:00 de Lima caerían en el día siguiente y acabarían
// en el resumen equivocado (ver tributario.fechaPeru).
const diaDe = (fecha) => tributario.fechaPeru(fecha);

// Correlativo del próximo resumen generado HOY. El identificador lleva la fecha
// de generación, así que basta contar los que ya existen con ese prefijo.
const proximoCorrelativo = async (fechaGeneracion) => {
  const prefijo = `${TIPO_RC}-${diaDe(fechaGeneracion).replace(/-/g, '')}-`;
  const previos = await prisma.resumenSunat.count({ where: { identificador: { startsWith: prefijo } } });
  return previos + 1;
};

// Junta las boletas pendientes en resúmenes, uno por día de emisión.
//
// Solo agrupa días YA CERRADOS (anteriores a hoy en Perú). Un resumen informa un
// solo día, y si se mandara el de hoy a media tarde, las boletas emitidas
// después obligarían a un segundo resumen del mismo día. Esperar al día
// siguiente da un resumen por día y sobra plazo: hay 7 días.
// `incluirHoy` es una costura para las pruebas, no un atajo del producto.
//
// El cron NUNCA lo usa: agrupar el día en curso obligaría a un segundo resumen
// para las boletas que entren después, y ese es el motivo de que la regla
// exista. Pero para ejercitar el circuito contra SUNAT en el mismo día en que se
// emite la boleta —que es la única forma de verlo entero de una sentada— hace
// falta poder saltárselo a propósito y por una vez.
//
// Se hace así, con un parámetro que por defecto es `false`, en vez de copiar la
// función en un script: una copia probaría la copia. Ver
// `scripts/forzar-resumen-sunat.js`.
const agruparPendientes = async ({ incluirHoy = false } = {}) => {
  const boletas = await prisma.comprobante.findMany({
    where: { tipo: 'BOLETA', estadoSunat: 'PENDIENTE', resumenId: null },
    orderBy: { fechaEmision: 'asc' },
  });
  if (!boletas.length) return [];

  const hoy = diaDe(new Date());
  const porDia = new Map();
  for (const b of boletas) {
    const dia = diaDe(b.fechaEmision);
    if (!incluirHoy && dia >= hoy) continue; // el día de hoy todavía puede recibir más boletas
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(b);
  }

  const creados = [];
  for (const [dia, delDia] of porDia) {
    const correlativo = await proximoCorrelativo(new Date());
    const identificador = ublResumen.nombreDocumento(new Date(), correlativo);

    // El resumen y el enlace de sus boletas se escriben juntos: una boleta
    // marcada como incluida en un resumen que no llegó a existir no la
    // recogería nadie nunca más.
    const resumen = await prisma.$transaction(async (tx) => {
      const r = await tx.resumenSunat.create({
        data: {
          tipo: TIPO_RC,
          identificador,
          correlativo,
          fechaReferencia: delDia[0].fechaEmision,
          estado: 'PENDIENTE',
          fechaLimiteEnvio: tributario.calcularFechaLimiteResumen(delDia[0].fechaEmision),
        },
      });
      await tx.comprobante.updateMany({
        where: { id: { in: delDia.map((b) => b.id) } },
        data: { resumenId: r.id },
      });
      return r;
    });

    console.log(`[SUNAT] ${identificador} agrupa ${delDia.length} boleta(s) del ${dia}`);
    creados.push(resumen);
  }
  return creados;
};

// Construye, firma y envía un resumen. Devuelve la fila actualizada.
//
// Guarda el XML firmado ANTES de enviar, por el mismo motivo que en la cola de
// facturas: si el envío se corta, hay que poder reintentar con exactamente el
// mismo documento — regenerarlo daría otra firma.
const enviarResumen = async (resumen) => {
  const intentos = resumen.intentosEnvio + 1;
  const ahora = new Date();

  let xmlFirmado = resumen.xmlFirmado;
  try {
    if (!xmlFirmado) {
      const boletas = await prisma.comprobante.findMany({
        where: { resumenId: resumen.id },
        orderBy: { correlativo: 'asc' },
      });
      if (!boletas.length) throw new Error('El resumen no tiene boletas asociadas');

      const doc = ublResumen.construir({
        boletas,
        fechaGeneracion: resumen.creadoEn || ahora,
        correlativo: resumen.correlativo,
      });
      // El cbc:ID del XML y el nombre del archivo tienen que ser el mismo, y
      // ambos se derivan de la fecha de generación. Si el resumen se construye
      // un día distinto del que se creó la fila, dejarían de coincidir y SUNAT
      // lo rechazaría por algo que no se ve leyendo el XML.
      if (doc.id !== resumen.identificador) {
        throw new Error(`El identificador cambió: la fila dice ${resumen.identificador} y el XML ${doc.id}`);
      }
      xmlFirmado = firma.firmar(doc.xml).xml;
      await prisma.resumenSunat.update({ where: { id: resumen.id }, data: { xmlFirmado } });
    }
  } catch (error) {
    // Construir o firmar no falla por causas transitorias: reintentarlo cada 10
    // minutos hasta que venza el plazo no arreglaría nada.
    console.error(`[SUNAT] No se pudo preparar ${resumen.identificador}:`, error.message);
    const actualizado = await prisma.resumenSunat.update({
      where: { id: resumen.id },
      data: {
        estado: 'RECHAZADO',
        sunatMensaje: `Error al preparar el resumen: ${error.message}`,
        intentosEnvio: intentos,
        ultimoIntentoEn: ahora,
        proximoIntentoEn: null,
      },
    });
    await propagarABoletas(actualizado);
    await avisar('rechazado', actualizado);
    return actualizado;
  }

  const r = await billService.enviarResumen({
    xmlFirmado,
    nombreArchivo: ublResumen.nombreArchivo(resumen.identificador),
  });

  if (r.estado === 'EN_PROCESO') {
    console.log(`[SUNAT] ${resumen.identificador} enviado — ticket ${r.ticket}`);
    return prisma.resumenSunat.update({
      where: { id: resumen.id },
      data: {
        estado: 'EN_PROCESO',
        ticket: r.ticket,
        intentosEnvio: intentos,
        ultimoIntentoEn: ahora,
        // El veredicto no es inmediato: se consulta en el siguiente tick
        proximoIntentoEn: new Date(ahora.getTime() + 60_000),
      },
    });
  }

  if (r.estado === 'RECHAZADO') {
    console.error(`[SUNAT] ${resumen.identificador} RECHAZADO (${r.codigo}): ${r.mensaje}`);
    const actualizado = await prisma.resumenSunat.update({
      where: { id: resumen.id },
      data: {
        estado: 'RECHAZADO',
        sunatCodigo: r.codigo,
        sunatMensaje: r.mensaje,
        intentosEnvio: intentos,
        ultimoIntentoEn: ahora,
        proximoIntentoEn: null,
      },
    });
    await propagarABoletas(actualizado);
    await avisar('rechazado', actualizado);
    return actualizado;
  }

  const espera = esperaTrasIntento(intentos);
  console.warn(`[SUNAT] ${resumen.identificador} sin enviar (${r.mensaje}) — reintento en ${espera} min`);
  return prisma.resumenSunat.update({
    where: { id: resumen.id },
    data: {
      sunatMensaje: r.mensaje,
      intentosEnvio: intentos,
      ultimoIntentoEn: ahora,
      proximoIntentoEn: new Date(ahora.getTime() + espera * 60_000),
    },
  });
};

// Pide el veredicto de un resumen ya enviado.
//
// Un ticket entregado no significa aceptado: statusCode 98 es "sigue
// procesando" y hay que volver a preguntar.
const consultarResumen = async (resumen) => {
  const ahora = new Date();
  const r = await billService.consultarTicket({ ticket: resumen.ticket });

  if (r.estado === 'EN_PROCESO' || r.estado === 'ERROR_TRANSPORTE') {
    const espera = esperaTrasIntento(resumen.intentosEnvio);
    return prisma.resumenSunat.update({
      where: { id: resumen.id },
      data: {
        ultimoIntentoEn: ahora,
        proximoIntentoEn: new Date(ahora.getTime() + espera * 60_000),
      },
    });
  }

  const aceptado = r.estado === 'ACEPTADO';
  console[aceptado ? 'log' : 'error'](
    `[SUNAT] ${resumen.identificador} ${r.estado} (${r.codigo}): ${r.mensaje}`,
  );
  if (aceptado && r.notas?.length) {
    console.warn(`[SUNAT] ${resumen.identificador} con observaciones: ${r.notas.join(' | ')}`);
  }

  const actualizado = await prisma.resumenSunat.update({
    where: { id: resumen.id },
    data: {
      estado: r.estado,
      sunatCodigo: r.codigo,
      sunatMensaje: r.mensaje,
      cdrXml: r.cdrXml,
      enviadoEn: aceptado ? ahora : null,
      ultimoIntentoEn: ahora,
      proximoIntentoEn: null,
    },
  });

  await propagarABoletas(actualizado);
  if (!aceptado) await avisar('rechazado', actualizado);
  return actualizado;
};

// El veredicto es del resumen, pero cada boleta necesita reflejarlo: es lo que
// se consulta desde la pantalla de facturación y lo que decide si el
// comprobante existe para SUNAT.
//
// Solo se propagan estados finales. EN_PROCESO es del resumen y no de la
// boleta: `Comprobante.estadoSunat` no lo contempla, y escribirlo dejaría las
// boletas en un estado que ninguna pantalla sabe leer.
const FINALES = new Set(['ACEPTADO', 'RECHAZADO', 'VENCIDO']);

const propagarABoletas = async (resumen) => {
  if (!FINALES.has(resumen.estado)) return 0;
  const { count } = await prisma.comprobante.updateMany({
    where: { resumenId: resumen.id },
    data: {
      estadoSunat: resumen.estado,
      sunatCodigo: resumen.sunatCodigo,
      sunatMensaje: resumen.sunatMensaje,
      enviadoEn: resumen.enviadoEn,
    },
  });
  return count;
};

// Un resumen vencido deja sin validez tributaria a TODAS sus boletas de golpe,
// así que el aviso importa más que el de una factura suelta.
const avisar = async (motivo, resumen) => {
  const destino = process.env.EMAIL_CONTABILIDAD;
  if (!destino) return;

  const cuantas = await prisma.comprobante.count({ where: { resumenId: resumen.id } });
  const textos = {
    rechazado: {
      asunto: `SUNAT rechazó el resumen diario ${resumen.identificador}`,
      titulo: 'Resumen diario rechazado por SUNAT',
      cuerpo: 'SUNAT rechazó este resumen diario. Las boletas que agrupa no quedan informadas: hay que corregir el error y rehacer el resumen.',
    },
    vencido: {
      asunto: `Venció el plazo del resumen diario ${resumen.identificador}`,
      titulo: 'Plazo del resumen diario vencido',
      cuerpo: `Pasaron los ${tributario.PLAZO_RESUMEN_DIAS} días calendario de plazo sin que SUNAT aceptara este resumen. Las boletas que agrupa quedaron sin informar y requieren revisión manual.`,
    },
  }[motivo];

  try {
    await getResend().emails.send({
      from: FROM(), to: destino,
      subject: textos.asunto,
      html: base(`
        ${h1(textos.titulo)}
        ${p(textos.cuerpo)}
        ${p(`Resumen: <strong>${resumen.identificador}</strong><br>Boletas afectadas: ${cuantas}<br>Día informado: ${diaDe(resumen.fechaReferencia)}`)}
        ${p(`Respuesta de SUNAT: <strong>${resumen.sunatCodigo || '—'}</strong> ${resumen.sunatMensaje || ''}`)}
      `),
    });
  } catch (e) {
    console.error('[SUNAT] No se pudo avisar por correo:', e.message);
  }
};

// Marca los resúmenes que ya pasaron el plazo legal. Se hace antes de enviar: no
// tiene sentido gastar intentos en algo que ya perdió validez.
const marcarVencidos = async () => {
  const vencidos = await prisma.resumenSunat.findMany({
    where: { estado: { in: ['PENDIENTE', 'EN_PROCESO'] }, fechaLimiteEnvio: { lt: new Date() } },
  });

  for (const r of vencidos) {
    console.error(`[SUNAT] ${r.identificador} VENCIDO — pasaron los ${tributario.PLAZO_RESUMEN_DIAS} días de plazo`);
    const actualizado = await prisma.resumenSunat.update({
      where: { id: r.id },
      data: { estado: 'VENCIDO', proximoIntentoEn: null },
    });
    await propagarABoletas(actualizado);
    await avisar('vencido', actualizado);
  }
  return vencidos.length;
};

// Un ciclo completo. Exportada aparte del cron para poder invocarla en pruebas y
// tras un despliegue sin esperar al siguiente tick.
const procesarResumenes = async ({ limite = 10 } = {}) => {
  if (!listoParaEmitir()) return { procesados: 0, omitido: 'emisión SUNAT no activa' };

  await marcarVencidos();
  await agruparPendientes();

  const ahora = new Date();
  const pendientes = await prisma.resumenSunat.findMany({
    where: {
      estado: { in: ['PENDIENTE', 'EN_PROCESO'] },
      OR: [{ proximoIntentoEn: null }, { proximoIntentoEn: { lte: ahora } }],
    },
    orderBy: { creadoEn: 'asc' }, // los más antiguos primero: son los más cerca del plazo
    take: limite,
  });

  let aceptados = 0;
  for (const r of pendientes) {
    try {
      // Un resumen con ticket ya viajó: lo que toca es preguntar por él, no
      // reenviarlo. Reenviar sería un duplicado.
      const actualizado = r.ticket && r.estado === 'EN_PROCESO'
        ? await consultarResumen(r)
        : await enviarResumen(r);
      if (actualizado.estado === 'ACEPTADO') aceptados++;
    } catch (error) {
      console.error(`[SUNAT] Error inesperado con ${r.identificador}:`, error.message);
    }
    // SUNAT limita la frecuencia; espaciar evita 401 por saturación
    await new Promise((res) => setTimeout(res, 2000));
  }

  return { procesados: pendientes.length, aceptados };
};

const iniciarResumenSunat = () => {
  if (!listoParaEmitir()) {
    console.log('[SUNAT] Resumen diario inactivo (falta SUNAT_EMISION_ACTIVA, certificado o credenciales SOL)');
    return;
  }
  // Desfasado 5 minutos respecto de la cola de facturas para no pegarle a SUNAT
  // con las dos cosas a la vez y provocar el 401 de saturación.
  programar('5-59/10 * * * *', 'resumen-sunat', 9, () => (
    procesarResumenes().catch((e) => console.error('[SUNAT] Error en el resumen diario:', e.message))
  ));
  console.log(`[SUNAT] Resumen diario activo cada 10 min — entorno ${billService.entorno()}`);
};

module.exports = {
  iniciarResumenSunat, procesarResumenes, agruparPendientes,
  enviarResumen, consultarResumen, marcarVencidos, propagarABoletas,
  // Para `scripts/anular-boleta.js`: la anulación arma su propio resumen (con
  // las líneas en estado 3) y necesita el mismo contador de correlativos, no
  // uno paralelo — dos series de RC del mismo día chocarían en el identificador.
  proximoCorrelativo, TIPO_RC,
};
