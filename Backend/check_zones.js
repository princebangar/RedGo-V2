import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodZone } from './src/modules/food/admin/models/zone.model.js';

dotenv.config();

async function run() {
    const dbUri = process.env.MONGODB_URI || 'mongodb+srv://shubham:Shubham%40123@cluster0.3z3l0ia.mongodb.net/Redgo';
    await mongoose.connect(dbUri);
    const zones = await FoodZone.find({}).lean();
    console.log('Zones in MongoDB:', zones.map(z => ({ id: z._id, name: z.name, zoneName: z.zoneName })));
    await mongoose.disconnect();
}

run().catch(console.error);
