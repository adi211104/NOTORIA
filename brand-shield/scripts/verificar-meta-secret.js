// brand-shield/scripts/verificar-meta-secret.js
// Comprueba que META_APP_SECRET (y el de Instagram) son los que Meta espera,
// SIN imprimir ninguno de los dos.
//
//   railway run --service api node scripts/verificar-meta-secret.js
//
// POR QUE NO BASTA MIRAR LA VARIABLE. Que este puesta y mida 32 caracteres no
// dice nada sobre si Meta la reconoce: un secreto rotado en el panel y no
// recargado aqui tiene exactamente la misma pinta que uno correcto. La unica
// prueba real es pedirle a Meta un app access token con client_credentials, que
// es gratis, no consume cuota de usuario y no autoriza nada: si el secreto no
// es el bueno, Meta responde error 190 en vez de emitirlo.
//
// Se imprime solo el veredicto. El token que devuelve Meta tambien es una
// credencial, asi que tampoco se muestra.

// 🔴 SIN LLAMADA DE CONTROL, ESTE SCRIPT MIENTE. La primera version daba
// «Meta lo RECHAZA» para META_IG_APP_SECRET, y era falso: repitiendo la consulta
// con un secreto INVENTADO, Meta devolvia exactamente el mismo error 101
// («Cannot get application info due to a system error»). Es decir, ese flujo no
// discrimina nada para la app de Instagram — no llega a mirar el secreto.
//
// Un verificador que da falsos negativos es peor que no tener ninguno: manda a
// rotar credenciales que estaban bien. Asi que ante un fallo se pregunta primero
// si el metodo distingue: si el secreto falso produce el MISMO error, el
// veredicto es «no concluyente», no «rechazado».
const SECRETO_DE_CONTROL = '0000000000000000000000000000ffff';

const pedirToken = async (appId, secreto) => {
  const url = 'https://graph.facebook.com/oauth/access_token'
    + '?client_id=' + encodeURIComponent(appId)
    + '&client_secret=' + encodeURIComponent(secreto)
    + '&grant_type=client_credentials';
  const res = await fetch(url);
  const cuerpo = await res.json();
  return {
    ok: Boolean(cuerpo.access_token),
    code: cuerpo.error?.code ?? null,
    mensaje: cuerpo.error?.message || null,
  };
};

const comprobar = async (etiqueta, appId, secreto) => {
  if (!appId || !secreto) {
    console.log(`${etiqueta.padEnd(22)} NO CONFIGURADO (falta el id o el secreto)`);
    return false;
  }

  // Avisos de forma antes de gastar la llamada: son los fallos que se ven
  // igual que un secreto revocado (BOM invisible, salto de linea pegado).
  const limpio = secreto.trim();
  if (limpio !== secreto) {
    console.log(`${etiqueta.padEnd(22)} ⚠️  trae espacios o saltos en los extremos`);
  }
  if (/[^\x20-\x7E]/.test(secreto)) {
    console.log(`${etiqueta.padEnd(22)} ⚠️  trae caracteres no imprimibles (BOM?)`);
  }

  try {
    const real = await pedirToken(appId, secreto);
    if (real.ok) {
      console.log(`${etiqueta.padEnd(22)} ✅ Meta lo reconoce (${secreto.length} caracteres)`);
      return true;
    }

    // Fallo: ¿es el secreto, o este metodo no sirve para esta app?
    const control = await pedirToken(appId, SECRETO_DE_CONTROL);
    if (control.code === real.code) {
      console.log(`${etiqueta.padEnd(22)} ⚪ NO CONCLUYENTE — un secreto inventado da el mismo`);
      console.log(`${' '.repeat(22)}    error ${real.code}, asi que la consulta no llega a mirarlo.`);
      console.log(`${' '.repeat(22)}    (${real.mensaje})`);
      return null; // ni valido ni rechazado: no se sabe
    }

    console.log(`${etiqueta.padEnd(22)} ❌ Meta lo RECHAZA — ${real.mensaje}`);
    return false;
  } catch (e) {
    console.log(`${etiqueta.padEnd(22)} ⚠️  no se pudo consultar: ${e.message}`);
    return null;
  }
};

(async () => {
  console.log('Comprobando los secretos de Meta contra la Graph API...\n');

  const principal = await comprobar(
    'META_APP_SECRET', process.env.META_APP_ID, process.env.META_APP_SECRET,
  );

  // La app de Instagram (1305555994987658) tiene su PROPIO secreto, y es con ese
  // con el que Meta firma los webhooks de comentarios — confirmado en vivo. Por
  // eso el webhook acepta los dos: con solo el principal, los comentarios reales
  // se descartarian en silencio.
  const idInstagram = process.env.META_IG_APP_ID || '1305555994987658';
  const instagram = await comprobar(
    'META_IG_APP_SECRET', idInstagram, process.env.META_IG_APP_SECRET,
  );

  console.log('');
  if (principal === false) {
    console.log('🔴 El OAuth de Facebook/Instagram NO va a funcionar con este secreto.');
    console.log('   Si acabas de rotarlo en el panel, recargalo en Railway:');
    console.log('   bash scripts/cargar-secreto.sh META_APP_SECRET 32');
  } else if (principal) {
    console.log('META_APP_SECRET es el bueno: el OAuth funciona.');
  }

  if (instagram === null) {
    console.log('');
    console.log('Sobre META_IG_APP_SECRET: este flujo no puede validarlo, y no hay otro que');
    console.log('lo haga sin un evento real. La unica prueba de que es el correcto es que');
    console.log('LLEGUE un comentario de Instagram y el webhook no lo descarte por firma');
    console.log('— y eso no pasara hasta que Meta apruebe el App Review. Mientras tanto,');
    console.log('no tocarlo: rotarlo "por si acaso" es la forma segura de romperlo.');
  }

  // Solo un rechazo comprobado es motivo de fallo. Un «no concluyente» no puede
  // tumbar el script, o acabaria mandando a rotar credenciales sanas.
  process.exit(principal === false ? 1 : 0);
})();
