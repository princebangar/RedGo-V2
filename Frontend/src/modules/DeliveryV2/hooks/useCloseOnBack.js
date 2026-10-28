import { useEffect, useRef } from "react"

// Back presses made by this hook itself (cleanup) that must not close anything.
let programmaticBacks = 0

/**
 * While `isOpen` is true, the device/browser Back button closes the sheet/viewer (calls `onClose`)
 * instead of leaving the page. When it is closed another way, the extra history entry is removed again.
 */
export default function useCloseOnBack(isOpen, onClose) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return undefined

    const marker = `sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.history.pushState({ ...(window.history.state || {}), __sheet: marker }, "")
    let closedByBack = false

    const handlePop = () => {
      if (programmaticBacks > 0) {
        programmaticBacks -= 1
        return
      }
      closedByBack = true
      onCloseRef.current?.()
    }

    window.addEventListener("popstate", handlePop)
    return () => {
      window.removeEventListener("popstate", handlePop)
      if (!closedByBack && window.history.state?.__sheet === marker) {
        programmaticBacks += 1
        window.history.back()
      }
    }
  }, [isOpen])
}
