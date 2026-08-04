// brand-shield/scripts/prueba-drip.js
// Prueba el worker de drip con Prisma y el envío simulados (no toca BD ni
// manda emails). Cubre: elección de variante por estado, avance de etapa,
// espaciado de días, exclusiones (sin verificar, cuenta vieja, plan de pago)
// y una etapa por corrida como máximo.
//   node scripts/prueba-drip.js

const { procesarDrip } = require('../src/workers/drip.worker');

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.now();
let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

const usuario = (over = {}) => ({
  id: over.id || 'u1', email: over.email || 'a@b.com', nombre: 'Ana Pérez', idioma: 'es',
  plan: 'GRATIS', promoBienvenidaUsada: false, dripEtapa: 0,
  creadoEn: new Date(AHORA - 3 * DIA), negocios: [], ...over,
});

const armarMocks = (usuarios) => {
  const enviados = [];
  const etapas = {};
  const prisma = {
    usuario: {
      // El worker filtra en la query real; acá replicamos los 3 filtros para
      // que las pruebas de exclusión pasen por el mismo camino.
      findMany: async ({ where }) => usuarios.filter((u) =>
        new Date(u.creadoEn) >= where.creadoEn.gte && u.emailVerificado !== false && u.dripEtapa < 3),
      update: async ({ where, data }) => { etapas[where.id] = data.dripEtapa; },
    },
    resena: { count: async () => 12 },
    alerta: { count: async () => 2 },
  };
  const enviarDrip = async (u, tipo, datos) => { enviados.push({ email: u.email, tipo, datos }); };
  return { prisma, enviarDrip, enviados, etapas };
};

(async () => {
  // 1. Día 3, sin negocio → email "sinNegocio" y etapa 1
  let m = armarMocks([usuario()]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados.length === 1 && m.enviados[0].tipo === 'sinNegocio', 'día 3 sin negocio → sinNegocio');
  ok(m.etapas.u1 === 1, 'la etapa avanza a 1');

  // 2. Día 3, negocio sin GBP → "sinGbp" con el nombre del negocio
  m = armarMocks([usuario({ negocios: [{ id: 'n1', nombre: 'La Trattoria', gbpAccessToken: null, gbpLocationId: null }] })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados[0]?.tipo === 'sinGbp' && m.enviados[0]?.datos === 'La Trattoria', 'día 3 sin GBP → sinGbp con nombre');

  // 3. Día 3, todo conectado → sin email pero etapa avanzada (no se repite mañana)
  m = armarMocks([usuario({ negocios: [{ id: 'n1', nombre: 'X', gbpAccessToken: 't', gbpLocationId: 'l' }] })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados.length === 0 && m.etapas.u1 === 1, 'día 3 todo conectado → nada que pedir, etapa avanza igual');

  // 4. Día 1 → demasiado pronto, ni email ni avance
  m = armarMocks([usuario({ creadoEn: new Date(AHORA - 1 * DIA) })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados.length === 0 && m.etapas.u1 === undefined, 'día 1 → todavía nada');

  // 5. Etapa 1 hecha, día 6, con negocio → "valor" con las cifras
  m = armarMocks([usuario({ dripEtapa: 1, creadoEn: new Date(AHORA - 6 * DIA), negocios: [{ id: 'n1', nombre: 'X', gbpAccessToken: 't', gbpLocationId: 'l' }] })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados[0]?.tipo === 'valor' && m.enviados[0]?.datos.resenas === 12, 'día 6 etapa 1 → valor con cifras');

  // 6. Etapa 2 hecha, día 8, GRATIS sin promo usada → "promo"
  m = armarMocks([usuario({ dripEtapa: 2, creadoEn: new Date(AHORA - 8 * DIA) })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados[0]?.tipo === 'promo' && m.etapas.u1 === 3, 'día 8 etapa 2 → promo y cierre en etapa 3');

  // 7. Día 8, plan NEGOCIO → la promo no se ofrece a quien ya paga
  m = armarMocks([usuario({ dripEtapa: 2, creadoEn: new Date(AHORA - 8 * DIA), plan: 'NEGOCIO' })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados.length === 0 && m.etapas.u1 === 3, 'día 8 con plan de pago → sin promo, cierre igual');

  // 8. Registrado hace 10 días con todo pendiente → UNA sola etapa por corrida
  m = armarMocks([usuario({ creadoEn: new Date(AHORA - 10 * DIA) })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados.length === 1 && m.etapas.u1 === 1, 'cuenta atrasada → máximo una etapa por día');

  // 9. Cuenta de hace 40 días → fuera de la ventana, jamás se toca
  m = armarMocks([usuario({ creadoEn: new Date(AHORA - 40 * DIA) })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados.length === 0 && m.etapas.u1 === undefined, 'cuenta vieja (40 días) → intacta');

  // 10. Email sin verificar → excluido
  m = armarMocks([usuario({ emailVerificado: false })]);
  await procesarDrip({ ...m, ahora: AHORA });
  ok(m.enviados.length === 0, 'email sin verificar → excluido');

  // 11. Si el envío revienta, la etapa ya avanzó (no se duplica al día siguiente)
  m = armarMocks([usuario()]);
  const enviarRoto = async () => { throw new Error('Resend caído'); };
  await procesarDrip({ prisma: m.prisma, enviarDrip: enviarRoto, ahora: AHORA });
  ok(m.etapas.u1 === 1, 'fallo de envío → la etapa no se repite');

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
  process.exit(fallos ? 1 : 0);
})();
