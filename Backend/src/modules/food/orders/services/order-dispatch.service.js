import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodDeliveryCashDeposit } from '../../delivery/models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryCashLimit } from '../../admin/models/deliveryCashLimit.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { addOrderJob } from '../../../../queues/producers/order.producer.js';
import {
  buildDeliverySocketPayload,
  buildOrderIdentityFilter,
  haversineKm,
  notifyOwnerSafely,
  notifyOwnersSafely,
} from './order.helpers.js';
import {
  getActiveZoneById,
  isPartnerInsideZone,
  detectZoneIdForPoint,
  isPointInZonePolygon,
} from '../../utils/zoneGeo.js';

/** Never offer a job farther than this, even inside a large/misdrawn zone. */
const HARD_MAX_OFFER_DISTANCE_KM = 40;

/**
 * Push "new order" to every offered rider. The socket event only reaches a rider whose app is
 * open; a rider with the app in the background or closed only learns about the order by push.
 */
async function pushNewOrderToPartners(partners = [], order) {
  const targets = (partners || [])
    .map((p) => p?.partnerId || p?._id)
    .filter(Boolean)
    .map((id) => ({ ownerType: 'DELIVERY_PARTNER', ownerId: id }));
  if (!targets.length) return;
  try {
    await notifyOwnersSafely(targets, {
      title: 'New order assigned!',
      body: `You have 60 seconds to accept Order #${order.order_id || order.orderId || order._id}.`,
      data: {
        type: 'new_order',
        orderId: order.order_id || order._id.toString(),
        orderMongoId: order._id.toString(),
      },
    });
  } catch (err) {
    logger.warn(`Push notification failed for order ${order._id}: ${err.message}`);
  }
}

async function filterPartnersByCashLimit(partners = [], options = {}) {
  if (!Array.isArray(partners) || partners.length === 0) return [];
  const requiredAmount = Math.max(0, Number(options.requiredAmount || 0));
  const allowOverLimitFallback = options.allowOverLimitFallback !== false;

  const limitDoc = await FoodDeliveryCashLimit.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  const totalCashLimit = Number(limitDoc?.deliveryCashLimit || 0);

  // Treat missing/non-positive setting as "no cap" to avoid blocking all dispatch.
  if (!Number.isFinite(totalCashLimit) || totalCashLimit <= 0) {
    return partners.map((p) => ({
      ...p,
      availableCashLimit: Number.MAX_SAFE_INTEGER,
      allowOverLimit: false,
      requiredCashForOrder: requiredAmount,
    }));
  }

  const partnerIds = partners
    .map((p) => p?.partnerId || p?._id)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (partnerIds.length === 0) return [];

  const [cashAgg, depositsAgg] = await Promise.all([
    FoodOrder.aggregate([
      {
        $match: {
          'dispatch.deliveryPartnerId': { $in: partnerIds },
          orderStatus: 'delivered',
          'payment.method': 'cash',
        },
      },
      {
        $group: {
          _id: '$dispatch.deliveryPartnerId',
          grossCashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } },
        },
      },
    ]),
    FoodDeliveryCashDeposit.aggregate([
      {
        $match: {
          deliveryPartnerId: { $in: partnerIds },
          status: 'Completed',
        },
      },
      {
        $group: {
          _id: '$deliveryPartnerId',
          depositedCash: { $sum: { $ifNull: ['$amount', 0] } },
        },
      },
    ]),
  ]);

  const grossCashByPartner = new Map(
    (cashAgg || []).map((row) => [String(row._id), Number(row.grossCashCollected || 0)]),
  );
  const depositedByPartner = new Map(
    (depositsAgg || []).map((row) => [String(row._id), Number(row.depositedCash || 0)]),
  );

  const withCapacity = partners.map((p) => {
    const partnerId = String(p?.partnerId || p?._id || '');
    if (!partnerId) return null;
    const grossCash = grossCashByPartner.get(partnerId) || 0;
    const depositedCash = depositedByPartner.get(partnerId) || 0;
    const cashInHand = Math.max(0, grossCash - depositedCash);
    const availableCashLimit = Math.max(0, totalCashLimit - cashInHand);
    return {
      ...p,
      availableCashLimit,
      allowOverLimit: false,
      requiredCashForOrder: requiredAmount,
    };
  }).filter(Boolean);

  // Base block: riders with zero available limit should not receive fresh offers.
  const baseEligible = withCapacity.filter((p) => Number(p.availableCashLimit || 0) > 0);
  if (baseEligible.length === 0) return [];

  if (requiredAmount <= 0) return baseEligible;

  const sufficient = baseEligible.filter(
    (p) => Number(p.availableCashLimit || 0) >= requiredAmount,
  );
  if (sufficient.length > 0) return sufficient;

  if (!allowOverLimitFallback) return [];

  // Fallback: keep order moving by offering to highest available-limit riders.
  return baseEligible
    .slice()
    .sort((a, b) => Number(b.availableCashLimit || 0) - Number(a.availableCashLimit || 0))
    .map((p) => ({
      ...p,
      allowOverLimit: true,
    }));
}

async function listNearbyOnlineDeliveryPartners(
  restaurantId,
  {
    maxKm = 15,
    limit = 25,
    requiredAmount = 0,
    allowOverLimitFallback = true,
    zoneId = null,
  } = {},
) {
  const rId = (restaurantId?._id || restaurantId).toString();
  const restaurant = await FoodRestaurant.findById(rId)
    .select('location zoneId')
    .lean();

  const [rLng, rLat] = restaurant?.location?.coordinates?.length === 2
    ? restaurant.location.coordinates
    : [null, null];

  // Prefer zone from restaurant GPS so a wrong restaurant.zoneId cannot leak cross-city.
  const gpsZoneId =
    rLat != null && rLng != null ? await detectZoneIdForPoint(rLat, rLng) : null;
  const resolvedZoneId =
    gpsZoneId || String(zoneId || restaurant?.zoneId || '').trim() || null;
  const zoneDoc = resolvedZoneId ? await getActiveZoneById(resolvedZoneId) : null;

  // Without a service zone we must not broadcast globally (cross-city leak).
  if (!zoneDoc) {
    logger.warn(
      `listNearbyOnlineDeliveryPartners: no zone for restaurant ${rId}; skipping partner search`,
    );
    return { restaurant: restaurant || null, partners: [] };
  }

  // If restaurant pin is outside the resolved zone polygon, do not dispatch.
  if (
    rLat != null &&
    rLng != null &&
    !isPointInZonePolygon(rLat, rLng, zoneDoc.coordinates || [])
  ) {
    logger.warn(
      `listNearbyOnlineDeliveryPartners: restaurant ${rId} GPS outside zone ${resolvedZoneId}; skipping`,
    );
    return { restaurant: restaurant || null, partners: [] };
  }

  const allowedStatuses =
    process.env.NODE_ENV === 'production' ? ['approved'] : ['approved', 'pending'];
  const STALE_GPS_MS = 10 * 60 * 1000;
  // The rider app stops sending GPS while it is in the background or off the Feed screen, so an
  // online rider can look "stale" while still waiting for orders. Such riders are still offered
  // the order, after the riders with fresh GPS. Leaving them out entirely meant a free rider got
  // nothing whenever another rider in the zone had fresher GPS.
  const FALLBACK_GPS_MS = 60 * 60 * 1000;
  const offerRadiusKm = Math.min(
    Math.max(Number(maxKm) || 15, 1),
    HARD_MAX_OFFER_DISTANCE_KM,
  );

  const allOnline = await FoodDeliveryPartner.find({
    availabilityStatus: 'online',
    status: { $in: allowedStatuses },
  })
    .select('_id status lastLat lastLng lastLocationAt name')
    .lean();

  // Zone-first: only partners currently inside the order/restaurant zone.
  const inZoneWithin = (maxAgeMs) => (allOnline || []).filter((p) => {
    if (p.lastLat == null || p.lastLng == null || !p.lastLocationAt) return false;
    const ageMs = Date.now() - new Date(p.lastLocationAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) return false;
    return isPartnerInsideZone(p, zoneDoc);
  });
  const freshPartners = inZoneWithin(STALE_GPS_MS);
  const freshIds = new Set(freshPartners.map((p) => String(p._id)));
  const stalePartners = inZoneWithin(FALLBACK_GPS_MS).filter((p) => !freshIds.has(String(p._id)));
  if (stalePartners.length > 0) {
    logger.info(
      `listNearbyOnlineDeliveryPartners: zone ${resolvedZoneId} has ${freshPartners.length} rider(s) with fresh GPS and ${stalePartners.length} with GPS up to 60 min old`,
    );
  }

  if (freshPartners.length === 0 && stalePartners.length === 0) {
    return { restaurant: restaurant || null, partners: [] };
  }

  let scored = [];
  if (rLat != null && rLng != null) {
    const scoreList = (list) => list
      .map((p) => ({ partnerId: p._id, distanceKm: haversineKm(rLat, rLng, p.lastLat, p.lastLng), status: p.status }))
      .filter((p) => Number.isFinite(p.distanceKm) && p.distanceKm <= offerRadiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    // Fresh GPS first (nearest first), then riders whose last GPS is older.
    scored = [...scoreList(freshPartners), ...scoreList(stalePartners)];
  } else {
    // No restaurant GPS — refuse dispatch rather than guessing city-wide.
    logger.warn(
      `listNearbyOnlineDeliveryPartners: restaurant ${rId} missing GPS; skipping`,
    );
    return { restaurant: restaurant || null, partners: [] };
  }

  const picked = scored.slice(0, Math.max(1, limit));
  if (picked.length === 0) {
    return { restaurant: restaurant || null, partners: [] };
  }

  const cashEligibleFinal = await filterPartnersByCashLimit(picked, {
    requiredAmount,
    allowOverLimitFallback,
  });
  return { restaurant: restaurant || null, partners: cashEligibleFinal };
}

export async function getDispatchSettings() {
  return { dispatchMode: "auto" };
}

export async function updateDispatchSettings(dispatchMode, adminId) {
  // Always set to auto
  await FoodSettings.findOneAndUpdate(
    { key: "dispatch" },
    {
      $set: {
        dispatchMode: "auto",
        updatedBy: { role: "ADMIN", adminId, at: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  return getDispatchSettings();
}

export async function tryAutoAssign(orderId, options = {}) {
  const attempt = options.attempt || 1;
  const lockTimeout = 55000; // 55 seconds lock interval

  const dispatchableStatuses = new Set([
    'preparing',
    'ready_for_pickup',
    'ready',
    'picked_up',
  ]);

  const order = await FoodOrder.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(orderId),
      orderType: 'delivery',
      orderStatus: { $in: Array.from(dispatchableStatuses) },
      $or: [
        { 'dispatch.status': 'unassigned' },
        {
          'dispatch.status': 'assigned',
          'dispatch.acceptedAt': { $exists: false },
          'dispatch.assignedAt': { $lt: new Date(Date.now() - lockTimeout) }
        }
      ],
      // A lock older than 2 minutes was left by a crash/restart mid-dispatch; without this the
      // order would never be offered again.
      $and: [{
        $or: [
          { 'dispatch.dispatchingAt': { $exists: false } },
          { 'dispatch.dispatchingAt': { $lt: new Date(Date.now() - 2 * 60 * 1000) } },
        ],
      }],
    },
    {
      $set: { 'dispatch.dispatchingAt': new Date() }
    },
    { new: true }
  ).populate(['restaurantId', 'userId']);

  if (!order) {
    logger.info(`tryAutoAssign: Skip for ${orderId} (not dispatchable, already dispatching, accepted, or multi-attempt lock active).`);
    return null;
  }

  try {
    const offeredIds = (order.dispatch?.offeredTo || []).map(o => o.partnerId.toString());
    const paymentMethod = String(order.payment?.method || 'cash').toLowerCase();
    const isCashOrder = paymentMethod === 'cash';
    const requiredAmount = isCashOrder ? Number(order?.pricing?.total || 0) : 0;
    
    // RADIUS EXPANSION LOGIC
    // Attempt 1: 15km, Attempt 2: 25km, Attempt 3: 40km, Attempt 4+: 60km
    let maxKm = 15;
    if (attempt === 2) maxKm = 25;
    if (attempt === 3) maxKm = 40;
    if (attempt >= 4) maxKm = 60;

    const searchOptions = {
      maxKm,
      limit: 15,
      requiredAmount,
      allowOverLimitFallback: true,
      zoneId: order.zoneId || order.restaurantId?.zoneId || null,
    };
    const { partners: nearbyPartners } = await listNearbyOnlineDeliveryPartners(
      order.restaurantId,
      searchOptions,
    );

    // Multi-order: skip riders already at concurrent capacity (one query).
    const limitDoc = await FoodDeliveryCashLimit.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .select('maxConcurrentOrders')
      .lean();
    const maxConcurrent = Math.min(
      5,
      Math.max(1, Number(limitDoc?.maxConcurrentOrders ?? 1)),
    );
    const nearbyIds = (nearbyPartners || [])
      .map((p) => p.partnerId || p._id)
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(String(id)));

    let activeByPartner = new Map();
    if (nearbyIds.length > 0) {
      const activeAgg = await FoodOrder.aggregate([
        {
          $match: {
            'dispatch.deliveryPartnerId': { $in: nearbyIds },
            'dispatch.status': 'accepted',
            orderStatus: { $in: ['preparing', 'ready_for_pickup', 'picked_up'] },
          },
        },
        { $group: { _id: '$dispatch.deliveryPartnerId', count: { $sum: 1 } } },
      ]);
      activeByPartner = new Map(
        (activeAgg || []).map((row) => [String(row._id), Number(row.count || 0)]),
      );
    }

    const partners = (nearbyPartners || []).filter((p) => {
      const id = String(p.partnerId || p._id || '');
      const active = activeByPartner.get(id) || 0;
      return active < maxConcurrent;
    });
    
    // TIERED ALERT LOGIC
    // Phase 2: Broadcast to all (Attempt 3+)
    // Phase 3: Admin Alert (Attempt 5+ or roughly 5 mins)
    const isPhase2 = attempt >= 3;
    const isPhase3 = attempt >= 6; // ~6 minutes (60s * 6)

    if (isPhase3) {
      logger.error(`[CRITICAL] Order ${order._id} unassigned for ${attempt} mins. Triggering Admin Alert (Phase 3).`);
      // Notify Admin via Push (Web/Mobile)
      try {
        await notifyOwnersSafely(
          [{ ownerType: 'ADMIN', ownerId: 'GLOBAL' }], // Use GLOBAL or specific admin group if defined
          {
            title: 'Unassigned Order Crisis!',
            body: `Order #${order.order_id || order._id} has not been picked up for 5+ minutes. Manual intervention required!`,
            data: { type: 'admin_alert_unassigned', orderId: order._id.toString() }
          }
        );
      } catch (err) {
        logger.warn(`Admin notification failed: ${err.message}`);
      }
    }

    const eligible = partners.filter(p => !offeredIds.includes(p.partnerId.toString()));

    if (eligible.length === 0) {
      logger.info(`tryAutoAssign: No NEW eligible partners in ${maxKm}km for order ${order._id}. Restarting hunt...`);
      
      // If we ran out of new eligible partners, we might want to re-offer to everyone (Phase 2 style)
      const io = getIO();
      if (io && partners.length > 0) {
        const payload = buildDeliverySocketPayload(order, order.restaurantId);
        for (const p of partners) {
          const roomName = rooms.delivery(p.partnerId);
          const eventPayload = { ...payload, pickupDistanceKm: p.distanceKm };
          io.to(roomName).emit('new_order', eventPayload);
          io.to(roomName).emit('new_order_available', eventPayload);
        }
      }
      // Remind by push too, but only every 4th retry (~2 min) so riders are not spammed.
      if (partners.length > 0 && attempt % 4 === 0) {
        await pushNewOrderToPartners(partners, order);
      }

      // Re-queue itself to keep trying
      await addOrderJob({
        action: 'DISPATCH_TIMEOUT_CHECK',
        orderMongoId: order._id.toString(),
        orderId: order._id.toString(),
        attempt: attempt + 1
      }, { delay: 30000 }); // Retry faster (30s) if no one found

      return order;
    }

    const io = getIO();
    const payload = buildDeliverySocketPayload(order, order.restaurantId);

    const phase1Batch = eligible.slice(0, Math.min(3, eligible.length));

    if (isPhase2) {
      // PHASE 2 BROADCAST: Notify everyone remaining
      logger.info(`[Phase 2] Broadcasting order ${order._id} to ${eligible.length} riders.`);
      for (const p of eligible) {
        const roomName = rooms.delivery(p.partnerId);
        if (io) {
          const eventPayload = { ...payload, pickupDistanceKm: p.distanceKm };
          io.to(roomName).emit('new_order', eventPayload);
          io.to(roomName).emit('new_order_available', eventPayload);
        }
      }
      await pushNewOrderToPartners(eligible, order);
    } else {
      // PHASE 1: Offer to top few nearby riders (avoid single-partner bottleneck).
      const lead = phase1Batch[0];
      if (lead) {
        logger.info(`[Phase 1] Offering order ${order._id} to ${phase1Batch.length} riders (lead ${lead.partnerId}, ${lead.distanceKm}km)`);
      }

      for (const p of phase1Batch) {
        const roomName = rooms.delivery(p.partnerId);
        if (io) {
          const eventPayload = { ...payload, pickupDistanceKm: p.distanceKm };
          io.to(roomName).emit('new_order', eventPayload);
          io.to(roomName).emit('new_order_available', eventPayload);
        }
      }

      // Every rider in the batch gets the offer, so every one of them needs the push (it went to
      // the lead only, so the other riders missed the order whenever their app was in background).
      await pushNewOrderToPartners(phase1Batch, order);
    }

    const partnersToRecord = isPhase2 ? eligible : phase1Batch;
    const offeredToEntries = partnersToRecord.map(p => ({
      partnerId: p.partnerId,
      at: new Date(),
      action: 'offered',
      allowOverLimit: Boolean(p.allowOverLimit),
      requiredCashForOrder: Number(p.requiredCashForOrder || requiredAmount || 0),
    }));

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    order.dispatch.offeredTo.push(...offeredToEntries);
    await order.save();

    // Re-check in 60s
    await addOrderJob({
      action: 'DISPATCH_TIMEOUT_CHECK',
      orderMongoId: order._id.toString(),
      orderId: order._id.toString(),
      attempt: attempt + 1
    }, { delay: 60000 });

    return order;
  } finally {
    await FoodOrder.findByIdAndUpdate(orderId, {
      $unset: { 'dispatch.dispatchingAt': '' },
    });
  }
}


export async function processDispatchTimeout(orderId, partnerId) {
  const order = await FoodOrder.findById(orderId);
  if (!order) return;

  const stillAssigned = order.dispatch?.status === 'assigned' &&
    String(order.dispatch?.deliveryPartnerId) === String(partnerId) &&
    !order.dispatch?.acceptedAt;

  if (stillAssigned) {
    logger.info(`Dispatch timeout for partner ${partnerId} on order ${orderId}. Re-trying hunt...`);
    const offer = order.dispatch.offeredTo.find(
      o => String(o.partnerId) === String(partnerId) && o.action === 'offered'
    );
    if (offer) offer.action = 'timeout';

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    await order.save();
    
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  } else if (order.dispatch?.status === 'unassigned') {
    // If it's already unassigned (e.g. from a previous timeout), just keep hunting
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  }
}


/**
 * Safety net for the BullMQ retry chain: if a retry job is lost (Redis restart, worker down or
 * deploy), the order stayed without a rider for good. Restarts the hunt for delivery orders that
 * still have no rider and had no dispatch activity for 2 minutes. A live retry chain touches the
 * order every 30-60 s, so this never doubles up with it.
 */
export async function resumeStalledDispatches() {
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
  const stalled = await FoodOrder.find({
    orderType: 'delivery',
    orderStatus: { $in: ['preparing', 'ready_for_pickup'] },
    'dispatch.status': 'unassigned',
    'dispatch.acceptedAt': { $exists: false },
    updatedAt: { $lt: staleBefore },
    createdAt: { $gt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
  })
    .select('_id dispatch.offeredTo')
    .limit(50)
    .lean();

  for (const order of stalled) {
    try {
      const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
      await tryAutoAssign(order._id, { attempt });
    } catch (err) {
      logger.warn(`resumeStalledDispatches: order ${order._id} failed: ${err?.message || err}`);
    }
  }
  return stalled.length;
}

export async function resendDeliveryNotificationRestaurant(orderId, restaurantId) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne({
    ...identity,
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });

  if (!order) throw new NotFoundError('Order not found');

  const activeStatuses = ['preparing', 'ready_for_pickup', 'ready'];
  if (!activeStatuses.includes(order.orderStatus)) {
    throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
  }

  if (order.dispatch?.status === 'accepted') {
    throw new ValidationError('A delivery partner has already accepted this order.');
  }

  const paymentMethod = String(order.payment?.method || 'cash').toLowerCase();
  const requiredAmount = paymentMethod === 'cash' ? Number(order?.pricing?.total || 0) : 0;
  const preview = await listNearbyOnlineDeliveryPartners(order.restaurantId, {
    maxKm: 15,
    limit: 15,
    requiredAmount,
    allowOverLimitFallback: true,
  });
  const shortlistedCount = Array.isArray(preview?.partners) ? preview.partners.length : 0;

  order.dispatch.status = 'unassigned';
  order.dispatch.deliveryPartnerId = null;
  order.dispatch.offeredTo = [];
  await order.save();

  await tryAutoAssign(order._id);

  const refreshed = await FoodOrder.findById(order._id)
    .select('dispatch.offeredTo dispatch.status dispatch.deliveryPartnerId')
    .lean();
  const notifiedCount = Array.isArray(refreshed?.dispatch?.offeredTo)
    ? refreshed.dispatch.offeredTo.filter((entry) => entry?.action === 'offered').length
    : 0;
  const notifiedPartnerIds = Array.isArray(refreshed?.dispatch?.offeredTo)
    ? refreshed.dispatch.offeredTo
        .filter((entry) => entry?.action === 'offered' && entry?.partnerId)
        .map((entry) => String(entry.partnerId))
    : [];
  const io = getIO();
  const connectedSocketCount = io
    ? notifiedPartnerIds.reduce((count, pid) => {
        const roomName = rooms.delivery(pid);
        const roomSize = io?.sockets?.adapter?.rooms?.get(roomName)?.size || 0;
        return count + roomSize;
      }, 0)
    : 0;

  return {
    success: true,
    notifiedCount,
    shortlistedCount,
    requiredAmount,
    connectedSocketCount,
    dispatchStatus: refreshed?.dispatch?.status || 'unassigned',
  };
}
