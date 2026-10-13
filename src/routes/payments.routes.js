const express = require('express');
const PaymentsController = require('../controllers/payments.controller');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { companyScope, requireCreditControlAccess } = require('../middleware/companyScope');
const { paginationValidation, sortValidation, paymentValidation } = require('../middleware/validate');

const PAYMENT_SORT_FIELDS = ['paymentNumber', 'paymentDate', 'amount', 'direction', 'createdAt', 'customer', 'user', 'company'];

const router = express.Router();

// All routes require authentication and company scope. Credit Control
// access (company toggle + per-user flag/admin role - see
// requireCreditControlAccess) gates viewing/creating payments, but
// deliberately not DELETE below - that's superadmin-only and looks a
// payment up by id regardless of any company's feature flag, so tying it to
// the flag would block a superadmin from deleting a payment via a company
// that currently has the feature off (or none selected at all).
router.use(authenticate);
router.use(companyScope);

// GET /api/payments - Get all payments
router.get('/', requireCreditControlAccess, paginationValidation, sortValidation(PAYMENT_SORT_FIELDS), PaymentsController.getAll);

// POST /api/payments - Record a payment
router.post('/', requireCreditControlAccess, paymentValidation.create, PaymentsController.create);

// POST /api/payments/settle - Settle multiple orders (same customer/supplier) with one amount
router.post('/settle', requireCreditControlAccess, paymentValidation.settle, PaymentsController.settleBulk);

// DELETE /api/payments/:id - Delete a payment (superadmin only)
router.delete('/:id', requireSuperAdmin, PaymentsController.delete);

module.exports = router;
