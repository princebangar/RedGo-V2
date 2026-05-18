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
              <Suspense fallback={
                <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center">
                  <div className="relative">
                    <div className="w-10 h-10 border-[3px] border-gray-100/30 rounded-full"></div>
                    <div className="absolute top-0 left-0 w-10 h-10 border-[3px] border-[#B80B3D] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                </div>
              }>
                <RestaurantRouter />
              </Suspense>
            }
          />

          {/* Delivery Module - Already mapped to /delivery */}
          <Route
            path="delivery/*"
            element={
              <Suspense fallback={
                <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center">
                  <div className="relative">
                    <div className="w-10 h-10 border-[3px] border-gray-100/30 rounded-full"></div>
                    <div className="absolute top-0 left-0 w-10 h-10 border-[3px] border-[#059669] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                </div>
              }>
                <DeliveryRouter />
              </Suspense>
            }
          />

          {/* User Module - Explicitly mapped to /user and the catch-all for /food/ and / */}
          {/* NOTE: /user/food is a common mis-navigation - redirect to correct /food/user home */}
          <Route path="user/food" element={<Navigate to="/food/user" replace />} />
          <Route
            path="user/*"
            element={
              <Suspense fallback={<AppShellSkeleton />}>
                <UserRouter />
              </Suspense>
            }
          />

          {/* Make UserRouter the default for all other paths to handle / and /food/ as user home */}
          <Route
            path="/*"
            element={
              <Suspense fallback={<AppShellSkeleton />}>
                <UserRouter />
              </Suspense>
            }
          />
        </Routes>
      </>
    </AuthInitializer>
  )
}
