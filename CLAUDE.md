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
│   │   ├── alerts/        ← notificador.js (email + Telegram)
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
| Alertas | Email (Resend) + Telegram Bot |
| Pagos | Culqi — **operativo con llaves de TEST** (2026-08-05). Falta aprobación del comercio y rotar a live. Ver §2 |
| Social | Instagram Graph API — pendiente de credenciales · **TikTok — perfil y videos funcionando en producción (2026-07-30)**, ver §15 y §15-quater. Los **comentarios NO están en la Display API** (§15-quinquies): solicitud enviada a la API for Business, en revisión (§15-sexies) |
| Menciones | **Motor y panel completos (2026-07-29)**, ver §18. Sin fuente de datos: requiere un proveedor externo de pago (decisión de negocio). Hoy la sección no se muestra en el panel |
| WhatsApp | **Meta WhatsApp Cloud API** — migración **hecha** (`src/lib/whatsappMeta.js`); Twilio eliminado. Falta la plantilla aprobada y las credenciales |

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
META_APP_ID=                                 # cargado en Railway (2026-08-03) pero de la app tipo Consumidor FALLIDA — reemplazar con la app tipo Negocio, ver §19
META_APP_SECRET=                             # ídem
META_REDIRECT_URI=                           # opcional — por defecto BACKEND_URL + /api/redes/instagram/callback
META_LOGIN_CONFIG_ID=                        # solo apps Negocio con Facebook Login for Business: ID de la "Configuración" de permisos; si está seteado, el OAuth manda config_id en vez de scope (§19)
TIKTOK_CLIENT_KEY=                           # Sandbox cargado en Railway (2026-07-29)
TIKTOK_CLIENT_SECRET=                        # Sandbox cargado en Railway
TIKTOK_SCOPES=                               # opcional — default "user.info.basic,video.list". Ver §15
TIKTOK_REDIRECT_URI=                         # opcional — por defecto BACKEND_URL + /api/redes/tiktok/callback
MENCIONES_PROVEEDOR=                         # sin decidir — proveedor de datos para menciones de TikTok. Ver §18
MENCIONES_PROVEEDOR_API_KEY=                 # sin decidir
MENCIONES_MAX_POR_TERMINO=                   # opcional — default 20. Techo de gasto por término y ciclo
CULQI_PUBLIC_KEY=                            # cargada (test) en local y Railway — rotar a live tras la aprobación
CULQI_SECRET_KEY=                            # cargada (test) en local y Railway — rotar a live tras la aprobación
CULQI_WEBHOOK_SECRET=                        # opcional — protege /api/pagos/culqi/webhook
EMAIL_RECLAMACIONES=                         # opcional — destino de los avisos del Libro de Reclamaciones (default hola@usenotoria.app)
PROMO_HASH_SECRET=                           # CARGADA en Railway y .env local (2026-08-05, con promo_tarjetas vacía). NO rotar sin vaciar esa tabla
META_WHATSAPP_PHONE_NUMBER_ID=               # pendiente — WhatsApp Business Cloud API (mismo Meta App que Instagram)
META_WHATSAPP_ACCESS_TOKEN=                  # pendiente — token permanente del System User de ese Meta App
META_WHATSAPP_TEMPLATE=                      # nombre de la plantilla aprobada (default: notoria_alerta_urgente)
META_WHATSAPP_TEMPLATE_LANG=                 # idioma de la plantilla (default: es_PE)
META_WHATSAPP_TEXTO_LIBRE=                   # solo pruebas: "true" manda texto plano en vez de plantilla
META_GRAPH_VERSION=                          # opcional, default v21.0
```

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
NEXT_PUBLIC_CULQI_PUBLIC_KEY=                # pendiente — llave pública de Culqi
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
- [x] Notificador: email (Resend) + Telegram Bot
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
- [x] Configuración: perfil, email, contraseña, Telegram, apariencia, idioma
- [x] Reportes PDF: vista previa interactiva, descarga para planes de pago
- [x] LAN access: `resolverApiUrl()` detecta host y CORS permite IPs locales
- [x] Verificación de email con banner persistente
- [x] Términos de Servicio y Política de Privacidad (Ley N.° 29733, Perú)
- [x] Facturación: página `dashboard/facturacion` con historial de pagos (fecha, plan, titular, primeros 4 dígitos de tarjeta, monto, estado), botón en el sidebar
- [x] Gating por plan: middleware `verificarPlan` (`api/middlewares/verificarPlan.middleware.js`), usado en los 3 endpoints nuevos de abajo
- [x] Resumen semanal por negocio (domingo 8am hora Lima, `workers/resumenSemanal.worker.js`): cifras crudas en Gratis, + insight IA en Negocio/Franquicia, email consolidado si Franquicia tiene +1 negocio. Toggle `resumenSemanalActivo` vía `PATCH /api/negocios/:id/configuracion`
- [x] Auto-respuesta a reseñas positivas (4-5★, Negocio/Franquicia): plantilla aprobada por el usuario (`POST /api/negocios/:id/auto-respuesta/configurar`), 3 tonos en Franquicia; se publica sola en Google Maps vía GBP si el negocio tiene GBP conectado (si no, se omite con log interno)
- [x] Escalación de urgencia (Negocio/Franquicia): cron cada 4h (`iniciarEscalacionUrgencias`) reenvía por Telegram (y WhatsApp si Franquicia) las reseñas negativas sin responder tras 24h — el canal de WhatsApp pasará de Twilio a Meta (ver "Pendiente antes de producción")
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
| **Culqi** (pagos) | Código listo, sin API key | Agregar `CULQI_PUBLIC_KEY` (frontend y backend) y `CULQI_SECRET_KEY` (backend) en `.env` / `.env.local` |
| **Meta / Instagram** | Código listo, sin aprobación | Agregar `META_APP_ID` y `META_APP_SECRET` en `.env`; registrar el redirect URI `https://api.usenotoria.app/api/redes/instagram/callback` en Meta for Developers |
| **TikTok — perfil y videos** | ✅ **Funcionando en prod (2026-07-30)** | Nada pendiente. Credenciales en Railway, `TIKTOK_SCOPES=user.info.basic,video.list`, token con renovación automática (§15-quater). La app sigue en Sandbox: solo opera con las cuentas registradas como *target users* |
| **TikTok — comentarios** | **Esperando revisión de TikTok** (solicitud enviada 2026-07-30) | No se resuelve con la app actual: las rutas de comentarios no existen en la Display API (§15-quinquies). Plan completo y evidencia en **§15-sexies**. Antes de codificar: esperar aprobación + pasar @adipri a cuenta Business |
| **Meta WhatsApp** (alertas urgentes Franquicia) | **Código listo (2026-07-28)** — `src/lib/whatsappMeta.js`, ya usado por `monitoreo.worker.js`. Twilio eliminado. Falta la plantilla y las credenciales | 1) Habilitar el producto WhatsApp en el mismo Meta App de Instagram, 2) **crear la plantilla en Meta Business Manager**: categoría **UTILITY**, un solo parámetro en el cuerpo (ej. `"Notoria: {{1}}"`), y esperar aprobación, 3) agregar `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_ACCESS_TOKEN` y `META_WHATSAPP_TEMPLATE` en Railway. Probar con `node scripts/prueba-whatsapp-meta.js` |
| **TripAdvisor** (2026-07-06) | Solo base preparada a propósito — decisión de negocio de no activarlo hasta tener buena cantidad de clientes, no solo falta de API key | Ver subsección dedicada más abajo antes de continuar |
| **Menciones (TikTok)** | Motor, panel y alertas listos; **falta la fuente de datos** | Decisión de negocio: contratar un proveedor externo (§18). No se resuelve escribiendo código — TikTok no expone búsqueda de videos ajenos a apps comerciales. **Comprobado el 2026-07-30:** `business/mention/list/` tampoco existe en la API for Business, así que esa vía queda descartada (§15-sexies). El candidato que queda es el permiso *Discovery Search* de TikTok Accounts, que exigiría una segunda solicitud con la función declarada. Mientras no haya proveedor, la sección no aparece en el panel |

### 2. Culqi — integración de pagos (ACTIVA con llaves de TEST desde 2026-08-05)

> **Estado (2026-08-05):** las llaves **de prueba** están cargadas en local, en
> Railway y en Vercel, y el circuito completo está verificado contra la API real
> (`node scripts/prueba-culqi.js` → "Todo OK"). El comercio **todavía no está
> aprobado por Culqi**, así que no hay llaves live.
>
> ⚠️ **Consecuencia mientras haya llaves de test en producción:** el botón "Pagar"
> de https://usenotoria.app/precios acepta la tarjeta de prueba
> `4111 1111 1111 1111` y **activa el plan sin cobrar dinero real**. Cualquiera
> que llegue a /precios puede darse un plan de pago gratis. Es un riesgo asumido a
> propósito para que Culqi pueda revisar el flujo; **rotar a llaves live apenas
> aprueben el comercio** y revisar si alguien se activó un plan en el intermedio
> (tabla `pagos`: los de prueba tienen `culqiCargoId` con prefijo `chr_test_`).

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
- **2026-08-02:** desplegada la **eliminación de conexiones** (§15-septies) — backend `redes.routes.js` (`DELETE /:negocioId/:red`) y `scrapers/tiktok.scraper.js` (`revocarTokenTikTok`); frontend `dashboard/conexiones/page.js` (tuerca + modal de ajustes) y `lib/api.js` (`redes.desconectar`). Railway `26322137` SUCCESS, Vercel `notoria-2sqh9xqj5` READY. Sin cambios en `schema.prisma`, así que no hubo `db push`. Verificado: `/health` 200 y `/dashboard/conexiones` 200 — pero ojo, el 401 del DELETE **no** prueba que la ruta exista (ver la advertencia del truco 401/404 más arriba).
- **2026-07-29 17:40:** desplegado el cierre de la fuga de access tokens (`src/lib/negocioPublico.js` + las 5 respuestas de `negocio.routes.js`; frontend `conexiones/page.js` y `dashboard/negocios/[id]/page.js`). Railway y Vercel OK, logs limpios, `/api/negocios` 401 y `/dashboard/conexiones` 200. **Falta la comprobación autenticada end-to-end** — ver la nota de abajo.

**Cómo se despliega:** esta carpeta es un repo git local sin remoto configurado (no hay `git push` a GitHub). Los CLIs de Railway y Vercel ya están instalados, autenticados y linkeados a los proyectos reales:
```bash
cd brand-shield     && railway up --service api   # backend → https://api.usenotoria.app
cd brand-shield-web && vercel --prod --yes         # frontend → https://usenotoria.app
```
`railway status` / `vercel ls` confirman a qué proyecto está linkeada cada carpeta antes de desplegar.

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

1. **Negocio verificado** en Business Manager (29-jul-2026). ✔
2. **Primera app (ID 1709333600393009) es tipo CONSUMIDOR → NO SIRVE.** Sus permisos disponibles son solo `email`/`public_profile`/`user_*`; los `instagram_*`/`pages_*` no existen en ese tipo y no se pueden agregar (error "Invalid Scopes" al abrir el diálogo OAuth). Sus llaves quedaron cargadas en Railway y hay que REEMPLAZARLAS.
3. **Siguiente paso del usuario: crear app tipo NEGOCIO** (Crear app → caso de uso "Otro" → tipo "Negocio"), vinculada al portfolio Notoria verificado. Configurar: Básica → Dominios de la app `usenotoria.app`, privacidad `https://usenotoria.app/privacidad`, eliminación de datos `https://usenotoria.app/eliminar-datos`; producto **Facebook Login for Business** → Valid OAuth Redirect URIs `https://api.usenotoria.app/api/redes/instagram/callback`. Cargar las llaves NUEVAS en Railway (`railway variables --set META_APP_ID=... --set META_APP_SECRET=...`).
4. **Si vuelve a salir "Invalid Scopes" con la app Negocio**: crear una **Configuración** en Facebook Login for Business con los 4 permisos y cargar su ID como `META_LOGIN_CONFIG_ID` en Railway. `redes.routes.js` ya la soporta (si la variable existe manda `config_id`, si no `scope`) — **ese cambio está commiteado pero SIN desplegar a Railway**: hace falta `railway up --service api` tras crear la app.
5. Lección aprendida hoy: la URL del callback NO va en "Administrador de dominios" (eso es para contenido compartido); el error "dominio no incluido" se arregla con el campo **Dominios de la app** de Configuración Básica + el redirect URI en el producto de login.
6. **Formulario App Review**: los textos en inglés (instrucciones de prueba, APIs usadas, sin pagos, sin geobloqueo) ya están redactados — buscarlos en la conversación del 2026-08-03 o pedirlos de nuevo. Falta: crear cuenta de prueba del revisor (registrar email controlado, verificar, `railway run --service api node scripts/dar-plan.js <email> NEGOCIO`) y grabar el screencast (login → Conexiones → Conectar Instagram → autorizar → comentarios → tuerca → Eliminar conexión).

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
2. **Cablear comentarios de Instagram al worker** cuando el OAuth funcione: agregar `INSTAGRAM` al enum `Plataforma` (+ `db push` del usuario), entrada en `FUENTES_COMENTARIOS` del worker, y probar contra la Graph API real (método §15-sexies: nunca a ciegas).
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

### Resumen diario de boletas (RC) — EN CURSO (2026-08-05)

**Estado: el XML ya pasa la validación de esquema de SUNAT, pero el resumen
todavía NO es aceptado.** Último error del beta:

```
2522 "No existe información del documento del anticipo" (nodo "/" valor "")
```

Es un error de regla de negocio, no de esquema. **Ya se descartó que lo cause
`sac:BillingPayment`**: quitándolo del todo, el 2522 se mantiene igual. Tampoco
es el identificador de la firma (se alineó con `firma.ID_FIRMA`, como en
`ublInvoice.js`). Queda pendiente encontrar la causa — probablemente falte algún
bloque obligatorio a nivel de documento.

Piezas ya hechas y utilizables:
- `billService.enviarResumen()` y `billService.consultarTicket()` — el flujo
  **asíncrono**: `sendSummary` NO devuelve el CDR, devuelve un **ticket**, y el
  veredicto se pide con `getStatus`. `statusCode` 98 = sigue procesando.
  ⚠️ **Un ticket entregado no significa aceptado.** El ticket hay que
  persistirlo: si el proceso se cae entre el envío y la consulta, sin él no hay
  forma de saber si SUNAT aceptó, y reenviar produciría un duplicado.
- `src/sunat/ublResumenBoletas.js` — construye el RC 1.1. Correcciones ya
  ganadas contra el validador de SUNAT, **no revertirlas**:
  1. En `sac:SummaryDocumentsLine` el orden es `TotalAmount` → `BillingPayment`;
     `sac:Status` **no pertenece a este esquema** (lo rechaza en cualquier
     posición) y se quitó.
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
