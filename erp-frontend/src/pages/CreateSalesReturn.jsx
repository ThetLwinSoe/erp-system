import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Form } from 'react-bootstrap';
import { FaArrowLeft } from 'react-icons/fa';
import { salesReturnsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';

const CreateSalesReturn = () => {
  const { saleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sale, setSale] = useState(null);
  const [returnableItems, setReturnableItems] = useState([]);
  const [returnItems, setReturnItems] = useState({});
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const fetchReturnableItems = async () => {
    try {
      setLoading(true);
      const response = await salesReturnsAPI.getReturnableItems(saleId);
      setSale(response.data.data.sale);
      setReturnableItems(response.data.data.returnableItems);

      // Initialize return quantities to 0
      const initialReturnItems = {};
      response.data.data.returnableItems.forEach((item) => {
        initialReturnItems[item.saleItemId] = { quantity: 0, focQuantity: 0 };
      });
      setReturnItems(initialReturnItems);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load sale details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnableItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  const handleChange = (saleItemId, field, value, maxQty) => {
    const qty = Math.min(Math.max(0, parseInt(value) || 0), maxQty);
    setReturnItems({
      ...returnItems,
      [saleItemId]: { ...returnItems[saleItemId], [field]: qty },
    });
  };

  const calculateItemTotal = (item, returnQty) => {
    const price = parseFloat(item.unitPrice || 0);
    const discountPercent = parseFloat(item.discountPercent || 0);
    const itemSubtotal = returnQty * price;
    const itemDiscount = itemSubtotal * (discountPercent / 100);
    return itemSubtotal - itemDiscount;
  };

  const calculateSubtotal = () => {
    let subtotal = 0;
    returnableItems.forEach((item) => {
      const returnQty = returnItems[item.saleItemId]?.quantity || 0;
      if (returnQty > 0) {
        subtotal += calculateItemTotal(item, returnQty);
      }
    });
    return subtotal;
  };

  const calculateOrderDiscount = () => {
    const subtotal = calculateSubtotal();
    const orderDiscountPercent = parseFloat(sale?.discountPercent || 0);
    return subtotal * (orderDiscountPercent / 100);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const orderDiscount = calculateOrderDiscount();
    return subtotal - orderDiscount;
  };

  const hasItemsToReturn = () => {
    return Object.values(returnItems).some((item) => item.quantity > 0 || item.focQuantity > 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!hasItemsToReturn()) {
      setError('Please select at least one item to return');
      return;
    }

    try {
      setSubmitting(true);

      const items = Object.entries(returnItems)
        .filter(([, item]) => item.quantity > 0 || item.focQuantity > 0)
        .map(([saleItemId, item]) => ({
          saleItemId: parseInt(saleItemId),
          quantity: item.quantity,
          focQuantity: item.focQuantity,
        }));

      await salesReturnsAPI.create({
        saleId: parseInt(saleId),
        items,
        reason,
        notes,
      });

      navigate('/sales-returns');
    } catch (err) {
      setError(extractApiError(err, 'Failed to create sales return'));
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

  if (!sale) {
    return <Alert variant="danger">Sale not found or not eligible for returns</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate(`/sales/${saleId}`)}>
        <FaArrowLeft className="me-2" />
        Back to Sale
      </Button>

      <h2 className="mb-4">Create Sales Return</h2>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Form onSubmit={handleSubmit}>
        <Row className="g-4">
          <Col md={8}>
            <Card>
              <Card.Header>
                <div className="d-flex justify-content-between align-items-center">
                  <span>Original Order: <code>{sale.orderNumber}</code></span>
                  <span className="text-muted">Customer: {sale.customer?.name}</span>
                </div>
              </Card.Header>
              <Card.Body>
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Ordered</th>
                      <th>Returned</th>
                      <th>Available</th>
                      <th>Return Qty</th>
                      <th>Return FOC Qty</th>
                      <th>Unit Price</th>
                      <th>Discount %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnableItems.map((item) => (
                      <tr key={item.saleItemId} className={!item.canReturn ? 'table-secondary' : ''}>
                        <td>{item.product?.name}</td>
                        <td><code>{item.product?.sku}</code></td>
                        <td>
                          {item.orderedQuantity}
                          {item.orderedFocQuantity > 0 && (
                            <div className="text-muted small">+{item.orderedFocQuantity} FOC</div>
                          )}
                        </td>
                        <td>
                          {item.returnedQuantity}
                          {item.returnedFocQuantity > 0 && (
                            <div className="text-muted small">+{item.returnedFocQuantity} FOC</div>
                          )}
                        </td>
                        <td>
                          <strong className={item.remainingQuantity > 0 ? 'text-success' : 'text-muted'}>
                            {item.remainingQuantity}
                          </strong>
                          {item.remainingFocQuantity > 0 && (
                            <div className="text-success small">+{item.remainingFocQuantity} FOC</div>
                          )}
                        </td>
                        <td style={{ width: '110px' }}>
                          <Form.Control
                            type="number"
                            min="0"
                            max={item.remainingQuantity}
                            value={returnItems[item.saleItemId]?.quantity || 0}
                            onChange={(e) => handleChange(item.saleItemId, 'quantity', e.target.value, item.remainingQuantity)}
                            disabled={!item.canReturn}
                            size="sm"
                          />
                        </td>
                        <td style={{ width: '110px' }}>
                          <Form.Control
                            type="number"
                            min="0"
                            max={item.remainingFocQuantity}
                            value={returnItems[item.saleItemId]?.focQuantity || 0}
                            onChange={(e) => handleChange(item.saleItemId, 'focQuantity', e.target.value, item.remainingFocQuantity)}
                            disabled={!item.canReturn}
                            size="sm"
                          />
                        </td>
                        <td>{formatCurrency(item.unitPrice, currency)}</td>
                        <td>
                          {item.discountPercent > 0
                            ? `${item.discountPercent}`
                            : '-'}
                        </td>
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
                    <option value="Customer changed mind">Customer changed mind</option>
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
                    {Object.values(returnItems).filter((item) => item.quantity > 0 || item.focQuantity > 0).length}
                  </strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Total Quantity:</span>
                  <strong>
                    {Object.values(returnItems).reduce((sum, item) => sum + item.quantity + item.focQuantity, 0)}
                  </strong>
                </div>
                <hr />
                <div className="d-flex justify-content-between mb-2">
                  <span className="text-muted">Subtotal (after item discounts):</span>
                  <span>{formatCurrency(calculateSubtotal(), currency)}</span>
                </div>
                {sale?.discountPercent > 0 && (
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Order Discount % ({sale.discountPercent}):</span>
                    <span className="text-danger">-{formatCurrency(calculateOrderDiscount(), currency)}</span>
                  </div>
                )}
                <hr />
                <div className="d-flex justify-content-between">
                  <span>Estimated Refund:</span>
                  <strong className="text-success">
                    {formatCurrency(calculateTotal(), currency)}
                  </strong>
                </div>
                <small className="text-muted d-block mt-2">
                  * Tax will be calculated proportionally
                </small>
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
                onClick={() => navigate(`/sales/${saleId}`)}
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

export default CreateSalesReturn;
