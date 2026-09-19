const express = require('express');
const ReportsController = require('../controllers/reports.controller');
const { authenticate, checkSaleRep, restrictSaleRep } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { reportsValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

// Sales report - Sale Rep can access but filtered to their own sales
router.get('/sales', checkSaleRep, reportsValidation.dateRange, ReportsController.getSalesReport);
router.get('/sales/export', checkSaleRep, reportsValidation.dateRange, ReportsController.exportSalesReport);

// Not Buying Customers report - Sale Rep can access, "bought" scoped to their own sales
router.get('/not-buying-customers', checkSaleRep, reportsValidation.dateRange, ReportsController.getNotBuyingCustomersReport);
router.get('/not-buying-customers/export', checkSaleRep, reportsValidation.dateRange, ReportsController.exportNotBuyingCustomersReport);

// Lightweight user list (id/name only) for the "Created By" filter above - not
// the full /api/users endpoint (admin-only, fuller records) since every role
// except Sale Rep needs this for the not-buying-customers filter.
router.get('/report-users', restrictSaleRep, ReportsController.getReportUsers);

// Purchases report - Sale Rep cannot access
router.get('/purchases', restrictSaleRep, reportsValidation.dateRange, ReportsController.getPurchasesReport);
router.get('/purchases/export', restrictSaleRep, reportsValidation.dateRange, ReportsController.exportPurchasesReport);

// Profit & Loss report - exposes cost/margin data, Sale Rep cannot access
router.get('/profit-loss', restrictSaleRep, reportsValidation.dateRange, ReportsController.getProfitLossReport);
router.get('/profit-loss/export', restrictSaleRep, reportsValidation.dateRange, ReportsController.exportProfitLossReport);

module.exports = router;
