import { useCallback, useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { Loader2, RefreshCw } from "lucide-react"

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "refund_failed", label: "Refund failed" },
  { key: "refunded", label: "Auto-refunded" },
  { key: "recovered", label: "Order recovered" },
  { key: "pending", label: "Pending" },
]

const STATUS_STYLES = {
  refund_failed: "bg-red-100 text-red-700",
  refunded: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-yellow-100 text-yellow-700",
}

const STATUS_LABELS = {
  refund_failed: "Refund failed",
  refunded: "Auto-refunded",
  completed: "Order placed",
  pending: "Pending",
  processing: "Processing",
}

const formatDate = (value) => {
  if (!value) return "-"
  try {
    return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return "-"
  }
}

export default function PaymentRecovery() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const [retryingId, setRetryingId] = useState(null)

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await adminAPI.getPaymentRecovery({ status, limit: 100 })
      setItems(res?.data?.data?.items || [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load payment recovery records")
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const handleRetry = async (row) => {
    const ok = window.confirm(
      `Refund Rs ${row.amount} to ${row.customerName || "the customer"} for payment ${row.rzPaymentId}?\n\nThis moves real money on Razorpay.`,
    )
    if (!ok) return
    try {
      setRetryingId(row.id)
      const res = await adminAPI.retryPaymentRecoveryRefund(row.id)
      const result = res?.data?.data
      if (result?.status === "refunded") {
        toast.success("Refund initiated successfully")
      } else {
        toast.error(result?.lastError || "Refund failed again. Check Razorpay dashboard.")
      }
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Retry failed")
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-col w-full gap-1 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Payment Recovery</h1>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
        <p className="w-full text-sm text-slate-500">
          Online payments where the customer paid but the order was not placed. The system creates the order
          or auto-refunds the customer.
        </p>
        <p className="w-full text-xs text-slate-400">
          Order recovered = the customer's own request failed, so the system created the order from the payment.
          Auto-refunded = the order could not be created, so the money was returned to the customer.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              status === f.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Restaurant</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Razorpay payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 className="inline w-5 h-5 animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No records found
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">
                    {row.orderNumber ? (
                      row.orderNumber
                    ) : row.status === "refunded" ? (
                      <span className="text-slate-400">No order (refunded)</span>
                    ) : (
                      <span className="text-slate-400">Not created</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.customerName || "-"}</div>
                    <div className="text-slate-500">{row.customerPhone}</div>
                  </td>
                  <td className="px-4 py-3">{row.restaurantName || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">Rs {row.amount}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>{row.rzPaymentId || "-"}</div>
                    <div className="text-slate-400">{row.rzOrderId}</div>
                    {row.refundId ? <div className="text-blue-600">Refund: {row.refundId}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${STATUS_STYLES[row.status] || "bg-slate-100 text-slate-700"}`}
                    >
                      {STATUS_LABELS[row.status] || row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[260px] text-xs text-slate-600 break-words">{row.lastError || "-"}</td>
                  <td className="px-4 py-3">
                    {row.status === "refund_failed" ? (
                      <button
                        onClick={() => handleRetry(row)}
                        disabled={retryingId === row.id}
                        className="px-3 py-1.5 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
                      >
                        {retryingId === row.id ? "Refunding..." : "Retry refund"}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
