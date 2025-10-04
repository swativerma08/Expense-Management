const ApprovalRule = require('../models/approvalRule');
const ApprovalStep = require('../models/approvalStep');
const ApprovalService = require('../services/approvalService');
const { asyncHandler } = require('../middleware/errorHandler');
const { auditLog } = require('../services/auditService');
const logger = require('../utils/logger');

// Get pending approvals for current user
const getPendingApprovals = asyncHandler(async (req, res) => {
  const { category, limit = 50, offset = 0 } = req.query;

  const filters = {
    company_id: req.user.company_id,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };

  if (category) filters.category = category;

  const pendingApprovals = await ApprovalService.getPendingApprovals(req.user.id, filters);

  res.json({
    pending_approvals: pendingApprovals.map(approval => ({
      id: approval.id,
      expense: {
        id: approval.expense_id,
        user: {
          name: approval.user_name,
          email: approval.user_email
        },
        original_currency: approval.original_currency,
        original_amount: approval.original_amount,
        converted_amount: approval.converted_amount,
        expense_date: approval.expense_date,
        category: approval.category,
        description: approval.description,
        receipt_url: approval.receipt_url,
        created_at: approval.created_at
      },
      sequence_index: approval.sequence_index,
      created_at: approval.created_at
    })),
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: pendingApprovals.length
    }
  });
});

// Approve or reject an expense
const processApproval = asyncHandler(async (req, res) => {
  const { stepId } = req.params;
  const { action, comments } = req.body;

  // Validate action
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      error: 'Action must be either "approve" or "reject"'
    });
  }

  // Check if user can approve this step
  const step = await ApprovalStep.findById(stepId);
  if (!step) {
    return res.status(404).json({
      error: 'Approval step not found'
    });
  }

  if (step.approver_id !== req.user.id) {
    return res.status(403).json({
      error: 'You are not authorized to approve this expense'
    });
  }

  if (step.status !== 'pending') {
    return res.status(400).json({
      error: 'This approval step has already been processed'
    });
  }

  // Require comments for rejection
  if (action === 'reject' && !comments) {
    return res.status(400).json({
      error: 'Comments are required when rejecting an expense'
    });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  
  const result = await ApprovalService.processApproval(
    stepId, 
    status, 
    req.user.id, 
    comments
  );

  logger.info('Approval processed:', { 
    stepId, 
    action, 
    userId: req.user.id,
    expenseId: step.expense_id 
  });

  res.json({
    message: `Expense ${action}d successfully`,
    approval_step: {
      id: result.step.id,
      status: result.step.status,
      action_time: result.step.action_time,
      comments: result.step.comments
    },
    workflow_status: result.workflowStatus,
    expense_status: result.expenseStatus
  });
});

// Get approval history for an expense
const getApprovalHistory = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  // TODO: Add permission check - user should be able to view history for their own expenses
  // or expenses they can approve/have approved

  const history = await ApprovalService.getApprovalHistory(expenseId);

  res.json({
    expense_id: expenseId,
    approval_history: history.map(step => ({
      id: step.id,
      approver: {
        id: step.approver_id,
        name: step.approver_name,
        email: step.approver_email
      },
      sequence_index: step.sequence_index,
      status: step.status,
      action_by: step.action_by ? {
        name: step.action_by_name,
        email: step.action_by_email
      } : null,
      action_time: step.action_time,
      comments: step.comments,
      created_at: step.created_at
    }))
  });
});

// Create approval rule (admin only)
const createApprovalRule = asyncHandler(async (req, res) => {
  const {
    name,
    type,
    threshold_amount,
    threshold_percentage,
    specific_approver_id,
    applies_to_category,
    applies_to_role,
    sequence_order
  } = req.body;

  // Validate required fields
  if (!name || !type) {
    return res.status(400).json({
      error: 'Name and type are required'
    });
  }

  // Validate type
  if (!['sequential', 'parallel', 'percentage', 'specific', 'hybrid'].includes(type)) {
    return res.status(400).json({
      error: 'Invalid approval rule type'
    });
  }

  // Validate specific approver if type is specific
  if (type === 'specific' && !specific_approver_id) {
    return res.status(400).json({
      error: 'Specific approver ID is required for specific approval type'
    });
  }

  const rule = await ApprovalRule.create({
    company_id: req.user.company_id,
    name,
    type,
    threshold_amount: threshold_amount ? parseFloat(threshold_amount) : null,
    threshold_percentage: threshold_percentage ? parseFloat(threshold_percentage) : null,
    specific_approver_id,
    applies_to_category,
    applies_to_role,
    sequence_order: sequence_order || 1
  });

  // Log the creation
  await auditLog({
    entity: 'approval_rule',
    entityId: rule.id,
    action: 'APPROVAL_RULE_CREATED',
    byUser: req.user.id,
    snapshot: rule
  });

  logger.info('Approval rule created:', { ruleId: rule.id, type, createdBy: req.user.id });

  res.status(201).json({
    message: 'Approval rule created successfully',
    rule: {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      threshold_amount: rule.threshold_amount,
      threshold_percentage: rule.threshold_percentage,
      specific_approver_id: rule.specific_approver_id,
      applies_to_category: rule.applies_to_category,
      applies_to_role: rule.applies_to_role,
      sequence_order: rule.sequence_order,
      is_active: rule.is_active,
      created_at: rule.created_at
    }
  });
});

// Get approval rules for company
const getApprovalRules = asyncHandler(async (req, res) => {
  const { is_active, type, applies_to_category } = req.query;

  const filters = {};
  if (is_active !== undefined) filters.is_active = is_active === 'true';
  if (type) filters.type = type;
  if (applies_to_category) filters.applies_to_category = applies_to_category;

  const rules = await ApprovalRule.findByCompany(req.user.company_id, filters);

  res.json({
    approval_rules: rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      type: rule.type,
      threshold_amount: rule.threshold_amount,
      threshold_percentage: rule.threshold_percentage,
      specific_approver: rule.specific_approver_id ? {
        id: rule.specific_approver_id,
        name: rule.approver_name,
        email: rule.approver_email
      } : null,
      applies_to_category: rule.applies_to_category,
      applies_to_role: rule.applies_to_role,
      sequence_order: rule.sequence_order,
      is_active: rule.is_active,
      created_at: rule.created_at,
      updated_at: rule.updated_at
    }))
  });
});

// Update approval rule (admin only)
const updateApprovalRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const updateData = req.body;

  const rule = await ApprovalRule.findById(ruleId);
  if (!rule) {
    return res.status(404).json({
      error: 'Approval rule not found'
    });
  }

  // Ensure rule belongs to user's company
  if (rule.company_id !== req.user.company_id) {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  const updatedRule = await ApprovalRule.update(ruleId, updateData);

  // Log the update
  await auditLog({
    entity: 'approval_rule',
    entityId: ruleId,
    action: 'APPROVAL_RULE_UPDATED',
    byUser: req.user.id,
    snapshot: { original: rule, updated: updatedRule, changes: updateData }
  });

  logger.info('Approval rule updated:', { ruleId, updatedBy: req.user.id });

  res.json({
    message: 'Approval rule updated successfully',
    rule: updatedRule
  });
});

// Delete approval rule (admin only)
const deleteApprovalRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;

  const rule = await ApprovalRule.findById(ruleId);
  if (!rule) {
    return res.status(404).json({
      error: 'Approval rule not found'
    });
  }

  // Ensure rule belongs to user's company
  if (rule.company_id !== req.user.company_id) {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  const deletedRule = await ApprovalRule.delete(ruleId);

  // Log the deletion
  await auditLog({
    entity: 'approval_rule',
    entityId: ruleId,
    action: 'APPROVAL_RULE_DELETED',
    byUser: req.user.id,
    snapshot: deletedRule
  });

  logger.info('Approval rule deleted:', { ruleId, deletedBy: req.user.id });

  res.json({
    message: 'Approval rule deleted successfully'
  });
});

// Reset approval workflow (admin only)
const resetApprovalWorkflow = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  const workflow = await ApprovalService.resetApprovalWorkflow(expenseId, req.user.id);

  res.json({
    message: 'Approval workflow reset successfully',
    workflow
  });
});

module.exports = {
  getPendingApprovals,
  processApproval,
  getApprovalHistory,
  createApprovalRule,
  getApprovalRules,
  updateApprovalRule,
  deleteApprovalRule,
  resetApprovalWorkflow
};