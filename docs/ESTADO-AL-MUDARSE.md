# Dónde nos quedamos — 2026-08-28

> **Este archivo existe porque la sesión se muda de PC.** Claude Code guarda su memoria por
> ruta (`.claude/projects/…`), así que al clonar el repo en el taller empieza en blanco. Lo que
> no esté escrito aquí o en `CLAUDE.md`, no existe para la sesión siguiente.
>
> 🗑️ **Bórralo cuando la mudanza esté terminada y la renovación verificada.** Es una nota de
> traspaso, no documentación permanente: lo que valga para siempre ya está en `CLAUDE.md`.

---

## ✅ La renovación ya se verificó (2026-08-29) — lo que queda es cerrarla

El cron cobró **solo y desatendido** a `revisorculqi@gmail.com` a las 5:00. Los cinco puntos que
esta nota dejaba por mirar salieron los cinco bien:

| Qué | Resultado |
|---|---|
| `Pago` | **EXITOSO, S/14.50, tipo RENOVACION** (no INICIAL) · `chr_live_s8Kf6bzHHeefEls3` |
| Comprobante | **B001-00000003** · 1450 = gravadas 1229 + IGV 221 |
| Promo | `mesesPromoRestantes` 1 → 0 |
| Vencimiento | **29/09** (desde hoy, porque el anterior ya había pasado — es el `max` del código) |
| Logs | `[Culqi] Renovación cobrada a revisorculqi@gmail.com` |

Extras comprobados: el cargo existe de verdad en **Culqi live** (`venta_exitosa`), el correo del
comprobante salió (`suppressed` al cliente, **copia a contabilidad `delivered`**) y el `where`
exacto del cron confirma que **no arrastró a ninguna otra cuenta**.

### ⏳ Lo que falta, en este orden y sin saltarse ninguno

1. **Esperar al resumen diario.** B001-00000003 está en `PENDIENTE` hasta que el 29 cierre en
   Lima; el cron lo agrupa a las **~00:05 del 30/08**. Límite de envío **05/09**.
   🔴 **Se decidió NO forzarlo**: el 23 y el 28 se forzó las dos veces, así que el camino
   automático del resumen nunca ha corrido solo. Con 7 días de plazo, dejarlo correr lo prueba
   sin costo.
2. **Comprobar que SUNAT lo ACEPTÓ** (`estadoSunat: ACEPTADO` y su RC con `sunatCodigo: 0`).
3. **Reembolsar** — y solo entonces:
4. **ANULAR la boleta**, dentro de 7 días desde el CDR del resumen.

```bash
railway ssh --service api "node scripts/reembolsar-cargo.js chr_live_s8Kf6bzHHeefEls3 --aplicar"
railway ssh --service api "node scripts/anular-boleta.js B001-00000003 --aplicar"
```

⚠️ **Dentro del contenedor, no en local.** En local esos scripts usan las llaves de test y el
entorno beta de SUNAT, y harían lo correcto contra el sitio equivocado **sin fallar**.

⚠️ Tras el reembolso la cuenta conserva IMPULSO hasta el 29/09 sin haber pagado. No inflama el
embudo; se limpia con `node scripts/dar-plan.js revisorculqi@gmail.com GRATIS`.

---

## Dónde va la mudanza

### ✅ Hecho en la PC de casa
- Todo commiteado y pusheado. **279 archivos versionados, cero sueltos.**
- Los cuatro archivos que no están en git, copiados al USB **`D:` (MUDANZA)** y verificados
  **por SHA-256**, no solo por tamaño:

| Archivo | Bytes | sha256 (16) |
|---|---|---|
| `backend.env` | 3253 | `d2a49c3e14c3849b` |
| `certificado.p12` | 9460 | `d04898458a176dc5` |
| `keystore.properties` | 744 | `d0a9436c73ac2bf3` |
| `notoria-upload.jks` | 4456 | `d3480fa32539a5ac` |

  ⚠️ La copia de `keystore.properties` falló en el primer intento —se pegó texto en la misma
  línea del comando y PowerShell no dijo nada— y solo lo delató comparar tamaños. **Verificar
  siempre, `copy` calla cuando falla.**
- Queda una copia de respaldo en `C:\Users\Admin\Desktop\notoria-mudanza\`.

### ⬜ Pendiente en la PC del taller
El procedimiento completo está en **`docs/mudanza-de-pc.md`**, pasos 5 al 11. En corto:
clonar los dos repos → colocar los archivos → `npm install` → `vercel link` + `vercel env pull`
→ `railway link` **desde `brand-shield/`** → `npx prisma generate` con el backend detenido →
comprobar con `prueba-planes.js`, `railway status` y `npm run build`.

**Los dos tropiezos seguros:** renombrar `backend.env` a `.env`, y corregir la línea `almacen`
de `keystore.properties` con la ruta nueva del `.jks`.

### ⬜ Al terminar
- **Borrar los archivos del USB y de la carpeta del escritorio**, y vaciar la papelera. Un
  pendrive con la `DATABASE_URL` de producción olvidado en un cajón es un riesgo permanente.
- Meter `SUNAT_CERT_PASSWORD` en el gestor de contraseñas: solo vive en Railway, y sin ella el
  `.p12` no se puede abrir.
- Guardar el `.jks` también en el gestor. **Dos PCs no son un respaldo si las dos son discos.**

---

## Estado de producción al cerrar el día

`10 usuarios (4 sin verificar) · 13 negocios (8 activos) · 1567 snapshots · 88 reseñas ·
3 alertas · 2 pagos · 2 comprobantes · 0 comentarios sociales · 0 miembros · 0 invitaciones ·
0 reclamaciones · 0 menciones · 1 promo_tarjetas`

**Suscripciones activas — ninguna es un cliente:**

| Cuenta | Plan | Nota |
|---|---|---|
| `revisormeta@usenotoria.app` | NEGOCIO | concedido a mano, sin tarjeta |
| `didierprincipe@gmail.com` | NEGOCIO | ídem. ⚠️ Vencida desde el 28/08 05:42 y **ahí se queda**: la renovación la salta por no tener tarjeta y la bajada de planes exige `suscripcionActiva: false`. No es un fallo, es el limbo de `dar-plan.js` |
| `revisorculqi@gmail.com` | IMPULSO | **la armada**, con tarjeta real guardada |

⚠️ Los dos pagos y los dos comprobantes son las pruebas del 23 y del 28 de agosto: los dos
`REEMBOLSADO`, las dos boletas `ANULADO`. **Cargos reales de clientes: cero.**

---

## Lo que se hizo hoy y ya está en `CLAUDE.md`

No hace falta releerlo aquí, pero para saber qué buscar: el cobro real de IMPULSO de punta a
punta (con su reembolso y anulación), la trampa del entorno local en los scripts de SUNAT y
Culqi, el bug del bloque de locales en un plan que no los vende, el monitor de uptime que ahora
avisa cuando deja de mirar, el DMARC apuntando a `didier@usenotoria.app`, la conexión de TikTok
movida antes de borrar la cuenta de prueba, y Speed Insights encendido de verdad.
