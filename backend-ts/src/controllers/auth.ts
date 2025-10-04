import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '@config/database';
import { JWTService } from '@utils/jwt';
import { AppError, asyncHandler } from '@middlewares/error';
import { logger } from '@utils/logger';
import { config } from '@config/index';
import { AuditService } from '@services/audit';

export class AuthController {
  static signup = asyncHandler(async (req: Request, res: Response) => {
    const { companyName, country, defaultCurrency, adminName, email, password } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.security.bcryptSaltRounds);

    // Create company and admin user in transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Create company
      const company = await tx.company.create({
        data: {
          name: companyName,
          country,
          defaultCurrency,
        },
      });

      // Create admin user
      const admin = await tx.user.create({
        data: {
          companyId: company.id,
          name: adminName,
          email,
          passwordHash,
          role: 'ADMIN',
        },
      });

      return { company, admin };
    });

    // Generate tokens
    const payload = {
      userId: result.admin.id,
      email: result.admin.email,
      role: result.admin.role,
      companyId: result.company.id,
    };

    const tokens = JWTService.generateTokenPair(payload);

    // Log audit
    await AuditService.log({
      entity: 'User',
      entityId: result.admin.id,
      action: 'CREATE',
      byUserId: result.admin.id,
      companyId: result.company.id,
      snapshot: { email: result.admin.email, role: result.admin.role },
    });

    logger.info(`New company registered: ${companyName} by ${email}`);

    res.status(201).json({
      success: true,
      message: 'Company and admin account created successfully',
      data: {
        user: {
          id: result.admin.id,
          name: result.admin.name,
          email: result.admin.email,
          role: result.admin.role,
        },
        company: {
          id: result.company.id,
          name: result.company.name,
          country: result.company.country,
          defaultCurrency: result.company.defaultCurrency,
        },
        tokens,
      },
    });
  });

  static login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Find user with company
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    const tokens = JWTService.generateTokenPair(payload);

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLoginAt: user.lastLoginAt,
        },
        company: {
          id: user.company.id,
          name: user.company.name,
          defaultCurrency: user.company.defaultCurrency,
        },
        tokens,
      },
    });
  });

  static refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    try {
      const payload = JWTService.verifyRefreshToken(refreshToken);
      
      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || !user.isActive) {
        throw new AppError('Invalid refresh token', 401);
      }

      // Generate new tokens
      const newTokens = JWTService.generateTokenPair(payload);

      res.json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: { tokens: newTokens },
      });
    } catch (error) {
      throw new AppError('Invalid refresh token', 401);
    }
  });

  static logout = asyncHandler(async (req: Request, res: Response) => {
    // In a real implementation, you might want to blacklist the token
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  });
}