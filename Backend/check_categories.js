
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { FoodDiningCategory } from './src/modules/food/dining/models/diningCategory.model.js';

dotenv.config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodelo');
    const categories = await FoodDiningCategory.find({}).lean();
    fs.writeFileSync('results.txt', JSON.stringify(categories, null, 2));
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
