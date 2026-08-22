// Prueba la cola de envío sin tocar la base de datos: se mockea el cliente de
// Prisma con un almacén en memoria, para poder verificar la lógica de estados,
// reintentos y vencimiento del plazo de forma determinista.
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
// El domicilio se define ENTERO o no se define: los cinco campos van juntos al
// XML y `validarEmisor()` corta si llegan a medias (ver lib/tributario.js).
process.env.EMISOR_DIRECCION = 'Av. Ejemplo 123';
process.env.EMISOR_UBIGEO = '150101';
process.env.EMISOR_DISTRITO = 'LIMA';
process.env.EMISOR_PROVINCIA = 'LIMA';
process.env.EMISOR_DEPARTAMENTO = 'LIMA';

// ── Prisma en memoria ────────────────────────────────────
const filas = [];
const prismaFake = {
  comprobante: {
    findMany: async ({ where, take }) => {
      let r = filas.filter((f) => {
        if (where.estadoSunat && f.estadoSunat !== where.estadoSunat) return false;
        if (where.fechaLimiteEnvio?.lt && !(f.fechaLimiteEnvio < where.fechaLimiteEnvio.lt)) return false;
        if (where.OR) {
          const ok = where.OR.some((c) =>
            (c.proximoIntentoEn === null && f.proximoIntentoEn === null) ||
            (c.proximoIntentoEn?.lte && f.proximoIntentoEn && f.proximoIntentoEn <= c.proximoIntentoEn.lte));
          if (!ok) return false;
        }
        return true;
      });
      return take ? r.slice(0, take) : r;
    },
    update: async ({ where, data }) => {
      const f = filas.find((x) => x.id === where.id);
      Object.assign(f, data);
      return f;
    },
  },
};

// Intercepta el require de prisma para inyectar el fake
const originalLoad = Module._load;
Module._load = function (pedido, padre, esMain) {
  if (pedido.endsWith('lib/prisma')) return prismaFake;
  return originalLoad.apply(this, arguments);
};

const worker = require(path.join(base, 'workers/envioSunat.worker'));
const tributario = require(path.join(base, 'lib/tributario'));

let fallos = 0;
const check = (nombre, ok, extra = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ok || !extra ? '' : `\n      ${extra}`}`);
};

const n = 2000 + Math.floor(Math.random() * 6000);
const nuevo = (over = {}) => {
  const f = {
    id: `c${filas.length + 1}`,
    tipo: 'FACTURA', serie: 'F001', correlativo: n + filas.length,
    numero: `F001-${String(n + filas.length).padStart(8, '0')}`,
    fechaEmision: new Date(),
    receptorNombre: 'RESTAURANTE LA MAR S.A.C.', receptorTipoDoc: '6', receptorNumDoc: '20512345678',
    receptorDireccion: 'Av. La Mar 770, Miraflores, Lima', receptorPais: 'PE',
    moneda: 'USD', gravadas: 1695, exportacion: 0, igv: 305, total: 2000,
    tipoOperacion: '0101', descripcion: 'Notoria - Plan Negocio, suscripcion por 1 mes',
    estadoSunat: 'PENDIENTE', intentosEnvio: 0, ultimoIntentoEn: null, proximoIntentoEn: null,
    enviadoEn: null, xmlFirmado: null, cdrXml: null, hashFirma: null,
    fechaLimiteEnvio: tributario.calcularFechaLimiteEnvio(new Date()),
    creadoEn: new Date(),
    ...over,
  };
  filas.push(f);
  return f;
};

(async () => {
  // 1. Plazo legal
  const emision = new Date('2026-07-26T10:00:00');
  const limite = tributario.calcularFechaLimiteEnvio(emision);
  check('plazo: vence el 29 a las 23:59', limite.getDate() === 29 && limite.getHours() === 23, limite.toISOString());

  // 2. Espera creciente entre reintentos
  check('backoff: crece y se estabiliza',
    worker.esperaTrasIntento(1) < worker.esperaTrasIntento(3) &&
    worker.esperaTrasIntento(50) === worker.esperaTrasIntento(6));

  // 3. Comprobante fuera de plazo → VENCIDO, sin gastar intentos
  const vencido = nuevo({ fechaLimiteEnvio: new Date(Date.now() - 86400000) });
  await worker.marcarVencidos();
  check('vencido: marcado VENCIDO', vencido.estadoSunat === 'VENCIDO', vencido.estadoSunat);
  check('vencido: no se reintenta', vencido.proximoIntentoEn === null);
  check('vencido: no gastó intentos', vencido.intentosEnvio === 0);

  // 4. Envío real a SUNAT beta a través de la cola
  const bueno = nuevo();
  let r;
  for (let i = 0; i < 6; i++) {
    r = await worker.enviarComprobante(bueno);
    if (r.estadoSunat !== 'PENDIENTE') break;
    console.log(`     (SUNAT no disponible: ${r.sunatMensaje} — reintento ${i + 1})`);
    await new Promise((res) => setTimeout(res, 4000 * (i + 1)));
  }
  check('envío: aceptado por SUNAT', r.estadoSunat === 'ACEPTADO', `${r.estadoSunat} ${r.sunatMensaje}`);
  check('envío: guarda el XML firmado', !!r.xmlFirmado && r.xmlFirmado.includes('ds:Signature'));
  check('envío: guarda el CDR', !!r.cdrXml && r.cdrXml.includes('ResponseCode'));
  check('envío: guarda el digest de la firma', !!r.hashFirma);
  check('envío: registra la fecha de aceptación', !!r.enviadoEn);
  check('envío: deja de reintentar', r.proximoIntentoEn === null);

  // 5. Documento inválido → RECHAZADO permanente, no reintento infinito
  const malo = nuevo({ tipo: 'VOUCHER' }); // VOUCHER no es emitible ante SUNAT
  const rm = await worker.enviarComprobante(malo);
  check('inválido: RECHAZADO sin reintento', rm.estadoSunat === 'RECHAZADO' && rm.proximoIntentoEn === null, rm.estadoSunat);

  // 6. procesarPendientes no toca lo ya resuelto
  const antes = filas.filter((f) => f.estadoSunat === 'ACEPTADO').length;
  await worker.procesarPendientes({ limite: 5 });
  check('cola: no reenvía lo aceptado', filas.filter((f) => f.estadoSunat === 'ACEPTADO').length === antes);

  console.log(fallos === 0 ? '\n=== TODO OK ===' : `\n=== ${fallos} FALLAS ===`);
  process.exit(fallos === 0 ? 0 : 1);
})();
