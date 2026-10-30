import { useEffect, useMemo, useState } from "react"
import { Minus, Plus, Store } from "lucide-react"
import { toast } from "sonner"
import { publicGetOnce } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import { isVegMenuItem } from "@food/utils/vegMode"
import { buildCartLineId, getDefaultFoodVariant } from "@food/utils/foodVariants"
import dishFallbackImage from "@food/assets/placeholders/dish_fallback.webp"

/** Fetches the admin-curated combo offers (optionally for one restaurant). */
export function useComboOffers({ zoneId, enabled = true } = {}) {
  const [comboOffers, setComboOffers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    publicGetOnce("/food/combo-offers/public", zoneId ? { params: { zoneId } } : {})
      .then((res) => {
        if (!cancelled) setComboOffers(res?.data?.data?.comboOffers || [])
      })
      .catch(() => {
        if (!cancelled) setComboOffers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [zoneId, enabled])

  return { comboOffers, loading }
}

/** Restaurant switched itself offline / deactivated, as opposed to just being outside its hours. */
const isManuallyOffline = (availability) =>
  availability?.reason === "inactive" || availability?.reason === "not-accepting-orders"

const availabilityRank = (availability) =>
  availability?.isOpen ? 0 : isManuallyOffline(availability) ? 2 : 1

/** Builds the cart line the same way the restaurant menu does, so quantities stay in sync. */
const toCartItem = (item, restaurant) => {
  const variant = getDefaultFoodVariant(item)
  const lineItemId = buildCartLineId(item.id || item._id, variant?.id || "")
  return {
    id: lineItemId,
    lineItemId,
    itemId: item.id || item._id,
    name: item.name,
    price: variant?.price ?? item.price,
    basePrice: variant?.basePrice ?? item.basePrice ?? variant?.price ?? item.price,
    markupAmount: variant?.markupAmount ?? item.markupAmount ?? 0,
    variantId: variant?.id || "",
    variantName: variant?.name || "",
    variantPrice: variant?.price ?? item.price,
    image: item.image,
    restaurant: restaurant.name,
    restaurantId: restaurant._id,
    restaurantZoneId: restaurant.zoneId ? String(restaurant.zoneId) : "",
    description: item.description,
    isVeg: isVegMenuItem(item),
    foodType: item.foodType,
    preparationTime: item.preparationTime,
    pricingScope: variant?.pricingScope ?? item.pricingScope ?? null,
    appliedPricingType: variant?.appliedPricingType ?? item.appliedPricingType ?? null,
    appliedPricingValue: variant?.appliedPricingValue ?? item.appliedPricingValue ?? null,
  }
}

/** ADD button / quantity stepper that writes straight to the cart. */
export function ComboAddButton({ item, restaurant, isOutOfService = false, disabled = false, className = "" }) {
  const { addToCart, updateQuantity, getCartItem } = useCart()
  const cartItem = toCartItem(item, restaurant)
  const quantity = getCartItem(cartItem.id)?.quantity || 0

  const sourceFromEvent = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    if (!rect) return null
    return {
      viewportX: rect.left + rect.width / 2,
      viewportY: rect.top + rect.height / 2,
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
      itemId: cartItem.id,
    }
  }

  const canOrder = () => {
    if (!isModuleAuthenticated("user")) {
      window.dispatchEvent(new CustomEvent("show-login-required"))
      return false
    }
    if (isOutOfService) {
      toast.error("You are outside the service zone. Please select a location within the service area.")
      return false
    }
    const availability = getRestaurantAvailabilityStatus(restaurant)
    if (!availability.isOpen) {
      // Closed only by its timings (card still looks normal): tell the user when it opens.
      if (!isManuallyOffline(availability) && availability.openingTime) {
        toast.error(`${restaurant.name} is closed right now. Opens at ${availability.openingTime}.`)
      } else {
        toast.error(`${restaurant.name} is currently offline. Please try again later.`)
      }
      return false
    }
    return true
  }

  const handleAdd = (event) => {
    event.stopPropagation()
    if (!canOrder()) return
    const source = sourceFromEvent(event)
    if (quantity > 0) {
      updateQuantity(cartItem.id, quantity + 1, source, { id: cartItem.id, name: item.name, imageUrl: item.image })
      return
    }
    Promise.resolve(addToCart(cartItem, source)).then((result) => {
      // Cart-mode conflicts already show their own toast from CartContext.
      if (result?.ok === false && result.code !== "ORDER_TYPE_MISMATCH") {
        toast.error(result.error || "Cannot add item from different restaurant. Please clear cart first.")
      }
    })
  }

  const handleRemove = (event) => {
    event.stopPropagation()
    updateQuantity(cartItem.id, quantity - 1, sourceFromEvent(event), { id: cartItem.id, name: item.name, imageUrl: item.image })
  }

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={`flex items-center justify-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-4 py-1.5 text-sm font-bold text-gray-400 cursor-not-allowed ${className}`}
      >
        ADD <Plus className="h-3.5 w-3.5" />
      </button>
    )
  }

  if (quantity > 0) {
    return (
      <div onClick={(e) => e.stopPropagation()} className={`flex items-center justify-between rounded-lg bg-[#DC2626] text-white font-bold text-sm shadow-sm ${className}`}>
        <button type="button" onClick={handleRemove} className="px-2.5 py-1.5" aria-label="Remove one">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[1.25rem] text-center">{quantity}</span>
        <button type="button" onClick={handleAdd} className="px-2.5 py-1.5" aria-label="Add one">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      className={`flex items-center justify-center gap-1 rounded-lg border border-[#DC2626] bg-white dark:bg-[#1a1a1a] px-4 py-1.5 text-sm font-bold text-[#DC2626] shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ${className}`}
    >
      ADD <Plus className="h-3.5 w-3.5" />
    </button>
  )
}

// Same scallop "%" offer badge as the restaurant cards, inverted (white badge, blue %) for a blue chip.
const OfferScallop = ({ className = "" }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={`flex-shrink-0 fill-white ${className}`}>
    <path d="M 86.29 42.78 Q 95.00 50.00 86.29 57.22 Q 91.57 67.22 80.76 70.56 Q 81.82 81.82 70.56 80.76 Q 67.22 91.57 57.22 86.29 Q 50.00 95.00 42.78 86.29 Q 32.78 91.57 29.44 80.76 Q 18.18 81.82 19.24 70.56 Q 8.43 67.22 13.71 57.22 Q 5.00 50.00 13.71 42.78 Q 8.43 32.78 19.24 29.44 Q 18.18 18.18 29.44 19.24 Q 32.78 8.43 42.78 13.71 Q 50.00 5.00 57.22 13.71 Q 67.22 8.43 70.56 19.24 Q 81.82 18.18 80.76 29.44 Q 91.57 32.78 86.29 42.78 Z" />
    <text x="50" y="63" textAnchor="middle" fontSize="42" fontWeight="900" fill="#2563EB" className="select-none font-sans">%</text>
  </svg>
)

const VegMark = ({ isVeg }) => (
  <span
    className={`inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] border bg-white ${isVeg ? "border-green-600" : "border-red-600"}`}
    aria-label={isVeg ? "Veg" : "Non-veg"}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`} />
  </span>
)

/**
 * Home page "Combo Offers" slider. Combos from open restaurants come first (admin order kept);
 * offline / closed ones go last in black & white with ADD disabled, like "Recommended For You".
 * Veg mode hides non-veg combos.
 */
export default function ComboOffersRow({ zoneId, zoneLoading = false, isOutOfService = false, vegMode = false, onOpenRestaurant }) {
  const { comboOffers, loading } = useComboOffers({ zoneId, enabled: !zoneLoading })

  // Re-check open/closed every minute so cards flip without a reload.
  const [availabilityTick, setAvailabilityTick] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setAvailabilityTick(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const visibleCombos = useMemo(() => {
    const now = new Date(availabilityTick)
    return comboOffers
      .filter(({ item }) => !vegMode || isVegMenuItem(item))
      .map((combo, order) => ({ ...combo, order, availability: getRestaurantAvailabilityStatus(combo.restaurant, now) }))
      // Open first, then closed-by-timings, then manually-offline last; admin order within each group.
      .sort((a, b) => (availabilityRank(a.availability) - availabilityRank(b.availability)) || (a.order - b.order))
  }, [comboOffers, vegMode, availabilityTick])

  // Skeletons while the list loads (like "Recommended For You"); nothing at all once we know it's empty.
  if (!loading && visibleCombos.length === 0) return null

  return (
    <section className="content-auto pt-4 sm:pt-5">
      <h2 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2 sm:mb-3 px-4">
        Combo Offers
      </h2>
      {/* No scroll-snap: snapping pulled the first card flush against the left edge, ignoring px-4. */}
      <div className="flex overflow-x-auto gap-3.5 pb-4 scrollbar-hide px-4 mask-edge-fade">
        {loading && visibleCombos.length === 0 && Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`combo-skeleton-${i}`}
            aria-hidden="true"
            className="flex-shrink-0 w-[270px] sm:w-[300px] rounded-[20px] overflow-hidden border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] shadow-md animate-pulse"
          >
            <div className="h-[190px] sm:h-[210px] bg-gray-200 dark:bg-gray-800" />
            <div className="p-3">
              <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-700 mt-2" />
              <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-800 mt-3" />
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-gray-100 dark:border-gray-800">
                <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-700" />
                <div className="h-8 w-[84px] rounded-lg bg-gray-200 dark:bg-gray-800" />
              </div>
            </div>
          </div>
        ))}
        {visibleCombos.map(({ _id, item, restaurant, availability }) => {
          const isOffline = isManuallyOffline(availability)
          // Black & white + disabled ADD whenever the restaurant can't take the order right now.
          const unavailable = isOutOfService || !availability.isOpen
          return (
          <div
            key={_id}
            className={`flex-shrink-0 w-[270px] sm:w-[300px] flex flex-col rounded-[20px] overflow-hidden border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] shadow-md ${unavailable ? "grayscale opacity-75" : ""}`}
          >
            {/* Offer posters put their headline at the top: fill the card but anchor the crop to the top edge. */}
            <div className="relative h-[190px] sm:h-[210px] overflow-hidden bg-gray-100 dark:bg-gray-800">
              <img
                src={item.image || dishFallbackImage}
                alt={item.name}
                // Eager: lazy images in a horizontal slider showed up blank on a fast swipe.
                // The card itself (text, price, ADD) is always rendered; only the photo fills in.
                loading="eager"
                decoding="async"
                onError={(e) => {
                  if (e.currentTarget.dataset.fallback) return
                  e.currentTarget.dataset.fallback = "1"
                  e.currentTarget.src = dishFallbackImage
                }}
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="flex flex-1 flex-col p-3">
              <div className="flex items-start gap-1.5">
                <span className="mt-1"><VegMark isVeg={isVegMenuItem(item)} /></span>
                <h3 className="text-sm sm:text-base font-bold leading-snug text-gray-900 dark:text-white line-clamp-2 min-h-[2.75em]">{item.name}</h3>
              </div>
              {/* No description here (the restaurant menu shows it): keeps every combo card the same layout. */}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-base font-bold text-gray-900 dark:text-white">₹{Math.round(Number(item.price) || 0)}</p>
                <div className="flex min-w-0 items-center gap-2">
                  {!availability.isOpen && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${isOffline ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}>
                      {isOffline ? "Offline" : availability.openingTime ? `Opens at ${availability.openingTime}` : "Closed"}
                    </span>
                  )}
                  {/* Combo Offers badge (two lines, matches the price height): blue like the restaurant-card offers, glossy top edge. */}
                  <span className="relative inline-flex flex-shrink-0 items-center gap-1 overflow-hidden rounded-md bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] px-2 py-1 text-[9px] font-medium uppercase leading-[1.15] tracking-[0.08em] antialiased text-white shadow-sm shadow-blue-900/25 ring-1 ring-inset ring-white/20">
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
                    <OfferScallop className="h-4 w-4" />
                    <span className="flex flex-col items-start">
                      <span>Combo</span>
                      <span>Offers</span>
                    </span>
                  </span>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenRestaurant?.(restaurant, item)
                  }}
                  className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300"
                >
                  <Store className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{restaurant.name}</span>
                </button>
                <ComboAddButton
                  item={item}
                  restaurant={restaurant}
                  isOutOfService={isOutOfService}
                  disabled={unavailable}
                  className="flex-shrink-0 w-[84px]"
                />
              </div>
            </div>
          </div>
          )
        })}
      </div>
    </section>
  )
}
