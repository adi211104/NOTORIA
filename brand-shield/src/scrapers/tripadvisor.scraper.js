// brand-shield/src/scrapers/tripadvisor.scraper.js
// Rating y reseñas de TripAdvisor vía TripAdvisor Content API.
//
// ESTADO: preparado, pendiente de API key de TripAdvisor. No se llama desde
// ningún cron ni ruta todavía — es la base para activarlo más adelante sin
// tener que rediseñar nada (mismo patrón que instagram.scraper.js/tiktok.scraper.js).
//
// A diferencia de Instagram/Facebook, TripAdvisor NO usa OAuth por negocio:
// la Content API se consulta con una sola API key propia de Notoria (como
// Google Places), buscando el `locationId` público del negocio una vez y
// guardándolo en Negocio.tripadvisorLocationId.
//
// Cuando llegue la key:
//  1. Agregar TRIPADVISOR_API_KEY al .env
//  2. Exponer un paso de "conectar TripAdvisor" (buscar por nombre + país,
//     igual que la búsqueda de Google Maps en el onboarding) que guarde
//     tripadvisorLocationId en el negocio
//  3. Sumar 'TRIPADVISOR' al enum Plataforma ya está hecho en el schema —
//     falta llamar a estas funciones desde monitoreo.worker.js
//
// Documentación: https://tripadvisor-content-api.readme.io/reference

const axios = require('axios');

const BASE_URL = 'https://api.content.tripadvisor.com/api/v1';

const configurado = () => !!process.env.TRIPADVISOR_API_KEY;

// TripAdvisor solo tiene categorías para hospedaje/gastronomía/atracciones —
// el resto de tipos de negocio de Notoria (peluquería, gimnasio, clínica...)
// no existen en su catálogo, así que no tiene sentido buscarlos ahí.
const CATEGORIA_POR_TIPO = {
  RESTAURANTE: 'restaurants',
  BAR: 'restaurants',
  CAFETERIA: 'restaurants',
  HOTEL: 'hotels',
};

const categoriaTripAdvisor = (tipoNegocio) => CATEGORIA_POR_TIPO[tipoNegocio] || null;

/**
 * Busca el negocio en TripAdvisor por nombre para obtener su locationId.
 * Devuelve [{ locationId, nombre, direccion }] o null si no está configurado
 * o el tipo de negocio no aplica (ver CATEGORIA_POR_TIPO).
 */
const buscarUbicacionTripAdvisor = async (nombre, tipoNegocio, pais) => {
  const categoria = categoriaTripAdvisor(tipoNegocio);
  if (!configurado() || !categoria) return null;
  try {
    const { data } = await axios.get(`${BASE_URL}/location/search`, {
      params: {
        key: process.env.TRIPADVISOR_API_KEY,
        searchQuery: nombre,
        category: categoria,
        ...(pais ? { addressobj: pais } : {}),
        language: 'es',
      },
    });
    return (data.data || []).map((loc) => ({
      locationId: loc.location_id,
      nombre: loc.name,
      direccion: loc.address_obj?.address_string || null,
    }));
  } catch (error) {
    console.error(`[TripAdvisor] Error buscando ubicación: ${error.response?.data?.message || error.message}`);
    return null;
  }
};

/**
 * Rating general y total de reseñas de un locationId ya conectado.
 */
const obtenerRatingTripAdvisor = async (locationId) => {
  if (!configurado() || !locationId) return null;
  try {
    const { data } = await axios.get(`${BASE_URL}/location/${locationId}/details`, {
      params: { key: process.env.TRIPADVISOR_API_KEY, language: 'es', currency: 'USD' },
    });
    return {
      ratingActual: data.rating ? parseFloat(data.rating) : 0,
      totalResenas: data.num_reviews ? parseInt(data.num_reviews, 10) : 0,
      urlTripAdvisor: data.web_url || null,
    };
  } catch (error) {
    console.error(`[TripAdvisor] Error obteniendo rating: ${error.response?.data?.message || error.message}`);
    return null;
  }
};

/**
 * Reseñas recientes de un locationId. La Content API devuelve máximo 5 por
 * llamada (igual límite que la API pública de Google) — mismo patrón de
 * "conecta tu cuenta para ver el historial completo" aplicaría aquí si
 * TripAdvisor ofrece alguna vía de acceso ampliado para partners a futuro.
 */
const obtenerResenasTripAdvisor = async (locationId) => {
  if (!configurado() || !locationId) return null;
  try {
    const { data } = await axios.get(`${BASE_URL}/location/${locationId}/reviews`, {
      params: { key: process.env.TRIPADVISOR_API_KEY, language: 'es' },
    });
    return (data.data || []).map((r) => ({
      externalId: `ta_${r.id}`,
      rating: r.rating || 0,
      texto: r.text || '',
      autorNombre: r.user?.username || 'Anónimo',
      autorResenasTotal: null, // TripAdvisor no expone esto en la Content API
      fechaResena: new Date(r.published_date),
    }));
  } catch (error) {
    console.error(`[TripAdvisor] Error obteniendo reseñas: ${error.response?.data?.message || error.message}`);
    return null;
  }
};

module.exports = {
  configurado,
  categoriaTripAdvisor,
  buscarUbicacionTripAdvisor,
  obtenerRatingTripAdvisor,
  obtenerResenasTripAdvisor,
};
