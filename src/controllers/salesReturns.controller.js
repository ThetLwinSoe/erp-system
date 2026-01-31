const { SalesReturn, SalesReturnItem, Sale, SaleItem, Product, Customer, User, Inventory, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, SALES_RETURN_STATUS } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

class SalesReturnsController {
  /**
   * Get all sales returns
   * GET /api/sales-returns
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

      const whereClause = { ...req.companyFilter };

      if (status && Object.values(SALES_RETURN_STATUS).includes(status)) {
        whereClause.status = status;
      }

      if (search) {
        whereClause.returnNumber = { [Op.iLike]: `%${search}%` };
      }

      const { count, rows } = await SalesReturn.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Sale,
            as: 'sale',
            include: [{ model: Customer, as: 'customer' }],
          },
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

      return ApiResponse.paginated(res, rows, pagination, 'Sales returns retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sales return by ID
   * GET /api/sales-returns/:id
   */
  static async getById(req, res, next) {
    try {
      const salesReturn = await SalesReturn.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [
          {
            model: Sale,
            as: 'sale',
            include: [
              { model: Customer, as: 'customer' },
              {
                model: SaleItem,
                as: 'items',
                include: [{ model: Product, as: 'product' }],
              },
            ],
          },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: SalesReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      if (!salesReturn) {
        return ApiResponse.notFound(res, 'Sales return not found');
      }

      return ApiResponse.success(res, salesReturn, 'Sales return retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get returnable items for a sale (with remaining quantities)
   * GET /api/sales-returns/sale/:saleId/returnable-items
   */
  static async getReturnableItems(req, res, next) {
    try {
      const { saleId } = req.params;

      // Find the sale with company filter
      const sale = await Sale.findOne({
        where: { id: saleId, ...req.companyFilter },
        include: [
          { model: Customer, as: 'customer' },
          {
            model: SaleItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      if (!sale) {
        return ApiResponse.notFound(res, 'Sale not found');
      }

      // Check if sale status allows returns
      const allowedStatuses = ['confirmed', 'shipped', 'delivered'];
      if (!allowedStatuses.includes(sale.status)) {
        return ApiResponse.badRequest(
          res,
          `Returns are only allowed for orders with status: ${allowedStatuses.join(', ')}`
        );
      }

      // Get all existing returns for this sale
      const existingReturns = await SalesReturn.findAll({
        where: {
          saleId,
          status: { [Op.ne]: 'cancelled' },
        },
        include: [{ model: SalesReturnItem, as: 'items' }],
      });

      // Calculate returned quantities per sale item
      const returnedQuantities = {};
      existingReturns.forEach((salesReturn) => {
        salesReturn.items.forEach((item) => {
          returnedQuantities[item.saleItemId] =
            (returnedQuantities[item.saleItemId] || 0) + item.quantity;
        });
      });

      // Build returnable items with remaining quantities
      const returnableItems = sale.items.map((item) => {
        const returnedQty = returnedQuantities[item.id] || 0;
        const remainingQty = item.quantity - returnedQty;
        return {
          saleItemId: item.id,
          productId: item.productId,
          product: item.product,
          orderedQuantity: item.quantity,
          returnedQuantity: returnedQty,
          remainingQuantity: remainingQty,
          unitPrice: item.unitPrice,
          canReturn: remainingQty > 0,
        };
      });

      return ApiResponse.success(
        res,
        { sale, returnableItems },
        'Returnable items retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create sales return
   * POST /api/sales-returns
   */
  static async create(req, res, next) {
    const transaction = await sequelize.transaction();

    try {
      const companyId = getCompanyIdForCreate(req);
      if (!companyId) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const { saleId, items, reason, notes } = req.body;

      // Validate sale exists and belongs to company
      const sale = await Sale.findOne({
        where: { id: saleId, companyId },
        include: [{ model: SaleItem, as: 'items' }],
        transaction,
      });

      if (!sale) {
        await transaction.rollback();
        return ApiResponse.notFound(res, 'Sale not found');
      }

      // Check if sale status allows returns
      const allowedStatuses = ['confirmed', 'shipped', 'delivered'];
      if (!allowedStatuses.includes(sale.status)) {
        await transaction.rollback();
        return ApiResponse.badRequest(
          res,
          `Returns are only allowed for orders with status: ${allowedStatuses.join(', ')}`
        );
      }

      // Validate items
      if (!items || !Array.isArray(items) || items.length === 0) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'At least one return item is required');
      }

      // Get existing returns for this sale
      const existingReturns = await SalesReturn.findAll({
        where: {
          saleId,
          status: { [Op.ne]: 'cancelled' },
        },
        include: [{ model: SalesReturnItem, as: 'items' }],
        transaction,
      });

      // Calculate already returned quantities
      const returnedQuantities = {};
      existingReturns.forEach((salesReturn) => {
        salesReturn.items.forEach((item) => {
          returnedQuantities[item.saleItemId] =
            (returnedQuantities[item.saleItemId] || 0) + item.quantity;
        });
      });

      // Create a map of sale items for validation
      const saleItemsMap = {};
      sale.items.forEach((item) => {
        saleItemsMap[item.id] = item;
      });

      // Validate each return item
      const validatedItems = [];
      let subtotal = 0;

      for (const item of items) {
        const { saleItemId, quantity } = item;

        // Check if sale item exists in the original sale
        const saleItem = saleItemsMap[saleItemId];
        if (!saleItem) {
          await transaction.rollback();
          return ApiResponse.badRequest(
            res,
            `Item with saleItemId ${saleItemId} is not part of the original sale`
          );
        }

        // Check quantity is valid
        if (!quantity || quantity < 1) {
          await transaction.rollback();
          return ApiResponse.badRequest(res, 'Return quantity must be at least 1');
        }

        // Check if return quantity doesn't exceed remaining quantity
        const alreadyReturned = returnedQuantities[saleItemId] || 0;
        const remainingQty = saleItem.quantity - alreadyReturned;

        if (quantity > remainingQty) {
          await transaction.rollback();
          return ApiResponse.badRequest(
            res,
            `Cannot return ${quantity} units of product. Only ${remainingQty} remaining (ordered: ${saleItem.quantity}, already returned: ${alreadyReturned})`
          );
        }

        const itemTotal = parseFloat(saleItem.unitPrice) * quantity;
        subtotal += itemTotal;

        validatedItems.push({
          saleItemId,
          productId: saleItem.productId,
          quantity,
          unitPrice: saleItem.unitPrice,
          total: itemTotal,
        });
      }

      // Calculate tax proportionally based on original sale
      const taxRate = sale.subtotal > 0 ? parseFloat(sale.tax) / parseFloat(sale.subtotal) : 0;
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      // Generate return number
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const returnNumber = `SR-${timestamp}-${random}`;

      // Create the sales return
      const salesReturn = await SalesReturn.create(
        {
          saleId,
          userId: req.user.id,
          returnNumber,
          status: SALES_RETURN_STATUS.PENDING,
          subtotal,
          tax,
          total,
          reason,
          notes,
          companyId,
        },
        { transaction }
      );

      // Create return items
      const returnItems = validatedItems.map((item) => ({
        ...item,
        salesReturnId: salesReturn.id,
      }));

      await SalesReturnItem.bulkCreate(returnItems, { transaction });

      await transaction.commit();

      // Fetch the complete sales return with associations
      const completeSalesReturn = await SalesReturn.findOne({
        where: { id: salesReturn.id },
        include: [
          {
            model: Sale,
            as: 'sale',
            include: [{ model: Customer, as: 'customer' }],
          },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: SalesReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.created(res, completeSalesReturn, 'Sales return created successfully');
    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  }

  /**
   * Update sales return status
   * PATCH /api/sales-returns/:id/status
   */
  static async updateStatus(req, res, next) {
    const transaction = await sequelize.transaction();

    try {
      const { status } = req.body;

      if (!Object.values(SALES_RETURN_STATUS).includes(status)) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'Invalid status');
      }

      const salesReturn = await SalesReturn.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [{ model: SalesReturnItem, as: 'items' }],
        transaction,
      });

      if (!salesReturn) {
        await transaction.rollback();
        return ApiResponse.notFound(res, 'Sales return not found');
      }

      // Define valid status transitions
      const validTransitions = {
        pending: ['approved', 'cancelled'],
        approved: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
      };

      if (!validTransitions[salesReturn.status].includes(status)) {
        await transaction.rollback();
        return ApiResponse.badRequest(
          res,
          `Cannot change status from ${salesReturn.status} to ${status}`
        );
      }

      // If completing the return, add items back to inventory
      if (status === 'completed') {
        for (const item of salesReturn.items) {
          const inventory = await Inventory.findOne({
            where: { productId: item.productId, ...req.companyFilter },
            transaction,
          });

          if (inventory) {
            await inventory.update(
              {
                quantity: inventory.quantity + item.quantity,
                lastRestocked: new Date(),
              },
              { transaction }
            );
          }
        }
      }

      await salesReturn.update({ status }, { transaction });

      await transaction.commit();

      // Fetch updated sales return
      const updatedSalesReturn = await SalesReturn.findOne({
        where: { id: salesReturn.id },
        include: [
          {
            model: Sale,
            as: 'sale',
            include: [{ model: Customer, as: 'customer' }],
          },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: SalesReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.success(res, updatedSalesReturn, 'Sales return status updated successfully');
    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  }

  /**
   * Delete sales return (only pending)
   * DELETE /api/sales-returns/:id
   */
  static async delete(req, res, next) {
    try {
      const salesReturn = await SalesReturn.findOne({
        where: { id: req.params.id, ...req.companyFilter },
      });

      if (!salesReturn) {
        return ApiResponse.notFound(res, 'Sales return not found');
      }

      if (salesReturn.status !== 'pending') {
        return ApiResponse.badRequest(res, 'Only pending sales returns can be deleted');
      }

      await salesReturn.destroy();

      return ApiResponse.success(res, null, 'Sales return deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SalesReturnsController;
