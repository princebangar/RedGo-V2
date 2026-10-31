import { useState, useEffect, useCallback, useRef } from "react"
import { Search, Trash2, ArrowLeft, ChevronRight, Plus, Loader2, Pencil } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@food/components/ui/dialog"
import { Switch } from "@food/components/ui/switch"
import dishFallbackImage from "@food/assets/placeholders/dish_fallback.webp"
import AdminListPagination from "@food/components/admin/AdminListPagination"

const errorMessage = (err, fallback) => err?.response?.data?.message || fallback

/** "1 item" / "67 items" */
const pluralItems = (count) => `${count} ${Number(count) === 1 ? "item" : "items"}`

/** Dish thumbnail; uses the same fallback dish image as the user app when there's no photo (or it fails to load). */
const DishThumb = ({ src, alt }) => (
  <img
    src={src || dishFallbackImage}
    alt={alt}
    onError={(e) => {
      // Swap to the fallback only once, so a broken fallback can't loop.
      if (e.currentTarget.dataset.fallback) return
      e.currentTarget.dataset.fallback = "1"
      e.currentTarget.src = dishFallbackImage
    }}
    className="h-12 w-12 rounded-lg object-cover flex-shrink-0 bg-slate-100"
  />
)

// Free items per order: 1–99. Uses per user: empty / 0 = unlimited, else 1–999.
const FREE_LIMIT = { min: 1, max: 99, label: "Free items / order" }
const USES_LIMIT = { min: 0, max: 999, label: "Uses per user" }

/** Saved limits → input strings (uses 0 = unlimited = empty input; nothing saved yet = 1). */
const toLimitDraft = (limits) => ({
  maxFreePerOrder: String(limits?.maxFreePerOrder || 1),
  usageLimitPerUser:
    limits?.usageLimitPerUser == null ? "1" : Number(limits.usageLimitPerUser) > 0 ? String(limits.usageLimitPerUser) : "",
})

const sameLimitDraft = (a, b) =>
  a.maxFreePerOrder.trim() === b.maxFreePerOrder.trim() && a.usageLimitPerUser.trim() === b.usageLimitPerUser.trim()

/** Input strings → { maxFreePerOrder, usageLimitPerUser }, or null after showing what's wrong. */
const parseLimitDraft = (draft) => {
  const maxFreePerOrder = Number(draft.maxFreePerOrder)
  const usageLimitPerUser = draft.usageLimitPerUser.trim() === "" ? 0 : Number(draft.usageLimitPerUser)
  if (!Number.isInteger(maxFreePerOrder) || maxFreePerOrder < FREE_LIMIT.min || maxFreePerOrder > FREE_LIMIT.max) {
    toast.error(`${FREE_LIMIT.label}: enter a whole number from ${FREE_LIMIT.min} to ${FREE_LIMIT.max}`)
    return null
  }
  if (!Number.isInteger(usageLimitPerUser) || usageLimitPerUser < 0 || usageLimitPerUser > USES_LIMIT.max) {
    toast.error(`${USES_LIMIT.label}: leave empty for unlimited, or enter 1 to ${USES_LIMIT.max}`)
    return null
  }
  return { maxFreePerOrder, usageLimitPerUser }
}

const usesLabel = (uses) => (Number(uses) > 0 ? `${uses} ${Number(uses) === 1 ? "order" : "orders"}` : "Unlimited")

const limitInputClass =
  "w-16 px-2 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"

/** The two limit inputs (draft strings), shared by the defaults panel and the edit dialog. */
const LimitFields = ({ draft, onChange, disabled }) => (
  <>
    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
      {FREE_LIMIT.label}
      <input
        type="number"
        min={FREE_LIMIT.min}
        max={FREE_LIMIT.max}
        step={1}
        value={draft.maxFreePerOrder}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, maxFreePerOrder: e.target.value })}
        aria-label={FREE_LIMIT.label}
        className={limitInputClass}
      />
    </label>
    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
      {USES_LIMIT.label}
      <input
        type="number"
        min={1}
        max={USES_LIMIT.max}
        step={1}
        value={draft.usageLimitPerUser}
        placeholder="∞"
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, usageLimitPerUser: e.target.value })}
        aria-label={USES_LIMIT.label}
        className={limitInputClass}
      />
    </label>
  </>
)

/**
 * Default limits, saved in the DB. Every offer without custom limits (old ones included) runs with
 * them. Save stays disabled until one of the two values differs from what's saved.
 */
const DefaultLimitsPanel = ({ onSaved }) => {
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(toLimitDraft())
  const [saving, setSaving] = useState(false)

  const applySaved = (defaults) => {
    const next = toLimitDraft(defaults)
    setSaved(next)
    setDraft(next)
  }

  useEffect(() => {
    adminAPI
      .getBogoDefaults()
      .then((res) => applySaved(res?.data?.data?.defaults))
      .catch((err) => toast.error(errorMessage(err, "Failed to load default limits")))
  }, [])

  const changed = saved != null && !sameLimitDraft(draft, saved)

  const handleSave = async () => {
    const limits = parseLimitDraft(draft)
    if (!limits) return
    setSaving(true)
    try {
      const res = await adminAPI.saveBogoDefaults(limits)
      applySaved(res?.data?.data?.defaults || limits)
      toast.success("Default limits saved for all offers without custom limits")
      onSaved?.()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save default limits"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
      <span className="text-xs font-semibold text-slate-700">Default limits (all offers):</span>
      <LimitFields draft={draft} onChange={setDraft} disabled={saved == null || saving} />
      <button
        type="button"
        onClick={handleSave}
        disabled={!changed || saving}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {saving ? "Saving..." : "Save"}
      </button>
      {changed && !saving && <span className="text-[11px] font-medium text-amber-600">Unsaved changes</span>}
    </div>
  )
}

/**
 * Custom limits for one offer. Save stays disabled until a value differs from what the offer runs
 * with now; "Use default limits" puts a custom offer back on the defaults.
 */
const EditLimitsDialog = ({ bogo, onClose, onSaved }) => {
  const initial = toLimitDraft(bogo)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const changed = !sameLimitDraft(draft, initial)

  const save = async (body, message) => {
    setSaving(true)
    try {
      const res = await adminAPI.updateBogoOfferLimits(bogo._id, body)
      onSaved(res?.data?.data?.bogoOffer || {})
      toast.success(message)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update offer limits"))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    const limits = parseLimitDraft(draft)
    if (limits) save(limits, `Custom limits saved for "${bogo.food?.name || "this item"}"`)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-md w-full rounded-xl p-0 overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <DialogTitle className="text-lg font-semibold text-slate-900">Edit offer limits</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-3">
            <DishThumb src={bogo.food?.image} alt="" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{bogo.food?.name || "Item"}</p>
              <p className="text-xs text-slate-500">
                {bogo.useCustomLimits ? "Using custom limits" : "Using default limits"} · only this item changes
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <LimitFields draft={draft} onChange={setDraft} disabled={saving} />
          </div>
          <p className="text-xs text-slate-500">Uses per user: leave empty for unlimited. Cancelled orders don't count.</p>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
          {bogo.useCustomLimits ? (
            <button
              type="button"
              onClick={() => save({ useDefault: true }, `"${bogo.food?.name || "Item"}" now uses the default limits`)}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50"
            >
              Use default limits
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!changed || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Yes / Cancel dialog for the bulk actions; `confirm` = { title, message, confirmLabel, busyLabel, tone, run }. */
const ConfirmDialog = ({ confirm, busy, onClose }) => (
  <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && !busy && onClose()}>
    <DialogContent className="max-w-md w-full rounded-xl p-0 overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <DialogTitle className="text-lg font-semibold text-slate-900">{confirm?.title}</DialogTitle>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="px-5 pt-4 pb-4">
        <p className="text-sm text-slate-700">{confirm?.message}</p>
      </div>
      <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => confirm?.run()}
          disabled={busy}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirm?.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {busy ? confirm?.busyLabel : confirm?.confirmLabel}
        </button>
      </div>
    </DialogContent>
  </Dialog>
)

/** Restaurant logo, or its first letter when there's no photo. */
const RestaurantThumb = ({ src, name }) =>
  src ? (
    <img src={src} alt={name} className="h-12 w-12 rounded-lg object-cover flex-shrink-0 bg-slate-100" />
  ) : (
    <div className="h-12 w-12 rounded-lg flex-shrink-0 bg-blue-50 text-blue-600 flex items-center justify-center text-lg font-bold">
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  )

// Rows per page, same choices as the other admin lists (the server caps a page at 100).
const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DISH_PAGE_SIZE_KEY = "admin_bogo_dishes_pageSize"
const ADDED_PAGE_SIZE_KEY = "admin_bogo_added_pageSize"

const readPageSize = (key) => {
  try {
    const saved = Number(localStorage.getItem(key))
    return PAGE_SIZE_OPTIONS.includes(saved) ? saved : PAGE_SIZE_OPTIONS[0]
  } catch {
    return PAGE_SIZE_OPTIONS[0]
  }
}

const savePageSize = (key, size) => {
  try {
    localStorage.setItem(key, String(size))
  } catch {}
}

// Coming back to the browser tab refreshes the data at most this often.
const VISIBILITY_REFRESH_MS = 60 * 1000

const EMPTY_DISH_META ={ total: 0, outOfStockCount: 0, addedCount: 0, addableCount: 0 }

/** Restaurant whose every approved dish is a BOGO (from the restaurant counts). */
const isFullRestaurant = (r) => r.dishCount > 0 && r.bogoCount >= r.dishCount

/** Added BOGO search: dish or restaurant name. */
const matchesAddedQuery = (bogo, query) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [bogo.food?.name, bogo.restaurant?.name].some((text) => String(text || "").toLowerCase().includes(q))
}

/**
 * Admin-curated "Buy 1 Get 1 Free" dishes. Any approved dish from any restaurant can be added:
 * one by one (All Items), a whole restaurant, or every restaurant at once (All Restaurants).
 */
export default function BogoOffers() {
  const [bogoOffers, setBogoOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [editingLimits, setEditingLimits] = useState(null)

  // "added" = current BOGO offers; "all" = every approved dish; "restaurants" = restaurant list,
  // or one restaurant's dishes once openRestaurant is set.
  const [view, setView] = useState("added")
  const [openRestaurant, setOpenRestaurant] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const [restaurantQuery, setRestaurantQuery] = useState("")
  const [restaurants, setRestaurants] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(false)

  const loadBogoOffers = useCallback(async () => {
    try {
      const res = await adminAPI.getBogoOffers()
      setBogoOffers(res?.data?.data?.bogoOffers || [])
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load BOGO offers"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBogoOffers()
  }, [loadBogoOffers])

  // Stock / approval can change from the restaurant app: refresh when the admin comes back to this tab.
  // That refresh is silent: the list on screen stays (same page) and just gets the new data. At most
  // once a minute, so switching tabs back and forth doesn't hit the server every time.
  const [refreshKey, setRefreshKey] = useState(0)
  const silentRefresh = useRef(false)
  const lastRefreshAt = useRef(Date.now())
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - lastRefreshAt.current < VISIBILITY_REFRESH_MS) return
      lastRefreshAt.current = Date.now()
      loadBogoOffers()
      silentRefresh.current = true
      setRefreshKey((k) => k + 1)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [loadBogoOffers])

  const showDishes = view === "all" || (view === "restaurants" && openRestaurant)
  const openRestaurantId = openRestaurant?._id || ""

  // Dish picker is paged on the server; search, total and the Select / Unselect all counts cover every page.
  const [dishPage, setDishPage] = useState(1)
  const [dishPageSize, setDishPageSize] = useState(() => readPageSize(DISH_PAGE_SIZE_KEY))
  const [dishMeta, setDishMeta] = useState(EMPTY_DISH_META)
  const [dishReloadKey, setDishReloadKey] = useState(0)
  const reloadDishes = () => setDishReloadKey((k) => k + 1)

  useEffect(() => {
    if (!showDishes) return
    const silent = silentRefresh.current
    silentRefresh.current = false
    let cancelled = false
    const t = setTimeout(async () => {
      if (!silent) setSearching(true)
      try {
        const res = await adminAPI.searchBogoFoods({
          search: searchQuery.trim(),
          restaurantId: openRestaurantId,
          page: dishPage,
          limit: dishPageSize,
        })
        if (cancelled) return
        const data = res?.data?.data || {}
        setSearchResults(data.foods || [])
        setDishMeta({
          total: data.total || 0,
          outOfStockCount: data.outOfStockCount || 0,
          addedCount: data.addedCount || 0,
          addableCount: data.addableCount || 0,
        })
        // The list got shorter (e.g. after Unselect all): land on its last page.
        if (data.page && data.page !== dishPage) setDishPage(data.page)
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, "Failed to search food items"))
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [searchQuery, showDishes, openRestaurantId, dishPage, dishPageSize, refreshKey, dishReloadKey])

  // Added BOGO tab: searched and paged here (the whole list is loaded); rows can be ticked for Remove
  // selected. A restaurant with every dish BOGO shows as one row; opening it lists its dishes.
  const [addedQuery, setAddedQuery] = useState("")
  const [addedPage, setAddedPage] = useState(1)
  const [addedPageSize, setAddedPageSize] = useState(() => readPageSize(ADDED_PAGE_SIZE_KEY))
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [restaurantStats, setRestaurantStats] = useState([])
  const [openAddedRestaurant, setOpenAddedRestaurant] = useState(null)

  // Restaurant dish counts, to know which restaurants are fully BOGO. Refetched only when offers are
  // added or removed (the count changes), not on a status toggle or limit edit.
  const offerCount = bogoOffers.length
  useEffect(() => {
    if (view !== "added") return
    let cancelled = false
    adminAPI
      .getBogoRestaurants()
      .then((res) => !cancelled && setRestaurantStats(res?.data?.data?.restaurants || []))
      .catch((err) => !cancelled && toast.error(errorMessage(err, "Failed to load restaurants")))
    return () => {
      cancelled = true
    }
  }, [view, offerCount, refreshKey])

  const loadRestaurants = useCallback(async (search) => {
    setLoadingRestaurants(true)
    try {
      const res = await adminAPI.getBogoRestaurants({ search: search.trim() })
      setRestaurants(res?.data?.data?.restaurants || [])
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load restaurants"))
    } finally {
      setLoadingRestaurants(false)
    }
  }, [])

  useEffect(() => {
    if (view !== "restaurants" || openRestaurant) return
    const t = setTimeout(() => loadRestaurants(restaurantQuery), 300)
    return () => clearTimeout(t)
  }, [view, openRestaurant, restaurantQuery, refreshKey, loadRestaurants])

  const resetDishList = () => {
    setSearchQuery("")
    setSearchResults([])
    setDishMeta(EMPTY_DISH_META)
    setDishPage(1)
  }

  const switchView = (next) => {
    setView(next)
    setOpenRestaurant(null)
    setOpenAddedRestaurant(null)
    resetDishList()
  }

  const openAddedRestaurantDishes = (restaurant) => {
    setOpenAddedRestaurant(restaurant)
    setAddedQuery("")
    setAddedPage(1)
  }

  const openRestaurantDishes = (restaurant) => {
    setOpenRestaurant(restaurant)
    resetDishList()
  }

  const bogoByFoodId = new Map(bogoOffers.map((b) => [String(b.foodId), b]))

  // Select (restaurant only) / unselect all act on every dish matching the search (all pages), on the
  // server; out-of-stock dishes are included.
  const dishFilter = { search: searchQuery.trim(), restaurantId: openRestaurantId }

  // Added BOGO tab: fully-BOGO restaurants as restaurant rows, every other offer as an item row.
  const offersByRestaurant = new Map()
  bogoOffers.forEach((b) => {
    const key = String(b.restaurantId)
    if (!offersByRestaurant.has(key)) offersByRestaurant.set(key, [])
    offersByRestaurant.get(key).push(b)
  })
  const fullRestaurants = restaurantStats
    .filter(isFullRestaurant)
    .map((r) => ({ ...r, offers: offersByRestaurant.get(String(r._id)) || [] }))
  const fullRestaurantIds = new Set(fullRestaurants.map((r) => String(r._id)))

  const addedQueryText = addedQuery.trim().toLowerCase()
  const addedFullRestaurants = openAddedRestaurant
    ? []
    : fullRestaurants.filter((r) => !addedQueryText || r.name.toLowerCase().includes(addedQueryText))
  const addedItemSource = openAddedRestaurant
    ? offersByRestaurant.get(String(openAddedRestaurant._id)) || []
    : bogoOffers.filter((b) => !fullRestaurantIds.has(String(b.restaurantId)))
  const addedFiltered = addedItemSource.filter((bogo) => matchesAddedQuery(bogo, addedQuery))
  const addedPages = Math.max(1, Math.ceil(addedFiltered.length / addedPageSize))
  const addedPageSafe = Math.min(addedPage, addedPages)
  const addedPageRows = addedFiltered.slice((addedPageSafe - 1) * addedPageSize, addedPageSafe * addedPageSize)
  // Everything listed (restaurant rows count as all their offers), for "Select all".
  const addedVisibleIds = [...addedFullRestaurants.flatMap((r) => r.offers), ...addedFiltered].map((b) => b._id)
  // Ticks only count for offers that still exist.
  const selectedOffers = bogoOffers.filter((b) => selectedIds.has(b._id))
  const allSelected = (ids) => ids.length > 0 && ids.every((id) => selectedIds.has(id))
  const pageAllSelected = allSelected(addedPageRows.map((b) => b._id))
  const filteredAllSelected = allSelected(addedVisibleIds)

  const toggleSelected = (ids, on) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      return next
    })

  // Runs a bulk action, then refreshes the offers, the dish list and (on the restaurants tab) the restaurant counts.
  const runBulk = async (action, failMessage) => {
    setBulkBusy(true)
    try {
      await action()
      setConfirm(null)
      if (showDishes) reloadDishes()
      await Promise.all([loadBogoOffers(), view === "restaurants" && !openRestaurant ? loadRestaurants(restaurantQuery) : null])
    } catch (err) {
      toast.error(errorMessage(err, failMessage))
    } finally {
      setBulkBusy(false)
    }
  }

  const handleSelectAll = () =>
    runBulk(async () => {
      const res = await adminAPI.addBogoOffersByFilter(dishFilter)
      toast.success(`${pluralItems(res?.data?.data?.added ?? dishMeta.addableCount)} added to BOGO offers`)
    }, "Failed to add items")

  const askUnselectAll = () =>
    setConfirm({
      title: "Unselect all BOGO offers?",
      message: `${pluralItems(dishMeta.addedCount)}${openRestaurant ? ` of ${openRestaurant.name}` : ""}${searchQuery.trim() ? " matching your filter" : ""} will no longer be Buy 1 Get 1 Free. You can add them again anytime.`,
      confirmLabel: "Yes, remove all",
      busyLabel: "Removing...",
      tone: "danger",
      run: () =>
        runBulk(async () => {
          const res = await adminAPI.removeBogoOffersByFilter(dishFilter)
          toast.success(`${pluralItems(res?.data?.data?.removed ?? dishMeta.addedCount)} removed from BOGO offers`)
        }, "Failed to remove items"),
    })

  // Added BOGO tab: removes every ticked offer (any page).
  const askRemoveSelected = () =>
    setConfirm({
      title: "Remove selected BOGO offers?",
      message: `${pluralItems(selectedOffers.length)} will no longer be Buy 1 Get 1 Free. You can add them again anytime.`,
      confirmLabel: "Yes, remove selected",
      busyLabel: "Removing...",
      tone: "danger",
      run: () =>
        runBulk(async () => {
          const res = await adminAPI.removeBogoOffersBulk(selectedOffers.map((b) => b.foodId))
          toast.success(`${pluralItems(res?.data?.data?.removed ?? selectedOffers.length)} removed from BOGO offers`)
          setSelectedIds(new Set())
        }, "Failed to remove offers"),
    })

  // One restaurant from the list: every approved dish it has becomes BOGO.
  const handleAddRestaurant = (restaurant) =>
    runBulk(async () => {
      const res = await adminAPI.addBogoRestaurants({ restaurantIds: [restaurant._id] })
      toast.success(`${pluralItems(res?.data?.data?.added ?? 0)} of ${restaurant.name} added to BOGO offers`)
    }, "Failed to add restaurant")

  const askRemoveRestaurant = (restaurant) =>
    setConfirm({
      title: `Remove BOGO from ${restaurant.name}?`,
      message: `All ${pluralItems(restaurant.bogoCount)} of ${restaurant.name} will no longer be Buy 1 Get 1 Free. You can add them again anytime.`,
      confirmLabel: "Yes, remove all",
      busyLabel: "Removing...",
      tone: "danger",
      run: () =>
        runBulk(async () => {
          const res = await adminAPI.removeBogoRestaurants({ restaurantIds: [restaurant._id] })
          toast.success(`${pluralItems(res?.data?.data?.removed ?? 0)} of ${restaurant.name} removed from BOGO offers`)
        }, "Failed to remove restaurant"),
    })

  const restaurantsWithBogo = restaurants.filter((r) => r.bogoCount > 0).length

  const askUnselectAllRestaurants = () =>
    setConfirm({
      title: "Remove every BOGO offer?",
      message: `All ${pluralItems(bogoOffers.length)} will no longer be Buy 1 Get 1 Free, from every restaurant. You can add them again anytime.`,
      confirmLabel: "Yes, remove all",
      busyLabel: "Removing...",
      tone: "danger",
      run: () =>
        runBulk(async () => {
          const res = await adminAPI.removeBogoRestaurants({ all: true })
          toast.success(`${pluralItems(res?.data?.data?.removed ?? 0)} removed from BOGO offers`)
        }, "Failed to remove offers"),
    })

  const handleAdd = async (food) => {
    setBusyId(food._id)
    try {
      const res = await adminAPI.addBogoOffer(food._id)
      toast.success(`"${food.name}" added to BOGO offers`)
      setDishMeta((m) => ({ ...m, addedCount: m.addedCount + 1, addableCount: Math.max(0, m.addableCount - 1) }))
      // The server returns the new row in list shape: append it instead of reloading every offer.
      const row = res?.data?.data?.bogoOffer
      if (row?._id) setBogoOffers((prev) => [...prev, row])
      else await loadBogoOffers()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add BOGO offer"))
    } finally {
      setBusyId(null)
    }
  }

  // Remove asks for confirmation first; the dialog calls confirmRemove.
  const handleRemove = (bogo) => setPendingRemove(bogo)

  const confirmRemove = async () => {
    const bogo = pendingRemove
    if (!bogo) return
    setBusyId(bogo._id)
    try {
      await adminAPI.deleteBogoOffer(bogo._id)
      setBogoOffers((prev) => prev.filter((b) => b._id !== bogo._id))
      if (showDishes) {
        setDishMeta((m) => ({ ...m, addedCount: Math.max(0, m.addedCount - 1), addableCount: m.addableCount + 1 }))
      }
      toast.success(`"${bogo.food?.name || "Item"}" removed from BOGO offers`)
      setPendingRemove(null)
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove BOGO offer"))
    } finally {
      setBusyId(null)
    }
  }

  // Edit dialog saved: show the limits the offer now runs with.
  const handleLimitsSaved = (bogoId, saved) => {
    setBogoOffers((prev) =>
      prev.map((b) =>
        b._id === bogoId
          ? {
              ...b,
              useCustomLimits: saved.useCustomLimits === true,
              maxFreePerOrder: saved.maxFreePerOrder ?? b.maxFreePerOrder,
              usageLimitPerUser: saved.usageLimitPerUser ?? b.usageLimitPerUser,
            }
          : b,
      ),
    )
  }

  const handleToggle = async (bogo) => {
    setBusyId(bogo._id)
    try {
      const res = await adminAPI.toggleBogoOfferStatus(bogo._id)
      const isActive = res?.data?.data?.bogoOffer?.isActive
      setBogoOffers((prev) => prev.map((b) => (b._id === bogo._id ? { ...b, isActive } : b)))
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update status"))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 whitespace-nowrap">Buy One Get One Offers</h1>
            </div>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              Items added here are sold as "Buy 1 Get 1 Free": every unit bought comes with one more free.
              The cost of the free item is borne by the restaurant.
            </p>
            <ul className="text-sm text-slate-500 mt-1 ml-5 list-disc max-w-3xl">
              <li><span className="font-semibold text-slate-700">Free items / order</span> — 1 = buy 1 get 1 once per order; more units are charged at full price.</li>
              <li><span className="font-semibold text-slate-700">Uses per user</span> — how many orders one customer can get it in, ever (1 = one time). Empty = unlimited. Cancelled orders don't count.</li>
              <li>The default limits below apply to every offer. To change one item only, use the edit icon in its row.</li>
            </ul>
          </div>

          <div className="mt-4">
            <DefaultLimitsPanel onSaved={loadBogoOffers} />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-5">
            {[
              { value: "added", label: `Added BOGO (${bogoOffers.length})` },
              { value: "all", label: "All Items" },
              { value: "restaurants", label: "All Restaurants" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => switchView(tab.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${view === tab.value ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-100"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

          {view === "restaurants" && !openRestaurant && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-3">
                Add BOGO to every dish of a restaurant, or open a restaurant to pick its dishes.
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={restaurantQuery}
                  onChange={(e) => setRestaurantQuery(e.target.value)}
                  placeholder="Search restaurant"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-xs text-slate-500">
                  Total <span className="font-semibold text-slate-700">{restaurants.length} {restaurants.length === 1 ? "restaurant" : "restaurants"}</span>
                  {restaurantQuery.trim() ? " (matching your search)" : ""} · {restaurantsWithBogo} {restaurantsWithBogo === 1 ? "restaurant" : "restaurants"} with BOGO offer
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={askUnselectAllRestaurants}
                    disabled={bulkBusy || bogoOffers.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Unselect all restaurants
                  </button>
                </div>
              </div>
              {loadingRestaurants && restaurants.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading restaurants...
                </div>
              ) : restaurants.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No restaurants found.</p>
              ) : (
                <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                  {restaurants.map((restaurant) => {
                    const allAdded = restaurant.dishCount > 0 && restaurant.bogoCount >= restaurant.dishCount
                    return (
                      <div key={restaurant._id} className="flex items-center gap-3 p-3">
                        <button
                          type="button"
                          onClick={() => openRestaurantDishes(restaurant)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-lg -m-1 p-1 hover:bg-slate-50"
                          title="Open to pick dishes"
                        >
                          <RestaurantThumb src={restaurant.image} name={restaurant.name} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{restaurant.name}</p>
                            {(restaurant.area || restaurant.city) && (
                              <p className="text-xs text-slate-500 truncate">
                                {[restaurant.area, restaurant.city].filter(Boolean).join(", ")}
                              </p>
                            )}
                            <span
                              className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium ${allAdded ? "bg-green-100 text-green-700" : restaurant.bogoCount > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}
                            >
                              {restaurant.bogoCount} of {pluralItems(restaurant.dishCount)} BOGO
                            </span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        </button>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {allAdded ? (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700">All added</span>
                          ) : (
                            <button
                              type="button"
                              disabled={bulkBusy || restaurant.dishCount === 0}
                              onClick={() => handleAddRestaurant(restaurant)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add all dishes
                            </button>
                          )}
                          {restaurant.bogoCount > 0 && (
                            <button
                              type="button"
                              disabled={bulkBusy}
                              onClick={() => askRemoveRestaurant(restaurant)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove all
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {showDishes && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              {openRestaurant ? (
                <div className="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => openRestaurantDishes(null)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-600 hover:bg-slate-100"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> All Restaurants
                  </button>
                  <p className="text-sm font-semibold text-slate-900 truncate">{openRestaurant.name}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mb-3">All approved dishes from every restaurant.</p>
              )}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setDishPage(1)
                  }}
                  placeholder={openRestaurant ? "Filter by dish or category" : "Filter by dish, category or restaurant name"}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {searching ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No food items found.</p>
              ) : (
                <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-xs text-slate-500">
                    Total approved <span className="font-semibold text-slate-700">{pluralItems(dishMeta.total)}</span>
                    {dishMeta.outOfStockCount > 0 ? ` (${dishMeta.outOfStockCount} out of stock)` : ""} · {dishMeta.addedCount} added
                    {searchQuery.trim() ? " · matching your filter" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    {/* All Items adds one dish at a time; Select all is only for a whole restaurant. */}
                    {openRestaurant && (
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        disabled={bulkBusy || dishMeta.addableCount === 0}
                        title="Adds every matching dish, on all pages"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3.5 w-3.5" /> Select all{dishMeta.addableCount ? ` (${dishMeta.addableCount})` : ""}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={askUnselectAll}
                      disabled={bulkBusy || dishMeta.addedCount === 0}
                      title="Removes every matching dish, on all pages"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Unselect all{dishMeta.addedCount ? ` (${dishMeta.addedCount})` : ""}
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                  {searchResults.map((food) => {
                    const addedBogo = bogoByFoodId.get(String(food._id))
                    const outOfStock = !food.isAvailable
                    return (
                      <div key={food._id} className={`flex items-center gap-3 p-3 ${outOfStock ? "bg-slate-50" : ""}`}>
                        {/* Out-of-stock dishes are shown black & white until the restaurant turns them back on. */}
                        <div className={`flex min-w-0 flex-1 items-center gap-3 ${outOfStock ? "grayscale opacity-60" : ""}`}>
                        <DishThumb src={food.image} alt={food.name} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{food.name}</p>
                          {food.description && food.description.trim() !== food.name.trim() && (
                            <p className="text-xs text-slate-500 truncate">{food.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                            <span className="font-semibold text-slate-700">{food.restaurantName}</span>
                            {food.categoryName && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{food.categoryName}</span>
                            )}
                            <span className="text-slate-600">₹{food.price}</span>
                            {outOfStock && <span className="font-semibold text-slate-700">Unavailable · out of stock at restaurant</span>}
                          </div>
                        </div>
                        </div>
                        {addedBogo ? (
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700">Added</span>
                            <button
                              type="button"
                              disabled={busyId === addedBogo._id}
                              onClick={() => handleRemove({ ...addedBogo, food: addedBogo.food || food })}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === food._id}
                            title={outOfStock ? "Out of stock now: users see the offer once the restaurant has it back" : undefined}
                            onClick={() => handleAdd(food)}
                            className="flex flex-shrink-0 items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <AdminListPagination
                  currentPage={dishPage}
                  pageSize={dishPageSize}
                  totalItems={dishMeta.total}
                  onPageChange={setDishPage}
                  onPageSizeChange={(size) => {
                    setDishPageSize(size)
                    savePageSize(DISH_PAGE_SIZE_KEY, size)
                    setDishPage(1)
                  }}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  itemLabel="items"
                  className="mt-3 rounded-lg border border-slate-200"
                />
                </>
              )}
            </div>
          )}

        {view === "added" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading BOGO offers...
            </div>
          ) : bogoOffers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              No BOGO offers yet. Open "All Items" or "All Restaurants" to add dishes as Buy 1 Get 1 Free.
            </p>
          ) : (
            <>
            <div className="p-4 border-b border-slate-200 space-y-3">
              {openAddedRestaurant && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openAddedRestaurantDishes(null)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-600 hover:bg-slate-100"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Added BOGO
                  </button>
                  <p className="text-sm font-semibold text-slate-900 truncate">{openAddedRestaurant.name}</p>
                  {fullRestaurantIds.has(String(openAddedRestaurant._id)) && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Full restaurant</span>
                  )}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={addedQuery}
                  onChange={(e) => {
                    setAddedQuery(e.target.value)
                    setAddedPage(1)
                  }}
                  placeholder={openAddedRestaurant ? "Filter by dish name" : "Filter by dish or restaurant name"}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {addedFullRestaurants.length > 0 && (
                    <>
                      <span className="font-semibold text-slate-700">
                        {addedFullRestaurants.length} full {addedFullRestaurants.length === 1 ? "restaurant" : "restaurants"}
                      </span>{" · "}
                    </>
                  )}
                  <span className="font-semibold text-slate-700">{pluralItems(addedFiltered.length)}</span>
                  {addedQuery.trim() ? " (matching your filter)" : ""} · {selectedOffers.length} selected
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSelected(addedVisibleIds, !filteredAllSelected)}
                    disabled={bulkBusy || addedVisibleIds.length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {filteredAllSelected ? "Clear selection" : `Select all ${addedVisibleIds.length}${addedQuery.trim() ? " matching" : ""}`}
                  </button>
                  <button
                    type="button"
                    onClick={askRemoveSelected}
                    disabled={bulkBusy || selectedOffers.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove selected{selectedOffers.length ? ` (${selectedOffers.length})` : ""}
                  </button>
                </div>
              </div>
            </div>
            {addedFullRestaurants.length > 0 && (
              <div className="border-b border-slate-200">
                <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Full restaurants</p>
                <div className="divide-y divide-slate-100">
                  {addedFullRestaurants.map((restaurant) => {
                    const ids = restaurant.offers.map((b) => b._id)
                    const selected = allSelected(ids)
                    return (
                      <div key={restaurant._id} className={`flex items-center gap-3 px-4 py-3 ${selected ? "bg-blue-50/60" : ""}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelected(ids, !selected)}
                          aria-label={`Select all dishes of ${restaurant.name}`}
                          className="h-4 w-4 cursor-pointer accent-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => openAddedRestaurantDishes(restaurant)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-lg -m-1 p-1 hover:bg-slate-50"
                          title="Open to see its dishes"
                        >
                          <RestaurantThumb src={restaurant.image} name={restaurant.name} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{restaurant.name}</p>
                            <p className="text-xs text-slate-500">
                              All {pluralItems(restaurant.dishCount)} are Buy 1 Get 1 Free
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        </button>
                        <button
                          type="button"
                          disabled={bulkBusy}
                          onClick={() => askRemoveRestaurant(restaurant)}
                          className="flex flex-shrink-0 items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove all
                        </button>
                      </div>
                    )
                  })}
                </div>
                {addedFiltered.length > 0 && (
                  <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Items</p>
                )}
              </div>
            )}
            {addedFiltered.length === 0 ? (
              addedFullRestaurants.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-12">No BOGO offers match your filter.</p>
              )
            ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={pageAllSelected}
                      onChange={() => toggleSelected(addedPageRows.map((b) => b._id), !pageAllSelected)}
                      aria-label="Select all on this page"
                      className="h-4 w-4 cursor-pointer accent-blue-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left w-16">#</th>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Restaurant</th>
                  <th className="px-4 py-3 text-left">Price</th>
                  <th className="px-4 py-3 text-left">Free items / order</th>
                  <th className="px-4 py-3 text-left">Uses per user</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {addedPageRows.map((bogo, index) => {
                  const food = bogo.food
                  const hidden = !food || !food.isAvailable || food.approvalStatus !== "approved" || bogo.restaurant?.status !== "approved"
                  const selected = selectedIds.has(bogo._id)
                  return (
                    <tr key={bogo._id} className={`${busyId === bogo._id ? "opacity-60" : ""} ${selected ? "bg-blue-50/60" : ""}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelected([bogo._id], !selected)}
                          aria-label={`Select ${food?.name || "item"}`}
                          className="h-4 w-4 cursor-pointer accent-blue-600"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-500">{(addedPageSafe - 1) * addedPageSize + index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <DishThumb src={food?.image} alt={food?.name || ""} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{food?.name || "Deleted item"}</p>
                            {food?.description && <p className="text-xs text-slate-500 line-clamp-1 max-w-md">{food.description}</p>}
                            {hidden && (
                              <p className="text-xs text-amber-600 mt-0.5">Not shown to users (item unavailable / not approved)</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{bogo.restaurant?.name || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{food ? `₹${food.price}` : "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{bogo.maxFreePerOrder || 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold text-slate-900">{usesLabel(bogo.usageLimitPerUser)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${bogo.useCustomLimits ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}
                          >
                            {bogo.useCustomLimits ? "Custom" : "Default"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={bogo.isActive === true}
                            onCheckedChange={() => handleToggle(bogo)}
                            disabled={busyId === bogo._id}
                            aria-label={bogo.isActive ? "Hide from users" : "Show to users"}
                            className="scale-90 data-[state=checked]:bg-[#16a34a] data-[state=unchecked]:bg-zinc-400 shadow-sm"
                          />
                          <span className={`text-xs font-semibold ${bogo.isActive ? "text-green-700" : "text-slate-500"}`}>
                            {bogo.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditingLimits(bogo)}
                          disabled={busyId === bogo._id}
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                          aria-label="Edit limits for this item"
                          title="Edit limits for this item"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(bogo)}
                          disabled={busyId === bogo._id}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            )}
            <AdminListPagination
              currentPage={addedPageSafe}
              pageSize={addedPageSize}
              totalItems={addedFiltered.length}
              onPageChange={setAddedPage}
              onPageSizeChange={(size) => {
                setAddedPageSize(size)
                savePageSize(ADDED_PAGE_SIZE_KEY, size)
                setAddedPage(1)
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              itemLabel="offers"
            />
            </>
          )}
        </div>
        )}
      </div>

      <ConfirmDialog confirm={confirm} busy={bulkBusy} onClose={() => setConfirm(null)} />

      {editingLimits && (
        <EditLimitsDialog
          bogo={editingLimits}
          onClose={() => setEditingLimits(null)}
          onSaved={(saved) => handleLimitsSaved(editingLimits._id, saved)}
        />
      )}

      <Dialog open={Boolean(pendingRemove)} onOpenChange={(open) => !open && !busyId && setPendingRemove(null)}>
        <DialogContent className="max-w-md w-full rounded-xl p-0 overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <DialogTitle className="text-lg font-semibold text-slate-900">Remove BOGO offer?</DialogTitle>
            <button
              type="button"
              onClick={() => setPendingRemove(null)}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="px-5 pt-4 pb-4 flex items-center gap-3">
            <DishThumb src={pendingRemove?.food?.image} alt="" />
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{pendingRemove?.food?.name || "This item"}</span>
              {pendingRemove?.restaurant?.name || pendingRemove?.food?.restaurantName
                ? ` (${pendingRemove?.restaurant?.name || pendingRemove?.food?.restaurantName})`
                : ""}{" "}
              will no longer be Buy 1 Get 1 Free. You can add it again anytime.
            </p>
          </div>
          <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
            <button
              type="button"
              onClick={() => setPendingRemove(null)}
              disabled={Boolean(busyId)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemove}
              disabled={Boolean(busyId)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busyId ? "Removing..." : "Yes, remove"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
