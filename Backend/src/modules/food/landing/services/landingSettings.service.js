import { FoodLandingSettings } from '../models/landingSettings.model.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', config.uploadPath);

export const getLandingSettings = async (zoneId = null) => {
    let query = zoneId ? { zoneId } : { zoneId: null };
    let doc = await FoodLandingSettings.findOne(query).lean();
    if (!doc) {
        doc = (await FoodLandingSettings.create(query)).toObject();
    }
    return doc;
};

export const updateLandingSettings = async (payload, zoneId = null) => {
    let query = zoneId ? { zoneId } : { zoneId: null };
    const oldDoc = await FoodLandingSettings.findOne(query).lean();

    const doc = await FoodLandingSettings.findOneAndUpdate(query, payload, {
        new: true,
        upsert: true
    }).lean();

    // Check if video URL was removed or changed
    if (oldDoc && oldDoc.festBannerVideoUrl && oldDoc.festBannerVideoUrl !== doc.festBannerVideoUrl) {
        try {
            const oldUrl = oldDoc.festBannerVideoUrl;
            const filename = oldUrl.split('/').pop();
            if (filename && filename.startsWith('video_')) {
                const filePath = path.join(UPLOADS_ROOT, filename);
                fs.unlink(filePath, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.error("Failed to delete old video:", err);
                    }
                });
            }
        } catch (e) {
            console.error("Error trying to delete old video file:", e);
        }
    }

    return doc;
};

