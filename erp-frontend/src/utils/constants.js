export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
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
