const { query, getClient } = require('../config/database');
const currencyService = require('../services/currencyService');

class Expense {
  // Create a new expense
  static async create({
    company_id,
    user_id,
    original_currency,
    original_amount,
    expense_date,
    category,
    description,
    receipt_url
  }) {
    const result = await query(
      `INSERT INTO expenses (
        company_id, user_id, original_currency, original_amount, 
        expense_date, category, description, receipt_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *`,
      [company_id, user_id, original_currency, original_amount, expense_date, category, description, receipt_url]
    );
    return result.rows[0];
  }

  // Get expense by ID
  static async findById(id) {
    const result = await query(
      `SELECT e.*, u.name as user_name, u.email as user_email,
              c.name as company_name, c.default_currency
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       JOIN companies c ON e.company_id = c.id
       WHERE e.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  // Update expense
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
      `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  // Submit expense for approval (with currency conversion)
  static async submit(id, companyDefaultCurrency) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Get expense details
      const expenseResult = await client.query(
        'SELECT * FROM expenses WHERE id = $1 AND status = $2',
        [id, 'draft']
      );

      if (expenseResult.rows.length === 0) {
        throw new Error('Expense not found or not in draft status');
      }

      const expense = expenseResult.rows[0];

      // Convert currency if needed
      let convertedAmount = expense.original_amount;
      let conversionRate = 1.0;
      let rateTimestamp = new Date();

      if (expense.original_currency !== companyDefaultCurrency) {
        const conversion = await currencyService.convertAmount(
          expense.original_amount,
          expense.original_currency,
          companyDefaultCurrency
        );
        convertedAmount = conversion.convertedAmount;
        conversionRate = conversion.rate;
        rateTimestamp = conversion.timestamp;
      }

      // Update expense with conversion details and submit
      const updateResult = await client.query(
        `UPDATE expenses 
         SET converted_amount = $1, conversion_rate = $2, rate_timestamp = $3, status = $4
         WHERE id = $5 
         RETURNING *`,
        [convertedAmount, conversionRate, rateTimestamp, 'submitted', id]
      );

      await client.query('COMMIT');
      return updateResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get expenses with filters
  static async findWithFilters(filters) {
    let whereClause = 'WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.company_id) {
      whereClause += ` AND e.company_id = $${paramCount}`;
      values.push(filters.company_id);
      paramCount++;
    }

    if (filters.user_id) {
      whereClause += ` AND e.user_id = $${paramCount}`;
      values.push(filters.user_id);
      paramCount++;
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        const placeholders = filters.status.map(() => `$${paramCount++}`).join(', ');
        whereClause += ` AND e.status IN (${placeholders})`;
        values.push(...filters.status);
      } else {
        whereClause += ` AND e.status = $${paramCount}`;
        values.push(filters.status);
        paramCount++;
      }
    }

    if (filters.category) {
      whereClause += ` AND e.category = $${paramCount}`;
      values.push(filters.category);
      paramCount++;
    }

    if (filters.date_from) {
      whereClause += ` AND e.expense_date >= $${paramCount}`;
      values.push(filters.date_from);
      paramCount++;
    }

    if (filters.date_to) {
      whereClause += ` AND e.expense_date <= $${paramCount}`;
      values.push(filters.date_to);
      paramCount++;
    }

    if (filters.amount_min) {
      whereClause += ` AND COALESCE(e.converted_amount, e.original_amount) >= $${paramCount}`;
      values.push(filters.amount_min);
      paramCount++;
    }

    if (filters.amount_max) {
      whereClause += ` AND COALESCE(e.converted_amount, e.original_amount) <= $${paramCount}`;
      values.push(filters.amount_max);
      paramCount++;
    }

    // For managers, only show their team's expenses
    if (filters.manager_id) {
      whereClause += ` AND u.manager_id = $${paramCount}`;
      values.push(filters.manager_id);
      paramCount++;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const orderBy = filters.order_by || 'e.created_at DESC';

    const result = await query(
      `SELECT e.*, u.name as user_name, u.email as user_email,
              c.name as company_name, c.default_currency
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       JOIN companies c ON e.company_id = c.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...values, limit, offset]
    );

    return result.rows;
  }

  // Get expense statistics
  static async getStats(filters) {
    let whereClause = 'WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.company_id) {
      whereClause += ` AND e.company_id = $${paramCount}`;
      values.push(filters.company_id);
      paramCount++;
    }

    if (filters.user_id) {
      whereClause += ` AND e.user_id = $${paramCount}`;
      values.push(filters.user_id);
      paramCount++;
    }

    if (filters.date_from) {
      whereClause += ` AND e.expense_date >= $${paramCount}`;
      values.push(filters.date_from);
      paramCount++;
    }

    if (filters.date_to) {
      whereClause += ` AND e.expense_date <= $${paramCount}`;
      values.push(filters.date_to);
      paramCount++;
    }

    const result = await query(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN e.converted_amount IS NOT NULL THEN e.converted_amount ELSE e.original_amount END), 0) as total_amount,
        COUNT(CASE WHEN e.status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN e.status = 'submitted' THEN 1 END) as submitted_count,
        COUNT(CASE WHEN e.status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN e.status = 'rejected' THEN 1 END) as rejected_count,
        AVG(CASE WHEN e.converted_amount IS NOT NULL THEN e.converted_amount ELSE e.original_amount END) as average_amount
       FROM expenses e
       ${whereClause}`,
      values
    );

    return result.rows[0];
  }

  // Get expenses by category for reporting
  static async getByCategory(filters) {
    let whereClause = 'WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.company_id) {
      whereClause += ` AND e.company_id = $${paramCount}`;
      values.push(filters.company_id);
      paramCount++;
    }

    if (filters.date_from) {
      whereClause += ` AND e.expense_date >= $${paramCount}`;
      values.push(filters.date_from);
      paramCount++;
    }

    if (filters.date_to) {
      whereClause += ` AND e.expense_date <= $${paramCount}`;
      values.push(filters.date_to);
      paramCount++;
    }

    const result = await query(
      `SELECT 
        e.category,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN e.converted_amount IS NOT NULL THEN e.converted_amount ELSE e.original_amount END), 0) as total_amount
       FROM expenses e
       ${whereClause}
       GROUP BY e.category
       ORDER BY total_amount DESC`,
      values
    );

    return result.rows;
  }

  // Delete expense (only drafts can be deleted)
  static async delete(id) {
    const result = await query(
      'DELETE FROM expenses WHERE id = $1 AND status = $2 RETURNING *',
      [id, 'draft']
    );
    return result.rows[0];
  }

  // Get expense history with approval steps
  static async getHistory(id) {
    const result = await query(
      `SELECT 
        'expense' as type, e.created_at as timestamp, 'CREATED' as action, 
        u.name as user_name, e.status, null as comments
       FROM expenses e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = $1
       
       UNION ALL
       
       SELECT 
        'approval' as type, a.action_time as timestamp, a.status as action,
        u.name as user_name, a.status, a.comments
       FROM approval_steps a
       JOIN users u ON a.action_by = u.id
       WHERE a.expense_id = $1 AND a.action_time IS NOT NULL
       
       ORDER BY timestamp ASC`,
      [id]
    );

    return result.rows;
  }
}

module.exports = Expense;