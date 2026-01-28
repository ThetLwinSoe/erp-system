module.exports = {
  // User roles
  ROLES: {
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
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

  // Inventory adjustment types
  ADJUSTMENT_TYPE: {
    ADD: 'add',
    REMOVE: 'remove',
    SET: 'set',
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
};
