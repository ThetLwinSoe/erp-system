const { Purchase, PurchaseItem, Product, Customer, User, sequelize } = require('../models');
const InventoryService = require('./inventory.service');

// Purchase order statuses
const PURCHASE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  ORDERED: 'ordered',
  PARTIAL: 'partial',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
};

class PurchasesService {
  /**
   * Create a new purchase order
   */
  static async createPurchase(userId, purchaseData, companyId) {
    const { supplierId, items, tax = 0, discountPercent = 0, expectedDelivery, notes } = purchaseData;

    // Validate supplier exists and belongs to the same company
    // Note: Suppliers are stored in customers table with type='supplier'
    const supplier = await Customer.findOne({
      where: { id: supplierId, companyId },
    });
    if (!supplier) {
      const error = new Error('Supplier not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate products - products must belong to the same company
    const productIds = items.map((item) => item.productId);
    const products = await Product.findAll({
      where: { id: productIds, companyId },
    });

    if (products.length !== productIds.length) {
      const error = new Error('One or more products not found');
      error.statusCode = 404;
      throw error;
    }

    // Calculate totals with two-tier discount
    const productMap = new Map(products.map((p) => [p.id, p]));
    let subtotal = 0;

    const purchaseItems = items.map((item) => {
      const product = productMap.get(item.productId);
      const unitPrice = item.unitPrice !== undefined ? item.unitPrice : product.costPrice;
      const itemDiscountPercent = parseFloat(item.discountPercent || 0);

      // Calculate item subtotal and discount
      const itemSubtotal = item.quantity * unitPrice;
      const itemDiscountAmount = itemSubtotal * (itemDiscountPercent / 100);
      const itemTotal = itemSubtotal - itemDiscountAmount;

      subtotal += itemTotal;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        receivedQuantity: 0,
        discountPercent: itemDiscountPercent,
        // discountAmount and total will be auto-calculated by model hook
      };
    });

    // Calculate order-level discount
    const orderDiscountPercent = parseFloat(discountPercent);
    const orderDiscountAmount = subtotal * (orderDiscountPercent / 100);
    const subtotalAfterOrderDiscount = subtotal - orderDiscountAmount;
    const total = subtotalAfterOrderDiscount + parseFloat(tax);

    // Generate order number
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `PO-${timestamp}-${random}`;

    // Create purchase and items in transaction
    const result = await sequelize.transaction(async (transaction) => {
      const purchase = await Purchase.create(
        {
          supplierId,
          userId,
          companyId,
          orderNumber,
          subtotal,
          discountPercent: orderDiscountPercent,
          discountAmount: orderDiscountAmount,
          tax,
          total,
          expectedDelivery,
          notes,
          status: PURCHASE_STATUS.PENDING,
        },
        { transaction }
      );

      const itemsWithPurchaseId = purchaseItems.map((item) => ({
        ...item,
        purchaseId: purchase.id,
      }));

      await PurchaseItem.bulkCreate(itemsWithPurchaseId, { transaction, individualHooks: true });

      return purchase;
    });

    return this.getPurchaseById(result.id);
  }

  /**
   * Get purchase by ID with all relations
   */
  static async getPurchaseById(id, companyFilter = {}) {
    const purchase = await Purchase.findOne({
      where: { id, ...companyFilter },
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
      const error = new Error('Purchase not found');
      error.statusCode = 404;
      throw error;
    }

    return purchase;
  }

  /**
   * Update purchase status
   */
  static async updatePurchaseStatus(id, status, companyFilter = {}) {
    const purchase = await Purchase.findOne({
      where: { id, ...companyFilter },
    });

    if (!purchase) {
      const error = new Error('Purchase not found');
      error.statusCode = 404;
      throw error;
    }

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
      const error = new Error(`Cannot transition from ${purchase.status} to ${status}`);
      error.statusCode = 400;
      throw error;
    }

    await purchase.update({ status });

    return this.getPurchaseById(id, companyFilter);
  }

  /**
   * Update purchase details
   */
  static async updatePurchase(id, updateData, companyFilter = {}) {
    const purchase = await Purchase.findOne({
      where: { id, ...companyFilter },
    });

    if (!purchase) {
      const error = new Error('Purchase not found');
      error.statusCode = 404;
      throw error;
    }

    if (purchase.status !== PURCHASE_STATUS.PENDING) {
      const error = new Error('Can only update pending purchase orders');
      error.statusCode = 400;
      throw error;
    }

    const allowedFields = ['notes', 'tax', 'expectedDelivery', 'discountPercent'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    // Recalculate totals if tax or discount changed
    if (updates.tax !== undefined || updates.discountPercent !== undefined) {
      const newTax = updates.tax !== undefined ? parseFloat(updates.tax) : parseFloat(purchase.tax);
      const newDiscountPercent = updates.discountPercent !== undefined ? parseFloat(updates.discountPercent) : parseFloat(purchase.discountPercent);

      const subtotal = parseFloat(purchase.subtotal);
      const orderDiscountAmount = subtotal * (newDiscountPercent / 100);
      const subtotalAfterOrderDiscount = subtotal - orderDiscountAmount;

      updates.discountAmount = orderDiscountAmount;
      updates.total = subtotalAfterOrderDiscount + newTax;
    }

    await purchase.update(updates);

    return this.getPurchaseById(id, companyFilter);
  }

  /**
   * Delete purchase order
   */
  static async deletePurchase(id, companyFilter = {}) {
    const purchase = await Purchase.findOne({
      where: { id, ...companyFilter },
      include: [{ model: PurchaseItem, as: 'items' }],
    });

    if (!purchase) {
      const error = new Error('Purchase not found');
      error.statusCode = 404;
      throw error;
    }

    if (purchase.status === PURCHASE_STATUS.RECEIVED) {
      const error = new Error('Cannot delete received purchase orders');
      error.statusCode = 400;
      throw error;
    }

    // Check if any items have been received
    const hasReceivedItems = purchase.items.some((item) => item.receivedQuantity > 0);
    if (hasReceivedItems) {
      const error = new Error('Cannot delete purchase orders with received items');
      error.statusCode = 400;
      throw error;
    }

    await sequelize.transaction(async (transaction) => {
      await PurchaseItem.destroy({ where: { purchaseId: id }, transaction });
      await purchase.destroy({ transaction });
    });

    return { message: 'Purchase order deleted successfully' };
  }
}

module.exports = PurchasesService;
