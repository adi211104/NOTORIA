# Dónde nos quedamos — 2026-08-28

> **Este archivo existe porque la sesión se muda de PC.** Claude Code guarda su memoria por
> ruta (`.claude/projects/…`), así que al clonar el repo en el taller empieza en blanco. Lo que
> no esté escrito aquí o en `CLAUDE.md`, no existe para la sesión siguiente.
>
> 🗑️ **Bórralo cuando la mudanza esté terminada y la renovación verificada.** Es una nota de
> traspaso, no documentación permanente: lo que valga para siempre ya está en `CLAUDE.md`.

---

## 🔴 Lo primero al retomar: la renovación está ARMADA y cobra sola

**`revisorculqi@gmail.com` tiene el vencimiento adelantado a ayer y `suscripcionActiva: true`.**
El cron de renovaciones (`0 5 * * *`, hora del servidor) le va a cobrar **S/14.50** a la tarjeta
guardada **sin que nadie lo toque**. Es la primera vez que se ejercita la renovación con dinero
real, y es el tramo que si falla **regala el plan de por vida sin producir ninguna señal**.

**Las cinco cosas que hay que mirar después de esa pasada:**

1. Un `Pago` **EXITOSO de S/14.50** con `tipo: RENOVACION` — si dice `INICIAL`, fue por la rama
   equivocada.
2. Un comprobante nuevo: **B001-00000003**.
3. `mesesPromoRestantes`: **1 → 0** (era el segundo y último mes de la promo).
4. `fechaVencimiento` movido un mes, calculado **desde hoy** porque el anterior ya pasó.
5. En los logs, el ciclo de renovaciones de las 5:00.

**Y después, sin falta:** reembolsar **y ANULAR la boleta** dentro de 7 días. Son dos sistemas
distintos; reembolsar en Culqi no anula nada ante SUNAT.

```bash
railway ssh --service api "node scripts/reembolsar-cargo.js <chr_live_...> --aplicar"
railway ssh --service api "node scripts/anular-boleta.js B001-00000003 --aplicar"
```

🔙 **Marcha atrás, si se decide no seguir** (antes de las 5:00): los valores previos eran
`suscripcionActiva: false` y `fechaVencimiento: 2026-09-28T14:35:03.111Z`.

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
