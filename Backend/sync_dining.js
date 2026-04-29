
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodDiningCategory } from './src/modules/food/dining/models/diningCategory.model.js';
import { FoodDiningRestaurant } from './src/modules/food/dining/models/diningRestaurant.model.js';

dotenv.config();

async function sync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodelo');
    
    const categories = await FoodDiningCategory.find({}).lean();
    console.log(`Found ${categories.length} categories.`);

    for (const category of categories) {
      if (category.restaurantIds && category.restaurantIds.length > 0) {
        console.log(`Processing category: ${category.name} (${category.slug}) with ${category.restaurantIds.length} restaurants.`);
        
        for (const restaurantId of category.restaurantIds) {
          const diningDoc = await FoodDiningRestaurant.findOne({ restaurantId });
          if (diningDoc) {
            const hasCategory = diningDoc.categoryIds.some(id => String(id) === String(category._id));
            if (!hasCategory) {
              console.log(`Adding category ${category.name} to restaurant ${restaurantId}`);
              diningDoc.categoryIds.push(category._id);
              if (!diningDoc.primaryCategoryId) {
                diningDoc.primaryCategoryId = category._id;
              }
              await diningDoc.save();
            }
          } else {
            console.log(`Creating missing dining doc for restaurant ${restaurantId}`);
            await FoodDiningRestaurant.create({
              restaurantId,
              categoryIds: [category._id],
              primaryCategoryId: category._id,
              isEnabled: true
            });
          }
        }
      }
    }
    
    console.log('Sync completed.');
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

sync();
