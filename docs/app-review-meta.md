# App Review de Meta — paquete de envío

Todo lo que hay que pegar en el formulario de *Revisión de la app*, más las
trampas que ya costaron tiempo. **Escrito el 2026-08-14** porque hasta ahora los
textos solo existían en una conversación del 03/08: si esa conversación se
pierde, hay que reescribirlos desde cero.

> Contexto técnico completo en `CLAUDE.md` §19, §19-bis, §19-ter y §20. Este
> documento es el operativo: qué se envía y en qué orden.

---

## 1. Datos de la app

| Dato | Valor |
|------|-------|
| App | **Notoria** — ID `2232447584255257` (tipo **Negocio**) |
| Portfolio comercial | Notoria — `1337974595147527`, **Verificado** |
| Modo de la app | **Activo** |
| Producto de login | **Facebook Login for Business** (⚠️ NO "Instagram Login", ver §19.4 del CLAUDE.md) |
| Configuración de permisos | `META_LOGIN_CONFIG_ID = 4655107931374707` |
| Redirect URI | `https://api.usenotoria.app/api/redes/instagram/callback` |
| App de Instagram (webhooks) | `1305555994987658` — secreto propio, en `META_IG_APP_SECRET` |

Comprobado el 2026-08-14: el diálogo de OAuth responde 200 nombrando "Notoria",
sin *Invalid Scopes*, y el secreto de la app es válido.

---

## 2. Permisos que se piden — DECISIÓN TOMADA: los 5, ni uno más

Decidido el 2026-08-14 (la §19-bis lo dejaba abierto). El motivo: **Meta exige
demostrar cada permiso en el screencast**, y estos cinco se ven en el flujo real
que ya funciona. `business_management` y `ads_read` no se podrían enseñar
funcionando sin un cliente con portfolio, y pedir permisos de anuncios en una
herramienta de reputación dispara el escrutinio. Ver §5 (limitaciones).

| Permiso | Para qué lo usa Notoria | Dónde se ve en el video |
|---------|-------------------------|--------------------------|
| `instagram_basic` | Identificar la cuenta profesional conectada (id, usuario, foto) y listar sus publicaciones | Al volver del OAuth, la ficha muestra el @usuario y la foto |
| `instagram_manage_comments` | Leer los comentarios de las publicaciones del propio negocio, publicar la respuesta y borrar la respuesta propia | Pestaña **Comentarios** → responder → borrar la respuesta |
| `pages_show_list` | Listar las páginas que administra el usuario, para encontrar la que tiene `instagram_business_account` | Pantalla de autorización de Facebook |
| `pages_read_engagement` | Resolver el vínculo página ↔ Instagram y leer los datos de la página necesarios para esa resolución | Mismo paso, es lo que permite completar la conexión |
| `pages_manage_metadata` | Suscribir la página a los webhooks (`/me/subscribed_apps`) para recibir comentarios nuevos en tiempo real | Se explica en la narración: es lo que hace que un comentario nuevo aparezca solo |

⚠️ `pages_manage_metadata` **tiene que estar también en la Configuración de la
consola**, no solo en la lista del formulario. Si falta allí, el token no lo trae
y la suscripción al webhook falla en silencio: la conexión funciona y los
webhooks no llegan nunca (§19 del CLAUDE.md).

### Textos en inglés (para pegar en "How will you use this permission?")

**instagram_basic**
> Notoria is a reputation-monitoring tool for restaurants and hotels in Peru.
> After a business owner connects their Instagram professional account, we use
> `instagram_basic` to read the account's basic profile (ID, username, name and
> profile picture) so the dashboard can show which account is connected, and to
> list the account's own media in order to fetch the comments on it. We do not
> access any account other than the one the user explicitly connects.

**instagram_manage_comments**
> This is the core of the product. We read the comments left on the business's
> own Instagram media so the owner can see them together with their Google
> reviews in a single inbox, detect negative feedback early, and reply. The
> owner writes the reply inside Notoria and we publish it to the comment thread.
> We also allow deleting a reply that Notoria itself published. We never delete
> comments written by other people, and we never post anything the owner has not
> written or approved.

**pages_show_list**
> Notoria connects to Instagram through the Facebook Login flow, so we need to
> find the Facebook Page that is linked to the user's Instagram professional
> account. We call `/me/accounts` to list the Pages the user administers, and we
> select the one that has an `instagram_business_account`. The list is used only
> at connection time to resolve that link; we do not store or display the other
> Pages.

**pages_read_engagement**
> Required to read the Page data that resolves the Page-to-Instagram link
> (`instagram_business_account`) and to access the connected Instagram account's
> content through that Page. Without it the connection cannot be completed. It
> is also required by the Instagram mentions endpoints we use to show the
> business posts where customers tagged them.

**pages_manage_metadata**
> Used exclusively to subscribe the connected Page to our webhook
> (`POST /{page-id}/subscribed_apps` with the `comments` field) so that new
> Instagram comments reach Notoria in real time instead of waiting for the
> periodic scan. This matters because our product promise is fast detection of a
> negative comment. We do not modify any other Page setting.

### Instrucciones de prueba (campo "Test instructions", en inglés)

> 1. Go to https://usenotoria.app/login
> 2. Sign in with the test account: **revisormeta@usenotoria.app** /
>    **NotoriaMeta2026** (email already verified, BUSINESS plan enabled).
> 3. In the left menu open **Conexiones** (Connections).
> 4. Click **Conectar** on the Instagram card. You will be redirected to the
>    Facebook authorization dialog.
> 5. Authorize a Facebook Page that is linked to an Instagram professional
>    account. Note: the Page must NOT belong to a Business Portfolio — see
>    "Known limitation" below.
> 6. You are returned to Notoria. The Instagram account appears as connected,
>    showing its username and profile picture (`instagram_basic`).
> 7. Open the business from **Negocios** and select the **Comentarios** tab.
>    Comments from the account's own posts are listed
>    (`instagram_manage_comments`).
> 8. Type a reply and send it: it is published on Instagram. You can then delete
>    that same reply from Notoria.
> 9. To disconnect: **Conexiones** → gear icon on the Instagram card →
>    **Eliminar conexión**.
>
> The app does not require payment to test any of this. There is no geo-blocking.
> The interface is available in Spanish and English (language switch in the top
> bar).

---

## 3. Cuenta de prueba

| | |
|---|---|
| Usuario | `revisormeta@usenotoria.app` |
| Contraseña | `NotoriaMeta2026` |
| Plan | **NEGOCIO** (los comentarios y menciones están limitados por plan) |
| Email | **ya verificado** a propósito |

Creada el 2026-08-14 con
`node scripts/cuenta-revisor.js revisormeta@usenotoria.app NotoriaMeta2026 NEGOCIO`
y comprobada contra producción (`POST /api/auth/login` → 200, plan NEGOCIO).

**Por qué el email va pre-verificado:** el enlace de verificación llega al buzón
del dueño, no al del revisor, y la franja amarilla de "verifica tu correo" se lee
como una restricción del producto.

**Por qué plan NEGOCIO y no GRATIS:** al revés que en la revisión de Culqi. Allí
GRATIS era obligatorio para que el revisor pudiera *comprar*; aquí hace falta que
las funciones de Instagram estén disponibles.

---

## 4. Screencast — guion

Requisitos de Meta: se ve la pantalla completa, se muestra el flujo entero sin
cortes, y **cada permiso pedido tiene que verse en uso**.

**Grabar en inglés.** El panel de Meta y el de Notoria se autodetectan según el
idioma del navegador: poniendo el navegador en inglés se evita el requisito de
subtítulos que Meta exige para vídeos en otro idioma.

Toma por toma:

1. **Login** — https://usenotoria.app/login con la cuenta de prueba. Que se vea
   el correo escrito.
2. **Panel** — pantalla inicial, para que quede claro qué es el producto.
3. **Conexiones** → tarjeta de Instagram → **Conectar**.
4. **Diálogo de Facebook** — aquí se ven `pages_show_list` y
   `pages_read_engagement`. Pasar despacio por la pantalla de selección de
   página y por la lista de permisos. **No cortar este trozo**: es el que Meta
   mira con lupa.
5. **Vuelta a Notoria** — la cuenta aparece conectada con @usuario y foto
   (`instagram_basic`).
6. **Negocios → ficha → pestaña Comentarios** — se listan los comentarios
   (`instagram_manage_comments`).
7. **Responder** un comentario desde Notoria y enseñar la respuesta publicada en
   Instagram (abrir la publicación en otra pestaña ayuda mucho).
8. **Borrar** esa misma respuesta desde Notoria.
9. **Narrar `pages_manage_metadata`**: explicar que la suscripción de la página
   al webhook es lo que hace que un comentario nuevo aparezca sin recargar. Si
   se puede, dejar un comentario desde otra cuenta y enseñarlo llegando solo.
10. **Desconectar** — Conexiones → tuerca → Eliminar conexión. Cierra el ciclo y
    demuestra que el usuario controla sus datos.

---

## 5. Limitación conocida (y qué se responde si Meta pregunta)

Un negocio cuya página esté dentro de un **portfolio comercial** no puede
conectarse todavía: `/me/accounts` devuelve vacío sin `business_management`
(§19-bis). Y un negocio **sin cuenta de Facebook** tampoco, porque este sabor la
exige (§19.8).

**Las dos se resuelven en una segunda pasada, juntas**, porque atacan el mismo
problema y merecen un diseño conjunto: `business_management` por un lado y
adoptar el sabor *Instagram Login* por otro. No se mezclan con esta revisión.

Si Meta pregunta por qué no pedimos `business_management`: porque no lo usamos.
El flujo que enviamos funciona sobre páginas administradas a título personal.

---

## 6. Checklist antes de darle a Enviar

- [ ] **Cuenta demo limpia creada** (es lo único que falta y solo puede hacerlo
      el usuario): Instagram profesional **nuevo** + página **nueva** creada
      desde el perfil personal, vinculados entre sí y **fuera de todo
      portfolio**. `@notoriaapp` y `@priad111` NO sirven: ya son activos del
      portfolio y repiten el bucle.
- [ ] 🔍 **Checkpoint que ahorra una noche:** antes de pulsar Conectar, mirar
      *portfolio → Cuentas → Páginas*. Si la página nueva aparece ahí, **parar**.
- [ ] Conectar esa cuenta desde Notoria y comprobar que llegan comentarios.
- [ ] Los 5 permisos, `pages_manage_metadata` incluido, están en la
      **Configuración** de la consola (no solo en el formulario).
- [ ] Condiciones y Eliminación de datos **no** apuntan a `facebook.com`
      (Meta los rellena así por defecto y con eso rechaza).
- [ ] Correo de contacto de la app = el **Gmail**, no `hola@usenotoria.app`
      (ese alias reenvía por Cloudflare y el reenvío nunca se verificó; por ahí
      llega el veredicto).
- [ ] Screencast grabado en inglés siguiendo §4.
- [ ] Textos de §2 pegados permiso por permiso.
- [ ] Instrucciones de prueba de §2 con las credenciales de §3.

---

## 7. Pendiente aparte, no bloquea el envío

**Rotar `META_APP_SECRET`.** Se compartió por chat el 2026-08-06 y sigue sin
rotarse (verificado el 2026-08-14: el secreto actual es válido, o sea el mismo).
Al rotarlo hay que recargarlo en Railway o el OAuth deja de funcionar con un
error genérico de credenciales que no menciona el secreto. Ese secreto **también
firma los webhooks**, así que Meta empieza a firmar con el nuevo de inmediato.
