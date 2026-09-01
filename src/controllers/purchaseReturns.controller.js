const { PurchaseReturn, PurchaseReturnItem, Purchase, PurchaseItem, Product, Customer, User, Inventory, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, PURCHASE_RETURN_STATUS } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

class PurchaseReturnsController {
  /**
   * Get all purchase returns
   * GET /api/purchase-returns
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

      if (status && Object.values(PURCHASE_RETURN_STATUS).includes(status)) {
        whereClause.status = status;
      }

      if (search) {
        whereClause.returnNumber = { [Op.iLike]: `%${search}%` };
      }

      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder || 'DESC';
      const JOIN_SORT_MAP = {
        orderNumber: [{ model: Purchase, as: 'purchase' }, 'orderNumber'],
        supplier: [{ model: Purchase, as: 'purchase' }, { model: Customer, as: 'supplier' }, 'name'],
      };
      const order = JOIN_SORT_MAP[sortBy]
        ? [[...JOIN_SORT_MAP[sortBy], sortOrder]]
        : [[sortBy, sortOrder]];

      const { count, rows } = await PurchaseReturn.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Purchase,
            as: 'purchase',
            include: [{ model: Customer, as: 'supplier' }],
          },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
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

      return ApiResponse.paginated(res, rows, pagination, 'Purchase returns retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get purchase return by ID
   * GET /api/purchase-returns/:id
   */
  static async getById(req, res, next) {
    try {
      const purchaseReturn = await PurchaseReturn.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [
          {
            model: Purchase,
            as: 'purchase',
            include: [
              { model: Customer, as: 'supplier' },
              {
                model: PurchaseItem,
                as: 'items',
                include: [{ model: Product, as: 'product' }],
              },
            ],
          },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: PurchaseReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      if (!purchaseReturn) {
        return ApiResponse.notFound(res, 'Purchase return not found');
      }

      return ApiResponse.success(res, purchaseReturn, 'Purchase return retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get returnable items for a purchase (with remaining quantities)
   * GET /api/purchase-returns/purchase/:purchaseId/returnable-items
   */
  static async getReturnableItems(req, res, next) {
    try {
      const { purchaseId } = req.params;

      // Find the purchase with company filter
      const purchase = await Purchase.findOne({
        where: { id: purchaseId, ...req.companyFilter },
        include: [
          { model: Customer, as: 'supplier' },
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

      // Check if purchase status allows returns (received or partial)
      const allowedStatuses = ['partial', 'received'];
      if (!allowedStatuses.includes(purchase.status)) {
        return ApiResponse.badRequest(
          res,
          `Returns are only allowed for orders with status: ${allowedStatuses.join(', ')}`
        );
      }

      // Get all existing returns for this purchase
      const existingReturns = await PurchaseReturn.findAll({
        where: {
          purchaseId,
          status: { [Op.ne]: 'cancelled' },
        },
        include: [{ model: PurchaseReturnItem, as: 'items' }],
      });

      // Calculate returned quantities (paid + FOC) per purchase item
      const returnedQuantities = {};
      const returnedFocQuantities = {};
      existingReturns.forEach((purchaseReturn) => {
        purchaseReturn.items.forEach((item) => {
          returnedQuantities[item.purchaseItemId] =
            (returnedQuantities[item.purchaseItemId] || 0) + item.quantity;
          returnedFocQuantities[item.purchaseItemId] =
            (returnedFocQuantities[item.purchaseItemId] || 0) + item.focQuantity;
        });
      });

      // Build returnable items with remaining quantities
      const returnableItems = purchase.items.map((item) => {
        const returnedQty = returnedQuantities[item.id] || 0;
        const returnedFocQty = returnedFocQuantities[item.id] || 0;
        // Use receivedQuantity for purchase returns (only received items can be returned).
        // receivedQuantity is a single combined counter (paid + FOC together), so split it:
        // paid units are considered received first (up to the paid quantity), anything
        // beyond that is the FOC portion. This keeps the paid ceiling from exceeding what
        // was actually paid for, even once more (paid + FOC) has been received.
        const receivedQty = item.receivedQuantity || 0;
        const paidReceived = Math.min(receivedQty, item.quantity);
        const focReceived = Math.max(0, receivedQty - item.quantity);
        const remainingQty = paidReceived - returnedQty;
        const remainingFocQty = Math.min(focReceived, item.focQuantity) - returnedFocQty;
        return {
          purchaseItemId: item.id,
          productId: item.productId,
          product: item.product,
          orderedQuantity: item.quantity,
          orderedFocQuantity: item.focQuantity,
          receivedQuantity: receivedQty,
          returnedQuantity: returnedQty,
          returnedFocQuantity: returnedFocQty,
          remainingQuantity: remainingQty,
          remainingFocQuantity: remainingFocQty,
          unitPrice: item.unitPrice,
          canReturn: remainingQty > 0 || remainingFocQty > 0,
        };
      });

      return ApiResponse.success(
        res,
        { purchase, returnableItems },
        'Returnable items retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create purchase return
   * POST /api/purchase-returns
   */
  static async create(req, res, next) {
    const transaction = await sequelize.transaction();

    try {
      const companyId = getCompanyIdForCreate(req);
      if (!companyId) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const { purchaseId, items, reason, notes } = req.body;

      // Validate purchase exists and belongs to company
      const purchase = await Purchase.findOne({
        where: { id: purchaseId, companyId },
        include: [{ model: PurchaseItem, as: 'items' }],
        transaction,
      });

      if (!purchase) {
        await transaction.rollback();
        return ApiResponse.notFound(res, 'Purchase not found');
      }

      // Check if purchase status allows returns
      const allowedStatuses = ['partial', 'received'];
      if (!allowedStatuses.includes(purchase.status)) {
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

      // Get existing returns for this purchase
      const existingReturns = await PurchaseReturn.findAll({
        where: {
          purchaseId,
          status: { [Op.ne]: 'cancelled' },
        },
        include: [{ model: PurchaseReturnItem, as: 'items' }],
        transaction,
      });

      // Calculate already returned quantities (paid + FOC)
      const returnedQuantities = {};
      const returnedFocQuantities = {};
      existingReturns.forEach((purchaseReturn) => {
        purchaseReturn.items.forEach((item) => {
          returnedQuantities[item.purchaseItemId] =
            (returnedQuantities[item.purchaseItemId] || 0) + item.quantity;
          returnedFocQuantities[item.purchaseItemId] =
            (returnedFocQuantities[item.purchaseItemId] || 0) + item.focQuantity;
        });
      });

      // Create a map of purchase items for validation
      const purchaseItemsMap = {};
      purchase.items.forEach((item) => {
        purchaseItemsMap[item.id] = item;
      });

      // Validate each return item
      const validatedItems = [];
      let subtotal = 0;

      for (const item of items) {
        const { purchaseItemId, quantity: rawQuantity, focQuantity: rawFocQuantity } = item;
        const quantity = parseInt(rawQuantity) || 0;
        const focQuantity = parseInt(rawFocQuantity) || 0;

        // Check if purchase item exists in the original purchase
        const purchaseItem = purchaseItemsMap[purchaseItemId];
        if (!purchaseItem) {
          await transaction.rollback();
          return ApiResponse.badRequest(
            res,
            `Item with purchaseItemId ${purchaseItemId} is not part of the original purchase`
          );
        }

        // Check quantity is valid - at least one of paid/FOC must be returned
        if (quantity + focQuantity < 1) {
          await transaction.rollback();
          return ApiResponse.badRequest(res, 'Return quantity or FOC quantity must be at least 1');
        }

        // Check if return quantity doesn't exceed remaining quantity (based on received qty).
        // receivedQuantity is a single combined counter (paid + FOC together), so split it
        // the same way getReturnableItems does: paid units received first, FOC after.
        const alreadyReturned = returnedQuantities[purchaseItemId] || 0;
        const receivedQty = purchaseItem.receivedQuantity || 0;
        const paidReceived = Math.min(receivedQty, purchaseItem.quantity);
        const focReceived = Math.max(0, receivedQty - purchaseItem.quantity);
        const remainingQty = paidReceived - alreadyReturned;

        if (quantity > remainingQty) {
          await transaction.rollback();
          return ApiResponse.badRequest(
            res,
            `Cannot return ${quantity} units of product. Only ${remainingQty} remaining (received: ${paidReceived}, already returned: ${alreadyReturned})`
          );
        }

        // Check if return FOC quantity doesn't exceed remaining FOC quantity
        const alreadyReturnedFoc = returnedFocQuantities[purchaseItemId] || 0;
        const remainingFocQty = Math.min(focReceived, purchaseItem.focQuantity) - alreadyReturnedFoc;

        if (focQuantity > remainingFocQty) {
          await transaction.rollback();
          return ApiResponse.badRequest(
            res,
            `Cannot return ${focQuantity} FOC units of product. Only ${remainingFocQty} remaining (ordered: ${purchaseItem.focQuantity}, already returned: ${alreadyReturnedFoc})`
          );
        }

        // Inherit item-level discount from original purchase item - FOC quantity never enters pricing
        const itemDiscountPercent = parseFloat(purchaseItem.discountPercent || 0);
        const itemSubtotal = parseFloat(purchaseItem.unitPrice) * quantity;
        const itemDiscountAmount = itemSubtotal * (itemDiscountPercent / 100);
        const itemTotal = itemSubtotal - itemDiscountAmount;

        subtotal += itemTotal;

        validatedItems.push({
          purchaseItemId,
          productId: purchaseItem.productId,
          quantity,
          focQuantity,
          unitPrice: purchaseItem.unitPrice,
          discountPercent: itemDiscountPercent,
          // discountAmount and total will be auto-calculated by model hook
        });
      }

      // Calculate order-level discount (inherited from original purchase)
      const orderDiscountPercent = parseFloat(purchase.discountPercent || 0);
      const orderDiscountAmount = subtotal * (orderDiscountPercent / 100);
      const subtotalAfterOrderDiscount = subtotal - orderDiscountAmount;

      // Calculate tax proportionally based on original purchase
      const originalSubtotal = parseFloat(purchase.subtotal);
      const taxRate = originalSubtotal > 0 ? parseFloat(purchase.tax) / originalSubtotal : 0;
      const tax = subtotal * taxRate;

      // Calculate total: (subtotal after item discounts - order discount) + tax
      const total = subtotalAfterOrderDiscount + tax;

      // Generate return number
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const returnNumber = `PR-${timestamp}-${random}`;

      // Create the purchase return
      const purchaseReturn = await PurchaseReturn.create(
        {
          purchaseId,
          userId: req.user.id,
          returnNumber,
          status: PURCHASE_RETURN_STATUS.PENDING,
          subtotal,
          discountPercent: orderDiscountPercent,
          discountAmount: orderDiscountAmount,
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
        purchaseReturnId: purchaseReturn.id,
      }));

      await PurchaseReturnItem.bulkCreate(returnItems, { transaction, individualHooks: true });

      await transaction.commit();

      // Fetch the complete purchase return with associations
      const completePurchaseReturn = await PurchaseReturn.findOne({
        where: { id: purchaseReturn.id },
        include: [
          {
            model: Purchase,
            as: 'purchase',
            include: [{ model: Customer, as: 'supplier' }],
          },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: PurchaseReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.created(res, completePurchaseReturn, 'Purchase return created successfully');
    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  }

  /**
   * Update purchase return status
   * PATCH /api/purchase-returns/:id/status
   */
  static async updateStatus(req, res, next) {
    const transaction = await sequelize.transaction();

    try {
      const { status } = req.body;

      if (!Object.values(PURCHASE_RETURN_STATUS).includes(status)) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'Invalid status');
      }

      const purchaseReturn = await PurchaseReturn.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [{ model: PurchaseReturnItem, as: 'items' }],
        transaction,
      });

      if (!purchaseReturn) {
        await transaction.rollback();
        return ApiResponse.notFound(res, 'Purchase return not found');
      }

      // Define valid status transitions
      const validTransitions = {
        pending: ['approved', 'cancelled'],
        approved: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
      };

      if (!validTransitions[purchaseReturn.status].includes(status)) {
        await transaction.rollback();
        return ApiResponse.badRequest(
          res,
          `Cannot change status from ${purchaseReturn.status} to ${status}`
        );
      }

      // If completing the return, remove items from inventory (returning to supplier)
      if (status === 'completed') {
        for (const item of purchaseReturn.items) {
          const inventory = await Inventory.findOne({
            where: { productId: item.productId, ...req.companyFilter },
            transaction,
          });

          if (inventory) {
            const requiredQuantity = item.quantity + item.focQuantity;
            const newQuantity = inventory.quantity - requiredQuantity;
            if (newQuantity < 0) {
              await transaction.rollback();
              return ApiResponse.badRequest(
                res,
                `Insufficient inventory for product ID ${item.productId}. Available: ${inventory.quantity}, Required: ${requiredQuantity}`
              );
            }
            await inventory.update(
              { quantity: newQuantity },
              { transaction }
            );
          }
        }
      }

      await purchaseReturn.update({ status }, { transaction });

      await transaction.commit();

      // Fetch updated purchase return
      const updatedPurchaseReturn = await PurchaseReturn.findOne({
        where: { id: purchaseReturn.id },
        include: [
          {
            model: Purchase,
            as: 'purchase',
            include: [{ model: Customer, as: 'supplier' }],
          },
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: PurchaseReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.success(res, updatedPurchaseReturn, 'Purchase return status updated successfully');
    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  }

  /**
   * Delete purchase return (only pending)
   * DELETE /api/purchase-returns/:id
   */
  static async delete(req, res, next) {
    try {
      const purchaseReturn = await PurchaseReturn.findOne({
        where: { id: req.params.id, ...req.companyFilter },
      });

      if (!purchaseReturn) {
        return ApiResponse.notFound(res, 'Purchase return not found');
      }

      if (purchaseReturn.status !== 'pending') {
        return ApiResponse.badRequest(res, 'Only pending purchase returns can be deleted');
      }

      await purchaseReturn.destroy();

      return ApiResponse.success(res, null, 'Purchase return deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PurchaseReturnsController;
