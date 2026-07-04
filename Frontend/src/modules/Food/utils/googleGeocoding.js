import { getGoogleMapsApiKey } from "./googleMapsApiKey"

/**
 * Read fresh GPS coordinates from the device (no cache).
 */
export function getFreshGpsCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  })
}

function getComponent(components, types, useShort = false) {
  const comp = components.find((c) => types.some((t) => c.types.includes(t)))
  if (!comp) return ""
  return useShort ? comp.short_name : comp.long_name
}

export function parseGoogleGeocodeResult(result) {
  const components = result?.address_components || []

  const streetNumber = getComponent(components, ["street_number"])
  const route = getComponent(components, ["route"])
  const sublocality =
    getComponent(components, ["sublocality_level_1"]) || getComponent(components, ["sublocality"])
  const neighborhood = getComponent(components, ["neighborhood"])
  const city = getComponent(components, ["locality"]) || getComponent(components, ["administrative_area_level_2"])
  const state = getComponent(components, ["administrative_area_level_1"])
  const country = getComponent(components, ["country"])
  const pincode = getComponent(components, ["postal_code"])
  const premise =
    getComponent(components, ["premise"]) ||
    getComponent(components, ["subpremise"]) ||
    getComponent(components, ["point_of_interest"]) ||
    getComponent(components, ["establishment"])

  const area = sublocality || neighborhood || premise || ""
  const addressParts = []
  if (premise && premise !== area) addressParts.push(premise)
  if (streetNumber && route) addressParts.push(`${streetNumber}, ${route}`)
  else if (route) addressParts.push(route)
  if (area) addressParts.push(area)

  const displayAddress =
    addressParts.join(", ") || (result?.formatted_address || "").split(",")[0] || area || city

  return {
    city: city || "",
    state: state || "",
    country: country || "India",
    area,
    pincode,
    mainTitle: area || city || displayAddress,
    address: displayAddress,
    formattedAddress: result?.formatted_address || displayAddress,
    premise: premise || "",
    streetNumber,
    route,
    placeId: result?.place_id || "",
  }
}

/**
 * Reverse geocode lat/lng using Google Geocoding API (client-side).
 */
export async function reverseGeocodeWithGoogle(latitude, longitude) {
  const apiKey = await getGoogleMapsApiKey()
  if (!apiKey) {
    throw new Error("Google Maps API key is not configured")
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=en&region=in`,
      { signal: controller.signal }
    )
    const data = await response.json()

    if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
      throw new Error(data.status || "Google reverse geocode failed")
    }

    // Prefer the most specific (street/premise) result.
    const result =
      data.results.find((r) =>
        r.types?.some((t) =>
          ["premise", "subpremise", "street_address", "route", "neighborhood", "sublocality"].includes(t)
        )
      ) || data.results[0]

    return parseGoogleGeocodeResult(result)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Forward geocode a place_id from Google Places.
 */
export async function geocodeGooglePlaceId(placeId) {
  const apiKey = await getGoogleMapsApiKey()
  if (!apiKey) throw new Error("Google Maps API key is not configured")

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(placeId)}&key=${apiKey}&language=en&region=in`
  )
  const data = await response.json()
  if (data.status !== "OK" || !data.results?.[0]) {
    throw new Error(data.status || "Place geocode failed")
  }

  const result = data.results[0]
  const location = result.geometry?.location
  return {
    ...parseGoogleGeocodeResult(result),
    latitude: Number(location?.lat),
    longitude: Number(location?.lng),
  }
}
