const NAV_SHOW_EVENT = "food-bottom-nav-show"

export function requestBottomNavShow(lockMs = 900) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(NAV_SHOW_EVENT, { detail: { lockMs } }),
  )
}

export function subscribeBottomNavShow(handler) {
  if (typeof window === "undefined") return () => {}
  const onShow = (e) => handler(e)
  window.addEventListener(NAV_SHOW_EVENT, onShow)
  return () => window.removeEventListener(NAV_SHOW_EVENT, onShow)
}

// Visibility of the mobile bottom nav (it hides while scrolling down), so floating
// cards like the sticky cart can drop into the freed space.
const NAV_VISIBILITY_EVENT = "food-bottom-nav-visibility"
let bottomNavVisible = true

export function isBottomNavVisible() {
  return bottomNavVisible
}

export function emitBottomNavVisibility(visible) {
  if (typeof window === "undefined" || bottomNavVisible === visible) return
  bottomNavVisible = visible
  window.dispatchEvent(
    new CustomEvent(NAV_VISIBILITY_EVENT, { detail: { visible } }),
  )
}

export function subscribeBottomNavVisibility(handler) {
  if (typeof window === "undefined") return () => {}
  const onChange = (e) => handler(Boolean(e?.detail?.visible))
  window.addEventListener(NAV_VISIBILITY_EVENT, onChange)
  return () => window.removeEventListener(NAV_VISIBILITY_EVENT, onChange)
}
