const { Sale, SaleItem, SalesReturn, SalesReturnItem, Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem, Customer, User, Product, sequelize } = require('../models');
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

      // Sale Rep can only see their own sales
      if (req.isSaleRep) {
        whereClause.userId = req.user.id;
      }

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

      // Status filter - exclude pending and cancelled by default
      if (status) {
        whereClause.status = status;
      } else {
        // By default, exclude pending and cancelled transactions
        whereClause.status = {
          [Op.notIn]: ['pending', 'cancelled']
        };
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

      // Fetch sales returns with same filters
      const returns = await SalesReturn.findAll({
        where: whereClause,
        include: [
          {
            model: Sale,
            as: 'sale',
            include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] }],
          },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: SalesReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Transform returns to have negative values and add type flag
      const transformedReturns = returns.map((ret) => ({
        id: ret.id,
        orderNumber: ret.returnNumber,
        type: 'return',
        originalOrderNumber: ret.sale?.orderNumber,
        createdAt: ret.createdAt,
        updatedAt: ret.updatedAt,
        customer: ret.sale?.customer,
        user: ret.user,
        status: ret.status,
        // Negative values for amounts
        subtotal: -parseFloat(ret.subtotal),
        discountPercent: parseFloat(ret.discountPercent || 0),
        discountAmount: -parseFloat(ret.discountAmount || 0),
        tax: -parseFloat(ret.tax),
        total: -parseFloat(ret.total),
        notes: ret.notes,
        reason: ret.reason,
        items: (ret.items || []).map((item) => ({
          id: item.id,
          productId: item.productId,
          product: item.product,
          quantity: -item.quantity, // Negative quantity
          unitPrice: parseFloat(item.unitPrice), // Price stays positive
          discountPercent: parseFloat(item.discountPercent || 0),
          discountAmount: -parseFloat(item.discountAmount || 0), // Negative discount amount
          total: -parseFloat(item.total), // Negative total
        })),
      }));

      // Add type flag to sales
      const transformedSales = sales.map((sale) => ({
        ...sale.toJSON(),
        type: 'sale',
      }));

      // Combine sales and returns
      const allTransactions = [...transformedSales, ...transformedReturns].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      // Calculate summary (returns reduce the totals)
      const summary = {
        totalOrders: sales.length,
        totalReturns: returns.length,
        totalRevenue: sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0),
        returnRevenue: returns.reduce((sum, ret) => sum + parseFloat(ret.total), 0),
        netRevenue: sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0) -
                    returns.reduce((sum, ret) => sum + parseFloat(ret.total), 0),
        totalTax: sales.reduce((sum, sale) => sum + parseFloat(sale.tax), 0) -
                  returns.reduce((sum, ret) => sum + parseFloat(ret.tax), 0),
        totalItemDiscounts: sales.reduce((sum, sale) =>
          sum + sale.items.reduce((itemSum, item) =>
            itemSum + parseFloat(item.discountAmount || 0), 0), 0) -
          returns.reduce((sum, ret) =>
            sum + ret.items.reduce((itemSum, item) =>
              itemSum + parseFloat(item.discountAmount || 0), 0), 0),
        totalOrderDiscounts: sales.reduce((sum, sale) =>
          sum + parseFloat(sale.discountAmount || 0), 0) -
          returns.reduce((sum, ret) =>
            sum + parseFloat(ret.discountAmount || 0), 0),
        byStatus: {},
      };

      // Group by status (sales)
      sales.forEach((sale) => {
        if (!summary.byStatus[sale.status]) {
          summary.byStatus[sale.status] = { count: 0, total: 0 };
        }
        summary.byStatus[sale.status].count++;
        summary.byStatus[sale.status].total += parseFloat(sale.total);
      });

      // Group by status (returns) - separate key
      returns.forEach((ret) => {
        const key = `return-${ret.status}`;
        if (!summary.byStatus[key]) {
          summary.byStatus[key] = { count: 0, total: 0 };
        }
        summary.byStatus[key].count++;
        summary.byStatus[key].total -= parseFloat(ret.total);
      });

      return ApiResponse.success(res, { sales: allTransactions, summary }, 'Sales report retrieved successfully');
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

      // Sale Rep can only export their own sales
      if (req.isSaleRep) {
        whereClause.userId = req.user.id;
      }

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

      // Status filter - exclude pending and cancelled by default
      if (status) {
        whereClause.status = status;
      } else {
        // By default, exclude pending and cancelled transactions
        whereClause.status = {
          [Op.notIn]: ['pending', 'cancelled']
        };
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

      // Fetch sales returns with same filters
      const returns = await SalesReturn.findAll({
        where: whereClause,
        include: [
          {
            model: Sale,
            as: 'sale',
            include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] }],
          },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: SalesReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Build CSV content - one row per item
      const csvHeaders = [
        'Type',
        'Order Number',
        'Original Order',
        'Date',
        'Customer ID',
        'Customer',
        'Customer Email',
        'Status',
        'Item SKU',
        'Item Name',
        'Qty',
        'Unit Price',
        'Item Discount %',
        'Item Discount Amount',
        'Order Discount %',
        'Order Discount Amount',
        'Subtotal',
        'Tax',
        'Total',
        'Created By',
      ];

      const csvRows = [];

      // Add sales
      sales.forEach((sale) => {
        if (sale.items && sale.items.length > 0) {
          sale.items.forEach((item) => {
            csvRows.push([
              'Sale',
              sale.orderNumber,
              '',
              new Date(sale.createdAt).toISOString().split('T')[0],
              sale.customer?.id || '',
              sale.customer?.name || '',
              sale.customer?.email || '',
              sale.status,
              item.product?.sku || '',
              item.product?.name || '',
              item.quantity,
              parseFloat(item.unitPrice || 0).toFixed(2),
              parseFloat(item.discountPercent || 0).toFixed(2),
              parseFloat(item.discountAmount || 0).toFixed(2),
              parseFloat(sale.discountPercent || 0).toFixed(2),
              parseFloat(sale.discountAmount || 0).toFixed(2),
              parseFloat(sale.subtotal).toFixed(2),
              parseFloat(sale.tax).toFixed(2),
              parseFloat(sale.total).toFixed(2),
              sale.user?.name || '',
            ]);
          });
        } else {
          csvRows.push([
            'Sale',
            sale.orderNumber,
            '',
            new Date(sale.createdAt).toISOString().split('T')[0],
            sale.customer?.id || '',
            sale.customer?.name || '',
            sale.customer?.email || '',
            sale.status,
            '',
            '',
            '',
            '',
            '',
            '',
            parseFloat(sale.discountPercent || 0).toFixed(2),
            parseFloat(sale.discountAmount || 0).toFixed(2),
            parseFloat(sale.subtotal).toFixed(2),
            parseFloat(sale.tax).toFixed(2),
            parseFloat(sale.total).toFixed(2),
            sale.user?.name || '',
          ]);
        }
      });

      // Add returns (with negative values except prices)
      returns.forEach((ret) => {
        if (ret.items && ret.items.length > 0) {
          ret.items.forEach((item) => {
            csvRows.push([
              'Return',
              ret.returnNumber,
              ret.sale?.orderNumber || '',
              new Date(ret.createdAt).toISOString().split('T')[0],
              ret.sale?.customer?.id || '',
              ret.sale?.customer?.name || '',
              ret.sale?.customer?.email || '',
              ret.status,
              item.product?.sku || '',
              item.product?.name || '',
              -item.quantity, // Negative
              parseFloat(item.unitPrice || 0).toFixed(2), // Positive
              parseFloat(item.discountPercent || 0).toFixed(2),
              (-parseFloat(item.discountAmount || 0)).toFixed(2), // Negative
              parseFloat(ret.discountPercent || 0).toFixed(2),
              (-parseFloat(ret.discountAmount || 0)).toFixed(2), // Negative
              (-parseFloat(ret.subtotal)).toFixed(2), // Negative
              (-parseFloat(ret.tax)).toFixed(2), // Negative
              (-parseFloat(ret.total)).toFixed(2), // Negative
              ret.user?.name || '',
            ]);
          });
        } else {
          csvRows.push([
            'Return',
            ret.returnNumber,
            ret.sale?.orderNumber || '',
            new Date(ret.createdAt).toISOString().split('T')[0],
            ret.sale?.customer?.id || '',
            ret.sale?.customer?.name || '',
            ret.sale?.customer?.email || '',
            ret.status,
            '',
            '',
            '',
            '',
            '',
            '',
            parseFloat(ret.discountPercent || 0).toFixed(2),
            (-parseFloat(ret.discountAmount || 0)).toFixed(2),
            (-parseFloat(ret.subtotal)).toFixed(2),
            (-parseFloat(ret.tax)).toFixed(2),
            (-parseFloat(ret.total)).toFixed(2),
            ret.user?.name || '',
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

      // Fetch purchase returns with same filters
      const returns = await PurchaseReturn.findAll({
        where: whereClause,
        include: [
          {
            model: Purchase,
            as: 'purchase',
            include: [{ model: Customer, as: 'supplier', attributes: ['id', 'name', 'email'] }],
          },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: PurchaseReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Transform returns to have negative values and add type flag
      const transformedReturns = returns.map((ret) => ({
        id: ret.id,
        orderNumber: ret.returnNumber,
        type: 'return',
        originalOrderNumber: ret.purchase?.orderNumber,
        createdAt: ret.createdAt,
        updatedAt: ret.updatedAt,
        supplier: ret.purchase?.supplier,
        user: ret.user,
        status: ret.status,
        subtotal: -parseFloat(ret.subtotal),
        discountPercent: parseFloat(ret.discountPercent || 0),
        discountAmount: -parseFloat(ret.discountAmount || 0),
        tax: -parseFloat(ret.tax),
        total: -parseFloat(ret.total),
        notes: ret.notes,
        reason: ret.reason,
        items: (ret.items || []).map((item) => ({
          id: item.id,
          productId: item.productId,
          product: item.product,
          quantity: -item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          discountPercent: parseFloat(item.discountPercent || 0),
          discountAmount: -parseFloat(item.discountAmount || 0),
          total: -parseFloat(item.total),
        })),
      }));

      // Add type flag to purchases
      const transformedPurchases = purchases.map((purchase) => ({
        ...purchase.toJSON(),
        type: 'purchase',
      }));

      // Combine purchases and returns
      const allTransactions = [...transformedPurchases, ...transformedReturns].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      // Calculate summary (returns reduce the totals)
      const summary = {
        totalOrders: purchases.length,
        totalReturns: returns.length,
        totalAmount: purchases.reduce((sum, purchase) => sum + parseFloat(purchase.total), 0),
        returnAmount: returns.reduce((sum, ret) => sum + parseFloat(ret.total), 0),
        netAmount: purchases.reduce((sum, purchase) => sum + parseFloat(purchase.total), 0) -
                   returns.reduce((sum, ret) => sum + parseFloat(ret.total), 0),
        totalTax: purchases.reduce((sum, purchase) => sum + parseFloat(purchase.tax), 0) -
                  returns.reduce((sum, ret) => sum + parseFloat(ret.tax), 0),
        totalItemDiscounts: purchases.reduce((sum, purchase) =>
          sum + purchase.items.reduce((itemSum, item) =>
            itemSum + parseFloat(item.discountAmount || 0), 0), 0) -
          returns.reduce((sum, ret) =>
            sum + ret.items.reduce((itemSum, item) =>
              itemSum + parseFloat(item.discountAmount || 0), 0), 0),
        totalOrderDiscounts: purchases.reduce((sum, purchase) =>
          sum + parseFloat(purchase.discountAmount || 0), 0) -
          returns.reduce((sum, ret) =>
            sum + parseFloat(ret.discountAmount || 0), 0),
        byStatus: {},
      };

      // Group by status (purchases)
      purchases.forEach((purchase) => {
        if (!summary.byStatus[purchase.status]) {
          summary.byStatus[purchase.status] = { count: 0, total: 0 };
        }
        summary.byStatus[purchase.status].count++;
        summary.byStatus[purchase.status].total += parseFloat(purchase.total);
      });

      // Group by status (returns) - separate key
      returns.forEach((ret) => {
        const key = `return-${ret.status}`;
        if (!summary.byStatus[key]) {
          summary.byStatus[key] = { count: 0, total: 0 };
        }
        summary.byStatus[key].count++;
        summary.byStatus[key].total -= parseFloat(ret.total);
      });

      return ApiResponse.success(res, { purchases: allTransactions, summary }, 'Purchases report retrieved successfully');
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

      // Fetch purchase returns with same filters
      const returns = await PurchaseReturn.findAll({
        where: whereClause,
        include: [
          {
            model: Purchase,
            as: 'purchase',
            include: [{ model: Customer, as: 'supplier', attributes: ['id', 'name', 'email'] }],
          },
          { model: User, as: 'user', attributes: ['id', 'name'] },
          {
            model: PurchaseReturnItem,
            as: 'items',
            include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Build CSV content - one row per item
      const csvHeaders = [
        'Type',
        'Order Number',
        'Original Order',
        'Date',
        'Supplier ID',
        'Supplier',
        'Supplier Email',
        'Status',
        'Item SKU',
        'Item Name',
        'Qty',
        'Unit Price',
        'Item Discount %',
        'Item Discount Amount',
        'Order Discount %',
        'Order Discount Amount',
        'Subtotal',
        'Tax',
        'Total',
        'Created By',
      ];

      const csvRows = [];

      // Add purchases
      purchases.forEach((purchase) => {
        if (purchase.items && purchase.items.length > 0) {
          purchase.items.forEach((item) => {
            csvRows.push([
              'Purchase',
              purchase.orderNumber,
              '',
              new Date(purchase.createdAt).toISOString().split('T')[0],
              purchase.supplier?.id || '',
              purchase.supplier?.name || '',
              purchase.supplier?.email || '',
              purchase.status,
              item.product?.sku || '',
              item.product?.name || '',
              item.quantity,
              parseFloat(item.unitPrice || 0).toFixed(2),
              parseFloat(item.discountPercent || 0).toFixed(2),
              parseFloat(item.discountAmount || 0).toFixed(2),
              parseFloat(purchase.discountPercent || 0).toFixed(2),
              parseFloat(purchase.discountAmount || 0).toFixed(2),
              parseFloat(purchase.subtotal).toFixed(2),
              parseFloat(purchase.tax).toFixed(2),
              parseFloat(purchase.total).toFixed(2),
              purchase.user?.name || '',
            ]);
          });
        } else {
          csvRows.push([
            'Purchase',
            purchase.orderNumber,
            '',
            new Date(purchase.createdAt).toISOString().split('T')[0],
            purchase.supplier?.id || '',
            purchase.supplier?.name || '',
            purchase.supplier?.email || '',
            purchase.status,
            '',
            '',
            '',
            '',
            '',
            '',
            parseFloat(purchase.discountPercent || 0).toFixed(2),
            parseFloat(purchase.discountAmount || 0).toFixed(2),
            parseFloat(purchase.subtotal).toFixed(2),
            parseFloat(purchase.tax).toFixed(2),
            parseFloat(purchase.total).toFixed(2),
            purchase.user?.name || '',
          ]);
        }
      });

      // Add returns (with negative values)
      returns.forEach((ret) => {
        if (ret.items && ret.items.length > 0) {
          ret.items.forEach((item) => {
            csvRows.push([
              'Return',
              ret.returnNumber,
              ret.purchase?.orderNumber || '',
              new Date(ret.createdAt).toISOString().split('T')[0],
              ret.purchase?.supplier?.id || '',
              ret.purchase?.supplier?.name || '',
              ret.purchase?.supplier?.email || '',
              ret.status,
              item.product?.sku || '',
              item.product?.name || '',
              -item.quantity,
              parseFloat(item.unitPrice || 0).toFixed(2),
              parseFloat(item.discountPercent || 0).toFixed(2),
              (-parseFloat(item.discountAmount || 0)).toFixed(2),
              parseFloat(ret.discountPercent || 0).toFixed(2),
              (-parseFloat(ret.discountAmount || 0)).toFixed(2),
              (-parseFloat(ret.subtotal)).toFixed(2),
              (-parseFloat(ret.tax)).toFixed(2),
              (-parseFloat(ret.total)).toFixed(2),
              ret.user?.name || '',
            ]);
          });
        } else {
          csvRows.push([
            'Return',
            ret.returnNumber,
            ret.purchase?.orderNumber || '',
            new Date(ret.createdAt).toISOString().split('T')[0],
            ret.purchase?.supplier?.id || '',
            ret.purchase?.supplier?.name || '',
            ret.purchase?.supplier?.email || '',
            ret.status,
            '',
            '',
            '',
            '',
            '',
            '',
            parseFloat(ret.discountPercent || 0).toFixed(2),
            (-parseFloat(ret.discountAmount || 0)).toFixed(2),
            (-parseFloat(ret.subtotal)).toFixed(2),
            (-parseFloat(ret.tax)).toFixed(2),
            (-parseFloat(ret.total)).toFixed(2),
            ret.user?.name || '',
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
