import { prisma } from '@config/database';
import { logger } from '@utils/logger';

interface ApprovalContext {
  category: string;
  amount: number;
  userId: string;
}

export class ApprovalEngine {
  static async createApprovalSteps(
    expenseId: string,
    companyId: string,
    context: ApprovalContext
  ): Promise<void> {
    try {
      // Get applicable approval rules
      const rules = await this.getApplicableRules(companyId, context);
      
      if (rules.length === 0) {
        logger.warn(`No approval rules found for expense ${expenseId}`);
        return;
      }

      // Sort rules by priority (highest first)
      rules.sort((a: any, b: any) => b.priority - a.priority);

      // Apply the highest priority rule
      const rule = rules[0];
      await this.applyRule(expenseId, rule, context);

      logger.info(`Approval steps created for expense ${expenseId} using rule ${rule.name}`);
    } catch (error) {
      logger.error('Failed to create approval steps:', error);
      throw error;
    }
  }

  private static async getApplicableRules(companyId: string, context: ApprovalContext) {
    const where: any = {
      companyId,
      isActive: true,
    };

    // Filter by category if specified
    if (context.category) {
      where.OR = [
        { appliesToCategory: context.category },
        { appliesToCategory: null },
      ];
    }

    // Filter by amount range
    where.AND = [
      {
        OR: [
          { minAmount: null },
          { minAmount: { lte: context.amount } },
        ],
      },
      {
        OR: [
          { maxAmount: null },
          { maxAmount: { gte: context.amount } },
        ],
      },
    ];

    return await prisma.approvalRule.findMany({
      where,
      include: {
        specificApprover: true,
      },
    });
  }

  private static async applyRule(expenseId: string, rule: any, context: ApprovalContext) {
    switch (rule.type) {
      case 'SEQUENTIAL':
        await this.createSequentialApproval(expenseId, rule, context);
        break;
      case 'PARALLEL':
        await this.createParallelApproval(expenseId, rule, context);
        break;
      case 'PERCENTAGE':
        await this.createPercentageApproval(expenseId, rule, context);
        break;
      case 'SPECIFIC':
        await this.createSpecificApproval(expenseId, rule, context);
        break;
      case 'HYBRID':
        await this.createHybridApproval(expenseId, rule, context);
        break;
      default:
        throw new Error(`Unknown approval rule type: ${rule.type}`);
    }
  }

  private static async createSequentialApproval(expenseId: string, rule: any, context: ApprovalContext) {
    // Get user's manager hierarchy
    const approvers = await this.getManagerHierarchy(context.userId);
    
    for (let i = 0; i < approvers.length; i++) {
      await prisma.approvalStep.create({
        data: {
          expenseId,
          approverId: approvers[i].id,
          sequenceIndex: i,
          status: 'PENDING',
        },
      });
    }
  }

  private static async createParallelApproval(expenseId: string, rule: any, context: ApprovalContext) {
    // Get all managers in the company
    const approvers = await this.getAllManagers(rule.companyId);
    
    for (const approver of approvers) {
      await prisma.approvalStep.create({
        data: {
          expenseId,
          approverId: approver.id,
          sequenceIndex: 0, // All parallel
          status: 'PENDING',
        },
      });
    }
  }

  private static async createPercentageApproval(expenseId: string, rule: any, context: ApprovalContext) {
    // Same as parallel but with threshold logic
    await this.createParallelApproval(expenseId, rule, context);
  }

  private static async createSpecificApproval(expenseId: string, rule: any, context: ApprovalContext) {
    if (!rule.specificApproverId) {
      throw new Error('Specific approver not defined in rule');
    }

    await prisma.approvalStep.create({
      data: {
        expenseId,
        approverId: rule.specificApproverId,
        sequenceIndex: 0,
        status: 'PENDING',
      },
    });
  }

  private static async createHybridApproval(expenseId: string, rule: any, context: ApprovalContext) {
    // Create both specific and percentage approvals
    if (rule.specificApproverId) {
      await prisma.approvalStep.create({
        data: {
          expenseId,
          approverId: rule.specificApproverId,
          sequenceIndex: 0,
          status: 'PENDING',
        },
      });
    }

    // Also create parallel approvals
    const approvers = await this.getAllManagers(rule.companyId);
    for (const approver of approvers) {
      if (approver.id !== rule.specificApproverId) {
        await prisma.approvalStep.create({
          data: {
            expenseId,
            approverId: approver.id,
            sequenceIndex: 1,
            status: 'PENDING',
          },
        });
      }
    }
  }

  static async processApproval(expenseId: string): Promise<string> {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        approvalSteps: {
          orderBy: { sequenceIndex: 'asc' },
        },
      },
    });

    if (!expense) {
      throw new Error('Expense not found');
    }

    // Get the approval rule that was applied
    const rules = await this.getApplicableRules(expense.companyId, {
      category: expense.category,
      amount: Number(expense.convertedAmount),
      userId: expense.userId,
    });

    if (rules.length === 0) {
      return expense.status;
    }

    const rule = rules.sort((a: any, b: any) => b.priority - a.priority)[0];
    
    return await this.evaluateApprovalStatus(expense, rule);
  }

  private static async evaluateApprovalStatus(expense: any, rule: any): Promise<string> {
    const approvalSteps = expense.approvalSteps;
    
    // Check for any rejections
    const rejectedSteps = approvalSteps.filter((step: any) => step.status === 'REJECTED');
    if (rejectedSteps.length > 0) {
      await prisma.expense.update({
        where: { id: expense.id },
        data: { status: 'REJECTED' },
      });
      return 'REJECTED';
    }

    switch (rule.type) {
      case 'SEQUENTIAL':
        return this.evaluateSequential(expense, approvalSteps);
      case 'PARALLEL':
      case 'PERCENTAGE':
        return this.evaluatePercentage(expense, approvalSteps, rule.thresholdPercent || 50);
      case 'SPECIFIC':
        return this.evaluateSpecific(expense, approvalSteps);
      case 'HYBRID':
        return this.evaluateHybrid(expense, approvalSteps, rule);
      default:
        return expense.status;
    }
  }

  private static async evaluateSequential(expense: any, approvalSteps: any[]): Promise<string> {
    const sortedSteps = approvalSteps.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    
    for (const step of sortedSteps) {
      if (step.status === 'PENDING') {
        return 'WAITING_APPROVAL';
      }
      if (step.status === 'REJECTED') {
        await prisma.expense.update({
          where: { id: expense.id },
          data: { status: 'REJECTED' },
        });
        return 'REJECTED';
      }
    }

    // All steps approved
    await prisma.expense.update({
      where: { id: expense.id },
      data: { status: 'APPROVED' },
    });
    return 'APPROVED';
  }

  private static async evaluatePercentage(expense: any, approvalSteps: any[], threshold: number): Promise<string> {
    const totalSteps = approvalSteps.length;
    const approvedSteps = approvalSteps.filter(step => step.status === 'APPROVED').length;
    const approvalPercentage = (approvedSteps / totalSteps) * 100;

    if (approvalPercentage >= threshold) {
      await prisma.expense.update({
        where: { id: expense.id },
        data: { status: 'APPROVED' },
      });
      return 'APPROVED';
    }

    return 'WAITING_APPROVAL';
  }

  private static async evaluateSpecific(expense: any, approvalSteps: any[]): Promise<string> {
    const approvedSteps = approvalSteps.filter(step => step.status === 'APPROVED');
    
    if (approvedSteps.length > 0) {
      await prisma.expense.update({
        where: { id: expense.id },
        data: { status: 'APPROVED' },
      });
      return 'APPROVED';
    }

    return 'WAITING_APPROVAL';
  }

  private static async evaluateHybrid(expense: any, approvalSteps: any[], rule: any): Promise<string> {
    // Check if specific approver approved
    const specificStep = approvalSteps.find(step => step.approverId === rule.specificApproverId);
    if (specificStep && specificStep.status === 'APPROVED') {
      await prisma.expense.update({
        where: { id: expense.id },
        data: { status: 'APPROVED' },
      });
      return 'APPROVED';
    }

    // Otherwise check percentage threshold
    return this.evaluatePercentage(expense, approvalSteps, rule.thresholdPercent || 60);
  }

  private static async getManagerHierarchy(userId: string): Promise<any[]> {
    const managers = [];
    let currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { manager: true },
    });

    while (currentUser?.manager) {
      managers.push(currentUser.manager);
      currentUser = await prisma.user.findUnique({
        where: { id: currentUser.manager.id },
        include: { manager: true },
      });
    }

    return managers;
  }

  private static async getAllManagers(companyId: string): Promise<any[]> {
    return await prisma.user.findMany({
      where: {
        companyId,
        role: { in: ['MANAGER', 'ADMIN'] },
        isActive: true,
      },
    });
  }
}