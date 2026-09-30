const { Customer, Company, Sale, SalesReturn, Purchase, PurchaseReturn, Payment, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, CUSTOMER_TYPE } = require('../utils/constants');
const { getCompanyIdForCreate, evaluateCreditControlAccess } = require('../middleware/companyScope');
const { toCSV, parseCSV } = require('../utils/csv');
const { Op, QueryTypes } = require('sequelize');

/**
 * Assign whichever of customerCode/supplierCode a given `type` needs
 * ("customer"/"both" -> customerCode, "supplier"/"both" -> supplierCode),
 * each from its own per-company running sequence on the Company row
 * (lastCustomerCodeSeq/lastSupplierCodeSeq). Must run inside `transaction`:
 * the increment is a single atomic `UPDATE ... SET col = col + 1`, so
 * Postgres row-locking on that statement serializes concurrent assignments
 * for the same company - no two rows in one company can ever get the same
 * code, and rolling back the transaction (e.g. a failed Customer.create)
 * rolls back the increment too.
 */
const assignNextCodes = async (type, companyId, transaction) => {
  const codes = {};

  if (type === CUSTOMER_TYPE.CUSTOMER || type === CUSTOMER_TYPE.BOTH) {
    await Company.increment('lastCustomerCodeSeq', { by: 1, where: { id: companyId }, transaction });
    const company = await Company.findByPk(companyId, { transaction });
    codes.customerCode = `Cus${String(company.lastCustomerCodeSeq).padStart(5, '0')}`;
  }

  if (type === CUSTOMER_TYPE.SUPPLIER || type === CUSTOMER_TYPE.BOTH) {
    await Company.increment('lastSupplierCodeSeq', { by: 1, where: { id: companyId }, transaction });
    const company = await Company.findByPk(companyId, { transaction });
    codes.supplierCode = `Sup${String(company.lastSupplierCodeSeq).padStart(5, '0')}`;
  }

  return codes;
};

// Correlated scalar subqueries used only for `ORDER BY` when sorting the
// Customers/Suppliers list by the computed Balance column - the same
// outstanding-balance formula as _computeBatchCreditBalances (excludes
// cancelled/pending orders), just expressed inline against the main
// query's own row ("Customer"."id" - the alias Sequelize gives the model's
// own table) instead of a batch of already-fetched ids. Needed because
// sorting by a computed value means Postgres must rank the whole matching
// set before paginating, not just the current page's rows.
const AR_BALANCE_SORT_SQL = `(
  COALESCE((SELECT SUM(s.total) FROM sales s WHERE s."customerId" = "Customer"."id" AND s.status NOT IN ('cancelled', 'pending')), 0)
  - COALESCE((SELECT SUM(sr.total) FROM sales_returns sr JOIN sales sale ON sale.id = sr."saleId" WHERE sale."customerId" = "Customer"."id" AND sr.status != 'cancelled' AND sale.status NOT IN ('cancelled', 'pending')), 0)
  - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."customerId" = "Customer"."id" AND p.direction = 'received'), 0)
)`;

const AP_BALANCE_SORT_SQL = `(
  COALESCE((SELECT SUM(pu.total) FROM purchases pu WHERE pu."supplierId" = "Customer"."id" AND pu.status NOT IN ('cancelled', 'pending')), 0)
  - COALESCE((SELECT SUM(pr.total) FROM purchase_returns pr JOIN purchases purchase ON purchase.id = pr."purchaseId" WHERE purchase."supplierId" = "Customer"."id" AND pr.status != 'cancelled' AND purchase.status NOT IN ('cancelled', 'pending')), 0)
  - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."customerId" = "Customer"."id" AND p.direction = 'paid'), 0)
)`;

class CustomersController {
  /**
   * Get all customers
   * GET /api/customers
   * Query params: type (customer, supplier, both)
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
      const type = req.query.type || '';

      // Add company filter
      const whereClause = { ...req.companyFilter };

      // Filter by status
      const status = req.query.status || '';
      if (status) {
        whereClause.status = status;
      }

      // Filter by type
      if (type === 'customer') {
        whereClause.type = { [Op.in]: ['customer', 'both'] };
      } else if (type === 'supplier') {
        whereClause.type = { [Op.in]: ['supplier', 'both'] };
      }

      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
          { city: { [Op.iLike]: `%${search}%` } },
          { customerCode: { [Op.iLike]: `%${search}%` } },
          { supplierCode: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder || 'DESC';

      // Balance is computed, not a real column - sorting by it means
      // ranking the whole matching set via a correlated subquery, not just
      // the current page. Only honored with Credit Control access; without
      // it the column isn't shown at all, so falls back to the default sort
      // rather than erroring.
      const { allowed } = await evaluateCreditControlAccess(req);
      let order;
      if (sortBy === 'balance' && allowed) {
        const balanceSql = type === 'customer' ? AR_BALANCE_SORT_SQL : AP_BALANCE_SORT_SQL;
        order = [[sequelize.literal(balanceSql), sortOrder]];
      } else if (sortBy === 'company') {
        order = [[{ model: Company, as: 'company' }, 'name', sortOrder]];
      } else if (sortBy === 'balance') {
        order = [['createdAt', 'DESC']];
      } else {
        order = [[sortBy, sortOrder]];
      }

      const { count, rows } = await Customer.findAndCountAll({
        where: whereClause,
        include: [{ model: Company, as: 'company' }],
        order,
        limit,
        offset,
      });

      // Attach this page's outstanding/overdue balance to each row, in a
      // fixed handful of grouped queries (not one per row) - only when the
      // caller actually has Credit Control access, so the list stays cheap
      // for everyone else.
      let responseRows = rows;
      if (allowed && rows.length > 0) {
        const balances = await CustomersController._computeBatchCreditBalances(rows.map((r) => r.id));
        responseRows = rows.map((r) => {
          const balance = balances.get(r.id) || { outstandingReceivable: 0, outstandingPayable: 0, overdueReceivable: 0, overduePayable: 0 };
          const hasTerm = r.creditTermDays !== null && r.creditTermDays !== undefined;
          return {
            ...r.toJSON(),
            outstandingReceivable: balance.outstandingReceivable,
            outstandingPayable: balance.outstandingPayable,
            overdueReceivable: hasTerm ? balance.overdueReceivable : null,
            overduePayable: hasTerm ? balance.overduePayable : null,
          };
        });
      }

      const pagination = {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      };

      return ApiResponse.paginated(res, responseRows, pagination, 'Customers retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create customer
   * POST /api/customers
   */
  static async create(req, res, next) {
    try {
      const companyId = getCompanyIdForCreate(req);

      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      const { name, email, phone, address, city, country, type, status, creditLimit, creditTermDays } = req.body;
      const resolvedType = type || CUSTOMER_TYPE.CUSTOMER;

      const customer = await sequelize.transaction(async (transaction) => {
        const codes = await assignNextCodes(resolvedType, companyId, transaction);
        return Customer.create({
          name,
          email: email || null,
          phone: phone || null,
          address: address || null,
          city: city || null,
          country: country || null,
          type: resolvedType,
          status: status || 'active',
          creditLimit: creditLimit === '' || creditLimit === undefined ? null : creditLimit,
          creditTermDays: creditTermDays === '' || creditTermDays === undefined ? null : creditTermDays,
          companyId,
          ...codes,
        }, { transaction });
      });

      return ApiResponse.created(res, customer, 'Customer created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get customer by ID
   * GET /api/customers/:id
   */
  static async getById(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const customer = await Customer.findOne({ where: whereClause });

      if (!customer) {
        return ApiResponse.notFound(res, 'Customer not found');
      }

      return ApiResponse.success(res, customer, 'Customer retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update customer
   * PUT /api/customers/:id
   */
  static async update(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const customer = await Customer.findOne({ where: whereClause });

      if (!customer) {
        return ApiResponse.notFound(res, 'Customer not found');
      }

      const { name, email, phone, address, city, country, type, status, creditLimit, creditTermDays } = req.body;
      const updates = {};

      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email || null;
      if (phone !== undefined) updates.phone = phone || null;
      if (address !== undefined) updates.address = address || null;
      if (city !== undefined) updates.city = city || null;
      if (country !== undefined) updates.country = country || null;
      if (type !== undefined) updates.type = type;
      if (status !== undefined) updates.status = status;
      if (creditLimit !== undefined) updates.creditLimit = creditLimit === '' ? null : creditLimit;
      if (creditTermDays !== undefined) updates.creditTermDays = creditTermDays === '' ? null : creditTermDays;

      // If type is changing to add a role (e.g. customer -> both) that doesn't have
      // a code yet, assign it now. The web UI never sends `type` on update today,
      // but the API accepts it, so this keeps that path from silently leaving a
      // role without a code.
      if (type !== undefined && type !== customer.type) {
        await sequelize.transaction(async (transaction) => {
          const needsCustomerCode =
            (type === CUSTOMER_TYPE.CUSTOMER || type === CUSTOMER_TYPE.BOTH) && !customer.customerCode;
          const needsSupplierCode =
            (type === CUSTOMER_TYPE.SUPPLIER || type === CUSTOMER_TYPE.BOTH) && !customer.supplierCode;

          if (needsCustomerCode || needsSupplierCode) {
            const missingType = needsCustomerCode && needsSupplierCode
              ? CUSTOMER_TYPE.BOTH
              : (needsCustomerCode ? CUSTOMER_TYPE.CUSTOMER : CUSTOMER_TYPE.SUPPLIER);
            Object.assign(updates, await assignNextCodes(missingType, customer.companyId, transaction));
          }

          await customer.update(updates, { transaction });
        });
      } else {
        await customer.update(updates);
      }

      return ApiResponse.success(res, customer, 'Customer updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle customer status (active/inactive)
   * PATCH /api/customers/:id/status
   */
  static async toggleStatus(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const customer = await Customer.findOne({ where: whereClause });

      if (!customer) {
        return ApiResponse.notFound(res, 'Customer not found');
      }

      const newStatus = customer.status === 'active' ? 'inactive' : 'active';
      await customer.update({ status: newStatus });

      return ApiResponse.success(res, customer, `Customer ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk import customers from CSV
   * POST /api/customers/import
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

      const headerRow = rows[0].map((h) => h.trim().toLowerCase());
      const dataRows = rows.slice(1);

      if (dataRows.length === 0) {
        return ApiResponse.badRequest(res, 'CSV file has no data rows');
      }

      const MAX_ROWS = 1000;
      if (dataRows.length > MAX_ROWS) {
        return ApiResponse.badRequest(res, `CSV file exceeds the maximum of ${MAX_ROWS} rows`);
      }

      const indexes = {
        name: headerRow.indexOf('name'),
        email: headerRow.indexOf('email'),
        phone: headerRow.indexOf('phone'),
        address: headerRow.indexOf('address'),
        city: headerRow.indexOf('city'),
        country: headerRow.indexOf('country'),
      };

      if (indexes.name === -1) {
        return ApiResponse.badRequest(res, 'CSV must include a "Name" column');
      }

      const getValue = (row, key) => {
        const idx = indexes[key];
        if (idx === -1 || idx >= row.length) return '';
        return (row[idx] || '').trim();
      };

      // Type is fixed for the whole import batch (Customers vs Suppliers module), not per-row
      const type = Object.values(CUSTOMER_TYPE).includes(req.body.type) ? req.body.type : CUSTOMER_TYPE.CUSTOMER;

      let created = 0;
      const errors = [];

      for (let i = 0; i < dataRows.length; i++) {
        const rowNumber = i + 2; // +1 for header row, +1 for 1-based numbering
        const row = dataRows[i];

        const name = getValue(row, 'name');
        if (!name) {
          errors.push({ row: rowNumber, message: 'Name is required' });
          continue;
        }

        const email = getValue(row, 'email');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push({ row: rowNumber, message: 'Invalid email format' });
          continue;
        }

        try {
          await sequelize.transaction(async (transaction) => {
            const codes = await assignNextCodes(type, companyId, transaction);
            return Customer.create({
              name,
              email: email || null,
              phone: getValue(row, 'phone') || null,
              address: getValue(row, 'address') || null,
              city: getValue(row, 'city') || null,
              country: getValue(row, 'country') || null,
              type,
              status: 'active',
              companyId,
              ...codes,
            }, { transaction });
          });
          created++;
        } catch (err) {
          errors.push({ row: rowNumber, message: err.errors?.[0]?.message || err.message || 'Failed to create customer' });
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
   * Export customers to CSV
   * GET /api/customers/export
   */
  static async exportCSV(req, res, next) {
    try {
      const search = req.query.search || '';
      const type = req.query.type || '';
      const status = req.query.status || '';

      const whereClause = { ...req.companyFilter };

      if (status) {
        whereClause.status = status;
      }

      if (type === 'customer') {
        whereClause.type = { [Op.in]: ['customer', 'both'] };
      } else if (type === 'supplier') {
        whereClause.type = { [Op.in]: ['supplier', 'both'] };
      }

      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
          { city: { [Op.iLike]: `%${search}%` } },
          { customerCode: { [Op.iLike]: `%${search}%` } },
          { supplierCode: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const customers = await Customer.findAll({
        where: whereClause,
        order: [['name', 'ASC']],
      });

      // A single, contextual "Code" column when the list is filtered to one
      // type - matching how the same page's table and Add/Edit modal already
      // show it (type === 'customer' ? customerCode : supplierCode). Falls
      // back to showing both columns when unfiltered (not reachable from the
      // UI today, but a contact of type 'both' has both codes, and this
      // endpoint doesn't require a type param), so no code is silently lost.
      const codeHeaders = type === 'customer' || type === 'supplier' ? ['Code'] : ['Customer Code', 'Supplier Code'];
      const codeValues = (customer) => {
        if (type === 'customer') return [customer.customerCode || ''];
        if (type === 'supplier') return [customer.supplierCode || ''];
        return [customer.customerCode || '', customer.supplierCode || ''];
      };

      const headers = ['ID', ...codeHeaders, 'Name', 'Email', 'Phone', 'Address', 'City', 'Country', 'Type', 'Status', 'Created At'];
      const rows = customers.map((customer) => [
        customer.id,
        ...codeValues(customer),
        customer.name,
        customer.email || '',
        customer.phone || '',
        customer.address || '',
        customer.city || '',
        customer.country || '',
        customer.type,
        customer.status,
        new Date(customer.createdAt).toLocaleDateString(),
      ]);

      const csvContent = toCSV(headers, rows);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=customers-${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Compute a customer/supplier's Credit Control status: how much they
   * currently owe us (AR, relevant when type is customer/both) and how much
   * we owe them (AP, relevant when type is supplier/both), each net of
   * payments already recorded. Excludes both `cancelled` and `pending`
   * orders from both sums - a pending order isn't a real receivable/payable
   * yet (it can still be cancelled with no consequence, and Record Payment
   * is disabled for it - see SaleDetails.jsx/PurchaseDetails.jsx), so it
   * shouldn't count toward what's owed until it's actually confirmed.
   *
   * Also computes overdue AR/AP when the customer has a `creditTermDays` set
   * (null otherwise - no term means "not tracked", not "zero overdue").
   * overdue = max(0, grossOverdueOrders - totalPayments), which is
   * mathematically equivalent to walking the ledger oldest-order-first and
   * applying each payment to the oldest unpaid order first (FIFO), given
   * credit terms are constant per customer: every overdue order is, by
   * definition, older than every not-yet-due order, so a payment can never
   * "skip" an overdue order to pay a newer one before it.
   */
  static async _computeCreditStatus(customer) {
    const { id: customerId, companyId, creditLimit, creditTermDays } = customer;
    const activeOrderStatus = { [Op.notIn]: ['cancelled', 'pending'] };

    // The `include` variants join in another model that also has a `total`
    // column (Sale/Purchase), so the aggregated column must be qualified
    // (`SalesReturn.total`, not bare `total`) or Postgres rejects the query
    // with "column reference is ambiguous".
    const [salesTotal, salesReturnsTotal, receivedTotal, purchasesTotal, purchaseReturnsTotal, paidTotal] = await Promise.all([
      Sale.sum('total', { where: { customerId, companyId, status: activeOrderStatus } }),
      SalesReturn.sum('SalesReturn.total', {
        where: { companyId, status: { [Op.ne]: 'cancelled' } },
        include: [{ model: Sale, as: 'sale', where: { customerId, status: activeOrderStatus }, attributes: [] }],
      }),
      Payment.sum('amount', { where: { customerId, companyId, direction: 'received' } }),
      Purchase.sum('total', { where: { supplierId: customerId, companyId, status: activeOrderStatus } }),
      PurchaseReturn.sum('PurchaseReturn.total', {
        where: { companyId, status: { [Op.ne]: 'cancelled' } },
        include: [{ model: Purchase, as: 'purchase', where: { supplierId: customerId, status: activeOrderStatus }, attributes: [] }],
      }),
      Payment.sum('amount', { where: { customerId, companyId, direction: 'paid' } }),
    ]);

    const outstandingReceivable = (salesTotal || 0) - (salesReturnsTotal || 0) - (receivedTotal || 0);
    const outstandingPayable = (purchasesTotal || 0) - (purchaseReturnsTotal || 0) - (paidTotal || 0);
    const limit = creditLimit === null || creditLimit === undefined ? null : parseFloat(creditLimit);
    const term = creditTermDays === null || creditTermDays === undefined ? null : parseInt(creditTermDays);

    let overdueReceivable = null;
    let overduePayable = null;

    if (term !== null) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - term);

      const [overdueSalesTotal, overdueSalesReturnsTotal, overduePurchasesTotal, overduePurchaseReturnsTotal] = await Promise.all([
        Sale.sum('total', { where: { customerId, companyId, status: activeOrderStatus, createdAt: { [Op.lte]: cutoff } } }),
        SalesReturn.sum('SalesReturn.total', {
          where: { companyId, status: { [Op.ne]: 'cancelled' } },
          include: [{ model: Sale, as: 'sale', where: { customerId, status: activeOrderStatus, createdAt: { [Op.lte]: cutoff } }, attributes: [] }],
        }),
        Purchase.sum('total', { where: { supplierId: customerId, companyId, status: activeOrderStatus, createdAt: { [Op.lte]: cutoff } } }),
        PurchaseReturn.sum('PurchaseReturn.total', {
          where: { companyId, status: { [Op.ne]: 'cancelled' } },
          include: [{ model: Purchase, as: 'purchase', where: { supplierId: customerId, status: activeOrderStatus, createdAt: { [Op.lte]: cutoff } }, attributes: [] }],
        }),
      ]);

      const grossOverdueReceivable = (overdueSalesTotal || 0) - (overdueSalesReturnsTotal || 0);
      const grossOverduePayable = (overduePurchasesTotal || 0) - (overduePurchaseReturnsTotal || 0);
      overdueReceivable = Math.max(0, grossOverdueReceivable - (receivedTotal || 0));
      overduePayable = Math.max(0, grossOverduePayable - (paidTotal || 0));
    }

    return {
      creditLimit: limit,
      creditTermDays: term,
      outstandingReceivable,
      outstandingPayable,
      overdueReceivable,
      overduePayable,
      availableReceivable: limit === null ? null : limit - outstandingReceivable,
      availablePayable: limit === null ? null : limit - outstandingPayable,
    };
  }

  /**
   * Batched equivalent of _computeCreditStatus's outstanding-balance halves,
   * for a whole page of customers at once (used by getAll). A fixed set of
   * 5 grouped SQL queries regardless of how many customers are on the page -
   * not one round-trip per row. Overdue figures use each customer's own
   * creditTermDays via a JOIN (make_interval), since the term varies per
   * customer and can't be baked into a single shared WHERE clause.
   *
   * Excludes both 'cancelled' and 'pending' orders, same as
   * _computeCreditStatus - a pending order isn't owed yet.
   */
  static async _computeBatchCreditBalances(customerIds) {
    const balances = new Map();
    if (customerIds.length === 0) return balances;

    const replacements = { customerIds };
    const activeStatusFilter = `NOT IN ('cancelled', 'pending')`;

    const [salesRows, salesReturnRows, paymentRows, purchaseRows, purchaseReturnRows] = await Promise.all([
      sequelize.query(
        `SELECT s."customerId" AS id,
                COALESCE(SUM(s.total), 0) AS "salesTotal",
                COALESCE(SUM(CASE WHEN c."creditTermDays" IS NOT NULL AND s."createdAt" <= NOW() - make_interval(days => c."creditTermDays") THEN s.total ELSE 0 END), 0) AS "overdueSalesTotal"
         FROM sales s
         JOIN customers c ON c.id = s."customerId"
         WHERE s."customerId" IN (:customerIds) AND s.status ${activeStatusFilter}
         GROUP BY s."customerId"`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT sale."customerId" AS id,
                COALESCE(SUM(sr.total), 0) AS "returnsTotal",
                COALESCE(SUM(CASE WHEN c."creditTermDays" IS NOT NULL AND sale."createdAt" <= NOW() - make_interval(days => c."creditTermDays") THEN sr.total ELSE 0 END), 0) AS "overdueReturnsTotal"
         FROM sales_returns sr
         JOIN sales sale ON sale.id = sr."saleId"
         JOIN customers c ON c.id = sale."customerId"
         WHERE sale."customerId" IN (:customerIds) AND sr.status != 'cancelled' AND sale.status ${activeStatusFilter}
         GROUP BY sale."customerId"`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT "customerId" AS id, direction, COALESCE(SUM(amount), 0) AS total
         FROM payments
         WHERE "customerId" IN (:customerIds)
         GROUP BY "customerId", direction`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT p."supplierId" AS id,
                COALESCE(SUM(p.total), 0) AS "purchasesTotal",
                COALESCE(SUM(CASE WHEN c."creditTermDays" IS NOT NULL AND p."createdAt" <= NOW() - make_interval(days => c."creditTermDays") THEN p.total ELSE 0 END), 0) AS "overduePurchasesTotal"
         FROM purchases p
         JOIN customers c ON c.id = p."supplierId"
         WHERE p."supplierId" IN (:customerIds) AND p.status ${activeStatusFilter}
         GROUP BY p."supplierId"`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT purchase."supplierId" AS id,
                COALESCE(SUM(pr.total), 0) AS "returnsTotal",
                COALESCE(SUM(CASE WHEN c."creditTermDays" IS NOT NULL AND purchase."createdAt" <= NOW() - make_interval(days => c."creditTermDays") THEN pr.total ELSE 0 END), 0) AS "overdueReturnsTotal"
         FROM purchase_returns pr
         JOIN purchases purchase ON purchase.id = pr."purchaseId"
         JOIN customers c ON c.id = purchase."supplierId"
         WHERE purchase."supplierId" IN (:customerIds) AND pr.status != 'cancelled' AND purchase.status ${activeStatusFilter}
         GROUP BY purchase."supplierId"`,
        { replacements, type: QueryTypes.SELECT }
      ),
    ]);

    const raw = new Map();
    const bucket = (id) => {
      if (!raw.has(id)) {
        raw.set(id, {
          salesTotal: 0, overdueSalesTotal: 0,
          salesReturnsTotal: 0, overdueSalesReturnsTotal: 0,
          received: 0, paid: 0,
          purchasesTotal: 0, overduePurchasesTotal: 0,
          purchaseReturnsTotal: 0, overduePurchaseReturnsTotal: 0,
        });
      }
      return raw.get(id);
    };

    salesRows.forEach((r) => Object.assign(bucket(r.id), { salesTotal: parseFloat(r.salesTotal), overdueSalesTotal: parseFloat(r.overdueSalesTotal) }));
    salesReturnRows.forEach((r) => Object.assign(bucket(r.id), { salesReturnsTotal: parseFloat(r.returnsTotal), overdueSalesReturnsTotal: parseFloat(r.overdueReturnsTotal) }));
    paymentRows.forEach((r) => {
      const b = bucket(r.id);
      if (r.direction === 'received') b.received = parseFloat(r.total);
      else b.paid = parseFloat(r.total);
    });
    purchaseRows.forEach((r) => Object.assign(bucket(r.id), { purchasesTotal: parseFloat(r.purchasesTotal), overduePurchasesTotal: parseFloat(r.overduePurchasesTotal) }));
    purchaseReturnRows.forEach((r) => Object.assign(bucket(r.id), { purchaseReturnsTotal: parseFloat(r.returnsTotal), overduePurchaseReturnsTotal: parseFloat(r.overdueReturnsTotal) }));

    for (const [id, b] of raw) {
      balances.set(id, {
        outstandingReceivable: b.salesTotal - b.salesReturnsTotal - b.received,
        outstandingPayable: b.purchasesTotal - b.purchaseReturnsTotal - b.paid,
        overdueReceivable: Math.max(0, (b.overdueSalesTotal - b.overdueSalesReturnsTotal) - b.received),
        overduePayable: Math.max(0, (b.overduePurchasesTotal - b.overduePurchaseReturnsTotal) - b.paid),
      });
    }
    return balances;
  }

  /**
   * Get Credit Control status for a customer/supplier
   * GET /api/customers/:id/credit-status
   */
  static async getCreditStatus(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const customer = await Customer.findOne({ where: whereClause });

      if (!customer) {
        return ApiResponse.notFound(res, 'Customer not found');
      }

      const status = await CustomersController._computeCreditStatus(customer);

      return ApiResponse.success(res, status, 'Credit status retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete customer
   * DELETE /api/customers/:id
   */
  static async delete(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };
      const customer = await Customer.findOne({ where: whereClause });

      if (!customer) {
        return ApiResponse.notFound(res, 'Customer not found');
      }

      await customer.destroy();

      return ApiResponse.success(res, null, 'Customer deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CustomersController;
