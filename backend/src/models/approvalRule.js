const { query } = require('../config/database');

class ApprovalRule {
  // Create a new approval rule
  static async create({
    company_id,
    name,
    type,
    threshold_amount,
    threshold_percentage,
    specific_approver_id,
    applies_to_category,
    applies_to_role,
    sequence_order
  }) {
    const result = await query(
      `INSERT INTO approval_rules (
        company_id, name, type, threshold_amount, threshold_percentage,
        specific_approver_id, applies_to_category, applies_to_role, sequence_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *`,
      [company_id, name, type, threshold_amount, threshold_percentage, 
       specific_approver_id, applies_to_category, applies_to_role, sequence_order]
    );
    return result.rows[0];
  }

  // Get approval rule by ID
  static async findById(id) {
    const result = await query(
      `SELECT ar.*, u.name as approver_name, u.email as approver_email
       FROM approval_rules ar
       LEFT JOIN users u ON ar.specific_approver_id = u.id
       WHERE ar.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  // Get approval rules by company
  static async findByCompany(companyId, filters = {}) {
    let whereClause = 'WHERE ar.company_id = $1';
    const values = [companyId];
    let paramCount = 2;

    if (filters.is_active !== undefined) {
      whereClause += ` AND ar.is_active = $${paramCount}`;
      values.push(filters.is_active);
      paramCount++;
    }

    if (filters.type) {
      whereClause += ` AND ar.type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    if (filters.applies_to_category) {
      whereClause += ` AND ar.applies_to_category = $${paramCount}`;
      values.push(filters.applies_to_category);
      paramCount++;
    }

    const result = await query(
      `SELECT ar.*, u.name as approver_name, u.email as approver_email
       FROM approval_rules ar
       LEFT JOIN users u ON ar.specific_approver_id = u.id
       ${whereClause}
       ORDER BY ar.sequence_order ASC, ar.created_at ASC`,
      values
    );
    return result.rows;
  }

  // Update approval rule
  static async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(data[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const result = await query(
      `UPDATE approval_rules SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  // Delete approval rule
  static async delete(id) {
    const result = await query(
      'DELETE FROM approval_rules WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Get applicable rules for an expense
  static async getApplicableRules(expense) {
    const result = await query(
      `SELECT ar.*, u.name as approver_name, u.email as approver_email
       FROM approval_rules ar
       LEFT JOIN users u ON ar.specific_approver_id = u.id
       WHERE ar.company_id = $1 
         AND ar.is_active = true
         AND (ar.applies_to_category IS NULL OR ar.applies_to_category = $2)
         AND (ar.threshold_amount IS NULL OR ar.threshold_amount <= $3)
       ORDER BY ar.sequence_order ASC, ar.created_at ASC`,
      [expense.company_id, expense.category, expense.converted_amount || expense.original_amount]
    );
    return result.rows;
  }
}

module.exports = ApprovalRule;