// Prueba de src/lib/whatsappMeta.js sin gastar credenciales reales.
//
// Verifica lo que rompe en producción y no se ve hasta que Meta rechaza:
// normalización del teléfono, saneado del parámetro de plantilla y forma exacta
// del cuerpo que se le manda al Graph API.
//
// Con credenciales reales en el .env se puede hacer un envío de verdad:
//   node scripts/prueba-whatsapp-meta.js +51999999999

const assert = require('assert');
const path = require('path');

// Interceptamos axios antes de cargar el módulo para capturar el POST sin salir
// a la red. Es la única forma de comprobar el cuerpo del request tal cual viaja.
const axios = require('axios');
let ultimoRequest = null;
axios.post = async (url, cuerpo, opciones) => {
  ultimoRequest = { url, cuerpo, opciones };
  return { data: { messages: [{ id: 'wamid.PRUEBA' }] } };
};

process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';
process.env.META_WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
delete process.env.META_WHATSAPP_TEXTO_LIBRE;

const whatsapp = require(path.join(__dirname, '..', 'src', 'lib', 'whatsappMeta'));

let fallos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log(`  ok  ${nombre}`); }
  catch (e) { fallos++; console.error(`  FALLA  ${nombre}\n        ${e.message}`); }
};

console.log('\nNormalización de teléfono');
prueba('quita +, espacios y guiones', () => {
  assert.strictEqual(whatsapp.normalizarTelefono('+51 999-999-999'), '51999999999');
});
prueba('un número ya limpio no cambia', () => {
  assert.strictEqual(whatsapp.normalizarTelefono('51999999999'), '51999999999');
});
prueba('entrada vacía o nula da cadena vacía', () => {
  assert.strictEqual(whatsapp.normalizarTelefono(null), '');
  assert.strictEqual(whatsapp.normalizarTelefono(undefined), '');
});

console.log('\nSaneado del parámetro de plantilla');
prueba('aplana saltos de línea (Meta los rechaza con 132000)', () => {
  assert.strictEqual(whatsapp.limpiarParametro('linea uno\nlinea dos'), 'linea uno linea dos');
});
prueba('colapsa espacios seguidos', () => {
  assert.strictEqual(whatsapp.limpiarParametro('hola     mundo'), 'hola mundo');
});
prueba('trunca a 1024 caracteres', () => {
  assert.strictEqual(whatsapp.limpiarParametro('x'.repeat(2000)).length, 1024);
});

console.log('\nCuerpo del request al Graph API');

(async () => {
  await whatsapp.enviarWhatsApp({ to: '+51 999 888 777', mensaje: 'Reseña de 1★\nsin responder' });

  prueba('usa el phone number id en la URL', () => {
    assert.ok(ultimoRequest.url.includes('/123456789/messages'), ultimoRequest.url);
  });
  prueba('manda el token como Bearer', () => {
    assert.strictEqual(ultimoRequest.opciones.headers.Authorization, 'Bearer token-de-prueba');
  });
  prueba('tipo template (no text) por la ventana de 24 h', () => {
    assert.strictEqual(ultimoRequest.cuerpo.type, 'template');
  });
  prueba('teléfono normalizado en el destino', () => {
    assert.strictEqual(ultimoRequest.cuerpo.to, '51999888777');
  });
  prueba('el parámetro del cuerpo va sin saltos de línea', () => {
    const p = ultimoRequest.cuerpo.template.components[0].parameters[0].text;
    assert.ok(!/[\r\n]/.test(p), `quedó un salto: ${JSON.stringify(p)}`);
  });

  process.env.META_WHATSAPP_TEXTO_LIBRE = 'true';
  await whatsapp.enviarWhatsApp({ to: '+51999888777', mensaje: 'prueba' });
  prueba('META_WHATSAPP_TEXTO_LIBRE=true cambia a texto plano', () => {
    assert.strictEqual(ultimoRequest.cuerpo.type, 'text');
  });
  delete process.env.META_WHATSAPP_TEXTO_LIBRE;

  console.log('\nGuardas');
  prueba('configurado() es false sin credenciales', () => {
    const phone = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const r = whatsapp.configurado();
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = phone;
    assert.strictEqual(r, false);
  });
  await assert.rejects(
    () => whatsapp.enviarWhatsApp({ to: '', mensaje: 'x' }),
    /Tel.fono de destino/,
  ).then(
    () => console.log('  ok  rechaza un teléfono vacío'),
    (e) => { fallos++; console.error(`  FALLA  teléfono vacío\n        ${e.message}`); },
  );

  console.log(fallos === 0 ? '\nTodo OK\n' : `\n${fallos} prueba(s) fallaron\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
