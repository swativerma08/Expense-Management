const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// File filter for receipts
const fileFilter = (req, file, cb) => {
  // Allow images and PDFs
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
  }
};

// Local storage configuration (for development)
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/receipts/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

// S3 storage configuration (for production)
const s3Storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET || 'expense-management-receipts',
  key: (req, file, cb) => {
    const folder = `receipts/${req.user.company_id}/${req.user.id}`;
    const uniqueName = `${uuidv4()}-${Date.now()}-${file.originalname}`;
    cb(null, `${folder}/${uniqueName}`);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
  metadata: (req, file, cb) => {
    cb(null, {
      fieldName: file.fieldname,
      uploadedBy: req.user.id,
      companyId: req.user.company_id
    });
  }
});

// Choose storage based on environment
const storage = process.env.NODE_ENV === 'production' && process.env.AWS_S3_BUCKET 
  ? s3Storage 
  : localStorage;

// Create multer upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file upload
  }
});

// Generate signed URL for S3 files
const generateSignedUrl = async (key, expiresIn = 3600) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.AWS_S3_BUCKET) {
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Expires: expiresIn
      };
      
      return s3.getSignedUrl('getObject', params);
    } else {
      // For local development, return the local file path
      return `/uploads/receipts/${key}`;
    }
  } catch (error) {
    logger.error('Failed to generate signed URL:', error);
    throw error;
  }
};

// Delete file from S3
const deleteFile = async (key) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.AWS_S3_BUCKET) {
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      };
      
      await s3.deleteObject(params).promise();
      logger.info('File deleted from S3:', { key });
    } else {
      // For local development, delete local file
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join('uploads/receipts', key);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('Local file deleted:', { filePath });
      }
    }
  } catch (error) {
    logger.error('Failed to delete file:', error);
    throw error;
  }
};

// Upload middleware with error handling
const uploadMiddleware = (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File too large. Maximum size is 10MB.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          error: 'Too many files. Only one file is allowed.'
        });
      }
      return res.status(400).json({
        error: 'File upload error: ' + err.message
      });
    } else if (err) {
      return res.status(400).json({
        error: err.message
      });
    }
    next();
  });
};

// Get file info from storage
const getFileInfo = async (key) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.AWS_S3_BUCKET) {
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      };
      
      const headObject = await s3.headObject(params).promise();
      return {
        key,
        size: headObject.ContentLength,
        lastModified: headObject.LastModified,
        contentType: headObject.ContentType,
        metadata: headObject.Metadata
      };
    } else {
      // For local files
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join('uploads/receipts', key);
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return {
          key,
          size: stats.size,
          lastModified: stats.mtime,
          contentType: 'application/octet-stream' // Default for local files
        };
      }
      return null;
    }
  } catch (error) {
    logger.error('Failed to get file info:', error);
    return null;
  }
};

module.exports = {
  uploadMiddleware,
  generateSignedUrl,
  deleteFile,
  getFileInfo,
  s3
};