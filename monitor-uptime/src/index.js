/**
 * Monitor de uptime EXTERNO de Notoria — Cloudflare Worker.
 *
 * Por qué existe, y por qué no basta con `.github/workflows/uptime.yml`:
 * GitHub degrada los cron programados en repos de poca actividad. Medido sobre
 * corridas reales, los huecos entre pasadas fueron de 28 minutos a 11 horas, con
 * el cron pedido cada 15 min intacto. O sea que el servicio podía estar caído
 * media jornada y el
 * vigilante seguía en verde. Este corre en la red de Cloudflare, que es la única
 * de las cuatro piezas (Railway, Vercel, GitHub, Cloudflare) que no aloja nada
 * del producto: si Railway cae entero, esto sigue mirando.
 *
 * 🔴 LA REGLA QUE GOBIERNA ESTE ARCHIVO: solo se avisa en el CAMBIO de estado.
 * Un correo cada 5 minutos durante una caída de tres horas son 36 correos que
 * enseñan a ignorar el remitente, y el día de la caída siguiente ese aviso llega
 * igual que los 36 anteriores. Es exactamente el fallo que ya tuvo el workflow de
 * GitHub en agosto de 2026, cuando mandó cinco «Run failed» con el sitio
 * respondiendo 200. Se avisa al caer, se avisa al volver, y en medio se calla.
 *
 * ⚠️ Y SE REINTENTA ANTES DE DECLARAR UNA CAÍDA. Una sonda aislada que falla no
 * es una caída: es una sonda que falló. Sin el reintento, cualquier microcorte de
 * red entre Cloudflare y Railway produce un correo de alarma y otro de
 * recuperación cinco minutos después — el mismo ruido por otro camino.
 */

// Lo que se vigila. `espera` es una comprobación de CONTENIDO, no solo del 200:
// Railway puede devolver 200 con una página de error suya, y un 200 vacío del
// landing fue justo el bug que rompió la verificación de marca de Google.
const SONDAS = [
  {
    nombre: 'API',
    url: 'https://api.usenotoria.app/health',
    espera: (texto) => texto.includes('"status":"ok"'),
    queEspera: '{"status":"ok"}',
  },
  {
    nombre: 'Landing',
    url: 'https://usenotoria.app',
    espera: (texto) => texto.includes('Notoria'),
    queEspera: 'la palabra «Notoria» en el HTML servido',
  },
];

const TIMEOUT_MS = 15000;
const ESPERA_REINTENTO_MS = 4000;
const CLAVE_ESTADO = 'estado';

/** Una sonda. Devuelve {ok, detalle, ms}. Nunca lanza: un fallo es un dato. */
async function sondear(sonda) {
  const t0 = Date.now();
  try {
    const res = await fetch(sonda.url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'Notoria-Monitor/1.0 (+https://usenotoria.app)' },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      return { ok: false, detalle: `HTTP ${res.status}`, ms };
    }
    const texto = await res.text();
    if (!sonda.espera(texto)) {
      // 200 pero el cuerpo no es el que debe ser. Es un fallo distinto de "no
      // responde", y hay que decirlo distinto: manda a mirar otro sitio.
      return { ok: false, detalle: `HTTP 200 pero falta ${sonda.queEspera}`, ms };
    }
    return { ok: true, detalle: `HTTP 200 · ${ms} ms`, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const causa = e.name === 'TimeoutError' ? `sin respuesta en ${TIMEOUT_MS / 1000}s` : e.message;
    return { ok: false, detalle: causa, ms };
  }
}

/** Sondea todo. Lo que falla se reintenta UNA vez antes de darlo por caído. */
async function revisarTodo() {
  const primera = await Promise.all(SONDAS.map(sondear));
  const fallos = primera.map((r, i) => ({ ...r, sonda: SONDAS[i] })).filter((r) => !r.ok);
  if (fallos.length === 0) {
    return SONDAS.map((s, i) => ({ nombre: s.nombre, ...primera[i] }));
  }

  await new Promise((r) => setTimeout(r, ESPERA_REINTENTO_MS));

  const resultados = [...primera];
  for (const fallo of fallos) {
    const i = SONDAS.indexOf(fallo.sonda);
    const segunda = await sondear(fallo.sonda);
    // Se conserva el detalle del reintento: es el que decide.
    resultados[i] = segunda.ok
      ? { ...segunda, detalle: `${segunda.detalle} (falló la 1.ª: ${fallo.detalle})` }
      : segunda;
  }
  return SONDAS.map((s, i) => ({ nombre: s.nombre, ...resultados[i] }));
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function enviarCorreo(env, { asunto, titulo, cuerpoHtml, urgente }) {
  if (!env.RESEND_API_KEY) {
    console.log('[monitor] Sin RESEND_API_KEY: no se manda correo. Asunto era:', asunto);
    return { ok: false, motivo: 'sin RESEND_API_KEY' };
  }
  const destino = env.EMAIL_DESTINO || 'didier@usenotoria.app';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f3;font-family:Georgia,'Times New Roman',serif;color:#141413">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e4df;border-radius:10px;overflow:hidden">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e5e4df"><strong style="font-size:17px">Notoria</strong>
<span style="color:#6b6a63;font-size:13px"> · monitor externo</span></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 14px;font-size:19px">${esc(titulo)}</h1>${cuerpoHtml}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e5e4df;color:#6b6a63;font-size:12px">
Cloudflare Worker · vigila desde fuera de Railway, Vercel y GitHub.<br>
Solo escribe cuando el estado <em>cambia</em>: si no llega nada, todo sigue igual.</td></tr>
</table></td></tr></table></body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Notoria <hola@usenotoria.app>',
      to: [destino],
      subject: asunto,
      html,
      ...(urgente ? { headers: { 'X-Priority': '1', Importance: 'high', 'X-MSMail-Priority': 'High' } } : {}),
    }),
  });
  const cuerpo = await res.text();
  if (!res.ok) console.log('[monitor] Resend falló:', res.status, cuerpo);
  return { ok: res.ok, motivo: res.ok ? 'enviado' : `${res.status} ${cuerpo}` };
}

function filas(resultados) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:6px 0 14px">
${resultados
  .map(
    (r) => `<tr><td style="padding:7px 0;border-bottom:1px solid #eeede8;width:86px"><strong>${esc(r.nombre)}</strong></td>
<td style="padding:7px 0;border-bottom:1px solid #eeede8;color:${r.ok ? '#0B7324' : '#b3261e'}">${r.ok ? '✓' : '✗'} ${esc(r.detalle)}</td></tr>`
  )
  .join('\n')}</table>`;
}

/** El ciclo. Lo llama el cron y también la ruta manual. */
async function ciclo(env, { forzarCorreo = false } = {}) {
  const resultados = await revisarTodo();
  const caidas = resultados.filter((r) => !r.ok);
  const hayCaida = caidas.length > 0;
  const ahora = new Date().toISOString();

  let previo = { caido: false, desde: null };
  if (env.ESTADO) {
    try {
      const guardado = await env.ESTADO.get(CLAVE_ESTADO, { type: 'json' });
      if (guardado) previo = guardado;
    } catch (e) {
      console.log('[monitor] No se pudo leer KV:', e.message);
    }
  }

  // ── La decisión de escribir, que es lo único delicado de este archivo ──
  const empiezaCaida = hayCaida && !previo.caido;
  const seRecupera = !hayCaida && previo.caido;
  let correo = null;

  if (empiezaCaida) {
    correo = await enviarCorreo(env, {
      urgente: true,
      asunto: `🔴 CAÍDO — ${caidas.map((c) => c.nombre).join(' y ')} no responde`,
      titulo: 'Notoria no está respondiendo',
      cuerpoHtml: `<p style="margin:0 0 4px;color:#3d3c37">Esto es lo que se acaba de medir desde la red de Cloudflare, con un reintento de por medio:</p>
${filas(resultados)}
<p style="margin:0;color:#3d3c37">No volverás a recibir otro correo por esta caída. El siguiente llega cuando <strong>vuelva</strong>.</p>`,
    });
  } else if (seRecupera) {
    const desde = previo.desde ? new Date(previo.desde) : null;
    const mins = desde ? Math.round((Date.now() - desde.getTime()) / 60000) : null;
    correo = await enviarCorreo(env, {
      asunto: `✅ Restablecido — Notoria vuelve a responder${mins !== null ? ` (${mins} min caído)` : ''}`,
      titulo: 'Ya responde con normalidad',
      cuerpoHtml: `${filas(resultados)}
<p style="margin:0;color:#3d3c37">${
        mins !== null
          ? `Estuvo sin responder <strong>${mins} minuto${mins === 1 ? '' : 's'}</strong>, desde las ${desde.toISOString().replace('T', ' ').slice(0, 16)} UTC.`
          : 'Se ha restablecido.'
      }</p>`,
    });
  } else if (forzarCorreo) {
    correo = await enviarCorreo(env, {
      asunto: `Prueba del monitor de Notoria — ${hayCaida ? 'con fallos' : 'todo bien'}`,
      titulo: 'Prueba manual del monitor',
      cuerpoHtml: `<p style="margin:0 0 4px;color:#3d3c37">Este correo lo pediste tú con <code>?correo=1</code>. Confirma que la ruta de aviso funciona de punta a punta.</p>${filas(resultados)}`,
    });
  }

  if (env.ESTADO && (empiezaCaida || seRecupera)) {
    try {
      await env.ESTADO.put(
        CLAVE_ESTADO,
        JSON.stringify({ caido: hayCaida, desde: hayCaida ? ahora : null, ultimo: ahora })
      );
    } catch (e) {
      console.log('[monitor] No se pudo escribir KV:', e.message);
    }
  }

  return { ahora, hayCaida, resultados, cambio: empiezaCaida ? 'empieza-caida' : seRecupera ? 'recuperado' : 'sin-cambio', correo };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      ciclo(env).then((r) =>
        console.log(`[monitor] ${r.ahora} · ${r.hayCaida ? 'CAÍDO' : 'ok'} · ${r.cambio}`)
      )
    );
  },

  /**
   * Ruta manual, para poder comprobar el monitor sin esperar al cron ni provocar
   * una caída. `?correo=1` además manda el correo de prueba — que es lo único que
   * demuestra que la ruta de aviso funciona; que el Worker responda no lo prueba.
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    const r = await ciclo(env, { forzarCorreo: url.searchParams.get('correo') === '1' });
    return new Response(JSON.stringify(r, null, 2), {
      status: r.hayCaida ? 503 : 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  },
};
