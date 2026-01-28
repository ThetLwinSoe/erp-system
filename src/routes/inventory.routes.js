const express = require('express');
const InventoryController = require('../controllers/inventory.controller');
const { authenticate } = require('../middleware/auth');
const { inventoryValidation, paginationValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/inventory
 * @desc Get all inventory items
 * @access Private
 */
router.get('/', paginationValidation, InventoryController.getAll);

/**
 * @route GET /api/inventory/low-stock
 * @desc Get items below minimum stock level
 * @access Private
 */
router.get('/low-stock', InventoryController.getLowStock);

/**
 * @route GET /api/inventory/:productId
 * @desc Get inventory for a specific product
 * @access Private
 */
router.get('/:productId', InventoryController.getByProduct);

/**
 * @route PUT /api/inventory/:productId
 * @desc Update inventory for a product
 * @access Private
 */
router.put('/:productId', inventoryValidation.update, InventoryController.update);

/**
 * @route POST /api/inventory/adjust
 * @desc Adjust inventory (add/remove/set)
 * @access Private
 */
router.post('/adjust', inventoryValidation.adjust, InventoryController.adjust);

module.exports = router;
