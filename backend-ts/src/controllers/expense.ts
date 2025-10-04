import { Response } from 'express';
import { prisma } from '@config/database';
import { AppError, asyncHandler } from '@middlewares/error';
import { AuthenticatedRequest } from '@middlewares/auth';
import { AuditService } from '@services/audit';
import { CurrencyService } from '@services/currency';
import { ApprovalEngine } from '@services/approval';
import { NotificationService } from '@services/notification';

export class ExpenseController {
  static getExpenses = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId, role } = req.user!;
    const { 
      page = 1, 
      limit = 10, 
      status, 
      category, 
      userId: filterUserId, 
      startDate, 
      endDate 
    } = req.query as any;

    const where: any = { companyId };

    // Role-based filtering
    if (role === 'EMPLOYEE') {
      where.userId = userId;
    } else if (filterUserId) {
      where.userId = filterUserId;
    }

    if (status) where.status = status;
    if (category) where.category = category;
    
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          approvalSteps: {
            include: {
              approver: {
                select: { id: true, name: true, email: true },
              },
            },
            orderBy: { sequenceIndex: 'asc' },
          },
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expense.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  });

  static createExpense = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId } = req.user!;
    const { 
      originalCurrency, 
      originalAmount, 
      date, 
      category, 
      description, 
      receiptUrl 
    } = req.body;

    const expense = await prisma.expense.create({
      data: {
        companyId,
        userId,
        originalCurrency,
        originalAmount,
        date: new Date(date),
        category,
        description,
        receiptUrl,
        status: 'DRAFT',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Log audit
    await AuditService.log({
      entity: 'Expense',
      entityId: expense.id,
      action: 'CREATE',
      byUserId: userId,
      companyId,
      snapshot: {
        originalAmount: expense.originalAmount,
        originalCurrency: expense.originalCurrency,
        category: expense.category,
        status: expense.status,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: { expense },
    });
  });

  static submitExpense = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId } = req.user!;
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!expense || expense.companyId !== companyId) {
      throw new AppError('Expense not found', 404);
    }

    if (expense.userId !== userId) {
      throw new AppError('You can only submit your own expenses', 403);
    }

    if (expense.status !== 'DRAFT') {
      throw new AppError('Only draft expenses can be submitted', 400);
    }

    // Get currency conversion if needed
    let convertedAmount = expense.originalAmount;
    let conversionRate = 1;
    let rateTimestamp = new Date();

    if (expense.originalCurrency !== expense.company.defaultCurrency) {
      const currencyData = await CurrencyService.convertCurrency(
        expense.originalCurrency,
        expense.company.defaultCurrency,
        Number(expense.originalAmount)
      );
      
      convertedAmount = currencyData.convertedAmount;
      conversionRate = currencyData.rate;
      rateTimestamp = currencyData.timestamp;
    }

    // Update expense with currency conversion
    const updatedExpense = await prisma.expense.update({
      where: { id },
      data: {
        convertedAmount,
        conversionRate,
        rateTimestamp,
        status: 'WAITING_APPROVAL',
        submittedAt: new Date(),
      },
    });

    // Generate approval steps using Approval Engine
    await ApprovalEngine.createApprovalSteps(id, companyId, {
      category: expense.category,
      amount: Number(convertedAmount),
      userId,
    });

    // Send notifications
    await NotificationService.notifyExpenseSubmitted(id);

    // Log audit
    await AuditService.log({
      entity: 'Expense',
      entityId: id,
      action: 'SUBMIT',
      byUserId: userId,
      companyId,
      snapshot: {
        status: 'WAITING_APPROVAL',
        convertedAmount,
        conversionRate,
      },
      changes: {
        from: { status: 'DRAFT' },
        to: { status: 'WAITING_APPROVAL' },
      },
    });

    res.json({
      success: true,
      message: 'Expense submitted for approval',
      data: { expense: updatedExpense },
    });
  });

  static getExpenseById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId, role } = req.user!;
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        approvalSteps: {
          include: {
            approver: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { sequenceIndex: 'asc' },
        },
        ocrRecords: true,
        auditLogs: {
          include: {
            byUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!expense || expense.companyId !== companyId) {
      throw new AppError('Expense not found', 404);
    }

    // Role-based access control
    if (role === 'EMPLOYEE' && expense.userId !== userId) {
      throw new AppError('You can only view your own expenses', 403);
    }

    res.json({
      success: true,
      data: { expense },
    });
  });

  static approveExpense = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId, userId } = req.user!;
    const { id } = req.params;
    const { action, comments } = req.body; // action: 'approve' | 'reject'

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        approvalSteps: {
          where: { approverId: userId },
          orderBy: { sequenceIndex: 'asc' },
        },
      },
    });

    if (!expense || expense.companyId !== companyId) {
      throw new AppError('Expense not found', 404);
    }

    if (expense.status !== 'WAITING_APPROVAL') {
      throw new AppError('Expense is not waiting for approval', 400);
    }

    const approvalStep = expense.approvalSteps.find((step: any) => 
      step.approverId === userId && step.status === 'PENDING'
    );

    if (!approvalStep) {
      throw new AppError('You are not authorized to approve this expense', 403);
    }

    // Update approval step
    await prisma.approvalStep.update({
      where: { id: approvalStep.id },
      data: {
        status: action.toUpperCase(),
        actionBy: userId,
        actionAt: new Date(),
        comments,
      },
    });

    // Process approval using Approval Engine
    const finalStatus = await ApprovalEngine.processApproval(id);

    // Send notifications
    if (action === 'approve') {
      await NotificationService.notifyExpenseApproved(id, userId);
    } else {
      await NotificationService.notifyExpenseRejected(id, userId, comments);
    }

    // Log audit
    await AuditService.log({
      entity: 'Expense',
      entityId: id,
      action: action.toUpperCase(),
      byUserId: userId,
      companyId,
      snapshot: { status: finalStatus, comments },
    });

    res.json({
      success: true,
      message: `Expense ${action}d successfully`,
      data: { finalStatus },
    });
  });

  static getExpenseHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.user!;
    const { id } = req.params;

    const auditLogs = await AuditService.getAuditLogs(companyId, {
      entity: 'Expense',
      entityId: id,
    });

    res.json({
      success: true,
      data: auditLogs,
    });
  });
}