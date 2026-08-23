// brand-shield/scripts/prueba-culqi-webhook.js
// Pruebas de `POST /api/pagos/culqi/webhook` con Prisma SIMULADO: no toca la
// base ni llama a Culqi.
//
//   node scripts/prueba-culqi-webhook.js
//
// Por qué existe: este endpoint estuvo roto desde que se escribió y respondía
// 200 igual, así que nada lo delataba. Esperaba tipos de evento al estilo
// Stripe (`charge.refunded`) que en Culqi no existen, y leía `data` como objeto
// cuando Culqi lo manda como cadena JSON. Efecto real: un cliente pedía el
// reembolso, Culqi le devolvía el dinero y **conservaba el plan**.
//
// Las formas de payload de aquí están copiadas de los plugins oficiales de
// Culqi (culqi-woocommerce, culqi-prestashop), que son la única fuente concreta
// del sobre `{ object, type, data }` — la documentación pública no lo detalla.

process.env.CULQI_WEBHOOK_SECRET = 'secreto-de-prueba';

const Module = require('module');
const path = require('path');

let estado;

const prismaFalso = {
  pago: {
    findUnique: async ({ where }) => (
      where.culqiCargoId === estado.cargoEnLaBase ? { id: 'p1', usuarioId: 'u1' } : null
    ),
    update: async ({ data }) => { estado.pagoActualizado = data; return data; },
  },
  usuario: {
    update: async ({ data }) => { estado.usuarioActualizado = data; return data; },
  },
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma')) return prismaFalso;
  if (id.endsWith('lib/culqi')) return { configurado: () => true };
  if (id.endsWith('lib/tributario')) return { requiereIdentificacion: () => false };
  if (id.endsWith('services/comprobante.service')) {
    return { emitirComprobante: async () => null, pdfDeComprobante: async () => null };
  }
  if (id.endsWith('middlewares/auth.middleware')) {
    // ⚠️ El doble tiene que devolver `permitir` Y poner `req.cuenta`, no solo
    // `autenticar`. Sin `permitir`, `pago.routes.js` revienta al CARGARSE con
    // «permitir is not a function» —el `router.use(permitir('facturacion'))` se
    // evalúa al importar el módulo—, así que la prueba entera moría antes de
    // ejecutar un solo caso. Estuvo así hasta el 2026-08-23, y por eso el aviso
    // está escrito en CLAUDE.md §11: cualquier prueba que simule este middleware
    // necesita las dos cosas.
    return {
      autenticar: (req, _res, next) => { req.usuario = { id: 'u1' }; req.cuenta = { id: 'u1' }; next(); },
      permitir: () => (_req, _res, next) => next(),
    };
  }
  return requireOriginal.apply(this, arguments);
};

const router = require(path.join(__dirname, '..', 'src', 'api', 'routes', 'pago.routes.js'));
Module.prototype.require = requireOriginal;

const capa = router.stack.find(c => c.route?.path === '/culqi/webhook' && c.route.methods.post);
if (!capa) {
  console.error('✗ No se encontró la ruta POST /culqi/webhook — ¿cambió pago.routes.js?');
  process.exit(1);
}
const handler = capa.route.stack[capa.route.stack.length - 1].handle;

const ejecutar = async ({ body, query = {}, headers = {} }) => {
  const resultado = {};
  const res = {
    status(c) { resultado.status = c; return this; },
    json(d) { resultado.body = d; return this; },
  };
  await handler({ body, query, headers }, res, () => {});
  return resultado;
};

// Sobre real de Culqi: `data` es una CADENA JSON, no un objeto.
const evento = (type, data) => ({ object: 'event', type, data: JSON.stringify(data) });

let fallos = 0;
const ok = (...a) => console.log('✓', ...a);
const mal = (...a) => { console.error('✗', ...a); fallos++; };

const casos = [
  {
    nombre: 'Reembolso de un cargo conocido → marca REEMBOLSADO y desactiva la suscripción',
    estado: { cargoEnLaBase: 'chr_live_abc123' },
    peticion: {
      body: evento('refund.creation.succeeded', { chargeId: 'chr_live_abc123', amount: 5900 }),
      query: { secret: 'secreto-de-prueba' },
    },
    comprobar: (r, e) => {
      if (e.pagoActualizado?.estado !== 'REEMBOLSADO') return mal('no marcó el pago como REEMBOLSADO:', JSON.stringify(e.pagoActualizado));
      if (e.usuarioActualizado?.suscripcionActiva !== false) return mal('no desactivó la suscripción: el cliente recupera el dinero y conserva el plan');
      if (r.body?.recibido !== true) return mal('no respondió 2xx — Culqi reintentaría');
      ok('reembolso aplicado al cargo correcto');
    },
  },
  {
    nombre: 'El nombre viejo (charge.refunded) NO debe hacer nada: en Culqi no existe',
    estado: { cargoEnLaBase: 'chr_live_abc123' },
    peticion: {
      body: evento('charge.refunded', { chargeId: 'chr_live_abc123' }),
      query: { secret: 'secreto-de-prueba' },
    },
    comprobar: (r, e) => {
      if (e.pagoActualizado) return mal('actuó sobre un tipo de evento inexistente');
      ok('ignora el tipo inventado y responde 200');
    },
  },
  {
    nombre: 'Autenticación básica (interruptor del panel) en vez de ?secret=',
    estado: { cargoEnLaBase: 'chr_live_xyz' },
    peticion: {
      body: evento('refund.creation.succeeded', { chargeId: 'chr_live_xyz' }),
      headers: { authorization: 'Basic ' + Buffer.from('culqi:secreto-de-prueba').toString('base64') },
    },
    comprobar: (r, e) => {
      if (r.status === 401) return mal('rechazó una autenticación básica válida');
      if (e.pagoActualizado?.estado !== 'REEMBOLSADO') return mal('no procesó el reembolso');
      ok('acepta el secreto por cabecera, sin exponerlo en la URL');
    },
  },
  {
    nombre: 'Sin secreto → 401 y no toca nada',
    estado: { cargoEnLaBase: 'chr_live_abc123' },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_live_abc123' }) },
    comprobar: (r, e) => {
      if (r.status !== 401) return mal(`status ${r.status}, esperado 401`);
      if (e.pagoActualizado) return mal('procesó el evento pese a no estar autorizado');
      ok('rechaza a quien no trae el secreto');
    },
  },
  {
    nombre: 'Secreto equivocado → 401',
    estado: { cargoEnLaBase: 'chr_live_abc123' },
    peticion: {
      body: evento('refund.creation.succeeded', { chargeId: 'chr_live_abc123' }),
      query: { secret: 'otro' },
    },
    comprobar: (r) => {
      if (r.status !== 401) return mal(`status ${r.status}, esperado 401`);
      ok('un secreto que no coincide no pasa');
    },
  },
  {
    nombre: 'Reembolso de un cargo que no está en la base → no revienta',
    estado: { cargoEnLaBase: 'otro_cargo' },
    peticion: {
      body: evento('refund.creation.succeeded', { chargeId: 'chr_live_desconocido' }),
      query: { secret: 'secreto-de-prueba' },
    },
    comprobar: (r, e) => {
      if (e.pagoActualizado) return mal('actualizó un pago que no correspondía');
      if (r.body?.recibido !== true) return mal('debería responder 200 igual: reintentar no lo arreglaría');
      ok('lo registra y responde 200 sin tocar nada');
    },
  },
  {
    nombre: 'data como OBJETO (por si Culqi cambia el sobre) también funciona',
    estado: { cargoEnLaBase: 'chr_live_obj' },
    peticion: {
      body: { object: 'event', type: 'refund.creation.succeeded', data: { chargeId: 'chr_live_obj' } },
      query: { secret: 'secreto-de-prueba' },
    },
    comprobar: (r, e) => {
      if (e.pagoActualizado?.estado !== 'REEMBOLSADO') return mal('no soportó `data` como objeto');
      ok('tolera las dos formas de `data`');
    },
  },
  {
    nombre: 'data con JSON malformado → no lanza excepción',
    estado: { cargoEnLaBase: 'chr_live_abc123' },
    peticion: {
      body: { object: 'event', type: 'refund.creation.succeeded', data: '{roto' },
      query: { secret: 'secreto-de-prueba' },
    },
    comprobar: (r, e) => {
      if (e.pagoActualizado) return mal('actualizó algo con un payload ilegible');
      if (r.body?.recibido !== true) return mal('debería responder 200');
      ok('un cuerpo ilegible no tumba el endpoint');
    },
  },
];

(async () => {
  for (const caso of casos) {
    estado = { ...caso.estado };
    console.log(`\n— ${caso.nombre}`);
    const r = await ejecutar(caso.peticion);
    caso.comprobar(r, estado);
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : `\nTodo OK — ${casos.length} casos`);
  process.exit(fallos ? 1 : 0);
})();
