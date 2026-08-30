const express = require('express');
const SalesController = require('../controllers/sales.controller');
const { authenticate, checkSaleRep } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { salesValidation, paginationValidation, sortValidation } = require('../middleware/validate');

const SALES_SORT_FIELDS = ['orderNumber', 'status', 'subtotal', 'tax', 'total', 'createdAt', 'customer', 'user'];

const router = express.Router();

// All routes require authentication and company scope
// Sale Rep can access sales but will be filtered to their own records
router.use(authenticate);
router.use(companyScope);
router.use(checkSaleRep);

/**
 * @route GET /api/sales
 * @desc Get all sales orders
 * @access Private
 */
router.get('/', paginationValidation, sortValidation(SALES_SORT_FIELDS), SalesController.getAll);

/**
 * @route POST /api/sales
 * @desc Create a new sale order
 * @access Private
 */
router.post('/', salesValidation.create, SalesController.create);

/**
 * @route GET /api/sales/:id
 * @desc Get sale by ID
 * @access Private
 */
router.get('/:id', SalesController.getById);

/**
 * @route PUT /api/sales/:id
 * @desc Update sale
 * @access Private
 */
router.put('/:id', SalesController.update);

/**
 * @route PATCH /api/sales/:id/status
 * @desc Update sale status
 * @access Private
 */
router.patch('/:id/status', salesValidation.updateStatus, SalesController.updateStatus);

/**
 * @route DELETE /api/sales/:id
 * @desc Delete/cancel sale
 * @access Private
 */
router.delete('/:id', SalesController.delete);

module.exports = router;
