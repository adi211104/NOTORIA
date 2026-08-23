// brand-shield/scripts/sonda-sunat-produccion.js
//
// ¿Autentica de verdad contra SUNAT PRODUCCIÓN? Sin gastar correlativo, sin
// emitir nada y sin cobrar un sol.
//
// 🔴 POR QUÉ EXISTE. Todo el circuito de comprobantes se validó contra
// `e-beta.sunat.gob.pe` y pasa con código 0, pero **nunca se ha mandado nada al
// endpoint de producción**. Ese es el riesgo real del primer cobro: si las
// credenciales SOL o el certificado no valen en producción, el fallo aparecería
// DESPUÉS de haberle cobrado a alguien, con el cliente pagado y sin documento.
//
// La sonda separa esas dos cosas. `getStatus` es una consulta de solo lectura:
// no crea, no numera y no consume nada. Preguntando por un ticket inventado,
// SUNAT tiene que contestar «ese ticket no existe» — y para poder contestar eso
// primero ha tenido que **aceptar las credenciales**. Ese es todo el truco.
//
// ── El control, sin el cual esto mentiría ────────────────────────────────────
//
// Un verificador que solo mira «¿respondió?» no distingue autenticar de fallar:
// las dos cosas devuelven un SOAP Fault. Por eso la sonda repite la MISMA
// llamada con una clave deliberadamente incorrecta. Si los dos casos dan el
// mismo error, el método no distingue nada y el veredicto correcto es «no
// concluyente», nunca «funciona». Es la lección de `verificar-meta-secret.js`.
//
// Uso (necesita las variables de producción, que no están en el .env local):
//   railway run --service api node scripts/sonda-sunat-produccion.js

const billService = require('../src/sunat/billService');
const certificado = require('../src/sunat/certificado');

// Código de SUNAT para credenciales inválidas. Es el que NO queremos ver.
const CLAVE_INVALIDA = /0102|Usuario o contrase|no autorizado|Unauthorized/i;

const llamar = async (ticket) => {
  try {
    const r = await billService.consultarTicket({ ticket });
    return { ok: true, respuesta: JSON.stringify(r).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: (e.message || String(e)).slice(0, 300) };
  }
};

(async () => {
  console.log('═══ SONDA SUNAT PRODUCCIÓN (solo lectura) ═══\n');

  console.log(`SUNAT_ENTORNO      : ${process.env.SUNAT_ENTORNO || '(sin poner → beta)'}`);
  console.log(`endpoint efectivo  : ${billService.endpoint()}`);
  console.log(`entorno efectivo   : ${billService.entorno()}`);
  console.log(`credenciales SOL   : ${billService.configurado() ? 'presentes' : '❌ FALTAN'}`);
  console.log(`emisión activa     : ${process.env.SUNAT_EMISION_ACTIVA === 'true' ? 'sí' : 'NO'}`);

  if (billService.entorno() !== 'produccion') {
    console.log('\n⚠️  El entorno efectivo NO es producción. Esta sonda no prueba lo que dice probar.');
    console.log('    Correr con `railway run --service api`, que inyecta SUNAT_ENTORNO=produccion.');
    process.exitCode = 1;
    return;
  }

  // ── 1. El certificado se abre de verdad ─────────────────
  //
  // ⚠️ `certificado.configurado()` devuelve true con solo el base64 cargado,
  // AUNQUE falte la contraseña. No sirve como prueba: hay que descifrarlo.
  console.log('\n── 1. Certificado ──');
  try {
    // `cargar()` es SÍNCRONA y devuelve el certificado ya descifrado.
    const c = certificado.cargar();
    const hasta = c.validoHasta;
    console.log(`✅ Se abre y descifra. Emisor: ${c.issuerName || '(sin nombre)'}`);
    console.log(`   Válido hasta: ${hasta ? new Date(hasta).toISOString().slice(0, 10) : '(no legible)'}`);
    if (hasta && new Date(hasta) < new Date()) { console.log('❌ CERTIFICADO VENCIDO'); process.exitCode = 1; return; }
  } catch (e) {
    console.log(`❌ No se pudo abrir: ${e.message}`);
    console.log('   Sin esto no hay firma posible y ningún comprobante saldría.');
    process.exitCode = 1;
    return;
  }

  // ── 2. Autenticación ────────────────────────────────────
  console.log('\n── 2. Autenticación contra el endpoint de producción ──');
  // ⚠️ El ticket tiene que ser NUMÉRICO. Con uno alfanumérico SUNAT responde
  // HTTP 200 con el cuerpo VACÍO —ni Fault, ni statusCode, ni content—, y la
  // sonda daba «no concluyente» culpando al método cuando el problema era el
  // formato del dato. Un ticket real tiene la forma AAAAMMDD + correlativo.
  const ticketFalso = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}0000001`;
  const real = await llamar(ticketFalso);
  console.log(`respuesta con las credenciales REALES:\n   ${real.ok ? real.respuesta : real.error}`);

  // ── 3. El control ───────────────────────────────────────
  console.log('\n── 3. Control: la MISMA llamada con una clave inventada ──');
  const claveBuena = process.env.SUNAT_SOL_CLAVE;
  process.env.SUNAT_SOL_CLAVE = 'clave-que-no-existe-000';
  const falso = await llamar(ticketFalso);
  process.env.SUNAT_SOL_CLAVE = claveBuena;
  console.log(`respuesta con clave INVENTADA:\n   ${falso.ok ? falso.respuesta : falso.error}`);

  // ── Veredicto ───────────────────────────────────────────
  console.log('\n── Veredicto ──');
  const textoReal = real.ok ? real.respuesta : real.error;
  const textoFalso = falso.ok ? falso.respuesta : falso.error;

  const realRechazada = CLAVE_INVALIDA.test(textoReal);
  const falsaRechazada = CLAVE_INVALIDA.test(textoFalso);

  // ⚠️ El orden importa. Si SUNAT dice literalmente «usuario o contraseña
  // incorrectos» sobre las credenciales REALES, eso ya es concluyente: da igual
  // qué conteste el control, porque para poder emitir ese error SUNAT tuvo que
  // mirarlas y rechazarlas. Comprobar primero la igualdad de las dos respuestas
  // enterraba el hallazgo bajo un «no concluyente» que sonaba a problema del
  // método — y el problema era de las credenciales.
  if (realRechazada) {
    console.log('❌ SUNAT RECHAZA las credenciales reales (0102).');
    console.log('   El primer comprobante de verdad sería rechazado. NO cobrar hasta arreglarlo.');
    console.log('   Qué revisar, en la Clave SOL del RUC → Administración de usuarios secundarios:');
    console.log('     · que el usuario SOL secundario EXISTA y esté activo');
    console.log('     · que tenga marcado el perfil de comprobantes de pago electrónicos');
    console.log('     · su contraseña (SUNAT las caduca)');
    console.log('   Y que SUNAT_SOL_USUARIO sea SOLO el usuario, sin el RUC delante:');
    console.log('   el código ya compone `RUC + usuario`, y ponerlo dos veces da este mismo 0102.');
    process.exitCode = 1;
    return;
  }

  if (textoReal === textoFalso) {
    console.log('⚠️  NO CONCLUYENTE: la clave buena y la inventada dan exactamente lo mismo,');
    console.log('    y ninguna es un error de credenciales. El método no distingue: no prueba nada.');
    process.exitCode = 1;
    return;
  }

  if (falsaRechazada) {
    console.log('✅ AUTENTICA. La clave real pasa y la inventada es rechazada: el método distingue,');
    console.log('   así que el resultado significa algo. El endpoint de producción responde y');
    console.log('   acepta nuestras credenciales SOL.');
    console.log('   ⚠️ Lo que esto NO prueba: que un comprobante concreto sea aceptado. Eso solo');
    console.log('      lo dice un envío real, que sí gasta correlativo.');
  } else {
    console.log('⚠️  Las dos respuestas difieren pero ninguna encaja con "credenciales inválidas".');
    console.log('    Leer los dos textos de arriba antes de concluir nada.');
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
