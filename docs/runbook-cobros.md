# Qué hacer cuando algo sale mal con un cobro

Procedimiento operativo (réplica del auditor, 2026-10-07). Para cada caso: qué mirar, en qué orden y qué
NO hacer. Todo empieza por la misma foto:

```bash
cd brand-shield
node scripts/caso-cliente.js cliente@correo.com                                   # base de producción (.env)
railway run --service api node scripts/caso-cliente.js cliente@correo.com --culqi  # + cargos que tiene CULQI
```

Imprime, en hora de Lima: cada **intento de cobro** (con su clave y la hora en que se reclamó), cada
**Pago**, cada **evento de suscripción** (alta, renovación, locales, cancelación, cobro rechazado, bajada,
reembolso), los **webhooks** de sus cargos y los **comprobantes**, y al final un diagnóstico. Solo lee.

Reglas que valen para todos los casos:

- 🔴 **Nunca cobrar a mano ni pedirle al cliente que pague de nuevo** mientras haya un intento `DESCONOCIDO`,
  `PROCESANDO` o `EXITOSO` sin aplicar: la reconciliación (`:15` y `:45` de cada hora) lo resuelve con el
  cargo real de Culqi.
- 🔴 **Devolver dinero: SUNAT acepta → reembolsar en Culqi → anular el comprobante** (CLAUDE.md §9). Un
  reembolso parcial no se anula: nota de crédito.
- Contestar al cliente con lo que dice la línea de tiempo, con horas. El Libro de Reclamaciones tiene
  15 días hábiles; un correo a `hola@` no los tiene, pero conviene contestar igual de rápido.

## 1. «Me cobraron pero sigo en Gratis»

1. `caso-cliente.js --culqi`.
2. Según el diagnóstico:
   - **EXITOSO sin aplicar** → Culqi cobró y la base falló al aplicar. La reconciliación lo aplica sola en
     ≤30 min (ya llegó el correo «🔴 Cobro sin aplicar»). Si pasó más de una hora: el `ultimoError` del
     intento y el log de Railway con el id del intento dicen por qué.
   - **DESCONOCIDO / PROCESANDO** → Culqi no contestó. La reconciliación busca el cargo por
     `metadata.intento`: si se cobró, lo aplica; si no aparece en 24 h, lo da por FALLIDO (y devuelve la
     promo reservada). Decirle al cliente que **no vuelva a pagar** (es lo que ya le dijo la pantalla: 502
     `COBRO_EN_VERIFICACION`).
   - **Culqi COBRÓ y Notoria no tiene ese Pago, sin `metadata.intento`** → cargo hecho fuera del flujo
     (no debería existir). Reembolsar y reportarlo.
   - **No hay nada en Culqi** → no se cobró: lo que vio el cliente es una retención del banco que se libera
     sola. Pedirle captura del movimiento.
3. Si el plan quedó aplicado pero el **panel** sigue en Gratis: cerrar sesión y entrar (el perfil se lee al
   entrar), y mirar si su cuenta es de equipo (`X-Cuenta`).

## 2. «Me cobraron dos veces»

1. `caso-cliente.js --culqi`. El diagnóstico marca dos cobros en menos de 36 h con sus **claves**.
2. **La misma clave no puede cobrarse dos veces** (`intentos_cobro.clave` es única y se reclama con el
   candado de la cuenta). Dos cobros = dos operaciones distintas. Las claves dicen cuáles:
   `alta:<usuario>:<token>` (pagó en el widget), `renovacion:<usuario>:<vencimiento>` (cron),
   `locales:<usuario>:<vencimiento>:<N>-><M>` (sumó locales). Ej.: un alta y la renovación del día
   siguiente, o un alta y una suma de locales.
3. Si una de las dos no debía ocurrir (o el cliente no la entendió y la quiere devolver dentro del
   retracto), reembolsar esa. El webhook aplica el efecto (termina la suscripción si era la cuota vigente).
4. Si de verdad hay dos cargos de la MISMA operación (misma clave o dos altas del mismo widget): es un
   fallo del sistema. Reembolsar uno y abrir incidente (guardar la salida de `caso-cliente.js`).

## 3. «Cancelé y me volvieron a cobrar»

1. `caso-cliente.js`. La fila `SUSCRIPCIÓN CANCELACION` tiene la hora exacta de la cancelación; el
   `COBRO RECLAMADO RENOVACION`, la hora en que el cron decidió cobrar.
2. **Cancelación ANTES del reclamo** → no debería poder cobrar (el reclamo relee la cuenta con el mismo
   candado). El diagnóstico lo marca 🔴: reembolsar y reportar como fallo.
3. **Reclamo ANTES de la cancelación** (el cliente canceló minutos después de que el cron empezara a
   cobrar): el cobro estaba autorizado, pero por buena fe se ofrece el reembolso. El plan se conserva hasta
   el vencimiento que dice `CANCELACION.activoHasta`, y después baja solo (`BAJADA_A_GRATIS`).
4. Sin fila `CANCELACION`: la cancelación no llegó al servidor. Preguntar por dónde canceló (la app vieja,
   un correo) y cancelar desde su panel o con él al teléfono.

## 4. «Se me cobró pero la tarjeta fue rechazada» / bajó a Gratis

Los `COBRO_RECHAZADO` muestran cada reintento de la renovación (3, cada 3 días) y el `BAJADA_A_GRATIS` el
final. Si actualiza la tarjeta: que vuelva a contratar desde Planes (es un alta nueva; los días que le
quedaban se suman).

## 5. Contracargo (el titular desconoce el cargo ante su banco)

No llega por webhook: aparece en **Culqi → Controversias**. Responder allí con la evidencia
(`caso-cliente.js`: hora del alta, aceptación, uso del panel). Si se pierde: marcarlo como reembolsado en
el comprobante (nota de crédito / anulación según el caso) y, si el cliente era de un promotor, asentar un
**ajuste** negativo en `/ruta → Comisiones` con el motivo (contrato 7.4: «desconocido por el titular»).

## 6. Webhook atascado

`/health/operacion` (y el monitor) avisan si hay eventos PENDIENTE de más de 30 min o FALLIDO. Un
FALLIDO agotó 8 intentos: mirar `ultimoError` en `eventos_webhook`; arreglar la causa y volverlo a
PENDIENTE con `intentos = 0` para que el worker lo reprocese (no reaplica: el procesador es idempotente).

## 7. Comisiones del promotor

La comisión de cada visita se recalcula sola con los pagos reales y lo devengado se **asienta** en el libro
(`movimientos_comision`, cada hora y al abrir `/ruta`). Un reembolso o una visita anulada producen una
REVERSIÓN asentada, nunca un borrado: el saldo baja y se descuenta en la siguiente liquidación
(contrato 7.4). La liquidación del mes se copia desde `/ruta → Comisiones`; el pago al promotor se asienta
con su n.º de operación y recibo por honorarios.
