import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Spinner, Alert, Row, Col, Modal, Form, ProgressBar, Badge } from 'react-bootstrap';
import { FaArrowLeft, FaCheck, FaPrint, FaUndo, FaMoneyBillWave } from 'react-icons/fa';
import { purchasesAPI, paymentsAPI, customersAPI, getStaticUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import { generateInvoicePDF } from '../utils/invoiceGenerator';
import { formatCurrency } from '../utils/currency';
import { extractApiError } from '../utils/errorUtils';
import ErrorAlert from '../components/common/ErrorAlert';
import CreditWarningAlert from '../components/common/CreditWarningAlert';

const emptyPaymentForm = { amount: '', paymentDate: '', method: '', reference: '', notes: '' };

const PurchaseDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, canAccessCreditControl } = useAuth();
  const currency = user?.company?.currency || 'USD';
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveItems, setReceiveItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState(emptyPaymentForm);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [creditStatus, setCreditStatus] = useState(null);

  const fetchPurchase = async () => {
    try {
      setLoading(true);
      const response = await purchasesAPI.getById(id);
      setPurchase(response.data.data);
    } catch {
      setError('Failed to load purchase details');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const response = await paymentsAPI.getAll({ purchaseId: id, limit: 100 });
      setPayments(response.data.data || []);
    } catch {
      setPayments([]);
    }
  };

  useEffect(() => {
    fetchPurchase();
    if (canAccessCreditControl()) fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Only relevant while the order is still Pending - this is the moment an
  // Admin/Manager/Staff reviews what the Sale Rep/buyer created and decides
  // whether to approve it, so that's when the credit check matters.
  useEffect(() => {
    if (!purchase || purchase.status !== 'pending' || !canAccessCreditControl()) {
      setCreditStatus(null);
      return;
    }
    customersAPI.getCreditStatus(purchase.supplierId)
      .then((res) => setCreditStatus(res.data.data))
      .catch(() => setCreditStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase?.id, purchase?.status]);

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const balanceDue = purchase ? parseFloat(purchase.total) - totalPaid : 0;

  const handleOpenPaymentModal = () => {
    setPaymentFormData({ ...emptyPaymentForm, amount: balanceDue > 0 ? balanceDue.toFixed(2) : '' });
    setPaymentError(null);
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setPaymentError(null);
    setPaymentSubmitting(true);
    try {
      await paymentsAPI.create({ purchaseId: id, ...paymentFormData, amount: parseFloat(paymentFormData.amount) });
      setShowPaymentModal(false);
      fetchPayments();
    } catch (err) {
      setPaymentError(extractApiError(err, 'Failed to record payment'));
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdating(true);
      await purchasesAPI.updateStatus(id, newStatus);
      fetchPurchase();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update status'));
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenReceiveModal = () => {
    const items = purchase.items.map((item) => {
      const totalExpected = item.quantity + (item.focQuantity || 0);
      return {
        productId: item.productId,
        productName: item.product?.name,
        ordered: totalExpected,
        received: item.receivedQuantity || 0,
        toReceive: totalExpected - (item.receivedQuantity || 0),
      };
    });
    setReceiveItems(items);
    setShowReceiveModal(true);
  };

  const handleReceiveChange = (index, value) => {
    const newItems = [...receiveItems];
    const maxReceive = newItems[index].ordered - newItems[index].received;
    newItems[index].toReceive = Math.min(Math.max(0, parseInt(value) || 0), maxReceive);
    setReceiveItems(newItems);
  };

  const handleReceiveGoods = async () => {
    try {
      setUpdating(true);
      const items = receiveItems
        .filter((item) => item.toReceive > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: item.toReceive,
        }));

      if (items.length === 0) {
        setError('Please enter quantities to receive');
        return;
      }

      await purchasesAPI.receive(id, items);
      setShowReceiveModal(false);
      fetchPurchase();
    } catch (err) {
      setError(extractApiError(err, 'Failed to receive goods'));
    } finally {
      setUpdating(false);
    }
  };

  const getNextStatuses = () => {
    const transitions = {
      pending: ['approved', 'cancelled'],
      approved: ['ordered', 'cancelled'],
      ordered: ['cancelled'],
      partial: ['cancelled'],
      received: [],
      cancelled: [],
    };
    return transitions[purchase?.status] || [];
  };

  const canReceive = () => {
    return ['ordered', 'partial'].includes(purchase?.status);
  };

  // Mirrors the server guard on purchase cancellation: an order with payments
  // recorded can't be cancelled until they're removed.
  const cancelBlockedByPayments = () => totalPaid > 0;

  const canPrint = () => {
    return ['ordered', 'partial', 'received'].includes(purchase?.status);
  };

  const canReturn = () => {
    return ['partial', 'received'].includes(purchase?.status);
  };

  const canRecordPayment = () => {
    return purchase?.status !== 'pending' && purchase?.status !== 'cancelled' && balanceDue > 0;
  };

  const recordPaymentDisabledReason = () => {
    if (purchase?.status === 'pending' || purchase?.status === 'cancelled') return 'Order must be approved before recording payments.';
    if (balanceDue <= 0) return 'This order is already fully paid.';
    return '';
  };

  const handlePrintInvoice = async () => {
    try {
      setPrinting(true);
      const company = user?.company ? {
        name: user.company.name,
        logo: user.company.logo ? getStaticUrl(user.company.logo) : null,
        address: user.company.address,
        phone: user.company.phone,
        email: user.company.email,
        currency: user.company.currency,
      } : null;

      await generateInvoicePDF({
        type: 'purchase',
        order: purchase,
        company,
      });
    } catch (err) {
      setError('Failed to generate purchase order PDF');
      console.error(err);
    } finally {
      setPrinting(false);
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
    return <Alert variant="danger">Purchase not found</Alert>;
  }

  return (
    <div>
      <Button variant="link" className="mb-3 ps-0" onClick={() => navigate('/purchases')}>
        <FaArrowLeft className="me-2" />
        Back to Purchases
      </Button>

      <ErrorAlert error={error} dismissible onClose={() => setError(null)} />

      <Row className="g-4">
        <Col md={8}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Order: {purchase.orderNumber}</h5>
              <div className="d-flex align-items-center gap-2">
                {canReturn() && (
                  <Button
                    variant="outline-warning"
                    size="sm"
                    onClick={() => navigate(`/purchases/${id}/return`)}
                  >
                    <FaUndo className="me-1" />
                    Create Return
                  </Button>
                )}
                {canPrint() && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handlePrintInvoice}
                    disabled={printing}
                  >
                    <FaPrint className="me-1" />
                    {printing ? 'Generating...' : 'Print PO'}
                  </Button>
                )}
                <StatusBadge status={purchase.status} />
              </div>
            </Card.Header>
            <Card.Body>
              <Table striped hover>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Ordered</th>
                    <th>FOC Qty</th>
                    <th>Received</th>
                    <th>Unit Price</th>
                    <th>Discount %</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items?.map((item) => {
                    const totalExpected = item.quantity + (item.focQuantity || 0);
                    return (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td><code>{item.product?.sku}</code></td>
                      <td>{item.quantity}</td>
                      <td>{item.focQuantity > 0 ? <Badge bg="info">{item.focQuantity}</Badge> : '-'}</td>
                      <td>
                        {item.receivedQuantity || 0}
                        {item.receivedQuantity < totalExpected && (
                          <ProgressBar
                            now={(item.receivedQuantity / totalExpected) * 100}
                            style={{ height: '5px', marginTop: '4px' }}
                          />
                        )}
                      </td>
                      <td>{formatCurrency(item.unitPrice, currency)}</td>
                      <td>
                        {item.discountPercent > 0
                          ? `${item.discountPercent}% (-${formatCurrency(item.discountAmount, currency)})`
                          : '-'}
                      </td>
                      <td>{formatCurrency(item.total, currency)}</td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="7" className="text-end">Subtotal (after item discounts):</td>
                    <td>{formatCurrency(purchase.subtotal, currency)}</td>
                  </tr>
                  {purchase.discountPercent > 0 && (
                    <tr>
                      <td colSpan="7" className="text-end">Order Discount % ({purchase.discountPercent}):</td>
                      <td className="text-danger">-{formatCurrency(purchase.discountAmount, currency)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan="7" className="text-end">Tax:</td>
                    <td>{formatCurrency(purchase.tax, currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan="7" className="text-end"><strong>Total:</strong></td>
                    <td><strong>{formatCurrency(purchase.total, currency)}</strong></td>
                  </tr>
                </tfoot>
              </Table>

              {purchase.notes && (
                <Alert variant="light">
                  <strong>Notes:</strong> {purchase.notes}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="mb-4">
            <Card.Header>Supplier Info</Card.Header>
            <Card.Body>
              <p className="mb-1">
                <strong>{purchase.supplier?.name}</strong>
                {purchase.supplier?.supplierCode && <span className="text-muted"> ({purchase.supplier.supplierCode})</span>}
              </p>
              <p className="mb-1 text-muted">{purchase.supplier?.email}</p>
              <p className="mb-0 text-muted">{purchase.supplier?.phone}</p>
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Order Info</Card.Header>
            <Card.Body>
              <p className="mb-1"><strong>Created:</strong> {new Date(purchase.createdAt).toLocaleString()}</p>
              <p className="mb-1"><strong>Created By:</strong> {purchase.user?.name}</p>
              {purchase.expectedDelivery && (
                <p className="mb-1"><strong>Expected Delivery:</strong> {new Date(purchase.expectedDelivery).toLocaleDateString()}</p>
              )}
              <p className="mb-0"><strong>Last Updated:</strong> {new Date(purchase.updatedAt).toLocaleString()}</p>
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header>Actions</Card.Header>
            <Card.Body>
              {purchase.status === 'pending' && (
                <CreditWarningAlert creditStatus={creditStatus} orderTotal={purchase.total} type="supplier" currency={currency} />
              )}
              <div className="d-grid gap-2">
                {canReceive() && (
                  <Button variant="success" onClick={handleOpenReceiveModal}>
                    <FaCheck className="me-2" />
                    Receive Goods
                  </Button>
                )}
                {getNextStatuses().map((status) => (
                  <Button
                    key={status}
                    variant={status === 'cancelled' ? 'outline-danger' : 'outline-primary'}
                    onClick={() => handleStatusChange(status)}
                    disabled={updating || (status === 'cancelled' && cancelBlockedByPayments())}
                    className="text-capitalize"
                  >
                    {updating ? 'Updating...' : `Mark as ${status}`}
                  </Button>
                ))}
              </div>
              {cancelBlockedByPayments() && getNextStatuses().includes('cancelled') && (
                <small className="text-muted d-block mt-2">Cancel is unavailable while payments are recorded on this order.</small>
              )}
            </Card.Body>
          </Card>

          {canAccessCreditControl() && (
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                Payments
                <span title={canRecordPayment() ? '' : recordPaymentDisabledReason()}>
                  <Button variant="outline-primary" size="sm" onClick={handleOpenPaymentModal} disabled={!canRecordPayment()}>
                    <FaMoneyBillWave className="me-1" />
                    Record Payment
                  </Button>
                </span>
              </Card.Header>
              <Card.Body>
                {payments.length === 0 ? (
                  <p className="text-muted mb-3">No payments recorded yet.</p>
                ) : (
                  <Table size="sm" className="mb-3">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                          <td>{formatCurrency(p.amount, currency)}</td>
                          <td>{p.method || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                <p className="mb-1"><strong>Paid:</strong> {formatCurrency(totalPaid, currency)}</p>
                <p className="mb-0">
                  <strong>Balance Due:</strong>{' '}
                  <span className={balanceDue > 0 ? 'text-danger' : 'text-success'}>{formatCurrency(balanceDue, currency)}</span>
                </p>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>

      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Record Payment - {purchase.orderNumber}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleRecordPayment}>
          <Modal.Body>
            <ErrorAlert error={paymentError} />
            <Form.Group className="mb-3">
              <Form.Label>Amount *</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                min="0.01"
                value={paymentFormData.amount}
                onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Payment Date</Form.Label>
              <Form.Control
                type="date"
                value={paymentFormData.paymentDate}
                onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
              />
              <Form.Text className="text-muted">Defaults to today if left blank.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Method</Form.Label>
              <Form.Control
                type="text"
                placeholder="Cash, bank transfer, mobile wallet, etc."
                value={paymentFormData.method}
                onChange={(e) => setPaymentFormData({ ...paymentFormData, method: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Reference</Form.Label>
              <Form.Control
                type="text"
                placeholder="Cheque #, transaction ID, etc."
                value={paymentFormData.reference}
                onChange={(e) => setPaymentFormData({ ...paymentFormData, reference: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={paymentFormData.notes}
                onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={paymentSubmitting}>
              {paymentSubmitting ? 'Recording...' : 'Record Payment'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showReceiveModal} onHide={() => setShowReceiveModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Receive Goods</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ErrorAlert error={error} />
          <Table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Pending</th>
                <th>Receive Qty</th>
              </tr>
            </thead>
            <tbody>
              {receiveItems.map((item, index) => (
                <tr key={item.productId}>
                  <td>{item.productName}</td>
                  <td>{item.ordered - item.received}</td>
                  <td>
                    <Form.Control
                      type="number"
                      min="0"
                      max={item.ordered - item.received}
                      value={item.toReceive}
                      onChange={(e) => handleReceiveChange(index, e.target.value)}
                      style={{ width: '80px' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowReceiveModal(false)}>Cancel</Button>
          <Button variant="success" onClick={handleReceiveGoods} disabled={updating}>
            {updating ? 'Processing...' : 'Confirm Receipt'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default PurchaseDetails;
