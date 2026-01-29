const { validationResult, body, param, query } = require('express-validator');
const ApiResponse = require('../utils/apiResponse');
const { ROLES, ORDER_STATUS, PURCHASE_STATUS, ADJUSTMENT_TYPE } = require('../utils/constants');

/**
 * Validation result handler
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));
    return ApiResponse.badRequest(res, 'Validation failed', formattedErrors);
  }
  next();
};

/**
 * Auth validation rules
 */
const authValidation = {
  register: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('role')
      .optional()
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role'),
    handleValidation,
  ],
  login: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidation,
  ],
};

/**
 * User validation rules
 */
const userValidation = {
  update: [
    param('id').isInt().withMessage('Valid user ID is required'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('role')
      .optional()
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role'),
    handleValidation,
  ],
  getById: [
    param('id').isInt().withMessage('Valid user ID is required'),
    handleValidation,
  ],
};

/**
 * Customer validation rules
 */
const customerValidation = {
  create: [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone').optional().trim(),
    body('address').optional().trim(),
    body('city').optional().trim(),
    body('country').optional().trim(),
    handleValidation,
  ],
  update: [
    param('id').isInt().withMessage('Valid customer ID is required'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    handleValidation,
  ],
};

/**
 * Product validation rules
 */
const productValidation = {
  create: [
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('unit').optional().trim(),
    body('costPrice')
      .isFloat({ min: 0 })
      .withMessage('Cost price must be a positive number'),
    body('sellingPrice')
      .isFloat({ min: 0 })
      .withMessage('Selling price must be a positive number'),
    handleValidation,
  ],
  update: [
    param('id').isInt().withMessage('Valid product ID is required'),
    body('sku').optional().trim().notEmpty().withMessage('SKU cannot be empty'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('costPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Cost price must be a positive number'),
    body('sellingPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Selling price must be a positive number'),
    handleValidation,
  ],
};

/**
 * Inventory validation rules
 */
const inventoryValidation = {
  update: [
    param('productId').isInt().withMessage('Valid product ID is required'),
    body('quantity')
      .isInt({ min: 0 })
      .withMessage('Quantity must be a non-negative integer'),
    body('location').optional().trim(),
    body('minStockLevel')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Min stock level must be a non-negative integer'),
    handleValidation,
  ],
  adjust: [
    body('productId').isInt().withMessage('Valid product ID is required'),
    body('quantity').isInt().withMessage('Quantity must be an integer'),
    body('type')
      .isIn(Object.values(ADJUSTMENT_TYPE))
      .withMessage('Invalid adjustment type'),
    body('reason').optional().trim(),
    handleValidation,
  ],
};

/**
 * Sales validation rules
 */
const salesValidation = {
  create: [
    body('customerId').isInt().withMessage('Valid customer ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.productId').isInt().withMessage('Valid product ID is required'),
    body('items.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    body('items.*.unitPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Unit price must be a positive number'),
    body('tax').optional().isFloat({ min: 0 }).withMessage('Tax must be a positive number'),
    body('notes').optional().trim(),
    handleValidation,
  ],
  updateStatus: [
    param('id').isInt().withMessage('Valid sale ID is required'),
    body('status')
      .isIn(Object.values(ORDER_STATUS))
      .withMessage('Invalid status'),
    handleValidation,
  ],
};

/**
 * Purchase validation rules
 */
const purchaseValidation = {
  create: [
    body('supplierId').isInt().withMessage('Valid supplier ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.productId').isInt().withMessage('Valid product ID is required'),
    body('items.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    body('items.*.unitPrice')
      .isFloat({ min: 0 })
      .withMessage('Unit price must be a positive number'),
    body('tax').optional().isFloat({ min: 0 }).withMessage('Tax must be a positive number'),
    body('expectedDelivery').optional().isDate().withMessage('Invalid date format'),
    body('notes').optional().trim(),
    handleValidation,
  ],
  updateStatus: [
    param('id').isInt().withMessage('Valid purchase ID is required'),
    body('status')
      .isIn(Object.values(PURCHASE_STATUS))
      .withMessage('Invalid status'),
    handleValidation,
  ],
  receive: [
    param('id').isInt().withMessage('Valid purchase ID is required'),
    body('items').optional().isArray().withMessage('Items must be an array'),
    body('items.*.productId').optional().isInt().withMessage('Valid product ID is required'),
    body('items.*.quantity')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    handleValidation,
  ],
};

/**
 * Pagination validation
 */
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  handleValidation,
];

module.exports = {
  handleValidation,
  authValidation,
  userValidation,
  customerValidation,
  productValidation,
  inventoryValidation,
  salesValidation,
  purchaseValidation,
  paginationValidation,
};
