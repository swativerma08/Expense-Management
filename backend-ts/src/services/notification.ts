import sgMail from '@sendgrid/mail';
import { config } from '@config/index';
import { prisma } from '@config/database';
import { logger } from '@utils/logger';

sgMail.setApiKey(config.sendGrid.apiKey);

export class NotificationService {
  static async notifyExpenseSubmitted(expenseId: string): Promise<void> {
    try {
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: {
          user: true,
          approvalSteps: {
            include: {
              approver: true,
            },
          },
        },
      });

      if (!expense) return;

      // Get all pending approvers
      const pendingApprovers = expense.approvalSteps
        .filter((step: any) => step.status === 'PENDING')
        .map((step: any) => step.approver);

      for (const approver of pendingApprovers) {
        if (config.notifications.enableEmail) {
          await this.sendEmailNotification({
            to: approver.email,
            subject: 'New Expense Pending Your Approval',
            template: 'expense-submitted',
            data: {
              approverName: approver.name,
              employeeName: expense.user.name,
              amount: expense.convertedAmount,
              currency: 'USD', // Default currency
              category: expense.category,
              description: expense.description,
              expenseId: expense.id,
            },
          });
        }
      }

      logger.info(`Notifications sent for expense submission: ${expenseId}`);
    } catch (error) {
      logger.error('Failed to send expense submission notifications:', error);
    }
  }

  static async notifyExpenseApproved(expenseId: string, approverId: string): Promise<void> {
    try {
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: {
          user: true,
          company: true,
        },
      });

      const approver = await prisma.user.findUnique({
        where: { id: approverId },
      });

      if (!expense || !approver) return;

      if (config.notifications.enableEmail) {
        await this.sendEmailNotification({
          to: expense.user.email,
          subject: 'Expense Approved',
          template: 'expense-approved',
          data: {
            employeeName: expense.user.name,
            approverName: approver.name,
            amount: expense.convertedAmount,
            currency: expense.company.defaultCurrency,
            category: expense.category,
            expenseId: expense.id,
          },
        });
      }

      logger.info(`Approval notification sent for expense: ${expenseId}`);
    } catch (error) {
      logger.error('Failed to send expense approval notification:', error);
    }
  }

  static async notifyExpenseRejected(
    expenseId: string,
    approverId: string,
    comments?: string
  ): Promise<void> {
    try {
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        include: {
          user: true,
          company: true,
        },
      });

      const approver = await prisma.user.findUnique({
        where: { id: approverId },
      });

      if (!expense || !approver) return;

      if (config.notifications.enableEmail) {
        await this.sendEmailNotification({
          to: expense.user.email,
          subject: 'Expense Rejected',
          template: 'expense-rejected',
          data: {
            employeeName: expense.user.name,
            approverName: approver.name,
            amount: expense.convertedAmount,
            currency: expense.company.defaultCurrency,
            category: expense.category,
            comments: comments || 'No comments provided',
            expenseId: expense.id,
          },
        });
      }

      logger.info(`Rejection notification sent for expense: ${expenseId}`);
    } catch (error) {
      logger.error('Failed to send expense rejection notification:', error);
    }
  }

  static async notifyUserCreated(userId: string, password: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { company: true },
      });

      if (!user) return;

      if (config.notifications.enableEmail) {
        await this.sendEmailNotification({
          to: user.email,
          subject: 'Welcome to Expense Management System',
          template: 'user-created',
          data: {
            userName: user.name,
            companyName: user.company.name,
            email: user.email,
            password: password, // In production, use a secure password reset link
            role: user.role,
          },
        });
      }

      logger.info(`Welcome notification sent to user: ${user.email}`);
    } catch (error) {
      logger.error('Failed to send user creation notification:', error);
    }
  }

  private static async sendEmailNotification(params: {
    to: string;
    subject: string;
    template: string;
    data: Record<string, any>;
  }): Promise<void> {
    if (!config.notifications.enableEmail || !config.sendGrid.apiKey) {
      logger.warn('Email notifications disabled or SendGrid not configured');
      return;
    }

    try {
      const msg = {
        to: params.to,
        from: config.sendGrid.fromEmail,
        subject: params.subject,
        html: this.generateEmailHtml(params.template, params.data),
      };

      await sgMail.send(msg);
      logger.debug(`Email sent to ${params.to} with template ${params.template}`);
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  private static generateEmailHtml(template: string, data: Record<string, any>): string {
    // In a real implementation, you would use a proper template engine
    // For now, we'll use simple string replacement
    
    const templates: Record<string, string> = {
      'expense-submitted': `
        <h2>New Expense Requires Your Approval</h2>
        <p>Dear ${data.approverName},</p>
        <p>${data.employeeName} has submitted an expense that requires your approval:</p>
        <ul>
          <li><strong>Amount:</strong> ${data.currency} ${data.amount}</li>
          <li><strong>Category:</strong> ${data.category}</li>
          <li><strong>Description:</strong> ${data.description}</li>
        </ul>
        <p>Please log in to the expense management system to review and approve this expense.</p>
        <p>Expense ID: ${data.expenseId}</p>
      `,
      
      'expense-approved': `
        <h2>Your Expense Has Been Approved</h2>
        <p>Dear ${data.employeeName},</p>
        <p>Great news! Your expense has been approved by ${data.approverName}:</p>
        <ul>
          <li><strong>Amount:</strong> ${data.currency} ${data.amount}</li>
          <li><strong>Category:</strong> ${data.category}</li>
        </ul>
        <p>Expense ID: ${data.expenseId}</p>
      `,
      
      'expense-rejected': `
        <h2>Your Expense Has Been Rejected</h2>
        <p>Dear ${data.employeeName},</p>
        <p>Unfortunately, your expense has been rejected by ${data.approverName}:</p>
        <ul>
          <li><strong>Amount:</strong> ${data.currency} ${data.amount}</li>
          <li><strong>Category:</strong> ${data.category}</li>
          <li><strong>Comments:</strong> ${data.comments}</li>
        </ul>
        <p>Please review the comments and resubmit if necessary.</p>
        <p>Expense ID: ${data.expenseId}</p>
      `,
      
      'user-created': `
        <h2>Welcome to ${data.companyName} Expense Management</h2>
        <p>Dear ${data.userName},</p>
        <p>Your account has been created in the expense management system:</p>
        <ul>
          <li><strong>Email:</strong> ${data.email}</li>
          <li><strong>Role:</strong> ${data.role}</li>
          <li><strong>Temporary Password:</strong> ${data.password}</li>
        </ul>
        <p>Please log in and change your password immediately.</p>
        <p>Welcome to the team!</p>
      `,
    };

    return templates[template] || '<p>Notification</p>';
  }
}