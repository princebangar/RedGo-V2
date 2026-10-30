import { Link } from "react-router-dom"
import { X, ChevronRight } from "lucide-react"
import { useCart } from "@food/context/CartContext"
import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import dishFallbackImage from "@food/assets/placeholders/dish_fallback.webp"
import { isBottomNavVisible, subscribeBottomNavVisibility } from "@food/utils/bottomNavEvents"
import { flyToCart, bumpElement, sourceToViewportPoint } from "@food/utils/flyToCart"

// Mobile: the card sits 16px above the bottom nav (nav = bottom-6 + 72px tall). When the nav
// hides on scroll, the card slides down but keeps a comfortable gap from the screen edge.
const CARD_BOTTOM_WITH_NAV_PX = 112
const CARD_BOTTOM_WITHOUT_NAV_PX = 32

const lineBaseId = (id) => String(id || "").split("::")[0]

export default function StickyCartCard() {
  const { cart, getCartCount, lastAddEvent } = useCart()
  const [isVisible, setIsVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(() => typeof window === "undefined" || window.innerWidth < 768)
  const [navVisible, setNavVisible] = useState(isBottomNavVisible)
  const [flying, setFlying] = useState(null)
  const cardRef = useRef(null)
  const thumbsRef = useRef(null)
  const cartCount = getCartCount()
  const prevCountRef = useRef(cartCount)

  // Closed with X? Any new item (ADD or +) brings the card back.
  useEffect(() => {
    if (cartCount > prevCountRef.current) setIsVisible(true)
    prevCountRef.current = cartCount
  }, [cartCount])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    setNavVisible(isBottomNavVisible())
    return subscribeBottomNavVisibility(setNavVisible)
  }, [])

  // ADD / + tapped somewhere on the page: fly the dish photo from the button into the card.
  useEffect(() => {
    const from = sourceToViewportPoint(lastAddEvent?.sourcePosition)
    if (!from) return undefined
    const key = `${Date.now()}-${Math.random()}`
    setIsVisible(true)
    setFlying({ key, id: String(lastAddEvent.product?.id || "") })
    // One frame so a card that just mounted (first item) is laid out before we aim at it.
    const raf = requestAnimationFrame(() => {
      const target = thumbsRef.current?.getBoundingClientRect()
      const to = target
        ? { x: target.left + 20, y: target.top + target.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight - CARD_BOTTOM_WITH_NAV_PX }
      flyToCart({ image: lastAddEvent.product?.imageUrl, from, to }).then(() => {
        setFlying((current) => (current?.key === key ? null : current))
        bumpElement(cardRef.current)
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [lastAddEvent])

  // Don't render the card if cart is empty
  if (cartCount === 0) return null

  const restaurantName = cart[0]?.restaurant || "Restaurant"
  const restaurantSlug = restaurantName.toLowerCase().replace(/\s+/g, "-")

  // Latest 3 dishes, newest on top of the stack (same as the restaurant page "View cart" pill).
  const thumbnailItems = cart.slice(-3).reverse().filter((item) => item && typeof item === "object")
  const isFlyingItem = (item) =>
    Boolean(flying) &&
    (String(item.id) === flying.id || String(item.itemId || "") === lineBaseId(flying.id))

  const bottomPx = isMobile && !navVisible ? CARD_BOTTOM_WITHOUT_NAV_PX : CARD_BOTTOM_WITH_NAV_PX

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            className="fixed md:!bottom-6 left-0 right-0 md:left-auto md:right-6 z-50 px-4 md:px-0 pointer-events-none flex justify-center"
            initial={{ opacity: 0, scale: 0.9, bottom: bottomPx }}
            animate={{ opacity: 1, scale: 1, bottom: bottomPx }}
            exit={{ opacity: 0, scale: 0.85, y: 60, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } }}
            // Same feel as the bottom nav's own hide/show.
            transition={{
              bottom: { type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.25 },
              default: { type: "spring", stiffness: 300, damping: 25, mass: 0.8 },
            }}
          >
            <div
              ref={cardRef}
              className="pointer-events-auto relative w-full max-w-[340px] md:w-[360px] md:max-w-none overflow-hidden rounded-full bg-gradient-to-r from-[#991b1b] via-[#DC2626] to-[#991b1b] border border-white/15 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)] text-white"
            >
              {/* Soft top sheen */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />

              <div className="relative flex items-center gap-2.5 py-2 pl-2 pr-2">
                {/* Stacked dish photos */}
                <div ref={thumbsRef} className="flex flex-shrink-0 items-center -space-x-4">
                  {thumbnailItems.map((item, idx) => (
                    <motion.div
                      key={item.itemId ? `${item.itemId}::${item.variantId || ""}` : (item.id || `thumb-${idx}`)}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: isFlyingItem(item) ? 0.6 : 1, opacity: isFlyingItem(item) ? 0 : 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/90 bg-white shadow-md"
                      style={{ zIndex: thumbnailItems.length - idx }}
                    >
                      <img
                        src={item.image || item.imageUrl || dishFallbackImage}
                        alt={item.name || "Item"}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          if (e.currentTarget.src !== dishFallbackImage) e.currentTarget.src = dishFallbackImage
                        }}
                      />
                    </motion.div>
                  ))}
                </div>

                {/* Restaurant Info */}
                <Link to={`/food/user/restaurants/${restaurantSlug}`} className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 text-sm font-bold leading-tight drop-shadow-sm">{restaurantName}</h3>
                  <div className="flex items-center gap-0.5 text-[11px] font-medium text-white/85">
                    <span>View Menu</span>
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </Link>

                {/* View Cart Button */}
                <Link
                  to="/food/user/cart"
                  className="flex flex-shrink-0 items-center gap-1 rounded-full bg-white/25 px-3 py-1.5 leading-tight ring-1 ring-white/30 active:scale-95 transition-transform"
                >
                  <div className="text-left">
                    <div className="text-xs font-bold">View cart</div>
                    <div className="text-[10px] font-medium opacity-95">{cartCount} {cartCount === 1 ? "item" : "items"}</div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>

                {/* Close Button */}
                <motion.button
                  type="button"
                  onClick={() => setIsVisible(false)}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-black/20 ring-1 ring-white/30 shadow-inner backdrop-blur-sm hover:bg-black/30 transition-colors"
                  whileHover={{ rotate: 90 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  aria-label="Hide cart"
                >
                  <X className="h-3.5 w-3.5 text-white" strokeWidth={2.75} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
