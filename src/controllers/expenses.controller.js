const { Expense, User } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

const EDITABLE_FIELDS = ['expenseDate', 'category', 'amount', 'paidTo', 'paymentMethod', 'reference', 'notes'];
const OPTIONAL_TEXT_FIELDS = ['paidTo', 'paymentMethod', 'reference', 'notes'];

// Picks the editable fields that were sent. Optional text fields are stored as null
// when blank, on create and on update alike, so an empty string never reaches the database.
const pickEditable = (body) => {
  const data = {};
  EDITABLE_FIELDS.forEach((field) => {
    if (body[field] === undefined) return;
    data[field] = OPTIONAL_TEXT_FIELDS.includes(field) ? body[field] || null : body[field];
  });
  if (data.amount !== undefined) data.amount = parseFloat(data.amount);
  return data;
};

const withRecorder = {
  include: [{ model: User, as: 'user', attributes: { exclude: ['password'] } }],
};

class ExpensesController {
  /**
   * List expenses for the company.
   * GET /api/expenses
   * Query params: startDate, endDate (on expenseDate), category, page, limit
   */
  static async getAll(req, res, next) {
    try {
      const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
      const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
      const offset = (page - 1) * limit;
      const { startDate, endDate, category } = req.query;

      const whereClause = { ...req.companyFilter };

      if (startDate || endDate) {
        whereClause.expenseDate = {};
        if (startDate) whereClause.expenseDate[Op.gte] = startDate;
        if (endDate) whereClause.expenseDate[Op.lte] = endDate;
      }

      if (category) {
        whereClause.category = category;
      }

      const { count, rows } = await Expense.findAndCountAll({
        where: whereClause,
        ...withRecorder,
        order: [['expenseDate', 'DESC'], ['id', 'DESC']],
        limit,
        offset,
      });

      const pagination = {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      };

      return ApiResponse.paginated(res, rows, pagination, 'Expenses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Record an expense for the company.
   * POST /api/expenses
   * Body: { expenseDate, category, amount, paidTo?, paymentMethod?, reference?, notes? }
   */
  static async create(req, res, next) {
    try {
      const companyId = getCompanyIdForCreate(req);

      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const expense = await Expense.create({
        ...pickEditable(req.body),
        companyId,
        userId: req.user.id,
      });

      const created = await Expense.findByPk(expense.id, withRecorder);

      return ApiResponse.created(res, created, 'Expense recorded successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Edit an expense. Anyone who passes the Expense Tracker access check can edit
   * (admins, and users granted access). Deleting is superadmin-only.
   * PUT /api/expenses/:id
   */
  static async update(req, res, next) {
    try {
      const expense = await Expense.findOne({ where: { id: req.params.id, ...req.companyFilter } });

      if (!expense) {
        return ApiResponse.notFound(res, 'Expense not found');
      }

      await expense.update(pickEditable(req.body));

      const updated = await Expense.findByPk(expense.id, withRecorder);

      return ApiResponse.success(res, updated, 'Expense updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete an expense (superadmin only, enforced at the route level).
   * DELETE /api/expenses/:id
   */
  static async delete(req, res, next) {
    try {
      const expense = await Expense.findOne({ where: { id: req.params.id, ...req.companyFilter } });

      if (!expense) {
        return ApiResponse.notFound(res, 'Expense not found');
      }

      await expense.destroy();

      return ApiResponse.success(res, null, 'Expense deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ExpensesController;
