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
    console.log('MongoDB Connected.');

    // 1. Read delivery_men.csv to map legacy id -> phone
    const deliveryMenCsvPath = '../delivery_men.csv';
    if (!fs.existsSync(deliveryMenCsvPath)) {
        console.error(`Missing delivery_men.csv at ${deliveryMenCsvPath}`);
        process.exit(1);
    }

    const deliveryMenLines = fs.readFileSync(deliveryMenCsvPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const deliveryMenHeaders = parseCsvLine(deliveryMenLines[0]);
    const dIdIdx = deliveryMenHeaders.indexOf('id');
    const dPhoneIdx = deliveryMenHeaders.indexOf('phone');

    const legacyIdToPhoneMap = new Map();
    for (let i = 1; i < deliveryMenLines.length; i++) {
        const row = parseCsvLine(deliveryMenLines[i]);
        const id = row[dIdIdx];
        const phone = row[dPhoneIdx];
        if (id && phone) {
            legacyIdToPhoneMap.set(id, phone);
        }
    }
    console.log(`Mapped ${legacyIdToPhoneMap.size} delivery men from CSV.`);

    // 2. Read delivery_man_wallets.csv
    const walletsCsvPath = '../delivery_man_wallets.csv';
    if (!fs.existsSync(walletsCsvPath)) {
        console.error(`Missing delivery_man_wallets.csv at ${walletsCsvPath}`);
        process.exit(1);
    }

    const fileStream = fs.createReadStream(walletsCsvPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let headerIndex = {};
    let isHeader = true;
    const walletRows = [];

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
        walletRows.push(row);
    }
    console.log(`Total wallet rows read from CSV: ${walletRows.length}`);

    const getVal = (row, fieldName) => {
        const idx = headerIndex[fieldName];
        return idx !== undefined ? row[idx] : null;
    };

    let updatedWalletsCount = 0;
    let skippedCount = 0;

    for (const row of walletRows) {
        const deliveryManId = getVal(row, 'delivery_man_id');
        const collectedCash = parseFloat(getVal(row, 'collected_cash')) || 0;
        const totalEarning = parseFloat(getVal(row, 'total_earning')) || 0;
        const totalWithdrawn = parseFloat(getVal(row, 'total_withdrawn')) || 0;
        const pendingWithdraw = parseFloat(getVal(row, 'pending_withdraw')) || 0;
        const createdAt = getVal(row, 'created_at');
        const updatedAt = getVal(row, 'updated_at');

        // Look up the phone number for this delivery man
        const rawPhone = legacyIdToPhoneMap.get(deliveryManId);
        if (!rawPhone) {
            console.log(`Warning: No phone number mapped for delivery man ID: ${deliveryManId}`);
            skippedCount++;
            continue;
        }

        const { phone } = parsePhone(rawPhone);
        if (!phone) {
            console.log(`Warning: Invalid phone normalization for ${rawPhone}`);
            skippedCount++;
            continue;
        }

        // Find matching MongoDB delivery partner document
        const partner = await FoodDeliveryPartner.findOne({ phone }).lean();
        if (!partner) {
            console.log(`Warning: No delivery partner found in MongoDB with phone: ${phone}`);
            skippedCount++;
            continue;
        }

        // Calculate available balance
        const balance = totalEarning - totalWithdrawn - pendingWithdraw;

        // Update/Upsert the wallet in MongoDB
        await FoodDeliveryWallet.updateOne(
            { deliveryPartnerId: partner._id },
            {
                $set: {
                    balance: Math.max(0, balance),
                    lockedAmount: pendingWithdraw,
                    cashInHand: collectedCash,
                    totalEarnings: totalEarning,
                    totalSettled: totalWithdrawn,
                    createdAt: createdAt ? new Date(createdAt) : new Date(),
                    updatedAt: updatedAt ? new Date(updatedAt) : new Date()
                }
            },
            { upsert: true }
        );

        updatedWalletsCount++;
    }

    console.log('Wallet Migration Completed successfully!');
    console.log(`---------------------------------`);
    console.log(`Total Wallet CSV Rows: ${walletRows.length}`);
    console.log(`Successfully Updated Wallets: ${updatedWalletsCount}`);
    console.log(`Skipped Rows (unmapped): ${skippedCount}`);
    console.log(`---------------------------------`);

    await mongoose.disconnect();
}

runMigration().catch(err => {
    console.error('Wallet Migration failed:', err);
    mongoose.disconnect();
});
