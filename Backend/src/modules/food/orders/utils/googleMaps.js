import { logger } from '../../../../utils/logger.js';
import { haversineKm } from '../services/order.helpers.js';

const sanitize = (value) =>
  value ? String(value).trim().replace(/^['"]|['"]$/g, '') : '';

export function getGoogleMapsApiKey() {
  return (
    sanitize(process.env.GOOGLE_MAPS_API_KEY) ||
    sanitize(process.env.VITE_GOOGLE_MAPS_API_KEY) ||
    ''
  );
}

/**
 * Fetches an encoded polyline from Google Directions API (driving mode).
 * This should be called ONLY ONCE per order assignment to save costs.
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<string>} - Encoded polyline points
 */
export async function fetchPolyline(origin, destination) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    logger.warn('Google Maps API key missing. Polyline fetch skipped.');
    return '';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&mode=driving&region=in&key=${apiKey}`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    if (data.status === 'OK' && data.routes?.length > 0) {
      return data.routes[0].overview_polyline?.points || '';
    }
    logger.warn(
      `Google Directions API returned status: ${data.status}. Message: ${data.error_message || 'No routes found'}`,
    );
  } catch (err) {
    logger.error(`Error fetching polyline from Google: ${err.message}`);
  }

  return '';
}

/**
 * Road/driving distance in km via Google Directions API (mode=driving).
 * Uses the same route a vehicle would take — not air/haversine distance.
 * @returns {Promise<number|null>}
 */
export async function fetchDrivingDistanceKm(origin, destination) {
  if (!origin || !destination) return null;
  const oLat = Number(origin.lat);
  const oLng = Number(origin.lng);
  const dLat = Number(destination.lat);
  const dLng = Number(destination.lng);
  if (![oLat, oLng, dLat, dLng].every(Number.isFinite)) return null;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    logger.warn('Google Maps API key missing. Driving distance skipped.');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const originStr = `${oLat},${oLng}`;
    const destStr = `${dLat},${dLng}`;
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${encodeURIComponent(originStr)}` +
      `&destination=${encodeURIComponent(destStr)}` +
      `&mode=driving&units=metric&region=in&key=${apiKey}`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    if (data.status === 'OK' && data.routes?.[0]?.legs?.length) {
      const meters = data.routes[0].legs.reduce(
        (sum, leg) => sum + Number(leg.distance?.value || 0),
        0,
      );
      const km = meters / 1000;
      if (Number.isFinite(km) && km > 0) {
        return Math.round(km * 100) / 100;
      }
    }

    logger.warn(
      `Driving distance failed: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`,
    );
  } catch (err) {
    logger.error(`Error fetching driving distance: ${err.message}`);
  }

  return null;
}

/** Normalize any common lat/lng shape to { lat, lng } or null */
export function normalizeLatLng(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2) {
    const lng = Number(raw.coordinates[0]);
    const lat = Number(raw.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  const lat = Number(raw.lat ?? raw.latitude);
  const lng = Number(raw.lng ?? raw.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  return null;
}

function buildAddressQuery(parts = []) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Forward-geocode an address string via Google Geocoding API.
 * @returns {Promise<{lat:number,lng:number}|null>}
 */
export async function geocodeAddress(addressQuery) {
  const query = String(addressQuery || '').trim();
  if (!query) return null;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    logger.warn('Google Maps API key missing. Geocode skipped.');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const params = new URLSearchParams({
      address: query,
      key: apiKey,
      language: 'en',
      region: 'in',
    });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    const data = await res.json();

    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
      const { lat, lng } = data.results[0].geometry.location;
      const point = { lat: Number(lat), lng: Number(lng) };
      if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) return point;
    }

    logger.warn(
      `Geocode failed for "${query.slice(0, 80)}": ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`,
    );
  } catch (err) {
    logger.error(`Geocode request error: ${err.message}`);
  }

  return null;
}

export async function resolveRestaurantLatLng(restaurant) {
  if (!restaurant) return { point: null, geocoded: false };

  const existing = normalizeLatLng(restaurant.location);
  if (existing) return { point: existing, geocoded: false };

  const query = buildAddressQuery([
    restaurant.addressLine1,
    restaurant.addressLine2,
    restaurant.area,
    restaurant.city,
    restaurant.state,
    restaurant.pincode,
    restaurant.restaurantName,
  ]);
  const geocoded = await geocodeAddress(query);
  return { point: geocoded, geocoded: Boolean(geocoded) };
}

export async function resolveDeliveryLatLng(deliveryAddress) {
  if (!deliveryAddress) return { point: null, geocoded: false };

  const existing = normalizeLatLng(deliveryAddress.location);
  if (existing) return { point: existing, geocoded: false };

  const query = buildAddressQuery([
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.landmark,
    deliveryAddress.area,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode || deliveryAddress.pincode,
  ]);
  const geocoded = await geocodeAddress(query);
  return { point: geocoded, geocoded: Boolean(geocoded) };
}

/**
 * Resolve restaurant → customer distance in km.
 * Prefers Google Directions driving/road distance; falls back to air distance only if API fails.
 */
export async function resolveOrderDistanceKm(restaurant, deliveryAddress) {
  const [restRes, delRes] = await Promise.all([
    resolveRestaurantLatLng(restaurant),
    resolveDeliveryLatLng(deliveryAddress),
  ]);

  let distanceKm = null;
  let distanceMode = null;

  if (restRes.point && delRes.point) {
    const drivingKm = await fetchDrivingDistanceKm(restRes.point, delRes.point);
    if (Number.isFinite(drivingKm) && drivingKm > 0) {
      distanceKm = drivingKm;
      distanceMode = 'driving';
    } else {
      const airKm = haversineKm(
        restRes.point.lat,
        restRes.point.lng,
        delRes.point.lat,
        delRes.point.lng,
      );
      if (Number.isFinite(airKm) && airKm > 0) {
        distanceKm = Math.round(airKm * 100) / 100;
        distanceMode = 'air_fallback';
        logger.warn(
          `Driving distance unavailable; fell back to air distance ${distanceKm} km`,
        );
      }
    }
  }

  return {
    distanceKm,
    distanceMode,
    restaurantPoint: restRes.point,
    deliveryPoint: delRes.point,
    restaurantGeocoded: restRes.geocoded,
    deliveryGeocoded: delRes.geocoded,
  };
}

export function toGeoJsonPoint(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { type: 'Point', coordinates: [lng, lat] };
}
