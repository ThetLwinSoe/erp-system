const { ROLES } = require('../utils/constants');
const ApiResponse = require('../utils/apiResponse');

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

/**
 * Resolves whether the current request has Credit Control access, and why
 * not when it doesn't. Two independent per-tenant knobs, both resolved
 * against the effective company (the superadmin's selected ?companyId=, or
 * the caller's own company):
 *   1. Company.creditControlEnabled - is the feature on for this tenant at
 *      all (superadmin-controlled, from the Companies page).
 *   2. User.creditControlAccess - can this specific person use it, once
 *      their company has it on (tenant-Admin-controlled, from the Users
 *      page). `admin`-role users always pass this half of the check - they're
 *      the ones granting the flag to others, so they can't be locked out of
 *      a feature they administer. `sale_rep` users never pass it, regardless
 *      of their own flag's value - the Users/CompanyDetails forms no longer
 *      offer a way to grant it to a Sale Rep, and this makes any stray
 *      existing `true` value on one inert too, rather than needing a data
 *      cleanup.
 * Superadmin bypasses only the per-user check (#2) - they're not a member of
 * the company, so a per-user flag doesn't apply to them - but still needs a
 * company selected and that company's feature flag on, same as every other
 * superadmin-facing company-scoped report in this app (see
 * reports.controller.js's Profit & Loss "Please select a company" guard).
 *
 * Used both by the hard-blocking `requireCreditControlAccess` middleware
 * (Payments routes, credit-status) and by soft, non-blocking checks (e.g.
 * whether to attach balance figures to the Customers list) - one source of
 * truth for both.
 */
const evaluateCreditControlAccess = async (req) => {
  const { Company } = require('../models');
  const isSuperAdmin = req.user.role === ROLES.SUPERADMIN;
  // Superadmin: only their explicitly selected ?companyId= counts - never
  // fall back to req.user.companyId, which is meaningless for superadmin
  // (some rows have a stray value, but superadmin manages OTHER companies,
  // not their own). Regular users: always their own company.
  const companyId = isSuperAdmin ? req.companyFilter?.companyId : req.user.companyId;

  if (!companyId) {
    return { allowed: false, companyId: null, reason: 'no_company' };
  }

  const company = await Company.findByPk(companyId);

  if (!company || !company.creditControlEnabled) {
    return { allowed: false, companyId, reason: 'not_enabled' };
  }

  if (!isSuperAdmin && req.user.role === ROLES.SALE_REP) {
    return { allowed: false, companyId, reason: 'no_user_access' };
  }

  if (!isSuperAdmin && req.user.role !== ROLES.ADMIN && !req.user.creditControlAccess) {
    return { allowed: false, companyId, reason: 'no_user_access' };
  }

  return { allowed: true, companyId, reason: null };
};

const CREDIT_CONTROL_ERROR_MESSAGES = {
  no_company: 'Please select a company to access Credit Control',
  not_enabled: 'Credit Control is not enabled for this company',
  no_user_access: "You don't have access to Credit Control",
};

const requireCreditControlAccess = async (req, res, next) => {
  try {
    const { allowed, reason } = await evaluateCreditControlAccess(req);

    if (!allowed) {
      const message = CREDIT_CONTROL_ERROR_MESSAGES[reason];
      return reason === 'no_company' ? ApiResponse.badRequest(res, message) : ApiResponse.forbidden(res, message);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Expense Tracker access - the same two-knob shape as Credit Control:
 *   1. Company.expenseTrackerEnabled - superadmin-controlled, for the tenant.
 *   2. User.expenseTrackerAccess - the tenant admin grants this per user.
 * Admins always pass the per-user half once the company is enabled. Sale reps are
 * always denied. Superadmin needs a company selected and that company's flag on.
 */
const evaluateExpenseTrackerAccess = async (req) => {
  const { Company } = require('../models');
  const isSuperAdmin = req.user.role === ROLES.SUPERADMIN;
  const companyId = isSuperAdmin ? req.companyFilter?.companyId : req.user.companyId;

  if (!companyId) {
    return { allowed: false, companyId: null, reason: 'no_company' };
  }

  const company = await Company.findByPk(companyId);

  if (!company || !company.expenseTrackerEnabled) {
    return { allowed: false, companyId, reason: 'not_enabled' };
  }

  if (!isSuperAdmin && req.user.role === ROLES.SALE_REP) {
    return { allowed: false, companyId, reason: 'no_user_access' };
  }

  if (!isSuperAdmin && req.user.role !== ROLES.ADMIN && !req.user.expenseTrackerAccess) {
    return { allowed: false, companyId, reason: 'no_user_access' };
  }

  return { allowed: true, companyId, reason: null };
};

const EXPENSE_TRACKER_ERROR_MESSAGES = {
  no_company: 'Please select a company to access Expense Tracker',
  not_enabled: 'Expense Tracker is not enabled for this company',
  no_user_access: "You don't have access to Expense Tracker",
};

const requireExpenseTrackerAccess = async (req, res, next) => {
  try {
    const { allowed, reason } = await evaluateExpenseTrackerAccess(req);

    if (!allowed) {
      const message = EXPENSE_TRACKER_ERROR_MESSAGES[reason];
      return reason === 'no_company' ? ApiResponse.badRequest(res, message) : ApiResponse.forbidden(res, message);
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  companyScope,
  getCompanyIdForCreate,
  requireCreditControlAccess,
  evaluateCreditControlAccess,
  requireExpenseTrackerAccess,
  evaluateExpenseTrackerAccess,
};
