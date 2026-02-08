import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { FaArrowLeft } from 'react-icons/fa';
import { inventoryAdjustmentsAPI } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const InventoryAdjustmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [adjustment, setAdjustment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  const fetchAdjustment = async () => {
    try {
      setLoading(true);
      const response = await inventoryAdjustmentsAPI.getById(id);
      setAdjustment(response.data.data);
    } catch (err) {
      setError('Failed to load adjustment details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdjustment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdating(true);
      await inventoryAdjustmentsAPI.updateStatus(id, newStatus);
      fetchAdjustment();
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
    return transitions[adjustment?.status] || [];
  };

  const getSummary = () => {
    let totalAdding = 0;
    let totalRemoving = 0;

    adjustment?.items?.forEach((item) => {
      const diff = item.quantityAfter - item.quantityBefore;
      if (diff > 0) totalAdding += diff;
      if (diff < 0) totalRemoving += Math.abs(diff);
    });

    return { totalAdding, totalRemoving };
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!adjustment) {
    return <Alert variant="danger">Adjustment not found</Alert>;
  }

  const summary = getSummary();

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/inventory-adjustments')}>
        <FaArrowLeft className="me-2" />
        Back to Adjustments
      </Button>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Row className="g-4">
        <Col md={8}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Adjustment: {adjustment.adjustmentNumber}</h5>
              <StatusBadge status={adjustment.status} />
            </Card.Header>
            <Card.Body>
              <Table striped hover>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th className="text-center">Before</th>
                    <th className="text-center">Ground</th>
                    <th className="text-center">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustment.items?.map((item) => {
                    const diff = item.quantityAfter - item.quantityBefore;
                    return (
                      <tr key={item.id}>
                        <td><code>{item.product?.sku}</code></td>
                        <td>{item.product?.name}</td>
                        <td className="text-center">{item.quantityBefore}</td>
                        <td className="text-center">
                          <strong>{item.quantityAfter}</strong>
                        </td>
                        <td className="text-center">
                          {diff !== 0 ? (
                            <strong className={diff > 0 ? 'text-success' : 'text-danger'}>
                              {diff > 0 ? `+${diff}` : diff}
                            </strong>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>

              {adjustment.notes && (
                <Alert variant="light" className="mt-3">
                  <strong>Notes:</strong> {adjustment.notes}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>Adjustment Info</Card.Header>
            <Card.Body>
              <p className="mb-2">
                <strong>Reason:</strong> {adjustment.reason}
              </p>
              <p className="mb-2">
                <strong>Created By:</strong> {adjustment.user?.name || '-'}
              </p>
              <p className="mb-2">
                <strong>Created:</strong> {new Date(adjustment.createdAt).toLocaleString()}
              </p>
              <p className="mb-0">
                <strong>Last Updated:</strong> {new Date(adjustment.updatedAt).toLocaleString()}
              </p>
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Summary</Card.Header>
            <Card.Body>
              <div className="d-flex justify-content-between mb-2">
                <span>Total Products:</span>
                <strong>{adjustment.items?.length || 0}</strong>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Total Adding:</span>
                <strong className="text-success">+{summary.totalAdding}</strong>
              </div>
              <div className="d-flex justify-content-between">
                <span>Total Removing:</span>
                <strong className="text-danger">-{summary.totalRemoving}</strong>
              </div>
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
                      variant={
                        status === 'cancelled' ? 'outline-danger' :
                        status === 'completed' ? 'success' :
                        'outline-primary'
                      }
                      onClick={() => handleStatusChange(status)}
                      disabled={updating}
                      className="text-capitalize"
                    >
                      {updating ? 'Updating...' : (
                        status === 'completed' ? 'Complete (Apply Changes)' : `Mark as ${status}`
                      )}
                    </Button>
                  ))}
                </div>
                {adjustment.status === 'approved' && (
                  <small className="text-muted d-block mt-2">
                    Completing this adjustment will apply all inventory changes.
                  </small>
                )}
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default InventoryAdjustmentDetails;
