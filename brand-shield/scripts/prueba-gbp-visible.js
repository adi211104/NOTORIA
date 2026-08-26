// Prueba del interruptor `src/lib/gbpVisible.js` y de que la web dejó de
// prometer Google Business Profile. Sin servidor, sin BD y sin red.
//
//   node scripts/prueba-gbp-visible.js
//
// ── POR QUÉ IMPORTA ─────────────────────────────────────────────────────────
//
// Es el tercer interruptor del proyecto, y hasta el 2026-08-25 era el único que
// NO existía: Instagram y Facebook estaban escondidos tras el suyo y Google
// Business seguía a la vista, con un botón «Conectar» siempre pulsable.
//
// El fallo era peor que el de las otras dos redes. Google tiene las GBP APIs con
// cuota `Requests per minute = 0`, así que el flujo no falla al principio: el
// usuario pasa por el diálogo de Google, **autoriza de verdad sobre su ficha
// real**, vuelve a Notoria y recién ahí revienta en `listarCuentas`. Conceder
// permisos y recibir a cambio un error genérico es la peor forma de fallar,
// porque parece culpa suya.
//
// Y encima estaba ANUNCIADO: era el paso 3 de cuatro del onboarding de la
// página principal, aparecía prometido dos veces en el FAQ y otras dos en el
// JSON-LD que Google indexa como dato estructurado. Como todavía no hay clientes
// de pago, no lo había pulsado nadie. El primero habría empezado justo por ahí.
//
// El bloque 3 LEE LA WEB, no la lógica: es lo único que puede cazar que alguien
// devuelva esas frases sin encender el interruptor.

const fs = require('fs');
const path = require('path');

let ok = 0, fallos = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const titulo = (t) => console.log(`\n${t}`);

// El módulo lee process.env en cada llamada, así que basta con moverlo entre
// pruebas. Se guarda el original para no ensuciar el resto del proceso.
const ENV_ORIGINAL = { ...process.env };
const entorno = (vars) => {
  delete process.env.GBP_ACTIVO;
  delete process.env.GBP_CUENTAS_PRUEBA;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  Object.assign(process.env, vars);
};

const gbp = require('../src/lib/gbpVisible');

// ─────────────────────────────────────────────────────────────────────────────
titulo('1. Apagado por defecto — nadie ve Google Business');

entorno({});
check('sin variables, un cliente cualquiera NO lo ve',
  !gbp.gbpVisiblePara({ email: 'cliente@restaurante.pe' }));
check('sin variables, `activoParaTodos` es false', !gbp.activoParaTodos());
check('un usuario sin correo no lo ve', !gbp.gbpVisiblePara({}));
check('null y undefined no revientan',
  !gbp.gbpVisiblePara(null) && !gbp.gbpVisiblePara(undefined));

// ⚠️ Solo el literal 'true'. Es la misma regla que en los otros dos
// interruptores: cualquier otro valor —'1', 'si', 'TRUE'— deja la función
// apagada, que es el lado seguro del error.
titulo('2. Solo el literal "true" enciende');

for (const valor of ['1', 'si', 'yes', 'TRUE', 'True', '', 'false']) {
  entorno({ GBP_ACTIVO: valor });
  check(`GBP_ACTIVO="${valor}" NO enciende`, !gbp.activoParaTodos());
}
entorno({ GBP_ACTIVO: 'true' });
check('GBP_ACTIVO="true" sí enciende', gbp.activoParaTodos());
check('y con él lo ve cualquiera, tenga o no correo',
  gbp.gbpVisiblePara({ email: 'quien.sea@ejemplo.com' }) && gbp.gbpVisiblePara({}));

// ─────────────────────────────────────────────────────────────────────────────
titulo('3. Las cuentas de prueba');

entorno({ GBP_CUENTAS_PRUEBA: 'dueño@usenotoria.app, Otro@Ejemplo.COM ' });
check('un correo de la lista lo ve', gbp.gbpVisiblePara({ email: 'dueño@usenotoria.app' }));
check('la comparación no distingue mayúsculas', gbp.gbpVisiblePara({ email: 'OTRO@ejemplo.com' }));
check('ni espacios sueltos alrededor', gbp.gbpVisiblePara({ email: '  otro@ejemplo.com  ' }));
check('quien no está en la lista sigue sin verlo',
  !gbp.gbpVisiblePara({ email: 'ajeno@ejemplo.com' }));
check('una lista vacía no deja pasar a nadie',
  (entorno({ GBP_CUENTAS_PRUEBA: '' }), !gbp.gbpVisiblePara({ email: 'a@b.c' })));
check('una lista de solo comas tampoco',
  (entorno({ GBP_CUENTAS_PRUEBA: ',,, ,' }), !gbp.gbpVisiblePara({ email: 'a@b.c' })));

titulo('4. Credenciales: son dos preguntas distintas');

entorno({ GBP_ACTIVO: 'true' });
check('sin GOOGLE_CLIENT_ID/SECRET, `configurado()` es false', !gbp.configurado());
entorno({ GBP_ACTIVO: 'true', GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' });
check('con las dos credenciales, `configurado()` es true', gbp.configurado());
entorno({ GOOGLE_CLIENT_ID: 'x' });
check('con solo una de las dos sigue siendo false', !gbp.configurado());

Object.assign(process.env, ENV_ORIGINAL);

// ─────────────────────────────────────────────────────────────────────────────
titulo('5. El backend usa el interruptor donde tiene que usarlo');

const RAIZ = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

const rutaGbp = leer('src/api/routes/google-business.routes.js');
check('la ruta /iniciar consulta gbpVisiblePara', rutaGbp.includes('gbpVisiblePara'));
// 404 y no 403: no es que le falte un permiso, es que la función no existe para
// él. Un 403 invita a pedirle acceso a alguien que no lo puede dar.
check('y responde 404, no 403', /404/.test(rutaGbp) && !/status\(403\)[\s\S]{0,120}gbp/i.test(rutaGbp));

const rutaRedes = leer('src/api/routes/redes.routes.js');
check('el estado que lee el panel expone `gbp.disponible`',
  /gbp:\s*\{[\s\S]{0,200}disponible/.test(rutaRedes));

// ─────────────────────────────────────────────────────────────────────────────
titulo('6. 🔴 La web ya no promete Google Business');

const WEB = path.join(RAIZ, '..', 'brand-shield-web');
const leerWeb = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const landing = leerWeb('src/app/page.js');
const layout = leerWeb('src/app/layout.js');
const conexiones = leerWeb('src/app/dashboard/conexiones/page.js');

// Las frases exactas que había, en los dos idiomas. Si alguien las devuelve sin
// encender el interruptor, esta prueba es lo único que lo va a decir.
const PROMESAS_RETIRADAS = [
  ['ES · paso 3 del onboarding', 'Conecta Google Business'],
  ['EN · paso 3 del onboarding', 'Connect Google Business'],
  ['ES · «gratis, tardas 1 minuto»', 'gratis, tardas 1 minuto'],
  ['EN · «free, takes 1 minute»', 'free, takes 1 minute'],
  ['ES · «la publicación será directa»', 'la publicación será directa'],
  ['EN · «publishing becomes direct»', 'publishing becomes direct'],
  ['ES · «accede a todo tu historial»', 'accede a todo tu historial'],
];
for (const [donde, frase] of PROMESAS_RETIRADAS) {
  check(`${donde} — retirada del landing`, !landing.includes(frase), `sigue diciendo «${frase}»`);
}

// El JSON-LD es una COPIA aparte del FAQ y va a Google como dato estructurado.
// Ya pasó una vez que se corrigió el visible y el JSON-LD siguió prometiendo una
// detección imposible durante meses.
for (const frase of ['gratis, tardas 1 minuto', 'la publicación será directa', 'Conecta Google Business']) {
  check(`JSON-LD sin «${frase}»`, !layout.includes(frase));
}

check('el panel esconde la fila si el backend no la da por disponible',
  /gbpVisible\s*&&/.test(conexiones) || /est\?\.gbp\?\.disponible/.test(conexiones));
check('pero una cuenta YA conectada nunca se esconde',
  /gbpConectado/.test(conexiones),
  'hay que poder desconectarla y borrar sus datos aunque la función esté apagada');

// ─────────────────────────────────────────────────────────────────────────────
titulo('7. La FICHA de un negocio tampoco lo ofrece');

// 🔴 Esconderlo en Conexiones no bastaba: la ficha de un negocio ofrecía
// conectar Google Business en TRES sitios más, y uno era una tarjeta
// promocional entera («Conecta Google Business y desbloquea todas tus
// reseñas») encima de la lista de reseñas. Se descubrió barriendo el fuente
// DESPUÉS de dar el trabajo por cerrado — esconder una función es un barrido,
// no un cambio en un archivo.
const ficha = fs.readFileSync(path.join(WEB, 'src/app/dashboard/negocios/[id]/page.js'), 'utf8');

check('la ficha consulta al backend si puede ofrecerlo',
  /gbpDisponible/.test(ficha) && /redesApi\.estado/.test(ficha),
  'la regla vive en lib/gbpVisible.js; una copia en el panel se separaría el día que Google conceda cuota');
check('arranca en false y un fallo lo deja en false (falla CERRADO)',
  /useState\(false\)[^\n]*\n?/.test(ficha) && /setGbpDisponible\(false\)/.test(ficha));
check('la tarjeta promocional va gateada',
  /\{gbpDisponible && !gbpConectado &&/.test(ficha));
check('y el botón junto al aviso de respuesta también',
  /\{gbpDisponible && \(\s*\n\s*<button onClick=\{conectarGBP\}/.test(ficha));

// Cada `conectarGBP` que se pueda pulsar tiene que estar detrás del flag. Se
// cuenta en vez de mirar uno: al añadir una superficie nueva, esto lo caza.
const invocaciones = (ficha.match(/onClick=\{conectarGBP\}/g) || []).length;
const gateadas = (ficha.match(/gbpDisponible/g) || []).length;
check(`las ${invocaciones} invocaciones de conectarGBP están cubiertas por el flag`,
  invocaciones > 0 && gateadas >= invocaciones,
  `${invocaciones} botones vs ${gateadas} menciones del flag`);

// Y las frases de pasada que prometían la función sin ofrecer botón.
const layoutPanel = fs.readFileSync(path.join(WEB, 'src/app/dashboard/layout.js'), 'utf8');
const config = fs.readFileSync(path.join(WEB, 'src/app/dashboard/configuracion/page.js'), 'utf8');
check('el aviso de cuenta sin verificar ya no promete Google Business',
  !/conectar Google Business/.test(layoutPanel) && !/connect Google Business/i.test(layoutPanel));
check('ni el de Configuración',
  !/Google Business/.test(config));

// ── Los DOS sitios que este archivo no miraba ─────────────
//
// 🔴 Escrito el 2026-08-26, después de encontrar Google Business todavía a la
// vista en producción **con estas 44 comprobaciones en verde**. No es que
// estuvieran mal: es que miraban los archivos equivocados.
//
//   · Las líneas de arriba que dicen «paso 3 del onboarding» comprueban que la
//     frase se retiró DEL LANDING (`landing.includes(...)`) — nunca abrieron
//     `onboarding/page.js`, donde el paso seguía vivo y era el segundo de tres
//     que veía cada usuario nuevo.
//   · La de `dashboard/layout.js` busca el texto «conectar Google Business»,
//     pero ese texto vive en `components/GBPBanner.js`; el layout solo tiene
//     `<GBPBanner/>`. La comprobación pasaba mientras el banner se pintaba en
//     TODAS las pantallas del panel.
//
// La lección, que ya iba por la tercera vuelta: esconder una función es un
// barrido, y una prueba que lee los archivos que uno recuerda no es un barrido.
const onboarding = leerWeb('src/app/onboarding/page.js');
check('el onboarding ya no tiene el paso de Google Business',
  !/Conecta Google Business|Connect Google Business|conectarGBP/.test(onboarding),
  'era el paso 2 de 3 de todo usuario nuevo, y su botón caía en un 404 JSON');
check('…y quedó renumerado a DOS pasos',
  /const TOTAL = 2;/.test(onboarding) && !/Paso 1 de 3/.test(onboarding),
  'quitar el paso y dejar «Paso 1 de 3» deja al usuario esperando uno que no llega');
check('…sin dejar el contador de progreso en tercios',
  !/paso === 2 \? 66/.test(onboarding));

const banner = leerWeb('src/components/GBPBanner.js');
check('el banner del panel pregunta por `gbp.disponible` antes de pintarse',
  /gbp\?\.disponible|gbp\.disponible/.test(banner),
  '🔴 se monta en dashboard/layout.js: sin gate sale en TODAS las pantallas');
check('…y falla cerrado (solo se pinta si el estado dice que sí)',
  /if \(vigente && estado\?\.gbp\?\.disponible\) setNegocioSinGBP/.test(banner),
  'ante un estado ilegible no puede ofrecer una conexión que quizá no exista');
check('…y manda X-Cuenta en sus consultas',
  /cabecerasAuth\(\)/.test(banner) && !/Authorization: `Bearer \$\{getToken\(\)\}` \}/.test(banner),
  'sin X-Cuenta, quien trabaja en la cuenta de otro ve los negocios de la suya');

// Control: que estas comprobaciones sepan fallar. Sin esto solo se sabría que
// no dan error, no que midan algo — que es exactamente lo que le pasó a las 44
// anteriores durante un día entero.
check('   …y las tres sondas de arriba detectarían una recaída (control)',
  /Conecta Google Business/.test('<h1>Conecta Google Business</h1>')
  && !/gbp\?\.disponible|gbp\.disponible/.test('const sinGBP = data.find(n => n.googlePlaceId);'));

console.log(`\n${'─'.repeat(56)}`);
console.log(`${ok} pasadas · ${fallos} fallidas`);
if (fallos) process.exitCode = 1;
