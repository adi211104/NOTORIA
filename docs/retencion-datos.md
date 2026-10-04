# Retención de datos — cuánto se guarda cada cosa

> Nace de la auditoría del 2026-10-02 (punto P2-10): el producto sabía cuánto
> conservar los documentos fiscales, pero no lo había decidido para nada más.
> Esto es la política **propuesta y vigente en el código**; lo que dice «pendiente
> de decisión» todavía no tiene borrado automático.

| Dato | Cuánto | Por qué | Estado |
|---|---|---|---|
| Comprobantes, XML firmado, CDR, resúmenes SUNAT | **5 años** | Obligación tributaria. Ni el borrado de cuenta los toca: se anonimiza | En el código (`lib/borrarCuenta.js`) |
| Pagos e intentos de cobro (`pagos`, `intentos_cobro`) | **5 años** | Son el respaldo contable de los comprobantes y de la reconciliación con Culqi | Se conservan; sin purga |
| Libro de Reclamaciones | **2 años** desde la respuesta | D.S. 101-2022-PCM | Sin purga automática (volumen mínimo) |
| Snapshots de rating | **Mientras la cuenta exista** | Es lo único irrecuperable del producto: Google enseña la foto de hoy, no la película | Se borran solo con la cuenta |
| Reseñas, alertas, comentarios, menciones | Mientras la cuenta exista | Son el historial que el cliente paga por tener | Se borran con la cuenta |
| Visitas de la Ruta comercial y su historial (`cambios_visita`) | **12 meses tras la última comisión posible** (contrato: 60 días + 12 meses) | Prueba de atribución de una comisión | Se anulan, nunca se borran. Purga: pendiente de decisión |
| `eventos_webhook` | **180 días** tras procesarse | Auditoría y depuración; pasado eso no aporta | Pendiente de decisión (hoy crece ~0 filas/mes) |
| `candados_job` | Una fila por trabajo (15) | No crece | — |
| `registro_actividad` del equipo | Mientras la cuenta exista | Rendición de cuentas hacia el dueño | Se borra con la cuenta |
| Logs de Railway | Lo que retenga Railway | Contienen correos y ids, nunca contraseñas ni tokens | Fuera de nuestro control |
| Respaldos (`respaldos/*.json`) | **Los últimos 3** | Llevan datos personales de terceros (Ley 29733) | Manual: borrar los viejos al hacer uno nuevo |

**Cómo decidir lo «pendiente»:** con el volumen de hoy (12 usuarios, 0 webhooks
reales al mes) ninguna tabla justifica un cron de purga, y un cron que borra es el
tipo de pieza que, si se equivoca, no avisa. Se programa el día que una tabla
pase de ~100 000 filas o que un cliente pida saber cuánto guardamos sus datos.
