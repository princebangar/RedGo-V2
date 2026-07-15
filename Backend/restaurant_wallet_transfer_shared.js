import fs from 'fs';

export function parseCsvLine(line) {
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

export function readCsvAsObjects(path) {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];

    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] ?? null;
        });
        return row;
    });
}

export function normalizeName(name) {
    if (!name) return '';
    return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizePhoneLast10(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    return digits ? digits.slice(-10) : '';
}

export function roundCurrency(value) {
    return Number((value || 0).toFixed(2));
}

export function computeWalletFields(walletRow) {
    const totalEarnings = parseFloat(walletRow.total_earning) || 0;
    const totalSettled = parseFloat(walletRow.total_withdrawn) || 0;
    const lockedAmount = parseFloat(walletRow.pending_withdraw) || 0;
    const collectedCash = parseFloat(walletRow.collected_cash) || 0;
    const balance = totalEarnings - totalSettled - lockedAmount - collectedCash;

    return {
        totalEarnings: roundCurrency(totalEarnings),
        totalSettled: roundCurrency(totalSettled),
        lockedAmount: roundCurrency(lockedAmount),
        collectedCash: roundCurrency(collectedCash),
        balance: roundCurrency(balance)
    };
}

export function buildLegacyWalletRows(stores, storeWallets) {
    const storeById = new Map(stores.map((store) => [String(store.id), store]));

    return storeWallets.map((walletRow) => {
        const vendorId = String(walletRow.vendor_id || '');
        const store = storeById.get(vendorId) || null;
        const wallet = computeWalletFields(walletRow);
        return {
            vendorId,
            walletCsvId: walletRow.id ? String(walletRow.id) : '',
            store,
            walletRow,
            wallet,
            oldRestaurantName: store?.name || null,
            oldRestaurantNameNormalized: normalizeName(store?.name),
            oldPhoneLast10: normalizePhoneLast10(store?.phone),
            createdAt: walletRow.created_at ? new Date(walletRow.created_at) : null,
            updatedAt: walletRow.updated_at ? new Date(walletRow.updated_at) : null
        };
    });
}

export function classifyLegacyRows(legacyRows, newRestaurants, existingWallets) {
    const exactRestaurantMap = new Map();
    const nameOnlyMap = new Map();

    for (const restaurant of newRestaurants) {
        const nameNormalized = restaurant.restaurantNameNormalized || normalizeName(restaurant.restaurantName);
        const phoneLast10 = restaurant.ownerPhoneLast10 || normalizePhoneLast10(restaurant.ownerPhone);
        const exactKey = `${nameNormalized}__${phoneLast10 || 'no_phone'}`;
        exactRestaurantMap.set(exactKey, restaurant);

        if (!nameOnlyMap.has(nameNormalized)) {
            nameOnlyMap.set(nameNormalized, []);
        }
        nameOnlyMap.get(nameNormalized).push(restaurant);
    }

    const existingWalletByRestaurantId = new Map(
        existingWallets.map((walletDoc) => [String(walletDoc.restaurantId), walletDoc])
    );

    const exactMatches = [];
    const likelyMatches = [];
    const missingStoreRows = [];
    const unmatchedRows = [];

    for (const row of legacyRows) {
        if (!row.store) {
            missingStoreRows.push(row);
            continue;
        }

        const exactKey = `${row.oldRestaurantNameNormalized}__${row.oldPhoneLast10 || 'no_phone'}`;
        const exactMatch = exactRestaurantMap.get(exactKey);
        if (exactMatch) {
            exactMatches.push({
                ...row,
                newRestaurant: exactMatch,
                existingWallet: existingWalletByRestaurantId.get(String(exactMatch._id)) || null
            });
            continue;
        }

        const nameCandidates = nameOnlyMap.get(row.oldRestaurantNameNormalized) || [];
        if (nameCandidates.length) {
            likelyMatches.push({
                ...row,
                candidateRestaurants: nameCandidates,
            });
            continue;
        }

        unmatchedRows.push(row);
    }

    return {
        exactMatches,
        likelyMatches,
        missingStoreRows,
        unmatchedRows
    };
}
