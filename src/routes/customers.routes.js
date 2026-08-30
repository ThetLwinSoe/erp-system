const express = require('express');
const CustomersController = require('../controllers/customers.controller');
const { authenticate, restrictSaleRep, requireSuperAdmin } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { customerValidation, paginationValidation, sortValidation } = require('../middleware/validate');
const { uploadCSV } = require('../middleware/upload');

const CUSTOMER_SORT_FIELDS = ['name', 'email', 'phone', 'city', 'type', 'status', 'createdAt'];

const router = express.Router();

// All routes require authentication and company scope
router.use(authenticate);
router.use(companyScope);

/**
 * @route GET /api/customers
 * @desc Get all customers
 * @access Private
 */
router.get('/', paginationValidation, sortValidation(CUSTOMER_SORT_FIELDS), CustomersController.getAll);

/**
 * @route POST /api/customers
 * @desc Create a new customer
 * @access Private (Sale Rep cannot create)
 */
router.post('/', restrictSaleRep, customerValidation.create, CustomersController.create);

/**
 * @route GET /api/customers/export
 * @desc Export customers to CSV
 * @access Private
 */
router.get('/export', CustomersController.exportCSV);

/**
 * @route POST /api/customers/import
 * @desc Bulk import customers from CSV
 * @access Private (Sale Rep cannot import)
 */
router.post('/import', restrictSaleRep, uploadCSV, CustomersController.importCSV);

/**
 * @route GET /api/customers/:id
 * @desc Get customer by ID
 * @access Private
 */
router.get('/:id', CustomersController.getById);

/**
 * @route PUT /api/customers/:id
 * @desc Update customer
 * @access Private (Sale Rep cannot update)
 */
router.put('/:id', restrictSaleRep, customerValidation.update, CustomersController.update);

/**
 * @route PATCH /api/customers/:id/status
 * @desc Toggle customer active/inactive status
 * @access Private (Sale Rep cannot toggle)
 */
router.patch('/:id/status', restrictSaleRep, CustomersController.toggleStatus);

/**
 * @route DELETE /api/customers/:id
 * @desc Delete customer
 * @access Private (Super Admin only)
 */
router.delete('/:id', requireSuperAdmin, CustomersController.delete);

module.exports = router;
