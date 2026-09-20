const { Sale, SaleItem, SalesReturn, SalesReturnItem, Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem, Customer, User, Product, InventoryAdjustment, InventoryAdjustmentItem, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { toCSV } = require('../utils/csv');
const { Op } = require('sequelize');
const { ROLES, CUSTOMER_TYPE } = require('../utils/constants');

class ReportsController {
  /**
   * Prorate an order-level discount amount and tax down to one line item, by that
   * item's share of the order subtotal (itemTotal / orderSubtotal). Sign-agnostic -
   * works identically whether given raw (sale/purchase) or already-negated (return)
   * values, since proration is just multiplication by a ratio.
   */
  static _prorateItemAmounts(itemTotal, orderSubtotal, orderDiscountAmount, orderTax) {
    const subtotal = parseFloat(itemTotal) || 0;
    const parsedOrderSubtotal = parseFloat(orderSubtotal) || 0;
    const shareOfOrder = parsedOrderSubtotal !== 0 ? subtotal / parsedOrderSubtotal : 0;
    const itemOrderDiscountAmount = (parseFloat(orderDiscountAmount) || 0) * shareOfOrder;
    const itemTax = (parseFloat(orderTax) || 0) * shareOfOrder;
    const total = subtotal - itemOrderDiscountAmount + itemTax;
    return { itemSubtotal: subtotal, itemOrderDiscountAmount, itemTax, itemTotal: total };
  }

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

      // Status filter - exclude pending and cancelled by default
      if (status) {
        whereClause.status = status;
      } else {
        // By default, exclude pending and cancelled transactions
        whereClause.status = {
          [Op.notIn]: ['pending', 'cancelled']
        };
      }

      // Customer filter - applied directly to Sale (has a customerId column), and via
      // the nested Sale include below for SalesReturn, which has no customerId column
      // of its own (only saleId) - the customer relationship there is indirect.
      const salesWhereClause = { ...whereClause };
      if (customerId) {
        salesWhereClause.customerId = parseInt(customerId);
      }

      const sales = await Sale.findAll({
        where: salesWhereClause,
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'email', 'customerCode'] },
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
            where: customerId ? { customerId: parseInt(customerId) } : undefined,
            required: !!customerId,
            include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'email', 'customerCode'] }],
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
        items: (ret.items || []).map((item) => {
          const { itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
            item.total, ret.subtotal, ret.discountAmount, ret.tax
          );
          return {
            id: item.id,
            productId: item.productId,
            product: item.product,
            quantity: -item.quantity, // Negative quantity
            focQuantity: -(item.focQuantity || 0), // Negative FOC quantity
            unitPrice: parseFloat(item.unitPrice), // Price stays positive
            discountPercent: parseFloat(item.discountPercent || 0),
            discountAmount: -parseFloat(item.discountAmount || 0), // Negative discount amount
            total: -parseFloat(item.total), // Negative total
            // Per-line share of the order-level discount/tax/total (negated, matching returns convention)
            itemSubtotal: -parseFloat(item.total),
            itemOrderDiscountAmount: -itemOrderDiscountAmount,
            itemTax: -itemTax,
            itemTotal: -itemTotal,
          };
        }),
      }));

      // Add type flag to sales, with each item's prorated share of the order-level discount/tax
      const transformedSales = sales.map((sale) => {
        const saleJson = sale.toJSON();
        return {
          ...saleJson,
          type: 'sale',
          items: (saleJson.items || []).map((item) => {
            const { itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
              item.total, saleJson.subtotal, saleJson.discountAmount, saleJson.tax
            );
            return {
              ...item,
              itemSubtotal: parseFloat(item.total),
              itemOrderDiscountAmount,
              itemTax,
              itemTotal,
            };
          }),
        };
      });

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

      // Status filter - exclude pending and cancelled by default
      if (status) {
        whereClause.status = status;
      } else {
        // By default, exclude pending and cancelled transactions
        whereClause.status = {
          [Op.notIn]: ['pending', 'cancelled']
        };
      }

      // Customer filter - applied directly to Sale (has a customerId column), and via
      // the nested Sale include below for SalesReturn, which has no customerId column
      // of its own (only saleId) - the customer relationship there is indirect.
      const salesWhereClause = { ...whereClause };
      if (customerId) {
        salesWhereClause.customerId = parseInt(customerId);
      }

      const sales = await Sale.findAll({
        where: salesWhereClause,
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'email', 'customerCode'] },
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
            where: customerId ? { customerId: parseInt(customerId) } : undefined,
            required: !!customerId,
            include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'email', 'customerCode'] }],
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
        'Customer Code',
        'Customer',
        'Customer Email',
        'Status',
        'Item SKU',
        'Item Name',
        'Qty',
        'FOC Qty',
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
            const { itemSubtotal, itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
              item.total, sale.subtotal, sale.discountAmount, sale.tax
            );
            csvRows.push([
              'Sale',
              sale.orderNumber,
              '',
              new Date(sale.createdAt).toISOString().split('T')[0],
              sale.customer?.id || '',
              sale.customer?.customerCode || '',
              sale.customer?.name || '',
              sale.customer?.email || '',
              sale.status,
              item.product?.sku || '',
              item.product?.name || '',
              item.quantity,
              item.focQuantity || 0,
              parseFloat(item.unitPrice || 0).toFixed(2),
              parseFloat(item.discountPercent || 0).toFixed(2),
              parseFloat(item.discountAmount || 0).toFixed(2),
              parseFloat(sale.discountPercent || 0).toFixed(2),
              itemOrderDiscountAmount.toFixed(2),
              itemSubtotal.toFixed(2),
              itemTax.toFixed(2),
              itemTotal.toFixed(2),
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
            sale.customer?.customerCode || '',
            sale.customer?.name || '',
            sale.customer?.email || '',
            sale.status,
            '',
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
            const { itemSubtotal, itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
              item.total, ret.subtotal, ret.discountAmount, ret.tax
            );
            csvRows.push([
              'Return',
              ret.returnNumber,
              ret.sale?.orderNumber || '',
              new Date(ret.createdAt).toISOString().split('T')[0],
              ret.sale?.customer?.id || '',
              ret.sale?.customer?.customerCode || '',
              ret.sale?.customer?.name || '',
              ret.sale?.customer?.email || '',
              ret.status,
              item.product?.sku || '',
              item.product?.name || '',
              -item.quantity, // Negative
              -(item.focQuantity || 0), // Negative
              parseFloat(item.unitPrice || 0).toFixed(2), // Positive
              parseFloat(item.discountPercent || 0).toFixed(2),
              (-parseFloat(item.discountAmount || 0)).toFixed(2), // Negative
              parseFloat(ret.discountPercent || 0).toFixed(2),
              (-itemOrderDiscountAmount).toFixed(2), // Negative
              (-itemSubtotal).toFixed(2), // Negative
              (-itemTax).toFixed(2), // Negative
              (-itemTotal).toFixed(2), // Negative
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
            ret.sale?.customer?.customerCode || '',
            ret.sale?.customer?.name || '',
            ret.sale?.customer?.email || '',
            ret.status,
            '',
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

      // Status filter
      if (status) {
        whereClause.status = status;
      }

      // Supplier filter - applied directly to Purchase (has a supplierId column), and
      // via the nested Purchase include below for PurchaseReturn, which has no
      // supplierId column of its own (only purchaseId) - the supplier relationship
      // there is indirect.
      const purchasesWhereClause = { ...whereClause };
      if (supplierId) {
        purchasesWhereClause.supplierId = parseInt(supplierId);
      }

      const purchases = await Purchase.findAll({
        where: purchasesWhereClause,
        include: [
          { model: Customer, as: 'supplier', attributes: ['id', 'name', 'email', 'supplierCode'] },
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
            where: supplierId ? { supplierId: parseInt(supplierId) } : undefined,
            required: !!supplierId,
            include: [{ model: Customer, as: 'supplier', attributes: ['id', 'name', 'email', 'supplierCode'] }],
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
        items: (ret.items || []).map((item) => {
          const { itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
            item.total, ret.subtotal, ret.discountAmount, ret.tax
          );
          return {
            id: item.id,
            productId: item.productId,
            product: item.product,
            quantity: -item.quantity,
            focQuantity: -(item.focQuantity || 0),
            unitPrice: parseFloat(item.unitPrice),
            discountPercent: parseFloat(item.discountPercent || 0),
            discountAmount: -parseFloat(item.discountAmount || 0),
            total: -parseFloat(item.total),
            itemSubtotal: -parseFloat(item.total),
            itemOrderDiscountAmount: -itemOrderDiscountAmount,
            itemTax: -itemTax,
            itemTotal: -itemTotal,
          };
        }),
      }));

      // Add type flag to purchases, with each item's prorated share of the order-level discount/tax
      const transformedPurchases = purchases.map((purchase) => {
        const purchaseJson = purchase.toJSON();
        return {
          ...purchaseJson,
          type: 'purchase',
          items: (purchaseJson.items || []).map((item) => {
            const { itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
              item.total, purchaseJson.subtotal, purchaseJson.discountAmount, purchaseJson.tax
            );
            return {
              ...item,
              itemSubtotal: parseFloat(item.total),
              itemOrderDiscountAmount,
              itemTax,
              itemTotal,
            };
          }),
        };
      });

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

      if (status) {
        whereClause.status = status;
      }

      // Supplier filter - applied directly to Purchase (has a supplierId column), and
      // via the nested Purchase include below for PurchaseReturn, which has no
      // supplierId column of its own (only purchaseId) - the supplier relationship
      // there is indirect.
      const purchasesWhereClause = { ...whereClause };
      if (supplierId) {
        purchasesWhereClause.supplierId = parseInt(supplierId);
      }

      const purchases = await Purchase.findAll({
        where: purchasesWhereClause,
        include: [
          { model: Customer, as: 'supplier', attributes: ['id', 'name', 'email', 'supplierCode'] },
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
            where: supplierId ? { supplierId: parseInt(supplierId) } : undefined,
            required: !!supplierId,
            include: [{ model: Customer, as: 'supplier', attributes: ['id', 'name', 'email', 'supplierCode'] }],
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
        'Supplier Code',
        'Supplier',
        'Supplier Email',
        'Status',
        'Item SKU',
        'Item Name',
        'Qty',
        'FOC Qty',
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
            const { itemSubtotal, itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
              item.total, purchase.subtotal, purchase.discountAmount, purchase.tax
            );
            csvRows.push([
              'Purchase',
              purchase.orderNumber,
              '',
              new Date(purchase.createdAt).toISOString().split('T')[0],
              purchase.supplier?.id || '',
              purchase.supplier?.supplierCode || '',
              purchase.supplier?.name || '',
              purchase.supplier?.email || '',
              purchase.status,
              item.product?.sku || '',
              item.product?.name || '',
              item.quantity,
              item.focQuantity || 0,
              parseFloat(item.unitPrice || 0).toFixed(2),
              parseFloat(item.discountPercent || 0).toFixed(2),
              parseFloat(item.discountAmount || 0).toFixed(2),
              parseFloat(purchase.discountPercent || 0).toFixed(2),
              itemOrderDiscountAmount.toFixed(2),
              itemSubtotal.toFixed(2),
              itemTax.toFixed(2),
              itemTotal.toFixed(2),
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
            purchase.supplier?.supplierCode || '',
            purchase.supplier?.name || '',
            purchase.supplier?.email || '',
            purchase.status,
            '',
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
            const { itemSubtotal, itemOrderDiscountAmount, itemTax, itemTotal } = ReportsController._prorateItemAmounts(
              item.total, ret.subtotal, ret.discountAmount, ret.tax
            );
            csvRows.push([
              'Return',
              ret.returnNumber,
              ret.purchase?.orderNumber || '',
              new Date(ret.createdAt).toISOString().split('T')[0],
              ret.purchase?.supplier?.id || '',
              ret.purchase?.supplier?.supplierCode || '',
              ret.purchase?.supplier?.name || '',
              ret.purchase?.supplier?.email || '',
              ret.status,
              item.product?.sku || '',
              item.product?.name || '',
              -item.quantity,
              -(item.focQuantity || 0), // Negative
              parseFloat(item.unitPrice || 0).toFixed(2),
              parseFloat(item.discountPercent || 0).toFixed(2),
              (-parseFloat(item.discountAmount || 0)).toFixed(2),
              parseFloat(ret.discountPercent || 0).toFixed(2),
              (-itemOrderDiscountAmount).toFixed(2),
              (-itemSubtotal).toFixed(2),
              (-itemTax).toFixed(2),
              (-itemTotal).toFixed(2),
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
            ret.purchase?.supplier?.supplierCode || '',
            ret.purchase?.supplier?.name || '',
            ret.purchase?.supplier?.email || '',
            ret.status,
            '',
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

  /**
   * Compute Profit & Loss figures for a date range.
   *
   * Revenue/COGS use paid quantity only - FOC quantity is deliberately excluded from
   * both, per product decision. Product.costPrice is used for all COGS/adjustment
   * calculations since costs aren't tracked historically per sale - this reflects each
   * product's CURRENT cost, not necessarily what it cost at the time of a past sale.
   */
  static async _computeProfitLoss(companyFilter, startDate, endDate) {
    const dateWhere = {};
    if (startDate || endDate) {
      dateWhere.createdAt = {};
      if (startDate) {
        dateWhere.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateWhere.createdAt[Op.lte] = end;
      }
    }

    const sales = await Sale.findAll({
      where: {
        ...companyFilter,
        ...dateWhere,
        status: { [Op.notIn]: ['pending', 'cancelled'] },
      },
      include: [
        {
          model: SaleItem,
          as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name', 'costPrice'] }],
        },
      ],
    });

    const salesReturns = await SalesReturn.findAll({
      where: {
        ...companyFilter,
        ...dateWhere,
        status: { [Op.ne]: 'cancelled' },
      },
      include: [
        {
          model: SalesReturnItem,
          as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name', 'costPrice'] }],
        },
      ],
    });

    const inventoryAdjustments = await InventoryAdjustment.findAll({
      where: {
        ...companyFilter,
        ...dateWhere,
        status: 'completed',
      },
      include: [
        {
          model: InventoryAdjustmentItem,
          as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name', 'costPrice'] }],
        },
      ],
    });

    const purchases = await Purchase.findAll({
      where: {
        ...companyFilter,
        ...dateWhere,
        status: { [Op.ne]: 'cancelled' },
      },
      attributes: ['id', 'tax'],
    });

    const purchaseReturns = await PurchaseReturn.findAll({
      where: {
        ...companyFilter,
        ...dateWhere,
        status: { [Op.ne]: 'cancelled' },
      },
      attributes: ['id', 'tax'],
    });

    const productMap = new Map();
    const getEntry = (product, productId) => {
      if (!productMap.has(productId)) {
        productMap.set(productId, { product, qtySold: 0, revenue: 0, cogs: 0 });
      }
      return productMap.get(productId);
    };

    let netRevenue = 0;
    let cogs = 0;

    sales.forEach((sale) => {
      netRevenue += parseFloat(sale.subtotal);
      (sale.items || []).forEach((item) => {
        const cost = item.quantity * parseFloat(item.product?.costPrice || 0);
        cogs += cost;
        const entry = getEntry(item.product, item.productId);
        entry.qtySold += item.quantity;
        entry.revenue += parseFloat(item.total);
        entry.cogs += cost;
      });
    });

    salesReturns.forEach((ret) => {
      netRevenue -= parseFloat(ret.subtotal);
      (ret.items || []).forEach((item) => {
        const cost = item.quantity * parseFloat(item.product?.costPrice || 0);
        cogs -= cost;
        const entry = getEntry(item.product, item.productId);
        entry.qtySold -= item.quantity;
        entry.revenue -= parseFloat(item.total);
        entry.cogs -= cost;
      });
    });

    const grossProfit = netRevenue - cogs;
    const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    let inventoryAdjustmentGainLoss = 0;
    inventoryAdjustments.forEach((adjustment) => {
      (adjustment.items || []).forEach((item) => {
        const diffQty = item.quantityAfter - item.quantityBefore;
        inventoryAdjustmentGainLoss += diffQty * parseFloat(item.product?.costPrice || 0);
      });
    });

    const netProfit = grossProfit + inventoryAdjustmentGainLoss;

    let taxCollected = 0;
    sales.forEach((sale) => { taxCollected += parseFloat(sale.tax); });
    salesReturns.forEach((ret) => { taxCollected -= parseFloat(ret.tax); });

    let taxPaid = 0;
    purchases.forEach((purchase) => { taxPaid += parseFloat(purchase.tax); });
    purchaseReturns.forEach((ret) => { taxPaid -= parseFloat(ret.tax); });

    const products = Array.from(productMap.values())
      .map(({ product, qtySold, revenue, cogs: productCogs }) => ({
        productId: product?.id,
        sku: product?.sku || '',
        name: product?.name || '',
        qtySold,
        revenue,
        cogs: productCogs,
        grossProfit: revenue - productCogs,
        marginPercent: revenue > 0 ? ((revenue - productCogs) / revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      summary: {
        netRevenue,
        cogs,
        grossProfit,
        grossMarginPercent,
        inventoryAdjustmentGainLoss,
        netProfit,
        taxCollected,
        taxPaid,
      },
      products,
    };
  }

  /**
   * Get Profit & Loss report
   * GET /api/reports/profit-loss
   * Query params: startDate, endDate
   */
  static async getProfitLossReport(req, res, next) {
    try {
      if (req.user.role === ROLES.SUPERADMIN && !req.query.companyId) {
        return ApiResponse.badRequest(res, 'Please select a company to generate this report');
      }
      const { startDate, endDate } = req.query;
      const result = await ReportsController._computeProfitLoss(req.companyFilter, startDate, endDate);
      return ApiResponse.success(res, { ...result, startDate, endDate }, 'Profit & Loss report retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export Profit & Loss report to CSV
   * GET /api/reports/profit-loss/export
   * Query params: startDate, endDate
   */
  static async exportProfitLossReport(req, res, next) {
    try {
      if (req.user.role === ROLES.SUPERADMIN && !req.query.companyId) {
        return ApiResponse.badRequest(res, 'Please select a company to generate this report');
      }
      const { startDate, endDate } = req.query;
      const { summary, products } = await ReportsController._computeProfitLoss(req.companyFilter, startDate, endDate);

      const fmt = (n) => parseFloat(n || 0).toFixed(2);

      const summaryLines = [
        'Profit & Loss Report',
        `Period,${startDate || 'All time'} to ${endDate || 'All time'}`,
        `Generated,${new Date().toISOString().split('T')[0]}`,
        '',
        `Net Revenue,${fmt(summary.netRevenue)}`,
        `Cost of Goods Sold,${fmt(summary.cogs)}`,
        `Gross Profit,${fmt(summary.grossProfit)}`,
        `Gross Margin %,${fmt(summary.grossMarginPercent)}`,
        `Inventory Adjustment Gain/(Loss),${fmt(summary.inventoryAdjustmentGainLoss)}`,
        `Net Profit,${fmt(summary.netProfit)}`,
        `Tax Collected on Sales,${fmt(summary.taxCollected)}`,
        `Tax Paid on Purchases,${fmt(summary.taxPaid)}`,
        '',
        'Product Breakdown',
      ].join('\n');

      const productHeaders = ['SKU', 'Product', 'Qty Sold', 'Revenue', 'COGS', 'Gross Profit', 'Margin %'];
      const productRows = products.map((p) => [
        p.sku,
        p.name,
        p.qtySold,
        fmt(p.revenue),
        fmt(p.cogs),
        fmt(p.grossProfit),
        fmt(p.marginPercent),
      ]);

      const csvContent = `${summaryLines}\n${toCSV(productHeaders, productRows)}`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=profit-loss-report-${Date.now()}.csv`);
      return res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Computes customers who placed no qualifying Sale (status not pending or
   * cancelled - mirrors the Sales Report's own default status filter) within
   * [startDate, endDate], plus each one's most recent qualifying sale ever
   * (lastOrderDate, null if they've never ordered) for context - without it,
   * "no orders this period" can't be told apart from "never bought at all".
   * For a Sale Rep, "bought" is scoped to sales they personally created,
   * matching how the Sales Report already scopes for that role; the
   * candidate customer list itself stays company-wide (customers aren't
   * rep-owned in this schema).
   *
   * `userId` (optional) lets a non-Sale-Rep caller (superadmin/admin/manager/
   * staff - the same set of roles that see full company data on the Sales
   * Report) filter down to one specific creator's sales, e.g. "which
   * customers has this rep not sold to?" A Sale Rep's own id always
   * overrides it, regardless of what's passed - a Sale Rep must never be
   * able to view another user's scoped data via a crafted query param.
   */
  static async _computeNotBuyingCustomers(req, startDate, endDate, userId) {
    const companyFilter = { ...req.companyFilter };
    const effectiveUserId = req.isSaleRep ? req.user.id : (userId ? parseInt(userId) : null);

    // Candidate pool: active customers capable of buying from us
    const customers = await Customer.findAll({
      where: {
        ...companyFilter,
        type: { [Op.in]: [CUSTOMER_TYPE.CUSTOMER, CUSTOMER_TYPE.BOTH] },
        status: 'active',
      },
      attributes: ['id', 'name', 'customerCode', 'phone', 'email', 'city'],
      raw: true,
    });

    // Sales that count as "bought" within the selected period
    const periodSaleWhere = {
      ...companyFilter,
      status: { [Op.notIn]: ['pending', 'cancelled'] },
    };
    // Built separately and only attached if at least one bound is present -
    // an empty {} isn't "no constraint" to Sequelize, it generates
    // `createdAt = <the exact instant this query runs>`, silently matching
    // zero sales (routes always provide both dates via reportsValidation, so
    // this only matters if this shared helper is ever called without that
    // validation in front).
    const createdAtFilter = {};
    if (startDate) createdAtFilter[Op.gte] = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      createdAtFilter[Op.lte] = end;
    }
    if (startDate || endDate) periodSaleWhere.createdAt = createdAtFilter;
    if (effectiveUserId) periodSaleWhere.userId = effectiveUserId;

    const buyingRows = await Sale.findAll({
      where: periodSaleWhere,
      attributes: ['customerId'],
      group: ['customerId'],
      raw: true,
    });
    const buyingIds = new Set(buyingRows.map((row) => row.customerId));

    const notBuying = customers.filter((customer) => !buyingIds.has(customer.id));

    // Most recent qualifying order ever (no date bound) for the not-buying
    // customers, so the report can show how long they've been dormant.
    let lastOrderByCustomerId = {};
    if (notBuying.length > 0) {
      const lastOrderWhere = {
        ...companyFilter,
        customerId: { [Op.in]: notBuying.map((customer) => customer.id) },
        status: { [Op.notIn]: ['pending', 'cancelled'] },
      };
      if (effectiveUserId) lastOrderWhere.userId = effectiveUserId;

      const lastOrderRows = await Sale.findAll({
        where: lastOrderWhere,
        attributes: ['customerId', [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastOrderDate']],
        group: ['customerId'],
        raw: true,
      });
      lastOrderByCustomerId = lastOrderRows.reduce((map, row) => {
        map[row.customerId] = row.lastOrderDate;
        return map;
      }, {});
    }

    // Most-recently-active first (nulls/never-ordered last) - surfaces the
    // most recoverable, recently-lapsed customers at the top.
    const result = notBuying
      .map((customer) => ({ ...customer, lastOrderDate: lastOrderByCustomerId[customer.id] || null }))
      .sort((a, b) => {
        if (!a.lastOrderDate && !b.lastOrderDate) return 0;
        if (!a.lastOrderDate) return 1;
        if (!b.lastOrderDate) return -1;
        return new Date(b.lastOrderDate) - new Date(a.lastOrderDate);
      });

    return {
      customers: result,
      summary: { totalNotBuying: result.length, totalCandidates: customers.length },
    };
  }

  /**
   * Get customers who placed no qualifying orders within the selected period
   * GET /api/reports/not-buying-customers
   * Query params: startDate, endDate, userId
   */
  static async getNotBuyingCustomersReport(req, res, next) {
    try {
      const { startDate, endDate, userId } = req.query;
      const { customers, summary } = await ReportsController._computeNotBuyingCustomers(req, startDate, endDate, userId);
      return ApiResponse.success(res, { customers, summary }, 'Not buying customers report retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export not buying customers report to CSV
   * GET /api/reports/not-buying-customers/export
   * Query params: startDate, endDate, userId
   */
  static async exportNotBuyingCustomersReport(req, res, next) {
    try {
      const { startDate, endDate, userId } = req.query;
      const { customers } = await ReportsController._computeNotBuyingCustomers(req, startDate, endDate, userId);

      const headers = ['Customer Code', 'Name', 'Phone', 'Email', 'City', 'Last Order Date', 'Days Since Last Order'];
      const rows = customers.map((customer) => {
        const daysSince = customer.lastOrderDate
          ? Math.floor((Date.now() - new Date(customer.lastOrderDate)) / (1000 * 60 * 60 * 24))
          : '';
        return [
          customer.customerCode || '',
          customer.name || '',
          customer.phone || '',
          customer.email || '',
          customer.city || '',
          customer.lastOrderDate ? new Date(customer.lastOrderDate).toISOString().split('T')[0] : 'Never',
          daysSince,
        ];
      });

      const csvContent = toCSV(headers, rows);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=not-buying-customers-${Date.now()}.csv`);
      return res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lightweight user list (id/name only) for the Not Buying Customers
   * report's "Created By" filter. Deliberately not the full /api/users
   * endpoint - that one is admin-only and returns fuller records (email,
   * role, etc.); this is available to every role except Sale Rep (route
   * already blocks Sale Rep via restrictSaleRep) and exposes nothing beyond
   * what the filter dropdown needs.
   * GET /api/reports/report-users
   */
  static async getReportUsers(req, res, next) {
    try {
      const users = await User.findAll({
        where: { ...req.companyFilter },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
        raw: true,
      });
      return ApiResponse.success(res, users, 'Users retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReportsController;
