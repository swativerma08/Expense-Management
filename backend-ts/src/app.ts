import express from 'express';
import { securityMiddleware, requestLogger } from '@middlewares/security';
import { apiLimiter, authLimiter } from '@middlewares/rateLimiter';
import { handleError, notFound } from '@middlewares/error';
import { logger } from '@utils/logger';

// Import routes
import authRoutes from '@routes/auth';
import userRoutes from '@routes/users';
import expenseRoutes from '@routes/expenses';
import adminRoutes from '@routes/admin';
import utilRoutes from '@routes/utils';

const app = express();

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Security middleware
app.use(securityMiddleware);

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/utils', utilRoutes);

// Health check
app.get('/health', (req: any, res: any) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date(),
  });
});

// 404 handler
app.use(notFound);

// Error handler
app.use(handleError);

export default app;