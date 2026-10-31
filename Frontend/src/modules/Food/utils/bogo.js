// Buy 1 Get 1 Free — mirrors Backend admin/services/bogoPricing.service.js.
// Every unit bought comes with one more of the same item free, up to the admin-set per-order
// limit (bogoMaxFree; limit 1: 1 → +1 free, 3 → +1 free). Extra units are charged normally.
// The free units are not charged; on the order they are a separate ₹0 line.

/** Per-order free limit of a BOGO line/menu item (defaults to 1). */
export const getBogoLimit = (item) => Math.max(1, Math.floor(Number(item?.bogoMaxFree) || 1))

const isBogoLine = (item) => item?.isBogo === true && item?.isBogoFree !== true

/**
 * The offer's limits in one short line for the cart: "Max 1 free per user & order" when both are 1,
 * else e.g. "Max 2 free per order · 3 orders per user" (uses per user comes from the server's cart line;
 * unlimited uses are left out).
 */
export const getBogoLimitsLabel = (item) => {
  const perOrder = getBogoLimit(item)
  const uses = Math.floor(Number(item?.bogoUsesPerUser) || 0)
  if (perOrder === 1 && uses === 1) return "Max 1 free per user & order"
  const parts = [`Max ${perOrder} free per order`]
  if (uses > 0) parts.push(uses === 1 ? "once per user" : `${uses} orders per user`)
  return parts.join(" · ")
}

/** The user has used up this offer (admin "uses per user"); the server sets it on cart lines. */
export const isBogoUsedUp = (item) => item?.bogoUsageExhausted === true

const dishKey = (item) => String(item?.itemId || item?.productId || item?.id || "")

/**
 * Free units per cart line (Map of line id → free qty). The limit is shared by all lines
 * (variants) of the same dish, in cart order — same as the server.
 */
export const getCartBogoFreeByLine = (items = []) => {
  const remaining = new Map()
  const result = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    if (!isBogoLine(item) || isBogoUsedUp(item)) continue
    const key = dishKey(item)
    const left = remaining.has(key) ? remaining.get(key) : getBogoLimit(item)
    const free = Math.max(0, Math.min(Math.floor(Number(item.quantity) || 0), left))
    remaining.set(key, left - free)
    result.set(item.id, free)
  }
  return result
}

/** What the customer saves on free units across cart lines (not deducted from the bill). */
export const getCartBogoSavings = (items = [], freeByLine = getCartBogoFreeByLine(items)) =>
  (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + (freeByLine.get(item?.id) || 0) * (Number(item?.price) || 0),
    0,
  )

// ----- Placed orders (admin / restaurant screens) -----
// The server adds each free unit as its own ₹0 line (isBogoFree) named "<dish> (FREE · Buy 1 Get 1)".

const FREE_NAME_SUFFIX = /\s*\(FREE · Buy 1 Get 1\)\s*$/

/** Plain-text marker for lists, prints and exports. */
export const BOGO_FREE_TEXT = "FREE · Buy 1 Get 1"

/** Order line that is a free Buy 1 Get 1 unit. */
export const isBogoFreeLine = (item) => item?.isBogoFree === true

/** Dish name without the "(FREE · Buy 1 Get 1)" suffix the server adds to free lines. */
export const bogoDishName = (item) => String(item?.name || "").replace(FREE_NAME_SUFFIX, "") || "Item"

/**
 * What one free unit is worth: the price of the paid line of the same dish / variant in the same
 * list, so admin screens show the customer price and restaurant screens the restaurant price.
 */
export const getBogoFreeUnitValue = (items = [], freeItem) => {
  const paid = (Array.isArray(items) ? items : []).find(
    (line) =>
      !isBogoFreeLine(line) &&
      String(line?.itemId || "") === String(freeItem?.itemId || "") &&
      String(line?.variantId || "") === String(freeItem?.variantId || ""),
  )
  return Number(paid?.price) || 0
}

/** Free units on an order and what they are worth (prices as listed on the order). */
export const getOrderBogoSummary = (order) => {
  const items = Array.isArray(order?.items) ? order.items : []
  return items.filter(isBogoFreeLine).reduce(
    (acc, line) => {
      const qty = Number(line.quantity) || 1
      acc.count += qty
      acc.value += qty * getBogoFreeUnitValue(items, line)
      return acc
    },
    { count: 0, value: 0 },
  )
}

/** Order got a Buy 1 Get 1 free item. */
export const orderHasBogo = (order) =>
  (Array.isArray(order?.items) && order.items.some(isBogoFreeLine)) || Number(order?.pricing?.bogoSavings) > 0

/** Total quantity of a BOGO dish in the cart, across its variant lines. */
export const getCartDishQuantity = (items = [], item) =>
  (Array.isArray(items) ? items : [])
    .filter((line) => isBogoLine(line) && dishKey(line) === dishKey(item))
    .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
