// node scripts/prueba-salud-operacion.js
//
// /health/operacion (lib/saludOperacion.js): el veredicto de «¿fluye el
// dinero?» que sondea el monitor. Sin red ni base: Prisma va simulado con los
// conteos que devolvería la base. Cada señal lleva su CONTROL (el mismo estado
// sano no la dispara), si no la prueba no distingue.

const s = require('../src/lib/saludOperacion');

let ok = 0; let mal = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok += 1; console.log('  ✓', nombre); } else { mal += 1; console.log('  ✗', nombre, detalle); }
};
const AHORA = Date.parse('2026-10-08T15:00:00Z');
const MIN = 60e3;
const reciente = Object.fromEntries(Object.keys(s.TRABAJOS_CRITICOS).map((n) => [n, new Date(AHORA - 5 * MIN)]));

// Doble mínimo: cada `count` responde según el `where` que pide la librería.
const base = (o = {}) => ({
  intentoCobro: { count: async ({ where }) => (where.OR ? (o.enDuda || 0) : (o.sinAplicar || 0)) },
  eventoWebhook: { count: async ({ where }) => (where.OR ? (o.whPendientes || 0) : (o.whFallidos || 0)) },
  candadoJob: { findMany: async () => Object.entries(o.candados || reciente).map(([nombre, tomadoEn]) => ({ nombre, tomadoEn })) },
});
const ver = (o, extra = {}) => s.veredicto(base(o), { ahora: AHORA, arrancadoEn: AHORA - 48 * 60 * MIN, produccion: true, ...extra });

(async () => {
  console.log('\n1. Sano');
  let v = await ver({});
  check('CONTROL: todo al día → ok, sin motivos, 200', v.operacion === 'ok' && v.motivos.length === 0, JSON.stringify(v));

  console.log('\n2. Dinero');
  v = await ver({ enDuda: 2 });
  check('cobros en duda → atención con su conteo', v.operacion === 'atencion' && v.motivos.includes('cobros_en_duda:2'));
  v = await ver({ sinAplicar: 1 });
  check('cobro EXITOSO sin aplicar → atención', v.motivos.includes('cobros_sin_aplicar:1'));
  v = await ver({ whPendientes: 3, whFallidos: 1 });
  check('webhooks atascados y fallidos → los dos motivos', v.motivos.includes('webhooks_atascados:3') && v.motivos.includes('webhooks_fallidos:1'));

  console.log('\n3. Trabajos programados');
  v = await ver({ candados: { ...reciente, 'renovaciones-culqi': new Date(AHORA - 27 * 60 * MIN) } });
  check('la renovación lleva 27 h sin correr → trabajo_detenido', v.motivos.some((m) => m.startsWith('trabajo_detenido:') && m.includes('renovaciones-culqi')));
  const sinReconc = { ...reciente }; delete sinReconc['reconciliacion-cobros'];
  v = await ver({ candados: sinReconc });
  check('un trabajo que NUNCA corrió también es detenido', v.motivos.some((m) => m.includes('reconciliacion-cobros')));
  v = await ver({ candados: {} }, { arrancadoEn: AHORA - 5 * MIN });
  check('CONTROL: recién desplegado (5 min) no acusa a nadie', !v.motivos.some((m) => m.startsWith('trabajo_detenido')), JSON.stringify(v.motivos));
  v = await ver({ candados: {} }, { produccion: false });
  check('CONTROL: fuera de producción los cron no corren y no se vigilan', v.operacion === 'ok');
  const prev = process.env.SUNAT_EMISION_ACTIVA;
  delete process.env.SUNAT_EMISION_ACTIVA;
  const sinSunat = { ...reciente }; delete sinSunat['envio-sunat']; delete sinSunat['resumen-sunat'];
  v = await ver({ candados: sinSunat });
  check('sin emisión SUNAT encendida, sus colas no cuentan', v.operacion === 'ok', JSON.stringify(v.motivos));
  process.env.SUNAT_EMISION_ACTIVA = 'true';
  v = await ver({ candados: sinSunat });
  check('con emisión encendida, una cola SUNAT parada SÍ se avisa', v.motivos.some((m) => m.includes('envio-sunat')));
  if (prev === undefined) delete process.env.SUNAT_EMISION_ACTIVA; else process.env.SUNAT_EMISION_ACTIVA = prev;

  console.log('\n4. Errores 5xx');
  for (let i = 0; i < s.UMBRAL_5XX - 1; i += 1) s.registrar5xx(AHORA - MIN);
  v = await ver({});
  check(`CONTROL: ${s.UMBRAL_5XX - 1} errores en 15 min no alcanzan el umbral`, v.operacion === 'ok');
  s.registrar5xx(AHORA);
  v = await ver({});
  check(`${s.UMBRAL_5XX} errores en 15 min → errores_5xx`, v.motivos.includes(`errores_5xx:${s.UMBRAL_5XX}`));
  check('pasados 15 min ya no cuentan', s.recientes5xx(AHORA + 16 * MIN) === 0);

  console.log('\n5. Sin datos personales');
  v = await ver({ enDuda: 1, sinAplicar: 1, whPendientes: 1 });
  check('la respuesta pública solo trae conteos y nombres de trabajos', !/@|chr_|cus_|crd_/.test(JSON.stringify(v)));

  console.log('\n6. El endpoint y el aviso inmediato están cableados');
  const fs = require('fs');
  const path = require('path');
  const sinCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const idx = sinCom(fs.readFileSync(path.join(__dirname, '..', 'src/index.js'), 'utf8'));
  check('index.js expone /health/operacion con 503 en atención', /app\.get\('\/health\/operacion'/.test(idx) && /operacion === 'ok' \? 200 : 503/.test(idx));
  check('el manejador de errores cuenta los 5xx', /status >= 500\) \{\s*saludOperacion\.registrar5xx\(\)/.test(idx));
  const cob = sinCom(fs.readFileSync(path.join(__dirname, '..', 'src/lib/cobros.js'), 'utf8'));
  check('un cobro DESCONOCIDO avisa a contabilidad en el acto', /estado === ESTADO\.DESCONOCIDO\)\s*\{\s*require\('\.\.\/utils\/emails'\)\.enviarAvisoInterno/.test(cob));

  console.log(`\n${ok} pasaron, ${mal} fallaron`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
