# Notoria — Guía de contexto para Claude Code

> Documento de **estado y reglas**, no diario. Se conserva lo que sigue siendo cierto y las
> lecciones que evitan repetir errores; la narrativa de cómo se llegó a cada cosa se
> compactó el 2026-08-19 (el historial completo está en git).

## 1. Qué es Notoria

Plataforma SaaS de monitoreo de reputación para restaurantes y hoteles **del Perú**.
Detecta reseñas falsas, ataques de bots y caídas de rating.

- Planes: **Gratuito** · **Negocio S/59/mes** (anual S/47/mes) · **Franquicia S/179/mes** (anual S/143/mes).
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
| App Android | `C:\Users\Admin\Downloads\NotoriaApp` (repo `adi211104/APKNotoria`) — Kotlin + Compose, cliente de este mismo API |

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

📋 **Inventario completo en `docs/secretos.md`** (sin valores): qué secreto existe, dónde está
su única copia y —lo que de verdad ordena la lista— **qué haría falta para volver a tenerlo si
se perdiera**. Con esa vara solo dos son graves: la contraseña del certificado
(`SUNAT_CERT_PASSWORD`, sin la cual el `.p12` es un archivo inútil y hay que tramitar otro ante
SUNAT) y el keystore de Android. `SUNAT_SOL_CLAVE`, que es la que suele preocupar, se resetea
en cinco minutos.
- ⚠️ **Railway no es un respaldo**, es un servicio del que se depende.
- ⚠️ El `certificado.p12` real vive en `C:\Users\Admin\Downloads\` — una carpeta que se limpia
  sola. Los `.p12` están cubiertos por `.gitignore` y ninguno está en git (comprobado el
  2026-08-23).
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
| ⚠️ Excepción del truco | **No sirve en routers con `router.use(autenticar)` antes de las rutas** (`redes.routes.js`, `comentario.routes.js`, `pago.routes.js`): el middleware corta antes de casar el path y **cualquier** path devuelve 401, exista o no |
| Mejor sonda | Una ruta pública con **cuerpo propio**. Ej.: `GET /api/equipo/invitacion/<64 ceros>` → 404 con `tipo: INVITACION_INVALIDA` prueba que el código nuevo corre. Acompañar siempre de un **404 de control** sobre una ruta inventada, para distinguir "ruta viva que rechaza" de "ruta que no existe" |
| Frontend | Para lo que vive en un **componente de cliente**: localizar la frase en `.next/static/chunks/` y **descargar ESE chunk desde producción**. `curl` a una página de cliente no muestra su contenido |
| Variables en el contenedor | `railway ssh --service api "printenv X"`, o un `node -e` que ejercite el módulo y devuelva su veredicto |

---

## 6. Estado de las integraciones

| Integración | Estado |
|---|---|
| **Google Places** | ✅ Habilitada y en uso (búsqueda de negocios, escaneo de reseñas públicas) |
| **Google Business Profile** | 🔴 **Bloqueado por Google.** Las GBP APIs quedan con cuota `Requests per minute = 0`, señal documentada de que no hay acceso concedido; `mybusiness.googleapis.com` (v4, la que lee y responde reseñas) ni aparece en la Biblioteca. Con cuota 0 el callback autoriza y revienta en `listarCuentas` → `?gbp_error=callback_failed`. Caso de asistencia **`3-5553000040900`** |
| **Culqi** | ✅ LIVE en producción. Webhook de reembolsos registrado |
| **TikTok (Accounts API)** | ✅ Completo: perfil, videos, comentarios, responder, borrar respuesta, ocultar, fijar |
| **TikTok Display API** | Conservada como respaldo, sin usarse |
| **Instagram** | Código completo y desplegado, **oculto tras interruptor** hasta que Meta apruebe (§8.3). App Review enviado el 2026-08-15 |
| **Menciones** | Motor y panel completos. Instagram es su **única** fuente, así que hoy la sección está invisible. TikTok exigiría proveedor de pago |
| **Facebook Reviews** | ✅ **Terminado el 2026-08-23 y OCULTO tras interruptor** (`lib/facebookVisible.js`, gemelo del de Instagram): scraper con `recommendation_type`, ruta de conexión, callback propio, desconexión, aviso por reseña negativa y fila en el panel. Sigue invisible hasta que Meta conceda **`pages_read_user_content`** (segunda solicitud, §19 A). ⚠️ Antes de encenderlo: **una llamada real contra una página con reseñas** |
| **TripAdvisor** | Solo base preparada a propósito (scraper + campos en schema + enum `TRIPADVISOR`). Sin ruta de conexión, sin cableado en el worker, sin UI. Decisión de negocio: activar cuando haya masa de hoteles |
| **SUNAT** | ✅ Emisión **ENCENDIDA** en producción |
| **WhatsApp / Telegram** | ❌ Eliminados como canal de alerta. WhatsApp sigue vivo solo como contacto comercial (botón de ventas, `/contacto`) |

**Infraestructura:** Railway (`notoria-api`, servicio `api` + Postgres), Vercel
(`notoria-web`), DNS en Cloudflare en "DNS only". Dominio verificado en Resend. Search
Console verificado (`public/googlebab20eafdad21f30.html` — **no borrarlo**, Google
re-verifica). DMARC en **`p=quarantine`** desde el 2026-08-19
(`v=DMARC1; p=quarantine; rua=mailto:padkar4@gmail.com`). Monitor de uptime en `.github/workflows/uptime.yml`
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
`Usuario.idioma` y `AuthContext` lo sincroniza hacia `IdiomaContext`. El PDF mensual y los
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

### 8.3 Instagram — completo pero oculto tras interruptor

**Por qué está oculto.** Los permisos siguen en **acceso estándar**: con ese nivel solo los
concede alguien con **rol en la app**. El botón funcionaría para el dueño y **fallaría con el
primer cliente real**, con un error que el cliente no puede resolver.

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

⚠️ **Lo que las pruebas NO cubren, y hay que hacer antes de encender el interruptor:** que Meta
responda eso de verdad. Nadie ha llamado nunca a `/{page-id}/ratings` con un token válido. Es la
misma distinción que costó meses con `obtenerComentariosTikTok`.

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
facturado exige anular aparte, dentro de plazo. `scripts/reembolsar-cargo.js` lo avisa antes
de devolver nada y dice qué comprobante habría que anular.

⚠️ **El webhook de reembolso apaga `suscripcionActiva`.** Es lo correcto para un cobro de
suscripción, pero tras un cobro suelto hay que restaurar el campo a mano.

⚠️ **`reembolsar` exige el importe.** Sin `amount`, Culqi responde «No existe el monto que
intentas devolver o no está definido» — que suena a que el cargo no existe cuando lo que falta
es el campo.

**Trámites fuera del código:** afiliación al SEE-Del Contribuyente ✅ · usuario SOL secundario
solo con permiso de emisión · Registro de Exportadores de Servicios (sin él, las ventas al
exterior no califican como exportación y **sí llevarían IGV**). ⚠️ Nada de esto es asesoría
tributaria: confirmar con contador.

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
| `dar-plan.js <email> <PLAN>` | Cambia el plan a mano. No crea `Pago` ni comprobante (la numeración es correlativa y no admite huecos) |
| `escanear.js` | Fuerza un ciclo sin cooldown (`railway run --service api`) |
| `enlaces-venta.js "<búsqueda>" [--paginas N] [--csv]` | Prospección: genera enlaces `/para` ordenados por prioridad |
| `forzar-resumen-sunat.js [--aplicar]` | Manda el resumen diario de las boletas de HOY sin esperar a que el día cierre. El cron solo agrupa días cerrados, y esa regla es correcta; esto usa la costura `agruparPendientes({ incluirHoy: true })`, que el cron **nunca** usa. ⚠️ Solo es seguro si no van a entrar más boletas ese día |
| `anular-boleta.js <numero> [--aplicar]` | Anula una boleta aceptada, en un resumen con la línea en estado 3. Solo marca `ANULADO` si SUNAT aceptó. Plazo: 7 días. ⚠️ Anular no es corregir: si cambia el importe, toca nota de crédito |
| `reembolsar-cargo.js <chargeId> [--aplicar]` | Devuelve un cargo de Culqi. Avisa **antes** de qué comprobante quedaría sin anular, porque el reembolso no lo anula. El monto sale del `Pago`, no de un argumento |
| `lib-env-produccion.js` | No es un script: lo requieren los demás. Arregla la trampa de `railway run`, que da los secretos de producción pero pisa `DATABASE_URL` con el host **interno** de Postgres, inalcanzable desde fuera. Costó tiempo dos veces antes de vivir en un solo sitio |
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
| `prueba-alertas-resena.js` | 31 comprobaciones del aviso por reseña negativa. Lo que vigila son las **condiciones de silencio** (primer barrido, antigüedad, umbral, que pase por `notificar()`): si una se rompe, no falla nada — simplemente se deja de avisar |
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

## 19. Pendientes, ordenados por quién los desbloquea

### A. Esperando a un tercero — solo vigilar el correo

| Qué | Desde | Qué bloquea |
|---|---|---|
| **Meta — App Review de Instagram** (5 permisos) | 2026-08-15 | Instagram para clientes reales, la sección **Menciones** entera y los webhooks de comentarios (exigen Acceso Avanzado) |
| **Google — acceso a las GBP APIs**, caso `3-5553000040900` | 2026-08-16, plazo 7-10 días hábiles. **Revisado el 2026-08-22: sigue sin aprobar** (RPM=0 en `mybusinessbusinessinformation`) | Conectar Google Business |

**Revisión del panel de Meta del 2026-08-22 — nada que hacer, solo esperar.** Estado
`Review in progress` con los cinco permisos correctos, app en **modo Live**, y las dos
obligaciones (`Submit Data Use Checkup` y `Data access renewal`) en **Completed**.
- ⏳ **El plazo real lo dice el propio panel: *"most submissions are reviewed within 20
  days"***, no los 7-10 que se supusieron al enviarlo. Enviado el 15/08 → **hasta
  ~4 de septiembre** antes de que valga la pena preocuparse.
- 📅 **5 de octubre de 2026: vence la renovación anual de acceso a datos de Meta.** Si se
  pasa, se pierde el acceso a las APIs. No depende del App Review.

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
| **Google — verificación del Perfil de Empresa** | pendiente | Que algunos cambios de la ficha se vean |

**Al aprobar Meta**, en este orden: poner `INSTAGRAM_ACTIVO=true` en Railway (se abre para
todos sin desplegar) → comprobar si los eventos del webhook llegan **sin**
`suscribirWebhookInstagram()`, y si llegan **borrar esa llamada** → enviar la **segunda**
solicitud, que ahora lleva **dos** permisos:
- **`business_management`**, que quedó fuera porque su botón de acceso avanzado seguía
  deshabilitado al enviar (Meta no deja pedirlo sin llamadas registradas).
- **`pages_read_user_content`**, el que habilita **Facebook Reviews** (§19 C). ⚠️ Es este y
  **no `pages_read_engagement`**, que es lo que se dio por hecho durante meses: con la
  solicitud actual aprobada, las reseñas de Facebook seguirían sin funcionar.

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

> **Dos comandos listos y esperando aprobación (2026-08-23).** Los dos escriben en producción
> y mandan correo de verdad, así que no se corren solos:
>
> ```bash
> cd brand-shield
> # 1. Ensayo de la cadena de alertas: 1 caso positivo + 3 controles de silencio,
> #    sobre un negocio del propio dueño, y borra lo que crea al terminar.
> #    ⚠️ NO usar `railway run`: inyecta la URL interna de Postgres y falla.
> FRONTEND_URL=https://usenotoria.app node scripts/ensayo-alertas.js --aplicar
>
> # 2. Recuperar las 4 cuentas que nunca verificaron su correo (dos desde el 5 de julio).
> node scripts/recordar-verificacion.js            # listado, no manda nada
> node scripts/recordar-verificacion.js --aplicar  # manda los 4 correos
> ```

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

6. **Webhook de Culqi**: solo un reembolso real puede confirmarlo.
7. **Cuando el correo de la empresa reemplace al personal en Google Cloud:** agregarlo como
    **propietario** del proyecto `798376364749`, cambiarlo en *Información de la marca →
    correo de asistencia* y en *Contacto del desarrollador*, y **recién entonces** quitar la
    personal. Al revés se lleva el proyecto que contiene el `GOOGLE_CLIENT_ID` de producción.

### C. Decisiones de negocio

- **Proveedor de datos para las menciones de TikTok** (~US$100/mes): sería el primer costo
  variable por cliente.
- ~~**Facebook Reviews**~~ → ✅ **Implementado el 2026-08-23, oculto tras interruptor** (§8.5).
  Ya no queda nada que decidir ni que programar: el día que Meta conceda
  `pages_read_user_content` se pone `FACEBOOK_ACTIVO=true` en Railway y se abre para todos sin
  desplegar. ⚠️ Antes de eso, **una llamada real contra una página con reseñas**.
- **TripAdvisor**: activar cuando haya masa de hoteles.
- ~~Borrar `Usuario.telegramChatId`.~~ **Hecho el 2026-08-22.** ⚠️ **Nunca debería haber
  estado en esta lista:** al ponerlo junto a contratar un proveedor de ~US$100/mes y activar
  TripAdvisor, parecía que había algo comercial que valorar. Era limpieza técnica de una
  columna vacía. Lo correcto de aquella nota era **no ejecutarla sin permiso** —toca
  producción—, no llamarla decisión de negocio.

### D. Se pueden hacer solas, pero necesitan tiempo o datos

- ~~**Ranking "quién subió más este mes"**~~ → **el motor está hecho y probado (2026-08-23);
  lo que falta es la UI.** El bloqueo era «faltan meses de snapshots» y caducó: hay historial
  desde el 5 de julio. Pero medirlo reveló que **la métrica original no sirve**: en 49 días
  ningún rating se movió (4.8→4.8, 3.9→3.9, 4.0→4.0, 4.5→4.5), porque una ficha con cientos de
  reseñas no mueve su promedio en un mes. Lo que sí tiene señal es el **volumen de reseñas
  nuevas**: 4 de 10 negocios se movieron este mes y 6 tienen los dos meses medidos. `lib/progreso.js`
  + `GET /api/negocios/:id/progreso` ya lo calculan (§13); falta la pantalla, y el endpoint
  responde **409 `SIN_DATOS`** para que esa pantalla pueda esconderse sola cuando no hay nada.

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


### Estado de la base de producción (última lectura, 2026-08-23)

`11 usuarios (4 SIN VERIFICAR) · 15 negocios (10 activos, pero solo 9 place IDs distintos) ·
1808 snapshots · 85 reseñas (12 de ≤2★, 11 sin responder) · 0 alertas · 1 pago (S/1, REEMBOLSADO) ·
1 comprobante (B001-00000001, ANULADO) · serie B001 en 1 · 0 miembros · 0 invitaciones · 0 reclamaciones ·
0 promo_tarjetas · 3 competidores con 422 snapshots`.

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

### 🔴 Bugs abiertos en producción

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
