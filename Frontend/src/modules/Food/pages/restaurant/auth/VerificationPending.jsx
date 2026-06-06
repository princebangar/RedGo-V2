import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Clock3, ShieldCheck, XCircle, AlertTriangle, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@food/components/ui/button"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { restaurantAPI } from "@food/api"
import {
  clearRestaurantPendingPhone,
  getModuleToken,
  getRestaurantPendingPhone,
} from "@food/utils/auth"

export default function VerificationPending() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [reapplying, setReapplying] = useState(false)

  const [localStatus, setLocalStatus] = useState(() => {
    if (location.state?.isRejected !== undefined) {
      return location.state.isRejected ? "rejected" : "pending"
    }
    return localStorage.getItem("restaurant_pendingStatus") || "pending"
  })

  const [localMessage, setLocalMessage] = useState(() => {
    if (location.state?.message) {
      return location.state.message
    }
    return localStorage.getItem("restaurant_pendingMessage") || ""
  })

  const pendingPhone = useMemo(() => {
    return (
      location.state?.phone ||
      getRestaurantPendingPhone() ||
      ""
    )
  }, [location.state?.phone])

  const parsedMessage = useMemo(() => {
    if (!localMessage) {
      return { text: "Your restaurant registration has been rejected. Please contact support.", reason: "" }
    }
    const parts = localMessage.split(/Reason:\s*/i)
    if (parts.length > 1) {
      return {
        text: parts[0].trim(),
        reason: parts[1].trim()
      }
    }
    return {
      text: localMessage,
      reason: ""
    }
  }, [localMessage])

  useEffect(() => {
    let cancelled = false

    const checkApprovalStatus = async () => {
      const token = getModuleToken("restaurant")
      if (!token) {
        if (!cancelled) setCheckingStatus(false)
        return
      }

      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant =
          response?.data?.data?.restaurant ||
          response?.data?.restaurant ||
          response?.data?.data?.user ||
          response?.data?.user

        if (cancelled) return

        const status = String(restaurant?.status || "").toLowerCase()

        if (status === "approved") {
          clearRestaurantPendingPhone()
          localStorage.removeItem("restaurant_pendingStatus")
          localStorage.removeItem("restaurant_pendingMessage")
          navigate("/food/restaurant", { replace: true })
          return
        } else if (status === "rejected") {
          setLocalStatus("rejected")
          const msg = restaurant.rejectionReason 
            ? `Your restaurant registration was rejected: ${restaurant.rejectionReason}`
            : "Your restaurant registration has been rejected. Please contact support."
          setLocalMessage(msg)
          localStorage.setItem("restaurant_pendingStatus", "rejected")
          localStorage.setItem("restaurant_pendingMessage", msg)
        } else if (status === "pending") {
          setLocalStatus("pending")
          localStorage.setItem("restaurant_pendingStatus", "pending")
        }
      } catch (_) {
        // Keep the pending screen visible if the status check fails.
      } finally {
        if (!cancelled) setCheckingStatus(false)
      }
    }

    checkApprovalStatus()

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkApprovalStatus()
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus)
    document.addEventListener("visibilitychange", handleVisibilityOrFocus)

    return () => {
      cancelled = true
      window.removeEventListener("focus", handleVisibilityOrFocus)
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#f8fafc] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md flex-col justify-center">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="mb-6 flex items-center justify-center">
            {localStatus === "rejected" ? (
              <div className="flex items-center justify-center my-2 select-none">
                {/* Normal parent container to prevent clipping of absolute children */}
                <div className="relative flex items-center" style={{ height: "36px" }}>
                  {/* The red arrow banner */}
                  <div 
                    className="bg-[#E51A21] text-white pl-8 pr-10 py-1.5 rounded-l-md font-black uppercase tracking-widest text-[13px] flex items-center justify-center shadow-[0_4px_10px_rgba(229,26,33,0.3)]"
                    style={{
                      clipPath: "polygon(0% 0%, 82% 0%, 100% 50%, 82% 100%, 0% 100%)",
                      height: "100%",
                      fontFamily: "'Outfit', 'Poppins', sans-serif"
                    }}
                  >
                    <span className="font-extrabold tracking-[0.2em] text-[13px] leading-none">REJECTED</span>
                  </div>

                  {/* Diamond shape on the left - overlaps without clipping! */}
                  <div 
                    className="absolute left-[-16px] top-1/2 -translate-y-1/2 w-8 h-8 bg-[#E51A21] border-[3px] border-white rotate-45 flex items-center justify-center shadow-lg"
                    style={{
                      zIndex: 10
                    }}
                  >
                    {/* White X rotated back */}
                    <X className="w-4 h-4 text-white" style={{ transform: "rotate(-45deg)" }} strokeWidth={4} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Clock3 className="h-8 w-8" />
              </div>
            )}
          </div>

          <div className="mb-6 text-center">
            {localStatus === "rejected" ? (
              <>
                <h1 className="text-xl font-extrabold text-slate-950">
                  Registration Rejected
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {parsedMessage.text}
                </p>
                {parsedMessage.reason && (
                  <div className="mt-4 text-sm font-semibold text-left p-3.5 rounded-2xl border border-red-100 bg-red-50/50">
                    <span className="text-red-600 block text-xs uppercase tracking-widest font-extrabold mb-1">
                      Reason for Rejection:
                    </span>
                    <span className="text-slate-800 font-medium leading-relaxed block">
                      {parsedMessage.reason}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.32em] text-amber-600">
                  Verification Pending
                </p>
                <h1 className="text-xl font-extrabold text-slate-950">
                  Your restaurant is under review
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {companyName} received your onboarding details successfully. Our team will verify your restaurant and activate your dashboard once approval is complete.
                </p>
              </>
            )}
            {checkingStatus ? (
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Checking latest approval status...
              </p>
            ) : null}
          </div>

          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              {localStatus === "rejected" ? (
                <>
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
                  <div className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">What to do next</p>
                    <p className="mt-1">Please review the reason above or reach out to support. You can register a new account if you need to submit new details.</p>
                    {pendingPhone ? (
                      <p className="mt-2 text-slate-500">
                        Registered phone: <span className="font-medium text-slate-700">{pendingPhone}</span>
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">What happens next</p>
                    <p className="mt-1">We will notify you once the verification is approved.</p>
                    {pendingPhone ? (
                      <p className="mt-2 text-slate-500">
                        Registered phone: <span className="font-medium text-slate-700">{pendingPhone}</span>
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Button
              className="h-12 w-full rounded-xl bg-gradient-to-br from-[#B80B3D] to-[#66001D] text-base font-semibold hover:bg-blue-700"
              onClick={async () => {
                if (localStatus === "rejected") {
                  if (!pendingPhone) {
                    toast.error("No phone number found to re-apply")
                    return
                  }
                  setReapplying(true)
                  try {
                    await restaurantAPI.reapply(pendingPhone)
                    toast.success("Re-applied successfully. You can now register a new restaurant.")
                    clearRestaurantPendingPhone()
                    localStorage.removeItem("restaurant_pendingStatus")
                    localStorage.removeItem("restaurant_pendingMessage")
                    navigate("/food/restaurant/login", { replace: true })
                  } catch (err) {
                    const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Failed to re-apply. Please try again."
                    toast.error(msg)
                  } finally {
                    setReapplying(false)
                  }
                } else {
                  clearRestaurantPendingPhone()
                  localStorage.removeItem("restaurant_pendingStatus")
                  localStorage.removeItem("restaurant_pendingMessage")
                  navigate("/food/restaurant/login", { replace: true })
                }
              }}
              disabled={reapplying}
            >
              {reapplying ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                localStatus === "rejected" ? "Re-apply" : "Back to login"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}







