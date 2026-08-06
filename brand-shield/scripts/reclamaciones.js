// brand-shield/scripts/reclamaciones.js
// Gestión del Libro de Reclamaciones desde la terminal.
//
//   node scripts/reclamaciones.js                      ← pendientes, por urgencia
//   node scripts/reclamaciones.js todas                ← incluye las respondidas
//   node scripts/reclamaciones.js ver <número>         ← la hoja completa
//   node scripts/reclamaciones.js responder <número>   ← responder (abre el editor)
//   node scripts/reclamaciones.js responder <número> --texto "..."
//
// En producción, anteponer:  railway run --service api
//
// Se gestiona por terminal y NO desde una pantalla web a propósito: la tabla
// guarda datos personales de terceros (DNI, domicilio, teléfono) y exponerlos
// tras el panel haría que robar una sesión también los comprometiera. Es una
// tarea de baja frecuencia; no compensa abrir superficie web para ella.

const prisma = require('../src/lib/prisma');
const { plazoDe, DIAS_HABILES_PLAZO } = require('../src/lib/reclamaciones');
const { enviarRespuestaReclamacion } = require('../src/utils/emails');

const [comando, ...resto] = process.argv.slice(2);

const fecha = (d) => new Date(d).toLocaleDateString('es-PE', { timeZone: 'America/Lima' });

// Marca de urgencia, para que lo que corre se vea de un vistazo
const marca = (p) => {
  if (p.diasRestantes === null) return '  respondida ';
  if (p.vencida) return ` ¡VENCIDA! (${Math.abs(p.diasRestantes)}d) `;
  if (p.urgente) return `  quedan ${p.diasRestantes}d  `;
  return `  quedan ${p.diasRestantes}d  `;
};

const listar = async (todas) => {
  const donde = todas ? {} : { estado: 'PENDIENTE' };
  const filas = await prisma.reclamacion.findMany({ where: donde, orderBy: { creadoEn: 'asc' } });

  if (!filas.length) {
    console.log(todas ? 'El libro está vacío.' : 'No hay reclamaciones pendientes de respuesta.');
    return;
  }

  // Lo más urgente primero: vencidas, luego por días restantes
  const conPlazo = filas.map(r => ({ r, p: plazoDe(r) }))
    .sort((a, b) => (a.p.diasRestantes ?? 9999) - (b.p.diasRestantes ?? 9999));

  console.log(`\n${filas.length} reclamación(es) · plazo legal ${DIAS_HABILES_PLAZO} días hábiles\n`);
  for (const { r, p } of conPlazo) {
    console.log(`${marca(p)} ${r.numero}  ${r.tipo === 'QUEJA' ? 'Queja ' : 'Reclamo'}  ${fecha(r.creadoEn)}  ${r.nombre}`);
    console.log(`               ${r.detalle.slice(0, 90).replace(/\s+/g, ' ')}${r.detalle.length > 90 ? '…' : ''}`);
    if (!p.vencida && p.diasRestantes !== null) console.log(`               vence el ${fecha(p.venceEl)}`);
  }
  console.log(`\nVer una:      node scripts/reclamaciones.js ver <número>`);
  console.log(`Responder:    node scripts/reclamaciones.js responder <número>\n`);
};

const buscar = async (numero) => {
  const r = await prisma.reclamacion.findUnique({ where: { numero } });
  if (!r) {
    console.error(`✗ No existe la hoja ${numero}. Lista las existentes con: node scripts/reclamaciones.js todas`);
    process.exit(1);
  }
  return r;
};

const ver = async (numero) => {
  const r = await buscar(numero);
  const p = plazoDe(r);
  const linea = (k, v) => console.log(`  ${k.padEnd(18)} ${v}`);
  console.log(`\nHOJA ${r.numero} — ${r.tipo === 'QUEJA' ? 'QUEJA' : 'RECLAMO'} — ${r.estado}\n`);
  linea('Fecha', new Date(r.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima' }));
  if (r.estado === 'PENDIENTE') {
    linea('Vence el', `${fecha(p.venceEl)} ${p.vencida ? '¡YA VENCIÓ!' : `(quedan ${p.diasRestantes} días hábiles)`}`);
  }
  linea('Consumidor', `${r.nombre} · ${r.docTipo} ${r.documento}`);
  linea('Domicilio', r.domicilio);
  linea('Contacto', `${r.email} · ${r.telefono}`);
  if (r.esMenor) linea('Apoderado', r.apoderado);
  linea('Bien contratado', `${r.tipoBien === 'PRODUCTO' ? 'Producto' : 'Servicio'} — ${r.descripcion}`);
  if (r.montoS) linea('Monto reclamado', `S/ ${(r.montoS / 100).toFixed(2)}`);
  console.log(`\n  Detalle:\n    ${r.detalle.replace(/\n/g, '\n    ')}`);
  console.log(`\n  Pedido:\n    ${r.pedido.replace(/\n/g, '\n    ')}`);
  if (r.respuesta) {
    console.log(`\n  Respuesta (${fecha(r.respondidoEn)}):\n    ${r.respuesta.replace(/\n/g, '\n    ')}`);
  }
  console.log('');
};

// Abre el editor del sistema para escribir la respuesta con calma. Una
// respuesta legal no se escribe cómodamente en una sola línea de terminal.
const pedirTextoEnEditor = async (r) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { spawnSync } = require('child_process');

  const archivo = path.join(os.tmpdir(), `reclamacion-${r.numero}.txt`);
  const plantilla = [
    '',
    '# Escribe arriba la respuesta que recibirá el consumidor.',
    '# Las líneas que empiezan con # se ignoran. Guarda y cierra para enviar.',
    '#',
    `# Hoja:     ${r.numero} (${r.tipo})`,
    `# Detalle:  ${r.detalle.replace(/\n/g, ' ')}`,
    `# Pedido:   ${r.pedido.replace(/\n/g, ' ')}`,
  ].join('\n');
  fs.writeFileSync(archivo, plantilla, 'utf8');

  const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
  const r2 = spawnSync(editor, [archivo], { stdio: 'inherit', shell: true });
  if (r2.error) {
    console.error(`✗ No se pudo abrir el editor (${editor}). Usa --texto "tu respuesta".`);
    process.exit(1);
  }

  const texto = fs.readFileSync(archivo, 'utf8')
    .split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
  fs.unlinkSync(archivo);
  return texto;
};

const responder = async (numero, textoDirecto) => {
  const r = await buscar(numero);
  if (r.estado === 'RESPONDIDO') {
    console.error(`✗ La hoja ${numero} ya fue respondida el ${fecha(r.respondidoEn)}.`);
    console.error('  Una hoja se responde una sola vez: es el cargo formal ante INDECOPI.');
    process.exit(1);
  }

  const texto = (textoDirecto || await pedirTextoEnEditor(r)).trim();
  if (texto.length < 20) {
    console.error('✗ La respuesta está vacía o es demasiado corta. No se envió nada.');
    process.exit(1);
  }

  console.log(`\nSe enviará a ${r.email}:\n`);
  console.log(texto.split('\n').map(l => '  ' + l).join('\n'));
  console.log('');

  // Primero el correo: si Resend falla, la hoja NO se marca como respondida,
  // porque el consumidor no habría recibido nada y el plazo seguiría corriendo.
  await enviarRespuestaReclamacion({ ...r, respuesta: texto });

  await prisma.reclamacion.update({
    where: { id: r.id },
    data: { respuesta: texto, estado: 'RESPONDIDO', respondidoEn: new Date() },
  });

  console.log(`✓ Respuesta enviada y hoja ${numero} marcada como RESPONDIDA.`);
};

(async () => {
  if (!comando || comando === 'pendientes') return listar(false);
  if (comando === 'todas') return listar(true);
  if (comando === 'ver') {
    if (!resto[0]) { console.error('Uso: node scripts/reclamaciones.js ver <número>'); process.exit(1); }
    return ver(resto[0]);
  }
  if (comando === 'responder') {
    if (!resto[0]) { console.error('Uso: node scripts/reclamaciones.js responder <número> [--texto "..."]'); process.exit(1); }
    const i = resto.indexOf('--texto');
    return responder(resto[0], i !== -1 ? resto[i + 1] : null);
  }
  console.error(`Comando desconocido: ${comando}`);
  console.error('Usa: (sin nada) | todas | ver <número> | responder <número>');
  process.exit(1);
})()
  .then(() => process.exit(0))
  .catch(e => { console.error('✗', e.message); process.exit(1); });
