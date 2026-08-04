# Accounts API Access Application Form — respuestas listas para copiar

Formulario: https://bytedance.sg.larkoffice.com/share/base/form/shrlgu4WEvtSXpEDLcCw56u4Rfc

**Orden correcto (esto fue lo que falló):** primero se envía ESTE formulario, se espera a que
quede registrado, y **recién después** se vuelve a mandar la solicitud de la app con el scope
"TikTok Accounts". El rechazo no cuestionó el caso de uso — dijo literalmente que no encontró
el formulario bajo el email del developer profile.

**No enviarlo dos veces.** Si se manda duplicado, TikTok evalúa el último recibido.

---

## 1. Business Name

```
NOTORIA E.I.R.L.
```

(Razón social exacta de la ficha RUC 20616239466.)

## 2. ¿Coincide con el Company Name del developer profile?

**Verificar antes de responder** en https://business-api.tiktok.com/portal/developer/profile

- Si ahí dice `NOTORIA E.I.R.L.` → **Yes**.
- Si dice otra cosa (p. ej. "Notoria" a secas) → **No**, y escribir abajo el valor exacto que
  aparece en el portal, carácter por carácter. No "arreglarlo" al copiarlo.

## 3. App Name

```
Notoria
```

## 4. Email Address

```
didier@usenotoria.app
```

⚠️ **Este es el campo que causó el rechazo.** Tiene que ser exactamente el email con el que se
registró el developer profile (§15-sexies: se usó el del dominio porque TikTok rechaza correos
personales). Confirmarlo en https://ads.tiktok.com/ac/page/settings/ y, si difiere, usar el que
diga ahí — no `padkar4@gmail.com`.

## 5. Website

```
https://usenotoria.app
```

El producto SaaS y la web corporativa son el mismo dominio, así que va una sola URL. El backend
`api.usenotoria.app` no se pone acá (no es una web navegable).

## 6. Business Verification

**Recomendado: "Submit An Acceptable Document for Business Verification".**

Documento a subir: **Ficha RUC de SUNAT** de NOTORIA E.I.R.L. (RUC 20616239466), que muestra
razón social, RUC y domicilio fiscal. Si piden algo con valor registral, sirve mejor la
**copia literal de la partida de SUNARP**.

Dos detalles:
- Los documentos están en español. Conviene subir el PDF original y, si el formulario admite
  varios archivos, una traducción simple al inglés de los campos clave (legal name, tax ID,
  registered address, date of incorporation).
- El domicilio del documento es **Cal. Isla Filipinas Mza. G9 Lote 8, La Perla, Callao** — que
  no diga "Lima" en ningún otro campo del formulario, o no cuadra.

La otra opción (Business Center ID verificado) solo conviene si ya tienes un BC con la empresa
verificada; si no lo tienes, montarlo es un trámite adicional más lento que subir la ficha.

## 7. Use Case

Copiar tal cual (está en inglés a propósito):

```
Notoria (https://usenotoria.app) is a reputation-management SaaS for local businesses in Peru:
restaurants, hotels, clinics, gyms and small multi-location franchises. The business owner
connects the channels they already own — Google Business Profile, Instagram and TikTok — and
Notoria consolidates all public feedback about their own business into a single inbox,
classifies it by sentiment, alerts the owner when something negative appears, and lets them
reply without leaving the dashboard.

HOW THE APP USES THE "TIKTOK ACCOUNTS" SCOPE

Authorization is always initiated by the business owner inside our dashboard
(Connections > TikTok > Connect), through TikTok's own OAuth consent screen, for the TikTok
Business account that they own. We requested only four sub-permissions, and each one maps to a
concrete, already-designed screen:

- Account User (GET /business/get/): right after authorization we read the account's display
  name, username and avatar so the dashboard can show the owner which account is connected, and
  we store the business_id required by every subsequent call. Shown in the "Connections" page
  and in the header of the business detail page.

- Get Account Media (GET /business/video/list/): a background worker lists the account's own
  recent videos (title, publish date, comment count, share URL) and renders them in the "Your
  latest videos" section of the Comments tab, so the owner can see which post each comment
  belongs to.

- Account Comment (GET /business/comment/list/ and POST /business/comment/reply/create/): we
  read the comments left on those videos and publish the owner's reply from our dashboard. Every
  incoming comment is deduplicated, classified as positive / neutral / negative by our sentiment
  engine, and a negative one immediately triggers an email and WhatsApp alert to the owner.

- Auth Code Management (POST /tt_user/oauth2/token/ and /refresh_token/): to exchange the
  authorization code and keep the access token alive. We already implement refresh-token
  rotation for TikTok's Display API in production and will reuse the same logic here.

We never read, store or process data from accounts that have not authorized our app. We do not
use this data for advertising, audience building, resale, or training machine-learning models.
When the owner disconnects the account from our dashboard, the stored tokens are deleted and all
calls stop.

VALUE-ADD FOR THE BUSINESS

Our customers are small business owners who have no social-media team. Today they check Google
reviews, Instagram comments and TikTok comments at different times of the day, from different
apps, and negative comments routinely sit unanswered for days — which is precisely what damages
a local business's reputation. Notoria gives them: one inbox for all channels, automatic
sentiment classification and prioritization, proactive alerting outside the platform (email and
WhatsApp) within minutes of a negative comment, one-click replies with suggested response
templates, and a weekly PDF report. The metric we sell is time-to-response on negative feedback.
For franchise customers, the same view is aggregated across all their locations.

WHY THE API IS NECESSARY RATHER THAN THE NATIVE TIKTOK PLATFORMS

The TikTok app and TikTok Business Suite show TikTok data inside TikTok, which is exactly what
our product cannot rely on: our entire value proposition is cross-channel. Specifically, the
following are impossible without the API:

1. Pushing a real-time alert to a channel outside TikTok (WhatsApp / email) the moment a
   negative comment is detected. Owners are not looking at the TikTok app when it matters.
2. Applying our own sentiment classification and urgency rules uniformly to a TikTok comment, a
   Google review and an Instagram comment, so they can be triaged in the same queue.
3. Including TikTok comments in the same weekly PDF report and the same reputation score the
   owner already receives for their other channels.
4. Giving a multi-location franchise a single consolidated view; the native apps require signing
   in to each account separately.

Finally, we did not start with the Accounts API by choice: we already run a working integration
with the TikTok Display API in production (user.info.basic, video.list), and profile and video
listing work today. We verified that the Display API simply does not expose comment endpoints —
/v2/comment/list/ and /v2/comment/reply/create/ return HTML 404s — while
business-api.tiktok.com/open_api/v1.3/business/comment/list/ does exist and responds. Reading
and replying to comments on our customers' own videos is only possible through the Accounts API,
which is why we are applying.
```

## 8. Screen Recordings

Hay que subir video. Lo que ya existe en producción **sí se puede grabar de verdad**; los
comentarios todavía no, y el formulario permite explícitamente prototipos ("If there isn't a
similar feature integrated into your developer's app, you can provide prototypes").

Antes de grabar: **poner el panel en inglés** (el i18n ya está, `dashboard/conexiones` y
`negocios/[id]` tienen los textos en EN) y usar una cuenta demo, no datos de un cliente real.

**Video 1 — real, ~90 s. Autorización y lo que ya funciona:**
1. Login en usenotoria.app → dashboard.
2. Connections → fila TikTok → clic en **Connect**.
3. La pantalla de consentimiento de TikTok (que se vea que el permiso lo concede el dueño).
4. Regreso al panel: la cuenta aparece conectada, con nombre, @usuario y avatar
   → rotular en pantalla: `GET /business/get/ — Account User`.
5. Ficha del negocio → tab **Comments** → sección **Your latest videos** con título, fecha y
   contador de comentarios → rotular: `GET /business/video/list/ — Get Account Media`.

**Video 2 — prototipo, ~60 s. Lo que habilita el scope solicitado:**
6. Lista de comentarios con badge de sentimiento (positive / neutral / negative)
   → rotular: `GET /business/comment/list/ — Account Comment`.
7. La alerta que le llega al dueño por email/WhatsApp ante un comentario negativo.
8. Abrir el modal **Reply**, escribir, enviar; el comentario pasa a "Answered"
   → rotular: `POST /business/comment/reply/create/ — Account Comment`.
9. Cerrar con la pantalla de **Disconnect** (borra tokens y detiene las llamadas).

Poner al inicio del Video 2 un cartel: *"Prototype — this flow is blocked pending Accounts API
approval; the underlying pipeline (dedupe, sentiment, alerting, reply) is already running for
Google reviews."* Decir que es prototipo suma credibilidad; disimularlo es lo que hunde la
solicitud.

## 9. Estimated Count of Accounts

```
10 - 200
```

Es la estimación honesta a 12 meses para un SaaS que arranca en Perú. Poner "Less Than 10"
debilita el caso sin ganar nada; poner más es inflar y no hay cómo sustentarlo.

## 10. Developer Account Type

**Technology Company** — Notoria es software que otros negocios usan sobre sus propias cuentas,
no una agencia ni un anunciante directo.

⚠️ Igual que la 2: **tiene que coincidir con lo que ya dice el perfil** en
https://business-api.tiktok.com/portal/developer/profile. Si ahí quedó registrado como otra
cosa, responder lo que diga el perfil y corregir el perfil, no el formulario.

## 11. Usage Acknowledgment and Revocation Consent

```
Agree
```

---

## Antes de reenviar la solicitud de la app

1. ✅ **Scopes verificados (captura del 2026-08-02).** Está marcado **solo "TikTok Accounts"**
   con los 4 sub-permisos previstos: Account User, Get Account Media, Account Comment y Auth
   Code Management. Account Post Content, Business Benchmark y Discovery Search quedaron
   desmarcados, y ningún scope publicitario está seleccionado. El badge **6** cuenta los
   sub-ítems anidados de Account User y Account Comment, no permisos extra. No tocar esto.
2. **App description y Use Case tienen que contar la misma historia.** La descripción actual
   (431/500) ya está bien y es consistente con el texto de la pregunta 7.
3. **Las dos redirect URL** ya apuntan a `https://api.usenotoria.app/api/redes/tiktok-business/callback`.
   La que importa es *TikTok account holder redirect URL*; la de advertiser es para cuentas
   publicitarias que no se usan (§15-sexies).
4. **Pendiente que no depende de TikTok: @adipri debe ser cuenta Business.** La Accounts API no
   opera cuentas personales, así que aunque aprueben, sin ese cambio no se conecta nada.
5. No escribir el código de `tiktokBusiness.scraper.js` antes de tener credenciales — es la
   lección de §15-bis, donde se escribió contra un endpoint inexistente y las pruebas con mocks
   lo taparon meses.
