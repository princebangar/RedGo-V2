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

async function runComparison() {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
        throw new Error('Missing MONGODB_URI in environment');
    }

    const storesCsvPath = path.resolve('../stores.csv');
    const walletsCsvPath = path.resolve('../store_wallets.csv');
    const reportPath = path.resolve('./restaurant_wallet_comparison_report.json');

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
        ownerPhoneLast10: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1
    }).lean();

    const existingWallets = await FoodRestaurantWallet.find({}, {
        restaurantId: 1,
        balance: 1,
        lockedAmount: 1,
        totalEarnings: 1,
        totalSettled: 1,
        createdAt: 1,
        updatedAt: 1
    }).lean();

    const { exactMatches, likelyMatches, missingStoreRows, unmatchedRows } =
        classifyLegacyRows(legacyRows, newRestaurants, existingWallets);

    const report = {
        generatedAt: new Date().toISOString(),
        source: {
            storesCsvPath,
            walletsCsvPath
        },
        summary: {
            legacyStoreCount: stores.length,
            legacyWalletCount: storeWallets.length,
            newRestaurantCount: newRestaurants.length,
            newWalletCount: existingWallets.length,
            exactMatchCount: exactMatches.length,
            likelyMatchCount: likelyMatches.length,
            missingStoreRowCount: missingStoreRows.length,
            unmatchedCount: unmatchedRows.length
        },
        exactMatches: exactMatches.map((row) => ({
            vendorId: row.vendorId,
            walletCsvId: row.walletCsvId,
            oldRestaurantName: row.oldRestaurantName,
            oldPhoneLast10: row.oldPhoneLast10,
            newRestaurantId: String(row.newRestaurant._id),
            newRestaurantName: row.newRestaurant.restaurantName,
            newRestaurantPhoneLast10: row.newRestaurant.ownerPhoneLast10 || null,
            existingWallet: row.existingWallet ? {
                balance: row.existingWallet.balance,
                lockedAmount: row.existingWallet.lockedAmount,
                totalEarnings: row.existingWallet.totalEarnings,
                totalSettled: row.existingWallet.totalSettled
            } : null,
            walletFromLegacy: row.wallet
        })),
        likelyMatches: likelyMatches.map((row) => ({
            vendorId: row.vendorId,
            walletCsvId: row.walletCsvId,
            oldRestaurantName: row.oldRestaurantName,
            oldPhoneLast10: row.oldPhoneLast10,
            walletFromLegacy: row.wallet,
            candidates: row.candidateRestaurants.map((candidate) => ({
                newRestaurantId: String(candidate._id),
                newRestaurantName: candidate.restaurantName,
                newRestaurantPhoneLast10: candidate.ownerPhoneLast10 || null
            }))
        })),
        missingStoreRows: missingStoreRows.map((row) => ({
            vendorId: row.vendorId,
            walletCsvId: row.walletCsvId,
            walletFromLegacy: row.wallet
        })),
        unmatchedRows: unmatchedRows.map((row) => ({
            vendorId: row.vendorId,
            walletCsvId: row.walletCsvId,
            oldRestaurantName: row.oldRestaurantName,
            oldPhoneLast10: row.oldPhoneLast10,
            walletFromLegacy: row.wallet
        }))
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const exactTotals = exactMatches.reduce((acc, row) => {
        acc.balance += row.wallet.balance;
        acc.lockedAmount += row.wallet.lockedAmount;
        acc.totalEarnings += row.wallet.totalEarnings;
        acc.totalSettled += row.wallet.totalSettled;
        return acc;
    }, { balance: 0, lockedAmount: 0, totalEarnings: 0, totalSettled: 0 });

    console.log('Restaurant wallet comparison completed.');
    console.log(`Report written to: ${reportPath}`);
    console.log(`Legacy wallet rows: ${storeWallets.length}`);
    console.log(`Exact matches: ${exactMatches.length}`);
    console.log(`Likely matches: ${likelyMatches.length}`);
    console.log(`Missing store rows: ${missingStoreRows.length}`);
    console.log(`Unmatched rows: ${unmatchedRows.length}`);
    console.log(`Exact-match totals: ${JSON.stringify(exactTotals)}`);

    await mongoose.disconnect();
}

runComparison().catch(async (error) => {
    console.error('Comparison failed:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore disconnect errors in failure path
    }
    process.exit(1);
});
