const express = require('express');
const ReportsController = require('../controllers/reports.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Sales report
router.get('/sales', ReportsController.getSalesReport);
router.get('/sales/export', ReportsController.exportSalesReport);

// Purchases report
router.get('/purchases', ReportsController.getPurchasesReport);
router.get('/purchases/export', ReportsController.exportPurchasesReport);

module.exports = router;
