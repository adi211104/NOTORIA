# Obligaciones tributarias mensuales — NOTORIA E.I.R.L.

Guía operativa de lo que hay que presentar a SUNAT **todos los meses**, aunque la
empresa no haya vendido nada. Escrita el 07/08/2026, cuando Notoria todavía no
genera ingresos.

> Esto no es asesoría tributaria. Sirve para saber qué hacer y qué preguntar; los
> criterios de fondo los confirma un contador colegiado (ver la sección final).

---

## 1. Datos que definen todo

| Dato | Valor | De dónde sale |
|------|-------|---------------|
| Razón social | NOTORIA E.I.R.L. | Ficha RUC |
| RUC | 20616239466 | Ficha RUC |
| **Último dígito del RUC** | **6** → columna "6 y 7" del cronograma | Ficha RUC |
| Fecha de inscripción | 14/07/2026 | Ficha RUC |
| **Fecha de inicio de actividades** | **22/07/2026** | Ficha RUC |
| Régimen | **RMT** (Régimen MYPE Tributario) | Persona jurídica, muy por debajo de 1,700 UIT |
| Emisor electrónico desde | 27/07/2026 | Ficha RUC |
| Sistema de emisión | SEE — **Desde los sistemas del contribuyente** | Ficha RUC |
| UIT 2026 | S/5,500 | Cronograma SUNAT 2026 |

**Primer periodo declarable: julio 2026.** Antes del 22/07/2026 no había actividad
declarada, así que no existen periodos anteriores ni omisiones que regularizar.

---

## 2. Por qué hay que declarar aunque no haya ingresos

La excepción de no presentar declaración mensual existe (**RS 203-2006/SUNAT
art. 3**, modificada por la **RS 272-2016/SUNAT**), pero exige tres condiciones a
la vez:

1. No generar ingresos gravados con Renta ✅
2. No realizar operaciones gravadas con IGV ✅
3. **No tener adquisiciones anotadas en el Registro de Compras** ❌

El tercer punto se incumple en cuanto se anota una factura de compra en el
Registro de Compras —que es lo que hay que hacer para conservar el crédito fiscal
y el gasto—. **Desde agosto 2026 en adelante ese es el motivo que obliga a
declarar**, porque la primera factura de compra es del 04/08/2026.

Pero **julio 2026 es un caso aparte y más delicado**: ese mes no hubo ventas *ni*
compras, así que los tres puntos se cumplirían y parecería que no hay que
declarar. **Es una trampa.** La excepción tampoco aplica cuando la declaración
sirve **para acogerse a un régimen tributario**, y al RMT se accede *"con la
declaración jurada mensual que corresponde al mes de inicio de actividades
declaradas en el RUC, siempre que se efectúe hasta la fecha de vencimiento"*.
Julio 2026 es justamente el mes de inicio de actividades (22/07/2026).

> 🔴 **Consecuencia concreta:** si la declaración de **julio 2026** —que va
> íntegramente en cero— no se presenta hasta el **24/08/2026**, el acogimiento al
> RMT no se perfecciona y la empresa queda en **Régimen General**: 29.5% de
> Impuesto a la Renta en vez del 10% sobre las primeras 15 UIT de renta neta.
> Razonar "no tuve movimiento, estoy exceptuado" es exactamente el error que
> cuesta el régimen.

**Regla operativa: se declara todos los meses, sin excepción.** Cuesta S/0 y
quince minutos.

### Qué va en cada uno de los dos primeros periodos

| | **Julio 2026** (vence 24/08) | **Agosto 2026** (vence 21/09) |
|---|---|---|
| RVIE | Sin operaciones | Sin operaciones |
| RCE | **Sin operaciones** | **Factura de compra del 04/08/2026** |
| 621 casilla 100 | 0 | 0 |
| 621 casilla 107 | 0 | Base imponible de la factura |
| 621 casilla 301 | 0 | 0 |
| A pagar | S/0 | S/0 |
| Por qué es obligatorio | **Acogimiento al RMT** | Hay adquisición anotada |

---

## 3. Cronograma de vencimientos 2026 (último dígito 6)

| Periodo | Vence |
|---------|-------|
| **Julio 2026** | **24 ago 2026** ← primer periodo, el del acogimiento |
| Agosto 2026 | 21 set 2026 |
| Setiembre 2026 | 22 oct 2026 |
| Octubre 2026 | 20 nov 2026 |
| Noviembre 2026 | 23 dic 2026 |
| Diciembre 2026 | 22 ene 2027 |

Se puede declarar **desde el primer día hábil del mes siguiente** al periodo. No
esperar al día del vencimiento: si SUNAT tiene una caída ese día, el plazo no se
mueve.

---

## 4. Rutina mensual — el orden importa

Siempre en este orden: **RVIE → RCE → 621**. El SIRE alimenta la propuesta del
621, así que hacerlo al revés obliga a llenar el formulario a mano.

> ⏰ **La propuesta no se puede aceptar antes del octavo día calendario del mes
> siguiente** (el décimo si se emiten recibos de servicios públicos, que no es el
> caso). Antes de esa fecha el botón *Aceptar Propuesta* sale bloqueado con el
> mensaje *"podrá aceptar o reemplazar la propuesta a partir del octavo día
> calendario…"*, y la pantalla *Generación de Registros* muestra "Ningún registro
> encontrado" con el botón verde en gris. **No es un error ni falta ninguna
> configuración: es que SUNAT todavía está recibiendo los comprobantes que
> terceros emitieron en el periodo.** Verificado en vivo el 07/08/2026 intentando
> generar el RVIE de julio.
>
> **Regla práctica: la rutina mensual se hace del día 8 en adelante.** Sigue
> sobrando tiempo — el vencimiento cae entre el 15 y el 24 del mes siguiente.

### 4.1 SIRE — Registro de Ventas e Ingresos Electrónico (RVIE)

1. Entrar a <https://sire.sunat.gob.pe> (o SUNAT → Operaciones en Línea →
   Empresas → Comprobantes de pago → SIRE).
2. Módulo **RVIE** → *Gestión de ventas e ingresos* → **Generar el registro**.
3. Elegir el periodo (ej. 07/2026) y abrir el **preliminar**.
4. Sin ventas, el preliminar sale vacío. **Generar igual.**
5. Guardar la **CIR** (Constancia de Información Registrada).

> El registro tiene que existir aunque vaya vacío. "Sin operaciones" no es lo
> mismo que "no generado".

### 4.2 SIRE — Registro de Compras Electrónico (RCE)

1. Mismo portal, módulo **RCE** → *Gestión de compras* → **Generar el registro**.
2. Elegir el periodo y abrir la **propuesta**. SUNAT la arma sola con los
   comprobantes electrónicos que los proveedores emitieron al RUC de Notoria.
3. Si la factura de compra aparece, aceptar. Si no aparece, **agregarla a mano**
   (pasa cuando el proveedor la declaró tarde).
4. Generar y guardar la CIR.

> ⚠️ **Nunca dar por hecho que un periodo está vacío sin abrir la propuesta.** El
> banco emite comprobantes al RUC de la empresa por el **mantenimiento de cuenta,
> los portes y las comisiones**, y esos aparecen solos en la propuesta del RCE
> aunque uno no los tenga presentes. La propuesta del SIRE es la fuente de verdad,
> no la memoria de qué se compró.

### 4.2-bis Gastos bancarios (mantenimiento, portes, comisiones, ITF)

Son **gasto deducible** para el Impuesto a la Renta: son gastos necesarios para
mantener la fuente productora (art. 37 de la Ley del IR). No hay que hacer nada
especial para "declararlos" — entran por el mismo camino que cualquier compra.

- **Comisiones y mantenimiento** normalmente van **gravados con IGV**, así que
  además dan **crédito fiscal**. (Distinto de los *intereses* de crédito, que están
  exonerados por el Apéndice II de la Ley del IGV.)
- Los bancos emiten **"documentos autorizados"** (Reglamento de Comprobantes de
  Pago, art. 4): sirven igual que una factura para sustentar gasto y crédito
  fiscal, siempre que identifiquen al usuario y desglosen el IGV.
- El **ITF** (0.005% sobre los movimientos) también es gasto deducible y sale en
  el estado de cuenta.

**Dónde verlos:** lo más simple es la propuesta del RCE en SIRE, que ya los trae.
Para cuadrar contra el banco, están en el estado de cuenta mensual de BCP y los
comprobantes en la banca por internet de empresas.

⚠️ Que los cargos sean de una tarjeta o cuenta **a nombre de NOTORIA E.I.R.L.** es
lo que los vuelve gasto de la empresa. Lo que salga a nombre personal, no.

### 4.3 Declara Fácil 621 — IGV Renta mensual

1. SUNAT → Operaciones en Línea → **Mis declaraciones y pagos** → *Presentación y
   Pago* → **Declara Fácil** → **IGV Renta mensual 621**.
2. **Información General:** periodo, y **verificar que el régimen diga "Régimen
   MYPE Tributario"**. Si dice otra cosa, parar y revisar antes de seguir — ahí se
   define la tasa del Impuesto a la Renta.
3. **Detalle de Declaración → IGV → Ventas:** casilla **100** (ventas netas
   gravadas) = **0** mientras no haya ingresos.
4. **Detalle de Declaración → IGV → Compras:** casilla **107** (compras netas
   destinadas a ventas gravadas) = **base imponible** de las facturas de compra,
   *sin* IGV. Debe venir precargado del RCE.
5. **Detalle de Declaración → Renta:** casilla **301** (ingresos netos) = **0** →
   pago a cuenta del 1% = **S/0**.
6. **Determinación de la Deuda:** revisar. El IGV de las compras aparece como
   **saldo a favor** (casilla 145) y **se arrastra al mes siguiente**.
7. **Validar** → **Agregar a bandeja** → **Presentar/Pagar**. Con S/0 de deuda no
   hay paso de pago.
8. Guardar la **Constancia de Presentación**.

### 4.4 Qué pasa con el IGV de las compras

No se pierde. Se acumula como saldo a favor y se arrastra mes a mes hasta que
haya ventas gravadas contra las cuales aplicarlo. Cuanto más tiempo se compre sin
vender, más saldo se acumula a favor de la empresa.

Lo mismo con los gastos: todo lo que se gaste antes del primer ingreso son
**gastos preoperativos** (art. 37 inc. g de la Ley del Impuesto a la Renta) y se
deducen íntegramente el ejercicio en que se inicia la producción, o se amortizan
hasta en 10 años.

> ⚠️ **Los comprobantes tienen que estar a nombre de NOTORIA E.I.R.L.** Lo que
> salga a nombre personal no es gasto deducible de la empresa. Esto importa
> especialmente con Railway, Vercel y las APIs de IA, que se pagan con tarjeta
> personal porque la persona jurídica no lleva tarjeta de débito.

---

## 5. Libros electrónicos

En RMT con ingresos netos anuales hasta 300 UIT corresponden **Registro de
Ventas, Registro de Compras y Libro Diario de Formato Simplificado**.

- Registro de Ventas y Registro de Compras → **ya van por SIRE**, no por PLE.
- **Libro Diario de Formato Simplificado** → por **PLE**. Plazo máximo de atraso:
  **3 meses**.

En la ficha RUC figura `Afiliado al PLE desde: -`, es decir que todavía no hay
afiliación. Se produce sola al generar el primer libro.

---

## 6. Declaración Anual de Renta

En RMT **es obligatoria** aunque el resultado del ejercicio sea pérdida. La del
ejercicio 2026 se presenta en 2027, con su propio cronograma (distinto del
mensual).

Tasas del RMT sobre la renta neta anual:

| Renta neta anual | Tasa |
|------------------|------|
| Hasta 15 UIT | 10% |
| Exceso de 15 UIT | 29.5% |

---

## 7. Preguntas abiertas para el contador

1. **IGV por utilización de servicios y retención de renta a no domiciliados.**
   Railway, Vercel, Groq y las APIs de IA son servicios digitales de proveedores
   no domiciliados utilizados económicamente en Perú. Según el **Informe N°
   011-2005-SUNAT/2B0000**, eso genera (a) IGV por utilización de servicios, que
   se autoliquida y se paga aparte con boleta 1662 y recién al mes siguiente se
   vuelve crédito fiscal, y (b) renta de fuente peruana sujeta a retención.
   El **D. Leg. 1623** (que hizo que las plataformas cobren IGV) apunta a personas
   naturales sin actividad empresarial; para una empresa sigue rigiendo el régimen
   de utilización de servicios, o sea que el obligado es Notoria, no el proveedor.
   **Es la más importante de las cuatro y hoy no se está considerando.**

2. **Registro de Exportadores de Servicios: ¿hace falta?** SUNAT dice
   textualmente que *"en los demás supuestos de exportación de servicios
   establecidos en el artículo 33 de la Ley del IGV, **no se exige** la
   inscripción en el Registro de Exportadores de Servicios"* — solo se exige para
   servicios prestados **parcialmente en el extranjero**. Notoria presta su
   servicio íntegramente desde Perú. Confirmar bajo qué numeral del art. 33
   califica el SaaS; probablemente el trámite no sea necesario.

3. **Criterio de IGV y exportación:** precios con IGV incluido para clientes
   peruanos, exportación de servicios sin IGV para clientes del exterior. Es lo
   que implementa `brand-shield/src/lib/tributario.js`.

4. **Rendición de gastos pagados con tarjeta personal**, para que sean deducibles
   y estén bien sustentados de cara al Impuesto a la Renta.

---

## 8. Estado a la fecha (07/08/2026)

- ✅ Régimen RMT correcto (persona jurídica, muy debajo de 1,700 UIT).
- ✅ **Sin periodos vencidos ni multas.** El primer periodo es julio 2026 y vence
  el 24/08/2026.
- ⏳ **Declaración de julio 2026 — empezada, no terminada.** El 07/08/2026 se
  intentó generar el RVIE y se topó con la ventana del octavo día calendario (ver
  el recuadro de la sección 4). **Retomar el 08/08/2026** en: RVIE → *Propuesta
  del RVIE* → **Aceptar Propuesta** → *Preliminar* → *Generación de Registros* →
  CIR. Después el RCE igual, y al final el 621. Nada quedó a medias en SUNAT: no
  se aceptó ninguna propuesta ni se generó ningún registro.
- ✅ **SEE-Del Contribuyente autorizado desde el 27/07/2026**, con factura y
  boleta habilitadas. La misma fecha en que empieza a ser válido el certificado
  CDT.
- ✅ `Actividad Comercio Exterior: EXPORTADOR` marcado en la ficha RUC.
- ⏳ Falta el **usuario SOL secundario** con permiso solo de emisión de
  comprobantes (nunca usar la Clave SOL principal en producción).
- ⏳ Falta afiliación al **PLE** y el Libro Diario de Formato Simplificado.

> 🔴 **Regla que cruza con el producto:** no encender `SUNAT_EMISION_ACTIVA` antes
> de tener las llaves **live** de Culqi. Con llaves de test, cualquiera que pague
> con `4111 1111 1111 1111` generaría un comprobante fiscal real por una venta que
> nunca ocurrió. El orden es: Culqi live → trámites en SOL → emisión.

---

## Fuentes

- [RS N° 203-2006/SUNAT — excepciones a las declaraciones mensuales](https://www.sunat.gob.pe/legislacion/superin/2006/203.htm)
- [Informe N° 011-2005-SUNAT/2B0000 — servicios de no domiciliados](https://www.sunat.gob.pe/legislacion/oficios/2005/oficios/i0112005.htm)
- [SUNAT Emprender — Régimen MYPE Tributario](https://emprender.sunat.gob.pe/ruc/regimenes-tributarios-mype/regimen-mype-tributario)
- [SUNAT — Sistema Integrado de Registros Electrónicos (SIRE)](https://cpe.sunat.gob.pe/node/139)
- [SUNAT Emprender — Exportación de servicios](https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/exportacion-servicios)
- [SUNAT — Sistema de Emisión del Contribuyente (SEE-DC)](https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente)
