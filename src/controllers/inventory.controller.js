const { Inventory, Product } = require('../models');
const InventoryService = require('../services/inventory.service');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION } = require('../utils/constants');

class InventoryController {
  /**
   * Get all inventory items
   * GET /api/inventory
   */
  static async getAll(req, res, next) {
    try {
      const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
      const limit = Math.min(
        parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT,
        PAGINATION.MAX_LIMIT
      );
      const offset = (page - 1) * limit;

      const { count, rows } = await Inventory.findAndCountAll({
        include: [{ model: Product, as: 'product' }],
        order: [['updatedAt', 'DESC']],
        limit,
        offset,
      });

      const pagination = {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      };

      return ApiResponse.paginated(res, rows, pagination, 'Inventory retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get low stock items
   * GET /api/inventory/low-stock
   */
  static async getLowStock(req, res, next) {
    try {
      const items = await InventoryService.getLowStockItems();
      return ApiResponse.success(res, items, 'Low stock items retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update inventory for a product
   * PUT /api/inventory/:productId
   */
  static async update(req, res, next) {
    try {
      const { productId } = req.params;
      const { quantity, location, minStockLevel } = req.body;

      const inventory = await InventoryService.updateInventory(productId, {
        quantity,
        location,
        minStockLevel,
      });

      return ApiResponse.success(res, inventory, 'Inventory updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Adjust inventory (add/remove/set)
   * POST /api/inventory/adjust
   */
  static async adjust(req, res, next) {
    try {
      const { productId, quantity, type, reason } = req.body;

      const inventory = await InventoryService.adjustInventory(
        productId,
        quantity,
        type,
        reason
      );

      return ApiResponse.success(res, inventory, 'Inventory adjusted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get inventory for a specific product
   * GET /api/inventory/:productId
   */
  static async getByProduct(req, res, next) {
    try {
      const { productId } = req.params;

      const inventory = await Inventory.findOne({
        where: { productId },
        include: [{ model: Product, as: 'product' }],
      });

      if (!inventory) {
        return ApiResponse.notFound(res, 'Inventory record not found');
      }

      return ApiResponse.success(res, inventory, 'Inventory retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = InventoryController;
