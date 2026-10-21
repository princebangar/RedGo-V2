import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import mongoose from 'mongoose';
import { FoodUser } from '../users/user.model.js';
import { FoodRestaurant } from '../../modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../modules/food/delivery/models/deliveryPartner.model.js';
import { FoodAdmin } from '../admin/admin.model.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const FIREBASE_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SEND_URL = (projectId) =>
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
const OWNER_MODELS = {
    USER: FoodUser,
    RESTAURANT: FoodRestaurant,
    DELIVERY_PARTNER: FoodDeliveryPartner,
    ADMIN: FoodAdmin
};
const OWNER_TOKEN_FIELDS = {
    web: 'fcmTokens',
    mobile: 'fcmTokenMobile'
};

let cachedAccessToken = null;
let cachedAccessTokenExpiryMs = 0;
let cachedServiceAccount = null;

const sanitizeString = (value) => String(value ?? '').trim();

const toBase64Url = (input) =>
    Buffer.from(JSON.stringify(input))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n').trim();

const getServiceAccountFromEnv = () => {
    if (cachedServiceAccount) return cachedServiceAccount;

    const rawJson = sanitizeString(config.firebaseServiceAccount || process.env.FIREBASE_SERVICE_ACCOUNT);
    if (rawJson) {
        cachedServiceAccount = JSON.parse(rawJson);
        return cachedServiceAccount;
    }

    const pathValue = sanitizeString(config.firebaseServiceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (pathValue) {
        const filePath = resolve(process.cwd(), pathValue);
        if (existsSync(filePath)) {
            cachedServiceAccount = JSON.parse(readFileSync(filePath, 'utf8'));
            return cachedServiceAccount;
        }
    }

    throw new Error('Firebase service account is not configured. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.');
};

const getFirebaseProjectId = () => {
    const account = getServiceAccountFromEnv();
    const projectId =
        sanitizeString(config.firebaseProjectId) ||
        sanitizeString(account.project_id) ||
        sanitizeString(process.env.FIREBASE_PROJECT_ID);
    if (!projectId) {
        throw new Error('Firebase project ID is not configured.');
    }
    return projectId;
};

const getFirebaseAccessToken = async () => {
    const now = Date.now();
    if (cachedAccessToken && cachedAccessTokenExpiryMs - now > 60_000) {
        return cachedAccessToken;
    }

    const account = getServiceAccountFromEnv();
    const privateKey = normalizePrivateKey(account.private_key);
    if (!account.client_email || !privateKey) {
        throw new Error('Firebase service account is missing client_email or private_key.');
    }

    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: account.client_email,
        scope: FIREBASE_MESSAGING_SCOPE,
        aud: OAUTH_TOKEN_URL,
        iat,
        exp
    };

    const jwtUnsigned = `${toBase64Url(header)}.${toBase64Url(payload)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(jwtUnsigned);
    signer.end();
    const signature = signer.sign(privateKey, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const assertion = `${jwtUnsigned}.${signature}`;

    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
    });

    const response = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Firebase OAuth token exchange failed (${response.status}): ${text}`);
    }

    const json = await response.json();
    cachedAccessToken = json.access_token;
    cachedAccessTokenExpiryMs = now + ((Number(json.expires_in) || 3600) * 1000);
    return cachedAccessToken;
};

const normalizeDataMap = (data = {}) => {
    const result = {};
    for (const [key, value] of Object.entries(data || {})) {
        if (value === undefined || value === null) continue;
        result[String(key)] = String(value);
    }
    return result;
};

// Emojis are surrogate pairs in JS strings. A plain character class like /[👤🏪]/ (no `u` flag)
// matches a single half of ANY emoji, which left a lone surrogate behind — shown as "?" on devices.
// Match only the exact role-prefix emojis, as whole code points.
const OWNER_TITLE_EMOJI_PREFIX = /^(?:👤|🏪|🛵|🛡️?)\s*/u;

const stripOwnerTitlePrefix = (title = '') =>
    sanitizeString(title)
        .replace(OWNER_TITLE_EMOJI_PREFIX, '')
        .replace(/^\[(User|Shop|Rider|Admin)\]\s*/i, '')
        .trim();

const resolveClickLink = (payload = {}, data = {}) => {
    const raw =
        sanitizeString(payload.link) ||
        sanitizeString(data.link) ||
        sanitizeString(data.targetUrl) ||
        sanitizeString(data.click_action) ||
        '/';
    return raw || '/';
};

// FCM rejects payloads over 4096 BYTES, and title/body are sent twice (notification + data mirror).
// English = 1 byte/char, Hindi = 3, emoji = 4 — so the cap must be in bytes, not characters.
// (title + body) * 2 + ~600B of data keys stays under ~3KB even for all-emoji text.
// Truncate by code point so an emoji/akshar is never split. Inbox keeps the full text.
const MAX_PUSH_TITLE_BYTES = 200;
const MAX_PUSH_BODY_BYTES = 1000;
const ELLIPSIS = '…';
const truncateUtf8Bytes = (value, maxBytes) => {
    if (Buffer.byteLength(value) <= maxBytes) return value;
    const budget = maxBytes - Buffer.byteLength(ELLIPSIS);
    let used = 0;
    let out = '';
    for (const char of value) {
        used += Buffer.byteLength(char);
        if (used > budget) break;
        out += char;
    }
    return `${out.trimEnd()}${ELLIPSIS}`;
};

const buildMessagePayload = (payload = {}, token, { platform } = {}) => {
    const notification = {
        title: truncateUtf8Bytes(
            stripOwnerTitlePrefix(payload.title || payload.notification?.title) || 'New notification',
            MAX_PUSH_TITLE_BYTES
        ),
        body: truncateUtf8Bytes(sanitizeString(payload.body || payload.notification?.body || ''), MAX_PUSH_BODY_BYTES)
    };
    const clickLink = resolveClickLink(payload, payload.data || {});
    const data = normalizeDataMap({
        ...(payload.data || {}),
        // Always mirror title/body in data so native/web handlers can show tray UI if needed
        title: notification.title,
        body: notification.body,
        link: clickLink,
        click_action: clickLink,
        targetUrl: sanitizeString(payload.data?.targetUrl) || clickLink,
    });
    const image =
        sanitizeString(payload.icon || payload.notification?.image || payload.notification?.icon || data.image || data.imageUrl);

    // dataOnly: omit system notification blocks ONLY if caller explicitly requested silent background sync.
    // For killed/closed app delivery (Android/iOS/Web), top-level `notification` block MUST be included.
    const message = { token };
    const isWeb = platform === 'web';
    const isDataOnly = payload.dataOnly === true;
    const androidChannel = sanitizeString(payload.channelId) || 'high_importance_channel';

    if (!isDataOnly) {
        message.notification = { ...notification };
        if (image) {
            message.notification.image = image;
        }
    }

    if (Object.keys(data).length > 0) {
        message.data = data;
    }

    const soundFile = payload.sound || 'default';

    message.android = {
        priority: 'high',
        ttl: '86400s',
        ...(isDataOnly
            ? {}
            : {
                notification: {
                    channel_id: androidChannel,
                    sound: soundFile,
                    default_vibrate_timings: true,
                    default_light_settings: true,
                    notification_priority: 'PRIORITY_HIGH',
                    ...(image ? { image } : {}),
                },
            }),
    };

    message.apns = {
        headers: {
            'apns-priority': '10',
            'apns-push-type': isDataOnly ? 'background' : 'alert',
            'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
        },
        payload: {
            aps: isDataOnly
                ? {
                    'content-available': 1,
                }
                : {
                    alert: {
                        title: notification.title,
                        body: notification.body,
                    },
                    sound: soundFile,
                    badge: 1,
                    'content-available': 1,
                    'mutable-content': 1,
                },
        },
    };

    let webLink = clickLink;
    try {
        if (webLink.startsWith('/')) {
            const origin = sanitizeString(
                payload.webOrigin ||
                    process.env.FRONTEND_URL ||
                    process.env.CLIENT_URL ||
                    process.env.APP_URL ||
                    ''
            ).replace(/\/$/, '');
            if (origin) webLink = `${origin}${webLink}`;
        }
    } catch {
        // keep relative
    }

    message.webpush = {
        headers: {
            Urgency: 'high',
            TTL: '86400',
        },
        ...(isDataOnly
            ? {}
            : {
                notification: {
                    title: notification.title,
                    body: notification.body,
                    ...(image ? { image, icon: image } : {}),
                },
            }),
        fcm_options: {
            link: webLink || '/',
        },
    };

    return message;
};

const parseFirebaseError = async (response) => {
    try {
        return await response.json();
    } catch {
        try {
            const text = await response.text();
            return { error: { message: text } };
        } catch {
            return { error: { message: 'Unknown Firebase error' } };
        }
    }
};

const getFcmErrorCode = (errorJson) => {
    const details = Array.isArray(errorJson?.error?.details) ? errorJson.error.details : [];
    const fcmDetail = details.find((item) => String(item?.['@type'] || '').includes('FcmError'));
    return String(fcmDetail?.errorCode || errorJson?.error?.status || '').toUpperCase();
};

// Only drop a token when FCM says the TOKEN itself is dead. INVALID_ARGUMENT / 404 are also
// returned for message problems (payload too big, bad field) or a misconfigured project —
// treating those as dead tokens silently wiped valid devices (e.g. a restaurant's only phone).
const shouldRemoveTokenFromError = (errorJson) => {
    const code = getFcmErrorCode(errorJson);
    const message = String(errorJson?.error?.message || '');
    if (code === 'UNREGISTERED') return true;
    return code === 'INVALID_ARGUMENT' && /registration token/i.test(message);
};

const getOwnerModel = (ownerType) => OWNER_MODELS[String(ownerType || '').toUpperCase()] || null;

const getTokenFieldForPlatform = (platform) => OWNER_TOKEN_FIELDS[platform === 'mobile' ? 'mobile' : 'web'];

const MAX_STORED_TOKENS_PER_FIELD = 10;

const dedupeTokens = (tokens = []) =>
    [...new Set((Array.isArray(tokens) ? tokens : [tokens]).map(sanitizeString).filter(Boolean))];

// Storage cap only (per field, per owner). Never use this on a send list — broadcasts pass
// tokens of many owners at once, and capping there dropped 40 of every 50 devices.
const normalizeTokenList = (tokens = []) => dedupeTokens(tokens).slice(-MAX_STORED_TOKENS_PER_FIELD);

// pickLatestTokenOnly removed as we want to push to all active devices of a user

const readTokensFromDoc = (doc, platform) => {
    if (!doc) return [];
    if (platform) {
        return normalizeTokenList(doc[getTokenFieldForPlatform(platform)] || []);
    }
    return dedupeTokens([
        ...normalizeTokenList(doc.fcmTokens || []),
        ...normalizeTokenList(doc.fcmTokenMobile || [])
    ]);
};

export const listOwnerTokens = async ({ ownerType, ownerId, platform }) => {
    if (!ownerType || !ownerId) return [];
    const model = getOwnerModel(ownerType);
    if (!model) return [];
    const doc = await model.findById(ownerId).select('fcmTokens fcmTokenMobile').lean();
    return readTokensFromDoc(doc, platform);
};

export const upsertFirebaseDeviceToken = async ({ ownerType, ownerId, token, platform = 'web' }) => {
    try {
        const normalizedToken = sanitizeString(token);
        if (!ownerType || !ownerId || !normalizedToken) {
            throw new Error('ownerType, ownerId, and token are required.');
        }

        const normalizedPlatform = platform === 'mobile' ? 'mobile' : 'web';
        const model = getOwnerModel(ownerType);
        if (!model) {
            throw new Error(`Unsupported owner type: ${ownerType}`);
        }

        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            throw new Error(`Invalid owner ID: ${ownerId}`);
        }

        const doc = await model.findById(ownerId).select('fcmTokens fcmTokenMobile').lean();
        if (!doc) {
            throw new Error('Owner profile not found.');
        }

        const targetField = getTokenFieldForPlatform(normalizedPlatform);
        const otherField = getTokenFieldForPlatform(normalizedPlatform === 'mobile' ? 'web' : 'mobile');
        const existingTokens = Array.isArray(doc[targetField]) ? doc[targetField] : [];
        const otherTokens = Array.isArray(doc[otherField]) ? doc[otherField] : [];

        if (existingTokens.includes(normalizedToken) && !otherTokens.includes(normalizedToken)) {
            return { success: true };
        }

        // Atomic updates touch only the token arrays. doc.save() re-validated the whole profile,
        // so any legacy field that no longer matched the schema made token saving fail silently,
        // and concurrent saves from two devices could overwrite each other's token.
        // 1. Remove from both arrays (prevents cross-platform duplicates).
        await model.updateOne(
            { _id: ownerId },
            { $pull: { [targetField]: normalizedToken, [otherField]: normalizedToken } }
        );
        // 2. Append as newest, keeping only the latest N tokens.
        await model.updateOne(
            { _id: ownerId },
            { $push: { [targetField]: { $each: [normalizedToken], $slice: -MAX_STORED_TOKENS_PER_FIELD } } }
        );

        return { success: true };
    } catch (error) {
        throw error;
    }
};

export const removeFirebaseDeviceToken = async ({ ownerType, ownerId, token, platform }) => {
    const normalizedToken = sanitizeString(token);
    if (!ownerType || !ownerId || !normalizedToken) {
        throw new Error('ownerType, ownerId, and token are required.');
    }
    const model = getOwnerModel(ownerType);
    if (!model) {
        throw new Error(`Unsupported owner type: ${ownerType}`);
    }
    const pull = platform
        ? { [getTokenFieldForPlatform(platform)]: normalizedToken }
        : { fcmTokens: normalizedToken, fcmTokenMobile: normalizedToken };
    const result = await model.updateOne({ _id: ownerId }, { $pull: pull });
    return { success: Boolean(result?.matchedCount) };
};

export const sendPushNotification = async (tokens, payload = {}, { platform } = {}) => {
    const projectId = getFirebaseProjectId();
    const accessToken = await getFirebaseAccessToken();
    const uniqueTokens = dedupeTokens(tokens);

    if (uniqueTokens.length === 0) {
        return { successCount: 0, failureCount: 0, results: [] };
    }

    const results = await Promise.all(
        uniqueTokens.map(async (token) => {
            const message = buildMessagePayload(payload, token, { platform });
            try {
                const response = await fetch(FCM_SEND_URL(projectId), {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message })
                });

                if (!response.ok) {
                    const errorJson = await parseFirebaseError(response);
                    return {
                        token,
                        ok: false,
                        remove: shouldRemoveTokenFromError(errorJson),
                        error: errorJson?.error?.message || `FCM send failed (${response.status})`
                    };
                }

                return {
                    token,
                    ok: true,
                    response: await response.json()
                };
            } catch (error) {
                return {
                    token,
                    ok: false,
                    remove: false,
                    error: error?.message || String(error)
                };
            }
        })
    );

    const successCount = results.filter((result) => result.ok).length;
    const failureCount = results.length - successCount;
    return { successCount, failureCount, results };
};

export const sendNotificationToOwner = async ({ ownerType, ownerId, payload, platform } = {}) => {
    // Clone payload so broadcast loops don't mutate a shared object
    const enrichedPayload = { ...payload };

    try {
        // Retrieve tokens for requested platform or combine all tokens if platform is undefined
        const rawTokens = await listOwnerTokens({ ownerType, ownerId, platform });
        
        // Deduplicate token list strictly so no single FCM device token receives duplicate notifications
        const targetTokens = dedupeTokens(rawTokens);

        if (!targetTokens.length) {
            logger.warn(`[FCM] No device tokens for ${ownerType}:${ownerId} — push skipped`);
            return { successCount: 0, failureCount: 0, results: [] };
        }

        // Single dispatch call to FCM with deduplicated tokens
        const response = await sendPushNotification(targetTokens, enrichedPayload, { platform });

        // Clean up any stale or unregistered tokens across both web and mobile fields
        const invalidTokens = (response.results || [])
            .filter((item) => !item.ok && item.remove)
            .map((item) => item.token)
            .filter(Boolean);

        if (invalidTokens.length > 0) {
            const model = getOwnerModel(ownerType);
            if (model) {
                await model.updateOne(
                    { _id: ownerId },
                    { $pull: { fcmTokens: { $in: invalidTokens }, fcmTokenMobile: { $in: invalidTokens } } }
                );
            }
        }

        console.log(
            `[FCM] Sending to ${ownerType}:${ownerId}. Title: "${enrichedPayload.title || 'Data Only'}" success=${response.successCount} failure=${response.failureCount}`
        );
        logger.info(
            `FCM push sent to ${ownerType}:${ownerId} (${platform || 'all'}). Success=${response.successCount}, Failure=${response.failureCount}`
        );

        return response;
    } catch (error) {
        logger.warn(`FCM push failed for ${ownerType}:${ownerId}: ${error.message}`);
        return { successCount: 0, failureCount: 1, error: error.message };
    }
};

export const sendNotificationToOwners = async (targets = [], payload = {}) => {
    // 🔍 Deduplicate targets by ownerType:ownerId before sending
    // This prevents duplicate notifications if the same person is listed twice (e.g. as USER and partner)
    const uniqueTargets = Array.isArray(targets)
        ? [...new Map(targets.filter(t => t?.ownerType && t?.ownerId).map(t => [`${t.ownerType}:${t.ownerId}`, t])).values()]
        : [];

    const results = [];
    // Chunking to avoid overwhelming the event loop during large broadcasts
    const CHUNK_SIZE = 50;
    for (let i = 0; i < uniqueTargets.length; i += CHUNK_SIZE) {
        const chunk = uniqueTargets.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(
            chunk.map((target) =>
                sendNotificationToOwner({
                    ownerType: target.ownerType,
                    ownerId: target.ownerId,
                    platform: target.platform,
                    payload
                })
            )
        );
        results.push(...chunkResults);
    }
    return results;
};

export const notifyAdminsSafely = async (payload = {}) => {
    try {
        const admins = await FoodAdmin.find({ isActive: true }).select('_id').lean();
        if (!admins.length) return [];

        const targets = admins.map(a => ({
            ownerType: 'ADMIN',
            ownerId: String(a._id)
        }));

        return await sendNotificationToOwners(targets, payload);
    } catch (e) {
        logger.error(`Error notifying admins: ${e.message}`);
        return [];
    }
};

export const sendTestNotification = async ({ ownerType, ownerId, platform }) => {
    return sendNotificationToOwner({
        ownerType,
        ownerId,
        platform,
        payload: {
            title: 'Test Notification',
            body: 'This is a test notification from Firebase push',
            data: {
                type: 'test',
                link: '/'
            }
        }
    });
};
export const notifyOwnerSafely = async (target = {}, payload = {}) => {
    try {
        return await sendNotificationToOwner({ ...target, payload });
    } catch (error) {
        logger.warn(`FCM individual push failed: ${error.message}`);
        return null;
    }
};

export const notifyOwnersSafely = async (targets = [], payload = {}) => {
    try {
        return await sendNotificationToOwners(targets, payload);
    } catch (error) {
        logger.warn(`FCM broadcast push failed: ${error.message}`);
        return [];
    }
};

export const broadcastPushToTargetsSafely = async (targets = [], payload = {}) => {
    try {
        logger.info(`[FCM Broadcast] Starting bulk push to ${targets.length} targets`);
        const uniqueTargets = Array.isArray(targets)
            ? [...new Map(targets.filter(t => t?.ownerType && t?.ownerId).map(t => [`${t.ownerType}:${t.ownerId}`, t])).values()]
            : [];

        const byType = { USER: [], RESTAURANT: [], DELIVERY_PARTNER: [], ADMIN: [] };
        uniqueTargets.forEach(t => {
            const type = t.ownerType?.toUpperCase();
            if (byType[type]) byType[type].push(t.ownerId);
        });

        let allTokens = [];

        // 1. Bulk fetch all tokens to avoid N+1 DB queries
        for (const [type, ids] of Object.entries(byType)) {
            if (!ids.length) continue;
            const model = getOwnerModel(type);
            if (!model) continue;

            // Process DB fetches in chunks to avoid massive $in array limits
            const DB_CHUNK = 1000;
            for (let i = 0; i < ids.length; i += DB_CHUNK) {
                const chunkIds = ids.slice(i, i + DB_CHUNK);
                const docs = await model.find({ _id: { $in: chunkIds } }).select('fcmTokens fcmTokenMobile').lean();
                for (const doc of docs) {
                    const tokens = readTokensFromDoc(doc);
                    if (tokens.length > 0) allTokens.push(...tokens);
                }
            }
        }

        allTokens = [...new Set(allTokens.filter(Boolean))];
        logger.info(`[FCM Broadcast] Resolved ${allTokens.length} unique tokens. Dispatching to Firebase...`);

        // 2. Dispatch to FCM in controlled chunks
        // Firebase HTTP v1 limits: we do 50 concurrent fetch requests to avoid socket hang ups.
        const CHUNK_SIZE = 50;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < allTokens.length; i += CHUNK_SIZE) {
            const chunk = allTokens.slice(i, i + CHUNK_SIZE);
            try {
                const res = await sendPushNotification(chunk, payload);
                successCount += res.successCount || 0;
                failureCount += res.failureCount || 0;
            } catch (chunkError) {
                // One bad chunk (e.g. a transient OAuth/network error) must not stop the rest of the broadcast.
                failureCount += chunk.length;
                logger.warn(`[FCM Broadcast] Chunk ${i / CHUNK_SIZE + 1} failed: ${chunkError.message}`);
            }
            
            // Artificial delay to prevent overwhelming network interfaces on huge broadcasts
            if (i + CHUNK_SIZE < allTokens.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        logger.info(`[FCM Broadcast] Completed. Success=${successCount}, Failure=${failureCount}`);
        return { successCount, failureCount };
    } catch (error) {
        logger.error(`[FCM Broadcast] Critical failure during bulk push: ${error.message}`);
        return { successCount: 0, failureCount: 0, error: error.message };
    }
};
