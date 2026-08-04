// Envío real contra el entorno BETA de SUNAT, con el RUC y usuario de pruebas
// que SUNAT publica para eso. No toca nada de producción.
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


const ubl = require(path.join(base, 'sunat/ublInvoice'));
const firma = require(path.join(base, 'sunat/firmaXades'));
const billService = require(path.join(base, 'sunat/billService'));

// Correlativos altos y aleatorios: el beta de SUNAT guarda lo ya enviado y
// rechaza un número repetido, así que cada corrida usa los suyos.
const n = 100 + Math.floor(Math.random() * 800);
const num = (serie, i) => `${serie}-${String(n + i).padStart(8, '0')}`;

const casos = [
  {
    nombre: 'Factura gravada (cliente peruano con RUC, IGV 18%)',
    c: {
      tipo: 'FACTURA', serie: 'F001', correlativo: n, numero: num('F001', 0),
      fechaEmision: new Date(),
      receptorNombre: 'RESTAURANTE LA MAR S.A.C.', receptorTipoDoc: '6', receptorNumDoc: '20512345678',
      receptorDireccion: 'Av. La Mar 770, Miraflores, Lima', receptorPais: 'PE',
      moneda: 'USD', gravadas: 1695, exportacion: 0, igv: 305, total: 2000,
      tipoOperacion: '0101', descripcion: 'Notoria - Plan Negocio, suscripcion por 1 mes',
    },
  },
  {
    nombre: 'Factura de exportación de servicios (cliente del exterior, sin IGV)',
    c: {
      tipo: 'FACTURA', serie: 'F001', correlativo: n + 1, numero: num('F001', 1),
      fechaEmision: new Date(),
      receptorNombre: 'GRUPO ANDERSON LLC', receptorTipoDoc: '0', receptorNumDoc: '0',
      receptorDireccion: 'Av. Reforma 222, Ciudad de Mexico', receptorPais: 'MX',
      moneda: 'USD', gravadas: 0, exportacion: 6000, igv: 0, total: 6000,
      tipoOperacion: '0201', descripcion: 'Notoria - Plan Franquicia, suscripcion por 1 mes',
    },
  },
  {
    nombre: 'Boleta (cliente peruano con DNI)',
    c: {
      tipo: 'BOLETA', serie: 'B001', correlativo: n, numero: num('B001', 0),
      fechaEmision: new Date(),
      receptorNombre: 'JUAN PEREZ QUISPE', receptorTipoDoc: '1', receptorNumDoc: '45678912',
      receptorDireccion: null, receptorPais: 'PE',
      moneda: 'USD', gravadas: 1695, exportacion: 0, igv: 305, total: 2000,
      tipoOperacion: '0101', descripcion: 'Notoria - Plan Negocio, suscripcion por 1 mes',
    },
  },
];

(async () => {
  console.log(`Endpoint: ${billService.endpoint()}\n`);
  let fallos = 0;

  for (const { nombre, c } of casos) {
    const { xml, nombreArchivo } = ubl.construir(c);
    const { xml: firmado, digest } = firma.firmar(xml);

    // MODDATOS es un usuario compartido y devuelve 401 si se le pega seguido:
    // reintenta con espera creciente antes de dar el caso por fallido.
    let r;
    for (let intento = 0; intento < 5; intento++) {
      if (intento) await new Promise((res) => setTimeout(res, 5000 * intento));
      r = await billService.enviar({ xmlFirmado: firmado, nombreArchivo });
      if (r.httpStatus !== 401) break;
      console.log(`     (401 — reintento ${intento + 1})`);
    }

    const ok = r.aceptado && !(r.notas?.length);
    if (!ok) fallos++;
    console.log(`${r.aceptado ? (r.notas?.length ? 'OBS ' : 'OK  ') : 'FALLA'} ${nombre}`);
    console.log(`     ${c.numero} · digest ${digest}`);
    console.log(`     ${r.estado} (${r.codigo || '—'}) ${r.mensaje || ''}`);
    if (r.notas?.length) r.notas.forEach((o) => console.log(`     OBSERVACIÓN: ${o}`));
    if (r.cdrZip) fs.writeFileSync(path.join(SALIDA, `R-${nombreArchivo}.zip`), r.cdrZip);
    console.log('');
  }

  console.log(fallos === 0 ? '=== TODOS ACEPTADOS SIN OBSERVACIONES ===' : `=== ${fallos} con problemas ===`);
  process.exit(fallos === 0 ? 0 : 1);
})();
