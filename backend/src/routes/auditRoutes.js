const express = require('express');
const router = express.Router();
const {
  getEntityAuditLogs,
  getCompanyAuditLogsController,
  searchAuditLogsController
} = require('../controllers/auditController');
const { authenticate, authorize, companyAccess } = require('../middleware/auth');

// Routes
router.get('/:entity/:entityId', authenticate, getEntityAuditLogs);
router.get('/company/all', authenticate, authorize('admin'), companyAccess, getCompanyAuditLogsController);
router.get('/search', authenticate, authorize('admin'), companyAccess, searchAuditLogsController);

module.exports = router;