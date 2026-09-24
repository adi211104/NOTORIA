# Notoria — Guía de contexto para Claude Code

> Documento de **estado y reglas**, no diario. Se conserva lo que sigue siendo cierto y las
> lecciones que evitan repetir errores; la narrativa de cómo se llegó a cada cosa se
> compactó el 2026-08-19 (el historial completo está en git).

## 1. Qué es Notoria

Plataforma SaaS de monitoreo de reputación para **negocios locales del Perú** —restaurantes,
hoteles, bares, salones, tiendas, clínicas y más—. Detecta reseñas falsas, ataques de bots y
caídas de rating.

> ⚠️ **Decía «restaurantes y hoteles» hasta el 2026-09-20**, y eso ya no era cierto: el producto
> deja elegir **doce rubros** (`TIPOS_NEGOCIO` en `api/routes/negocio.routes.js`, espejado en
> `web/src/lib/tiposNegocio.js`) y la campaña se dirige también a bares, discotecas y salones.
> Importaba porque esta línea es lo primero que lee cada sesión y **se copia**: al escribir los
> guiones de la campaña se puso «restaurantes y hoteles» *porque el documento lo decía*, y hubo
> que corregirlo después. Estaba igual en los dos README y en el `package.json` del backend.

- Planes: **Gratuito** · **Impulso S/29/mes** (anual S/23/mes) · **Negocio S/59/mes** (anual S/47/mes) ·
  **Franquicia S/179/mes** (anual S/143/mes). 🔴 **Desde el 2026-08-25 todo plan de pago incluye UN
  local y los demás se cobran aparte** — S/39/mes en Negocio, S/99/mes en Franquicia (§8.7).
  Qué incluye cada uno vive en
  **`src/lib/planes.js`**, que es fuente única de CAPACIDADES igual que `precios.js` lo es del
  precio. **No volver a escribir `['NEGOCIO','FRANQUICIA']` a mano en ninguna ruta** — §8.6.
- Dominio: **usenotoria.app** · correo `hola@usenotoria.app` · teléfono público **+51 916 383 038**.
- **Servicio solo nacional**: todo negocio se crea con `pais: 'pe'` y la facturación va fija
  en `PE`. Las columnas siguen en el modelo para poder reabrir sin migrar, y
  `lib/tributario.js` conserva la lógica de exportación de servicios.
- **Razón social:** NOTORIA E.I.R.L., RUC **20616239466**, domicilio fiscal
  **Cal. Isla Filipinas Mza. G9 Lote 8, La Perla, Callao** (ubigeo `070104` — NO es Lima;
  SUNAT valida la dirección del comprobante contra la ficha RUC). Vive en
  `src/lib/tributario.js` (`EMISOR`) y en Términos y Privacidad.
- **Precios en soles** (PEN). Culqi solo cobra PEN y USD.

---

## 2. Repositorio, stack y comandos

> ### 🖥️ Dónde se trabaja: la PC del taller, desde el 2026-08-30
>
> **Nuevo entorno, mismo trabajo.** El proyecto vive en `C:\Users\Taller\Vigilio` y la sesión
> abre desde `C:\Users\Taller`. La PC de casa (`C:\Users\Admin\Downloads\Vigilio`) **deja de ser
> la máquina de referencia**: lo que esté solo allí no cuenta, y las rutas de este archivo que
> empiecen por `C:\Users\Admin\` son historia, no instrucciones.
>
> ⚠️ **Lo que cambia de verdad no es la ruta, son tres cosas que la máquina nueva no traía** y
> que ninguna prueba detecta porque no fallan, simplemente faltan — están en
> `docs/mudanza-de-pc.md` §9: **JDK/Android SDK** —✅ **instalados y comprobados el 2026-09-16**
> en `dev-tools/`; §19 lo dio por ausente 17 días de más—, **la extensión de navegador** —✅
> **instalada el 2026-08-30**; ojo, no
> basta con instalarla: la sesión tiene que arrancar con `--chrome` o las herramientas no se
> cargan— y **`respaldos/`**, que llegó vacía y ya se regeneró.
>
> ⚠️ **La memoria de Claude Code va por ruta**, así que la sesión del taller arrancó en blanco y
> las siguientes también empiezan por leer este archivo. Es la razón de fondo por la que todo lo
> que se decide acaba escrito acá y no en una conversación: el proyecto sobrevive a la sesión,
> la sesión no.

```
Vigilio/
├── brand-shield/          ← Backend (Node + Express + Prisma + PostgreSQL)
│   ├── src/
│   │   ├── api/routes/    ← Rutas REST
│   │   ├── scrapers/      ← google, facebook(stub), instagram, tiktok, tiktokBusiness, tripadvisor(base)
│   │   ├── nlp/           ← detector.js (reseñas con rating), sentimiento.js (menciones/comentarios)
│   │   ├── workers/       ← monitoreo, resumenSemanal, drip, envioSunat, resumenSunat
│   │   ├── alerts/        ← notificador.js (email, canal único)
│   │   ├── sunat/         ← certificado, ublInvoice, ublResumenBoletas, ublComunicacionBaja, firmaXades, billService
│   │   ├── utils/         ← emails.js (Resend), reporte/afiche/constancia generators (PDFKit)
│   │   └── index.js       ← entry point, CORS, rutas
│   └── prisma/schema.prisma
├── brand-shield-web/      ← Frontend (Next.js 16 + Tailwind 4 + Turbopack)
│   └── src/{app,components,context,lib}
├── marca/                 ← Logos, piezas de redes y `hacer-tarjeta.js` (§17)
└── campana/guiones/       ← Los 7 guiones de video. SOLO el texto: las imágenes no
                             están en git (`campana/README.md`)
```

> Los nombres de carpeta `brand-shield*` NO cambian (rompería imports). Solo la marca
> visible pasó de "Vigilio" a "Notoria".

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16.2.9, React 19, Tailwind 4, Turbopack |
| Backend | Node.js, Express 4, Prisma 5 |
| BD | PostgreSQL |
| Emails | Resend |
| IA | Groq — `openai/gpt-oss-20b` |
| PDF | PDFKit |
| Auth | JWT + Google Sign-In |
| Alertas | **Email (Resend), canal único.** El aviso que suena lo da la app Android |
| Pagos | **Culqi, llaves LIVE en producción.** Cobra dinero real |
| App Android | Clonado junto a `Vigilio` (repo `adi211104/APKNotoria`) — Kotlin + Compose, cliente de este mismo API |

```bash
cd brand-shield     && npm run dev   # backend, puerto 3000
cd brand-shield-web && npm run dev   # frontend, puerto 3001

cd brand-shield && npx prisma db push && npx prisma generate
```

> **Windows:** `prisma generate` falla con EPERM si el backend está corriendo (bloquea la
> DLL). Detenerlo siempre primero.

---

## 3. Variables de entorno

### brand-shield/.env
```
DATABASE_URL / JWT_SECRET / RESEND_API_KEY
EMAIL_FROM=Notoria <hola@usenotoria.app>
FRONTEND_URL / BACKEND_URL
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET     # proyecto GCP 798376364749
                                            # = ID `project-f1e03c17-f209-453e-a09`, nombre "My First Project",
                                            # org `didierprincipe-org`. La consola reescribe `?project=<numero>`
                                            # al ID sin avisar: parece que cayó en otro proyecto y NO es así
GROQ_API_KEY
META_APP_ID=2232447584255257                # app tipo NEGOCIO
META_APP_SECRET                             # ✅ ROTADO el 2026-08-22 y verificado contra la Graph API
META_IG_APP_SECRET                          # secreto de la app de Instagram 1305555994987658 — §8.3
META_LOGIN_CONFIG_ID=4655107931374707       # si está seteado, el OAuth manda config_id en vez de scope
META_WEBHOOK_VERIFY_TOKEN                   # sin ella el webhook responde 403 a propósito
META_REDIRECT_URI / META_GRAPH_VERSION      # opcionales
INSTAGRAM_ACTIVO                            # solo el literal 'true' abre IG a todos — §8.3
INSTAGRAM_CUENTAS_PRUEBA                    # correos que ven IG mientras tanto
FACEBOOK_ACTIVO / FACEBOOK_CUENTAS_PRUEBA   # lo mismo para Facebook Reviews — §8.5
                                            # ⚠️ CUENTAS_PRUEBA puesta el 2026-08-26 con las dos
                                            # cuentas del dueño, para poder GRABAR el screencast:
                                            # la fila estaba oculta hasta para él. ACTIVO sigue
                                            # sin poner, o sea invisible para todo cliente
GBP_ACTIVO / GBP_CUENTAS_PRUEBA             # lo mismo para Google Business — el día que Google
                                            # conceda cuota. Hoy sin poner, o sea apagado
META_REDIRECT_URI_FB                        # opcional; por defecto /api/redes/facebook/callback
TIKTOK_BIZ_CLIENT_ID / TIKTOK_BIZ_CLIENT_SECRET
TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET    # Display API, solo respaldo
MENCIONES_PROVEEDOR / _API_KEY / MENCIONES_MAX_POR_TERMINO   # sin proveedor contratado
CULQI_PUBLIC_KEY / CULQI_SECRET_KEY         # Railway: live. Local: test, a propósito
CULQI_WEBHOOK_SECRET                        # 20 caracteres máx — el panel de Culqi no admite más
PROMO_HASH_SECRET                           # ⚠️ no rotar sin vaciar promo_tarjetas
EMAIL_RECLAMACIONES / EMAIL_CONTABILIDAD    # ambas = didier@usenotoria.app desde el 2026-08-19.
                                            # ⚠️ Si CONTABILIDAD queda vacía, CUATRO avisos se apagan
                                            # en silencio (early return); RECLAMACIONES cae a hola@
PARA_BLOQUEADOS                             # place IDs a retirar de /para, se lee en cada petición
SUNAT_CERT_P12_BASE64 / SUNAT_CERT_PASSWORD / SUNAT_SOL_USUARIO / SUNAT_SOL_CLAVE
SUNAT_ENTORNO=produccion                    # ⚠️ sin esto apunta al BETA sin avisar
SUNAT_EMISION_ACTIVA=true                   # ENCENDIDO en producción desde el 2026-08-17
```

### brand-shield-web/.env.local
```
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_GOOGLE_CLIENT_ID
NEXT_PUBLIC_CULQI_PUBLIC_KEY     # Vercel: pk_live_. Se incrusta EN EL BUILD → exige `vercel --prod`
# NEXT_PUBLIC_WHATSAPP_VENTAS     ← RETIRADA el 2026-09-16: ya no se lee y se borró de Vercel.
                                  # El número del botón flotante sale de `src/lib/contacto.js`,
                                  # la misma fuente que el pie. Si reaparece, es una 2.ª copia
```

**Auditoría de variables (2026-08-19).** Se cruzaron las 49 que lee `src/` contra las 49
puestas en Railway. Resultado: **ninguna otra laguna**.
- **14 se leen y no están puestas, y las 14 están bien así:** ocho tienen respaldo en el
  código (`EMISOR_RUC`, `EMISOR_DIRECCION`, `EMISOR_UBIGEO`, `SUNAT_ENDPOINT`,
  `SUNAT_CERT_P12_PATH`, `PORT`, `META_REDIRECT_URI`, `TIKTOK_REDIRECT_URI` — todas con
  `|| valor`), y seis están apagadas a propósito (`INSTAGRAM_ACTIVO`, las tres
  `MENCIONES_*`, `PARA_BLOQUEADOS`, `TRIPADVISOR_API_KEY`).
- **14 están puestas y no las lee `src/`:** once son `RAILWAY_*` que inyecta la plataforma,
  `CULQI_PUBLIC_KEY` y `DATABASE_URL` las usan scripts, y `NEXT_PUBLIC_GOOGLE_CLIENT_ID` es
  una variable del frontend que quedó suelta en el servicio del backend (inofensiva; borrarla
  cuesta un redespliegue porque `variable delete` no admite `--skip-deploys`).
- **Ninguna variable vacía** —`''` es falsy y se comporta igual que ausente— ni con espacios
  ni con BOM, y las llaves de Culqi miden los 24 caracteres que deben medir.

El comando que reproduce el cruce:
```bash
grep -rhoE "process\.env\.[A-Z0-9_]+" src/ | sed 's/process\.env\.//' | sort -u > /tmp/code.txt
railway variables --service api --kv | grep -oE "^[A-Z0-9_]+" | sort -u > /tmp/rw.txt
comm -23 /tmp/code.txt /tmp/rw.txt   # se leen pero no están
comm -13 /tmp/code.txt /tmp/rw.txt   # están pero no se leen
```

📋 **Para mudar el proyecto a otra PC: `docs/mudanza-de-pc.md`.** El código se clona; lo
que hay que llevar a mano son **cinco archivos** fuera de git (los dos `.env`, el `.p12`, el
`.jks` y su `keystore.properties`) y ninguno debe viajar por un canal sin cifrar: el `.env` del
backend lleva la `DATABASE_URL` de producción y el `JWT_SECRET`. ⚠️ Y no vale «si se filtra lo
roto»: `PROMO_HASH_SECRET` no se puede rotar sin vaciar `promo_tarjetas`, y `JWT_SECRET`
invalida las constancias en circulación.

📋 **Inventario completo en `docs/secretos.md`** (sin valores): qué secreto existe, dónde está
su única copia y —lo que de verdad ordena la lista— **qué haría falta para volver a tenerlo si
se perdiera**. Con esa vara solo dos son graves: la contraseña del certificado
(`SUNAT_CERT_PASSWORD`, sin la cual el `.p12` es un archivo inútil y hay que tramitar otro ante
SUNAT) y el keystore de Android. `SUNAT_SOL_CLAVE`, que es la que suele preocupar, se resetea
en cinco minutos.
- ⚠️ **Railway no es un respaldo**, es un servicio del que se depende.
- ⚠️ El `certificado.p12` real vive **fuera del repo**, en una carpeta estable de la máquina —
  en el taller, `C:\Users\Taller\notoria-secrets\`. **Nunca en `Downloads`**, que se limpia sola.
  Los `.p12` están cubiertos por `.gitignore` y ninguno está en git (comprobado el 2026-08-23).
- ⚠️ **Anotar los PERMISOS junto a la clave, no solo el valor.** El usuario SOL `NOTORIAS`
  estaba activo y con el nombre correcto y aun así fallaba, porque no tenía asignada ninguna
  opción del menú (§9).

**Reglas de secretos:**
- Las llaves **live no van en archivos locales**. `.env` y `.env.local` se quedan con las de
  test; `set-culqi-keys.js` se niega a escribir `*_live_*`.
- 🔴 **Cargar secretos por stdin SIEMPRE desde bash con `printf '%s'`.** En PowerShell, el
  pipe hacia un ejecutable nativo antepone un **BOM UTF-8 invisible**: una llave de Culqi
  quedó de 25 caracteres en vez de 24 y devolvía 401 exactamente igual que si estuviera
  revocada. `printf` además no agrega el salto de línea que sí agrega `echo`. Comprobar
  después con `railway variables --service api --kv` y contar caracteres (Culqi mide 24).

  ```bash
  printf '%s' 'sk_live_...' | railway variable set CULQI_SECRET_KEY --stdin --service api
  ```
- `railway variable set` dispara redeploy salvo `--skip-deploys`; `variable delete` **no
  admite** esa bandera y siempre redespliega. `--skip-deploys` **no aplica la variable al
  contenedor en marcha**.
- ⚠️ **Rotar `JWT_SECRET` tiene efectos en cadena:** invalida las sesiones, los states de
  OAuth, los tokens de cambio de contraseña y **todas las constancias en circulación**.

---

## 4. Despliegue

Los CLIs de Railway y Vercel están instalados, autenticados y linkeados. Git funciona: rama
`main`, remoto `origin` = **https://github.com/adi211104/NOTORIA**, `gh` en
`C:\Program Files\GitHub CLI\gh.exe`, autenticado como `adi211104`. **Commitear y pushear al
cerrar cada bloque de trabajo.**

🔴 **Y comprobar en qué RAMA quedó, que no es lo mismo.** El 2026-08-31 se descubrió que `main`
no tenía **11 commits** del 30/08 por la tarde: vivían en `worktree-planes-en-scripts`, la rama
de un worktree de Claude Code. O sea que todo lo de la Organization account, la tercera solicitud
de GBP, el arreglo de `agencia@` y `didier@` en Cloudflare y el cambio mensual→anual estaba
fuera de la rama principal — y **`main` llevaba dos días sin pushear** por su lado.
- ⚠️ **Lo que lo hace peligroso no es perder código, es el CLAUDE.md.** Las dos ramas lo editan,
  así que durante esos días el archivo de `main` **afirmaba cosas que ya se sabían falsas** —que
  `didier@usenotoria.app` tenía regla de Email Routing, cuando el 30/08 se había comprobado que
  no y que llevaba días perdiendo los informes DMARC. Un documento de estado en una rama que
  nadie fusiona es peor que no tenerlo: se lee con la misma confianza y va desfasado.
- **Se detecta con `git log --all --oneline` o `git branch -av`**, no con `git log` a secas, que
  solo enseña la rama actual. Y `git worktree list` dice si hay worktrees vivos.
- ⚠️ **Al terminar en un worktree, fusionar antes de cerrar.** El merge del 31/08 no dio ni un
  conflicto (los archivos de código eran disjuntos y CLAUDE.md se auto-fusionó), así que el coste
  de haberlo hecho el mismo día habría sido cero.
- 🔴 **Un merge sin conflictos no es un merge verificado.** Git auto-fusionando CLAUDE.md puede
  dejar conviviendo una afirmación y su corrección. Después del merge hay que **buscar la
  contradicción a mano** —acá, qué decía la tabla de Email Routing— y **correr las suites**,
  porque el auto-merge tocó `pago.routes.js` y `localesExtra.js`. Salieron 250+ en verde.

```bash
cd brand-shield     && railway up --service api --detach   # → https://api.usenotoria.app
cd brand-shield-web && vercel --prod --yes                 # → https://usenotoria.app
```

### 🔴 En una PC nueva, el enlace de Railway apunta al proyecto EQUIVOCADO

Pasó el 2026-08-31 y costó un rato porque **todos los síntomas mandan a mirar donde no es**. En
la PC del taller, `brand-shield/` estaba enlazado al proyecto **`brand-shield`** —uno viejo, con
un solo servicio homónimo y **sin `DATABASE_URL`**— en lugar de **`notoria-api`**, que es el que
sirve `api.usenotoria.app`. En la cuenta hay **cuatro** proyectos (`brand-shield`, `Vigilio`,
`notoria-api`, `authentic-cooperation`) y solo uno es el bueno.

```bash
railway variables --service api            # → Service 'api' not found
railway run --service api node x.js        # → Service not found
```

🔴 **Y lo peor con diferencia: `railway up --service api` NO avisa.** Imprime el nombre del
proyecto, un enlace al panel y termina con éxito aparente — **sin subir ni construir nada**. Se
detectó porque el campo nuevo no aparecía en la respuesta de producción después de un deploy
«correcto». El contraste es lo que lo delata:

| | Salida |
|---|---|
| Servicio inexistente | `✓ Project <nombre>` + enlace. **Nada más** |
| Servicio real | **`Indexing... Uploading...`** + *Build Logs* |

⚠️ **La regla de §5 aplicada a los despliegues: no dar por bueno un `railway up` por su salida.**
Lo que prueba que entró es un **cambio observable en la respuesta** — un campo nuevo en un JSON,
o `railway ssh … grep -c <algo> <archivo>`. Acá la sonda fue pedir la ficha pública y comprobar
que traía la clave `impacto`.

🔴 **La trampa en la que caí, y que conviene no repetir.** Ante el `Service 'api' not found` di
por hecho que el servicio se había renombrado y **reescribí los 17 comandos de este archivo** a
`--service brand-shield`. **Estaban bien desde el principio.** Antes de «corregir» documentación
que lleva meses funcionando, comprobar contra qué proyecto se está hablando: `railway status` lo
dice en su primera línea. Es el mismo error de método que el «404 de control» — ante un fallo,
preguntar primero si el método distingue, en vez de creerle al primer mensaje.

**La comprobación que zanja el asunto, porque separa un proyecto del otro de un vistazo:**

```bash
railway status                                    # Project: tiene que decir notoria-api
railway variables --service api --kv | wc -l      # ~51 variables. El proyecto malo tiene 8
railway link --project notoria-api --service api  # si no cuadra
```

⚠️ **Y lo que demostró que producción NO estaba rota** —porque durante un rato lo pareció— fue
mirar producción, no los logs: `/health` respondiendo y, sobre todo, **un 401 en
`/api/auth/login` con credenciales falsas**, que prueba que la tabla se consulta bien (un 500
diría lo contrario). Los logs alarmantes eran de otro servicio.

### 🔴 Vercel bloquea el deploy por el AUTOR de git, no por quién lanza el comando

Descubierto el 2026-08-31, y es el cuarto coletazo de la mudanza. `vercel --prod` respondía:

```
{"status":"error","reason":"deploy_failed","message":"Not authorized"}
```

**Ese mensaje manda a mirar donde no es.** `vercel whoami` decía `adi211104`, `vercel api
/v9/projects/notoria-web` leía el proyecto sin problema y el usuario es **OWNER** del team: la
autenticación estaba perfecta. El motivo real solo aparece **consultando el deployment**, que
queda registrado en estado **`BLOCKED`** con su `errorMessage`:

> *Git author `padkar4@gmail.com` must have access to the team «adi211104's projects» on Vercel
> to create deployments.*

- 🔴 **La causa: en la PC del taller git quedó configurado al revés** — `user.name` era
  `didierprincipe@gmail.com` (un correo en el campo del nombre) y `user.email` era
  **`padkar4@gmail.com`**, que no es miembro del team. El único miembro es
  `didierprincipe@gmail.com` (username `adi211104`).
- ⚠️ **Vercel mira el autor del COMMIT, no quién ejecuta el comando.** Por eso no se arregla
  volviendo a iniciar sesión, que es lo que sugiere «Not authorized». Y por eso **no bastaba con
  cambiar la config**: los commits ya hechos conservan el autor viejo, así que hace falta **un
  commit nuevo** con la identidad corregida para que el deploy pase.
- **Arreglado con `git config --local`** (no `--global`, para no tocar nada fuera de este repo):
  `user.name = Didier Principe`, `user.email = didierprincipe@gmail.com`.
- ⚠️ **Se hereda al clonar en otra máquina**, así que va en la lista de la mudanza: comprobar
  `git config user.email` **antes** del primer deploy, no después.
- 🔴 **Y `--local` arregla UN repo, no la máquina. `NotoriaApp` se quedó fuera hasta el
  2026-09-16**, con `user.name = adi211104` y `user.email = padkar4@gmail.com` — o sea que todos
  los commits de la app de las últimas semanas están firmados con el correo que no es. Ahí no
  rompe ningún deploy (a APKNotoria no lo despliega Vercel), por eso nadie lo notó: **el mismo
  defecto, y mudo, porque el síntoma que lo delató en Vigilio no existe en ese repo.** Ya
  corregido. Al clonar cualquier repo nuevo, `git config user.email` antes del primer commit.

🔎 **Cómo se lee el motivo real de un deploy fallido** (el CLI no lo dice):

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' \
  vercel api "/v6/deployments?projectId=<prj_...>&limit=1"   # → state y errorMessage
```

⚠️ **Un `BLOCKED` no rompe nada**: la versión anterior sigue sirviéndose. Pero tampoco avisa —
si nadie mira, el arreglo simplemente nunca llega a producción y todo parece normal.

**Leer o cambiar ajustes del proyecto de Vercel sin abrir el navegador:** `vercel api <ruta>`
usa la autenticación del propio CLI, así que no hay que tocar el token ni iniciar sesión en el
panel. Con esto se comprobó que Web Analytics ya estaba encendido:

```bash
vercel api "/v9/projects/notoria-web"    # trae webAnalytics, speedInsights, etc.
```

🔴 **Desde Git Bash hay que desactivar la conversión de rutas de MSYS**, o el `/v9/...` se
convierte en `C:/...` y el CLI responde *"Invalid arguments. Use an API path starting with /"*
— un error que parece decir que la ruta está mal escrita cuando el problema es el shell:

```bash
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' vercel api "/v9/projects/notoria-web"
```

**El despliegue lo hace el agente sin preguntar** (autorizado el 2026-08-18). La excepción
es `prisma db push`: altera el schema de producción, va **antes** del deploy y se avisa aparte.

⚠️ **`git push` NO despliega nada.** Railway no está conectado al repo.

⚠️ **`railway up` siempre desde `brand-shield/`.** La raíz del repo está enlazada a otro
proyecto y correrlo desde ahí crea un servicio basura.

### ✅ Migración de `localesExtra` — APLICADA el 2026-08-25

`Usuario.localesExtra Int @default(0)`. Aditiva y con default, así que se usó la vía corta:
`npx prisma db push` **desde local antes** de `railway up` (el `.env` local apunta a producción).
Se deja escrito el orden porque es el que hay que repetir la próxima vez.

⚠️ **Sin ella, cualquier consulta sobre `usuarios` revienta en cuanto se despliegue el código
nuevo**, porque el cliente de Prisma desplegado pedirá una columna que la BD no tiene — login
incluido. O sea que las dos cosas van juntas y en ese orden.

```bash
cd brand-shield
# 0. QUÉ va a cambiar, antes de tocar nada. `db push` no lo dice; esto sí.
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
npx prisma db push          # 1. la columna, ANTES (es aditiva: el código viejo sigue vivo)
npx prisma generate         # 2. con el backend detenido, o EPERM
railway up --service api    # 3. el código
cd ../brand-shield-web && vercel --prod --yes
```

🔴 **El paso 0 es el que faltaba en esta receta y el que hay que conservar.** `db push` responde
«Your database is now in sync» tanto si aplicó el cambio como si no hizo nada, así que no sirve
de comprobante **ni de aviso previo**. `migrate diff` **antes** enseña el SQL exacto que se va a
ejecutar —el 2026-08-25 fue un solo `ALTER TABLE ... ADD COLUMN` con default, que es lo que lo
hacía seguro— y **después** devuelve «This is an empty migration», que es la única prueba de que
entró. Comprobar además la columna en `information_schema` cuesta una consulta y cierra el
asunto.

### 🔴 Orden obligatorio: DESPLEGAR primero, MIGRAR después

`railway ssh --service api "npx prisma db push"` corre **dentro del contenedor**, así que lee
el `schema.prisma` **desplegado**. Corrido antes de desplegar, Prisma compara el schema viejo
contra la BD y responde *"The database is already in sync"* — la respuesta más engañosa
posible: parece éxito y es un no-op.

```bash
cd brand-shield
railway up --service api                                               # 1. desplegar
railway ssh --service api "grep -c ModeloNuevo prisma/schema.prisma"   # 2. si da 0, el deploy no entró
railway ssh --service api "npx prisma db push --skip-generate"         # 3. recién ahora
```

Alternativa usada últimamente: `npx prisma db push` **desde local** (el `.env` local apunta a
producción) **antes** de `railway up`. Válido solo para cambios **aditivos** — añadir tablas,
columnas con default o valores de enum es compatible con el código viejo que sigue corriendo.
Al revés, el cliente de Prisma desplegado selecciona columnas que la BD no tiene y **se cae
cualquier consulta sobre esa tabla**, no solo la función nueva.

**Al QUITAR una columna, el orden es el mismo pero por el motivo contrario.** Se hizo el
2026-08-22 con `Usuario.telegramChatId` y funcionó así:

1. Quitarla del `schema.prisma` y **desplegar** — el cliente de Prisma se regenera sin ella.
2. Comprobar en el contenedor que el schema desplegado ya no la tiene *(la sonda sirve: da 1
   con la versión vieja y 0 con la nueva)* y que las consultas sobre esa tabla siguen vivas.
3. Recién entonces `railway ssh --service api "npx prisma db push --accept-data-loss --skip-generate"`.

🔴 Al revés se cae **cualquier** consulta sobre esa tabla —login incluido—, porque el cliente
desplegado sigue pidiendo una columna que la BD ya no tiene.

🔴 **Y hay un cuarto paso que no estaba escrito: `npx prisma generate` EN LOCAL.** Al quitar
`telegramChatId` se regeneró el cliente del contenedor (vía `postinstall`) pero no el de esta
máquina. Mordió un día después, el 2026-08-23, y lo peor es **cómo se esconde**: una consulta
con `select` explícito no toca la columna y sigue funcionando perfectamente —así se leyeron
decenas de filas de producción sin notar nada—, pero el primer `update` sin `select` devuelve la
fila entera y revienta con *«The column `usuarios.telegramChatId` does not exist in the current
database»*, un mensaje que suena a que **la BD** está mal cuando el desfasado es el cliente
local. Si aparece: `npx prisma generate` con el backend detenido (EPERM si está corriendo).

⚠️ **`db push` responde «The database is already in sync» tanto si acaba de aplicar el cambio
como si no hizo nada.** No sirve de comprobante. Lo que sí prueba el resultado es
`migrate diff` contra la BD real: antes de migrar generaba el `DROP COLUMN`, después devuelve
**«This is an empty migration»**. Y luego un 401 en `/api/auth/login` con credenciales falsas,
que confirma que la tabla se consulta bien (un 500 diría lo contrario).

⚠️ **Railway NO corre `prisma db push` en el deploy** (solo `prisma generate`, por el
`postinstall`).

```bash
# ¿La BD de prod coincide con el schema? "empty migration" = sincronizada
npx prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script
```

⚠️ Los comandos `!` del usuario corren en **Git Bash**, no en PowerShell. Y `railway` se
enlaza **por carpeta**.

---

## 5. Cómo verificar un deploy (esto ha fallado muchas veces)

**Nunca dar por buena una integración por el cartel verde de un panel ajeno.** Meta mostró
"Se probó correctamente el webhook" mientras nuestro servidor devolvía 403. La verdad está en
los logs del servidor y en un cambio observable en la salida.

| Qué se verifica | Cómo |
|---|---|
| Backend desplegado | Buscar un **cambio observable en la salida**, no fiarse del "SUCCESS". Ej.: un POST con firma inventada que ahora responde con el log en formato nuevo |
| ¿Existe una ruta? | Pegarle sin token: **401 = viva; 404 `{"error":"Ruta no encontrada"}` = no desplegada** (catch-all de `index.js`) |
| ⚠️ Excepción del truco | **No sirve en routers con `router.use(autenticar)` antes de las rutas** (`redes.routes.js`, `comentario.routes.js`, `pago.routes.js` y —comprobado el 2026-08-25— **`negocio.routes.js`**): el middleware corta antes de casar el path y **cualquier** path devuelve 401, exista o no. ⚠️ Ese día la sonda se dio por buena hasta que el **404 de control** devolvió exactamente lo mismo. Es el mismo patrón que `verificar-meta-secret.js`: ante un resultado, preguntar primero si el método distingue. Cuando no distingue, el veredicto correcto es «no concluyente», y la prueba buena pasa a ser `railway ssh … grep -c <ruta> <archivo>` |
| Mejor sonda | Una ruta pública con **cuerpo propio**. Ej.: `GET /api/equipo/invitacion/<64 ceros>` → 404 con `tipo: INVITACION_INVALIDA` prueba que el código nuevo corre. Acompañar siempre de un **404 de control** sobre una ruta inventada, para distinguir "ruta viva que rechaza" de "ruta que no existe" |
| Frontend | Para lo que vive en un **componente de cliente**: localizar la frase en `.next/static/chunks/` y **descargar ESE chunk desde producción**. `curl` a una página de cliente no muestra su contenido |
| Variables en el contenedor | `railway ssh --service api "printenv X"`, o un `node -e` que ejercite el módulo y devuelva su veredicto |

---

## 6. Estado de las integraciones

| Integración | Estado |
|---|---|
| **Google Places** | ✅ Habilitada y en uso (búsqueda de negocios, escaneo de reseñas públicas) |
| **Google Business Profile** | 🔴 **Bloqueado por Google hasta el 2026-10-16 como muy pronto, y desde el 2026-08-25 OCULTO tras interruptor** (`lib/gbpVisible.js`, gemelo de los de Instagram y Facebook; `GBP_ACTIVO` / `GBP_CUENTAS_PRUEBA`). Las GBP APIs quedan con cuota `Requests per minute = 0`, señal documentada de que no hay acceso concedido; `mybusiness.googleapis.com` (v4, la que lee y responde reseñas) ni aparece en la Biblioteca. Con cuota 0 el callback autoriza y revienta en `listarCuentas` → `?gbp_error=callback_failed`. ✅ **El motivo ya no es un misterio: las tres solicitudes se rechazaron por los 60 días de antigüedad del perfil** (correo del 2026-09-08, §19 A). Casos `3-5553000040900`, `0-4623000041642`, `6-5952000041022` |
| **Culqi** | ✅ LIVE en producción. Webhook de reembolsos registrado |
| **TikTok (Accounts API)** | ✅ Completo: perfil, videos, comentarios, responder, borrar respuesta, ocultar, fijar |
| **TikTok Display API** | Conservada como respaldo, sin usarse |
| **Instagram** | ✅ **ENCENDIDO para todos desde el 2026-08-26** (`INSTAGRAM_ACTIVO=true`). Meta aprobó los cuatro permisos que hacían falta. ⚠️ **Sin webhooks**: `pages_manage_metadata` fue RECHAZADO, así que los comentarios llegan por el escaneo periódico (§8.3) |
| **Menciones** | Motor y panel completos. Instagram es su **única** fuente, así que hoy la sección está invisible. TikTok exigiría proveedor de pago |
| **Facebook Reviews** | ✅ **Terminado el 2026-08-23 y OCULTO tras interruptor** (`lib/facebookVisible.js`, gemelo del de Instagram): scraper con `recommendation_type`, ruta de conexión, callback propio, desconexión, aviso por reseña negativa y fila en el panel. Sigue invisible hasta que Meta conceda **`pages_read_user_content`** (segunda solicitud, §19 A). ⚠️ Antes de encenderlo: **una llamada real contra una página con reseñas** |
| **TripAdvisor** | Solo base preparada a propósito (scraper + campos en schema + enum `TRIPADVISOR`). Sin ruta de conexión, sin cableado en el worker, sin UI. Decisión de negocio: activar cuando haya masa de hoteles |
| **SUNAT** | ✅ Emisión **ENCENDIDA** en producción |
| **WhatsApp / Telegram** | ❌ Eliminados como canal de alerta. WhatsApp sigue vivo solo como contacto comercial (botón de ventas, `/contacto`): **+51 916 383 038** desde el 2026-09-16, un WhatsApp Business con **saludo automático**. El número sale de `src/lib/contacto.js` — ver «📌 2026-09-16» |

**Infraestructura:** Railway (`notoria-api`, servicio `api` + Postgres), Vercel
(`notoria-web`), DNS en Cloudflare en "DNS only". Dominio verificado en Resend. Search
Console verificado (`public/googlebab20eafdad21f30.html` — **no borrarlo**, Google
re-verifica). DMARC en **`p=quarantine`** desde el 2026-08-19
(`v=DMARC1; p=quarantine; rua=mailto:didier@usenotoria.app`). Monitor de uptime: **`monitor-uptime/`** (Cloudflare Worker, cada 5 min, tres sondas: `/health`, el
landing y **`/health/monitoreo`** desde el 2026-09-23 — ver «📌 2026-09-23»), más el viejo
`.github/workflows/uptime.yml`, que se queda pero no cubre lo que promete (§19 B).

### Email Routing de Cloudflare — el catch-all está en **Drop**

🔴 **Regla que costó descubrir: solo llega el correo que tiene su PROPIA regla.** El catch-all
está puesto en **Drop**, así que cualquier dirección `@usenotoria.app` sin regla se **acepta en
SMTP y se descarta**. Desde fuera es indistinguible de una entrega correcta: el remitente ve
`delivered` y el mensaje no existe en ningún sitio.

| Regla | Acción |
|---|---|
| **Catch-all** | **Drop** — se deja así a propósito: reenviar todo invitaría spam a cualquier dirección inventada del dominio |
| `hola@usenotoria.app` | → `didierprincipe@gmail.com` (creada el 2026-08-19) |
| `revisormeta@usenotoria.app` | → `didierprincipe@gmail.com` (creada el 2026-08-20) |
| `didier@usenotoria.app` | → `didierprincipe@gmail.com` |
| `agencia@usenotoria.app` | → `didierprincipe@gmail.com` (arreglada el 2026-08-30 — **existía y estaba en Drop**) |

🔴 **El 2026-08-30 se descubrió que `didier@` NO tenía regla y llevaba tiempo perdiéndose.** Esta
misma tabla afirmaba lo contrario desde el 19/08, así que el documento estaba mintiendo sobre el
estado real. El **Activity Log** de Cloudflare lo dejó a la vista: en 24 horas Google reintentó
entregar su informe DMARC a `didier@usenotoria.app` **nueve veces**, todas con **`Delivery failed`**
y la última ya **`Dropped`**, mientras el correo a `revisormeta@` de la misma tarde figuraba
`Forwarded`. Se creó la regla y quedó comprobado (ver abajo).

⚠️ **Lo que eso significa hacia atrás, y hay que mirarlo:** a `didier@` van `EMAIL_CONTABILIDAD`,
`EMAIL_RECLAMACIONES`, el aviso urgente de **anular comprobantes** y —desde el 28/08— los
**informes DMARC**, que son la única evidencia que sostiene el `p=quarantine` (§6). Todo eso se
estaba aceptando y descartando **sin un solo error visible desde el emisor**: Resend seguiría
diciendo `delivered`. Es exactamente el fallo que esta sección documenta desde el 19/08, ocurrido
otra vez y en la dirección que más avisos críticos concentra.

🔴 **Y `agencia@usenotoria.app` YA EXISTÍA con acción `Drop`.** Se iba a usar para crear la cuenta
de Google de la organización (`docs/acceso-gbp-organization.md`), o sea que el código de
verificación se habría descartado en silencio y el bloqueo habría parecido cosa de Google. Lo cazó
**mirar la lista antes de crear nada**, que es el único motivo por el que el procedimiento pone la
comprobación de entrega como paso obligatorio y no como cortesía.

✅ **Las dos verificadas el 2026-08-30 con marca única** (`NOTORIA-PRUEBA-RUTAS-MTGL1Y7T`), y el
veredicto se leyó **en el Activity Log de Cloudflare, no en el buzón**: las dos filas dicen
**`Forwarded`**. El control que hace que eso valga es el propio historial: la **misma** dirección
`didier@`, seis minutos antes, decía `Dropped`.
⚠️ **La sonda del buzón NO habría servido, y conviene saberlo antes de repetirla:** Gmail
**deduplica** el correo que uno se manda a sí mismo por una dirección que reenvía de vuelta, así
que el mensaje aparece en Enviados y **nunca en Recibidos** — `in:inbox` daba cero con el reenvío
funcionando perfectamente. Ante un cero, preguntar primero si el método distingue.


`didierprincipe@gmail.com` es el **único destino verificado**, y es una dirección alterna de la
misma cuenta de Google que `usenotoria@gmail.com`, así que todo aterriza en ese buzón.

**Cómo se descubrió y cómo se cerró:** `hola@` había recibido 4 correos —los 4 avisos del Libro
de Reclamaciones del 2026-08-06— con `delivered` en Resend y **cero rastro** en los buzones.
El panel lo confirmó (7 días: 9 recibidos, 6 reenviados, **3 descartados**). Tras crear cada
regla se mandó un correo con una **marca única** y se comprobó que aterriza: `hola@` el
2026-08-19 y `revisormeta@` el 2026-08-20. Las dos llegaron a `usenotoria@gmail.com`.

⚠️ **Al añadir cualquier dirección nueva del dominio** —`contacto@`, `soporte@`,
`facturacion@`— hay que crearle su regla **en el mismo momento**, o se tragará el correo en
silencio y todo parecerá correcto desde fuera.

### Cómo auditar la entrega de correo sin mandar nada (Resend)

La API de Resend expone el historial con **solo lectura**, y es la forma de comprobar el
correo sin ensuciar buzones ni registros legales. `GET /emails?limit=100` pagina con
`after=<último id>`, y cada fila trae `to`, `subject`, `created_at` y **`last_event`**.

```bash
# la llave vive solo en Railway; así no hay que tocarla
railway run --service api node <script-que-consulta-api.resend.com>
```

Foto del 2026-08-19: **66 correos** entre el 2026-07-26 y el 2026-08-17 — 64 `delivered`,
1 `suppressed`, 1 `bounced` (`revisorculqi@gmail.com`, una cuenta de prueba). El dominio
figura **`verified`** en la región `sa-east-1`.

🔴 **Lo que `delivered` significa y lo que NO:** que el MX de destino aceptó el mensaje, no
que una persona lo haya visto. Con un reenviador como Cloudflare Email Routing en medio,
aceptar y descartar se ve exactamente igual que aceptar y reenviar. Por eso la comprobación
buena es **cruzar las dos puntas**: Resend dice que salió y llegó al MX, y el buzón de destino
lo tiene. Así se descubrió lo de `hola@` (§19 B4).

### DMARC — cómo se llegó a `p=quarantine` (2026-08-19)

La evidencia fueron los **8 informes agregados de Google** del 2026-08-04 al 2026-08-17:
**38 mensajes, 38 pasan, 0 fallan**. Solo hay dos remitentes y los dos alinean por SPF *y*
por DKIM, así que ninguno depende de una sola pata:

| Remitente | IPs | SPF | DKIM |
|---|---|---|---|
| Resend / Amazon SES | `23.249.215.x` | `send.usenotoria.app` pass | selector `resend`, `d=usenotoria.app` |
| Reenviador de Cloudflare | `104.30.10.x` | `usenotoria.app` pass | selector `cf2024-1`, `d=usenotoria.app` |

⚠️ **Lo que estos informes NO cubren, y hay que recordar si algo empieza a rebotar:** el
volumen es bajo (38 mensajes en 14 días), así que un remitente esporádico pudo no aparecer; y
**solo Google reporta** — ninguna ruta hacia Outlook/Yahoo está medida. Si alguna vez se manda
correo del dominio desde una herramienta nueva (un "enviar como" de Gmail, un CRM, un
facturador), **hay que meterla en SPF/DKIM antes**, porque con `quarantine` ya no falla en
silencio: va a la carpeta de spam del destinatario.

⚠️ **`sp` no está declarado a propósito**, así que los subdominios heredan `quarantine`. Es lo
correcto aquí: el `From:` de todo lo que sale es `@usenotoria.app`, y `send.usenotoria.app`
solo actúa como dominio del sobre (Return-Path), que DMARC no evalúa.

Se editó **la palabra dentro del registro existente**, no se creó uno nuevo: **dos TXT de
DMARC en el mismo nombre hacen que DMARC falle entero**. Verificado después contra tres
resolutores (1.1.1.1, 8.8.8.8, 9.9.9.9) y contando que siguiera habiendo **un solo** registro.

El siguiente escalón sería `p=reject`, pero no antes de varios meses de informes limpios con
más volumen del que hay hoy.

✅ **Los informes van a `didier@usenotoria.app` desde el 2026-08-28.** Antes iban a
`padkar4@gmail.com`, una dirección personal de prueba cuya cuenta de Notoria se borró ese
mismo día. Dos motivos, y el segundo importa más que el primero:
- 🔴 **Los informes DMARC son la ÚNICA evidencia que sostiene el `p=quarantine`.** Estaban
  llegando a un buzón que no es el de la empresa; el día que esa cuenta se cerrara, la serie
  se cortaría **sin que nada avisara** — y sin informes no hay forma de saber si algo empezó
  a fallar la alineación, que con `quarantine` significa correo nuestro en la carpeta de spam
  del cliente.
- Ahora el `rua` es **del mismo dominio** que el registro, así que desaparece la pregunta de
  la autorización entre dominios (un `rua` externo exige que el dominio receptor publique un
  registro que lo consienta; algunos emisores lo comprueban y otros no).

⚠️ **Se editó el registro existente, no se creó otro** — dos TXT de DMARC en el mismo nombre
hacen que DMARC falle entero. Comprobado después: Cloudflare siguió marcando **14 registros**
en la zona, y los tres resolutores (1.1.1.1, 8.8.8.8, 9.9.9.9) devuelven **uno solo** con el
valor nuevo. `didier@` tiene su regla de Email Routing activa, así que el correo aterriza.

⚠️ **Lo que todavía NO está probado: que llegue un informe de verdad.** Google los manda una
vez al día, así que hasta ~24 h después no hay prueba de entrega. Es el mismo criterio de
siempre: `delivered` en el remitente no es «alguien lo tiene» (§6, *Email Routing*). Si en dos
días no ha llegado ninguno, el sitio donde mirar es el buzón, no el DNS.

**Correo de la empresa:** `usenotoria@gmail.com` **es la misma cuenta renombrada**, no una
nueva — por eso no hubo migración de IAM ni del caso de soporte.
`didierprincipe@gmail.com` quedó como dirección alternativa y sigue entregando.
⚠️ **`padkar4@gmail.com` NO tiene acceso al proyecto de Google Cloud** y con esa cuenta la
consola cae en otro proyecto sin avisar.

---

## 7. Lo que está implementado

**Backend:** auth completo (registro, login, Google OAuth, verificación de email,
recuperación de contraseña con token hasheado de un solo uso, rate-limit estricto 10/15min en
auth, state OAuth firmado con HMAC) · CRUD de negocios con búsqueda en Google Maps ·
scrapers · monitoreo por cron con cadencia por plan · detector de bots/picos/caídas ·
notificador por email · preferencias de alertas · resúmenes periódicos · IA de respuestas
(Groq, límites por plan 3/100/300) · análisis IA de competidores · reporte PDF mensual ·
resumen por negocio con cadencia configurable (mensual por defecto) · auto-respuesta a reseñas
positivas · escalación de urgencias · carteles QR de reseñas en cuatro tamaños ·
comparación automática con competencia (Franquicia) · pagos Culqi con renovación, reintentos
y bajada de plan · comprobantes y facturación electrónica · Libro de Reclamaciones · equipo
con roles · webhook de comentarios de Instagram.

**Frontend:** landing bilingüe (ES/EN) con `IdiomaContext` · FAQ accordion · cookie banner ·
registro con medidor de fuerza de contraseña · onboarding de 3 pasos · dashboard con sidebar
agrupado · ficha de negocio con score, gauge SVG, historial de rating y QR · chat de
respuestas (30 plantillas + IA) · filtros de reseñas · competidores · planes · alertas
configurables · configuración · reportes PDF · facturación · conexiones · equipo · blog SEO
(5 artículos SSG) · widget público "analiza tu negocio gratis" · `/precios`, `/contacto`,
`/devoluciones`, `/libro-reclamaciones`, `/eliminar-datos`, `/para/<ficha>`,
`/verificar/<codigo>`, `/invitacion/<token>`, `/confirmar-cambio/<token>`.

**Internacionalización:** completa. Patrón `const TEXTOS = { es: {...}, en: {...} }` por
página + `useIdioma()` (`src/context/IdiomaContext.js`). El idioma se persiste en
`Usuario.idioma` y `AuthContext` lo sincroniza hacia `IdiomaContext`.

🔴 **El registro guarda el idioma del navegador desde el 2026-08-23, y antes no.** El hueco era
invisible: `bs_idioma` solo se escribe cuando alguien **pulsa** el selector, así que quien
entraba con el navegador en inglés veía la web en inglés —la detección siempre funcionó— pero
su cuenta nacía con el default `'es'`. A partir de ahí recibía cada correo del producto en el
idioma que no era, sin sospechar que había un ajuste que cambiarlo. O sea que todo el trabajo
de traducir los correos no le llegaba a nadie salvo a quien lo tocara a mano.
- La regla vive en **`idiomaPreferido()`**, exportada de `IdiomaContext` y usada por los dos
  sitios que la necesitan: el provider y `AuthContext.registro`. Uno de ellos no es un
  componente, que es justo por lo que la regla tuvo que salir del `useEffect`.
- El backend lo acepta como `z.enum(['es','en']).optional()`. **Opcional a propósito:** una
  petición sin el campo sigue funcionando y cae al default, igual que antes.
- Se comprueba sin crear ninguna cuenta: `idioma: 'pt'` devuelve **400** (Zod corre antes que
  la comprobación de correo) y `idioma: 'en'` con un correo existente devuelve **409**. El PDF mensual y los
correos usan `usuario.idioma`.

⚠️ La app Android **no se traduce** (decisión del dueño, 2026-08-17): el servicio es solo
Perú y cobra en soles, así que traducir obligaría a mantener 379 cadenas en dos idiomas para
siempre. Su ajuste de Idioma dice lo que de verdad controla: correos y reportes.

**LAN:** el frontend usa `resolverApiUrl()` (detecta el host y construye la URL); el backend
tiene CORS con `esOrigenRedLocal()` para 192.168.x.x y 10.x.x.x; `next.config.ts` tiene
`allowedDevOrigins`. El firewall de Windows necesita regla para el puerto 3000.

**localStorage (claves internas, no cambiar):** `bs_token` · `bs_tema` · `bs_idioma` ·
`bs_cookies` · `bs_cuenta` · `bs_tour`.
---

## 8. Integraciones, una por una

### 8.1 Culqi — pagos (LIVE)

**Flujo:** catálogo público `/precios` y `dashboard/planes` abren el widget de Checkout v4 →
token → `POST /api/pagos/culqi` crea customer + tarjeta guardada, cobra el primer periodo y
actualiza `plan`/`suscripcionActiva`/`fechaVencimiento`. Renovación por cron diario
(`iniciarRenovacionesCulqi`). Webhook `POST /api/pagos/culqi/webhook` (sin sesión, protegido
por `CULQI_WEBHOOK_SECRET` en query o auth básica) desactiva la suscripción ante reembolsos.
Cada cobro se guarda en `pagos` y se expone en `GET /api/pagos/historial`.

Sin sesión, `/precios` guarda la compra en `sessionStorage` y manda a `/login?next=/precios`.
`AuthContext` valida que `next` sea ruta interna (si no, sería redirección abierta).

**Fuente única de precios: `brand-shield/src/lib/precios.js`** (`MONEDA` + `PRECIOS`).
Estuvieron duplicados en `pago.routes.js` y en el worker, se desincronizaron y cobraron
mensual a suscriptores anuales. **No volver a copiarlos.** `brand-shield-web/src/lib/catalogo.js`
debe cuadrar con ese archivo, y el landing deriva el anual con `Math.round(p.p*0.8)`.

**Reglas del cobro que costaron bugs reales — no deshacerlas:**

| Regla | Por qué |
|---|---|
| **A Culqi no se le mandan rellenos de un carácter** | Valida `address` (5-100), `last_name` y `description` (5-80). `address: '-'` hacía fallar **toda** alta |
| Nombre sin apellido → `'No indicado'` | El registro pide un solo campo "nombre"; con `'-'` nadie sin apellido podía pagar |
| **`culqi.obtenerOCrearCliente()` en el alta**, nunca `crearCliente` directo | Culqi rechaza un segundo customer con el mismo correo → quien se suscribiera dos veces quedaba sin poder pagar nunca |
| **`culqi.datosTarjeta(cargo)`** para leer marca y últimos dígitos | Con **tarjeta guardada** los campos van en `cargo.source.source`, no en `cargo.source`. Leerlos mal dejaba el historial vacío **en silencio** |
| **`paid` NO indica si el cobro se hizo** | Una venta aceptada devuelve `paid: false` (se refiere a la liquidación). El estado real es `outcome.type === 'venta_exitosa'` |
| **`creation_date` viene en MILISEGUNDOS** | No en segundos. Multiplicarlo por 1000, como pide el constructor de `Date`, da el **año 58631** — un absurdo tan visible que se detecta, pero solo si alguien mira la fecha. Comprobado el 2026-08-30 sobre un cargo y un reembolso reales |
| **El reembolso se consulta con `GET /refunds/{id}`** | `culqi.js` solo sabe crearlos. El estado que interesa es `status: "completa"`, y en el cargo, `amount_refunded` con el importe en céntimos |
| **`Culqi.close()` va primero** en el callback `window.culqi`, antes de cualquier `await` | El widget entrega el token y **deja su ventana abierta**: el cobro se procesaba detrás de un formulario que seguía visible |
| El resultado del pago vive en `components/ResultadoPago.js` | Superposición a pantalla completa, inmune al scroll, sin redirección automática. Un aviso de pago no puede depender de dónde esté el scroll |
| La moneda es única y sale de `precios.js` | Ambos call-sites la pasan explícita; `Pago.moneda` tiene default `"PEN"` |

**Ciclo de vida de la suscripción:** un cargo rechazado **no** desactiva de inmediato — hay
**tres intentos repartidos cada 3 días**, con correo en cada uno (`enviarCobroFallido`), y al
agotarlos el plan baja de verdad a GRATIS. Los intentos **se cuentan con las filas de `Pago`
en estado `FALLIDO` posteriores al último `EXITOSO`**, así que no hizo falta columna nueva y
además el cliente los ve en su pantalla de Facturación. El cron cobra **todo lo vencido**, no
solo lo de hoy (si no, un día sin correr dejaba vencimientos atrás para siempre). El nuevo
vencimiento se calcula **desde el anterior**, no desde hoy, para no comerle días ni correrle
el aniversario. Cron aparte `iniciarBajadaDePlanes` (5:30 AM) para quien canceló y ya terminó
su periodo pagado.

**Reembolsar:** `scripts/reembolsar-cargo.js <chargeId> --aplicar`. El webhook
`refund.creation.succeeded` marca el `Pago` como `REEMBOLSADO`, pone `suscripcionActiva:
false` y **avisa al cliente por correo** (`enviarReembolso`, bilingüe). 🔴 **Ese correo lleva
el plazo bancario a propósito** — entre 5 y 15 días hábiles según el emisor. Nació el
2026-08-30, cuando un reembolso real emitido y correcto pareció no haberse hecho porque el
dinero no estaba en la tarjeta unas horas después y el producto no mandaba nada: un reembolso
emitido y todavía no asentado es indistinguible, para quien lo espera, de uno que no ocurrió.
⚠️ El correo **no** menciona el comprobante: anularlo ante SUNAT es un trámite aparte y manual
(§9), y cuando ese correo sale casi nunca ha ocurrido todavía.

**Cancelar:** `POST /api/pagos/cancelar` + sección **Suscripción** en Configuración (ese
nombre exacto: `/devoluciones` y el FAQ lo prometen así). Apaga la renovación y **conserva el
plan hasta el final del periodo pagado**.

**Promo de bienvenida:** 50% los primeros 2 meses, solo mensual, **una vez por cuenta y una
vez por tarjeta**. Campos en `Usuario`: `periodoFacturacion`, `promoBienvenidaUsada`,
`mesesPromoRestantes`.
- El límite por tarjeta es la tabla `promo_tarjetas` con `culqi.huellaTarjeta()` =
  **HMAC-SHA256 de `BIN|últimos4`** (nunca el número). Secreto `PROMO_HASH_SECRET`.
  ⚠️ **No se puede rotar sin vaciar `promo_tarjetas`**: ninguna huella volvería a coincidir.
  Colisión conocida (mismo BIN + mismos 4 últimos) → falso negativo, nunca un cobro incorrecto.
- **Orden que importa:** la decisión va **después de `crearTarjeta` y antes de `crearCargo`**.
- **Si la cuenta puede pero la tarjeta ya la gastó → 409 `PROMO_NO_APLICA` y NO se cobra**
  (el widget ya mostró el importe con descuento). El frontend avisa, apaga el descuento y
  reintenta con **`sinPromo: true`**. **No romper ese escape** o esa tarjeta recibe 409 para siempre.
- ⚠️ **Cualquier importe que se muestre antes de pagar se calcula en céntimos con el mismo
  redondeo que el backend** (`montoEnCentimos()` en `lib/catalogo.js`). Redondear en soles
  mostraba S/30.00 y cobraba S/29.50.
- Se anuncia con `components/BannerPromo.js`, también al visitante sin sesión.
  ⚠️ **Sus importes se DERIVAN del catálogo** (`montoEnCentimos(precio, true)`, el mismo redondeo
  del backend). Estaban escritos a mano y al añadir un plan el cartel se quedó anunciando dos de
  tres, en la única pantalla donde se vende. Un precio a mano en un cartel de promoción es
  exactamente donde no puede estar.

**Nada de "7 días gratis".** No existe periodo de prueba: el cobro es inmediato. Reintroducir
la promesa sin implementarla sería publicidad engañosa (Ley 29571). Lo que sí existe y se
puede anunciar es el **retracto de 7 días** con devolución del 100% en `/devoluciones`.

**Webhook en CulqiPanel:** producto CulqiOnline · recurso `refund` · acción **`creation`**
(no `update`) · resultado `succeeded` · URL `https://api.usenotoria.app/api/pagos/culqi/webhook`
· autenticación básica con `CULQI_WEBHOOK_SECRET` como contraseña.
⚠️ El campo de contraseña admite **máximo 20 caracteres** y el formulario **rechaza los
símbolos `< >`**. Nunca poner ahí la contraseña del propio CulqiPanel.
Los **contracargos NO llegan por webhook** (Culqi no expone ese recurso): se vigilan en
*Controversias*. Culqi **no expone la configuración del webhook por API** ni dispara ping de
prueba, así que solo un reembolso real lo confirma — ✅ **y se hizo el 2026-08-23: llegó
`refund.creation.succeeded` y dejó el pago en `REEMBOLSADO`** (§19 B1) — por eso el endpoint **registra también
los rechazos**, para distinguir "mal configurado" de "nadie lo ha llamado".

**Requisitos de la web que Culqi exige** (subsanados tras una observación): información
general y de contacto, información legal, **Libro de Reclamaciones integrado en la web** (no
enlaces externos), mínimo 5 productos con foto + descripción + precio visible, botón de
comprar, y **SSL en todas las URLs**. De ahí salieron `/precios` (5 ítems: Gratuito, y
Negocio y Franquicia en sus dos modalidades de cobro), `/libro-reclamaciones`,
`/devoluciones`, `/contacto` y `components/PieLegal.js`. La **fuente única de los datos de
contacto públicos** (`CONTACTO`) es **`src/lib/contacto.js`** desde el 2026-09-16 —antes vivía
dentro de `PieLegal.js`, que la sigue re-exportando— porque también la lee el botón flotante de
WhatsApp, que es componente de cliente.

### 8.2 TikTok — Accounts API (completo)

Una sola conexión, por la **Accounts API** (`business-api.tiktok.com`), que cubre perfil +
videos + comentarios. `tiktok.scraper.js` (Display API) se conserva **intacto como respaldo**.
Archivos: `scrapers/tiktokBusiness.scraper.js`, `lib/tiktokBizToken.js`, `redes.routes.js`,
`comentario.routes.js`, `workers/monitoreo.worker.js`.

**Datos de la API que no hay que re-derivar:**

| Cosa | Valor correcto | Qué pasa si se equivoca |
|---|---|---|
| URL de autorización | `https://www.tiktok.com/v2/auth/authorize/` con `client_key` = App ID | — |
| Scope para responder | **`comment.list.manage`** | `comment.create` **no existe**: `invalid_scope` y falla TODA la autorización, sin decir cuál sobra |
| Scope de perfil | `user.info.profile` **y `user.info.stats`** | sin ellos `/business/get/` responde `40130` aunque solo pidas `display_name` |
| `business_id` | es el **`open_id`** del canje | — |
| Header de auth | **`Access-Token`** | `Authorization: Bearer` se ignora |
| Parámetro del canje | **`client_id`** | muchos ejemplos dicen `app_id` y TikTok lo rechaza |
| Errores | **HTTP 200 con `code != 0`** en el cuerpo | el `catch` de axios no los ve y todo parece OK |
| Campos | `caption`, `comments`, `videos_count` | `40002`, y la API enumera los válidos — leer ese mensaje |
| `create_time` | llega como **string** de segundos | `new Date()` directo da Invalid Date |
| `video_id` | **obligatorio** en hide / pin / like, aunque el `comment_id` baste | `40002 video_id: Missing data for required field` |

Pedir un campo no autorizado hace fallar la llamada **entera** con `40130`, no devuelve el
resto. Por eso el perfil reintenta con lo mínimo (`display_name` + `profile_image`) ante 40130.

**El scope va FIJO en el código**, no por variable de entorno — un valor equivocado rompe
toda la autorización:
```
user.info.basic,user.info.profile,user.info.stats,video.list,comment.list,comment.list.manage
```

- **NO está en Sandbox.** En la API for Business el sandbox es otro dominio
  (`sandbox-ads.tiktok.com`) y solo aplica a cuentas publicitarias. No confundirlo con el
  Sandbox de `developers.tiktok.com`, que sí limitaba la app de Display a *target users*.
- **Regla de producto que hay que decirle al cliente:** TikTok solo expone videos
  **públicos**. Uno publicado como "Amigos" devuelve `videos: []` con `code: 0`,
  indistinguible de una cuenta vacía.
- **Los tokens rotan y se persisten con `updateMany`, no `update`:** TikTok rota el refresh
  token en cada renovación y una misma cuenta puede estar en varios negocios. Solo
  `invalid_grant` borra los tokens; un error de red no (desconectaría por una caída pasajera).
- **Respuestas hechas fuera de Notoria:** se pide el hilo con `/business/comment/reply/list/`
  y se busca `owner: true`, solo para comentarios con respuestas. El worker sincroniza
  `respondida` en **una sola dirección** (marca, nunca desmarca): una lectura fallida
  reabriría comentarios ya cerrados. La moderación sí va en las dos, porque ahí TikTok es la
  fuente de verdad.
- **`/business/comment/delete/` existe pero NO se expone en el panel:** es irreversible y
  escala el conflicto. Ocultar consigue lo mismo sin nada que lamentar.
- Un comentario negativo **ya respondido no dispara alerta**.
- Revocación cableada (`/tt_user/oauth2/revoke/`), y solo si ningún otro negocio comparte el
  refresh token.

### 8.3 Instagram — ENCENDIDO desde el 2026-08-26

✅ **Meta cerró el App Review del 15/08 y aprobó lo que hacía falta.** El interruptor está en
`true` y la conexión es visible para **todas** las cuentas. Con él reapareció sola la sección
**Menciones**, que dependía de esto (§8.4).

| Permiso | Resultado | Qué habilita |
|---|---|---|
| `instagram_basic` | ✅ Avanzado | leer publicaciones y menciones |
| `instagram_manage_comments` | ✅ Avanzado | leer y responder comentarios |
| `pages_show_list` | ✅ Avanzado | encontrar la página vinculada |
| `pages_read_engagement` | ✅ Avanzado | leer la página |
| `public_profile` | ✅ Renovado | — |
| **`pages_manage_metadata`** | 🔴 **RECHAZADO** | suscribir el webhook de comentarios |

🔴 **El rechazo y por qué Meta tenía razón.** Motivo textual: *«Disallowed Use Case — Developer
Policy 1.6. We have determined that your app's use case for the requested permission is invalid
or is not needed to support its core functionality»*. Ese permiso solo servía para
`suscribirWebhookInstagram()`, una llamada que **nunca llegó a funcionar** y que ya solo escupía
un warning. Se pedía un permiso para algo que el código no hacía.
- **Se retiró del scope y se retiró la llamada del callback.** Mantenerla ahora fallaría en
  TODAS las conexiones y escribiría un warning por cada cliente: un log que grita en cada alta y
  no significa nada enseña a ignorar los logs.
- La función sigue exportada y probada. El día que ese permiso se conceda, volver a llamarla es
  una línea. La DESuscripción al desconectar se conserva: es defensiva y es lo que un revisor
  quiere ver.
- ⚠️ **Consecuencia de producto, y hay que decirla:** los comentarios de Instagram llegan **solo
  por el escaneo periódico** (24 h en Gratis, 12 h en Impulso, 4 h en Negocio, 1 h en
  Franquicia). No es una degradación — es como funcionó siempre.

🔴 **Los permisos de acceso ESTÁNDAR no rompen el login, y esto es lo que decidió que se podía
encender.** La Configuración `4655107931374707` («Notoria — comentarios de Insta») declara seis
permisos, dos de ellos en estándar (`business_management` y `pages_manage_metadata`). El propio
panel de Meta lo dice: *«Permissions in standard access will only be requested from people with
roles on this app»*. O sea que a un cliente real **ni se le piden**: no hay error, ni diálogo
roto, ni permiso a medias. Se dejan en la Configuración a propósito, para no tener que volver a
añadirlos el día que se concedan.

⚠️ **Con `META_LOGIN_CONFIG_ID` puesta, Meta IGNORA el `scope` del código** y usa la
Configuración de la consola. Al quitar o añadir un permiso hay que tocar **los dos sitios**, o el
código dice una cosa y el diálogo real pide otra. Comprobado el 2026-08-26: el `conectar`
devuelve una URL con `config_id=4655107931374707` y **sin** parámetro `scope`.

⚠️ **Lo que sigue sin probarse: una conexión REAL.** El circuito responde —`disponible: true`,
`conectar` da 200 con la URL correcta— pero nadie ha completado todavía el OAuth con una cuenta
de Instagram de verdad. Hace falta una cuenta profesional vinculada a una página de Facebook.
Es lo primero que hay que mirar; los tres modos de fallo y cómo se distinguen están más abajo.

**Cómo se apaga si algo sale mal:** `INSTAGRAM_ACTIVO=false` en Railway. Se cierra para todos sin
desplegar, y una cuenta ya conectada **no se esconde** (ver la excepción de más abajo).

Fuente única: **`src/lib/instagramVisible.js`**.

| Variable | Efecto |
|---|---|
| `INSTAGRAM_ACTIVO=true` | visible para **todos** — es lo que se pone el día que aprueben |
| `INSTAGRAM_CUENTAS_PRUEBA=a@b.c,...` | correos que lo ven mientras tanto (hoy: solo el revisor de Meta) |

Solo el literal `'true'` activa. Se aplica en `redes.routes.js` (`estado` devuelve
`disponible:false`; `conectar` responde **404**, no 403: no es falta de permiso, es que la
función no existe para él), en `lib/menciones.js` y en el panel (`dashboard/conexiones`
esconde la fila entera). **El callback de OAuth no se gateó a propósito**: su `state` va
firmado y caduca, solo se llega pasando por `conectar`.

🔑 **Excepción deliberada: una cuenta YA conectada nunca se esconde** (`disponible || conectado`).
Si se escondiera, el usuario no podría desconectarla ni borrar sus datos — justo lo que Meta
exige poder hacer.

⚠️ **Instagram es la ÚNICA fuente de menciones**, así que mientras esté oculto la sección
Menciones también lo está. Reaparece sola al encender el interruptor.

**Sabor de la API: Facebook Login, NO Instagram Login.** Hay dos "APIs de Instagram" y no son
intercambiables. El código pide el token a `graph.facebook.com/v21.0/oauth/access_token`,
llama a `me/accounts` buscando la página con `instagram_business_account`, y pide
`instagram_basic, instagram_manage_comments, pages_show_list, pages_read_engagement,
pages_manage_metadata`. **Ir siempre a Agregar producto → Facebook Login for Business**, no a
la sección de Instagram.

**La cadena que exige la API** — al diagnosticar "0 páginas utilizables", distinguir los tres
casos, que se parecen y se arreglan distinto:

```
Instagram profesional → vinculada a una PÁGINA de Facebook → la página expone
`instagram_business_account` → y el usuario tiene rol sobre esa página
```

| Caso | Arreglo |
|---|---|
| Enlazado solo por **Centro de cuentas** | No sirve: eso une Instagram con el **perfil personal**. Hay que vincularlo a una página de verdad. ⚠️ Meta lo empuja por todas partes, así que el cliente cree que ya lo hizo — por eso es el **primer punto** de `igPasos` |
| Página dentro de un **portfolio comercial** | `me/accounts` no la lista sin `business_management`. Confirmado como causa real |
| Permiso viejo reutilizado | "Editar configuración" en vez de "Continuar" |

🔴 **Regla al diagnosticar OAuth: lo primero es imprimir la identidad del token y sus scopes.**
Un log con `me = <quién>` y los permisos concedidos descartó de golpe dos hipótesis que
habrían costado horas. Sin eso se depura por eliminación contra la interfaz de otro.

🔴 **Un redirect de OAuth que aterriza donde nadie lee sus parámetros es un fallo invisible.**
El callback devolvía `ig_error=sin_cuenta_business` y el frontend no leía ese parámetro en
ninguna parte. Al cablear otra red, comprobar los tres puntos: **¿el parámetro se lee?, ¿aterriza
donde se lee?, ¿la pestaña correcta está visible?** El fallo se muestra como **modal** (se
arregla fuera de Notoria, así que debe interrumpir) con enlace a Conexiones; el éxito es un
aviso en línea.

**Límite estructural conocido:** una cuenta profesional de Instagram no necesita página de
Facebook, pero este sabor sí la exige. Un negocio que abrió Instagram con su celular y no usa
Facebook **no puede conectarse**. La salida sería añadir el sabor *Instagram Login* como
segunda opción (aditivo, pero cuesta otro App Review, un flag en `Negocio` y llamar a
`graph.instagram.com`). **No cambiar ahora.**

**Menciones de Instagram:** salen con los permisos que ya se piden (`/{ig-user-id}/tags`).
Solo llega lo que **@menciona o etiqueta** a la cuenta — no es búsqueda por palabra clave, y
por eso `construirTerminos` no aplica a Instagram (el corte por `terminos.length` va DENTRO
de la rama de TikTok). Solo contenido público y cuenta profesional. **`null` no es `0`** en
las métricas: Instagram omite `like_count` si el autor ocultó los contadores, y guardarlo
como 0 ordenaría esas menciones al final.

**Lo que la API de comentarios SÍ y NO da** (probado contra un comentario real):
`id,text,username,timestamp` ✅ · `like_count` ✅ (los likes se pueden leer) · `from{id,username}` ✅
· `from{profile_picture_url}` ❌ `(#100)` · `user` ✅ pero vacío.
🔴 **La foto de quien comenta NO existe en la API.** No se arregla con permisos; la única vía
sería `business_discovery`, que exige que el comentarista tenga cuenta profesional. Por eso la
tarjeta pinta un círculo con la inicial. Si alguien vuelve a pedirla, la respuesta es esta.

**Ventana de lectura:** `LIMITE_PUBLICACIONES = 25`, con **paginación** de comentarios
(`LIMITE_COMENTARIOS = 50` por página, `MAX_COMENTARIOS_POR_PUBLICACION = 300`,
`MAX_PETICIONES_EXTRA = 40` **compartidas entre las 25 publicaciones**, porque la cuota de la
Graph API es por app y por hora).
- Meta **no documenta el orden** y lo observado es el más antiguo primero: quedarse con la
  primera página era leer los 30 **más viejos** y no ver nunca los nuevos.
- El corte se decide con el **cursor `after` y el tamaño de la página**; esta arista **no
  devuelve `paging.next` de forma fiable**, así que un `while (data.paging.next)` cortaría en
  la primera vuelta.
- Un fallo paginando conserva lo ya leído y sigue con las demás publicaciones.
- **Moderar en Instagram no está hecho a propósito:** la Graph API lo permite, pero el
  scraper no lee ese estado. Al implementarlo hay que añadir la lectura *y* declarar
  `moderacionRemota` en la fuente, o el panel y la plataforma se desincronizan.

**Webhook de comentarios** (`src/lib/webhookMeta.js`, `api/routes/webhooks.routes.js`):

1. 🔴 **El cuerpo se valida CRUDO, y por eso el router va montado ANTES de `express.json()`**
   (usa su propio `express.raw()`). Meta firma los bytes exactos: reserializar cambia el hash
   y **todo evento legítimo se rechazaría**.
2. **Se contesta 200 ANTES de procesar.** Si tarda, Meta reintenta y tras varios fallos
   **desactiva la suscripción**.
3. **El eco propio se descarta** (`value.from.id === entry.id`). Sin ese filtro, nuestras
   propias respuestas entrarían como comentarios de cliente y una disculpa bien escrita
   clasificaría como negativa, disparando una alerta por nuestro propio mensaje.
4. **Exento del rate-limit** (`skip` en `index.js`): los eventos llegan a ráfagas desde las
   IPs de Meta. El filtro real de esta ruta es la firma HMAC.
5. **El evento se normaliza a la forma del scraper**, no a la de la tabla, para pasar por el
   mismo `aFila` de `FUENTES_COMENTARIOS`.
6. **La suscripción es POR CUENTA**, dentro del callback de OAuth (único punto donde existe
   el token de página). Con un token de PÁGINA, `me` **es** la página. Un fallo de
   suscripción **no aborta la conexión** (warn y sigue: sin webhook los comentarios llegan
   por el escaneo, con retraso). Al desconectar se desuscribe, y solo si ningún otro negocio
   usa esa cuenta.
7. **El caption se pide aparte** (`obtenerCaptionPublicacion`); si falla, el comentario se
   guarda sin título.
8. 🔴 **Hay DOS secretos y el webhook acepta los dos.** La app de Instagram
   (`1305555994987658`) tiene su propia clave, distinta de `META_APP_SECRET`, y **confirmado
   en vivo: Meta firma estos eventos con la de Instagram.** Con solo `META_APP_SECRET` todos
   los comentarios reales se habrían descartado en silencio.

⏳ **No llegará ningún evento hasta que aprueben el App Review** (Meta exige *Advanced
Access* para el campo `comments`). `suscribirWebhookInstagram()` **no funciona por ningún
camino** — el nodo `{ig-user-id}/subscribed_apps` es del sabor Instagram Login. Hoy solo
escupe un warning. **Al aprobar: comprobar si los eventos llegan sin esa llamada; si llegan,
borrarla.**

**El webhook convive con el barrido, no lo sustituye:** solo notifica desde que se configura,
así que el histórico de cada cuenta nueva sigue llegando por el escaneo.

### 8.5 Facebook Reviews — completo pero oculto tras interruptor

**Terminado el 2026-08-23.** Mismo patrón que Instagram (§8.3) y por el mismo motivo:
el código está listo y con pruebas, y nadie lo ve hasta que Meta conceda el permiso.
Fuente única: **`src/lib/facebookVisible.js`** (`FACEBOOK_ACTIVO` / `FACEBOOK_CUENTAS_PRUEBA`).

🔴 **El permiso es `pages_read_user_content`, NO `pages_read_engagement`.** Esa confusión duró
meses. Con el equivocado la conexión funcionaría y las reseñas llegarían **siempre vacías, sin
un solo error**. Va en la segunda solicitud de App Review, ya redactada (`docs/app-review-meta.md` §8).

**Lo que se arregló del stub, y por qué cada cosa:**
- 🔴 **Desde 2018 Facebook no tiene estrellas sino recomendaciones**, y el nodo puede llegar sin
  `rating`. El stub hacía `rating: r.rating || 0`, así que una recomendación **positiva** sin
  estrella se guardaba como **0★**: el detector la habría leído como la peor puntuación posible
  y le habría mandado al cliente una alerta de reputación **por algo bueno que le pasó**. Ahora
  se piden `recommendation_type`, `has_rating` y `has_review`, y se traduce positive → 5,
  negative → 1, dejando `sinEstrella: true` para que el panel no finja una precisión que no hay.
- **Sin estrella y sin tipo se descarta**, no se guarda con un 0 inventado: un conteo corto se
  nota, una reseña falsa en la ficha del cliente no.
- **`autorResenasTotal` es `null`, no 0** — un 0 haría que la señal de «cuenta nueva» la marcara
  como falsa.
- ✅ **`Resena.sinEstrella` existe en la BD desde el 2026-08-23** (`Boolean?`, aditiva). Antes el
  scraper la calculaba y **se tiraba**, así que el panel habría enseñado «5★» de algo que en
  Facebook solo dice «recomienda». `true` = la estrella la derivamos nosotros; `null` en el
  resto de fuentes, porque ahí la pregunta no aplica — que no es lo mismo que `false`.
- **Un error devuelve `null`, no `[]`**: `null` = no se pudo leer, `[]` = se leyó y no hay nada.

**Callback PROPIO, y no es duplicación.** El de Instagram busca la página que tenga
`instagram_business_account` y descarta las demás. Un restaurante que solo usa Facebook no tiene
ninguna así, y con ese callback su conexión fallaría con «sin_cuenta_business» — un mensaje que
le manda a arreglar algo que no está roto.

🔴 **La rama del worker no avisaba de las reseñas negativas**, el mismo agujero que tuvo Google
hasta el 2026-08-22: se guardaban y no producían alerta, ni correo, ni nada en el panel. Se
cableó `alertarResenaNegativa` (con su propio `esPrimerBarrido`) **ahora y no cuando llegue el
permiso**, porque ese día nadie se acordaría. De paso, `analizarResena` se llamaba con un solo
argumento, así que la señal de **texto duplicado nunca se evaluaba** en Facebook.

⚠️ **El panel tenía a Facebook como fila FIJA con una pastilla «No conectado» que no se podía
pulsar**: prometía una función que no existía y no daba forma de llegar a ella. Ahora pasa por
la misma lista que las demás (`redesVisibles`), gobernada por el interruptor.

- El modal de error del OAuth **se comparte con Instagram** (`redOAuth` + `oauthT` en la ficha):
  mismo componente, otros textos y **otros pasos** — Facebook no exige vincular nada a
  Instagram, así que enseñarle esa lista mandaría a arreglar algo que no aplica.
- `node scripts/prueba-facebook.js` — 40 comprobaciones.

### ✅ Probado contra la API de verdad el 2026-08-23

Ya no es documentación. Se llamó desde el Explorador de la Graph API con un **token de PÁGINA
real** (página «Notoria», id `1211927292012805`) y `pages_read_user_content` concedido.

🔑 **La clave que desbloqueó esto: con acceso ESTÁNDAR el permiso se concede a quien tiene rol
en la app.** O sea que el dueño podía probarlo sin esperar al App Review — lo mismo que ya valía
para Instagram. Estuvo en la lista de «bloqueado» más tiempo del necesario.

| | |
|---|---|
| ✅ `/{page-id}/ratings` existe y responde 200 en v26.0 | no es un endpoint fantasma |
| ✅ `pages_read_user_content` es **el permiso correcto** | con él la llamada pasa |
| ✅ El Explorador reconoce `recommendation_type`, `has_rating`, `has_review` | y descarta uno inventado |
| ✅ `overall_star_rating` y `rating_count` devuelven valores | la otra mitad del scraper |
| ⚠️ **La forma de un `Recommendation` real, NO** | la página no tiene reseñas: `{"data": []}` |

⚠️ **Y una trampa que el control destapó: con la colección vacía Meta NO valida los campos.** Se
pidió un campo inventado y devolvió `[]` sin error, ni siquiera con `debug=all`. Así que el éxito
de la llamada **no** prueba que los siete campos existan; eso lo dice el esquema del Explorador,
no la respuesta. Sin ese control se habría dado por probado algo que no lo estaba.

🔴 **El hallazgo que solo daba la llamada real: `overall_star_rating: 0` con `rating_count: 0`.**
Ese **0 no es una nota, es la ausencia de nota** — y es el mismo error que `sinEstrella`, por
otro camino. Guardarlo como rating crea un snapshot de «0★» que envenena todo lo que compara
mediciones: el día que llegara la primera reseña de 4.5★, `lib/progreso.js` restaría 4.5 − 0 y
el panel cantaría una subida de 4.5 puntos que no ocurrió; y perder la única reseña se leería
como un desplome. Ahora el scraper devuelve **`sinValoraciones`** y el worker **no crea
snapshot** en ese caso. Se pierde el «0 reseñas» como línea base, y es aceptable: cualquier
comparación necesita dos lecturas igualmente, así que como mucho se cuenta de menos.

### 8.7 El costo de Google Places, que es el único costo variable real

🔴 **Medido el 2026-08-25, y hasta entonces nadie lo había contado.** Cada escaneo es una
llamada a Place Details, y **cada competidor era otra**, a la cadencia del dueño. Con los topes
que la web prometía, un solo local de Franquicia gastaba **10 800 consultas al mes solo en
rivales** — bastante más que el plan entero que lo paga.

Precios (Places legacy, por millar): **Basic $17 · Contact +$3 · Atmosphere (reseñas) +$5.**
Un escaneo de negocio cuesta $0.022–0.025; uno de competidor $0.017.

**Los tres frenos, y ninguno da señal si se rompe** — la vigilancia sigue funcionando igual y
lo único que cambia es la factura de Google, que además no dice de quién fue cada consulta:

| Freno | Dónde | Qué corta |
|---|---|---|
| `HORAS_COMPETIDOR = 24 * 7` | `monitoreo.worker.js` | Un rival se relee **una vez por semana** —eran 24 h hasta el 2026-09-19 (§8.9)—, no una vez por ciclo del dueño. Nadie compara ratings de hora en hora, y `progreso.js` compara **mes contra mes**: §13 midió cinco negocios con 49 días de datos y sus ratings daban 4.8→4.8, 3.9→3.9, 4.0→4.0 |
| `obtenerCompetidorCompartido` | ídem | Un place ID se pide **una vez por ciclo**, y si además es un negocio monitoreado sale **gratis** de `fichasGoogle`. ⚠️ La reutilización va en UNA dirección: la lectura de competidor solo pide Basic y no le sirve a un negocio, que necesita `reviews` |
| `tocaLeerContacto` | `lib/fichaGoogle.js` | Contact Data **una vez al día**, no en cada escaneo. La marca es `_leidoEn` **dentro** de `fichaGoogleRef`, sin columna nueva. ⚠️ La ficha CERRADA no pasa por acá: `business_status` va en Basic y se sigue mirando siempre |

Resultado medido: un local de Franquicia pasó de **$201.60 a $23.58 al mes**, y de ahí a **$9.10**
con las palancas del 2026-09-19 (§8.9).
`node scripts/prueba-costo-places.js` — 31 comprobaciones.

⚠️ **Al subir cualquier cadencia, hacer la cuenta antes.** El bloque 8 de esa prueba la deja
escrita para no tener que rederivarla.

### 8.6 Planes — la tabla de capacidades

**`src/lib/planes.js` decide qué puede hacer cada plan**, y `brand-shield-web/src/lib/planes.js`
es su espejo para el panel (con los NOMBRES, que llevan idioma y por eso viven ahí).
`scripts/prueba-planes.js` —64 comprobaciones— compara los dos y falla si se separan.

🔴 **Por qué existe, y por qué no se puede volver atrás.** Hasta el 2026-08-24 la matriz de
planes no estaba en ningún sitio: estaba deducida y repartida en **26 puntos del backend** (11
arrays `['NEGOCIO','FRANQUICIA']`, 5 tablas por plan, 10 ternarios). Con tres planes se
sostuvo. Al añadir IMPULSO aparecieron tres fallos que **no producen ninguna señal**:

| Dónde estaba | Qué habría pasado |
|---|---|
| `negocio.routes.js`, el `else` de `GRATIS ? 1 : NEGOCIO ? 5 : 999` | El plan **más barato** del catálogo, con **999 negocios** |
| Renovación de Culqi, filtrando por una lista a mano | Se cobra **UNA vez y nunca más**. El cliente conserva el plan gratis para siempre. Sin error, sin log, sin cargo fallido |
| Bajada de plan al vencer, la misma lista | Cancelar **regala el plan de por vida** |

⚠️ **Al añadir un plan o una capacidad: se declara en la tabla y los call-sites preguntan.**
Nunca al revés. El bloque 7 de `prueba-planes.js` **lee el fuente** y falla si alguien vuelve a
escribir la lista de planes a mano — es lo único que protege al *siguiente* plan.

🔴 **Los locales se cobran de a uno desde el 2026-08-25, y no se puede volver atrás.**
Medido el costo de Places (§8.7), los paquetes que se anunciaban perdían dinero: NEGOCIO
desde el **tercer** local y FRANQUICIA desde el **segundo**, con «negocios ilimitados» impreso
en la web. Decidido con el dueño: **un local incluido y el resto se cobra**, igual en los dos
planes. Lo que separa un plan de otro deja de ser cuántos locales caben y pasa a ser la
velocidad y las funciones — que es lo que de verdad los distinguía.

| | Incluidos | Local adicional |
|---|---|---|
| IMPULSO | 1 | **no vende** — quien abre el segundo local sube a NEGOCIO |
| NEGOCIO | 1 | S/39/mes · S/372/año |
| FRANQUICIA | 1 | S/99/mes · S/948/año |

➡️ **Cómo se compran los locales cuando el cliente YA está suscrito vive en §8.8** (prorrateo,
piso, la guarda de la bajada). Acá está la tabla; allá, el cobro.

- **`montoSuscripcion()` en `lib/precios.js` es fuente única**, y la usan el alta *y* la
  renovación. Si solo cobrara el alta, los extras se pagarían **una vez y quedarían gratis
  para siempre**: ni error, ni log, ni cargo fallido. Es el mismo fallo que ya tuvo este cron
  cobrando el mensual a los suscriptores anuales por tener su propia copia de los precios.
- **El tope real es `negociosPermitidos(plan, localesExtra)`**, nunca `limite(plan,'negocios')`
  a secas: preguntar al plan pelado deja a quien pagó cuatro locales sin poder cargar el segundo.
  ⚠️ `localesExtra` tiene que estar en **`req.cuenta`** (`lib/equipo.js`, las dos ramas de
  `resolverAcceso`) o llega `undefined`, se lee como 0 y falla **cerrado y en silencio**.
- **Corte por antigüedad en el worker** (`negociosVigilables`): sin él, contratar diez locales
  un mes y bajar a uno dejaría diez fichas vigiladas para siempre. No borra ni desactiva nada —
  vuelven en cuanto se paguen. Es el gemelo del corte por asientos del equipo.
- ⚠️ El importe que se **pinta** en la tarjeta incluye los locales elegidos. Si no, la tarjeta
  anuncia S/59 y el widget cobra S/137 — el mismo fallo que ya hubo con la promo.
- ⚠️ Y entra en el umbral de identificación de SUNAT: tres locales de Franquicia anual cruzan
  los S/700 de sobra.

⚠️ **La app Android tiene su propia copia** (`Modelos.kt`: `esPago` y `etiquetaPlan`). Un plan
que falte ahí deja al suscriptor con la app en modo gratuito: paga y ve las pantallas
bloqueadas, y `etiquetaPlan` cae al `else` diciendo **"Gratuito"**.

**Qué incluye IMPULSO y por qué** (decidido el 2026-08-24): 1 negocio · escaneo cada 12 h ·
25 usos de IA · 3 competidores · 1 asiento · reporte PDF mensual · escalación de urgencias ·
y **vigilancia de la ficha de Google**, que es lo único que de verdad lo hace comprable —que
alguien pueda marcar tu local como cerrado y Google lo aplique sin avisarte es un problema que
un dueño entiende en una frase. Sin redes, sin menciones, sin constancia y sin equipo: eso
sigue siendo el salto a NEGOCIO.
⚠️ La vigilancia de ficha **cuesta dinero** (obliga al grupo Contact Data de Places). A 12 h son
2 consultas al día por negocio, la mitad que NEGOCIO. Si hay que recortar margen, esa es la
palanca y está en un solo sitio.

### 8.8 Sumar y quitar locales sin pasar por el alta

**Hecho el 2026-08-26** (era el pendiente P1 del 25). `src/lib/localesExtra.js` +
`GET/POST /api/pagos/locales` + el bloque `MisLocales` de `dashboard/planes`.
`node scripts/prueba-locales.js` — **103** comprobaciones.

🔴 **Se cobra PRORRATEADO y el vencimiento NO se toca.** Es la decisión que el pendiente dejaba
abierta, y las otras dos salidas se descartaron con números delante (§19). El aniversario del
cliente no se mueve porque haya sumado un local a mitad de mes.

⚠️ **Lo que hizo barato el prorrateo: la renovación ya estaba resuelta.**
`montoSuscripcion(plan, anual, localesExtra)` cobra el total nuevo el mes siguiente sin tocar
una línea del cron. Lo único que había que resolver era el tramo de hoy al vencimiento.

| Regla | Por qué |
|---|---|
| **Se cobra la TARJETA GUARDADA** (`suscripcionId`), no un token del widget | El cliente ya la registró al contratar. Volver a pedírsela para sumar un local es fricción inventada — y el widget cobra lo que se le diga, mientras que acá el importe lo decide el servidor |
| **Piso de S/5** (`PISO_CENTIMOS`): por debajo entra gratis | Un cargo de S/1.30 arrastra una fila de `Pago` y **un comprobante fiscal**, con su correlativo que no admite huecos y su envío a SUNAT. Máximo regalado: S/5 |
| **Gratis ≠ no entra.** Bajo el piso el local SE AGREGA igual | Si no, se le cobraría en la renovación algo que no pudo usar |
| **`diasPeriodo` sale del calendario real**, restándole el ciclo al vencimiento | Es el gemelo de cómo el cron lo suma. En febrero cada día vale 1/28, no 1/30 |
| **`diasRestantes` usa `ceil`** — al revés que `lib/anulacionPendiente` | Allá había un plazo legal detrás y pasarse era el lado peligroso; acá el que paga es el cliente, así que el día en curso se le cuenta a su favor |
| **El redondeo se hace UNA vez sobre el total**, no por unidad | Dos locales dan 3019 y no 3020. Redondear por unidad arrastraría el error hacia arriba en cada local — mismo criterio que el IGV como residuo en `tributario.js` |
| **La promo de bienvenida se aplica igual que en la renovación** | El cron parte por la mitad el `precioBase` completo, locales incluidos. Cobrar a tarifa plena hoy y a mitad en la renovación daría dos tarifas por lo mismo en el mismo mes |
| **El comprobante lleva descripción propia** | Se cobra por días, así que la frase genérica imprimiría «suscripción por 1 mes» en un documento fiscal por algo que no es de un mes |

🔴 **Bajar locales no devuelve dinero y solo se puede hasta los negocios ACTIVOS que hay
cargados.** Sin esa guarda, bajar el contador dejaría de pagar locales que se están vigilando y
`negociosVigilables` los sacaría del barrido **en silencio**: no borra, no desactiva, no avisa.
El cliente vería el historial de dos de sus fichas congelarse sin un solo error en pantalla.
Primero se desactiva la ficha, y entonces se puede dejar de pagar el local.

⚠️ **Lo que hay que vigilar al tocar esto, porque no da ninguna señal:**
- Que el `update` **no escriba `fechaVencimiento`**. Añadirlo «para que cuadre» le come al
  cliente los días que ya pagó y no falla nada: el cargo sale, el comprobante sale, el panel se
  ve igual. El bloque 13 de la prueba lo comprueba **sobre la llamada real**, no con un grep.
  🔴 Y la primera versión de esa sonda daba un falso positivo: buscaba el nombre a secas y la
  ruta **lee** `fechaVencimiento` a propósito para saber cuántos días quedan. Es el mismo error
  de `verificar-meta-secret.js` — ante un resultado, preguntar si el método distingue. Ahora
  mira dentro de un `data:` de Prisma y **lleva sus dos controles**.
- Que el panel **no calcule el importe**. `MisLocales` lo pide (`GET /api/pagos/locales`) y solo
  lo pinta. Calcularlo ahí es exactamente el bug de mostrar S/30 y cobrar S/29.50.
- Que el bloque **no dependa del interruptor mensual/anual** de la pantalla: el periodo lo manda
  la suscripción del cliente. Quien paga anual y mira la pestaña mensual tiene que ver lo que le
  van a cobrar **a él**. Es la cuarta forma que este proyecto encuentra de equivocarse por
  componer algo donde no se sabe el contexto (§11, §12, la promo del 25).

⚠️ **`Pago.tipo` estrena el valor `LOCAL_ADICIONAL`.** Es `String` y no enum, así que no hubo
migración — pero **quien lo pinta necesita respaldo**: `dashboard/facturacion` lo mapea a
etiqueta en los dos idiomas con `|| p.tipo`, que es lo que evita repetir el `NEGOCIO` en crudo
de la barra lateral del 24.

⚠️ **Las cuentas con plan concedido a mano no tienen tarjeta guardada** —las dos del dueño son
así— y por eso el bloque, ante `SIN_TARJETA` o `SIN_SUSCRIPCION`, **explica en vez de ofrecer un
contador que va a rebotar**. Son justo las primeras cuentas que van a tocar esto.

**Qué quedó verificado en producción el 2026-08-26, y qué no.**
- ✅ El endpoint responde con los números correctos: 2 locales a 3 días del vencimiento dieron
  `aCobrarHoy: 755` (S/7.55 = 7800 × 3/31) y `renovacionNueva: 13700`.
- ✅ El bloque renderiza en la tarjeta del plan actual y toma el camino `SIN_TARJETA`, que es el
  correcto para las cuentas del dueño. Consola limpia.
- ⚠️ **El camino que COBRA no se ha visto nunca en pantalla**, y no se puede: ninguna cuenta
  existente tiene tarjeta guardada, así que el contador con su previsualización y su botón de
  pagar solo aparecerá tras el primer cobro real. Es lo primero que hay que mirar ese día.
- 🔴 **Y un fallo que sí se cazó mirando, aunque no en esa pantalla:** los botones estaban en una
  fila. A 1568px las tarjetas miden 310px y entraban de sobra, pero la rejilla es
  `minmax(232px,1fr)` y en una tablet la tarjeta baja a ~196px de contenido, donde «Confirmar y
  pagar» + «Cancelar» no caben. Van apilados. **La lección es la del 24 y el 25 con una vuelta
  más: mirar no basta si se mira en un solo ancho.**

### 8.9 Las tres palancas de costo — HECHAS el 2026-09-19

Salieron de medir por primera vez cuánto cuesta una cuenta gratuita (§19, «LA ECONOMÍA DEL PLAN
GRATUITO»). Ahí están los números y el porqué; **acá está cómo quedaron y qué hay que vigilar.**

| # | Qué | Dónde | Visible para el cliente |
|---|---|---|---|
| 1 | Competidores cada **7 días** (antes 24 h) | `HORAS_COMPETIDOR` en `monitoreo.worker.js` | **No.** El catálogo promete CUÁNTOS competidores, nunca con qué frecuencia se releen |
| 2 | El plan gratuito se **espacia y se pausa** | `lib/dormancia.js` | **Sí, y se anuncia** — ver abajo |
| 3 | FRANQUICIA de 1 h a **2 h** | `planes.js` + sus 6 espejos | **Sí**, y por eso se hizo con cero clientes de pago |

Medido en `prueba-costo-places.js` (bloque 8): un local de Franquicia pasa de **$23.58 a $9.10**.

#### La palanca 2, que es la única con piezas nuevas

Dos cosas distintas, y conviene no confundirlas porque tienen relojes distintos:

| | Qué hace | Se mide desde |
|---|---|---|
| **Prueba completa** | 24 h el primer mes, **72 h** después | `creadoEn` (`diasPruebaCompleta` / `horasEscaneoTrasPrueba`, en `planes.js`) |
| **Pausa** | deja de escanearse del todo | `ultimoAcceso || creadoEn` (`DIAS_INACTIVIDAD = 30`) |

🔴 **La pausa se DERIVA de una fecha y NO se guarda en ninguna columna `pausada`.** Es el mismo
criterio que «pendiente de anular» (§9): un estado guardado hay que sincronizarlo en los dos
sentidos, y el día que el cron no corra —o que alguien entre justo entre dos pasadas— la columna
miente. Derivarlo no puede desincronizarse: la persona entra y el ciclo siguiente ya la ve viva.
⚠️ Corolario: **`pausa.worker.js` es PRESCINDIBLE.** Solo manda el aviso previo; si se cae, no se
pausa de más ni de menos. Al revés —un worker que apagara cuentas— un fallo dejaría gente
apagada para siempre.

🔴 **`ultimoAcceso` se marca en TRES puertas** (`dormancia.marcarAcceso`): login, Google Sign-In
y la carga del perfil. Si se olvidara la de Google —que es por donde entra buena parte del
padrón— esa gente acumularía 30 días de «inactividad» **usando el producto a diario**. Van sin
`await` y la función se traga sus propios errores: cuelga de las dos rutas por las que pasa todo
el mundo, así que un fallo escribiendo una fecha de telemetría no puede impedir un login.
⚠️ Con **throttle de 6 h**, o sería un `UPDATE` por cada carga del panel.

⚠️ **`ultimoAcceso` en `null` NO significa «nunca entró»**: es toda cuenta anterior a la columna.
Por eso `referencia()` cae a `creadoEn`. Tratar ese `null` como «inactiva desde siempre» habría
apagado de golpe la vigilancia de **todas** las cuentas gratuitas el día del despliegue.

🔴 **Un plan que NO está en `ORDEN` tampoco se duerme**, aunque `capacidades()` lo haga caer a
GRATIS. Esa caída es correcta para **negar una función**; acá invierte el riesgo, porque los dos
errores no cuestan lo mismo: no dormir a quien no paga son S/4.39 al mes y se ve en la factura;
dormir a quien **sí** paga es dejar de prestarle un servicio comprado, en silencio. El escenario
no es hipotético — el plan es un enum de Postgres, así que basta añadir un valor y desplegar
antes de tocar la tabla, que es la secuencia exacta que produjo los tres fallos de IMPULSO (§8.6).

⚠️ **Se anuncia, y eso NO es cortesía: es §15 aplicada al revés** — lo que el worker deja de
ejecutar tampoco se puede seguir prometiendo. Está en `catalogo.js` (descripción + `incluye`), en
la tarjeta del landing, en una fila nueva de la comparativa («Vigila sin pausas aunque no entres
al panel») y en el FAQ, **en los dos idiomas y en el JSON-LD de `layout.js`**. Bien contado
además vende: es un motivo concreto para pagar.
⚠️ Y el correo del aviso previo es, de paso, **el mejor correo de reactivación del producto** —
dice algo que está pasando en su cuenta y que depende de él, no «te extrañamos». La palanca de
costo y la de conversión resultaron ser la misma.

⚠️ **`HORAS_ESCANEO[plan]` sigue vivo y es correcto**: es el cooldown del **botón manual**, que sí
es por plan. El cron pregunta a `dormancia.horasEscaneo(usuario)`. Son dos relojes distintos, como
ya lo eran el del cron y el del botón. La app Android muestra el del botón, así que **no hay que
tocarla**.

`node scripts/prueba-dormancia.js` — **89 comprobaciones**, casi todas sobre silencios.

**A quién pausa esto, medido en producción el 2026-09-19 justo antes de desplegar:**

| | |
|---|---|
| Cuentas que se pausan | **6** — 3 `SIN_VERIFICAR`, 3 `INACTIVA` |
| Negocios activos que dejan de escanearse | **4** |
| Ahorro | **~S/17.56 al mes**, sobre 11 usuarios |
| Cuentas del dueño (las 4 de plan NEGOCIO) | **ninguna tocada**, que es la guarda funcionando |

🔴 **Dos de esas seis se pausan SIN aviso previo, y hay que saberlo:** `tocaAvisar` es una ventana
de **un solo día** (el 27.º), y esas cuentas llevan mucho más que eso sin entrar, así que el cron
del aviso nunca las va a ver. No es un fallo —es lo que hace que el aviso no se repita cuatro
veces— pero sí significa que **el día del estreno la pausa es silenciosa para quien ya estaba
vencido**. Las otras tres son `SIN_VERIFICAR` y a esas no se les puede escribir por definición.
⚠️ Queda como decisión del dueño en §19: mandarles un aviso único a mano, que es exactamente lo
que se hizo con `recordar-verificacion.js` el 2026-08-23 para las cuentas que quedaron fuera de
la ventana de su cron. De aquí en adelante nadie más se pausa sin haber recibido su correo.

### 8.4 Menciones

Distinción que sostiene el diseño:

| Modelo | Dónde vive | Rating | ¿Se responde desde Notoria? |
|--------|-----------|--------|------------------------------|
| `Resena` | en la ficha del negocio | **sí** | sí (Google Business, Facebook) |
| `ComentarioSocial` | en una publicación **propia** | no | **sí** |
| `Mencion` | en el perfil de un **tercero** | no | no — hay que ir a la plataforma, de ahí que lleve su `url` |

Piezas: `nlp/sentimiento.js` · `lib/menciones.js` (`construirTerminos`, `fuentesDisponibles`,
`hayFuenteDisponible` — fuente única para worker y rutas, así el panel no puede mentir) ·
`scrapers/instagramMenciones.scraper.js` · `scrapers/tiktokMenciones.scraper.js` (seam sin
proveedor) · `procesarMenciones` en el worker · `mencion.routes.js` · `dashboard/menciones`.

**El clasificador es por diccionario a propósito, no con IA:** el worker clasifica cada
mención en cada ciclo y mandarlo a Groq costaría tokens por algo que la lista resuelve.

**Regla de producto: lo que no podemos entregar NO se muestra.** Nada de "próximamente" ni
pastillas de "requiere proveedor". `fuentesDisponibles()` devuelve **solo las fuentes que
funcionan**, sin campo `motivo`, así que la UI no puede pintar una fuente apagada aunque
alguien lo intente. Si ninguna está activa, el nav esconde el ítem y `/api/menciones`
responde **404, no 403**.

**Decisiones que no hay que deshacer:**
- **`externalId` lleva prefijo de fuente** (`tw_`, `tt_`, `ig_`): la columna es única global.
- **`notificada`**: sin ese flag, cada ciclo reenviaría el mismo correo. Solo se alerta lo
  negativo, y solo la primera vez.
- **Archivar ≠ eliminar.** Borrar una mención que sigue apareciendo la recrea al ciclo siguiente.
- **Términos: mínimo 3 caracteres, máximo 8 por negocio**, y `MENCIONES_MAX_POR_TERMINO`
  (default 20). Con proveedores que cobran por resultado, buscar "Ok" es ruido caro.
- **Gating: Negocio y Franquicia.**

**Por qué TikTok no trae menciones, y no es cuestión de escribir código:** la Display API solo
devuelve videos del usuario autenticado; la Research API sí busca por keyword pero está
restringida a instituciones académicas; la Business API solo da métricas propias;
`business/mention/list/` **no existe**; y las menciones con `@` llegan a la bandeja de la app,
sin API que la lea. Única vía real: **proveedor de datos externo de pago** (~US$100/mes) — el
primer costo variable por cliente que tendría Notoria. Cuando se decida, se enchufa **solo
tocando `tiktokMenciones.scraper.js`**: implementar `consultarProveedor()`, mapear en
`normalizar()` y setear las dos variables.

⚠️ **X/Twitter se eliminó del producto.** El tier gratuito cerró en febrero de 2026: era tan
de pago como TikTok. Si alguien lo quiere reactivar, hay que presupuestarlo como proveedor de
pago, no como "solo falta el token".

⚠️ **`Plataforma.TWITTER` quedó huérfano y se deja a propósito.** Borrar un valor de un enum
de Postgres no es un `ALTER`: Prisma genera `CREATE TYPE` nuevo + casteo de `resenas`,
`snapshots` y `alertas` + `DROP TYPE`, y pide `--accept-data-loss`. Riesgo real en prod a
cambio de cero beneficio.
---

## 9. Comprobantes y facturación electrónica (SUNAT)

**Ruta elegida: SEE-Del Contribuyente** (emisión desde el propio backend, sin PSE). El
**Certificado Digital Tributario gratuito de SUNAT** es válido para este sistema: no hace
falta comprar certificado ni pagar un PSE. El `.p12` está fuera del repo y **fuera de
OneDrive**; en producción va como `SUNAT_CERT_P12_BASE64` y se decodifica **a memoria**.
Certificado vigente del **27/07/2026 al 26/07/2029** — nada firmado antes del 27 es válido.

**Criterio de precios: el precio publicado INCLUYE IGV.** S/59 = base S/50.00 + IGV S/9.00.
Toda la lógica tributaria vive aislada en `src/lib/tributario.js` para que un contador la
pueda auditar sin leer el resto del backend. El IGV se calcula **como residuo** para que la
suma cuadre siempre al céntimo.

**Estructura:**
- `schema.prisma`: `Comprobante`, `SerieComprobante`, `ResumenSunat`, y datos fiscales del
  receptor en `Usuario` (`docTipo`, `docNumero`, `razonSocial`, `direccionFiscal`, `paisFiscal`).
- `services/comprobante.service.js`: emisión **idempotente por pago** + correlativo atómico
  (`UPDATE ... RETURNING`, no `SELECT`+`UPDATE`, que podría entregar el mismo número dos veces).
- `services/comprobante.pdf.js`: representación impresa con el orden que SUNAT exige + QR
  (`contenidoQR()`). Solo en comprobantes fiscales; el VOUCHER no lleva QR.
- `enviarComprobante` en `utils/emails.js`: PDF al cliente + copia a `EMAIL_CONTABILIDAD`
  **en envío aparte, no BCC**, para que llegue aunque rebote el correo del cliente.
- Endpoints `GET/PUT /api/pagos/datos-fiscales` y `GET /api/pagos/comprobantes/:id/pdf`.
- `src/sunat/`: `certificado.js` (node-forge, cachea porque descifrar PKCS#12 es costoso) ·
  `ublInvoice.js` · `ublResumenBoletas.js` (RC 1.1) · `ublComunicacionBaja.js` (RA 1.0) ·
  `firmaXades.js` · `billService.js`.

**Todo validado contra `e-beta.sunat.gob.pe` con código 0:** factura gravada, factura de
exportación, boleta, resumen diario, anulación de boleta y comunicación de baja.

**Correcciones ganadas contra el validador — no revertirlas:**

| # | Regla | Si se rompe |
|---|---|---|
| 1 | `KeyInfo` necesita el prefijo **`ds:`** en sus hijos | **2335** "Unsupported or unrecognized Signature signer format" |
| 2 | `cac:PaymentTerms` con `FormaPago`/`Contado` es obligatorio en facturas | **3244** |
| 3 | `schemeAgencyName` del tributo debe ser **`PE:SUNAT`** | observación **4256** (acepta igual) |
| 4 | En el resumen, el estado de línea va en **`cac:Status/cbc:ConditionCode`** — el único elemento de la línea sin prefijo `sac:`, y el orden es `cac:Status` → `sac:TotalAmount` → `sac:BillingPayment` → `cac:TaxTotal` | **2522** "No existe información del documento del anticipo", que apunta a otra cosa |
| 5 | El bloque del receptor solo va si la boleta lo identifica | — |
| 6 | `cac:Signature/cbc:ID` debe ser `SignatureSP`, el mismo Id con que firmaXades crea la firma | — |
| 7 | `sac:DocumentNumberID` va **sin ceros de relleno** (`F001-00000123` se da de baja como serie `F001`, número `123`) | — |
| 8 | `cbc:CustomizationID` del RA es **1.0**, no 1.1 como el resumen | — |

🔴 **Ninguna fecha que vaya a SUNAT se formatea con `toISOString()`** — devuelve UTC, y entre
las 19:00 y la medianoche de Lima el comprobante viajaba con la fecha de mañana → **2236**.
Usar `tributario.fechaPeru()` / `horaPeru()`, que formatean en `America/Lima`.

**Regla de diagnóstico:** un error de SUNAT con nodo `"/"` y valor vacío **no señala el sitio
del fallo**. No perseguir el texto del mensaje; **bisecar el documento**. Y el propio
validador es un oráculo: ante un elemento mal colocado responde *qué elemento esperaba a
continuación*.

**Qué se anula con qué — no es intercambiable:**

| Se anula | Con qué | Plazo |
|---|---|---|
| Factura (y sus notas 07/08) | Comunicación de baja **RA** | 7.º día calendario siguiente a la emisión |
| Boleta (y sus notas) | Resumen diario **RC** en estado 3 | 7 días desde el CDR del resumen que la informó |

Meter una boleta en un RA es rechazo seguro, así que `construir` lo corta antes de gastar un
envío. **Anular no es corregir:** si el cliente ya la tiene y cambia el importe, corresponde
una nota de crédito.

**Dos colas separadas, y la separación es deliberada:**

| | Factura | Boleta |
|---|---|---|
| Worker | `envioSunat.worker.js` | `resumenSunat.worker.js` |
| Envío | `sendBill`, una a una | `sendSummary`, agrupadas por día |
| Respuesta | CDR en el acto | **ticket**, y el CDR se pide con `getStatus` (`statusCode` 98 = procesando) |
| Plazo | 3 días | 7 días |
| Cron | cada 10 min | `5-59/10 * * * *`, desfasado 5 min para no pegarle a SUNAT con las dos cosas a la vez |

- **Cola y no envío directo en el cobro:** SUNAT se cae, tarda o devuelve 401 por saturación,
  y el cobro del cliente no puede depender de eso.
- **El XML firmado se guarda ANTES de enviar.** Regenerarlo produciría otra firma y, si SUNAT
  ya había recibido el primero, un conflicto.
- 🔴 **El ticket se persiste antes de dar el envío por terminado.** Un ticket entregado **no
  significa aceptado**; si el proceso se cae entre el envío y la consulta, sin él no hay forma
  de saber si SUNAT aceptó y reenviar produciría un duplicado. El ciclo pregunta
  `if (ticket && estado === 'EN_PROCESO')` → consultar, **nunca reenviar**.
- **Tres desenlaces con reacciones distintas:** `ACEPTADO` cierra; `RECHAZADO` es de fondo y
  no se reintenta (hay que corregir y reemitir con otro correlativo); `ERROR_TRANSPORTE` sí,
  con espera creciente (1, 5, 15, 60, 180, 360 min).
- **Solo se agrupan días ya cerrados.** Un resumen del día en curso obligaría a un segundo
  resumen para las boletas que entren después.
- `envioSunat.worker.js` filtra por **`tipo: 'FACTURA'`** — filtro **positivo**, no "todo lo
  que no sea boleta": un VOUCHER en `PENDIENTE` es un error de datos, y mandarlo lo
  convertiría en un problema fiscal.
- **Los dos plazos viven juntos** en `tributario.js` (`calcularFechaLimiteEnvio` /
  `calcularFechaLimiteResumen`). Darle a la boleta el plazo de la factura la daría por vencida
  cuatro días antes de tiempo.
- **Solo se propagan estados finales** a las boletas: `EN_PROCESO` es del resumen y
  `Comprobante.estadoSunat` no lo contempla.
- Rechazos y vencimientos **avisan por correo a `EMAIL_CONTABILIDAD`**.

**Persistencia:** `xmlFirmado` y `cdrXml` como `@db.Text` en la propia tabla (~10 KB por
comprobante). El disco de Railway es efímero y no era opción.

**Identificación obligatoria desde S/700** (RS 007-99/SUNAT art. 8). Hoy **solo lo cruza
FRANQUICIA anual (S/1716)**; Negocio anual son S/564 y no lo cruza — **preguntar a
`tributario.requiereIdentificacion()`, no a la memoria**: al tocar un precio la respuesta
cambia sola. Si el importe cruza el umbral y faltan los datos, `POST /api/pagos/culqi`
responde **409 `DATOS_FISCALES_REQUERIDOS` y no crea nada en Culqi** — va antes del cliente y
de la tarjeta a propósito: cobrar y descubrir luego que no se puede emitir deja al cliente
pagado y sin documento. Mira `precioBase`, no el importe con promo.
⚠️ Al volver del formulario se llama a `handleCTA(plan, true)`; ese segundo argumento **no es
opcional**: tras `refrescarPerfil()` el estado `usuario` todavía tiene el perfil viejo y sin
esa señal se pediría en bucle lo que el usuario acaba de rellenar.

`tributario.validarReceptorParaSunat()` se llama desde `comprobante.service.js` **antes de
pedir el correlativo** (la numeración no admite huecos) y desde `pago.routes.js` **antes de
cobrar**. Si falta algo no se emite y se avisa a contabilidad: se corrige y se reemite, **no
se degrada a VOUCHER a escondidas**.

**Lo que falta y es a propósito:** la comunicación de baja (RA) y la anulación de boletas no
tienen disparador — no hay ninguna acción en el producto que anule un comprobante. El modelo
`ResumenSunat` ya distingue `tipo` RC/RA para cuando exista.

**Cambiar el domicilio fiscal — los DOS sitios que hay que tocar, y en qué orden.**
Desde el 2026-08-22 el domicilio vive en dos únicos lugares: `DOMICILIO_FICHA_RUC` en
`lib/tributario.js` (los cinco campos que van al XML) y `CONTACTO` en
`brand-shield-web/src/lib/contacto.js` (del que tiran el pie, Términos, Privacidad y el botón de
WhatsApp; hasta el 2026-09-16 vivía dentro de `PieLegal.js`). El README y este archivo son
documentación y van detrás.

🔴 **Los cinco campos del domicilio son todo o nada.** `ublInvoice.js` manda calle, ubigeo,
distrito, provincia y departamento al mismo bloque y SUNAT los contrasta contra la ficha RUC.
Antes solo `direccion` y `ubigeo` tenían override por variable de entorno —lo que parece
suficiente al mudarse— y los otros tres estaban fijos: el resultado habría sido la calle
nueva con el distrito viejo, rechazado con un mensaje que no señala cuál de los cinco falla,
y después de gastar un correlativo que no admite huecos. Ahora `validarEmisor()` corta ese
caso **antes de pedir el número**, junto a la validación del receptor, y ante un cambio
parcial se queda con el domicilio del código, que al menos es coherente.

⚠️ **El orden importa:** cambiar primero en SUNAT y desplegar después deja una ventana en la
que cualquier comprobante emitido sale con la dirección vieja y es rechazado. Hoy esa ventana
es inofensiva —**0 comprobantes emitidos**— pero en cuanto haya cobros hay que hacer las dos
cosas seguidas, y comprobar con `railway ssh` que el contenedor ya tiene el domicilio nuevo
antes de que entre el siguiente pago.

`node scripts/prueba-emisor.js` — 17 comprobaciones. **Correrlo al tocar el domicilio.**

### Lo que enseñó el primer envío REAL a producción (2026-08-23)

Todo se había validado contra `e-beta` y pasaba con código 0. Contra producción apareció lo
que beta no podía enseñar:

🔴 **Un usuario SOL secundario puede existir, estar Activo y aun así no servir.** El nuestro
(`NOTORIAS`) no tenía **ninguna opción asignada**, y SUNAT responde a eso con
`0102 — Usuario o contrasena incorrectos`: el mismo código que ante una clave mala. El
mensaje manda a cambiar una contraseña cuando lo que falta es un permiso.
- Se asigna en Clave SOL → *Administración de usuarios secundarios* → **Modificar Programas**:
  `TRIBUTARIOS → Comprobantes de pago → SEE - Del Contribuyente y Envío de Documentos`, con
  sus dos ramas: *Servicio de Envío de Documentos Electrónicos por Servicio Web* (lo que usan
  `sendBill` y `sendSummary`) y *Consultar Envíos de CPE* (lo que usa `getStatus`).
- ⚠️ El panel derecho solo enseña las opciones del nodo seleccionado, pero la selección **sí
  se acumula** entre nodos. Se comprueba con el enlace «Resumen de opciones asignadas» antes
  de grabar; el nodo padre por sí solo no asigna nada.
- ⚠️ Los **«Asignar Roles»** son todos de aduanas y VUCE: ninguno aplica a facturación.
- En nuestro caso hacían falta **las dos cosas**: el permiso Y una contraseña nueva.

⚠️ **El usuario PRINCIPAL y el secundario pueden medir lo mismo.** Acá son `LEOTHDAY` y
`NOTORIAS`, los dos de 8 caracteres: comprobar el largo de `SUNAT_SOL_USUARIO` no distingue
cuál está configurado. Hay que comparar la cadena.

🔴 **`getStatus` con un ticket ALFANUMÉRICO devuelve HTTP 200 con el cuerpo VACÍO** — ni
Fault, ni statusCode, ni content. Parece que el método está roto y lo que está mal es el
dato: los tickets son numéricos (`AAAAMMDD` + correlativo).

⚠️ **Las credenciales van dentro de un XML y hay que escaparlas.** SUNAT admite símbolos en
la clave SOL, y un `&` rompería el sobre SOAP — con el **mismo `0102`** por respuesta. Ya está
escapado en `billService.credenciales()`.

⚠️ **El CDR de una boleta vive en el RESUMEN, no en el comprobante.** `Comprobante.cdrXml`
queda `null` y `ResumenSunat.cdrXml` tiene el documento. Es correcto —el CDR es del resumen y
las boletas heredan su estado— pero al buscar el comprobante de conservación hay que ir al
resumen.

**Anular una boleta: `scripts/anular-boleta.js`.** Arma un resumen con la línea en estado 3,
lo firma, lo manda y solo marca `ANULADO` **si SUNAT aceptó** — marcarlo antes dejaría en la
base una boleta anulada que para SUNAT sigue viva, y nadie volvería a intentarlo. Usa el mismo
contador de correlativos que los resúmenes normales: dos series de RC del mismo día chocarían
en el identificador.

🔴 **Reembolsar en Culqi NO anula el comprobante.** Son dos sistemas independientes: el dinero
vuelve y la boleta sigue emitida, declarada y con su IGV. Cada devolución de un cobro ya
facturado exige anular aparte, dentro de plazo.

✅ **Desde el 2026-08-23 el producto avisa solo** (`lib/anulacionPendiente.js` +
`workers/anulaciones.worker.js`). Antes no había nada: en la primera prueba de cobro real
alguien tuvo que **acordarse**, y con un cliente de verdad eso no ocurre. Es el único error del
circuito de cobro que cuesta dinero.

- **Dos disparadores, y hacen falta los dos.** El webhook de Culqi avisa **en el acto**, y un
  cron a las 8:00 **repite cada día hasta que se anule**. Un correo suelto que llega de noche y
  un plazo que vence en siete días es justo la combinación que falla.
- **Modo urgente de verdad:** `X-Priority: 1`, `Importance: high` y `X-MSMail-Priority: High`,
  no solo mayúsculas en el asunto. Va a `EMAIL_CONTABILIDAD`.
- **El correo trae el comando exacto** (`scripts/anular-boleta.js <numero> --aplicar`). Un aviso
  que dice «hay que anularlo» y obliga a buscar cómo es un aviso a medias, y este llega con el
  reloj corriendo.
- 🔴 **Los dos plazos son de 7 días pero cuentan desde sitios distintos**, y ese es el error
  caro: la **boleta** desde el CDR del resumen que la informó (`enviadoEn`), la **factura**
  desde la emisión. Darle a la factura el ancla de la boleta le regalaría días que no tiene.
- ⚠️ **`diasRestantes` usa `floor`, no `ceil`.** El límite es el FIN del séptimo día, así que a
  media tarde la resta da 6.46: redondear hacia arriba diría «quedan 7» cuando quedan seis
  completos. Con un plazo legal detrás, equivocarse por exceso es el lado peligroso.
- **Sigue avisando después de vencer**, pero solo una semana más: ya no se puede anular, pero
  hay que emitir una nota de crédito y alguien tiene que enterarse. Pasada esa ventana calla —
  un aviso diario eterno se convierte en ruido y se aprende a ignorar.
- **Sin columna nueva:** «pendiente de anular» se deriva de `Pago.estado === 'REEMBOLSADO'` y
  `Comprobante.estadoSunat === 'ACEPTADO'`.
- `node scripts/prueba-anulacion-pendiente.js` — 31 comprobaciones, casi todas sobre los
  silencios: un VOUCHER no se anula, uno ya anulado no se repite, uno que SUNAT no aceptó no
  está vivo. Si eso se rompe, el aviso se vuelve ruido y deja de servir el día que importa.
- ✅ **Probado en vivo el 2026-08-23**: el correo llegó `delivered` a `didier@usenotoria.app`
  con el asunto «🔴 URGENTE — anular B001-00000001 (quedan 7 días)», y contra los datos reales
  el worker **calla** correctamente, porque esa boleta ya está anulada.

⚠️ **El webhook de reembolso apaga `suscripcionActiva`.** Es lo correcto para un cobro de
suscripción, pero tras un cobro suelto hay que restaurar el campo a mano.

⚠️ **`reembolsar` exige el importe.** Sin `amount`, Culqi responde «No existe el monto que
intentas devolver o no está definido» — que suena a que el cargo no existe cuando lo que falta
es el campo.

**Trámites fuera del código:** afiliación al SEE-Del Contribuyente ✅ · usuario SOL secundario
solo con permiso de emisión · Registro de Exportadores de Servicios (sin él, las ventas al
exterior no califican como exportación y **sí llevarían IGV**). ⚠️ Nada de esto es asesoría
tributaria: confirmar con contador.

📋 **Lo que hay que PRESENTARLE a SUNAT cada mes vive en `docs/obligaciones-tributarias-mensuales.md`**,
no acá: cronograma de vencimientos, la rutina **RVIE → RCE → 621** (en ese orden, porque el
SIRE alimenta la propuesta del 621), qué va en cada casilla y el estado verificado contra el
portal. Este archivo cubre lo que el **código** emite; ese cubre lo que la **empresa** declara.
⚠️ **Ese documento no estaba enlazado desde aquí y costó caro el 2026-08-24:** al preguntar por
el registro de ventas y compras no apareció en la búsqueda, y se dio por pendiente un RVIE que
llevaba días presentado. Un documento que nadie encuentra es un documento que no existe.

🔎 **Para saber si un periodo está declarado sin generar nada**, el desplegable del SIRE lo dice
al lado del mes (`JUL-Presentado` / `AGO-No Presentado`), en RVIE y en RCE. No hace falta aceptar
propuesta ni pulsar *Generar registro* — que además son irreversibles.

**Scripts (correrlos antes de dar por buena cualquier modificación a `src/sunat/` o
`tributario.js`):** `generar-cert-prueba.js` · `prueba-comprobantes.js` (incluye que
`gravadas + IGV` cuadre al céntimo en 100 000 importes) · `prueba-xml-firma.js` ·
`prueba-sunat-beta.js` · `prueba-cola-envio.js` · `prueba-resumen-beta.js` ·
`prueba-baja-beta.js` · `prueba-resumen-cola.js`.

⚠️ `certificado.configurado()` devuelve `true` con solo el base64 cargado, **aunque falte la
contraseña**. No tomarlo como prueba de que el certificado se puede abrir.

---

## 10. Libro de Reclamaciones (Ley 29571 · D.S. 101-2022-PCM)

- Modelo `Reclamacion` + `POST /api/reclamaciones`, **sin autenticación a propósito**: la
  norma no permite exigir registro previo. Rate-limit propio (10/hora por IP) **solo en el
  POST público**, no en el router entero.
- Numeración **correlativa por año** (`2026-000001`). El `count`+`create` puede chocar con el
  `@unique`, así que reintenta; el índice único es la garantía real.
- Dos correos: `enviarCargoReclamacion` (la **constancia** al consumidor, obligatoria: repite
  toda la hoja) y `enviarAvisoReclamacionInterno`. Si Resend falla, la reclamación **igual
  queda guardada**.
- Distingue **RECLAMO** (disconformidad con el servicio) de **QUEJA** (malestar con la
  atención): son figuras distintas. Plazo: **15 días hábiles improrrogables**.
- ⚠️ Es un **registro legal** (conservar 2 años). No dejar datos de prueba ahí.

**Se gestiona POR TERMINAL, sin panel web.** `scripts/reclamaciones.js
[todas|ver <n>|responder <n>]` vía `railway run --service api`. Guarda datos personales **de
terceros** (DNI, domicilio, teléfono) protegidos por la Ley 29733: exponerlos tras el panel
haría que robar una sesión también los comprometiera. **Se descartó un rol de administrador**
(se escribió un `soloAdmin` con `ADMIN_EMAILS` y se revirtió; la nota de por qué no existe
está en `auth.middleware.js`).

- Responder **manda primero el correo y solo entonces marca RESPONDIDO**: si Resend falla, la
  hoja sigue pendiente porque el consumidor no recibió nada y el plazo corre. Se niega a
  responder dos veces: la respuesta es el cargo formal ante INDECOPI.
- `src/lib/reclamaciones.js` tiene el plazo legal en un solo sitio, compartido por el script y
  el cron (si cada uno contara por su cuenta, acabarían discrepando). ⚠️ Cuenta de lunes a
  viernes y **no descuenta feriados**: el plazo mostrado es más corto que el real, a propósito.
- `iniciarAvisoReclamaciones` (cron diario 9:00) avisa de lo que vence en ≤5 días hábiles y
  **sigue avisando cada día hasta que se responda**.

---

## 11. Equipo: compartir la cuenta

`Usuario` = la **persona** que inicia sesión. `Cuenta` = la **empresa** en la que está
trabajando ahora. Casi siempre coinciden.

**El propietario NO tiene fila en `miembros`** — es el `Usuario` del que cuelgan los negocios,
y su rol se sintetiza en el middleware. Evita una migración de datos (una que falle a medias
dejaría a alguien sin acceso a su propia cuenta) y mantiene la propiedad en
`Negocio.usuarioId`: las ~40 consultas del panel no cambian de forma, cambian de sujeto
(`req.usuario.id` → `req.cuenta.id`).

Piezas: `src/lib/equipo.js` (fuente única) · `Miembro` / `Invitacion` / `RegistroActividad` +
enum `RolMiembro` · `api/routes/equipo.routes.js` · `dashboard/equipo` · `/invitacion/[token]`.

| Plan | Asientos |
|---|---|
| GRATIS | 1 (no comparte) |
| NEGOCIO | 3 (dueño + 2) |
| FRANQUICIA | 10 (dueño + 9) |

⚠️ **Los asientos CUENTAN AL DUEÑO.** Contarlo al revés haría que el panel dijera un número y
la página de precios otro.

Seis permisos, no una matriz por endpoint: `ver` · `actuar` · `negocios` · `conexiones` ·
`facturacion` · `equipo`. PROPIETARIO los seis · GESTOR `ver`+`actuar` · LECTOR `ver`.

- ⚠️ **`conexiones` está separado de `actuar`**: quien conecta una red autoriza un token que
  opera esa cuenta **desde fuera de Notoria**, y quien la desconecta se la puede quitar al
  negocio entero.
- ⚠️ **La facturación entera es del propietario, también las lecturas**
  (`router.use(permitir('facturacion'))`): el historial lleva nombre del titular, documento y
  domicilio fiscal.
- 🔴 **Regla al añadir una ruta: si no es GET, lleva su `permitir(...)`.** Sin él hereda el
  permiso más bajo y un LECTOR podría escribir.

**`resolverCuenta` va DENTRO de `autenticar`**, no como middleware aparte: si una ruta se lo
saltara, `req.cuenta` sería `undefined` y la consulta caería en `usuarioId: undefined`, que
**en Prisma no es un error sino un filtro que se ignora** — devolvería los negocios de todo el
mundo. Fallo abierto y silencioso.

La cuenta activa viaja en la cabecera **`X-Cuenta`** (declararla en `allowedHeaders` del CORS
o el navegador la bloquea en el preflight). Sin cabecera = cuenta propia, **cero consultas
extra**. En el frontend vive en `localStorage` (`bs_cuenta`), **no en el token**: cambiar de
cuenta no puede obligar a reemitir la sesión, y el backend valida la pertenencia en cada
petición, así que un valor manipulado devuelve 403.
⚠️ **`cabecerasAuth()` de `lib/api.js` existe para los ~30 `fetch` sueltos** del panel
(descargas de PDF, formularios). Si uno se olvida de `X-Cuenta`, el backend resuelve la cuenta
propia y la pantalla dice "negocio no encontrado" sin explicar por qué: falla cerrado, pero es
indepurable.

**El corte por asientos** es lo único que impide el abuso: bajar de plan **no borra
membresías** (sería destruir datos por un cambio de plan) pero **sí retira el acceso** a quien
no cabe. Sin eso bastaría contratar Franquicia un mes, invitar a nueve y bajar a Negocio.
- El corte es **por antigüedad**. Si dependiera del orden de la consulta, dos personas se
  turnarían el acceso entre recargas.
- Se aplica en **tres** sitios que tienen que coincidir: `resolverAcceso` (al entrar),
  `equipoDeCuenta` (al pintar la lista) y `cuentasDe` (el selector, que no debe ofrecer una
  cuenta donde se va a rebotar con 403).
- 🔴 Bug encontrado al escribir las pruebas: `copiasDeAlerta` cortaba **solo entre gestores**.
  Los asientos se ocupan por orden de entrada sin mirar el rol, así que un LECTOR antiguo
  desplaza al último gestor. **Pedir todos los miembros, cortar, y DESPUÉS filtrar por rol.**
- **Las invitaciones pendientes ocupan asiento**: si no, se mandarían veinte de golpe y el
  límite lo descubriría el invitado al aceptar.

**Alcance por sede:** `Miembro.negociosIds` vacío = todos; con ids = solo esos.
⚠️ Se aplica con **`AND`, nunca escribiendo `where.id`**: muchas consultas ya traen su propio
id (`{ id: req.params.id, usuarioId }`) y pisarlo dejaría pasar el negocio ajeno.
⚠️ Lista vacía se **normaliza a `null`** al salir de `resolverAcceso`, para que nadie tenga
que distinguir `[]` de "todos" — la duda que acaba en un `IN` vacío que no devuelve nada.

**Decisiones de producto:**
- **La invitación está atada a un correo**; aceptarla desde otra sesión falla con
  `CORREO_DISTINTO`. El token viaja por un canal que el dueño no controla. De paso, el
  registro previo hace de verificación.
- **`GET /api/equipo/invitacion/:token` es público** (limitador propio 30/15min): la mitad de
  los invitados no tiene cuenta, y quien ve "Marta te invitó a Cevichería El Muelle" se
  registra; quien ve un login pelado, se va.
- **Se acepta con un BOTÓN, no al cargar**: los antivirus corporativos abren los enlaces para
  analizarlos y consumirían el token.
- **Si el correo no sale, la invitación se borra** y se devuelve 502: el enlace solo existe
  dentro de ese mensaje.
- **Invitar usa `upsert`**; reenviar emite un token **nuevo** (el viejo ya circuló por un buzón
  que quizá no era el correcto).
- **La cuota semanal de IA es de la CUENTA, no de la persona**, o invitar multiplicaría la
  factura de Groq.
- **Las alertas se copian a los GESTORES** que alcanzan ese negocio, con el filtro de
  preferencias **del dueño**. Los LECTORES no reciben nada.
- **El registro de actividad no se borra al quitar a alguien**, y el nombre del autor va
  **congelado** en cada fila. Solo lo ve el propietario: es rendición de cuentas hacia quien
  paga, no vigilancia entre colegas.
- **Salir del equipo no lleva `permitir('equipo')`**: precisamente quien no tiene ese permiso
  es quien lo necesita.
- **`AuthContext` tiene salida de emergencia:** ante 403 `SIN_ACCESO_CUENTA` / `SIN_ASIENTO`
  borra `bs_cuenta`, reintenta y explica. Sin eso, que te quiten el acceso con la sesión
  abierta deja el panel inservible.
- **Cambiar de cuenta recarga la página entera**: media docena de pantallas guardan estado de
  la cuenta anterior.

Pruebas: `node scripts/prueba-equipo.js` — **48 comprobaciones** con Prisma simulado.
⚠️ Cualquier prueba que simule `auth.middleware` debe devolver `permitir` y poner `req.cuenta`.

**Probado en vivo el 2026-08-22** (invitación real de `didierprincipe@gmail.com` a
`didier@usenotoria.app`, rol Gestor). Lo que quedó verificado contra producción:

| Paso | Resultado |
|---|---|
| Asientos | ✅ pasó de "1 de 3" a **"2 de 3" al invitar** — la invitación pendiente ocupa asiento, tal como se diseñó |
| Propietario | ✅ aparece en la lista **sin fila en `miembros`**, con su rol sintetizado |
| Correo | ✅ sale de Resend, cruza el Email Routing de Cloudflare y **aterriza en el buzón**, con rol, alcance, la dirección con la que hay que aceptar y el vencimiento a 7 días |
| Caducidad | ✅ "Expires Aug 29, 2026" — los 7 días exactos |
| Se acepta con un BOTÓN | ✅ la página no acepta al cargar |
| **`CORREO_DISTINTO`** | ✅ con la sesión de `didierprincipe@` abierta y una invitación para `didier@`, **explica el desajuste y no deja aceptar**, con botón para entrar con la otra cuenta |

| **Aceptar** | ✅ el dueño aceptó con la sesión del invitado: se creó el `Miembro` con rol GESTOR y alcance a todos los negocios |
| Consumo del token | ✅ la fila de `Invitacion` **desaparece al aceptarse** — no queda pendiente ocupando asiento |
| Registro de actividad | ✅ `equipo_invitar` y, 13 ms después de crear el miembro, `equipo_aceptar`, con el **`autorNombre` congelado** en cada fila |

**El circuito está probado entero y la base quedó limpia** (0 miembros, 0 invitaciones; solo
sobrevive un `escanear` del 21/08 que era anterior). Ya no hace falta repetirlo: lo único sin
ejercitar en vivo es el camino del invitado **sin cuenta previa**, que añade el registro en
medio y no cambia nada de la lógica de equipo.

🔴 **Bug encontrado durante esa prueba — la regla que deja:** con el panel en inglés, invitar
respondía *"Invitación enviada a…"* y la lista de pendientes decía *"Gestor"* junto a
*"Expires Aug 29, 2026"*. El backend redactaba el texto y siempre en español. **Lo que lleva
idioma se compone en el panel; del backend viaja el valor del enum (`rol`), que no tiene
idioma.** Es el mismo error que ya había pasado con el texto de las alertas (§12), por otro
camino. ⚠️ `accion()` además prefería el mensaje del backend sobre el texto local traducido
(`r?.mensaje || ok`), así que quitar, cambiar de rol, reenviar y cancelar también contestaban
en español: ahora **gana el local**.
---

## 12. Escaneo, detección y alertas

**Cadencia por plan**: Gratis 24 h · Impulso 12 h · Negocio 4 h · Franquicia 2 h. El cron
corre **cada hora** y elige a quién le toca. Antes había un solo cron de 4 h para todos, que
rompía la oferta en las dos direcciones: Franquicia pagaba por 1 h y recibía 4, y cada cuenta
gratuita costaba **seis veces** las consultas a Places prometidas. El cooldown del botón
"Escanear ahora" se importa de esa misma constante.

🔴 **Desde el 2026-09-19 el CRON ya no pregunta a `HORAS_ESCANEO[plan]` sino a
`dormancia.horasEscaneo(usuario)`**, porque el plan gratuito corre a 24 h su primer mes y a 72 h
después: el número depende del **usuario**, no solo del plan (§8.9). `HORAS_ESCANEO` sigue vivo
y sigue siendo correcto **para el cooldown del botón manual**, que sí es por plan — son dos
relojes distintos, igual que ya lo eran el del cron y el del botón. ⚠️ Y el cron ni siquiera
llega a preguntar la cadencia de una cuenta **pausada**: `elegirVigilables` la saca antes.

**El botón manual se conserva, pero el panel dejó de pedir que lo uses** (decisión del dueño,
2026-08-22). El cooldown del botón es **igual al intervalo del cron de su plan**, así que
pulsarlo casi nunca adelanta nada — como mucho los minutos que falten para el ciclo
automático. Se queda por un solo motivo, que es suficiente: **un negocio recién conectado no
tiene `ultimoEscaneo`, así que el botón funciona sin cooldown**, y es lo que hace que el
cliente vea resultados en su primer minuto en vez de esperar 24 h.
- Se **borró el consejo "El hábito que protege todo lo demás: escanear"**, que pedía
  literalmente *"escanea apenas veas el botón verde disponible — no lo dejes para después"*.
  Entrenaba el hábito contrario al que persigue el producto (el afiche de la pared existe
  porque el abandono no se arregla con más pantalla), y desde que una reseña negativa avisa
  al momento era además falso.
- El estado bajo el botón pasó de *"Se reestablece hoy a las 14:30"* —un botón que existe
  para decirte que no— a **"Revisado hace 12 min · automático cada 4 h"**.
- 🔴 **Ese "hace 12 min" NO puede salir de `ultimoEscaneo`.** `GET /:id/cooldown` devuelve
  ahora `ultimaRevision`, que es la fecha del **último `Snapshot`**: la revisión de verdad, la
  haya pedido alguien o la haya hecho el cron. Con `ultimoEscaneo`, a un cliente que nunca ha
  tocado el botón el panel le diría "aún sin revisar" mientras el cron pasa cada 4 horas.

🔴 **`ultimoEscaneo` es el reloj del BOTÓN manual, no del cron.** Cuando el cron lo escribía,
a un plan Gratis le salía el botón en cooldown siempre, sin haberlo usado nunca. El cron usa
su propio reloj: la fecha del **último `Snapshot`** del negocio (se resuelve con un solo
`groupBy`). ⚠️ Única excepción: un negocio **sin ficha de Google** nunca genera snapshot, así
que para esos —y solo esos— el cron sigue marcando `ultimoEscaneo`.

**Señales del detector** (`src/nlp/detector.js`):

| Señal | Estado |
|---|---|
| Palabra crítica · 1★ sin texto | ✅ |
| **Texto duplicado** | ✅ Normaliza tildes, signos y mayúsculas (una campaña pegada casi nunca es idéntica carácter a carácter) y exige **15 caracteres mínimos**, para no marcar "malo" o "no vuelvo" |
| **Ráfagas por volumen** (`compararMediciones` + `ritmoHabitual`) | ✅ No depende de leer reseñas: compara el **total** entre dos mediciones —un entero exacto— contra el ritmo habitual del propio negocio. Umbral **relativo** a propósito: 6 reseñas en 4 h es una catástrofe para quien recibe 2 al mes y un martes normal para quien recibe 15 a la semana |
| Caída de rating | ✅ Compara contra el **snapshot anterior**, no contra `googleRatingBase` (que se fija al crear el negocio y no se actualiza: la alerta se recreaba **cada 4 h para siempre** y el cliente aprendía a ignorar los correos) |
| Cuentas recién creadas | ❌ **Imposible**: las cinco fuentes escriben `autorResenasTotal: null` |
| Picos por número de negativas | ❌ Pedía ≥5 en 24 h, y **Places entrega 5 reseñas COMO MÁXIMO** |
| **Reseña negativa nueva** (`alertarResenaNegativa`) | ✅ Añadida el 2026-08-22. Es la única señal **por reseña individual**, y sin ella el producto no avisaba de nada — ver abajo |

🔴 **Por qué existe `alertarResenaNegativa`, y por qué no se puede volver a quitar.**
Todas las señales de arriba son **agregadas**, y ninguna se cumple en un negocio que
no esté bajo ataque. El resultado medido en producción el 2026-08-22: **1783 escaneos,
15 negocios, 84 reseñas guardadas —12 de ellas de ≤2★ y 3 marcadas como sospechosas— y
CERO alertas creadas desde que existe la plataforma.** No fallaba nada; simplemente
nadie creaba una alerta por una reseña individual.

Una reseña de 1★ solo producía un correo **24 horas después**
(`revisarEscalacionesUrgentes`), que además **no crea fila de `Alerta`**: no aparecía
en el panel, no llegaba a la app Android y no la veían los gestores del equipo. El
dueño entraba y leía *"Todo tranquilo por ahora"* con una reseña de 1★ recién puesta
en su ficha. Y la pantalla de Alertas ya ofrecía elegir entre **"Cada reseña negativa"**
(activada por defecto) y "Solo picos (5+ en 24 h)": una preferencia que no gobernaba nada.

- **Reusa `RESENA_MUY_NEGATIVA`**, que ya estaba en el enum, en `TIPOS_VALIDOS`, en los
  iconos y en `Modelos.kt` de la app → **cero cambios de schema, cero toques a la app**.
- **Tres condiciones de silencio, y son lo que hay que vigilar** (si una se rompe no
  falla nada, solo se deja de avisar o se avisa de más): no avisa en el **primer barrido**
  de un negocio (llegan de golpe las 5 reseñas que publica Places, que pueden ser de hace
  años), no avisa de reseñas de **más de 30 días** (si el escaneo estuvo caído, algo viejo
  aparece hoy como nuevo *para nosotros*), y **va por `notificar()`, no por
  `enviarAlertaEmail` directo** — al revés que la ficha alterada, porque aquí las
  preferencias del cliente sí deben mandar: es justo lo que ese umbral existe para regular.
- ⚠️ **`esPrimerBarrido` se calcula ANTES de crear el snapshot del ciclo**, o la respuesta
  sería siempre "no".
- No sustituye a la escalación de 24 h: son dos mensajes distintos y los dos tienen
  sentido ("llegó una reseña de 1★" hoy, "lleva un día sin respuesta" mañana).
- `node scripts/prueba-alertas-resena.js` — 28 comprobaciones, casi todas sobre los
  silencios.

⚠️ **El enum `CUENTAS_NUEVAS` sigue vivo pero significa otra cosa**: hoy lo levanta el texto
duplicado, y por eso su etiqueta es "Campañas coordinadas". El id no se toca (está en la BD,
el worker y la app Android).

⚠️ **Sobre el promedio de las reseñas nuevas.** Se puede despejar de `(R2*N2 - R1*N1)/k`, pero
Google **redondea el rating a un decimal**, así que el margen es `0.05*(N1+N2)/k`: en una
ficha de 212 reseñas con 8 nuevas eso es **±2.7 estrellas**. La alerta dice el promedio exacto
solo si el margen ≤ 0.5; si no, la **cota superior** ("calificaron 2.1★ como mucho"), que es
rigurosamente cierta; y si tampoco, solo la caída publicada. **Nunca un número inventado: una
sola cifra falsa desacredita todas las demás alertas.**

**Vigilancia de la ficha de Google** (`src/lib/fichaGoogle.js`). Google Maps deja que
**cualquiera** sugiera cambios sobre una ficha ajena y los aplica sin avisar al dueño.
- `business_status` (ficha cerrada) va en el grupo **Basic Data**, que la llamada ya paga
  → **sin costo nuevo**, para todos los planes.
- Teléfono, horario, nombre y dirección son del grupo **Contact Data**, que Places cobra
  aparte → **solo NEGOCIO y FRANQUICIA**. El scraper los pide con
  `obtenerResenasGoogle(placeId, { conContacto })`.
- La referencia del valor anterior vive en **`Negocio.fichaGoogleRef`** (antes era una fila de
  `Alerta` marcada como control, y ese apaño obligaba a filtrarla en **seis** consultas — una
  de ellas ya se había olvidado el `import` y habría reventado el correo del día 5 del drip).
- ⚠️ **Un valor que pasa de tener contenido a `null` NO se reporta como cambio.** Places omite
  campos de forma intermitente y avisar de "te borraron el horario" cada vez convertiría la
  alerta en ruido.
- El aviso va por `enviarAlertaEmail` **directo**, saltándose las preferencias: ninguna
  preferencia debería poder silenciar "tu local aparece cerrado en Google". Mismo criterio que
  la escalación de urgencias.
- Tipo propio **`FICHA_ALTERADA`**, que **no aparece en las preferencias a propósito**: no se
  puede apagar. Sí entra en `tiposActivos` del resumen por correo.

⚠️ **Al agregar un `TipoAlerta` hay que tocar CINCO lugares:** el enum de Prisma,
`auth.routes.js` (`TIPOS_VALIDOS`, si no el usuario no puede activarlo), `tiposActivos` del
worker, `Icons.js` (`ICONO_ALERTA`) y `alertas/page.js` (tipos + labels es/en). Más las
etiquetas de `web/src/lib/alertas.js` y `Modelos.kt` de la app.

**El correo de alerta (`enviarAlertaCritica`) tiene DOS formas, y la específica exige sus
piezas.** Desde el 2026-08-22 es el correo que más reciben los clientes, así que dejó de ser
genérico: cuando la alerta trae `detalle.rating` el asunto dice **«Reseña de 1★ en {negocio}»**
—no «Alerta en {negocio}»—, el cuerpo cita la reseña y el botón lleva a la pestaña **Reseñas**,
porque desde Alertas no se puede responder. Es bilingüe, como el drip.
- 🔴 **Sin `detalle` cae al genérico, y eso NO es un caso raro:** por `RESENA_MUY_NEGATIVA`
  pasan también la **escalación de las 24 h** y el aviso de **token de Facebook expirado**, y
  ninguno de los dos trae detalle. A los dos les toca el genérico con la descripción que ya
  traen. Al tocar este correo, correr `scripts/prueba-escape-emails.js`, que cubre los tres.
- El genérico tampoco dice ya «detectamos actividad inusual»: era falso para una reseña de 1★
  y para una ficha alterada.
- 🔴 **«Es bilingüe» era falso hasta el 2026-08-23, y el fallo no estaba en la plantilla.**
  `enviarAlertaCritica` elige con `ALERTA[usuario.idioma] || ALERTA.es`, pero los DOS `select`
  del worker que cargan el negocio pedían `id, email, nombre, prefsAlertas, plan` **sin
  `idioma`**: llegaba `undefined` y toda alerta salía en español. La escalación de 24 h y el
  reporte mensual sí lo pedían, así que el fallo afectaba justo al correo más frecuente. No es
  teórico: **la única cuenta con `idioma: 'en'` es la del dueño**, plan NEGOCIO y alertas
  inmediatas. Es el mismo error que ya pasó con las invitaciones de equipo (§11) y con la
  limpieza del landing (§15) — el lado inglés se olvida porque nada falla, solo sale en el
  idioma que no es. Lo vigila el bloque 6 de `prueba-alertas-resena.js`, que **lee el fuente**:
  un doble de Prisma nunca lo habría visto, porque el mock devuelve el objeto entero.
  ✅ **Los tres resúmenes se tradujeron el mismo día** (ver abajo).

**El idioma de un correo son DOS mitades, y fallar cualquiera da el mismo resultado mudo.**
El 2026-08-23 el fallo apareció por los dos caminos el mismo día: `enviarAlertaCritica` tenía la
plantilla traducida pero el `select` sin `idioma`; `enviarResumenSemanal` —**el correo que más
manda el producto**, 38 envíos en el historial de Resend— no estaba traducido *ni* su worker
pedía el idioma. En los dos casos el correo sale, se entrega y está en el idioma que no es: cero
errores, cero logs.

Estado tras la limpieza — **6 de 20 correos son bilingües, y los otros 14 lo son por decisión
escrita**, no por olvido:

| Bilingües | `enviarVerificacion` · `enviarAlertaCritica` · `enviarDrip` · `enviarResumenSemanal` · `enviarResumenSemanalConsolidado` · `enviarResumenAlertas` |
|---|---|
| **Español a propósito** | Comprobante (documento fiscal peruano) y los cuatro del **Libro de Reclamaciones** (instrumento legal de la Ley 29571). Traducirlos sería un error, no una mejora |
| **Español pendiente** | Bienvenida, contraseñas, cobro fallido, cancelación y los tres de equipo. Volumen bajo |

- 🔴 **El insight semanal lo escribe la IA, así que el idioma se le pide a ELLA**
  (`PROMPT_INSIGHT` en `resumenSemanal.worker.js`). Traducir la plantilla y dejar el insight en
  español daba un correo en inglés con una frase suelta en español en medio, que se lee peor que
  no tener insight. El insight cacheado en `Negocio.ultimoInsightSemanal` queda en el idioma del
  dueño, que es lo correcto: ese tooltip lo lee él.
- 🔴 **`periodo` del digest de alertas viaja como VALOR** (`'semanal'`/`'mensual'`), no como
  texto ya redactado. Antes se interpolaba tal cual y un usuario en inglés leía «Tu resumen
  semanal de alertas». Misma regla que las invitaciones de equipo (§11).
- ⚠️ **`node scripts/prueba-correos-idioma.js` obliga a clasificar cada correo nuevo**: si no
  está en `BILINGUES` ni en `SOLO_ESPANOL`, la prueba falla a propósito. Comprueba las dos
  mitades —la plantilla y el `select` de cada worker— y renderiza el semanal en los dos idiomas.

**Una ficha de Google se pide UNA vez por ciclo, aunque la vigilen varias cuentas**
(`obtenerFichaGoogleCompartida`, 2026-08-23). Dos usuarios distintos pueden monitorear el mismo
local y no es hipotético: ese día había **10 negocios activos y solo 9 `googlePlaceId`
distintos** — «Cebichería Fabián» la seguían dos cuentas, con 541 snapshots entre las dos, cada
una gastando su propia consulta a Places. Hoy es calderilla; con clientes de verdad es un costo
variable que se duplica sin que nada lo delate, porque la factura de Google no lo distingue.
- El caché vive **un ciclo** y se pasa explícito (`ctx.fichasGoogle`). Nada de memo con TTL
  dentro del scraper: entre ciclos los datos tienen que volver a pedirse, que es el producto.
- ⚠️ **La clave no puede ser solo el placeId.** `conContacto` cambia los campos pedidos (Contact
  Data se factura aparte y solo lo tienen NEGOCIO y FRANQUICIA). Una respuesta **con** contacto
  sirve para quien no lo paga —es superconjunto—, pero **al revés no**: servirla apagaría en
  silencio la vigilancia de teléfono y horario de un cliente que sí la paga. Por eso el ciclo
  además **ordena primero a los planes con contacto**, o en el caso mixto el caché no ahorraría.
- ⚠️ **Un `null` no se cachea.** Heredar un fallo ajeno convierte un error en varios justo
  cuando la cuota de Places se agota, que es cuando más importa.
- `node scripts/prueba-ficha-compartida.js` — 12 comprobaciones, casi todas sobre esas dos reglas.

**Canal único: correo.** `revisarEscalacionesUrgentes()` manda un recordatorio de las reseñas
de ≤2★ sin responder tras 24 h llamando a `enviarAlertaEmail()` **directo y no a
`notificar()`**, a propósito: no debe filtrarse por `prefsAlertas.frecuencia` (quien eligió
resumen semanal igual quiere enterarse de una 1★ que lleva un día sin contestar).

✅ **La columna `Usuario.telegramChatId` se borró el 2026-08-22.** Estaba vacía en los 11
usuarios y nadie la leía. No queda nada de Telegram en el producto.


### Cuánto correo manda Notoria — `lib/prefsCorreo.js` (2026-09-09)

🔴 **Decisión de producto del dueño, y el motivo es de entrega, no de estética.** Hasta hoy el
producto mandaba **un correo por cada reseña negativa** y un **resumen todos los domingos a todo el
mundo**. Para una cuenta gratuita recién creada que solo entró a curiosear, eso es una bandeja llena
de avisos de un producto que todavía no le importa — la vía más corta a que nos marquen como spam. Y
**con el dominio quemado se degrada la entrega de TODO lo demás**, incluidos los avisos que sí
importan y los comprobantes fiscales. Así que el correo no se pierde: **se agrupa.**

| | Antes | Ahora |
|---|---|---|
| Resumen por negocio | **domingo, para todos**, sin ajuste posible | **mensual (día 1) por defecto**, o semanal el día que el cliente elija |
| Aviso por reseña negativa | uno por reseña, al momento | **GRATIS: 1 correo por cada 5**. Planes de pago: al momento |

**Nada se deja de detectar**: el panel enseña todas las alertas desde el primer segundo. Lo único
que cambia es cuánto correo sale.

⚠️ **Los defaults viven en `lib/prefsCorreo.js` y SOLO ahí, en código, no como fila en la base.**
`Usuario.prefsAlertas` es `Json?` y arranca **null**, así que una cuenta nueva no tiene preferencia
guardada y quien decide es ese archivo. No hizo falta migración.
🔴 **El valor por plan, en cambio, va en `lib/planes.js`** (`loteAvisoResenas`): es un límite por
plan, y una tabla por plan fuera de ahí es lo que costó los tres fallos silenciosos de IMPULSO
(§8.6). Escribirla en `prefsCorreo.js` fue lo primero que hice y `prueba-planes.js` la cazó el mismo
día — para eso existe ese barrido.

**Lo que hay que vigilar, porque nada de esto da señal al romperse:**

| Regla | Si se rompe |
|---|---|
| 🔴 **`Alerta.notificada` significa «ya salió un correo que cubre esta alerta»**, y es el acumulador del lote | Hasta hoy se escribía y **nadie la leía**: el worker la marcaba justo después de llamar a `notificar()`, hubiera salido correo o no. Marcarla a ciegas pone el contador a cero en cada reseña, así que las cinco **no se juntan nunca** y GRATIS vuelve a un correo por reseña. Ni error, ni log |
| **`notificar()` devuelve si mandó algo**, y el llamador marca solo entonces | Ver arriba. Es el punto exacto donde esto se rompe |
| **La ventana del resumen acompaña a la cadencia** (7 días o 30) | Un correo mensual contando 7 días le dice «0 reseñas nuevas» a un negocio que tuvo cuatro, con la palabra «mensual» en el asunto. El cliente no tiene forma de saber que el número está mal |
| **El `select` del worker pide `prefsAlertas`** | Sin él, `tocaResumen` recibe `undefined`, todos caen al default mensual y **quien eligió semanal no lo recibe nunca**. Mismo fallo que ya tuvo `idioma` en el select de las alertas, un campo después |
| **El cron es DIARIO y decide por usuario** | Con uno semanal fijo no hay forma de servir la cadencia mensual ni el día que elija cada uno. Con dos crons separados habría dos calendarios y un usuario podría caer en los dos |
| **El calendario es de LIMA, no del servidor** | El cron dispara a las 8:00 de Lima, hora a la que las dos fechas coinciden, así que hoy da igual — pero `ejecutarAhora` se llama también a mano desde un script, y a las 20:00 de Lima el servidor ya está en el día siguiente: el mensual saldría el día 2. Es el error de las fechas de SUNAT y del agrupado por día del score, por tercera vez |
| **`periodo` viaja como VALOR** (`'semanal'`/`'mensual'`) | Interpolado ya redactado, un usuario en inglés lee «Tu resumen semanal». Misma regla que las invitaciones de equipo (§11) |
| **La ruta guarda `umbralNegativas` solo si vino válido** | Antes era `umbralNegativas === 5 ? 5 : 1`: en cuanto una cuenta GRATIS guardara cualquier preferencia —el día del resumen, un tipo de alerta— se le escribía un 1 encima y volvía a recibir un correo por reseña. Ausente = «usa el default de mi plan» |
| **El panel arranca de las preferencias YA RESUELTAS** que manda el perfil | El default del lote depende del plan, así que leer `prefsAlertas` crudo —`undefined` en una cuenta nueva— pintaría «cada reseña negativa» a quien las recibe agrupadas: el panel diría una cosa y la bandeja otra |

🔴 **`umbralNegativas: 5` CAMBIÓ DE SIGNIFICADO, y a mejor.** Antes quería decir «solo avísame de
picos de 5+ en 24 h», y esa promesa estaba **muerta**: la señal de picos por conteo no puede
dispararse nunca porque Places entrega **5 reseñas como máximo** por consulta (ver la tabla del
detector, arriba). O sea que quien marcaba esa opción en el panel **se quedaba sin ningún aviso y
sin saberlo**. Ahora un 5 significa «júntalas de a cinco», que es lo que la etiqueta daba a entender
y lo que además funciona. La etiqueta pasó de «Solo picos (5+ en 24h)» a «Agrupadas: 1 correo por
cada 5», y las dos opciones llevan una línea que explica qué hace cada una.

⚠️ **El correo agrupado tiene asunto y explicación PROPIOS** («5 reseñas nuevas necesitan tu
atención»), no reutiliza los del digest: con `periodo: 'lote'` el asunto habría salido «Tu resumen
lote de alertas», que no es una frase. Y el pie dice **por qué** llega junto, o el cliente cree que
se perdió cuatro avisos.

⚠️ **Solo se agrupa `RESENA_MUY_NEGATIVA`.** La ficha alterada y la escalación de 24 h no pasan por
`notificar()` a propósito (van por `enviarAlertaEmail` directo: ninguna preferencia debería poder
silenciar «tu local aparece cerrado en Google»), y las caídas de rating o las campañas coordinadas
son de por sí infrecuentes — agruparlas retrasaría justo el aviso que hay que dar rápido.

### 🔴 El PATCH de preferencias es un MERGE desde el 2026-09-11, y antes no

**`PATCH /api/auth/preferencias-alertas` reconstruía el objeto entero en cada llamada**, así que
**un campo que el cliente no mandaba se pisaba con su valor por defecto**. El fallo es del peor
tipo que tiene este proyecto: la petición responde 200, la pantalla dice «Preferencias guardadas»,
y lo único que cambió es un ajuste que el usuario no tocó.

🔴 **Ya estaba mordiendo, y lo destapó el cambio de correo del 09/09.** La app Android manda
`tipos`, `umbralNegativas`, `frecuencia` y `diaSemana` —los cuatro campos que existían cuando se
escribió su pantalla— y **no `resumen`**, que nació con el agrupado. Ejercitando la ruta de verdad
con el cuerpo literal de `Alertas.kt`:

| Lo que el cliente había elegido en el panel | Qué quedaba tras tocar un interruptor en la app |
|---|---|
| resumen **SEMANAL**, los **viernes** | MENSUAL, domingo |
| cinco tipos de alerta encendidos | solo el que la app mandó |
| lote **5** del plan GRATIS | 1 — un correo por reseña |

⚠️ **Lo que lo hace instructivo: `Alertas.kt` YA documentaba el filo** y mandaba el `diaSemana`
«aunque la pantalla no lo enseñe» justo para esquivarlo. O sea que el cliente llevaba un parche
para un defecto del servidor — y bastó **añadir un campo** en el servidor para que el defecto
reapareciera por el hueco que ese parche no cubría. Un parche en el cliente solo tapa los campos
que existían el día que se escribió.

- **Por eso la defensa va en el BACKEND.** Arregla de una vez a todos los clientes, incluidas las
  versiones de la app ya instaladas, que no se actualizan a voluntad.
- **El orden es siempre el mismo y está escrito una vez** (`conservar()`): gana lo que viene válido
  en el cuerpo; si no, lo guardado; y solo si nunca hubo nada, el default. Es lo único que impide
  que el **próximo** campo se cuele cayendo al default por encima de lo guardado, que es
  exactamente cómo entró este.
- **Los `tipos` se mezclan uno a uno**, no en bloque: un cliente que mande solo el interruptor que
  acaba de tocar no puede reactivar los cinco que el usuario tenía apagados.
- ⚠️ **Lo que el backend NO puede arreglar, y hay que saberlo:** la app manda `umbralNegativas`
  **siempre** (`if (umbral5) 5 else 1`), y un valor explícito es indistinguible de una elección del
  usuario. Así que una cuenta GRATIS que guarde desde el teléfono **sigue perdiendo el agrupado**.
  Y la app lo enseña mal de entrada: lee `prefsAlertas` **crudo** —donde el campo no existe— en vez
  de las preferencias **resueltas** que manda el perfil, así que muestra «cada reseña» a quien las
  recibe de a cinco. **Eso solo se arregla en la app**, y va con la etiqueta «Solo avisarme de
  picos», que desde el 09/09 ya no describe lo que hace.

`node scripts/prueba-prefs-correo.js` — **93 comprobaciones** (eran 74), casi todas sobre esos
silencios. El bloque final **levanta la ruta de verdad** con Prisma simulado, porque lo que vigila
no se ve con una regex: es qué queda **guardado** después de una petición. Usa el cuerpo **literal**
de `Alertas.kt` — si la app cambia lo que manda, esa prueba deja de representar al cliente real y
hay que actualizarla ahí.
⚠️ Y una comprobación vieja **dio rojo sin que faltara nada**: buscaba la cadena
`LOTES_VALIDOS.includes(umbralNegativas)` y el merge la escribe de otra forma. Es la trampa del
09/09 otra vez — **una sonda atada al formato acusa a quien reformatea**. Se reforzó, no se relajó.

**Comentarios sociales:**
- **`publicacionId` es lo que habilita responder.** Un comentario guardado sin él queda de
  solo lectura y la ruta devuelve 422 en vez de fingir que se puede.
- **`respondida` solo se marca si la plataforma confirmó.**
- **Un comentario ya guardado NO se actualiza** (`continue`, no `update`): pisar la fila
  borraría la respuesta que el usuario escribió y el flag de vista.
- **`null` vs `[]` del scraper significan cosas distintas:** `null` = no se pudo leer,
  `[]` = se leyó y no hay nada. El worker no debe confundir "sin permisos" con "sin comentarios".
- **Cada red comprueba lo suyo DENTRO de su rama.** TikTok exige el id del video y una
  conexión de tipo Accounts API; Instagram no necesita ninguna. Con las comprobaciones en
  común, una respuesta de Instagram recibía un *"reconecta TikTok"*.
- **`moderacionRemota` en las fuentes:** TikTok informa el estado de ocultado/fijado, Instagram
  no. Sin esa distinción el escaneo pisaría esos campos con valores que nunca comprobó.
- `guardarComentarioSocial()` está **extraído y exportado** para que webhook y barrido guarden
  por el MISMO camino, y `FUENTES_COMENTARIOS` se exporta para que las pruebas vigilen el
  contrato entre scraper y worker.

---

## 13. Funciones del producto

**Espejo — "Cómo te ven"** (`GET /api/negocios/:id/espejo`). El monitoreo pide
`reviews_sort: 'newest'`, correcto para vigilar, pero **no es lo que ve un cliente**: por
defecto Google ordena por relevancia. Probado contra una ficha real, las cinco que veía el
público eran de hace 1, 3, 4, 6 y 10 meses — el dueño llevaba meses respondiendo lo más
reciente mientras su ficha la encabezaba otra cosa. El aviso rojo de "sin responder" se
reserva a las reseñas **de 3★ o menos**: marcar un 5★ sin respuesta era ruido.

**Simulador** (`src/lib/rating.js`, `GET /api/negocios/:id/simulador`). Aritmética pura, sin
red ni base: cuántas 5★ faltan para cada meta, cuántas 1★ para caer bajo 4.5★, cuánto mueve
una sola de 1★. Va en el panel **y en el analizador gratuito del landing**, que antes, cuando
no había nada sospechoso —o sea casi siempre— dejaba ir al visitante sin motivo para registrarse.

**Progreso mensual** (`src/lib/progreso.js`, `GET /api/negocios/:id/progreso`, 2026-08-23).
Este mes contra el anterior, para el negocio y para los competidores que sigue. Sale entero de
los snapshots que ya se guardan: **cero llamadas a Google**.

🔴 **Mide reseñas ganadas, NO rating, y eso no es un atajo.** La idea original del pendiente
(§19 D) era rankear por nota. Con 49 días de datos reales delante eso no funciona: los cinco
negocios más antiguos daban 4.8→4.8, 3.9→3.9, 4.0→4.0 y 4.5→4.5. Una ficha con 1118 reseñas no
mueve su promedio en un mes. Lo que sí se movió en el mismo periodo fueron las reseñas —14, 5,
3— y además es lo único que el dueño puede empujar. El rating viaja igual, de apoyo.
- ⚠️ **`null` no es `0`.** Un periodo sin dos lecturas devuelve `null` («no lo sabemos»), no
  cero («tu mes fue plano»). Los sujetos sin medición se ordenan **al final**, no mezclados con
  los que no crecieron: son afirmaciones distintas.
- ⚠️ **Un delta de reseñas negativo se informa en negativo.** Google borra reseñas — pasó el 31
  de julio (11 → 10). Aplastarlo a 0 escondería justo el caso que importa.
- ⚠️ **Un movimiento de rating de 0.1 NO se declara mejora**: Google publica la nota redondeada
  a un decimal, así que cabe entero dentro del redondeo. El umbral es **0.2**
  (`ratingSignificativo`); por debajo el número se muestra pero la interfaz no canta victoria.
- **Responde 409 `SIN_DATOS` cuando no hay nada que contar**, en vez de una lista de ceros
  (`hayAlgoQueContar`). El panel debe **esconder** la sección ante ese 409, no pintarla vacía:
  es la regla de «lo que no podemos entregar no se muestra» aplicada a una pantalla.
- El corte mira **solo el negocio propio**: que un competidor haya crecido no es motivo para
  abrirle una pantalla de progreso a quien no tiene medición suya.
- Medido contra producción el 2026-08-23: **4 de 10 negocios con movimiento este mes**, 6 con
  los dos meses medidos, 3 competidores con 422 snapshots.
- ✅ **La UI existe desde el 2026-08-23**: una tarjeta en la pestaña **Resumen** de la ficha,
  con el número grande del mes, el del mes pasado, la frase de aceleración y el ranking contra
  los competidores. Se pide al abrir la ficha (no gasta cuota de Google) y **el 409 se traga en
  silencio**: `progresoMes` queda en `null` y la tarjeta no se renderiza.
  ⚠️ La variable de estado se llama `progresoMes` y **no `progreso`**, que ya estaba ocupado por
  el porcentaje de la barra de escaneo en esa misma página.
- `node scripts/prueba-progreso.js` — 28 comprobaciones.

**Panel accionable — score, temas y tareas** (`lib/score.js`, `lib/temas.js`,
`lib/tareas.js`, `GET /api/negocios/:id/resumen`, `GET /api/negocios/tareas`,
`components/PanelAccionable.js`, 2026-08-24). El panel contestaba bien «¿cómo estoy?» y nada
«¿qué hago?». Sale entero de datos ya guardados: **cero llamadas a Google y cero a Groq**.

🔴 **El score 0-100 ya existía, pero vivía DENTRO del componente de una sola pantalla.** O sea
que el número que el catálogo anuncia en los cuatro planes solo existía si abrías la ficha de un
negocio concreto: no podía entrar en un correo, ni en el PDF, ni en la constancia, ni compararse
con el mes pasado. La fórmula se movió **intacta** — `prueba-panel.js` replica la aritmética
original en vez de llamar a la función, porque si el número cambiara, a cada cliente le saltaría
su score de un día para otro sin que su reputación se haya movido.
- ⚠️ **De los cuatro componentes solo DOS son historizables.** `confianza` y `respuesta` salen
  de las reseñas de HOY (no se guarda cuántas estaban respondidas en marzo), así que en la serie
  se mantienen fijos. Consecuencia, y hay que decirla en vez de esconderla: **la FORMA de la
  curva es exacta** —la diferencia entre dos puntos es exactamente la de rating+volumen— y el
  **valor absoluto de un día pasado es aproximado**. Viaja en `componentesFijos` y el panel lo
  pone al pie. Historizarlo de verdad costaba una columna por snapshot y no vale ese precio.
- La serie agrupa **por día** (el último snapshot de cada uno): a 1 h de cadencia, Franquicia
  daría 720 puntos al mes y el gráfico sería ruido.
- 🔴 **Ese día se calcula con `tributario.fechaPeru()`, NO con `toISOString()`.** Perú va cinco
  horas por detrás de UTC, así que entre las 19:00 y la medianoche de Lima un negocio escaneado
  a las 18:00 y a las 21:00 salía con **dos puntos** en la curva. Es exactamente el bug que §9
  documenta para las fechas que van a SUNAT, por otro camino — y lo cazó una prueba que solo
  falla de noche, así que el caso quedó fijado a una hora concreta.

🔴 **El diccionario de temas estaba enterrado en `afiche.generator.js`.** Notoria ya sabía decir
«cuatro reseñas mencionan demora», pero solo dentro de un PDF que hay que imprimir. Ahora es
fuente única (`lib/temas.js`) y está en el panel, que es donde el dueño mira todos los días.
- **La tendencia compara PORCENTAJES, no conteos.** Un negocio que triplica sus reseñas ve subir
  todas sus quejas en número aunque en proporción haya mejorado; decirle «la demora subió de 2 a
  5» le informa de lo contrario de lo que pasó.
- El porcentaje va sobre las reseñas **con texto**, no sobre el total: una 1★ muda no puede
  mencionar nada, y meterla en el denominador hunde todos los porcentajes.
- Cada tema viaja con **dos ejemplos**: es lo que lo hace discutible («salió porque esta reseña
  dice esto») en vez de un veredicto.
- ✅ De paso se arregló un fallo de idioma: `quejaMasRepetida` devolvía **siempre** la etiqueta
  en español, así que un afiche en inglés decía *«The most repeated complaint: la demora en la
  atención»*. Es el mismo error de §11 y §12 por un tercer camino.

**Tareas:** lista ordenada por urgencia, en la ficha y en el panel de inicio. Dos reglas:
- **Toda tarea sale de un dato que ya existe.** Nada de «explora la sección de competidores»: en
  cuanto aparece relleno, la lista entera deja de leerse.
- **No llevan texto redactado**, viajan como `tipo` + `datos`. La frase la compone el panel.
- ⚠️ **No pide reseñas si hay críticas sin contestar**: primero se tapa el agujero, después se
  llena el balde. Y un comentario **sin `publicacionId`** no es tarea — la ruta de responder
  devuelve 422, así que sería mandar al usuario a un botón que no existe.

**Estrellas a soles** (`lib/impacto.js`, `GET /api/publico/impacto`). El landing citaba a Luca
(Harvard) desde siempre, pero hablando de negocios ajenos. Ahora el analizador gratuito lo dice
con los números del propio local: *«estar 0.6★ por debajo de 4.5★ equivale a entre S/900 y
S/3,200 al mes»*. ✅ Probado en vivo contra una ficha real (KFC San Miguel, 3.9★).
- 🔴 **RANGO y nunca una cifra**: el estudio da 5-9%. Un número único fingiría una precisión que
  el propio paper no tiene, y basta que un cliente lo compruebe una vez para que todo lo demás
  que diga Notoria pierda credibilidad.
- 🔴 **Solo donde el estudio aplica.** Luca midió restaurantes independientes. Un **HOTEL no
  entra**: su demanda pasa por Booking, no por Maps. Que Notoria venda a hoteles no es motivo
  para prestarles una cifra que no se midió sobre ellos. `desdeTiposGoogle()` lo decide, y ante
  la duda dice que no. Probado: `tipo=HOTEL` responde 404 `SIN_ESTIMACION`.
- 🔴 **La facturación se pregunta por RANGOS y no se guarda en ninguna parte.** Un rango basta
  para dar un intervalo; pedir la cifra exacta —y encima almacenarla— sería pedir un dato
  sensible a cambio de nada.
- La aritmética va a la vista y la fuente enlazada: una cifra de dinero que el cliente no puede
  rehacer a mano es una cifra en la que no confía.

**Diagnóstico dentro de la alerta.** El correo más frecuente del producto ahora dice si la queja
ya se venía repitiendo («6 de las últimas 10 reseñas negativas mencionan demora») y cuántas
críticas quedan sin contestar. ⚠️ **Sin diagnóstico el correo sale exactamente igual que antes**:
es una mejora del aviso, y una mejora no puede ser la razón por la que alguien no se entera de
que le cayó una reseña de 1★.

`node scripts/prueba-panel.js` — **83 comprobaciones**, casi todas sobre silencios y negativas.

**El parte para el equipo** (`lib/parteEquipo.js` + `services/parteEquipo.service.js` +
`GET /api/negocios/:id/parte-equipo`, 2026-08-24). Tres o cuatro líneas para el grupo de
WhatsApp del personal, con botón de copiar, **junto al afiche** en la pestaña «Cómo te ven» —
son hermanos: los dos hablan al equipo y los dos salen de la pantalla.

🔴 **Es lo contrario del resto de la IA del producto.** Toda herramienta de reputación usa el
modelo para redactar la **respuesta pública**, que es cosmética: le contesta al cliente que ya
se fue molesto y no le dice nada a quien provocó el motivo. Esto va hacia **adentro**, y es lo
que convierte a Notoria de vigilante de reputación en herramienta de gestión.

🔴 **Los NÚMEROS los pone el código y la IA solo los redacta.** Este texto lo lee gente que
estuvo ahí: si dice «cuatro clientes mencionaron demora» y fueron dos, quince personas lo saben
a la vez y el parte —y de rebote el producto— pierde la credibilidad en un lunes.

🔴 **Y lo que enseñó probarlo contra reseñas reales: EL PROMPT NO BASTA.** Se le prohibió
expresamente informar de ausencias y usar jerga de estrellas, y en los ocho partes generados
siguió escribiendo *«No hay elogios por nombre»* y colando *«para que sea un 5★»*. Un modelo de
20B no cumple prohibiciones de forma fiable. De ahí dos piezas que **no se pueden quitar**:
- **`sanear()`** — quita lo que se le pidió no escribir. Y lo que hay que vigilar al tocarlo no
  es que borre, sino que **NO estropee lo que estaba bien**: hay pruebas de que no toca un
  elogio real por nombre ni un parte ya limpio, y de que quitar un rango se lleva su conector
  («6 de 4-5★» → «6», no «6 de » colgando).
- **`cifrasCoherentes()`** — si algún **conteo** no cuadra con los hechos, el parte se tira
  entero y sale la plantilla. ⚠️ Solo mira conteos: que la IA recoja «esperé 45 minutos» de una
  reseña es correcto y útil; lo que no puede es contar mal a la gente.

⚠️ **La regla general que deja: para que el modelo HAGA algo, el prompt; para que NO haga algo,
código.** Un prompt es una petición; un `replace` es una garantía.

⚠️ Y el origen de la fuga de «5★» **no estaba en el prompt** sino en el mensaje de datos, que
listaba las reseñas como `- 5★: texto`. El modelo copiaba el formato de su entrada.

- **Sin Groq el parte sale igual**, redactado por `plantilla()`. Se comprobó en vivo sin
  querer: Groq devolvió 429 al repetir las pruebas y el respaldo entró solo.
- **Cachea una semana** (`Negocio.parteEquipo` / `parteEquipoFecha`): abrir la ficha cuarenta
  veces cuesta **una** llamada. Y **no descuenta de `iaUsos`** — esa cuota es para lo que el
  cliente pide a mano, no para un texto automático que no solicitó.
- **Desde IMPULSO.** Capacidad `parteEquipo` en `lib/planes.js`.
- Responde **409 `SIN_MATERIAL`** con menos de 2 reseñas en la semana, y el panel esconde la
  tarjeta: un parte que dice «no pasó nada» cada lunes enseña al equipo a ignorarlo.
- ⚠️ **Un fallo al copiar tiene mensaje propio y salida.** Decía «no pudimos escribir el parte»
  con el parte en pantalla; ahora dice que no se pudo copiar y **selecciona el texto** para que
  baste Ctrl+C. El portapapeles se niega por motivos que no dependen de nosotros.
- `node scripts/prueba-parte-equipo.js` — **66 comprobaciones**.


**Carteles QR de reseñas** (`lib/cartel.js` + `utils/cartel.generator.js` +
`GET /api/negocios/:id/cartel.pdf?formato=X` + `components/CartelResenas.js`, 2026-09-09). El papel
que el dueño imprime y pega en su local para que el cliente escanee y opine en Google. Cuatro
tamaños sobre una hoja A4: **mural** (1 por hoja), **mostrador** (A5, 2), **de mesa** (A6, 4) y
**etiquetas** (7×7 cm, 12 con líneas de corte).

🔴 **Es la única herramienta del producto que PRODUCE reseñas.** Score, temas, alertas, progreso,
espejo, parte — todo lo demás mide las que ya hay. Por eso vive en la pestaña «Pedir reseñas», va
justo debajo del enlace —antes que el QR suelto y el mensaje de WhatsApp— y a todo el ancho de la columna, y **no lleva `verificarPlan`**: cerrarla al plan gratuito le quitaría al
cliente nuevo justo lo que hace que el producto le sirva la primera semana. Sale entero de datos ya
guardados: **cero llamadas a Google y cero a Groq**.

🔴 **La maqueta es PURA y está espejada, y eso es el diseño entero.** `lib/cartel.js` no dibuja:
**compone**. Devuelve una lista de primitivas ya resueltas —posiciones, cuerpos de letra y hasta el
corte de líneas del nombre— y cada lado solo las pinta: PDFKit en el backend, SVG en la previa del
panel, que importa el **mismo archivo byte por byte** (`brand-shield-web/src/lib/cartel.js`). Así la
vista previa no es un dibujo parecido al papel: son las mismas primitivas. Si cada lado calculara su
maqueta, la previa y el papel se separarían y el cliente lo descubriría **al recoger el trabajo de la
imprenta**. `prueba-cartel.js` compara los dos textos y falla si se separan.
- Lo único que la maqueta no puede resolver sola es cuánto mide un texto, así que `medir` se recibe
  como función. La previa se dibuja en **Times New Roman** y no en la Georgia de la marca, para que
  el punto donde se corta un nombre largo sea el mismo que en el PDF.
- Se descartó enseñar el PDF en un `<iframe>`: en móvil el visor incrustado falla en silencio.

⚠️ **Los cuatro tamaños se imprimen en A4** y los chicos salen repetidos con guías de corte, en vez
de mandar un PDF de 7×7 cm que media imprenta escala mal sin avisar — y un QR reescalado con los
márgenes recortados es un QR que no lee.

**Reglas del dibujo, portadas de la app Android (`qr/Cartel.kt`) y que no hay que deshacer:**
- **Nada de logo encima del código.** Queda bonito y es el adorno que hace que una cámara de gama
  baja no lea el cartel. El fallo sería mudo: el papel se ve perfecto y nadie escanea.
- **Las estrellas son un camino de puntos, no la letra ★.** Ese error ya salió impreso una vez
  («2 reseñas de 3& o menos»): las fuentes estándar del PDF no la tienen y PDFKit dibuja un `&`.
  Todo el texto pasa por `seguro()` de `lib/winansi.js`.
- **La maqueta se coloca DESDE ABAJO** y el QR ocupa lo que sobra en medio. Es lo que impide que un
  nombre de dos líneas empuje el pie fuera del papel; el código es lo único que aguanta perder un
  centímetro sin dejar de leerse.
- **Nivel de corrección M**, el mismo del panel y de la app: los tres dibujan el mismo QR. Subir a Q
  o H agranda la trama, y más módulos en el mismo papel son módulos más chicos.

🔴 **El pie dice «Hecho con Notoria», NO «Reseñas verificadas con Notoria»**, que es lo que dice la
app Android. Notoria no verifica reseñas —las vigila, y como mucho marca comportamiento anómalo—, así
que imprimir eso en la pared de un cliente es prometerle a SU cliente algo que no hacemos. Es la
misma regla que gobierna el detector («comportamiento anómalo», nunca «esta reseña es falsa») y el
expediente. ✅ **La app ya dice lo mismo desde el 2026-09-16** (`qr/Cartel.kt`).

⚠️ **El umbral que decide si esto sirve: 0,4 mm por módulo.** Por debajo de eso la cámara de un
celular de gama baja falla a distancia de brazo, y el fallo es el peor de todos porque **parece que
el producto funciona**. Medido: mural 1,99 mm · mostrador 1,41 · de mesa 1,00 · etiqueta 0,87. El
bloque 4 de la prueba lo vigila con el nombre más largo, que es el caso que encoge el código.

⚠️ **Los módulos de cada fila se fusionan en tiradas** antes de dibujarlos. No es microoptimización:
son ~700 por pieza y 12 piezas en la hoja de etiquetas. Con la fusión el PDF pesa **5-6 KB** y se
manda por WhatsApp; sin ella serían miles de objetos. La prueba comprueba que la fusión **conserva el
área exacta**, porque perder un módulo deja el código con agujeros.

⚠️ El QR suelto sigue ahí para quien ya tiene su diseño, y ahora se descarga con **paso de módulo
entero**: con 1200 px y 45 módulos cada módulo mide un número redondo de píxeles, y un módulo de
24,32 px se amplía con los bordes sucios en el diseño de un tercero.

`node scripts/prueba-cartel.js` — **100 comprobaciones**.
**Las quejas se leen POR RUBRO desde el 2026-09-20** (`lib/temas.js`). Hasta ese día los seis
temas eran vocabulario de comida y se le aplicaban igual a todos los negocios.

🔴 **El fallo era mudo y del peor tipo.** Un tema exige 2 menciones, así que a una peluquería no
le salía ninguno: `masRepetido` devolvía `null`, el afiche perdía su línea de foco y la tarjeta
del panel no se renderizaba. **El cliente no ve un error: ve una sección vacía y concluye que en
su negocio no pasa nada.** Paga por una función que, para su rubro, está apagada sin decirlo.
Medido ese día en producción: de **8 fichas activas, 2 son PELUQUERIA y devolvían cero temas**
mientras cada restaurante devolvía al menos uno.

| | Temas |
|---|---|
| **Universales** (todos los rubros) | demora · trato · limpieza · precio |
| RESTAURANTE · CAFETERIA · BAR | + temperatura · porción |
| PELUQUERIA · SPA | + resultado · daño · cita |
| BAR | + música · ingreso · seguridad · tragos |
| HOTEL | + ruido · habitación · servicios · reserva |
| Los demás (gimnasio, tienda, taller…) | **solo los universales** — 4 honestos es mejor que 6 inútiles |

🔑 **Las palabras salieron de LEER reseñas reales de cada rubro en Google, no de inventarlas**, y
esa es la parte cara. Un diccionario escrito de memoria acierta lo obvio y pierde lo que la gente
dice de verdad: en salones la queja dominante no es «mal servicio» sino **«no quedó como pedí»**,
y en discotecas el ingreso —la cola, el cover, la lista, «no me dejaron entrar»— pesa tanto como
lo de adentro. **Al añadir un rubro, repetir el método**: leer reseñas de ≤3★ de ese rubro.

⚠️ **`temasDeRubro(null)` devuelve TODOS los temas**, que es el comportamiento anterior. Es
deliberado: un call-site que olvide pasar el rubro añade ruido en vez de producir silencio, y el
silencio es el que nadie detecta. Los **seis** call-sites lo pasan (panel, parte, servicio del
parte, afiche, diagnóstico de la alerta y correo del resumen) y lo vigila `prueba-temas.js`
leyendo el fuente — es el mismo agujero que ya tuvieron `idioma`, `prefsAlertas` y `localesExtra`.

🔴 **Y apareció un bug preexistente que llevaba ahí desde siempre: faltaba la palabra `'fría'`.**
El tema se llama «Comida fría» y su lista tenía `'frio'`, `'frío'`, `'fria'` y `'frías'` — todas
menos el singular con tilde. «La comida llegó fría» no levantaba el tema. A ojo las cuatro
variantes parecen cubrirlo todo; lo cazó **probar el diccionario contra frases reales** en vez de
leerlo.

`node scripts/prueba-temas.js` — **96 comprobaciones**.

**Afiche de la pared** (`src/utils/afiche.generator.js`, `GET /api/negocios/:id/afiche.pdf`).
Un A4 para imprimir y colgar donde trabaja el equipo: la nota a 96 pt, las reseñas nuevas, las
que faltan por responder y **una sola cosa** en la que enfocarse esta semana. Existe porque el
patrón de abandono es que el dueño entra la primera semana y a los veinte días deja de entrar,
y eso no se arregla con más notificaciones sino **saliendo de la pantalla**.
- El foco se elige por prioridad: ficha cerrada → críticas sin responder → rating bajando → la
  queja que más se repite → pocas reseñas → todo bien. **Devolver varias cosas sería devolver
  ninguna.**
- La queja sale de un **diccionario de temas** (demora, trato, temperatura, limpieza, precio,
  porción), no de la IA: tiene que ser explicable ("salió porque cuatro reseñas dicen
  'demora'") y no puede costar una llamada a Groq por afiche. Exige **2 menciones mínimo**.

**Constancia de Reputación Online** (`src/lib/constancia.js` + `utils/constancia.pdf.js` +
`GET /api/negocios/:id/constancia.pdf` + `GET /api/publico/verificar/:codigo` +
`/verificar/[codigo]`). El papel que pide un centro comercial, un franquiciante o un banco — y
crea demanda desde el otro lado: el día que un mall se la pida a un inquilino, ese inquilino
se registra.
- **No guarda nada:** los datos viajan firmados dentro del código
  (`<payload base64url>.<HMAC-SHA256 con JWT_SECRET>`, mismo mecanismo que `lib/oauthState.js`)
  y quien verifica **recalcula la firma**. Sin tabla nueva.
- ⚠️ Dos consecuencias: **no se puede revocar** una constancia emitida, solo esperar a que
  caduque (de ahí los **90 días**, que además es cuando un dato de reputación deja de
  acreditar nada); y **rotar `JWT_SECRET` invalida todas las que estén en circulación**.
- El código mide ~152 caracteres, así que **nunca se teclea**: va en un QR. Las claves del
  payload son de una letra para no engordarlo y no bajarle la tolerancia al escaneo.
- La página **distingue `VENCIDA` de firma inválida a propósito**: confundirlas sería acusar
  de fraude a alguien que solo tiene un documento viejo.
- El **alcance va en el documento Y en la página**: acredita información pública de Google
  Maps, no la calidad del servicio, ni solvencia, ni tiene valor tributario.

**Enlace de venta `/para/<slug>~<placeId>`.** La landing que se manda a **un** prospecto por
WhatsApp: abre con el nombre de SU negocio, su rating, cómo está frente a los vecinos de su
rubro, qué reseña vieja encabeza su ficha y la aritmética de su rating.
- **Es un Server Component, y no es un detalle técnico:** media efectividad está en que al
  pegar el enlace en el chat se vea una tarjeta con el nombre y la nota. Eso son etiquetas
  Open Graph y tienen que salir del servidor.
- El separador es **`~`**: los place ID llevan guiones dentro pero nunca una virgulilla. El
  slug es decorativo.
- **Tres frenos**, porque es material comercial dirigido a una persona, no una publicación
  sobre un negocio ajeno: `robots: { index:false, follow:false, nocache:true }` + `/para/` en
  Disallow · **`PARA_BLOQUEADOS`** (place IDs, **se lee en cada petición**, así que retirar una
  ficha es cambiar una variable sin desplegar → responde `410`) · aviso visible al pie con el
  origen de los datos y a qué correo escribir.
- 🔴 **El limitador estricto no puede ir con `router.use` en `publico.routes.js`:** la página
  se renderiza en el servidor de Vercel, así que **todas** las visitas llegan desde la misma IP.
  Con 15/15min el enlace se caía en cuanto se mandaba a unos pocos prospectos. Se aplica **por
  ruta**, y `/ficha` lleva el suyo (300/15min) apoyado en el caché de 6 h: mil visitas al mismo
  enlace siguen siendo **una** consulta a Google.
- 🔴 **Los vecinos salían de otro rubro.** Google devuelve los tipos **en orden alfabético**,
  así que "el primer tipo no genérico" elegía `food` para un restaurante y la comparación salía
  contra hoteles. Ahora hay lista blanca por prioridad (`TIPOS_COMPARABLES`).
- `scripts/enlaces-venta.js` es lo que lo hace usable: ordena **por prioridad, no
  alfabéticamente** (primero los de menos de 4.5★ y, dentro de esos, los de más volumen — un
  4.1 con 400 reseñas tiene el problema *y* con qué pagar la solución). Cuesta 1 llamada a
  Places por página de 20 negocios, **ninguna por negocio**: el detalle lo pide la página solo
  cuando el prospecto la abre. Los enlaces nunca salen apuntando a `localhost`.

**Widget público del hero** (`components/AnalisisGratis.js` +
`api/routes/publico.routes.js`): sin auth, rate-limit propio, máx. 4 verificaciones de país
por búsqueda, caché en memoria de 6 h por placeId, teaser con UNA muestra sospechosa recortada
(el informe completo pide registro).

**Drip de onboarding** (`workers/drip.worker.js`, cron diario 10:00 Lima): día 2 según estado
real, día 5 valor con cifras, día 7 promo solo a GRATIS sin promo usada. Ventana 30 días, solo
emails verificados, máx. 1 etapa/día, y **la etapa avanza ANTES de enviar** (un fallo de
Resend pierde ese correo, no lo duplica).

**Recordatorio de activación de cuenta** (`lib/verificacion.js` + `workers/verificacion.worker.js`,
cron diario 10:30 Lima, añadido el 2026-08-23).

🔴 **Por qué existe.** Una cuenta sin verificar no recibe **nada**: el drip filtra por
`emailVerificado: true` y las alertas necesitan un negocio conectado, que es justo lo que esa
gente no llega a hacer. El único correo que se les mandaba era el del registro, con un enlace
que caduca a las **24 h**. Si no lo abrían ese día, la cuenta quedaba muerta en silencio — sin
error, sin log, sin rebote. Foto del 2026-08-23: **4 de 11 usuarios sin verificar**, dos de
ellos del 5 de julio, y dos de esos cuatro con negocios ya cargados.

- **Cero cambios de schema.** `tokenVerificaExpira` se reescribe en cada envío del correo de
  verificación (registro, reenvío manual desde el panel y este recordatorio), siempre a
  «ahora + 24 h», así que **ya es la marca del último envío**: basta restarle esas horas.
  Ventaja que una columna propia no daría: si la persona pulsa «reenviar» en Configuración, el
  cron lo ve y no duplica. Las dos vías comparten marcador sin coordinarse.
- **Ventana en vez de contador.** Contar envíos exigiría columna. Se insiste entre el día 2 y
  el 10 de vida de la cuenta con **4 días de espaciado mínimo**, lo que se autolimita solo:
  ⚠️ **salen exactamente DOS correos, el día 4 y el día 8** — los días 2 y 3 los bloquea el
  espaciado, porque el correo del registro cuenta. `VENTANA_DIAS.desde = 2` es un suelo de
  seguridad, no el día en que sale algo.
- **Robusto ante un cron caído**: con días exactos ({2, 7}) perder una pasada significaría
  perder ese recordatorio para siempre — justo el fallo silencioso que esto viene a cerrar.
- 🔴 **El token se REGENERA en cada recordatorio**, y se guarda **antes** de enviar. El del
  registro ya caducó: reenviarlo tal cual sería mandar un enlace muerto, que es peor que no
  escribir — la persona hace clic, ve un error y concluye que el producto está roto.
- **El correo dice qué se está perdiendo**, no «confirma tu correo» otra vez: ese es el hecho
  que mueve a hacer clic una semana después. Asunto distinto al del registro (repetirlo parece
  un duplicado y se ignora) y **bilingüe**.
- ⚠️ Pasados los **10 días se deja de insistir**: escribirle a un buzón que nunca confirmó nada
  es spam, y quema el dominio del que depende la entrega de *todos* los avisos del producto.
  Las cuentas viejas que quedaron fuera se recuperan con
  **`scripts/recordar-verificacion.js`**, una pasada única y manual — no un cron.
- `node scripts/prueba-verificacion.js` — 31 comprobaciones.

---

## 14. Seguridad — hallazgos ya corregidos que no hay que reintroducir

| | Regla |
|---|---|
| **Escaneo global** | `POST /api/utils/monitoreo-manual` exige `negocioId` y comprueba pertenencia. `ejecutarAhora` **exige `{ global: true }`** para el barrido completo, para que un `undefined` que se cuele no baste. Sin eso, cualquier cuenta gratis disparaba una consulta a Places por cada ficha de la plataforma, correos a otros clientes y auto-respuestas en fichas de terceros. **Si hace falta un escaneo global, va en un script de terminal, nunca tras una sesión** |
| **Tokens al navegador** | `src/lib/negocioPublico.js` quita los 6 campos secretos y agrega booleanos derivados. Se aplica en las 5 respuestas de `negocio.routes.js` que mandan un negocio. ⚠️ Es un **denylist a propósito** (un allowlist se desincroniza en silencio al crecer el modelo y rompe el panel); a cambio, `scripts/prueba-negocio-publico.js` **falla si aparece un campo `*AccessToken`/`*RefreshToken`/`*Secret`/`*Password` que no esté en la lista**. Correrlo al agregar cualquier campo al modelo. ⚠️ **`negocioPublico` NO muta el objeto original**: en varias rutas se sigue usando después de responder |
| **Cabeceras de la web** | `headers()` en `next.config.ts`: CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS. El token de sesión vive en `localStorage` |
| **State de OAuth** | `src/lib/oauthState.js` (HMAC-SHA256 + expiración 10 min). El de Google Business además **comprueba el dueño del `negocioId`** antes de firmar, y el callback filtra por usuario |
| **Correos** | Registro, login y recuperación **normalizan** el correo. El `@unique` de Postgres distingue mayúsculas, así que quien se registraba como `Juan@` no podía recuperar su contraseña nunca; las búsquedas son insensibles a mayúsculas para no dejar fuera a las cuentas ya creadas |
| **Google Sign-In** | `/api/auth/google` comprueba `email_verified` antes de enganchar el `googleId` a una cuenta existente |
| **Borrados** | Competidores borra sus snapshots (FK RESTRICT: tras el primer ciclo del worker ninguno se podía eliminar) y el borrado de cuenta toca `pagos`, `comprobantes` y `comentarios_sociales` |
| **QR** | Se genera en el navegador con `qrcode`; antes se pedía a `api.qrserver.com`, mandándole a un tercero el enlace de cada cliente |
| **Prisma** | `detector.js` usa el singleton, no un `PrismaClient` propio |
| **HTML en los correos** | 🔴 `esc()` en `utils/emails.js`. Todo texto que **no escribimos nosotros** —el de una reseña, un comentario, una mención o una hoja del Libro de Reclamaciones— se escapa antes de entrar al HTML del correo. Sin eso, una reseña de 1★ cuyo texto fuera `<a href="https://sitio-falso">Haz clic para eliminar esta reseña</a>` se convertía en un **enlace real dentro de un correo salido del dominio de Notoria, firmado con DKIM y alineado con DMARC**: phishing contra el propio cliente con nuestra credibilidad de remitente, disparable por cualquiera capaz de escribir una reseña en su ficha. ⚠️ El escape va **en el punto donde se inserta el dato ajeno**, NO dentro de `p()`, `h1()` ni `btn()`: a esos se les pasa HTML a propósito (`<strong>`, `<code>`). Al añadir un correo que muestre texto ajeno, sumar su caso a `scripts/prueba-escape-emails.js` — lo que no está en esa lista, nadie lo vigila |
| **`trust proxy`** | `app.set('trust proxy', 1)` en `index.js`, antes de los limiters. ⚠️ **Es `1`, NO `true`**: con `true` Express confía en toda la cadena de `X-Forwarded-For` y cualquiera puede falsear su IP para saltarse el rate-limit. `1` = un proxy, que es lo que Railway pone delante. Con un CDN adicional sería 2 |

**Borrado de cuenta: ANONIMIZA cuando hay historial fiscal.** El XML firmado y el CDR se
conservan 5 años, así que un cliente no puede hacer desaparecer la contabilidad pidiendo la
baja. Si nunca pagó, se borra de verdad. Es lo que permite la Ley 29733: el derecho de
supresión cede ante una obligación legal de conservación, y lo correcto es conservar lo justo
y disociar el resto.

**Sesiones (`tokenVersion`):** el token lleva `v` y el middleware lo compara contra la
columna; se incrementa al cambiar la contraseña, restablecerla y en
`POST /api/auth/cerrar-sesiones`. Los tokens emitidos antes no llevan `v` y se tratan como 0.
🔴 **Los `jwt.sign` sueltos se unificaron en `firmarSesion`. No volver a llamar a `jwt.sign`
desde una ruta:** bastaba que un camino olvidara la versión para emitir sesiones que el corte
no puede revocar, sin que nada fallara a la vista.

**Cambiar la contraseña exige confirmar por correo.** `PATCH /api/auth/cambiar-password` **no
cambia nada**: comprueba la actual, firma el cambio y manda un enlace;
`POST /api/auth/confirmar-cambio-password` lo aplica, **sin sesión** a propósito (quien
confirma puede estar en otro dispositivo; la prueba de identidad es la firma). Antes bastaba
saber la contraseña actual —un teléfono desbloqueado un minuto— y el correo llegaba cuando ya
no se podía hacer nada.
- **No guarda nada** (`src/lib/cambioPassword.js`): el token lleva el **hash bcrypt** de la
  contraseña nueva, firmado. Ventana de **30 minutos**.
- ⚠️ **Se confirma con un BOTÓN, no al cargar**: los antivirus corporativos abren los enlaces
  para analizarlos y consumirían el enlace antes de que el dueño lo viera.
- ⚠️ **Reintentar el mismo enlace responde OK, no error**: el caso normal es alguien que
  vuelve a tocarlo en el correo, y decirle "inválido" le haría pensar que no se aplicó.
---

## 15. Reglas de producto y de contenido

🔴 **Lo que el worker no ejecuta NO entra al landing, al catálogo ni a la comparativa.** Se
retiraron por falsas: "historial 7 / 90 días / ilimitado" (no hay retención por plan),
"reportes PDF semanales" (solo existe el mensual), "panel ejecutivo multi-sede" (no hay vista
distinta; lo cierto es que Franquicia no tiene tope de negocios) y las señales de detección
que no existen. ⚠️ La limpieza se hizo primero **solo en español** y los reclamos falsos
sobrevivieron meses en inglés: **tocar los dos idiomas.**

🔴 **Y la misma regla AL REVÉS, que es la que se aplicó el 2026-09-19: lo que el worker DEJA de
ejecutar tampoco se puede seguir prometiendo.** Al pausar las cuentas gratuitas inactivas y
espaciar su escaneo a las 72 h (§8.9) hubo que decirlo en el catálogo, en la tarjeta del landing,
en una fila nueva de la comparativa y en el FAQ — en los dos idiomas **y en el JSON-LD de
`layout.js`**, que es la copia que se olvida. ⚠️ No es letra chica ni una concesión: contado
claro **vende**, porque «vigila sin pausas aunque no entres» es un motivo concreto para pagar.
Lo vigila el bloque 12 de `prueba-dormancia.js`, que es su única comprobación sobre el frontend.

### 🔴 Tercera regla de contenido: la cifra en soles NO sale de donde el estudio midió

**Decidido por el dueño el 2026-09-20.** `lib/impacto.js` traduce estrellas a soles con el
estudio de Michael Luca (Harvard, HBS 12-016), que midió **restaurantes independientes**. Hoy
`TIPOS_APLICABLES = ['RESTAURANTE', 'BAR', 'CAFETERIA']`, y **el bar se queda dentro**: es una
decisión consciente, con su justificación escrita en el propio archivo, no un descuido.

| Dónde | |
|---|---|
| Restaurante, bar y cafetería | **Sí** — el código ya lo hace y así queda |
| Hotel | **No.** Su demanda pasa por Booking, no por Maps. `tipo=HOTEL` responde 404 `SIN_ESTIMACION` |
| Discoteca (`night_club`), salón (`beauty_salon`), gimnasio, tienda, taller… | **No.** `desdeTiposGoogle()` cae a `null` ante la duda |

⚠️ **Lo que esta regla protege es el MARKETING, no el backend** —que ya está acotado—: ahora que
la marca dice «negocios locales», nada impide que una pieza use esa cifra para un salón o una
discoteca, rubros donde ese estudio no midió nada. **Ninguna pieza de campaña puede poner la
estimación en soles fuera de restaurantes, bares y cafeterías.** Es la clase de cifra que un
cliente comprueba, y basta que la encuentre falsa una vez para que deje de creerse todo lo demás
que diga Notoria — que es exactamente el motivo por el que se retiraron las cifras inventadas.

### 🔴 La detección por perfil del autor NO se hace, y es una decisión, no un pendiente

**Decidido por el dueño el 2026-09-20.** La señal más elocuente de una reseña falsa es una cuenta
recién creada con pocas reseñas, y hoy es **imposible**: las cinco fuentes escriben
`autorResenasTotal: null` porque Places no devuelve el perfil del autor. Los dos caminos eran
contratar un proveedor de datos (~US$100/mes, el primer costo variable por cliente) o declarar
que no se hace. **Se declara que no se hace.**

⚠️ **La consecuencia es de contenido y hay que respetarla:** ninguna pieza de marketing puede
prometer «detectamos cuentas falsas» ni detección por perfil del autor. Lo que Notoria sí hace
—y puede decir— es **texto duplicado entre cuentas distintas, 1★ sin comentario, palabras
críticas y ráfagas por volumen**. ✅ Comprobado el mismo día: el landing y el FAQ no lo prometen
en ninguno de los dos idiomas.
⚠️ Y el enum **`CUENTAS_NUEVAS` significa otra cosa**: hoy lo levanta el texto duplicado, y por
eso su etiqueta visible es «Campañas coordinadas». El id no se toca (está en la BD, el worker y
la app), pero nadie debe leer ese nombre como una función que existe.

🔴 **Al corregir un mensaje, la lista de sitios incluye las IMÁGENES.** Un PNG no aparece
en ningún `grep`, así que un barrido de texto lo da por limpio. Pasó dos veces: el `og-image`
seguía diciendo «Vigilio» meses después del rebrand (19/09), y **seis tarjetas de la campaña
seguían imprimiendo** frases ya retiradas de la voz de sus guiones (22/09). Se comprueban
**abriéndolas**, y eso incluye el og-image, las piezas de `marca/` y las tarjetas de
`campana/`.

🔴 **Una cifra sin URL pública que la sostenga no entra al landing.** Las que había estaban
inventadas y una era falsa por un orden de magnitud. Las vigentes, cada una con enlace visible
en su tarjeta:

| Cifra | Fuente |
|---|---|
| 292 M de reseñas bloqueadas/eliminadas por Google en 2025 + 13 M de fichas falsas | blog oficial de Google (2026) |
| 5-9% de ingresos por estrella (restaurante independiente) | M. Luca, HBS working paper 12-016 |
| 31% solo usa negocios de 4.5★ o más | BrightLocal, LCRS 2026 |

**Lo que no podemos entregar no se muestra** — sin "próximamente", que invita a preguntar por
una fecha que no tenemos.

⚠️ **El FAQ está DUPLICADO**: el visible en `page.js` y el del **JSON-LD de `layout.js`**
(que va a Google como dato estructurado). Al editar una pregunta, actualizar **ambos** — ya
pasó que el JSON-LD siguió prometiendo una detección imposible tras corregir el visible.

⚠️ **`/precios` es la única pantalla de venta y recibe tráfico desde la app Android.** Si se
le cambia la ruta se rompe `abrirPlanes()` de `Navegacion.kt`. La app **no vende** (Google Play
cobra comisión sobre suscripciones digitales compradas dentro de la app) y no duplica precios.

**RUC fuera de la vista.** La **Ley 32080** (2 de julio de 2024) eliminó la obligación de
incluir RUC y denominación social en los documentos donde se ofertan bienes o servicios,
incluidas webs y apps. El RUC es la llave de la ficha pública de SUNAT, que expone el
domicilio fiscal — en una E.I.R.L., normalmente una casa.

| Dónde | |
|---|---|
| Pie del landing, menú de la app | **Quitado** |
| Términos, Privacidad, Contacto, Devoluciones, Libro de Reclamaciones | **Se queda** (identifica al proveedor; es lo que miran Culqi e INDECOPI) |
| Comprobantes | **Se queda** (obligatorio, y van al cliente que compró) |

⚠️ La **dirección** se dejó en el pie a propósito: es justo lo que Culqi exigió ver al
observar la web. La regla está anotada en `src/lib/contacto.js` (hasta el 2026-09-16, en `PieLegal.js`).
✅ **Decidido el 2026-08-22: el domicilio fiscal se queda como está, y esto NO es un
pendiente.** La ficha RUC de SUNAT es pública y hoy es una casa particular, así que quien
busque el RUC —que sigue en Términos, Privacidad, Libro de Reclamaciones y comprobantes,
donde es obligatorio— llega a esa dirección aunque el pie de la web no la muestre. Mover el
domicilio a una oficina virtual era la única forma de evitarlo, cuesta unos S/50-150 al mes y
**el dueño decidió no hacerlo**. No hay nada roto ni ningún problema con SUNAT: es una
decisión de privacidad, no una tarea. Si algún día se reabre, §9 explica cómo cambiarlo sin
romper la facturación.

**Capturas del panel en el landing (`PanelShowcase`): LOS DATOS ESTÁN ANONIMIZADOS Y ES
OBLIGATORIO MANTENERLO ASÍ.** Salen de una cuenta real cuyo negocio monitoreado es un
restaurante que **no es cliente**, con reseñas de personas identificables. Antes de capturar
se sustituye por el negocio ficticio del landing ("Cevichería El Muelle") y los nombres y
textos por otros inventados. El procedimiento está en la cabecera del componente.
- Nitidez: el capturador devuelve 1512 px de un viewport de 1920 (ya reduce a 0.79x), así que
  se pone `document.documentElement.style.zoom = '1.3'` antes de capturar. Y el marco se
  muestra a `maxWidth: 900` — **si alguien lo ensancha, hay que rehacer las capturas**.
- `loading="lazy"` + `key` para remontar = imagen en blanco. Con 142 KB en total, carga ansiosa.
- Cada captura lleva su propio `width`/`height`, o la caja reserva el alto de la más larga.
- ⚠️ Están en **español** también con el landing en inglés (se asume; el mercado es Perú).

---

## 16. Patrones y trampas conocidas

### Código

- **Turbopack caché envenenada.** Hero vacío o recargas en bucle → borrar `.next` y reiniciar.
  🔴 **`next dev` también sirve CSS RANCIO bajo el MISMO hash de chunk**: tras editar
  `globals.css` el bundle traía las variables nuevas pero no el bloque siguiente. No falla
  siempre, y cuando falla lo hace en silencio.
- **Componentes dentro de componentes.** Si los inputs pierden el foco o los botones
  desaparecen, el componente está definido DENTRO del padre. Moverlo al nivel del módulo.
- **Groq `gpt-oss` y `reasoning_effort`.** Sin `reasoning_effort: 'low'` en el body, gastan
  todo `max_tokens` pensando y `message.content` vuelve vacío con `finish_reason: "length"`.
  Al agregar una llamada nueva con un modelo gpt-oss, incluirlo.
- **URLs de Google Maps:**
  `https://www.google.com/maps/search/?api=1&query=${nombre}&query_place_id=${placeId}` y
  `https://search.google.com/local/writereview?placeid=${placeId}`.
- 🔴 **Nunca un "cargando" global sobre una página pública.** `app/page.js` tenía
  `if (cargando) return <spinner/>` y `cargando` arranca en `true`, así que el landing servía
  **38 caracteres** de HTML: reventó la verificación de marca del OAuth de Google ("no se
  explica el propósito de la app"), el SEO y la revisión de la página de destino de Ads. Ojo
  con el diagnóstico: **`'use client'` NO impide el render en servidor** — lo impedía el
  guard. Buscar `animate-spin` en el HTML servido es lo que lo delata. Si hace falta esperar
  la sesión, que espere solo el trozo que la usa.
- 🔴 **`toFixed()` devuelve una CADENA.** `"0.00"` es truthy, así que la cabecera del negocio
  pintaba **"↓ 0" en rojo** en todo negocio con el rating estable. Comparar con `Number(...)`.
- **`var()` no sirve fuera de CSS.** `new THREE.Color('var(--accent)')` no parsea y cae a
  blanco (rompió la animación del hero). Para WebGL/canvas usar la constante `VERDE_MARCA`;
  para CSS, `C.green`.
- **PDFKit con fuentes estándar: todo texto pasa por `seguro()` de `src/lib/winansi.js`.**
  ⚠️ **WinAnsi no es latin1**: CP1252 añade en 0x80-0x9F justo los caracteres tipográficos que
  aparecen solos en español (comillas curvas, guion largo, puntos suspensivos, apóstrofo), y
  un filtro `[^\x00-\xFF]` se los comía **en silencio** — se habría comido el apóstrofo de un
  cliente llamado "Tito's". Y **nada de ★ (U+2605)**: PDFKit dibuja un `&` literal ("2 reseñas
  de 3& o menos"). Para ★ de verdad haría falta empaquetar un `.ttf` y `doc.registerFont`.
- **El panel está escrito con ~994 `style={{…}}` inline**, y un estilo inline **no puede
  declarar `:hover`, `:focus` ni `:active`**. La respuesta al cursor se resolvió desde CSS
  (capa `.panel` en `globals.css`, encendida en la raíz de `dashboard/layout.js`).
  ⚠️ El hover se pinta con un **velo** (`box-shadow: inset 0 0 0 999px`), no con
  `filter: brightness()`: brightness *aclara*, y en tema claro un botón blanco aclarado sigue
  siendo blanco. El velo es translúcido, se invierte con el tema y funciona sobre cualquier
  fondo **sin conocerlo** — que es el problema cuando el color vive inline.
  ⚠️ `!important` en el borde de los campos no es pereza: los inputs traen `border-color`
  inline, que gana a cualquier selector.
- **Un `md:hidden` no gana a un `display:'flex'` inline** (por eso la X del menú móvil se veía
  en escritorio). Mismo patrón de siempre.
- 🔴 **`.catch(console.error)` en una pantalla de monitoreo es un fallo grave.** El panel
  pintaba *"Todo tranquilo por ahora"* ante un 500, un timeout o el rate-limit: le decía al
  dueño que su reputación estaba bien **sin haberla podido consultar**. "No hay alertas" y "no
  pude consultarlas" no pueden verse igual. Estado de error explícito y botón de reintentar.
- **SVG:** en un `viewBox`, **nunca `preserveAspectRatio="none"`** si el dibujo tiene círculos
  o grosores de línea. Y un `viewBox` escala **todo, el texto incluido**: el `min-width` del
  SVG debe ser **el ancho del propio viewBox** (escala 1:1), dentro de una caja con
  `overflow-x:auto` — el scroll es de la caja, **nunca del documento**.
- **`<html lang>`:** ajustarlo dentro de `cambiarIdioma` deja fuera el caso más común (alguien
  con el navegador en inglés ve la web en inglés con el HTML declarando español). Va en un
  `useEffect` que depende de `idioma`.
- **Móvil:** las pestañas de la ficha son **una sola fila deslizable** (`nowrap` +
  `overflow-x:auto` + `flexShrink:0` en cada botón — sin eso se comprimen y el texto se parte).
  Las grillas usan `repeat(auto-fit, minmax(220px, 1fr))`.
- **Alertas de `window.alert()`**: fuera del panel, sustituidas por avisos en página. Un aviso
  de error no puede pintarse en verde.

### Entorno de desarrollo

- 🔴 **npm 11 no ejecuta los scripts de instalación por defecto.** En una máquina nueva,
  `npm install` se salta los `postinstall` y lo avisa en un `npm warn allow-scripts` perdido
  entre el ruido del final. Afecta a **`prisma`, `@prisma/client` y `@prisma/engines`** —sin
  ellos no se descargan los motores y `prisma generate` no tiene con qué trabajar— y en el web
  a **`sharp`** y **`unrs-resolver`**. No falla: deja la instalación a medias **en silencio**,
  que es la misma familia de trampa que el `copy` que calla. ✅ **Ya resuelto en el repo**: los
  dos `package.json` llevan un campo **`allowScripts`** con esos paquetes aprobados, así que un
  `npm install` limpio ya corre bien. 🔴 **No borrarlo.** ⚠️ Las aprobaciones van con la
  **versión exacta** (`prisma@5.22.0`): al subir versión, o al añadir un paquete con scripts,
  hay que reaprobar con `npm approve-scripts <pkg>`. ⚠️ **No funciona sobre instalaciones
  globales** (`EGLOBAL`): para `@railway/cli` y `vercel` hay que comprobar a mano que el binario
  responde de verdad, no solo que el mandato exista.
- **El PATH de usuario de Windows suele ser `REG_EXPAND_SZ`.** Escribirlo con
  `[Environment]::SetEnvironmentVariable` lo degrada a `REG_SZ` y congela los `%USERPROFILE%`
  que hubiera dentro. Al añadir rutas, escribir en el registro conservando el tipo.
- **El frontend no recupera sus variables con `vercel env pull`.** Las cuatro `NEXT_PUBLIC_*`
  solo existen en el entorno *Production*, y `env pull` baja *development*, que está vacío: el
  `.env.local` sale con el token OIDC y poco más. El build pasa y el panel carga porque
  `NEXT_PUBLIC_API_URL` cae a `http://localhost:3000`, pero **el login con Google y el checkout
  de Culqi quedan muertos en local** hasta ponerles valores de test a mano.

### Verificación

- 🔴 **La técnica del iframe para revisar móvil YA NO FUNCIONA sola:** con las cabeceras de
  seguridad, `X-Frame-Options: DENY` impide enmarcar la web ni en su propio origen. Y
  `resize_window` no sirve con la ventana maximizada (`innerWidth` se queda en 1920).
  **Lo que funciona:** `brand-shield-web/scripts/proxy-movil.js` (`node scripts/proxy-movil.js`
  y abrir `http://localhost:3001`), un proxy local que sirve usenotoria.app sin esas cabeceras.
  Tres detalles: (1) no basta con `frame-ancestors`, hay que **borrar la CSP entera**, porque
  `frame-src` sin `'self'` bloquea el otro sentido; (2) el documento padre puede venir **de
  caché con la CSP vieja** y su `upgrade-insecure-requests` reescribe el `http://` del iframe
  → navegar con un parámetro que rompa la caché; (3) escucha en el **3001** a propósito, que
  está en `origensPermitidos` del backend.
  ⚠️ **Comprobar siempre `innerWidth` del iframe antes de dar por buena una medición.**
- 🔴 **Si no viste el resultado de un guardado, RE-LEE el estado; no reintentes.** El panel de
  Cloudflare reinició la pestaña justo al pulsar Guardar y la captura se perdió. Volver a
  cargar la lista mostró que **la regla ya estaba creada**: reintentar habría dejado dos
  reglas para la misma dirección. Vale para cualquier formulario que cree algo —reglas DNS,
  variables, registros—: **el estado es la fuente de verdad, no el haber visto la confirmación.**
- **Para dar por buena una entrega de correo, mándate una MARCA ÚNICA y búscala.** Un asunto
  con `NOTORIA-PRUEBA-<algo>-<timestamp en base36>` se encuentra con una sola búsqueda en
  Gmail y no se confunde con nada anterior. Es lo que distinguió "la regla existe" de "el
  correo llega", que resultaron ser cosas distintas (§6, *Email Routing*).
- **`:focus` no se puede probar con el navegador automatizado**: `document.hasFocus()` es
  `false`, así que `.focus()` no lo activa y da un falso negativo.
- **El JS inyectado en la pestaña corre en un contexto AISLADO**: sobrescribir `window.fetch`
  desde ahí **no** afecta al código de la página. Para simular un fallo de red hay que tocar
  `lib/api.js` temporalmente.
- **Medir accesibilidad contando `aria-label` engaña**: `title` también da nombre accesible.
- ⚠️ `next start` sirve una build donde `NEXT_PUBLIC_*` ya está **incrustado**. Para apuntar el
  frontend local al backend de producción, `next dev` con la variable o rehacer la build.
- ⚠️ **No meter backticks dentro de un `node -e` lanzado desde bash** — se interpretan como
  sustitución de comandos y borran el contenido.
- **El emulador de Android no arranca en esta máquina**: CPU AMD sin el *Android Emulator
  hypervisor driver* (AEHD), que se instala desde Android Studio → SDK Tools.

---

## 17. Identidad de marca

- **Nombre:** Notoria · **Dominio:** usenotoria.app · **Email:** hola@usenotoria.app
- **Verde principal:** `#0B7324` · **Fondo oscuro:** `#141413` · **Superficie:** `#1A1A18` ·
  **Texto secundario:** `#B0AEA5`
- **Tipografía:** Georgia, 'Times New Roman', serif (alias `GEO`)
- **Logo:** la N asimétrica en `components/LogoNotoria.js` (forma **RELLENA**, por eso NO va en
  `components/Icons.js`, que dibuja con stroke). El asta derecha sube más y se corta en bisel
  al revés de la diagonal: **ese bisel es la identidad, no "arreglarlo"**. Originales 1024px y
  script reproducible en `Vigilio/marca/`.
- **El escudo sigue vivo donde es semántico**: "sin reseñas sospechosas", el consejo de
  protección, el escudo rojo de "sin conexión", el chip de planes y la privacidad del
  `CookieBanner`. Convertirlos en logo sería un error de significado.
- **"Dashboard" se dice "Panel de control"** en todos los strings visibles en español; el
  inglés sigue diciendo "Dashboard". Las rutas `/dashboard` NO cambiaron.
- **OG image en PNG** (`public/og-image.png`, 1200×630): WhatsApp y Facebook no renderizan
  `og:image` en SVG. Regenerar con sharp desde el SVG si cambia.
- **Blog:** contenido en **`src/lib/blog.js`** como bloques estructurados. Agregar un artículo
  = una entrada en ese array; índice, `[slug]`, metadata, JSON-LD y sitemap lo levantan solos.

---

## 18. Scripts útiles (`brand-shield/scripts/`)

| Script | Para qué |
|--------|----------|
| `dar-plan.js <email> <PLAN>` | Cambia el plan a mano. No crea `Pago` ni comprobante (la numeración es correlativa y no admite huecos). Con `GRATIS` limpia `suscripcionActiva`, `fechaVencimiento` y `periodoFacturacion`, pero **no toca `suscripcionId`**: la tarjeta guardada sigue ahí. ✅ **Su lista de planes sale de `ORDEN` desde el 2026-08-30** y ya no está escrita a mano: hasta ese día se había quedado sin `IMPULSO` y rechazaba como inválido un plan que el producto vendía desde el 24/08. Lo mismo le pasaba a `cuenta-revisor.js`. ⚠️ **NO llamarlo con `railway run`** — usa `dotenv.config()` a secas en vez de `lib-env-produccion()`, y como dotenv **no pisa** variables ya puestas, se quedaría con la `DATABASE_URL` **interna** y moriría sin alcanzar la base. Va en local |
| `escanear.js` | Fuerza un ciclo sin cooldown (`railway run --service api`) |
| `enlaces-venta.js "<búsqueda>" [--paginas N] [--csv]` | Prospección: genera enlaces `/para` ordenados por prioridad |
| `forzar-resumen-sunat.js [--aplicar]` | Manda el resumen diario de las boletas de HOY sin esperar a que el día cierre. El cron solo agrupa días cerrados, y esa regla es correcta; esto usa la costura `agruparPendientes({ incluirHoy: true })`, que el cron **nunca** usa. ⚠️ Solo es seguro si no van a entrar más boletas ese día |
| `anular-boleta.js <numero> [--aplicar]` | Anula una boleta aceptada, en un resumen con la línea en estado 3. Solo marca `ANULADO` si SUNAT aceptó. Plazo: 7 días. ⚠️ Anular no es corregir: si cambia el importe, toca nota de crédito |
| `reembolsar-cargo.js <chargeId> [--aplicar]` | Devuelve un cargo de Culqi. Avisa **antes** de qué comprobante quedaría sin anular, porque el reembolso no lo anula. El monto sale del `Pago`, no de un argumento |
| `lib-env-produccion.js` | No es un script: lo requieren los demás. Arregla la trampa de `railway run`, que da los secretos de producción pero pisa `DATABASE_URL` con el host **interno** de Postgres, inalcanzable desde fuera. Costó tiempo dos veces antes de vivir en un solo sitio |
| `prueba-anulacion-pendiente.js` | 31 comprobaciones del aviso por comprobante reembolsado y sin anular: los dos anclajes del plazo, el `floor` que no sobreestima, y sobre todo los silencios (VOUCHER, ya anulado, no aceptado) |
| `prueba-dormancia.js` | **89** comprobaciones de la pausa de cuentas gratuitas (§8.9). Casi todo son silencios, porque esta palanca **deja de hacer algo**: cuando se rompe no hay excepción, ni log, ni 500 — solo cambia a quién se escanea. Vigila que un plan de pago NUNCA se duerma (ni uno que no esté en la tabla), que el `null` de `ultimoAcceso` caiga a `creadoEn` en vez de apagar a todo el padrón, que el aviso previo sea una ventana de UN día (45 días de cron = **un** correo), que `marcarAcceso` no propague un fallo de base al login, y que los dos `select` del worker traigan los cuatro campos de los que depende la decisión — el agujero que ya tuvieron `idioma` y `prefsAlertas` en ese mismo sitio. El bloque 12 es el único que mira el frontend: comprueba que lo que el worker **deja de hacer** no se siga prometiendo en el catálogo. 🔴 Dos sondas suyas salieron mal al escribirlas: la de los `select` casaba con consultas ajenas (daba 3 y 4 donde hay 2) y «arreglar» ese rojo habría sido añadirles campos inútiles; y una primera versión abría conexión a la base de **producción** al cargar el worker, mientras su cabecera prometía no tocarla |
| `prueba-costo-places.js` | 31 comprobaciones de los frenos de costo de Places (§8.7 y §8.9). Vigila lo que no da ninguna señal al romperse: si el competidor vuelve a releerse a la cadencia del dueño, o el caché deja de reutilizar, no falla nada — solo sube la factura de Google, que no distingue de quién fue cada consulta. El bloque 8 deja escrita la aritmética para no rederivarla |
| `prueba-cartel.js` | **100** comprobaciones de los carteles QR (§13). Lo que vigila son cosas que no dan ninguna señal: que **el espejo del panel no se separe del backend** (si se separan, la vista previa deja de decir la verdad sobre lo que va a salir de la impresora), que ningún módulo del QR baje de **0,4 mm** en ninguno de los cuatro tamaños —por debajo de eso el papel se ve perfecto y **nadie escanea**—, que nada se salga del papel con el nombre más hostil que puede escribir un cliente, y que ningún texto pierda caracteres al pasar por WinAnsi. 🔴 El bloque 7 lee el TEXTO REAL del PDF, y llegar ahí costó dos trampas: los flujos van comprimidos y PDFKit parte cada palabra en trozos hex donde hay kerning — con las dos sin resolver, tres comprobaciones pasaban **por el motivo equivocado** |
| `prueba-prefs-correo.js` | **96** comprobaciones (93 hasta el 2026-09-16, cuando se le sumó el cuerpo NUEVO de `Alertas.kt` y el de la app vieja como control) de cuánto correo manda el producto (§12). Todo lo que cubre falla en silencio y en la dirección peor: el correo sale, se entrega, y lo único que está mal es cuánto o qué dice. Vigila el default mensual, que la ventana de días acompañe a la cadencia, que el calendario sea el de **Lima** y no el del servidor, que el `select` del worker traiga `prefsAlertas`, que la ruta no vuelva a escribir un `1` encima del default del plan, y —lo más importante— que **nadie marque `Alerta.notificada` a ciegas**, que es lo que pondría el contador del lote a cero en cada reseña |
| `borrar-usuario.js <email> [--aplicar]` | Borra una cuenta desde la terminal. **No reimplementa nada**: llama a `lib/borrarCuenta.js`, el mismo código que corre cuando un cliente se da de baja — el orden lo exigen media docena de FK con ON DELETE RESTRICT y una segunda copia se desincroniza el día que alguien añada una tabla, contra producción y a mitad del borrado. Exige simulacro, avisa aparte de los **snapshots** (lo único irrecuperable) y al terminar **vuelve a preguntarle a la base** si la fila sigue ahí. Con historial fiscal anonimiza en vez de borrar. ⚠️ Va en local, no con `railway run` |
| `prueba-gbp-visible.js` | **51** comprobaciones del interruptor de Google Business **y de que el producto dejó de prometerlo**. El bloque 6 lee `page.js` y `layout.js` buscando las frases retiradas; el último —añadido el 2026-08-26— lee **`onboarding/page.js` y `GBPBanner.js`**, que es donde la función seguía viva con las 44 anteriores en verde |
| `prueba-cableado.js` | **52** comprobaciones de score/temas/impacto/parte/competencia enchufados al correo, al PDF y a la constancia. Vigila los dos fallos mudos: que el `select` del semanal traiga la FECHA de la reseña (sin ella el parte sale vacío siempre) y que el correo **no** llame a Groq |
| `prueba-temas.js` | **96** comprobaciones del diccionario de quejas POR RUBRO (§13). Lo que vigila es un silencio: hasta el 2026-09-20 el vocabulario era solo de comida, así que a una peluquería no le salía ningún tema y el cliente veía una seccion vacia en vez de un error. Comprueba que cada rubro reciba lo suyo y **nadie lo ajeno** —«comida fría» en un gimnasio es una queja que no puede existir—, que los SEIS call-sites pasen el rubro, y que los workers lo traigan en su consulta. El bloque 3 usa frases REALES de salones de Lima, que es de donde salió el vocabulario. 🔴 Dos sondas suyas dieron rojo con razón al escribirlas: el «control» usaba `null`, que hoy devuelve todos los temas y no reproduce nada, y la de los `select` casaba con el select ANIDADO del usuario |
| `prueba-expediente.js` | **66** comprobaciones del expediente (I8). 15 son sobre **el límite**: lee el fuente del PDF y falla si alguna vez imprime «reseña falsa», «extorsionando» o cualquier afirmación que le corresponda a Google o a la autoridad, no a nosotros. El bloque 8, del 2026-09-20, cubre el **código verificable**: que la huella del texto sobreviva al reflow del PDF pero cambie si cambia una palabra, y sobre todo las **guardas cruzadas** — los dos documentos se firman con el mismo secreto, así que sin discriminador de tipo un expediente se verificaría como constancia y saldría un sello de «verificado» sobre campos vacíos |
| `prueba-locales.js` | **103** comprobaciones de sumar y quitar locales sobre el plan que ya se tiene (§8.8). Los bloques 1-12 son aritmética y lectura del fuente; el **13 levanta la ruta de verdad** con Prisma y Culqi simulados, que es lo único que comprueba sobre la LLAMADA REAL —y no sobre una regex— que el `update` no escribe `fechaVencimiento` y que a Culqi le llega exactamente el importe que se le anunció al cliente |
| `armar-renovacion.js <email> [--aplicar]` | Deja una cuenta lista para que el cron de renovación la cobre en su próxima pasada: pone `suscripcionActiva` y adelanta `fechaVencimiento`. 🔴 **No cobra nada** — quien cobra es el cron, solo y desatendido, que es justo lo que hay que probar: llamar al cobro a mano probaría otra cosa. Calcula el importe con `montoSuscripcion`, el MISMO de producción, para que el script y el worker no puedan discrepar. Se niega sobre cuentas que no sean del dueño y sobre una sin tarjeta guardada. ✅ Se corre EN LOCAL, al revés que `forzar-resumen-sunat.js`: solo escribe en la base, no llama a Culqi ni a SUNAT |
| `prueba-planes.js` | **109** comprobaciones de la tabla de capacidades (eran 64 cuando se escribió esta fila: la cifra envejece sola, contrastar con la salida real). Vigila lo que no da señal: que todo plan con precio se COBRE y se BAJE (olvidarlo regala el plan de por vida), que la escalera no pierda capacidades al subir, que un plan desconocido falle CERRADO, y **lee el fuente** para fallar si alguien vuelve a escribir `['NEGOCIO','FRANQUICIA']` a mano. 🔴 Desde el 2026-08-30 ese barrido incluye **`scripts/`**, y su regex reconoce las listas que empiezan por `GRATIS`: por esos dos agujeros se le habían escapado `dar-plan.js` y `cuenta-revisor.js` con 109 comprobaciones en verde. Lleva controles que la ponen en rojo a propósito, y uno que comprueba que el barrido **encuentra** los scripts — sin él, un barrido vacío daría verde sin haber leído nada. 🔴 **El bloque 15, del 2026-09-22, barre `campana/guiones/`**: ata las cadencias que los guiones afirman con número a `planes.js` y prohíbe volver a vender el resumen como semanal. Nació porque el resumen dejó de ser semanal el 09/09 y el guión 3 siguió diciendo «lunes» **once días**. ⚠️ Mira solo el **texto que sale en pantalla** —los renglones con marca de tiempo y las tarjetas—, no el archivo entero: la primera versión acusó al guión 3 por las NOTAS que citan la frase ya corregida, que es la trampa del 09/09 por quinta vez |
| `prueba-parte-equipo.js` | 66 comprobaciones del parte semanal para el equipo. Casi todas sobre lo que el prompt NO consigue: que el saneador quite las frases que el modelo escribe pese a prohibírselo **sin estropear las que estaban bien**, y que un conteo que no cuadre con los hechos tire el parte entero. Incluye una prueba de que el fuente no tiene bytes de control invisibles — un `` mal escapado escribió un `0x08` dentro de una regex y la dejó sin casar nunca, en silencio |
| `prueba-panel.js` | 83 comprobaciones de score, temas, tareas e impacto. Comprueba que la fórmula del score NO cambió al mudarse al backend (replica la aritmética original), que la tendencia de temas compara porcentajes y no conteos, y que no se inventa una cifra en soles donde el estudio no aplica |
| `embudo.js` | Foto de solo lectura del embudo, de registro a suscripción viva. Con 11 usuarios no hace falta analítica de producto: hace falta una consulta. Nombra las cuentas atascadas y **avisa de que una «suscripción viva» sin cobro es un plan dado a mano, no un cliente** |
| `respaldo.js [--verificar <ruta>]` | Copia de la base a JSON, y su verificación. 🔴 Los 1839 snapshots desde julio son lo único que no se puede volver a conseguir —Google enseña la foto de hoy, no la película—; todo lo demás tiene copia en otro sitio. `--verificar` existe porque **tener copia no es saber restaurarla**. ⚠️ El archivo lleva datos personales de terceros (Ley 29733): está en `.gitignore` y no se sube a ningún sitio sin cifrar |
| `sonda-sunat-produccion.js` | 🔴 **Correr ANTES de cualquier cobro real.** Comprueba contra el endpoint de PRODUCCIÓN que el certificado se descifra y que las credenciales SOL autentican, con `getStatus` sobre un ticket inventado: es solo lectura, no numera ni consume nada. Lleva control con clave falsa. ⚠️ El ticket debe ser **numérico** (`AAAAMMDD`+correlativo): con uno alfanumérico SUNAT devuelve 200 con el cuerpo VACÍO y la sonda parece rota cuando el mal formado es el dato |
| `verificar-culqi-live.js` | Prueba llaves **live sin cobrar**: espacios/BOM, mismo entorno, que la secreta autentique, que la pública siga viva (401 = llave mala, **400 = llave buena** rechazando la tarjeta) y que el **bundle desplegado** traiga esa misma llave — lo único que detecta un `vercel env add` sin `vercel --prod` |
| `auditar-pagos.js` | Foto de solo lectura de los cobros |
| `limpiar-pagos-prueba.js <email> [--aplicar]` | Deja una cuenta como si nunca hubiera pagado: borra pagos y comprobantes, **retrocede el correlativo**, libera las tarjetas que gastaron la promo. **Se niega a tocar cargos que no sean `chr_test_`** |
| `prueba-culqi.js` | Circuito de cobro contra la API real con llaves de test. Verifica los campos **llamando a `culqi.datosTarjeta()`**, el mismo código que corre en producción. Se niega con `sk_live_` |
| `prueba-promo.js` | 5 casos de la promo con Culqi y Prisma simulados, incluido el de abuso. No cobra ni gasta numeración |
| `set-culqi-keys.js <pk_test> <sk_test>` | Escribe las llaves de test en los dos `.env`. Rechaza `live` y detecta si se pasaron al revés |
| `reclamaciones.js [todas\|ver <n>\|responder <n>]` | Libro de Reclamaciones por terminal |
| `prueba-negocio-publico.js` | 10 pruebas del saneador de tokens. **Correr al agregar cualquier campo al modelo `Negocio`** |
| `prueba-equipo.js` | 48 comprobaciones de roles, asientos, corte por bajada de plan y alcance |
| `cargar-secreto.sh <VAR> [largo]` | Carga un secreto en Railway pidiéndolo por teclado: no pasa por la línea de comandos ni queda en el historial. Limpia BOM, saltos y espacios, y **se niega a cargar** si quedan caracteres no imprimibles o si no mide lo esperado. Nació porque copiar el comando desde un chat arrastró un `U+0096` invisible y bash respondió `$'Âprintf': command not found` |
| `verificar-meta-secret.js` | Comprueba los secretos de Meta **contra la Graph API**, sin imprimirlos. Que la variable esté puesta y mida 32 caracteres no prueba nada: un secreto rotado en el panel y no recargado aquí tiene la misma pinta que uno correcto |
| `ensayo-alertas.js [--aplicar] [--negocio <id>] [--conservar]` | **Ensayo EN VIVO** de la cadena de alertas: llama a la `alertarResenaNegativa` real con un caso positivo y **tres controles de silencio**, y borra las alertas que creó. 🔴 Se niega a correr sobre un negocio que no sea de una cuenta del dueño: manda correo de verdad. ⚠️ `railway run` NO sirve (inyecta la URL **interna** de Postgres, inalcanzable desde fuera) — correr en local con `FRONTEND_URL=https://usenotoria.app` |
| `recordar-verificacion.js [--aplicar]` | Pasada **única y manual**: manda el enlace de activación a las cuentas que quedaron sin verificar antes de que existiera el cron (las que caen fuera de su ventana de 10 días). Respeta el espaciado, así que correrlo dos veces no duplica |
| `prueba-verificacion.js` | 31 comprobaciones del recordatorio: ventana, espaciado, el marcador derivado de `tokenVerificaExpira` y que el token se guarde antes de enviarse |
| `prueba-ficha-compartida.js` | 12 comprobaciones del caché de fichas por ciclo. Vigila las dos reglas invisibles: que una respuesta sin Contact Data no se le sirva a quien lo paga, y que un fallo no se cachee |
| `prueba-progreso.js` | 28 comprobaciones de la comparación mensual: `null` distinto de 0, deltas negativos y el umbral de 0.2 del rating |
| `prueba-alertas-resena.js` | **34** comprobaciones del aviso por reseña negativa. El bloque 7 barre **los 13 archivos del panel** y falla si alguno pinta `{a.descripcion}` en crudo — esa columna es el respaldo en español, no el texto de la interfaz. Lo que vigila son las **condiciones de silencio** (primer barrido, antigüedad, umbral, que pase por `notificar()`): si una se rompe, no falla nada — simplemente se deja de avisar |
| `ensayo-detector.js [--aplicar]` | **Ensayo EN VIVO de las seis señales del detector.** Las cuatro que salen de `detectarAnomalias` van en **solo lectura** —esa función devuelve las alertas, no las escribe—, así que se ejercitan contra los snapshots reales pasándole unos `datosNuevos` inventados. Las que escriben (campaña coordinada, pico por conteo y ficha alterada) van tras `--aplicar` y se limpian. Cada señal con su control negativo |
| `prueba-facebook.js` | 40 comprobaciones de Facebook Reviews: la recomendación sin estrella, el interruptor, el permiso del OAuth y que el worker avise de las negativas. ⚠️ Cubre la forma **documentada** de la respuesta, no que Meta la devuelva |
| `prueba-correos-idioma.js` | 24 comprobaciones del idioma de los correos. Obliga a clasificar cada correo nuevo como bilingüe o solo-español, verifica las **dos mitades** (plantilla y `select` del worker) y renderiza el resumen semanal en los dos idiomas para comparar la salida real |
| `prueba-escape-emails.js` | 11 comprobaciones de que el texto ajeno no inyecta HTML en los correos, incluidas las que verifican que escapar **no estropee el texto normal** (★, el apóstrofo de un cliente llamado "Tito's", el ampersand) |
| `prueba-instagram-visible.js` | 12 comprobaciones del interruptor de Instagram |
| `prueba-instagram-comentarios.js` · `prueba-instagram-webhook.js` · `prueba-instagram-menciones.js` | Comentarios (37, incluida la paginación), webhook (33+) y menciones (23), con axios interceptado |
| `prueba-tiktok-business.js` · `prueba-tiktok-comentarios.js` | Circuito de TikTok con `axios.request` sustituido |
| `sonda-tiktok-business.js` | Valida credenciales sin autorizar nada, imprime la URL de consentimiento, canja el código y vuelca los endpoints |
| `diagnostico-tiktok.js` | Dice en qué paso se traba la conexión |
| `prueba-drip.js` · `prueba-publico.js` (⚠️ gasta ~6 llamadas reales de Places) | |
| `cuenta-revisor.js` | Cuenta de prueba del revisor de Meta |
| `verificar-webhook-culqi.js` | Comprueba nuestro lado del webhook |
| `marca/generar-logos.py` | Regenera los PNG del logo a 1024px |
| `prueba-salud-places.js` | **42** comprobaciones de que un rechazo de Google **se vea** (📌 2026-09-23). Levanta el scraper REAL con axios simulado devolviendo `REQUEST_DENIED` con HTTP 200 —que es como Google corta— y comprueba que se registra y se loguea; que `NOT_FOUND`/`ZERO_RESULTS` NO cuenten como rechazo (si contaran, el monitor gritaría con cada búsqueda sin resultados); que «0 snapshots» con todo pausado sea `ok` y no alarma; y lee el fuente —sin comentarios, con sus controles— para que ningún `return null` vuelva a tirar el motivo |
| `monitor-uptime/prueba-monitor.mjs` | **27** comprobaciones de la máquina de estados del monitor, con el Worker REAL (su `fetch` exportado), un `fetch` global falso y un KV en memoria. Lo caro: que una caída **nueva** se avise aunque otra sonda ya estuviera caída (con el estado booleano de antes era silencio — se comprobó reintroduciéndolo: 0 correos), que lo que sigue caído calle, y que el estado viejo `{caido,desde}` no mande correos fantasma ni se trague una recuperación |
| `marca/hacer-tarjeta.js <salida.png> "línea 1" "línea 2" [--cierre]` | Las tarjetas 1080x1920 que cierran cada video de campaña. 🔴 **Sustituye a `hacer-tarjeta.py`, que NO corre en esta PC**: no hay Python, usaba `fc-match` (fontconfig, inexistente en Windows) y cargaba el logo de una ruta de la máquina anterior — el mismo hueco mudo que el JDK. ⚠️ Cambia la tipografía a Georgia, que es la de la marca y la que las tarjetas **nunca** usaron, así que una regenerada no casa con una vieja: **las dos de un video o ninguna**. El ancho de cada renglón se MIDE rasterizando y recortando, no se estima |

🔴 **Método que salvó varias integraciones: no escribir el cliente de una API antes de tener
credenciales.** `obtenerComentariosTikTok` se escribió a ciegas contra un endpoint
inexistente, pasó las pruebas con mocks y aparentó funcionar durante meses. Y el script de
prueba debe llamar **al mismo código que producción**, no a una copia que relea los campos por
su cuenta.

🔴 **Un verificador sin llamada de CONTROL miente, y manda a arreglar lo que estaba bien.**
`verificar-meta-secret.js` daba «Meta lo RECHAZA» para `META_IG_APP_SECRET`. Era falso:
repitiendo la consulta con un secreto **inventado**, Meta devolvía el mismo error 101 — o sea
que ese flujo ni siquiera llega a mirar el secreto. Sin ese contraste, el veredicto habría
llevado a rotar una credencial sana, y esa sí habría roto los webhooks de Instagram. Es el
mismo patrón que el «404 de control» de §5: **ante un fallo, preguntar primero si el método
distingue**. Cuando no distingue, el resultado correcto es «no concluyente», nunca «rechazado».

🔍 **Para saber si un endpoint existe, golpearlo sin token y leer el error:** un 404 en HTML es
del balanceador (la ruta no existe); un código de error en JSON es la API contestando (existe
y rechaza otra cosa). Así se descartaron rutas enteras de TikTok sin credenciales.

---

### 📌 2026-08-30 — el día que se destrabó Google, y tres cosas que iban rotas en silencio

Se empezó preguntando «¿queda algún pendiente?» y acabó con **la solicitud de GBP enviada por
tercera vez, esta vez cumpliendo el requisito que faltaba**. Lo que sigue es el resumen; cada
cosa está desarrollada en su sección.

**Lo grande: Google.** Las dos solicitudes anteriores (16/08 y 29/08) **probablemente nunca fueron
admisibles**. Falta*ba* la **Organization account**, que Google exige por escrito a todo tercero
—*«Every 3P / partner … must have an Organization account»*— y que es el **paso 4** de sus
prerrequisitos, justo antes de pedir el acceso. Notoria se presentaba (con razón) como 3P y no la
tenía. Está creada, y la solicitud salió con su ID dentro. Detalle en §19 A y procedimiento en
**`docs/acceso-gbp-organization.md`**.

| | |
|---|---|
| Organization account | **Notoria** · ID **`5269452463`** · cuenta `agencia@usenotoria.app` |
| Solicitud | caso **`6-5952000041022`**, 7-10 días hábiles |


### 🔴 RESUELTO el 2026-09-08 — Google CONTESTÓ, y el motivo son los 60 días

Llegaron **dos correos** de `googlebusinessprofile-support@google.com` el 8 de septiembre, a las
04:22 y 04:24, uno por cada una de las dos primeras solicitudes. Texto idéntico en los dos:

> *«At this time, we are unable to proceed with your application for Basic API Access because the
> eligibility criteria have not been fully met. Specifically, the email address used to submit the
> application must belong to an Owner or Manager of a business listing that **has been verified for
> at least 60 days**.»*

| Caso | Enviada | Contestada | Buzón |
|---|---|---|---|
| `3-5553000040900` | 2026-08-16 | 2026-09-08 04:24 — **23 días** | `didierprincipe@` |
| `0-4623000041642` | 2026-08-29 | 2026-09-08 04:22 — **10 días** | `usenotoria@` |
| `6-5952000041022` | 2026-08-30 | **sin respuesta todavía** | — |

🔴 **La frase accionable, y es literal: «please submit a new allowlist request on or after 16th
October».** Es lo único con fecha que ha salido de este hilo en un mes.

🔴 **Y de rebote FECHA la verificación del perfil, que este archivo daba por imposible de
averiguar.** Si Google pide esperar al 16 de octubre y el requisito son 60 días, el perfil se
verificó alrededor del **17 de agosto de 2026**. Encaja con todo lo observado: la primera
solicitud salió el **16/08, el día antes** de que el perfil cumpliera un solo día como verificado,
y la segunda doce días después. **Las tres eran prematuras**, y ninguna podía aprobarse.

### Lo que este correo corrige de lo que estaba escrito acá

| Lo que decía este archivo | Lo que dice el correo |
|---|---|
| «tres envíos y tres silencios»; se llegó a suponer que el asistente no manda acuse nunca | **Google sí contesta**, solo que tarda entre 10 y 23 días. No hay acuse automático ni panel de seguimiento: llega la resolución y ya. Mirar a los dos días no dice nada |
| La **Organization account** era el prerrequisito que faltaba (30/08) | **El rechazo no la menciona.** No era el bloqueo. Se deja creada —sigue siendo requisito documentado para un 3P— pero no es lo que tumbaba las solicitudes |
| Los 60 días eran «la única hipótesis viva, y no accionable porque no se puede fechar» | Era **la correcta**, y ahora está fechada |

⚠️ **La lección de método, que es la de siempre por un camino nuevo:** de las dos hipótesis vivas,
la cierta era la que **no se podía comprobar desde ninguna interfaz**, y la que se persiguió a
fondo —la Organization account, con su cuenta nueva y su procedimiento escrito— era la que sí se
dejaba mirar. Se trabajó sobre la observable, no sobre la más probable. **Que una causa no se
pueda medir no la descarta: la deja sin medir.**

### 🔴 El segundo requisito, que hoy está INCUMPLIDO y no estaba en ninguna lista

El correo repite una condición que no aparece en ninguna de las comprobaciones del 27 ni del 30:

> *«the website URL submitted in your application must be an **exact match** to the URL displayed
> on your Google Business Profile»*

- En la solicitud se puso **`https://usenotoria.app`** (§19 A, tabla de campos).
- En la ficha figura **`https://usenotoria.app/`**, con barra final (comprobado el 27/08).

**No son la misma cadena.** No hay forma de saber si Google compara así de literal, pero el correo
dice «exact match» y corregirlo cuesta cero: al reenviar, **copiar la URL tal como la muestra el
perfil**, con su barra. Es el mismo fallo mudo que persigue el resto del archivo — nada falla,
simplemente no aprueban y el motivo no se ve.

📅 **Qué hacer, y cuándo: nada hasta el 16 de octubre de 2026.** Ese día —y no antes— comprobar
que el perfil sigue verificado, copiar la URL exacta de la ficha, y reenviar el formulario
(`support.google.com/business/workflow/16726127`) desde `usenotoria@gmail.com`, que es Propietario
principal. Reenviar antes es pedir el mismo rechazo por cuarta vez.
⚠️ **Lo envía el dueño**: es una acción hacia fuera.
### 📅 Revisión del 2026-08-31 — sin acuse por TERCERA vez, y la cuota sigue en 0

> ⚠️ **Superado por el correo del 2026-09-08** (arriba). Se conserva porque la conclusión que saca
> —«tres silencios, así que algo va mal»— resultó **falsa**: Google contestó a los 10 y a los 23
> días. La lección es que **el plazo real de este formulario no es el que declara la pantalla**, y
> que mirar el buzón al día siguiente no distingue nada.

Comprobadas las dos puntas el día siguiente al envío, que es cuando el acuse ya debería estar
(la documentación promete uno automático «within the hour»):

| Qué se buscó en `usenotoria@gmail.com` | Resultado |
|---|---|
| `in:anywhere 6-5952000041022` | **0** |
| `in:anywhere 0-4623000041642` | **0** |
| `from:businessprofile-noreply@google.com` | **1**, y es el de la organización — no un acuse |
| Carpeta **Spam** entera (109 mensajes, hasta el 18/08) | ningún correo de acceso a la API |
| Cuota `Requests per minute` en las GBP APIs | **0** |

⚠️ **El control de la cuota, que es lo que hace que ese 0 signifique algo:** las otras dos cuotas
de Business Information siguen con valores (Create Location 100, SearchGoogleLocation 200), así
que es lectura real y no una página a medio cargar. Es la trampa de siempre.

🔴 **Se comprobó además la ruta `agencia@`, y esto cierra una duda razonable:** que la solicitud
saliera de la cuenta de la organización no significa que el acuse vaya a un buzón distinto.
`agencia@usenotoria.app` es una **regla de reenvío** hacia `didierprincipe@gmail.com`, que es la
dirección alterna de la misma cuenta de Google. Buscar `in:anywhere to:agencia@usenotoria.app`
devuelve **4 correos** —el de Business Profile, el código de verificación, la alerta de seguridad
y la marca de prueba del 30/08—, o sea que **la ruta entrega y el buzón mirado es el correcto**.
No hay un segundo buzón donde mirar.

⚠️ **Esto todavía no significa que la solicitud vaya mal**: es el día 1 de un plazo de 7-10 días
hábiles. Lo que sí es dato es que **son tres envíos y tres silencios**, y la hipótesis del spam
—única explicación que quedaba— se debilita: hoy la carpeta está entera y no hay nada. Volver a
mirar alrededor del **11 de septiembre**; antes de esa fecha, mirar no dice nada.
| Casos anteriores | `3-5553000040900` (16/08) y `0-4623000041642` (29/08), los dos sin acuse |

🔴 **Y de camino aparecieron DOS fallos de correo que llevaban tiempo perdiendo mensajes**, los dos
del mismo tipo —el que este archivo lleva documentando desde el 19/08: aceptar y descartar se ve
igual que entregar—:
- **`didier@usenotoria.app` no tenía regla de Email Routing**, pese a que §6 afirmaba lo contrario.
  Nueve intentos fallidos de Google en 24 h. Ahí van contabilidad, reclamaciones, el aviso de
  anular comprobantes y los informes DMARC.
- **`agencia@usenotoria.app` ya existía, en `Drop`.** Se iba a usar para la cuenta de Google: el
  código de verificación se habría descartado en silencio y el bloqueo habría parecido cosa de
  Google.

🔴 **Y una hipótesis nueva sobre los acuses que nunca aparecieron: iban a SPAM.** Un correo de
`businessprofile-noreply@google.com` aterrizó ahí dos minutos después del envío, con el motivo
textual de Gmail: *«similar a mensajes que se identificaron como spam en el pasado»*. Si pasó lo
mismo con los dos acuses anteriores y Gmail vació la carpeta a los 30 días, hoy **no quedaría
rastro ni con `in:anywhere`** — que es justo lo que se observó. Marcado como «no es spam».

**Lo demás: tres cosas que fallaban sin producir ninguna señal.**

| Qué | Por qué no lo veía nadie |
|---|---|
| `dar-plan.js` y `cuenta-revisor.js` **rechazaban IMPULSO** desde el 24/08 | Tenían su propia copia de la lista de planes. Es el fallo que §8.6 existe para impedir |
| El **alta tiraba los días ya pagados** al cambiar de periodo | `fechaVencimiento = new Date()` a secas, mientras el cron de renovación ya usaba el máximo con el vencimiento. La misma regla en un sitio y no en el otro |
| `maximoExtra` devolvía **49 para un plan que no vende locales** | Dos funciones contestando distinto a la misma pregunta, y ese número viaja al panel |

🔴 **La lección del día, y es la de siempre por un camino nuevo: `prueba-planes.js` estaba en verde
con 109 comprobaciones mientras el bug de los scripts vivía en producción.** Tenía **dos** agujeros
y por los dos se le escapaba lo mismo: solo barría `src/`, y su regex exigía que el primer elemento
fuese un plan de pago, así que una lista que empieza por `'GRATIS'` pasaba limpia **incluso dentro
de `src/`**. Es el mismo patrón que `prueba-gbp-visible.js` el 26/08 con sus 44 en verde mirando
los archivos equivocados. **Una prueba que no se comprueba a sí misma acaba certificando lo que no
mira.** Los tres arreglos se verificaron **poniendo la sonda en rojo** antes de darla por buena.

⚠️ **Y un tropiezo propio que conviene tener escrito, porque casi cuela:** al «limpiar» un check de
`prueba-planes.js` se rompió la sintaxis del archivo, y el `exit 1` que salió después se leyó al
principio como «la sonda caza el bug». No lo cazaba: fallaba al parsear. **Un rojo tampoco vale sin
preguntar de dónde viene.**

**Suites al cerrar:** `prueba-planes` **122**, `prueba-locales` **111**, y en verde también panel,
equipo, comprobantes, emisor, expediente, alertas, correos-idioma y gbp-visible. Build del frontend
compila.
⚠️ El worktree llegó **sin `node_modules`**, y eso hace que `prueba-locales.js` reviente en su
bloque 13 con `Cannot find module 'express'` — un fallo que se lee como un bug del código y es del
entorno. `npm install` antes de dar por mala una suite.



### 📌 2026-09-09 — Google contestó, y el producto estrena su primera herramienta de VENTA

El día empezó preguntando por los pendientes y acabó con **tres cosas desplegadas** y una
respuesta que llevaba un mes esperándose. Cada una está desarrollada en su sección; esto es el
resumen.

**Lo grande: Google contestó.** Las tres solicitudes de acceso a las GBP APIs están rechazadas y
el motivo son **los 60 días de antigüedad del perfil**, con fecha para reintentar: **16 de octubre
de 2026**. Detalle en §19 A → «RESUELTO el 2026-09-08». De rebote quedó fechada la verificación
del perfil (~17/08/2026), que este archivo daba por imposible de averiguar, y apareció un segundo
requisito incumplido: la URL de la solicitud tiene que ser **exactamente** la de la ficha, con su
barra final.

**Lo nuevo: los carteles QR** (§13). El QR de reseñas existía desde siempre en el panel, pero
suelto — el dueño tenía que maquetarse el papel. Ahora hay cuatro tamaños listos para imprimir,
del mural de la puerta a las etiquetas de la cuenta, con el nombre de su negocio dentro. Es la
**única herramienta del producto que produce reseñas**; todo lo demás mide las que ya hay. Nació
de una necesidad real: el dueño fue a instalarle Notoria al salón de un familiar y necesitaba el
papel ese mismo día.

**Lo que se apagó: el correo** (§12). El resumen por negocio salía **todos los domingos para todo
el mundo**, sin preferencia que lo gobernara, y el aviso por reseña negativa salía uno por reseña.
Ahora el resumen es **mensual por defecto** y configurable, y el plan gratuito recibe **un correo
por cada cinco** reseñas. La razón no es estética: una bandeja saturada acaba en «marcar como
spam», y con el dominio quemado se degrada la entrega de **todo** lo demás, avisos críticos
incluidos.

**Y una cuenta borrada:** `dhazzez15@gmail.com` (sin verificar desde el 17/08, 2 negocios, 26
snapshots, sin historial fiscal). Con respaldo previo y comprobando contra la base que la fila ya
no está — «se ejecutó sin error» y «ya no está» son cosas distintas.

| | |
|---|---|
| Suites | **38 en verde**, 0 fallos. `prueba-cartel` **100**, `prueba-prefs-correo` **74**, `prueba-planes` **124**, `prueba-locales` **111** |
| Respaldo | `respaldos/notoria-2026-09-09T13-11-14.json` — 2242 filas, 0.77 MB, verificado con 0 filas perdidas |
| Backend | desplegado y **comprobado por un cambio observable en los logs**, no por el «SUCCESS» |
| Frontend | desplegado y comprobado bajando **el chunk desde producción**, con su control |

### 🔴 Tres regresiones que cazaron las suites el mismo día, y las tres dejan la misma lección

Ninguna se habría visto abriendo el navegador: las tres van de código que sigue funcionando
mientras deja de hacer lo que promete.

| Quién la cazó | Qué |
|---|---|
| **`prueba-planes.js`** | Escribí una tabla `LOTE_POR_PLAN` con un valor por plan dentro de `lib/prefsCorreo.js`. Es exactamente lo que ese barrido existe para impedir (§8.6) y la cazó el mismo día en que se escribió. El valor se movió a `lib/planes.js` como `loteAvisoResenas` |
| **`prueba-alertas-resena.js`** | Su doble de `notificar()` devolvía `undefined`, y el `notificar()` de verdad ahora devuelve **si salió correo**. O sea que la suite se habría quedado probando un comportamiento que producción no tiene |
| **`prueba-correos-idioma.js`** | Su sonda del `select` exigía que todo cupiera en **una sola línea**. Al partirlo en varias —para añadir `prefsAlertas`— dio rojo sin que faltara nada |

⚠️ **La lección de las dos últimas: una sonda que depende del formato acusa a quien reformatea, y
un doble que no respeta el contrato real prueba otra cosa.** Las dos se arreglaron reforzando la
sonda, no relajándola — la del idioma ahora exige además `prefsAlertas`, que es el campo nuevo del
que depende la cadencia del resumen.

🔴 **Y un patrón que apareció CUATRO veces en un día: la sonda que no distingue código de
comentario.** Pasó con `prueba-planes.js` (acusaba al comentario que documentaba el arreglo de la
tabla), con `prueba-prefs-correo.js` (buscaba la etiqueta vieja en todo el archivo y casaba con mi
propio comentario) y dos veces al extraer texto de un PDF (ver más abajo). **Ante un rojo,
preguntar de dónde viene antes de arreglar el código** — igual que ante un verde se pregunta si la
sonda sabe fallar. Los dos barridos de fuente pasan ahora por `sinComentarios()`, que además
aprendió a quitar bloques de comentario, y llevan control de que **siguen cazando el patrón de
verdad**.

### 🔴 Leer el texto de un PDF que emite este backend: dos capas de trampa

Se cuenta porque volverá a hacer falta el día que alguien quiera comprobar qué dice un comprobante,
un afiche o una constancia, y las dos capas hacen que una comprobación mal escrita **pase por el
motivo equivocado**:

1. **Los flujos van comprimidos** (Flate). Buscar el texto en el buffer crudo da cero. La primera
   versión de `prueba-cartel.js` lo hacía y «el nombre del negocio aparece en el PDF» pasaba en
   verde: lo encontraba en el **título del documento**, que va en claro en el diccionario de
   información. O sea que la comprobación no podía fallar aunque el cartel saliera en blanco.
2. **PDFKit escribe el texto como cadenas HEX con el operador `TJ`, y lo PARTE donde hay
   kerning.** Un `[<54> 92 <6f6d61...> 0] TJ` es «Toma 30 segundos» con la T separada del resto.
   Así que incluso descomprimido, buscar la frase da cero **con la frase perfectamente impresa** —
   y por eso «el cartel en inglés no deja frases en español» también pasaba por el motivo
   equivocado.

La receta que funciona: inflar cada flujo, y por cada `TJ` juntar **solo** sus trozos hex y tirar
los números del kerning. Está escrita en `prueba-cartel.js` con su control («el extractor
reconstruye texto real»), que es lo único que hace que los verdes de ese bloque signifiquen algo.

### Tres huecos de la mudanza de PC que aparecieron hoy

Ninguno es un fallo del producto: son cosas que la máquina nueva no traía y que **no fallan hasta
que se necesitan** (§2 y `docs/mudanza-de-pc.md`).

| Qué faltaba | Cómo se notó | Estado |
|---|---|---|
| **`scripts/sunat-test.p12`** | `prueba-sunat-beta`, `prueba-xml-firma`, `prueba-cola-envio` y `prueba-resumen-cola` fallaban con ENOENT o con fallas de firma. **Cuatro suites en rojo por un archivo que se regenera en un segundo**, y las dos últimas ni mencionaban el certificado | ✅ `node scripts/generar-cert-prueba.js`. Sigue en `.gitignore`, que es correcto |
| **Clave SSH para `railway ssh`** | *«No SSH keys found in your SSH agent or ~/.ssh/»*. Y `railway ssh` es **el método de verificación que este archivo recomienda** en media docena de sitios | ⚠️ **A medias, y conviene saber hasta dónde llega** — ver abajo |
| ~~`next build` no funciona en esta PC~~ | Lo afirmaba §19 desde el 31/08 | ✅ **Ya no se reproduce**: termina con exit 0, prerender incluido, 36 páginas. La nota se corrigió |

### `railway ssh` en la PC del taller: la clave ya está, y aun así NO funciona (2026-09-11)

Se resolvió la mitad que el hueco de arriba describía y apareció la otra. Queda escrito para que
nadie repita los tres intentos:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "notoria-taller"
railway ssh keys add     # → «SSH key 'notoria-taller' registered successfully!»
```

🔴 **Y aun así `railway ssh` responde `Host key verification failed`.** El `known_hosts` está vacío
y no hay forma de aceptar la huella sin sesión interactiva; `ssh-keyscan ssh.railway.app` **no
devuelve nada**, así que ese host no habla SSH plano — Railway tunela por su propio proxy. O sea
que el problema **ya no es la clave**: es la verificación del host, y desde una sesión no
interactiva no se resuelve por ahí.

⚠️ **Lo que significa en la práctica: la sonda `railway ssh … grep -c <algo> <archivo>` que este
archivo recomienda en media docena de sitios NO está disponible en esta máquina.** Al verificar un
deploy hay que usar las otras dos, que además son más baratas:

| Sonda | Qué prueba |
|---|---|
| **Arranque fresco en los logs** (`railway logs --json \| tail`) | El timestamp del último arranque. Si es de hace dos minutos, el contenedor se reemplazó con lo que acabas de subir. Es lo que se usó el 2026-09-11 |
| **`/health` + un 401 en `/api/auth/login`** con credenciales falsas | Que el servicio levantó Y que la base se consulta bien. Un 500 diría lo contrario |

🔎 **La sonda que sustituyó a `railway ssh`, y conviene tenerla escrita porque es más barata:** el
cron del resumen **cambió su línea de arranque**, así que `railway logs` lo delata sin tocar la
base y sin pedir sesión.

```bash
railway logs --service api | grep "Cron configurado"
# → [Resumen] Cron configurado: diario 8:00 AM (hora Lima), cadencia por usuario
```

Antes decía `domingo 8:00 AM`. Es exactamente lo que §5 pide —**un cambio observable en la
salida**— y no depende de tener clave SSH. ⚠️ Al cambiar un cron o cualquier cosa que se anuncie al
arrancar, dejar que el log lo diga: sale gratis y se convierte en el comprobante del deploy.

⚠️ **Vercel devolvió `{"status":"error","reason":"deploy_failed","message":"Not authorized"}` en el
primer intento y funcionó en el segundo sin tocar nada.** NO era el bloqueo por autor de git del
31/08, y la forma de saberlo es que **no se creó ningún deployment**: el de aquel día quedaba
registrado en estado `BLOCKED` con su `errorMessage`. Si vuelve a pasar, mirar la lista de
deployments antes de perseguir la identidad de git.
### 📌 2026-09-16 — número nuevo de WhatsApp, los dos bugs de la app, y la sincronía de todo

Se empezó cambiando un número y se acabó repasando todos los pendientes. Cada cosa está
desarrollada en su sección; esto es el resumen.

**El número de la empresa pasa a +51 916 383 038**, y se aprovechó para quitarle una **segunda
copia**. Vivía en `CONTACTO` (el pie, contacto, devoluciones) **y** en la variable
`NEXT_PUBLIC_WHATSAPP_VENTAS` de Vercel (el botón flotante, que es el que de verdad usa el
cliente). Esa variable nació como interruptor mientras no había número; decidido el número, pasó
a ser una copia del dato, y cambiar uno sin el otro **no falla**: el pie anuncia el nuevo y el
botón sigue mandando al viejo. Ahora los dos leen **`brand-shield-web/src/lib/contacto.js`** y la
variable se borró de Vercel.
- ✅ **Verificado en producción, no por el «SUCCESS»:** el `href` del botón en el HTML servido es
  `wa.me/51916383038?text=…`, el número viejo tiene **cero** apariciones en los chunks del landing,
  y en el navegador el botón se ve y apunta ahí.
- ⚠️ **Tres menciones del número viejo se dejaron a propósito** (la ficha de Google el 27/08, la
  sonda de Places y los datos de la Organization account el 30/08): son actas de lo que se observó
  o envió en esa fecha, y reescribirlas haría que el documento afirme cosas falsas.
- ✅ **El dueño cambió el número en la ficha de Google el mismo día.** ⚠️ Editar una ficha
  verificada puede mandarla a revisión: **antes de reenviar la solicitud de GBP el 16/10,
  comprobar que sigue «Verificada»**.

**El saludo automático de WhatsApp Business NO se cruza con el mensaje predeterminado de la web.**
El `?text=` de `wa.me` solo **escribe** el mensaje en la caja; el saludo se dispara cuando el
cliente **envía** su primer mensaje. El orden es siempre: su mensaje, luego el saludo — el
predeterminado nunca se pierde, y sigue diciendo de dónde viene el prospecto.
- ⚠️ **Lo que sí roza es la redacción.** Un saludo de apertura en frío («¿en qué podemos
  ayudarte?») llega justo después de que el cliente explicó lo que quiere, y parece que nadie lo
  leyó. Conviene que **acuse recibo y fije el tiempo de respuesta**, con el **mismo horario que la
  web** (lunes a viernes, 9:00–18:00).
- El saludo solo sale **una vez cada 14 días** por contacto: no poner ahí nada esencial. Y hace
  falta el **mensaje de ausencia** para quien escribe fuera de horario.
- La única prueba que vale es **desde otro teléfono**, pulsando el botón real.

**Los dos bugs de la app, arreglados y compilados** (detalle en §19 «Bugs abiertos» y en
`NotoriaApp/PENDIENTES.md`): la pantalla de Alertas leía el lote en crudo y al guardar lo
deshacía, y el cartel prometía «Reseñas verificadas». `assembleDebug` → **BUILD SUCCESSFUL**.
⏳ Falta verlo en el teléfono, y **el dueño lo dejó para el final**.

**Tres afirmaciones de este archivo eran falsas, y ahora dicen lo que es:**

| Decía | Es |
|---|---|
| La PC del taller no tiene JDK ni Android SDK (desde el 30/08) | Están en `dev-tools/` desde el 05/09. `keytool` y `adb` responden, y el keystore se verificó con el `keytool` real |
| `RC-20260828-2` es un resumen vacío | Es la **anulación** de B001-00000002, leído en su XML firmado |
| Agosto tiene una sola boleta (guía tributaria, 24/08) | Tiene **tres**, las tres anuladas en agosto. La declaración vence el **lunes 21/09** — ver `docs/obligaciones-tributarias-mensuales.md` §8 |

⚠️ **La primera repite la lección del 09/09 con `next build`, y la tercera es la más cara:** un
estado escrito un día y no revisado después se sigue leyendo con la misma confianza. La del JDK
duró **17 días**, y el dato correcto estaba escrito **en el otro repo**.

**Sincronía de los dos repos.**
- 🔴 **`NotoriaApp` tenía 37 KB de código sin commitear** —los carteles QR de Android, terminados
  y probados en el teléfono el 06/09— más un commit sin subir. Existían **solo en el disco de
  esta PC**. Subidos.
- 🔴 **Y firmaba los commits con `padkar4@gmail.com`**: el `git config --local` del 31/08 solo
  había arreglado Vigilio (§4). Corregido.
- Los dos worktrees de Claude Code (ya fusionados y sin cambios) se borraron, igual que sus tres
  ramas locales y las dos de GitHub. Los dos repos quedan con **solo `main`**, en sync y limpios.
  ⚠️ **No era limpieza cosmética:** un `vercel --prod` lanzado desde uno de esos worktrees habría
  desplegado su árbol viejo —con el número anterior— sin avisar.

**Lo que se verificó con el navegador** (sesión arrancada con `--chrome`):
- ✅ **El bloque de carteles del panel**, en escritorio y en móvil: el primer pendiente de la lista
  «sin mirar» del 09/09. Sin fallos (§19).
- ✅ **21 reseñas nuevas desde el 09/09 y alertas quietas en 5: es lo correcto**, porque ninguna
  era de ≤2★.

**Respaldo del día** verificado: 2453 filas, 0 que se perderían.
**`notoria-upload.jks`: dos copias** (taller y casa) — cerrado.
🔴 **Queda abierto su gemelo de nivel 1: `SUNAT_CERT_PASSWORD` solo vive en Railway**
(`docs/secretos.md`).

| Suites | `prueba-prefs-correo` **96** · `prueba-planes` 124 · `prueba-alertas-resena` 35 · `prueba-correos-idioma` 53 · `prueba-cartel` 100 — todas en verde |
|---|---|
| Frontend | desplegado y comprobado por el `href` real del botón en producción |
| App | `assembleDebug` BUILD SUCCESSFUL, APK de 15,2 MB, **sin instalar** |

### 📌 2026-09-19 — la tarjeta que se compartía era de OTRA MARCA, y tres enlaces que mentían

Salió de analizar `propuesta.md`, un documento de propuestas para la campaña. Se implementaron
y desplegaron **los cuatro primeros**; el resto queda para evaluar con el costo delante. Lo que
sigue es el resumen y las lecciones; el detalle de cada cosa está en su sección.

🔴 **Lo más grave no estaba en la propuesta: el `og-image.png` era el de ANTES DEL REBRAND.**
La propuesta lo daba por un caso más de «restaurantes y hoteles». Al abrirlo con los ojos decía
**«Vigilio»**, **«vigilio.app»**, **«30% reseñas con bots»** y **«18 países de LATAM»**. O sea
que **cada enlace compartido de usenotoria.app por WhatsApp, Facebook o Slack** mostraba otra
marca, otro dominio, una cifra inventada de las que §15 mandó retirar del landing, y una
cobertura que el producto no tiene —el servicio es solo Perú—. Confirmado servido en producción
(`HTTP 200`, 49168 bytes, el mismo archivo del repo).
- ⚠️ **Nadie lo vio porque el texto sí estaba corregido.** `layout.js` dice «negocios del Perú»
  desde hace tiempo y el landing también. Lo único desfasado era **el píxel**, y un PNG no
  aparece en ningún `grep`. La regla que deja: **al renombrar una marca, la lista de sitios
  incluye las IMÁGENES, y se comprueban abriéndolas.** Un barrido de texto no las ve.
- La imagen nueva **no lleva cifras**, y es deliberado: §15 exige URL pública visible para toda
  cifra, y una tarjeta OG no puede mostrar un enlace. Las tres cajas dicen lo que el producto
  hace, que se comprueba abriendo el panel.
- 🔴 **Trampa al regenerar el PNG:** sharp olfatea los primeros bytes para reconocer el formato,
  así que con un bloque de comentario delante el `<svg>` queda fuera de esa ventana y devuelve
  **«Input file contains unsupported image format»** — que suena a SVG corrupto con el SVG
  perfecto. El comentario va **dentro** del `<svg>`. Está escrito en el propio archivo.

🔴 **Y tres enlaces que llevaban meses aterrizando en la pantalla equivocada.** La ficha
(`dashboard/negocios/[id]`) **nunca leyó `?tab=`**: `tab` arrancaba en `'resumen'` y ahí se
quedaba. Así que el botón «Responder ahora» del correo de alerta, y el del digest que apunta a
`?tab=alertas`, dejaban al cliente en Resumen desde que se escribieron. **El enlace no falla**:
lleva al negocio correcto y a la pantalla equivocada, que es la forma que nadie reporta.
- Ahora la ficha honra `?tab=` y `?resena=`, y el correo de alerta enlaza a **esa** reseña, que
  se resalta y se trae a la vista. `detalle.resenaId` **ya se guardaba** desde que existe la
  alerta: estaba ahí sin que nadie lo usara.
- ⚠️ **`Card` no reenviaba `id` al DOM** (solo aceptaba `children` y `style`), así que el ancla
  se habría descartado en silencio y el salto no habría ocurrido nunca. Es el mismo patrón que
  el `id` de un `<Card>`: un prop que no se declara no falla, se ignora.
- 🔴 **Dos trampas de React que habrían roto la ficha entera, no solo el enlace:**
  1. El efecto tiene que declararse **antes** de los `return` tempranos de carga (líneas 2016-17),
     o se viola el orden de hooks. Por eso `TAB_IDS` vive **a nivel de módulo** y no se deriva de
     `TABS`, que se construye después de esos returns.
  2. Poner `resenasFiltradas` en el array de dependencias **revienta con un ReferenceError de
     TDZ**: se declara ~340 líneas más abajo y el array de dependencias se evalúa **durante** el
     render. Las dependencias son `tab` y `negocio`, declarados arriba y equivalentes.

**Lo demás que entró, con su porqué:**

| Qué | Dónde | Por qué |
|---|---|---|
| **El expediente, en el correo de alerta** | `utils/emails.js` | `expediente` daba **cero** coincidencias en `emails.js`, `alerts/` y `workers/`. La función existía desde el 25/08 para quien ya estaba adentro buscándola; el dueño que acababa de recibir la 1★ no se enteraba de que la tenía — y es el único momento en que la prueba existe, porque el reflejo del chantajeado es bloquear a esa persona y con eso borra el rastro |
| **Plantilla «Sin registro de la visita»** | `PLANTILLAS` 1★ y 2★, es/en | El artículo del blog ya redactaba la respuesta correcta y no estaba donde el cliente escribe. **No acusa de nada**: dice un hecho comprobable, deja la puerta abierta a una confusión y mueve la conversación fuera de la ficha. Responder en público acusando de extorsión hunde la ficha |
| **Enviar el parte por WhatsApp** | correo semanal + panel | El parte ya llegaba al dueño; lo que faltaba era el tramo **del dueño al equipo**, que eran cuatro pasos cada lunes. `wa.me/?text=` es una URL: ni integración con Meta, ni permisos, ni aprobación |

- ⚠️ **En el panel, «Enviar» va primero y «Copiar» queda de respaldo**, y va como `<a>` y no como
  un `<button>` con `window.open`: un bloqueador de emergentes mata el segundo **sin decir nada**.
- ⚠️ **El contador de plantillas sale de `.length`**, no escrito a mano: decía «6 plantillas» y al
  añadir la séptima habría seguido diciendo 6 sin que nada fallara.

**Lo que se comprobó, y cómo** — ninguna de las dos por el «SUCCESS»:

| | |
|---|---|
| Correo de alerta | Renderizado **interceptando Resend**, o sea el mismo código de producción sin mandar nada: los dos idiomas llevan el enlace con `resena=`, la guía responde 200, y el **control** (alerta sin `detalle`, que es la escalación de 24 h y el token de Facebook) cae al genérico **sin** el bloque |
| Parte por WhatsApp | El `wa.me` **decodifica al parte exacto**, saltos de línea incluidos; control sin parte = 0 enlaces |
| Frontend | Chunk **bajado desde producción** con las tres cadenas nuevas y el ancla, más una frase inventada que da 0 — sin ese control el verde no significaría nada |
| OG | `52293 bytes` en producción (el viejo medía 49168) y el PNG **mirado con los ojos** |
| Backend | Arranque del contenedor a las **21:36:17Z** con la subida a las 21:36 — o sea el contenedor nuevo, no un arranque viejo. `/health` 200 y **401** en `/api/auth/login` con credenciales falsas |

| Suites | `prueba-escape-emails` 24 · `prueba-correos-idioma` 53 · `prueba-alertas-resena` 35 · `prueba-cableado` 33 · `prueba-parte-equipo` 66 · `prueba-planes` 124 — todas en verde |
|---|---|
| Build | `next build` exit 0, 36 páginas |

⚠️ **Aviso nuevo de Railway, sin urgencia:** `railway.json` queda deprecado el **2026-12-01** a
favor de `.railway/railway.ts` (`railway config migrate`). Sigue funcionando hasta entonces.

### 📌 2026-09-20 — cuatro propuestas más, y un diccionario que le hablaba a un solo rubro

El dueño aprobó cuatro de las siete propuestas pendientes de `propuesta.md` (está en
`Downloads/`, **no en el repo**) y dos decisiones. Las dos que quedan abiertas están en la caja
de §19. Cada cosa está desarrollada en su sección; esto es el resumen y las lecciones.

| # | Qué | Dónde |
|---|---|---|
| 5 | Quitar «restaurantes y hoteles» | §1, los dos README y `package.json` |
| 6 | **Código verificable en el expediente** | `lib/expedienteCodigo.js` |
| 7 | **Diccionario de quejas por rubro** | `lib/temas.js` — §13 |
| 8 | **La competencia, dentro del resumen** | `lib/competencia.js` |
| — | La cifra en soles: **el bar se queda** | decisión, §15 |
| — | Detección por perfil: **no se hace** | decisión, §15 |

🔴 **Lo más caro era el vocabulario, no el código.** El diccionario de temas solo sabía de
comida, así que a las **2 peluquerías de las 8 fichas activas** les devolvía cero temas — y el
cliente no ve un error, ve una sección vacía. Las palabras nuevas salieron de **leer reseñas
reales** de salones, barberías, discotecas y hoteles de Lima con la API de Places (~50 consultas,
$1 aprox.), no de inventarlas. Sirvió: en salones la queja dominante resultó ser **«no quedó como
pedí»**, que ningún diccionario escrito de memoria habría incluido. Detalle en §13.

🔴 **Y ahí apareció un bug preexistente: faltaba la palabra `'fría'`.** El tema se llama «Comida
fría» y la lista tenía `'frio'`, `'frío'`, `'fria'` y `'frías'` — todas menos el singular con
tilde, o sea que «la comida llegó fría» no lo levantaba. **A ojo las cuatro variantes parecen
cubrirlo todo**; lo cazó probar el diccionario contra frases reales en vez de leerlo.

**El expediente ya no es un PDF editable.** Lleva código firmado, QR y la **huella del texto** de
la reseña: si alguien edita una palabra del documento, la huella impresa deja de corresponder con
la que devuelve la verificación. Se verifica por la misma URL que la constancia.
🔴 **Eso obligó a una guarda que no existía:** los dos documentos se firman con el **mismo**
secreto, así que la firma de un expediente es válida para el verificador de la constancia. Sin un
discriminador de tipo, un expediente se habría mostrado como constancia —con sello de
«verificado»— sobre campos vacíos. Ahora cada verificador comprueba el suyo, y **las constancias
ya emitidas siguen valiendo** porque la regla es «si trae tipo, que sea el mío», no «tiene que
traerlo».
⚠️ Vigencia **365 días** y no los 90 de la constancia, y no es un número copiado: la constancia
dice «hoy tiene 4.6★» y eso caduca; el expediente dice «el 15 de agosto existía esta reseña», que
es un hecho pasado — y una denuncia penal dura bastante más de 90 días.

**La competencia entra por el resumen, no por una alerta nueva.** La función existía entera y el
dato estaba guardado; lo que faltaba no era recolectar nada sino **avisar**, porque el cliente
solo se enteraba si entraba al panel y el abandono del dueño está medido a los veinte días.
🔴 **Se descartó el `TipoAlerta` que pedía la propuesta**, por dos motivos: obliga a tocar SIETE
sitios y olvidar uno deja al usuario sin poder activarla en silencio (§12); y sobre todo **no es
una urgencia** — que el vecino haya ganado seis reseñas este mes no exige hacer nada hoy, y
meterlo en el canal de las alertas críticas le restaría filo al canal donde sí avisamos de una
reseña de 1★. Cero llamadas a Google: sale de los snapshots que el worker ya guarda.

⚠️ **Tres colisiones de nombres al ampliar suites existentes** (`hoy`, `base`, `emails` ya
declarados arriba). Ninguna es interesante salvo por lo que enseña: al **añadir un bloque a una
prueba larga**, las variables del bloque nuevo comparten ámbito con todo lo anterior. Las tres
salieron como `SyntaxError` al primer intento, o sea barato — pero un `const` que sí hubiera
compilado pisando otro habría sido un rojo incomprensible.

| Suites | 40 en verde. `prueba-temas` **96** (nueva) · `prueba-expediente` **66** (eran 43) · `prueba-cableado` **52** (eran 33) |
|---|---|
| Build | `next build` exit 0 |

### 📌 2026-09-22 — los guiones entran al repo, la tarjeta que también mentía, y el aviso de Google

Tres cosas de origen distinto. Cada una está desarrollada donde corresponde; esto es el
resumen y las lecciones.

🔴 **LO URGENTE, Y NO ES DEL CÓDIGO: Google avisó de que la cuenta de facturación no tiene
datos de pago válidos.** Dos correos de `CloudPlatform-noreply@google.com` el 21/09 a las
23:39, y el segundo nombra el proyecto por su ID: **`project-f1e03c17-f209-453e-a09`**, que
es el de producción (§3) — el que tiene **Places API** y el **`GOOGLE_CLIENT_ID`**. Si lo
suspenden se caen las dos cosas a la vez: el monitoreo entero y el «Entrar con Google» de
todos los clientes. Cuenta de facturación **`019CC3-FF537C-DBA7DD`**.

**Verificado, no supuesto** — el correo es legítimo (dominio y enlaces de Google) pero lo que
dice no cuadra del todo con lo que enseña la consola:

| Qué | Estado el 2026-09-22 |
|---|---|
| Saldo | **PEN 0.00**, «sin saldo pendiente» |
| Gasto set (1-22), ago y jul | **S/. 0.00** los tres |
| Tarjeta registrada | Visa ••••2224, **vence 07/30** — no está vencida |
| Cuenta | «Cuenta pagada», sin alerta en el panel |
| **Producción** | **VIVA**: último snapshot hace 1,5 h y **24/día** parejos toda la semana |

⚠️ **O sea que no hay deuda y la tarjeta no caducó**, que son las dos causas que el correo
propone.

### 🔑 Y el 2026-09-22 la causa dejó de ser hipótesis: es la TARJETA, y la delató YouTube

El dueño contó que por esas mismas horas **YouTube Premium no se le llegó a cobrar**, con un
mensaje que también pedía validar la forma de pago. Comprobado en el centro de pagos, y esto
explica todo lo que no cuadraba:

| Servicio | Forma de pago |
|---|---|
| Google AI Plus (400 GB, Google One) | **Visa Débito Clásica Compras ••••2224** |
| **Google Cloud `019CC3-FF537C-DBA7DD`** | **la misma** |
| YouTube Premium | **la misma** |

🔴 **Los tres cuelgan de la MISMA tarjeta, y la marca del rechazo va sobre el INSTRUMENTO, no
sobre la cuenta que lo usa.** Por eso Cloud recibe un aviso de «datos de pago no válidos»
debiendo **PEN 0.00**: no es que Cloud tenga un problema, es que la tarjeta falló un cobro real
en otro servicio y Google la marca para todos a la vez. La propia ficha la llama «Visa
**Débito** Clásica Compras», que es el dato que la hipótesis suponía.

⚠️ **CANCELAR YOUTUBE PREMIUM NO ARREGLA NADA**, y conviene decirlo porque es la reacción
natural. La tarjeta sigue siendo la forma de pago de Cloud **y de Google AI Plus**, que es la
siguiente que va a fallar. Lo que hay que arreglar es el medio de pago, no la suscripción.

🔴 **Y pone fecha al riesgo de Cloud, que hasta ahora no la tenía.** La ficha dice: *«Se te
cobrará automáticamente el 1.º día de cada mes. Si tu saldo alcanza el límite de pago de PEN
200.00 antes de ese momento, se te cobrará de inmediato.»* Hoy el gasto es **S/ 0.00** porque
el uso cabe en el crédito mensual de Maps — o sea que **el día que Places pase de ese crédito,
Google intenta cobrar esa tarjeta y le va a pasar lo que le pasó a YouTube.** El margen no es
indefinido: es el que queda hasta que el padrón crezca.

🔴 **Y lo que el repaso destapó, que es lo que de verdad hay que arreglar: una suspensión
sería MUDA.** El monitor de uptime comprueba `/health` y el landing, y los dos seguirían
respondiendo 200; el cron seguiría corriendo cada hora con **cada consulta a Places
fallando**; y el scraper devuelve `null` ante un fallo, que el worker trata como «no se pudo
leer» y sigue. Ni excepción, ni log que alguien mire, ni alerta. El cliente vería el
historial de su ficha congelarse y nada más. Es el patrón que §16 documenta —«no hay
alertas» y «no pude consultarlas» no pueden verse igual— aplicado al proveedor.
✅ **Hecho el 2026-09-23**: el monitor ya distingue «Places responde» de «Places rechaza» —
ver «📌 2026-09-23», más abajo.
⚠️ **Arreglar la tarjeta es del dueño**: el agente no introduce datos de pago, y ninguna
autorización cambia eso.

### Los guiones de campaña viven en `campana/guiones/` desde hoy

Estaban solo en `Downloads/notoria-videos/guiones`, y eso fallaba por dos motivos que no son
el mismo:

- **`Downloads` se limpia sola** — el mismo aviso que §3 da para el `.p12`. Y lo que se
  perdería no es texto: cada guión lleva dentro **por qué** cada frase dice lo que dice y
  contra qué se comprobó, que es lo caro de rehacer.
- **Son material que afirma cosas sobre el producto**, o sea que §15 los gobierna. Un guión
  fuera del repo es una promesa que nadie revisa cuando el producto cambia — y ya había
  mordido: el resumen dejó de ser semanal el 09/09 y el guión 3 siguió diciendo «lunes»
  **once días**.

⚠️ **Solo los guiones** (decisión del dueño). Las tarjetas no hacen falta porque se
regeneran; las **imágenes de inicio de Kling NO se regeneran** —salieron de un modelo sin
semilla guardada— y siguen viviendo en `Downloads`, que es justamente el problema. Anotado en
`campana/README.md`.

### 🔴 La frase falsa estaba DENTRO del PNG, y un PNG no sale en ningún `grep`

El 20/09 se corrigieron siete guiones y se dio el trabajo por cerrado anotando que «el
arreglo es solo de voz y subtítulos, no cuesta un crédito». **Era verdad a medias.** Al abrir
las 14 tarjetas una por una, **seis seguían imprimiendo lo que ya se había quitado de la
voz**:

| Tarjeta | Lo que imprimía | Por qué no se sostiene |
|---|---|---|
| `1a` | «A las 2… **Y a las 3. Y a las 4**» | ningún plan revisa cada hora; el más caro, cada 2 h |
| `2a` | «catorce reseñas **de una estrella**» | el conteo es exacto, pero Places entrega **5 reseñas**: la nota de las otras nueve no se conoce |
| `2b` | «y te avisa **el mismo día**» | en GRATIS son 24 h, y 72 h tras el primer mes |
| `3a` | «una hora **cada lunes**» | el resumen es mensual desde el 09/09 |

⚠️ **Es el `og-image` del 19/09 otra vez, en otro soporte**, y la regla ya estaba escrita:
**al corregir un mensaje, la lista de sitios incluye las IMÁGENES, y se comprueban
abriéndolas.** Se aplicó al landing y no a la campaña, porque la campaña vivía fuera del
repo — que es el otro motivo por el que entró.
✅ Las seis regeneradas; las anteriores en `tarjetas-anteriores/`. Las ocho de los guiones
4-7 se revisaron y **dicen la verdad**, así que no se tocan: la `6b` hasta ya decía el
beneficio del expediente antes de que se discutiera, y el guión se alineó a ELLA en vez de al
revés.

🔑 **Y la corrección de fondo del guión 6, que la pregunta del dueño destapó.** Preguntó
«¿para qué el expediente, cómo le serviría eso al cliente?», y el remate decía «Notoria arma
el expediente: la reseña, su fecha y tu historial» — que **enumera lo que el PDF CONTIENE, no
lo que el dueño GANA**. Lo que gana es que **la prueba desaparece**: el chantajista borra o
edita la reseña cuando le conviene, y el propio chantajeado borra la conversación al
bloquearlo, que es el reflejo normal. Cuando llega a Google o a una comisaría no tiene nada
que enseñar. Notoria capturó esa reseña el día que la vio, con su hora, y eso es lo único que
no se puede conseguir después. ⚠️ Si el dueño del producto no entendía para qué sirve una
función, el espectador tampoco — y el guión llevaba semanas escrito.

### `marca/hacer-tarjeta.js` — el generador, reescrito porque el viejo no corre acá

`hacer-tarjeta.py` **no se puede ejecutar en la PC del taller**, y es la misma familia de
hueco que el JDK y `respaldos/`: no falla al mudarse, falla el día que se necesita. No hay
Python (`python` ni `py`), usaba **`fc-match`** —de fontconfig, que no existe en Windows— y
cargaba el logo de **`~/notoria/marca/`**, una ruta de la máquina anterior.

- Reescrito en Node junto a `generar-social.js`, que ya tenía la receta: se compone en SVG y
  se rasteriza con `sharp`.
- ⚠️ **Cambia la tipografía a propósito.** `fc-match serif` resolvía a la serif del sistema,
  **no a Georgia** — se ve en los numerales de la `1a`, de altura uniforme donde Georgia los
  dibuja con caídas. O sea que las tarjetas **nunca usaron la tipografía de la marca** (§17).
  🔴 Corolario: una tarjeta regenerada no casa con una vieja, así que **se regeneran las DOS
  de un video o ninguna** — dentro de un mismo clip la diferencia se ve.
- ⚠️ **El ancho se MIDE, no se estima**: se rasteriza el renglón suelto y se recorta con
  `trim()`. Una heurística de anchos medios se pasa por poco con las frases largas y el fallo
  es mudo — la línea sale del papel y nadie lo ve hasta que el video está montado.
- 🔴 Y una trampa al portarlo: el original trabaja en coordenadas de **tapa** (PIL dibuja
  desde arriba) y el SVG en **línea base**. Sumar saltos de línea base separa los renglones
  casi el doble; se nota comparando con una tarjeta vieja, no leyendo el código.

⚠️ **`montaje.txt` tiene el mismo problema en dos puntos** y ahí también falla mudo: el
`drawtext` de ffmpeg lleva `fontfile='$(fc-match …)'`, que en Windows se resuelve a cadena
vacía y ffmpeg **cae al tipo por defecto sin avisar**. Queda anotado en su §7 con el
reemplazo exacto (`C\:/Windows/Fonts/georgia.ttf`, con los dos puntos escapados o el filtro
no compila) y el `awk` que sustituye al `python3`.

✅ **Las piezas de redes, CORREGIDAS el 2026-09-22** (`marca/generar-social.js`). Tenían
**tres** frases que §15 ya no permite, no dos, y la tercera era la más cara:

| Decía | Por qué no se puede |
|---|---|
| «por correo **o Telegram**» | Telegram se eliminó del producto el 2026-08-22. El canal es el correo, único |
| «**Reseñas falsas** y ataques de bots» | El detector marca **comportamiento anómalo** —texto repetido entre cuentas, 1★ sin comentario, palabras críticas, ráfagas— y nunca dictamina que una reseña sea falsa. Y la detección por perfil del autor está declarada como que **no se hace** |
| 🔴 «te avisa **al instante**… y **respondes desde el panel**» | Lo de responder es lo grave: Google tiene **bloqueadas las GBP APIs** (§6), así que la respuesta se redacta en Notoria y se pega a mano. Y el aviso sale cuando el escaneo la encuentra, a la cadencia del plan — no al instante |

Ahora dicen lo que el producto hace: «Notoria te avisa por correo, con la reseña citada y una
respuesta lista para copiar» y «Campañas coordinadas de reseñas». Los tres PNG regenerados.
⚠️ **Y la lección es la del PNG otra vez, por tercera vez el mismo día:** estas piezas están
publicadas en redes desde hace meses y las frases no salían en ningún barrido, porque viven
dentro de un archivo que **genera imágenes**. El texto estaba en el fuente, sí — pero nadie
barre `marca/` buscando promesas.

### 📌 2026-09-23 — si Google nos corta, ahora llega un correo

Pedido por el dueño «por seguridad» tras el aviso de la tarjeta (arriba). Cierra el hueco que
ese repaso destapó: con la facturación suspendida, el producto dejaba de vigilar **sin ninguna
señal**.

**Cuatro piezas, y cada una tapa un silencio distinto:**

| Pieza | Qué hace |
|---|---|
| `lib/saludPlaces.js` | Cuenta las respuestas de Places. **3 `REQUEST_DENIED` / `OVER_QUERY_LIMIT` seguidos = Google rechaza a la cuenta.** Y aparte deriva de los snapshots si el escaneo sigue produciendo |
| `google.scraper.js` | Cada respuesta pasa por `salud.registrar()`, y un rechazo **se loguea** con `🔴 [Google] LA CUENTA ESTÁ RECHAZADA` y el `error_message` de Google. Antes era `return null` a secas |
| `GET /health/monitoreo` | 200 si vigila, **503 con el motivo** si no: `google_rechaza`, `escaneo_detenido` o `sin_comprobar` (la base no responde) |
| `monitor-uptime/` | Tercera sonda, «Vigilancia». Correo urgente **«Notoria dejó de vigilar»** con el motivo del 503 dentro |

🔴 **Por qué el rechazo era invisible: Places no devuelve un error HTTP.** Devuelve **200** con
`status: "REQUEST_DENIED"` en el cuerpo, así que el `catch` nunca se entera. Es la misma trampa
que TikTok (§8.2: HTTP 200 con `code != 0`), otra vez con un proveedor distinto.

⚠️ **`NOT_FOUND` y `ZERO_RESULTS` NO son rechazo**: son la API funcionando —el sitio no existe—.
Contarlos haría que el monitor gritara cada vez que alguien busca un negocio que no está, y una
alarma que grita por nada es cómo se pierde la de verdad. `INVALID_REQUEST` (error nuestro) y
`UNKNOWN_ERROR` (hipo de Google) tampoco mueven el contador.

⚠️ **No hay sonda sintética contra Places, a propósito.** Una consulta cada 5 min serían ~8 600
al mes, más que toda la plataforma. Se mira el tráfico real del cron.

⚠️ **«0 snapshots» significa cosas opuestas.** Con todas las cuentas pausadas (§8.9) es lo
correcto; con negocios por vigilar es que el cron se paró. `estadoEscaneo` solo alarma si hay
alguien despierto con negocio activo y pasaron **3× su cadencia** sin un snapshot.

⚠️ **El contador de rechazos vive en memoria y se pierde al reiniciar, y es aceptable**: si el
rechazo sigue, el cron siguiente lo re-arma en minutos. Por eso `totalOk: 0` justo después de un
deploy **no es fallo**, es contenedor recién arrancado — sube en cuanto pasa el cron de las :00.

🔴 **`/health` NO se tocó**: Railway lo usa de liveness y no debe depender de la base. La
comprobación cara va en su propia ruta, con caché de 60 s.

🔴 **Y la sonda nueva destapó un agujero en el monitor viejo.** Su estado era un booleano
«caído / no caído», así que con Vigilancia en rojo varios días (una tarjeta sin arreglar) una
caída de Railway **encima** no habría mandado nada: ya estaba «caído». Ahora el estado es **el
conjunto de sondas caídas**, cada una con su hora, y se avisa lo NUEVO. El estado viejo
`{caido, desde}` se migra al leerlo y la migración se persiste — la primera versión no la
persistía y se tragaba el correo de recuperación; lo cazó la prueba.

**Verificado en producción, no por el «SUCCESS»:**
- La ruta pasó de **404 a 200** con `vigilancia: ok`, 4 negocios vigilados, umbral 12 h.
- El Worker (versión `0096a120…`) mide las tres sondas en verde y un ciclo real dio
  `sin-cambio` sin correo.
- `prueba-salud-places.js` **42** y `prueba-monitor.mjs` **27**, las dos con sus controles.

### 📌 2026-09-23 — tres cosas del mundo real, confirmadas por el dueño

| Qué | Resultado |
|---|---|
| **Cartel QR impreso** | Escaneado en un negocio real: lee y abre la página de reseña. Cierra lo único de los carteles que ninguna prueba podía ver (§13) |
| **WhatsApp Business** | Probado desde otro teléfono pulsando el botón de la web: llega el mensaje predeterminado, y el saludo automático y el mensaje de ausencia responden bien |
| **Las 8 tarjetas de los guiones 4-7** | Regeneradas con `hacer-tarjeta.js`, mismo texto, en **Georgia**. Con esto **las 14 tarjetas de campaña** usan la tipografía de la marca. Las anteriores, en `tarjetas-anteriores/`. El texto de cada una está ahora escrito en su guión, que antes solo vivía dentro del PNG |

### 🔴 2026-09-19 — LA ECONOMÍA DEL PLAN GRATUITO, medida por primera vez

El dueño preguntó lo que nadie había calculado: **¿cuánto cuesta una cuenta gratuita y aguanta
el negocio regalarlas?** §8.7 medía el costo de Places por **local de Franquicia**, nunca por
cuenta gratuita. Esto lo cierra con datos de producción.

**El modelo de costo, y cómo se validó.** Places legacy por millar: Basic $17 · Atmosphere
(reseñas) $5 · Contact $3. Un escaneo de negocio pide `reviews,rating,user_ratings_total,
business_status,name` = **$0.022**; con Contact Data (solo planes de pago, y `tocaLeerContacto`
lo limita a **una vez al día**) = $0.025. Un competidor es Basic solo = **$0.017**.
🔑 **El modelo escupe $23.58/mes para un local de Franquicia, que es EXACTAMENTE la cifra que
§8.7 midió por otra vía.** Esa coincidencia es lo que hace creíble el resto de la tabla.

| Plan | Escaneos/mes | Places S//mes | Neto s/IGV | Margen bruto | % |
|---|---|---|---|---|---|
| **GRATIS** | 30 | **S/4.39** | S/0 | **−S/4.39** | — |
| IMPULSO | 60 | S/11.03 | S/24.58 | S/13.55 | 55% |
| NEGOCIO | 180 | S/24.75 | S/50.00 | S/25.25 | 50% |
| FRANQUICIA | 720 | S/88.43 | S/151.69 | S/63.27 | **42%** |

🔴 **Primer hallazgo: el margen BAJA según sube el precio** (55% → 50% → 42%). La cadencia
escala linealmente con el precio y el valor no: nadie mira su rating cada hora, y el propio
§8.7 ya lo dice de los competidores. **El plan más caro es el menos rentable en porcentaje.**

🔴 **Segundo hallazgo, y es el que decide: con el plan Gratuito de hoy, el negocio no cierra a
ninguna conversión realista.**

| Si el que paga es… | Conversión necesaria solo para no perder dinero | A 3% (típico en SaaS freemium) |
|---|---|---|
| IMPULSO | **24,5%** | **−S/385 por cada 100 altas** |
| NEGOCIO | 14,8% | −S/350 |
| FRANQUICIA | 6,5% | −S/236 |

Y eso es **antes** de la comisión de Culqi, de Railway/Vercel y de cualquier gasto de campaña.

🔴 **Tercer hallazgo, medido: las 4 cuentas gratuitas con negocio activo son ZOMBIS.** Ninguna
tocó el botón en 33 días, ninguna leyó una alerta, dos ni verificaron el correo, y tres tienen
76-77 días de antigüedad. **Siguen costando S/4.39 al mes cada una, para siempre, y no hay
ningún mecanismo que las pare.** Hoy son S/10 al mes; con mil altas son S/4 400 al mes sin un
sol de ingreso. **El problema no es el importe, es que la estructura no tiene freno.**

⚠️ ~~**Y no se puede ni detectar: `Usuario` NO tiene campo de último acceso.**~~ ✅ **Resuelto el
mismo día:** existe `Usuario.ultimoAcceso`, que se marca en las tres puertas de entrada (§8.9).
Antes los únicos indicios eran `Negocio.ultimoEscaneo` —que es el reloj del botón manual, no del
cron— y `Alerta.leida`, o sea que **no había forma de saber si una cuenta gratuita seguía viva**.

### Las tres palancas, ordenadas por lo que cuestan y lo que devuelven

> ✅ **LAS TRES ESTÁN HECHAS Y DESPLEGADAS el 2026-09-19.** Lo de abajo es el análisis que las
> justificó y se conserva por los números; **cómo quedaron implementadas está en §8.9**, que es
> lo que hay que leer para tocarlas. La columna `Usuario.ultimoAcceso` ya existe en producción y
> el aviso previo tiene su cron.

**1. Competidores cada 7 días en vez de cada 24 h.** La más barata y la única invisible:

| | Hoy | Con comp. semanal |
|---|---|---|
| IMPULSO | 55% | **75%** |
| NEGOCIO | 50% | **67%** |
| FRANQUICIA | 42% | **58%** |
| GRATIS | S/4.39 | **S/2.73** |

🔑 **No rompe ninguna promesa publicada: el catálogo promete CUÁNTOS competidores, nunca con qué
frecuencia se releen** (comprobado en `lib/catalogo.js` y `web/src/lib/planes.js`). Y §13 ya
midió que un rating de competidor **no se mueve en un mes** (4.8→4.8, 3.9→3.9, 4.0→4.0). Releer
cada día algo que cambia cada trimestre es 30× más de lo que el dato justifica.

**2. Dormir las cuentas gratuitas abandonadas.** Exige una columna nueva
(`Usuario.ultimoAcceso DateTime?`, aditiva y con default, o sea la vía corta de §4) y un corte
en `negociosVigilables` — el gemelo exacto del corte por antigüedad que ya existe para los
asientos del equipo y para los locales.

| Costo de una alta gratuita | |
|---|---|
| Mes 1 (24 h, competidor semanal) | S/2.73 |
| Activa mes 2+ (72 h) | S/1.08 |
| **Dormida** | **S/0.00** |
| **12 meses, hoy** | **S/52.65** |
| **12 meses, propuesto** (70% duerme) | **S/6.29 → −88%** |

⚠️ **Si se hace, HAY QUE DECIRLO en `/precios`.** «El plan gratuito se pausa a los 30 días sin
entrar y se reanuda al volver» es la regla de §15 aplicada al revés: lo que el worker **deja**
de ejecutar tampoco puede seguir prometiéndose. Bien contado además **vende**: es un motivo para
pagar, no una letra chica.
⚠️ Y el correo de aviso antes de dormir es, de paso, un correo de reactivación — o sea que la
palanca de costo y la de conversión son la misma.

**3. FRANQUICIA de 1 h a 2 h.** Sigue siendo 12× el plan gratuito. Con las tres juntas el margen
pasa de **42% a 78%** (costo S/88.43 → S/33.86).
🔴 **Esta es la única que cambia una promesa publicada**, así que **solo es gratis hacerla
AHORA**: con cero clientes de pago no se le quita nada a nadie. Después del primer suscriptor es
degradar algo que compró.

**Lo que compran las tres juntas:**

| Si el que paga es… | Conversión de equilibrio, antes → después | A 3%, por 100 altas |
|---|---|---|
| IMPULSO | 24,5% → **2,8%** | −S/385 → **+S/5** |
| NEGOCIO | 14,8% → **1,5%** | −S/350 → **+S/50** |
| FRANQUICIA | 6,5% → **0,4%** | −S/236 → **+S/303** |

⚠️ **Lo que este análisis NO cubre, y hace falta para decir «rentable» de verdad:** la comisión
de Culqi por transacción, el costo real de Railway y Vercel (fijos, hoy los únicos que se pagan)
y el de Groq. Los tres salen de facturas que tiene el dueño, no del código. Lo de arriba es
**margen bruto sobre el único costo variable**, que es lo que escala con cada cliente.

### ✅ Las tres, ejecutadas y desplegadas el mismo 2026-09-19

Implementación y reglas en **§8.9**; acá solo queda lo que enseñó hacerlas.

🔴 **La palanca 2 destapó un bug que llevaba semanas esperando al primer cliente con locales:**
el `select` del cron **no pedía `localesExtra`**, así que llegaba `undefined`,
`negociosPermitidos(plan, undefined)` devolvía **1**, y a un cliente que pagara cuatro locales el
worker le habría vigilado **uno** dejando los otros tres fuera del barrido en silencio — sin
borrar, sin desactivar y sin avisar: el historial de tres de sus fichas congelándose sin un solo
error en pantalla. No había mordido porque hoy **0 cuentas tienen locales extra**; habría mordido
el día del primer cobro de un local, que §19 tenía anotado como «sin ejercitar nunca con dinero
real». Apareció por ir a añadir tres campos al mismo `select`, no buscándolo.

🔴 **Y una asimetría de `capacidades()` que solo se ve en esta función.** Devuelve GRATIS ante un
plan desconocido, y eso es correcto **para negar una función**: lo desconocido se comporta como lo
más restrictivo. Acá invierte el riesgo — probado en vivo antes de arreglarlo, un plan `PREMIUM`
inventado devolvía `INACTIVA`. La regla que deja: **«fallar cerrado» no es una dirección fija, es
la dirección del error más caro**, y hay que preguntársela en cada call-site en vez de heredarla.

⚠️ **Tres sondas propias salieron mal antes de salir bien**, y las tres por el mismo motivo —la
sonda no distinguía lo que creía distinguir—:
- la de los `select` casaba con el digest de alertas y con el reporte mensual (daba 3, luego 4,
  donde hay **2**). «Arreglar» ese rojo habría sido añadirle campos inútiles a consultas ajenas;
- la de los campos usaba `.every()` sobre un array **vacío**, que devuelve `true`: con la sonda
  rota, cinco comprobaciones daban **verde sin haber leído una línea**. Por eso el `length === 2`
  va dentro de cada una y no solo en el check del conteo;
- y la primera versión del archivo **abría conexión a la base de producción** al cargar el
  worker, con su propia cabecera prometiendo que no tocaba la base. Lo que conecta es cargar el
  módulo, no llamarlo.

⚠️ **De paso se arregló una desincronización que dejó la palanca 3:** el JSON-LD de `layout.js`
—que va a Google como dato estructurado— seguía diciendo «cada 24, 12, 4 o **1 hora**». El FAQ
está duplicado y el visible sí se había corregido. Es exactamente el fallo que §15 documenta
desde su día, ocurrido otra vez.

### 🔴 Lo que este día corrige de `propuesta.md`, que se verificó contra el código

El documento es sólido, pero **cinco afirmaciones no resisten la comprobación**, y dos cambian la
decisión. Queda escrito porque las propuestas 5-10 siguen abiertas y se van a releer:

| Lo que dice la propuesta | Lo que dice el código |
|---|---|
| «Los tipos de alerta son exactamente seis» | Son **siete**: le faltó `COMENTARIO_NEGATIVO` |
| II-1: «la pieza que decide ya existe: `desdeTiposGoogle()`» | Esa función conoce **6 tipos de comida**, devuelve `null` para todo lo demás y solo se usa en `publico.routes.js` — **nunca sobre un negocio guardado**. El mecanismo correcto ya existe y es mejor: **`Negocio.tipo`**, enum de 12 valores que el dueño **elige a mano** en el alta (`lib/tiposNegocio.js`), y que ya incluye `Bar / Discoteca` y `Peluquería / Salón de belleza`. **No hace falta clasificador: falta vocabulario** |
| II-7: «el backend está bien protegido» | **`TIPOS_APLICABLES = ['RESTAURANTE','BAR','CAFETERIA']`** — el bar ya está dentro **a propósito**, con su justificación escrita. O sea que el código ya estira a Luca más allá de lo que midió, y la regla que la propuesta sugiere **contradiría el código actual**. Hay una decisión que tomar, no una regla que escribir. (La discoteca es `night_club` y el salón `beauty_salon`: los dos caen a `null`, o sea protegidos) |
| II-6: la lista de sitios | Le faltan `brand-shield/package.json`, `brand-shield/README.md` y **el og-image**; las 7 apariciones que llama «la solicitud a Google» están en `docs/app-review-meta.md`, que es de **Meta**; y **el landing ya estaba corregido** |
| «ya disparó solo en cuatro casos reales» | Son **cinco**, el último el 2026-08-31 |

🔴 **Y II-3 está mal costeado, lo que lo hacía parecer más caro de lo que es.** La propuesta dice
que vigilar el Espejo «duplicaría las consultas a Places». Eso solo sería cierto haciéndolo en
cada ciclo; con la cadencia semanal que ella misma propone:

| Plan | Escaneos/mes | +Espejo semanal | Incremento |
|---|---|---|---|
| IMPULSO (12 h) | 60 | +4,3 | **+7%** |
| NEGOCIO (4 h) | 180 | +4,3 | **+2,4%** |
| FRANQUICIA (1 h) | 720 | +4,3 | **+0,6%** |

A $0,022 la llamada (Basic+Atmosphere) son **$0,095 al mes por local**, un 0,4% de los $23,58 que
mide §8.7. El costo no es el problema.

🔴 **Medido contra producción, que es lo que la propuesta no hizo:** de las **8 fichas activas,
2 son PELUQUERIA**, y el diccionario de `temas.js` les devuelve **cero temas** mientras cada
restaurante devuelve al menos uno. **Pero** sus reseñas son casi todas 5★ sin una sola queja, así
que hoy «cero temas» es la respuesta **correcta**, no una falla. El hueco es real y se rompe el
día que a un salón le entre la primera queja de verdad — o sea que es «arreglar antes de que
importe», no «está roto ahora». Eso lo **baja** de urgencia y lo **abarata**.

## 19. Pendientes, ordenados por quién los desbloquea

> ### 📋 VIGENTES al 2026-09-22 — empezar por acá
>
> 🔴 **LO PRIMERO, Y NO ES DEL CÓDIGO: la TARJETA de Google, que falla para todo.**
> No es un problema de Cloud: **Google AI Plus, Google Cloud y YouTube Premium cuelgan de la
> MISMA Visa DÉBITO ••••2224**, y el rechazo real que sufrió YouTube marca el instrumento para
> los tres. Por eso Cloud avisa de «datos de pago no válidos» debiendo **PEN 0.00**.
> ⚠️ **Cancelar YouTube Premium no lo arregla** — la tarjeta sigue siendo la de Cloud y la de
> Google AI Plus, que es la próxima en fallar. Hay que cambiar el medio de pago (una de crédito,
> o que el banco autorice los cobros de Google). **Lo hace el dueño**: el agente no introduce
> datos de pago.
> 🔴 Y el reloj: Cloud cobra el **día 1 de cada mes**, o antes si el saldo llega al límite de
> PEN 200. Hoy el gasto es S/ 0.00 porque cabe en el crédito de Maps, así que **el día que
> Places lo pase, el cobro va a esa tarjeta y le pasará lo de YouTube.**
> ⚠️ **Y si suspendieran el proyecto no habría ninguna señal**: el monitor mira `/health` y el
> landing, que seguirían en 200, y el scraper trata el fallo de Places como «no se pudo leer».
> ✅ **Cerrado el 2026-09-23**: ahora sí habría señal. Si Google rechaza, llega un correo urgente
> «Notoria dejó de vigilar» a `didier@` en ≤5 min de que lo note el escaneo («📌 2026-09-23»).
>
> 🟡 **De `propuesta.md` (está en `Downloads/`, no en el repo) quedan DOS.** Ocho de las diez
> están hechas: og-image, expediente en el correo, plantilla del chantaje y parte por WhatsApp el
> 19/09; la pasada de «restaurantes y hoteles», el **expediente verificable**, el **vocabulario
> por rubro** y la **competencia en el resumen** el 20/09, más las dos decisiones (el bar se
> queda en `impacto.js`, y la detección por perfil **no se hace** — §15).
>
> | Qué queda | Por qué no se hizo |
> |---|---|
> | **#9 · Alerta del Espejo** | El dueño no la aprobó el 20/09. Avisaría si cambia la reseña que ENCABEZA la ficha y es de ≤3★ — el hallazgo más vendible del producto, porque nadie mira su ficha como la ve un extraño. Semanal y solo planes de pago. ⚠️ La propuesta decía que «duplica las consultas a Places» y **es falso**: con cadencia semanal son **+0,6% a +7%**, unos $0,10 al mes por local |
> | **#10 · El expediente como CASO** | Tampoco aprobada. Hoy es un documento; sería un caso con estado —abierto → reportado → sin respuesta → insistido → cerrado— y recordatorio a los 14 días, con la misma mecánica del cron que ya insiste con SUNAT. Es la más grande de las diez |
>
> ✅ ~~**La pregunta de negocio que mandaba: ¿cuánto cuesta una cuenta gratuita?**~~ **Medida y
> resuelta el 2026-09-19.** S/4.39 al mes, a perpetuidad y sin ningún freno. **Las tres palancas
> están hechas y desplegadas** (§8.9): competidores semanales, el gratuito espaciado y pausable,
> y Franquicia a 2 h. Un local de Franquicia pasó de $23.58 a **$9.10**, y la conversión de
> equilibrio de IMPULSO de 24,5% a **2,8%**. Ya se puede decidir lo de arriba con el número
> delante, que era la condición.
>
> Todo lo de abajo de esta caja es historia con su detalle. **Esto es lo que sigue abierto**,
> consolidado a mano cruzando este archivo, `README.md`, `docs/secretos.md`,
> `docs/obligaciones-tributarias-mensuales.md`, `docs/app-review-meta.md`,
> `docs/acceso-gbp-organization.md` y `NotoriaApp/PENDIENTES.md`. ⚠️ **Al cerrar algo, tacharlo
> AQUÍ y en su documento**: un pendiente cerrado en un solo sitio es lo que dio por pendiente un
> RVIE ya presentado el 24/08.
>
> **Con fecha**
> | Cuándo | Qué | Quién |
> |---|---|---|
> | 🔴 **ya** | **Tarjeta de Google Cloud** (arriba). Sin fecha de corte en el correo, pero Google no avisa dos veces | Dueño |
> | ✅ **presentada** | ~~Declaración de agosto~~ — **el dueño la presentó el 21/09**, en otra sesión. ⚠️ La documentación de ese trámite todavía **no está pusheada**, así que `docs/obligaciones-tributarias-mensuales.md` va por detrás de la realidad hasta que suba: es exactamente el caso que §19 advierte —un pendiente cerrado en un solo sitio— pero al revés | Dueño |
> | jue 01/10 | Sale solo el **primer resumen mensual**: comprobar que llega y que cuenta 30 días | Mirar |
> | ✅ **verificado 22/09** | ~~La pausa empieza a aplicar~~ — **aplica**: 6 de 11 cuentas dormidas (3 `INACTIVA`, 3 `SIN_VERIFICAR`) y **4 negocios activos** fuera del barrido, exactamente lo que §8.9 predijo el 19/09. **Ninguna cuenta de pago tocada**, que es la guarda funcionando. ⚠️ La primera sonda dijo «0 pausadas» porque llamaba a `dormancia.estado`, **que no existe** — daba verde sin preguntar nada. La buena usa `motivoDormida` y lleva sus dos controles: una gratuita inventada con 365 días sin entrar sale `INACTIVA`, y una NEGOCIO igual de inactiva no se duerme | — |
> | ✅ **cerrado 22/09** | ~~Las 2 cuentas gratuitas que se pausan sin aviso previo~~ — **el dueño confirmó que `britneyfarfan05@` y `giorrnellprincipe@` son SUYAS.** No se les manda nada y **no vuelve a proponerse**. ⚠️ Y corrige la lectura de §19: de las 4 cuentas gratuitas con negocio activo que el análisis del 19/09 llamó «zombis», **2 son del propio dueño**, así que el padrón real de gratuitos es la mitad de lo que parecía | — |
> | vie 16/10 | **Reenviar la solicitud de GBP** desde `usenotoria@`, con `https://usenotoria.app/` exacto. Antes: la ficha sigue «Verificada» | Dueño |
> | jue 22/10 | Declaración de setiembre (RVIE → RCE → 621) | Dueño |
> | 2027 | Declaración Anual de Renta 2026 | Dueño + contador |
>
> **Solo el dueño**
> - 🔴 **Guardar `SUNAT_CERT_PASSWORD` fuera de Railway.** Nivel 1: sin ella el `.p12` no sirve.
> - Guardar `JWT_SECRET`, `PROMO_HASH_SECRET` y `SUNAT_SOL_CLAVE` (con la nota de sus permisos).
> - Guardar el **PDF de la Constancia de Presentación de julio**.
> - ✅ ~~**WhatsApp Business**~~ — **probado por el dueño el 2026-09-23 desde otro teléfono**,
>   pulsando el botón real de la web: el mensaje predeterminado llega, y el saludo automático y
>   el mensaje de ausencia responden bien.
> - ✅ ~~**Imprimir un cartel y escanearlo**~~ — **escaneado en un negocio real** por el dueño
>   (2026-09-23): el QR impreso lee y lleva a escribir la reseña. Era la única prueba que valía.
> - **Screencasts de Meta** (Toma A grabable; la B necesita una página con reseñas) y enviar la
>   2.ª solicitud (`docs/app-review-meta.md` §8.5).
> - **Contador**: IGV por servicios de no domiciliados (Railway, Vercel, Groq), criterio de IGV y
>   exportación. **PLE + Libro Diario simplificado** (aún sin afiliar; atraso máximo 3 meses).
> - **Google Cloud al correo de la empresa**: agregarlo como propietario ANTES de quitar el personal.
>
> **Cobros que nunca se han ejercitado con dinero real**
> - Alta **con locales adicionales** y, sobre todo, **su renovación** del mes siguiente.
> - **Sumar un local a mitad de periodo** (§8.8) — exige una suscripción NEGOCIO o FRANQUICIA con
>   tarjeta guardada, que hoy no existe.
>
> **Esperando a terceros** — Google (16/10) · Meta `pages_read_user_content` → `FACEBOOK_ACTIVO` ·
> la forma de un `Recommendation` real de Facebook (falta una página con reseñas).
>
> **Decisiones de negocio** — proveedor de menciones de TikTok (~US$100/mes) · TripAdvisor ·
> **publicar en Play** (aplazado: cuenta personal u organización, US$25, ficha, formulario, y 12
> testers × 14 días si es personal).
>
> **App — al final, por decisión del dueño (2026-09-16)**
> - Instalar el APK por USB y ver Alertas con una cuenta GRATIS: el agrupado arranca encendido y
>   guardar no lo apaga.
> - El **parte semanal para el equipo** en la app (el endpoint ya está en producción).
> - Sin ejercitar: la notificación con una alerta real, el PDF del comprobante, cancelar la
>   renovación y aplicar locales desde la app.
>
> **Programable sin nadie: nada pendiente.** Lo único sería forzar el resumen mensual antes del
> 01/10, y manda correo de verdad, así que espera al OK del dueño.

> ### Lo que queda por programar (2026-08-30)
>
> ✅ **HECHO el 2026-08-31: el panel en MÓVIL y en INGLÉS está repasado.** El panel salió
> **limpio**; los dos fallos que aparecieron estaban fuera de él y se cuentan abajo.
>
> **Cómo se resolvió el bloqueo que lo tenía parado.** El pendiente decía que en el proxy «no
> hay sesión» porque `localhost:3001` es otro origen. Cierto, pero la salida era trivial y no
> estaba escrita: **iniciar sesión DENTRO del iframe**, que es justo por lo que el proxy escucha
> en el 3001 (ese origen está en `origensPermitidos` del CORS). Lo hace el dueño una vez y el
> barrido corre entero.
> ⚠️ **`resize_window` volvió a mentir**, como está documentado: responde «Successfully resized»
> y `innerWidth` se queda en 1366 con la ventana maximizada. Probado en dos pasos por si
> desmaximizaba: no. El iframe del proxy da **386 px de viewport real** y es la única vía.
>
> **Resultado — 0 desbordes y sin scroll horizontal en 21 pantallas** a 386 px: las 11 rutas del
> panel, la ficha de negocio y sus 9 pestañas.
> - ⚠️ **La primera pasada dio 19 falsos positivos** por contar el menú lateral off-canvas
>   (`-translate-x-full`, izq −224 / der 0), que está fuera de pantalla A PROPÓSITO. **Un
>   elemento con `right <= 0` está oculto, no desbordado**; lo que rompe el layout es lo que
>   asoma por la derecha. La sonda del 29/08 tenía el mismo agujero por otro lado (miraba
>   `overflow-x` auto/scroll y olvidaba `hidden`).
> - 🔴 **Y la sonda de idioma daba un resultado FALSO por no comprobar dónde aterrizaba.**
>   Reportaba la ruta *pedida*, no la *real*, y el panel rebota a `/login` mientras el
>   AuthContext hidrata — así que estuvo midiendo la pantalla de login creyendo que medía seis
>   pantallas del panel. **Al barrer varias rutas, verificar `location.pathname` después de
>   cada salto**, no antes. Es el «404 de control» aplicado a la navegación.
> - ⚠️ **El barrido rápido agota el rate-limit** (todas las peticiones salen de la misma IP), y
>   eso destapó el bug del 429 que se cuenta abajo. Al repetirlo, espaciar los saltos.
>
> 🔴 **Lo que sí apareció, y NO es el panel: el circuito de ENTRADA no está traducido.**
> `/login`, `/registro`, `/recuperar-password`, `/resetear-password`, `/onboarding` y
> `/verificar-email` **no llaman a `useIdioma`** y llevan el texto en español a pelo (~60
> cadenas). O sea que quien navega en inglés ve el landing en inglés, pulsa «Log in» y **cae en
> una pantalla en español** — con `<html lang="en">` encima, que es lo que lo delata.
> - ✅ **NO es un pendiente: el dueño lo cerró como decisión el 2026-08-31.** El mercado es Perú,
>   hay **1 cuenta en inglés de 10** (la suya), y son ~60 cadenas en las dos direcciones que no
>   mueven ningún ingreso. **No se apunta como tarea ni se vuelve a proponer.** Si algún día hay
>   clientes fuera del Perú, se reabre; hasta entonces está zanjado, igual que el domicilio
>   fiscal del pie (§15).
> - ⚠️ **Distinto de las que están en español A PROPÓSITO** y no hay que tocar: `/precios` (el
>   catálogo que revisa Culqi, ya documentado como que nunca llama a `useIdioma`), `/terminos`,
>   `/privacidad`, `/libro-reclamaciones` y `/devoluciones` — instrumentos legales peruanos,
>   igual que los cinco correos de `SOLO_ESPANOL`.
>
> ✅ **El panel en sí está bien traducido**: sale «Overview / Reviews / Comments / Alerts /
> Competitors / How they see you / Request reviews / Tips / Settings», no hay una sola cadena
> española a pelo en el JSX de sus 12 rutas, y ningún campo del backend se pinta en crudo (las
> únicas coincidencias de `{x.descripcion}` están en scripts de terminal, que van en español a
> propósito). 207 comprobaciones de las suites de idioma y alertas en verde.
>
> ✅ **El hueco del cambio mensual→anual se cerró el 2026-08-30.** Era el último de producto.
>
> ✅ **P1 — Sumar un local en el plan que YA tienes: HECHO el 2026-08-26.** Ver §8.8.
>
> ── Lo que se cerró antes ──────────────────────────────────────────────────
>
> 🟡 **P1, el pendiente del 25**, era una decisión de facturación antes que código: el selector
> de locales solo salía en las tarjetas de los planes que **no** son el actual, así que el
> cliente ya suscrito a NEGOCIO que abría su segundo local no tenía por dónde comprarlo — y el
> 403 al crear el negocio lo mandaba justamente a Planes, donde ese control no existía para él.
>
> 🔴 **Al ponerle números, una de las dos salidas que la nota daba por defendibles dejó de
> serlo.** Volver a pasar por el alta no cobra solo el local: cobra **el plan entero otra vez** y
> arranca el vencimiento desde hoy. A un cliente de NEGOCIO anual con 11 meses por delante,
> sumar un local de S/372 le habría costado S/936 tirando S/517 de servicio ya pagado. Se
> descartó, junto con la de dejarlo gratis hasta la renovación (en anual son hasta 364 días
> gratis, y repetible). **Decidido: prorrateo, con piso de S/5.**
>
>
> El 2026-08-23 esta lista estaba vacía. El 24 se hizo un bloque grande de trabajo —el plan
> **Impulso**, el **panel accionable** (score, temas, tareas), **estrellas a soles**, el **parte
> para el equipo**, respaldos y embudo— y quedó una sola cosa pendiente de escribir:
>
> ✅ **I8 — El expediente de extorsión: HECHO el 2026-08-25.** Con esto van **las nueve** ideas de
> `docs/ideas-notoria.html`. Se hizo en dos piezas y **la guía primero**, invirtiendo el orden que
> decía el pendiente: la guía capta por buscador desde el día uno y el PDF solo le sirve a quien
> ya es cliente. La guía es el séptimo artículo del blog
> (`extorsion-con-resenas-que-hacer`); el expediente vive en `lib/expediente.js` +
> `utils/expediente.pdf.js` + `GET /api/negocios/:id/expediente/:resenaId.pdf`, y se ofrece en
> las reseñas de ≤2★ o con señal.
>
> 🔴 **Una corrección de fondo respecto a lo que decía el pendiente:** para el chantaje de un
> particular la puerta **NO es INDECOPI** sino una denuncia penal por **extorsión (art. 200 del
> Código Penal)**. INDECOPI entra si detrás hay un **competidor**, por competencia desleal
> (D.L. 1044). La Ley 29571 regula lo que tú le debes a tus clientes, no lo que un tercero te
> hace a ti — es la norma del Libro de Reclamaciones, no la que sanciona a quien te extorsiona.
>
> ⚠️ **Lo que el expediente NO guarda, a propósito:** las capturas del chat. Haría falta
> almacenamiento de archivos (el disco de Railway es efímero) y, sobre todo, custodiar prueba de
> un caso ajeno con datos personales de un tercero identificable. El dueño las adjunta él a su
> denuncia; el documento le dice exactamente cuáles y por qué.
>
> El patrón: alguien deja 1★ y acto seguido escribe por privado ofreciendo quitarla a cambio de
> una comida gratis o de plata. Todo dueño de restaurante en Lima lo conoce y **no hay nada
> escrito en español sobre qué hacer**. Notoria puede hacer dos cosas que nadie hace:
> 1. **Armar el expediente** — un PDF con la reseña completa, su fecha exacta, las capturas de
>    la conversación que suba el dueño y el historial de rating alrededor de esa fecha. Es justo
>    lo que Google y una denuncia necesitan y lo que a mano nadie reúne bien.
> 2. **Escribir la guía** — qué reporta Google y qué no, cómo se presenta ante INDECOPI, qué
>    figura del Código de Protección al Consumidor aplica. Doble uso: función y captación por SEO.
>
> 🔴 **El límite, que ahora está en el código y no solo en esta nota:** el producto **arma la
> evidencia y explica el procedimiento**. No da asesoría legal ni afirma que una reseña sea falsa
> — eso lo determinan la plataforma o la autoridad. La advertencia va **impresa en el propio PDF**
> («ALCANCE DE ESTE DOCUMENTO»), la guía la repite, y **15 de las 43 comprobaciones de
> `prueba-expediente.js` leen el fuente** para que nadie vuelva el documento más contundente. Un
> PDF con el logo de Notoria acusando de un delito a una persona identificable sería un problema
> nuestro, no del cliente. Es la misma regla que gobierna el detector («comportamiento anómalo»,
> nunca «esta reseña es falsa»).
>
> ── Y tres cosas que **NO son pendientes, son decisiones tomadas** ────────────────────────
>
> Se dejan escritas para que nadie las vuelva a apuntar como tarea:
>
> 1. **Ver la forma de un `Recommendation` real de Facebook.** No falta trabajo: falta el dato.
>    La página del dueño no tiene ninguna reseña, y el resto de la integración ya se probó
>    contra la API real (§8.5). El día que haya a mano una página con reseñas es una llamada de
>    treinta segundos; hasta entonces no bloquea nada, porque el interruptor sigue apagado.
>
> 2. **Los 5 correos que siguen en español.** El comprobante electrónico y los cuatro del Libro
>    de Reclamaciones. **Traducirlos sería un error, no una mejora**: son documentos e
>    instrumentos legales peruanos, y su texto tiene que decir lo que dice la norma.
>    `scripts/prueba-correos-idioma.js` los tiene en `SOLO_ESPANOL` con el motivo escrito, y
>    obliga a clasificar cualquier correo nuevo — así la decisión no se pierde.
>
> 3. **Historizar el score de verdad.** La serie mantiene fijos `confianza` y `respuesta` porque
>    no se guarda cuántas reseñas estaban respondidas en marzo. Hacerlo bien costaría una columna
>    por snapshot y **no vale ese precio**: lo que se mira en una tendencia es la pendiente, no
>    el valor de un martes de hace tres meses. La limitación viaja declarada al panel
>    (`componentesFijos`) y se dice al pie del gráfico. Ver §13.

### A. Esperando a un tercero — solo vigilar el correo

| Qué | Desde | Qué bloquea |
|---|---|---|
| ~~Meta — App Review de Instagram~~ | ✅ **RESUELTO el 2026-08-26** | 4 de 5 aprobados; `pages_manage_metadata` rechazado. Instagram y Menciones **ya están abiertos** (§8.3) |
| **Google — acceso a las GBP APIs** | 🔴 **RECHAZADAS las tres, y ya se sabe por qué: los 60 días.** Google contestó el **2026-09-08** a los casos `3-5553000040900` (16/08) y `0-4623000041642` (29/08) — el tercero, `6-5952000041022` (30/08), sin respuesta pero con el mismo destino. Motivo textual: el perfil debe estar **verificado desde hace 60 días o más**, y se verificó ~**17/08/2026**. El correo da fecha: **reenviar el 16 de octubre de 2026, no antes**. Y un segundo requisito que hoy se incumple: la URL de la solicitud debe ser **exactamente** la de la ficha (`https://usenotoria.app/`, con barra). Detalle arriba, en «RESUELTO el 2026-09-08» | Conectar Google Business |

**Revisión del panel de Meta del 2026-08-22 — nada que hacer, solo esperar.** Estado
`Review in progress` con los cinco permisos correctos, app en **modo Live**, y las dos
obligaciones (`Submit Data Use Checkup` y `Data access renewal`) en **Completed**.
- ⏳ **El plazo real lo dice el propio panel: *"most submissions are reviewed within 20
  days"***, no los 7-10 que se supusieron al enviarlo. Enviado el 15/08 → **hasta
  ~4 de septiembre** antes de que valga la pena preocuparse.
- 📅 **5 de octubre de 2026: vence la renovación anual de acceso a datos de Meta.** Si se
  pasa, se pierde el acceso a las APIs. No depende del App Review.

**Revisión de los dos paneles del 2026-08-24 — nada que hacer, solo esperar.**

*Meta* (`developers.facebook.com/apps/2232447584255257`):
- **App Review: `Review in progress`**, con los cinco permisos correctos —`pages_show_list`,
  `pages_manage_metadata`, `pages_read_engagement`, `instagram_basic`,
  `instagram_manage_comments`— más `public_profile` en «Existing access for renewal».
- **App en modo Live.** ⚠️ La cabecera se lee mal: pone «App Mode: Development [switch] Live»,
  y esas dos palabras son las ETIQUETAS del interruptor, no el estado. Lo que decide es el
  `aria-checked` del switch (`true` = Live), y la alerta del 6 de agosto lo confirma:
  *«Notoria switched to live mode»*. No tocar ese interruptor.
- ✅ **Las dos obligaciones están CERRADAS**, no pendientes: *Submit Data Use Checkup* y *Data
  access renewal* figuran las dos en **Completed** en «Required actions». El **5 de octubre de
  2026 es la FECHA LÍMITE que ya se cumplió** (se completaron el 6 de agosto), no un vencimiento
  por delante. Las 5 alertas de la bandeja son el rastro de eso y del envío del 15 de agosto.
- ⏳ Llevaba **9 días** de los ~20 que Meta declara. Antes del **~4 de septiembre** no vale la
  pena preocuparse.

*Google* (`console.cloud.google.com`, proyecto `798376364749`):
- 🔴 **Sigue SIN acceso.** `mybusinessbusinessinformation` → **`Requests per minute` = 0**.
- ⚠️ Y la trampa de siempre, comprobada otra vez: las **otras tres cuotas sí tienen valores**
  (Create Location 100 · SearchGoogleLocation 200 · Update Location 10 000). Ver un número en la
  tabla y darlo por concedido es el error fácil; la única señal es Requests per minute.
- APIs de GBP habilitadas y **las tres sin una sola llamada**: Business Profile Performance, My
  Business Account Management, My Business Business Information. **`mybusiness.googleapis.com`
  (la v4, la que lee y responde reseñas) sigue sin aparecer** ni en el panel ni en la Biblioteca.
- ✅ De paso quedó medido que **Places API sí trabaja**: 40 peticiones, **0 errores**. El
  monitoreo está tirando de esa cuota y no de las de GBP, que es lo correcto.
- ⚠️ La consola reescribió `?project=798376364749` a `?project=project-f1e03c17-f209-453e-a09`
  sin avisar, como está documentado. Es el proyecto correcto («My First Project»).

⚠️ **Cómo se lee la cuota de las GBP APIs sin equivocarse:** las otras tres cuotas de
`mybusinessbusinessinformation` **siempre han tenido valores** (Create Location 100,
SearchGoogleLocation 200, Update Location 10 000). La única señal de que hay acceso
concedido es **`Requests per minute`**, que sigue en **0**. Ver un 100 en la tabla y
cantar victoria es el error fácil.

⚠️ **El caso `3-5553000040900` no tiene rastro en ningún buzón accesible.** Buscado con
`in:anywhere` —que incluye spam y papelera— en `usenotoria@gmail.com` y en `padkar4@gmail.com`:
cero resultados, ni por el número ni por "Business Profile API". Tampoco figura en Cloud
Support → Casos, donde además la consola avisa de que **crear casos no está disponible con el
plan de asistencia actual**, así que ese caso no vive ahí.

✅ **Resuelto el 2026-08-22: la hipótesis de `admin@usenotoria.app` queda descartada.** El
dueño confirma que esa cuenta la creó en Google Business, **le pidieron pagar y la abandonó**;
nunca la usó. Y los MX del dominio son de **Cloudflare Email Routing**
(`route1/2/3.mx.cloudflare.net`), no de Workspace, así que ese buzón **no existe** y no hay
regla que crearle. Queda la otra explicación: Google dio el número en pantalla **sin mandar
acuse**. Se confirmó además, buscando en `usenotoria@gmail.com`, que **no ha llegado ningún
correo de Google** sobre el caso ni sobre "Business Profile" desde el 10/08.
### ✅ SEGUNDA solicitud de acceso enviada el 2026-08-29 — caso `0-4623000041642`

Enviada por el agente con autorización explícita del dueño, desde `usenotoria@gmail.com`, que es
**Propietario del proyecto GCP** (comprobado en IAM) **y** administra el Perfil de Empresa. Plazo
declarado por Google en pantalla: **7 a 10 días hábiles**.

🔴 **El formulario CAMBIÓ y ya no es el que dice la documentación.** `support.google.com/business/contact/api_default`
ya no tiene campos: al elegir «Solicitud de acceso básico a las APIs» solo muestra un botón que
lleva a un asistente por pasos, **`support.google.com/business/workflow/16726127`**. Ahí es donde
se rellena. Quien busque el formulario viejo no lo va a encontrar.

⚠️ **Y una trampa del asistente que hay que saber: NO tiene pantalla de revisión.** El botón
«Continuar» del paso al 50% **es el envío**: salta directo al 100% con el número de caso. No hay
resumen previo ni confirmación. Si alguna vez hay que revisar el texto antes de mandarlo, hay que
leerlo **en los propios campos**, porque después ya no se puede.

**Los cuatro campos que pide, y lo que se puso:**

| Campo | Valor |
|---|---|
| Número del proyecto de Google Cloud | `798376364749` |
| Sitio web de empresa | `https://usenotoria.app` |
| ¿Cómo supiste que existe este formulario? | Por la documentación oficial para desarrolladores (`prereqs`) |
| **¿Cuál es el motivo principal por el que quieres acceder?** | Ver abajo |

> Notoria (usenotoria.app) es una plataforma peruana de monitoreo de reputación para restaurantes
> y hoteles. Necesitamos `reviews.list` para leer las reseñas y `reviews.updateReply` para publicar
> la respuesta que el propio dueño del negocio redacta en nuestro panel, además de `accounts.list`
> y `locations.list` para identificar sus ubicaciones. Cada propietario nos autoriza él mismo
> mediante OAuth 2.0 y puede revocar el acceso cuando quiera; no accedemos a ningún perfil sin ese
> consentimiento. Hoy nuestros usuarios ya redactan la respuesta en Notoria y deben copiarla y
> pegarla a mano en su Perfil de Empresa. También gestionamos con ella nuestro propio perfil
> verificado.

🔴 **Por qué ese texto y no el que recomienda medio internet.** El consejo que circula es
presentarlo como automatización del negocio propio, porque las solicitudes que suenan a SaaS
multi-inquilino se descartan más. **Eso sería mentirle a Google**, y el riesgo no es moral sino de
negocio: si más adelante detectan uso multi-inquilino pueden revocar el acceso **con clientes de
pago dependiendo de él**, que es mucho peor que esperar. Lo que sí se hizo, sin faltar a la verdad,
es ser **específico**: los cuatro endpoints exactos, quién autoriza, cómo se revoca, y qué problema
concreto resuelve. Un motivo verificable pesa más que uno entusiasta.

⚠️ **Lo que sigue sin saberse y puede tumbarla: los 60 días.** El asistente repite el requisito en
el paso 2. A favor: **el perfil apareció en la lista de empresas seleccionables** («Notoria ·
Empresa de servicios locales · Verificada»), o sea que Google lo ofreció como elegible — pero eso
no prueba que el filtro de antigüedad se aplique ahí y no después.

⚠️ **Y un hallazgo que no se puede afirmar del todo:** al entrar, el asistente dijo *«Parece que ya
has empezado a trabajar en esta sesión»*, o sea que había un borrador **sin terminar**. Puede
explicar por qué del caso `3-5553000040900` nunca llegó acuse — pero también puede ser el rastro de
la revisión del 27/08. **No se puede concluir que la primera solicitud quedara a medias.**

📬 **Lo que hay que mirar, y es la diferencia con la vez anterior:** que llegue el **correo de
acuse** a `usenotoria@gmail.com`. La vez pasada nunca llegó, y esa ausencia fue la única señal de
que algo no había ido bien. A los dos minutos del envío todavía no estaba, lo cual no dice nada.
Si en 24 h no ha llegado, el caso probablemente no se registró.

✅ **Comprobado el 2026-08-30 desde la PC del taller, ya con navegador: NO llegó ningún acuse.**
Buscado en `usenotoria@gmail.com` con `in:anywhere` —que incluye spam y papelera— por el número de
caso (`0-4623000041642`) y por `"Business Profile" OR "Perfil de Empresa" newer_than:3d`: **cero
resultados** en las dos. El control que hace que eso valga: `in:anywhere newer_than:3d` devuelve
decenas de correos, **entre ellos uno de Google de anoche** (la alerta de acceso nuevo desde esta
misma PC). El buzón recibe, y se ha mirado. El acuse simplemente no está.

🔴 **Y no hay UN SOLO correo de Google sobre el Perfil de Empresa en toda la historia del buzón.**
Buscado sin filtro de fecha: `in:anywhere "Perfil de Negocio" OR "Perfil de Empresa" OR "Business
Profile"` devuelve **un** resultado, y es de otra cosa (documentos de la empresa, 8 de julio). Ni
acuse, ni el correo de verificación del perfil, ni los resúmenes de rendimiento. Eso ya no es un
problema de un caso concreto: es que **ese buzón nunca ha recibido nada de Business Profile**.

🔴 **Corrección de la lectura del 30/08 por la mañana.** Se escribió acá que, con dos envíos sin
acuse, lo más probable era que el asistente no mandara acuse nunca. **La documentación pública dice
lo contrario y hay que quedarse con eso**: la guía de Xovion Labs describe *«an auto-confirmation
with a case number within the hour»*, y en el foro oficial de desarrolladores hay un caso calcado
al nuestro —solicitud del 28/07 **sin correo de confirmación**, cuota 0 diez días hábiles después,
reenvío el 12/08 y **esa vez sí** llegó confirmación con número de caso (`1-8807000041926`, mismo
formato que los nuestros)—. O sea: **el acuse sí existe, y su ausencia sigue siendo mala señal.**

### Comprobado el 2026-08-30: las causas documentadas de rechazo silencioso

La documentación oficial solo promete *«a follow-up email will be sent after your request has been
reviewed»* y remite a la cuota como forma de ver el estado. Lo que **no** documenta —y por lo que
las solicitudes se caen sin avisar— son los prerrequisitos. Se comprobaron uno por uno:

| Requisito | Estado | Cómo se verificó |
|---|---|---|
| Enviar desde el **PROPIETARIO**, no un administrador. *«If you submit the form from a manager-level Google account, it gets bounced»* | ✅ **CUMPLE** | Perfil de Negocio → Configuración → Personas y acceso: `usenotoria@gmail.com` figura como **«Propietario principal»**, y es el **único** usuario del perfil |
| Perfil **verificado** | ✅ **CUMPLE** | `business.google.com/locations`: «Notoria · Perú · **Verificada**», 1 de 1, «Se verificó el 100 %» |
| **Web** que represente al negocio | ✅ **CUMPLE** | `usenotoria.app`, enlazada en la ficha |
| Notificaciones por correo activadas | ✅ **CUMPLE** (y descarta la explicación fácil) | Perfil → Notificaciones: correo `usenotoria@gmail.com`, y **todos** los interruptores encendidos (opiniones, preguntas, estado del perfil, estadísticas…). El silencio **no** es un problema de configuración |
| **60+ días verificado y activo** | ❓ **SIGUE SIN SABERSE, y es el único que queda** | No está en la interfaz. Se intentaron dos vías nuevas y ninguna sirve: el selector de **Rendimiento** ofrece una ventana móvil de 6 meses (mar–ago 2026) que no depende de la edad del perfil, y el gráfico está a 0 en todos los meses, así que **no distingue «no existía» de «cero interacciones»**. Y el correo de verificación, que lo fecharía, es justamente uno de los que no están |

🔴 **Por eliminación, los 60 días son la hipótesis viva.** Todo lo demás que Google exige está
cumplido y verificado. Si el perfil se verificó después de mediados de junio, la solicitud del
**16/08 no calificaba**, y la del **29/08** tampoco si fue después del 30 de junio. Encaja con lo
único que se observa: dos envíos, número de caso en pantalla las dos veces, y **cero correos**.

⚠️ **Lo que NO se puede concluir todavía.** Que el perfil sea nuevo explicaría que no aprueben; no
explica por sí solo que no llegue **ningún** correo, ni siquiera el acuse automático. Las dos cosas
pueden tener causas distintas. Anotarlo por separado.

⚠️ **Lo que no existe, y conviene no volver a buscarlo:** no hay panel de seguimiento de casos de
Business Profile. La página oficial de asistencia (`developers.google.com/my-business/content/support`)
solo ofrece el formulario de soporte técnico (`support.google.com/business/contact/api_default`),
el foro de la comunidad (`support.google.com/business/community`, prefijando el asunto con `[API]`)
y el centro de ayuda. **La única forma de saber si el caso existe es preguntárselo a Google.**

📌 **Fuentes** (consultadas el 2026-08-30):
`developers.google.com/my-business/content/prereqs` · `.../content/support` ·
`discuss.google.dev/t/.../389462` (el caso calcado) · `xovionlabs.com/blog/google-business-profile-api-hidden-gate/`

🔴 **Línea de base del mismo día: la cuota sigue en 0.** `Requests per minute = 0` en las tres
(`mybusinessaccountmanagement`, `mybusinessbusinessinformation`, `businessprofileperformance`), con
el control de siempre: las otras cuotas de Business Information conservan sus valores (Create
Location 100/día, SearchGoogleLocation 200/día), así que es lectura real y no una página a medio
cargar. **Esto todavía no significa nada** —es el día 1 de un plazo de 7-10 días hábiles—; queda
anotado para comparar el 12 de septiembre.

⚠️ **Una trampa de la consola, para que no cueste dos veces:** el proyecto `798376364749` se llama
**«My First Project»**, id `project-f1e03c17-f209-453e-a09`. Abrir una URL con el NÚMERO hace que
la consola redirija al ID, y el nombre genérico da la falsa impresión de haber aterrizado en otro
proyecto. Es el correcto: número verificado en IAM → Configuración.


### 🔴 2026-08-30: falta un prerrequisito que nadie había mirado — la Organization account

Se buscó la causa del silencio de Google y apareció **un requisito obligatorio que no estaba en
ninguna de las listas de comprobación anteriores**, ni en las siete vías del 27 ni en las cinco
del 30 por la mañana. No es una teoría: es texto de la documentación oficial.

> *«Every 3P / partner who requests access to Business Profile APIs must have an Organization
> account.»* — `developers.google.com/my-business/content/accounts`

Y la FAQ oficial lo repite sin ambigüedad: *«If you are a third-party partner who performs listing
management for businesses: Register for a GBP Organization account as an agency.»*

🔴 **Notoria ES un 3P/partner, y lo dice su propia solicitud.** El texto que se envió el 29/08
describe literalmente el modelo — «cada propietario nos autoriza él mismo mediante OAuth 2.0» —,
o sea que se pidió acceso presentándose (con razón) como tercero **sin tener la cuenta que Google
le exige a un tercero**. En la lista de prerrequisitos, «Create an Organization account» es el
**paso 4**, justo antes de «Request access to the API». Se envió el formulario saltándose el paso
anterior, dos veces.

✅ **Verificado en el Administrador el 2026-08-30:** no existe ninguna organización. Solo la ficha
suelta «Notoria · Perú» (`13273074415378486285`) en una cuenta personal, y el botón «Crear grupo»
sin usar.

### El bloqueo real, y por qué esto no se arregla en cinco minutos

Hay una **pinza entre dos requisitos que se contradicen**, y es lo que hace que esto no se haya
resuelto solo:

| | Qué exige | Consecuencia |
|---|---|---|
| Formulario de acceso a la API | enviarlo desde una cuenta **owner/manager del perfil** | → `usenotoria@gmail.com` |
| Registro de la organización | una cuenta que **NO tenga ni administre ubicaciones** | → `usenotoria@gmail.com` **queda descartada** |

🔴 **Y encima, el registro exige una cuenta DEL DOMINIO.** Comprobado en pantalla en
`business.google.com/agencysignup`, tras poner `usenotoria.app` como web de la agencia:

> *«Utiliza una cuenta del dominio de la agencia: usenotoria.app. Para crear una cuenta de agencia
> de Perfil de Empresa en Google, inicia sesión con una dirección de correo del dominio
> usenotoria.app.»*

O sea que **ninguna cuenta `@gmail.com` sirve**, y eso tumba la salida fácil: `padkar4@gmail.com`
cumple lo de «0 ubicaciones» (comprobado: 0 empresas) y aun así Google lo rechaza por el dominio.

➡️ **Lo que hace falta es una cuenta de Google cuya dirección sea `@usenotoria.app`.** El dominio
no tiene Workspace —usa Cloudflare Email Routing (§6)—, así que la vía es crear una cuenta de
Google con la opción **«usar mi dirección de correo electrónico actual»** sobre `hola@` o
`didier@usenotoria.app`, que **sí tienen regla de reenvío activa** y por tanto pueden recibir el
código de verificación. Sin esa regla el código se descartaría en silencio, que es exactamente la
trampa que documenta §6.
⚠️ **Ese paso lo hace el dueño**: crear cuentas de Google no lo puede hacer el agente.

### Lo que este hallazgo descarta, y lo que no

✅ **Descartado del todo: el acuse NO se perdió en otro buzón.** Buscado el 2026-08-30 en las **dos**
cuentas del navegador con `in:anywhere` —que incluye spam y papelera— por el número de caso y por
«Business Profile / Perfil de Empresa / Perfil de Negocio»: **cero en las dos**.
🔴 **Con su control, que es lo que hace que ese cero valga:** en `padkar4@gmail.com`,
`in:anywhere from:google.com newer_than:30d` devuelve **«1–50 de muchas»**, spam incluido. El buzón
recibe correo de Google y se ha mirado; el acuse simplemente no existe.

⚠️ **Lo que NO se puede afirmar todavía.** Que falte la Organization account explica bien que
**no aprueben**; no está probado que explique que no llegue **ni el acuse automático**. Pueden ser
dos causas distintas y conviene no fundirlas. Lo que sí cambia es el orden de trabajo: hasta hoy
la única hipótesis viva eran los 60 días —que **no se pueden fechar desde ninguna interfaz**, o
sea que no son accionables—, y ahora hay una causa **documentada, verificada y accionable**.

⚠️ **Y una lección de método, que es la de siempre por un camino nuevo:** las cinco comprobaciones
del 30 por la mañana (propietario, verificación, web, notificaciones, 60 días) salieron de la
página `prereqs`, y las cinco daban ✅ o ❓. La que faltaba estaba en **otra página** de la misma
documentación (`accounts`), y no se llegó a ella porque la lista que se estaba verificando parecía
completa. **Una lista de comprobación heredada no es un barrido**: es la misma trampa que
`prueba-gbp-visible.js` con sus 44 comprobaciones en verde mirando los archivos equivocados.

📌 **Fuentes** (2026-08-30): `developers.google.com/my-business/content/accounts` ·
`.../content/faq` · `.../content/prereqs` · `support.google.com/business/answer/7353903`
(registro de agencia) · `support.google.com/business/answer/9118250` (mover un perfil a una
organización).

### Revisión del 2026-08-27 — sin acceso, verificado por SIETE vías

`Requests per minute = 0` en **las tres** APIs de GBP habilitadas
(`mybusinessbusinessinformation`, `mybusinessaccountmanagement`, `businessprofileperformance`),
`mybusiness.googleapis.com` sigue sin existir para el proyecto, **cero casos** de asistencia —ni
en el proyecto ni en la organización `didierprincipe-org` (id `1030697741189`)—, las cuatro
notificaciones de la consola son acciones nuestras, y de los **41 correos de google.com de los
últimos 60 días** ninguno habla de Business Profile. No hay respuesta perdida en ningún buzón.

⚠️ **Los dos controles que hacen que ese veredicto valga:** la Biblioteca **sí** carga la ficha de
`mybusinessbusinessinformation`, o sea que el error de la v4 es del proyecto y no del navegador; y
las otras tres cuotas siguen con valores (100 / 200 / 10 000), que es la trampa de siempre. Sin los
controles, «da error» y «no está» se ven igual.

🔴 **El Perfil de Empresa SÍ está verificado, y esta lista decía lo contrario desde hacía semanas.**
En `business.google.com/locations` hay **dos** fichas «Notoria», las dos **Verificadas**, con
`https://usenotoria.app/` cargado. O sea que el bloqueo **no** es la verificación. Pero de abrir la
ficha salieron las tres cosas que sí pueden explicar el silencio, y ninguna se arregla
escribiéndole a Google:

| Qué | Por qué importa |
|---|---|
| 🔴 **El requisito de los 60 días** | Google exige un perfil verificado y activo **60+ días** y con web. La solicitud se envió el **16/08**: si el perfil se verificó después de mediados de junio, no calificaba — y en ese caso Google no contesta, simplemente no aprueba. ⚠️ **Falta el dato de cuándo se verificó**, y el 2026-08-30 se agotaron las vías: no está en la interfaz, el selector de Rendimiento es una ventana móvil de 6 meses que no depende de la edad del perfil, y el correo de verificación no existe en `usenotoria@gmail.com`. Por eliminación es la ÚNICA causa de rechazo documentada que sigue en pie |
| ⚠️ **Dos fichas duplicadas** | «Notoria · Lima, Perú» y «Notoria · Perú». Un duplicado es problema de política para Google. ✅ **Resuelto el 2026-08-27** — ver abajo |
| ⚠️ **Categoría «Servicio de logística»** | No es lo que hace Notoria. Un revisor que abre la ficha y ve una categoría que no cuadra con lo que la API pediría tiene motivo para descartar. ✅ **Resuelto el 2026-08-27**, y no cambiando nada: era la ficha duplicada la que la tenía |

✅ **La ficha buena, y la única que queda: `13273074415378486285` «Notoria · Perú».** Categoría
**Asistencia y servicios informáticos**, descripción completa (702/750), área de servicio **todo
Perú**, sin ubicación (solo servicios), `usenotoria.app` y 955 599 041. 0 reseñas.
🔴 **La duplicada y la de la categoría mala eran LA MISMA** (`02903859902986212295` «Notoria ·
Lima, Perú»: «Servicio de logística», sin descripción, área solo Lima, mismo teléfono y misma web).
Retirarla arregló las dos cosas de un tirón, y **la categoría no hubo que tocarla** — que era
además lo prudente, porque editar una ficha verificada la manda a revisión unos días.
⚠️ Se retira desde el Administrador: seleccionar la fila → **Acciones → Quitar empresa**.

🔴 **CORREGIDO el 2026-08-29: el perfil SÍ tiene presencia pública.** Lo que se escribió el 27 —y
que se conserva más abajo— concluía lo contrario, y mandaba a arreglar algo que no está roto.
Abierto el perfil desde la Búsqueda de Google, sale el **panel de conocimiento**: «Notoria ·
Soporte y servicios informáticos», con sitio web, teléfono y **22 vistas**, marcado como
**«Información completa»**. El Administrador sigue con **una sola ficha y Verificada**, o sea que
el duplicado retirado no volvió.

- 🔴 **Lo que no tiene es PIN EN MAPS, y es lo correcto:** es un negocio de **área de servicio sin
  dirección**. Google no puede colocarlo en el mapa porque no hay dónde ponerlo. Notoria no tiene
  oficinas, así que no debería salir — no es un defecto de la ficha, es lo que la ficha declara.
- ⚠️ **El error fue de método, y es el «404 de control» por un camino nuevo:** ni la búsqueda de
  Maps ni `findplacefromtext` distinguen **«no existe»** de **«existe pero no tiene ubicación que
  mostrar»**. Las cuatro sondas coincidían, y las cuatro compartían el mismo punto ciego — que es
  justo lo que hace que coincidir no pruebe nada. El control que faltaba no era otro teléfono
  indexado (eso solo probaba que la API responde) sino **un negocio de área de servicio sin
  dirección**, que habría dado ZERO_RESULTS estando perfectamente publicado.
- ➡️ **Se cae la hipótesis principal del silencio de Google.** No hay nada que arreglar en la ficha
  antes de reenviar el formulario. Del hilo solo queda el requisito de los **60 días verificado y
  activo**, y ese dato sigue sin estar en la interfaz: Rendimiento da **0 interacciones** en todo
  mar–ago 2026, así que tampoco acota la antigüedad del perfil.
- ⚠️ **Lo que sigue sin comprobarse:** qué ve un visitante **sin sesión**. Todo esto se miró con la
  cuenta que administra el perfil. Las 22 vistas son evidencia de que se mostró a alguien, no una
  medición del panel público.

⚠️ **Y lo que se escribió el 2026-08-27, que resultó ser una lectura equivocada de datos correctos.**
Se conserva porque la lección de método vale más que el error: NO HAY ninguna ficha de Notoria
visible en Maps —Places `findplacefromtext` por teléfono (`+51955599041`) da **ZERO_RESULTS**, la
búsqueda de texto por «Notoria» solo devuelve notarías, y el `cid` del perfil abre un sitio en
blanco en Maps—. Todo eso es **cierto**; lo falso fue la conclusión que se sacó: que el perfil «no
tiene presencia pública» y que por eso difícilmente contaba como activo ante Google.

⚠️ **Lo que NO hay que hacer: pedir un aumento de cuota.** La documentación es explícita —se
reenvía la *Application for Basic API Access*—, y en el foro de desarrolladores hay casos idénticos
de julio y agosto de 2026: solicitud enviada, cero respuesta, cuota en 0. **No es algo nuestro.**
Reenviar el formulario **antes** de cumplir los 60 días es pedir el mismo silencio — y esa es ya
la ÚNICA condición pendiente: la categoría y el duplicado se arreglaron el 27, y la «ficha sin
presencia pública» resultó ser un error de medición nuestro (2026-08-29). Lo envía el dueño: es
una acción hacia fuera.

✅ **Ejecutado el 2026-08-26.** `INSTAGRAM_ACTIVO=true` está puesto y verificado en el
contenedor; la llamada a `suscribirWebhookInstagram()` se retiró (el permiso que necesitaba fue
rechazado, así que no había nada que comprobar: no puede llegar ningún evento).

🔴 **La SEGUNDA solicitud sigue pendiente y su contenido CAMBIÓ.** Lo que dice el borrador de
`docs/app-review-meta.md` §8 hay que corregirlo antes de enviarlo:
- **`pages_read_user_content`** — sigue siendo el permiso que habilita **Facebook Reviews**
  (§8.5). Es este y **no `pages_read_engagement`**, que es lo que se dio por hecho durante meses.
  Hoy está en estándar con 17 llamadas registradas.
- **`business_management`** — sigue en estándar (97 llamadas). Sin él, la página que vive dentro
  de un **portfolio comercial** no aparece en `me/accounts`, que es una de las tres causas
  documentadas de «0 páginas utilizables». Con Instagram ya abierto, este es el fallo que más
  probablemente reporte el primer cliente.
- 🔴 **`pages_manage_metadata` NO se vuelve a pedir.** Meta lo rechazó diciendo que no hace falta
  para la funcionalidad principal, y tenía razón: se pedía para una llamada que no funcionaba y
  que ya se retiró. Volver a pedirlo sin haber cambiado nada es pedir el mismo rechazo, y las
  solicitudes repetidas sin justificación nueva penalizan a la app.

⚠️ **Enviar una solicitud de App Review es una acción hacia fuera y la hace el dueño**, no el
agente: modifica el expediente de la app ante Meta.

El detalle del paquete está en `docs/app-review-meta.md`.

✅ **La segunda solicitud quedó REDACTADA el 2026-08-23** en la §8 de ese documento: los textos
en inglés de los dos permisos listos para pegar, el guion del screencast nuevo (el de la primera
no sirve: no enseña ni una página en portfolio ni una reseña de Facebook), los cuatro puntos que
faltan por terminar en el scraper y el checklist del día del envío. **No se puede enviar
todavía** —Meta no admite una segunda revisión con la primera *in progress*—, así que el día que
aprueben es pegar y darle a Enviar, no empezar a escribir.

**Al aprobar Google:** verificar que la cuota deje de ser 0, habilitar
`mybusiness.googleapis.com` (la v4, que ni aparece en la Biblioteca) y recién ahí probar el
flujo entero.

### B. Solo las puede hacer el dueño (fuera del código)

> ✅ Los dos comandos que esperaban aprobación —el ensayo de alertas y el recordatorio a las
> cuentas sin verificar— **se ejecutaron el 2026-08-23**. Sus resultados están más abajo y en
> §12. No hay que repetirlos.
>
> ✅ **HECHO Y VERIFICADO el 2026-08-29 — la RENOVACIÓN, que era el único tramo del cobro que
> nunca se había ejercitado y el más caro de equivocar.** Se armó a mano el 28 (adelantando el
> vencimiento) y el cron de las 5:00 cobró **solo y desatendido**, que es justo lo que había que
> probar: llamar al cobro a mano habría probado otra cosa.
>
> | Qué | Resultado |
> |---|---|
> | Cargo | `chr_live_s8Kf6bzHHeefEls3` · S/14.50 PEN · **`outcome.type: venta_exitosa`** |
> | Tipo del `Pago` | **RENOVACION**, no INICIAL — entró por la rama correcta |
> | Comprobante | **B001-00000003** · 1450 = gravadas 1229 + IGV 221, **cuadra al céntimo** |
> | Promo | `mesesPromoRestantes` 1 → 0. Ejercitó el **segundo y último mes**, que tampoco se había visto |
> | Vencimiento | vencido el 28/08 → **29/09** |
> | Logs | `[Culqi] Renovación cobrada a revisorculqi@gmail.com` + `[Comprobante] Emitido B001-00000003` |
> | Correo | comprobante `suppressed` al cliente (esa dirección rebota desde siempre) y **copia a contabilidad `delivered`** |
>
> ⚠️ `paid: false` **otra vez** — tercera confirmación en vivo de que ese campo no dice si se cobró.
>
> 🔴 **El vencimiento se calculó desde HOY y no desde el anterior, y es correcto.** El código hace
> `base = fechaVencimiento > ahora ? fechaVencimiento : ahora`: ese `max` con hoy evita que una
> cuenta muy atrasada quede con el vencimiento todavía en el pasado y se le vuelva a cobrar al día
> siguiente. La regla de §8.1 —«desde el anterior, no desde hoy»— gobierna el caso normal; este
> era el otro, y conviene saber distinguirlos antes de leerlo como un fallo.
>
> ⚠️ **Se comprobó además que no arrastró a nadie más**, corriendo el `where` exacto del cron en
> vez de fiarse del log: una sola cuenta cobrada, y `didierprincipe@` —también vencida— descartada
> por no tener tarjeta guardada, que es lo que debe pasar.
>
> ⚠️ **`0 5 * * *` es hora del SERVIDOR (UTC), o sea las 00:00 de Lima**, aunque el comentario del
> worker diga «5:00 AM». La boleta quedó emitida a las 00:00:07 hora peruana, en el primer segundo
> del día. Fiscalmente da igual —`fechaPeru` lo calcula bien y el plazo son 7 días— pero significa
> que **una boleta de renovación siempre espera casi 24 h antes de poder informarse**, porque el
> resumen solo agrupa días ya cerrados.
>
> ✅ **CERRADO el 2026-08-30, y el camino automático salió bien a la primera.** El cron agrupó
> B001-00000003 en `RC-20260830-1` a las **00:10** de Lima y lo envió a las 00:30, con
> `intentosEnvio: 1` y CDR **código 0**. Es la **primera vez que el resumen diario se ve correr
> desatendido**: el 23 y el 28 se había forzado las dos veces, y no forzarlo el 29 —decidido con
> el dueño— es lo que dejó sitio para verlo. Con 7 días de plazo, esperar no costaba nada.
>
> 🔴 **La regla, que sigue valiendo: SUNAT ACEPTA → reembolsar → ANULAR**, dentro de los 7 días
> que corren desde el CDR del resumen. Son dos sistemas distintos; reembolsar en Culqi no anula
> nada ante SUNAT, y una boleta que SUNAT todavía no aceptó no se puede anular. Ejecutado en ese
> orden el 2026-08-30: reembolso `ref_live_gDmxqHjPC4ngRY4J` (S/14.50) → anulación en
> `RC-20260830-2`, aceptada con **código 0** al primer intento, boleta en `ANULADO` el día 1 de 7.
>
> ⚠️ Tras el reembolso la cuenta conserva IMPULSO hasta el 29/09 sin haber pagado, porque
> `iniciarBajadaDePlanes` solo mira vencimientos ya pasados. No inflama el embudo, que cuenta
> `suscripcionActiva`. Se limpió con `node scripts/dar-plan.js revisorculqi@gmail.com GRATIS`.
>
> ⚠️ El webhook de Culqi ya había puesto `suscripcionActiva: false` por su cuenta — se vio en el
> «antes» que imprime `dar-plan.js`, que salió de comprobación gratuita del webhook.
>
> 🔴 ~~Quedó un **resumen vacío** —`RC-20260828-2`, 0 boletas— como poso de haber forzado dos
> veces el 28.~~ **FALSO, corregido el 2026-09-16 leyendo el XML firmado:** `RC-20260828-2` lleva
> **B001-00000002 en estado 3**, o sea que es su **anulación**, y está bien. Los seis resúmenes
> forman tres pares exactos (informa en estado 1, anula en estado 3). El error venía de contar las
> boletas **enlazadas** al resumen: un resumen de anulación no enlaza comprobantes, así que «0» es
> lo que da siempre y no significa «vacío». **Para saber qué lleva un resumen, leer su
> `xmlFirmado`**, no contar relaciones.
>
> **Cargos reales de clientes: sigue siendo cero.**
>
> 🔴 **Nuevo el 2026-08-26 — los DOS screencasts de la segunda solicitud de App Review.**
> La solicitud está armada y guardada en el panel (`submission_id 2252144948952187`) con los dos
> permisos, sus descripciones en inglés, las declaraciones de uso y los 5 de renovación
> certificados. **Solo faltan los vídeos**, que no puede grabar el agente. El guion plano a plano
> está en `docs/app-review-meta.md` §8.3 y en el artefacto del 2026-08-26.
>
> - **Toma A (`business_management`) es grabable ya.** Login → Conexiones → Instagram → Conectar,
>   y que se vea **la página del portfolio apareciendo en el diálogo de Facebook**. Funciona hoy
>   porque el permiso está en estándar y Meta sí se lo pide a quien tiene rol en la app.
> - 🔴 **Toma B (`pages_read_user_content`) NO se puede grabar todavía: la página del dueño no
>   tiene ni una reseña** (`/{page-id}/ratings` → `{"data": []}`, comprobado el 2026-08-23). Hace
>   falta o que le hagan administrador de una página que ya tenga reseñas, o activar
>   Recomendaciones en la de Notoria y conseguir dos o tres reales. **Verificar contra la API
>   antes de grabar**, o se graba dos veces.
> - Si solo sale la A: quitar `pages_read_user_content` del envío y mandar la A sola. Vale la pena
>   igual — es la que arregla el fallo que más probablemente reporte el primer cliente de
>   Instagram, y Facebook Reviews sigue apagado de todos modos.
> - ⚠️ El último paso es del dueño en cualquier caso: revisar **Data handling** (declaraciones
>   sobre los proveedores de datos, prerrellenadas con el envío anterior) y darle a *Submit*.
>
> ✅ **HECHO el 2026-08-28 — el cobro real de IMPULSO, de punta a punta y cerrado.** Cargo
> `chr_live_ke6VcRnUy0XhbvMQ`, boleta **B001-00000002**, resumen RC-20260828-1 ACEPTADO,
> reembolso `ref_live_GzFISGw0csFYkV2k` y anulación por RC-20260828-2. El detalle y las tres
> lecciones que dejó están más arriba, en «Cobro real de IMPULSO».
> ⚠️ **Cobró S/14.50 y no S/29** porque la promo de bienvenida aplicó sola — se supo antes de
> pagar, no después. Lo que quedaba **sin ejercitar** de IMPULSO era la **renovación**, y se
> verificó el **2026-08-29** armando el vencimiento a mano para que el cron la cobrara solo.
>
> 🔴 **Y desde el 2026-08-25 hay que probar además un cobro CON LOCALES ADICIONALES**, que es
> camino nuevo y no se ha ejercitado nunca con dinero real: el importe deja de ser el precio de
> tabla (`montoSuscripcion` suma los extras), `localesExtra` se guarda en el usuario, la
> descripción del cargo cambia, el comprobante sale por el total y —lo que más importa— la
> **renovación** tiene que volver a cobrar los extras el mes siguiente. Ese último tramo es el
> único que no se puede comprobar el mismo día, y es justo el que si falla regala los locales
> para siempre sin que nada avise. Anotar la fecha de vencimiento y mirar el cargo cuando toque.
>
> ⚠️ **Y desde el 2026-08-26 hay un SEGUNDO camino que también cobra y que no es el mismo**: el
> de sumar un local a mitad de periodo (§8.8), que cobra **prorrateado contra la tarjeta
> guardada** en vez de pasar por el widget. Son dos rutas distintas hacia el mismo sitio, así
> que probar una no prueba la otra. La barata de ejercitar es esta: no hace falta contratar
> nada, basta con estar suscrito y pulsar «+». ⚠️ Gasta un correlativo fiscal igual que
> cualquier cobro, así que también hay que anular su boleta si se reembolsa.
>
> ✅ **Respaldo hecho el 2026-08-28** antes de borrar la cuenta de prueba: 2488 filas, 0.76 MB,
> verificado íntegro (`respaldos/notoria-2026-08-28T01-51-01.json`). El anterior fue el 24/08.
> Sigue sin haber cron, a propósito: el archivo lleva datos personales de terceros. Una vez al
> mes basta hoy.
>
> ✅ **Y otro el 2026-08-30, el primero de la PC del taller:** 1926 filas, 0.67 MB, verificado
> con `--verificar` y **0 filas que se perderían** (`respaldos/notoria-2026-08-30T13-08-49.json`).
> La carpeta llegó **vacía** a la máquina nueva, que es lo correcto —los respaldos no viajan, se
> regeneran (`docs/mudanza-de-pc.md` §4)—, pero significaba que durante dos días la única copia
> viva estaba en la PC de casa. Regenerarlo es lo que **cierra** una mudanza, no un extra.
> ⚠️ **Bajó de 2488 a 1926 filas y no falta nada:** el del 28 se tomó **antes** de borrar la
> cuenta de prueba. El detalle, en «Estado de la base de producción» al final de esta sección.
>
> ✅ **DESPLEGADO Y VIVO el 2026-08-31** — `monitor-uptime/`, un Cloudflare Worker con cron real
> cada 5 min, en **`https://notoria-monitor.usenotoria.workers.dev`**. Cierra el pendiente que
> estaba abierto desde el 28/08.
>
> **Comprobadas las DOS mitades, que son cosas distintas:**
> - **Mide**: `GET /` devuelve las dos sondas en verde (API 664 ms, Landing 294 ms) y el cron
>   quedó armado (`schedule: */5 * * * *` en la salida del deploy).
> - 🔴 **Y el aviso LLEGA**, que es lo que de verdad importa y no lo prueba lo anterior:
>   `GET /?correo=1` devolvió `{"ok":true,"motivo":"enviado"}` **y el correo apareció en
>   Recibidos** («Prueba del monitor de Notoria — todo bien»), no en spam. De paso confirma por
>   segunda vía que la ruta `didier@` arreglada el 30/08 entrega de verdad.
>
> ✅ **El KV (`f3322663a76044289ca708e150c7fe8e`) quedó enlazado, y se comprobó FUNCIONALMENTE.**
> Que `env.ESTADO` salga en los bindings del `--dry-run` solo prueba lo que dice el
> `wrangler.toml` local, no lo que corre desplegado. La prueba buena fue **sembrar un estado
> falso** y ver si el Worker de producción lo leía:
>
> ```bash
> wrangler kv key put estado '{"caido":true,"desde":"...","ultimo":"..."}' \
>   --namespace-id f3322663a76044289ca708e150c7fe8e --remote
> ```
>
> La llamada siguiente devolvió **`cambio: "recuperado"`** —que solo puede salir si leyó el KV— y
> mandó el correo de restablecimiento. **La segunda llamada devolvió `sin-cambio` y
> `correo: null`**, que es la regla principal del diseño funcionando: avisa una vez y se calla.
>
> ⚠️ **Cloudflare KV es EVENTUALMENTE CONSISTENTE, y eso confunde al verificar.** Justo después
> de que el Worker escriba, `wrangler kv key get` desde fuera puede devolver **el valor viejo**
> durante hasta ~60 s: parece que no escribió y sí escribió. Lo que lo desmiente es el
> comportamiento —la segunda llamada ya decía `sin-cambio`, o sea que el Worker sí leía el valor
> nuevo—, no la lectura externa. **Al comprobar KV, creerle al comportamiento antes que a la
> lectura.**
>
> ⚠️ **Tres trampas del despliegue en Windows, para no repetirlas:**
> - **PowerShell bloquea `npm.ps1`** por su política de ejecución (*«running scripts is
>   disabled on this system»*). **La salida es usar `npm.cmd` / `npx.cmd`**, que no pasan por
>   esa restricción — **no** cambiar la política del sistema por esto.
> - **npm 11 se saltó los `postinstall` de `esbuild` y `workerd`** y wrangler habría quedado a
>   medias en silencio. Resuelto con `allowScripts` en `monitor-uptime/package.json`, igual que
>   ya se hizo con Prisma y sharp. **No borrarlo.**
> - **El subdominio `workers.dev` se registra en el primer deploy** y su certificado TLS tarda
>   unos minutos: hasta que se emite, `curl` da un error de SSL (código 35) con el DNS ya
>   resolviendo. No es un fallo del Worker; es esperar.
>
> 🔴 **Va en Cloudflare y no en UptimeRobot por dos razones, y la segunda es la técnica.** La
> primera es que **no hace falta crear ninguna cuenta**: Cloudflare ya sirve el DNS y el Email
> Routing del dominio. La segunda pesa más — **es la única de las cuatro piezas que no aloja nada
> del producto** (backend en Railway, web en Vercel, workflow viejo en GitHub). Un monitor que
> vive en la misma plataforma que vigila se cae con ella.
>
> ⚠️ **El workflow de GitHub se queda**, pero no cubre lo que promete: los huecos medidos entre
> pasadas fueron de 28 min a 11 h, y **5,0 h y 5,1 h en las últimas 24 h del 30/08**, con el cron
> intacto. Una vigilancia cada cinco horas produce confianza sin dar cobertura.
>
> **Las dos reglas del diseño, las dos aprendidas de fallos ya cometidos aquí:**
> - 🔴 **Solo se avisa en el CAMBIO de estado.** Un correo cada 5 min durante una caída de tres
>   horas son 36 correos que enseñan a ignorar el remitente — y entonces el aviso de la caída
>   siguiente llega igual que esos 36. Es exactamente lo que hizo el workflow en agosto con sus
>   cinco «Run failed» y el sitio respondiendo 200. Requiere estado, y de ahí el KV.
> - ⚠️ **Se reintenta antes de declarar una caída.** Una sonda que falla una vez no es una caída:
>   es una sonda que falló. Sin eso, cualquier microcorte produce una alarma y una recuperación
>   cinco minutos después — el mismo ruido por otro camino.
>
> ⚠️ **Las sondas comprueban CONTENIDO, no solo el 200**: Railway puede devolver 200 con una
> página de error suya, y un landing que responde 200 con el HTML vacío es el bug que rompió la
> verificación de marca de Google.
>
> ✅ **Probado con su CONTROL, que es lo que hace que el verde signifique algo:** contra
> producción mide 200 en ambas (739 ms y 345 ms); con una URL inexistente y una comprobación de
> contenido imposible devuelve **503**, marca `empieza-caida` y dispara el correo. Un monitor que
> no sabe ponerse en rojo no es un monitor.
>
> ⚠️ **Dos trampas del despliegue, ya resueltas en el repo.** `wrangler` **rechaza un `id = ""`**
> en `[[kv_namespaces]]` con un error que no dice que lo que falta es crear el namespace, así que
> el bloque va **comentado**. Y el `*/5` del cron **no se puede escribir dentro de un comentario
> de bloque de JS**: el `*/` lo cierra y el archivo deja de compilar. Lo cazó la prueba, no la
> lectura.
>
> ✅ **CERRADO el 2026-09-16: `notoria-upload.jks` tiene DOS copias.** La del taller
> (`C:\Users\Taller\notoria-secrets\`, verificada con `keytool`) y la original de la PC de casa,
> de donde se copió en la mudanza junto con `keystore.properties` — confirmado por el dueño.
> ⚠️ **El riesgo que queda es uno solo, y hay que tenerlo presente el día que pase:** si la PC de
> casa se formatea, se vende o se jubila, la segunda copia se va con ella y se vuelve a tener
> una sola. Ese día, antes de soltarla, sacar el `.jks` y su contraseña a otro sitio. Ver
> `docs/secretos.md`, que ordena todos los secretos por «¿qué haría falta para recuperarlo?».

1. ✅ **HECHO el 2026-08-23: cobro real de S/1, emisión a SUNAT producción, reembolso,
   webhook y anulación. El circuito entero, de punta a punta, con dinero de verdad.**

   | Paso | Resultado |
   |---|---|
   | Cargo en Culqi LIVE | `chr_live_NBN9yyL1TufEiX0k` · S/1.00 · `outcome.type: venta_exitosa` |
   | Comprobante | **BOLETA B001-00000001** — gravadas S/0.85 + IGV S/0.15 |
   | Resumen diario | `RC-20260823-1` · ticket `202621700634581` · **ACEPTADO (0)** |
   | Reembolso | `ref_live_62tvV00vQKPBjACB` · S/1.00 |
   | **Webhook de Culqi** | ✅ llegó `refund.creation.succeeded` y dejó el pago en `REEMBOLSADO` |
   | Anulación | `RC-20260823-2` · ticket `202621700702630` · **ACEPTADO (0)** |

   Con esto se cierran **dos** pendientes que llevaban meses: el envío a producción de
   SUNAT (que nunca se había hecho) y el webhook de Culqi (que solo un reembolso real podía
   confirmar).

   ⚠️ **La página y el endpoint del cobro de prueba se RETIRARON el mismo día**, después de
   usarse: un endpoint que cobra a una tarjeta y gasta un correlativo fiscal no se deja vivo
   esperando a que alguien lo llame por accidente. Si hay que repetir la prueba tras tocar la
   facturación, están en el commit **`6129adf`** (`git show 6129adf -- <ruta>`), y en
   `pago.routes.js` quedó la nota que lo recuerda. **Antes de usarlos, correr
   `scripts/sonda-sunat-produccion.js`** — es lo que evitó cobrar con las credenciales rotas.

   Lo comprobado, para no repetirlo:

   - **Culqi** (`railway run node scripts/verificar-culqi-live.js`): las dos llaves son del
     entorno **live**, la secreta autentica, la pública es reconocida, y **el bundle desplegado
     en usenotoria.app usa esa misma llave pública** — que es lo único que detecta un
     `vercel env add` sin `vercel --prod`. Cargos en el entorno live: **0**.
   - **Certificado SUNAT**, abierto de verdad dentro del contenedor (no basta
     `certificado.configurado()`): emisor `ECEP-RENIEC CA Class 1 II`, serie `1f13ed80…`,
     **válido hasta 2029-07-26**, con llave privada presente. `SUNAT_ENTORNO=produccion` y
     `SUNAT_EMISION_ACTIVA=true` confirmados en el contenedor.
   - **La numeración no hay que sembrarla**: `siguienteCorrelativo` crea la serie arrancando en
     1 en la primera emisión, con reintento ante carrera. "Series sin iniciar" es el estado
     normal antes de la primera factura, **no un bloqueo**.
   - `node scripts/prueba-comprobantes.js` pasa entero.
   - **Añadido el 2026-08-22:** el domicilio del emisor **coincide campo por campo con la
     ficha RUC real** (calle, `LA PERLA`, y provincia y departamento `PROV. CONST. DEL
     CALLAO`) — es lo que SUNAT contrasta al recibir el comprobante, y estaba supuesto hasta
     ahora. Además `validarEmisor()` corta antes de pedir correlativo si alguna vez el
     domicilio queda a medias (§9), y `scripts/prueba-emisor.js` lo cubre con 17 pruebas.

   ⚠️ Lo que sigue **sin** probarse contra producción: el envío real a SUNAT. La generación y
   la firma se validaron contra `e-beta` en su momento, pero **nada se ha mandado nunca al
   endpoint de producción**. Ese sigue siendo el riesgo del primer cobro.

   🔴 **Y lo que casi sale mal: SUNAT producción rechazaba nuestras credenciales.** Se
   descubrió con `scripts/sonda-sunat-produccion.js` **antes** de cobrar. Sin esa sonda, el
   cargo habría pasado y el comprobante se habría quedado en `PENDIENTE` para siempre:
   cliente pagado, sin documento y con un correlativo gastado. Ver el detalle abajo.

2. ~~Cambiar el domicilio fiscal en SUNAT.~~ **Cerrado el 2026-08-22 como decisión, no como
   tarea:** el dueño prefiere dejarlo. Ver §15. De paso quedó verificado que el domicilio del
   código **coincide campo por campo con la ficha RUC real** —calle, `LA PERLA`, y provincia
   y departamento `PROV. CONST. DEL CALLAO`—, que es lo que SUNAT contrasta al recibir un
   comprobante.
3. ~~Rotar `META_APP_SECRET`.~~ **Hecho el 2026-08-22** y comprobado contra la Graph API
   (`railway run --service api node scripts/verificar-meta-secret.js`). Se rotó con el App
   Review en curso a sabiendas: la ventana en que el OAuth falla es solo la del redespliegue
   de Railway, 1-2 minutos. ⚠️ **`META_IG_APP_SECRET` NO se tocó, y no debe tocarse**: es con
   ese con el que Meta firma los webhooks de Instagram (§8.3), y hoy **no hay forma de
   validarlo** — la única prueba sería un comentario real, que no llegará hasta que aprueben.
4. ~~Probar el circuito de invitación de equipo.~~ **Hecho el 2026-08-22**, de punta a punta
   y con la base limpiada después — ver §11.
5. ✅ **RESUELTO el 2026-08-23: las respuestas salen del dominio, por el SMTP de Resend.**
   Se creó en Gmail el alias «enviar como» `Notoria <hola@usenotoria.app>`, configurado con
   **`smtp.resend.com:465` (SSL), usuario `resend`** y una **API key de Resend dedicada** —no
   la del backend, para poder revocar una sin tumbar la otra.

   🔴 **La trampa, y por qué no valía el SMTP de Gmail:** ese envío no está en el SPF del
   dominio ni lo firma nuestro DKIM, y con **DMARC en `p=quarantine`** cada respuesta a un
   cliente se habría ido a su carpeta de spam. Gmail ofrece esa opción por defecto en el
   formulario; hay que elegir la de servidor SMTP propio.

   ⚠️ **El ajuste que hace que esto sirva** no es cambiar el remitente por defecto, sino
   marcar **«Responder desde la misma dirección a la que se envió el mensaje»**. Con eso, lo
   que llega a `hola@` se responde desde `hola@` y el correo personal del dueño no cambia.
   Funciona porque el Email Routing de Cloudflare conserva la cabecera `To:` al reenviar.

   **Verificado cruzando las dos puntas**, que es la única forma que vale acá:
   - El correo de prueba **aparece en el historial de Resend** (`delivered`). Uno enviado por
     el SMTP de Gmail nunca aparecería ahí, así que eso solo ya prueba la ruta.
   - Y en la cabecera recibida: `dkim=pass header.i=@usenotoria.app header.s=resend` ·
     `spf=pass` con `smtp.mailfrom=…@send.usenotoria.app` (IP 23.249.215.54, del rango de
     Resend que ya salía en los informes DMARC) · y sobre todo **`dmarc=pass
     (p=QUARANTINE)`** — que es exactamente lo que había que demostrar.

   ⚠️ Estos envíos consumen cuota de Resend como cualquier otro. Con el volumen actual, nada.

6. ~~**Webhook de Culqi**: solo un reembolso real puede confirmarlo.~~ ✅ **Confirmado el
   2026-08-23** con el reembolso `ref_live_62tvV00vQKPBjACB`: llegó
   `refund.creation.succeeded` y dejó el pago en `REEMBOLSADO`. Ver el punto 1.
7. **Cuando el correo de la empresa reemplace al personal en Google Cloud:** agregarlo como
    **propietario** del proyecto `798376364749`, cambiarlo en *Información de la marca →
    correo de asistencia* y en *Contacto del desarrollador*, y **recién entonces** quitar la
    personal. Al revés se lleva el proyecto que contiene el `GOOGLE_CLIENT_ID` de producción.

### C. Decisiones de negocio

- **Proveedor de datos para las menciones de TikTok** (~US$100/mes): sería el primer costo
  variable por cliente.
- ~~**Facebook Reviews**~~ → ✅ **Implementado y PROBADO CONTRA LA API REAL el 2026-08-23**
  (§8.5). El día que Meta conceda `pages_read_user_content` para clientes se pone
  `FACEBOOK_ACTIVO=true` en Railway y se abre para todos sin desplegar.
  ⚠️ Lo único que queda sin ver es **la forma de un `Recommendation` real**: la página del
  dueño no tiene reseñas. No bloquea nada —el resto está verificado— pero si algún día hay a
  mano una página con reseñas, es una llamada de treinta segundos que cierra el cabo.
- **TripAdvisor**: activar cuando haya masa de hoteles.
- ~~Borrar `Usuario.telegramChatId`.~~ **Hecho el 2026-08-22.** ⚠️ **Nunca debería haber
  estado en esta lista:** al ponerlo junto a contratar un proveedor de ~US$100/mes y activar
  TripAdvisor, parecía que había algo comercial que valorar. Era limpieza técnica de una
  columna vacía. Lo correcto de aquella nota era **no ejecutarla sin permiso** —toca
  producción—, no llamarla decisión de negocio.

### D. Se pueden hacer solas, pero necesitan tiempo o datos

✅ **RESUELTO el 2026-08-25 — lo que quedaba cableado a medias.**

Las cuatro librerías nuevas se escribieron **puras y en el backend a propósito**, precisamente
para que pudieran usarse desde más de un sitio. Hoy cada una alimenta solo la pantalla para la
que se hizo. Nada está roto y nada urge; simplemente el trabajo caro ya está hecho y lo que
falta es enchufarlo:

| Pieza | Dónde está ahora |
|---|---|
| `lib/score.js` | Ficha · **correo semanal** · **PDF mensual** · **constancia** (y su página de verificación) |
| `lib/temas.js` | Afiche, panel, parte · **correo semanal**, con la queja más repetida y si va en aumento |
| `lib/impacto.js` | Analizador público · **panel del cliente** (pestaña Resumen) |
| `lib/parteEquipo.js` | Ficha · **dentro del correo semanal** |

🔴 **La decisión que el pendiente dejaba abierta, resuelta: el correo NO llama a Groq.** Meter
el parte en el correo significa generarlo para TODOS los negocios con material cada semana, no
solo para los que alguien abre — o sea multiplicar la factura de Groq por el número de negocios
activos, todas las semanas, para siempre. El correo usa el **caché del panel si está fresco** y
si no la **`plantilla()`**, que sale de los mismos hechos contados por el código y es el mismo
respaldo que ya entra cuando Groq devuelve 429. El techo sigue siendo «una llamada por negocio y
por semana **solo si alguien lo mira**».

🔴 **Y un fallo mudo que apareció al enchufarlo: el parte habría salido VACÍO siempre.**
`parteEquipo.hechos()` vuelve a filtrar por fecha sobre los objetos que recibe, y el `select` del
correo semanal traía solo `rating` y `texto`: `new Date(undefined)` → NaN → descartaba **todas**
las reseñas. El correo se manda, se entrega, y sencillamente no lleva parte nunca. Es el mismo
error que ya tuvo `idioma` en el select de las alertas (§12), por tercera vez y por otro camino.
⚠️ **Al pasarle reseñas a una librería que vuelve a filtrar, mirar qué campos necesita ELLA**, no
solo los que usa el `where`.

⚠️ Otras dos que dejó el cableado: el score de la constancia va **solo si existe** (`null`, no 0 —
un «0 de 100» impreso en un documento que va a un banco es una acusación, no un dato faltante), y
las constancias emitidas **antes** siguen siendo válidas porque la firma se recalcula sobre el
payload tal cual. Y el alto del recuadro de la constancia ahora se **deriva** del número de filas:
estaba escrito a mano para exactamente cinco y la sexta caía justo sobre el borde.

### E. Aplazados a propósito — decididos, pero no ahora

No están aquí por olvido ni por bloqueo: **se decidió no hacerlos todavía**. Lo que ya
estaba preparado sigue preparado; al retomarlos no hay que rehacer nada.

**Publicar la app en Google Play** — aplazado el 2026-08-22 por decisión del dueño, que
prefiere esperar. Todo lo preparable está hecho y verificado, así que retomarlo es empezar
por el paso 1 de esta lista, no por el principio:

**Lo que ya está hecho.** Todo lo preparable **ya está hecho y verificado** (2026-08-22):
   `NotoriaApp/PLAY-CONSOLE.md` tiene las respuestas del formulario de Seguridad de los
   Datos derivadas del código, la ficha de tienda con los textos contados, y el estado del
   paquete comprobado —el keystore **abre con su contraseña** (RSA 4096, válido hasta 2054),
   el AAB pasa `jarsigner -verify`, `targetSdk 36`, tres permisos y **cero SDKs de
   terceros**—. Lo que falta necesita a una persona:
   - ✅ ~~Respaldar `notoria-upload.jks` y su contraseña fuera de esta PC.~~ **Cerrado el
     2026-09-16**: hay copia en la PC del taller y en la de casa. (Tras la primera subida, Play
     App Signing vuelve recuperable la clave de subida; hasta entonces, esas dos copias son todo.)
   - Decidir **personal vs organización** (organización pide D-U-N-S, gratis pero lento) y
     pagar los **US$25**.
   - Icono 512×512, gráfico destacado 1024×500 y capturas — ⚠️ **con datos anonimizados**,
     igual que las del landing.
   ⚠️ **La app no lleva Google Sign-In nativo** (los OAuth abren el navegador), así que el
   SHA-1 del keystore **no hay que registrarlo en ninguna parte**: el fallo clásico de
   "Google firma con su clave, cambia el SHA-1 y nadie puede entrar" no aplica aquí.

⚠️ Al retomarlo, **volver a comprobar el keystore antes de nada** (`keytool -list -v`): si
esa clave se perdiera durante la espera, no hay app que publicar. Y releer los requisitos de
alta en la consola, que Google los cambia.

🔴 ~~**Desde el 2026-08-30 eso exige un paso previo: la PC del taller no tiene JDK ni Android
SDK.**~~ ✅ **FALSO desde el 2026-09-16: los dos ESTÁN instalados**, en
`C:\Users\Taller\dev-tools\` (`jdk-17.0.20.1+1` y `android-sdk`). Se pusieron para la prueba en
el teléfono del 05/09 y esta sección no se enteró. O sea que **el AAB sí se puede reconstruir** y
publicar en Play ya no tiene paso 0 de entorno.
- Comprobado ejecutándolos, no mirando el archivo: `keytool` responde y `adb` da **1.0.41**.
- ✅ **Y el keystore quedó verificado con el `keytool` de verdad**, no ya con el apaño de
  node-forge: alias `notoria-upload`, `CN=NOTORIA E.I.R.L.`, RSA 4096, válido hasta 2054-01-02,
  SHA-1 `B5:74:06:…:56:BF` — **idéntico** a lo que registró el 31/08 por la otra vía, y la huella
  del archivo sigue siendo `d3480fa3…`. Dos métodos independientes y el mismo resultado.
- La receta, que vive en `NotoriaApp/PENDIENTES.md` y por eso no se encontró desde acá:
  `JAVA_HOME="/c/Users/Taller/dev-tools/jdk-17.0.20.1+1" ./gradlew.bat assembleDebug`.
- ⚠️ **La lección es la que este archivo ya se había hecho el 09/09 con `next build`, otra vez:**
  un fallo de entorno comprobado UNA vez y escrito como estado del sistema envejece mal. Este
  llevaba **17 días** declarando bloqueado un camino que estaba abierto, y encima el dato correcto
  estaba escrito en el OTRO repo. Antes de dar por vigente una carencia de la máquina, ejecutar la
  herramienta.

✅ **Pero COMPROBAR el keystore sí se puede sin JDK, y el 2026-08-31 se hizo.** Esta nota decía
que la comprobación «hoy no se puede hacer», y era falso: un `.jks` moderno es **PKCS#12** (los
magic bytes son `30 82`, no `feedfeed`), y `node-forge` —que ya está instalado para el
certificado de SUNAT— lo abre igual que `keytool`. Diez líneas de Node bastan:

```js
const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), clave);  // lanza si la clave es mala
```

Resultado: **abre con su contraseña**, llave privada presente, `NOTORIA E.I.R.L.`, RSA 4096,
válido hasta 2054-01-02, SHA-1 `B5:74:06:…:56:BF`.
🔴 **Importa porque «tener copia no es saber restaurarla»**, y hasta ese día nadie había
verificado que el archivo abriera de verdad. Faltar la herramienta no era lo mismo que no poder
comprobarlo — y dar por imposible una comprobación de un secreto de nivel 1 durante una espera
indefinida es justo el caso en que hay que buscar la segunda vía.
⚠️ Huella del archivo, para verificar cualquier copia:
`d3480fa32539a5ac2dcdd35a178013eb5e8bedc7efd40a6fcadc60cdef9d15ee` (4456 bytes).
⚠️ Lo que sí viajó es lo que no se puede regenerar: el `.jks` vive en la carpeta
`notoria-secrets` del taller y `keystore.properties` ya apunta ahí, comprobado. Falta la
herramienta, no la clave — y de las dos, la herramienta es la que se arregla descargando algo.

### Estado de la base de producción (última lectura, 2026-09-22)

`11 usuarios · 8 negocios activos · **2206 snapshots** · 152 reseñas · **6 alertas, 0 sin
notificar** · 3 pagos · 3 comprobantes (los tres ANULADO) · **0 en cola de SUNAT**`.

✅ **La sexta alerta es REAL y disparó sola**, como las cinco anteriores: entró **1 reseña de
≤2★** en los últimos 7 días y la alerta salió notificada. Es el par de números que conviene
mirar junto —reseñas negativas nuevas contra alertas creadas—, porque su divergencia es lo que
destapó el agujero del 2026-08-22.

🔴 **De las 11 cuentas, 6 están dormidas** (3 `INACTIVA`, 3 `SIN_VERIFICAR`) y eso saca **4
negocios activos** del barrido. Es exactamente lo que §8.9 predijo el 19/09, o sea que la
palanca aplica. Ninguna cuenta de pago tocada.
⚠️ **Y dos de esas dormidas son del propio dueño** (confirmado el 22/09), así que el análisis
del 19/09 que llamó «zombis» a las 4 cuentas gratuitas con negocio activo estaba contando
**dos cuentas propias**. El padrón real de gratuitos es la mitad de lo que parecía — no cambia
la aritmética del costo por cuenta, cambia cuántas cuentas ajenas hay de verdad.

⚠️ **Aparece `malena@usenotoria.app` con plan NEGOCIO**, que no figuraba en las lecturas
anteriores de este archivo. Es del dominio propio, o sea del dueño; se anota para que nadie la
lea algún día como el primer cliente de pago. **Cargos reales de clientes: sigue siendo cero.**

⚠️ **El último respaldo es del 2026-09-16** y los snapshots pasaron de 2043 a 2206. No es
urgente —la cadencia de una vez al mes sigue bastando— pero los snapshots son lo único
irrecuperable que tiene Notoria.

#### Lectura anterior (2026-09-16)

`11 usuarios · 12 negocios · **2043 snapshots** · 135 reseñas · 5 alertas · 5 competidores con
220 snapshots · **2 comentarios sociales** · 3 pagos · 3 comprobantes · 6 resúmenes SUNAT ·
1 promo_tarjeta · 0 miembros · 0 invitaciones · 0 reclamaciones · 0 menciones`.

✅ **Respaldo del 2026-09-16 verificado**: 2453 filas, 0.83 MB, **0 filas que se perderían**
(`respaldos/notoria-2026-09-16T20-06-01.json`). El anterior fue el 09/09.

⚠️ **Reaparecieron 2 comentarios sociales, y el 09/09 había 0.** Son de la conexión de TikTok que
vive en «Don Tito San Miguel»; §19 daba por hecho que esa cuenta no produciría nada porque no
tiene videos **públicos**, así que o publicó alguno o la lectura vieja se hizo con la conexión
dormida. No es un fallo — es la rama del worker haciendo su trabajo— pero conviene saber que ese
0 ya no describe el sistema.

✅ **Reseñas nuevas desde el 09/09 y alertas quietas en 5: comprobado, y es lo correcto.** Entraron
**21 reseñas y NINGUNA de ≤2★** (15 de 5★, 5 de 4★, una de 3★), así que no había nada que alertar.
Se miró porque es justo el par de números cuya divergencia destapó el agujero del 2026-08-22
(1783 escaneos y CERO alertas). ⚠️ **La consulta que lo zanja** agrupa por `rating` las reseñas
con `detectadaEn` en el periodo — `detectadaEn`, no `fechaResena`: una reseña vieja detectada hoy
es nueva para nosotros, y el silencio por antigüedad es el que decide si avisa.

⚠️ **Cargos reales de clientes: sigue siendo cero.** Los 3 pagos y los 3 comprobantes son las
pruebas del dueño, los tres REEMBOLSADO y los tres ANULADO.

#### Lectura anterior (2026-09-09)

`11 usuarios (3 sin verificar, 0 con idioma 'en') · 12 negocios (8 activos, 10 place IDs
distintos) · 1841 snapshots · 116 reseñas (13 de ≤2★) · **5 alertas, 0 sin notificar** ·
5 competidores con 195 snapshots · 3 pagos (los tres REEMBOLSADO) · 3 comprobantes
(B001-00000001/2/3, los tres ANULADO) · 6 resúmenes SUNAT · 1 promo_tarjeta · 0 miembros ·
0 invitaciones · 0 reclamaciones · 0 menciones · 0 comentarios sociales ·
**0 cuentas con locales extra**`.

⚠️ **Los usuarios subieron de 10 a 11 aunque hoy se borró una cuenta**, o sea que entraron **dos
altas nuevas** desde el 30/08 — y las dos verificaron, porque las sin verificar bajaron de 4 a 3
(las mismas de antes menos la borrada). Es el primer crecimiento del padrón que no viene de una
cuenta de prueba del dueño.

⚠️ **`dhazzez15@gmail.com` se borró hoy** (sin verificar desde el 17/08): con ella se fueron 2
negocios y 26 snapshots. El respaldo se tomó **antes**, a propósito. Es la misma explicación que
la caída del 28/08, y se anota por lo mismo: la serie de snapshots es lo único irrecuperable que
tiene Notoria, así que el día que encoja **sin** explicación hay que alarmarse — y para eso las
caídas explicables no pueden quedar sin explicar.

⚠️ **`0 con idioma 'en'`, y antes había 1.** Era la cuenta del dueño; cambió su panel a español.
No es un fallo, pero significa que **hoy no queda ninguna cuenta que ejercite el lado inglés de
los correos**: si algo se rompe ahí, ya no lo va a ver nadie por accidente. Las suites de idioma
son la única red que queda.

⚠️ **Las 5 alertas están todas `notificada: true`**, o sea que el acumulador del lote arranca
limpio: la primera reseña negativa que entre en una cuenta gratuita empezará a contar desde 1.
La quinta alerta es real, como las cuatro anteriores.

⚠️ **0 comentarios sociales**, y el 24/08 había 2. Se fueron con el borrado de la cuenta de prueba
del 28/08 (los de hoy no tenía ninguno: el simulacro lo dijo antes de borrar). La conexión de
TikTok sigue viva en «Don Tito San Miguel» y no produce nada porque la cuenta no tiene videos
públicos — que es lo esperado, no un fallo.

✅ **Los tres comprobantes están ANULADOS y ninguno es de un cliente.** La serie B001 va por el
correlativo 3, gastado entero en las tres pruebas de cobro. **Cargos reales de clientes: cero.**

#### Lectura anterior (2026-08-30)

`10 usuarios (4 sin verificar, 1 con idioma 'en') · 13 negocios (8 activos, 12 place IDs
distintos) · 1612 snapshots · 96 reseñas (14 de ≤2★) · **4 alertas** · 2 competidores con 174
snapshots · 3 pagos (S/1 + S/14.50 + S/14.50, los tres REEMBOLSADO) · 3 comprobantes
(B001-00000001/2/3, los tres ANULADO) · 6 resúmenes SUNAT · 1 promo_tarjeta · 0 miembros ·
0 invitaciones · 0 reclamaciones · 0 menciones · **0 cuentas con locales extra**`.

🔴 **Los totales BAJARON respecto al 25/08 y no se ha perdido nada.** El 28 se borró la cuenta
de prueba y con ella se fueron sus negocios, sus snapshots y un competidor; el respaldo se tomó
justo antes, a propósito.

⚠️ **Las alertas van por 4, y las dos nuevas también son REALES:** KFC el 26/08 y La Mar otra
vez el 29/08, las dos `RESENA_MUY_NEGATIVA` y las cuatro con `notificada: true`. El circuito
lleva una semana disparando solo, sin un ensayo de por medio.

#### Lectura anterior (2026-08-25)

`11 usuarios (4 sin verificar, 1 con idioma 'en') · 15 negocios (10 activos, 9 place IDs
distintos) · 1845 snapshots · 92 reseñas (14 de ≤2★) · **2 alertas** · 3 competidores con 433
snapshots · 1 pago (S/1, REEMBOLSADO) · 1 comprobante (B001-00000001, ANULADO) · 2 resúmenes
SUNAT · 0 miembros · 0 invitaciones · 0 reclamaciones · 0 promo_tarjetas · 0 menciones ·
**0 cuentas con locales extra**`.

🔴 **Las 2 alertas son la noticia, y son REALES.** El aviso por reseña negativa disparó **solo**,
sin ensayo y sin que nadie lo provocara:

| Cuándo | Negocio | Qué entró |
|---|---|---|
| 2026-08-23 22:00 | Don Tito San Miguel | 1★ por una entrega de delivery de 100 minutos |
| 2026-08-25 01:00 | La Mar Restaurante | 1★ por una intoxicación alimentaria |

Las dos con `notificada: true`, o sea que el correo salió. Eso **cierra la historia que abrió el
2026-08-22**, cuando la foto decía «1783 escaneos, 12 reseñas de ≤2★ y CERO alertas desde que
existe la plataforma». No fallaba nada entonces y no hacía falta nada más que la señal que se
añadió ese día: en cuanto entró una reseña negativa *nueva* de verdad, el circuito completo
—detección, fila de `Alerta`, correo— funcionó sin que nadie lo tocara.

⚠️ Y confirma de paso que el silencio anterior era el diseñado, no un fallo: las 12 reseñas
viejas siguen calladas por antigüedad, exactamente como se pretendía.

#### Lectura anterior (2026-08-24)

`11 usuarios (4 sin verificar, 1 con idioma 'en') · 15 negocios · 1839 snapshots · 89 reseñas ·
1 alerta · 3 competidores con 431 snapshots · 1 pago (S/1, REEMBOLSADO) · 1 comprobante
(B001-00000001, ANULADO) · 2 resúmenes SUNAT · 2 comentarios sociales · 0 miembros ·
0 invitaciones · 0 reclamaciones · 0 promo_tarjetas · 0 menciones`.

✅ **Primer respaldo hecho y verificado el 2026-08-24**: 2397 filas, 0.72 MB, íntegro y con 0 de
deriva (`scripts/respaldo.js`).

📊 **Lo que dice el embudo hoy** (`scripts/embudo.js`): la caída más grande son **7 cuentas entre
«le entraron reseñas» y «recibió una alerta»**. Y **2 suscripciones vivas con 0 cobros** — son los
planes concedidos a mano al dueño, no clientes. Cargos reales en Culqi live: **0**.

#### Lectura anterior (2026-08-23)

`11 usuarios (4 SIN VERIFICAR, 1 con idioma 'en') · 15 negocios (10 activos, pero solo 9 place
IDs distintos) · 1813 snapshots · 85 reseñas (12 de ≤2★, 11 sin responder) · 0 alertas ·
1 pago (S/1, REEMBOLSADO) · 1 comprobante (B001-00000001, ANULADO) · 2 resúmenes SUNAT (los dos
ACEPTADOS) · serie B001 en 1 · 2 comentarios sociales · 3 competidores con 422 snapshots ·
0 miembros · 0 invitaciones · 0 reclamaciones · 0 promo_tarjetas · 0 menciones`.

🔴 **Las 0 alertas del 2026-08-23 NO son un bug, y perseguirlas costó media mañana bien
gastada.** El aviso por reseña negativa se desplegó el día 22 y **el contenedor lo tiene**
(comprobado con `railway ssh … grep -c alertarResenaNegativa`). Sigue en cero porque desde el
deploy no ha entrado ninguna reseña de ≤2★ *nueva*: las 12 que hay están silenciadas a propósito
por antigüedad. Se descartó también que fallara `CAIDA_RATING`: el único movimiento de rating en
49 días (Geyser 4.1→4.0, el **31 de julio**) es **anterior** al commit `0b2a896` del 17 de agosto
que introdujo la comparación contra el snapshot anterior.

✅ **La cadena de alertas quedó VERIFICADA EN VIVO el 2026-08-23** con
`scripts/ensayo-alertas.js --aplicar` sobre un negocio del dueño: **4/4 correctos** — la reseña
de 1★ reciente creó la fila, la notificó y **el correo llegó `delivered`**; los tres silencios
(reseña de 60 días, 3★, primer barrido) callaron. La alerta de ensayo se borró y la tabla quedó
en 0. El correo llegó además **en inglés** —asunto *«1★ review on Don Tito San Miguel»*—, que es
lo que cierra el fallo de `idioma` de arriba en la única cuenta que lo tiene puesto.

✅ **Las otras cinco señales quedaron verificadas en vivo el mismo día** con
`scripts/ensayo-detector.js --aplicar`: **21/21 correctos** — caída de rating, ráfaga por
volumen, campaña coordinada, pico por conteo y ficha alterada, cada una con su control negativo,
y la base limpia al terminar. El correo de `FICHA_ALTERADA` llegó `delivered` y **en inglés**,
que confirma el arreglo de `idioma` por un camino distinto (esa va por `enviarAlertaEmail`
directo, sin pasar por `notificar()`).

🔴 **Y encontró un bug que solo se ve ejercitando: una alerta con estrellas NEGATIVAS.** El
mensaje decía *«Calificaron **-0.9★** de promedio como mucho»*. La causa era una asimetría en
`compararMediciones`: `promedio` y `min` se acotaban a un mínimo de 1 y **`max` solo tenía tope
por arriba**, así que el techo salía por debajo del suelo. Pasa cuando la aritmética es
imposible — y lo es de verdad cada vez que **Google borra reseñas** mientras entran otras (está
medido: una ficha pasó de 11 a 10 el 31 de julio), porque el despeje asume que las viejas siguen
ahí.
⚠️ **Recortar `max` a 1 NO era el arreglo**: afirmaría «como mucho 1★» cuando la realidad pudo
ser 4★ y solo hubo un borrado. Lo correcto es **no dar cifra** cuando el intervalo estimado no
toca el rango posible \[1,5]; el aviso sale igual, apoyado en la caída publicada, que sí es un
hecho observado. Es la regla de «nunca un número inventado» aplicada al caso en que el número
es, además, imposible.

**Lo que esa foto confirma que funciona**, medido y no supuesto:
- **La cadencia por plan es exacta.** Contando snapshots de los últimos 3 días: los negocios
  de plan GRATIS generan **1,0 al día** y los de NEGOCIO **6,0** (cada 4 h). El fix de
  `HORAS_ESCANEO` hace lo que promete.
- El escaneo corre al día (snapshots de la hora en curso) y los correos del producto se
  entregan (el registro de Cloudflare muestra *"Alerta en KFC — Notoria"* reenviado).
- **Lo que reveló:** 1783 escaneos con **0 alertas**. De ahí salió `alertarResenaNegativa`
  (§12). Es el ejemplo de por qué esta foto se toma: ningún log decía nada.
- ⚠️ **4 de los 11 usuarios no han verificado su correo** (relectura del 2026-08-23):
  `mchb389@` y `josephsalas108@` desde el **5 de julio**, `cehakax956@careney.com` —una
  dirección desechable— desde el 11 de agosto, y `dhazzez15@` desde el 17. **Dos de ellos ya
  tienen negocios cargados** (1 y 2), o sea que llegaron lejos y aun así no activaron. El drip
  **solo va a verificados**, así que ese tercio del padrón no recibía absolutamente nada. Ya hay
  cron de recordatorio (§13) — pero solo alcanza a las cuentas de menos de 10 días, así que a
  estas cuatro se las recuperó a mano con `scripts/recordar-verificacion.js --aplicar`.
  ✅ **Hecho el 2026-08-23: los 4 correos salieron y los 4 figuran `delivered`** en Resend, cada
  uno con su cuenta de días correcta («hace 49 días», «hace 11», «hace 6»). Lo que pase ahora ya
  no depende de nosotros. **No repetirlo**: el espaciado de 4 días lo bloquearía igual, pero
  insistir más allá de eso es spam.
  Confirmado el 2026-08-20 por otra vía: Culqi reporta **0 cargos** en el entorno live. Las cuentas con plan NEGOCIO concedido a mano (`didier@usenotoria.app`,
`didierprincipe@gmail.com`) **son del dueño**, no tocarlas.

### 🔴 Cuatro fallos que solo se vieron ABRIENDO el panel (2026-08-24)

El mismo día, tras desplegar el plan Impulso y el panel accionable, **451 pruebas en verde, el
build limpio y la consola sin un error**. Los cuatro fallos siguientes estaban en producción y
ninguna de esas tres cosas los vio. Se encontraron mirando la pantalla.

| Qué se veía | Qué pasaba |
|---|---|
| La barra lateral decía **`NEGOCIO`** en crudo | Al centralizar los nombres, `PLAN_LABELS` pasó de mapa a **función**, y el call-site seguía indexándola con un string. `PLAN_LABELS[plan]` da `undefined` y el `\|\| usuario.plan` de reserva lo tapaba pintando el enum |
| Dos tarjetas estrechas y medio panel en blanco | La rejilla del Resumen es `auto-fit,minmax(280px,1fr)` → cinco columnas en un monitor ancho, y **`auto-fit` no colapsa las pistas** porque la tarjeta del score las ocupa todas con `gridColumn:'1/-1'`. Medido: **313px en un contenedor de 1619px** |
| La **misma cita** debajo de tres temas seguidos | Una reseña toca varios temas a la vez («el pollo es extremadamente pequeño, me sentí estafado» es porción Y precio). Correcto, y se lee como un fallo |
| El cartel de la promo anunciaba **dos planes de tres** | Los importes estaban escritos a mano: una **quinta copia** de los precios. Y era el único bloque en español de una pantalla en inglés |

🔴 **Los cuatro fallan SUAVE**, que es el patrón: hay un valor de reserva, o el CSS es válido, o
el dato es correcto pero se repite. Nada lanza. Por eso ninguna prueba los caza y la consola
está limpia.

⚠️ **La regla que dejan: un cambio que toca lo que se VE no está verificado hasta que alguien lo
mira.** Las pruebas cubren el contrato entre piezas; la pantalla es otra cosa. Y dos de los
cuatro los introdujo justamente la centralización que arreglaba otro problema — mover algo a
fuente única cambia su forma (mapa → función), y los call-sites viejos siguen compilando.

⚠️ **Al convertir un mapa en función, buscar los `[` que lo indexan.** `grep -rn "NOMBRE\["` es
literalmente todo lo que hacía falta.

### 🔴 Cuatro fallos que solo se vieron ABRIENDO la página (2026-08-29)

Tercera vez que pasa esto, después del 24 y del 25, y **con la misma forma exacta**: la suite en
verde (81 comprobaciones en `prueba-planes.js`), el build limpio, la consola sin un error, y cuatro
fallos en producción que solo aparecen mirando. Los cuatro **fallan suave**: hay un valor de
reserva, o el enlace va a un sitio válido, o la ruta contesta un 403 correcto. Nada lanza.

| Qué se veía | Qué pasaba |
|---|---|
| El landing decía **«Plan actual» sobre el Gratuito** a un cliente que paga | El CTA se decidía por el ÍNDICE: `i===0 ? ctaActual : ctaUpgrade`. A cualquiera con sesión le señalaba el gratuito como suyo y «Actualizar» sobre el plan que ya pagaba |
| «Escaneo programado cada **1, 4 o 24 horas**» | Se comió las **12 h de IMPULSO**, en los dos idiomas, desde el 24/08 |
| El panel ofrecía **«Menciones» a una cuenta IMPULSO** | El nav no gateaba por plan; la ruta sí (403). Una puerta cerrada — ver abajo, es el más interesante |
| Al responder una reseña, el panel decía **«copiada»** aunque el backend fallara | No se miraba `res.ok`. La respuesta no se guardaba y el usuario se iba convencido de que sí |

🔴 **El de Menciones es el que deja la lección, porque nadie lo introdujo: lo destapó encender otra
cosa.** El nav se apoyaba, sin decirlo en ninguna parte, en que Instagram estuviera **apagado**: con
la única fuente oculta, `hayFuenteDisponible` daba `false` para todos y Menciones no se veía. Al
poner `INSTAGRAM_ACTIVO=true` el 26/08 esa muleta desapareció y quedó a la vista que **el gating por
plan nunca existió en el nav**. El propio comentario del código documentaba la suposición que se
rompió — *«para el resto no hay ninguna fuente encendida, así que Menciones vuelve a estar
invisible»*.
- ⚠️ **La regla que deja: encender un interruptor puede DESTAPAR un hueco, no solo abrir una
  función.** Al activar algo que llevaba tiempo apagado, mirar qué otras decisiones se estaban
  apoyando en ese apagado.
- El arreglo mira `req.cuenta.plan`, no `req.usuario.plan`, igual que `verificarPlan`: quien paga es
  la empresa, y preguntar por la persona le escondería la sección al invitado de una cuenta que sí
  la tiene contratada.

⚠️ **Y el del `res.ok` es el `.catch(console.error)` otra vez, por un cuarto camino:** decirle al
usuario que algo salió bien sin haberlo comprobado. Junto a él había un segundo agujero en el mismo
bloque — el destino se construía desde `negocio.googlePlaceId` **sin mirar la plataforma de la
reseña**, así que una reseña de FACEBOOK abriría Google Maps en cuanto el negocio tuviera ficha de
Google. Hoy no se nota porque Facebook sigue tras interruptor; el día que se encienda no habría dado
ninguna señal. El backend ya calculaba el enlace correcto en `linkRespuesta` y el frontend lo tiraba.

✅ **Lo que ahora los vigila:** `prueba-planes.js` pasó de **81 a 109 comprobaciones**, con dos
bloques nuevos que **leen el fuente** — el 12 ata las tarjetas del landing al orden y a la cadencia
de cada plan (y falla si el CTA vuelve a mirar el índice), y el 13 comprueba que el nav y la ruta de
menciones digan lo mismo plan por plan. Los dos **llevan su control**, y se comprobó que saben
fallar: reintroduciendo los bugs, el bloque 12 caza 3 comprobaciones y el mensaje dice exactamente
qué texto está mal.

⚠️ **Lo que el repaso NO cubrió, para que no se dé por hecho:** el panel en **móvil**, el panel en
**inglés**, el FAQ y el pie del landing, y el flujo de registro/onboarding con una cuenta nueva.
Se revisaron landing, `/precios` y la pantalla de inicio del panel, en escritorio y en español.

✅ **CERRADO el 2026-08-30 — un cliente en mensual ya puede pasarse a anual.** Era el último hueco
de producto conocido: `esActual` comparaba **solo el plan**, así que a un cliente de IMPULSO
mensual le marcaba «Es tu plan actual» también sobre el **anual** y le dejaba el botón apagado —
no tenía por dónde contratar lo que más conviene vender.

🔴 **La decisión de cobro, tomada con el dueño: se cobra el anual completo HOY y el vencimiento se
SUMA al que ya tenía, no arranca de cero.** Se descartaron las otras dos con los números delante:
prorratear es lo más exacto al céntimo pero añade aritmética nueva a un camino que emite
comprobantes fiscales, y aplicarlo al vencer retrasa la caja hasta un mes y da tiempo a
arrepentirse.

⚠️ **Lo que hacía falta tocar eran TRES sitios, y el tercero es el que costaba dinero:**
1. `auth.routes.js` — el perfil no devolvía `periodoFacturacion`, así que el panel ni siquiera
   podía distinguir mensual de anual. Sin esto lo demás no se puede ni intentar.
2. `precios/page.js` — `esActual` compara ahora plan **y** periodo, y el botón dice «Cambiar a
   anual» en vez de «Pagar», para que no parezca que se paga dos veces.
3. 🔴 `pago.routes.js` — el alta calculaba `fechaVencimiento` con `new Date()` **a secas**, así
   que pasarse a anual con veinte días pagados por delante los **tiraba en silencio**. Ahora usa
   el máximo entre el vencimiento y hoy, que es **exactamente la regla que el cron de renovación
   ya tenía** (`monitoreo.worker.js`). Tener la misma regla en un sitio y no en el otro era la
   asimetría que hacía caro cambiarse de periodo, y no la veía nadie porque los dos archivos se
   leen por separado.

⚠️ **Alcance que conviene saber:** el arreglo del punto 3 aplica a **cualquier** alta con
vencimiento futuro, no solo al cambio de periodo. En una subida de plan eso regala los días que
quedaban del plan viejo — es a favor del cliente, está acotado a un periodo y hace el upgrade más
atractivo. Lo exacto sería prorratear, y se descartó por lo mismo que arriba.

Lo vigila el **bloque 14 de `prueba-planes.js`** (122 comprobaciones), que comprueba las tres
piezas *y* que el alta y el cron sigan usando la misma regla.

### Repaso en MÓVIL y en INGLÉS (2026-08-29) — un fallo, y el resto limpio

Se hizo con el proxy (`brand-shield-web/scripts/proxy-movil.js`) y un iframe de 390 px, o sea
**anchos reales**: las media queries responden al viewport del iframe. Comprobado antes de medir
nada, como manda §16: `innerWidth` del iframe daba **390**.

⚠️ **`resize_window` sigue sin servir, y MIENTE al decirlo:** responde *«Successfully resized window
to 390x844»* y `window.innerWidth` se queda en **1920**. Es la trampa ya documentada; lo que la
delata es medir `innerWidth` y no fiarse del mensaje.

🔴 **El fallo: la barra superior no cabía a 390 px, y el selector de idioma quedaba INUTILIZABLE.**
Medido, no visto de reojo:

| | Antes | Después |
|---|---|---|
| `scrollWidth` vs viewport | 398 / 385 → **scroll horizontal del documento** | 385 / 385 |
| Elementos fuera de pantalla | 2 | **0** |
| «Empezar gratis» | 13 px fuera | dentro |
| Botón **EN** visible | **19 de 30 px** | completo |

- 🔴 **La causa de fondo del recorte no era el ancho, era `flex-shrink`.** El selector de idioma es
  un flex item con `overflow:hidden` —lo lleva para redondear las esquinas—, así que al comprimirse
  **no se aprieta: recorta**. A 390 px tenía 47 px útiles para 59 px de contenido y se comía media
  «N». Y `overflow:hidden` lo esconde sin dejar rastro: no hay scroll, no hay error, solo un botón
  que parece otra cosa. Se arregla con **`.lang-wrap{flex-shrink:0}`** — el mismo remedio que ya
  llevaban las pestañas de la ficha (§16).
- ⚠️ **Consecuencia de producto que lo hacía urgente:** la web es bilingüe y en el móvil **no se
  podía pasar a inglés**. La detección por navegador sí funcionaba, así que el fallo solo lo sufría
  quien quisiera cambiarlo a mano — invisible desde dentro.
- El resto es una media query a ≤430 px que aprieta paddings. Lleva `!important` porque el padding
  y el gap van **inline** en esos divs, que es la razón de siempre.

⚠️ **Y una trampa nueva al escribir esa media query: los BACKTICKS dentro del `<style jsx>`.** Ese
bloque es un **template literal**, así que un `` `!important` `` en un comentario CSS **cierra la
cadena** y el build muere con *«Parsing ecmascript source code failed»* señalando una línea de
comentario. Es el primo del aviso de §16 sobre backticks en `node -e`, por otro camino.

✅ **Lo demás, limpio.** Barrido programático (todo elemento cuyo rect se sale del viewport,
ignorando lo que vive dentro de una caja con scroll propio):

| Ruta | Móvil 390 px |
|---|---|
| `/` (17 797 px de alto) | 0 fuera · sin scroll horizontal |
| `/registro` · `/login` · `/contacto` · `/devoluciones` · `/libro-reclamaciones` | 0 fuera |
| `/precios` | 0 fuera — el único candidato era `span.promo-brillo`, un efecto animado con el padre en `overflow:hidden` |

✅ **Inglés: nada sin traducir**, ni en móvil ni en escritorio (1275 px). `<html lang>` cambia a
`en` correctamente. Se buscaron 15 palabras españolas típicas en todos los nodos de texto.

🔴 **Las tres sondas llevaron su CONTROL, y es lo que hace que el cero signifique algo:**
- La de desbordes: se inyecta un `div` de 900 px → pasa de 2 a 3 y vuelve a 2 al quitarlo.
- La de traducción: se inyecta un párrafo en español → pasa de 0 a 1 y vuelve a 0.
- ⚠️ El primer barrido dio **un falso positivo** (`span.promo-brillo`) porque filtraba los padres
  con `overflow-x: auto/scroll` pero **no los de `overflow: hidden`**, que recortan igual. Si se
  reutiliza la sonda, hay que filtrar los tres valores.

⚠️ **Lo que este repaso NO cubre:** el **panel** en móvil y en inglés. El proxy sirve desde
`localhost:3001`, otro origen, así que ahí no hay sesión — y mover el token entre orígenes para
probar no compensa. Queda pendiente y hay que decirlo, no darlo por revisado.

### 🔴 Lo que enseñó el 2026-08-25, y que ninguna prueba vio

El día se cerró con **~570 comprobaciones en verde, el build limpio y la consola sin un
error**, y aun así aparecieron tres fallos. Los tres se encontraron **abriendo el navegador
sobre lo ya desplegado**, que es la misma lección del 24 por segunda vez.

| Qué se veía | Qué pasaba |
|---|---|
| La ficha ofrecía **Conectar Google Business** en tres sitios más, uno de ellos una tarjeta promocional entera encima de las reseñas | Se había escondido en Conexiones y en la web, y se dio el trabajo por cerrado. **Esconder una función es un barrido, no un cambio en un archivo** |
| El cartel de la promo, **en inglés dentro de `/precios`**, que está entera en español | `/precios` es el catálogo que exige Culqi y **nunca llama a `useIdioma`**; el cartel sí. Un componente que decide su propio idioma dentro de una página que no lo hace **siempre** va a discrepar con ella |
| `prueba-panel.js` fallaba sola a la 01:07 de Lima | El fixture usaba «horas atrás»: tres lecturas separadas por una hora caen en **dos días** si en medio pasa la medianoche peruana |

⚠️ **Y la sonda 401/404 dio un falso positivo.** Se probó la ruta nueva del expediente sin token
esperando distinguir «viva» de «no desplegada», y el **404 de control devolvió exactamente lo
mismo**: `negocio.routes.js` también autentica antes de casar el path. Sin ese control se habría
dado por verificada una ruta sobre una respuesta que no dice nada. La prueba buena fue
`railway ssh … grep -c`.

⚠️ **Lo de la promo es la tercera vez que este proyecto se equivoca de idioma por un camino
distinto** (invitaciones de equipo §11, `select` sin `idioma` §12, y ahora un componente contra
su página). La regla que va quedando: **lo que lleva idioma se compone donde se sabe el idioma**,
y si un componente puede montarse en una pantalla que no lo tiene, hay que poder decírselo —
`BannerPromo` acepta `idiomaForzado` justo por eso.

### 🔴 La conexión de TikTok vive en «Don Tito San Miguel» desde el 2026-08-28

Estaba colgada del negocio «KFC» de **`padkar4@gmail.com`**, una cuenta de prueba del
dueño que se iba a borrar — y era la **única conexión de TikTok viva en toda la
plataforma** (la cuenta **@usenotoria**, de la que salen los 2 comentarios sociales de la
base). Borrar esa cuenta se la habría llevado por delante sin que nada lo dijera.

Se movió con **`scripts/mover-tiktok.js <origen> <destino> [--aplicar]`**, que copia —no
corta— las doce columnas de TikTok. Copiar es lo correcto porque el producto **ya
contempla que una misma cuenta esté en varios negocios**: los tokens se persisten con
`updateMany` justo por eso (§8.2). Dejar el origen intacto es la marcha atrás.

⚠️ **`DELETE /api/auth/cuenta` NO revoca los tokens de TikTok**, solo borra las filas. Es
lo que hace que mover y luego borrar la cuenta de origen funcione. Dos consecuencias que
conviene tener escritas:
- Si algún día ese borrado empieza a revocar, **esta receta deja de valer** y hay que
  reconectar por OAuth.
- Visto como producto es un cabo suelto: quien borra su cuenta deja un token autorizado
  vivo en TikTok. La ruta de *desconectar* sí revoca; la de *borrar la cuenta* no.

🔴 **Y lo que el traslado destapó: la conexión llevaba 13 días dormida.** El access token
había vencido el 15/08 y nada lo renovaba, porque `padkar4` es plan **GRATIS** y las redes
van desde NEGOCIO — o sea que el worker nunca corrió su rama de TikTok. La conexión no
estaba rota, estaba **fuera del alcance del worker por el plan**, que desde fuera se ve
igual. Al pasar a una cuenta NEGOCIO el worker vuelve a renovarla sola.

✅ **Probado contra la API real**, por el mismo camino que producción
(`tokenTikTokBizVigente` → `obtenerPerfilTikTokBiz`): el refresh token seguía sirviendo,
el token se renovó (vence 2026-08-29), TikTok devolvió el perfil **«Notoria app» /
@usenotoria**, y el `updateMany` actualizó **las dos filas** a la vez, que es exactamente
lo que ese `updateMany` existe para hacer.
⚠️ **`obtenerVideosTikTokBiz` devuelve 0 videos**, y es correcto: TikTok solo expone los
**públicos** (§8.2). Sin videos públicos no hay comentarios que escanear, así que la
conexión está viva y no va a producir nada hasta que la cuenta publique.

### El monitor de uptime avisa cuando deja de monitorear (2026-08-28, ajustado el 29)

`*/15` era una promesa que GitHub no cumple: medidos los huecos reales, iban de 28 a
**665 minutos**, con los dos últimos en 11 h y 9,3 h. El workflow seguía **en verde**
mientras no miraba nada — un monitor que calla cuando está ciego es peor que no tenerlo,
porque produce confianza.

`.github/workflows/uptime.yml` conserva el `*/15` (pedir más seguido no cuesta nada) y
añade el paso **«Cuánto tardó en volver»**, que consulta la corrida anterior por la API,
**avisa** por encima de 45 min (y hasta el 29 **fallaba** por encima de 4 h — ver abajo). Va con `if: always()` porque
«el sitio está caído» y «llevo 9 h sin comprobarlo» son hechos distintos y los dos hay que
saberlos. Comprobado en vivo: *«Corrida anterior: 23:57Z — hace 114 min»* + warning.

🔴 **Corregido el 2026-08-29, un día después: ese «falla por encima de 4 h» gastaba la única
alarma que importa.** En dos días mandó **cinco** correos de «Run failed: uptime» con el sitio
respondiendo **200 en todas las sondas** (huecos de 8,5 h, 11,8 h, 6,6 h, 6,6 h y 5,2 h). El aviso
no mentía — GitHub de verdad no corre el cron — pero dejaba el correo significando **dos cosas que
no se distinguen desde la bandeja**: «tu sitio está caído» y «GitHub tardó seis horas en mirar».

- **Es el patrón que este archivo ya documenta en otros sitios**: un aviso que se repite y no pide
  hacer nada enseña a ignorar los avisos (§9 con el cron de anulaciones, §8.3 con el warning del
  webhook). Acá el precio es concreto: el día de una caída real, ese correo llega igual que estos
  cinco.
- 🔴 **Y la razón de fondo: el aviso de ceguera es RETROACTIVO por naturaleza.** Llega cuando el
  monitor ya volvió, así que en ese momento no hay nada que hacer con él. Una alarma que solo se
  puede leer en pasado no debería tener el mismo canal que una que exige actuar ahora.

**Ahora el workflow falla SOLO si una sonda no devuelve 200.** El hueco se reporta como `::warning::`
y en el **resumen del run** (`$GITHUB_STEP_SUMMARY`, con una tabla), así que sigue a la vista en la
pestaña Actions sin llegar al buzón.

⚠️ **Cómo se verificó, porque la prueba obvia NO distinguía.** Un `workflow_dispatch` pasó en verde
con un hueco de 106 min — pero 106 min ya era warning **antes** del cambio, así que ese verde no
probaba nada. La prueba buena fue **extraer el condicional real de las dos versiones** (`git show
HEAD` y `HEAD~1`) y ejecutarlo con huecos inventados:

| Hueco | Versión nueva | Versión anterior (control) |
|---|---|---|
| 300 min | **exit 0** | exit 1 |
| 100 min | exit 0 | exit 0 |
| 10 min | exit 0 | exit 0 |

Es el «404 de control» aplicado a un cambio propio: ante un verde, preguntar primero si la prueba
sabía ponerse en rojo.

✅ **Confirmado en producción el 2026-08-30, y esta vez sin simular nada.** Las últimas 15
corridas dicen que el corte está donde debe: **las cinco `failure` son todas ANTERIORES** al
arreglo (la última, 29/08 14:35 UTC) y **desde entonces van siete verdes seguidas** — entre ellas
dos corridas programadas con huecos de **299 y 307 minutos**, o sea por encima del umbral de 4 h
que antes las habría tumbado. El caso que la tabla de arriba predijo con «300 min → exit 0»
ocurrió solo, dos veces, y salió como decía.

🔴 **Y de paso, el argumento del monitor externo se hizo más fuerte, no menos:** esos mismos
huecos de **5,0 h y 5,1 h son de las últimas 24 horas**, con el `*/15` intacto. El arreglo quitó
el ruido del buzón; **no acercó ni un minuto la vigilancia real**. Un verde de este workflow
sigue significando «cuando miré, respondía», nunca «lleva quince minutos bien».

⚠️ **Sigue siendo una mitigación.** El arreglo es el monitor externo, y ahora tiene un argumento
medido en vez de una intuición: el 2026-08-28 hubo una ventana de **11,8 h** en la que nadie
comprobó nada, y el mejor intervalo del 29 fueron **2,2 h**.

⚠️ **Es una mitigación, no un arreglo.** El arreglo es un monitor externo (UptimeRobot y
BetterStack tienen plan gratuito) que además vigile desde fuera de GitHub. Está escrito en
la cabecera del propio workflow para que no se pierda.

### ✅ Cobro real de IMPULSO — 2026-08-28

Cerraba el pendiente que estaba abierto desde el 24/08: el circuito se había probado con
NEGOCIO, y IMPULSO tiene su propio precio, su propia descripción en el comprobante y su
propia rama en la renovación.

🔴 **Cobró S/14.50 y no S/29, y eso NO fue un error: la promo de bienvenida aplicó sola.**
Todas las cuentas tenían la promo libre y `promo_tarjetas` estaba vacía, así que el primer
cobro entró al 50%. Se comprobó **antes** de pagar, no después. De paso quedó estrenada la
promo con dinero real, que tampoco se había probado nunca.

| | |
|---|---|
| Cargo | `chr_live_ke6VcRnUy0XhbvMQ` · S/14.50 PEN · **`outcome.type: venta_exitosa`** |
| ⚠️ `paid` | **`false`**, otra vez. Confirma en vivo que ese campo NO dice si se cobró |
| Descripción en Culqi | «Notoria — Plan Impulso (mensual) — promo 50% bienvenida» |
| Tarjeta | Visa débito `455788******2224`, guardada como `crd_live_…` |
| Cuenta | `revisorculqi@gmail.com` → plan **IMPULSO**, vence 28/09, `mesesPromoRestantes: 1` |
| Comprobante | **BOLETA B001-00000002** · S/14.50 = gravadas 12.29 + IGV 2.21, **cuadra al céntimo** |

✅ **Lo que solo se podía probar con un correo que rebota, y salió bien.** El comprobante al
cliente quedó `suppressed` (esa dirección rebota desde siempre) y **la copia a contabilidad
llegó `delivered`** a `didier@usenotoria.app`. Es exactamente lo que la copia aparte —y no en
BCC— existe para garantizar: el comprobante llega a la empresa aunque el buzón del cliente
falle. Hasta hoy era una decisión de diseño; ahora es un hecho observado.

⚠️ **Al verificar, la primera sonda dijo que la marca y los dígitos de la tarjeta estaban
VACÍOS.** Era falso: los campos se llaman `tarjetaMarca` y `tarjetaInicio`, y mi consulta
pedía otros nombres, que en Prisma llegan como `undefined` sin fallar. Los datos estaban bien
(`Visa`, `4557`). Es el mismo patrón del «404 de control» de §5 aplicado a una consulta:
**ante un campo vacío, preguntar primero si se está leyendo el campo correcto.**

⏳ **Lo que falta, y es cuestión de esperar:** la boleta está en `PENDIENTE` porque el cron de
resúmenes **solo agrupa días cerrados**, así que se informa el 29/08. Límite de envío 04/09,
con 6 días de margen. Los dos workers están activos en `produccion` y el log confirma
`[Comprobante] Emitido B001-00000002 (BOLETA)`.

✅ **SUNAT la ACEPTÓ el mismo día.** Se forzó el resumen en vez de esperar al cron
(`forzar-resumen-sunat.js --aplicar`), tras comprobar la precondición que lo hace seguro: solo
había **una** boleta ese día y **cero** cobros posibles en 24 h. La única suscripción vencida
—`didierprincipe@`, 9 h pasada— no tiene tarjeta guardada, y la renovación filtra por
`suscripcionId: { not: null }`, así que la salta sin cargo, sin fila FALLIDO y sin correo.

| | |
|---|---|
| Resumen | **RC-20260828-1** · ticket `202621748898727` · **ACEPTADO (0)** |
| Boleta | **B001-00000002 · ACEPTADO** |
| Conservación | XML firmado 6397 car. y **CDR 5621 car.**, los dos guardados **en el RESUMEN** |
| Cola | 0 comprobantes pendientes |
| Plazo para anular | hasta **2026-09-05** |

🔴 **La lección más cara de la sesión, y la cazó un simulacro: los scripts que tocan SUNAT o
Culqi hay que correrlos DENTRO del contenedor.** Ejecutado en local, `forzar-resumen-sunat.js`
anunciaba `entorno SUNAT : beta`, `emisión activa: NO` y el endpoint `e-beta` — porque el
`.env` local tiene los ajustes de prueba a propósito (§3). Con `--aplicar` habría mandado el
resumen **al sitio equivocado sin fallar**: el script hace lo correcto, solo que contra el
entorno que no es. Lo mismo vale para `reembolsar-cargo.js`, que en local usa las llaves de
test aunque el cargo sea `chr_live_`.

⚠️ **La regla que queda: correr siempre el simulacro primero y LEER la cabecera del entorno.**
Ese bloque de tres líneas —entorno, endpoint, emisión activa— existe justo para esto, y es lo
único que separa un envío correcto de uno a beta que nadie notaría hasta que SUNAT reclamara la
boleta que nunca recibió.

```bash
railway ssh --service api "node scripts/forzar-resumen-sunat.js"            # simulacro
railway ssh --service api "node scripts/forzar-resumen-sunat.js --aplicar"  # de verdad
```

🔴 **Y lo que no se puede olvidar: al reembolsar hay que ANULAR la boleta aparte**, dentro de
7 días desde el CDR del resumen. `scripts/reembolsar-cargo.js` avisa antes de devolver nada y
`scripts/anular-boleta.js` la anula; el cron de las 8:00 insiste por correo hasta que se haga.
⚠️ El orden importa: **primero que SUNAT la acepte, después reembolsar y anular** — una boleta
no aceptada todavía no se puede anular.

✅ **Reembolsado y anulado el mismo día — el circuito completo, cerrado.**

| Paso | Resultado |
|---|---|
| Reembolso | `ref_live_GzFISGw0csFYkV2k` · S/14.50 |
| **Webhook de Culqi** | ✅ llegó solo: `[Culqi webhook] refund.creation.succeeded` → pago en `REEMBOLSADO` |
| Anulación | **RC-20260828-2** · ticket `202621748921782` · **ACEPTADO (0)** → B001-00000002 `ANULADO` |
| Estado final | 2 pagos REEMBOLSADO · 2 boletas ANULADO · 4 resúmenes ACEPTADO · 0 en cola |

✅ **`suscripcionActiva` quedó en `false` y aquí NO hay que restaurarlo.** El aviso de §9 —«tras
un cobro suelto hay que restaurar el campo a mano»— aplica a un cargo suelto; este era una
suscripción de verdad y el dinero se devolvió, así que apagarla es lo correcto.

✅ **El cron de anulaciones se calla solo:** `necesitaAnulacion` exige
`estadoSunat === 'ACEPTADO'`, y la boleta ya está `ANULADO`. No hay que silenciar nada.

⚠️ **Lo que queda suelto, y es menor:** `revisorculqi@gmail.com` conserva **plan IMPULSO sin
haber pagado** hasta el 28/09, porque `iniciarBajadaDePlanes` solo mira a los que tienen
`fechaVencimiento` ya pasada. No inflama el embudo —ese cuenta `suscripcionActiva`, que está en
`false`— así que no corre prisa; se limpia con `node scripts/dar-plan.js revisorculqi@gmail.com GRATIS`.

✅ **Lo que este cobro no llegó a probar, la RENOVACIÓN, quedó verificado el 2026-08-29** con un
segundo cobro armado a mano: `chr_live_s8Kf6bzHHeefEls3`, S/14.50, tipo **RENOVACION**, boleta
**B001-00000003**. Era el tramo que si falla **regala el plan de por vida sin producir ninguna
señal** (§8.6). El detalle está en §19 B.


⚠️ **La promo de esa tarjeta ya no se puede devolver.** Queda su huella en `promo_tarjetas` y
`limpiar-pagos-prueba.js` **se niega a tocar cargos que no sean `chr_test_`**, así que esto no
se limpia: esa tarjeta y esa cuenta gastaron la promo para siempre.

🔴 **Bug corregido el 2026-08-28 — el bloque de locales se ofrecía en un plan que NO los
vende.** `bloqueado` solo contemplaba `SIN_SUSCRIPCION` y `SIN_TARJETA`, así que con
**`PLAN_SIN_LOCALES`** el bloque pintaba **el contador entero, ofreciendo hasta 50 locales**, y
al confirmar devolvía `errorPagoGenerico`: un mensaje de problema de cobro para algo que no es
un problema de cobro. Es la regla de «lo que no podemos entregar no se muestra», y el mismo
fallo que tuvo la fila fija de Facebook — prometer una función que no existe sin dar forma de
llegar a ella.

🔴 **Y lo que lo hace interesante: NO era alcanzable hasta ese mismo día.** Hacía falta una
cuenta con **plan de pago Y tarjeta guardada**, y no existía ninguna: las dos del dueño tienen
el plan concedido a mano, sin tarjeta. El cobro de prueba de IMPULSO creó la primera, y con
ella el bug pasó de teórico a lo primero que habría visto el primer suscriptor de Impulso.
⚠️ **La lección: al crear el primer caso real de algo, mirar las pantallas que ese caso
desbloquea.** No salió de leer código buscando fallos, sino de preguntarse qué se ve ahora que
antes no se veía.

Ahora `PLAN_SIN_LOCALES` apaga el bloque y explica lo que de verdad corresponde: *«El Plan
Impulso cubre un solo local. Para vigilar más de uno, el salto es al Plan Negocio»* — que es
justo la decisión de §8.6, «quien abre el segundo local es exactamente a quien le toca subir».
En los dos idiomas, y con el motivo cableado también en el aviso del previo, por defensa.
Cuatro comprobaciones nuevas en `prueba-locales.js` (**107**), una de ellas de control.

⚠️ **Queda una incoherencia menor, a propósito:** `maximoExtra('IMPULSO')` devuelve **49**
aunque el plan no venda ninguno, porque se deriva de `MAX_LOCALES_TOTALES − incluidos`. No es
explotable —`validarCambio` corta antes con `PLAN_SIN_LOCALES`, y el alta guarda
`localesExtra: puedeLocales ? extras : 0`— pero son dos funciones respondiendo distinto a la
misma pregunta. Si algún día alguien usa `maximoExtra` como única guarda, ahí está el agujero.

🔴 **Y una corrección al pendiente de «sumar un local a mitad de periodo»: NO se desbloqueó con
este cobro.** La nota decía que bastaba «estar suscrito y pulsar +»; es falso. Hace falta una
suscripción de **NEGOCIO o FRANQUICIA** con tarjeta, porque Impulso no vende locales. Con la
cuenta de hoy el endpoint devuelve `PLAN_SIN_LOCALES`, comprobado. El camino que COBRA sigue
sin poder verse en pantalla.

✅ **Speed Insights, encendido de verdad el 2026-08-28.** Llevaba activado en el panel de
Vercel con **`hasData: false`** desde que se marcó la casilla: medía cero porque **faltaba el
componente** en el frontend. `@vercel/analytics` sí estaba montado —por eso Web Analytics sí
tenía datos—, así que era una asimetría fácil de no ver. Se descubrió auditando el proyecto,
no por un error: una casilla marcada que no mide nada no produce ninguna señal.
⚠️ **La CSP no hubo que tocarla**: Vercel sirve el script y el beacon desde el propio origen
(`/_vercel/speed-insights/…`), que `'self'` ya cubre en `script-src` y en `connect-src`.

✅ **`PRUEBA` mapeado en Facturación.** La pantalla pinta `{t.tipo[p.tipo] || p.tipo}`, y ese
valor —creado por la página de cobro de prueba que se retiró el 23/08— no estaba en el mapa,
así que la fila del S/1 salía como **«PRUEBA»** en crudo. Es el mismo enum a la vista que el
«NEGOCIO» de la barra lateral del 24/08, en otra pantalla.
✅ De paso quedó comprobado que **`RENOVACION` sí está mapeado** en los dos idiomas, que es lo
que se verá mañana por primera vez en la historia del producto.

🔎 **Barrido completo de suites el 2026-08-28: 37 archivos, ~830 comprobaciones, 0 fallos.**
⚠️ Y una lección de método: 16 suites no imprimen línea de resumen, y contarlas por el texto
las daba por buenas **igual que si hubieran reventado**. Lo que distingue es el **código de
salida**, que hubo que mirar aparte. Es el «404 de control» otra vez: ante un resultado,
preguntar primero si el método sabe fallar.
⚠️ `prueba-publico.js` **gasta ~6 llamadas reales de Places**: excluirla de los barridos.

### 🟡 El único hueco conocido

**Ninguno de producto.** El del cambio mensual→anual se cerró el **2026-08-30** y el de sumar un
local en el plan que ya tienes, el 2026-08-26 (§8.8). El panel en móvil y en inglés se repasó el
2026-08-31 y salió limpio.

⚠️ **Lo que queda sin mirar del trabajo del 2026-09-09, y hay que decirlo en vez de darlo por
bueno:**

| Qué | Por qué no se pudo |
|---|---|
| ~~**El bloque de carteles en el PANEL, con los ojos**~~ | ✅ **Mirado el 2026-09-16, en escritorio (1366 px) y en móvil (390 px reales, con el proxy): sin fallos.** Los cuatro tamaños se dibujan, ningún texto se sale del papel (medido con `getBBox` contra el `viewBox`), la consola está limpia y a 390 px hay **0 desbordes** con los cuatro formatos, con el control del div de 900 px pasando de 0 a 1. Los cuatro PDF devuelven `%PDF-` de 4,6–6,5 KB, y un formato inventado da 400 `FORMATO_INVALIDO` — la sonda distingue. La etiqueta no lleva pie **a propósito** (`compacta = ancho < 220`). ⚠️ Dos trampas del método: en el proxy, `scrollTo` por código se queda clavado y hay que usar la **rueda** sobre el iframe; y el `innerHeight` del padre (~557) es menor que 780, así que el iframe hay que achicarlo o la captura corta la mitad |
| **Un correo de resumen MENSUAL de verdad** | El primero sale el **1 de octubre**. Hasta entonces la cadencia está probada en la lógica, no en un correo recibido. Para no esperar: `ejecutarAhora({ forzar: true })` |
| **El correo AGRUPADO de cinco reseñas** | Hace falta que entren cinco reseñas negativas nuevas en una cuenta gratuita. Hoy las 5 alertas están todas notificadas, así que el contador arranca en 0 |
| ~~**Un cartel IMPRESO**~~ | ✅ **Cerrado el 2026-09-23**: el dueño imprimió el cartel y lo escaneó en un negocio real, y funciona. El QR estaba medido (0,87 mm por módulo en la etiqueta, el peor caso); ahora además está probado en papel, que era la única prueba que valía |

### 🔴 Bugs abiertos en producción

**Ninguno** (última revisión: **2026-09-16**). Los dos que quedaban, los dos en la app, se
arreglaron ese día — detalle en `NotoriaApp/PENDIENTES.md`:

- ✅ **La pantalla de Alertas enseñaba mal el lote y al guardar lo deshacía.** Leía `prefsAlertas`
  crudo en vez de `prefsCorreo` resuelto, y mandaba `umbralNegativas` siempre. Ahora `Modelos.kt`
  parsea `PrefsCorreo` y el campo **solo viaja si el interruptor se tocó**.
- ✅ **`qr/Cartel.kt` ya dice «Hecho con Notoria»**, no «Reseñas verificadas con Notoria».
- ✅ De paso, la etiqueta «Solo avisarme de picos» —una promesa muerta— pasó a «Agrupadas: 1 correo
  por cada 5», los mismos textos del panel.

🔴 **Lo que NO se arregla y hay que recordar: la app VIEJA sigue instalada y no se actualiza sola**,
así que su cuerpo —con `umbralNegativas` siempre presente— va a seguir llegando y va a seguir
pisando el lote de una cuenta GRATIS. **El backend no puede evitarlo**: ignorar el campo rompería a
quien sí eligió. Está fijado como **control** en `prueba-prefs-correo.js` (96 comprobaciones, eran
93) para que nadie lo lea como un fallo del servidor y «arregle» la ruta.
⚠️ Esa prueba usa el cuerpo **literal** de `Alertas.kt`: al tocar esa pantalla hay que actualizarla.

⏳ **Sin ver en el teléfono todavía.** El APK compila (`assembleDebug` → BUILD SUCCESSFUL, 15,2 MB)
pero no se instaló: falta abrir Alertas con una cuenta GRATIS y comprobar que el interruptor
arranca encendido y que guardar no lo apaga.


**Corregidos el 2026-09-11:**
- 🔴 **El PATCH de preferencias pisaba los campos que el cliente no mandaba.** Detalle completo en
  §12. Lo encontró cruzar el cambio de correo del 09/09 con lo que la app Android manda de verdad —
  no leyendo la ruta, sino preguntándose qué objeto exacto recibe.
- ⚠️ **El montaje del bloque de carteles nunca se commiteó**, aunque producción sí lo tenía: Vercel
  despliega el árbol de trabajo, no el commit. O sea que **git iba por detrás de producción** y un
  `vercel --prod` desde un clon limpio habría revertido el cartel sin que nada avisara. La regla
  que deja: al cerrar un bloque de trabajo, `git status` **antes** de dar el día por cerrado — el
  commit del 09/09 hasta prometía en su mensaje un arreglo que no llevaba dentro.

**Corregidos el 2026-09-09, de camino a otra cosa:**
- ⚠️ **El nombre del archivo de la constancia se comía sus propias letras.** El `replace` del
  frontend era `/[^w-]+/g` — sin la barra del `\w`—, o sea «cualquier cosa que no sea la letra w o
  un guion». «Salón de Belleza» salía como `-`. No rompía la descarga, solo dejaba un archivo sin
  nombre reconocible, y por eso llevaba ahí desde que se escribió.
- 🔴 **La ruta que guardaba las preferencias de alertas escribía `umbralNegativas: 1` cuando el
  campo no venía** (`umbralNegativas === 5 ? 5 : 1`). Con el agrupado de reseñas nuevo eso es un
  fallo caro: en cuanto una cuenta gratuita guardara cualquier otra preferencia se le escribía un 1
  encima y volvía a recibir un correo por reseña, deshaciendo el agrupado **sin que nada lo dijera**.
  Ahora ausente significa «usa el default de mi plan».

### ✅ 2026-08-31 — el ALTA COMPLETA, recorrida por primera vez de punta a punta

Se hizo con una cuenta real (`usenotoria+alta@gmail.com`, un alias de Gmail que aterriza en el
buzón propio y por eso permite leer el correo de verificación) y se borró al terminar. **La base
volvió exactamente a su estado de partida** —11 usuarios, 13 negocios, 1645 snapshots, 5 alertas,
2 competidores— sin un residuo.

| Paso | Resultado |
|---|---|
| Registro | Cuenta creada, y **`idioma: 'en'` guardado del navegador** — la regla de `idiomaPreferido()` funciona |
| Los dos correos | **Recibidos, no spam**, y en inglés: «Confirm your email» y «Welcome to Notoria» |
| Verificación | `emailVerificado: true` y el token consumido (`tokenVerificaExpira: null`) |
| Alta de negocio | Búsqueda en Google, selección y guardado correctos |
| Primer escaneo | 5 reseñas, snapshot, score **81/100** con su desglose, y **0 alertas** — correcto: el primer barrido calla por diseño |
| Borrado | Limpio y completo, con confirmación por palabra tecleada |

🔴 **Y encontró CINCO fallos que ninguna prueba veía**, todos en el camino que recorre cada
cliente nuevo. Es la sexta vez que aparecen abriendo pantallas (24/08, 25/08, 29/08, 31/08 ×2):

1. **«el total es `undefined`»** en la ficha, dos veces, antes del primer escaneo:
   `snap?.totalResenas?.toLocaleString()` sobre un negocio sin snapshot devuelve `undefined`, y
   `undefined` interpolado en una plantilla **se imprime como palabra**. No lanza, no sale en
   consola. ⚠️ La regla: **pasar `null` explícito a una plantilla de texto**, nunca dejar que un
   `?.` entregue `undefined`.
2. **El pie de TODOS los correos decía «Monitor de reputación para LATAM»**, con el servicio
   limitado al Perú — y en español dentro de correos en inglés.
3. **El modal de borrado en inglés pedía teclear «ELIMINAR»**, y era la única forma de completar
   la acción: quien no supiera español quedaba atascado **en su propia baja**. Séptima vez que
   este proyecto se equivoca de idioma, y la primera en que el fallo **bloquea** algo.
4. **El banner de cookies salía en inglés sobre páginas fijas en español** (`/registro`,
   `/login`…). Se resolvió con `usePathname` y una lista de rutas: la página manda sobre el
   navegador. Es el error del cartel de la promo del 25/08 por un camino nuevo.
5. **La pantalla vacía de comentarios le explicaba TikTok a quien conectó Instagram** — ver
   abajo.

### ✅ Instagram: PRIMERA conexión real verificada (2026-08-31)

Esto cierra el «lo que sigue sin probarse» que §8.3 arrastraba desde el 26/08.

- ✅ **El OAuth completa y persiste**: `instagramUserId 17841443218774198`, token de página
  guardado, vence a los 60 días.
- ✅ **La Graph API responde con ese token**: perfil (`@notoriaapp`) y publicaciones.
- ✅ **El panel lo pinta bien**: la cuenta con su avatar y «escuchando los comentarios».
- ✅ **Desconectar revoca y limpia** (`instagramUserId` y token a `null`).

⚠️ **El token del dueño trae MÁS permisos que los aprobados** —`debug_token` devuelve también
`business_management`, `pages_read_user_content` y `pages_manage_metadata`— porque **tiene rol en
la app y Meta le concede los de acceso estándar**. A un cliente sin rol **no se le piden**. O sea
que **esta prueba no demuestra que un cliente cualquiera pueda conectar**: demuestra que el
circuito funciona. El caso del cliente sigue dependiendo de la segunda solicitud de App Review.

⚠️ **El scraper NO se puede ejercitar en local**: `META_APP_ID` y `META_APP_SECRET` están
**vacíos** en el `.env` (a propósito, los secretos viven en Railway), así que `configurado()` da
`false` y todas las funciones devuelven `null` sin error. Parece un fallo del producto y es el
entorno. Para probarlo de verdad, la llamada directa a la Graph API con el token de la BD.

**Y lo que la prueba real destapó en la pantalla:** el texto de «no hay comentarios» era uno
solo (`vacioDescTikTok`) para cualquier red, así que a quien conectaba Instagram se le explicaba
que *«TikTok solo muestra los videos públicos»*. Ahora la nota la pone **cada red conectada**, y
la de Instagram dice lo que además hacía falta decir: **sus comentarios se recogen en cada
escaneo, no al instante**. Es exactamente lo que no hay que prometer al venderlo.

**Corregido el 2026-08-31 — un 429 o un 500 echaban al cliente de su panel como si su sesión
no valiera.** `AuthContext` trataba tres casos al cargar el perfil: `401` borraba el token,
`NETWORK_ERROR` conservaba la sesión y marcaba `errorConexion`, y **todo lo demás caía en un
`else` que hacía `setUsuario(null)` a secas**. Como `dashboard/layout.js:242` expulsa al login
ante `!usuario && !errorConexion`, cualquier **429 o 5xx sacaba al cliente de su panel sin
decirle por qué**.
- 🔴 Es el patrón que §16 documenta como grave —«no hay alertas» y «no pude consultarlas» no
  pueden verse igual— **por un sexto camino**: acá lo que se confunde es *«tu sesión no vale»*
  con *«no he podido comprobar tu sesión»*. Ninguno de esos códigos dice nada del token.
- **Cuándo muerde de verdad:** un pico de tráfico que dispare el rate-limit, un reinicio de
  Railway (502) o un 500 pasajero. ⚠️ **Y el fallo se agrava solo**: el expulsado que intenta
  volver a entrar puede rebotar también, porque el limitador de `auth` es **más** estricto
  (10/15 min). La pantalla de «sin conexión» con su botón de reintentar **ya existía** en
  `layout.js:256`; estos códigos simplemente no llegaban nunca a ella.
- 🔴 **Se encontró sin querer, agotando el rate-limit durante el repaso del panel en móvil:** el
  panel me echó al login teniendo sesión válida. **Quinta vez que este proyecto encuentra un
  fallo abriendo pantallas** en vez de leyendo código (24/08, 25/08, 29/08, 31/08).
- ⚠️ **`refrescarPerfil` NO tenía el fallo** —su `catch` devuelve `null` sin tocar la sesión—,
  así que no hubo que tocarlo.

⚠️ ~~**`next build` NO funciona en esta PC.**~~ Se escribió el 31/08 así: falla en el prerender con
*«InvariantError: Expected workStore to be initialized»* sobre `/_not-found` y `/dashboard`
(Next 16.2.9 + Node 24), comprobado con el control de que fallaba igual con el árbol limpio.
✅ **CORREGIDO el 2026-09-09: ya no se reproduce.** `next build` termina con **exit 0**, prerender
incluido, las 36 páginas generadas, sin tocar nada del entorno. O sea que era transitorio y la nota
se quedó afirmando como permanente algo que duró un día.
⚠️ **La lección, y es incómoda: un fallo de entorno que se comprueba UNA vez y se documenta como
estado del sistema envejece mal.** Durante nueve días este archivo dijo que no se podía verificar
el prerender antes de desplegar, y se podía. Al anotar un fallo de la máquina conviene volver a
probarlo antes de darlo por vigente.

**Corregidos el 2026-08-30, y los tres fallaban sin producir ninguna señal:**
- 🔴 **`dar-plan.js` y `cuenta-revisor.js` rechazaban `IMPULSO`** como plan inválido desde que ese
  plan entró, el 24/08. Tenían su propia copia de la lista, que es exactamente lo que §8.6 existe
  para impedir. Ahora la leen de `ORDEN`.
- 🔴 **El alta tiraba en silencio los días ya pagados.** `fechaVencimiento` se calculaba con
  `new Date()` a secas, así que pasarse de mensual a anual con veinte días por delante los perdía.
  El cron de renovación ya usaba la regla correcta: el problema era tenerla en un solo sitio.
- ⚠️ **`maximoExtra` devolvía 49 para un plan que no vende locales.** No era explotable, pero ese
  número viaja al panel, así que el agujero ya estaba escrito para quien lo usara como guarda.

🔴 **Y el más importante no era de código sino de correo:** `didier@usenotoria.app` **no tenía
regla de Email Routing** y llevaba tiempo perdiendo los avisos de contabilidad, reclamaciones,
anulación de comprobantes y los informes DMARC — con §6 de este archivo afirmando lo contrario.
Ver §6.

**Corregido el 2026-08-26 — Google Business seguía a la vista en los DOS sitios de más tráfico.**
El barrido del 25 escondió la función en Conexiones, la web y tres puntos de la ficha, y se dio
por cerrado. Faltaban: el **paso 2 de 3 del onboarding** (que se le pedía a cada usuario nuevo en
su primer minuto, con un botón que caía en un **404 JSON** y lo sacaba del producto) y
**`GBPBanner`**, montado en `dashboard/layout.js`, o sea presente en **todas** las pantallas del
panel. El onboarding pasó a dos pasos; el banner pregunta ahora por `gbp.disponible` y falla
cerrado. De paso, sus dos `fetch` mandaban `Authorization` a mano **sin `X-Cuenta`**: quien
trabaja en la cuenta de otro recibía los negocios de la suya.

🔴 **Y lo que de verdad hay que retener: `prueba-gbp-visible.js` estaba en VERDE con sus 44
comprobaciones.** No estaba mal escrita — miraba los archivos equivocados. Las líneas rotuladas
«paso 3 del onboarding» comprobaban que la frase se había retirado **del landing**, sin abrir
nunca `onboarding/page.js`; y la de `dashboard/layout.js` buscaba un texto que vive en
`components/GBPBanner.js`, del que el layout solo tiene `<GBPBanner/>`.
**Una prueba que lee los archivos que uno recuerda no es un barrido.** Ahora los lee, y lleva su
control de que las sondas saben fallar.

**Corregido el 2026-08-26 — el CLIENTE elegía su país fiscal, y con él si había IGV.**
`PUT /api/pagos/datos-fiscales` aceptaba cualquier código de dos letras. Con `paisFiscal: 'MX'`
el receptor pasa a **no domiciliado**, `tipoFiscalPara` devuelve FACTURA de exportación y
`desglosar` la emite **sin IGV**. O sea que un campo del cuerpo de la petición decidía si Notoria
declara IGV — y encima **sin estar inscrita en el Registro de Exportadores de Servicios**, sin el
cual esa venta no califica como exportación y sí lo lleva. Ahora `SOLO_NACIONAL` en
`lib/tributario.js` lo rechaza al guardar.
⚠️ **La lógica de exportación NO se borró**, solo se cerró la puerta: `esDomestico`, `desglosar`
y `tipoFiscalPara` siguen enteras y probadas, y reabrir el servicio al exterior es **una línea**.
La prueba lo vigila por los dos lados: que MX se rechace al guardar Y que `desglosar` siga
tratándolo como exportación.
⚠️ La UI nunca ofreció elegir país (manda `'PE'` fijo), que es justo por lo que nadie lo vio:
**un campo que la pantalla no enseña sigue llegando por el cuerpo de la petición.**

**Corregido el 2026-08-26 — `razonSocial` y `direccionFiscal` sin longitud máxima.** Viajan tal
cual a `cbc:RegistrationName` y `cbc:Line` del XML (SUNAT los acota a 100). Sin tope se guardan
sin problema, el cobro pasa sin problema, y **el comprobante lo rechaza SUNAT después**: cliente
cobrado, sin documento y con un correlativo gastado que no admite huecos. Es el peor orden
posible de los tres.
⚠️ Se **valida al guardar**, no se trunca al emitir: truncar dejaría en el comprobante una razón
social distinta de la que el cliente escribió, que también es un documento mal emitido, solo que
en silencio.
✅ Revisado el resto de la superficie de pago **sin más hallazgos**: solo tres puntos cobran
(alta, locales, renovación) y los tres calculan el importe en el servidor; el PDF y el historial
filtran por dueño; `xmlbuilder2` escapa el texto ajeno solo; y `culqi.js` ya truncaba lo que le
manda. El webhook de Culqi sí ganó una guarda: `chargeId` salía de un JSON ajeno directo a un
`findUnique` sin comprobar que fuera una cadena.

**Corregido el 2026-08-26 — el ALTA no acotaba `localesExtra` por arriba.** El número llega del
**cuerpo de la petición**; el selector del panel lo limita a 50, pero eso es una cortesía del
navegador, no una defensa. `POST /api/pagos/culqi` lo pasaba tal cual a `montoSuscripcion`, así
que un cuerpo con `localesExtra: 10000` en Franquicia anual daba un cargo de **S/9.48 millones**,
con su comprobante fiscal, su correlativo gastado y su declaración detrás. `POST /api/pagos/locales`
sí lo comprobaba con `validarCambio`; el alta era la puerta que quedaba abierta.
⚠️ Se **rechaza** (400 `DEMASIADOS_LOCALES`), no se acota en silencio: acotar cobraría un importe
distinto del que el widget acaba de enseñar, que es el fallo que este archivo ya arrastró una vez.

**Corregido el 2026-08-26 — las tarjetas prometían «locales sin tope» y el tope son 50.**
Estaba en 13 sitios: las cuatro tarjetas del panel en los dos idiomas, la comparativa del landing
en los dos, y tres descripciones del catálogo de `/precios` — que es literalmente el documento que
Culqi revisa. Ahora la frase **interpola `MAX_LOCALES_TOTALES`**, que vive en
`lib/localesExtra.js` y se espeja en `web/src/lib/planes.js`; el bloque 12-bis de
`prueba-locales.js` falla si los dos números se separan, si vuelve a aparecer «sin tope» fuera de
un comentario, o si alguien escribe el número a mano.
🔴 **Y el máximo de EXTRAS se deriva** (`maximoExtra(plan) = MAX_LOCALES_TOTALES − incluidos`), no
se fija en 49: hoy todos los planes incluyen un local, pero el día que uno incluya dos, un 49 fijo
dejaría comprar 51.

**Corregido el 2026-08-26 — la pantalla de INICIO pintaba las alertas en español.**
`Alerta.descripcion` la guarda el worker redactada y siempre en español: es un **respaldo**, no el
texto de la interfaz, y las piezas viajan en `detalle` justo para que el panel arme la frase con
`textoAlerta()` (`web/src/lib/alertas.js`). Alertas y la ficha ya lo hacían; `dashboard/page.js`
la pintaba en crudo, así que un panel en inglés abría con «Nueva reseña de 1★ de…» en la primera
tarjeta que se ve. **Quinta vez que este proyecto se equivoca de idioma por un camino distinto**
(§11 invitaciones, §12 el `select`, la promo del 25 contra su página, y ahora el panel de inicio).
⚠️ La prueba va como **barrido sobre los 13 archivos del panel**, no como comprobación del archivo
que se vio — que es la lección del mismo día, aplicada antes de repetir el error.

Debajo, lo anterior.

**Ninguno conocido** (última revisión: **2026-08-25**, tras desplegar el cobro por local, los
frenos de costo de Places, el interruptor de Google Business y el expediente, y verificar las
dos puntas: contenedor y navegador).
Debajo, lo corregido, en orden inverso — se conserva porque cada uno deja una regla.

✅ **RESUELTO el mismo 2026-08-23 — SUNAT producción rechazaba nuestras credenciales SOL
(`0102`).** Hicieron falta dos cosas: asignarle permisos al usuario secundario Y una clave
nueva. El detalle de lo aprendido está en §9; esto queda como registro de qué pasó.

~~🔴 SUNAT producción rechaza nuestras credenciales SOL.~~ Encontrado el 2026-08-23 con `scripts/sonda-sunat-produccion.js`, **antes** de
cobrar nada. Es el fallo que llevaba meses escondido detrás de un supuesto.

- **Qué SÍ funciona:** el endpoint de producción responde, y el certificado se abre y descifra
  (ECEP-RENIEC, válido hasta 2029-07-26).
- **Qué NO:** el par usuario/clave. La forma es plausible —usuario de 8 caracteres alfanuméricos,
  clave de 11, sin espacios ni BOM, y el username se compone como `RUC+usuario` (19 en total)—,
  así que no es un problema de formato evidente.
- **Revisado en el portal de SUNAT el 2026-08-23**, con el dueño delante:
  - El usuario secundario **`NOTORIAS` existe y está Activo**, y la variable
    `SUNAT_SOL_USUARIO` contiene exactamente eso, con las mayúsculas correctas. (Ojo: el
    usuario PRINCIPAL es `LEOTHDAY` y también mide 8 caracteres, así que el largo no
    distingue cuál está configurado — hay que comparar la cadena.)
  - 🔴 **No tenía NINGUNA opción asignada.** Se le asignaron, y quedaron grabadas:
    `TRIBUTARIOS → Comprobantes de pago → SEE - Del Contribuyente y Envío de Documentos`, con
    sus dos ramas — *Servicio de Envío de Documentos Electrónicos por Servicio Web* (que es lo
    que usa `sendBill`/`sendSummary`) y *Consultar Envíos de CPE* (comprobantes, bajas,
    resúmenes de boletas y disponibilidad del servidor, que es lo que usa `getStatus`).
    ⚠️ El panel derecho solo muestra las opciones del nodo seleccionado, pero la selección
    **sí se acumula** entre nodos: se comprueba con el enlace «Resumen de opciones asignadas»
    antes de grabar.
  - Los **«Asignar Roles»** son todos de aduanas y VUCE: ninguno aplica a facturación.
  - **Y aun así sigue dando 0102**, así que lo que queda es la contraseña. La guardada está
    bien formada —11 caracteres, letras y dígitos, sin símbolos, sin BOM ni espacios— o sea que
    no es un problema de codificación: simplemente no es la que espera SUNAT.
- ✅ **Resuelto:** el dueño cambió la clave de `NOTORIAS` en el portal y se cargó con
  `bash scripts/cargar-secreto.sh SUNAT_SOL_CLAVE`. La sonda pasó a verde y, acto seguido,
  SUNAT aceptó la primera boleta real.
  ⚠️ **Esa clave vive SOLO en Railway.** Si se pierde, se vuelve al 0102 y no hay forma de
  recuperarla desde el código: hay que cambiarla otra vez en el portal de SUNAT.
- ⚠️ **Consecuencia si no se arregla:** el primer cobro real cobra bien por Culqi y el
  comprobante se queda en `PENDIENTE` para siempre — cliente pagado, sin documento, y con un
  correlativo consumido que no admite huecos.

⚠️ **Bug latente arreglado de paso: las credenciales SOL se insertaban SIN ESCAPAR en el XML
del sobre SOAP.** SUNAT permite símbolos en la clave, y un `&` habría roto el XML. Lo peor es
cómo se habría manifestado: SUNAT contesta el **mismo `0102`** que ante una clave equivocada, así
que se habría perdido una tarde cambiando una contraseña que estaba bien. La de ahora no tiene
símbolos —no era la causa—, pero la próxima podría.

🔴 **Dos lecciones, y las dos son sobre cómo se verifica, no sobre SUNAT:**
1. **«La variable está puesta» no es «la credencial funciona».** Es literalmente el mismo error
   que ya había enseñado `verificar-meta-secret.js`, por otro camino y con otro proveedor.
2. **El orden del veredicto importaba.** La sonda comprobaba primero si la respuesta buena y la
   del control coincidían, y como SUNAT devuelve `0102` para las dos, enterró el hallazgo bajo
   un «no concluyente» que sonaba a problema del método. Cuando el proveedor dice explícitamente
   *«usuario o contraseña incorrectos»* sobre la credencial real, eso ya es concluyente: para
   emitir ese error tuvo que mirarla y rechazarla.

**Corregido el 2026-08-23 — todas las alertas salían en español, también para quien tiene el
panel en inglés.** El fallo no estaba en la plantilla sino **en el `select` que la alimenta**:
los dos `findMany` del worker pedían `prefsAlertas` y `plan` pero no `idioma`, así que
`enviarAlertaCritica` recibía `undefined` y caía al fallback. La escalación de 24 h y el reporte
mensual sí lo pedían — o sea que el único correo afectado era **el más frecuente**. Detalle en
§12.

🔴 **Las dos lecciones, que son distintas de las de siempre:**
1. **Un doble de Prisma nunca habría encontrado esto**, porque el mock devuelve el objeto
   entero, con `idioma` y todo. Lo que lo caza es una prueba que **lee el fuente** y comprueba
   la forma de la consulta. Está en el bloque 6 de `prueba-alertas-resena.js`.
2. **Apareció mientras se preparaba el ensayo de otra cosa.** No salió de leer código buscando
   fallos: salió de preguntarse qué objeto exacto recibe la función que se iba a ejercitar.

**Corregido el 2026-08-22 — el producto no avisaba de las reseñas negativas.** 1783
escaneos y 0 alertas: ninguna señal creaba alerta por una reseña individual, y la pantalla
de Alertas ofrecía una preferencia ("Cada reseña negativa") que no gobernaba nada. El
detalle completo está en §12. **La lección es la misma de siempre y conviene tenerla a
mano: un hueco de producto no produce logs.** Lo que lo delató fue contar filas en
producción (`0 alertas` con `12 reseñas de ≤2★` al lado), no leer código ni revisar errores.

**Corregido el 2026-08-22 — el texto de una reseña podía inyectar HTML en los correos.**
Ver §14, fila *HTML en los correos*. Existía desde antes para comentarios y menciones; el
aviso nuevo lo habría convertido en el caso masivo.

**Corregido el 2026-08-19 — `EMAIL_CONTABILIDAD` y `EMAIL_RECLAMACIONES` no existían en
Railway.** Solo estaba `EMAIL_FROM`. Las dos consecuencias eran silenciosas:

- **`EMAIL_CONTABILIDAD` vacía apaga CUATRO avisos**, porque los cuatro usos están guardados
  con `if (!destino) return;` — `avisarReceptorIncompleto` (`comprobante.service.js:63`), el
  rechazo/vencimiento de facturas (`envioSunat.worker.js:129`), el de resúmenes diarios
  (`resumenSunat.worker.js:272`) y la copia contable de cada comprobante (`emails.js:267`).
  Con la emisión a SUNAT encendida, un comprobante rechazado no avisaba a nadie.
- **`EMAIL_RECLAMACIONES` vacía cae al default `hola@usenotoria.app`** (`emails.js:415` y
  `:455`), la dirección cuyo reenvío sigue sin verificar.

Ambas quedaron en **`didier@usenotoria.app`** — se eligió esa y no `hola@` porque de esta sí
hay prueba de entrega (un código de TikTok dirigido ahí llegó a `usenotoria@gmail.com`).
Verificado dentro del contenedor con `railway ssh`: las dos miden 21 caracteres exactos.

🔴 **La lección que vale para cualquier variable futura: un `if (!destino) return;` convierte
una variable olvidada en una función que no existe, sin un solo error en los logs.** Al
agregar una variable que gobierne un aviso, comprobarla en el contenedor, no en el `.env`
local — que aquí tenía las tres.
