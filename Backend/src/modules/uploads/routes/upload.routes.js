import express from 'express';
import { upload } from '../../../middleware/upload.js';
import { uploadImageBuffer, uploadVideoBuffer } from '../../../services/cloudinary.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../../config/env.js';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', '..', config.uploadPath);

const router = express.Router();

// POST /v1/uploads/image
router.post('/image', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        // Always save directly to UPLOADS_ROOT without subfolders
        const uploadDir = UPLOADS_ROOT;
        await fs.promises.mkdir(uploadDir, { recursive: true });

        // Convert any format to WebP for faster loading
        const sharpInstance = sharp(req.file.buffer);
        const webpBuffer = await sharpInstance.clone().webp({ quality: 85 }).toBuffer();

        // Extract dominant color from top 10px strip for theme-color
        let dominantColor = '#D91F3A'; // fallback
        try {
            const { data, info } = await sharp(req.file.buffer)
                .resize({ width: 100, height: 10, fit: 'cover', position: 'top' })
                .raw()
                .toBuffer({ resolveWithObject: true });
            let r = 0, g = 0, b = 0;
            const pixels = info.width * info.height;
            for (let i = 0; i < data.length; i += info.channels) {
                r += data[i]; g += data[i + 1]; b += data[i + 2];
            }
            r = Math.round(r / pixels);
            g = Math.round(g / pixels);
            b = Math.round(b / pixels);
            dominantColor = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        } catch (colorErr) { /* use fallback */ }

        const filename = `image_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
        const filePath = path.join(uploadDir, filename);

        await fs.promises.writeFile(filePath, webpBuffer);

        let baseUrl = `${req.protocol}://${req.get('host')}`;
        if (process.env.API_BASE_URL) {
            baseUrl = process.env.API_BASE_URL;
        }

        // The URL needs to match the express.static mapping.
        // It goes directly in UPLOADS_ROOT, so URL is /uploads/filename
        const url = `${baseUrl}/uploads/${filename}`;

        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                url,
                dominantColor,
                publicId: null
            }
        });
    } catch (error) {
        next(error);
    }
});


// POST /v1/uploads/video
router.post('/video', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        const mimeType = String(req.file.mimetype || '').toLowerCase();
        if (!mimeType.startsWith('video/')) {
            return res.status(400).json({
                success: false,
                message: 'Only video files are allowed'
            });
        }

        const folder = typeof req.body?.folder === 'string' && req.body.folder.trim()
            ? req.body.folder.trim()
            : 'uploads/videos';

        // Always save directly to UPLOADS_ROOT without subfolders
        const uploadDir = UPLOADS_ROOT;
        await fs.promises.mkdir(uploadDir, { recursive: true });

        const ext = path.extname(req.file.originalname || '') || '.mp4';
        const filename = `video_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        const filePath = path.join(uploadDir, filename);

        await fs.promises.writeFile(filePath, req.file.buffer);

        let baseUrl = `${req.protocol}://${req.get('host')}`;
        if (process.env.API_BASE_URL) {
            baseUrl = process.env.API_BASE_URL;
        }

        // The URL needs to match the express.static mapping.
        // It goes directly in UPLOADS_ROOT, so URL is /uploads/filename
        const url = `${baseUrl}/uploads/${filename}`;

        return res.status(200).json({
            success: true,
            message: 'Video uploaded successfully',
            data: {
                url,
                publicId: null
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;

