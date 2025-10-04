const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  searchUsers,
  getDirectReports
} = require('../controllers/userController');
const { authenticate, authorize, managerAccess } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validateCreateUser = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('role')
    .isIn(['admin', 'manager', 'employee'])
    .withMessage('Role must be admin, manager, or employee'),
  body('manager_id')
    .optional()
    .isUUID()
    .withMessage('Manager ID must be a valid UUID')
];

const validateUpdateUser = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('role')
    .optional()
    .isIn(['admin', 'manager', 'employee'])
    .withMessage('Role must be admin, manager, or employee'),
  body('manager_id')
    .optional()
    .isUUID()
    .withMessage('Manager ID must be a valid UUID'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean')
];

const validateUserId = [
  param('userId')
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
router.get('/', authenticate, getUsers);
router.get('/search', authenticate, searchUsers);
router.get('/:userId', authenticate, validateUserId, handleValidationErrors, managerAccess, getUserById);
router.post('/', authenticate, authorize('admin'), validateCreateUser, handleValidationErrors, createUser);
router.put('/:userId', authenticate, validateUserId, validateUpdateUser, handleValidationErrors, updateUser);
router.delete('/:userId', authenticate, authorize('admin'), validateUserId, handleValidationErrors, deleteUser);
router.get('/:managerId/direct-reports', authenticate, authorize('admin', 'manager'), validateUserId, handleValidationErrors, getDirectReports);

module.exports = router;