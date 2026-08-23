// brand-shield/scripts/prueba-verificacion.js
// Pruebas del recordatorio de activación de cuenta, con Prisma y Resend
// SIMULADOS: no toca la base, no manda correos y no necesita servidor.
//
//   node scripts/prueba-verificacion.js
//
// QUÉ SE VIGILA ACÁ. Lo mismo que en el aviso por reseña negativa: no que la
// función "funcione", sino sus condiciones de SILENCIO y su espaciado. Un fallo
// en cualquiera de las dos direcciones es invisible desde fuera:
//
//   · si se rompe el corte por ventana, se le sigue escribiendo para siempre a
//     un buzón que nunca confirmó nada — eso es spam y quema el dominio, que es
//     lo único que sostiene la entrega de TODOS los avisos del producto
//   · si se rompe el espaciado, la misma persona recibe un correo diario
//   · si se rompe el corte por `emailVerificado`, se le escribe a quien ya activó
//   · si el token se manda sin guardarse, el enlace no lo reconoce la base y la
//     persona concluye que el producto está roto

const Module = require('module');

// ── Dobles ────────────────────────────────────────────────
let db;

const nuevoEstado = () => ({ actualizaciones: [], correos: [], orden: [] });

const prismaFalso = {
  usuario: {
    findMany: async ({ where }) => {
      db.consulta = where;
      return db.usuarios;
    },
    update: async ({ where, data }) => {
      db.actualizaciones.push({ id: where.id, ...data });
      db.orden.push(`guardar-token:${where.id}`);
      return { id: where.id, ...data };
    },
  },
};

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

// ── Sujetos ───────────────────────────────────────────────
const { tocaRecordatorio, ultimoEnvioVerificacion, VENTANA_DIAS, ESPACIADO_DIAS, HORAS_VIGENCIA_TOKEN, DIA_MS } = require('../src/lib/verificacion');

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id.endsWith('/prisma')) return prismaFalso;
  return requireOriginal.apply(this, arguments);
};
const { procesarRecordatoriosVerificacion } = require('../src/workers/verificacion.worker');
Module.prototype.require = requireOriginal;

const AHORA = new Date('2026-08-23T15:00:00Z').getTime();
const hace = (d) => new Date(AHORA - d * DIA_MS);

// Un usuario al que le tocaría: registrado hace 5 días, último correo el del
// registro. Los casos de abajo cambian una cosa cada vez.
const usuario = (extra = {}) => ({
  id: 'u1',
  email: 'nadie@ejemplo.test',
  nombre: 'Nadie',
  idioma: 'es',
  emailVerificado: false,
  creadoEn: hace(5),
  // El registro deja la caducidad en «creación + 24 h».
  tokenVerificaExpira: new Date(hace(5).getTime() + HORAS_VIGENCIA_TOKEN * 3600 * 1000),
  ...extra,
});

const correrWorker = async (usuarios, enviarFalla = false) => {
  db = { ...nuevoEstado(), usuarios };
  const enviarVerificacion = async (u, token, opciones) => {
    db.orden.push(`enviar:${u.id}`);
    if (enviarFalla) throw new Error('Resend caído');
    db.correos.push({ email: u.email, token, opciones });
  };
  const r = await procesarRecordatoriosVerificacion({ prisma: prismaFalso, enviarVerificacion, ahora: AHORA });
  return { ...db, resultado: r };
};

const correr = async () => {
  // ── 1. La regla, caso por caso ──────────────────────────
  bloque('1. Cuándo toca y cuándo no');

  check('a los 5 días, sin correos desde el registro, TOCA',
    tocaRecordatorio(usuario(), AHORA).toca);

  check('quien ya verificó NO recibe nada',
    !tocaRecordatorio(usuario({ emailVerificado: true }), AHORA).toca);

  check(`el día 0 NO, puede estar a punto de abrir el correo del registro`,
    !tocaRecordatorio(usuario({ creadoEn: hace(0), tokenVerificaExpira: null }), AHORA).toca);

  check(`el día ${VENTANA_DIAS.desde - 1} todavía NO`,
    !tocaRecordatorio(usuario({ creadoEn: hace(VENTANA_DIAS.desde - 1), tokenVerificaExpira: null }), AHORA).toca);

  // ⚠️ La ventana abre el día 2 pero el ESPACIADO se cuenta desde el último
  // correo de verificación, y el del registro cuenta. Así que los días 2 y 3
  // están bloqueados y el primer recordatorio real sale el día 4. Se comprueba
  // el comportamiento de verdad, no el que sugiere el nombre de la constante.
  check(`el día ${VENTANA_DIAS.desde} NO todavía: el correo del registro fue hace ${VENTANA_DIAS.desde} días`,
    !tocaRecordatorio(usuario({ creadoEn: hace(VENTANA_DIAS.desde), tokenVerificaExpira: null }), AHORA).toca);

  check(`el día ${ESPACIADO_DIAS} SÍ: primer recordatorio real`,
    tocaRecordatorio(usuario({ creadoEn: hace(ESPACIADO_DIAS), tokenVerificaExpira: null }), AHORA).toca);

  check(`el día ${VENTANA_DIAS.hasta} todavía SÍ: es el último`,
    tocaRecordatorio(usuario({ creadoEn: hace(VENTANA_DIAS.hasta), tokenVerificaExpira: null }), AHORA).toca);

  check('en total salen DOS recordatorios (día 4 y día 8), no más',
    [4, 8].every((d) => tocaRecordatorio(usuario({ creadoEn: hace(d), tokenVerificaExpira: new Date(hace(d).getTime() + (d - 4) * DIA_MS + HORAS_VIGENCIA_TOKEN * 3600 * 1000) }), AHORA).toca)
    && !tocaRecordatorio(usuario({ creadoEn: hace(12), tokenVerificaExpira: null }), AHORA).toca);

  check(`el día ${VENTANA_DIAS.hasta + 1} ya NO: pasada la ventana se deja de insistir`,
    !tocaRecordatorio(usuario({ creadoEn: hace(VENTANA_DIAS.hasta + 1), tokenVerificaExpira: null }), AHORA).toca,
    'seguir escribiendo a un buzón sin confirmar es spam y quema el dominio');

  check('una cuenta de hace 49 días queda fuera (para eso está el script manual)',
    !tocaRecordatorio(usuario({ creadoEn: hace(49), tokenVerificaExpira: null }), AHORA).toca);

  // ── 2. Espaciado ────────────────────────────────────────
  bloque('2. Espaciado entre correos');

  const conUltimoEnvio = (dias, extra = {}) => usuario({
    tokenVerificaExpira: new Date(hace(dias).getTime() + HORAS_VIGENCIA_TOKEN * 3600 * 1000),
    ...extra,
  });

  check(`escrito hace ${ESPACIADO_DIAS - 1} día(s): NO se repite`,
    !tocaRecordatorio(conUltimoEnvio(ESPACIADO_DIAS - 1), AHORA).toca);

  check(`escrito hace ${ESPACIADO_DIAS} días: ya se puede`,
    tocaRecordatorio(conUltimoEnvio(ESPACIADO_DIAS), AHORA).toca);

  check('escrito hoy mismo desde el panel («reenviar»): el cron lo respeta',
    !tocaRecordatorio(conUltimoEnvio(0), AHORA).toca,
    'las dos vías comparten marcador, por eso no hace falta coordinarlas');

  // ── 3. El marcador derivado ─────────────────────────────
  bloque('3. De dónde sale «el último envío» sin columna nueva');

  const u3 = usuario({ tokenVerificaExpira: new Date(AHORA + 10 * 3600 * 1000) });
  check(`se deriva restando ${HORAS_VIGENCIA_TOKEN}h a la caducidad del token`,
    Math.abs(ultimoEnvioVerificacion(u3).getTime() - (AHORA + 10 * 3600 * 1000 - HORAS_VIGENCIA_TOKEN * 3600 * 1000)) < 1000);

  check('sin caducidad guardada se cae al registro, no a "nunca"',
    ultimoEnvioVerificacion(usuario({ tokenVerificaExpira: null })).getTime() === hace(5).getTime(),
    'tratarlo como "nunca" haría que una cuenta sin token recibiera correo todos los días');

  check('el motivo se explica siempre, también cuando NO toca',
    typeof tocaRecordatorio(usuario({ emailVerificado: true }), AHORA).motivo === 'string');

  // ── 4. El worker ────────────────────────────────────────
  bloque('4. El worker de las 10:30');

  let r = await correrWorker([usuario()]);
  check('manda el recordatorio a quien le toca', r.correos.length === 1);
  check('  …marcado como recordatorio, no como el correo del registro',
    r.correos[0]?.opciones?.recordatorio === true);
  check('  …diciendo cuántos días lleva la cuenta sin activar',
    r.correos[0]?.opciones?.diasDesdeRegistro === 5);
  check('  …con un token nuevo, no el caducado del registro',
    typeof r.correos[0]?.token === 'string' && r.correos[0].token.length === 40);

  check('🔴 el token se GUARDA antes de enviarse',
    r.orden.indexOf('guardar-token:u1') < r.orden.indexOf('enviar:u1'),
    'al revés, la persona recibiría un enlace que la base no reconoce');

  check('  …y lo que se guarda es el mismo token que viaja en el correo',
    r.actualizaciones[0]?.tokenVerificacion === r.correos[0]?.token);

  check('  …con la caducidad movida 24h hacia adelante',
    Math.abs(new Date(r.actualizaciones[0].tokenVerificaExpira).getTime() - (AHORA + HORAS_VIGENCIA_TOKEN * 3600 * 1000)) < 1000);

  r = await correrWorker([usuario({ emailVerificado: true })]);
  check('a quien ya verificó no le escribe aunque venga en la consulta', r.correos.length === 0);

  r = await correrWorker([usuario({ id: 'u1' }), usuario({ id: 'u2', email: 'otro@ejemplo.test' })]);
  check('atiende a varios en el mismo ciclo', r.correos.length === 2);

  r = await correrWorker([usuario({ id: 'u1' }), usuario({ id: 'u2', email: 'otro@ejemplo.test' })], true);
  check('si Resend falla con uno, el ciclo NO se cae',
    r.resultado.enviados === 0 && r.resultado.revisados === 2,
    'un buzón que rebota no puede dejar sin correo a los demás');

  // ── 5. La consulta ──────────────────────────────────────
  bloque('5. La consulta a la base');

  await correrWorker([usuario()]);
  check('solo pide cuentas sin verificar', db.consulta.emailVerificado === false);
  check(`pide con holgura (${VENTANA_DIAS.hasta + 1} días) para no depender del redondeo`,
    Math.abs(db.consulta.creadoEn.gte.getTime() - (AHORA - (VENTANA_DIAS.hasta + 1) * DIA_MS)) < 1000);

  // ── 6. El correo ────────────────────────────────────────
  bloque('6. El correo, en los dos idiomas');

  const fuente = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'utils', 'emails.js'), 'utf8');
  check('la plantilla de verificación tiene textos en español y en inglés',
    fuente.includes('asuntoRecordatorio') && fuente.includes("Your Notoria account is still inactive"));
  check('el recordatorio elige idioma con usuario.idioma',
    fuente.includes('VERIFICACION[usuario.idioma]'),
    'sin esto sale siempre en español, el mismo fallo que ya pasó con las alertas');
  check('el asunto del recordatorio NO es el mismo que el del registro',
    fuente.includes("asunto: 'Confirma tu email — Notoria'") && fuente.includes("asuntoRecordatorio: 'Tu cuenta de Notoria sigue sin activar'"),
    'repetir el asunto del registro 7 días después parece un correo duplicado y se ignora');

  // ── Resumen ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
