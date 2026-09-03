const { Company, User, Customer, Product, Sale, Purchase, sequelize } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, ROLES, COMPANY_STATUS, SUBSCRIPTION_ALERT_DAYS } = require('../utils/constants');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const r2Client = require('../config/r2');

/**
 * Delete a stored company logo, whichever backend it lives on:
 * an R2 object (new uploads: company.logo is a full URL) or a
 * legacy local-disk file (old uploads: company.logo is a relative path).
 */
const deleteStoredLogo = async (logoValue) => {
  if (!logoValue) return;

  if (logoValue.startsWith('http')) {
    const key = logoValue.replace(`${process.env.R2_PUBLIC_URL}/`, '');
    await r2Client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }));
    return;
  }

  const diskPath = path.join(__dirname, '../../', logoValue);
  if (fs.existsSync(diskPath)) {
    fs.unlinkSync(diskPath);
  }
};

/**
 * Delete a file multer-s3 just uploaded (used to clean up after a failed request).
 */
const deleteUploadedFile = async (file) => {
  if (!file) return;
  try {
    await r2Client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: file.key,
    }));
  } catch (cleanupError) {
    console.error('Failed to clean up uploaded logo after error:', cleanupError);
  }
};

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

      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder || 'DESC';

      const { count, rows } = await Company.findAndCountAll({
        where: whereClause,
        order: [[sortBy, sortOrder]],
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
   * Get companies whose subscription is within the alert window (or already
   * past it), for the superadmin expiry-warning banner. Alert-only - does not
   * affect access for any company.
   * GET /api/companies/subscription-alerts
   */
  static async getSubscriptionAlerts(req, res, next) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const threshold = new Date(today);
      threshold.setDate(threshold.getDate() + SUBSCRIPTION_ALERT_DAYS);

      const formatDateOnly = (date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      const companies = await Company.findAll({
        where: {
          subscriptionEndDate: { [Op.ne]: null, [Op.lte]: formatDateOnly(threshold) },
        },
        attributes: ['id', 'name', 'subscriptionEndDate'],
        order: [['subscriptionEndDate', 'ASC']],
      });

      const results = companies.map((company) => {
        const [y, m, d] = company.subscriptionEndDate.split('-').map(Number);
        const endDate = new Date(y, m - 1, d);
        const daysRemaining = Math.round((endDate - today) / (1000 * 60 * 60 * 24));
        return {
          id: company.id,
          name: company.name,
          subscriptionEndDate: company.subscriptionEndDate,
          daysRemaining,
        };
      });

      return ApiResponse.success(
        res,
        { count: results.length, companies: results },
        'Subscription alerts retrieved successfully'
      );
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
      const { name, address, phone, email, currency, subscriptionEndDate, adminUser } = req.body;

      const result = await sequelize.transaction(async (transaction) => {
        const company = await Company.create(
          {
            name,
            address: address || null,
            phone: phone || null,
            email: email || null,
            status: COMPANY_STATUS.ACTIVE,
            currency: currency || 'USD',
            subscriptionEndDate: subscriptionEndDate || null,
          },
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

          await User.create(
            {
              email: adminUser.email,
              password: adminUser.password,
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

      const { name, address, phone, email, status, currency, subscriptionEndDate } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (address !== undefined) updates.address = address || null;
      if (phone !== undefined) updates.phone = phone || null;
      if (email !== undefined) updates.email = email || null;
      if (status !== undefined) updates.status = status;
      if (currency !== undefined) updates.currency = currency;
      if (subscriptionEndDate !== undefined) updates.subscriptionEndDate = subscriptionEndDate || null;

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

      const currentUser = await User.findByPk(req.user.id);
      const isPasswordValid = await currentUser.comparePassword(req.body.password);
      if (!isPasswordValid) {
        return ApiResponse.unauthorized(res, 'Incorrect password');
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

  /**
   * Upload company logo
   * POST /api/companies/:id/logo
   */
  static async uploadLogo(req, res, next) {
    try {
      const company = await Company.findByPk(req.params.id);

      if (!company) {
        // Delete uploaded file if company not found
        await deleteUploadedFile(req.file);
        return ApiResponse.notFound(res, 'Company not found');
      }

      if (!req.file) {
        return ApiResponse.badRequest(res, 'No logo file provided');
      }

      // Delete old logo if exists
      if (company.logo) {
        await deleteStoredLogo(company.logo);
      }

      // Update company with new logo URL
      const logoPath = `${process.env.R2_PUBLIC_URL}/${req.file.key}`;
      await company.update({ logo: logoPath });

      return ApiResponse.success(res, { logo: logoPath }, 'Logo uploaded successfully');
    } catch (error) {
      // Clean up uploaded file on error
      await deleteUploadedFile(req.file);
      next(error);
    }
  }

  /**
   * Delete company logo
   * DELETE /api/companies/:id/logo
   */
  static async deleteLogo(req, res, next) {
    try {
      const company = await Company.findByPk(req.params.id);

      if (!company) {
        return ApiResponse.notFound(res, 'Company not found');
      }

      if (!company.logo) {
        return ApiResponse.badRequest(res, 'Company has no logo');
      }

      // Delete logo file
      await deleteStoredLogo(company.logo);

      // Update company to remove logo
      await company.update({ logo: null });

      return ApiResponse.success(res, null, 'Logo deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CompaniesController;
