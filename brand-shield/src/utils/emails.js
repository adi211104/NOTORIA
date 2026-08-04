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
      <p style="color:#9C9B96;font-size:11px;margin:0;">Notoria · Monitor de reputación para LATAM · <a href="${FRONT()}" style="color:#0B7324;">usenotoria.app</a></p>
    </div>
  </div>
</body></html>`;

const h1  = (t)   => `<h1 style="color:#141413;font-size:20px;font-weight:800;margin:0 0 14px;letter-spacing:-0.5px;">${t}</h1>`;
const p   = (t)   => `<p style="color:#5C5B57;font-size:14px;line-height:1.75;margin:0 0 12px;">${t}</p>`;
const btn = (t,u) => `<div style="margin:16px 0;"><a href="${u}" style="display:inline-block;background:#0B7324;color:#fff;text-decoration:none;padding:12px 24px;border-radius:5px;font-weight:700;font-size:14px;">${t}</a></div>`;
const hr  = ()    => `<div style="height:1px;background:#E8E6DC;margin:18px 0;"></div>`;

// ── 1. Bienvenida ─────────────────────────────────────────
const enviarBienvenida = async (usuario) => {
  console.log('[Email] Enviando bienvenida a:', usuario.email);
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: `Bienvenido a Notoria, ${usuario.nombre.split(' ')[0]}`,
    html: base(`
      ${h1(`Bienvenido, ${usuario.nombre.split(' ')[0]}.`)}
      ${p('Tu cuenta está lista. En 5 minutos puedes tener tu negocio monitoreado.')}
      ${hr()}
      ${['Agrega tu restaurante u hotel desde Google Maps.','Conecta Google Business para ver todas tus reseñas.','Activa alertas por email o Telegram.'].map((s,i)=>`<div style="display:flex;gap:10px;margin-bottom:8px;"><span style="color:#0B7324;font-weight:700;">${i+1}.</span><p style="color:#5C5B57;font-size:13px;margin:0;line-height:1.5;">${s}</p></div>`).join('')}
      ${hr()}
      ${btn('Ir al dashboard →', `${FRONT()}/dashboard`)}
    `),
  });
  console.log('[Email] Bienvenida resultado:', JSON.stringify(res));
  return res;
};

// ── 2. Verificación de email ──────────────────────────────
const enviarVerificacion = async (usuario, token) => {
  console.log('[Email] Enviando verificación a:', usuario.email, '| token:', token.slice(0,8)+'...');
  const url = `${FRONT()}/verificar-email?token=${token}`;
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: 'Confirma tu email — Notoria',
    html: base(`
      ${h1('Confirma tu correo electrónico')}
      ${p('Haz clic en el botón para activar tu cuenta de Notoria:')}
      ${btn('Confirmar mi email →', url)}
      ${hr()}
      <p style="color:#9C9B96;font-size:12px;margin:0;">Si no creaste una cuenta en Notoria, ignora este mensaje. El enlace expira en 24 horas.</p>
      <p style="color:#9C9B96;font-size:12px;margin:8px 0 0;">Si el botón no funciona, copia este enlace: <br><a href="${url}" style="color:#0B7324;word-break:break-all;">${url}</a></p>
    `),
  });
  console.log('[Email] Verificación resultado:', JSON.stringify(res));
  return res;
};

// ── 3. Confirmación cambio de contraseña ─────────────────
const enviarConfirmacionContrasena = async (usuario) => {
  console.log('[Email] Enviando confirmación contraseña a:', usuario.email);
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: 'Tu contraseña fue cambiada — Notoria',
    html: base(`
      ${h1('Tu contraseña fue cambiada')}
      ${p(`La contraseña de <strong>${usuario.email}</strong> fue actualizada exitosamente.`)}
      <div style="background:#FAF9F5;border-left:3px solid #B74040;padding:12px 16px;margin:14px 0;">
        <p style="color:#B74040;font-size:13px;font-weight:600;margin:0 0 4px;">¿No fuiste tú?</p>
        <p style="color:#5C5B57;font-size:13px;margin:0;">Escríbenos a <a href="mailto:hola@usenotoria.app" style="color:#0B7324;">hola@usenotoria.app</a> de inmediato.</p>
      </div>
      ${btn('Ir a mi cuenta →', `${FRONT()}/dashboard/configuracion`)}
    `),
  });
  console.log('[Email] Contraseña resultado:', JSON.stringify(res));
  return res;
};

// ── 3b. Recuperación de contraseña ("olvidé mi contraseña") ──
const enviarRecuperacionContrasena = async (usuario, token) => {
  console.log('[Email] Enviando recuperación de contraseña a:', usuario.email);
  const url = `${FRONT()}/resetear-password?token=${token}`;
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: 'Restablece tu contraseña — Notoria',
    html: base(`
      ${h1('¿Olvidaste tu contraseña?')}
      ${p(`Recibimos una solicitud para restablecer la contraseña de <strong>${usuario.email}</strong>. Haz clic en el botón para elegir una nueva:`)}
      ${btn('Restablecer contraseña →', url)}
      ${hr()}
      <p style="color:#9C9B96;font-size:12px;margin:0;">Si no solicitaste esto, ignora este mensaje y tu contraseña seguirá igual. El enlace expira en 1 hora.</p>
      <p style="color:#9C9B96;font-size:12px;margin:8px 0 0;">Si el botón no funciona, copia este enlace: <br><a href="${url}" style="color:#0B7324;word-break:break-all;">${url}</a></p>
    `),
  });
  console.log('[Email] Recuperación resultado:', JSON.stringify(res));
  return res;
};

// ── 4. Alerta crítica ─────────────────────────────────────
const enviarAlertaCritica = async (usuario, negocio, alerta) => {
  console.log('[Email] Enviando alerta crítica a:', usuario.email);
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: `Alerta en ${negocio.nombre} — Notoria`,
    html: base(`
      ${h1('Alerta de reputación detectada')}
      ${p(`Detectamos actividad inusual en <strong>${negocio.nombre}</strong>:`)}
      <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:14px 18px;margin:12px 0;">
        <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">${alerta.tipo?.replace(/_/g,' ')}</p>
        <p style="color:#141413;font-size:14px;margin:0;line-height:1.6;">${alerta.descripcion}</p>
      </div>
      ${btn('Ver en Notoria →', `${FRONT()}/dashboard/negocios/${negocio.id}?tab=alertas`)}
    `),
  });
  console.log('[Email] Alerta resultado:', JSON.stringify(res));
  return res;
};

// ── 5. Resumen periódico de alertas (frecuencia semanal/mensual) ──
const enviarResumenAlertas = async (usuario, alertas, periodo) => {
  const r = getResend();
  const porNegocio = {};
  for (const a of alertas) {
    const nombre = a.negocio?.nombre || 'Tu negocio';
    (porNegocio[nombre] = porNegocio[nombre] || []).push(a);
  }
  const bloques = Object.entries(porNegocio).map(([nombre, lista]) => `
    <p style="color:#141413;font-size:14px;font-weight:700;margin:14px 0 6px;">${nombre} (${lista.length})</p>
    ${lista.slice(0, 10).map(a => `
      <div style="background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:10px 14px;margin-bottom:6px;">
        <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 3px;">${a.tipo?.replace(/_/g, ' ')}</p>
        <p style="color:#5C5B57;font-size:13px;margin:0;line-height:1.5;">${a.descripcion}</p>
      </div>`).join('')}
  `).join('');

  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: `Tu resumen ${periodo} de alertas — Notoria`,
    html: base(`
      ${h1(`Resumen ${periodo} de alertas`)}
      ${p(`Hola <strong>${usuario.nombre?.split(' ')[0] || ''}</strong>, esto es lo que Notoria detectó en el período:`)}
      ${bloques}
      ${btn('Ver todo en el dashboard →', `${FRONT()}/dashboard/alertas`)}
      <p style="color:#9C9B96;font-size:11px;margin:10px 0 0;">Recibes este resumen porque configuraste alertas ${periodo === 'semanal' ? 'semanales' : 'mensuales'}. Puedes cambiarlo en Alertas → Configurar notificaciones.</p>
    `),
  });
  return res;
};

// ── 6. Resumen semanal de rating/reseñas (cron domingo 8am Lima) ──
// Gratis: solo cifras crudas (sin `datos.insight`). Negocio/Franquicia: incluye
// el insight generado con IA (`datos.insight`) sobre las reseñas de la semana.
const flechaVariacion = (variacion) => variacion > 0 ? '▲' : variacion < 0 ? '▼' : '—';
const colorVariacion  = (variacion) => variacion > 0 ? '#0B7324' : variacion < 0 ? '#B74040' : '#9C9B96';

const bloqueCifrasNegocio = (negocio, d) => `
  <p style="color:#141413;font-size:14px;font-weight:700;margin:14px 0 8px;">${negocio.nombre}</p>
  <div style="display:flex;gap:10px;margin-bottom:${d.insight ? '10px' : '4px'};">
    <div style="flex:1;background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;text-align:center;">
      <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Rating actual</p>
      <p style="color:#141413;font-size:20px;font-weight:800;margin:0;">${d.ratingActual?.toFixed(1) ?? '—'}★</p>
    </div>
    <div style="flex:1;background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;text-align:center;">
      <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Variación 7 días</p>
      <p style="color:${colorVariacion(d.variacion)};font-size:20px;font-weight:800;margin:0;">${flechaVariacion(d.variacion)} ${Math.abs(d.variacion ?? 0).toFixed(1)}</p>
    </div>
    <div style="flex:1;background:#FAF9F5;border:1px solid #E8E6DC;border-radius:6px;padding:12px 14px;text-align:center;">
      <p style="color:#9C9B96;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Reseñas nuevas</p>
      <p style="color:#141413;font-size:20px;font-weight:800;margin:0;">${d.resenasNuevas ?? 0}</p>
    </div>
  </div>
  ${d.insight ? `
  <div style="background:${'rgba(11,115,36,0.08)'};border-left:3px solid #0B7324;padding:10px 14px;margin-bottom:4px;">
    <p style="color:#141413;font-size:13px;margin:0;line-height:1.6;">${d.insight}</p>
  </div>` : ''}
`;

const enviarResumenSemanal = async (usuario, negocio, datos) => {
  const r = getResend();
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: `Tu resumen semanal de ${negocio.nombre} — Notoria`,
    html: base(`
      ${h1('Tu resumen semanal')}
      ${p(`Hola <strong>${usuario.nombre?.split(' ')[0] || ''}</strong>, esto pasó esta semana en tu reputación:`)}
      ${bloqueCifrasNegocio(negocio, datos)}
      ${!datos.insight ? `<p style="color:#9C9B96;font-size:12px;margin:6px 0 0;">El plan Negocio incluye un análisis con IA de qué mencionan tus clientes cada semana. <a href="${FRONT()}/dashboard/planes" style="color:#0B7324;">Conoce más →</a></p>` : ''}
      ${hr()}
      ${btn('Ver dashboard →', `${FRONT()}/dashboard/negocios/${negocio.id}`)}
    `),
  });
  return res;
};

// Franquicia con más de 1 negocio activo: un solo email con el desglose por local
const enviarResumenSemanalConsolidado = async (usuario, negocios, resumenGlobal) => {
  const r = getResend();
  const bloques = negocios.map((n) => bloqueCifrasNegocio(n.negocio, n.datos)).join(hr());
  const res = await r.emails.send({
    from: FROM(), to: usuario.email,
    subject: `Tu resumen semanal consolidado (${negocios.length} locales) — Notoria`,
    html: base(`
      ${h1('Tu resumen semanal — todos tus locales')}
      ${p(`Hola <strong>${usuario.nombre?.split(' ')[0] || ''}</strong>, este es el resumen ejecutivo de tus ${negocios.length} negocios:`)}
      ${resumenGlobal ? `<div style="background:rgba(11,115,36,0.08);border-left:3px solid #0B7324;padding:12px 16px;margin-bottom:14px;"><p style="color:#141413;font-size:13px;margin:0;line-height:1.65;">${resumenGlobal}</p></div>` : ''}
      ${hr()}
      ${bloques}
      ${hr()}
      ${btn('Ver dashboard →', `${FRONT()}/dashboard`)}
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

module.exports = { enviarBienvenida, enviarVerificacion, enviarConfirmacionContrasena, enviarRecuperacionContrasena, enviarAlertaCritica, enviarResumenAlertas, enviarResumenSemanal, enviarResumenSemanalConsolidado, enviarComprobante, getResend, FROM, base, h1, p, btn, hr };
