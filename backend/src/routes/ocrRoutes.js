const express = require('express');
const router = express.Router();
const {
  uploadAndProcessReceipt,
  processExistingReceipt,
  getOCRRecords,
  getOCRRecord,
  reprocessOCR,
  testOCR,
  uploadMiddleware
} = require('../controllers/ocrController');
const { authenticate, companyAccess } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validateProcessExistingReceipt = [
  body('fileUrl')
    .isURL()
    .withMessage('File URL must be a valid URL'),
  body('expenseId')
    .isUUID()
    .withMessage('Expense ID must be a valid UUID')
];

const validateExpenseId = [
  param('expenseId')
    .isUUID()
    .withMessage('Expense ID must be a valid UUID')
];

const validateOCRId = [
  param('ocrId')
    .isUUID()
    .withMessage('OCR ID must be a valid UUID')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Routes
// Upload and process receipt
router.post('/upload', 
  authenticate, 
  companyAccess, 
  uploadMiddleware, 
  uploadAndProcessReceipt
);

// Process existing receipt URL
router.post('/process', 
  authenticate, 
  companyAccess, 
  validateProcessExistingReceipt, 
  handleValidationErrors, 
  processExistingReceipt
);

// Get OCR records for an expense
router.get('/expenses/:expenseId', 
  authenticate, 
  validateExpenseId, 
  handleValidationErrors, 
  getOCRRecords
);

// Get specific OCR record
router.get('/:ocrId', 
  authenticate, 
  validateOCRId, 
  handleValidationErrors, 
  getOCRRecord
);

// Reprocess OCR
router.post('/:ocrId/reprocess', 
  authenticate, 
  validateOCRId, 
  handleValidationErrors, 
  reprocessOCR
);

// Test OCR (development only)
if (process.env.NODE_ENV !== 'production') {
  router.get('/test/demo', testOCR);
}

module.exports = router;