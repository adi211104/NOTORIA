# Monitor de uptime externo — Cloudflare Worker

Vigila `api.usenotoria.app/health` y `usenotoria.app` **cada 5 minutos** y avisa por correo.

## Por qué está en Cloudflare y no en UptimeRobot

Las dos razones, y la segunda pesa más que la primera:

1. **No hace falta crear ninguna cuenta.** Cloudflare ya se usa para el DNS y el Email
   Routing del dominio. UptimeRobot y BetterStack son gratis pero exigen alta.
2. 🔴 **Es la única de las cuatro piezas que no aloja nada del producto.** El backend está en
   Railway, la web en Vercel y el workflow viejo en GitHub. Un monitor que vive en la misma
   plataforma que vigila se cae con ella. Este no.

## Por qué no basta con `.github/workflows/uptime.yml`

Ese workflow **se queda**, pero no sustituye a esto. GitHub degrada los cron programados en
repos de poca actividad: con el `*/15` intacto, los huecos medidos entre pasadas fueron de
**28 minutos a 11 horas**, y en las últimas 24 h del 30/08 fueron de **5,0 h y 5,1 h**. Un
monitor que mira una vez cada cinco horas produce confianza sin dar cobertura.

## Las dos reglas del diseño

- 🔴 **Solo se avisa en el CAMBIO de estado.** Un correo cada 5 minutos durante una caída de
  tres horas son 36 correos que enseñan a ignorar el remitente — y entonces el aviso de la
  caída siguiente llega igual que esos 36. Se escribe al caer, se escribe al volver, y en
  medio se calla. Es el mismo error que el workflow de GitHub cometió en agosto de 2026,
  cuando mandó cinco «Run failed» con el sitio respondiendo 200.
- ⚠️ **Se reintenta antes de declarar una caída.** Una sonda que falla una vez no es una
  caída: es una sonda que falló. Sin el reintento, cualquier microcorte entre Cloudflare y
  Railway produce un correo de alarma y otro de recuperación cinco minutos después.

Y las sondas comprueban **contenido, no solo el 200**: Railway puede devolver 200 con una
página de error suya, y un landing que responde 200 con el HTML vacío es exactamente el bug
que en su día rompió la verificación de marca del OAuth de Google.

## Puesta en marcha (4 comandos)

Desde `monitor-uptime/`:

```bash
npm install

# 1. Entrar a Cloudflare. Abre el navegador: hay que autorizar a mano.
npx wrangler login

# 2. Crear el almacén de estado. IMPRIME UN id: hay que DESCOMENTAR el bloque
#    [[kv_namespaces]] de wrangler.toml y pegarlo ahí. Va antes del deploy: sin
#    KV el monitor arranca igual, pero avisa en cada pasada durante una caída.
npx wrangler kv namespace create ESTADO

# 3. Cargar la llave de Resend (la pega por teclado, no queda en el historial).
#    ⚠️ Usar una API key PROPIA del monitor, no la del backend: así revocar una
#    no tumba la otra. Se crea en resend.com/api-keys con permiso de envío.
npx wrangler secret put RESEND_API_KEY

# 4. Desplegar.
npx wrangler deploy
```

## Comprobar que funciona — las dos mitades

Que el Worker responda **no prueba que el aviso llegue**. Son dos cosas distintas y hay que
comprobar las dos:

```bash
# a) ¿mide bien? Devuelve JSON con cada sonda. 200 = todo arriba, 503 = algo caído.
curl https://notoria-monitor.<tu-subdominio>.workers.dev

# b) ¿el correo sale de verdad? Manda uno de prueba a EMAIL_DESTINO.
curl "https://notoria-monitor.<tu-subdominio>.workers.dev/?correo=1"
```

Y para ver el cron corriendo solo: `npx wrangler tail`.

⚠️ **Si (a) va bien y (b) no llega nada**, el problema no es el monitor: es la ruta de correo.
`didier@usenotoria.app` depende de una regla de Email Routing en Cloudflare, y el catch-all
del dominio está en **Drop** — una dirección sin regla propia se acepta y se descarta sin
dejar rastro. Es el fallo que ya se comió los informes DMARC durante días.

## Qué NO cubre

Mide desde fuera que las dos URLs responden. No sabe si el cron de monitoreo dejó de escanear,
si SUNAT rechazó un comprobante ni si Culqi dejó de cobrar. Para eso están los avisos del
propio producto.
