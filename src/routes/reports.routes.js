const express = require('express');
const ReportsController = require('../controllers/reports.controller');
const { authenticate, checkSaleRep, restrictSaleRep } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

// Sales report - Sale Rep can access but filtered to their own sales
router.get('/sales', checkSaleRep, ReportsController.getSalesReport);
router.get('/sales/export', checkSaleRep, ReportsController.exportSalesReport);

// Purchases report - Sale Rep cannot access
router.get('/purchases', restrictSaleRep, ReportsController.getPurchasesReport);
router.get('/purchases/export', restrictSaleRep, ReportsController.exportPurchasesReport);

module.exports = router;
