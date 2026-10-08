import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaPlus, FaEye, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { purchasesAPI, customersAPI, productsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fetchAllPages } from '../utils/fetchAll';
import SearchBar from '../components/common/SearchBar';
import useDebounce from '../hooks/useDebounce';
import Pagination from '../components/common/Pagination';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import CreditWarningAlert from '../components/common/CreditWarningAlert';
import SearchableSelect from '../components/common/SearchableSelect';
import OrderItemsEditor from '../components/common/OrderItemsEditor';
import { PURCHASE_STATUS } from '../utils/constants';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import SortableHeader from '../components/common/SortableHeader';

const Purchases = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin, canAccessCreditControl } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
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
  // Set on every submit attempt, so the Supplier/Product fields show their red
  // outline only after the user has actually tried to submit, not while typing.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const supplierFieldRef = useRef(null);

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [creditStatus, setCreditStatus] = useState(null);
  const [formData, setFormData] = useState({
    supplierId: '',
    items: [{ id: crypto.randomUUID(), productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }],
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
      if (paymentStatusFilter) params.paymentStatus = paymentStatusFilter;

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
      const [suppliersData, productsData] = await Promise.all([
        fetchAllPages(customersAPI.getAll, { type: 'supplier' }),
        fetchAllPages(productsAPI.getAll),
      ]);
      setSuppliers(suppliersData);
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, [page, debouncedSearch, statusFilter, paymentStatusFilter, sortBy, sortOrder]);

  // Live Credit Control check as the supplier is picked in the New Purchase
  // modal - informational only (see canAccessCreditControl in AuthContext),
  // never blocks submission.
  useEffect(() => {
    if (!showModal || !canAccessCreditControl() || !formData.supplierId) {
      setCreditStatus(null);
      return;
    }
    customersAPI.getCreditStatus(formData.supplierId)
      .then((res) => setCreditStatus(res.data.data))
      .catch(() => setCreditStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, formData.supplierId]);

  const supplierOptions = useMemo(() => suppliers.map((s) => ({
    value: String(s.id),
    label: s.supplierCode ? `${s.supplierCode} - ${s.name}` : s.name,
    searchText: `${s.supplierCode || ''} ${s.name}`,
  })), [suppliers]);

  const productOptions = useMemo(() => products.map((p) => ({
    value: String(p.id),
    label: p.name,
    searchText: `${p.name} ${p.sku || ''}`,
  })), [products]);

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
      items: [{ id: crypto.randomUUID(), productId: '', quantity: 1, focQuantity: 0, unitPrice: '', discountPercent: 0 }],
      tax: 0,
      discountPercent: 0,
      expectedDelivery: '',
      notes: '',
    });
    setError(null);
    setAttemptedSubmit(false);
    setShowModal(true);
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: crypto.randomUUID(), productId: '', quantity: 1, focQuantity: 0, unitPrice: '', discountPercent: 0 }],
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
    setAttemptedSubmit(true);

    if (!formData.supplierId) {
      setError('Select a supplier');
      return;
    }
    const hasEmptyProduct = formData.items.some((item) => !item.productId);
    if (hasEmptyProduct) {
      setError('Select a product for every item');
      return;
    }
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

  // Ctrl+Enter (Cmd+Enter on Mac) submits from anywhere in the form, including the Notes textarea.
  // requestSubmit() (not calling handleSubmit(e) directly) runs the browser's native constraint
  // validation first, same as clicking the type="submit" Create Order button - so an emptied
  // required field (e.g. Unit Price) shows the same inline tooltip either way.
  const handleFormKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.requestSubmit();
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
          {canAccessCreditControl() && (
            <Form.Select style={{ maxWidth: '200px' }} value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
              <option value="">All Payment Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </Form.Select>
          )}
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
                  {canAccessCreditControl() && (
                    <SortableHeader label="Payment" field="paymentStatus" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  )}
                  <SortableHeader label="Total" field="total" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Expected Delivery" field="expectedDelivery" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Date" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  {isSuperAdmin() && (
                    <SortableHeader label="Company" field="company" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  )}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td><code>{purchase.orderNumber}</code></td>
                    <td>{purchase.supplier?.name}</td>
                    <td><StatusBadge status={purchase.status} /></td>
                    {canAccessCreditControl() && (
                      <td>{purchase.paymentStatus ? <StatusBadge status={purchase.paymentStatus} /> : '-'}</td>
                    )}
                    <td><strong>{formatCurrency(purchase.total, currency)}</strong></td>
                    <td>{purchase.expectedDelivery ? new Date(purchase.expectedDelivery).toLocaleDateString() : '-'}</td>
                    <td>{new Date(purchase.createdAt).toLocaleDateString()}</td>
                    {isSuperAdmin() && (
                      <td>
                        {purchase.company ? (
                          <Badge bg="info" style={{ whiteSpace: 'normal', maxWidth: '140px' }}>{purchase.company.name}</Badge>
                        ) : (
                          <Badge bg="secondary">No Company</Badge>
                        )}
                      </td>
                    )}
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

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" onEntered={() => supplierFieldRef.current?.focus()}>
        <Modal.Header closeButton>
          <Modal.Title>Create Purchase Order</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <Modal.Body>
            <ErrorAlert error={error} />

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Supplier *</Form.Label>
                  <SearchableSelect
                    ref={supplierFieldRef}
                    options={supplierOptions}
                    value={formData.supplierId}
                    onChange={(value) => setFormData({ ...formData, supplierId: value })}
                    placeholder="Search supplier..."
                    isInvalid={attemptedSubmit && !formData.supplierId}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Expected Delivery</Form.Label>
                  <Form.Control type="date" value={formData.expectedDelivery} onChange={(e) => setFormData({ ...formData, expectedDelivery: e.target.value })} />
                </Form.Group>
              </Col>
            </Row>

            <OrderItemsEditor
              items={formData.items}
              productOptions={productOptions}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
              onItemChange={handleItemChange}
              attemptedSubmit={attemptedSubmit}
            />

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

            <CreditWarningAlert creditStatus={creditStatus} orderTotal={calculateTotal()} type="supplier" currency={currency} />
          </Modal.Body>
          <Modal.Footer>
            <span className="text-muted small me-auto">Ctrl+Enter to save</span>
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
