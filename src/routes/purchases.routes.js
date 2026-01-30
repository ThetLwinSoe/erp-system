const express = require('express');
const PurchasesController = require('../controllers/purchases.controller');
const { authenticate } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { purchaseValidation, paginationValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

/**
 * @route GET /api/purchases
 * @desc Get all purchase orders
 * @access Private
 */
router.get('/', paginationValidation, PurchasesController.getAll);

/**
 * @route POST /api/purchases
 * @desc Create a new purchase order
 * @access Private
 */
router.post('/', purchaseValidation.create, PurchasesController.create);

/**
 * @route GET /api/purchases/:id
 * @desc Get purchase by ID
 * @access Private
 */
router.get('/:id', PurchasesController.getById);

/**
 * @route PUT /api/purchases/:id
 * @desc Update purchase
 * @access Private
 */
router.put('/:id', PurchasesController.update);

/**
 * @route PATCH /api/purchases/:id/status
 * @desc Update purchase status
 * @access Private
 */
router.patch('/:id/status', purchaseValidation.updateStatus, PurchasesController.updateStatus);

/**
 * @route PATCH /api/purchases/:id/receive
 * @desc Receive goods from purchase
 * @access Private
 */
router.patch('/:id/receive', purchaseValidation.receive, PurchasesController.receive);

/**
 * @route DELETE /api/purchases/:id
 * @desc Delete purchase
 * @access Private
 */
router.delete('/:id', PurchasesController.delete);

module.exports = router;
