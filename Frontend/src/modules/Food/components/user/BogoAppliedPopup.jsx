import { useEffect, useRef, useState } from "react"
import { BadgePercent } from "lucide-react"
import confetti from "canvas-confetti"
import { toast } from "sonner"
import { useCart } from "@food/context/CartContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import { getBogoLimit, getCartBogoFreeByLine, getCartDishQuantity, isBogoUsedUp } from "@food/utils/bogo"

const lineKey = (item) => `${item?.itemId || item?.productId || item?.id || ""}::${item?.variantId || ""}`
const dishKey = (item) => String(item?.itemId || item?.productId || item?.id || "")

const AUTO_CLOSE_MS = 3500

/** Buy 1 Get 1 notice in the app's branded toast card (same shape as the other user toasts). */
const showBogoToast = (id, title, message) =>
  toast.custom(
    () => (
      <div className="w-[calc(100vw-32px)] sm:w-[380px] bg-white dark:bg-[#1a1a1a] shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-3xl pointer-events-auto flex items-center gap-4 p-3.5 border border-gray-50 dark:border-gray-800 animate-in fade-in slide-in-from-top-4">
        <div className="flex-shrink-0">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#4f8bff] to-[#1d4ed8] flex items-center justify-center shadow-lg">
            <BadgePercent size={26} className="text-white" />
          </div>
        </div>
        <div className="flex-1 pr-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{title}</p>
          <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-snug">{message}</p>
        </div>
      </div>
    ),
    { id, duration: 4000, position: "top-center" },
  )

/**
 * Watches the cart for Buy 1 Get 1 lines:
 * - free unit first unlocked → "offer applied" popup with confetti, once per line until it's removed;
 * - quantity raised past the admin-set per-order free limit → toast that extra units are charged;
 * - offer already used up by this user (admin "uses per user") → toast, no popup.
 * For a logged-in user a just-added line waits for the server's reply (which knows their usage)
 * before it can celebrate. The cart as loaded from the server is the baseline, so reopening the
 * app never pops anything.
 */
export default function BogoAppliedPopup() {
  const { cart, cartReady } = useCart()
  const [applied, setApplied] = useState(null)
  const prevQtyRef = useRef(null)
  const prevFreeRef = useRef(new Map())
  const prevDishQtyRef = useRef(new Map())
  const celebratedRef = useRef(new Set())
  const usedUpWarnedRef = useRef(new Set())
  // Dishes already told about the per-order free limit; cleared once the dish is back within it.
  const limitWarnedRef = useRef(new Set())

  useEffect(() => {
    if (!cartReady) return
    const lines = Array.isArray(cart) ? cart : []
    const loggedIn = isModuleAuthenticated("user")
    const confirmed = (item) => !loggedIn || item?.bogoServerChecked === true
    const allFree = getCartBogoFreeByLine(lines)
    const freeByKey = new Map(
      lines.map((item) => [lineKey(item), confirmed(item) ? allFree.get(item.id) || 0 : 0]),
    )
    const next = new Map(lines.map((item) => [lineKey(item), Number(item?.quantity) || 0]))
    const prev = prevQtyRef.current
    const prevFree = prevFreeRef.current
    const prevDishQty = prevDishQtyRef.current
    prevQtyRef.current = next
    prevFreeRef.current = freeByKey
    prevDishQtyRef.current = new Map(
      lines.filter((item) => item?.isBogo === true).map((item) => [dishKey(item), getCartDishQuantity(lines, item)]),
    )

    if (!prev) {
      // Baseline: lines already in the cart don't celebrate or warn.
      lines.forEach((item) => {
        if (allFree.get(item.id) > 0) celebratedRef.current.add(lineKey(item))
        if (isBogoUsedUp(item)) usedUpWarnedRef.current.add(lineKey(item))
        if (item?.isBogo === true && getCartDishQuantity(lines, item) > getBogoLimit(item)) limitWarnedRef.current.add(dishKey(item))
      })
      return
    }

    // A removed line can celebrate / warn again if it's added back later.
    ;[celebratedRef.current, usedUpWarnedRef.current].forEach((set) =>
      set.forEach((key) => {
        if (!next.has(key)) set.delete(key)
      }),
    )

    // Offer already used up by this user: say so once per line.
    for (const item of lines) {
      const key = lineKey(item)
      if (!isBogoUsedUp(item) || usedUpWarnedRef.current.has(key)) continue
      usedUpWarnedRef.current.add(key)
      showBogoToast(
        `bogo-used-toast-${dishKey(item)}`,
        `You've already used Buy 1 Get 1 on ${item.name || "this item"}`,
        "This offer has a usage limit per customer, so this item is charged at full price.",
      )
    }

    // Past the free limit: extra units of the dish are charged. Said once when the dish first goes
    // over the limit (the cart's free line keeps showing it); again only after it was back within it.
    const overLimit = new Set(
      lines
        .filter((item) => item?.isBogo === true && getCartDishQuantity(lines, item) > getBogoLimit(item))
        .map(dishKey),
    )
    limitWarnedRef.current.forEach((key) => {
      if (!overLimit.has(key)) limitWarnedRef.current.delete(key)
    })
    for (const item of lines) {
      if (item?.isBogo !== true || isBogoUsedUp(item) || limitWarnedRef.current.has(dishKey(item))) continue
      const limit = getBogoLimit(item)
      const dishQty = getCartDishQuantity(lines, item)
      if (dishQty > limit && dishQty > (prevDishQty.get(dishKey(item)) || 0)) {
        limitWarnedRef.current.add(dishKey(item))
        showBogoToast(
          `bogo-limit-toast-${dishKey(item)}`,
          `Buy 1 Get 1: only ${limit} free ${limit === 1 ? "item" : "items"} per order`,
          `You get ${limit} free on ${limit} ${item.name || "item"}. Extra quantity is charged.`,
        )
      }
    }

    for (const item of lines) {
      const key = lineKey(item)
      if (!(freeByKey.get(key) > 0) || (prevFree.get(key) || 0) > 0 || celebratedRef.current.has(key)) continue

      celebratedRef.current.add(key)
      setApplied({ name: item.name || "Item", saved: Math.round(Number(item.price) || 0) })
      return
    }
  }, [cart, cartReady])

  useEffect(() => {
    if (!applied) return
    confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.55 }, zIndex: 10000 })
    const timer = setTimeout(() => setApplied(null), AUTO_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [applied])

  if (!applied) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-6"
      onClick={() => setApplied(null)}
      role="dialog"
      aria-modal="true"
      aria-label="Buy 1 Get 1 offer applied"
    >
      <style>{`@keyframes bogoPopIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }`}</style>
      <div
        className="relative w-full max-w-xs rounded-3xl bg-white px-6 pb-5 pt-12 text-center shadow-2xl dark:bg-[#1a1a1a]"
        style={{ animation: "bogoPopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -top-9 left-1/2 flex h-[72px] w-[72px] -translate-x-1/2 items-center justify-center rounded-full bg-[#256fef] shadow-lg ring-4 ring-white dark:ring-[#1a1a1a]">
          <BadgePercent size={38} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">'BUY 1 GET 1' applied</p>
        <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-white">₹{applied.saved}</p>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">saved with this offer</p>
        <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
          1 more {applied.name} added free to your order
        </p>
        <button
          type="button"
          onClick={() => setApplied(null)}
          className="mt-5 w-full rounded-xl py-2.5 text-sm font-bold text-[#256fef] hover:bg-[#256fef]/10"
        >
          Woohoo! Thanks
        </button>
      </div>
    </div>
  )
}
