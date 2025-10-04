import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './error';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const message = error.details.map((detail: any) => detail.message).join(', ');
      return next(new AppError(message, 400));
    }
    
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.query);
    
    if (error) {
      const message = error.details.map((detail: any) => detail.message).join(', ');
      return next(new AppError(message, 400));
    }
    
    next();
  };
};

export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.params);
    
    if (error) {
      const message = error.details.map((detail: any) => detail.message).join(', ');
      return next(new AppError(message, 400));
    }
    
    next();
  };
};