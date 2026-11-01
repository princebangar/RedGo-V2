import { useCallback, useEffect, useMemo, useState } from "react"
import { Bike, Loader2, MapPin, Phone, RefreshCw, Search, UserCheck, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"

const AUTO_REFRESH_MS = 20000

const formatAgo = (value) => {
  if (!value) return "no GPS"
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 0) return "no GPS"
  if (mins < 1) return "GPS just now"
  if (mins < 60) return `GPS ${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `GPS ${hours} h ago`
  return `GPS ${Math.floor(hours / 24)} d ago`
}

function Stat({ label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-rose-50 text-rose-700",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {label}: {value}
    </span>
  )
}

export default function AssignDeliveryPartnerDialog({ isOpen, onOpenChange, order, onAssigned }) {
  const orderKey = order?.id || order?._id || order?.orderId
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState(null)
  const [assigning, setAssigning] = useState(false)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!orderKey) return
      if (!silent) setLoading(true)
      try {
        const res = await adminAPI.getAssignablePartners(orderKey)
        setData(res?.data?.data || res?.data || null)
        setError("")
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load delivery partners")
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [orderKey],
  )

  useEffect(() => {
    if (!isOpen) return
    setSelectedId(null)
    setSearch("")
    setData(null)
    load()
    const timer = setInterval(() => load({ silent: true }), AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [isOpen, load])

  const partners = useMemo(() => {
    const list = Array.isArray(data?.partners) ? data.partners : []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (p) =>
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.phone || "").includes(q) ||
        String(p.vehicleNumber || "").toLowerCase().includes(q),
    )
  }, [data, search])

  const onlineCount = (data?.partners || []).filter((p) => p.isOnline).length
  const maxConcurrent = Number(data?.maxConcurrent || 1)
  const fullCount = (data?.partners || []).filter((p) => p.isOnline && p.atCapacity && !p.isCurrent).length
  const selected = partners.find((p) => p.id === selectedId && !(p.atCapacity && !p.isCurrent)) || null
  const currentPartner = data?.order?.currentPartner || null
  const canAssign = data?.order?.canAssign !== false

  const handleAssign = async () => {
    if (!selected || !orderKey) return
    setAssigning(true)
    try {
      const res = await adminAPI.assignDeliveryPartner(orderKey, selected.id)
      const payload = res?.data?.data || {}
      toast.success(
        payload.reassigned
          ? `Order reassigned to ${selected.name}`
          : `Order assigned to ${selected.name}`,
      )
      onAssigned?.(payload)
      onOpenChange(false)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to assign delivery partner")
      load({ silent: true })
    } finally {
      setAssigning(false)
    }
  }

  if (!order) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !assigning && onOpenChange(open)}>
      <DialogContent className="sm:max-w-2xl p-6" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Bike className="w-5 h-5 text-orange-600" />
            {currentPartner ? "Reassign Delivery Partner" : "Assign Delivery Partner"}
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Order <span className="font-semibold">{order.orderId}</span>
            {data?.order?.restaurantName ? <> · {data.order.restaurantName}</> : null}
            {currentPartner ? (
              <>
                {" "}· Current rider: <span className="font-semibold">{currentPartner.name || "Rider"}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or vehicle number"
              className="w-full rounded-md border border-slate-200 pl-8 pr-3 py-2 text-sm outline-none focus:border-orange-400"
            />
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="p-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {data && (
          <p className="text-xs text-slate-500 pt-1">
            {onlineCount} online · {(data.partners || []).length - onlineCount} offline · Max {maxConcurrent} order
            {maxConcurrent > 1 ? "s" : ""} per rider · Distance is from the restaurant
          </p>
        )}

        <div className="mt-2 max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {loading && !data ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading delivery partners...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-rose-600">{error}</div>
          ) : partners.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No delivery partners found</div>
          ) : (
            partners.map((p) => {
              const limitFull = p.isOnline && p.atCapacity && !p.isCurrent
              const disabled = !p.isOnline || p.isCurrent || limitFull
              const isSelected = p.id === selectedId
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedId(p.id)}
                  title={limitFull ? `Order limit reached (${maxConcurrent} per rider)` : undefined}
                  className={`w-full text-left rounded-lg border p-3 transition-colors flex gap-3 items-start ${
                    !p.isOnline
                      ? "grayscale opacity-60 bg-slate-50 border-slate-200 cursor-not-allowed"
                      : limitFull
                        ? "opacity-70 bg-rose-50/40 border-rose-200 cursor-not-allowed"
                        : isSelected
                        ? "border-orange-500 bg-orange-50 ring-1 ring-orange-500"
                        : p.isCurrent
                          ? "border-blue-300 bg-blue-50 cursor-default"
                          : "border-slate-200 hover:border-orange-300 hover:bg-orange-50/40"
                  }`}
                >
                  <div className="relative shrink-0">
                    {p.profilePhoto ? (
                      <img src={p.profilePhoto} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                        {String(p.name || "R").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                        p.isOnline ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                      <span className={`text-[11px] font-semibold ${p.isOnline ? "text-emerald-600" : "text-slate-500"}`}>
                        {p.isOnline ? "Online" : "Offline"}
                      </span>
                      {limitFull && (
                        <span className="text-[11px] font-semibold text-rose-700 bg-rose-100 rounded px-1.5 py-0.5">
                          Limit full
                        </span>
                      )}
                      {p.isCurrent && (
                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">
                          Current rider
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                      {p.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {p.phone}
                        </span>
                      )}
                      {(p.vehicleType || p.vehicleNumber) && (
                        <span className="inline-flex items-center gap-1">
                          <Bike className="w-3 h-3" /> {[p.vehicleType, p.vehicleNumber].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {p.distanceKm != null ? `${p.distanceKm} km` : "—"}
                        <span className={p.gpsStale ? "text-amber-600" : ""}>({formatAgo(p.lastLocationAt)})</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Stat
                        label="Current orders"
                        value={`${p.acceptedOrders}/${maxConcurrent}`}
                        tone={p.atCapacity ? "red" : p.acceptedOrders > 0 ? "blue" : "green"}
                      />
                      <Stat label="Picked up" value={p.pickedUpOrders} tone={p.pickedUpOrders > 0 ? "blue" : "slate"} />
                      <Stat label="Pending requests" value={p.pendingRequests} tone={p.pendingRequests > 0 ? "amber" : "slate"} />
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {!canAssign && data && (
          <p className="mt-2 text-xs text-rose-600">
            A rider can be assigned only to a home delivery order that the restaurant is preparing, is ready, or that is on the way.
          </p>
        )}
        {data && fullCount > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              {fullCount} rider{fullCount === 1 ? " has" : "s have"} reached the order limit ({maxConcurrent} per rider)
              and can't be selected. To assign to them anyway, increase the limit in{" "}
              <span className="font-semibold">Multiorder Setting</span>.
            </p>
          </div>
        )}
        {currentPartner && selected && (
          <p className="mt-2 text-xs text-slate-600">
            The order will be taken from {currentPartner.name || "the current rider"} and moved to {selected.name}. Both riders get a notification.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assigning}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selected || assigning || !canAssign}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {assigning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserCheck className="w-4 h-4 mr-1" />}
            {assigning ? "Assigning..." : currentPartner ? "Reassign" : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
