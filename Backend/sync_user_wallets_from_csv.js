import fs from 'fs';
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
    const digits = cleaned.startsWith('+') ? cleaned.slice(1).replace(/\D/g, '') : cleaned.replace(/\D/g, '');
    if (!digits) return { phone: '', countryCode: '+91' };

    if (digits.length > 10) {
        const countryDigits = digits.slice(0, digits.length - 10);
        return {
            phone: digits.slice(-10),
            countryCode: countryDigits ? `+${countryDigits}` : '+91'
        };
    }

    return {
        phone: digits,
        countryCode: '+91'
    };
}

async function runSync() {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
        throw new Error('Missing MONGODB_URI in environment');
    }

    const csvPath = '../users-new (1).csv';
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found at ${csvPath}`);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(dbUri);
    console.log('MongoDB connected successfully.');

    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(lines[0]);
    const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
    const getVal = (row, fieldName) => {
        const idx = headerIndex[fieldName];
        return idx !== undefined ? row[idx] : null;
    };

    const csvPhoneMap = new Map();
    let invalidPhoneRows = 0;

    for (const line of lines.slice(1)) {
        const row = parseCsvLine(line);
        const { phone } = parsePhone(getVal(row, 'phone'));
        const walletBalance = Number((parseFloat(getVal(row, 'wallet_balance')) || 0).toFixed(2));
        const updatedAt = getVal(row, 'updated_at') ? new Date(getVal(row, 'updated_at')) : new Date();

        if (!phone || phone.length !== 10) {
            invalidPhoneRows++;
            continue;
        }

        const userRow = {
            legacyId: getVal(row, 'id'),
            phone,
            name: `${getVal(row, 'f_name') || ''} ${getVal(row, 'l_name') || ''}`.trim(),
            walletBalance,
            updatedAt
        };

        if (!csvPhoneMap.has(phone) || updatedAt > csvPhoneMap.get(phone).updatedAt) {
            csvPhoneMap.set(phone, userRow);
        }
    }

    const csvUsers = Array.from(csvPhoneMap.values());
    const csvUsersWithPositiveWallet = csvUsers.filter((user) => user.walletBalance > 0);

    const dbUsers = await FoodUser.find({}, { _id: 1, phone: 1, name: 1 }).lean();
    const dbWallets = await FoodUserWallet.find({}, { userId: 1, balance: 1, referralEarnings: 1, transactions: 1 }).lean();

    const dbUserByPhone = new Map(dbUsers.map((user) => [user.phone, user]));
    const dbWalletByUserId = new Map(dbWallets.map((wallet) => [String(wallet.userId), wallet]));

    const walletRowsToSync = [];
    let alreadySameCount = 0;

    for (const csvUser of csvUsersWithPositiveWallet) {
        const dbUser = dbUserByPhone.get(csvUser.phone);
        if (!dbUser) continue;

        const existingWallet = dbWalletByUserId.get(String(dbUser._id));
        const currentBalance = Number(((existingWallet?.balance || 0)).toFixed(2));

        if (currentBalance === csvUser.walletBalance) {
            alreadySameCount++;
            continue;
        }

        walletRowsToSync.push({
            dbUser,
            csvUser,
            existingWallet
        });
    }

    console.log(`CSV users with positive wallet balance: ${csvUsersWithPositiveWallet.length}`);
    console.log(`Wallets already matching CSV amount: ${alreadySameCount}`);
    console.log(`Wallets needing sync: ${walletRowsToSync.length}`);
    console.log(`Invalid phone rows skipped: ${invalidPhoneRows}`);

    let syncedCount = 0;
    for (const row of walletRowsToSync) {
        const setPayload = {
            balance: row.csvUser.walletBalance,
            updatedAt: row.csvUser.updatedAt || new Date()
        };

        const setOnInsertPayload = {
            userId: row.dbUser._id,
            referralEarnings: 0,
            transactions: [],
            createdAt: row.csvUser.updatedAt || new Date()
        };

        await FoodUserWallet.updateOne(
            { userId: row.dbUser._id },
            {
                $set: setPayload,
                $setOnInsert: setOnInsertPayload
            },
            { upsert: true }
        );

        syncedCount++;
        console.log(
            `Synced wallet ${syncedCount}/${walletRowsToSync.length}: ${row.dbUser.name || row.csvUser.name || row.csvUser.phone} (${row.csvUser.phone}) -> ${row.csvUser.walletBalance}`
        );
    }

    console.log('User wallet sync completed successfully.');
    console.log(`Wallets synced: ${syncedCount}`);

    await mongoose.disconnect();
}

runSync().catch(async (error) => {
    console.error('User wallet sync failed:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore disconnect errors in failure path
    }
    process.exit(1);
});
