// Resuelve la URL del backend según desde dónde se abre la app.
// Si entras desde otra PC de la red (http://192.168.x.x:3001), "localhost"
// apuntaría a ESA máquina — usamos el mismo host con el puerto del backend.
const resolverApiUrl = () => {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const esLocal = host === 'localhost' || host === '127.0.0.1';
    if (!esLocal && (!env || env.includes('localhost') || env.includes('127.0.0.1'))) {
      return `http://${host}:3000`;
    }
  }
  return env || 'http://localhost:3000';
};

export const API_URL = resolverApiUrl();

const getToken = () => {
  try { return localStorage.getItem('bs_token'); } catch { return null; }
};

// ─── Cuenta activa ────────────────────────────────────────
//
// En qué empresa está trabajando el usuario. Vacío = la suya, que es el caso de
// casi todo el mundo. Solo cambia cuando alguien le compartió su cuenta y él
// eligió entrar en ella desde el selector del panel.
//
// Vive en localStorage y no en el token: cambiar de cuenta no puede obligar a
// re-emitir la sesión, y el backend valida la pertenencia en CADA petición
// (lib/equipo.js), así que un valor manipulado aquí no abre ninguna puerta —
// devuelve 403.
export const CLAVE_CUENTA = 'bs_cuenta';

export const cuentaActiva = () => {
  try { return localStorage.getItem(CLAVE_CUENTA) || ''; } catch { return ''; }
};

export const setCuentaActiva = (id) => {
  try {
    if (id) localStorage.setItem(CLAVE_CUENTA, id);
    else localStorage.removeItem(CLAVE_CUENTA);
  } catch {}
};

/**
 * Cabeceras de autenticación para los `fetch` sueltos que hay repartidos por el
 * panel (descargas de PDF, formularios). Devolverlas desde aquí es lo que evita
 * que uno se olvide de X-Cuenta y acabe operando sobre la cuenta equivocada:
 * sin esa cabecera el backend resuelve la cuenta propia y la pantalla responde
 * "negocio no encontrado" sin decir por qué.
 */
export const cabecerasAuth = () => {
  const token = getToken();
  const cuenta = cuentaActiva();
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(cuenta && { 'X-Cuenta': cuenta }),
  };
};

const api = async (url, options = {}) => {
  let res;
  try {
    res = await fetch(`${API_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...cabecerasAuth(),
        ...options.headers,
      },
    });
  } catch (networkErr) {
    // Error de red — backend caído o sin conexión
    const err = new Error('No se puede conectar al servidor. Verifica que el backend esté en ejecución.');
    err.type = 'NETWORK_ERROR';
    throw err;
  }

  // 401 — token inválido o expirado
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Sesión expirada');
    err.status = 401;
    err.tipo = data.tipo;

    // Solo redirigir si NO es la carga inicial del perfil
    if (!url.includes('/api/auth/perfil')) {
      try { localStorage.removeItem('bs_token'); } catch {}
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    throw err;
  }

  const data = await res.json();
  if (!res.ok) {
    // Se conservan `codigo` y `status`: hay respuestas que el llamador necesita
    // distinguir del resto, no solo mostrar (p. ej. PROMO_NO_APLICA en el pago,
    // que ofrece continuar al precio regular en vez de ser un error final).
    const err = new Error(data.error || `Error ${res.status}`);
    err.codigo = data.codigo;
    err.status = res.status;
    err.datos = data;
    throw err;
  }
  return data;
};

export const auth = {
  registro:   (d) => api('/api/auth/registro', { method:'POST', body:JSON.stringify(d) }),
  login:      (d) => api('/api/auth/login',    { method:'POST', body:JSON.stringify(d) }),
  perfil:     ()  => api('/api/auth/perfil'),
  actualizarPerfil: (d) => api('/api/auth/perfil',            { method:'PATCH',  body:JSON.stringify(d) }),
  cambiarPassword:  (d) => api('/api/auth/cambiar-password',  { method:'PATCH',  body:JSON.stringify(d) }),
  eliminarCuenta:   ()  => api('/api/auth/cuenta',            { method:'DELETE' }),
  reenviarVerificacion: () => api('/api/auth/reenviar-verificacion', { method:'POST' }),
  // Invalida TODOS los tokens del usuario, incluido el de este navegador. Hasta
  // ahora el botón del panel solo borraba el token local, que es justo la sesión
  // que no preocupa.
  cerrarSesiones:   ()  => api('/api/auth/cerrar-sesiones', { method:'POST' }),
};

export const negociosApi = {
  listar:    ()       => api('/api/negocios'),
  obtener:   (id)     => api(`/api/negocios/${id}`),
  crear:     (d)      => api('/api/negocios',       { method:'POST',   body:JSON.stringify(d) }),
  actualizar:(id, d)  => api(`/api/negocios/${id}`, { method:'PATCH',  body:JSON.stringify(d) }),
  eliminar:  (id)     => api(`/api/negocios/${id}`, { method:'DELETE' }),
  responderResena: (id, resenaId, respuesta) =>
    api(`/api/negocios/${id}/responder-resena`, { method:'POST', body:JSON.stringify({ resenaId, respuesta }) }),
  configurar: (id, d) => api(`/api/negocios/${id}/configuracion`, { method:'PATCH', body:JSON.stringify(d) }),
  configurarAutoRespuesta: (id, d) => api(`/api/negocios/${id}/auto-respuesta/configurar`, { method:'POST', body:JSON.stringify(d) }),
  competencia: (id) => api(`/api/negocios/${id}/competencia`),
  // Las 5 reseñas que Google le enseña a un desconocido (orden por relevancia),
  // que no son las mismas que vigila el panel (orden por fecha).
  espejo:    (id)     => api(`/api/negocios/${id}/espejo`),
  // Aritmética del rating: cuántas reseñas faltan para cada meta y qué pasa ante
  // una ráfaga de 1★. No gasta cuota de Google: sale del último snapshot.
  simulador: (id)     => api(`/api/negocios/${id}/simulador`),
  // Este mes contra el anterior. Sale de los snapshots guardados, cero llamadas
  // a Google, así que se puede pedir al abrir la ficha. Responde 409 SIN_DATOS
  // cuando todavía no hay historial: la tarjeta debe esconderse, no pintar ceros.
  progreso:  (id)     => api(`/api/negocios/${id}/progreso`),
};

export const alertas = {
  listar:            (p='') => api(`/api/alertas${p}`),
  marcarLeida:       (id)   => api(`/api/alertas/${id}/leer`,   { method:'PATCH' }),
  marcarTodasLeidas: ()     => api('/api/alertas/leer-todas',   { method:'PATCH' }),
  // Alias usados por la página de alertas
  leer:              (id)   => api(`/api/alertas/${id}/leer`,   { method:'PATCH' }),
  leerTodas:         ()     => api('/api/alertas/leer-todas',   { method:'PATCH' }),
};

export const pagos = {
  suscribir: (d) => api('/api/pagos/culqi',  { method:'POST', body:JSON.stringify(d) }),
  estado:    ()  => api('/api/pagos/estado'),
  // Apaga la renovación automática. El plan sigue activo hasta el final del
  // periodo ya pagado — lo dice /devoluciones y así lo hace el backend.
  cancelar:  ()  => api('/api/pagos/cancelar', { method:'POST' }),
  // Datos con los que se emite el comprobante. Obligatorios antes de pagar
  // cuando el importe llega al umbral que exige identificar al comprador.
  datosFiscales:       ()  => api('/api/pagos/datos-fiscales'),
  guardarDatosFiscales:(d) => api('/api/pagos/datos-fiscales', { method:'PUT', body:JSON.stringify(d) }),
};

// Libro de Reclamaciones — endpoint público: la ley no permite exigir registro
// previo para dejar un reclamo, así que no manda sesión.
export const reclamaciones = {
  crear: (d) => api('/api/reclamaciones', { method:'POST', body:JSON.stringify(d) }),
};

export const redes = {
  estado:            (negocioId) => api(`/api/redes/${negocioId}/estado`),
  conectarInstagram: (negocioId) => api(`/api/redes/${negocioId}/instagram/conectar`, { method:'POST' }),
  conectarFacebook:  (negocioId) => api(`/api/redes/${negocioId}/facebook/conectar`, { method:'POST' }),
  conectarTikTok:    (negocioId) => api(`/api/redes/${negocioId}/tiktok/conectar`,    { method:'POST' }),
  // red: 'tiktok' | 'instagram'. Borra los tokens del negocio y, en TikTok,
  // revoca del lado de la plataforma si ningún otro negocio comparte la cuenta.
  desconectar:       (negocioId, red) => api(`/api/redes/${negocioId}/${red}`, { method:'DELETE' }),
};

export const mencionesApi = {
  // filtros: { negocioId, sentimiento, plataforma, archivadas, limite }
  listar: (filtros = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filtros).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return api(`/api/menciones${qs ? `?${qs}` : ''}`);
  },
  marcar:     (id, d)          => api(`/api/menciones/${id}`, { method:'PATCH', body:JSON.stringify(d) }),
  verTodas:   ()               => api('/api/menciones/ver-todas', { method:'PATCH' }),
  eliminar:   (id)             => api(`/api/menciones/${id}`, { method:'DELETE' }),
  configurar: (negocioId, d)   => api(`/api/menciones/negocio/${negocioId}`, { method:'PATCH', body:JSON.stringify(d) }),
};

export const comentariosApi = {
  listar: (negocioId, filtros = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filtros).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return api(`/api/comentarios/${negocioId}${qs ? `?${qs}` : ''}`);
  },
  responder: (id, respuesta) => api(`/api/comentarios/${id}/responder`, { method:'POST', body:JSON.stringify({ respuesta }) }),
  // Retira la respuesta que el negocio publicó, para poder reescribirla.
  borrarRespuesta: (id) => api(`/api/comentarios/${id}/respuesta`, { method:'DELETE' }),
  // accion: 'ocultar' | 'fijar' | 'like'. Con `activar:false` se revierte.
  moderar: (id, accion, activar = true) =>
    api(`/api/comentarios/${id}/moderar`, { method:'POST', body:JSON.stringify({ accion, activar }) }),
  marcarVista: (id) => api(`/api/comentarios/${id}`, { method:'PATCH', body:JSON.stringify({ vista:true }) }),
};

export const competidoresApi = {
  listarTodos: ()               => api('/api/competidores'),
  listar:      (negocioId)      => api(`/api/competidores/${negocioId}`),
  agregar:     (negocioId, d)   => api(`/api/competidores/${negocioId}`, { method:'POST', body:JSON.stringify(d) }),
  eliminar:    (id)             => api(`/api/competidores/${id}`, { method:'DELETE' }),
  analizar:    (negocioId, competidorId) =>
    api('/api/ia/analisis-competidor', { method:'POST', body:JSON.stringify({ negocioId, competidorId }) }),
};

export const equipoApi = {
  // Estado del equipo de la cuenta activa. Lo puede pedir cualquier rol.
  estado:     ()        => api('/api/equipo'),
  cuentas:    ()        => api('/api/equipo/cuentas'),
  invitar:    (d)       => api('/api/equipo/invitar', { method:'POST', body:JSON.stringify(d) }),
  reenviar:   (id)      => api(`/api/equipo/invitaciones/${id}/reenviar`, { method:'POST' }),
  cancelar:   (id)      => api(`/api/equipo/invitaciones/${id}`, { method:'DELETE' }),
  actualizar: (id, d)   => api(`/api/equipo/miembros/${id}`, { method:'PATCH', body:JSON.stringify(d) }),
  quitar:     (id)      => api(`/api/equipo/miembros/${id}`, { method:'DELETE' }),
  salir:      (cuentaId)=> api('/api/equipo/salir', { method:'POST', body:JSON.stringify({ cuentaId }) }),
  // Sin sesión: la usa la página de invitación antes de que el invitado tenga cuenta.
  verInvitacion: (token) => api(`/api/equipo/invitacion/${token}`),
  aceptar:       (token) => api(`/api/equipo/invitacion/${token}/aceptar`, { method:'POST' }),
};

export const utils = {
  buscarNegocio:   (q, tipo, region) =>
    api(`/api/utils/buscar-negocio?q=${encodeURIComponent(q)}&tipo=${tipo}&region=${region}`),
  monitoreoManual: (negocioId) => api('/api/utils/monitoreo-manual', { method:'POST', body:JSON.stringify({ negocioId }) }),
  generarReporte:  () => api('/api/utils/generar-reporte', { method:'POST' }),
};

export default api;
