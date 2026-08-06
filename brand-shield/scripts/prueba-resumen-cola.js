// Prueba la cola del resumen diario de boletas sin tocar la base de datos: se
// mockea el cliente de Prisma con un almacén en memoria. El envío a SUNAT sí es
// real, contra el entorno beta, que es la única forma de saber si el circuito
// completo funciona.
//
//   node scripts/prueba-resumen-cola.js
//
// Lo que interesa comprobar aquí no es el XML (de eso ya se encarga
// prueba-resumen-beta.js) sino la MÁQUINA DE ESTADOS: que las boletas se
// agrupen por día, que el ticket se guarde, que un resumen con ticket se
// consulte en vez de reenviarse, y que el veredicto llegue a cada boleta.
const path = require('path');
const Module = require('module');
const base = path.join(__dirname, '..', 'src');

process.env.EMISOR_RUC = '20000000001';
process.env.SUNAT_SOL_USUARIO = 'MODDATOS';
process.env.SUNAT_SOL_CLAVE = 'moddatos';
process.env.SUNAT_ENTORNO = 'beta';
process.env.SUNAT_EMISION_ACTIVA = 'true';
process.env.SUNAT_CERT_P12_PATH = path.join(__dirname, 'sunat-test.p12');
process.env.SUNAT_CERT_PASSWORD = 'test123';
process.env.EMISOR_DIRECCION = 'Av. Ejemplo 123, Lima, Peru';
delete process.env.EMAIL_CONTABILIDAD; // sin destino, los avisos no se envían

// ── Prisma en memoria ────────────────────────────────────
const comprobantes = [];
const resumenes = [];

const cumple = (fila, where = {}) => {
  for (const [campo, cond] of Object.entries(where)) {
    if (campo === 'OR') {
      if (!cond.some((c) => cumple(fila, c))) return false;
      continue;
    }
    const v = fila[campo];
    if (cond === null) { if (v !== null && v !== undefined) return false; continue; }
    if (cond && typeof cond === 'object') {
      if ('in' in cond && !cond.in.includes(v)) return false;
      if ('lt' in cond && !(v && v < cond.lt)) return false;
      if ('lte' in cond && !(v && v <= cond.lte)) return false;
      if ('startsWith' in cond && !String(v || '').startsWith(cond.startsWith)) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
};

const tabla = (filas) => ({
  findMany: async ({ where = {}, take } = {}) => {
    const r = filas.filter((f) => cumple(f, where));
    return take ? r.slice(0, take) : r;
  },
  count: async ({ where = {} } = {}) => filas.filter((f) => cumple(f, where)).length,
  update: async ({ where, data }) => {
    const f = filas.find((x) => x.id === where.id);
    Object.assign(f, data);
    return f;
  },
  updateMany: async ({ where = {}, data }) => {
    const afectadas = filas.filter((f) => cumple(f, where));
    afectadas.forEach((f) => Object.assign(f, data));
    return { count: afectadas.length };
  },
});

const prismaFake = {
  comprobante: tabla(comprobantes),
  resumenSunat: {
    ...tabla(resumenes),
    create: async ({ data }) => {
      const f = { id: `r${resumenes.length + 1}`, ticket: null, sunatCodigo: null, sunatMensaje: null,
        xmlFirmado: null, cdrXml: null, intentosEnvio: 0, ultimoIntentoEn: null,
        proximoIntentoEn: null, enviadoEn: null, creadoEn: new Date(), ...data };
      resumenes.push(f);
      return f;
    },
  },
  $transaction: async (fn) => fn(prismaFake),
};

const originalLoad = Module._load;
Module._load = function (pedido) {
  if (pedido.endsWith('lib/prisma')) return prismaFake;
  return originalLoad.apply(this, arguments);
};

const worker = require(path.join(base, 'workers/resumenSunat.worker'));
const colaFacturas = require(path.join(base, 'workers/envioSunat.worker'));
const tributario = require(path.join(base, 'lib/tributario'));

let fallos = 0;
const check = (nombre, ok, extra = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ok || !extra ? '' : `\n      ${extra}`}`);
};

const n = 2000 + Math.floor(Math.random() * 6000);
const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);

const nuevaBoleta = (over = {}) => {
  const i = comprobantes.length;
  const f = {
    id: `c${i + 1}`,
    tipo: 'BOLETA', serie: 'B001', correlativo: n + i,
    numero: `B001-${String(n + i).padStart(8, '0')}`,
    fechaEmision: ayer,
    receptorNombre: 'ANA PEREZ', receptorTipoDoc: '1', receptorNumDoc: '12345678',
    receptorDireccion: null, receptorPais: 'PE',
    moneda: 'PEN', gravadas: 5000, exportacion: 0, igv: 900, total: 5900,
    tipoOperacion: '0101', descripcion: 'Notoria - Plan Negocio, suscripcion por 1 mes',
    estadoSunat: 'PENDIENTE', resumenId: null, intentosEnvio: 0,
    ultimoIntentoEn: null, proximoIntentoEn: null, enviadoEn: null,
    xmlFirmado: null, cdrXml: null, hashFirma: null,
    fechaLimiteEnvio: tributario.calcularFechaLimiteResumen(ayer),
    creadoEn: new Date(),
    ...over,
  };
  comprobantes.push(f);
  return f;
};

(async () => {
  // 1. Los dos plazos son distintos y no se pueden confundir
  const emision = new Date('2026-07-26T10:00:00');
  const limiteFactura = tributario.calcularFechaLimiteEnvio(emision);
  const limiteResumen = tributario.calcularFechaLimiteResumen(emision);
  check('plazos: la factura vence el 29 y el resumen el 2',
    limiteFactura.getDate() === 29 && limiteResumen.getDate() === 2,
    `${limiteFactura.toDateString()} vs ${limiteResumen.toDateString()}`);

  // 2. Agrupación por día de emisión
  const b1 = nuevaBoleta();
  const b2 = nuevaBoleta();
  const anteayer = new Date(); anteayer.setDate(anteayer.getDate() - 2);
  const b3 = nuevaBoleta({ fechaEmision: anteayer });
  const deHoy = nuevaBoleta({ fechaEmision: new Date() });

  const creados = await worker.agruparPendientes();
  check('agrupa: un resumen por día de emisión', creados.length === 2, `${creados.length} resúmenes`);
  check('agrupa: las del mismo día van juntas', b1.resumenId && b1.resumenId === b2.resumenId);
  check('agrupa: días distintos no se mezclan', b3.resumenId && b3.resumenId !== b1.resumenId);
  check('agrupa: deja fuera el día en curso', deHoy.resumenId === null,
    'una boleta de hoy no debe entrar: el día todavía puede recibir más');
  check('agrupa: correlativos distintos el mismo día',
    creados[0].correlativo !== creados[1].correlativo);
  // Comparando el día, no la diferencia en milisegundos: el límite se fija a las
  // 23:59:59, así que restar fechas da 7 días y pico y redondea mal.
  const refDia = new Date(creados[0].fechaReferencia);
  const esperado = new Date(refDia); esperado.setDate(esperado.getDate() + tributario.PLAZO_RESUMEN_DIAS);
  check('agrupa: plazo de 7 días, no de 3',
    new Date(creados[0].fechaLimiteEnvio).toDateString() === esperado.toDateString(),
    `límite ${new Date(creados[0].fechaLimiteEnvio).toDateString()}, esperado ${esperado.toDateString()}`);

  // 3. Las boletas NO viajan por la cola de facturas
  const rFacturas = await colaFacturas.procesarPendientes({ limite: 10 });
  check('cola de facturas: ignora las boletas', rFacturas.procesados === 0, JSON.stringify(rFacturas));

  // 4. Envío real a SUNAT beta
  const resumen = creados[0];
  let enviado;
  for (let i = 0; i < 6; i++) {
    enviado = await worker.enviarResumen(resumen);
    if (enviado.estado !== 'PENDIENTE') break;
    console.log(`     (SUNAT no disponible: ${enviado.sunatMensaje} — reintento ${i + 1})`);
    await new Promise((res) => setTimeout(res, 4000 * (i + 1)));
  }
  check('envío: SUNAT devuelve ticket', enviado.estado === 'EN_PROCESO' && !!enviado.ticket,
    `${enviado.estado} ${enviado.sunatMensaje || ''}`);
  check('envío: el ticket queda guardado', !!resumenes.find((r) => r.id === resumen.id).ticket,
    'sin ticket persistido no hay forma de saber si SUNAT aceptó');
  check('envío: guarda el XML firmado', !!enviado.xmlFirmado && enviado.xmlFirmado.includes('ds:Signature'));
  check('envío: las boletas siguen PENDIENTE', b1.estadoSunat === 'PENDIENTE',
    'un ticket entregado no es una aceptación');

  // 5. Un resumen con ticket se CONSULTA, no se reenvía
  const intentosAntes = enviado.intentosEnvio;
  enviado.proximoIntentoEn = null;
  await worker.procesarResumenes({ limite: 1 });
  const trasCiclo = resumenes.find((r) => r.id === resumen.id);
  check('ciclo: no reenvía lo que ya tiene ticket', trasCiclo.intentosEnvio === intentosAntes,
    `intentos ${intentosAntes} → ${trasCiclo.intentosEnvio}`);

  // 6. Veredicto y propagación a cada boleta
  let veredicto = trasCiclo;
  for (let i = 0; i < 10 && veredicto.estado === 'EN_PROCESO'; i++) {
    await new Promise((res) => setTimeout(res, 4000));
    veredicto = await worker.consultarResumen(veredicto);
  }
  check('veredicto: SUNAT acepta el resumen', veredicto.estado === 'ACEPTADO',
    `${veredicto.estado} ${veredicto.sunatCodigo || ''} ${veredicto.sunatMensaje || ''}`);
  check('veredicto: guarda el CDR', !!veredicto.cdrXml && veredicto.cdrXml.includes('ResponseCode'));
  check('veredicto: llega a cada boleta', b1.estadoSunat === 'ACEPTADO' && b2.estadoSunat === 'ACEPTADO',
    `${b1.estadoSunat} / ${b2.estadoSunat}`);
  check('veredicto: fecha de aceptación en la boleta', !!b1.enviadoEn);

  // 7. Vencimiento: arrastra a las boletas que agrupaba
  const caducado = resumenes.find((r) => r.id === b3.resumenId);
  caducado.fechaLimiteEnvio = new Date(Date.now() - 86400000);
  await worker.marcarVencidos();
  check('vencido: el resumen queda VENCIDO', caducado.estado === 'VENCIDO', caducado.estado);
  check('vencido: arrastra a sus boletas', b3.estadoSunat === 'VENCIDO', b3.estadoSunat);
  check('vencido: no se reintenta', caducado.proximoIntentoEn === null);

  // 8. Un estado no final no se propaga
  const propagados = await worker.propagarABoletas({ id: resumen.id, estado: 'EN_PROCESO' });
  check('propagación: EN_PROCESO no llega a las boletas', propagados === 0 && b1.estadoSunat === 'ACEPTADO');

  console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLAS ===`);
  process.exit(fallos === 0 ? 0 : 1);
})();
