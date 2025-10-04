import request from 'supertest';
import app from '../src/app';
import { prisma } from './setup';
import { JWTService } from '../src/utils/jwt';
import bcrypt from 'bcryptjs';

describe('Expense Endpoints', () => {
  let company: any;
  let admin: any;
  let employee: any;
  let accessToken: string;

  beforeEach(async () => {
    // Create test company
    company = await prisma.company.create({
      data: {
        name: 'Test Company',
        country: 'US',
        defaultCurrency: 'USD',
      },
    });

    // Create admin user
    const passwordHash = await bcrypt.hash('password123', 12);
    admin = await prisma.user.create({
      data: {
        companyId: company.id,
        name: 'Test Admin',
        email: 'admin@test.com',
        passwordHash,
        role: 'ADMIN',
      },
    });

    // Create employee user
    employee = await prisma.user.create({
      data: {
        companyId: company.id,
        name: 'Test Employee',
        email: 'employee@test.com',
        passwordHash,
        role: 'EMPLOYEE',
      },
    });

    // Generate access token for employee
    accessToken = JWTService.generateAccessToken({
      userId: employee.id,
      email: employee.email,
      role: employee.role,
      companyId: company.id,
    });
  });

  describe('POST /api/expenses', () => {
    it('should create a new expense', async () => {
      const expenseData = {
        originalCurrency: 'USD',
        originalAmount: 100.50,
        date: new Date().toISOString(),
        category: 'Travel',
        description: 'Business trip expense',
      };

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(expenseData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.expense.originalAmount).toBe('100.50');
      expect(response.body.data.expense.category).toBe('Travel');
      expect(response.body.data.expense.status).toBe('DRAFT');

      // Verify expense was created in database
      const expense = await prisma.expense.findFirst({
        where: { userId: employee.id },
      });
      expect(expense).toBeTruthy();
      expect(expense?.status).toBe('DRAFT');
    });

    it('should return error without authentication', async () => {
      const expenseData = {
        originalCurrency: 'USD',
        originalAmount: 100.50,
        date: new Date().toISOString(),
        category: 'Travel',
      };

      const response = await request(app)
        .post('/api/expenses')
        .send(expenseData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/expenses/:id/submit', () => {
    let expense: any;

    beforeEach(async () => {
      // Create a draft expense
      expense = await prisma.expense.create({
        data: {
          companyId: company.id,
          userId: employee.id,
          originalCurrency: 'USD',
          originalAmount: 100,
          date: new Date(),
          category: 'Travel',
          description: 'Test expense',
          status: 'DRAFT',
        },
      });

      // Create an approval rule
      await prisma.approvalRule.create({
        data: {
          companyId: company.id,
          name: 'Test Rule',
          type: 'SPECIFIC',
          specificApproverId: admin.id,
          priority: 1,
        },
      });
    });

    it('should submit expense for approval', async () => {
      const response = await request(app)
        .put(`/api/expenses/${expense.id}/submit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.expense.status).toBe('WAITING_APPROVAL');

      // Verify approval steps were created
      const approvalSteps = await prisma.approvalStep.findMany({
        where: { expenseId: expense.id },
      });
      expect(approvalSteps.length).toBeGreaterThan(0);
    });

    it('should return error for non-draft expense', async () => {
      // Update expense status
      await prisma.expense.update({
        where: { id: expense.id },
        data: { status: 'APPROVED' },
      });

      const response = await request(app)
        .put(`/api/expenses/${expense.id}/submit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('draft');
    });
  });

  describe('GET /api/expenses', () => {
    beforeEach(async () => {
      // Create test expenses
      await prisma.expense.createMany({
        data: [
          {
            companyId: company.id,
            userId: employee.id,
            originalCurrency: 'USD',
            originalAmount: 100,
            date: new Date(),
            category: 'Travel',
            status: 'DRAFT',
          },
          {
            companyId: company.id,
            userId: employee.id,
            originalCurrency: 'USD',
            originalAmount: 200,
            date: new Date(),
            category: 'Meals',
            status: 'APPROVED',
          },
        ],
      });
    });

    it('should return user expenses', async () => {
      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.expenses).toHaveLength(2);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter expenses by status', async () => {
      const response = await request(app)
        .get('/api/expenses?status=DRAFT')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.expenses).toHaveLength(1);
      expect(response.body.data.expenses[0].status).toBe('DRAFT');
    });
  });
});