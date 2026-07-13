import { FoodDeliveryCommissionRule } from '../../admin/models/deliveryCommissionRule.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { logger } from '../../../../utils/logger.js';
import {
  resolveOrderDistanceKm,
  toGeoJsonPoint,
} from '../utils/googleMaps.js';

const COMMISSION_CACHE_MS = 10 * 1000;
let commissionRulesCache = null;
let commissionRulesLoadedAt = 0;

async function getActiveCommissionRules() {
  const now = Date.now();
  if (
    commissionRulesCache &&
    now - commissionRulesLoadedAt < COMMISSION_CACHE_MS
  ) {
    return commissionRulesCache;
  }
  const list = await FoodDeliveryCommissionRule.find({
    status: { $ne: false },
  }).lean();
  commissionRulesCache = list || [];
  commissionRulesLoadedAt = now;
  return commissionRulesCache;
}

/** Base payout when distance cannot be resolved (minDistance === 0 slab). */
export async function getBaseRiderPayoutFallback() {
  const rules = await getActiveCommissionRules();
  if (!rules.length) return 0;
  const baseRule =
    [...rules]
      .sort((a, b) => (a.minDistance || 0) - (b.minDistance || 0))
      .find((r) => Number(r.minDistance || 0) === 0) || null;
  const payout = Number(baseRule?.basePayout || 0);
  return Number.isFinite(payout) && payout > 0 ? Math.round(payout) : 0;
}

export async function getRiderEarning(distanceKm) {
  const d = Number(distanceKm);
  if (!Number.isFinite(d) || d <= 0) return 0;
  const rules = await getActiveCommissionRules();
  if (!rules.length) return 0;

  const sorted = [...rules].sort(
    (a, b) => (a.minDistance || 0) - (b.minDistance || 0),
  );
  const baseRule = sorted.find((r) => Number(r.minDistance || 0) === 0) || null;
  if (!baseRule) return 0;

  let earning = Number(baseRule.basePayout || 0);

  for (const r of sorted) {
    const perKm = Number(r.commissionPerKm || 0);
    if (!Number.isFinite(perKm) || perKm <= 0) continue;
    const min = Number(r.minDistance || 0);
    const max = r.maxDistance == null ? null : Number(r.maxDistance);
    if (d <= min) continue;
    const upper = max == null ? d : Math.min(d, max);
    const kmInSlab = Math.max(0, upper - min);
    if (kmInSlab > 0) {
      earning += kmInSlab * perKm;
    }
  }

  if (!Number.isFinite(earning) || earning <= 0) return 0;
  return Math.round(earning);
}

/**
 * Resolve coords (geocode if missing) + compute rider earning.
 * Falls back to base commission payout if distance still cannot be computed.
 */
export async function resolveRiderEarningForDelivery({
  restaurant,
  deliveryAddress,
  orderType = 'delivery',
}) {
  if (orderType === 'takeaway') {
    return {
      riderEarning: 0,
      distanceKm: null,
      deliveryPoint: null,
      restaurantPoint: null,
      restaurantGeocoded: false,
      deliveryGeocoded: false,
    };
  }

  const resolved = await resolveOrderDistanceKm(restaurant, deliveryAddress);
  let riderEarning = await getRiderEarning(resolved.distanceKm);

  if (!riderEarning) {
    riderEarning = await getBaseRiderPayoutFallback();
    if (riderEarning > 0) {
      logger.warn(
        `Rider earning fell back to base payout ₹${riderEarning} (distanceKm=${resolved.distanceKm ?? 'n/a'}, geocoded restaurant=${resolved.restaurantGeocoded}, delivery=${resolved.deliveryGeocoded})`,
      );
    } else {
      logger.error(
        `CRITICAL: riderEarning still 0 — check Delivery Boy Commission (need active minDistance=0 base slab) and Geocoding API. distanceKm=${resolved.distanceKm ?? 'n/a'}`,
      );
    }
  }

  return {
    riderEarning,
    distanceKm: resolved.distanceKm,
    deliveryPoint: resolved.deliveryPoint,
    restaurantPoint: resolved.restaurantPoint,
    restaurantGeocoded: resolved.restaurantGeocoded,
    deliveryGeocoded: resolved.deliveryGeocoded,
  };
}

/**
 * If delivered order still has riderEarning <= 0, geocode + recalculate and patch order fields.
 * Call before finalizing delivery complete.
 */
export async function ensureRiderEarningOnOrder(order) {
  if (!order || String(order.orderType || 'delivery') === 'takeaway') {
    return order;
  }

  const current = Number(order.riderEarning || 0);
  if (Number.isFinite(current) && current > 0) return order;

  let restaurant = order.restaurantId;
  if (!restaurant || !restaurant.location) {
    const restaurantId = restaurant?._id || restaurant;
    if (restaurantId) {
      restaurant = await FoodRestaurant.findById(restaurantId)
        .select(
          'restaurantName location addressLine1 addressLine2 area city state pincode',
        )
        .lean();
    }
  }

  const deliveryAddress = order.deliveryAddress || {};
  const earningResolved = await resolveRiderEarningForDelivery({
    restaurant,
    deliveryAddress,
    orderType: order.orderType || 'delivery',
  });

  if (!earningResolved.riderEarning) return order;

  order.riderEarning = earningResolved.riderEarning;
  order.markModified?.('riderEarning');

  if (earningResolved.deliveryGeocoded && earningResolved.deliveryPoint) {
    const geo = toGeoJsonPoint(earningResolved.deliveryPoint);
    if (geo) {
      order.deliveryAddress = {
        ...(order.deliveryAddress?.toObject?.() || order.deliveryAddress || {}),
        location: geo,
      };
      order.markModified?.('deliveryAddress');
    }
  }

  // Keep platformProfit roughly consistent if pricing exists
  const deliveryFee = Number(order.pricing?.deliveryFee || 0);
  const platformFee = Number(order.pricing?.platformFee || 0);
  const restaurantCommission = Number(order.pricing?.restaurantCommission || 0);
  if (Number.isFinite(deliveryFee) || Number.isFinite(platformFee)) {
    order.platformProfit = Math.max(
      0,
      deliveryFee + platformFee + restaurantCommission - earningResolved.riderEarning,
    );
    order.markModified?.('platformProfit');
  }

  logger.info(
    `Backfilled riderEarning=₹${earningResolved.riderEarning} for order ${order._id} (distanceKm=${earningResolved.distanceKm ?? 'n/a'})`,
  );

  return order;
}
