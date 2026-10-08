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

// Desde la auditoría del 2026-10-02 el webhook GUARDA el evento antes de
// procesarlo (lib/webhookInbox.js) y el reembolso depende del TIPO de pago, así
// que el doble lleva la bandeja, la transacción y los datos del pago.
// La transacción se SERIALIZA (una a la vez), como lo haría el `SELECT … FOR
// UPDATE` sobre la fila del pago: así la prueba de dos reembolsos simultáneos
// distingue leer el acumulado dentro del candado de leerlo fuera.
let colaTx = Promise.resolve();
const prismaFalso = {
  $transaction: (fn) => {
    const r = colaTx.then(() => fn(prismaFalso));
    colaTx = r.catch(() => {});
    return r;
  },
  $queryRaw: async () => [],
  eventoSuscripcion: { create: async ({ data }) => { (estado.bitacora ||= []).push(data); return data; } }, // lib/bitacora.js
  eventoWebhook: {
    create: async ({ data }) => {
      if (estado.baseCaida) throw new Error('base caída');
      if (estado.eventos.some((e) => e.idExterno === data.idExterno)) { const e = new Error('dup'); e.code = 'P2002'; throw e; }
      const ev = { id: `ev${estado.eventos.length + 1}`, intentos: 0, ...data };
      estado.eventos.push(ev); return ev;
    },
    update: async ({ where, data }) => Object.assign(estado.eventos.find((e) => e.id === where.id), data),
    // El reclamo PENDIENTE → PROCESANDO (lib/webhookInbox.js).
    updateMany: async ({ where, data }) => {
      const ev = estado.eventos.find((e) => e.id === where.id && (e.intentos || 0) === where.intentos && (e.estado || 'PENDIENTE') === 'PENDIENTE');
      if (!ev) return { count: 0 };
      Object.assign(ev, data, { intentos: (ev.intentos || 0) + 1 });
      return { count: 1 };
    },
  },
  pago: {
    findUnique: async ({ where }) => {
      // Relectura dentro de la transacción: el estado VIVO de la fila.
      if (where.id === 'p1') return { estado: estado.estadoPago || 'EXITOSO', montoReembolsado: estado.montoReembolsado || 0 };
      return where.culqiCargoId === estado.cargoEnLaBase
        ? { id: 'p1', usuarioId: 'u1', tipo: estado.tipo || 'INICIAL', monto: 5900, moneda: 'PEN', estado: estado.estadoPago || 'EXITOSO', montoReembolsado: estado.montoReembolsado || 0, comprobante: null, usuario: {} }
        : null;
    },
    // ¿Es la última cuota? Por defecto sí; `estado.hayCuotaPosterior` lo niega.
    findFirst: async () => ({ id: estado.hayCuotaPosterior ? 'p2' : 'p1' }),
    update: async ({ data }) => {
      if (estado.fallaAlProcesar) throw new Error('fallo interno');
      // Un respiro entre leer y escribir: es donde se colaba el otro reembolso.
      await new Promise((r) => setTimeout(r, 5));
      estado.pagoActualizado = data;
      estado.montoReembolsado = data.montoReembolsado;
      estado.estadoPago = data.estado;
      return data;
    },
  },
  usuario: {
    update: async ({ data }) => { estado.usuarioActualizado = data; return data; },
    findUnique: async () => ({ email: 'cli@x.com', localesExtra: 2 }),
  },
};

const requireOriginal = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('lib/prisma') || id === './prisma') return prismaFalso;
  if (id.endsWith('utils/emails')) {
    return {
      enviarCancelacion: async () => {}, enviarReembolso: async () => {}, enviarAvisoAnulacionPendiente: async () => {},
      enviarAvisoInterno: async (a) => { estado.avisos = [...(estado.avisos || []), a]; },
    };
  }
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
  // ── Auditoría 2026-10-02 ────────────────────────────────────────────────
  {
    nombre: 'Reembolso TOTAL de la cuota vigente → la suscripción termina HOY (no al final del periodo)',
    estado: { cargoEnLaBase: 'chr_t1' },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_t1', amount: 5900 }), query: { secret: 'secreto-de-prueba' } },
    comprobar: (r, e) => {
      const u = e.usuarioActualizado;
      if (!u || u.suscripcionActiva !== false || !(u.fechaVencimiento instanceof Date)) return mal('no cortó el periodo:', JSON.stringify(u));
      if (Math.abs(u.fechaVencimiento - Date.now()) > 60000) return mal('el vencimiento no es ahora');
      ok('cuota devuelta entera: plan efectivo GRATIS en el acto');
    },
  },
  {
    nombre: 'Reembolso de un LOCAL ADICIONAL → NO toca la suscripción',
    estado: { cargoEnLaBase: 'chr_l1', tipo: 'LOCAL_ADICIONAL' },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_l1', amount: 5900 }), query: { secret: 'secreto-de-prueba' } },
    comprobar: (r, e) => {
      if (e.usuarioActualizado) return mal('apagó la suscripción por devolver un local:', JSON.stringify(e.usuarioActualizado));
      if (e.pagoActualizado?.estado !== 'REEMBOLSADO') return mal('no marcó el pago del local');
      if (!e.avisos?.some((a) => /local adicional/i.test(a.asunto))) return mal('no avisó a contabilidad para revisar el local');
      ok('el plan sigue; contabilidad decide sobre el local');
    },
  },
  {
    nombre: 'Reembolso PARCIAL → el pago sigue EXITOSO, la suscripción sigue, y se pide nota de crédito',
    estado: { cargoEnLaBase: 'chr_p1' },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_p1', amount: 1000 }), query: { secret: 'secreto-de-prueba' } },
    comprobar: (r, e) => {
      if (e.usuarioActualizado) return mal('un reembolso parcial apagó la suscripción');
      if (e.pagoActualizado?.estado !== 'EXITOSO' || e.pagoActualizado?.montoReembolsado !== 1000) return mal('no registró el parcial:', JSON.stringify(e.pagoActualizado));
      if (!e.avisos?.some((a) => a.lineas.join(' ').includes('NOTA DE CRÉDITO'))) return mal('no avisó de la nota de crédito');
      ok('parcial: queda registrado y el servicio continúa');
    },
  },
  {
    nombre: 'DOS reembolsos parciales SIMULTÁNEOS (eventos distintos) → el acumulado suma los dos',
    estado: { cargoEnLaBase: 'chr_c1' },
    peticion: { body: { id: 'evt_c1', ...evento('refund.creation.succeeded', { chargeId: 'chr_c1', amount: 1000 }) }, query: { secret: 'secreto-de-prueba' } },
    concurrente: { body: { id: 'evt_c2', ...evento('refund.creation.succeeded', { chargeId: 'chr_c1', amount: 2000 }) }, query: { secret: 'secreto-de-prueba' } },
    comprobar: (r, e) => {
      // Réplica del auditor (2026-10-07, P1-N02): leer fuera y escribir la suma
      // dejaba 2000 (o 1000) en vez de 3000.
      if (e.montoReembolsado !== 3000) return mal(`montoReembolsado=${e.montoReembolsado}, esperado 3000: un reembolso pisó al otro`);
      ok('1000 + 2000 = 3000, ninguno se pierde');
    },
  },
  {
    nombre: 'Reembolso de una cuota VIEJA (hay una posterior) → no corta el periodo actual',
    estado: { cargoEnLaBase: 'chr_v1', hayCuotaPosterior: true, tipo: 'RENOVACION' },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_v1', amount: 5900 }), query: { secret: 'secreto-de-prueba' } },
    comprobar: (r, e) => {
      if (e.usuarioActualizado) return mal('devolver un mes viejo cortó el mes en curso');
      ok('solo se registra');
    },
  },
  {
    nombre: 'El MISMO evento dos veces (reintento de Culqi) → se aplica una sola vez',
    estado: { cargoEnLaBase: 'chr_d1' },
    peticion: { body: { id: 'evt_dup_1', ...evento('refund.creation.succeeded', { chargeId: 'chr_d1', amount: 5900 }) }, query: { secret: 'secreto-de-prueba' } },
    comprobar: async (r, e) => {
      e.pagoActualizado = null;
      const r2 = await ejecutar({ body: { id: 'evt_dup_1', ...evento('refund.creation.succeeded', { chargeId: 'chr_d1', amount: 5900 }) }, query: { secret: 'secreto-de-prueba' } });
      if (!r2.body?.duplicado || e.pagoActualizado) return mal('reaplicó un evento ya recibido');
      ok('el segundo envío responde 200 «duplicado» y no toca nada');
    },
  },
  {
    nombre: 'Falla el procesamiento → el evento queda PENDIENTE (para el reintento) y se responde 200',
    estado: { cargoEnLaBase: 'chr_f1', fallaAlProcesar: true },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_f1', amount: 5900 }), query: { secret: 'secreto-de-prueba' } },
    comprobar: (r, e) => {
      const ev = e.eventos[0];
      if (!ev || ev.estado !== 'PENDIENTE' || !/fallo interno/.test(ev.ultimoError || '')) return mal('no quedó guardado como PENDIENTE:', JSON.stringify(ev));
      if (r.body?.recibido !== true) return mal('debía responder 200: el evento ya está a salvo en la base');
      ok('nada se pierde: queda para el worker de reintentos');
    },
  },
  {
    nombre: 'La base no puede ni GUARDAR el evento → 500, para que Culqi reintente',
    estado: { cargoEnLaBase: 'chr_b1', baseCaida: true },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_b1' }), query: { secret: 'secreto-de-prueba' } },
    comprobar: (r) => {
      if (r.status !== 500) return mal(`status ${r.status}: con la base caída hay que pedir reintento`);
      ok('500 = Culqi lo vuelve a mandar');
    },
  },
  {
    nombre: 'PRODUCCIÓN sin CULQI_WEBHOOK_SECRET → se rechaza todo (antes aceptaba todo)',
    estado: { cargoEnLaBase: 'chr_s1' },
    antes: () => { estado.envPrevio = [process.env.CULQI_WEBHOOK_SECRET, process.env.NODE_ENV]; delete process.env.CULQI_WEBHOOK_SECRET; process.env.NODE_ENV = 'production'; },
    despues: () => { process.env.CULQI_WEBHOOK_SECRET = 'secreto-de-prueba'; process.env.NODE_ENV = estado.envPrevio[1] || ''; },
    peticion: { body: evento('refund.creation.succeeded', { chargeId: 'chr_s1' }) },
    comprobar: (r, e) => {
      if (r.status !== 401 || e.pagoActualizado) return mal('sin secreto en producción, aceptó el evento');
      ok('falla cerrado');
    },
  },
];

(async () => {
  for (const caso of casos) {
    estado = { eventos: [], ...caso.estado };
    if (caso.antes) caso.antes();
    console.log(`\n— ${caso.nombre}`);
    const [r] = await Promise.all([ejecutar(caso.peticion), caso.concurrente ? ejecutar(caso.concurrente) : null]);
    await caso.comprobar(r, estado);
    if (caso.despues) caso.despues();
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : `\nTodo OK — ${casos.length} casos`);
  process.exit(fallos ? 1 : 0);
})();
