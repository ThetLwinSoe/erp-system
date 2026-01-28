const { Customer } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION } = require('../utils/constants');
const { Op } = require('sequelize');

class CustomersController {
  /**
   * Get all customers
   * GET /api/customers
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

      const whereClause = search
        ? {
            [Op.or]: [
              { name: { [Op.iLike]: `%${search}%` } },
              { email: { [Op.iLike]: `%${search}%` } },
              { phone: { [Op.iLike]: `%${search}%` } },
              { city: { [Op.iLike]: `%${search}%` } },
            ],
          }
        : {};

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
      const { name, email, phone, address, city, country } = req.body;

      const customer = await Customer.create({
        name,
        email,
        phone,
        address,
        city,
        country,
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
      const customer = await Customer.findByPk(req.params.id);

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
      const customer = await Customer.findByPk(req.params.id);

      if (!customer) {
        return ApiResponse.notFound(res, 'Customer not found');
      }

      const { name, email, phone, address, city, country } = req.body;
      const updates = {};

      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (address !== undefined) updates.address = address;
      if (city !== undefined) updates.city = city;
      if (country !== undefined) updates.country = country;

      await customer.update(updates);

      return ApiResponse.success(res, customer, 'Customer updated successfully');
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
      const customer = await Customer.findByPk(req.params.id);

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
