import multer from 'multer';
import { isAllowedImageType } from '../services/s3.js';

export const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (isAllowedImageType(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported image type. Use JPEG, PNG, or WebP.'));
  },
}).single('file');
