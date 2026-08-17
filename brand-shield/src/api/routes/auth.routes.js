// brand-shield/src/api/routes/auth.routes.js
// Registro, login y perfil del usuario

const express = require('express');
const crypto = require('crypto');
const { enviarBienvenida, enviarVerificacion, enviarConfirmacionContrasena, enviarRecuperacionContrasena } = require('../../utils/emails');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../../lib/prisma');

const router = express.Router();
const { autenticar } = require('../middlewares/auth.middleware');
const { hayFuenteDisponible } = require('../../lib/menciones');

// 🔴 El correo se normaliza SIEMPRE antes de tocar la base.
//
// En PostgreSQL el índice único distingue mayúsculas, así que "Juan@correo.com"
// y "juan@correo.com" eran dos cuentas distintas. Y como `recuperar-password` sí
// hacía `toLowerCase()` pero el registro y el login no, quien se registrara con
// una mayúscula quedaba atrapado: no podía recuperar su contraseña nunca, porque
// la búsqueda del reset no encontraba su fila.
//
// El `.transform` va dentro del schema para que no haya forma de saltárselo
// desde un call-site nuevo.
const emailNormalizado = z.string().trim().toLowerCase().pipe(z.string().email('Email inválido'));

const schemaRegistro = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: emailNormalizado,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  telefono: z.string().optional(),
});

const schemaLogin = z.object({
  email: emailNormalizado,
  password: z.string().min(1, 'La contraseña es requerida'),
});

// Búsqueda por correo sin distinguir mayúsculas.
//
// Hace falta por las cuentas creadas ANTES de normalizar el registro: si alguien
// se registró como "Juan@correo.com", su fila sigue teniendo la mayúscula, y un
// `findUnique({ email: 'juan@correo.com' })` no la encuentra. Sin esto, arreglar
// el registro dejaría fuera a esos usuarios, que es peor que el bug original.
//
// No se hace backfill de las filas viejas a propósito: bajar todo a minúsculas
// en producción podría chocar contra el @unique si existieran dos variantes del
// mismo correo, y ese choque hay que resolverlo a mano, no en un arranque.
const buscarUsuarioPorEmail = (email) =>
  prisma.usuario.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

// ── POST /api/auth/registro ───────────────────────────────
router.post('/registro', async (req, res, next) => {
  try {
    // Validar datos
    const datos = schemaRegistro.parse(req.body);

    // Verificar si el email ya existe (sin distinguir mayúsculas: una cuenta
    // vieja con "Juan@correo.com" tiene que bloquear el alta de "juan@correo.com")
    const existe = await buscarUsuarioPorEmail(datos.email);
    if (existe) {
      return res.status(409).json({ error: 'Este email ya está registrado' });
    }

    // Encriptar contraseña
    const passwordHash = await bcrypt.hash(datos.password, 12);

    // Crear usuario
    const usuario = await prisma.usuario.create({
      data: {
        nombre: datos.nombre,
        email: datos.email,
        password: passwordHash,
        telefono: datos.telefono,
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        plan: true,
      },
    });

    // Generar token
    const token = jwt.sign(
      { id: usuario.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Enviar emails en segundo plano (no bloquea la respuesta)
    setImmediate(async () => {
      try {
        await enviarBienvenida(usuario);
        const tokenVerif = crypto.randomBytes(20).toString('hex');
        const expira = new Date(Date.now() + 24*60*60*1000);
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { tokenVerificacion: tokenVerif, tokenVerificaExpira: expira },
        });
        await enviarVerificacion(usuario, tokenVerif);
      } catch(e) { console.error('[Email] Error en bienvenida:', e.message); }
    });

    res.status(201).json({
      mensaje: '¡Cuenta creada! Revisa tu email para verificarla.',
      token,
      usuario,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const datos = schemaLogin.parse(req.body);

    // Buscar usuario
    const usuario = await buscarUsuarioPorEmail(datos.email);

    if (!usuario) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    // Usuario registrado con Google — no tiene contraseña
    if (usuario.googleId && (!usuario.password || usuario.password === '')) {
      return res.status(401).json({
        error: 'Esta cuenta fue creada con Google. Usa el botón "Continuar con Google".',
        tipo: 'GOOGLE_USER',
      });
    }

    // Verificar contraseña
    const passwordValida = await bcrypt.compare(datos.password, usuario.password);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    // Generar token
    const token = jwt.sign(
      { id: usuario.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        plan: usuario.plan,
        suscripcionActiva: usuario.suscripcionActiva,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// ── GET /api/auth/perfil ──────────────────────────────────
router.get('/perfil', autenticar, async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: {
        id: true,
        nombre: true,
        email: true,
        emailVerificado: true,
        telefono: true,
        idioma: true,
        plan: true,
        suscripcionActiva: true,
        fechaVencimiento: true,
        promoBienvenidaUsada: true,
        prefsAlertas: true,
        // Datos de facturación: el checkout los necesita para saber si tiene que
        // pedirlos antes de cobrar (obligatorios desde S/700, ver tributario.js)
        docTipo: true,
        docNumero: true,
        razonSocial: true,
        negocios: {
          where: { activo: true },
          select: { id: true, nombre: true, tipo: true },
        },
      },
    });

    // Bandera de disponibilidad, no una columna del usuario: depende sobre todo
    // de la configuración del servidor. Viaja en el perfil porque el layout del
    // dashboard ya lo carga y así no hace falta un request extra solo para
    // decidir si el menú muestra "Menciones".
    //
    // Se le pasa el usuario porque hoy la única fuente es Instagram y está
    // oculto hasta que Meta apruebe, salvo para las cuentas de prueba de la
    // revisión (lib/instagramVisible.js). Para el resto no hay ninguna fuente
    // encendida, así que Menciones vuelve a estar invisible.
    res.json({ ...usuario, mencionesDisponibles: hayFuenteDisponible(usuario) });
  } catch (error) {
    next(error);
  }
});

// El endpoint POST /api/auth/telegram vivía acá. Se eliminó el 2026-08-16 junto
// con el canal entero (ver src/alerts/notificador.js): las alertas van por
// correo, y el aviso inmediato lo da la app Android. La columna
// `Usuario.telegramChatId` sigue en el schema por ahora — dejar de escribirla es
// gratis, borrarla obliga a un `prisma db push --accept-data-loss` contra la BD
// de producción, que es una decisión del dueño y no un efecto secundario de esto.

module.exports = router;

// ── PATCH /api/auth/perfil ────────────────────────────────
// Actualiza el nombre y/o el idioma preferido del usuario
router.patch('/perfil', autenticar, async (req, res, next) => {
  try {
    const { nombre, idioma } = req.body;
    const data = {};

    if (nombre !== undefined) {
      if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' });
      data.nombre = nombre.trim();
    }
    if (idioma !== undefined) {
      if (idioma !== 'es' && idioma !== 'en') return res.status(400).json({ error: 'Idioma inválido' });
      data.idioma = idioma;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada para actualizar' });
    }

    const usuario = await prisma.usuario.update({
      where: { id: req.usuario.id },
      data,
      select: { id: true, nombre: true, email: true, plan: true, idioma: true },
    });
    res.json({ mensaje: 'Perfil actualizado', usuario });
  } catch (error) { next(error); }
});

// ── PATCH /api/auth/preferencias-alertas ─────────────────
// Guarda qué alertas quiere recibir el usuario y con qué frecuencia
router.patch('/preferencias-alertas', autenticar, async (req, res, next) => {
  try {
    const { tipos, umbralNegativas, frecuencia, diaSemana } = req.body || {};

    const TIPOS_VALIDOS = ['PICO_RESENAS_NEGATIVAS', 'CAIDA_RATING', 'CUENTAS_NUEVAS', 'RESENA_MUY_NEGATIVA', 'MENCION_NEGATIVA', 'COMENTARIO_NEGATIVO'];
    const tiposLimpios = {};
    if (tipos && typeof tipos === 'object') {
      for (const t of TIPOS_VALIDOS) {
        if (typeof tipos[t] === 'boolean') tiposLimpios[t] = tipos[t];
      }
    }

    const prefs = {
      tipos: tiposLimpios,
      umbralNegativas: umbralNegativas === 5 ? 5 : 1,
      frecuencia: ['INMEDIATA', 'SEMANAL', 'MENSUAL'].includes(frecuencia) ? frecuencia : 'INMEDIATA',
      diaSemana: Number.isInteger(diaSemana) && diaSemana >= 0 && diaSemana <= 6 ? diaSemana : 1,
    };

    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { prefsAlertas: prefs },
    });

    res.json({ mensaje: 'Preferencias de alertas guardadas', prefsAlertas: prefs });
  } catch (error) { next(error); }
});

// ── PATCH /api/auth/cambiar-password ─────────────────────
router.patch('/cambiar-password', autenticar, async (req, res, next) => {
  try {
    const { passwordActual, passwordNueva } = req.body;

    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({ error: 'Se requieren ambas contraseñas' });
    }
    if (passwordNueva.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    const valida = await bcrypt.compare(passwordActual, usuario.password);
    if (!valida) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    const hash = await bcrypt.hash(passwordNueva, 12);
    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { password: hash },
    });

    // Notificación de seguridad en segundo plano
    setImmediate(async () => {
      try {
        const u = await prisma.usuario.findUnique({ where:{ id:req.usuario.id }, select:{ nombre:true, email:true } });
        if (u) await enviarConfirmacionContrasena(u);
      } catch(e) { console.error('[Email] Error enviando confirmación contraseña:', e.message); }
    });

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) { next(error); }
});

// ── DELETE /api/auth/cuenta ───────────────────────────────
// Elimina la cuenta y todos los datos del usuario.
//
// 🔴 Dos cosas que estaban mal hasta el 2026-08-17:
//
// 1. El `prisma.usuario.delete` del final NO borraba `pagos` ni `comprobantes`,
//    y las dos tablas apuntan al usuario con una FK obligatoria (ON DELETE
//    RESTRICT). Resultado: cualquier cliente que hubiera pagado alguna vez veía
//    un error 500 al intentar borrar su cuenta, sin explicación.
//
// 2. Borrar esas filas TAMPOCO era la salida: el XML firmado y el CDR de cada
//    comprobante hay que conservarlos 5 años (ver el modelo Comprobante). Un
//    cliente no puede hacer desaparecer la contabilidad de la empresa pidiendo
//    la baja de su cuenta.
//
// Por eso, cuando hay historial fiscal, la cuenta se ANONIMIZA en vez de
// borrarse: se van los datos personales y el acceso, y queda la fila mínima que
// sostiene los comprobantes. Es también lo que permite la Ley 29733: el derecho
// de supresión cede ante una obligación legal de conservación, y lo correcto es
// conservar lo justo y disociar el resto.
//
// Si el usuario nunca pagó no hay nada que conservar, así que se borra de verdad.
router.delete('/cuenta', autenticar, async (req, res, next) => {
  try {
    const usuarioId = req.usuario.id;

    // Eliminar en orden por dependencias de FK
    const negocios = await prisma.negocio.findMany({
      where: { usuarioId },
      select: { id: true },
    });
    const negocioIds = negocios.map(n => n.id);

    if (negocioIds.length > 0) {
      await prisma.alerta.deleteMany({ where: { negocioId: { in: negocioIds } } });
      await prisma.resena.deleteMany({ where: { negocioId: { in: negocioIds } } });
      await prisma.snapshot.deleteMany({ where: { negocioId: { in: negocioIds } } });
      await prisma.mencion.deleteMany({ where: { negocioId: { in: negocioIds } } }).catch(() => {});
      // Obligatorio, no opcional: la FK de comentarios_sociales es ON DELETE
      // RESTRICT, así que sin este borrado la eliminación de cuenta falla.
      await prisma.comentarioSocial.deleteMany({ where: { negocioId: { in: negocioIds } } }).catch(() => {});
      const competidores = await prisma.competidor.findMany({
        where: { negocioId: { in: negocioIds } }, select: { id: true },
      }).catch(() => []);
      if (competidores.length > 0) {
        await prisma.snapshotCompetidor.deleteMany({
          where: { competidorId: { in: competidores.map(c => c.id) } },
        }).catch(() => {});
        await prisma.competidor.deleteMany({ where: { negocioId: { in: negocioIds } } }).catch(() => {});
      }
      await prisma.negocio.deleteMany({ where: { usuarioId } });
    }

    // ¿Queda historial fiscal que la empresa está obligada a conservar?
    const tieneHistorialFiscal =
      (await prisma.pago.count({ where: { usuarioId } })) > 0 ||
      (await prisma.comprobante.count({ where: { usuarioId } })) > 0;

    if (!tieneHistorialFiscal) {
      await prisma.usuario.delete({ where: { id: usuarioId } });
      return res.json({ mensaje: 'Cuenta eliminada correctamente' });
    }

    // Anonimización. El correo se reemplaza por uno irrepetible dentro de un
    // dominio reservado (RFC 2606) para no chocar contra el @unique ni poder
    // colisionar jamás con un correo real, y la contraseña por una cadena que
    // bcrypt nunca va a validar — no es un hash, así que ningún `compare`
    // puede darle verdadero.
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        email: `eliminado-${usuarioId}@cuenta-eliminada.invalid`,
        nombre: 'Cuenta eliminada',
        password: 'CUENTA_ELIMINADA',
        telefono: null,
        googleId: null,
        tokenVerificacion: null,
        tokenVerificaExpira: null,
        tokenResetHash: null,
        tokenResetExpira: null,
        emailVerificado: false,
        suscripcionActiva: false,
        suscripcionId: null,
        fechaVencimiento: null,
        plan: 'GRATIS',
        prefsAlertas: null,
        // Datos fiscales del receptor: se van de la cuenta, pero siguen
        // congelados dentro de cada Comprobante ya emitido, que es donde la
        // norma obliga a conservarlos.
        docTipo: null,
        docNumero: null,
        razonSocial: null,
        direccionFiscal: null,
        paisFiscal: null,
      },
    });

    res.json({
      mensaje: 'Cuenta eliminada correctamente. Por obligación tributaria conservamos solo los comprobantes ya emitidos, sin tus datos personales.',
    });
  } catch (error) { next(error); }
});

// ── POST /api/auth/google ─────────────────────────────────
// Autenticación con Google Identity Services
// Requiere: npm install google-auth-library
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'credential requerido' });

    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { name, sub: googleId, email_verified: emailVerificadoGoogle } = payload;
    // Mismo criterio que el registro normal: el correo se guarda en minúsculas
    const email = (payload.email || '').trim().toLowerCase();

    // 🔴 Sin correo verificado no se entra.
    //
    // Más abajo, si ya existe una cuenta con este correo, se le engancha el
    // googleId — o sea que el token de Google vale como prueba de identidad. Eso
    // solo es cierto si Google confirma que el correo está verificado. Un dominio
    // de Workspace mal configurado puede emitir tokens con correos sin verificar,
    // y ahí el enlace automático se convierte en una vía para tomar una cuenta
    // ajena con solo saber su correo.
    if (!email || emailVerificadoGoogle === false) {
      return res.status(401).json({
        error: 'Tu cuenta de Google no tiene el correo verificado. Verifícalo con Google o regístrate con correo y contraseña.',
        tipo: 'GOOGLE_EMAIL_NO_VERIFICADO',
      });
    }

    // Buscar usuario existente por email o googleId. El email va sin distinguir
    // mayúsculas por las cuentas anteriores a la normalización (ver arriba).
    let usuario = await prisma.usuario.findFirst({
      where: { OR: [{ email: { equals: email, mode: 'insensitive' } }, { googleId }] },
    });

    const esNuevo = !usuario;

    if (!usuario) {
      // Crear nuevo usuario. Llega con el correo ya verificado por Google, así
      // que no tiene sentido pedirle que verifique otra vez: sin esto, el panel
      // le mostraba la franja amarilla de "verifica tu correo" a alguien que
      // acababa de identificarse con Google.
      usuario = await prisma.usuario.create({
        data: {
          email,
          nombre: name || email.split('@')[0],
          password: '', // Sin contraseña para usuarios de Google
          googleId,
          emailVerificado: true,
        },
      });
    } else if (!usuario.googleId) {
      // Vincular cuenta existente con Google
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { googleId },
      });
    }

    const token = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({
      token,
      esNuevo,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        plan: usuario.plan,
        suscripcionActiva: usuario.suscripcionActiva,
      },
    });
  } catch (error) {
    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Token de Google inválido' });
    }
    next(error);
  }
});

// ── GET /api/auth/verificar-email ────────────────────────
router.get('/verificar-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token requerido' });

    const usuario = await prisma.usuario.findFirst({
      where: {
        tokenVerificacion: token,
        tokenVerificaExpira: { gt: new Date() },
      },
    });

    if (!usuario) {
      return res.status(400).json({
        error: 'El enlace de verificación es inválido o ha expirado. Solicita uno nuevo.',
        tipo: 'TOKEN_INVALIDO',
      });
    }

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { emailVerificado: true, tokenVerificacion: null, tokenVerificaExpira: null },
    });

    res.json({ mensaje: 'Email verificado correctamente. ¡Bienvenido a Notoria!', emailVerificado: true });
  } catch (error) { next(error); }
});

// ── POST /api/auth/recuperar-password ────────────────────
// Solicita un enlace de restablecimiento. SIEMPRE responde 200 con el mismo
// mensaje, exista o no el email, para no revelar qué correos están registrados
// (evita enumeración de usuarios). El token va por email; en BD solo guardamos
// su hash SHA-256, nunca el token en claro.
router.post('/recuperar-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const respuestaGenerica = { mensaje: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.' };

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email requerido' });
    }

    const usuario = await buscarUsuarioPorEmail(email.toLowerCase().trim());

    // Solo enviamos si la cuenta existe y tiene contraseña (las cuentas creadas
    // solo con Google no tienen contraseña que restablecer).
    if (usuario && usuario.password) {
      const tokenPlano = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');
      const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { tokenResetHash: tokenHash, tokenResetExpira: expira },
      });

      setImmediate(async () => {
        try { await enviarRecuperacionContrasena(usuario, tokenPlano); }
        catch (e) { console.error('[Reset] Error enviando email de recuperación:', e.message); }
      });
    }

    // Respuesta idéntica en ambos casos.
    return res.json(respuestaGenerica);
  } catch (error) { next(error); }
});

// ── POST /api/auth/resetear-password ─────────────────────
// Recibe el token del email + la nueva contraseña. Valida el hash y la expiración,
// actualiza la contraseña, invalida el token (un solo uso) y notifica por email.
router.post('/resetear-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const usuario = await prisma.usuario.findFirst({
      where: { tokenResetHash: tokenHash, tokenResetExpira: { gt: new Date() } },
    });

    if (!usuario) {
      return res.status(400).json({
        error: 'El enlace de restablecimiento es inválido o ha expirado. Solicita uno nuevo.',
        tipo: 'TOKEN_INVALIDO',
      });
    }

    const hash = await bcrypt.hash(String(password), 12);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { password: hash, tokenResetHash: null, tokenResetExpira: null },
    });

    setImmediate(async () => {
      try { await enviarConfirmacionContrasena({ nombre: usuario.nombre, email: usuario.email }); }
      catch (e) { console.error('[Reset] Error enviando confirmación:', e.message); }
    });

    res.json({ mensaje: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión.' });
  } catch (error) { next(error); }
});

// ── POST /api/auth/reenviar-verificacion ─────────────────
router.post('/reenviar-verificacion', autenticar, async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (usuario.emailVerificado) return res.json({ mensaje: 'Tu email ya está verificado.', yaVerificado: true });

    const token = crypto.randomBytes(20).toString('hex');
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { tokenVerificacion: token, tokenVerificaExpira: expira },
    });

    console.log('[Verificacion] Enviando email a:', usuario.email);

    const resultado = await enviarVerificacion(usuario, token);

    if (resultado?.error) {
      console.error('[Verificacion] Error de Resend:', JSON.stringify(resultado.error));
      return res.status(500).json({ error: 'Error al enviar el email: ' + resultado.error.message });
    }

    console.log('[Verificacion] Email enviado OK. ID:', resultado?.data?.id);
    res.json({ mensaje: 'Email enviado. Revisa tu bandeja y carpeta de spam.', ok: true });
  } catch (error) {
    console.error('[Verificacion] Error inesperado:', error.message);
    next(error);
  }
});
