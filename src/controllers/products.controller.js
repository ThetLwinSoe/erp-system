const { Product, Inventory, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { toCSV, parseCSV } = require('../utils/csv');
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

      // Filter by status
      const status = req.query.status || '';
      if (status) {
        whereClause.status = status;
      }

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

      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder || 'DESC';
      const order = sortBy === 'stock'
        ? [[{ model: Inventory, as: 'inventory' }, 'quantity', sortOrder]]
        : [[sortBy, sortOrder]];

      const { count, rows } = await Product.findAndCountAll({
        where: whereClause,
        include: [{ model: Inventory, as: 'inventory' }],
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

      const { sku, name, description, category, unit, costPrice, sellingPrice, status } = req.body;

      const product = await Product.create({
        sku,
        name,
        description,
        category,
        unit,
        costPrice,
        sellingPrice,
        status: status || 'active',
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

      const { sku, name, description, category, unit, costPrice, sellingPrice, status } = req.body;
      const updates = {};

      if (sku !== undefined) updates.sku = sku;
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (unit !== undefined) updates.unit = unit;
      if (costPrice !== undefined) updates.costPrice = costPrice;
      if (sellingPrice !== undefined) updates.sellingPrice = sellingPrice;
      if (status !== undefined) updates.status = status;

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
   * Toggle product status (active/inactive)
   * PATCH /api/products/:id/status
   */
  static async toggleStatus(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const product = await Product.findOne({ where: whereClause });

      if (!product) {
        return ApiResponse.notFound(res, 'Product not found');
      }

      const newStatus = product.status === 'active' ? 'inactive' : 'active';
      await product.update({ status: newStatus });

      const updatedProduct = await Product.findByPk(req.params.id, {
        include: [{ model: Inventory, as: 'inventory' }],
      });

      return ApiResponse.success(res, updatedProduct, `Product ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk import products from CSV
   * POST /api/products/import
   */
  static async importCSV(req, res, next) {
    try {
      if (!req.file) {
        return ApiResponse.badRequest(res, 'CSV file is required');
      }

      const companyId = getCompanyIdForCreate(req);
      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const rows = parseCSV(req.file.buffer.toString('utf-8'));
      if (rows.length === 0) {
        return ApiResponse.badRequest(res, 'CSV file is empty');
      }

      // Normalize headers so "Cost Price", "cost price", "costprice" all match
      const normalize = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const headerRow = rows[0].map(normalize);
      const dataRows = rows.slice(1);

      if (dataRows.length === 0) {
        return ApiResponse.badRequest(res, 'CSV file has no data rows');
      }

      const MAX_ROWS = 1000;
      if (dataRows.length > MAX_ROWS) {
        return ApiResponse.badRequest(res, `CSV file exceeds the maximum of ${MAX_ROWS} rows`);
      }

      const indexes = {
        sku: headerRow.indexOf('sku'),
        name: headerRow.indexOf('name'),
        description: headerRow.indexOf('description'),
        category: headerRow.indexOf('category'),
        unit: headerRow.indexOf('unit'),
        costPrice: headerRow.indexOf('costprice'),
        sellingPrice: headerRow.indexOf('sellingprice'),
      };

      if (indexes.sku === -1 || indexes.name === -1) {
        return ApiResponse.badRequest(res, 'CSV must include "SKU" and "Name" columns');
      }

      const getValue = (row, key) => {
        const idx = indexes[key];
        if (idx === -1 || idx >= row.length) return '';
        return (row[idx] || '').trim();
      };

      let created = 0;
      const errors = [];

      for (let i = 0; i < dataRows.length; i++) {
        const rowNumber = i + 2; // +1 for header row, +1 for 1-based numbering
        const row = dataRows[i];

        const sku = getValue(row, 'sku');
        const name = getValue(row, 'name');
        if (!sku || !name) {
          errors.push({ row: rowNumber, message: 'SKU and Name are required' });
          continue;
        }

        const costPriceRaw = getValue(row, 'costPrice');
        const costPrice = parseFloat(costPriceRaw);
        if (costPriceRaw === '' || Number.isNaN(costPrice) || costPrice < 0) {
          errors.push({ row: rowNumber, message: 'Cost Price must be a positive number' });
          continue;
        }

        const sellingPriceRaw = getValue(row, 'sellingPrice');
        const sellingPrice = parseFloat(sellingPriceRaw);
        if (sellingPriceRaw === '' || Number.isNaN(sellingPrice) || sellingPrice < 0) {
          errors.push({ row: rowNumber, message: 'Selling Price must be a positive number' });
          continue;
        }

        try {
          await sequelize.transaction(async (transaction) => {
            const product = await Product.create(
              {
                sku,
                name,
                description: getValue(row, 'description') || null,
                category: getValue(row, 'category') || null,
                unit: getValue(row, 'unit') || 'piece',
                costPrice,
                sellingPrice,
                status: 'active',
                companyId,
              },
              { transaction }
            );

            await Inventory.create(
              {
                productId: product.id,
                quantity: 0,
                minStockLevel: 10,
                companyId,
              },
              { transaction }
            );
          });
          created++;
        } catch (err) {
          errors.push({ row: rowNumber, message: err.errors?.[0]?.message || err.message || 'Failed to create product' });
        }
      }

      return ApiResponse.success(
        res,
        { total: dataRows.length, created, failed: errors.length, errors },
        `Import completed: ${created} created, ${errors.length} failed`
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export products to CSV
   * GET /api/products/export
   */
  static async exportCSV(req, res, next) {
    try {
      const search = req.query.search || '';
      const category = req.query.category || '';
      const status = req.query.status || '';

      const whereClause = { ...req.companyFilter };

      if (status) {
        whereClause.status = status;
      }

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

      const products = await Product.findAll({
        where: whereClause,
        include: [{ model: Inventory, as: 'inventory' }],
        order: [['name', 'ASC']],
      });

      const headers = ['ID', 'SKU', 'Name', 'Description', 'Category', 'Unit', 'Cost Price', 'Selling Price', 'Stock', 'Min Stock Level', 'Status', 'Created At'];
      const rows = products.map((product) => [
        product.id,
        product.sku,
        product.name,
        product.description || '',
        product.category || '',
        product.unit || '',
        parseFloat(product.costPrice).toFixed(2),
        parseFloat(product.sellingPrice).toFixed(2),
        product.inventory?.quantity ?? '',
        product.inventory?.minStockLevel ?? '',
        product.status,
        new Date(product.createdAt).toLocaleDateString(),
      ]);

      const csvContent = toCSV(headers, rows);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=products-${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
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
