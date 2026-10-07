# Notoria — Guía de contexto para Claude Code

> Documento de **estado y reglas**, no diario. Se conserva lo que sigue siendo cierto y la lección
> que evita repetir cada error. **Compactado el 2026-10-03** (de 442 000 a ~80 000 caracteres):
> la versión íntegra, con toda la narrativa, está en **`docs/historial/CLAUDE-hasta-2026-10-02.md`**
> — buscar ahí antes de concluir que algo «nunca se documentó». Al añadir algo nuevo: el **estado**
> va en su sección; la **historia**, si hace falta, en una línea con su fecha.

## 1. Qué es Notoria

SaaS de monitoreo de reputación para **negocios locales del Perú** (12 rubros: `TIPOS_NEGOCIO` en
`api/routes/negocio.routes.js`, espejo `web/src/lib/tiposNegocio.js`) — no solo «restaurantes y
hoteles»: esta línea se copia a campañas y README, así que tiene que ser exacta. Vigila la ficha de
Google, señala **comportamiento anómalo** en reseñas (nunca «esta reseña es falsa»), avisa de caídas
de rating y de cambios en la ficha.

- Planes: **Gratuito** · **Impulso S/29/mes** (anual S/276 = S/23/mes) · **Negocio S/59/mes** (anual
  S/564) · **Franquicia S/179/mes** (anual S/1716). Todo plan de pago incluye **UN local**; los demás
  se cobran: S/39/mes (S/372/año) en Negocio, S/99/mes (S/948/año) en Franquicia; Impulso no vende
  locales. Tope: **50 locales** (`MAX_LOCALES_TOTALES`).
- Capacidades: **`src/lib/planes.js`** (fuente única). Precios: **`src/lib/precios.js`**. Nunca
  escribir `['NEGOCIO','FRANQUICIA']` a mano (§8.6).
- Dominio **usenotoria.app** · `hola@usenotoria.app` · teléfono público **+51 916 383 038**
  (WhatsApp Business con saludo automático y mensaje de ausencia; fuente única
  `brand-shield-web/src/lib/contacto.js`).
- **Servicio solo nacional**: negocios con `pais: 'pe'`, facturación fija en `PE` (`SOLO_NACIONAL`
  en `lib/tributario.js` rechaza otro país al guardar datos fiscales; la lógica de exportación se
  conserva para reabrir).
- **NOTORIA E.I.R.L.**, RUC **20616239466**, domicilio fiscal **Cal. Isla Filipinas Mza. G9 Lote 8,
  La Perla, Callao** (ubigeo `070104`, provincia y departamento `PROV. CONST. DEL CALLAO`; NO es
  Lima). Precios en soles (PEN), IGV incluido.

---

## 2. Repositorio, stack y comandos

**Se trabaja en la PC del taller**: `C:\Users\Taller\Vigilio` (la PC de casa,
`C:\Users\Admin\...`, ya no es referencia). La memoria de Claude Code va por ruta, así que cada
sesión empieza leyendo este archivo: **lo decidido se escribe acá, no en la conversación.**
Herramientas de la máquina: JDK 17 y Android SDK en `C:\Users\Taller\dev-tools\`
(`JAVA_HOME="/c/Users/Taller/dev-tools/jdk-17.0.20.1+1" ./gradlew.bat assembleDebug`), `gh` en
**`/c/Users/Taller/gh/bin/gh`** (no en `Program Files`), CLIs de Railway y Vercel autenticados. La extensión
de Chrome exige arrancar la sesión con `--chrome`. Procedimiento de mudanza: `docs/mudanza-de-pc.md`.
- **Python 3.14** (`C:\Users\Taller\AppData\Local\Python\pythoncore-3.14-64\`), con **PyMuPDF**
  (renderizar páginas de un PDF a PNG para mirarlas) y **graphify** (`graphifyy`). Su carpeta
  `Scripts` está en el PATH de usuario (REG_EXPAND_SZ) — sin ella los hooks daban «graphify: command
  not found». Los hooks de graphify viven en **`.claude/settings.local.json`** (fuera de git, con la
  ruta absoluta al `.exe`); `graphify-out/` también está en `.gitignore` (se regenera con
  `python -m graphify update .`).
- **Word 16** por COM desde PowerShell: abre un PDF (lo convierte a .docx), edita con
  `Find.Execute`/párrafos y exporta con `ExportAsFixedFormat(ruta, 17)`. Así se editaron el manual y el
  contrato del promotor (§13). Lecciones: insertar un párrafo «como un Enter» al final del anterior
  (si no, cae dentro de la tabla siguiente y pierde la viñeta); la conversión pierde los saltos de
  página (`PageBreakBefore` en cada Heading 1/anexo); actualizar el índice; y **mirar las páginas
  renderizadas** antes de darlo por bueno.

```
Vigilio/
├── brand-shield/        ← Backend: Node + Express 4 + Prisma 5 + PostgreSQL
│   ├── src/{api/routes,api/middlewares,lib,scrapers,nlp,workers,alerts,sunat,services,utils}
│   ├── scripts/         ← operación y pruebas (prueba-*.js) — §18
│   └── prisma/schema.prisma
├── brand-shield-web/    ← Frontend: Next.js 16.2.9 + React 19 + Tailwind 4 (Turbopack)
├── monitor-uptime/      ← Cloudflare Worker de uptime (§6)
├── marca/               ← logos, piezas de redes, hacer-tarjeta.js
├── campana/guiones/     ← los 7 guiones de video (solo texto; imágenes fuera de git)
├── docs/                ← secretos, mudanza, obligaciones tributarias, app review, retención…
└── .github/workflows/   ← ci.yml (pruebas) y uptime.yml (secundario)
```

Las carpetas `brand-shield*` no se renombran (romperían imports). App Android: repo aparte
`adi211104/APKNotoria` (`NotoriaApp`, Kotlin + Compose), cliente del mismo API.

| Capa | Tecnología |
|---|---|
| Emails | Resend (canal único de alertas) |
| IA | Groq `openai/gpt-oss-20b` — siempre `reasoning_effort: 'low'` o devuelve contenido vacío |
| PDF | PDFKit (todo texto por `seguro()` de `lib/winansi.js`) |
| Auth | JWT + Google Sign-In, sesiones revocables (`tokenVersion`) |
| Pagos | **Culqi LIVE en producción** — cobra dinero real |

```bash
cd brand-shield     && npm run dev   # backend :3000 (los cron solo arrancan con NODE_ENV=production)
cd brand-shield-web && npm run dev   # frontend :3001
```

- **Windows:** `prisma generate` da EPERM si el backend corre (bloquea la DLL): detenerlo antes.
- 🔴 **npm 11 no corre los `postinstall`**: los dos `package.json` (y `monitor-uptime/`) llevan
  `allowScripts` con Prisma, sharp, unrs-resolver, esbuild, workerd. **No borrarlo**; al subir
  versión, `npm approve-scripts <pkg>`.
- Los archivos tienen **CRLF** en el árbol de trabajo (autocrlf). Para editar desde scripts,
  normalizar a `\n` y restaurar; los heredocs con backticks fallan en esta shell → escribir el
  script a un archivo.

---

## 3. Variables de entorno

### brand-shield (Railway, servicio `api`; local con valores de test)
```
DATABASE_URL / JWT_SECRET                   # CRÍTICAS: sin ellas el proceso no arranca en producción
DOCUMENTOS_SECRET                           # firma constancias y expedientes (2026-10-02) — §14
TOKENS_CLAVE                                # cifra los tokens OAuth en la base (2026-10-02) — §14
RESEND_API_KEY / EMAIL_FROM=Notoria <hola@usenotoria.app>
EMAIL_CONTABILIDAD / EMAIL_RECLAMACIONES    # = didier@usenotoria.app. Sin CONTABILIDAD se apagan en
                                            # silencio los avisos fiscales, de cobros y de webhooks
FRONTEND_URL / BACKEND_URL
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET     # proyecto GCP 798376364749 = "My First Project",
                                            # id project-f1e03c17-f209-453e-a09 (la consola reescribe
                                            # el número al id: es el correcto)
GOOGLE_PLACES_API_KEY / GROQ_API_KEY
META_APP_ID=2232447584255257 / META_APP_SECRET / META_IG_APP_SECRET (app IG 1305555994987658)
META_LOGIN_CONFIG_ID=4655107931374707 / META_WEBHOOK_VERIFY_TOKEN
INSTAGRAM_ACTIVO=true · FACEBOOK_ACTIVO / GBP_ACTIVO sin poner (apagados) · *_CUENTAS_PRUEBA
TIKTOK_BIZ_CLIENT_ID / TIKTOK_BIZ_CLIENT_SECRET   (TIKTOK_CLIENT_* = Display API, respaldo)
CULQI_PUBLIC_KEY / CULQI_SECRET_KEY         # Railway: live. Local: test, a propósito
CULQI_WEBHOOK_SECRET                        # ≤20 caracteres (límite del panel). Sin ella, en
                                            # producción el webhook rechaza TODO (falla cerrado)
PROMO_HASH_SECRET                           # ⚠️ no rotar sin vaciar promo_tarjetas
SUNAT_CERT_P12_BASE64 / SUNAT_CERT_PASSWORD / SUNAT_SOL_USUARIO=NOTORIAS / SUNAT_SOL_CLAVE
SUNAT_ENTORNO=produccion (sin ella apunta a BETA) / SUNAT_EMISION_ACTIVA=true
RUTA_COMERCIAL_ACCESO                       # correo:alias,… (dueno y Usuario1) — §13
PARA_BLOQUEADOS / MENCIONES_* / TRIPADVISOR_API_KEY   # apagadas a propósito
```

### brand-shield-web (Vercel)
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_CULQI_PUBLIC_KEY` (pk_live; se
incrusta en el BUILD → cambiarla exige `vercel --prod`). Solo existen en *Production*: `vercel env
pull` baja development (vacío), así que en local Google Sign-In y Culqi no funcionan sin valores de
test a mano. `NEXT_PUBLIC_WHATSAPP_VENTAS` se retiró (2026-09-16).

**Comprobación de configuración (2026-10-02):** `src/lib/configProduccion.js` corre al arrancar. En
producción, sin `DATABASE_URL`/`JWT_SECRET` el proceso muere (el deploy queda fallido y sigue
sirviendo el anterior); cada variable opcional ausente se escribe en el log con 🔴 y su efecto.
Cruce completo de variables código ↔ Railway:
```bash
grep -rhoE "process\.env\.[A-Z0-9_]+" src/ | sed 's/process\.env\.//' | sort -u > /tmp/code.txt
railway variables --service api --kv | grep -oE "^[A-Z0-9_]+" | sort -u > /tmp/rw.txt
comm -23 /tmp/code.txt /tmp/rw.txt   # se leen y no están
```

**Secretos:** inventario y nivel de cada uno en **`docs/secretos.md`** (qué haría falta para
recuperarlo). Graves: `SUNAT_CERT_PASSWORD` (solo en Railway; sin ella el `.p12` no sirve) y el
keystore de Android (dos copias: taller y casa). `TOKENS_CLAVE` y `DOCUMENTOS_SECRET` hoy **solo
viven en Railway**. El `.p12` real vive en `C:\Users\Taller\notoria-secrets\`, nunca en Downloads.
Railway no es un respaldo.
- Las llaves **live no van a archivos locales** (`set-culqi-keys.js` se niega).
- 🔴 **Cargar secretos por stdin desde bash con `printf '%s'`** (o `scripts/cargar-secreto.sh`):
  PowerShell antepone un BOM invisible y `echo` añade salto de línea; una llave de Culqi quedó de 25
  caracteres y daba 401. Verificar largos con `railway variables --service api --kv`.
- `railway variable set` redespliega salvo `--skip-deploys` (que no aplica al contenedor en
  marcha); `variable delete` siempre redespliega.
- ⚠️ Rotar `JWT_SECRET` invalida sesiones, states de OAuth, tokens de cambio de contraseña y los
  documentos firmados antes del 2026-10-02.

---

## 4. Despliegue

```bash
cd brand-shield     && railway up --service api --detach   # → https://api.usenotoria.app
cd brand-shield-web && vercel --prod --yes                 # → https://usenotoria.app
```
Git: `main`, remoto `https://github.com/adi211104/NOTORIA`. **Commitear y pushear al cerrar cada
bloque**; `git push` NO despliega (Railway no está conectado al repo). El agente despliega sin
preguntar (autorizado 2026-08-18); **`prisma db push` contra producción se avisa aparte**.

Reglas que costaron caro:
- 🔴 **Comprobar en qué RAMA quedó todo** (`git branch -av`, `git worktree list`): en agosto `main`
  pasó días sin 11 commits que vivían en la rama de un worktree, y su CLAUDE.md decía cosas falsas.
  Fusionar antes de cerrar un worktree, y **un merge sin conflictos no es un merge verificado**:
  buscar contradicciones a mano y correr las suites.
- 🔴 **`git status` antes de dar el día por cerrado**: Vercel despliega el árbol de trabajo, así que
  producción puede ir por delante de git sin que nada lo diga.
- **`railway status`** tiene que decir **`notoria-api`** (hay 4 proyectos; `brand-shield` y
  `Vigilio` son los malos y `railway up` contra un servicio inexistente **termina «con éxito» sin
  subir nada**). Señal de deploy real: `Indexing... Uploading...` + Build Logs.
  `railway variables --service api --kv | wc -l` ≈ 55 en el bueno. Re-enlazar:
  `railway link --project notoria-api --service api`. `railway up` siempre desde `brand-shield/`.
- **Vercel bloquea por el AUTOR del commit**: «Not authorized» con `state: BLOCKED` = el
  `git config user.email` no es miembro del team. Debe ser `didierprincipe@gmail.com` (`--local` en
  CADA repo, también NotoriaApp). Hace falta un commit nuevo con el autor correcto.
- 🔴 **Un `vercel --prod` puede no producir deployment y no dar error visible** (2026-10-03: la
  salida truncada parecía normal y el último deployment seguía siendo de días antes). Verificar
  siempre con la lista de deployments o un cambio observable en producción:
  ```bash
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' vercel api "/v6/deployments?projectId=<prj_…>&limit=1"
  ```
  (desde Git Bash hay que desactivar la conversión de rutas de MSYS o el CLI recibe `C:/v6/...`).
- `railway.json` queda deprecado el **2026-12-01** (`railway config migrate`).

### Cambios de esquema en producción (orden obligatorio)
El `.env` local apunta a **producción** (proxy público `reseau.proxy.rlwy.net`). Para cambios
**aditivos** (tablas, columnas con default, valores de enum):
```bash
cd brand-shield
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script  # 0. el SQL exacto
node scripts/respaldo.js && node scripts/respaldo.js --verificar <archivo>                             # 1. respaldo
npx prisma db push && npx prisma generate      # 2. ANTES del código (backend detenido para generate)
railway up --service api                       # 3. código
npx prisma migrate diff …                      # 4. debe decir «This is an empty migration»
```
- `db push` dice «in sync» tanto si aplicó como si no: **no es comprobante**. El paso 4 sí.
- `--accept-data-loss` solo si el aviso es por una restricción `UNIQUE` y se comprobó antes que no
  hay duplicados (así se añadió `competidores(negocioId, googlePlaceId)` el 2026-10-02).
- Al **quitar** una columna: quitarla del schema → desplegar → `railway ssh … npx prisma db push
  --accept-data-loss --skip-generate` → **`npx prisma generate` en local** (si no, el primer
  `update` sin `select` revienta con «column does not exist», que parece un fallo de la base).
- `railway ssh … db push` lee el schema DESPLEGADO: corrido antes del deploy es un no-op que dice
  «already in sync».
- `respaldo.js` usa el cliente generado: si el schema ya pide columnas nuevas, fallará contra la base
  vieja → con cambios aditivos se puede respaldar justo después del push.
- **No se usa `prisma migrate dev`**: con el `.env` en producción puede proponer resetear la base.
  Migraciones versionadas, el día que haya base de staging.

---

## 5. Cómo verificar (esto ha fallado muchas veces)

**Nunca dar por buena una integración por el cartel verde de un panel ajeno.** La verdad está en
los logs y en un **cambio observable en la salida**.

| Qué | Cómo |
|---|---|
| Backend desplegado | Un cambio observable: un campo nuevo, una cabecera nueva (`X-Request-Id`), la línea de arranque de un cron en `railway logs`. Y `/health` 200 + **401 en `/api/auth/login` con credenciales falsas** (la base se consulta; un 500 diría lo contrario) |
| ¿Existe una ruta? | Sin token: 401 = viva, 404 `Ruta no encontrada` = no desplegada. ⚠️ **No sirve en routers con `router.use(autenticar)` delante** (redes, comentarios, pagos, negocios): todo path da 401. Siempre con un **404 de control** sobre una ruta inventada |
| Frontend (componente de cliente) | Localizar la frase en `.next/static/chunks/` y **bajar ESE chunk de producción**, con una frase inventada como control |
| Variables en el contenedor | `railway run --service api node …` (ver §18 `lib-env-produccion`). `railway ssh` **no funciona en esta PC** (`Host key verification failed`) |

Reglas de método (cada una salió de un error real):
- 🔴 **Ante un resultado, preguntar primero si el método distingue.** Toda sonda lleva su control
  negativo; si no distingue, el veredicto es «no concluyente», nunca «roto» ni «bien». Un
  verificador de secretos dijo «rechazado» y un secreto inventado daba el mismo error.
- 🔴 **Una sonda de fuente no puede casar con comentarios** (`sinComentarios()`), ni depender del
  formato (acusa a quien reformatea). Un `.every()` sobre un array vacío da verde sin leer nada.
- 🔴 **Antes de dar por buena una prueba nueva, comprobar que da ROJO contra el código viejo**
  (`git show HEAD:<archivo>`).
- 🔴 **Un cambio que toca lo que se VE no está verificado hasta que alguien lo mira**, y en más de un
  ancho. Cuatro rondas de fallos (24/08, 25/08, 29/08, 31/08) aparecieron con todo en verde.
- **Si no viste el resultado de un guardado, re-lee el estado; no reintentes** (se habrían creado
  reglas duplicadas).
- Entrega de correo: marca única `NOTORIA-PRUEBA-<x>-<base36>` y veredicto en el **Activity Log de
  Cloudflare** (Gmail deduplica lo que uno se manda a sí mismo por un reenvío).
- Un fallo de entorno comprobado una vez **envejece mal**: antes de declarar algo «no funciona en
  esta máquina», ejecutarlo de nuevo (pasó con `next build` y con el JDK).

---

## 6. Estado de las integraciones e infraestructura

| Integración | Estado |
|---|---|
| **Google Places** | ✅ En uso (búsqueda, escaneo). Costo y frenos en §8.7/8.9. Rechazo de Google = correo urgente (§12) |
| **Google Business Profile** | 🔴 **Bloqueado por Google y oculto tras interruptor** (`lib/gbpVisible.js`). Cuota `Requests per minute = 0`. Las tres solicitudes (`3-5553000040900`, `0-4623000041642`, `6-5952000041022`) se rechazaron por **60 días de antigüedad del perfil** (verificado ~17/08/2026). **Reenviar el 16/10/2026 o después**, desde `usenotoria@gmail.com` (Propietario principal), formulario `support.google.com/business/workflow/16726127` (sin pantalla de revisión: «Continuar» envía), con la URL **exacta** de la ficha `https://usenotoria.app/` (con barra). Antes, comprobar que la ficha sigue «Verificada». Organization account creada: **Notoria, ID `5269452463`**, cuenta `agencia@usenotoria.app`. Google contesta en 10-23 días, sin acuse. Al aprobar: habilitar `mybusiness.googleapis.com` (v4) |
| **Culqi** | ✅ LIVE. Webhook de reembolsos con bandeja durable (§8.1) |
| **TikTok Accounts API** | ✅ Completo. Conexión viva en «Don Tito San Miguel» (@usenotoria, sin videos públicos) |
| **Instagram** | ✅ Encendido para todos desde 2026-08-26. Sin webhooks (`pages_manage_metadata` rechazado): comentarios por escaneo. Primera conexión real verificada el 2026-08-31 |
| **Facebook Reviews** | ✅ Terminado, **oculto** hasta que Meta conceda `pages_read_user_content` (segunda solicitud, falta grabar screencasts — §19) |
| **Menciones** | Instagram es la única fuente. TikTok exigiría proveedor de pago (~US$100/mes) |
| **TripAdvisor** | Solo base preparada. Se activa cuando haya masa de hoteles |
| **SUNAT** | ✅ Emisión ENCENDIDA en producción |
| **WhatsApp/Telegram** | Eliminados como canal de alerta. WhatsApp solo como contacto comercial |

**Infraestructura:** Railway `notoria-api` (servicio `api` + Postgres), Vercel `notoria-web`, DNS en
Cloudflare («DNS only»), dominio verificado en Resend (`sa-east-1`), Search Console
(`public/googlebab20eafdad21f30.html` — **no borrarlo**). Web Analytics y Speed Insights encendidos.

**Monitor de uptime:** `monitor-uptime/` — Cloudflare Worker cada 5 min en
`https://notoria-monitor.usenotoria.workers.dev`, tres sondas (`/health`, landing con contenido,
`/health/monitoreo`), estado en KV `f3322663a76044289ca708e150c7fe8e` como **conjunto de sondas
caídas** (avisa lo NUEVO y la recuperación, una vez). Correo a `didier@`. Reintenta antes de declarar
caída. KV es eventualmente consistente: creer al comportamiento, no a una lectura externa inmediata.
`.github/workflows/uptime.yml` es secundario (GitHub entrega su cron con horas de hueco): solo falla
si una sonda no da 200; el hueco va como warning. En Windows desplegar con `npx.cmd` (PowerShell
bloquea `npm.ps1`).

### Email Routing (Cloudflare) — el catch-all está en **Drop**
🔴 **Solo llega el correo que tiene su PROPIA regla**; el resto se acepta y se descarta (el
remitente ve `delivered`). Reglas, todas → `didierprincipe@gmail.com` (alias de la misma cuenta que
`usenotoria@gmail.com`): `hola@`, `revisormeta@`, `didier@`, `agencia@`, `promotor@`. **Al crear
cualquier dirección nueva del dominio, crear su regla en el mismo momento y probarla con marca
única.** (`didier@` y `agencia@` estuvieron días perdiendo correo sin que nadie lo notara.)
⚠️ Gmail **limita** lo que Cloudflare le reenvía (`421 4.7.28`): un correo a estas direcciones puede
llegar tarde.

### DMARC
`v=DMARC1; p=quarantine; rua=mailto:751009fd2d5847b180f4bedd8cddc519@dmarc-reports.cloudflare.net`
— informes en **Cloudflare → DMARC Management** (desde 2026-09-27). Remitentes alineados: Resend
(SPF `send.usenotoria.app`, DKIM selector `resend`) y el reenviador de Cloudflare (DKIM `cf2024-1`).
**Cualquier herramienta nueva que mande correo del dominio va a SPF/DKIM antes**, o termina en spam.
**Editar el TXT existente, nunca crear otro** (dos DMARC = DMARC roto). `sp` no declarado a propósito.
Respuestas desde Gmail: alias «enviar como» por **SMTP de Resend** (`smtp.resend.com:465`, usuario
`resend`, API key dedicada) con «responder desde la misma dirección»; por el SMTP de Gmail caerían
en spam con `quarantine`.
Auditar entrega sin mandar nada: `GET api.resend.com/emails` (`last_event`). `delivered` = el MX
aceptó, no que alguien lo vea: cruzar con el destino.

---

## 7. Lo que está implementado

**Backend:** auth completo (registro, login, Google, verificación de email, recuperación con token
hasheado, rate-limit 10/15min en auth, OAuth state firmado) · negocios con búsqueda en Maps ·
scrapers · monitoreo por cron con cadencia por plan y dormancia · detector · alertas por email con
preferencias y agrupado · resúmenes · IA de respuestas y análisis de competidores · reporte PDF
mensual · auto-respuesta a positivas · escalación de urgencias · carteles QR · constancia y
expediente verificables · pagos Culqi con renovación, reintentos, reconciliación y bajada de plan ·
comprobantes SUNAT · Libro de Reclamaciones · equipo con roles · Ruta comercial.

**Frontend:** landing bilingüe (`IdiomaContext`, patrón `TEXTOS = { es, en }` por página), FAQ,
cookie banner, registro, onboarding (2 pasos), panel con sidebar, ficha con pestañas, blog SSG
(`src/lib/blog.js`), `/precios` (catálogo que revisa Culqi; nunca usa `useIdioma`), `/contacto`,
`/devoluciones`, `/libro-reclamaciones`, `/eliminar-datos`, `/para/<slug>~<placeId>`,
`/verificar/<codigo>`, `/invitacion/<token>`, `/confirmar-cambio/<token>`, `/ruta`.

**Idioma:** el registro guarda el idioma del navegador (`idiomaPreferido()`); correos y PDF usan
`usuario.idioma`. Están en español **a propósito** el circuito de entrada (login/registro/onboarding,
decisión del dueño 2026-08-31: 1 cuenta en inglés de 12) y las páginas legales. La app Android no se
traduce (decisión 2026-08-17).

**LAN:** `resolverApiUrl()` en el frontend, `esOrigenRedLocal()` en el CORS, `allowedDevOrigins`.

**localStorage (no cambiar claves):** `bs_token` · `bs_tema` · `bs_idioma` · `bs_cookies` ·
`bs_cuenta` · `bs_tour` · `bs_fuente`.

---

## 8. Integraciones, una por una

### 8.1 Culqi — pagos (LIVE)

**Flujo:** `/precios` o `dashboard/planes` abren Checkout v4 → token → `POST /api/pagos/culqi`
(customer + tarjeta guardada + primer cobro). Renovación por cron diario. Locales a mitad de periodo
por `POST /api/pagos/locales` (§8.8). Webhook `POST /api/pagos/culqi/webhook`.

🔴 **Todo cobro pasa por `src/lib/cobros.js` desde el 2026-10-02** (auditoría): Culqi y Postgres no
comparten transacción, y antes un fallo de base tras cobrar dejaba al cliente cobrado y sin rastro.
1. Se crea un **`IntentoCobro`** (tabla `intentos_cobro`) con **clave única ANTES de llamar a
   Culqi**. Claves: alta = `alta:<usuario>:<token del widget>` (el token es de un uso); renovación =
   `renovacion:<usuario>:<fechaVencimiento ISO>` (un periodo = un cobro aunque el cron corra dos
   veces); locales = `locales:<usuario>:<vencimiento>:<N>-><M>`. Clave existente y no FALLIDA →
   `COBRO_DUPLICADO`, no se cobra; FALLIDA → se reabre.
2. El cargo lleva `metadata: { intento, tipo }`.
3. Resultado: `EXITOSO` / `FALLIDO` (Culqi respondió 4xx: no cobró) / **`DESCONOCIDO`** (sin
   respuesta o 5xx: no se sabe). DESCONOCIDO **no se reintenta a ciegas**.
4. `cobros.aplicar()` hace usuario + `Pago` + enlace del intento en **UNA transacción**, idempotente
   (`pagos.culqiCargoId` es único). Lo que cambia en el usuario va en `intento.detalle`, guardado
   antes del cobro.
5. **Reconciliación** (`workers/reconciliacion.worker.js`, :15 y :45): EXITOSO sin Pago → trae el
   cargo de Culqi y aplica con la MISMA función + comprobante + aviso; PROCESANDO >15 min o
   DESCONOCIDO → busca en `GET /charges?email=` el cargo con `metadata.intento`; si se cobró,
   completa; si no aparece en 24 h, FALLIDO y libera la promo reservada.
- Si la base falla tras cobrar, la ruta responde **202 `PAGO_PENDIENTE_DE_ACTIVAR`** (el frontend lo
  trata como aviso, no como éxito) y `enviarAvisoInterno` avisa a contabilidad. DESCONOCIDO → 502
  `COBRO_EN_VERIFICACION` («no vuelvas a pagar»).
- Ni rutas ni workers llaman a `culqi.crearCargo` directo (lo vigila `prueba-auditoria.js`).
- El campo de la tarjeta guardada es **`Usuario.tarjetaCulqiId`** (`@map("suscripcionId")`: la
  columna conserva el nombre viejo, que mentía).

**Fuente única de precios:** `lib/precios.js` (`montoSuscripcion(plan, anual, localesExtra)` la
usan alta y renovación). `web/src/lib/catalogo.js` debe cuadrar. Cualquier importe mostrado antes de
pagar se calcula en céntimos con el redondeo del backend (`montoEnCentimos`).

**Reglas del cobro que costaron bugs reales:**

| Regla | Por qué |
|---|---|
| Sin rellenos de un carácter (`address` 5-100, `last_name`, `description` 5-80) | `address: '-'` tumbaba toda alta. Nombre sin apellido → `'No indicado'` |
| `culqi.obtenerOCrearCliente()`, nunca `crearCliente` | Culqi rechaza un segundo customer con el mismo correo |
| `culqi.datosTarjeta(cargo)` | Con tarjeta guardada los datos van en `cargo.source.source` |
| **`paid` no dice si se cobró** | El estado es `outcome.type === 'venta_exitosa'` (`culqi.cargoExitoso`) |
| `creation_date` viene en **milisegundos** | — |
| Reembolso: `GET /refunds/{id}`, `status: "completa"`; `reembolsar` exige `amount` | Sin él: «No existe el monto…» |
| `Culqi.close()` primero en el callback `window.culqi` | El widget queda abierto encima |
| Resultado en `components/ResultadoPago.js` (pantalla completa, sin redirección) | — |
| El vencimiento nuevo se SUMA al vigente (máximo entre vencimiento y hoy) | Alta y renovación, la misma regla |

**Política de cambio de plan (cumplida por el backend y publicada en /devoluciones, 2026-10-02):**
subir = se cobra el plan nuevo completo y los días restantes se suman; **bajar de plan o pasar de
anual a mensual se rechaza (409 `BAJADA_AL_VENCER`) mientras quede periodo pagado**: cancelar y
elegir al vencer. Mensual → anual se permite (botón «Cambiar a anual»; `esActual` compara plan Y
periodo, por eso el perfil devuelve `periodoFacturacion`).

**Ciclo de vida:** cargo rechazado en renovación → **3 intentos cada 3 días** con correo
(`enviarCobroFallido`), contados como `Pago FALLIDO` posteriores al último EXITOSO; al agotarlos baja
a GRATIS. `COBRO_DUPLICADO`/`DESCONOCIDO` en la renovación NO cuentan como intento. El cron cobra
**todo lo vencido**. `iniciarBajadaDePlanes` (5:30) baja a quien canceló y terminó su periodo. ⚠️ Los
cron de `monitoreo.worker.js` sin `timezone` corren en **UTC** (el de las «5:00» = 00:00 de Lima).

**Cancelar:** `POST /api/pagos/cancelar` + Configuración → Suscripción (nombre exacto que prometen
/devoluciones y el FAQ). Conserva el plan hasta el fin del periodo.

**Webhook (desde 2026-10-02):**
- Producto CulqiOnline · recurso `refund` · acción **`creation`** · resultado `succeeded` (tipo
  `refund.creation.succeeded`; `data` llega como **cadena JSON** con `chargeId`) · URL
  `https://api.usenotoria.app/api/pagos/culqi/webhook` · autenticación básica con
  `CULQI_WEBHOOK_SECRET` (≤20 caracteres, sin `< >`; nunca la contraseña del panel).
- 🔴 **Sin secreto en producción rechaza todo** (antes aceptaba todo). Comparación en tiempo constante.
- **Bandeja durable** `eventos_webhook` (`lib/webhookInbox.js`): se **guarda antes de responder**; si
  no se puede guardar → 500 (Culqi reintenta); si procesar falla → `PENDIENTE` y lo reintenta
  `reintento-webhooks` cada 10 min con espera creciente; al 8.º intento `FALLIDO` + aviso a
  contabilidad. `UNIQUE(proveedor, idExterno)`: un reenvío responde `duplicado` sin reaplicar.
- **Reembolso según el tipo** (`efectoDeReembolso`): cuota vigente devuelta entera → suscripción
  termina HOY (`suscripcionActiva=false`, `fechaVencimiento=ahora`); cuota vieja → solo registro;
  **parcial** → `Pago` sigue EXITOSO con `montoReembolsado`, aviso de nota de crédito;
  `LOCAL_ADICIONAL` → no toca el plan, aviso a contabilidad; `PRUEBA` → solo registro. Idempotente.
- Contracargos no llegan por webhook: se vigilan en *Controversias* del panel.
- Verificado en producción el 2026-10-03: sin secreto 401, secreto falso 401, real 200 + fila
  guardada + reenvío `duplicado`.

**Promo de bienvenida:** 50% los 2 primeros meses, solo mensual, una vez por cuenta Y por tarjeta
(`promo_tarjetas`, HMAC de `BIN|últimos4` con `PROMO_HASH_SECRET`). 🔴 **Se RESERVA antes de cobrar**
(crear la fila de la tarjeta — UNIQUE — y `UPDATE … WHERE promoBienvenidaUsada=false`); si el cargo es
rechazado se libera, si queda en duda se conserva. Cuenta con derecho pero tarjeta gastada → **409
`PROMO_NO_APLICA` sin cobrar**; el frontend reintenta con **`sinPromo: true`** (no romper ese
escape). `BannerPromo` deriva sus importes del catálogo.
**No existe periodo de prueba** («7 días gratis» sería publicidad engañosa, Ley 29571); sí el
**retracto de 7 días** con devolución del 100%.

**Requisitos de Culqi para la web:** contacto, información legal, Libro de Reclamaciones integrado,
≥5 productos con foto/descripción/precio, botón de comprar, SSL. De ahí `/precios`, `/devoluciones`,
`/libro-reclamaciones`, `/contacto` y `PieLegal.js`.

### 8.2 TikTok — Accounts API (completo)
`scrapers/tiktokBusiness.scraper.js`, `lib/tiktokBizToken.js`; la Display API
(`tiktok.scraper.js`) se conserva como respaldo.

| Cosa | Valor correcto |
|---|---|
| Autorización | `https://www.tiktok.com/v2/auth/authorize/`, `client_key` = App ID |
| Scope (FIJO en código) | `user.info.basic,user.info.profile,user.info.stats,video.list,comment.list,comment.list.manage` (`comment.create` no existe y tumba todo) |
| `business_id` | el `open_id` del canje · cabecera **`Access-Token`** · canje con **`client_id`** |
| Errores | **HTTP 200 con `code != 0`** en el cuerpo |
| `create_time` | string de segundos · `video_id` obligatorio en hide/pin/like |
- Pedir un campo no autorizado da `40130` a toda la llamada (el perfil reintenta con lo mínimo).
- Solo videos **públicos** (uno «Amigos» devuelve `[]` con `code: 0`).
- Los tokens rotan; se persisten con **`updateMany` buscando por el refresh token** (una cuenta puede
  estar en varios negocios). Solo `invalid_grant` borra tokens.
- `respondida` se sincroniza solo en una dirección; la moderación en las dos. Borrar comentarios no
  se expone. Revocación solo si ningún otro negocio comparte el token. `DELETE /api/auth/cuenta`
  **no revoca** tokens (por eso `scripts/mover-tiktok.js` funciona).

### 8.3 Instagram — encendido desde 2026-08-26
Sabor **Facebook Login** (no Instagram Login): token en `graph.facebook.com`, página con
`instagram_business_account`. Aprobados: `instagram_basic`, `instagram_manage_comments`,
`pages_show_list`, `pages_read_engagement`. **`pages_manage_metadata` RECHAZADO** (no hacía falta:
la llamada de suscripción nunca funcionó y se retiró; la desuscripción se conserva).
- Con `META_LOGIN_CONFIG_ID` puesto, Meta **ignora el `scope` del código** y usa la Configuración
  `4655107931374707`: al tocar permisos, los dos sitios.
- Permisos en acceso estándar no se piden a quien no tiene rol en la app (no rompen el login).
- Interruptor `lib/instagramVisible.js`: solo el literal `'true'`; `conectar` responde **404**
  (no 403) a quien no lo tiene; una cuenta **ya conectada nunca se esconde**. Apagar:
  `INSTAGRAM_ACTIVO=false`.
- Diagnóstico de «0 páginas utilizables»: (1) enlazado solo por Centro de cuentas (no sirve: hay que
  vincular a una PÁGINA — primer punto de `igPasos`); (2) página en un portfolio comercial (falta
  `business_management`); (3) permiso viejo («Editar configuración»). Primero, imprimir identidad y
  scopes del token.
- Un redirect de OAuth tiene que aterrizar donde se lea su parámetro (`ig_error` no se leía).
- La API **no da la foto** de quien comenta (círculo con inicial). Comentarios paginados (25
  publicaciones, 50 por página, tope 300, 40 peticiones extra compartidas); orden: más viejo primero;
  el corte se decide con el cursor `after`. Moderar en Instagram no está hecho.
- Webhook (`lib/webhookMeta.js`, `webhooks.routes.js`, montado ANTES de `express.json()`, firma sobre
  el cuerpo crudo, acepta los dos secretos — Meta firma con el de la app de Instagram —, responde 200
  antes de procesar, descarta el eco propio, exento del rate-limit). Hoy no llega ningún evento.
- Límite estructural: una cuenta sin página de Facebook no puede conectar (haría falta el sabor
  Instagram Login, con otro App Review). No cambiar ahora.

### 8.4 Menciones
`Resena` (ficha, con rating, se responde) · `ComentarioSocial` (publicación propia, se responde) ·
`Mencion` (perfil ajeno, se va a la plataforma por su `url`). Clasificador por **diccionario**
(`nlp/sentimiento.js`), no IA. **Lo que no podemos entregar no se muestra**: `fuentesDisponibles()`
solo devuelve fuentes vivas; sin ninguna, el nav esconde el ítem y la ruta da 404. `externalId` con
prefijo de fuente; `notificada` evita reenvíos; archivar ≠ borrar; términos 3-8 caracteres, máx. 8.
Solo Negocio/Franquicia. X/Twitter eliminado (el tier gratuito cerró); `Plataforma.TWITTER` queda
huérfano a propósito (borrar un valor de enum de Postgres es caro). TikTok: solo con proveedor de
pago — se enchufa en `tiktokMenciones.scraper.js` (`consultarProveedor()` + `normalizar()`).

### 8.5 Facebook Reviews — completo, oculto
Interruptor `lib/facebookVisible.js` (`FACEBOOK_ACTIVO` / `FACEBOOK_CUENTAS_PRUEBA`, esta última con
las dos cuentas del dueño). Permiso: **`pages_read_user_content`** (no `pages_read_engagement`, que
devolvería reseñas vacías sin error).
- Facebook tiene **recomendaciones**, no estrellas: positive → 5, negative → 1 con
  `sinEstrella: true` (columna `Resena.sinEstrella`); sin ninguna de las dos, se descarta.
  `autorResenasTotal` es `null`; un error devuelve `null` (≠ `[]`).
- `overall_star_rating: 0` con `rating_count: 0` es **ausencia de nota**: `sinValoraciones`, sin
  snapshot.
- Callback propio (el de Instagram descarta páginas sin IG). La rama del worker avisa negativas.
- Probado contra la API real (página «Notoria» `1211927292012805`); falta ver un `Recommendation`
  real (la página no tiene reseñas; con colección vacía Meta no valida campos).
- `node scripts/prueba-facebook.js` — 40.

### 8.6 Planes — la tabla de capacidades
`src/lib/planes.js` decide; `brand-shield-web/src/lib/planes.js` es su espejo (con los nombres por
idioma). `scripts/prueba-planes.js` (124) compara los dos, **barre `src/` y `scripts/`** buscando
listas de planes a mano (también las que empiezan por `'GRATIS'`) y barre los guiones de campaña.
🔴 Al añadir IMPULSO aparecieron tres fallos mudos por listas a mano: 999 negocios para el plan más
barato, renovación que cobraba una vez y nunca más, cancelar que regalaba el plan. **Se declara en la
tabla y los call-sites preguntan** (`puede()`, `limite()`, `planesCon()`, `PLANES_DE_PAGO`, `ORDEN`).
Ejemplo: la auto-respuesta usaba `plan !== 'GRATIS'` y dejaba pasar a IMPULSO (corregido 2026-10-02).
- 🔴 **«Fallar cerrado» no es una dirección fija**: `capacidades()` cae a GRATIS ante un plan
  desconocido (correcto para negar funciones), pero la dormancia no duerme un plan desconocido
  (dormir a quien paga es el error caro).
- Tope real de negocios: **`negociosPermitidos(plan, localesExtra)`**; `localesExtra` tiene que
  llegar a `req.cuenta` (el `select` del middleware lo pide desde 2026-10-02: antes llegaba
  `undefined` en silencio). `negociosVigilables` corta por antigüedad en el worker.
- IMPULSO: 1 negocio, escaneo 12 h, 25 IA/semana, 3 competidores, 1 asiento, PDF mensual,
  escalación, **vigilancia de la ficha** (Contact Data), parte para el equipo. Sin redes, menciones,
  constancia ni equipo.
- ⚠️ La app Android tiene su copia (`Modelos.kt`: `esPago`, `etiquetaPlan`): un plan nuevo que falte
  ahí deja al suscriptor con la app en modo gratuito.
- El panel nunca indexa `PLAN_LABELS[...]`: es una **función** (mapa → función rompió la barra lateral).

### 8.7 El costo de Google Places (único costo variable)
Places legacy por millar: Basic $17 · Contact +$3 · Atmosphere (reseñas) +$5. Escaneo de negocio
$0.022-0.025; de competidor $0.017. Frenos (ninguno da señal si se rompe; solo sube la factura):
`HORAS_COMPETIDOR = 24*7` (un rival se relee una vez por semana) · `obtenerCompetidorCompartido`
(un place ID una vez por ciclo; gratis si es un negocio monitoreado) · `obtenerFichaGoogleCompartida`
(una ficha una vez por ciclo; la clave incluye `conContacto`; los planes con contacto van primero;
un `null` no se cachea) · `tocaLeerContacto` (Contact Data una vez al día, marca `_leidoEn` dentro de
`fichaGoogleRef`; `business_status` va en Basic y se mira siempre). Un local de Franquicia cuesta
**$9.10/mes**. **Al subir cualquier cadencia, hacer la cuenta antes** (bloque 8 de
`prueba-costo-places.js`).

### 8.8 Sumar y quitar locales sin pasar por el alta
`lib/localesExtra.js` + `GET/POST /api/pagos/locales` + bloque `MisLocales` de `dashboard/planes`.
- **Prorrateado** hasta el vencimiento, que **no se toca** (el `detalle` del intento solo lleva
  `localesExtra`; `prueba-locales.js` bloque 13 lo vigila sobre la llamada real).
- Contra la **tarjeta guardada**; **piso S/5** (`PISO_CENTIMOS`): por debajo entra gratis pero entra.
- `diasPeriodo` del calendario real; `diasRestantes` con `ceil` (a favor del cliente); redondeo UNA
  vez sobre el total; la promo aplica igual que en la renovación; comprobante con descripción propia.
- Bajar no devuelve dinero y solo hasta los negocios **activos** cargados (`LOCALES_EN_USO`).
- El panel **no calcula** el importe (lo pide al GET) y no depende del interruptor mensual/anual.
- `PLAN_SIN_LOCALES` (Impulso) apaga el bloque con su propio texto. Sin tarjeta (`SIN_TARJETA`,
  cuentas con plan dado a mano) explica en vez de ofrecer.
- `Pago.tipo = LOCAL_ADICIONAL` (String; quien lo pinta necesita respaldo `|| p.tipo`).
- Nunca ejercitado con dinero real (exige NEGOCIO/FRANQUICIA con tarjeta guardada).

### 8.9 Dormancia del plan gratuito y palancas de costo (2026-09-19)
| | |
|---|---|
| Competidores | cada 7 días (todos los planes) |
| Gratuito | 24 h el primer mes (`diasPruebaCompleta`), **72 h** después; **se pausa** a los 30 días sin entrar (`DIAS_INACTIVIDAD`), aviso por correo el día 27 |
| Franquicia | 2 h |
- `lib/dormancia.js`. **La pausa se DERIVA** de `ultimoAcceso || creadoEn`; no hay columna
  `pausada`. `pausa.worker.js` solo manda el aviso: es prescindible.
- `ultimoAcceso` se marca en **tres puertas** (login, Google, carga del perfil) con throttle de 6 h y
  sin `await`. `null` = cuenta anterior a la columna (cae a `creadoEn`).
- El cron pregunta a `dormancia.horasEscaneo(usuario)`; `HORAS_ESCANEO[plan]` sigue siendo el
  cooldown del **botón manual**.
- Se anuncia en catálogo, landing, comparativa, FAQ **y JSON-LD de `layout.js`**: lo que el worker
  deja de hacer tampoco se promete.
- Economía medida: un gratuito costaba S/4.39/mes para siempre; tras las palancas, la conversión de
  equilibrio de Impulso bajó de 24,5% a 2,8%. Margen bruto sobre Places; faltan Culqi, Railway,
  Vercel y Groq para decir «rentable».
- `node scripts/prueba-dormancia.js` — 90.

---

## 9. Comprobantes y facturación electrónica (SUNAT)

**SEE-Del Contribuyente**, emitiendo desde el backend con el Certificado Digital Tributario gratuito
(vigente **27/07/2026 – 26/07/2029**; en producción como `SUNAT_CERT_P12_BASE64`, decodificado a
memoria). Precio publicado **incluye IGV** (S/59 = 50.00 + 9.00); el IGV es **residuo**. Lógica
tributaria aislada en `src/lib/tributario.js`.

- `services/comprobante.service.js`: emisión **idempotente por pago** (`Comprobante.pagoId` único) y
  correlativo atómico (`UPDATE … RETURNING`). `validarEmisor()` y `validarReceptorParaSunat()`
  **antes de pedir número** (la numeración no admite huecos). Si falta algo no se emite y se avisa:
  **nunca se degrada a VOUCHER a escondidas**.
- PDF con QR (`comprobante.pdf.js`); el comprobante va al cliente y **copia aparte** (no BCC) a
  contabilidad. XML firmado y CDR en la tabla (`@db.Text`).
- **Identificación obligatoria desde S/700** (`tributario.requiereIdentificacion()` — preguntarle a
  la función, no a la memoria); si faltan datos, 409 `DATOS_FISCALES_REQUERIDOS` **antes de crear
  nada en Culqi**. `handleCTA(plan, true)` al volver del formulario (sin el `true`, bucle).
  `razonSocial` y `direccionFiscal` se validan con largo máximo al guardar (SUNAT acota a 100).

**Correcciones ganadas contra el validador (no revertir):** `ds:` en los hijos de `KeyInfo` (2335) ·
`cac:PaymentTerms` en facturas (3244) · `schemeAgencyName="PE:SUNAT"` (4256) · en el resumen,
`cac:Status/cbc:ConditionCode` y el orden `cac:Status → sac:TotalAmount → sac:BillingPayment →
cac:TaxTotal` (2522) · receptor solo si la boleta lo identifica · `cac:Signature/cbc:ID =
SignatureSP` · `sac:DocumentNumberID` sin ceros · `CustomizationID` del RA = 1.0.
🔴 **Ninguna fecha a SUNAT con `toISOString()`** (UTC → 2236 entre las 19:00 y medianoche de Lima):
`tributario.fechaPeru()` / `horaPeru()`. Un error con nodo `"/"` no señala el sitio: **bisecar**.

| Se anula | Con qué | Plazo |
|---|---|---|
| Factura | Comunicación de baja **RA** | 7.º día desde la emisión |
| Boleta | Resumen diario **RC** en estado 3 | 7 días desde el **CDR del resumen** |

**Dos colas:** facturas (`envioSunat.worker.js`, `sendBill`, cada 10 min, filtro positivo `tipo:
'FACTURA'`) y boletas (`resumenSunat.worker.js`, `sendSummary` por día **cerrado**, `5-59/10`,
ticket persistido antes de terminar; `EN_PROCESO` → consultar, **nunca reenviar**; `getStatus`
statusCode 98 = procesando). `RECHAZADO` no se reintenta; `ERROR_TRANSPORTE` sí (1, 5, 15, 60, 180,
360 min). El CDR de una boleta vive en el **resumen**.

**Lo que enseñó producción:** usuario SOL secundario `NOTORIAS` (el principal es `LEOTHDAY`, mismo
largo) necesitaba **opciones asignadas** (`TRIBUTARIOS → Comprobantes de pago → SEE - Del
Contribuyente y Envío de Documentos`, ramas *Servicio de Envío…* y *Consultar Envíos de CPE*) —
sin ellas SUNAT responde `0102` igual que ante una clave mala. Credenciales escapadas en el XML.
`getStatus` con ticket alfanumérico devuelve 200 vacío (los tickets son numéricos).
**Antes de cualquier cobro real con cambios en facturación: `scripts/sonda-sunat-produccion.js`.**
**Correr los scripts que tocan SUNAT o Culqi con `railway run`/dentro del entorno de producción y
LEER la cabecera de entorno del simulacro** (en local apuntan a beta/test).

**Anular:** `scripts/anular-boleta.js <numero> --aplicar` (marca ANULADO solo si SUNAT aceptó). 🔴
**Reembolsar en Culqi NO anula el comprobante**: orden SUNAT acepta → reembolsar → anular. Aviso
automático (`lib/anulacionPendiente.js` + cron 8:00 + aviso inmediato desde el webhook), con el
comando exacto, urgente, hasta una semana después de vencido. Un reembolso **parcial** no se anula:
corresponde nota de crédito (el webhook avisa). `diasRestantes` con `floor`.

**Cambiar el domicilio fiscal:** `DOMICILIO_FICHA_RUC` en `tributario.js` (cinco campos, todo o
nada) y `CONTACTO` en `web/src/lib/contacto.js`; primero desplegar, inmediatamente después cambiar
en SUNAT. `node scripts/prueba-emisor.js`.

**Obligaciones mensuales** (RVIE → RCE → 621): `docs/obligaciones-tributarias-mensuales.md`. El
desplegable del SIRE dice si un periodo está presentado. Trámites: Registro de Exportadores de
Servicios (sin él la exportación lleva IGV). Nada de esto es asesoría tributaria.

**Historial real:** 3 cobros de prueba (S/1 el 23/08, S/14.50 IMPULSO el 28/08 con promo, renovación
S/14.50 el 29/08 desatendida), los tres reembolsados; boletas B001-00000001/2/3, las tres ANULADAS;
6 resúmenes (tres pares informa/anula — para saber qué lleva un resumen, leer su `xmlFirmado`).
**Cargos reales de clientes: cero.**

---

## 10. Libro de Reclamaciones (Ley 29571 · D.S. 101-2022-PCM)
`POST /api/reclamaciones` **sin autenticación** (la norma lo exige), rate-limit 10/hora solo en el
POST. Numeración por año (`2026-000001`, reintento ante choque del `@unique`). Constancia al
consumidor + aviso interno; si Resend falla, queda guardada. RECLAMO ≠ QUEJA. Plazo **15 días
hábiles** (`lib/reclamaciones.js`, sin feriados a propósito). Registro legal: conservar 2 años, sin
datos de prueba.
**Se gestiona por terminal** (`scripts/reclamaciones.js [todas|ver <n>|responder <n>]` con `railway
run`): guarda datos personales de terceros; no hay rol de administrador a propósito (nota en
`auth.middleware.js`). Responder manda primero el correo y solo entonces marca RESPONDIDO. Cron 9:00
avisa lo que vence en ≤5 días hábiles.

---

## 11. Equipo: compartir la cuenta
`Usuario` = la persona; `Cuenta` = la empresa en la que trabaja. **El propietario no tiene fila en
`miembros`** (su rol se sintetiza). Piezas: `lib/equipo.js`, `equipo.routes.js`, `dashboard/equipo`,
`/invitacion/[token]`.

| Plan | Asientos (cuentan al dueño) |
|---|---|
| GRATIS / IMPULSO | 1 |
| NEGOCIO | 3 |
| FRANQUICIA | 10 |

Permisos: `ver` · `actuar` · `negocios` · `conexiones` · `facturacion` · `equipo`. PROPIETARIO los
seis; GESTOR `ver`+`actuar`; LECTOR `ver`. `conexiones` separado de `actuar`; **toda la facturación
es del propietario** (también lecturas). 🔴 **Ruta que no es GET lleva su `permitir(...)`.**
- **`resolverCuenta` va DENTRO de `autenticar`**: si no, `usuarioId: undefined` es un filtro que
  Prisma ignora y devolvería datos de todos. Cabecera **`X-Cuenta`** (declarada en `allowedHeaders`);
  `cabecerasAuth()` de `lib/api.js` para los `fetch` sueltos.
- Corte por asientos **por antigüedad**, en tres sitios que coinciden (`resolverAcceso`,
  `equipoDeCuenta`, `cuentasDe`); bajar de plan no borra membresías. Invitaciones pendientes ocupan
  asiento. 🔴 **Invitar y aceptar cuentan asientos dentro de una transacción con
  `pg_advisory_xact_lock(hashtext('equipo:'+cuenta))`** (2026-10-02; antes dos aceptaciones
  simultáneas se colaban). `$executeRaw`, no `$queryRaw` (la función devuelve `void`).
- Alcance por sede: `negociosIds` (vacío → `null` = todos), aplicado con `AND`, nunca pisando `where.id`.
- Invitación atada al correo (`CORREO_DISTINTO`); `GET /invitacion/:token` público con limitador
  30/15min; se acepta con BOTÓN (los antivirus abren enlaces); si el correo no sale se borra y 502;
  reenviar emite token nuevo. Cuota de IA de la CUENTA. Alertas copiadas a GESTORES. Registro de
  actividad con autor congelado, solo para el propietario. Salir no exige permiso. 403
  `SIN_ACCESO_CUENTA`/`SIN_ASIENTO` → `AuthContext` borra `bs_cuenta` y explica. Cambiar de cuenta
  recarga la página.
- 🔴 **Lo que lleva idioma se compone en el panel; del backend viaja el valor** (`rol`, `periodo`).
- Probado en vivo el 2026-08-22 de punta a punta. `node scripts/prueba-equipo.js` — 48 (los dobles
  de `auth.middleware` deben devolver `permitir` y poner `req.cuenta`).

---

## 12. Escaneo, detección y alertas

**Cadencia:** Gratis 24 h → 72 h · Impulso 12 h · Negocio 4 h · Franquicia 2 h. Cron cada hora
(`dormancia.horasEscaneo(usuario)`); cuentas pausadas fuera antes. El reloj del cron es el **último
`Snapshot`**; **`ultimoEscaneo` es el reloj del botón manual** (única excepción: negocios sin ficha de
Google). El botón se conserva por el primer escaneo de un negocio recién conectado; el panel dice
«Revisado hace X · automático cada N h» con `ultimaRevision` (último snapshot).

**Señales del detector** (`nlp/detector.js`):
| Señal | Estado |
|---|---|
| Palabra crítica · 1★ sin texto | ✅ |
| Texto duplicado (normalizado, ≥15 caracteres) | ✅ — etiqueta «Campañas coordinadas» (enum `CUENTAS_NUEVAS`, id intocable) |
| Ráfaga por volumen (`compararMediciones` + `ritmoHabitual`, umbral relativo) | ✅ |
| Caída de rating (contra el snapshot anterior) | ✅ |
| **Reseña negativa nueva** (`alertarResenaNegativa`, 2026-08-22) | ✅ — la única señal individual; sin ella el producto no avisaba de nada (1783 escaneos, 0 alertas) |
| Cuentas recién creadas | ❌ imposible (`autorResenasTotal: null` en todas las fuentes) — **decisión: no se hace ni se promete** |
| Picos por número de negativas | ❌ Places entrega 5 reseñas como máximo |
- Silencios de `alertarResenaNegativa`: no en el **primer barrido** (calculado ANTES del snapshot), no
  reseñas de **>30 días**, y va por `notificar()` (respeta preferencias). No sustituye la escalación
  de 24 h (`revisarEscalacionesUrgentes`, va directo sin preferencias).
- Promedio de las reseñas nuevas: margen `0.05·(N1+N2)/k`; cifra exacta solo si el margen ≤0.5, si no
  la cota, y **sin cifra si el intervalo no toca [1,5]** (pasa cuando Google borra reseñas). Nunca un
  número inventado.
- **Vigilancia de la ficha** (`lib/fichaGoogle.js`, `Negocio.fichaGoogleRef`): ficha cerrada para
  todos (Basic, sin costo); teléfono/horario/nombre/dirección (Contact Data) desde Impulso. Un valor
  que pasa a `null` no es cambio. Tipo `FICHA_ALTERADA` va directo, no se puede apagar.
- ⚠️ **Al agregar un `TipoAlerta`:** enum de Prisma, `TIPOS_VALIDOS` en `auth.routes.js`,
  `tiposActivos` del worker, `ICONO_ALERTA` en `Icons.js`, `alertas/page.js`, `web/src/lib/alertas.js`
  y `Modelos.kt`. El panel pinta con `textoAlerta()`, nunca `{a.descripcion}` crudo (respaldo en
  español).
- **Correo de alerta:** específico si trae `detalle.rating` (asunto «Reseña de 1★ en…», cita, botón a
  la reseña `?tab=resenas&resena=<id>`, enlace al expediente y diagnóstico de temas); genérico sin
  `detalle` (escalación de 24 h y token de Facebook expirado). Bilingüe.
- 🔴 **El idioma de un correo son DOS mitades**: plantilla Y el `select` del worker con `idioma`.
  `prueba-correos-idioma.js` obliga a clasificar cada correo nuevo (`BILINGUES` / `SOLO_ESPANOL`).
  El insight semanal lo escribe la IA: el idioma se le pide a ella.
- **Rechazo de Google**: Places responde **200 con `status: REQUEST_DENIED`**. `lib/saludPlaces.js`
  cuenta respuestas (3 rechazos seguidos = rechazada; `NOT_FOUND`/`ZERO_RESULTS` no cuentan);
  `GET /health/monitoreo` da 503 con motivo (`google_rechaza`, `escaneo_detenido` si pasan 3× la
  cadencia sin snapshot con alguien despierto, `sin_comprobar`), caché 60 s. `/health` no toca la
  base (liveness de Railway).

### Cuánto correo manda Notoria (`lib/prefsCorreo.js`, 2026-09-09)
Resumen por negocio **mensual (día 1) por defecto**, o semanal el día que se elija; ventana de 7 o 30
días según cadencia; calendario de **Lima**. Aviso por reseña negativa: **GRATIS 1 correo cada 5**
(`loteAvisoResenas` en `planes.js`), pago al momento. `Alerta.notificada` = «ya salió un correo que la
cubre» y es el acumulador del lote: **nunca marcarla a ciegas** (`notificar()` devuelve si mandó). El
`select` del worker pide `prefsAlertas`. El panel arranca de las preferencias **resueltas** del perfil.
🔴 **`PATCH /api/auth/preferencias-alertas` es un MERGE** (2026-09-11): `conservar()` → lo válido del
cuerpo, si no lo guardado, si no el default; los `tipos` uno a uno. Antes pisaba con defaults lo que
el cliente no mandaba (la app Android no manda `resumen`). La app vieja instalada sigue mandando
`umbralNegativas` siempre: eso no lo puede arreglar el backend (está como control en
`prueba-prefs-correo.js`, 96).

**Comentarios sociales:** `publicacionId` habilita responder (sin él, 422); `respondida` solo si la
plataforma confirmó; un comentario guardado no se pisa; `null` ≠ `[]`; cada red comprueba lo suyo en
su rama; `moderacionRemota` por fuente; `guardarComentarioSocial()` compartido por webhook y barrido.

---

## 13. Funciones del producto

- **Espejo «Cómo te ven»** (`GET /:id/espejo`): las reseñas en el orden de Google por relevancia; el
  aviso de «sin responder» solo para ≤3★.
- **Simulador** (`lib/rating.js`): aritmética pura. 🔴 Desde 2026-10-02 cada meta trae su **rango**
  (el rating publicado está redondeado a ±0.05) y el panel dice «entre X y Y» y que son aproximadas.
- **Progreso mensual** (`lib/progreso.js`): mide **reseñas ganadas**, no rating (los ratings no se
  mueven en un mes); `null` ≠ 0; deltas negativos se informan; mejora de rating solo si ≥0.2; 409
  `SIN_DATOS` → la tarjeta se esconde. Variable `progresoMes` (no `progreso`).
- **Panel accionable** (`lib/score.js`, `lib/temas.js`, `lib/tareas.js`): score 0-100 movido intacto
  al backend; solo rating y volumen son historizables (`componentesFijos`); serie por día de **Lima**
  (`fechaPeru`). Tendencia de temas por **porcentaje** sobre reseñas con texto, con dos ejemplos.
  Tareas como `tipo + datos`, solo de datos que existen.
- **Temas por rubro** (2026-09-20): universales (demora, trato, limpieza, precio) + propios de
  comida, salones/spa, bar/discoteca, hotel; el resto solo universales. Vocabulario sacado de
  **reseñas reales** de cada rubro. `temasDeRubro(null)` devuelve todos (ruido antes que silencio);
  los seis call-sites pasan el rubro. `prueba-temas.js` — 96.
- **Estrellas a soles** (`lib/impacto.js`): Luca (HBS 12-016), **rango, nunca cifra única**, solo
  restaurante/bar/cafetería (`TIPOS_APLICABLES`); hotel y demás → 404 `SIN_ESTIMACION`. Facturación
  por rangos, no se guarda.
- **Parte para el equipo** (`lib/parteEquipo.js`): los números los pone el código, la IA redacta;
  `sanear()` y `cifrasCoherentes()` porque **el prompt no basta** («para que NO haga algo, código»).
  Plantilla sin Groq; caché semanal; no gasta cuota; desde IMPULSO; 409 `SIN_MATERIAL`; botón
  «Enviar por WhatsApp» (`wa.me/?text=`, como `<a>`). En el correo semanal sin llamar a Groq.
- **Carteles QR** (`lib/cartel.js`, espejo byte a byte en el web): cuatro tamaños sobre A4 (mural,
  mostrador, mesa, etiquetas 7×7). Maqueta pura compartida por PDF y vista previa SVG. Sin logo sobre
  el código, estrellas como camino de puntos, maqueta desde abajo, nivel M, **≥0,4 mm por módulo**,
  pie «Hecho con Notoria» (no «verificadas»). Sin `verificarPlan`. Probado impreso en un local real.
  `prueba-cartel.js` — 100 (bloque 7 lee el texto real del PDF: flujos comprimidos y `TJ` partido por
  kerning).
- **Afiche de la pared** (`afiche.generator.js`): una sola cosa en la que enfocarse.
- **Constancia de reputación** y **expediente** de extorsión: payload firmado verificable en
  `/verificar/<codigo>`, sin tabla. Constancia 90 días; expediente 365 días con huella del texto. Guarda
  de **tipo** cruzada (sin ella un expediente se verificaba como constancia). Firma con
  **`DOCUMENTOS_SECRET`** (verifica también con `JWT_SECRET` para lo ya emitido). El expediente arma
  la evidencia; **no da asesoría legal ni afirma que una reseña sea falsa** (impreso en el PDF; 15
  comprobaciones de `prueba-expediente.js` lo vigilan). Para el chantaje de un particular la vía es la
  denuncia penal (art. 200 CP), INDECOPI si es un competidor.
- **Enlace de venta `/para/<slug>~<placeId>`**: Server Component (tarjeta OG en WhatsApp), `noindex`,
  `PARA_BLOQUEADOS` en caliente (410), limitador por ruta (todas las visitas llegan de la IP de
  Vercel), `TIPOS_COMPARABLES`. `scripts/enlaces-venta.js` ordena por prioridad.
- **Widget del hero** (`AnalisisGratis.js`): sin auth, caché 6 h por placeId (en memoria: con varias
  instancias duplicaría consultas).
- **Drip** (10:00 Lima, días 2/5/7, la etapa avanza ANTES de enviar) y **recordatorio de
  verificación** (10:30 Lima, días 4 y 8, token regenerado y guardado antes de enviar; pasados 10 días
  no se insiste).
- **Competencia en el resumen** (`lib/competencia.js`, no un TipoAlerta): avisa del rival que sacó
  ventaja real (`VENTAJA_MINIMA_RESENAS`).
- **Ruta comercial `/ruta`** (2026-09-25): página oculta del promotor externo. Solo los correos de
  `RUTA_COMERCIAL_ACCESO` (`dueno` ve todo y escribe la comisión pagada); al resto, el mismo 404 que
  una ruta inexistente; `noindex`, no va en `robots.txt`. Comisión (contrato, modelo C): 50% del primer
  mes a precio de lista sin IGV + 10% de cada pago por 12 meses; atribución si la visita es anterior y
  el primer pago llega en ≤60 días; se gana con el 2.º pago (mensual) o a los 15 días (anual).
  **Derivada de los `Pago` reales**, no guardada. Vínculo por correo y, de respaldo, por el
  `placeId` de Maps (`elegirCuenta`: la que pagó primero). Estado automático (`estadoEfectivo`).
  Desde 2026-10-02: **las visitas no se borran, se ANULAN con motivo**; `cambios_visita` guarda antes
  y después de correo, local, fecha, estado y comisión pagada; cada visita guarda
  **`politicaComision`** y el cálculo usa ESA versión (`POLITICAS`; al cambiar reglas se añade
  versión, no se editan las constantes). Desde 2026-10-05 el residual se calcula sobre lo
  **efectivamente cobrado** (`monto − montoReembolsado`): un reembolso parcial lo reduce en proporción
  (contrato 7.4). `prueba-ruta-comercial.js` — 59.
- **Documentos del promotor** en `docs/promotor/`: `Manual-Notoria` v1.2 y `Contrato-Promotor-Notoria`
  (.docx editable + .pdf), actualizados el 2026-10-05 con el estado automático, las visitas que se
  anulan, el historial, la política de comisión fijada por visita, el reembolso parcial, la política
  de cambio de plan y la auto-respuesta fuera de lo disponible. Versiones de setiembre en
  `docs/promotor/anteriores/`. **Quedan en blanco a propósito** (se llenan al firmar): jurisdicción
  (16.1), carteles QR por mes (5.b), monto mínimo de liquidación (8.4) y los datos de las partes.

---

## 14. Seguridad — lo que no hay que reintroducir

| | Regla |
|---|---|
| Escaneo global | `monitoreo-manual` exige `negocioId` y pertenencia; `ejecutarAhora` exige `{ global: true }` |
| Tokens al navegador | `lib/negocioPublico.js` (denylist; `prueba-negocio-publico.js` falla ante un campo `*Token/*Secret` nuevo; no muta el original) |
| **Tokens OAuth en la base** | 🔴 **Cifrados AES-256-GCM** (`lib/cifradoTokens.js`, clave `TOKENS_CLAVE`) como **extensión del cliente de Prisma** (`lib/prisma.js`): se cifra al escribir y descifra al leer en cualquier modelo y profundidad. IV determinista (TikTok busca por refresh token); un filtro por token busca cifrado Y claro; valor sin prefijo `enc:v1:` se lee tal cual; cifrado ilegible → `null` (red desconectada, no excepción). Los scripts con `new PrismaClient()` ven el cifrado. Verificado en producción el 2026-10-03 (token de TikTok cifrado y TikTok responde) |
| Cabeceras web | CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS en `next.config.ts` |
| OAuth state | HMAC + 10 min; GBP comprueba el dueño del negocio antes de firmar |
| **Google Business** | `POST /api/auth/google-business/url` autenticado devuelve la URL de Google; **la sesión ya no viaja en la URL** (`GET /iniciar` → 410). Antes además ignoraba `tokenVersion` |
| Correos | normalizados; búsquedas insensibles a mayúsculas |
| Google Sign-In | `email_verified` antes de enganchar a una cuenta existente |
| HTML en correos | `esc()` en el punto donde entra texto ajeno (no dentro de `p()`/`btn()`); casos en `prueba-escape-emails.js` |
| `trust proxy` | `1`, nunca `true` |
| **Errores** | Un **5xx devuelve «Error interno del servidor» + `requestId`**, nunca `err.message`; 4xx conserva su mensaje. Toda respuesta lleva **`X-Request-Id`**, también en el log del error |
| **Secretos obligatorios** | `configProduccion.js` al arrancar; el webhook de Culqi **falla cerrado** sin secreto |
| **IA** | Texto de terceros dentro de `<datos_de_terceros>` (sin `< >`) y el sistema dice que no son instrucciones; salida validada (sin enlaces ni correos); cuota con **reserva atómica** (`UPDATE … WHERE iaUsos < límite`) antes de Groq, devuelta si falla |
| **Auto-respuesta** | 🔴 **Oculta hasta que GBP funcione** (decisión 2026-10-05): sin `gbpConectado` no se puede publicar ninguna respuesta, así que el bloque de Configuración no se pinta y la fila salió de la comparativa del landing (los dos idiomas). Vuelve sola cuando haya negocios con GBP conectado. Solo con `capacidades(plan).autoRespuesta` y si `requiereRevisionHumana()` es falso (salud, plagas, seguridad, discriminación, autoridades, lenguaje legal o reseña sospechosa → la decide una persona; palabras completas para las críticas, prefijos para el resto) |
| **Borrado de cuenta** | `lib/borrarCuenta.js` en **una transacción**, sin `.catch` vacíos, con `verificarBorrado` después. Con historial fiscal **anonimiza** (Ley 29733 cede ante la obligación de conservar) y disocia el titular de los pagos |
| Sesiones | `tokenVersion` en el JWT (`v`); todo `jwt.sign` pasa por `firmarSesion` |
| Cambio de contraseña | Confirmación por correo (token con el hash nuevo firmado, 30 min, botón, reintento = OK) |

Sesión en `localStorage` con CSP que conserva `unsafe-*`: migrar a cookie HttpOnly está **diferido**
(rehacer ~30 `fetch`, CSRF y la app Android con Bearer). RUC fuera del pie y del menú de la app (Ley
32080), dentro de las páginas legales y comprobantes; el domicilio en el pie se queda (decisión
2026-08-22: no se muda a oficina virtual).

---

## 15. Reglas de producto y de contenido

- 🔴 **Lo que el worker no ejecuta no entra al landing, catálogo, comparativa ni FAQ — y lo que deja de
  ejecutar tampoco.** En los **dos idiomas** y en el **JSON-LD de `layout.js`** (el FAQ está
  duplicado ahí). Términos y Devoluciones también: el 2026-10-02 Términos listaba solo dos planes,
  prometía GBP y Facebook como disponibles, y Devoluciones un prorrateo que no existía.
- **Cifras con URL pública visible o no entran**: 292 M reseñas bloqueadas y 13 M fichas falsas
  (blog de Google 2026) · 5-9% por estrella (Luca, HBS 12-016) · 31% solo usa ≥4.5★ (BrightLocal LCRS
  2026).
- **Soles solo para restaurante, bar y cafetería** (decisión 2026-09-20).
- **Detección por perfil del autor: no se hace ni se promete.** Lo que sí: texto duplicado entre
  cuentas, 1★ sin comentario, palabras críticas, ráfagas por volumen. Decir «señales» y que quien
  decide si una reseña es falsa es la plataforma.
- **Lo que no podemos entregar no se muestra** (sin «próximamente»).
- 🔴 **Al corregir un mensaje, la lista incluye las IMÁGENES** (og-image, piezas de `marca/`, tarjetas
  de `campana/`): un PNG no sale en un `grep`. Se abren y se miran.
- Capturas del panel en el landing (`PanelShowcase`): **datos anonimizados** («Cevichería El
  Muelle»); zoom 1.3 antes de capturar; marco a `maxWidth: 900`; carga ansiosa.
- `/precios` recibe tráfico de la app (`abrirPlanes()` en `Navegacion.kt`): no cambiar la ruta. La app
  no vende (comisión de Play).

---

## 16. Patrones y trampas conocidas

**Código**
- Turbopack: hero vacío o recargas en bucle → borrar `.next`. `next dev` puede servir CSS rancio bajo
  el mismo hash.
- Componentes definidos dentro de otros → inputs que pierden el foco.
- Nunca un «cargando» global sobre una página pública (el landing servía 38 caracteres y rompió la
  verificación de Google, el SEO y Ads). `'use client'` no impide el SSR.
- `toFixed()` devuelve **cadena** (`"0.00"` es truthy). `undefined` interpolado en un texto se imprime:
  pasar `null` explícito.
- `var()` no sirve fuera de CSS (WebGL/canvas: `VERDE_MARCA`).
- PDFKit: `seguro()` (WinAnsi ≠ latin1); nada de ★ (sale `&`).
- El panel usa ~1000 estilos inline: hover/focus vía la capa `.panel` de `globals.css` con un velo
  (`box-shadow inset`), `!important` en bordes de campos; un `md:hidden` no gana a un `display` inline;
  backticks dentro de `<style jsx>` cierran el template literal.
- 🔴 **`.catch(console.error)` en una pantalla de monitoreo es grave**: «no hay alertas» y «no pude
  consultarlas» no pueden verse igual. Igual con `res.ok` sin mirar y con un 429/5xx que expulsaba al
  login (`AuthContext` solo borra la sesión ante 401).
- SVG: nunca `preserveAspectRatio="none"` con círculos; `min-width` = ancho del viewBox con scroll en
  la caja, no en el documento.
- `<html lang>` en un `useEffect` que depende de `idioma`. Pestañas de la ficha en una fila deslizable
  (`flexShrink:0`); rejillas `auto-fit,minmax(…)` — `auto-fit` no colapsa con `gridColumn:'1/-1'`.
- Al convertir un mapa en función, buscar los `[` que lo indexan.
- Un fixture con `new Date()` hace pruebas que fallan solas ciertos días: **fijar la fecha y pasarla**
  (pasó a la 01:07 de Lima y los días 1-3 del mes).

**Entorno**
- PATH de usuario de Windows es `REG_EXPAND_SZ`: escribirlo en el registro conservando el tipo.
- `railway run` inyecta la `DATABASE_URL` **interna**: los scripts que necesitan secretos de
  producción Y la base llaman primero a `scripts/lib-env-produccion.js` (la sustituye por la del
  `.env`). Scripts que crean el cliente con `dotenv.config()` a secas (p. ej. `dar-plan.js`) van en
  local, no con `railway run`.
- El emulador de Android no arranca (CPU AMD sin AEHD): probar en el teléfono por USB.

**Verificación en navegador**
- Móvil: `brand-shield-web/scripts/proxy-movil.js` (sirve usenotoria.app sin X-Frame-Options/CSP en
  `localhost:3001`, que está en el CORS); **iniciar sesión dentro del iframe**; comprobar `innerWidth`
  del iframe (`resize_window` miente con la ventana maximizada); romper caché con un parámetro; usar la
  rueda para hacer scroll en el iframe.
- Sondas de desborde: un elemento con `right <= 0` está oculto (menú off-canvas), no desbordado;
  filtrar padres con `overflow` `auto/scroll/hidden`; verificar `location.pathname` tras cada salto (el
  panel rebota a `/login` mientras hidrata). Barrer rápido agota el rate-limit.
- `:focus` no se prueba con el navegador automatizado; el JS inyectado corre en un contexto aislado
  (no intercepta el `fetch` de la página); `title` también da nombre accesible.

---

## 17. Identidad de marca
Notoria · verde **`#0B7324`** · fondo `#141413` · superficie `#1A1A18` · texto secundario `#B0AEA5` ·
Georgia (`GEO`). Logo: la N asimétrica (`components/LogoNotoria.js`, **forma rellena**, el bisel es la
identidad; originales y `generar-logos.py` en `marca/`). El escudo sigue donde es semántico. «Panel de
control» en español, «Dashboard» en inglés (rutas `/dashboard`). OG image PNG 1200×630 desde SVG (el
comentario va DENTRO del `<svg>` o sharp no reconoce el formato). Tarjetas de campaña con
`marca/hacer-tarjeta.js` (Georgia, ancho medido; las dos de un video o ninguna). Guiones en
`campana/guiones/`; las imágenes de Kling no se regeneran y viven fuera del repo.

---

## 18. Pruebas y scripts (`brand-shield/scripts/`)

**CI:** `.github/workflows/ci.yml` corre en cada push/PR las suites que no tocan red ni base (39) y el
build del frontend, con `DATABASE_URL` ficticia (Prisma la exige aunque no se conecte). Excluidas
(manuales): `prueba-publico` (gasta Places), `prueba-culqi`, `prueba-sunat-beta`,
`prueba-resumen-beta`, `prueba-baja-beta`. Pasan también en local con entorno vacío. Las de firma
necesitan `node scripts/generar-cert-prueba.js` (el `.p12` de prueba está en `.gitignore`).
⚠️ El resultado es el **código de salida**: 16 suites no imprimen resumen.
⚠️ Los dobles de Prisma deben interceptar también `require('./prisma')` y `require('./culqi')` (los
usan las libs desde dentro) y modelar `$transaction`, `intentoCobro`, `eventoWebhook`.

| Suite | Qué vigila |
|---|---|
| `prueba-auditoria.js` (96) | Todo lo del 2026-10-02: cifrado, candados, estado de suscripción, cobros idempotentes, bandeja de webhooks, reconciliación, secretos obligatorios, auto-respuesta, IA atómica, política de comisión, firma de documentos, rango del simulador, borrado, GBP sin JWT. Cada bloque con control y comprobado en rojo contra el código anterior |
| `prueba-culqi-webhook.js` (16) | Tipos, `data` como cadena, secreto, reembolso por tipo, duplicados, pendiente ante fallo, 500 sin base, cierre en producción |
| `prueba-promo.js` (8) | Tabla de la promo, carrera con la misma tarjeta, liberación tras rechazo, doble clic |
| `prueba-locales.js` (111) | Prorrateo y la ruta levantada por HTTP (vencimiento intacto, importe exacto) |
| `prueba-planes.js` (124) | Tabla de capacidades, listas a mano en `src/` y `scripts/`, landing, guiones |
| `prueba-ruta-comercial.js` (59) | Acceso, comisión, Maps, anular, historial, política |
| `prueba-prefs-correo.js` (96) · `prueba-dormancia.js` (90) · `prueba-temas.js` (96) · `prueba-cartel.js` (100) · `prueba-panel.js` (83) · `prueba-parte-equipo.js` (66) · `prueba-expediente.js` (66) · `prueba-correos-idioma.js` (54) · `prueba-cableado.js` (52) · `prueba-gbp-visible.js` (53) · `prueba-equipo.js` (48) · `prueba-salud-places.js` (42) · `prueba-facebook.js` (40) · `prueba-alertas-resena.js` (35) · `prueba-costo-places.js` (31) · `prueba-verificacion.js` (31) · `prueba-anulacion-pendiente.js` (31) · `prueba-progreso.js` (28) · `prueba-escape-emails.js` · `prueba-negocio-publico.js` · `prueba-comprobantes.js` · `prueba-emisor.js` · SUNAT (`prueba-xml-firma`, `prueba-cola-envio`, `prueba-resumen-cola`) · Instagram, TikTok, drip, publico | Ver la cabecera de cada archivo |
| `monitor-uptime/prueba-monitor.mjs` (27) | Máquina de estados del monitor |

**Scripts de operación** (todos con simulacro por defecto y `--aplicar`):
| Script | Para qué |
|---|---|
| `respaldo.js [--verificar <ruta>]` | Copia JSON de la base (lo irrecuperable son los snapshots). Lleva datos de terceros: `respaldos/` en `.gitignore`. Último: 2026-10-02, 0 filas perdidas |
| `cifrar-tokens.js` (`railway run`) | Cifra tokens en claro y verifica que se descifran. Idempotente |
| `dar-plan.js <email> <PLAN>` (local) | Plan a mano (lista de `ORDEN`); no crea Pago ni comprobante |
| `borrar-usuario.js <email>` (local) | Llama a `lib/borrarCuenta.js`; avisa de snapshots; re-pregunta a la base |
| `reembolsar-cargo.js <chargeId>` · `anular-boleta.js <numero>` · `forzar-resumen-sunat.js` | Ver §9 (dentro del entorno de producción) |
| `armar-renovacion.js <email>` | Deja una cuenta del dueño lista para que el cron la cobre solo |
| `sonda-sunat-produccion.js` · `verificar-culqi-live.js` · `verificar-meta-secret.js` · `verificar-webhook-culqi.js` | Credenciales contra el proveedor real, con control |
| `embudo.js` · `auditar-pagos.js` | Fotos de solo lectura |
| `enlaces-venta.js` · `reclamaciones.js` · `recordar-verificacion.js` · `mover-tiktok.js` · `cuenta-revisor.js` · `limpiar-pagos-prueba.js` (solo `chr_test_`) · `set-culqi-keys.js` · `cargar-secreto.sh` · `ensayo-alertas.js` · `ensayo-detector.js` · `diagnostico-tiktok.js` · `sonda-tiktok-business.js` | Ver cabecera |
| `lib-env-produccion.js` | No es un script: arregla la `DATABASE_URL` interna de `railway run` |

🔴 **No escribir el cliente de una API antes de tener credenciales**, y el script de prueba llama al
mismo código que producción. Para saber si un endpoint existe: golpearlo sin token (404 HTML del
balanceador = no existe; error JSON = existe).

---

## 19. Estado actual y pendientes (2026-10-03)

### 📌 2026-10-02/03 — Auditoría profunda externa, corregida y en producción
Informe en `Downloads/auditoria_profunda_notoria_2026-10-02.txt`; **respuesta punto por punto en
`docs/auditoria-2026-10-02-respuesta.txt`**. Commits `d24adbd`, `0d22253`, `a8c7960` y el de
documentación. Base migrada (solo aditivo: `intentos_cobro`, `eventos_webhook`, `candados_job`,
`cambios_visita`, columnas en `visitas_comerciales` y `pagos.montoReembolsado`, UNIQUE de
competidores). Secretos nuevos `TOKENS_CLAVE` y `DOCUMENTOS_SECRET`.
- Hecho: todo el bloque de cobros y webhooks (§8.1), plan efectivo derivado (`lib/suscripcion.js`:
  una suscripción cancelada y vencida pierde el plan en el acto; el acceso, el perfil, la IA y los
  asientos usan el efectivo), candados para los **15** cron (`lib/candado.js`, tabla — no advisory de
  sesión por el pool), carreras de asientos/IA/promo, cifrado de tokens, GBP sin JWT, errores 5xx,
  request id, secretos obligatorios, auto-respuesta, borrado, ruta comercial, textos legales, rango
  del simulador, firma de documentos, retención (`docs/retencion-datos.md`), CI.
- Verificado en producción: arranque sin avisos de config, los 15 candados tomados y soltados,
  webhook (401/401/200 + bandeja + duplicado), token de TikTok cifrado y funcional, `/health/monitoreo`
  `ok`, textos legales servidos y chunk de `/ruta`.
- No aplicaba (comprobado): Franquicia a 1 h y el teléfono 955 en la web — el informe vio una
  versión vieja; el monitor externo ya existía.
- Diferido con motivo: cookie HttpOnly, worker separado, entidad Subscription completa, ledger de
  comisiones (antes de la primera liquidación), migraciones versionadas (cuando haya staging),
  métricas del detector (sin corpus etiquetado), catálogo generado entre repos.
- Fallos encontrados que el informe no veía: `localesExtra` no llegaba a `req.cuenta`; IMPULSO tenía
  auto-respuesta; Privacidad decía «tokens cifrados» sin serlo; GBP ignoraba `tokenVersion`;
  `prueba-cableado` fallaba sola los días 1-3 del mes.
- **2026-10-05 (cierre):** manual v1.2 y contrato del promotor actualizados (`docs/promotor/`);
  auto-respuesta oculta hasta GBP (panel + landing, desplegado y comprobado en producción); residual
  de la Ruta neto de reembolsos parciales (desplegado); `prueba-gbp-visible` ya no acusa a los
  comentarios; graphify reparado (PATH + hooks locales). La app Android no se tocó (decisión del dueño).

### Con fecha
| Cuándo | Qué | Quién |
|---|---|---|
| ya | **Guardar fuera de Railway** `TOKENS_CLAVE`, `DOCUMENTOS_SECRET`, `SUNAT_CERT_PASSWORD`, `JWT_SECRET`, `PROMO_HASH_SECRET`, `SUNAT_SOL_CLAVE` (con sus permisos) | Dueño |
| ya | **Tarjeta de Google**: Cloud, Google AI Plus y YouTube Premium cuelgan de la misma Visa débito ••••2224, marcada tras un rechazo. Cambiar el medio de pago (cancelar YouTube no arregla nada). Cloud cobra el día 1 o al llegar a PEN 200. Si suspenden, ahora sí llega «Notoria dejó de vigilar» | Dueño |
| al firmar | Completar los blancos del contrato del promotor (`docs/promotor/`, §13): jurisdicción, carteles/mes, monto mínimo, datos de las partes | Dueño |
| 05/10 | `malena@usenotoria.app` (NEGOCIO, renovación apagada) vence: el cron la bajará a GRATIS | Mirar |
| vie 16/10 | **Reenviar la solicitud de GBP** (§6) | Dueño |
| jue 22/10 | Declaración de setiembre (RVIE → RCE → 621) | Dueño |
| 01/11 | Ver que llega el resumen mensual (el del 01/10 fue el primero) | Mirar |
| 2027 | Declaración Anual de Renta 2026 | Dueño + contador |

### Solo el dueño
- **Screencasts de la segunda solicitud de Meta** (`submission_id 2252144948952187`; guion en
  `docs/app-review-meta.md` §8.3): toma A (`business_management`) grabable ya; toma B
  (`pages_read_user_content`) necesita una página con reseñas. Si solo sale la A, mandar la A sola.
  **No volver a pedir `pages_manage_metadata`.**
- Contador: IGV por servicios de no domiciliados (Railway, Vercel, Groq), PLE + Libro Diario.
- Google Cloud al correo de la empresa: agregarlo como propietario ANTES de quitar el personal.
- Publicar en Play (aplazado): personal u organización, US$25, ficha con capturas anonimizadas. El
  AAB se puede reconstruir; el keystore abre (RSA 4096, válido hasta 2054, SHA-1 `B5:74:06:…:56:BF`,
  huella del archivo `d3480fa3…`). La app no usa Google Sign-In nativo (el SHA-1 no se registra).

### Sin ejercitar con dinero real
Alta con locales adicionales y su renovación · sumar un local a mitad de periodo · la reconciliación
de un cobro real a medias (probada con dobles).

### App Android (al final, por decisión del dueño)
Instalar el APK con los arreglos de Alertas (lote resuelto, el campo solo viaja si se tocó) y del
cartel; el parte semanal en la app; notificación con una alerta real, PDF del comprobante, cancelar y
locales desde la app. Y, al retomarla: **esconder la auto-respuesta sin GBP** en `DetalleNegocio.kt`
(como el panel web, §14) y corregir el texto «Cifras de rating y reseñas cada domingo» (el resumen es
mensual por defecto, §12).

### Decisiones de negocio abiertas
Proveedor de menciones de TikTok (~US$100/mes) · TripAdvisor · de `propuesta.md` (fuera del repo)
quedan **#9 alerta del Espejo** (semanal, solo pago, +0,6% a +7% de Places) y **#10 el expediente
como caso** con estados y recordatorio.

### Decisiones tomadas (no volver a apuntarlas como tarea)
Circuito de entrada solo en español · correos legales/fiscales solo en español · historizar el score
de verdad no compensa · domicilio fiscal en el pie se queda · `britneyfarfan05@` y
`giorrnellprincipe@` son cuentas del dueño (no avisarles de la pausa) · detección por perfil no se
hace · soles solo para restaurante/bar/cafetería.

### Estado de la base de producción (2026-10-03)
12 usuarios · 8 negocios activos, 4 de ellos vigilados (el resto en cuentas gratuitas pausadas) · 2 470 snapshots · 5
competidores · 3 pagos (todos REEMBOLSADO) y 3 comprobantes (todos ANULADO) · 0 intentos de cobro ·
0 visitas comerciales · 2 tokens (TikTok, cifrados). Cuentas del dueño con plan dado a mano:
`didier@usenotoria.app`, `didierprincipe@gmail.com`, `revisormeta@usenotoria.app` (NEGOCIO),
`malena@usenotoria.app` (NEGOCIO, vence 05/10). **Cargos reales de clientes: cero.** El par que
conviene mirar junto: reseñas negativas nuevas vs. alertas creadas (su divergencia destapó el agujero
de agosto).

### Bugs abiertos
**Ninguno conocido** en backend ni web. App: la versión instalada sigue mandando `umbralNegativas`
siempre (lo arregla instalar la nueva).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `python -m graphify query "<question>"` when graphify-out/graph.json exists. Use `python -m graphify path "<A>" "<B>"` for relationships and `python -m graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `python -m graphify update .` to keep the graph current (AST-only, no API cost).