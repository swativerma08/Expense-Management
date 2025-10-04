import { Router } from 'express';
import { CurrencyService } from '@services/currency';
import { OCRService } from '@services/ocr';
import { authenticate } from '@middlewares/auth';
import { asyncHandler } from '@middlewares/error';
import { validateQuery } from '@middlewares/validation';
import Joi from 'joi';
import multer from 'multer';
import { config } from '@config/index';

const router = Router();

// File upload configuration
const upload = multer({
  limits: {
    fileSize: config.upload.maxFileSize,
  },
  fileFilter: (req: any, file: any, cb: any) => {
    if (config.upload.allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
});

// Validation schemas
const exchangeRateSchema = Joi.object({
  base: Joi.string().length(3).required(),
});

// Apply authentication
router.use(authenticate);

// Exchange rates endpoint
router.get('/exchange-rates', 
  validateQuery(exchangeRateSchema),
  asyncHandler(async (req: any, res: any) => {
    const { base } = req.query as { base: string };
    
    const rates = await CurrencyService.getLatestRates(base);
    
    res.json({
      success: true,
      data: {
        baseCurrency: base,
        rates,
        timestamp: new Date(),
      },
    });
  })
);

// OCR endpoint (placeholder for MVP)
router.post('/ocr',
  upload.single('receipt'),
  asyncHandler(async (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // In production, upload to S3 and get URL
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Process OCR
    const result = await OCRService.processReceipt(fileUrl);
    
    res.json({
      success: true,
      message: 'OCR processing completed',
      data: result,
    });
  })
);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date(),
    version: '1.0.0',
  });
});

// System info endpoint (admin only)
router.get('/system-info', (req, res) => {
  res.json({
    success: true,
    data: {
      nodeVersion: process.version,
      environment: config.nodeEnv,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
  });
});

export default router;