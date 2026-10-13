const express = require('express');
const ExpensesController = require('../controllers/expenses.controller');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { companyScope, requireExpenseTrackerAccess } = require('../middleware/companyScope');
const { paginationValidation, sortValidation, expenseValidation } = require('../middleware/validate');

const EXPENSE_SORT_FIELDS = ['expenseNumber', 'expenseDate', 'category', 'paidTo', 'paymentMethod', 'amount', 'user'];

const router = express.Router();

// All routes require authentication and company scope. Expense Tracker
// access (company toggle + per-user flag/admin role - see
// requireExpenseTrackerAccess) gates viewing/creating/editing expenses, but
// deliberately not DELETE below - that's superadmin-only and looks an
// expense up by id regardless of any company's feature flag, so tying it to
// the flag would block a superadmin from deleting an expense via a company
// that currently has the feature off (or none selected at all).
router.use(authenticate);
router.use(companyScope);

// GET /api/expenses - List expenses (date range and category filters)
router.get('/', requireExpenseTrackerAccess, paginationValidation, sortValidation(EXPENSE_SORT_FIELDS), ExpensesController.getAll);

// POST /api/expenses - Record an expense
router.post('/', requireExpenseTrackerAccess, expenseValidation.create, ExpensesController.create);

// PUT /api/expenses/:id - Edit an expense
router.put('/:id', requireExpenseTrackerAccess, expenseValidation.update, ExpensesController.update);

// DELETE /api/expenses/:id - Delete an expense (superadmin only)
router.delete('/:id', requireSuperAdmin, ExpensesController.delete);

module.exports = router;
