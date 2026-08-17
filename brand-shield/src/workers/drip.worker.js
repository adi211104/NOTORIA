// brand-shield/src/workers/drip.worker.js
// Drip de onboarding: tres correos en los primeros 7 días de una cuenta,
// cada uno según el estado REAL del usuario (no un guion fijo):
//
//   etapa 1 (día 2+): sin negocio → "agrega tu negocio";
//                     con negocio sin GBP → "conecta Google Business";
//                     con todo conectado → no hay nada que pedir, se salta.
//   etapa 2 (día 5+): resumen de valor (reseñas y alertas registradas).
//   etapa 3 (día 7+): promo de bienvenida — solo plan GRATIS que no la usó.
//
// Decisiones que importan:
// - Solo cuentas creadas hace <30 días: el default dripEtapa=0 de las cuentas
//   viejas (el campo llegó después que ellas) no dispara nada.
// - Solo emails verificados: escribirle a un buzón no confirmado es spam.
// - La etapa avanza ANTES de enviar. Si Resend falla, el correo de esa etapa
//   se pierde para ese usuario — preferible a reintentarlo cada día y duplicar
//   si el fallo fue después del envío. Es marketing, no un comprobante.
// - Máximo una etapa por día por usuario: quien se registró hace 8 días con
//   todo pendiente recibe los correos espaciados, no tres juntos.

const cron = require('node-cron');
const prismaReal = require('../lib/prisma');
const emails = require('../utils/emails');
// La fila de control de la vigilancia de ficha vive en la tabla `alerta` y no es
// una alerta: sin este filtro, el correo del día 5 le contaría al usuario una
// alerta que nunca ocurrió. Ver lib/fichaGoogle.js.
const { SIN_CONTROL } = require('../lib/fichaGoogle');

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS = { 1: 2, 2: 5, 3: 7 };

const procesarDrip = async (deps = {}) => {
  const prisma = deps.prisma || prismaReal;
  const enviarDrip = deps.enviarDrip || emails.enviarDrip;
  const ahora = deps.ahora || Date.now();

  const usuarios = await prisma.usuario.findMany({
    where: {
      creadoEn: { gte: new Date(ahora - 30 * DIA_MS) },
      emailVerificado: true,
      dripEtapa: { lt: 3 },
    },
    select: {
      id: true, email: true, nombre: true, idioma: true, plan: true,
      promoBienvenidaUsada: true, dripEtapa: true, creadoEn: true,
      negocios: { where: { activo: true }, select: { id: true, nombre: true, gbpAccessToken: true, gbpLocationId: true } },
    },
  });

  let enviados = 0;
  for (const u of usuarios) {
    const dias = Math.floor((ahora - new Date(u.creadoEn).getTime()) / DIA_MS);
    const etapa = u.dripEtapa + 1;
    if (dias < DIAS[etapa]) continue;

    await prisma.usuario.update({ where: { id: u.id }, data: { dripEtapa: etapa } });

    try {
      if (etapa === 1) {
        const sinGbp = u.negocios.find((n) => !(n.gbpAccessToken && n.gbpLocationId));
        if (u.negocios.length === 0) {
          await enviarDrip(u, 'sinNegocio');
          enviados++;
        } else if (sinGbp) {
          await enviarDrip(u, 'sinGbp', sinGbp.nombre);
          enviados++;
        }
        // todo conectado: nada que pedir, la etapa igual quedó avanzada
      } else if (etapa === 2) {
        if (u.negocios.length > 0) {
          const ids = u.negocios.map((n) => n.id);
          const [resenas, alertas] = await Promise.all([
            prisma.resena.count({ where: { negocioId: { in: ids } } }),
            prisma.alerta.count({ where: { ...SIN_CONTROL, negocioId: { in: ids } } }),
          ]);
          await enviarDrip(u, 'valor', { resenas, alertas });
          enviados++;
        }
      } else if (etapa === 3) {
        if (u.plan === 'GRATIS' && !u.promoBienvenidaUsada) {
          await enviarDrip(u, 'promo');
          enviados++;
        }
      }
    } catch (e) {
      console.error(`[Drip] Error enviando etapa ${etapa} a ${u.email}:`, e.message);
    }
  }

  if (usuarios.length) console.log(`[Drip] ${usuarios.length} cuenta(s) revisadas, ${enviados} email(s) enviados`);
  return { revisados: usuarios.length, enviados };
};

const iniciarDrip = () => {
  cron.schedule('0 10 * * *', () => {
    procesarDrip().catch((e) => console.error('[Drip] Ciclo falló:', e.message));
  }, { timezone: 'America/Lima' });
  console.log('[Drip] Programado: todos los días 10:00 (hora Lima)');
};

module.exports = { iniciarDrip, procesarDrip };
