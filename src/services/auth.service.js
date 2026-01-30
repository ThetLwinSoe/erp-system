const jwt = require('jsonwebtoken');
const { User, Company } = require('../models');
const { ROLES } = require('../utils/constants');

class AuthService {
  /**
   * Generate JWT token
   */
  static generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    // Only include companyId for non-superadmin users
    if (user.role !== ROLES.SUPERADMIN && user.companyId) {
      payload.companyId = user.companyId;
    }

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });
  }

  /**
   * Register a new user
   */
  static async register(userData) {
    const existingUser = await User.findOne({ where: { email: userData.email } });

    if (existingUser) {
      const error = new Error('Email already registered');
      error.statusCode = 409;
      throw error;
    }

    const user = await User.create(userData);
    const token = this.generateToken(user);

    return { user: user.toJSON(), token };
  }

  /**
   * Login user
   */
  static async login(email, password) {
    const user = await User.findOne({
      where: { email },
      include: [{ model: Company, as: 'company' }],
    });

    if (!user) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    // Check if user's company is active (for non-superadmin)
    if (user.role !== ROLES.SUPERADMIN && user.company?.status === 'inactive') {
      const error = new Error('Company is inactive');
      error.statusCode = 403;
      throw error;
    }

    const token = this.generateToken(user);

    return { user: user.toJSON(), token };
  }

  /**
   * Get user by ID
   */
  static async getUserById(id) {
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Company, as: 'company' }],
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return user;
  }
}

module.exports = AuthService;
