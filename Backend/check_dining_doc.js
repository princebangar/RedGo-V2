
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { FoodDiningRestaurant } from './src/modules/food/dining/models/diningRestaurant.model.js';

dotenv.config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Redgo');
    const doc = await FoodDiningRestaurant.findOne({ restaurantId: '69b8f156f1ecccbb2e25d030' }).lean();
    fs.writeFileSync('dining_doc_result.txt', JSON.stringify(doc, null, 2));
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
