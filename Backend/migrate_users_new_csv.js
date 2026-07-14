import fs from 'fs';
import readline from 'readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodUser } from './src/core/users/user.model.js';
import { FoodUserWallet } from './src/modules/food/user/models/userWallet.model.js';

dotenv.config();

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

function parsePhone(rawPhone) {
    if (!rawPhone) return { phone: '', countryCode: '+91' };

    const cleaned = String(rawPhone).replace(/[\s()-]/g, '').trim();
    let digits = cleaned.startsWith('+') ? cleaned.slice(1).replace(/\D/g, '') : cleaned.replace(/\D/g, '');

    if (!digits) return { phone: '', countryCode: '+91' };

    if (digits.length > 10) {
        const countryDigits = digits.slice(0, digits.length - 10);
        const phoneDigits = digits.slice(-10);
        return {
            phone: phoneDigits,
            countryCode: countryDigits ? `+${countryDigits}` : '+91'
        };
    }

    return {
        phone: digits,
        countryCode: '+91'
    };
}

async function runMigration() {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
        throw new Error('Missing MONGODB_URI in environment');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(dbUri);
    console.log('MongoDB connected successfully.');

    const csvPath = '../users-new (1).csv';
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found at ${csvPath}`);
    }

    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let headerIndex = {};
    let isHeader = true;
    const rawRows = [];

    console.log('Reading users-new (1).csv...');
    for await (const line of rl) {
        if (isHeader) {
            const headers = parseCsvLine(line);
            headers.forEach((header, index) => {
                headerIndex[header] = index;
            });
            isHeader = false;
            continue;
        }

        if (!line.trim()) continue;
        rawRows.push(parseCsvLine(line));
    }

    console.log(`Total rows read from CSV: ${rawRows.length}`);

    const getVal = (row, fieldName) => {
        const idx = headerIndex[fieldName];
        return idx !== undefined ? row[idx] : null;
    };

    const phoneMap = new Map();
    let invalidPhoneRows = 0;

    for (const row of rawRows) {
        const legacyId = getVal(row, 'id');
        const fName = getVal(row, 'f_name') || '';
        const lName = getVal(row, 'l_name') || '';
        const name = `${fName} ${lName}`.trim();
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
        if (!phone || phone.length !== 10) {
            invalidPhoneRows++;
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
            referredBy: null,
            referralCount: 0,
            role: 'USER',
            createdAt: createdAt ? new Date(createdAt) : new Date(),
            updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
            walletBalance
        };

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
    console.log(`Invalid phone rows skipped: ${invalidPhoneRows}`);

    const legacyIdToMongoId = new Map();
    const refCodeToMongoId = new Map();
    uniqueUsers.forEach((user) => {
        legacyIdToMongoId.set(user.legacyId, user._id);
        if (user.referralCode) {
            refCodeToMongoId.set(user.referralCode, user._id);
        }
    });

    const refCounts = new Map();
    uniqueUsers.forEach((user) => {
        const originalRow = rawRows.find((row) => getVal(row, 'id') === user.legacyId);
        if (!originalRow) return;

        const refByLegacyIdOrCode = getVal(originalRow, 'ref_by');
        if (!refByLegacyIdOrCode) return;

        let referrerMongoId = legacyIdToMongoId.get(refByLegacyIdOrCode);
        if (!referrerMongoId) {
            referrerMongoId = refCodeToMongoId.get(refByLegacyIdOrCode);
        }

        if (referrerMongoId) {
            user.referredBy = referrerMongoId;
            const key = referrerMongoId.toString();
            refCounts.set(key, (refCounts.get(key) || 0) + 1);
        }
    });

    uniqueUsers.forEach((user) => {
        user.referralCount = refCounts.get(user._id.toString()) || 0;
    });

    const existingPhones = new Set(
        (await FoodUser.find({}, { phone: 1 }).lean()).map((user) => user.phone)
    );
    console.log(`Loaded ${existingPhones.size} existing phone numbers from DB.`);

    const usersToInsert = uniqueUsers.filter((user) => !existingPhones.has(user.phone));
    console.log(`Users to insert: ${usersToInsert.length}`);

    const cleanUsersToInsert = usersToInsert.map((user) => {
        const cleanUser = { ...user };
        delete cleanUser.walletBalance;
        return cleanUser;
    });

    const batchSize = 1000;
    let insertedUsersCount = 0;
    let insertedWalletsCount = 0;

    for (let i = 0; i < cleanUsersToInsert.length; i += batchSize) {
        const batch = cleanUsersToInsert.slice(i, i + batchSize);
        await FoodUser.collection.insertMany(batch);
        insertedUsersCount += batch.length;
        console.log(`Inserted ${insertedUsersCount}/${cleanUsersToInsert.length} users...`);
    }

    const walletsToInsert = usersToInsert
        .filter((user) => user.walletBalance > 0)
        .map((user) => ({
            userId: user._id,
            balance: user.walletBalance,
            referralEarnings: 0,
            transactions: []
        }));

    console.log(`Wallets to insert: ${walletsToInsert.length}`);
    for (let i = 0; i < walletsToInsert.length; i += batchSize) {
        const batch = walletsToInsert.slice(i, i + batchSize);
        await FoodUserWallet.collection.insertMany(batch);
        insertedWalletsCount += batch.length;
        console.log(`Inserted ${insertedWalletsCount}/${walletsToInsert.length} wallets...`);
    }

    console.log('Migration completed successfully!');
    console.log('---------------------------------');
    console.log(`Total CSV Rows: ${rawRows.length}`);
    console.log(`Unique Users (by phone): ${uniqueUsers.length}`);
    console.log(`New Users Inserted: ${insertedUsersCount}`);
    console.log(`New Wallets Inserted: ${insertedWalletsCount}`);
    console.log('---------------------------------');

    await mongoose.disconnect();
}

runMigration().catch(async (error) => {
    console.error('Migration failed:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore disconnect errors in failure path
    }
    process.exit(1);
});
