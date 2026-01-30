const { Product, Inventory } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

class ProductsController {
  /**
   * Get all products
   * GET /api/products
   */
  static async getAll(req, res, next) {
    try {
      const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
      const limit = Math.min(
        parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT,
        PAGINATION.MAX_LIMIT
      );
      const offset = (page - 1) * limit;
      const search = req.query.search || '';
      const category = req.query.category || '';

      // Add company filter
      const whereClause = { ...req.companyFilter };

      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { sku: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
        ];
      }

      if (category) {
        whereClause.category = { [Op.iLike]: `%${category}%` };
      }

      const { count, rows } = await Product.findAndCountAll({
        where: whereClause,
        include: [{ model: Inventory, as: 'inventory' }],
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

      return ApiResponse.paginated(res, rows, pagination, 'Products retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create product
   * POST /api/products
   */
  static async create(req, res, next) {
    try {
      const companyId = getCompanyIdForCreate(req);

      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const { sku, name, description, category, unit, costPrice, sellingPrice } = req.body;

      const product = await Product.create({
        sku,
        name,
        description,
        category,
        unit,
        costPrice,
        sellingPrice,
        companyId,
      });

      // Create initial inventory record
      await Inventory.create({
        productId: product.id,
        quantity: 0,
        minStockLevel: 10,
        companyId,
      });

      const productWithInventory = await Product.findByPk(product.id, {
        include: [{ model: Inventory, as: 'inventory' }],
      });

      return ApiResponse.created(res, productWithInventory, 'Product created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get product by ID
   * GET /api/products/:id
   */
  static async getById(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const product = await Product.findOne({
        where: whereClause,
        include: [{ model: Inventory, as: 'inventory' }],
      });

      if (!product) {
        return ApiResponse.notFound(res, 'Product not found');
      }

      return ApiResponse.success(res, product, 'Product retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update product
   * PUT /api/products/:id
   */
  static async update(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const product = await Product.findOne({ where: whereClause });

      if (!product) {
        return ApiResponse.notFound(res, 'Product not found');
      }

      const { sku, name, description, category, unit, costPrice, sellingPrice } = req.body;
      const updates = {};

      if (sku !== undefined) updates.sku = sku;
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (unit !== undefined) updates.unit = unit;
      if (costPrice !== undefined) updates.costPrice = costPrice;
      if (sellingPrice !== undefined) updates.sellingPrice = sellingPrice;

      await product.update(updates);

      const updatedProduct = await Product.findByPk(req.params.id, {
        include: [{ model: Inventory, as: 'inventory' }],
      });

      return ApiResponse.success(res, updatedProduct, 'Product updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete product
   * DELETE /api/products/:id
   */
  static async delete(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const product = await Product.findOne({ where: whereClause });

      if (!product) {
        return ApiResponse.notFound(res, 'Product not found');
      }

      // Delete associated inventory first
      await Inventory.destroy({ where: { productId: product.id } });
      await product.destroy();

      return ApiResponse.success(res, null, 'Product deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ProductsController;
