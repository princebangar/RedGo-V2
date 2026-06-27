import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  Clock,
  MapPin,
  CheckCircle2,
  Star,
  ArrowRight,
  Menu,
  X,
  ShieldCheck,
  UtensilsCrossed,
  Smartphone,
  Download,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  ChevronDown,
  Store,
  ShoppingBag,
  Rocket,
  Award,
  Navigation
} from "lucide-react"

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Restaurants", href: "#restaurants" },
  { label: "Features", href: "#features" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" }
]

const WHY_CARDS = [
  {
    icon: Clock,
    title: "Skip Waiting",
    description: "Reserve tables instantly and walk in like a VIP. No more waiting in long queues."
  },
  {
    icon: UtensilsCrossed,
    title: "Fast Takeaway",
    description: "Order ahead, skip the line, and pick up your food fresh and hot without waiting."
  },
  {
    icon: ShieldCheck,
    title: "Verified Restaurants",
    description: "We partner only with premium, highly-rated restaurants to ensure a quality experience."
  }
]

const STEPS = [
  { title: "Browse Restaurants", description: "Discover premium dining spots near you.", icon: MapPin },
  { title: "Reserve / Order", description: "Book a table or schedule a takeaway.", icon: UtensilsCrossed },
  { title: "Reach Restaurant", description: "Arrive at your scheduled time.", icon: Clock },
  { title: "Enjoy Your Meal", description: "Dine in or pick up effortlessly.", icon: Star }
]

const FEATURED_RESTAURANTS = [
  {
    name: "The Grand Pavilion",
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=800",
    rating: 4.8,
    cuisine: "North Indian, Mughlai",
    distance: "1.2 km"
  },
  {
    name: "Sakura Sushi Bar",
    image: "https://images.unsplash.com/photo-1579027989536-b7b1f875659b?auto=format&fit=crop&q=80&w=800",
    rating: 4.9,
    cuisine: "Japanese, Asian",
    distance: "2.5 km"
  },
  {
    name: "La Piazza",
    image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=800",
    rating: 4.7,
    cuisine: "Italian, Desserts",
    distance: "0.8 km"
  }
]

const TESTIMONIALS = [
  {
    name: "Priya Sharma",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200",
    review: "RedGo completely changed how we dine out. Booking tables is seamless, and we never have to wait anymore!",
    rating: 5
  },
  {
    name: "Rahul Verma",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200",
    review: "The takeaway feature is a lifesaver for my busy schedule. My food is always ready when I arrive.",
    rating: 5
  },
  {
    name: "Sneha Patel",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200",
    review: "Premium restaurants and amazing UI. RedGo feels incredibly polished and works flawlessly.",
    rating: 5
  }
]

export default function MasterLandingPage() {
  const navigate = useNavigate()
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeTestimonial, setActiveTestimonial] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white font-sans selection:bg-[#D32F2F]/30 overflow-x-hidden scroll-smooth">

      {/* 2. Hero Section */}
      <section id="home" className="relative h-screen flex items-center justify-center overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/hero-bg-trim.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0B]/80 via-[#0B0B0B]/60 to-[#0B0B0B] z-10" />

        <div className="relative z-20 max-w-7xl mx-auto px-6 text-center flex flex-col items-center mt-20">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mb-2"
          >
            <h1 className="text-7xl md:text-[110px] font-black italic tracking-tighter drop-shadow-2xl text-white">
              Red<span className="text-[#D32F2F]">Go</span>
            </h1>
          </motion.div>

          {/* Subheading */}
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 drop-shadow-lg"
          >
            <br className="md:hidden" /> food & takeaway services
          </motion.h2>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className="text-lg md:text-2xl text-gray-100 mb-10 max-w-2xl mx-auto font-medium drop-shadow-md"
          >
            Experience fast & easy online ordering <br className="hidden md:block" /> on the RedGo app
          </motion.p>

          {/* App Store Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
            className="flex flex-col sm:flex-row items-center gap-4 justify-center"
          >
            <button className="flex items-center gap-3 bg-black border border-gray-600 text-white px-5 py-2 rounded-xl hover:-translate-y-2 hover:scale-[1.03] hover:border-gray-400 hover:shadow-2xl transition-all duration-200 w-48 justify-center">
              <img src="/playstore-icon.png" alt="Google Play" className="w-6 h-6 object-contain" />
              <div className="text-left leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-gray-300">GET IT ON</div>
                <div className="text-sm font-semibold">Google Play</div>
              </div>
            </button>
            <button className="flex items-center gap-3 bg-black border border-gray-600 text-white px-5 py-2 rounded-xl hover:-translate-y-2 hover:scale-[1.03] hover:border-gray-400 hover:shadow-2xl transition-all duration-200 w-48 justify-center">
              <svg viewBox="0 0 384 512" className="w-6 h-6 fill-current text-white"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" /></svg>
              <div className="text-left leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-gray-300">Download on the</div>
                <div className="text-sm font-semibold">App Store</div>
              </div>
            </button>
          </motion.div>

        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-row items-center gap-2 cursor-pointer text-white hover:text-gray-300 transition-colors z-30 animate-bounce"
          onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span className="text-[13px] font-medium tracking-wide">Scroll down</span>
          <ChevronDown className="w-6 h-6 mt-[1px]" />
        </motion.div>
      </section>

      {/* 2nd Page / New Section */}
      <section id="features" className="relative min-h-[100vh] lg:h-screen bg-red-50 text-gray-900 flex flex-col items-center justify-center overflow-hidden py-24 lg:py-0">
        {/* Background Premium Dot Texture */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(#D32F2F 2px, transparent 2px)', backgroundSize: '32px 32px' }}></div>
        {/* Fade gradient so texture blends smoothly at edges */}
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-red-50/20 via-transparent to-red-50"></div>

        {/* Floating food items */}
        {/* Burger */}
        <motion.div
          animate={{ y: [-10, 10, -10], rotate: [-2, 2, -2] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-10 md:left-24 -translate-y-1/2 z-10 drop-shadow-[0_20px_30px_rgba(0,0,0,0.2)]"
        >
          <img src="/burger-real.png" alt="Burger" className="w-20 md:w-64 object-contain opacity-50 md:opacity-100" />
        </motion.div>

        {/* Dim sums / Momos - Using user's provided dish image */}
        <motion.div
          animate={{ y: [10, -10, 10], rotate: [5, -5, 5] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-10 right-10 md:right-20 z-10 drop-shadow-[0_20px_30px_rgba(0,0,0,0.15)]"
        >
          <img
            src="/dish-img.png"
            alt="Dim Sums"
            className="w-24 md:w-64 object-contain opacity-50 md:opacity-100"
          />
        </motion.div>

        {/* Pizza */}
        <motion.div
          animate={{ y: [-15, 15, -15], rotate: [-10, 10, -10] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-32 right-10 md:right-32 z-10 drop-shadow-[0_20px_30px_rgba(0,0,0,0.2)]"
        >
          <img src="/pizza-free.png" alt="Pizza" className="w-20 md:w-60 object-contain opacity-50 md:opacity-100" />
        </motion.div>

        {/* Center Content */}
        <div className="relative z-20 text-center max-w-3xl mx-auto flex flex-col items-center px-6">
          <h2 className="text-5xl md:text-[68px] font-bold text-[#E64A53] leading-tight mb-8">
            Better food for <br /> more people
          </h2>
          <p className="text-xl md:text-[22px] text-gray-500 font-medium leading-relaxed max-w-2xl">
            For over a decade, we've enabled our customers to discover new tastes, delivered right to their doorstep
          </p>
        </div>

        {/* Services Card */}
        <div className="relative lg:absolute mt-16 lg:mt-0 bottom-auto lg:bottom-10 left-0 lg:left-1/2 lg:-translate-x-1/2 w-[90%] max-w-[1000px] z-30 mx-auto lg:mx-0">
          <div className="bg-white rounded-[32px] shadow-[0_15px_60px_-15px_rgba(0,0,0,0.15)] py-6 px-8 md:px-12 flex flex-col md:flex-row items-center justify-between gap-6 border border-gray-100">
            {/* Service 1 */}
            <div className="flex items-center gap-4 w-full justify-center md:justify-start group cursor-default">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300 shrink-0">
                <Rocket className="w-7 h-7 md:w-8 md:h-8 text-[#E64A53]" strokeWidth={1.5} />
              </div>
              <div className="text-center md:text-left">
                <div className="text-lg md:text-xl font-extrabold text-[#353A40] mb-0.5 tracking-tight group-hover:text-[#E64A53] transition-colors">Lightning Fast</div>
                <div className="text-[13px] md:text-[14px] text-gray-500 font-medium">Delivery under 30 mins</div>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-16 bg-gray-200 shrink-0"></div>

            {/* Service 2 */}
            <div className="flex items-center gap-4 w-full justify-center md:justify-center group cursor-default">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300 shrink-0">
                <Award className="w-7 h-7 md:w-8 md:h-8 text-[#E64A53]" strokeWidth={1.5} />
              </div>
              <div className="text-center md:text-left">
                <div className="text-lg md:text-xl font-extrabold text-[#353A40] mb-0.5 tracking-tight group-hover:text-[#E64A53] transition-colors">Premium Quality</div>
                <div className="text-[13px] md:text-[14px] text-gray-500 font-medium">Top-rated restaurants</div>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-16 bg-gray-200 shrink-0"></div>

            {/* Service 3 */}
            <div className="flex items-center gap-4 w-full justify-center md:justify-end group cursor-default">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300 shrink-0">
                <Navigation className="w-7 h-7 md:w-8 md:h-8 text-[#E64A53]" strokeWidth={1.5} />
              </div>
              <div className="text-center md:text-left">
                <div className="text-lg md:text-xl font-extrabold text-[#353A40] mb-0.5 tracking-tight group-hover:text-[#E64A53] transition-colors">Live Tracking</div>
                <div className="text-[13px] md:text-[14px] text-gray-500 font-medium">Real-time order updates</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* 3rd Page / App Features */}
      <section className="relative pt-20 pb-16 md:pb-24 bg-[#F35E6B] overflow-hidden text-center">
        {/* Subtle texture for the red background */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(#ffffff 2px, transparent 2px)', backgroundSize: '32px 32px' }}></div>
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <h2 className="text-3xl md:text-[40px] font-black text-white mb-4 tracking-tight leading-tight">
            What's waiting for you <br className="hidden md:block" /> on the app?
          </h2>
          <p className="text-red-100 font-medium text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Our app is packed with features that <br className="hidden md:block" /> enable you to experience food <br className="hidden md:block" /> delivery like never before
          </p>

          <div className="relative w-full max-w-[700px] mx-auto h-[320px] flex justify-center mt-2 scale-[0.85] sm:scale-[0.9] md:scale-100 origin-top">

            {/* Phone Mockup - Scaled down and made very concise */}
            <div className="relative w-[220px] md:w-[250px] h-[450px] md:h-[500px] bg-black rounded-[40px] border-[10px] border-black shadow-[0_30px_60px_rgba(0,0,0,0.2)] z-20 overflow-hidden transform translate-y-12 md:translate-y-16 group">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[100px] h-[20px] bg-black rounded-b-[12px] z-30" />
              {/* Screen Background */}
              <div className="w-full h-full bg-[#F8F9FA] flex flex-col items-center justify-center p-5 pt-12 transition-transform duration-500 group-hover:bg-[#F0F2F5]">
                {/* Live Tracking Card */}
                <div className="w-[95%] bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 cursor-pointer -mt-40">
                  <div className="w-12 h-12 mb-2 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                    <MapPin className="w-6 h-6 text-blue-500" />
                  </div>
                  <h3 className="font-bold text-gray-800 text-[13px] mb-1">Live Tracking</h3>
                  <p className="text-[10px] text-gray-500 leading-tight">Track your order<br />in real-time</p>
                </div>
              </div>
            </div>

            {/* Left Floating Cards - Pulled very close */}
            <div className="flex absolute left-[-5%] sm:left-[2%] md:left-[12%] top-[8%] z-30 flex-col gap-4 md:gap-5">
              <motion.div whileHover={{ scale: 1.15, rotate: -5, zIndex: 50 }} whileTap={{ scale: 0.95 }} animate={{ y: [-4, 4, -4] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }} className="group bg-white rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2.5 pb-3 border border-gray-100 flex flex-col gap-1.5 items-center text-center w-[90px] md:w-[100px] cursor-pointer">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-0.5 group-hover:bg-green-50 group-hover:shadow-inner transition-colors duration-300 border border-transparent group-hover:border-green-100 relative overflow-hidden">
                  <div className="absolute inset-0 bg-green-400 opacity-0 group-hover:opacity-20 group-hover:animate-ping rounded-2xl"></div>
                  <div className="text-[28px] md:text-[32px] leading-none group-hover:scale-125 group-hover:-rotate-12 transition-transform duration-300 relative z-10">🥗</div>
                </div>
                <span className="font-semibold text-[10px] md:text-[11px] text-gray-700 group-hover:text-green-600 transition-colors">Healthy</span>
              </motion.div>
              <motion.div whileHover={{ scale: 1.15, rotate: 5, zIndex: 50 }} whileTap={{ scale: 0.95 }} animate={{ y: [4, -4, 4] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }} className="group bg-white rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2.5 pb-3 border border-gray-100 flex flex-col gap-1.5 items-center text-center w-[90px] md:w-[100px] ml-4 md:ml-6 cursor-pointer">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-0.5 group-hover:bg-yellow-50 group-hover:shadow-inner transition-colors duration-300 border border-transparent group-hover:border-yellow-100 relative overflow-hidden">
                  <div className="absolute inset-0 bg-yellow-400 opacity-0 group-hover:opacity-20 group-hover:animate-ping rounded-2xl"></div>
                  <div className="text-[28px] md:text-[32px] leading-none group-hover:scale-125 group-hover:rotate-12 transition-transform duration-300 relative z-10">🎉</div>
                </div>
                <span className="font-semibold text-[10px] md:text-[11px] text-gray-700 leading-tight group-hover:text-yellow-600 transition-colors">Plan<br />a Party</span>
              </motion.div>
            </div>

            {/* Left Top Card - Veg Mode */}
            <motion.div whileHover={{ scale: 1.15, zIndex: 50 }} whileTap={{ scale: 0.95 }} animate={{ y: [-3, 3, -3] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="flex group absolute left-[15%] sm:left-[20%] md:left-[30%] top-[-8%] md:top-[-6%] z-30 bg-white rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.12)] p-2.5 pb-3 border border-gray-100 flex-col gap-2 items-center text-center w-[90px] md:w-[100px] cursor-pointer">
              <div className="w-[44px] md:w-[50px] h-[22px] md:h-[26px] bg-[#1FA54E] rounded-full flex items-center p-[3px] group-hover:bg-[#188a40] transition-colors relative overflow-hidden shadow-inner group-hover:shadow-[0_0_15px_rgba(31,165,78,0.4)]">
                <div className="w-[16px] md:w-[20px] h-[16px] md:h-[20px] bg-white rounded-full shadow-sm group-hover:scale-90 transform group-hover:translate-x-[22px] md:group-hover:translate-x-[24px] transition-all duration-300 absolute left-[3px]"></div>
              </div>
              <span className="font-semibold text-[10px] md:text-[11px] text-gray-700 mt-0.5 group-hover:text-[#1FA54E] transition-colors">Veg Mode</span>
            </motion.div>

            {/* Right Floating Cards - Pulled very close */}
            <div className="flex absolute right-[-5%] sm:right-[2%] md:right-[12%] top-[12%] md:top-[14%] z-30 flex-col gap-4 md:gap-5 items-end">
              <motion.div whileHover={{ scale: 1.15, rotate: 5, zIndex: 50 }} whileTap={{ scale: 0.95 }} animate={{ y: [3, -3, 3] }} transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }} className="group bg-white rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2.5 pb-3 border border-gray-100 flex flex-col gap-1.5 items-center text-center w-[90px] md:w-[100px] cursor-pointer">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-0.5 group-hover:bg-orange-50 group-hover:shadow-inner transition-colors duration-300 border border-transparent group-hover:border-orange-100 relative overflow-hidden">
                  <div className="absolute inset-0 bg-orange-400 opacity-0 group-hover:opacity-20 group-hover:animate-ping rounded-2xl"></div>
                  <div className="text-[28px] md:text-[32px] leading-none group-hover:scale-125 group-hover:rotate-12 transition-transform duration-300 relative z-10">🍝</div>
                </div>
                <span className="font-semibold text-[10px] md:text-[11px] text-gray-700 group-hover:text-orange-500 transition-colors">Gourmet</span>
              </motion.div>
              <motion.div whileHover={{ scale: 1.15, rotate: -5, zIndex: 50 }} whileTap={{ scale: 0.95 }} animate={{ y: [-5, 5, -5] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="group bg-white rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2.5 pb-3 border border-gray-100 flex flex-col gap-1.5 items-center text-center w-[90px] md:w-[100px] mr-4 md:mr-6 cursor-pointer">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-0.5 group-hover:bg-red-50 group-hover:shadow-inner transition-colors duration-300 border border-transparent group-hover:border-red-100 relative overflow-hidden">
                  <div className="absolute inset-0 bg-red-400 opacity-0 group-hover:opacity-20 group-hover:animate-ping rounded-2xl"></div>
                  <div className="text-[28px] md:text-[32px] leading-none group-hover:scale-125 group-hover:-rotate-12 transition-transform duration-300 relative z-10">🍔</div>
                </div>
                <span className="font-semibold text-[10px] md:text-[11px] text-gray-700 group-hover:text-[#E64A53] transition-colors">Collections</span>
              </motion.div>
            </div>

            {/* Right Top Card - Offers */}
            <motion.div whileHover={{ scale: 1.15, zIndex: 50 }} whileTap={{ scale: 0.95 }} animate={{ y: [4, -4, 4] }} transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }} className="flex group absolute right-[15%] sm:right-[20%] md:right-[30%] top-[0%] z-30 bg-white rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.12)] p-2.5 pb-3 border border-gray-100 flex-col gap-2 items-center text-center w-[90px] md:w-[100px] cursor-pointer">
              <div className="w-[36px] md:w-[42px] h-[36px] md:h-[42px] bg-blue-50 rounded-[12px] flex items-center justify-center group-hover:bg-blue-100 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all duration-300">
                <img src="/offers.png" alt="Offers" className="w-[20px] h-[20px] md:w-[24px] md:h-[24px] object-contain group-hover:scale-110 transition-transform" />
              </div>
              <span className="font-semibold text-[10px] md:text-[11px] text-gray-700 mt-1 group-hover:text-blue-500 transition-colors">Offers</span>
            </motion.div>
          </div>
        </div>

        {/* Curved bridge divider connecting to the dark section below */}
        <div className="absolute -bottom-1 left-0 w-full z-10 pointer-events-none">
          <svg viewBox="0 0 1440 250" className="w-full h-[150px] md:h-[250px] block" preserveAspectRatio="none">
            {/* This draws a black shape at the bottom that dips downwards in the center to match the screenshot smile curve */}
            <path d="M0,250 L0,100 Q720,300 1440,100 L1440,250 Z" fill="#111" />
          </svg>
        </div>
      </section>

      {/* 4. How RedGo Works */}
      <section className="py-24 px-6 bg-[#111] relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black mb-4">How It <span className="text-[#D32F2F]">Works</span></h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Your journey to a perfect meal in four simple steps.</p>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="opacity-0 md:opacity-100 hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#D32F2F]/50 to-transparent -translate-y-1/2" />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-6">
              {STEPS.map((step, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.15 }}
                  className="relative flex flex-col items-center text-center group"
                >
                  <div className="w-20 h-20 rounded-full bg-[#1A1A1A] border-2 border-[#333] group-hover:border-[#D32F2F] flex items-center justify-center mb-6 relative z-10 transition-colors duration-300 shadow-xl">
                    <step.icon className="w-8 h-8 text-gray-400 group-hover:text-[#D32F2F] transition-colors" />

                    {/* Step Number Badge */}
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#D32F2F] text-white font-bold flex items-center justify-center text-sm border-2 border-[#111]">
                      {idx + 1}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                  <p className="text-gray-400 text-sm max-w-[200px] mx-auto">{step.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Premium Red Transition Divider */}
      <div className="relative w-full h-[150px] md:h-[250px] bg-[#111] overflow-hidden flex justify-center mt-[-1px]">
        {/* Faint red geometric diamond patterns */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg stroke=\'%23D32F2F\' stroke-width=\'1\'%3E%3Cpath d=\'M30 0l30 30-30 30L0 30z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '120px 120px' }}></div>

        {/* Massive White Convex Curve */}
        <div className="absolute bottom-[-2px] left-0 w-full z-20">
          <svg viewBox="0 0 1440 200" className="w-full h-[80px] md:h-[150px] block" preserveAspectRatio="none">
            <path d="M0,200 L0,150 Q720,0 1440,150 L1440,200 Z" fill="#ffffff" />
          </svg>
        </div>
      </div>



      {/* 6. RedGo Experience */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="w-full lg:w-1/2 relative min-h-[500px] md:min-h-[600px] flex items-center justify-center"
          >
            {/* Background Image (Restaurant Exterior) */}
            <div className="absolute top-0 right-0 w-[85%] h-[80%] rounded-[32px] overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-[#D32F2F]/10 z-10 mix-blend-overlay" />
              <img
                src="https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?auto=format&fit=crop&w=1000&q=80"
                alt="Roadside Restaurant"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* Foreground Image (Food - overlapping bottom left) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="absolute bottom-0 left-0 w-[75%] h-[55%] bg-white p-3 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.2)] z-20"
            >
              <img
                src="/restaurant-food.jpg"
                alt="Delicious Food"
                className="w-full h-full object-cover rounded-[16px]"
                loading="lazy"
              />
            </motion.div>

            {/* Floating UI Element (Moved to top left to balance) */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-10 -left-6 md:-left-10 bg-[#1A1A1A] p-4 rounded-2xl border border-white/10 shadow-xl flex items-center gap-4 z-30"
            >
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Table Reserved</p>
                <p className="font-bold text-white">Confirmed instantly</p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="w-full lg:w-1/2 space-y-10"
          >
            <div>
              <h2 className="text-4xl md:text-5xl font-black mb-6 leading-tight text-black">Elevate your <span className="text-[#D32F2F]">dining & takeaway experience</span></h2>
              <p className="text-gray-600 text-lg">We've reimagined everything from discovering places to paying the bill. It's smart, seamless, and incredibly fast.</p>
            </div>

            <div className="space-y-6">
              {[
                { title: "Table Reservation", desc: "Book instantly and walk past the queue." },
                { title: "Takeaway Scheduling", desc: "Order ahead and pick it up on your way." },
                { title: "Digital Bills & Easy Payments", desc: "Split the bill and pay securely from your phone." },
                { title: "Live Order Status", desc: "Know exactly when your food is ready." }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4 items-start">
                  <div className="mt-1 w-6 h-6 rounded-full bg-[#D32F2F]/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-[#D32F2F]" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-1 text-black">{item.title}</h4>
                    <p className="text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

          </motion.div>
        </div>
      </section>



      {/* 8. Download App */}
      <section className="py-24 px-6 bg-gradient-to-b from-[#111] to-[#0B0B0B]">
        <div className="max-w-6xl mx-auto bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] rounded-[32px] md:rounded-[48px] border border-white/10 p-8 md:p-20 overflow-hidden relative shadow-2xl">
          <div className="absolute inset-0 bg-[#D32F2F]/5 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="w-full md:w-1/2 text-center md:text-left">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight text-white">
                Get the <span className="text-[#D32F2F]">RedGo</span> App
              </h2>
              <p className="text-gray-400 text-lg mb-10 max-w-md mx-auto md:mx-0">
                Download our app for the fastest booking experience, exclusive offers, and live order tracking.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
                <button className="flex items-center gap-3 bg-transparent border border-white/20 text-white px-6 py-3 rounded-2xl hover:-translate-y-2 hover:scale-[1.03] hover:border-gray-400 hover:shadow-2xl transition-all duration-200 w-full sm:w-auto">
                  <div className="flex items-center justify-center text-white w-8 h-8">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" className="w-6 h-6">
                      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Download on the</div>
                    <div className="text-lg font-black leading-none text-white">App Store</div>
                  </div>
                </button>
                <button className="flex items-center gap-3 bg-transparent border border-white/20 text-white px-6 py-3 rounded-2xl hover:-translate-y-2 hover:scale-[1.03] hover:border-gray-400 hover:shadow-2xl transition-all duration-200 w-full sm:w-auto">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="white" className="w-6 h-6">
                      <path fill="white" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Get it on</div>
                    <div className="text-lg font-black leading-none text-white">Google Play</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="w-full md:w-1/2 flex justify-center relative">
              {/* Abstract decorative elements behind phone */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-[#D32F2F]/20 rounded-full blur-3xl" />

              {/* Phone Mockup Placeholder */}
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative w-64 h-[500px] bg-black border-[8px] border-[#333] rounded-[40px] shadow-2xl overflow-hidden"
              >
                {/* Screen content */}
                <div className="absolute inset-0 bg-[#0B0B0B] p-4 flex flex-col">
                  {/* Status Bar */}
                  <div className="w-full h-6 flex justify-between items-center mb-6 px-2">
                    <span className="text-[10px] font-bold text-white">9:41</span>
                    <div className="flex gap-1">
                      <div className="w-3 h-3 bg-white rounded-full" />
                      <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>

                  {/* App Mockup UI - Interactive Animation */}
                  <div className="w-full h-32 bg-[#1A1A1A] rounded-2xl mb-4 p-4 border border-white/5 overflow-hidden relative">
                    <motion.div
                      animate={{ x: [-150, 300] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-1/2 skew-x-12"
                    />
                    <div className="w-20 h-4 bg-white/20 rounded mb-2" />
                    <div className="w-32 h-6 bg-white rounded mb-4" />
                    <div className="flex gap-3">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="w-12 h-12 bg-[#D32F2F] rounded-xl flex items-center justify-center shadow-lg shadow-[#D32F2F]/20"
                      >
                        <div className="w-5 h-5 bg-white/40 rounded-full" />
                      </motion.div>
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, delay: 0.5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center"
                      >
                        <div className="w-5 h-5 bg-white/20 rounded-full" />
                      </motion.div>
                    </div>
                  </div>

                  <div className="flex-1 bg-[#1A1A1A] rounded-2xl border border-white/5 p-4 flex flex-col gap-4 overflow-hidden relative">
                    {/* Animated List Items */}
                    {[1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 2, delay: i * 0.4, repeat: Infinity, ease: "easeInOut" }}
                        className="w-full bg-white/5 rounded-xl flex items-center p-3 gap-3"
                      >
                        <div className="w-10 h-10 bg-white/10 rounded-lg shrink-0" />
                        <div className="flex flex-col gap-2 w-full">
                          <div className="w-full h-2.5 bg-white/20 rounded" />
                          <div className="w-1/2 h-2 bg-white/10 rounded" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer id="contact" className="bg-[#050505] pt-24 pb-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-16">

            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-6">
                <img src="/redgo-logo-footer.jpeg" alt="RedGo" className="h-10 object-contain rounded-md" />
              </div>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                India's smartest dining and takeaway platform. Skip the lines, discover new tastes, and dine better.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-[#D32F2F] hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" className="w-4 h-4">
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                  </svg>
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-[#D32F2F] hover:text-white transition-all">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M22.1 11.2l-18.7-10.9c-.9-1-2-.1-2 1v21.8c0 1.1 1.1 2 2 1l18.7-10.9c1.2-.6 1.2-2.3 0-2z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-bold text-white mb-6 uppercase tracking-wider text-sm">Legal</h4>
              <ul className="space-y-4">
                {[
                  { name: "Privacy Policy", path: "/user/profile/privacy" },
                  { name: "Terms of Service", path: "/user/profile/terms" },
                  { name: "Support", path: "/user/profile/support-info" }
                ].map(item => (
                  <li key={item.name}>
                    <a href={item.path} className="text-gray-400 hover:text-[#D32F2F] transition-colors text-sm">
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact Us */}
            <div>
              <h4 className="font-bold text-white mb-6 uppercase tracking-wider text-sm">Contact Us</h4>
              <ul className="space-y-4 text-sm text-gray-400">
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <span>support@redgo.in</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" /></svg>
                  </div>
                  <span>+91 98765 43210</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">
              &copy; {new Date().getFullYear()} RedGo Technologies. All rights reserved.
            </p>
            <div className="flex gap-4 text-sm text-gray-500">
              <span>Made with ❤️ in India</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
