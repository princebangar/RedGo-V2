import { useEffect, useRef, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { clearOnboardingFromLocalStorage, clearAllFilesFromDB } from "@/modules/Food/utils/onboardingUtils"

const DEFAULT_COUNTRY_CODE = "+91"

export default function RestaurantLogin() {
  const navigate = useNavigate()

  useEffect(() => {
    // Clear any stale onboarding data when landing on the login page
    clearOnboardingFromLocalStorage()
    clearAllFilesFromDB()
  }, [])

  const phoneInputRef = useRef(null)
  const [phone, setPhone] = useState(() => sessionStorage.getItem("restaurantLoginPhone") || "")
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  const validatePhone = (num) => {
    const digits = num.replace(/\D/g, "")
    if (digits.length !== 10) return false
    return ["6", "7", "8", "9"].includes(digits[0])
  }

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault()
    if (!validatePhone(phone)) {
      toast.error("Please enter a valid 10-digit mobile number")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    const fullPhone = `${DEFAULT_COUNTRY_CODE} ${phone}`.trim()

    try {
      await restaurantAPI.sendOTP(fullPhone, "login")
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))
      sessionStorage.setItem("restaurantLoginPhone", phone)
      navigate("/food/restaurant/otp")
    } catch (apiErr) {
      const msg = apiErr?.response?.data?.message || apiErr?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col relative overflow-hidden font-['Poppins']">
      <style>
        {`
          @keyframes floatDish1 {
            0%, 100% { transform: translateX(0vw) translateY(0px) rotate(0deg); }
            50% { transform: translateX(25vw) translateY(-15px) rotate(8deg); }
          }
          @keyframes floatDish2 {
            0%, 100% { transform: translateX(0vw) translateY(0px) rotate(0deg); }
            50% { transform: translateX(-25vw) translateY(-15px) rotate(-8deg); }
          }
          .animate-float-dish-1 {
            animation: floatDish1 12s ease-in-out infinite;
          }
          .animate-float-dish-2 {
            animation: floatDish2 12s ease-in-out infinite;
          }
        `}
      </style>

      {/* Top Wave (Log In style) */}
      <div className="absolute top-0 left-0 w-full h-[40vh] pointer-events-none z-0 transform scale-[1.05] origin-center">
        <svg viewBox="0 0 1440 320" className="w-full h-full block" preserveAspectRatio="none" overflow="visible">
          <defs>
            <linearGradient id="topRedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#B80B3D" />
              <stop offset="100%" stopColor="#66001D" />
            </linearGradient>
          </defs>
          <path fill="url(#topRedGrad)" d="M -50,-50 L -50,280 C 200,100 800,100 1490,100 L 1490,-50 Z" filter="drop-shadow(0px 5px 15px rgba(0,0,0,0.15))" />
        </svg>
        <img
          src="/food_dish.png"
          alt="Delicious food"
          className="absolute top-[8%] left-[5%] w-[14vh] h-[14vh] md:w-[120px] md:h-[120px] object-contain animate-float-dish-1 drop-shadow-xl"
        />
      </div>

      {/* Bottom Wave (Log In style) */}
      <div className="absolute bottom-0 left-0 w-full h-[50vh] pointer-events-none z-0 transform scale-[1.05] origin-center">
        <svg viewBox="0 0 1440 320" className="w-full h-full block" preserveAspectRatio="none" overflow="visible">
          <defs>
            <linearGradient id="botRedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#B80B3D" />
              <stop offset="100%" stopColor="#66001D" />
            </linearGradient>
          </defs>
          <path fill="url(#botRedGrad)" d="M -50,370 L -50,220 C 640,220 1240,220 1490,40 L 1490,370 Z" filter="drop-shadow(0px -5px 15px rgba(0,0,0,0.15))" />
        </svg>
        <img
          src="/food_dish_2.png"
          alt="Delicious food"
          className="absolute bottom-[8%] right-[5%] w-[18vh] h-[18vh] md:w-[150px] md:h-[150px] object-contain animate-float-dish-2 drop-shadow-2xl"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 pb-24 relative z-10">
        <div className="w-full max-w-sm flex flex-col relative -top-10">
          {/* Main Title */}
          <div className="mb-5 text-center flex flex-col items-center">
            <img
              src="/redgo_logo_transparent.png"
              alt="RedGo Logo"
              className="h-28 -mb-3.5 object-contain drop-shadow-md"
            />
            <h2 className="text-[25px] font-extrabold text-[#B80B3D] dark:text-red-400 tracking-tight font-['Outfit']">
              Restaurant Partner
            </h2>
            <div className="text-[13px] text-slate-500/90 dark:text-slate-400/90 font-['Outfit'] font-semibold tracking-[0.015em] leading-relaxed max-w-[300px] text-center px-4 mt-5">
              Enter your registered mobile number to manage your restaurant
            </div>
          </div>

          <div className="relative">
            <form onSubmit={handleSendOTP} className="space-y-6">
              <div className="relative group">
                <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 pr-3 border-r border-gray-300 dark:border-gray-600">+91</span>
                </div>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  required
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  maxLength={10}
                  className="block w-full pl-20 pr-6 py-3.5 bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 shadow-sm text-gray-900 dark:text-white rounded-full outline-none transition-all duration-300 placeholder:text-gray-400 font-medium text-base focus:bg-white dark:focus:bg-gray-900 focus:border-[#B80B3D] focus:ring-4 focus:ring-[#B80B3D]/10 hover:border-gray-400"
                  placeholder="Mobile number"
                />
              </div>

              <button
                type="submit"
                disabled={loading || phone.length < 10}
                className="w-full py-3.5 bg-gradient-to-r from-[#B80B3D] to-[#66001D] hover:from-[#A10935] hover:to-[#4F0016] disabled:opacity-50 text-white rounded-full font-medium text-base shadow-[0_8px_20px_rgba(184,11,61,0.3)] disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Log in"
                )}
              </button>
            </form>
          </div>

          {/* Footer Info */}
          <div className="mt-8 text-center">
            <p className="text-[11px] text-gray-400/80 font-medium leading-relaxed max-w-[320px] mx-auto">
              By continuing, you agree to our <br />
              <Link to="/food/restaurant/terms" className="text-gray-400 hover:text-[#B80B3D] transition-colors uppercase tracking-wider font-semibold">TERMS</Link>
              <span className="mx-2 text-gray-400/80 font-bold">•</span>
              <Link to="/food/restaurant/privacy" className="text-gray-400 hover:text-[#B80B3D] transition-colors uppercase tracking-wider font-semibold">PRIVACY</Link>
              <span className="mx-2 text-gray-400/80 font-bold">•</span>
              <Link to="/food/restaurant/help-content" className="text-gray-400 hover:text-[#B80B3D] transition-colors uppercase tracking-wider font-semibold">SUPPORT</Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
