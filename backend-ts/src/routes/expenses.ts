import { Router } from 'express';
import { ExpenseController } from '@controllers/expense';
import { authenticate, authorize } from '@middlewares/auth';
import { validateRequest, validateParams } from '@middlewares/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createExpenseSchema = Joi.object({
  originalCurrency: Joi.string().length(3).required(),
  originalAmount: Joi.number().positive().precision(2).required(),
  date: Joi.date().required(),
  category: Joi.string().required().max(50),
  description: Joi.string().max(500).optional(),
  receiptUrl: Joi.string().uri().optional(),
});

const approveExpenseSchema = Joi.object({
  action: Joi.string().valid('approve', 'reject').required(),
  comments: Joi.string().max(500).optional(),
});

const expenseIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// Apply authentication to all routes
router.use(authenticate);

// Routes
router.get('/', ExpenseController.getExpenses);
router.post('/', validateRequest(createExpenseSchema), ExpenseController.createExpense);
router.put('/:id/submit', validateParams(expenseIdSchema), ExpenseController.submitExpense);
router.get('/:id', validateParams(expenseIdSchema), ExpenseController.getExpenseById);
router.post('/:id/approve', 
  validateParams(expenseIdSchema), 
  validateRequest(approveExpenseSchema), 
  ExpenseController.approveExpense
);
router.get('/:id/history', 
  validateParams(expenseIdSchema), 
  authorize(['ADMIN', 'MANAGER']), 
  ExpenseController.getExpenseHistory
);

export default router;