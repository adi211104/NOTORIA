'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '../context/AuthContext';
import { useIdioma } from '../context/IdiomaContext';

// WebGL — solo en cliente, no tiene sentido en el render de servidor
const PixelBlast = dynamic(() => import('../components/PixelBlast'), { ssr: false });

import LogoNotoria from '../components/LogoNotoria';
import BotonWhatsApp from '../components/BotonWhatsApp';
import AnalisisGratis from '../components/AnalisisGratis';

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
      sub:'Notoria detecta reseñas falsas, ataques de bots y caídas de rating, y te avisa antes de que el daño sea irreversible.',
      ctaCrear:'Crear cuenta gratis', ctaComo:'Ver cómo funciona', ctaDash:'Ir al panel de control',
      micro:'Sin tarjeta de crédito · 1 negocio gratis para siempre · Registro en 30 segundos',
    },
    stats: {
      tag:'Por qué esto te importa',
      titulo:'La reputación online no perdona un mal fin de semana',
      sub:'Estos son los tres patrones que vemos una y otra vez en negocios que no monitorean su reputación.',
      items: [
        { n:'30%', l:'de reseñas negativas tienen patrones de bots', icon:'bot', d:'Cuentas recién creadas, un solo comentario, texto repetido: así se ven los ataques coordinados de la competencia.' },
        { n:'22%', l:'menos clientes cuando el rating cae 0.3 estrellas', icon:'trend', d:'Google prioriza en Maps y en resultados de búsqueda a los negocios mejor calificados. Cada décima cuenta.' },
        { n:'3 días', l:'tarda el daño en volverse visible sin monitoreo', icon:'alert', d:'Para cuando lo notas a simple vista, ya perdiste ventas y el algoritmo ya empezó a bajarte de posición.' },
      ],
    },
    problema: {
      tag:'El problema', titulo:'¿Qué pasa cuando no lo monitoreas?',
      cards: [
        { icon:'lightning', t:'Ataque a las 3AM', d:'Un competidor coordina 8 reseñas de 1 estrella en la madrugada. Te enteras el miércoles, cuando el rating ya cayó 0.5 puntos.' },
        { icon:'trend', t:'Rating cae, ventas también', d:'Con 4.0★ recibes 30% menos clientes que con 4.3★. Google te baja en resultados sin que lo notes.' },
        { icon:'money', t:'Semanas de daño económico', d:'Una semana de mala reputación puede costar más que un año de publicidad. Sin alertas, reaccionas demasiado tarde.' },
      ],
    },
    aclaracion: {
      tag:'Cómo te protege Notoria', titulo:'Esto es exactamente lo que hacemos por ti',
      sub:'Notoria trabaja en segundo plano, 24/7, para que tu reputación online esté siempre bajo control:',
      siTitulo:'Todo esto, sin que muevas un dedo',
      si:[
        'Vigila tu rating y tus reseñas nuevas las 24 horas, sin que tengas que revisar manualmente',
        'Detecta patrones de reseñas falsas y ataques de bots: cuentas nuevas, texto repetido, picos inusuales',
        'Te alerta al instante por email, Telegram o WhatsApp para que actúes mientras aún se puede',
        'Te ayuda a responder rápido, con plantillas profesionales y respuestas generadas con IA',
        'Te dice exactamente qué reseñas reportar a Google y por qué, para que tú decidas el siguiente paso',
      ],
    },
    como: {
      tag:'Cómo funciona', titulo:'Listo en menos de 5 minutos',
      pasos: [
        { n:'1', t:'Agrega tu negocio', d:'Búscalo en Google Maps y selecciónalo. El rating y los datos se importan al instante.' },
        { n:'2', t:'Suma a tus competidores', d:'Elige a tus rivales directos. Notoria compara tu rating con el de ellos en cada escaneo.' },
        { n:'3', t:'Conecta Google Business', d:'Acceso completo a todas tus reseñas, no solo las últimas 5 de la API pública.' },
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
      items: [
        { icon:'bell', t:'Alertas en tiempo real', d:'Email o Telegram al minuto. No el lunes, sino al momento en que ocurre.' },
        { icon:'bot', t:'Detecta bots y falsas', d:'Identifica cuentas nuevas, texto repetitivo y picos inusuales automáticamente.' },
        { icon:'eye', t:'Score de reputación 0-100', d:'Un solo número que resume tu salud online. Sabes al instante si estás bien o en riesgo.' },
        { icon:'lightning', t:'QR para pedir reseñas', d:'Enlace directo y código QR imprimible. Convierte clientes felices en reseñas de 5 estrellas.' },
        { icon:'trend', t:'Vigila a tu competencia', d:'Compara tu rating con el de tus rivales directos, con análisis de IA de sus debilidades.' },
        { icon:'chat', t:'Responde sin salir', d:'30 plantillas profesionales y respuestas generadas con IA, desde un solo panel.' },
        { icon:'doc', t:'Reportes PDF mensuales', d:'El día 1 de cada mes en tu email. Ideal para socios e inversionistas.' },
        { icon:'chart', t:'Historial de rating', d:'Gráfica de evolución por escaneo. Ve exactamente cuándo y cuánto cayó.' },
        { icon:'search', t:'Escaneo programado', d:'Cada 1h, 4h o 24h según tu plan. Frecuencia adaptada a tu negocio.' },
      ],
    },
    precios: {
      tag:'Precios', titulo:'Precios sin sorpresas',
      mensual:'Mensual', anual:'Anual (20% off)', ahorras:(m)=>`Ahorras ${S}${m}/año`,
      gratis:'Gratis', mes:'/mes', anio:'/año', popular:'Más popular', promoBienvenida:'50% OFF tus primeros 2 meses',
      ctaGratis:'Empezar gratis', ctaPago:'Probar 7 días gratis', ctaActual:'Plan actual', ctaUpgrade:'Actualizar',
      noIncluyeLabel:'No incluye:',
      planes: [
        { n:'Gratuito', p:0,
          si:['1 negocio monitoreado','Escaneo cada 24 horas','Score de reputación 0-100','QR y enlace para pedir reseñas','30 plantillas de respuesta','5 respuestas con IA a la semana','1 competidor monitoreado','Alertas por email','7 días de historial'],
          no:['Conexión de TikTok','Respuestas con IA ilimitadas','Análisis de competencia con IA','Reportes PDF','Alertas por Telegram y WhatsApp','Soporte prioritario'] },
        { n:'Negocio', p:59, badge:true,
          si:['Hasta 5 negocios','Escaneo cada 4 horas','100 usos de IA a la semana (respuestas y análisis)','5 competidores por negocio','Conexión de TikTok (perfil y videos)','Reporte PDF mensual','Boleta o factura electrónica a tu RUC','Alertas por email y Telegram','90 días de historial','Todo lo del plan Gratuito'],
          no:[] },
        { n:'Franquicia', p:179,
          si:['Negocios ilimitados','Escaneo cada hora','300 usos de IA a la semana','15 competidores por negocio','Conexión de TikTok (perfil y videos)','Reportes PDF semanales y mensuales','Email, Telegram y WhatsApp','Panel de control ejecutivo multi-sede','Historial ilimitado','Soporte prioritario por WhatsApp'],
          no:[] },
      ],
    },
    comparativa: {
      tag:'Comparativa completa', titulo:'Lo que cambia de un plan a otro',
      sub:'Sin relleno: solo las diferencias reales entre los tres planes.',
      incluidos:'Los 3 planes incluyen: score de reputación 0-100, detección de reseñas falsas y bots, 30 plantillas de respuesta profesionales, QR para pedir reseñas y alertas por email.',
      columnas:['Gratuito','Negocio','Franquicia'],
      filas:[
        { grupo:'Alcance y velocidad de reacción' },
        { label:'Negocios monitoreados', valores:['1','Hasta 5','Ilimitados'] },
        { label:'Un ataque se detecta en máximo', valores:['24 horas','4 horas','1 hora'] },
        { label:'Historial para demostrar la tendencia', valores:['7 días','90 días','Ilimitado'] },
        { grupo:'Inteligencia artificial' },
        { label:'Respuestas y análisis con IA a la semana', valores:['5','100','300'] },
        { label:'Resumen semanal por email', valores:['Cifras básicas','Con insights de IA','Con insights de IA'] },
        { grupo:'Vigilancia de la competencia' },
        { label:'Competidores vigilados por negocio', valores:['1','5','15'] },
        { label:'Análisis IA de sus puntos débiles', valores:[false,true,true] },
        { label:'Descubrimiento automático de rivales a la redonda', valores:[false,false,true] },
        { grupo:'Trabajo que se hace solo' },
        { label:'Auto-respuesta a reseñas positivas', valores:[false,'Plantilla única','3 tonos personalizables'] },
        { label:'Aviso extra si una crítica lleva 24h sin respuesta', valores:[false,true,true] },
        { label:'Reportes PDF automáticos', valores:[false,'Mensual','Semanal y mensual'] },
        { grupo:'Canales y fuentes' },
        { label:'Alertas al instante por', valores:['Email','Email + Telegram','Email + Telegram + WhatsApp'] },
        { label:'Conexión de TikTok (perfil y videos)', valores:[false,true,true] },
        { grupo:'Para cadenas y grupos' },
        { label:'Panel de control ejecutivo multi-sede', valores:[false,false,true] },
        { grupo:'Facturación y soporte' },
        { label:'Boleta o factura electrónica a tu RUC, automática', valores:[false,true,true] },
        { label:'Soporte', valores:['Estándar','Prioritario','Prioritario por WhatsApp'] },
      ],
    },
    faq: {
      tag:'Preguntas frecuentes', titulo:'Resolvemos tus dudas',
      items: [
        { q:'¿Necesito tarjeta de crédito para empezar?', a:'No. El plan Gratuito es gratis para siempre e incluye 1 negocio monitoreado, score de reputación, QR para pedir reseñas y alertas por email. Solo pides una tarjeta si decides subir a un plan de pago.' },
        { q:'¿Cómo detecta Notoria las reseñas falsas?', a:'Analizamos patrones típicos de ataques: cuentas recién creadas, autores con una sola reseña, texto repetitivo o duplicado y picos inusuales de reseñas negativas en pocas horas. Cada reseña sospechosa se marca con el motivo para que puedas reportarla en Google.' },
        { q:'¿Por qué solo veo 5 reseñas si mi negocio tiene cientos?', a:'La API pública de Google entrega máximo las 5 reseñas más recientes por consulta, es un límite de Google. Al conectar Google Business Profile (gratis, tardas 1 minuto), Notoria accede a todo tu historial de reseñas y puedes responderlas directamente.' },
        { q:'¿Qué es Google Business Profile y qué necesito para conectarlo?', a:'Es la cuenta gratuita de Google con la que se administra la ficha de tu negocio en Google Maps (la que muestra horarios, fotos y reseñas). Para conectarla en Notoria debes iniciar sesión con el correo de Google que la administra: el que la creó o el que fue agregado como propietario/gerente. Si no tienes acceso a ese correo (por ejemplo, lo configuró un empleado anterior o una agencia), poco se puede hacer desde Notoria: pide a quien lo gestiona que te agregue como gerente en Google Business Profile, o inicia tú mismo el proceso de reclamo de propiedad directamente con Google. Mientras tanto, tu negocio sigue monitoreado normalmente, solo que verás únicamente las 5 reseñas públicas más recientes.' },
        { q:'¿Puedo responder las reseñas desde Notoria?', a:'Sí. Tienes 30 plantillas profesionales según las estrellas de la reseña y un asistente de IA que redacta la respuesta por ti. Guardamos tu respuesta, la copiamos al portapapeles y te abrimos Google Maps para publicarla. Con Google Business conectado, la publicación será directa.' },
        { q:'¿Qué pasa si mi rating cae de repente?', a:'Notoria lo detecta en el siguiente escaneo y te envía una alerta inmediata por email (o Telegram en planes de pago) con el detalle de qué pasó: cuántas reseñas negativas, de qué cuentas y si tienen patrones de bot. Tú decides qué alertas recibir y con qué frecuencia.' },
        { q:'¿Cómo sabe Notoria quiénes son mis competidores?', a:'Tú los eliges. Los buscas igual que a tu negocio, en Google Maps, y los agregas a la lista (1 en el plan Gratuito, 5 en Negocio y 15 en Franquicia por cada negocio). Además, en el plan Franquicia Notoria busca por su cuenta locales de tu mismo rubro a la redonda y te los propone, para que descubras rivales que quizá no tenías fichados.' },
        { q:'¿Es legal analizar las reseñas de mis competidores?', a:'Sí. Notoria solo lee lo que ya es público en Google Maps: el mismo rating y las mismas reseñas que vería cualquier persona buscando ese negocio. No accedemos a nada privado de su ficha, no interactuamos con sus reseñas y no publicamos nada en su nombre. Es exactamente la información que tú mismo podrías mirar a mano, ordenada y comparada por ti.' },
        { q:'¿Mis competidores se enteran de que los estoy siguiendo?', a:'No. Notoria consulta la información pública de Google como lo haría cualquier visitante, así que no hay ninguna notificación ni rastro visible para ellos. Tu lista de competidores es privada de tu cuenta.' },
        { q:'¿Funciona en toda mi ciudad o solo en Lima?', a:'En todo el Perú. Notoria monitorea cualquier negocio que tenga ficha en Google Maps, esté en Lima, Arequipa, Cusco, Trujillo o un distrito pequeño. Por ahora operamos solo en Perú: cobramos en soles y emitimos comprobantes peruanos.' },
        { q:'¿Puedo cancelar cuando quiera?', a:'Sí. No hay contratos de permanencia. Puedes bajar de plan o cancelar en cualquier momento desde tu panel de control, y tu negocio seguirá monitoreado con el plan Gratuito.' },
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
      descripcion:'Monitor de reputación online para restaurantes y hoteles del Perú: detecta reseñas falsas, ataques de bots y caídas de rating antes de que te cuesten clientes.',
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
          { l:'Contacto', h:'mailto:hola@usenotoria.app' },
        ]},
        { titulo:'Cuenta', links:[
          { l:'Iniciar sesión', h:'/login' },
          { l:'Crear cuenta gratis', h:'/registro' },
          { l:'Panel de control', h:'/dashboard' },
        ]},
        { titulo:'Legal', links:[
          { l:'Términos de servicio', h:'/terminos' },
          { l:'Política de privacidad', h:'/privacidad' },
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
      sub:'Notoria detects fake reviews, bot attacks and rating drops, and warns you before the damage becomes irreversible.',
      ctaCrear:'Create free account', ctaComo:'See how it works', ctaDash:'Go to dashboard',
      micro:'No credit card · 1 business free forever · Sign up in 30 seconds',
    },
    stats: {
      tag:'Why this matters',
      titulo:'Online reputation doesn’t forgive a bad weekend',
      sub:'These are the three patterns we see again and again in businesses that don’t monitor their reputation.',
      items: [
        { n:'30%', l:'of negative reviews show bot patterns', icon:'bot', d:'Newly created accounts, a single comment, repeated text — that’s what a competitor’s coordinated attack looks like.' },
        { n:'22%', l:'fewer customers when your rating drops 0.3 stars', icon:'trend', d:'Google ranks better-rated businesses higher in Maps and search results. Every tenth of a star counts.' },
        { n:'3 days', l:'for the damage to become visible without monitoring', icon:'alert', d:'By the time you notice with the naked eye, you’ve already lost sales and the algorithm has started ranking you lower.' },
      ],
    },
    problema: {
      tag:'The problem', titulo:'What happens when you don’t monitor it?',
      cards: [
        { icon:'lightning', t:'Attack at 3AM', d:'A competitor coordinates 8 one-star reviews overnight. You find out on Wednesday, when your rating has already dropped 0.5 points.' },
        { icon:'trend', t:'Rating falls, sales follow', d:'At 4.0★ you get 30% fewer customers than at 4.3★. Google pushes you down in results without you noticing.' },
        { icon:'money', t:'Weeks of economic damage', d:'One week of bad reputation can cost more than a year of advertising. Without alerts, you react too late.' },
      ],
    },
    aclaracion: {
      tag:'How Notoria protects you', titulo:'This is exactly what we do for you',
      sub:'Notoria works in the background, 24/7, so your online reputation always stays under control:',
      siTitulo:'All of this, without lifting a finger',
      si:[
        'Watches your rating and new reviews 24/7, so you don’t have to check manually',
        'Detects patterns of fake reviews and bot attacks: new accounts, repeated text, unusual spikes',
        'Alerts you instantly by email, Telegram or WhatsApp so you can act while it still matters',
        'Helps you reply fast, with professional templates and AI-generated responses',
        'Tells you exactly which reviews to report to Google and why, so you decide the next step',
      ],
    },
    como: {
      tag:'How it works', titulo:'Ready in under 5 minutes',
      pasos: [
        { n:'1', t:'Add your business', d:'Search for it on Google Maps and select it. Rating and data are imported instantly.' },
        { n:'2', t:'Add your competitors', d:'Pick your direct rivals. Notoria compares your rating against theirs on every scan.' },
        { n:'3', t:'Connect Google Business', d:'Full access to all your reviews, not just the last 5 from the public API.' },
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
        { icon:'bell', t:'Real-time alerts', d:'Email or Telegram within minutes. Not on Monday, but the moment it happens.' },
        { icon:'bot', t:'Detects bots and fakes', d:'Automatically flags new accounts, repetitive text and unusual spikes.' },
        { icon:'eye', t:'0-100 reputation score', d:'One number that sums up your online health. Know instantly if you are safe or at risk.' },
        { icon:'lightning', t:'QR to request reviews', d:'Direct link and printable QR code. Turn happy customers into 5-star reviews.' },
        { icon:'trend', t:'Watch your competition', d:'Compare your rating against direct rivals, with AI analysis of their weaknesses.' },
        { icon:'chat', t:'Reply without leaving', d:'30 professional templates and AI-generated replies, from a single panel.' },
        { icon:'doc', t:'Monthly PDF reports', d:'On the 1st of every month in your inbox. Great for partners and investors.' },
        { icon:'chart', t:'Rating history', d:'Evolution chart per scan. See exactly when and how much it dropped.' },
        { icon:'search', t:'Scheduled scanning', d:'Every 1h, 4h or 24h depending on your plan. Frequency that fits your business.' },
      ],
    },
    precios: {
      tag:'Pricing', titulo:'Pricing with no surprises',
      mensual:'Monthly', anual:'Yearly (20% off)', ahorras:(m)=>`Save ${S}${m}/year`,
      gratis:'Free', mes:'/mo', anio:'/yr', popular:'Most popular', promoBienvenida:'50% OFF your first 2 months',
      ctaGratis:'Start free', ctaPago:'Try 7 days free', ctaActual:'Current plan', ctaUpgrade:'Upgrade',
      noIncluyeLabel:'Not included:',
      planes: [
        { n:'Free', p:0,
          si:['1 monitored business','Scan every 24 hours','0-100 reputation score','QR and link to request reviews','30 reply templates','5 AI replies per week','1 monitored competitor','Email alerts','7-day history'],
          no:['TikTok connection','Unlimited AI replies','AI competitor analysis','PDF reports','Telegram and WhatsApp alerts','Priority support'] },
        { n:'Business', p:59, badge:true,
          si:['Up to 5 businesses','Scan every 4 hours','100 AI uses per week (replies and analysis)','5 competitors per business','TikTok connection (profile and videos)','Monthly PDF report','Automatic electronic invoice (SUNAT)','Email and Telegram alerts','90-day history','Everything in Free'],
          no:[] },
        { n:'Franchise', p:179,
          si:['Unlimited businesses','Scan every hour','300 AI uses per week','15 competitors per business','TikTok connection (profile and videos)','Weekly and monthly PDF reports','Email, Telegram and WhatsApp','Multi-location executive dashboard','Unlimited history','Priority WhatsApp support'],
          no:[] },
      ],
    },
    comparativa: {
      tag:'Full comparison', titulo:'What actually changes between plans',
      sub:'No filler: only the real differences between the three plans.',
      incluidos:'All 3 plans include: 0-100 reputation score, fake-review and bot detection, 30 professional reply templates, a QR code to request reviews, and email alerts.',
      columnas:['Free','Business','Franchise'],
      filas:[
        { grupo:'Coverage and reaction speed' },
        { label:'Monitored businesses', valores:['1','Up to 5','Unlimited'] },
        { label:'An attack is detected within', valores:['24 hours','4 hours','1 hour'] },
        { label:'History to prove the trend', valores:['7 days','90 days','Unlimited'] },
        { grupo:'Artificial intelligence' },
        { label:'AI replies and analyses per week', valores:['5','100','300'] },
        { label:'Weekly email summary', valores:['Basic figures','With AI insights','With AI insights'] },
        { grupo:'Competitor watch' },
        { label:'Competitors watched per business', valores:['1','5','15'] },
        { label:'AI analysis of their weak points', valores:[false,true,true] },
        { label:'Automatic discovery of nearby rivals', valores:[false,false,true] },
        { grupo:'Work that runs itself' },
        { label:'Auto-reply to positive reviews', valores:[false,'Single template','3 customizable tones'] },
        { label:'Extra warning if a bad review sits 24h unanswered', valores:[false,true,true] },
        { label:'Automatic PDF reports', valores:[false,'Monthly','Weekly and monthly'] },
        { grupo:'Channels and sources' },
        { label:'Instant alerts via', valores:['Email','Email + Telegram','Email + Telegram + WhatsApp'] },
        { label:'TikTok connection (profile and videos)', valores:[false,true,true] },
        { grupo:'For chains and groups' },
        { label:'Multi-location executive dashboard', valores:[false,false,true] },
        { grupo:'Billing and support' },
        { label:'Automatic electronic invoice (SUNAT, Peru)', valores:[false,true,true] },
        { label:'Support', valores:['Standard','Priority','Priority via WhatsApp'] },
      ],
    },
    faq: {
      tag:'FAQ', titulo:'We answer your questions',
      items: [
        { q:'Do I need a credit card to start?', a:'No. The Free plan is free forever and includes 1 monitored business, reputation score, QR to request reviews and email alerts. You only add a card if you upgrade to a paid plan.' },
        { q:'How does Notoria detect fake reviews?', a:'We analyze typical attack patterns: newly created accounts, authors with a single review, repetitive or duplicated text and unusual spikes of negative reviews within hours. Each suspicious review is flagged with the reason so you can report it to Google.' },
        { q:'Why do I only see 5 reviews if my business has hundreds?', a:'Google’s public API returns at most the 5 most recent reviews per query, that is Google’s limit. By connecting Google Business Profile (free, takes 1 minute), Notoria accesses your full review history and you can reply directly.' },
        { q:'What is Google Business Profile and what do I need to connect it?', a:'It’s the free Google account used to manage your business listing on Google Maps (the one showing hours, photos and reviews). To connect it in Notoria you must sign in with the Google email that manages it — whoever created it or was added as owner/manager. If you don’t have access to that email (for example, a former employee or an agency set it up), there isn’t much Notoria can do about it: ask whoever manages it to add you as a manager in Google Business Profile, or start Google’s ownership-claim process yourself. In the meantime your business keeps being monitored normally — you’ll just see only the 5 most recent public reviews.' },
        { q:'Can I reply to reviews from Notoria?', a:'Yes. You get 30 professional templates based on the review’s stars and an AI assistant that drafts the reply for you. We save your reply, copy it to your clipboard and open Google Maps so you can publish it. With Google Business connected, publishing becomes direct.' },
        { q:'What happens if my rating suddenly drops?', a:'Notoria detects it on the next scan and sends you an immediate alert by email (or Telegram on paid plans) detailing what happened: how many negative reviews, from which accounts and whether they show bot patterns. You decide which alerts to receive and how often.' },
        { q:'How does Notoria know who my competitors are?', a:'You choose them. You search for them just like your own business, on Google Maps, and add them to the list (1 on the Free plan, 5 on Business and 15 on Franchise, per business). On the Franchise plan Notoria also searches for venues in your category nearby and suggests them, so you discover rivals you may not have been tracking.' },
        { q:'Is it legal to analyse my competitors’ reviews?', a:'Yes. Notoria only reads what is already public on Google Maps: the same rating and the same reviews anyone searching for that business would see. We do not access anything private on their listing, we do not interact with their reviews and we never post anything on their behalf. It is exactly the information you could look up by hand, organised and compared for you.' },
        { q:'Will my competitors know I am tracking them?', a:'No. Notoria queries Google’s public information the same way any visitor would, so there is no notification and no visible trace for them. Your competitor list is private to your account.' },
        { q:'Does it work across the country or only in Lima?', a:'Across all of Peru. Notoria monitors any business with a Google Maps listing, whether it is in Lima, Arequipa, Cusco, Trujillo or a small district. For now we operate in Peru only: we charge in soles and issue Peruvian tax receipts.' },
        { q:'Can I cancel anytime?', a:'Yes. There are no lock-in contracts. You can downgrade or cancel anytime from your dashboard, and your business will keep being monitored under the Free plan.' },
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
      descripcion:'Online reputation monitoring for restaurants and hotels anywhere in the world: detects fake reviews, bot attacks and rating drops before they cost you customers.',
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
          { l:'Contact', h:'mailto:hola@usenotoria.app' },
        ]},
        { titulo:'Account', links:[
          { l:'Sign in', h:'/login' },
          { l:'Create free account', h:'/registro' },
          { l:'Dashboard', h:'/dashboard' },
        ]},
        { titulo:'Legal', links:[
          { l:'Terms of service', h:'/terminos' },
          { l:'Privacy policy', h:'/privacidad' },
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

  if (cargando) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor:`${C.green} transparent transparent transparent` }} />
    </div>
  );

  const loggedIn = !!usuario;

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

        .pain-card{
          background:${C.surface};border:1px solid ${C.border};
          border-radius:8px;padding:28px;
          transition:border-color 0.2s;
        }
        .pain-card:hover{border-color:${C.borderL};}

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

        a{font-family:${GEO};}
        button{font-family:${GEO};}
      `}</style>

      <div style={{ background:C.bg, color:C.text, fontFamily:GEO, minHeight:'100vh' }}>

        {/* Navbar */}
        <nav style={{ borderBottom:`1px solid ${C.border}`, position:'sticky', top:0, background:C.bg, zIndex:100 }}>
          <div style={{ maxWidth:1060, margin:'0 auto', padding:'0 24px', height:58, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
              <span className="logo-icon"><LogoNotoria size={20} color={C.green}/></span>
              <span style={{ fontSize:18, fontWeight:800, color:C.text, letterSpacing:'-0.5px' }}>Notoria</span>
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
              <div style={{ display:'flex', alignItems:'center', border:`1px solid ${C.border}`, borderRadius:5, marginRight:6, overflow:'hidden' }}>
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

        {/* Stats */}
        <section style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:40, maxWidth:640 }}>
              <div className="section-tag">{t.stats.tag}</div>
              <h2 style={{ fontSize:'clamp(24px,3.2vw,34px)', fontWeight:800, margin:'0 0 10px', letterSpacing:'-1px', color:C.text }}>
                {t.stats.titulo}
              </h2>
              <p style={{ fontSize:14.5, color:C.text2, margin:0, lineHeight:1.7 }}>{t.stats.sub}</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
              {t.stats.items.map((s,i) => (
                <div key={i} className="stat-card">
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                    <div style={{ width:38, height:38, borderRadius:9, background:C.greenT, border:`1px solid ${C.greenB}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon d={ICONS[s.icon]} size={19} color={C.green}/>
                    </div>
                    <div style={{ fontSize:32, fontWeight:900, color:C.text, letterSpacing:'-1px' }}>{s.n}</div>
                  </div>
                  <div style={{ fontSize:13.5, color:C.text, fontWeight:600, lineHeight:1.5, marginBottom:8 }}>{s.l}</div>
                  <p style={{ fontSize:12.5, color:C.text2, lineHeight:1.65, margin:0 }}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* El dolor */}
        <section style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}`, background:C.surface }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:44 }}>
              <div className="section-tag">{t.problema.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:0, letterSpacing:'-1px', color:C.text }}>
                {t.problema.titulo}
              </h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12 }}>
              {t.problema.cards.map((d,i) => (
                <div key={i} className="pain-card">
                  <div style={{ color:C.green, marginBottom:16 }}>
                    <Icon d={ICONS[d.icon]} size={24} color={C.green}/>
                  </div>
                  <h3 style={{ fontSize:17, fontWeight:700, color:C.text, margin:'0 0 8px' }}>{d.t}</h3>
                  <p style={{ fontSize:14, color:C.text2, lineHeight:1.7, margin:0 }}>{d.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Aclaración: qué hace y qué no hace Notoria */}
        <section style={{ padding:'80px 24px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ marginBottom:36, maxWidth:640 }}>
              <div className="section-tag">{t.aclaracion.tag}</div>
              <h2 style={{ fontSize:'clamp(26px,3.5vw,40px)', fontWeight:800, margin:'0 0 14px', letterSpacing:'-1px', color:C.text }}>
                {t.aclaracion.titulo}
              </h2>
              <p style={{ fontSize:15, color:C.text2, lineHeight:1.75, margin:0 }}>{t.aclaracion.sub}</p>
            </div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:'28px 30px' }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:C.green, margin:'0 0 18px', textTransform:'uppercase', letterSpacing:0.5 }}>
                {t.aclaracion.siTitulo}
              </h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'6px 28px' }}>
                {t.aclaracion.si.map((linea,i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:12 }}>
                    <Icon d={ICONS.check} size={16} color={C.green} />
                    <p style={{ fontSize:13.5, color:C.text2, lineHeight:1.6, margin:0 }}>{linea}</p>
                  </div>
                ))}
              </div>
            </div>
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
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
              {t.features.items.map((f,i) => (
                <div key={i} className="fcard">
                  <div className="icon-wrap"><Icon d={ICONS[f.icon]} size={18} color={C.green}/></div>
                  <h3 style={{ fontSize:15, fontWeight:700, color:C.text, margin:'0 0 6px' }}>{f.t}</h3>
                  <p style={{ fontSize:13, color:C.text2, lineHeight:1.65, margin:0 }}>{f.d}</p>
                </div>
              ))}
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

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12, alignItems:'start' }}>
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
                    <Link href={loggedIn?'/dashboard/planes':'/registro'}
                      style={{ display:'block', textAlign:'center', padding:'11px', borderRadius:5, fontWeight:700, fontSize:14, textDecoration:'none', transition:'all 0.15s', background:featured?C.green:'transparent', color:featured?'#fff':C.text2, border:featured?'none':`1px solid ${C.border}` }}>
                      {loggedIn?(i===0?t.precios.ctaActual:t.precios.ctaUpgrade):(gratis?t.precios.ctaGratis:t.precios.ctaPago)}
                    </Link>
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
              <table style={{ width:'100%', minWidth:640, borderCollapse:'separate', borderSpacing:0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left', padding:'16px 20px', fontSize:12.5, color:C.text3, fontWeight:600, borderBottom:`1px solid ${C.border}`, position:'sticky', left:0, background:C.surface, zIndex:2 }}></th>
                    {t.comparativa.columnas.map((col,i) => (
                      <th key={i} style={{ textAlign:'center', padding:'16px 16px', fontSize:14, fontWeight:800, color: i===1?C.green:C.text, borderBottom:`1px solid ${C.border}`, borderLeft: i===1?`1px solid ${C.greenB}`:'none', borderRight: i===1?`1px solid ${C.greenB}`:'none', background: i===1?C.greenT:C.surface, whiteSpace:'nowrap' }}>
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
                      <td colSpan={3} style={{ padding:'14px 16px 6px', background:C.bg }} />
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td style={{ padding:'11px 20px', fontSize:13.5, color:C.text2, borderTop:`1px solid ${C.border}`, position:'sticky', left:0, background:C.bg, whiteSpace:'nowrap', zIndex:1 }}>{fila.label}</td>
                      {fila.valores.map((v,j) => (
                        <td key={j} style={{ textAlign:'center', padding:'11px 16px', fontSize:13, color:C.text2, borderTop:`1px solid ${C.border}`, background: j===1?C.greenT:C.bg, borderLeft: j===1?`1px solid ${C.greenB}`:'none', borderRight: j===1?`1px solid ${C.greenB}`:'none' }}>
                          {v===true ? <span style={{ display:'flex', justifyContent:'center' }}><Icon d={ICONS.check} size={16} color={C.green}/></span> :
                           v===false ? <span style={{ display:'flex', justifyContent:'center' }}><Icon d={ICONS.cross} size={14} color={C.text3}/></span> :
                           <span style={{ display:'block', textAlign:'center', fontWeight: j===1?600:400, whiteSpace:'nowrap' }}>{v}</span>}
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
