import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { FaPlus, FaEye, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { salesAPI, customersAPI, productsAPI } from '../services/api';
import SearchBar from '../components/common/SearchBar';
import Pagination from '../components/common/Pagination';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import { ORDER_STATUS } from '../utils/constants';

const Sales = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [error, setError] = useState('');

  // Form data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    customerId: '',
    items: [{ productId: '', quantity: 1, unitPrice: '' }],
    tax: 0,
    notes: '',
  });

  const fetchSales = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 10 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

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
      const [customersRes, productsRes] = await Promise.all([
        customersAPI.getAll({ limit: 100 }),
        productsAPI.getAll({ limit: 100 }),
      ]);
      setCustomers(customersRes.data.data || []);
      setProducts(productsRes.data.data || []);
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [page, search, statusFilter]);

  const handleOpenModal = () => {
    fetchFormData();
    setFormData({
      customerId: '',
      items: [{ productId: '', quantity: 1, unitPrice: '' }],
      tax: 0,
      notes: '',
    });
    setError('');
    setShowModal(true);
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', quantity: 1, unitPrice: '' }],
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
    setError('');

    try {
      const data = {
        customerId: parseInt(formData.customerId),
        items: formData.items.map((item) => ({
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
        })),
        tax: parseFloat(formData.tax) || 0,
        notes: formData.notes,
      };

      await salesAPI.create(data);
      setShowModal(false);
      fetchSales();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create sale');
    }
  };

  const handleDelete = async () => {
    try {
      await salesAPI.delete(selectedSale.id);
      setShowDeleteModal(false);
      fetchSales();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => {
      const qty = parseInt(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
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
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Subtotal</th>
                  <th>Tax</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td><code>{sale.orderNumber}</code></td>
                    <td>{sale.customer?.name}</td>
                    <td><StatusBadge status={sale.status} /></td>
                    <td>${parseFloat(sale.subtotal).toFixed(2)}</td>
                    <td>${parseFloat(sale.tax).toFixed(2)}</td>
                    <td><strong>${parseFloat(sale.total).toFixed(2)}</strong></td>
                    <td>{new Date(sale.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Button variant="outline-info" size="sm" className="me-2" onClick={() => navigate(`/sales/${sale.id}`)}>
                        <FaEye />
                      </Button>
                      {sale.status !== 'delivered' && (
                        <Button variant="outline-danger" size="sm" onClick={() => { setSelectedSale(sale); setShowDeleteModal(true); }}>
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
          <Modal.Title>Create Sales Order</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}

            <Form.Group className="mb-3">
              <Form.Label>Customer *</Form.Label>
              <Form.Select value={formData.customerId} onChange={(e) => setFormData({ ...formData, customerId: e.target.value })} required>
                <option value="">Select Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Form.Select>
            </Form.Group>

            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <Form.Label className="mb-0">Order Items *</Form.Label>
                <Button variant="outline-primary" size="sm" onClick={handleAddItem}>+ Add Item</Button>
              </div>

              {formData.items.map((item, index) => (
                <Row key={index} className="mb-2 align-items-end">
                  <Col md={5}>
                    <Form.Select value={item.productId} onChange={(e) => handleItemChange(index, 'productId', e.target.value)} required>
                      <option value="">Select Product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {p.inventory?.quantity || 0})
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={2}>
                    <Form.Control type="number" min="1" placeholder="Qty" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} required />
                  </Col>
                  <Col md={3}>
                    <Form.Control type="number" step="0.01" min="0" placeholder="Unit Price" value={item.unitPrice} onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)} required />
                  </Col>
                  <Col md={2}>
                    <Button variant="outline-danger" size="sm" onClick={() => handleRemoveItem(index)} disabled={formData.items.length === 1}>
                      <FaTrash />
                    </Button>
                  </Col>
                </Row>
              ))}
            </div>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Tax</Form.Label>
                  <Form.Control type="number" step="0.01" min="0" value={formData.tax} onChange={(e) => setFormData({ ...formData, tax: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control as="textarea" rows={1} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                </Form.Group>
              </Col>
            </Row>

            <Alert variant="secondary">
              <div className="d-flex justify-content-between">
                <span>Subtotal:</span>
                <strong>${calculateSubtotal().toFixed(2)}</strong>
              </div>
              <div className="d-flex justify-content-between">
                <span>Tax:</span>
                <strong>${(parseFloat(formData.tax) || 0).toFixed(2)}</strong>
              </div>
              <hr className="my-1" />
              <div className="d-flex justify-content-between">
                <span>Total:</span>
                <strong>${(calculateSubtotal() + (parseFloat(formData.tax) || 0)).toFixed(2)}</strong>
              </div>
            </Alert>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Create Order</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Sale"
        message={`Are you sure you want to delete order ${selectedSale?.orderNumber}?`}
      />
    </div>
  );
};

export default Sales;
