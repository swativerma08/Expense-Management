const { query } = require('../config/database');

class ApprovalStep {
  // Create a new approval step
  static async create({
    expense_id,
    approver_id,
    sequence_index
  }) {
    const result = await query(
      `INSERT INTO approval_steps (expense_id, approver_id, sequence_index) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [expense_id, approver_id, sequence_index]
    );
    return result.rows[0];
  }

  // Get approval step by ID
  static async findById(id) {
    const result = await query(
      `SELECT as.*, u.name as approver_name, u.email as approver_email,
              e.original_amount, e.category, e.description
       FROM approval_steps as
       JOIN users u ON as.approver_id = u.id
       JOIN expenses e ON as.expense_id = e.id
       WHERE as.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  // Get approval steps for an expense
  static async findByExpense(expenseId) {
    const result = await query(
      `SELECT as.*, u.name as approver_name, u.email as approver_email,
              ab.name as action_by_name, ab.email as action_by_email
       FROM approval_steps as
       JOIN users u ON as.approver_id = u.id
       LEFT JOIN users ab ON as.action_by = ab.id
       WHERE as.expense_id = $1
       ORDER BY as.sequence_index ASC`,
      [expenseId]
    );
    return result.rows;
  }

  // Get pending approvals for a user
  static async getPendingForUser(userId, filters = {}) {
    let whereClause = 'WHERE as.approver_id = $1 AND as.status = $2';
    const values = [userId, 'pending'];
    let paramCount = 3;

    if (filters.company_id) {
      whereClause += ` AND e.company_id = $${paramCount}`;
      values.push(filters.company_id);
      paramCount++;
    }

    if (filters.category) {
      whereClause += ` AND e.category = $${paramCount}`;
      values.push(filters.category);
      paramCount++;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const result = await query(
      `SELECT as.*, e.*, u.name as user_name, u.email as user_email,
              c.name as company_name, c.default_currency
       FROM approval_steps as
       JOIN expenses e ON as.expense_id = e.id
       JOIN users u ON e.user_id = u.id
       JOIN companies c ON e.company_id = c.id
       ${whereClause}
       ORDER BY e.created_at ASC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...values, limit, offset]
    );
    return result.rows;
  }

  // Update approval step (approve/reject)
  static async updateStatus(id, status, actionBy, comments = null) {
    const result = await query(
      `UPDATE approval_steps 
       SET status = $1, action_by = $2, action_time = NOW(), comments = $3
       WHERE id = $4 
       RETURNING *`,
      [status, actionBy, comments, id]
    );
    return result.rows[0];
  }

  // Check if all required approvals are complete for an expense
  static async checkExpenseApprovalComplete(expenseId) {
    const result = await query(
      `SELECT 
        COUNT(*) as total_steps,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_steps,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_steps,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_steps
       FROM approval_steps 
       WHERE expense_id = $1`,
      [expenseId]
    );
    
    const stats = result.rows[0];
    
    return {
      isComplete: parseInt(stats.pending_steps) === 0,
      isApproved: parseInt(stats.rejected_steps) === 0 && parseInt(stats.approved_steps) === parseInt(stats.total_steps),
      isRejected: parseInt(stats.rejected_steps) > 0,
      stats: {
        total: parseInt(stats.total_steps),
        approved: parseInt(stats.approved_steps),
        rejected: parseInt(stats.rejected_steps),
        pending: parseInt(stats.pending_steps)
      }
    };
  }

  // Get next pending approval step for an expense
  static async getNextPendingStep(expenseId) {
    const result = await query(
      `SELECT as.*, u.name as approver_name, u.email as approver_email
       FROM approval_steps as
       JOIN users u ON as.approver_id = u.id
       WHERE as.expense_id = $1 AND as.status = 'pending'
       ORDER BY as.sequence_index ASC
       LIMIT 1`,
      [expenseId]
    );
    return result.rows[0];
  }

  // Delete approval steps for an expense
  static async deleteByExpense(expenseId) {
    const result = await query(
      'DELETE FROM approval_steps WHERE expense_id = $1 RETURNING *',
      [expenseId]
    );
    return result.rows;
  }

  // Get approval statistics for a user
  static async getApprovalStats(userId, filters = {}) {
    let whereClause = 'WHERE as.approver_id = $1';
    const values = [userId];
    let paramCount = 2;

    if (filters.date_from) {
      whereClause += ` AND as.action_time >= $${paramCount}`;
      values.push(filters.date_from);
      paramCount++;
    }

    if (filters.date_to) {
      whereClause += ` AND as.action_time <= $${paramCount}`;
      values.push(filters.date_to);
      paramCount++;
    }

    const result = await query(
      `SELECT 
        COUNT(*) as total_approvals,
        COUNT(CASE WHEN as.status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN as.status = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN as.status = 'pending' THEN 1 END) as pending_count,
        AVG(EXTRACT(EPOCH FROM (as.action_time - as.created_at))/3600) as avg_approval_time_hours
       FROM approval_steps as
       ${whereClause}`,
      values
    );
    return result.rows[0];
  }
}

module.exports = ApprovalStep;