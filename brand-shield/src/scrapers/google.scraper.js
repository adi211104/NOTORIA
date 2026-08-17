const axios = require('axios');
const { CAMPOS_CONTACTO } = require('../lib/fichaGoogle');
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

const buscarNegocioEnGoogle = async (placeId) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'name,rating,user_ratings_total,formatted_address',
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
      },
    });
    if (data.status !== 'OK') return null;
    return {
      nombre: data.result.name,
      rating: data.result.rating || 0,
      totalResenas: data.result.user_ratings_total || 0,
      direccion: data.result.formatted_address || null,
    };
  } catch (error) {
    console.error(`[Google] Error: ${error.message}`);
    return null;
  }
};

// Convierte el array `reviews` de Places al formato interno
const mapearResenas = (reviews) => (reviews || []).map((r) => ({
  externalId: `google_${r.time}_${r.author_url?.split('/').pop() || 'anon'}`,
  rating: r.rating,
  texto: r.text || '',
  autorNombre: r.author_name || 'Anónimo',
  autorFoto: r.profile_photo_url || null,
  // Places no devuelve el historial del autor. Se deja explícito porque de este
  // null depende que la señal `cuenta_nueva` del detector no pueda dispararse.
  autorResenasTotal: null,
  fechaResena: new Date(r.time * 1000),
}));

// `conContacto` añade teléfono, horario y dirección a la consulta.
//
// ⚠️ Ese es el ÚNICO parámetro de esta función que cuesta dinero:
// `formatted_phone_number` y `opening_hours` son del grupo **Contact Data**, que
// Places factura aparte del Basic que la llamada ya paga. Por eso lo decide el
// worker según el plan del dueño (ver lib/fichaGoogle.js) y no está encendido por
// defecto: activarlo para todos multiplicaría la factura del plan Gratis, que ya
// se arregló una vez por lo mismo.
const obtenerResenasGoogle = async (placeId, { conContacto = false } = {}) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        // `business_status` y `name` van en el grupo Basic Data, que esta
        // llamada YA está pagando por pedir `reviews`/`rating`: añadirlos no
        // cambia la factura.
        fields: 'reviews,rating,user_ratings_total,business_status,name'
          + (conContacto ? `,${CAMPOS_CONTACTO}` : ''),
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
        reviews_sort: 'newest',
      },
    });
    if (data.status !== 'OK') return null;
    const resultado = data.result;
    return {
      ratingActual: resultado.rating || 0,
      totalResenas: resultado.user_ratings_total || 0,
      resenas: mapearResenas(resultado.reviews),
      // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
      estadoNegocio: resultado.business_status || null,
      nombreEnGoogle: resultado.name || null,
      // El resultado crudo, para que la vigilancia de datos de ficha compare sin
      // que este scraper tenga que conocer sus campos. Solo viaja si se pidió.
      crudo: conContacto ? resultado : null,
    };
  } catch (error) {
    console.error(`[Google] Error obteniendo reseñas: ${error.message}`);
    return null;
  }
};

// ── El espejo: las reseñas que Google le enseña a un desconocido ──
//
// `obtenerResenasGoogle` pide `reviews_sort: 'newest'`, que es lo correcto para
// vigilar: queremos lo último que entró. Pero NO es lo que ve un cliente: por
// defecto Google ordena por relevancia, y a alguien que busca el negocio le
// muestra otras cinco reseñas, que pueden ser de hace meses.
//
// Esa diferencia es información que el dueño no tiene por ningún otro medio.
// Lleva meses respondiendo lo más reciente mientras la ficha que ve un cliente
// nuevo la encabeza una queja de hace ocho meses que nadie contestó.
//
// Es una llamada aparte porque `reviews_sort` no admite pedir los dos órdenes a
// la vez. Se usa a demanda desde el panel, no en cada ciclo del worker.
const obtenerResenasVisibles = async (placeId) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'reviews,rating,user_ratings_total',
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
        // Sin `reviews_sort` → Google usa most_relevant, que es lo que ve el público
      },
    });
    if (data.status !== 'OK') return null;
    return {
      ratingActual: data.result.rating || 0,
      totalResenas: data.result.user_ratings_total || 0,
      resenas: mapearResenas(data.result.reviews),
    };
  } catch (error) {
    console.error(`[Google] Error obteniendo reseñas visibles: ${error.message}`);
    return null;
  }
};

// Mapeo de TipoNegocio (enum Prisma) al `type` que espera Google Places
const TIPO_A_GOOGLE = {
  RESTAURANTE: 'restaurant',
  BAR: 'bar',
  CAFETERIA: 'cafe',
  HOTEL: 'lodging',
  PELUQUERIA: 'hair_care',
  SPA: 'spa',
  GIMNASIO: 'gym',
  CLINICA: 'hospital',
  TIENDA: 'store',
  INMOBILIARIA: 'real_estate_agency',
  TALLER: 'car_repair',
  OTRO: 'establishment',
};

const obtenerUbicacionNegocio = async (placeId) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'geometry',
        key: process.env.GOOGLE_PLACES_API_KEY,
      },
    });
    if (data.status !== 'OK') return null;
    const loc = data.result.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch (error) {
    console.error(`[Google] Error obteniendo ubicación: ${error.message}`);
    return null;
  }
};

// Busca hasta 3 competidores cercanos (2km, mismo tipo de negocio) vía Nearby Search —
// usado por la comparación automática exclusiva del plan Franquicia
const buscarCompetidoresCercanos = async ({ lat, lng, tipo, placeIdExcluir }) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/nearbysearch/json`, {
      params: {
        location: `${lat},${lng}`,
        radius: 2000,
        type: TIPO_A_GOOGLE[tipo] || 'establishment',
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
      },
    });
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return null;

    return (data.results || [])
      .filter((r) => r.place_id !== placeIdExcluir && r.business_status !== 'CLOSED_PERMANENTLY')
      .sort((a, b) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0))
      .slice(0, 3)
      .map((r) => ({
        nombre: r.name,
        googlePlaceId: r.place_id,
        rating: r.rating || 0,
        totalResenas: r.user_ratings_total || 0,
      }));
  } catch (error) {
    console.error(`[Google] Error en Nearby Search: ${error.message}`);
    return null;
  }
};

module.exports = {
  buscarNegocioEnGoogle,
  obtenerResenasGoogle,
  obtenerResenasVisibles,
  obtenerUbicacionNegocio,
  buscarCompetidoresCercanos,
};
