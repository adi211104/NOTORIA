// brand-shield/scripts/prueba-promo.js
// Pruebas de la promo de bienvenida (50% los 2 primeros meses) con Prisma,
// Culqi y los comprobantes SIMULADOS: no llama a Culqi, no toca la base y no
// consume numeración de comprobantes (la serie es correlativa y no admite
// huecos, por eso esto no se prueba cobrando de verdad en producción).
//
// Lo que se verifica es la tabla de decisión de `POST /api/pagos/culqi`:
// cuándo se aplica el descuento, cuándo se cobra precio de lista y cuándo se
// responde 409 sin cobrar nada.
//
//   node scripts/prueba-promo.js

process.env.PROMO_HASH_SECRET = 'secreto-de-prueba';
process.env.CULQI_SECRET_KEY = 'sk_test_simulado';

const Module = require('module');
const path = require('path');

const PRECIO_MENSUAL = 5900;   // NEGOCIO mensual, en céntimos (lib/precios.js)
const PRECIO_ANUAL = 56400;

// Estado que cada caso configura antes de ejecutar la ruta
let estado;

// ── Dobles de prueba ──────────────────────────────────────
// Desde la auditoría del 2026-10-02 la promo se RESERVA antes de cobrar
// (crear la fila de la tarjeta + UPDATE condicional de la cuenta) y el cobro
// pasa por lib/cobros.js (intento de cobro + transacción). El doble modela las
// dos cosas, incluido el @unique de la tarjeta, que es lo que decide la carrera.
// La transacción se serializa (una a la vez), como el candado de la cuenta
// (`pg_advisory_xact_lock` en lib/cobros.js): es lo que decide las carreras.
let colaTx = Promise.resolve();
const enVuelo = (i) => i.estado === 'PROCESANDO' || i.estado === 'DESCONOCIDO' || (i.estado === 'EXITOSO' && !i.pagoId);
const prismaFalso = {
  $transaction: (fn) => { const r = colaTx.then(() => fn(prismaFalso)); colaTx = r.catch(() => {}); return r; },
  $executeRaw: async () => 0,
  usuario: {
    findUnique: async () => ({
      id: 'u1', email: 'cliente@notoria.test', nombre: 'Cliente Prueba',
      direccionFiscal: null, promoBienvenidaUsada: estado.cuentaYaUso, plan: 'GRATIS',
    }),
    update: async ({ data }) => { estado.usuarioActualizado = { ...(estado.usuarioActualizado || {}), ...data }; return data; },
    updateMany: async ({ where }) => {
      if (where.promoBienvenidaUsada === false) {
        if (estado.cuentaYaUso || estado.cuentaReservada) return { count: 0 };
        estado.cuentaReservada = true;
      }
      return { count: 1 };
    },
  },
  promoTarjeta: {
    create: async ({ data }) => {
      if (estado.tarjetaYaUso || estado.tarjetaTomada) { const e = new Error('dup'); e.code = 'P2002'; throw e; }
      estado.tarjetaTomada = true;
      estado.tarjetaRegistrada = data; return data;
    },
    deleteMany: async ({ where }) => { estado.tarjetaLiberada = where; return { count: 1 }; },
    count: async () => 0,
  },
  eventoSuscripcion: { create: async ({ data }) => { (globalThis.eventosSuscripcion ||= []).push(data); return data; } }, // lib/bitacora.js
  intentoCobro: {
    create: async ({ data }) => {
      estado.intentos = estado.intentos || [];
      if (estado.intentos.some((i) => i.clave === data.clave)) { const e = new Error('dup'); e.code = 'P2002'; throw e; }
      const i = { id: `ic${estado.intentos.length + 1}`, pagoId: null, ...data };
      estado.intentos.push(i); return i;
    },
    update: async ({ where, data }) => Object.assign(estado.intentos.find((i) => i.id === where.id), data),
    updateMany: async ({ where }) => ({ count: estado.intentos.some((i) => i.id === where.id && !i.pagoId) ? 1 : 0 }),
    findUnique: async ({ where }) => (estado.intentos || []).find((i) => i.clave === where.clave || i.id === where.id) || null,
    findFirst: async ({ where }) => (estado.intentos || []).find((i) => i.usuarioId === where.usuarioId && i.clave !== where.clave?.not && enVuelo(i)) || null,
  },
  pago: { create: async (args) => ({ id: 'p1', ...args.data }) },
};

const culqiFalso = {
  configurado: () => true,
  crearCliente: async () => ({ id: 'cus_test_1' }),
  // Lo que usa la ruta: reutiliza el customer si Culqi ya lo tiene
  obtenerOCrearCliente: async () => ({ id: 'cus_test_1' }),
  // Devuelve la forma real de una tarjeta guardada de Culqi
  crearTarjeta: async () => ({
    id: 'crd_test_1',
    source: { card_number: '411111******1111', last_four: '1111', iin: { bin: '411111', card_brand: 'Visa' } },
  }),
  crearCargo: async ({ monto }) => {
    if (estado.cargoRechazado) { const e = new Error('rechazada'); e.response = { status: 402, data: { user_message: 'Tarjeta rechazada' } }; throw e; }
    estado.cobros = (estado.cobros || 0) + 1;
    estado.montoCobrado = monto; return { id: `chr_test_${estado.cobros}`, source: {} };
  },
  // Las dos de verdad: son la lógica que se está probando
  datosTarjeta: require('../src/lib/culqi').datosTarjeta,
  huellaTarjeta: require('../src/lib/culqi').huellaTarjeta,
};

// Intercepta los require del módulo de rutas para inyectar los dobles
const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id === './prisma') return prismaFalso;
  if (id.endsWith('lib/culqi') || id === './culqi') return culqiFalso;
  if (id.endsWith('services/comprobante.service')) {
    return { emitirComprobante: async () => null, pdfDeComprobante: async () => null };
  }
  if (id.endsWith('middlewares/auth.middleware')) {
    return {
      // `req.cuenta` lo pone `autenticar` de verdad (ver lib/equipo.js): es la
      // empresa en la que se está trabajando. En el pago siempre coincide con la
      // persona, porque la ruta entera exige el permiso de facturación.
      autenticar: (req, _res, next) => {
        req.usuario = { id: 'u1' };
        req.cuenta = { id: 'u1', plan: 'GRATIS', propia: true };
        req.rol = 'PROPIETARIO';
        req.alcance = null;
        next();
      },
      permitir: () => (_req, _res, next) => next(),
    };
  }
  return requireOriginal.apply(this, arguments);
};

const router = require(path.join(__dirname, '..', 'src', 'api', 'routes', 'pago.routes.js'));
Module.prototype.require = requireOriginal;

// Saca el handler de POST /culqi de la pila del router
const capa = router.stack.find(c => c.route?.path === '/culqi' && c.route.methods.post);
if (!capa) {
  console.error('✗ No se encontró la ruta POST /culqi — ¿cambió pago.routes.js?');
  process.exit(1);
}
const handler = capa.route.stack[capa.route.stack.length - 1].handle;
// Cargado junto con la ruta: usa el mismo prisma falso.
const promo = require(path.join(__dirname, '..', 'src', 'lib', 'promo.js'));

const ejecutar = async (body) => {
  let resultado = {};
  const res = {
    status(c) { resultado.status = c; return this; },
    json(d) { resultado.body = d; return this; },
  };
  await handler({ body, usuario: { id: 'u1' } }, res, (e) => { resultado.error = e; });
  return resultado;
};

// ── Casos ─────────────────────────────────────────────────
let fallos = 0;
const ok = (...a) => console.log('✓', ...a);
const mal = (...a) => { console.error('✗', ...a); fallos++; };

const casos = [
  {
    nombre: 'Cuenta nueva + tarjeta nueva → cobra la mitad y quema la tarjeta',
    estado: { cuentaYaUso: false, tarjetaYaUso: false },
    body: { token: 'tkn', plan: 'NEGOCIO', anual: false },
    comprobar: (r, e) => {
      if (e.montoCobrado !== PRECIO_MENSUAL / 2) return mal(`cobró ${e.montoCobrado}, esperado ${PRECIO_MENSUAL / 2}`);
      if (!e.tarjetaRegistrada) return mal('no registró la tarjeta: la promo se podría repetir con ella');
      if (e.tarjetaRegistrada.intentoClave !== 'alta:u1:tkn') return mal(`la reserva no está atada al intento (intentoClave=${e.tarjetaRegistrada.intentoClave})`);
      if (!e.usuarioActualizado.promoBienvenidaUsada) return mal('no marcó promoBienvenidaUsada en la cuenta');
      ok('cobra S/29.50, marca la cuenta y registra la tarjeta');
    },
  },
  {
    nombre: 'Cuenta que ya usó la promo → cobra precio de lista, sin 409',
    estado: { cuentaYaUso: true, tarjetaYaUso: false },
    body: { token: 'tkn', plan: 'NEGOCIO', anual: false },
    comprobar: (r, e) => {
      if (r.status === 409) return mal('devolvió 409: la cuenta ya la usó, debe cobrar normal');
      if (e.montoCobrado !== PRECIO_MENSUAL) return mal(`cobró ${e.montoCobrado}, esperado ${PRECIO_MENSUAL}`);
      if (e.tarjetaRegistrada) return mal('registró la tarjeta sin haber aplicado la promo');
      ok('cobra S/59.00 completo');
    },
  },
  {
    nombre: 'ABUSO: cuenta nueva pero tarjeta ya usada → 409 y NO cobra',
    estado: { cuentaYaUso: false, tarjetaYaUso: true },
    body: { token: 'tkn', plan: 'NEGOCIO', anual: false },
    comprobar: (r, e) => {
      if (r.status !== 409) return mal(`status ${r.status}, esperado 409`);
      if (r.body?.codigo !== 'PROMO_NO_APLICA') return mal('falta codigo PROMO_NO_APLICA:', JSON.stringify(r.body));
      if (e.montoCobrado !== undefined) return mal('¡cobró algo! No debe cobrar sin que el usuario confirme el precio');
      ok('bloquea el descuento repetido y no cobra nada');
    },
  },
  {
    nombre: 'Reintento con sinPromo → cobra precio de lista (no se queda en bucle)',
    estado: { cuentaYaUso: false, tarjetaYaUso: true },
    body: { token: 'tkn', plan: 'NEGOCIO', anual: false, sinPromo: true },
    comprobar: (r, e) => {
      if (r.status === 409) return mal('vuelve a devolver 409: esa tarjeta no podría suscribirse nunca');
      if (e.montoCobrado !== PRECIO_MENSUAL) return mal(`cobró ${e.montoCobrado}, esperado ${PRECIO_MENSUAL}`);
      ok('cobra S/59.00 tras la confirmación del usuario');
    },
  },
  {
    nombre: 'Plan anual → sin promo (ya tiene su propio 20%)',
    estado: { cuentaYaUso: false, tarjetaYaUso: false },
    body: { token: 'tkn', plan: 'NEGOCIO', anual: true },
    comprobar: (r, e) => {
      if (e.montoCobrado !== PRECIO_ANUAL) return mal(`cobró ${e.montoCobrado}, esperado ${PRECIO_ANUAL}`);
      if (e.tarjetaRegistrada) return mal('quemó la tarjeta en un plan anual, que no usa la promo');
      ok('cobra el anual completo y no consume la promo');
    },
  },
  // ── Auditoría 2026-10-02 ────────────────────────────────────────────────
  {
    nombre: 'CARRERA: dos pagos SIMULTÁNEOS con la misma tarjeta nueva → la promo se aplica UNA vez',
    estado: { cuentaYaUso: false, tarjetaYaUso: false },
    body: { token: 'tkn-a', plan: 'NEGOCIO', anual: false },
    concurrente: { token: 'tkn-b', plan: 'NEGOCIO', anual: false },
    comprobar: (r, e, r2) => {
      const promos = [r, r2].filter((x) => x.body?.promoAplicada === true).length;
      const rechazos = [r, r2].filter((x) => x.status === 409).length;
      if (promos !== 1 || rechazos !== 1) return mal(`promos=${promos}, 409=${rechazos}: el @unique solo frenaba la fila, no el segundo cobro`);
      if (e.cobros !== 1) return mal(`se cobró ${e.cobros} veces`);
      ok('uno cobra con promo, el otro recibe 409 sin cobrar');
    },
  },
  {
    nombre: 'Cargo RECHAZADO con promo reservada → la promo se libera (no se pierde por un rechazo del banco)',
    estado: { cuentaYaUso: false, tarjetaYaUso: false, cargoRechazado: true },
    body: { token: 'tkn', plan: 'NEGOCIO', anual: false },
    comprobar: (r, e) => {
      if (r.status !== 400) return mal(`status ${r.status}, esperado 400`);
      if (!e.tarjetaLiberada || e.usuarioActualizado?.promoBienvenidaUsada !== false) return mal('la promo quedó gastada por un cargo que no se hizo');
      if (e.tarjetaLiberada.intentoClave !== 'alta:u1:tkn') return mal('liberó filas sin mirar de qué intento eran');
      ok('rechazo del banco: la tarjeta y la cuenta conservan su promo');
    },
  },
  {
    nombre: 'El MISMO token dos veces (doble clic) → un solo cobro',
    estado: { cuentaYaUso: true, tarjetaYaUso: false },
    body: { token: 'tkn-dup', plan: 'NEGOCIO', anual: false },
    concurrente: { token: 'tkn-dup', plan: 'NEGOCIO', anual: false },
    comprobar: (r, e, r2) => {
      if (e.cobros !== 1) return mal(`se cobró ${e.cobros} veces con el mismo token`);
      if (![r, r2].some((x) => x.body?.codigo === 'COBRO_DUPLICADO')) return mal('el segundo no fue frenado por la clave');
      ok('la clave del intento frena el segundo antes de llegar a Culqi');
    },
  },
];

// ── Reservas huérfanas (respuesta del auditor, 2026-10-07) ────────────────
// La reserva se hace antes de abrir el intento de cobro. Si el proceso muere en
// medio, o la liberación falla, la promo quedaba gastada para siempre sin cobro.
// `promo.liberarHuerfanas()` (desde la reconciliación) las devuelve.
const pruebaHuerfanas = async () => {
  const AHORA = Date.parse('2026-10-07T15:00:00Z');
  const vieja = new Date(AHORA - 2 * 3600000);
  const reciente = new Date(AHORA - 5 * 60000);
  let filas; let intentos; let cuentas; let fallarTx;
  const db = {
    $transaction: async (fn) => {
      const copia = { filas: filas.map((f) => ({ ...f })), cuentas: { ...cuentas } };
      try { const r = await fn(db); if (fallarTx) throw new Error('base caída'); return r; } catch (e) { filas = copia.filas; cuentas = copia.cuentas; throw e; }
    },
    promoTarjeta: {
      findMany: async ({ where }) => filas.filter((f) => f.intentoClave !== null && f.usadaEn < where.usadaEn.lt),
      deleteMany: async ({ where }) => { const antes = filas.length; filas = filas.filter((f) => !(f.usuarioId === where.usuarioId && f.intentoClave === where.intentoClave)); return { count: antes - filas.length }; },
      count: async ({ where }) => filas.filter((f) => f.usuarioId === where.usuarioId).length,
    },
    intentoCobro: { findUnique: async ({ where }) => intentos[where.clave] || null },
    usuario: { update: async ({ where, data }) => { cuentas[where.id] = data.promoBienvenidaUsada; } },
  };
  const preparar = () => {
    filas = [
      { huella: 'h1', usuarioId: 'u1', intentoClave: 'alta:u1:sin-intento', usadaEn: vieja },   // murió antes del intento
      { huella: 'h2', usuarioId: 'u2', intentoClave: 'alta:u2:fallido', usadaEn: vieja },       // falló y no se liberó
      { huella: 'h3', usuarioId: 'u3', intentoClave: 'alta:u3:cobrado', usadaEn: vieja },       // cobró: se queda
      { huella: 'h4', usuarioId: 'u4', intentoClave: 'alta:u4:en-duda', usadaEn: vieja },       // DESCONOCIDO: se queda
      { huella: 'h5', usuarioId: 'u5', intentoClave: 'alta:u5:en-curso', usadaEn: reciente },   // aún dentro del margen
      { huella: 'h6', usuarioId: 'u6', intentoClave: null, usadaEn: vieja },                    // fila vieja sin clave
      { huella: 'h7', usuarioId: 'u7', intentoClave: 'alta:u7:fallido', usadaEn: vieja },       // falló, pero la cuenta
      { huella: 'h8', usuarioId: 'u7', intentoClave: 'alta:u7:cobrado', usadaEn: vieja },       // ya gastó la promo con otra tarjeta
    ];
    intentos = {
      'alta:u2:fallido': { estado: 'FALLIDO' }, 'alta:u3:cobrado': { estado: 'EXITOSO' },
      'alta:u4:en-duda': { estado: 'DESCONOCIDO' }, 'alta:u7:fallido': { estado: 'FALLIDO' }, 'alta:u7:cobrado': { estado: 'EXITOSO' },
    };
    cuentas = { u1: true, u2: true, u3: true, u4: true, u5: true, u6: true, u7: true };
    fallarTx = false;
  };
  const tiene = (h) => filas.some((f) => f.huella === h);

  preparar();
  const n = await promo.liberarHuerfanas(AHORA, db);
  if (tiene('h1') || cuentas.u1 !== false) mal('reserva sin intento (proceso muerto) NO se devolvió'); else ok('reserva sin intento detrás → se devuelve a la tarjeta y a la cuenta');
  if (tiene('h2') || cuentas.u2 !== false) mal('reserva de un intento FALLIDO NO se devolvió'); else ok('intento FALLIDO cuya liberación no llegó → se devuelve');
  if (!tiene('h3') || cuentas.u3 !== true) mal('¡devolvió la promo de un alta que SÍ se cobró!'); else ok('CONTROL: intento cobrado → la reserva se queda');
  if (!tiene('h4') || cuentas.u4 !== true) mal('¡devolvió la promo de un cobro en duda!'); else ok('CONTROL: intento DESCONOCIDO → se queda (puede que sí se cobrara al 50%)');
  if (!tiene('h5')) mal('liberó una reserva dentro del margen: su cobro puede estar en marcha'); else ok('CONTROL: reserva reciente → se respeta el margen');
  if (!tiene('h6')) mal('tocó una fila anterior a intentoClave'); else ok('CONTROL: filas sin clave (anteriores al cambio) no se tocan');
  if (tiene('h7') || !tiene('h8') || cuentas.u7 !== true) mal('la cuenta recuperó la promo aunque ya la había usado con otra tarjeta'); else ok('se libera la tarjeta, pero la cuenta que ya cobró con promo sigue marcada');
  if (n !== 3) mal(`liberadas=${n}, esperado 3`);

  // Liberar es todo o nada: si la base cae a mitad, no queda la fila borrada y
  // la cuenta marcada (eso sería una promo perdida que nadie volvería a ver).
  preparar();
  fallarTx = true;
  await promo.liberar({ usuarioId: 'u1', clave: 'alta:u1:sin-intento' }, db).catch(() => {});
  if (!tiene('h1') || cuentas.u1 !== true) mal('liberación a medias: la fila desapareció pero la cuenta sigue marcada'); else ok('liberar es una transacción: si falla, la reserva sigue ahí para el próximo barrido');
  fallarTx = false;
  await promo.liberarHuerfanas(AHORA, db);
  if (tiene('h1') || cuentas.u1 !== false) mal('el barrido siguiente no la recuperó'); else ok('…y el barrido siguiente la devuelve');
};

(async () => {
  console.log('Promo de bienvenida — Culqi y base simulados, no se cobra ni se guarda nada\n');
  for (const caso of casos) {
    estado = { ...caso.estado };
    const [r, r2] = await Promise.all([ejecutar(caso.body), caso.concurrente ? ejecutar(caso.concurrente) : null]);
    if (r.error) { mal(caso.nombre, '— lanzó:', r.error.message); continue; }
    caso.comprobar(r, estado, r2);
  }
  console.log('\nReservas huérfanas (lib/promo.js)');
  await pruebaHuerfanas();
  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — la promo no se puede repetir ni por cuenta ni por tarjeta');
  process.exit(fallos ? 1 : 0);
})();
