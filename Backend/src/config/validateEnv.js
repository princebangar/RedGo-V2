import { config } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Validates required environment configuration on startup.
 * Logs clear errors and exits if critical variables are missing.
 */
export const validateConfig = () => {
    const missing = [];

    if (!config.mongodbUri) {
        missing.push('MONGO_URI or MONGODB_URI');
    }
    if (!config.jwtAccessSecret) {
        missing.push('JWT_ACCESS_SECRET or JWT_SECRET');
    }
    if (!config.jwtRefreshSecret) {
        missing.push('JWT_REFRESH_SECRET');
    }
    if (config.redisEnabled && !config.redisUrl) {
        missing.push('REDIS_URL (required when REDIS_ENABLED=true)');
    }
    if (config.bullmqEnabled && !config.redisEnabled) {
        missing.push('REDIS_ENABLED=true (required when BULLMQ_ENABLED=true)');
    }

    // ASSET_BASE_URL is baked into every stored image URL. If it silently fell
    // back to localhost in production, new uploads would be written to the
    // database as http://localhost:5000/... and be unreachable forever.
    if (config.nodeEnv === 'production') {
        const assetBase = String(process.env.ASSET_BASE_URL || process.env.API_BASE_URL || '').trim();
        if (!assetBase) {
            missing.push('ASSET_BASE_URL (e.g. https://redgo.in — stored in every image URL)');
        } else if (!/^https:\/\//i.test(assetBase)) {
            missing.push(`ASSET_BASE_URL must be an https:// origin (got "${assetBase}")`);
        } else if (/localhost|127\.0\.0\.1/i.test(assetBase)) {
            missing.push(`ASSET_BASE_URL must not point at localhost in production (got "${assetBase}")`);
        }
    }

    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
};
