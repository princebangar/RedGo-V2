import React, { useEffect, Suspense, lazy } from "react"
import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import ProtectedRoute from "@food/components/ProtectedRoute"
import AuthRedirect from "@food/components/AuthRedirect"
import Loader from "@food/components/Loader"
import AuthInitializer from "@food/components/AuthInitializer"
import PushSoundEnableButton from "@food/components/PushSoundEnableButton"
import { registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import { isModuleAuthenticated } from "@food/utils/auth"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import { AppShellSkeleton } from "./components/ui/loading-skeletons"

// Eagerly preload the red banner image so Home page renders instantly
import homeBannerRed from "@food/assets/home-banner-red-clean.png"
if (typeof window !== 'undefined') {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = homeBannerRed;
  link.fetchPriority = 'high';
  document.head.appendChild(link);
}

// Lazy Loading Components
const UserRouter = lazy(() => import("@food/components/user/UserRouter"))

// Restaurant Module
const RestaurantRouter = lazy(() => import("@food/components/restaurant/RestaurantRouter"))

// Admin Module
const AdminRouter = lazy(() => import("@food/components/admin/AdminRouter"))
const AdminLogin = lazy(() => import("@food/pages/admin/auth/AdminLogin"))
const AdminSignup = lazy(() => import("@food/pages/admin/auth/AdminSignup"))
const AdminForgotPassword = lazy(() => import("@food/pages/admin/auth/AdminForgotPassword"))

// Delivery Module
const DeliveryRouter = lazy(() => import("../DeliveryV2"))

const UserRouterWrapper = () => {
  const location = useLocation();
  const isPolicyPage = location.pathname.includes('terms') || 
                       location.pathname.includes('privacy') || 
                       location.pathname.includes('support') ||
                       location.pathname.includes('refund') ||
                       location.pathname.includes('shipping') ||
                       location.pathname.includes('cancellation');

  return (
    <Suspense fallback={isPolicyPage ? <div className="flex h-screen items-center justify-center"><Loader /></div> : <AppShellSkeleton />}>
      <UserRouter />
    </Suspense>
  )
}

function UserPathRedirect() {
  const location = useLocation()
  // Correctly handle the /food/user -> /food redirect regardless of where it starts
  const newPath = location.pathname.replace("/user", "") || "/food"
  return <Navigate to={newPath} replace />
}

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RestaurantGlobalNotificationListenerInner() {
  useRestaurantNotifications()
  return null
}

function RestaurantGlobalNotificationListener() {
  const location = useLocation()
  const isRestaurantRoute =
    location.pathname.startsWith("/food/restaurant") &&
    !location.pathname.startsWith("/food/restaurants")
  const isRestaurantAuthRoute =
    location.pathname === "/food/restaurant/login" ||
    location.pathname === "/food/restaurant/auth/sign-in" ||
    location.pathname === "/food/restaurant/signup" ||
    location.pathname === "/food/restaurant/signup-email" ||
    location.pathname === "/food/restaurant/forgot-password" ||
    location.pathname === "/food/restaurant/otp" ||
    location.pathname === "/food/restaurant/welcome" ||
    location.pathname === "/food/restaurant/auth/google-callback"
  const isOrderManagedRoute =
    location.pathname === "/food/restaurant" ||
    location.pathname === "/food/restaurant/orders" ||
    location.pathname.startsWith("/food/restaurant/orders/")

  const shouldListen =
    isRestaurantRoute &&
    !isRestaurantAuthRoute &&
    !isOrderManagedRoute &&
    isModuleAuthenticated("restaurant")

  if (!shouldListen) {
    return null
  }

  return <RestaurantGlobalNotificationListenerInner />
}

export default function App() {
  const location = useLocation()

  useEffect(() => {
    registerWebPushForCurrentModule(location.pathname)
  }, [location.pathname])

  return (
    <AuthInitializer>
      <>
        <ScrollToTop />
        <RestaurantGlobalNotificationListener />
        <PushSoundEnableButton />
        <Routes>
          {/* Restaurant Module - Already mapped to /restaurant */}
          <Route
            path="restaurant/*"
            element={
              <Suspense fallback={<AppShellSkeleton />}>
                <RestaurantRouter />
              </Suspense>
            }
          />

          {/* Delivery Module - Already mapped to /delivery */}
          <Route
            path="delivery/*"
            element={
              <Suspense fallback={<AppShellSkeleton />}>
                <DeliveryRouter />
              </Suspense>
            }
          />

          {/* User Module - Explicitly mapped to /user and the catch-all for /food/ and / */}
          {/* NOTE: /user/food is a common mis-navigation - redirect to correct /food/user home */}
          <Route path="user/food" element={<Navigate to="/food/user" replace />} />
          <Route
            path="user/*"
            element={<UserRouterWrapper />}
          />

          {/* Make UserRouter the default for all other paths to handle / and /food/ as user home */}
          <Route
            path="/*"
            element={<UserRouterWrapper />}
          />
        </Routes>
      </>
    </AuthInitializer>
  )
}
