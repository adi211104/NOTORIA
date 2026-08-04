// brand-shield/src/services/comprobante.service.js
// Emisión de comprobantes por cada cobro exitoso.
//
// FASE A (actual): emite un VOUCHER (serie V001) — constancia de pago interna
// con el desglose tributario ya calculado, PDF para el cliente y copia por
// correo a la empresa. No es un comprobante de pago electrónico y el PDF lo
// dice explícitamente.
//
// FASE B/C: al poner SUNAT_EMISION_ACTIVA=true, el mismo flujo pasa a emitir
// FACTURA (F001) o BOLETA (B001) según el receptor, y queda pendiente enchufar
// la generación del XML UBL 2.1, la firma XAdES y el envío al billService.
// Ver el bloque "Facturación electrónica" en CLAUDE.md.

const prisma = require('../lib/prisma');
const tributario = require('../lib/tributario');
const { generarPDFComprobante } = require('./comprobante.pdf');
const { enviarComprobante } = require('../utils/emails');

const SERIES = {
  VOUCHER: 'V001',
  FACTURA: 'F001',
  BOLETA: 'B001',
};

// Mientras no esté activo el envío a SUNAT se emiten vouchers. Los correlativos
// fiscales se dejan intactos a propósito: reservar números de factura que
// todavía no se pueden enviar dejaría huecos en la numeración, y SUNAT exige
// que sea consecutiva y sin saltos.
const emisionSunatActiva = () => process.env.SUNAT_EMISION_ACTIVA === 'true';

// Toma el siguiente correlativo de una serie de forma atómica.
//
// El UPDATE ... RETURNING bloquea la fila durante el incremento, así que dos
// cobros simultáneos se serializan y cada uno recibe un número distinto. Un
// SELECT seguido de UPDATE sí podría entregar el mismo correlativo dos veces y
// romper la numeración.
const siguienteCorrelativo = async (tipo, intento = 0) => {
  const serie = SERIES[tipo];
  const filas = await prisma.$queryRaw`
    UPDATE series_comprobante
       SET correlativo = correlativo + 1, "actualizadoEn" = NOW()
     WHERE serie = ${serie}
    RETURNING correlativo`;

  if (filas.length) return { serie, correlativo: Number(filas[0].correlativo) };

  // Primera emisión de esta serie: se crea arrancando en 1. Si dos cobros
  // llegan a la vez, la unique de `serie` hace fallar a uno y el reintento ya
  // encuentra la fila creada por el otro.
  if (intento >= 3) throw new Error(`No se pudo inicializar la serie ${serie}`);
  try {
    await prisma.serieComprobante.create({ data: { tipo, serie, correlativo: 1 } });
    return { serie, correlativo: 1 };
  } catch {
    return siguienteCorrelativo(tipo, intento + 1);
  }
};

const formatearNumero = (serie, correlativo) => `${serie}-${String(correlativo).padStart(8, '0')}`;

const descripcionDe = (pago) => {
  const planes = { NEGOCIO: 'Plan Negocio', FRANQUICIA: 'Plan Franquicia', GRATIS: 'Plan Gratuito' };
  const periodo = pago.periodo === 'anual' ? '12 meses' : '1 mes';
  return `Notoria — ${planes[pago.plan] || pago.plan}, suscripción por ${periodo}`;
};

// Emite el comprobante de un pago exitoso.
//
// Idempotente: si el pago ya tiene comprobante devuelve el existente sin
// consumir otro correlativo (un reintento del webhook no debe duplicar
// numeración). Nunca lanza hacia arriba: el cobro ya se hizo, y no emitir el
// comprobante no puede tumbar la suscripción del cliente.
const emitirComprobante = async ({ pago, usuario }) => {
  try {
    const existente = await prisma.comprobante.findUnique({ where: { pagoId: pago.id } });
    if (existente) return existente;

    const receptor = tributario.receptorDesdeUsuario(usuario);
    const tipoFiscal = tributario.tipoFiscalPara({ docTipo: receptor.tipoDoc, paisFiscal: receptor.pais });
    const tipo = emisionSunatActiva() ? tipoFiscal : 'VOUCHER';

    const importes = tributario.desglosar({ total: pago.monto, paisFiscal: receptor.pais });
    const { serie, correlativo } = await siguienteCorrelativo(tipo);

    const comprobante = await prisma.comprobante.create({
      data: {
        pagoId: pago.id,
        usuarioId: usuario.id,
        tipo,
        serie,
        correlativo,
        numero: formatearNumero(serie, correlativo),
        receptorTipoDoc: receptor.tipoDoc,
        receptorNumDoc: receptor.numDoc,
        receptorNombre: receptor.nombre,
        receptorDireccion: receptor.direccion,
        receptorPais: receptor.pais,
        moneda: pago.moneda,
        gravadas: importes.gravadas,
        exportacion: importes.exportacion,
        igv: importes.igv,
        total: importes.total,
        tipoOperacion: importes.tipoOperacion,
        descripcion: descripcionDe(pago),
        // En Fase A no hay ciclo SUNAT; al activarlo, el comprobante nace
        // PENDIENTE y la cola de envío lo mueve a ACEPTADO/RECHAZADO.
        estadoSunat: emisionSunatActiva() ? 'PENDIENTE' : 'NO_APLICA',
        // El plazo legal se fija en la emisión, no en el envío: es lo que
        // vigila el worker para no dejar vencer un comprobante.
        fechaLimiteEnvio: emisionSunatActiva() ? tributario.calcularFechaLimiteEnvio(new Date()) : null,
      },
    });

    console.log(`[Comprobante] Emitido ${comprobante.numero} (${tipo}) para ${usuario.email}`);

    // El envío del PDF no bloquea la respuesta del cobro.
    enviarPorCorreo({ comprobante, usuario }).catch((e) =>
      console.error(`[Comprobante] No se pudo enviar ${comprobante.numero} por correo:`, e.message)
    );

    return comprobante;
  } catch (error) {
    console.error('[Comprobante] No se pudo emitir el comprobante del pago', pago.id, '—', error.message);
    return null;
  }
};

// Envía el PDF al cliente y, si EMAIL_CONTABILIDAD está configurado, una copia
// a la empresa para el control tributario mensual.
const enviarPorCorreo = async ({ comprobante, usuario }) => {
  const pdf = await generarPDFComprobante(comprobante);
  await enviarComprobante({ usuario, comprobante, pdf });
};

// Regenera el PDF a demanda en vez de guardarlo: el comprobante es
// determinista a partir de su fila, y el disco de Railway es efímero.
// (En Fase B el XML firmado y el CDR sí habrá que persistirlos 5 años.)
const pdfDeComprobante = async (comprobanteId, usuarioId) => {
  const comprobante = await prisma.comprobante.findFirst({
    where: { id: comprobanteId, usuarioId },
  });
  if (!comprobante) return null;
  return { comprobante, pdf: await generarPDFComprobante(comprobante) };
};

module.exports = { emitirComprobante, pdfDeComprobante, siguienteCorrelativo, SERIES, emisionSunatActiva };
