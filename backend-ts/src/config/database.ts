import { config } from './index';

// Import PrismaClient dynamically to handle potential import issues
let PrismaClient: any;
try {
  const prismaModule = require('@prisma/client');
  PrismaClient = prismaModule.PrismaClient;
} catch (error) {
  console.error('Failed to import PrismaClient:', error);
  throw new Error('Prisma client not found. Please run: npx prisma generate');
}

// Extend global type for Prisma client caching
declare global {
  var __prisma: any | undefined;
}

// Create or reuse Prisma client instance
let prisma: any;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'],
  });
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  prisma = global.__prisma;
}

export { prisma };