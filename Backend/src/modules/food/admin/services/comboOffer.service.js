import mongoose from 'mongoose';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { FoodComboOffer } from '../models/comboOffer.model.js';
import { FoodItem } from '../models/food.model.js';
import { FoodSystemConfig } from '../models/systemConfig.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodRestaurantOutletTimings } from '../../restaurant/models/outletTimings.model.js';
import { applyOtherPriceToFoods } from './otherPrice.service.js';
import { buildMenuItemFromFood } from '../../restaurant/services/restaurantMenu.service.js';
import { getFoodDisplayPrice } from './foodVariant.service.js';

const toObjectIdOrThrow = (value, label) => {
    const id = String(value || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ValidationError(`Invalid ${label}`);
    return id;
};

/** Admin list: every entry (active or not) with the dish + restaurant it points at. */
export async function listComboOffersAdmin() {
    const docs = await FoodComboOffer.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
    if (docs.length === 0) return [];

    const [foods, restaurants] = await Promise.all([
        FoodItem.find({ _id: { $in: docs.map((d) => d.foodId) } })
            .select('name description image price variants foodType isAvailable approvalStatus restaurantId')
            .lean(),
        FoodRestaurant.find({ _id: { $in: docs.map((d) => d.restaurantId) } })
            .select('restaurantName area city status')
            .lean()
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

// What restaurants usually call their combo items: an "Offer"/"Combo"/"Deal" category, or a dish
// name like "Burger + Fries" / "Family Meal Combo".
const OFFER_CATEGORY_PATTERN = 'offer|combo|deal|meal|special';
const OFFER_NAME_PATTERN = 'combo|offer|deal|meal|free|buy|\\+';

/**
 * Approved dishes the admin can pick from (search by dish, category or restaurant name).
 * onlyOffers=true (default) limits it to items restaurants have created as offers / combos.
 */
export async function searchComboCandidateFoods({ search = '', restaurantId = '', onlyOffers = 'true' } = {}) {
    const filter = { approvalStatus: 'approved' };
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
        filter.restaurantId = restaurantId;
    }
    if (String(onlyOffers) !== 'false') {
        filter.$and = [{
            $or: [
                { categoryName: { $regex: OFFER_CATEGORY_PATTERN, $options: 'i' } },
                { name: { $regex: OFFER_NAME_PATTERN, $options: 'i' } }
            ]
        }];
    }
    const term = String(search || '').trim();
    if (term) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matchingRestaurants = await FoodRestaurant.find({ restaurantName: { $regex: escaped, $options: 'i' } })
            .select('_id')
            .limit(50)
            .lean();
        filter.$or = [
            { name: { $regex: escaped, $options: 'i' } },
            { categoryName: { $regex: escaped, $options: 'i' } },
            ...(matchingRestaurants.length ? [{ restaurantId: { $in: matchingRestaurants.map((r) => r._id) } }] : [])
        ];
    }

    const foods = await FoodItem.find(filter)
        .select('name description image price variants foodType isAvailable categoryName restaurantId')
        .sort({ restaurantId: 1, _id: -1 })
        .limit(200)
        .lean();
    const restaurants = await FoodRestaurant.find({ _id: { $in: foods.map((f) => f.restaurantId) } })
        .select('restaurantName')
        .lean();
    const restaurantMap = new Map(restaurants.map((r) => [String(r._id), r.restaurantName]));

    return foods.map((f) => ({
        _id: f._id,
        name: f.name,
        description: f.description || '',
        image: f.image || '',
        price: getFoodDisplayPrice(f),
        foodType: f.foodType || 'Non-Veg',
        categoryName: f.categoryName || '',
        isAvailable: f.isAvailable !== false,
        restaurantId: f.restaurantId,
        restaurantName: restaurantMap.get(String(f.restaurantId)) || 'Unknown Restaurant'
    }));
}

export async function addComboOffer({ foodId } = {}) {
    const id = toObjectIdOrThrow(foodId, 'food id');
    const food = await FoodItem.findById(id).select('restaurantId approvalStatus').lean();
    if (!food) throw new NotFoundError('Food item not found');
    if (food.approvalStatus !== 'approved') throw new ValidationError('Only approved food items can be added as combo offers');
    if (await FoodComboOffer.exists({ foodId: id })) throw new ValidationError('This item is already a combo offer');

    const last = await FoodComboOffer.findOne({}).sort({ sortOrder: -1 }).select('sortOrder').lean();
    const doc = await FoodComboOffer.create({
        foodId: id,
        restaurantId: food.restaurantId,
        sortOrder: (Number(last?.sortOrder) || 0) + 1
    });
    return doc.toObject();
}

/** Select all: adds every approved item in foodIds that isn't a combo yet, keeping the given order. */
export async function addComboOffersBulk({ foodIds = [] } = {}) {
    const ids = [...new Set((Array.isArray(foodIds) ? foodIds : []).map(String))].filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
    );
    if (ids.length === 0) throw new ValidationError('foodIds is required');

    const [foods, existing, last] = await Promise.all([
        FoodItem.find({ _id: { $in: ids }, approvalStatus: 'approved' }).select('restaurantId').lean(),
        FoodComboOffer.find({ foodId: { $in: ids } }).select('foodId').lean(),
        FoodComboOffer.findOne({}).sort({ sortOrder: -1 }).select('sortOrder').lean()
    ]);
    const existingIds = new Set(existing.map((d) => String(d.foodId)));
    const foodMap = new Map(foods.map((f) => [String(f._id), f]));

    let sortOrder = Number(last?.sortOrder) || 0;
    const docs = ids
        .filter((id) => foodMap.has(id) && !existingIds.has(id))
        .map((id) => ({ foodId: id, restaurantId: foodMap.get(id).restaurantId, sortOrder: ++sortOrder }));
    if (docs.length) await FoodComboOffer.insertMany(docs, { ordered: false });
    return { added: docs.length };
}

/** Unselect all: removes the combo entries for the given food items. */
export async function removeComboOffersBulk({ foodIds = [] } = {}) {
    const ids = (Array.isArray(foodIds) ? foodIds : []).map(String).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length === 0) throw new ValidationError('foodIds is required');
    const result = await FoodComboOffer.deleteMany({ foodId: { $in: ids } });
    return { removed: result.deletedCount || 0 };
}

export async function removeComboOffer(id) {
    const doc = await FoodComboOffer.findByIdAndDelete(toObjectIdOrThrow(id, 'combo offer id'));
    if (!doc) throw new NotFoundError('Combo offer not found');
    return { id: doc._id };
}

export async function updateComboOfferOrder(id, order) {
    const sortOrder = parseInt(order, 10);
    if (Number.isNaN(sortOrder)) throw new ValidationError('order must be a number');
    const doc = await FoodComboOffer.findByIdAndUpdate(
        toObjectIdOrThrow(id, 'combo offer id'),
        { sortOrder },
        { new: true }
    ).lean();
    if (!doc) throw new NotFoundError('Combo offer not found');
    return doc;
}

export async function toggleComboOfferStatus(id) {
    const doc = await FoodComboOffer.findById(toObjectIdOrThrow(id, 'combo offer id'));
    if (!doc) throw new NotFoundError('Combo offer not found');
    doc.isActive = !doc.isActive;
    await doc.save();
    return doc.toObject();
}

/**
 * User app: active combos whose dish is approved + available and whose restaurant is approved
 * (and in the user's zone when zoneId is given). Prices include admin markup, same as the menu.
 * Open/closed is left to the client, which already knows how to read outlet timings.
 */
export async function getPublicComboOffers({ zoneId = '' } = {}) {
    // Admin → Customization Settings → "Combo Offers". No doc yet = default ON.
    const toggle = await FoodSystemConfig.findOne({ key: 'combo_offers_enabled' }).select('value').lean();
    if (toggle && toggle.value !== true) return [];

    const docs = await FoodComboOffer.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
    if (docs.length === 0) return [];

    const restaurantFilter = { _id: { $in: docs.map((d) => d.restaurantId) }, status: 'approved' };
    const zone = String(zoneId || '').trim();
    if (zone && mongoose.Types.ObjectId.isValid(zone)) restaurantFilter.zoneId = zone;

    const [foods, restaurants] = await Promise.all([
        FoodItem.find({ _id: { $in: docs.map((d) => d.foodId) }, approvalStatus: 'approved', isAvailable: { $ne: false } })
            .select('-oldData -newData')
            .lean(),
        FoodRestaurant.find(restaurantFilter)
            .select('restaurantName slug profileImage area city pureVegRestaurant isAcceptingOrders isActive openingTime closingTime openDays zoneId')
            .lean()
    ]);
    if (foods.length === 0 || restaurants.length === 0) return [];

    const timingDocs = await FoodRestaurantOutletTimings.find({ restaurantId: { $in: restaurants.map((r) => r._id) } }).lean();
    const timingsMap = new Map(timingDocs.map((t) => [String(t.restaurantId), t.timings || []]));
    const restaurantMap = new Map(restaurants.map((r) => [String(r._id), r]));

    const pricedFoods = await applyOtherPriceToFoods(foods);
    const foodMap = new Map(
        foods.map((food, i) => [
            String(food._id),
            buildMenuItemFromFood(food, pricedFoods[i], food.categoryName || '', food.categoryId ? String(food.categoryId) : null)
        ])
    );

    return docs
        .map((d) => {
            const item = foodMap.get(String(d.foodId));
            const r = restaurantMap.get(String(d.restaurantId));
            if (!item || !r) return null;
            return {
                _id: d._id,
                item,
                restaurant: {
                    _id: r._id,
                    name: r.restaurantName,
                    slug: r.slug || '',
                    profileImage: r.profileImage || '',
                    area: r.area || '',
                    city: r.city || '',
                    pureVegRestaurant: r.pureVegRestaurant === true,
                    isAcceptingOrders: r.isAcceptingOrders,
                    isActive: r.isActive,
                    openingTime: r.openingTime,
                    closingTime: r.closingTime,
                    openDays: r.openDays || [],
                    zoneId: r.zoneId || null,
                    outletTimings: { timings: timingsMap.get(String(r._id)) || [] }
                }
            };
        })
        .filter(Boolean);
}
