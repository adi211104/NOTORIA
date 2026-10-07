'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '../context/AuthContext';
import { useIdioma } from '../context/IdiomaContext';
import { ORDEN } from '../lib/planes';

// WebGL — solo en cliente, no tiene sentido en el render de servidor
const PixelBlast = dynamic(() => import('../components/PixelBlast'), { ssr: false });

import LogoNotoria from '../components/LogoNotoria';
import BotonWhatsApp from '../components/BotonWhatsApp';
import AnalisisGratis from '../components/AnalisisGratis';
// Las piezas gráficas viven aparte para no engordar más este archivo, y porque
// llevan su propia explicación de por qué son mockups y no capturas del panel.
import { GraficaAtaque, TarjetaAlerta, MedidorScore, DiagramaFlujo } from '../components/MockupsLanding';
// Capturas reales del panel (datos anonimizados — ver la cabecera del componente).
import PanelShowcase from '../components/PanelShowcase';
// Fuente única de los datos de contacto públicos (ver components/PieLegal.js)
import { CONTACTO } from '../components/PieLegal';
import { MAX_LOCALES_TOTALES } from '../lib/planes';

// Símbolo de la moneda de cobro. Los precios se cobran en soles; ver MONEDA en
// brand-shield/src/lib/precios.js, que es lo que manda en el cargo real.
const S = 'S/';

// Verde de marca como valor literal, NO como var(--accent).
// WebGL/Three.js no resuelve variables CSS: `new THREE.Color('var(--accent)')`
// no parsea y cae silenciosamente a blanco. Eso rompió la animación del hero
// al pasar la paleta a variables. Usar esta constante en cualquier cosa que
// pinte fuera de CSS (canvas, WebGL); para estilos, C.green sigue siendo lo
// correcto. Es el mismo verde en tema claro y oscuro, así que no varía.
const VERDE_MARCA = '#0B7324';

// ── Colores de marca ─────────────────────────────────────
// Paleta del landing. Apunta a las variables CSS de globals.css (no a hex
// fijos) para que el landing responda al tema claro/oscuro igual que el panel.
// Ojo: al ser var(...) ya NO se pueden concatenar sufijos de alfa tipo
// `${C.bg}CC` — para eso está --bg-t.
const C = {
  bg:       'var(--bg)',
  surface:  'var(--surface)',
  surface2: 'var(--surface2)',
  border:   'var(--border-c)',
  borderL:  'var(--border-l)',
  bgT:      'var(--bg-t)',
  text:     'var(--text)',
  text2:    'var(--text-2)',
  text3:    'var(--text-3)',
  green:    'var(--accent)',
  greenH:   'var(--accent-h)',
  greenT:   'var(--accent-t)',
  greenB:   'var(--accent-b)',
};

const GEO = "Georgia,'Times New Roman',Times,serif";

// ── Íconos SVG ───────────────────────────────────────────
const Icon = ({ d, size=20, color='currentColor', strokeWidth=1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p,i) => <path key={i} d={p}/>) : <path d={d}/>}
  </svg>
);

const ICONS = {
  bell:    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  bot:     ["M12 2a2 2 0 012 2v2h2a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2h2V4a2 2 0 012-2z","M9 12h.01M15 12h.01M9.5 16a5 5 0 005 0"],
  chat:    ["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"],
  doc:     ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M16 13H8M16 17H8M10 9H8"],
  chart:   ["M18 20V10","M12 20V4","M6 20v-6"],
  search:  ["M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"],
  alert:   ["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z","M12 9v4M12 17h.01"],
  trend:   ["M22 7l-8.5 8.5-5-5L2 17","M16 7h6v6"],
  money:   ["M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"],
  check:   ["M20 6L9 17l-5-5"],
  cross:   ["M18 6L6 18M6 6l12 12"],
  arrow:   "M5 12h14M12 5l7 7-7 7",
  lock:    ["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z","M7 11V7a5 5 0 0110 0v4"],
  eye:     ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 9a3 3 0 100 6 3 3 0 000-6z"],
  mail:    ["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z","M22 6l-10 7L2 6"],
  lightning:"M13 2L3 14h9l-1 8 10-12h-9l1-8",
  chevron: ["M6 9l6 6 6-6"],
  sol:     ["M12 17a5 5 0 100-10 5 5 0 000 10z","M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"],
  luna:    ["M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"],
};

// ── Diccionario de textos (es / en) ──────────────────────
const TEXTOS = {
  es: {
    nav: { login:'Iniciar sesión', empezar:'Empezar gratis', dashboard:'Panel de control', temaClaro:'Cambiar a modo claro', temaOscuro:'Cambiar a modo oscuro' },
    hero: {
      tag:'Monitor de reputación online',
      titulo:'Tu reputación puede hundirse',
      tituloVerde:'en una sola noche.',
      sub:'Notoria vigila tu ficha de Google, detecta ataques de reseñas y caídas de rating, y te avisa antes de que el daño sea irreversible.',
      ctaCrear:'Crear cuenta gratis', ctaComo:'Ver cómo funciona', ctaDash:'Ir al panel de control',
      micro:'Sin tarjeta de crédito · 1 negocio gratis para siempre · Registro en 30 segundos',
    },
    // Antes esto eran DOS secciones seguidas ("Por qué esto te importa" y "El
    // problema") que decían lo mismo con seis tarjetas de texto. Se fusionaron
    // en una, y el argumento lo lleva ahora la gráfica del ataque: se entiende
    // de un vistazo lo que costaba tres párrafos.
    // ⚠️ CADA CIFRA VA CON SU FUENTE PÚBLICA Y VERIFICABLE, y así debe quedar.
    // Antes decían "30% de las reseñas negativas tienen patrones de bot",
    // "−22% de clientes si el rating baja 0.3★" y "3 días tarda el daño en
    // verse": ninguna tenía respaldo, y la del 22% además contradice al único
    // estudio serio que mide eso (Luca, HBS: una estrella entera mueve 5-9% de
    // ingresos, o sea que 0.3★ no llega ni al 3%). Publicitar cifras infladas
    // es publicidad engañosa (Ley 29571) y encima es innecesario: los datos
    // reales, citados, pegan más fuerte que los inventados.
    //
    // Regla para quien toque esto: si una cifra no tiene URL pública que la
    // sostenga, no entra al landing.
    porque: {
      tag:'Por qué esto te importa',
      titulo:'La reputación online no perdona un mal fin de semana',
      fuenteLabel:'Fuente',
      items: [
        { n:'292 M', icon:'bot',
          l:'de reseñas bloqueó o eliminó Google en 2025 por incumplir sus políticas, más 13 millones de fichas de negocio falsas.',
          fuente:'Google — «New ways we’re protecting businesses on Maps», 2026',
          url:'https://blog.google/products-and-platforms/products/maps/new-ways-were-protecting-businesses-on-maps/' },
        { n:'5-9%', icon:'money',
          l:'de ingresos gana un restaurante independiente por cada estrella que sube su calificación. Al bajar, se pierde igual.',
          fuente:'M. Luca, Harvard Business School, working paper 12-016 (datos de Yelp)',
          url:'https://www.hbs.edu/ris/Publication%20Files/12-016_a7e4a5a2-03f9-490d-b093-8f951238dba2.pdf' },
        { n:'31%', icon:'trend',
          l:'de los consumidores solo entra a negocios con 4.5 estrellas o más. El año anterior era el 17%.',
          fuente:'BrightLocal — Local Consumer Review Survey 2026',
          url:'https://www.brightlocal.com/research/local-consumer-review-survey/' },
      ],
    },
    proteccion: {
      tag:'Cómo te protege Notoria', titulo:'Cuatro pasos que corren solos, 24/7',
      sub:'Tú solo entras cuando hay algo que decidir.',
      si:[
        'Marca cada reseña sospechosa con el motivo, para que puedas reportarla en Google',
        'Redacta la respuesta por ti: 30 plantillas profesionales y respuestas con IA',
        'Tú eliges por qué canal te avisamos y con qué frecuencia',
      ],
    },
    como: {
      tag:'Cómo funciona', titulo:'Listo en menos de 5 minutos',
      pasos: [
        { n:'1', t:'Agrega tu negocio', d:'Búscalo en Google Maps y selecciónalo. El rating y los datos se importan al instante.' },
        { n:'2', t:'Suma a tus competidores', d:'Elige a tus rivales directos. Notoria compara tu rating con el de ellos en cada escaneo.' },
        // ⚠️ Este paso mandaba a enlazar el perfil de empresa de Google,
        // prometiendo acceso completo al historial de reseñas. Google no ha
        // concedido acceso a esas APIs (cuota RPM = 0) y el botón autorizaba y
        // reventaba después, así que era el paso 3 de cuatro mandando al cliente
        // nuevo a lo único roto del producto. Ver `lib/gbpVisible.js` en el
        // backend: al encender el interruptor hay que devolver la frase.
        //
        // ⚠️ Y no volver a escribirla en un comentario: `prueba-gbp-visible.js`
        // busca la frase literal en el fuente y no distingue código de nota.
        { n:'3', t:'Enciende las alertas', d:'Eliges qué te avisamos y a qué correo. Desde ahí Notoria escanea sola y te escribe solo cuando pasa algo.' },
      ],
    },
    competencia: {
      tag:'Competencia', titulo:'Sabes exactamente dónde estás parado',
      sub:'No basta con saber tu rating. Lo que importa es tu rating comparado con el del local de la esquina, porque es entre ustedes dos que el cliente elige.',
      ejemploLabel:'Ejemplo ilustrativo',
      tuNegocio:'Tu negocio',
      brechaLabel:'Detrás del líder',
      filas: [
        { n:'Tu negocio', r:4.2, tuyo:true },
        { n:'Competidor a 400 m', r:4.6 },
        { n:'Competidor a 1.2 km', r:4.1 },
        { n:'Competidor a 1.8 km', r:3.8 },
      ],
      insightTag:'Lo que detecta la IA',
      insightTexto:'"Tus rivales pierden estrellas sobre todo por demora en la atención. Tú las pierdes por temperatura de la comida. Es tu oportunidad más rápida: resolver el pase de cocina te pone por encima del líder de la zona."',
      bullets: [
        { icon:'trend', t:'Comparación en cada escaneo', d:'Cada vez que Notoria revisa tu rating, revisa también el de tus competidores. Ves la brecha abrirse o cerrarse, no una foto suelta.' },
        { icon:'bot', t:'Análisis de sus debilidades', d:'La IA lee las quejas recientes de tus rivales y te dice en qué fallan ellos y en qué fallas tú. Recomendaciones concretas, no un resumen.' },
        { icon:'search', t:'Te encuentra rivales que no tenías fichados', d:'En el plan Franquicia, Notoria busca sola negocios de tu mismo rubro a la redonda y te los propone. Los que te quitan clientes sin que lo sepas.' },
      ],
    },
    features: {
      tag:'Funcionalidades', titulo:'Todo lo que necesitas en un lugar',
      // Eran nueve tarjetas de texto. Las dos que ahora se ven dibujadas —el
      // score y el historial de rating— salieron de la lista: enseñarlas y
      // además describirlas era decir lo mismo dos veces. La tercera que salió
      // (frecuencia de escaneo) ya está en la tabla comparativa, con su número
      // por plan. Las tres siguen nombradas abajo, en una línea.
      // ⚠️ REGLA: cada tarjeta describe algo que el código HACE hoy.
      // Hasta el 2026-08-17 esta lista prometía «identifica cuentas nuevas», y
      // esa señal se evalúa sobre un dato que ninguna API de reseñas devuelve, o
      // sea que no se disparaba nunca. Se reemplazó por lo que sí ocurre. Si una
      // función no la ejecuta el worker, no entra acá.
      items: [
        { icon:'lock', t:'Vigilamos tu ficha, no solo tus reseñas', d:'Cualquiera puede sugerirle a Google que tu local cerró. Si tu ficha aparece cerrada, te avisamos ese mismo día — no el lunes, cuando ya no entró nadie en todo el fin de semana.' },
        // ⚠️ Decía «Correo al minuto» y «notificación si instalas la app»: el
        // aviso sale cuando el escaneo encuentra la reseña (cada 2-72 h según el
        // plan) y la app de Android no está publicada. Corregido el 2026-09-24.
        { icon:'bell', t:'Alertas por correo', d:'Cuando el escaneo encuentra una reseña negativa o una caída de rating, te llega un correo con la reseña citada y una respuesta lista. Ese mismo día, no el lunes.' },
        { icon:'bot', t:'Detecta ataques y reseñas copiadas', d:'Compara el ritmo de reseñas de tu ficha con el tuyo habitual y marca las que repiten el mismo texto: es el patrón de una campaña comprada.' },
        { icon:'eye', t:'Mira tu ficha como un desconocido', d:'A un cliente nuevo, Google no le enseña tus reseñas más recientes sino las que considera relevantes. Te mostramos exactamente esas cinco, y cuáles siguen sin respuesta.' },
        { icon:'lightning', t:'QR para pedir reseñas', d:'Enlace directo y código QR imprimible. Convierte clientes felices en reseñas de 5 estrellas.' },
        { icon:'trend', t:'Vigila a tu competencia', d:'Compara tu rating con el de tus rivales directos, con análisis de IA de sus debilidades.' },
        // ⚠️ Decía «Responde sin salir» … «desde un solo panel», que es justo lo
        // que el producto NO puede hacer mientras Google no conceda el permiso
        // de publicación — y contradecía al FAQ de esta misma página. El valor
        // real no es dónde se publica, es no tener que pensar qué escribir.
        { icon:'chat', t:'No pienses qué escribir', d:'30 plantillas profesionales y respuestas generadas con IA. La copias y la publicas en un clic.' },
        { icon:'doc', t:'Reportes PDF mensuales', d:'El día 1 de cada mes en tu email. Ideal para socios e inversionistas.' },
      ],
      scoreTitulo:'Y un solo número que lo resume todo',
      scoreDesc:'El score de reputación combina tu rating, el ritmo de reseñas nuevas, cuántas son negativas y cuántas huelen a bot. Lo miras una vez al día y sabes si hay algo que atender.',
      masTitulo:'También incluido en todos los planes',
      mas:['Historial de rating por escaneo', 'Escaneo programado cada 2, 4, 12, 24 o 72 horas según tu plan', 'La matemática de tu rating: cuántas reseñas te faltan y cuántas aguantas'],
    },
    precios: {
      tag:'Precios', titulo:'Precios sin sorpresas',
      mensual:'Mensual', anual:'Anual (20% off)', ahorras:(m)=>`Ahorras ${S}${m}/año`,
      gratis:'Gratis', mes:'/mes', anio:'/año', popular:'Más popular', promoBienvenida:'50% OFF tus primeros 2 meses',
      // ctaPago NO puede prometer días gratis: no hay periodo de prueba, el
      // cobro es inmediato. Lleva a /precios, donde está el detalle y el botón
      // de pago.
      ctaGratis:'Empezar gratis', ctaPago:'Ver precios y contratar', ctaActual:'Plan actual', ctaUpgrade:'Actualizar', ctaCambiar:'Cambiar de plan',
      noIncluyeLabel:'No incluye:',
      planes: [
        { n:'Gratuito', p:0,
          si:['1 negocio monitoreado','Escaneo cada 24 horas el primer mes, luego cada 72 horas','Se pausa a los 30 días sin entrar y se reanuda al volver','Aviso si tu ficha aparece cerrada en Google','Score de reputación 0-100','QR y enlace para pedir reseñas','30 plantillas de respuesta','5 respuestas con IA a la semana','1 competidor monitoreado','Alertas por email'],
          no:['Compartir el panel con tu equipo','Conexión de TikTok','Más respuestas con IA a la semana','Análisis de competencia con IA','Reportes PDF','Soporte prioritario'] },
        { n:'Impulso', p:29,
          si:['1 negocio monitoreado','Escaneo cada 12 horas','Aviso si te cambian el teléfono, el horario o la dirección en Google','25 usos de IA a la semana','3 competidores monitoreados','Aviso si una crítica lleva 24h sin respuesta','Reporte PDF mensual','Boleta o factura electrónica a tu RUC','Todo lo del plan Gratuito'],
          no:['Compartir el panel con tu equipo','Conexión de TikTok','Constancia de reputación verificable'] },
        { n:'Negocio', p:59, badge:true,
          si:['1 local incluido · S/39 por local adicional','Escaneo cada 4 horas','100 usos de IA a la semana (respuestas y análisis)','5 competidores por negocio','Aviso si te cambian el teléfono, el horario o la dirección en Google','Constancia de reputación verificable','Conexión de TikTok (perfil y videos)','Reporte PDF mensual','Boleta o factura electrónica a tu RUC','Comparte el panel con 2 personas más','Alertas por email','Todo lo del plan Gratuito'],
          no:[] },
        { n:'Franquicia', p:179,
          si:['1 local incluido · S/99 por local adicional','Escaneo cada 2 horas','300 usos de IA a la semana','15 competidores por negocio','Conexión de TikTok (perfil y videos)','Reporte PDF mensual','Comparte el panel con 9 personas más, cada uno solo con su sede','Alertas por email','Soporte prioritario por correo','Todo lo del plan Negocio'],
          no:[] },
      ],
    },
    comparativa: {
      tag:'Comparativa completa', titulo:'Lo que cambia de un plan a otro',
      sub:'Sin relleno: solo las diferencias reales entre los cuatro planes.',
      incluidos:'Los 4 planes incluyen: score de reputación 0-100, detección de reseñas sospechosas y ataques, 30 plantillas de respuesta profesionales, QR para pedir reseñas y alertas por email.',
      // Qué columna va resaltada. Era el índice 1 escrito a mano en cinco
      // estilos, y al insertar Impulso el verde se movió a la columna
      // equivocada sin que nada fallara: la tabla seguía compilando y
      // renderizando, solo destacaba el plan que no era.
      destacada:'Negocio',
      columnas:['Gratuito','Impulso','Negocio','Franquicia'],
      filas:[
        { grupo:'Alcance y velocidad de reacción' },
        { label:'Locales incluidos', valores:['1','1','1','1'] },
        { label:'Locales adicionales', valores:['—','—','S/39 c/u','S/99 c/u'] },
        { label:'Un ataque se detecta en máximo', valores:['24 h el primer mes, luego 72 h','12 horas','4 horas','2 horas'] },
        { label:'Vigila sin pausas aunque no entres al panel', valores:[false,true,true,true] },
        { label:'Aviso si tu ficha aparece cerrada en Google', valores:[true,true,true,true] },
        { label:'Aviso si te cambian el teléfono, el horario o la dirección en Google', valores:[false,true,true,true] },
        { label:'Constancia de reputación con código verificable', valores:[false,false,true,true] },
        { label:'Ver tu ficha como la ve un cliente nuevo', valores:[true,true,true,true] },
        { label:'Historial de rating desde que te registras', valores:[true,true,true,true] },
        { grupo:'Tu equipo' },
        { label:'Personas con acceso al panel', valores:['Solo tú','Solo tú','3','10'] },
        { label:'Cada uno con su usuario y su contraseña', valores:[false,false,true,true] },
        { label:'Roles: quién puede responder y quién solo mirar', valores:[false,false,true,true] },
        { label:'Dar acceso a un encargado solo a su sede', valores:[false,false,false,true] },
        { label:'Registro de quién respondió cada reseña', valores:[false,false,true,true] },
        { grupo:'Inteligencia artificial' },
        { label:'Respuestas y análisis con IA a la semana', valores:['5','25','100','300'] },
        { label:'Resumen por email (mensual o semanal, tú eliges)', valores:['Cifras básicas','Con insights de IA','Con insights de IA','Con insights de IA'] },
        { grupo:'Vigilancia de la competencia' },
        { label:'Competidores vigilados por negocio', valores:['1','3','5','15'] },
        { label:'Análisis IA de sus puntos débiles', valores:[false,false,true,true] },
        { label:'Descubrimiento automático de rivales a la redonda', valores:[false,false,false,true] },
        { grupo:'Trabajo que se hace solo' },
        { label:'Aviso extra si una crítica lleva 24h sin respuesta', valores:[false,true,true,true] },
        { label:'Reportes PDF automáticos', valores:[false,'Mensual','Mensual','Mensual'] },
        { grupo:'Canales y fuentes' },
        { label:'Conexión de TikTok (perfil y videos)', valores:[false,false,true,true] },
        { grupo:'Para cadenas y grupos' },
        { label:`Hasta ${MAX_LOCALES_TOTALES} locales en la misma cuenta`, valores:[false,false,true,true] },
        { grupo:'Facturación y soporte' },
        { label:'Boleta o factura electrónica a tu RUC, automática', valores:[false,true,true,true] },
        { label:'Soporte', valores:['Estándar','Estándar','Prioritario','Prioritario por correo'] },
      ],
    },
    faq: {
      tag:'Preguntas frecuentes', titulo:'Resolvemos tus dudas',
      items: [
        { q:'¿Necesito tarjeta de crédito para empezar?', a:'No. El plan Gratuito es gratis para siempre e incluye 1 negocio monitoreado, score de reputación, QR para pedir reseñas y alertas por email. Solo pides una tarjeta si decides subir a un plan de pago.' },
        { q:'¿Cómo detecta Notoria las reseñas sospechosas?', a:'Analizamos patrones típicos de ataques: reseñas que repiten el mismo texto desde cuentas distintas, calificaciones de 1 estrella sin ningún comentario, acusaciones graves, y picos de reseñas muy por encima del ritmo habitual de tu propia ficha. Cada reseña sospechosa se marca con el motivo para que puedas reportarla en Google. Notoria señala comportamiento anómalo; quien decide si una reseña es falsa y la retira es Google.' },
        // ⚠️ Estas tres preguntas prometían Google Business Profile: «gratis,
        // tardas 1 minuto», «acceso a todo tu historial» y «la publicación será
        // directa». Google no ha concedido acceso a esas APIs, así que las tres
        // eran falsas y la de en medio explicaba cómo hacer algo imposible.
        // Reescritas el 2026-08-25 diciendo lo que el producto sí hace.
        { q:'¿Por qué solo veo 5 reseñas si mi negocio tiene cientos?', a:'La API pública de Google entrega como máximo las 5 reseñas más recientes por consulta; es un límite de Google, no de Notoria. Por eso Notoria no funciona leyendo tu pasado sino vigilando lo que entra: escanea tu ficha cada 72, 24, 12, 4 o 2 horas según tu plan y guarda cada reseña nueva que aparece. A las pocas semanas tienes muy por encima de cinco, y desde el día que te registras no se te escapa ninguna. Lo que no hacemos es importar hacia atrás las que ya estaban.' },
        { q:'¿Qué pasa si alguien cambia los datos de mi ficha en Google?', a:'Google Maps permite que cualquier persona sugiera cambios sobre la ficha de un negocio ajeno —el horario, el teléfono, la dirección, incluso marcarla como cerrada permanentemente— y los aplica sin avisarle al dueño. Notoria compara esos datos en cada escaneo y te avisa el mismo día si algo cambió. El aviso de ficha cerrada está en todos los planes, incluido el Gratuito; el de teléfono, horario, nombre y dirección desde el plan Impulso.' },
        // ⚠️ Esta respuesta empezaba con «Sí» a secas, y la pregunta que hace el
        // cliente es si puede responder SIN SALIR de Notoria. Redactar aquí y
        // pegar allá no es eso. Se dice el límite antes que la función, porque
        // enterarse después de contratar es lo que produce una baja.
        { q:'¿Puedo responder las reseñas desde Notoria?', a:'La redactas en Notoria y la publicas tú en Google, en un clic. Tienes 30 plantillas profesionales según las estrellas de la reseña y un asistente de IA que la escribe por ti: guardamos tu respuesta, la copiamos al portapapeles y te abrimos tu ficha de Google Maps para que la pegues. Publicarla sin salir de Notoria todavía no es posible —hace falta un permiso que Google concede aparte— y estamos trabajando para que todo quede en un solo punto.' },
        { q:'¿Qué pasa si mi rating cae de repente?', a:'Notoria lo detecta en el siguiente escaneo y te envía una alerta por email con el detalle de qué pasó: cuánto bajó el rating, cuántas reseñas entraron y si muestran señales de ataque. Tú decides qué alertas recibir y con qué frecuencia.' },
        { q:'¿Cómo sabe Notoria quiénes son mis competidores?', a:'Tú los eliges. Los buscas igual que a tu negocio, en Google Maps, y los agregas a la lista (1 en el plan Gratuito, 3 en Impulso, 5 en Negocio y 15 en Franquicia por cada negocio). Además, en el plan Franquicia Notoria busca por su cuenta locales de tu mismo rubro a la redonda y te los propone, para que descubras rivales que quizá no tenías fichados.' },
        { q:'¿Es legal analizar las reseñas de mis competidores?', a:'Sí. Notoria solo lee lo que ya es público en Google Maps: el mismo rating y las mismas reseñas que vería cualquier persona buscando ese negocio. No accedemos a nada privado de su ficha, no interactuamos con sus reseñas y no publicamos nada en su nombre. Es exactamente la información que tú mismo podrías mirar a mano, ordenada y comparada por ti.' },
        { q:'¿Mis competidores se enteran de que los estoy siguiendo?', a:'No. Notoria consulta la información pública de Google como lo haría cualquier visitante, así que no hay ninguna notificación ni rastro visible para ellos. Tu lista de competidores es privada de tu cuenta.' },
        { q:'¿Funciona en toda mi ciudad o solo en Lima?', a:'En todo el Perú. Notoria monitorea cualquier negocio que tenga ficha en Google Maps, esté en Lima, Arequipa, Cusco, Trujillo o un distrito pequeño. Por ahora operamos solo en Perú: cobramos en soles y emitimos comprobantes peruanos.' },
        { q:'¿Puedo cancelar cuando quiera?', a:'Sí. No hay contratos de permanencia. Puedes bajar de plan o cancelar en cualquier momento desde tu panel de control, y tu negocio seguirá monitoreado con el plan Gratuito.' },
        // ⚠️ Esta pregunta también vive en el JSON-LD de `layout.js`. Y NO es
        // letra chica: lo que el worker deja de ejecutar tampoco se puede seguir
        // prometiendo (§15 al revés). Contarlo claro además vende — el motivo
        // para pagar es concreto y comprobable.
        { q:'¿El plan Gratuito caduca?', a:'No caduca ni se cobra nunca, pero se pausa si dejas de usarlo. Escanea tu ficha cada 24 horas durante el primer mes y cada 72 horas a partir de entonces; y si pasas 30 días sin entrar al panel, la vigilancia se pausa. Te avisamos por email 3 días antes, no se borra nada —tus reseñas, tu historial y tus alertas siguen ahí— y se reanuda sola en cuanto vuelves a entrar. Cada escaneo nos cuesta dinero en consultas a Google, así que solo vigilamos gratis las cuentas que están en uso. Los planes de pago vigilan sin pausas y a la cadencia contratada, entres o no.' },
        { q:'¿Mis datos están seguros?', a:'Sí. Usamos cifrado en tránsito, tu contraseña se guarda con hash seguro y cumplimos la Ley 29733 de Protección de Datos Personales. No vendemos ni compartimos tus datos, y solo leemos la información pública de tu negocio más la que tú decidas conectar.' },
      ],
    },
    cta: {
      tag:'Empieza hoy',
      tituloAnon:'Protege lo que construiste.', tituloLog:'Tu reputación está protegida.',
      subAnon:'1 negocio gratis para siempre. Sin tarjeta. 30 segundos.',
      subLog:'Notoria trabaja en segundo plano. Tú solo actúas cuando hay algo importante.',
      botonAnon:'Crear mi cuenta gratis', botonLog:'Ir al panel de control',
      dudas:'¿Preguntas? hola@usenotoria.app',
    },
    footer: {
      descripcion:'Monitor de reputación online para negocios del Perú —restaurantes, hoteles, tiendas, clínicas y más—: detecta ataques de reseñas, caídas de rating y cambios en tu ficha antes de que te cuesten clientes.',
      lema:'Monitor de reputación online',
      columnas: [
        { titulo:'Producto', links:[
          { l:'Cómo funciona', h:'#como-funciona' },
          { l:'Funcionalidades', h:'#features' },
          { l:'Competencia', h:'#competencia' },
          { l:'Precios', h:'#precios' },
          { l:'Comparativa de planes', h:'#comparativa' },
        ]},
        { titulo:'Recursos', links:[
          { l:'Blog', h:'/blog' },
          { l:'Preguntas frecuentes', h:'#faq' },
          { l:'Precios y contratación', h:'/precios' },
          { l:'Contacto', h:'/contacto' },
        ]},
        { titulo:'Cuenta', links:[
          { l:'Iniciar sesión', h:'/login' },
          { l:'Crear cuenta gratis', h:'/registro' },
          { l:'Panel de control', h:'/dashboard' },
        ]},
        { titulo:'Legal', links:[
          { l:'Términos de servicio', h:'/terminos' },
          { l:'Política de privacidad', h:'/privacidad' },
          { l:'Cambios y devoluciones', h:'/devoluciones' },
          { l:'Libro de Reclamaciones', h:'/libro-reclamaciones' },
          { l:'Eliminación de datos', h:'/eliminar-datos' },
        ]},
      ],
      copyright:(anio)=>`© ${anio} Notoria. Todos los derechos reservados.`,
    },
  },

  en: {
    nav: { login:'Sign in', empezar:'Start free', dashboard:'Dashboard', temaClaro:'Switch to light mode', temaOscuro:'Switch to dark mode' },
    hero: {
      tag:'Online reputation monitoring',
      titulo:'Your reputation can sink',
      tituloVerde:'in a single night.',
      sub:'Notoria watches your Google listing, detects review attacks and rating drops, and warns you before the damage becomes irreversible.',
      ctaCrear:'Create free account', ctaComo:'See how it works', ctaDash:'Go to dashboard',
      micro:'No credit card · 1 business free forever · Sign up in 30 seconds',
    },
    porque: {
      tag:'Why this matters',
      titulo:'Online reputation doesn’t forgive a bad weekend',
      fuenteLabel:'Source',
      items: [
        { n:'292M', icon:'bot',
          l:'reviews were blocked or removed by Google in 2025 for breaking its policies, plus 13 million fake Business Profiles.',
          fuente:'Google — “New ways we’re protecting businesses on Maps”, 2026',
          url:'https://blog.google/products-and-platforms/products/maps/new-ways-were-protecting-businesses-on-maps/' },
        { n:'5-9%', icon:'money',
          l:'more revenue for an independent restaurant with each extra star in its rating. Losing a star cuts the same way.',
          fuente:'M. Luca, Harvard Business School, working paper 12-016 (Yelp data)',
          url:'https://www.hbs.edu/ris/Publication%20Files/12-016_a7e4a5a2-03f9-490d-b093-8f951238dba2.pdf' },
        { n:'31%', icon:'trend',
          l:'of consumers will only use a business rated 4.5 stars or higher. A year earlier it was 17%.',
          fuente:'BrightLocal — Local Consumer Review Survey 2026',
          url:'https://www.brightlocal.com/research/local-consumer-review-survey/' },
      ],
    },
    proteccion: {
      tag:'How Notoria protects you', titulo:'Four steps that run on their own, 24/7',
      sub:'You only step in when there’s something to decide.',
      si:[
        'Flags every suspicious review with the reason, so you can report it to Google',
        'Writes the reply for you: 30 professional templates and AI-generated answers',
        'You choose which channel we use to reach you, and how often',
      ],
    },
    como: {
      tag:'How it works', titulo:'Ready in under 5 minutes',
      pasos: [
        { n:'1', t:'Add your business', d:'Search for it on Google Maps and select it. Rating and data are imported instantly.' },
        { n:'2', t:'Add your competitors', d:'Pick your direct rivals. Notoria compares your rating against theirs on every scan.' },
        { n:'3', t:'Turn on your alerts', d:'Choose what we warn you about and where. From then on Notoria scans on its own and only writes when something happens.' },
      ],
    },
    competencia: {
      tag:'Competitors', titulo:'You know exactly where you stand',
      sub:'Knowing your rating is not enough. What matters is your rating next to the place around the corner, because that is the choice your customer is actually making.',
      ejemploLabel:'Illustrative example',
      tuNegocio:'Your business',
      brechaLabel:'Behind the leader',
      filas: [
        { n:'Your business', r:4.2, tuyo:true },
        { n:'Competitor 400 m away', r:4.6 },
        { n:'Competitor 1.2 km away', r:4.1 },
        { n:'Competitor 1.8 km away', r:3.8 },
      ],
      insightTag:'What the AI spots',
      insightTexto:'"Your rivals mostly lose stars over slow service. You lose them over food temperature. That is your fastest win: fixing the kitchen pass puts you above the area leader."',
      bullets: [
        { icon:'trend', t:'Compared on every scan', d:'Every time Notoria checks your rating, it checks your competitors too. You see the gap widen or close, not a one-off snapshot.' },
        { icon:'bot', t:'Analysis of their weak spots', d:'The AI reads your rivals’ recent complaints and tells you where they fail and where you do. Concrete recommendations, not a summary.' },
        { icon:'search', t:'Finds rivals you had not tracked', d:'On the Franchise plan, Notoria searches for businesses in your category nearby and suggests them. The ones taking customers without you knowing.' },
      ],
    },
    features: {
      tag:'Features', titulo:'Everything you need in one place',
      items: [
        { icon:'bell', t:'Email alerts', d:'When a scan finds a negative review or a rating drop, you get an email quoting the review with a reply ready to use. That same day, not on Monday.' },
        { icon:'lock', t:'We watch your listing, not just your reviews', d:'Anyone can suggest to Google that your venue closed down. If your listing shows as closed, we tell you that same day — not on Monday, once nobody came all weekend.' },
        { icon:'bot', t:'Detects attacks and copied reviews', d:'Compares your listing review pace against your own normal and flags reviews repeating the same text: the signature of a bought campaign.' },
        { icon:'eye', t:'See your listing like a stranger does', d:'Google does not show a new customer your latest reviews, but the ones it finds relevant. We show you exactly those five, and which still have no reply.' },
        { icon:'lightning', t:'QR to request reviews', d:'Direct link and printable QR code. Turn happy customers into 5-star reviews.' },
        { icon:'trend', t:'Watch your competition', d:'Compare your rating against direct rivals, with AI analysis of their weaknesses.' },
        { icon:'chat', t:'Never wonder what to write', d:'30 professional templates and AI-generated replies. Copy it and publish in one click.' },
        { icon:'doc', t:'Monthly PDF reports', d:'On the 1st of every month in your inbox. Great for partners and investors.' },
      ],
      scoreTitulo:'And one number that sums it all up',
      scoreDesc:'The reputation score combines your rating, the pace of new reviews, how many are negative and how many look like bots. Check it once a day and you know whether something needs attention.',
      masTitulo:'Also included in every plan',
      mas:['Rating history per scan', 'Scheduled scanning every 2, 4, 12, 24 or 72 hours depending on your plan', 'The reason spelled out on every flagged review'],
    },
    precios: {
      tag:'Pricing', titulo:'Pricing with no surprises',
      mensual:'Monthly', anual:'Yearly (20% off)', ahorras:(m)=>`Save ${S}${m}/year`,
      gratis:'Free', mes:'/mo', anio:'/yr', popular:'Most popular', promoBienvenida:'50% OFF your first 2 months',
      ctaGratis:'Start free', ctaPago:'See pricing and subscribe', ctaActual:'Current plan', ctaUpgrade:'Upgrade', ctaCambiar:'Change plan',
      noIncluyeLabel:'Not included:',
      planes: [
        { n:'Free', p:0,
          si:['1 monitored business','Scan every 24 hours for the first month, then every 72 hours','Pauses after 30 days without signing in, resumes when you return','0-100 reputation score','QR and link to request reviews','30 reply templates','5 AI replies per week','1 monitored competitor','Email alerts','Alert if your listing shows as closed on Google'],
          no:['Sharing the dashboard with your team','TikTok connection','More AI replies per week','AI competitor analysis','PDF reports','Priority support'] },
        { n:'Impulso', p:29,
          si:['1 monitored business','Scan every 12 hours','Alert if your phone, hours or address are changed on Google','25 AI uses per week','3 monitored competitors','Alert if a critical review goes 24h without a reply','Monthly PDF report','Electronic invoice to your RUC','Everything in the Free plan'],
          no:['Share the dashboard with your team','TikTok connection','Verifiable reputation certificate'] },
        { n:'Business', p:59, badge:true,
          si:['1 location included · S/39 per extra location','Scan every 4 hours','100 AI uses per week (replies and analysis)','5 competitors per business','Alert if your phone, hours or address change on Google','Reputation certificate with a verifiable code','TikTok connection (profile and videos)','Monthly PDF report','Automatic electronic invoice (SUNAT)','Share the dashboard with 2 more people','Email alerts','Everything in Free'],
          no:[] },
        { n:'Franchise', p:179,
          si:['1 location included · S/99 per extra location','Scan every 2 hours','300 AI uses per week','15 competitors per business','TikTok connection (profile and videos)','Monthly PDF report','Share the dashboard with 9 more people, each limited to their location','Email alerts','Priority email support','Everything in Business'],
          no:[] },
      ],
    },
    comparativa: {
      tag:'Full comparison', titulo:'What actually changes between plans',
      sub:'No filler: only the real differences between the four plans.',
      incluidos:'All 4 plans include: 0-100 reputation score, detection of suspicious reviews and attacks, 30 professional reply templates, a QR code to request reviews and email alerts.',
      destacada:'Business',
      columnas:['Free','Impulso','Business','Franchise'],
      filas:[
        { grupo:'Coverage and reaction speed' },
        { label:'Locations included', valores:['1','1','1','1'] },
        { label:'Extra locations', valores:['—','—','S/39 each','S/99 each'] },
        { label:'An attack is detected within', valores:['24 h first month, then 72 h','12 hours','4 hours','2 hours'] },
        { label:'Keeps watching even if you never sign in', valores:[false,true,true,true] },
        { label:'Alert if your listing shows as closed on Google', valores:[true,true,true,true] },
        { label:'Alert if your phone, hours or address change on Google', valores:[false,true,true,true] },
        { label:'Reputation certificate with a verifiable code', valores:[false,false,true,true] },
        { label:'See your listing like a new customer does', valores:[true,true,true,true] },
        { label:'Rating history from the day you sign up', valores:[true,true,true,true] },
        { grupo:'Your team' },
        { label:'People with access to the dashboard', valores:['Just you','Just you','3','10'] },
        { label:'Each with their own login and password', valores:[false,false,true,true] },
        { label:'Roles: who can reply and who can only look', valores:[false,false,true,true] },
        { label:'Give a manager access to their location only', valores:[false,false,false,true] },
        { label:'Record of who replied to each review', valores:[false,false,true,true] },
        { grupo:'Artificial intelligence' },
        { label:'AI replies and analyses per week', valores:['5','25','100','300'] },
        { label:'Email summary (monthly or weekly, your choice)', valores:['Basic figures','With AI insights','With AI insights','With AI insights'] },
        { grupo:'Competitor watch' },
        { label:'Competitors watched per business', valores:['1','3','5','15'] },
        { label:'AI analysis of their weak points', valores:[false,false,true,true] },
        { label:'Automatic discovery of nearby rivals', valores:[false,false,false,true] },
        { grupo:'Work that runs itself' },
        { label:'Extra warning if a bad review sits 24h unanswered', valores:[false,true,true,true] },
        { label:'Automatic PDF reports', valores:[false,'Monthly','Monthly','Monthly'] },
        { grupo:'Channels and sources' },
        { label:'TikTok connection (profile and videos)', valores:[false,false,true,true] },
        { grupo:'For chains and groups' },
        { label:`Up to ${MAX_LOCALES_TOTALES} locations in one account`, valores:[false,false,true,true] },
        { grupo:'Billing and support' },
        { label:'Automatic electronic invoice (SUNAT, Peru)', valores:[false,true,true,true] },
        { label:'Support', valores:['Standard','Standard','Priority','Priority via email'] },
      ],
    },
    faq: {
      tag:'FAQ', titulo:'We answer your questions',
      items: [
        { q:'Do I need a credit card to start?', a:'No. The Free plan is free forever and includes 1 monitored business, reputation score, QR to request reviews and email alerts. You only add a card if you upgrade to a paid plan.' },
        // ⚠️ Prometía «newly created accounts, authors with a single review»:
        // detección por perfil del autor, que ninguna fuente permite y que se
        // declaró como que NO se hace (CLAUDE.md §15). Ahora dice lo mismo que el
        // FAQ en español. Corregido el 2026-09-24.
        { q:'How does Notoria detect suspicious reviews?', a:'We analyze typical attack patterns: reviews repeating the same text from different accounts, 1-star ratings with no comment, serious accusations, and review spikes well above your own listing’s usual pace. Each suspicious review is flagged with the reason so you can report it to Google. Notoria flags anomalous behavior; Google is the one that decides whether a review is fake and removes it.' },
        { q:'Why do I only see 5 reviews if my business has hundreds?', a:'Google’s public API returns at most the 5 most recent reviews per query — that is Google’s limit, not Notoria’s. So Notoria doesn’t work by reading your past, it works by watching what comes in: it scans your listing every 72, 24, 12, 4 or 2 hours depending on your plan and stores every new review that appears. Within a few weeks you have well over five, and from the day you sign up none gets past us. What we don’t do is import the ones that were already there.' },
        { q:'What if someone changes my listing details on Google?', a:'Google Maps lets anyone suggest edits to someone else’s business listing — the hours, the phone number, the address, even marking it permanently closed — and applies them without telling the owner. Notoria compares those details on every scan and warns you the same day if something changed. The permanently-closed alert is in every plan, including Free; phone, hours, name and address from the Impulso plan up.' },
        { q:'Can I reply to reviews from Notoria?', a:'You write the reply in Notoria and publish it yourself on Google, in one click. You get 30 professional templates based on the review’s stars and an AI assistant that drafts it for you: we save your reply, copy it to your clipboard and open your listing on Google Maps so you can paste it. Publishing without leaving Notoria isn’t possible yet — it needs a permission Google grants separately — and we’re working on bringing it all into one place.' },
        { q:'What happens if my rating suddenly drops?', a:'Notoria detects it on the next scan and sends you an email alert detailing what happened: how far the rating dropped, how many reviews came in and whether they show signs of an attack. You decide which alerts to receive and how often.' },
        { q:'How does Notoria know who my competitors are?', a:'You choose them. You search for them just like your own business, on Google Maps, and add them to the list (1 on Free, 3 on Impulso, 5 on Business and 15 on Franchise, per business). On the Franchise plan Notoria also searches for venues in your category nearby and suggests them, so you discover rivals you may not have been tracking.' },
        { q:'Is it legal to analyse my competitors’ reviews?', a:'Yes. Notoria only reads what is already public on Google Maps: the same rating and the same reviews anyone searching for that business would see. We do not access anything private on their listing, we do not interact with their reviews and we never post anything on their behalf. It is exactly the information you could look up by hand, organised and compared for you.' },
        { q:'Will my competitors know I am tracking them?', a:'No. Notoria queries Google’s public information the same way any visitor would, so there is no notification and no visible trace for them. Your competitor list is private to your account.' },
        { q:'Does it work across the country or only in Lima?', a:'Across all of Peru. Notoria monitors any business with a Google Maps listing, whether it is in Lima, Arequipa, Cusco, Trujillo or a small district. For now we operate in Peru only: we charge in soles and issue Peruvian tax receipts.' },
        { q:'Can I cancel anytime?', a:'Yes. There are no lock-in contracts. You can downgrade or cancel anytime from your dashboard, and your business will keep being monitored under the Free plan.' },
        { q:'Does the Free plan expire?', a:'It never expires and it is never charged, but it pauses if you stop using it. It scans your listing every 24 hours during the first month and every 72 hours after that; and if you go 30 days without signing in, monitoring pauses. We email you 3 days beforehand, nothing gets deleted —your reviews, history and alerts stay exactly where they are— and it resumes on its own as soon as you sign back in. Every scan costs us money in Google queries, so we only watch free accounts that are actually in use. Paid plans keep watching without pauses, at the cadence you contracted, whether you sign in or not.' },
        { q:'Is my data safe?', a:'Yes. We use encryption in transit, your password is stored with a secure hash and we comply with data protection law (Peru’s Law 29733). We never sell or share your data, and we only read your business’s public information plus whatever you choose to connect.' },
      ],
    },
    cta: {
      tag:'Start today',
      tituloAnon:'Protect what you built.', tituloLog:'Your reputation is protected.',
      subAnon:'1 business free forever. No card. 30 seconds.',
      subLog:'Notoria works in the background. You only act when something matters.',
      botonAnon:'Create my free account', botonLog:'Go to dashboard',
      dudas:'Questions? hola@usenotoria.app',
    },
    footer: {
      descripcion:'Online reputation monitoring for any business: detects review attacks, rating drops and listing changes before they cost you customers.',
      lema:'Online reputation monitoring',
      columnas: [
        { titulo:'Product', links:[
          { l:'How it works', h:'#como-funciona' },
          { l:'Features', h:'#features' },
          { l:'Competitors', h:'#competencia' },
          { l:'Pricing', h:'#precios' },
          { l:'Plan comparison', h:'#comparativa' },
        ]},
        { titulo:'Resources', links:[
          { l:'Blog', h:'/blog' },
          { l:'FAQ', h:'#faq' },
          { l:'Pricing and checkout', h:'/precios' },
          { l:'Contact', h:'/contacto' },
        ]},
        { titulo:'Account', links:[
          { l:'Sign in', h:'/login' },
          { l:'Create free account', h:'/registro' },
          { l:'Dashboard', h:'/dashboard' },
        ]},
        { titulo:'Legal', links:[
          { l:'Terms of service', h:'/terminos' },
          { l:'Privacy policy', h:'/privacidad' },
          { l:'Returns and refunds', h:'/devoluciones' },
          { l:'Complaints book (Peru)', h:'/libro-reclamaciones' },
          { l:'Data deletion', h:'/eliminar-datos' },
        ]},
      ],
      copyright:(anio)=>`© ${anio} Notoria. All rights reserved.`,
    },
  },
};

export default function LandingPage() {
  const { usuario, cargando } = useAuth();
  const { idioma, cambiarIdioma } = useIdioma();
  const [anual, setAnual] = useState(false);
  const [faqAbierta, setFaqAbierta] = useState(null);
  // El script inline de layout.js ya resolvió el tema (guardado o del sistema)
  // y lo dejó en <html data-theme> antes del primer pintado. Leerlo de ahí en
  // vez de recalcularlo evita duplicar la lógica y un parpadeo al hidratar.
  // Arranca en 'dark' porque es lo que el servidor prerenderiza.
  const [tema, setTema] = useState('dark');

  useEffect(() => {
    setTema(document.documentElement.getAttribute('data-theme') || 'dark');
  }, []);

  const alternarTema = () => {
    const nuevo = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    try { localStorage.setItem('bs_tema', nuevo); } catch {}
    setTema(nuevo);
  };

  // El fondo animado en WebGL (PixelBlast) es pesado para navegadores simples
  // en Android (GPUs de gama baja, WebViews sin aceleración). Lo desactivamos
  // en pantallas táctiles/angostas o si el sistema pide menos movimiento, y
  // mostramos un fondo estático en su lugar.
  const [fondoAnimado, setFondoAnimado] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const angosta = window.innerWidth < 768;
    const reduceMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setFondoAnimado(!coarse && !angosta && !reduceMovimiento);
  }, []);

  const t = TEXTOS[idioma] || TEXTOS.es;

  // Índice de la columna resaltada en la comparativa. Sale del NOMBRE del plan
  // destacado, no de una posición: insertar una columna nueva movía el resaltado
  // al plan equivocado y eso no rompe el build ni lanza nada — solo destaca lo
  // que no toca, que en una tabla de precios es un error caro y silencioso.
  // -1 si no cuadra, y entonces no se resalta ninguna, que es el lado seguro.
  const colDestacada = t.comparativa.columnas.indexOf(t.comparativa.destacada);

  // 🔴 Acá había un `if (cargando) return <spinner/>` y costaba caro. `cargando`
  // arranca en true, así que el render de servidor devolvía SOLO el spinner: el
  // HTML de usenotoria.app llegaba con 38 caracteres de texto (nada más que el
  // <title>) y todo el contenido aparecía recién al ejecutarse el JavaScript.
  // Consecuencias reales, no teóricas:
  //   · la verificación de marca del OAuth de Google FALLÓ (2026-08-17) con
  //     "En la página principal, no se explica el propósito de la app" — su
  //     robot lee el HTML y no encontraba nada;
  //   · el SEO del landing quedaba en nada por el mismo motivo;
  //   · y todo visitante veía un spinner antes del hero.
  //
  // El landing NO necesita la sesión para renderizarse: lo único que depende de
  // ella es el botón del nav. Mientras carga se muestra la versión de invitado,
  // que es lo correcto para la inmensa mayoría del tráfico de una página de
  // ventas; a quien ya tiene sesión el botón le cambia a "Mi panel" un instante
  // después. No volver a poner un guard de carga sobre toda la página.
  const loggedIn = !cargando && !!usuario;

  return (
    <>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);} }
        @keyframes fadeIn { from{opacity:0;}to{opacity:1;} }
        @keyframes floatY { 0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);} }

        .a1{animation:fadeUp 0.7s ease both;}
        .a2{animation:fadeUp 0.7s 0.12s ease both;}
        .a3{animation:fadeUp 0.7s 0.24s ease both;}
        .a4{animation:fadeUp 0.7s 0.36s ease both;}

        .btn-primary {
          display:inline-flex;align-items:center;gap:8px;
          background:${C.green};color:#fff;text-decoration:none;
          font-family:${GEO};font-size:15px;font-weight:700;
          padding:13px 28px;border-radius:6px;border:none;cursor:pointer;
          transition:background 0.15s,transform 0.1s;
        }
        .btn-primary:hover{background:${C.greenH};transform:translateY(-1px);}
        .btn-primary:active{transform:translateY(0);}

        .btn-ghost {
          display:inline-flex;align-items:center;gap:8px;
          background:transparent;color:${C.text2};text-decoration:none;
          font-family:${GEO};font-size:15px;
          padding:13px 22px;border-radius:6px;
          border:1px solid ${C.border};cursor:pointer;
          transition:border-color 0.15s,color 0.15s;
        }
        .btn-ghost:hover{border-color:${C.borderL};color:${C.text};}

        .btn-nav {
          display:inline-flex;align-items:center;gap:6px;
          background:${C.green};color:#fff;text-decoration:none;
          font-family:${GEO};font-size:13px;font-weight:600;
          padding:7px 16px;border-radius:4px;border:none;cursor:pointer;
          transition:background 0.15s;
        }
        .btn-nav:hover{background:${C.greenH};}

        .tema-btn{
          display:inline-flex;align-items:center;justify-content:center;
          width:30px;height:30px;padding:0;
          background:transparent;color:${C.text3};
          border:1px solid ${C.border};border-radius:5px;cursor:pointer;
          transition:color 0.15s,border-color 0.15s;
        }
        .tema-btn:hover{color:${C.text};border-color:${C.borderL};}

        .nav-link{
          color:${C.text2};text-decoration:none;font-size:14px;
          padding:6px 12px;border-radius:4px;
          transition:color 0.15s;font-family:${GEO};
        }
        .nav-link:hover{color:${C.text};}

        .lang-btn{
          background:transparent;border:none;cursor:pointer;
          font-family:${GEO};font-size:12.5px;padding:4px 7px;border-radius:4px;
          transition:color 0.15s;
        }

        .fcard{
          background:${C.surface};border:1px solid ${C.border};
          border-radius:8px;padding:24px;
          transition:border-color 0.2s,background 0.2s;
        }
        .fcard:hover{border-color:${C.borderL};background:${C.surface2};}

        .pcard{
          background:${C.surface};border:1px solid ${C.border};
          border-radius:8px;padding:28px;
          transition:border-color 0.2s;
        }
        .pcard.featured{border-color:${C.green};}
        .pcard:hover{border-color:${C.borderL};}
        .pcard.featured:hover{border-color:${C.greenH};}

        .step-card{
          background:${C.surface};border:1px solid ${C.border};
          border-radius:8px;padding:28px;
          position:relative;overflow:hidden;
        }

        .stat-card{
          background:${C.surface};border:1px solid ${C.border};
          border-radius:8px;padding:24px;text-align:left;
          transition:border-color 0.2s;
        }
        .stat-card:hover{border-color:${C.green};}

        .faq-item{
          background:${C.surface};border:1px solid ${C.border};
          border-radius:8px;overflow:hidden;
          transition:border-color 0.2s;
        }
        .faq-item:hover{border-color:${C.borderL};}
        .faq-q{
          width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;
          background:none;border:none;cursor:pointer;text-align:left;
          padding:18px 22px;font-family:${GEO};
        }

        .logo-icon{animation:floatY 4s ease-in-out infinite;display:inline-block;}

        .section-tag{
          display:inline-block;
          font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;
          color:${C.green};margin-bottom:14px;font-family:${GEO};
        }

        .toggle-wrap{
          display:inline-flex;background:${C.surface};border:1px solid ${C.border};
          border-radius:8px;padding:4px;gap:3px;
        }
        .toggle-btn{
          border:none;cursor:pointer;padding:10px 22px;border-radius:6px;
          font-size:14px;font-weight:600;transition:all 0.15s;font-family:${GEO};
        }
        .toggle-btn.active{background:${C.green};color:#fff;}
        .toggle-btn.inactive{background:transparent;color:${C.text2};}
        .toggle-btn.inactive:hover{color:${C.text};}

        .icon-wrap{
          width:40px;height:40px;border-radius:6px;
          display:flex;align-items:center;justify-content:center;
          background:${C.greenT};border:1px solid ${C.greenB};
          color:${C.green};margin-bottom:16px;flex-shrink:0;
        }

        .plan-badge{
          display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.5px;
          padding:3px 10px;border-radius:3px;text-transform:uppercase;
          background:${C.green};color:#fff;margin-left:10px;vertical-align:middle;
        }


        /* 🔴 A 390 px la barra superior NO cabía. Medido el 2026-08-29 dentro de
           un iframe de ancho real: el documento daba scrollWidth 398 sobre un
           viewport de 385 —o sea SCROLL HORIZONTAL del documento, que este
           proyecto prohíbe— y el botón «EN» del selector de idioma se solapaba
           7 px con «Iniciar sesión». La web es bilingüe y en el móvil no se
           podía pasar a inglés.
           ⚠️ Lleva !important porque el padding y el gap van INLINE en esos
           divs, y un estilo inline gana a cualquier selector — la misma razón
           por la que los bordes de los inputs del panel lo llevan. */
        /* El selector de idioma NO se encoge NUNCA. Es un flex item con
           overflow:hidden (lo lleva para redondear las esquinas), así que
           encogerse no lo aprieta: le CORTA el boton EN y no se ve que pasa.
           Medido a 390 px: 47 px utiles para 59 px de contenido, o sea 19 de
           los 30 px de EN visibles. Mismo caso que las pestanas de la ficha. */
        .lang-wrap{ flex-shrink:0; }

        @media (max-width: 430px) {
          .nav-inner{ padding:0 10px !important; }
          .nav-inner > div{ gap:3px !important; }
          .nav-inner .btn-nav{ padding:7px 9px; font-size:12.5px; }
          .nav-inner .nav-link{ padding:6px 4px; font-size:13px; }
          .nav-inner .lang-btn{ padding:4px 6px; }
          .nav-inner .logo-txt{ font-size:16px; }
        }

        a{font-family:${GEO};}
        button{font-family:${GEO};}
      `}</style>

      <div style={{ background:C.bg, color:C.text, fontFamily:GEO, minHeight:'100vh' }}>

        {/* Navbar */}
        <nav style={{ borderBottom:`1px solid ${C.border}`, position:'sticky', top:0, background:C.bg, zIndex:100 }}>
          <div className="nav-inner" style={{ maxWidth:1060, margin:'0 auto', padding:'0 24px', height:58, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
              <span className="logo-icon"><LogoNotoria size={20} color={C.green}/></span>
              <span className="logo-txt" style={{ fontSize:18, fontWeight:800, color:C.text, letterSpacing:'-0.5px' }}>Notoria</span>
            </Link>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {/* Tema claro/oscuro — comparte localStorage y <html data-theme>
                  con el panel, así que la preferencia viaja entre ambos. */}
              <button onClick={alternarTema} className="tema-btn"
                aria-label={tema === 'dark' ? t.nav.temaClaro : t.nav.temaOscuro}
                title={tema === 'dark' ? t.nav.temaClaro : t.nav.temaOscuro}>
                <Icon d={tema === 'dark' ? ICONS.sol : ICONS.luna} size={16} color="currentColor" strokeWidth={2}/>
              </button>
              {/* Selector de idioma */}
              <div className="lang-wrap" style={{ display:'flex', alignItems:'center', border:`1px solid ${C.border}`, borderRadius:5, marginRight:6, overflow:'hidden' }}>
                <button className="lang-btn" onClick={() => cambiarIdioma('es')}
                  style={{ color: idioma==='es' ? '#fff' : C.text3, background: idioma==='es' ? C.green : 'transparent', fontWeight: idioma==='es' ? 700 : 400 }}>ES</button>
                <button className="lang-btn" onClick={() => cambiarIdioma('en')}
                  style={{ color: idioma==='en' ? '#fff' : C.text3, background: idioma==='en' ? C.green : 'transparent', fontWeight: idioma==='en' ? 700 : 400 }}>EN</button>
              </div>
              {loggedIn ? (
                <>
                  <span style={{ fontSize:13, color:C.text3, marginRight:4 }}>{usuario.nombre?.split(' ')[0]}</span>
                  <Link href="/dashboard" className="btn-nav">{t.nav.dashboard}</Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="nav-link">{t.nav.login}</Link>
                  <Link href="/registro" className="btn-nav">{t.nav.empezar}</Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ position:'relative', padding:'96px 24px 80px', borderBottom:`1px solid ${C.border}`, overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, zIndex:0 }}>
            {fondoAnimado ? (
              <PixelBlast
                variant="square"
                pixelSize={4}
                color={VERDE_MARCA}
                patternScale={2.5}
                patternDensity={0.6}
                pixelSizeJitter={0}
                enableRipples
                rippleSpeed={0.4}
                rippleThickness={0.12}
                rippleIntensityScale={1.5}
                liquid={false}
                speed={0.5}
                edgeFade={0.4}
                transparent
              />
            ) : (
              // Fondo estático y liviano para móvil/Android de gama baja o
              // cuando el sistema pide reducir el movimiento — evita el costo
              // de un shader WebGL corriendo en cada frame.
              <div style={{ width:'100%', height:'100%', background:`radial-gradient(ellipse 500px 380px at center, ${C.greenT} 0%, transparent 70%)` }} />
            )}
          </div>
          {/* Viñeta: oscurece el centro para que el texto se lea bien sobre la animación */}
          <div style={{
            position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
            background:`radial-gradient(ellipse 600px 420px at center, ${C.bg} 0%, ${C.bgT} 45%, transparent 75%)`,
          }} />
          <div style={{ position:'relative', zIndex:2, maxWidth:760, margin:'0 auto', textAlign:'center' }}>
            <div className="a1 section-tag">{t.hero.tag}</div>
            <h1 className="a2" style={{ fontSize:'clamp(36px,5vw,62px)', fontWeight:900, margin:'0 0 20px', lineHeight:1.1, letterSpacing:'-2px', color:C.text }}>
              {t.hero.titulo}{' '}
              <span style={{ color:C.green }}>{t.hero.tituloVerde}</span>
            </h1>
            <p className="a3" style={{ fontSize:17, color:C.text2, maxWidth:500, margin:'0 auto 36px', lineHeight:1.75 }}>
              {t.hero.sub}
            </p>
            <div className="a4" style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
              {loggedIn ? (
                <Link href="/dashboard" className="btn-primary">
                  {t.hero.ctaDash} <Icon d={ICONS.arrow} size={16} color="#fff"/>
                </Link>
              ) : (
                <>
                  <Link href="/registro" className="btn-primary">
                    {t.hero.ctaCrear} <Icon d={ICONS.arrow} size={16} color="#fff"/>
                  </Link>
                  <a href="#como-funciona" className="btn-ghost">{t.hero.ctaComo}</a>
                </>
              )}
            </div>
            {!loggedIn && (
              <p style={{ fontSize:12, color:C.text3, marginTop:16 }}>
                {t.hero.micro}
              </p>
            )}
            {!loggedIn && <div className="a4"><AnalisisGratis idioma={idioma} /></div>}
          </div>
        </section>

        {/* Por qué importa — la gráfica lleva el argumento.
            Antes esto eran dos secciones ("Stats" y "El dolor") con seis
            tarjetas de texto entre las dos, diciendo lo mismo. Ahora el ataque
            se VE, y las tres cifras quedan como pie de foto. */}
        <section style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}`, background:C.surface }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:32, maxWidth:640 }}>
              <div className="section-tag">{t.porque.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:0, letterSpacing:'-1px', color:C.text }}>
                {t.porque.titulo}
              </h2>
            </div>

            <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:'24px 26px', marginBottom:12 }}>
              <GraficaAtaque idioma={idioma} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
              {t.porque.items.map((s,i) => (
                <div key={i} className="stat-card" style={{ display:'flex', flexDirection:'column' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:9, background:C.greenT, border:`1px solid ${C.greenB}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon d={ICONS[s.icon]} size={19} color={C.green}/>
                    </div>
                    <div style={{ fontSize:32, fontWeight:900, color:C.text, letterSpacing:'-1px' }}>{s.n}</div>
                  </div>
                  <div style={{ fontSize:13.5, color:C.text2, lineHeight:1.55, flex:1 }}>{s.l}</div>
                  {/* La fuente va pegada a su cifra, no en una nota al pie que
                      nadie asocia con nada. rel="noopener" porque abre fuera. */}
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                     style={{ display:'block', marginTop:14, paddingTop:12, borderTop:`1px solid ${C.border}`,
                              fontSize:11, color:C.text3, textDecoration:'none', lineHeight:1.5 }}>
                    <span style={{ fontWeight:700, letterSpacing:0.5, textTransform:'uppercase' }}>{t.porque.fuenteLabel}</span>
                    {' · '}{s.fuente} ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cómo te protege — el circuito dibujado, y la alerta tal cual llega */}
        <section style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:32, maxWidth:640 }}>
              <div className="section-tag">{t.proteccion.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:'0 0 14px', letterSpacing:'-1px', color:C.text }}>
                {t.proteccion.titulo}
              </h2>
              <p style={{ fontSize:15, color:C.text2, lineHeight:1.75, margin:0 }}>{t.proteccion.sub}</p>
            </div>

            {/* Los iconos se pasan desde aquí para que el diagrama use el mismo
                juego que el resto del landing y no invente uno propio. */}
            <div style={{ marginBottom:16 }}>
              <DiagramaFlujo idioma={idioma} iconos={{
                0: <Icon d={ICONS.eye} size={19} color={C.green}/>,
                1: <Icon d={ICONS.bot} size={19} color={C.green}/>,
                2: <Icon d={ICONS.bell} size={19} color={C.green}/>,
                3: <Icon d={ICONS.chat} size={19} color={C.green}/>,
              }} />
            </div>

            {/* `stretch` y no `start`: la columna de la derecha tiene tres
                líneas y la alerta bastante más alto, así que quedaba una caja
                corta flotando junto a una larga. */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16, alignItems:'stretch' }}>
              <TarjetaAlerta idioma={idioma} />
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:'24px 26px',
                            display:'flex', flexDirection:'column', justifyContent:'center' }}>
                {t.proteccion.si.map((linea,i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:i === t.proteccion.si.length-1 ? 0 : 16 }}>
                    <span style={{ flexShrink:0, marginTop:2 }}><Icon d={ICONS.check} size={16} color={C.green} /></span>
                    <p style={{ fontSize:14, color:C.text2, lineHeight:1.65, margin:0 }}>{linea}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* El producto por dentro — capturas reales del panel.
            Va aquí, justo después de explicar QUÉ hace: primero se cuenta el
            circuito, y acto seguido se enseña que existe de verdad. Antes de
            "cómo funciona", que ya es el paso de contratar. */}
        <section style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}`, background:C.surface }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <PanelShowcase idioma={idioma} colores={C} />
          </div>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:44 }}>
              <div className="section-tag">{t.como.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:0, letterSpacing:'-1px', color:C.text }}>
                {t.como.titulo}
              </h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12 }}>
              {t.como.pasos.map((p,i) => (
                <div key={i} className="step-card">
                  {/* Número grande de fondo, ocupa buena parte del recuadro */}
                  <div style={{ position:'absolute', top:-18, right:6, fontSize:130, fontWeight:900, color:C.green, opacity:0.14, lineHeight:1, fontFamily:GEO, userSelect:'none', pointerEvents:'none' }}>
                    {p.n}
                  </div>
                  <div style={{ fontSize:44, fontWeight:900, color:C.green, lineHeight:1, marginBottom:14 }}>{p.n}</div>
                  <h3 style={{ fontSize:17, fontWeight:700, color:C.text, margin:'0 0 10px', position:'relative' }}>{p.t}</h3>
                  <p style={{ fontSize:14, color:C.text2, lineHeight:1.7, margin:0, position:'relative' }}>{p.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}`, background:C.surface }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:44 }}>
              <div className="section-tag">{t.features.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:0, letterSpacing:'-1px', color:C.text }}>
                {t.features.titulo}
              </h2>
            </div>
            {/* minmax de 300px y no 240: con seis tarjetas, 240 daba cuatro
                columnas y dejaba una segunda fila coja de 4+2. */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12, marginBottom:12 }}>
              {t.features.items.map((f,i) => (
                <div key={i} className="fcard">
                  <div className="icon-wrap"><Icon d={ICONS[f.icon]} size={18} color={C.green}/></div>
                  <h3 style={{ fontSize:15, fontWeight:700, color:C.text, margin:'0 0 6px' }}>{f.t}</h3>
                  <p style={{ fontSize:13, color:C.text2, lineHeight:1.65, margin:0 }}>{f.d}</p>
                </div>
              ))}
            </div>

            {/* El score dejó de ser una tarjeta más y pasó a verse. Al lado, en
                una línea, lo que antes ocupaba tres tarjetas: cosas que suman
                pero que nadie contrata por ellas. */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12, alignItems:'center',
                          background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:'26px 28px' }}>
              <MedidorScore idioma={idioma} />
              <div>
                <h3 style={{ fontSize:19, fontWeight:800, color:C.text, margin:'0 0 10px', letterSpacing:'-0.5px' }}>
                  {t.features.scoreTitulo}
                </h3>
                <p style={{ fontSize:14, color:C.text2, lineHeight:1.7, margin:'0 0 18px' }}>{t.features.scoreDesc}</p>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:C.text3, marginBottom:9 }}>
                  {t.features.masTitulo}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
                  {t.features.mas.map((m,i) => (
                    <span key={i} style={{ fontSize:12, color:C.text2, background:C.surface2,
                                           border:`1px solid ${C.border}`, borderRadius:20, padding:'5px 12px' }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Competencia — comparador "tú vs. ellos" */}
        <section id="competencia" style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:40 }}>
              <div className="section-tag">{t.competencia.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:'0 0 14px', letterSpacing:'-1px', color:C.text }}>
                {t.competencia.titulo}
              </h2>
              <p style={{ fontSize:16, color:C.text2, lineHeight:1.7, margin:0, maxWidth:620 }}>
                {t.competencia.sub}
              </p>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16, alignItems:'start', marginBottom:16 }}>
              {/* Comparador */}
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:'22px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                    {t.competencia.ejemploLabel}
                  </span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#D97706' }}>
                    −0.4 · {t.competencia.brechaLabel}
                  </span>
                </div>
                {t.competencia.filas.map((f,i) => {
                  // La barra arranca en 3.0 para que la diferencia entre 3.8 y 4.6
                  // se vea; sobre una escala 0-5 todas quedarían casi iguales.
                  const pct = Math.max(0, Math.min(100, ((f.r - 3) / 2) * 100));
                  return (
                    <div key={i} style={{ marginBottom:i === t.competencia.filas.length-1 ? 0 : 14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:f.tuyo?700:500, color:f.tuyo?C.text:C.text2 }}>
                          {f.n}
                        </span>
                        <span style={{ fontSize:14, fontWeight:800, color:f.tuyo?C.green:C.text2, fontVariantNumeric:'tabular-nums' }}>
                          {f.r.toFixed(1)}
                        </span>
                      </div>
                      <div style={{ height:6, background:C.surface2, borderRadius:3, overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:f.tuyo?C.green:C.borderL, borderRadius:3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Insight de la IA */}
              <div style={{ background:C.surface, border:`1px solid ${C.greenB}`, borderRadius:10, padding:'22px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <Icon d={ICONS.bot} size={16} color={C.green}/>
                  <span style={{ fontSize:11, fontWeight:700, color:C.green, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                    {t.competencia.insightTag}
                  </span>
                </div>
                <p style={{ fontSize:14.5, color:C.text2, lineHeight:1.75, margin:0, fontStyle:'italic' }}>
                  {t.competencia.insightTexto}
                </p>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
              {t.competencia.bullets.map((b,i) => (
                <div key={i} className="fcard">
                  <div className="icon-wrap"><Icon d={ICONS[b.icon]} size={18} color={C.green}/></div>
                  <h3 style={{ fontSize:15, fontWeight:700, color:C.text, margin:'0 0 6px' }}>{b.t}</h3>
                  <p style={{ fontSize:13, color:C.text2, lineHeight:1.65, margin:0 }}>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Precios */}
        <section id="precios" style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:28 }}>
              <div className="section-tag">{t.precios.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:0, letterSpacing:'-1px', color:C.text }}>
                {t.precios.titulo}
              </h2>
            </div>

            {/* Toggle mensual/anual — centrado y a la vista, justo sobre los planes de pago */}
            <div style={{ display:'flex', justifyContent:'center', marginBottom:28 }}>
              <div className="toggle-wrap">
                {[t.precios.mensual, t.precios.anual].map((l,i) => (
                  <button key={i} onClick={() => setAnual(i===1)} className={`toggle-btn ${(i===1)===anual?'active':'inactive'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(238px,1fr))', gap:12, alignItems:'start' }}>
              {/* 4 planes desde el 2026-08-24. Con minmax(280px) solo entraban tres por
                  fila y Franquicia caía sola a una segunda, que se lee como un plan aparte
                  en vez de como el último escalón de la misma escalera.
                  ⚠️ Este comentario tiene que ir en llaves: dentro del JSX, `//` NO es un
                  comentario — se renderiza como texto y el build no dice nada. */}
              {t.precios.planes.map((p,i) => {
                const gratis = p.p === 0;
                const totalAnualBase = p.p * 12;
                const totalAnualDescuento = Math.round(p.p * 0.8) * 12;
                const featured = !!p.badge;
                return (
                  <div key={i} className={`pcard ${featured?'featured':''}`}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                      <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:0 }}>{p.n}</h3>
                      {featured && <span className="plan-badge">{t.precios.popular}</span>}
                    </div>
                    <div style={{ marginBottom:24 }}>
                      {gratis ? (
                        <span style={{ fontSize:40, fontWeight:900, color:C.text, letterSpacing:'-2px' }}>{t.precios.gratis}</span>
                      ) : anual ? (
                        <>
                          <span style={{ fontSize:40, fontWeight:900, color:C.text, letterSpacing:'-2px' }}>{S}{totalAnualDescuento}</span>
                          <span style={{ color:C.text3, fontSize:14 }}> {t.precios.anio}</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                            <span style={{ fontSize:14, color:C.text3, textDecoration:'line-through' }}>{S}{totalAnualBase}</span>
                            <span style={{ fontSize:12, color:C.green, fontWeight:700 }}>{t.precios.ahorras(totalAnualBase-totalAnualDescuento)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize:40, fontWeight:900, color:C.text, letterSpacing:'-2px' }}>{S}{p.p}</span>
                          <span style={{ color:C.text3, fontSize:14 }}> {t.precios.mes}</span>
                          {p.badge && (
                            <div style={{ marginTop:8 }}>
                              <span style={{ display:'inline-block', fontSize:11, fontWeight:700, color:C.green, background:C.greenT, border:`1px solid ${C.greenB}`, borderRadius:4, padding:'3px 9px' }}>
                                {t.precios.promoBienvenida}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:18, marginBottom:22 }}>
                      {p.si.map((f,j) => (
                        <div key={j} style={{ display:'flex', gap:10, fontSize:13.5, color:C.text2, marginBottom:10, alignItems:'flex-start' }}>
                          <span style={{ flexShrink:0, marginTop:2 }}><Icon d={ICONS.check} size={14} color={C.green} strokeWidth={2.5}/></span>
                          <span>{f}</span>
                        </div>
                      ))}
                      {p.no.length > 0 && (
                        <>
                          <p style={{ fontSize:11, color:C.text3, textTransform:'uppercase', letterSpacing:1, margin:'16px 0 10px', fontWeight:600 }}>{t.precios.noIncluyeLabel}</p>
                          {p.no.map((f,j) => (
                            <div key={j} style={{ display:'flex', gap:10, fontSize:13, color:C.text3, marginBottom:9, alignItems:'flex-start' }}>
                              <span style={{ flexShrink:0, marginTop:2 }}><Icon d={ICONS.cross} size={13} color={C.text3} strokeWidth={2}/></span>
                              <span>{f}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    {/* Los planes de pago llevan al catálogo público /precios, que
                        tiene el botón de pago a la vista sin necesidad de sesión.
                        El plan Gratuito sigue llevando al registro, que es su flujo.
                        🔴 El plan actual se decide comparando con `usuario.plan`, NO
                        con el índice. Antes era `i===0 ? ctaActual : ctaUpgrade`, así
                        que a CUALQUIERA con sesión el landing le señalaba «Plan
                        actual» sobre el Gratuito y «Actualizar» sobre el plan que ya
                        estaba pagando. Falla suave —nada revienta, el enlace va a un
                        sitio válido— y por eso no lo vio ninguna prueba.
                        ⚠️ El orden sale de `ORDEN` (lib/planes), nunca de una lista
                        escrita a mano: es la regla de §8.6, y es lo que hace que
                        añadir un plan no vuelva a romper esto. */}
                    {(() => {
                      const planTarjeta = ORDEN[i];
                      const esActual = loggedIn && usuario?.plan === planTarjeta;
                      // indexOf da -1 con un plan desconocido, así que cae en
                      // «Actualizar»: falla hacia el lado que no miente.
                      const esSuperior = loggedIn && ORDEN.indexOf(usuario?.plan) < i;
                      const destino = esActual ? '/dashboard'
                        : gratis ? (loggedIn ? '/dashboard' : '/registro')
                        : '/precios';
                      const texto = esActual ? t.precios.ctaActual
                        : loggedIn ? (esSuperior ? t.precios.ctaUpgrade : t.precios.ctaCambiar)
                        : (gratis ? t.precios.ctaGratis : t.precios.ctaPago);
                      return (
                        <Link href={destino}
                          style={{ display:'block', textAlign:'center', padding:'11px', borderRadius:5, fontWeight:700, fontSize:14, textDecoration:'none', transition:'all 0.15s', background:featured?C.green:'transparent', color:featured?'#fff':C.text2, border:featured?'none':`1px solid ${C.border}` }}>
                          {texto}
                        </Link>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Comparativa completa de planes */}
        <section id="comparativa" style={{ padding:'0 24px 80px' }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:32 }}>
              <div className="section-tag">{t.comparativa.tag}</div>
              <h2 style={{ fontSize:'clamp(24px,3vw,34px)', fontWeight:800, margin:'0 0 10px', letterSpacing:'-1px', color:C.text }}>
                {t.comparativa.titulo}
              </h2>
              <p style={{ fontSize:14.5, color:C.text2, margin:0 }}>{t.comparativa.sub}</p>
              <p style={{ fontSize:12.5, color:C.text3, maxWidth:620, margin:'12px auto 0', lineHeight:1.7 }}>{t.comparativa.incluidos}</p>
            </div>
            {/* border-collapse:collapse rompe position:sticky en <td>/<th> en varios
                navegadores (sobre todo Android): el fondo de la celda fija no pinta
                bien sobre las celdas que sí se desplazan y la columna "flota" o se ve
                deslizarse por debajo. Con border-separate + border-spacing:0 el sticky
                funciona de forma confiable; por eso los bordes de fila ahora van por
                celda (borderTop en cada td) en vez de en el <tr>, que se ignora en
                modo separate. */}
            <div style={{ overflowX:'auto', overflowY:'hidden', border:`1px solid ${C.border}`, borderRadius:14 }}>
              <table style={{ width:'100%', minWidth:760, borderCollapse:'separate', borderSpacing:0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left', padding:'16px 20px', fontSize:12.5, color:C.text3, fontWeight:600, borderBottom:`1px solid ${C.border}`, position:'sticky', left:0, background:C.surface, zIndex:2 }}></th>
                    {t.comparativa.columnas.map((col,i) => (
                      <th key={i} style={{ textAlign:'center', padding:'16px 16px', fontSize:14, fontWeight:800, color: i===colDestacada?C.green:C.text, borderBottom:`1px solid ${C.border}`, borderLeft: i===colDestacada?`1px solid ${C.greenB}`:'none', borderRight: i===colDestacada?`1px solid ${C.greenB}`:'none', background: i===colDestacada?C.greenT:C.surface, whiteSpace:'nowrap' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.comparativa.filas.map((fila,i) => fila.grupo ? (
                    <tr key={i}>
                      {/* La etiqueta de categoría va en su propia celda sticky (igual que
                          las filas normales) en vez de un colSpan de toda la fila: un
                          colSpan con position:sticky queda fijo en TODO su ancho durante
                          el scroll horizontal y se superpone sobre las filas de abajo;
                          además, un colSpan sin sticky simplemente desaparece de la
                          vista al scrollear porque su texto se desplaza con la tabla. */}
                      <td style={{ padding:'14px 20px 6px', fontSize:11, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:0.8, background:C.bg, position:'sticky', left:0, whiteSpace:'nowrap', zIndex:1 }}>
                        {fila.grupo}
                      </td>
                      <td colSpan={t.comparativa.columnas.length} style={{ padding:'14px 16px 6px', background:C.bg }} />
                    </tr>
                  ) : (
                    <tr key={i}>
                      {/* La etiqueta y los valores PARTEN línea. Con `nowrap` la tabla
                          medía más que su caja incluso en una laptop de 1366 px, y la
                          columna Franquicia salía cortada («Con insights de I…») sin que
                          se notara que había scroll. En móvil sigue el scroll
                          horizontal que da el `minWidth` de la tabla. */}
                      <td style={{ padding:'11px 20px', fontSize:13.5, color:C.text2, borderTop:`1px solid ${C.border}`, position:'sticky', left:0, background:C.bg, minWidth:200, maxWidth:320, lineHeight:1.45, zIndex:1 }}>{fila.label}</td>
                      {fila.valores.map((v,j) => (
                        <td key={j} style={{ textAlign:'center', padding:'11px 16px', fontSize:13, color:C.text2, borderTop:`1px solid ${C.border}`, background: j===colDestacada?C.greenT:C.bg, borderLeft: j===colDestacada?`1px solid ${C.greenB}`:'none', borderRight: j===colDestacada?`1px solid ${C.greenB}`:'none' }}>
                          {v===true ? <span style={{ display:'flex', justifyContent:'center' }}><Icon d={ICONS.check} size={16} color={C.green}/></span> :
                           v===false ? <span style={{ display:'flex', justifyContent:'center' }}><Icon d={ICONS.cross} size={14} color={C.text3}/></span> :
                           <span style={{ display:'block', textAlign:'center', fontWeight: j===colDestacada?600:400, lineHeight:1.4 }}>{v}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}`, background:C.surface }}>
          <div style={{ maxWidth:760, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:40 }}>
              <div className="section-tag">{t.faq.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:0, letterSpacing:'-1px', color:C.text }}>
                {t.faq.titulo}
              </h2>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {t.faq.items.map((f,i) => {
                const abierta = faqAbierta === i;
                return (
                  <div key={i} className="faq-item" style={abierta ? { borderColor:C.greenB } : undefined}>
                    <button className="faq-q" onClick={() => setFaqAbierta(abierta ? null : i)} aria-expanded={abierta}>
                      <span style={{ fontSize:15, fontWeight:700, color:C.text, lineHeight:1.4 }}>{f.q}</span>
                      <span style={{ flexShrink:0, transform:abierta?'rotate(180deg)':'none', transition:'transform 0.2s', display:'flex' }}>
                        <Icon d={ICONS.chevron} size={16} color={abierta?C.green:C.text3} strokeWidth={2}/>
                      </span>
                    </button>
                    {abierta && (
                      <div style={{ padding:'0 22px 18px' }}>
                        <p style={{ fontSize:14, color:C.text2, lineHeight:1.75, margin:0 }}>{f.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section style={{ padding:'96px 24px', textAlign:'center' }}>
          <div style={{ maxWidth:540, margin:'0 auto' }}>
            <div className="section-tag">{t.cta.tag}</div>
            <h2 style={{ fontSize:'clamp(28px,4vw,46px)', fontWeight:900, margin:'0 0 14px', letterSpacing:'-1.5px', color:C.text }}>
              {loggedIn ? t.cta.tituloLog : t.cta.tituloAnon}
            </h2>
            <p style={{ fontSize:16, color:C.text2, marginBottom:32, lineHeight:1.7 }}>
              {loggedIn ? t.cta.subLog : t.cta.subAnon}
            </p>
            <Link href={loggedIn?'/dashboard':'/registro'} className="btn-primary" style={{ fontSize:16, padding:'14px 32px' }}>
              {loggedIn ? t.cta.botonLog : t.cta.botonAnon}
              <Icon d={ICONS.arrow} size={16} color="#fff"/>
            </Link>
            {!loggedIn && <p style={{ fontSize:12, color:C.text3, marginTop:16 }}>{t.cta.dudas}</p>}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop:`1px solid ${C.border}`, padding:'56px 24px 28px' }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'32px 24px', marginBottom:40 }}>
              <div style={{ maxWidth:280, marginBottom:8 }}>
                <Link href="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none', marginBottom:12 }}>
                  <LogoNotoria size={18} color={C.green}/>
                  <span style={{ fontWeight:800, fontSize:16, color:C.text }}>Notoria</span>
                </Link>
                <p style={{ fontSize:13, color:C.text3, lineHeight:1.65, margin:0 }}>{t.footer.descripcion}</p>
              </div>
              {t.footer.columnas.map((col,i) => (
                <div key={i}>
                  <p style={{ fontSize:12, fontWeight:700, color:C.text, margin:'0 0 14px', textTransform:'uppercase', letterSpacing:0.5 }}>{col.titulo}</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                    {col.links.map((lk,j) => (
                      <a key={j} href={lk.h} style={{ color:C.text3, fontSize:13.5, textDecoration:'none', transition:'color 0.15s' }}
                         onMouseEnter={e=>e.target.style.color=C.text2} onMouseLeave={e=>e.target.style.color=C.text3}>{lk.l}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Datos de contacto e identificación del comercio, más el acceso al
                Libro de Reclamaciones. Culqi exige que número, correo y dirección
                estén visibles en la web, y que el libro esté dentro del sitio. */}
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:24, marginBottom:20, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:24, alignItems:'start' }}>
              <div style={{ fontSize:12.5, color:C.text3, lineHeight:1.9 }}>
                {/* 🔴 Sin RUC en el landing, y no es capricho.
                    El RUC es la llave de la ficha pública de SUNAT: con ese
                    número cualquiera consulta el domicilio fiscal del titular,
                    que en una E.I.R.L. suele ser su casa. En la página que más
                    tráfico frío recibe, eso es repartir la dirección del dueño.
                    Y ya no hace falta: la Ley 32080 (2 jul 2024) eliminó la
                    obligación —introducida en 2023— de consignar RUC y
                    denominación social en los medios digitales donde se ofertan
                    bienes o servicios.
                    Sigue estando donde identifica al proveedor y ahí sí toca:
                    Términos, Privacidad, Contacto, Devoluciones y el Libro de
                    Reclamaciones. Y en los comprobantes, donde es obligatorio. */}
                <div style={{ fontWeight:700, color:C.text2, marginBottom:4 }}>{CONTACTO.razonSocial}</div>
                <div>{CONTACTO.direccion}</div>
                <div>
                  <a href={`tel:${CONTACTO.telefonoLink}`} style={{ color:C.green, textDecoration:'none' }}>{CONTACTO.telefono}</a>
                  {' · '}
                  <a href={`mailto:${CONTACTO.email}`} style={{ color:C.green, textDecoration:'none' }}>{CONTACTO.email}</a>
                </div>
                <div>{CONTACTO.horario}</div>
              </div>
              <a href="/libro-reclamaciones" style={{ textDecoration:'none', justifySelf:'start' }}>
                <div style={{ border:`2px solid ${C.text2}`, borderRadius:6, padding:'10px 13px', maxWidth:230, display:'flex', alignItems:'center', gap:10 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.text2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <span style={{ fontSize:11.5, fontWeight:800, color:C.text2, lineHeight:1.3 }}>LIBRO DE<br/>RECLAMACIONES</span>
                </div>
              </a>
            </div>
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
              <span style={{ color:C.text3, fontSize:12.5 }}>{t.footer.copyright(new Date().getFullYear())}</span>
              <span style={{ color:C.text3, fontSize:12.5 }}>{t.footer.lema} · usenotoria.app</span>
            </div>
          </div>
        </footer>
        <BotonWhatsApp />
      </div>
    </>
  );
}
