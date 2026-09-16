import multer from 'multer';
import { isAllowedImageType, isAllowedPdfType } from '../services/s3.js';

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

export const eLibraryPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (isAllowedPdfType(file.mimetype, file.originalname)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF files are allowed.'));
  },
}).single('file');
