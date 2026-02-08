const express = require('express');
const ProductsController = require('../controllers/products.controller');
const { authenticate, restrictSaleRep, requireSuperAdmin } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { productValidation, paginationValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

/**
 * @route GET /api/products
 * @desc Get all products
 * @access Private
 */
router.get('/', paginationValidation, ProductsController.getAll);

/**
 * @route POST /api/products
 * @desc Create a new product
 * @access Private (Sale Rep cannot create)
 */
router.post('/', restrictSaleRep, productValidation.create, ProductsController.create);

/**
 * @route GET /api/products/:id
 * @desc Get product by ID
 * @access Private
 */
router.get('/:id', ProductsController.getById);

/**
 * @route PUT /api/products/:id
 * @desc Update product
 * @access Private (Sale Rep cannot update)
 */
router.put('/:id', restrictSaleRep, productValidation.update, ProductsController.update);

/**
 * @route PATCH /api/products/:id/status
 * @desc Toggle product active/inactive status
 * @access Private (Sale Rep cannot toggle)
 */
router.patch('/:id/status', restrictSaleRep, ProductsController.toggleStatus);

/**
 * @route DELETE /api/products/:id
 * @desc Delete product
 * @access Private (Super Admin only)
 */
router.delete('/:id', requireSuperAdmin, ProductsController.delete);

module.exports = router;
