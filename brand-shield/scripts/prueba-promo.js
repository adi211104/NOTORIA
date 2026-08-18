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
const prismaFalso = {
  usuario: {
    findUnique: async () => ({
      id: 'u1', email: 'cliente@notoria.test', nombre: 'Cliente Prueba',
      direccionFiscal: null, promoBienvenidaUsada: estado.cuentaYaUso,
    }),
    update: async ({ data }) => { estado.usuarioActualizado = data; return data; },
  },
  promoTarjeta: {
    findUnique: async () => (estado.tarjetaYaUso ? { id: 'pt1' } : null),
    create: async ({ data }) => { estado.tarjetaRegistrada = data; return data; },
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
  crearCargo: async ({ monto }) => { estado.montoCobrado = monto; return { id: 'chr_test_1', source: {} }; },
  // Las dos de verdad: son la lógica que se está probando
  datosTarjeta: require('../src/lib/culqi').datosTarjeta,
  huellaTarjeta: require('../src/lib/culqi').huellaTarjeta,
};

// Intercepta los require del módulo de rutas para inyectar los dobles
const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma')) return prismaFalso;
  if (id.endsWith('lib/culqi')) return culqiFalso;
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
];

(async () => {
  console.log('Promo de bienvenida — Culqi y base simulados, no se cobra ni se guarda nada\n');
  for (const caso of casos) {
    estado = { ...caso.estado };
    const r = await ejecutar(caso.body);
    if (r.error) { mal(caso.nombre, '— lanzó:', r.error.message); continue; }
    caso.comprobar(r, estado);
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK — la promo no se puede repetir ni por cuenta ni por tarjeta');
  process.exit(fallos ? 1 : 0);
})();
