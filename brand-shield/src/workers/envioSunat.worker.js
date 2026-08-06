// brand-shield/src/workers/envioSunat.worker.js
// Cola de envío de comprobantes a SUNAT.
//
// Por qué una cola y no un envío directo dentro del cobro: SUNAT se cae, tarda
// o devuelve 401 por saturación, y el cobro del cliente no puede depender de
// eso. Pero tampoco se puede posponer indefinidamente — hay un plazo legal de
// 3 días calendario desde el día siguiente a la emisión, y pasado ese punto el
// comprobante pierde validez tributaria aunque ya se lo hayamos entregado al
// cliente. De ahí que el worker reintente con espera creciente y avise a la
// empresa antes de que el plazo se agote.

const cron = require('node-cron');
const prisma = require('../lib/prisma');
const tributario = require('../lib/tributario');
const ubl = require('../sunat/ublInvoice');
const firma = require('../sunat/firmaXades');
const billService = require('../sunat/billService');
const certificado = require('../sunat/certificado');
const { getResend, FROM, base, h1, p } = require('../utils/emails');

// Espera antes del siguiente intento, en minutos, según cuántos van. Arranca
// corto (un 401 de saturación se resuelve solo) y se abre para no golpear a
// SUNAT si el problema es más de fondo.
const ESPERAS = [1, 5, 15, 60, 180, 360];

const esperaTrasIntento = (intentos) => ESPERAS[Math.min(intentos, ESPERAS.length - 1)];

const listoParaEmitir = () =>
  process.env.SUNAT_EMISION_ACTIVA === 'true' && certificado.configurado() && billService.configurado();

// Genera, firma y envía un comprobante. Devuelve el comprobante actualizado.
//
// Guarda el XML firmado ANTES de enviarlo: si el envío se corta a mitad, hace
// falta poder reintentar con exactamente el mismo documento — regenerarlo
// produciría otra firma y, si SUNAT ya había recibido el primero, un conflicto.
const enviarComprobante = async (comprobante) => {
  const intentos = comprobante.intentosEnvio + 1;

  let xmlFirmado = comprobante.xmlFirmado;
  let digest = comprobante.hashFirma;
  let nombreArchivo;

  try {
    const construido = ubl.construir(comprobante);
    nombreArchivo = construido.nombreArchivo;

    if (!xmlFirmado) {
      const firmado = firma.firmar(construido.xml);
      xmlFirmado = firmado.xml;
      digest = firmado.digest;
      await prisma.comprobante.update({
        where: { id: comprobante.id },
        data: { xmlFirmado, hashFirma: digest },
      });
    }
  } catch (error) {
    // Falla al construir o firmar: no es transitorio, no tiene sentido
    // reintentarlo cada 15 minutos hasta que venza el plazo.
    console.error(`[SUNAT] No se pudo preparar ${comprobante.numero}:`, error.message);
    return prisma.comprobante.update({
      where: { id: comprobante.id },
      data: {
        estadoSunat: 'RECHAZADO',
        sunatMensaje: `Error al preparar el documento: ${error.message}`,
        intentosEnvio: intentos,
        ultimoIntentoEn: new Date(),
        proximoIntentoEn: null,
      },
    });
  }

  const r = await billService.enviar({ xmlFirmado, nombreArchivo });
  const ahora = new Date();

  if (r.aceptado) {
    console.log(`[SUNAT] ${comprobante.numero} aceptado — ${r.mensaje}`);
    if (r.notas?.length) console.warn(`[SUNAT] ${comprobante.numero} con observaciones: ${r.notas.join(' | ')}`);
    return prisma.comprobante.update({
      where: { id: comprobante.id },
      data: {
        estadoSunat: 'ACEPTADO',
        sunatCodigo: r.codigo,
        sunatMensaje: r.mensaje,
        cdrXml: r.cdrXml,
        enviadoEn: ahora,
        intentosEnvio: intentos,
        ultimoIntentoEn: ahora,
        proximoIntentoEn: null,
      },
    });
  }

  if (r.estado === 'RECHAZADO') {
    // Rechazo de fondo: el documento está mal y reintentarlo igual no cambia
    // nada. Requiere corregir y reemitir con otro correlativo.
    console.error(`[SUNAT] ${comprobante.numero} RECHAZADO (${r.codigo}): ${r.mensaje}`);
    const actualizado = await prisma.comprobante.update({
      where: { id: comprobante.id },
      data: {
        estadoSunat: 'RECHAZADO',
        sunatCodigo: r.codigo,
        sunatMensaje: r.mensaje,
        intentosEnvio: intentos,
        ultimoIntentoEn: ahora,
        proximoIntentoEn: null,
      },
    });
    await avisar('rechazado', actualizado);
    return actualizado;
  }

  // Error de transporte: transitorio, se reintenta
  const espera = esperaTrasIntento(intentos);
  console.warn(`[SUNAT] ${comprobante.numero} sin enviar (${r.mensaje}) — reintento en ${espera} min`);
  return prisma.comprobante.update({
    where: { id: comprobante.id },
    data: {
      sunatMensaje: r.mensaje,
      intentosEnvio: intentos,
      ultimoIntentoEn: ahora,
      proximoIntentoEn: new Date(ahora.getTime() + espera * 60_000),
    },
  });
};

// Aviso a la empresa. Un comprobante rechazado o vencido no se arregla solo:
// alguien tiene que enterarse el mismo día, no al cerrar el mes.
const avisar = async (motivo, comprobante) => {
  const destino = process.env.EMAIL_CONTABILIDAD;
  if (!destino) return;

  const textos = {
    rechazado: {
      asunto: `SUNAT rechazó el comprobante ${comprobante.numero}`,
      titulo: 'Comprobante rechazado por SUNAT',
      cuerpo: 'SUNAT rechazó este comprobante. No tiene validez tributaria: hay que corregir el error y reemitirlo con un nuevo correlativo.',
    },
    vencido: {
      asunto: `Venció el plazo de envío del comprobante ${comprobante.numero}`,
      titulo: 'Plazo de envío vencido',
      cuerpo: 'Pasaron los 3 días calendario de plazo sin que SUNAT aceptara este comprobante. Perdió validez tributaria aunque se haya entregado al cliente. Requiere revisión manual.',
    },
  }[motivo];

  try {
    await getResend().emails.send({
      from: FROM(), to: destino,
      subject: textos.asunto,
      html: base(`
        ${h1(textos.titulo)}
        ${p(textos.cuerpo)}
        ${p(`Comprobante: <strong>${comprobante.numero}</strong><br>Cliente: ${comprobante.receptorNombre}<br>Total: ${comprobante.moneda} ${(comprobante.total / 100).toFixed(2)}`)}
        ${p(`Respuesta de SUNAT: <strong>${comprobante.sunatCodigo || '—'}</strong> ${comprobante.sunatMensaje || ''}`)}
      `),
    });
  } catch (e) {
    console.error('[SUNAT] No se pudo avisar por correo:', e.message);
  }
};

// Marca como VENCIDO lo que ya pasó el plazo legal y avisa. Se hace antes de
// enviar: no tiene sentido gastar intentos en algo que ya perdió validez.
const marcarVencidos = async () => {
  const vencidos = await prisma.comprobante.findMany({
    // Solo facturas, igual que el envío: el vencimiento de una boleta lo declara
    // su resumen, no ella. Si las dos colas marcaran vencimientos, una boleta
    // podría quedar VENCIDA aquí mientras su resumen sigue vivo y en plazo.
    where: { tipo: 'FACTURA', estadoSunat: 'PENDIENTE', fechaLimiteEnvio: { lt: new Date() } },
  });

  for (const c of vencidos) {
    console.error(`[SUNAT] ${c.numero} VENCIDO — pasaron los 3 días de plazo sin aceptación`);
    const actualizado = await prisma.comprobante.update({
      where: { id: c.id },
      data: { estadoSunat: 'VENCIDO', proximoIntentoEn: null },
    });
    await avisar('vencido', actualizado);
  }
  return vencidos.length;
};

// Procesa la cola. Exportada aparte del cron para poder invocarla en pruebas y
// tras un despliegue sin esperar al siguiente tick.
const procesarPendientes = async ({ limite = 20 } = {}) => {
  if (!listoParaEmitir()) return { enviados: 0, omitido: 'emisión SUNAT no activa' };

  await marcarVencidos();

  const ahora = new Date();
  const pendientes = await prisma.comprobante.findMany({
    where: {
      // Solo FACTURAS. Las boletas se informan por resumen diario, que es
      // obligatorio y va por otro camino (resumenSunat.worker.js) con otro
      // plazo. Es un filtro por tipo explícito, no un "todo lo que no sea
      // boleta": un VOUCHER en PENDIENTE sería un error de datos y mandarlo a
      // SUNAT lo convertiría en un problema fiscal en vez de en un aviso.
      tipo: 'FACTURA',
      estadoSunat: 'PENDIENTE',
      OR: [{ proximoIntentoEn: null }, { proximoIntentoEn: { lte: ahora } }],
    },
    orderBy: { creadoEn: 'asc' }, // los más antiguos primero: son los que están más cerca del plazo
    take: limite,
  });

  let aceptados = 0;
  for (const c of pendientes) {
    try {
      const r = await enviarComprobante(c);
      if (r.estadoSunat === 'ACEPTADO') aceptados++;
    } catch (error) {
      console.error(`[SUNAT] Error inesperado enviando ${c.numero}:`, error.message);
    }
    // SUNAT limita la frecuencia; espaciar evita 401 por saturación
    await new Promise((r) => setTimeout(r, 2000));
  }

  return { procesados: pendientes.length, aceptados };
};

const iniciarEnvioSunat = () => {
  if (!listoParaEmitir()) {
    console.log('[SUNAT] Cola de envío inactiva (falta SUNAT_EMISION_ACTIVA, certificado o credenciales SOL)');
    return;
  }
  cron.schedule('*/10 * * * *', () => {
    procesarPendientes().catch((e) => console.error('[SUNAT] Error en la cola:', e.message));
  });
  console.log(`[SUNAT] Cola de envío activa cada 10 min — entorno ${billService.entorno()}`);
};

module.exports = {
  iniciarEnvioSunat, procesarPendientes, enviarComprobante, marcarVencidos,
  esperaTrasIntento, listoParaEmitir,
};
