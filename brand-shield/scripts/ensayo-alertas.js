// brand-shield/scripts/ensayo-alertas.js
//
// Ensayo EN VIVO de la cadena de alertas por reseña negativa.
//
// 🔴 Por qué existe. `alertarResenaNegativa` se desplegó el 2026-08-22 y el
// contenedor la tiene, pero el 2026-08-23 la tabla `alertas` seguía en CERO — y
// eso era esperable, no un fallo: la función solo se dispara con una reseña de
// ≤2★ *nueva*, y las 12 que hay en producción están silenciadas a propósito por
// antigüedad. O sea que esperar no la valida nunca. Las otras señales del
// detector tampoco se han ejercitado jamás: el único movimiento de rating en 49
// días (Geyser 4.1→4.0, el 31 de julio) es ANTERIOR al commit que introdujo la
// comparación contra el snapshot anterior. Resumen: todo desplegado, cero
// confirmaciones en vivo.
//
// Este script cierra esa distancia llamando a la MISMA función que corre en
// producción — importada, no copiada. Es la regla que salvó a TikTok de un
// cliente escrito contra un endpoint inexistente que pasaba todas las pruebas.
//
// 🔴 Trae control positivo y controles negativos. Un verificador que solo
// comprueba el caso bueno no distingue "funciona" de "avisa siempre", y en esta
// función lo que hay que vigilar son justamente los SILENCIOS: si uno se rompe
// no falla nada — simplemente se avisa de más, o se deja de avisar.
//
// Uso:
//   railway run --service api node scripts/ensayo-alertas.js            # simulacro
//   railway run --service api node scripts/ensayo-alertas.js --aplicar  # crea y envía de verdad
//   ... --negocio <id>     elegir el negocio a mano
//   ... --conservar        no borrar las alertas creadas (para verlas en el panel)
//
// Se corre con `railway run` a propósito: el `.env` local tiene
// FRONTEND_URL=localhost y el correo saldría con botones que no llevan a ninguna
// parte. Con las variables de producción el ensayo se parece al caso real.

const { PrismaClient } = require('@prisma/client');
const {
  alertarResenaNegativa,
  UMBRAL_RESENA_NEGATIVA,
  DIAS_RESENA_RECIENTE,
} = require('../src/workers/monitoreo.worker');

const prisma = new PrismaClient();

// 🔴 El ensayo manda un correo DE VERDAD y crea una fila de verdad. Solo puede
// correr sobre un negocio de una cuenta del dueño: hacerlo sobre la de un
// cliente sería avisarle de una reseña que no existe.
const CUENTAS_ENSAYO = ['didier@usenotoria.app', 'didierprincipe@gmail.com'];

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const conservar = args.includes('--conservar');
const negocioIdArg = args.includes('--negocio') ? args[args.indexOf('--negocio') + 1] : null;

const hace = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// Los cuatro casos. El primero DEBE crear alerta; los tres siguientes son los
// silencios documentados y NO deben crear ninguna.
const CASOS = [
  {
    nombre: 'Reseña de 1★ recién publicada',
    espera: 'ALERTA',
    porque: 'es lo que el producto promete: aviso inmediato por reseña negativa nueva',
    primerBarrido: false,
    resena: {
      rating: 1,
      fechaResena: hace(0),
      autorNombre: 'Ensayo Notoria',
      texto: 'ENSAYO INTERNO DE NOTORIA, esta reseña no existe. Pedimos dos veces y tardaron muchísimo en atender.',
      motivoSospecha: null,
    },
  },
  {
    nombre: `Reseña de 1★ de hace ${DIAS_RESENA_RECIENTE + 30} días`,
    espera: 'SILENCIO',
    porque: 'si el escaneo estuvo caído, algo viejo aparece hoy como nuevo PARA NOSOTROS; el correo dice que acaba de llegar y eso tiene que ser cierto',
    primerBarrido: false,
    resena: {
      rating: 1,
      fechaResena: hace(DIAS_RESENA_RECIENTE + 30),
      autorNombre: 'Ensayo Notoria',
      texto: 'ENSAYO INTERNO. Reseña antigua, no debe avisar.',
      motivoSospecha: null,
    },
  },
  {
    nombre: `Reseña de ${UMBRAL_RESENA_NEGATIVA + 1}★ recién publicada`,
    espera: 'SILENCIO',
    porque: 'de 3★ para arriba el cliente no está molesto y marcarlo sería ruido',
    primerBarrido: false,
    resena: {
      rating: UMBRAL_RESENA_NEGATIVA + 1,
      fechaResena: hace(0),
      autorNombre: 'Ensayo Notoria',
      texto: 'ENSAYO INTERNO. Estuvo bien, nada que reclamar.',
      motivoSospecha: null,
    },
  },
  {
    nombre: 'Reseña de 1★ recién publicada, en el PRIMER barrido',
    espera: 'SILENCIO',
    porque: 'un negocio recién conectado recibe de golpe las 5 reseñas que publica Places, y pueden ser de hace años',
    primerBarrido: true,
    resena: {
      rating: 1,
      fechaResena: hace(0),
      autorNombre: 'Ensayo Notoria',
      texto: 'ENSAYO INTERNO. Primer barrido, no debe avisar.',
      motivoSospecha: null,
    },
  },
];

const cargarNegocio = () => {
  const include = {
    usuario: {
      select: { id: true, email: true, nombre: true, prefsAlertas: true, plan: true, idioma: true },
    },
  };
  if (negocioIdArg) return prisma.negocio.findUnique({ where: { id: negocioIdArg }, include });
  return prisma.negocio.findFirst({
    where: { activo: true, usuario: { email: { in: CUENTAS_ENSAYO } } },
    include,
    orderBy: { creadoEn: 'asc' },
  });
};

(async () => {
  const negocio = await cargarNegocio();

  if (!negocio) throw new Error('No se encontró ningún negocio activo de una cuenta de ensayo.');
  if (!CUENTAS_ENSAYO.includes(negocio.usuario.email)) {
    throw new Error(
      `NEGADO: "${negocio.nombre}" pertenece a ${negocio.usuario.email}, que no es cuenta de ensayo. Este script manda un correo real.`,
    );
  }

  const prefs = negocio.usuario.prefsAlertas;
  console.log('═══ ENSAYO DE LA CADENA DE ALERTAS ═══\n');
  console.log(`Negocio     : ${negocio.nombre} (${negocio.id})`);
  console.log(`Cuenta      : ${negocio.usuario.email} · plan ${negocio.usuario.plan} · idioma ${negocio.usuario.idioma}`);
  console.log(`Preferencias: ${prefs ? JSON.stringify(prefs) : 'ninguna (se notifica todo)'}`);
  console.log(`Front       : ${process.env.FRONTEND_URL || '(sin FRONTEND_URL)'}`);
  console.log(`Modo        : ${aplicar ? '🔴 APLICAR — crea filas y manda correos de verdad' : 'simulacro (no toca nada)'}\n`);

  // El filtro de preferencias vive en `notificar()` y puede silenciar el correo
  // sin que eso sea un fallo. Se avisa antes para no leer mal el resultado.
  if (prefs?.frecuencia && prefs.frecuencia !== 'INMEDIATA') {
    console.log('⚠️  frecuencia != INMEDIATA: se creará la alerta pero NO saldrá correo (y está bien).\n');
  }
  if (prefs?.umbralNegativas === 5) {
    console.log('⚠️  umbralNegativas = 5: el usuario apagó el correo por reseña individual (y está bien).\n');
  }
  if (prefs?.tipos && prefs.tipos.RESENA_MUY_NEGATIVA === false) {
    console.log('⚠️  RESENA_MUY_NEGATIVA desactivada en preferencias: no saldrá correo (y está bien).\n');
  }

  if (!aplicar) {
    CASOS.forEach((c, i) => {
      console.log(`${i + 1}. ${c.nombre}`);
      console.log(`   espera ${c.espera} — ${c.porque}\n`);
    });
    console.log('Simulacro: no se tocó nada. Para ejecutarlo de verdad, repetir con --aplicar.');
    return;
  }

  const creadas = [];
  const resultados = [];

  for (const caso of CASOS) {
    const idsAntes = new Set(
      (await prisma.alerta.findMany({ where: { negocioId: negocio.id }, select: { id: true } })).map((a) => a.id),
    );

    // Se llama a la función REAL, con la misma forma de objeto que le pasa el
    // worker. Nada de reimplementar la lógica acá: eso probaría la copia.
    await alertarResenaNegativa(
      negocio,
      { id: `ensayo-${Date.now()}`, plataforma: 'GOOGLE', ...caso.resena },
      caso.primerBarrido,
    );

    const nuevas = (
      await prisma.alerta.findMany({ where: { negocioId: negocio.id }, orderBy: { creadaEn: 'desc' } })
    ).filter((a) => !idsAntes.has(a.id));

    const obtenido = nuevas.length > 0 ? 'ALERTA' : 'SILENCIO';
    const ok = obtenido === caso.espera;
    resultados.push({ caso: caso.nombre, espera: caso.espera, obtenido, ok });
    creadas.push(...nuevas);

    console.log(`${ok ? '✅' : '❌'} ${caso.nombre}`);
    console.log(`   esperado ${caso.espera} · obtenido ${obtenido}`);
    for (const a of nuevas) {
      console.log(`   alerta ${a.id} · tipo ${a.tipo}`);
      console.log(`   texto: ${a.descripcion}`);
      // `notificada` se pone a true DESPUÉS de que el notificador vuelve sin
      // lanzar, así que es la prueba de que el correo salió (o de que las
      // preferencias lo silenciaron a propósito, avisado arriba).
      console.log(`   notificada: ${a.notificada}`);
    }
    console.log('');
  }

  if (creadas.length && !conservar) {
    await prisma.alerta.deleteMany({ where: { id: { in: creadas.map((a) => a.id) } } });
    console.log(`🧹 Borradas las ${creadas.length} alerta(s) del ensayo. La tabla queda como estaba.`);
  } else if (creadas.length) {
    console.log(`⚠️  --conservar: quedan ${creadas.length} alerta(s) de ensayo en producción.`);
    console.log(`   ids: ${creadas.map((a) => a.id).join(', ')}`);
  }

  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n═══ ${resultados.length - fallos.length}/${resultados.length} correctos ═══`);
  if (fallos.length) {
    fallos.forEach((f) => console.log(`   ❌ ${f.caso}: esperaba ${f.espera}, dio ${f.obtenido}`));
    process.exitCode = 1;
  } else {
    console.log('Cadena completa verificada: detector → fila de Alerta → notificador → correo, y los tres silencios callan.');
  }
})()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
