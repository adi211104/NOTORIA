# Conseguir el acceso a las GBP APIs — el camino bueno

> Escrito el 2026-08-30, después de descubrir que las dos solicitudes anteriores (16/08 y 29/08)
> probablemente **nunca fueron admisibles**: a Notoria le falta un prerrequisito obligatorio que no
> estaba en ninguna lista de comprobación previa. El diagnóstico completo está en `CLAUDE.md` §19 A;
> esto es solo el procedimiento.

## Por qué estamos haciendo esto

Google exige, con estas palabras, que **todo tercero tenga una Organization account**:

> *«Every 3P / partner who requests access to Business Profile APIs must have an Organization
> account.»* — `developers.google.com/my-business/content/accounts`

Notoria es un tercero —lo dice su propia solicitud: «cada propietario nos autoriza él mismo mediante
OAuth 2.0»— y **no tiene organización**. En la lista oficial, «Create an Organization account» es el
**paso 4**, justo antes de «Request access to the API». Se envió el formulario saltándose el paso
anterior, dos veces, y las dos veces Google calló.

🔴 **La pinza que lo hace incómodo, y por lo que no se resuelve en cinco minutos:**

| Trámite | Exige | Consecuencia |
|---|---|---|
| Formulario de la API | una cuenta **owner del perfil** | → `usenotoria@gmail.com` |
| Registro de la organización | una cuenta **sin ubicaciones** y **del dominio `usenotoria.app`** | → `usenotoria@gmail.com` NO sirve, y ninguna `@gmail.com` tampoco |

De ahí que el procedimiento empiece creando una dirección y una cuenta nuevas.

---

## Lo que se toca y lo que NO

**Se crea:** una dirección de correo, una cuenta de Google y una organización. Nada de eso existe hoy.

**No se toca, y es deliberado:**
- La ficha verificada «Notoria · Perú» (`13273074415378486285`) — ni se edita, ni se mueve, ni se
  transfiere. Editar una ficha verificada la manda a revisión unos días.
- `usenotoria@gmail.com` ni su alias «enviar como», que es lo que hace que las respuestas a clientes
  pasen DMARC (§19 B5 de `CLAUDE.md`).
- El proyecto de Cloud `798376364749`.

---

## Fase 1 — La dirección de correo, en Cloudflare

> ✅ **HECHA el 2026-08-30, y destapó dos cosas que nadie esperaba.**
>
> 1. 🔴 **`agencia@usenotoria.app` YA EXISTÍA, con acción `Drop`.** Si se hubiera ido directo a
>    crear la cuenta de Google, el código de verificación se habría descartado en silencio y el
>    bloqueo habría parecido cosa de Google. Lo cazó mirar la lista antes de crear nada.
> 2. 🔴 **`didier@usenotoria.app` no tenía regla**, pese a que `CLAUDE.md` afirmaba lo contrario
>    desde el 19/08. En 24 h, nueve intentos de entrega del informe DMARC de Google, **todos
>    fallidos**. Ahí van `EMAIL_CONTABILIDAD`, `EMAIL_RECLAMACIONES` y el aviso de anular
>    comprobantes. Se creó también.
>
> ✅ Las dos comprobadas con la marca `NOTORIA-PRUEBA-RUTAS-MTGL1Y7T`: **`Forwarded`** en el
> Activity Log, contra el `Dropped` de la misma dirección seis minutos antes.
> ⚠️ El veredicto se leyó en el **log de Cloudflare, no en el buzón**: Gmail deduplica el correo
> que uno se manda a sí mismo y reenvía de vuelta, así que `in:inbox` daba cero con el reenvío
> funcionando. Ante un cero, preguntar si el método distingue.


**Quién:** lo puede hacer el agente.

1. Cloudflare → dominio `usenotoria.app` → **Email Routing** → *Direcciones de reenvío personalizadas*.
2. Crear la ruta **`agencia@usenotoria.app` → `didierprincipe@gmail.com`** (el único destino verificado).
3. Comprobar que la regla queda en **Activa**.
4. **Probarla con una marca única**: mandar un correo a `agencia@usenotoria.app` con asunto
   `NOTORIA-PRUEBA-AGENCIA-<timestamp en base36>` y buscarlo en el buzón hasta encontrarlo.

🔴 **El paso 4 no es opcional y es el que más barato sale saltarse.** El catch-all de Email Routing
está en **Drop** (§6): una dirección sin regla activa **acepta el correo en SMTP y lo descarta**, y
desde fuera es indistinguible de una entrega correcta. Si el código de verificación de Google cae
ahí, la Fase 2 se atasca sin un solo error a la vista.

⚠️ **Por qué una dirección nueva y no `hola@`:** `hola@usenotoria.app` ya está registrada como alias
de «enviar como» en `usenotoria@gmail.com`. Google se pone quisquilloso al crear una cuenta con una
dirección que ya figura en otra, y ese alias no se puede romper: es lo que mantiene las respuestas a
clientes alineadas con DMARC.

---

## Fase 2 — La cuenta de Google

**Quién:** **el dueño, obligatoriamente.** El agente no puede crear cuentas de Google.

5. Abrir una **ventana de incógnito**, para que Google no mezcle las sesiones de `usenotoria@` y
   `padkar4@` que ya están abiertas.
6. Ir a `accounts.google.com/signup` y elegir **«Para uso personal»**.
7. Nombre: `Notoria` / `Agencia` (da igual, no es público).
8. En el paso del nombre de usuario, elegir **«Usar mi dirección de correo electrónico actual»** —
   es la opción que evita tener que contratar Workspace.
9. Escribir **`agencia@usenotoria.app`**.
10. Google manda un código de verificación → llega a `didierprincipe@gmail.com` por el reenvío de la
    Fase 1 → meterlo.
11. Contraseña fuerte, y **guardarla en el gestor en ese mismo momento**, no «después»
    (`docs/secretos.md` ordena los secretos por «¿qué haría falta para recuperarlo?»).

🔴 **Esta cuenta tiene que quedarse con CERO ubicaciones para siempre.** No aceptar con ella ninguna
invitación a fichas ni crear ningún negocio: en el momento en que administre una ubicación deja de
poder registrar organizaciones, que es lo único para lo que existe.

⚠️ Si Google no ofrece «usar mi dirección actual», casi siempre es porque el flujo se tomó como
cuenta de empresa. Volver a empezar eligiendo «Para uso personal».

---

## Fase 3 — Registrar la Organization account

> ✅ **HECHA el 2026-08-30.** La organización **Notoria** existe.
>
> | | |
> |---|---|
> | **ID de organización** | **`5269452463`** — el de 10 dígitos, el que hace falta en la Fase 5 |
> | Identificador largo (URL) | `115249408036143018774` |
> | Cuenta propietaria | `agencia@usenotoria.app` |
> | Datos | Notoria · Perú · Callao · La Perla · Cal. Isla Filipinas Mza. G9 Lote 8 · +51 955599041 |
>
> 🔴 **Un requisito que este procedimiento NO anticipaba: Google obliga a invitar a un SEGUNDO
> propietario**, y avisa de que *«users having locations cannot accept invitation»*. O sea que
> **`usenotoria@gmail.com` no puede serlo**, porque administra la ficha de Notoria. Se invitó a
> `padkar4@gmail.com`, que tiene 0 ubicaciones (comprobado).
> ⚠️ **Consecuencia que hay que recordar:** esa cuenta tampoco debería aceptar nunca una ficha de
> negocio, o perdería su sitio en la organización. Son ya **dos** cuentas condenadas a no tener
> ubicaciones: `agencia@` y `padkar4@`.
>
> ⚠️ **El ID de 10 dígitos no está donde uno lo busca.** No aparece en Overview ni en Settings
> (que abre un diálogo de notificaciones), y las URLs directas a `/settings` y `/businesses`
> devuelven **404**: hay que navegar por el menú. Está en **Manage invitations**, dentro del
> párrafo de ayuda del pie.
>
> ✅ Y ahí mismo está el botón **«Request access»**, que es la vía de la Fase 4: pedir acceso a un
> negocio **sin** transferir su propiedad. Confirma que esa fase es viable tal como está escrita.


**Quién:** el dueño o el agente, con la sesión de `agencia@usenotoria.app`.

12. Ir a **`business.google.com/agencysignup`**.
13. Sitio web de la agencia: **`usenotoria.app`** → *Siguiente*.
14. Esta vez debe dejar pasar. Si vuelve a salir *«Utiliza una cuenta del dominio de la agencia»*, la
    sesión activa no es la de `agencia@` — comprobar el `authuser` de la URL.
15. Rellenar los datos: nombre **Notoria**, país **Perú**.
16. 🔴 **Anotar el ID de organización de 10 dígitos.** Hace falta en la Fase 5 y no es cómodo de
    reencontrar después.

---

## Fase 4 — Dar acceso a la ficha SIN transferir la propiedad

**Quién:** las dos cuentas, en este orden.

17. Desde la **organización**: solicitar acceso al perfil «Notoria · Perú» (`13273074415378486285`).
18. Desde **`usenotoria@gmail.com`**: aceptar la invitación.

✅ **Resultado correcto:** la organización *administra* la ficha y `usenotoria@gmail.com` **sigue
siendo el propietario principal**. Eso es justo lo que hace falta: existe la organización que el
requisito pide, y sigue habiendo un propietario personal desde el que enviar el formulario.

🔴 **NO transferir la propiedad, aunque Google lo ofrezca.** Cuatro motivos, y el último es el caro:
- Google dice que una organización **no puede poseer directamente** un perfil individual.
- Para meter una cuenta personal en una organización hay que **quitarle antes todos sus perfiles**,
  o sea desprenderse de la ficha verificada.
- El formulario de la API lo tiene que mandar el **propietario**; sin propietario personal claro, se
  pierde la única cuenta desde la que se puede enviar.
- Un movimiento mal hecho sobre una ficha verificada cuesta semanas de recuperar, y la verificación
  es lo único de todo este asunto que hoy sí está bien.

⚠️ **Lo que no está confirmado:** que baste con que la organización sea *administradora*, frente a
que Google espere que la organización sea la solicitante. La documentación no lo aclara. Se elige
esta vía por ser la reversible; si el envío vuelve a caer en silencio, ésta es la primera variable
que conviene revisar antes que ninguna otra.

---

## Fase 5 — Reenviar la solicitud

> ✅ **ENVIADA el 2026-08-30 — caso `6-5952000041022`.** Tercera solicitud, y la primera que se
> manda **cumpliendo el prerrequisito de la Organization account**. Plazo declarado en pantalla:
> *«approximately 7–10 business days»*, con la coletilla nueva *«due to a high volume of allowlist
> requests»*.
>
> ⚠️ **El asistente cambió otra vez y ahora tiene DOS pasos previos** que no estaban documentados:
> un **«Confirm your account»** al principio (confirma que se envía como `usenotoria@gmail.com`) y
> un **«Select your business»** donde hay que elegir la ficha de una lista — apareció como
> «Notoria · Service-area business · **Verified**», que confirma por enésima vez que la
> verificación no es el problema. El aviso de los **60 días** se repite ahí.
>
> 🔴 **Lo del «Continuar es el envío» SIGUE SIENDO CIERTO**, y ahora se sabe dónde: el botón del
> paso al **50 %** salta directo al **100 %** con el número de caso. No hay pantalla de revisión.

### 🔴 Lo que apareció al comprobar el acuse: Google Business Profile iba a SPAM

Dos minutos después del envío llegó un correo de **`businessprofile-noreply@google.com`** («chu pi
is now an owner of Notoria», la confirmación del segundo propietario) y estaba **en la carpeta de
Spam**, con el motivo que da Gmail: *«Este mensaje es similar a mensajes que se identificaron como
spam en el pasado.»*

🔴 **Eso es una hipótesis nueva y seria sobre los acuses que nunca aparecieron**, y no se puede
descartar como se descartó el buzón equivocado: el filtro pudo mandarlos a Spam y, si además
Gmail los borró pasados los 30 días que conserva esa carpeta, hoy no quedaría rastro **ni siquiera
con `in:anywhere`**. Encaja con que las búsquedas del 30/08 no encontraran nada de Business
Profile en toda la historia del buzón.

✅ **Corregido en el momento:** el correo se marcó como **«no es spam»**, que es lo que entrena al
filtro para que el acuse del caso `6-5952000041022` aterrice en Recibidos.

✅ **Y de paso confirmó la ruta de la Fase 1 por segunda vez:** ese correo iba dirigido «para
agencia», o sea que entró por `agencia@usenotoria.app` y el reenvío de Cloudflare lo entregó.

⚠️ **Lo que hay que mirar, y es la señal temprana:** que llegue el acuse del caso **en menos de una
hora**, y mirar **también en Spam** antes de concluir que no llegó. Si a las 24 h no está, el
problema no es el prerrequisito sino el registro del envío, y toca el foro oficial con `[API]`.


**Quién:** **el dueño.** Es una acción hacia fuera: modifica el expediente ante Google.

19. Con la sesión de **`usenotoria@gmail.com`** — el propietario, **no** la cuenta de agencia.
20. Ir a **`support.google.com/business/workflow/16726127`** (el asistente; el formulario antiguo
    `contact/api_default` ya solo redirige aquí).
21. Los cuatro campos:

| Campo | Valor |
|---|---|
| Número del proyecto de Google Cloud | `798376364749` |
| Sitio web de empresa | `https://usenotoria.app` |
| ¿Cómo supiste del formulario? | Por la documentación oficial para desarrolladores (`prereqs`) |
| Motivo principal | el mismo texto de `CLAUDE.md` §19 A **+ la frase de abajo** |

Frase que hay que añadir al motivo, y que es la razón de que este envío sea distinto de los dos
anteriores:

> «Contamos con una Organization account de Perfil de Empresa (ID: `<los 10 dígitos>`), registrada
> para cumplir el requisito aplicable a terceros que gestionan perfiles de sus clientes.»

22. 🔴 **El botón «Continuar» del paso al 50 % ES el envío.** No hay pantalla de revisión ni resumen:
    salta directo al 100 % con el número de caso. Repasar los campos **antes** de pulsarlo.
23. Anotar el número de caso.

⚠️ **No pedir un aumento de cuota.** La documentación es explícita: lo que se reenvía es la
*Application for Basic API Access*. Pedir cuota con acceso 0 es pedir el silencio otra vez.

---

## Fase 6 — Comprobar que esta vez sí entró

**Quién:** el agente.

24. **En menos de una hora**, buscar el acuse en `usenotoria@gmail.com`. La documentación describe
    *«an auto-confirmation with a case number within the hour»*, y en el foro oficial hay un caso
    calcado donde el reenvío sí lo produjo. **Es la única señal temprana que existe.**
25. **Si llega el acuse** → esperar los 7-10 días hábiles y volver a mirar `Requests per minute` en
    las tres APIs. Línea base del 30/08: **0 en las tres**, con las otras cuotas de Business
    Information conservando sus valores (100 / 200 / 10 000), que es el control de que la lectura es
    real y no una página a medio cargar.
26. **Si NO llega en 24 h** → entonces el problema no era el prerrequisito, sino que el envío no se
    registra. En ese caso la vía es el **foro oficial** (`support.google.com/business/community`)
    con `[API]` delante del asunto. No existe ningún panel de seguimiento de casos: la única forma de
    saber si un caso existe es preguntárselo a Google.

---

## Lo que puede tumbarlo igual, y no depende de nosotros

**El requisito de los 60 días.** Google exige un perfil verificado y activo 60+ días. Sigue **sin
poder fecharse**: no está en la interfaz, el selector de Rendimiento es una ventana móvil de 6 meses
que no depende de la edad del perfil, y el correo de verificación no existe en el buzón. El 30/08 se
agotaron las vías.

⚠️ Si el perfil resulta ser más nuevo que eso, esta solicitud también se cae. La diferencia es que
**ya no habría una segunda causa escondida detrás**: se habrá cumplido todo lo que sí se controla, y
lo único que quedaría es esperar a cumplir la antigüedad y reenviar.

---

## Lo que NO hay que hacer

| ❌ | Por qué |
|---|---|
| Pedir aumento de cuota | Con acceso 0 no es lo que corresponde; se reenvía la solicitud de acceso básico |
| Usar `hola@usenotoria.app` para la cuenta nueva | Rompería el alias «enviar como» que mantiene las respuestas alineadas con DMARC |
| Editar la ficha verificada | La manda a revisión unos días, sin ganar nada |
| Crear otra ficha | El duplicado ya costó un problema el 27/08 y hubo que retirarlo |
| Transferir el perfil a la organización | Ver Fase 4: se pierde el propietario personal y se arriesga la verificación |
| Enviar el formulario desde la cuenta de agencia | Es *manager*, no *owner*, y los envíos de manager rebotan |
| Dejar que la cuenta de agencia administre una ficha | Deja de poder registrar organizaciones |

---

## Estado

- [x] Fase 1 — dirección `agencia@usenotoria.app` creada y **probada con marca única** ✅ 2026-08-30
      (y de paso arreglada `didier@`, que estaba perdiendo correo)
- [x] Fase 2 — cuenta `agencia@usenotoria.app` creada ✅ 2026-08-30 (0 ubicaciones, comprobado)
- [x] Fase 3 — organización registrada ✅ 2026-08-30 · **ID de 10 dígitos: `5269452463`**
- [~] Fase 4 — **no conseguida**: el botón «Request access» de la organización no abre ningún
      diálogo (probado por tres vías). No bloquea: el requisito es *tener* la organización.
- [x] Fase 5 — solicitud enviada ✅ 2026-08-30 · **caso n.º `6-5952000041022`**
- [x] Fase 6 — ~~acuse recibido (< 1 h)~~ **Resuelta el 2026-09-08, y no como se esperaba:** no hubo
      acuse automático; Google contestó directamente con el **rechazo** de los dos casos anteriores, a
      los 10 y a los 23 días. Motivo: el perfil debe llevar **60 días verificado** (se verificó
      ~17/08/2026). La Organization account **no** era el bloqueo — sigue creada porque es requisito
      documentado para un 3P. Detalle en CLAUDE.md §19 A
- [ ] **Fase 7 — reenviar el 16 de octubre de 2026, no antes**, desde `usenotoria@gmail.com`, con la
      URL **exacta** de la ficha (`https://usenotoria.app/`, con barra final). Antes, comprobar que el
      perfil sigue **Verificado**: el 2026-09-16 se le cambió el teléfono, y editar una ficha
      verificada puede mandarla a revisión unos días

**Casos anteriores, para no confundirlos:** `3-5553000040900` (16/08) y `0-4623000041642` (29/08).
Ninguno de los dos produjo acuse.
