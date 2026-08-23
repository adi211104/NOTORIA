// brand-shield/src/lib/facebookVisible.js
// Interruptor de visibilidad de Facebook Reviews, gemelo del de Instagram.
//
// POR QUÉ EXISTE, y por qué NO es lo mismo que dejarlo a medias. La cabecera de
// `scrapers/facebook.scraper.js` decía en rojo «no terminar este archivo hasta
// tener el permiso concedido», y tenía razón para lo que advertía: escribir un
// cliente contra un endpoint que nadie ha visto responder es lo que pasó con
// `obtenerComentariosTikTok`, que apuntó meses a una ruta inexistente y pasaba
// todas las pruebas con mocks.
//
// Acá la situación es distinta en el punto que importa: `/{page-id}/ratings`
// **está documentado y verificado que existe** en v26.0, con los campos del nodo
// `Recommendation` enumerados. Lo que falta no es saber si responde, es el
// permiso `pages_read_user_content` para poder llamarlo. Así que el riesgo real
// no es «el código está escrito a ciegas», es «un cliente pulsa Conectar y
// recibe un error que no puede resolver».
//
// Ese riesgo es exactamente el que resolvió el interruptor de Instagram, y por
// eso Facebook usa el mismo mecanismo en vez de quedarse sin escribir:
//
//   · el código queda listo y con pruebas, no a medio hacer
//   · nadie lo ve hasta que Meta conceda el permiso
//   · encenderlo el día que aprueben es UNA variable, sin desplegar
//
// ⚠️ Lo que sigue sin poder hacerse hasta tener el permiso, y hay que hacerlo
// antes de encender esto para todos: **una llamada real contra una página con
// reseñas**. Las pruebas cubren la forma documentada de la respuesta, no la
// respuesta de verdad. Ver `docs/app-review-meta.md` §8.
//
// Variables de entorno:
//   FACEBOOK_ACTIVO=true                 → visible para todos (post-aprobación)
//   FACEBOOK_CUENTAS_PRUEBA=a@b.c,d@e.f  → correos que lo ven mientras tanto

const activoParaTodos = () => process.env.FACEBOOK_ACTIVO === 'true';

// Se lee en cada llamada, no al cargar el módulo: cambiar la variable en Railway
// surte efecto con solo reiniciar, sin tocar código.
const cuentasPrueba = () =>
  (process.env.FACEBOOK_CUENTAS_PRUEBA || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

/**
 * ¿Este usuario puede ver y conectar Facebook?
 * @param {{email?: string}|null|undefined} usuario  Normalmente `req.usuario`.
 */
const facebookVisiblePara = (usuario) => {
  if (activoParaTodos()) return true;
  const email = String(usuario?.email || '').trim().toLowerCase();
  return !!email && cuentasPrueba().includes(email);
};

module.exports = { facebookVisiblePara, activoParaTodos };
