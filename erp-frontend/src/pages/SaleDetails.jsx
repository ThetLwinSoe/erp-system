import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Form } from 'react-bootstrap';
import { FaArrowLeft } from 'react-icons/fa';
import { salesAPI } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import { ORDER_STATUS } from '../utils/constants';

const SaleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchSale = async () => {
    try {
      setLoading(true);
      const response = await salesAPI.getById(id);
      setSale(response.data.data);
    } catch (err) {
      setError('Failed to load sale details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSale();
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdating(true);
      await salesAPI.updateStatus(id, newStatus);
      fetchSale();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const getNextStatuses = () => {
    const transitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };
    return transitions[sale?.status] || [];
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!sale) {
    return <Alert variant="danger">Sale not found</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/sales')}>
        <FaArrowLeft className="me-2" />
        Back to Sales
      </Button>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Row className="g-4">
        <Col md={8}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Order: {sale.orderNumber}</h5>
              <StatusBadge status={sale.status} />
            </Card.Header>
            <Card.Body>
              <Table striped hover>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td><code>{item.product?.sku}</code></td>
                      <td>{item.quantity}</td>
                      <td>${parseFloat(item.unitPrice).toFixed(2)}</td>
                      <td>${parseFloat(item.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" className="text-end">Subtotal:</td>
                    <td>${parseFloat(sale.subtotal).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan="4" className="text-end">Tax:</td>
                    <td>${parseFloat(sale.tax).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan="4" className="text-end"><strong>Total:</strong></td>
                    <td><strong>${parseFloat(sale.total).toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              </Table>

              {sale.notes && (
                <Alert variant="light">
                  <strong>Notes:</strong> {sale.notes}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>Customer Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>{sale.customer?.name}</strong></p>
              <p className="mb-1 text-muted">{sale.customer?.email}</p>
              <p className="mb-1 text-muted">{sale.customer?.phone}</p>
              <p className="mb-0 text-muted">{sale.customer?.city}, {sale.customer?.country}</p>
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Order Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>Created:</strong> {new Date(sale.createdAt).toLocaleString()}</p>
              <p className="mb-1"><strong>Created By:</strong> {sale.user?.name}</p>
              <p className="mb-0"><strong>Last Updated:</strong> {new Date(sale.updatedAt).toLocaleString()}</p>
            </Card.Body>
          </Card>

          {getNextStatuses().length > 0 && (
            <Card>
              <Card.Header>Update Status</Card.Header>
              <Card.Body>
                <div className="d-grid gap-2">
                  {getNextStatuses().map((status) => (
                    <Button
                      key={status}
                      variant={status === 'cancelled' ? 'outline-danger' : 'outline-primary'}
                      onClick={() => handleStatusChange(status)}
                      disabled={updating}
                      className="text-capitalize"
                    >
                      {updating ? 'Updating...' : `Mark as ${status}`}
                    </Button>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default SaleDetails;
