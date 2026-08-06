// brand-shield/src/lib/culqi.js
// Cliente de Culqi (pagos) — cliente + tarjeta guardada (para renovación mensual) + cargos.
//
// ESTADO: preparado, pendiente de llaves de producción/test.
// Cuando lleguen: agregar CULQI_SECRET_KEY (backend) y CULQI_PUBLIC_KEY (frontend) al .env.
// Verificar los nombres de campo contra el sandbox de Culqi antes de cobrar en producción.

const axios = require('axios');

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
const DIRECCION_POR_DEFECTO = 'Direccion no especificada';

const crearCliente = async ({ email, nombre, telefono = '999999999', direccion, ciudad }) => {
  const [first, ...resto] = nombre.split(' ');
  const dir = (direccion || '').trim();
  const { data } = await cliente().post('/customers', {
    first_name: first || nombre,
    last_name: resto.join(' ') || '-',
    email,
    address: dir.length >= 5 ? dir.slice(0, 100) : DIRECCION_POR_DEFECTO,
    address_city: (ciudad || '').trim() || 'Lima',
    country_code: 'PE',
    phone_number: telefono,
  });
  return data;
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

module.exports = { configurado, crearCliente, crearTarjeta, crearCargo, datosTarjeta };
