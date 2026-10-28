import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, KeyRound, MapPin, Phone, Shield, AlertTriangle } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

// What the app does to keep deliveries safe. Reporting a concern is a separate page.
const POINTS = [
  {
    icon: KeyRound,
    title: "Delivery code",
    text: "Your order is handed over only after the delivery partner enters the 4-digit code shown in your app. Share it only when you receive the order.",
  },
  {
    icon: MapPin,
    title: "Live tracking",
    text: "You can follow the delivery partner on the map from pickup to your door, so you always know who is coming and when.",
  },
  {
    icon: Phone,
    title: "Contact the partner",
    text: "Call the delivery partner from the order screen if you need to share directions or change how the order is handed over.",
  },
  {
    icon: Shield,
    title: "Verified partners",
    text: "Delivery partners are approved by our team after their documents are checked before they can take orders.",
  },
]

export default function DeliverySafety() {
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useAppBackNavigation()

  return (
    <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-10">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 h-14 flex items-center gap-3">
        <button onClick={goBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-gray-800 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Delivery partner safety</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-4 p-4 rounded-2xl bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-[#DC2626]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{text}</p>
            </div>
          </div>
        ))}

        <button
          onClick={() =>
            navigate("/user/profile/report-safety-emergency", {
              state: { returnTo: location.state?.returnTo || location.pathname },
            })
          }
          className="w-full mt-4 flex items-center justify-center gap-2 h-12 rounded-2xl bg-[#DC2626] text-white text-sm font-bold active:scale-[0.99]"
        >
          <AlertTriangle className="w-4 h-4" />
          Report a safety concern
        </button>
      </div>
    </AnimatedPage>
  )
}
