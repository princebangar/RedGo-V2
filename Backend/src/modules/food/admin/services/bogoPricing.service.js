import mongoose from 'mongoose';
import { FoodBogoOffer } from '../models/bogoOffer.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodSystemConfig } from '../models/systemConfig.model.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const BOGO_FREE_LABEL = 'FREE · Buy 1 Get 1';

export const BOGO_DEFAULT_LIMITS_KEY = 'bogo_default_limits';
// Both limits fall back to 1 (1 free per order, 1 order per customer); unlimited uses only when the admin saves 0 / empty.
const FALLBACK_DEFAULT_LIMITS = { maxFreePerOrder: 1, usageLimitPerUser: 1 };

/** Admin "Default limits", used by every offer without custom limits (1 free / 1 use per customer if never saved). */
export async function getBogoDefaultLimits() {
    const doc = await FoodSystemConfig.findOne({ key: BOGO_DEFAULT_LIMITS_KEY }).select('value').lean();
    return { ...FALLBACK_DEFAULT_LIMITS, ...(doc?.value || {}) };
}

/**
 * The limits an offer actually runs with: its own when the admin set custom limits for it,
 * otherwise the defaults. usageLimitPerUser 0 = unlimited (only when saved that way); a missing
 * value counts as 1.
 */
export const effectiveBogoLimits = (offer, defaults = FALLBACK_DEFAULT_LIMITS) => {
    const source = offer?.useCustomLimits === true ? offer : defaults;
    const uses = Number(source?.usageLimitPerUser);
    return {
        maxFreePerOrder: Math.max(1, Math.floor(Number(source?.maxFreePerOrder) || 1)),
        usageLimitPerUser:
            source?.usageLimitPerUser == null || source.usageLimitPerUser === '' || !Number.isFinite(uses)
                ? 1
                : Math.max(0, Math.floor(uses))
    };
};

/**
 * Buy 1 Get 1: every unit bought comes with one more free, up to the offer's per-order limit
 * (limit 1: 1 → +1 free, 3 → +1 free; limit 2: 3 → +2 free). Extra units are charged normally.
 */
export const bogoFreeQuantity = (quantity, limit = 1) =>
    Math.max(0, Math.min(Math.floor(Number(quantity) || 0), Math.floor(Number(limit) || 0)));

/**
 * Orders in which this user already got each BOGO dish free (Map food id → order count).
 * Cancelled orders and failed payments don't count.
 */
async function countBogoUsage(userId, foodIds) {
    const uid = String(userId || '');
    if (!mongoose.Types.ObjectId.isValid(uid) || foodIds.length === 0) return new Map();
    const rows = await FoodOrder.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(uid),
                orderStatus: { $not: /^cancelled/ },
                'payment.status': { $ne: 'failed' },
                items: { $elemMatch: { isBogoFree: true, itemId: { $in: foodIds } } }
            }
        },
        { $unwind: '$items' },
        { $match: { 'items.isBogoFree': true, 'items.itemId': { $in: foodIds } } },
        { $group: { _id: { order: '$_id', item: '$items.itemId' } } },
        { $group: { _id: '$_id.item', count: { $sum: 1 } } }
    ]);
    return new Map(rows.map((r) => [String(r._id), r.count]));
}

/**
 * Active BOGO offers among foodIds: Map of food id (string) →
 * { limit: free units per order, exhausted: this user has used up the offer's per-user usage }.
 * Without a userId (guest / public menu) the usage limit is not checked.
 */
export async function loadActiveBogoOffers(foodIds = [], userId = null) {
    const ids = [...new Set(foodIds.map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length === 0) return new Map();
    const [docs, defaults] = await Promise.all([
        FoodBogoOffer.find({ foodId: { $in: ids }, isActive: true })
            .select('foodId useCustomLimits maxFreePerOrder usageLimitPerUser')
            .lean(),
        getBogoDefaultLimits()
    ]);
    const offers = docs.map((d) => ({ foodId: String(d.foodId), ...effectiveBogoLimits(d, defaults) }));
    const limitedIds = offers.filter((o) => o.usageLimitPerUser > 0).map((o) => o.foodId);
    const usage = userId ? await countBogoUsage(userId, limitedIds) : new Map();
    return new Map(
        offers.map((o) => {
            const used = usage.get(o.foodId) || 0;
            return [
                o.foodId,
                {
                    limit: o.maxFreePerOrder,
                    usesPerUser: o.usageLimitPerUser,
                    exhausted: o.usageLimitPerUser > 0 && used >= o.usageLimitPerUser
                }
            ];
        })
    );
}

/**
 * Adds a ₹0 "FREE" line after every BOGO line of server-priced order items, so the free units reach
 * the restaurant (KOT / order screens), the rider and the bill as a normal line. Price, base and
 * markup are 0: the customer pays nothing for it and the restaurant earns nothing on it
 * (restaurant-funded). The per-order limit is shared by all lines (variants) of the same dish,
 * and a user who has used up the offer's per-user usage gets no free line.
 * Any free lines already in `items` are dropped and rebuilt, so a client can never inject one.
 * Returns the new item list and the value of the free units (customer savings).
 */
export async function applyBogoToItems(items = [], userId = null) {
    const paidLines = items.filter((item) => item?.isBogoFree !== true);
    const foodLines = paidLines.filter((item) => item?.itemType !== 'addon');
    const offers = await loadActiveBogoOffers(foodLines.map((item) => item.itemId), userId);
    const remaining = new Map([...offers].map(([id, o]) => [id, o.exhausted ? 0 : o.limit]));

    let savings = 0;
    const result = [];
    for (const item of paidLines) {
        const foodId = String(item.itemId);
        const offer = item?.itemType !== 'addon' ? offers.get(foodId) : null;
        const free = offer ? bogoFreeQuantity(item.quantity, remaining.get(foodId)) : 0;
        if (offer) remaining.set(foodId, remaining.get(foodId) - free);
        item.isBogo = Boolean(offer);
        item.bogoFreeQuantity = free;
        item.bogoMaxFree = offer ? offer.limit : 0;
        item.bogoUsageExhausted = Boolean(offer?.exhausted);
        result.push(item);
        if (!free) continue;

        savings += free * (Number(item.price) || 0);
        result.push({
            itemId: foodId,
            name: `${item.name || 'Item'} (${BOGO_FREE_LABEL})`,
            variantId: item.variantId || '',
            variantName: item.variantName || '',
            variantPrice: 0,
            price: 0,
            basePrice: 0,
            otherPrice: 0,
            markupAmount: 0,
            quantity: free,
            isVeg: item.isVeg,
            image: item.image || '',
            notes: '',
            isBogo: true,
            isBogoFree: true,
            bogoFreeQuantity: 0
        });
    }

    return { items: result, savings: round2(savings) };
}
