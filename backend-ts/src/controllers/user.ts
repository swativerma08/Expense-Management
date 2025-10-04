import { Response } from 'express';
import { prisma } from '@config/database';
import { AppError, asyncHandler } from '@middlewares/error';
import { AuthenticatedRequest } from '@middlewares/auth';
import bcrypt from 'bcryptjs';
import { config } from '@config/index';
import { AuditService } from '@services/audit';

export class UserController {
  static getUsers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.user!;
    const { page = 1, limit = 10, role, isActive } = req.query;

    const where: any = { companyId };
    
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          manager: {
            select: { id: true, name: true, email: true },
          },
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  });

  static createUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId: createdBy } = req.user!;
    const { name, email, password, role, managerId } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 400);
    }

    // Validate manager exists and belongs to same company
    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });

      if (!manager || manager.companyId !== companyId) {
        throw new AppError('Invalid manager ID', 400);
      }
    }

    const passwordHash = await bcrypt.hash(password, config.security.bcryptSaltRounds);

    const user = await prisma.user.create({
      data: {
        companyId,
        name,
        email,
        passwordHash,
        role,
        managerId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        manager: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Log audit
    await AuditService.log({
      entity: 'User',
      entityId: user.id,
      action: 'CREATE',
      byUserId: createdBy,
      companyId,
      snapshot: { email: user.email, role: user.role },
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user },
    });
  });

  static updateUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId: updatedBy } = req.user!;
    const { id } = req.params;
    const { name, role, managerId, isActive } = req.body;

    // Get current user data for audit
    const currentUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!currentUser || currentUser.companyId !== companyId) {
      throw new AppError('User not found', 404);
    }

    // Validate manager exists and belongs to same company
    if (managerId && managerId !== currentUser.managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });

      if (!manager || manager.companyId !== companyId) {
        throw new AppError('Invalid manager ID', 400);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        role,
        managerId,
        isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
        manager: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Log audit
    await AuditService.log({
      entity: 'User',
      entityId: id,
      action: 'UPDATE',
      byUserId: updatedBy,
      companyId,
      snapshot: { 
        name: updatedUser.name,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
      },
      changes: {
        from: {
          name: currentUser.name,
          role: currentUser.role,
          isActive: currentUser.isActive,
        },
        to: {
          name: updatedUser.name,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
        },
      },
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser },
    });
  });

  static deleteUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId: deletedBy } = req.user!;
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.companyId !== companyId) {
      throw new AppError('User not found', 404);
    }

    // Prevent deleting the last admin
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { companyId, role: 'ADMIN', isActive: true },
      });

      if (adminCount <= 1) {
        throw new AppError('Cannot delete the last admin user', 400);
      }
    }

    // Soft delete by deactivating
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Log audit
    await AuditService.log({
      entity: 'User',
      entityId: id,
      action: 'DELETE',
      byUserId: deletedBy,
      companyId,
      snapshot: { email: user.email, role: user.role },
    });

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });
  });

  static getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.user!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
        manager: {
          select: { id: true, name: true, email: true },
        },
        company: {
          select: { id: true, name: true, defaultCurrency: true },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: { user },
    });
  });
}