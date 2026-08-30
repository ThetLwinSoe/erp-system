module.exports = {
  // User roles
  ROLES: {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    SALE_REP: 'sale_rep',
  },

  // Company statuses
  COMPANY_STATUS: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  },

  // Supported currencies
  CURRENCIES: {
    USD: 'USD',
    SGD: 'SGD',
    THB: 'THB',
    MMK: 'MMK',
  },

  // Order statuses
  ORDER_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
  },

  // Purchase order statuses
  PURCHASE_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    ORDERED: 'ordered',
    PARTIAL: 'partial',
    RECEIVED: 'received',
    CANCELLED: 'cancelled',
  },

  // Sales return statuses
  SALES_RETURN_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },

  // Purchase return statuses
  PURCHASE_RETURN_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },

  // Inventory adjustment types
  ADJUSTMENT_TYPE: {
    ADD: 'add',
    REMOVE: 'remove',
    SET: 'set',
  },

  // Inventory adjustment statuses
  INVENTORY_ADJUSTMENT_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },

  // Inventory adjustment reasons
  INVENTORY_ADJUSTMENT_REASONS: {
    PHYSICAL_COUNT: 'Physical Count',
    DAMAGE: 'Damage',
    THEFT: 'Theft',
    EXPIRY: 'Expiry',
    CORRECTION: 'Correction',
    OTHER: 'Other',
  },

  // Customer types
  CUSTOMER_TYPE: {
    CUSTOMER: 'customer',
    SUPPLIER: 'supplier',
    BOTH: 'both',
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
};
