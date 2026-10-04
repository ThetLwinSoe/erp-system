const { Payment, Customer, User, Company, Sale, Purchase, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

class PaymentsController {
  /**
   * Get all payments
   * GET /api/payments
   * Query params: customerId, direction, saleId, purchaseId, startDate, endDate
   */
  static async getAll(req, res, next) {
    try {
      const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
      const limit = Math.min(
        parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT,
        PAGINATION.MAX_LIMIT
      );
      const offset = (page - 1) * limit;
      const { customerId, direction, saleId, purchaseId, startDate, endDate } = req.query;

      const whereClause = { ...req.companyFilter };

      if (customerId) {
        whereClause.customerId = parseInt(customerId);
      }

      if (direction === 'received' || direction === 'paid') {
        whereClause.direction = direction;
      }

      // Scopes the list to payments recorded against one specific order -
      // this is how SaleDetails.jsx/PurchaseDetails.jsx fetch just their own
      // order's payments for the Paid/Balance Due display.
      if (saleId) {
        whereClause.saleId = parseInt(saleId);
      }

      if (purchaseId) {
        whereClause.purchaseId = parseInt(purchaseId);
      }

      if (startDate || endDate) {
        whereClause.paymentDate = {};
        if (startDate) whereClause.paymentDate[Op.gte] = startDate;
        if (endDate) whereClause.paymentDate[Op.lte] = endDate;
      }

      const sortBy = req.query.sortBy || 'paymentDate';
      const sortOrder = req.query.sortOrder || 'DESC';
      const JOIN_SORT_MAP = {
        customer: [{ model: Customer, as: 'customer' }, 'name'],
        user: [{ model: User, as: 'user' }, 'name'],
        company: [{ model: Company, as: 'company' }, 'name'],
      };
      const order = JOIN_SORT_MAP[sortBy]
        ? [[...JOIN_SORT_MAP[sortBy], sortOrder]]
        : [[sortBy, sortOrder]];

      const { count, rows } = await Payment.findAndCountAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'customer' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          { model: Company, as: 'company' },
          { model: Sale, as: 'sale', attributes: ['id', 'orderNumber'] },
          { model: Purchase, as: 'purchase', attributes: ['id', 'orderNumber'] },
        ],
        order,
        limit,
        offset,
      });

      const pagination = {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      };

      return ApiResponse.paginated(res, rows, pagination, 'Payments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Record a payment against a specific Sale or Purchase order - the only
   * way to create a payment (no more standalone customer/direction picker).
   * `customerId`/`direction` are derived from the referenced order, not
   * accepted from the client, so a payment can never be mismatched from the
   * order it's meant to settle.
   *
   * Status eligibility and the amount-vs-remaining-balance cap mirror
   * settleBulk's checks (same ineligible-status rule, same
   * balance-due-plus-epsilon comparison) - the client-side "Record Payment"
   * button is already disabled for a pending/cancelled order or once an
   * order is fully paid, but that's a UI-only guard; this is the
   * server-side backstop a direct/replayed request would otherwise skip.
   * POST /api/payments
   * Body: { saleId | purchaseId, amount, paymentDate?, method?, reference?, notes? }
   */
  static async create(req, res, next) {
    try {
      const companyId = getCompanyIdForCreate(req);

      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const { saleId, purchaseId, amount, paymentDate, method, reference, notes } = req.body;

      if (!saleId && !purchaseId) {
        return ApiResponse.badRequest(res, 'Either saleId or purchaseId is required');
      }
      if (saleId && purchaseId) {
        return ApiResponse.badRequest(res, 'A payment can only be linked to one order');
      }

      const isSale = Boolean(saleId);
      const OrderModel = isSale ? Sale : Purchase;
      const orderId = isSale ? saleId : purchaseId;
      const orderIdField = isSale ? 'saleId' : 'purchaseId';
      const customerField = isSale ? 'customerId' : 'supplierId';
      const direction = isSale ? 'received' : 'paid';
      const amountNum = parseFloat(amount);

      // Same order-row lock as settleBulk (see there): the order stays locked
      // until this payment commits, so a concurrent payment on it waits and
      // then sees this one when it checks the balance.
      const outcome = await sequelize.transaction(async (transaction) => {
        const order = await OrderModel.findOne({
          where: { id: orderId, companyId },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!order) {
          return { error: { status: 404, message: isSale ? 'Sale order not found' : 'Purchase order not found' } };
        }

        if (order.status === 'pending' || order.status === 'cancelled') {
          return { error: { status: 400, message: `Order ${order.orderNumber} is not eligible for payment (must be confirmed/approved and not cancelled)` } };
        }

        const existingPaid = (await Payment.sum('amount', { where: { [orderIdField]: order.id }, transaction })) || 0;
        const balanceDue = parseFloat(order.total) - existingPaid;

        if (amountNum > balanceDue + 0.005) {
          return { error: { status: 400, message: `Amount exceeds the order's remaining balance of ${balanceDue.toFixed(2)}` } };
        }

        const payment = await Payment.create({
          customerId: order[customerField],
          direction,
          amount: amountNum,
          paymentDate: paymentDate || new Date(),
          method: method || null,
          reference: reference || null,
          notes: notes || null,
          userId: req.user.id,
          companyId,
          saleId: isSale ? order.id : null,
          purchaseId: isSale ? null : order.id,
        }, { transaction });
        return { payment };
      });

      if (outcome.error) {
        const { status, message } = outcome.error;
        return status === 404 ? ApiResponse.notFound(res, message) : ApiResponse.badRequest(res, message);
      }
      const { payment } = outcome;

      const created = await Payment.findByPk(payment.id, {
        include: [
          { model: Customer, as: 'customer' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          { model: Sale, as: 'sale', attributes: ['id', 'orderNumber'] },
          { model: Purchase, as: 'purchase', attributes: ['id', 'orderNumber'] },
        ],
      });

      return ApiResponse.created(res, created, 'Payment recorded successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Settle several Sale or Purchase orders belonging to the same
   * customer/supplier with a single amount, in one action. Keeps the
   * existing one-payment-per-order model intact (so Paid/Balance Due, the
   * Payments ledger's Order # column, and the Sales/Purchases listing's
   * payment-status badge all keep working unchanged) - a Payment row is
   * still created per order, just several at once in one transaction.
   * Allocation is oldest-order-first (FIFO), same reasoning as the overdue
   * calculation elsewhere in Credit Control: the amount fills each selected
   * order's remaining balance in date order before moving to the next.
   * POST /api/payments/settle
   * Body: { saleIds[] | purchaseIds[], amount, paymentDate?, method?, reference?, notes? }
   */
  static async settleBulk(req, res, next) {
    try {
      const companyId = getCompanyIdForCreate(req);

      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const { saleIds, purchaseIds, amount, paymentDate, method, reference, notes } = req.body;
      const isSales = Array.isArray(saleIds) && saleIds.length > 0;
      const OrderModel = isSales ? Sale : Purchase;
      const orderIdField = isSales ? 'saleId' : 'purchaseId';
      const customerField = isSales ? 'customerId' : 'supplierId';
      const ids = (isSales ? saleIds : purchaseIds).map((id) => parseInt(id));
      const direction = isSales ? 'received' : 'paid';

      const amountNum = parseFloat(amount);

      // Everything from here to the commit runs in one transaction, with the
      // order rows locked (SELECT ... FOR UPDATE). A concurrent settlement or
      // single payment on the same order waits at the lock, then reads the
      // payments committed before it - so two requests can't both read
      // "nothing paid yet" and both succeed. Rows are locked in ascending id
      // order, so overlapping requests queue in the same sequence (no deadlock).
      const outcome = await sequelize.transaction(async (transaction) => {
        const orders = await OrderModel.findAll({
          where: { id: { [Op.in]: ids }, companyId },
          order: [['id', 'ASC']],
          lock: transaction.LOCK.UPDATE,
          transaction,
        });

        if (orders.length !== ids.length) {
          return { error: { status: 404, message: `One or more ${isSales ? 'sale' : 'purchase'} orders were not found` } };
        }

        const ineligible = orders.find((o) => o.status === 'pending' || o.status === 'cancelled');
        if (ineligible) {
          return { error: { status: 400, message: `Order ${ineligible.orderNumber} is not eligible for payment (must be confirmed/approved and not cancelled)` } };
        }

        const uniqueCustomerIds = [...new Set(orders.map((o) => o[customerField]))];
        if (uniqueCustomerIds.length > 1) {
          return { error: { status: 400, message: 'All selected orders must belong to the same customer/supplier' } };
        }
        const customerId = uniqueCustomerIds[0];

        if (!amountNum || amountNum <= 0) {
          return { error: { status: 400, message: 'Amount must be greater than 0' } };
        }

        // Existing payments already linked to these orders, so each order's
        // real remaining balance is known before allocating the new amount.
        const existingPayments = await Payment.findAll({
          attributes: [orderIdField, [sequelize.fn('SUM', sequelize.col('amount')), 'paid']],
          where: { [orderIdField]: { [Op.in]: ids } },
          group: [orderIdField],
          raw: true,
          transaction,
        });
        const paidByOrderId = new Map(existingPayments.map((r) => [r[orderIdField], parseFloat(r.paid) || 0]));

        const balanceDue = (order) => Math.max(0, parseFloat(order.total) - (paidByOrderId.get(order.id) || 0));
        const totalBalance = orders.reduce((sum, o) => sum + balanceDue(o), 0);

        if (amountNum > totalBalance + 0.005) {
          return { error: { status: 400, message: `Amount exceeds the selected orders' combined balance of ${totalBalance.toFixed(2)}` } };
        }

        const sortedOrders = [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id);

        const allocations = [];
        let remaining = amountNum;
        for (const order of sortedOrders) {
          if (remaining <= 0) break;
          const due = balanceDue(order);
          if (due <= 0) continue;
          const applied = Math.min(due, remaining);
          allocations.push({ order, applied });
          remaining -= applied;
        }

        if (allocations.length === 0) {
          return { error: { status: 400, message: 'Selected orders have no outstanding balance' } };
        }

        const createdIds = [];
        for (const { order, applied } of allocations) {
          const payment = await Payment.create({
            customerId,
            direction,
            amount: applied,
            paymentDate: paymentDate || new Date(),
            method: method || null,
            reference: reference || null,
            notes: notes || null,
            userId: req.user.id,
            companyId,
            [orderIdField]: order.id,
          }, { transaction });
          createdIds.push(payment.id);
        }
        return { createdIds };
      });

      if (outcome.error) {
        const { status, message } = outcome.error;
        return status === 404 ? ApiResponse.notFound(res, message) : ApiResponse.badRequest(res, message);
      }
      const { createdIds } = outcome;

      const created = await Payment.findAll({
        where: { id: { [Op.in]: createdIds } },
        include: [
          { model: Customer, as: 'customer' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          { model: Sale, as: 'sale', attributes: ['id', 'orderNumber'] },
          { model: Purchase, as: 'purchase', attributes: ['id', 'orderNumber'] },
        ],
      });

      return ApiResponse.created(res, created, `Payment applied to ${created.length} order(s)`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a payment (superadmin only, enforced at the route level - this is
   * a correction path for mistakes, not a revision history)
   * DELETE /api/payments/:id
   */
  static async delete(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const payment = await Payment.findOne({ where: whereClause });

      if (!payment) {
        return ApiResponse.notFound(res, 'Payment not found');
      }

      await payment.destroy();

      return ApiResponse.success(res, null, 'Payment deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PaymentsController;
