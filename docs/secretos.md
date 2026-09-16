# Secretos de Notoria — qué hay, dónde vive y qué pasa si se pierde

> ⚠️ **Este archivo NO contiene ningún secreto y no debe contenerlo nunca.** Es el inventario:
> qué existe, dónde está la única copia y cómo se recupera. Los valores van en un gestor de
> contraseñas, nunca en el repositorio.

Escrito el 2026-08-23, después de comprobar que varias credenciales vivían **solo** en Railway.
Railway no es un respaldo: es un servicio del que se depende. Si mañana se pierde el acceso a
esa cuenta, lo que solo esté ahí desaparece con ella.

---

## La pregunta que ordena todo

No es «¿está guardado?», es **«si se perdiera, ¿qué haría falta para volver a tenerlo?»**.
Con esa vara, los secretos caen en tres niveles muy distintos, y solo el primero justifica
perder el sueño.

---

## 🔴 Nivel 1 — hay que tramitar algo con un tercero, y se tarda días

| Secreto | Dónde vive hoy | Si se pierde |
|---|---|---|
| **`notoria-upload.jks`** + su contraseña | **Dos copias** (2026-09-16): PC del taller (`C:\Users\Taller\notoria-secrets\`, verificada con `keytool`) y PC de casa, con su `keystore.properties`. ⚠️ Si la de casa se jubila, se vuelve a tener una sola | **No hay app que publicar.** La clave de subida de Android no se puede regenerar: habría que crear otra identidad de app. ⚠️ Tras la primera subida a Play, Google App Signing la vuelve recuperable — hoy todavía no |
| **`SUNAT_CERT_PASSWORD`** | Solo en Railway | El `.p12` se convierte en un archivo inútil: **sin la contraseña no se puede abrir**, y sin abrirlo no se firma ningún comprobante. Habría que tramitar otro Certificado Digital Tributario con SUNAT |

⚠️ **El archivo `certificado.p12` sí tiene dos copias** (`Downloads\certificado.p12` y el
base64 en Railway), pero *Downloads* es una carpeta que se limpia sola y que vive en una sola
máquina. Cópialo a donde guardes lo importante.

🔴 **Un certificado sin su contraseña no vale nada.** Los dos van juntos o no van.

---

## 🟠 Nivel 2 — se pueden cambiar, pero rompen cosas al hacerlo

| Secreto | Qué rompe rotarlo |
|---|---|
| **`JWT_SECRET`** | Cierra todas las sesiones, invalida los states de OAuth y los tokens de cambio de contraseña, y **deja sin verificar todas las Constancias de Reputación en circulación** — su firma se recalcula con este secreto (§14) |
| **`PROMO_HASH_SECRET`** | **No se puede rotar sin vaciar `promo_tarjetas`**: ninguna huella volvería a coincidir y el control de «una promo por tarjeta» dejaría de funcionar. ✅ Hoy esa tabla está vacía, así que el coste es cero — pero crece con cada cliente |

Los dos son cadenas que generamos nosotros: si se pierden, se pone una nueva y se asume el
daño de arriba. Por eso están en nivel 2 y no en 1.

---

## 🟢 Nivel 3 — un reseteo de cinco minutos

Todo lo demás. Se entra al panel del proveedor, se genera de nuevo y se carga en Railway.
**Aquí entra `SUNAT_SOL_CLAVE`**, que es justamente la que suele preocupar y la que menos lo
merece: se cambia en Clave SOL → *Administración de usuarios secundarios* en un par de
minutos. Se hizo el 2026-08-23.

| Secreto | Dónde se regenera |
|---|---|
| `SUNAT_SOL_CLAVE` | Clave SOL del RUC → usuarios secundarios → ficha de `NOTORIAS` |
| `CULQI_SECRET_KEY`, `CULQI_PUBLIC_KEY`, `CULQI_WEBHOOK_SECRET` | CulqiPanel |
| `META_APP_SECRET`, `META_IG_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | Panel de desarrolladores de Meta |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY` | Google Cloud Console, proyecto 798376364749 |
| `GROQ_API_KEY` | Consola de Groq |
| `RESEND_API_KEY` | Resend. ⚠️ No se puede volver a *ver*, pero sí regenerar |
| API key de Resend del **alias de Gmail** | Resend. Es una key **distinta** de la del backend, a propósito: revocar una no tumba la otra |
| `TIKTOK_*` | Panel de TikTok for Business |
| `DATABASE_URL` | La genera Railway |

---

## Qué anotar de cada uno

El valor solo no basta. Cuando haga falta, va a ser con prisa y sin contexto:

```
Nombre exacto de la variable : SUNAT_SOL_CLAVE
Valor                        : (en el gestor de contraseñas)
Para qué                     : firmar y enviar comprobantes a SUNAT producción
Usuario asociado             : NOTORIAS (secundario), RUC 20616239466
Cómo se recupera             : Clave SOL → Administración de usuarios secundarios
Al cambiarlo                 : bash scripts/cargar-secreto.sh SUNAT_SOL_CLAVE
Cómo se comprueba            : railway run --service api node scripts/sonda-sunat-produccion.js
```

⚠️ **Anotar también los permisos, no solo la clave.** El usuario `NOTORIAS` estaba activo y con
el nombre correcto y aun así fallaba, porque no tenía asignada ninguna opción del menú SOL. Sin
esa nota, el próximo que lo mire vuelve a perder la tarde (§9).

---

## Cómo cargarlos sin dejar rastro

```bash
cd brand-shield && bash scripts/cargar-secreto.sh <NOMBRE_VARIABLE>
```

Lo pide por teclado, no pasa por la línea de comandos ni queda en el historial, limpia BOM y
espacios, y **se niega a cargar** si quedan caracteres no imprimibles.

🔴 **Nunca por un pipe desde PowerShell.** Antepone un BOM UTF-8 invisible: una llave de Culqi
quedó de 25 caracteres en vez de 24 y devolvía 401 exactamente igual que si estuviera revocada
(§3).

---

## Lo que hay que hacer, por orden

- [x] Copiar `notoria-upload.jks` y su contraseña fuera de esta PC — hay copia en la PC de casa (2026-09-16)
- [ ] Copiar `certificado.p12` fuera de *Downloads*, junto con `SUNAT_CERT_PASSWORD`
- [ ] Guardar `JWT_SECRET` y `PROMO_HASH_SECRET` — no por si se pierden, sino para no tener
      que rotarlos
- [ ] Guardar `SUNAT_SOL_CLAVE` con la nota de los permisos
- [ ] El resto, cuando toque: son un reseteo
