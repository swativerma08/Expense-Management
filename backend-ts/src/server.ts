import app from './app';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import { prisma } from '@config/database';

const port = config.port;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Create logs directory if it doesn't exist
    const fs = require('fs');
    const path = require('path');
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const server = app.listen(port, () => {
      logger.info(`🚀 Server running on port ${port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 API Base URL: http://localhost:${port}/api`);
      
      if (config.nodeEnv === 'development') {
        logger.info('\n📋 Available endpoints:');
        logger.info('  POST /api/auth/signup');
        logger.info('  POST /api/auth/login');
        logger.info('  GET  /api/users');
        logger.info('  GET  /api/expenses');
        logger.info('  GET  /api/admin/rules');
        logger.info('  GET  /api/utils/health');
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      server.close(async () => {
        logger.info('Process terminated');
        await prisma.$disconnect();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      
      server.close(async () => {
        logger.info('Process terminated');
        await prisma.$disconnect();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();