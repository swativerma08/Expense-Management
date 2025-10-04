const express = require('express');
const router = express.Router();
const {
  getExpenseReports,
  exportExpensesToCSV,
  getDashboardStats
} = require('../controllers/reportController');
const { authenticate, companyAccess } = require('../middleware/auth');

// Routes
router.get('/', authenticate, companyAccess, getExpenseReports);
router.get('/export/csv', authenticate, companyAccess, exportExpensesToCSV);
router.get('/dashboard', authenticate, companyAccess, getDashboardStats);

module.exports = router;