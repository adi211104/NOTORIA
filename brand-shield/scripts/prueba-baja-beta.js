// brand-shield/scripts/prueba-baja-beta.js
// Envía una Comunicación de Baja (RA) REAL al entorno beta de SUNAT, con el RUC
// y usuario de pruebas que SUNAT publica. No toca producción.
//
//   node scripts/prueba-baja-beta.js
//
// La baja es asíncrona igual que el resumen diario: `sendSummary` devuelve un
// ticket y el veredicto se consulta con `getStatus`. Un ticket entregado NO
// significa aceptado, así que el script sondea hasta que SUNAT resuelve.

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

const ubl = require(path.join(base, 'sunat/ublComunicacionBaja'));
const firma = require(path.join(base, 'sunat/firmaXades'));
const billService = require(path.join(base, 'sunat/billService'));

let fallos = 0;
const ok = (...a) => console.log('✓', ...a);
const mal = (...a) => { console.error('✗', ...a); fallos++; };

// El beta recuerda lo enviado y rechaza correlativos repetidos, así que cada
// corrida usa los suyos.
const n = 100 + Math.floor(Math.random() * 800);
const numero = (i) => `F001-${String(n + i).padStart(8, '0')}`;

// Las facturas a dar de baja son de ayer: la baja se manda después de emitir
const ayer = new Date();
ayer.setDate(ayer.getDate() - 1);

const facturas = [
  { numero: numero(0), tipo: 'FACTURA', fechaEmision: ayer, motivo: 'ERROR EN EL RUC DEL ADQUIRIENTE' },
  { numero: numero(1), tipo: 'FACTURA', fechaEmision: ayer, motivo: 'ANULACION DE LA OPERACION' },
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
  console.log(`Comunicación de baja contra ${billService.endpoint()}\n`);

  // ── 1. Reglas que deben cortar ANTES de gastar un envío ─
  try {
    ubl.construir({ comprobantes: [{ numero: 'B001-00000001', tipo: 'BOLETA', fechaEmision: ayer, motivo: 'X' }] });
    mal('Aceptó una boleta en una comunicación de baja');
  } catch (e) {
    ok('Rechaza boletas:', e.message);
  }

  try {
    ubl.construir({ comprobantes: [{ ...facturas[0], motivo: '  ' }] });
    mal('Aceptó una baja sin motivo');
  } catch {
    ok('Exige el motivo de anulación');
  }

  try {
    const otra = new Date(ayer); otra.setDate(otra.getDate() - 3);
    ubl.construir({ comprobantes: [...facturas, { ...facturas[0], numero: numero(9), fechaEmision: otra }] });
    mal('Aceptó comprobantes de días distintos en una misma baja');
  } catch {
    ok('Rechaza mezclar comprobantes de días distintos');
  }

  // El correlativo viaja sin los ceros con los que se imprime
  const partido = ubl.partirNumero('F001-00000123');
  if (partido.serie === 'F001' && partido.correlativo === '123') ok('Parte el número: F001 · 123');
  else mal('partirNumero devolvió', JSON.stringify(partido));

  // Plazo legal: 7 días calendario desde la emisión
  const viejo = new Date(); viejo.setDate(viejo.getDate() - 8);
  if (ubl.dentroDePlazo(ayer) && !ubl.dentroDePlazo(viejo)) ok('Vigila el plazo de 7 días');
  else mal('El cálculo del plazo de baja no distingue dentro de fuera de plazo');

  // ── 2. Construcción ────────────────────────────────────
  let doc;
  try {
    doc = ubl.construir({ comprobantes: facturas, fechaGeneracion: new Date(), correlativo: 1 });
    ok('XML construido:', doc.id, `(${doc.totalComprobantes} facturas del ${doc.fechaReferencia})`);
  } catch (e) {
    return mal('No se pudo construir el XML:', e.message);
  }

  // ── 3. Firma ───────────────────────────────────────────
  let firmado;
  try {
    const r = firma.firmar(doc.xml);
    firmado = r.xml;
    const v = firma.verificar(firmado);
    if (!v.valida) return mal('La firma no verifica:', v.error);
    ok('Firmado y verificado criptográficamente · digest', r.digest?.slice(0, 16) + '…');
  } catch (e) {
    return mal('Falló la firma:', e.message);
  }
  fs.writeFileSync(path.join(SALIDA, `${doc.nombreArchivo}.xml`), firmado, 'utf8');

  // ── 4. Envío ───────────────────────────────────────────
  const envio = await enviarConReintento({ xmlFirmado: firmado, nombreArchivo: doc.nombreArchivo });
  if (envio.estado !== 'EN_PROCESO') {
    return mal(`SUNAT no aceptó el envío [${envio.estado}] ${envio.codigo || ''} ${envio.mensaje || ''}`);
  }
  ok('Ticket recibido:', envio.ticket);

  // ── 5. Sondeo del ticket ───────────────────────────────
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

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — la comunicación de baja funciona contra SUNAT');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('✗ Error inesperado:', e.message); process.exit(1); });
