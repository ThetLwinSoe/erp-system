export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
  SALE_REP: 'sale_rep',
};

export const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  sale_rep: 'Sale Rep',
};

export const COMPANY_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

export const COMPANY_STATUS_COLORS = {
  active: 'success',
  inactive: 'danger',
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export const PURCHASE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  ORDERED: 'ordered',
  PARTIAL: 'partial',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
};

export const SALES_RETURN_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const PURCHASE_RETURN_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const STATUS_COLORS = {
  pending: 'warning',
  confirmed: 'info',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'danger',
  approved: 'info',
  ordered: 'primary',
  partial: 'warning',
  received: 'success',
  completed: 'success',
};

export const ADJUSTMENT_TYPES = {
  ADD: 'add',
  REMOVE: 'remove',
  SET: 'set',
};

export const ADJUSTMENT_TYPE_LABELS = {
  add: 'Add',
  remove: 'Remove',
  set: 'Set',
};

export const INVENTORY_ADJUSTMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const INVENTORY_ADJUSTMENT_REASONS = [
  'Physical Count',
  'Damage',
  'Theft',
  'Expiry',
  'Correction',
  'Other',
];

export const CUSTOMER_TYPES = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  BOTH: 'both',
};

export const CUSTOMER_TYPE_LABELS = {
  customer: 'Customer',
  supplier: 'Supplier',
  both: 'Both',
};

export const CURRENCIES = {
  USD: 'USD',
  SGD: 'SGD',
  THB: 'THB',
  MMK: 'MMK',
};

export const CURRENCY_SYMBOLS = {
  USD: '$',
  SGD: 'S$',
  THB: '฿',
  MMK: 'MMK',
};

export const CURRENCY_LABELS = {
  USD: 'US Dollar (USD)',
  SGD: 'Singapore Dollar (SGD)',
  THB: 'Thai Baht (THB)',
  MMK: 'Myanmar Kyat (MMK)',
};
