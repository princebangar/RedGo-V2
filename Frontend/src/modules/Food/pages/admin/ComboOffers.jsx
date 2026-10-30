import { useState, useEffect, useCallback } from "react"
import { Search, Trash2, ArrowUp, ArrowDown, Plus, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@food/components/ui/dialog"
import { Switch } from "@food/components/ui/switch"
import dishFallbackImage from "@food/assets/placeholders/dish_fallback.webp"

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

/** Admin-curated combo dishes shown in the "Combo Offers" slider on the user home page. */
export default function ComboOffers() {
  const [comboOffers, setComboOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null)

  // "added" = what users currently see; "offers" = restaurant offer/combo items to pick from.
  const [view, setView] = useState("added")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmUnselectAll, setConfirmUnselectAll] = useState(false)

  const loadComboOffers = useCallback(async () => {
    try {
      const res = await adminAPI.getComboOffers()
      setComboOffers(res?.data?.data?.comboOffers || [])
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load combo offers"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadComboOffers()
  }, [loadComboOffers])

  // Stock / approval can change from the restaurant app: refresh when the admin comes back to this tab.
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      loadComboOffers()
      setRefreshKey((k) => k + 1)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [loadComboOffers])

  useEffect(() => {
    if (view === "added") return
    let cancelled = false
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await adminAPI.searchComboFoods({ search: searchQuery.trim(), onlyOffers: true })
        if (!cancelled) setSearchResults(res?.data?.data?.foods || [])
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
  }, [searchQuery, view, refreshKey])

  const comboByFoodId = new Map(comboOffers.map((c) => [String(c.foodId), c]))

  // Select / unselect all act on the items currently listed (so a search narrows them down).
  const selectableIds = searchResults
    .filter((food) => food.isAvailable && !comboByFoodId.has(String(food._id)))
    .map((food) => food._id)
  const addedListedIds = searchResults
    .filter((food) => comboByFoodId.has(String(food._id)))
    .map((food) => food._id)

  const handleSelectAll = async () => {
    if (selectableIds.length === 0) return
    setBulkBusy(true)
    try {
      const res = await adminAPI.addComboOffersBulk(selectableIds)
      toast.success(`${pluralItems(res?.data?.data?.added ?? selectableIds.length)} added to combo offers`)
      await loadComboOffers()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add items"))
    } finally {
      setBulkBusy(false)
    }
  }

  const handleUnselectAll = async () => {
    if (addedListedIds.length === 0) return
    setBulkBusy(true)
    try {
      const res = await adminAPI.removeComboOffersBulk(addedListedIds)
      toast.success(`${pluralItems(res?.data?.data?.removed ?? addedListedIds.length)} removed from combo offers`)
      setConfirmUnselectAll(false)
      await loadComboOffers()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove items"))
    } finally {
      setBulkBusy(false)
    }
  }

  const handleAdd = async (food) => {
    setBusyId(food._id)
    try {
      await adminAPI.addComboOffer(food._id)
      toast.success(`"${food.name}" added to combo offers`)
      await loadComboOffers()
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add combo offer"))
    } finally {
      setBusyId(null)
    }
  }

  // Remove asks for confirmation first; the dialog calls confirmRemove.
  const handleRemove = (combo) => setPendingRemove(combo)

  const confirmRemove = async () => {
    const combo = pendingRemove
    if (!combo) return
    setBusyId(combo._id)
    try {
      await adminAPI.deleteComboOffer(combo._id)
      setComboOffers((prev) => prev.filter((c) => c._id !== combo._id))
      toast.success(`"${combo.food?.name || "Item"}" removed from combo offers`)
      setPendingRemove(null)
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove combo offer"))
    } finally {
      setBusyId(null)
    }
  }

  const handleToggle = async (combo) => {
    setBusyId(combo._id)
    try {
      const res = await adminAPI.toggleComboOfferStatus(combo._id)
      const isActive = res?.data?.data?.comboOffer?.isActive
      setComboOffers((prev) => prev.map((c) => (c._id === combo._id ? { ...c, isActive } : c)))
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update status"))
    } finally {
      setBusyId(null)
    }
  }

  // Swap with the neighbour, then persist both positions as their list index.
  const handleMove = async (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= comboOffers.length) return
    const next = [...comboOffers]
    ;[next[index], next[target]] = [next[target], next[index]]
    setComboOffers(next)
    setBusyId(next[target]._id)
    try {
      await Promise.all([
        adminAPI.updateComboOfferOrder(next[index]._id, index + 1),
        adminAPI.updateComboOfferOrder(next[target]._id, target + 1),
      ])
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update order"))
      loadComboOffers()
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
              <h1 className="text-2xl font-bold text-slate-900 whitespace-nowrap">Combo Offers</h1>
            </div>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              Items added here appear in the "Combo Offers" slider on the user home page and at the top of their restaurant's menu.
              Customers can add them to cart directly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-5">
            {[
              { value: "added", label: `Added Combos (${comboOffers.length})` },
              { value: "offers", label: "Restaurant Offers & Combos" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setView(tab.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${view === tab.value ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-100"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

          {view !== "added" && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-3">
                Items restaurants have created as offers/combos (Offer, Combo, Deal or Meal categories, or names like "Combo", "Buy…", "A + B").
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by dish, category or restaurant name"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {searching ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No restaurant offer/combo items found.</p>
              ) : (
                <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-xs text-slate-500">
                    {pluralItems(searchResults.length)} · {addedListedIds.length} added
                    {searchQuery.trim() ? " (matching your filter)" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      disabled={bulkBusy || selectableIds.length === 0}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-3.5 w-3.5" /> Select all{selectableIds.length ? ` (${selectableIds.length})` : ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUnselectAll(true)}
                      disabled={bulkBusy || addedListedIds.length === 0}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Unselect all{addedListedIds.length ? ` (${addedListedIds.length})` : ""}
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                  {searchResults.map((food) => {
                    const addedCombo = comboByFoodId.get(String(food._id))
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
                        {addedCombo ? (
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700">Added</span>
                            <button
                              type="button"
                              disabled={busyId === addedCombo._id}
                              onClick={() => handleRemove({ ...addedCombo, food: addedCombo.food || food })}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={outOfStock || busyId === food._id}
                            title={outOfStock ? "This item is out of stock at the restaurant" : undefined}
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
                </>
              )}
            </div>
          )}

        {view === "added" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading combo offers...
            </div>
          ) : comboOffers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              No combo offers yet. Open "Restaurant Offers & Combos" and click Add on the items you want on the home page.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left w-20">Order</th>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Restaurant</th>
                  <th className="px-4 py-3 text-left">Price</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {comboOffers.map((combo, index) => {
                  const food = combo.food
                  const hidden = !food || !food.isAvailable || food.approvalStatus !== "approved" || combo.restaurant?.status !== "approved"
                  return (
                    <tr key={combo._id} className={busyId === combo._id ? "opacity-60" : ""}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => handleMove(index, -1)} disabled={index === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => handleMove(index, 1)} disabled={index === comboOffers.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
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
                      <td className="px-4 py-3 text-slate-700">{combo.restaurant?.name || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{food ? `₹${food.price}` : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={combo.isActive === true}
                            onCheckedChange={() => handleToggle(combo)}
                            disabled={busyId === combo._id}
                            aria-label={combo.isActive ? "Hide from users" : "Show to users"}
                            className="scale-90 data-[state=checked]:bg-[#16a34a] data-[state=unchecked]:bg-zinc-400 shadow-sm"
                          />
                          <span className={`text-xs font-semibold ${combo.isActive ? "text-green-700" : "text-slate-500"}`}>
                            {combo.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemove(combo)}
                          disabled={busyId === combo._id}
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
          )}
        </div>
        )}
      </div>

      <Dialog open={confirmUnselectAll} onOpenChange={(open) => !open && !bulkBusy && setConfirmUnselectAll(false)}>
        <DialogContent className="max-w-md w-full rounded-xl p-0 overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <DialogTitle className="text-lg font-semibold text-slate-900">Unselect all combo offers?</DialogTitle>
            <button
              type="button"
              onClick={() => setConfirmUnselectAll(false)}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="px-5 pt-4 pb-4">
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{pluralItems(addedListedIds.length)}</span>
              {searchQuery.trim() ? " matching your filter" : ""} will be removed from the Combo Offers section for users.
              You can add them again anytime.
            </p>
          </div>
          <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
            <button
              type="button"
              onClick={() => setConfirmUnselectAll(false)}
              disabled={bulkBusy}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUnselectAll}
              disabled={bulkBusy}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkBusy ? "Removing..." : "Yes, remove all"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingRemove)} onOpenChange={(open) => !open && !busyId && setPendingRemove(null)}>
        <DialogContent className="max-w-md w-full rounded-xl p-0 overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <DialogTitle className="text-lg font-semibold text-slate-900">Remove combo offer?</DialogTitle>
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
              will no longer appear in the Combo Offers section for users. You can add it again anytime.
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
