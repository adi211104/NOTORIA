// brand-shield/scripts/prueba-resumen-beta.js
// Envía un Resumen Diario de Boletas (RC) REAL al entorno beta de SUNAT, con el
// RUC y usuario de pruebas que SUNAT publica. No toca producción.
//
//   node scripts/prueba-resumen-beta.js
//
// El resumen es asíncrono: `sendSummary` devuelve un ticket y el resultado se
// consulta con `getStatus`. Por eso el script no termina al enviar — sondea el
// ticket hasta que SUNAT resuelve, que es el único modo de saber si el XML es
// correcto. Un ticket entregado NO significa aceptado.

const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'src');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SALIDA, { recursive: true });

process.env.EMISOR_RUC = '20000000001';       // RUC de pruebas de SUNAT
process.env.SUNAT_SOL_USUARIO = 'MODDATOS';
process.env.SUNAT_SOL_CLAVE = 'moddatos';
process.env.SUNAT_ENTORNO = 'beta';
process.env.SUNAT_CERT_P12_PATH = path.join(__dirname, 'sunat-test.p12');
process.env.SUNAT_CERT_PASSWORD = 'test123';

const ubl = require(path.join(base, 'sunat/ublResumenBoletas'));
const firma = require(path.join(base, 'sunat/firmaXades'));
const billService = require(path.join(base, 'sunat/billService'));

let fallos = 0;
const ok = (...a) => console.log('✓', ...a);
const mal = (...a) => { console.error('✗', ...a); fallos++; };

// El beta recuerda lo enviado y rechaza correlativos repetidos, así que cada
// corrida usa los suyos.
const n = 100 + Math.floor(Math.random() * 800);
const numero = (i) => `B001-${String(n + i).padStart(8, '0')}`;

// Boletas del día anterior, que es lo que informa un resumen diario
const ayer = new Date();
ayer.setDate(ayer.getDate() - 1);

const boletas = [
  {
    // Boleta pequeña sin documento del comprador: por debajo de S/700 la norma
    // no obliga a identificarlo, y el XML debe omitir el bloque del receptor.
    numero: numero(0), fechaEmision: ayer,
    receptorTipoDoc: '1', receptorNumDoc: null, receptorNombre: 'Cliente sin identificar',
    moneda: 'PEN', gravadas: 5000, exportacion: 0, igv: 900, total: 5900,
  },
  {
    // Boleta con DNI
    numero: numero(1), fechaEmision: ayer,
    receptorTipoDoc: '1', receptorNumDoc: '12345678', receptorNombre: 'ANA PEREZ',
    moneda: 'PEN', gravadas: 47797, exportacion: 0, igv: 8603, total: 56400,
  },
  {
    // Franquicia anual: cruza S/700, así que lleva DNI obligatorio
    numero: numero(2), fechaEmision: ayer,
    receptorTipoDoc: '1', receptorNumDoc: '87654321', receptorNombre: 'LUIS TORRES',
    moneda: 'PEN', gravadas: 145424, exportacion: 0, igv: 26176, total: 171600,
  },
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// MODDATOS es un usuario compartido y devuelve 401 si se le pega seguido:
// reintenta con espera creciente antes de dar el envío por fallido.
const enviarConReintento = async (args) => {
  let r;
  for (let intento = 0; intento < 5; intento++) {
    if (intento) await esperar(5000 * intento);
    r = await billService.enviarResumen(args);
    if (r.httpStatus !== 401) break;
    console.log(`  (401 — reintento ${intento + 1})`);
  }
  return r;
};

(async () => {
  console.log(`Resumen diario contra ${billService.endpoint()}\n`);

  // ── 1. Construcción ────────────────────────────────────
  let doc;
  try {
    doc = ubl.construir({ boletas, fechaGeneracion: new Date(), correlativo: 1 });
    ok('XML construido:', doc.id, `(${doc.totalBoletas} boletas del ${doc.fechaReferencia})`);
  } catch (e) {
    return mal('No se pudo construir el XML:', e.message);
  }

  // Un resumen mezclando fechas debe rechazarse acá, no en SUNAT
  try {
    const otra = new Date(ayer); otra.setDate(otra.getDate() - 3);
    ubl.construir({ boletas: [...boletas, { ...boletas[0], numero: numero(9), fechaEmision: otra }] });
    mal('Aceptó boletas de días distintos en un mismo resumen');
  } catch {
    ok('Rechaza mezclar boletas de días distintos');
  }

  // ── 2. Firma ───────────────────────────────────────────
  let firmado;
  try {
    // firmar() devuelve { xml, digest }; verificar() devuelve { valida, error }
    const r = firma.firmar(doc.xml);
    firmado = r.xml;
    const v = firma.verificar(firmado);
    if (!v.valida) return mal('La firma no verifica:', v.error);
    ok('Firmado y verificado criptográficamente · digest', r.digest?.slice(0, 16) + '…');
  } catch (e) {
    return mal('Falló la firma:', e.message);
  }
  fs.writeFileSync(path.join(SALIDA, `${doc.nombreArchivo}.xml`), firmado, 'utf8');

  // ── 3. Envío ───────────────────────────────────────────
  const envio = await enviarConReintento({ xmlFirmado: firmado, nombreArchivo: doc.nombreArchivo });
  if (envio.estado !== 'EN_PROCESO') {
    return mal(`SUNAT no aceptó el envío [${envio.estado}] ${envio.codigo || ''} ${envio.mensaje || ''}`);
  }
  ok('Ticket recibido:', envio.ticket);

  // ── 4. Sondeo del ticket ───────────────────────────────
  // Un ticket entregado no significa aceptado: SUNAT procesa aparte y el
  // veredicto llega en getStatus.
  let intento = 0;
  while (intento < 12) {
    await esperar(intento === 0 ? 3000 : 5000);
    intento++;
    const r = await billService.consultarTicket({ ticket: envio.ticket });

    if (r.estado === 'EN_PROCESO') { console.log(`  … SUNAT sigue procesando (intento ${intento})`); continue; }
    if (r.estado === 'ERROR_TRANSPORTE') { console.log(`  … error transitorio: ${r.mensaje}`); continue; }

    if (r.estado === 'ACEPTADO') {
      ok(`ACEPTADO por SUNAT — código ${r.codigo}: ${r.mensaje}`);
      if (r.notas?.length) console.log('  observaciones:', r.notas.join(' | '));
      fs.writeFileSync(path.join(SALIDA, `${doc.nombreArchivo}-CDR.xml`), r.cdrXml, 'utf8');
    } else {
      mal(`RECHAZADO por SUNAT — código ${r.codigo}: ${r.mensaje}`);
      if (r.notas?.length) console.error('  detalle:', r.notas.join(' | '));
    }
    break;
  }
  if (intento >= 12) mal('SUNAT no resolvió el ticket tras 12 consultas');

  // ── 5. Anulación ───────────────────────────────────────
  // Una boleta ya informada se ANULA con otro resumen en estado 3, no con una
  // comunicación de baja (esa es solo para facturas). Se comprueba de verdad
  // porque el camino de anulación es el que nadie prueba hasta que hace falta.
  if (!fallos) {
    const anulada = { ...boletas[1], estado: ubl.ESTADO.ANULAR };
    const doc2 = ubl.construir({ boletas: [anulada], fechaGeneracion: new Date(), correlativo: 2 });
    const { xml } = firma.firmar(doc2.xml);
    const envio2 = await enviarConReintento({ xmlFirmado: xml, nombreArchivo: doc2.nombreArchivo });

    if (envio2.estado !== 'EN_PROCESO') {
      mal(`La anulación no fue admitida [${envio2.estado}] ${envio2.codigo || ''} ${envio2.mensaje || ''}`);
    } else {
      let veredicto = null;
      for (let i = 0; i < 12 && !veredicto; i++) {
        await esperar(i === 0 ? 3000 : 5000);
        const r = await billService.consultarTicket({ ticket: envio2.ticket });
        if (r.estado === 'EN_PROCESO' || r.estado === 'ERROR_TRANSPORTE') continue;
        veredicto = r;
      }
      if (!veredicto) mal('SUNAT no resolvió el ticket de la anulación');
      else if (veredicto.estado === 'ACEPTADO') ok(`Anulación de ${anulada.numero} ACEPTADA — ${veredicto.mensaje}`);
      else mal(`Anulación RECHAZADA — código ${veredicto.codigo}: ${veredicto.mensaje}`);
    }
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — el resumen diario funciona contra SUNAT');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('✗ Error inesperado:', e.message); process.exit(1); });
