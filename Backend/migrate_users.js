import fs from 'fs';
import readline from 'readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodUser } from './src/core/users/user.model.js';
import { FoodUserWallet } from './src/modules/food/user/models/userWallet.model.js';

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

    const csvPath = '../users.csv';
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

    // We need to map field helper
    const getVal = (row, fieldName) => {
        const idx = headerIndex[fieldName];
        return idx !== undefined ? row[idx] : null;
    };

    // First pass: parse users and group by phone to de-duplicate
    const phoneMap = new Map(); // phone -> userObj

    for (const row of rawRows) {
        const legacyId = getVal(row, 'id');
        const f_name = getVal(row, 'f_name') || '';
        const l_name = getVal(row, 'l_name') || '';
        const name = `${f_name} ${l_name}`.trim();
        const email = (getVal(row, 'email') || '').trim().toLowerCase();
        const rawPhone = getVal(row, 'phone');
        const image = getVal(row, 'image') || '';
        const isPhoneVerified = getVal(row, 'is_phone_verified') === '1';
        const status = getVal(row, 'status') === '1';
        const refCode = getVal(row, 'ref_code');
        const firebaseToken = getVal(row, 'cm_firebase_token');
        const createdAt = getVal(row, 'created_at');
        const updatedAt = getVal(row, 'updated_at');
        const walletBalance = parseFloat(getVal(row, 'wallet_balance')) || 0;

        const { phone, countryCode } = parsePhone(rawPhone);

        if (!phone) {
            // Skip invalid phone number records
            continue;
        }

        const fcmTokens = firebaseToken && firebaseToken !== '@' ? [firebaseToken] : [];

        const userDoc = {
            _id: new mongoose.Types.ObjectId(),
            legacyId,
            phone,
            countryCode,
            name,
            email: email || null,
            profileImage: image,
            fcmTokens,
            isVerified: isPhoneVerified,
            isActive: status,
            referralCode: refCode || null,
            referredBy: null, // to be populated
            referralCount: 0, // to be computed
            role: 'USER',
            createdAt: createdAt ? new Date(createdAt) : new Date(),
            updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
            walletBalance // temporary field for wallet creation
        };

        // If duplicate phone number, keep the newer one based on updatedAt
        if (phoneMap.has(phone)) {
            const existing = phoneMap.get(phone);
            if (userDoc.updatedAt > existing.updatedAt) {
                phoneMap.set(phone, userDoc);
            }
        } else {
            phoneMap.set(phone, userDoc);
        }
    }

    const uniqueUsers = Array.from(phoneMap.values());
    console.log(`De-duplicated to ${uniqueUsers.length} unique users by phone.`);

    // Build lookup maps
    const legacyIdToMongoId = new Map();
    const refCodeToMongoId = new Map();
    uniqueUsers.forEach(user => {
        legacyIdToMongoId.set(user.legacyId, user._id);
        if (user.referralCode) {
            refCodeToMongoId.set(user.referralCode, user._id);
        }
    });

    // Populate referredBy and referralCount
    const refCounts = new Map(); // mongoId -> count

    uniqueUsers.forEach(user => {
        // Find who referred this user
        const originalRow = rawRows.find(r => getVal(r, 'id') === user.legacyId);
        if (originalRow) {
            const refByLegacyIdOrCode = getVal(originalRow, 'ref_by');
            if (refByLegacyIdOrCode) {
                let referrerMongoId = legacyIdToMongoId.get(refByLegacyIdOrCode);
                if (!referrerMongoId) {
                    referrerMongoId = refCodeToMongoId.get(refByLegacyIdOrCode);
                }

                if (referrerMongoId) {
                    user.referredBy = referrerMongoId;
                    refCounts.set(referrerMongoId.toString(), (refCounts.get(referrerMongoId.toString()) || 0) + 1);
                }
            }
        }
    });

    // Set referralCount on each user
    uniqueUsers.forEach(user => {
        user.referralCount = refCounts.get(user._id.toString()) || 0;
    });

    const existingUsersCount = await FoodUser.countDocuments();
    console.log(`Current users in food_users collection: ${existingUsersCount}`);

    // Load existing phone numbers from DB to prevent duplicate key errors
    const existingPhones = new Set(
        (await FoodUser.find({}, { phone: 1 }).lean()).map(u => u.phone)
    );
    console.log(`Loaded ${existingPhones.size} existing phone numbers from DB.`);

    const usersToInsert = uniqueUsers.filter(u => !existingPhones.has(u.phone));
    console.log(`Users to insert (excluding duplicates already in DB): ${usersToInsert.length}`);

    // Prepare clean user documents for insertion (remove temporary fields if desired, or keep legacyId)
    const cleanUsersToInsert = usersToInsert.map(u => {
        const cleanUser = { ...u };
        delete cleanUser.walletBalance;
        return cleanUser;
    });

    // Insert users in batches
    const batchSize = 1000;
    let insertedUsersCount = 0;
    let insertedWalletsCount = 0;

    for (let i = 0; i < cleanUsersToInsert.length; i += batchSize) {
        const batch = cleanUsersToInsert.slice(i, i + batchSize);
        await FoodUser.collection.insertMany(batch);
        insertedUsersCount += batch.length;
        console.log(`Inserted ${insertedUsersCount}/${cleanUsersToInsert.length} users...`);
    }

    // Now prepare and insert wallets for users with non-zero balances
    console.log('Preparing wallet documents...');
    const walletsToInsert = [];
    usersToInsert.forEach(user => {
        if (user.walletBalance > 0) {
            walletsToInsert.push({
                userId: user._id,
                balance: user.walletBalance,
                referralEarnings: 0,
                transactions: []
            });
        }
    });

    console.log(`Wallets to insert: ${walletsToInsert.length}`);
    for (let i = 0; i < walletsToInsert.length; i += batchSize) {
        const batch = walletsToInsert.slice(i, i + batchSize);
        await FoodUserWallet.collection.insertMany(batch);
        insertedWalletsCount += batch.length;
        console.log(`Inserted ${insertedWalletsCount}/${walletsToInsert.length} wallets...`);
    }

    console.log('Migration Completed successfully!');
    console.log(`---------------------------------`);
    console.log(`Total CSV Rows: ${rawRows.length}`);
    console.log(`Unique Users (by phone): ${uniqueUsers.length}`);
    console.log(`Existing users in DB: ${existingPhones.size}`);
    console.log(`New Users Inserted: ${insertedUsersCount}`);
    console.log(`New Wallets Inserted: ${insertedWalletsCount}`);
    console.log(`---------------------------------`);

    await mongoose.disconnect();
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    mongoose.disconnect();
});
