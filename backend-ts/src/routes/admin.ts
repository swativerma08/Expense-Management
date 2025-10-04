import { Router } from 'express';
import { AdminController } from '@controllers/admin';
import { authenticate, authorize } from '@middlewares/auth';
import { validateRequest, validateParams } from '@middlewares/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createRuleSchema = Joi.object({
  name: Joi.string().required().max(100),
  type: Joi.string().valid('SEQUENTIAL', 'PARALLEL', 'PERCENTAGE', 'SPECIFIC', 'HYBRID').required(),
  thresholdPercent: Joi.number().min(1).max(100).optional(),
  specificApproverId: Joi.string().uuid().optional(),
  appliesToCategory: Joi.string().max(50).optional(),
  minAmount: Joi.number().min(0).precision(2).optional(),
  maxAmount: Joi.number().min(0).precision(2).optional(),
  priority: Joi.number().integer().min(0).optional(),
});

const updateRuleSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  type: Joi.string().valid('SEQUENTIAL', 'PARALLEL', 'PERCENTAGE', 'SPECIFIC', 'HYBRID').optional(),
  thresholdPercent: Joi.number().min(1).max(100).optional(),
  specificApproverId: Joi.string().uuid().optional(),
  appliesToCategory: Joi.string().max(50).optional(),
  minAmount: Joi.number().min(0).precision(2).optional(),
  maxAmount: Joi.number().min(0).precision(2).optional(),
  priority: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

const ruleIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize(['ADMIN']));

// Routes
router.get('/rules', AdminController.getApprovalRules);
router.post('/rules', validateRequest(createRuleSchema), AdminController.createApprovalRule);
router.put('/rules/:id', validateParams(ruleIdSchema), validateRequest(updateRuleSchema), AdminController.updateApprovalRule);
router.delete('/rules/:id', validateParams(ruleIdSchema), AdminController.deleteApprovalRule);
router.get('/audit-logs', AdminController.getAuditLogs);
router.get('/stats', AdminController.getCompanyStats);

export default router;