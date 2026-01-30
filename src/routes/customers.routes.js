const express = require('express');
const CustomersController = require('../controllers/customers.controller');
const { authenticate } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { customerValidation, paginationValidation } = require('../middleware/validate');

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

/**
 * @route GET /api/customers
 * @desc Get all customers
 * @access Private
 */
router.get('/', paginationValidation, CustomersController.getAll);

/**
 * @route POST /api/customers
 * @desc Create a new customer
 * @access Private
 */
router.post('/', customerValidation.create, CustomersController.create);

/**
 * @route GET /api/customers/:id
 * @desc Get customer by ID
 * @access Private
 */
router.get('/:id', CustomersController.getById);

/**
 * @route PUT /api/customers/:id
 * @desc Update customer
 * @access Private
 */
router.put('/:id', customerValidation.update, CustomersController.update);

/**
 * @route DELETE /api/customers/:id
 * @desc Delete customer
 * @access Private
 */
router.delete('/:id', CustomersController.delete);

module.exports = router;
