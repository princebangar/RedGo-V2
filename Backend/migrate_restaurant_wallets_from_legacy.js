import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';
import { FoodRestaurantWallet } from './src/modules/food/restaurant/models/restaurantWallet.model.js';
import {
    readCsvAsObjects,
    buildLegacyWalletRows,
    classifyLegacyRows
} from './restaurant_wallet_transfer_shared.js';

dotenv.config();

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const includeLikelyMatches = args.has('--include-likely');

async function runMigration() {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
        throw new Error('Missing MONGODB_URI in environment');
    }

    const storesCsvPath = path.resolve('../stores.csv');
    const walletsCsvPath = path.resolve('../store_wallets.csv');

    if (!fs.existsSync(storesCsvPath)) {
        throw new Error(`Missing stores.csv at ${storesCsvPath}`);
    }
    if (!fs.existsSync(walletsCsvPath)) {
        throw new Error(`Missing store_wallets.csv at ${walletsCsvPath}`);
    }

    const stores = readCsvAsObjects(storesCsvPath);
    const storeWallets = readCsvAsObjects(walletsCsvPath);
    const legacyRows = buildLegacyWalletRows(stores, storeWallets);

    await mongoose.connect(dbUri);

    const newRestaurants = await FoodRestaurant.find({}, {
        restaurantName: 1,
        restaurantNameNormalized: 1,
        ownerPhone: 1,
        ownerPhoneLast10: 1
    }).lean();

    const existingWallets = await FoodRestaurantWallet.find({}, {
        restaurantId: 1,
        balance: 1,
        lockedAmount: 1,
        totalEarnings: 1,
        totalSettled: 1
    }).lean();

    const { exactMatches, likelyMatches, missingStoreRows, unmatchedRows } =
        classifyLegacyRows(legacyRows, newRestaurants, existingWallets);

    const existingWalletByRestaurantId = new Map(
        existingWallets.map((walletDoc) => [String(walletDoc.restaurantId), walletDoc])
    );

    const exactMigrationRows = exactMatches.map((row) => ({
        ...row,
        matchType: 'exact'
    }));

    const likelySingleCandidateMatches = likelyMatches
        .filter((row) => row.candidateRestaurants.length === 1)
        .map((row) => ({
            ...row,
            newRestaurant: row.candidateRestaurants[0],
            existingWallet: existingWalletByRestaurantId.get(String(row.candidateRestaurants[0]._id)) || null,
            matchType: 'likely-single-candidate'
        }));

    const migrationRows = includeLikelyMatches
        ? exactMigrationRows.concat(likelySingleCandidateMatches)
        : exactMigrationRows;

    console.log(`Legacy wallet rows: ${storeWallets.length}`);
    console.log(`Exact matches available: ${exactMatches.length}`);
    console.log(`Likely single-candidate matches available: ${likelySingleCandidateMatches.length}`);
    console.log(`Rows selected for migration: ${migrationRows.length}`);
    console.log(`Likely matches requiring manual review: ${likelyMatches.length}`);
    console.log(`Missing store rows: ${missingStoreRows.length}`);
    console.log(`Unmatched rows: ${unmatchedRows.length}`);

    const totals = migrationRows.reduce((acc, row) => {
        acc.balance += row.wallet.balance;
        acc.lockedAmount += row.wallet.lockedAmount;
        acc.totalEarnings += row.wallet.totalEarnings;
        acc.totalSettled += row.wallet.totalSettled;
        return acc;
    }, { balance: 0, lockedAmount: 0, totalEarnings: 0, totalSettled: 0 });

    console.log(`Migration totals: ${JSON.stringify(totals)}`);

    if (!shouldWrite) {
        console.log('Dry run only. Re-run with --write to upsert selected wallet values.');
        await mongoose.disconnect();
        return;
    }

    let migratedCount = 0;
    for (const row of migrationRows) {
        await FoodRestaurantWallet.updateOne(
            { restaurantId: row.newRestaurant._id },
            {
                $set: {
                    balance: Math.max(0, row.wallet.balance),
                    lockedAmount: Math.max(0, row.wallet.lockedAmount),
                    totalEarnings: Math.max(0, row.wallet.totalEarnings),
                    totalSettled: Math.max(0, row.wallet.totalSettled),
                    updatedAt: row.updatedAt || new Date()
                },
                $setOnInsert: {
                    restaurantId: row.newRestaurant._id,
                    createdAt: row.createdAt || new Date()
                }
            },
            { upsert: true }
        );

        migratedCount++;
        console.log(`Upserted wallet ${migratedCount}/${migrationRows.length}: ${row.newRestaurant.restaurantName} [${row.matchType}]`);
    }

    console.log('Restaurant wallet migration completed.');
    console.log(`Wallets upserted: ${migratedCount}`);

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
