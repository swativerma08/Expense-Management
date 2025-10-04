const { query } = require('../config/database');
const { hashPassword, comparePassword } = require('../config/auth');

class User {
  // Create a new user
  static async create({ company_id, name, email, password, role, manager_id }) {
    const hashedPassword = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (company_id, name, email, password_hash, role, manager_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, company_id, name, email, role, manager_id, is_active, created_at`,
      [company_id, name, email, hashedPassword, role, manager_id]
    );
    return result.rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const result = await query(
      `SELECT u.*, c.name as company_name, c.default_currency 
       FROM users u 
       JOIN companies c ON u.company_id = c.id 
       WHERE u.email = $1`,
      [email]
    );
    return result.rows[0];
  }

  // Find user by ID
  static async findById(id) {
    const result = await query(
      `SELECT u.*, c.name as company_name, c.default_currency,
              m.name as manager_name, m.email as manager_email
       FROM users u 
       JOIN companies c ON u.company_id = c.id 
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  // Validate password
  static async validatePassword(user, password) {
    return await comparePassword(password, user.password_hash);
  }

  // Update user
  static async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Hash password if it's being updated
    if (data.password) {
      data.password_hash = await hashPassword(data.password);
      delete data.password;
    }

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
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} 
       RETURNING id, company_id, name, email, role, manager_id, is_active, created_at, updated_at`,
      values
    );
    return result.rows[0];
  }

  // Get users by company
  static async findByCompany(companyId, filters = {}) {
    let whereClause = 'WHERE u.company_id = $1';
    const values = [companyId];
    let paramCount = 2;

    if (filters.role) {
      whereClause += ` AND u.role = $${paramCount}`;
      values.push(filters.role);
      paramCount++;
    }

    if (filters.is_active !== undefined) {
      whereClause += ` AND u.is_active = $${paramCount}`;
      values.push(filters.is_active);
      paramCount++;
    }

    if (filters.manager_id) {
      whereClause += ` AND u.manager_id = $${paramCount}`;
      values.push(filters.manager_id);
      paramCount++;
    }

    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              m.name as manager_name, m.email as manager_email
       FROM users u 
       LEFT JOIN users m ON u.manager_id = m.id
       ${whereClause}
       ORDER BY u.created_at DESC`,
      values
    );
    return result.rows;
  }

  // Get direct reports for a manager
  static async getDirectReports(managerId) {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at
       FROM users u 
       WHERE u.manager_id = $1 AND u.is_active = true
       ORDER BY u.name`,
      [managerId]
    );
    return result.rows;
  }

  // Update last login
  static async updateLastLogin(userId) {
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [userId]
    );
  }

  // Delete user (soft delete by setting is_active to false)
  static async delete(id) {
    const result = await query(
      'UPDATE users SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Get user statistics
  static async getStats(userId) {
    const result = await query(
      `SELECT 
        COUNT(e.id) as total_expenses,
        COALESCE(SUM(e.converted_amount), 0) as total_amount,
        COUNT(CASE WHEN e.status = 'draft' THEN 1 END) as draft_expenses,
        COUNT(CASE WHEN e.status = 'submitted' THEN 1 END) as submitted_expenses,
        COUNT(CASE WHEN e.status = 'approved' THEN 1 END) as approved_expenses,
        COUNT(CASE WHEN e.status = 'rejected' THEN 1 END) as rejected_expenses
       FROM expenses e
       WHERE e.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  // Search users
  static async search(companyId, searchTerm) {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role
       FROM users u 
       WHERE u.company_id = $1 
         AND u.is_active = true
         AND (u.name ILIKE $2 OR u.email ILIKE $2)
       ORDER BY u.name
       LIMIT 20`,
      [companyId, `%${searchTerm}%`]
    );
    return result.rows;
  }
}

module.exports = User;