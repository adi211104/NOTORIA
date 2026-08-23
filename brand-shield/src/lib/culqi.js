// brand-shield/src/lib/culqi.js
// Cliente de Culqi (pagos) — cliente + tarjeta guardada (para renovación mensual) + cargos.
//
// ESTADO: preparado, pendiente de llaves de producción/test.
// Cuando lleguen: agregar CULQI_SECRET_KEY (backend) y CULQI_PUBLIC_KEY (frontend) al .env.
// Verificar los nombres de campo contra el sandbox de Culqi antes de cobrar en producción.

const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://api.culqi.com/v2';

const configurado = () => !!process.env.CULQI_SECRET_KEY;

const cliente = () =>
  axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${process.env.CULQI_SECRET_KEY}` },
  });

// Crea el customer de Culqi (requerido para poder guardar una tarjeta reutilizable)
//
// `address` NO es opcional para Culqi: valida que tenga entre 5 y 100 caracteres
// y rechaza el cargo entero con parameter_error si no. El "-" que había acá antes
// hacía fallar toda alta de suscripción. No pedimos dirección al suscribirse, así
// que se usa la fiscal cuando el usuario ya la cargó y un texto válido si no.
// Culqi valida TODOS estos campos y devuelve `parameter_error` si no le gustan.
// Los "-" que había aquí como relleno hacían fallar el alta entera:
//   • `address: '-'` → exige entre 5 y 100 caracteres.
//   • `last_name: '-'` → lo rechaza por inválido. Le pasaba a cualquiera
//     registrado con un nombre de UNA SOLA palabra ("giorrnell"), que es
//     completamente normal: se quedaba sin poder pagar y con un mensaje
//     genérico que no explicaba nada.
// Regla: no mandar rellenos de un carácter. Si falta el dato, un texto legible.
const DIRECCION_POR_DEFECTO = 'Direccion no especificada';
const APELLIDO_POR_DEFECTO = 'No indicado';

const crearCliente = async ({ email, nombre, telefono = '999999999', direccion, ciudad }) => {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
  const first = partes[0] || 'Cliente';
  const apellido = partes.slice(1).join(' ');
  const dir = (direccion || '').trim();
  const { data } = await cliente().post('/customers', {
    first_name: first.slice(0, 50),
    last_name: (apellido || APELLIDO_POR_DEFECTO).slice(0, 50),
    email,
    address: dir.length >= 5 ? dir.slice(0, 100) : DIRECCION_POR_DEFECTO,
    address_city: (ciudad || '').trim() || 'Lima',
    country_code: 'PE',
    phone_number: telefono,
  });
  return data;
};

// Busca un customer ya existente por correo. Culqi devuelve { data: [...] }.
const buscarClientePorEmail = async (email) => {
  const { data } = await cliente().get('/customers', { params: { email } });
  const lista = data?.data || [];
  return lista.find(c => (c.email || '').toLowerCase() === email.toLowerCase()) || null;
};

// Lo que debe usarse al suscribir: Culqi RECHAZA crear dos customers con el
// mismo correo ("Un cliente está registrado actualmente con este email").
//
// Como el customer vive en Culqi y no en nuestra base, basta con que alguien
// intente suscribirse una segunda vez —tras cancelar, tras un cobro fallido, o
// al cambiar de plan— para que el alta reviente y esa persona no pueda volver a
// pagar nunca. Por eso se reutiliza el existente en vez de insistir en crearlo.
//
// La búsqueda se intenta ante CUALQUIER fallo del create, no solo el de correo
// duplicado: si no aparece ningún customer se relanza el error original, así
// que no depende de que Culqi mantenga el texto del mensaje ni el nombre del
// campo para seguir funcionando.
const obtenerOCrearCliente = async (datos) => {
  try {
    return await crearCliente(datos);
  } catch (error) {
    let existente = null;
    try { existente = await buscarClientePorEmail(datos.email); } catch { /* sin rescate */ }
    if (!existente) throw error;
    return existente;
  }
};

// Convierte el token de un solo uso (del widget de Checkout) en una tarjeta guardada
const crearTarjeta = async ({ customerId, tokenId }) => {
  const { data } = await cliente().post('/cards', {
    customer_id: customerId,
    token_id: tokenId,
  });
  return data;
};

// Cobra usando una tarjeta guardada (source_id = id de la tarjeta creada arriba)
const crearCargo = async ({ monto, moneda = 'PEN', email, sourceId, descripcion }) => {
  const { data } = await cliente().post('/charges', {
    amount: monto, // en céntimos
    currency_code: moneda,
    email,
    source_id: sourceId,
    description: descripcion,
  });
  return data;
};

// Extrae los datos de tarjeta que guarda Facturación (Pago.tarjetaInicio /
// Pago.tarjetaMarca) de la respuesta de un cargo.
//
// Culqi devuelve DOS formas distintas según con qué se cobró:
//   • cargo con token de un solo uso → cargo.source es el token:
//       source.card_number / source.iin.card_brand
//   • cargo con tarjeta guardada (lo que hacemos nosotros, crd_...) →
//     cargo.source es la tarjeta y el token queda anidado:
//       source.source.card_number / source.source.iin.card_brand
//
// El código leía solo la primera forma, así que en producción TODO cobro real
// habría guardado tarjetaInicio y tarjetaMarca en null, en silencio. Se
// contemplan las dos formas para no depender de con qué se cobró.
const datosTarjeta = (cargo) => {
  const source = cargo?.source;
  const tarjeta = source?.source || source; // tarjeta guardada vs token directo
  const numero = tarjeta?.card_number;
  return {
    inicio: numero ? String(numero).slice(0, 4) : null,
    marca: tarjeta?.iin?.card_brand || null,
  };
};

// Huella estable de una tarjeta, para atar la promo de bienvenida al medio de
// pago y no solo a la cuenta (ver modelo PromoTarjeta).
//
// Culqi no expone un "fingerprint" de tarjeta, así que se compone con lo único
// estable que sí devuelve: BIN (primeros 6) + últimos 4. Se guarda como HMAC
// para que la tabla no contenga datos de tarjeta en claro.
//
// Acepta tanto el objeto tarjeta (POST /cards) como un cargo, porque en ambos
// los datos viven en `.source` — en el cargo con tarjeta guardada, anidados.
//
// ⚠️ Limitación conocida: dos tarjetas distintas con el mismo BIN y los mismos
// 4 últimos dígitos comparten huella. Es poco probable, y el efecto de una
// colisión es que al segundo cliente no se le aplique el descuento (nunca un
// cobro incorrecto), así que se prefiere ese falso negativo a dejar la promo
// abierta a repetición.
const huellaTarjeta = (objeto) => {
  const source = objeto?.source;
  const tarjeta = source?.source || source;
  const bin = tarjeta?.iin?.bin;
  const last4 = tarjeta?.last_four || (tarjeta?.card_number ? String(tarjeta.card_number).slice(-4) : null);
  if (!bin || !last4) return null;

  // Sin secreto no se puede garantizar la protección del hash. Se prefiere
  // fallar y no aplicar la promo antes que guardar una huella débil.
  const secreto = process.env.PROMO_HASH_SECRET || process.env.JWT_SECRET;
  if (!secreto) return null;

  return crypto.createHmac('sha256', secreto).update(`${bin}|${last4}`).digest('hex');
};

// Reembolso de un cargo.
//
// 🔴 Devolver el dinero NO anula el comprobante ante SUNAT. Son dos sistemas
// independientes: Culqi devuelve el importe y la boleta o factura sigue emitida
// y declarada. Anularla es un trámite aparte —resumen diario en estado 3 para
// boletas, comunicación de baja para facturas— y tiene su propio plazo. Quien
// llame a esto tiene que ocuparse también de eso, o quedará declarada una venta
// cuyo dinero se devolvió.
//
// ⚠️ El importe es OBLIGATORIO y va en CÉNTIMOS. La documentación deja entender
// que omitirlo devuelve el cargo entero, y no: Culqi responde «No existe el
// monto que intentas devolver o no está definido», un mensaje que suena a que
// el cargo no existe cuando lo que falta es el campo.
//
// ⚠️ `reason` es un enum de Culqi, no texto libre: solicitud_comprador,
// expiracion_solicitud, aceptacion_incorrecta o duplicidad. Cualquier otra cosa
// se rechaza con parameter_error.
const reembolsar = async ({ cargoId, monto, motivo = 'solicitud_comprador' }) => {
  if (!monto) throw new Error('reembolsar: falta `monto` (en céntimos). Culqi lo exige.');
  const { data } = await cliente().post('/refunds', {
    charge_id: cargoId,
    amount: monto,
    reason: motivo,
  });
  return data;
};

module.exports = {
  configurado, crearCliente, obtenerOCrearCliente, buscarClientePorEmail,
  crearTarjeta, crearCargo, datosTarjeta, huellaTarjeta, reembolsar,
};
