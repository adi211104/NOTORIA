# Mudar el proyecto a otra PC

> Escrito el 2026-08-28, al pasar el trabajo de la PC de casa a la del taller.
> Complementa `docs/secretos.md`, que responde «si esto se pierde, ¿qué haría falta para
> volver a tenerlo?». Aquí la pregunta es otra: **qué hay que llevarse.**
>
> ✅ **La mudanza está HECHA y verificada el 2026-08-30.** Lo que sigue ya no es un plan: es la
> receta, probada una vez. **§9 deja escrito cómo quedó la máquina del taller** y las dos cosas
> que le siguen faltando.

## La idea en una línea

**El código no se mueve: se clona.** Lo que hay que trasladar a mano son **cinco archivos**
que están fuera de git a propósito, y ninguno pesa más de 10 KB salvo los respaldos.

⚠️ **No copies la carpeta entera.** Arrastra `node_modules` (lento e inútil, se reinstala),
`.next` (caché que además da problemas si viaja: ver §16, «Turbopack caché envenenada») y los
respaldos con datos personales de terceros. Clonar deja la copia nueva limpia.

---

## 1. Lo que viaja solo

```bash
git clone https://github.com/adi211104/NOTORIA Vigilio
cd Vigilio
```

Todo el código, la documentación y los scripts. **Antes de empezar, comprobar en la PC vieja
que no queda nada sin subir** — si algo no está en `origin/main`, no existe para la PC nueva:

```bash
git status --short                 # tiene que salir vacío
git log origin/main..HEAD --oneline # tiene que salir vacío
```

⚠️ La app de Android es **otro repositorio**: `adi211104/APKNotoria`, hoy en
`C:\Users\Admin\Downloads\NotoriaApp`.

---

## 2. Los cinco archivos que NO están en git

| Qué | Dónde estaba (PC de casa) | Dónde quedó en el taller | Nota |
|---|---|---|---|
| `brand-shield/.env` | en el repo, ignorado | ídem | **30 claves** — ver §9 |
| `brand-shield-web/.env.local` | ídem | ídem | **No lo copies**: se regenera con `vercel env pull` |
| `certificado.p12` | `C:\Users\Admin\Downloads\` | `C:\Users\Taller\notoria-secrets\` | El certificado tributario de SUNAT |
| `notoria-upload.jks` | `C:\Users\Admin\Downloads\NotoriaApp-firma\` | `C:\Users\Taller\notoria-secrets\` | 🔴 Nivel 1: **no se puede regenerar** |
| `keystore.properties` | `C:\Users\Admin\Downloads\NotoriaApp\` | `C:\Users\Taller\NotoriaApp\` | Las 4 claves de firma: `almacen`, `claveAlmacen`, `alias`, `claveAlias` |

⚠️ **`DATABASE_URL` del `.env` apunta a PRODUCCIÓN**, y eso no cambia al mudarse: en la PC nueva
un script de mantenimiento corre contra la base real desde el primer minuto.

Y aparte, **`brand-shield/respaldos/*.json`** (~1.5 MB): ver §4.

### 🔴 Cómo moverlos, y cómo no

**No los mandes por WhatsApp, correo, Telegram ni Drive sin cifrar.** El `.env` del backend
lleva `DATABASE_URL` de **producción**, `JWT_SECRET` —que firma las sesiones *y* todas las
constancias en circulación— y las llaves de Groq, Resend, Google Places y Meta. Quien tenga
ese archivo tiene la base de datos.

Y no vale el consuelo de «si se filtra, los roto»: **dos de esos secretos no se pueden rotar
sin romper cosas**. `PROMO_HASH_SECRET` no se puede cambiar sin vaciar `promo_tarjetas`
(ninguna huella volvería a coincidir), y rotar `JWT_SECRET` invalida las sesiones, los states
de OAuth, los tokens de cambio de contraseña y **todas las constancias emitidas**.

Formas aceptables, de mejor a peor:
1. **Gestor de contraseñas** con adjuntos (es lo que ya recomienda `docs/secretos.md`).
2. **USB**, en mano.
3. Un **`.zip` cifrado** cuya contraseña viaje por otro canal distinto del archivo.

---

## 3. Lo que NO hay que copiar

| | Se rehace con |
|---|---|
| `node_modules/` | `npm install` en cada carpeta |
| `.next/` | el primer `npm run dev` o `npm run build` |
| Cliente de Prisma | `npx prisma generate` |
| `VERCEL_OIDC_TOKEN` de `.env.local` | lo regenera `vercel env pull`; además caduca |
| Sesión de Railway / Vercel / gh | `railway login`, `vercel login`, `gh auth login` |
| La llave SSH de `railway ssh` | Railway registra una nueva la primera vez |

---

## 4. Los respaldos: piensa antes de copiarlos

`brand-shield/respaldos/*.json` contiene **datos personales de terceros** —correos, nombres y
textos de reseñas de gente real— protegidos por la Ley 29733. Multiplicar las copias multiplica
el sitio del que se pueden filtrar.

**Lo razonable es no llevarlos.** En la PC nueva, cuando haga falta, se genera uno fresco:

```bash
node scripts/respaldo.js
node scripts/respaldo.js --verificar <ruta>   # tener copia no es saber restaurarla
```

Si aun así los quieres mover, que sea cifrados y borrando el original.

---

## 5. Los pasos en la PC del taller, en orden

```bash
# 1. Herramientas. Igualar versiones evita sorpresas: aquí va Node 24 (el proyecto
#    de Vercel está en 24.x) y Git.
node -v      # v24.18.0 en la PC de casa
npm -v       # 11.16.0

# 2. Clonar los dos repos
git clone https://github.com/adi211104/NOTORIA Vigilio
git clone https://github.com/adi211104/APKNotoria NotoriaApp

# 3. Dejar caer los archivos de §2 en su sitio

# 4. Dependencias
cd Vigilio/brand-shield     && npm install
cd ../brand-shield-web      && npm install

#    ℹ️ npm 11 no ejecuta los scripts de instalación por defecto, pero eso YA ESTÁ
#    RESUELTO en el repo: los dos package.json llevan un campo `allowScripts` con
#    prisma/@prisma/client/@prisma/engines y sharp/unrs-resolver ya aprobados.
#    🔴 NO BORRARLO. Sin él no se descargan los motores de Prisma, `prisma generate`
#    se queda sin nada, y el único aviso ("npm warn allow-scripts") se pierde entre el
#    ruido del final: la instalación queda a medias EN SILENCIO.
#    ⚠️ Las aprobaciones llevan la VERSIÓN EXACTA (prisma@5.22.0). Al subir versión o
#    al añadir un paquete con scripts hay que reaprobar: npm approve-scripts <pkg>
#    ⚠️ No sirve para instalaciones globales (error EGLOBAL): con @railway/cli y vercel
#    hay que comprobar a mano que el binario responde, no solo que el mandato exista.

# 5. Frontend: en vez de copiar el .env.local, pedírselo a Vercel
vercel login
vercel link            # elegir el proyecto notoria-web
vercel env pull .env.local
                       # ⚠️ baja el entorno *development*, que está VACÍO: las cuatro
                       #    NEXT_PUBLIC_* solo viven en *Production*. El .env.local sale
                       #    casi vacío y ESO ES NORMAL: el build pasa y el panel carga
                       #    porque NEXT_PUBLIC_API_URL cae a http://localhost:3000. Pero
                       #    el login con Google y el checkout de Culqi quedan muertos en
                       #    local hasta ponerles valores de test a mano.

# 6. Backend: el cliente de Prisma
cd ../brand-shield
npx prisma generate    # ⚠️ con el backend DETENIDO, o falla con EPERM en Windows

# 7. Los CLIs, enlazados POR CARPETA
railway login
railway link           # ⚠️ desde brand-shield/, NO desde la raíz del repo:
                       #    la raíz está enlazada a otro proyecto y `railway up`
                       #    desde ahí crea un servicio basura
gh auth login
```

---

## 6. Comprobar que quedó bien

No des la mudanza por buena porque «arrancó». Estas cuatro cosas sí lo prueban:

```bash
cd brand-shield
node scripts/prueba-planes.js          # 109 comprobaciones, sin red ni base
railway status                          # debe decir notoria-api / servicio api
node -e "require('dotenv').config();const{PrismaClient}=require('@prisma/client');
  new PrismaClient().usuario.count().then(n=>console.log('usuarios en produccion:',n))"
cd ../brand-shield-web && npm run build # tiene que compilar
```

⚠️ **Lo que NO va a funcionar igual, y es correcto:** los scripts que llaman a SUNAT o a Culqi.
El `.env` local **no tiene** las variables de SUNAT y lleva las llaves de Culqi de **test**, a
propósito (§3 de `CLAUDE.md`). Por eso `forzar-resumen-sunat.js` en local anuncia
`entorno: beta` y `emisión activa: NO`, y hay que correrlos dentro del contenedor:

```bash
railway ssh --service api "node scripts/forzar-resumen-sunat.js"
```

Esa trampa costó tiempo el 2026-08-28: el script **no falla**, hace lo correcto contra el
entorno equivocado. Correr siempre el simulacro y **leer la cabecera de entorno**.

✅ **Matiz comprobado el 2026-08-30:** `railway run` **también** sirve, y es lo que documentan
las cabeceras de esos scripts. Inyecta los secretos de producción en un proceso local y
`lib-env-produccion.js` sustituye la `DATABASE_URL` interna por la del `.env`. Con `railway ssh`
se ejecuta dentro del contenedor y el ayudante detecta que no hay `.env` local, avisa y no toca
nada: las dos vías son buenas. Lo prohibido es llamarlos **a pelo**, sin ningún envoltorio.

⚠️ **La excepción es `dar-plan.js`**, que usa `dotenv.config()` a secas en vez del ayudante.
Con `railway run` se quedaría con la `DATABASE_URL` **interna** y no alcanzaría la base. Va en
local y sin envoltorio.

---

## 7. Aprovecha el viaje para cerrar un pendiente

Mover el `.jks` al taller deja **dos copias en dos sitios distintos**, que es infinitamente
mejor que la única que hay hoy — y cierra a medias el único pendiente verdaderamente
irreversible de la lista (§19 B). Digo «a medias» porque dos PCs siguen siendo dos discos: lo
que de verdad lo cierra es el gestor de contraseñas o un cifrado fuera de casa.

⚠️ Y ya que estás: **`certificado.p12` vive en `Downloads`, una carpeta que se limpia sola.**
En la PC nueva ponlo en un sitio estable, no ahí.

---

## 8. Detalles menores que se agradecen después

- **La ruta de la carpeta afecta a Claude Code.** Su memoria e historial van por ruta
  (`.claude/projects/C--Users-Admin-Downloads-Vigilio`). Si en el taller clonas en otra ruta,
  empiezas con memoria en blanco; no se pierde nada del proyecto, pero conviene saberlo.
  ✅ **Pasó exactamente eso:** el proyecto vive en `C:\Users\Taller\Vigilio` y la sesión abre
  desde `C:\Users\Taller`, o sea `.claude/projects/C--Users-Taller`. La memoria arrancó en
  blanco — por eso la nota de traspaso del 28 tenía que estar **en el repo** y no en la sesión.
- **`keystore.properties` guarda la ruta del `.jks` en `almacen`.** Si en el taller lo pones en
  otra carpeta, hay que actualizar esa línea o la firma de release falla.
  ✅ Ya apunta a `C:/Users/Taller/notoria-secrets/notoria-upload.jks` y el archivo está ahí
  (comprobado el 30/08). La trampa se esquivó; queda escrita porque solo avisa al firmar.
- **El `.env` local todavía tiene `TELEGRAM_BOT_TOKEN`**, que ya no usa nadie: Telegram se
  eliminó del producto el 2026-08-22. Aprovecha para no copiarlo.
  ⚠️ **Viajó igual.** Es inofensivo —de `src/` no lo lee nadie, solo lo nombran dos comentarios
  en `auth.routes.js`— pero sobra. Se quita con `sed -i '42,44d' brand-shield/.env`, que borra
  la clave y su cabecera; comprobar después que quedan **29** líneas con `=`.
- **Firewall de Windows**: si vas a probar desde el móvil en la red local, hace falta abrir el
  puerto 3000 en la PC nueva (§7 de `CLAUDE.md`).

---

## 9. Cómo quedó la PC del taller (verificado el 2026-08-30)

No es «arrancó»: es cada cosa comprobada por separado, que es la vara que pone §6.

| Qué | Resultado |
|---|---|
| Herramientas | Node **v24.18.0**, npm **11.16.0**, git 2.55.0 — mismas versiones que la PC de casa |
| `brand-shield` | `node_modules` instalado y **cliente de Prisma generado** (`.prisma/client` existe) |
| `.env` del backend | **30 claves**, sin líneas sueltas ni duplicadas |
| `.env.local` del frontend | **solo `VERCEL_OIDC_TOKEN`**, y eso es lo correcto: `vercel env pull` baja el entorno *development*, que está vacío (§5) |
| Pruebas sin red | `node scripts/prueba-planes.js` → **109 pasadas · 0 fallidas** |
| Railway | `railway status` desde `brand-shield/` → proyecto **notoria-api**, servicio **api**, entorno production |
| Vercel | `vercel whoami` → `adi211104`; `.vercel/project.json` enlazado a **notoria-web** |
| GitHub | `gh auth status` → `adi211104`, scopes `gist, read:org, repo` |
| Base de producción | alcanzable desde local: 10 usuarios · 13 negocios · 96 reseñas |
| Build del frontend | `npm run build` **compila entero** |
| Los 3 secretos fuera del repo | `certificado.p12` y `notoria-upload.jks` en `C:\Users\Taller\notoria-secrets\`, `keystore.properties` en `C:\Users\Taller\NotoriaApp\`. Los otros dos de §2 son los `.env`, que van dentro del repo pero ignorados |
| Respaldo | regenerado en la máquina nueva y verificado: **1926 filas, 0.67 MB, 0 filas que se perderían** |

### Lo que a esta PC todavía le falta

🔴 **No hay JDK ni Android SDK.** `keytool` no responde y no está instalado Android Studio, así
que en el taller **no se puede compilar el AAB ni comprobar el keystore** (`keytool -list -v`),
que es justo lo que §19 E de `CLAUDE.md` manda hacer *antes de nada* al retomar Google Play.
El `.jks` está a salvo y su ruta configurada; lo que falta es la herramienta para abrirlo.
⚠️ Es una diferencia real con la PC de casa y no se nota hasta que se intenta publicar, así que
va escrita acá y no en la cabeza de nadie.

⚠️ **La carpeta `respaldos/` llegó vacía**, como debe (§4). Se regeneró el mismo 30/08. Mientras
no se regenere, una PC recién mudada **no tiene copia local de nada**: es el hueco más silencioso
de toda la mudanza, porque todo lo demás falla ruidosamente y esto no falla, simplemente no está.

🔴 **No está la extensión de navegador, y media lista de pendientes la necesita.** Es la tercera
cosa que no viaja con el repo y la más fácil de no echar en falta, porque nada la reclama: sin
ella no se puede mirar el buzón de `usenotoria@gmail.com` (el acuse de Google), ni los paneles de
Meta y Google Cloud, ni cerrar el pendiente del **panel en móvil y en inglés** — que sigue abierto
justamente porque el proxy sirve desde `localhost:3001`, otro origen, y ahí no hay sesión.

- Se instala desde la Chrome Web Store (busca «Claude», extensión de Anthropic) y después se
  arranca la sesión con `claude --chrome`, o se deja fijo con `/chrome` → *Enabled by default*.
- Funciona en Chrome, Edge y los demás Chromium (Brave, Arc, Vivaldi, Opera). **No en WSL.**
- ⚠️ **Una sesión sin `--chrome` no tiene herramientas de navegador aunque la extensión esté
  instalada.** Es la confusión previsible: la extensión es condición necesaria, no suficiente.

### Lo que la mudanza dejó como enseñanza

🔴 **Lo que se arregló en origen, no documentando.** npm 11 no ejecuta scripts de instalación por
defecto y dejaba a Prisma **sin motores, en silencio**. Se resolvió con el campo `allowScripts`
en los dos `package.json` (commit `0496e7d`), porque una trampa que solo vive en un documento se
la come el siguiente que no lo lea. **No borrar ese campo.**

⚠️ **Reproducir la mudanza destapó cosas que nada más habría destapado:** `dar-plan.js` se había
quedado sin IMPULSO en su lista de planes, el contador de `prueba-planes.js` decía 64 cuando eran
109, y un par de rutas seguían apuntando a la PC anterior. Ninguna se ve desde una máquina que ya
funciona — que es el argumento para instalar de cero de vez en cuando aunque no toque mudarse.
