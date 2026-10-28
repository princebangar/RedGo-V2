import { FoodZone } from '../admin/models/zone.model.js';

const toFinite = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Ray-casting point-in-polygon for zone.coordinates [{latitude, longitude}, ...] */
export function isPointInZonePolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Resolve active zone id for a lat/lng point.
 * @returns {Promise<string|null>} zone ObjectId string or null
 */
export async function detectZoneIdForPoint(lat, lng) {
  const parsedLat = toFinite(lat);
  const parsedLng = toFinite(lng);
  if (parsedLat === null || parsedLng === null) return null;

  const zones = await FoodZone.find({ isActive: true })
    .select('_id coordinates')
    .lean();

  for (const zone of zones) {
    const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
    if (coords.length < 3) continue;
    if (isPointInZonePolygon(parsedLat, parsedLng, coords)) {
      return String(zone._id);
    }
  }
  return null;
}

export async function getActiveZoneById(zoneId) {
  if (!zoneId) return null;
  return FoodZone.findOne({ _id: zoneId, isActive: true })
    .select('_id coordinates name zoneName')
    .lean();
}

export const OUTSIDE_ZONES_MESSAGE =
  'This location is outside our service zones. Please choose a location inside a service zone.';

/**
 * Pick the service zone for a restaurant location.
 * With a requested zone the point must lie inside that zone; without one, the zone that
 * contains the point is used. Without coordinates the requested zone is kept as is.
 * @returns {Promise<{ zoneId: string|null, error: string|null }>}
 */
export async function resolveRestaurantZone(lat, lng, requestedZoneId) {
  const requested = String(requestedZoneId || '').trim();
  const parsedLat = toFinite(lat);
  const parsedLng = toFinite(lng);
  if (parsedLat === null || parsedLng === null) {
    return { zoneId: requested || null, error: null };
  }

  if (requested && /^[a-f0-9]{24}$/i.test(requested)) {
    const zoneDoc = await getActiveZoneById(requested);
    if (zoneDoc && isPointInZonePolygon(parsedLat, parsedLng, zoneDoc.coordinates || [])) {
      return { zoneId: String(zoneDoc._id), error: null };
    }
  }

  const detected = await detectZoneIdForPoint(parsedLat, parsedLng);
  if (!detected) return { zoneId: null, error: OUTSIDE_ZONES_MESSAGE };
  if (requested && requested !== detected) {
    return { zoneId: null, error: 'The restaurant location is not inside the selected service zone.' };
  }
  return { zoneId: detected, error: null };
}

/** True if partner GPS is inside the given zone document polygon. */
export function isPartnerInsideZone(partner, zoneDoc) {
  if (!zoneDoc) return false;
  const lat = toFinite(partner?.lastLat);
  const lng = toFinite(partner?.lastLng);
  if (lat === null || lng === null) return false;
  const coords = Array.isArray(zoneDoc.coordinates) ? zoneDoc.coordinates : [];
  return isPointInZonePolygon(lat, lng, coords);
}
