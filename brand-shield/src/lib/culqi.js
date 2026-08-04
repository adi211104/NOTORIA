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
const crearCliente = async ({ email, nombre, telefono = '999999999' }) => {
  const [first, ...resto] = nombre.split(' ');
  const { data } = await cliente().post('/customers', {
    first_name: first || nombre,
    last_name: resto.join(' ') || '-',
    email,
    address: '-',
    address_city: 'Lima',
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

module.exports = { configurado, crearCliente, crearTarjeta, crearCargo };
