import { BadgePercent } from "lucide-react"
import { getOrderBogoSummary } from "@food/utils/bogo"

// Buy 1 Get 1 on placed orders, shared by the admin and restaurant order screens.

const formatRupees = (value) => `₹${(Number(value) || 0).toFixed(2)}`

/** Small "Buy 1 Get 1" badge for a free order line or an order row. */
export function BogoBadge({ label = "Buy 1 Get 1", className = "" }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ${className}`}
    >
      <BadgePercent className="h-3 w-3" />
      {label}
    </span>
  )
}

/** Price cell of a free line: the dish price struck through, then FREE (never a bare ₹0.00). */
export function BogoFreePrice({ unitValue, quantity = 1, className = "" }) {
  const value = (Number(unitValue) || 0) * (Number(quantity) || 1)
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      {value > 0 && <span className="text-xs text-slate-400 line-through">{formatRupees(value)}</span>}
      <span className="text-sm font-bold text-emerald-600">FREE</span>
    </span>
  )
}

/**
 * Bill row: "Buy 1 Get 1 offer · 2 items free (worth ₹253)". Information only, not part of the
 * total; the free items are paid for by the restaurant.
 */
export function BogoBillRow({ order, className = "" }) {
  const { count, value } = getOrderBogoSummary(order)
  if (count <= 0) return null
  return (
    <div className={`flex justify-between gap-3 text-sm ${className}`}>
      <span className="text-slate-600">
        Buy 1 Get 1 offer
        <span className="block text-[11px] text-slate-400">Free items are paid by the restaurant · not added to the total</span>
      </span>
      <span className="text-right font-medium text-emerald-600">
        {count} {count === 1 ? "item" : "items"} free
        {value > 0 && <span className="block text-[11px] font-normal text-slate-500">worth {formatRupees(value)}</span>}
      </span>
    </div>
  )
}
