import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaPlus, FaEye, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { salesAPI, customersAPI, productsAPI } from '../services/api';
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
import { ORDER_STATUS } from '../utils/constants';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import SortableHeader from '../components/common/SortableHeader';

const Sales = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin, isSaleRep, canAccessCreditControl, updateUser } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [sales, setSales] = useState([]);
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
  const [selectedSale, setSelectedSale] = useState(null);
  const [error, setError] = useState(null);
  // Set on every submit attempt, so the Customer/Product fields show their red
  // outline only after the user has actually tried to submit, not while typing.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const customerFieldRef = useRef(null);

  // Form data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [creditStatus, setCreditStatus] = useState(null);
  // "Direct sale": start the order as Delivered. Loaded from the user's saved choice when the dialog opens.
  const [directSale, setDirectSale] = useState(false);
  const [formData, setFormData] = useState({
    customerId: '',
    items: [{ productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }],
    tax: 0,
    discountPercent: 0,
    notes: '',
  });

  const fetchSales = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 20, sortBy, sortOrder };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (paymentStatusFilter) params.paymentStatus = paymentStatusFilter;

      const response = await salesAPI.getAll(params);
      setSales(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1 });
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormData = async () => {
    try {
      const [customersData, productsData] = await Promise.all([
        fetchAllPages(customersAPI.getAll, { type: 'customer' }),
        fetchAllPages(productsAPI.getAll),
      ]);
      setCustomers(customersData);
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [page, debouncedSearch, statusFilter, paymentStatusFilter, sortBy, sortOrder]);

  // Live Credit Control check as the customer is picked in the New Sale
  // modal - informational only (see canAccessCreditControl in AuthContext),
  // never blocks submission.
  useEffect(() => {
    if (!showModal || !canAccessCreditControl() || !formData.customerId) {
      setCreditStatus(null);
      return;
    }
    customersAPI.getCreditStatus(formData.customerId)
      .then((res) => setCreditStatus(res.data.data))
      .catch(() => setCreditStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, formData.customerId]);

  const customerOptions = useMemo(() => customers.map((c) => ({
    value: String(c.id),
    label: c.customerCode ? `${c.customerCode} - ${c.name}` : c.name,
    searchText: `${c.customerCode || ''} ${c.name}`,
  })), [customers]);

  const productOptions = useMemo(() => products.map((p) => ({
    value: String(p.id),
    label: `${p.name} (Stock: ${p.inventory?.quantity || 0})`,
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
    // Read from the session already in hand - no fetch, so no flash of the wrong
    // value while a request is in flight. Kept current by the update after create
    // below (the only thing that changes this choice); may lag a login elsewhere.
    setDirectSale(!isSaleRep() && !!user?.directSalesEnabled);
    setFormData({
      customerId: '',
      items: [{ productId: '', quantity: 1, focQuantity: 0, unitPrice: '', discountPercent: 0 }],
      tax: 0,
      discountPercent: 0,
      notes: '',
    });
    setError(null);
    setAttemptedSubmit(false);
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

    // Auto-fill price when product is selected
    if (field === 'productId') {
      const product = products.find((p) => p.id === parseInt(value));
      if (product) {
        newItems[index].unitPrice = product.sellingPrice;
      }
    }

    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setAttemptedSubmit(true);

    if (!formData.customerId) {
      setError('Select a customer');
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
        customerId: parseInt(formData.customerId),
        items: formData.items.map((item) => ({
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity) || 0,
          focQuantity: parseInt(item.focQuantity) || 0,
          unitPrice: parseFloat(item.unitPrice),
          discountPercent: parseFloat(item.discountPercent) || 0,
        })),
        tax: parseFloat(formData.tax) || 0,
        discountPercent: parseFloat(formData.discountPercent) || 0,
        notes: formData.notes,
        directSale: !isSaleRep() && directSale,
      };

      await salesAPI.create(data);
      updateUser({ directSalesEnabled: data.directSale });
      setShowModal(false);
      fetchSales();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create sale'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Ctrl+Enter (Cmd+Enter on Mac) submits from anywhere in the form, including the Notes textarea.
  const handleFormKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDelete = async () => {
    try {
      await salesAPI.delete(selectedSale.id);
      setShowDeleteModal(false);
      fetchSales();
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
        <h2>Sales Orders</h2>
        <Button variant="primary" onClick={handleOpenModal}>
          <FaPlus className="me-2" />
          New Sale
        </Button>
      </div>

      <Card>
        <Card.Header className="d-flex gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search order number..." />
          <Form.Select style={{ maxWidth: '200px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {Object.values(ORDER_STATUS).map((status) => (
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
                  <SortableHeader label="Customer" field="customer" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  {canAccessCreditControl() && (
                    <SortableHeader label="Payment" field="paymentStatus" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  )}
                  <SortableHeader label="Subtotal" field="subtotal" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Tax" field="tax" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Total" field="total" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Created By" field="user" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Date" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  {isSuperAdmin() && (
                    <SortableHeader label="Company" field="company" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  )}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td><code>{sale.orderNumber}</code></td>
                    <td>{sale.customer?.name}</td>
                    <td><StatusBadge status={sale.status} /></td>
                    {canAccessCreditControl() && (
                      <td>{sale.paymentStatus ? <StatusBadge status={sale.paymentStatus} /> : '-'}</td>
                    )}
                    <td>{formatCurrency(sale.subtotal, currency)}</td>
                    <td>{formatCurrency(sale.tax, currency)}</td>
                    <td><strong>{formatCurrency(sale.total, currency)}</strong></td>
                    <td>{sale.user?.name || '-'}</td>
                    <td>{new Date(sale.createdAt).toLocaleDateString()}</td>
                    {isSuperAdmin() && (
                      <td>
                        {sale.company ? (
                          <Badge bg="info" style={{ whiteSpace: 'normal', maxWidth: '140px' }}>{sale.company.name}</Badge>
                        ) : (
                          <Badge bg="secondary">No Company</Badge>
                        )}
                      </td>
                    )}
                    <td>
                      <Button variant="outline-info" size="sm" className="me-2" onClick={() => navigate(`/sales/${sale.id}`)}>
                        <FaEye />
                      </Button>
                      {isSuperAdmin() && sale.status !== 'delivered' && (
                        <Button variant="outline-danger" size="sm" onClick={() => { setError(null); setSelectedSale(sale); setShowDeleteModal(true); }}>
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

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" onEntered={() => customerFieldRef.current?.focus()}>
        <Modal.Header closeButton>
          <Modal.Title>Create Sales Order</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <Modal.Body>
            <ErrorAlert error={error} />

            {!isSaleRep() && (
              <Form.Group className="mb-3 text-end">
                <div className="d-inline-block">
                  <Form.Check
                    type="switch"
                    id="directSale"
                    label="Direct sale"
                    checked={directSale}
                    onChange={(e) => setDirectSale(e.target.checked)}
                    className="mb-0"
                  />
                </div>
                <Form.Text className="text-muted d-block">
                  Saved as Delivered, skipping Pending, Confirmed and Shipped.
                </Form.Text>
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Customer *</Form.Label>
              <SearchableSelect
                ref={customerFieldRef}
                options={customerOptions}
                value={formData.customerId}
                onChange={(value) => setFormData({ ...formData, customerId: value })}
                placeholder="Search customer..."
                isInvalid={attemptedSubmit && !formData.customerId}
              />
            </Form.Group>

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

            <CreditWarningAlert creditStatus={creditStatus} orderTotal={calculateTotal()} type="customer" currency={currency} />
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
        title="Delete Sale"
        message={`Are you sure you want to delete order ${selectedSale?.orderNumber}?`}
        error={error}
      />
    </div>
  );
};

export default Sales;
