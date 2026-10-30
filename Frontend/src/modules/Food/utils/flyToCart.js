import dishFallbackImage from "@food/assets/placeholders/dish_fallback.webp"

const FLY_SIZE_PX = 36
const ARC_STEPS = 24

/**
 * Flies a round dish photo from `from` to `to` (viewport points) along a smooth arc.
 *
 * Plain DOM + Web Animations API on transform/opacity only: the browser runs it on the
 * compositor, so React re-renders of a big page (cart update, server reply) can't make it stutter.
 * Resolves when the photo has landed.
 */
export function flyToCart({ image, from, to, size = FLY_SIZE_PX }) {
  if (typeof document === "undefined" || !from || !to) return Promise.resolve()

  const el = document.createElement("div")
  const half = size / 2
  Object.assign(el.style, {
    position: "fixed",
    left: `${from.x - half}px`,
    top: `${from.y - half}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9999px",
    overflow: "hidden",
    border: "2px solid #fff",
    background: "#fff",
    boxShadow: "0 8px 20px -6px rgba(0,0,0,0.35)",
    zIndex: "12000",
    pointerEvents: "none",
    willChange: "transform, opacity",
  })
  const img = document.createElement("img")
  img.src = image || dishFallbackImage
  img.alt = ""
  Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" })
  img.onerror = () => {
    if (!img.src.includes("dish_fallback")) img.src = dishFallbackImage
  }
  el.appendChild(img)
  document.body.appendChild(el)

  const dx = to.x - from.x
  const dy = to.y - from.y
  // Control point above the straighter line gives a natural "toss" arc.
  const cx = dx * 0.35
  const cy = Math.min(0, dy) - Math.max(80, Math.abs(dx) * 0.4)

  const keyframes = []
  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const t = i / ARC_STEPS
    const u = 1 - t
    const x = 2 * u * t * cx + t * t * dx
    const y = 2 * u * t * cy + t * t * dy
    const scale = t < 0.15 ? 1 + t * 1.6 : 1.24 - (t - 0.15) * 0.6
    keyframes.push({
      offset: t,
      transform: `translate3d(${x}px, ${y}px, 0) scale(${scale.toFixed(3)})`,
      opacity: t > 0.9 ? (1 - t) * 10 : 1,
    })
  }

  return new Promise((resolve) => {
    const done = () => {
      el.remove()
      resolve()
    }
    if (typeof el.animate !== "function") {
      done()
      return
    }
    const anim = el.animate(keyframes, {
      duration: 650,
      easing: "cubic-bezier(0.45, 0, 0.25, 1)",
      fill: "forwards",
    })
    anim.onfinish = done
    anim.oncancel = done
  })
}

/** Small "got it" bump on the cart pill/card once a dish lands (compositor-only too). */
export function bumpElement(el) {
  if (!el || typeof el.animate !== "function") return
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }],
    { duration: 280, easing: "ease-out" },
  )
}

/** Viewport point of a captured add-button position, corrected for scroll since the tap. */
export function sourceToViewportPoint(source) {
  if (!source || source.viewportX === undefined) return null
  return {
    x: source.viewportX - ((window.scrollX || 0) - (source.scrollX || 0)),
    y: source.viewportY - ((window.scrollY || 0) - (source.scrollY || 0)),
  }
}
