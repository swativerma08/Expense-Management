const express = require('express');
const router = express.Router();
const {
  getPendingApprovals,
  processApproval,
  getApprovalHistory,
  createApprovalRule,
  getApprovalRules,
  updateApprovalRule,
  deleteApprovalRule,
  resetApprovalWorkflow
} = require('../controllers/approvalController');
const { authenticate, authorize, companyAccess } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validateApprovalAction = [
  body('action')
    .isIn(['approve', 'reject'])
    .withMessage('Action must be either "approve" or "reject"'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comments must be less than 1000 characters')
];

const validateCreateApprovalRule = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name is required and must be less than 255 characters'),
  body('type')
    .isIn(['sequential', 'parallel', 'percentage', 'specific', 'hybrid'])
    .withMessage('Invalid approval rule type'),
  body('threshold_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Threshold amount must be a positive number'),
  body('threshold_percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Threshold percentage must be between 0 and 100'),
  body('specific_approver_id')
    .optional()
    .isUUID()
    .withMessage('Specific approver ID must be a valid UUID'),
  body('applies_to_category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must be less than 100 characters'),
  body('applies_to_role')
    .optional()
    .isIn(['admin', 'manager', 'employee'])
    .withMessage('Role must be admin, manager, or employee'),
  body('sequence_order')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Sequence order must be a positive integer')
];

const validateUpdateApprovalRule = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name must be less than 255 characters'),
  body('type')
    .optional()
    .isIn(['sequential', 'parallel', 'percentage', 'specific', 'hybrid'])
    .withMessage('Invalid approval rule type'),
  body('threshold_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Threshold amount must be a positive number'),
  body('threshold_percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Threshold percentage must be between 0 and 100'),
  body('specific_approver_id')
    .optional()
    .isUUID()
    .withMessage('Specific approver ID must be a valid UUID'),
  body('applies_to_category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must be less than 100 characters'),
  body('applies_to_role')
    .optional()
    .isIn(['admin', 'manager', 'employee'])
    .withMessage('Role must be admin, manager, or employee'),
  body('sequence_order')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Sequence order must be a positive integer'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean')
];

const validateStepId = [
  param('stepId')
    .isUUID()
    .withMessage('Step ID must be a valid UUID')
];

const validateRuleId = [
  param('ruleId')
    .isUUID()
    .withMessage('Rule ID must be a valid UUID')
];

const validateExpenseId = [
  param('expenseId')
    .isUUID()
    .withMessage('Expense ID must be a valid UUID')
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
// Approval processing
router.get('/pending', authenticate, authorize('admin', 'manager'), getPendingApprovals);
router.post('/:stepId/process', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateStepId, 
  validateApprovalAction, 
  handleValidationErrors, 
  processApproval
);
router.get('/expenses/:expenseId/history', 
  authenticate, 
  validateExpenseId, 
  handleValidationErrors, 
  getApprovalHistory
);

// Approval rules management (admin only)
router.get('/rules', 
  authenticate, 
  authorize('admin'), 
  companyAccess, 
  getApprovalRules
);
router.post('/rules', 
  authenticate, 
  authorize('admin'), 
  companyAccess, 
  validateCreateApprovalRule, 
  handleValidationErrors, 
  createApprovalRule
);
router.put('/rules/:ruleId', 
  authenticate, 
  authorize('admin'), 
  validateRuleId, 
  validateUpdateApprovalRule, 
  handleValidationErrors, 
  updateApprovalRule
);
router.delete('/rules/:ruleId', 
  authenticate, 
  authorize('admin'), 
  validateRuleId, 
  handleValidationErrors, 
  deleteApprovalRule
);

// Admin tools
router.post('/expenses/:expenseId/reset', 
  authenticate, 
  authorize('admin'), 
  validateExpenseId, 
  handleValidationErrors, 
  resetApprovalWorkflow
);

module.exports = router;