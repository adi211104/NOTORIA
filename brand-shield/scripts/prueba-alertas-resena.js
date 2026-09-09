// brand-shield/scripts/prueba-alertas-resena.js
// Pruebas del aviso por reseña negativa nueva, con Prisma y el notificador
// SIMULADOS: no toca la base, no manda correos y no necesita servidor.
//
//   node scripts/prueba-alertas-resena.js
//
// POR QUÉ EXISTE ESTE ARCHIVO. Esta función se escribió para tapar un agujero
// que estuvo abierto meses sin dar un solo error: en producción había 1783
// escaneos, 12 reseñas de ≤2★ guardadas y CERO alertas creadas. El panel decía
// "Todo tranquilo por ahora" mientras había reseñas de 1★ en la ficha.
//
// Lo que se vigila acá no es que la función "funcione" —eso se ve— sino sus
// CONDICIONES DE SILENCIO, que es donde un fallo vuelve a ser invisible:
//
//   · si se rompe el corte por rating, se alerta de reseñas de 5★
//   · si se rompe el del primer barrido, un cliente recién registrado recibe
//     tres correos de reseñas de hace años en su primer minuto
//   · si se rompe el de antigüedad, se avisa de algo de hace medio año como si
//     acabara de pasar, y eso desacredita todas las demás alertas
//   · si `notificar` deja de llamarse, la alerta aparece en el panel y el correo
//     no sale nunca: el fallo más difícil de ver de todos
//
// ⚠️ Si alguna de estas se pone en rojo, lo que se rompió es el producto
// entero, no un detalle: avisar es la única razón por la que alguien paga.

const Module = require('module');

// ── Dobles ────────────────────────────────────────────────
let db;

const nuevoEstado = () => ({
  alertasCreadas: [],
  actualizaciones: [],
  notificaciones: [],
  ordenDeLlamadas: [],
});

const prismaFalso = {
  alerta: {
    create: async ({ data }) => {
      const fila = { id: `alerta-${db.alertasCreadas.length + 1}`, ...data };
      db.alertasCreadas.push(fila);
      db.ordenDeLlamadas.push('crear');
      return fila;
    },
    update: async ({ where, data }) => {
      db.actualizaciones.push({ id: where.id, ...data });
      db.ordenDeLlamadas.push('marcar-notificada');
      return { id: where.id, ...data };
    },
  },
};

const notificadorFalso = {
  // ⚠️ Devuelve `true` porque el `notificar()` de verdad devuelve **si salió un
  // correo**, y el worker usa eso para decidir si marca la alerta como notificada
  // (ver alerts/notificador.js: el plan gratuito agrupa las reseñas de a cinco y
  // el contador son justo las alertas sin notificar). Un doble que devolviera
  // `undefined` haría que el worker no marcara nunca — y esta suite se quedaría
  // probando un comportamiento que producción no tiene.
  notificar: async ({ usuario, negocio, alerta }) => {
    db.notificaciones.push({ email: usuario?.email, negocio: negocio?.nombre, alerta });
    db.ordenDeLlamadas.push('notificar');
    return notificadorFalso.respuesta;
  },
  // La usan los casos que comprueban qué pasa cuando NO sale correo.
  respuesta: true,
  enviarAlertaEmail: async () => true,
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id.endsWith('/prisma')) return prismaFalso;
  if (id.endsWith('alerts/notificador')) return notificadorFalso;
  return requireOriginal.apply(this, arguments);
};

const worker = require('../src/workers/monitoreo.worker');
const { alertarResenaNegativa, UMBRAL_RESENA_NEGATIVA, DIAS_RESENA_RECIENTE } = worker;

Module.prototype.require = requireOriginal;

// ── Mini runner ───────────────────────────────────────────
let pasadas = 0, fallidas = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const bloque = (t) => console.log(`\n${t}`);

// ── Datos de ejemplo ──────────────────────────────────────
const NEGOCIO = {
  id: 'neg-1',
  nombre: 'Cevichería El Muelle',
  usuario: { id: 'usr-1', email: 'dueno@ejemplo.test', nombre: 'Marta', idioma: 'es', plan: 'NEGOCIO' },
};

const haceDias = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

const resena = (extra = {}) => ({
  id: 'res-1',
  plataforma: 'GOOGLE',
  rating: 1,
  texto: 'Pésima atención, esperé una hora y llegó frío.',
  autorNombre: 'Jayro H.',
  fechaResena: haceDias(1),
  motivoSospecha: null,
  ...extra,
});

// Ejecuta la función con estado limpio y devuelve lo que pasó.
const correrCaso = async (r, esPrimerBarrido = false) => {
  db = nuevoEstado();
  await alertarResenaNegativa(NEGOCIO, r, esPrimerBarrido);
  return db;
};

const correr = async () => {
  // ── 1. Lo que SÍ debe avisar ────────────────────────────
  bloque('1. Reseñas que deben disparar el aviso');

  let r = await correrCaso(resena());
  check('una reseña de 1★ reciente crea alerta', r.alertasCreadas.length === 1);
  check('  …y la manda a notificar', r.notificaciones.length === 1);
  check('  …del tipo RESENA_MUY_NEGATIVA', r.alertasCreadas[0]?.tipo === 'RESENA_MUY_NEGATIVA');
  check('  …conservando la plataforma de origen', r.alertasCreadas[0]?.plataforma === 'GOOGLE');
  check('  …y atada al negocio correcto', r.alertasCreadas[0]?.negocioId === 'neg-1');

  r = await correrCaso(resena({ rating: 2 }));
  check('una reseña de 2★ también avisa (es el umbral)', r.alertasCreadas.length === 1);

  // ── 2. Lo que NO debe avisar ────────────────────────────
  bloque('2. Condiciones de silencio (acá es donde un fallo se vuelve invisible)');

  r = await correrCaso(resena({ rating: 3 }));
  check('3★ NO avisa: marcar una reseña tibia sería ruido', r.alertasCreadas.length === 0);

  r = await correrCaso(resena({ rating: 5 }));
  check('5★ NO avisa', r.alertasCreadas.length === 0);

  r = await correrCaso(resena(), true);
  check('en el PRIMER barrido no avisa, aunque sea 1★ de ayer', r.alertasCreadas.length === 0,
    'un cliente recién registrado recibiría correos de reseñas de hace años');

  r = await correrCaso(resena({ fechaResena: haceDias(DIAS_RESENA_RECIENTE + 1) }));
  check(`una reseña de hace más de ${DIAS_RESENA_RECIENTE} días NO avisa`, r.alertasCreadas.length === 0);

  r = await correrCaso(resena({ fechaResena: haceDias(DIAS_RESENA_RECIENTE - 1) }));
  check(`  …pero justo dentro de la ventana sí`, r.alertasCreadas.length === 1);

  r = await correrCaso(resena({ fechaResena: 'no es una fecha' }));
  check('una fecha ilegible NO avisa (falla cerrado, no manda basura)', r.alertasCreadas.length === 0);

  // ── 3. El contenido del aviso ───────────────────────────
  bloque('3. Qué lleva la alerta');

  r = await correrCaso(resena());
  let a = r.alertasCreadas[0];
  check('la descripción nombra el rating y al autor',
    a.descripcion.includes('1★') && a.descripcion.includes('Jayro H.'), a.descripcion);
  check('el detalle lleva el rating como número', a.detalle.rating === 1);
  check('el detalle lleva el id de la reseña, para poder abrirla', a.detalle.resenaId === 'res-1');
  check('el detalle lleva autor y texto para que el panel traduzca la frase',
    a.detalle.autor === 'Jayro H.' && typeof a.detalle.texto === 'string');

  r = await correrCaso(resena({ texto: null, autorNombre: null }));
  a = r.alertasCreadas[0];
  check('una 1★ SIN TEXTO igual avisa (es un patrón de ataque, no un vacío)', !!a);
  check('  …y lo dice sin inventar un comentario', a.descripcion.includes('sin comentario'), a.descripcion);
  check('  …con texto nulo en el detalle, no cadena vacía', a.detalle.texto === null);
  check('  …y sin autor se dice "un cliente"', a.descripcion.includes('un cliente'), a.descripcion);

  const largo = 'a'.repeat(400);
  r = await correrCaso(resena({ texto: largo }));
  check('un texto larguísimo se recorta a 120 caracteres',
    r.alertasCreadas[0].detalle.texto.length === 120);

  r = await correrCaso(resena({ motivoSospecha: 'texto_duplicado' }));
  check('si el detector la marcó, el motivo viaja en el detalle',
    r.alertasCreadas[0].detalle.motivoSospecha === 'texto_duplicado');

  // ── 4. El orden, que es lo que hace que el correo salga ─
  bloque('4. Orden de las operaciones');

  r = await correrCaso(resena());
  check('la alerta se crea ANTES de notificar (si el correo falla, queda en el panel)',
    r.ordenDeLlamadas.indexOf('crear') < r.ordenDeLlamadas.indexOf('notificar'));
  check('se marca notificada DESPUÉS de notificar, nunca antes',
    r.ordenDeLlamadas.indexOf('notificar') < r.ordenDeLlamadas.indexOf('marcar-notificada'));
  check('  …y se marca sobre la alerta que se acaba de crear',
    r.actualizaciones[0]?.id === r.alertasCreadas[0]?.id && r.actualizaciones[0]?.notificada === true);

  // 🔴 Y lo simétrico, que es lo que sostiene el agrupado del plan gratuito: si
  // NO salió correo, la alerta NO se marca. Marcarla dejaría el contador del lote
  // en cero en cada reseña, así que las cinco no se juntarían nunca y GRATIS
  // volvería a recibir un correo por reseña — sin que nada fallara.
  notificadorFalso.respuesta = false;
  const sinCorreo = await correrCaso(resena());
  notificadorFalso.respuesta = true;
  check('si notificar() no mandó correo, la alerta NO se marca notificada',
    sinCorreo.alertasCreadas.length === 1 && sinCorreo.actualizaciones.length === 0,
    `${sinCorreo.actualizaciones.length} actualizaciones`);
  check('el aviso pasa por notificar() y no por el correo directo',
    r.notificaciones[0]?.email === 'dueno@ejemplo.test',
    'ir por enviarAlertaEmail se saltaría el umbral que el cliente eligió en Alertas');

  // ── 5. Coherencia con el resto del producto ─────────────
  bloque('5. Coherencia con lo que promete la interfaz');
  check('el umbral es 2★, el mismo que usa la escalación de 24h y el Espejo',
    UMBRAL_RESENA_NEGATIVA === 2);
  check('la pantalla de Alertas ofrece "Cada reseña negativa": esto es lo que la cumple',
    typeof alertarResenaNegativa === 'function');

  // ── 6. El correo sale en el idioma del usuario ──────────
  //
  // 🔴 Esta sección nace de un fallo REAL encontrado el 2026-08-23: el worker
  // cargaba el negocio con `usuario: { select: { id, email, nombre,
  // prefsAlertas, plan } }` — sin `idioma`. `enviarAlertaCritica` compone el
  // correo con `ALERTA[usuario.idioma] || ALERTA.es`, así que llegaba
  // `undefined` y TODA alerta salía en español, incluidas las de quien tiene el
  // panel en inglés. No fallaba nada: salía en el idioma que no era.
  //
  // Se comprueba leyendo el FUENTE porque el fallo no está en la lógica de
  // `alertarResenaNegativa` —que recibe el usuario ya cargado— sino en la
  // consulta que lo alimenta. Un doble de Prisma nunca lo habría visto: el mock
  // devuelve el objeto entero, con `idioma` y todo.
  bloque('6. El correo sale en el idioma del usuario, no siempre en español');

  const fs = require('fs');
  const path = require('path');
  const fuenteWorker = fs.readFileSync(path.join(__dirname, '..', 'src', 'workers', 'monitoreo.worker.js'), 'utf8');
  const fuenteEmails = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'emails.js'), 'utf8');

  // Los `select` de usuario que alimentan el camino de alertas son los que
  // llevan `prefsAlertas` (el resumen mensual y la escalación usan los suyos y
  // ya traían idioma). Todos tienen que pedir el idioma.
  // Se recorta una ventana alrededor de cada `prefsAlertas: true` en vez de
  // partir el archivo con una expresión regular: el select está escrito de dos
  // formas distintas (una en varias líneas, otra en una sola) y una ventana de
  // caracteres cubre las dos sin depender del formato.
  //
  // ⚠️ Aplica a los TRES selects con `prefsAlertas`, incluido el de
  // `enviarResumenAlertas`. Al principio ese quedó excluido porque su correo era
  // solo español; se tradujo el mismo día, así que la excepción murió.
  // `scripts/prueba-correos-idioma.js` cubre el inventario completo.
  const VENTANA = 1500; // holgada: uno de los selects lleva un comentario largo entre `prefsAlertas` e `idioma`
  const selectsDeAlertas = [];
  for (let i = fuenteWorker.indexOf('prefsAlertas: true'); i !== -1; i = fuenteWorker.indexOf('prefsAlertas: true', i + 1)) {
    selectsDeAlertas.push(fuenteWorker.slice(Math.max(0, i - VENTANA), i + VENTANA));
  }

  check('hay al menos un select de usuario en el camino de alertas',
    selectsDeAlertas.length > 0,
    'si esto falla, cambió la forma de cargar el negocio y hay que revisar esta prueba entera');

  check('TODO select que pide prefsAlertas pide también idioma',
    selectsDeAlertas.every((bloqueTexto) => bloqueTexto.includes('idioma: true')),
    'sin idioma el correo de alerta sale siempre en español');

  check('enviarAlertaCritica sigue eligiendo el idioma con usuario.idioma',
    fuenteEmails.includes('ALERTA[usuario.idioma]'),
    'si esto cambia, la comprobación de arriba deja de significar algo');

  // ── 7. El idioma en el PANEL, que es la otra mitad ──────
  //
  // 🔴 El bloque 6 vigila que el CORREO salga en el idioma del usuario. Esta es
  // la otra punta y se le escapó durante meses: `Alerta.descripcion` la guarda
  // el worker redactada y **siempre en español** —es un respaldo, no el texto de
  // la interfaz— y las piezas van en `detalle` justo para que el panel arme la
  // frase con `textoAlerta()` (web/src/lib/alertas.js). La pantalla de INICIO la
  // pintaba en crudo, así que un panel en inglés abría con «Nueva reseña de 1★
  // de…» en la primera tarjeta que se ve.
  //
  // ⚠️ Va como BARRIDO sobre todo el panel y no como comprobación de ese
  // archivo, que es la lección que dejó el mismo día el barrido de Google
  // Business: una prueba que mira los archivos que uno recuerda no es un
  // barrido, y pasa en verde mientras la función sigue a la vista en otro sitio.
  bloque('7. El texto de la alerta en el panel');

  const PANEL = path.join(__dirname, '..', '..', 'brand-shield-web', 'src', 'app', 'dashboard');
  const archivosPanel = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith('.js')) archivosPanel.push(p);
    }
  })(PANEL);

  // `{a.descripcion}` y sus variantes: la columna de respaldo pintada tal cual.
  // No casa con `{plan.descripcion}` ni con `descripcion={...}`, que son otra
  // cosa y son correctos.
  const EN_CRUDO = /\{\s*(?:a|al|alerta)\.descripcion\s*\}/;
  const culpables = archivosPanel.filter((p) => EN_CRUDO.test(fs.readFileSync(p, 'utf8')));

  check(`ningún archivo del panel pinta la descripción en crudo (${archivosPanel.length} revisados)`,
    culpables.length === 0,
    culpables.map((p) => path.relative(PANEL, p)).join(', '));

  const conAlertas = archivosPanel.filter((p) => /ICONO_ALERTA/.test(fs.readFileSync(p, 'utf8')));
  check(`los ${conAlertas.length} archivos que pintan alertas usan textoAlerta()`,
    conAlertas.length > 0 && conAlertas.every((p) => /textoAlerta\(/.test(fs.readFileSync(p, 'utf8'))),
    conAlertas.filter((p) => !/textoAlerta\(/.test(fs.readFileSync(p, 'utf8')))
      .map((p) => path.relative(PANEL, p)).join(', '));

  // Control: sin esto solo se sabría que las dos sondas no dan error, no que
  // midan algo. Es lo que le faltó a prueba-gbp-visible.js durante un día.
  check('   …y las dos sondas detectarían una recaída (control)',
    EN_CRUDO.test('<p>{a.descripcion}</p>') && !EN_CRUDO.test('<p>{plan.descripcion}</p>'));

  // ── Resumen ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`${pasadas} pasadas · ${fallidas} fallidas`);
  if (fallidas) process.exit(1);
};

correr().catch((e) => { console.error(e); process.exit(1); });
