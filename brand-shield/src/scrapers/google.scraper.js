const axios = require('axios');
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

const obtenerResenasGoogle = async (placeId) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'reviews,rating,user_ratings_total',
        key: process.env.GOOGLE_PLACES_API_KEY,
        language: 'es',
        reviews_sort: 'newest',
      },
    });
    if (data.status !== 'OK') return null;
    const resultado = data.result;
    const resenas = (resultado.reviews || []).map((r) => ({
      externalId: `google_${r.time}_${r.author_url?.split('/').pop() || 'anon'}`,
      rating: r.rating,
      texto: r.text || '',
      autorNombre: r.author_name || 'Anónimo',
      autorFoto: r.profile_photo_url || null,
      autorResenasTotal: null,
      fechaResena: new Date(r.time * 1000),
    }));
    return {
      ratingActual: resultado.rating || 0,
      totalResenas: resultado.user_ratings_total || 0,
      resenas,
    };
  } catch (error) {
    console.error(`[Google] Error obteniendo reseñas: ${error.message}`);
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
  obtenerUbicacionNegocio,
  buscarCompetidoresCercanos,
};
