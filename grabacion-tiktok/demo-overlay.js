/* ──────────────────────────────────────────────────────────────────────────
   Notoria — utilería para grabar los videos del Accounts API Application Form
   de TikTok (pregunta 8: Screen Recordings).

   Se pega ENTERO en la consola del navegador (F12 → Console) con el panel ya
   abierto. No modifica el backend, no escribe en la base de datos y no deja
   nada instalado: se va al recargar la página.

   Hace dos cosas:

   1. ROTULAR — muestra un cartel abajo en pantalla con el permiso y el endpoint
      que corresponde a lo que se está viendo. Es lo que le permite al revisor de
      TikTok mapear "pantalla ↔ sub-permiso" sin adivinar.
        NotoriaDemo.v1()   → carga los rótulos del Video 1 (flujo real)
        NotoriaDemo.v2()   → carga los del Video 2 (prototipo)
        →  ó  barra espaciadora  = siguiente rótulo
        ←                        = anterior
        Esc                      = ocultar / mostrar

   2. PROTOTIPAR los comentarios — intercepta las respuestas de
      /api/comentarios/... para inyectar comentarios de ejemplo, porque los
      comentarios reales todavía no se pueden leer (§15-quinquies del CLAUDE.md:
      la Display API no expone esas rutas; por eso se pide el Accounts API).
      La UI que se ve en el video es la de verdad — lo único simulado es el
      origen de los datos, que es exactamente lo que el formulario llama
      "prototype".
        NotoriaDemo.datos()      → activa la inyección
        NotoriaDemo.datosOff()   → la desactiva

   ⚠️ El Video 2 tiene que llevar el cartel de PROTOTYPE en pantalla. Declararlo
   suma credibilidad; disimularlo es motivo de rechazo.
   ────────────────────────────────────────────────────────────────────────── */

(() => {
  const PREVIO = window.NotoriaDemo;
  if (PREVIO) PREVIO.desinstalar();

  // ── 1. Rótulos ───────────────────────────────────────────────────────────
  // `activarDatos` enciende solo la inyección de comentarios de prototipo al
  // llegar a ese rótulo. Así, en el video único, todo lo anterior es tráfico
  // real contra la API y el prototipo empieza exactamente donde lo dice el cartel.
  // Los rótulos van en ASCII puro a propósito: son lo único que se ve en el
  // video, y si el archivo se copia con la codificación equivocada (Windows
  // PowerShell 5.1 lee ANSI por defecto) una raya larga sale como "â€"" en
  // pantalla. Un guion normal se ve igual de bien y no puede romperse.
  const ROTULOS = {
    v1: [
      { t: 'Notoria - reputation dashboard', s: 'Signed in as the business owner' },
      { t: 'Connections > TikTok', s: 'The owner starts the authorization themselves' },
      { t: "TikTok's own consent screen", s: 'Permission is granted by the account holder' },
      { t: 'Account User', s: 'GET /business/get/ - display name, username, avatar, business_id' },
      { t: 'Comments tab > Your latest videos', s: 'Get Account Media - GET /business/video/list/' },
      { t: 'Only accounts that authorized us', s: 'No third-party data. No advertising. No model training.' },
    ],
    v2: [
      { t: 'PROTOTYPE', s: 'Blocked pending Accounts API approval - the pipeline behind it already runs for Google reviews', alerta: true, activarDatos: true },
      { t: 'Account Comment', s: "GET /business/comment/list/ - comments on the account's own videos" },
      { t: 'Automatic sentiment classification', s: 'Positive / neutral / negative, same engine as every other channel' },
      { t: 'Alert outside TikTok', s: 'Email + WhatsApp within minutes of a negative comment' },
      { t: 'Reply from the dashboard', s: 'POST /business/comment/reply/create/ - Account Comment' },
      { t: 'Marked as answered', s: 'Only after the platform confirms the reply' },
      { t: 'Disconnect', s: 'Tokens are deleted and all API calls stop' },
    ],
  };

  // Video único: los 5 primeros rótulos reales, el bloque de prototipo, y la
  // declaración de privacidad al final como cierre de todo.
  ROTULOS.unico = [...ROTULOS.v1.slice(0, 5), ...ROTULOS.v2, ROTULOS.v1[5]];

  const LLAVE_IDX = 'notoria_demo_idx';
  const LLAVE_SET = 'notoria_demo_set';

  let caja = null;
  let visible = true;

  const pintar = () => {
    const set = sessionStorage.getItem(LLAVE_SET) || 'v1';
    const i = Number(sessionStorage.getItem(LLAVE_IDX) || 0);
    const lista = ROTULOS[set] || ROTULOS.v1;
    const r = lista[Math.max(0, Math.min(i, lista.length - 1))];
    if (!caja || !r) return;

    // El prototipo se enciende solo al llegar a su cartel: así lo que se grabó
    // antes es tráfico real y la frontera queda donde la anuncia el rótulo.
    if (r.activarDatos && !interceptando) api.datos();

    caja.style.display = visible ? 'block' : 'none';
    caja.style.background = r.alerta ? 'rgba(180,32,32,.94)' : 'rgba(12,12,14,.92)';
    caja.innerHTML = `
      <div style="font:700 22px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:-.2px">
        ${r.t}
      </div>
      <div style="margin-top:6px;font:500 15px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.86">
        ${r.s}
      </div>
      <div style="position:absolute;top:10px;right:14px;font:600 11px/1 system-ui;opacity:.45">
        ${i + 1}/${lista.length}
      </div>`;
  };

  const mover = (d) => {
    const set = sessionStorage.getItem(LLAVE_SET) || 'v1';
    const max = (ROTULOS[set] || ROTULOS.v1).length - 1;
    const i = Number(sessionStorage.getItem(LLAVE_IDX) || 0);
    sessionStorage.setItem(LLAVE_IDX, String(Math.max(0, Math.min(i + d, max))));
    pintar();
  };

  const teclas = (e) => {
    // No robarle las teclas a un input: en el video se escribe una respuesta.
    const escribiendo = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')
      || document.activeElement?.isContentEditable;
    if (escribiendo && e.key !== 'Escape') return;

    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Escape') { visible = !visible; pintar(); }
  };

  // `desdeCero=false` re-monta conservando el rótulo en el que se había quedado.
  // Hace falta porque el OAuth de TikTok navega fuera del sitio
  // (conexiones/page.js hace window.location.href = url), la página vuelve a
  // cargar de cero y el overlay se pierde. sessionStorage es del mismo origen y
  // de la misma pestaña, así que el índice sí sobrevive el viaje de ida y vuelta.
  const montar = (set, desdeCero = true) => {
    sessionStorage.setItem(LLAVE_SET, set);
    if (desdeCero) sessionStorage.setItem(LLAVE_IDX, '0');
    if (!caja) {
      caja = document.createElement('div');
      caja.id = 'notoria-demo-rotulo';
      Object.assign(caja.style, {
        position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
        maxWidth: 'min(920px, 92vw)', padding: '16px 22px', borderRadius: '12px',
        color: '#fff', zIndex: '2147483647', pointerEvents: 'none',
        boxShadow: '0 10px 40px rgba(0,0,0,.45)', textAlign: 'left',
      });
      document.body.appendChild(caja);
      window.addEventListener('keydown', teclas, true);
    }
    visible = true;
    pintar();
    console.log(`%c Rótulos ${set.toUpperCase()} listos — → siguiente · ← anterior · Esc ocultar `,
      'background:#0B7324;color:#fff;padding:3px 6px;border-radius:4px');
  };

  // ── 2. Comentarios de prototipo ──────────────────────────────────────────
  const hs = (n) => new Date(Date.now() - n * 3600 * 1000).toISOString();

  const DEMO = [
    { id: 'demo_c1', autorNombre: 'karla.mnd', sentimiento: 'negativo',
      texto: 'Waited 40 minutes for a table even with a reservation. Nobody apologized. Really disappointing.',
      fechaComentario: hs(1) },
    { id: 'demo_c2', autorNombre: 'j.paredes', sentimiento: 'negativo',
      texto: 'The lomo saltado was cold when it arrived and the waiter never came back to check.',
      fechaComentario: hs(5) },
    { id: 'demo_c3', autorNombre: 'andrea.vq', sentimiento: 'positivo',
      texto: 'Best ceviche in the district, hands down. Coming back this weekend!',
      fechaComentario: hs(9) },
    { id: 'demo_c4', autorNombre: 'mateo_rr', sentimiento: 'neutro',
      texto: 'Do you open on Sundays? And do you take card?',
      fechaComentario: hs(14) },
    { id: 'demo_c5', autorNombre: 'luchosanchez', sentimiento: 'positivo',
      texto: 'Portions are huge for the price. Took half of it home.',
      fechaComentario: hs(22) },
    { id: 'demo_c6', autorNombre: 'p.calderon', sentimiento: 'positivo', respondida: true,
      texto: 'Thanks for sorting out the order mix-up so fast, the manager handled it really well.',
      respuesta: 'Thank you for coming back to tell us! We are glad it was sorted out. See you soon.',
      fechaComentario: hs(30) },
  ].map((c) => ({
    plataforma: 'TIKTOK', externalId: c.id, publicacionId: 'demo_video_1',
    publicacionTitulo: 'Sunday special: how we prep our ceviche',
    respondida: false, respuesta: null, vista: false, notificada: false,
    detectadoEn: c.fechaComentario, ...c,
  }));

  // Estado vivo: responder desde el panel tiene que cambiar la tarjeta igual que
  // en producción, así que el POST se resuelve acá y la siguiente carga lo refleja.
  let estado = DEMO.map((c) => ({ ...c }));

  const fetchOriginal = window.fetch.bind(window);
  let interceptando = false;

  const esListado = (u) => /\/api\/comentarios\/[^/]+(\?|$)/.test(u);
  const esResponder = (u) => /\/api\/comentarios\/([^/]+)\/responder$/.test(u);

  const interceptor = async (entrada, init) => {
    const url = typeof entrada === 'string' ? entrada : (entrada?.url || '');
    const metodo = (init?.method || (typeof entrada === 'object' && entrada?.method) || 'GET').toUpperCase();

    if (interceptando && esResponder(url) && metodo === 'POST') {
      const id = url.match(/\/api\/comentarios\/([^/]+)\/responder$/)[1];
      const fila = estado.find((c) => c.id === id);
      if (fila) {
        let texto = '';
        try { texto = JSON.parse(init?.body || '{}').respuesta || ''; } catch { /* body no-JSON */ }
        fila.respondida = true;
        fila.respuesta = texto;
        fila.vista = true;
        // Latencia fingida: sin ella el cambio es instantáneo y en el video no
        // se llega a leer que hubo una llamada de red.
        await new Promise((r) => setTimeout(r, 550));
        return new Response(JSON.stringify({ mensaje: 'Respuesta publicada', comentario: fila }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const res = await fetchOriginal(entrada, init);

    if (interceptando && esListado(url) && metodo === 'GET' && res.ok) {
      try {
        const datos = await res.clone().json();
        const propios = (datos.comentarios || []).filter((c) => !String(c.id).startsWith('demo_'));
        const todos = [...estado, ...propios];
        datos.comentarios = todos;
        datos.resumen = {
          total: todos.length,
          negativos: todos.filter((c) => c.sentimiento === 'negativo').length,
          sinResponder: todos.filter((c) => !c.respondida).length,
        };
        return new Response(JSON.stringify(datos),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch { return res; }
    }

    return res;
  };

  const api = {
    unico: () => montar('unico'),
    v1: () => montar('v1'),
    v2: () => { montar('v2'); api.datos(); },

    // Después de volver del diálogo de TikTok: repega el snippet y llamá a esto.
    // Retoma en el rótulo donde estabas, sin volver al 1.
    seguir: () => {
      const set = sessionStorage.getItem(LLAVE_SET) || 'unico';
      montar(set, false);
      // Si el cartel de PROTOTYPE ya había pasado, la inyección tiene que volver
      // a estar activa: `pintar` solo la enciende al aterrizar en ese rótulo.
      const i = Number(sessionStorage.getItem(LLAVE_IDX) || 0);
      if ((ROTULOS[set] || []).slice(0, i + 1).some((r) => r.activarDatos)) api.datos();
    },

    ir: (n) => {
      sessionStorage.setItem(LLAVE_IDX, String(Math.max(0, n - 1)));
      api.seguir();
    },

    datos: () => {
      interceptando = true;
      window.fetch = interceptor;
      // Ojo: recargar la página (F5) borra el parche de fetch. Para que el tab
      // vuelva a pedir los datos hay que salir a otro tab y volver a Comments.
      console.log('%c Comentarios de prototipo ACTIVOS ',
        'background:#b42020;color:#fff;padding:3px 6px;border-radius:4px',
        '\n  Cambiá a otro tab y volvé a Comments para que se recarguen.' +
        '\n  NO recargues la página con F5: se pierde el interceptor.');
    },
    datosOff: () => {
      interceptando = false;
      window.fetch = fetchOriginal;
      estado = DEMO.map((c) => ({ ...c }));
      console.log('Comentarios de prototipo desactivados.');
    },
    reiniciar: () => { estado = DEMO.map((c) => ({ ...c })); console.log('Estado de los comentarios reiniciado.'); },
    desinstalar: () => {
      api.datosOff();
      window.removeEventListener('keydown', teclas, true);
      document.getElementById('notoria-demo-rotulo')?.remove();
      caja = null;
    },
  };

  window.NotoriaDemo = api;
  console.log('%c NotoriaDemo listo ', 'background:#0B7324;color:#fff;padding:3px 6px;border-radius:4px',
    '\n  NotoriaDemo.unico()  -> RECOMENDADO: un solo video, el prototipo se activa solo' +
    '\n  NotoriaDemo.seguir() -> al VOLVER del dialogo de TikTok: retoma donde estabas' +
    '\n  NotoriaDemo.ir(4)    -> saltar a un rotulo puntual' +
    '\n  NotoriaDemo.v1()     -> solo el tramo real (si grabas dos archivos)' +
    '\n  NotoriaDemo.v2()     -> solo el tramo prototipo' +
    '\n  NotoriaDemo.desinstalar()');
})();
