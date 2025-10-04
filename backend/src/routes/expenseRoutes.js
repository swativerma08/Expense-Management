const express = require('express');
const router = express.Router();
const {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  submitExpense,
  deleteExpense,
  getExpenseStats
} = require('../controllers/expenseController');
const { authenticate, authorize, companyAccess } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validateCreateExpense = [
  body('original_currency')
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter code'),
  body('original_amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),
  body('expense_date')
    .isISO8601()
    .withMessage('Expense date must be a valid date'),
  body('category')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category is required and must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('receipt_url')
    .optional()
    .isURL()
    .withMessage('Receipt URL must be a valid URL')
];

const validateUpdateExpense = [
  body('original_currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter code'),
  body('original_amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),
  body('expense_date')
    .optional()
    .isISO8601()
    .withMessage('Expense date must be a valid date'),
  body('category')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('receipt_url')
    .optional()
    .isURL()
    .withMessage('Receipt URL must be a valid URL')
];

const validateExpenseId = [
  param('expenseId')
    .isUUID()
    .withMessage('Expense ID must be a valid UUID')
];

const validateExpenseQuery = [
  query('status')
    .optional()
    .isIn(['draft', 'submitted', 'approved', 'rejected', 'paid'])
    .withMessage('Status must be one of: draft, submitted, approved, rejected, paid'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('amount_min')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be a non-negative number'),
  query('amount_max')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be a non-negative number'),
  query('date_from')
    .optional()
    .isISO8601()
    .withMessage('Date from must be a valid date'),
  query('date_to')
    .optional()
    .isISO8601()
    .withMessage('Date to must be a valid date'),
  query('user_id')
    .optional()
    .isUUID()
    .withMessage('User ID must be a valid UUID')
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
router.post('/', 
  authenticate, 
  companyAccess, 
  validateCreateExpense, 
  handleValidationErrors, 
  createExpense
);

router.get('/', 
  authenticate, 
  companyAccess, 
  validateExpenseQuery, 
  handleValidationErrors, 
  getExpenses
);

router.get('/stats', 
  authenticate, 
  companyAccess, 
  getExpenseStats
);

router.get('/:expenseId', 
  authenticate, 
  validateExpenseId, 
  handleValidationErrors, 
  getExpenseById
);

router.put('/:expenseId', 
  authenticate, 
  validateExpenseId, 
  validateUpdateExpense, 
  handleValidationErrors, 
  updateExpense
);

router.put('/:expenseId/submit', 
  authenticate, 
  validateExpenseId, 
  handleValidationErrors, 
  submitExpense
);

router.delete('/:expenseId', 
  authenticate, 
  validateExpenseId, 
  handleValidationErrors, 
  deleteExpense
);

module.exports = router;