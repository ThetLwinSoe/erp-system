const { Sale, SaleItem, Purchase, PurchaseItem, Customer, User, Product, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { Op } = require('sequelize');

class ReportsController {
  /**
   * Get sales report with filters
   * GET /api/reports/sales
   * Query params: startDate, endDate, customerId, status
   */
  static async getSalesReport(req, res, next) {
    try {
      const { startDate, endDate, customerId, status } = req.query;

      // Add company filter
      const whereClause = { ...req.companyFilter };

      // Date range filter
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          whereClause.createdAt[Op.lte] = end;
        }
      }

      // Customer filter
      if (customerId) {
        whereClause.customerId = parseInt(customerId);
      }

      // Status filter
      if (status) {
        whereClause.status = status;
      }

      const sales = await Sale.findAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: SaleItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Calculate summary
      const summary = {
        totalOrders: sales.length,
        totalRevenue: sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0),
        totalTax: sales.reduce((sum, sale) => sum + parseFloat(sale.tax), 0),
        byStatus: {},
      };

      // Group by status
      sales.forEach((sale) => {
        if (!summary.byStatus[sale.status]) {
          summary.byStatus[sale.status] = { count: 0, total: 0 };
        }
        summary.byStatus[sale.status].count++;
        summary.byStatus[sale.status].total += parseFloat(sale.total);
      });

      return ApiResponse.success(res, { sales, summary }, 'Sales report retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export sales report to CSV format
   * GET /api/reports/sales/export
   * Query params: startDate, endDate, customerId, status
   */
  static async exportSalesReport(req, res, next) {
    try {
      const { startDate, endDate, customerId, status } = req.query;

      // Add company filter
      const whereClause = { ...req.companyFilter };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          whereClause.createdAt[Op.lte] = end;
        }
      }

      if (customerId) {
        whereClause.customerId = parseInt(customerId);
      }

      if (status) {
        whereClause.status = status;
      }

      const sales = await Sale.findAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: SaleItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Build CSV content - one row per item
      const csvHeaders = [
        'Order Number',
        'Date',
        'Customer ID',
        'Customer',
        'Customer Email',
        'Status',
        'Item SKU',
        'Item Name',
        'Qty',
        'Subtotal',
        'Tax',
        'Total',
        'Created By',
      ];

      const csvRows = [];
      sales.forEach((sale) => {
        if (sale.items && sale.items.length > 0) {
          sale.items.forEach((item) => {
            csvRows.push([
              sale.orderNumber,
              new Date(sale.createdAt).toISOString().split('T')[0],
              sale.customer?.id || '',
              sale.customer?.name || '',
              sale.customer?.email || '',
              sale.status,
              item.product?.sku || '',
              item.product?.name || '',
              item.quantity,
              parseFloat(sale.subtotal).toFixed(2),
              parseFloat(sale.tax).toFixed(2),
              parseFloat(sale.total).toFixed(2),
              sale.user?.name || '',
            ]);
          });
        } else {
          // Order with no items
          csvRows.push([
            sale.orderNumber,
            new Date(sale.createdAt).toISOString().split('T')[0],
            sale.customer?.id || '',
            sale.customer?.name || '',
            sale.customer?.email || '',
            sale.status,
            '',
            '',
            '',
            parseFloat(sale.subtotal).toFixed(2),
            parseFloat(sale.tax).toFixed(2),
            parseFloat(sale.total).toFixed(2),
            sale.user?.name || '',
          ]);
        }
      });

      // Escape CSV values
      const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        csvHeaders.map(escapeCSV).join(','),
        ...csvRows.map((row) => row.map(escapeCSV).join(',')),
      ].join('\n');

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.csv`);

      return res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get purchases report with filters
   * GET /api/reports/purchases
   * Query params: startDate, endDate, supplierId, status
   */
  static async getPurchasesReport(req, res, next) {
    try {
      const { startDate, endDate, supplierId, status } = req.query;

      // Add company filter
      const whereClause = { ...req.companyFilter };

      // Date range filter
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          whereClause.createdAt[Op.lte] = end;
        }
      }

      // Supplier filter
      if (supplierId) {
        whereClause.supplierId = parseInt(supplierId);
      }

      // Status filter
      if (status) {
        whereClause.status = status;
      }

      const purchases = await Purchase.findAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'supplier', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: PurchaseItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Calculate summary
      const summary = {
        totalOrders: purchases.length,
        totalAmount: purchases.reduce((sum, purchase) => sum + parseFloat(purchase.total), 0),
        totalTax: purchases.reduce((sum, purchase) => sum + parseFloat(purchase.tax), 0),
        byStatus: {},
      };

      // Group by status
      purchases.forEach((purchase) => {
        if (!summary.byStatus[purchase.status]) {
          summary.byStatus[purchase.status] = { count: 0, total: 0 };
        }
        summary.byStatus[purchase.status].count++;
        summary.byStatus[purchase.status].total += parseFloat(purchase.total);
      });

      return ApiResponse.success(res, { purchases, summary }, 'Purchases report retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export purchases report to CSV format
   * GET /api/reports/purchases/export
   * Query params: startDate, endDate, supplierId, status
   */
  static async exportPurchasesReport(req, res, next) {
    try {
      const { startDate, endDate, supplierId, status } = req.query;

      // Add company filter
      const whereClause = { ...req.companyFilter };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          whereClause.createdAt[Op.lte] = end;
        }
      }

      if (supplierId) {
        whereClause.supplierId = parseInt(supplierId);
      }

      if (status) {
        whereClause.status = status;
      }

      const purchases = await Purchase.findAll({
        where: whereClause,
        include: [
          { model: Customer, as: 'supplier', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: PurchaseItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Build CSV content - one row per item
      const csvHeaders = [
        'Order Number',
        'Date',
        'Expected Delivery',
        'Supplier ID',
        'Supplier',
        'Supplier Email',
        'Status',
        'Item SKU',
        'Item Name',
        'Qty',
        'Subtotal',
        'Tax',
        'Total',
        'Created By',
      ];

      const csvRows = [];
      purchases.forEach((purchase) => {
        if (purchase.items && purchase.items.length > 0) {
          purchase.items.forEach((item) => {
            csvRows.push([
              purchase.orderNumber,
              new Date(purchase.createdAt).toISOString().split('T')[0],
              purchase.expectedDelivery ? new Date(purchase.expectedDelivery).toISOString().split('T')[0] : '',
              purchase.supplier?.id || '',
              purchase.supplier?.name || '',
              purchase.supplier?.email || '',
              purchase.status,
              item.product?.sku || '',
              item.product?.name || '',
              item.quantity,
              parseFloat(purchase.subtotal).toFixed(2),
              parseFloat(purchase.tax).toFixed(2),
              parseFloat(purchase.total).toFixed(2),
              purchase.user?.name || '',
            ]);
          });
        } else {
          csvRows.push([
            purchase.orderNumber,
            new Date(purchase.createdAt).toISOString().split('T')[0],
            purchase.expectedDelivery ? new Date(purchase.expectedDelivery).toISOString().split('T')[0] : '',
            purchase.supplier?.id || '',
            purchase.supplier?.name || '',
            purchase.supplier?.email || '',
            purchase.status,
            '',
            '',
            '',
            parseFloat(purchase.subtotal).toFixed(2),
            parseFloat(purchase.tax).toFixed(2),
            parseFloat(purchase.total).toFixed(2),
            purchase.user?.name || '',
          ]);
        }
      });

      // Escape CSV values
      const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        csvHeaders.map(escapeCSV).join(','),
        ...csvRows.map((row) => row.map(escapeCSV).join(',')),
      ].join('\n');

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.csv`);

      return res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReportsController;
