
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';

dotenv.config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Redgo');
    const restaurant = await FoodRestaurant.findById('69b8f156f1ecccbb2e25d030').lean();
    fs.writeFileSync('restaurant_result.txt', JSON.stringify(restaurant, null, 2));
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
