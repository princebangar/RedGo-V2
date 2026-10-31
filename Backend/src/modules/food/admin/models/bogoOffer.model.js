import mongoose from 'mongoose';

/**
 * Admin-curated "Buy 1 Get 1 Free" dishes.
 * The free item is always funded by the restaurant (deducted from its payout).
 */
const foodBogoOfferSchema = new mongoose.Schema(
    {
        foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true, unique: true },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        /** false = follow the admin default limits; true = the two limits below apply to this offer. */
        useCustomLimits: { type: Boolean, default: false },
        /** Most free units one order can get (1 → buy 1 get 1 once; extra units are charged). */
        maxFreePerOrder: { type: Number, default: 1, min: 1, max: 99 },
        /** Orders per user that can get this offer, ever (0 = unlimited; cancelled orders don't count). */
        usageLimitPerUser: { type: Number, default: 1, min: 0, max: 999 },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
    },
    { collection: 'food_bogo_offers', timestamps: true }
);

foodBogoOfferSchema.index({ isActive: 1, sortOrder: 1 });

export const FoodBogoOffer = mongoose.model('FoodBogoOffer', foodBogoOfferSchema);
