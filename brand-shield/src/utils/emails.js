const { Resend } = require('resend');

// Lazy: crear el cliente dentro de cada función para que process.env ya esté cargado
const getResend = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY no está configurado en .env');
  return new Resend(key);
};

const FROM = () => {
  const custom = process.env.EMAIL_FROM;
  // Solo usar FROM personalizado si no tiene dominios placeholder sin verificar en Resend
  if (custom && !custom.includes('tudominio') && !custom.includes('example')) {
    return custom;
  }
  // Default seguro para desarrollo — no requiere verificar dominio en Resend
  return 'Notoria <onboarding@resend.dev>';
};
const FRONT  = () => process.env.FRONTEND_URL || 'http://localhost:3001';

// ── Plantilla base ────────────────────────────────────────
const base = (body) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FAF9F5;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #E8E6DC;border-radius:8px;overflow:hidden;">
    <div style="background:#141413;padding:16px 24px;display:flex;align-items:center;gap:10px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B7324" stroke-width="2.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span style="color:#fff;font-weight:700;font-size:16px;">Notoria</span>
    </div>
    <div style="padding:28px 24px;">${body}</div>
    <div style="padding:14px 24px;border-top:1px solid #E8E6DC;">
      <p style="color:#9C9B96;font-size:11px;margin:0;">Notoria · Monitor de reputación para negocios del Perú · <a href="${FRONT()}" style="color:#0B7324;">usenotoria.app</a></p>
    </div>
  </div>
</body></html>`;

// ── Escape de HTML para texto que NO escribimos nosotros ──
//
// 🔴 Todo lo que llega de fuera y termina dentro de un correo pasa por acá. La
// razón no es teórica: el texto de una reseña, de un comentario o de una hoja
// del Libro de Reclamaciones lo escribe un DESCONOCIDO, y esos textos se
// interpolan en el HTML del mensaje que Notoria manda —desde su propio dominio,
// firmado con DKIM y alineado con DMARC— al dueño del negocio.
//
// Sin escapar, una reseña de 1★ cuyo texto sea
//   <a href="https://sitio-falso/pagar">Haz clic para eliminar esta reseña</a>
// se convierte en un enlace de verdad dentro de un correo legítimo de Notoria.
// Es phishing con nuestra credibilidad detrás, y lo dispara cualquiera que pueda
// escribir una reseña en la ficha de un cliente: es decir, cualquiera.
//
// ⚠️ NO se aplica dentro de `p()`, `h1()` ni `btn()`: a esos se les pasa HTML a
// propósito (`<strong>`, `<code>`). El escape va en el punto donde se inserta el
// dato ajeno, que es el único sitio donde se puede distinguir uno de otro.
const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const h1  = (t)   => `<h1 style="color:#141413;font-size:20px;font-weight:800;margin:0 0 14px;letter-spacing:-0.5px;">${t}</h1>`;
const p   = (t)   => `<p style="color:#5C5B57;font-size:14px;line-height:1.75;margin:0 0 12px;">${t}</p>`;
const btn = (t,u) => `<div style="margin:16px 0;"><a href="${u}" style="display:inline-block;background:#0B7324;color:#fff;text-decoration:none;padding:12px 24px;border-radius:5px;font-weight:700;font-size:14px;">${t}</a></div>`;
const hr  = ()    => `<div style="height:1px;background:#E8E6DC;margin:18px 0;"></div>`;

// ── 1. Bienvenida ─────────────────────────────────────────
// Fecha larga en el idioma del destinatario. Los correos la traían fija con
// `toLocaleDateString('es-PE', …)`, así que un usuario en inglés leía «15 de
// septiembre de 2026» dentro de un párrafo en inglés.
//
// ⚠️ NO confundir con `tributario.fechaPeru()`: aquella formatea en zona horaria
// de Lima porque SUNAT rechaza una fecha desfasada (§9). Esta es cosmética.
const fechaLarga = (fecha, idioma, opciones = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Date(fecha).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PE', opciones);

// Correos de la cuenta: alta, contraseñas y ciclo de cobro.
const CUENTA = {
  es: {
    bienvenidaAsunto: (n) => `Bienvenido a Notoria, ${n}`,
    bienvenidaTitulo: (n) => `Bienvenido, ${n}.`,
    bienvenidaIntro: 'Tu cuenta está lista. En 5 minutos puedes tener tu negocio monitoreado.',
    bienvenidaPasos: ['Agrega tu restaurante u hotel desde Google Maps.', 'Conecta Google Business para ver todas tus reseñas.', 'Elige qué alertas quieres recibir por correo.'],
    irPanel: 'Ir al panel de control →',

    cambiadaAsunto: 'Tu contraseña fue cambiada — Notoria',
    cambiadaTitulo: 'Tu contraseña fue cambiada',
    cambiadaIntro: (email) => `La contraseña de <strong>${email}</strong> fue actualizada correctamente.`,
    noFuiste: '¿No fuiste tú?',
    escribenos: (correo) => `Escríbenos a <a href="mailto:${correo}" style="color:#0B7324;">${correo}</a> de inmediato.`,
    irCuenta: 'Ir a mi cuenta →',

    resetAsunto: 'Restablece tu contraseña — Notoria',
    resetTitulo: '¿Olvidaste tu contraseña?',
    resetIntro: (email) => `Recibimos una solicitud para restablecer la contraseña de <strong>${email}</strong>. Haz clic en el botón para elegir una nueva:`,
    resetCta: 'Restablecer contraseña →',
    resetIgnora: 'Si no solicitaste esto, ignora este mensaje y tu contraseña seguirá igual. El enlace expira en 1 hora.',
    copiar: 'Si el botón no funciona, copia este enlace:',

    confirmarAsunto: 'Confirma el cambio de tu contraseña de Notoria',
    confirmarTitulo: 'Confirma el cambio',
    confirmarIntro: (n) => `Hola ${n}, alguien pidió cambiar la contraseña de tu cuenta de Notoria.`,
    confirmarAviso: '<strong>Tu contraseña todavía NO ha cambiado.</strong> Solo cambia si abres este enlace:',
    confirmarCta: 'Sí, cambiar mi contraseña',
    confirmarVigencia: 'El enlace vale 30 minutos y se puede usar una sola vez.',
    confirmarNoFuiste: '<strong>¿No fuiste tú?</strong> No abras el enlace y no hace falta que hagas nada más: sin ese clic la contraseña sigue siendo la de siempre. Aun así, quien lo pidió conocía tu contraseña actual, así que conviene que la cambies tú desde la app y revises dónde tienes la sesión abierta.',

    cobroAsuntoUltimo: 'No pudimos cobrar tu plan de Notoria — último aviso',
    cobroAsunto: (i, max) => `No pudimos cobrar tu plan de Notoria (intento ${i} de ${max})`,
    cobroTituloUltimo: 'Tu plan pasó al Gratuito',
    cobroTitulo: 'No pudimos cobrar tu plan',
    cobroIntro: (n, importe, plan) => `Hola ${n}, intentamos cobrar <strong>${importe}</strong> de tu plan ${plan} y el banco rechazó el cargo.`,
    cobroMotivo: 'Casi siempre es una tarjeta vencida, un límite de compras por internet o un bloqueo temporal del banco. Se arregla en dos minutos actualizando la tarjeta.',
    cobroUltimo: 'Tu cuenta pasó al plan Gratuito. <strong>No perdiste nada</strong>: tus negocios siguen monitoreados y todo tu historial está intacto. Al actualizar tu tarjeta recuperas tu plan al instante.',
    cobroReintento: (f) => `Lo volveremos a intentar el <strong>${f}</strong>. Mientras tanto tu plan sigue activo con normalidad.`,
    cobroCta: 'Actualizar mi tarjeta →',
    cobroYaActualizada: 'Si ya la actualizaste, ignora este correo.',

    cancelAsunto: 'Cancelaste la renovación de tu plan Notoria',
    cancelTitulo: 'Listo, no te volveremos a cobrar',
    cancelIntro: (n, plan) => `Hola ${n}, cancelaste la renovación automática de tu plan ${plan}.`,
    cancelHasta: (f) => `<strong>Tu plan sigue activo hasta el ${f}</strong>, que es el final del periodo que ya pagaste. Ese día tu cuenta pasa sola al plan Gratuito.`,
    cancelConserva: 'Tus negocios siguen monitoreados y no se borra nada de tu historial. Puedes reactivar el plan cuando quieras.',
    cancelCta: 'Ver mis planes →',
    cancelFeedback: 'Si cancelaste por algo que podamos mejorar, respóndenos a este correo: lo leemos todo.',

    reembolsoAsunto: (importe) => `Te devolvimos ${importe} — Notoria`,
    reembolsoTitulo: 'Reembolso emitido',
    reembolsoIntro: (n, importe) => `Hola ${n}, emitimos la devolución de <strong>${importe}</strong> a la misma tarjeta con la que pagaste.`,
    reembolsoPlazo: 'El dinero lo tiene que asentar tu banco, y eso suele tardar <strong>entre 5 y 15 días hábiles</strong> según el emisor. De nuestro lado ya está hecho: si pasado ese plazo no aparece en tu estado de cuenta, reclámaselo a tu banco citando la fecha de este correo.',
    reembolsoSinCobros: 'No volveremos a cobrarte automáticamente.',
    reembolsoCta: 'Ver mi facturación →',
    reembolsoDudas: '¿Algo no cuadra? Respóndenos a este correo y lo revisamos.',
  },
  en: {
    bienvenidaAsunto: (n) => `Welcome to Notoria, ${n}`,
    bienvenidaTitulo: (n) => `Welcome, ${n}.`,
    bienvenidaIntro: 'Your account is ready. In 5 minutes you can have your business monitored.',
    bienvenidaPasos: ['Add your restaurant or hotel from Google Maps.', 'Connect Google Business to see all your reviews.', 'Choose which alerts you want by email.'],
    irPanel: 'Open dashboard →',

    cambiadaAsunto: 'Your password was changed — Notoria',
    cambiadaTitulo: 'Your password was changed',
    cambiadaIntro: (email) => `The password for <strong>${email}</strong> was updated successfully.`,
    noFuiste: "Wasn't you?",
    escribenos: (correo) => `Write to us at <a href="mailto:${correo}" style="color:#0B7324;">${correo}</a> right away.`,
    irCuenta: 'Go to my account →',

    resetAsunto: 'Reset your password — Notoria',
    resetTitulo: 'Forgot your password?',
    resetIntro: (email) => `We received a request to reset the password for <strong>${email}</strong>. Click the button to choose a new one:`,
    resetCta: 'Reset password →',
    resetIgnora: 'If you did not request this, ignore this message and your password stays the same. The link expires in 1 hour.',
    copiar: "If the button doesn't work, copy this link:",

    confirmarAsunto: 'Confirm your Notoria password change',
    confirmarTitulo: 'Confirm the change',
    confirmarIntro: (n) => `Hi ${n}, someone asked to change the password on your Notoria account.`,
    confirmarAviso: '<strong>Your password has NOT changed yet.</strong> It only changes if you open this link:',
    confirmarCta: 'Yes, change my password',
    confirmarVigencia: 'The link is valid for 30 minutes and can be used only once.',
    confirmarNoFuiste: '<strong>Was it not you?</strong> Do not open the link and you need do nothing else: without that click your password stays as it was. Even so, whoever asked knew your current password, so it is worth changing it yourself from the app and checking where your session is open.',

    cobroAsuntoUltimo: 'We could not charge your Notoria plan — final notice',
    cobroAsunto: (i, max) => `We could not charge your Notoria plan (attempt ${i} of ${max})`,
    cobroTituloUltimo: 'Your plan moved to Free',
    cobroTitulo: 'We could not charge your plan',
    cobroIntro: (n, importe, plan) => `Hi ${n}, we tried to charge <strong>${importe}</strong> for your ${plan} plan and the bank declined it.`,
    cobroMotivo: 'It is almost always an expired card, an online purchase limit or a temporary bank block. It takes two minutes to fix by updating the card.',
    cobroUltimo: 'Your account moved to the Free plan. <strong>You lost nothing</strong>: your businesses are still monitored and your whole history is intact. Update your card and your plan comes back instantly.',
    cobroReintento: (f) => `We will try again on <strong>${f}</strong>. In the meantime your plan stays active as normal.`,
    cobroCta: 'Update my card →',
    cobroYaActualizada: 'If you already updated it, ignore this email.',

    cancelAsunto: 'You cancelled your Notoria plan renewal',
    cancelTitulo: 'Done, we will not charge you again',
    cancelIntro: (n, plan) => `Hi ${n}, you cancelled the automatic renewal of your ${plan} plan.`,
    cancelHasta: (f) => `<strong>Your plan stays active until ${f}</strong>, the end of the period you already paid for. That day your account moves to the Free plan on its own.`,
    cancelConserva: 'Your businesses stay monitored and nothing in your history is deleted. You can reactivate the plan whenever you want.',
    cancelCta: 'See my plans →',
    cancelFeedback: 'If you cancelled over something we can fix, reply to this email: we read every one.',

    reembolsoAsunto: (importe) => `We refunded ${importe} — Notoria`,
    reembolsoTitulo: 'Refund issued',
    reembolsoIntro: (n, importe) => `Hi ${n}, we issued a refund of <strong>${importe}</strong> to the same card you paid with.`,
    reembolsoPlazo: 'Your bank still has to post it, and that usually takes <strong>5 to 15 business days</strong> depending on the issuer. On our side it is already done: if it has not shown up on your statement after that, claim it with your bank quoting the date of this email.',
    reembolsoSinCobros: 'We will not charge you automatically again.',
    reembolsoCta: 'View my billing →',
    reembolsoDudas: 'Something not adding up? Reply to this email and we will look into it.',
  },
};

// Correos de equipo. ⚠️ El destinatario puede NO tener cuenta todavía (la
// invitación), así que el idioma llega como parámetro en vez de leerse de un
// objeto usuario.
const EQUIPO_T = {
  es: {
    invAsunto: (quien, cuenta) => `${quien} te invitó a gestionar ${cuenta} en Notoria`,
    invTitulo: (cuenta) => `Te invitaron a ${cuenta}`,
    invIntro: (quien, cuenta) => `<strong>${quien}</strong> quiere que le ayudes a cuidar la reputación de <strong>${cuenta}</strong> en Notoria.`,
    invRol: (rol, queHace) => `Entrarás como <strong>${rol}</strong>. ${queHace}`,
    rolGestor: 'Gestor',
    rolLector: 'Solo lectura',
    queHaceGestor: 'Podrás responder reseñas y comentarios, usar la IA y gestionar las alertas.',
    queHaceLector: 'Podrás ver las reseñas, las alertas y los reportes, sin modificar nada.',
    invAlcance: (lista) => `Tu acceso será solo a: <strong>${lista}</strong>.`,
    invCta: 'Aceptar la invitación →',
    invCorreo: (email) => `Acepta con esta dirección de correo: <strong>${email}</strong>. Si aún no tienes cuenta en Notoria, el enlace te deja crearla — es gratis y no te pide tarjeta.`,
    invVence: 'La invitación vence en 7 días. Si no esperabas este correo, puedes ignorarlo.',

    nuevoAsunto: (n) => `${n} ya tiene acceso a tu cuenta de Notoria`,
    nuevoTitulo: 'Se sumó alguien a tu equipo',
    nuevoIntro: (n, email, rol) => `<strong>${n}</strong> (${email}) aceptó tu invitación y ya puede entrar como <strong>${rol}</strong>.`,
    nuevoRegistro: 'A partir de ahora verás en Equipo qué hace cada persona: quién respondió cada reseña y cuándo.',
    nuevoCta: 'Ver mi equipo →',
    nuevoDesconocido: 'Si no reconoces a esta persona, quítale el acceso desde esa misma pantalla.',

    salidaAsunto: (cuenta) => `Ya no tienes acceso a ${cuenta} en Notoria`,
    salidaTitulo: 'Se cerró tu acceso',
    salidaIntro: (cuenta) => `El propietario de <strong>${cuenta}</strong> retiró tu acceso a esa cuenta en Notoria.`,
    salidaPersonal: 'Tu cuenta personal sigue intacta: puedes entrar y, si quieres, monitorear tu propio negocio gratis.',
    salidaCta: 'Entrar a Notoria →',
  },
  en: {
    invAsunto: (quien, cuenta) => `${quien} invited you to manage ${cuenta} on Notoria`,
    invTitulo: (cuenta) => `You were invited to ${cuenta}`,
    invIntro: (quien, cuenta) => `<strong>${quien}</strong> wants your help looking after the reputation of <strong>${cuenta}</strong> on Notoria.`,
    invRol: (rol, queHace) => `You will join as <strong>${rol}</strong>. ${queHace}`,
    rolGestor: 'Manager',
    rolLector: 'Read only',
    queHaceGestor: 'You will be able to reply to reviews and comments, use the AI and manage alerts.',
    queHaceLector: 'You will be able to see reviews, alerts and reports, without changing anything.',
    invAlcance: (lista) => `Your access will be limited to: <strong>${lista}</strong>.`,
    invCta: 'Accept the invitation →',
    invCorreo: (email) => `Accept using this email address: <strong>${email}</strong>. If you do not have a Notoria account yet, the link lets you create one — it is free and asks for no card.`,
    invVence: 'The invitation expires in 7 days. If you were not expecting this email, you can ignore it.',

    nuevoAsunto: (n) => `${n} now has access to your Notoria account`,
    nuevoTitulo: 'Someone joined your team',
    nuevoIntro: (n, email, rol) => `<strong>${n}</strong> (${email}) accepted your invitation and can now sign in as <strong>${rol}</strong>.`,
    nuevoRegistro: 'From now on the Team screen shows what each person does: who replied to each review and when.',
    nuevoCta: 'See my team →',
    nuevoDesconocido: 'If you do not recognise this person, remove their access from that same screen.',

    salidaAsunto: (cuenta) => `You no longer have access to ${cuenta} on Notoria`,
    salidaTitulo: 'Your access was closed',
    salidaIntro: (cuenta) => `The owner of <strong>${cuenta}</strong> removed your access to that account on Notoria.`,
    salidaPersonal: 'Your personal account is untouched: you can sign in and, if you want, monitor your own business for free.',
    salidaCta: 'Sign in to Notoria →',
  },
};

const textosCuenta = (usuario) => CUENTA[usuario?.idioma] || CUENTA.es;
const textosEquipo = (idioma) => EQUIPO_T[idioma] || EQUIPO_T.es;

const enviarBienvenida = async (usuario) => {
  console.log('[Email] Enviando bienvenida a:', usuario.email);
  const t = textosCuenta(usuario);
  const nombre = esc(usuario.nombre.split(' ')[0]);
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: t.bienvenidaAsunto(usuario.nombre.split(' ')[0]),
    html: base(`
      ${h1(t.bienvenidaTitulo(nombre))}
      ${p(t.bienvenidaIntro)}
      ${hr()}
      ${t.bienvenidaPasos.map((s,i)=>`<div style="display:flex;gap:10px;margin-bottom:8px;"><span style="color:#0B7324;font-weight:700;">${i+1}.</span><p style="color:#5C5B57;font-size:13px;margin:0;line-height:1.5;">${s}</p></div>`).join('')}
      ${hr()}
      ${btn(t.irPanel, `${FRONT()}/dashboard`)}
    `),
  });
  console.log('[Email] Bienvenida resultado:', JSON.stringify(res));
  return res;
};

// ── 2. Verificación de email ──────────────────────────────
// Verificación de correo. Tiene DOS formas: la del registro y el RECORDATORIO
// que manda el cron a quien nunca lo confirmó.
//
// 🔴 El recordatorio no repite «confirma tu correo» y ya. Dice lo que la persona
// se está perdiendo, porque ese es el hecho que mueve a hacer clic una semana
// después: mientras la cuenta no esté verificada NO le sale absolutamente nada
// de Notoria — el drip de onboarding lleva `emailVerificado: true` en su `where`,
// así que esas cuentas quedan fuera de todo. Foto del 2026-08-23: 4 de 11
// usuarios sin verificar, dos de ellos desde hacía 49 días, sin haber recibido
// una sola palabra desde el correo del registro.
const VERIFICACION = {
  es: {
    asunto: 'Confirma tu email — Notoria',
    asuntoRecordatorio: 'Tu cuenta de Notoria sigue sin activar',
    titulo: 'Confirma tu correo electrónico',
    tituloRecordatorio: 'Tu cuenta sigue sin activar',
    intro: 'Haz clic en el botón para activar tu cuenta de Notoria:',
    introRecordatorio: (dias) => `Creaste tu cuenta hace ${dias} ${dias === 1 ? 'día' : 'días'} y todavía no confirmaste tu correo. Mientras siga así <strong>no podemos avisarte de nada</strong>: si mañana aparece una reseña de 1★ en tu negocio, el aviso no te va a llegar.`,
    cta: 'Confirmar mi email →',
    ctaRecordatorio: 'Activar mi cuenta →',
    ignora: 'Si no creaste una cuenta en Notoria, ignora este mensaje. El enlace expira en 24 horas.',
    copiar: 'Si el botón no funciona, copia este enlace:',
  },
  en: {
    asunto: 'Confirm your email — Notoria',
    asuntoRecordatorio: 'Your Notoria account is still inactive',
    titulo: 'Confirm your email address',
    tituloRecordatorio: 'Your account is still inactive',
    intro: 'Click the button to activate your Notoria account:',
    introRecordatorio: (dias) => `You created your account ${dias} ${dias === 1 ? 'day' : 'days'} ago and still haven't confirmed your email. Until you do, <strong>we can't alert you about anything</strong>: if a 1★ review shows up on your business tomorrow, the alert won't reach you.`,
    cta: 'Confirm my email →',
    ctaRecordatorio: 'Activate my account →',
    ignora: "If you didn't create a Notoria account, ignore this message. The link expires in 24 hours.",
    copiar: "If the button doesn't work, copy this link:",
  },
};

/**
 * @param {object} usuario
 * @param {string} token
 * @param {{ recordatorio?: boolean, diasDesdeRegistro?: number }} [opciones]
 */
const enviarVerificacion = async (usuario, token, opciones = {}) => {
  const { recordatorio = false, diasDesdeRegistro = 0 } = opciones;
  const t = VERIFICACION[usuario.idioma] || VERIFICACION.es;
  console.log(`[Email] Enviando ${recordatorio ? 'RECORDATORIO de ' : ''}verificación a:`, usuario.email, '| token:', token.slice(0,8)+'...');
  const url = `${FRONT()}/verificar-email?token=${token}`;
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: recordatorio ? t.asuntoRecordatorio : t.asunto,
    html: base(`
      ${h1(recordatorio ? t.tituloRecordatorio : t.titulo)}
      ${p(recordatorio ? t.introRecordatorio(diasDesdeRegistro) : t.intro)}
      ${btn(recordatorio ? t.ctaRecordatorio : t.cta, url)}
      ${hr()}
      <p style="color:#9C9B96;font-size:12px;margin:0;">${t.ignora}</p>
      <p style="color:#9C9B96;font-size:12px;margin:8px 0 0;">${t.copiar} <br><a href="${url}" style="color:#0B7324;word-break:break-all;">${url}</a></p>
    `),
  });
  console.log('[Email] Verificación resultado:', JSON.stringify(res));
  return res;
};

// ── 3. Confirmación cambio de contraseña ─────────────────
const enviarConfirmacionContrasena = async (usuario) => {
  console.log('[Email] Enviando confirmación contraseña a:', usuario.email);
  const t = textosCuenta(usuario);
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: t.cambiadaAsunto,
    html: base(`
      ${h1(t.cambiadaTitulo)}
      ${p(t.cambiadaIntro(esc(usuario.email)))}
      <div style="background:#FAF9F5;border-left:3px solid #B74040;padding:12px 16px;margin:14px 0;">
        <p style="color:#B74040;font-size:13px;font-weight:600;margin:0 0 4px;">${t.noFuiste}</p>
        <p style="color:#5C5B57;font-size:13px;margin:0;">${t.escribenos('hola@usenotoria.app')}</p>
      </div>
      ${btn(t.irCuenta, `${FRONT()}/dashboard/configuracion`)}
    `),
  });
  console.log('[Email] Contraseña resultado:', JSON.stringify(res));
  return res;
};

// ── 3b. Recuperación de contraseña ("olvidé mi contraseña") ──
const enviarRecuperacionContrasena = async (usuario, token) => {
  console.log('[Email] Enviando recuperación de contraseña a:', usuario.email);
  const t = textosCuenta(usuario);
  const url = `${FRONT()}/resetear-password?token=${token}`;
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: t.resetAsunto,
    html: base(`
      ${h1(t.resetTitulo)}
      ${p(t.resetIntro(esc(usuario.email)))}
      ${btn(t.resetCta, url)}
      ${hr()}
      <p style="color:#9C9B96;font-size:12px;margin:0;">${t.resetIgnora}</p>
      <p style="color:#9C9B96;font-size:12px;margin:8px 0 0;">${t.copiar} <br><a href="${url}" style="color:#0B7324;word-break:break-all;">${url}</a></p>
    `),
  });
  console.log('[Email] Recuperación resultado:', JSON.stringify(res));
  return res;
};

// ── 4. Alerta crítica ─────────────────────────────────────
// ── Textos del correo de alerta ───────────────────────────
//
// Este es, desde el 2026-08-22, el correo que MÁS reciben los clientes: hasta
// entonces las alertas eran agregadas y casi nunca saltaban, así que un texto
// genérico bastaba. Ahora una reseña de 1★ avisa en el momento, y el asunto
// «Alerta en X — Notoria» con un cuerpo que empieza por «Detectamos actividad
// inusual» tiene dos problemas: no dice qué pasó, así que el dueño no puede
// decidir si abrirlo ahora o luego —y el producto entero se vende por el tiempo
// de reacción—, y además es falso: una reseña de 1★ es mala noticia, no una
// anomalía estadística.
//
// Bilingüe como el drip, y por el mismo motivo que se arreglaron las alertas del
// panel: con la interfaz en inglés, un correo en español canta.
const ALERTA = {
  es: {
    asunto: (negocio) => `Alerta en ${negocio} — Notoria`,
    titulo: 'Alerta de reputación detectada',
    intro: (negocio) => `Esto acaba de pasar en <strong>${negocio}</strong>:`,
    cta: 'Ver en Notoria →',
    asuntoResena: (r, negocio) => `Reseña de ${r}★ en ${negocio}`,
    tituloResena: (r) => `Una reseña de ${r}★ acaba de aparecer`,
    introResena: (autor) => `${autor} escribió en tu ficha de Google:`,
    introResenaSinTexto: (autor) => `${autor} calificó tu negocio en Google, sin dejar comentario.`,
    ctaResena: 'Responder ahora →',
    notaResena: 'Responder el mismo día cambia lo que ven los siguientes clientes.',
    sospecha: 'Además, esta reseña tiene señales de no ser auténtica.',
    // ── La evidencia, y por qué va en ESTE correo ────────────────────────────
    // Si detrás de la 1★ hay alguien pidiendo plata, la ventana en que la prueba
    // existe se mide en horas: el dueño bloquea a esa persona y borra el único
    // rastro de que hubo una exigencia. Este correo llega justo en esa ventana,
    // así que es el único sitio donde decirlo sirve de algo.
    evidenciaTitulo: '¿Te escribieron pidiendo algo a cambio de quitarla?',
    evidenciaTexto: 'No bloquees a esa persona todavía: al hacerlo borras la prueba. Notoria ya guardó el texto de la reseña y la fecha en que la capturó, aunque después la editen o la borren.',
    evidenciaCtaExpediente: 'Armar el expediente',
    evidenciaCtaGuia: 'Qué hacer paso a paso',
    // El diagnóstico. Llega del worker como NÚMEROS y un id de tema; la frase se
    // arma acá, en el idioma del usuario. Nunca al revés.
    diagTemas: { demora:'demora', trato:'el trato del personal', temperatura:'comida fría o mal cocida', limpieza:'limpieza', precio:'precio', porcion:'el tamaño de la porción' },
    diagPatron: (v, de, tema) => `<strong>${v} de las últimas ${de}</strong> reseñas negativas mencionan ${tema}.`,
    diagPendientes: (n) => n === 1 ? 'Hay 1 reseña crítica más sin responder.' : `Hay ${n} reseñas críticas más sin responder.`,
  },
  en: {
    asunto: (negocio) => `Alert on ${negocio} — Notoria`,
    titulo: 'Reputation alert',
    intro: (negocio) => `This just happened at <strong>${negocio}</strong>:`,
    cta: 'View in Notoria →',
    asuntoResena: (r, negocio) => `${r}★ review on ${negocio}`,
    tituloResena: (r) => `A ${r}★ review just came in`,
    introResena: (autor) => `${autor} wrote on your Google listing:`,
    introResenaSinTexto: (autor) => `${autor} rated your business on Google, with no comment.`,
    ctaResena: 'Reply now →',
    notaResena: 'Replying the same day changes what your next customers see.',
    sospecha: 'It also shows signs of not being genuine.',
    evidenciaTitulo: 'Did someone message you asking for something to take it down?',
    evidenciaTexto: 'Do not block them yet — blocking deletes the evidence. Notoria already saved the review text and the date it captured it, even if it is later edited or removed.',
    evidenciaCtaExpediente: 'Build the case file',
    evidenciaCtaGuia: 'Step-by-step guide',
    diagTemas: { demora:'delays', trato:'staff attitude', temperatura:'cold or undercooked food', limpieza:'cleanliness', precio:'price', porcion:'portion size' },
    diagPatron: (v, de, tema) => `<strong>${v} of the last ${de}</strong> negative reviews mention ${tema}.`,
    diagPendientes: (n) => n === 1 ? 'There is 1 more critical review awaiting a reply.' : `There are ${n} more critical reviews awaiting a reply.`,
  },
};

const enviarAlertaCritica = async (usuario, negocio, alerta) => {
  console.log('[Email] Enviando alerta crítica a:', usuario.email);
  const t = ALERTA[usuario.idioma] || ALERTA.es;
  const d = alerta.detalle;
  const enlace = (tab) => `${FRONT()}/dashboard/negocios/${negocio.id}?tab=${tab}`;

  // La plantilla específica pide sus piezas, igual que `web/src/lib/alertas.js`.
  // Sin ellas se cae al texto genérico, que es correcto aunque sea impersonal.
  // Eso NO es un caso raro: por `RESENA_MUY_NEGATIVA` pasan también la escalación
  // de las 24h y el aviso de token de Facebook expirado, y ninguno trae `detalle`
  // — a los dos les corresponde el genérico, con la descripción que ya traen.
  const esResena = alerta.tipo === 'RESENA_MUY_NEGATIVA' && d && d.rating;

  // El enlace a ESA reseña, no a la pestaña. `detalle.resenaId` ya se guardaba
  // desde que existe la alerta (monitoreo.worker.js), solo que nadie lo usaba.
  // Sin él se cae a la pestaña, que es lo que había antes.
  const enlaceResena = esResena && d.resenaId
    ? `${enlace('resenas')}&resena=${encodeURIComponent(d.resenaId)}`
    : enlace('resenas');

  // El contexto que convierte «llegó una reseña de 1★» en algo accionable: si
  // esa queja ya se venía repitiendo, y cuántas críticas quedan sin contestar.
  //
  // ⚠️ Todo esto es OPCIONAL. Sin `diagnostico` el correo sale exactamente igual
  // que antes: es una mejora del aviso, y una mejora no puede ser la razón por la
  // que un cliente no se entera de que le cayó una reseña de 1★.
  const diag = esResena && d.diagnostico ? d.diagnostico : null;
  const lineasDiag = [];
  if (diag?.patron?.tema && t.diagTemas[diag.patron.tema]) {
    lineasDiag.push(t.diagPatron(diag.patron.veces, diag.patron.deCuantas, t.diagTemas[diag.patron.tema]));
  }
  if (diag?.sinResponder > 0) lineasDiag.push(t.diagPendientes(diag.sinResponder));

  // Los textos de arriba los escribimos nosotros y llevan <strong> a propósito,
  // así que NO se escapan. Lo que sí viene de fuera —el tema— es un id cerrado
  // que ya pasó por el diccionario, no texto libre del autor de la reseña.
  const bloqueDiag = lineasDiag.length
    ? `<div style="background:#FFF8E6;border:1px solid #F0E0B0;border-radius:6px;padding:12px 16px;margin:12px 0;">
        <p style="color:#141413;font-size:13.5px;margin:0;line-height:1.6;">${lineasDiag.join(' ')}</p>
      </div>`
    : '';

  // ── El expediente, ofrecido donde la evidencia todavía existe ──────────────
  //
  // 🔴 Notoria sabía armar el expediente desde el 2026-08-25 y NO lo mencionaba
  // en ninguna parte fuera del panel: `expediente` daba cero coincidencias en
  // emails.js, alerts/ y workers/. O sea que la función existía para quien ya
  // estaba adentro buscándola, y el dueño que acababa de recibir la 1★ no se
  // enteraba de que la tenía.
  //
  // Va en ESTE correo y no en otro porque la ventana en que la prueba existe se
  // mide en horas: el reflejo del dueño chantajeado es bloquear a esa persona, y
  // al bloquearla borra el único rastro de que hubo una exigencia de dinero.
  //
  // ⚠️ Se muestra en TODA reseña de ≤2★, no solo en las que el detector marcó.
  // Una extorsión típica es una sola 1★ desde una cuenta que parece normal: no
  // levanta ninguna señal, así que condicionarlo a `motivoSospecha` lo apagaría
  // justo en el caso para el que existe.
  //
  // ⚠️ Por eso mismo va como bloque SECUNDARIO y redactado como pregunta: al
  // dueño al que no lo extorsionaron no le afirma nada. Un aviso que da por hecho
  // algo que no pasó, repetido, es lo que enseña a ignorar los correos.
  //
  // ⚠️ El enlace del expediente NO puede ir al PDF: esa ruta va tras `autenticar`
  // y un correo no lleva token. Lleva a la reseña dentro del panel, donde está el
  // botón — y por eso hizo falta que la ficha honre `?tab=` y `?resena=`.
  const bloqueEvidencia = esResena
    ? `<div style="border:1px solid #E8E6DC;border-radius:6px;padding:14px 18px;margin:18px 0 0;">
        <p style="color:#141413;font-size:13.5px;font-weight:700;margin:0 0 6px;">${t.evidenciaTitulo}</p>
        <p style="color:#5C5B57;font-size:13px;line-height:1.65;margin:0 0 10px;">${t.evidenciaTexto}</p>
        <a href="${enlaceResena}" style="color:#0B7324;font-size:13px;font-weight:700;text-decoration:none;">${t.evidenciaCtaExpediente} →</a>
        <span style="color:#C9C7BF;font-size:13px;padding:0 8px;">·</span>
        <a href="${FRONT()}/blog/extorsion-con-resenas-que-hacer" style="color:#0B7324;font-size:13px;font-weight:700;text-decoration:none;">${t.evidenciaCtaGuia} →</a>
      </div>`
    : '';

  const { subject, html } = esResena
    ? {
      subject: t.asuntoResena(d.rating, negocio.nombre),
      html: base(`
      ${h1(t.tituloResena(d.rating))}
      ${p(d.texto
        ? t.introResena(`<strong>${esc(d.autor || (usuario.idioma === 'en' ? 'A customer' : 'Un cliente'))}</strong>`)
        : t.introResenaSinTexto(`<strong>${esc(d.autor || (usuario.idioma === 'en' ? 'A customer' : 'Un cliente'))}</strong>`))}
      ${d.texto ? `<div style="background:#FAF9F5;border-left:3px solid #B74040;border-radius:0 6px 6px 0;padding:14px 18px;margin:12px 0;">
        <p style="color:#141413;font-size:15px;margin:0;line-height:1.6;font-style:italic;">“${esc(d.texto)}”</p>
      </div>` : ''}
      ${d.motivoSospecha ? p(`<span style="color:#B74040;">${t.sospecha}</span>`) : ''}
      ${bloqueDiag}
      ${btn(t.ctaResena, enlaceResena)}
      <p style="color:#9C9B96;font-size:12px;margin:10px 0 0;">${t.notaResena}</p>
      ${bloqueEvidencia}
    `),
    }
    : {
      subject: t.asunto(negocio.nombre),
      html: base(`
      ${h1(t.titulo)}
      ${p(t.intro(esc(negocio.nombre)))}
      <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:14px 18px;margin:12px 0;">
        <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">${esc(alerta.tipo?.replace(/_/g," "))}</p>
        <p style="color:#141413;font-size:14px;margin:0;line-height:1.6;">${esc(alerta.descripcion)}</p>
      </div>
      ${btn(t.cta, enlace('alertas'))}
    `),
    };

  const res = await getResend().emails.send({ from: FROM(), to: usuario.email, subject, html });
  console.log('[Email] Alerta resultado:', JSON.stringify(res));
  return res;
};

// ── 5. Resumen periódico de alertas (frecuencia semanal/mensual) ──
// ⚠️ `periodo` es un VALOR ('semanal' | 'mensual'), no un texto ya redactado.
// Antes se interpolaba tal cual en el asunto y en el cuerpo, así que un usuario
// en inglés leía «Tu resumen semanal de alertas». Es la regla de §11: lo que
// lleva idioma se compone donde se conoce el idioma, y del llamador solo viaja
// el valor.
const enviarResumenAlertas = async (usuario, alertas, periodo) => {
  const t = textosResumen(usuario);
  const per = t.periodo[periodo] || periodo;
  const r = getResend();
  const porNegocio = {};
  for (const a of alertas) {
    const nombre = a.negocio?.nombre || (usuario?.idioma === 'en' ? 'Your business' : 'Tu negocio');
    (porNegocio[nombre] = porNegocio[nombre] || []).push(a);
  }
  const bloques = Object.entries(porNegocio).map(([nombre, lista]) => `
    <p style="color:#141413;font-size:14px;font-weight:700;margin:14px 0 6px;">${esc(nombre)} (${lista.length})</p>
    ${lista.slice(0, 10).map(a => `
      <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:10px 14px;margin-bottom:6px;">
        <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 3px;">${esc(a.tipo?.replace(/_/g, " "))}</p>
        <p style="color:#5C5B57;font-size:13px;margin:0;line-height:1.5;">${esc(a.descripcion)}</p>
      </div>`).join('')}
  `).join('');

  // El lote no es un periodo: es «se juntaron N reseñas». Tiene su propio asunto
  // y su propia explicación al pie — ver la nota de `asuntoLote` en RESUMEN.
  const esLote = periodo === 'lote';
  const nombrePila = esc(usuario.nombre?.split(' ')[0] || '');

  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: esLote ? t.asuntoLote(alertas.length) : t.asuntoAlertas(per),
    html: base(`
      ${h1(esLote ? t.tituloLote(alertas.length) : t.tituloAlertas(per))}
      ${p(esLote ? t.saludoLote(nombrePila) : t.saludoAlertas(nombrePila))}
      ${bloques}
      ${btn(t.verAlertas, `${FRONT()}/dashboard/alertas`)}
      <p style="color:#9C9B96;font-size:11px;margin:10px 0 0;">${esLote ? t.porQueLote(alertas.length) : t.porQue(periodo)}</p>
    `),
  });
  return res;
};

// ── 6. Resumen semanal de rating/reseñas (cron domingo 8am Lima) ──
// Gratis: solo cifras crudas (sin `datos.insight`). Negocio/Franquicia: incluye
// el insight generado con IA (`datos.insight`) sobre las reseñas de la semana.
const flechaVariacion = (variacion) => variacion > 0 ? '▲' : variacion < 0 ? '▼' : '—';
const colorVariacion  = (variacion) => variacion > 0 ? '#0B7324' : variacion < 0 ? '#B74040' : '#9C9B96';

// Textos de los tres correos de resumen (semanal por negocio, semanal
// consolidado y el digest de alertas).
//
// 🔴 Eran solo español hasta el 2026-08-23, y el semanal es **el correo que más
// manda el producto**: 38 envíos en el historial de Resend, más que ningún otro.
// El fallo tenía las dos mitades que ya conocemos: la plantilla sin traducir Y
// el `select` del worker sin `idioma` (mismo caso que las alertas, §12). Por eso
// se arreglan juntas: traducir la plantilla sin tocar la consulta no habría
// cambiado ni un correo.
const RESUMEN = {
  es: {
    // 🔴 El periodo entra por parámetro desde el 2026-09-09: la cadencia por
    // defecto pasó a MENSUAL y estos textos decían «semanal» y «esta semana» a
    // pelo. Un correo mensual con la palabra «semanal» impresa y las cifras de 30
    // días es peor que uno feo: el cliente lee un número que no cuadra con la
    // frase y deja de creerse el resto del correo. Ver lib/prefsCorreo.js.
    asuntoSemanal: (n, per) => `Tu resumen ${per} de ${n} — Notoria`,
    tituloSemanal: (per) => `Tu resumen ${per}`,
    saludo: (nombre, per) => `Hola <strong>${nombre}</strong>, esto pasó ${per === 'mensual' ? 'este mes' : 'esta semana'} en tu reputación:`,
    ratingActual: 'Rating actual',
    variacion: (dias) => `Variación ${dias} días`,
    resenasNuevas: 'Reseñas nuevas',
    score: 'Score',
    // ⚠️ Los datos van como VALORES y la frase se compone acá: es la regla que
    // dejaron las invitaciones de equipo y el digest de alertas. El backend
    // manda `veces` y `porcentaje`, nunca «4 de 10 mencionan demora» ya escrito.
    temaSemana: (etiqueta, veces, pct, per) =>
      `Lo que más mencionaron: <strong>${etiqueta}</strong> — ${veces} de las reseñas con texto de ${per === 'mensual' ? 'este mes' : 'esta semana'} (${pct}%).`,
    temaSube: (etiqueta, per) => `Y va en aumento respecto ${per === 'mensual' ? 'al mes pasado' : 'a la semana pasada'}: <strong>${etiqueta}</strong>.`,
    // ── Competencia ─────────────────────────────────────────────────────────
    // 🔴 Los DATOS viajan como números y la frase se compone acá, igual que el
    // tema. Y siempre en SEGUNDA persona sobre hechos, nunca «te están ganando»:
    // el dato es cuántas reseñas ganó cada uno este mes, no un veredicto.
    //
    // ⚠️ Dice «este mes» aunque el resumen sea semanal, y es deliberado: la
    // comparación es mes contra mes (`lib/progreso.js`) porque un rating de
    // competidor no se mueve en siete días — está medido. Escribir «esta semana»
    // sobre una cifra mensual sería el bug de la palabra «semanal» otra vez.
    compTitulo: 'Tu competencia este mes',
    compResenas: (rival, suyas, mias) =>
      `<strong>${rival}</strong> sumó <strong>${suyas}</strong> reseñas este mes; tú ${mias}.`,
    compRating: (rival, delta, final) =>
      `<strong>${rival}</strong> subió <strong>${delta.toFixed(1)}</strong> puntos de rating este mes (va en ${final.toFixed(1)}★).`,
    compAyuda: 'Sale del historial que Notoria ya guarda de los competidores que tú elegiste.',
    parteTitulo: 'Para el grupo de tu equipo',
    parteAyuda: 'Son ellos los que pueden cambiar lo que dicen las reseñas. Repásalo antes de enviarlo: lo va a leer tu gente.',
    // 🔴 El último tramo, que faltaba: del dueño AL EQUIPO. El parte ya viajaba
    // en este correo, pero reenviarlo era copiar, abrir WhatsApp, elegir el grupo
    // y pegar — cuatro pasos, cada lunes, y el abandono del dueño está medido a
    // los veinte días. `wa.me/?text=` abre WhatsApp con el texto ya escrito y el
    // dueño solo elige el grupo. Es una URL: ni integración con Meta, ni permisos,
    // ni aprobación.
    parteCompartir: 'Enviarlo por WhatsApp →',
    promoIa: (url) => `El plan Negocio incluye un análisis con IA de qué mencionan tus clientes cada semana. <a href="${url}" style="color:#0B7324;">Conoce más →</a>`,
    verPanel: 'Ver panel de control →',
    asuntoConsolidado: (n, per) => `Tu resumen ${per} consolidado (${n} locales) — Notoria`,
    tituloConsolidado: (per) => `Tu resumen ${per} — todos tus locales`,
    saludoConsolidado: (nombre, n) => `Hola <strong>${nombre}</strong>, este es el resumen ejecutivo de tus ${n} negocios:`,
    // El periodo llega como VALOR ('semanal' | 'mensual'), no como texto ya
    // redactado: es la regla de §11 — lo que lleva idioma se compone acá.
    periodo: { semanal: 'semanal', mensual: 'mensual' },
    asuntoAlertas: (per) => `Tu resumen ${per} de alertas — Notoria`,
    tituloAlertas: (per) => `Resumen ${per} de alertas`,
    saludoAlertas: (nombre) => `Hola <strong>${nombre}</strong>, esto es lo que Notoria detectó en el período:`,
    verAlertas: 'Ver todo en el panel →',
    porQue: (per) => `Recibes este resumen porque configuraste alertas ${per === 'mensual' ? 'mensuales' : 'semanales'}. Puedes cambiarlo en Alertas → Configurar notificaciones.`,
    // ── El correo agrupado por lote (ver lib/prefsCorreo.js) ──
    // 🔴 Tiene asunto y explicación PROPIOS y no reutiliza los de arriba: con
    // `periodo: 'lote'` el asunto habría salido «Tu resumen lote de alertas»,
    // que no es una frase. Y el pie tiene que decir por qué llega agrupado, o el
    // cliente cree que se perdió cuatro avisos.
    asuntoLote: (n) => `${n} reseñas nuevas necesitan tu atención — Notoria`,
    tituloLote: (n) => `${n} reseñas nuevas`,
    saludoLote: (nombre) => `Hola <strong>${nombre}</strong>, esto es lo que llegó desde el último aviso:`,
    porQueLote: (n) => `Te mandamos un solo correo por cada ${n} reseñas para no llenarte la bandeja. Si prefieres un aviso por cada reseña, cámbialo en Alertas → Configurar notificaciones.`,
  },
  en: {
    asuntoSemanal: (n, per) => `Your ${per} summary for ${n} — Notoria`,
    tituloSemanal: (per) => `Your ${per} summary`,
    saludo: (nombre, per) => `Hi <strong>${nombre}</strong>, here is what happened to your reputation this ${per === 'mensual' ? 'month' : 'week'}:`,
    ratingActual: 'Current rating',
    variacion: (dias) => `${dias}-day change`,
    resenasNuevas: 'New reviews',
    score: 'Score',
    temaSemana: (etiqueta, veces, pct, per) =>
      `Most mentioned: <strong>${etiqueta}</strong> — ${veces} of this ${per === 'mensual' ? 'month' : 'week'}'s reviews with text (${pct}%).`,
    temaSube: (etiqueta, per) => `And it is growing compared to last ${per === 'mensual' ? 'month' : 'week'}: <strong>${etiqueta}</strong>.`,
    compTitulo: 'Your competition this month',
    compResenas: (rival, suyas, mias) =>
      `<strong>${rival}</strong> gained <strong>${suyas}</strong> reviews this month; you gained ${mias}.`,
    compRating: (rival, delta, final) =>
      `<strong>${rival}</strong> gained <strong>${delta.toFixed(1)}</strong> rating points this month (now at ${final.toFixed(1)}★).`,
    compAyuda: 'It comes from the history Notoria already keeps on the competitors you chose.',
    parteTitulo: 'For your team group chat',
    parteAyuda: 'They are the ones who can change what the reviews say. Read it over before sending: your staff will read it.',
    parteCompartir: 'Send it on WhatsApp →',
    promoIa: (url) => `The Business plan includes a weekly AI analysis of what your customers mention. <a href="${url}" style="color:#0B7324;">Learn more →</a>`,
    verPanel: 'Open dashboard →',
    asuntoConsolidado: (n, per) => `Your ${per} summary across ${n} locations — Notoria`,
    tituloConsolidado: (per) => `Your ${per} summary — all your locations`,
    saludoConsolidado: (nombre, n) => `Hi <strong>${nombre}</strong>, here is the executive summary of your ${n} businesses:`,
    periodo: { semanal: 'weekly', mensual: 'monthly' },
    asuntoAlertas: (per) => `Your ${per} alert summary — Notoria`,
    tituloAlertas: (per) => `${per.charAt(0).toUpperCase()}${per.slice(1)} alert summary`,
    saludoAlertas: (nombre) => `Hi <strong>${nombre}</strong>, this is what Notoria detected during the period:`,
    verAlertas: 'See everything in the dashboard →',
    porQue: (per) => `You get this summary because you set alerts to ${per === 'mensual' ? 'monthly' : 'weekly'}. You can change it in Alerts → Notification settings.`,
    asuntoLote: (n) => `${n} new reviews need your attention — Notoria`,
    tituloLote: (n) => `${n} new reviews`,
    saludoLote: (nombre) => `Hi <strong>${nombre}</strong>, here is what came in since the last alert:`,
    porQueLote: (n) => `We send one email per ${n} reviews so we do not flood your inbox. If you would rather get an alert for every review, change it in Alerts → Notification settings.`,
  },
};

const textosResumen = (usuario) => RESUMEN[usuario?.idioma] || RESUMEN.es;

const bloqueCifrasNegocio = (negocio, d, t = RESUMEN.es, periodo = 'semanal') => `
  <p style="color:#141413;font-size:14px;font-weight:700;margin:14px 0 8px;">${esc(negocio.nombre)}</p>
  <div style="display:flex;gap:10px;margin-bottom:${d.insight || d.tema ? '10px' : '4px'};">
    <div style="flex:1;background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;text-align:center;">
      <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">${t.ratingActual}</p>
      <p style="color:#141413;font-size:20px;font-weight:800;margin:0;">${d.ratingActual?.toFixed(1) ?? '—'}★</p>
    </div>
    <div style="flex:1;background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;text-align:center;">
      <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">${t.variacion(periodo === 'mensual' ? 30 : 7)}</p>
      <p style="color:${colorVariacion(d.variacion)};font-size:20px;font-weight:800;margin:0;">${flechaVariacion(d.variacion)} ${Math.abs(d.variacion ?? 0).toFixed(1)}</p>
    </div>
    <div style="flex:1;background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;text-align:center;">
      <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">${t.resenasNuevas}</p>
      <p style="color:#141413;font-size:20px;font-weight:800;margin:0;">${d.resenasNuevas ?? 0}</p>
    </div>
    ${d.score != null ? `
    <div style="flex:1;background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;text-align:center;">
      <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">${t.score}</p>
      <p style="color:#141413;font-size:20px;font-weight:800;margin:0;">${d.score}</p>
    </div>` : ''}
  </div>
  ${d.tema ? `
  <p style="color:#141413;font-size:13px;margin:0 0 8px;line-height:1.6;">
    ${t.temaSemana(esc(d.tema.etiqueta), d.tema.veces, d.tema.porcentaje, periodo)}
    ${d.tendenciaTema && d.tendenciaTema.etiqueta && d.tendenciaTema.etiqueta !== d.tema.etiqueta
      ? t.temaSube(esc(d.tendenciaTema.etiqueta), periodo) : ''}
  </p>` : ''}
  ${d.competencia ? `
  <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;margin:0 0 10px;">
    <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">${t.compTitulo}</p>
    <p style="color:#141413;font-size:13px;margin:0 0 6px;line-height:1.6;">
      ${d.competencia.motivo === 'RATING'
        ? t.compRating(esc(d.competencia.nombre), d.competencia.deltaRating, d.competencia.ratingFinal)
        : t.compResenas(esc(d.competencia.nombre), d.competencia.suyas, d.competencia.mias)}
    </p>
    <p style="color:#9C9B96;font-size:11px;margin:0;line-height:1.5;">${t.compAyuda}</p>
  </div>` : ''}
  ${d.insight ? `
  <div style="background:${'rgba(11,115,36,0.08)'};border-left:3px solid #0B7324;padding:10px 14px;margin-bottom:4px;">
    <p style="color:#141413;font-size:13px;margin:0;line-height:1.6;">${esc(d.insight)}</p>
  </div>` : ''}
  ${d.parte ? `
  <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;margin-top:10px;">
    <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">${t.parteTitulo}</p>
    <p style="color:#141413;font-size:13px;margin:0 0 8px;line-height:1.7;white-space:pre-line;">${esc(d.parte)}</p>
    <p style="color:#9C9B96;font-size:11px;margin:0 0 10px;line-height:1.5;">${t.parteAyuda}</p>
    <a href="https://wa.me/?text=${encodeURIComponent(d.parte)}" style="display:inline-block;background:#0B7324;color:#fff;text-decoration:none;padding:9px 16px;border-radius:5px;font-weight:700;font-size:13px;">${t.parteCompartir}</a>
  </div>` : ''}
`;

// `periodo` llega como VALOR ('semanal' | 'mensual') y la frase se compone acá.
// Por defecto 'semanal' para no cambiar el comportamiento de ningún llamador que
// no lo pase — hoy solo lo pasa el worker, que es quien sabe la cadencia.
const enviarResumenSemanal = async (usuario, negocio, datos, periodo = 'semanal') => {
  const t = textosResumen(usuario);
  const per = t.periodo[periodo] || t.periodo.semanal;
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: t.asuntoSemanal(negocio.nombre, per),
    html: base(`
      ${h1(t.tituloSemanal(per))}
      ${p(t.saludo(esc(usuario.nombre?.split(' ')[0] || ''), periodo))}
      ${bloqueCifrasNegocio(negocio, datos, t, periodo)}
      ${!datos.insight ? `<p style="color:#9C9B96;font-size:12px;margin:6px 0 0;">${t.promoIa(`${FRONT()}/dashboard/planes`)}</p>` : ''}
      ${hr()}
      ${btn(t.verPanel, `${FRONT()}/dashboard/negocios/${negocio.id}`)}
    `),
  });
  return res;
};

// Franquicia con más de 1 negocio activo: un solo email con el desglose por local
const enviarResumenSemanalConsolidado = async (usuario, negocios, resumenGlobal, periodo = 'semanal') => {
  const t = textosResumen(usuario);
  const per = t.periodo[periodo] || t.periodo.semanal;
  const r = getResend();
  const bloques = negocios.map((n) => bloqueCifrasNegocio(n.negocio, n.datos, t, periodo)).join(hr());
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: t.asuntoConsolidado(negocios.length, per),
    html: base(`
      ${h1(t.tituloConsolidado(per))}
      ${p(t.saludoConsolidado(esc(usuario.nombre?.split(' ')[0] || ''), negocios.length))}
      ${resumenGlobal ? `<div style="background:rgba(11,115,36,0.08);border-left:3px solid #0B7324;padding:12px 16px;margin-bottom:14px;"><p style="color:#141413;font-size:13px;margin:0;line-height:1.65;">${esc(resumenGlobal)}</p></div>` : ''}
      ${hr()}
      ${bloques}
      ${hr()}
      ${btn(t.verPanel, `${FRONT()}/dashboard`)}
    `),
  });
  return res;
};

// ── Comprobante de pago ───────────────────────────────────
// Envía el PDF del comprobante al cliente y, si EMAIL_CONTABILIDAD está
// configurado, una copia a la empresa para el control tributario mensual.
// La copia va como envío aparte (no BCC) para que el buzón contable la reciba
// aunque el correo del cliente rebote.
const enviarComprobante = async ({ usuario, comprobante, pdf }) => {
  const r = getResend();
  const esVoucher = comprobante.tipo === 'VOUCHER';
  const etiqueta = esVoucher ? 'Constancia de pago' : comprobante.tipo === 'BOLETA' ? 'Boleta de venta' : 'Factura';
  const monto = `${comprobante.moneda === 'USD' ? 'USD' : 'S/'} ${(comprobante.total / 100).toFixed(2)}`;
  const adjunto = [{ filename: `${etiqueta.replace(/ /g, '-')}-${comprobante.numero}.pdf`, content: pdf.toString('base64') }];

  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: `${etiqueta} ${comprobante.numero} — Notoria`,
    html: base(`
      ${h1(`${etiqueta} ${comprobante.numero}`)}
      ${p(`Hola <strong>${usuario.nombre?.split(' ')[0] || ''}</strong>, adjuntamos el comprobante de tu pago de <strong>${monto}</strong>.`)}
      ${p(comprobante.descripcion)}
      ${hr()}
      ${btn('Ver mi facturación →', `${FRONT()}/dashboard/facturacion`)}
    `),
    attachments: adjunto,
  });

  const contable = process.env.EMAIL_CONTABILIDAD;
  if (contable) {
    await r.emails.send({
      from: FROM(), to: contable,
      subject: `[Copia] ${etiqueta} ${comprobante.numero} — ${comprobante.receptorNombre}`,
      html: base(`
        ${h1(`${etiqueta} ${comprobante.numero}`)}
        ${p(`Cliente: <strong>${comprobante.receptorNombre}</strong> (${comprobante.receptorNumDoc || 'sin documento'}, ${comprobante.receptorPais})`)}
        ${p(`Total: <strong>${monto}</strong> · IGV: ${(comprobante.igv / 100).toFixed(2)} · Tipo de operación: ${comprobante.tipoOperacion}`)}
        ${p(`Cuenta: ${usuario.email}`)}
      `),
      attachments: adjunto,
    }).catch((e) => console.error('[Email] No se pudo enviar la copia contable:', e.message));
  }

  return res;
};

// ── 10. Drip de onboarding ────────────────────────────────
// Tres correos que empujan al usuario nuevo hacia el momento de valor:
// etapa 1 (día 2) según su estado real, etapa 2 (día 5) con lo que Notoria ya
// vio de su negocio, etapa 3 (día 7) con la promo de bienvenida. El worker
// decide cuándo y a quién; acá solo vive el contenido.
const DRIP = {
  es: {
    sinNegocio: {
      asunto: (n) => `${n}, tu cuenta de Notoria sigue vacía`,
      cuerpo: () => `
        ${h1('Aún no vigilamos nada tuyo.')}
        ${p('Creaste tu cuenta hace un par de días, pero todavía no agregaste tu negocio. Mientras tanto, cualquier reseña falsa que te dejen pasa desapercibida.')}
        ${p('Agregarlo toma un minuto: lo buscas como en Google Maps y listo.')}
        ${btn('Agregar mi negocio →', `${FRONT()}/onboarding`)}`,
    },
    sinGbp: {
      asunto: () => 'Estás viendo solo 5 de tus reseñas',
      cuerpo: (negocio) => `
        ${h1('Te falta el paso que más cambia.')}
        ${p(`Google solo nos deja leer las 5 reseñas públicas más recientes de <strong>${negocio}</strong>. Conectando tu cuenta de Google Business (gratis, 1 minuto) desbloqueas el historial completo y puedes responder directo desde Notoria.`)}
        ${btn('Conectar Google Business →', `${FRONT()}/dashboard/conexiones`)}`,
    },
    valor: {
      asunto: (n) => `${n}, esto es lo que Notoria vigila por ti`,
      cuerpo: (stats) => `
        ${h1('Tu resumen de la primera semana.')}
        ${p(`Desde que llegaste, Notoria escaneó tu negocio de forma automática y registró <strong>${stats.resenas} reseña${stats.resenas === 1 ? '' : 's'}</strong>${stats.alertas > 0 ? ` y generó <strong>${stats.alertas} alerta${stats.alertas === 1 ? '' : 's'}</strong>` : ''} sin que tuvieras que hacer nada.`)}
        ${p('Cada escaneo revisa patrones de ataque: cuentas recién creadas, texto duplicado y picos de reseñas negativas.')}
        ${btn('Ver mi panel →', `${FRONT()}/dashboard`)}`,
    },
    promo: {
      asunto: () => 'Tu descuento de bienvenida vence pronto',
      cuerpo: () => `
        ${h1('50% de descuento tus primeros 2 meses.')}
        ${p('Por ser cuenta nueva, el plan Negocio te cuesta la mitad los primeros 2 meses: escaneo cada 4 horas, historial de 90 días, 100 usos de IA a la semana y reporte PDF mensual.')}
        ${p('La promo es exclusiva para cuentas recién creadas — después ya no aparece.')}
        ${btn('Ver planes →', `${FRONT()}/dashboard/planes`)}`,
    },
  },
  en: {
    sinNegocio: {
      asunto: (n) => `${n}, your Notoria account is still empty`,
      cuerpo: () => `
        ${h1('We are not watching anything for you yet.')}
        ${p('You created your account a couple of days ago but have not added your business. Meanwhile, any fake review posted about you goes unnoticed.')}
        ${p('It takes one minute: search it like on Google Maps and you are done.')}
        ${btn('Add my business →', `${FRONT()}/onboarding`)}`,
    },
    sinGbp: {
      asunto: () => 'You are only seeing 5 of your reviews',
      cuerpo: (negocio) => `
        ${h1('You are missing the step that matters most.')}
        ${p(`Google only lets us read the 5 most recent public reviews of <strong>${negocio}</strong>. Connect your Google Business account (free, 1 minute) to unlock the full history and reply right from Notoria.`)}
        ${btn('Connect Google Business →', `${FRONT()}/dashboard/conexiones`)}`,
    },
    valor: {
      asunto: (n) => `${n}, this is what Notoria watches for you`,
      cuerpo: (stats) => `
        ${h1('Your first-week summary.')}
        ${p(`Since you joined, Notoria scanned your business automatically and recorded <strong>${stats.resenas} review${stats.resenas === 1 ? '' : 's'}</strong>${stats.alertas > 0 ? ` and raised <strong>${stats.alertas} alert${stats.alertas === 1 ? '' : 's'}</strong>` : ''} without you lifting a finger.`)}
        ${p('Every scan checks for attack patterns: brand-new accounts, duplicated text and spikes of negative reviews.')}
        ${btn('Open my dashboard →', `${FRONT()}/dashboard`)}`,
    },
    promo: {
      asunto: () => 'Your welcome discount expires soon',
      cuerpo: () => `
        ${h1('50% off your first 2 months.')}
        ${p('As a new account, the Business plan costs half price for your first 2 months: scans every 4 hours, 90-day history, 100 AI uses per week and a monthly PDF report.')}
        ${p('The promo is exclusive to newly created accounts — it will not show up later.')}
        ${btn('See plans →', `${FRONT()}/dashboard/planes`)}`,
    },
  },
};

// tipo: 'sinNegocio' | 'sinGbp' | 'valor' | 'promo'. datos: string (nombre del
// negocio) para sinGbp, {resenas, alertas} para valor.
const enviarDrip = async (usuario, tipo, datos) => {
  const t = (DRIP[usuario.idioma] || DRIP.es)[tipo];
  const nombre = usuario.nombre.split(' ')[0];
  console.log(`[Email] Drip "${tipo}" a:`, usuario.email);
  const r = getResend();
  return r.emails.send({
    from: FROM(), to: usuario.email,
    subject: t.asunto(nombre),
    html: base(t.cuerpo(datos)),
  });
};

// ── Libro de Reclamaciones ────────────────────────────────
// El D.S. 101-2022-PCM obliga a entregar al consumidor una copia de su hoja de
// reclamación de forma inmediata. Como el libro es virtual, esa copia es este
// correo: por eso repite todos los datos declarados y no solo el número.
const filaHoja = (etiqueta, valor) =>
  `<tr><td style="padding:5px 10px 5px 0;color:#9C9B96;font-size:12px;vertical-align:top;white-space:nowrap;">${etiqueta}</td><td style="padding:5px 0;color:#141413;font-size:12px;">${valor}</td></tr>`;

// Todos los campos que vienen del formulario van escapados: el Libro de
// Reclamaciones es público y SIN AUTENTICACIÓN a propósito (la norma no permite
// exigir registro previo), así que cualquiera en internet puede escribir lo que
// quiera en estos campos y esta hoja se manda por correo al consumidor Y a la
// empresa. `numero` y `montoS` los genera Notoria, pero se escapan igual: la
// regla vale más si no tiene excepciones que haya que recordar.
const hojaHtml = (r) => `<table style="width:100%;border-collapse:collapse;">
  ${filaHoja('N° de hoja', `<strong>${esc(r.numero)}</strong>`)}
  ${filaHoja('Fecha', esc(new Date(r.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima' })))}
  ${filaHoja('Tipo', r.tipo === 'QUEJA' ? 'Queja' : 'Reclamo')}
  ${filaHoja('Consumidor', `${esc(r.nombre)} · ${esc(r.docTipo)} ${esc(r.documento)}`)}
  ${filaHoja('Domicilio', esc(r.domicilio))}
  ${filaHoja('Contacto', `${esc(r.email)} · ${esc(r.telefono)}`)}
  ${r.esMenor ? filaHoja('Apoderado', esc(r.apoderado)) : ''}
  ${filaHoja('Bien contratado', `${r.tipoBien === 'PRODUCTO' ? 'Producto' : 'Servicio'} — ${esc(r.descripcion)}`)}
  ${r.montoS ? filaHoja('Monto reclamado', `S/ ${esc((r.montoS / 100).toFixed(2))}`) : ''}
  ${filaHoja('Detalle', esc(r.detalle))}
  ${filaHoja('Pedido', esc(r.pedido))}
</table>`;

const enviarCargoReclamacion = async (r) => {
  const res = await getResend().emails.send({
    from: FROM(), to: r.email,
    subject: `Constancia de tu ${r.tipo === 'QUEJA' ? 'queja' : 'reclamo'} ${r.numero} — Notoria`,
    html: base(`
      ${h1('Recibimos tu reclamación')}
      ${p(`Registramos tu ${r.tipo === 'QUEJA' ? 'queja' : 'reclamo'} con el número <strong>${r.numero}</strong>. Guarda este correo: es tu constancia de presentación ante el Libro de Reclamaciones de Notoria.`)}
      ${p('Tenemos un plazo máximo de <strong>15 días hábiles</strong> para darte una respuesta, según el Código de Protección y Defensa del Consumidor (Ley 29571).')}
      ${hr()}
      ${hojaHtml(r)}
      ${hr()}
      ${p('Si necesitas agregar algo a tu reclamación, responde a este correo citando el número de hoja.')}
    `),
  });
  console.log('[Reclamaciones] Cargo enviado al consumidor:', r.numero);
  return res;
};

// Aviso al comercio. Va al correo de atención; sin él la reclamación queda
// igual guardada en la tabla y visible en base de datos.
const enviarAvisoReclamacionInterno = async (r) => {
  const destino = process.env.EMAIL_RECLAMACIONES || 'hola@usenotoria.app';
  const res = await getResend().emails.send({
    from: FROM(), to: destino,
    subject: `[Libro de Reclamaciones] ${r.numero} — ${r.tipo}`,
    html: base(`
      ${h1(`Nueva ${r.tipo === 'QUEJA' ? 'queja' : 'reclamación'}: ${r.numero}`)}
      ${p('Plazo legal de respuesta: <strong>15 días hábiles</strong> desde hoy.')}
      ${hr()}
      ${hojaHtml(r)}
    `),
  });
  console.log('[Reclamaciones] Aviso interno enviado a', destino, '—', r.numero);
  return res;
};

// Respuesta formal al consumidor. Es la que cierra el plazo de 15 días hábiles,
// así que repite el número de hoja y deja constancia de la fecha.
const enviarRespuestaReclamacion = async (r) => {
  const res = await getResend().emails.send({
    from: FROM(), to: r.email,
    subject: `Respuesta a tu ${r.tipo === 'QUEJA' ? 'queja' : 'reclamo'} ${r.numero} — Notoria`,
    html: base(`
      ${h1('Respuesta a tu reclamación')}
      ${p(`Hola ${r.nombre.split(' ')[0]}, esta es nuestra respuesta formal a la hoja <strong>${r.numero}</strong>, presentada el ${new Date(r.creadoEn).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}.`)}
      ${hr()}
      <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:14px 16px;">
        <p style="color:#141413;font-size:14px;line-height:1.75;margin:0;white-space:pre-wrap;">${r.respuesta}</p>
      </div>
      ${hr()}
      ${p('Si no estás conforme con esta respuesta, puedes acudir a otras vías de solución de controversias o presentar una denuncia ante el INDECOPI. La respuesta a tu reclamo no limita ese derecho.')}
      ${p('Para cualquier consulta, responde a este correo citando el número de hoja.')}
    `),
  });
  console.log('[Reclamaciones] Respuesta enviada al consumidor:', r.numero);
  return res;
};

// Aviso interno de plazos por vencer. Lo manda el cron diario: sin él, cumplir
// los 15 días hábiles dependería de que alguien se acuerde de mirar el libro.
// ── Aviso: hay un comprobante devuelto que sigue vivo ante SUNAT ──────────
//
// 🔴 Este es el correo que evita el único error del circuito de cobro que cuesta
// dinero de verdad. Reembolsar en Culqi NO anula el comprobante: el importe
// vuelve al cliente y la boleta sigue declarada, con su IGV a pagar. El plazo
// para anularla son 7 días y después ya no hay vuelta atrás — toca nota de
// crédito.
//
// Va en **modo urgente de verdad**, no solo con mayúsculas en el asunto:
// `X-Priority`, `Importance` y `X-MSMail-Priority` son las cabeceras que Gmail y
// Outlook usan para marcarlo. Un aviso con reloj corriendo que llega igual que
// cualquier resumen semanal se lee cuando ya es tarde.
//
// En español a propósito: va a contabilidad, no a un cliente.
const enviarAvisoAnulacionPendiente = async ({ comprobante, pago, diasRestantes, comando, primerAviso }) => {
  const destino = process.env.EMAIL_CONTABILIDAD;
  // 🔴 Sin destino, `return` silencioso — el mismo patrón que los otros cuatro
  // avisos contables. Es deliberado, pero conviene saber que apaga la función
  // entera: ver la nota de EMAIL_CONTABILIDAD en CLAUDE.md §3.
  if (!destino) {
    console.error('[Anulación] EMAIL_CONTABILIDAD sin definir: NADIE se enterará de que hay un comprobante por anular');
    return;
  }

  const vencido = diasRestantes < 0;
  const importe = `S/${(comprobante.total / 100).toFixed(2)}`;

  const res = await getResend().emails.send({
    from: FROM(), to: destino,
    subject: vencido
      ? `🔴 FUERA DE PLAZO — ${comprobante.numero} reembolsado y SIN ANULAR`
      : `🔴 URGENTE — anular ${comprobante.numero} (quedan ${diasRestantes} día${diasRestantes === 1 ? '' : 's'})`,
    // Las cabeceras que de verdad marcan el correo como prioritario.
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      Importance: 'high',
    },
    html: base(`
      ${h1(vencido ? 'Comprobante reembolsado FUERA DE PLAZO' : 'Hay que anular un comprobante')}
      <div style="background:#FEF2F2;border-left:4px solid #B91C1C;padding:14px 18px;margin:0 0 16px;">
        <p style="color:#B91C1C;font-size:14px;font-weight:700;margin:0 0 6px;">
          Se devolvió el dinero, pero el comprobante sigue vivo ante SUNAT.
        </p>
        <p style="color:#5C5B57;font-size:13px;margin:0;line-height:1.6;">
          Reembolsar en Culqi y anular ante SUNAT son dos cosas distintas. Mientras no se anule,
          esta operación cuenta como venta declarada y su IGV se paga.
        </p>
      </div>

      <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:14px 18px;margin-bottom:16px;">
        <p style="margin:0 0 4px;color:#141413;font-size:14px;font-weight:700;">${esc(comprobante.numero)} · ${comprobante.tipo}</p>
        <p style="margin:0;color:#5C5B57;font-size:13px;">Importe ${importe} · emitido el ${fechaLarga(comprobante.fechaEmision, 'es')}</p>
        <p style="margin:6px 0 0;color:#5C5B57;font-size:13px;">Cargo devuelto: <code>${esc(pago.culqiCargoId || '—')}</code></p>
        <p style="margin:6px 0 0;font-size:13px;font-weight:700;color:${vencido ? '#B91C1C' : '#B45309'};">
          ${vencido
            ? `El plazo venció hace ${Math.abs(diasRestantes)} día(s). Ya NO se puede anular: corresponde una nota de crédito.`
            : `Quedan ${diasRestantes} día(s) del plazo de 7.`}
        </p>
      </div>

      ${vencido ? '' : `${p('Para anularlo, desde <code>brand-shield/</code>:')}
      <div style="background:#141413;border-radius:6px;padding:12px 16px;margin-bottom:14px;">
        <code style="color:#4CAF66;font-size:12px;word-break:break-all;">${esc(comando)}</code>
      </div>`}

      ${hr()}
      <p style="color:#9C9B96;font-size:12px;margin:0;">
        ${primerAviso
          ? 'Este aviso se dispara en cuanto Culqi notifica el reembolso, y se repite cada día hasta que el comprobante quede anulado.'
          : 'Recordatorio diario: el comprobante sigue sin anular.'}
      </p>
    `),
  });
  console.log(`[Anulación] Aviso enviado a ${destino} — ${comprobante.numero} (${diasRestantes} días)`);
  return res;
};

const enviarAvisoPlazoReclamaciones = async (pendientes) => {
  const destino = process.env.EMAIL_RECLAMACIONES || 'hola@usenotoria.app';
  const fila = (x) => {
    const estado = x.plazo.vencida
      ? `<span style="color:#B91C1C;font-weight:700;">VENCIDA hace ${Math.abs(x.plazo.diasRestantes)} día(s) hábil(es)</span>`
      : `<span style="color:#B45309;font-weight:700;">quedan ${x.plazo.diasRestantes} día(s) hábil(es)</span>`;
    return `<div style="border-bottom:1px solid #E8E6DC;padding:10px 0;">
      <p style="margin:0;color:#141413;font-size:13px;font-weight:700;">${x.numero} · ${x.tipo === 'QUEJA' ? 'Queja' : 'Reclamo'} · ${x.nombre}</p>
      <p style="margin:3px 0 0;color:#5C5B57;font-size:12px;">${estado}</p>
      <p style="margin:3px 0 0;color:#9C9B96;font-size:12px;">${x.detalle.slice(0, 160)}${x.detalle.length > 160 ? '…' : ''}</p>
    </div>`;
  };
  const vencidas = pendientes.filter(x => x.plazo.vencida).length;
  const res = await getResend().emails.send({
    from: FROM(), to: destino,
    subject: `[Libro de Reclamaciones] ${pendientes.length} sin responder${vencidas ? ` — ${vencidas} FUERA DE PLAZO` : ''}`,
    html: base(`
      ${h1('Reclamaciones pendientes de respuesta')}
      ${p('El plazo legal es de <strong>15 días hábiles</strong> desde la recepción (Ley 29571) y es improrrogable.')}
      ${pendientes.map(fila).join('')}
      ${hr()}
      ${p('Para responderlas: <code>railway run --service api node scripts/reclamaciones.js responder &lt;número&gt;</code>')}
    `),
  });
  console.log(`[Reclamaciones] Aviso de plazos enviado a ${destino} — ${pendientes.length} pendiente(s)`);
  return res;
};

// ── Confirmar un cambio de contraseña ─────────────────────
//
// Este correo es la barrera, no un aviso: hasta que alguien abra el enlace, la
// contraseña NO cambia (ver lib/cambioPassword.js). De ahí que el texto sea
// explícito en las dos direcciones — qué hacer si fuiste tú, y qué significa si
// no fuiste tú, que es el caso en el que este correo salva la cuenta.
const enviarConfirmacionCambioPassword = async (usuario, token) => {
  const t = textosCuenta(usuario);
  const enlace = `${FRONT()}/confirmar-cambio/${encodeURIComponent(token)}`;
  const res = await getResend().emails.send({
    from: FROM(), to: usuario.email,
    subject: t.confirmarAsunto,
    html: base(`
      ${h1(t.confirmarTitulo)}
      ${p(t.confirmarIntro(esc(usuario.nombre.split(' ')[0])))}
      ${p(t.confirmarAviso)}
      ${btn(t.confirmarCta, enlace)}
      ${p(`<span style="font-size:12px;color:#9C9B96;">${t.confirmarVigencia}</span>`)}
      ${hr()}
      ${p(t.confirmarNoFuiste)}
    `),
  });
  console.log(`[Seguridad] Confirmación de cambio de contraseña enviada a ${usuario.email}`);
  return res;
};

// ── Cobro fallido (dunning) ───────────────────────────────
//
// Hasta el 2026-08-17 un cargo rechazado desactivaba la suscripción en silencio:
// sin reintento y sin avisarle a nadie. El cliente se enteraba —si acaso— cuando
// notaba que le faltaban funciones. Este es el correo que más dinero recupera de
// todo el producto, porque la mayoría de los rechazos no son voluntarios: es una
// tarjeta vencida o un bloqueo del banco que se arregla en dos minutos.
//
// `intento` y `maxIntentos` van en el texto a propósito: saber que quedan dos
// intentos más es lo que hace que el cliente actúe hoy en vez de dejarlo pasar.
// ⚠️ `proximoIntento` llega como FECHA, no como texto ya formateado. Antes el
// worker la convertía con `toLocaleDateString('es-PE', …)` y la mandaba hecha,
// así que un correo en inglés traía «29 de agosto» en medio de la frase. Misma
// regla de §11 que el `periodo` del digest de alertas.
const enviarCobroFallido = async (usuario, { intento, maxIntentos, monto, moneda, proximoIntento }) => {
  const t = textosCuenta(usuario);
  const importe = `${moneda === 'PEN' ? 'S/' : ''}${(monto / 100).toFixed(2)}`;
  const ultimo = intento >= maxIntentos;
  const fecha = proximoIntento ? fechaLarga(proximoIntento, usuario?.idioma, { day: 'numeric', month: 'long' }) : '';
  const res = await getResend().emails.send({
    from: FROM(), to: usuario.email,
    subject: ultimo ? t.cobroAsuntoUltimo : t.cobroAsunto(intento, maxIntentos),
    html: base(`
      ${h1(ultimo ? t.cobroTituloUltimo : t.cobroTitulo)}
      ${p(t.cobroIntro(esc(usuario.nombre.split(' ')[0]), importe, usuario.plan))}
      ${p(t.cobroMotivo)}
      ${hr()}
      ${ultimo ? p(t.cobroUltimo) : p(t.cobroReintento(fecha))}
      ${btn(t.cobroCta, `${FRONT()}/dashboard/planes`)}
      ${p(`<span style="font-size:12px;color:#9C9B96;">${t.cobroYaActualizada}</span>`)}
    `),
  });
  console.log(`[Cobro] Aviso de cobro fallido enviado a ${usuario.email} (intento ${intento}/${maxIntentos})`);
  return res;
};

// ── Confirmación de cancelación ───────────────────────────
// El plan sigue activo hasta el final del periodo ya pagado, y eso es lo primero
// que hay que decir: es la duda que trae a soporte a quien cancela.
const enviarCancelacion = async (usuario, fechaFin) => {
  const t = textosCuenta(usuario);
  const hasta = fechaLarga(fechaFin, usuario?.idioma);
  const res = await getResend().emails.send({
    from: FROM(), to: usuario.email,
    subject: t.cancelAsunto,
    html: base(`
      ${h1(t.cancelTitulo)}
      ${p(t.cancelIntro(esc(usuario.nombre.split(' ')[0]), usuario.plan))}
      ${hr()}
      ${p(t.cancelHasta(hasta))}
      ${p(t.cancelConserva)}
      ${btn(t.cancelCta, `${FRONT()}/dashboard/planes`)}
      ${p(`<span style="font-size:12px;color:#9C9B96;">${t.cancelFeedback}</span>`)}
    `),
  });
  console.log(`[Cobro] Confirmación de cancelación enviada a ${usuario.email}`);
  return res;
};

// ── Reembolso ─────────────────────────────────────────────
//
// 🔴 POR QUÉ EXISTE. Hasta el 2026-08-30 devolver el dinero no avisaba a nadie:
// `procesarReembolso` actualizaba la base y mandaba el aviso INTERNO de anulación
// pendiente, pero al cliente no le llegaba nada. Se descubrió con el reembolso de
// prueba, cuando el propio dueño esperó un correo que el producto nunca mandó.
//
// ⚠️ EL PLAZO BANCARIO VA EN EL CORREO A PROPÓSITO. Un reembolso emitido y todavía
// no visible en la tarjeta es indistinguible, para quien lo espera, de un reembolso
// que no se hizo. Sin esa frase, cada devolución genera un reclamo evitable.
//
// ⚠️ No dice nada del comprobante: anularlo ante SUNAT es un trámite aparte y
// manual, y cuando esto se envía casi nunca ha ocurrido todavía. Prometerlo aquí
// sería mentir en el 100% de los casos.
const enviarReembolso = async (usuario, { monto, moneda }) => {
  const t = textosCuenta(usuario);
  const importe = `${moneda === 'USD' ? 'USD' : 'S/'} ${(monto / 100).toFixed(2)}`;
  const res = await getResend().emails.send({
    from: FROM(), to: usuario.email,
    subject: t.reembolsoAsunto(importe),
    html: base(`
      ${h1(t.reembolsoTitulo)}
      ${p(t.reembolsoIntro(esc(usuario.nombre?.split(' ')[0] || ''), importe))}
      ${hr()}
      ${p(t.reembolsoPlazo)}
      ${p(t.reembolsoSinCobros)}
      ${btn(t.reembolsoCta, `${FRONT()}/dashboard/facturacion`)}
      ${p(`<span style="font-size:12px;color:#9C9B96;">${t.reembolsoDudas}</span>`)}
    `),
  });
  console.log(`[Cobro] Aviso de reembolso enviado a ${usuario.email}`);
  return res;
};

// ── 18. Invitación al equipo ──────────────────────────────
//
// El enlace lleva el token en claro; en la base solo vive su hash (ver
// lib/equipo.js y el modelo Invitacion). El correo dice explícitamente CON QUÉ
// dirección hay que entrar: la invitación está atada a ese correo y aceptarla
// desde otra cuenta falla, así que decirlo aquí evita el 90% de los "no me deja".
// ⚠️ `idioma` llega como parámetro y no de un objeto usuario: al invitado puede
// que ni siquiera le exista cuenta todavía. La ruta lo resuelve preguntando
// primero por la cuenta del invitado y cayendo a la de quien invita.
const enviarInvitacionEquipo = async ({ email, cuenta, invitadoPor, rol, token, negocios, idioma }) => {
  const t = textosEquipo(idioma);
  const r = getResend();
  const url = `${FRONT()}/invitacion/${token}`;
  const esGestor = rol === 'GESTOR';
  const alcance = negocios && negocios.length
    ? p(t.invAlcance(esc(negocios.join(', '))))
    : '';

  return r.emails.send({
    from: FROM(), to: email,
    subject: t.invAsunto(invitadoPor, cuenta),
    html: base(`
      ${h1(t.invTitulo(esc(cuenta)))}
      ${p(t.invIntro(esc(invitadoPor), esc(cuenta)))}
      ${p(t.invRol(esGestor ? t.rolGestor : t.rolLector, esGestor ? t.queHaceGestor : t.queHaceLector))}
      ${alcance}
      ${btn(t.invCta, url)}
      ${hr()}
      ${p(t.invCorreo(esc(email)))}
      ${p(t.invVence)}
    `),
  });
};

// ── 19. Alguien aceptó la invitación ──────────────────────
// Le llega al propietario. Es la contrapartida de dar acceso a una cuenta: quien
// la paga tiene que enterarse el día que alguien entra, no descubrirlo después.
const enviarAvisoNuevoMiembro = async ({ propietario, miembro, rol }) => {
  // Este va al PROPIETARIO, así que manda su idioma, no el del que se sumó.
  const t = textosEquipo(propietario?.idioma);
  const r = getResend();
  return r.emails.send({
    from: FROM(), to: propietario.email,
    subject: t.nuevoAsunto(miembro.nombre),
    html: base(`
      ${h1(t.nuevoTitulo)}
      ${p(t.nuevoIntro(esc(miembro.nombre), esc(miembro.email), rol === 'GESTOR' ? t.rolGestor : t.rolLector))}
      ${p(t.nuevoRegistro)}
      ${btn(t.nuevoCta, `${FRONT()}/dashboard/equipo`)}
      ${p(t.nuevoDesconocido)}
    `),
  });
};

// ── 20. Te quitaron el acceso ─────────────────────────────
// Se avisa a propósito. Perder el acceso sin explicación se lee como una avería
// del producto, y la persona acaba escribiendo a soporte por algo que fue una
// decisión deliberada del dueño.
const enviarSalidaEquipo = async ({ miembro, cuenta }) => {
  // Va a quien pierde el acceso: su idioma, no el del propietario.
  const t = textosEquipo(miembro?.idioma);
  const r = getResend();
  return r.emails.send({
    from: FROM(), to: miembro.email,
    subject: t.salidaAsunto(cuenta),
    html: base(`
      ${h1(t.salidaTitulo)}
      ${p(t.salidaIntro(esc(cuenta)))}
      ${p(t.salidaPersonal)}
      ${btn(t.salidaCta, `${FRONT()}/dashboard`)}
    `),
  });
};

// ── 24. Aviso de que la vigilancia gratuita se va a pausar ─────────────────
//
// 🔴 Este correo es lo que hace que pausar una cuenta sea honesto en vez de
// apagarle la vigilancia a alguien sin decírselo. Si se quita, la pausa pasa a
// ser silenciosa, que es exactamente el tipo de fallo que este proyecto persigue.
//
// ⚠️ Y de paso es el mejor correo de reactivación que tiene el producto: dice
// algo concreto que pasa en su cuenta y que depende de él, no «te extrañamos».
// La palanca de costo y la de conversión resultaron ser la misma.
const PAUSA = {
  es: {
    asunto: (d) => `Tu vigilancia se pausa en ${d} ${d === 1 ? 'día' : 'días'} — Notoria`,
    titulo: 'Tu vigilancia gratuita se va a pausar',
    intro: (d) => `Llevas un tiempo sin entrar, así que en <strong>${d} ${d === 1 ? 'día' : 'días'}</strong> vamos a pausar el escaneo automático de tu negocio.`,
    porque: 'El plan Gratuito vigila mientras lo estés usando. No se borra nada: tus reseñas, tu historial y tus alertas siguen donde están.',
    comoVolver: 'Para reanudarlo basta con que entres al panel. Se reactiva solo, en el siguiente ciclo.',
    cta: 'Entrar y reanudar →',
    mejorar: 'Si prefieres que no se pause nunca y además te avisemos más rápido, cualquier plan de pago vigila sin interrupciones.',
  },
  en: {
    asunto: (d) => `Your monitoring pauses in ${d} ${d === 1 ? 'day' : 'days'} — Notoria`,
    titulo: 'Your free monitoring is about to pause',
    intro: (d) => `You have not signed in for a while, so in <strong>${d} ${d === 1 ? 'day' : 'days'}</strong> we will pause the automatic scanning of your business.`,
    porque: 'The Free plan watches your listing while you are using it. Nothing gets deleted: your reviews, history and alerts stay exactly where they are.',
    comoVolver: 'To resume it, just sign in. It reactivates on its own, on the next cycle.',
    cta: 'Sign in and resume →',
    mejorar: 'If you would rather it never paused — and be alerted faster — any paid plan watches without interruptions.',
  },
};

const enviarAvisoPausa = async (usuario, diasRestantes) => {
  const t = PAUSA[usuario.idioma] || PAUSA.es;
  console.log('[Email] Aviso de pausa a:', usuario.email);
  return getResend().emails.send({
    from: FROM(), to: usuario.email,
    subject: t.asunto(diasRestantes),
    html: base(`
      ${h1(t.titulo)}
      ${p(t.intro(diasRestantes))}
      ${p(t.porque)}
      ${p(t.comoVolver)}
      ${btn(t.cta, `${FRONT()}/dashboard`)}
      <p style="color:#9C9B96;font-size:12px;margin:10px 0 0;line-height:1.6;">${t.mejorar}</p>
    `),
  });
};

module.exports = { enviarBienvenida, enviarVerificacion, enviarConfirmacionContrasena, enviarRecuperacionContrasena, enviarAlertaCritica, enviarResumenAlertas, enviarResumenSemanal, enviarResumenSemanalConsolidado, enviarComprobante, enviarDrip, enviarCargoReclamacion, enviarAvisoReclamacionInterno, enviarRespuestaReclamacion, enviarAvisoPlazoReclamaciones, enviarAvisoAnulacionPendiente, enviarConfirmacionCambioPassword, enviarCobroFallido, enviarCancelacion, enviarReembolso, enviarInvitacionEquipo, enviarAvisoNuevoMiembro, enviarSalidaEquipo, enviarAvisoPausa, getResend, FROM, base, h1, p, btn, hr };
