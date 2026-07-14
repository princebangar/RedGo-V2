import { MongoClient } from 'mongodb';

const sourceUri = 'mongodb+srv://shubham:Shubham%40123@cluster0.3z3l0ia.mongodb.net/';
const targetUri = 'mongodb+srv://RedGo:Sandeep%4066@redgo-db.2h4bdxo.mongodb.net/Redgo?appName=RedGo-DB';

const collectionsToTransfer = [
    'food_users',
    'food_user_wallets',
    'food_delivery_partners',
    'food_delivery_wallets',
    'food_restaurants',
    'food_restaurant_wallets'
];

async function runTransfer() {
    const sourceClient = new MongoClient(sourceUri);
    const targetClient = new MongoClient(targetUri);

    try {
        console.log('Connecting to Source Database...');
        await sourceClient.connect();
        const sourceDb = sourceClient.db('Redgo');

        console.log('Connecting to Target Database...');
        await targetClient.connect();
        const targetDb = targetClient.db('Redgo');

        for (const collectionName of collectionsToTransfer) {
            console.log(`\n--- Transferring collection: ${collectionName} ---`);
            const sourceColl = sourceDb.collection(collectionName);
            const targetColl = targetDb.collection(collectionName);

            const docs = await sourceColl.find({}).toArray();
            console.log(`Found ${docs.length} documents in source.`);

            if (docs.length === 0) {
                console.log('Skipping empty collection.');
                continue;
            }

            // Using bulkWrite to upsert based on _id
            const bulkOps = docs.map(doc => ({
                replaceOne: {
                    filter: { _id: doc._id },
                    replacement: doc,
                    upsert: true
                }
            }));

            console.log(`Executing bulk upsert of ${bulkOps.length} documents...`);
            // Execute in batches to prevent memory/BSON size limits
            const batchSize = 1000;
            let matchedCount = 0;
            let upsertedCount = 0;
            let modifiedCount = 0;

            for (let i = 0; i < bulkOps.length; i += batchSize) {
                const batch = bulkOps.slice(i, i + batchSize);
                try {
                    const result = await targetColl.bulkWrite(batch, { ordered: false });
                    matchedCount += result.matchedCount;
                    upsertedCount += result.upsertedCount;
                    modifiedCount += result.modifiedCount;
                } catch (bulkError) {
                    // if ordered:false, errors might be thrown, we can parse them
                    if (bulkError.result) {
                        matchedCount += bulkError.result.matchedCount;
                        upsertedCount += bulkError.result.upsertedCount;
                        modifiedCount += bulkError.result.modifiedCount;
                    } else {
                        throw bulkError;
                    }
                }
            }

            console.log(`Transfer complete for ${collectionName}:`);
            console.log(`- Upserted (New): ${upsertedCount}`);
            console.log(`- Modified (Existing): ${modifiedCount}`);
            console.log(`- Matched (Unchanged): ${matchedCount - modifiedCount}`);
        }

        console.log('\nAll collections transferred successfully!');
    } catch (err) {
        console.error('Error during transfer:', err);
    } finally {
        await sourceClient.close();
        await targetClient.close();
    }
}

runTransfer();
