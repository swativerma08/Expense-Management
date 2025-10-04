import { Router } from 'express';
import { AuthController } from '@controllers/auth';
import { validateRequest } from '@middlewares/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const signupSchema = Joi.object({
  companyName: Joi.string().required().max(100),
  country: Joi.string().required().max(50),
  defaultCurrency: Joi.string().required().length(3),
  adminName: Joi.string().required().max(100),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// Routes
router.post('/signup', validateRequest(signupSchema), AuthController.signup);
router.post('/login', validateRequest(loginSchema), AuthController.login);
router.post('/refresh', validateRequest(refreshTokenSchema), AuthController.refreshToken);
router.post('/logout', AuthController.logout);

export default router;