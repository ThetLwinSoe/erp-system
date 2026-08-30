import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  getProfile: () => api.get('/auth/me'),
};

// Users API
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// Customers API
export const customersAPI = {
  getAll: (params) => api.get('/customers', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  toggleStatus: (id) => api.patch(`/customers/${id}/status`),
  delete: (id) => api.delete(`/customers/${id}`),
  exportCSV: (params) => api.get('/customers/export', { params, responseType: 'blob' }),
  importCSV: (file, type) => {
    const formData = new FormData();
    formData.append('file', file);
    if (type) formData.append('type', type);
    return api.post('/customers/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Products API
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  toggleStatus: (id) => api.patch(`/products/${id}/status`),
  delete: (id) => api.delete(`/products/${id}`),
  exportCSV: (params) => api.get('/products/export', { params, responseType: 'blob' }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/products/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Inventory API
export const inventoryAPI = {
  getAll: (params) => api.get('/inventory', { params }),
  getLowStock: () => api.get('/inventory/low-stock'),
  getByProductId: (productId) => api.get(`/inventory/${productId}`),
  update: (productId, data) => api.put(`/inventory/${productId}`, data),
  adjust: (data) => api.post('/inventory/adjust', data),
  exportCSV: () => api.get('/inventory/export', { responseType: 'blob' }),
};

// Sales API
export const salesAPI = {
  getAll: (params) => api.get('/sales', { params }),
  getById: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
  update: (id, data) => api.put(`/sales/${id}`, data),
  updateStatus: (id, status) => api.patch(`/sales/${id}/status`, { status }),
  delete: (id) => api.delete(`/sales/${id}`),
};

// Sales Returns API
export const salesReturnsAPI = {
  getAll: (params) => api.get('/sales-returns', { params }),
  getById: (id) => api.get(`/sales-returns/${id}`),
  getReturnableItems: (saleId) => api.get(`/sales-returns/sale/${saleId}/returnable-items`),
  create: (data) => api.post('/sales-returns', data),
  updateStatus: (id, status) => api.patch(`/sales-returns/${id}/status`, { status }),
  delete: (id) => api.delete(`/sales-returns/${id}`),
};

// Purchases API
export const purchasesAPI = {
  getAll: (params) => api.get('/purchases', { params }),
  getById: (id) => api.get(`/purchases/${id}`),
  create: (data) => api.post('/purchases', data),
  update: (id, data) => api.put(`/purchases/${id}`, data),
  updateStatus: (id, status) => api.patch(`/purchases/${id}/status`, { status }),
  receive: (id, items) => api.patch(`/purchases/${id}/receive`, { items }),
  delete: (id) => api.delete(`/purchases/${id}`),
};

// Purchase Returns API
export const purchaseReturnsAPI = {
  getAll: (params) => api.get('/purchase-returns', { params }),
  getById: (id) => api.get(`/purchase-returns/${id}`),
  getReturnableItems: (purchaseId) => api.get(`/purchase-returns/purchase/${purchaseId}/returnable-items`),
  create: (data) => api.post('/purchase-returns', data),
  updateStatus: (id, status) => api.patch(`/purchase-returns/${id}/status`, { status }),
  delete: (id) => api.delete(`/purchase-returns/${id}`),
};

// Inventory Adjustments API
export const inventoryAdjustmentsAPI = {
  getAll: (params) => api.get('/inventory-adjustments', { params }),
  getById: (id) => api.get(`/inventory-adjustments/${id}`),
  getProductsWithStock: () => api.get('/inventory-adjustments/products'),
  create: (data) => api.post('/inventory-adjustments', data),
  updateStatus: (id, status) => api.patch(`/inventory-adjustments/${id}/status`, { status }),
  delete: (id) => api.delete(`/inventory-adjustments/${id}`),
};

// Reports API
export const reportsAPI = {
  getSalesReport: (params) => api.get('/reports/sales', { params }),
  exportSalesCSV: (params) => api.get('/reports/sales/export', { params, responseType: 'text' }),
  getPurchasesReport: (params) => api.get('/reports/purchases', { params }),
  exportPurchasesCSV: (params) => api.get('/reports/purchases/export', { params, responseType: 'text' }),
};

// Companies API (Super Admin only)
export const companiesAPI = {
  getAll: (params) => api.get('/companies', { params }),
  getById: (id) => api.get(`/companies/${id}`),
  create: (data) => api.post('/companies', data),
  update: (id, data) => api.put(`/companies/${id}`, data),
  delete: (id) => api.delete(`/companies/${id}`),
  getUsers: (id) => api.get(`/companies/${id}/users`),
  getStats: (id) => api.get(`/companies/${id}/stats`),
  uploadLogo: (id, formData) => api.post(`/companies/${id}/logo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteLogo: (id) => api.delete(`/companies/${id}/logo`),
};

// Get base URL for static files
export const getStaticUrl = (path) => {
  if (!path) return null;
  const baseUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
  return `${baseUrl}${path}`;
};

export default api;
