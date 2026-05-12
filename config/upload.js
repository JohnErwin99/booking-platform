const multer = require('multer');
const path = require('path');

// Use Cloudinary if configured, otherwise fall back to local disk
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

let upload;

if (useCloudinary) {
  const { v2: cloudinary } = require('cloudinary');
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'bookwize',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      transformation: [{ width: 500, height: 500, crop: 'limit', quality: 'auto' }],
    },
  });

  upload = multer({ storage, limits: { fileSize: 1 * 1024 * 1024 } });
  console.log('  Upload storage:  Cloudinary');
} else {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '..', 'public', 'uploads'));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      cb(null, name);
    }
  });

  const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'), false);
    }
  };

  upload = multer({ storage, fileFilter, limits: { fileSize: 1 * 1024 * 1024 } });
}

/**
 * Get the URL for an uploaded file.
 * Cloudinary: req.file.path (full https URL)
 * Local disk: /uploads/filename
 */
function getUploadUrl(file) {
  return file.path && file.path.startsWith('http') ? file.path : `/uploads/${file.filename}`;
}

module.exports = upload;
module.exports.getUploadUrl = getUploadUrl;
