const { Company, User, Customer, Product, Sale, Purchase, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, ROLES, COMPANY_STATUS } = require('../utils/constants');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');

class CompaniesController {
  /**
   * Get all companies (superadmin only)
   * GET /api/companies
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
      const status = req.query.status || '';

      const whereClause = {};

      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ];
      }

      if (status && Object.values(COMPANY_STATUS).includes(status)) {
        whereClause.status = status;
      }

      const { count, rows } = await Company.findAndCountAll({
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

      return ApiResponse.paginated(res, rows, pagination, 'Companies retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new company with optional admin user
   * POST /api/companies
   */
  static async create(req, res, next) {
    try {
      const { name, address, phone, email, adminUser } = req.body;

      const result = await sequelize.transaction(async (transaction) => {
        const company = await Company.create(
          { name, address, phone, email, status: COMPANY_STATUS.ACTIVE },
          { transaction }
        );

        // Create admin user for the company if provided
        if (adminUser && adminUser.email && adminUser.password && adminUser.name) {
          // Check if email already exists
          const existingUser = await User.findOne({
            where: { email: adminUser.email },
            transaction,
          });

          if (existingUser) {
            throw new Error('Admin user email already exists');
          }

          const hashedPassword = await bcrypt.hash(adminUser.password, 10);
          await User.create(
            {
              email: adminUser.email,
              password: hashedPassword,
              name: adminUser.name,
              role: ROLES.ADMIN,
              companyId: company.id,
            },
            { transaction }
          );
        }

        return company;
      });

      // Fetch the created company with users
      const company = await Company.findByPk(result.id, {
        include: [{ model: User, as: 'users', attributes: { exclude: ['password'] } }],
      });

      return ApiResponse.created(res, company, 'Company created successfully');
    } catch (error) {
      if (error.message === 'Admin user email already exists') {
        return ApiResponse.badRequest(res, error.message);
      }
      next(error);
    }
  }

  /**
   * Get company by ID
   * GET /api/companies/:id
   */
  static async getById(req, res, next) {
    try {
      const company = await Company.findByPk(req.params.id, {
        include: [{ model: User, as: 'users', attributes: { exclude: ['password'] } }],
      });

      if (!company) {
        return ApiResponse.notFound(res, 'Company not found');
      }

      return ApiResponse.success(res, company, 'Company retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update company
   * PUT /api/companies/:id
   */
  static async update(req, res, next) {
    try {
      const company = await Company.findByPk(req.params.id);

      if (!company) {
        return ApiResponse.notFound(res, 'Company not found');
      }

      const { name, address, phone, email, status } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (address !== undefined) updates.address = address;
      if (phone !== undefined) updates.phone = phone;
      if (email !== undefined) updates.email = email;
      if (status !== undefined) updates.status = status;

      await company.update(updates);

      return ApiResponse.success(res, company, 'Company updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete company
   * DELETE /api/companies/:id
   */
  static async delete(req, res, next) {
    try {
      const company = await Company.findByPk(req.params.id);

      if (!company) {
        return ApiResponse.notFound(res, 'Company not found');
      }

      // Check if company has any data
      const userCount = await User.count({ where: { companyId: company.id } });
      const customerCount = await Customer.count({ where: { companyId: company.id } });
      const productCount = await Product.count({ where: { companyId: company.id } });
      const saleCount = await Sale.count({ where: { companyId: company.id } });
      const purchaseCount = await Purchase.count({ where: { companyId: company.id } });

      if (userCount > 0 || customerCount > 0 || productCount > 0 || saleCount > 0 || purchaseCount > 0) {
        return ApiResponse.badRequest(
          res,
          'Cannot delete company with existing data. Please deactivate instead.'
        );
      }

      await company.destroy();

      return ApiResponse.success(res, null, 'Company deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get users for a company
   * GET /api/companies/:id/users
   */
  static async getUsers(req, res, next) {
    try {
      const company = await Company.findByPk(req.params.id);

      if (!company) {
        return ApiResponse.notFound(res, 'Company not found');
      }

      const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
      const limit = Math.min(
        parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT,
        PAGINATION.MAX_LIMIT
      );
      const offset = (page - 1) * limit;

      const { count, rows } = await User.findAndCountAll({
        where: { companyId: company.id },
        attributes: { exclude: ['password'] },
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

      return ApiResponse.paginated(res, rows, pagination, 'Company users retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get company statistics
   * GET /api/companies/:id/stats
   */
  static async getStats(req, res, next) {
    try {
      const company = await Company.findByPk(req.params.id);

      if (!company) {
        return ApiResponse.notFound(res, 'Company not found');
      }

      const [userCount, customerCount, productCount, saleCount, purchaseCount] = await Promise.all([
        User.count({ where: { companyId: company.id } }),
        Customer.count({ where: { companyId: company.id } }),
        Product.count({ where: { companyId: company.id } }),
        Sale.count({ where: { companyId: company.id } }),
        Purchase.count({ where: { companyId: company.id } }),
      ]);

      const stats = {
        users: userCount,
        customers: customerCount,
        products: productCount,
        sales: saleCount,
        purchases: purchaseCount,
      };

      return ApiResponse.success(res, stats, 'Company statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CompaniesController;
