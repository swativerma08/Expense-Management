import { Response } from 'express';
import { prisma } from '@config/database';
import { AppError, asyncHandler } from '@middlewares/error';
import { AuthenticatedRequest } from '@middlewares/auth';
import { AuditService } from '@services/audit';

export class AdminController {
  static getApprovalRules = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.user!;
    const { page = 1, limit = 10, type, isActive } = req.query as any;

    const where: any = { companyId };
    
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const skip = (Number(page) - 1) * Number(limit);

    const [rules, total] = await Promise.all([
      prisma.approvalRule.findMany({
        where,
        include: {
          specificApprover: {
            select: { id: true, name: true, email: true },
          },
        },
        skip,
        take: Number(limit),
        orderBy: { priority: 'desc' },
      }),
      prisma.approvalRule.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        rules,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  });

  static createApprovalRule = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId } = req.user!;
    const {
      name,
      type,
      thresholdPercent,
      specificApproverId,
      appliesToCategory,
      minAmount,
      maxAmount,
      priority,
    } = req.body;

    // Validate specific approver exists
    if (specificApproverId) {
      const approver = await prisma.user.findUnique({
        where: { id: specificApproverId },
      });

      if (!approver || approver.companyId !== companyId) {
        throw new AppError('Invalid specific approver ID', 400);
      }
    }

    const rule = await prisma.approvalRule.create({
      data: {
        companyId,
        name,
        type,
        thresholdPercent,
        specificApproverId,
        appliesToCategory,
        minAmount,
        maxAmount,
        priority: priority || 0,
      },
      include: {
        specificApprover: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Log audit
    await AuditService.log({
      entity: 'ApprovalRule',
      entityId: rule.id,
      action: 'CREATE',
      byUserId: userId,
      companyId,
      snapshot: {
        name: rule.name,
        type: rule.type,
        priority: rule.priority,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Approval rule created successfully',
      data: { rule },
    });
  });

  static updateApprovalRule = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId } = req.user!;
    const { id } = req.params;
    const {
      name,
      type,
      thresholdPercent,
      specificApproverId,
      appliesToCategory,
      minAmount,
      maxAmount,
      priority,
      isActive,
    } = req.body;

    // Get current rule for audit
    const currentRule = await prisma.approvalRule.findUnique({
      where: { id },
    });

    if (!currentRule || currentRule.companyId !== companyId) {
      throw new AppError('Approval rule not found', 404);
    }

    // Validate specific approver exists
    if (specificApproverId) {
      const approver = await prisma.user.findUnique({
        where: { id: specificApproverId },
      });

      if (!approver || approver.companyId !== companyId) {
        throw new AppError('Invalid specific approver ID', 400);
      }
    }

    const updatedRule = await prisma.approvalRule.update({
      where: { id },
      data: {
        name,
        type,
        thresholdPercent,
        specificApproverId,
        appliesToCategory,
        minAmount,
        maxAmount,
        priority,
        isActive,
      },
      include: {
        specificApprover: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Log audit
    await AuditService.log({
      entity: 'ApprovalRule',
      entityId: id,
      action: 'UPDATE',
      byUserId: userId,
      companyId,
      snapshot: {
        name: updatedRule.name,
        type: updatedRule.type,
        isActive: updatedRule.isActive,
      },
      changes: {
        from: {
          name: currentRule.name,
          type: currentRule.type,
          isActive: currentRule.isActive,
        },
        to: {
          name: updatedRule.name,
          type: updatedRule.type,
          isActive: updatedRule.isActive,
        },
      },
    });

    res.json({
      success: true,
      message: 'Approval rule updated successfully',
      data: { rule: updatedRule },
    });
  });

  static deleteApprovalRule = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId } = req.user!;
    const { id } = req.params;

    const rule = await prisma.approvalRule.findUnique({
      where: { id },
    });

    if (!rule || rule.companyId !== companyId) {
      throw new AppError('Approval rule not found', 404);
    }

    await prisma.approvalRule.delete({
      where: { id },
    });

    // Log audit
    await AuditService.log({
      entity: 'ApprovalRule',
      entityId: id,
      action: 'DELETE',
      byUserId: userId,
      companyId,
      snapshot: { name: rule.name, type: rule.type },
    });

    res.json({
      success: true,
      message: 'Approval rule deleted successfully',
    });
  });

  static getAuditLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.user!;
    const {
      entity,
      entityId,
      byUserId,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query as any;

    const filters: any = {
      page: Number(page),
      limit: Number(limit),
    };

    if (entity) filters.entity = entity;
    if (entityId) filters.entityId = entityId;
    if (byUserId) filters.byUserId = byUserId;
    if (action) filters.action = action;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    const auditLogs = await AuditService.getAuditLogs(companyId, filters);

    res.json({
      success: true,
      data: auditLogs,
    });
  });

  static getCompanyStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.user!;

    const [
      totalUsers,
      activeUsers,
      totalExpenses,
      pendingExpenses,
      approvedExpenses,
      rejectedExpenses,
      totalAmount,
      approvedAmount,
    ] = await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.user.count({ where: { companyId, isActive: true } }),
      prisma.expense.count({ where: { companyId } }),
      prisma.expense.count({ where: { companyId, status: 'WAITING_APPROVAL' } }),
      prisma.expense.count({ where: { companyId, status: 'APPROVED' } }),
      prisma.expense.count({ where: { companyId, status: 'REJECTED' } }),
      prisma.expense.aggregate({
        where: { companyId },
        _sum: { convertedAmount: true },
      }),
      prisma.expense.aggregate({
        where: { companyId, status: 'APPROVED' },
        _sum: { convertedAmount: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
        },
        expenses: {
          total: totalExpenses,
          pending: pendingExpenses,
          approved: approvedExpenses,
          rejected: rejectedExpenses,
        },
        amounts: {
          total: totalAmount._sum.convertedAmount || 0,
          approved: approvedAmount._sum.convertedAmount || 0,
        },
      },
    });
  });
}