// brand-shield/src/lib/menciones.js
// Piezas compartidas de la escucha de menciones entre el worker (que busca) y
// las rutas (que le muestran al usuario qué se está buscando y con qué fuentes).
// Fuente única de esas dos respuestas para que el panel no pueda mentir.

const tiktokMenciones = require('../scrapers/tiktokMenciones.scraper');
const instagramMenciones = require('../scrapers/instagramMenciones.scraper');
const { instagramVisiblePara } = require('./instagramVisible');

// Tope de términos por negocio. No es una restricción de plan: las APIs de
// búsqueda tienen un largo máximo de query, y más allá de esto la búsqueda
// empieza a traer ruido en vez de señal.
const MAX_TERMINOS = 8;

/**
 * Términos que se buscan para un negocio: su nombre + lo que el usuario haya
 * agregado en `terminosMencion` (separados por coma).
 *
 * Se descartan los términos de menos de 3 caracteres: buscar "Ok" o "La" trae
 * ruido infinito y, con proveedores que cobran por resultado, ruido caro.
 */
const construirTerminos = (negocio) => {
  const extras = (negocio.terminosMencion || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const todos = [negocio.nombre, ...extras]
    .map((t) => (t || '').trim())
    .filter((t) => t.length >= 3);

  // Dedupe sin distinguir mayúsculas, conservando el orden y la forma original
  const vistos = new Set();
  const unicos = [];
  for (const t of todos) {
    const clave = t.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicos.push(t);
  }

  return unicos.slice(0, MAX_TERMINOS);
};

// Catálogo interno de fuentes. `disponible()` se evalúa en cada llamada, no al
// cargar el módulo, para que agregar una credencial en Railway encienda la
// fuente con solo reiniciar el backend.
//
// Recibe el USUARIO porque una fuente puede estar encendida para unos y no para
// otros: Instagram está oculto hasta que Meta apruebe el App Review, salvo para
// las cuentas de prueba con las que se revisa (ver lib/instagramVisible.js).
const FUENTES = [
  { id: 'TIKTOK', nombre: 'TikTok', disponible: () => tiktokMenciones.configurado() },
  // Instagram no busca términos: recibe las publicaciones donde etiquetaron a la
  // cuenta. `disponible()` mira las credenciales de la app, que son globales, y
  // el interruptor de visibilidad; que un negocio concreto tenga o no Instagram
  // conectado lo resuelve el scraper devolviendo [].
  {
    id: 'INSTAGRAM',
    nombre: 'Instagram',
    disponible: (usuario) => instagramMenciones.configurado() && instagramVisiblePara(usuario),
  },
];

/**
 * Solo las fuentes que HOY funcionan de verdad para ESTE usuario.
 *
 * Decisión de producto (2026-07-29): una fuente que no podemos entregar
 * sencillamente NO EXISTE para el cliente — no se lista como "próximamente" ni
 * con el motivo por el que falta. Anunciar algo que no se puede cumplir es peor
 * que no ofrecerlo: invita a preguntar por una fecha que no tenemos.
 *
 * Por eso esto devuelve una lista filtrada y sin campo `motivo`: no hay forma de
 * que la UI muestre por accidente una fuente apagada.
 *
 * @param {{email?: string}|null} usuario  Normalmente `req.usuario`.
 */
const fuentesDisponibles = (usuario) =>
  FUENTES.filter((f) => f.disponible(usuario)).map(({ id, nombre }) => ({ id, nombre }));

// Si esto es false, la sección de menciones no se le muestra a ESE usuario en
// ninguna parte (ver el nav del dashboard y GET /api/auth/perfil).
const hayFuenteDisponible = (usuario) => FUENTES.some((f) => f.disponible(usuario));

module.exports = { construirTerminos, fuentesDisponibles, hayFuenteDisponible, MAX_TERMINOS };
