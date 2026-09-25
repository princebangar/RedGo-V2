/**
 * One-off: refund online-paid orders that were cancelled but never refunded.
 *
 *   node scripts/refund-cancelled-online-orders.mjs            # DRY RUN: only lists what would be refunded
 *   node scripts/refund-cancelled-online-orders.mjs --execute  # really refunds (moves REAL money on Razorpay)
 *
 * Optional: --since=2026-08-01   (default 2026-08-01)
 *           --order=FOD-1234567  (only that order)
 *
 * Uses the same helper as the live server (settleRefundOnCancel), so it is idempotent:
 * orders that are already refunded / being refunded are skipped.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const since = new Date((args.find((a) => a.startsWith('--since=')) || '--since=2026-08-01').split('=')[1]);
const onlyOrder = (args.find((a) => a.startsWith('--order=')) || '').split('=')[1] || '';

await mongoose.connect(process.env.MONGODB_URI);
const { FoodOrder } = await import('../src/modules/food/orders/models/order.model.js');
const { settleRefundOnCancel } = await import('../src/modules/food/orders/services/order.service.js');

const filter = {
  'payment.method': { $in: ['razorpay', 'wallet'] },
  'payment.status': 'paid',
  'payment.refund.status': { $nin: ['processed', 'pending'] },
  orderStatus: { $regex: /^cancelled/ },
  createdAt: { $gte: since },
};
if (onlyOrder) filter.orderId = onlyOrder;

const orders = await FoodOrder.find(filter).sort({ createdAt: 1 });
console.log(`${execute ? 'EXECUTE' : 'DRY RUN'}: ${orders.length} cancelled order(s) paid online and not refunded (since ${since.toISOString().slice(0, 10)})`);

let total = 0;
for (const o of orders) {
  const amount = Number(o.pricing?.total || 0);
  total += amount;
  console.log(`- ${o.orderId}  ${o.orderStatus}  Rs ${amount}  ${o.payment.method}  ${o.payment.razorpay?.paymentId || ''}`);
  if (execute) {
    const res = await settleRefundOnCancel(o, { reason: 'Refund for cancelled order (manual settlement)' });
    console.log(`    -> ${res.status}${res.error ? ` (${res.error})` : ''}${res.refundId ? ` ${res.refundId}` : ''}`);
  }
}
console.log(`Total: Rs ${total.toFixed(2)}${execute ? '' : '  (nothing was refunded; re-run with --execute)'}`);
process.exit(0);
