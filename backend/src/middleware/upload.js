/**
 * File upload middleware using Multer
 */

import multer from 'multer';
import { validateImageFile } from '../services/imageService.js';
import { ValidationError } from '../utils/errorHandler.js';

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ValidationError(`Invalid file type. Allowed: PNG, JPG, JPEG`, 'image'));
  }
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

/**
 * Middleware to validate uploaded file (optional - only validates if file is present)
 */
export function validateUpload(req, res, next) {
  // If no file, that's okay (text-only submission)
  if (!req.file) {
    return next();
  }

  const validation = validateImageFile(req.file);
  if (!validation.valid) {
    return next(new ValidationError(validation.errors.join(', '), 'image'));
  }

  next();
}

