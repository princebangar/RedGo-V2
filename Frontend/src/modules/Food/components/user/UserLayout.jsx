import { Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom"
import { useEffect, useState, createContext, useContext, useRef, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { ProfileProvider } from "@food/context/ProfileContext"
import LocationPrompt from "./LocationPrompt"
import { CartProvider } from "@food/context/CartContext"
import { OrdersProvider } from "@food/context/OrdersContext"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

import SearchOverlay from "./SearchOverlay"
import BottomNavigation from "./BottomNavigation"
import DesktopNavbar from "./DesktopNavbar"
import BackToTop from "./BackToTop"
import { useUserNotifications } from "../../hooks/useUserNotifications"
import { useProfile } from "@food/context/ProfileContext"
import { useLocation as useGeoLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import OutOfZoneScreen from "./OutOfZoneScreen"
import { isModuleAuthenticated } from "../../utils/auth"

// Sync orderType with route
function RouteSyncHandler() {
  const location = useLocation()
  const { setOrderType, orderType } = useProfile()

  useEffect(() => {
    // Determine path ignoring /food prefix for uniform handling
    let path = location.pathname
    if (path.startsWith("/food")) {
      path = path.substring(5) || "/"
    }
    const normalizedPath = path.replace(/\/+$/, "") || "/"
    
    // Paths that should PRESERVE the current orderType (sub-navigation)
    const preservePaths = [
      "/cart", "/user/cart",
      "/restaurants", "/user/restaurants",
      "/search", "/user/search",
      "/product", "/user/product",
      "/user/orders", "/orders",
      "/profile", "/user/profile"
    ]
    const isPreservePath = preservePaths.some(p => normalizedPath === p || normalizedPath.startsWith(p + "/"))
    
    if (isPreservePath) return

    // Explicit mode switches
    let newMode = null
    if (normalizedPath === "/takeaway" || normalizedPath.startsWith("/takeaway/") || normalizedPath.startsWith("/user/takeaway")) {
      newMode = "takeaway"
    } else if (normalizedPath === "/dining" || normalizedPath.startsWith("/dining/") || normalizedPath.startsWith("/user/dining")) {
      newMode = "dining"
    } else if (normalizedPath === "/" || normalizedPath === "/user" || normalizedPath === "/user/") {
      newMode = "delivery"
    }

    if (newMode && orderType !== newMode) {
      setOrderType(newMode)
    }
  }, [location.pathname, orderType, setOrderType])

  return null
}

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  openSearch: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  closeSearch: () => { }
})

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext)
  // Always return context, even if provider is not available (will use default values)
  return context
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const openSearch = () => {
    setIsSearchOpen(true)
  }

  const closeSearch = () => {
    setIsSearchOpen(false)
    setSearchValue("")
  }

  return (
    <SearchOverlayContext.Provider value={{ isSearchOpen, searchValue, setSearchValue, openSearch, closeSearch }}>
      {children}
      {isSearchOpen && (
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={closeSearch}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
        />
      )}
    </SearchOverlayContext.Provider>
  )
}

// Create LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    debugWarn("LocationSelectorProvider not available")
  },
  closeLocationSelector: () => { }
})

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext)
  if (!context) {
    throw new Error("useLocationSelector must be used within LocationSelectorProvider")
  }
  return context
}

function LocationSelectorProvider({ children }) {
  const navigate = useNavigate()

  const openLocationSelector = useCallback(() => {
    // Navigate to the standalone address selector page
    // Using window.location.pathname to avoid hook issues in some contexts
    navigate("/food/user/address-selector", { state: { from: window.location.pathname } })
  }, [navigate])

  const closeLocationSelector = useCallback(() => { }, [])

  // Debounced loading state to prevent flickering and ensure smooth navigation transitions
  const [showGlobalLoader, setShowGlobalLoader] = useState(false)

  const value = useMemo(() => ({
    isLocationSelectorOpen: false,
    openLocationSelector,
    closeLocationSelector,
    showGlobalLoader,
    setShowGlobalLoader
  }), [openLocationSelector, closeLocationSelector, showGlobalLoader])

  return (
    <LocationSelectorContext.Provider value={value}>
      {children}
    </LocationSelectorContext.Provider>
  )
}

function UserLayoutContent() {
  const location = useLocation()
  const { location: geoLocation, loading: isGeoLoading } = useGeoLocation()
  const { isOutOfService: isOutOfZone, loading: isZoneLoading, zoneStatus } = useZone(geoLocation)
  const { openLocationSelector } = useLocationSelector()
  const navigationType = useNavigationType()

  const path = location.pathname.startsWith("/food")
    ? location.pathname.substring(5) || "/"
    : location.pathname
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, "") : path

  const isMainPage = normalizedPath === "/" || 
    normalizedPath === "" || 
    normalizedPath === "/user" || 
    normalizedPath === "/dining" || 
    normalizedPath === "/user/dining" || 
    normalizedPath === "/takeaway" || 
    normalizedPath === "/user/takeaway" ||
    normalizedPath === "/under-250" ||
    normalizedPath === "/user/under-250";

  // Determine if this is a policy or auth page immediately
  const isAuthPage = normalizedPath.includes('auth/');
  const isPolicyPage = normalizedPath.includes('terms') || 
                       normalizedPath.includes('privacy') || 
                       normalizedPath.includes('support-info') ||
                       normalizedPath.includes('help');

  // Debounced loading state to prevent flickering and ensure smooth navigation transitions
  const { showGlobalLoader, setShowGlobalLoader } = useLocationSelector()
  const [isInitialChecking, setIsInitialChecking] = useState(() => {
    // If it's a policy or auth page, or if the user is not authenticated, we don't need the initial location check delay
    const isAuthenticated = isModuleAuthenticated('user');
    return !(isAuthPage || isPolicyPage || !isAuthenticated);
  })

  useEffect(() => {
    // Skip location/zone check for auth, policy, support pages, or if not logged in
    const isAuthenticated = isModuleAuthenticated('user');
    if (isAuthPage || isPolicyPage || !isAuthenticated) {
      setShowGlobalLoader(false)
      setIsInitialChecking(false)
      return
    }

    if (isZoneLoading || isGeoLoading) {
      // Logic from user: show loader ONLY if we don't have location data yet OR if it's a manual update
      const hasLocationData = geoLocation?.latitude && geoLocation?.longitude;
      const hasZoneData = zoneStatus && zoneStatus !== "loading";
      const isManualUpdate = sessionStorage.getItem("manual_location_update") === "true";

      if (!hasLocationData || !hasZoneData || isManualUpdate) {
        setShowGlobalLoader(true)
      }
    } else {
      const timer = setTimeout(() => {
        setShowGlobalLoader(false)
        setIsInitialChecking(false) // First load completed
        sessionStorage.removeItem("manual_location_update"); // Clear manual flag
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [isZoneLoading, isGeoLoading, isAuthPage, isPolicyPage])

  // Global Refresh Handler - Scroll to top ONLY on browser refresh
  useEffect(() => {
    const isReload = 
      performance.getEntriesByType('navigation')[0]?.type === 'reload' || 
      window.performance?.navigation?.type === 1;

    if (isReload) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      sessionStorage.removeItem("homeScrollY");
      sessionStorage.removeItem("homeVisibleCount");
    }
  }, []);

  useEffect(() => {
    const rootPaths = ["/", "/user", "/food", "/dining", "/user/dining", "/takeaway", "/user/takeaway"];
    const isAtRoot = rootPaths.includes(location.pathname);
    
    if (navigationType !== 'POP' && !isAtRoot) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [location.pathname, location.search, location.hash, navigationType]);

  const isProfileRoot = normalizedPath === "/profile" || normalizedPath === "/user/profile"

  const showBottomNav = !isInitialChecking && (normalizedPath === "/" ||
    normalizedPath === "/user" ||
    normalizedPath === "/dining" ||
    normalizedPath === "/user/dining" ||
    normalizedPath === "/takeaway" ||
    normalizedPath === "/user/takeaway" ||
    normalizedPath === "/under-250" ||
    normalizedPath === "/user/under-250" ||
    isProfileRoot ||
    normalizedPath === "") && isModuleAuthenticated('user')

  const isUnder250 = normalizedPath === "/under-250" || normalizedPath === "/user/under-250"
  const lastOutOfZoneRef = useRef(isOutOfZone)

  // Out of Zone Branded Toast Trigger
  useEffect(() => {
    // Only show toast if out of zone, loader is gone, and we are on a main page where the out-of-zone screen is shown
    if (isOutOfZone && !lastOutOfZoneRef.current && !showGlobalLoader && isMainPage) {
      const timer = setTimeout(() => {
        toast.custom((t) => (
          <div
            className="w-[calc(100vw-32px)] sm:w-[380px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-3xl pointer-events-auto flex items-center gap-4 p-3.5 border border-gray-50 duration-300 animate-in fade-in slide-in-from-top-4"
          >
            <div className="flex-shrink-0">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#DC2626] to-[#991B1B] flex items-center justify-center p-1.5 shadow-lg">
                <img 
                  src="/assets/images/redgo-toast-logo.png" 
                  alt="RedGo" 
                  className="w-full h-full object-contain brightness-0 invert" 
                />
              </div>
            </div>
            <div className="flex-1 pr-2">
              <p className="text-[14px] font-bold text-gray-800 leading-tight">
                Restaurants are unavailable here right now.
              </p>
              <p className="text-[13px] font-medium text-gray-500 mt-1">
                Please choose a different location
              </p>
            </div>
          </div>
        ), {
          duration: 4000,
          position: 'top-center',
          id: 'out-of-zone-toast'
        });
      }, 300); // Shorter delay after loader is gone

      lastOutOfZoneRef.current = true;
      return () => clearTimeout(timer);
    }
    
    // Reset the ref if user moves back into a zone
    if (!isOutOfZone) {
      lastOutOfZoneRef.current = false;
    }
  }, [isOutOfZone, showGlobalLoader, isMainPage]);


  return (
    <>
      <RouteSyncHandler />
      
      {/* Location Fetching Loader - Only shown on main pages after login */}
      {showGlobalLoader && !isInitialChecking && (
        <div className="fixed inset-0 z-[1000] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300 pointer-events-auto">
          <div className="relative">
            <div className="w-10 h-10 border-[3px] border-gray-100/30 rounded-full"></div>
            <div className="absolute top-0 left-0 w-10 h-10 border-[3px] border-[#DC2626] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-[13px] font-bold text-gray-800 tracking-tight">Updating location...</p>
        </div>
      )}

      {/* Desktop Navbar - Hidden on mobile, visible on medium+ screens */}
      {!isInitialChecking && (
        <div className="hidden md:block">
          {showBottomNav && !isOutOfZone && <DesktopNavbar showLogo={!isUnder250} />}
        </div>
      )}
      {!isInitialChecking && <LocationPrompt />}
      
      {isInitialChecking ? (
        <div className="flex-1 min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-10 h-10 border-[3px] border-gray-100/50 rounded-full"></div>
            <div className="absolute top-0 left-0 w-10 h-10 border-[3px] border-[#DC2626] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] animate-pulse">Loading...</p>
        </div>
      ) : (zoneStatus === "OUT_OF_SERVICE") && isMainPage ? (
        <OutOfZoneScreen 
          location={geoLocation} 
          handleLocationClick={openLocationSelector} 
        />
      ) : (
        <main className={`${showBottomNav ? "md:pt-40" : ""} min-h-screen flex flex-col`}>
          <Outlet />
        </main>
      )}

      {(normalizedPath === "/" || normalizedPath === "" || normalizedPath === "/user") && !isOutOfZone && <BackToTop />}
      {showBottomNav && !isOutOfZone && <BottomNavigation />}
    </>
  )
}

export default function UserLayout() {
  useUserNotifications()

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] transition-colors duration-200">
      <CartProvider>
        <ProfileProvider>
          <OrdersProvider>
            <SearchOverlayProvider>
              <LocationSelectorProvider>
                <UserLayoutContent />
              </LocationSelectorProvider>
            </SearchOverlayProvider>
          </OrdersProvider>
        </ProfileProvider>
      </CartProvider>
    </div>
  )
}
