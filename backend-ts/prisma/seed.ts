import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a demo company
  const company = await prisma.company.create({
    data: {
      name: 'TechCorp Solutions',
      country: 'United States',
      defaultCurrency: 'USD',
    },
  });

  console.log('✅ Created company:', company.name);

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'System Administrator',
      email: 'admin@techcorp.com',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  });

  console.log('✅ Created admin user:', admin.email);

  // Create manager
  const managerPassword = await bcrypt.hash('manager123', 12);
  const manager = await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'John Manager',
      email: 'manager@techcorp.com',
      passwordHash: managerPassword,
      role: 'MANAGER',
    },
  });

  console.log('✅ Created manager user:', manager.email);

  // Create employees
  const employeePassword = await bcrypt.hash('employee123', 12);
  const employee1 = await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'Alice Employee',
      email: 'alice@techcorp.com',
      passwordHash: employeePassword,
      role: 'EMPLOYEE',
      managerId: manager.id,
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'Bob Employee',
      email: 'bob@techcorp.com',
      passwordHash: employeePassword,
      role: 'EMPLOYEE',
      managerId: manager.id,
    },
  });

  console.log('✅ Created employees:', employee1.email, employee2.email);

  // Create approval rules
  await prisma.approvalRule.create({
    data: {
      companyId: company.id,
      name: 'Sequential Approval',
      type: 'SEQUENTIAL',
      appliesToCategory: 'Travel',
      minAmount: 100,
      maxAmount: 1000,
      priority: 1,
    },
  });

  await prisma.approvalRule.create({
    data: {
      companyId: company.id,
      name: 'Manager Quick Approval',
      type: 'SPECIFIC',
      specificApproverId: manager.id,
      maxAmount: 500,
      priority: 2,
    },
  });

  await prisma.approvalRule.create({
    data: {
      companyId: company.id,
      name: 'High Amount Parallel Approval',
      type: 'PARALLEL',
      thresholdPercent: 60,
      minAmount: 1000,
      priority: 3,
    },
  });

  console.log('✅ Created approval rules');

  // Create some sample exchange rates
  const now = new Date();
  await prisma.exchangeRate.createMany({
    data: [
      {
        baseCurrency: 'USD',
        targetCurrency: 'EUR',
        rate: 0.85,
        timestamp: now,
      },
      {
        baseCurrency: 'USD',
        targetCurrency: 'GBP',
        rate: 0.73,
        timestamp: now,
      },
      {
        baseCurrency: 'USD',
        targetCurrency: 'INR',
        rate: 83.12,
        timestamp: now,
      },
    ],
  });

  console.log('✅ Created exchange rates');

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('Admin: admin@techcorp.com / admin123');
  console.log('Manager: manager@techcorp.com / manager123');
  console.log('Employee: alice@techcorp.com / employee123');
  console.log('Employee: bob@techcorp.com / employee123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });