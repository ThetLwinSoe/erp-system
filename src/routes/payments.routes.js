const express = require('express');
const PaymentsController = require('../controllers/payments.controller');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { companyScope, requireCreditControlAccess } = require('../middleware/companyScope');
const { paginationValidation, sortValidation, paymentValidation } = require('../middleware/validate');

const PAYMENT_SORT_FIELDS = ['paymentNumber', 'paymentDate', 'amount', 'direction', 'createdAt', 'customer', 'user', 'company'];

const router = express.Router();

// All routes require authentication, company scope, and Credit Control access
// (company toggle + per-user flag/admin role - see requireCreditControlAccess)
router.use(authenticate);
router.use(companyScope);
router.use(requireCreditControlAccess);

// GET /api/payments - Get all payments
router.get('/', paginationValidation, sortValidation(PAYMENT_SORT_FIELDS), PaymentsController.getAll);

// POST /api/payments - Record a payment
router.post('/', paymentValidation.create, PaymentsController.create);

// POST /api/payments/settle - Settle multiple orders (same customer/supplier) with one amount
router.post('/settle', paymentValidation.settle, PaymentsController.settleBulk);

// DELETE /api/payments/:id - Delete a payment (superadmin only)
router.delete('/:id', requireSuperAdmin, PaymentsController.delete);

module.exports = router;
