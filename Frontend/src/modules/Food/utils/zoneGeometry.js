// Helpers for service-zone polygons ({ coordinates: [{ latitude, longitude }] }).

const toNum = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

const zonePoints = (zone) =>
  (Array.isArray(zone?.coordinates) ? zone.coordinates : [])
    .map((c) => ({ lat: toNum(c?.latitude ?? c?.lat), lng: toNum(c?.longitude ?? c?.lng) }))
    .filter((p) => p.lat !== null && p.lng !== null)

/** Ray-casting point-in-polygon test. */
export const isPointInZone = (lat, lng, zone) => {
  const la = toNum(lat)
  const ln = toNum(lng)
  const pts = zonePoints(zone)
  if (la === null || ln === null || pts.length < 3) return false
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const { lat: yi, lng: xi } = pts[i]
    const { lat: yj, lng: xj } = pts[j]
    if (yi > la !== yj > la && ln < ((xj - xi) * (la - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** First zone that contains the point, or null. */
export const findZoneForPoint = (zones, lat, lng) =>
  (Array.isArray(zones) ? zones : []).find((z) => isPointInZone(lat, lng, z)) || null

export const getZoneId = (zone) => String(zone?._id || zone?.id || "")

export const getZoneLabel = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || ""

/** { south, west, north, east } covering every zone, or null when there are no zones. */
export const getZonesBounds = (zones) => {
  const pts = (Array.isArray(zones) ? zones : []).flatMap(zonePoints)
  if (!pts.length) return null
  return {
    south: Math.min(...pts.map((p) => p.lat)),
    north: Math.max(...pts.map((p) => p.lat)),
    west: Math.min(...pts.map((p) => p.lng)),
    east: Math.max(...pts.map((p) => p.lng)),
  }
}
