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

      // Add company filter
      const whereClause = { ...req.companyFilter };

      const sortBy = req.query.sortBy || 'updatedAt';
      const sortOrder = req.query.sortOrder || 'DESC';
      const PRODUCT_FIELDS = ['sku', 'name', 'category'];
      const order = PRODUCT_FIELDS.includes(sortBy)
        ? [[{ model: Product, as: 'product' }, sortBy, sortOrder]]
        : [[sortBy, sortOrder]];

      const { count, rows } = await Inventory.findAndCountAll({
        where: whereClause,
        include: [{ model: Product, as: 'product' }],
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
      const items = await InventoryService.getLowStockItems(req.companyFilter);
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

      // Verify product belongs to the company
      const product = await Product.findOne({
        where: { id: productId, ...req.companyFilter },
      });

      if (!product) {
        return ApiResponse.notFound(res, 'Product not found');
      }

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

      // Verify product belongs to the company
      const product = await Product.findOne({
        where: { id: productId, ...req.companyFilter },
      });

      if (!product) {
        return ApiResponse.notFound(res, 'Product not found');
      }

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
        where: { productId, ...req.companyFilter },
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

  /**
   * Export inventory to CSV
   * GET /api/inventory/export
   */
  static async exportCSV(req, res, next) {
    try {
      const inventory = await Inventory.findAll({
        where: { ...req.companyFilter },
        include: [{ model: Product, as: 'product' }],
        order: [['product', 'sku', 'ASC']],
      });

      // Build CSV content
      const headers = ['SKU', 'Product Name', 'Category', 'Stock', 'Min Level', 'Location', 'Last Restocked'];
      const rows = inventory.map((item) => [
        item.product?.sku || '',
        item.product?.name || '',
        item.product?.category || '',
        item.quantity,
        item.minStockLevel,
        item.location || '',
        item.lastRestocked ? new Date(item.lastRestocked).toLocaleDateString() : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=inventory-${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = InventoryController;
