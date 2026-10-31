import mongoose from 'mongoose';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { FoodBogoOffer } from '../models/bogoOffer.model.js';
import { FoodItem } from '../models/food.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodSystemConfig } from '../models/systemConfig.model.js';
import { getFoodDisplayPrice } from './foodVariant.service.js';
import {
    buildCandidateFoodFilter,
    toCandidateFoodRows,
    CANDIDATE_FOOD_SORT,
    CANDIDATE_FOOD_FIELDS
} from './comboOffer.service.js';
import { invalidateCache } from '../../../../middleware/cache.js';
import { BOGO_DEFAULT_LIMITS_KEY, effectiveBogoLimits, getBogoDefaultLimits } from './bogoPricing.service.js';

export { getBogoDefaultLimits };

const toObjectIdOrThrow = (value, label) => {
    const id = String(value || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ValidationError(`Invalid ${label}`);
    return id;
};

/** The public restaurant menu is cached and carries the isBogo flag, so drop it after any BOGO change. */
async function invalidateMenuCache() {
    try {
        await invalidateCache('restaurant_menu:*');
    } catch {
        // Cache is best-effort; the menu refreshes when its TTL runs out.
    }
}

/** Admin list: every BOGO entry (active or not) with the dish + restaurant it points at. */
export async function listBogoOffersAdmin() {
    const docs = await FoodBogoOffer.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
    return toAdminBogoRows(docs);
}

/** BOGO docs → admin list rows (dish, restaurant and the limits each offer runs with). */
async function toAdminBogoRows(docs) {
    if (docs.length === 0) return [];

    const [foods, restaurants, defaults] = await Promise.all([
        FoodItem.find({ _id: { $in: docs.map((d) => d.foodId) } })
            .select('name description image price variants foodType isAvailable approvalStatus restaurantId')
            .lean(),
        FoodRestaurant.find({ _id: { $in: docs.map((d) => d.restaurantId) } })
            .select('restaurantName area city status')
            .lean(),
        getBogoDefaultLimits()
    ]);
    const foodMap = new Map(foods.map((f) => [String(f._id), f]));
    const restaurantMap = new Map(restaurants.map((r) => [String(r._id), r]));

    return docs.map((d) => {
        const f = foodMap.get(String(d.foodId));
        const r = restaurantMap.get(String(d.restaurantId));
        return {
            _id: d._id,
            foodId: d.foodId,
            restaurantId: d.restaurantId,
            // Limits the offer runs with (its own when custom, otherwise the defaults).
            useCustomLimits: d.useCustomLimits === true,
            ...effectiveBogoLimits(d, defaults),
            sortOrder: d.sortOrder,
            isActive: d.isActive,
            food: f
                ? {
                      _id: f._id,
                      name: f.name,
                      description: f.description || '',
                      image: f.image || '',
                      price: getFoodDisplayPrice(f),
                      foodType: f.foodType || 'Non-Veg',
                      isAvailable: f.isAvailable !== false,
                      approvalStatus: f.approvalStatus || 'approved'
                  }
                : null,
            restaurant: r
                ? { _id: r._id, name: r.restaurantName, area: r.area || '', city: r.city || '', status: r.status }
                : null
        };
    });
}

/**
 * Filter for the approved dishes matching the search (and restaurant, if given). Any approved dish can
 * be a BOGO, not just restaurant offer/combo items. Without a restaurant only approved restaurants
 * count (banned / deleted ones aren't shown to users), so All Items matches the All Restaurants totals.
 */
async function buildBogoCandidateFilter({ search = '', restaurantId = '' } = {}) {
    const filter = await buildCandidateFoodFilter({ search, restaurantId, onlyOffers: 'false' });
    if (!filter.restaurantId) {
        const restaurants = await FoodRestaurant.find({ status: 'approved' }).select('_id').lean();
        filter.restaurantId = { $in: restaurants.map((r) => r._id) };
    }
    return filter;
}

/** Every matching dish (id, restaurant, stock) in list order, with whether it is a BOGO already. For bulk actions. */
async function findBogoCandidates(params = {}) {
    const filter = await buildBogoCandidateFilter(params);
    const foods = await FoodItem.find(filter).select('_id restaurantId isAvailable').sort(CANDIDATE_FOOD_SORT).lean();
    const bogo = await FoodBogoOffer.find({ foodId: { $in: foods.map((f) => f._id) } }).select('foodId').lean();
    const bogoIds = new Set(bogo.map((d) => String(d.foodId)));
    return foods.map((f) => ({ ...f, isBogo: bogoIds.has(String(f._id)) }));
}

/**
 * Any dish that isn't BOGO yet can be added, out-of-stock ones too: the offer shows to users once the
 * restaurant has it in stock again.
 */
const isAddableCandidate = (food) => !food.isBogo;

/**
 * One page of the dish picker, plus counts over every match (all pages): total, out of stock, added
 * (already BOGO) and addable (what Select all would add). Counts run in the DB; only the page's
 * dishes are read.
 */
export async function searchBogoCandidateFoods({ search = '', restaurantId = '', page = 1, limit = 20 } = {}) {
    const size = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = await buildBogoCandidateFilter({ search, restaurantId });
    const bogo = await FoodBogoOffer.find({ restaurantId: filter.restaurantId }).select('foodId').lean();
    const bogoFoodIds = bogo.map((d) => d.foodId);

    const [total, outOfStockCount, addedCount] = await Promise.all([
        FoodItem.countDocuments(filter),
        FoodItem.countDocuments({ ...filter, isAvailable: false }),
        bogoFoodIds.length ? FoodItem.countDocuments({ ...filter, _id: { $in: bogoFoodIds } }) : 0
    ]);
    const pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(pages, Math.max(1, parseInt(page, 10) || 1));
    const docs = await FoodItem.find(filter)
        .select(CANDIDATE_FOOD_FIELDS)
        .sort(CANDIDATE_FOOD_SORT)
        .skip((current - 1) * size)
        .limit(size)
        .lean();

    return {
        foods: await toCandidateFoodRows(docs),
        total,
        page: current,
        limit: size,
        outOfStockCount,
        addedCount,
        addableCount: total - addedCount
    };
}

/** Select all: every addable dish matching the search / restaurant, across all pages. */
export async function addBogoOffersByFilter({ search = '', restaurantId = '', ...limits } = {}) {
    const limitFields = addLimitFields(limits);
    const all = await findBogoCandidates({ search, restaurantId });
    return insertBogoOffers(all.filter((f) => isAddableCandidate(f)), limitFields);
}

/** Unselect all: drops the BOGO of every dish matching the search / restaurant, across all pages. */
export async function removeBogoOffersByFilter({ search = '', restaurantId = '' } = {}) {
    const ids = (await findBogoCandidates({ search, restaurantId })).filter((f) => f.isBogo).map((f) => f._id);
    if (ids.length === 0) return { removed: 0 };
    const result = await FoodBogoOffer.deleteMany({ foodId: { $in: ids } });
    await invalidateMenuCache();
    return { removed: result.deletedCount || 0 };
}

/** All Restaurants tab: approved restaurants with their approved dish count and how many of those are BOGO. */
export async function listBogoRestaurants({ search = '' } = {}) {
    const filter = { status: 'approved' };
    const term = String(search || '').trim();
    if (term) {
        filter.restaurantName = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    const restaurants = await FoodRestaurant.find(filter)
        .select('restaurantName area city profileImage')
        .sort({ restaurantName: 1 })
        .lean();
    if (restaurants.length === 0) return [];

    const counts = await FoodItem.aggregate([
        { $match: { restaurantId: { $in: restaurants.map((r) => r._id) }, approvalStatus: 'approved' } },
        { $lookup: { from: FoodBogoOffer.collection.name, localField: '_id', foreignField: 'foodId', as: 'bogo' } },
        {
            $group: {
                _id: '$restaurantId',
                dishCount: { $sum: 1 },
                bogoCount: { $sum: { $cond: [{ $gt: [{ $size: '$bogo' }, 0] }, 1, 0] } }
            }
        }
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    return restaurants.map((r) => {
        const c = countMap.get(String(r._id));
        return {
            _id: r._id,
            name: r.restaurantName,
            area: r.area || '',
            city: r.city || '',
            image: r.profileImage || '',
            dishCount: c?.dishCount || 0,
            bogoCount: c?.bogoCount || 0
        };
    });
}

/** Restaurant ids for a restaurant-wide action: { all: true } = every approved restaurant. */
async function resolveRestaurantIds({ restaurantIds = [], all = false } = {}) {
    if (all === true) {
        const restaurants = await FoodRestaurant.find({ status: 'approved' }).select('_id').lean();
        return restaurants.map((r) => r._id);
    }
    const ids = [...new Set((Array.isArray(restaurantIds) ? restaurantIds : []).map(String))].filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
    );
    if (ids.length === 0) throw new ValidationError('restaurantIds is required');
    return ids.map((id) => new mongoose.Types.ObjectId(id));
}

/** Validated limit fields present in input (absent / empty fields are left out). */
function parseBogoLimits({ maxFreePerOrder, usageLimitPerUser } = {}) {
    const out = {};
    if (maxFreePerOrder != null && maxFreePerOrder !== '') {
        const limit = Number(maxFreePerOrder);
        if (!Number.isInteger(limit) || limit < 1 || limit > 99) {
            throw new ValidationError('Free items per order must be a whole number from 1 to 99');
        }
        out.maxFreePerOrder = limit;
    }
    if (usageLimitPerUser !== undefined) {
        // null / '' / 0 = unlimited
        const uses = usageLimitPerUser === null || usageLimitPerUser === '' ? 0 : Number(usageLimitPerUser);
        if (!Number.isInteger(uses) || uses < 0 || uses > 999) {
            throw new ValidationError('Uses per user must be a whole number from 0 (unlimited) to 999');
        }
        out.usageLimitPerUser = uses;
    }
    return out;
}

/** Both limits, required — for the defaults and for an offer's custom limits. */
function parseFullBogoLimits(body = {}) {
    const limits = parseBogoLimits({
        maxFreePerOrder: body.maxFreePerOrder,
        // Not sent at all: 1 use per customer. Unlimited only when the admin sends 0 / empty.
        usageLimitPerUser: body.usageLimitPerUser === undefined ? 1 : body.usageLimitPerUser
    });
    if (limits.maxFreePerOrder == null) throw new ValidationError('maxFreePerOrder is required');
    return limits;
}

/** Default limits: apply to every offer that has no custom limits, existing ones included. */
export async function saveBogoDefaultLimits(body = {}, updatedBy = {}) {
    const value = parseFullBogoLimits(body);
    await FoodSystemConfig.updateOne(
        { key: BOGO_DEFAULT_LIMITS_KEY },
        {
            $set: {
                value,
                description: 'Buy 1 Get 1: free items per order and uses per user for offers without custom limits',
                updatedBy: { ...updatedBy, at: new Date() }
            }
        },
        { upsert: true }
    );
    await invalidateMenuCache();
    return value;
}

/** Limits sent with an add request make the offer custom; without them it follows the defaults. */
const addLimitFields = (limits) => {
    const hasLimits = limits.maxFreePerOrder != null || limits.usageLimitPerUser != null;
    return hasLimits ? { useCustomLimits: true, ...parseFullBogoLimits(limits) } : {};
};

export async function addBogoOffer({ foodId, ...limits } = {}) {
    const id = toObjectIdOrThrow(foodId, 'food id');
    const limitFields = addLimitFields(limits);
    const food = await FoodItem.findById(id).select('restaurantId approvalStatus').lean();
    if (!food) throw new NotFoundError('Food item not found');
    if (food.approvalStatus !== 'approved') throw new ValidationError('Only approved food items can be added as BOGO offers');
    if (await FoodBogoOffer.exists({ foodId: id })) throw new ValidationError('This item is already a BOGO offer');

    const last = await FoodBogoOffer.findOne({}).sort({ sortOrder: -1 }).select('sortOrder').lean();
    const doc = await FoodBogoOffer.create({
        foodId: id,
        restaurantId: food.restaurantId,
        ...limitFields,
        sortOrder: (Number(last?.sortOrder) || 0) + 1
    });
    await invalidateMenuCache();
    // Same shape as the admin list, so the page can add the row without reloading the whole list.
    const [row] = await toAdminBogoRows([doc.toObject()]);
    return row;
}

/** Select all: adds every approved item in foodIds that isn't a BOGO yet, keeping the given order. */
export async function addBogoOffersBulk({ foodIds = [], ...limits } = {}) {
    const limitFields = addLimitFields(limits);
    const ids = [...new Set((Array.isArray(foodIds) ? foodIds : []).map(String))].filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
    );
    if (ids.length === 0) throw new ValidationError('foodIds is required');

    const foods = await FoodItem.find({ _id: { $in: ids }, approvalStatus: 'approved' }).select('restaurantId').lean();
    const foodMap = new Map(foods.map((f) => [String(f._id), f]));
    return insertBogoOffers(ids.filter((id) => foodMap.has(id)).map((id) => foodMap.get(id)), limitFields);
}

/**
 * Restaurant-wide add: every approved dish (in stock or not) of the given restaurants, or of every
 * approved restaurant with { all: true }. Dishes that are already BOGO are left as they are.
 */
export async function addBogoOffersForRestaurants({ restaurantIds, all, ...limits } = {}) {
    const limitFields = addLimitFields(limits);
    const ids = await resolveRestaurantIds({ restaurantIds, all });
    const foods = await FoodItem.find({ restaurantId: { $in: ids }, approvalStatus: 'approved' })
        .select('restaurantId')
        .sort({ restaurantId: 1, _id: -1 })
        .lean();
    return insertBogoOffers(foods, limitFields);
}

/** Restaurant-wide remove: drops every BOGO of the given restaurants, or every BOGO with { all: true }. */
export async function removeBogoOffersForRestaurants({ restaurantIds, all } = {}) {
    const filter = all === true ? {} : { restaurantId: { $in: await resolveRestaurantIds({ restaurantIds }) } };
    const result = await FoodBogoOffer.deleteMany(filter);
    await invalidateMenuCache();
    return { removed: result.deletedCount || 0 };
}

/** Adds the given food docs ({ _id, restaurantId }) that aren't BOGO yet, at the end of the list, in order. */
async function insertBogoOffers(foods, limitFields) {
    if (foods.length === 0) return { added: 0 };
    const [existing, last] = await Promise.all([
        FoodBogoOffer.find({ foodId: { $in: foods.map((f) => f._id) } }).select('foodId').lean(),
        FoodBogoOffer.findOne({}).sort({ sortOrder: -1 }).select('sortOrder').lean()
    ]);
    const existingIds = new Set(existing.map((d) => String(d.foodId)));

    let sortOrder = Number(last?.sortOrder) || 0;
    const docs = foods
        .filter((f) => !existingIds.has(String(f._id)))
        .map((f) => ({ foodId: f._id, restaurantId: f.restaurantId, ...limitFields, sortOrder: ++sortOrder }));
    if (docs.length) {
        await FoodBogoOffer.insertMany(docs, { ordered: false });
        await invalidateMenuCache();
    }
    return { added: docs.length };
}

/** Unselect all: removes the BOGO entries for the given food items. */
export async function removeBogoOffersBulk({ foodIds = [] } = {}) {
    const ids = (Array.isArray(foodIds) ? foodIds : []).map(String).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length === 0) throw new ValidationError('foodIds is required');
    const result = await FoodBogoOffer.deleteMany({ foodId: { $in: ids } });
    await invalidateMenuCache();
    return { removed: result.deletedCount || 0 };
}

export async function removeBogoOffer(id) {
    const doc = await FoodBogoOffer.findByIdAndDelete(toObjectIdOrThrow(id, 'BOGO offer id'));
    if (!doc) throw new NotFoundError('BOGO offer not found');
    await invalidateMenuCache();
    return { id: doc._id };
}

export async function updateBogoOfferOrder(id, order) {
    const sortOrder = parseInt(order, 10);
    if (Number.isNaN(sortOrder)) throw new ValidationError('order must be a number');
    const doc = await FoodBogoOffer.findByIdAndUpdate(
        toObjectIdOrThrow(id, 'BOGO offer id'),
        { sortOrder },
        { new: true }
    ).lean();
    if (!doc) throw new NotFoundError('BOGO offer not found');
    return doc;
}

/**
 * Edit one offer's limits: { useDefault: true } puts it back on the default limits; otherwise
 * { maxFreePerOrder, usageLimitPerUser } (usageLimitPerUser 0 = unlimited) become its custom limits.
 * Returns the offer with the limits it now runs with.
 */
export async function updateBogoOfferLimit(id, body = {}) {
    const update = body.useDefault === true
        ? { useCustomLimits: false }
        : { useCustomLimits: true, ...parseFullBogoLimits(body) };
    const doc = await FoodBogoOffer.findByIdAndUpdate(
        toObjectIdOrThrow(id, 'BOGO offer id'),
        update,
        { new: true }
    ).lean();
    if (!doc) throw new NotFoundError('BOGO offer not found');
    await invalidateMenuCache();
    return { ...doc, useCustomLimits: doc.useCustomLimits === true, ...effectiveBogoLimits(doc, await getBogoDefaultLimits()) };
}

export async function toggleBogoOfferStatus(id) {
    const doc = await FoodBogoOffer.findById(toObjectIdOrThrow(id, 'BOGO offer id'));
    if (!doc) throw new NotFoundError('BOGO offer not found');
    doc.isActive = !doc.isActive;
    await doc.save();
    await invalidateMenuCache();
    return doc.toObject();
}
