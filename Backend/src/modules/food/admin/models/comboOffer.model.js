import mongoose from 'mongoose';

/** Admin-curated combo dishes shown in the "Combo Offers" slider on the user home page. */
const foodComboOfferSchema = new mongoose.Schema(
    {
        foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true, unique: true },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
    },
    { collection: 'food_combo_offers', timestamps: true }
);

foodComboOfferSchema.index({ isActive: 1, sortOrder: 1 });

export const FoodComboOffer = mongoose.model('FoodComboOffer', foodComboOfferSchema);
