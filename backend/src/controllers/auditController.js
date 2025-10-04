const { getAuditLogs, getCompanyAuditLogs, searchAuditLogs } = require('../services/auditService');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get audit logs for a specific entity
const getEntityAuditLogs = asyncHandler(async (req, res) => {
  const { entity, entityId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const auditLogs = await getAuditLogs(entity, entityId, parseInt(limit), parseInt(offset));

    res.json({
      entity,
      entity_id: entityId,
      audit_logs: auditLogs.map(log => ({
        id: log.id,
        action: log.action,
        user: {
          id: log.by_user,
          name: log.user_name,
          email: log.user_email
        },
        snapshot: log.snapshot,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        created_at: log.created_at
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error('Failed to get entity audit logs:', error);
    res.status(500).json({
      error: 'Failed to retrieve audit logs'
    });
  }
});

// Get company audit logs (admin only)
const getCompanyAuditLogsController = asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;

  try {
    const auditLogs = await getCompanyAuditLogs(req.user.company_id, parseInt(limit), parseInt(offset));

    res.json({
      company_id: req.user.company_id,
      audit_logs: auditLogs.map(log => ({
        id: log.id,
        entity: log.entity,
        entity_id: log.entity_id,
        action: log.action,
        user: {
          id: log.by_user,
          name: log.user_name,
          email: log.user_email
        },
        snapshot: log.snapshot,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        created_at: log.created_at
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error('Failed to get company audit logs:', error);
    res.status(500).json({
      error: 'Failed to retrieve company audit logs'
    });
  }
});

// Search audit logs (admin only)
const searchAuditLogsController = asyncHandler(async (req, res) => {
  const {
    entity,
    action,
    user_id,
    date_from,
    date_to,
    limit = 50,
    offset = 0
  } = req.query;

  const filters = {
    companyId: req.user.company_id,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };

  if (entity) filters.entity = entity;
  if (action) filters.action = action;
  if (user_id) filters.byUser = user_id;
  if (date_from) filters.dateFrom = date_from;
  if (date_to) filters.dateTo = date_to;

  try {
    const auditLogs = await searchAuditLogs(filters);

    res.json({
      search_filters: filters,
      audit_logs: auditLogs.map(log => ({
        id: log.id,
        entity: log.entity,
        entity_id: log.entity_id,
        action: log.action,
        user: {
          id: log.by_user,
          name: log.user_name,
          email: log.user_email
        },
        snapshot: log.snapshot,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        created_at: log.created_at
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error('Failed to search audit logs:', error);
    res.status(500).json({
      error: 'Failed to search audit logs'
    });
  }
});

module.exports = {
  getEntityAuditLogs,
  getCompanyAuditLogsController,
  searchAuditLogsController
};