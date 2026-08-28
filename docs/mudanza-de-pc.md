# Mudar el proyecto a otra PC

> Escrito el 2026-08-28, al pasar el trabajo de la PC de casa a la del taller.
> Complementa `docs/secretos.md`, que responde «si esto se pierde, ¿qué haría falta para
> volver a tenerlo?». Aquí la pregunta es otra: **qué hay que llevarse.**

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

| Qué | Dónde está hoy | Nota |
|---|---|---|
| `brand-shield/.env` | en el repo, ignorado | 31 claves. **`DATABASE_URL` apunta a PRODUCCIÓN** |
| `brand-shield-web/.env.local` | ídem | **No lo copies**: se regenera con `vercel env pull` |
| `certificado.p12` | `C:\Users\Admin\Downloads\` | El certificado tributario de SUNAT |
| `notoria-upload.jks` | `C:\Users\Admin\Downloads\NotoriaApp-firma\` | 🔴 Nivel 1: **no se puede regenerar** |
| `keystore.properties` | `C:\Users\Admin\Downloads\NotoriaApp\` | Las 4 claves de firma: `almacen`, `claveAlmacen`, `alias`, `claveAlias` |

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

# 5. Frontend: en vez de copiar el .env.local, pedírselo a Vercel
vercel login
vercel link            # elegir el proyecto notoria-web
vercel env pull .env.local

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
node scripts/prueba-planes.js          # 81 comprobaciones, sin red ni base
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
- **`keystore.properties` guarda la ruta del `.jks` en `almacen`.** Si en el taller lo pones en
  otra carpeta, hay que actualizar esa línea o la firma de release falla.
- **El `.env` local todavía tiene `TELEGRAM_BOT_TOKEN`**, que ya no usa nadie: Telegram se
  eliminó del producto el 2026-08-22. Aprovecha para no copiarlo.
- **Firewall de Windows**: si vas a probar desde el móvil en la red local, hace falta abrir el
  puerto 3000 en la PC nueva (§7 de `CLAUDE.md`).
