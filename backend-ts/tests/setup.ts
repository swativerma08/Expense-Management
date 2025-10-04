import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
});

afterAll(async () => {
  // Clean up test database
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up database before each test
  await prisma.auditLog.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.approvalRule.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.oCRRecord.deleteMany();
});

export { prisma };