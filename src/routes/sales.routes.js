const express = require('express');
const SalesController = require('../controllers/sales.controller');
const { authenticate } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { salesValidation, paginationValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

/**
 * @route GET /api/sales
 * @desc Get all sales orders
 * @access Private
 */
router.get('/', paginationValidation, SalesController.getAll);

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
