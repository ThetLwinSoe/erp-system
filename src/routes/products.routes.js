const express = require('express');
const ProductsController = require('../controllers/products.controller');
const { authenticate } = require('../middleware/auth');
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
 * @access Private
 */
router.post('/', productValidation.create, ProductsController.create);

/**
 * @route GET /api/products/:id
 * @desc Get product by ID
 * @access Private
 */
router.get('/:id', ProductsController.getById);

/**
 * @route PUT /api/products/:id
 * @desc Update product
 * @access Private
 */
router.put('/:id', productValidation.update, ProductsController.update);

/**
 * @route DELETE /api/products/:id
 * @desc Delete product
 * @access Private
 */
router.delete('/:id', ProductsController.delete);

module.exports = router;
