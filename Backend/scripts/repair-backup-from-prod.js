/**
 * Repair a NON-PRODUCTION database by copying specific fields from production.
 *
 *   node scripts/repair-backup-from-prod.js --collection food_items \
 *        --fields image,oldData,newData --target "<backup-uri>" --source "<prod-uri>"
 *   ... add --apply to write.
 *
 * Reads production, writes only to --target. Refuses to run if --target and
 * --source resolve to the same database, and refuses a target whose name does
 * not look like a backup/test database.
 */
import fs from 'fs';
import path from 'path';
import { MongoClient, BSON } from 'mongodb';

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');

const COLLECTION = val('--collection', 'food_items');
const FIELDS = val('--fields', 'image,oldData,newData').split(',').map((s) => s.trim()).filter(Boolean);
const TARGET = val('--target', process.env.TARGET_URI);
const SOURCE = val('--source', process.env.SOURCE_URI);
const OUT = path.resolve(val('--out', path.join(process.cwd(), 'scripts', 'migration-out')));

if (!TARGET || !SOURCE) throw new Error('--target and --source are required');

const typesIn = (v, acc = new Map(), d = 0) => {
    if (d > 40 || v == null) return acc;
    const bt = v?._bsontype || (v instanceof Date ? 'Date' : null);
    if (bt) { acc.set(bt, (acc.get(bt) || 0) + 1); return acc; }
    if (Array.isArray(v)) { for (const i of v) typesIn(i, acc, d + 1); return acc; }
    if (typeof v === 'object') { for (const x of Object.values(v)) typesIn(x, acc, d + 1); return acc; }
    return acc;
};
const sig = (v) => JSON.stringify([...typesIn(v)].sort());

/**
 * Full value+type equality. Type signatures alone are not enough: a field can
 * have the right types but stale values (e.g. a URL rewritten by a half-applied
 * migration), and that must be repaired too.
 */
const identical = (a, b) => {
    if (a === undefined && b === undefined) return true;
    if (a === undefined || b === undefined) return false;
    try {
        return BSON.serialize({ v: a }).equals(BSON.serialize({ v: b }));
    } catch {
        return sig(a) === sig(b);
    }
};

const main = async () => {
    const src = new MongoClient(SOURCE, { serverSelectionTimeoutMS: 30000 });
    const tgt = new MongoClient(TARGET, { serverSelectionTimeoutMS: 30000 });
    await Promise.all([src.connect(), tgt.connect()]);

    const S = src.db(), T = tgt.db();

    if (S.databaseName === T.databaseName) {
        throw new Error(`Refusing to run: source and target are both "${S.databaseName}"`);
    }
    if (!/backup|test|stag|dev/i.test(T.databaseName)) {
        throw new Error(
            `Refusing to write to "${T.databaseName}" — the target must be a backup/test database.`
        );
    }

    console.log(`source (read-only): ${S.databaseName}`);
    console.log(`target (writes)   : ${T.databaseName}`);
    console.log(`collection        : ${COLLECTION}`);
    console.log(`fields            : ${FIELDS.join(', ')}`);
    console.log(`mode              : ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

    const proj = Object.fromEntries(FIELDS.map((f) => [f, 1]));
    const ids = await T.collection(COLLECTION).distinct('_id');

    let repaired = 0, alreadyOk = 0, missingInSource = 0, tooLarge = 0, typeDamaged = 0;
    const oversized = [];

    for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const [tDocs, sDocs] = await Promise.all([
            T.collection(COLLECTION).find({ _id: { $in: chunk } }, { projection: proj }).toArray(),
            S.collection(COLLECTION).find({ _id: { $in: chunk } }, { projection: proj }).toArray()
        ]);
        const sMap = new Map(sDocs.map((d) => [String(d._id), d]));

        for (const t of tDocs) {
            const s = sMap.get(String(t._id));
            if (!s) { missingInSource++; continue; }

            const differing = FIELDS.filter((f) => !identical(t[f], s[f]));
            if (!differing.length) { alreadyOk++; continue; }

            const typeBroken = FIELDS.filter((f) => sig(t[f]) !== sig(s[f]));
            if (typeBroken.length) typeDamaged++;

            const update = Object.fromEntries(FIELDS.map((f) => [f, s[f]]).filter(([, v]) => v !== undefined));

            const bytes = BSON.calculateObjectSize({ ...update, _id: t._id });

            if (!APPLY) { repaired++; continue; }

            // Attempt the write and let the server decide. Some documents sit
            // within a few hundred KB of the 16MB cap; a pre-emptive skip would
            // wrongly abandon ones that actually fit.
            try {
                await T.collection(COLLECTION).updateOne({ _id: t._id }, { $set: update });
                repaired++;
            } catch (err) {
                tooLarge++;
                oversized.push({ _id: String(t._id), bytes, fields: differing, error: err.message });
            }
        }
    }

    console.log(`repaired         : ${repaired}${APPLY ? '' : ' (would be)'}`);
    console.log(`  of which type-corrupted: ${typeDamaged}`);
    console.log(`already correct  : ${alreadyOk}`);
    console.log(`missing in source: ${missingInSource}`);
    console.log(`too large to set : ${tooLarge}`);
    if (oversized.length) {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, 'repair-oversized.json'), JSON.stringify(oversized, null, 2));
        for (const o of oversized) {
            console.log(`   ${o._id}  ${(o.bytes / 1024 / 1024).toFixed(2)}MB  fields: ${o.fields.join(',')}`);
        }
    }

    await Promise.all([src.close(), tgt.close()]);
};

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
