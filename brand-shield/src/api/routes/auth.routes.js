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

// ── Validaciones con Zod ──────────────────────────────────
const schemaRegistro = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  telefono: z.string().optional(),
});

const schemaLogin = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

// ── POST /api/auth/registro ───────────────────────────────
router.post('/registro', async (req, res, next) => {
  try {
    // Validar datos
    const datos = schemaRegistro.parse(req.body);

    // Verificar si el email ya existe
    const existe = await prisma.usuario.findUnique({
      where: { email: datos.email },
    });
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
    const usuario = await prisma.usuario.findUnique({
      where: { email: datos.email },
    });

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
        telegramChatId: true,
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

    // Bandera de disponibilidad, no una columna del usuario: depende de la
    // configuración del servidor, no de la cuenta. Viaja en el perfil porque el
    // layout del dashboard ya lo carga y así no hace falta un request extra solo
    // para decidir si el menú muestra "Menciones".
    res.json({ ...usuario, mencionesDisponibles: hayFuenteDisponible() });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/telegram ───────────────────────────────
// Vincula el chat de Telegram del usuario para recibir alertas
router.post('/telegram', autenticar, async (req, res, next) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: 'chatId de Telegram requerido' });
    }

    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { telegramChatId: String(chatId) },
    });

    res.json({ mensaje: 'Telegram vinculado correctamente' });
  } catch (error) {
    next(error);
  }
});

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
// Elimina la cuenta y todos los datos del usuario
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

    await prisma.usuario.delete({ where: { id: usuarioId } });
    res.json({ mensaje: 'Cuenta eliminada correctamente' });
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
    const { email, name, sub: googleId, picture } = payload;

    // Buscar usuario existente por email o googleId
    let usuario = await prisma.usuario.findFirst({
      where: { OR: [{ email }, { googleId }] },
    });

    const esNuevo = !usuario;

    if (!usuario) {
      // Crear nuevo usuario
      usuario = await prisma.usuario.create({
        data: {
          email,
          nombre: name || email.split('@')[0],
          password: '', // Sin contraseña para usuarios de Google
          googleId,
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

    const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });

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
