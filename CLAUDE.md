# Notoria — Guía de contexto para Claude Code

## ¿Qué es Notoria?

Plataforma SaaS de monitoreo de reputación para restaurantes y hoteles **del Perú**. Detecta reseñas falsas, ataques de bots y caídas de rating. Tres planes: Gratuito, Negocio (**S/59/mes**, anual S/47/mes), Franquicia (**S/179/mes**, anual S/143/mes). Dominio: **usenotoria.app**.

> **Servicio solo nacional (2026-07-28).** Se eliminó la selección de país: todo negocio se crea con `pais: 'pe'` y la facturación va fija en `PE`. Las columnas siguen en el modelo para poder reabrir sin migrar. Ver §14.

**Razón social / datos fiscales:** operado por **NOTORIA E.I.R.L.**, RUC **20616239466**, domicilio fiscal en **Cal. Isla Filipinas Mza. G9 Lote 8, La Perla, Provincia Constitucional del Callao** (ubigeo INEI `070104`) — NO es Lima, como decía antes: se corrigió el 2026-07-26 al contrastar con la ficha RUC, porque SUNAT valida la dirección del comprobante contra ella. Está en `src/lib/tributario.js` (`EMISOR`) y en las páginas de Términos y Privacidad. Ya insertados en Términos (`terminos/page.js`) y Privacidad (`privacidad/page.js`). Los precios pasaron de dólares a **soles** el 2026-07-28 (ver §13).

---

## Estructura del repositorio

```
Vigilio/
├── brand-shield/          ← Backend (Node.js + Express + Prisma + PostgreSQL)
│   ├── src/
│   │   ├── api/routes/    ← Rutas REST
│   │   ├── scrapers/      ← Google, Facebook, Instagram*, TikTok*, TripAdvisor* (base sin cablear, ver sección de pendientes)
│   │   ├── nlp/           ← detector.js (reseñas con rating), sentimiento.js (menciones sin rating)
│   │   ├── workers/       ← monitoreo.worker.js (cron), reportes
│   │   ├── alerts/        ← notificador.js (email — canal único desde el 2026-08-16, §24)
│   │   ├── utils/         ← emails.js (Resend), reporte.generator.js (PDFKit)
│   │   └── index.js       ← Entry point, CORS, rutas
│   └── prisma/schema.prisma
└── brand-shield-web/      ← Frontend (Next.js 16 + Tailwind + Turbopack)
    └── src/
        ├── app/           ← App Router pages
        ├── components/    ← Icons.js, CookieBanner.js, GBPBanner.js
        ├── context/       ← AuthContext.js, IdiomaContext.js
        └── lib/api.js     ← API client con resolverApiUrl() para LAN
```

> Los nombres de carpeta `brand-shield` y `brand-shield-web` NO cambiaron (cambiarlos rompería imports). Solo la marca visible pasó de "Vigilio" a "Notoria".

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16.2.9, React 19, Tailwind 4, Turbopack |
| Backend | Node.js, Express 4, Prisma 5 (ORM) |
| Base de datos | PostgreSQL (via Prisma) |
| Emails | Resend (SDK) |
| IA | Groq API — modelo `openai/gpt-oss-20b` |
| PDF | PDFKit |
| Auth | JWT + Google Sign-In (OAuth) |
| Alertas | **Email (Resend), canal único.** El aviso inmediato lo da la app Android (§24) |
| Pagos | Culqi — **comercio APROBADO y llaves LIVE en producción (2026-08-14)**. Cobra dinero real desde ya. Ver §2 y §21 |
| Social | Instagram Graph API — pendiente de credenciales · **TikTok — perfil y videos funcionando en producción (2026-07-30)**, ver §15 y §15-quater. Los **comentarios NO están en la Display API** (§15-quinquies): solicitud enviada a la API for Business, en revisión (§15-sexies) |
| Menciones | **Motor y panel completos (2026-07-29)**, ver §18. Sin fuente de datos: requiere un proveedor externo de pago (decisión de negocio). Hoy la sección no se muestra en el panel |
| WhatsApp | ❌ **Eliminado como canal de alerta el 2026-08-16** (§24). Sigue vivo solo como contacto comercial (botón de ventas, /contacto) |
| App Android | `C:\Users\Admin\Downloads\NotoriaApp` — Kotlin + Compose, cliente de este mismo API. Es el único canal que "suena" (§24) |

---

## Comandos de desarrollo

```bash
# Backend (puerto 3000)
cd brand-shield && npm run dev

# Frontend (puerto 3001)
cd brand-shield-web && npm run dev

# Actualizar schema de BD
cd brand-shield
npx prisma db push      # ← detener backend antes en Windows (bloquea DLL)
npx prisma generate
```

> **IMPORTANTE en Windows**: Prisma generate falla con EPERM si el backend está corriendo. Siempre detenerlo primero.

---

## Variables de entorno

### brand-shield/.env
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
RESEND_API_KEY=...
EMAIL_FROM=Notoria <onboarding@resend.dev>   # cambiar a hola@usenotoria.app en prod
FRONTEND_URL=http://localhost:3001           # cambiar a https://usenotoria.app en prod
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GROQ_API_KEY=gsk_...
BACKEND_URL=http://localhost:3000            # cambiar a https://api.usenotoria.app en prod
META_APP_ID=                                 # 2232447584255257 (app tipo NEGOCIO), cargado en Railway y verificado en el contenedor — ver §19
META_APP_SECRET=                             # cargado en Railway. PENDIENTE ROTARLO (se compartió por chat). Firma además los webhooks: al rotarlo, Meta empieza a firmar con el nuevo de inmediato
META_REDIRECT_URI=                           # opcional — por defecto BACKEND_URL + /api/redes/instagram/callback
META_LOGIN_CONFIG_ID=                        # 4655107931374707 — apps Negocio con Facebook Login for Business: ID de la "Configuración" de permisos; si está seteado, el OAuth manda config_id en vez de scope (§19)
META_WEBHOOK_VERIFY_TOKEN=                   # ✅ CARGADA en Railway (2026-08-06) y pegada en Meta. Handshake verificado en prod. Sin ella el endpoint responde 403 a propósito (§20)
META_IG_APP_SECRET=                          # opcional pero recomendado — "Clave secreta de la app de Instagram" (app de IG 1305555994987658, distinta de META_APP_SECRET). El webhook acepta cualquiera de los dos secretos: ver §20.10
TIKTOK_CLIENT_KEY=                           # Sandbox cargado en Railway (2026-07-29)
TIKTOK_CLIENT_SECRET=                        # Sandbox cargado en Railway
TIKTOK_SCOPES=                               # opcional — default "user.info.basic,video.list". Ver §15
TIKTOK_REDIRECT_URI=                         # opcional — por defecto BACKEND_URL + /api/redes/tiktok/callback
MENCIONES_PROVEEDOR=                         # sin decidir — proveedor de datos para menciones de TikTok. Ver §18
MENCIONES_PROVEEDOR_API_KEY=                 # sin decidir
MENCIONES_MAX_POR_TERMINO=                   # opcional — default 20. Techo de gasto por término y ciclo
CULQI_PUBLIC_KEY=                            # Railway: pk_live_ (2026-08-14). En local sigue la de TEST, a propósito
CULQI_SECRET_KEY=                            # Railway: sk_live_ (2026-08-14). En local sigue la de TEST — las live NO van en archivos
CULQI_WEBHOOK_SECRET=                        # CARGADA en Railway — protege /api/pagos/culqi/webhook. Va en la query de la URL que se registra en CulqiPanel (§21)
EMAIL_RECLAMACIONES=                         # opcional — destino de los avisos del Libro de Reclamaciones (default hola@usenotoria.app)
PROMO_HASH_SECRET=                           # CARGADA en Railway y .env local (2026-08-05, con promo_tarjetas vacía). NO rotar sin vaciar esa tabla
META_GRAPH_VERSION=                          # opcional, default v21.0
# (Se fueron el 2026-08-16 con los canales que las usaban — ver §24:
#  TELEGRAM_BOT_TOKEN y todas las META_WHATSAPP_*. Ya no se leen en ningún sitio.)
```

> ⚠️ **OBSOLETO desde el 2026-08-16 — se conserva por historia, ver §24.** WhatsApp dejó de ser
> canal de alerta y `src/lib/whatsappMeta.js` fue eliminado. Lo de abajo describe cómo estaba antes.
>
> **Decisión (2026-07-05): WhatsApp usará Meta, no Twilio.** Para minimizar costos, las alertas
> urgentes por WhatsApp (plan Franquicia) se implementarán con la **WhatsApp Business Cloud API
> de Meta** — reutiliza el mismo Meta App que ya se registró para Instagram (`META_APP_ID`/
> `META_APP_SECRET`), no cobra por mensaje dentro de la ventana de conversación de 24h, y evita
> el margen que cobra Twilio por encima del costo real de Meta. `TWILIO_ACCOUNT_SID`/
> `TWILIO_AUTH_TOKEN`/`TWILIO_WHATSAPP_FROM` **ya no se usarán** — no hace falta contratar Twilio.
> **Migración hecha (2026-07-28):** `src/lib/twilio.js` fue **eliminado** y reemplazado por
> `src/lib/whatsappMeta.js`; `monitoreo.worker.js` ya lo usa. Falta solo crear la plantilla en
> Meta y cargar las credenciales.
>
> ⚠️ **Corrección a la nota de arriba:** la ventana de 24h **no aplica a nuestro caso**. Esa
> ventana se abre cuando el usuario TE escribe, y nuestras alertas son proactivas (avisamos de
> una reseña negativa sin que nadie nos haya escrito). Con la ventana cerrada, Meta rechaza el
> texto libre con el **error 131047**, así que hay que usar una **plantilla aprobada** — que sí
> se cobra por mensaje (categoría UTILITY, más barata que MARKETING). Sigue siendo más barato
> que Twilio, pero no es gratis. Por eso `whatsappMeta.js` envía `type: "template"` por defecto.

### brand-shield-web/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:3000    # cambiar a URL de Railway en prod
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_CULQI_PUBLIC_KEY=                # Vercel: pk_live_ desde el 2026-08-14. En local, la de TEST. Se incrusta EN EL BUILD: cambiarla exige `vercel --prod` (§21)
NEXT_PUBLIC_WHATSAPP_VENTAS=51955599041      # botón flotante de ventas del landing; sin la variable el botón no se renderiza. Ya cargada en Vercel (2026-08-03)
```

---

## Lo que ya está implementado

### Backend
- [x] Auth completo: registro, login, Google OAuth, verificación de email, refresh de perfil
- [x] **Recuperación de contraseña** (2026-07-26): `POST /api/auth/recuperar-password` (responde igual exista o no el email — sin enumeración de usuarios) y `POST /api/auth/resetear-password`; token de 1 solo uso, **se guarda su hash SHA-256** en `Usuario.tokenResetHash`/`tokenResetExpira` (1h), email `enviarRecuperacionContrasena`. Frontend: `/recuperar-password` y `/resetear-password` + link en login. ✅ desplegado y verificado en prod (2026-07-27).
- [x] **Rate-limit de auth** (2026-07-26): limiter estricto (10 intentos/15min, `skipSuccessfulRequests`) sobre `login`/`registro`/`recuperar-password`/`resetear-password` en `index.js` — frena fuerza bruta sin bloquear a usuarios legítimos.
- [x] **State OAuth firmado** (2026-07-26): `src/lib/oauthState.js` (HMAC-SHA256 con `JWT_SECRET` + expiración 10min) reemplaza el base64 plano falsificable en Google Business, Instagram y TikTok — el callback ya no acepta IDs de usuario/negocio forjados.
- [x] CRUD de negocios con búsqueda en Google Maps
- [x] Scraper de Google Reviews (5 reseñas públicas + historial completo con GBP)
- [x] Google Business Profile OAuth (conectar cuenta, listar ubicaciones)
- [x] Scraper de Facebook Reviews (stub funcional)
- [x] Monitoreo automático con node-cron (cada hora en prod)
- [x] Sistema de alertas: detección de bots, picos, caídas de rating
- [x] Notificador: email (Resend) — canal único desde el 2026-08-16 (§24)
- [x] Preferencias de alertas por usuario (tipos, umbral, frecuencia, día)
- [x] Resúmenes periódicos de alertas (cron diario a las 8:00 AM)
- [x] IA de respuestas: Groq API, límites por plan (Gratis=3, Negocio=100, Franquicia=300)
- [x] Análisis IA de competidores
- [x] Reporte PDF mensual con PDFKit (Times-Bold serif, paleta Notoria)
- [x] Envío automático de PDF el día 1 de cada mes
- [x] Competidores monitoreados con snapshots y análisis IA
- [x] Rutas `/api/redes`: OAuth completo de Instagram (Meta Graph API) y TikTok — devuelven 501 hasta que META_APP_ID/TIKTOK_CLIENT_KEY estén en `.env`, se activan solos al agregarlos
- [x] Pagos Culqi: cargo inicial + tarjeta guardada (`POST /api/pagos/culqi`), webhook de reembolsos/contracargos (`POST /api/pagos/culqi/webhook`) y cron diario de renovación mensual (`iniciarRenovacionesCulqi`) — devuelve 501 hasta que CULQI_SECRET_KEY esté en `.env`
- [x] Historial de Facturación: cada cobro exitoso (inicial o renovación) se guarda en la tabla `pagos` (titular, primeros 4 dígitos de tarjeta, marca, monto, estado) y se expone en `GET /api/pagos/historial`; el webhook de Culqi marca el registro como `REEMBOLSADO` ante reembolso/contracargo

### Frontend
- [x] Landing bilingüe (ES/EN) con IdiomaContext — persiste en localStorage
- [x] FAQ accordion (8 preguntas por idioma)
- [x] Cookie banner con elección persistente
- [x] Registro con medidor de fuerza de contraseña (5 criterios, Débil→Fuerte)
- [x] Onboarding guiado (agregar primer negocio)
- [x] Dashboard: sidebar, plan actual, avatar de usuario
- [x] Página de negocio: score 0-100 (gauge SVG), historial de rating (SVG polyline), QR de reseñas
- [x] Chat de respuestas: 30 plantillas (6 por nivel de estrellas), asistente IA Groq
- [x] Filtros de reseñas por estrellas y estado (respondida/pendiente)
- [x] Análisis IA de competidores (4 secciones formateadas)
- [x] WhatsApp message editable con botón de restaurar
- [x] Conexión Google Business Profile con OAuth
- [x] Planes: listas completas con ✓ y ✗, toggle mensual/anual
- [x] Alertas configurables (tipos, umbral, frecuencia, día)
- [x] Configuración: perfil, email, contraseña, apariencia, idioma
- [x] Reportes PDF: vista previa interactiva, descarga para planes de pago
- [x] LAN access: `resolverApiUrl()` detecta host y CORS permite IPs locales
- [x] Verificación de email con banner persistente
- [x] Términos de Servicio y Política de Privacidad (Ley N.° 29733, Perú)
- [x] Facturación: página `dashboard/facturacion` con historial de pagos (fecha, plan, titular, primeros 4 dígitos de tarjeta, monto, estado), botón en el sidebar
- [x] Gating por plan: middleware `verificarPlan` (`api/middlewares/verificarPlan.middleware.js`), usado en los 3 endpoints nuevos de abajo
- [x] Resumen semanal por negocio (domingo 8am hora Lima, `workers/resumenSemanal.worker.js`): cifras crudas en Gratis, + insight IA en Negocio/Franquicia, email consolidado si Franquicia tiene +1 negocio. Toggle `resumenSemanalActivo` vía `PATCH /api/negocios/:id/configuracion`
- [x] Auto-respuesta a reseñas positivas (4-5★, Negocio/Franquicia): plantilla aprobada por el usuario (`POST /api/negocios/:id/auto-respuesta/configurar`), 3 tonos en Franquicia; se publica sola en Google Maps vía GBP si el negocio tiene GBP conectado (si no, se omite con log interno)
- [x] Escalación de urgencia (Negocio/Franquicia): cron cada 4h (`iniciarEscalacionUrgencias`) manda un recordatorio por correo de las reseñas negativas sin responder tras 24h. Antes escalaba a Telegram/WhatsApp; desde el 2026-08-16 el correo es el único canal (§24) y el aviso que suena lo da la app Android
- [x] Comparación automática con competencia (Franquicia): `GET /api/negocios/:id/competencia`, Google Places Nearby Search (2km, mismo tipo) — independiente de la tabla `Competidor` (manual, todos los planes)

### Frontend — landing (2026-07-05)
- [x] Animación `PixelBlast` (WebGL, `three` + `postprocessing`) de fondo en el hero, con viñeta radial detrás del texto para que no pierda legibilidad
- [x] Sección "esto es lo que hacemos por ti" reescrita en positivo — sin comparar con lo que NO hace (se sacó el recuadro de contras a pedido del usuario)
- [x] Tabla comparativa completa de los 3 planes (~24 filas agrupadas: negocios/escaneo, IA, competencia, automatización, alertas, reportes, soporte), con scroll horizontal y columna de nombres fija en móvil — sección `#comparativa` en `src/app/page.js`
- [x] Footer multi-columna (Producto, Recursos, Cuenta, Legal + marca y copyright), estilo Vercel — antes solo tenía 3 links sueltos
- [x] Texto "Dashboard" reemplazado por "Panel de control" en todos los strings visibles en español (nav, CTAs, FAQ, onboarding, verificación de email, 404); el inglés sigue diciendo "Dashboard". Las rutas `/dashboard` NO cambiaron
- [x] Dashboard responsivo en móvil: sidebar fijo de 224px convertido a drawer con botón de hamburguesa (`dashboard/layout.js`), grillas fijas (`repeat(3,1fr)`, `1fr 1fr`, `repeat(4,1fr)`) cambiadas a `repeat(auto-fit,minmax(...))` en home, negocio detalle, planes y reportes

---

## Pendiente antes de producción

### 1. Credenciales y servicios externos (esperando del usuario)

El código de estas integraciones ya está implementado y activo por detrás de un
guard `configurado()` — en cuanto agregues las variables de entorno correspondientes
y reinicies el backend, empiezan a funcionar sin tocar código.

| Item | Estado | Qué hacer cuando llegue |
|------|--------|------------------------|
| **Culqi** (pagos) | ✅ **COMPLETO en producción (2026-08-14)** — comercio aprobado, llaves live cargadas y verificadas | Solo queda registrar la URL del webhook en CulqiPanel → Desarrollo → Webhooks (§21) |
| **Meta / Instagram** | Código listo, sin aprobación | Agregar `META_APP_ID` y `META_APP_SECRET` en `.env`; registrar el redirect URI `https://api.usenotoria.app/api/redes/instagram/callback` en Meta for Developers |
| **TikTok — perfil, videos, comentarios, respuestas y moderación** | ✅ **COMPLETO en producción (2026-08-06)** — vía la **Accounts API**, ver **§15-octies** | Nada pendiente. Conexión única desde Conexiones. La app **NO está en Sandbox** (ese es otro entorno, con otro dominio): opera cuentas de clientes reales |
| **TikTok — Display API** | Conservada como **respaldo**, sin usarse | `tiktok.scraper.js` sigue intacto por si hiciera falta una cuenta personal, pero no lee comentarios y ya no es la conexión principal |
| ~~**Meta WhatsApp** (alertas urgentes Franquicia)~~ | ❌ **CANCELADO el 2026-08-16** — el canal se eliminó del producto junto con Telegram (§24). `src/lib/whatsappMeta.js` y su script de prueba se borraron; no hay plantilla que crear ni credenciales que cargar | — |
| **TripAdvisor** (2026-07-06) | Solo base preparada a propósito — decisión de negocio de no activarlo hasta tener buena cantidad de clientes, no solo falta de API key | Ver subsección dedicada más abajo antes de continuar |
| **Menciones (TikTok)** | Motor, panel y alertas listos; **falta la fuente de datos** | Decisión de negocio: contratar un proveedor externo (§18). No se resuelve escribiendo código — TikTok no expone búsqueda de videos ajenos a apps comerciales. **Comprobado el 2026-07-30:** `business/mention/list/` tampoco existe en la API for Business, así que esa vía queda descartada (§15-sexies). El candidato que queda es el permiso *Discovery Search* de TikTok Accounts, que exigiría una segunda solicitud con la función declarada. Mientras no haya proveedor, la sección no aparece en el panel |

### 2. Culqi — integración de pagos (LIVE en producción desde 2026-08-14)

> **Estado (2026-08-14):** comercio **aprobado por Culqi**. Las llaves **live**
> están cargadas en Railway (backend) y Vercel (frontend), verificadas contra la
> API real sin mover dinero con `railway run node scripts/verificar-culqi-live.js`
> → "Todo OK". **Los pagos de https://usenotoria.app/precios cobran dinero real
> desde este momento.** El detalle de la rotación y de lo que estaba roto está en
> **§21**.
>
> En `brand-shield/.env` y `brand-shield-web/.env.local` siguen las llaves de
> **TEST**, y así debe quedarse: las live no van en archivos locales (por eso
> `set-culqi-keys.js` se niega a escribirlas). El entorno lo decide el prefijo de
> la llave, no una bandera.
>
> ✅ **Comprobado que nadie se coló durante la ventana de llaves de test.** Los
> únicos 2 pagos de la tabla `pagos` son `chr_test_` y de las cuentas del propio
> usuario (`padkar4@` y `giorrnellprincipe@`). Ver §21 para lo que hay que hacer
> con ellos.

**Bugs que aparecieron al cargar las llaves (2026-08-05).** Ninguno era visible
sin llaves; los dos habrían roto el primer cobro real:
- `culqi.crearCliente` mandaba `address: '-'` y Culqi **rechaza el customer**
  (exige entre 5 y 100 caracteres, `parameter_error`). Toda alta de suscripción
  habría fallado. Ahora usa `usuario.direccionFiscal` si existe.
- `registrarPago` leía `cargo.source.card_number` / `source.iin.card_brand`. Esa
  es la forma que devuelve Culqi al cobrar con un **token suelto**; cobrando con
  **tarjeta guardada** (que es lo que hace este código) esos campos van un nivel
  más abajo, en `cargo.source.source`. Resultado: `tarjetaInicio` y
  `tarjetaMarca` se habrían guardado en `null` **en silencio**, dejando vacío el
  historial de Facturación. Se extrajo a `culqi.datosTarjeta(cargo)`, que
  contempla las dos formas; la usan el alta y el cron de renovación, que antes
  duplicaban la lógica rota.
- `prueba-culqi.js` no lo detectaba porque releía la ruta de campos por su
  cuenta. Ahora verifica **a través de `datosTarjeta()`**, que es lo que corre en
  producción. Lección: el script debe llamar al mismo código que producción, no
  a una copia.
- Dato de la API que conviene recordar: `description` del cargo también valida
  longitud (**5 a 80 caracteres**).

Flujo implementado:
- Frontend: catálogo público `/precios` (`app/precios/page.js`) con botón "Pagar" que abre el widget de Checkout v4 → genera `token`. También desde `dashboard/planes/page.js` para quien ya tiene sesión
- Sin sesión, `/precios` guarda la compra en `sessionStorage` y manda a `/login?next=/precios`; al volver retoma el pago solo. `AuthContext` valida que `next` sea ruta interna, para que `?next=` no sirva de redirección abierta
- El plan **Franquicia ya se cobra con tarjeta** (antes su botón abría un `mailto:` y no se podía contratar online)
- Backend: `POST /api/pagos/culqi` recibe el token, crea customer + tarjeta guardada en Culqi, cobra el primer periodo y actualiza `usuario.plan`/`suscripcionActiva`/`fechaVencimiento` (`brand-shield/src/lib/culqi.js`, `brand-shield/src/api/routes/pago.routes.js`)
- Renovación mensual automática: cron diario `iniciarRenovacionesCulqi` en `monitoreo.worker.js` cobra a quienes vencen ese día usando la tarjeta guardada
- Webhook: `POST /api/pagos/culqi/webhook` (sin auth de sesión, protegido con `CULQI_WEBHOOK_SECRET` opcional en la query) desactiva la suscripción ante reembolsos/contracargos
- Variables de entorno: `CULQI_PUBLIC_KEY`, `CULQI_SECRET_KEY`, `CULQI_WEBHOOK_SECRET` (opcional), `NEXT_PUBLIC_CULQI_PUBLIC_KEY` (frontend)
- **Cómo probar (2026-08-03):** `node scripts/prueba-culqi.js` corre el circuito entero contra la API real de Culqi con llaves de test, sin levantar el backend ni abrir el navegador. Genera el token desde el script (con llaves `pk_test_` Culqi permite tokenizar server-side; en producción eso solo lo hace el widget en el navegador). Verifica además los campos que consume `registrarPago` — si Culqi renombra `source.iin.card_brand` el cobro igual "funciona", pero el historial de Facturación sale vacío y la renovación mensual se rompe en silencio.
- **Orden de habilitación:** primero llaves de test en el `.env` local + `.env.local` del frontend → correr el script → probar el widget en `dashboard/planes` con `npm run dev` → recién ahí llaves live en Railway y Vercel.
- **Cargar las llaves live por terminal** (verificado 2026-08-03, Railway CLI 5.23.3):
  ```bash
  cd brand-shield
  railway variable set CULQI_PUBLIC_KEY=pk_live_... --service api --skip-deploys
  echo "sk_live_..." | railway variable set CULQI_SECRET_KEY --stdin --service api --skip-deploys
  echo "<secreto>"   | railway variable set CULQI_WEBHOOK_SECRET --stdin --service api  # sin --skip-deploys: dispara el redeploy

  cd ../brand-shield-web
  vercel env add NEXT_PUBLIC_CULQI_PUBLIC_KEY production --value pk_live_...
  vercel --prod --yes   # imprescindible: NEXT_PUBLIC_* se incrusta en build time
  ```
  Detalles comprobados: `--stdin` **recorta el salto de línea** que agrega `echo`, así que la llave no queda con `\n` (probado con una variable desechable). Cada `variable set` dispara un redeploy salvo `--skip-deploys` — por eso solo el último va sin la bandera. **`variable delete` NO admite `--skip-deploys`**, siempre redespliega. Y agregar la variable en Vercel no basta: sin un `vercel --prod` nuevo el bundle sigue con el valor viejo.
- ⚠️ Las llaves live cobran de verdad desde el primer intento: Culqi no tiene "modo prueba" dentro de las llaves live, el entorno lo decide el prefijo de la llave. El script aborta si detecta `sk_live_`.
- **Promo de bienvenida (2026-07-06, reforzada y anunciada el 2026-08-05):** 50% de descuento los primeros 2 meses, solo facturación mensual, **una vez por cuenta y una vez por tarjeta**. Campos en `Usuario`: `periodoFacturacion` ("mensual"|"anual"), `promoBienvenidaUsada`, `mesesPromoRestantes` (cuenta regresiva que consume el cron de renovación). Aplicado en `POST /api/pagos/culqi` y en `iniciarRenovacionesCulqi`; el frontend replica el cálculo solo para mostrar el importe correcto antes de pagar — **el monto real siempre lo decide el backend**.
  - **Límite por tarjeta (tabla `promo_tarjetas`, modelo `PromoTarjeta`).** El flag por cuenta solo impedía repetirla con el mismo correo: registrar otro bastaba para reclamar el descuento indefinidamente. Ahora se guarda `culqi.huellaTarjeta()` = **HMAC-SHA256 de `BIN|últimos4`** (nunca el número; son los únicos datos de tarjeta que Culqi devuelve y que se pueden almacenar). Secreto: `PROMO_HASH_SECRET`, con `JWT_SECRET` de reserva.
  - ⚠️ **`PROMO_HASH_SECRET` no se puede rotar sin vaciar `promo_tarjetas`**: al cambiarlo ninguna huella anterior vuelve a coincidir y la promo se podría reclamar de nuevo con las mismas tarjetas.
  - ⚠️ Colisión conocida: dos tarjetas distintas con el mismo BIN y los mismos 4 últimos dígitos comparten huella. Es poco probable y el efecto es un **falso negativo** (al segundo cliente no se le aplica el descuento), nunca un cobro incorrecto.
  - **Orden que importa:** la decisión se toma **después de `crearTarjeta` y antes de `crearCargo`** — antes no se conoce la huella, y después ya no se puede cambiar el importe.
  - **Si la cuenta puede pero la tarjeta ya la gastó → 409 `PROMO_NO_APLICA` y NO se cobra.** El widget ya le había mostrado al usuario el importe con descuento; cobrarle el precio de lista sería cobrarle algo distinto de lo que aceptó. El frontend avisa, apaga el descuento y reintenta con **`sinPromo: true`** en el body, que es lo que evita que esa tarjeta quede recibiendo 409 para siempre. **Si se toca esta ruta, no romper ese escape.**
  - **Bug corregido el 2026-08-05:** el frontend redondeaba el 50% en **soles** (`Math.round(59/2)` = 30) y el backend en **céntimos** (`Math.round(5900/2)` = 2950): el widget decía **S/30.00** y se cobraba **S/29.50**. Centralizado en `montoEnCentimos()` (`brand-shield-web/src/lib/catalogo.js`), que ambas páginas usan. Regla: **cualquier importe que se muestre antes de pagar se calcula en céntimos con el mismo redondeo que el backend.**
  - **Se anuncia** con `components/BannerPromo.js`, encima de los planes en `/precios` y en `dashboard/planes`. Se le muestra también al **visitante sin sesión** (es el público de la promo) y por eso `/precios` publica el precio con descuento a los anónimos; desaparece para quien ya la usó. Antes el descuento no se comunicaba en ningún sitio: el cliente se enteraba al abrir la ventana de pago.
  - Pruebas: **`node scripts/prueba-promo.js`** — 5 casos con Culqi y Prisma simulados, incluido el de abuso. No cobra ni consume numeración de comprobantes (la serie es correlativa y no admite huecos), por eso esto **no** se prueba pagando de verdad en producción.
- **Bug corregido (2026-07-06):** el cron de renovación cobraba precio mensual a *todos* los usuarios activos, incluso a quienes se habían suscrito anual, convirtiéndolos silenciosamente a facturación mensual en su primer aniversario. Ahora lee `usuario.periodoFacturacion` y cobra el monto y plazo correctos.

#### 2-bis. "Tu página web ha sido observada" — subsanado el 2026-08-05

Culqi mandó un correo observando la web con dos motivos: **"Flujo de compra |
Carrito de comprar | Botón pagar"** y **"Falta información legal"**. La causa
real de la primera era que el único checkout vivía en `/dashboard/planes`,
**detrás del login**: el revisor de Culqi abría usenotoria.app y no encontraba
ningún precio comprable ni botón de pago.

Los requisitos salen de la infografía oficial (`Infografía requisitos online.pdf`):
información general (qué se vende, contacto con número/correo/dirección, redes
que enlacen de verdad), información legal (términos, política de cambios y
devoluciones, **Libro de Reclamaciones integrado en la web**, sin depender de
formularios o enlaces externos tipo Google Drive), **mínimo 5 productos** con
foto + descripción + precio visible, carrito o botón de comprar, y SSL en
**todas** las URLs, no solo el inicio.

Qué se creó para levantarla:
- `/precios` — catálogo público. Son **5 ítems** (Gratuito, y Negocio y
  Franquicia en sus dos modalidades de cobro), cada uno con ilustración propia,
  descripción y precio visible. Se contaron así, en vez de inventar servicios
  que no se prestan, porque cada modalidad es un cargo distinto y real. La
  fuente de verdad es `brand-shield-web/src/lib/catalogo.js` y **sus precios
  deben coincidir con `brand-shield/src/lib/precios.js`**, que es quien decide
  el monto que se cobra de verdad.
- `/libro-reclamaciones` — Libro de Reclamaciones **dentro de la web** (ver §2-ter).
- `/devoluciones` — política de cambios y devoluciones (retracto de 7 días,
  cancelación, prorrateo, plazos de reembolso).
- `/contacto` — teléfono, WhatsApp, correo, dirección y datos de la empresa.
- `components/PieLegal.js` — pie compartido con los datos de contacto y el
  distintivo del Libro de Reclamaciones. **Es la fuente única de los datos de
  contacto públicos** (`CONTACTO`); el landing también los importa de ahí.
- Teléfono público: **+51 955 599 041** (el mismo del botón flotante de
  WhatsApp, `NEXT_PUBLIC_WHATSAPP_VENTAS=51955599041`).

⚠️ **El landing (`app/page.js`) renderiza su cuerpo en el cliente**: `curl` a
https://usenotoria.app devuelve ~24KB con solo el JSON-LD y los scripts, sin
footer ni enlaces legales. Es previo a este trabajo, no un bug introducido acá,
y no afecta a un revisor humano (el navegador sí lo pinta). Pero **no sirve
`curl | grep` para verificar cambios del landing** — hay que mirar los chunks de
`/_next/static/chunks/` o abrirlo en un navegador. Las páginas nuevas
(`/precios`, `/contacto`, …) sí son estáticas y se verifican con `curl`.

**Pendiente del lado del usuario:** responder a culqi.com/soporte con el asunto
`MI COMERCIO FUE OBSERVADO`, y entregarles **credenciales de una cuenta de
prueba** — la infografía lo exige cuando el flujo de compra pide acceso, y el
nuestro lo pide (hace falta cuenta para asociar la suscripción y emitir el
comprobante).

#### 2-ter. Libro de Reclamaciones (Ley 29571 · D.S. 101-2022-PCM)

- Modelo `Reclamacion` en `schema.prisma` (tabla `reclamaciones`) y ruta pública
  `POST /api/reclamaciones` (`api/routes/reclamacion.routes.js`), montada en
  `index.js`. **Sin autenticación a propósito:** la norma no permite exigir
  registro previo para reclamar. Lleva rate-limit propio (10/hora por IP).
- Numeración **correlativa por año** (`2026-000001`). El `count`+`create` puede
  chocar contra el `@unique` de `numero` con dos reclamos simultáneos, así que
  reintenta con el siguiente correlativo; el índice único es la garantía real.
- Al registrar se mandan dos correos (`utils/emails.js`):
  `enviarCargoReclamacion` (la **constancia** al consumidor, obligatoria: repite
  toda la hoja, no solo el número) y `enviarAvisoReclamacionInterno` a
  `EMAIL_RECLAMACIONES` (default `hola@usenotoria.app`). Si Resend falla, la
  reclamación **igual queda guardada** y se registra en el log.
- Distingue **RECLAMO** (disconformidad con el servicio) de **QUEJA** (malestar
  con la atención): son figuras distintas en la ley. Plazo de respuesta: **15
  días hábiles**.
- ⚠️ La tabla es un **registro legal** (hay que conservarlo 2 años). Verificado
  el 2026-08-05 con 2 reclamaciones de prueba contra la BD de producción, y
  **las dos filas se borraron después**. No dejar datos de prueba ahí.

### 3. TripAdvisor — solo base preparada, no activar todavía

Decisión de negocio (2026-07-06): no vale la pena activar TripAdvisor hasta tener
buena cantidad de clientes (hoteles principalmente). Lo que existe hoy es *solo*
la base para que activarlo después sea un cambio chico, no una decisión de
arquitectura:

- `src/scrapers/tripadvisor.scraper.js`: búsqueda de ubicación, rating y reseñas
  vía TripAdvisor Content API (sin OAuth — una sola API key para toda la app,
  como Google Places). Guardia `configurado()` igual que Instagram/TikTok.
- Schema: `Negocio.tripadvisorLocationId/Url/RatingBase` y `TRIPADVISOR` sumado
  al enum `Plataforma` — ya aplicado en la base de producción (`prisma db push`,
  2026-07-06).
- **Lo que falta y es intencional no tener todavía:** no hay ruta para conectar
  TripAdvisor desde el negocio, no está cableado en `monitoreo.worker.js`
  (el cron de escaneo no lo llama), no hay UI ni mención en el landing/comparativa
  de planes. Cuando se decida activarlo: pedir la API key, exponer un paso de
  "conectar TripAdvisor" (buscar por nombre, igual que Google Maps en el
  onboarding) y sumar la llamada al scraper en el ciclo de escaneo.

### 4. Despliegue

**✅ En producción (2026-07-04):**
- Backend: Railway, proyecto `notoria-api`, servicio `api` + Postgres — `https://api.usenotoria.app` (SSL válido, `prisma db push` corrido contra la BD de prod, `railway.json` con health check en `/health`)
- Frontend: Vercel, proyecto `notoria-web` — `https://usenotoria.app` y `https://www.usenotoria.app` (SSL válido)
- DNS en Cloudflare: registros A (`@` y `www` → `76.76.21.21`), CNAME (`api` → `ha198ng9.up.railway.app`) y TXT de verificación de Railway (`_railway-verify.api`) — todos "DNS only" (nube gris)
- `GROQ_API_KEY` configurada en Railway (el usuario autorizó mantener la key existente en prod sin rotarla)
- Redirect URI de Google Business Profile (`https://api.usenotoria.app/api/auth/google-business/callback`) ya agregado en Google Cloud Console
- Dominio `usenotoria.app` verificado en Resend; `EMAIL_FROM=Notoria <hola@usenotoria.app>` activo en Railway
- **2026-07-05:** desplegadas las 3 funcionalidades nuevas con gating por plan (backend) y la animación del hero + mejoras del landing/dashboard descritas arriba (frontend)
- **2026-07-29 16:30:** desplegado el cacheo del perfil de TikTok (§15-bis) — backend `comentario.routes.js`, `redes.routes.js`, `tiktok.scraper.js`, `schema.prisma`; frontend `dashboard/negocios/[id]/page.js`, `dashboard/layout.js`. Railway `8dc61af8` SUCCESS, Vercel `notoria-95ri5jwfk` READY. Este trabajo se había quedado **a medio desplegar**: los deploys de las 15:38/15:41 salieron antes de las últimas ediciones (15:52–15:54), así que prod corrió ~1h con la mitad del cambio.
- **2026-07-29 17:15:** desplegado el arreglo de `trust proxy` en `src/index.js` (ver "Patrones y bugs conocidos"). Verificado: los logs de prod ya no tiran `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` y `/api/auth/login` responde con `RateLimit-Remaining: 9`, o sea que el limiter cuenta por IP real.
- **2026-07-30 17:00:** desplegada la renovación del token de TikTok (§15-quater) — backend `scrapers/tiktok.scraper.js`, `lib/tiktokToken.js` (nuevo), `api/routes/comentario.routes.js`, `workers/monitoreo.worker.js`; frontend `dashboard/negocios/[id]/page.js`. Railway "Deploy complete" + `/health` 200, Vercel `notoria-n16ikagix` READY. Verificado en vivo: el token de @adipri se renovó (vence 2026-07-31T22:02Z) y `user/info` responde. `TIKTOK_SCOPES` en Railway pasó a `user.info.basic,video.list` — **pendiente habilitar `video.list` en la consola de TikTok y reconectar la cuenta**; hasta entonces `video/list` devuelve `scope_not_authorized` (→ **resuelto ese mismo día a las 17:20**: `video.list` ya estaba habilitado en la consola y lo que faltaba era reconectar, para lo cual hubo que agregar el botón Reconectar). Scripts nuevos: `scripts/diagnostico-tiktok.js` (dice en qué paso se traba la conexión) y `scripts/escanear.js` (fuerza un ciclo sin cooldown), ambos con `railway run --service api`.
- **2026-07-30 17:50:** desplegadas las **miniaturas y el reproductor** de los videos en el tab Comentarios — backend `scrapers/tiktok.scraper.js` (campos `video_description`, `duration`, `embed_link`), frontend `dashboard/negocios/[id]/page.js`. Railway "Deploy complete", Vercel `notoria-50wlk20pa` READY. Dos cosas comprobadas en vivo antes de construirlo: `cover_image_url` carga desde fuera de TikTok (HTTP 200, webp) y `embed_link` responde **sin `x-frame-options`**, así que el video se reproduce en un iframe propio sin cargar `embed.js` de TikTok. ⚠️ La portada es una **URL firmada con `x-expires` (~24h)**: por eso los videos se piden en vivo con caché de 3 min y no se guardan en la BD.
- **2026-07-30 17:25:** desplegada la sección **Tus últimos videos** en el tab Comentarios — backend `scrapers/tiktok.scraper.js` (`obtenerVideosTikTok`) y `api/routes/comentario.routes.js` (campo `videos`, caché en memoria de 3 min); frontend `dashboard/negocios/[id]/page.js`. Railway "Deploy complete", Vercel `notoria-e4ii26st3` READY. Es la respuesta a §15-quinquies: los comentarios no se pueden leer, pero los videos sí, y el tab dejó de verse vacío con la cuenta funcionando.
- **2026-07-30 17:35:** desplegado el botón **Reconectar** en `dashboard/conexiones` (frontend). Faltaba una salida: con la cuenta ya conectada la fila solo mostraba la pastilla "Conectado", así que no había forma de volver a pasar por el diálogo de TikTok — imprescindible cuando se habilita un scope nuevo, porque el token conserva los permisos que tenía al emitirse. Vercel READY, `/dashboard/conexiones` 200.
- **2026-08-06 (noche, 3.ª tanda):** desplegada a Vercel la **ayuda reescrita de vinculación de Instagram** (`5b36846`, `dpl_ChGmgzs7mRPUqG2czmYPr9PRmC8T` READY, aliased a `usenotoria.app`). **Verificado sirviendo el bundle real**, no por el "READY": se localizó el chunk que contiene la frase nueva en `.next/static/chunks/` y se descargó ESE archivo desde producción para comprobar que la contiene. Es el método a repetir cuando el cambio vive en un componente de cliente — la página `/dashboard/negocios/[id]` es dinámica y detrás de login, así que no se puede comprobar pidiendo la URL.
- **2026-08-06 (noche, 2.ª tanda):** desplegado el **arreglo de la firma con doble secreto** (§20.10 y §20.10-bis, commit `278fda4`). Railway `7d5731f3` SUCCESS, `/health` 200. **Verificado que corre el binario nuevo sin usar ningún secreto:** un POST con firma inventada devuelve 403 y el log sale ya en el formato nuevo — `Secretos probados: META_APP_SECRET=sí, META_IG_APP_SECRET=sí` —, que de paso confirma que las dos variables llegaron al contenedor. Es el patrón a repetir: **para saber si un deploy tomó, buscar un cambio observable en la salida, no fiarse del "SUCCESS"**.
- **2026-08-06 (noche):** desplegado el **webhook de comentarios de Instagram** (§20) y la **paginación de comentarios** (§20-bis). Railway `ca78e61e` SUCCESS. Commits `a3d531e` y `5f1a7bb`, ambos en GitHub. Sin cambios en `schema.prisma` → sin `db push`. **Verificado en prod:** `/health` 200; `GET /api/webhooks/instagram` con un token de verificación falso → **403**; `POST` con firma inválida → **403**; y una ruta inventada bajo `/api/webhooks/` → **404**. Ese 404 de control es lo que prueba que el 403 viene de la ruta real y no de un rechazo genérico — sin él, un 403 no distingue "ruta viva que rechaza" de "ruta que no existe". ⏳ El endpoint queda **cerrado a propósito** hasta que se cargue `META_WEBHOOK_VERIFY_TOKEN` en Railway (basta con añadir la variable: Railway reinicia el contenedor solo, no hace falta redesplegar).
- **2026-08-06 (madrugada):** desplegada la **integración completa de TikTok por la Accounts API** (§15-octies), en 5 tandas. Backend Railway `0e4cd4cb` → `c76319dd` → `8d2ba976` → `c8b0a1b7` → `eeb18e7d`, todas SUCCESS; frontend Vercel `dpl_47aic4Mj` y `dpl_9u5BPVJD` READY. **Tres `db push`** (los 4 campos `tiktokBiz*`; `oculto`+`fijado`; `respuestaExternalId`), todos aditivos y verificados con `migrate diff` = *empty migration*. 8 commits, `d140fd0`→`8360c0e`, en GitHub. Verificado en vivo y **probado por el usuario en la interfaz**: conectar, leer, responder, borrar la propia respuesta, ocultar y fijar.
  - **Truco de verificación que sí sirvió:** el callback `/api/redes/tiktok-business/callback` va ANTES del middleware de autenticación, así que sin parámetros devuelve **302** a `?tt_error=missing_params` — prueba de que la ruta existe. Una ruta inventada bajo `/api/redes/` devuelve **401**, que es la trampa del truco 401/404: parece viva y no lo está.
  - **Se creó un servicio basura** en el proyecto Railway "Vigilio" por correr `railway up` desde la raíz del repo en vez de desde `brand-shield/`. El deploy falló y el servicio se borró. **La raíz está enlazada a otro proyecto: correr `railway up` siempre desde `brand-shield/`.**

- **2026-08-02:** desplegada la **eliminación de conexiones** (§15-septies) — backend `redes.routes.js` (`DELETE /:negocioId/:red`) y `scrapers/tiktok.scraper.js` (`revocarTokenTikTok`); frontend `dashboard/conexiones/page.js` (tuerca + modal de ajustes) y `lib/api.js` (`redes.desconectar`). Railway `26322137` SUCCESS, Vercel `notoria-2sqh9xqj5` READY. Sin cambios en `schema.prisma`, así que no hubo `db push`. Verificado: `/health` 200 y `/dashboard/conexiones` 200 — pero ojo, el 401 del DELETE **no** prueba que la ruta exista (ver la advertencia del truco 401/404 más arriba).
- **2026-07-29 17:40:** desplegado el cierre de la fuga de access tokens (`src/lib/negocioPublico.js` + las 5 respuestas de `negocio.routes.js`; frontend `conexiones/page.js` y `dashboard/negocios/[id]/page.js`). Railway y Vercel OK, logs limpios, `/api/negocios` 401 y `/dashboard/conexiones` 200. **Falta la comprobación autenticada end-to-end** — ver la nota de abajo.

**Cómo se despliega:** esta carpeta es un repo git local sin remoto configurado (no hay `git push` a GitHub). Los CLIs de Railway y Vercel ya están instalados, autenticados y linkeados a los proyectos reales:
```bash
cd brand-shield     && railway up --service api   # backend → https://api.usenotoria.app
cd brand-shield-web && vercel --prod --yes         # frontend → https://usenotoria.app
```
`railway status` / `vercel ls` confirman a qué proyecto está linkeada cada carpeta antes de desplegar.

⚠️ **`git push` a GitHub NO despliega nada.** Railway no está conectado al repo: los deploys son manuales con `railway up`. Un commit pusheado y sin desplegar sigue sin existir en producción.

⚠️⚠️ **ORDEN OBLIGATORIO: desplegar PRIMERO, migrar DESPUÉS.** `railway ssh --service api "npx prisma db push"` se ejecuta **dentro del contenedor**, así que lee el `schema.prisma` del código **desplegado**, no el local. Si se corre antes de desplegar, Prisma compara el schema viejo contra la BD, responde **"The database is already in sync with the Prisma schema"** y no crea nada. Es la respuesta más engañosa posible: parece éxito y es un no-op. Pasó el 2026-08-06 con `resumenes_sunat`, y es la misma familia del incidente de la Fase A, que estuvo desplegada sin sus tablas sin que nadie lo notara.

```bash
cd brand-shield
railway up --service api                                    # 1. desplegar
railway ssh --service api "grep -c ModeloNuevo prisma/schema.prisma"   # 2. confirmar que el contenedor YA lo trae
railway ssh --service api "npx prisma db push --skip-generate"         # 3. recién ahora migrar
```

El paso 2 es el que evita el falso positivo: si devuelve `0`, el deploy no ha entrado todavía y el `db push` mentiría.

⚠️ Los comandos `!` del usuario corren en **Git Bash**, no en PowerShell: rutas con barras normales y `&&`, no `;` ni barras invertidas. Y `railway` se enlaza **por carpeta** — desde `C:\Windows\System32` responde "No linked project found"; hay que estar en `brand-shield/`.

✅ **Git YA FUNCIONA (2026-08-03).** Rama `main` con historial, remoto `origin` = **https://github.com/adi211104/NOTORIA** (privacidad del repo: decidirla el usuario). `gh` está instalado en `C:\Program Files\GitHub CLI\gh.exe` (usar ruta completa en Git Bash), autenticado como `adi211104`, y git tiene a gh como credential helper global — **`git push` funciona directo desde el agente**. Commitear y pushear al cerrar cada bloque de trabajo. `git status`/`git log` ahora SÍ dicen qué falta desplegar, pero la hora de los deploys sigue saliendo de estas fuentes:

```bash
# 1. ¿Cuándo se desplegó cada lado?
cd brand-shield     && railway deployment list | head -3   # hora del último deploy del backend
cd brand-shield-web && vercel ls | head -5                 # hora del último deploy del frontend

# 2. ¿Qué archivos son más nuevos que ese deploy? (PowerShell)
Get-ChildItem src -Recurse -File | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-6) } |
  Sort-Object LastWriteTime -Descending | Select-Object LastWriteTime, Name

# 3. ¿La BD de prod coincide con el schema? "empty migration" = sincronizada
cd brand-shield && npx prisma migrate diff \
  --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script
```

Un truco extra para el backend: pegarle a una ruta sin token. **401 = la ruta está viva en prod; 404 con `{"error":"Ruta no encontrada"}` = todavía no se desplegó** (lo atrapa el catch-all de `index.js`).

⚠️ **El truco NO sirve en routers que montan `router.use(autenticar)` antes de sus rutas** — hoy `redes.routes.js` y `comentario.routes.js`. Ahí el middleware corta la petición antes de que Express intente casar el path, así que **cualquier** método sobre **cualquier** path del router devuelve 401, exista o no. Comprobado el 2026-08-02: `DELETE /api/redes/x/facebook`, que no es una red desconectable, respondía 401 igual que `/tiktok`. Para esos routers la única verificación real es con sesión.

**Pendiente:**

| Servicio | Qué falta |
|----------|-----------|
| **Vercel** (frontend) | Agregar `NEXT_PUBLIC_CULQI_PUBLIC_KEY` cuando llegue la llave de Culqi (requiere rebuild) |
| **Culqi / Meta / TikTok** | Agregar las llaves reales en Railway (`CULQI_SECRET_KEY`, `META_APP_ID`/`META_APP_SECRET`, `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`) cuando lleguen — el código ya está listo, se activa solo |
| **Prisma** | ✅ Nada pendiente. Verificado el 2026-07-29 con `prisma migrate diff` contra prod: "empty migration", o sea que `comentarios_sociales`, el enum `COMENTARIO_NEGATIVO`, las columnas de perfil de TikTok y el default de `menciones.plataforma` ya están todos aplicados |

### 6. Comprobantes + facturación electrónica (SUNAT) — Fase A ✅ (2026-07-26), Fase B pendiente

**Ruta elegida: SEE-Del Contribuyente** (emisión desde el propio backend, sin PSE). Se confirmó que el **Certificado Digital Tributario gratuito de SUNAT** es válido para este sistema — no hace falta comprar certificado ni pagar un PSE. El `.p12` está fuera del repo (`*.p12` en `.gitignore`); en producción va como `SUNAT_CERT_P12_BASE64` + `SUNAT_CERT_PASSWORD` y se decodifica a memoria, nunca a disco.

**Certificado verificado (2026-07-26):** emitido por RENIEC (ECEP-RENIEC CA Class 1 II) a `||USO TRIBUTARIO|| NOTORIA E.I.R.L. CDT 20616239466`; el RUC coincide. **Vigente del 27/07/2026 al 26/07/2029.** Su `notBefore` es del 27, así que nada firmado antes de esa fecha es válido para SUNAT — si un envío falla por validez del certificado, es esto y no un bug del código.

**Criterio de precios: el precio publicado INCLUYE IGV.** Un cliente peruano que ve "S/59/mes" paga S/59 en total (base S/50.00 + IGV S/9.00). La lógica de exportación de servicios sin IGV sigue implementada para cuando se reabra al exterior, aunque hoy no se use. Toda esa lógica vive aislada en `src/lib/tributario.js` para que un contador la pueda auditar sin leer el resto del backend.

**Fase A — implementada:**
- `prisma/schema.prisma`: modelos `Comprobante` y `SerieComprobante`; datos fiscales del receptor en `Usuario` (`docTipo`, `docNumero`, `razonSocial`, `direccionFiscal`, `paisFiscal`).
- `src/lib/tributario.js`: emisor, catálogos 06/51, desglose de IGV (el IGV se calcula como residuo para que la suma cuadre siempre al céntimo), tipo de comprobante según receptor, validación de RUC/DNI, total en letras.
- `src/services/comprobante.service.js`: emisión idempotente por pago + correlativo atómico (`UPDATE ... RETURNING`, no `SELECT`+`UPDATE`, que sí podría entregar el mismo número dos veces).
- `src/services/comprobante.pdf.js`: representación impresa con el orden que SUNAT exige, ya preparada para el QR de Fase B.
- `enviarComprobante` en `src/utils/emails.js`: PDF al cliente + copia a `EMAIL_CONTABILIDAD` (envío aparte, no BCC, para que llegue aunque rebote el correo del cliente).
- Endpoints: `GET/PUT /api/pagos/datos-fiscales`, `GET /api/pagos/comprobantes/:id/pdf`; `GET /api/pagos/historial` ahora incluye el comprobante de cada pago.
- Frontend: formulario de datos de facturación + botón de descarga en `dashboard/facturacion`.
- **Se emite tipo `VOUCHER` (serie V001)**, rotulado en el PDF como constancia interna que NO es comprobante de pago electrónico. Las series fiscales F001/B001 se dejan sin usar a propósito: reservar números que aún no se pueden enviar a SUNAT dejaría huecos en la numeración, que es infracción. Al poner `SUNAT_EMISION_ACTIVA=true` el mismo código emite FACTURA/BOLETA.
- **Bug corregido en su momento:** `culqi.crearCargo` usaba una moneda por defecto que ningún call-site sobreescribía. Hoy la moneda es única y vive en `src/lib/precios.js`; ambos call-sites la pasan explícita y `Pago.moneda` tiene default `"PEN"`.

**Fase B — núcleo funcionando contra SUNAT beta (2026-07-26).** Módulos en `src/sunat/`:
- `certificado.js` — abre el `.p12` con node-forge y expone llave y certificado en PEM. Lee `SUNAT_CERT_P12_BASE64` (producción) o `SUNAT_CERT_P12_PATH` (desarrollo). Cachea: descifrar PKCS#12 es costoso.
- `ublInvoice.js` — XML UBL 2.1 según el Anexo N.° 1. Genera `ext:ExtensionContent` vacío para que la firma se inserte después.
- `firmaXades.js` — firma XML-DSig enveloped dentro de `ExtensionContent`, con `verificar()` para las pruebas.
- `billService.js` — empaqueta en ZIP, arma el sobre SOAP con WS-Security, envía y lee el CDR. Distingue ACEPTADO / RECHAZADO / ERROR_TRANSPORTE, porque exigen reacciones distintas: el rechazo obliga a corregir y reemitir, el error de transporte solo a reintentar.

**Validado end-to-end contra `e-beta.sunat.gob.pe`**: factura gravada, factura de exportación de servicios y boleta, las tres **ACEPTADAS con código 0 y sin observaciones**. Tres correcciones que costaron iteraciones y conviene no volver a romper:
1. **`KeyInfo` necesita el prefijo `ds:` en sus hijos.** Sin él, `X509Data`/`X509Certificate` heredan el namespace por defecto del `Invoice` y SUNAT responde **2335** "Unsupported or unrecognized Signature signer format".
2. **`cac:PaymentTerms` con `FormaPago`/`Contado` es obligatorio** en facturas desde la RS 193-2020. Sin él, **3244**.
3. **`schemeAgencyName` del tributo debe ser `PE:SUNAT`** (catálogo 05), no el de UN/ECE. Con el valor equivocado SUNAT acepta igual pero devuelve la observación **4256**.

El beta usa el RUC de pruebas `20000000001` con usuario `MODDATOS`/`moddatos` y acepta certificados autofirmados — por eso `EMISOR_RUC` es sobreescribible por entorno. Ese usuario es compartido y devuelve **401 intermitente** cuando está saturado: es transitorio, se resuelve reintentando con espera.

**Cola de envío — implementada (`src/workers/envioSunat.worker.js`).** Corre cada 10 min y solo arranca si `SUNAT_EMISION_ACTIVA=true` con certificado y credenciales presentes. Decisiones que importan:
- **Cola y no envío directo en el cobro:** SUNAT se cae, tarda o devuelve 401 por saturación, y el cobro del cliente no puede depender de eso.
- **El XML firmado se guarda ANTES de enviar.** Si el envío se corta a mitad hay que reintentar con el mismo documento; regenerarlo produciría otra firma y, si SUNAT ya había recibido el primero, un conflicto.
- **Tres desenlaces con reacciones distintas:** `ACEPTADO` cierra el ciclo; `RECHAZADO` es de fondo y no se reintenta (hay que corregir y reemitir con otro correlativo); `ERROR_TRANSPORTE` sí se reintenta con espera creciente (1, 5, 15, 60, 180, 360 min).
- **Plazo legal vigilado:** `fechaLimiteEnvio` se fija al emitir (`tributario.calcularFechaLimiteEnvio`, 3 días calendario). `marcarVencidos()` corre antes de cada tanda — no tiene sentido gastar intentos en algo que ya perdió validez. Rechazos y vencimientos **avisan por correo a `EMAIL_CONTABILIDAD`**: no se arreglan solos y alguien debe enterarse el mismo día, no al cerrar el mes.
- Los pendientes se procesan **más antiguos primero**, que son los más cerca del plazo, y espaciados 2s para no provocar 401.

**Persistencia:** `xmlFirmado` y `cdrXml` se guardan como `@db.Text` en la propia tabla. A ~10 KB por comprobante y este volumen, la BD es más simple y segura que montar almacenamiento de objetos; el disco de Railway es efímero y no era opción. Si el volumen crece mucho, migrar.

**QR en la representación impresa — implementado.** `contenidoQR()` en `comprobante.pdf.js` arma la cadena `RUC|tipo|serie|correlativo|IGV|total|fecha|tipoDocReceptor|nroDocReceptor|hash|` y se incrusta como imagen. Solo en comprobantes fiscales: el VOUCHER no lleva QR.

**Scripts de prueba (`brand-shield/scripts/`).** Correrlos antes de dar por buena cualquier modificación a `src/sunat/` o a `tributario.js`:
- `generar-cert-prueba.js` — certificado autofirmado (una vez). No se versiona: un `.p12` en el repo se confunde con el real.
- `prueba-comprobantes.js` — reglas tributarias y PDFs. Incluye una verificación de que `gravadas + IGV` cuadra al céntimo en los 100 000 importes de 1 a $1000.
- `prueba-xml-firma.js` — XML UBL, firma, verificación criptográfica y detección de manipulación.
- `prueba-sunat-beta.js` — **envía de verdad** factura, exportación y boleta a `e-beta.sunat.gob.pe`.
- `prueba-cola-envio.js` — la cola con Prisma mockeado en memoria (estados deterministas) pero enviando de verdad a beta.

**Fase B — lo que falta:** **resumen diario** para boletas y **comunicación de baja** para anulaciones. Nota: el beta aceptó boletas enviadas individualmente por `sendBill`, pero el canal reglamentario para informarlas es el resumen diario — confirmar con el contador cuál corresponde antes de emitir boletas reales.

**Trámites previos (fuera del código):** afiliarse al SEE-Del Contribuyente en SOL, crear un usuario SOL secundario solo con permiso de emisión, e inscribirse en el **Registro de Exportadores de Servicios** — sin esa inscripción las ventas al exterior no califican como exportación (pasan a código 0401) y **sí llevarían IGV**. ⚠️ Nada de esto es asesoría tributaria: confirmar con contador.

### 5. Internacionalización (ES/EN) — ✅ completa (2026-07-04)

- Landing, cookie banner, dashboard completo (sidebar, home, alertas, planes, negocios, reportes, configuración, detalle de negocio), las 30 plantillas de respuesta y el PDF mensual ya tienen versión en inglés
- Patrón usado en todo el frontend: `const TEXTOS = { es: {...}, en: {...} }` por página + `useIdioma()` (`src/context/IdiomaContext.js`) — ver `src/app/page.js` como referencia del estilo
- El idioma ahora se guarda también en el backend: campo `Usuario.idioma` (`"es"|"en"`), expuesto en `GET/PATCH /api/auth/perfil`. `AuthContext` sincroniza el valor guardado en el backend hacia `IdiomaContext` al cargar el perfil (multi-dispositivo). El selector en Configuración persiste el cambio con `auth.actualizarPerfil({ idioma })`
- `reporte.generator.js` (PDF) y el email de envío usan `usuario.idioma` para elegir el idioma del reporte
- Favicon: se generó `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` y `apple-touch-icon.png` a partir de `favicon.svg` (con `sharp`), referenciados en `src/app/layout.js`

---

## Patrones y bugs conocidos

### ✅ `trust proxy` — RESUELTO el 2026-07-29 (dejar la explicación, no revertir)

Los logs de Railway tiraban esto en cada request que pasaba por un limiter:

```
ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy'
setting is false (default).  code: 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR'
```

Railway sirve detrás de un proxy, así que la IP real del cliente llega en `X-Forwarded-For`. Con `trust proxy` en false, Express reportaba la IP del proxy y **`express-rate-limit` metía a todos los usuarios en el mismo balde**: los 100 req/15min globales y los 10/15min de auth eran un cupo compartido por todo el mundo, no por persona. Dos consecuencias que ya no aplican: auto-DoS (unos pocos usuarios activos bloqueaban al resto) y un anti-fuerza-bruta de login que no protegía por persona.

Arreglado con `app.set('trust proxy', 1)` en `src/index.js`, antes de los limiters.

⚠️ **Es `1`, NO `true`.** `true` hace que Express confíe en toda la cadena de `X-Forwarded-For`, y ahí cualquiera puede mandar el header a mano para falsear su IP y saltarse el rate-limit — el arreglo se convertiría en un agujero. `1` = confiar en exactamente un proxy, que es lo que Railway pone delante. Si algún día se mete un CDN adicional (Cloudflare en modo proxy, hoy está en "DNS only"), ese número sube a 2.

**Cómo verificar que sigue bien:** `railway logs --service api` sin `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, y una request a `/api/auth/login` que devuelva los headers `RateLimit-Limit: 10` / `RateLimit-Remaining: 9` (si el limiter cuenta, corrió bien).

### ✅ Fuga de access tokens al navegador — RESUELTA el 2026-07-29

Las rutas de `negocio.routes.js` devolvían el registro `Negocio` completo con `res.json(negocio)`, así que `tiktokAccessToken`, `tiktokRefreshToken`, `instagramAccessToken`, `facebookAccessToken`, `gbpAccessToken` y `gbpRefreshToken` viajaban al cliente y se veían en la pestaña Network. Con uno de esos tokens se puede operar la cuenta de la red social del negocio por fuera de Notoria.

**El arreglo: `src/lib/negocioPublico.js`.** Quita los 6 campos secretos y agrega los booleanos derivados `gbpConectado`, `tiktokConectado`, `instagramConectado` y `facebookConectado`. Se aplica en las 5 respuestas de `negocio.routes.js` que mandan un negocio (`GET /`, `POST /`, `GET /:id`, `PATCH /:id/configuracion`, `POST /:id/auto-respuesta/configurar`):

```js
res.json(negocioPublico(negocio));      // uno
res.json(negociosPublicos(negocios));   // lista
```

**Alcance de la auditoría (2026-07-29):** se revisaron todas las rutas que mandan negocios al cliente. `competidor.routes.js` ya usaba `select` explícito, `alerta.routes.js` y `mencion.routes.js` seleccionan solo `{id, nombre, ...}`, y `google-business.routes.js` / `redes.routes.js` devuelven mensajes o URLs. **La fuga estaba confinada a `negocio.routes.js`.** Del lado del frontend solo había **dos** consumidores, y los dos únicamente derivaban un booleano: `conexiones/page.js` (`n.gbpAccessToken && n.gbpLocationId` → `n.gbpConectado`) y `dashboard/negocios/[id]/page.js` (misma expresión → `negocio.gbpConectado`).

⚠️ **`CAMPOS_SECRETOS` es un denylist, no un allowlist.** Fue a propósito: un allowlist se desincroniza en silencio cada vez que el modelo crece y rompe el panel; el denylist falla del lado visible. El riesgo a cambio es que un campo secreto NUEVO pase desapercibido, y por eso existe `scripts/prueba-negocio-publico.js` — su prueba 9 lee `prisma/schema.prisma` y **falla si aparece un campo `*AccessToken`/`*RefreshToken`/`*Secret`/`*Password` en el modelo `Negocio` que no esté en la lista**. Si agregas una red social nueva, corre ese script.

⚠️ **`negocioPublico` NO muta el objeto original** (probado). Importa porque en varias rutas el mismo objeto se sigue usando después de responder, y borrar los tokens in-place rompería el código de abajo. Los workers y `comentario.routes.js` leen los tokens de sus propias consultas a Prisma, así que no los afecta.

El patrón a replicar si algún día otra ruta devuelve un negocio: `comentario.routes.js` ya lo hacía bien — expone `conexiones.tiktok` con nombre/avatar/username y nunca el token.

### ✅ El clasificador de sentimiento daba POSITIVO a quejas — RESUELTO el 2026-08-06

Encontrado con el primer comentario real de TikTok. `"no me gusta"` salía
**neutro** (no estaba en el diccionario) y, peor, **`"no me encanta"` salía
POSITIVO**: el matcher busca subcadenas y `'me encanta'` está en las positivas.
Un cliente molesto quedaba archivado como elogio y sin alerta — el peor error
posible para este producto. Lo mismo con `"no recomiendo"`, porque la lista solo
tenía `'no lo recomiendo'`.

Arreglo en `src/nlp/sentimiento.js`: una palabra positiva solo cuenta si no hay
un negador (`no`, `nunca`, `jamás`, `ni`, `tampoco`, `nada`) en las **3 palabras
previas**, y si lo hay el texto pasa a **negativo**, no a neutro. La ventana de 3
es a propósito: más amplia empieza a tragarse frases anteriores y convierte
`"no había cola, el servicio es excelente"` en una queja.

Se sumaron el disgusto llano sin tildes y las construcciones con el adjetivo
separado del sustantivo (`"la atención fue mala"` no casaba con `'mala atención'`).
**`'mala'` suelta NO se lista** a propósito: rompería `"no está mala"`, que en
Perú es elogio. Los comentarios ya guardados se reclasificaron.

**Lección aplicable al resto del diccionario:** cualquier lista por subcadenas
tiene este problema con la negación. Si algún día se agregan más idiomas o más
palabras, la negación hay que respetarla, no parchear frase por frase.

### 🔴 Bugs ABIERTOS en producción

Ninguno conocido a la fecha (2026-07-29).

### Turbopack caché envenenada
Si aparece el hero vacío o recargas en bucle: borrar `.next` y reiniciar.
```bash
cd brand-shield-web && rmdir /s /q .next && npm run dev
```

### Componentes dentro de componentes
Si los inputs pierden el foco o los botones desaparecen: el componente está definido DENTRO del componente padre. Moverlo al nivel del módulo (fuera de la función del componente).

### Prisma + Windows
`npx prisma generate` falla con EPERM si el backend está corriendo (bloquea la DLL). Siempre detener el backend primero.

### Groq gpt-oss y `reasoning_effort`
`openai/gpt-oss-20b`/`120b` son modelos "razonadores": sin `reasoning_effort: 'low'` en el body, gastan todo `max_tokens` pensando y `message.content` vuelve vacío con `finish_reason: "length"` (se ve en `usage.completion_tokens_details.reasoning_tokens`). Los dos endpoints de `ia.routes.js` ya lo tienen seteado — si agregas una llamada nueva a Groq con un modelo gpt-oss, no te olvides de incluirlo.

### Google Maps URL
- Correcto: `https://www.google.com/maps/search/?api=1&query=${nombre}&query_place_id=${placeId}`
- Google Reviews: `https://search.google.com/local/writereview?placeid=${placeId}`

### LAN access
- Frontend usa `resolverApiUrl()` que detecta si el host no es localhost y construye la URL con ese host
- Backend tiene CORS con regex `esOrigenRedLocal()` para 192.168.x.x y 10.x.x.x
- `next.config.ts` tiene `allowedDevOrigins` para Turbopack HMR
- Firewall de Windows necesita regla para el puerto 3000

### localStorage keys (internas, no cambiar)
- `bs_token` — JWT del usuario
- `bs_tema` — tema oscuro/claro
- `bs_idioma` — idioma ES/EN
- `bs_cookies` — elección de cookies

---

## Identidad de marca

- **Nombre**: Notoria
- **Dominio**: usenotoria.app
- **Email de contacto**: hola@usenotoria.app
- **Color verde principal**: `#0B7324`
- **Tipografía**: Georgia, 'Times New Roman', serif (alias: `GEO`)
- **Fondo oscuro**: `#141413`
- **Superficie**: `#1A1A18`
- **Texto secundario**: `#B0AEA5`

---

## Sesión 2026-07-28/29 — cambios grandes

### 13. Moneda: de dólares a soles ✅

Todo el cobro pasó a **PEN** antes de tener un solo cliente pagando (Culqi sigue sin
llaves, `pagos` tenía 0 filas). Hacerlo después habría implicado migrar registros y
convivir con comprobantes en dos monedas.

- **Fuente única: `brand-shield/src/lib/precios.js`** (`MONEDA` + `PRECIOS`). Antes los
  precios estaban **duplicados** en `pago.routes.js` y `monitoreo.worker.js`, y esa copia
  ya se había desincronizado una vez cobrando mensual a suscriptores anuales. **No volver
  a copiarlos.**
- Precios: Negocio `5900` / anual `56400`; Franquicia `17900` / anual `171600` (céntimos).
- `Pago.moneda` default `"PEN"`. El circuito de comprobantes (PDF, XML UBL, correos) ya
  leía `moneda` del registro, así que agregar USD en el futuro no obliga a tocarlo.
- Frontend: constante `S = 'S/'` en `app/page.js` y `dashboard/planes/page.js`.
- El landing deriva el precio anual con `Math.round(p.p*0.8)`; los valores explícitos de
  `planes/page.js` y `precios.js` deben cuadrar con eso.

**Descartado:** selector de monedas (ARS/CLP/MXN) y precios por geolocalización. Culqi
solo cobra PEN y USD, así que un selector sería cosmético y cambiaría el precio en el
checkout. Regla acordada si se retoma: **la IP decide qué se MUESTRA; el país fiscal
declarado decide en qué se COBRA.**

### 14. Servicio solo nacional ✅

- `utils.routes.js`: el mapa de ~200 países se redujo a `PAIS = {codigo:'pe'}`. **Se
  mantuvo a propósito el mecanismo `region` + post-filtro por `address_component`**: el
  parámetro `region` de Google solo sesga el ranking, y sin el post-filtro buscar "KFC"
  trae locales de Chile.
- `negocio.routes.js`: fuera `paisSchema`, fuera el `pais` del body y fuera el gate "un
  solo país salvo Franquicia". Todo se crea con `PAIS_UNICO = 'pe'`.
- Onboarding pasó de 4 pasos a 3. `lib/paises.js` **eliminado**. El país fiscal de
  `dashboard/facturacion` quedó oculto y fijo en `PAIS_FISCAL = 'PE'`.
- **Las columnas `Negocio.pais` y `Usuario.paisFiscal` se conservan** guardando `pe`/`PE`,
  para reabrir sin migrar. `lib/tributario.js` sigue intacto distinguiendo venta local de
  exportación.
- **Franquicia se reposicionó como multi-sede nacional** (perdió el multi-país, que era 1
  de ~11 diferenciadores).

### 15. TikTok — OAuth funcionando (2026-07-29)

Estado: **la cuenta se conecta y los tokens persisten**. La lectura de datos sigue
limitada por los scopes aprobados.

Dos trampas que costaron varios intentos y conviene no volver a pisar:

1. **El `scope` va con coma LITERAL, sin URL-encoding.** `URLSearchParams` lo convierte en
   `%2C` y TikTok lee entonces un único scope inválido, respondiendo un error genérico de
   "scope". Por eso en `redes.routes.js` el `scope` **se concatena aparte**, fuera de
   `URLSearchParams`. Los demás parámetros sí van codificados (el `redirect_uri` lo necesita).
2. **TikTok rechaza TODA la autorización si se pide un permiso que la app no tiene
   habilitado** — no ignora el sobrante. Por eso `TIKTOK_SCOPES` es configurable por
   entorno, con default `user.info.basic,video.list`. `comment.list` y `comment.create`
   requieren revisión adicional de TikTok y son los que dan el valor real del producto.

Además, añadir "Login Kit" como producto **no agrega los scopes**: hay una sección
*Scopes* aparte en la consola. Y una app en Sandbox solo funciona con las cuentas
registradas como *target users*.

`tiktok.scraper.js`: el `try` de los comentarios es **por video**, no del bucle entero —
sin `comment.list` el escaneo trae los videos igual en vez de perder el lote completo.

### 15-bis. Comentarios de TikTok — cableados (2026-07-29)

**Hallazgo:** `obtenerComentariosTikTok` y `responderComentarioTikTok` existían desde
el principio y **nunca se llamaban** — mismo caso que las menciones. La razón de
fondo era que **no había dónde guardarlos**: no existía modelo para comentarios en
publicaciones propias, e `INSTAGRAM` no está ni en el enum `Plataforma`.

**Los tres tipos de contenido del sistema, que conviene no confundir:**

| Modelo | Dónde vive | Rating | ¿Se responde desde Notoria? |
|--------|-----------|--------|------------------------------|
| `Resena` | en la ficha del negocio | **sí** | sí (Google Business, Facebook) |
| `ComentarioSocial` | en una publicación **propia** | no | **sí** — la API lo permite |
| `Mencion` | en el perfil de un **tercero** | no | no, hay que ir a la plataforma |

Piezas nuevas: modelo `ComentarioSocial`, `procesarComentariosSociales` en el worker
(dentro de `procesarNegocio`), `src/api/routes/comentario.routes.js` y el tab
**Comentarios** en `dashboard/negocios/[id]`.

**Decisiones que conviene no deshacer:**

- **`publicacionId` es lo que habilita responder.** La API de TikTok exige el
  `video_id` además del `comment_id`; un comentario guardado sin él queda de solo
  lectura y la ruta devuelve 422 en vez de fingir que se puede.
- **`respondida` solo se marca si la plataforma confirmó.** Si se guardara antes, el
  panel diría "respondido" y en TikTok no habría nada.
- **Un comentario ya guardado NO se actualiza** (`continue`, no `update`): pisar la
  fila borraría la respuesta que el usuario ya escribió y el flag de vista.
- **`null` vs `[]` del scraper significan cosas distintas**: `null` = no se pudo leer
  (falta scope o cuenta desconectada), `[]` = se leyó y no hay nada. El worker no
  debe confundir "sin permisos" con "sin comentarios".
- **`COMENTARIO_NEGATIVO` es un `TipoAlerta` propio**, distinto de
  `MENCION_NEGATIVA` porque este sí se puede responder. Recordar los **5 lugares**
  al agregar un tipo (enum, `auth.routes.js` TIPOS_VALIDOS, `tiposActivos` del
  worker, `ICONO_ALERTA`, `alertas/page.js`).
- **El borrado de cuenta necesitaba una línea nueva.** La FK de
  `comentarios_sociales` es `ON DELETE RESTRICT`, así que sin el `deleteMany` en
  `auth.routes.js` la eliminación de cuenta habría empezado a fallar.
- **Instagram NO está cableado** (su key sigue en revisión de Meta). Sumarlo es una
  entrada en `FUENTES_COMENTARIOS`, pero ⚠️ **hay que agregar `INSTAGRAM` al enum
  `Plataforma`** (+ `db push`) o la alerta reventará.

**Perfil de la cuenta conectada (2026-07-29).** El tab muestra foto, nombre y `@` de
la cuenta de TikTok en vez de un "TikTok" genérico. Se cachea en
`Negocio.tiktokNombre/Avatar/Username/PerfilUrl` para no llamar a TikTok en cada
carga; se guarda al conectar y hay **backfill perezoso** en `GET /api/comentarios`
para las cuentas que ya estaban conectadas antes de que el cache existiera.
`obtenerPerfilTikTok` **arma la lista de `fields` según `TIKTOK_SCOPES`**: pedir un
campo no autorizado hace fallar toda la llamada, así que el `@` (`username`, scope
`user.info.profile`) solo se pide si ese scope está declarado. Con `user.info.basic`
hay nombre y foto, sin `@`.

⚠️ **Cambiar `TIKTOK_SCOPES` no alcanza: hay que RECONECTAR la cuenta.** El access
token se emite con los scopes que estaban vigentes en el momento del OAuth. Si se
agrega `video.list` a la variable pero no se vuelve a pasar por el diálogo de TikTok,
el token viejo sigue sin ese permiso y el escaneo sigue trayendo cero. Es el error
más fácil de cometer al depurar "por qué no entran comentarios".

**Qué falta para verlo con datos reales** — nada de esto es código (el token
vencido que lo tapaba todo sí lo era: §15-quater):

1. **`TIKTOK_SCOPES` en Railway está en `user.info.basic` a secas**, sin
   `video.list`. Así el escaneo no puede leer ni los videos propios. Hay que
   habilitar `video.list` en la sección *Scopes* de la consola de TikTok y recién
   ahí subir la variable (§15: pedir un permiso no habilitado hace que TikTok
   rechace TODA la autorización, no solo el permiso sobrante).
2. ~~**`comment.list`** para leer los comentarios y **`comment.create`** para
   responder — requieren revisión adicional de TikTok.~~ **Falso, corregido el
   2026-07-30:** esas rutas no existen en la Display API (404). Los comentarios
   están en la API for Business — ver §15-quinquies.
3. **Sacar la app de Sandbox**: hoy solo funciona con las cuentas registradas como
   *target users*.

Mientras eso llegue, `scripts/prueba-tiktok-comentarios.js` valida todo el circuito
sin llamar a TikTok, y `POST /api/utils/monitoreo-manual` fuerza un escaneo sin
esperar el cron de 4h.

### 15-quater. El token de TikTok vencía a las 24h y nadie lo renovaba (2026-07-30)

**Síntoma:** el usuario sube un video con la cuenta conectada (@adipri) y el tab
Comentarios sigue en cero, mostrando "Escuchando los comentarios de esta cuenta".

**Diagnóstico contra la API real** (con el token guardado en la BD de prod):
`user/info` y `video/list` devolvían `{"error":{"code":"access_token_invalid"}}`.
El `tiktokTokenExpira` de los dos negocios conectados ya había pasado.

**La causa:** el access token de TikTok dura **24 horas** y no había ningún
refresh — sí lo tiene Google Business (`refrescarToken` en su scraper), TikTok no.
La cuenta funcionaba el día que se conectaba y moría al siguiente, en silencio.

**El arreglo:**
- `tiktok.scraper.js` → `refrescarTokenTikTok(refreshToken)`. Ojo: el endpoint de
  OAuth de TikTok devuelve los errores **en el cuerpo** (`{ error, error_description }`)
  a veces con HTTP 200, así que no alcanza con el `catch` de axios.
- `src/lib/tiktokToken.js` → `tokenTikTokVigente(negocio)`: único lugar donde se
  consigue un token que sirva. Renueva con 5 min de margen y **persiste**.
  Lo usan el worker, `GET /api/comentarios` (abrir el tab repara la conexión) y
  el `POST /responder`.
- **`updateMany`, no `update`.** TikTok **rota** el refresh token en cada
  renovación y una misma cuenta puede estar en varios negocios (hoy @adipri está
  en dos). Actualizando uno solo, los demás quedaban con una copia inservible.
- Solo `invalid_grant` borra los tokens (hay que reconectar). Un error de red no:
  desconectaría la cuenta por una caída pasajera.
- El panel ya no miente: `conexiones.tiktok.estado` (`ok|vencida|sin_conectar`) y
  el aviso naranja en la tarjeta de la cuenta.

**Lo que este arreglo NO destraba** (sigue siendo de TikTok, no del código): con
`TIKTOK_SCOPES=user.info.basic` el token ni siquiera puede listar los videos, y
`comment.list`/`comment.create` siguen sin aprobación. O sea: renovado el token,
el video recién subido **tampoco** aparece hasta habilitar `video.list` en la
consola + reconectar la cuenta (§15-bis: cambiar la variable no alcanza).

### 15-quinquies. Los comentarios NO están en la Display API (2026-07-30)

Hallazgo que cambia el plan del producto. Con `video.list` ya funcionando y un
token válido, se probaron las rutas de comentarios una por una:

| Ruta | Respuesta |
|------|-----------|
| `open.tiktokapis.com/v2/comment/list/` | **404 en HTML** |
| `open.tiktokapis.com/v2/video/comment/list/` | **404 en HTML** |
| `open.tiktokapis.com/v2/comment/reply/create/` | **404 en HTML** |
| `open.tiktokapis.com/v2/research/video/comment/list/` | 401 (existe; solo investigadores académicos aprobados) |
| `business-api.tiktok.com/open_api/v1.3/business/comment/list/` | **`40113 Invalid app id sbawdzjx51ga2z288z`** |

**Cómo leerlo:** un 404 devuelto en HTML es del balanceador, no de la API — esa
ruta no existe. El `40113` en JSON es la API contestando: la ruta SÍ existe y lo
que rechaza es la app. O sea que los comentarios se leen y responden con la
**TikTok API for Business** (otro portal: `business-api.tiktok.com`, otra app,
su propio OAuth `tt_user/oauth2` con header `Access-Token`, y cuenta Business),
no con la Display API donde está registrada la app actual.

**Consecuencia:** esperar la aprobación de `comment.list`/`comment.create` en
la consola de TikTok for Developers es esperar algo que ahí no existe — esos
scopes ni siquiera aparecen en la lista de la app. El trabajo pendiente no es
"esperar", es **registrar la app en el portal de Business** y agregar un segundo
cliente OAuth. El circuito interno (dedupe, sentimiento, alertas, `POST
/responder`) ya está probado y no cambia: cambia la URL y la forma del request.

**Lo que sí quedó funcionando hoy:** perfil y `video.list` (títulos, fecha,
`comment_count` y `share_url` de cada video). Alcanza para mostrar los videos
del negocio en el panel aunque los comentarios todavía no se puedan leer.

### 15-sexies. Plan: comentarios vía TikTok API for Business (2026-07-30)

**Estado: esperando revisión de TikTok.** La solicitud se envió el 2026-07-30.
Hasta que aprueben, no hay nada que codificar (ver "Método" más abajo).

**Lo verificado antes de planear nada.** Se golpeó cada ruta sin token: si
contesta `40104 access_token is empty` la ruta existe; si contesta
`40006 no schema found`, no.

| Endpoint (`business-api.tiktok.com/open_api/v1.3`) | ¿Existe? |
|---|---|
| `GET /business/get/` | ✔ |
| `GET /business/video/list/` | ✔ |
| `GET /business/comment/list/` | ✔ |
| `POST /business/comment/reply/create/` | ✔ |
| `POST /business/comment/delete/` | ✔ |
| `POST /business/comment/status/update/` | ✖ |
| `GET /business/mention/list/` | ✖ — **no sirve para §18** |
| `POST /tt_user/oauth2/token/` y `/refresh_token/` | ✔ |

**Esquema del OAuth, sacado del propio endpoint** (se le fueron agregando campos
hasta que dejó de quejarse de la forma y pasó a `40131 Authorization code is
expired`): `client_id` + `client_secret` + `grant_type` + `auth_code` +
`redirect_uri`. Ojo: es **`client_id`**, no `app_id` como dicen muchos ejemplos.

**Fase 0 — hecha el 2026-07-30 (portal, no código):**
- Registro de developer en `business-api.tiktok.com` con correo del dominio
  (`didier@usenotoria.app`, habilitado con Cloudflare Email Routing porque la
  raíz no tenía MX; el SPF de Resend vive en `send.` así que no hubo conflicto).
  TikTok **rechaza correos personales** para este registro.
- App creada con el permiso **TikTok Accounts** y solo cuatro sub-permisos:
  Account User, Get Account Media, Account Comment, Auth Code Management.
  Se dejaron fuera Account Post Content, Business Benchmark y Discovery Search.
- Redirect URIs declaradas (las dos): `https://api.usenotoria.app/api/redes/tiktok-business/callback`.
  El campo que importa es **TikTok account holder redirect URL** — el de
  *advertiser* es para OAuth de cuentas publicitarias, que no se usan.
- ⚠️ **Pendiente del usuario:** la cuenta @adipri debe ser **cuenta Business**
  de TikTok. La Business API no opera cuentas personales.

**Fase 1 — a codificar cuando lleguen las credenciales:**
- `src/scrapers/tiktokBusiness.scraper.js` — header `Access-Token` y `business_id`.
- `src/lib/tiktokBizToken.js` — refresh propio; **reusar la lógica ya probada**
  de `tiktokToken.js` (rotación + `updateMany`, §15-quater).
- Rutas `/api/redes/:negocioId/tiktok-business/{conectar,callback}` con el
  `state` firmado de `lib/oauthState.js`.
- Prisma: `tiktokBizId`, `tiktokBizAccessToken`, `tiktokBizRefreshToken`,
  `tiktokBizTokenExpira` (+ `db push` contra prod, pedir autorización).
- Worker: una entrada más en `FUENTES_COMENTARIOS`. **El resto no se toca**:
  dedupe, sentimiento, alertas y `POST /responder` son agnósticos de la fuente.
- Variables en Railway: `TIKTOK_BIZ_CLIENT_ID`, `TIKTOK_BIZ_CLIENT_SECRET`.

**Método — la lección de §15-bis.** No escribir este código antes de tener
credenciales. `obtenerComentariosTikTok` se escribió a ciegas contra un endpoint
inexistente, pasó las pruebas con mocks y aparentó funcionar durante meses. Con
credenciales reales se construye probando contra la API de verdad.

**Riesgos:** la aprobación depende de TikTok y puede demorar o ser rechazada;
pasar la cuenta a Business tiene efectos del lado de TikTok (música comercial
limitada, etc.); y quedarían **dos conexiones de TikTok** por negocio (Display
para videos, Business para comentarios) salvo que se migre todo a Business, que
también lista videos. Recomendado: migrar a Business cuando esté aprobado y
dejar Display solo como respaldo para cuentas personales.

### 15-septies. Eliminar una conexión de red social (2026-08-02)

**El agujero:** no había forma de desconectar una cuenta. Una vez autorizada quedaba
enlazada para siempre — `redes.routes.js` solo tenía los dos callbacks, `/estado` y los
dos `/conectar`, y en el frontend no existía ni la palabra "Desconectar". El enlace
**Reconectar** que se agregó el 2026-07-30 solo servía para repetir el OAuth con la
MISMA cuenta; no resolvía cambiar de cuenta ni retirar el acceso.

Además es lo primero que mira un revisor de permisos de plataforma —
"¿qué pasa cuando el usuario retira el consentimiento?" — así que faltaba justo antes de
grabar el video del Accounts API Form.

**Backend:** `DELETE /api/redes/:negocioId/:red` (`tiktok` | `instagram`), con la lista
blanca de campos a limpiar en `REDES_DESCONECTABLES`. Y `revocarTokenTikTok` en el
scraper, contra `POST /v2/oauth/revoke/`.

Tres decisiones que importan:
- **Se revoca del lado de TikTok, no solo local.** Borrar el token nuestro deja la app
  viva en las "apps conectadas" del usuario, y el siguiente OAuth se saltea la pantalla
  de consentimiento. Sin revocar, "Eliminar conexión" es mentira a medias.
- **Solo se revoca si ningún otro negocio comparte la cuenta.** Una misma cuenta de
  TikTok puede estar enlazada a VARIOS negocios (pasa con @adipri; ver el comentario de
  `updateMany` en `lib/tiktokToken.js`). La revocación es global a la cuenta, así que
  desconectar un negocio tumbaría los demás en silencio.
- **La revocación es best-effort.** Si TikTok no contesta, los tokens locales se borran
  igual. Negarse a desconectar porque un tercero falla deja al usuario atrapado.
- **No se borran los `ComentarioSocial` ya recogidos**: son historial del negocio. Al
  reconectar la misma cuenta, el dedupe por `externalId` evita duplicarlos.

**Frontend** (`dashboard/conexiones`): el enlace "Reconectar" de la fila se reemplazó por
un **botón de tuerca** al lado de la pastilla "Conectado", que abre un modal con la cuenta
enlazada (avatar, nombre y @, del perfil cacheado de §15-bis), la reautorización como
acción secundaria, y "Eliminar conexión" en rojo con confirmación en dos pasos. Al
terminar se recarga el listado completo, no se parchea el estado local: la desconexión
también limpia `tiktokNombre/Avatar/Username/PerfilUrl`, que vienen del listado de
negocios y no de `/estado`.

### 15-octies. Comentarios de TikTok FUNCIONANDO — Accounts API (2026-08-06)

**Se acabó el bloqueo que estaba abierto desde el 2026-07-29.** La app `Notoria`
(App ID `7669515464170536977`) quedó aprobada en `business-api.tiktok.com` con
los 4 sub-permisos de *TikTok Accounts*, y el circuito completo se verificó
**contra la API real** con la cuenta `@usenotoria`: perfil, videos, lectura de
comentarios y **una respuesta publicada de verdad** en un video de prueba.

**Método (§15-bis, otra vez):** no se escribió una línea del scraper hasta tener
las respuestas crudas de la API. `scripts/sonda-tiktok-business.js` queda en el
repo para volver a hacerlo: valida credenciales sin autorizar nada, imprime la
URL de consentimiento, canja el código y vuelca los tres endpoints.

**Lo que costó descubrir y no hay que re-derivar:**

| Cosa | Valor correcto | Qué pasa si se equivoca |
|---|---|---|
| URL de autorización | `https://www.tiktok.com/v2/auth/authorize/` con `client_key` = App ID | — |
| Scope para responder | **`comment.list.manage`** | `comment.create` **NO EXISTE**: `error=invalid_scope` y falla TODA la autorización, sin decir cuál sobra |
| Scope de perfil | `user.info.profile` obligatorio | sin él `/business/get/` responde `40130` |
| `business_id` | es el **`open_id`** del canje | — |
| Header de auth | **`Access-Token`** | `Authorization: Bearer` se ignora |
| Parámetro del canje | **`client_id`** | muchos ejemplos dicen `app_id` y TikTok lo rechaza |
| Errores | **HTTP 200 con `code != 0`** en el cuerpo | el `catch` de axios no los ve y todo parece OK |
| Campos | `caption` (no title), `comments` (no comment_count), `videos_count` (no video_count) | `40002`, y la API enumera los válidos — leer ese mensaje |
| `create_time` | llega como **string** de segundos | `new Date()` directo da Invalid Date |

Pedir un campo no autorizado hace fallar la llamada **entera** con `40130`; no
devuelve el resto. `is_business_account`, `followers_count` y `profile_views`
cuelgan de *Brand Insights*, que no está concedido — no incluirlos.

**Endpoints habilitados que NO se habían previsto** y que valen para el producto:
`comment/hide`, `comment/pin`, `comment/like`, `comment/delete`,
`comment/reply/list`. Ocultar y fijar son las dos herramientas que un dueño
quiere de verdad ante un comentario tóxico. Hoy solo está cableado `hide`.

**Scope final y correcto**, el que usa `POST /:negocioId/tiktok/conectar`:

```
user.info.basic,user.info.profile,user.info.stats,video.list,comment.list,comment.list.manage
```

Va **fijo en el código**, no por variable de entorno: se verificó permiso por
permiso y un valor equivocado rompe TODA la autorización con `invalid_scope` sin
decir cuál sobra. Dejarlo suelto en Railway invita justo a esa clase de error.

**Arquitectura elegida: UNA sola conexión, por la Accounts API.** Cubre todo lo
que hacía la Display (perfil + videos) y además comentarios, así que el usuario
autoriza una vez. `POST /:negocioId/tiktok/conectar` devuelve la URL de Business
si hay credenciales, y cae a Display si no. `tiktok.scraper.js` **se conserva
intacto** como respaldo hasta confirmar que la app de Business no está en Sandbox
— migrar a ciegas rompería la conexión de clientes reales.

Los 4 campos del perfil cacheado (`tiktokNombre/Avatar/Username/PerfilUrl`) los
comparten las dos conexiones a propósito: es la misma cuenta en el mismo sitio;
duplicarlos crearía dos versiones que se contradicen.

**Archivos:** `src/scrapers/tiktokBusiness.scraper.js`, `src/lib/tiktokBizToken.js`
(gemelo de `tiktokToken.js`, con la misma rotación de refresh token de §15-quater),
`redes.routes.js` (callback + conectar + desconexión de las dos), `comentario.routes.js`
(helper `conexionTikTok`), `monitoreo.worker.js` (la fuente TIKTOK prefiere Business),
`negocioPublico.js` (2 campos secretos nuevos), `schema.prisma` (4 campos `tiktokBiz*`).
Pruebas: `scripts/prueba-tiktok-business.js` (15, con `axios.request` sustituido).

**Regla de producto que hay que decirle al cliente:** TikTok solo expone videos
**públicos**. Uno publicado como "Amigos" devuelve `videos: []` con `code: 0` —
indistinguible de una cuenta vacía. Si el negocio publica en privado, Notoria no
ve nada y no hay forma de rodearlo.

**Revocación:** `POST /tt_user/oauth2/revoke/` existe (verificado con el método de
§15-sexies: responde `40131` sobre el token, no `40006 no schema found`) y está
cableada. Se revoca solo si ningún otro negocio del usuario comparte el refresh
token, igual que en §15-septies.

**Nota que corrige un comentario del código:** `redes.routes.js` afirma que TikTok
exige las comas del `scope` sin codificar y que `%2C` rompe la autorización. En
las pruebas del 2026-08-06 la URL llevaba `%2C` y funcionó. No se tocó el código
de Display por eso, pero esa nota puede mandar a alguien a buscar un problema que
no existe.

**Desplegado, verificado y PROBADO POR EL USUARIO en la interfaz el 2026-08-06.**
Funcionan de punta a punta: conexión, lectura de comentarios, responder, borrar
la propia respuesta, ocultar y fijar.

#### ✅ NO está en Sandbox (resuelto el 2026-08-06)

En la API for Business el sandbox es un entorno **aparte y opt-in, con otro
dominio** (`sandbox-ads.tiktok.com/open_api/`), que además solo aplica a cuentas
publicitarias; el propio portal etiqueta `business-api.tiktok.com/open_api/`
como *Production*. **No confundirlo con el Sandbox de `developers.tiktok.com`**,
que sí limita la app de Display a cuentas *target user*. La función se puede
vender a clientes.

#### ⚠️ `/business/get/` exige `user.info.stats` — costó una hora

Síntoma: la cuenta se conectaba bien, los comentarios entraban, pero el panel se
quedaba con el avatar genérico. El callback guardaba los tokens y a continuación
fallaba al leer el perfil con `40130`, así que nombre y avatar nunca se llenaban.

Se diagnosticó comparando **dos tokens que solo diferían en ese scope**: sin
`user.info.stats`, `/business/get/` responde 40130 **incluso pidiendo solo
`display_name`**. Se había excluido pensando que solo servía para el contador de
seguidores. Además `CAMPOS_PERFIL` incluye `videos_count`, que es un campo de
estadísticas, y pedir un campo no autorizado hace fallar la llamada **entera**.

Red de seguridad añadida: ante un 40130 el perfil se reintenta con lo mínimo
(`display_name` + `profile_image`), para que un permiso ausente no deje al panel
sin nombre ni avatar pudiendo tenerlos.

**Trampa de la pantalla de consentimiento:** el primer interruptor ("Acceder a la
información de tu perfil — avatar y nombre") **se ve encendido y no se puede
mover** porque es `user.info.basic`, obligatorio. Verlo así **no** significa que
el resto de permisos estén concedidos. Se perdió tiempo buscando un interruptor
apagado que no existía; la respuesta estaba en `railway logs`, que se debieron
mirar antes.

**Y no desconectar/reconectar en bucle al depurar:** cada "Eliminar conexión"
revoca de verdad del lado de TikTok. Ese bucle dejó al negocio sin conexión y
añadió ruido al diagnóstico.

#### Respuestas hechas fuera de Notoria

Si el dueño contesta desde la app de TikTok, Notoria no se enteraba y le mostraba
el comentario como pendiente para siempre — y la métrica que vende el producto es
justamente el tiempo de respuesta. `replies` cuenta las de cualquiera, así que se
pide el hilo con `/business/comment/reply/list/` y se busca `owner: true`. Solo
para comentarios con respuestas: la mayoría no tiene ninguna y sería una llamada
extra por cada uno.

El worker sincroniza `respondida` en **una sola dirección** (marca, nunca
desmarca): una lectura fallida de TikTok reabriría comentarios ya cerrados. La
moderación sí va en las dos, porque ahí TikTok es la fuente de verdad y no hay
nada escrito por el usuario que pisar.

Un comentario negativo que el dueño ya respondió **no dispara alerta**: avisar
por correo y WhatsApp de algo recién resuelto es el ruido que hace que la gente
deje de mirar las notificaciones.

#### Moderación: ocultar, fijar, like

Las tres comparten forma de request, **verificada contra la API real**:

| ruta | acciones |
|---|---|
| `/business/comment/hide/` | `HIDE` · `UNHIDE` |
| `/business/comment/pin/` | `PIN` · `UNPIN` |
| `/business/comment/like/` | `LIKE` · `UNLIKE` |

⚠️ **`video_id` es obligatorio en las tres**, aunque el `comment_id` ya
identifique el comentario sin ambigüedad. Omitirlo da `40002 video_id: Missing
data for required field` — la primera versión de este código lo omitía, y el
error solo apareció al probar de verdad.

**`/business/comment/delete/` existe pero NO se expone en el panel**: es
irreversible y suele escalar el conflicto. Ocultar consigue lo mismo — el
comentario desaparece de la vista pública, su autor lo sigue viendo y no recibe
aviso — sin nada que lamentar. No ponerlo a un clic de distancia.

Columnas `ComentarioSocial.oculto` y `.fijado` para que los botones muestren el
estado real al recargar; el worker las resincroniza desde TikTok en cada escaneo.

### 15-ter. Limpieza de navegación pedida por el usuario (2026-07-29)

- **La pestaña "Sospechosas" ya no existe** en la ficha del negocio: eran las mismas
  reseñas mostradas dos veces. Vive dentro de **Reseñas**, detrás del filtro
  "Sospechosas" que ya estaba. Al fusionarla hubo que **subir a la tarjeta de reseña**
  lo que solo tenía la pestaña vieja: el chip con `motivoSospecha`, el borde rojo y el
  botón **Reportar**. Sin eso la fusión habría perdido funcionalidad.
  El consejo de "Revisar sospechosas" ahora usa `cta.accion` (setea el filtro y
  cambia de tab) en vez de `tabDestino`, que apuntaría a una pestaña inexistente.
- **"Comparación automática" solo se muestra a `FRANQUICIA`.** A las demás cuentas
  era una puerta cerrada. Se filtra al armar `TABS`; el `useEffect` que la carga ya
  validaba el plan.
- **"Planes" salió del menú lateral.** La ruta sigue viva. Ojo: el recuadro del plan
  al pie del sidebar mostraba el enlace **solo a cuentas GRATIS**, así que hubo que
  hacerlo visible siempre ("Ver planes →" para las de pago) o `/dashboard/planes`
  quedaba inalcanzable justo para quien paga.

### 16. Identidad visual y navegación

- **Logo propio**: la N asimétrica en `components/LogoNotoria.js` (forma RELLENA, por eso
  NO va en `components/Icons.js`, que dibuja con stroke). El asta derecha sube más y se
  corta en bisel al revés de la diagonal: **ese bisel es la identidad, no "arreglarlo"**.
  Originales 1024px y script reproducible en `Vigilio/marca/`.
- **El escudo sigue vivo donde es semántico**: "sin reseñas sospechosas" y el consejo de
  protección en `negocios/[id]`, el escudo rojo de "sin conexión", el chip decorativo de
  planes y la privacidad del `CookieBanner`. Convertirlos en logo sería un error de
  significado.
- **Tema claro/oscuro en el landing**: la paleta `C` de `app/page.js` pasó de hex fijos a
  `var(--*)`. ⚠️ **`var()` no sirve fuera de CSS**: `new THREE.Color('var(--accent)')` no
  parsea y cae a blanco — eso rompió la animación del hero. Para WebGL/canvas usar la
  constante `VERDE_MARCA`; para CSS, `C.green`. Se añadieron `--border-l` y `--bg-t` a
  `globals.css` (`--bg-t` porque la viñeta concatenaba alfa como `${C.bg}CC`, imposible
  con `var()`).
- **Navegación**: `Facturación` salió del menú lateral y vive dentro de *Configuración*
  (la ruta `/dashboard/facturacion` sigue viva: los correos de comprobante enlazan ahí).
  Se creó **`/dashboard/conexiones`**, que muestra las 5 conexiones de todos los negocios
  juntos; la ficha del negocio solo conserva un enlace para no duplicar la UI.

### 17. Hallazgo del deploy: Fase A nunca estuvo en prod

Al desplegar se descubrió que **las tablas `comprobantes` y `series_comprobante` no
existían en producción**, ni las 5 columnas fiscales de `usuarios`. La pantalla de
facturación estaba rota y nadie lo notó porque sin llaves de Culqi nadie llega ahí. Ya
aplicado.

**Lección:** después de tocar `schema.prisma`, verificar contra prod antes de dar una fase
por desplegada:

```bash
npx prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script
```

Es de solo lectura y muestra exactamente qué le falta. Ojo: el clasificador de permisos
bloquea `prisma db push` desde el agente — el flujo es revisar el diff y que el usuario lo
corra.

### 18. Menciones — escucha de lo que otros dicen de la marca (2026-07-29)

Distinción que sostiene todo el diseño: una **reseña** la dejan EN tu ficha y llega
sola; una **mención** la publica un tercero en su propio perfil y hay que salir a
buscarla. Por eso `Mencion` no es una `Resena` con otro nombre: no tiene rating, no
se responde desde Notoria (se responde en la plataforma de origen, de ahí que cada
mención lleve su `url`) y su modelo vive aparte.

**Lo que se encontró al empezar:** el modelo `Mencion` ya existía y una función
`procesarMencionesTwitter` también… pero **nunca se llamaba desde ningún lado**. La
tabla jamás se llenó y no había ni ruta ni UI que la leyera. O sea que la función
existía en el papel y no en el producto.

⚠️ **X/Twitter se eliminó del producto (2026-07-29).** No fue una decisión de
alcance sino de honestidad del dato: el comentario de `twitter.scraper.js` decía
"API básica gratuita, free tier 500k tweets/mes" y **eso quedó falso el 6 de
febrero de 2026**, cuando X cerró el tier gratuito y pasó a pago por uso (~US$0.005
por post leído). O sea que X era tan de pago como TikTok y no aportaba la fuente sin
costo que se creía. Se borró `twitter.scraper.js` y todo su cableado. **Si alguien
lo quiere reactivar, hay que presupuestarlo como proveedor de pago**, igual que
TikTok — no como "solo falta el token".

**Arquitectura (fuentes intercambiables):**

| Pieza | Qué hace |
|-------|----------|
| `src/nlp/sentimiento.js` | `clasificar(texto)` → negativo/positivo/neutro. Por diccionario a propósito, **no** con IA: el worker clasifica cada mención en cada ciclo y mandar eso a Groq costaría tokens por algo que la lista resuelve. Lo negativo gana sobre lo positivo |
| `src/scrapers/tiktokMenciones.scraper.js` | Fuente TikTok. **Seam sin proveedor** — ver abajo |
| `src/lib/menciones.js` | `construirTerminos(negocio)`, `fuentesDisponibles()` y `hayFuenteDisponible()`. Fuente única para worker y rutas, así el panel no puede mentir sobre qué se está buscando |
| `monitoreo.worker.js` → `procesarMenciones` | Corre dentro de `procesarNegocio`, en el mismo ciclo de 4h |
| `src/api/routes/mencion.routes.js` | `/api/menciones` — feed con filtros, marcar vista/archivada, términos por negocio |
| `dashboard/menciones/page.js` | El panel |

**Por qué TikTok no trae menciones y no es cuestión de escribir el código**
(verificado 2026-07-29). No hay API oficial que sirva:

- **Display API** (la que ya usamos por OAuth): `video/list` devuelve **solo los
  videos del usuario autenticado**. No hay búsqueda ni endpoint de menciones.
- **Research API**: `/v2/research/video/query/` sí busca por keyword y hashtag —
  es exactamente lo que hace falta — pero TikTok **restringió la elegibilidad a
  instituciones académicas y sin fines de lucro**, y usarla comercialmente es
  causal de retiro del acceso. Notoria no califica.
- **Business API**: solo métricas de la cuenta propia. **Commercial Content API**:
  solo publicidad y solo UE.
- Las menciones con `@` llegan a la bandeja de la app, **sin API que la lea**.

Única vía real: un **proveedor de datos externo de pago** (EnsembleData ~US$100/mes,
Apify US$39/mes + por resultado, etc.). Es el **primer costo variable por cliente**
que tendría Notoria — decisión de negocio pendiente, no deuda técnica. Cuando se
decida, se enchufa **solo tocando `tiktokMenciones.scraper.js`**: implementar
`consultarProveedor()`, mapear en `normalizar()` y setear las dos variables de
entorno. Worker, alertas y panel ya están cableados.

**Regla de producto (2026-07-29): lo que no podemos entregar NO se muestra.** Nada
de "próximamente", ni pastillas de "requiere proveedor", ni explicarle al cliente
por qué una fuente está apagada — anunciar algo sin fecha invita a preguntar por
esa fecha. La implementación lo hace imposible de romper por descuido:

- `fuentesDisponibles()` devuelve **solo las fuentes que funcionan**, sin campo
  `motivo`. La UI no recibe el dato de una fuente apagada, así que no puede
  pintarlo aunque alguien lo intente.
- Si **ninguna** fuente está activa, la sección entera desaparece: el nav esconde
  el ítem (`navItems[].soloSi`, alimentado por `usuario.mencionesDisponibles` que
  viaja en `GET /api/auth/perfil`) y `/api/menciones` responde **404, no 403** — no
  es falta de permiso, es que la función no existe para nadie todavía. La página
  redirige al resumen si alguien entra por URL directa.
- Hoy eso significa que **Menciones no se ve en el panel de nadie**, porque no hay
  ninguna fuente activa. Aparece sola en cuanto `MENCIONES_PROVEEDOR` y
  `MENCIONES_PROVEEDOR_API_KEY` estén en Railway, sin desplegar frontend.
- Contrapartida asumida: si se apaga una fuente cuando ya hay menciones guardadas,
  el usuario deja de poder verlas. Es aceptable porque las fuentes se configuran
  por entorno (decisión de administrador), no por cuenta, y los datos no se borran.

**Decisiones que conviene no deshacer sin pensarlo:**

- **`MENCION_NEGATIVA` es un `TipoAlerta` propio.** Antes el código muerto emitía
  `RESENA_MUY_NEGATIVA` con `plataforma: 'GOOGLE'`, que era falso y encima hacía
  que el umbral "solo picos" de `prefsAlertas` lo silenciara sin querer. Al agregar
  un tipo hay que tocar **cinco** lugares: el enum, `auth.routes.js` (`TIPOS_VALIDOS`,
  si no el usuario no puede activarlo), `monitoreo.worker.js` (`tiposActivos` del
  resumen), `Icons.js` (`ICONO_ALERTA`) y `alertas/page.js` (tipos + labels es/en).
- **`externalId` lleva prefijo de fuente** (`tw_`, `tt_`): la columna es única
  global y un id de TikTok podría chocar con uno de otra plataforma.
- **`notificada` en `Mencion`**: sin ese flag, cada ciclo de 4h reenviaría el mismo
  correo por la misma mención. Solo se alerta lo negativo, y solo la primera vez.
- **Archivar ≠ eliminar.** Si borras una mención que sigue apareciendo en la
  búsqueda, el siguiente ciclo la vuelve a crear. Archivar es lo que la saca de la
  vista para siempre.
- **Términos mínimo 3 caracteres, máximo 8 por negocio.** No es capricho: con
  proveedores que cobran por resultado, buscar "Ok" es ruido caro.
- **`MENCIONES_MAX_POR_TERMINO`** (default 20) existe desde antes de tener
  proveedor, a propósito: una marca con nombre común dispara la factura en un
  ciclo si no hay techo.
- **Gating: planes Negocio y Franquicia**, mismo criterio que la conexión de redes.
  Si se quiere abrir a GRATIS son dos líneas (el `verificarPlan` de la ruta y el
  early-return de `procesarMenciones`).

**Migración: ✅ YA APLICADA en producción** (`prisma db push`, 2026-07-29 — lo corrió
el usuario). Verificado leyendo prod: las 6 columnas nuevas de `menciones`, las 2 de
`negocios` (`terminosMencion`, `mencionesActivas`), el índice, y los valores de enum
`Plataforma.TIKTOK/TWITTER` y `TipoAlerta.MENCION_NEGATIVA` están todos ahí.
`menciones` tiene 0 filas.

⚠️ **`Plataforma.TWITTER` quedó huérfano y se deja a propósito.** El valor ya está
aplicado en prod y ninguna fila lo usa (verificado: `resenas` y `snapshots` son 100%
`GOOGLE`, `alertas` está vacía). Pero **borrar un valor de un enum de Postgres no es
un `ALTER`**: Prisma genera un `CREATE TYPE` nuevo + casteo de `resenas`,
`snapshots` y `alertas` + `DROP TYPE`, y pide `--accept-data-loss`. Es riesgo real en
prod a cambio de cero beneficio visible. Si alguien ve el valor y quiere "limpiarlo",
esta es la razón para no hacerlo.

✅ **La BD de prod ya no tiene nada pendiente** (verificado 2026-07-29 con
`prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script`,
que devolvió "empty migration"). El cambio de default cosmético que figuraba acá
(`menciones.plataforma` de `'TWITTER'` a `'TIKTOK'`) ya entró en un `db push`.

## Sesión 2026-08-03 — GitHub, crecimiento del landing y Meta (§19)

### 19. Estado EXACTO al cierre de la sesión — leer esto para continuar

**Desplegado y verificado en producción (frontend Vercel + backend Railway):**
- **Widget "analiza tu negocio gratis"** en el hero (solo visitantes sin sesión). Backend `src/api/routes/publico.routes.js` (`/api/publico/buscar-negocio` + `/analizar`): sin auth, rate-limit propio 15 req/15min por IP, máx. 4 verificaciones de país por búsqueda, caché en memoria 6h por placeId, teaser con UNA muestra sospechosa recortada (el informe completo pide registro). Frontend `components/AnalisisGratis.js`. Probado end-to-end contra prod. Script: `scripts/prueba-publico.js` (⚠️ gasta ~6 llamadas reales de Places).
- **Drip de onboarding ACTIVO**: `Usuario.dripEtapa` (db push aplicado en prod), `workers/drip.worker.js` (cron diario 10:00 Lima), `enviarDrip` en `utils/emails.js` (4 variantes ES/EN). Día 2 según estado real (sin negocio / sin GBP / nada que pedir), día 5 valor con cifras, día 7 promo 50% solo GRATIS sin promo usada. Ventana 30 días, solo emails verificados, máx. 1 etapa/día, **la etapa avanza ANTES de enviar** (fallo de Resend = ese correo se pierde, no se duplica). 11 pruebas en `scripts/prueba-drip.js`.
- **Página `/eliminar-datos`** (bilingüe, footer + sitemap) — es la URL para el campo "Eliminación de datos de usuario" de la app de Meta (opción "URL de instrucciones").
- **Botón flotante de WhatsApp** (`components/BotonWhatsApp.js`), gated por `NEXT_PUBLIC_WHATSAPP_VENTAS` (ya en Vercel con 51955599041).
- **Tabla comparativa rediseñada** (ES+EN): filas idénticas en los 3 planes movidas a la línea `incluidos` sobre la tabla; labels como beneficio ("Un ataque se detecta en máximo 24h/4h/1h"); **cero "Próximamente" en landing y dashboard/planes** (regla de producto §18). La pastilla "Próximamente" de `dashboard/conexiones` se queda: desaparece sola al configurar Meta. Verificado: 0 chunks del landing con ese texto.
- **`@vercel/analytics`** montado en `layout.js`. ⚠️ Falta que el usuario habilite Web Analytics en el dashboard de Vercel (proyecto notoria-web → Analytics → Enable) o no recolecta.
- **Factura electrónica como feature visible**: grupo Facturación en la comparativa + línea en tarjetas de precios y dashboard/planes.
- `docs/politica-solicitudes-autoridades.md`: respaldo del "requests-4" del formulario de tratamiento de datos de Meta (se marcaron las 4 casillas).

### Meta / Instagram — dónde quedó EXACTAMENTE

1. **Negocio verificado** en Business Manager (29-jul-2026). ✔ Confirmado también desde la app el 2026-08-06: *Configuración → Básica → Portfolio comercial* muestra **Notoria, identificador 1337974595147527, Verificado**.

1-bis. ✅ **Renovación del acceso a los datos COMPLETADA y app en modo ACTIVO (2026-08-06).** Correo de Meta ese mismo día: *"Se completó la renovación del acceso a los datos de Notoria"* (app `2232447584255257`, negocio `1337974595147527`), sin más acciones hasta la evaluación anual siguiente. Con eso el interruptor *Modo de la app* pasó a **Activo**.

   **El orden importa y costó encontrarlo:** renovación del acceso a datos → modo Activo → App Review. Y ahora hay un tercer motivo para estar en Activo que no se conocía al documentar esto: **Meta no envía webhooks a una app en modo Desarrollo**. O sea que el modo Activo no era solo el trámite previo a la revisión, era también la condición para que exista el canal de eventos en tiempo real (§20).
2. **Primera app (ID 1709333600393009) es tipo CONSUMIDOR → NO SIRVE.** Sus permisos disponibles son solo `email`/`public_profile`/`user_*`; los `instagram_*`/`pages_*` no existen en ese tipo y no se pueden agregar (error "Invalid Scopes" al abrir el diálogo OAuth). Sus llaves quedaron cargadas en Railway y hay que REEMPLAZARLAS.
3. ✅ **App tipo NEGOCIO creada (2026-08-06): ID `2232447584255257`.** Llaves cargadas en Railway y **verificadas dentro del contenedor** (`railway ssh --service api "printenv META_APP_ID"` → devuelve la nueva; secreto presente, 32 chars). Railway `4ebfdbc3` SUCCESS, `/health` 200. ⚠️ El secreto se compartió por chat, así que **el usuario va a rotarlo**: al rotar hay que volver a cargarlo en Railway o el OAuth deja de funcionar con un error genérico de credenciales que no menciona el secreto.
4. ⚠️⚠️ **TRAMPA: hay DOS "APIs de Instagram" y no son intercambiables.** La consola ofrece por defecto *"Configuración de la API con inicio de sesión de empresa de Instagram"* (**Instagram Login**): habla con `api.instagram.com`, usa permisos `instagram_business_*` y no involucra ninguna página de Facebook. **El código de Notoria NO usa esa.** `redes.routes.js` pide el token a `graph.facebook.com/v21.0/oauth/access_token`, llama a `me/accounts` buscando la página con `instagram_business_account`, y pide `instagram_basic,instagram_manage_comments,pages_show_list,pages_read_engagement` — es el sabor **Facebook Login**. Entrar por la pantalla de Instagram Login lleva a configurar algo que el backend no sabe consumir. **Ir siempre a Agregar producto → Facebook Login for Business**, no a la sección de Instagram. Se decidió mantener el sabor Facebook Login: el mercado son restaurantes y hoteles, que casi siempre ya tienen página de Facebook ligada al Instagram, y cambiar de sabor obligaría a reescribir OAuth, scraper y los textos del App Review.
5. ✅ **Consola de Meta configurada (2026-08-06).** Producto **Facebook Login for Business** añadido, redirect URI `https://api.usenotoria.app/api/redes/instagram/callback` en el campo *URI de redireccionamiento de OAuth válidos*, `public_profile` con **acceso avanzado** concedido (lo exige Facebook Login for Business; se concede solo porque la verificación de negocio ya estaba hecha), formulario de tratamiento de datos respondido, y **Configuración creada: `META_LOGIN_CONFIG_ID=4655107931374707`**, cargada en Railway.
   ⚠️ Al configurar, el URI hay que pegarlo en **"URI de redireccionamiento de OAuth válidos"**, no en el **"Validador de URI"** de arriba: el validador es solo una herramienta de prueba y decir "no es válido" ahí es lo normal hasta que el URI está en la lista real.
   ⚠️ Está activo **"Usar modo estricto para URI de redireccionamiento"**: el `redirect_uri` debe coincidir carácter por carácter (sin barra final, sin `www`).

   **Truco de verificación sin navegador** — pedirle el diálogo a Facebook con curl y mirar qué contesta:
   ```bash
   curl -s -L -A 'Mozilla/5.0' -o /tmp/d.html -w '%{http_code}\n' \
     "https://www.facebook.com/v21.0/dialog/oauth?client_id=$APP_ID&redirect_uri=<url-encoded>&response_type=code&state=prueba&config_id=$CONFIG_ID"
   grep -oiE "invalid scopes|no válid|Notoria" /tmp/d.html | sort -u
   ```
   Si sale la pantalla de login **nombrando la app**, la terna app + config_id + redirect URI es correcta. Si sale "Invalid Scopes" o un error de dominio, está mal antes de que ningún usuario lo toque. Verificado en verde el 2026-08-06.
6. **Campos de Configuración → Básica** (verificados: los tres devuelven 200): privacidad `https://usenotoria.app/privacidad`, condiciones `https://usenotoria.app/terminos`, eliminación de datos `https://usenotoria.app/eliminar-datos` con la opción "URL de instrucciones". Dominios de la app: `usenotoria.app` **y** `api.usenotoria.app`. Ícono: `marca/notoria-teja-verde.png` (1024×1024, variante teja — la marca suelta se adelgaza a tamaño pequeño). ⚠️ Meta rellena Condiciones y Eliminación de datos con `https://www.facebook.com/` por defecto: **el App Review rechaza con esos marcadores puestos**. Correo de contacto: dejar el **Gmail**, no `hola@usenotoria.app` — ese alias reenvía por Cloudflare y el reenvío nunca se verificó; por ahí llega el veredicto del App Review.
7. 🔎 **Menciones de Instagram: SALEN GRATIS con los permisos que ya pedimos** (investigado el 2026-08-06 contra la documentación oficial). Los tres endpoints de menciones — `GET /{ig-user-id}/tags`, `mentioned_media` y `mentioned_comment`, más `POST /{ig-user-id}/mentions` para responder — piden exactamente `instagram_basic` + `instagram_manage_comments` + `pages_read_engagement`, que ya están en la Configuración. **No hay que pedir ni un permiso más ni repetir el App Review.**

   Esto importa porque **el módulo Menciones ya está construido** (§18) y está invisible por no tener ninguna fuente: TikTok exige un proveedor de pago (~US$100/mes). Instagram sería **la primera fuente gratuita** y encendería una sección ya hecha.

   Límites que hay que respetar al redactar el copy:
   - Solo llega lo que **@menciona o etiqueta** a la cuenta. "Fui al restaurante X" sin arroba **no aparece**: no es búsqueda por palabra clave. La búsqueda por hashtag es otra cosa y exige `instagram_manage_insights` + la Feature *Instagram Public Content Access* — otro App Review.
   - Solo contenido **público**, y la cuenta del cliente debe ser **profesional**.
   - `mentioned_comment` devuelve error si el dueño de esa publicación **desactivó los comentarios**.
   - ⚠️ Si el rol del cliente sobre su página se otorgó **vía Business Manager**, Meta exige además `ads_management` o `ads_read`. **No pedirlos**: permisos de anuncios en una herramienta de reputación disparan el escrutinio del App Review. El mismo requisito afecta ya a los comentarios, así que no es un motivo para descartar menciones — si aparece con clientes reales, pedir `ads_read` (el más liviano) en una revisión posterior.

   **Una mención NO es una reseña**: no trae rating ni entra en el promedio. Va al modelo `Mencion`, no a `Resena` — la distinción de §15-bis se mantiene.

   ✅ **IMPLEMENTADO el 2026-08-06.** `src/scrapers/instagramMenciones.scraper.js` (endpoint `/{ig-user-id}/tags`), entrada en `FUENTES` de `lib/menciones.js` y en `procesarMenciones`. 23 pruebas en `scripts/prueba-instagram-menciones.js`.

   ⚠️ **Con esto la sección Menciones DEJA DE ESTAR OCULTA.** `hayFuenteDisponible()` mira `META_APP_ID/SECRET`, que ya están en Railway, así que la sección aparece para los planes NEGOCIO y FRANQUICIA. Es lo correcto —ahora sí se puede entregar— pero cambia lo que ve el cliente sin que nadie toque nada más.

   Diferencias con TikTok que condicionan el producto y el copy:
   - **TikTok BUSCA** términos por toda la red (requiere proveedor de pago). **Instagram NO busca**: recibe las publicaciones donde etiquetaron a la cuenta. Por eso `construirTerminos` no aplica a Instagram, y el corte por `terminos.length` se movió DENTRO de la rama de TikTok — si cortara el método entero, un negocio sin términos válidos perdería también las menciones de Instagram, que no dependen de ellos.
   - El texto del estado vacío decía *"se buscan cada 4 horas"*, lo cual es falso para Instagram y dejaba al usuario esperando algo que nunca iba a llegar. Ahora explica que solo aparecen las publicaciones que etiquetan o arroban a la cuenta, y que hace falta tenerla conectada.
   - **Métricas: `null` no es `0`.** Instagram omite `like_count` si el autor ocultó los contadores, y no expone vistas ni compartidos. Guardarlos como 0 haría que el panel ordenara esas menciones al final, como si nadie las hubiera visto. La prueba lo cubre.
8. ⚠️ **Límite estructural del sabor Facebook Login, y a quién deja fuera.** Una cuenta profesional de Instagram **NO necesita** página de Facebook (ese paso se salta al crearla), pero este sabor **sí la exige**, y exige además que el dueño tenga cuenta de Facebook con rol en esa página. Un negocio que abrió Instagram con su número de celular y no usa Facebook **no puede conectarse**. Son dos casos muy distintos: el que *tiene* Facebook sin vincular lo arregla en dos minutos (el panel ya le explica cómo), y el que *no tiene* Facebook tendría que crear cuenta y página.

   La salida, si algún día pesa: **añadir el sabor Instagram Login como segunda opción**, que autentica contra Instagram sin Facebook de por medio y también da comentarios y menciones. Es **aditivo** — no rompe lo construido — pero cuesta un segundo App Review, un flag en `Negocio` para saber con qué sabor se conectó cada cuenta, y llamar a `graph.instagram.com` en vez de `graph.facebook.com`. Su límite documentado: *"cannot access ads or tagging"*, o sea que pierde `/tags` (etiquetas en fotos) pero **conserva las @menciones**. **No cambiar ahora**: Facebook Login ya está configurado y probado, y es lo que Meta recomienda para herramientas que gestionan cuentas de clientes.

9-bis. **El fallo de conexión de Instagram es un MODAL, no un recuadro en la pestaña de Ajustes (2026-08-06).** Primero se resolvió como aviso dentro de `tab === 'config'`, y funcionaba, pero obligaba al usuario a estar mirando esa pestaña. Es el resultado de una acción que acaba de hacer y que **se arregla fuera de Notoria** (en Instagram y en Facebook), así que tiene que interrumpir y quedarse hasta que lo cierre. Vive a nivel de página, junto a `modalBienvenida`, y sigue el mismo patrón de la casa: overlay `rgba(0,0,0,0.6)` con `zIndex:60`, cierre por clic en el overlay (con `stopPropagation` en la tarjeta), aspa y botón. Lleva además un enlace directo a **Conexiones**, porque el último de los cuatro pasos es "vuelve y pulsa Conectar otra vez" y ese botón vive allí — sin el enlace habría que ir a buscarlo justo después de arreglar lo de Instagram.
   **El éxito sigue siendo un aviso en línea**, no un modal: es buena noticia y no requiere ninguna acción, así que bloquear la pantalla sería fricción gratis. Mismo criterio que Google Business y TikTok.

9. 🔴 **Regla que salió de aquí: un redirect de OAuth que aterriza donde nadie lee sus parámetros es un fallo invisible.** El callback de Instagram devolvía `ig_error=sin_cuenta_business`, pero el frontend no leía ese parámetro **en ninguna parte** (solo existía el equivalente `tt_error` de TikTok, y en otra pantalla). El usuario autorizaba, volvía y no veía nada: se lee como "la app está rota". Había dos capas más de silencio detrás — el error del `catch` volvía a `/dashboard` porque `negocioId` se decodificaba *dentro* del `try`, y el `tab=config` del redirect no servía de nada porque `tab` nunca se leyó de la URL. Arreglado el 2026-08-06 (`c331e7c`): el `state` se decodifica antes del `try`, todos los desenlaces vuelven a la ficha del negocio con `volverA()`, y el efecto de la ficha fuerza la pestaña y limpia la URL. **Al cablear otra red social, comprobar los tres puntos: ¿el parámetro se lee?, ¿aterriza donde se lee?, ¿la pestaña correcta está visible?**
5. Lección aprendida hoy: la URL del callback NO va en "Administrador de dominios" (eso es para contenido compartido); el error "dominio no incluido" se arregla con el campo **Dominios de la app** de Configuración Básica + el redirect URI en el producto de login.
6. **Formulario App Review**: ✅ **todo el paquete está en `docs/app-review-meta.md` (2026-08-14)** — permisos con su justificación en inglés listos para pegar, instrucciones de prueba, guion del screencast toma por toma, limitaciones conocidas y checklist previo al envío. Antes vivía solo en la conversación del 2026-08-03, que es tanto como no tenerlo. ✅ **Cuenta de prueba del revisor creada y verificada contra producción**: `revisormeta@usenotoria.app` / `NotoriaMeta2026`, plan NEGOCIO, email pre-verificado (`scripts/cuenta-revisor.js`). ⚠️ Ojo al plan, es al revés que en Culqi: aquí NEGOCIO (las funciones de Instagram están limitadas por plan), allí GRATIS (para que el revisor pudiera comprar). **Decisión cerrada el 2026-08-14: se envía con los 5 permisos actuales**, sin `business_management` ni `ads_read` — Meta exige demostrar cada permiso en el video y esos dos no se pueden enseñar sin un cliente con portfolio. Falta solo la cuenta demo limpia y el screencast.

### 19-bis. `me/accounts` devuelve VACÍO si la página está en un portfolio comercial (2026-08-06)

**Síntoma:** el usuario otorga todo correctamente —página, cuenta de Instagram y los cinco permisos— Facebook dice *"Pri Ad se conectó a Notoria"*, y el callback recibe **0 páginas**.

**Cómo se diagnosticó, que es la parte reutilizable.** El log del camino de fallo (añadido ese día) imprime quién es `me` y qué permisos trae el token:

```
Sin cuenta utilizable: 0 página(s) autorizada(s) | me = Pri Ad [1221156683...]
  | permisos concedidos: pages_show_list, instagram_basic, instagram_manage_comments,
    pages_manage_metadata, pages_read_engagement, public_profile
```

Eso descartó de un plumazo **dos hipótesis** que sin el log habrían costado horas: no era un token de *system user* (`me` es una persona) ni faltaba ningún permiso (están los cinco). **Regla: ante un fallo de OAuth, lo primero es imprimir la identidad del token y sus scopes; sin eso se depura por eliminación y contra la interfaz de otro.**

**La causa:** `/me/accounts` lista las páginas que la persona administra **a título personal**. Si la página pertenece a un **portfolio comercial**, el rol del usuario es "a través del portfolio" y esa página **no aparece** salvo que la app tenga `business_management`. En este caso la página se había creado dentro del portfolio Notoria sola, porque la cuenta del usuario lo administra.

**Salida inmediata (sin código), CON UNA TRAMPA:** la idea es sacar la página del portfolio (*Configuración del portfolio → Cuentas → Páginas → Eliminar*) para que el rol vuelva a ser personal. **Pero Meta lo impide en bucle** (comprobado el 2026-08-06): quitar la página exige antes *"desconectar tu página de Facebook de tu perfil de Instagram"* — es decir, romper el vínculo que hace falta para que todo esto funcione — y quitar la cuenta de Instagram exige exactamente lo mismo. Página e Instagram se protegen mutuamente dentro del portfolio.

Desenredarlo exige cuatro pasos encadenados (romper vínculo → sacar página → sacar cuenta → volver a vincular) y es probable que al re-vincular la página vuelva a caer en el portfolio, porque la cuenta de Instagram **también** es activo del portfolio. **No merece la pena:** para pruebas y screencast, crear cuenta de Instagram y página NUEVAS, desde el perfil personal y sin añadirlas nunca al portfolio.

⚠️ **DECISIÓN PENDIENTE Y CON FECHA LÍMITE: hay que tomarla ANTES de enviar el App Review.** Un cliente con su página dentro de un portfolio comercial —cualquiera que haya verificado algo o corrido anuncios alguna vez, o que trabaje con agencia— **no puede conectarse** por esta vía. Para atenderlos harían falta `business_management` (listar la página) y probablemente `ads_read` (§19.7: la documentación lo exige cuando el rol sobre la página viene de Business Manager). Son permisos pesados en una herramienta de reputación. Añadirlos DESPUÉS de la revisión cuesta otra revisión entera — la misma lección que `pages_manage_metadata`.

✅ **RESUELTA el 2026-08-14: se envía con los 5 permisos actuales.** El argumento que decidió: **Meta exige demostrar cada permiso en el screencast**, y `business_management`/`ads_read` no se pueden enseñar funcionando sin un cliente que tenga la página en un portfolio — pedir un permiso que el video no justifica es motivo de rechazo de la revisión entera, no solo de ese permiso. Se trata como limitación conocida y se resuelve en una segunda pasada **junto con** la decisión del sabor *Instagram Login*, porque ambas atacan el mismo problema —clientes que hoy no podemos atender— y merecen un diseño conjunto. **Es la SEGUNDA evidencia real del mismo problema en un día**: la primera fue el negocio sin cuenta de Facebook (§19.8). Cuando el App Review esté aprobado, revisar si *Instagram Login* debe pasar de alternativa a camino principal. Ver también §19.7, que es de la misma familia (rol vía Business Manager ⇒ Meta pide `ads_management`/`ads_read`).

### 19-quater. El «Centro de cuentas» NO es vincular Instagram a una página (2026-08-14)

**Cómo salió.** Al retomar el App Review, la pregunta del usuario fue la
correcta: *"pero antes no funcionó con la cuenta nueva, ¿por qué funcionaría
ahora?"*. Al reconstruir qué se había hecho exactamente apareció que la segunda
cuenta de Instagram (creada con un Hotmail desde el móvil, en modo negocio) se
había enlazado **por el Centro de cuentas del perfil de Facebook**.

**Eso no sirve, y no es el problema del portfolio.** Son dos fallos distintos que
producen el mismo síntoma (0 páginas utilizables). La cadena que exige la API,
confirmada en la documentación oficial de *Instagram API with Facebook Login*:

```
cuenta de Instagram profesional
   └─ vinculada a una PÁGINA de Facebook
        └─ la página expone `instagram_business_account`
             └─ y el usuario debe tener tareas/rol sobre esa página
```

El **Centro de cuentas** une tu Instagram con tu **perfil personal** de Facebook
(inicio de sesión compartido, publicación cruzada). La documentación de este
flujo **ni lo menciona**. Un Instagram enlazado solo por ahí no aparece en
ninguna página, así que `me/accounts` no tiene de dónde sacarlo.

⚠️ **Meta empuja el Centro de cuentas por todas partes**, así que el cliente cree
que ya lo hizo. Es un falso positivo de manual: la persona está *segura* de haber
vinculado, y por eso ni lee la lista de pasos. Por eso el aviso se añadió como
**primer punto** de `igPasos` (ES y EN) en `dashboard/negocios/[id]/page.js`, no
en medio: quien cree que ya está hecho abandona antes de llegar al punto 3.

**Al diagnosticar un fallo de conexión, distinguir SIEMPRE los tres casos**, que
se parecen mucho y se arreglan distinto:

| Caso | Síntoma | Arreglo |
|---|---|---|
| Enlazado solo por Centro de cuentas | 0 páginas | Vincular a una página de verdad |
| Página dentro de un portfolio comercial | 0 páginas | §19-bis — hoy no tiene salida sin `business_management` |
| Permiso viejo reutilizado | 0 páginas | "Editar configuración" en vez de "Continuar" |

### 19-quinquies. CONFIRMADO: era el portfolio, y el webhook estaba en la app equivocada (2026-08-14)

Dos hallazgos de la misma sesión. El primero cierra §19-bis; el segundo destapa
que §20 nunca estuvo realmente verificado.

#### 1. El portfolio era la causa — confirmado con `business_management`

Se aprovechó algo que estaba delante desde el principio: **con acceso estándar,
un permiso solo lo conceden quienes tienen ROL en la app** (§19-ter), y la dueña
es administradora. O sea que `business_management` se podía añadir a la
Configuración y **probar sin App Review**. Se hizo, y la conexión pasó a la
primera:

```
me = Notoria [1211927292012805]           ← la página, ahora sí visible
IG = notoriaapp [17841443218774198]       ← cuenta conectada
```

Antes, con los mismos 5 permisos concedidos y la página seleccionada en la
pantalla de consentimiento, `me/accounts` devolvía **0**. Hipótesis cerrada: no
era el Centro de cuentas (§19-quater, que era una anomalía real pero de otro
cliente), no era la configuración, no era la vinculación. **Era el portfolio.**

🚩 **DESENLACE (2026-08-15): la revisión se envió con 5 permisos, no con 6.** No
por cambiar de idea: el botón *Request advanced access* de `business_management`
seguía **deshabilitado** al enviar, con el contador en `Ready to use (0)`. Meta
no deja pedir acceso avanzado a un permiso sin llamadas registradas y avisa de
que el botón tarda **hasta 24 h** tras la primera; la llamada se hizo a las 21:33
del día anterior y cuatro horas después el contador seguía en cero. Queda para
una **segunda solicitud**, que solo se puede enviar cuando esta se resuelva.
Detalle y la respuesta preparada por si Meta pregunta: `docs/app-review-meta.md`.

✅ **Y esto reabrió la decisión del App Review, que se tomó DOS veces el mismo
día.** Por la mañana se cerró en 5 permisos porque *"`business_management` no se
puede demostrar en el vídeo sin un cliente con portfolio"*. Por la noche resultó
que **ese cliente es la propia dueña**. Decisión final: **6 permisos, con
`business_management` y sin `ads_read`** — este último se descarta con evidencia,
no por prudencia: la conexión se completó sin él, así que §19.7 no aplica a
nuestro flujo. Detalle en `docs/app-review-meta.md` §2.

✅ **Con eso, la "cuenta demo limpia" de §19-ter queda SIN OBJETO.** El screencast
se graba con la cuenta de la dueña, su página *Notoria* y `@notoriaapp`. No hay
que crear ningún Instagram ni ninguna página nueva, ni pelearse con el portfolio.

**Truco reutilizable:** para decidir entre hipótesis sobre permisos, añadir el
permiso a la Configuración y probar con la cuenta que tiene rol en la app. Es
gratis, reversible y no gasta una revisión.

#### 2. 🔴 El webhook estaba cableado a la app equivocada

`GET /{app-id}/subscriptions` con el app token devolvía **`data: []`**: la app
`2232447584255257`, la que usa el backend, **no tenía ninguna suscripción de
webhook**. Lo del 2026-08-06 se configuró desde *Instagram → Configuración de la
API*, que pertenece a la app de Instagram `1305555994987658` — el sabor
*Instagram Login*, que no es el nuestro.

Eso explica retroactivamente §20.10: la firma llegaba con el secreto de la app de
Instagram porque **era esa app la que enviaba**. En su momento se resolvió
aceptando los dos secretos, que funcionó, pero tapó la causa.

Y explica el error del campo: `POST /me/subscribed_apps?subscribed_fields=comments`
respondía *"must be one of {feed, mention, …}"* porque Meta validaba contra los
campos del objeto **Página**.

✅ **Corregido en la consola:** app `2232447584255257` → Webhooks → objeto
**instagram** → `comments`, callback `https://api.usenotoria.app/api/webhooks/instagram`.
Verificado por API y por log:

```
objeto "instagram" | callback: …/api/webhooks/instagram | activo: true | campos: comments(v26.0)
[Webhook IG] Verificación superada.
```

⚠️ **`suscribirWebhookInstagram()` no funciona por ningún camino.** Probados los
cuatro con el token de página real, después de arreglar la suscripción de app:

| Llamada | Respuesta |
|---|---|
| `graph.facebook.com/{ig-user-id}/subscribed_apps` + `comments` (v21 y v26) | `(#3) Application does not have the capability` |
| `graph.facebook.com/{ig-user-id}/subscribed_apps` sin campos | `(#100) subscribed_fields is required` |
| `graph.facebook.com/me/subscribed_apps` + `comments` (v21 y v26) | `comments` no es campo del objeto Página |

El nodo `{ig-user-id}/subscribed_apps` **es del sabor Instagram Login**, contra
`graph.instagram.com`. La documentación de Meta mezcla los dos sabores en la
misma página y de ahí salió la llamada que nunca pudo funcionar.

🔴 **No se puede zanjar hasta que aprueben el App Review, y §20 ya lo decía.** Se
intentó comprobarlo con un comentario real y no llegó ningún evento — pero eso
**no prueba nada** sobre `suscribirWebhookInstagram()`, porque Meta exige
*Advanced Access* para entregar el campo `comments` y hoy está en estándar. Con
el webhook correctamente suscrito y verificado, un comentario real sigue sin
generar evento, y es el comportamiento esperado. **Al aprobar la revisión:
comprobar si los eventos llegan sin la llamada por cuenta; si llegan, borrarla
del callback** (hoy solo escupe un warning en cada conexión).

⚠️ **La lección de §20 se queda corta y hay que ampliarla.** No basta con
desconfiar del cartel del panel: el botón *Probar* de Meta demuestra únicamente
que nuestro endpoint parsea el evento de muestra. **No demuestra que exista el
camino de entrega real.** Eso solo lo prueba `GET /{app-id}/subscriptions` y un
evento de verdad.

#### 3. Lo que la API de comentarios de Instagram SÍ y NO da (probado, 2026-08-14)

Probado contra un comentario real con el token de producción, para no volver a
teorizar:

| Campo | Resultado |
|---|---|
| `id,text,username,timestamp` | ✅ 200 |
| `like_count` | ✅ 200 — devolvió `0`. **Los likes SÍ se pueden leer** |
| `from` | ✅ 200 — `{id, username}` y nada más |
| `from{…,profile_picture_url}` | ❌ `(#100) Tried accessing nonexisting field` |
| `user` | ✅ 200 pero **vacío** |

🔴 **La foto de quien comenta NO existe en la API.** No es una carencia nuestra y
no se arregla con permisos. La única vía sería `business_discovery`, que exige que
el comentarista tenga cuenta **profesional** —la mayoría de la gente no la
tiene— y costaría una llamada por cada uno. Por eso la tarjeta pinta un círculo
con la inicial, igual que las reseñas. **Si alguien vuelve a pedir la foto, la
respuesta es esta tabla.**

🟢 **Los likes sí se pueden mostrar, y falta poco.** `tiktokBusiness.scraper.js`
**ya los lee** (`likes: c.likes ?? 0`) y se tiran porque `ComentarioSocial` no
tiene columna. Encenderlo son cuatro cambios chicos —pedir `like_count` en
Instagram, columna `likes`, mapearla en el worker, pintarla— pero **exige migrar
la base de producción**, así que va después de cerrar el App Review.

### 19-ter. Modo Activo ≠ permisos abiertos, y por dónde seguir (cierre 2026-08-06/07)

**La confusión que hay que tener clara** (se preguntó literalmente: *"si mi app ya está activa, ¿por qué esperamos revisión?"*). Son dos cosas independientes:

| | Qué controla | Estado |
|---|---|---|
| **Modo de la app** (Desarrollo / Activo) | Si la app existe para el mundo | ✅ Activo |
| **Nivel de acceso de cada permiso** (Estándar / Avanzado) | **Quién** puede concederlo | ⏳ Estándar en los de Instagram |

Con acceso **estándar**, un permiso solo lo puede conceder alguien con **rol en la app** (administrador, desarrollador o tester). Por eso todo funciona para el dueño y fallará para el primer cliente real. Se comprueba en *Revisión de la app → Permisos y funciones*. Corolario práctico: **las pruebas hay que hacerlas siempre con la cuenta de Facebook que tiene rol en la app** — una cuenta nueva no serviría, tendría que invitarse como tester primero.

**Estado real al cierre:**
- ✅ Webhook completo, desplegado y verificado extremo a extremo en producción (§20), con la paginación de comentarios (§20-bis) y el doble secreto de firma (§20.10).
- ✅ Los cinco permisos se conceden correctamente: el log lo confirma con el token del usuario.
- 🔴 La cuenta del dueño **no puede conectarse** por el bucle del portfolio (§19-bis). No es un fallo del producto ni de la configuración.

**Plan acordado para retomar — cuenta demo limpia (~15 min).** Lo que NO cambia: la cuenta de Facebook (tiene el rol en la app) y el portfolio (verificado, con la app dentro; no se toca). Lo que sí es nuevo: **cuenta de Instagram profesional nueva** —`@notoriaapp` y `@priad111` ya son activos del portfolio y repetirían el bucle— y **página nueva creada desde el perfil personal**, sin añadirla a ningún portfolio. La vinculación, desde la página (*Configuración → Cuentas vinculadas → Instagram*).

🔍 **Checkpoint que ahorra otra noche:** antes de pulsar Conectar, mirar *portfolio → Cuentas → Páginas*. Si la página nueva aparece ahí, **parar**: significa que volvió a caer dentro y hay que replantear en vez de seguir adelante.

### 20. Webhook de comentarios de Instagram (2026-08-06)

**Qué resuelve.** El escaneo lee una **ventana**: las 25 últimas publicaciones, cada 4 horas. Un comentario en una foto más antigua no se ve **nunca**, y ese es justo el sitio donde puede vivir una crisis: una publicación viral de hace meses con una queja nueva. El webhook avisa de **cualquier** publicación, sin ventana, en segundos.

**No sustituye al barrido, convive con él.** Los webhooks solo notifican desde que se configuran: al conectar una cuenta nueva, todo el histórico sigue llegando por el escaneo. Borrar el escaneo dejaría a cada cliente nuevo con la bandeja vacía hasta que alguien comentara.

**Piezas:**

| Archivo | Qué hace |
|---------|----------|
| `src/lib/webhookMeta.js` | Lo puro y probable sin Express: `firmaValida` (HMAC-SHA256), `verificacion` (handshake) y `comentariosDelEvento` (normaliza el evento a la forma del scraper) |
| `src/api/routes/webhooks.routes.js` | `GET/POST /api/webhooks/instagram`. Valida, contesta 200 y procesa después |
| `src/scrapers/instagram.scraper.js` | `suscribirWebhookInstagram` / `desuscribirWebhookInstagram` / `obtenerCaptionPublicacion` |
| `src/workers/monitoreo.worker.js` | `guardarComentarioSocial()` — extraído del bucle del escaneo y **exportado**, para que webhook y barrido guarden por el MISMO camino |
| `scripts/prueba-instagram-webhook.js` | 33 pruebas con axios, Prisma y el notificador interceptados. Verde el 2026-08-06 |

**Decisiones que no son obvias:**

1. 🔴 **El cuerpo se valida CRUDO, y por eso el router va montado ANTES de `express.json()`.** Meta firma los bytes exactos: si se parsea y se vuelve a serializar para calcular el HMAC, cualquier diferencia de orden de claves, espaciado o escape de unicode cambia el hash y **todo evento legítimo se rechazaría**. La ruta usa `express.raw()` propio.
2. **Se contesta 200 ANTES de procesar.** Meta espera respuesta rápida; si tarda, reintenta el mismo evento y tras varios fallos **desactiva la suscripción**. Guardar un comentario puede mandar correo y WhatsApp — demasiado para dejarlo esperando. El procesamiento va en un `.catch()` suelto.
3. **El eco propio se descarta.** Meta también notifica los comentarios y respuestas que publica la **propia cuenta**, incluidas las que Notoria acaba de enviar desde el panel. Sin ese filtro (`value.from.id === entry.id`) nuestras respuestas entrarían en la bandeja como si fueran de un cliente, y una disculpa bien escrita clasificaría como **negativa** y dispararía una alerta por nuestro propio mensaje.
4. **La ruta está exenta del rate-limit** (`skip` en `index.js`). Los eventos llegan a ráfagas desde las mismas IPs de Meta: el cupo de 100/15min se agotaría solo, y un 429 no es inofensivo — Meta reintenta y luego desactiva la suscripción. **El filtro real de esta ruta es la firma HMAC, no el rate-limit.**
5. **El evento se normaliza a la forma del scraper**, no a la de la tabla. Así pasa por el mismo `aFila` de `FUENTES_COMENTARIOS`, y la prueba 23 vigila ese contrato: si alguien renombra un campo del scraper, el webhook se entera.
6. **La suscripción es POR CUENTA, no de la app.** Activar el webhook en la consola no basta: hay que llamar a `POST /me/subscribed_apps?subscribed_fields=comments` **una vez por cada cliente** que conecta su Instagram. Se hace dentro del callback de OAuth, que es el único punto donde existe el token de página recién emitido. Con un token de PÁGINA, `me` **es** la página — por eso no hizo falta guardar el id de la página en la base ni migrar nada.
7. **Un fallo de suscripción no aborta la conexión.** Se registra un `warn` y el negocio queda conectado: sin webhook los comentarios siguen llegando por el escaneo, con retraso. Conectar a medias es mejor que no conectar.
8. **Al desconectar se desuscribe**, y solo si ningún otro negocio del usuario usa esa misma cuenta (mismo cuidado que con los tokens de TikTok: la suscripción es de la página, no del negocio). Sin esto seguiríamos recibiendo datos personales de alguien que **retiró su consentimiento** — que es exactamente lo que mira un revisor de permisos.
9. **El caption se pide aparte.** El evento trae el id de la publicación pero no su texto, y el panel lo muestra como contexto. `obtenerCaptionPublicacion` lo trae; si falla, el comentario se guarda igual sin título: perder el título es molesto, perder el comentario sería grave.

10. 🔴 **Hay DOS secretos y el webhook acepta los dos (2026-08-06).** La pantalla donde se configura el webhook —*Instagram → Configuración de la API…*— muestra su **propio identificador de app de Instagram (`1305555994987658`) y su propia clave secreta**, distintos de `META_APP_ID`/`META_APP_SECRET` de la app de Facebook. La documentación de cada sabor manda validar `X-Hub-Signature-256` con el suyo, y desde fuera no hay forma de saber cuál usará Meta para un evento concreto.

    Validar solo con el de Facebook era arriesgar el peor fallo posible aquí: **cada evento legítimo rechazado con 403**, Meta dejando de reintentar y **desactivando la suscripción**, con el panel de Meta mostrando todo en verde. Por eso `firmaValida` prueba `META_APP_SECRET` y `META_IG_APP_SECRET` y acepta si coincide con cualquiera; no debilita nada, siguen siendo dos secretos que solo Meta y nosotros conocemos. El `warn` del 403 dice cuáles había configurados, para no diagnosticar a ciegas.

10-bis. 🔴🔴 **CONFIRMADO EN VIVO (2026-08-06, 20:59): Meta firma estos eventos con el secreto de la app de INSTAGRAM.** Con el botón *Probar* de la fila `comments` se mandó una muestra real al endpoint en producción. El log de Railway devolvió `[Webhook IG] Firma inválida — evento descartado.` — o sea que la sospecha del punto 10 no era teórica: **con solo `META_APP_SECRET` cargado, todos los comentarios reales se habrían descartado en silencio.** Se cargó `META_IG_APP_SECRET` en Railway y se desplegó el arreglo.

   ⚠️⚠️ **Y el aviso más peligroso de todo esto: Meta mostró "Se probó correctamente el campo del webhook comments v26.0" MIENTRAS nuestro servidor devolvía 403.** Ese cartel verde solo dice que Meta **envió** la muestra, no que el servidor la aceptara. **Nunca dar por buena una integración de webhooks por el mensaje de la consola: la verdad está en los logs del servidor.** Es exactamente la misma familia de error que el truco 401/404 de las rutas.

   ✅ **Cerrado el 2026-08-06:** cargado `META_IG_APP_SECRET` y desplegado el arreglo, la misma prueba devolvió `[Webhook IG] Evento de una cuenta sin negocio: 0`. O sea: firma validada, cuerpo parseado, objeto y campo reconocidos, filtro de eco pasado y búsqueda del negocio hecha — la muestra de Meta trae `entry.id = "0"`, que no es ninguna cuenta real, así que muere ahí. **Lo único que esa muestra no ejercita es el último tramo** (guardar, clasificar y alertar), porque no hay negocio al que asociarla; eso lo cubren las 38 pruebas locales. Para ejercitarlo con datos reales hace falta un comentario **desde otra cuenta**: los de la cuenta propia se descartan como eco.

   💡 **Cómo se lee el resultado de una prueba** (`railway logs --service api | grep Webhook`):
   - `Evento de una cuenta sin negocio: <id>` → **bien**: la firma validó y el evento entró. El id de ejemplo de Meta no corresponde a ningún negocio, por eso muere ahí.
   - `Firma inválida — evento descartado. Secretos probados: ...` → falta el secreto que indique el propio mensaje.
   - **Nada en el log** → no llegó: mirar URL, suscripción del campo o modo de la app.

11. **Dónde está el webhook en la consola, porque no es donde uno busca.** No está en *Inicio de sesión con Facebook → Configurar* (eso es OAuth: redirect URIs, deauthorize callback, eliminación de datos). Está en **Instagram → Configuración de la API…**, paso **2. Configurar webhooks**. ⚠️ Esa misma página tiene un paso **3. Configurar el inicio de sesión de empresa de Instagram**: **no tocarlo**, es el sabor Instagram Login (§19.4). Se entra ahí solo por la parte de webhooks.

    ⚠️ **Los campos vienen suscritos de fábrica de más**: `live_comments`, `messages`, `message_edit`, `message_reactions`, `messaging_postbacks`, `messaging_referral` y `messaging_seen`. Hay que dejar **solo `comments`**. El código ignora el resto, así que no rompen nada, pero son webhooks de **mensajería privada** en una app que no pide ningún permiso de mensajería — exactamente el detalle que un revisor pregunta.

**Dos bloqueos que NO son código:**

- ⚠️ **`pages_manage_metadata`.** Es el permiso que permite suscribir la página. No estaba en los 4 que se pidieron. Ya está en el `scope` de respaldo de `redes.routes.js`, pero **cuando se usa `config_id` manda la Configuración de la consola**: si el permiso no está también ahí, el token no lo trae y la suscripción falla en silencio (la conexión funciona, los webhooks no llegan nunca). **Añadirlo a la Configuración y al App Review ANTES de enviar la revisión** — después cuesta una revisión entera aparte.
- ⚠️ **Acceso avanzado.** La documentación es explícita: *"Advanced Access is required to receive `comments` and `live_comments` webhook notifications"* y *"Apps must be set to Live"*. Lo segundo ya está (§19.1-bis); lo primero llega con el App Review. O sea que **el webhook se puede configurar y verificar hoy, pero no llegará ningún evento hasta que aprueben la revisión**. No es un bug: si tras la aprobación no llega nada, mirar primero `pages_manage_metadata` y la suscripción de la página, no el código.

### 20-bis. Publicaciones con muchos comentarios: paginación (2026-08-06)

El techo de 30 comentarios por publicación se cambió por **paginación con dos topes**. Las constantes viven en `instagram.scraper.js`:

| Constante | Valor | Qué es |
|-----------|-------|--------|
| `LIMITE_PUBLICACIONES` | 25 | Publicaciones que se leen. **No cambia** |
| `LIMITE_COMENTARIOS` | 50 | Comentarios por **página**, ya no por publicación: el tamaño del bocado |
| `MAX_COMENTARIOS_POR_PUBLICACION` | 300 | Techo real por publicación |
| `MAX_PETICIONES_EXTRA` | 40 | Presupuesto de peticiones extra por escaneo, **compartido** entre las 25 publicaciones |

**Por qué importaba más de lo que parece.** Meta **no documenta el orden** en que devuelve los comentarios de una publicación, y lo que se observa es el más antiguo primero. Si eso es así, quedarse con la primera página no era "leer 30 de 200": era leer **los 30 más viejos** y no ver nunca los nuevos. Justo al revés de lo que hace falta. Por eso el corte por número se sustituyó por paginar hasta agotar, y la paginación es la que arregla el caso "esta publicación recibió más comentarios de lo normal".

**Cómo se comporta:**
- Solo se pagina la publicación cuya **primera página vino llena**. Las tranquilas —la mayoría— no cuestan ni una petición extra (hay prueba de eso).
- El corte se decide con el **cursor `after` y con el tamaño de la página**: página incompleta = no hay más. ⚠️ Esta arista **no devuelve `paging.next` de forma fiable**, solo los cursores; un `while (data.paging.next)` habría cortado en la primera vuelta.
- El presupuesto de peticiones es **global al escaneo, no por publicación**: la cuota de la Graph API es por app y por hora, y la comparten todos los clientes. 25 publicaciones virales a la vez podrían disparar 150 peticiones en un ciclo.
- **Nada de esto aborta el escaneo.** Un fallo paginando conserva los comentarios ya leídos de esa publicación y sigue con las demás.
- Lo que quede por encima de los topes **llega por el webhook**, que no tiene ventana. Los dos mecanismos se cubren mutuamente: el webhook cubre lo que la ventana no alcanza, y el escaneo cubre lo anterior a configurar el webhook.

Cubierto por 12 pruebas nuevas en `scripts/prueba-instagram-comentarios.js` (37 en total): paginación completa, parada en página incompleta, publicación tranquila sin coste, techo por publicación, presupuesto global y fallo a mitad de paginación.

**Para dejarlo activo (pasos en la consola, del usuario):**
1. Elegir una cadena al azar (`openssl rand -hex 16`) y ponerla en Railway como `META_WEBHOOK_VERIFY_TOKEN`. Desplegar **antes** de continuar: el handshake se hace contra el servidor vivo.
2. Meta → la app → **Webhooks** → objeto **Instagram** → *URL de devolución de llamada* `https://api.usenotoria.app/api/webhooks/instagram`, *Token de verificación* la misma cadena → Verificar y guardar.
3. Suscribirse al campo **`comments`** (los demás — `messages`, `story_insights`, `live_comments` — no se usan; suscribirlos solo traería eventos que nadie lee).
4. Añadir `pages_manage_metadata` a la Configuración de Facebook Login for Business y a la lista del App Review.
5. Reconectar Instagram desde el panel una vez (las cuentas conectadas ANTES de este cambio no tienen la página suscrita: la suscripción ocurre en el callback de OAuth).

### Cierre de la sesión (2026-08-03 noche) — pulido SEO, todo desplegado y verificado

- **OG image en PNG**: `public/og-image.png` (1200×630, generado con sharp desde el SVG — WhatsApp/Facebook no renderizan `og:image` en SVG). `layout.js` apunta al PNG. Regenerar si cambia el SVG: `node -e "require('sharp')('public/og-image.svg',{density:150}).resize(1200,630).png().toFile('public/og-image.png')"`.
- **JSON-LD en `layout.js`**: `SoftwareApplication` (3 planes en PEN) + `FAQPage` (10 preguntas). ⚠️ El texto del FAQ está DUPLICADO respecto a `page.js` (TEXTOS vive en un client component) — al editar una FAQ, actualizar ambos.
- **Facebook Reviews RETIRADO de todas las páginas públicas** (comparativa, tarjetas del landing, dashboard/planes, ES+EN). Verificación hecha en código: `facebook.scraper.js` y su rama del worker existen, pero **no hay ninguna ruta para conectar una página de FB** — `facebookPageId/AccessToken` jamás se llenan, la función era inalcanzable. El scraper y el worker quedan intactos; si algún día se construye el flujo de conexión (los permisos `pages_*` del App Review son el prerequisito), recién ahí se vuelve a anunciar.
- **Monitor de uptime**: `.github/workflows/uptime.yml` — GitHub Actions golpea `/health` y el landing cada 15 min; si no responden 200, GitHub avisa por email al dueño del repo. Para poder pushear workflows hubo que dar el scope `workflow` al token (`gh auth refresh -h github.com -s workflow`) **y borrar la credencial vieja del Credential Manager de Windows** (`cmdkey /delete:git:https://github.com`) porque el helper `manager` del gitconfig de sistema va antes que gh y servía un token sin ese scope.
- **Google Search Console verificado** (archivo `public/googlebab20eafdad21f30.html` — no borrarlo: Google re-verifica periódicamente) y **sitemap enviado**.
- **DMARC activo**: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:padkar4@gmail.com` en Cloudflare, verificado por DNS. Pendiente ~septiembre 2026: si los reportes vienen limpios, subir a `p=quarantine`.
- **Blog SEO en producción**: `/blog` + 5 artículos SSG. Contenido en **`src/lib/blog.js`** como bloques estructurados (p/h2/lista/numerada/destacado, HTML inline propio) — **agregar un artículo = una entrada en ese array**; índice, página `[slug]`, metadata, JSON-LD `BlogPosting` y sitemap lo levantan solos. Temas actuales: responder reseñas negativas, reseñas falsas, eliminar reseña de Google, subir rating, detectar ataques. Cada artículo cierra con CTA al widget del hero o a /registro. Footer → Recursos → Blog (ES/EN).

### Pendientes de código (en orden sugerido)

1. **Desplegar backend** (`railway up`) — el soporte de `config_id` está commiteado sin subir. Nada más del backend está pendiente de deploy.
2. ✅ **Comentarios de Instagram cableados (2026-08-06, `79388d8`).** El scraper estaba escrito desde julio pero **no lo llamaba nadie**: `FUENTES_COMENTARIOS` solo tenía TikTok, así que conectar la cuenta funcionaba y no traía ni un comentario. Responder y borrar la respuesta también estaban cortados a TikTok con un `if (plataforma !== 'TIKTOK')`. Ahora está el circuito entero: lectura en el worker, respuesta y borrado de la respuesta propia.
   - **Cada red comprueba lo suyo DENTRO de su rama.** TikTok exige el id del video y una conexión de tipo Accounts API; Instagram no necesita ninguna de las dos. Antes esas comprobaciones eran comunes, así que una respuesta de Instagram habría recibido un *"reconecta TikTok"* — un error que habla de otra red.
   - **`moderacionRemota` en las fuentes.** TikTok informa el estado de ocultado/fijado tal como está en la plataforma; Instagram no lo lee. Sin esa distinción el escaneo habría pisado esos campos en cada pasada con valores que nunca comprobó. Moderar sigue cortado a TikTok en `comentario.routes.js` (400) y el frontend ya ocultaba esos botones para otras redes.
   - **Moderar en Instagram NO está hecho a propósito**: la Graph API lo permite, pero el scraper no lee ese estado. Al implementarlo hay que añadir la lectura *y* declarar `moderacionRemota`, o el panel y la plataforma se desincronizan.
   - **Ventana de lectura: 25 publicaciones**, explícito en `LIMITE_PUBLICACIONES`. Es decisión nuestra, no de la API. ⚠️ El límite de comentarios antes **no se fijaba**, así que mandaba el valor por defecto de Meta — un techo que no controlábamos y que puede cambiar sin avisar. La sintaxis para acotar un campo anidado es `comments.limit(N){...}`; sin el `.limit(N)` decide Meta. Instagram admite ventana más ancha que TikTok (10) porque aquí los comentarios vienen **anidados en la misma llamada**: 25 publicaciones cuestan una petición, mientras que en TikTok cada video suma la suya. **Desde el 2026-08-06 los comentarios ya NO tienen techo de 30 por publicación: se paginan — ver §20-bis.**
   - ⚠️ **Sigue siendo una ventana.** Un comentario en una publicación más antigua que las 25 últimas no se ve, y ese es justo el sitio donde puede vivir una crisis (una foto viral de hace meses con una queja nueva). **El arreglo de fondo son los webhooks de Instagram** (campo `comments`): avisan de cualquier publicación, sin ventana. ✅ **IMPLEMENTADOS el 2026-08-06 — ver §20.** Los webhooks solo notifican **desde que se configuran**, así que este barrido sigue haciendo falta para el histórico al conectar una cuenta nueva: conviven, no se sustituyen. Corrección de lo que decía aquí antes: **no usan solo `instagram_manage_comments`**, hace falta además `pages_manage_metadata` para suscribir la página, y no llega ningún evento sin Acceso avanzado (§20).
   - `scripts/prueba-instagram-comentarios.js` — 25 pruebas con axios interceptado, sin tocar la BD. Cubren el parseo anidado (media → comments), el prefijo `ig_`, la forma de las peticiones, que un error de la API devuelva `null` y no `[]` (el worker lee `[]` como "sin novedades"), y **el contrato entre scraper y worker**: si alguien renombra un campo del scraper, `aFila` deja de mapearlo y el comentario se guardaría a medias sin que nada falle. Por eso `FUENTES_COMENTARIOS` se exporta.
3. **Decisión del usuario pendiente: Facebook Reviews.** El scraper es un "stub funcional" — si no trae datos reales, por la regla §18 hay que sacarlo de la tabla comparativa, las tarjetas del landing y dashboard/planes hasta que funcione. PREGUNTADO, sin respuesta aún.
4. **Blog SEO** (artículos "cómo responder reseñas negativas restaurante", etc.) y **capturas reales del panel** en el landing — aceptados por el usuario, no empezados.

### Scripts útiles añadidos

| Script | Para qué |
|--------|----------|
| `scripts/dar-plan.js <email> <PLAN>` | Cambia el plan de una cuenta a mano, sin pasar por Culqi. No crea `Pago` ni comprobante (la numeración es correlativa y no admite huecos) |
| `scripts/prueba-publico.js` | Endpoint público del widget contra la Places API real (~6 llamadas de cuota). Valida búsqueda, análisis, caché y validación de entrada |
| `scripts/set-culqi-keys.js <pk_test> <sk_test>` | Escribe las llaves de test en `brand-shield/.env` y `brand-shield-web/.env.local` de una vez, sin editar a mano. Rechaza llaves `live` (esas van en Railway/Vercel, no en archivos locales) y detecta si se pasaron al revés |
| `scripts/prueba-culqi.js` | Circuito de cobro completo contra la API real de Culqi con llaves de **test**: token → customer → tarjeta guardada → cargo. Verifica los campos de los que depende el resto del código llamando a `culqi.datosTarjeta()` (el mismo código que corre en producción), más `cargo.id` y `tarjeta.id` y que el monto cobrado sea el de `precios.js`. **Se niega a correr con llaves `sk_live_`** salvo `--vivo` |
| `scripts/reclamaciones.js [todas\|ver <n>\|responder <n>]` | Gestión del Libro de Reclamaciones **desde la terminal** (`railway run --service api node scripts/reclamaciones.js`). Lista por urgencia con los días hábiles restantes, muestra la hoja completa y responde: manda la respuesta al consumidor y marca RESPONDIDO. Se niega a responder dos veces la misma hoja |
| `scripts/limpiar-pagos-prueba.js <email> [--aplicar]` | Deja una cuenta como si nunca hubiera pagado, para repetir la prueba del cobro: borra sus pagos y comprobantes, **retrocede el correlativo de la serie** (es correlativa y no admite huecos), libera las tarjetas que gastaron la promo y devuelve la cuenta a Gratuito. Sin `--aplicar` solo previsualiza. **Se niega a tocar cargos que no sean `chr_test_`**: un cobro real se reembolsa en Culqi y se anula con nota de crédito, no se borra |
| `scripts/prueba-promo.js` | 5 pruebas de la promo de bienvenida con Culqi y Prisma simulados: aplica el descuento, lo bloquea si la tarjeta ya lo usó (409 `PROMO_NO_APLICA` sin cobrar), el reintento con `sinPromo`, y que el plan anual no la consuma. No cobra ni gasta numeración de comprobantes |
| `scripts/prueba-drip.js` | 11 pruebas del drip con Prisma y Resend simulados: variantes por estado, avance de etapa, exclusiones, 1 etapa/día |
| `scripts/prueba-whatsapp-meta.js` | 14 pruebas de `whatsappMeta.js` con axios interceptado, sin gastar credenciales |
| `scripts/prueba-tiktok-comentarios.js` | 12 pruebas del circuito de comentarios de TikTok con axios interceptado: parseo, aislamiento del fallo de `comment.list`, `null` vs `[]`, sentimiento, dedupe y forma del request de respuesta. No llama a TikTok ni toca la BD |
| `scripts/prueba-negocio-publico.js` | 10 pruebas del saneador que impide que los access tokens lleguen al navegador. **Correr siempre que se agregue un campo nuevo al modelo `Negocio`**: la prueba 9 avisa si es un secreto que nadie está quitando |
| `marca/generar-logos.py` | Regenera los PNG del logo a 1024px |

---

## Sesión 2026-08-05 — Culqi operativo y observación de la web subsanada

Culqi observó usenotoria.app ("Flujo de compra | Carrito de comprar | Botón
pagar" + "Falta información legal"). Se cargaron las llaves de prueba, se
arreglaron dos bugs de cobro que solo aparecieron al usarlas y se crearon las
páginas que faltaban. Detalle completo en §2, §2-bis y §2-ter.

**Desplegado y verificado en producción:**
- Backend: Railway `a6882324` SUCCESS · `/health` 200 · `POST /api/reclamaciones`
  responde con la validación esperada.
- Frontend: Vercel `notoria-hnr95wvmx` READY. `/precios`, `/contacto`,
  `/devoluciones` y `/libro-reclamaciones` devuelven **200 por HTTPS** (la
  infografía exige SSL en todas las URLs, no solo el inicio). Los precios se ven
  en el HTML y la llave `pk_test_` viaja en el bundle de `/precios`.
- BD: tabla `reclamaciones` creada con `prisma db push` (cambio puramente
  aditivo, verificado antes con `prisma migrate diff`).
- Git: commit `681fb07` pusheado a `main`.

**Lo que queda pendiente y es del usuario, no del código:**
1. Escribir a culqi.com/soporte, asunto `MI COMERCIO FUE OBSERVADO`.
2. Entregarles credenciales de una **cuenta de prueba** (el flujo de compra pide
   sesión, y la infografía obliga a darlas en ese caso). Crear la cuenta y
   dejarla en plan Gratuito para que puedan recorrer el pago entero.
3. **Rotar a llaves live apenas aprueben** — ver la advertencia de §2 sobre lo
   que implica tener llaves de test en producción.

### Cierre 2026-08-05 (tarde) — promo anunciada y blindada

El usuario notó que el widget de Culqi cobraba S/30 en vez de S/59 y preguntó
por qué. Eran dos cosas: la promo de bienvenida (intencional, pero **no se
anunciaba en ninguna parte** — se enteraba al abrir la ventana de pago) y un
bug de redondeo real (mostraba S/30.00, cobraba S/29.50). Ver §2, "Promo de
bienvenida", para el detalle completo.

Decisión del usuario: **mantener la promo**, anunciarla con un cartel visible
encima de los planes, y limitarla de forma que no se pueda explotar — de ahí el
límite por tarjeta además del límite por cuenta.

Desplegado y verificado: Railway "Deploy complete" + `/health` 200; Vercel
`notoria-g9b7ox51o` READY. En https://usenotoria.app/precios se ve el cartel y
los importes con descuento (S/29.50 y S/89.50). `prueba-promo.js` y
`prueba-culqi.js` en verde. Tabla `promo_tarjetas` creada con `db push`
(aditivo, verificado antes con `migrate diff`). Commits `5effd41` y `49718b4`.

### Feedback del pago (2026-08-05, tras el primer pago real de prueba)

El primer cobro de verdad salió perfecto en la base (S/29.50, Visa 4111,
comprobante `VOUCHER V001-00000001`, promo aplicada y tarjeta quemada) pero el
usuario **no vio nada**: "solo se me actualizó la página y no lo noté".

Tres causas, ninguna del cobro:
1. **No se llamaba a `Culqi.close()`.** El widget de Checkout entrega el token y
   **deja su ventana abierta**: cerrarla es responsabilidad de la app. El cobro
   se procesaba detrás de una ventana que seguía mostrando el formulario, sin
   carga ni confirmación. **Es el fallo importante: si se toca el callback
   `window.culqi`, `Culqi.close()` va primero, antes de cualquier `await`.**
2. El aviso de éxito era una franja arriba de la página; el botón de pagar está
   abajo, en las tarjetas. Quedaba fuera de vista.
3. Redirigía sola a `/dashboard` a los 1,8 s, que se percibe como una recarga.
   En `dashboard/planes` no había **ningún** aviso de éxito.

Ahora el estado del cobro vive en `components/ResultadoPago.js`: superposición a
pantalla completa con tres estados (procesando / aprobado / fallido), inmune al
scroll. La de éxito detalla importe, comprobante, próxima renovación y número de
operación, y **solo se sale pulsando el botón** — sin redirección automática.
Para poder detallarlo, `POST /api/pagos/culqi` devuelve además `monto`, `moneda`,
`promoAplicada` y `comprobante`.

**Lección para el resto del producto:** un aviso en el flujo de pago no puede
depender de dónde esté el scroll ni durar menos de lo que tarda el usuario en
mirar. Desplegado: Railway `ceda499d` SUCCESS, Vercel `notoria-fz01z27vi` READY.

### Bug: el customer de Culqi no se puede crear dos veces (2026-08-05)

Al repetir la prueba de cobro, el pago falló con **"Un cliente está registrado
actualmente con este email"**. Apareció después de limpiar la base, pero **no
era un artefacto de la limpieza**: el `customer` vive en Culqi, no en nuestra
base, así que borrar nuestras filas no lo elimina.

**Era un bug de producción.** `POST /api/pagos/culqi` llamaba a
`culqi.crearCliente()` en cada alta, y Culqi **rechaza un segundo customer con
el mismo correo**. Cualquier cliente real que intentara suscribirse una segunda
vez —tras cancelar y volver, tras un cobro fallido, o al cambiar de plan— se
quedaba sin poder pagar **nunca más**, con un mensaje que además no explica nada.

Arreglado con **`culqi.obtenerOCrearCliente()`**, que es lo que debe usarse al
suscribir: intenta crear y, si falla, busca el customer por correo
(`GET /customers?email=`) y lo reutiliza. El rescate se intenta ante *cualquier*
fallo del create y relanza el error original si no encuentra nada, para no
depender de que Culqi conserve el texto del mensaje ni el nombre del campo.
**`crearCliente` sigue exportada, pero no debe usarse directamente en el alta.**

`prueba-culqi.js` da de alta dos veces con el mismo correo y exige el mismo
customer — el script no cubría este camino y por eso el bug llegó hasta acá.

**Lección:** el circuito de pago tiene estado **en Culqi**, no solo en nuestra
base. Al probar de nuevo, limpiar lo nuestro no basta: hay que contar con que
customers y tarjetas siguen existiendo del otro lado.

Desplegado: Railway `b850f0a0` SUCCESS, `/health` 200.

### Gestión del Libro de Reclamaciones — por terminal, SIN panel web (2026-08-05)

La página pública recibía reclamos pero **no había forma de responderlos**, y el
plazo legal (15 días hábiles, improrrogable) no puede depender de que alguien
recuerde mirar un buzón.

**Decisión del usuario, y es la correcta: no se gestiona desde una pantalla
web.** La tabla `reclamaciones` guarda datos personales **de terceros** (DNI,
domicilio, teléfono) protegidos por la Ley 29733; exponerlos tras el panel haría
que robar una sesión también los comprometiera. Es una tarea de baja frecuencia
y no compensa abrir superficie web para ella. Encaja además con cómo ya funciona
el repo (`dar-plan.js`, `escanear.js`, … vía `railway run`).

**Se descartó un rol de administrador.** Se llegó a escribir un middleware
`soloAdmin` con `ADMIN_EMAILS` y se revirtió. Si en el futuro hace falta, la nota
de por qué no existe está en `src/api/middlewares/auth.middleware.js`.

Piezas:
- `src/lib/reclamaciones.js` — plazo legal en un solo sitio (`plazoDe`,
  `sumarDiasHabiles`, `diasHabilesEntre`). Lo usan el script y el cron; si cada
  uno contara por su cuenta, el recordatorio acabaría discrepando del panel.
  ⚠️ Cuenta de lunes a viernes y **no descuenta feriados**, así que el plazo
  mostrado es más corto que el real. Es intencional: adelantarse no incumple.
- `scripts/reclamaciones.js` — listar / ver / responder. Responder **manda
  primero el correo y solo entonces marca RESPONDIDO**: si Resend falla, la hoja
  sigue pendiente, porque el consumidor no recibió nada y el plazo corre.
  Rechaza responder dos veces: la respuesta es el cargo formal ante INDECOPI.
- `revisarPlazosReclamaciones` + `iniciarAvisoReclamaciones` en
  `monitoreo.worker.js` — cron diario a las 9:00. Avisa a `EMAIL_RECLAMACIONES`
  (default `hola@usenotoria.app`) de lo que vence en 5 días hábiles o menos, y
  **sigue avisando cada día hasta que se responda**: un recordatorio que se manda
  una sola vez se pierde.

El rate-limit estricto (10/hora) quedó **solo en el POST público**, no en el
router entero.

Probado de punta a punta contra la base real (alta → listar → ver → responder →
correo → aviso de plazo) y **los datos de prueba se borraron después**.
Desplegado: Railway `a5b85cc4` SUCCESS, `/health` 200.

**`PROMO_HASH_SECRET` fijada (2026-08-05).** Se generó con
`crypto.randomBytes(32)` y se cargó en Railway y en el `.env` local, **aprovechando
que `promo_tarjetas` estaba vacía**: es el único momento en que fijarla no
invalida ninguna huella anterior. Hasta entonces caía en `JWT_SECRET`, así que
rotar el JWT habría reseteado en silencio el límite de la promo por tarjeta.
Requirió redespliegue (`--skip-deploys` no aplica la variable al contenedor en
marcha). Railway `1c0fdb48` SUCCESS.

### Identificación obligatoria desde S/700 (2026-08-05)

Desde **S/700** el comprobante debe identificar al comprador (RS 007-99/SUNAT,
art. 8). Comprobado con `tributario.requiereIdentificacion()`, **hoy solo lo
cruza FRANQUICIA anual (S/1716)**. Negocio anual son S/564 y NO lo cruza — es
fácil equivocarse aquí, así que preguntar a la función y no a la memoria: al
tocar un precio la respuesta cambia sola.

Como no se pide documento en ningún punto del alta, al activar la emisión esa
boleta anual habría sido rechazada por SUNAT. Ahora:

- **Backend (`POST /api/pagos/culqi`)**: si el importe cruza el umbral y faltan
  los datos, responde **409 `DATOS_FISCALES_REQUERIDOS` y no crea nada en
  Culqi**. Va antes del cliente y de la tarjeta a propósito: cobrar y descubrir
  luego que no se puede emitir el comprobante deja al cliente pagado y sin
  documento. Mira `precioBase`, no el importe con promo, porque la promo solo
  aplica a la facturación mensual y ningún mensual llega al umbral.
- **Frontend**: aviso **en la tarjeta del plan, antes de pagar**, y el
  formulario (`components/DatosFiscales.js`) se abre antes del widget de Culqi.
  Con DNI se emite boleta; con RUC, factura.
- `GET /api/auth/perfil` devuelve ahora `docTipo`, `docNumero` y `razonSocial`:
  sin ellos el frontend no puede saber si hace falta pedirlos.
- ⚠️ Al volver del formulario se llama a `handleCTA(plan, true)`. Ese segundo
  argumento **no es opcional**: tras `refrescarPerfil()` el estado `usuario`
  todavía tiene el perfil viejo, y sin esa señal se volvería a pedir lo que el
  usuario acaba de rellenar, en bucle.

Este gate es independiente de `SUNAT_EMISION_ACTIVA`: los datos se piden siempre
que el importe lo exija, para no tener que reclamarlos a posteriori el día que se
active la emisión.

Desplegado: Railway `a26b6ade` SUCCESS, Vercel `notoria-16c292tsn` READY.

### Resumen diario de boletas (RC) — ACEPTADO POR SUNAT (2026-08-06)

**Estado: resuelto.** El resumen diario es aceptado por el beta con código 0,
incluidas las tres formas de boleta (sin documento del comprador, con DNI, y
cruzando el umbral de S/700) y también la **anulación**.

#### La causa del error 2522, y por qué costó tanto

El error era:

```
2522 "No existe información del documento del anticipo" (nodo "/" valor "")
```

El mensaje es una pista falsa: no había ningún anticipo en el documento. Lo que
faltaba era el **estado de cada línea**, `cac:Status/cbc:ConditionCode`.

Lo que despistó fue el **prefijo del namespace**. Se había intentado con
`sac:Status`, siguiendo al resto de campos propios de SUNAT de la línea
(`sac:TotalAmount`, `sac:BillingPayment`), y el validador lo rechaza en
cualquier posición — de ahí la conclusión, anotada aquí mismo, de que "el estado
no pertenece a este esquema". Sí pertenece: **va en `cac:`**. Es el único
elemento de la línea que no lleva el prefijo `sac:`.

El bloque es **opcional para el XSD pero obligatorio para SUNAT**, y esa es la
combinación que hace difícil el diagnóstico: el XML valida contra el esquema, se
envía, devuelve ticket, y el rechazo llega después con un código que apunta a
otra cosa.

**Cómo se encontró, que sirve para la próxima:** el propio validador de esquema
es un oráculo. Al mandar un elemento en el sitio equivocado, SUNAT no responde
"error", responde *qué elemento esperaba a continuación*:

```
found <sac:Status>, but next item should be {…}TotalAmount
```

Y la bisección resolvió lo demás: reduciendo la línea al mínimo
(`LineID` + `DocumentTypeCode` + `ID` + `TotalAmount`) el 2522 se mantuvo, lo
que descartó de golpe el receptor, `BillingPayment` y `TaxTotal`, y demostró que
el problema no estaba en lo que la línea tenía, sino en lo que le faltaba.

**Regla que queda:** un error de SUNAT con nodo `"/"` y valor vacío no señala el
sitio del fallo. No perseguir el texto del mensaje; bisecar el documento.

#### Anular una boleta

Se hace con **otro resumen diario en estado 3**, no con una comunicación de
baja. Verificado de punta a punta contra el beta: informar la boleta (estado 1),
luego anularla (estado 3), ambos aceptados. `prueba-resumen-beta.js` cubre ese
ciclo, porque el camino de anulación es el que nadie prueba hasta que hace falta.

Piezas ya hechas y utilizables:
- `billService.enviarResumen()` y `billService.consultarTicket()` — el flujo
  **asíncrono**: `sendSummary` NO devuelve el CDR, devuelve un **ticket**, y el
  veredicto se pide con `getStatus`. `statusCode` 98 = sigue procesando.
  ⚠️ **Un ticket entregado no significa aceptado.** El ticket hay que
  persistirlo: si el proceso se cae entre el envío y la consulta, sin él no hay
  forma de saber si SUNAT aceptó, y reenviar produciría un duplicado.
- `src/sunat/ublResumenBoletas.js` — construye el RC 1.1. Correcciones ya
  ganadas contra el validador de SUNAT, **no revertirlas**:
  1. El orden dentro de `sac:SummaryDocumentsLine` es
     `cac:Status` → `sac:TotalAmount` → `sac:BillingPayment` → `cac:TaxTotal`.
     El estado va en `cac:`, no en `sac:` (ver arriba), y sin él SUNAT rechaza
     el resumen entero con el error 2522.
  2. El bloque del receptor solo va si la boleta lo identifica.
  3. `cac:Signature/cbc:ID` debe ser `SignatureSP`, el mismo Id con el que
     firmaXades crea la firma.
- `scripts/prueba-resumen-beta.js` — construye, firma, envía a beta y **sondea
  el ticket**. Es el único modo de saber si el XML sirve.

#### ⚠️ Bug de zona horaria corregido — afectaba también a las FACTURAS

`ublInvoice.js` y `ublResumenBoletas.js` formateaban las fechas con
`toISOString()`, que devuelve **UTC**. Perú va en UTC-5, así que **entre las
19:00 y la medianoche de Lima el comprobante viajaba con la fecha de mañana** y
SUNAT lo rechazaba con **2236 "La fecha del IssueDate no debe ser mayor a la
fecha de recepción"**.

Estaba en el camino de las facturas desde el principio y no se había visto
porque las pruebas anteriores se corrieron de día; apareció al probar el resumen
a las 21:49 de Lima. Ahora ambos usan `tributario.fechaPeru()` /
`tributario.horaPeru()`, que formatean en `America/Lima`.

**Regla: ninguna fecha que vaya a SUNAT se formatea con `toISOString()`.**

Verificado tras el cambio: `prueba-sunat-beta.js` sigue con las tres
**ACEPTADAS sin observaciones**.

### Comunicación de baja (RA) — ACEPTADA POR SUNAT (2026-08-06)

`src/sunat/ublComunicacionBaja.js` construye el `VoidedDocuments` 1.0, que viaja
por el mismo canal asíncrono que el resumen (`sendSummary` → ticket →
`getStatus`). Aceptada por el beta con código 0.

**El reparto entre los dos documentos no es intercambiable:**

| Se anula | Con qué | Plazo |
|---|---|---|
| Factura (y sus notas 07/08) | Comunicación de baja **RA** | 7º día calendario siguiente a la emisión |
| Boleta (y sus notas) | Resumen diario **RC** en estado 3 | 7 días desde el CDR del resumen que la informó |

Meter una boleta en un RA es rechazo seguro, así que `construir` lo corta antes
de gastar un envío, con un mensaje que dice a dónde va. Lo mismo con el motivo
de anulación vacío y con mezclar comprobantes de días distintos: una baja se
refiere a los comprobantes de UN día, y si se mezclan SUNAT rechaza el documento
entero, tirando también las anulaciones que sí eran correctas.

Dos detalles del formato que SUNAT no perdona:
- `sac:DocumentNumberID` va **sin los ceros de relleno**: la factura que se
  imprime como `F001-00000123` se da de baja como serie `F001` y número `123`.
  De eso se encarga `partirNumero`.
- `cbc:CustomizationID` es **1.0**, no 1.1 como el resumen diario.

**Anular no es corregir.** Una factura dada de baja desaparece, no se rectifica.
Si el cliente ya la tiene y lo que cambia es el importe, lo que corresponde es
una nota de crédito. Y fuera del plazo de 7 días la baja ya no es posible:
`dentroDePlazo()` responde a eso, para no descubrirlo en el rechazo.

Prueba: `node scripts/prueba-baja-beta.js`.

### El resumen, enchufado a la cola (2026-08-06)

Hasta ahora `envioSunat.worker.js` mandaba **todo** uno a uno con `sendBill`,
boletas incluidas. Ahora son **dos colas separadas**, y la separación es
deliberada:

| | Factura | Boleta |
|---|---|---|
| Worker | `envioSunat.worker.js` | `resumenSunat.worker.js` |
| Envío | `sendBill`, una a una | `sendSummary`, agrupadas por día |
| Respuesta | CDR en el acto | **ticket**, y el CDR se pide aparte |
| Plazo | 3 días | **7 días** |

`envioSunat.worker.js` filtra ahora por `tipo: 'FACTURA'`. Es un filtro
positivo, no un "todo lo que no sea boleta": un VOUCHER en `PENDIENTE` sería un
error de datos, y mandarlo a SUNAT lo convertiría en un problema fiscal en vez
de en un aviso.

**El ticket es lo que obliga a tener tabla propia** (`ResumenSunat`). Un resumen
agrupa muchas boletas bajo un envío, así que el ticket, el CDR y el veredicto
son del resumen y no de cada boleta. Y el ticket **se persiste antes de dar el
envío por terminado**: si el proceso se cae entre el envío y la consulta, sin él
no hay forma de saber si SUNAT aceptó, y reenviar sería un duplicado. Por eso el
ciclo pregunta `if (ticket && estado === 'EN_PROCESO')` → consultar, nunca
reenviar.

Decisiones que conviene no deshacer:
- **Solo se agrupan días ya cerrados.** Un resumen del día en curso obligaría a
  un segundo resumen para las boletas que entren después. Esperar al día
  siguiente da un resumen por día y sobra plazo: hay 7 días.
- **Los dos plazos viven juntos** en `tributario.js`
  (`calcularFechaLimiteEnvio` / `calcularFechaLimiteResumen`) para que no se
  confundan. Darle a la boleta el plazo de la factura la daría por vencida
  cuatro días antes de tiempo, con aviso a contabilidad incluido. `marcarVencidos`
  de la cola de facturas también filtra por `tipo: 'FACTURA'`: si las dos colas
  declararan vencimientos, una boleta podría quedar VENCIDA mientras su resumen
  sigue vivo y en plazo.
- **Solo se propagan estados finales** a las boletas. `EN_PROCESO` es del
  resumen; `Comprobante.estadoSunat` no lo contempla y escribirlo dejaría las
  boletas en un estado que ninguna pantalla sabe leer.
- El cron del resumen va **desfasado 5 minutos** del de facturas
  (`5-59/10 * * * *`) para no pegarle a SUNAT con las dos cosas a la vez y
  provocar el 401 de saturación.

Pruebas: `prueba-resumen-cola.js`, 20 comprobaciones con Prisma en memoria pero
**envío real al beta** — agrupación por día, ticket persistido, no reenviar lo
que ya tiene ticket, veredicto propagado a cada boleta y vencimiento que arrastra
a las boletas que agrupaba.

✅ **Desplegado y migrado (2026-08-06).** Railway `d20b9987` SUCCESS y después
`prisma db push` dentro del contenedor: `resumenes_sunat` y
`comprobantes.resumenId` ya existen en prod. Verificado con
`prisma migrate diff` contra la BD real → *empty migration*. `/health` 200,
landing 200, y en los logs los dos workers arrancan y se declaran inactivos a la
espera de `SUNAT_EMISION_ACTIVA`, que es exactamente lo que debía pasar.

**El orden importó y casi cuesta un fallo silencioso:** el primer intento de
migrar se hizo antes de desplegar y Prisma contestó *"The database is already in
sync"* sin crear nada, porque leyó el schema viejo del contenedor. Ver el aviso
de la sección 4.

**Lo que sigue sin cablear, y es a propósito:** la comunicación de baja (RA) y la
anulación de boletas no tienen disparador — no hay ninguna acción en el producto
que anule un comprobante. El modelo `ResumenSunat` ya distingue `tipo` RC/RA para
que el RA tenga sitio cuando ese disparador exista; construir el worker antes
sería código muerto.

### Qué falta para encender la emisión, y en qué orden (2026-08-06)

`SUNAT_CERT_P12_BASE64` ya está cargado en Railway (12.616 caracteres, longitud
verificada contra el archivo local). Es la **única** variable `SUNAT_*` que
existe en producción: la emisión sigue apagada y los dos workers lo declaran en
el arranque.

El orden no es negociable, y el primer punto es el que más caro sale:

1. ~~🔴 **Culqi a llaves live.**~~ ✅ **HECHO el 2026-08-14** (§21). El motivo por
   el que iba primero: con `SUNAT_EMISION_ACTIVA=true` y llaves de test,
   cualquiera que pagara en `/precios` con `4111 1111 1111 1111` activaba el plan
   sin pagar **y disparaba un comprobante fiscal real contra SUNAT por una venta
   que no existió**. Ingresos fantasma declarados, y deshacerlos exige
   comunicación de baja o nota de crédito — con la numeración, que no admite
   huecos, ya gastada.
   ⚠️ **Ahora el desfase corre al revés y ya está activo:** se cobra de verdad y
   NO se emite comprobante fiscal (solo VOUCHER interno). Cada venta real desde
   hoy es una venta sin boleta, y la empresa es **emisor electrónico obligatorio
   desde el 27/07/2026**. O se terminan los pasos 2-5 rápido, o no se anuncia
   `/precios` hasta terminarlos.
2. **Afiliación al SEE-Del Contribuyente** ✅ (ya hecha, verificada en la ficha
   RUC el 07/08/2026 — ver README) y **usuario SOL secundario** (pendiente). Sin
   la afiliación, producción rechaza todo; sin el usuario,
   `billService.configurado()` es falso y los workers ni arrancan.
3. `SUNAT_CERT_PASSWORD`, `SUNAT_SOL_USUARIO`, `SUNAT_SOL_CLAVE` — **las pone el
   usuario**, nunca se guardan en archivos ni pasan por el chat:
   `railway variables --set "X=..." --service api`.
4. ⚠️ **`SUNAT_ENTORNO=produccion`.** Sin esta variable `billService` apunta al
   **beta**: los comprobantes de clientes reales se irían al entorno de pruebas,
   sin ningún error visible, y la empresa creería tener documentos válidos que
   para SUNAT no existen. Es el fallo más silencioso de toda la Fase B.
5. `SUNAT_EMISION_ACTIVA=true` — el último interruptor, no el primero.

⚠️ Ojo con `certificado.configurado()`: devuelve `true` con solo el base64
cargado, aunque falte la contraseña. Hoy no importa porque `listoParaEmitir()`
exige además el interruptor y las credenciales SOL, pero no tomarlo como prueba
de que el certificado se puede abrir.

✅ **`.p12` fuera de OneDrive (2026-08-06).** La llave privada ya no se
sincroniza a la nube. Operativamente el certificado vive en Railway como
`SUNAT_CERT_P12_BASE64`, así que el archivo local es solo respaldo. ⚠️ Cualquier
ruta de OneDrive que aparezca en documentación anterior a esta fecha ya no vale.

---

## Bugs de Culqi encontrados el 2026-08-05 (resumen para no repetirlos)

Los cinco salieron al cargar las llaves y empezar a cobrar de verdad. **Ninguno
era visible sin llaves**, y cuatro habrían roto cobros de clientes reales.

| # | Qué pasaba | Por qué importaba |
|---|-----------|-------------------|
| 1 | `crearCliente` mandaba `address: '-'` | Culqi exige 5-100 caracteres → **toda alta fallaba** |
| 2 | `crearCliente` mandaba `last_name: '-'` cuando el nombre era **una sola palabra** | El registro tiene un único campo "nombre", así que **quien no pusiera apellido no podía pagar**. Ver §"Nombres sin apellido" |
| 3 | `registrarPago` leía `cargo.source.card_number` | Con **tarjeta guardada** esos campos van un nivel más abajo → historial de Facturación **vacío en silencio** |
| 4 | El alta llamaba a `crearCliente` siempre | Culqi **rechaza un segundo customer con el mismo correo** → quien se suscribiera dos veces quedaba **sin poder pagar nunca** |
| 5 | El widget mostraba el 50% redondeado en **soles** | Decía **S/30.00** y se cobraba **S/29.50** |

**Regla que resume 1 y 2: a Culqi no se le mandan rellenos de un carácter.**
Valida `address`, `last_name` y `description` (esta última, 5-80 caracteres).

### Nombres sin apellido (bug 2)

`crearCliente` partía el nombre por espacios y usaba `'-'` como apellido cuando
no había. Culqi lo rechaza. Como el formulario de registro **solo pide "nombre"**,
registrarse sin apellido es lo normal, no un caso raro.

Ahora se manda `'No indicado'` como apellido y se recortan ambos a 50 caracteres.
Comprobado con un cobro real de S/29.50 a nombre de "giorrnell":
`outcome: venta_exitosa`. `prueba-culqi.js` cubre "giorrnell", "Ana" y nombres
con espacios de sobra.

> ⚠️ **`paid` NO indica si el cobro se hizo.** Una venta aceptada devuelve
> `paid: false` — ese campo se refiere a la liquidación del dinero hacia el
> comercio, que ocurre después. El estado real está en
> `outcome.type === 'venta_exitosa'`. No escribir comprobaciones sobre `paid`.

### "7 días gratis": reclamo retirado (2026-08-05)

Los botones decían "Comenzar/Probar 7 días gratis" y **no existe ningún periodo
de prueba**: el cobro es inmediato. Lo confirmó el primer pago real (S/29.50
cobrados en el acto). Además contradecía los Términos, que dicen que los planes
de pago se facturan por adelantado.

Los 4 botones (ES y EN, landing y panel) pasaron a texto veraz. Queda un
comentario en cada sitio para que no vuelva a colarse. **No reintroducir la
promesa sin implementar el periodo de prueba de verdad** — sería publicidad
engañosa (Ley 29571) y la web está bajo revisión de Culqi.

Existe sí un **retracto real de 7 días** con devolución del 100% en
`/devoluciones`: ese sí se puede anunciar.

### Receptor incompleto: `tributario.validarReceptorParaSunat()`

Complementa la §"Identificación obligatoria desde S/700". Se llama desde
`comprobante.service.js` **antes de pedir el correlativo** (la numeración no
admite huecos) y desde `pago.routes.js` **antes de cobrar**. Si falta algo, no se
emite y se avisa a `EMAIL_CONTABILIDAD`: el cliente pagó y tiene derecho a su
comprobante, así que se corrige y se reemite, no se degrada a VOUCHER a
escondidas. 7 casos en `prueba-comprobantes.js`.

---

## Cierre de la sesión 2026-08-05 — por dónde seguir mañana

Todo lo de hoy está desplegado y verificado en producción. Backend
`/health` 200, las 7 páginas públicas en 200 por HTTPS, y en verde
`prueba-culqi.js`, `prueba-promo.js`, `prueba-comprobantes.js`,
`prueba-xml-firma.js` y `prueba-sunat-beta.js`.

**Estado de la base (dejada limpia a propósito):** 0 pagos, 0 comprobantes,
0 reclamaciones, 0 `promo_tarjetas`, series sin iniciar. Las cuentas
`padkar4@gmail.com` y `giorrnellprincipe@gmail.com` están en Gratuito con la
promo disponible. Las cuentas con plan NEGOCIO concedido a mano
(`didier@usenotoria.app`, `didierprincipe@gmail.com`) **son del usuario**, no
tocarlas.

### Lo primero, mañana

1. ~~**Resumen diario (RC): resolver el error 2522.**~~ **Resuelto el
   2026-08-06** — faltaba `cac:Status/cbc:ConditionCode`. La Fase B quedó
   completa: resumen diario, anulación de boletas y comunicación de baja, las
   tres aceptadas por el beta. Ver las secciones de arriba.
   ⚠️ **La duda sobre el canal se cerró contra la norma, no con el contador.**
   El resumen diario es **obligatorio** para toda boleta de venta electrónica y
   sus notas, con plazo hasta el sétimo día calendario siguiente a la emisión.
   No es una opción que dependa del tipo de negocio, y que el web service acepte
   una boleta suelta por `sendBill` no releva de informarla por resumen — el
   beta es permisivo, la obligación sigue. Lo que sí es del contador son los
   criterios de IGV y exportación, no el canal de envío.
2. **Culqi**: esperando respuesta a la solicitud. Al aprobar → llaves live +
   **redespliegue de Vercel** (ver README).

### Pendiente, sin bloquear

- `EMAIL_RECLAMACIONES` sin fijar: los avisos van a `hola@usenotoria.app`, que
  el usuario reenvía a `didierprincipe@gmail.com` con Cloudflare. **Sin verificar
  que el reenvío llegue de verdad** — si no llega, el plazo legal se pasa sin que
  nadie se entere.
- Capturas reales en `/precios` en vez de las ilustraciones SVG: **aparcado por
  decisión del usuario** hasta ver si Culqi aprueba.
- El landing (`app/page.js`) se pinta en el cliente: su HTML va casi vacío. No
  afecta a Culqi (el revisor usa navegador) pero sí al SEO.
- Integraciones sin credenciales: Instagram/Meta, comentarios de TikTok (en
  revisión), proveedor de menciones. (La plantilla de WhatsApp ya no aplica: el
  canal se eliminó el 2026-08-16, §24.)

### Decisiones de hoy que NO hay que deshacer

- **Sin rol de administrador.** El Libro de Reclamaciones se gestiona por
  terminal. Guarda datos personales de terceros y no se expone tras el panel.
- **La promo de bienvenida se queda**, anunciada con `BannerPromo` y limitada
  por cuenta **y por tarjeta**.
- **Nada de "7 días gratis"**: no existe periodo de prueba.
- **Ninguna fecha a SUNAT con `toISOString()`** — usar `tributario.fechaPeru()`.

---

## Sesión 2026-08-14 — §21. Culqi aprobado y en LIVE

Culqi aprobó el comercio y el usuario renovó la llave privada en el panel
(CulqiPanel → Desarrollo → API Keys, 14/08/2026 14:06). Al ir a cargarla
aparecieron **tres cosas rotas a la vez**, y ninguna daba error visible: la web
simplemente decía "No se pudo procesar el pago".

### Lo que estaba pasando en producción antes de esta sesión

| Dónde | Qué había | Consecuencia |
|-------|-----------|--------------|
| Vercel / navegador | `pk_test_b8r55oEGMtCgH2Ez` | El widget tokenizaba en modo PRUEBA: cualquiera podía activarse un plan con `4111 1111 1111 1111` |
| Railway `CULQI_PUBLIC_KEY` | `pk_live_…` | **Distinta de la del navegador** — entornos cruzados |
| Railway `CULQI_SECRET_KEY` | `sk_live_wDf3…` (la del 03/08) | La llave **anterior a la renovación**: Culqi la revoca en el acto → **401 en todo cobro** |

O sea que los pagos llevaban roto desde el momento de la renovación, y antes de
eso el frontend estaba en test contra un backend en live. Nadie lo habría notado
hasta el primer cliente real.

### Cómo se dejó

```bash
# Backend (Railway) — la pública ya estaba bien, solo se rotó la secreta
printf '%s' 'sk_live_…' | railway variable set CULQI_SECRET_KEY --stdin --service api

# Frontend (Vercel) — NEXT_PUBLIC_* se incrusta en el BUILD
vercel env rm  NEXT_PUBLIC_CULQI_PUBLIC_KEY production --yes
printf '%s' 'pk_live_…' | vercel env add NEXT_PUBLIC_CULQI_PUBLIC_KEY production
vercel --prod --yes          # imprescindible: sin build nuevo el bundle sigue con la vieja
```

### 🔴 Trampa nueva: en PowerShell, `| railway variable set --stdin` mete un BOM

La receta de la §2 (`echo "…" | railway variable set X --stdin`) se verificó en
**bash**. Ejecutada en **PowerShell**, el pipe hacia un ejecutable nativo antepone
un **BOM UTF-8 invisible** al valor: la llave se guardó como `﻿sk_live_…`,
midió **25 caracteres en vez de 24** y Culqi devolvía 401 exactamente igual que
si estuviera revocada.

**Regla: cargar secretos por stdin SIEMPRE desde bash con `printf '%s'`** — `printf`
además no agrega el salto de línea que sí agrega `echo`. Y comprobar la longitud
después: `railway variables --service api --kv` y contar caracteres. Una llave de
Culqi mide **24**.

### `verificar-culqi-live.js` — probar llaves live sin cobrarle a nadie

`prueba-culqi.js` no sirve con llaves live: haría un cobro real (por eso aborta).
El script nuevo comprueba lo mismo que importa, solo con lecturas:

```bash
railway run node scripts/verificar-culqi-live.js   # usa las variables REALES de Railway
```

1. Que ninguna llave traiga espacios/BOM alrededor.
2. Que las dos sean **del mismo entorno** (el fallo cruzado de arriba).
3. Que la **secreta autentique** — `GET /v2/charges`, solo lectura.
4. Que la **pública siga viva**: se le manda una tarjeta inválida al endpoint de
   tokens. Con llaves live Culqi **no deja tokenizar desde el servidor**, así que
   la petición siempre falla; lo que distingue es **cómo**: `401` = llave mala,
   `400` = llave buena y lo que rechaza es la tarjeta. No crea nada.
5. Que la llave del **bundle desplegado** en usenotoria.app sea esa misma — es lo
   único que detecta un `vercel env add` sin `vercel --prod` detrás.

Resultado el 2026-08-14: los 5 en verde, y **0 cargos en el entorno live** (nadie
ha pagado de verdad todavía).

### `auditar-pagos.js` — foto de solo lectura de los cobros

```bash
node scripts/auditar-pagos.js
```

Lo que devolvió tras la rotación:

- **2 pagos, los dos `chr_test_`** y de cuentas del propio usuario
  (`padkar4@gmail.com`, `giorrnellprincipe@gmail.com`). **Ningún desconocido se
  activó un plan gratis** durante la ventana de llaves de test.
- ⚠️ **Pero esas 2 cuentas quedaron con una tarjeta de TEST guardada**
  (`suscripcionId = crd_test_…`) y vencimiento 06 y 07/09/2026. El cron de
  renovación (5:00 AM) intentará cobrar esas tarjetas **con la llave live**, y
  `crd_test_…` no existe en el entorno live: fallará y desactivará la suscripción.
  No cobra de más ni a nadie equivocado, pero ensucia el log. Se limpia con
  `node scripts/limpiar-pagos-prueba.js <email> --aplicar` (que además libera la
  promo de bienvenida, hoy consumida por las dos).
- 2 comprobantes, ambos **VOUCHER V001** — no fiscales, que es lo correcto con la
  emisión SUNAT apagada.

### Lo del panel de Culqi — hecho el 2026-08-15

1. ✅ **Webhook registrado.** CulqiPanel → Desarrollo → **Webhooks**, con esta
   configuración:

   | Campo | Valor |
   |-------|-------|
   | Producto | CulqiOnline |
   | Recurso | `refund` |
   | **Acción** | **`creation`** ← *no* `update` |
   | Resultado | `succeeded` |
   | URL | `https://api.usenotoria.app/api/pagos/culqi/webhook` |
   | Activar autenticación | **Sí** — usuario cualquiera, contraseña = `CULQI_WEBHOOK_SECRET` |

   El secreto se lee con `railway variables --service api --kv`. Alternativa sin
   activar la autenticación: pegar la URL con `?secret=` y el valor **real**
   detrás — el endpoint acepta las dos formas. Se prefiere la básica porque la
   URL queda escrita a la vista en el propio panel de Culqi.

   ⚠️ **Dos trampas del formulario, encontradas al crearlo (2026-08-14):**
   - Rechaza el formulario entero con *"El formulario contiene caracteres
     inválidos"* si se pegan los `< >` de un marcador de posición. No admite
     esos símbolos en la URL.
   - **El campo de contraseña admite máximo 20 caracteres.** El
     `CULQI_WEBHOOK_SECRET` original medía 32, no entraba, y eso llevó a poner
     ahí *la contraseña del propio CulqiPanel* — la cuenta que controla cobros
     y depósitos. **Nunca esa contraseña.** Por eso el secreto se regeneró de
     **20 caracteres alfanuméricos** (sin símbolos, que es lo que el formulario
     rechaza). Si algún día se rota, respetar ese límite.

   ⏳ **Queda comprobarlo con un reembolso real**, que es lo único que puede
   hacerlo (ver el bloque de abajo). Si la contraseña no cuadrara, el endpoint lo
   deja escrito en los logs, así que el primer reembolso lo dirá pase lo que
   pase.

   Sin el webhook, un reembolso no desactivaría la suscripción: el cliente
   recupera su dinero y conserva el plan. Los **contracargos NO llegan por
   webhook** (Culqi no expone ese recurso): se vigilan en la sección
   *Controversias* del panel.

   🔍 **Cómo verificar que quedó bien configurado — y por qué no se puede del
   todo.** `GET /v2/webhooks` responde 401: Culqi **no expone la configuración
   por API**, solo se ve en el panel. `GET /v2/events` sí lista los eventos
   disparados, pero está vacío mientras no haya un reembolso real, y **guardar
   el webhook no dispara ningún ping de prueba**. O sea que lo único que se
   puede comprobar sin gastar dinero es *nuestro* lado
   (`railway run node scripts/verificar-webhook-culqi.js`). La prueba completa
   es un cobro pequeño reembolsado desde el panel, o esperar al primer
   reembolso real.

   Por eso el endpoint **registra también los rechazos**
   (`[Culqi webhook] RECHAZADO (401)…`, sin la credencial recibida). Antes, un
   webhook mal configurado en el panel dejaba los logs **idénticos** a los de un
   webhook que nadie ha llamado todavía, y esos dos casos hay que poder
   distinguirlos. Regla heredada de §20 (Meta): **la prueba son los logs del
   servidor, nunca el cartel del panel del proveedor.**
2. **RSA Keys** (misma sección del panel) — cifrado extra del payload del
   checkout. **Opcional**, Culqi no lo exige; no está implementado y no bloquea
   nada.
3. ~~Renovar otra vez la llave secreta.~~ **DESCARTADO por decisión del usuario
   (2026-08-15).** Viajó en una captura por chat, pero no se publicó en ningún
   sitio: se asume el riesgo y **no se vuelve a plantear**. Si algún día se rota
   de todos modos: basta el comando de Railway de arriba más
   `railway run node scripts/verificar-culqi-live.js`, sin tocar Vercel — la
   **pública** no cambia (`pk_live_EbFd0Nib4QqOfhhk`). Y ojo con el webhook: su
   campo de contraseña admite **máximo 20 caracteres** y habría que cambiarla
   también allí.

### Lo que NO hay que deshacer

- Las llaves **live no van en archivos locales**. `.env` y `.env.local` se quedan
  con las de test, y `set-culqi-keys.js` sigue negándose a escribir `*_live_*`.
- Los secretos se cargan **por stdin desde bash**, nunca con `echo` en PowerShell
  ni como argumento de línea de comandos.

---

## Sesión 2026-08-16 — §22. Instagram oculto tras un interruptor, y landing con gráficos y fuentes

### 22.1 — Instagram deja de existir para el cliente hasta que Meta apruebe

**El problema, que no era de código.** La integración de Instagram está
terminada, probada y desplegada, pero sus permisos siguen en **acceso estándar**
(§19.10): con ese nivel, un permiso solo lo puede conceder alguien con **rol en
la app**. O sea que el botón "Conectar Instagram" funcionaba para el dueño y
**habría fallado con el primer cliente real**, con un error de Meta que el
cliente no puede resolver. Se quería publicitar la web ya, así que ofrecer un
botón que solo falla era lo peor de las dos opciones.

**Lo que NO se hizo, y por qué.** No se borró la función ni se puso
"Próximamente". Borrarla obligaría a rehacerla; y "próximamente" viola la regla
de producto que ya rige en `lib/menciones.js` — *lo que no podemos entregar no se
muestra*, porque invita a preguntar por una fecha que no tenemos.

🔴 **El detalle que casi cuesta la revisión: el App Review está EN CURSO** (se
envió el 2026-08-15, §21). Si Instagram se ocultaba para todos, el revisor de
Meta —que entra con `revisormeta@usenotoria.app`— no habría visto la integración
y habría rechazado **la revisión entera**, no solo ese permiso. De ahí que el
interruptor tenga lista de excepciones en vez de ser un sí/no.

**Cómo quedó.** Fuente única en **`src/lib/instagramVisible.js`**:

| Variable | Efecto |
|---|---|
| `INSTAGRAM_ACTIVO=true` | visible para **todos** — es lo que se pone el día que aprueben |
| `INSTAGRAM_CUENTAS_PRUEBA=a@b.c,d@e.f` | correos que lo ven mientras tanto (revisor de Meta + dueño) |

Solo el literal `'true'` activa (ni `1`, ni `sí`, ni `TRUE`), y los correos se
comparan en minúsculas y sin espacios.

Puntos donde se aplica:
- `redes.routes.js` → `GET /:negocioId/estado` devuelve `instagram.disponible:false`,
  y `POST /:negocioId/instagram/conectar` responde **404** ("Función no
  disponible", no 403: no es falta de permiso, es que la función no existe para
  él). El **callback de OAuth no se gateó a propósito**: su `state` va firmado
  con HMAC y caduca, así que solo se llega ahí pasando por `conectar`.
- `lib/menciones.js` → `fuentesDisponibles(usuario)` y `hayFuenteDisponible(usuario)`
  ahora reciben el usuario. ⚠️ **Consecuencia que hay que tener presente: Instagram
  era la ÚNICA fuente de menciones**, así que la sección Menciones vuelve a estar
  invisible para los clientes (como estuvo de julio a agosto). Reaparece sola al
  encender el interruptor.
- Panel: `dashboard/conexiones` **esconde la fila entera** (helper `redesVisibles`),
  y la fila de Facebook pasa a ser `ultima` cuando no queda ninguna detrás, para
  no dejar un borde colgando. El cartel de la pestaña Comentarios nombra ahora
  **solo las redes `disponible`** en vez de una lista fija.

🔑 **Excepción deliberada: una cuenta YA conectada nunca se esconde.** Si se
escondiera, el usuario se quedaría sin forma de desconectarla ni de borrar los
datos que trajo — que es justo lo que Meta exige poder hacer. La regla es
`disponible || conectado`.

Red de seguridad: **`scripts/prueba-instagram-visible.js`** (12 comprobaciones,
sin servidor ni BD). Cubre el caso real de hoy —credenciales de Meta presentes
pero función oculta— y el de mañana —interruptor abierto para todos—.

**Pendiente del usuario (no es código):** cargar `INSTAGRAM_CUENTAS_PRUEBA` en
Railway con el correo del revisor **antes** de desplegar, o el revisor se queda
fuera. `INSTAGRAM_ACTIVO` se deja sin poner.

### 22.2 — Landing: menos texto, más producto, y cada cifra con su fuente

Había cuatro secciones seguidas de tarjetas de texto y ni una imagen del
producto. Cambios:

- **Fusionadas "Stats" y "El problema"** en una sola (`porque`): decían lo mismo
  dos veces, con seis tarjetas entre las dos.
- **Piezas gráficas nuevas** en `components/MockupsLanding.js`: gráfica del
  ataque, mockup de la alerta, medidor del score y diagrama del circuito.
  **Son mockups en código, no capturas**: siguen el tema claro/oscuro solos y no
  envejecen con cada cambio del panel. Los datos van rotulados *Ejemplo
  ilustrativo*.
- **Funcionalidades de 9 tarjetas a 6.** Las dos que ahora se VEN dibujadas
  (score e historial de rating) salieron de la lista —enseñarlas y describirlas
  era decirlo dos veces— y quedan nombradas en una línea.

🔴 **REGLA NUEVA Y PERMANENTE: una cifra sin URL pública que la sostenga no entra
al landing.** Las tres que había estaban inventadas, y una era además **falsa por
un orden de magnitud**: "−22% de clientes si el rating baja 0.3★" contra el único
estudio que mide eso (Luca, HBS: **una estrella entera** mueve 5-9% de ingresos,
o sea que 0.3★ no llega ni al 3%). Es exactamente el terreno de la publicidad
engañosa (Ley 29571). Sustituidas por datos verificables, cada uno con enlace
visible en su propia tarjeta:

| Cifra | Fuente |
|---|---|
| 292 M de reseñas bloqueadas/eliminadas por Google en 2025, + 13 M de fichas falsas | [Google, blog oficial (2026)](https://blog.google/products-and-platforms/products/maps/new-ways-were-protecting-businesses-on-maps/) |
| 5-9% de ingresos por estrella (restaurante independiente) | [M. Luca, HBS working paper 12-016](https://www.hbs.edu/ris/Publication%20Files/12-016_a7e4a5a2-03f9-490d-b093-8f951238dba2.pdf) |
| 31% solo usa negocios de 4.5★ o más (era 17%) | [BrightLocal, LCRS 2026](https://www.brightlocal.com/research/local-consumer-review-survey/) |

También se corrigió el **blog**: decía "el 89% lee las respuestas del negocio
antes de decidir". El 89% existe pero mide otra cosa —cuánta gente **espera**
respuesta—; ahora dice eso, con su enlace.

⚠️ **Trampa de móvil que hay que recordar al dibujar SVG:** un `viewBox` escala
**todo, el texto incluido**. Las etiquetas de 11 px quedaban en ~6 px en un
teléfono. Solución: `min-width` en el SVG dentro de una caja con
`overflow-x:auto` —el scroll es de la caja, nunca del documento— y un `useEffect`
que deja la caja centrada en la caída, porque si no el primer vistazo en móvil
era la parte plana, que no cuenta nada. Verificado en un iframe de 400 px:
`scrollWidth` del documento 398 vs `clientWidth` 395, o sea sin scroll horizontal
de página.

### 22.3 — Despliegue del 2026-08-16, verificado en vivo

Railway `2d096b34` SUCCESS · Vercel `notoria-nyvag1t0l` Ready · commit `044f4d7`.

**Orden que se siguió, y por qué importa:** la variable
`INSTAGRAM_CUENTAS_PRUEBA` se cargó **antes** de subir el código (con
`--skip-deploys`). Al revés habría existido una ventana en la que el código nuevo
ya escondía Instagram y la lista de excepciones todavía no estaba — o sea, con el
revisor de Meta fuera justo mientras revisa.

**Cómo se verificó** (ninguna de las tres cosas se puede dar por buena mirando un
panel):

1. **El interruptor, dentro del contenedor de producción:**
   `railway ssh --service api "node -e \"…instagramVisiblePara(…)\""` →
   `revisor ve IG: true` / `cliente ve IG: false`, con `INSTAGRAM_ACTIVO`
   sin definir. Esto prueba a la vez que el módulo se desplegó, que está
   cableado y que la variable llegó bien.
2. **El landing: contra los CHUNKS, no contra el HTML.** `app/page.js` es
   `'use client'` y el HTML que sirve Vercel son 24 kB sin nada del contenido —
   buscar ahí "292 M" da 0 y parece que el deploy falló. Hay que bajar los
   `/_next/static/chunks/*` que referencia el HTML y buscar en ellos. Presentes:
   `292 M`, `5-9%`, los tres dominios de las fuentes, `Cuatro pasos que corren
   solos`. Ausentes las cifras retiradas: `0.3 estrellas`, `Ataque a las 3AM`,
   `tarda el daño en volverse` → 0 coincidencias.
   ℹ️ `Score de reputación 0-100` **sigue apareciendo una vez, y está bien**:
   salió de las tarjetas de funcionalidades pero se queda en la lista del plan
   Gratuito.
3. Endpoints: `/health` 200 y `POST /api/redes/:id/instagram/conectar` 401 sin
   sesión (ruta viva).

**No hubo migración de BD**: ningún cambio tocó `schema.prisma`, así que la regla
de "desplegar primero, migrar después" no aplicaba esta vez.

---

## Sesión 2026-08-16 — §23. El panel: interacción, estructura y un falso "todo bien"

### 23.1 — Por qué los botones no respondían al cursor

No era descuido de estilos, era una imposibilidad: el panel está escrito con
**~994 `style={{…}}` inline contra 119 `className`**, y un estilo inline **no
puede declarar `:hover`, `:focus` ni `:active`**. Lo medible: 17 `transition:`
sueltas, dos `onMouseEnter` y **cero** estados de foco en todo el panel.

Reescribir mil estilos era inasumible, pero **141 de los 149 elementos clicables
son `<button>` o `<Link>`** (solo 8 son `div onClick`), así que la respuesta al
cursor se resolvió desde CSS: capa `.panel` en `globals.css`, encendida con
`className="panel"` en la raíz de `dashboard/layout.js`.

⚠️ **El hover se pinta con un VELO (`box-shadow: inset 0 0 0 999px`), no con
`filter: brightness()`.** Brightness *aclara*, y en tema claro un botón blanco
aclarado sigue siendo blanco. El velo es translúcido y se invierte con el tema
(`--velo-hover`), así que funciona sobre cualquier fondo **sin conocerlo** — que
es justo el problema cuando el color vive inline.

⚠️ **`!important` en el borde de los campos, y no es pereza:** los inputs traen
`border-color` en su estilo inline, que gana a cualquier selector. Sin él, al
enfocar aparecía el halo pero el borde seguía gris. Comprobado en vivo:
enfocado da `rgb(13,138,42)`, sin foco vuelve al gris del inline.

### 23.2 — Estructura

Barra lateral: de 8 enlaces planos a tres grupos (*Lo que vigilas* / *Lo que te
llega* / *Herramientas*); un grupo sin entradas visibles no pinta ni su rótulo.
**Los colores del nav salieron a CSS (`.nav-item`)**: mientras el color siguiera
inline era imposible que el ítem se iluminara. Las cifras del Resumen pasaron a
ser enlaces a la pantalla donde se actúa sobre ellas.

### 23.3 — 🔴 El fallo más grave: el panel afirmaba "todo tranquilo" sin haber mirado

`dashboard/page.js` y `alertas/page.js` hacían `.catch(console.error)` y seguían
adelante: la lista quedaba vacía y se pintaba el cartel verde *"Todo tranquilo
por ahora"*. Ante un 500, un timeout o el **rate-limit de 100 pet./15min**,
Notoria le decía al dueño que su reputación estaba bien **sin haberla podido
consultar**. En una herramienta de monitoreo, "no hay alertas" y "no pude
consultarlas" no pueden verse igual. Ahora hay estado de error explícito, con
botón de reintentar, y el subtítulo de Alertas dice *"Estado desconocido"* en vez
de *"Todo al día"*.

**Alcance exacto:** si falla el PERFIL, el layout ya mostraba su pantalla de
"sin conexión". Esto cubre el caso en que la sesión carga pero la consulta de
datos no.

### 23.4 — Otros arreglos de la misma revisión

- **Borrar competidor** (`competencia`): borraba al primer clic y el `catch {}`
  se tragaba el fallo — el competidor reaparecía sin explicación. Ahora
  confirma en dos pasos y muestra el error. Conexiones ya lo hacía bien; era la
  excepción.
- **Conexiones** hacía `return null` mientras cargaba: pantalla **en blanco**, y
  encima es la página más lenta (pide el estado de redes negocio por negocio).
- **Los 4 `alert()` del navegador** pasaron a avisos en página. Uno de ellos
  destapó que `msgScan` se pintaba **en verde también para los errores**: un "no
  se pudo escanear" se leía como un éxito.
- **Tour de bienvenida ROTO** (`TourGuiado.js`): apuntaba a `planes` y
  `facturacion`, fuera del menú desde hace tiempo. Al no existir el elemento,
  `rect` quedaba null y el componente hacía `return null`: sin recuadro, sin
  "Siguiente" y sin poder cerrarlo — y como `bs_tour` nunca se marcaba, **se
  rearmaba en cada carga y volvía a morir en el mismo sitio**. Ningún usuario
  nuevo vio los dos últimos pasos. Ahora filtra por los pasos cuyo elemento
  existe de verdad.
- **La X de cerrar el menú móvil se veía en escritorio**: tenía `md:hidden` pero
  también `display:'flex'` inline, que gana. Mismo patrón de siempre.

### 23.5 — Trampas de verificación (costaron tiempo, anotarlas)

1. 🔴 **`next dev` sirve CSS RANCIO bajo el MISMO hash de chunk.** Tras editar
   `globals.css`, el bundle traía las variables nuevas pero **no** el bloque
   siguiente, y la barra lateral se veía rota sin que el código lo estuviera.
   **Si tocas `globals.css` y no ves el cambio: `rm -rf .next` y reiniciar.** No
   falla siempre, y cuando falla lo hace en silencio.
2. **`:focus` no se puede probar con el navegador automatizado**:
   `document.hasFocus()` es `false`, así que `.focus()` no activa `:focus` y da
   un falso negativo. Verificar por otra vía.
3. **El JS inyectado en la pestaña corre en un contexto AISLADO**: sobrescribir
   `window.fetch` desde ahí **no** afecta al código de la página. Para simular
   un fallo de red hay que tocar el cliente (`lib/api.js`) temporalmente.
4. **Medir accesibilidad contando `aria-label` engaña**: `title` también da
   nombre accesible. Contados en el DOM real: **0 botones sin nombre** en
   Resumen y en la ficha de negocio.

### 23.6 — Gráfica de historial de rating (`GraficaRating`)

Cuatro cosas mal, todas visibles con datos reales:

1. ⚠️ **`preserveAspectRatio="none"`** sobre un lienzo de 100×60 estirado al ancho
   de la tarjeta: el trazo salía finísimo en horizontal y grueso en vertical, y
   los puntos se deformaban en óvalos. **Regla: en un SVG con `viewBox`, nunca
   `preserveAspectRatio="none"` si el dibujo tiene círculos o grosores de línea**
   — dale al viewBox la proporción real y deja que escale uniforme.
2. **La ventana mínima del eje Y era de 1.0 estrella entera.** El movimiento
   típico de un rating es de una o dos décimas, así que quedaba aplastado contra
   el centro y parecía una raya recta. Bajada a **0.3**.
3. **Sin ninguna referencia numérica**: la línea flotaba a media altura sin decir
   entre qué valores se movía. Ahora hay líneas punteadas en el mínimo y el
   máximo REALES, rotuladas.
4. **Diez etiquetas de fecha debajo**, una por escaneo: con varios escaneos el
   mismo día repetía "08/15" cuatro veces y se encimaban. Ahora solo las de los
   extremos, y cada punto lleva su valor y fecha en un `<title>` al pasar el
   cursor.

Además el pie dice ahora **cuánto se movió** (`4.2 −0.1`, coloreado) en vez de
obligar a comparar a ojo el primer número con el último; con rating estable dice
"sin cambios" y pinta una sola línea de referencia. El relleno pasó de verde
plano —que con un rating estable era un rectángulo sólido que se comía la
tarjeta— a un degradado que se desvanece.

**Verificado en vivo en los dos casos**: con los datos reales (plano) y forzando
temporalmente una serie con subidas y bajadas, en tema oscuro y claro.

### 23.7 — Capturas reales del panel en el landing (§ PanelShowcase)

El landing ya explicaba el producto con piezas dibujadas (§22.2), pero no había
prueba de que existiera. Ahora hay una sección con **capturas reales**, en marco
de navegador y con 4 pestañas: Resumen · Tu negocio · Reseñas · Competencia.
Imágenes en `public/panel/*.webp`, ~142 KB las cuatro.

🔴 **LOS DATOS ESTÁN ANONIMIZADOS, Y ES OBLIGATORIO MANTENERLO ASÍ.** Las
capturas salen de una cuenta real cuyo negocio monitoreado es un **restaurante
real que NO es cliente**, con reseñas de **personas identificables**. Publicarlo
tal cual insinuaría una relación comercial que no existe y expondría datos de
terceros en material publicitario. Antes de capturar se sustituye por el negocio
ficticio que ya usa el landing ("Cevichería El Muelle"), y los nombres y textos
de las reseñas por otros inventados. **Si se rehacen las capturas, repetir la
sustitución** — el procedimiento está en la cabecera de `PanelShowcase.js`.

Dos cosas que costaron y conviene saber:

- **`loading="lazy"` + `key` para remontar = imagen en blanco.** El `key` fuerza
  el remontaje (es lo que dispara la animación de entrada), pero con lazy la
  imagen nueva empieza a cargar recién al montarse y la pestaña se queda vacía
  un instante largo. Con 142 KB en total, carga ansiosa y listo.
- **Cada captura lleva su propio `width`/`height`.** Con un alto fijo para las
  cuatro, la caja reservaba el espacio de la más larga y dejaba un hueco enorme
  bajo las cortas.

🔍 **NITIDEZ — cómo se recapturan si hace falta (aprendido a la fuerza).** Las primeras salieron blandas por DOS motivos que se suman:

1. **El capturador del navegador devuelve imágenes de 1512 px de un viewport de
   1920**, o sea que ya reduce a 0.79x antes de que toques nada. Se compensa
   poniendo `document.documentElement.style.zoom = '1.3'` antes de capturar: el
   panel se renderiza más grande y cada píxel suyo pasa a ocupar ~1.03 px de
   imagen en vez de 0.79 (~30% más detalle). Más de 1.4 ya no cabe en el
   encuadre.
2. **El marco se muestra a `maxWidth: 900`, no al ancho de la columna.** A los
   1010 px que daba la columna, una imagen de 1512 px deja 1.5 px por píxel CSS
   y una pantalla retina pide 2. A 900 px sube a 1.68. **Si alguien ensancha ese
   marco, hay que rehacer las capturas más grandes.**

⚠️ Al documentar esto en el repo: **no metas backticks dentro de un `node -e`
lanzado desde bash** — bash los interpreta como sustitución de comandos y borra
el contenido. Fue exactamente lo que pasó al escribir esta sección.

⚠️ **Limitación conocida:** las capturas están en **español**. Con el landing en
inglés, el panel de la imagen sigue en español. Se asume (el mercado es Perú); si
alguna vez pesa, hay que tomar un segundo juego con el panel en inglés y elegir
por idioma.

### 23.8 — El panel en móvil (revisado el 2026-08-16 a 390 px)

Nunca se había mirado en un ancho de teléfono. Se revisó a 390 px y salieron
tres cosas, todas arregladas:

1. **Las pestañas de la ficha de negocio ocupaban TRES filas.** Son ocho y
   estaban con `flexWrap:'wrap'`, así que empujaban el contenido media pantalla
   hacia abajo. Ahora es una sola fila deslizable (`nowrap` + `overflow-x:auto`),
   con `flexShrink:0` en cada botón — sin eso se comprimen en vez de desbordar y
   el texto se parte. En escritorio caben todas y el scroll ni aparece.
2. **La cabecera del negocio se amontonaba**: rating, total de reseñas y el
   botón de escanear en una fila que no cabía; el botón se partía en dos líneas
   y el aviso en otras dos. Resuelto con `flexWrap` + `rowGap`.
3. **Las tres tarjetas del Resumen quedaban 2+1**, con un hueco al lado de la
   tercera que parecía un error de maquetación. El `minmax` pasó de 160 a
   **220 px**: en móvil da una columna limpia y en escritorio siguen las tres en
   fila.

✅ Lo que YA estaba bien: el cajón lateral con hamburguesa, los grupos del menú,
y **cero desborde horizontal** en las tres pantallas revisadas.

🔧 **Cómo revisar móvil sin teléfono ni emulador.** El emulador de Android **no
arranca en esta máquina**: CPU AMD sin el *Android Emulator hypervisor driver*
(AEHD) instalado — se instala desde Android Studio → SDK Tools, es un driver de
sistema. Mientras tanto, la vía que funciona es meter la página en un **iframe de
390 px** desde la consola del navegador: las media queries responden al viewport
del iframe, así que es una prueba real, no una simulación. Ojo: el iframe debe
apuntar al MISMO origen para que la sesión de `localStorage` valga.

⚠️ Y el tropiezo de siempre: `next start` sirve una build donde `NEXT_PUBLIC_*`
ya está **incrustado**. Para apuntar el frontend local al backend de producción
hay que usar `next dev` con la variable, o rehacer la build — con `next start` a
secas sale "Sin conexión al servidor".

---

## Sesión 2026-08-16 — §24. Canal único de alerta (solo correo) + app Android

**Decisión de producto del usuario: Notoria avisa por CORREO y por nada más.
Quien quiera un aviso que suene, instala la app de Android.**

### Qué se eliminó y por qué

| Se fue | Dónde vivía |
|---|---|
| **Telegram** | `POST /api/auth/telegram`, `enviarAlertaTelegram()` en `alerts/notificador.js`, el toggle + Chat ID en `dashboard/configuracion`, `TELEGRAM_BOT_TOKEN` |
| **WhatsApp como canal de alerta** | `src/lib/whatsappMeta.js` y `scripts/prueba-whatsapp-meta.js` (**borrados**), la escalación de urgencias del worker, todas las `META_WHATSAPP_*` |

Motivo: eran tres integraciones que fallan cada una por su cuenta (token de bot,
plantilla aprobada por Meta, ventana de 24h que **no aplicaba** a alertas
proactivas — error 131047) para entregar exactamente el mismo texto que el
correo. El correo se queda porque no depende de nadie más.

`revisarEscalacionesUrgentes()` sigue existiendo: ahora manda un **recordatorio
por correo** de las reseñas de ≤2★ sin responder tras 24h. Llama a
`enviarAlertaEmail()` directo y **no** a `notificar()`, a propósito: ese aviso no
debe filtrarse por `prefsAlertas.frecuencia` (quien eligió resumen semanal igual
quiere enterarse de una reseña de 1★ que lleva un día sin contestar).

⚠️ **La columna `Usuario.telegramChatId` sigue en la BD.** Nadie la lee ni la
escribe y está marcada como obsoleta en `schema.prisma`; borrarla exige
`prisma db push --accept-data-loss` contra producción, que es decisión del dueño.

### Dónde se tocó el texto de cara al cliente

Planes del panel (ES+EN), landing (`app/page.js`: features, 3 planes, tabla
comparativa —se cayó la fila "Alertas al instante por"—, FAQ), el **FAQ
duplicado en el JSON-LD de `layout.js`** (mantenerlos en sincronía), `lib/catalogo.js`,
`components/MockupsLanding.js`, `privacidad` (se quitó "número de chat de
Telegram" de los datos recopilados), `lib/blog.js` y los correos de bienvenida y
drip. "Soporte prioritario por WhatsApp" → "por correo". **El botón de ventas de
WhatsApp y los datos de `/contacto` se quedan**: eso es contacto comercial, no
canal de alerta.

### La app Android

`C:\Users\Admin\Downloads\NotoriaApp` — Kotlin + Jetpack Compose, paquete
`com.notoria.app`, cliente de **este mismo API** (sin lógica de negocio
duplicada ni base local). Tiene su propio README con el detalle. Cubre login,
registro, recuperar contraseña, resumen, negocios (buscar en Google Maps, crear,
eliminar), detalle con pestañas (Resumen · Reseñas con IA · Comentarios ·
Competencia · Ajustes), alertas y sus preferencias, menciones, competencia
consolidada, reportes, planes, facturación con PDF del comprobante, conexiones y
configuración.

Lo que hay que saber al tocarla:
- **Sondea `/api/alertas` cada 15 min con WorkManager** y publica notificaciones
  del sistema. No usa FCM: obligaría a un proyecto de Firebase y a guardar un
  token por dispositivo acá. El escaneo del servidor corre como mucho cada hora,
  así que el retraso real lo pone el escaneo, no el sondeo.
- **El primer arranque no notifica el histórico** (marca en 0 = "recién entré"),
  y abrir la pantalla de Alertas también adelanta la marca, para que el sondeo no
  vuelva a avisar por la barra de estado algo ya leído dentro de la app.
- **Pago y OAuth salen al navegador** (Custom Tabs): Culqi tokeniza la tarjeta en
  su propio formulario y meterla en la app obligaría a cumplir PCI-DSS.
- Los 403 por plan y los 404 de "función no disponible" se muestran como lo que
  son (límite del plan / la función no existe para ti), nunca como error de red.

### 24.1 Google Cloud: lo que estaba mal y el bloqueo real de GBP (2026-08-16)

**El proyecto de Google Cloud de Notoria es "My First Project"** (id
`project-f1e03c17-f209-453e-a09`, **número 798376364749**), en la cuenta
**didierprincipe@gmail.com**. Ese número es el prefijo del `GOOGLE_CLIENT_ID` de
Railway: así se identifica cuál es. ⚠️ **`padkar4@gmail.com` NO tiene acceso** —
con esa cuenta la consola responde "Necesitas acceso adicional" o **cae en otro
proyecto sin avisar**, que es la forma más fácil de perder media hora.

Arreglado:
- Nombre de la app OAuth `brandshield` → **Notoria**. El cliente lo veía tal cual
  en la pantalla de consentimiento ("Ir a brandshield").
- Se llenaron página principal, privacidad y condiciones (estaban vacías) y se
  agregó el redirect URI de desarrollo
  `http://localhost:3000/api/auth/google-business/callback`, que el backend usa
  por defecto en local (`GOOGLE_REDIRECT_URI` sin setear) y daba
  `redirect_uri_mismatch`.
- 🔴 **La app OAuth estaba en modo PRUEBA**, o sea que **solo el único usuario de
  prueba podía usar "Continuar con Google" o conectar Google Business**: todo
  cliente real quedaba bloqueado y nadie lo había notado porque el dueño ERA el
  usuario de prueba. Pasada a **En producción**.
- Se declaró `.../auth/business.manage` en *Acceso a los datos*. **Google lo
  clasifica como NO sensible**, así que no hay verificación de app que hacer ni
  pantalla de "app no verificada" — al revés de lo que se suele suponer.

🔴 **El bloqueo que queda NO es código.** `mybusinessaccountmanagement` y
`mybusinessbusinessinformation` **no estaban habilitadas** (ya se habilitaron),
pero quedan con **cuota `Requests per minute = 0`**, que es la señal documentada
de que **Google no ha concedido acceso a las GBP APIs**; y
`mybusiness.googleapis.com` (la v4 que lee y responde reseñas, `GBP_BASE` en
`google-business.scraper.js`) **ni aparece en la Biblioteca**. Con cuota 0, el
callback autoriza y después revienta en `listarCuentas` → el usuario ve
`?gbp_error=callback_failed`. **Solicitud de acceso enviada el 2026-08-16, caso
de asistencia `3-5553000040900`, plazo informado de 7 a 10 días hábiles.** Al
aprobarse: comprobar que la cuota deje de ser 0, habilitar
`mybusiness.googleapis.com` y recién ahí probar el flujo entero.

**Places API sí está habilitada y en uso** en ese mismo proyecto (71 llamadas y 0
errores el día de la revisión), así que la búsqueda de negocios y el escaneo de
reseñas públicas no dependen de nada de lo anterior.

**Cuando exista el correo de la empresa:** agregarlo como **propietario** del
proyecto, cambiarlo en *Información de la marca → correo de asistencia* y en
*Información de contacto del desarrollador*, y **recién después** quitar la
cuenta personal. Borrar la personal antes se lleva por delante el proyecto que
contiene el client ID que está en producción.

### 24.2 Pendientes que dejó esta sesión

- ⏳ Borrar la columna obsoleta `Usuario.telegramChatId` (exige
  `prisma db push --accept-data-loss` contra prod — decisión del dueño).
- ⏳ Acceso a las GBP APIs (caso `3-5553000040900`) y verificación del Perfil de
  Empresa de `didierprincipe@gmail.com`.
- ⏳ La app Android: `targetSdk` 34 no pasa el filtro de Play, falta keystore de
  release, ficha de tienda y decidir **planes informativos vs Play Billing**
  (Play exige su facturación para suscripciones digitales; hoy el botón
  "Contratar plan" abre el checkout web). Detalle en `PENDIENTES.md` del repo
  `adi211104/APKNotoria`.

### 24.3 Correo de la empresa: `usenotoria@gmail.com` (2026-08-17)

El dueño creó **`usenotoria@gmail.com`** como cuenta de la empresa, para dejar de
depender de `didierprincipe@gmail.com`, que es personal. **Todavía no se migró
nada**: todo sigue operando con el correo viejo.

🔴 **Orden obligatorio en Google Cloud, o se pierde el proyecto:** agregar
`usenotoria@` como **propietario** del proyecto `798376364749` → cambiarlo en
*Información de la marca → correo de asistencia* y en *Información de contacto
del desarrollador* → **y recién entonces** quitar la cuenta personal. Borrar la
personal antes se lleva el proyecto que contiene el `GOOGLE_CLIENT_ID` que está
en producción, y con él el inicio de sesión con Google y la conexión de Google
Business de todos los clientes.

Confirmado que hoy usan el correo viejo: **Google Cloud** (proyecto y OAuth), el
**caso `3-5553000040900`** de acceso a las GBP APIs —la respuesta de Google llega
a ese buzón, así que conviene no perderlo de vista hasta que aprueben—, el
**Perfil de Empresa en Google** (con su verificación aún pendiente) y **Railway**
(sesión `didierprincipe@gmail.com`). Falta revisar con qué correo están
**Vercel** y **GitHub** (usuario `adi211104`), **Culqi**, **Resend**, **Groq**,
**Meta/Instagram**, **TikTok Developers** y **Search Console**.

📌 **Play Console todavía no existe: abrirla directamente con `usenotoria@` y
como organización.** Mover después una app de cuenta personal a cuenta de empresa
es un trámite formal de transferencia con Google.

### 24.4 La app ya no vende: los planes salen a la web (2026-08-17)

La app Android **eliminó su pantalla de planes**. "Planes y precios" y todos los
avisos de "esto es de plan superior" abren `usenotoria.app/precios`. Motivo:
Google Play cobra comisión sobre las suscripciones digitales compradas dentro de
la app, y el cobro ya vive en la web con Culqi.

**Consecuencia para este repo:** `/precios` pasa a ser la única pantalla de venta
del producto y ahora también recibe tráfico desde la app. Si se le cambia la ruta
o se la renombra, **se rompe el botón de la app** (`abrirPlanes()` en
`Navegacion.kt` del repo `adi211104/APKNotoria`). Los precios ya no están
duplicados en el cliente Android: `lib/precios.js` vuelve a ser la única fuente.

### 24.5 El correo era la MISMA cuenta, y la verificación de marca falló por el landing (2026-08-17)

**`usenotoria@gmail.com` no es una cuenta nueva: es la misma, renombrada.**
Verificado en `myaccount.google.com`: *Dirección de la Cuenta de Google* =
`usenotoria@gmail.com`, recuperación `padkar4@gmail.com`, y
`didierprincipe@gmail.com` quedó como dirección **alternativa** (sigue
recibiendo correo). El nombre de la cuenta ahora es "Notoria".

Por eso **no hubo migración que hacer**: IAM identifica por ID interno, no por el
texto del correo, y el proyecto `798376364749` ya lista a `usenotoria@gmail.com`
como Propietario. Lo mismo vale para el caso `3-5553000040900`. Lo único que sí
había que corregir a mano, porque son cadenas guardadas: el **correo de asistencia
del OAuth** (era el que veía el cliente en la pantalla de consentimiento) y el
contacto del desarrollador. Ambos ya en `usenotoria@gmail.com`. Los servicios que
no son de Google (Railway, Vercel, GitHub, Culqi, Resend, Groq, Meta, TikTok)
guardan el correo viejo como texto y **no se rompe nada**, porque esa dirección
sigue entregando en el mismo buzón: cambiarlos es identidad de marca, no urgencia.

🔴 **VERIFICACIÓN DE MARCA FALLIDA — y la culpa es de este repo, no de la
consola.** Al pasar la app OAuth a producción, Google pide verificar la
información de marca antes de mostrarla a los usuarios. La verificación corrió y
devolvió un solo problema: *"En la página principal, no se explica el propósito
de la app"*. La causa está medida: **`https://usenotoria.app` sirve 38 caracteres
de texto en el HTML** (solo el `<title>`; la `<meta name="description">` sí está,
pero el cuerpo va vacío). Es exactamente el efecto ya documentado de que
`app/page.js` sea `'use client'`: el contenido aparece recién cuando corre el
JavaScript, y el robot de Google no lo ve.

**Arreglo propuesto:** convertir `app/page.js` en **componente de servidor** que
renderice un bloque descriptivo real (encabezado + párrafo explicando qué hace
Notoria) y dentro monte el landing cliente actual. No es solo para Google: la
misma carencia es la que castiga el SEO (ya anotado como pendiente) y la que mira
Google Ads al revisar la página de destino. Después hay que volver a *Google Auth
Platform → Información de la marca → Verificar la marca*. **Mientras no pase, la
pantalla de consentimiento no muestra "Notoria" ni los enlaces a los usuarios.**

**Estado fiscal verificado el mismo día:** en Railway `SUNAT_EMISION_ACTIVA=true`
y `SUNAT_ENTORNO=produccion`, con certificado y credenciales SOL cargadas — o sea
que la emisión real **ya está encendida**. Consulta de solo lectura contra la BD
de producción: **0 comprobantes y 0 pagos exitosos**. Traducción: el primer
cliente que pague va a ser también la primera factura real que se le manda a
SUNAT. Conviene probar ese circuito antes de gastar en publicidad, no después.

### 24.6 El landing servía 38 caracteres: causa, arreglo y verificación (2026-08-17)

**Causa exacta.** `app/page.js` tenía, justo antes del `return`:

```js
if (cargando) return (<div style={{minHeight:'100vh'...}}><spinner/></div>);
```

`cargando` viene de `useAuth()` y **arranca en `true`**. En el render de servidor
no hay `localStorage` ni efectos, así que Next prerenderizaba **solo el spinner**:
`usenotoria.app` servía 38 caracteres de texto (nada más que el `<title>`).
Ojo con el diagnóstico, porque es contraintuitivo: **`'use client'` NO impide el
render en servidor** — Next igual genera el HTML inicial de los componentes de
cliente. Lo que lo impedía era este guard. Buscar `animate-spin` en el HTML
servido es lo que lo delató.

**Arreglo.** Se eliminó el guard y `loggedIn` pasó a `!cargando && !!usuario`. El
landing no necesita la sesión para renderizarse: lo único que depende de ella es
el botón del nav, que mientras carga muestra la versión de invitado — correcto
para la inmensa mayoría del tráfico de una página de ventas. Resultado medido:
**9.053 caracteres** de copy real en el HTML, empezando por el hero.

**Qué destrabó.** (1) La **verificación de marca del OAuth**, que había fallado
con *"En la página principal, no se explica el propósito de la app"*: al
reintentarla pasó, y quedó **publicada** — la consola confirma *"Se verificó la
información de tu marca y se muestra a los usuarios"*, así que el cliente ya ve
"Notoria" y los enlaces en la pantalla de consentimiento de Google. (2) El SEO
del landing, que estaba en cero por el mismo motivo. (3) La revisión de la página
de destino de Google Ads, que también lee el HTML.

⚠️ **Regla:** no volver a poner un "cargando" global sobre una página pública.
Si hace falta esperar la sesión, que espere solo el trozo que la usa.
`/precios` ya lo hace bien (sirve 5.315 caracteres).

---

## Sesión 2026-08-17 — §25. Auditoría completa: seguridad, ciclo de cobro, detector y tres funciones nuevas

Revisión de todo el repositorio + la API en producción + la web en vivo. Salieron
tres problemas de fondo que no se veían desde la pantalla, y de ahí salieron tres
funciones nuevas que se apoyan en datos que ya se estaban pagando.

**Todo lo de esta sección está desplegado y verificado en producción el 2026-08-17.**
Backend en Railway, frontend en Vercel. **Sin ningún cambio de schema:** nada de
esto necesita `prisma db push`.

Los dos informes de la auditoría están en `docs/`:
- `docs/auditoria-notoria.html` — los hallazgos, cada uno con archivo y línea
- `docs/ideas-notoria.html` — nueve ideas de producto, con su costo y su porqué

### 25.1 — 🔴 S1: cualquier cuenta gratuita podía escanear TODA la plataforma

`POST /api/utils/monitoreo-manual` aceptaba el cuerpo vacío. Sin `negocioId` se
saltaba el bloque del cooldown **entero** y llamaba a `ejecutarAhora(null)`, que
en el worker resuelve a `where: { activo: true }`: todos los negocios de todos los
clientes.

Es decir: cualquiera creaba una cuenta gratis en 30 segundos y con un POST de
cuerpo vacío disparaba una consulta a Google Places por cada ficha y cada
competidor de la base, correos de alerta a otros clientes, y auto-respuestas
publicadas en las fichas de Google de terceros. El único freno era el límite
global de 100 peticiones/15 min.

**Arreglo.** `negocioId` es obligatorio y se comprueba la pertenencia antes de
llamar al worker. Además `ejecutarAhora` ahora **exige `{ global: true }`** para
el barrido completo, para que un `undefined` que se cuele no vuelva a bastar;
`scripts/escanear.js` lo pasa explícito.

⚠️ **Regla:** si algún día hace falta un escaneo global, va en un script de
terminal. Nunca detrás de una sesión de usuario.

### 25.2 — El ciclo de cobro estaba roto en las dos direcciones

Tres fallos que se tapaban entre sí:

| | Qué pasaba |
|---|---|
| **F1** | Un cargo rechazado hacía `suscripcionActiva: false` sin reintento y sin avisar. Y como la consulta exige `suscripcionActiva`, al día siguiente ese usuario **ya no volvía a entrar**: un bloqueo del banco de 24 h costaba el cliente entero |
| **F2** | La consulta filtraba `fechaVencimiento` entre el inicio y el fin de HOY. Cualquier día que el cron no corriera (deploy a las 5:00, reinicio de Railway), esos vencimientos quedaban atrás **para siempre** |
| **F3** | `plan` no bajaba **nunca** a GRATIS, y `suscripcionActiva:false` no bloquea nada por sí solo — `verificarPlan` solo mira `plan`, y `requiereSuscripcion` no se usa en ninguna ruta. Quien dejaba de pagar conservaba su plan completo indefinidamente |

**Arreglo.** Tres intentos repartidos cada 3 días, con correo en cada uno
(`enviarCobroFallido`); se cobra todo lo vencido y no solo lo de hoy; y al agotar
los intentos el plan baja de verdad. Cron nuevo `iniciarBajadaDePlanes` (5:30 AM)
para quien canceló y ya terminó su periodo pagado.

**Los intentos se cuentan con las filas de `Pago` en estado `FALLIDO` posteriores
al último `EXITOSO`** — por eso no hizo falta ninguna columna nueva. Efecto
secundario bueno: los intentos fallidos salen en la pantalla de Facturación del
cliente, que es justo donde tiene que verlos.

El nuevo vencimiento se calcula **desde el anterior**, no desde hoy, para que un
cobro retrasado por reintentos no le coma días de servicio ni le corra el
aniversario en cada renovación.

### 25.3 — F5: cancelar no existía, pero la página legal decía que sí

`/devoluciones` dice textualmente *«desde tu panel, en **Configuración →
Suscripción**»* y el FAQ del landing lo repite. Esa sección no existía y no había
endpoint. Una obligación publicada en la página legal que el producto no cumplía,
con un Libro de Reclamaciones montado al lado.

Ahora existe `POST /api/pagos/cancelar` y la sección **Suscripción** en
Configuración, con ese nombre exacto. Cancelar apaga la renovación y **conserva el
plan hasta el final del periodo pagado**, que es lo que promete la página.

### 25.4 — El detector corría con dos de las cinco señales que anunciaba

El FAQ prometía «cuentas recién creadas, autores con una sola reseña, texto
repetitivo o duplicado y picos inusuales». La realidad:

| Señal anunciada | Estado |
|---|---|
| Cuentas recién creadas | **Imposible.** `detector.js` la evalúa sobre `autorResenasTotal`, y las cinco fuentes lo escriben `null` (google, facebook, google-business, tripadvisor, público). `CUENTAS_NUEVAS` nunca se ha creado |
| Texto repetitivo | **No estaba implementado** |
| Picos inusuales | Pedía ≥5 negativas en 24 h, pero **Places entrega 5 reseñas COMO MÁXIMO** |
| Palabra crítica · 1★ sin texto | Funcionaban. Eran las dos únicas |

Y **F7:** `CAIDA_RATING` comparaba contra `googleRatingBase`, que se fija al crear
el negocio y no se actualiza nunca: en cuanto el rating caía 0.3 la alerta se
recreaba **cada 4 horas, para siempre**, con el mismo texto. El cliente aprendía a
ignorar los correos de Notoria, que es lo peor que le puede pasar a un producto de
alertas. Ahora compara contra el snapshot anterior.

**Lo que se agregó:**

- **Texto duplicado.** Normaliza tildes, signos y mayúsculas (una campaña pegada
  casi nunca es idéntica carácter a carácter) y exige 15 caracteres mínimos para
  no marcar «malo» o «no vuelvo», que mucha gente escribe por su cuenta.
- **Ráfagas por volumen** (`compararMediciones` + `ritmoHabitual`). No depende de
  leer reseñas: compara el **total de reseñas** entre dos mediciones —un entero
  exacto, sin margen de error— contra el ritmo habitual del propio negocio sacado
  del historial de snapshots. Umbral relativo a propósito: 6 reseñas en 4 horas es
  una catástrofe para quien recibe 2 al mes y un martes normal para quien recibe
  15 a la semana.

⚠️ **Sobre el promedio de las reseñas nuevas — leer antes de tocarlo.** Se puede
despejar de `(R2*N2 - R1*N1)/k`, pero Google **redondea el rating a un decimal**,
así que el margen queda en `0.05*(N1+N2)/k`. En una ficha de 212 reseñas con 8
nuevas eso es **±2.7 estrellas**: el número no significa nada. Por eso la alerta
dice el promedio exacto solo si el margen ≤ 0.5; si no, la **cota superior**
(«calificaron 2.1★ como mucho»), que es rigurosamente cierta pase lo que pase con
el redondeo; y si tampoco, solo la caída publicada. **Nunca un número inventado:
una sola cifra falsa desacredita todas las demás alertas.**

### 25.5 — F4: el escaneo no miraba el plan

Había **un solo cron cada 4 horas** para todos los negocios. Rompía la oferta en
las dos direcciones:

- Franquicia paga S/179 por «un ataque se detecta en máximo 1 hora» y recibía 4.
- Gratis anuncia 24 horas y recibía 4, o sea **seis veces más consultas a Places
  de las prometidas**: ~180 al mes por negocio en vez de ~30, más las de su
  competidor. Cada cuenta gratuita costaba seis veces lo que debía.

Ahora el cron corre **cada hora** y elige a quién le toca según `HORAS_ESCANEO`
(Gratis 24 · Negocio 4 · Franquicia 1). El cooldown del botón «Escanear ahora» se
importa de esa misma constante en vez de repetir los números.

### 25.6 — Tres funciones nuevas, ninguna con costo nuevo

**P1 · Vigilancia de la ficha de Google.** Notoria vigilaba lo que la gente
escribe, pero no la ficha en sí — y Google Maps deja que **cualquiera** sugiera
que un local cerró. Un restaurante que aparece «Cerrado permanentemente» un
viernes pierde el fin de semana entero y se entera días después.

`business_status` se lee en la misma consulta a Place Details que ya se hacía: va
en el grupo **Basic Data**, que esa llamada ya paga por pedir `reviews`/`rating`,
**así que no cambia la factura**. El aviso se manda con `enviarAlertaEmail`
directo y no por `notificar()`: ninguna preferencia debería poder silenciar «tu
local aparece cerrado». Mismo criterio que la escalación de urgencias.

⚠️ Va como `RESENA_MUY_NEGATIVA` por falta de un tipo propio: añadir un valor a
`TipoAlerta` obliga a un `prisma db push`, **y Railway no lo corre en el deploy**,
así que desplegar el enum nuevo sin haberlo empujado antes tumbaría la API. El
tipo natural es `FICHA_ALTERADA` cuando se haga ese push.

**I1 · El espejo** (`GET /api/negocios/:id/espejo`). El monitoreo pide
`reviews_sort: 'newest'`, correcto para vigilar, pero **no es lo que ve un
cliente**: por defecto Google ordena por relevancia y le enseña otras cinco.
Probado contra una ficha real: las cinco que veía el público eran de hace 1, 3, 4,
6 y 10 meses. El dueño llevaba meses respondiendo lo más reciente mientras su
ficha la encabezaba otra cosa. Pestaña **«Cómo te ven»** en el panel, que además
marca cuáles siguen sin respuesta.

**I2/P3 · El simulador** (`src/lib/rating.js`, `GET /api/negocios/:id/simulador`).
Aritmética pura, sin red y sin base: cuántas reseñas de 5★ faltan para cada meta,
cuántas de 1★ hacen falta para caer por debajo de 4.5★ y cuánto mueve el rating
una sola de 1★. Va en el panel **y en el analizador gratuito del landing**, que
hasta ahora, cuando no había nada sospechoso —o sea casi siempre— decía «no
detectamos patrones de ataque» y dejaba ir al visitante sin motivo para
registrarse.

### 25.7 — Seguridad: el resto

| | Qué era |
|---|---|
| **S2** | La web no mandaba **ninguna** cabecera de seguridad (el backend sí, vía helmet). Sin CSP, sin X-Frame-Options, sin nosniff, sin Referrer-Policy — y el token de sesión vive en `localStorage`. Se agregó `headers()` en `next.config.ts` |
| **S3** | El OAuth de Google Business firmaba el state con el `negocioId` que llegara por query **sin comprobar el dueño**, y el callback escribía sin filtrar por usuario: con un id ajeno se le pisaban los tokens de GBP a otro cliente |
| **S4** | Registro y login no normalizaban el correo pero `recuperar-password` sí. Como el `@unique` de Postgres distingue mayúsculas, quien se registrara como `Juan@correo.com` **no podía recuperar su contraseña nunca**. Las búsquedas pasan a ser insensibles a mayúsculas para no dejar fuera a las cuentas ya creadas |
| **S5** | `/api/auth/google` no miraba `email_verified` antes de enganchar el `googleId` a una cuenta existente |
| **S7** | Dos borrados que daban 500. El de competidores no borraba sus snapshots (FK RESTRICT), así que **tras el primer ciclo del worker ningún competidor se podía eliminar**. El de cuenta no tocaba `pagos` ni `comprobantes`, así que fallaba para cualquiera que hubiera pagado |
| **S8** | El QR de reseñas se pedía a `api.qrserver.com`, mandándole a un tercero el enlace de cada cliente. Ahora se genera en el navegador con `qrcode` |
| **S9** | `detector.js` abría un segundo `PrismaClient` en vez de usar el singleton |

⚠️ **Borrado de cuenta: ahora ANONIMIZA cuando hay historial fiscal.** El XML
firmado y el CDR se conservan 5 años, así que un cliente no puede hacer
desaparecer la contabilidad de la empresa pidiendo la baja. Si nunca pagó, se
borra de verdad. Es lo que permite la Ley 29733: el derecho de supresión cede ante
una obligación legal de conservación, y lo correcto es conservar lo justo y
disociar el resto.

### 25.8 — El landing decía cosas que el código no hacía

Se quitaron las promesas sin respaldo y se anunciaron las que sí existen:

- **«historial 7 / 90 días / ilimitado»** — no había retención ni gating por plan.
- **«reportes PDF semanales» (Franquicia)** — solo existe el mensual.
- **«panel ejecutivo multi-sede»** — no había vista distinta; se renombró a lo que
  sí es cierto: Franquicia no tiene tope de negocios.
- **«identifica cuentas nuevas»** y el FAQ de detección — describían cuatro
  señales de las que dos no existían.

Tocados: `page.js` (ES y EN), `lib/catalogo.js` (el catálogo de `/precios`) y
`dashboard/planes/page.js`.

⚠️ **Regla, anotada también en el propio archivo:** si una función no la ejecuta
el worker, **no entra al landing**. Es la hermana de la regla que ya existía para
las cifras («si no tiene URL pública que la sostenga, no entra»).

### 25.9 — Pendientes que deja esta sesión

> ⚠️ **Lista superada** — la vigente está en §26.4. Se conserva por historia.

Nada de esto bloquea lo que ya está desplegado.

- [ ] **S6 — cambiar la contraseña no cierra las sesiones abiertas.** El JWT dura
      7 días y no hay `tokenVersion`. Es el único hallazgo de la auditoría que
      **exige un cambio de schema**, y por eso quedó fuera: Railway no corre
      `prisma db push` en el deploy, así que hay que empujarlo a mano ANTES de
      desplegar el código que lo use. Severidad baja.
- [ ] **Tipo de alerta `FICHA_ALTERADA`.** Mismo motivo: es un valor nuevo del
      enum `TipoAlerta`. Hoy la alerta de ficha cerrada viaja como
      `RESENA_MUY_NEGATIVA` (ver §25.6).
- [ ] **Vigilar también horario y teléfono de la ficha.** `opening_hours` y
      `formatted_phone_number` son del grupo **Contact Data**, que sí tiene costo
      extra por llamada. Conviene encenderlo **solo en planes de pago** — y de
      paso da una diferencia real entre planes, que es de lo que falta.
- [ ] **Revisión visual de la pestaña «Cómo te ven» en móvil (390 px).** Se
      verificó en escritorio con datos reales; el móvil quedó sin mirar.
- [ ] **Las cinco ideas restantes** del informe: el enlace de venta por negocio
      (`/para/<ficha>`), el afiche imprimible para la pared del equipo, la
      constancia de reputación verificable, sub-usuarios y modo agencia, y el
      ranking «quién más subió este mes». Ver `docs/ideas-notoria.html`.

### 25.10 — Cómo se desplegó

```bash
# Backend
cd brand-shield && railway up --service api --detach

# Frontend (NEXT_PUBLIC_* se incrusta en el BUILD, ver §21)
cd brand-shield-web && vercel --prod --yes
```

Verificado en vivo tras el deploy: `/health` responde OK, el escaneo global
devuelve 401 sin token, el analizador público ya trae el simulador, y
`usenotoria.app` sirve CSP + X-Frame-Options + nosniff + Referrer-Policy +
Permissions-Policy + HSTS.

---

## Sesión 2026-08-17 (tarde) — §26. El afiche de la pared, y una regresión propia

Continuación de §25. **Desplegado y verificado en producción.** Sin cambios de
schema.

### 26.1 — 🔴 Regresión introducida en §25.5 y corregida el mismo día

El escaneo por plan hizo que el cron escribiera `ultimoEscaneo`… que es **el reloj
del botón «Escanear ahora» del panel**, no el del cron. A un plan Gratis el cron
le pisaba la marca cada 24 h, así que el botón le salía en cooldown **siempre**,
sin haberlo usado nunca.

**Arreglo.** El cron usa su propio reloj: la fecha del **último `Snapshot`** del
negocio, que ya se crea en cada escaneo. Es el registro real de «cuándo se miró
esta ficha por última vez», no hace falta columna nueva, y deja los dos relojes
independientes. Se resuelve con un solo `groupBy` en vez de una consulta por
negocio.

⚠️ **Única excepción:** un negocio **sin ficha de Google** nunca genera snapshot,
así que no tiene ese reloj. Para esos —y solo esos— el cron sigue marcando
`ultimoEscaneo`; si no, se escanearían cada hora machacando TikTok o Instagram.

⚠️ **Regla:** `ultimoEscaneo` es del botón manual. Si el cron necesita saber
cuándo escaneó, que lo saque de `Snapshot`.

### 26.2 — El afiche de la pared (idea I5)

`src/utils/afiche.generator.js` + `GET /api/negocios/:id/afiche.pdf`, con el botón
en la pestaña «Cómo te ven».

Un A4 para **imprimir y colgar donde trabaja el equipo**: la nota de Google a
96 pt, las reseñas nuevas, las que faltan por responder, y **una sola cosa** en la
que enfocarse esta semana.

Existe porque el patrón de abandono de cualquier herramienta de monitoreo es que
el dueño entra la primera semana, se emociona, y a los veinte días deja de entrar.
Eso no se arregla con más notificaciones — se arregla **saliendo de la pantalla**.
Un papel colgado donde trabajan quince personas hace más por el uso del producto
que otra alerta que nadie abre.

**El foco se elige solo, por prioridad:** ficha cerrada → críticas sin responder →
rating bajando → la queja que más se repite → pocas reseñas → todo bien. Devolver
varias cosas sería devolver ninguna.

La queja sale de un **diccionario de temas** (demora, trato, temperatura,
limpieza, precio, porción) y no de la IA, por dos razones: tiene que ser
explicable al dueño («salió porque cuatro reseñas dicen "demora"») y no puede
costar una llamada a Groq por cada afiche. Exige **2 menciones mínimo**: con una
sola no es «lo que más se repite», es una opinión suelta.

⚠️ **Trampa que costó una iteración — anotada también en el archivo:** nada de
★ (U+2605) ni de ningún carácter fuera de **WinAnsi** en un PDF con fuentes
estándar. PDFKit dibuja un **`&` literal** en su lugar. Se vio en el primer
afiche: *«2 reseñas de 3& o menos»*. El reporte mensual nunca lo pisó porque no
usa estrellas en el texto. Para meter ★ de verdad haría falta empaquetar un `.ttf`
y llamar a `doc.registerFont` — peso y mantenimiento a cambio de un adorno. El
archivo lleva un sanitizador (`seguro()`) como red de seguridad.

### 26.3 — Ajuste en el espejo

El aviso rojo de «sin responder» se reserva ahora para las reseñas **de 3★ o
menos**. Marcar en rojo un 5★ sin respuesta era ruido —nadie contesta todos los
elogios— y hacía que el resumen de arriba («1 reseña crítica sin responder»)
pareciera equivocado al ver cinco insignias rojas debajo.

### 26.4 — Pendientes actualizados

> ⚠️ **Lista superada** — la vigente está en §27.6. Se conserva por historia.

Reemplaza la lista de §25.9.

**Exigen `prisma db push` a mano** (Railway no lo corre en el deploy, así que hay
que empujar el schema ANTES de desplegar el código que lo use):

- [ ] **S6 — `tokenVersion`.** Cambiar la contraseña no cierra las sesiones
      abiertas: el JWT dura 7 días y no hay forma de invalidarlo. Severidad baja.
- [ ] **Tipo de alerta `FICHA_ALTERADA`.** Hoy la alerta de ficha cerrada viaja
      como `RESENA_MUY_NEGATIVA` (§25.6), que además la deja expuesta al filtro de
      preferencias si alguien apaga ese tipo.

**Cuestan dinero o son decisión de negocio:**

- [ ] **Vigilar horario y teléfono de la ficha.** `opening_hours` y
      `formatted_phone_number` son del grupo **Contact Data**, con costo extra por
      llamada. Encenderlo solo en planes de pago, que además da una diferencia
      real entre planes.
- [ ] **Sub-usuarios y modo agencia (idea I5 del informe).** Es el cambio que abre
      el ticket más alto —una agencia con 15 restaurantes paga lo que 15 dueños
      sueltos no pagarían— pero necesita tabla de miembros con rol y tocar todos
      los `findFirst({ usuarioId })`. Decisión de producto, no solo código.

**Se pueden hacer, pero necesitan tiempo o datos:**

- [ ] **Ranking «quién subió más este mes».** La ventaja es que solo se puede
      calcular con historial propio, pero por eso mismo hace falta acumular meses
      de snapshots antes de que diga algo.
- [ ] **Enlace de venta por negocio (`/para/<ficha>`).** Landing personalizada
      para prospección por WhatsApp. Debe ir **sin indexar** y borrarse a petición:
      es material comercial dirigido a una persona, no una ficha publicada sobre
      un tercero.
- [ ] **Constancia de reputación verificable.** PDF con código consultable, para
      cuando un mall o un franquiciante lo pide. Se puede firmar con HMAC sin
      guardar nada (mismo truco que `lib/oauthState.js`), así que tampoco
      necesitaría schema.

**Verificación que quedó sin hacer:**

- [ ] **Revisión visual de «Cómo te ven» y del afiche en móvil (390 px).** No se
      pudo: la ventana del navegador estaba maximizada y no aceptaba el resize
      —`window.innerWidth` seguía en 1920 tras varios intentos—. Lo que sí se
      comprobó por código: la barra de pestañas ya tenía `overflowX:auto` con
      `flexShrink:0`, así que la pestaña nueva no la desborda; y el resto del
      bloque usa `repeat(auto-fit,minmax(...))` y `flexWrap`, sin anchos fijos.

### 26.5 — Cómo se desplegó

Igual que §25.10: `railway up --service api --detach` y `vercel --prod --yes`.
Verificado tras el deploy: `/health` OK, el afiche responde 401 sin token, y el
landing sirve 200.

---

## Sesión 2026-08-17 (noche) — §27. El enlace de venta `/para/<ficha>`

Continuación de §26. **Desplegado y verificado en producción.** Sin cambios de
schema.

### 27.1 — Qué es

`usenotoria.app/para/<slug>~<placeId>` — la landing que se le manda a **un**
prospecto por WhatsApp. En vez del discurso genérico, abre con el nombre de SU
negocio, su rating real, cómo está frente a los vecinos de su rubro, qué reseña
vieja sigue encabezando su ficha y la aritmética de su propio rating.

**Es un Server Component, y eso no es un detalle técnico.** Media efectividad del
enlace está en que, al pegarlo en el chat, el prospecto vea una tarjeta que ya
dice el nombre de su restaurante y su nota. Eso son etiquetas Open Graph, y tienen
que estar en el HTML que sale del servidor: un componente de cliente las generaría
cuando el crawler de WhatsApp ya se fue.

Verificado en producción:
```
<title>Central Restaurante — 4.6★ en Google — Notoria</title>
<meta property="og:description" content="3498 reseñas. El promedio de tu zona es 4.4★ y el mejor está en 4.6★…">
```

El separador del segmento es `~` y no `-` **a propósito**: los place ID de Google
llevan guiones dentro (`ChIJ01sth-G3BZER…`) pero nunca una virgulilla. El slug es
decorativo, solo para que el enlace se lea bien en el chat.

### 27.2 — Los tres frenos, y por qué existen

Esto **no** es una publicación sobre un negocio ajeno: es material comercial
dirigido a una persona. Todo lo que muestra es información pública de Google Maps
—la misma que ve cualquiera que busque ese negocio, y la misma que ya devolvía el
analizador gratuito del landing— pero eso no basta como excusa para publicarlo.

1. `robots: { index: false, follow: false, nocache: true }` en la metadata, que
   es lo que de verdad lo impide, y `/para/` en Disallow del `robots.txt`, que es
   el refuerzo.
2. **Lista de bloqueo** `PARA_BLOQUEADOS` (place IDs separados por comas). Se lee
   **en cada petición**, así que retirar una ficha es cambiar una variable en
   Railway sin desplegar nada — la diferencia entre atender a alguien el mismo día
   o la semana siguiente. Responde `410`.
3. Un aviso visible al pie: de dónde salen los datos y a qué correo escribir para
   que se retire.

### 27.3 — Dos trampas que costaron una iteración cada una

**El limitador tumbaba el enlace para todo el mundo.** `publico.routes.js` aplicaba
el limitador estricto (15 cada 15 min) con `router.use`. Pero la página se
renderiza en el servidor de Vercel, así que **todas** las visitas llegan al backend
desde la misma IP — la de Vercel, no la del visitante. Con ese cupo, el enlace se
caía en cuanto se mandaba a un puñado de prospectos. Ahora el limitador estricto se
aplica **por ruta** y `/ficha` lleva el suyo (300/15min), apoyado en el caché de 6 h:
mil visitas al mismo enlace siguen siendo **una** consulta a Google.

**Los vecinos salían de otro rubro.** Para elegir el `type` de Nearby Search se
usaba «el primer tipo que no sea genérico». Google devuelve los tipos **en orden
alfabético**, así que para un restaurante llegan
`["establishment","food","point_of_interest","restaurant"]` y ese criterio elegía
**`food`** — un cajón tan amplio que la comparación de Central Restaurante salió
contra cuatro hoteles de Barranco. Un dueño que ve eso cierra la página, y con
razón. Ahora hay lista blanca por prioridad (`TIPOS_COMPARABLES`) y salen Isolina,
Cala, Rústica y Gran Chifa Chung Yion.

### 27.4 — El script, que es lo que lo hace usable

`scripts/enlaces-venta.js`. Sin esto la página no sirve para prospectar: habría
que buscar el place ID de cada negocio a mano.

```bash
cd brand-shield
node scripts/enlaces-venta.js "restaurantes Miraflores"
node scripts/enlaces-venta.js "hoteles Cusco" --paginas 3 --csv > prospectos.csv
```

Ordena por **prioridad y no alfabéticamente**: primero los que están por debajo de
4.5★ y, dentro de esos, los de más volumen — un negocio de 4.1 con 400 reseñas es
mejor prospecto que uno de 4.1 con 6, porque tiene el problema *y* tiene con qué
pagar la solución. Probado: 20 chifas de San Miguel, 19 por debajo del umbral.

Cuesta 1 llamada a Places por página de 20 negocios. **Ninguna por negocio**: el
detalle lo pide la página solo cuando el prospecto la abre.

⚠️ Los enlaces nunca salen apuntando a `localhost` aunque el `.env` local lo diga
—se mandan a otra persona—.

### 27.5 — De paso

El `robots.txt` apuntaba el sitemap a **`vigilio.app`**, el dominio anterior a la
marca Notoria. Un sitemap en un host que no responde es un sitemap que Google
descarta. Corregido a `usenotoria.app`.

### 27.6 — Pendientes actualizados

> ⚠️ **Lista superada** — la vigente está en §28.4. Se conserva por historia.

Reemplaza la lista de §26.4.

**Exigen `prisma db push` a mano** (Railway no lo corre en el deploy, así que hay
que empujar el schema ANTES de desplegar el código que lo use):

- [ ] **S6 — `tokenVersion`.** Cambiar la contraseña no cierra las sesiones
      abiertas: el JWT dura 7 días y no hay forma de invalidarlo. Severidad baja.
- [ ] **Tipo de alerta `FICHA_ALTERADA`.** Hoy la alerta de ficha cerrada viaja
      como `RESENA_MUY_NEGATIVA` (§25.6), lo que además la deja expuesta al filtro
      de preferencias si alguien apaga ese tipo.

**Cuestan dinero o son decisión de negocio:**

- [ ] **Vigilar horario y teléfono de la ficha.** `opening_hours` y
      `formatted_phone_number` son del grupo **Contact Data**, con costo extra por
      llamada. Encenderlo solo en planes de pago, que además da una diferencia
      real entre planes.
- [ ] **Sub-usuarios y modo agencia.** El cambio que abre el ticket más alto —una
      agencia con 15 restaurantes paga lo que 15 dueños sueltos no pagarían— pero
      necesita tabla de miembros con rol y tocar todos los `findFirst({ usuarioId })`.

**Se pueden hacer, pero necesitan tiempo o datos:**

- [ ] **Ranking «quién subió más este mes».** Solo se puede calcular con historial
      propio, y por eso mismo hace falta acumular meses de snapshots antes de que
      diga algo.
- [ ] **Constancia de reputación verificable.** PDF con código consultable, para
      cuando un mall o un franquiciante lo pide. Se puede firmar con HMAC sin
      guardar nada (mismo truco que `lib/oauthState.js`), así que tampoco
      necesitaría schema.

**Verificación que sigue sin hacer:**

- [ ] **Revisión visual en móvil (390 px)** de «Cómo te ven», el afiche y la nueva
      `/para`. No se pudo: la ventana del navegador estaba maximizada y no aceptaba
      el resize —`window.innerWidth` seguía en 1920 tras varios intentos—. Lo
      comprobado por código: la barra de pestañas ya tenía `overflowX:auto` con
      `flexShrink:0`, y el resto usa `repeat(auto-fit,minmax(...))`, `flexWrap` y
      `clamp()` sin anchos fijos. `/para` tiene `maxWidth:620` y una sola columna,
      que es el caso fácil.

**Hecho desde §25** (para no volver a abrirlo): S1–S9, F1–F7, el escaneo por plan,
la cancelación, la vigilancia de ficha, el espejo, el simulador, el afiche y este
enlace de venta.

---

## Sesión 2026-08-17 (cierre) — §28. Vigilancia de contacto y constancia verificable

Continuación de §27. **Desplegado y verificado en producción.** Sin cambios de
schema.

### 28.1 — Vigilancia de teléfono, horario, nombre y dirección (planes de pago)

`src/lib/fichaGoogle.js`. Completa la vigilancia de `business_status` de §25.6.

Google Maps deja que **cualquiera** sugiera cambios sobre la ficha de un negocio
ajeno, y los aplica sin avisarle al dueño. Un teléfono cambiado es un negocio que
deja de recibir llamadas sin saber por qué; un horario cambiado son clientes que
llegan y encuentran cerrado — y que además dejan una reseña de 1★ por el viaje
perdido.

⚠️ **Solo NEGOCIO y FRANQUICIA, y el motivo es la factura.**
`formatted_phone_number` y `opening_hours` son del grupo **Contact Data**, que
Places cobra aparte del Basic que la llamada ya paga. Esto **sí cuesta por
escaneo**, a diferencia de `business_status`. El scraper pide esos campos solo
cuando el plan los incluye (`obtenerResenasGoogle(placeId, { conContacto })`).

**Dónde vive la referencia, y el precio que tiene.** Detectar un *cambio* exige
recordar el valor anterior, y `Negocio` no tiene columna libre; añadirla obliga a
un `prisma db push` que Railway no corre en el deploy. Así que la referencia vive
en una **fila de `Alerta` marcada como de control** (`detalle.motivo =
'ficha_control'`, `leida: true`).

Es un compromiso consciente y ensucia una tabla que significa «cosas que contarle
al dueño». Por eso el filtro `SIN_CONTROL` se exporta desde `lib/fichaGoogle.js` y
se aplica en **los seis sitios que leen alertas**:

| Dónde | Qué pasaría sin el filtro |
|---|---|
| `GET /api/alertas` | la fila de control aparece en la lista del panel |
| `GET /api/negocios/:id` | y en el detalle del negocio |
| `_count` de no leídas | no afecta: la fila va `leida: true` |
| Resumen semanal/mensual por correo | entra: comparte el enum `RESENA_MUY_NEGATIVA` |
| PDF mensual y reporte manual | entra por fecha |
| Drip del día 5 | le cuenta al usuario una alerta que nunca ocurrió |

⚠️ **Un valor que pasa de tener contenido a `null` NO se reporta como cambio.**
Places omite campos de forma intermitente —sobre todo `opening_hours`— y avisar
de «te borraron el horario» cada vez que Google tiene un mal día convertiría la
alerta en ruido, que es lo único que la mataría.

El aviso va por `enviarAlertaEmail` directo, saltándose las preferencias: igual
que la ficha cerrada, ninguna preferencia debería poder silenciar «alguien te
cambió el teléfono en Google».

### 28.2 — Constancia de Reputación Online

`src/lib/constancia.js` + `src/utils/constancia.pdf.js` +
`GET /api/negocios/:id/constancia.pdf` (planes de pago) +
`GET /api/publico/verificar/:codigo` + la página `/verificar/[codigo]`.

El papel que pide un centro comercial antes de alquilar un local, un
franquiciante antes de aprobar a un franquiciado, o un banco al evaluar un
crédito. Y crea demanda desde el otro lado: **el día que un mall se la pida a un
inquilino, ese inquilino se registra**.

**No guarda nada.** Los datos viajan firmados dentro del código
(`<payload base64url>.<HMAC-SHA256 con JWT_SECRET>`, el mismo mecanismo que
`lib/oauthState.js`) y quien verifica **recalcula la firma** en vez de consultar
un registro. Sin tabla nueva y sin `db push`. Falsificar una constancia exigiría
el `JWT_SECRET`.

⚠️ **Dos consecuencias de no guardar nada, y hay que tenerlas presentes:**
1. **No se puede revocar** una constancia emitida, solo esperar a que caduque. De
   ahí los **90 días** de vigencia — que además es cuando un dato de reputación
   deja de acreditar nada.
2. **Rotar `JWT_SECRET` invalida todas las constancias en circulación.** Ya era
   una operación con consecuencias (states de OAuth, tokens de sesión); esta es
   una más.

El código mide ~152 caracteres, así que **nunca se teclea**: va dentro de un QR
impreso en el PDF. Las claves del payload son de una letra por eso mismo, para no
engordar el QR y no bajarle la tolerancia a un escaneo torcido.

La página de verificación **distingue `VENCIDA` de firma inválida a propósito**:
«venció» y «está falsificada» son cosas muy distintas para quien tiene el papel
delante, y confundirlas sería acusar de fraude a alguien que solo tiene un
documento viejo.

Y el **alcance va en el documento Y en la página**, no escondido en letra
pequeña: esto acredita información pública de Google Maps, no la calidad del
servicio del establecimiento, ni su solvencia, ni tiene valor tributario. Una
constancia que se pasa de lo que puede acreditar no vale nada.

### 28.3 — 🔴 Bug encontrado en el afiche, que ya estaba desplegado

El sanitizador del afiche filtraba por **latin1** (`[^\x00-\xFF]`). **WinAnsi no
es latin1:** CP1252 añade en el rango 0x80–0x9F justo los caracteres tipográficos
que aparecen solos en un texto en español — comillas curvas, guion largo, puntos
suspensivos, apóstrofo tipográfico.

Se estaba comiendo en silencio el guion largo del afiche y el apóstrofo de
«THIS WEEK'S FOCUS» — y se habría comido el del nombre de un cliente llamado
«Tito's». **Nada se rompía, y por eso costó verlo:** solo desaparecían letras, y
un documento al que le faltan letras no lo reporta nadie.

El sanitizador se movió a **`src/lib/winansi.js`**, corregido al conjunto WinAnsi
real, y lo comparten los dos generadores de PDF. Comprobado: `Tito's`, `—` y
`Café Ñandú·` sobreviven; `★` y los emoji desaparecen.

⚠️ **Regla:** en un PDF con fuentes estándar, todo texto pasa por `seguro()`. Si
algún día hace falta ★ de verdad, es empaquetar un `.ttf` y `doc.registerFont`.

### 28.4 — Pendientes actualizados

Reemplaza la lista de §27.6.

**Exigen `prisma db push` a mano** (Railway no lo corre en el deploy, así que hay
que empujar el schema ANTES de desplegar el código que lo use):

- [ ] **S6 — `tokenVersion`.** Cambiar la contraseña no cierra las sesiones
      abiertas: el JWT dura 7 días. Severidad baja.
- [ ] **Tipo de alerta `FICHA_ALTERADA`.** Hoy las tres alertas de ficha —cerrada,
      datos cambiados y la fila de control— comparten `RESENA_MUY_NEGATIVA`.
- [ ] **Columna `fichaGoogleRef Json?` en `Negocio`.** Es el arreglo definitivo de
      §28.1: saca la referencia de la tabla `Alerta` y con ella se puede borrar el
      filtro `SIN_CONTROL` de los seis sitios donde hoy hace falta.

**Decisión de negocio, no de código:**

- [ ] **Sub-usuarios y modo agencia.** El cambio que abre el ticket más alto —una
      agencia con 15 restaurantes paga lo que 15 dueños sueltos no— pero necesita
      tabla de miembros con rol y tocar todos los `findFirst({ usuarioId })`.
- [ ] **Anunciar la vigilancia de contacto y la constancia en el landing.** Las
      dos están vivas y ninguna se menciona en `/precios` ni en la comparativa.
      Son justo las dos que dan una diferencia real entre Gratis y de pago, que
      es de lo que el catálogo anda escaso.

**Necesitan tiempo o datos:**

- [ ] **Ranking «quién subió más este mes».** Solo se puede calcular con historial
      propio, así que hace falta acumular meses de snapshots.

**Verificación que sigue sin hacer:**

- [ ] **Revisión visual en móvil (390 px)** de «Cómo te ven», el afiche, `/para` y
      `/verificar`. No se pudo: la ventana del navegador estaba maximizada y no
      aceptaba el resize —`window.innerWidth` seguía en 1920 tras varios
      intentos—. Comprobado por código: la barra de pestañas ya tenía
      `overflowX:auto` con `flexShrink:0`, y el resto usa
      `repeat(auto-fit,minmax(...))`, `flexWrap` y `clamp()` sin anchos fijos.

**Hecho desde §25** (para no reabrirlo): S1–S9, F1–F7, el escaneo por plan, la
cancelación, la vigilancia de ficha completa, el espejo, el simulador, el afiche,
el enlace de venta `/para` y la constancia verificable.
