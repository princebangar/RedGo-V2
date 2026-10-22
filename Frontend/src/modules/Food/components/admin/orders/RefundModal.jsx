import { useState, useEffect } from "react"
import { Wallet, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"

export default function RefundModal({ isOpen, onOpenChange, order, onConfirm, isProcessing }) {
  const [refundAmount, setRefundAmount] = useState("")
  const [error, setError] = useState("")
  const [destination, setDestination] = useState("wallet")

  // Bank refund is only possible for orders paid online (not wallet-paid ones)
  const isWalletPaid = order?.paymentType === "Wallet" || order?.payment?.method === "wallet"
  const canRefundToBank = !!order && !isWalletPaid
  // Already credited to the RedGo wallet earlier: only "move to bank" makes sense now
  const alreadyInWallet = !!order && order.paymentStatus === "Refunded" && order.refundDestination === "wallet"

  // Set default refund amount when order changes
  useEffect(() => {
    if (order && isOpen) {
      const defaultAmount = order.totalAmount || 0
      setRefundAmount(defaultAmount.toString())
      setError("")
      setDestination(order.paymentStatus === "Refunded" && order.refundDestination === "wallet" ? "source" : "wallet")
    }
  }, [order, isOpen])

  const handleAmountChange = (e) => {
    const value = e.target.value
    // Allow only numbers and decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setRefundAmount(value)
      setError("")
    }
  }

  const handleConfirm = () => {
    const amount = parseFloat(refundAmount)
    const maxAmount = order?.totalAmount || 0

    if (!refundAmount || refundAmount.trim() === "") {
      setError("Refund राशि डालना अनिवार्य है")
      return
    }

    if (isNaN(amount) || amount <= 0) {
      setError("कृपया सही राशि डालें")
      return
    }

    if (amount > maxAmount) {
      setError(`Refund राशि कुल राशि (₹${maxAmount.toFixed(2)}) से अधिक नहीं हो सकती`)
      return
    }

    onConfirm(amount, destination)
  }

  const handleClose = () => {
    if (!isProcessing) {
      setRefundAmount("")
      setError("")
      onOpenChange(false)
    }
  }

  if (!order) return null

  const maxAmount = order.totalAmount || 0

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md p-6"
        // Don't auto-focus the amount input on open (it selects the prefilled amount)
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Wallet className="w-5 h-5 text-purple-600" />
            Refund
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Order ID: <span className="font-semibold">{order.orderId}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-5 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Refund Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                ₹
              </span>
              <input
                type="text"
                value={refundAmount}
                onChange={handleAmountChange}
                placeholder="0.00"
                disabled={isProcessing || alreadyInWallet}
                className={`w-full pl-8 pr-4 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                  error
                    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-300 focus:border-purple-500 focus:ring-purple-200"
                } ${isProcessing ? "bg-slate-100 cursor-not-allowed" : "bg-white"}`}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 mt-1">{error}</p>
            )}
            <p className="text-xs text-slate-500">
              Maximum refundable amount: ₹{maxAmount.toFixed(2)}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Send refund to</label>
            <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer ${destination === "wallet" ? "border-purple-500 bg-purple-50" : "border-slate-200"}`}>
              <input type="radio" name="refund-destination" className="mt-1" checked={destination === "wallet"} onChange={() => setDestination("wallet")} disabled={isProcessing || alreadyInWallet} />
              <span className="text-sm text-slate-800">
                <span className="font-semibold">RedGo Wallet</span>
                <span className="block text-xs text-slate-600">
                  {alreadyInWallet ? "This refund has already been credited to the customer's wallet." : "Credited to the customer's wallet instantly."}
                </span>
              </span>
            </label>
            <label className={`flex items-start gap-3 p-3 border-2 rounded-lg ${canRefundToBank ? "cursor-pointer" : "opacity-50 cursor-not-allowed"} ${destination === "source" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <input type="radio" name="refund-destination" className="mt-1" checked={destination === "source"} onChange={() => setDestination("source")} disabled={isProcessing || !canRefundToBank} />
              <span className="text-sm text-slate-800">
                <span className="font-semibold">Bank / Original payment method</span>
                <span className="block text-xs text-slate-600">
                  {canRefundToBank ? "Refunded via Razorpay. Takes 5-7 working days to reach the customer's bank." : "Orders paid from the wallet can only be refunded to the wallet."}
                </span>
              </span>
            </label>
            {alreadyInWallet && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                This amount will be deducted from the customer's wallet and refunded to their bank via Razorpay. If the wallet balance is too low, the refund fails and the wallet stays unchanged.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || !refundAmount || parseFloat(refundAmount) <= 0}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isProcessing ? "Processing..." : "Refund"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
