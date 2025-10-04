const ApprovalRule = require('../models/approvalRule');
const ApprovalStep = require('../models/approvalStep');
const Expense = require('../models/expense');
const User = require('../models/user');
const { getClient } = require('../config/database');
const logger = require('../utils/logger');
const { auditLog } = require('./auditService');

class ApprovalService {
  // Create approval workflow for an expense
  static async createApprovalWorkflow(expenseId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Get expense details
      const expense = await Expense.findById(expenseId);
      if (!expense) {
        throw new Error('Expense not found');
      }

      // Get applicable approval rules
      const rules = await ApprovalRule.getApplicableRules(expense);
      
      if (rules.length === 0) {
        // No approval rules = auto-approve
        await Expense.update(expenseId, { status: 'approved' });
        await auditLog({
          entity: 'expense',
          entityId: expenseId,
          action: 'AUTO_APPROVED',
          byUser: expense.user_id,
          snapshot: { reason: 'No approval rules applicable' }
        });
        
        await client.query('COMMIT');
        return { autoApproved: true, steps: [] };
      }

      const approvalSteps = [];
      let sequenceIndex = 1;

      for (const rule of rules) {
        const approvers = await this.getApproversForRule(rule, expense);
        
        for (const approver of approvers) {
          const step = await ApprovalStep.create({
            expense_id: expenseId,
            approver_id: approver.id,
            sequence_index: sequenceIndex
          });
          
          approvalSteps.push(step);
          
          // For sequential approval, increment sequence
          if (rule.type === 'sequential') {
            sequenceIndex++;
          }
          // For parallel approval, keep same sequence
        }
        
        // If not sequential, increment sequence for next rule
        if (rule.type !== 'sequential') {
          sequenceIndex++;
        }
      }

      await client.query('COMMIT');
      
      logger.info('Approval workflow created:', { 
        expenseId, 
        stepsCount: approvalSteps.length 
      });
      
      return { autoApproved: false, steps: approvalSteps };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get approvers for a specific rule
  static async getApproversForRule(rule, expense) {
    const approvers = [];

    switch (rule.type) {
      case 'specific':
        // Specific approver designated in the rule
        if (rule.specific_approver_id) {
          const approver = await User.findById(rule.specific_approver_id);
          if (approver && approver.is_active) {
            approvers.push(approver);
          }
        }
        break;

      case 'percentage':
        // Manager approval based on amount threshold
        const userManager = await User.findById(expense.user_id);
        if (userManager && userManager.manager_id) {
          const manager = await User.findById(userManager.manager_id);
          if (manager && manager.is_active) {
            approvers.push(manager);
          }
        }
        break;

      case 'sequential':
      case 'parallel':
        // Get all managers and admins in the company
        const companyApprovers = await User.findByCompany(expense.company_id, {
          role: ['admin', 'manager'].includes(rule.applies_to_role) ? rule.applies_to_role : undefined,
          is_active: true
        });
        
        // Filter out the expense creator
        approvers.push(...companyApprovers.filter(u => 
          u.id !== expense.user_id && 
          (u.role === 'admin' || u.role === 'manager')
        ));
        break;

      case 'hybrid':
        // Combination of rules - for now, use manager + admin
        const user = await User.findById(expense.user_id);
        if (user && user.manager_id) {
          const manager = await User.findById(user.manager_id);
          if (manager && manager.is_active) {
            approvers.push(manager);
          }
        }
        
        // Add admin if amount is high
        const amount = expense.converted_amount || expense.original_amount;
        if (amount > 1000) {
          const admins = await User.findByCompany(expense.company_id, {
            role: 'admin',
            is_active: true
          });
          approvers.push(...admins.filter(a => a.id !== expense.user_id));
        }
        break;
    }

    return approvers;
  }

  // Process approval/rejection
  static async processApproval(stepId, status, actionBy, comments = null) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Get the approval step
      const step = await ApprovalStep.findById(stepId);
      if (!step) {
        throw new Error('Approval step not found');
      }

      if (step.status !== 'pending') {
        throw new Error('Approval step has already been processed');
      }

      // Update the approval step
      const updatedStep = await ApprovalStep.updateStatus(stepId, status, actionBy, comments);
      
      // Check if all approvals are complete
      const approvalStatus = await ApprovalStep.checkExpenseApprovalComplete(step.expense_id);
      
      let expenseStatus = 'submitted'; // Default to submitted if still pending
      
      if (approvalStatus.isRejected) {
        expenseStatus = 'rejected';
      } else if (approvalStatus.isApproved) {
        expenseStatus = 'approved';
      }

      // Update expense status if workflow is complete
      if (approvalStatus.isComplete) {
        await Expense.update(step.expense_id, { 
          status: expenseStatus,
          rejection_reason: status === 'rejected' ? comments : null
        });
      }

      // Log the approval action
      await auditLog({
        entity: 'expense',
        entityId: step.expense_id,
        action: status === 'approved' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
        byUser: actionBy,
        snapshot: {
          approval_step: updatedStep,
          comments,
          workflow_status: approvalStatus
        }
      });

      await client.query('COMMIT');
      
      logger.info('Approval processed:', { 
        stepId, 
        expenseId: step.expense_id, 
        status, 
        actionBy,
        workflowComplete: approvalStatus.isComplete,
        finalStatus: expenseStatus
      });
      
      return {
        step: updatedStep,
        workflowStatus: approvalStatus,
        expenseStatus
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get pending approvals for a user
  static async getPendingApprovals(userId, filters = {}) {
    return await ApprovalStep.getPendingForUser(userId, filters);
  }

  // Get approval history for an expense
  static async getApprovalHistory(expenseId) {
    return await ApprovalStep.findByExpense(expenseId);
  }

  // Check if user can approve an expense
  static async canUserApprove(userId, expenseId) {
    const pendingStep = await ApprovalStep.getNextPendingStep(expenseId);
    
    if (!pendingStep) {
      return { canApprove: false, reason: 'No pending approvals' };
    }

    if (pendingStep.approver_id !== userId) {
      return { canApprove: false, reason: 'Not the designated approver for current step' };
    }

    return { canApprove: true, step: pendingStep };
  }

  // Reset approval workflow (admin only)
  static async resetApprovalWorkflow(expenseId, resetBy) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Delete existing approval steps
      await ApprovalStep.deleteByExpense(expenseId);
      
      // Reset expense to submitted status
      await Expense.update(expenseId, { 
        status: 'submitted',
        rejection_reason: null
      });

      // Create new approval workflow
      const workflow = await this.createApprovalWorkflow(expenseId);

      // Log the reset
      await auditLog({
        entity: 'expense',
        entityId: expenseId,
        action: 'APPROVAL_WORKFLOW_RESET',
        byUser: resetBy,
        snapshot: { workflow }
      });

      await client.query('COMMIT');
      
      logger.info('Approval workflow reset:', { expenseId, resetBy });
      
      return workflow;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get approval statistics for reporting
  static async getApprovalStatistics(filters = {}) {
    // This would be implemented based on specific reporting needs
    // For now, return basic stats
    return {
      totalPendingApprovals: 0,
      averageApprovalTime: 0,
      approvalsByStatus: {
        approved: 0,
        rejected: 0,
        pending: 0
      }
    };
  }
}

module.exports = ApprovalService;