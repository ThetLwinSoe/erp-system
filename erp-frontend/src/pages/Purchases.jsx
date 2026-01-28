import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { FaPlus, FaEye, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { purchasesAPI, customersAPI, productsAPI } from '../services/api';
import SearchBar from '../components/common/SearchBar';
import Pagination from '../components/common/Pagination';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import { PURCHASE_STATUS } from '../utils/constants';

const Purchases = () => {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [error, setError] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    supplierId: '',
    items: [{ productId: '', quantity: 1, unitPrice: '' }],
    tax: 0,
    expectedDelivery: '',
    notes: '',
  });

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 10 };
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
        customersAPI.getAll({ limit: 100 }),
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
  }, [page, search, statusFilter]);

  const handleOpenModal = () => {
    fetchFormData();
    setFormData({
      supplierId: '',
      items: [{ productId: '', quantity: 1, unitPrice: '' }],
      tax: 0,
      expectedDelivery: '',
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
    setError('');

    try {
      const data = {
        supplierId: parseInt(formData.supplierId),
        items: formData.items.map((item) => ({
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
        })),
        tax: parseFloat(formData.tax) || 0,
        expectedDelivery: formData.expectedDelivery || null,
        notes: formData.notes,
      };

      await purchasesAPI.create(data);
      setShowModal(false);
      fetchPurchases();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create purchase order');
    }
  };

  const handleDelete = async () => {
    try {
      await purchasesAPI.delete(selectedPurchase.id);
      setShowDeleteModal(false);
      fetchPurchases();
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
                  <th>Order #</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Expected Delivery</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td><code>{purchase.orderNumber}</code></td>
                    <td>{purchase.supplier?.name}</td>
                    <td><StatusBadge status={purchase.status} /></td>
                    <td><strong>${parseFloat(purchase.total).toFixed(2)}</strong></td>
                    <td>{purchase.expectedDelivery ? new Date(purchase.expectedDelivery).toLocaleDateString() : '-'}</td>
                    <td>{new Date(purchase.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Button variant="outline-info" size="sm" className="me-2" onClick={() => navigate(`/purchases/${purchase.id}`)}>
                        <FaEye />
                      </Button>
                      {(purchase.status === 'pending' || purchase.status === 'cancelled') && (
                        <Button variant="outline-danger" size="sm" onClick={() => { setSelectedPurchase(purchase); setShowDeleteModal(true); }}>
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
            {error && <Alert variant="danger">{error}</Alert>}

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

              {formData.items.map((item, index) => (
                <Row key={index} className="mb-2 align-items-end">
                  <Col md={5}>
                    <Form.Select value={item.productId} onChange={(e) => handleItemChange(index, 'productId', e.target.value)} required>
                      <option value="">Select Product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
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
        title="Delete Purchase"
        message={`Are you sure you want to delete order ${selectedPurchase?.orderNumber}?`}
      />
    </div>
  );
};

export default Purchases;
