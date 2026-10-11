const express = require('express');
const ExpensesController = require('../controllers/expenses.controller');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { companyScope, requireExpenseTrackerAccess } = require('../middleware/companyScope');
const { paginationValidation, sortValidation, expenseValidation } = require('../middleware/validate');

const EXPENSE_SORT_FIELDS = ['expenseNumber', 'expenseDate', 'category', 'paidTo', 'paymentMethod', 'amount', 'user'];

const router = express.Router();

// All routes require authentication, company scope, and Expense Tracker access
// (company toggle + per-user flag/admin role - see requireExpenseTrackerAccess)
router.use(authenticate);
router.use(companyScope);
router.use(requireExpenseTrackerAccess);

// GET /api/expenses - List expenses (date range and category filters)
router.get('/', paginationValidation, sortValidation(EXPENSE_SORT_FIELDS), ExpensesController.getAll);

// POST /api/expenses - Record an expense
router.post('/', expenseValidation.create, ExpensesController.create);

// PUT /api/expenses/:id - Edit an expense
router.put('/:id', expenseValidation.update, ExpensesController.update);

// DELETE /api/expenses/:id - Delete an expense (superadmin only)
router.delete('/:id', requireSuperAdmin, ExpensesController.delete);

module.exports = router;
