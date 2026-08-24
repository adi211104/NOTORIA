#!/usr/bin/env node
// scripts/embudo.js
//
// El embudo de Notoria, leyendo la base de producción. SOLO LECTURA: no escribe
// ni una fila, no manda ni un correo, no gasta ni una llamada a Google.
//
//   node scripts/embudo.js
//
// ── Por qué un script y no una herramienta de analítica ──────────────────────
//
// La recomendación de manual es enchufar analítica de producto y medir el
// funnel. Con 11 usuarios eso es al revés: cualquier porcentaje sobre 11 casos
// es ruido, integrar un proveedor cuesta trabajo y una dependencia nueva, y el
// dato que hace falta —quién se quedó a mitad de camino y en qué paso— ya está
// en la base. Lo que hace falta no es Amplitude: es una consulta.
//
// Cuando haya cientos de cuentas y los porcentajes signifiquen algo, esto se
// queda corto y ahí sí toca instrumentar de verdad. Hasta entonces, esto es lo
// que contesta la pregunta.
//
// ⚠️ `railway run` NO sirve: inyecta la URL INTERNA de Postgres, inalcanzable
// desde fuera del contenedor. Se corre en local, donde el .env apunta al proxy
// público (es la misma trampa que documenta lib-env-produccion.js).

const prisma = require('../src/lib/prisma');
const { PLANES_DE_PAGO } = require('../src/lib/planes');

const pct = (n, de) => (de > 0 ? `${Math.round((n / de) * 100)}%` : '—');
const dias = (fecha) => Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);

const barra = (n, de, ancho = 24) => {
  const llenos = de > 0 ? Math.round((n / de) * ancho) : 0;
  return '█'.repeat(llenos) + '·'.repeat(ancho - llenos);
};

(async () => {
  console.log('\n═══ EMBUDO DE NOTORIA ═══');
  console.log(`Lectura del ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — solo lectura\n`);

  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true, email: true, nombre: true, plan: true, idioma: true,
      emailVerificado: true, creadoEn: true, suscripcionActiva: true,
      promoBienvenidaUsada: true,
      negocios: { select: { id: true, activo: true, googlePlaceId: true, _count: { select: { snapshots: true, resenas: true, alertas: true } } } },
      pagos: { select: { estado: true, monto: true, creadoEn: true } },
    },
    orderBy: { creadoEn: 'asc' },
  });

  const total = usuarios.length;

  // ── Los peldaños ──────────────────────────────────────────────────────────
  //
  // 🔴 «Activado» NO es «se registró». Una cuenta que se registra y no conecta
  // un negocio no ha visto el producto: no recibe alertas (no hay nada que
  // vigilar) y el drip la filtra por no estar verificada. Contarla como usuario
  // es engañarse, y es exactamente lo que hace que un producto parezca tener
  // tracción cuando no la tiene.
  const registrados = usuarios;
  const verificados = usuarios.filter((u) => u.emailVerificado);
  const conNegocio = usuarios.filter((u) => u.negocios.length > 0);
  const conFicha = usuarios.filter((u) => u.negocios.some((n) => n.googlePlaceId));
  const medidos = usuarios.filter((u) => u.negocios.some((n) => n._count.snapshots > 0));
  const conResenas = usuarios.filter((u) => u.negocios.some((n) => n._count.resenas > 0));
  const conAlerta = usuarios.filter((u) => u.negocios.some((n) => n._count.alertas > 0));
  const pagaron = usuarios.filter((u) => u.pagos.some((p) => p.estado === 'EXITOSO'));
  const activos = usuarios.filter((u) => PLANES_DE_PAGO.includes(u.plan) && u.suscripcionActiva);

  const pasos = [
    ['Se registró', registrados],
    ['Verificó el correo', verificados],
    ['Agregó un negocio', conNegocio],
    ['…con ficha de Google', conFicha],
    ['Se midió al menos una vez', medidos],
    ['Le entraron reseñas', conResenas],
    ['Recibió una alerta', conAlerta],
    ['Pagó alguna vez', pagaron],
    ['Suscripción viva hoy', activos],
  ];

  for (const [nombre, grupo] of pasos) {
    console.log(`  ${nombre.padEnd(28)} ${String(grupo.length).padStart(3)}  ${barra(grupo.length, total)}  ${pct(grupo.length, total)}`);
  }

  // ⚠️ Trampa de lectura: «Suscripción viva» puede ser MAYOR que «Pagó alguna
  // vez», y entonces el embudo parece subir. No es un error de los datos: son
  // los planes concedidos a mano con scripts/dar-plan.js, que a propósito NO
  // crean fila en `pagos` (la numeración de comprobantes es correlativa y no
  // admite huecos). Sin esta nota, alguien leería «tenemos suscriptores» donde
  // lo que hay son cuentas del dueño.
  const regalados = activos.filter((u) => !u.pagos.some((p) => p.estado === 'EXITOSO'));
  if (regalados.length) {
    console.log(`
[!] ${regalados.length} suscripcion(es) viva(s) SIN cobro: plan concedido a mano (dar-plan.js).`);
    console.log(`      ${regalados.map((u) => u.email).join(', ')}`);
    console.log('      No son clientes. Descontarlas antes de mirar la conversion.');
  }

  // ── Dónde se cae la gente ────────────────────────────────────────────────
  //
  // El peldaño con más caída es el que hay que arreglar, y sale de restar. Es
  // toda la analítica que hace falta a esta escala.
  console.log('\n── La caída más grande ──');
  let peor = null;
  for (let i = 1; i < pasos.length; i++) {
    const caida = pasos[i - 1][1].length - pasos[i][1].length;
    if (!peor || caida > peor.caida) peor = { caida, de: pasos[i - 1][0], a: pasos[i][0] };
  }
  console.log(peor && peor.caida > 0
    ? `  ${peor.caida} cuenta(s) se quedan entre «${peor.de}» y «${peor.a}»`
    : '  Sin caídas: todas las cuentas llegan al final.');

  // ── Los que se quedaron a medias, con nombre ─────────────────────────────
  //
  // A esta escala lo accionable no es un porcentaje: es la lista. Se puede
  // escribirles uno por uno, y eso es exactamente lo que hay que hacer con los
  // primeros clientes.
  console.log('\n── Cuentas atascadas ──');
  const atascadas = usuarios.filter((u) => !u.pagos.some((p) => p.estado === 'EXITOSO'));
  if (!atascadas.length) console.log('  (ninguna)');
  for (const u of atascadas) {
    const donde = !u.emailVerificado ? 'sin verificar el correo'
      : u.negocios.length === 0 ? 'sin agregar ningún negocio'
      : !u.negocios.some((n) => n._count.snapshots > 0) ? 'con negocio pero sin medir'
      : !u.negocios.some((n) => n._count.resenas > 0) ? 'midiendo, pero sin reseñas captadas'
      : 'usando el producto y sin pagar';
    console.log(`  ${u.email.padEnd(34)} ${String(dias(u.creadoEn)).padStart(3)} d  ${u.plan.padEnd(11)} ${donde}`);
  }

  // ── Dinero ────────────────────────────────────────────────────────────────
  const exitosos = usuarios.flatMap((u) => u.pagos.filter((p) => p.estado === 'EXITOSO'));
  const reembolsados = usuarios.flatMap((u) => u.pagos.filter((p) => p.estado === 'REEMBOLSADO'));
  const fallidos = usuarios.flatMap((u) => u.pagos.filter((p) => p.estado === 'FALLIDO'));
  const soles = (c) => (c.reduce((n, p) => n + (p.monto || 0), 0) / 100).toFixed(2);

  console.log('\n── Cobros ──');
  console.log(`  Exitosos     ${String(exitosos.length).padStart(3)}   S/${soles(exitosos)}`);
  console.log(`  Reembolsados ${String(reembolsados.length).padStart(3)}   S/${soles(reembolsados)}`);
  console.log(`  Fallidos     ${String(fallidos.length).padStart(3)}`);

  // ── Reparto por plan ─────────────────────────────────────────────────────
  console.log('\n── Por plan ──');
  const porPlan = new Map();
  for (const u of usuarios) porPlan.set(u.plan, (porPlan.get(u.plan) || 0) + 1);
  for (const [plan, n] of [...porPlan.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${plan.padEnd(12)} ${String(n).padStart(3)}  ${pct(n, total)}`);
  }

  // ⚠️ El idioma importa más de lo que parece: el producto manda 6 correos
  // bilingües, y una cuenta en inglés que reciba español es un fallo mudo. Ya
  // pasó dos veces (§12).
  const enIngles = usuarios.filter((u) => u.idioma === 'en').length;
  console.log(`\n  Cuentas con el panel en inglés: ${enIngles}`);

  await prisma.$disconnect();
  console.log('');
})().catch(async (e) => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
