const express = require('express');
const router = express.Router();
const PurchaseReturnsController = require('../controllers/purchaseReturns.controller');
const { authenticate, restrictSaleRep } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { paginationValidation, sortValidation } = require('../middleware/validate');

const PURCHASE_RETURN_SORT_FIELDS = ['returnNumber', 'status', 'total', 'createdAt', 'orderNumber', 'supplier'];

// Apply authentication and company scope to all routes
// Sale Rep cannot access purchase returns module
router.use(authenticate);
router.use(companyScope);
router.use(restrictSaleRep);

// GET /api/purchase-returns - Get all purchase returns
router.get('/', paginationValidation, sortValidation(PURCHASE_RETURN_SORT_FIELDS), PurchaseReturnsController.getAll);

// GET /api/purchase-returns/purchase/:purchaseId/returnable-items - Get returnable items for a purchase
router.get('/purchase/:purchaseId/returnable-items', PurchaseReturnsController.getReturnableItems);

// POST /api/purchase-returns - Create a new purchase return
router.post('/', PurchaseReturnsController.create);

// GET /api/purchase-returns/:id - Get purchase return by ID
router.get('/:id', PurchaseReturnsController.getById);

// PATCH /api/purchase-returns/:id/status - Update purchase return status
router.patch('/:id/status', PurchaseReturnsController.updateStatus);

// DELETE /api/purchase-returns/:id - Delete purchase return (only pending)
router.delete('/:id', PurchaseReturnsController.delete);

module.exports = router;
