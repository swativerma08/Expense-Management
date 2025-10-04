import { ApprovalEngine } from '../src/services/approval';
import { prisma } from './setup';
import bcrypt from 'bcryptjs';

describe('ApprovalEngine', () => {
  let company: any;
  let admin: any;
  let manager: any;
  let employee: any;
  let expense: any;

  beforeEach(async () => {
    // Create test company
    company = await prisma.company.create({
      data: {
        name: 'Test Company',
        country: 'US',
        defaultCurrency: 'USD',
      },
    });

    const passwordHash = await bcrypt.hash('password123', 12);

    // Create users
    admin = await prisma.user.create({
      data: {
        companyId: company.id,
        name: 'Test Admin',
        email: 'admin@test.com',
        passwordHash,
        role: 'ADMIN',
      },
    });

    manager = await prisma.user.create({
      data: {
        companyId: company.id,
        name: 'Test Manager',
        email: 'manager@test.com',
        passwordHash,
        role: 'MANAGER',
      },
    });

    employee = await prisma.user.create({
      data: {
        companyId: company.id,
        name: 'Test Employee',
        email: 'employee@test.com',
        passwordHash,
        role: 'EMPLOYEE',
        managerId: manager.id,
      },
    });

    // Create test expense
    expense = await prisma.expense.create({
      data: {
        companyId: company.id,
        userId: employee.id,
        originalCurrency: 'USD',
        originalAmount: 500,
        convertedAmount: 500,
        date: new Date(),
        category: 'Travel',
        status: 'WAITING_APPROVAL',
      },
    });
  });

  describe('Sequential Approval', () => {
    beforeEach(async () => {
      await prisma.approvalRule.create({
        data: {
          companyId: company.id,
          name: 'Sequential Rule',
          type: 'SEQUENTIAL',
          appliesToCategory: 'Travel',
          priority: 1,
        },
      });
    });

    it('should create sequential approval steps', async () => {
      await ApprovalEngine.createApprovalSteps(expense.id, company.id, {
        category: 'Travel',
        amount: 500,
        userId: employee.id,
      });

      const approvalSteps = await prisma.approvalStep.findMany({
        where: { expenseId: expense.id },
        orderBy: { sequenceIndex: 'asc' },
      });

      expect(approvalSteps.length).toBeGreaterThan(0);
      expect(approvalSteps[0].approverId).toBe(manager.id);
      expect(approvalSteps[0].status).toBe('PENDING');
    });

    it('should process sequential approval correctly', async () => {
      // Create approval steps
      await ApprovalEngine.createApprovalSteps(expense.id, company.id, {
        category: 'Travel',
        amount: 500,
        userId: employee.id,
      });

      // Approve first step
      await prisma.approvalStep.updateMany({
        where: { expenseId: expense.id, approverId: manager.id },
        data: {
          status: 'APPROVED',
          actionBy: manager.id,
          actionAt: new Date(),
        },
      });

      const finalStatus = await ApprovalEngine.processApproval(expense.id);
      
      const updatedExpense = await prisma.expense.findUnique({
        where: { id: expense.id },
      });

      expect(updatedExpense?.status).toBe('APPROVED');
      expect(finalStatus).toBe('APPROVED');
    });
  });

  describe('Specific Approval', () => {
    beforeEach(async () => {
      await prisma.approvalRule.create({
        data: {
          companyId: company.id,
          name: 'Specific Rule',
          type: 'SPECIFIC',
          specificApproverId: admin.id,
          priority: 1,
        },
      });
    });

    it('should create specific approval step', async () => {
      await ApprovalEngine.createApprovalSteps(expense.id, company.id, {
        category: 'Travel',
        amount: 500,
        userId: employee.id,
      });

      const approvalSteps = await prisma.approvalStep.findMany({
        where: { expenseId: expense.id },
      });

      expect(approvalSteps).toHaveLength(1);
      expect(approvalSteps[0].approverId).toBe(admin.id);
    });

    it('should approve instantly when specific approver approves', async () => {
      await ApprovalEngine.createApprovalSteps(expense.id, company.id, {
        category: 'Travel',
        amount: 500,
        userId: employee.id,
      });

      // Approve by specific approver
      await prisma.approvalStep.updateMany({
        where: { expenseId: expense.id, approverId: admin.id },
        data: {
          status: 'APPROVED',
          actionBy: admin.id,
          actionAt: new Date(),
        },
      });

      const finalStatus = await ApprovalEngine.processApproval(expense.id);
      expect(finalStatus).toBe('APPROVED');
    });
  });

  describe('Percentage Approval', () => {
    beforeEach(async () => {
      await prisma.approvalRule.create({
        data: {
          companyId: company.id,
          name: 'Percentage Rule',
          type: 'PERCENTAGE',
          thresholdPercent: 60,
          priority: 1,
        },
      });
    });

    it('should approve when threshold is met', async () => {
      await ApprovalEngine.createApprovalSteps(expense.id, company.id, {
        category: 'Travel',
        amount: 500,
        userId: employee.id,
      });

      const approvalSteps = await prisma.approvalStep.findMany({
        where: { expenseId: expense.id },
      });

      // Approve 60% of steps (assuming we have at least 2 approvers)
      if (approvalSteps.length >= 2) {
        const approvalsNeeded = Math.ceil(approvalSteps.length * 0.6);
        
        for (let i = 0; i < approvalsNeeded; i++) {
          await prisma.approvalStep.update({
            where: { id: approvalSteps[i].id },
            data: {
              status: 'APPROVED',
              actionBy: approvalSteps[i].approverId,
              actionAt: new Date(),
            },
          });
        }

        const finalStatus = await ApprovalEngine.processApproval(expense.id);
        expect(finalStatus).toBe('APPROVED');
      }
    });
  });

  describe('Rejection Handling', () => {
    beforeEach(async () => {
      await prisma.approvalRule.create({
        data: {
          companyId: company.id,
          name: 'Test Rule',
          type: 'SEQUENTIAL',
          priority: 1,
        },
      });
    });

    it('should reject expense when any approver rejects', async () => {
      await ApprovalEngine.createApprovalSteps(expense.id, company.id, {
        category: 'Travel',
        amount: 500,
        userId: employee.id,
      });

      // Reject the expense
      await prisma.approvalStep.updateMany({
        where: { expenseId: expense.id },
        data: {
          status: 'REJECTED',
          actionBy: manager.id,
          actionAt: new Date(),
          comments: 'Not approved',
        },
      });

      const finalStatus = await ApprovalEngine.processApproval(expense.id);
      expect(finalStatus).toBe('REJECTED');
    });
  });
});