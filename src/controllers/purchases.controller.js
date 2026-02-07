const { Purchase, PurchaseItem, Customer, User, Product, sequelize } = require('../models');
const InventoryService = require('../services/inventory.service');
const PurchasesService = require('../services/purchases.service');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, PURCHASE_STATUS, CUSTOMER_TYPE } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

class PurchasesController {
  /**
   * Get all purchases
   * GET /api/purchases
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

      if (status && Object.values(PURCHASE_STATUS).includes(status)) {
        whereClause.status = status;
      }

      if (search) {
        whereClause.orderNumber = { [Op.iLike]: `%${search}%` };
      }

      const { count, rows } = await Purchase.findAndCountAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'supplier' },
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

      return ApiResponse.paginated(res, rows, pagination, 'Purchases retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create purchase
   * POST /api/purchases
   */
  static async create(req, res, next) {
    try {
      // Get company ID for the new purchase
      const companyId = getCompanyIdForCreate(req);
      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const purchase = await PurchasesService.createPurchase(req.user.id, req.body, companyId);

      return ApiResponse.created(res, purchase, 'Purchase created successfully');
    } catch (error) {
      if (error.statusCode) {
        if (error.statusCode === 404) {
          return ApiResponse.notFound(res, error.message);
        } else if (error.statusCode === 400) {
          return ApiResponse.badRequest(res, error.message, error.details);
        }
      }
      next(error);
    }
  }

  /**
   * Get purchase by ID
   * GET /api/purchases/:id
   */
  static async getById(req, res, next) {
    try {
      const purchase = await Purchase.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [
          { model: Customer, as: 'supplier' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: PurchaseItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      if (!purchase) {
        return ApiResponse.notFound(res, 'Purchase not found');
      }

      return ApiResponse.success(res, purchase, 'Purchase retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update purchase
   * PUT /api/purchases/:id
   */
  static async update(req, res, next) {
    try {
      const updatedPurchase = await PurchasesService.updatePurchase(req.params.id, req.body, req.companyFilter);

      return ApiResponse.success(res, updatedPurchase, 'Purchase updated successfully');
    } catch (error) {
      if (error.statusCode) {
        if (error.statusCode === 404) {
          return ApiResponse.notFound(res, error.message);
        } else if (error.statusCode === 400) {
          return ApiResponse.badRequest(res, error.message);
        }
      }
      next(error);
    }
  }

  /**
   * Update purchase status
   * PATCH /api/purchases/:id/status
   */
  static async updateStatus(req, res, next) {
    try {
      const purchase = await Purchase.findOne({
        where: { id: req.params.id, ...req.companyFilter },
      });

      if (!purchase) {
        return ApiResponse.notFound(res, 'Purchase not found');
      }

      const { status } = req.body;

      // Validate status transition
      const validTransitions = {
        [PURCHASE_STATUS.PENDING]: [PURCHASE_STATUS.APPROVED, PURCHASE_STATUS.CANCELLED],
        [PURCHASE_STATUS.APPROVED]: [PURCHASE_STATUS.ORDERED, PURCHASE_STATUS.CANCELLED],
        [PURCHASE_STATUS.ORDERED]: [PURCHASE_STATUS.PARTIAL, PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.CANCELLED],
        [PURCHASE_STATUS.PARTIAL]: [PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.CANCELLED],
        [PURCHASE_STATUS.RECEIVED]: [],
        [PURCHASE_STATUS.CANCELLED]: [],
      };

      if (!validTransitions[purchase.status].includes(status)) {
        return ApiResponse.badRequest(res, `Cannot transition from ${purchase.status} to ${status}`);
      }

      await purchase.update({ status });

      const updatedPurchase = await Purchase.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [
          { model: Customer, as: 'supplier' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: PurchaseItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.success(res, updatedPurchase, 'Purchase status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Receive goods from purchase
   * PATCH /api/purchases/:id/receive
   */
  static async receive(req, res, next) {
    try {
      const purchase = await Purchase.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [{ model: PurchaseItem, as: 'items' }],
      });

      if (!purchase) {
        return ApiResponse.notFound(res, 'Purchase not found');
      }

      if (![PURCHASE_STATUS.ORDERED, PURCHASE_STATUS.PARTIAL].includes(purchase.status)) {
        return ApiResponse.badRequest(res, 'Purchase must be in ordered or partial status to receive goods');
      }

      const { items: receivedItems } = req.body;

      await sequelize.transaction(async (transaction) => {
        let allReceived = true;
        const inventoryUpdates = [];

        for (const item of purchase.items) {
          let quantityToReceive = item.quantity - item.receivedQuantity;

          // If specific items are provided, use those quantities
          if (receivedItems && receivedItems.length > 0) {
            const receivedItem = receivedItems.find((ri) => ri.productId === item.productId);
            if (receivedItem) {
              quantityToReceive = Math.min(receivedItem.quantity, item.quantity - item.receivedQuantity);
            } else {
              quantityToReceive = 0;
            }
          }

          if (quantityToReceive > 0) {
            const newReceivedQuantity = item.receivedQuantity + quantityToReceive;
            await item.update({ receivedQuantity: newReceivedQuantity }, { transaction });

            inventoryUpdates.push({
              productId: item.productId,
              quantity: quantityToReceive,
            });

            if (newReceivedQuantity < item.quantity) {
              allReceived = false;
            }
          } else if (item.receivedQuantity < item.quantity) {
            allReceived = false;
          }
        }

        // Update inventory
        await InventoryService.addStock(inventoryUpdates, transaction);

        // Update purchase status
        const newStatus = allReceived ? PURCHASE_STATUS.RECEIVED : PURCHASE_STATUS.PARTIAL;
        await purchase.update({ status: newStatus }, { transaction });
      });

      const updatedPurchase = await Purchase.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [
          { model: Customer, as: 'supplier' },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: PurchaseItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.success(res, updatedPurchase, 'Goods received successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete purchase
   * DELETE /api/purchases/:id
   */
  static async delete(req, res, next) {
    try {
      const purchase = await Purchase.findOne({
        where: { id: req.params.id, ...req.companyFilter },
      });

      if (!purchase) {
        return ApiResponse.notFound(res, 'Purchase not found');
      }

      if (![PURCHASE_STATUS.PENDING, PURCHASE_STATUS.CANCELLED].includes(purchase.status)) {
        return ApiResponse.badRequest(res, 'Can only delete pending or cancelled purchases');
      }

      await sequelize.transaction(async (transaction) => {
        await PurchaseItem.destroy({ where: { purchaseId: purchase.id }, transaction });
        await purchase.destroy({ transaction });
      });

      return ApiResponse.success(res, null, 'Purchase deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PurchasesController;
