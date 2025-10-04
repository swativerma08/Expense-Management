import request from 'supertest';
import app from '../src/app';
import { prisma } from './setup';
import bcrypt from 'bcryptjs';

describe('Auth Endpoints', () => {
  describe('POST /api/auth/signup', () => {
    it('should create a new company and admin user', async () => {
      const signupData = {
        companyName: 'Test Company',
        country: 'United States',
        defaultCurrency: 'USD',
        adminName: 'Test Admin',
        email: 'admin@test.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(signupData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(signupData.email);
      expect(response.body.data.company.name).toBe(signupData.companyName);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');

      // Verify user was created in database
      const user = await prisma.user.findUnique({
        where: { email: signupData.email },
      });
      expect(user).toBeTruthy();
      expect(user?.role).toBe('ADMIN');
    });

    it('should return error for duplicate email', async () => {
      const signupData = {
        companyName: 'Test Company',
        country: 'United States',
        defaultCurrency: 'USD',
        adminName: 'Test Admin',
        email: 'admin@test.com',
        password: 'password123',
      };

      // First signup
      await request(app)
        .post('/api/auth/signup')
        .send(signupData)
        .expect(201);

      // Second signup with same email
      const response = await request(app)
        .post('/api/auth/signup')
        .send(signupData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    let company: any;
    let user: any;

    beforeEach(async () => {
      // Create test company and user
      company = await prisma.company.create({
        data: {
          name: 'Test Company',
          country: 'US',
          defaultCurrency: 'USD',
        },
      });

      const passwordHash = await bcrypt.hash('password123', 12);
      user = await prisma.user.create({
        data: {
          companyId: company.id,
          name: 'Test User',
          email: 'test@test.com',
          passwordHash,
          role: 'ADMIN',
        },
      });
    });

    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'test@test.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(loginData.email);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should return error for invalid credentials', async () => {
      const loginData = {
        email: 'test@test.com',
        password: 'wrongpassword',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    it('should return error for inactive user', async () => {
      // Deactivate user
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });

      const loginData = {
        email: 'test@test.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('deactivated');
    });
  });
});