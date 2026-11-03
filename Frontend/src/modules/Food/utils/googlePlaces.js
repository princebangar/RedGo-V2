import { getGoogleMapsApiKey } from "./googleMapsApiKey"
import { geocodeGooglePlaceId } from "./googleGeocoding"
import { Loader } from "@googlemaps/js-api-loader"

let mapsLoadPromise = null

// NOTE: the Maps project has only the NEW Places API / Routes API. Legacy services
// (places.AutocompleteService, places.Autocomplete, DirectionsService) answer REQUEST_DENIED,
// so everything here uses AutocompleteSuggestion / Place (Places API New).

const normalizePlaceId = (placeId = "") => {
  const raw = String(placeId).trim()
  if (!raw) return ""
  return raw.startsWith("places/") ? raw.slice("places/".length) : raw
}

export async function ensureGoogleMapsPlacesLoaded() {
  if (window.google?.maps?.importLibrary && window.google?.maps?.places) {
    return window.google
  }

  if (!mapsLoadPromise) {
    mapsLoadPromise = (async () => {
      const apiKey = await getGoogleMapsApiKey()
      if (!apiKey) throw new Error("Google Maps API key is not configured")

      const loader = new Loader({
        apiKey,
        version: "weekly",
        libraries: ["places"],
      })

      return loader.load()
    })()
  }

  return mapsLoadPromise
}

export function mapGeocodeParsedToLocation(parsed) {
  if (!parsed) return null

  const placeName = parsed.placeName || parsed.premise || ""
  const streetLine =
    parsed.streetNumber && parsed.route
      ? `${parsed.streetNumber}, ${parsed.route}`
      : parsed.route || ""

  const addressLine1 =
    placeName ||
    streetLine ||
    parsed.address?.split(",")[0]?.trim() ||
    parsed.formattedAddress?.split(",")[0]?.trim() ||
    ""

  return {
    formattedAddress: parsed.formattedAddress || "",
    addressLine1,
    addressLine2: placeName && streetLine && !streetLine.includes(placeName) ? streetLine : "",
    area: parsed.area || "",
    city: parsed.city || "Indore",
    state: parsed.state || "Madhya Pradesh",
    pincode: parsed.pincode || "",
    landmark: placeName || "",
    latitude: Number(parsed.latitude),
    longitude: Number(parsed.longitude),
    placeName,
  }
}

function rankSuggestion(query, suggestion) {
  const q = String(query || "").trim().toLowerCase()
  const main = String(suggestion.mainText || suggestion.display || "").toLowerCase()
  const full = String(suggestion.display || "").toLowerCase()

  if (!q) return 0
  if (main === q || full === q) return 100
  if (main.startsWith(q) || full.startsWith(q)) return 80
  if (main.includes(q) || full.includes(q)) return 60
  if (suggestion.source === "text_search") return 55
  if (suggestion.source === "autocomplete_new") return 50
  return 30
}

function mergeSuggestions(query, lists = []) {
  const merged = new Map()

  for (const list of lists) {
    for (const item of list) {
      const placeId = normalizePlaceId(item.placeId || item.id)
      if (!placeId) continue

      const existing = merged.get(placeId)
      if (!existing || rankSuggestion(query, item) > rankSuggestion(query, existing)) {
        merged.set(placeId, {
          id: placeId,
          placeId,
          display: item.display || item.mainText || "",
          mainText: item.mainText || item.display || "",
          secondaryText: item.secondaryText || "",
          source: item.source || "autocomplete",
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
        })
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => rankSuggestion(query, b) - rankSuggestion(query, a))
    .slice(0, 8)
}

/**
 * Place suggestions from Places API (New). Same shape as fetchPlaceSuggestions items
 * ({ id, placeId, display, mainText, secondaryText }); resolve a pick with geocodeGooglePlaceId.
 */
export async function fetchNewAutocompletePredictions(query, options = {}) {
  if (!window.google?.maps?.importLibrary) return []

  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } =
      await window.google.maps.importLibrary("places")

    const sessionToken = new AutocompleteSessionToken()
    const request = {
      input: query,
      sessionToken,
      includedRegionCodes: ["in"],
    }

    const lat = Number(options.latitude)
    const lng = Number(options.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      request.locationBias = {
        circle: {
          center: { lat, lng },
          radius: 50000,
        },
      }
    }

    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request)

    return (suggestions || [])
      .map((item) => item.placePrediction)
      .filter(Boolean)
      .map((prediction) => ({
        id: normalizePlaceId(prediction.placeId),
        placeId: normalizePlaceId(prediction.placeId),
        display:
          prediction.text?.text ||
          `${prediction.mainText?.text || ""}${prediction.secondaryText?.text ? `, ${prediction.secondaryText.text}` : ""}`,
        mainText: prediction.mainText?.text || prediction.text?.text || "",
        secondaryText: prediction.secondaryText?.text || "",
        source: "autocomplete_new",
      }))
  } catch {
    return []
  }
}

async function fetchTextSearchPredictions(query, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 7000)

  try {
    const { geocodeAPI } = await import("@food/api")
    const lat = Number(options.latitude)
    const lng = Number(options.longitude)

    const body = {
      textQuery: query,
      maxResultCount: 6,
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      body.latitude = lat
      body.longitude = lng
    }

    const response = await geocodeAPI.textSearch(body, { signal: controller.signal })
    const data = response?.data?.data
    const places = Array.isArray(data?.places) ? data.places : []

    return places.map((place) => {
      const placeId = normalizePlaceId(place.id)
      const mainText = place.displayName?.text || place.displayName || ""
      const formattedAddress = place.formattedAddress || ""
      return {
        id: placeId,
        placeId,
        display: formattedAddress || mainText,
        mainText: mainText || formattedAddress.split(",")[0] || "",
        secondaryText: formattedAddress && mainText ? formattedAddress : "",
        source: "text_search",
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
      }
    })
  } catch {
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch Google place suggestions using Places API (New) autocomplete + text search.
 */
export async function fetchPlaceSuggestions(input, options = {}) {
  const query = String(input || "").trim()
  if (query.length < 3) return []

  await ensureGoogleMapsPlacesLoaded()

  const [newResults, textResults] = await Promise.all([
    fetchNewAutocompletePredictions(query, options),
    fetchTextSearchPredictions(query, options),
  ])

  return mergeSuggestions(query, [textResults, newResults])
}

const toLegacyAddressComponents = (components = []) =>
  (Array.isArray(components) ? components : []).map((c) => ({
    long_name: c?.longText ?? c?.long_name ?? "",
    short_name: c?.shortText ?? c?.short_name ?? "",
    types: Array.isArray(c?.types) ? c.types : [],
  }))

/**
 * Drop-in replacement for `new google.maps.places.Autocomplete(input, options)` built on
 * Places API (New). Same surface the pages use: addListener("place_changed", fn) and
 * getPlace() → { place_id, name, formatted_address, address_components, geometry.location }.
 * The dropdown keeps the legacy "pac-container" / "pac-item" classes, so existing
 * z-index / cleanup code that targets `.pac-container` keeps working.
 * Supported options: componentRestrictions.country, bounds (used as location bias).
 */
export function createPlacesAutocomplete(input, options = {}) {
  const maps = typeof window !== "undefined" ? window.google?.maps : null
  if (!input || !maps?.importLibrary) {
    // Maps not loaded: a no-op object so callers that do `.addListener(...)` don't crash.
    return { addListener: () => ({ remove() {} }), getPlace: () => null, setBounds() {}, setComponentRestrictions() {}, dispose() {}, unbindAll() {} }
  }

  const country = options?.componentRestrictions?.country
  let regionCodes = country ? [].concat(country).map((c) => String(c).toLowerCase()) : undefined
  let bounds = options?.bounds || null
  const listeners = new Set()
  let place = null
  let sessionToken = null
  let suggestions = []
  let activeIndex = -1
  let debounceId = null
  let requestSeq = 0
  let disposed = false

  // Some pages force every `.pac-container` to display:block (z-index fixes). An empty list
  // must never show as a bare bordered box, so empty = hidden, whatever inline style says.
  if (!document.getElementById("redgo-places-new-style")) {
    const style = document.createElement("style")
    style.id = "redgo-places-new-style"
    style.textContent = ".redgo-places-new:empty{display:none !important}"
    document.head.appendChild(style)
  }

  const box = document.createElement("div")
  box.className = "pac-container redgo-places-new"
  box.setAttribute("role", "listbox")
  Object.assign(box.style, {
    position: "fixed",
    zIndex: "10050",
    display: "none",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.18)",
    maxHeight: "280px",
    overflowY: "auto",
  })
  document.body.appendChild(box)

  const position = () => {
    const r = input.getBoundingClientRect()
    box.style.left = `${r.left}px`
    box.style.top = `${r.bottom + 4}px`
    box.style.width = `${Math.max(r.width, 220)}px`
  }
  const hide = () => {
    box.style.display = "none"
    box.replaceChildren()
    activeIndex = -1
  }
  const paintActive = () => {
    Array.from(box.children).forEach((el, i) => {
      el.style.background = i === activeIndex ? "#f1f5f9" : "#ffffff"
    })
  }

  const select = async (index) => {
    const s = suggestions[index]
    if (!s) return
    hide()
    input.value = s.text
    try {
      // toPlace() carries the autocomplete session token, so the pick closes the session.
      const p = s.prediction.toPlace()
      await p.fetchFields({ fields: ["location", "formattedAddress", "addressComponents"] })
      place = {
        place_id: p.id || s.placeId,
        name: s.mainText,
        formatted_address: p.formattedAddress || s.text,
        address_components: toLegacyAddressComponents(p.addressComponents),
        geometry: p.location ? { location: p.location } : undefined,
      }
    } catch (err) {
      console.warn("[places] place details failed:", err?.message || err)
      place = { place_id: s.placeId, name: s.mainText, formatted_address: s.text, address_components: [] }
    }
    sessionToken = null
    suggestions = []
    listeners.forEach((fn) => {
      try {
        fn()
      } catch (err) {
        console.error(err)
      }
    })
  }

  const render = () => {
    box.replaceChildren()
    if (!suggestions.length || document.activeElement !== input) {
      hide()
      return
    }
    suggestions.forEach((s, i) => {
      const item = document.createElement("div")
      item.className = "pac-item"
      item.setAttribute("role", "option")
      Object.assign(item.style, {
        padding: "9px 12px",
        cursor: "pointer",
        lineHeight: "1.35",
        borderTop: i ? "1px solid #f1f5f9" : "none",
      })
      const main = document.createElement("div")
      main.className = "pac-item-query"
      main.textContent = s.mainText
      Object.assign(main.style, { fontSize: "13px", fontWeight: "600", color: "#0f172a" })
      item.appendChild(main)
      if (s.secondaryText) {
        const sec = document.createElement("div")
        sec.textContent = s.secondaryText
        Object.assign(sec.style, { fontSize: "12px", color: "#64748b" })
        item.appendChild(sec)
      }
      // mousedown (not click) so the input does not blur and close the list first
      item.addEventListener("mousedown", (e) => {
        e.preventDefault()
        select(i)
      })
      item.addEventListener("mouseenter", () => {
        activeIndex = i
        paintActive()
      })
      box.appendChild(item)
    })
    position()
    box.style.display = "block"
    // pages may have set visibility:hidden on `.pac-container` while the query was empty
    box.style.visibility = "visible"
  }

  const search = async (query) => {
    const seq = ++requestSeq
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary("places")
      if (!sessionToken) sessionToken = new AutocompleteSessionToken()
      const request = { input: query, sessionToken }
      if (regionCodes?.length) request.includedRegionCodes = regionCodes
      if (bounds) request.locationBias = bounds
      const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
      if (disposed || seq !== requestSeq) return
      suggestions = (res?.suggestions || [])
        .map((x) => x.placePrediction)
        .filter(Boolean)
        .slice(0, 5)
        .map((pr) => ({
          prediction: pr,
          placeId: normalizePlaceId(pr.placeId),
          text: pr.text?.text || "",
          mainText: pr.mainText?.text || pr.text?.text || "",
          secondaryText: pr.secondaryText?.text || "",
        }))
      activeIndex = -1
      render()
    } catch (err) {
      if (seq !== requestSeq) return
      console.warn("[places] autocomplete failed:", err?.message || err)
      suggestions = []
      hide()
    }
  }

  const onInput = () => {
    clearTimeout(debounceId)
    const q = String(input.value || "").trim()
    if (q.length < 3) {
      requestSeq += 1
      suggestions = []
      hide()
      return
    }
    debounceId = setTimeout(() => search(q), 300)
  }
  const onKeyDown = (e) => {
    if (!box.childElementCount || !suggestions.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      activeIndex = (activeIndex + 1) % suggestions.length
      paintActive()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1
      paintActive()
    } else if (e.key === "Enter") {
      // like the legacy widget: Enter on a highlighted row picks it and does not submit the form
      e.preventDefault()
      select(activeIndex >= 0 ? activeIndex : 0)
    } else if (e.key === "Escape") {
      hide()
    }
  }
  const onBlur = () => setTimeout(hide, 150)
  const onFocus = () => {
    if (suggestions.length) render()
  }
  const onViewportChange = () => {
    if (box.childElementCount) position()
  }

  input.setAttribute("autocomplete", "off")
  input.addEventListener("input", onInput)
  input.addEventListener("keydown", onKeyDown)
  input.addEventListener("blur", onBlur)
  input.addEventListener("focus", onFocus)
  window.addEventListener("resize", onViewportChange)
  window.addEventListener("scroll", onViewportChange, true)

  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(debounceId)
    listeners.clear()
    input.removeEventListener("input", onInput)
    input.removeEventListener("keydown", onKeyDown)
    input.removeEventListener("blur", onBlur)
    input.removeEventListener("focus", onFocus)
    window.removeEventListener("resize", onViewportChange)
    window.removeEventListener("scroll", onViewportChange, true)
    box.remove()
  }

  return {
    addListener(eventName, fn) {
      if (eventName !== "place_changed" || typeof fn !== "function") return { remove() {} }
      listeners.add(fn)
      return { remove: () => listeners.delete(fn) }
    },
    getPlace: () => place,
    setBounds(nextBounds) {
      bounds = nextBounds || null
    },
    setComponentRestrictions(restrictions) {
      const c = restrictions?.country
      regionCodes = c ? [].concat(c).map((x) => String(x).toLowerCase()) : undefined
    },
    dispose,
    unbindAll: dispose,
  }
}

export async function resolvePlaceSuggestion(suggestion) {
  const placeId = normalizePlaceId(suggestion?.placeId || suggestion?.id)
  if (!placeId) throw new Error("Missing place id")

  const parsed = await geocodeGooglePlaceId(placeId)
  const location = mapGeocodeParsedToLocation(parsed)

  if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return location
  }

  if (Number.isFinite(suggestion?.latitude) && Number.isFinite(suggestion?.longitude)) {
    return {
      formattedAddress: suggestion.display || "",
      addressLine1: suggestion.mainText || suggestion.display || "",
      addressLine2: "",
      area: "",
      city: "Indore",
      state: "Madhya Pradesh",
      pincode: "",
      landmark: suggestion.mainText || "",
      latitude: Number(suggestion.latitude),
      longitude: Number(suggestion.longitude),
      placeName: suggestion.mainText || "",
    }
  }

  throw new Error("Could not resolve location coordinates")
}

export function formatLocationPreview(location) {
  if (!location) return ""
  const parts = []
  if (location.placeName || location.addressLine1) {
    parts.push((location.placeName || location.addressLine1).trim())
  }
  if (location.area) parts.push(location.area.trim())
  if (location.city) parts.push(location.city.trim())
  if (location.pincode) parts.push(location.pincode.trim())
  return parts.filter(Boolean).join(", ")
}
