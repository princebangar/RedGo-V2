import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from "@food/context/CartContext";
import { useProfile } from "@food/context/ProfileContext";
import { useEffect, useRef, useState } from 'react';
import { flyToCart, bumpElement, sourceToViewportPoint } from "@food/utils/flyToCart";
import dishFallbackImage from "@food/assets/placeholders/dish_fallback.webp";
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}



/**
 * AddToCartAnimation Component
 * 
 * A self-contained component that handles:
 * - Fly-to-cart animation when products are added (removals just update the count)
 * - A small bump on the pill when the dish lands
 * - "View cart" button display at bottom center
 * 
 * This component automatically integrates with the CartContext and
 * listens for cart changes to trigger appropriate animations.
 */
export default function AddToCartAnimation({
  bottomOffset = 96,
  pillClassName = '',
  hideOnPages = true,
  linkTo = '/food/user/cart',
  dynamicBottom = null,
}) {
  const { items, itemCount, lastAddEvent } = useCart();
  const { orderType } = useProfile();
  const isTakeaway = orderType === 'takeaway';
  // Navigate to the correct cart for the active mode
  const cartLinkTo = isTakeaway ? '/food/user/cart' : (linkTo || '/food/user/cart');
  const location = useLocation();
  const navigate = useNavigate();
  const linkRef = useRef(null);
  const [flyingProduct, setFlyingProduct] = useState(null);

  // Hide pill on cart pages, order pages, and account page (if enabled)
  const iscartPage = location.pathname === '/cart' ||
    location.pathname === '/user/cart' ||
    location.pathname.startsWith('/cart/') ||
    location.pathname.startsWith('/user/cart/');
  const isOrderPage = location.pathname.startsWith('/orders/');
  const isAccountPage = location.pathname === '/account';
  const shouldHidePill = hideOnPages && (iscartPage || isOrderPage || isAccountPage);

  // Dish added (ADD or +): fly its photo from the button into the pill. Only adds animate;
  // removing just updates the count. Runs off the main thread, so it stays smooth.
  useEffect(() => {
    const from = sourceToViewportPoint(lastAddEvent?.sourcePosition)
    if (!from) return undefined
    const key = `${Date.now()}-${Math.random()}`
    setFlyingProduct({ key, product: { ...lastAddEvent.product } })
    // One frame so a pill that just mounted (first item) is laid out before we aim at it.
    const raf = requestAnimationFrame(() => {
      const pillRect = linkRef.current?.getBoundingClientRect()
      const to = pillRect
        ? { x: pillRect.left + 22, y: pillRect.top + pillRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight - (bottomOffset || 20) - 24 }
      flyToCart({ image: lastAddEvent.product?.imageUrl, from, to }).then(() => {
        setFlyingProduct((current) => (current?.key === key ? null : current))
        bumpElement(linkRef.current)
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [lastAddEvent]);

  // Get up to 3 most recently added items for thumbnails
  // Since items are added to the end of the array, we take the last 3
  const flyingId = flyingProduct ? String(flyingProduct.product?.id || '') : '';
  const safeItems = Array.isArray(items) ? items : [];
  const thumbnailItems = safeItems
    .slice(-3)
    .reverse()
    .filter((item) => item && typeof item === 'object');

  return (
    <>
      <AnimatePresence>
        {itemCount > 0 && !shouldHidePill && (
          <motion.div
            initial={{ y: 0, opacity: 0, scale: 0.8 }}
            animate={{
              y: 0,
              opacity: 1,
              scale: 1,
            }}
            exit={{ y: 60, opacity: 0, scale: 0.8 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
              mass: 0.8,
            }}
            style={{
              position: 'fixed',
              bottom: dynamicBottom ? undefined : `${bottomOffset || 20}px`,
              // Full-width wrapper must NOT steal bottom-nav taps
              pointerEvents: 'none',
            }}
            className={`left-0 right-0 z-[9990] flex justify-center px-4 pb-4 md:pb-6 transition-all duration-300 ease-in-out bg-transparent ${dynamicBottom || ''}`}
          >
            <button
              ref={linkRef}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                debugLog('View cart clicked, navigating to:', linkTo);
              navigate(cartLinkTo, { state: { from: location.pathname } });
              }}
              className={`bg-gradient-to-r from-[#991b1b] via-[#DC2626] to-[#991b1b] text-white rounded-full shadow-xl shadow-[#DC2626]/30 px-3 py-2 flex items-center gap-2 hover:from-[#991b1b] hover:via-[#DC2626] hover:to-[#991b1b] transition-all duration-300 pointer-events-auto border border-[#DC2626]/30 backdrop-blur-sm cursor-pointer touch-manipulation ${pillClassName}`}
            >
              {/* Left: Product thumbnails */}
              <div className="flex items-center -space-x-4">
                {thumbnailItems.map((item, idx) => {
                  const isFlying = flyingId && (String(item?.id) === flyingId || String(item?.itemId || '') === flyingId.split('::')[0])
                  const imgSrc = item?.image || item?.product?.imageUrl || item?.imageUrl || dishFallbackImage
                  return (
                    <motion.div
                      key={item?.itemId ? `${item.itemId}::${item.variantId || ''}` : (item?.id || `thumb-${idx}`)}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: isFlying ? 0.6 : 1, opacity: isFlying ? 0 : 1 }}
                      transition={{
                        delay: idx * 0.1,
                        type: 'spring',
                        stiffness: 500,
                        damping: 25,
                      }}
                      className="w-7 h-7 rounded-full border-2 border-white/90 overflow-hidden bg-white flex-shrink-0 shadow-md"
                    >
                      <img
                        src={imgSrc}
                        alt={item?.name || item?.product?.name || 'Item'}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          if (e.currentTarget.src !== dishFallbackImage) {
                            e.currentTarget.src = dishFallbackImage
                          }
                        }}
                      />
                    </motion.div>
                  )
                })}
              </div>

              {/* Middle: Text */}
              <motion.div
                className="flex flex-col"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                <span className="text-xs font-bold leading-tight drop-shadow-sm">
                  {isTakeaway ? 'Takeaway Cart' : 'View cart'}
                </span>
                <span className="text-[10px] opacity-95 leading-tight font-medium">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              </motion.div>

              {/* Right: Arrow icon */}
              <motion.div
                className="ml-auto bg-white/25 rounded-full p-1 backdrop-blur-sm"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                whileHover={{ scale: 1.1, rotate: -5 }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-white"
                >
                  <path
                    d="M6 12L10 8L6 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

