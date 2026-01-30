const { ROLES } = require('../utils/constants');

/**
 * Middleware to add company filtering to requests
 * Superadmin can optionally filter by company using query param
 */
const companyScope = (req, res, next) => {
  if (req.user.role === ROLES.SUPERADMIN) {
    // Superadmin can optionally filter by company
    req.companyFilter = req.query.companyId
      ? { companyId: parseInt(req.query.companyId) }
      : {};
  } else {
    // Regular users always filter by their company
    req.companyFilter = { companyId: req.user.companyId };
  }
  next();
};

/**
 * Helper to get company ID for creating records
 * Superadmin must specify companyId in request body
 * Regular users use their own companyId
 */
const getCompanyIdForCreate = (req) => {
  if (req.user.role === ROLES.SUPERADMIN) {
    // Superadmin must specify companyId in request body
    return req.body.companyId ? parseInt(req.body.companyId) : null;
  }
  return req.user.companyId;
};

module.exports = { companyScope, getCompanyIdForCreate };
