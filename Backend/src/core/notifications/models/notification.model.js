import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        ownerType: {
            type: String,
            enum: ['USER', 'RESTAURANT', 'DELIVERY_PARTNER'],
            required: true,
            index: true
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        link: {
            type: String,
            default: '',
            trim: true
        },
        category: {
            type: String,
            default: 'broadcast',
            trim: true
        },
        source: {
            type: String,
            enum: ['ADMIN_BROADCAST', 'FSSAI_EXPIRY', 'ORDER_UPDATE'],
            default: 'ADMIN_BROADCAST',
            index: true
        },
        broadcastId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BroadcastNotification',
            default: null,
            index: true
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true
        },
        readAt: {
            type: Date,
            default: null
        },
        dismissedAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    {
        collection: 'food_notifications',
        timestamps: true
    }
);

notificationSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
notificationSchema.index({ ownerType: 1, ownerId: 1, isRead: 1, dismissedAt: 1 });
// Unique only for admin broadcasts. A sparse compound index would also cover rows with broadcastId null,
// so a 2nd non-broadcast message for the same owner failed with a duplicate-key error and was lost.
notificationSchema.index(
    { broadcastId: 1, ownerType: 1, ownerId: 1 },
    { unique: true, partialFilterExpression: { broadcastId: { $type: 'objectId' } }, name: 'broadcast_owner_unique' }
);
// TTL Index: Auto-delete notifications older than 3 days (259,200 seconds) for 512MB Free DB Tier safety
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });

export const FoodNotification = mongoose.model('FoodNotification', notificationSchema);

/** Replace the old sparse unique index (broadcastId_1_ownerType_1_ownerId_1) with the partial one. */
export const repairNotificationIndexes = async () => {
    try {
        const indexes = await FoodNotification.collection.indexes();
        const old = indexes.find((i) => i.name === 'broadcastId_1_ownerType_1_ownerId_1');
        if (old) await FoodNotification.collection.dropIndex(old.name);
        await FoodNotification.syncIndexes();
    } catch (err) {
        console.error('Notification index repair failed:', err?.message || err);
    }
};
