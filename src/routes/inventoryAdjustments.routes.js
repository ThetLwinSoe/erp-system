const express = require('express');
const InventoryAdjustmentsController = require('../controllers/inventoryAdjustments.controller');
const { authenticate, restrictSaleRep } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { paginationValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication and company scope
// Sale Rep cannot access inventory adjustments module
router.use(authenticate);
router.use(companyScope);
router.use(restrictSaleRep);

// GET /api/inventory-adjustments - Get all inventory adjustments
router.get('/', paginationValidation, InventoryAdjustmentsController.getAll);

// GET /api/inventory-adjustments/products - Get products with current stock
router.get('/products', InventoryAdjustmentsController.getProductsWithStock);

// POST /api/inventory-adjustments - Create inventory adjustment
router.post('/', InventoryAdjustmentsController.create);

// GET /api/inventory-adjustments/:id - Get inventory adjustment by ID
router.get('/:id', InventoryAdjustmentsController.getById);

// PATCH /api/inventory-adjustments/:id/status - Update inventory adjustment status
router.patch('/:id/status', InventoryAdjustmentsController.updateStatus);

// DELETE /api/inventory-adjustments/:id - Delete inventory adjustment
router.delete('/:id', InventoryAdjustmentsController.delete);

module.exports = router;
