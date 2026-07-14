import { useState, useMemo, useEffect, useRef } from "react"
import { BarChart3, ChevronDown, Info, FileText, FileSpreadsheet, Code, Loader2, X } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { exportTransactionReportToCSV, exportTransactionReportToExcel, exportTransactionReportToPDF, exportTransactionReportToJSON } from "@food/components/admin/reports/reportsExportUtils"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { Skeleton } from "@food/components/ui/skeleton"

// Import icons from Transaction-report-icons
import completedIcon from "@food/assets/Transaction-report-icons/trx1.svg"
import refundedIcon from "@food/assets/Transaction-report-icons/trx3.svg"
import adminEarningIcon from "@food/assets/Transaction-report-icons/admin-earning.svg"
import restaurantEarningIcon from "@food/assets/Transaction-report-icons/store-earning.svg"
import deliverymanEarningIcon from "@food/assets/Transaction-report-icons/deliveryman-earning.svg"

// Import search and export icons from Dashboard-icons
import searchIcon from "@food/assets/Dashboard-icons/image8.png"
import exportIcon from "@food/assets/Dashboard-icons/image9.png"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

function AmountSkeleton({ className = "h-6 w-24 mx-auto" }) {
  return <Skeleton className={className} />
}

const METRIC_INFO = {
  completed:
    "Total GMV from delivered orders — sum of each delivered order’s pricing.total. Pulled live from FoodOrder data.",
  refunded:
    "Total amount actually refunded to customers (online/wallet payments where payment status is refunded). COD cancels are excluded — no money was collected, so nothing is refunded.",
  admin:
    "Platform earnings = restaurant commission + platform fee + delivery net (delivery fee − rider earning) + GST, for delivered orders only.",
  restaurant:
    "Restaurant share = (item subtotal + packaging) − restaurant commission, for delivered orders only.",
  deliveryman:
    "Total delivery partner earnings — sum of riderEarning on delivered orders.",
}

function InfoTip({ tipKey, colorClass = "bg-green-500", align = "right" }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  return (
    <div className="relative inline-flex" ref={wrapRef}>
      <button
        type="button"
        aria-label="What does this mean?"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full ${colorClass} flex items-center justify-center text-white shadow-sm hover:brightness-110 active:scale-95 transition-all cursor-pointer`}
      >
        <Info className="w-3 h-3" />
      </button>
      {open && (
        <div
          role="dialog"
          className={`absolute z-50 mt-2 w-64 sm:w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-left ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">How this is calculated</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">{METRIC_INFO[tipKey]}</p>
        </div>
      )}
    </div>
  )
}


export default function TransactionReport() {
  const [searchQuery, setSearchQuery] = useState("")
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [summary, setSummary] = useState({
    completedTransaction: 0,
    refundedTransaction: 0,
    adminEarning: 0,
    restaurantEarning: 0,
    deliverymanEarning: 0
  })
  const [filters, setFilters] = useState({
    zone: "All Zones",
    restaurant: "All restaurants",
    time: "All Time",
  })
  const [zones, setZones] = useState([])
  const [restaurants, setRestaurants] = useState([])

  // Fetch zones and restaurants for filters
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        // Fetch zones
        const zonesResponse = await adminAPI.getZones({ limit: 1000 })
        if (zonesResponse?.data?.success && zonesResponse.data.data?.zones) {
          setZones(zonesResponse.data.data.zones)
        }

        // Fetch restaurants
        const restaurantsResponse = await adminAPI.getRestaurants({ limit: 1000 })
        if (restaurantsResponse?.data?.success && restaurantsResponse.data.data?.restaurants) {
          setRestaurants(restaurantsResponse.data.data.restaurants)
        }
      } catch (error) {
        debugError("Error fetching filter data:", error)
      }
    }
    fetchFilterData()
  }, [])

  // Fetch transaction report data
  useEffect(() => {
    const fetchTransactionReport = async () => {
      try {
        setIsRefreshing(true)
        
        // Build date range based on time filter
        let fromDate = null
        let toDate = null
        const now = new Date()
        
        if (filters.time === "Today") {
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        } else if (filters.time === "This Week") {
          const dayOfWeek = now.getDay()
          const diff = now.getDate() - dayOfWeek
          fromDate = new Date(now.getFullYear(), now.getMonth(), diff)
          toDate = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59)
        } else if (filters.time === "This Month") {
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
          toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        }

        const params = {
          search: searchQuery || undefined,
          zone: filters.zone !== "All Zones" ? filters.zone : undefined,
          restaurant: filters.restaurant !== "All restaurants" ? filters.restaurant : undefined,
          time: filters.time || "All Time",
          fromDate: fromDate ? fromDate.toISOString() : undefined,
          toDate: toDate ? toDate.toISOString() : undefined,
          limit: 1000
        }

        const response = await adminAPI.getTransactionReport(params)

        if (response?.data?.success && response.data.data) {
          setTransactions(response.data.data.transactions || [])
          setSummary(response.data.data.summary || {
            completedTransaction: 0,
            refundedTransaction: 0,
            adminEarning: 0,
            restaurantEarning: 0,
            deliverymanEarning: 0
          })
        } else {
          setTransactions([])
          if (response?.data?.message) {
            toast.error(response.data.message)
          }
        }
      } catch (error) {
        debugError("Error fetching transaction report:", error)
        toast.error("Failed to fetch transaction report")
        setTransactions([])
      } finally {
        setIsRefreshing(false)
        setLoading(false)
      }
    }

    fetchTransactionReport()
  }, [searchQuery, filters])

  const filteredTransactions = useMemo(() => {
    return transactions
  }, [transactions])

  const handleExport = (format) => {
    if (filteredTransactions.length === 0) {
      alert("No data to export")
      return
    }
    switch (format) {
      case "csv": exportTransactionReportToCSV(filteredTransactions); break
      case "excel": exportTransactionReportToExcel(filteredTransactions); break
      case "pdf": exportTransactionReportToPDF(filteredTransactions); break
      case "json": exportTransactionReportToJSON(filteredTransactions); break
    }
  }

  const handleFilterApply = () => {
    // Filters already live-bound via selects; force a light re-fetch by cloning state
    setFilters((prev) => ({ ...prev }))
  }

  const handleResetFilters = () => {
    setFilters({
      zone: "All Zones",
      restaurant: "All restaurants",
      time: "All Time",
    })
    setSearchQuery("")
  }

  const activeFiltersCount =
    (filters.zone !== "All Zones" ? 1 : 0) +
    (filters.restaurant !== "All restaurants" ? 1 : 0) +
    (filters.time !== "All Time" ? 1 : 0)

  const formatCurrency = (amount) => {
    if (amount >= 1000) {
      return `\u20B9 ${(amount / 1000).toFixed(2)}K`
    }
    return `\u20B9 ${amount.toFixed(2)}`
  }

  const formatFullCurrency = (amount) => {
    const num = Number(amount)
    if (!num || isNaN(num)) return '₹ 0.00'
    return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getStatusBadgeClasses = (status) => {
    const normalized = String(status || '').toLowerCase()

    if (['captured', 'settled', 'completed', 'paid', 'delivered', 'confirmed'].includes(normalized)) {
      return 'bg-green-100 text-green-700'
    }
    if (['pending', 'created', 'authorized', 'cod_pending', 'processing'].includes(normalized)) {
      return 'bg-yellow-100 text-yellow-700'
    }
    if (['failed', 'refunded', 'cancelled', 'cancelled_by_admin', 'cancelled_by_user', 'cancelled_by_restaurant'].includes(normalized)) {
      return 'bg-red-100 text-red-700'
    }

    return 'bg-slate-100 text-slate-700'
  }

  const formatStatusLabel = (status) => {
    const raw = String(status || 'N/A').trim()
    if (!raw) return 'N/A'
    const lower = raw.toLowerCase()
    // Legacy ledger values → user-facing labels
    if (lower === 'captured' || lower === 'settled') return 'Delivered'
    if (lower === 'completed') return 'Delivered'
    return raw
      .split(/[_\s]+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ')
  }

  const amountsLoading = loading || isRefreshing

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Transaction Report</h1>
          </div>
        </div>

        {/* Search Data Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <select
                value={filters.zone}
                onChange={(e) => setFilters(prev => ({ ...prev, zone: e.target.value }))}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All Zones">All Zones</option>
                {zones.map(zone => (
                  <option key={zone._id} value={zone.zoneName || zone.name}>{zone.zoneName || zone.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={filters.restaurant}
                onChange={(e) => setFilters(prev => ({ ...prev, restaurant: e.target.value }))}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All restaurants">All restaurants</option>
                {restaurants.map(restaurant => (
                  <option key={restaurant._id} value={restaurant.restaurantName || restaurant.name}>{restaurant.restaurantName || restaurant.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={filters.time}
                onChange={(e) => setFilters(prev => ({ ...prev, time: e.target.value }))}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All Time">All Time</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <button 
              onClick={handleFilterApply}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all whitespace-nowrap relative ${
                activeFiltersCount > 0 ? "ring-2 ring-blue-300" : ""
              }`}
            >
              Filter
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>
            <button 
              onClick={handleResetFilters}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="space-y-3">
            <div className="rounded-lg shadow-sm border border-slate-200 p-4" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="relative mb-3 flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <img src={completedIcon} alt="Completed" className="w-12 h-12" />
                </div>
                <div className="absolute top-0 right-0">
                  <InfoTip tipKey="completed" colorClass="bg-green-500" align="right" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-600 mb-1 min-h-[1.75rem] flex items-center justify-center">
                  {amountsLoading ? <AmountSkeleton className="h-7 w-28" /> : formatCurrency(summary.completedTransaction)}
                </div>
                <p className="text-sm text-slate-600 leading-tight">Completed Transaction</p>
              </div>
            </div>

            <div className="rounded-lg shadow-sm border border-slate-200 p-4" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="relative mb-3 flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <img src={refundedIcon} alt="Refunded" className="w-12 h-12" />
                </div>
                <div className="absolute top-0 right-0">
                  <InfoTip tipKey="refunded" colorClass="bg-red-500" align="right" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-600 mb-1 min-h-[1.75rem] flex items-center justify-center">
                  {amountsLoading ? <AmountSkeleton className="h-7 w-28" /> : formatFullCurrency(summary.refundedTransaction)}
                </div>
                <p className="text-sm text-slate-600 leading-tight">Refunded Transaction</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg shadow-sm border border-slate-200 p-3" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <img src={adminEarningIcon} alt="Admin Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Admin Earning</p>
                    <InfoTip tipKey="admin" colorClass="bg-green-500" align="left" />
                  </div>
                </div>
                <div className="text-base font-bold text-slate-900 min-w-[4.5rem] flex justify-end">
                  {amountsLoading ? <AmountSkeleton className="h-5 w-16" /> : formatCurrency(summary.adminEarning)}
                </div>
              </div>
            </div>

            <div className="rounded-lg shadow-sm border border-slate-200 p-3" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <img src={restaurantEarningIcon} alt="Restaurant Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Restaurant Earning</p>
                    <InfoTip tipKey="restaurant" colorClass="bg-blue-500" align="left" />
                  </div>
                </div>
                <div className="text-base font-bold text-green-600 min-w-[4.5rem] flex justify-end">
                  {amountsLoading ? <AmountSkeleton className="h-5 w-16" /> : formatCurrency(summary.restaurantEarning)}
                </div>
              </div>
            </div>

            <div className="rounded-lg shadow-sm border border-slate-200 p-3" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <img src={deliverymanEarningIcon} alt="Deliveryman Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Deliveryman Earning</p>
                    <InfoTip tipKey="deliveryman" colorClass="bg-red-500" align="left" />
                  </div>
                </div>
                <div className="text-base font-bold text-orange-600 min-w-[4.5rem] flex justify-end">
                  {amountsLoading ? <AmountSkeleton className="h-5 w-16" /> : formatCurrency(summary.deliverymanEarning)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Order Transactions Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">
              Order Transactions{" "}
              {amountsLoading ? (
                <AmountSkeleton className="inline-block h-4 w-8 align-middle" />
              ) : (
                filteredTransactions.length
              )}
              <span className="ml-2 text-xs font-medium text-slate-500">({filters.time})</span>
            </h2>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial min-w-[180px]">
                <input
                  type="text"
                  placeholder="Search by Order ID"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 pr-2 py-1.5 w-full text-[11px] rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <img src={searchIcon} alt="Search" className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" />
                {isRefreshing && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 animate-spin" />
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 transition-all">
                    <img src={exportIcon} alt="Export" className="w-3 h-3" />
                    <span>Export</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer">
                    <Code className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '3%' }}>SI</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '7%' }}>Order Id</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '10%' }}>Restaurant</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '10%' }}>Customer Name</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '11%' }}>Total Item Amount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '9%' }}>Coupon Discount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '9%' }}>Vat/Tax</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '10%' }}>Delivery Charge</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '9%' }}>Platform Fee</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '9%' }}>Order Amount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {amountsLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`sk-${index}`}>
                      {Array.from({ length: 11 }).map((__, col) => (
                        <td key={col} className="px-1.5 py-2">
                          <AmountSkeleton className="h-3 w-full max-w-[4.5rem]" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No transactions match your search</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction, index) => (
                    <tr
                      key={transaction.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-700">{index + 1}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{transaction.orderId}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700 truncate block">{transaction.restaurant}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className={`text-[10px] truncate block ${
                          transaction.customerName === "Invalid Customer Data" 
                            ? "text-red-600 font-semibold" 
                            : "text-slate-700"
                        }`}>
                          {transaction.customerName}
                        </span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.totalItemAmount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        {transaction.couponDiscount > 0 ? (
                          <div className="flex flex-col">
                            <span className="text-[10px] font-semibold text-emerald-600">-{formatFullCurrency(transaction.couponDiscount)}</span>
                            {transaction.couponCode && (
                              <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">{transaction.couponCode}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.vatTax)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.deliveryCharge)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.platformFee || 0)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-900">{formatFullCurrency(transaction.orderAmount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${getStatusBadgeClasses(transaction.status || transaction.orderStatus)}`}>
                          {formatStatusLabel(transaction.status || transaction.orderStatus)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}

