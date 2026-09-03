const { InventoryAdjustment, InventoryAdjustmentItem, Product, Inventory, User, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, INVENTORY_ADJUSTMENT_STATUS, ADJUSTMENT_TYPE } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

class InventoryAdjustmentsController {
  /**
   * Get all inventory adjustments
   * GET /api/inventory-adjustments
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

      if (status && Object.values(INVENTORY_ADJUSTMENT_STATUS).includes(status)) {
        whereClause.status = status;
      }

      if (search) {
        whereClause.adjustmentNumber = { [Op.iLike]: `%${search}%` };
      }

      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder || 'DESC';
      const order = sortBy === 'user'
        ? [[{ model: User, as: 'user' }, 'name', sortOrder]]
        : [[sortBy, sortOrder]];

      const { count, rows } = await InventoryAdjustment.findAndCountAll({
        where: whereClause,
        include: [
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

      return ApiResponse.paginated(res, rows, pagination, 'Inventory adjustments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get inventory adjustment by ID
   * GET /api/inventory-adjustments/:id
   */
  static async getById(req, res, next) {
    try {
      const adjustment = await InventoryAdjustment.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: InventoryAdjustmentItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      if (!adjustment) {
        return ApiResponse.notFound(res, 'Inventory adjustment not found');
      }

      return ApiResponse.success(res, adjustment, 'Inventory adjustment retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all products with current stock for creating adjustment
   * GET /api/inventory-adjustments/products
   */
  static async getProductsWithStock(req, res, next) {
    try {
      const products = await Product.findAll({
        where: { ...req.companyFilter },
        include: [
          {
            model: Inventory,
            as: 'inventory',
            attributes: ['quantity', 'location', 'minStockLevel'],
          },
        ],
        order: [['name', 'ASC']],
      });

      // Map products with their current stock
      const productsWithStock = products.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        unit: product.unit,
        currentStock: product.inventory?.quantity || 0,
        location: product.inventory?.location || null,
        minStockLevel: product.inventory?.minStockLevel || 0,
      }));

      return ApiResponse.success(res, productsWithStock, 'Products with stock retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create inventory adjustment
   * POST /api/inventory-adjustments
   */
  static async create(req, res, next) {
    const transaction = await sequelize.transaction();

    try {
      const companyId = getCompanyIdForCreate(req);
      if (!companyId) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const { items, reason, notes } = req.body;

      // Validate items
      if (!items || !Array.isArray(items) || items.length === 0) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'At least one adjustment item is required');
      }

      // Validate reason
      if (!reason) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'Reason is required');
      }

      // Validate each item and get current stock
      const validatedItems = [];

      for (const item of items) {
        const { productId, adjustmentType, quantityAdjusted } = item;

        // Validate adjustment type
        if (!Object.values(ADJUSTMENT_TYPE).includes(adjustmentType)) {
          await transaction.rollback();
          return ApiResponse.badRequest(res, `Invalid adjustment type: ${adjustmentType}`);
        }

        // Validate quantity
        if (quantityAdjusted === undefined || quantityAdjusted < 0) {
          await transaction.rollback();
          return ApiResponse.badRequest(res, 'Adjustment quantity must be a non-negative number');
        }

        // Skip items with 0 quantity (no change)
        if (quantityAdjusted === 0 && adjustmentType !== ADJUSTMENT_TYPE.SET) {
          continue;
        }

        // Verify product belongs to company
        const product = await Product.findOne({
          where: { id: productId, companyId },
          include: [{ model: Inventory, as: 'inventory' }],
          transaction,
        });

        if (!product) {
          await transaction.rollback();
          return ApiResponse.badRequest(res, `Product with ID ${productId} not found`);
        }

        const currentStock = product.inventory?.quantity || 0;

        // Calculate quantity after
        let quantityAfter;
        switch (adjustmentType) {
          case ADJUSTMENT_TYPE.ADD:
            quantityAfter = currentStock + quantityAdjusted;
            break;
          case ADJUSTMENT_TYPE.REMOVE:
            quantityAfter = Math.max(0, currentStock - quantityAdjusted);
            if (quantityAdjusted > currentStock) {
              await transaction.rollback();
              return ApiResponse.badRequest(
                res,
                `Cannot remove ${quantityAdjusted} from ${product.name}. Current stock is only ${currentStock}`
              );
            }
            break;
          case ADJUSTMENT_TYPE.SET:
            quantityAfter = quantityAdjusted;
            break;
        }

        validatedItems.push({
          productId,
          adjustmentType,
          quantityBefore: currentStock,
          quantityAdjusted,
          quantityAfter,
        });
      }

      if (validatedItems.length === 0) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'No valid adjustment items provided');
      }

      // Generate adjustment number
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const adjustmentNumber = `ADJ-${timestamp}-${random}`;

      // Create the inventory adjustment
      const adjustment = await InventoryAdjustment.create(
        {
          adjustmentNumber,
          userId: req.user.id,
          status: INVENTORY_ADJUSTMENT_STATUS.PENDING,
          reason,
          notes,
          companyId,
        },
        { transaction }
      );

      // Create adjustment items individually with hooks disabled
      for (const item of validatedItems) {
        await InventoryAdjustmentItem.create(
          {
            inventoryAdjustmentId: adjustment.id,
            productId: item.productId,
            adjustmentType: item.adjustmentType,
            quantityBefore: item.quantityBefore,
            quantityAdjusted: item.quantityAdjusted,
            quantityAfter: item.quantityAfter,
          },
          { transaction, hooks: false }
        );
      }

      await transaction.commit();

      // Fetch the complete adjustment with associations
      const completeAdjustment = await InventoryAdjustment.findOne({
        where: { id: adjustment.id },
        include: [
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: InventoryAdjustmentItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.created(res, completeAdjustment, 'Inventory adjustment created successfully');
    } catch (error) {
      await transaction.rollback();
      // Log detailed error info for debugging
      console.error('Inventory Adjustment Create Error:', error.name, error.message);
      if (error.errors) {
        error.errors.forEach(e => console.error('Validation Error:', e.path, e.message));
      }
      next(error);
    }
  }

  /**
   * Update inventory adjustment status
   * PATCH /api/inventory-adjustments/:id/status
   */
  static async updateStatus(req, res, next) {
    const transaction = await sequelize.transaction();

    try {
      const { status } = req.body;

      if (!Object.values(INVENTORY_ADJUSTMENT_STATUS).includes(status)) {
        await transaction.rollback();
        return ApiResponse.badRequest(res, 'Invalid status');
      }

      const adjustment = await InventoryAdjustment.findOne({
        where: { id: req.params.id, ...req.companyFilter },
        include: [{ model: InventoryAdjustmentItem, as: 'items' }],
        transaction,
      });

      if (!adjustment) {
        await transaction.rollback();
        return ApiResponse.notFound(res, 'Inventory adjustment not found');
      }

      // Define valid status transitions
      const validTransitions = {
        pending: ['approved', 'cancelled'],
        approved: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
      };

      if (!validTransitions[adjustment.status].includes(status)) {
        await transaction.rollback();
        return ApiResponse.badRequest(
          res,
          `Cannot change status from ${adjustment.status} to ${status}`
        );
      }

      // If completing the adjustment, apply changes to inventory
      if (status === 'completed') {
        for (const item of adjustment.items) {
          let inventory = await Inventory.findOne({
            where: { productId: item.productId, ...req.companyFilter },
            transaction,
          });

          if (!inventory) {
            // Create inventory record if it doesn't exist
            inventory = await Inventory.create(
              {
                productId: item.productId,
                quantity: 0,
                companyId: adjustment.companyId,
              },
              { transaction }
            );
          }

          // Apply the adjustment based on type
          let newQuantity;
          switch (item.adjustmentType) {
            case ADJUSTMENT_TYPE.ADD:
              newQuantity = inventory.quantity + item.quantityAdjusted;
              break;
            case ADJUSTMENT_TYPE.REMOVE:
              newQuantity = Math.max(0, inventory.quantity - item.quantityAdjusted);
              break;
            case ADJUSTMENT_TYPE.SET: {
              const delta = item.quantityAfter - item.quantityBefore;
              newQuantity = Math.max(0, inventory.quantity + delta);
              break;
            }
            default:
              newQuantity = inventory.quantity;
          }

          const updateData = { quantity: newQuantity };

          // Update lastRestocked if quantity increased
          if (newQuantity > inventory.quantity) {
            updateData.lastRestocked = new Date();
          }

          await inventory.update(updateData, { transaction });
        }
      }

      await adjustment.update({ status }, { transaction });

      await transaction.commit();

      // Fetch updated adjustment
      const updatedAdjustment = await InventoryAdjustment.findOne({
        where: { id: adjustment.id },
        include: [
          { model: User, as: 'user', attributes: { exclude: ['password'] } },
          {
            model: InventoryAdjustmentItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      return ApiResponse.success(res, updatedAdjustment, 'Inventory adjustment status updated successfully');
    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  }

  /**
   * Delete inventory adjustment (only pending)
   * DELETE /api/inventory-adjustments/:id
   */
  static async delete(req, res, next) {
    try {
      const adjustment = await InventoryAdjustment.findOne({
        where: { id: req.params.id, ...req.companyFilter },
      });

      if (!adjustment) {
        return ApiResponse.notFound(res, 'Inventory adjustment not found');
      }

      if (adjustment.status !== 'pending') {
        return ApiResponse.badRequest(res, 'Only pending inventory adjustments can be deleted');
      }

      await adjustment.destroy();

      return ApiResponse.success(res, null, 'Inventory adjustment deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = InventoryAdjustmentsController;
