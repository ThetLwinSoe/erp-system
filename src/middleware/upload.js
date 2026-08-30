const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const r2Client = require('../config/r2');

const REQUIRED_R2_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
const missingR2Vars = REQUIRED_R2_VARS.filter((key) => !process.env[key]);
if (missingR2Vars.length > 0) {
  console.warn(`[upload] Missing R2 env vars: ${missingR2Vars.join(', ')} - logo upload will fail until these are set.`);
}

const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2MB max

// Logo storage - Cloudflare R2 (S3-compatible)
// Falls back to a placeholder bucket name so a missing env var fails only
// logo uploads at request time (via the R2 SDK's own error), not the
// entire server at boot - multer-s3 throws synchronously if bucket is undefined.
const storage = multerS3({
  s3: r2Client,
  bucket: process.env.R2_BUCKET_NAME || 'unconfigured-bucket',
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `logos/logo-${uniqueSuffix}${ext}`);
  },
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: LOGO_MAX_SIZE,
  },
});

// CSV import - kept in memory, never written to disk
const csvFileFilter = (req, file, cb) => {
  const allowedMimes = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'];
  const hasCsvExtension = file.originalname.toLowerCase().endsWith('.csv');
  if (hasCsvExtension || allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
  }
};

const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
  },
});

module.exports = {
  uploadLogo: upload.single('logo'),
  uploadCSV: csvUpload.single('file'),
};
