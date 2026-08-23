// brand-shield/scripts/forzar-resumen-sunat.js
//
// Manda a SUNAT el resumen diario de las boletas de HOY, sin esperar a que el
// día cierre.
//
// 🔴 POR QUÉ EXISTE, y por qué es manual. El cron agrupa solo días ya cerrados,
// y esa regla es correcta: un resumen informa un día entero, así que mandar el
// de hoy a media tarde obligaría a un segundo resumen para las boletas que
// entren después. Pero para ejercitar el circuito contra SUNAT el mismo día en
// que se emite la boleta —la única forma de verlo entero de una sentada— hace
// falta saltárselo a propósito y por una vez.
//
// ⚠️ Solo es seguro si NO van a entrar más boletas hoy. Con clientes de verdad
// no lo es: el script avisa de cuántas agrupa y hay que pensarlo antes.
//
// Llama a las funciones REALES del worker (`agruparPendientes`, `enviarResumen`,
// `consultarResumen`, `propagarABoletas`). Reimplementarlas acá probaría la
// copia, no el producto — es la misma regla que en `ensayo-alertas.js`.
//
// Uso (CON `railway run`, por las variables de SUNAT — la trampa de la URL de
// Postgres la resuelve el propio script, ver abajo):
//   railway run --service api node scripts/forzar-resumen-sunat.js            # simulacro
//   railway run --service api node scripts/forzar-resumen-sunat.js --aplicar  # lo manda

// La trampa de `railway run` (URL interna de Postgres) la resuelve el ayudante.
require('./lib-env-produccion')();

const { PrismaClient } = require('@prisma/client');
const worker = require('../src/workers/resumenSunat.worker');
const billService = require('../src/sunat/billService');

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

const esperar = (s) => new Promise((r) => setTimeout(r, s * 1000));

(async () => {
  console.log('═══ RESUMEN DIARIO DE BOLETAS — ENVÍO FORZADO ═══\n');
  console.log(`entorno SUNAT : ${billService.entorno()}`);
  console.log(`endpoint      : ${billService.endpoint()}`);
  console.log(`emisión activa: ${process.env.SUNAT_EMISION_ACTIVA === 'true' ? 'sí' : 'NO'}\n`);

  const pendientes = await prisma.comprobante.findMany({
    where: { tipo: 'BOLETA', estadoSunat: 'PENDIENTE', resumenId: null },
    select: { numero: true, total: true, fechaEmision: true },
    orderBy: { fechaEmision: 'asc' },
  });

  if (!pendientes.length) {
    console.log('No hay boletas pendientes de resumen. Nada que hacer.');
    return;
  }

  console.log(`Boletas que se agruparían (${pendientes.length}):`);
  pendientes.forEach((b) => console.log(`   ${b.numero} · S/${(b.total / 100).toFixed(2)} · ${b.fechaEmision.toISOString().slice(0, 16)}`));

  if (!aplicar) {
    console.log('\nSimulacro. Para mandarlo de verdad: --aplicar');
    return;
  }

  // ── 1. Agrupar, incluyendo hoy ──────────────────────────
  console.log('\n── 1. Agrupando ──');
  const creados = await worker.agruparPendientes({ incluirHoy: true });
  if (!creados.length) {
    console.log('No se creó ningún resumen. ¿Ya estaban agrupadas?');
  }
  creados.forEach((r) => console.log(`   resumen ${r.identificador} (${r.tipo}) creado`));

  // ── 2. Enviar ───────────────────────────────────────────
  console.log('\n── 2. Enviando a SUNAT ──');
  const porEnviar = await prisma.resumenSunat.findMany({ where: { estado: 'PENDIENTE' } });
  for (const r of porEnviar) {
    const tras = await worker.enviarResumen(r);
    console.log(`   ${r.identificador}: ${tras.estado}${tras.ticket ? ` · ticket ${tras.ticket}` : ''}`);
    if (tras.mensaje) console.log(`      «${tras.mensaje}»`);
  }

  // ── 3. Consultar el ticket ──────────────────────────────
  //
  // SUNAT contesta 98 = «en proceso» durante un rato. Se pregunta con espera
  // creciente en vez de una sola vez: preguntar demasiado pronto y concluir que
  // falló sería el error clásico de esta parte.
  console.log('\n── 3. Consultando el ticket ──');
  for (const espera of [5, 10, 20, 30, 60]) {
    const enProceso = await prisma.resumenSunat.findMany({ where: { estado: 'EN_PROCESO', ticket: { not: null } } });
    if (!enProceso.length) break;
    console.log(`   esperando ${espera}s…`);
    await esperar(espera);
    for (const r of enProceso) {
      const tras = await worker.consultarResumen(r);
      console.log(`   ${r.identificador}: ${tras.estado}${tras.codigo ? ` · código ${tras.codigo}` : ''}`);
      if (tras.mensaje) console.log(`      «${tras.mensaje}»`);
    }
  }

  // ── 4. Estado final ─────────────────────────────────────
  console.log('\n── Estado final ──');
  const resumenes = await prisma.resumenSunat.findMany({ orderBy: { creadoEn: 'asc' } });
  resumenes.forEach((r) => console.log(`   ${r.identificador}: ${r.estado} · ticket ${r.ticket || '—'} · ${r.sunatMensaje || ''}`));

  const boletas = await prisma.comprobante.findMany({
    where: { tipo: 'BOLETA' },
    select: { numero: true, estadoSunat: true, sunatCodigo: true, sunatMensaje: true, enviadoEn: true },
  });
  boletas.forEach((b) => console.log(`   ${b.numero}: ${b.estadoSunat}${b.sunatCodigo ? ` (${b.sunatCodigo})` : ''} ${b.sunatMensaje || ''}`));

  const aceptadas = boletas.filter((b) => b.estadoSunat === 'ACEPTADO').length;
  console.log(`\n${aceptadas}/${boletas.length} boleta(s) ACEPTADAS por SUNAT.`);
})()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
