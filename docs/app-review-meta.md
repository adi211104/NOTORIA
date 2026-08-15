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

## 2. Permisos que se piden — DECISIÓN: 6, con `business_management` y sin `ads_read`

**Esta decisión se tomó dos veces el mismo día, y la segunda es la buena.**
Primero se cerró en 5 permisos con este argumento: *Meta exige demostrar cada
permiso en el screencast, y `business_management` no se puede enseñar funcionando
sin un cliente que tenga la página en un portfolio*. Horas después, al
diagnosticar por qué la dueña no lograba conectarse, se descubrió que **ese
cliente es la propia dueña**: su página está en el portfolio Notoria y sin
`business_management` la conexión devuelve cero páginas. Probado y confirmado
(§19-quinquies del CLAUDE.md).

Eso tumba el argumento original —ahora sí se demuestra en el vídeo, con un caso
real— y añade uno nuevo: **sin `business_management` no hay screencast que
grabar**, porque la cuenta de la dueña no conecta.

`ads_read` **NO se pide.** La §19.7 avisaba de que Meta podría exigirlo cuando el
rol sobre la página viene de Business Manager, pero la prueba del 2026-08-14
demuestra que **no hace falta**: la conexión funcionó solo con
`business_management`. Pedir permisos de anuncios en una herramienta de
reputación es lo que dispara el escrutinio, y hay evidencia de que sobra.

| Permiso | Para qué lo usa Notoria | Dónde se ve en el video |
|---------|-------------------------|--------------------------|
| `instagram_basic` | Identificar la cuenta profesional conectada (id, usuario, foto) y listar sus publicaciones | Al volver del OAuth, la ficha muestra el @usuario y la foto |
| `instagram_manage_comments` | Leer los comentarios de las publicaciones del propio negocio, publicar la respuesta y borrar la respuesta propia | Pestaña **Comentarios** → responder → borrar la respuesta |
| `pages_show_list` | Listar las páginas que administra el usuario, para encontrar la que tiene `instagram_business_account` | Pantalla de autorización de Facebook |
| `pages_read_engagement` | Resolver el vínculo página ↔ Instagram y leer los datos de la página necesarios para esa resolución | Mismo paso, es lo que permite completar la conexión |
| `pages_manage_metadata` | Suscribir la página a los webhooks para recibir comentarios nuevos en tiempo real | Se explica en la narración: es lo que hace que un comentario nuevo aparezca solo |
| `business_management` | Listar las páginas que pertenecen a un **portfolio comercial**. Sin él, `/me/accounts` devuelve vacío para cualquier negocio que haya verificado su empresa, trabajado con agencia o corrido anuncios | La conexión de la propia cuenta demo: su página está en un portfolio, y es la única forma de que aparezca |

⚠️ Los permisos **tienen que estar también en la Configuración de la consola**
(`config_id`), no solo en la lista del formulario. Si falta uno allí, el token no
lo trae. Le pasó a `pages_manage_metadata` y a `business_management`.

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
> Used exclusively to subscribe the connected Page to our webhook so that new
> Instagram comments reach Notoria in real time instead of waiting for the
> periodic scan. This matters because our product promise is fast detection of a
> negative comment. We do not modify any other Page setting.

**business_management**
> Our customers are restaurants and hotels. In practice most of them have their
> Facebook Page inside a Business Portfolio — because they verified their
> business, ran ads at some point, or work with a marketing agency. For those
> accounts `/me/accounts` returns an empty list unless the app has
> `business_management`, so the owner grants every permission correctly, sees
> the success screen, and the connection still fails with no explanation. We use
> this permission for one thing only: to list the Pages the user administers
> through their Business Portfolio, so we can find the one linked to their
> Instagram professional account. We do not create, modify or delete any
> business asset, we do not read or manage ad accounts, and we do not access any
> business the user has not explicitly selected during authorization.

### Instrucciones de prueba (campo "Test instructions", en inglés)

> 1. Go to https://usenotoria.app/login
> 2. Sign in with the test account: **revisormeta@usenotoria.app** /
>    **NotoriaMeta2026** (email already verified, BUSINESS plan enabled).
> 3. In the left menu open **Conexiones** (Connections).
> 4. Click **Conectar** on the Instagram card. You will be redirected to the
>    Facebook authorization dialog.
> 5. Authorize a Facebook Page that is linked to an Instagram professional
>    account. The Page may belong to a Business Portfolio; that is precisely the
>    case `business_management` covers.
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
9. **Narrar `pages_manage_metadata`**: explicar que la suscripción al webhook es
   lo que hace que un comentario nuevo aparezca sin recargar.
   ⚠️ **No intentar demostrarlo en vivo: es imposible hoy.** Meta exige *Advanced
   Access* para entregar notificaciones del campo `comments`, y eso llega
   justamente con esta aprobación. Comprobado el 2026-08-14: con el webhook bien
   suscrito y verificado, un comentario real **no genera ningún evento**. Narrarlo
   y seguir; grabar un intento fallido sería peor que no enseñarlo.
10. **Desconectar** — Conexiones → tuerca → Eliminar conexión. Cierra el ciclo y
    demuestra que el usuario controla sus datos.

---

## 5. Limitación conocida (y qué se responde si Meta pregunta)

Queda **una** sola, y no se resuelve pidiendo permisos: un negocio **sin cuenta
de Facebook** no puede conectarse, porque el sabor *Facebook Login* exige una
página y que el dueño tenga rol sobre ella (§19.8 del CLAUDE.md). Una cuenta
profesional de Instagram no necesita página, así que quien abrió su Instagram con
el móvil y nunca usó Facebook se queda fuera.

**Se resuelve en una segunda pasada** añadiendo el sabor *Instagram Login*
(`graph.instagram.com`), que es aditivo pero cuesta su propio App Review, un flag
en `Negocio` para saber con qué sabor se conectó cada cuenta, y pierde `/tags`
aunque conserva las @menciones. No se mezcla con esta revisión.

Si Meta pregunta por qué pedimos `business_management`: porque sin él nuestros
propios clientes no pueden conectarse. Está en §2, con el caso real que lo
demuestra.

Si Meta pregunta por qué NO pedimos `ads_read` o `ads_management`: porque no los
usamos. Notoria no lee ni gestiona anuncios. Se comprobó que la conexión se
completa sin ellos.

---

## 6. Checklist antes de darle a Enviar

- [x] ✅ **Cuenta demo: ya no hace falta ninguna.** Con `business_management` la
      cuenta de la propia dueña conecta — verificado el 2026-08-14: página
      *Notoria* `1211927292012805` + Instagram `@notoriaapp`
      `17841443218774198`. Todo el trabajo previo de "crear una cuenta demo
      limpia fuera del portfolio" **queda sin objeto**.
- [x] ✅ `business_management` añadido a la Configuración `4655107931374707`.
- [x] ✅ Webhook del objeto `instagram` suscrito en la app **correcta**
      (`2232447584255257`), campo `comments`, handshake verificado en los logs.
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
