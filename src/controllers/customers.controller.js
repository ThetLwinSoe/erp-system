const { Customer } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, CUSTOMER_TYPE } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { toCSV, parseCSV } = require('../utils/csv');
const { Op } = require('sequelize');

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
        ];
      }

      const { count, rows } = await Customer.findAndCountAll({
        where: whereClause,
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

      return ApiResponse.paginated(res, rows, pagination, 'Customers retrieved successfully');
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

      const { name, email, phone, address, city, country, type, status } = req.body;

      const customer = await Customer.create({
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        country: country || null,
        type: type || CUSTOMER_TYPE.CUSTOMER,
        status: status || 'active',
        companyId,
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

      const { name, email, phone, address, city, country, type, status } = req.body;
      const updates = {};

      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email || null;
      if (phone !== undefined) updates.phone = phone || null;
      if (address !== undefined) updates.address = address || null;
      if (city !== undefined) updates.city = city || null;
      if (country !== undefined) updates.country = country || null;
      if (type !== undefined) updates.type = type;
      if (status !== undefined) updates.status = status;

      await customer.update(updates);

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
        type: headerRow.indexOf('type'),
      };

      if (indexes.name === -1) {
        return ApiResponse.badRequest(res, 'CSV must include a "Name" column');
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

        const type = getValue(row, 'type').toLowerCase() || CUSTOMER_TYPE.CUSTOMER;
        if (!Object.values(CUSTOMER_TYPE).includes(type)) {
          errors.push({ row: rowNumber, message: `Invalid type "${type}" (expected customer, supplier, or both)` });
          continue;
        }

        try {
          await Customer.create({
            name,
            email: email || null,
            phone: getValue(row, 'phone') || null,
            address: getValue(row, 'address') || null,
            city: getValue(row, 'city') || null,
            country: getValue(row, 'country') || null,
            type,
            status: 'active',
            companyId,
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
        ];
      }

      const customers = await Customer.findAll({
        where: whereClause,
        order: [['name', 'ASC']],
      });

      const headers = ['ID', 'Name', 'Email', 'Phone', 'Address', 'City', 'Country', 'Type', 'Status', 'Created At'];
      const rows = customers.map((customer) => [
        customer.id,
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
