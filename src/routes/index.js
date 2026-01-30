const express = require('express');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const customersRoutes = require('./customers.routes');
const productsRoutes = require('./products.routes');
const inventoryRoutes = require('./inventory.routes');
const salesRoutes = require('./sales.routes');
const purchasesRoutes = require('./purchases.routes');
const reportsRoutes = require('./reports.routes');
const companiesRoutes = require('./companies.routes');

const router = express.Router();

// API Routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/customers', customersRoutes);
router.use('/products', productsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/sales', salesRoutes);
router.use('/purchases', purchasesRoutes);
router.use('/reports', reportsRoutes);
router.use('/companies', companiesRoutes);

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
      purchases: '/api/purchases',
      reports: '/api/reports',
      companies: '/api/companies',
    },
  });
});

module.exports = router;
