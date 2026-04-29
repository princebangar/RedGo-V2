import { Link, useLocation } from "react-router-dom"
import { Tag, Truck, UtensilsCrossed } from "lucide-react"
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import api from "@food/api"

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname
  const [under250PriceLimit, setUnder250PriceLimit] = useState(250)

  // Fetch landing settings to get dynamic price limit
  useEffect(() => {
    let cancelled = false
    api.get('/food/landing/settings/public')
      .then((res) => {
        if (cancelled) return
        const settings = res?.data?.data
        if (settings && typeof settings.under250PriceLimit === 'number') {
          setUnder250PriceLimit(settings.under250PriceLimit)
        }
      })
      .catch(() => {
        if (!cancelled) setUnder250PriceLimit(250)
      })
    return () => { cancelled = true }
  }, [])

  // Normalize pathname by removing trailing slash for consistent comparison
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  
  // Check active routes
  const isDining = normalizedPath === "/food/dining" || normalizedPath.startsWith("/food/user/dining");
  const isUnder250 = normalizedPath === "/food/under-250" || normalizedPath.startsWith("/food/user/under-250");
  const isProfile = normalizedPath.startsWith("/food/profile") || normalizedPath.startsWith("/food/user/profile");
  
  // Delivery is the default active state for the food module if nothing else is active
  const isDelivery = !isDining && !isUnder250 && !isProfile && (
    normalizedPath === "/food" || 
    normalizedPath === "/food/user" || 
    normalizedPath.startsWith("/food/user") ||
    normalizedPath.startsWith("/food/restaurants") ||
    normalizedPath.startsWith("/food/user/restaurants")
  );

  const navItems = [
    {
      id: 'delivery',
      label: 'Delivery',
      icon: Truck,
      to: '/food/user',
      active: isDelivery
    },
    {
      id: 'dining',
      label: 'Dining',
      icon: UtensilsCrossed,
      to: '/food/user/dining',
      active: isDining
    },
    {
      id: 'under250',
      label: `Under ₹${under250PriceLimit}`,
      icon: Tag,
      to: '/food/user/under-250',
      active: isUnder250
    }
  ]

  return (
    <div className="md:hidden fixed bottom-6 left-0 right-0 z-50 px-6 pointer-events-none antialiased">
      <div 
        className="max-w-md mx-auto h-18 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/10 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.3)] flex items-center justify-around px-2 pointer-events-auto rounded-[2rem] overflow-hidden"
      >
        <AnimatePresence>
          {navItems.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 h-14 w-full relative transition-all duration-300 ${
                item.active ? "text-[#DC2626]" : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {item.active && (
                <motion.div
                  layoutId="active-nav-bg"
                  className="absolute inset-x-1 inset-y-1 bg-[#FFF5F5] dark:bg-[#DC2626]/10 rounded-[1.5rem] z-0"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              
              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <item.icon 
                  className={`h-5 w-5 transition-transform duration-300 ${item.active ? "scale-110" : ""}`} 
                  strokeWidth={item.active ? 2.5 : 2} 
                />
                <span className={`text-[10px] font-black tracking-tight uppercase leading-none ${item.active ? "opacity-100" : "text-gray-900/70 dark:text-gray-300/60"}`}>
                  {item.id === 'under250' ? 'Under 250' : item.label}
                </span>
              </div>
            </Link>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
