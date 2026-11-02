import { useEffect, useState } from "react"
import { MapPin } from "lucide-react"
import { adminAPI } from "@food/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@food/components/ui/select"

const zoneName = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || "Zone"

/** Selected zone id kept in localStorage per page, so it survives a reload. "" = all zones. */
export const readSavedZone = (key) => {
  try {
    return localStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

export const saveZone = (key, zoneId) => {
  try {
    if (zoneId) localStorage.setItem(key, zoneId)
    else localStorage.removeItem(key)
  } catch {}
}

/**
 * Zone dropdown for the admin offer pages (Combo / BOGO). Lists every zone; "All zones" = no filter.
 * onChange(zoneId, zone) — zone is null for "All zones".
 */
export default function OfferZoneFilter({ value, onChange, disabled }) {
  const [zones, setZones] = useState([])

  useEffect(() => {
    let cancelled = false
    adminAPI
      .getZones({ limit: 1000 })
      .then((res) => {
        const list = res?.data?.data?.zones || res?.data?.data?.data?.zones || res?.data?.data || []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => !cancelled && setZones([]))
    return () => {
      cancelled = true
    }
  }, [])

  // Once zones load, hand the page the saved zone's details (for its name); a saved zone that no
  // longer exists falls back to "All zones".
  useEffect(() => {
    if (!value || zones.length === 0) return
    const match = zones.find((z) => String(z._id || z.id) === value)
    onChange(match ? value : "", match || null)
  }, [value, zones, onChange])

  return (
    <Select
      value={value || ALL}
      disabled={disabled}
      onValueChange={(next) => {
        const id = next === ALL ? "" : next
        onChange(id, zones.find((z) => String(z._id || z.id) === id) || null)
      }}
    >
      <SelectTrigger
        aria-label="Filter by zone"
        // Last child svg = the built-in chevron (faded by default): make it solid and match the text colour.
        className={`h-10 min-w-[200px] gap-2 rounded-xl border bg-white px-3 text-sm font-semibold shadow-sm transition-colors focus:ring-2 focus:ring-blue-500 [&>svg:last-child]:!size-5 [&>svg:last-child]:opacity-100 ${value ? "border-blue-300 bg-blue-50/60 text-blue-700 [&>svg:last-child]:text-blue-600" : "border-slate-300 text-slate-800 hover:bg-slate-50 [&>svg:last-child]:text-slate-600"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className={`h-4 w-4 flex-shrink-0 ${value ? "text-blue-600" : "text-slate-500"}`} />
          <span className="text-xs font-medium text-slate-500">Zone:</span>
          <span className="truncate">
            <SelectValue placeholder="All zones" />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent align="end" className="max-h-72 min-w-[220px] rounded-xl border-slate-200 bg-white text-slate-900 shadow-lg">
        <SelectItem value={ALL} className={ITEM_CLASS}>
          All zones
        </SelectItem>
        {zones.map((zone) => {
          const id = String(zone._id || zone.id)
          return (
            <SelectItem key={id} value={id} className={ITEM_CLASS}>
              <span className="truncate">{zoneName(zone)}</span>
              {zone.isActive === false && <span className="ml-1.5 text-xs text-slate-400">(inactive)</span>}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

// Radix Select can't use "" as an item value, so "All zones" uses this stand-in.
const ALL = "__all__"
const ITEM_CLASS =
  "cursor-pointer rounded-lg py-2 text-sm focus:bg-slate-100 focus:text-slate-900 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 data-[state=checked]:font-semibold data-[state=checked]:text-blue-700"

export { zoneName }
