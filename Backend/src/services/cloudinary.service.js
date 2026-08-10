/**
 * @deprecated Uploads now go to local disk and are served by nginx.
 * Kept as a delegating shim so no code path can silently start pushing new
 * assets back to Cloudinary. Import ../services/storage.service.js instead.
 */
import { storeImageBuffer, storeFileBuffer } from './storage.service.js';

export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    const result = await storeImageBuffer(buffer, folder);
    return result.secure_url;
};

export const uploadImageBufferDetailed = async (buffer, folder = 'uploads') =>
    storeImageBuffer(buffer, folder);

export const uploadVideoBuffer = async (buffer, folder = 'uploads') => {
    const result = await storeFileBuffer(buffer, folder, 'video.mp4');
    return result.secure_url;
};
