const { query } = require('../config/database');
const logger = require('../utils/logger');

// Create an audit log entry
const auditLog = async ({ 
  entity, 
  entityId, 
  action, 
  byUser, 
  snapshot, 
  ipAddress = null, 
  userAgent = null 
}) => {
  try {
    await query(
      `INSERT INTO audit_logs (entity, entity_id, action, by_user, snapshot, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entity, entityId, action, byUser, JSON.stringify(snapshot), ipAddress, userAgent]
    );
    
    logger.info('Audit log created:', { entity, entityId, action, byUser });
  } catch (error) {
    logger.error('Failed to create audit log:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

// Get audit logs for an entity
const getAuditLogs = async (entity, entityId, limit = 50, offset = 0) => {
  const result = await query(
    `SELECT al.*, u.name as user_name, u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON al.by_user = u.id
     WHERE al.entity = $1 AND al.entity_id = $2
     ORDER BY al.created_at DESC
     LIMIT $3 OFFSET $4`,
    [entity, entityId, limit, offset]
  );
  return result.rows;
};

// Get audit logs for a user's actions
const getUserAuditLogs = async (userId, limit = 50, offset = 0) => {
  const result = await query(
    `SELECT al.*, u.name as user_name, u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON al.by_user = u.id
     WHERE al.by_user = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
};

// Get audit logs for a company
const getCompanyAuditLogs = async (companyId, limit = 100, offset = 0) => {
  const result = await query(
    `SELECT al.*, u.name as user_name, u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON al.by_user = u.id
     JOIN users cu ON al.by_user = cu.id
     WHERE cu.company_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [companyId, limit, offset]
  );
  return result.rows;
};

// Search audit logs
const searchAuditLogs = async (filters) => {
  let whereClause = 'WHERE 1=1';
  const values = [];
  let paramCount = 1;

  if (filters.entity) {
    whereClause += ` AND al.entity = $${paramCount}`;
    values.push(filters.entity);
    paramCount++;
  }

  if (filters.action) {
    whereClause += ` AND al.action = $${paramCount}`;
    values.push(filters.action);
    paramCount++;
  }

  if (filters.byUser) {
    whereClause += ` AND al.by_user = $${paramCount}`;
    values.push(filters.byUser);
    paramCount++;
  }

  if (filters.dateFrom) {
    whereClause += ` AND al.created_at >= $${paramCount}`;
    values.push(filters.dateFrom);
    paramCount++;
  }

  if (filters.dateTo) {
    whereClause += ` AND al.created_at <= $${paramCount}`;
    values.push(filters.dateTo);
    paramCount++;
  }

  if (filters.companyId) {
    whereClause += ` AND cu.company_id = $${paramCount}`;
    values.push(filters.companyId);
    paramCount++;
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const result = await query(
    `SELECT al.*, u.name as user_name, u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON al.by_user = u.id
     LEFT JOIN users cu ON al.by_user = cu.id
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...values, limit, offset]
  );
  return result.rows;
};

module.exports = {
  auditLog,
  getAuditLogs,
  getUserAuditLogs,
  getCompanyAuditLogs,
  searchAuditLogs
};