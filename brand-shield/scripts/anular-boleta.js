// brand-shield/scripts/anular-boleta.js
//
// Anula una boleta ya ACEPTADA por SUNAT, informándola en un resumen diario con
// estado 3.
//
// 🔴 POR QUÉ ESTO ES UN SCRIPT Y NO UNA FUNCIÓN DEL PRODUCTO. Anular un
// comprobante no es deshacer un clic: es un acto con efectos fiscales y un plazo
// legal. Hoy ninguna acción de Notoria lo dispara —ni cancelar, ni reembolsar—
// y eso es deliberado. Cuando hay que hacerlo, lo hace una persona, mirando.
//
// 🔴 CUÁNDO HAY QUE USARLO. Cada vez que se devuelva el dinero de un cobro cuyo
// comprobante ya salió. **Reembolsar en Culqi NO anula nada ante SUNAT**: son
// dos sistemas independientes, y sin esto quedaría declarada como venta una
// operación cuyo importe ya se devolvió — con su IGV a pagar.
//
// ⚠️ PLAZO: 7 días desde el CDR del resumen que informó la boleta. Pasado eso ya
// no se puede anular y corresponde otra figura (nota de crédito).
//
// ⚠️ Anular NO es corregir. Si el cliente ya tiene el comprobante y lo que
// cambia es el importe, lo que toca es una nota de crédito, no esto.
//
// Uso:
//   railway run --service api node scripts/anular-boleta.js B001-00000001
//   railway run --service api node scripts/anular-boleta.js B001-00000001 --aplicar

require('./lib-env-produccion')();

const { PrismaClient } = require('@prisma/client');
const worker = require('../src/workers/resumenSunat.worker');
const ublResumen = require('../src/sunat/ublResumenBoletas');
const firma = require('../src/sunat/firmaXades');
const billService = require('../src/sunat/billService');

const prisma = new PrismaClient();
const numero = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
const esperar = (s) => new Promise((r) => setTimeout(r, s * 1000));

// Estado de línea 3 = anular. Vive en `ublResumenBoletas.ESTADO`, pero se repite
// acá con su nombre para que quien lea el script no tenga que ir a buscarlo.
const ANULAR = '3';

(async () => {
  if (!numero || numero.startsWith('--')) {
    console.log('Falta el número. Uso: node scripts/anular-boleta.js B001-00000001 [--aplicar]');
    process.exitCode = 1;
    return;
  }

  const boleta = await prisma.comprobante.findFirst({ where: { numero } });
  if (!boleta) throw new Error(`No existe el comprobante ${numero}`);

  console.log('═══ ANULACIÓN DE BOLETA ═══\n');
  console.log(`comprobante : ${boleta.numero} (${boleta.tipo})`);
  console.log(`importe     : S/${(boleta.total / 100).toFixed(2)}`);
  console.log(`emitida     : ${boleta.fechaEmision.toISOString().slice(0, 16)}`);
  console.log(`estado      : ${boleta.estadoSunat}`);
  console.log(`entorno     : ${billService.entorno()}\n`);

  if (boleta.tipo !== 'BOLETA') {
    throw new Error('Esto solo anula BOLETAS. Una factura se da de baja con una comunicación RA, que es otro documento.');
  }
  if (boleta.estadoSunat === 'ANULADO') {
    console.log('Ya está anulada. Nada que hacer.');
    return;
  }
  if (boleta.estadoSunat !== 'ACEPTADO') {
    throw new Error(`Solo se anula lo que SUNAT aceptó. Esta está en ${boleta.estadoSunat}.`);
  }

  const dias = Math.floor((Date.now() - boleta.fechaEmision.getTime()) / 86400000);
  console.log(`Días desde la emisión: ${dias} (el plazo son 7)`);
  if (dias > 7) console.log('⚠️  FUERA DE PLAZO. SUNAT lo rechazará; corresponde una nota de crédito.');

  if (!aplicar) {
    console.log('\nSimulacro: no se envió nada. Para anularla de verdad, añadir --aplicar');
    return;
  }

  // ── 1. Armar el resumen de anulación ────────────────────
  //
  // Se usa el MISMO contador de correlativos que los resúmenes normales: los RC
  // de un día se numeran seguidos, y llevar una cuenta aparte produciría dos
  // documentos con el mismo identificador.
  //
  // ⚠️ `fechaEmision` de la LÍNEA sigue siendo la de la boleta —es la fecha que
  // se está corrigiendo—, mientras que la del resumen es hoy. Igualarlas sería
  // informar la anulación de un día que no es.
  console.log('\n── 1. Construyendo el resumen de anulación ──');
  const ahora = new Date();
  const correlativo = await worker.proximoCorrelativo(ahora);
  const doc = ublResumen.construir({
    boletas: [{ ...boleta, estado: ANULAR }],
    fechaGeneracion: ahora,
    correlativo,
  });
  console.log(`   ${doc.id} · 1 línea en estado ${ANULAR} (anular)`);

  const fila = await prisma.resumenSunat.create({
    data: {
      tipo: worker.TIPO_RC,
      identificador: doc.id,
      correlativo,
      fechaReferencia: boleta.fechaEmision,
      estado: 'PENDIENTE',
      xmlFirmado: firma.firmar(doc.xml).xml,
    },
  });

  // ── 2. Enviar ───────────────────────────────────────────
  //
  // Se llama a `enviarResumen` del worker, que ve el `xmlFirmado` ya guardado y
  // no reconstruye nada: así el envío, los reintentos y el guardado del ticket
  // pasan por el mismo código que los resúmenes normales.
  console.log('\n── 2. Enviando a SUNAT ──');
  let estado = await worker.enviarResumen(fila);
  console.log(`   ${estado.estado}${estado.ticket ? ` · ticket ${estado.ticket}` : ''}`);
  if (estado.sunatMensaje) console.log(`   «${estado.sunatMensaje}»`);

  // ── 3. Consultar el ticket ──────────────────────────────
  console.log('\n── 3. Consultando el ticket ──');
  for (const s of [5, 10, 20, 30, 60]) {
    if (estado.estado !== 'EN_PROCESO') break;
    console.log(`   esperando ${s}s…`);
    await esperar(s);
    estado = await worker.consultarResumen(estado);
    console.log(`   ${estado.estado}${estado.sunatCodigo ? ` · código ${estado.sunatCodigo}` : ''}`);
    if (estado.sunatMensaje) console.log(`   «${estado.sunatMensaje}»`);
  }

  // ── 4. Marcar la boleta ─────────────────────────────────
  //
  // 🔴 Solo si SUNAT ACEPTÓ. Marcarla antes dejaría en la base una boleta
  // «anulada» que para SUNAT sigue viva — la peor de las dos verdades, porque
  // nadie volvería a intentarlo.
  if (estado.estado === 'ACEPTADO') {
    await prisma.comprobante.update({
      where: { id: boleta.id },
      data: {
        estadoSunat: 'ANULADO',
        sunatMensaje: `Anulada por ${doc.id}: ${estado.sunatMensaje || 'aceptado'}`,
      },
    });
    console.log(`\n✅ ${boleta.numero} ANULADA ante SUNAT mediante ${doc.id}.`);
    console.log('   No debe declararse como venta. Confirmar el tratamiento con el contador.');
  } else {
    console.log(`\n❌ El resumen de anulación quedó en ${estado.estado}. La boleta NO está anulada.`);
    process.exitCode = 1;
  }
})()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
