# Notoria — operación y administración

Manual operativo de **NOTORIA E.I.R.L.**: decisiones fiscales, bancarias y de facturación
que sostienen el producto. La documentación técnica está en cada paquete
(`brand-shield/README.md`, `brand-shield-web/README.md`) y el detalle de arquitectura
en `CLAUDE.md`.

> Este archivo no contiene números de cuenta, claves ni credenciales, y no debe contenerlos.
> Los certificados y secretos van en variables de entorno (ver `brand-shield/.env.example`).

**Última revisión:** 3 de agosto de 2026

---

## 1. Datos de la empresa

| | |
|---|---|
| Razón social | NOTORIA E.I.R.L. |
| RUC | 20616239466 |
| Domicilio fiscal | Cal. Isla Filipinas Mza. G9 Lote 8, **La Perla, Provincia Constitucional del Callao**, Perú (ubigeo INEI 070104) |
| Marca / dominio | Notoria · usenotoria.app |
| Producto | SaaS de monitoreo de reputación para restaurantes y hoteles en LATAM |
| Planes | Gratuito · Negocio S/59/mes · Franquicia S/179/mes (S/143/mes anual) |

**Los precios están en soles e incluyen IGV.** Los cobros se procesan por Culqi en PEN. Fuente única: `brand-shield/src/lib/precios.js`.

---

## 2. Facturación electrónica ante SUNAT

### Ruta elegida: SEE — Del Contribuyente

Emisión desde el propio backend, **sin PSE ni OSE de pago**. Se confirmó que el
**Certificado Digital Tributario (CDT) gratuito de SUNAT** es válido para este sistema
—sirve para SEE-Del Contribuyente, Facturador SUNAT y OSE—, así que no hace falta comprar
certificado ni pagar mensualidad a un proveedor.

**Certificado en mano y verificado (26/07/2026):** emitido por **RENIEC**
(ECEP-RENIEC CA Class 1 II) a nombre de `||USO TRIBUTARIO|| NOTORIA E.I.R.L. CDT
20616239466`. RUC coincide. **Vigencia: 27/07/2026 → 26/07/2029.** Ojo con el inicio:
nada firmado antes del 27/07/2026 a las 11:36 (hora Lima) sería válido para SUNAT.

- CDT gratuito, vigencia **3 años**. SUNAT está autorizada a emitirlos hasta el **31/12/2027**.
- Uso exclusivo para firmar comprobantes de pago electrónicos.
- La contraseña del `.p12` no está en el repositorio ni debe estarlo: va en
  `SUNAT_CERT_PASSWORD` (Railway) y, si se prueba en local, en el `.env` que está
  en `.gitignore`. El `.p12` está en una carpeta sincronizada con OneDrive —
  conviene moverlo a una carpeta local.
- El `.p12` **nunca va al repositorio** (`*.p12`, `*.pfx`, `*.pem`, `*.key` están en `.gitignore`).
  En producción se carga como `SUNAT_CERT_P12_BASE64` y se decodifica en memoria.

### Criterio de precios: el precio publicado INCLUYE IGV

| Cliente | Comprobante | Tratamiento |
|---|---|---|
| Peruano con RUC | Factura | S/59 = base S/50.00 + IGV S/9.00 · tipo de operación `0101` |
| Peruano sin RUC | Boleta | Igual desglose · se informa por **resumen diario**, no una a una |
| Del exterior | Factura de exportación | sin IGV · tipo de operación `0201` — implementado pero sin uso: hoy el servicio es solo nacional |

La lógica vive aislada en `brand-shield/src/lib/tributario.js` para que un contador la
pueda auditar sin leer el resto del backend.

### Estado de implementación

**Fase A — completa (26/07/2026).** Comprobantes internos con desglose tributario, PDF
para el cliente y copia por correo a la empresa. Se emite tipo `VOUCHER` (serie **V001**),
rotulado en el PDF como constancia que **no es comprobante de pago electrónico**.

Las series fiscales F001/B001 se dejan sin usar a propósito: reservar números que todavía
no se pueden enviar a SUNAT dejaría **huecos en la numeración**, que es infracción. Al
poner `SUNAT_EMISION_ACTIVA=true` el mismo código emite facturas y boletas reales.

**Fase B — núcleo validado contra SUNAT beta (26/07/2026).** El ciclo completo
—XML UBL 2.1, firma digital, envío SOAP y lectura del CDR— está implementado en
`brand-shield/src/sunat/` y **probado contra el entorno real de pruebas de SUNAT**:
factura gravada, factura de exportación de servicios y boleta, las tres **aceptadas
con código 0 y sin observaciones**.

Se desarrolló con un **certificado autofirmado**, que es lo que acepta el entorno beta.
Al llegar el `.p12` real y el usuario SOL solo cambian variables de entorno.

**Cola de envío, persistencia y QR — completos.** El worker corre cada 10 minutos,
reintenta con espera creciente cuando SUNAT no responde, y **no** reintenta cuando el
rechazo es de fondo (eso exige corregir y reemitir). Vigila el plazo legal y **avisa por
correo a la empresa** ante un rechazo o un vencimiento: son cosas que no se arreglan
solas y hay que verlas el mismo día, no al cerrar el mes. El XML firmado y el CDR se
guardan en la base de datos, y la representación impresa ya lleva el código QR.

Los cuatro documentos están construidos y **aceptados por el entorno beta de
SUNAT** desde el 06/08/2026: factura, boleta, **resumen diario de boletas**
(incluida la anulación en estado 3) y **comunicación de baja** de facturas.
Falta enchufar el resumen a la cola de envío — ver Pendientes.

Restricciones que condicionan el diseño:

- **Plazo de envío: 3 días calendario** desde el día siguiente a la emisión. Fuera de
  plazo el comprobante **pierde validez tributaria total**, aunque ya se haya entregado
  al cliente. El envío necesita cola con reintentos, no un `fetch` dentro del webhook.
- El **XML firmado y el CDR deben conservarse 5 años**. El disco de Railway es efímero:
  hará falta almacenamiento externo o guardarlos en base de datos.
- Las **boletas van por resumen diario**, que es un flujo aparte del de facturas.

### Trámites pendientes (fuera del código)

- [ ] Afiliación al **SEE-Del Contribuyente** en SUNAT Operaciones en Línea
      (Empresa → Comprobantes de Pago → SEE Del Contribuyente → autorización de
      incorporación, subiendo certificado y correo). Vigente desde el día siguiente.
- [ ] Crear un **usuario SOL secundario** con permiso *solo* de emisión de comprobantes.
      Nunca usar la Clave SOL principal en producción.
- [ ] Inscripción en el **Registro de Exportadores de Servicios** (RS 312-2017).
      ⚠️ **Sin esta inscripción las ventas al exterior no califican como exportación**:
      pasan a tipo de operación `0401` y **sí llevarían IGV**. Trámite gratuito por SOL.
- [ ] Recuperar la contraseña del `.p12` (se define al solicitar el CDT en SOL).

> Nada de esto es asesoría tributaria. Confirmar los tres puntos con un contador antes
> de emitir el primer comprobante fiscal real.

---

## 3. Banca

**RESUELTO (2026-08-03): se opera con la cuenta que la empresa ya tiene en el BCP.**
Está a nombre de NOTORIA E.I.R.L., los poderes ya están registrados y **ya está
registrada en Culqi** con el nombre y el RUC del comercio — que es exactamente lo que
Culqi exige para depositar (el titular de la cuenta debe coincidir con la ficha RUC).

Se evaluó migrar a otro banco por ahorro de mantenimiento y **se descartó**: el ahorro
anual no compensa rehacer una apertura de persona jurídica (dos documentos de SUNARP con
caducidad de 15 días + revisión de poderes) ni volver a registrar la cuenta en Culqi y
esperar el depósito real de verificación. No reabrir esta comparativa.

Datos que siguen siendo ciertos y condicionan la operación:

- **La persona jurídica no lleva tarjeta de débito.** Railway, Vercel y las APIs de IA se
  pagan con tarjeta personal y se rinden, cuidando que el comprobante esté a nombre de
  NOTORIA. Los importes están muy por debajo del umbral de bancarización (S/2,000 o
  US$500 por operación), así que es viable, pero hay que documentarlo bien para la
  deducción del Impuesto a la Renta.
- **Culqi abona cada 4 días hábiles** y admite **una cuenta bancaria por moneda**, sin
  convertir entre ellas.
- La cuenta pasa a "Inactiva" sin movimientos por 6 meses — no aplica: con los abonos de
  Culqi hay movimiento constante.

### Cuenta en dólares — diferida

Desde el 2026-07-28 se cobra en soles, así que una sola cuenta basta para operar. Cuando
llegue el primer cliente del exterior conviene abrir la cuenta en dólares para evitar la
doble conversión (USD→PEN al cobrar, PEN→USD al pagar Railway, Vercel y las APIs, con
~1-3% de spread cada una) y registrar su CCI en Culqi.

---

### Cómo verificar que todo sigue funcionando

Siete scripts en `brand-shield/scripts/`. Los dos primeros son locales; los demás
**envían de verdad al entorno beta de SUNAT**, sin tocar producción:

```bash
cd brand-shield
node scripts/generar-cert-prueba.js   # una sola vez: certificado autofirmado
node scripts/prueba-comprobantes.js   # reglas tributarias y PDFs
node scripts/prueba-xml-firma.js      # XML UBL, firma y verificación criptográfica
node scripts/prueba-sunat-beta.js     # factura, exportación y boleta contra SUNAT beta
node scripts/prueba-cola-envio.js     # cola: reintentos, plazo vencido, rechazo
node scripts/prueba-resumen-beta.js   # resumen diario de boletas y su anulación
node scripts/prueba-baja-beta.js      # comunicación de baja de facturas
node scripts/prueba-resumen-cola.js   # cola del resumen: agrupación, ticket, veredicto
```

El beta usa el RUC de pruebas `20000000001` con usuario `MODDATOS`/`moddatos` y acepta
certificados autofirmados, por eso no hace falta el certificado real para desarrollar.
Ese usuario es compartido: si devuelve **401**, es saturación y no credenciales — los
scripts ya reintentan solos.

---

## 4. Pendientes

**Banca** — resuelto, ver sección 3
- [x] Cuenta en soles del BCP, a nombre de NOTORIA E.I.R.L. y ya registrada en Culqi
- [ ] *(diferido)* Abrir la cuenta en dólares y registrar su CCI — solo al vender al exterior

**SUNAT**
- [x] Contraseña del `.p12` — certificado verificado, RUC coincide (26/07/2026)
- [x] Domicilio fiscal confirmado contra la ficha RUC y corregido en código y páginas legales
- [ ] Afiliación al SEE-Del Contribuyente + usuario SOL secundario
- [ ] Registro de Exportadores de Servicios
- [ ] Validar el criterio de IGV y exportación con un contador
- [x] ~~Preguntar al contador si las boletas van por resumen diario~~ —
      **resuelto por norma el 06/08/2026, no hacía falta preguntar.** El resumen
      diario es **obligatorio** para toda boleta de venta electrónica y sus
      notas: hay que enviarlo el mismo día de emisión o, como muy tarde, hasta
      el **sétimo día calendario siguiente**. Que el web service acepte una
      boleta suelta por `sendBill` no sustituye la obligación de informarla por
      resumen. No hay elección que hacer ni depende del tipo de negocio
- [ ] Verificar que el ubigeo **070104** corresponde al domicilio fiscal
- [x] `SUNAT_CERT_P12_BASE64` cargado en Railway (06/08/2026, 12.616 caracteres,
      longitud verificada contra el archivo local)
- [ ] `SUNAT_CERT_PASSWORD` en Railway — **la pone el usuario**, no está en
      ningún archivo:
      `railway variables --set "SUNAT_CERT_PASSWORD=..." --service api`
- [ ] `SUNAT_SOL_USUARIO` y `SUNAT_SOL_CLAVE` (del usuario SOL secundario, que
      todavía no existe)
- [ ] `SUNAT_ENTORNO=produccion`. ⚠️ **Sin esta variable el backend apunta al
      BETA**: los comprobantes de clientes reales se irían al entorno de
      pruebas y no existirían para SUNAT, sin ningún error visible
- [ ] `SUNAT_EMISION_ACTIVA=true` — **el último interruptor, no el primero**
- [ ] Mover el `.p12` fuera de OneDrive (hoy la llave privada está sincronizada
      en la nube)

**TikTok** — ✅ terminado el 06/08/2026 (detalle en `CLAUDE.md` §15-octies)
- [x] App aprobada en `business-api.tiktok.com` con los 4 permisos de TikTok Accounts
- [x] Leer comentarios, responder, borrar la propia respuesta, ocultar y fijar — en producción
- [x] Confirmado que la app **no** está en Sandbox: sirve para cuentas de clientes reales
- [ ] *(opcional)* Probarlo con la cuenta de un tercero, no solo la propia
- [ ] *(opcional)* Pedir el permiso **Discovery Search**, único candidato para hacer
      menciones sin pagar un proveedor externo (§18)

**Meta / Instagram + App Review** (detalle técnico exacto en `CLAUDE.md` §19)
- [x] Negocio NOTORIA verificado en Meta Business Manager (29/07/2026)
- [x] Página de eliminación de datos en producción (`usenotoria.app/eliminar-datos`)
- [x] Formulario de tratamiento de datos respondido (política de respaldo en
      `docs/politica-solicitudes-autoridades.md`)
- [x] **App tipo NEGOCIO creada** (06/08/2026): ID `2232447584255257`. La primera
      (1709333600393009) era tipo Consumidor y no servía
- [x] Llaves de la app nueva en Railway, verificadas dentro del contenedor, y el
      soporte de `config_id` ya desplegado (Railway `4ebfdbc3`)
- [ ] **Rotar `META_APP_SECRET`** (se compartió por chat) y volver a cargarlo en
      Railway — si se rota sin actualizar, el OAuth falla con un error genérico
- [x] Configuración → Básica completa (dominios, privacidad, condiciones,
      eliminación de datos, ícono) y formulario de tratamiento de datos
- [x] Producto **Facebook Login for Business** con el redirect URI
      `https://api.usenotoria.app/api/redes/instagram/callback`, `public_profile`
      en acceso avanzado, y Configuración creada:
      `META_LOGIN_CONFIG_ID=4655107931374707`, cargado en Railway y verificado
      dentro del contenedor. El diálogo de Facebook responde 200 nombrando la app
- [x] **"Conectar Instagram" probado y funcionando** (06/08/2026)
- [x] Resultado de la conexión visible en el panel: antes, quien no tenía la
      cuenta vinculada a una página de Facebook autorizaba y volvía a una
      pantalla que no decía nada. Ahora el aviso explica el caso y lleva los
      pasos para vincularla
- [x] **Frontend desplegado a Vercel** (06/08/2026) — verificado descargando el
      bundle desde `usenotoria.app`: el aviso nuevo se sirve de verdad, no solo
      "el deploy dice READY"
- [ ] ⚠️ **Límite conocido:** un negocio sin cuenta de Facebook no puede
      conectar Instagram. Si llega a pesar, la salida es añadir el sabor
      *Instagram Login* como segunda opción (aditivo, pero con su propio App
      Review) — ver `CLAUDE.md` §19.8
- [x] "Conectar Instagram" probado con IG Business + página de FB (06/08/2026)
- [x] **Renovación del acceso a datos enviada** (06/08/2026, *In review*, hasta
      10 días) — era el requisito para pasar la app a modo Activo
- [x] **App en modo Activo**, que es lo que habilita enviar el App Review
- [x] **Comentarios de Instagram cableados** (leer, responder y borrar la
      respuesta propia). Sin esto el revisor habría conectado la cuenta y visto
      la pestaña vacía: rechazo seguro
- [x] Ventana de lectura explícita: **25 publicaciones × 30 comentarios**. Antes
      el límite de comentarios no se fijaba y mandaba el valor por defecto de
      Meta, que no controlamos
- [ ] *(mejora de fondo, tras el App Review)* **Webhooks de Instagram** para
      recibir comentarios de **cualquier** publicación, sin ventana. Usan el
      mismo permiso ya solicitado. No sustituyen al barrido: los webhooks solo
      notifican desde que se configuran, así que el histórico sigue leyéndose
- [x] **Migración del enum aplicada en producción** (06/08/2026): backend
      desplegado primero (`02a27eaa`) y después el `db push`. Verificado con
      `prisma migrate diff` en ambos sentidos → *empty migration*
- [ ] Crear cuenta de prueba del revisor (plan NEGOCIO vía `scripts/dar-plan.js`)
      con un negocio y su Instagram ya conectado — si el revisor entra y no ve
      comentarios, no puede verificar `instagram_manage_comments`
- [ ] Grabar screencast y enviar el App Review (4 permisos: instagram_basic,
      instagram_manage_comments, pages_show_list, pages_read_engagement).
      💡 El panel se autodetecta en inglés según el navegador y hay selector en
      Ajustes, así que el screencast puede grabarse en inglés y evitar el
      requisito de subtítulos de Meta
- [ ] WhatsApp Cloud API en la misma app: plantilla UTILITY + credenciales en Railway

**Crecimiento / landing (sesión 03/08/2026)**
- [x] Repo en GitHub (`adi211104/NOTORIA`) con push funcionando
- [x] Widget "analiza tu negocio gratis" en el hero — funcionando en producción
- [x] Drip de emails de onboarding activo (día 2 / 5 / 7, cron 10:00 Lima)
- [x] Botón de WhatsApp de ventas (51 955 599 041)
- [x] Tabla comparativa rediseñada, sin "Próximamente" en páginas públicas
- [x] `@vercel/analytics` instalado
- [x] **Facebook Reviews retirado** de comparativa/tarjetas/planes: verificado en
      código que no existe ruta para conectar una página de FB (el token jamás se
      llena). El scraper queda intacto para cuando se construya el flujo
- [x] OG image en PNG (las vistas previas de WhatsApp/Facebook no renderizan SVG)
- [x] JSON-LD: FAQPage + SoftwareApplication (layout) y BlogPosting (blog)
- [x] Google Search Console verificado + sitemap enviado (03/08/2026)
- [x] DMARC `p=none` en Cloudflare — revisar reportes y subir a `p=quarantine` (~sept)
- [x] Monitor de uptime con GitHub Actions (ping cada 15 min, email si falla)
- [x] **Blog SEO en producción**: `/blog` + 5 artículos (contenido en
      `brand-shield-web/src/lib/blog.js`; agregar artículo = una entrada ahí)
- [ ] Habilitar Web Analytics en el dashboard de Vercel (sin eso no recolecta)
- [ ] Capturas reales del panel en el landing (faltan 4 screenshots del dashboard:
      score/gauge, reseñas con sospechosa, chat IA, tab Comentarios con TikTok)
- [ ] Escribir 1-2 artículos nuevos del blog al mes

**Producto**
- [x] `npx prisma db push` para crear las tablas de comprobantes en producción
      (aplicado; el 29/07/2026 se verificó con `prisma migrate diff` que la BD de
      prod coincide 100% con el schema — no queda nada por migrar)
- [x] Fase B — núcleo: XML UBL 2.1 + firma + envío, aceptado por SUNAT beta (26/07/2026)
- [x] Fase B — cola de envío con reintentos y vigilancia del plazo legal
- [x] Fase B — persistencia del XML firmado y el CDR
- [x] Fase B — QR en la representación impresa
- [x] Fase B — resumen diario de boletas: **aceptado por SUNAT** (06/08/2026).
      El error 2522 era `cac:Status/cbc:ConditionCode`, que faltaba — va en
      `cac:`, no en `sac:` (detalle en `CLAUDE.md`)
- [x] Fase B — anulación de boletas: resumen diario en estado 3, verificado
      contra el beta (informar → anular, ambos aceptados)
- [x] Fase B — comunicación de baja (RA) para facturas: aceptada por SUNAT
      (06/08/2026). `src/sunat/ublComunicacionBaja.js`

- [x] Fase B — **resumen enchufado a la cola** (06/08/2026).
      `resumenSunat.worker.js` agrupa las boletas por día de emisión, manda el
      resumen, **guarda el ticket** y propaga el veredicto a cada boleta. Las
      facturas siguen yendo una a una por `envioSunat.worker.js`, que ahora
      filtra por `tipo: 'FACTURA'`. Cada cola vigila su plazo: 3 días la
      factura, 7 el resumen. 20 comprobaciones en `prueba-resumen-cola.js`
- [x] **Migración aplicada en producción** (06/08/2026): tabla `resumenes_sunat`
      y columna `comprobantes.resumenId`. Desplegado primero (Railway
      `d20b9987` SUCCESS) y migrado después — en ese orden, porque
      `prisma db push` corre dentro del contenedor y lee el schema del código
      desplegado. Verificado con `prisma migrate diff` contra prod: *empty
      migration*. `/health` 200 y los dos workers arrancan y se declaran
      inactivos a la espera de `SUNAT_EMISION_ACTIVA`

**Culqi** — operativo con llaves de **TEST** desde el 05/08/2026
- [x] Llaves de test en `.env` / `.env.local` **y en Railway y Vercel**
- [x] `node scripts/prueba-culqi.js` — circuito real contra Culqi, en verde
- [x] Pago real de prueba end-to-end: cobro, comprobante y promo aplicada
- [ ] **Solicitud enviada a Culqi** (asunto `MI COMERCIO FUE OBSERVADO`) —
      esperando respuesta. Ver "Observación de la web" abajo
- [ ] Llaves **live** en Railway y Vercel cuando aprueben.
      ⚠️ **En Vercel no basta con cargar la variable: hay que volver a desplegar**,
      porque `NEXT_PUBLIC_*` se incrusta en el build
- [ ] Registrar el webhook en el panel de Culqi con `?secret=` y `CULQI_WEBHOOK_SECRET`

> ⚠️ **Riesgo asumido mientras haya llaves de test en producción:** el botón
> "Pagar" de https://usenotoria.app/precios acepta la tarjeta de prueba
> `4111 1111 1111 1111` y **activa el plan sin cobrar dinero real**. Al rotar a
> live, revisar la tabla `pagos` por si alguien se coló (los de prueba tienen
> `culqiCargoId` con prefijo `chr_test_`).
>
> 🔴 **Y por eso Culqi tiene que pasar a live ANTES de encender
> `SUNAT_EMISION_ACTIVA`.** Con la emisión activa y llaves de test, cualquiera
> que pague con `4111 1111 1111 1111` generaría un **comprobante fiscal real
> enviado a SUNAT por una venta que nunca ocurrió**. Eso es declarar ingresos
> inexistentes, y no se borra: habría que emitir comunicación de baja o nota de
> crédito, con el agravante de que la numeración no admite huecos. **El orden
> correcto es: Culqi live → trámites en SOL → emisión.**

**Observación de la web por Culqi (05/08/2026) — subsanada**
Culqi observó usenotoria.app por "Flujo de compra | Carrito de compras | Botón
pagar" y "Falta información legal". Se creó el catálogo público `/precios` con
botón de pago sin sesión, el Libro de Reclamaciones **integrado**
(`/libro-reclamaciones`), `/devoluciones` y `/contacto`, y los datos de contacto
en el pie de todas las páginas. Detalle en `CLAUDE.md` §2-bis.
- [ ] **Pendiente:** no se enviaron credenciales de cuenta de prueba (decisión:
      que el revisor cree la suya). Si vuelven a observar, mirar aquí primero.

**Gestión del Libro de Reclamaciones** — por terminal, sin panel web:
`railway run --service api node scripts/reclamaciones.js`. Plazo legal: **15 días
hábiles**. Un cron diario avisa de lo que está por vencer.

**Bugs abiertos en producción** (detalle técnico y arreglo en `CLAUDE.md`,
sección "🔴 Bugs ABIERTOS en producción")
- [x] **`trust proxy` en false** — el rate-limit no distinguía usuarios: todos
      compartían un solo cupo, así que unos pocos usuarios activos podían bloquear
      a los demás y el freno anti-fuerza-bruta del login no protegía por persona.
      Arreglado y desplegado el 29/07/2026; verificado en los logs de prod.
- [x] **`GET /api/negocios/:id` mandaba los access tokens al navegador** (TikTok,
      Instagram, Facebook y Google Business). Arreglado y desplegado el 29/07/2026
      con un saneador central; el panel ahora recibe booleanos de "conectado" en
      vez de los tokens. 10 pruebas en `scripts/prueba-negocio-publico.js`.
- [ ] *(pendiente menor)* Confirmar la fuga cerrada con una sesión real: entrar al
      panel, abrir la pestaña Network en `/dashboard/conexiones` y comprobar que la
      respuesta de `/api/negocios` no trae ningún campo `*AccessToken`.

---

## Fuentes

- [SUNAT — Certificado Digital](https://cpe.sunat.gob.pe/certificado-digital)
- [SUNAT — SEE del Contribuyente](https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente)
- [gob.pe — Obtener el Certificado Digital Tributario](https://www.gob.pe/26725-obtener-certificado-digital-tributario)
- [SUNAT — Anexo N.° 8, catálogo de códigos](https://www.sunat.gob.pe/legislacion/superin/2017/anexoE-245-2017.pdf)
- [SUNAT — Exportación de servicios](https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/exportacion-servicios)
- [Culqi — Depósitos](https://docs.culqi.com/es/documentacion/pagos-online/depositos/resumen/)
- [BCP — Tarifario de cuentas para empresas](https://www.viabcp.com/tarifario)
