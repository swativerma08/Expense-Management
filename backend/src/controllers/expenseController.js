const Expense = require('../models/expense');
const Company = require('../models/company');
const { asyncHandler } = require('../middleware/errorHandler');
const { auditLog } = require('../services/auditService');
const currencyService = require('../services/currencyService');
const logger = require('../utils/logger');

// Create new expense
const createExpense = asyncHandler(async (req, res) => {
  const {
    original_currency,
    original_amount,
    expense_date,
    category,
    description,
    receipt_url
  } = req.body;

  // Validate required fields
  if (!original_currency || !original_amount || !expense_date || !category) {
    return res.status(400).json({
      error: 'Original currency, amount, expense date, and category are required'
    });
  }

  // Validate amount
  if (original_amount <= 0) {
    return res.status(400).json({
      error: 'Amount must be greater than 0'
    });
  }

  // Validate currency
  const supportedCurrencies = currencyService.getSupportedCurrencies();
  if (!supportedCurrencies.includes(original_currency)) {
    return res.status(400).json({
      error: `Unsupported currency: ${original_currency}`
    });
  }

  // Validate date
  const expenseDate = new Date(expense_date);
  if (expenseDate > new Date()) {
    return res.status(400).json({
      error: 'Expense date cannot be in the future'
    });
  }

  const expense = await Expense.create({
    company_id: req.user.company_id,
    user_id: req.user.id,
    original_currency,
    original_amount: parseFloat(original_amount),
    expense_date: expenseDate,
    category,
    description,
    receipt_url
  });

  // Log the creation
  await auditLog({
    entity: 'expense',
    entityId: expense.id,
    action: 'EXPENSE_CREATED',
    byUser: req.user.id,
    snapshot: expense
  });

  logger.info('Expense created:', { expenseId: expense.id, userId: req.user.id, amount: original_amount });

  res.status(201).json({
    message: 'Expense created successfully',
    expense: {
      id: expense.id,
      original_currency: expense.original_currency,
      original_amount: expense.original_amount,
      expense_date: expense.expense_date,
      category: expense.category,
      description: expense.description,
      receipt_url: expense.receipt_url,
      status: expense.status,
      created_at: expense.created_at
    }
  });
});

// Get all expenses with filters
const getExpenses = asyncHandler(async (req, res) => {
  const {
    status,
    category,
    date_from,
    date_to,
    amount_min,
    amount_max,
    user_id,
    limit = 50,
    offset = 0,
    order_by = 'created_at DESC'
  } = req.query;

  const filters = {
    company_id: req.user.company_id,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order_by
  };

  // Apply role-based filtering
  if (req.user.role === 'employee') {
    // Employees can only see their own expenses
    filters.user_id = req.user.id;
  } else if (req.user.role === 'manager') {
    // Managers can see their team's expenses or their own
    if (user_id) {
      // Verify the user is in their team or themselves
      if (user_id !== req.user.id) {
        filters.manager_id = req.user.id;
        filters.user_id = user_id;
      } else {
        filters.user_id = req.user.id;
      }
    } else {
      // Show all team expenses
      filters.manager_id = req.user.id;
    }
  } else if (req.user.role === 'admin') {
    // Admins can see all company expenses
    if (user_id) {
      filters.user_id = user_id;
    }
  }

  // Apply additional filters
  if (status) {
    filters.status = Array.isArray(status) ? status : [status];
  }
  if (category) filters.category = category;
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;
  if (amount_min) filters.amount_min = parseFloat(amount_min);
  if (amount_max) filters.amount_max = parseFloat(amount_max);

  const expenses = await Expense.findWithFilters(filters);

  res.json({
    expenses: expenses.map(expense => ({
      id: expense.id,
      user: {
        id: expense.user_id,
        name: expense.user_name,
        email: expense.user_email
      },
      original_currency: expense.original_currency,
      original_amount: expense.original_amount,
      converted_amount: expense.converted_amount,
      conversion_rate: expense.conversion_rate,
      expense_date: expense.expense_date,
      category: expense.category,
      description: expense.description,
      receipt_url: expense.receipt_url,
      status: expense.status,
      created_at: expense.created_at,
      updated_at: expense.updated_at
    })),
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: expenses.length
    }
  });
});

// Get expense by ID
const getExpenseById = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  const expense = await Expense.findById(expenseId);
  if (!expense) {
    return res.status(404).json({
      error: 'Expense not found'
    });
  }

  // Check access permissions
  if (req.user.role === 'employee' && expense.user_id !== req.user.id) {
    return res.status(403).json({
      error: 'Access denied. You can only view your own expenses.'
    });
  }

  if (req.user.role === 'manager') {
    // Check if expense belongs to their team member or themselves
    const teamMember = await query(
      'SELECT id FROM users WHERE id = $1 AND (manager_id = $2 OR id = $2)',
      [expense.user_id, req.user.id]
    );
    if (teamMember.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied. You can only view your team\'s expenses.'
      });
    }
  }

  // Get expense history
  const history = await Expense.getHistory(expenseId);

  res.json({
    expense: {
      id: expense.id,
      user: {
        id: expense.user_id,
        name: expense.user_name,
        email: expense.user_email
      },
      company: {
        name: expense.company_name,
        default_currency: expense.default_currency
      },
      original_currency: expense.original_currency,
      original_amount: expense.original_amount,
      converted_amount: expense.converted_amount,
      conversion_rate: expense.conversion_rate,
      rate_timestamp: expense.rate_timestamp,
      expense_date: expense.expense_date,
      category: expense.category,
      description: expense.description,
      receipt_url: expense.receipt_url,
      status: expense.status,
      rejection_reason: expense.rejection_reason,
      created_at: expense.created_at,
      updated_at: expense.updated_at
    },
    history
  });
});

// Update expense (only drafts can be updated)
const updateExpense = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;
  const {
    original_currency,
    original_amount,
    expense_date,
    category,
    description,
    receipt_url
  } = req.body;

  const expense = await Expense.findById(expenseId);
  if (!expense) {
    return res.status(404).json({
      error: 'Expense not found'
    });
  }

  // Check ownership
  if (expense.user_id !== req.user.id) {
    return res.status(403).json({
      error: 'Access denied. You can only update your own expenses.'
    });
  }

  // Check if expense is still in draft status
  if (expense.status !== 'draft') {
    return res.status(400).json({
      error: 'Only draft expenses can be updated'
    });
  }

  const updateData = {};
  if (original_currency) {
    const supportedCurrencies = currencyService.getSupportedCurrencies();
    if (!supportedCurrencies.includes(original_currency)) {
      return res.status(400).json({
        error: `Unsupported currency: ${original_currency}`
      });
    }
    updateData.original_currency = original_currency;
  }
  if (original_amount) {
    if (original_amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be greater than 0'
      });
    }
    updateData.original_amount = parseFloat(original_amount);
  }
  if (expense_date) {
    const expenseDate = new Date(expense_date);
    if (expenseDate > new Date()) {
      return res.status(400).json({
        error: 'Expense date cannot be in the future'
      });
    }
    updateData.expense_date = expenseDate;
  }
  if (category) updateData.category = category;
  if (description !== undefined) updateData.description = description;
  if (receipt_url !== undefined) updateData.receipt_url = receipt_url;

  const updatedExpense = await Expense.update(expenseId, updateData);

  // Log the update
  await auditLog({
    entity: 'expense',
    entityId: expenseId,
    action: 'EXPENSE_UPDATED',
    byUser: req.user.id,
    snapshot: { original: expense, updated: updatedExpense, changes: updateData }
  });

  logger.info('Expense updated:', { expenseId, userId: req.user.id, changes: Object.keys(updateData) });

  res.json({
    message: 'Expense updated successfully',
    expense: {
      id: updatedExpense.id,
      original_currency: updatedExpense.original_currency,
      original_amount: updatedExpense.original_amount,
      expense_date: updatedExpense.expense_date,
      category: updatedExpense.category,
      description: updatedExpense.description,
      receipt_url: updatedExpense.receipt_url,
      status: updatedExpense.status,
      updated_at: updatedExpense.updated_at
    }
  });
});

// Submit expense for approval
const submitExpense = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  const expense = await Expense.findById(expenseId);
  if (!expense) {
    return res.status(404).json({
      error: 'Expense not found'
    });
  }

  // Check ownership
  if (expense.user_id !== req.user.id) {
    return res.status(403).json({
      error: 'Access denied. You can only submit your own expenses.'
    });
  }

  // Check if expense is in draft status
  if (expense.status !== 'draft') {
    return res.status(400).json({
      error: 'Only draft expenses can be submitted'
    });
  }

  // Get company details for currency conversion
  const company = await Company.findById(expense.company_id);
  if (!company) {
    return res.status(500).json({
      error: 'Company not found'
    });
  }

  // Submit expense with currency conversion
  const submittedExpense = await Expense.submit(expenseId, company.default_currency);

  // Create approval workflow
  const ApprovalService = require('../services/approvalService');
  const approvalWorkflow = await ApprovalService.createApprovalWorkflow(expenseId);

  // Log the submission
  await auditLog({
    entity: 'expense',
    entityId: expenseId,
    action: 'EXPENSE_SUBMITTED',
    byUser: req.user.id,
    snapshot: submittedExpense
  });

  logger.info('Expense submitted:', { expenseId, userId: req.user.id });

  res.json({
    message: 'Expense submitted successfully',
    expense: {
      id: submittedExpense.id,
      original_currency: submittedExpense.original_currency,
      original_amount: submittedExpense.original_amount,
      converted_amount: submittedExpense.converted_amount,
      conversion_rate: submittedExpense.conversion_rate,
      status: submittedExpense.status,
      updated_at: submittedExpense.updated_at
    },
    approval_workflow: {
      auto_approved: approvalWorkflow.autoApproved,
      steps_created: approvalWorkflow.steps.length
    }
  });
});

// Delete expense (only drafts)
const deleteExpense = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  const expense = await Expense.findById(expenseId);
  if (!expense) {
    return res.status(404).json({
      error: 'Expense not found'
    });
  }

  // Check ownership
  if (expense.user_id !== req.user.id) {
    return res.status(403).json({
      error: 'Access denied. You can only delete your own expenses.'
    });
  }

  // Check if expense is in draft status
  if (expense.status !== 'draft') {
    return res.status(400).json({
      error: 'Only draft expenses can be deleted'
    });
  }

  const deletedExpense = await Expense.delete(expenseId);
  if (!deletedExpense) {
    return res.status(400).json({
      error: 'Unable to delete expense. It may not be in draft status.'
    });
  }

  // Log the deletion
  await auditLog({
    entity: 'expense',
    entityId: expenseId,
    action: 'EXPENSE_DELETED',
    byUser: req.user.id,
    snapshot: deletedExpense
  });

  logger.info('Expense deleted:', { expenseId, userId: req.user.id });

  res.json({
    message: 'Expense deleted successfully'
  });
});

// Get expense statistics
const getExpenseStats = asyncHandler(async (req, res) => {
  const { date_from, date_to, user_id } = req.query;

  const filters = {
    company_id: req.user.company_id
  };

  // Apply role-based filtering
  if (req.user.role === 'employee') {
    filters.user_id = req.user.id;
  } else if (req.user.role === 'manager' && user_id) {
    filters.user_id = user_id;
  } else if (req.user.role === 'admin' && user_id) {
    filters.user_id = user_id;
  }

  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const [stats, categoryStats] = await Promise.all([
    Expense.getStats(filters),
    Expense.getByCategory(filters)
  ]);

  res.json({
    statistics: {
      total_count: parseInt(stats.total_count),
      total_amount: parseFloat(stats.total_amount),
      average_amount: parseFloat(stats.average_amount || 0),
      draft_count: parseInt(stats.draft_count),
      submitted_count: parseInt(stats.submitted_count),
      approved_count: parseInt(stats.approved_count),
      rejected_count: parseInt(stats.rejected_count)
    },
    category_breakdown: categoryStats.map(cat => ({
      category: cat.category,
      count: parseInt(cat.count),
      total_amount: parseFloat(cat.total_amount)
    }))
  });
});

module.exports = {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  submitExpense,
  deleteExpense,
  getExpenseStats
};