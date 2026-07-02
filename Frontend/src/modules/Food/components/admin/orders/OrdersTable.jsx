import { useState, useEffect, useMemo } from "react"
import { Eye, Printer, ArrowUpDown, Loader2, Check, X, Trash2, ChevronDown, ChevronUp } from "lucide-react"

const getStatusColor = (orderStatus) => {
  const colors = {
    "Delivered": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-blue-100 text-blue-700",
    "Scheduled": "bg-blue-100 text-blue-700",
    "Accepted": "bg-green-100 text-green-700",
    "Processing": "bg-orange-100 text-orange-700",
    "Food On The Way": "bg-yellow-100 text-yellow-700",
    "Canceled": "bg-rose-100 text-rose-700",
    "Cancelled by Restaurant": "bg-red-100 text-red-700",
    "Cancelled by User": "bg-orange-100 text-orange-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid") return "text-emerald-600"
  if (paymentStatus === "Refunded") return "text-sky-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

export default function OrdersTable({
  orders,
  visibleColumns,
  onViewOrder,
  onPrintOrder,
  onRefund,
  onDeleteOrder,
  onAcceptOrder,
  onRejectOrder,
  actionLoadingOrderId,
  actionLoadingType,
  deletingOrderId,
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedOrders, setExpandedOrders] = useState({})
  const [openReasonId, setOpenReasonId] = useState(null)
  const itemsPerPage = 10
  const totalPages = Math.ceil(orders.length / itemsPerPage)

  const toggleOrderExpand = (orderId) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }))
  }
  
  // Reset to page 1 when orders change
  useEffect(() => {
    setCurrentPage(1)
  }, [orders.length])
  
  const [sortConfig, setSortConfig] = useState({ key: "orderDate", direction: "desc" })

  const requestSort = (key) => {
    let direction = "asc"
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc"
    }
    setSortConfig({ key, direction })
  }

  const sortedOrders = useMemo(() => {
    const sortableOrders = [...orders]
    if (sortConfig.key) {
      sortableOrders.sort((a, b) => {
        let aVal = ""
        let bVal = ""

        switch (sortConfig.key) {
          case "si":
            return 0
          case "orderId":
            aVal = String(a.orderId || "")
            bVal = String(b.orderId || "")
            break
          case "orderDate":
            aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0
            bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0
            break
          case "orderOtp":
            aVal = String(a.orderOtp || "")
            bVal = String(b.orderOtp || "")
            break
          case "customer":
            aVal = String(a.customerName || "").toLowerCase()
            bVal = String(b.customerName || "").toLowerCase()
            break
          case "restaurant":
            aVal = String(a.restaurant || "").toLowerCase()
            bVal = String(b.restaurant || "").toLowerCase()
            break
          case "foodItems":
            aVal = a.items && a.items[0] ? String(a.items[0].name || a.items[0].foodName || "").toLowerCase() : ""
            bVal = b.items && b.items[0] ? String(b.items[0].name || b.items[0].foodName || "").toLowerCase() : ""
            break
          case "itemPrice":
            aVal = a.items && a.items[0] ? Number(a.items[0].price || 0) : 0
            bVal = b.items && b.items[0] ? Number(b.items[0].price || 0) : 0
            break
          case "deliveryCharge":
            aVal = Number(a.deliveryCharge || 0)
            bVal = Number(b.deliveryCharge || 0)
            break
          case "totalAmount":
            const rawAmountA = a.totalAmount ?? a.total ?? a.pricing?.total ?? 0
            const rawAmountB = b.totalAmount ?? b.total ?? b.pricing?.total ?? 0
            aVal = Number(rawAmountA)
            bVal = Number(rawAmountB)
            break
          case "paymentType":
            aVal = String(a.paymentType || "").toLowerCase()
            bVal = String(b.paymentType || "").toLowerCase()
            break
          case "paymentCollectionStatus":
            aVal = String(a.paymentStatus || "").toLowerCase()
            bVal = String(b.paymentStatus || "").toLowerCase()
            break
          case "orderStatus":
            aVal = String(a.orderStatus || "").toLowerCase()
            bVal = String(b.orderStatus || "").toLowerCase()
            break
          default:
            break
        }

        if (aVal < bVal) {
          return sortConfig.direction === "asc" ? -1 : 1
        }
        if (aVal > bVal) {
          return sortConfig.direction === "asc" ? 1 : -1
        }
        return 0
      })
    }
    return sortableOrders
  }, [orders, sortConfig])

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return sortedOrders.slice(start, end)
  }, [sortedOrders, currentPage])

  const formatRestaurantName = (name) => {
    if (name === "Cafe Monarch") return "Café Monarch"
    return name
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-32 h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center shadow-md">
              <span className="text-5xl text-orange-500 font-bold">!</span>
            </div>
          </div>
          <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
          <p className="text-sm text-slate-500">There are no orders matching your criteria</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full max-w-full">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1800px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {visibleColumns.si && (
                <th className="w-[50px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("si")}>
                    <span>SI</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "si" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.orderId && (
                <th className="w-[110px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("orderId")}>
                    <span>Order ID</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "orderId" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.orderDate && (
                <th className="w-[160px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("orderDate")}>
                    <span>Order Date</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "orderDate" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.orderOtp && (
                <th className="w-[90px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("orderOtp")}>
                    <span>Order OTP</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "orderOtp" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.customer && (
                <th className="w-[200px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("customer")}>
                    <span>Customer Information</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "customer" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.restaurant && (
                <th className="w-[200px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("restaurant")}>
                    <span>Restaurant</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "restaurant" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.foodItems && (
                <th className="w-[240px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("foodItems")}>
                    <span>Food Items</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "foodItems" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.itemPrice && (
                <th className="w-[100px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("itemPrice")}>
                    <span>Price</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "itemPrice" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.deliveryCharge && (
                <th className="w-[110px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("deliveryCharge")}>
                    <span>Delivery Charge</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "deliveryCharge" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.totalAmount && (
                <th className="w-[120px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("totalAmount")}>
                    <span>Total Amount</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "totalAmount" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {(visibleColumns.paymentType !== false) && (
                <th className="w-[120px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("paymentType")}>
                    <span>Payment Type</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "paymentType" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {(visibleColumns.paymentCollectionStatus !== false) && (
                <th className="w-[120px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("paymentCollectionStatus")}>
                    <span>Payment Status</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "paymentCollectionStatus" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}

              {visibleColumns.orderStatus && (
                <th className="w-[150px] px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => requestSort("orderStatus")}>
                    <span>Order Status</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortConfig.key === "orderStatus" ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                </th>
              )}
              {visibleColumns.actions && (
                <th className="w-[220px] px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {paginatedOrders.map((order, index) => (
              <tr 
                key={order.orderId} 
                className="hover:bg-slate-50 transition-colors"
              >
                {visibleColumns.si && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + index + 1}</span>
                  </td>
                )}
                {visibleColumns.orderId && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-900">{order.orderId}</span>
                  </td>
                )}
                {visibleColumns.orderDate && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{order.date}, {order.time}</span>
                  </td>
                )}
                {visibleColumns.orderOtp && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(order.orderStatus === "Cancelled" || 
                      order.orderStatus === "Cancelled by Restaurant" || 
                      order.orderStatus === "Cancelled by User" || 
                      order.orderStatus === "Canceled") ? (
                        <span className="text-sm font-medium text-slate-900">N/A</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-900">
                          {order.orderOtp || "--"}
                        </span>
                      )}
                  </td>
                )}
                {visibleColumns.customer && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">{order.customerName}</span>
                      <span className="text-xs text-slate-500 mt-0.5">{order.customerPhone}</span>
                    </div>
                  </td>
                )}
                {visibleColumns.restaurant && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{formatRestaurantName(order.restaurant)}</span>
                  </td>
                )}
                {visibleColumns.foodItems && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2 min-w-[200px] max-w-md">
                      {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                        (() => {
                          const isExpanded = expandedOrders[order.orderId] || false;
                          const hasMore = order.items.length > 1;
                          const itemsToShow = isExpanded ? order.items : order.items.slice(0, 1);
                          const remainingCount = order.items.length - 1;

                          return (
                            <>
                              {itemsToShow.map((item, idx) => (
                                <div key={idx || item.itemId || idx} className="flex items-center gap-2 text-sm animate-fadeIn">
                                  <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded min-w-[2.5rem] text-center self-start mt-0.5">
                                    {item.quantity || 1}x
                                  </span>
                                  <div className="flex-1">
                                    <span className="text-slate-800 font-medium">
                                      {item.name || item.itemName || item.title || 'Unknown Item'}
                                    </span>
                                    {item.variantName && (
                                      <p className="text-xs text-slate-500 font-medium">{item.variantName}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {hasMore && (
                                <button
                                  onClick={() => toggleOrderExpand(order.orderId)}
                                  className="px-2 py-0.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm w-fit mt-1.5 active:scale-95"
                                  title={isExpanded ? "Show less items" : "View all items"}
                                >
                                  <span>{isExpanded ? "View Less" : `+${remainingCount} More Items`}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-white" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-white" />
                                  )}
                                </button>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <span className="text-sm text-slate-400 italic">No items found</span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.itemPrice && (
                  <td className="px-6 py-4 text-left">
                    <div className="flex flex-col gap-2">
                      {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                        (() => {
                          const isExpanded = expandedOrders[order.orderId] || false;
                          const itemsToShow = isExpanded ? order.items : order.items.slice(0, 1);

                          return (
                            <>
                              {itemsToShow.map((item, idx) => {
                                const itemPrice = Number(item.price ?? 0)
                                return (
                                  <div key={idx || item.itemId || `item-price-${idx}`} className="text-sm text-slate-500 text-left h-[20px] flex items-center">
                                    {`₹${itemPrice.toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2
                                    })}`}
                                  </div>
                                )
                              })}
                              {order.items.length > 1 && (
                                <div className="h-[20px]" /> // Spacer to balance the View More button height in foodItems column!
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <span className="text-sm text-slate-400 italic">-</span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.deliveryCharge && (
                  <td className="px-6 py-4 whitespace-nowrap text-left">
                    <span className="text-sm font-medium text-slate-700">
                      {(() => {
                        const deliveryCharge = Number(order.deliveryCharge ?? 0)
                        return `₹${deliveryCharge.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}`
                      })()}
                    </span>
                  </td>
                )}
                {visibleColumns.totalAmount && (
                  <td className="px-6 py-4 whitespace-nowrap text-left">
                    <div className="text-sm font-medium text-slate-900">
                      {(() => {
                        const rawAmount =
                          order.totalAmount ??
                          order.total ??
                          order.pricing?.total ??
                          0;
                        const amount = Number.isFinite(Number(rawAmount))
                          ? Number(rawAmount)
                          : 0;
                        return `₹${amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}`;
                      })()}
                    </div>
                    <div className={`text-xs mt-0.5 text-left ${getPaymentStatusColor(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </div>
                  </td>
                )}
                {(visibleColumns.paymentType !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      // Determine payment type display
                      let paymentTypeDisplay = order.paymentType;
                      const paymentMethod = order.payment?.method || order.paymentMethod || order.payment?.paymentMethod;
                      
                      if (paymentMethod === 'razorpay_qr') {
                        paymentTypeDisplay = 'COD (QR)';
                      } else if (!paymentTypeDisplay) {
                        if (paymentMethod === 'cash' || paymentMethod === 'cod') {
                          paymentTypeDisplay = 'Cash on Delivery';
                        } else if (paymentMethod === 'wallet') {
                          paymentTypeDisplay = 'Wallet';
                        } else {
                          paymentTypeDisplay = 'Online';
                        }
                      }
                      
                      // Override if payment method is wallet but paymentType is not set correctly
                      if (paymentMethod === 'wallet' && paymentTypeDisplay !== 'Wallet') {
                        paymentTypeDisplay = 'Wallet';
                      }
                      
                      const isCod = paymentTypeDisplay === 'Cash on Delivery' || paymentTypeDisplay === 'COD (QR)';
                      const isWallet = paymentTypeDisplay === 'Wallet';
                      
                      return (
                        <span className={`text-sm font-medium ${
                          isCod ? 'text-amber-600' : 
                          isWallet ? 'text-purple-600' : 
                          'text-emerald-600'
                        }`}>
                          {paymentTypeDisplay}
                        </span>
                      );
                    })()}
                  </td>
                )}
                {(visibleColumns.paymentCollectionStatus !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                        {order.paymentStatus || "Pending"}
                      </span>
                      {order.paymentCollectionStatus && (
                        <span className="text-xs text-slate-500 mt-0.5">
                          {order.paymentCollectionStatus}
                        </span>
                      )}
                    </div>
                  </td>
                )}

                {visibleColumns.orderStatus && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                          {order.orderStatus}
                        </span>
                        <span className="text-xs text-slate-500">{order.deliveryType}</span>
                      </div>
                      {order.cancellationReason && (() => {
                        const rowKey = order.id || order.orderId
                        const isOpen = openReasonId === rowKey
                        return (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => setOpenReasonId(isOpen ? null : rowKey)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Reason
                              {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {isOpen && (
                              <div className="mt-1 max-w-[240px] rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600 whitespace-normal break-words">
                                <span className="font-medium">
                                  {order.cancelledBy === 'user' ? 'Cancelled by User: ' :
                                   order.cancelledBy === 'restaurant' ? 'Cancelled by Restaurant: ' :
                                   'Reason: '}
                                </span>
                                {order.cancellationReason}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </td>
                )}
                {visibleColumns.actions && (
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-3">
                      {/* Secondary Actions (Icon-only buttons) - Always aligned together */}
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => onViewOrder(order)}
                          className="p-1.5 rounded text-orange-600 hover:bg-orange-50 transition-colors flex items-center justify-center"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => onPrintOrder(order)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center"
                          title="Print Order"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {onDeleteOrder && (
                          <button
                            onClick={() => onDeleteOrder(order)}
                            disabled={deletingOrderId === (order.id || order.orderId)}
                            className="p-1.5 rounded text-rose-600 hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                            title="Delete Order"
                          >
                            {deletingOrderId === (order.id || order.orderId) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Divider if we have primary actions */}
                      {( (order.orderStatus === "Pending" && (onAcceptOrder || onRejectOrder)) || 
                         ( (() => {
                           const isCancelled = order.orderStatus === "Cancelled by Restaurant" || 
                                             order.orderStatus === "Cancelled" || 
                                             order.orderStatus === "Cancelled by User" ||
                                             (order.status === "cancelled" && (order.cancelledBy === "user" || order.cancelledBy === "restaurant"));
                           const paymentMethod = order.payment?.method || order.paymentMethod;
                           const isOnlinePayment = order.paymentType === "Online" ||
                                                 (order.paymentType !== "Cash on Delivery" && 
                                                  order.payment?.method !== "cash" && 
                                                  order.payment?.method !== "cod" &&
                                                  (order.paymentMethod === "razorpay" || 
                                                   order.paymentMethod === "online" || 
                                                   order.payment?.paymentMethod === "razorpay" || 
                                                   order.payment?.method === "razorpay" ||
                                                   order.payment?.method === "online"));
                           const isWalletPayment = order.paymentType === "Wallet" || paymentMethod === "wallet";
                           return isCancelled && (isOnlinePayment || isWalletPayment) && order.paymentStatus === "Paid";
                         })() )
                      ) && (
                        <div className="h-4 w-[1px] bg-slate-200" />
                      )}

                      {/* Primary Actions (Text/Status buttons) */}
                      <div className="flex items-center gap-2">
                        {order.orderStatus === "Pending" && onAcceptOrder && (() => {
                          const isRowLoading = actionLoadingOrderId === (order.id || order.orderId)
                          const isAccepting = isRowLoading && actionLoadingType === 'accept'
                          return (
                          <button
                            onClick={() => onAcceptOrder(order)}
                            disabled={isRowLoading}
                            className="px-2.5 py-1.5 rounded text-xs font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95 flex items-center gap-1"
                            title="Accept Order"
                          >
                            {isAccepting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>{isAccepting ? 'Accepting...' : 'Accept'}</span>
                          </button>
                          )
                        })()}
                        {order.orderStatus === "Pending" && onRejectOrder && (() => {
                          const isRowLoading = actionLoadingOrderId === (order.id || order.orderId)
                          const isRejecting = isRowLoading && actionLoadingType === 'reject'
                          return (
                          <button
                            onClick={() => onRejectOrder(order)}
                            disabled={isRowLoading}
                            className="px-2.5 py-1.5 rounded text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            title="Reject Order"
                          >
                            {isRejecting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            <span>{isRejecting ? 'Rejecting...' : 'Reject'}</span>
                          </button>
                          )
                        })()}

                        {/* Refund Block */}
                        {(() => {
                          const isCancelled = order.orderStatus === "Cancelled by Restaurant" || 
                                            order.orderStatus === "Cancelled" || 
                                            order.orderStatus === "Cancelled by User" ||
                                            (order.status === "cancelled" && (order.cancelledBy === "user" || order.cancelledBy === "restaurant"));
                          const paymentMethod = order.payment?.method || order.paymentMethod;
                          const isOnlinePayment = order.paymentType === "Online" ||
                                                (order.paymentType !== "Cash on Delivery" && 
                                                 order.payment?.method !== "cash" && 
                                                 order.payment?.method !== "cod" &&
                                                 (order.paymentMethod === "razorpay" || 
                                                  order.paymentMethod === "online" || 
                                                  order.payment?.paymentMethod === "razorpay" || 
                                                  order.payment?.method === "razorpay" ||
                                                  order.payment?.method === "online"));
                          const isWalletPayment = order.paymentType === "Wallet" || paymentMethod === "wallet";
                          return isCancelled && (isOnlinePayment || isWalletPayment) && order.paymentStatus === "Paid";
                        })() && (
                          <>
                            {order.refundStatus === 'processed' || order.refundStatus === 'initiated' ? (
                              <span className={`px-2.5 py-1.5 rounded-md text-xs font-semibold ${
                                order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {order.paymentType === "Wallet" || order.payment?.method === "wallet" 
                                  ? "Wallet Refunded" 
                                  : "Refunded"}
                              </span>
                            ) : onRefund ? (
                              <button 
                                onClick={() => onRefund(order)}
                                className={`px-3 py-1.5 rounded-md text-white text-xs font-semibold hover:opacity-90 transition-colors shadow-sm flex items-center gap-1 ${
                                  order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                    ? "bg-purple-600 hover:bg-purple-700"
                                    : "bg-blue-600 hover:bg-blue-700"
                                }`}
                                title={order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "Process Wallet Refund (Add to user wallet)"
                                  : "Process Refund via Razorpay"}
                              >
                                <span className="text-sm font-bold">₹</span>
                                <span>Refund</span>
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
            <span className="font-semibold">{Math.min(currentPage * itemsPerPage, orders.length)}</span> of{" "}
            <span className="font-semibold">{orders.length}</span> orders
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      currentPage === pageNum
                        ? "bg-emerald-500 text-white shadow-md"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

