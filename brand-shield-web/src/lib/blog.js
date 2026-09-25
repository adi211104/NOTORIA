// brand-shield-web/src/lib/blog.js
// Artículos del blog. Cada uno apunta a una búsqueda real de dueños de
// restaurantes/hoteles en Perú (SEO). El contenido va como bloques
// estructurados para renderizar sin parser de markdown:
//   { tipo:'p', texto }          párrafo (admite <strong> y <a> inline)
//   { tipo:'h2', texto }         subtítulo
//   { tipo:'lista', items }      lista con viñetas
//   { tipo:'numerada', items }   lista numerada
//   { tipo:'destacado', texto }  caja resaltada
// Al agregar un artículo: sumarlo acá y ya — índice, página y sitemap lo
// levantan solos.

export const ARTICULOS = [
  {
    slug: 'como-responder-una-resena-negativa-restaurante',
    titulo: 'Cómo responder una reseña negativa de tu restaurante (con plantillas)',
    descripcion: 'Guía práctica para responder reseñas negativas en Google sin empeorar las cosas: qué decir, qué no decir nunca, y 3 plantillas listas para adaptar.',
    fecha: '2026-08-03',
    minutos: 6,
    contenido: [
      // La cifra del 89% existe, pero medía otra cosa: cuánta gente ESPERA
      // respuesta, no cuánta LEE las respuestas antes de decidir. Corregida con
      // el dato exacto y su enlace. Una cifra bien traída convence igual y no
      // expone a un reclamo por publicidad engañosa (Ley 29571). Los bloques
      // 'p' se pintan con dangerouslySetInnerHTML, así que el <a> va inline.
      { tipo: 'p', texto: 'Una reseña negativa duele, pero no es la reseña la que te quita clientes: es tu respuesta — o tu silencio. El 89% de los consumidores espera que el negocio responda a su reseña, y el 42% dice que es poco probable que use un negocio que las ignora por completo (<a href="https://www.brightlocal.com/research/local-consumer-review-survey/" target="_blank" rel="noopener noreferrer">BrightLocal, Local Consumer Review Survey 2026</a>). Una respuesta calmada y concreta frente a una crítica dura te hace ganar más confianza que diez reseñas de 5 estrellas.' },
      { tipo: 'h2', texto: 'La regla de oro: responde para los que van a leer, no para el que escribió' },
      { tipo: 'p', texto: 'El autor de la reseña probablemente no vuelva. Pero cientos de clientes potenciales van a leer ese intercambio durante años. Tu respuesta no es una discusión privada: es tu carta de presentación pública. Por eso nunca se responde en caliente, nunca se acusa al cliente de mentir (aunque mienta), y nunca se entra en detalles de la pelea.' },
      { tipo: 'h2', texto: 'La estructura que funciona (4 pasos)' },
      { tipo: 'numerada', items: [
        '<strong>Agradece y saluda por su nombre.</strong> "Hola Carlos, gracias por tomarte el tiempo de contarnos tu experiencia."',
        '<strong>Reconoce lo concreto sin excusas largas.</strong> "Lamentamos que el tiempo de espera arruinara tu almuerzo — 40 minutos no es el estándar que queremos."',
        '<strong>Di qué vas a hacer al respecto.</strong> "Ya revisamos con el equipo de cocina qué pasó ese sábado y reforzamos el turno de fin de semana."',
        '<strong>Invita a seguir en privado y a volver.</strong> "Nos encantaría que nos des otra oportunidad — escríbenos al WhatsApp del local y te atendemos personalmente."',
      ]},
      { tipo: 'h2', texto: 'Lo que NO debes hacer nunca' },
      { tipo: 'lista', items: [
        'Responder el mismo día si estás molesto. La reseña puede esperar 24 horas; una mala respuesta queda para siempre.',
        'Acusar al cliente de mentir o exigirle pruebas en público. Aunque tengas razón, pierdes frente a los lectores.',
        'Copiar y pegar la misma respuesta genérica en todas. Los lectores lo notan y transmite que no te importa.',
        'Ofrecer compensaciones en público ("ven y te invitamos el postre") — entrenas a la gente a quejarse para conseguir cosas gratis.',
        'Ignorarla. Una crítica sin respuesta le dice a todo el que la lee que al dueño no le interesa.',
      ]},
      { tipo: 'h2', texto: '3 plantillas listas para adaptar' },
      { tipo: 'p', texto: '<strong>Queja por demora:</strong> "Hola [nombre], gracias por avisarnos. Tienes razón: ese día la espera se nos fue de las manos y no es la experiencia que queremos dar. Ya ajustamos los turnos de cocina para los fines de semana. Si nos das otra oportunidad, escríbenos antes de ir y nos aseguramos de que tu mesa salga a tiempo."' },
      { tipo: 'p', texto: '<strong>Queja por la comida:</strong> "Hola [nombre], lamentamos que el plato no estuviera a la altura. Se lo pasamos al chef con tu detalle exacto — nos sirve más de lo que crees. Nos encantaría que pruebes la nueva versión; pregunta por [encargado] cuando vuelvas."' },
      { tipo: 'p', texto: '<strong>Queja por el trato:</strong> "Hola [nombre], sentimos mucho que el trato no fuera el correcto — es lo primero que pedimos a nuestro equipo. Ya conversamos con el personal de ese turno. Gracias por decirlo: es la única forma de mejorar."' },
      { tipo: 'destacado', texto: 'Notoria te avisa por email en cuanto el escaneo encuentra una reseña negativa y te sugiere la respuesta con IA según las estrellas y el motivo — la editas, la apruebas y listo. <a href="/registro">Crea tu cuenta gratis</a> y deja de enterarte tarde.' },
    ],
  },
  {
    slug: 'resenas-falsas-google-que-hacer',
    titulo: '¿Te dejaron reseñas falsas en Google? Qué hacer paso a paso',
    descripcion: 'Cómo identificar una reseña falsa en Google Maps, cómo reportarla para que Google la elimine y cómo proteger tu restaurante de futuros ataques.',
    fecha: '2026-08-03',
    minutos: 7,
    contenido: [
      { tipo: 'p', texto: 'Abres Google Maps y hay tres reseñas de 1 estrella nuevas, de gente que jamás pisó tu local. No estás paranoico: los ataques de reseñas falsas son reales, baratos de ejecutar y más comunes de lo que parece — a veces de un competidor, a veces de un cliente conflictivo con varias cuentas, a veces de "agencias" que venden ese servicio.' },
      { tipo: 'h2', texto: 'Cómo reconocer una reseña falsa' },
      { tipo: 'lista', items: [
        '<strong>Cuenta recién creada o sin historial:</strong> el autor tiene 0-2 reseñas en total, sin foto, con nombre genérico.',
        '<strong>1 estrella sin texto:</strong> el patrón clásico de bot — calificación mínima y ni una palabra.',
        '<strong>Texto genérico que aplicaría a cualquier negocio:</strong> "pésimo servicio, no vuelvo" sin ningún detalle de tu local, tus platos o tu personal.',
        '<strong>Varias reseñas negativas en pocas horas:</strong> tus clientes reales no se coordinan para quejarse un martes a las 3 AM.',
        '<strong>Acusaciones graves sin registro:</strong> hablan de una intoxicación o un robo, pero no hay ninguna queja interna, ninguna boleta, ningún reclamo ese día.',
      ]},
      { tipo: 'h2', texto: 'Paso 1: NO respondas como si fuera un cliente real' },
      { tipo: 'p', texto: 'Responder "lamentamos tu experiencia" a una reseña falsa la legitima ante los lectores. La respuesta correcta es serena y firme: "No encontramos ningún registro de tu visita en nuestro local. Hemos reportado esta reseña a Google. Si realmente nos visitaste, escríbenos con el detalle y lo revisamos de inmediato." Eso le dice a todo el que lee que la reseña es dudosa — sin pelear.' },
      { tipo: 'h2', texto: 'Paso 2: repórtala a Google' },
      { tipo: 'numerada', items: [
        'Abre la reseña en Google Maps y pulsa los tres puntos → <strong>Marcar como inapropiada</strong>.',
        'Elige el motivo: "Spam" o "Conflicto de intereses" son los que aplican a reseñas falsas.',
        'Si administras tu ficha con Google Business Profile, repórtala también desde ahí (Reseñas → Marcar). El reporte desde la cuenta del dueño pesa más.',
        'Si son varias, repórtalas todas — cada una por separado — y guarda capturas con fecha por si necesitas escalar.',
      ]},
      { tipo: 'p', texto: 'Google suele responder en días o semanas. No elimina todo lo que se reporta, pero los patrones evidentes (cuentas nuevas, ráfagas coordinadas) tienen alta tasa de eliminación. Si rechazan tu reporte, puedes apelar desde Google Business Profile con evidencia.' },
      { tipo: 'h2', texto: 'Paso 3: contrarresta con reseñas reales' },
      { tipo: 'p', texto: 'Mientras Google procesa el reporte, tu mejor defensa es el volumen: pide reseñas a tus clientes reales de esta semana. Un QR en la mesa o en la boleta con el enlace directo convierte más de lo que crees. Diez reseñas auténticas de 5 estrellas diluyen el efecto de tres falsas mucho antes de que Google las borre.' },
      { tipo: 'h2', texto: 'Paso 4: monitorea para que la próxima no te agarre dormido' },
      { tipo: 'p', texto: 'El daño real de un ataque no son las estrellas: es el tiempo que pasa sin que lo notes. Un ataque el viernes por la noche que descubres el lunes ya te costó el fin de semana completo de clientes que miraron tu ficha y eligieron otro local.' },
      { tipo: 'destacado', texto: 'Notoria escanea tus reseñas automáticamente, marca las sospechosas con el motivo exacto (texto repetido entre cuentas, 1★ sin comentario, pico inusual) y te avisa por email en cuanto el escaneo las encuentra. <a href="/#hero">Analiza tu negocio gratis</a> — te decimos en 10 segundos si tienes reseñas sospechosas ahora mismo.' },
    ],
  },
  {
    slug: 'como-eliminar-resena-google-maps',
    titulo: 'Cómo eliminar una reseña de Google Maps (lo que sí funciona)',
    descripcion: 'Qué reseñas puede eliminar Google, cómo reportarlas correctamente desde tu ficha de negocio, cuánto tarda y qué hacer cuando Google dice que no.',
    fecha: '2026-08-03',
    minutos: 5,
    contenido: [
      { tipo: 'p', texto: 'Primero la verdad incómoda: <strong>no puedes borrar una reseña solo porque no te gusta.</strong> Google únicamente elimina reseñas que violan sus políticas. La buena noticia: los ataques falsos, el spam y las reseñas con conflicto de interés SÍ las violan — y hay una forma correcta de reportarlas que aumenta mucho las chances.' },
      { tipo: 'h2', texto: 'Qué reseñas elimina Google' },
      { tipo: 'lista', items: [
        '<strong>Spam y contenido falso:</strong> reseñas de gente que nunca fue cliente, cuentas bot, ráfagas coordinadas.',
        '<strong>Conflicto de intereses:</strong> reseñas de competidores, exempleados despechados o del propio dueño inflando su rating.',
        '<strong>Contenido ofensivo o ilegal:</strong> insultos, discriminación, datos personales de terceros.',
        '<strong>Contenido fuera de tema:</strong> quejas políticas, reclamos que no tienen que ver con la experiencia en el local.',
      ]},
      { tipo: 'p', texto: 'Lo que NO elimina: críticas legítimas aunque sean duras, exageradas o injustas a tu criterio. "La peor pizza de mi vida" es una opinión protegida; con esas la única vía es una buena respuesta pública.' },
      { tipo: 'h2', texto: 'El proceso correcto, en orden' },
      { tipo: 'numerada', items: [
        '<strong>Repórtala desde tu Google Business Profile</strong> (no solo desde Maps como usuario): business.google.com → Reseñas → tres puntos → Reportar reseña. El reporte del propietario entra a una cola distinta.',
        '<strong>Elige el motivo correcto.</strong> "Spam" para bots y falsas; "Conflicto de intereses" si sospechas de un competidor o exempleado. Un motivo mal elegido = rechazo automático.',
        '<strong>Espera la resolución</strong> (3 días a 2 semanas normalmente). Puedes ver el estado en la Herramienta de gestión de reseñas de Google.',
        '<strong>Si la rechazan, apela.</strong> La misma herramienta permite una apelación por reseña. Adjunta contexto: capturas, fechas, el patrón del ataque.',
        '<strong>Casos graves (difamación, extorsión):</strong> en Perú puedes escalar por la vía legal — una carta notarial al autor identificable o una denuncia ante INDECOPI si es competencia desleal. Para eso necesitas evidencia guardada con fechas.',
      ]},
      { tipo: 'h2', texto: 'Mientras tanto: que la reseña no te siga costando clientes' },
      { tipo: 'p', texto: 'El proceso puede tardar semanas y tu ficha sigue recibiendo visitas todos los días. Responde la reseña señalando con calma que no hay registro de esa visita y que fue reportada — los lectores saben leer entre líneas. Y empuja reseñas frescas de clientes reales: el rating que la gente ve es el promedio, y el promedio se recupera con volumen.' },
      { tipo: 'destacado', texto: 'Notoria detecta las reseñas con patrón de ataque y te dice exactamente cuáles reportar y por qué motivo — en lugar de que revises una por una. <a href="/registro">Empieza gratis</a>: tu primer escaneo tarda un minuto.' },
    ],
  },
  {
    slug: 'como-subir-rating-restaurante',
    titulo: 'Cómo subir el rating de tu restaurante en Google: 7 tácticas que funcionan',
    descripcion: 'Estrategias concretas para subir tu calificación en Google Maps: matemática del rating, cómo pedir reseñas sin incomodar, y los errores que te hunden.',
    fecha: '2026-08-03',
    minutos: 6,
    contenido: [
      { tipo: 'p', texto: 'Entre un restaurante de 4.0 y uno de 4.4 a dos cuadras, la mayoría ni siquiera lee las reseñas: elige el número más alto y ya. Google además posiciona mejor a los negocios con mejor rating y más actividad. Subir de 4.0 a 4.4 no es cosmético — es más gente entrando por la puerta.' },
      { tipo: 'h2', texto: 'Primero, la matemática (para que no te frustres)' },
      { tipo: 'p', texto: 'Si tienes 200 reseñas con promedio 4.0, necesitas unas 40 reseñas de 5 estrellas seguidas para llegar a 4.2. El rating se mueve lento — y por eso la táctica central no es "conseguir algunas reseñas buenas" sino <strong>construir un flujo constante</strong> de reseñas nuevas. Un negocio que recibe 15 reseñas frescas al mes sube solo; uno que recibe 2 está a merced de cualquier cliente molesto.' },
      { tipo: 'h2', texto: 'Las 7 tácticas' },
      { tipo: 'numerada', items: [
        '<strong>Pide la reseña en el momento correcto:</strong> justo después de un momento bueno — el postre que gustó, el cumpleaños que salió perfecto. No al entregar la cuenta de mala gana.',
        '<strong>Pon el enlace directo a un toque:</strong> QR en la mesa, en la boleta o en el empaque de delivery que abra directamente el formulario de reseña (no tu ficha — el formulario). Cada paso extra pierde gente.',
        '<strong>Entrena a tu equipo con una frase:</strong> "Si le gustó, nos ayuda un montón una reseña en Google — el QR está en la mesa". Natural, sin presión, y solo cuando el cliente está contento.',
        '<strong>Responde TODAS las reseñas, buenas y malas.</strong> Google lo pondera y los clientes lo ven. Un negocio que responde parece un negocio al que le importa.',
        '<strong>Arregla la causa #1 de tus quejas.</strong> Lee tus últimas 30 reseñas negativas y cuenta los motivos. Casi siempre hay UN patrón (demora, frío, un turno específico). Arreglar eso vale más que cualquier campaña.',
        '<strong>Delivery cuenta:</strong> si la mayor parte de tus quejas viene de pedidos por apps, el problema es el empaque o el tiempo de reparto — atácalo por separado, porque contamina el rating del local.',
        '<strong>Nunca compres reseñas ni pidas 5 estrellas a cambio de algo.</strong> Google detecta los patrones de compra y puede suspender tu ficha entera — y en Perú, INDECOPI lo considera publicidad engañosa. El riesgo no vale las estrellas.',
      ]},
      { tipo: 'h2', texto: 'El error silencioso: no enterarte cuando algo cambia' },
      { tipo: 'p', texto: 'Todo lo anterior funciona si detectas rápido cuándo el rating se mueve y por qué. Una caída de 0.2 en dos semanas siempre tiene una causa concreta — un cocinero nuevo, un cambio de proveedor, un turno desbordado. Si la ves a tiempo, la corriges antes de que se vuelva tendencia.' },
      { tipo: 'destacado', texto: 'Notoria te da el QR listo para imprimir, responde reseñas contigo usando IA y te avisa por email si tu rating cae o si tu competencia te está alcanzando. <a href="/registro">Crea tu cuenta gratis</a> — sin tarjeta.' },
    ],
  },
  {
    slug: 'ataque-de-resenas-como-detectarlo',
    titulo: 'Ataques de reseñas: cómo detectar a tiempo que te están tumbando el rating',
    descripcion: 'Las señales de un ataque coordinado de reseñas negativas, por qué las primeras 48 horas son críticas y cómo montar una alerta temprana para tu negocio.',
    fecha: '2026-08-03',
    minutos: 5,
    contenido: [
      { tipo: 'p', texto: 'Un ataque de reseñas casi nunca se anuncia. Empieza un viernes a medianoche con dos reseñas de 1 estrella, suma cinco más el sábado, y cuando lo descubres el lunes tu 4.5 ya es un 4.1 — y el fin de semana entero de clientes potenciales vio la ficha dañada. El factor decisivo no es si te atacan: es cuánto tardas en enterarte.' },
      { tipo: 'h2', texto: 'Las 5 señales de que no son clientes reales' },
      { tipo: 'lista', items: [
        '<strong>Velocidad anormal:</strong> recibes en 24 horas más reseñas negativas que en un mes normal.',
        '<strong>Horarios imposibles:</strong> reseñas de madrugada, o un lunes cerrado, o mientras el local estaba en mantenimiento.',
        '<strong>Perfiles cascarón:</strong> cuentas creadas hace días, sin foto, con 1-2 reseñas en total — a veces todas negativas y en negocios del mismo rubro.',
        '<strong>Texto clonado:</strong> frases idénticas o casi idénticas entre varias reseñas ("pésima atención, no lo recomiendo").',
        '<strong>Sin rastro interno:</strong> nadie del equipo recuerda un incidente, no hay reclamos ni boletas que cuadren con esas supuestas visitas.',
      ]},
      { tipo: 'h2', texto: 'Por qué las primeras 48 horas importan tanto' },
      { tipo: 'numerada', items: [
        '<strong>El promedio se defiende mejor temprano:</strong> cada hora que el ataque sigue activo suma reseñas que luego cuesta semanas revertir.',
        '<strong>Los reportes tempranos agrupados funcionan mejor:</strong> reportar 5 reseñas de la misma ráfaga, juntas y con el patrón documentado, le da a Google un caso claro de coordinación.',
        '<strong>La respuesta pública inmediata contiene el daño:</strong> un "hemos detectado actividad inusual y la reportamos a Google" debajo de cada falsa le avisa a los lectores del fin de semana que algo raro pasa.',
      ]},
      { tipo: 'h2', texto: 'Cómo montar tu alerta temprana' },
      { tipo: 'p', texto: 'La versión manual: revisar tu ficha todos los días, incluidos sábados y domingos, y llevar un registro de cuántas reseñas negativas recibes por semana para notar cuándo algo se sale del patrón. Funciona, pero depende de que nadie se olvide — y los ataques eligen justo los momentos en que nadie mira.' },
      { tipo: 'p', texto: 'La versión automática: un monitor que escanee tu ficha cada pocas horas, compare contra tu ritmo histórico y te avise al instante cuando detecte un pico de negativas, cuentas sospechosas o una caída de rating. Eso es exactamente lo que hace Notoria, con el detalle de qué reseñas tienen patrón de bot y por qué.' },
      { tipo: 'destacado', texto: 'Escribe el nombre de tu negocio en <a href="/#hero">el analizador gratuito</a> y en 10 segundos te decimos si tus reseñas recientes tienen patrones sospechosos. Si quieres la vigilancia 24/7 con alertas, <a href="/registro">el plan Gratuito</a> no pide tarjeta.' },
    ],
  },

  {
    slug: 'como-pedir-resenas-google-sin-penalizacion',
    titulo: 'Cómo pedir reseñas a tus clientes sin que Google te penalice',
    descripcion: 'La forma correcta de conseguir reseñas nuevas: qué prácticas castiga Google (y mucha gente hace sin saberlo), el momento exacto para pedirlas y por qué las reseñas viejas dejan de contar.',
    fecha: '2026-08-16',
    minutos: 7,
    contenido: [
      { tipo: 'p', texto: 'Hay una asimetría que juega en tu contra todos los días: el cliente enojado escribe solo, y el cliente contento se va feliz y no escribe nada. Por eso un negocio que atiende bien puede tener un rating mediocre — no porque falle, sino porque las únicas personas suficientemente motivadas para escribir son las que se fueron molestas.' },
      { tipo: 'p', texto: 'La solución es pedir reseñas. El problema es que las tres formas más comunes de pedirlas <strong>violan las políticas de Google</strong>, y el castigo no es una advertencia: es que te borren las reseñas conseguidas así, y en casos repetidos, que te limiten la ficha.' },

      { tipo: 'h2', texto: 'Lo que Google castiga (y casi nadie sabe)' },
      { tipo: 'lista', items: [
        '<strong>Filtrar por satisfacción.</strong> Preguntar primero "¿cómo estuvo todo?" y mandar el enlace de Google solo a quien responde bien, desviando al resto a un formulario privado. Se llama <em>review gating</em> y está prohibido explícitamente. Es la trampa más común porque suena razonable y muchas herramientas de marketing la venden como función.',
        '<strong>Incentivar.</strong> Descuentos, postres gratis, sorteos o puntos a cambio de una reseña. Da igual que no exijas que sea positiva: cualquier contraprestación está prohibida.',
        '<strong>Pedirlas en lote desde el local.</strong> Pasarle la tablet del negocio a diez clientes seguidos para que dejen su reseña ahí mismo. Google ve diez reseñas desde el mismo dispositivo y la misma red en una hora, y eso tiene exactamente la forma de un ataque coordinado.',
        '<strong>Comprarlas.</strong> No hace falta explicarlo, pero conviene el dato: en 2025 Google bloqueó o eliminó <strong>292 millones</strong> de reseñas por incumplir sus políticas y borró 13 millones de fichas falsas. La detección funciona.',
      ]},
      { tipo: 'destacado', texto: 'El punto incómodo del <em>review gating</em>: no solo es sancionable, es que además no funciona a largo plazo. Un rating construido filtrando descontentos se cae solo cuando llega el primer cliente molesto que sí encuentra dónde escribir — y para entonces no tienes reseñas recientes que lo compensen.' },

      { tipo: 'h2', texto: 'Lo que sí puedes hacer: pedirle a todos, siempre' },
      { tipo: 'p', texto: 'La regla es simple: puedes pedir reseñas cuanto quieras, siempre que le pidas <strong>a todos por igual</strong> y no ofrezcas nada a cambio. Pedirle a todos suena arriesgado — "¿y si el molesto escribe?" — pero los números juegan a tu favor: si atiendes bien a nueve de cada diez, pedirle a los diez te sube el promedio. Filtrar es lo que lo hunde, porque reduce el volumen y te deja sin reseñas frescas.' },

      { tipo: 'h2', texto: 'El momento importa más que el mensaje' },
      { tipo: 'p', texto: 'La reseña se consigue en el pico de satisfacción, no al día siguiente. En un restaurante ese pico es justo después del postre o al pagar, cuando la experiencia todavía se siente; en un hotel, en el check-out, no en el correo automático de tres días después. Cada hora que pasa, la probabilidad de que escriban se desploma.' },
      { tipo: 'numerada', items: [
        '<strong>Que lo pida una persona, no un cartel.</strong> "¿Le gustó todo? Nos ayudaría muchísimo si lo cuenta en Google" convierte muchísimo más que un letrero pegado en la pared, que ya nadie ve.',
        '<strong>Que sea un solo toque.</strong> Si el cliente tiene que buscar tu negocio en Maps, encontrar el botón y pensar qué escribir, lo abandona. Un QR o un enlace corto que abra directamente el cuadro de reseña elimina toda esa fricción.',
        '<strong>Que lo pida quien atendió.</strong> Pedirlo el mozo que sirvió la mesa funciona mejor que pedirlo el cajero, porque hay una relación de por medio.',
        '<strong>Que el equipo sepa cuándo NO pedir.</strong> A una mesa que esperó cuarenta minutos no se le pide reseña: se le pide disculpas. Pedirla ahí es regalar una de una estrella.',
      ]},

      { tipo: 'h2', texto: 'Las reseñas caducan (y esto casi nadie lo tiene en cuenta)' },
      { tipo: 'p', texto: 'Conseguir treinta reseñas de golpe y no volver a pedir nunca es una estrategia perdedora, por dos motivos. El primero es que un pico aislado de reseñas se ve artificial. El segundo es más importante: <strong>el 74% de los consumidores busca reseñas escritas en los últimos tres meses</strong>, según la encuesta de BrightLocal de 2026. Un 4.8 sostenido con reseñas de hace dos años convence menos que un 4.5 con reseñas de la semana pasada.' },
      { tipo: 'p', texto: 'La misma encuesta trae otro dato que conviene tener presente al fijarse una meta: <strong>el 31% de los consumidores solo entra a negocios con 4.5 estrellas o más</strong>, cuando el año anterior era el 17%. La vara sube rápido. Lo que hace un año era un buen rating, hoy deja fuera a un tercio de la gente.' },
      { tipo: 'p', texto: 'La conclusión práctica: pedir reseñas no es una campaña, es una rutina. Pocas y constantes le ganan a muchas de golpe.' },

      { tipo: 'h2', texto: 'Un guion que puedes usar mañana' },
      { tipo: 'p', texto: 'Para el equipo de sala, al momento de la cuenta: <em>"¿Todo bien con la comida hoy? Qué bueno. Si tiene un minuto, nos ayuda muchísimo una reseña en Google — es este código, se abre solo."</em> Sin condicionar, sin ofrecer nada, sin preguntar antes qué nota va a poner.' },
      { tipo: 'p', texto: 'Y una última pieza que se olvida: <strong>responde las que lleguen</strong>. Según esa misma encuesta, el 89% de los consumidores espera respuesta a su reseña, y el 42% dice que es poco probable que use un negocio que las ignora por completo. Responder también le señala al siguiente cliente que del otro lado hay alguien.' },

      { tipo: 'destacado', texto: 'Notoria genera el <strong>QR y el enlace corto</strong> de tu negocio para pedir reseñas en un solo toque, y vigila las que van llegando: te avisa si aparece una negativa o si alguna tiene patrón de bot. <a href="/registro">El plan Gratuito</a> incluye el QR y no pide tarjeta.' },
    ],
  },
  {
    slug: 'extorsion-con-resenas-que-hacer',
    titulo: 'Te dejaron 1 estrella y te escriben pidiendo plata: qué hacer',
    descripcion: 'El chantaje con reseñas es común en Lima y casi nadie sabe cómo responder. Qué guardar, qué reporta Google y qué no, y por qué la denuncia penal y INDECOPI son puertas distintas.',
    fecha: '2026-08-25',
    minutos: 9,
    contenido: [
      { tipo: 'p', texto: 'El patrón se repite y casi siempre es el mismo: aparece una reseña de 1 estrella, a veces sin texto, a veces con una acusación grave. Minutos u horas después llega un mensaje por Instagram, por WhatsApp o por el chat de la propia ficha. El tono es amable. Dice algo como que «se puede arreglar», que si le invitan una cena la quita, que por doscientos soles la borra hoy mismo.' },
      { tipo: 'p', texto: 'Casi todo dueño de restaurante en Lima conoce a alguien a quien le pasó, y aun así no hay prácticamente nada escrito en español sobre qué hacer. Esta guía es lo que sí se puede hacer, en orden, y —tan importante como eso— lo que no.' },
      { tipo: 'destacado', texto: '<strong>Esto no es asesoría legal.</strong> Es una guía práctica sobre cómo conservar la evidencia y a qué puerta tocar. Las decisiones sobre denunciar y cómo hacerlo conviene tomarlas con un abogado. Notoria no afirma que ninguna reseña sea falsa: eso lo determinan Google o la autoridad competente, no una plataforma.' },

      { tipo: 'h2', texto: 'Lo primero: no pagues, y no borres nada' },
      { tipo: 'p', texto: 'Pagar no cierra el problema, lo abre. Quien cobró una vez sabe dos cosas: que el método funciona y que tú pagas. Y no hay ninguna garantía de que la reseña se retire — ni de que no aparezca otra la semana siguiente, desde otra cuenta.' },
      { tipo: 'p', texto: 'El segundo error es más frecuente y más caro: <strong>borrar la conversación</strong>. Bloquear a la persona, vaciar el chat o denunciar el perfil para que desaparezca se siente como recuperar el control, y lo que hace es destruir la única prueba de que hubo una exigencia de dinero. Sin ese mensaje solo queda una reseña negativa, que es exactamente lo que a un tercero le parece un cliente molesto.' },
      { tipo: 'p', texto: 'Tampoco respondas la reseña acusando de extorsión en público. Aunque tengas razón, quien lee tu ficha no tiene forma de saberlo y lo que ve es un negocio peleando con un cliente.' },

      { tipo: 'h2', texto: 'Qué guardar, y cómo' },
      { tipo: 'p', texto: 'La calidad de la evidencia decide todo lo que viene después. Lo que sirve:' },
      { tipo: 'lista', items: [
        '<strong>Capturas de la conversación completa</strong>, no del mensaje suelto. Que se vea el nombre de usuario, la fecha y la hora, y el hilo entero: el mensaje aislado no prueba a quién se lo dijeron ni cuándo.',
        '<strong>La reseña, con su texto exacto y su fecha.</strong> Si el autor la edita o la borra, tu captura es lo único que queda. Google no guarda un historial que tú puedas consultar.',
        '<strong>El perfil de la cuenta que la dejó:</strong> cuántas reseñas tiene en total, desde cuándo, a qué otros negocios. Un perfil creado esa semana con tres reseñas de 1 estrella dice bastante.',
        '<strong>La coincidencia en el tiempo.</strong> Que el mensaje llegara minutos después de la reseña es el dato más elocuente que vas a tener, y es el que más rápido se pierde.',
        '<strong>Tus registros de ese día:</strong> comandas, boletas, reservas, cámaras. Si la reseña describe una visita que no ocurrió, esto es lo que lo sostiene.',
      ]},
      { tipo: 'p', texto: 'Guarda todo fuera del teléfono el mismo día — un correo a ti mismo con los archivos adjuntos basta y deja fecha. Los teléfonos se pierden, los chats se borran solos y las apps cambian de dueño.' },

      { tipo: 'h2', texto: 'Qué retira Google y qué no' },
      { tipo: 'p', texto: 'Acá está el malentendido que más tiempo hace perder. Google <strong>no arbitra si un cliente tiene razón</strong>. No va a leer tu descargo y decidir que la comida sí estaba buena. Lo que sí hace es retirar contenido que incumple sus políticas, y una reseña que se usa como palanca para pedir dinero no es el relato de una experiencia real: es otra cosa.' },
      { tipo: 'p', texto: 'Por eso el reporte tiene que apuntar a la política, no al enojo. «Es injusta» no es una causal. «No corresponde a una experiencia real y se está usando para exigir un pago, y acá está el mensaje» sí describe un incumplimiento.' },
      { tipo: 'numerada', items: [
        'Reporta la reseña desde tu ficha en Google Maps, en las opciones de la propia reseña.',
        'Si tienes acceso al perfil de empresa, usa además su formulario de reporte: deja constancia de la solicitud con fecha.',
        'Sé breve y factual. Sin adjetivos, sin historia larga: qué política se incumple y qué evidencia existe.',
        'Anota el día que reportaste. Si no hay respuesta en un par de semanas, se puede insistir, y la fecha es lo que sostiene la insistencia.',
      ]},
      { tipo: 'p', texto: 'Prepárate para que el primer reporte no prospere. Es lo normal, no una señal de que hiciste algo mal. Insistir con la misma evidencia ordenada funciona más veces que mandar cinco reportes distintos escritos en caliente.' },

      { tipo: 'h2', texto: 'Denuncia penal e INDECOPI son dos puertas distintas' },
      { tipo: 'p', texto: 'Esto se confunde casi siempre, y tocar la puerta equivocada cuesta semanas.' },
      { tipo: 'p', texto: '<strong>Si un particular te exige dinero</strong> a cambio de retirar la reseña, eso no es materia de consumo: es un asunto penal. La figura que suele invocarse es la <strong>extorsión</strong>, tipificada en el artículo 200 del Código Penal peruano, que sanciona a quien obtiene una ventaja económica mediante violencia o amenaza. La denuncia se presenta ante la Policía Nacional o el Ministerio Público, y es ahí donde el expediente que armaste vale.' },
      { tipo: 'p', texto: '<strong>INDECOPI entra por otro lado.</strong> Es la autoridad de protección al consumidor y también la que reprime la competencia desleal. Si detrás del ataque hay un competidor —no un cliente— la vía es la Ley de Represión de la Competencia Desleal (Decreto Legislativo 1044), que contempla los actos de denigración. Esa denuncia sí va a INDECOPI. Pero para un chantaje de un particular, INDECOPI no es la puerta.' },
      { tipo: 'p', texto: 'Y una precisión que evita un disgusto: el Código de Protección y Defensa del Consumidor (Ley 29571) regula lo que tú le debes a tus clientes, no lo que un tercero te hace a ti. Es la norma por la que tienes Libro de Reclamaciones — no la que sanciona a quien te extorsiona.' },

      { tipo: 'h2', texto: 'Mientras tanto, tu ficha sigue ahí' },
      { tipo: 'p', texto: 'Google puede tardar semanas, o no retirar nada. Así que en paralelo hay que hacer lo único que está enteramente en tus manos: <strong>diluir</strong>. Una reseña de 1 estrella pesa muchísimo en una ficha de 40 reseñas y casi nada en una de 400. Pedirles reseña a los clientes reales, de forma constante y sin condicionar la nota, es lo que devuelve el promedio a su sitio mientras el trámite avanza.' },
      { tipo: 'p', texto: 'Y responde la reseña, con una sola frase sobria: que no encuentras registro de esa visita, que lo estás revisando y que quien haya tenido un problema real puede escribirte directo. Le habla al que lee, que es el único que importa.' },

      { tipo: 'destacado', texto: 'Notoria detecta la reseña el mismo día que aparece, guarda su <strong>texto y su fecha exacta aunque después la editen o la borren</strong>, y arma el <strong>expediente en PDF</strong> con el historial de tu rating alrededor de esa fecha — que es justo lo que a mano nadie reúne bien. <a href="/registro">Crea tu cuenta gratis</a>: el plan Gratuito ya vigila tu ficha.' },
    ],
  },
];

export const articuloPorSlug = (slug) => ARTICULOS.find((a) => a.slug === slug);
