const { User, Company } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION, ROLES } = require('../utils/constants');
const { getCompanyIdForCreate } = require('../middleware/companyScope');
const { Op } = require('sequelize');

class UsersController {
  /**
   * Get all users
   * GET /api/users
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

      // Add company filter
      const whereClause = { ...req.companyFilter };

      // Hide superadmin users from non-superadmin queries
      if (req.user.role !== ROLES.SUPERADMIN) {
        whereClause.role = { [Op.ne]: ROLES.SUPERADMIN };
      }

      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const { count, rows } = await User.findAndCountAll({
        where: whereClause,
        attributes: { exclude: ['password'] },
        include: [{ model: Company, as: 'company' }],
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

      return ApiResponse.paginated(res, rows, pagination, 'Users retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create user
   * POST /api/users
   */
  static async create(req, res, next) {
    try {
      const { name, email, password, role } = req.body;

      // Prevent creating superadmin through API
      if (role === ROLES.SUPERADMIN) {
        return ApiResponse.forbidden(res, 'Cannot create superadmin users');
      }

      const companyId = getCompanyIdForCreate(req);

      if (!companyId) {
        return ApiResponse.badRequest(res, 'Company ID is required');
      }

      // Check if email already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return ApiResponse.badRequest(res, 'Email already registered');
      }

      const user = await User.create({
        name,
        email,
        password,
        role: role || ROLES.STAFF,
        companyId,
      });

      const createdUser = await User.findByPk(user.id, {
        attributes: { exclude: ['password'] },
        include: [{ model: Company, as: 'company' }],
      });

      return ApiResponse.created(res, createdUser, 'User created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  static async getById(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };

      // Non-superadmin cannot view superadmin users
      if (req.user.role !== ROLES.SUPERADMIN) {
        whereClause.role = { [Op.ne]: ROLES.SUPERADMIN };
      }

      const user = await User.findOne({
        where: whereClause,
        attributes: { exclude: ['password'] },
        include: [{ model: Company, as: 'company' }],
      });

      if (!user) {
        return ApiResponse.notFound(res, 'User not found');
      }

      return ApiResponse.success(res, user, 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user
   * PUT /api/users/:id
   */
  static async update(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };

      // Non-superadmin cannot update superadmin users
      if (req.user.role !== ROLES.SUPERADMIN) {
        whereClause.role = { [Op.ne]: ROLES.SUPERADMIN };
      }

      const user = await User.findOne({ where: whereClause });

      if (!user) {
        return ApiResponse.notFound(res, 'User not found');
      }

      const { name, email, role, password, companyId } = req.body;
      const updates = {};

      // Prevent changing role to superadmin
      if (role === ROLES.SUPERADMIN && req.user.role !== ROLES.SUPERADMIN) {
        return ApiResponse.forbidden(res, 'Cannot assign superadmin role');
      }

      if (name) updates.name = name;
      if (email) updates.email = email;
      if (role) updates.role = role;
      if (password) updates.password = password;

      // Only superadmin can change companyId
      if (companyId && req.user.role === ROLES.SUPERADMIN) {
        // Verify company exists
        const company = await Company.findByPk(companyId);
        if (!company) {
          return ApiResponse.notFound(res, 'Company not found');
        }
        updates.companyId = companyId;
      }

      await user.update(updates);

      const updatedUser = await User.findByPk(req.params.id, {
        attributes: { exclude: ['password'] },
        include: [{ model: Company, as: 'company' }],
      });

      return ApiResponse.success(res, updatedUser, 'User updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user
   * DELETE /api/users/:id
   */
  static async delete(req, res, next) {
    try {
      const whereClause = { id: req.params.id, ...req.companyFilter };

      // Non-superadmin cannot delete superadmin users
      if (req.user.role !== ROLES.SUPERADMIN) {
        whereClause.role = { [Op.ne]: ROLES.SUPERADMIN };
      }

      const user = await User.findOne({ where: whereClause });

      if (!user) {
        return ApiResponse.notFound(res, 'User not found');
      }

      // Prevent deleting own account
      if (user.id === req.user.id) {
        return ApiResponse.badRequest(res, 'Cannot delete your own account');
      }

      await user.destroy();

      return ApiResponse.success(res, null, 'User deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UsersController;
