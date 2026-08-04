# Screen Recordings — guion para la pregunta 8 del Accounts API Form

**Un solo video de ~2:20.** El formulario no exige separarlo, y un archivo continuo es mejor:
con dos archivos existe el riesgo de que el revisor vea solo el primero y nunca llegue al
tramo del prototipo, que es justo donde está el permiso que más pesa (Account Comment).

El objetivo del revisor de TikTok es uno solo: comprobar que **cada sub-permiso que pediste
corresponde a una pantalla real del producto**. Pediste 4 (Account User, Get Account Media,
Account Comment, Auth Code Management); si los 4 aparecen rotulados, la revisión se vuelve
mecánica.

La única condición del formato único es que **la frontera entre lo real y el prototipo sea
inconfundible**: el cartel rojo a pantalla completa, quieto unos segundos. Está automatizado
en el snippet.

> Si preferís dos archivos, el guion de más abajo funciona igual: usá `NotoriaDemo.v1()` y
> `NotoriaDemo.v2()` en vez de `NotoriaDemo.unico()`, y cortá en el cartel de PROTOTYPE.

## Qué es "rotular"

Un letrero sobreimpreso en el video que nombra el permiso y el endpoint detrás de lo que se
está viendo. Cuando en pantalla aparece la cuenta conectada con su avatar, abajo se lee
`Account User — GET /business/get/`. No es obligatorio del formulario; es lo que evita que el
revisor tenga que adivinar el mapeo.

Se rotula con `demo-overlay.js` (misma carpeta): se pega entero en la consola del navegador
(F12 → Console) y dibuja el cartel encima de la página. `→` avanza, `←` retrocede, `Esc` lo
oculta. Cero edición posterior.

---

## Antes de grabar

1. **Panel en inglés.** Dashboard → **Configuración** → selector de idioma → EN. El i18n ya
   cubre `conexiones`, `negocios/[id]` y el tab Comments.
2. **Cuenta demo, no un cliente real.** Ningún nombre, teléfono o reseña de un negocio ajeno
   en pantalla. El plan del usuario tiene que ser NEGOCIO o FRANQUICIA: `/api/comentarios`
   está detrás de `verificarPlan`, y con plan gratis el tab devuelve 403.
3. **Ventana limpia.** Navegador maximizado, sin barra de marcadores, sin pestañas de más,
   sin notificaciones de Windows. Zoom del navegador al 110–125 % para que el texto se lea
   en el reproductor de TikTok.
4. **Grabador.** Alcanza el de Windows: `Win + Alt + R` (Xbox Game Bar) graba la ventana
   activa. Si querés recortar o unir, Clipchamp ya viene instalado.
5. **Sin audio.** Nadie lo va a escuchar y una narración en español no ayuda. Todo el mensaje
   va en los rótulos.

---

## El video, toma por toma

Pegá `demo-overlay.js` en la consola y ejecutá `NotoriaDemo.unico()`. Avanzás con `→` a medida
que grabás; el prototipo se enciende **solo** al llegar al rótulo 6, así que todo lo anterior
es tráfico real contra la API.

### Parte A — flujo real (0:00–1:20)

Esto es grabable hoy: el OAuth, el perfil y `video.list` ya corren en producción.

| # | En pantalla | Rótulo | Seg. |
|---|---|---|---|
| 1 | Dashboard ya logueado, vista general | `Notoria — reputation dashboard` | 0–8 |
| 2 | Ir a **Connections**, fila TikTok, clic en **Connect** | `Connections → TikTok` | 8–20 |
| 3 | Pantalla de consentimiento de TikTok, con los permisos a la vista | `TikTok's own consent screen` | 20–40 |
| 4 | Vuelta al panel: cuenta conectada con nombre, @usuario y avatar | `Account User — GET /business/get/` | 40–55 |
| 5 | Ficha del negocio → tab **Comments** → **Your latest videos** con título, fecha y contador de comentarios | `Get Account Media — GET /business/video/list/` | 55–80 |

> ⚠️ **El overlay desaparece en el paso 3 y no vuelve solo.** `conexiones/page.js` hace
> `window.location.href = url`, así que el OAuth navega fuera del sitio en la misma pestaña y
> la vuelta es una carga nueva de página. Se resuelve grabando en dos tramos y uniéndolos:
>
> 1. Grabá los pasos 1–2 y cortá la grabación justo después del clic en **Connect**.
> 2. Grabá el paso 3 aparte (la pantalla de TikTok no lleva rótulo: se explica sola, y el
>    cartel encima taparía los permisos que el revisor quiere leer).
> 3. Ya de vuelta en el panel: F12, pegá el snippet otra vez y ejecutá
>    **`NotoriaDemo.seguir()`** — retoma en el rótulo 4, no vuelve al 1. Cerrá F12 y grabá el
>    resto de un tirón.
> 4. En Clipchamp pegás los tres clips. El corte queda invisible: son cambios de pantalla que
>    de todos modos ocurren.
>
> El índice sobrevive el viaje porque vive en `sessionStorage`, que es de la misma pestaña y
> el mismo origen. Si algo se desincroniza, `NotoriaDemo.ir(4)` salta al rótulo que quieras.

Detalles que importan:
- **El paso 3 es el más valioso del video.** Que se vea completa la pantalla de TikTok, sin
  cortes, y que el clic de "Authorize" lo dé el dueño. Es la prueba de que la autorización no
  se obtiene por otra vía.
- Si la sesión de TikTok ya está autorizada y el diálogo se salta, usá el botón
  **Reconnect** de Connections — está justamente para eso.
- Movete despacio. Un cursor que salta de un lado a otro se lee como video acelerado.

---

### Parte B — prototipo (1:20–2:20)

Los comentarios todavía no se pueden leer (§15-quinquies: la Display API no expone esas
rutas — eso es lo que estás pidiendo). El formulario acepta prototipos de forma explícita.

Al pasar al rótulo 6 el snippet activa solo los comentarios de ejemplo, interceptando
`/api/comentarios/...` en el navegador. **La UI es la real** — las mismas tarjetas, los mismos
filtros, el mismo modal de respuesta; lo único simulado es el origen de los datos. No escribe
en la base de datos y se va al recargar.

| # | En pantalla | Rótulo | Seg. |
|---|---|---|---|
| 6 | Cartel rojo sobre el tab Comments, **quieto 4 s** | `PROTOTYPE — blocked pending Accounts API approval` | 80–85 |
| 7 | Lista de comentarios cargada, con autor y texto | `Account Comment — GET /business/comment/list/` | 85–98 |
| 8 | Los badges de sentimiento y los contadores Total / Negative / Unanswered | `Automatic sentiment classification` | 98–108 |
| 9 | La alerta: **Alertas** del panel, o el correo/WhatsApp en el celular | `Alert outside TikTok` | 108–118 |
| 10 | Abrir **Reply** en el comentario negativo, escribir, enviar | `POST /business/comment/reply/create/` | 118–132 |
| 11 | La tarjeta pasa a **Answered** con la respuesta debajo | `Marked as answered` | 132–138 |
| 12 | Connections → tuerca junto a **Connected** → modal → **Remove connection** | `Disconnect - tokens deleted, calls stop` | 138–145 |
| 13 | Quedarse quieto en esa vista para cerrar | `Only accounts that authorized us` | 145–150 |

Detalles que importan:
- **El cartel de PROTOTYPE tiene que quedarse quieto y leerse.** Sale en rojo justamente para
  eso: es la frontera entre lo real y lo simulado. Declararlo suma; disimularlo hunde la
  solicitud. Contá 4 segundos antes de seguir.
- El paso 4 es el argumento central de la pregunta 7 (por qué la API y no la app nativa):
  la alerta sale **fuera** de TikTok. Si podés mostrar el correo real que manda el sistema,
  mejor que la lista de alertas del panel.
- El paso 7 responde la pregunta que todo revisor de permisos se hace: qué pasa cuando el
  usuario revoca. Que se vea que hay un botón.
- **No recargues la página con F5 durante este video.** El interceptor vive en memoria y se
  pierde al recargar. Para que la lista se refresque, salí a otro tab de la ficha y volvé a
  Comments; si recargaste, volvé a pegar el snippet.
- Al venir seguido de la Parte A, la conexión de TikTok está recién hecha y el token vigente.
  Si grabás la Parte B por separado y en otro momento, reconectá antes: con el token vencido
  el panel muestra el aviso de reconectar y arruina la toma.
- Si tenés que rehacer una toma, `NotoriaDemo.reiniciar()` devuelve el comentario a
  "sin responder".
- Al terminar: `NotoriaDemo.desinstalar()` o simplemente recargar.

---

## Al subir

- MP4, 1080p, un solo archivo: `notoria-tiktok-accounts-api-demo.mp4`.
- Si lo grabaste en dos partes, unilas en Clipchamp con 1 s de negro entre medio, o subilas
  como `notoria-1-authorization-and-media.mp4` y `notoria-2-comments-prototype.mp4` — el
  nombre ya le dice al revisor qué va a ver.
- Que ningún cuadro muestre tokens, la pestaña Network abierta, ni la consola con el snippet
  pegado. Cerrá DevTools después de ejecutar el comando: el overlay sigue vivo sin la consola
  abierta.
