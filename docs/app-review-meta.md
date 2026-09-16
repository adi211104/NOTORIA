# App Review de Meta — paquete de envío

> ## 🚩 ESTADO: ENVIADA el 2026-08-15, con **5 permisos**, no 6
>
> `business_management` **quedó fuera y no por decisión**: su botón *Request
> advanced access* seguía **deshabilitado** al enviar, con el contador de Meta en
> `Ready to use (0)`. Meta no deja pedir acceso avanzado a un permiso sin
> llamadas registradas, y avisa de que el botón tarda **hasta 24 h** en
> activarse tras la primera. La llamada se hizo el 2026-08-14 a las 21:33 desde
> el Explorador de la API (`me/businesses`, que devolvió el portfolio), pero el
> contador seguía en cero cuatro horas después.
>
> **Consecuencia:** aprobados los cinco, el producto queda operativo, pero un
> cliente con su página dentro de un **portfolio comercial** seguirá sin poder
> conectarse (§19-bis). Eso exige una **segunda solicitud**, que solo se puede
> enviar cuando esta se resuelva.
>
> ⚠️ **Lo que puede preguntar Meta:** en el vídeo, al **0:24**, la pantalla de
> consentimiento muestra el aviso del portfolio comercial, porque
> `business_management` sigue en la Configuración y se concede aunque no se haya
> pedido. Respuesta preparada, y es verdadera:
>
> > *The permission appears in the consent dialog because it is present in our
> > Facebook Login configuration, but we are not requesting advanced access to it
> > in this submission. We will request it separately once we can: the Request
> > advanced access button was disabled at the time of submitting, pending Meta's
> > API-call counter.*
>
> **Mientras la evalúan, no tocar la Configuración ni la app.** Cambiar cosas a
> mitad de una revisión es lo que la alarga.


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

El diálogo de cada permiso pide tres cosas: **cómo se usa, qué valor aporta y por
qué es necesario**. Estos textos las cubren en ese orden. Cada permiso pide
además **su propia grabación**: es el mismo archivo subido seis veces.

**instagram_basic**
```
Notoria is a reputation-monitoring tool for restaurants and hotels in Peru.

HOW THE APP USES IT
When the business owner connects their Instagram professional account, we use
instagram_basic to read that account's basic profile — ID, username, name and
profile picture — and to list the account's own media so we can then fetch the
comments on it. The username and picture are shown in the dashboard so the owner
can confirm at a glance which account is connected.

VALUE FOR THE PERSON USING THE APP
Owners often manage more than one venue and more than one Instagram account.
Showing the connected account explicitly prevents them from replying to comments
from the wrong business, and it is what makes the "connected / not connected"
state of the dashboard meaningful.

WHY IT IS NECESSARY
It is the base permission of the Instagram API: without it we cannot resolve the
Instagram account behind the Page, nor list its media, so no comment could ever
be retrieved. We only access the account the user explicitly selects during
authorization.
```

**instagram_manage_comments**
```
Notoria is a reputation-monitoring tool for restaurants and hotels in Peru. It
brings together, in a single inbox, the Google reviews and the Instagram comments
of a business, so the owner does not have to check each platform separately.

HOW THE APP USES IT
After the business owner connects their Instagram professional account, we use
instagram_manage_comments to (1) read the comments left on the business's own
Instagram media, (2) publish a reply that the owner writes inside Notoria, and
(3) delete a reply that Notoria itself published, if the owner changes their
mind. The comments are shown in the "Comentarios" tab of each business, next to
its reviews.

VALUE FOR THE PERSON USING THE APP
Small restaurants and hotels do not have a community manager. A complaint left as
an Instagram comment can sit unanswered for days and be read by every future
customer. Notoria detects it, classifies its sentiment, alerts the owner by email
or Telegram, and lets them reply from the same screen where they handle their
reviews. That is the core value of the product.

WHY IT IS NECESSARY
Without this permission the app cannot read the comments and cannot publish the
reply, which is the entire feature. There is no other way to obtain the comments
of an Instagram professional account through the API.

We never delete or hide comments written by other people, and we never publish
anything the owner has not written and confirmed.
```

> El último párrafo es deliberado: la descripción oficial del permiso menciona
> **ocultar y eliminar** comentarios ajenos, y nosotros no hacemos ninguna de las
> dos. Decirlo recorta el alcance que pedimos, y eso juega a favor.

**pages_show_list**
```
HOW THE APP USES IT
Notoria connects to Instagram through the Facebook Login flow, so we must find
the Facebook Page that is linked to the user's Instagram professional account. We
call /me/accounts once, at connection time, to list the Pages the user
administers, and we keep only the one that has an instagram_business_account.

VALUE FOR THE PERSON USING THE APP
The owner does not need to know their Page ID or copy any identifier: they just
pick their business in the Facebook dialog and the connection completes. Without
this, connecting would require technical steps a restaurant owner cannot perform.

WHY IT IS NECESSARY
There is no other way to discover which Page carries the Instagram professional
account. The list is used only to resolve that link at connection time; the other
Pages are never stored, displayed or accessed.
```

**pages_read_engagement**
```
HOW THE APP USES IT
We use it to read the Page data that resolves the Page-to-Instagram link
(the instagram_business_account field) and to access the connected Instagram
account's content through that Page. It is also required by the Instagram
mentions endpoints we use to show the business the posts where customers tagged
or mentioned them.

VALUE FOR THE PERSON USING THE APP
It is what allows the connection to complete at all, and what powers the
"Mentions" section, where the owner sees posts talking about their business that
they would otherwise never find.

WHY IT IS NECESSARY
Without it the Page-to-Instagram resolution fails and the connection cannot be
established. We read only the Page the user selected; we never publish to the
Page and never read its private messages.
```

**pages_manage_metadata**
```
HOW THE APP USES IT
Used for exactly one operation: subscribing the connected Page to our webhook so
that new Instagram comments reach Notoria in real time. We do not change the
Page's name, category, settings or any other metadata.

VALUE FOR THE PERSON USING THE APP
Our product promise is speed: a negative comment detected in minutes instead of
days. Without the webhook we can only find comments on the periodic scan, which
means the owner may learn about an angry customer hours later, when other
customers have already read it.

WHY IT IS NECESSARY
The per-account webhook subscription cannot be made without this permission.
Enabling the webhook in the App Dashboard is not enough: it must be requested for
each business that connects.
```

**business_management**
```
HOW THE APP USES IT
We use it for one thing only: to list the Pages a user administers through a
Business Portfolio, so we can find the one linked to their Instagram professional
account. This is the same lookup described in pages_show_list, extended to Pages
the user manages through a business rather than personally.

WHY IT IS NECESSARY — WITH A CONCRETE CASE
Our customers are restaurants and hotels. Most of them have their Page inside a
Business Portfolio, because they verified their business, ran ads at some point,
or work with a marketing agency. For those accounts /me/accounts returns an EMPTY
list without business_management: the owner grants every permission correctly,
Facebook shows the success screen, and the connection still fails with no
explanation. We reproduced exactly this with our own business account, and adding
business_management fixed it immediately.

VALUE FOR THE PERSON USING THE APP
Without it, a large share of legitimate business owners simply cannot connect
their account, and the failure is silent and impossible for them to diagnose.

SCOPE WE DO NOT USE
We do not create, modify or delete any business asset. We do not read or manage
ad accounts, audiences or billing. We do not access any business the user has not
explicitly selected during authorization. That is why we are not requesting
ads_read or ads_management.
```

⚠️ **`business_management` no se puede pedir hasta haber hecho una llamada real
con él.** El botón *Solicitar acceso avanzado* sale **en gris** mientras el
contador de "Llamadas a la API" del permiso esté en 0, y **tarda hasta 24 h en
activarse** tras la primera llamada. Ojo: la conexión OAuth **no cuenta** aunque
use el permiso — Meta atribuye `/me/accounts` a `pages_show_list`. Hay que llamar
a un endpoint propio del administrador comercial. Lo que funcionó (2026-08-14):

*Herramientas → Explorador de la API Graph* → app **Notoria** → añadir el permiso
`business_management` → *Generar token de acceso* → consulta `me/businesses` →
Enviar. Devolvió `{"id":"1337974595147527","name":"Notoria"}` en 493 ms.


### Minutos del screencast (grabación del 2026-08-15, 2:43)

Verificados fotograma a fotograma sobre el archivo final. **Añadir la línea
`WHERE TO SEE IT IN THE VIDEO` al final del texto de cada permiso**: un revisor
que tiene que buscar a ciegas en qué segundo aparece un permiso es un revisor que
rechaza.

| Momento | Minuto | Permiso que sustenta |
|---|---|---|
| Diálogo de Facebook: elegir la cuenta de Instagram | **0:18** | `pages_show_list` |
| Diálogo de Facebook: revisión de accesos, con la nota del portfolio comercial | **0:24** | `pages_read_engagement`, `business_management` |
| Aviso "Instagram connected" dentro de Notoria | **0:40** | — |
| Cuenta conectada con @usuario y foto, y el comentario ya listado bajo su publicación | **0:44** | `instagram_basic`, `instagram_manage_comments` |
| La respuesta publicada, vista en Instagram (2 comentarios, "Ocultar todas las respuestas") | **1:34** | `instagram_manage_comments` |
| "Your reply: Thanks!" y el botón "Sure? This deletes it on Instagram" | **1:52** | `instagram_manage_comments` |
| Respuesta borrada, el comentario vuelve a pendiente | **2:06** | `instagram_manage_comments` |
| Conexiones → Remove connection | **2:18** | `pages_manage_metadata` |

⚠️ **Los minutos son de ESTA grabación.** Hubo una anterior, de 2:48, con otros
tiempos. Si se vuelve a grabar, hay que rehacer esta tabla — citar un minuto
equivocado es peor que no citar ninguno.

### Formulario "Instrucciones de prueba para la web" — campo por campo

Es un formulario aparte del de cada permiso, y tiene tres campos obligatorios.

**¿Dónde podemos encontrar la app?**
```
https://usenotoria.app/login
```

**¿El inicio de sesión con Facebook está integrado en esta plataforma?** → **Sí**

⚠️ Aunque Notoria **no** use Facebook para iniciar sesión (los usuarios entran con
correo y contraseña o con Google). Responder "No" sería inexacto: todo el flujo de
conexión es *Facebook Login for Business* y el revisor lo ve en pantalla. La
distinción se explica en el campo de instrucciones.

**Instrucciones para acceder a la app** (incluye la confirmación de uso de APIs de
Meta que el propio campo exige)
```
Notoria (https://usenotoria.app) is a web application — there is no mobile app and
no download is required. It is a reputation-monitoring tool for restaurants and
hotels in Peru: it collects a business's Google reviews and Instagram comments
into a single inbox, flags suspicious or negative ones, and lets the owner reply.

USE OF META APIs AND FACEBOOK LOGIN — CONFIRMATION
Yes, this app integrates Facebook Login. Important clarification: we do NOT use
Facebook Login to sign users into Notoria (users register with email and password,
or with Google). We use "Facebook Login for Business" for one specific purpose:
so that a business owner can connect their own Instagram professional account to
Notoria, granting us access to that account's media and comments.

The flow calls graph.facebook.com: we exchange the authorization code for a user
access token, call /me/accounts to find the Facebook Page linked to the owner's
Instagram professional account, read that Page's instagram_business_account, and
from then on read and reply to the comments on that Instagram account's own media.
We also subscribe the Page to our webhook so new comments arrive in real time.

We do not request or use email, user_friends, user_gender, user_birthday or any
other personal-profile endpoint beyond public_profile, which Facebook Login for
Business requires.

STEP-BY-STEP TEST INSTRUCTIONS
1. Go to https://usenotoria.app/login
2. Sign in with the test account listed in the credentials field below. The email
   is already verified and the Business plan is already enabled, so no payment or
   registration step is needed.
3. The account already contains one business ("La Mar Restaurante") with its
   Google reviews loaded, so the dashboard is not empty.
4. In the left menu open "Conexiones" (Connections).
5. On the Instagram card, click "Conectar" (Connect). You will be redirected to
   the Facebook authorization dialog.
6. Authorize a Facebook Page that is linked to an Instagram professional account.
   The Page may belong to a Business Portfolio — that is the case business_management
   covers, and it is the situation most of our customers are in.
7. You are returned to Notoria. The connected Instagram account is shown with its
   username and profile picture (instagram_basic).
8. Open the business from "Negocios" (Businesses) and select the "Comentarios"
   (Comments) tab. The comments on that Instagram account's own posts are listed
   (instagram_manage_comments).
9. Type a reply and send it: it is published on Instagram. You can then delete
   that same reply from Notoria.
10. To disconnect: "Conexiones" -> gear icon on the Instagram card -> "Eliminar
    conexión" (Remove connection). This also removes our webhook subscription.

The interface is available in Spanish and English; the language switch is in the
top bar.
```

**Credenciales de prueba**
```
Test account (email already verified, Business plan already active, no payment
required at any point):

  URL:      https://usenotoria.app/login
  Email:    revisormeta@usenotoria.app
  Password: NotoriaMeta2026

The plan on this account is set to expire in August 2027, so the credentials
remain valid for more than one year from the date of this request. The account
already has one business configured with its Google reviews, so the Instagram
connection flow can be reached immediately after signing in.
```

**Códigos de regalo de tiendas de apps**
```
Not applicable. Notoria is a web application; it is not distributed through any
app store and there is nothing to download or purchase.
```

**Restricciones geográficas**
```
None. There is no geo-blocking or geo-fencing of any kind. The app and all of its
features are reachable from any country. The product is commercially focused on
Peru and prices are shown in Peruvian soles, but access is not restricted by
location, and the test account above has full access to every feature.
```


---

## 3. Cuenta de prueba

| | |
|---|---|
| Usuario | `revisormeta@usenotoria.app` |
| Contraseña | `NotoriaMeta2026` |
| Plan | **NEGOCIO** (los comentarios y menciones están limitados por plan) |
| Email | **ya verificado** a propósito |
| Vence | **agosto de 2027** |
| Negocio cargado | *La Mar Restaurante* (`cmsts7u8q000l1ju3ue6ejkrb`), con sus reseñas de Google escaneadas |

Creada el 2026-08-14 con
`node scripts/cuenta-revisor.js revisormeta@usenotoria.app NotoriaMeta2026 NEGOCIO`
y comprobada contra producción (`POST /api/auth/login` → 200, plan NEGOCIO).

⚠️ **Vence en 2027 a propósito, no en 30 días.** El formulario de Meta exige que
las credenciales de prueba sigan activas **un año desde la solicitud**, y una
revisión puede reabrirse meses después. Por eso `cuenta-revisor.js` usa 400 días.
No hay riesgo de cobro: el cron de renovación filtra por
`suscripcionId: { not: null }` y esta cuenta no tiene tarjeta guardada.

⚠️ **Y lleva un negocio ya creado, también a propósito.** El botón de conectar
Instagram vive **dentro de un negocio**: una cuenta recién creada aterriza en el
onboarding, y el revisor tendría que buscar un negocio en Google Maps antes de
llegar a lo que vino a revisar. Con el negocio cargado y escaneado, el flujo de
Instagram se alcanza en dos clics desde el login.

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
- [x] ✅ **`@notoriaapp` con foto de perfil y una publicación real.** El revisor
      va a ver esa cuenta en pantalla: un perfil vacío con silueta gris se lee
      como una cuenta creada para pasar la revisión. Las piezas están en
      `marca/` (`node marca/generar-social.js`), en **1080×1350**, que es el
      formato que la cuadrícula del perfil no recorta — a 1080×1080 el titular
      salía cortado por los lados.
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

~~**Rotar `META_APP_SECRET`.**~~ ✅ **Hecho el 2026-08-22** y comprobado contra la
Graph API con `railway run --service api node scripts/verificar-meta-secret.js`.
Se rotó con el App Review en curso a sabiendas: la única ventana en que el OAuth
falla es la del redespliegue de Railway, uno o dos minutos.

⚠️ **`META_IG_APP_SECRET` NO se tocó, y no debe tocarse.** Es con ese —el de la
app de Instagram `1305555994987658`— con el que Meta firma los webhooks de
Instagram, y hoy **no hay forma de validarlo**: la única prueba sería un
comentario real, que no llegará hasta que aprueben. `verificar-meta-secret.js`
devuelve «no concluyente» para ese, no «rechazado», precisamente porque el flujo
que se usa para comprobarlo ni siquiera llega a mirar el secreto (se descubrió
con una llamada de control usando un secreto inventado, que daba el mismo error).

---

## 8. SEGUNDA SOLICITUD — ARMADA en el panel el 2026-08-26, bloqueada por el screencast

> 🔴 **ESTADO REAL (2026-08-26).** La primera solicitud se resolvió: cuatro permisos aprobados
> y **`pages_manage_metadata` RECHAZADO** («Disallowed Use Case — no es necesario para la
> funcionalidad principal»). La segunda solicitud está **creada y guardada** en el panel
> (`submission_id=2252144948952187`) con:
>
> | Paso | Estado |
> |---|---|
> | Permisos elegidos: `business_management` + `pages_read_user_content` | ✅ |
> | Descripción en inglés de los dos (§8.2) | ✅ pegada y guardada |
> | «Agree that you will comply with allowed usage» de los dos | ✅ |
> | Certificación de los 5 permisos que van a renovación | ✅ |
> | **Screencast de los dos** | 🔴 **FALTA — es lo único que bloquea** |
> | Data handling · Reviewer instructions | ⏳ «Needs your review», los revisa el dueño |
>
> 🔴 **`pages_manage_metadata` NO se volvió a pedir, y no se debe.** Meta tenía razón: se pedía
> para `suscribirWebhookInstagram()`, una llamada que nunca funcionó y que se retiró del callback
> el 2026-08-26. Volver a pedirlo sin haber cambiado nada es pedir el mismo rechazo.
>
> ⚠️ **`Metavideo.mp4` (15/08, el de la primera solicitud) NO sirve.** Enseña el flujo de
> Instagram; estos dos permisos exigen ver otra cosa (§8.3). Es exactamente el desajuste por el
> que rechazaron el tercero.
>
> 🔴 **Y hay un bloqueo de fondo en el screencast de `pages_read_user_content`: la página del
> dueño NO TIENE NI UNA RESEÑA** (comprobado el 2026-08-23: `/{page-id}/ratings` devuelve
> `{"data": []}`). No se puede grabar «reseñas reales con su estrella y su texto» de una página
> vacía. El de `business_management` **sí es grabable hoy** — solo hace falta enseñar el diálogo
> con la página del portfolio apareciendo en la lista.
>
> **De ahí la decisión que queda al dueño:** enviar solo `business_management` ahora, o esperar a
> tener a mano una página con reseñas y mandar los dos juntos.

### 8.0 (redacción original, conservada)

> **No se puede enviar todavía.** Meta no admite una segunda revisión mientras la
> primera está *in progress*. Esta sección existe para que el día que aprueben la
> primera el envío sea pegar y darle a Enviar, no empezar a redactar.

**Escrita el 2026-08-23.** Lo que falta por hacer cuando llegue el momento está
al final, en el checklist.

### 8.1 Qué se pide, y por qué son DOS y no uno

| Permiso | Qué desbloquea | Por qué quedó fuera de la primera |
|---|---|---|
| `business_management` | Que `me/accounts` liste las páginas que viven dentro de un **portfolio comercial**. Sin él, cualquier cliente que haya verificado su empresa, trabajado con una agencia o corrido anuncios recibe «0 páginas utilizables» | Su botón *Request advanced access* estaba **deshabilitado** al enviar: Meta no lo activa hasta ~24 h después de la primera llamada registrada |
| `pages_read_user_content` | **Facebook Reviews**: leer `/{page-id}/ratings` de la página que el cliente conecta | No se había investigado. Se daba por hecho que bastaba `pages_read_engagement`, y es falso |

🔴 **`pages_read_user_content` es el permiso correcto, NO `pages_read_engagement`.**
Esto se supuso mal durante meses. Con la primera solicitud aprobada tal cual,
Facebook Reviews **seguiría sin funcionar** y el fallo habría parecido un bug del
scraper. Comprobado el 2026-08-22 contra la documentación oficial de
`/{page-id}/ratings` y del nodo `Recommendation`.

✅ **NO hace falta la feature *Page Public Content Access***, que es la difícil de
conseguir: esa es para leer páginas **ajenas**. Acá el cliente conecta la suya y
concede el permiso él mismo.

### 8.2 Textos en inglés (para pegar en "How will you use this permission?")

**business_management**
```
Notoria is a reputation-monitoring tool for restaurants and hotels in Peru.

HOW THE APP USES IT
We call me/accounts during the connection flow to list the Facebook Pages the
person administers, so they can pick the one linked to the business they want to
monitor. We do not create, modify or manage any Business Portfolio: the
permission is used only so that Pages owned by a portfolio appear in that list.

VALUE FOR THE PERSON USING THE APP
Most of our target customers are small restaurant and hotel groups whose Page
was verified through a Business Portfolio, or was set up by a marketing agency.
For all of them, me/accounts returns an empty list without this permission, and
the connection simply fails with no explanation the owner can act on.

WHY IT IS NECESSARY
It is not an enhancement: without it the product does not work at all for that
segment. We confirmed this on our own demo account, whose Page belongs to a
portfolio and was invisible to me/accounts until business_management was
granted.
```

**pages_read_user_content**
```
Notoria is a reputation-monitoring tool for restaurants and hotels in Peru. It
brings together, in a single inbox, the reviews a business receives across
platforms, so the owner does not have to check each one separately.

HOW THE APP USES IT
Once the owner connects their own Facebook Page, we read the reviews and
recommendations left on it through the /{page-id}/ratings edge: the rating, the
recommendation type, the review text, the reviewer's name and the creation time.
We store them so the dashboard can show new reviews, flag the negative ones and
alert the owner by email the same day one appears. We only ever read the Pages
the person explicitly selects during authorization, and only their own.

VALUE FOR THE PERSON USING THE APP
A negative review answered the same day changes what the next customer reads.
Today our users already get this for their Google listing, and the most frequent
request is the same thing for Facebook. Without it they have to remember to open
the Page every day, which is exactly the habit the product exists to replace.

WHY IT IS NECESSARY
/{page-id}/ratings requires pages_read_user_content. There is no other endpoint
that returns the reviews of a Page: pages_read_engagement covers posts and
engagement metrics, not the ratings edge. Without this permission the Facebook
part of the product cannot exist.
```

### 8.3 Screencast — qué tiene que enseñar

El de la primera solicitud **no sirve**: no enseña ni una página en portfolio ni
una reseña de Facebook. Hay que grabar uno nuevo, y sigue valiendo la regla del
anterior — es **el mismo archivo subido en los dos permisos**.

| Momento | Qué se ve | Cubre |
|---|---|---|
| 0:00 | Login en usenotoria.app con la cuenta de prueba | contexto |
| 0:15 | Panel → Conexiones → «Conectar Facebook» | contexto |
| 0:25 | Diálogo de Facebook: se ve la **página que está dentro del portfolio** apareciendo en la lista | `business_management` |
| 0:45 | Vuelta al panel con la página conectada | ambos |
| 1:00 | Pestaña Reseñas: se ven **reseñas reales de Facebook** con su estrella y su texto | `pages_read_user_content` |
| 1:20 | Una reseña negativa y el correo de alerta que produjo | `pages_read_user_content` |
| 1:40 | Conexiones → Desconectar, y la página desaparece | borrado de datos |

🔴 **Nada de esto se puede grabar hoy**: sin el permiso concedido,
`/{page-id}/ratings` devuelve error y la pestaña estaría vacía. El screencast se
graba **después** de que Meta conceda acceso *estándar* (que se tiene por
defecto) sobre la página propia — comprobar primero con el Explorador de la API
que la llamada devuelve datos con la cuenta de prueba.

### 8.4 Lo que hay que TERMINAR en el código antes de grabar

> ✅ **YA ESTÁ HECHO, desde el 2026-08-23** — los cuatro puntos. Verificado el 2026-08-26:
> `recommendation_type`/`has_rating`/`has_review` en el scraper, el tratamiento de la
> recomendación sin estrella (`sinEstrella`), el callback propio de Facebook
> (`/api/redes/facebook/callback`) y el cableado en el worker. `node scripts/prueba-facebook.js`
> — 45 comprobaciones. Se conserva la lista de abajo como registro de qué era.


El scraper existe pero **está deliberadamente a medias**, y su cabecera lo dice
en rojo: no se termina hasta tener el permiso y una página real con reseñas. Lo
que le falta, ya identificado el 2026-08-22, es poco y concreto:

1. `recommendation_type` (`positive` / `negative`) y los booleanos `has_rating`
   y `has_review` en el `fields` de la petición.
2. Tratar la recomendación **sin estrella**: desde 2018 una recomendación puede
   venir sin `rating`, y hoy el stub cae en `rating: 0`, que el detector leería
   como una reseña de cero estrellas — peor que no leerla. Lo correcto es derivar
   la estrella del `recommendation_type` (positive → 5, negative → 1) o marcarla
   como sin rating y dejarla fuera del promedio.
3. La **ruta para conectar la página**. Hoy no existe y por eso `facebookPageId`
   no se llena nunca. El OAuth ya está: el callback de Instagram pide
   `me/accounts` y **ya trae la página**, solo descarta las que no tienen
   Instagram (`redes.routes.js:128`). Es un desvío, no una integración nueva.
4. Cablear la fuente en el worker y devolver Facebook a las páginas públicas de
   las que se retiró.

⚠️ **En ese orden y no antes.** Escribir el cliente entero contra mocks es
exactamente lo que pasó con `obtenerComentariosTikTok`, que apuntó meses a un
endpoint inexistente y pasaba todas las pruebas.

### 8.5 Checklist del día que se envíe

- [ ] La primera solicitud está **resuelta** (aprobada o rechazada), no *in progress*
- [ ] El botón *Request advanced access* de `business_management` está **habilitado**
      (si sigue gris, hacer una llamada a `me/businesses` desde el Explorador y
      esperar hasta 24 h — es lo que pasó en agosto)
- [ ] `pages_read_user_content` aparece en la Configuración de Facebook Login
- [ ] `/{page-id}/ratings` devuelve datos con la cuenta de prueba en el Explorador
- [ ] Los cuatro puntos de §8.4 están hechos y desplegados
- [ ] Screencast nuevo grabado según §8.3
- [ ] La cuenta de prueba de §3 sigue funcionando (contraseña y correo de
      `revisormeta@usenotoria.app`, cuya regla de Email Routing existe desde el
      2026-08-20 — sin ella el correo se descarta en silencio)
- [x] 📅 ~~**Antes del 5 de octubre de 2026**: vence la renovación anual de acceso a
      datos de Meta.~~ **Hecha el 2026-08-06**: *Data access renewal* y *Submit Data Use
      Checkup* figuran en **Completed** (CLAUDE.md §19 A). El 5 de octubre era la fecha
      límite, ya cumplida. La próxima vence dentro de un año: mirar el panel en julio de 2027
