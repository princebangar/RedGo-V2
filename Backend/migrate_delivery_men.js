import fs from 'fs';
import readline from 'readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodDeliveryPartner } from './src/modules/food/delivery/models/deliveryPartner.model.js';
import { FoodDeliveryWallet } from './src/modules/food/delivery/models/deliveryWallet.model.js';

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

// Phone parser utility
function parsePhone(rawPhone) {
    if (!rawPhone) return { phone: '', countryCode: '+91' };
    const cleaned = rawPhone.toString().replace(/[\s\(\)\-]/g, '').trim();
    if (cleaned.startsWith('+')) {
        if (cleaned.startsWith('+91')) {
            return {
                phone: cleaned.substring(3).replace(/\D/g, ''),
                countryCode: '+91'
            };
        }
        const digits = cleaned.substring(1).replace(/\D/g, '');
        if (digits.length > 10) {
            const offset = digits.length - 10;
            return {
                phone: digits.substring(offset),
                countryCode: '+' + digits.substring(0, offset)
            };
        } else {
            return {
                phone: digits,
                countryCode: '+91'
            };
        }
    } else {
        const digits = cleaned.replace(/\D/g, '');
        if (digits.length > 10) {
            const offset = digits.length - 10;
            return {
                phone: digits.substring(offset),
                countryCode: '+' + digits.substring(0, offset)
            };
        } else {
            return {
                phone: digits,
                countryCode: '+91'
            };
        }
    }
}

async function runMigration() {
    const dbUri = process.env.MONGODB_URI || 'mongodb+srv://shubham:Shubham%40123@cluster0.3z3l0ia.mongodb.net/Redgo';
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(dbUri);
    console.log('MongoDB Connected successfully.');

    const csvPath = '../delivery_men.csv';
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

    console.log('Reading CSV file...');
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

    // Field value helper
    const getVal = (row, fieldName) => {
        const idx = headerIndex[fieldName];
        return idx !== undefined ? row[idx] : null;
    };

    // First pass: Parse and de-duplicate by phone number
    const phoneMap = new Map(); // phone -> partnerObj

    for (const row of rawRows) {
        const legacyId = getVal(row, 'id');
        const f_name = getVal(row, 'f_name') || '';
        const l_name = getVal(row, 'l_name') || '';
        const name = `${f_name} ${l_name}`.trim();
        const email = (getVal(row, 'email') || '').trim().toLowerCase();
        const rawPhone = getVal(row, 'phone');
        const image = getVal(row, 'image') || '';
        const identityNumber = getVal(row, 'identity_number') || '';
        const identityType = getVal(row, 'identity_type') || '';
        const rawIdentityImage = getVal(row, 'identity_image') || '';
        const fcmToken = getVal(row, 'fcm_token');
        const appStatus = getVal(row, 'application_status') || 'pending';
        const active = getVal(row, 'active') === '1';
        const earning = parseFloat(getVal(row, 'earning')) || 0;
        const orderCount = parseInt(getVal(row, 'order_count')) || 0;
        const createdAt = getVal(row, 'created_at');
        const updatedAt = getVal(row, 'updated_at');

        const { phone, countryCode } = parsePhone(rawPhone);

        if (!phone) {
            // Skip invalid phone numbers
            continue;
        }

        // Parse Identity image JSON: e.g. [{"img":"...","storage":"..."}]
        let identityImage = '';
        if (rawIdentityImage) {
            try {
                const cleanJson = rawIdentityImage.replace(/\"\"/g, '"');
                const parsed = JSON.parse(cleanJson);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    identityImage = parsed[0].img || '';
                }
            } catch (e) {
                identityImage = rawIdentityImage;
            }
        }

        // Map status and active state
        let status = 'pending';
        if (appStatus === 'approved') status = 'approved';
        else if (appStatus === 'denied') status = 'rejected';

        const availabilityStatus = active ? 'online' : 'offline';
        const fcmTokens = fcmToken ? [fcmToken] : [];

        // Build base schema fields
        const partnerDoc = {
            _id: new mongoose.Types.ObjectId(),
            legacyId,
            name,
            phone,
            countryCode,
            email: email || null,
            profilePhoto: image,
            status,
            availabilityStatus,
            fcmTokens,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
            updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
            // Temporary fields for wallet creation
            earning,
            orderCount
        };

        // Assign credentials based on identity_type
        if (identityType === 'driving_license') {
            partnerDoc.drivingLicenseNumber = identityNumber;
            partnerDoc.drivingLicensePhoto = identityImage;
        } else if (identityType === 'nid' || identityType === 'passport') {
            partnerDoc.aadharNumber = identityNumber;
            partnerDoc.aadharPhoto = identityImage;
        }

        // Keep the newer record if duplicate phone
        if (phoneMap.has(phone)) {
            const existing = phoneMap.get(phone);
            if (partnerDoc.updatedAt > existing.updatedAt) {
                phoneMap.set(phone, partnerDoc);
            }
        } else {
            phoneMap.set(phone, partnerDoc);
        }
    }

    const uniquePartners = Array.from(phoneMap.values());
    console.log(`De-duplicated to ${uniquePartners.length} unique delivery partners by phone.`);

    const existingCount = await FoodDeliveryPartner.countDocuments();
    console.log(`Current delivery partners in DB: ${existingCount}`);

    // Load existing phone numbers from DB
    const existingPhones = new Set(
        (await FoodDeliveryPartner.find({}, { phone: 1 }).lean()).map(p => p.phone)
    );
    console.log(`Loaded ${existingPhones.size} existing phone numbers from DB.`);

    const partnersToInsert = uniquePartners.filter(p => !existingPhones.has(p.phone));
    console.log(`Delivery partners to insert (excluding duplicates): ${partnersToInsert.length}`);

    // Prepare clean documents
    const cleanPartnersToInsert = partnersToInsert.map(p => {
        const doc = { ...p };
        delete doc.earning;
        delete doc.orderCount;
        delete doc.legacyId; // Not in schema, clean it
        return doc;
    });

    // Batch insert delivery partners
    const batchSize = 500;
    let insertedPartnersCount = 0;
    let insertedWalletsCount = 0;

    for (let i = 0; i < cleanPartnersToInsert.length; i += batchSize) {
        const batch = cleanPartnersToInsert.slice(i, i + batchSize);
        await FoodDeliveryPartner.collection.insertMany(batch);
        insertedPartnersCount += batch.length;
        console.log(`Inserted ${insertedPartnersCount}/${cleanPartnersToInsert.length} delivery partners...`);
    }

    // Now insert wallets
    console.log('Preparing wallet documents...');
    const walletsToInsert = [];
    partnersToInsert.forEach(p => {
        walletsToInsert.push({
            deliveryPartnerId: p._id,
            balance: p.earning,
            totalEarnings: p.earning,
            totalDeliveries: p.orderCount,
            lockedAmount: 0,
            cashInHand: 0,
            totalBonus: 0,
            totalSettled: 0
        });
    });

    console.log(`Wallets to insert: ${walletsToInsert.length}`);
    for (let i = 0; i < walletsToInsert.length; i += batchSize) {
        const batch = walletsToInsert.slice(i, i + batchSize);
        await FoodDeliveryWallet.collection.insertMany(batch);
        insertedWalletsCount += batch.length;
        console.log(`Inserted ${insertedWalletsCount}/${walletsToInsert.length} wallets...`);
    }

    console.log('Migration Completed successfully!');
    console.log(`---------------------------------`);
    console.log(`Total CSV Rows: ${rawRows.length}`);
    console.log(`Unique Partners (by phone): ${uniquePartners.length}`);
    console.log(`Existing partners in DB: ${existingPhones.size}`);
    console.log(`New Partners Inserted: ${insertedPartnersCount}`);
    console.log(`New Wallets Inserted: ${insertedWalletsCount}`);
    console.log(`---------------------------------`);

    await mongoose.disconnect();
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    mongoose.disconnect();
});
