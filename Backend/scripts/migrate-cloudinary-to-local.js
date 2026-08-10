/**
 * Rewrite every Cloudinary URL in MongoDB to a local /uploads URL served by nginx.
 *
 *   node scripts/migrate-cloudinary-to-local.js                 # dry run (default)
 *   node scripts/migrate-cloudinary-to-local.js --apply         # write changes
 *   node scripts/migrate-cloudinary-to-local.js --apply --clean-empty
 *   node scripts/migrate-cloudinary-to-local.js --rollback <dir>
 *
 * Flags
 *   --apply             actually write (otherwise nothing is modified)
 *   --clean-empty       also delete the 0-byte placeholder files from disk
 *   --keep-broken       keep references to 0-byte assets instead of clearing them
 *   --uploads-dir <p>   override UPLOAD_PATH
 *   --uri <s>           override MONGODB_URI
 *   --out <dir>         where rollback/report files go (default scripts/migration-out)
 *
 * Safety
 *   - Reads the mapping from uploads/cloudinary_metadata.json, so a URL is only
 *     rewritten when the matching file is proven to exist on disk.
 *   - Updates only the top-level fields that actually changed ($set), never
 *     replaces whole documents.
 *   - Writes <out>/rollback-<collection>.json with every previous value before
 *     touching anything; --rollback restores from those files.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { config } from '../src/config/env.js';

// Rollback files MUST be Extended JSON. Plain JSON.stringify silently degrades
// BSON types — Date becomes an ISO string and ObjectId becomes a hex string —
// so restoring from it would corrupt every non-string value it touched.
const writeEJSON = (file, value) =>
    fs.writeFileSync(file, EJSON.stringify(value, { relaxed: false, indent: 2 }));
const readEJSON = (file) => EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: false });

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f, fallback) => {
    const i = argv.indexOf(f);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const APPLY = hasFlag('--apply');
const CLEAN_EMPTY = hasFlag('--clean-empty');
const KEEP_BROKEN = hasFlag('--keep-broken');
const ROLLBACK_DIR = hasFlag('--rollback') ? flagValue('--rollback', null) : null;
const UPLOADS_DIR = flagValue('--uploads-dir', config.uploadsRoot);
const URI = flagValue('--uri', config.mongodbUri);
const OUT_DIR = path.resolve(flagValue('--out', path.join(process.cwd(), 'scripts', 'migration-out')));
const ASSET_BASE = config.assetBaseUrl;

const CLOUD_URL = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>\\)]+/gi;
/** Marks a reference whose asset is a 0-byte failed download. */
const BROKEN = Symbol('broken-asset');

const log = (...a) => console.log(...a);

// MongoDB caps a single command at 16MB. food_items documents carry a deep
// oldData/newData edit history, so a fixed op-count batch can blow past that —
// batch by serialized size instead, with a wide margin.
const MAX_BATCH_BYTES = 6 * 1024 * 1024;
// A single update carrying more than this is sent field-by-field instead.
const OVERSIZE_OP_BYTES = 6 * 1024 * 1024;

/** Collected here so an oversized document is reported, never silently skipped. */
const writeFailures = [];

/**
 * Send one update per top-level field. Some food_items documents carry a
 * recursive oldData/newData edit history and sit within ~1MB of MongoDB's 16MB
 * document cap, so a $set of every changed field at once exceeds the command
 * limit even though each field on its own fits.
 */
const writeOversizedOp = async (collection, op) => {
    const { filter, update } = op.updateOne;
    let modified = 0;
    for (const [key, value] of Object.entries(update.$set)) {
        try {
            const res = await collection.updateOne(filter, { $set: { [key]: value } });
            modified += res.modifiedCount;
        } catch (err) {
            writeFailures.push({
                collection: collection.collectionName,
                _id: String(filter._id),
                field: key,
                bytes: JSON.stringify(value ?? null).length,
                error: err.message
            });
        }
    }
    return modified > 0 ? 1 : 0;
};

const bulkWriteChunked = async (collection, ops) => {
    let modified = 0;
    let batch = [];
    let bytes = 0;

    const flush = async () => {
        if (!batch.length) return;
        const res = await collection.bulkWrite(batch, { ordered: false });
        modified += res.modifiedCount;
        batch = [];
        bytes = 0;
    };

    for (const op of ops) {
        // Rough but safe: JSON length over-estimates BSON for these documents.
        const size = JSON.stringify(op).length;
        if (size > OVERSIZE_OP_BYTES) {
            await flush();
            modified += await writeOversizedOp(collection, op);
            continue;
        }
        if (batch.length && bytes + size > MAX_BATCH_BYTES) await flush();
        batch.push(op);
        bytes += size;
        if (batch.length >= 500) await flush();
    }
    await flush();
    return modified;
};

// ---------------------------------------------------------------- mapping

const buildMapping = () => {
    const metaPath = path.join(UPLOADS_DIR, 'cloudinary_metadata.json');
    if (!fs.existsSync(metaPath)) {
        throw new Error(`cloudinary_metadata.json not found in ${UPLOADS_DIR}`);
    }

    const onDisk = new Map(); // filename -> size
    for (const f of fs.readdirSync(UPLOADS_DIR)) {
        try {
            onDisk.set(f, fs.statSync(path.join(UPLOADS_DIR, f)).size);
        } catch { /* skip unreadable entries */ }
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const byUrl = new Map();
    for (const a of meta.assets || []) {
        if (a.secure_url && a.localFilename) byUrl.set(a.secure_url, a.localFilename);
    }

    // An asset is "broken" if the export failed for it. Detect that from the
    // metadata as well as from 0-byte files on disk, so a re-run after
    // --clean-empty still classifies those references the same way instead of
    // silently reporting them as unmapped and leaving Cloudinary URLs behind.
    const emptyFiles = new Set(
        [...onDisk.entries()].filter(([, size]) => size === 0).map(([f]) => f)
    );
    for (const f of meta.failedDownloads || []) {
        if (f.filename) emptyFiles.add(f.filename);
    }

    // Broken names must still resolve, even once the placeholder file is gone.
    const byUrlFailed = new Map();
    for (const f of meta.failedDownloads || []) {
        if (f.url && f.filename) byUrlFailed.set(f.url, f.filename);
    }

    return { onDisk, byUrl, byUrlFailed, emptyFiles };
};

/** Same flattening the Cloudinary export used: public_id path -> underscores. */
const deriveFilename = (url) => {
    try {
        const p = decodeURIComponent(new URL(url).pathname);
        const m = p.match(/\/(?:image|video|raw)\/upload\/(.+)$/i);
        if (!m) return null;
        return m[1]
            .split('/')
            .filter(Boolean)
            .filter((seg) => !/^v\d+$/.test(seg))
            .filter((seg) => !/^[a-z]{1,3}_[^/]+(,[a-z]{1,3}_[^/]+)*$/i.test(seg)) // transforms
            .join('_');
    } catch {
        return null;
    }
};

// ---------------------------------------------------------------- transform

const makeTransformer = (map, stats) => {
    const resolve = (url) => {
        // Assets whose download failed are recognised first: their placeholder
        // file may already have been deleted by a previous --clean-empty run.
        const failed = map.byUrlFailed.get(url);
        if (failed && !KEEP_BROKEN) {
            stats.broken.set(failed, (stats.broken.get(failed) || 0) + 1);
            return BROKEN;
        }

        let filename = map.byUrl.get(url);
        if (!filename || !map.onDisk.has(filename)) {
            const derived = deriveFilename(url);
            filename = derived && map.onDisk.has(derived) ? derived : null;
        }
        if (!filename) {
            stats.unmapped.set(url, (stats.unmapped.get(url) || 0) + 1);
            return null;
        }
        if (map.emptyFiles.has(filename) && !KEEP_BROKEN) {
            stats.broken.set(filename, (stats.broken.get(filename) || 0) + 1);
            return BROKEN;
        }
        stats.rewritten++;
        return `${ASSET_BASE}/uploads/${filename}`;
    };

    /** @returns transformed value, or the original when nothing changed */
    const walk = (value) => {
        if (typeof value === 'string') {
            if (!value.includes('res.cloudinary.com')) return value;

            const matches = value.match(CLOUD_URL);
            if (!matches) return value;

            // A field that is exactly one URL can be cleared when the asset is broken.
            if (matches.length === 1 && matches[0] === value.trim()) {
                const resolved = resolve(value.trim());
                if (resolved === null) return value;
                return resolved === BROKEN ? BROKEN : resolved;
            }

            // Embedded in longer text: substitute in place, leave broken ones alone.
            return value.replace(CLOUD_URL, (u) => {
                const r = resolve(u);
                return typeof r === 'string' ? r : u;
            });
        }

        if (Array.isArray(value)) {
            let changed = false;
            const out = [];
            for (const item of value) {
                const next = walk(item);
                if (next !== item) changed = true;
                if (next === BROKEN) continue; // drop dead entries from arrays
                out.push(next);
            }
            return changed ? out : value;
        }

        if (value && typeof value === 'object' && value.constructor === Object) {
            let changed = false;
            const out = {};
            for (const [k, v] of Object.entries(value)) {
                const next = walk(v);
                if (next !== v) changed = true;
                out[k] = next === BROKEN ? '' : next; // clear dead scalar refs
            }
            return changed ? out : value;
        }

        return value;
    };

    return walk;
};

// ---------------------------------------------------------------- rollback

const runRollback = async (db) => {
    const files = fs.readdirSync(ROLLBACK_DIR).filter((f) => /^rollback-.+\.json$/.test(f));
    if (!files.length) throw new Error(`No rollback-*.json files in ${ROLLBACK_DIR}`);

    for (const file of files) {
        const raw = fs.readFileSync(path.join(ROLLBACK_DIR, file), 'utf8');
        // Refuse to restore a legacy plain-JSON rollback file: it cannot carry
        // BSON types, and applying it would corrupt Dates and ObjectIds.
        if (!raw.includes('"$date"') && !raw.includes('"$oid"') && /"_id":\s*"[0-9a-f]{24}"/.test(raw)) {
            throw new Error(
                `${file} is a legacy plain-JSON rollback file (no Extended JSON markers). ` +
                'Restoring it would degrade Date/ObjectId values to strings. Refusing.'
            );
        }
        const entries = readEJSON(path.join(ROLLBACK_DIR, file));
        if (!entries.length) continue;
        const collection = entries[0].collection;
        const ops = entries.map((e) => ({
            updateOne: {
                filter: { _id: e._id instanceof mongoose.Types.ObjectId ? e._id : new mongoose.Types.ObjectId(String(e._id)) },
                update: { $set: e.before }
            }
        }));
        if (APPLY) {
            const modified = await bulkWriteChunked(db.collection(collection), ops);
            log(`  restored ${modified}/${ops.length} in ${collection}` +
                (modified < ops.length ? '  (unchanged docs were already correct)' : ''));
        } else {
            log(`  [dry-run] would restore ${ops.length} docs in ${collection}`);
        }
    }

    if (writeFailures.length) {
        log(`\n!! ${writeFailures.length} field writes FAILED during rollback:`);
        for (const f of writeFailures.slice(0, 20)) {
            log(`   ${f.collection} ${f._id} .${f.field}  ${f.error}`);
        }
        process.exitCode = 1;
    } else {
        log('\nRollback complete — no write failures.');
    }
};

// ---------------------------------------------------------------- main

const main = async () => {
    if (!URI) throw new Error('No MongoDB URI. Set MONGODB_URI or pass --uri');

    log(`mode        : ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
    log(`uploads dir : ${UPLOADS_DIR}`);
    log(`asset base  : ${ASSET_BASE}`);
    log(`output dir  : ${OUT_DIR}`);

    await mongoose.connect(URI, { serverSelectionTimeoutMS: 30000 });
    const db = mongoose.connection.db;
    log(`database    : ${db.databaseName}\n`);

    if (ROLLBACK_DIR) {
        log(`Rolling back from ${ROLLBACK_DIR}`);
        await runRollback(db);
        await mongoose.disconnect();
        return;
    }

    const map = buildMapping();
    log(`files on disk: ${map.onDisk.size} (${map.emptyFiles.size} are 0-byte)`);
    log(`metadata map : ${map.byUrl.size} assets\n`);

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const stats = { rewritten: 0, unmapped: new Map(), broken: new Map() };
    const transform = makeTransformer(map, stats);
    const summary = [];

    for (const { name } of await db.listCollections().toArray()) {
        const collection = db.collection(name);
        const rollback = [];
        const ops = [];

        for await (const doc of collection.find({})) {
            const { _id, ...fields } = doc;
            const before = {};
            const after = {};

            for (const [key, value] of Object.entries(fields)) {
                const next = transform(value);
                if (next === value) continue;
                before[key] = value;
                after[key] = next === BROKEN ? '' : next;
            }

            if (!Object.keys(after).length) continue;

            // Keep _id as a real ObjectId — EJSON round-trips it as {"$oid": …}.
            rollback.push({ collection: name, _id, before });
            ops.push({ updateOne: { filter: { _id }, update: { $set: after } } });
        }

        if (!ops.length) continue;

        writeEJSON(path.join(OUT_DIR, `rollback-${name}.json`), rollback);

        let modified = 0;
        if (APPLY) {
            modified = await bulkWriteChunked(collection, ops);
        }

        summary.push({ collection: name, docs: ops.length, modified });
        log(`${APPLY ? 'updated' : '[dry-run]'} ${String(ops.length).padStart(6)} docs  ${name}`);
    }

    log('\n=== SUMMARY ===');
    if (writeFailures.length) {
        log(`\n!! ${writeFailures.length} FIELD WRITES FAILED — these documents were NOT migrated:`);
        for (const f of writeFailures.slice(0, 20)) {
            log(`   ${f.collection} ${f._id} .${f.field}  ${f.error}`);
        }
        fs.writeFileSync(
            path.join(OUT_DIR, 'write-failures.json'),
            JSON.stringify(writeFailures, null, 2)
        );
    }
    log(`documents touched : ${summary.reduce((n, s) => n + s.docs, 0)}`);
    log(`URL replacements  : ${stats.rewritten}`);
    log(`broken (0-byte) refs ${KEEP_BROKEN ? 'kept' : 'cleared'}: ${[...stats.broken.values()].reduce((a, b) => a + b, 0)} across ${stats.broken.size} files`);
    log(`unmapped URLs     : ${[...stats.unmapped.values()].reduce((a, b) => a + b, 0)} across ${stats.unmapped.size} distinct`);

    if (stats.unmapped.size) {
        log('\nUnmapped (left untouched — no local file found):');
        for (const [u, n] of [...stats.unmapped].slice(0, 20)) log(`  x${n} ${u}`);
    }

    fs.writeFileSync(
        path.join(OUT_DIR, 'report.json'),
        JSON.stringify({
            ranAt: new Date().toISOString(),
            applied: APPLY,
            database: db.databaseName,
            assetBaseUrl: ASSET_BASE,
            replacements: stats.rewritten,
            brokenRefs: Object.fromEntries(stats.broken),
            unmapped: Object.fromEntries(stats.unmapped),
            collections: summary
        }, null, 2)
    );

    if (CLEAN_EMPTY) {
        log(`\n${APPLY ? 'Deleting' : '[dry-run] would delete'} ${map.emptyFiles.size} 0-byte files`);
        fs.writeFileSync(
            path.join(OUT_DIR, 'deleted-empty-files.json'),
            JSON.stringify([...map.emptyFiles], null, 2)
        );
        if (APPLY) {
            for (const f of map.emptyFiles) {
                try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch { /* already gone */ }
            }
        }
    }

    log(`\nRollback + report written to ${OUT_DIR}`);
    if (!APPLY) log('Nothing was written. Re-run with --apply when the numbers look right.');

    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error('\nFAILED:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
