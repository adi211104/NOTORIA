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
        ${p('Por ser cuenta nueva, el plan Negocio te cuesta la mitad los primeros 2 meses: escaneo cada 4 horas, historial de 90 días, 100 usos de IA a la semana y alertas por Telegram.')}
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
        ${p('As a new account, the Business plan costs half price for your first 2 months: scans every 4 hours, 90-day history, 100 AI uses per week and Telegram alerts.')}
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

const hojaHtml = (r) => `<table style="width:100%;border-collapse:collapse;">
  ${filaHoja('N° de hoja', `<strong>${r.numero}</strong>`)}
  ${filaHoja('Fecha', new Date(r.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima' }))}
  ${filaHoja('Tipo', r.tipo === 'QUEJA' ? 'Queja' : 'Reclamo')}
  ${filaHoja('Consumidor', `${r.nombre} · ${r.docTipo} ${r.documento}`)}
  ${filaHoja('Domicilio', r.domicilio)}
  ${filaHoja('Contacto', `${r.email} · ${r.telefono}`)}
  ${r.esMenor ? filaHoja('Apoderado', r.apoderado) : ''}
  ${filaHoja('Bien contratado', `${r.tipoBien === 'PRODUCTO' ? 'Producto' : 'Servicio'} — ${r.descripcion}`)}
  ${r.montoS ? filaHoja('Monto reclamado', `S/ ${(r.montoS / 100).toFixed(2)}`) : ''}
  ${filaHoja('Detalle', r.detalle)}
  ${filaHoja('Pedido', r.pedido)}
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

module.exports = { enviarBienvenida, enviarVerificacion, enviarConfirmacionContrasena, enviarRecuperacionContrasena, enviarAlertaCritica, enviarResumenAlertas, enviarResumenSemanal, enviarResumenSemanalConsolidado, enviarComprobante, enviarDrip, enviarCargoReclamacion, enviarAvisoReclamacionInterno, enviarRespuestaReclamacion, enviarAvisoPlazoReclamaciones, getResend, FROM, base, h1, p, btn, hr };
