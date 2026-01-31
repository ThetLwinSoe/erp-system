import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { FaArrowLeft } from 'react-icons/fa';
import { salesReturnsAPI } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';

const SalesReturnDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [salesReturn, setSalesReturn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchSalesReturn = async () => {
    try {
      setLoading(true);
      const response = await salesReturnsAPI.getById(id);
      setSalesReturn(response.data.data);
    } catch (err) {
      setError('Failed to load sales return details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdating(true);
      await salesReturnsAPI.updateStatus(id, newStatus);
      fetchSalesReturn();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const getNextStatuses = () => {
    const transitions = {
      pending: ['approved', 'cancelled'],
      approved: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    return transitions[salesReturn?.status] || [];
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!salesReturn) {
    return <Alert variant="danger">Sales return not found</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/sales-returns')}>
        <FaArrowLeft className="me-2" />
        Back to Sales Returns
      </Button>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Row className="g-4">
        <Col md={8}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Return: {salesReturn.returnNumber}</h5>
              <StatusBadge status={salesReturn.status} />
            </Card.Header>
            <Card.Body>
              <div className="mb-3">
                <strong>Original Order:</strong>{' '}
                <Button
                  variant="link"
                  className="p-0"
                  onClick={() => navigate(`/sales/${salesReturn.sale?.id}`)}
                >
                  {salesReturn.sale?.orderNumber}
                </Button>
              </div>

              <Table striped hover>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Return Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReturn.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td><code>{item.product?.sku}</code></td>
                      <td>{item.quantity}</td>
                      <td>${parseFloat(item.unitPrice || 0).toFixed(2)}</td>
                      <td>${parseFloat(item.total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" className="text-end">Subtotal:</td>
                    <td>${parseFloat(salesReturn.subtotal || 0).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan="4" className="text-end">Tax:</td>
                    <td>${parseFloat(salesReturn.tax || 0).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan="4" className="text-end"><strong>Total:</strong></td>
                    <td><strong>${parseFloat(salesReturn.total || 0).toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              </Table>

              {salesReturn.reason && (
                <Alert variant="light">
                  <strong>Reason:</strong> {salesReturn.reason}
                </Alert>
              )}

              {salesReturn.notes && (
                <Alert variant="light">
                  <strong>Notes:</strong> {salesReturn.notes}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>Customer Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>{salesReturn.sale?.customer?.name}</strong></p>
              <p className="mb-1 text-muted">{salesReturn.sale?.customer?.email}</p>
              <p className="mb-0 text-muted">{salesReturn.sale?.customer?.phone}</p>
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Return Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>Created:</strong> {new Date(salesReturn.createdAt).toLocaleString()}</p>
              <p className="mb-1"><strong>Created By:</strong> {salesReturn.user?.name}</p>
              <p className="mb-0"><strong>Last Updated:</strong> {new Date(salesReturn.updatedAt).toLocaleString()}</p>
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
                      variant={status === 'cancelled' ? 'outline-danger' : status === 'completed' ? 'success' : 'outline-primary'}
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

export default SalesReturnDetails;
