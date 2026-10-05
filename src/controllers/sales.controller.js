const { Sale, SaleItem, Customer, User, Product, Company, Payment, sequelize } = require('../models');
const SalesService = require('../services/sales.service');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, ORDER_STATUS } = require('../utils/constants');
const { getCompanyIdForCreate, evaluateCreditControlAccess } = require('../middleware/companyScope');
const { Op } = require('sequelize');

/**
 * unpaid/partial/paid, derived from paidAmount vs order total - not
 * meaningful for a cancelled order, so callers skip it there.
 */
const paymentStatusFor = (paidAmount, total) => {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount >= parseFloat(total)) return 'paid';
  return 'partial';
};

// Used only for `ORDER BY` when sorting by the computed Payment column - a
// 3-bucket rank (0=unpaid, 1=partial, 2=paid), not the raw paid amount, so a
// small partial payment doesn't outrank a fully-paid smaller order. Needed
// because sorting by a computed value means ranking the whole matching set,
// not just the current page.
const PAYMENT_STATUS_SORT_SQL = `(
  CASE
    WHEN COALESCE((SELECT SUM(amount) FROM payments WHERE payments."saleId" = "Sale"."id"), 0) <= 0 THEN 0
    WHEN COALESCE((SELECT SUM(amount) FROM payments WHERE payments."saleId" = "Sale"."id"), 0) >= "Sale"."total" THEN 2
    ELSE 1
  END
)`;

// Used for the `paymentStatus` query filter - same three buckets as
// paymentStatusFor, expressed as a WHERE condition against the whole
// matching set rather than just the current page's rows. Excludes
// cancelled orders from every bucket, matching the listing, which shows
// "-" for a cancelled order's payment status rather than a real value.
const PAYMENT_STATUS_WHERE_SQL = {
  unpaid: `"Sale"."status" != 'cancelled' AND COALESCE((SELECT SUM(amount) FROM payments WHERE payments."saleId" = "Sale"."id"), 0) <= 0`,
  partial: `"Sale"."status" != 'cancelled' AND COALESCE((SELECT SUM(amount) FROM payments WHERE payments."saleId" = "Sale"."id"), 0) > 0 AND COALESCE((SELECT SUM(amount) FROM payments WHERE payments."saleId" = "Sale"."id"), 0) < "Sale"."total"`,
  paid: `"Sale"."status" != 'cancelled' AND COALESCE((SELECT SUM(amount) FROM payments WHERE payments."saleId" = "Sale"."id"), 0) >= "Sale"."total"`,
};

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

      // Add company filter
      const whereClause = { ...req.companyFilter };

      // Sale Rep can only see their own sales
      if (req.isSaleRep) {
        whereClause.userId = req.user.id;
      }

      if (status && Object.values(ORDER_STATUS).includes(status)) {
        whereClause.status = status;
      }

      if (req.query.customerId) {
        whereClause.customerId = parseInt(req.query.customerId);
      }

      if (search) {
        whereClause.orderNumber = { [Op.iLike]: `%${search}%` };
      }

      // Payment status is computed, not a real column - filtering/sorting by
      // it is only honored with Credit Control access (the column isn't
      // shown otherwise); an unrecognized or inaccessible value is ignored
      // rather than erroring.
      const { allowed } = await evaluateCreditControlAccess(req);
      if (allowed && PAYMENT_STATUS_WHERE_SQL[req.query.paymentStatus]) {
        whereClause[Op.and] = [
          ...(whereClause[Op.and] || []),
          sequelize.literal(PAYMENT_STATUS_WHERE_SQL[req.query.paymentStatus]),
        ];
      }

      // Date range filtering
      const { startDate, endDate } = req.query;
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          whereClause.createdAt[Op.lte] = end;
        }
      }

      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder || 'DESC';
      const JOIN_SORT_MAP = {
        customer: [{ model: Customer, as: 'customer' }, 'name'],
        user: [{ model: User, as: 'user' }, 'name'],
        company: [{ model: Company, as: 'company' }, 'name'],
      };

      let order;
      if (sortBy === 'paymentStatus' && allowed) {
        order = [[sequelize.literal(PAYMENT_STATUS_SORT_SQL), sortOrder]];
      } else if (JOIN_SORT_MAP[sortBy]) {
        order = [[...JOIN_SORT_MAP[sortBy], sortOrder]];
      } else if (sortBy === 'paymentStatus') {
        order = [['createdAt', 'DESC']];
      } else {
        order = [[sortBy, sortOrder]];
      }

      const { count, rows } = await Sale.findAndCountAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'customer' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          { model: Company, as: 'company' },
        ],
        order,
        limit,
        offset,
      });

      // Attach each row's payment status (unpaid/partial/paid), in one
      // batched query for the whole page - not per row - and only when the
      // caller has Credit Control access, so this costs nothing otherwise.
      let responseRows = rows;
      if (allowed && rows.length > 0) {
        const paidRows = await Payment.findAll({
          attributes: ['saleId', [sequelize.fn('SUM', sequelize.col('amount')), 'paidAmount']],
          where: { saleId: { [Op.in]: rows.map((r) => r.id) } },
          group: ['saleId'],
          raw: true,
        });
        const paidBySaleId = new Map(paidRows.map((r) => [r.saleId, parseFloat(r.paidAmount) || 0]));
        responseRows = rows.map((r) => {
          const paidAmount = paidBySaleId.get(r.id) || 0;
          return {
            ...r.toJSON(),
            paidAmount,
            paymentStatus: r.status === 'cancelled' ? null : paymentStatusFor(paidAmount, r.total),
          };
        });
      }

      const pagination = {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      };

      return ApiResponse.paginated(res, responseRows, pagination, 'Sales retrieved successfully');
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
      const companyId = getCompanyIdForCreate(req);

      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const sale = await SalesService.createSale(req.user.id, req.body, companyId);
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
      // Sale Rep can only view their own sales
      const filter = { ...req.companyFilter };
      if (req.isSaleRep) {
        filter.userId = req.user.id;
      }
      const sale = await SalesService.getSaleById(req.params.id, filter);
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
      // Sale Rep can only update their own sales
      const filter = { ...req.companyFilter };
      if (req.isSaleRep) {
        filter.userId = req.user.id;
      }
      const sale = await SalesService.updateSale(req.params.id, req.body, filter);
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
      // Sale Rep can only update status of their own sales
      const filter = { ...req.companyFilter };
      if (req.isSaleRep) {
        filter.userId = req.user.id;
      }
      const { status } = req.body;
      const sale = await SalesService.updateSaleStatus(req.params.id, status, filter);
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
      // Sale Rep can only delete their own sales
      const filter = { ...req.companyFilter };
      if (req.isSaleRep) {
        filter.userId = req.user.id;
      }
      await SalesService.deleteSale(req.params.id, filter);
      return ApiResponse.success(res, null, 'Sale deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SalesController;
