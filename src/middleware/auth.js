const jwt = require('jsonwebtoken');
const ApiResponse = require('../utils/apiResponse');
const { User, Company } = require('../models');
const { ROLES } = require('../utils/constants');

/**
 * JWT Authentication Middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.unauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Company, as: 'company' }],
    });

    if (!user) {
      return ApiResponse.unauthorized(res, 'User not found');
    }

    // Check if company is active (for non-superadmin users)
    if (user.role !== ROLES.SUPERADMIN && user.company?.status === 'inactive') {
      return ApiResponse.forbidden(res, 'Company is inactive');
    }

    req.user = user;
    req.companyId = user.companyId;
    req.isSuperAdmin = user.role === ROLES.SUPERADMIN;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorized(res, 'Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Token expired');
    }
    return ApiResponse.error(res, 'Authentication failed');
  }
};

/**
 * Role-based Authorization Middleware
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    // Superadmin can access everything
    if (req.user.role === ROLES.SUPERADMIN) {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return ApiResponse.forbidden(res, 'Insufficient permissions');
    }

    next();
  };
};

/**
 * Require Super Admin role
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.SUPERADMIN) {
    return ApiResponse.forbidden(res, 'Super admin access required');
  }
  next();
};

module.exports = { authenticate, authorize, requireSuperAdmin };
