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

- [x] ✅ **Afiliación al SEE-Del Contribuyente — YA HECHA** (verificado en la ficha
      RUC el 07/08/2026). La ficha dice `Sistema de Emisión Electrónica: DESDE LOS
      SISTEMAS DEL CONTRIBUYENTE. AUTORIZ DESDE 27/07/2026`, `Emisor electrónico
      desde: 27/07/2026` y `FACTURA (desde 27/07/2026), BOLETA (desde 27/07/2026)`.
      Es la misma fecha desde la que es válido el certificado CDT, o sea que la
      afiliación se hizo con él. ⚠️ Trae una obligación ya vigente: desde el
      27/07/2026 la empresa es **emisor electrónico obligatorio** y no puede emitir
      comprobantes de otra forma
- [x] Crear un **usuario SOL secundario** con permiso *solo* de emisión de comprobantes.
      Nunca usar la Clave SOL principal en producción
- [ ] ❓ **Registro de Exportadores de Servicios — probablemente NO haga falta**
      (revisado el 07/08/2026). SUNAT dice textualmente que *"en los demás supuestos
      de exportación de servicios establecidos en el artículo 33 de la Ley del IGV,
      **no se exige** la inscripción en el Registro de Exportadores de Servicios"*:
      solo se exige para servicios prestados **parcialmente en el extranjero**, y
      Notoria presta el suyo íntegramente desde Perú. **No darlo por cerrado sin el
      contador** — depende de bajo qué numeral del art. 33 califica el SaaS.
      La afirmación anterior de este README (que sin la inscripción las ventas al
      exterior pasaban a `0401` y llevaban IGV) valía para el supuesto equivocado
- [x] Recuperar la contraseña del `.p12` — hecho, certificado verificado (26/07/2026)

> Nada de esto es asesoría tributaria. Confirmar con un contador antes de emitir el
> primer comprobante fiscal real. **Las obligaciones mensuales (SIRE, 621, libros y
> cronograma de vencimientos) están en
> [`docs/obligaciones-tributarias-mensuales.md`](docs/obligaciones-tributarias-mensuales.md).**

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

## 3-bis. Ciclo de cobro: qué pasa cuando una tarjeta falla o alguien cancela

Reescrito el **2026-08-17** tras la auditoría. Antes de esa fecha el ciclo perdía
dinero por los dos lados y conviene saber cómo quedó, porque afecta a lo que se
le puede prometer a un cliente y a lo que aparece en la contabilidad.

**Si el cobro de la renovación falla:**

1. Se registra un **`Pago` en estado `FALLIDO`** — sí aparece en el historial de
   Facturación del cliente, a propósito: es donde tiene que verlo.
2. Se le manda un correo avisando, con el número de intento.
3. Se reintenta a los **3 días**, hasta **3 intentos**. Durante todo ese tiempo
   **conserva su plan**.
4. Agotados los tres, la cuenta pasa a **GRATIS** y se le avisa por correo. No se
   borra nada: sus negocios siguen monitoreados con los límites del plan gratuito
   y su historial queda intacto.

Antes, un solo rechazo desactivaba la suscripción en silencio y **nunca se volvía
a intentar cobrar**: un bloqueo del banco de 24 horas costaba el cliente entero.

**Si el cliente cancela** (`Configuración → Suscripción`, o `POST /api/pagos/cancelar`):

- Se apaga la renovación automática, **no el servicio**. Conserva su plan hasta el
  final del periodo que ya pagó, y ese día un cron lo baja solo a GRATIS.
- Es exactamente lo que promete `/devoluciones`. Hasta el 2026-08-17 esa página lo
  prometía **sin que existiera la pantalla ni el endpoint**.
- No se toca nada en Culqi: no hay suscripción del lado de ellos, el cobro
  recurrente lo hace nuestro cron con la tarjeta guardada. Dejar de cobrar es
  dejar de llamar.

**Reembolsos.** Siguen llegando por el webhook de Culqi (`refund.creation.succeeded`),
que marca el `Pago` como `REEMBOLSADO` y desactiva la suscripción. Sin cambios.

⚠️ **Para el contador:** desde esta fecha la tabla `pagos` contiene también filas
en estado `FALLIDO`. **No son ingresos y no llevan comprobante** — solo los
`EXITOSO` emiten. Al conciliar, filtrar por estado.

⚠️ **Baja de cuenta y conservación.** Si un cliente pide eliminar su cuenta y ya
se le emitieron comprobantes, la cuenta se **anonimiza** en vez de borrarse: se
van sus datos personales y su acceso, y queda la fila mínima que sostiene los
comprobantes, que hay que conservar **5 años**. Si nunca pagó, se borra de verdad.
Es lo que permite la Ley 29733: el derecho de supresión cede ante una obligación
legal de conservación, y lo correcto es conservar lo justo y disociar el resto.

---

## 4. Pendientes

**Banca** — resuelto, ver sección 3
- [x] Cuenta en soles del BCP, a nombre de NOTORIA E.I.R.L. y ya registrada en Culqi
- [ ] *(diferido)* Abrir la cuenta en dólares y registrar su CCI — solo al vender al exterior

**SUNAT — obligaciones mensuales** (guía completa en
[`docs/obligaciones-tributarias-mensuales.md`](docs/obligaciones-tributarias-mensuales.md))
- [ ] 🔴 **Declaración de julio 2026 — vence el 24/08/2026.** No es una más: es la
      que **acoge la empresa al RMT**. Si se presenta tarde, el acogimiento no se
      perfecciona y NOTORIA queda en Régimen General (29.5% de Renta en vez de 10%
      sobre las primeras 15 UIT). Va **íntegramente en cero** (la primera factura de
      compra es del 04/08/2026, o sea que cae en agosto). Orden: SIRE (RVIE y RCE,
      ambos sin operaciones) y después el 621. ⚠️ **Justamente por ir en cero es
      peligrosa:** sin ventas ni compras parecería aplicar la excepción de no
      declarar, pero esa excepción **no rige cuando la declaración sirve para
      acogerse a un régimen** — que es exactamente este caso.
      📌 **DÓNDE SE QUEDÓ (07/08/2026, 20:45):** se intentó generar el RVIE de
      julio y **la propuesta todavía no se puede aceptar**: SIRE solo la habilita
      **a partir del octavo día calendario del mes siguiente**, o sea el
      **08/08/2026**. Se llegó un día antes. Los tres síntomas —*Aceptar
      Propuesta* que no responde, *Preliminar del RVIE* en "Ningún registro
      encontrado" y *Generar registro* en gris— son **el mismo bloqueo en
      cascada**, no tres problemas. Retomar el 08/08 desde: RVIE → Propuesta →
      **Aceptar Propuesta** → Preliminar → Generación → CIR; luego lo mismo en RCE
      y recién después el 621
- [ ] **Declaración de agosto 2026 — vence el 21/09/2026.** Aquí entra la factura
      de compra del 04/08/2026 en el RCE y su base imponible en la casilla 107.
      ⚠️ **Al abrir la propuesta del RCE, revisar si BCP facturó mantenimiento de
      cuenta, portes o comisiones**: son gasto deducible y normalmente llevan IGV,
      así que dan crédito fiscal, y aparecen solos en la propuesta. Es lo que
      define si la casilla 107 va en cero o no — también en el RCE de **julio**
- [ ] Rutina mensual: SIRE + Formulario 621 **todos los meses**, aunque no haya
      ingresos. Inicio de actividades 22/07/2026, RUC terminado en **6** → columna
      "6 y 7" del cronograma. Sin periodos vencidos a la fecha (07/08/2026)
- [ ] Afiliarse al **PLE** y llevar el **Libro Diario de Formato Simplificado**
      (obligatorio en RMT; plazo de atraso 3 meses). La ficha RUC dice
      `Afiliado al PLE desde: -`
- [ ] Declaración **Anual** de Renta del ejercicio 2026 (obligatoria en RMT aunque
      haya pérdida), en 2027 y con su propio cronograma

**SUNAT — emisión y trámites**
- [x] Contraseña del `.p12` — certificado verificado, RUC coincide (26/07/2026)
- [x] Domicilio fiscal confirmado contra la ficha RUC y corregido en código y páginas legales
- [x] ✅ **Afiliación al SEE-Del Contribuyente** — ya estaba hecha desde el
      27/07/2026; se descubrió leyendo la ficha RUC el 07/08/2026. Figuraba como
      pendiente por error
- [x] **Usuario SOL secundario** (solo permiso de emisión) — sigue pendiente y es
      lo único que falta de trámites para poder emitir
- [ ] ❓ Registro de Exportadores de Servicios — **probablemente innecesario**, ver
      la sección de trámites arriba
- [ ] Validar el criterio de IGV y exportación con un contador
- [ ] 🔴 **Preguntar al contador por el IGV de utilización de servicios y la
      retención de renta a no domiciliados** de Railway, Vercel, Groq y las APIs de
      IA (Informe N° 011-2005-SUNAT/2B0000). Son servicios digitales de no
      domiciliados consumidos en Perú: el obligado es Notoria, no el proveedor. Es
      el riesgo tributario que hoy no se está mirando
- [x] ~~Preguntar al contador si las boletas van por resumen diario~~ —
      **resuelto por norma el 06/08/2026, no hacía falta preguntar.** El resumen
      diario es **obligatorio** para toda boleta de venta electrónica y sus
      notas: hay que enviarlo el mismo día de emisión o, como muy tarde, hasta
      el **sétimo día calendario siguiente**. Que el web service acepte una
      boleta suelta por `sendBill` no sustituye la obligación de informarla por
      resumen. No hay elección que hacer ni depende del tipo de negocio
- [x] ✅ **Ubigeo confirmado: 070104** (16/08/2026). ⚠️ NO confundir con el CÓDIGO POSTAL de La Perla, que es 07011 (5 dígitos) y es lo que devuelve codigopostal.gob.pe. SUNAT pide el **ubigeo INEI**, de 6 dígitos, y el XML lo declara como tal (`schemeAgencyName: PE:INEI` en ublInvoice.js). Se descompone en pares: 07 Callao + 01 Callao + 04 La Perla. Meter el código postal haría que SUNAT observe el comprobante
- [x] `SUNAT_CERT_P12_BASE64` cargado en Railway (06/08/2026, 12.616 caracteres,
      longitud verificada contra el archivo local)
- [x] `SUNAT_CERT_PASSWORD` en Railway — **la pone el usuario**, no está en
      ningún archivo:
      `railway variables --set "SUNAT_CERT_PASSWORD=..." --service api`
- [x] `SUNAT_SOL_USUARIO` y `SUNAT_SOL_CLAVE` (del usuario SOL secundario, que
      todavía no existe)
- [x] `SUNAT_ENTORNO=produccion`. ⚠️ **Sin esta variable el backend apunta al
      BETA**: los comprobantes de clientes reales se irían al entorno de
      pruebas y no existirían para SUNAT, sin ningún error visible
- [x] `SUNAT_EMISION_ACTIVA=true` — **el último interruptor, no el primero**
- [x] **`.p12` movido fuera de OneDrive** (06/08/2026) — la llave privada ya no
      se sincroniza a la nube. Operativamente el certificado vive en Railway como
      `SUNAT_CERT_P12_BASE64`; el archivo local es solo respaldo. ⚠️ La ruta de
      OneDrive que aparece en documentación antigua ya no es válida

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
- [ ] **Rotar `META_APP_SECRET` y `META_IG_APP_SECRET`** (los dos se compartieron
      por chat) y volver a cargarlos en Railway — si se rota sin actualizar, el
      OAuth falla con un error genérico y el webhook empieza a rechazar eventos
      legítimos con 403
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
- [x] ✅ **Renovación del acceso a datos COMPLETADA** (06/08/2026, correo de Meta
      el mismo día: *"Se completó la renovación del acceso a los datos de
      Notoria"*, app `2232447584255257` / negocio `1337974595147527`). No pide
      ninguna acción más hasta la evaluación anual siguiente
- [x] ✅ **App en modo Activo** y **negocio Verificado** en Portfolio comercial
      (verificado en el panel el 06/08/2026). Modo Activo es requisito de dos
      cosas distintas: enviar el App Review **y recibir webhooks** — Meta no
      manda ni un evento a una app en Desarrollo
- [x] **Comentarios de Instagram cableados** (leer, responder y borrar la
      respuesta propia). Sin esto el revisor habría conectado la cuenta y visto
      la pestaña vacía: rechazo seguro
- [x] Ventana de lectura explícita: **25 publicaciones** (antes el límite de
      comentarios no se fijaba y mandaba el valor por defecto de Meta, que no
      controlamos)
- [x] ✅ **Comentarios paginados** (06/08/2026): se acabó el techo de 30 por
      publicación. Se leen de 50 en 50 hasta agotar, con dos topes —300 por
      publicación y 40 peticiones extra por escaneo, compartidas entre las 25.
      Importaba porque Meta no documenta el orden y lo observado es *el más
      antiguo primero*: quedarse con la primera página era leer los 30 **más
      viejos** de una publicación muy comentada y no ver nunca los nuevos.
      Ver `CLAUDE.md` §20-bis
- [x] **Menciones de Instagram cableadas** (06/08/2026): publicaciones de
      terceros que etiquetan o arroban a la cuenta, vía `/{ig-user-id}/tags`.
      Sin permisos nuevos. ⚠️ **Esto hace visible la sección Menciones** para
      NEGOCIO y FRANQUICIA, que llevaba oculta desde julio por no tener ninguna
      fuente gratuita. Solo capta arrobas y etiquetas, no búsqueda por palabra
      clave (eso sería otro App Review)
- [x] ✅ **Webhooks de Instagram — código listo** (06/08/2026): comentarios de
      **cualquier** publicación, sin ventana y en segundos.
      `GET/POST /api/webhooks/instagram` (handshake + firma HMAC), la página se
      suscribe sola al conectar y se desuscribe al desconectar. No sustituyen al
      barrido: los webhooks solo notifican desde que se configuran, así que el
      histórico se sigue leyendo por el escaneo. 33 pruebas en
      `scripts/prueba-instagram-webhook.js`
- [ ] ⚠️ **`pages_manage_metadata` — añadirlo a la Configuración de Meta y al App
      Review.** Es el permiso que deja suscribir la página a los webhooks. Sin
      él la conexión funciona igual y los comentarios siguen llegando por el
      escaneo, pero **no llega ni un webhook**. Añadirlo AHORA sale gratis;
      después del App Review cuesta una revisión entera aparte
- [x] ✅ **Webhook desplegado en producción** (06/08/2026, Railway `ca78e61e`):
      `/api/webhooks/instagram` responde 403 al handshake sin token y 403 a una
      firma falsa, y una ruta inventada bajo `/api/webhooks/` da 404 — o sea que
      la ruta está viva, no es un rechazo genérico
- [x] ✅ `pages_manage_metadata` añadido a la Configuración de Facebook Login
      (06/08/2026, por el usuario)
- [x] ✅ **`META_WEBHOOK_VERIFY_TOKEN` cargado en Railway y webhook registrado en
      Meta** (06/08/2026). Handshake verificado en prod: con el token correcto
      devuelve el challenge en `text/plain` (200) y con uno falso sigue en 403
- [x] ✅ **Webhook verificado extremo a extremo en producción** (06/08/2026): el
      botón *Probar* de Meta entregó el evento y el log dio
      `Evento de una cuenta sin negocio: 0` — firma validada, cuerpo parseado,
      filtro de eco pasado y búsqueda del negocio hecha. ⚠️ **Meta había dicho
      "Se probó correctamente" en el intento anterior mientras el servidor
      devolvía 403**: ese cartel solo dice que Meta envió la muestra. Verificar
      siempre en los logs del servidor
- [x] **Dejar suscrito solo el campo `comments`** en Meta → Instagram →
      Configuración de la API → *2. Configurar webhooks*. Vienen activados de
      fábrica `live_comments`, `messages`, `message_edit`, `message_reactions`,
      `messaging_postbacks`, `messaging_referral` y `messaging_seen`: el código
      los ignora, pero son webhooks de mensajería privada en una app que no pide
      permisos de mensajería, y eso lo pregunta el revisor
- [x] ✅ `META_IG_APP_SECRET` cargado en Railway (06/08/2026) con la **clave
      secreta de la app de Instagram** (`1305555994987658`, distinta de
      `META_APP_SECRET`). El webhook acepta cualquiera de los dos secretos; sin
      esto, si Meta firmara con el de Instagram, cada evento se rechazaría con
      403 y Meta acabaría desactivando la suscripción
- [ ] ⚠️ **Los webhooks de `comments` exigen Acceso avanzado**, o sea que no
      llega ningún evento hasta que el App Review apruebe. El código puede
      configurarse y verificarse antes; los eventos empiezan después
- [x] **Migración del enum aplicada en producción** (06/08/2026): backend
      desplegado primero (`02a27eaa`) y después el `db push`. Verificado con
      `prisma migrate diff` en ambos sentidos → *empty migration*
- [ ] 🔴 **BLOQUEO ACTUAL: la cuenta del usuario no puede conectarse.** Su página
      de Facebook es *propiedad del portfolio comercial* Notoria, y `me/accounts`
      no lista esas páginas sin `business_management` (`CLAUDE.md` §19-bis).
      Sacarla del portfolio es imposible en bucle: Meta exige desconectarla de
      Instagram primero, y para quitar la cuenta de Instagram exige lo mismo
- [ ] **Camino acordado: cuenta demo, creada limpia** (15 min). Lo que cambia y
      lo que NO:
      · **Misma cuenta de Facebook** (Pri Ad) — tiene rol en la app, y con los
        permisos en acceso estándar SOLO quien tiene rol puede concederlos
      · **Mismo portfolio**, y no se toca (está verificado y la app vive dentro)
      · **Instagram NUEVO** profesional — `@notoriaapp` y `@priad111` ya son
        activos del portfolio, reutilizarlos repite el bucle
      · **Página NUEVA**, creada desde el perfil personal, **sin añadirla a
        ningún portfolio**
      · 🔍 Comprobar ANTES de conectar: la página nueva **no** debe aparecer en
        *portfolio → Cuentas → Páginas*. Si aparece, parar y replantear
- [ ] Crear cuenta de prueba del revisor (plan NEGOCIO vía `scripts/dar-plan.js`)
      con un negocio y su Instagram ya conectado — si el revisor entra y no ve
      comentarios, no puede verificar `instagram_manage_comments`. Es un usuario
      de Notoria (email controlado), nada que ver con Facebook
- [ ] ⏳ **DECIDIR ANTES DE ENVIAR LA REVISIÓN:** ¿se piden también
      `business_management` (+ probablemente `ads_read`) para poder atender a
      clientes con la página dentro de un portfolio comercial? Añadirlos después
      cuesta **otra revisión entera**. Propuesta sobre la mesa: enviar con los 5
      actuales y resolverlo en una segunda pasada junto con la decisión del
      sabor *Instagram Login*, porque ambas atacan el mismo problema — clientes
      que hoy no podemos atender (`CLAUDE.md` §19-bis y §19.8)
- [ ] Grabar screencast y enviar el App Review (**5** permisos: instagram_basic,
      instagram_manage_comments, pages_show_list, pages_read_engagement y
      **pages_manage_metadata** por los webhooks).
      💡 El panel se autodetecta en inglés según el navegador y hay selector en
      Ajustes, así que el screencast puede grabarse en inglés y evitar el
      requisito de subtítulos de Meta
- [x] ~~WhatsApp Cloud API~~ — **cancelado el 16/08/2026**: el canal se eliminó del producto
      junto con Telegram. Notoria avisa solo por correo y el aviso inmediato lo da la
      **app Android** (`C:\Users\Admin\Downloads\NotoriaApp`). Ver `CLAUDE.md` §24

**Instagram OCULTO mientras dura la revisión (16/08/2026)** — `CLAUDE.md` §22.1
Con los permisos en acceso estándar, solo quien tiene rol en la app puede
concederlos: el primer cliente real que pulsara "Conectar Instagram" recibiría un
error de Meta que no puede resolver. Se decidió publicitar la web ya y **esconder**
la función, no anunciarla como "próximamente".
- [x] Interruptor `src/lib/instagramVisible.js` + 12 pruebas
      (`node scripts/prueba-instagram-visible.js`). Esconde la fila en
      *Conexiones*, devuelve 404 en el endpoint de conectar y apaga la sección
      **Menciones** (Instagram era su única fuente)
- [x] Una cuenta **ya conectada** sigue viéndose siempre: hay que poder
      desconectarla y borrar sus datos, que es lo que Meta exige
- [x] `INSTAGRAM_CUENTAS_PRUEBA=revisormeta@usenotoria.app,padkar4@gmail.com`
      cargada en Railway **antes** del deploy (44 caracteres, verificada sin BOM).
      Sin ella el revisor de Meta no vería la integración y rechazaría la
      revisión entera, que sigue en curso desde el 15/08
- [x] **DESPLEGADO Y VERIFICADO EN VIVO (16/08/2026).** Railway `2d096b34`
      SUCCESS, Vercel `notoria-nyvag1t0l` Ready. Comprobado **dentro del
      contenedor de producción**, no por el panel:
      `instagramVisiblePara({email:'revisormeta@usenotoria.app'})` → **true**,
      y con un correo de cliente → **false**. `INSTAGRAM_ACTIVO` sin definir
- [ ] El día que aprueben: `INSTAGRAM_ACTIVO=true` en Railway y reiniciar. No
      hace falta desplegar código, y **la lógica no se borra** — vuelve a hacer
      falta con el siguiente permiso o la siguiente red

**Landing: gráficos y fuentes (16/08/2026)** — `CLAUDE.md` §22.2
- [x] Fusionadas las dos secciones que decían lo mismo; funcionalidades de 9 a 6
- [x] Piezas gráficas en `components/MockupsLanding.js` (gráfica del ataque,
      alerta, medidor de score, diagrama del circuito) — mockups en código, no
      capturas: siguen el tema claro/oscuro y no envejecen con el panel
- [x] 🔴 **Cifras inventadas fuera.** La de "−22% de clientes si el rating baja
      0.3★" contradecía por un orden de magnitud al único estudio que lo mide.
      Ahora cada cifra lleva su enlace visible. **Regla: sin URL pública que la
      sostenga, una cifra no entra al landing** (Ley 29571)
- [x] Corregido el blog: el 89% de BrightLocal mide quién **espera** respuesta,
      no quién lee las respuestas antes de decidir

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
- [x] **Web Analytics habilitado en el dashboard de Vercel** (07/08/2026).
      Verificado sirviendo de verdad, no solo por el tilde del panel:
      `usenotoria.app/_vercel/insights/script.js` devuelve 200 con el script real
      y una ruta inventada bajo el mismo prefijo da 404. Cuenta desde ese día, no
      es retroactivo. ⚠️ Dos motivos por los que puede parecer que no funciona:
      el script **se autodescarta** si detecta `navigator.webdriver` o un
      *user agent* con "Headless" (o sea que curl y los navegadores automatizados
      nunca suman una visita), y los bloqueadores de anuncios filtran
      `/_vercel/insights/`. Comprobarlo siempre en un navegador normal o de
      incógnito
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

**Culqi** — ✅ **comercio APROBADO y en LIVE desde el 14/08/2026**
- [x] Comercio aprobado por Culqi tras subsanar la observación de la web
- [x] Llaves **live** en Railway (backend) y Vercel (frontend), con el
      `vercel --prod` que hace falta para que el bundle las tome
- [x] Verificadas sin mover dinero: `railway run node scripts/verificar-culqi-live.js`
- [x] Auditoría de la ventana de llaves de test: `node scripts/auditar-pagos.js`
      → los 2 únicos pagos son `chr_test_` y de cuentas del propio dueño.
      **Nadie ajeno se activó un plan gratis**
- [x] `.env` / `.env.local` se quedan con llaves de **TEST**: las live no van en
      archivos locales
- [x] Webhook de reembolsos **corregido y desplegado** (14/08/2026): esperaba
      tipos de evento al estilo Stripe que en Culqi no existen y leía `data`
      como objeto cuando llega como cadena JSON. Respondía 200 sin hacer nada
- [x] **Webhook registrado en CulqiPanel** (15/08/2026): Producto `CulqiOnline` ·
      Recurso `refund` · Acción **`creation`** (no `update`) · Resultado
      `succeeded` · URL `https://api.usenotoria.app/api/pagos/culqi/webhook`,
      con *Activar autenticación* y `CULQI_WEBHOOK_SECRET` como contraseña.
      El endpoint acepta también el secreto por `?secret=` en la URL.
      Los contracargos **no llegan por webhook**: Culqi no expone ese recurso,
      se vigilan en *Controversias*
- [ ] ⏳ **Pendiente de comprobar con un reembolso real.** Es lo único que puede
      confirmarlo: `GET /v2/webhooks` responde 401 (Culqi no expone la
      configuración por API), `GET /v2/events` va vacío hasta que se dispare uno,
      y guardar el webhook no manda ningún ping de prueba. Si la contraseña no
      cuadrara, el endpoint ya lo deja escrito en los logs
      (`[Culqi webhook] RECHAZADO (401)`), así que el primer reembolso lo dirá
      pase lo que pase
- [x] ~~Renovar la llave secreta~~ — **descartado por decisión del usuario
      (15/08/2026).** La actual viajó en una captura por chat pero no se publicó
      en ningún sitio; se asume y no se vuelve a plantear. Si algún día se rota:
      el campo de contraseña del webhook admite **máximo 20 caracteres**, y hay
      que cambiarla también allí
- [ ] *(opcional)* RSA Keys — cifrado extra del checkout, Culqi no lo exige

> 🔴 **Ahora el desfase es el contrario y está vivo: se cobra de verdad y NO se
> emite comprobante fiscal.** Con `SUNAT_EMISION_ACTIVA` apagado cada venta real
> genera solo un VOUCHER interno, y NOTORIA es **emisor electrónico obligatorio
> desde el 27/07/2026**. O se completan los trámites en SOL rápido, o no se
> promociona `/precios` hasta tenerlos. **El orden sigue siendo: Culqi live ✅ →
> trámites en SOL → emisión.**
>
> ✅ ~~Herencia de la etapa de test: tarjetas `crd_test_` guardadas que el cron de
> renovación intentaría cobrar con la llave live.~~ **RESUELTO — verificado el
> 16/08/2026** con `railway ssh --service api "node scripts/auditar-pagos.js"`:
> **0 pagos registrados, 0 comprobantes y 0 tarjetas que hayan usado la promo.**
> Las tres cuentas con plan de pago (`didier@usenotoria.app`,
> `didierprincipe@gmail.com`, `revisormeta@usenotoria.app`) lo tienen **concedido
> a mano, sin tarjeta**, así que no hay nada que el cron pueda intentar cobrar.
> ⚠️ Ojo al método: `railway run` **no** sirve para esto — inyecta la URL interna
> `postgres.railway.internal`, que no se alcanza desde fuera. Hay que entrar al
> contenedor con `railway ssh`.

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

**🟢 EMISIÓN SUNAT ACTIVADA (16/08/2026)**
Usuario SOL secundario `NOTORIAS` creado con dos opciones y solo esas: *Servicio
de Envío de Documentos Electrónicos por Servicio Web* (la que autentica el envío)
y las 4 de *Consultar Envíos de CPE* (solo lectura). **No** se le dio
*Certificado Digital*.

Las 5 variables están en Railway y verificadas **dentro del contenedor**, no solo
en el panel: `cert.configurado()` y `bill.configurado()` en true, el `.p12` abre
con la clave cargada (serie `1f13ed80…`, emisor ECEP-RENIEC) y
`SUNAT_ENTORNO=produccion`.

⚠️ **Lo que NO se pudo verificar: que las credenciales SOL autentiquen.** Se
intentó un `getStatus` de solo lectura con un ticket inexistente, y **SUNAT
responde HTTP 200 con cuerpo vacío tanto con la clave real como con una falsa**
— el probe no discrimina y no prueba nada. Lo único comprobado es que el usuario
y la clave entran en sunat.gob.pe. La primera venta real es la prueba funcional.

✅ **Y ese riesgo es menor de lo que parecía.** El correlativo se asigna al crear
el comprobante (`comprobante.service.js`, UPDATE atómico), así que si la clave
estuviera mal: el comprobante se crea con su número, **falla al enviarse pero no
se pierde**, y `envioSunat.worker.js` reintenta con backoff durante 3 días. Se
corrige la clave y sale con su número original — **sin hueco en la numeración y
sin nota de crédito**. El fallo queda en los logs de Railway.

🔧 Herramienta nueva: `node scripts/probar-clave-p12.js` dice sí o no a una clave
del `.p12` sin cargar nada. Nació porque el asistente de Windows, ante una clave
incorrecta, **se limita a reabrirse** sin decir que falló.

✅ **Ubigeo confirmado: se queda en 070104.** El 07011 que aparecía como duda es el CÓDIGO POSTAL de La Perla, no el ubigeo INEI — son catálogos distintos y SUNAT pide el segundo.

~~Rotar la clave SOL de NOTORIAS~~ — **descartado por decisión del usuario
(16/08/2026).** Se vio un prefijo en un error de PowerShell, pero no la clave
completa. Se asume el riesgo y **no se vuelve a plantear** (mismo criterio que
con la llave secreta de Culqi, §21).
