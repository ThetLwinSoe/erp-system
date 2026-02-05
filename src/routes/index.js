const express = require('express');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const customersRoutes = require('./customers.routes');
const productsRoutes = require('./products.routes');
const inventoryRoutes = require('./inventory.routes');
const salesRoutes = require('./sales.routes');
const salesReturnsRoutes = require('./salesReturns.routes');
const purchasesRoutes = require('./purchases.routes');
const purchaseReturnsRoutes = require('./purchaseReturns.routes');
const reportsRoutes = require('./reports.routes');
const companiesRoutes = require('./companies.routes');
const inventoryAdjustmentsRoutes = require('./inventoryAdjustments.routes');

const router = express.Router();

// API Routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/customers', customersRoutes);
router.use('/products', productsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/sales', salesRoutes);
router.use('/sales-returns', salesReturnsRoutes);
router.use('/purchases', purchasesRoutes);
router.use('/purchase-returns', purchaseReturnsRoutes);
router.use('/reports', reportsRoutes);
router.use('/companies', companiesRoutes);
router.use('/inventory-adjustments', inventoryAdjustmentsRoutes);

// API Info
router.get('/', (req, res) => {
  res.json({
    name: 'ERP System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      customers: '/api/customers',
      products: '/api/products',
      inventory: '/api/inventory',
      sales: '/api/sales',
      salesReturns: '/api/sales-returns',
      purchases: '/api/purchases',
      purchaseReturns: '/api/purchase-returns',
      reports: '/api/reports',
      companies: '/api/companies',
      inventoryAdjustments: '/api/inventory-adjustments',
    },
  });
});

module.exports = router;
