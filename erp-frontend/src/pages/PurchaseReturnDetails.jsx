import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Badge } from 'react-bootstrap';
import { FaArrowLeft } from 'react-icons/fa';
import { purchaseReturnsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const PurchaseReturnDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [purchaseReturn, setPurchaseReturn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchPurchaseReturn = async () => {
    try {
      setLoading(true);
      const response = await purchaseReturnsAPI.getById(id);
      setPurchaseReturn(response.data.data);
    } catch (err) {
      setError('Failed to load purchase return details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchaseReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdating(true);
      await purchaseReturnsAPI.updateStatus(id, newStatus);
      fetchPurchaseReturn();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update status'));
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
    return transitions[purchaseReturn?.status] || [];
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!purchaseReturn) {
    return <Alert variant="danger">Purchase return not found</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/purchase-returns')}>
        <FaArrowLeft className="me-2" />
        Back to Purchase Returns
      </Button>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Row className="g-4">
        <Col md={8}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Return: {purchaseReturn.returnNumber}</h5>
              <StatusBadge status={purchaseReturn.status} />
            </Card.Header>
            <Card.Body>
              <div className="mb-3">
                <strong>Original PO:</strong>{' '}
                <Button
                  variant="link"
                  className="p-0"
                  onClick={() => navigate(`/purchases/${purchaseReturn.purchase?.id}`)}
                >
                  {purchaseReturn.purchase?.orderNumber}
                </Button>
              </div>

              <Table striped hover>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Return Qty</th>
                    <th>Return FOC Qty</th>
                    <th>Unit Price</th>
                    <th>Discount %</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseReturn.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td><code>{item.product?.sku}</code></td>
                      <td>{item.quantity}</td>
                      <td>{item.focQuantity > 0 ? <Badge bg="info">{item.focQuantity}</Badge> : '-'}</td>
                      <td>{formatCurrency(item.unitPrice, currency)}</td>
                      <td>
                        {item.discountPercent > 0
                          ? `${item.discountPercent}% (-${formatCurrency(item.discountAmount, currency)})`
                          : '-'}
                      </td>
                      <td>{formatCurrency(item.total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="6" className="text-end">Subtotal (after item discounts):</td>
                    <td>{formatCurrency(purchaseReturn.subtotal, currency)}</td>
                  </tr>
                  {purchaseReturn.discountPercent > 0 && (
                    <tr>
                      <td colSpan="6" className="text-end">Order Discount % ({purchaseReturn.discountPercent}):</td>
                      <td className="text-danger">-{formatCurrency(purchaseReturn.discountAmount, currency)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan="6" className="text-end">Tax:</td>
                    <td>{formatCurrency(purchaseReturn.tax, currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan="6" className="text-end"><strong>Total:</strong></td>
                    <td><strong>{formatCurrency(purchaseReturn.total, currency)}</strong></td>
                  </tr>
                </tfoot>
              </Table>

              {purchaseReturn.reason && (
                <Alert variant="light">
                  <strong>Reason:</strong> {purchaseReturn.reason}
                </Alert>
              )}

              {purchaseReturn.notes && (
                <Alert variant="light">
                  <strong>Notes:</strong> {purchaseReturn.notes}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>Supplier Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>{purchaseReturn.purchase?.supplier?.name}</strong></p>
              <p className="mb-1 text-muted">{purchaseReturn.purchase?.supplier?.email}</p>
              <p className="mb-0 text-muted">{purchaseReturn.purchase?.supplier?.phone}</p>
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Return Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>Created:</strong> {new Date(purchaseReturn.createdAt).toLocaleString()}</p>
              <p className="mb-1"><strong>Created By:</strong> {purchaseReturn.user?.name}</p>
              <p className="mb-0"><strong>Last Updated:</strong> {new Date(purchaseReturn.updatedAt).toLocaleString()}</p>
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

export default PurchaseReturnDetails;
