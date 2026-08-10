import multer from 'multer';

/**
 * Multer buffers uploads in memory before storage.service writes them to disk.
 * With Cloudinary gone the bytes land on our own VPS volume, so the request must
 * be bounded: an unlimited memoryStorage upload is both a heap and a disk-fill
 * risk. Keep MAX_FILE_SIZE_MB <= nginx client_max_body_size (25M).
 */
const MAX_FILE_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);
const MAX_FILES_PER_REQUEST = Number(process.env.MAX_UPLOAD_FILES || 20);

const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'video/mp4',
    'video/quicktime',
    'video/webm'
]);

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (ALLOWED_MIME.has(mime)) {
        return cb(null, true);
    }
    const err = new Error(`Unsupported file type: ${file.mimetype}`);
    err.statusCode = 400;
    err.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(err);
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
        files: MAX_FILES_PER_REQUEST,
        fields: 100
    }
});
