import React, { Suspense, lazy } from "react"
import { Routes, Route, Navigate, Outlet } from "react-router-dom"
import UserLayout from "./UserLayout"
import Loader from "@food/components/Loader"
import ProtectedRoute from "@food/components/ProtectedRoute"
import AuthRedirect from "@food/components/AuthRedirect"

// Lazy Loading Pages

// Home & Discovery
const Home = lazy(() => import("@food/pages/user/Home"))
const Dining = lazy(() => import("@food/pages/user/Dining"))
const DiningCategory = lazy(() => import("@food/pages/user/DiningCategory"))
const DiningExplore50 = lazy(() => import("@food/pages/user/DiningExplore50"))
const DiningExploreNear = lazy(() => import("@food/pages/user/DiningExploreNear"))
const Coffee = lazy(() => import("@food/pages/user/Coffee"))
const Under250 = lazy(() => import("@food/pages/user/Under250"))
const Categories = lazy(() => import("@food/pages/user/Categories"))
const CategoryPage = lazy(() => import("@food/pages/user/CategoryPage"))
const Restaurants = lazy(() => import("@food/pages/user/restaurants/Restaurants"))
const RestaurantDetails = lazy(() => import("@food/pages/user/restaurants/RestaurantDetails"))
const DiningRestaurantDetails = lazy(() => import("@food/pages/user/dining/DiningRestaurantDetails"))
const TableBooking = lazy(() => import("@food/pages/user/dining/TableBooking"))
const TableBookingConfirmation = lazy(() => import("@food/pages/user/dining/TableBookingConfirmation"))
const TableBookingSuccess = lazy(() => import("@food/pages/user/dining/TableBookingSuccess"))
const TableModificationPolicy = lazy(() => import("@food/pages/user/dining/TableModificationPolicy"))
const TableCancellationPolicy = lazy(() => import("@food/pages/user/dining/TableCancellationPolicy"))
const TableEditUserPage = lazy(() => import("@food/pages/user/dining/TableEditUserPage"))
const MyBookings = lazy(() => import("@food/pages/user/dining/MyBookings"))
const SearchResults = lazy(() => import("@food/pages/user/search/ProfessionalSearch"))
const ProductDetail = lazy(() => import("@food/pages/user/ProductDetail"))

// Cart
const Cart = lazy(() => import("@food/pages/user/cart/Cart"))
const Checkout = lazy(() => import("@food/pages/user/cart/Checkout"))
const SelectAddress = lazy(() => import("@food/pages/user/cart/SelectAddress"))
const AddressSelectorPage = lazy(() => import("@food/pages/user/cart/AddressSelectorPage"))

// Orders
const Orders = lazy(() => import("@food/pages/user/orders/Orders"))
const OrderTracking = lazy(() => import("@food/pages/user/orders/OrderTracking"))
const OrderInvoice = lazy(() => import("@food/pages/user/orders/OrderInvoice"))
const UserOrderDetails = lazy(() => import("@food/pages/user/orders/UserOrderDetails"))

// Offers
const Offers = lazy(() => import("@food/pages/user/Offers"))

// Gourmet
const Gourmet = lazy(() => import("@food/pages/user/Gourmet"))


// Collections
const Collections = lazy(() => import("@food/pages/user/Collections"))
const CollectionDetail = lazy(() => import("@food/pages/user/CollectionDetail"))



// Profile
const Profile = lazy(() => import("@food/pages/user/profile/Profile"))
const EditProfile = lazy(() => import("@food/pages/user/profile/EditProfile"))
const Payments = lazy(() => import("@food/pages/user/profile/Payments"))
const AddPayment = lazy(() => import("@food/pages/user/profile/AddPayment"))
const EditPayment = lazy(() => import("@food/pages/user/profile/EditPayment"))
const Favorites = lazy(() => import("@food/pages/user/profile/Favorites"))
const Support = lazy(() => import("@food/pages/user/profile/Support"))
const Coupons = lazy(() => import("@food/pages/user/profile/Coupons"))
const About = lazy(() => import("@food/pages/user/profile/About"))
const Terms = lazy(() => import("@food/pages/user/profile/Terms"))
const Privacy = lazy(() => import("@food/pages/user/profile/Privacy"))
const Refund = lazy(() => import("@food/pages/user/profile/Refund"))
const Shipping = lazy(() => import("@food/pages/user/profile/Shipping"))
const Cancellation = lazy(() => import("@food/pages/user/profile/Cancellation"))
const ReportSafetyEmergency = lazy(() => import("@food/pages/user/profile/ReportSafetyEmergency"))
const Accessibility = lazy(() => import("@food/pages/user/profile/Accessibility"))
const Logout = lazy(() => import("@food/pages/user/profile/Logout"))
const ReferEarn = lazy(() => import("@food/pages/user/profile/ReferEarn"))
const UserCMSHelpSupportPage = lazy(() => import("@food/pages/user/profile/UserCMSHelpSupportPage"))

// Auth
const SignIn = lazy(() => import("@food/pages/user/auth/SignIn"))
const OTP = lazy(() => import("@food/pages/user/auth/OTP"))
const AuthCallback = lazy(() => import("@food/pages/user/auth/AuthCallback"))

// Help
const Help = lazy(() => import("@food/pages/user/help/Help"))
const OrderHelp = lazy(() => import("@food/pages/user/help/OrderHelp"))

// Notifications
const Notifications = lazy(() => import("@food/pages/user/Notifications"))

// Wallet
const Wallet = lazy(() => import("@food/pages/user/Wallet"))

// Complaints
const SubmitComplaint = lazy(() => import("@food/pages/user/complaints/SubmitComplaint"))

export default function UserRouter() {
  return (
    <Suspense fallback={<div className="flex-1 min-h-screen bg-white dark:bg-[#0a0a0a]" />}>
      <Routes>
        <Route element={<UserLayout />}>
          {/* ========================================== */}
          {/* PUBLIC ROUTES (No login required)          */}
          {/* ========================================== */}
          
          {/* Public Legal Policies & Support */}
          <Route path="profile/terms" element={<Terms />} />
          <Route path="profile/privacy" element={<Privacy />} />
          <Route path="profile/refund" element={<Refund />} />
          <Route path="profile/shipping" element={<Shipping />} />
          <Route path="profile/cancellation" element={<Cancellation />} />
          <Route path="profile/support" element={<Support />} />
          <Route path="profile/support-info" element={<UserCMSHelpSupportPage />} />
          
          {/* Help Center */}
          <Route path="help" element={<Help />} />
          <Route path="help/orders/:orderId" element={<OrderHelp />} />

          {/* Auth Redirects & Callbacks */}
          <Route path="auth/login" element={
            <AuthRedirect module="user">
              <Navigate to="/user/auth/login" replace />
            </AuthRedirect>
          } />
          <Route path="auth/sign-in" element={
            <AuthRedirect module="user">
              <Navigate to="/user/auth/login" replace />
            </AuthRedirect>
          } />
          <Route path="auth/otp" element={
            <AuthRedirect module="user">
              <OTP />
            </AuthRedirect>
          } />
          <Route path="auth/callback" element={<AuthCallback />} />


          {/* ========================================== */}
          {/* PROTECTED ROUTES (Login required)          */}
          {/* ========================================== */}
          <Route element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><Outlet /></ProtectedRoute>}>
            {/* Home & Discovery */}
            <Route path="" element={<Home />} />
            <Route path="takeaway" element={<Home />} />
            <Route path="dining" element={<Dining />} />
            <Route path="dining/:category" element={<DiningCategory />} />
            <Route path="dining/explore/upto50" element={<DiningExplore50 />} />
            <Route path="dining/explore/near-rated" element={<DiningExploreNear />} />
            <Route path="dining/coffee" element={<Coffee />} />
            <Route path="dining/:diningType/:slug" element={<DiningRestaurantDetails />} />
            <Route path="dining/book/:slug" element={<TableBooking />} />
            <Route path="dining/book-confirmation" element={<TableBookingConfirmation />} />
            <Route path="dining/book-success" element={<TableBookingSuccess />} />
            <Route path="dining/modification-policy" element={<TableModificationPolicy />} />
            <Route path="dining/cancellation-policy" element={<TableCancellationPolicy />} />
            <Route path="dining/edit-user" element={<TableEditUserPage />} />
            <Route path="bookings" element={<MyBookings />} />
            <Route path="under-250" element={<Under250 />} />
            <Route path="categories" element={<Categories />} />
            <Route path="category/:category" element={<CategoryPage />} />
            <Route path="restaurants" element={<Restaurants />} />
            <Route path="restaurants/:slug" element={<RestaurantDetails />} />
            <Route path="search" element={<SearchResults />} />
            <Route path="product/:id" element={<ProductDetail />} />

            {/* Cart */}
            <Route path="cart" element={<Cart />} />
            <Route path="cart/checkout" element={<Checkout />} />
            <Route path="cart/select-address" element={<SelectAddress />} />
            <Route path="address-selector" element={<AddressSelectorPage />} />

            {/* Orders */}
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:orderId" element={<OrderTracking />} />
            <Route path="orders/:orderId/invoice" element={<OrderInvoice />} />
            <Route path="orders/:orderId/details" element={<UserOrderDetails />} />

            {/* Offers */}
            <Route path="offers" element={<Offers />} />

            {/* Gourmet */}
            <Route path="gourmet" element={<Gourmet />} />

            {/* Collections */}
            <Route path="collections" element={<Collections />} />
            <Route path="collections/:id" element={<CollectionDetail />} />

            {/* Profile */}
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<EditProfile />} />
            <Route path="profile/payments" element={<Payments />} />
            <Route path="profile/payments/new" element={<AddPayment />} />
            <Route path="profile/payments/:id/edit" element={<EditPayment />} />
            <Route path="profile/favorites" element={<Favorites />} />
            <Route path="profile/coupons" element={<Coupons />} />
            <Route path="profile/about" element={<About />} />
            <Route path="profile/report-safety-emergency" element={<ReportSafetyEmergency />} />
            <Route path="profile/accessibility" element={<Accessibility />} />
            <Route path="profile/logout" element={<Logout />} />
            <Route path="profile/refer-earn" element={<ReferEarn />} />
            <Route path="profile/dining-bookings" element={<MyBookings />} />

            {/* Notifications */}
            <Route path="notifications" element={<Notifications />} />

            {/* Wallet */}
            <Route path="wallet" element={<Wallet />} />

            {/* Complaints */}
            <Route path="complaints/submit/:orderId" element={<SubmitComplaint />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
