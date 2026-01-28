const { User } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { PAGINATION } = require('../utils/constants');
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

      const whereClause = search
        ? {
            [Op.or]: [
              { name: { [Op.iLike]: `%${search}%` } },
              { email: { [Op.iLike]: `%${search}%` } },
            ],
          }
        : {};

      const { count, rows } = await User.findAndCountAll({
        where: whereClause,
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

      return ApiResponse.paginated(res, rows, pagination, 'Users retrieved successfully');
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
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ['password'] },
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
      const user = await User.findByPk(req.params.id);

      if (!user) {
        return ApiResponse.notFound(res, 'User not found');
      }

      const { name, email, role, password } = req.body;
      const updates = {};

      if (name) updates.name = name;
      if (email) updates.email = email;
      if (role) updates.role = role;
      if (password) updates.password = password;

      await user.update(updates);

      const updatedUser = await User.findByPk(req.params.id, {
        attributes: { exclude: ['password'] },
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
      const user = await User.findByPk(req.params.id);

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
