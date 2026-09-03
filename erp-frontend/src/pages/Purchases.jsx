import { useState, useEffect, useRef } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { FaPlus, FaEye, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { purchasesAPI, customersAPI, productsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SearchBar from '../components/common/SearchBar';
import useDebounce from '../hooks/useDebounce';
import Pagination from '../components/common/Pagination';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import { PURCHASE_STATUS } from '../utils/constants';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import SortableHeader from '../components/common/SortableHeader';

const Purchases = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [error, setError] = useState(null);

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    supplierId: '',
    items: [{ productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }],
    tax: 0,
    discountPercent: 0,
    expectedDelivery: '',
    notes: '',
  });

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 20, sortBy, sortOrder };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await purchasesAPI.getAll(params);
      setPurchases(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (error) {
      console.error('Error fetching purchases:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormData = async () => {
    try {
      const [suppliersRes, productsRes] = await Promise.all([
        customersAPI.getAll({ limit: 100, type: 'supplier' }),
        productsAPI.getAll({ limit: 100 }),
      ]);
      setSuppliers(suppliersRes.data.data || []);
      setProducts(productsRes.data.data || []);
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, [page, debouncedSearch, statusFilter, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const handleOpenModal = () => {
    fetchFormData();
    setFormData({
      supplierId: '',
      items: [{ productId: '', quantity: 1, focQuantity: 0, unitPrice: '', discountPercent: 0 }],
      tax: 0,
      discountPercent: 0,
      expectedDelivery: '',
      notes: '',
    });
    setError(null);
    setShowModal(true);
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', quantity: 1, focQuantity: 0, unitPrice: '', discountPercent: 0 }],
    });
  };

  const handleRemoveItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData({ ...formData, items: newItems });
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;

    if (field === 'productId') {
      const product = products.find((p) => p.id === parseInt(value));
      if (product) {
        newItems[index].unitPrice = product.costPrice;
      }
    }

    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const hasEmptyItem = formData.items.some(
      (item) => (parseInt(item.quantity) || 0) + (parseInt(item.focQuantity) || 0) < 1
    );
    if (hasEmptyItem) {
      setError('Each item must have a quantity or FOC quantity of at least 1');
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const data = {
        supplierId: parseInt(formData.supplierId),
        items: formData.items.map((item) => ({
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity) || 0,
          focQuantity: parseInt(item.focQuantity) || 0,
          unitPrice: parseFloat(item.unitPrice),
          discountPercent: parseFloat(item.discountPercent) || 0,
        })),
        tax: parseFloat(formData.tax) || 0,
        discountPercent: parseFloat(formData.discountPercent) || 0,
        expectedDelivery: formData.expectedDelivery || null,
        notes: formData.notes,
      };

      await purchasesAPI.create(data);
      setShowModal(false);
      fetchPurchases();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create purchase order'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await purchasesAPI.delete(selectedPurchase.id);
      setShowDeleteModal(false);
      fetchPurchases();
    } catch (err) {
      setError(extractApiError(err, 'Delete failed'));
    }
  };

  const calculateItemTotal = (item) => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const discount = parseFloat(item.discountPercent) || 0;
    const subtotal = qty * price;
    const discountAmount = subtotal * (discount / 100);
    return subtotal - discountAmount;
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  };

  const calculateOrderDiscount = () => {
    const subtotal = calculateSubtotal();
    const discountPercent = parseFloat(formData.discountPercent) || 0;
    return subtotal * (discountPercent / 100);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const orderDiscount = calculateOrderDiscount();
    const tax = parseFloat(formData.tax) || 0;
    return subtotal - orderDiscount + tax;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Purchase Orders</h2>
        <Button variant="primary" onClick={handleOpenModal}>
          <FaPlus className="me-2" />
          New Purchase
        </Button>
      </div>

      <Card>
        <Card.Header className="d-flex gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search order number..." />
          <Form.Select style={{ maxWidth: '200px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {Object.values(PURCHASE_STATUS).map((status) => (
              <option key={status} value={status} className="text-capitalize">{status}</option>
            ))}
          </Form.Select>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <Table striped hover responsive>
              <thead>
                <tr>
                  <SortableHeader label="Order #" field="orderNumber" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Supplier" field="supplier" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Total" field="total" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Expected Delivery" field="expectedDelivery" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Date" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td><code>{purchase.orderNumber}</code></td>
                    <td>{purchase.supplier?.name}</td>
                    <td><StatusBadge status={purchase.status} /></td>
                    <td><strong>{formatCurrency(purchase.total, currency)}</strong></td>
                    <td>{purchase.expectedDelivery ? new Date(purchase.expectedDelivery).toLocaleDateString() : '-'}</td>
                    <td>{new Date(purchase.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Button variant="outline-info" size="sm" className="me-2" onClick={() => navigate(`/purchases/${purchase.id}`)}>
                        <FaEye />
                      </Button>
                      {isSuperAdmin() && (purchase.status === 'pending' || purchase.status === 'cancelled') && (
                        <Button variant="outline-danger" size="sm" onClick={() => { setError(null); setSelectedPurchase(purchase); setShowDeleteModal(true); }}>
                          <FaTrash />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        <Card.Footer className="d-flex justify-content-between align-items-center">
          <span className="text-muted">Total: {pagination.total} orders</span>
          <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </Card.Footer>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Create Purchase Order</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <ErrorAlert error={error} />

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Supplier *</Form.Label>
                  <Form.Select value={formData.supplierId} onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })} required>
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Expected Delivery</Form.Label>
                  <Form.Control type="date" value={formData.expectedDelivery} onChange={(e) => setFormData({ ...formData, expectedDelivery: e.target.value })} />
                </Form.Group>
              </Col>
            </Row>

            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <Form.Label className="mb-0">Order Items *</Form.Label>
                <Button variant="outline-primary" size="sm" onClick={handleAddItem}>+ Add Item</Button>
              </div>

              {/* Item Headers */}
              <Row className="mb-2">
                <Col md={3}>
                  <small className="text-muted fw-semibold">Product</small>
                </Col>
                <Col md={2}>
                  <small className="text-muted fw-semibold">Quantity</small>
                </Col>
                <Col md={2}>
                  <small className="text-muted fw-semibold">FOC Qty</small>
                </Col>
                <Col md={2}>
                  <small className="text-muted fw-semibold">Unit Price</small>
                </Col>
                <Col md={2}>
                  <small className="text-muted fw-semibold">Disc %</small>
                </Col>
                <Col md={1}>
                  <small className="text-muted fw-semibold">Actions</small>
                </Col>
              </Row>

              {formData.items.map((item, index) => (
                <Row key={index} className="mb-2 align-items-end">
                  <Col md={3}>
                    <Form.Select value={item.productId} onChange={(e) => handleItemChange(index, 'productId', e.target.value)} required>
                      <option value="">Select Product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={2}>
                    <Form.Control type="number" min="0" placeholder="Qty" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} required />
                  </Col>
                  <Col md={2}>
                    <Form.Control type="number" min="0" placeholder="FOC Qty" value={item.focQuantity || 0} onChange={(e) => handleItemChange(index, 'focQuantity', e.target.value)} />
                  </Col>
                  <Col md={2}>
                    <Form.Control type="number" step="0.01" min="0" placeholder="Price" value={item.unitPrice} onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)} required />
                  </Col>
                  <Col md={2}>
                    <Form.Control type="number" step="0.01" min="0" max="100" placeholder="Disc %" value={item.discountPercent || 0} onChange={(e) => handleItemChange(index, 'discountPercent', e.target.value)} />
                  </Col>
                  <Col md={1}>
                    <Button variant="outline-danger" size="sm" onClick={() => handleRemoveItem(index)} disabled={formData.items.length === 1}>
                      <FaTrash />
                    </Button>
                  </Col>
                </Row>
              ))}
            </div>

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Tax</Form.Label>
                  <Form.Control type="number" step="0.01" min="0" value={formData.tax} onChange={(e) => setFormData({ ...formData, tax: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Order Discount %</Form.Label>
                  <Form.Control type="number" step="0.01" min="0" max="100" value={formData.discountPercent} onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })} />
                  <Form.Text className="text-muted">Applied after item discounts</Form.Text>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control as="textarea" rows={1} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                </Form.Group>
              </Col>
            </Row>

            <Alert variant="secondary">
              <div className="d-flex justify-content-between">
                <span>Subtotal (after item discounts):</span>
                <strong>{formatCurrency(calculateSubtotal(), currency)}</strong>
              </div>
              {formData.discountPercent > 0 && (
                <div className="d-flex justify-content-between">
                  <span>Order Discount % ({formData.discountPercent}):</span>
                  <strong className="text-danger">-{formatCurrency(calculateOrderDiscount(), currency)}</strong>
                </div>
              )}
              <div className="d-flex justify-content-between">
                <span>Tax:</span>
                <strong>{formatCurrency(parseFloat(formData.tax) || 0, currency)}</strong>
              </div>
              <hr className="my-1" />
              <div className="d-flex justify-content-between">
                <span>Total:</span>
                <strong>{formatCurrency(calculateTotal(), currency)}</strong>
              </div>
            </Alert>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Order'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Purchase"
        message={`Are you sure you want to delete order ${selectedPurchase?.orderNumber}?`}
        error={error}
      />
    </div>
  );
};

export default Purchases;
