// brand-shield/src/scrapers/google-business.scraper.js
// Google Business Profile API — acceso completo a reseñas
// Requiere OAuth del propietario verificado del negocio

const axios = require('axios');

const GBP_BASE = 'https://mybusiness.googleapis.com/v4';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Refresca el access token usando el refresh token
 */
const refrescarToken = async (refreshToken) => {
  try {
    const { data } = await axios.post(TOKEN_URL, {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return data.access_token;
  } catch (error) {
    console.error('[GBP] Error refrescando token:', error.message);
    return null;
  }
};

/**
 * Lista las cuentas de Google My Business del usuario
 */
const listarCuentas = async (accessToken) => {
  try {
    const { data } = await axios.get(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return data.accounts || [];
  } catch (error) {
    console.error('[GBP] Error listando cuentas:', error.message);
    return [];
  }
};

/**
 * Lista las ubicaciones de una cuenta
 */
const listarUbicaciones = async (accountName, accessToken) => {
  try {
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { readMask: 'name,title,storefrontAddress,websiteUri' },
      }
    );
    return data.locations || [];
  } catch (error) {
    console.error('[GBP] Error listando ubicaciones:', error.message);
    return [];
  }
};

/**
 * Obtiene TODAS las reseñas de una ubicación (paginadas)
 */
const obtenerResenasGBP = async (accountId, locationId, accessToken, refreshToken) => {
  try {
    let token = accessToken;
    const resenas = [];
    let nextPageToken = null;

    do {
      const params = { pageSize: 50 };
      if (nextPageToken) params.pageToken = nextPageToken;

      let response;
      try {
        response = await axios.get(
          `${GBP_BASE}/accounts/${accountId}/locations/${locationId}/reviews`,
          { headers: { Authorization: `Bearer ${token}` }, params }
        );
      } catch (err) {
        // Token expirado — refrescar
        if (err.response?.status === 401 && refreshToken) {
          token = await refrescarToken(refreshToken);
          if (!token) return { error: 'TOKEN_EXPIRADO' };
          response = await axios.get(
            `${GBP_BASE}/accounts/${accountId}/locations/${locationId}/reviews`,
            { headers: { Authorization: `Bearer ${token}` }, params }
          );
        } else throw err;
      }

      const data = response.data;
      nextPageToken = data.nextPageToken || null;

      // Normalizar al formato interno
      for (const r of (data.reviews || [])) {
        resenas.push({
          externalId: r.reviewId,
          rating: parseInt({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.starRating] || 3),
          texto: r.comment || '',
          autorNombre: r.reviewer?.displayName || 'Anónimo',
          autorResenasTotal: null,
          fechaResena: new Date(r.createTime),
          urlResena: r.reviewId,
          respuestaExistente: r.reviewReply?.comment || null,
        });
      }
    } while (nextPageToken);

    return { resenas, tokenRefrescado: token !== accessToken ? token : null };
  } catch (error) {
    console.error('[GBP] Error obteniendo reseñas:', error.message);
    return { error: error.message };
  }
};

/**
 * Responde una reseña directamente via API
 */
const responderResenaGBP = async (accountId, locationId, reviewId, respuesta, accessToken, refreshToken) => {
  try {
    let token = accessToken;
    const url = `${GBP_BASE}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`;

    try {
      await axios.put(url, { comment: respuesta }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      if (err.response?.status === 401 && refreshToken) {
        token = await refrescarToken(refreshToken);
        if (!token) return { error: 'TOKEN_EXPIRADO' };
        await axios.put(url, { comment: respuesta }, { headers: { Authorization: `Bearer ${token}` } });
      } else throw err;
    }

    return { ok: true, tokenRefrescado: token !== accessToken ? token : null };
  } catch (error) {
    console.error('[GBP] Error respondiendo reseña:', error.message);
    return { error: error.message };
  }
};

module.exports = { listarCuentas, listarUbicaciones, obtenerResenasGBP, responderResenaGBP, refrescarToken };
