import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Form } from 'react-bootstrap';
import { FaArrowLeft } from 'react-icons/fa';
import { purchaseReturnsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';

const CreatePurchaseReturn = () => {
  const { purchaseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [purchase, setPurchase] = useState(null);
  const [returnableItems, setReturnableItems] = useState([]);
  const [returnItems, setReturnItems] = useState({});
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const fetchReturnableItems = async () => {
    try {
      setLoading(true);
      const response = await purchaseReturnsAPI.getReturnableItems(purchaseId);
      setPurchase(response.data.data.purchase);
      setReturnableItems(response.data.data.returnableItems);

      // Initialize return quantities to 0
      const initialReturnItems = {};
      response.data.data.returnableItems.forEach((item) => {
        initialReturnItems[item.purchaseItemId] = 0;
      });
      setReturnItems(initialReturnItems);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load purchase details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnableItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  const handleQuantityChange = (purchaseItemId, value, maxQty) => {
    const qty = Math.min(Math.max(0, parseInt(value) || 0), maxQty);
    setReturnItems({ ...returnItems, [purchaseItemId]: qty });
  };

  const calculateTotal = () => {
    let subtotal = 0;
    returnableItems.forEach((item) => {
      const returnQty = returnItems[item.purchaseItemId] || 0;
      subtotal += returnQty * parseFloat(item.unitPrice || 0);
    });
    return subtotal;
  };

  const hasItemsToReturn = () => {
    return Object.values(returnItems).some((qty) => qty > 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!hasItemsToReturn()) {
      setError('Please select at least one item to return');
      return;
    }

    try {
      setSubmitting(true);

      const items = Object.entries(returnItems)
        .filter(([, qty]) => qty > 0)
        .map(([purchaseItemId, quantity]) => ({
          purchaseItemId: parseInt(purchaseItemId),
          quantity,
        }));

      await purchaseReturnsAPI.create({
        purchaseId: parseInt(purchaseId),
        items,
        reason,
        notes,
      });

      navigate('/purchase-returns');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create purchase return');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!purchase) {
    return <Alert variant="danger">Purchase not found or not eligible for returns</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate(`/purchases/${purchaseId}`)}>
        <FaArrowLeft className="me-2" />
        Back to Purchase
      </Button>

      <h2 className="mb-4">Create Purchase Return</h2>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Form onSubmit={handleSubmit}>
        <Row className="g-4">
          <Col md={8}>
            <Card>
              <Card.Header>
                <div className="d-flex justify-content-between align-items-center">
                  <span>Original PO: <code>{purchase.orderNumber}</code></span>
                  <span className="text-muted">Supplier: {purchase.supplier?.name}</span>
                </div>
              </Card.Header>
              <Card.Body>
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Returned</th>
                      <th>Available</th>
                      <th>Return Qty</th>
                      <th>Unit Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnableItems.map((item) => (
                      <tr key={item.purchaseItemId} className={!item.canReturn ? 'table-secondary' : ''}>
                        <td>{item.product?.name}</td>
                        <td><code>{item.product?.sku}</code></td>
                        <td>{item.orderedQuantity}</td>
                        <td>{item.receivedQuantity}</td>
                        <td>{item.returnedQuantity}</td>
                        <td>
                          <strong className={item.remainingQuantity > 0 ? 'text-success' : 'text-muted'}>
                            {item.remainingQuantity}
                          </strong>
                        </td>
                        <td style={{ width: '120px' }}>
                          <Form.Control
                            type="number"
                            min="0"
                            max={item.remainingQuantity}
                            value={returnItems[item.purchaseItemId] || 0}
                            onChange={(e) => handleQuantityChange(item.purchaseItemId, e.target.value, item.remainingQuantity)}
                            disabled={!item.canReturn}
                            size="sm"
                          />
                        </td>
                        <td>{formatCurrency(item.unitPrice, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>

          <Col md={4}>
            <Card className="mb-4">
              <Card.Header>Return Details</Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Reason for Return</Form.Label>
                  <Form.Select value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Select reason...</option>
                    <option value="Defective product">Defective product</option>
                    <option value="Wrong item received">Wrong item received</option>
                    <option value="Excess quantity">Excess quantity</option>
                    <option value="Damaged during shipping">Damaged during shipping</option>
                    <option value="Quality not as expected">Quality not as expected</option>
                    <option value="Other">Other</option>
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes..."
                  />
                </Form.Group>
              </Card.Body>
            </Card>

            <Card className="mb-4">
              <Card.Header>Return Summary</Card.Header>
              <Card.Body>
                <div className="d-flex justify-content-between mb-2">
                  <span>Items to Return:</span>
                  <strong>
                    {Object.values(returnItems).filter((qty) => qty > 0).length}
                  </strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Total Quantity:</span>
                  <strong>
                    {Object.values(returnItems).reduce((sum, qty) => sum + qty, 0)}
                  </strong>
                </div>
                <hr />
                <div className="d-flex justify-content-between">
                  <span>Estimated Credit:</span>
                  <strong className="text-success">
                    {formatCurrency(calculateTotal(), currency)}
                  </strong>
                </div>
              </Card.Body>
            </Card>

            <div className="d-grid gap-2">
              <Button
                variant="primary"
                type="submit"
                disabled={submitting || !hasItemsToReturn()}
              >
                {submitting ? 'Creating...' : 'Create Return'}
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => navigate(`/purchases/${purchaseId}`)}
              >
                Cancel
              </Button>
            </div>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default CreatePurchaseReturn;
