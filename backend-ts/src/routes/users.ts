import { Router } from 'express';
import { UserController } from '@controllers/user';
import { authenticate, authorize } from '@middlewares/auth';
import { validateRequest } from '@middlewares/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createUserSchema = Joi.object({
  name: Joi.string().required().max(100),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'EMPLOYEE').required(),
  managerId: Joi.string().uuid().optional(),
});

const updateUserSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'EMPLOYEE').optional(),
  managerId: Joi.string().uuid().optional(),
  isActive: Joi.boolean().optional(),
});

// Apply authentication to all routes
router.use(authenticate);

// Routes
router.get('/', authorize(['ADMIN']), UserController.getUsers);
router.post('/', authorize(['ADMIN']), validateRequest(createUserSchema), UserController.createUser);
router.put('/:id', authorize(['ADMIN']), validateRequest(updateUserSchema), UserController.updateUser);
router.delete('/:id', authorize(['ADMIN']), UserController.deleteUser);
router.get('/profile', UserController.getProfile);

export default router;