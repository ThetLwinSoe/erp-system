import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Alert, Badge, Tab, Tabs } from 'react-bootstrap';
import { FaEdit, FaExclamationTriangle } from 'react-icons/fa';
import { inventoryAPI } from '../services/api';
import Pagination from '../components/common/Pagination';
import { ADJUSTMENT_TYPES } from '../utils/constants';

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [formData, setFormData] = useState({
    type: 'add',
    quantity: '',
    reason: '',
  });

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const [inventoryRes, lowStockRes] = await Promise.all([
        inventoryAPI.getAll({ page, limit: 10 }),
        inventoryAPI.getLowStock(),
      ]);
      setInventory(inventoryRes.data.data || []);
      setPagination(inventoryRes.data.pagination || { total: 0, totalPages: 1 });
      setLowStock(lowStockRes.data.data || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [page]);

  const handleOpenModal = (item) => {
    setSelectedItem(item);
    setFormData({ type: 'add', quantity: '', reason: '' });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await inventoryAPI.adjust({
        productId: selectedItem.productId,
        type: formData.type,
        quantity: parseInt(formData.quantity),
        reason: formData.reason,
      });
      setShowModal(false);
      fetchInventory();
    } catch (err) {
      setError(err.response?.data?.message || 'Adjustment failed');
    }
  };

  const getStockBadge = (item) => {
    const { quantity, minStockLevel } = item;
    if (quantity <= 0) return <Badge bg="danger">{quantity}</Badge>;
    if (quantity <= minStockLevel) return <Badge bg="warning">{quantity}</Badge>;
    return <Badge bg="success">{quantity}</Badge>;
  };

  const renderTable = (data) => (
    <Table striped hover responsive>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Product Name</th>
          <th>Category</th>
          <th>Stock</th>
          <th>Min Level</th>
          <th>Location</th>
          <th>Last Restocked</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.id}>
            <td><code>{item.product?.sku}</code></td>
            <td>{item.product?.name}</td>
            <td>{item.product?.category || '-'}</td>
            <td>{getStockBadge(item)}</td>
            <td>{item.minStockLevel}</td>
            <td>{item.location || '-'}</td>
            <td>{item.lastRestocked ? new Date(item.lastRestocked).toLocaleDateString() : '-'}</td>
            <td>
              <Button variant="outline-primary" size="sm" onClick={() => handleOpenModal(item)}>
                <FaEdit className="me-1" /> Adjust
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <div>
      <h2 className="mb-4">Inventory Management</h2>

      <Card>
        <Card.Header>
          <Tabs activeKey={activeTab} onSelect={setActiveTab}>
            <Tab eventKey="all" title="All Inventory" />
            <Tab
              eventKey="low"
              title={
                <span>
                  <FaExclamationTriangle className="me-1 text-warning" />
                  Low Stock ({lowStock.length})
                </span>
              }
            />
          </Tabs>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <>
              {activeTab === 'all' && renderTable(inventory)}
              {activeTab === 'low' && (
                lowStock.length > 0 ? renderTable(lowStock) : (
                  <Alert variant="success">No low stock items. All inventory levels are healthy.</Alert>
                )
              )}
            </>
          )}
        </Card.Body>
        {activeTab === 'all' && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <span className="text-muted">Total: {pagination.total} items</span>
            <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </Card.Footer>
        )}
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Adjust Inventory</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}

            <Alert variant="info">
              <strong>{selectedItem?.product?.name}</strong><br />
              Current Stock: {selectedItem?.quantity}
            </Alert>

            <Form.Group className="mb-3">
              <Form.Label>Adjustment Type</Form.Label>
              <Form.Select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                <option value={ADJUSTMENT_TYPES.ADD}>Add Stock</option>
                <option value={ADJUSTMENT_TYPES.REMOVE}>Remove Stock</option>
                <option value={ADJUSTMENT_TYPES.SET}>Set Stock Level</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Quantity</Form.Label>
              <Form.Control
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Reason (optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="e.g., Damaged goods, Restock, Inventory count adjustment"
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Apply Adjustment</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default Inventory;
