import fs from 'fs';
import readline from 'readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';
import { FoodRestaurantWallet } from './src/modules/food/restaurant/models/restaurantWallet.model.js';
import { FoodZone } from './src/modules/food/admin/models/zone.model.js';

dotenv.config();

// CSV Line Parser
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current === 'NULL' || current === 'null' ? null : current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current === 'NULL' || current === 'null' ? null : current);
    return result;
}

// Normalization utilities to replicate Mongoose pre-validate hook for bulk insert
function normalizeName(name) {
    if (!name) return undefined;
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(phone) {
    if (!phone) return { digits: undefined, last10: undefined };
    const digits = String(phone).replace(/\D/g, '').slice(-15);
    return {
        digits: digits || undefined,
        last10: digits ? digits.slice(-10) : undefined
    };
}

async function runMigration() {
    const dbUri = process.env.MONGODB_URI || 'mongodb+srv://shubham:Shubham%40123@cluster0.3z3l0ia.mongodb.net/Redgo';
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(dbUri);
    console.log('MongoDB Connected successfully.');

    // Attempt to grab a fallback zone for restaurants (optional but helps with visibility)
    const fallbackZone = await FoodZone.findOne({ isActive: true }).lean();
    console.log(`Fallback Zone ID will be: ${fallbackZone ? fallbackZone._id : 'None'}`);

    const csvPath = '../stores.csv';
    if (!fs.existsSync(csvPath)) {
        console.error(`CSV file not found at ${csvPath}`);
        process.exit(1);
    }

    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let headerIndex = {};
    let isHeader = true;
    const rawRows = [];

    console.log('Reading stores.csv file...');
    for await (const line of rl) {
        if (isHeader) {
            const headers = parseCsvLine(line);
            headers.forEach((h, idx) => {
                headerIndex[h] = idx;
            });
            isHeader = false;
            continue;
        }
        if (!line.trim()) continue;
        const row = parseCsvLine(line);
        rawRows.push(row);
    }

    console.log(`Total rows read from CSV: ${rawRows.length}`);

    const getVal = (row, fieldName) => {
        const idx = headerIndex[fieldName];
        return idx !== undefined ? row[idx] : null;
    };

    const uniqueMap = new Map(); // key -> document

    for (const row of rawRows) {
        const name = getVal(row, 'name') || 'Unnamed Restaurant';
        const phone = getVal(row, 'phone') || '';
        const email = getVal(row, 'email') || '';
        const logo = getVal(row, 'logo') || '';
        const coverPhoto = getVal(row, 'cover_photo') || '';
        const address = getVal(row, 'address') || '';
        const rawLat = parseFloat(getVal(row, 'latitude'));
        const rawLng = parseFloat(getVal(row, 'longitude'));
        const status = getVal(row, 'status') === '1' ? 'approved' : 'pending';
        const active = getVal(row, 'active') === '1';
        const veg = getVal(row, 'veg') === '1';
        const nonVeg = getVal(row, 'non_veg') === '1';
        const takeAway = getVal(row, 'take_away') === '1';
        const deliveryTime = getVal(row, 'delivery_time') || '';
        const businessModel = getVal(row, 'store_business_model') || 'commission';
        const createdAt = getVal(row, 'created_at');
        const updatedAt = getVal(row, 'updated_at');

        // Apply pre-validation normalization
        const restaurantNameNormalized = normalizeName(name);
        const { digits: ownerPhoneDigits, last10: ownerPhoneLast10 } = normalizePhone(phone);
        
        // GeoJSON Location
        const lat = Number.isFinite(rawLat) ? rawLat : 0;
        const lng = Number.isFinite(rawLng) ? rawLng : 0;

        // Estimated delivery time minutes
        let estimatedDeliveryTimeMinutes = 0;
        const match = deliveryTime.match(/(\d{1,3})/);
        if (match) {
            estimatedDeliveryTimeMinutes = parseInt(match[1], 10);
        }

        const restaurantDoc = {
            _id: new mongoose.Types.ObjectId(),
            restaurantName: name,
            ownerName: `${name} Owner`,
            ownerEmail: email,
            ownerPhone: phone,
            primaryContactNumber: phone,
            restaurantNameNormalized,
            ownerPhoneDigits,
            ownerPhoneLast10,
            pureVegRestaurant: veg && !nonVeg,
            addressLine1: address,
            isAcceptingOrders: active,
            profileImage: logo,
            coverImages: coverPhoto ? [coverPhoto] : [],
            location: {
                type: 'Point',
                coordinates: [lng, lat],
                latitude: lat,
                longitude: lng,
                address: address,
                formattedAddress: address
            },
            businessModel,
            estimatedDeliveryTime: deliveryTime,
            estimatedDeliveryTimeMinutes,
            takeawaySettings: {
                isEnabled: takeAway
            },
            status,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
            updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
        };

        if (fallbackZone) {
            restaurantDoc.zoneId = fallbackZone._id;
        }

        // De-duplicate locally using the unique index constraints (name + phone)
        const uniqueKey = `${restaurantNameNormalized}_${ownerPhoneLast10 || 'no_phone'}`;
        if (uniqueMap.has(uniqueKey)) {
            const existing = uniqueMap.get(uniqueKey);
            if (restaurantDoc.updatedAt > existing.updatedAt) {
                uniqueMap.set(uniqueKey, restaurantDoc);
            }
        } else {
            uniqueMap.set(uniqueKey, restaurantDoc);
        }
    }

    const uniqueRestaurants = Array.from(uniqueMap.values());
    console.log(`De-duplicated to ${uniqueRestaurants.length} unique restaurants.`);

    // Load existing unique keys from DB to prevent unique index violation
    const existingDocs = await FoodRestaurant.find({}, { restaurantNameNormalized: 1, ownerPhoneLast10: 1 }).lean();
    const existingKeys = new Set(
        existingDocs
            .filter(d => d.restaurantNameNormalized && d.ownerPhoneLast10)
            .map(d => `${d.restaurantNameNormalized}_${d.ownerPhoneLast10}`)
    );
    console.log(`Loaded ${existingKeys.size} existing restaurant keys from DB.`);

    const restaurantsToInsert = uniqueRestaurants.filter(r => !existingKeys.has(`${r.restaurantNameNormalized}_${r.ownerPhoneLast10 || 'no_phone'}`));
    console.log(`Restaurants to insert (excluding duplicates): ${restaurantsToInsert.length}`);

    let insertedRestaurantsCount = 0;
    let insertedWalletsCount = 0;
    const batchSize = 100;

    for (let i = 0; i < restaurantsToInsert.length; i += batchSize) {
        const batch = restaurantsToInsert.slice(i, i + batchSize);
        await FoodRestaurant.collection.insertMany(batch);
        insertedRestaurantsCount += batch.length;
        console.log(`Inserted ${insertedRestaurantsCount}/${restaurantsToInsert.length} restaurants...`);
    }

    // Now insert wallets
    console.log('Preparing wallet documents...');
    const walletsToInsert = restaurantsToInsert.map(r => ({
        restaurantId: r._id,
        balance: 0,
        lockedAmount: 0,
        totalEarnings: 0,
        totalSettled: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    }));

    console.log(`Wallets to insert: ${walletsToInsert.length}`);
    for (let i = 0; i < walletsToInsert.length; i += batchSize) {
        const batch = walletsToInsert.slice(i, i + batchSize);
        await FoodRestaurantWallet.collection.insertMany(batch);
        insertedWalletsCount += batch.length;
        console.log(`Inserted ${insertedWalletsCount}/${walletsToInsert.length} wallets...`);
    }

    console.log('Migration Completed successfully!');
    console.log(`---------------------------------`);
    console.log(`Total CSV Rows: ${rawRows.length}`);
    console.log(`Unique Restaurants: ${uniqueRestaurants.length}`);
    console.log(`Existing in DB: ${existingKeys.size}`);
    console.log(`New Restaurants Inserted: ${insertedRestaurantsCount}`);
    console.log(`New Wallets Inserted: ${insertedWalletsCount}`);
    console.log(`---------------------------------`);

    await mongoose.disconnect();
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    mongoose.disconnect();
});
