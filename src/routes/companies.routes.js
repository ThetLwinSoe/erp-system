const express = require('express');
const router = express.Router();
const CompaniesController = require('../controllers/companies.controller');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { companyValidation, paginationValidation, sortValidation } = require('../middleware/validate');
const { uploadLogo } = require('../middleware/upload');

const COMPANY_SORT_FIELDS = ['name', 'email', 'phone', 'currency', 'status', 'subscriptionEndDate', 'createdAt'];

// All routes require authentication and superadmin role
router.use(authenticate);
router.use(requireSuperAdmin);

// GET /api/companies - List all companies (with pagination)
router.get('/', paginationValidation, sortValidation(COMPANY_SORT_FIELDS), CompaniesController.getAll);

// GET /api/companies/subscription-alerts - Companies nearing/past subscription end (must come before /:id)
router.get('/subscription-alerts', CompaniesController.getSubscriptionAlerts);

// POST /api/companies - Create a new company
router.post('/', companyValidation.create, CompaniesController.create);

// GET /api/companies/:id - Get a specific company
router.get('/:id', CompaniesController.getById);

// PUT /api/companies/:id - Update a company
router.put('/:id', companyValidation.update, CompaniesController.update);

// DELETE /api/companies/:id - Delete a company
router.delete('/:id', CompaniesController.delete);

// GET /api/companies/:id/users - Get users for a specific company
router.get('/:id/users', CompaniesController.getUsers);

// GET /api/companies/:id/stats - Get statistics for a specific company
router.get('/:id/stats', CompaniesController.getStats);

// POST /api/companies/:id/logo - Upload company logo
router.post('/:id/logo', uploadLogo, CompaniesController.uploadLogo);

// DELETE /api/companies/:id/logo - Delete company logo
router.delete('/:id/logo', CompaniesController.deleteLogo);

module.exports = router;
