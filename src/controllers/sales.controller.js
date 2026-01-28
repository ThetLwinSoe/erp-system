const { Sale, SaleItem, Customer, User, Product } = require('../models');
const SalesService = require('../services/sales.service');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, ORDER_STATUS } = require('../utils/constants');
const { Op } = require('sequelize');

class SalesController {
  /**
   * Get all sales
   * GET /api/sales
   */
  static async getAll(req, res, next) {
    try {
      const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
      const limit = Math.min(
        parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT,
        PAGINATION.MAX_LIMIT
      );
      const offset = (page - 1) * limit;
      const status = req.query.status || '';
      const search = req.query.search || '';

      const whereClause = {};

      if (status && Object.values(ORDER_STATUS).includes(status)) {
        whereClause.status = status;
      }

      if (search) {
        whereClause.orderNumber = { [Op.iLike]: `%${search}%` };
      }

      const { count, rows } = await Sale.findAndCountAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'customer' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      const pagination = {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      };

      return ApiResponse.paginated(res, rows, pagination, 'Sales retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create sale
   * POST /api/sales
   */
  static async create(req, res, next) {
    try {
      const sale = await SalesService.createSale(req.user.id, req.body);
      return ApiResponse.created(res, sale, 'Sale created successfully');
    } catch (error) {
      if (error.details) {
        return ApiResponse.badRequest(res, error.message, error.details);
      }
      next(error);
    }
  }

  /**
   * Get sale by ID
   * GET /api/sales/:id
   */
  static async getById(req, res, next) {
    try {
      const sale = await SalesService.getSaleById(req.params.id);
      return ApiResponse.success(res, sale, 'Sale retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update sale
   * PUT /api/sales/:id
   */
  static async update(req, res, next) {
    try {
      const sale = await SalesService.updateSale(req.params.id, req.body);
      return ApiResponse.success(res, sale, 'Sale updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update sale status
   * PATCH /api/sales/:id/status
   */
  static async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const sale = await SalesService.updateSaleStatus(req.params.id, status);
      return ApiResponse.success(res, sale, 'Sale status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete sale
   * DELETE /api/sales/:id
   */
  static async delete(req, res, next) {
    try {
      await SalesService.deleteSale(req.params.id);
      return ApiResponse.success(res, null, 'Sale deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SalesController;
