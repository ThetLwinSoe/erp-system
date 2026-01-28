const { Inventory, Product, sequelize } = require('../models');
const { ADJUSTMENT_TYPE } = require('../utils/constants');
const { Op } = require('sequelize');

class InventoryService {
  /**
   * Get or create inventory record for a product
   */
  static async getOrCreateInventory(productId) {
    let inventory = await Inventory.findOne({ where: { productId } });

    if (!inventory) {
      inventory = await Inventory.create({
        productId,
        quantity: 0,
        minStockLevel: 10,
      });
    }

    return inventory;
  }

  /**
   * Update inventory quantity
   */
  static async updateInventory(productId, data) {
    const product = await Product.findByPk(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    let inventory = await this.getOrCreateInventory(productId);

    await inventory.update({
      quantity: data.quantity !== undefined ? data.quantity : inventory.quantity,
      location: data.location !== undefined ? data.location : inventory.location,
      minStockLevel: data.minStockLevel !== undefined ? data.minStockLevel : inventory.minStockLevel,
      lastRestocked: data.quantity > inventory.quantity ? new Date() : inventory.lastRestocked,
    });

    return inventory.reload({ include: [{ model: Product, as: 'product' }] });
  }

  /**
   * Adjust inventory (add/remove/set)
   */
  static async adjustInventory(productId, quantity, type, reason = null) {
    const product = await Product.findByPk(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    const inventory = await this.getOrCreateInventory(productId);
    let newQuantity;

    switch (type) {
      case ADJUSTMENT_TYPE.ADD:
        newQuantity = inventory.quantity + quantity;
        break;
      case ADJUSTMENT_TYPE.REMOVE:
        newQuantity = inventory.quantity - quantity;
        if (newQuantity < 0) {
          const error = new Error('Insufficient stock');
          error.statusCode = 400;
          throw error;
        }
        break;
      case ADJUSTMENT_TYPE.SET:
        newQuantity = quantity;
        break;
      default:
        const error = new Error('Invalid adjustment type');
        error.statusCode = 400;
        throw error;
    }

    await inventory.update({
      quantity: newQuantity,
      lastRestocked: type === ADJUSTMENT_TYPE.ADD ? new Date() : inventory.lastRestocked,
    });

    return inventory.reload({ include: [{ model: Product, as: 'product' }] });
  }

  /**
   * Deduct stock for sale items
   */
  static async deductStock(items, transaction = null) {
    for (const item of items) {
      const inventory = await Inventory.findOne({
        where: { productId: item.productId },
        transaction,
      });

      if (!inventory || inventory.quantity < item.quantity) {
        const error = new Error(`Insufficient stock for product ID ${item.productId}`);
        error.statusCode = 400;
        throw error;
      }

      await inventory.update(
        { quantity: inventory.quantity - item.quantity },
        { transaction }
      );
    }
  }

  /**
   * Add stock from purchase receiving
   */
  static async addStock(items, transaction = null) {
    for (const item of items) {
      let inventory = await Inventory.findOne({
        where: { productId: item.productId },
        transaction,
      });

      if (!inventory) {
        inventory = await Inventory.create(
          {
            productId: item.productId,
            quantity: item.quantity,
            minStockLevel: 10,
            lastRestocked: new Date(),
          },
          { transaction }
        );
      } else {
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

  /**
   * Get low stock items
   */
  static async getLowStockItems() {
    const inventory = await Inventory.findAll({
      where: sequelize.where(
        sequelize.col('quantity'),
        Op.lte,
        sequelize.col('minStockLevel')
      ),
      include: [{ model: Product, as: 'product' }],
      order: [['quantity', 'ASC']],
    });

    return inventory;
  }

  /**
   * Check stock availability for items
   */
  static async checkStockAvailability(items) {
    const unavailable = [];

    for (const item of items) {
      const inventory = await Inventory.findOne({
        where: { productId: item.productId },
        include: [{ model: Product, as: 'product' }],
      });

      if (!inventory || inventory.quantity < item.quantity) {
        unavailable.push({
          productId: item.productId,
          productName: inventory?.product?.name || 'Unknown',
          requested: item.quantity,
          available: inventory?.quantity || 0,
        });
      }
    }

    return unavailable;
  }
}

module.exports = InventoryService;
