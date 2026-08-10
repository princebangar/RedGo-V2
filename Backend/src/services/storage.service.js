import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { config } from '../config/env.js';

const UPLOADS_ROOT = config.uploadsRoot;

/**
 * Local disk storage — the replacement for cloudinary.service.js.
 *
 * Files live flat in UPLOADS_ROOT and nginx serves them straight off disk at
 * /uploads/<filename>; Node never streams them. The filename keeps the shape the
 * Cloudinary export produced (folder path flattened with underscores) so the
 * 4,200 migrated assets and everything uploaded from now on share one convention.
 *
 *   folder 'food/restaurants/pan' -> food_restaurants_pan_<id>.webp
 */

const ensureRoot = async () => {
    await fs.promises.mkdir(UPLOADS_ROOT, { recursive: true });
};

/** 'food/restaurants/pan' -> 'food_restaurants_pan' (path separators only; no traversal). */
export const flattenFolder = (folder) => {
    const cleaned = String(folder || 'uploads')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\.{2,}/g, '')
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^A-Za-z0-9/_-]/g, '')
        .replace(/\/+/g, '_');
    return cleaned || 'uploads';
};

/** 20 hex chars, same length/shape as a Cloudinary public id. */
const randomId = () => crypto.randomBytes(10).toString('hex');

/** Public URL for a stored file. */
export const buildAssetUrl = (filename) => `${config.assetBaseUrl}/uploads/${filename}`;

/**
 * Encode to WebP. Documents (PAN/Aadhaar/FSSAI) go through here too, so quality
 * stays high enough to keep printed text legible. Falls back to the original
 * bytes for anything sharp cannot decode.
 */
const encodeImage = async (buffer, { maxWidth } = {}) => {
    try {
        let pipeline = sharp(buffer, { animated: true, failOn: 'none' });
        if (maxWidth) {
            pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
        }
        const meta = await sharp(buffer, { failOn: 'none' }).metadata().catch(() => ({}));
        const out = await pipeline.webp({ quality: 90, effort: 4 }).toBuffer();
        return { buffer: out, ext: 'webp', width: meta.width, height: meta.height };
    } catch {
        return { buffer, ext: 'bin', width: undefined, height: undefined };
    }
};

/**
 * Store an image buffer. Mirrors uploadImageBufferDetailed from the Cloudinary
 * service: `secure_url` and `public_id` keep their names so callers and stored
 * documents need no reshaping.
 *
 * @param {Buffer} buffer
 * @param {string} folder logical folder, e.g. 'food/restaurants/pan'
 * @param {{ maxWidth?: number }} [options]
 */
export const storeImageBuffer = async (buffer, folder = 'uploads', options = {}) => {
    if (!buffer || !buffer.length) {
        throw new Error('File buffer is required');
    }

    await ensureRoot();

    const { buffer: data, ext, width, height } = await encodeImage(buffer, options);
    const base = `${flattenFolder(folder)}_${randomId()}`;
    const filename = `${base}.${ext}`;

    await fs.promises.writeFile(path.join(UPLOADS_ROOT, filename), data);

    return {
        secure_url: buildAssetUrl(filename),
        url: buildAssetUrl(filename),
        public_id: base,
        filename,
        format: ext,
        bytes: data.length,
        width,
        height,
        resource_type: 'image'
    };
};

/** Store a video/raw buffer verbatim (no transcoding). */
export const storeFileBuffer = async (buffer, folder = 'uploads', originalName = '') => {
    if (!buffer || !buffer.length) {
        throw new Error('File buffer is required');
    }

    await ensureRoot();

    const rawExt = path.extname(String(originalName || '')).replace(/[^.A-Za-z0-9]/g, '');
    const ext = rawExt || '.bin';
    const base = `${flattenFolder(folder)}_${randomId()}`;
    const filename = `${base}${ext}`;

    await fs.promises.writeFile(path.join(UPLOADS_ROOT, filename), buffer);

    return {
        secure_url: buildAssetUrl(filename),
        url: buildAssetUrl(filename),
        public_id: base,
        filename,
        format: ext.replace('.', ''),
        bytes: buffer.length
    };
};

/**
 * Resolve a stored URL, filename, or legacy Cloudinary public_id to a filename
 * inside UPLOADS_ROOT. A legacy id ('food/hero-banners/abc') flattens to exactly
 * the name the export produced, so records written before the migration still
 * point at the right file.
 */
export const resolveStoredFilename = async (urlOrPublicId) => {
    if (!urlOrPublicId) return null;

    let name = String(urlOrPublicId).trim();
    if (/^https?:\/\//i.test(name)) {
        try {
            name = decodeURIComponent(new URL(name).pathname);
        } catch {
            return null;
        }
        // A Cloudinary URL carries the folder in its path — flatten it the same
        // way the export did, dropping the /image/upload/v123/ prefix.
        const marker = name.match(/\/(?:image|video|raw)\/upload\/(.+)$/i);
        if (marker) {
            name = marker[1]
                .split('/')
                .filter((p) => !/^v\d+$/.test(p))
                .join('_');
        }
    }
    name = name.replace(/\\/g, '/');
    if (name.includes('/')) {
        name = name.replace(/^\/?uploads\//i, '').replace(/\//g, '_');
    }
    name = path.basename(name);
    if (!name || name === '.' || name === '..') return null;

    if (path.extname(name)) return name;

    // Legacy public ids carry no extension; find the one file that matches.
    try {
        const entries = await fs.promises.readdir(UPLOADS_ROOT);
        return entries.find((f) => f.startsWith(`${name}.`)) || null;
    } catch {
        return null;
    }
};

/**
 * Delete a stored asset. Never throws — a failed cleanup must not block the
 * record deletion that triggered it (same contract the Cloudinary calls had).
 * @returns {Promise<boolean>} true when a file was removed
 */
export const deleteStoredAsset = async (urlOrPublicId) => {
    const filename = await resolveStoredFilename(urlOrPublicId);
    if (!filename) return false;
    try {
        await fs.promises.unlink(path.join(UPLOADS_ROOT, filename));
        return true;
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Failed to delete upload ${filename}:`, err.message);
        }
        return false;
    }
};

/** Convenience wrapper for the many call sites that only need the URL. */
export const uploadImageBuffer = async (buffer, folder = 'uploads', options = {}) => {
    const result = await storeImageBuffer(buffer, folder, options);
    return result.secure_url;
};

export { UPLOADS_ROOT };
