const { Sale, SaleItem, Product, Customer, User, sequelize } = require('../models');
const InventoryService = require('./inventory.service');
const { ORDER_STATUS } = require('../utils/constants');

class SalesService {
  /**
   * Create a new sale order
   */
  static async createSale(userId, saleData, companyId) {
    const { customerId, items, tax = 0, notes } = saleData;

    // Validate customer exists and belongs to the same company
    const customer = await Customer.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate products and get prices - products must belong to the same company
    const productIds = items.map((item) => item.productId);
    const products = await Product.findAll({
      where: { id: productIds, companyId },
    });

    if (products.length !== productIds.length) {
      const error = new Error('One or more products not found');
      error.statusCode = 404;
      throw error;
    }

    // Check stock availability
    const unavailable = await InventoryService.checkStockAvailability(items);
    if (unavailable.length > 0) {
      const error = new Error('Insufficient stock for some items');
      error.statusCode = 400;
      error.details = unavailable;
      throw error;
    }

    // Calculate totals
    const productMap = new Map(products.map((p) => [p.id, p]));
    let subtotal = 0;

    const saleItems = items.map((item) => {
      const product = productMap.get(item.productId);
      const unitPrice = item.unitPrice !== undefined ? item.unitPrice : product.sellingPrice;
      const total = item.quantity * unitPrice;
      subtotal += total;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        total,
      };
    });

    const total = subtotal + parseFloat(tax);

    // Generate order number
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `SO-${timestamp}-${random}`;

    // Create sale and items in transaction
    const result = await sequelize.transaction(async (transaction) => {
      const sale = await Sale.create(
        {
          customerId,
          userId,
          companyId,
          orderNumber,
          subtotal,
          tax,
          total,
          notes,
          status: ORDER_STATUS.PENDING,
        },
        { transaction }
      );

      const itemsWithSaleId = saleItems.map((item) => ({
        ...item,
        saleId: sale.id,
      }));

      await SaleItem.bulkCreate(itemsWithSaleId, { transaction });

      // Deduct inventory
      await InventoryService.deductStock(items, transaction);

      return sale;
    });

    return this.getSaleById(result.id);
  }

  /**
   * Get sale by ID with all relations
   */
  static async getSaleById(id, companyFilter = {}) {
    const sale = await Sale.findOne({
      where: { id, ...companyFilter },
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'user', attributes: { exclude: ['password'] } },
        {
          model: SaleItem,
          as: 'items',
          include: [{ model: Product, as: 'product' }],
        },
      ],
    });

    if (!sale) {
      const error = new Error('Sale not found');
      error.statusCode = 404;
      throw error;
    }

    return sale;
  }

  /**
   * Update sale status
   */
  static async updateSaleStatus(id, status, companyFilter = {}) {
    const sale = await Sale.findOne({
      where: { id, ...companyFilter },
    });

    if (!sale) {
      const error = new Error('Sale not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate status transition
    const validTransitions = {
      [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.DELIVERED]: [],
      [ORDER_STATUS.CANCELLED]: [],
    };

    if (!validTransitions[sale.status].includes(status)) {
      const error = new Error(`Cannot transition from ${sale.status} to ${status}`);
      error.statusCode = 400;
      throw error;
    }

    // If cancelling, restore inventory
    if (status === ORDER_STATUS.CANCELLED) {
      await sequelize.transaction(async (transaction) => {
        const items = await SaleItem.findAll({
          where: { saleId: id },
          transaction,
        });

        await InventoryService.addStock(items, transaction);
        await sale.update({ status }, { transaction });
      });
    } else {
      await sale.update({ status });
    }

    return this.getSaleById(id, companyFilter);
  }

  /**
   * Update sale details
   */
  static async updateSale(id, updateData, companyFilter = {}) {
    const sale = await Sale.findOne({
      where: { id, ...companyFilter },
    });

    if (!sale) {
      const error = new Error('Sale not found');
      error.statusCode = 404;
      throw error;
    }

    if (sale.status !== ORDER_STATUS.PENDING) {
      const error = new Error('Can only update pending orders');
      error.statusCode = 400;
      throw error;
    }

    const allowedFields = ['notes', 'tax'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    if (updates.tax !== undefined) {
      updates.total = parseFloat(sale.subtotal) + parseFloat(updates.tax);
    }

    await sale.update(updates);

    return this.getSaleById(id, companyFilter);
  }

  /**
   * Delete/cancel sale
   */
  static async deleteSale(id, companyFilter = {}) {
    const sale = await Sale.findOne({
      where: { id, ...companyFilter },
      include: [{ model: SaleItem, as: 'items' }],
    });

    if (!sale) {
      const error = new Error('Sale not found');
      error.statusCode = 404;
      throw error;
    }

    if (sale.status === ORDER_STATUS.DELIVERED) {
      const error = new Error('Cannot delete delivered orders');
      error.statusCode = 400;
      throw error;
    }

    await sequelize.transaction(async (transaction) => {
      // Restore inventory if not already cancelled
      if (sale.status !== ORDER_STATUS.CANCELLED) {
        await InventoryService.addStock(sale.items, transaction);
      }

      await SaleItem.destroy({ where: { saleId: id }, transaction });
      await sale.destroy({ transaction });
    });

    return { message: 'Sale deleted successfully' };
  }
}

module.exports = SalesService;
