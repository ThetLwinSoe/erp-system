const express = require('express');
const SalesReturnsController = require('../controllers/salesReturns.controller');
const { authenticate } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { paginationValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

/**
 * @route GET /api/sales-returns
 * @desc Get all sales returns
 * @access Private
 */
router.get('/', paginationValidation, SalesReturnsController.getAll);

/**
 * @route GET /api/sales-returns/sale/:saleId/returnable-items
 * @desc Get returnable items for a sale
 * @access Private
 */
router.get('/sale/:saleId/returnable-items', SalesReturnsController.getReturnableItems);

/**
 * @route POST /api/sales-returns
 * @desc Create a new sales return
 * @access Private
 */
router.post('/', SalesReturnsController.create);

/**
 * @route GET /api/sales-returns/:id
 * @desc Get sales return by ID
 * @access Private
 */
router.get('/:id', SalesReturnsController.getById);

/**
 * @route PATCH /api/sales-returns/:id/status
 * @desc Update sales return status
 * @access Private
 */
router.patch('/:id/status', SalesReturnsController.updateStatus);

/**
 * @route DELETE /api/sales-returns/:id
 * @desc Delete sales return (only pending)
 * @access Private
 */
router.delete('/:id', SalesReturnsController.delete);

module.exports = router;
