const express = require('express');
const UsersController = require('../controllers/users.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { companyScope } = require('../middleware/companyScope');
const { userValidation, paginationValidation, sortValidation } = require('../middleware/validate');
const { ROLES } = require('../utils/constants');

const USER_SORT_FIELDS = ['name', 'email', 'role', 'createdAt', 'company'];

const router = express.Router();

// All routes require authentication, admin role, and company scope
router.use(authenticate);
router.use(authorize(ROLES.ADMIN));
router.use(companyScope);

/**
 * @route GET /api/users
 * @desc Get all users
 * @access Private (Admin only)
 */
router.get('/', paginationValidation, sortValidation(USER_SORT_FIELDS), UsersController.getAll);

/**
 * @route POST /api/users
 * @desc Create user
 * @access Private (Admin only)
 */
router.post('/', userValidation.create, UsersController.create);

/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 * @access Private (Admin only)
 */
router.get('/:id', userValidation.getById, UsersController.getById);

/**
 * @route PUT /api/users/:id
 * @desc Update user
 * @access Private (Admin only)
 */
router.put('/:id', userValidation.update, UsersController.update);

/**
 * @route DELETE /api/users/:id
 * @desc Delete user
 * @access Private (Admin only)
 */
router.delete('/:id', userValidation.getById, UsersController.delete);

module.exports = router;
