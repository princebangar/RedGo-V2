import mongoose from 'mongoose';

/**
 * Persistent record of an online (Razorpay) payment that has been initiated but whose
 * FoodOrder may not exist yet. Survives server restarts so the webhook / reconcile job
 * can create the order or refund the customer if the client never completed the flow.
 */
const pendingOnlinePaymentSchema = new mongoose.Schema(
  {
    rzOrderId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    dto: { type: mongoose.Schema.Types.Mixed, required: true },
    amountPaise: { type: Number, default: 0 },
    // pending -> processing -> completed | refunded | abandoned | refund_failed
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'refunded', 'abandoned', 'refund_failed'],
      default: 'pending',
      index: true,
    },
    lockedAt: { type: Date, default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    rzPaymentId: { type: String, default: '' },
    refundId: { type: String, default: '' },
    lastError: { type: String, default: '' },
    // Keep records for audit, then let Mongo clean them up.
    expireAt: { type: Date, default: () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), index: { expires: 0 } },
  },
  { timestamps: true, collection: 'food_pending_online_payments' },
);

export const PendingOnlinePayment =
  mongoose.models.PendingOnlinePayment ||
  mongoose.model('PendingOnlinePayment', pendingOnlinePaymentSchema);
