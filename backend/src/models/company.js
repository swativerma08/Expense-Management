const { query } = require('../config/database');

class Company {
  // Create a new company
  static async create({ name, country, default_currency }) {
    const result = await query(
      `INSERT INTO companies (name, country, default_currency) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [name, country, default_currency]
    );
    return result.rows[0];
  }

  // Get company by ID
  static async findById(id) {
    const result = await query(
      'SELECT * FROM companies WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Update company
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
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  // Get all companies (admin only)
  static async findAll() {
    const result = await query(
      'SELECT * FROM companies ORDER BY created_at DESC'
    );
    return result.rows;
  }

  // Delete company
  static async delete(id) {
    const result = await query(
      'DELETE FROM companies WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Get company statistics
  static async getStats(companyId) {
    const result = await query(
      `SELECT 
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT CASE WHEN u.role = 'employee' THEN u.id END) as employees,
        COUNT(DISTINCT CASE WHEN u.role = 'manager' THEN u.id END) as managers,
        COUNT(DISTINCT CASE WHEN u.role = 'admin' THEN u.id END) as admins,
        COUNT(DISTINCT e.id) as total_expenses,
        COALESCE(SUM(e.converted_amount), 0) as total_amount,
        COUNT(DISTINCT CASE WHEN e.status = 'pending' THEN e.id END) as pending_expenses
       FROM companies c
       LEFT JOIN users u ON c.id = u.company_id
       LEFT JOIN expenses e ON c.id = e.company_id
       WHERE c.id = $1
       GROUP BY c.id`,
      [companyId]
    );
    return result.rows[0];
  }
}

module.exports = Company;