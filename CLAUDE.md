# Notoria — Guía de contexto para Claude Code

> Documento de **estado y reglas**, no diario. Se conserva lo que sigue siendo cierto y las
> lecciones que evitan repetir errores; la narrativa de cómo se llegó a cada cosa se
> compactó el 2026-08-19 (el historial completo está en git).

## 1. Qué es Notoria

Plataforma SaaS de monitoreo de reputación para restaurantes y hoteles **del Perú**.
Detecta reseñas falsas, ataques de bots y caídas de rating.

- Planes: **Gratuito** · **Impulso S/29/mes** (anual S/23/mes) · **Negocio S/59/mes** (anual S/47/mes) ·
  **Franquicia S/179/mes** (anual S/143/mes). 🔴 **Desde el 2026-08-25 todo plan de pago incluye UN
  local y los demás se cobran aparte** — S/39/mes en Negocio, S/99/mes en Franquicia (§8.7).
  Qué incluye cada uno vive en
  **`src/lib/planes.js`**, que es fuente única de CAPACIDADES igual que `precios.js` lo es del
  precio. **No volver a escribir `['NEGOCIO','FRANQUICIA']` a mano en ninguna ruta** — §8.6.
- Dominio: **usenotoria.app** · correo `hola@usenotoria.app` · teléfono público **+51 955 599 041**.
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
> `docs/mudanza-de-pc.md` §9: **JDK/Android SDK** (sin `keytool` no hay AAB ni comprobación del
> keystore), **la extensión de navegador** —✅ **instalada y funcionando el 2026-08-30**; ojo, no
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
└── brand-shield-web/      ← Frontend (Next.js 16 + Tailwind 4 + Turbopack)
    └── src/{app,components,context,lib}
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
NEXT_PUBLIC_WHATSAPP_VENTAS=51955599041   # sin ella el botón flotante no se renderiza
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
| **Google Business Profile** | 🔴 **Bloqueado por Google, y desde el 2026-08-25 OCULTO tras interruptor** (`lib/gbpVisible.js`, gemelo de los de Instagram y Facebook; `GBP_ACTIVO` / `GBP_CUENTAS_PRUEBA`). Era el único de los tres que seguía a la vista.** Las GBP APIs quedan con cuota `Requests per minute = 0`, señal documentada de que no hay acceso concedido; `mybusiness.googleapis.com` (v4, la que lee y responde reseñas) ni aparece en la Biblioteca. Con cuota 0 el callback autoriza y revienta en `listarCuentas` → `?gbp_error=callback_failed`. Caso de asistencia **`3-5553000040900`** |
| **Culqi** | ✅ LIVE en producción. Webhook de reembolsos registrado |
| **TikTok (Accounts API)** | ✅ Completo: perfil, videos, comentarios, responder, borrar respuesta, ocultar, fijar |
| **TikTok Display API** | Conservada como respaldo, sin usarse |
| **Instagram** | ✅ **ENCENDIDO para todos desde el 2026-08-26** (`INSTAGRAM_ACTIVO=true`). Meta aprobó los cuatro permisos que hacían falta. ⚠️ **Sin webhooks**: `pages_manage_metadata` fue RECHAZADO, así que los comentarios llegan por el escaneo periódico (§8.3) |
| **Menciones** | Motor y panel completos. Instagram es su **única** fuente, así que hoy la sección está invisible. TikTok exigiría proveedor de pago |
| **Facebook Reviews** | ✅ **Terminado el 2026-08-23 y OCULTO tras interruptor** (`lib/facebookVisible.js`, gemelo del de Instagram): scraper con `recommendation_type`, ruta de conexión, callback propio, desconexión, aviso por reseña negativa y fila en el panel. Sigue invisible hasta que Meta conceda **`pages_read_user_content`** (segunda solicitud, §19 A). ⚠️ Antes de encenderlo: **una llamada real contra una página con reseñas** |
| **TripAdvisor** | Solo base preparada a propósito (scraper + campos en schema + enum `TRIPADVISOR`). Sin ruta de conexión, sin cableado en el worker, sin UI. Decisión de negocio: activar cuando haya masa de hoteles |
| **SUNAT** | ✅ Emisión **ENCENDIDA** en producción |
| **WhatsApp / Telegram** | ❌ Eliminados como canal de alerta. WhatsApp sigue vivo solo como contacto comercial (botón de ventas, `/contacto`) |

**Infraestructura:** Railway (`notoria-api`, servicio `api` + Postgres), Vercel
(`notoria-web`), DNS en Cloudflare en "DNS only". Dominio verificado en Resend. Search
Console verificado (`public/googlebab20eafdad21f30.html` — **no borrarlo**, Google
re-verifica). DMARC en **`p=quarantine`** desde el 2026-08-19
(`v=DMARC1; p=quarantine; rua=mailto:didier@usenotoria.app`). Monitor de uptime en `.github/workflows/uptime.yml`
(golpea `/health` y el landing cada 15 min).

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
resumen semanal por negocio · auto-respuesta a reseñas positivas · escalación de urgencias ·
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
`/devoluciones`, `/contacto` y `components/PieLegal.js` — que es la **fuente única de los
datos de contacto públicos** (`CONTACTO`).

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
| `HORAS_COMPETIDOR = 24` | `monitoreo.worker.js` | Un rival se relee **una vez al día**, no una vez por ciclo del dueño. ×6 en NEGOCIO, ×24 en FRANQUICIA. Nadie compara ratings de hora en hora, y `progreso.js` compara **mes contra mes** |
| `obtenerCompetidorCompartido` | ídem | Un place ID se pide **una vez por ciclo**, y si además es un negocio monitoreado sale **gratis** de `fichasGoogle`. ⚠️ La reutilización va en UNA dirección: la lectura de competidor solo pide Basic y no le sirve a un negocio, que necesita `reviews` |
| `tocaLeerContacto` | `lib/fichaGoogle.js` | Contact Data **una vez al día**, no en cada escaneo. La marca es `_leidoEn` **dentro** de `fichaGoogleRef`, sin columna nueva. ⚠️ La ficha CERRADA no pasa por acá: `business_status` va en Basic y se sigue mirando siempre |

Resultado medido: un local de Franquicia pasó de **$201.60 a $23.58 al mes**.
`node scripts/prueba-costo-places.js` — 26 comprobaciones.

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
`components/PieLegal.js` (del que ahora tiran también Términos y Privacidad, que antes lo
tenían copiado). El README y este archivo son documentación y van detrás.

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

**Cadencia por plan** (`HORAS_ESCANEO`): Gratis 24 h · Negocio 4 h · Franquicia 1 h. El cron
corre **cada hora** y elige a quién le toca. Antes había un solo cron de 4 h para todos, que
rompía la oferta en las dos direcciones: Franquicia pagaba por 1 h y recibía 4, y cada cuenta
gratuita costaba **seis veces** las consultas a Places prometidas. El cooldown del botón
"Escanear ahora" se importa de esa misma constante.

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
observar la web. La regla está anotada en `components/PieLegal.js`.
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
| `prueba-costo-places.js` | 26 comprobaciones de los tres frenos de costo de Places (§8.7). Vigila lo que no da ninguna señal al romperse: si el competidor vuelve a releerse a la cadencia del dueño, o el caché deja de reutilizar, no falla nada — solo sube la factura de Google, que no distingue de quién fue cada consulta. El bloque 8 deja escrita la aritmética para no rederivarla |
| `prueba-gbp-visible.js` | **51** comprobaciones del interruptor de Google Business **y de que el producto dejó de prometerlo**. El bloque 6 lee `page.js` y `layout.js` buscando las frases retiradas; el último —añadido el 2026-08-26— lee **`onboarding/page.js` y `GBPBanner.js`**, que es donde la función seguía viva con las 44 anteriores en verde |
| `prueba-cableado.js` | 33 comprobaciones de score/temas/impacto/parte enchufados al correo, al PDF y a la constancia. Vigila los dos fallos mudos: que el `select` del semanal traiga la FECHA de la reseña (sin ella el parte sale vacío siempre) y que el correo **no** llame a Groq |
| `prueba-expediente.js` | 43 comprobaciones del expediente (I8). 15 son sobre **el límite**: lee el fuente del PDF y falla si alguna vez imprime «reseña falsa», «extorsionando» o cualquier afirmación que le corresponda a Google o a la autoridad, no a nosotros |
| `prueba-locales.js` | **103** comprobaciones de sumar y quitar locales sobre el plan que ya se tiene (§8.8). Los bloques 1-12 son aritmética y lectura del fuente; el **13 levanta la ruta de verdad** con Prisma y Culqi simulados, que es lo único que comprueba sobre la LLAMADA REAL —y no sobre una regex— que el `update` no escribe `fechaVencimiento` y que a Culqi le llega exactamente el importe que se le anunció al cliente |
| `armar-renovacion.js <email> [--aplicar]` | Deja una cuenta lista para que el cron de renovación la cobre en su próxima pasada: pone `suscripcionActiva` y adelanta `fechaVencimiento`. 🔴 **No cobra nada** — quien cobra es el cron, solo y desatendido, que es justo lo que hay que probar: llamar al cobro a mano probaría otra cosa. Calcula el importe con `montoSuscripcion`, el MISMO de producción, para que el script y el worker no puedan discrepar. Se niega sobre cuentas que no sean del dueño y sobre una sin tarjeta guardada. ✅ Se corre EN LOCAL, al revés que `forzar-resumen-sunat.js`: solo escribe en la base, no llama a Culqi ni a SUNAT |
| `prueba-planes.js` | **109** comprobaciones de la tabla de capacidades (eran 64 cuando se escribió esta fila: la cifra envejece sola, contrastar con la salida real). Vigila lo que no da señal: que todo plan con precio se COBRE y se BAJE (olvidarlo regala el plan de por vida), que la escalera no pierda capacidades al subir, que un plan desconocido falle CERRADO, y **lee el fuente** para fallar si alguien vuelve a escribir `['NEGOCIO','FRANQUICIA']` a mano. 🔴 Desde el 2026-08-30 ese barrido incluye **`scripts/`**, y su regex reconoce las listas que empiezan por `GRATIS`: por esos dos agujeros se le habían escapado `dar-plan.js` y `cuenta-revisor.js` con 109 comprobaciones en verde. Lleva controles que la ponen en rojo a propósito, y uno que comprueba que el barrido **encuentra** los scripts — sin él, un barrido vacío daría verde sin haber leído nada |
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

### 📅 Revisión del 2026-08-31 — sin acuse por TERCERA vez, y la cuota sigue en 0

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


## 19. Pendientes, ordenados por quién los desbloquea

> ### Lo que queda por programar (2026-08-30)
>
> **Uno, y es de navegador, no de código:** el repaso del **panel** en **móvil** y en **inglés**.
> El barrido del 29/08 cubrió el landing y `/precios`, pero dejó el panel fuera a propósito
> —el proxy sirve desde `localhost:3001`, otro origen, y ahí no hay sesión—, así que sigue sin
> revisarse. No hay que darlo por bueno: es la cuarta vez que este proyecto encuentra fallos
> abriendo pantallas que las pruebas daban por buenas (24/08, 25/08, 29/08).
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
| **Google — acceso a las GBP APIs** | 1.ª solicitud 2026-08-16 (caso `3-5553000040900`, sin acuse y sin respuesta). **2.ª solicitud enviada el 2026-08-29 — caso `0-4623000041642`**, plazo declarado 7-10 días hábiles. RPM sigue en 0 en las tres APIs. 📬 Buzón comprobado el 2026-08-30: TAMPOCO llegó acuse, y NO hay ni un correo de Google sobre el Perfil de Empresa en toda la historia del buzón. La documentación dice que el acuse llega solo, en menos de una hora, así que su ausencia SÍ es mala señal. Descartados propietario-vs-administrador, verificación, web y notificaciones (los cuatro cumplen); queda vivo el requisito de los 60 días, que no se puede fechar desde la interfaz | Conectar Google Business |

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
> ⚠️ Quedó un **resumen vacío** —`RC-20260828-2`, 0 boletas, enviado y aceptado— como poso de
> haber forzado dos veces el 28. No rompe nada; es un argumento más para dejar correr el cron.
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
> ✅ **El monitor de uptime EXTERNO está ESCRITO y PROBADO desde el 2026-08-31** — `monitor-uptime/`,
> un Cloudflare Worker con cron cada 5 min. **Falta solo desplegarlo** (`wrangler login` es
> interactivo y lo hace el dueño; los cuatro comandos están en su README).
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
> 🔴 **Lo único verdaderamente irreversible que sigue abierto: respaldar
> `notoria-upload.jks` y su contraseña fuera de esta PC.** Si esa clave se pierde antes de la
> primera subida a Play, no hay app que publicar — hay que crear otra identidad. Ver
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
   - 🔴 **Respaldar `notoria-upload.jks` y su contraseña fuera de esta PC.** Es lo único
     irreversible. (Tras la primera subida, Play App Signing vuelve recuperable la clave de
     subida; hoy todavía no.)
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

🔴 **Y desde el 2026-08-30 eso exige un paso previo que antes no existía: la PC del taller no
tiene JDK ni Android SDK.** `keytool` no está, así que **el AAB no se puede reconstruir** — que
es justo lo que `NotoriaApp/PENDIENTES.md` exige desde que el backend estrenó Impulso. Instalar
un JDK (o Android Studio) deja de ser un detalle de entorno y pasa a ser el **paso 0** de
publicar.

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

### Estado de la base de producción (última lectura, 2026-08-30)

`10 usuarios (4 sin verificar, 1 con idioma 'en') · 13 negocios (8 activos, 12 place IDs
distintos) · 1612 snapshots · 96 reseñas (14 de ≤2★) · **4 alertas** · 2 competidores con 174
snapshots · 3 pagos (S/1 + S/14.50 + S/14.50, los tres REEMBOLSADO) · 3 comprobantes
(B001-00000001/2/3, los tres ANULADO) · 6 resúmenes SUNAT · 1 promo_tarjeta · 0 miembros ·
0 invitaciones · 0 reclamaciones · 0 menciones · **0 cuentas con locales extra**`.

🔴 **Los totales BAJARON respecto al 25/08 y no se ha perdido nada.** El 28 se borró la cuenta
de prueba y con ella se fueron sus negocios, sus snapshots y un competidor; el respaldo se tomó
justo antes, a propósito. Conviene dejarlo escrito porque la serie de snapshots es lo único
irrecuperable que tiene Notoria (`scripts/respaldo.js`): el día que encoja de verdad el reflejo
tiene que ser alarmarse, y para eso las caídas explicables no pueden quedar sin explicar.

⚠️ **Las alertas van por 4, y las dos nuevas también son REALES:** KFC el 26/08 y La Mar otra
vez el 29/08, las dos `RESENA_MUY_NEGATIVA` y las cuatro con `notificada: true`. El circuito
lleva una semana disparando solo, sin un ensayo de por medio.

✅ **Los tres comprobantes están ANULADOS y ninguno es de un cliente.** La serie B001 va por el
correlativo 3, gastado entero en las tres pruebas de cobro. **Cargos reales de clientes: cero.**

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
local en el plan que ya tienes, el 2026-08-26 (§8.8).

⚠️ Lo que sí queda sin revisar es el **panel en móvil y en inglés**, que no es un hueco conocido
sino una zona **no mirada** — que es distinto y peor de dar por buena.

### 🔴 Bugs abiertos en producción

**Ninguno conocido** (última revisión: **2026-08-30**).

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
