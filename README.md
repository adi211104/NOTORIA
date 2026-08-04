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

Falta para poder emitir de verdad: **resumen diario de boletas** y **comunicación de
baja** para anulaciones.

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

### Situación actual

Cuenta en **BCP**, en soles: **S/45/mes** de mantenimiento y **S/500** de saldo mínimo.
Es la opción más cara del mercado peruano para una empresa de este tamaño.

### Comparativa (julio 2026)

| Banco / producto | Mantenimiento | Capital inmovilizado | ¿Persona jurídica? |
|---|---|---|---|
| BCP (actual) | S/45 siempre | S/500 | Sí |
| Interbank Cuenta Negocios — Plan Digital | S/0 **si** cumple · **S/50 si no** | **S/3,000** promedio | Sí |
| BBVA Cuenta Emprendedor | S/0 | Ninguno | **No** — solo persona natural con negocio |
| BBVA Cuenta Negocio | S/35 (6 meses gratis) | — | Sí |
| **Mibanco Ahorro Negocios** | **S/0** | **Ninguno** | **Sí** |

**Interbank quedó descartado:** su "S/0 de mantenimiento" exige mantener **S/3,000 (o
US$1,000) de saldo promedio mensual** sumando todas las Cuentas Negocios, más una
operación al mes. Sin cumplir ambas condiciones cobra S/50 — más caro que el BCP.
Fuera del alcance de la caja actual.

**BBVA Cuenta Emprendedor quedó descartada:** no cobra mantenimiento ni exige saldo
mínimo, pero es un producto para **personas naturales con negocio**. NOTORIA es una
E.I.R.L., persona jurídica.

### Decisión: Mibanco Ahorro Negocios

Confirmado contra la **Cartilla de Información Cuenta Ahorro Negocios V020**
(vigencia 22/07/2024):

- **Mantenimiento de cuenta: sin costo**, columna de Persona Jurídica, ambas monedas.
- **Saldo mínimo de equilibrio: S/0.00 / US$0.00.**
- Disponible en **soles y dólares** para persona jurídica.
- Transferencias entre cuentas propias, a terceros e interbancarias **libres de costo
  por el APP Mibanco Móvil**.
- TEA 0.01% para persona jurídica — sin rendimiento relevante.

**Ahorro estimado frente al BCP: S/540/año**, más los S/500 liberados.

### Limitaciones detectadas en la cartilla

1. **La persona jurídica NO recibe tarjeta de débito** (nota 5: *"Para Personas Jurídicas
   no aplica afiliación de tarjeta de débito"*). Por eso las filas de cajeros automáticos
   y retiros en ventanilla aparecen en blanco en las columnas de PJ.
   **Consecuencia:** no se pueden pagar Railway, Vercel y las APIs con una tarjeta de la
   empresa. Habrá que pagarlos con tarjeta personal y rendirlos, cuidando que el
   comprobante esté a nombre de NOTORIA. Los importes están muy por debajo del umbral
   de bancarización (S/2,000 o US$500 por operación), así que es viable, pero es fricción
   mensual y hay que documentarla bien para la deducción del Impuesto a la Renta.
2. **Operación digital sin confirmar.** El APP hace transferencias gratis, pero la Banca
   por Internet figura solo con "consulta de saldos". Si el enrolamiento en el APP exige
   tarjeta de débito —que la PJ no tiene—, queda por resolver cómo se opera sin ir a una
   agencia.
3. **Las comisiones de transferencias no están en la cartilla**: están en el *Tarifario de
   Servicios Transversales aplicables a Depósitos*, documento aparte.
4. Cuenta pasa a estado **"Inactivo"** sin movimientos por más de 6 meses (no aplica:
   Culqi abona cada 4 días hábiles).
5. Estado de cuenta físico S/10 — solicitarlo por correo, que es gratuito.
6. El **Fondo de Seguro de Depósitos** cubre a personas naturales y jurídicas *sin fines
   de lucro*; una E.I.R.L. quedaría fuera. Verificar, no decisivo.

### Preguntas para la agencia

1. ¿Cómo opera una persona jurídica sin tarjeta de débito? ¿El APP funciona para PJ?
   ¿Hay banca por internet para empresas con capacidad de transferir?
2. ¿Existe alguna tarjeta empresarial (débito o crédito) que sí aplique a personas jurídicas?
3. Solicitar el **Tarifario de Servicios Transversales** — costo de transferencias.
4. ¿Qué **cargos únicos** hay por apertura de persona jurídica? (equivalente a los S/75
   de "revisión de poderes" que cobra Interbank)
5. Abrir la de **soles** (es la que se usa: desde 2026-07-28 se cobra en PEN). La de **dólares** solo si piensas vender al exterior pronto — si la abres, pide su **CCI** para registrarla en Culqi.
6. ¿La cartilla V020 sigue vigente?

### Secuencia de migración

No cerrar el BCP hasta que el banco nuevo esté operativo:

1. Abrir Mibanco en ambas monedas.
2. Verificar que la cuenta funciona y que se puede transferir sin ir a agencia.
3. Registrar la cuenta en dólares en Culqi y **esperar a recibir un depósito real**.
4. Revisar qué hay domiciliado en el BCP (débitos automáticos, cobros recurrentes).
5. Cerrar el BCP **formalmente, con carta de cierre**. Dejarlo en cero no basta: el
   mantenimiento sigue corriendo, se acumula como deuda y termina en Infocorp.

### Sobre la cuenta en dólares

**Ya no es urgente.** Desde el 2026-07-28 se cobra en soles, así que una sola cuenta en
soles basta para operar. Culqi permite registrar **una cuenta bancaria por moneda** y
abona sin convertir (depósitos cada 4 días hábiles).

Queda pendiente para cuando se venda al exterior: ahí sí conviene abrir la cuenta en
dólares para evitar la doble conversión (USD→PEN al cobrar, PEN→USD al pagar Railway,
Vercel y las APIs de IA, con ~1-3% de spread cada una). En Mibanco ambas cuentas comparten
el mantenimiento sin costo, así que tenerlas las dos no cuesta nada.

---

### Cómo verificar que todo sigue funcionando

Cuatro scripts en `brand-shield/scripts/`. Los dos primeros son locales; los dos
últimos **envían de verdad al entorno beta de SUNAT**, sin tocar producción:

```bash
cd brand-shield
node scripts/generar-cert-prueba.js   # una sola vez: certificado autofirmado
node scripts/prueba-comprobantes.js   # reglas tributarias y PDFs
node scripts/prueba-xml-firma.js      # XML UBL, firma y verificación criptográfica
node scripts/prueba-sunat-beta.js     # factura, exportación y boleta contra SUNAT beta
node scripts/prueba-cola-envio.js     # cola: reintentos, plazo vencido, rechazo
```

El beta usa el RUC de pruebas `20000000001` con usuario `MODDATOS`/`moddatos` y acepta
certificados autofirmados, por eso no hace falta el certificado real para desarrollar.
Ese usuario es compartido: si devuelve **401**, es saturación y no credenciales — los
scripts ya reintentan solos.

---

## 4. Pendientes

**Banca**
- [ ] Llamar al BCP: ¿existe exoneración del mantenimiento por saldo promedio?
- [ ] Ir a Mibanco con las 6 preguntas de arriba
- [ ] Abrir la cuenta en **soles** (suficiente para operar hoy)
- [ ] Registrar la cuenta en soles en Culqi
- [ ] *(diferido)* Abrir la cuenta en dólares y registrar su CCI — solo al vender al exterior
- [ ] Cerrar el BCP formalmente (solo después de los pasos anteriores)

**SUNAT**
- [x] Contraseña del `.p12` — certificado verificado, RUC coincide (26/07/2026)
- [x] Domicilio fiscal confirmado contra la ficha RUC y corregido en código y páginas legales
- [ ] Afiliación al SEE-Del Contribuyente + usuario SOL secundario
- [ ] Registro de Exportadores de Servicios
- [ ] Validar el criterio de IGV y exportación con un contador
- [ ] Preguntar al contador si las boletas se informan por **resumen diario** o
      se pueden enviar individualmente (el beta aceptó ambas, pero el canal
      reglamentario es el resumen diario)
- [ ] Verificar que el ubigeo **070104** corresponde al domicilio fiscal
- [ ] Cargar `SUNAT_CERT_P12_BASE64` y `SUNAT_CERT_PASSWORD` en Railway
- [ ] Mover el `.p12` fuera de OneDrive (hoy la llave privada está sincronizada
      en la nube)

**Meta / Instagram + App Review** (detalle técnico exacto en `CLAUDE.md` §19)
- [x] Negocio NOTORIA verificado en Meta Business Manager (29/07/2026)
- [x] Página de eliminación de datos en producción (`usenotoria.app/eliminar-datos`)
- [x] Formulario de tratamiento de datos respondido (política de respaldo en
      `docs/politica-solicitudes-autoridades.md`)
- [ ] **Crear la app tipo NEGOCIO** — la primera app (1709333600393009) salió tipo
      Consumidor y no tiene los permisos de Instagram; no sirve. Pasos en CLAUDE.md §19
- [ ] Cargar las llaves de la app nueva en Railway y redesplegar el backend
      (el soporte de `config_id` está commiteado sin desplegar)
- [ ] Probar "Conectar Instagram" en `/dashboard/conexiones` con IG Business + página de FB
- [ ] Crear cuenta de prueba del revisor (plan NEGOCIO vía `scripts/dar-plan.js`)
- [ ] Grabar screencast y enviar el App Review (4 permisos: instagram_basic,
      instagram_manage_comments, pages_show_list, pages_read_engagement)
- [ ] WhatsApp Cloud API en la misma app: plantilla UTILITY + credenciales en Railway

**Crecimiento / landing (sesión 03/08/2026)**
- [x] Repo en GitHub (`adi211104/NOTORIA`) con push funcionando
- [x] Widget "analiza tu negocio gratis" en el hero — funcionando en producción
- [x] Drip de emails de onboarding activo (día 2 / 5 / 7, cron 10:00 Lima)
- [x] Botón de WhatsApp de ventas (51 955 599 041)
- [x] Tabla comparativa rediseñada, sin "Próximamente" en páginas públicas
- [x] `@vercel/analytics` instalado
- [ ] Habilitar Web Analytics en el dashboard de Vercel (sin eso no recolecta)
- [ ] Decidir qué hacer con **Facebook Reviews** en la tabla/tarjetas (¿el scraper
      trae datos reales o es stub? — si es stub, quitarlo por honestidad)
- [ ] Blog SEO (artículos para búsquedas de reputación de restaurantes en Perú)
- [ ] Capturas reales del panel en el landing

**Producto**
- [x] `npx prisma db push` para crear las tablas de comprobantes en producción
      (aplicado; el 29/07/2026 se verificó con `prisma migrate diff` que la BD de
      prod coincide 100% con el schema — no queda nada por migrar)
- [x] Fase B — núcleo: XML UBL 2.1 + firma + envío, aceptado por SUNAT beta (26/07/2026)
- [x] Fase B — cola de envío con reintentos y vigilancia del plazo legal
- [x] Fase B — persistencia del XML firmado y el CDR
- [x] Fase B — QR en la representación impresa
- [ ] Fase B — resumen diario de boletas
- [ ] Fase B — comunicación de baja (anulaciones)
- [ ] Llaves reales de Culqi (el código ya está listo, hoy responde 501)

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
- [Mibanco — Ahorro Negocios](https://www.mibanco.com.pe/categoria/ahorro-negocios)
- [Interbank — Cuenta Negocios](https://interbank.pe/negocios/cuenta-negocios)
- [BBVA — Cuenta Emprendedor](https://www.bbva.pe/empresas/productos/cuentas/corrientes/cuenta-emprendedor.html)
