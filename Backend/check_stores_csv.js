import fs from 'fs';

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

const content = fs.readFileSync('../stores.csv', 'utf8');
const lines = content.split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines[0]);

const statusIdx = headers.indexOf('status');
const activeIdx = headers.indexOf('active');
const vegIdx = headers.indexOf('veg');
const nonVegIdx = headers.indexOf('non_veg');
const takeAwayIdx = headers.indexOf('take_away');
const storeBusinessModelIdx = headers.indexOf('store_business_model');
const vendorIdIdx = headers.indexOf('vendor_id');

const statuses = new Set();
const actives = new Set();
const vegs = new Set();
const nonVegs = new Set();
const takeAways = new Set();
const businessModels = new Set();
const vendorIds = new Set();

for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (statusIdx !== -1) statuses.add(row[statusIdx]);
    if (activeIdx !== -1) actives.add(row[activeIdx]);
    if (vegIdx !== -1) vegs.add(row[vegIdx]);
    if (nonVegIdx !== -1) nonVegs.add(row[nonVegIdx]);
    if (takeAwayIdx !== -1) takeAways.add(row[takeAwayIdx]);
    if (storeBusinessModelIdx !== -1) businessModels.add(row[storeBusinessModelIdx]);
    if (vendorIdIdx !== -1) vendorIds.add(row[vendorIdIdx]);
}

console.log('Unique Statuses:', Array.from(statuses));
console.log('Unique Actives:', Array.from(actives));
console.log('Unique Vegs:', Array.from(vegs));
console.log('Unique Non-Vegs:', Array.from(nonVegs));
console.log('Unique Takeaways:', Array.from(takeAways));
console.log('Unique Business Models:', Array.from(businessModels));
console.log('Total unique vendors:', vendorIds.size);
