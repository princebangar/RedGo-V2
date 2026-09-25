/**
 * One-off: fix finance-ledger rows of ONLINE (razorpay) delivery orders whose riderShare is 0 while
 * the order itself has the real rider earning (the ledger row was created before the background
 * geocode filled riderEarning).
 *
 *   node scripts/backfill-ledger-rider-share.mjs            # DRY RUN: lists what would change
 *   node scripts/backfill-ledger-rider-share.mjs --execute  # writes the fix
 *
 * Only touches: payment.method = razorpay, not takeaway, NOT cancelled, ledger riderShare != order.riderEarning.
 * Updates: amounts.riderShare and amounts.platformNetProfit (same formula the app uses).
 * Idempotent: re-running does nothing once the rows match.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const execute = process.argv.includes('--execute');
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const orders = await db
  .collection('food_orders')
  .find({
    'payment.method': 'razorpay',
    orderType: { $ne: 'takeaway' },
    orderStatus: { $not: /^cancelled/ },
    riderEarning: { $gt: 0 },
  })
  .project({ orderId: 1, orderStatus: 1, riderEarning: 1, createdAt: 1 })
  .sort({ createdAt: 1 })
  .toArray();

console.log(`${execute ? 'EXECUTE' : 'DRY RUN'}: checking ${orders.length} online delivery order(s)`);
let fixed = 0;
for (const o of orders) {
  const tx = await db.collection('food_transactions').findOne({ orderId: o._id }, { projection: { amounts: 1, pricing: 1 } });
  if (!tx) continue;
  const current = Number(tx.amounts?.riderShare || 0);
  const wanted = Number(o.riderEarning || 0);
  if (current === wanted) continue;

  const p = tx.pricing || {};
  const net = Math.max(
    0,
    Number(p.platformFee || 0) + Number(p.deliveryFee || 0) + Number(p.restaurantCommission || 0) + Number(p.markupTotal || 0) - wanted,
  );
  console.log(
    `- ${o.orderId} (${o.orderStatus}): riderShare ${current} -> ${wanted} | platformNetProfit ${Number(tx.amounts?.platformNetProfit || 0).toFixed(2)} -> ${net.toFixed(2)}`,
  );
  if (execute) {
    await db.collection('food_transactions').updateOne(
      { _id: tx._id },
      { $set: { 'amounts.riderShare': wanted, 'amounts.platformNetProfit': net } },
    );
  }
  fixed += 1;
}
console.log(`${fixed} row(s) ${execute ? 'fixed' : 'would be fixed (re-run with --execute)'}`);
process.exit(0);
